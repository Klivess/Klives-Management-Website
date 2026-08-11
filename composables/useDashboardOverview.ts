import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useCookie } from '#imports';
import {
  KliveAPIUrl,
  RequestBatchFromKliveAPI,
  RequestGETFromKliveAPI,
  RequestPOSTFromKliveAPI,
} from '~/scripts/APIInterface';
import { useCurrentProfile } from '~/composables/useCurrentProfile';
import { useEventStream } from '~/composables/useEventStream';

export type DashboardSeverity = 'critical' | 'warning' | 'info';
export type DashboardTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface DashboardAttentionItem {
  id: string;
  source: string;
  severity: DashboardSeverity;
  title: string;
  detail: string;
  timestamp?: string | null;
  href?: string;
}

export interface DashboardProjectRow {
  id: string;
  name: string;
  status: string;
  halted: boolean;
  activeAgents: number | null;
  budgetUsedPct: number;
  pendingApprovals: number;
  lastActivityAt?: string | null;
  blocker?: string | null;
}

export interface DashboardSchemeRow {
  id: string;
  label: string;
  href: string;
  primary: string;
  secondary: string;
  tertiary: string;
  tone: DashboardTone;
}

export interface DashboardEstateChip {
  id: string;
  label: string;
  value: string;
  tone: DashboardTone;
  href: string;
}

type Tier = 'fast' | 'slow';

const FAST_INTERVAL_MS = 15_000;
const SLOW_INTERVAL_MS = 60_000;
const FAST_STALE_MS = 45_000;
const SLOW_STALE_MS = 180_000;
const SAMPLE_LIMIT = 40;
const REQUEST_TIMEOUT_MS = 12_000;

const routes = {
  frontpage: '/GeneralBotStatistics/GetFrontpageStats',
  api: '/KliveAPI/Statistics',
  trader: '/api/omnitrader/firm/overview?trendDays=30',
  errors: '/api/logs?type=1&limit=5&sort=desc',
  logs: '/api/logs/summary?hours=24',
  uptime: '/System/UptimeStatistics',
  projects: '/projects/list',
  agentStatus: '/kliveagent/status',
  agentJobs: '/kliveagent/jobs?activeOnly=true',
  agentNotifications: '/kliveagent/notifications?unreadOnly=true',
  cloud: '/KliveCloud/GetDriveInfo',
  cs2: '/cs2arbitragebot/getscanalytics',
  memes: '/memescraper/memeScraperAnalytics',
  gram: '/omnigram/dashboard-stats',
  tumblr: '/omnitumblr/dashboard-stats',
  projectAnalytics: '/projects/analytics/all?range=7d',
  agentStats: '/kliveagent/stats/summary',
  defence: '/omnidefence/overview',
  omniscience: '/omniscience/stats/overview',
  mail: '/klivemail/stats',
  gadgets: '/klivetech/GetAllGadgets',
  games: '/klivegames/servers',
  linkAgents: '/klivelink/agents',
} as const;

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

function parsePayload(value: any): any {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || !['{', '['].includes(trimmed[0])) return value;
  try { return JSON.parse(trimmed); } catch { return value; }
}

function dateMs(value: unknown): number {
  if (!value) return 0;
  const ms = new Date(String(value)).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function isTerminalProject(status: unknown): boolean {
  const normalized = stringValue(status).toLowerCase();
  return normalized === 'completed' || normalized === 'archived';
}

function truncate(value: unknown, length = 130): string {
  const text = stringValue(value).replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function normalizeProject(project: any) {
  return {
    ...project,
    ProjectID: project?.ProjectID ?? project?.projectID ?? '',
    Name: project?.Name ?? project?.name ?? '',
    Status: project?.Status ?? project?.status ?? 'Unknown',
    Halted: project?.Halted ?? project?.halted ?? false,
    CreatedAt: project?.CreatedAt ?? project?.createdAt ?? null,
    TokenBudgetUsd: project?.TokenBudgetUsd ?? project?.tokenBudgetUsd ?? 0,
    TokenSpendUsd: project?.TokenSpendUsd ?? project?.tokenSpendUsd ?? 0,
    PendingApprovals: project?.PendingApprovals ?? project?.pendingApprovals ?? 0,
    Blocker: project?.Blocker ?? project?.blocker ?? null,
  };
}

function normalizeLog(log: any, index: number) {
  const errorInfo = log?.errorInfo ?? log?.ErrorInfo ?? {};
  return {
    ...log,
    id: log?.id ?? log?.Id ?? log?.logID ?? log?.LogID ?? index,
    serviceName: log?.serviceName ?? log?.ServiceName ?? 'Logs',
    message: log?.message ?? log?.Message ?? 'Recent error',
    fullMessage: log?.fullMessage
      ?? log?.FullMessage
      ?? errorInfo?.FullFormattedMessage
      ?? errorInfo?.fullFormattedMessage
      ?? log?.message
      ?? log?.Message
      ?? '',
    timestamp: log?.timestamp ?? log?.Timestamp ?? log?.TimeOfLog ?? log?.timeOfLog ?? null,
  };
}

function normalizeProjectAnalytics(payload: any) {
  const summary = payload?.Summary ?? payload?.summary ?? {};
  const series = asArray(payload?.Series ?? payload?.series);
  const projects = asArray(payload?.Projects ?? payload?.projects);
  return {
    ...payload,
    Summary: {
      ...summary,
      ActiveProjects: summary.ActiveProjects ?? summary.activeProjects ?? 0,
      ActiveAgents: summary.ActiveAgents ?? summary.activeAgents ?? 0,
      RangeSpendUsd: summary.RangeSpendUsd ?? summary.rangeSpendUsd ?? 0,
      Wakes: summary.Wakes ?? summary.wakes ?? 0,
      SuccessRate: summary.SuccessRate ?? summary.successRate ?? 0,
      RangeTokens: summary.RangeTokens ?? summary.rangeTokens ?? 0,
    },
    Series: series.map((point: any) => ({
      ...point,
      SpendUsd: point?.SpendUsd ?? point?.spendUsd ?? 0,
      Events: point?.Events ?? point?.events ?? 0,
    })),
    Projects: projects.map((project: any) => ({
      ...project,
      ProjectID: project?.ProjectID ?? project?.projectID ?? '',
      ActiveAgents: project?.ActiveAgents ?? project?.activeAgents ?? 0,
      BudgetUsedPct: project?.BudgetUsedPct ?? project?.budgetUsedPct ?? 0,
      LastActivityAt: project?.LastActivityAt ?? project?.lastActivityAt ?? null,
    })),
  };
}

export function useDashboardOverview() {
  const currentProfile = useCurrentProfile();
  const passwordCookie = useCookie<string>('password');
  const rank = computed(() => currentProfile.rank.value ?? 0);
  const isAdmin = computed(() => rank.value >= 4);
  const isKlives = computed(() => rank.value >= 5);

  const data = reactive<Record<string, any>>({
    frontpage: null,
    api: null,
    trader: null,
    errors: [],
    logs: null,
    uptime: null,
    projects: [],
    agentStatus: null,
    agentJobs: [],
    agentNotifications: [],
    cloud: null,
    cs2: null,
    memes: null,
    gram: null,
    tumblr: null,
    projectAnalytics: null,
    agentStats: null,
    defence: null,
    omniscience: null,
    mail: null,
    gadgets: [],
    games: null,
    linkAgents: [],
  });

  const routeErrors = reactive<Record<string, string>>({});
  const routeUnavailable = reactive<Record<string, boolean>>({});
  const routeFreshness = reactive<Record<string, number>>({});
  const initialLoading = reactive({ fast: true, slow: true });
  const inFlight = reactive({ fast: false, slow: false });
  const queued = reactive({ fast: false, slow: false });
  const freshness = reactive({ fast: 0, slow: 0 });
  const clock = ref(Date.now());
  const disposed = ref(false);
  const cpuSamples = ref<number[]>([]);
  const ramSamples = ref<number[]>([]);
  const actionPending = reactive({ restart: false, halt: false, safeMode: false, upload: false });
  const actionMessage = ref('');
  const safeModeAcknowledged = ref(false);
  const upload = reactive({ active: false, completed: 0, total: 0, percent: 0, error: '' });
  const requestControllers: Partial<Record<Tier, AbortController>> = {};

  let fastTimer: ReturnType<typeof setInterval> | null = null;
  let slowTimer: ReturnType<typeof setInterval> | null = null;
  let clockTimer: ReturnType<typeof setInterval> | null = null;
  let projectDebounce: ReturnType<typeof setTimeout> | null = null;
  let profileRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSampleAt = 0;
  let dashboardStarted = false;

  const fastManifest = computed(() => {
    const manifest: string[] = [routes.frontpage, routes.api, routes.trader];
    if (isAdmin.value) manifest.push(routes.errors, routes.logs, routes.uptime);
    if (isKlives.value) manifest.push(
      routes.projects,
      routes.agentStatus,
      routes.agentJobs,
      routes.agentNotifications,
    );
    return manifest;
  });

  const slowManifest = computed(() => {
    const manifest: string[] = [routes.cloud, routes.cs2, routes.memes, routes.gram, routes.tumblr];
    if (isKlives.value) manifest.push(
      routes.projectAnalytics,
      routes.agentStats,
      routes.defence,
      routes.omniscience,
      routes.mail,
      routes.gadgets,
      routes.games,
      routes.linkAgents,
    );
    return manifest;
  });

  function keyForPath(path: string): string | null {
    const match = Object.entries(routes).find(([, value]) => value === path);
    return match?.[0] ?? null;
  }

  function applyPayload(path: string, payload: any) {
    const key = keyForPath(path);
    if (!key) return;
    const parsed = parsePayload(payload);
    if (key === 'games') {
      data.games = parsed;
    } else if (key === 'projects') {
      data.projects = asArray(parsed).map(normalizeProject);
    } else if (key === 'projectAnalytics') {
      data.projectAnalytics = normalizeProjectAnalytics(parsed);
    } else if (key === 'errors') {
      data.errors = asArray(parsed).map(normalizeLog);
    } else if (['agentJobs', 'agentNotifications', 'gadgets', 'linkAgents'].includes(key)) {
      data[key] = asArray(parsed);
    } else {
      data[key] = parsed;
    }
    delete routeErrors[path];
    delete routeUnavailable[path];
  }

  function recordSamples() {
    const sampledAt = Date.now();
    if (lastSampleAt && sampledAt - lastSampleAt < FAST_INTERVAL_MS - 1_000) return;
    lastSampleAt = sampledAt;
    const cpu = numberValue(data.frontpage?.CpuUsagePercentage);
    const ram = numberValue(data.frontpage?.RamUsagePercentage);
    cpuSamples.value = [...cpuSamples.value, cpu].slice(-SAMPLE_LIMIT);
    ramSamples.value = [...ramSamples.value, ram].slice(-SAMPLE_LIMIT);
  }

  function updateTierFreshness(tier: Tier, paths: string[]) {
    const availablePaths = paths.filter(path => !routeUnavailable[path]);
    freshness[tier] = availablePaths.length
      ? Math.min(...availablePaths.map(path => routeFreshness[path] ?? 0))
      : 0;
  }

  async function fallbackFetch(paths: string[], signal: AbortSignal) {
    return Promise.all(paths.map(async path => {
      const response = await RequestGETFromKliveAPI(path, false, false, {}, signal);
      let body: any = null;
      try { body = await response.json(); }
      catch { try { body = await response.text(); } catch { body = null; } }
      return { path, ok: response.ok, status: response.status, body };
    }));
  }

  async function refreshTier(tier: Tier) {
    if (disposed.value || typeof document !== 'undefined' && document.hidden) return;
    if (!currentProfile.ready.value) await currentProfile.ensureLoaded();
    if (rank.value < 1) return;

    if (inFlight[tier]) {
      queued[tier] = true;
      return;
    }

    inFlight[tier] = true;
    queued[tier] = false;
    const paths = [...(tier === 'fast' ? fastManifest.value : slowManifest.value)];
    const successfulPaths = new Set<string>();
    const controller = new AbortController();
    requestControllers[tier] = controller;
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const batch = await RequestBatchFromKliveAPI(paths, controller.signal);
      const results = batch.size
        ? paths.map(path => {
            const item = batch.get(path);
            return { path, ok: !!item?.ok, status: item?.status ?? 504, body: item?.body };
          })
        : await fallbackFetch(paths, controller.signal);

      if (disposed.value) return;
      const refreshedAt = Date.now();
      for (const result of results) {
        if (result.ok) {
          successfulPaths.add(result.path);
          applyPayload(result.path, result.body);
          routeFreshness[result.path] = refreshedAt;
        } else {
          routeErrors[result.path] = `HTTP ${result.status}`;
          routeUnavailable[result.path] = result.status === 401 || result.status === 403 || result.status === 404;
        }
      }
      if (tier === 'fast' && successfulPaths.has(routes.frontpage)) recordSamples();
    } catch (error: any) {
      if (!disposed.value) {
        for (const path of paths) routeErrors[path] = error?.message || 'Request failed';
      }
    } finally {
      window.clearTimeout(timeout);
      if (requestControllers[tier] === controller) delete requestControllers[tier];
      if (disposed.value) return;
      updateTierFreshness(tier, paths);
      initialLoading[tier] = false;
      inFlight[tier] = false;
      if (queued[tier] && !disposed.value) {
        queued[tier] = false;
        void refreshTier(tier);
      }
    }
  }

  async function refreshAll() {
    await Promise.all([refreshTier('fast'), refreshTier('slow')]);
  }

  const projectStream = useEventStream({
    onFleet: () => {
      if (!isKlives.value || disposed.value || typeof document !== 'undefined' && document.hidden) return;
      if (projectDebounce) return;
      projectDebounce = setTimeout(() => {
        projectDebounce = null;
        void refreshTier('fast');
      }, 2_000);
    },
  });

  watch(isKlives, enabled => {
    if (enabled) projectStream.connect();
    else projectStream.disconnect();
  });

  function handleVisibility() {
    if (!document.hidden) void refreshAll();
  }

  function startDashboardRuntime() {
    if (disposed.value || dashboardStarted || rank.value < 1) return;
    dashboardStarted = true;
    if (isKlives.value) projectStream.connect();
    fastTimer = setInterval(() => void refreshTier('fast'), FAST_INTERVAL_MS);
    slowTimer = setInterval(() => void refreshTier('slow'), SLOW_INTERVAL_MS);
    // Start both tiers without coupling their schedules. A slow or hung optional
    // route must never prevent the 15-second operational tier from continuing.
    void refreshAll();
  }

  function scheduleProfileRetry() {
    if (disposed.value || profileRetryTimer || !currentProfile.error.value) return;
    profileRetryTimer = setTimeout(async () => {
      profileRetryTimer = null;
      if (disposed.value) return;
      await currentProfile.refresh();
      if (rank.value >= 1) startDashboardRuntime();
      else scheduleProfileRetry();
    }, 5_000);
  }

  onMounted(async () => {
    clockTimer = setInterval(() => { clock.value = Date.now(); }, 5_000);
    document.addEventListener('visibilitychange', handleVisibility);
    await currentProfile.ensureLoaded();
    if (disposed.value) return;
    if (rank.value >= 1) startDashboardRuntime();
    else scheduleProfileRetry();
  });

  onBeforeUnmount(() => {
    disposed.value = true;
    if (fastTimer) clearInterval(fastTimer);
    if (slowTimer) clearInterval(slowTimer);
    if (clockTimer) clearInterval(clockTimer);
    if (projectDebounce) clearTimeout(projectDebounce);
    if (profileRetryTimer) clearTimeout(profileRetryTimer);
    requestControllers.fast?.abort();
    requestControllers.slow?.abort();
    document.removeEventListener('visibilitychange', handleVisibility);
    projectStream.disconnect();
  });

  function tierIsStale(tier: Tier, threshold: number): boolean {
    const paths = tier === 'fast' ? fastManifest.value : slowManifest.value;
    const availablePaths = paths.filter(path => !routeUnavailable[path]);
    return !availablePaths.length || availablePaths.some(path => {
      const updatedAt = routeFreshness[path] ?? 0;
      return !!routeErrors[path] || !updatedAt || clock.value - updatedAt > threshold;
    });
  }

  const fastStale = computed(() => tierIsStale('fast', FAST_STALE_MS));
  const slowStale = computed(() => tierIsStale('slow', SLOW_STALE_MS));
  const lastUpdatedAt = computed(() => Math.max(freshness.fast, freshness.slow));
  const offlineServices = computed(() => asArray(data.frontpage?.Services).filter((service: any) => !service?.IsActive));
  const primaryDisk = computed(() => asArray(data.frontpage?.DiskStatistics)[0] || null);
  const apiLifetime = computed(() => data.api?.lifetime || {});

  const analyticsProjects = computed(() => {
    const rows = asArray(data.projectAnalytics?.Projects);
    return new Map(rows.map((row: any) => [stringValue(row.ProjectID), row]));
  });

  const projectRows = computed<DashboardProjectRow[]>(() => {
    return asArray(data.projects)
      .filter((project: any) => !isTerminalProject(project?.Status))
      .map((project: any) => {
        const analytics: any = analyticsProjects.value.get(stringValue(project?.ProjectID)) || {};
        const analyticsAvailable = !!routeFreshness[routes.projectAnalytics] && !routeUnavailable[routes.projectAnalytics];
        const spend = numberValue(project?.TokenSpendUsd);
        const budget = numberValue(project?.TokenBudgetUsd);
        return {
          id: stringValue(project?.ProjectID),
          name: stringValue(project?.Name, 'Unnamed project'),
          status: stringValue(project?.Status, 'Unknown'),
          halted: !!project?.Halted,
          activeAgents: analyticsAvailable ? numberValue(analytics?.ActiveAgents) : null,
          budgetUsedPct: budget > 0 ? Math.min(100, spend / budget * 100) : numberValue(analytics?.BudgetUsedPct),
          pendingApprovals: numberValue(project?.PendingApprovals),
          lastActivityAt: analyticsAvailable ? analytics?.LastActivityAt || null : null,
          blocker: project?.Blocker || null,
        };
      })
      .sort((left, right) => {
        const score = (row: DashboardProjectRow) => {
          const state = row.status.toLowerCase();
          return row.pendingApprovals * 100
            + (state === 'blocked' || state === 'budgetpaused' ? 80 : 0)
            + (state === 'active' || state === 'planning' ? 30 : 0);
        };
        return score(right) - score(left) || dateMs(right.lastActivityAt) - dateMs(left.lastActivityAt);
      });
  });

  const activeProjectCount = computed(() => projectRows.value.filter(project => !project.halted).length);

  const attentionItems = computed<DashboardAttentionItem[]>(() => {
    const items = new Map<string, DashboardAttentionItem>();
    const add = (item: DashboardAttentionItem) => { if (!items.has(item.id)) items.set(item.id, item); };

    const traderExceptions = data.trader?.Exceptions || {};
    const unknownOrders = numberValue(traderExceptions.UnknownOrders);
    const materialBreaks = numberValue(traderExceptions.MaterialBreaks);
    const criticalAlerts = Math.max(
      numberValue(traderExceptions.CriticalAlerts),
      numberValue(traderExceptions.UnacknowledgedCritical),
    );
    if (unknownOrders || materialBreaks || criticalAlerts) {
      add({
        id: 'trader-exceptions', source: 'OmniTrader', severity: 'critical',
        title: 'Trading exceptions require attention',
        detail: `${unknownOrders} unknown orders · ${materialBreaks} material breaks · ${criticalAlerts} critical alerts`,
        timestamp: data.trader?.AsOfUtc, href: '/omnitrader',
      });
    }
    if (data.trader?.Controls?.SafeModeActive || safeModeAcknowledged.value) {
      add({
        id: 'trader-safe-mode', source: 'OmniTrader', severity: 'warning', title: 'Firm safe mode is active',
        detail: stringValue(data.trader?.Controls?.SafeModeReason, 'Trading is restricted'),
        timestamp: data.trader?.Controls?.SafeModeSinceUtc, href: '/omnitrader/risk',
      });
    }

    if (offlineServices.value.length) {
      add({
        id: 'offline-services', source: 'Services', severity: 'critical',
        title: `${offlineServices.value.length} service${offlineServices.value.length === 1 ? '' : 's'} offline`,
        detail: offlineServices.value.map((service: any) => stringValue(service?.Name)).filter(Boolean).join(', '),
        timestamp: data.frontpage?.TimeStatisticsGenerated, href: isAdmin.value ? '/admin' : undefined,
      });
    }

    const resources = [
      ['cpu', 'CPU', numberValue(data.frontpage?.CpuUsagePercentage)],
      ['ram', 'RAM', numberValue(data.frontpage?.RamUsagePercentage)],
      ['disk', 'Disk', numberValue(primaryDisk.value?.UsagePercentage ?? data.cloud?.UsagePercentage)],
    ] as const;
    for (const [id, label, value] of resources) {
      if (value > 85) add({
        id: `resource-${id}`, source: 'Host', severity: 'critical', title: `${label} pressure is high`,
        detail: `${value.toFixed(1)}% utilised`, timestamp: data.frontpage?.TimeStatisticsGenerated,
        href: isAdmin.value ? '/admin' : undefined,
      });
    }

    for (const project of projectRows.value) {
      const state = project.status.toLowerCase();
      if (!project.pendingApprovals && state !== 'blocked' && state !== 'budgetpaused') continue;
      const reasons = [
        project.pendingApprovals ? `${project.pendingApprovals} approval${project.pendingApprovals === 1 ? '' : 's'}` : '',
        state === 'blocked' ? 'blocked' : '',
        state === 'budgetpaused' ? 'budget paused' : '',
      ].filter(Boolean).join(' · ');
      add({
        id: `project-${project.id}`, source: 'Projects', severity: 'warning', title: project.name,
        detail: project.blocker ? `${reasons}: ${truncate(project.blocker, 90)}` : reasons,
        timestamp: project.lastActivityAt, href: `/projects/${encodeURIComponent(project.id)}`,
      });
    }

    if (isKlives.value && data.agentStatus && !data.agentStatus.ready) {
      add({
        id: 'agent-not-ready', source: 'KliveAgent', severity: 'warning', title: 'Agent is not ready',
        detail: stringValue(data.agentStatus.message || data.agentStatus.state, 'Agent is initializing'), href: '/kliveagent',
      });
    }
    for (const job of asArray(data.agentJobs)) {
      if (!job?.attentionRequired) continue;
      add({
        id: `agent-job-${job.jobId}`, source: 'KliveAgent', severity: 'warning',
        title: stringValue(job.name, 'Long-term job needs attention'),
        detail: truncate(job.attentionMessage || job.goal || job.status), timestamp: job.lastUpdated, href: '/kliveagent',
      });
    }
    for (const notification of asArray(data.agentNotifications)) {
      const signal = `${stringValue(notification?.kind)} ${stringValue(notification?.title)}`.toLowerCase();
      if (!/(attention|failed|failure|ended|error)/.test(signal)) continue;
      add({
        id: `notification-${notification?.notificationId}`,
        source: 'KliveAgent',
        severity: 'warning',
        title: stringValue(notification?.title, 'Agent needs attention'),
        detail: truncate(notification?.body),
        timestamp: notification?.createdAt,
        href: '/kliveagent',
      });
    }

    const blocked = numberValue(data.defence?.blockedIps);
    const tarpitted = numberValue(data.defence?.tarpitIps);
    if (blocked || tarpitted) add({
      id: 'security-active', source: 'OmniDefence', severity: 'warning', title: 'Active network containment',
      detail: `${blocked} blocked · ${tarpitted} tarpitted`, href: '/omnidefence',
    });

    for (const [index, log] of asArray(data.errors).entries()) {
      add({
        id: `error-${log?.id ?? log?.Id ?? index}`, source: stringValue(log?.serviceName || log?.ServiceName, 'Logs'),
        severity: 'warning', title: truncate(log?.message || log?.Message || 'Recent error', 80),
        detail: truncate(log?.fullMessage || log?.FullMessage || log?.message || log?.Message, 120),
        timestamp: log?.timestamp || log?.Timestamp, href: '/admin',
      });
    }

    const unread = numberValue(data.mail?.unread);
    if (unread) add({
      id: 'mail-unread', source: 'KliveMail', severity: 'info', title: `${unread} unread message${unread === 1 ? '' : 's'}`,
      detail: 'Open the inbox to review new mail', href: '/klivemail',
    });

    const priority: Record<DashboardSeverity, number> = { critical: 3, warning: 2, info: 1 };
    return [...items.values()].sort((left, right) =>
      priority[right.severity] - priority[left.severity]
      || dateMs(right.timestamp) - dateMs(left.timestamp));
  });

  const recentSignals = computed<DashboardAttentionItem[]>(() => {
    const signals = [...attentionItems.value];
    for (const notification of asArray(data.agentNotifications)) {
      signals.push({
        id: `notification-${notification?.notificationId}`,
        source: 'KliveAgent', severity: 'info', title: stringValue(notification?.title, 'Agent notification'),
        detail: truncate(notification?.body), timestamp: notification?.createdAt, href: '/kliveagent',
      });
    }
    const seen = new Set<string>();
    return signals
      .sort((left, right) => dateMs(right.timestamp) - dateMs(left.timestamp))
      .filter(item => !seen.has(item.id) && !!seen.add(item.id));
  });

  function todayMemeDownloads(): number {
    const values = data.memes?.MemesDownloadedPerDay || {};
    const today = new Date().toDateString();
    for (const [key, value] of Object.entries(values)) {
      const parsed = new Date(key);
      if (Number.isFinite(parsed.getTime()) && parsed.toDateString() === today) return numberValue(value);
      if (key === new Date().toISOString().slice(0, 10)) return numberValue(value);
    }
    return 0;
  }

  const schemeRows = computed<DashboardSchemeRow[]>(() => {
    const cs2Scans = numberValue(data.cs2?.TotalListingsScanned);
    const cs2Chance = numberValue(data.cs2?.PercentageChanceOfFindingPositiveGainListing);
    const bestRaw = numberValue(data.cs2?.HighestPredictedGainFoundSoFar);
    const hasBestResult = cs2Scans > 0 && bestRaw > 0;
    const bestPct = (bestRaw - 1) * 100;
    const gramTotal = numberValue(data.gram?.TotalAccounts);
    const tumblrTotal = numberValue(data.tumblr?.TotalAccounts);
    const rows: DashboardSchemeRow[] = [
      {
        id: 'cs2', label: 'CS2 Arbitrage', href: '/schemery/cs2arbitragebot',
        primary: `${cs2Scans.toLocaleString()} scans`,
        secondary: `${cs2Chance.toFixed(1)}% positive`,
        tertiary: hasBestResult ? `${bestPct >= 0 ? '+' : ''}${bestPct.toFixed(1)}% best` : '— no result',
        tone: hasBestResult && bestPct > 0 ? 'success' : 'neutral',
      },
      {
        id: 'memes', label: 'MemeScraper', href: '/schemery/memescraper',
        primary: `${numberValue(data.memes?.TotalReelsDownloaded).toLocaleString()} reels`,
        secondary: `+${todayMemeDownloads()} today`, tertiary: `${numberValue(data.memes?.TotalInstagramSources)} sources`,
        tone: 'info',
      },
      {
        id: 'gram', label: 'OmniGram', href: '/schemery/omnigram',
        primary: `${numberValue(data.gram?.ActiveAccounts)}/${gramTotal} active`,
        secondary: `${numberValue(data.gram?.PendingCount)} pending`, tertiary: `${numberValue(data.gram?.SuccessRate).toFixed(1)}% success`,
        tone: numberValue(data.gram?.PendingCount) ? 'warning' : 'success',
      },
      {
        id: 'tumblr', label: 'OmniTumblr', href: '/schemery/omnitumblr',
        primary: `${numberValue(data.tumblr?.ActiveAccounts)}/${tumblrTotal} active`,
        secondary: `${numberValue(data.tumblr?.PendingCount)} pending`, tertiary: `${numberValue(data.tumblr?.SuccessRate).toFixed(1)}% success`,
        tone: numberValue(data.tumblr?.PendingCount) ? 'warning' : 'success',
      },
    ];
    return rows.filter(row => {
      const routeByScheme: Record<string, string> = {
        cs2: routes.cs2,
        memes: routes.memes,
        gram: routes.gram,
        tumblr: routes.tumblr,
      };
      const path = routeByScheme[row.id];
      return !!routeFreshness[path] && !routeUnavailable[path];
    });
  });

  const gameServers = computed(() => asArray(data.games?.servers));
  const estateChips = computed<DashboardEstateChip[]>(() => {
    const available = (path: string) => !!routeFreshness[path] && !routeUnavailable[path];
    const chips: DashboardEstateChip[] = [];
    if (available(routes.cloud)) chips.push({
      id: 'cloud', label: 'Storage drive', value: `${numberValue(data.cloud?.UsagePercentage).toFixed(0)}% used`,
      tone: numberValue(data.cloud?.UsagePercentage) > 85 ? 'danger' : 'success', href: '/klivecloud',
    });
    if (!isKlives.value) return chips;
    const gadgets = asArray(data.gadgets);
    const onlineGadgets = gadgets.filter((gadget: any) => !!gadget?.isOnline).length;
    const servers = gameServers.value;
    const runningServers = servers.filter((server: any) => ['running', 'ready', 'started'].includes(stringValue(server?.Status).toLowerCase())).length;
    const links = asArray(data.linkAgents);
    if (available(routes.mail)) chips.push({ id: 'mail', label: 'Mail', value: `${numberValue(data.mail?.unread)} unread`, tone: numberValue(data.mail?.unread) ? 'warning' : 'success', href: '/klivemail' });
    if (available(routes.gadgets)) chips.push({ id: 'gadgets', label: 'Gadgets', value: `${onlineGadgets}/${gadgets.length} online`, tone: gadgets.length && !onlineGadgets ? 'danger' : 'success', href: '/klivetech' });
    if (available(routes.games)) chips.push({ id: 'games', label: 'Games', value: `${runningServers}/${servers.length} running`, tone: 'info', href: '/klivegames' });
    if (available(routes.linkAgents)) chips.push({ id: 'links', label: 'KliveLink', value: `${links.filter((agent: any) => agent?.IsConnected !== false).length} connected`, tone: links.length ? 'success' : 'neutral', href: '/klivelink' });
    if (available(routes.defence)) chips.push({ id: 'security', label: 'Defence', value: `${numberValue(data.defence?.blockedIps)} blocked`, tone: numberValue(data.defence?.blockedIps) ? 'warning' : 'success', href: '/omnidefence' });
    if (available(routes.omniscience)) chips.push({ id: 'intel', label: 'Radar', value: `${numberValue(data.omniscience?.radar_alerts_24h)} in 24h`, tone: numberValue(data.omniscience?.radar_alerts_24h) ? 'warning' : 'success', href: '/omniscience' });
    return chips;
  });

  const projectTrend = computed<number[]>(() => asArray(data.projectAnalytics?.Series).map((point: any) =>
    numberValue(point?.SpendUsd ?? point?.TokenSpendUsd ?? point?.CostUsd ?? point?.Events)));
  const traderTrend = computed<number[]>(() => asArray(data.trader?.Trend?.Points).map((point: any) =>
    numberValue(point?.Value ?? point?.TotalValue ?? point?.value ?? point?.totalValue)));

  async function restartService(serviceName: string): Promise<{ queued: boolean; verified: boolean; message: string }> {
    if (!isKlives.value || actionPending.restart) throw new Error('Restart is unavailable.');
    const selectedService = offlineServices.value.find((service: any) => stringValue(service?.Name) === serviceName);
    if (!selectedService) throw new Error('Only a currently inactive service can be restarted here.');
    actionPending.restart = true;
    actionMessage.value = `Queueing restart for ${serviceName}…`;
    try {
      const response = await RequestPOSTFromKliveAPI(
        '/GeneralBotStatistics/RestartService', JSON.stringify({ serviceName, onlyIfInactive: true }), false, true,
      );
      const body = parsePayload(await response.text());
      if (!response.ok || body?.Success === false) throw new Error(body?.Error || body?.Message || 'Restart request failed.');
      actionMessage.value = `Restart queued for ${serviceName}; verifying…`;
      for (let attempt = 0; attempt < 15 && !disposed.value; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2_000));
        await refreshTier('fast');
        const service = asArray(data.frontpage?.Services).find((item: any) => item?.Name === serviceName);
        if (service?.IsActive) {
          actionMessage.value = `${serviceName} is online.`;
          return { queued: true, verified: true, message: actionMessage.value };
        }
      }
      actionMessage.value = `${serviceName} restart is queued; verification is still pending.`;
      return { queued: true, verified: false, message: actionMessage.value };
    } finally {
      actionPending.restart = false;
    }
  }

  async function haltProjects() {
    if (!isKlives.value || actionPending.halt || !activeProjectCount.value) throw new Error('Project halt is unavailable.');
    actionPending.halt = true;
    try {
      const response = await RequestPOSTFromKliveAPI('/projects/halt-all', '', false, false);
      const body = parsePayload(await response.text());
      if (!response.ok || body?.ok === false) throw new Error(body?.error || 'Failed to halt projects.');
      actionMessage.value = `${numberValue(body?.halted)} project${numberValue(body?.halted) === 1 ? '' : 's'} halted.`;
      await refreshTier('fast');
      return body;
    } finally {
      actionPending.halt = false;
    }
  }

  async function enterFirmSafeMode() {
    if (!isKlives.value || actionPending.safeMode || data.trader?.Controls?.SafeModeActive || safeModeAcknowledged.value) throw new Error('Firm safe mode is unavailable.');
    actionPending.safeMode = true;
    try {
      const query = '/api/omnitrader/firm/risk/safe-mode?enable=true&reason=dashboard%20protective%20action';
      const response = await RequestPOSTFromKliveAPI(query, '', false, false);
      const body = parsePayload(await response.text());
      if (!response.ok) throw new Error(body?.error || 'Failed to enter Firm safe mode.');
      const safeModeSinceUtc = new Date().toISOString();
      const applyConfirmedSafeMode = () => {
        safeModeAcknowledged.value = true;
        if (!data.trader || typeof data.trader !== 'object') return;
        const trader = data.trader;
        const controls = trader.Controls && typeof trader.Controls === 'object' ? trader.Controls : {};
        data.trader = {
          ...trader,
          Controls: {
            ...controls,
            SafeModeActive: body?.SafeModeActive ?? body?.safeModeActive ?? true,
            SafeModeReason: body?.SafeModeReason ?? body?.safeModeReason ?? 'dashboard protective action',
            SafeModeSinceUtc: controls.SafeModeSinceUtc ?? safeModeSinceUtc,
          },
        };
      };
      applyConfirmedSafeMode();
      actionMessage.value = 'Firm safe mode is active.';
      await refreshTier('fast');
      // The overview can briefly be served from its pre-action cache. Keep the
      // acknowledged protective state until a later poll returns the new value.
      applyConfirmedSafeMode();
      return body;
    } finally {
      actionPending.safeMode = false;
    }
  }

  function uploadOne(file: File, completedBytes: number, totalBytes: number): Promise<void> {
    const password = passwordCookie.value || '';
    const query = `${KliveAPIUrl}/KliveCloud/UploadFile?fileName=${encodeURIComponent(file.name)}&permissionLevel=1`;
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', query, true);
      xhr.setRequestHeader('Authorization', password);
      xhr.setRequestHeader('X-Klive-Client', 'website');
      xhr.setRequestHeader('X-Klive-Page', '/dashboard');
      xhr.upload.onprogress = event => {
        if (!event.lengthComputable) return;
        upload.percent = totalBytes > 0 ? Math.min(99, Math.round((completedBytes + event.loaded) / totalBytes * 100)) : 0;
      };
      xhr.onload = () => xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(xhr.responseText || `Upload failed (${xhr.status})`));
      xhr.onerror = () => reject(new Error('Upload failed because the network connection was lost.'));
      xhr.send(file);
    });
  }

  async function uploadFiles(files: File[]) {
    if (actionPending.upload || !files.length) return;
    actionPending.upload = true;
    upload.active = true;
    upload.completed = 0;
    upload.total = files.length;
    upload.percent = 0;
    upload.error = '';
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    let completedBytes = 0;
    const failures: string[] = [];
    try {
      let successfulUploads = 0;
      for (const file of files) {
        try {
          await uploadOne(file, completedBytes, totalBytes);
          successfulUploads++;
          upload.completed = successfulUploads;
        }
        catch (error: any) { failures.push(`${file.name}: ${error?.message || 'upload failed'}`); }
        completedBytes += file.size;
        upload.percent = totalBytes > 0 ? Math.round(completedBytes / totalBytes * 100) : 100;
      }
      if (successfulUploads) await refreshTier('slow');
      if (failures.length) throw new Error(failures.join('\n'));
      actionMessage.value = `${files.length} file${files.length === 1 ? '' : 's'} uploaded to KliveCloud root.`;
    } catch (error: any) {
      upload.error = error?.message || 'Upload failed.';
      throw error;
    } finally {
      actionPending.upload = false;
      upload.active = false;
    }
  }

  return {
    currentProfile,
    rank,
    isAdmin,
    isKlives,
    data,
    routeErrors,
    routeUnavailable,
    routeFreshness,
    initialLoading,
    inFlight,
    freshness,
    fastStale,
    slowStale,
    lastUpdatedAt,
    cpuSamples,
    ramSamples,
    offlineServices,
    primaryDisk,
    apiLifetime,
    projectRows,
    activeProjectCount,
    attentionItems,
    recentSignals,
    schemeRows,
    estateChips,
    projectTrend,
    traderTrend,
    actionPending,
    actionMessage,
    safeModeAcknowledged,
    upload,
    refreshFast: () => refreshTier('fast'),
    refreshSlow: () => refreshTier('slow'),
    refreshAll,
    restartService,
    haltProjects,
    enterFirmSafeMode,
    uploadFiles,
  };
}
