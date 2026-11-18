import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import {
  AuthorizationHeaderValue, KliveAPIUrl, ReportXhrAccess, RequestBatchFromKliveAPI, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI,
} from '~/scripts/APIInterface';
import { useCurrentProfile } from '~/composables/useCurrentProfile';
import { useEventStream } from '~/composables/useEventStream';
import { resolvePageAccess, satisfiesRule } from '~/scripts/pageAccess';
import {
  appendSample, bucketRateSeries, downsample, gaugeSeries, isNum, sampleFromStats, samplesFromHistory, trailingRate,
  type AdminHistoryPayload, type AdminStats, type VitalSample,
} from '~/scripts/adminConsole';
import {
  activeMutes, buildPulses, downServices, frecencyMap, latestMailCode, MUTE_MS, orderPulses, seedVisits, serverFindings,
  splitFindings, VISITS_KEY, type HomeFinding, type HomeServer, type HomeSources, type MailCode, type VisitRecord,
} from '~/scripts/home';

/*
 * Home's data: what to read, how often, and the few things it can do.
 *
 * Reads are grouped by how fast their answer changes and how long their slowest member can take, so one
 * slow route never holds the others (the old page put 13 routes in one batch and waited 20 s for
 * MemeScraper after every restart). Nothing is read that the profile's permissions would refuse,
 * nothing at all while the tab is hidden, and the last answers are kept for this tab so coming back
 * to Home paints at once instead of after two round trips.
 */

type Tier = 'core' | 'systems' | 'slow' | 'heavy';

interface RouteDef { path: string; perm: string; tier: Tier }

function viewerZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

const ROUTES = {
  server: { path: '/GeneralBotStatistics/GetFrontpageStats', perm: 'system.status.view', tier: 'core' },
  agentStatus: { path: '/kliveagent/status', perm: 'kliveagent.status.view', tier: 'core' },

  stewards: { path: '/demiurge/list', perm: 'demiurge.overview.view', tier: 'systems' },
  agentStats: { path: '/kliveagent/stats/summary', perm: 'kliveagent.status.view', tier: 'systems' },
  agentNotifications: { path: '/kliveagent/notifications?unreadOnly=true', perm: 'kliveagent.history.read', tier: 'systems' },
  agentJobs: { path: '/kliveagent/jobs?activeOnly=true', perm: 'kliveagent.history.read', tier: 'systems' },
  mail: { path: '/klivemail/stats', perm: 'klivemail.overview.view', tier: 'systems' },
  mailMessages: { path: '/klivemail/messages?page=1&pageSize=8', perm: 'klivemail.messages.read', tier: 'systems' },
  cloud: { path: '/KliveCloud/GetDriveInfo', perm: 'klivecloud.drive.view', tier: 'systems' },
  omniscience: { path: '/omniscience/stats/overview', perm: 'omniscience.overview.view', tier: 'systems' },
  games: { path: '/klivegames/servers', perm: 'klivegames.servers.read', tier: 'systems' },
  gadgets: { path: '/klivetech/GetAllGadgets', perm: 'klivetech.gadgets.read', tier: 'systems' },
  // The KliveLink page's own list: the legacy /klivelink/agents is always empty now.
  linkAgents: { path: '/klivelink/v2/agents', perm: 'klivelink.agents.view', tier: 'systems' },
  gram: { path: '/omnigram/dashboard-stats', perm: 'omnigram.overview.view', tier: 'systems' },
  tumblr: { path: '/omnitumblr/dashboard-stats', perm: 'omnitumblr.overview.view', tier: 'systems' },
  // 9 KB of state, where /cs2arbitragebot/getscanalytics sent 467 KB a minute for three numbers.
  cs2: { path: '/cs2arbitragebot/status', perm: 'cs2.status.view', tier: 'systems' },

  trader: { path: '/api/omnitrader/firm/overview?trendDays=30', perm: 'omnitrader.status.view', tier: 'slow' },
  memes: { path: `/memescraper/summary?tz=${encodeURIComponent(viewerZone())}`, perm: 'memescraper.health.view', tier: 'slow' },
  defence: { path: '/omnidefence/overview', perm: 'omnidefence.overview.view', tier: 'slow' },

  demiurgeOverview: { path: '/demiurge/overview?range=7d', perm: 'demiurge.overview.view', tier: 'heavy' },
  blox: { path: '/omniblox/overview', perm: 'omniblox.overview.view', tier: 'heavy' },
} satisfies Record<string, RouteDef>;

export type HomeKey = keyof typeof ROUTES;

const INTERVAL: Record<Tier, number> = { core: 15_000, systems: 60_000, slow: 60_000, heavy: 180_000 };
const REQUEST_TIMEOUT_MS = 25_000;
const HISTORY_PATH = '/GeneralBotStatistics/History';
const SNAPSHOT_PREFIX = 'km:home:snapshot:v1:';
const PREFS_KEY = 'km:home:prefs:v1';
/** Never kept between visits: a sign-in code belongs on screen while it is fresh, nowhere else. */
const NOT_KEPT = new Set<HomeKey>(['mailMessages']);

export type RouteState = 'ok' | 'denied' | 'missing' | 'starting' | 'failed';

export interface HomePrefs {
  live: boolean;
  mutes: Record<string, number>;
  pagesOpen: boolean;
}

export interface HomeToast { id: number; tone: 'ok' | 'warn' | 'crit' | 'info'; text: string; href?: string; hrefLabel?: string }

// Survives in-app navigation away from Home and back, which is how it is mostly opened.
const memory: { user: string | null; at: number; data: Partial<Record<HomeKey, unknown>>; samples: VitalSample[] } = { user: null, at: 0, data: {}, samples: [] };

function readJson<T>(storage: Storage | undefined, key: string): T | null {
  try { const raw = storage?.getItem(key); return raw ? JSON.parse(raw) as T : null; } catch { return null; }
}
function writeJson(storage: Storage | undefined, key: string, value: unknown) {
  try { storage?.setItem(key, JSON.stringify(value)); } catch { /* full or blocked: the page still works */ }
}

function parseBody(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text || !['{', '['].includes(text[0])) return value;
  try { return JSON.parse(text); } catch { return value; }
}

export function useHome() {
  const current = useCurrentProfile();
  const can = current.can;
  const signedIn = computed(() => current.profile.value != null);
  const userId = computed(() => String(current.profile.value?.userId ?? current.profile.value?.UserID ?? ''));
  const canOpen = (path: string) => satisfiesRule(resolvePageAccess(path).rule, can, signedIn.value);

  const caps = computed(() => ({
    server: can('system.status.view'),
    ask: can('kliveagent.chat.use'),
    upload: can('klivecloud.files.upload'),
    newSteward: can('demiurge.lifecycle.manage') && canOpen('/demiurge/new'),
    restart: can('system.services.control'),
    fleet: can('demiurge.fleet.control'),
    safeMode: can('omnitrader.risk.manage'),
    mailCodes: can('klivemail.messages.read'),
    stewardStream: can('demiurge.events.stream'),
    seedVisits: can('profiles.activity.read'),
  }));

  // ── state ──
  const data = reactive<Partial<Record<HomeKey, unknown>>>({});
  const status = reactive<Partial<Record<HomeKey, RouteState>>>({});
  const at = reactive<Record<Tier, number>>({ core: 0, systems: 0, slow: 0, heavy: 0 });
  const busy = reactive<Record<Tier, boolean>>({ core: false, systems: false, slow: false, heavy: false });
  const coreFailingSince = ref<number | null>(null);
  const restored = ref(false);
  const samples = shallowRef<VitalSample[]>([]);
  const historyLoaded = ref(false);
  const now = ref(Date.now());
  const visits = ref<VisitRecord[]>([]);
  const prefs = ref<HomePrefs>({ live: true, mutes: {}, pagesOpen: false });
  const toasts = ref<HomeToast[]>([]);
  const pending = reactive({ upload: false, restart: '' as string, fleet: false, safeMode: false });
  const upload = reactive({ active: false, done: 0, total: 0, percent: 0, name: '' });

  const timers: Partial<Record<Tier, ReturnType<typeof setInterval>>> = {};
  const controllers: Partial<Record<Tier, AbortController>> = {};
  let clock: ReturnType<typeof setInterval> | null = null;
  let disposed = false;
  let started = false;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let fleetDebounce: ReturnType<typeof setTimeout> | null = null;
  let toastSeq = 0;

  const manifest = (tier: Tier) => (Object.keys(ROUTES) as HomeKey[]).filter(key => ROUTES[key].tier === tier && can(ROUTES[key].perm));

  function toast(text: string, tone: HomeToast['tone'] = 'ok', link?: { href: string; label: string }) {
    const id = ++toastSeq;
    toasts.value = [...toasts.value.slice(-3), { id, tone, text, href: link?.href, hrefLabel: link?.label }];
    window.setTimeout(() => dismissToast(id), tone === 'crit' ? 12_000 : 6_000);
  }
  function dismissToast(id: number) { toasts.value = toasts.value.filter(item => item.id !== id); }

  // ── snapshot ──
  function restoreSnapshot() {
    const user = userId.value;
    if (!user) return;
    let source = memory.user === user ? memory : null;
    if (!source || !source.at) {
      const stored = readJson<typeof memory>(typeof sessionStorage !== 'undefined' ? sessionStorage : undefined, SNAPSHOT_PREFIX + user);
      if (stored?.at && Date.now() - stored.at < 6 * 3600_000) source = { ...stored, samples: [] };
    }
    if (!source?.at) return;
    for (const key of Object.keys(source.data) as HomeKey[]) {
      if (ROUTES[key] && can(ROUTES[key].perm)) data[key] = source.data[key];
    }
    if (memory.user === user && memory.samples.length) samples.value = memory.samples;
    restored.value = true;
  }

  function saveSnapshot() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const user = userId.value;
      if (!user || disposed) return;
      const kept: Partial<Record<HomeKey, unknown>> = {};
      for (const key of Object.keys(data) as HomeKey[]) if (!NOT_KEPT.has(key) && data[key] !== undefined) kept[key] = data[key];
      memory.user = user;
      memory.at = Date.now();
      memory.data = { ...kept, mailMessages: data.mailMessages };
      memory.samples = samples.value;
      writeJson(typeof sessionStorage !== 'undefined' ? sessionStorage : undefined, SNAPSHOT_PREFIX + user, { user, at: memory.at, data: kept });
    }, 2_000);
  }

  // ── reading ──
  async function runBatch(keys: HomeKey[], tier: Tier | null): Promise<boolean> {
    if (!keys.length) return true;
    const paths = keys.map(key => ROUTES[key].path);
    const controller = new AbortController();
    if (tier) { controllers[tier]?.abort(); controllers[tier] = controller; }
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const batch = await RequestBatchFromKliveAPI(paths, controller.signal);
      if (disposed) return false;
      let results: Array<{ key: HomeKey; status: number; body: unknown }>;
      if (batch.size) {
        results = keys.map(key => { const item = batch.get(ROUTES[key].path); return { key, status: item?.status ?? 504, body: item?.body }; });
      } else {
        // A server without /batch (or a batch that failed outright): one by one.
        results = await Promise.all(keys.map(async key => {
          try {
            const response = await RequestGETFromKliveAPI(ROUTES[key].path, false, false, {}, controller.signal);
            const text = await response.text();
            return { key, status: response.status, body: text };
          } catch { return { key, status: 0, body: null }; }
        }));
      }
      let anyOk = false;
      for (const result of results) {
        const body = parseBody(result.body);
        if (result.status >= 200 && result.status < 300) {
          data[result.key] = body;
          status[result.key] = 'ok';
          anyOk = true;
          if (result.key === 'server' && body && typeof body === 'object') {
            samples.value = appendSample(samples.value, sampleFromStats(body as AdminStats, Date.now()));
          }
        } else if (result.status === 401 || result.status === 403) {
          status[result.key] = 'denied';
        } else if (result.status === 404) {
          status[result.key] = 'missing';
        } else if (result.status === 503 || result.status === 202) {
          // Starting, or a pre-built view still building: keep what was there.
          status[result.key] = 'starting';
        } else {
          status[result.key] = 'failed';
        }
      }
      if (anyOk) saveSnapshot();
      return anyOk || results.every(result => result.status && result.status < 500);
    } catch {
      // Unreachable or timed out: the figures already on screen stay, marked as failing.
      if (!disposed) for (const key of keys) status[key] = 'failed';
      return false;
    } finally {
      window.clearTimeout(timeout);
      if (tier && controllers[tier] === controller) delete controllers[tier];
    }
  }

  async function refreshTier(tier: Tier, force = false) {
    if (disposed || !signedIn.value) return;
    if (!force && typeof document !== 'undefined' && document.hidden) return;
    if (!force && !prefs.value.live && at[tier]) return;
    if (busy[tier]) return;
    const keys = manifest(tier);
    if (!keys.length) { at[tier] = Date.now(); return; }
    busy[tier] = true;
    try {
      const ok = await runBatch(keys, tier);
      if (disposed) return;
      if (ok) at[tier] = Date.now();
      if (tier === 'core') coreFailingSince.value = ok ? null : coreFailingSince.value ?? Date.now();
    } finally {
      busy[tier] = false;
    }
  }

  async function loadHistory() {
    if (historyLoaded.value || !can('system.status.view')) return;
    historyLoaded.value = true;
    try {
      const response = await RequestGETFromKliveAPI(HISTORY_PATH, false, false);
      if (!response.ok) return;
      const history = samplesFromHistory(await response.json() as AdminHistoryPayload);
      if (!history.length || disposed) return;
      // The server's hour, then whatever this page has read since.
      const last = history[history.length - 1].t;
      samples.value = [...history, ...samples.value.filter(sample => sample.t > last)];
    } catch { /* the strip fills from live reads instead */ }
  }

  async function refreshAll(force = true) {
    await Promise.all((['core', 'systems', 'slow', 'heavy'] as Tier[]).map(tier => refreshTier(tier, force)));
  }

  async function refreshKeys(keys: HomeKey[]) {
    await runBatch(keys.filter(key => can(ROUTES[key].perm)), null);
  }

  // ── visits (recorded by plugins/home-visits.client.ts on every page) ──
  function loadVisits() {
    visits.value = readJson<VisitRecord[]>(typeof localStorage !== 'undefined' ? localStorage : undefined, VISITS_KEY) ?? [];
  }

  async function seedVisitsFromServer() {
    if (visits.value.length || !caps.value.seedVisits || !userId.value) return;
    try {
      const response = await RequestGETFromKliveAPI(`/KMProfiles/activity?id=${encodeURIComponent(userId.value)}&types=page&limit=300`, false, false);
      if (!response.ok) return;
      const body = await response.json();
      const seeded = seedVisits(Array.isArray(body?.items) ? body.items : []);
      if (!seeded.length || visits.value.length) return;
      visits.value = seeded;
      writeJson(localStorage, VISITS_KEY, seeded);
    } catch { /* Home falls back to the fixed order */ }
  }

  // ── prefs ──
  function loadPrefs() {
    const stored = readJson<Partial<HomePrefs>>(typeof localStorage !== 'undefined' ? localStorage : undefined, PREFS_KEY);
    if (stored) prefs.value = { ...prefs.value, ...stored, mutes: { ...(stored.mutes ?? {}) } };
  }
  watch(prefs, value => writeJson(localStorage, PREFS_KEY, value), { deep: true });

  function setLive(live: boolean) {
    prefs.value.live = live;
    if (live) void refreshAll(false);
  }

  function mute(id: string, on: boolean) {
    const mutes = { ...prefs.value.mutes };
    if (on) mutes[id] = Date.now() + MUTE_MS; else delete mutes[id];
    // Forget mutes that have run out, so the list never grows.
    for (const key of Object.keys(mutes)) if (mutes[key] <= Date.now()) delete mutes[key];
    prefs.value.mutes = mutes;
  }

  // ── derived ──
  const server = computed(() => (data.server && typeof data.server === 'object' ? data.server as HomeServer : null));
  const mailCode = computed<MailCode | null>(() => latestMailCode(data.mailMessages, now.value));

  const sources = computed<HomeSources>(() => ({
    stewards: Array.isArray(data.stewards) ? data.stewards as any[] : null,
    demiurgeOverview: data.demiurgeOverview ?? null,
    agentStatus: data.agentStatus ?? null,
    agentStats: data.agentStats ?? null,
    agentNotifications: Array.isArray(data.agentNotifications) ? data.agentNotifications as any[] : null,
    agentJobs: Array.isArray(data.agentJobs) ? data.agentJobs as any[] : null,
    trader: data.trader ?? null,
    cs2: data.cs2 ?? null,
    memes: data.memes ?? null,
    tumblr: data.tumblr ?? null,
    gram: data.gram ?? null,
    defence: data.defence ?? null,
    defencePending: status.defence === 'starting' && !data.defence,
    mail: data.mail ?? null,
    mailCode: mailCode.value,
    cloud: data.cloud ?? null,
    omniscience: data.omniscience ?? null,
    games: data.games ?? null,
    gadgets: Array.isArray(data.gadgets) ? data.gadgets as any[] : null,
    linkAgents: Array.isArray(data.linkAgents) ? data.linkAgents as any[] : null,
    blox: data.blox ?? null,
  }));

  const frecency = computed(() => frecencyMap(visits.value, now.value));
  const pulses = computed(() => orderPulses(buildPulses(sources.value, now.value), frecency.value));

  const findings = computed<HomeFinding[]>(() => [...serverFindings(server.value), ...pulses.value.flatMap(pulse => pulse.findings)]);
  const mutedSet = computed(() => activeMutes(prefs.value.mutes, now.value));
  const split = computed(() => splitFindings(findings.value, mutedSet.value));

  const stopped = computed(() => downServices(server.value));
  const haltedFleet = computed(() => {
    const list = Array.isArray(data.stewards) ? data.stewards as any[] : [];
    const live = list.filter(p => !/^(archived|completed)$/i.test(String(p?.status ?? p?.Status ?? '')));
    return { live: live.length, halted: live.filter(p => p?.halted ?? p?.Halted).length };
  });

  // Vitals: an hour from the server plus every live read.
  const vitals = computed(() => {
    const list = samples.value;
    const latest = server.value;
    const perMin = (pick: (sample: VitalSample) => number | null) => trailingRate(list, pick, 5 * 60_000, 60_000);
    return {
      // An hour of 5 s samples is ~720 points: averaged down, a sparkline shows the trend instead of noise.
      cpu: downsample(gaugeSeries(list, sample => sample.cpu), 90),
      ram: downsample(gaugeSeries(list, sample => sample.ram), 90),
      requests: bucketRateSeries(list, sample => sample.requests, 30, 60_000),
      requestsPerMin: perMin(sample => sample.requests),
      serverErrorsPerMin: perMin(sample => sample.serverErrors),
      cpuNow: isNum(latest?.CpuUsagePercentage) ? latest!.CpuUsagePercentage! : null,
      ramNow: isNum(latest?.RamUsagePercentage) ? latest!.RamUsagePercentage! : null,
    };
  });

  const linkState = computed<'live' | 'paused' | 'stale' | 'offline' | 'connecting' | 'starting'>(() => {
    if (!prefs.value.live) return 'paused';
    if (status.server === 'starting' && !at.core) return 'starting';
    if (coreFailingSince.value && now.value - coreFailingSince.value > 30_000) return 'offline';
    if (!at.core) return 'connecting';
    return now.value - at.core > INTERVAL.core * 3 ? 'stale' : 'live';
  });

  const loading = computed(() => !at.core && !at.systems && !restored.value);

  // ── actions ──
  async function restartService(name: string) {
    if (!caps.value.restart || pending.restart) return;
    pending.restart = name;
    try {
      const response = await RequestPOSTFromKliveAPI('/GeneralBotStatistics/RestartService', JSON.stringify({ serviceName: name, onlyIfInactive: true }), false, true);
      const body: any = parseBody(await response.text());
      if (!response.ok || body?.Success === false || body?.success === false) throw new Error(body?.Error || body?.error || body?.Message || `Restart refused (${response.status})`);
      toast(`Restart of ${name} queued. Checking it comes back…`, 'info');
      for (let attempt = 0; attempt < 12 && !disposed; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2_500));
        await refreshTier('core', true);
        if (!downServices(server.value).some(service => service.Name === name)) { toast(`${name} is running again.`); return; }
      }
      toast(`${name} has not come back yet. Admin shows its log.`, 'warn', { href: '/admin', label: 'Admin' });
    } catch (error: any) {
      toast(error?.message || `Could not restart ${name}.`, 'crit');
    } finally {
      pending.restart = '';
    }
  }

  async function fleet(action: 'resume' | 'halt') {
    if (!caps.value.fleet || pending.fleet) return;
    pending.fleet = true;
    try {
      const response = await RequestPOSTFromKliveAPI(action === 'resume' ? '/demiurge/unhalt-all' : '/demiurge/halt-all', '', false, false);
      const body: any = parseBody(await response.text());
      if (!response.ok || body?.ok === false) throw new Error(body?.error || `The fleet did not ${action} (${response.status})`);
      const count = Number(action === 'resume' ? body?.restored : body?.halted) || 0;
      toast(body?.pending
        ? `${action === 'resume' ? 'Resuming' : 'Halting'} the fleet: still finishing${body?.step ? ` (${body.step})` : ''}.`
        : `${count} Steward${count === 1 ? '' : 's'} ${action === 'resume' ? 'resumed' : 'halted'}.`, body?.pending ? 'info' : 'ok', { href: '/demiurge', label: 'Demiurge' });
      await refreshKeys(['stewards']);
    } catch (error: any) {
      toast(error?.message || 'The fleet action failed.', 'crit');
    } finally {
      pending.fleet = false;
    }
  }

  async function enterSafeMode() {
    if (!caps.value.safeMode || pending.safeMode) return;
    pending.safeMode = true;
    try {
      const response = await RequestPOSTFromKliveAPI('/api/omnitrader/firm/risk/safe-mode?enable=true&reason=home%20quick%20action', '', false, false);
      const body: any = parseBody(await response.text());
      if (!response.ok) throw new Error(body?.error || `Safe mode was refused (${response.status})`);
      toast('Firm safe mode is on: new Firm orders are blocked.', 'warn', { href: '/omnitrader/risk', label: 'Risk' });
      await refreshKeys(['trader']);
    } catch (error: any) {
      toast(error?.message || 'Safe mode failed.', 'crit');
    } finally {
      pending.safeMode = false;
    }
  }

  async function copyCode() {
    const code = mailCode.value;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.code);
      toast(`Copied the code from ${code.from}.`);
    } catch {
      toast(`The code is ${code.code}`, 'info');
    }
  }

  function uploadOne(file: File, doneBytes: number, totalBytes: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${KliveAPIUrl}/KliveCloud/UploadFile?fileName=${encodeURIComponent(file.name)}`, true);
      const authorization = AuthorizationHeaderValue();
      if (authorization) xhr.setRequestHeader('Authorization', authorization);
      xhr.setRequestHeader('X-Klive-Client', 'website');
      xhr.setRequestHeader('X-Klive-Page', '/dashboard');
      xhr.upload.onprogress = event => {
        if (event.lengthComputable && totalBytes > 0) upload.percent = Math.min(99, Math.round(((doneBytes + event.loaded) / totalBytes) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) return resolve();
        ReportXhrAccess(xhr, '/KliveCloud/UploadFile');
        let message = xhr.responseText;
        try { const body = JSON.parse(xhr.responseText); message = body?.message || body?.error || message; } catch { /* plain text */ }
        reject(new Error(message || `Upload failed (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('The connection dropped during the upload.'));
      xhr.send(file);
    });
  }

  async function uploadFiles(files: File[]) {
    if (!caps.value.upload || pending.upload || !files.length) return;
    pending.upload = true;
    Object.assign(upload, { active: true, done: 0, total: files.length, percent: 0, name: files[0].name });
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    let doneBytes = 0;
    const failed: string[] = [];
    try {
      for (const file of files) {
        upload.name = file.name;
        try { await uploadOne(file, doneBytes, totalBytes); upload.done++; } catch (error: any) { failed.push(`${file.name}: ${error?.message || 'failed'}`); }
        doneBytes += file.size;
        upload.percent = totalBytes > 0 ? Math.round((doneBytes / totalBytes) * 100) : 100;
      }
      if (upload.done) {
        toast(`${upload.done} file${upload.done === 1 ? '' : 's'} uploaded to KliveCloud.`, 'ok', { href: '/klivecloud', label: 'Open' });
        void refreshKeys(['cloud']);
      }
      if (failed.length) toast(failed.join(' · '), 'crit');
    } finally {
      pending.upload = false;
      upload.active = false;
    }
  }

  // ── lifecycle ──
  const stream = useEventStream({
    onFleet: () => {
      if (disposed || document.hidden || fleetDebounce) return;
      fleetDebounce = setTimeout(() => { fleetDebounce = null; void refreshKeys(['stewards']); }, 2_000);
    },
  });

  function start() {
    if (started || disposed || !signedIn.value) return;
    started = true;
    restoreSnapshot();
    for (const tier of Object.keys(INTERVAL) as Tier[]) timers[tier] = setInterval(() => void refreshTier(tier), INTERVAL[tier]);
    // Fast tiers first; the vitals hour once the first figures are on screen.
    void refreshTier('core', true).then(() => loadHistory());
    void refreshTier('systems', true);
    void refreshTier('slow', true);
    void refreshTier('heavy', true);
    if (caps.value.stewardStream) stream.connect();
    void seedVisitsFromServer();
  }

  function onVisibility() {
    if (document.hidden) return;
    now.value = Date.now();
    loadVisits();
    // Back after a while: read whatever has gone past its interval.
    for (const tier of Object.keys(INTERVAL) as Tier[]) if (Date.now() - at[tier] > INTERVAL[tier]) void refreshTier(tier);
  }

  watch(() => (Object.keys(ROUTES) as HomeKey[]).filter(key => can(ROUTES[key].perm)).join('|'), (next, previous) => {
    // Access changed live (a grant or a revoke): read again with the new manifest.
    if (started && previous !== undefined && next !== previous) void refreshAll(true);
  });

  onMounted(async () => {
    loadPrefs();
    loadVisits();
    clock = setInterval(() => { now.value = Date.now(); }, 5_000);
    document.addEventListener('visibilitychange', onVisibility);
    await current.ensureLoaded();
    if (disposed) return;
    if (signedIn.value) start();
    else {
      const retry = setInterval(async () => {
        if (disposed) return clearInterval(retry);
        await current.refresh();
        if (signedIn.value) { clearInterval(retry); start(); }
      }, 5_000);
    }
  });

  onBeforeUnmount(() => {
    disposed = true;
    for (const tier of Object.keys(timers) as Tier[]) clearInterval(timers[tier]);
    for (const tier of Object.keys(controllers) as Tier[]) controllers[tier]?.abort();
    if (clock) clearInterval(clock);
    if (fleetDebounce) clearTimeout(fleetDebounce);
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    // Keep the latest answers for the next visit to Home in this tab.
    const user = userId.value;
    if (user) { memory.user = user; memory.at = Date.now(); memory.data = { ...data }; memory.samples = samples.value; }
    document.removeEventListener('visibilitychange', onVisibility);
    stream.disconnect();
  });

  return {
    current, can, canOpen, caps, data, status, at, busy, now, prefs, toasts, pending, upload,
    server, pulses, findings, split, mutedSet, stopped, haltedFleet, vitals, linkState, loading, restored, visits, frecency, mailCode,
    refreshAll, setLive, mute, dismissToast, toast,
    restartService, fleet, enterSafeMode, copyCode, uploadFiles,
  };
}

export type HomeConsole = ReturnType<typeof useHome>;
