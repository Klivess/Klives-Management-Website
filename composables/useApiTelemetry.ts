// Data layer for the API telemetry page.
//
// Speed model (mirrors the server's): every standard view is precomputed and
// pre-compressed on the server, so a request is a lookup — and usually a 304, because
// the browser revalidates with the ETag automatically. On top of that the client keeps
// a stale-while-revalidate snapshot per URL: switching tabs or ranges paints the last
// snapshot instantly and refreshes behind it. Requests are individual parallel GETs
// (not /batch) so each one gets its own ETag/304 and pre-compressed Brotli body.

import { reactive, ref, computed, watch, onMounted, onBeforeUnmount, shallowRef } from 'vue';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';
import { TEL_TABS } from '~/scripts/apiTelemetryShared';

// ── fetching ──

interface Snapshot { data: any; at: number; }
const snapshots = new Map<string, Snapshot>();
const inflight = new Map<string, Promise<any>>();

async function fetchJson(path: string): Promise<any> {
    const existing = inflight.get(path);
    if (existing) return existing;
    const p = (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15_000);
        try {
            const res = await RequestGETFromKliveAPI(path, false, false, {}, controller.signal);
            if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => '')}`.trim());
            const data = await res.json();
            snapshots.set(path, { data, at: Date.now() });
            return data;
        } finally {
            clearTimeout(timer);
            inflight.delete(path);
        }
    })();
    inflight.set(path, p);
    return p;
}

export function cachedSnapshot(path: string): any | undefined {
    return snapshots.get(path)?.data;
}

export type TelState = {
    range: string; from: string; to: string; bucket: string; tab: string;
    route: string; method: string; batch: string; denied: string; live: string; trace: string;
};

export function useApiTelemetry() {
    const { state } = useUrlState<TelState>({
        range: '24h', from: '', to: '', bucket: 'auto', tab: 'overview',
        route: '', method: 'GET', batch: '', denied: '', live: '', trace: '',
    });

    const data = reactive<Record<string, any>>({});
    const errors = reactive<Record<string, string>>({});
    const loading = ref(false);
    const lastRefresh = ref(0);
    const live = shallowRef<any[]>([]);

    const isCustom = computed(() => !!state.from);

    /** Query string shared by every aggregate endpoint. */
    const rangeQuery = computed(() => {
        const q = new URLSearchParams();
        if (state.from) {
            q.set('from', state.from);
            if (state.to) q.set('to', state.to);
        } else {
            q.set('range', state.range);
        }
        if (state.bucket && state.bucket !== 'auto') q.set('bucket', state.bucket);
        return q;
    });

    function url(kind: string, extra: Record<string, string> = {}) {
        const q = new URLSearchParams(rangeQuery.value);
        if (kind === 'overview') {
            if (state.batch) q.set('batch', '1');
            if (state.denied) q.set('denied', '1');
        }
        if (kind === 'routes' && state.denied) q.set('denied', '1');
        for (const [k, v] of Object.entries(extra)) q.set(k, v);
        if (kind === 'weekly' || kind === 'health') return `/KliveAPI/telemetry/${kind}`;
        return `/KliveAPI/telemetry/${kind}?${q.toString()}`;
    }

    /** Endpoints a tab needs (the overview always rides along for the headline strip). */
    function manifest(tab: string): Record<string, string> {
        const m: Record<string, string> = { overview: url('overview') };
        switch (tab) {
            case 'overview': m.weekly = url('weekly'); break;
            case 'routes':
                m.routes = url('routes');
                if (state.route) m.route = url('route', { route: state.route, method: state.method || 'GET' });
                break;
            case 'stages': m.routes = url('routes'); m.runtime = url('runtime'); break;
            case 'client': m.rum = url('rum'); break;
            case 'runtime': m.runtime = url('runtime'); m.health = url('health'); break;
            case 'traces': {
                const q = new URLSearchParams();
                if (state.from) { q.set('from', state.from); if (state.to) q.set('to', state.to); }
                else q.set('range', state.range);
                if (state.route) { q.set('route', state.route); q.set('method', state.method || 'GET'); }
                m.traces = `/KliveAPI/telemetry/traces?${q.toString()}&sort=slowest&limit=150`;
                if (state.trace) m.trace = `/KliveAPI/telemetry/trace?id=${encodeURIComponent(state.trace)}`;
                break;
            }
        }
        return m;
    }

    let revision = 0;

    /** Paint cached snapshots immediately, then revalidate everything the tab needs in parallel. */
    async function refresh() {
        const rev = ++revision;
        const m = manifest(state.tab);
        for (const [key, path] of Object.entries(m)) {
            const snap = cachedSnapshot(path);
            if (snap !== undefined) data[key] = snap;
        }
        loading.value = true;
        await Promise.all(Object.entries(m).map(async ([key, path]) => {
            try {
                const result = await fetchJson(path);
                if (rev !== revision) return; // a newer range/tab superseded this one
                data[key] = result;
                delete errors[key];
            } catch (e: any) {
                if (rev !== revision) return;
                errors[key] = e?.message || 'Request failed';
            }
        }));
        if (rev === revision) {
            loading.value = false;
            lastRefresh.value = Date.now();
        }
    }

    /** Warm the other tabs' snapshots while the browser is idle. */
    function prefetch() {
        const idle = (cb: () => void) => (window as any).requestIdleCallback ? (window as any).requestIdleCallback(cb, { timeout: 4000 }) : setTimeout(cb, 1500);
        idle(() => {
            const paths = new Set<string>();
            for (const tab of TEL_TABS) {
                if (tab === state.tab || tab === 'traces') continue;
                Object.values(manifest(tab)).forEach(p => paths.add(p));
            }
            for (const p of paths) if (!snapshots.has(p)) void fetchJson(p).catch(() => { });
        });
    }

    // Poll at the speed the range can actually change.
    const pollMs = computed(() => {
        if (state.from && state.to) return 0; // a closed custom window never changes
        const r = state.from ? '1h' : state.range;
        return r === '15m' || r === '1h' ? 10_000 : r === '6h' || r === '24h' ? 30_000 : r === '7d' ? 60_000 : 300_000;
    });

    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let liveTimer: ReturnType<typeof setInterval> | null = null;
    function restartPolling() {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
        if (pollMs.value > 0) pollTimer = setInterval(() => { if (!document.hidden) void refresh(); }, pollMs.value);
    }

    async function liveTick() {
        if (document.hidden) return;
        try {
            const tick = await fetchJson('/KliveAPI/telemetry/live');
            if (tick && tick.t) live.value = [...live.value.slice(-299), tick];
        } catch { /* keep the last ticks */ }
    }
    function restartLive() {
        if (liveTimer) clearInterval(liveTimer);
        liveTimer = null;
        if (state.live) {
            void liveTick();
            liveTimer = setInterval(liveTick, 1000);
        }
    }

    watch(() => [state.range, state.from, state.to, state.bucket, state.tab, state.route, state.method, state.batch, state.denied, state.trace], () => {
        void refresh();
        restartPolling();
    });
    watch(() => state.live, restartLive);

    function onVisible() { if (!document.hidden) void refresh(); }

    onMounted(async () => {
        await refresh();
        restartPolling();
        restartLive();
        prefetch();
        document.addEventListener('visibilitychange', onVisible);
    });
    onBeforeUnmount(() => {
        if (pollTimer) clearInterval(pollTimer);
        if (liveTimer) clearInterval(liveTimer);
        document.removeEventListener('visibilitychange', onVisible);
    });

    function setPreset(preset: string) {
        state.from = '';
        state.to = '';
        state.range = preset;
    }
    /** Drag-to-zoom on any chart narrows the whole page to that window. */
    function zoomTo(from: number, to: number) {
        state.from = new Date(from).toISOString();
        state.to = new Date(to).toISOString();
    }
    function openRoute(series: string) {
        const sp = series.indexOf(' ');
        if (series.startsWith('(') || series.startsWith('*') || sp < 0) {
            state.route = series;
            state.method = '';
        } else {
            state.method = series.slice(0, sp);
            state.route = series.slice(sp + 1);
        }
        state.tab = 'routes';
    }
    function openTrace(id: string, route?: string, method?: string) {
        state.trace = id;
        if (route) { state.route = route; state.method = method || 'GET'; }
        state.tab = 'traces';
    }

    return { state, data, errors, loading, lastRefresh, live, isCustom, refresh, setPreset, zoomTo, openRoute, openTrace, pollMs };
}
