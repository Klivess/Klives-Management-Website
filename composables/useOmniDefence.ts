import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { RequestBatchFromKliveAPI, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI, type KliveBatchItem } from '~/scripts/APIInterface';
import { useCurrentProfile } from '~/composables/useCurrentProfile';
import {
  DEFAULT_CLASSES, buildQuery, computeVerdict, decodeIpMap, mergeClasses, normalizeAuth, normalizeEvent, normalizeHoneypot,
  normalizeIp, normalizeProfileAction, normalizeRegion, normalizeRequest, normalizeReviewItem, normalizeScan, readHourly, readStarting,
  type ClassInfo, type DefenceAuthEvent, type DefenceEvent, type DefenceHoneypot, type DefenceIp, type DefenceOverview,
  type DefenceProfileAction, type DefenceRegion, type DefenceRequest, type DefenceStatus, type HourBucket, type StartupState,
} from '~/scripts/omniDefence';

/**
 * State for the OmniDefence console: what the server knows about the site's visitors, how fresh it
 * is, and what Klives can do about any one of them. One instance per page visit.
 *
 * Request tiers. The overview is rebuilt by the server every 15 s, so it is read every 15 s, in one
 * /batch with the blocked regions and the open tab's list. Every known IP (the map and the address
 * table, searched in the browser) moves slowly and is read once a minute. An open IP is re-read every
 * 30 s. Nothing at all is requested while the tab is hidden: the old page polled all night from a
 * background tab, 600 requests an hour and the 335 KB map every minute.
 */

const FAST_MS = 15_000;
const MAP_MS = 60_000;
/** Between full reads of the map, only the addresses that changed are asked for. */
const MAP_FULL_MS = 10 * 60_000;
const EVENTS_PATH = '/omnidefence/events?limit=100';
const DETAIL_MS = 30_000;
const SLOW_MS = 60_000;
const REQUEST_TIMEOUT_MS = 20_000;
const PREFS_KEY = 'odx:prefs';

export type DefenceTab = 'traffic' | 'addresses' | 'review' | 'auth' | 'profiles' | 'events' | 'traps' | 'fingerprint';
export const TABS: { id: DefenceTab; label: string; icon: string; permission: string }[] = [
  { id: 'traffic', label: 'Traffic', icon: 'activity', permission: 'omnidefence.traffic.read' },
  { id: 'addresses', label: 'Addresses', icon: 'globe', permission: 'omnidefence.overview.view' },
  { id: 'review', label: 'Review', icon: 'flag', permission: 'omnidefence.overview.view' },
  { id: 'auth', label: 'Sign-ins', icon: 'key', permission: 'omnidefence.auth.read' },
  { id: 'profiles', label: 'Profile actions', icon: 'user', permission: 'omnidefence.auth.read' },
  { id: 'events', label: 'Actions', icon: 'bolt', permission: 'omnidefence.traffic.read' },
  { id: 'traps', label: 'Traps & regions', icon: 'trap', permission: 'omnidefence.honeypots.manage' },
  { id: 'fingerprint', label: 'Fingerprinting', icon: 'fingerprint', permission: 'omnidefence.overview.view' },
];

export type LinkState = 'connecting' | 'live' | 'paused' | 'stale' | 'offline' | 'starting';
export type MapColour = 'class' | 'status';

export interface DefenceToast {
  id: number;
  tone: 'ok' | 'warn' | 'crit' | 'info';
  text: string;
  action?: { label: string; run: () => unknown };
}

export interface TrafficFilter { ip: string; profile: string; route: string; status: string; method: string; origin: string; denyOnly: boolean; offset: number }
export interface AuthFilter { ip: string; profile: string; type: string; offset: number }
export interface ProfileFilter { profile: string; category: string; offset: number }

interface Prefs {
  live: boolean;
  tab: DefenceTab;
  colour: MapColour;
  hiddenClasses: string[];
  mapOpen: boolean;
  lastReason: string;
}

const DEFAULT_PREFS: Prefs = { live: true, tab: 'traffic', colour: 'class', hiddenClasses: [], mapOpen: true, lastReason: '' };

/** Rows per page for the server-side lists. 250 matches the request list the server keeps warm. */
export const TRAFFIC_LIMIT = 250;
export const AUTH_LIMIT = 200;
export const PROFILE_LIMIT = 200;

export interface IpDetail {
  ip: string;
  record: DefenceIp | null;
  recent: DefenceRequest[];
  events: DefenceEvent[];
  auth: DefenceAuthEvent[];
  fingerprint: any | null;
  intel: any | null;
  rdns: any | null;
  abuse: any | null;
  greyNoise: any | null;
  devices: Array<{ device_id: string; beacons: number; first_seen?: number; last_seen?: number }>;
  linkedIps: Array<{ device_id: string; ip: string }>;
  loadedAt: number;
}

function parseBody<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value !== 'string') return value as T;
  const trimmed = value.trim();
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return null;
  try { return JSON.parse(trimmed) as T; } catch { return null; }
}

function readStored<T extends object>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch { return fallback; }
}

const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

export function useOmniDefence() {
  const profile = useCurrentProfile();
  const can = (key: string) => profile.can(key);
  const allowed = computed(() => ({
    overview: can('omnidefence.overview.view'),
    traffic: can('omnidefence.traffic.read'),
    auth: can('omnidefence.auth.read'),
    act: can('omnidefence.ip.act'),
    block: can('omnidefence.ip.block'),
    regions: can('omnidefence.regions.manage'),
    honeypots: can('omnidefence.honeypots.manage'),
    export: can('omnidefence.data.export'),
    settings: can('omnidefence.settings.manage'),
  }));
  const tabs = computed(() => TABS.filter(tab => can(tab.permission)));

  // ── what the server said ──
  const overview = shallowRef<DefenceOverview | null>(null);
  const status = shallowRef<DefenceStatus | null>(null);
  const startup = shallowRef<StartupState | null>(null);
  const classes = shallowRef<ClassInfo[]>(DEFAULT_CLASSES.map(c => ({ ...c })));
  const ipIndex = shallowRef<Map<string, DefenceIp>>(new Map());
  const regions = shallowRef<DefenceRegion[]>([]);
  const honeypots = shallowRef<DefenceHoneypot[] | null>(null);
  const fpStatus = shallowRef<any | null>(null);
  const thresholds = shallowRef<{ autoWatchScore: number; autoBlockScore: number; escalation2: number; escalation3: number } | null>(null);
  const traffic = shallowRef<DefenceRequest[]>([]);
  const authEvents = shallowRef<DefenceAuthEvent[]>([]);
  const profileActions = shallowRef<DefenceProfileAction[]>([]);
  /** Server-wide IP events, on servers that offer /omnidefence/events; null when the route is absent. */
  const eventFeed = shallowRef<DefenceEvent[] | null>(null);
  const eventCounts = shallowRef<Record<string, number> | null>(null);
  const eventsSupported = ref(true);
  /** False on a server without /omnidefence/ip-map/compact: the full records are read instead. */
  const compactSupported = ref(true);
  const lastScan = shallowRef<ReturnType<typeof normalizeScan> | null>(null);

  // ── freshness ──
  const now = ref(Date.now());
  const ready = ref(false);
  const hidden = ref(false);
  const lastOkAt = ref<number | null>(null);
  const failures = ref(0);
  const busy = ref<Record<string, boolean>>({});
  /** The server answered "Route not found" for the overview: OmniDefence has not registered its routes. */
  const routesMissing = ref(false);
  const missingSince = ref<number | null>(null);
  const mapLoadedAt = ref(0);
  const mapCompact = ref(false);
  const errors = ref<Record<string, string>>({});

  // ── what Klives is looking at ──
  const prefs = ref<Prefs>({ ...DEFAULT_PREFS });
  const selectedIp = ref<string | null>(null);
  const detail = shallowRef<IpDetail | null>(null);
  const detailLoading = ref(false);
  const trafficFilter = ref<TrafficFilter>({ ip: '', profile: '', route: '', status: '', method: '', origin: '', denyOnly: false, offset: 0 });
  const authFilter = ref<AuthFilter>({ ip: '', profile: '', type: '', offset: 0 });
  const profileFilter = ref<ProfileFilter>({ profile: '', category: '', offset: 0 });
  /** IPs with an action in flight, so their buttons can say so. */
  const pending = ref<Record<string, string>>({});
  const toasts = ref<DefenceToast[]>([]);
  let toastId = 0;

  function notify(tone: DefenceToast['tone'], text: string, action?: DefenceToast['action'], ms = 6_000) {
    const id = ++toastId;
    toasts.value = [...toasts.value, { id, tone, text, action }];
    window.setTimeout(() => dismissToast(id), ms);
  }
  function dismissToast(id: number) {
    toasts.value = toasts.value.filter(toast => toast.id !== id);
  }

  const ips = computed(() => [...ipIndex.value.values()]);
  const hourly = computed<HourBucket[] | null>(() => readHourly(overview.value?.hourly));
  const review = computed(() => {
    const r = overview.value?.review;
    if (!r) return null;
    return {
      hostileAnsweredCount: Number(r.hostileAnsweredCount ?? 0) || 0,
      hostileAnswered: (r.hostileAnswered ?? []).map(normalizeReviewItem),
      benignPenalisedCount: Number(r.benignPenalisedCount ?? 0) || 0,
      benignPenalised: (r.benignPenalised ?? []).map(normalizeReviewItem),
    };
  });
  /** Recent actions: the server-wide feed if the server has one, else what the overview carries. */
  const recentEvents = computed<DefenceEvent[] | null>(() => {
    if (eventFeed.value) return eventFeed.value;
    const carried = overview.value?.recentEvents;
    return Array.isArray(carried) ? carried.map(normalizeEvent) : null;
  });

  const linkState = computed<LinkState>(() => {
    if (routesMissing.value || startup.value?.ready === false) return 'starting';
    if (!prefs.value.live) return 'paused';
    if (!ready.value) return 'connecting';
    if (failures.value >= 3) return 'offline';
    if (lastOkAt.value && now.value - lastOkAt.value > FAST_MS * 3) return 'stale';
    return 'live';
  });

  const verdict = computed(() => computeVerdict({
    overview: overview.value,
    status: status.value,
    startup: startup.value,
    routesMissing: routesMissing.value,
    missingForSeconds: missingSince.value ? (now.value - missingSince.value) / 1000 : null,
    fingerprint: fpStatus.value,
    hourly: hourly.value,
    nowMs: now.value,
  }));

  // ───────────────────────────── requests ─────────────────────────────

  async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try { return await run(controller.signal); } finally { window.clearTimeout(timer); }
  }

  function setBusy(key: string, value: boolean) {
    busy.value = { ...busy.value, [key]: value };
  }

  /**
   * GET with the read-snapshot contract: 202 means the server has queued the query and will have it
   * in a moment, so ask again shortly, a few times, rather than spinning for 15 seconds.
   */
  async function getJson<T>(path: string, attempts = 5): Promise<{ status: number; body: T | null; text: string }> {
    let delay = 600;
    for (let attempt = 0; ; attempt++) {
      const response = await withTimeout(signal => RequestGETFromKliveAPI(path, false, false, {}, signal));
      const text = await response.text();
      if (response.status === 202 && attempt < attempts - 1) {
        await sleep(delay);
        delay = Math.min(2_000, delay * 1.6);
        continue;
      }
      return { status: response.status, body: response.ok ? parseBody<T>(text) : parseBody<T>(text), text };
    }
  }

  function isRouteMissing(status: number, text: string | undefined): boolean {
    return status === 404 && /route not found/i.test(text ?? '');
  }

  function applyOverview(item: { status: number; body: unknown; text?: string } | undefined) {
    if (!item) return;
    if (isRouteMissing(item.status, item.text ?? (typeof item.body === 'string' ? item.body : JSON.stringify(item.body ?? '')))) {
      if (!routesMissing.value) missingSince.value = Date.now();
      routesMissing.value = true;
      return;
    }
    routesMissing.value = false;
    missingSince.value = null;
    const body = parseBody<DefenceOverview & { pending?: boolean }>(item.body);
    const starting = item.status === 503 ? readStarting(body) : null;
    if (starting) { startup.value = { ...(startup.value ?? {}), ...starting }; return; }
    if (item.status === 200 && body && typeof body === 'object' && !body.pending) {
      overview.value = body;
      if (startup.value?.ready === false) startup.value = { ...startup.value, ready: true };
    }
  }

  function batchText(item: KliveBatchItem | undefined): string {
    if (!item) return '';
    return typeof item.body === 'string' ? item.body : JSON.stringify(item.body ?? '');
  }

  function activeListPath(): { key: string; path: string } | null {
    const tab = prefs.value.tab;
    if (tab === 'traffic' && allowed.value.traffic) {
      const f = trafficFilter.value;
      return { key: 'traffic', path: '/omnidefence/requests' + buildQuery({ ip: f.ip.trim(), profile: f.profile.trim(), route: f.route.trim(), status: f.status, method: f.method, origin: f.origin, denyOnly: f.denyOnly ? 1 : '', limit: TRAFFIC_LIMIT, offset: f.offset }) };
    }
    if (tab === 'auth' && allowed.value.auth) {
      const f = authFilter.value;
      return { key: 'auth', path: '/omnidefence/auth-events' + buildQuery({ ip: f.ip.trim(), profile: f.profile.trim(), type: f.type, limit: AUTH_LIMIT, offset: f.offset }) };
    }
    if (tab === 'profiles' && allowed.value.auth) {
      const f = profileFilter.value;
      return { key: 'profiles', path: '/omnidefence/profile-actions' + buildQuery({ profile: f.profile.trim(), category: f.category.trim(), limit: PROFILE_LIMIT, offset: f.offset }) };
    }
    if (tab === 'events' && allowed.value.traffic && eventsSupported.value) return { key: 'events', path: EVENTS_PATH };
    return null;
  }

  function applyList(key: string, item: { status: number; body: unknown; text?: string } | undefined): boolean {
    if (!item) return false;
    if (item.status === 202) return false; // queued: asked again directly below
    // A server from before the feed: the route is missing while the rest of OmniDefence answers.
    if (key === 'events' && item.status === 404 && !routesMissing.value) { eventsSupported.value = false; eventFeed.value = null; return true; }
    if (item.status !== 200) {
      if (item.status !== 403) errors.value = { ...errors.value, [key]: `The server answered ${item.status}` };
      return true;
    }
    const parsed = parseBody<any>(item.body);
    const body: unknown[] | null = Array.isArray(parsed) ? parsed : key === 'events' && Array.isArray(parsed?.events) ? parsed.events : null;
    if (!body) { errors.value = { ...errors.value, [key]: 'The server sent something unreadable' }; return true; }
    const { [key]: _gone, ...rest } = errors.value;
    errors.value = rest;
    if (key === 'traffic') traffic.value = body.map(normalizeRequest);
    else if (key === 'auth') authEvents.value = body.map(normalizeAuth);
    else if (key === 'profiles') profileActions.value = body.map(normalizeProfileAction);
    else if (key === 'events') {
      eventFeed.value = body.map(normalizeEvent);
      if (parsed?.counts24h && typeof parsed.counts24h === 'object') eventCounts.value = parsed.counts24h;
    }
    return true;
  }

  async function refreshList(): Promise<void> {
    const list = activeListPath();
    if (!list) return;
    setBusy(list.key, true);
    try {
      const result = await getJson<unknown>(list.path);
      applyList(list.key, { status: result.status, body: result.body, text: result.text });
    } catch {
      errors.value = { ...errors.value, [list.key]: 'No answer from the server' };
    } finally { setBusy(list.key, false); }
  }

  let fastInFlight = false;

  /** The 15 s tier: overview, regions and the open tab, in one request. */
  async function refreshFast(): Promise<void> {
    if (fastInFlight || !allowed.value.overview) return;
    fastInFlight = true;
    setBusy('fast', true);
    try {
      const list = activeListPath();
      const paths: string[] = ['/omnidefence/overview'];
      // Only worth asking while there is something to explain: no overview, an old one, or no routes.
      const wantStatus = !overview.value || overview.value.stale || routesMissing.value || startup.value?.ready === false;
      if (wantStatus) paths.push('/omnidefence/overview/status');
      if (allowed.value.regions) paths.push('/omnidefence/regions');
      if (list) paths.push(list.path);

      const results = await withTimeout(signal => RequestBatchFromKliveAPI(paths, signal));
      if (!results.size) throw new Error('batch failed');

      const ov = results.get('/omnidefence/overview');
      applyOverview(ov ? { status: ov.status, body: ov.body, text: batchText(ov) } : undefined);

      const st = results.get('/omnidefence/overview/status');
      if (st?.status === 200) {
        const body = parseBody<DefenceStatus>(st.body);
        if (body) {
          status.value = body;
          if (body.startup) startup.value = body.startup;
        }
      }

      const rg = results.get('/omnidefence/regions');
      if (rg?.status === 200) {
        const body = parseBody<unknown[]>(rg.body);
        if (Array.isArray(body)) regions.value = body.map(normalizeRegion);
      }

      if (list) {
        const item = results.get(list.path);
        const done = applyList(list.key, item ? { status: item.status, body: item.body, text: batchText(item) } : undefined);
        if (!done && !routesMissing.value) void refreshList();
      }

      lastOkAt.value = Date.now();
      failures.value = 0;
    } catch {
      failures.value += 1;
    } finally {
      fastInFlight = false;
      setBusy('fast', false);
      ready.value = true;
    }
  }

  let mapInFlight = false;
  let mapFullAt = 0;

  /**
   * Every known IP, for the map and the address table. A server with the compact form answers
   * columns instead of one named object per IP; with `since` it answers only what changed.
   */
  async function refreshMap(force = false): Promise<void> {
    if (mapInFlight || !allowed.value.overview || routesMissing.value) return;
    // Without the compact form every read is the whole record set (megabytes): half as often.
    const every = mapCompact.value || !mapLoadedAt.value ? MAP_MS : MAP_MS * 2;
    if (!force && Date.now() - mapLoadedAt.value < every - 2_000) return;
    mapInFlight = true;
    setBusy('map', true);
    try {
      // Changes only, while the last full read is recent; a full read now and then catches the
      // status changes that leave no timestamp behind (a block by someone else, a region rule).
      const incremental = compactSupported.value && mapCompact.value && ipIndex.value.size > 0 && !force
        && mapLoadedAt.value > 0 && Date.now() - mapFullAt < MAP_FULL_MS;
      const since = Math.floor(mapLoadedAt.value / 1000) - 120;
      let path = compactSupported.value
        ? (incremental ? `/omnidefence/ip-map/compact?since=${since}` : '/omnidefence/ip-map/compact')
        : '/omnidefence/ip-map';
      let result = await getJson<unknown>(path, 3);
      if (compactSupported.value && result.status === 404 && !routesMissing.value) {
        // A server from before the compact form: read the full records.
        compactSupported.value = false;
        path = '/omnidefence/ip-map';
        result = await getJson<unknown>(path, 3);
      }
      if (result.status !== 200 || result.body == null) {
        if (isRouteMissing(result.status, result.text)) { routesMissing.value = true; missingSince.value ??= Date.now(); }
        return;
      }
      const decoded = decodeIpMap(result.body);
      mapCompact.value = decoded.compact;
      if (decoded.compact && !decoded.full && incremental) {
        const next = new Map(ipIndex.value);
        for (const ip of decoded.ips) next.set(ip.ip, ip);
        ipIndex.value = next;
      } else {
        ipIndex.value = new Map(decoded.ips.map(ip => [ip.ip, ip]));
        mapFullAt = Date.now();
      }
      mapLoadedAt.value = Date.now();
      // A changed record that is open in the drawer: show the newer figures.
      if (detail.value && ipIndex.value.has(detail.value.ip)) {
        detail.value = { ...detail.value, record: { ...(detail.value.record ?? {}), ...ipIndex.value.get(detail.value.ip)! } };
      }
    } catch {
      /* the fast tier reports an unreachable API */
    } finally {
      mapInFlight = false;
      setBusy('map', false);
    }
  }

  let slowReadAt = 0;
  let classesLoaded = false;

  /** Once a minute: classes (once), the fingerprinting engine, thresholds, and the traps when open. */
  async function refreshSlow(force = false): Promise<void> {
    if (routesMissing.value || !allowed.value.overview) return;
    if (!force && Date.now() - slowReadAt < SLOW_MS - 2_000) return;
    slowReadAt = Date.now();
    const paths: string[] = ['/omnidefence/fingerprint/status'];
    if (!classesLoaded) paths.push('/omnidefence/classes');
    if (allowed.value.settings) paths.push('/omnidefence/settings');
    // Hit counts here scan the request log per trap: only while the tab that shows them is open.
    if (prefs.value.tab === 'traps' && allowed.value.honeypots) paths.push('/omnidefence/honeypot-routes');
    // The side feed of recent actions; the Actions tab reads the same list every 15 s while open.
    const feed = allowed.value.traffic && eventsSupported.value && prefs.value.tab !== 'events';
    if (feed) paths.push(EVENTS_PATH);
    setBusy('slow', true);
    try {
      const results = await withTimeout(signal => RequestBatchFromKliveAPI(paths, signal));
      if (feed) {
        const ev = results.get(EVENTS_PATH);
        if (ev) applyList('events', { status: ev.status, body: ev.body, text: batchText(ev) });
      }
      const fp = results.get('/omnidefence/fingerprint/status');
      if (fp?.status === 200) fpStatus.value = parseBody(fp.body);
      const cl = results.get('/omnidefence/classes');
      if (cl?.status === 200) {
        classes.value = mergeClasses(parseBody(cl.body));
        classesLoaded = true;
      }
      const st = results.get('/omnidefence/settings');
      if (st?.status === 200) {
        const body = parseBody<any>(st.body);
        if (body) thresholds.value = {
          autoWatchScore: Number(body.autoWatchScore ?? 50),
          autoBlockScore: Number(body.autoBlockScore ?? 200),
          escalation2: Number(body.escalation2 ?? 50),
          escalation3: Number(body.escalation3 ?? 200),
        };
      }
      const hp = results.get('/omnidefence/honeypot-routes');
      if (hp?.status === 200) {
        const body = parseBody<unknown[]>(hp.body);
        if (Array.isArray(body)) honeypots.value = body.map(normalizeHoneypot);
      }
    } catch {
      slowReadAt = 0;
    } finally { setBusy('slow', false); }
  }

  async function loadHoneypots(): Promise<void> {
    if (!allowed.value.honeypots) return;
    setBusy('traps', true);
    try {
      const result = await getJson<unknown[]>('/omnidefence/honeypot-routes', 1);
      if (Array.isArray(result.body)) honeypots.value = result.body.map(normalizeHoneypot);
    } catch { /* shown as not loaded */ } finally { setBusy('traps', false); }
  }

  // ───────────────────────────── one IP ─────────────────────────────

  let detailFor: string | null = null;

  async function loadDetail(ip: string, quiet = false): Promise<void> {
    if (!ip) return;
    detailFor = ip;
    if (!quiet) detailLoading.value = true;
    try {
      const wantsFingerprint = allowed.value.traffic;
      const [main, fp] = await Promise.all([
        allowed.value.traffic ? getJson<any>(`/omnidefence/ip?ip=${encodeURIComponent(ip)}`) : Promise.resolve(null),
        wantsFingerprint ? getJson<any>(`/omnidefence/ip/fingerprint?ip=${encodeURIComponent(ip)}`, 1) : Promise.resolve(null),
      ]);
      if (detailFor !== ip) return; // another IP was opened meanwhile
      const known = ipIndex.value.get(ip) ?? null;
      const body = main?.status === 200 ? main.body : null;
      const fpBody = fp?.status === 200 ? fp.body : null;
      const record = body?.record ? normalizeIp(body.record) : fpBody?.record ? normalizeIp(fpBody.record) : known;
      detail.value = {
        ip,
        record,
        recent: Array.isArray(body?.recentRequests) ? body.recentRequests.map(normalizeRequest) : detail.value?.ip === ip ? detail.value.recent : [],
        events: Array.isArray(body?.events) ? body.events.map(normalizeEvent) : detail.value?.ip === ip ? detail.value.events : [],
        auth: Array.isArray(body?.auth) ? body.auth.map(normalizeAuth) : detail.value?.ip === ip ? detail.value.auth : [],
        fingerprint: fpBody?.fingerprint ?? (detail.value?.ip === ip ? detail.value.fingerprint : null),
        intel: fpBody?.intel ?? null,
        rdns: fpBody?.rdns ?? null,
        abuse: fpBody?.abuse ?? null,
        greyNoise: fpBody?.greyNoise ?? null,
        devices: Array.isArray(fpBody?.devices) ? fpBody.devices : [],
        linkedIps: Array.isArray(fpBody?.linkedIps) ? fpBody.linkedIps : [],
        loadedAt: Date.now(),
      };
      if (record) upsertIp(record);
    } catch {
      if (!quiet) notify('warn', `Could not read ${ip}`);
    } finally {
      if (detailFor === ip) detailLoading.value = false;
    }
  }

  function openIp(ip: string | null | undefined) {
    const value = (ip ?? '').trim();
    if (!value) return;
    selectedIp.value = value;
    if (detail.value?.ip !== value) {
      const known = ipIndex.value.get(value) ?? null;
      detail.value = { ip: value, record: known, recent: [], events: [], auth: [], fingerprint: null, intel: null, rdns: null, abuse: null, greyNoise: null, devices: [], linkedIps: [], loadedAt: 0 };
    }
    lastScan.value = lastScan.value?.ip === value ? lastScan.value : null;
    void loadDetail(value);
  }

  function closeIp() {
    selectedIp.value = null;
    detailFor = null;
  }

  function upsertIp(record: DefenceIp) {
    const next = new Map(ipIndex.value);
    next.set(record.ip, { ...(next.get(record.ip) ?? {}), ...record });
    ipIndex.value = next;
  }

  /** Changes one IP in place (the map, the table and the drawer) before the server confirms it. */
  function patchIp(ip: string, change: Partial<DefenceIp>) {
    const current = ipIndex.value.get(ip);
    if (current) upsertIp({ ...current, ...change });
    if (detail.value?.ip === ip && detail.value.record) {
      detail.value = { ...detail.value, record: { ...detail.value.record, ...change } };
    }
  }

  // ───────────────────────────── actions ─────────────────────────────

  async function post(path: string, body: unknown): Promise<{ ok: boolean; status: number; text: string; json: any }> {
    try {
      const response = await withTimeout(signal => RequestPOSTFromKliveAPI(path, JSON.stringify(body), false, true, signal));
      const text = await response.text();
      return { ok: response.ok, status: response.status, text, json: parseBody<any>(text) };
    } catch (error) {
      return { ok: false, status: 0, text: String(error), json: null };
    }
  }

  function failText(result: { status: number; text: string }): string {
    const text = (result.text || '').trim();
    if (!text) return result.status ? `the server answered ${result.status}` : 'no answer from the server';
    const json = parseBody<any>(text);
    return String(json?.error ?? json?.message ?? text).slice(0, 160);
  }

  /** What an address is set to now: from the records, the open sheet, or the review lists (which can arrive first). */
  function statusOf(ip: string): string {
    return ipIndex.value.get(ip)?.status
      ?? (detail.value?.ip === ip ? detail.value.record?.status : null)
      ?? review.value?.hostileAnswered.find(item => item.ip === ip)?.status
      ?? review.value?.benignPenalised.find(item => item.ip === ip)?.status
      ?? 'Normal';
  }

  async function runIpAction(ip: string, label: string, run: () => Promise<{ ok: boolean; status: number; text: string; json: any }>, optimistic?: Partial<DefenceIp>) {
    const before = ipIndex.value.get(ip) ?? (detail.value?.ip === ip ? detail.value.record : null);
    pending.value = { ...pending.value, [ip]: label };
    if (optimistic) patchIp(ip, optimistic);
    try {
      const result = await run();
      if (!result.ok) {
        if (optimistic && before) patchIp(ip, before);
        notify('crit', `${label} ${ip} failed: ${failText(result)}`);
        return false;
      }
      return result;
    } finally {
      const { [ip]: _done, ...rest } = pending.value;
      pending.value = rest;
      if (selectedIp.value === ip) void loadDetail(ip, true);
    }
  }

  /** Puts an IP back to the status it had, for the Undo on a toast. */
  async function restoreStatus(ip: string, previous: string) {
    if (previous === 'Normal') return release(ip, true);
    return setStatus(ip, previous, true);
  }

  async function block(ip: string, reason: string) {
    const previous = statusOf(ip);
    const text = reason.trim() || 'Manual block';
    prefs.value = { ...prefs.value, lastReason: text };
    const done = await runIpAction(ip, 'Block', () => post('/omnidefence/ip/block', { ip, reason: text }), { status: 'Blocked', lastBlockReason: text });
    if (done) notify('ok', `Blocked ${ip}`, { label: 'Undo', run: () => restoreStatus(ip, previous) });
  }

  async function release(ip: string, quiet = false) {
    const previous = statusOf(ip);
    const done = await runIpAction(ip, 'Release', () => post('/omnidefence/ip/untrap', { ip, reason: 'Released from the OmniDefence console' }), { status: 'Normal', lastBlockReason: null });
    if (done && !quiet) notify('ok', `Released ${ip}`, previous !== 'Normal' ? { label: 'Undo', run: () => restoreStatus(ip, previous) } : undefined);
  }

  async function setStatus(ip: string, next: string, quiet = false) {
    const previous = statusOf(ip);
    const done = await runIpAction(ip, next, () => post('/omnidefence/ip/status', { ip, status: next }), { status: next });
    if (done && !quiet) notify('ok', `${ip} is now ${next === 'Honeypot' ? 'trapped' : next.toLowerCase()}`, { label: 'Undo', run: () => restoreStatus(ip, previous) });
  }

  async function saveNote(ip: string, note: string) {
    const done = await runIpAction(ip, 'Note', () => post('/omnidefence/ip/note', { ip, note }), { notes: note.trim() || null });
    if (done) notify('ok', 'Note saved');
  }

  async function scan(ip: string) {
    const result = await runIpAction(ip, 'Scan', () => post('/omnidefence/ip/scan', { ip }));
    if (result && typeof result === 'object') {
      lastScan.value = { ...normalizeScan(result.json), ip };
      const open = lastScan.value.open.length;
      notify(open ? 'warn' : 'ok', open ? `${ip}: ${open} open port${open === 1 ? '' : 's'}` : `${ip}: no open ports`);
    } else if (result === false) {
      // runIpAction already said why (a 429 means it was scanned within the hour).
    }
  }

  async function reclassify(ip: string | null) {
    const result = await post('/omnidefence/ip/reclassify', ip ? { ip } : { all: true });
    if (!result.ok) { notify('crit', `Reclassify failed: ${failText(result)}`); return; }
    notify('info', ip ? `Reclassifying ${ip}` : 'Reclassifying every IP in the background');
    if (ip && selectedIp.value === ip) window.setTimeout(() => void loadDetail(ip, true), 1_500);
  }

  async function setClass(ip: string, cls: string | null) {
    const result = await runIpAction(ip, 'Label', () => post('/omnidefence/ip/class', { ip, class: cls ?? 'auto' }),
      cls ? { classification: cls, classConfidence: 1 } : undefined);
    if (result) notify('ok', cls ? `${ip} labelled ${classes.value.find(c => c.id === cls)?.label ?? cls}` : `${ip} back to automatic`);
  }

  async function addRegion(box: { latMin: number; latMax: number; lonMin: number; lonMax: number }, reason: string) {
    const result = await post('/omnidefence/regions/add', { ...box, reason: reason.trim() || 'Region block' });
    if (!result.ok) { notify('crit', `Region block failed: ${failText(result)}`); return null; }
    const blocked = Number(result.json?.blockedCount ?? 0);
    notify('ok', `Region blocked${blocked ? `: ${blocked} known address${blocked === 1 ? '' : 'es'} blocked now` : ''}`);
    await Promise.all([refreshFast(), refreshMap(true)]);
    return result.json;
  }

  async function removeRegion(id: number, unblockIps: boolean) {
    const result = await post('/omnidefence/regions/remove', { id, unblockIpsInRegion: unblockIps });
    if (!result.ok) { notify('crit', `Removing the region failed: ${failText(result)}`); return; }
    const freed = Number(result.json?.unblockedCount ?? 0);
    notify('ok', `Region #${id} removed${unblockIps ? `, ${freed} address${freed === 1 ? '' : 'es'} released` : ''}`);
    regions.value = regions.value.filter(region => region.id !== id);
    await Promise.all([refreshFast(), refreshMap(true)]);
  }

  async function addHoneypot(route: string, note: string) {
    const path = route.trim();
    if (!path) return false;
    const result = await post('/omnidefence/honeypot-routes/add', { route: path, note: note.trim() || null });
    if (!result.ok) { notify('crit', `Arming ${path} failed: ${failText(result)}`); return false; }
    notify('ok', `Armed ${path.startsWith('/') ? path : `/${path}`}`);
    await loadHoneypots();
    return true;
  }

  async function removeHoneypot(route: string) {
    const result = await post('/omnidefence/honeypot-routes/remove', { route });
    if (!result.ok) { notify('crit', `Disarming ${route} failed: ${failText(result)}`); return; }
    honeypots.value = (honeypots.value ?? []).filter(trap => trap.route !== route);
    notify('ok', `Disarmed ${route}`);
  }

  async function saveSettings(change: Record<string, unknown>) {
    const result = await post('/omnidefence/settings/update', change);
    if (!result.ok) { notify('crit', `Saving failed: ${failText(result)}`); return false; }
    notify('ok', 'Settings saved');
    await refreshSlow(true);
    return true;
  }

  async function exportTable(table: string) {
    setBusy('export', true);
    try {
      const response = await RequestGETFromKliveAPI(`/omnidefence/export?format=csv&table=${encodeURIComponent(table)}`, false, false);
      if (!response.ok) { notify('crit', `Export failed: the server answered ${response.status}`); return; }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `omnidefence-${table}-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
    } catch {
      notify('crit', 'Export failed: no answer from the server');
    } finally { setBusy('export', false); }
  }

  async function loadRequest(id: number | string): Promise<any | null> {
    try {
      const result = await getJson<any>(`/omnidefence/request?id=${encodeURIComponent(String(id))}`, 1);
      return result.status === 200 ? result.body : null;
    } catch { return null; }
  }

  // ───────────────────────────── timers ─────────────────────────────

  let fastTimer: number | null = null;
  let clockTimer: number | null = null;

  function stopTimers() {
    if (fastTimer != null) window.clearInterval(fastTimer);
    fastTimer = null;
  }

  function startTimers() {
    stopTimers();
    if (hidden.value || !prefs.value.live) return;
    fastTimer = window.setInterval(() => {
      void refreshFast();
      void refreshMap();
      void refreshSlow();
      if (selectedIp.value && detail.value && Date.now() - detail.value.loadedAt >= DETAIL_MS - 2_000) void loadDetail(selectedIp.value, true);
    }, FAST_MS);
  }

  async function refreshAll() {
    await Promise.all([refreshFast(), refreshMap(true), refreshSlow(true)]);
    if (selectedIp.value) void loadDetail(selectedIp.value, true);
  }

  function onVisibility() {
    hidden.value = document.visibilityState === 'hidden';
    if (hidden.value) { stopTimers(); return; }
    now.value = Date.now();
    if (prefs.value.live) {
      void refreshFast();
      void refreshMap();
      void refreshSlow();
    }
    startTimers();
  }

  function setLive(live: boolean) {
    prefs.value = { ...prefs.value, live };
    if (live) void refreshAll();
    startTimers();
  }

  function setTab(tab: DefenceTab) {
    if (prefs.value.tab === tab) return;
    prefs.value = { ...prefs.value, tab };
  }

  watch(() => prefs.value.tab, tab => {
    void refreshList();
    if (tab === 'traps') void loadHoneypots();
    if (tab === 'fingerprint') void refreshSlow(true);
  });

  watch(prefs, value => {
    try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(value)); } catch { /* storage blocked */ }
  }, { deep: true });

  onMounted(async () => {
    const stored = readStored(PREFS_KEY, DEFAULT_PREFS);
    prefs.value = { ...stored, tab: TABS.some(tab => tab.id === stored.tab) ? stored.tab : DEFAULT_PREFS.tab };
    hidden.value = document.visibilityState === 'hidden';
    document.addEventListener('visibilitychange', onVisibility);
    clockTimer = window.setInterval(() => { now.value = Date.now(); }, 1_000);
    await refreshFast();
    void refreshMap(true);
    void refreshSlow(true);
    startTimers();
  });

  onBeforeUnmount(() => {
    stopTimers();
    if (clockTimer != null) window.clearInterval(clockTimer);
    document.removeEventListener('visibilitychange', onVisibility);
  });

  return {
    can, allowed, tabs,
    overview, status, startup, classes, ips, ipIndex, regions, honeypots, fpStatus, thresholds, traffic, authEvents, profileActions,
    recentEvents, eventCounts, eventsSupported, compactSupported, review, hourly, lastScan,
    now, ready, hidden, lastOkAt, busy, routesMissing, missingSince, mapLoadedAt, mapCompact, errors, linkState, verdict,
    prefs, selectedIp, detail, detailLoading, trafficFilter, authFilter, profileFilter, pending, toasts,
    notify, dismissToast, refreshAll, refreshFast, refreshList, refreshMap, refreshSlow, loadHoneypots, setLive, setTab,
    openIp, closeIp, loadDetail, loadRequest,
    block, release, setStatus, saveNote, scan, reclassify, setClass, addRegion, removeRegion, addHoneypot, removeHoneypot, saveSettings, exportTable,
  };
}

export type OmniDefenceConsole = ReturnType<typeof useOmniDefence>;
