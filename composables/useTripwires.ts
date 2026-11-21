import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { RequestBatchFromKliveAPI, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI, type KliveBatchItem } from '~/scripts/APIInterface';
import { useCurrentProfile } from '~/composables/useCurrentProfile';
import {
  computeIssues, legacyOverview, normalizeOverview, normalizeTripwire, settingsFrom,
  type TwEvent, type TwOverview, type TwSettings, type TwSummary, type TwTarget, type TwTripwire, type TwVisitor,
} from '~/scripts/tripwires';

/**
 * State for the Tripwires console. One instance per page visit.
 *
 * Requests: one /batch every 15 s while the tab is visible: the overview (every tripwire, its figures,
 * the newest trips everywhere and the health of the redirect), plus the open tripwire's trips, plus its
 * visitors when that view is open. Nothing at all while the tab is hidden. A server from before the
 * overview route gets the old reads (list, then a summary per tripwire) in the same batch.
 */

const POLL_MS = 15_000;
const REQUEST_TIMEOUT_MS = 20_000;
const EVENTS_LIMIT = 200;
const PREFS_KEY = 'twx:prefs';

export type TwTab = 'trips' | 'visitors';
export type TwLinkState = 'connecting' | 'live' | 'paused' | 'stale' | 'offline';

export interface TwToast { id: number; tone: 'ok' | 'warn' | 'crit' | 'info'; text: string; action?: { label: string; run: () => unknown } }

interface Prefs { hideKnown: boolean; tab: TwTab; live: boolean }
const DEFAULT_PREFS: Prefs = { hideKnown: true, tab: 'trips', live: true };

function parseBody<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value !== 'string') return value as T;
  const trimmed = value.trim();
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return null;
  try { return JSON.parse(trimmed) as T; } catch { return null; }
}

function readPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_PREFS };
  } catch { return { ...DEFAULT_PREFS }; }
}

/** The server's message from a failed write (it answers plain text), or the status. */
async function failure(response: Response): Promise<string> {
  const text = (await response.text().catch(() => '')).trim();
  if (!text) return `The server answered ${response.status}.`;
  const parsed = parseBody<any>(text);
  return String(parsed?.error ?? parsed?.message ?? text).slice(0, 300);
}

export function useTripwires() {
  const profile = useCurrentProfile();
  const can = (key: string) => profile.can(key);
  const allowed = computed(() => ({
    read: can('tripwires.wires.read'),
    manage: can('tripwires.wires.manage'),
    test: can('tripwires.alerts.test'),
    defence: can('omnidefence.overview.view'),
  }));

  const overview = shallowRef<TwOverview | null>(null);
  const selectedId = ref<string>('');
  const events = shallowRef<TwEvent[]>([]);
  const eventsTotal = ref(0);
  const eventsFor = ref('');
  const eventsLoading = ref(false);
  const visitorFilter = ref<string>('');
  const visitors = shallowRef<TwVisitor[]>([]);
  const visitorsFor = ref('');
  const prefs = ref<Prefs>({ ...DEFAULT_PREFS });
  const now = ref(Date.now());
  const lastOkAt = ref<number | null>(null);
  const failures = ref(0);
  const loadError = ref('');
  const busy = ref(false);
  const toasts = ref<TwToast[]>([]);
  let toastId = 0;
  let pollTimer: number | null = null;
  let clockTimer: number | null = null;
  let inFlight: Promise<void> | null = null;

  const tripwires = computed(() => overview.value?.tripwires ?? []);
  const selected = computed(() => tripwires.value.find(t => t.id === selectedId.value) ?? null);
  const issues = computed(() => computeIssues(overview.value, now.value));
  const ready = computed(() => overview.value != null);

  const linkState = computed<TwLinkState>(() => {
    if (!prefs.value.live) return 'paused';
    if (!ready.value) return failures.value >= 2 ? 'offline' : 'connecting';
    if (failures.value >= 3) return 'offline';
    if (lastOkAt.value && now.value - lastOkAt.value > POLL_MS * 3) return 'stale';
    return 'live';
  });

  function toast(tone: TwToast['tone'], text: string, action?: TwToast['action'], ms = 3_600) {
    const id = ++toastId;
    toasts.value = [...toasts.value.slice(-3), { id, tone, text, action }];
    window.setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, action ? ms + 2_400 : ms);
  }
  function dismissToast(id: number) { toasts.value = toasts.value.filter(t => t.id !== id); }

  async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try { return await run(controller.signal); } finally { window.clearTimeout(timer); }
  }

  const eventsPath = (id: string) => {
    const q = new URLSearchParams({ id, limit: String(EVENTS_LIMIT), offset: '0' });
    if (visitorFilter.value) q.set('visitor', visitorFilter.value);
    return `/tripwires/events?${q}`;
  };
  const visitorsPath = (id: string) => `/tripwires/visitors?id=${encodeURIComponent(id)}&limit=200`;
  let legacy = false;

  function routeMissing(item: KliveBatchItem | undefined): boolean {
    if (!item || item.status !== 404) return false;
    const text = typeof item.body === 'string' ? item.body : JSON.stringify(item.body ?? '');
    return /route not found/i.test(text);
  }

  function applyEvents(id: string, item: KliveBatchItem | undefined) {
    if (!item?.ok) return;
    const page = parseBody<{ items: TwEvent[]; total: number }>(item.body);
    if (!page || !Array.isArray(page.items)) return;
    events.value = page.items;
    eventsTotal.value = Number(page.total) || page.items.length;
    eventsFor.value = id;
  }

  function applyVisitors(id: string, item: KliveBatchItem | undefined) {
    if (!item?.ok) return;
    const page = parseBody<{ items: TwVisitor[] }>(item.body);
    if (!page || !Array.isArray(page.items)) return;
    visitors.value = page.items;
    visitorsFor.value = id;
  }

  /** One read of everything on screen. Concurrent callers share the read in flight. */
  function refresh(): Promise<void> {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      busy.value = true;
      try {
        const id = selectedId.value;
        const wantVisitors = Boolean(id) && prefs.value.tab === 'visitors';
        const paths = legacy ? ['/tripwires/list'] : ['/tripwires/overview'];
        if (id) paths.push(eventsPath(id));
        if (wantVisitors && !legacy) paths.push(visitorsPath(id));
        const results = await withTimeout(signal => RequestBatchFromKliveAPI(paths, signal));
        if (!results.size) throw new Error('The server did not answer.');

        if (!legacy) {
          const item = results.get('/tripwires/overview');
          if (routeMissing(item)) {
            legacy = true;
            inFlight = null;
            return await refresh();
          }
          if (!item?.ok) throw new Error(item ? `Overview answered ${item.status}` : 'No overview in the answer.');
          overview.value = normalizeOverview(parseBody(item.body));
        } else {
          const list = parseBody<any[]>(results.get('/tripwires/list')?.body);
          if (!Array.isArray(list)) throw new Error('The tripwire list could not be read.');
          const summaryPaths = list.map(t => `/tripwires/summary?id=${encodeURIComponent(t.id)}`);
          const summaries = new Map<string, TwSummary | null>();
          if (summaryPaths.length) {
            const answers = await withTimeout(signal => RequestBatchFromKliveAPI(summaryPaths, signal));
            list.forEach((t, i) => summaries.set(String(t.id), answers.get(summaryPaths[i])?.ok ? parseBody<TwSummary>(answers.get(summaryPaths[i])!.body) : null));
          }
          overview.value = legacyOverview(list, summaries);
        }
        if (id) applyEvents(id, results.get(eventsPath(id)));
        if (wantVisitors) applyVisitors(id, results.get(visitorsPath(id)));
        if (selectedId.value && !tripwires.value.some(t => t.id === selectedId.value)) selectedId.value = '';
        lastOkAt.value = Date.now();
        failures.value = 0;
        loadError.value = '';
      } catch (error: any) {
        failures.value += 1;
        loadError.value = error?.name === 'AbortError' ? 'The server took too long to answer.' : String(error?.message ?? error);
      } finally {
        busy.value = false;
        inFlight = null;
      }
    })();
    return inFlight;
  }

  async function loadEvents() {
    const id = selectedId.value;
    if (!id) return;
    eventsLoading.value = eventsFor.value !== id;
    try {
      const response = await withTimeout(signal => RequestGETFromKliveAPI(eventsPath(id), false, false, {}, signal));
      if (!response.ok) return;
      applyEvents(id, { path: '', status: response.status, ok: true, contentType: '', body: await response.text() });
    } finally { eventsLoading.value = false; }
  }

  async function loadVisitors() {
    const id = selectedId.value;
    if (!id || legacy) return;
    const response = await withTimeout(signal => RequestGETFromKliveAPI(visitorsPath(id), false, false, {}, signal)).catch(() => null);
    if (response?.ok) applyVisitors(id, { path: '', status: response.status, ok: true, contentType: '', body: await response.text() });
  }

  async function select(id: string) {
    if (id === selectedId.value) return;
    selectedId.value = id;
    visitorFilter.value = '';
    events.value = [];
    eventsTotal.value = 0;
    if (!id) return;
    await Promise.all([loadEvents(), prefs.value.tab === 'visitors' ? loadVisitors() : Promise.resolve()]);
  }

  function setTab(tab: TwTab) {
    prefs.value = { ...prefs.value, tab };
    if (tab === 'visitors' && visitorsFor.value !== selectedId.value) void loadVisitors();
  }

  function filterVisitor(hash: string) {
    visitorFilter.value = hash;
    prefs.value = { ...prefs.value, tab: 'trips' };
    void loadEvents();
  }

  // ───────────────────────────── writes ─────────────────────────────

  function upsert(raw: any) {
    if (!overview.value) return;
    const next = normalizeTripwire(raw);
    const list = [...overview.value.tripwires];
    const at = list.findIndex(t => t.id === next.id);
    if (at >= 0) list[at] = { ...list[at], ...next, summary: list[at].summary, knownTrips: list[at].knownTrips, proxyTrips: list[at].proxyTrips };
    else list.unshift(next);
    overview.value = { ...overview.value, tripwires: list };
  }

  async function post(path: string, body: unknown): Promise<any> {
    const response = await withTimeout(signal => RequestPOSTFromKliveAPI(path, JSON.stringify(body), false, true, signal));
    if (!response.ok) throw new Error(await failure(response));
    const text = await response.text();
    return text ? parseBody(text) ?? text : null;
  }

  async function create(input: { name: string; targets: { label: string; destinationUrl: string }[]; settings: TwSettings }): Promise<TwTripwire | null> {
    try {
      const created = normalizeTripwire(await post('/tripwires/create', input));
      upsert(created);
      await select(created.id);
      void refresh();
      return created;
    } catch (error: any) {
      toast('crit', `Could not create the tripwire: ${error?.message ?? error}`);
      return null;
    }
  }

  /** A tripwire for one pasted link, started from the settings Klives chose last; returns its tracking link. */
  async function quickCreate(url: string, name: string, from: TwTripwire | null): Promise<TwTripwire | null> {
    return create({ name, targets: [{ label: '', destinationUrl: url }], settings: settingsFrom(from) });
  }

  async function update(id: string, patch: { name?: string; settings?: Partial<TwSettings>; targets?: Partial<TwTarget>[] }, quiet = false): Promise<boolean> {
    try {
      const updated = await post('/tripwires/update', { id, ...patch });
      upsert(updated);
      void refresh();
      if (!quiet) toast('ok', 'Saved');
      return true;
    } catch (error: any) {
      toast('crit', `Could not save: ${error?.message ?? error}`);
      return false;
    }
  }

  async function setEnabled(tripwire: TwTripwire, enabled: boolean) {
    const ok = await update(tripwire.id, { settings: { enabled } }, true);
    if (ok) toast(enabled ? 'ok' : 'info', enabled ? `${tripwire.name} is live again` : `${tripwire.name} is paused`,
      { label: 'Undo', run: () => setEnabled(tripwire, !enabled) });
  }

  async function setTargetEnabled(tripwire: TwTripwire, target: TwTarget, enabled: boolean) {
    const targets = tripwire.targets.map(t => ({ id: t.id, label: t.label, destinationUrl: t.destinationUrl, enabled: t.id === target.id ? enabled : t.enabled }));
    if (await update(tripwire.id, { targets }, true)) toast('ok', `${target.label} is ${enabled ? 'live' : 'off'}`);
  }

  async function duplicate(tripwire: TwTripwire) {
    const created = await create({
      name: `${tripwire.name} (copy)`.slice(0, 120),
      targets: tripwire.targets.map(t => ({ label: t.label, destinationUrl: t.destinationUrl })),
      settings: settingsFrom(tripwire),
    });
    if (created) toast('ok', `New links made for ${created.name}`);
  }

  async function remove(tripwire: TwTripwire): Promise<boolean> {
    try {
      await post('/tripwires/delete', { id: tripwire.id });
      if (overview.value) overview.value = { ...overview.value, tripwires: overview.value.tripwires.filter(t => t.id !== tripwire.id) };
      if (selectedId.value === tripwire.id) await select('');
      toast('ok', `${tripwire.name} deleted`);
      void refresh();
      return true;
    } catch (error: any) {
      toast('crit', `Could not delete: ${error?.message ?? error}`);
      return false;
    }
  }

  async function clearHistory(tripwire: TwTripwire): Promise<boolean> {
    try {
      await post('/tripwires/events/clear', { id: tripwire.id });
      events.value = [];
      eventsTotal.value = 0;
      visitors.value = [];
      toast('ok', `History of ${tripwire.name} cleared`);
      await refresh();
      return true;
    } catch (error: any) {
      toast('crit', `Could not clear: ${error?.message ?? error}`);
      return false;
    }
  }

  async function testAlert(tripwire: TwTripwire) {
    try {
      await post('/tripwires/notification/test', { id: tripwire.id });
      toast('ok', 'Test alert sent to Discord');
    } catch (error: any) {
      toast('crit', `Discord test failed: ${error?.message ?? error}`);
    }
  }

  async function copy(text: string, what = 'Link copied') {
    try {
      await navigator.clipboard.writeText(text);
      toast('ok', what, undefined, 2_000);
      return true;
    } catch {
      toast('warn', 'The browser did not allow copying. Select the link and copy it by hand.');
      return false;
    }
  }

  // ───────────────────────────── lifecycle ─────────────────────────────

  function schedule() {
    if (pollTimer) window.clearInterval(pollTimer);
    pollTimer = window.setInterval(() => {
      if (document.visibilityState === 'hidden' || !prefs.value.live) return;
      void refresh();
    }, POLL_MS);
  }

  function onVisibility() {
    if (document.visibilityState === 'visible' && prefs.value.live && (!lastOkAt.value || Date.now() - lastOkAt.value > POLL_MS)) void refresh();
  }

  function setLive(live: boolean) {
    prefs.value = { ...prefs.value, live };
    if (live) void refresh();
  }

  watch(prefs, value => { try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(value)); } catch { /* private mode */ } }, { deep: true });

  onMounted(() => {
    prefs.value = readPrefs();
    void refresh();
    schedule();
    document.addEventListener('visibilitychange', onVisibility);
    clockTimer = window.setInterval(() => { now.value = Date.now(); }, 15_000);
  });

  onBeforeUnmount(() => {
    if (pollTimer) window.clearInterval(pollTimer);
    if (clockTimer) window.clearInterval(clockTimer);
    document.removeEventListener('visibilitychange', onVisibility);
  });

  return {
    allowed, overview, tripwires, selected, selectedId, events, eventsTotal, eventsFor, eventsLoading, eventsLimit: EVENTS_LIMIT,
    visitors, visitorsFor, visitorFilter, prefs, now, issues, ready, linkState, lastOkAt, loadError, busy, toasts,
    refresh, select, setTab, filterVisitor, loadEvents, create, quickCreate, update, setEnabled, setTargetEnabled, duplicate,
    remove, clearHistory, testAlert, copy, toast, dismissToast, setLive,
  };
}

export type TripwiresConsole = ReturnType<typeof useTripwires>;
