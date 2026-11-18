import { computed, inject, onBeforeUnmount, onMounted, provide, reactive, ref, shallowRef, watch, type InjectionKey } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { RequestBatchFromKliveAPI, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import { useAccess } from '~/composables/useAccess';
import {
  MS_DEFAULT_RANGE, MS_RANGES, msTimeZone, msVerdict,
  type MsDashboard, type MsGranularity, type MsHealth, type MsReel, type MsReelDetail, type MsReelPage, type MsScrape,
  type MsScrapePage, type MsSource, type MsSourceSort, type MsSourceState, type MsView,
} from '~/scripts/memeConsole';

/*
 * The MemeScraper console's state, data and actions. The page provides one instance; its components inject it.
 *
 * Data tiers: one /batch (dashboard for the window + scraper health) on open and whenever the window changes;
 * health alone every 4 s while something runs (or the service is starting) and every 30 s otherwise; the
 * dashboard again every 2 min, and as soon as a run ends so new reels show; nothing while the tab is hidden.
 * The library, scrape log and source sheet load only when they are on screen.
 */

export const MEME_VIEWS: { id: MsView; label: string; key: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', key: '1', icon: 'pulse' },
  { id: 'sources', label: 'Sources', key: '2', icon: 'users' },
  { id: 'library', label: 'Library', key: '3', icon: 'film' },
  { id: 'activity', label: 'Activity', key: '4', icon: 'activity' },
];

export const MEME_LIBRARY_SORTS = [
  { id: 'downloaded', label: 'Newest saved' },
  { id: 'posted', label: 'Newest posted' },
  { id: 'views', label: 'Most viewed' },
  { id: 'likes', label: 'Most liked' },
  { id: 'engagement', label: 'Engagement' },
  { id: 'age', label: 'Freshest' },
  { id: 'owner', label: 'Source' },
] as const;

export const MEME_LIBRARY_PAGE = 36;
const LOG_PAGE = 25;
const PREFS_KEY = 'msx:prefs:v1';

export interface MemeToast { id: number; tone: 'ok' | 'warn' | 'crit' | 'info'; text: string; action?: { label: string; run: () => void } }

interface Prefs {
  live: boolean;
  chart: 'stack' | 'total';
  showPrevious: boolean;
  libMode: 'grid' | 'list';
  libSort: string;
  libAsc: boolean;
  sourceSort: MsSourceSort;
  sourceDesc: boolean;
}

const DEFAULT_PREFS: Prefs = { live: true, chart: 'stack', showPrevious: true, libMode: 'grid', libSort: 'downloaded', libAsc: false, sourceSort: 'state', sourceDesc: false };

type Query = Record<string, string | number | boolean | null | undefined>;

function qs(params: Query): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '' || v === false) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

interface Answer<T> { ok: boolean; status: number; data: T | null; error: string | null }

function readBody(body: unknown): any {
  if (typeof body !== 'string') return body;
  try { return JSON.parse(body); } catch { return body; }
}

function errorOf(status: number, body: any): string {
  if (body && typeof body === 'object' && typeof body.error === 'string') return body.error;
  if (typeof body === 'string' && body.trim()) return body.trim().slice(0, 300);
  return status ? `The server answered ${status}` : 'No answer from the server';
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<Answer<T>> {
  try {
    const response = await RequestGETFromKliveAPI(path, false, false, {}, signal);
    const text = await response.text();
    const body = readBody(text);
    return response.ok ? { ok: true, status: response.status, data: body as T, error: null } : { ok: false, status: response.status, data: null, error: errorOf(response.status, body) };
  } catch (e) {
    if ((e as any)?.name === 'AbortError') throw e;
    return { ok: false, status: 0, data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

async function postJson<T>(path: string, body?: unknown): Promise<Answer<T>> {
  try {
    const response = await RequestPOSTFromKliveAPI(path, body === undefined ? '' : JSON.stringify(body), false, body !== undefined);
    const text = await response.text();
    const parsed = readBody(text);
    return response.ok ? { ok: true, status: response.status, data: parsed as T, error: null } : { ok: false, status: response.status, data: null, error: errorOf(response.status, parsed) };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

// ───────────────────────────── thumbnails ─────────────────────────────
// <img> cannot send the Authorization header, so thumbnails are fetched as blobs. A library page used to ask for
// 48 at once and the server made each one with FFmpeg (3 at a time): p95 38 s live. Now only cards on screen ask,
// at most four requests are in flight, and the most recently requested (what was just scrolled to) goes first.

const thumbCache = new Map<string, string | null>();
const thumbWaiters = new Map<string, Set<(url: string | null) => void>>();
let thumbQueue: string[] = [];
let thumbActive = 0;
const THUMB_PARALLEL = 4;

function pumpThumbs() {
  while (thumbActive < THUMB_PARALLEL && thumbQueue.length) {
    const id = thumbQueue.pop()!;
    if (!thumbWaiters.get(id)?.size) continue;
    thumbActive++;
    void (async () => {
      let url: string | null = null;
      try {
        const response = await RequestGETFromKliveAPI(`/memescraper/reelThumb${qs({ postId: id })}`, false, false);
        if (response.ok) url = URL.createObjectURL(await response.blob());
      } catch { /* shown as the placeholder */ }
      thumbCache.set(id, url);
      for (const done of thumbWaiters.get(id) ?? []) done(url);
      thumbWaiters.delete(id);
      thumbActive--;
      pumpThumbs();
    })();
  }
}

function requestThumb(id: string, done: (url: string | null) => void): () => void {
  if (thumbCache.has(id)) { done(thumbCache.get(id)!); return () => {}; }
  let set = thumbWaiters.get(id);
  if (!set) { set = new Set(); thumbWaiters.set(id, set); }
  set.add(done);
  thumbQueue = thumbQueue.filter(x => x !== id);
  thumbQueue.push(id);
  pumpThumbs();
  return () => {
    set!.delete(done);
    if (!set!.size) { thumbWaiters.delete(id); thumbQueue = thumbQueue.filter(x => x !== id); }
  };
}

function releaseThumbs() {
  for (const url of thumbCache.values()) if (url) URL.revokeObjectURL(url);
  thumbCache.clear();
  thumbWaiters.clear();
  thumbQueue = [];
}

// ───────────────────────────── the console ─────────────────────────────

function createMemeConsole() {
  const route = useRoute();
  const router = useRouter();
  const access = useAccess();
  const tz = msTimeZone();

  const allowed = computed(() => ({
    health: access.can('memescraper.health.view'),
    read: access.can('memescraper.sources.read'),
    manage: access.can('memescraper.sources.manage'),
    run: access.can('memescraper.scrape.run'),
  }));

  const now = ref(Date.now());

  // ── preferences (this browser only) ──
  const prefs = ref<Prefs>({ ...DEFAULT_PREFS });
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null');
    if (saved && typeof saved === 'object') prefs.value = { ...DEFAULT_PREFS, ...saved };
  } catch { /* private mode or nothing saved */ }
  watch(prefs, value => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(value)); } catch { /* ignore */ } }, { deep: true });

  // ── the window and filters live in the URL, so a view can be shared and survives reloads ──
  const str = (key: string) => {
    const v = route.query[key];
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  };
  const isDay = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

  const view = computed<MsView>(() => {
    const v = str('view');
    return v === 'sources' || v === 'library' || v === 'activity' ? v : 'overview';
  });
  const from = computed(() => (isDay(str('from')) ? str('from') : null));
  const to = computed(() => (isDay(str('to')) ? str('to') : null));
  const custom = computed(() => !!from.value);
  const preset = computed(() => (custom.value ? 'custom' : (MS_RANGES.some(p => p.key === str('range')) ? str('range')! : MS_DEFAULT_RANGE)));
  const granularity = computed<MsGranularity | null>(() => {
    const g = str('g');
    return g === 'day' || g === 'week' || g === 'month' ? g : null;
  });
  const filterSources = computed(() => (str('src') ?? '').split(',').map(s => s.trim()).filter(Boolean));
  const filterNiche = computed(() => str('niche'));
  const hasFilters = computed(() => filterSources.value.length > 0 || !!filterNiche.value);
  const search = computed(() => str('q') ?? '');
  const sourceState = computed(() => str('state') as MsSourceState | 'all' | null ?? 'all');

  const params = computed<Query>(() => ({
    range: custom.value ? null : preset.value,
    from: from.value,
    to: custom.value ? to.value : null,
    granularity: granularity.value,
    sources: filterSources.value.length ? filterSources.value.join(',') : null,
    niche: filterNiche.value,
    tz,
  }));
  const windowKey = computed(() => JSON.stringify(params.value));

  function setQuery(patch: Record<string, string | null | undefined>) {
    const query: Record<string, any> = { ...route.query };
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined || v === '') delete query[k];
      else query[k] = v;
    }
    void router.replace({ query });
  }

  const setView = (v: MsView) => setQuery({ view: v === 'overview' ? null : v });
  // The library covers everything unless the address names a window, so there the default is written out too.
  const setPreset = (k: string) => setQuery({ range: k === MS_DEFAULT_RANGE && view.value !== 'library' ? null : k, from: null, to: null, g: null });
  /** The preset the window buttons show as chosen: the library's natural scope is "All". */
  const shownPreset = computed(() => (view.value === 'library' && !custom.value && !str('range') ? 'all' : preset.value));
  const setCustom = (f: string, t: string) => {
    const [a, b] = f <= t ? [f, t] : [t, f];
    setQuery({ range: null, from: a, to: b });
  };
  const setGranularity = (g: MsGranularity | null) => setQuery({ g });
  const setSources = (list: string[]) => setQuery({ src: list.length ? [...new Set(list)].join(',') : null });
  const toggleSource = (name: string) => {
    const has = filterSources.value.some(s => s.toLowerCase() === name.toLowerCase());
    setSources(has ? filterSources.value.filter(s => s.toLowerCase() !== name.toLowerCase()) : [...filterSources.value, name]);
  };
  const setNiche = (n: string | null) => setQuery({ niche: n });
  const clearFilters = () => setQuery({ src: null, niche: null });
  const setSearch = (q: string) => setQuery({ q: q.trim() || null });
  const setSourceState = (s: MsSourceState | 'all') => setQuery({ state: s === 'all' ? null : s });
  const zoom = (f: string, t: string) => setQuery({ range: null, from: f, to: t, g: null });

  // ── dashboard + health ──
  const dashboard = shallowRef<MsDashboard | null>(null);
  const dashboardFor = ref<string | null>(null);
  const dashboardAt = ref(0);
  const dashboardError = ref<string | null>(null);
  const dashboardLoading = ref(false);
  const health = shallowRef<MsHealth | null>(null);
  const healthAt = ref(0);
  const healthError = ref<string | null>(null);
  const healthMissing = ref(false);

  const stale = computed(() => !!dashboard.value && dashboardFor.value !== windowKey.value);
  const starting = computed(() => (!!health.value && !health.value.DataLoaded) || (!!dashboardError.value && /still loading/i.test(dashboardError.value)));
  const providerCheckRunning = computed(() => !!health.value?.ProviderCheck && health.value.ProviderCheck.State !== 'complete');
  const profileRefreshRunning = computed(() => !!health.value?.ProfileRefresh && ['queued', 'running'].includes(health.value.ProfileRefresh!.State));
  const busy = computed(() => !!health.value && (!!health.value.CurrentScrape || (health.value.ScrapeQueued ?? 0) > 0 || providerCheckRunning.value || profileRefreshRunning.value));
  const verdict = computed(() => msVerdict(dashboard.value, health.value, now.value));

  const linkState = computed<'live' | 'paused' | 'starting' | 'stale' | 'offline' | 'connecting'>(() => {
    if (!prefs.value.live) return 'paused';
    if (starting.value) return 'starting';
    if (healthError.value && !health.value) return 'offline';
    if (healthError.value) return 'stale';
    if (!health.value) return 'connecting';
    return 'live';
  });

  let mainController: AbortController | null = null;

  function applyDashboard(status: number, body: any, key: string) {
    if (status === 200 && body && typeof body === 'object' && body.Kpis) {
      dashboard.value = body as MsDashboard;
      dashboardFor.value = key;
      dashboardAt.value = Date.now();
      dashboardError.value = null;
    } else if (status) {
      dashboardError.value = errorOf(status, body);
    }
  }

  function applyHealth(status: number, body: any) {
    if (status === 200 && body && typeof body === 'object' && 'DataLoaded' in body) {
      health.value = body as MsHealth;
      healthAt.value = Date.now();
      healthError.value = null;
      healthMissing.value = false;
    } else {
      healthMissing.value = status === 404;
      healthError.value = status === 404 ? 'This server runs a MemeScraper build without health reporting.' : errorOf(status, body);
    }
  }

  /** Dashboard and health together (one request). Falls back to two GETs if /batch is unavailable. */
  async function loadMain() {
    if (!allowed.value.health) return;
    mainController?.abort();
    const mine = new AbortController();
    mainController = mine;
    const key = windowKey.value;
    const dashPath = `/memescraper/dashboard${qs(params.value)}`;
    const healthPath = '/memescraper/scraperHealth';
    dashboardLoading.value = true;
    try {
      let items = new Map<string, any>();
      try { items = await RequestBatchFromKliveAPI([dashPath, healthPath], mine.signal); } catch { /* fall back below */ }
      if (mine.signal.aborted) return;
      if (items.size) {
        const d = items.get(dashPath);
        const h = items.get(healthPath);
        applyHealth(h?.status ?? 0, readBody(h?.body));
        if (key === windowKey.value) applyDashboard(d?.status ?? 0, readBody(d?.body), key);
      } else {
        const [d, h] = await Promise.all([getJson<MsDashboard>(dashPath, mine.signal), getJson<MsHealth>(healthPath, mine.signal)]);
        if (mine.signal.aborted) return;
        applyHealth(h.status, h.ok ? h.data : { error: h.error });
        if (key === windowKey.value) applyDashboard(d.status, d.ok ? d.data : { error: d.error }, key);
      }
    } catch (e) {
      if ((e as any)?.name !== 'AbortError') dashboardError.value = e instanceof Error ? e.message : String(e);
    } finally {
      if (mainController === mine) dashboardLoading.value = false;
    }
  }

  async function loadHealth() {
    const h = await getJson<MsHealth>('/memescraper/scraperHealth').catch(() => null);
    if (h) applyHealth(h.status, h.ok ? h.data : { error: h.error });
  }

  // ── library ──
  const library = reactive({
    rows: [] as MsReel[], filtered: 0, total: 0, loading: false, error: null as string | null, key: '', done: false,
    minViews: null as number | null, via: null as string | null,
  });
  const libraryParams = computed<Query>(() => ({
    ...params.value,
    // The library's natural scope is everything ever saved; a picked window narrows it.
    range: custom.value ? null : (str('range') ? preset.value : 'all'),
    q: search.value || null,
    sort: prefs.value.libSort,
    dir: prefs.value.libAsc ? 'asc' : null,
    minViews: library.minViews,
    via: library.via,
    limit: MEME_LIBRARY_PAGE,
  }));
  let libraryController: AbortController | null = null;

  async function loadLibrary(reset = true) {
    if (!allowed.value.read) return;
    const key = JSON.stringify(libraryParams.value);
    if (!reset && (library.loading || library.done || key !== library.key)) return;
    libraryController?.abort();
    const mine = new AbortController();
    libraryController = mine;
    library.loading = true;
    if (reset) { library.key = key; library.error = null; }
    try {
      const offset = reset ? 0 : library.rows.length;
      const answer = await getJson<MsReelPage>(`/memescraper/reels${qs({ ...libraryParams.value, offset })}`, mine.signal);
      if (mine.signal.aborted) return;
      if (answer.ok && answer.data) {
        library.rows = reset ? answer.data.Rows : [...library.rows, ...answer.data.Rows];
        library.filtered = answer.data.Filtered;
        library.total = answer.data.Total;
        library.done = library.rows.length >= answer.data.Filtered || answer.data.Rows.length === 0;
        library.error = null;
      } else {
        library.error = answer.error;
      }
    } catch (e) {
      if ((e as any)?.name !== 'AbortError') library.error = e instanceof Error ? e.message : String(e);
    } finally {
      if (libraryController === mine) library.loading = false;
    }
  }

  // ── scrape log ──
  const log = reactive({ page: null as MsScrapePage | null, loading: false, error: null as string | null, status: 'all', trigger: 'all', offset: 0 });
  async function loadLog() {
    log.loading = true;
    const answer = await getJson<MsScrapePage>(`/memescraper/scrapeHistory${qs({ ...params.value, status: log.status === 'all' ? null : log.status, trigger: log.trigger === 'all' ? null : log.trigger, offset: log.offset, limit: LOG_PAGE })}`).catch(() => null);
    log.loading = false;
    if (!answer) return;
    if (answer.ok) { log.page = answer.data; log.error = null; } else log.error = answer.error;
  }
  const setLog = (patch: Partial<{ status: string; trigger: string; offset: number }>) => {
    Object.assign(log, { offset: 0, ...patch });
    void loadLog();
  };

  // ── one source ──
  const sheetUser = ref<string | null>(null);
  const sheet = reactive({ reels: [] as MsReel[], scrapes: [] as MsScrape[], loading: false, error: null as string | null });
  const sheetSource = computed<MsSource | null>(() => {
    const u = sheetUser.value?.toLowerCase();
    return u ? dashboard.value?.Sources.find(s => s.Username.toLowerCase() === u) ?? null : null;
  });

  async function loadSheet() {
    const user = sheetUser.value;
    if (!user) return;
    sheet.loading = true;
    const reelsPath = `/memescraper/reels${qs({ ...params.value, range: 'all', from: null, to: null, sources: user, niche: null, sort: 'views', limit: 8 })}`;
    const logPath = `/memescraper/scrapeHistory${qs({ sources: user, range: 'all', limit: 10, tz })}`;
    let items = new Map<string, any>();
    try { items = await RequestBatchFromKliveAPI([reelsPath, logPath]); } catch { /* below */ }
    if (sheetUser.value !== user) return;
    let reels: any = items.get(reelsPath);
    let scrapes: any = items.get(logPath);
    if (!items.size) {
      const [r, s] = await Promise.all([getJson<MsReelPage>(reelsPath), getJson<MsScrapePage>(logPath)]);
      reels = { status: r.status, body: r.data };
      scrapes = { status: s.status, body: s.data };
    }
    const rb = readBody(reels?.body);
    const sb = readBody(scrapes?.body);
    sheet.reels = reels?.status === 200 ? rb?.Rows ?? [] : [];
    sheet.scrapes = scrapes?.status === 200 ? sb?.Rows ?? [] : [];
    sheet.error = reels?.status === 200 ? null : errorOf(reels?.status ?? 0, rb);
    sheet.loading = false;
  }

  function openSource(username: string) {
    sheetUser.value = username.replace(/^@/, '');
    sheet.reels = [];
    sheet.scrapes = [];
    void loadSheet();
  }
  const closeSource = () => { sheetUser.value = null; };

  // ── one reel ──
  const viewer = reactive({
    id: null as string | null, list: [] as string[], detail: null as MsReelDetail | null, loading: false, error: null as string | null,
    video: null as string | null, videoState: 'idle' as 'idle' | 'loading' | 'ready' | 'missing' | 'error',
  });
  let videoController: AbortController | null = null;

  function dropVideo() {
    videoController?.abort();
    if (viewer.video) URL.revokeObjectURL(viewer.video);
    viewer.video = null;
    viewer.videoState = 'idle';
  }

  async function openReel(id: string, list?: string[]) {
    dropVideo();
    viewer.id = id;
    if (list) viewer.list = list;
    viewer.detail = null;
    viewer.error = null;
    viewer.loading = true;
    const answer = await getJson<MsReelDetail>(`/memescraper/reel${qs({ postId: id })}`);
    if (viewer.id !== id) return;
    viewer.loading = false;
    if (!answer.ok || !answer.data) { viewer.error = answer.error; return; }
    viewer.detail = answer.data;
    if (answer.data.Reel.VideoExists === false) { viewer.videoState = 'missing'; return; }
    viewer.videoState = 'loading';
    const mine = new AbortController();
    videoController = mine;
    try {
      const response = await RequestGETFromKliveAPI(`/memescraper/reelVideo${qs({ postId: id })}`, false, false, {}, mine.signal);
      if (viewer.id !== id || mine.signal.aborted) return;
      if (!response.ok) { viewer.videoState = response.status === 404 ? 'missing' : 'error'; return; }
      viewer.video = URL.createObjectURL(await response.blob());
      viewer.videoState = 'ready';
    } catch {
      if (viewer.id === id && !mine.signal.aborted) viewer.videoState = 'error';
    }
  }

  function stepReel(delta: number) {
    if (!viewer.id || !viewer.list.length) return;
    const at = viewer.list.indexOf(viewer.id);
    const next = viewer.list[at + delta];
    if (next) void openReel(next);
  }

  function closeReel() {
    dropVideo();
    viewer.id = null;
    viewer.detail = null;
  }

  // ── toasts ──
  const toasts = ref<MemeToast[]>([]);
  let toastId = 0;
  function notify(tone: MemeToast['tone'], text: string, action?: MemeToast['action']) {
    const id = ++toastId;
    toasts.value = [...toasts.value.slice(-3), { id, tone, text, action }];
    window.setTimeout(() => dismissToast(id), tone === 'crit' ? 9_000 : 4_500);
  }
  const dismissToast = (id: number) => { toasts.value = toasts.value.filter(t => t.id !== id); };

  /** Reports a failed action, unless it was a 401/403 (the site's access layer already says so). */
  function failed(what: string, answer: Answer<unknown>) {
    if (answer.status === 401 || answer.status === 403) return;
    notify('crit', `${what}: ${answer.error ?? 'failed'}`);
  }

  // ── polling ──
  let timer: number | null = null;
  let clock: number | null = null;
  let stopped = false;
  let wasBusy = false;
  let wasStarting = false;

  function schedule(ms: number) {
    if (stopped) return;
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(tick, ms);
  }

  async function tick() {
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    if (!prefs.value.live || hidden) { schedule(busy.value ? 4_000 : 30_000); return; }
    await loadHealth();
    const ready = !!health.value?.DataLoaded;
    // A run just ended, or the service has finished loading (the dashboard answered 503 meanwhile, so
    // `starting` stays true until it is asked again), or the figures are two minutes old: fetch them.
    if ((wasBusy && !busy.value) || (ready && (wasStarting || (!!dashboardError.value && !dashboard.value))) || Date.now() - dashboardAt.value > 120_000) {
      await refreshData();
    }
    wasBusy = busy.value;
    wasStarting = starting.value;
    schedule(busy.value || starting.value ? 4_000 : 30_000);
  }

  /** Reload whatever is on screen: the dashboard, and the open view's list and sheet. */
  async function refreshData() {
    await loadMain();
    if (view.value === 'library') void loadLibrary(true);
    if (view.value === 'activity') void loadLog();
    if (sheetUser.value) void loadSheet();
  }

  function refreshAll() {
    void refreshData();
  }

  /** After starting a scrape or check: poll fast at once, so progress shows live. */
  function workStarted() {
    wasBusy = true;
    schedule(1_200);
  }

  function setLive(live: boolean) {
    prefs.value = { ...prefs.value, live };
    if (live) { void refreshData(); schedule(30_000); }
  }

  function onVisible() {
    if (document.visibilityState === 'visible' && prefs.value.live && Date.now() - healthAt.value > 25_000) void tick();
  }

  watch(windowKey, () => {
    void loadMain();
    if (view.value === 'library') void loadLibrary(true);
    if (view.value === 'activity') { log.offset = 0; void loadLog(); }
  });
  watch(() => JSON.stringify(libraryParams.value), () => { if (view.value === 'library') void loadLibrary(true); });
  watch(view, v => {
    if (v === 'library' && (!library.rows.length || library.key !== JSON.stringify(libraryParams.value))) void loadLibrary(true);
    if (v === 'activity') void loadLog();
  });

  onMounted(() => {
    now.value = Date.now();
    clock = window.setInterval(() => { now.value = Date.now(); }, 15_000);
    document.addEventListener('visibilitychange', onVisible);
    void loadMain().then(() => {
      wasBusy = busy.value;
      wasStarting = starting.value;
      schedule(busy.value || starting.value ? 4_000 : 30_000);
    });
    if (view.value === 'library') void loadLibrary(true);
    if (view.value === 'activity') void loadLog();
  });

  onBeforeUnmount(() => {
    stopped = true;
    if (timer) window.clearTimeout(timer);
    if (clock) window.clearInterval(clock);
    document.removeEventListener('visibilitychange', onVisible);
    mainController?.abort();
    libraryController?.abort();
    dropVideo();
    releaseThumbs();
  });

  // ───────────────────────────── actions ─────────────────────────────

  const pending = reactive<Record<string, boolean>>({});

  async function scrapeNow(source?: { AccountID: string | null; Username: string }) {
    const key = source ? `scrape:${source.Username}` : 'scrape:all';
    pending[key] = true;
    const query = source ? (source.AccountID ? { sourceAccountID: source.AccountID } : { username: source.Username }) : {};
    const answer = await postJson<{ queued: string[] }>(`/memescraper/scrapeNow${qs(query)}`);
    pending[key] = false;
    if (answer.status === 202 || answer.ok) {
      const count = answer.data?.queued?.length ?? 1;
      notify('ok', source ? `Scraping @${source.Username}…` : `Queued ${count} source${count === 1 ? '' : 's'}; they run one at a time`);
      workStarted();
      void loadHealth();
      return true;
    }
    failed('Scrape not started', answer);
    return false;
  }

  async function checkProviders(username: string) {
    pending.check = true;
    const answer = await postJson(`/memescraper/diagnoseProviders${qs({ username: username.replace(/^@/, '').trim() })}`);
    pending.check = false;
    if (answer.status === 202 || answer.status === 409) {
      notify(answer.status === 409 ? 'info' : 'ok', answer.status === 409 ? 'A provider check is already running' : `Checking both providers on @${username.replace(/^@/, '')}…`);
      workStarted();
      void loadHealth();
      return true;
    }
    failed('Check not started', answer);
    return false;
  }

  async function refreshProfile(source: MsSource) {
    if (!source.AccountID) return;
    pending[`profile:${source.Username}`] = true;
    const answer = await postJson(`/memescraper/refreshSourceProfile${qs({ sourceAccountID: source.AccountID })}`);
    pending[`profile:${source.Username}`] = false;
    if (answer.status === 202) { notify('ok', `Refreshing @${source.Username}'s profile…`); workStarted(); return; }
    if (answer.status === 409) { notify('info', answer.error ?? 'A profile refresh is already running'); return; }
    failed('Profile not refreshed', answer);
  }

  async function updateSource(source: MsSource, patch: { downloadReels?: boolean; niches?: string[]; scrapeSoon?: boolean }, quiet = false) {
    if (!source.AccountID) return false;
    pending[`edit:${source.Username}`] = true;
    const answer = await postJson('/memescraper/updateInstagramSource', { accountId: source.AccountID, ...patch });
    pending[`edit:${source.Username}`] = false;
    if (!answer.ok) { failed(`@${source.Username} not saved`, answer); return false; }
    if (!quiet) {
      notify('ok', patch.downloadReels === false ? `Paused @${source.Username}` : patch.downloadReels === true ? `Resumed @${source.Username}; it is scraped shortly` : patch.niches ? `Saved @${source.Username}'s niches` : `Saved @${source.Username}`);
    }
    if (patch.downloadReels === true || patch.scrapeSoon) workStarted();
    return true;
  }

  /** Pauses or resumes several sources, one request each, and reloads once. */
  async function setPaused(usernames: string[], paused: boolean) {
    const rows = (dashboard.value?.Sources ?? []).filter(s => s.AccountID && usernames.some(u => u.toLowerCase() === s.Username.toLowerCase()));
    pending.bulk = true;
    let done = 0;
    for (const row of rows) {
      if (row.DownloadReels === !paused) { done++; continue; }
      if (await updateSource(row, { downloadReels: !paused }, true)) done++;
    }
    pending.bulk = false;
    if (done) {
      const undo = () => { void setPaused(rows.map(r => r.Username), !paused); };
      notify('ok', `${paused ? 'Paused' : 'Resumed'} ${done} source${done === 1 ? '' : 's'}`, { label: 'Undo', run: undo });
    }
    await loadMain();
    return done;
  }

  async function removeSource(source: MsSource, deleteReels: boolean) {
    if (!source.AccountID) return false;
    pending[`remove:${source.Username}`] = true;
    const answer = await postJson<{ removed: string; reelsDeleted: number }>('/memescraper/removeInstagramSource', { accountId: source.AccountID, deleteReels });
    pending[`remove:${source.Username}`] = false;
    if (!answer.ok) { failed(`@${source.Username} not removed`, answer); return false; }
    notify('ok', deleteReels ? `Removed @${source.Username} and ${msCount(answer.data?.reelsDeleted ?? 0)} reels` : `Removed @${source.Username}; its reels stay in the library`);
    if (sheetUser.value?.toLowerCase() === source.Username.toLowerCase()) closeSource();
    await loadMain();
    return true;
  }

  async function addSource(input: { username: string; niches: string[]; downloadReels: boolean }) {
    pending.add = true;
    const answer = await postJson('/memescraper/addInstagramSource', { username: input.username, downloadReels: input.downloadReels, downloadPosts: false, niches: input.niches });
    pending.add = false;
    if (!answer.ok) { failed('Source not added', answer); return false; }
    notify('ok', `Looking up @${input.username}; it appears here in a minute or two`);
    workStarted();
    return true;
  }

  async function saveSettings(patch: { paused?: boolean; intervalHours?: number; maxPagesPerScrape?: number }) {
    pending.settings = true;
    const answer = await postJson('/memescraper/saveSettings', patch);
    pending.settings = false;
    if (!answer.ok) { failed('Settings not saved', answer); return false; }
    notify('ok', patch.paused === true ? 'Scheduled scrapes paused' : patch.paused === false ? 'Scheduled scrapes resumed' : 'Schedule saved');
    await loadHealth();
    return true;
  }

  async function downloadPath(path: string, fileName: string) {
    try {
      const response = await RequestGETFromKliveAPI(path, false, false);
      if (!response.ok) { notify('crit', `Download failed (HTTP ${response.status})`); return false; }
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      return true;
    } catch (e) {
      notify('crit', `Download failed: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }

  function exportCsv() {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    void downloadPath(`/memescraper/reels${qs({ ...libraryParams.value, limit: null, format: 'csv' })}`, `memescraper-reels-${stamp}.csv`)
      .then(ok => { if (ok) notify('ok', 'CSV saved'); });
  }

  function downloadReel(reel: MsReel) {
    void downloadPath(`/memescraper/reelVideo${qs({ postId: reel.PostID })}`, `reel-${reel.Owner}-${reel.ShortCode ?? reel.PostID}.mp4`);
  }

  return {
    tz, allowed, now, prefs,
    view, preset, shownPreset, from, to, custom, granularity, filterSources, filterNiche, hasFilters, search, sourceState, params,
    setView, setPreset, setCustom, setGranularity, setSources, toggleSource, setNiche, clearFilters, setSearch, setSourceState, zoom,
    dashboard, dashboardError, dashboardLoading, stale, health, healthError, healthMissing, healthAt, starting, busy, verdict, linkState,
    providerCheckRunning, profileRefreshRunning,
    library, loadLibrary, log, loadLog, setLog,
    sheetUser, sheet, sheetSource, openSource, closeSource,
    viewer, openReel, stepReel, closeReel,
    toasts, notify, dismissToast,
    pending, scrapeNow, checkProviders, refreshProfile, updateSource, setPaused, removeSource, addSource, saveSettings, exportCsv, downloadReel,
    refreshAll, setLive, loadMain,
    thumbs: { request: requestThumb },
  };
}

function msCount(n: number) { return n.toLocaleString('en-GB'); }

export type MemeConsole = ReturnType<typeof createMemeConsole>;
const MEME_CONSOLE: InjectionKey<MemeConsole> = Symbol('meme-console');

/** Called once by pages/schemery/memescraper/index.vue. */
export function provideMemeConsole(): MemeConsole {
  const c = createMemeConsole();
  provide(MEME_CONSOLE, c);
  return c;
}

/** For the console's components. */
export function useMemeConsole(): MemeConsole {
  const c = inject(MEME_CONSOLE, null);
  if (!c) throw new Error('useMemeConsole() is only available inside the MemeScraper console');
  return c;
}
