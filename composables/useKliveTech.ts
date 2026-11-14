import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { RequestBatchFromKliveAPI, type KliveBatchItem } from '~/scripts/APIInterface';
import { useCurrentProfile } from '~/composables/useCurrentProfile';
import { useKliveTechLive } from '~/scripts/kliveTechLive';
import {
    buildFleet, computeVerdict, describeFailureBody, isLive, isTerminalJob, ktGet, ktPostJson, ktPostQuery, parseBody,
    type FirmwareConfig, type FirmwareJob, type FirmwareProject, type FleetItem, type Gadget, type GadgetAction,
    type HubStatus, type StreamableEntry,
} from '~/scripts/kliveTech';

/**
 * State for the KliveTech console. One instance per page visit.
 *
 * Request tiers. Everything the page shows comes in ONE /batch every 5 s while the tab is visible:
 * the connected gadgets, the hub status (remembered gadgets it could not reach, Bluetooth discovery,
 * relay attempts, history), the Streamables catalog and the firmware jobs. The old page sent two
 * separate requests every 4 s and the jobs every 20 s. While a firmware job runs its progress is
 * read on its own every 1.5 s. Firmware configuration and projects are read once and on "Rescan".
 * The one gadget open in the sheet also gets the live WebSocket (scripts/kliveTechLive.ts).
 *
 * Every field of the status route is optional: a server from before 13 Nov 2026 has no
 * /klivetech/status and the page carries on from the gadget list alone.
 */

const FAST_MS = 5_000;
const JOB_MS = 1_500;
const STALE_AFTER_MS = 20_000;
const PREFS_KEY = 'ktx:prefs';

export type KliveTechTab = 'streams' | 'firmware' | 'activity' | 'radio';
export type KliveTechFilter = 'all' | 'online' | 'offline';
export type KliveTechLink = 'connecting' | 'live' | 'paused' | 'stale' | 'offline';

export interface KliveTechToast {
    id: number;
    tone: 'ok' | 'warn' | 'crit' | 'info';
    text: string;
    action?: { label: string; run: () => unknown };
}

export interface ActionRun {
    state: 'running' | 'ok' | 'error';
    value: string;
    message: string;
    at: number;
    ms?: number;
}

interface Prefs { live: boolean; tab: KliveTechTab; filter: KliveTechFilter }
const DEFAULT_PREFS: Prefs = { live: true, tab: 'streams', filter: 'all' };
const TAB_IDS: KliveTechTab[] = ['streams', 'firmware', 'activity', 'radio'];

const P_GADGETS = '/klivetech/GetAllGadgets';
const P_STREAMS = '/klivetech/streamables';
const P_STATUS = '/klivetech/status?events=120';
const P_JOBS = '/klivetech/firmware/jobs';
const P_CONFIG = '/klivetech/firmware/config';
const P_PROJECTS = '/klivetech/firmware/projects';

function readPrefs(): Prefs {
    try {
        const raw = window.localStorage.getItem(PREFS_KEY);
        const stored = raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
        return {
            live: stored.live !== false,
            tab: TAB_IDS.includes(stored.tab) ? stored.tab : DEFAULT_PREFS.tab,
            filter: ['all', 'online', 'offline'].includes(stored.filter) ? stored.filter : 'all',
        };
    } catch {
        return { ...DEFAULT_PREFS };
    }
}

function isMissingRoute(item: KliveBatchItem | undefined): boolean {
    if (!item || item.status !== 404) return false;
    const body = parseBody<any>(item.body) ?? item.body;
    const text = typeof body === 'string' ? body : body?.error ?? '';
    return /route not found/i.test(String(text));
}

export function useKliveTech() {
    const profile = useCurrentProfile();
    const can = (key: string) => profile.can(key);
    const allowed = computed(() => ({
        gadgets: can('klivetech.gadgets.read'),
        act: can('klivetech.gadgets.act'),
        manage: can('klivetech.gadgets.manage'),
        streams: can('klivetech.streamables.read'),
        control: can('klivetech.streamables.control'),
        firmware: can('klivetech.firmware.read'),
        deploy: can('klivetech.firmware.deploy'),
    }));

    const live = useKliveTechLive();

    const gadgets = shallowRef<Gadget[]>([]);
    const streamables = shallowRef<StreamableEntry[]>([]);
    const status = shallowRef<HubStatus | null>(null);
    const statusSupported = ref(true);
    const jobs = shallowRef<FirmwareJob[]>([]);
    const config = shallowRef<FirmwareConfig | null>(null);
    const projects = shallowRef<FirmwareProject[]>([]);
    const firmwareError = ref('');

    const loaded = ref(false);
    const error = ref('');
    const lastOkAt = ref<number | null>(null);
    const busy = ref(false);
    const hidden = ref(false);
    const now = ref(Date.now());
    const prefs = ref<Prefs>({ ...DEFAULT_PREFS });
    const selectedKey = ref<string | null>(null);

    /** Last run of each action this visit, keyed `${gadgetID}/${action}`. */
    const runs = ref<Record<string, ActionRun>>({});
    /** Operations in flight on one gadget or device (retry, enrol, forget, stream changes). */
    const pending = ref<Record<string, string>>({});
    const streamErrors = ref<Record<string, string>>({});
    const toasts = ref<KliveTechToast[]>([]);

    let fastTimer: number | null = null;
    let jobTimer: number | null = null;
    let clockTimer: number | null = null;
    let toastId = 0;
    let inFlight = false;

    /* ---------------------------------------------------------------- toasts --- */

    function notify(tone: KliveTechToast['tone'], text: string, action?: KliveTechToast['action']) {
        const id = ++toastId;
        toasts.value = [...toasts.value.slice(-3), { id, tone, text, action }];
        window.setTimeout(() => dismissToast(id), tone === 'crit' ? 9_000 : 5_000);
    }
    function dismissToast(id: number) {
        toasts.value = toasts.value.filter(t => t.id !== id);
    }

    /* --------------------------------------------------------------- loading --- */

    function batchPaths(withStatics: boolean): string[] {
        const paths: string[] = [];
        const a = allowed.value;
        if (a.gadgets) paths.push(P_GADGETS);
        if (a.gadgets && statusSupported.value) paths.push(P_STATUS);
        if (a.streams) paths.push(P_STREAMS);
        if (a.firmware) paths.push(P_JOBS);
        if (a.firmware && withStatics) paths.push(P_CONFIG, P_PROJECTS);
        return paths;
    }

    /** While a socket is open its gadget's readings are newer than anything a poll carries. */
    function mergeStreamables(incoming: StreamableEntry[]): StreamableEntry[] {
        const liveId = live.gadgetID.value;
        if (!liveId || live.status.value !== 'live') return incoming;
        return incoming.map(entry => {
            if (entry.gadgetID !== liveId) return entry;
            const current = live.liveCatalog.value.find(e => e.streamID === entry.streamID);
            return current ? { ...entry, latestValue: current.latestValue, latestSequence: current.latestSequence, latestReceivedUtc: current.latestReceivedUtc } : entry;
        });
    }

    async function refresh(withStatics = false) {
        if (inFlight) return;
        const paths = batchPaths(withStatics);
        if (!paths.length) { loaded.value = true; return; }
        inFlight = true;
        busy.value = true;
        try {
            const map = await RequestBatchFromKliveAPI(paths);
            if (!map.size) throw new Error("The server didn't answer");

            const g = map.get(P_GADGETS);
            if (g) {
                if (!g.ok) throw new Error(describeFailureBody(g.status, parseBody(g.body)));
                gadgets.value = parseBody<Gadget[]>(g.body) ?? [];
            }

            const s = map.get(P_STATUS);
            if (s) {
                if (s.ok) status.value = parseBody<HubStatus>(s.body);
                else if (isMissingRoute(s)) { statusSupported.value = false; status.value = null; }
            }

            const st = map.get(P_STREAMS);
            if (st?.ok) streamables.value = mergeStreamables(parseBody<StreamableEntry[]>(st.body) ?? []);

            const j = map.get(P_JOBS);
            if (j?.ok) jobs.value = parseBody<FirmwareJob[]>(j.body) ?? [];

            const c = map.get(P_CONFIG);
            if (c) {
                if (c.ok) { config.value = parseBody<FirmwareConfig>(c.body); firmwareError.value = ''; }
                else firmwareError.value = describeFailureBody(c.status, parseBody(c.body));
            }
            const pr = map.get(P_PROJECTS);
            if (pr?.ok) projects.value = parseBody<FirmwareProject[]>(pr.body) ?? [];

            loaded.value = true;
            error.value = '';
            lastOkAt.value = Date.now();
        } catch (reason: any) {
            error.value = reason?.message ?? 'The KliveTech hub could not be reached';
        } finally {
            inFlight = false;
            busy.value = false;
            now.value = Date.now();
        }
    }

    async function loadJobs() {
        if (!allowed.value.firmware || hidden.value) return;
        try { jobs.value = await ktGet<FirmwareJob[]>(P_JOBS); } catch { /* the batch carries on */ }
    }

    async function rescanFirmware() {
        await refresh(true);
    }

    /* ---------------------------------------------------------------- timers --- */

    function stopTimers() {
        if (fastTimer != null) window.clearInterval(fastTimer);
        fastTimer = null;
    }

    function startTimers() {
        stopTimers();
        if (hidden.value || !prefs.value.live) return;
        fastTimer = window.setInterval(() => { void refresh(); }, FAST_MS);
    }

    const activeJobs = computed(() => jobs.value.filter(job => !isTerminalJob(job.state)));
    watch(() => activeJobs.value.length > 0 && !hidden.value, running => {
        if (jobTimer != null) window.clearInterval(jobTimer);
        jobTimer = running ? window.setInterval(() => { void loadJobs(); }, JOB_MS) : null;
    });

    function onVisibility() {
        hidden.value = document.visibilityState === 'hidden';
        if (hidden.value) { stopTimers(); live.setPaused(true); return; }
        now.value = Date.now();
        if (prefs.value.live) { void refresh(); live.setPaused(false); }
        startTimers();
    }

    function setLive(on: boolean) {
        prefs.value = { ...prefs.value, live: on };
        live.setPaused(!on);
        if (on) { void refresh(); syncSocket(); }
        startTimers();
    }

    function setTab(tab: KliveTechTab) {
        if (prefs.value.tab !== tab) prefs.value = { ...prefs.value, tab };
        if (tab === 'firmware' && allowed.value.firmware && !config.value && !firmwareError.value) void rescanFirmware();
    }

    watch(prefs, value => {
        try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(value)); } catch { /* storage blocked */ }
    }, { deep: true });

    /* ----------------------------------------------------------------- fleet --- */

    const fleet = computed<FleetItem[]>(() => buildFleet(gadgets.value, status.value, streamables.value, now.value));
    const selected = computed(() => fleet.value.find(item => item.key === selectedKey.value) ?? null);
    const counts = computed(() => {
        const items = fleet.value;
        const online = items.filter(i => isLive(i.state)).length;
        return { total: items.length, online, offline: items.length - online, nearby: status.value?.nearby?.length ?? 0 };
    });

    const verdict = computed(() => computeVerdict({
        fleet: fleet.value,
        status: status.value,
        statusSupported: statusSupported.value,
        jobs: jobs.value,
        streamables: streamables.value,
        error: error.value,
        loaded: loaded.value,
        now: now.value,
        can: { act: allowed.value.act, manage: allowed.value.manage },
    }));

    const linkState = computed<KliveTechLink>(() => {
        if (!prefs.value.live) return 'paused';
        if (!loaded.value) return error.value ? 'offline' : 'connecting';
        if (error.value) return 'offline';
        const age = lastOkAt.value ? now.value - lastOkAt.value : Infinity;
        return age > STALE_AFTER_MS ? 'stale' : 'live';
    });

    /* ----------------------------------------------------------------- sheet --- */

    function open(key: string) {
        selectedKey.value = key;
        syncSocket();
    }
    function close() {
        selectedKey.value = null;
        live.unsubscribe();
    }
    function step(delta: number) {
        const items = fleet.value;
        if (!items.length) return;
        const index = items.findIndex(item => item.key === selectedKey.value);
        open(items[(index + delta + items.length) % items.length].key);
    }

    /** The one socket follows the sheet: only an online gadget with Streamables gets one. */
    function syncSocket() {
        const item = selected.value;
        if (!item || !prefs.value.live || hidden.value || !allowed.value.streams || !isLive(item.state) || !item.streams.length) {
            if (live.gadgetID.value && live.gadgetID.value !== item?.gadgetID) live.unsubscribe();
            return;
        }
        live.subscribe(item.gadgetID);
    }
    watch(() => [selected.value?.gadgetID, selected.value?.state, selected.value?.streams.length], syncSocket);

    /* --------------------------------------------------------------- actions --- */

    function runKey(gadgetID: string, action: string) { return `${gadgetID}/${action}`; }

    async function runAction(item: FleetItem, action: GadgetAction, value: string) {
        const gadget = item.gadget;
        const key = runKey(item.gadgetID, action.name);
        if (!gadget || !isLive(item.state)) { notify('warn', `${item.name} is offline`); return; }
        runs.value = { ...runs.value, [key]: { state: 'running', value, message: '', at: Date.now() } };
        try {
            const reply = await ktPostQuery<{ success: boolean; ms?: number }>(
                `/klivetech/executegadgetaction?gadgetID=${encodeURIComponent(gadget.gadgetID)}` +
                `&gadgetName=${encodeURIComponent(gadget.name)}` +
                `&actionName=${encodeURIComponent(action.name)}` +
                `&actionParam=${encodeURIComponent(value)}`);
            runs.value = { ...runs.value, [key]: { state: 'ok', value, message: '', at: Date.now(), ms: reply?.ms } };
        } catch (reason: any) {
            const message = reason?.message ?? 'The gadget did not acknowledge it';
            runs.value = { ...runs.value, [key]: { state: 'error', value, message, at: Date.now() } };
            notify('crit', `${action.name} on ${item.name}: ${message}`, { label: 'Try again', run: () => runAction(item, action, value) });
            if (reason?.status === 404) void refresh();
        }
    }

    function lastRun(gadgetID: string, action: string): ActionRun | null {
        return runs.value[runKey(gadgetID, action)] ?? null;
    }

    function setPending(key: string, what: string | null) {
        const next = { ...pending.value };
        if (what) next[key] = what; else delete next[key];
        pending.value = next;
    }

    async function setStream(item: FleetItem, streamID: string, change: { enabled?: boolean; intervalMs?: number }) {
        const entry = item.streams.find(s => s.streamID === streamID);
        const key = `${item.gadgetID}/${streamID}`;
        setPending(key, 'stream');
        streamErrors.value = { ...streamErrors.value, [key]: '' };
        try {
            const updated = await ktPostJson<StreamableEntry>('/klivetech/streamables/control', {
                gadgetID: item.gadgetID,
                streamID,
                enabled: change.enabled ?? entry?.enabled ?? true,
                ...(change.intervalMs !== undefined ? { intervalMs: change.intervalMs } : {}),
            });
            const apply = (list: StreamableEntry[]) => list.map(e => (e.gadgetID === updated.gadgetID && e.streamID === updated.streamID ? { ...e, ...updated } : e));
            streamables.value = apply(streamables.value);
            live.liveCatalog.value = apply(live.liveCatalog.value);
        } catch (reason: any) {
            const message = reason?.message ?? 'The gadget rejected that change';
            streamErrors.value = { ...streamErrors.value, [key]: message };
            notify('warn', `${streamID}: ${message}`);
        } finally {
            setPending(key, null);
        }
    }

    function patchRemembered(gadgetID: string, patch: Partial<HubStatus['remembered'][number]> | null) {
        const current = status.value;
        if (!current) return;
        status.value = {
            ...current,
            remembered: patch === null
                ? current.remembered.filter(r => r.gadgetID !== gadgetID)
                : current.remembered.map(r => (r.gadgetID === gadgetID ? { ...r, ...patch } : r)),
        };
    }

    async function retry(gadgetID: string) {
        const item = fleet.value.find(i => i.gadgetID === gadgetID);
        setPending(gadgetID, 'retry');
        try {
            const reply = await ktPostJson<{ state: string }>('/klivetech/gadgets/reconnect', { gadgetID });
            if (reply.state === 'online') notify('ok', `${item?.name ?? 'The gadget'} is already online`);
            else {
                patchRemembered(gadgetID, { state: 'connecting' });
                notify('info', `Trying ${item?.name ?? 'the gadget'} again. Five attempts take up to a minute.`);
            }
            window.setTimeout(() => void refresh(), 2_000);
        } catch (reason: any) {
            notify('warn', reason?.status === 404 && !statusSupported.value
                ? "This server can't retry a gadget yet"
                : reason?.message ?? 'Could not try it again');
        } finally {
            setPending(gadgetID, null);
        }
    }

    async function enrol(address: string) {
        setPending(address, 'enrol');
        try {
            await ktPostJson('/klivetech/gadgets/enrol', { address });
            const current = status.value;
            if (current) status.value = { ...current, nearby: current.nearby.map(d => (d.address === address ? { ...d, enrolling: true } : d)) };
            notify('info', 'Enrolment allowed for this device; connecting.');
            window.setTimeout(() => void refresh(), 2_000);
        } catch (reason: any) {
            notify('warn', reason?.message ?? 'Could not enrol it');
        } finally {
            setPending(address, null);
        }
    }

    async function forget(gadgetID: string) {
        setPending(gadgetID, 'forget');
        try {
            const reply = await ktPostJson<{ name?: string }>('/klivetech/gadgets/forget', { gadgetID });
            patchRemembered(gadgetID, null);
            if (selected.value?.gadgetID === gadgetID) close();
            notify('ok', `Forgot ${reply?.name ?? 'the gadget'}`);
        } catch (reason: any) {
            notify('warn', reason?.message ?? 'Could not forget it');
        } finally {
            setPending(gadgetID, null);
        }
    }

    /* -------------------------------------------------------------- firmware --- */

    const firmwareBusy = ref(false);

    async function startFirmware(form: { project: string; fqbn: string; partitionScheme: string; gadgetID: string }) {
        firmwareBusy.value = true;
        try {
            // Untouched board settings are left out, so the server applies its own defaults.
            const body: Record<string, string> = { project: form.project };
            if (form.fqbn.trim()) body.fqbn = form.fqbn.trim();
            if (form.partitionScheme.trim()) body.partitionScheme = form.partitionScheme.trim();
            if (form.gadgetID) body.gadgetID = form.gadgetID;
            const job = await ktPostJson<FirmwareJob>(form.gadgetID ? '/klivetech/firmware/update' : '/klivetech/firmware/compile', body);
            jobs.value = [job, ...jobs.value.filter(j => j.jobID !== job.jobID)];
            notify('info', form.gadgetID ? `Flashing ${job.gadgetName || 'the gadget'} with ${job.project}` : `Compiling ${job.project}`);
            return job;
        } catch (reason: any) {
            notify('crit', reason?.status === 409
                ? 'That gadget already has a firmware job running'
                : reason?.message ?? 'The firmware job could not be started');
            return null;
        } finally {
            firmwareBusy.value = false;
        }
    }

    async function cancelJob(job: FirmwareJob) {
        try {
            await ktPostJson('/klivetech/firmware/jobs/cancel', { jobID: job.jobID });
            notify('info', 'Job cancelled');
        } catch {
            // A 404 means it finished on its own between the click and the request.
        } finally {
            void loadJobs();
        }
    }

    /* ------------------------------------------------------------- lifecycle --- */

    onMounted(async () => {
        prefs.value = readPrefs();
        hidden.value = document.visibilityState === 'hidden';
        document.addEventListener('visibilitychange', onVisibility);
        clockTimer = window.setInterval(() => { now.value = Date.now(); }, 1_000);
        await profile.ensureLoaded();
        await refresh(true);
        startTimers();
    });

    onBeforeUnmount(() => {
        stopTimers();
        if (jobTimer != null) window.clearInterval(jobTimer);
        if (clockTimer != null) window.clearInterval(clockTimer);
        document.removeEventListener('visibilitychange', onVisibility);
    });

    return {
        profile, allowed, live,
        gadgets, streamables, status, statusSupported, jobs, activeJobs, config, projects, firmwareError, firmwareBusy,
        loaded, error, lastOkAt, busy, hidden, now, prefs, fleet, selected, selectedKey, counts, verdict, linkState,
        pending, streamErrors, toasts,
        notify, dismissToast, refresh, rescanFirmware, setLive, setTab,
        open, close, step, runAction, lastRun, setStream, retry, enrol, forget, startFirmware, cancelJob,
    };
}
