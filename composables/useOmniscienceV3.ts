import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch, type Ref, type ShallowRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { OmniApiError, isOmniAbort, omniFlights, omniGet, omniStreamUrl, onOmniFlights, toOmniError } from '~/scripts/omniscience/api';
import type { PersonNamesDto, Selection, StreamEventDto, V3StatusDto } from '~/scripts/omniscience/contracts';
import { omniAge, omniInstant, omniUtcIso, type OmniLens } from '~/scripts/omniscience/format';

/**
 * Shared state and data plumbing for the Omniscience v3 pages. Everything exported here is
 * prefixed `useOmni…` because Nuxt auto-imports composables site-wide.
 */

// ── one panel, one request ───────────────────────────────────────────────────

export interface OmniResource<T> {
    data: ShallowRef<T | null>;
    error: Ref<OmniApiError | null>;
    /** True until the first answer (data or error). */
    loading: Ref<boolean>;
    /** True while any request is in flight, including a background refresh. */
    refreshing: Ref<boolean>;
    loadedAt: Ref<number | null>;
    /** The last request failed but an earlier answer is still on screen. */
    stale: Ref<boolean>;
    refresh: () => Promise<void>;
}

/**
 * Loads one panel's data. A new request aborts the one before it, and leaving the page aborts
 * whatever is in flight, so a slow answer can never overwrite a newer one. A failed refresh
 * keeps the last good data on screen and marks it stale instead of blanking the panel.
 */
export function useOmniResource<T>(
    load: (signal: AbortSignal) => Promise<T>,
    options: { immediate?: boolean; pollMs?: number } = {},
): OmniResource<T> {
    const data = shallowRef<T | null>(null);
    const error = ref<OmniApiError | null>(null);
    const loading = ref(options.immediate !== false);
    const refreshing = ref(false);
    const loadedAt = ref<number | null>(null);
    const stale = computed(() => error.value !== null && data.value !== null);
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function refresh() {
        controller?.abort();
        const mine = new AbortController();
        controller = mine;
        refreshing.value = true;
        try {
            const value = await load(mine.signal);
            if (mine.signal.aborted) return;
            data.value = value;
            error.value = null;
            loadedAt.value = Date.now();
        } catch (caught) {
            if (mine.signal.aborted || isOmniAbort(caught)) return;
            error.value = toOmniError(caught);
        } finally {
            if (controller === mine) {
                controller = null;
                refreshing.value = false;
                loading.value = false;
            }
        }
    }

    const onVisible = () => { if (!document.hidden && options.pollMs) void refresh(); };

    onMounted(() => {
        if (options.immediate !== false) void refresh();
        if (options.pollMs) {
            timer = setInterval(() => { if (!document.hidden) void refresh(); }, options.pollMs);
            document.addEventListener('visibilitychange', onVisible);
        }
    });
    onBeforeUnmount(() => {
        controller?.abort();
        if (timer) clearInterval(timer);
        document.removeEventListener('visibilitychange', onVisible);
    });

    return { data, error, loading, refreshing, loadedAt, stale, refresh };
}

// ── keyset-paged lists ───────────────────────────────────────────────────────

/**
 * A list read page by page with the server's cursor (never an offset, so rows that arrive
 * while you read cannot shift or repeat). `reload` starts again from the newest page;
 * `loadMore` appends the next one. While only the first page is loaded the list can be
 * refreshed in the background without moving anything the reader has scrolled to.
 */
export function useOmniPaged<T, C>(
    fetchPage: (cursor: C | null, signal: AbortSignal) => Promise<{ items: T[]; nextCursor?: C | null }>,
    options: { pollMs?: number } = {},
) {
    const items = shallowRef<T[]>([]);
    const error = ref<OmniApiError | null>(null);
    const loading = ref(true);
    const loadingMore = ref(false);
    const next = shallowRef<C | null>(null);
    const pages = ref(0);
    const loadedAt = ref<number | null>(null);
    const hasMore = computed(() => next.value !== null && next.value !== undefined);
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function reload(quiet = false) {
        controller?.abort();
        const mine = new AbortController();
        controller = mine;
        if (!quiet) loading.value = true;
        try {
            const page = await fetchPage(null, mine.signal);
            if (mine.signal.aborted) return;
            items.value = page.items;
            next.value = page.nextCursor ?? null;
            pages.value = 1;
            error.value = null;
            loadedAt.value = Date.now();
        } catch (caught) {
            if (mine.signal.aborted || isOmniAbort(caught)) return;
            error.value = toOmniError(caught);
        } finally {
            if (controller === mine) { controller = null; loading.value = false; }
        }
    }

    async function loadMore() {
        if (!hasMore.value || loadingMore.value || controller) return;
        const mine = new AbortController();
        controller = mine;
        loadingMore.value = true;
        try {
            const page = await fetchPage(next.value, mine.signal);
            if (mine.signal.aborted) return;
            items.value = [...items.value, ...page.items];
            next.value = page.nextCursor ?? null;
            pages.value++;
            error.value = null;
        } catch (caught) {
            if (mine.signal.aborted || isOmniAbort(caught)) return;
            error.value = toOmniError(caught);
        } finally {
            if (controller === mine) controller = null;
            loadingMore.value = false;
        }
    }

    onMounted(() => {
        void reload();
        if (options.pollMs) {
            timer = setInterval(() => {
                if (!document.hidden && pages.value <= 1 && !controller) void reload(true);
            }, options.pollMs);
        }
    });
    onBeforeUnmount(() => {
        controller?.abort();
        if (timer) clearInterval(timer);
    });

    return { items, error, loading, loadingMore, hasMore, pages, loadedAt, reload, loadMore };
}

// ── engine status (shared by the shell and every page) ───────────────────────

export function useOmniEngine() {
    const status = useState<V3StatusDto | null>('omni-v3:status', () => null);
    const statusError = useState<{ kind: string; message: string } | null>('omni-v3:status-error', () => null);
    const statusAt = useState<number | null>('omni-v3:status-at', () => null);

    async function refreshStatus(signal?: AbortSignal) {
        try {
            status.value = await omniGet<V3StatusDto>('status', {}, signal);
            statusError.value = null;
            statusAt.value = Date.now();
        } catch (caught) {
            if (isOmniAbort(caught)) return;
            const e = toOmniError(caught);
            statusError.value = { kind: e.kind, message: e.message };
        }
    }

    const phase = computed(() => status.value?.phase ?? null);
    const ready = computed(() => status.value?.phase === 'Ready');
    /** Klives's IANA zone as the engine is configured; Europe/London until the engine says otherwise. */
    const klivesZone = computed(() => status.value?.klivesZone || 'Europe/London');

    return { status, statusError, statusAt, phase, ready, klivesZone, refreshStatus };
}

// ── requests in flight ───────────────────────────────────────────────────────

/** How long a request may take before the frame says it is waiting (quick answers never flash the bar). */
export const OMNI_BUSY_AFTER_MS = 350;
/** From here on the wait is also said in words, with its length. */
export const OMNI_SLOW_AFTER_MS = 4000;

/**
 * Whether any Omniscience request has been waiting long enough to say so, for how long, and for what.
 * The engine's own status poll is left out: it repeats every ten seconds and says nothing about the page.
 */
export function useOmniBusy() {
    const waitingMs = ref(0);
    const routes = ref<string[]>([]);
    let timer: ReturnType<typeof setInterval> | null = null;
    let stop: (() => void) | null = null;

    function measure() {
        const now = performance.now();
        const open = omniFlights().filter(f => !/\/status(\?|$)/.test(f.route));
        waitingMs.value = open.length ? now - Math.min(...open.map(f => f.startedAt)) : 0;
        routes.value = open.map(f => f.route.replace(/^\/omniscience\/v3\//, '').replace(/\?.*$/, ''));
        if (open.length && !timer) timer = setInterval(measure, 250);
        if (!open.length && timer) { clearInterval(timer); timer = null; }
    }

    onMounted(() => { stop = onOmniFlights(measure); measure(); });
    onBeforeUnmount(() => { stop?.(); if (timer) clearInterval(timer); });

    const busy = computed(() => waitingMs.value >= OMNI_BUSY_AFTER_MS);
    const slow = computed(() => waitingMs.value >= OMNI_SLOW_AFTER_MS);
    return { busy, slow, waitingMs, routes };
}

// ── time lens ────────────────────────────────────────────────────────────────

const LENS_KEY = 'omni.v3.lens';
const tickNow = ref(Date.now());
let tickUsers = 0;
let tickTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Times on screen: absolute in the chosen lens (Klives's zone or UTC), with a relative age that
 * keeps counting. The lens is one site-wide choice, remembered per browser.
 */
export function useOmniTime() {
    const { klivesZone } = useOmniEngine();
    const lens = useState<OmniLens>('omni-v3:lens', () => 'Klives');

    onMounted(() => {
        try {
            const saved = window.localStorage.getItem(LENS_KEY);
            if (saved === 'Klives' || saved === 'Utc') lens.value = saved;
        } catch { /* private mode: keep the default */ }
        tickNow.value = Date.now();
        if (tickUsers++ === 0) tickTimer = setInterval(() => { tickNow.value = Date.now(); }, 10_000);
    });
    onBeforeUnmount(() => {
        if (--tickUsers <= 0 && tickTimer) { clearInterval(tickTimer); tickTimer = null; tickUsers = 0; }
    });

    function setLens(next: OmniLens) {
        lens.value = next;
        try { window.localStorage.setItem(LENS_KEY, next); } catch { /* not persisted */ }
    }

    const zone = computed(() => (lens.value === 'Utc' ? 'UTC' : klivesZone.value));
    const at = (ms: number | null | undefined, seconds = false) => omniInstant(ms, zone.value, seconds);
    const age = (ms: number | null | undefined) => omniAge(ms, tickNow.value);
    const utc = (ms: number | null | undefined) => omniUtcIso(ms);

    return { lens, setLens, zone, now: tickNow, at, age, utc };
}

// ── live stream ──────────────────────────────────────────────────────────────

/**
 * The v3 live stream. Resumes from the last event id it saw, so a reconnect replays what was
 * missed with no gap and no duplicate; a `stream.reset` frame means events were lost and the
 * page should reload what it shows.
 */
export function useOmniStream(options: {
    topics?: readonly string[];
    onEvent: (event: StreamEventDto) => void;
    onReset?: (reason: string) => void;
}) {
    const connected = ref(false);
    const cursor = ref(0);
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let stopped = true;

    function schedule() {
        if (stopped || retry) return;
        // 1 s, 2 s, 4 s … capped at 30 s, with jitter so tabs do not reconnect in step.
        const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempts, 5)) * (0.75 + Math.random() * 0.5);
        attempts++;
        retry = setTimeout(() => { retry = null; open(); }, delay);
    }

    function open() {
        if (stopped || typeof window === 'undefined') return;
        let ws: WebSocket;
        try {
            ws = new WebSocket(omniStreamUrl(cursor.value, options.topics ?? []));
        } catch {
            schedule();
            return;
        }
        socket = ws;
        ws.onopen = () => { connected.value = true; };
        ws.onmessage = message => {
            let frame: StreamEventDto;
            try { frame = JSON.parse(typeof message.data === 'string' ? message.data : ''); } catch { return; }
            if (!frame || typeof frame.id !== 'number' || typeof frame.topic !== 'string') return;
            attempts = 0;
            if (frame.topic === 'stream.reset') {
                cursor.value = frame.id;
                options.onReset?.(String((frame.payload as any)?.reason ?? 'reset'));
                return;
            }
            if (frame.id > cursor.value) cursor.value = frame.id;
            if (frame.topic === 'stream.ping') return;
            options.onEvent(frame);
        };
        ws.onclose = () => {
            if (socket === ws) socket = null;
            connected.value = false;
            schedule();
        };
        ws.onerror = () => { try { ws.close(); } catch { /* already closed */ } };
    }

    function connect() {
        if (!stopped) return;
        stopped = false;
        open();
    }

    function disconnect() {
        stopped = true;
        if (retry) { clearTimeout(retry); retry = null; }
        const ws = socket;
        socket = null;
        try { ws?.close(); } catch { /* already closed */ }
        connected.value = false;
    }

    onMounted(connect);
    onBeforeUnmount(disconnect);
    return { connected, cursor, connect, disconnect };
}

// ── people's names ───────────────────────────────────────────────────────────

const wantedNames = new Set<string>();
let namesTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Names for person ids, for pages whose rows carry only an id (plans, review items, links, past
 * answers). Ids are asked for in one batch a moment after they are wanted, and remembered for the
 * visit. Until a name arrives, and for someone no longer known, the id itself is shown.
 */
export function useOmniNames() {
    const names = useState<Record<string, string>>('omni-v3:names', () => ({}));
    const asked = useState<Record<string, true>>('omni-v3:names-asked', () => ({}));

    async function flush() {
        namesTimer = null;
        const ids = [...wantedNames].slice(0, 200);
        for (const id of ids) wantedNames.delete(id);
        if (!ids.length) return;
        try {
            const found = await omniGet<PersonNamesDto>('people/names', { ids });
            names.value = { ...names.value, ...found.names };
        } catch {
            // Without names the ids stay on screen; they can be asked for again on the next visit.
            const next = { ...asked.value };
            for (const id of ids) delete next[id];
            asked.value = next;
        }
        if (wantedNames.size) namesTimer = setTimeout(() => { void flush(); }, 30);
    }

    /** Asks for the names of these ids (those not asked for yet). Safe to call on every render. */
    function want(ids: readonly (string | null | undefined)[]) {
        let added = false;
        const next = { ...asked.value };
        for (const id of ids) {
            if (!id || next[id]) continue;
            next[id] = true;
            wantedNames.add(id);
            added = true;
        }
        if (!added) return;
        asked.value = next;
        if (!namesTimer && typeof window !== 'undefined') namesTimer = setTimeout(() => { void flush(); }, 30);
    }

    const name = (id: string | null | undefined): string => (id ? names.value[id] ?? id : '—');

    return { names, want, name };
}

// ── handing a set to a tactic ────────────────────────────────────────────────

/**
 * A set picked up on one page (a cohort, the records behind a chart point, a run's output)
 * waiting for the tactic it will feed. Any page can set it; the Tactics page consumes it.
 */
export function useOmniCarry() {
    return useState<Selection | null>('omni-v3:carry', () => null);
}

// ── toasts ───────────────────────────────────────────────────────────────────

export interface OmniToast { id: number; tone: 'ok' | 'warn' | 'bad' | 'info'; text: string }

let toastSeq = 0;

export function useOmniToasts() {
    const toasts = useState<OmniToast[]>('omni-v3:toasts', () => []);

    function dismiss(id: number) {
        toasts.value = toasts.value.filter(t => t.id !== id);
    }

    function push(tone: OmniToast['tone'], text: string) {
        const id = ++toastSeq;
        toasts.value = [...toasts.value.slice(-4), { id, tone, text }];
        if (typeof window !== 'undefined') setTimeout(() => dismiss(id), tone === 'bad' ? 9000 : 5000);
    }

    return { toasts, push, dismiss };
}

/**
 * Runs a command (a POST) once: `busy` names what is running so its button can disable itself,
 * the outcome is announced, and a failure is explained rather than swallowed.
 */
export function useOmniAction() {
    const busy = ref<string | null>(null);
    const { push } = useOmniToasts();

    async function run<T>(name: string, action: () => Promise<T>, done?: (result: T) => string | null): Promise<T | null> {
        if (busy.value) return null;
        busy.value = name;
        try {
            const result = await action();
            const text = done ? done(result) : null;
            if (text) push('ok', text);
            return result;
        } catch (caught) {
            const e = toOmniError(caught);
            if (e.kind !== 'aborted') push('bad', e.message);
            return null;
        } finally {
            busy.value = null;
        }
    }

    return { busy, run };
}

/** Re-runs `fn` shortly after `source` stops changing (search boxes, filter edits). */
export function useOmniDebounced<T>(source: () => T, fn: () => void, delayMs = 300) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    watch(source, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { timer = null; fn(); }, delayMs);
    }, { deep: true });
    onBeforeUnmount(() => { if (timer) clearTimeout(timer); });
}

// ── state kept in the link ───────────────────────────────────────────────────

/**
 * Filter and tab state mirrored into the query string. What you are looking at is part of the
 * address, so a view can be linked, bookmarked and come back to, and a drill-down that returns
 * lands on the same filtered set it left. Several of these can live on one page: each owns only
 * the keys it was given.
 */
export function useOmniUrlState<T extends Record<string, string>>(defaults: T) {
    const route = useRoute();
    const router = useRouter();
    const state = reactive({ ...defaults }) as T;

    for (const key of Object.keys(defaults)) {
        const value = route.query[key];
        if (typeof value === 'string') (state as Record<string, string>)[key] = value;
    }

    // A navigation to the same page with a new query (the palette, a link) updates the view.
    watch(() => route.query, query => {
        for (const key of Object.keys(defaults)) {
            const value = query[key];
            const next = typeof value === 'string' ? value : defaults[key]!;
            if ((state as Record<string, string>)[key] !== next) (state as Record<string, string>)[key] = next;
        }
    });

    watch(state, () => {
        const query: Record<string, string> = { ...(route.query as Record<string, string>) };
        for (const [key, value] of Object.entries(state)) {
            if (value === defaults[key] || value === '') delete query[key];
            else query[key] = value as string;
        }
        void router.replace({ query });
    }, { deep: true });

    function reset() { Object.assign(state, defaults); }
    const activeCount = computed(() => Object.entries(state).filter(([key, value]) => value !== defaults[key] && value !== '').length);

    return { state, reset, activeCount };
}

// ── people opened recently ───────────────────────────────────────────────────

export interface OmniRecentPerson { id: string; name: string; at: number }
const RECENT_KEY = 'omni-v3:recent-people';

/** The last few people opened in this browser: the quickest way back to someone. Never sent anywhere. */
export function useOmniRecent() {
    const recent = useState<OmniRecentPerson[]>('omni-v3:recent', () => []);
    const loaded = useState('omni-v3:recent-loaded', () => false);

    onMounted(() => {
        if (loaded.value) return;
        loaded.value = true;
        try {
            const saved = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]');
            if (Array.isArray(saved)) recent.value = saved.filter(r => r && typeof r.id === 'string' && typeof r.name === 'string').slice(0, 8);
        } catch { recent.value = []; }
    });

    function note(id: string, name: string | null | undefined) {
        if (!id || !name) return;
        recent.value = [{ id, name, at: Date.now() }, ...recent.value.filter(r => r.id !== id)].slice(0, 8);
        try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(recent.value)); } catch { /* private mode: not remembered */ }
    }
    function forget(id: string) {
        recent.value = recent.value.filter(r => r.id !== id);
        try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(recent.value)); } catch { /* not remembered either way */ }
    }

    return { recent, note, forget };
}
