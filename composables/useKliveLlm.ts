import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref } from 'vue';
import { RequestBatchFromKliveAPI, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import { useCurrentProfile } from '~/composables/useCurrentProfile';
import {
  computeLlmIssues, computeLlmVerdict, pan, qs, windowBounds, windowParams, zoomIn, zoomOut,
  type LlmIssue, type LlmVerdict, type LlmWindow,
} from '~/scripts/kliveLlm';

/**
 * State for the KliveLLM page: what every service is sending to which router, how the routers are
 * doing, what it costs, and the routing Klives can change. One instance per page visit.
 *
 * Request tiers. What is in flight right now (calls, AIRouter's slots, router minutes) is read every
 * 5 s from memory on the server. The overview of the window, and the open tab's own reads, every
 * 20 s in one /batch. The routing in force and the routers every 60 s. Nothing at all while the tab is
 * hidden, and nothing a profile's permissions would refuse. Every field is optional: the site and
 * the server deploy separately.
 */

const LIVE_MS = 5_000;
const MAIN_MS = 20_000;
const SLOW_MS = 60_000;
const TIMEOUT_MS = 20_000;
const PREFS_KEY = 'llx:prefs';

export type LlmTab = 'overview' | 'services' | 'routing' | 'routers' | 'analytics' | 'costs' | 'calls' | 'insights';

export const LLM_TABS: { id: LlmTab; label: string; icon: string; permission: string }[] = [
  { id: 'overview', label: 'Overview', icon: 'radar', permission: 'klivellm.overview.view' },
  { id: 'services', label: 'Services', icon: 'grid', permission: 'klivellm.overview.view' },
  { id: 'routing', label: 'Routing', icon: 'route', permission: 'klivellm.overview.view' },
  { id: 'routers', label: 'Routers', icon: 'server', permission: 'klivellm.overview.view' },
  { id: 'analytics', label: 'Analytics', icon: 'chart', permission: 'klivellm.analytics.read' },
  { id: 'costs', label: 'Costs', icon: 'coins', permission: 'klivellm.analytics.read' },
  { id: 'calls', label: 'Calls', icon: 'list', permission: 'klivellm.calls.read' },
  { id: 'insights', label: 'Insights', icon: 'spark', permission: 'klivellm.analytics.read' },
];

export type LlmLinkState = 'connecting' | 'live' | 'paused' | 'stale' | 'offline' | 'starting';

export interface LlmToast {
  id: number;
  tone: 'ok' | 'warn' | 'crit' | 'info';
  text: string;
  action?: { label: string; run: () => unknown };
}

interface Prefs { live: boolean; flowMeasure: 'tokens' | 'calls' | 'costUsd' }
const DEFAULT_PREFS: Prefs = { live: true, flowMeasure: 'tokens' };

function readPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_PREFS };
  } catch { return { ...DEFAULT_PREFS }; }
}

function parse<T = any>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value !== 'string') return value as T;
  const text = value.trim();
  if (!text || (text[0] !== '{' && text[0] !== '[')) return null;
  try { return JSON.parse(text) as T; } catch { return null; }
}

/** Thrown by a write whose route answered with an error; carries the server's message. */
export class LlmRequestError extends Error {
  constructor(message: string, readonly status: number, readonly detail?: any) { super(message); }
}

export function useKliveLlm() {
  const profile = useCurrentProfile();
  const can = (key: string) => profile.can(key);
  const allowed = computed(() => ({
    view: can('klivellm.overview.view'),
    analytics: can('klivellm.analytics.read'),
    calls: can('klivellm.calls.read'),
    content: can('klivellm.content.read'),
    routing: can('klivellm.routing.manage'),
    routers: can('klivellm.routers.manage'),
    prices: can('klivellm.prices.manage'),
    export: can('klivellm.data.export'),
    settings: can('klivellm.settings.manage'),
  }));
  const tabs = computed(() => LLM_TABS.filter(t => can(t.permission)));

  // ── what is being looked at (the window and tab live in the address bar) ──
  const route = useRoute();
  const router = useRouter();
  const tab = ref<LlmTab>('overview');
  const window_ = ref<LlmWindow>({ range: '24h', from: null, to: null });
  const bucket = ref('auto');
  const history = ref<LlmWindow[]>([]);
  const prefs = ref<Prefs>({ ...DEFAULT_PREFS });

  // ── what the server said ──
  const overview = shallowRef<any | null>(null);
  const live = shallowRef<any | null>(null);
  const routing = shallowRef<any | null>(null);
  const routers = shallowRef<any | null>(null);
  const now = ref(Date.now());
  const tick = ref(0);
  const busy = ref<Record<string, boolean>>({});
  const errors = ref<Record<string, string>>({});
  const lastOkAt = ref<number | null>(null);
  const failures = ref(0);
  const missing = ref(false);
  const hidden = ref(false);
  const toasts = ref<LlmToast[]>([]);
  let toastId = 0;

  function notify(tone: LlmToast['tone'], text: string, action?: LlmToast['action'], ms = 6_000) {
    const id = ++toastId;
    toasts.value = [...toasts.value, { id, tone, text, action }];
    window.setTimeout(() => dismissToast(id), ms);
  }
  function dismissToast(id: number) { toasts.value = toasts.value.filter(t => t.id !== id); }

  const bounds = computed(() => windowBounds(window_.value, now.value));
  const params = computed(() => ({ ...windowParams(window_.value), ...(bucket.value !== 'auto' ? { bucket: bucket.value } : {}) }));

  // ── transport ──

  async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
    try { return await run(controller.signal); } finally { window.clearTimeout(timer); }
  }

  /** One GET; resolves to the parsed body, or throws with the server's message. */
  async function get<T = any>(path: string): Promise<T> {
    const response = await withTimeout(signal => RequestGETFromKliveAPI(path, false, false, {}, signal));
    const text = await response.text();
    const body = parse<any>(text);
    if (!response.ok) {
      if (response.status === 404 && /route not found/i.test(text)) missing.value = true;
      throw new LlmRequestError(body?.error ?? (text || `HTTP ${response.status}`), response.status, body?.detail);
    }
    missing.value = false;
    return (body ?? text) as T;
  }

  /** Several GETs in one /batch; each value is the body, or an Error for that path. */
  async function batch(paths: string[]): Promise<Map<string, any>> {
    const result = new Map<string, any>();
    if (!paths.length) return result;
    const answers = await withTimeout(signal => RequestBatchFromKliveAPI(paths, signal));
    if (!answers.size) throw new Error('The server did not answer.');
    for (const path of paths) {
      const item = answers.get(path);
      if (!item) { result.set(path, new Error('No answer.')); continue; }
      const body = parse<any>(item.body);
      if (!item.ok) {
        if (item.status === 404 && /route not found/i.test(String(item.body ?? ''))) missing.value = true;
        result.set(path, new LlmRequestError(body?.error ?? String(item.body ?? `HTTP ${item.status}`), item.status));
      } else result.set(path, body);
    }
    return result;
  }

  async function post<T = any>(path: string, body: unknown): Promise<T> {
    const response = await withTimeout(signal => RequestPOSTFromKliveAPI(path, JSON.stringify(body ?? {}), false, true, signal));
    const text = await response.text();
    const parsed = parse<any>(text);
    if (!response.ok) throw new LlmRequestError(parsed?.error ?? (text || `HTTP ${response.status}`), response.status, parsed?.detail);
    return (parsed ?? text) as T;
  }

  // ── reads ──

  async function refreshLive(): Promise<void> {
    if (!allowed.value.view) return;
    busy.value = { ...busy.value, live: true };
    try {
      live.value = await get('/klivellm/live');
      lastOkAt.value = Date.now();
      failures.value = 0;
      delete errors.value.live;
    } catch (e: any) {
      failures.value++;
      errors.value = { ...errors.value, live: e?.message ?? 'Unavailable' };
    } finally { busy.value = { ...busy.value, live: false }; }
  }

  const overviewPath = computed(() => `/klivellm/overview${qs(params.value)}`);

  // ── the open tab's own reads ──
  // A tab registers what it reads; the reads ride along in the 20 s batch with the overview, and
  // are read at once (merged into one batch per tick) when the tab opens or its paths change.

  const slots = new Set<LlmReadSlot>();
  let pendingSlots: Set<LlmReadSlot> | null = null;

  function registerRead(slot: LlmReadSlot): () => void {
    slots.add(slot);
    return () => { slots.delete(slot); };
  }

  function readNow(slot: LlmReadSlot) {
    if (!pendingSlots) {
      pendingSlots = new Set();
      queueMicrotask(() => {
        const list = [...pendingSlots!];
        pendingSlots = null;
        void runSlots(list);
      });
    }
    pendingSlots.add(slot);
  }

  async function runSlots(list: LlmReadSlot[]) {
    const wanted = list.map(s => ({ slot: s, path: s.path() })).filter((x): x is { slot: LlmReadSlot; path: string } => !!x.path);
    if (!wanted.length) return;
    for (const w of wanted) w.slot.loading(true);
    try {
      const answers = await batch([...new Set(wanted.map(w => w.path))]);
      for (const w of wanted) if (answers.has(w.path)) w.slot.accept(w.path, answers.get(w.path));
    } catch (e: any) {
      for (const w of wanted) w.slot.accept(w.path, new LlmRequestError(e?.message ?? 'Unavailable', 0));
    } finally {
      for (const w of wanted) w.slot.loading(false);
    }
  }

  async function refreshMain(): Promise<void> {
    if (!allowed.value.view) return;
    busy.value = { ...busy.value, main: true };
    try {
      const extra = [...slots].map(s => ({ slot: s, path: s.path() })).filter((x): x is { slot: LlmReadSlot; path: string } => !!x.path);
      const answers = await batch([...new Set([overviewPath.value, ...extra.map(x => x.path)])]);
      const o = answers.get(overviewPath.value);
      if (o instanceof Error) errors.value = { ...errors.value, overview: o.message };
      else if (o !== undefined) { overview.value = o; delete errors.value.overview; }
      for (const x of extra) if (answers.has(x.path)) x.slot.accept(x.path, answers.get(x.path));
      tick.value++;
    } catch (e: any) {
      errors.value = { ...errors.value, overview: e?.message ?? 'Unavailable' };
    } finally { busy.value = { ...busy.value, main: false }; }
  }

  async function refreshSlow(): Promise<void> {
    if (!allowed.value.view) return;
    busy.value = { ...busy.value, slow: true };
    try {
      const answers = await batch(['/klivellm/routing', '/klivellm/routers']);
      const r = answers.get('/klivellm/routing');
      const rs = answers.get('/klivellm/routers');
      if (!(r instanceof Error)) routing.value = r; else errors.value = { ...errors.value, routing: r.message };
      if (!(rs instanceof Error)) routers.value = rs; else errors.value = { ...errors.value, routers: rs.message };
    } catch (e: any) {
      errors.value = { ...errors.value, routing: e?.message ?? 'Unavailable' };
    } finally { busy.value = { ...busy.value, slow: false }; }
  }

  async function refreshAll() {
    await Promise.all([refreshLive(), refreshMain(), refreshSlow()]);
  }

  // ── timers ──

  let liveTimer: number | null = null, mainTimer: number | null = null, slowTimer: number | null = null, clockTimer: number | null = null;
  function stopTimers() {
    for (const t of [liveTimer, mainTimer, slowTimer]) if (t != null) window.clearInterval(t);
    liveTimer = mainTimer = slowTimer = null;
  }
  function startTimers() {
    stopTimers();
    if (!prefs.value.live || hidden.value) return;
    liveTimer = window.setInterval(() => void refreshLive(), LIVE_MS);
    mainTimer = window.setInterval(() => void refreshMain(), MAIN_MS);
    slowTimer = window.setInterval(() => void refreshSlow(), SLOW_MS);
  }
  function setLive(on: boolean) {
    prefs.value = { ...prefs.value, live: on };
    if (on) void refreshAll();
    startTimers();
  }
  function onVisibility() {
    hidden.value = document.hidden;
    if (!hidden.value && prefs.value.live) void refreshAll();
    startTimers();
  }

  const linkState = computed<LlmLinkState>(() => {
    if (missing.value || live.value?.ledgerError) return 'starting';
    if (!prefs.value.live) return 'paused';
    if (lastOkAt.value == null) return failures.value > 2 ? 'offline' : 'connecting';
    if (failures.value > 2) return 'offline';
    return now.value - lastOkAt.value > LIVE_MS * 4 ? 'stale' : 'live';
  });

  const issues = computed<LlmIssue[]>(() => computeLlmIssues({ overview: overview.value, live: live.value, routers: routers.value, routing: routing.value, now: now.value }));
  const verdict = computed<LlmVerdict>(() => computeLlmVerdict(issues.value, overview.value));

  // ── the window ──

  function setWindow(next: LlmWindow, remember = true) {
    if (remember) history.value = [...history.value.slice(-19), window_.value];
    window_.value = next;
  }
  const setPreset = (range: string) => setWindow({ range, from: null, to: null });
  const zoomTo = (from: number, to: number) => setWindow({ range: window_.value.range, from: Math.round(from), to: Math.round(to) });
  const zoomOutWindow = () => setWindow(zoomOut(window_.value, now.value));
  const zoomInWindow = () => setWindow(zoomIn(window_.value, now.value));
  const panWindow = (direction: -1 | 1) => setWindow(pan(window_.value, direction, now.value));
  function backWindow() {
    const previous = history.value[history.value.length - 1];
    if (!previous) return;
    history.value = history.value.slice(0, -1);
    window_.value = previous;
  }

  watch([window_, bucket], () => { void refreshMain(); });

  // ── address bar ──

  function readQuery() {
    const q = route.query;
    const t = String(q.tab ?? '');
    if (LLM_TABS.some(x => x.id === t)) tab.value = t as LlmTab;
    const from = Number(q.from), to = Number(q.to);
    if (Number.isFinite(from) && Number.isFinite(to) && to > from) window_.value = { range: String(q.range ?? '24h'), from, to };
    else if (q.range) window_.value = { range: String(q.range), from: null, to: null };
    if (q.bucket) bucket.value = String(q.bucket);
  }
  watch([tab, window_, bucket], () => {
    const query: Record<string, string> = {};
    for (const [k, v] of Object.entries(route.query)) if (typeof v === 'string' && !['tab', 'range', 'from', 'to', 'bucket'].includes(k)) query[k] = v;
    query.tab = tab.value;
    if (window_.value.from != null && window_.value.to != null) { query.from = String(window_.value.from); query.to = String(window_.value.to); }
    else query.range = window_.value.range;
    if (bucket.value !== 'auto') query.bucket = bucket.value;
    void router.replace({ query });
  });

  // ── writes ──

  async function run<T>(label: string, work: () => Promise<T>, success?: string | ((value: T) => string)): Promise<T | null> {
    busy.value = { ...busy.value, [label]: true };
    try {
      const value = await work();
      if (success) notify('ok', typeof success === 'string' ? success : success(value));
      return value;
    } catch (e: any) {
      notify(e?.status === 409 ? 'warn' : 'crit', e?.message ?? 'That did not work.', undefined, 9_000);
      return null;
    } finally { busy.value = { ...busy.value, [label]: false }; }
  }

  const applyRouting = (document: any, baseRevision: number, note: string) => run('apply', async () => {
    const result = await post('/klivellm/routing/apply', { document, baseRevision, note });
    if (result?.routing) routing.value = result.routing;
    return result;
  }, (r: any) => `Routing saved as revision ${r?.revision ?? ''}.`);

  const previewRouting = (document: any, baseRevision: number) => post('/klivellm/routing/preview', { document, baseRevision });

  /** Puts a past revision back in force (as a new revision); `before` restores what it replaced. */
  const restoreRevision = (revision: number, note?: string, before = false) => run('restore', async () => {
    const result = await post('/klivellm/routing/revert', { revision, note, before });
    if (result?.routing) routing.value = result.routing;
    void refreshMain();
    return result;
  }, (r: any) => `${before ? 'The routing before revision' : 'Revision'} ${revision} restored as revision ${r?.revision ?? ''}.`);

  const setOverride = (body: { router: string; model?: string | null; minutes: number; reason?: string; services?: string[] }) => run('override', async () => {
    const result = await post('/klivellm/routing/override', body);
    if (result?.routing) routing.value = result.routing;
    void refreshMain();
    return result;
  }, `Everything goes to ${body.router} for ${body.minutes} minutes.`);

  const clearOverride = () => run('override', async () => {
    const result = await post('/klivellm/routing/override', { clear: true });
    if (result?.routing) routing.value = result.routing;
    void refreshMain();
    return result;
  }, 'Override cleared.');

  const setPaused = (service: string, lane: string | null, paused: boolean, reason?: string) => run(`pause:${service}/${lane ?? ''}`, async () => {
    const result = await post('/klivellm/service/pause', { service, lane, paused, reason });
    if (result?.routing) routing.value = result.routing;
    return result;
  }, `${service}${lane ? ' › ' + lane : ''} ${paused ? 'paused' : 'resumed'}.`);

  const saveBudget = (scope: string, budget: any | null) => run(`budget:${scope}`, async () => {
    const result = await post('/klivellm/budgets/save', { scope, budget });
    if (result?.routing) routing.value = result.routing;
    return result;
  }, budget ? `Budget saved for ${scope}.` : `Budget removed for ${scope}.`);

  const setCapture = (scope: string, minutes: number) => run(`capture:${scope}`, async () => {
    const result = await post('/klivellm/content/capture', { scope, minutes });
    if (result?.routing) routing.value = result.routing;
    return result;
  }, minutes > 0 ? `Keeping prompt and reply text for ${scope} for ${minutes} minutes.` : `Stopped keeping text for ${scope}.`);

  const resetCircuits = (lane?: string, routerId?: string) => run('circuits', async () => {
    const result = await post('/klivellm/circuits/reset', { lane, router: routerId });
    void refreshSlow();
    return result;
  }, 'Every router will be tried again.');

  const saveRouter = (definition: any) => run('router-save', async () => {
    const result = await post('/klivellm/routers/save', { router: definition });
    if (result?.routers) routers.value = result.routers;
    void refreshSlow();
    return result;
  }, (r: any) => `${definition.name || r?.id} saved.`);

  const deleteRouter = (id: string) => run('router-delete', async () => {
    const result = await post('/klivellm/routers/delete', { id });
    if (result?.routers) routers.value = result.routers;
    void refreshSlow();
    return result;
  }, `Router ${id} removed.`);

  const setRouterKey = (id: string, key: string) => run('router-key', async () => {
    const result = await post('/klivellm/routers/key', { id, key });
    void refreshSlow();
    return result;
  }, key ? 'Key saved. It is never shown again.' : 'Key removed.');

  const testRouter = (id: string, completion: boolean, model?: string) => run('router-test', () => post('/klivellm/routers/test', { id, completion, model }));

  const savePrices = (entries: any[]) => run('prices', () => post('/klivellm/prices/save', { entries }), 'Prices saved.');
  const refreshPrices = () => run('prices', () => post('/klivellm/prices/refresh', {}), (r: any) => `${r?.imported ?? 0} OpenRouter prices read.`);
  const saveSettings = (settings: any) => run('settings', () => post('/klivellm/settings', settings), 'Settings saved.');

  // ── life cycle ──

  onMounted(() => {
    prefs.value = readPrefs();
    readQuery();
    hidden.value = document.hidden;
    document.addEventListener('visibilitychange', onVisibility);
    clockTimer = window.setInterval(() => { now.value = Date.now(); }, 1_000);
    void profile.ensureLoaded?.();
    void refreshAll();
    startTimers();
  });
  onBeforeUnmount(() => {
    stopTimers();
    if (clockTimer != null) window.clearInterval(clockTimer);
    document.removeEventListener('visibilitychange', onVisibility);
  });
  watch(prefs, value => { try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(value)); } catch { /* private window */ } }, { deep: true });
  watch(() => allowed.value.view, ok => { if (ok) void refreshAll(); });

  return {
    allowed, tabs, tab, window: window_, bucket, bounds, params, history, prefs,
    overview, live, routing, routers, now, tick, busy, errors, linkState, issues, verdict, toasts, missing,
    get, post, batch, notify, dismissToast, refreshAll, refreshLive, refreshMain, refreshSlow, setLive, registerRead, readNow,
    setWindow, setPreset, zoomTo, zoomOutWindow, zoomInWindow, panWindow, backWindow,
    applyRouting, previewRouting, restoreRevision, setOverride, clearOverride, setPaused, saveBudget, setCapture, resetCircuits,
    saveRouter, deleteRouter, setRouterKey, testRouter, savePrices, refreshPrices, saveSettings,
  };
}

export type KliveLlmConsole = ReturnType<typeof useKliveLlm>;

/** What the page shell offers every tab: navigation between tabs, sheets and dialogs. */
export interface LlmUi {
  /** A row or section the open tab should bring into view (a lane key, a router id, 'override'…). */
  target: Ref<string | null>;
  analyticsPreset: Ref<{ filters: Record<string, string[]>; metric?: string; groupBy?: string } | null>;
  callsPreset: Ref<Record<string, any> | null>;
  /** Routing edits not yet applied, kept here so they survive switching tabs. */
  draft: Ref<any | null>;
  /** The revision the draft was started from (an apply against a newer one is refused). */
  draftBase: Ref<number | null>;
  /** The document that revision held, so a draft can be carried onto a newer one. */
  draftOrigin: Ref<any | null>;
  goTab(tab: LlmTab, target?: string | null): void;
  openCall(id: number): void;
  openLane(key: string): void;
  openRouter(id: string): void;
  filterAnalytics(filters: Record<string, string[]>, metric?: string, groupBy?: string): void;
  openCalls(filter: Record<string, any>): void;
  editRoute(key: string): void;
  confirm(options: { title: string; body?: string; confirm?: string; danger?: boolean }): Promise<boolean>;
  download(path: string, filename: string): Promise<void>;
}

export interface LlmReadSlot {
  path: () => string | null;
  accept: (path: string, value: any) => void;
  loading: (on: boolean) => void;
}

/**
 * One GET a tab needs, kept fresh with the page: read when the component mounts and whenever its
 * path changes, then again with every 20 s batch. The last good answer stays shown while a new
 * path loads (`stale` says so), so changing a filter never blanks a chart. A null path reads nothing.
 */
export function useLlmRead<T = any>(c: KliveLlmConsole, path: () => string | null) {
  const value = shallowRef<T | null>(null);
  const error = ref<string | null>(null);
  const loading = ref(false);
  const loadedPath = ref<string | null>(null);
  const slot: LlmReadSlot = {
    path,
    accept(p, body) {
      if (p !== path()) return;
      if (body instanceof Error) { error.value = body.message; return; }
      if (body === undefined) return;
      value.value = body as T;
      loadedPath.value = p;
      error.value = null;
    },
    loading(on) { loading.value = on; },
  };
  let off: (() => void) | null = null;
  onMounted(() => { off = c.registerRead(slot); c.readNow(slot); });
  onBeforeUnmount(() => off?.());
  watch(path, (next, previous) => { if (next !== previous) c.readNow(slot); });
  const stale = computed(() => value.value != null && loadedPath.value !== path());
  return { value, error, loading, stale, reload: () => c.readNow(slot) };
}
