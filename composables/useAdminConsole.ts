import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { RequestBatchFromKliveAPI, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import { useCurrentProfile } from '~/composables/useCurrentProfile';
import { resolvePageAccess, satisfiesRule } from '~/scripts/pageAccess';
import {
  appendSample, buildUptimeView, computeIssues, downsample, gaugeSeries, inServerZone, isNum, mappingPayload, bucketRateSeries,
  sampleFromStats, samplesFromHistory, toMs, trailingAverage, trailingRate, typicalRestartSeconds, isVirtualAdapter, zoneOf,
  isFinishedService, realAdapters, type AdminApiWindow, type AdminApiStats, type AdminBrowser, type AdminHistoryPayload, type AdminLogSummary, type AdminPortMapping,
  type AdminPorts, type AdminService, type AdminStats, type AdminTask, type AdminUptime, type Issue, type PortDraft,
  type SeriesPoint, type Tone, type VitalSample,
} from '~/scripts/adminConsole';

/**
 * State for the Admin console: what the server reports, how fresh it is, and the things an operator
 * can do about it. One instance per page visit.
 *
 * Two request tiers. The vitals snapshot is rebuilt by the server every 5 s, so it is read every 5 s
 * on its own. Everything slower (uptime history, API statistics, logs, schedule, router) rides one
 * /batch request every 45 s, and the day's API telemetry is read every five minutes. Nothing is
 * requested while the tab is hidden, and nothing is requested that the profile's permissions would refuse.
 */

const FAST_MS = 5_000;
const SLOW_MS = 45_000;
/** The day's API telemetry: a large view that changes slowly. */
const DAY_MS = 5 * 60_000;
const DEPLOY_POLL_MS = 3_000;
const REQUEST_TIMEOUT_MS = 12_000;
const MUTED_KEY = 'adm:muted-issues';
const PREFS_KEY = 'adm:prefs';

export type UptimeRange = '24h' | '3d' | '7d' | '30d' | '90d' | 'all';
export const UPTIME_RANGES: { value: UptimeRange; label: string; days: number | null }[] = [
  { value: '24h', label: '24h', days: 1 },
  { value: '3d', label: '3d', days: 3 },
  { value: '7d', label: '7d', days: 7 },
  { value: '30d', label: '30d', days: 30 },
  { value: '90d', label: '90d', days: 90 },
  { value: 'all', label: 'All', days: null },
];

export interface AdminToast { id: number; tone: 'ok' | 'warn' | 'crit' | 'info'; text: string }

export type DeployPhase = 'idle' | 'requesting' | 'restarting' | 'back' | 'refused';
export interface DeployState {
  phase: DeployPhase;
  /** When the update was requested (ms). */
  since: number;
  /** The process that was running when it was requested, to recognise its replacement. */
  previousStart: string | null;
  previousCommit: string | null;
  /** The API stopped answering at some point, so a later answer is a new process. */
  wentOffline: boolean;
  message: string;
}

interface Prefs { uptimeRange: UptimeRange; apiDays: number; live: boolean }
const DEFAULT_PREFS: Prefs = { uptimeRange: '7d', apiDays: 30, live: true };

function parseBody<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value !== 'string') return value as T;
  const trimmed = value.trim();
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return null;
  try { return JSON.parse(trimmed) as T; } catch { return null; }
}

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch { return fallback; }
}

export function useAdminConsole() {
  const profile = useCurrentProfile();
  const can = (key: string) => profile.can(key);
  const canOpen = (path: string) => satisfiesRule(resolvePageAccess(path).rule, profile.can, true);

  // ── what the server said ──
  const stats = shallowRef<AdminStats | null>(null);
  const uptime = shallowRef<AdminUptime | null>(null);
  const apiStats = shallowRef<AdminApiStats | null>(null);
  const logSummary = shallowRef<AdminLogSummary | null>(null);
  const tasks = shallowRef<AdminTask[] | null>(null);
  const ports = shallowRef<AdminPorts | null>(null);
  const browsers = shallowRef<AdminBrowser[] | null>(null);
  /** The last 24 hours of API telemetry and the 24 before. Null without the permission, or until first read. */
  const apiWindow = shallowRef<AdminApiWindow | null>(null);
  const samples = shallowRef<VitalSample[]>([]);
  /** Per-adapter throughput, from the two most recent snapshots. */
  const nicRates = shallowRef<Record<string, { up: number; down: number }>>({});

  // ── freshness ──
  const now = ref(Date.now());
  const ready = ref(false);
  const lastFastOkAt = ref<number | null>(null);
  const lastSlowOkAt = ref<number | null>(null);
  const fastFailures = ref(0);
  const fastBusy = ref(false);
  const slowBusy = ref(false);
  /** Slow-tier sections whose last request failed, by label. */
  const failedSections = ref<string[]>([]);
  const hidden = ref(false);
  /** False on a server from before the history route: trend lines then build up while the page is open. */
  const historySupported = ref(true);
  const historyLoadedAt = ref<number | null>(null);

  // ── preferences ──
  const prefs = ref<Prefs>({ ...DEFAULT_PREFS });
  const muted = ref<string[]>([]);

  // ── actions in flight ──
  const serviceAction = ref<Record<string, 'restart' | 'quit'>>({});
  const portsBusy = ref(false);
  const deploy = ref<DeployState>({ phase: 'idle', since: 0, previousStart: null, previousCommit: null, wentOffline: false, message: '' });
  const toasts = ref<AdminToast[]>([]);
  let toastId = 0;

  function notify(tone: AdminToast['tone'], text: string, ms = 5_000) {
    const id = ++toastId;
    toasts.value = [...toasts.value, { id, tone, text }];
    window.setTimeout(() => dismissToast(id), ms);
  }
  function dismissToast(id: number) {
    toasts.value = toasts.value.filter(toast => toast.id !== id);
  }

  // ───────────────────────────── requests ─────────────────────────────

  async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try { return await run(controller.signal); } finally { window.clearTimeout(timer); }
  }

  let previousNics: { t: number; byName: Map<string, { sent: number; recv: number }> } | null = null;

  function applyStats(next: AdminStats) {
    const received = Date.now();
    stats.value = next;
    lastFastOkAt.value = received;
    fastFailures.value = 0;
    samples.value = appendSample(samples.value, sampleFromStats(next, received));

    const t = toMs(next.TimeStatisticsGenerated) ?? received;
    const byName = new Map<string, { sent: number; recv: number }>();
    const rates: Record<string, { up: number; down: number }> = { ...nicRates.value };
    for (const nic of next.NetworkInterfaces ?? []) {
      byName.set(nic.Name, { sent: nic.BytesSent, recv: nic.BytesReceived });
      const before = previousNics?.byName.get(nic.Name);
      const dt = previousNics ? (t - previousNics.t) / 1000 : 0;
      if (before && dt > 0 && nic.BytesSent >= before.sent && nic.BytesReceived >= before.recv) {
        rates[nic.Name] = { up: (nic.BytesSent - before.sent) / dt, down: (nic.BytesReceived - before.recv) / dt };
      }
    }
    // The same snapshot read twice says nothing new about throughput.
    if (!previousNics || t > previousNics.t) {
      previousNics = { t, byName };
      nicRates.value = rates;
    }
  }

  async function refreshFast(): Promise<boolean> {
    if (!can('system.status.view') || fastBusy.value) return false;
    fastBusy.value = true;
    try {
      const response = await withTimeout(signal => RequestGETFromKliveAPI('/GeneralBotStatistics/GetFrontpageStats', false, false, {}, signal));
      const body = response.ok ? parseBody<AdminStats>(await response.text()) : null;
      if (!body || !Array.isArray(body.Services)) throw new Error(`status ${response.status}`);
      applyStats(body);
      noteDeployProgress(true);
      return true;
    } catch {
      fastFailures.value += 1;
      noteDeployProgress(false);
      return false;
    } finally {
      fastBusy.value = false;
      ready.value = true;
    }
  }

  const uptimeDays = computed(() => {
    const days = UPTIME_RANGES.find(range => range.value === prefs.value.uptimeRange)?.days ?? null;
    // Always at least a month: the typical restart time is read from the recent gaps.
    return days == null ? null : Math.max(days, 30);
  });

  interface SlowRoute { key: string; label: string; path: string; permission: string }

  function slowRoutes(): SlowRoute[] {
    const routes: SlowRoute[] = [
      { key: 'uptime', label: 'Uptime history', path: `/System/UptimeStatistics${uptimeDays.value ? `?days=${uptimeDays.value}` : ''}`, permission: 'system.uptime.view' },
      { key: 'api', label: 'API statistics', path: `/KliveAPI/Statistics?days=${prefs.value.apiDays}`, permission: 'system.status.view' },
      { key: 'logs', label: 'Log summary', path: '/api/logs/summary?hours=24', permission: 'system.logs.read' },
      { key: 'tasks', label: 'Schedule', path: '/timemanager/getalltasks', permission: 'system.scheduler.read' },
      { key: 'ports', label: 'Port forwarding', path: '/admin/portforwarding/list', permission: 'system.portforwarding.read' },
      { key: 'browsers', label: 'Browser sessions', path: '/seleniumManager/getAllSeleniumInstances', permission: 'system.resources.read' },
    ];
    // The hour of history is read once, then extended from the live snapshots. Read again after the
    // tab has been away long enough to leave a hole in it.
    const stale = historyLoadedAt.value == null || (samples.value.length > 0 && Date.now() - samples.value[samples.value.length - 1].t > 90_000);
    if (historySupported.value && stale) {
      routes.push({ key: 'history', label: 'Vitals history', path: '/GeneralBotStatistics/History?minutes=60', permission: 'system.status.view' });
    }
    return routes.filter(route => can(route.permission));
  }

  async function refreshSlow(): Promise<void> {
    if (slowBusy.value) return;
    const routes = slowRoutes();
    if (!routes.length) return;
    slowBusy.value = true;
    try {
      const results = await withTimeout(signal => RequestBatchFromKliveAPI(routes.map(route => route.path), signal));
      const failed: string[] = [];
      for (const route of routes) {
        const item = results.get(route.path);
        if (route.key === 'history') {
          if (item?.status === 404) historySupported.value = false;
          const payload = item?.ok ? parseBody<AdminHistoryPayload>(item.body) : null;
          if (payload) mergeHistory(payload);
          continue;
        }
        if (!item || !item.ok) {
          // No access is not a failure: the panel simply is not offered.
          if (item?.status !== 403) failed.push(route.label);
          continue;
        }
        const body = parseBody<any>(item.body);
        if (body == null) { failed.push(route.label); continue; }
        if (route.key === 'uptime') uptime.value = body as AdminUptime;
        else if (route.key === 'api') apiStats.value = body as AdminApiStats;
        else if (route.key === 'logs') logSummary.value = body as AdminLogSummary;
        else if (route.key === 'tasks') {
          // Due times come without a zone: they are the server's clock, not this browser's.
          const serverZone = zoneOf(stats.value?.TimeStatisticsGenerated);
          tasks.value = Array.isArray(body)
            ? (body as AdminTask[]).map(task => ({ ...task, dateTimeDue: inServerZone(task.dateTimeDue, serverZone) }))
            : [];
        }
        else if (route.key === 'ports') ports.value = body as AdminPorts;
        else if (route.key === 'browsers') browsers.value = Array.isArray(body) ? body as AdminBrowser[] : [];
      }
      failedSections.value = failed;
      if (results.size) lastSlowOkAt.value = Date.now();
    } catch {
      // The whole batch failed: the fast tier is what reports an unreachable API.
    } finally {
      slowBusy.value = false;
    }
  }

  function mergeHistory(payload: AdminHistoryPayload) {
    const fromServer = samplesFromHistory(payload);
    historyLoadedAt.value = Date.now();
    if (!fromServer.length) return;
    // Server samples carry the full hour; keep any live sample newer than its last one.
    const lastServer = fromServer[fromServer.length - 1].t;
    const newer = samples.value.filter(sample => sample.t > lastServer);
    samples.value = [...fromServer, ...newer];
  }

  let dayReadAt = 0;

  /** Lifetime averages include day-long downloads and streams; the day's percentiles are the honest figures. */
  async function refreshDay(force = false): Promise<void> {
    if (!can('system.api.telemetry.read')) return;
    if (!force && Date.now() - dayReadAt < DAY_MS - 5_000) return;
    dayReadAt = Date.now();
    try {
      const response = await withTimeout(signal => RequestGETFromKliveAPI('/KliveAPI/telemetry/overview?range=24h', false, false, {}, signal));
      // 202: the server is still building this view. The next round asks again.
      if (response.status !== 200) { dayReadAt = 0; return; }
      const body = parseBody<{ kpi?: AdminApiWindow['kpi']; prev?: AdminApiWindow['prev'] }>(await response.text());
      if (body?.kpi && typeof body.kpi.count === 'number') apiWindow.value = { kpi: body.kpi, prev: body.prev ?? null };
    } catch {
      dayReadAt = 0;
    }
  }

  async function refreshAll() {
    await Promise.all([refreshFast(), refreshSlow(), refreshDay(true)]);
  }

  // ───────────────────────────── timers ─────────────────────────────

  let fastTimer: number | null = null;
  let slowTimer: number | null = null;
  let clockTimer: number | null = null;

  function stopTimers() {
    if (fastTimer != null) window.clearInterval(fastTimer);
    if (slowTimer != null) window.clearInterval(slowTimer);
    fastTimer = slowTimer = null;
  }

  function startTimers() {
    stopTimers();
    if (hidden.value || !prefs.value.live) return;
    const fastEvery = deploy.value.phase === 'restarting' || deploy.value.phase === 'requesting' ? DEPLOY_POLL_MS : FAST_MS;
    fastTimer = window.setInterval(() => void refreshFast(), fastEvery);
    slowTimer = window.setInterval(() => { void refreshSlow(); void refreshDay(); }, SLOW_MS);
  }

  function onVisibility() {
    hidden.value = document.visibilityState === 'hidden';
    if (hidden.value) { stopTimers(); return; }
    now.value = Date.now();
    void refreshAll();
    startTimers();
  }

  function setLive(live: boolean) {
    prefs.value = { ...prefs.value, live };
    if (live) void refreshAll();
    startTimers();
  }

  watch(prefs, value => {
    try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(value)); } catch { /* storage blocked */ }
  }, { deep: true });

  watch(() => [prefs.value.uptimeRange, prefs.value.apiDays], () => { void refreshSlow(); });

  onMounted(async () => {
    prefs.value = readStored(PREFS_KEY, DEFAULT_PREFS);
    try { muted.value = JSON.parse(window.localStorage.getItem(MUTED_KEY) ?? '[]'); } catch { muted.value = []; }
    hidden.value = document.visibilityState === 'hidden';
    document.addEventListener('visibilitychange', onVisibility);
    clockTimer = window.setInterval(() => { now.value = Date.now(); }, 1_000);
    await profile.ensureLoaded();
    await refreshAll();
    startTimers();
  });

  onBeforeUnmount(() => {
    stopTimers();
    if (clockTimer != null) window.clearInterval(clockTimer);
    document.removeEventListener('visibilitychange', onVisibility);
  });

  // ───────────────────────────── freshness ─────────────────────────────

  const sinceFastOk = computed(() => (lastFastOkAt.value == null ? null : Math.max(0, (now.value - lastFastOkAt.value) / 1000)));
  /** Seconds the API has been failing to answer, or null while it is answering. */
  const unreachableFor = computed(() => {
    if (fastFailures.value === 0) return null;
    if (lastFastOkAt.value == null) return ready.value ? Math.max(20, fastFailures.value * (FAST_MS / 1000)) : null;
    return (now.value - lastFastOkAt.value) / 1000;
  });
  const linkState = computed<'live' | 'paused' | 'stale' | 'offline' | 'connecting'>(() => {
    if (!ready.value) return 'connecting';
    if (unreachableFor.value != null && unreachableFor.value >= 20) return 'offline';
    if (fastFailures.value > 0) return 'stale';
    return prefs.value.live ? 'live' : 'paused';
  });

  // ───────────────────────────── vitals ─────────────────────────────

  const SPARK_POINTS = 90;
  /** One bucket a minute across the hour of history. */
  const RATE_BUCKETS = 60;
  const spark = (points: SeriesPoint[]) => downsample(points, SPARK_POINTS);

  const series = computed(() => {
    const all = samples.value;
    return {
      cpu: spark(gaugeSeries(all, sample => sample.cpu)),
      ram: spark(gaugeSeries(all, sample => sample.ram)),
      process: spark(gaugeSeries(all, sample => sample.procMB)),
      heap: spark(gaugeSeries(all, sample => sample.heapMB)),
      requests: bucketRateSeries(all, sample => sample.requests, RATE_BUCKETS, 60_000),
      // Drawn as columns, which need to be wide enough to see: two minutes each.
      errors: bucketRateSeries(all, sample => sample.errors, RATE_BUCKETS / 2, 60_000),
      gen2: bucketRateSeries(all, sample => sample.gen2, RATE_BUCKETS, 60_000),
      netUp: bucketRateSeries(all, sample => sample.netSent, RATE_BUCKETS, 1_000),
      netDown: bucketRateSeries(all, sample => sample.netRecv, RATE_BUCKETS, 1_000),
    };
  });

  /** How much of the last hour the trend lines cover, in minutes. */
  const historyMinutes = computed(() => {
    const all = samples.value;
    return all.length > 1 ? (all[all.length - 1].t - all[0].t) / 60_000 : 0;
  });

  const rates = computed(() => {
    const all = samples.value;
    return {
      requestsPerMin: trailingRate(all, sample => sample.requests, 60_000, 60_000),
      serverErrorsPerMin: trailingRate(all, sample => sample.serverErrors, 5 * 60_000, 60_000),
      errorsPerHour: trailingRate(all, sample => sample.errors, 60 * 60_000, 3_600_000),
      gen2PerMin: trailingRate(all, sample => sample.gen2, 5 * 60_000, 60_000),
      cpuAvg: trailingAverage(gaugeSeries(all, sample => sample.cpu), 60 * 60_000),
      netUp: trailingRate(all, sample => sample.netSent, 15_000, 1_000),
      netDown: trailingRate(all, sample => sample.netRecv, 15_000, 1_000),
    };
  });

  // ───────────────────────────── uptime ─────────────────────────────

  const uptimeView = computed(() => {
    const range = UPTIME_RANGES.find(option => option.value === prefs.value.uptimeRange);
    return buildUptimeView(uptime.value?.Periods, range?.days ? range.days * 86_400_000 : null, now.value);
  });
  const weekView = computed(() => buildUptimeView(uptime.value?.Periods, 7 * 86_400_000, now.value));
  const typicalRestart = computed(() => typicalRestartSeconds(uptime.value?.Periods));

  const processUptimeSeconds = computed(() => {
    const started = toMs(stats.value?.Build?.ProcessStartedUtc);
    if (started != null) return Math.max(0, (now.value - started) / 1000);
    return isNum(uptime.value?.CurrentUptimeSeconds) ? uptime.value!.CurrentUptimeSeconds : null;
  });

  // ───────────────────────────── attention ─────────────────────────────

  const issues = computed<Issue[]>(() => computeIssues({
    stats: stats.value,
    unreachableForSeconds: deploy.value.phase === 'restarting' ? null : unreachableFor.value,
    uptime: uptime.value?.Periods ?? null,
    apiWindow: apiWindow.value,
    tasks: tasks.value,
    samples: samples.value,
    now: now.value,
    canControlServices: can('system.services.control'),
    canDeploy: can('system.update.deploy'),
    failedSections: failedSections.value,
  }));
  const activeIssues = computed(() => issues.value.filter(issue => !muted.value.includes(issue.id)));
  const mutedIssues = computed(() => issues.value.filter(issue => muted.value.includes(issue.id)));

  const verdict = computed<{ tone: Tone; title: string; detail: string }>(() => {
    if (deploy.value.phase === 'restarting' || deploy.value.phase === 'requesting') {
      return { tone: 'info', title: 'Restart in progress', detail: 'Everything below is from just before it went down.' };
    }
    if (!stats.value) {
      if (!ready.value) return { tone: 'neutral', title: 'Connecting…', detail: 'Reading the server.' };
      return { tone: 'crit', title: 'The API is not answering', detail: 'No status has been received yet.' };
    }
    const counted = activeIssues.value.filter(issue => issue.severity !== 'info');
    if (!counted.length) {
      const expected = services.value.filter(service => !isFinishedService(service)).length;
      const running = services.value.filter(service => service.IsActive).length;
      return { tone: 'ok', title: 'All systems nominal', detail: `${running} of ${expected} services running, nothing needs attention.` };
    }
    const worst = counted[0];
    const more = counted.length - 1;
    return {
      tone: worst.severity === 'crit' ? 'crit' : 'warn',
      title: worst.title,
      detail: more > 0 ? `and ${more} more thing${more === 1 ? '' : 's'} to look at` : (worst.detail ?? ''),
    };
  });

  function setMuted(id: string, on: boolean) {
    const next = on ? [...new Set([...muted.value, id])] : muted.value.filter(entry => entry !== id);
    muted.value = next;
    try { window.localStorage.setItem(MUTED_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  }

  // ───────────────────────────── services ─────────────────────────────

  const services = computed<AdminService[]>(() => stats.value?.Services ?? []);

  async function controlService(name: string, action: 'restart' | 'quit'): Promise<boolean> {
    if (!name || serviceAction.value[name] || deployBusy.value) return false;
    serviceAction.value = { ...serviceAction.value, [name]: action };
    try {
      const response = await RequestPOSTFromKliveAPI(
        action === 'restart' ? '/GeneralBotStatistics/RestartService' : '/GeneralBotStatistics/QuitService',
        JSON.stringify({ serviceName: name }), false, true);
      const payload = parseBody<{ Success?: boolean; Message?: string; Error?: string }>(await response.text());
      if (!response.ok || !payload?.Success) {
        throw new Error(payload?.Error || payload?.Message || (response.status === 403 ? 'You are not allowed to control services.' : `The server answered ${response.status}.`));
      }
      notify('ok', payload.Message || `${action === 'restart' ? 'Restart' : 'Stop'} requested for ${name}.`);
      // Restarting KliveAPI drops this very connection; the next poll reports how it went.
      if (name.toLowerCase() !== 'kliveapi') {
        window.setTimeout(() => void refreshFast(), 1_200);
        window.setTimeout(() => void refreshFast(), 4_000);
      }
      return true;
    } catch (error) {
      notify('crit', `Could not ${action === 'restart' ? 'restart' : 'stop'} ${name}: ${error instanceof Error ? error.message : 'request failed'}`, 8_000);
      return false;
    } finally {
      const next = { ...serviceAction.value };
      delete next[name];
      serviceAction.value = next;
    }
  }

  // ───────────────────────────── deploy ─────────────────────────────

  const deployBusy = computed(() => deploy.value.phase === 'requesting' || deploy.value.phase === 'restarting');

  function noteDeployProgress(answered: boolean) {
    const state = deploy.value;
    if (state.phase !== 'restarting') return;
    if (!answered) {
      if (!state.wentOffline) deploy.value = { ...state, wentOffline: true, message: 'The API is down while the new build is made.' };
      return;
    }
    const startedNow = stats.value?.Build?.ProcessStartedUtc ?? null;
    // A different process start is proof of a restart. A server too old to report it is taken to
    // have restarted once it has been seen down and is answering again.
    const replaced = state.previousStart && startedNow ? startedNow !== state.previousStart : state.wentOffline;
    if (!replaced) return;
    const commit = stats.value?.Build?.CommitShort;
    const changed = commit && state.previousCommit && commit !== state.previousCommit;
    deploy.value = {
      ...state,
      phase: 'back',
      message: commit ? (changed ? `Back online on ${commit}.` : `Back online, still on ${commit}: there was nothing new to build.`) : 'Back online.',
    };
    startTimers();
    void refreshSlow();
    notify('ok', deploy.value.message, 8_000);
    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification('Omnipotent is back online', { body: deploy.value.message });
      notification.onclick = () => { window.focus(); notification.close(); };
    }
  }

  async function startDeploy(): Promise<void> {
    if (deployBusy.value || !can('system.update.deploy')) return;
    // Asked here, on the click, so the "back online" notice can reach a tab left in the background.
    if ('Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch { /* not available */ }
    }
    deploy.value = {
      phase: 'requesting',
      since: Date.now(),
      previousStart: stats.value?.Build?.ProcessStartedUtc ?? null,
      previousCommit: stats.value?.Build?.CommitShort ?? null,
      wentOffline: false,
      message: 'Asking the server to pull, rebuild and restart.',
    };
    try {
      const response = await RequestPOSTFromKliveAPI('/GeneralBotStatistics/UpdateBot', null, false);
      // 504 is this site's stand-in for "no answer": the process was killed mid-request, which is
      // exactly what a started update looks like.
      if (!response.ok && response.status !== 504) {
        const payload = parseBody<{ Error?: string }>(await response.text());
        deploy.value = { ...deploy.value, phase: 'refused', message: payload?.Error || (response.status === 403 ? 'You are not allowed to update Omnipotent.' : `The server answered ${response.status}.`) };
        notify('crit', `Update not started: ${deploy.value.message}`, 8_000);
        return;
      }
      deploy.value = { ...deploy.value, phase: 'restarting', wentOffline: response.status === 504, message: 'Stopping, pulling the latest commit and rebuilding.' };
    } catch {
      deploy.value = { ...deploy.value, phase: 'restarting', wentOffline: true, message: 'The API went down: the update is under way.' };
    }
    startTimers();
  }

  function dismissDeploy() {
    if (deploy.value.phase === 'back' || deploy.value.phase === 'refused') {
      deploy.value = { ...deploy.value, phase: 'idle', message: '' };
    }
  }

  const deployElapsed = computed(() => (deployBusy.value ? Math.max(0, (now.value - deploy.value.since) / 1000) : 0));

  // ───────────────────────────── port forwarding ─────────────────────────────

  async function postPorts(path: string, body: unknown, success: string): Promise<string | null> {
    portsBusy.value = true;
    try {
      const response = await RequestPOSTFromKliveAPI(path, JSON.stringify(body), false, true);
      const payload = parseBody<{ success?: boolean; message?: string; error?: string }>(await response.text());
      if (!response.ok || !payload?.success) {
        return payload?.error || (response.status === 403 ? 'You are not allowed to change port forwarding.' : `The router refused the change (${response.status}).`);
      }
      notify('ok', payload.message || success);
      await refreshPorts();
      return null;
    } catch {
      return 'Could not reach the server.';
    } finally {
      portsBusy.value = false;
    }
  }

  async function refreshPorts() {
    if (!can('system.portforwarding.read')) return;
    try {
      const response = await RequestGETFromKliveAPI('/admin/portforwarding/list', false, false);
      const body = parseBody<AdminPorts>(await response.text());
      if (body) ports.value = body;
    } catch { /* the next slow refresh tries again */ }
  }

  /** Adds a mapping, or replaces `editing` with the draft. Resolves to an error message, or null. */
  function savePortMapping(draft: PortDraft, editing: AdminPortMapping | null): Promise<string | null> {
    const next = mappingPayload(draft);
    return editing
      ? postPorts('/admin/portforwarding/edit', { OldMapping: editing, NewMapping: next }, 'Port mapping updated.')
      : postPorts('/admin/portforwarding/add', next, 'Port mapping added.');
  }

  async function deletePortMapping(mapping: AdminPortMapping): Promise<string | null> {
    const failure = await postPorts('/admin/portforwarding/delete', mapping, 'Port mapping removed.');
    // There is no form open to show it in, unlike a save.
    if (failure) notify('crit', `Port ${mapping.PublicPort} was not removed: ${failure}`, 8_000);
    return failure;
  }

  const physicalNics = computed(() => realAdapters(stats.value?.NetworkInterfaces).filter(nic => !isVirtualAdapter(nic)));
  const virtualNics = computed(() => realAdapters(stats.value?.NetworkInterfaces).filter(nic => isVirtualAdapter(nic)));

  return {
    // access
    can, canOpen, isOwner: profile.isOwner,
    // data
    stats, uptime, apiStats, apiWindow, logSummary, tasks, ports, browsers, services, samples,
    physicalNics, virtualNics, nicRates,
    // freshness
    now, ready, hidden, linkState, sinceFastOk, unreachableFor, lastSlowOkAt, fastBusy, slowBusy, failedSections,
    historySupported, historyMinutes,
    // derived
    series, rates, uptimeView, weekView, typicalRestart, processUptimeSeconds,
    issues, activeIssues, mutedIssues, verdict, setMuted,
    // preferences
    prefs, setLive,
    // actions
    refreshAll, refreshFast, refreshSlow,
    serviceAction, controlService,
    deploy, deployBusy, deployElapsed, startDeploy, dismissDeploy,
    portsBusy, savePortMapping, deletePortMapping, refreshPorts,
    toasts, notify, dismissToast,
  };
}

export type AdminConsole = ReturnType<typeof useAdminConsole>;
