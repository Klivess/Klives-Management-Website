import type { InjectionKey } from 'vue';
import { RequestBatchFromKliveAPI } from '~/scripts/APIInterface';
import { omxErrorText, omxNeeds, type OmxView } from '~/scripts/omniscienceConsole';

/**
 * The Omniscience console's shared state: where the reader is (kept in the URL), what the engine
 * says about itself, and the actions every view can take.
 *
 * Reads come in two tiers, each one /batch, so an open console costs two requests a minute at most
 * instead of the eight separate reads every 90 seconds the old page made:
 *   every 60 s   bootstrap, deduction, schedule, radar, suggestions, notifications
 *   every 5 min  identity links, entity merges, watchlists, sources; plus the briefing preview
 * Nothing is read while the tab is hidden, and one catch-up read happens when it is shown again.
 * Slow or heavy reads (the directory, a dossier, data health) belong to the view that shows them.
 */

const FAST_MS = 60_000;
const SLOW_MS = 300_000;
const FAST_PATHS = [
    '/omniscience/workspace/bootstrap', '/omniscience/deduction/status', '/omniscience/schedule/status',
    '/omniscience/radar/alerts', '/omniscience/targets/suggestions', '/omniscience/notifications',
];
const SLOW_PATHS = ['/omniscience/identity-links', '/omniscience/review/queue', '/omniscience/watchlists', '/omniscience/sources'];
const RECENT_KEY = 'omx:recent-people';
const VIEW_IDS: OmxView[] = ['brief', 'people', 'person', 'ask', 'review', 'talk', 'engine'];

export interface OmxToast { id: number; tone: 'ok' | 'bad' | 'info'; text: string }
export interface OmxConfirm { title: string; text: string; yes: string; danger?: boolean; resolve: (answer: boolean) => void }
export interface OmxRecentPerson { id: string; name: string; at: number }

function createOmniscienceConsole() {
    const api = useOmniscienceApi();
    const route = useRoute();
    const router = useRouter();

    // ── where the reader is ──────────────────────────────────────────────────
    const view = computed<OmxView>(() => {
        const asked = String(route.query.view ?? 'brief') as OmxView;
        return VIEW_IDS.includes(asked) ? asked : 'brief';
    });
    const personId = computed(() => String(route.query.id ?? ''));
    const query = (name: string) => computed(() => String(route.query[name] ?? ''));

    /** Counts deliberate navigations, so a view that reads its link once can be started afresh by the next one. */
    const navSeq = ref(0);
    function go(next: OmxView, extra: Record<string, string | undefined | null> = {}) {
        navSeq.value++;
        const q: Record<string, string> = next === 'brief' ? {} : { view: next };
        for (const [key, value] of Object.entries(extra)) if (value) q[key] = value;
        void router.push({ path: '/omniscience', query: q });
    }
    function openPerson(id: string, tab?: string) { if (id) go('person', { id, tab }); }
    /** Changes parts of the query without adding a history entry (filters, tabs). */
    function patchQuery(patch: Record<string, string | undefined | null>) {
        const q: Record<string, any> = { ...route.query };
        for (const [key, value] of Object.entries(patch)) { if (value) q[key] = value; else delete q[key]; }
        void router.replace({ path: '/omniscience', query: q });
    }

    // ── what the engine says ─────────────────────────────────────────────────
    const overview = ref<any>({});
    const activity = ref<any>(null);
    const pins = ref<any[]>([]);
    const queries = ref<any[]>([]);
    const history = ref<any[]>([]);
    const deduction = ref<any>(null);
    const schedule = ref<any>(null);
    const radarAlerts = ref<any[]>([]);
    const radarAliases = ref<any[]>([]);
    const suggestions = ref<any[]>([]);
    const notifications = ref<any[]>([]);
    const links = ref<any[]>([]);
    const merges = ref<any[]>([]);
    const watchlists = ref<any[]>([]);
    const sources = ref<any[] | null>(null);
    const briefing = reactive({ markdown: '', state: 'idle' as 'idle' | 'ok' | 'warming' | 'error' });
    const health = ref<any>(null);
    const healthState = reactive({ loading: false, error: '' });

    const loaded = ref(false);
    const syncing = ref(false);
    const syncError = ref('');
    const lastSync = ref<number | null>(null);
    const now = ref(Date.now());
    let lastSlow = 0;
    let timer: ReturnType<typeof setInterval> | null = null;

    const body = (map: Map<string, any>, path: string) => { const item = map.get(path); return item && item.ok ? item.body : undefined; };
    const list = (value: any, key: string): any[] => (Array.isArray(value) ? value : Array.isArray(value?.[key]) ? value[key] : []);

    async function syncFast() {
        const map = await RequestBatchFromKliveAPI(FAST_PATHS);
        if (!map.size) throw new Error('The server did not answer.');
        const boot = body(map, FAST_PATHS[0]!);
        if (boot) {
            overview.value = boot.overview ?? overview.value;
            pins.value = boot.pins ?? [];
            queries.value = boot.queries ?? [];
            history.value = boot.history ?? [];
            activity.value = boot.activity_counts ?? activity.value;
        } else if (map.get(FAST_PATHS[0]!)?.status === 403) {
            throw new Error('This profile may not read Omniscience.');
        }
        deduction.value = body(map, FAST_PATHS[1]!) ?? deduction.value;
        schedule.value = body(map, FAST_PATHS[2]!) ?? schedule.value;
        const radar = body(map, FAST_PATHS[3]!);
        if (radar) { radarAlerts.value = list(radar, 'alerts'); radarAliases.value = list(radar, 'aliases_watched'); }
        const suggested = body(map, FAST_PATHS[4]!);
        if (suggested) suggestions.value = list(suggested, 'suggestions');
        const notes = body(map, FAST_PATHS[5]!);
        if (notes) notifications.value = list(notes, 'notifications');
    }

    async function syncSlow() {
        lastSlow = Date.now();
        const map = await RequestBatchFromKliveAPI(SLOW_PATHS);
        const linked = body(map, SLOW_PATHS[0]!);
        if (linked) links.value = list(linked, 'links');
        const queue = body(map, SLOW_PATHS[1]!);
        if (queue) merges.value = list(queue, 'merge_suggestions');
        const watches = body(map, SLOW_PATHS[2]!);
        if (watches) watchlists.value = list(watches, 'watchlists');
        const src = body(map, SLOW_PATHS[3]!);
        if (src) sources.value = list(src, 'sources');
        void loadBriefing();
    }

    /** The briefing is rebuilt in the background; "still building" (503) is a state, not a failure. */
    async function loadBriefing() {
        try {
            const data = await api.get('/omniscience/briefing/preview', { retries: 1 });
            briefing.markdown = String(data?.markdown ?? '');
            briefing.state = briefing.markdown ? 'ok' : 'warming';
        } catch (cause: any) {
            briefing.state = cause?.status === 503 || cause?.status === 202 ? 'warming' : 'error';
        }
    }

    async function sync(force = false) {
        if (syncing.value) return;
        syncing.value = true;
        try {
            await syncFast();
            if (force || Date.now() - lastSlow >= SLOW_MS) await syncSlow();
            syncError.value = '';
            lastSync.value = Date.now();
            loaded.value = true;
        } catch (cause) {
            syncError.value = omxErrorText(cause, 'Omniscience could not be reached.');
        } finally {
            syncing.value = false;
        }
    }

    async function loadHealth() {
        if (healthState.loading) return;
        healthState.loading = true; healthState.error = '';
        try { health.value = await api.get('/omniscience/workspace/health', { retries: 1, timeoutMs: 70_000 }); }
        catch (cause) { healthState.error = omxErrorText(cause, 'Data health could not be read.'); }
        finally { healthState.loading = false; }
    }

    function tick() {
        now.value = Date.now();
        if (document.visibilityState === 'hidden') return;
        if (Date.now() - (lastSync.value ?? 0) >= FAST_MS - 500) void sync();
    }
    function onVisibility() { if (document.visibilityState === 'visible') tick(); }

    function start() {
        void sync(true);
        timer = setInterval(tick, 15_000);
        document.addEventListener('visibilitychange', onVisibility);
        try { recent.value = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]'); } catch { recent.value = []; }
    }
    function stop() {
        if (timer) clearInterval(timer);
        timer = null;
        document.removeEventListener('visibilitychange', onVisibility);
    }

    // ── toasts, confirmations, the peek sheet, the palette ───────────────────
    const toasts = ref<OmxToast[]>([]);
    let toastSeq = 0;
    function toast(text: string, tone: OmxToast['tone'] = 'ok') {
        const id = ++toastSeq;
        toasts.value = [...toasts.value.slice(-3), { id, tone, text }];
        setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, tone === 'bad' ? 8000 : 3800);
    }
    const dialog = ref<OmxConfirm | null>(null);
    function confirm(ask: Omit<OmxConfirm, 'resolve'>): Promise<boolean> {
        return new Promise(resolve => { dialog.value = { ...ask, resolve: answer => { dialog.value = null; resolve(answer); } }; });
    }
    const peekId = ref('');
    const paletteOpen = ref(false);
    const recent = ref<OmxRecentPerson[]>([]);
    function noteViewed(id: string, name: string) {
        if (!id || !name) return;
        recent.value = [{ id, name, at: Date.now() }, ...recent.value.filter(r => r.id !== id)].slice(0, 8);
        try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(recent.value)); } catch { /* private mode: not remembered */ }
    }

    // ── actions ──────────────────────────────────────────────────────────────
    const busy = ref('');
    /** Runs one write: names it while it runs, says what happened, and explains a refusal. */
    async function act<T>(name: string, work: () => Promise<T>, done?: string | ((result: T) => string)): Promise<T | null> {
        if (busy.value) return null;
        busy.value = name;
        try {
            const result = await work();
            const text = typeof done === 'function' ? done(result) : done;
            if (text) toast(text, 'ok');
            return result;
        } catch (cause) {
            toast(omxErrorText(cause, 'That did not work.'), 'bad');
            return null;
        } finally { busy.value = ''; }
    }

    async function togglePin(person: { person_id: string; display_name?: string; pinned?: boolean }) {
        const pinned = !(person.pinned ?? pins.value.some(p => p.person_id === person.person_id));
        const data = await act('pin', () => api.post('/omniscience/workspace/pins/set', { personId: person.person_id, pinned }), pinned ? 'Pinned to your working set' : 'Unpinned');
        if (!data) return null;
        pins.value = data.pins ?? pins.value;
        return pinned;
    }
    const isPinned = (id: string) => pins.value.some(p => p.person_id === id);
    async function setTier(id: string, tier: string) {
        return !!await act('tier', () => api.post('/omniscience/persons/tier-set', { personId: id, tier }), `Tier set to ${tier}`);
    }
    async function setProfileTarget(id: string, enabled: boolean) {
        return !!await act('profile-target', () => api.post(`/omniscience/persons/profile-targets/set?personId=${encodeURIComponent(id)}&enabled=${enabled}`, {}),
            enabled ? 'They will be profiled on the next run' : 'No longer profiled');
    }
    async function mergePeople(keepId: string, dropId: string) {
        const ok = !!await act('merge', () => api.post('/omniscience/persons/merge', { keep_person_id: keepId, merge_person_id: dropId }), 'Merged into one person');
        if (ok) recent.value = recent.value.filter(r => r.id !== dropId);
        return ok;
    }
    async function trackSuggestion(id: string) {
        if (await setTier(id, 'tracked')) suggestions.value = suggestions.value.filter(s => s.person_id !== id);
    }
    async function dismissSuggestion(id: string) {
        if (await act('dismiss', () => api.post('/omniscience/targets/dismiss', { personId: id }))) suggestions.value = suggestions.value.filter(s => s.person_id !== id);
    }
    async function resolveLink(suggestionId: string | number, action: 'accept' | 'reject') {
        if (await act('link', () => api.post('/omniscience/identity-links/resolve', { suggestionId, action }), action === 'accept' ? 'Linked as one person' : 'Kept apart'))
            links.value = links.value.filter(l => l.suggestion_id !== suggestionId);
    }
    async function resolveMerge(suggestionId: string | number, action: 'accept' | 'reject') {
        if (await act('entity-merge', () => api.post('/omniscience/review/resolve', { suggestionId, action }), action === 'accept' ? 'Merged' : 'Kept apart'))
            merges.value = merges.value.filter(m => m.suggestion_id !== suggestionId);
    }
    async function addWatch(watch: { label: string; terms: string; notify: boolean }) {
        const ok = !!await act('watch-add', () => api.post('/omniscience/watchlists/add', watch), 'Watch added');
        if (ok) await refreshSlow();
        return ok;
    }
    async function removeWatch(watchId: string | number) {
        if (await act('watch-remove', () => api.post('/omniscience/watchlists/remove', { watchId }), 'Watch removed')) watchlists.value = watchlists.value.filter(w => w.watch_id !== watchId);
    }
    async function run(kind: 'deduction' | 'profiler' | 'briefing') {
        const path = kind === 'deduction' ? '/omniscience/deduction/run' : kind === 'profiler' ? '/omniscience/schedule/run-now' : '/omniscience/briefing/run';
        const said = kind === 'deduction' ? 'Deduction pass queued' : kind === 'profiler' ? 'Profiler run queued' : 'Briefing sent to your DMs';
        if (await act(kind, () => api.post(path, {}), said)) setTimeout(() => { void sync(); }, 1500);
    }
    async function addSource(source: { label: string; token: string }) {
        const ok = !!await act('source-add', () => api.post('/omniscience/sources/add', { platform: 'discord', ...source }), 'Source added');
        if (ok) await refreshSlow();
        return ok;
    }
    async function backfillSource(source: any) {
        await act('source-backfill', () => api.post('/omniscience/sources/backfill?sourceId=' + encodeURIComponent(source.source_id), {}), 'Backfill queued');
    }
    async function removeSource(source: any) {
        const sure = await confirm({ title: 'Remove this source?', text: `${source.self_username || source.label || source.platform} stops being collected. Messages already stored are kept.`, yes: 'Remove', danger: true });
        if (!sure) return;
        if (await act('source-remove', () => api.post('/omniscience/sources/remove?sourceId=' + encodeURIComponent(source.source_id), {}), 'Source removed')) await refreshSlow();
    }
    async function dismissNotification(item: any) {
        try { await api.post('/omniscience/notifications/dismiss', { notifId: item.notif_id }); notifications.value = notifications.value.filter(n => n.notif_id !== item.notif_id); }
        catch (cause) { toast(omxErrorText(cause), 'bad'); }
    }
    async function refreshSlow() { try { await syncSlow(); } catch { /* the next tick reads again */ } }

    // ── what follows from the data ───────────────────────────────────────────
    const reviewCount = computed(() => suggestions.value.length + links.value.length + merges.value.length);
    const needs = computed(() => omxNeeds({
        suggestions: suggestions.value, links: links.value, merges: merges.value, notifications: notifications.value,
        sources: sources.value, activity: activity.value, deduction: deduction.value, schedule: schedule.value,
        healthWarnings: Array.isArray(health.value?.warnings) ? health.value.warnings : [], briefing: briefing.state,
    }));
    /** One word for the whole engine, for the dot in the top bar. */
    const pulse = computed<'ok' | 'warn' | 'crit' | 'busy'>(() => {
        if (syncError.value) return 'crit';
        if (needs.value.some(n => n.tone === 'crit')) return 'crit';
        if (needs.value.some(n => n.tone === 'warn')) return 'warn';
        if (schedule.value?.running) return 'busy';
        return 'ok';
    });

    return {
        api, view, personId, query, navSeq, go, openPerson, patchQuery,
        overview, activity, pins, queries, history, deduction, schedule, radarAlerts, radarAliases, suggestions, notifications,
        links, merges, watchlists, sources, briefing, health, healthState,
        loaded, syncing, syncError, lastSync, now, sync, loadHealth, loadBriefing, refreshSlow, start, stop,
        toasts, toast, dialog, confirm, peekId, paletteOpen, recent, noteViewed,
        busy, act, togglePin, isPinned, setTier, setProfileTarget, mergePeople, trackSuggestion, dismissSuggestion, resolveLink, resolveMerge,
        addWatch, removeWatch, run, addSource, backfillSource, removeSource, dismissNotification,
        reviewCount, needs, pulse,
    };
}

export type OmniscienceConsole = ReturnType<typeof createOmniscienceConsole>;
const OMX_CONSOLE: InjectionKey<OmniscienceConsole> = Symbol('omniscience-console');

/** Creates the console's state for the page and hands it to every component below it. */
export function useOmniscienceConsole(): OmniscienceConsole {
    const instance = createOmniscienceConsole();
    provide(OMX_CONSOLE, instance);
    onMounted(instance.start);
    onBeforeUnmount(instance.stop);
    return instance;
}

/** The console a component lives in. */
export function useOmx(): OmniscienceConsole {
    const instance = inject(OMX_CONSOLE);
    if (!instance) throw new Error('useOmx() was called outside the Omniscience console.');
    return instance;
}
