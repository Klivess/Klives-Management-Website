import type { Page, Route } from '@playwright/test';

export type DashboardRole = 'Guest' | 'Admin' | 'Klives';

export interface DashboardApiMock {
  requestedPaths: string[];
  mutations: Array<{ method: string; path: string; body: string | null }>;
  batchCalls: number;
}

const roleRank: Record<DashboardRole, number> = {
  Guest: 1,
  Admin: 4,
  Klives: 5,
};

export const dashboardTestOrigin = new URL(
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '4173'}`,
).origin;

const now = new Date('2026-08-11T10:00:00.000Z');
const today = now.toISOString().slice(0, 10);

const services = [
  { Name: 'KliveAPI', IsActive: true, UptimeHumanized: '2d 4h' },
  { Name: 'KliveAgent', IsActive: true, UptimeHumanized: '2d 4h' },
  { Name: 'OmniTrader', IsActive: false, UptimeHumanized: 'offline' },
  { Name: 'Projects', IsActive: true, UptimeHumanized: '2d 4h' },
];

const projects = [
  {
    projectID: 'project-approval',
    name: 'Launch control centre with an intentionally very long name that must clamp',
    goal: 'Ship the new operations view',
    status: 'Active',
    createdAt: '2026-08-08T09:00:00Z',
    lastActivityUtc: '2026-08-11T09:58:00Z',
    tokenBudgetUsd: 20,
    moneyBudgetUsd: 10,
    subAgentCap: 4,
    activeAgents: 3,
    tokenSpendUsd: 12.5,
    moneySpendUsd: 1,
    pendingApprovals: 2,
    halted: false,
    blocker: '',
  },
  {
    projectID: 'project-blocked',
    name: 'Supplier research',
    goal: 'Compare component suppliers',
    status: 'Blocked',
    createdAt: '2026-08-07T09:00:00Z',
    lastActivityUtc: '2026-08-11T09:40:00Z',
    tokenBudgetUsd: 15,
    moneyBudgetUsd: 0,
    subAgentCap: 3,
    activeAgents: 1,
    tokenSpendUsd: 7.5,
    moneySpendUsd: 0,
    pendingApprovals: 0,
    halted: false,
    blocker: 'Waiting for owner input',
  },
  {
    projectID: 'project-active',
    name: 'Documentation refresh',
    goal: 'Refresh operating docs',
    status: 'Active',
    createdAt: '2026-08-06T09:00:00Z',
    lastActivityUtc: '2026-08-11T09:30:00Z',
    tokenBudgetUsd: 8,
    moneyBudgetUsd: 0,
    subAgentCap: 2,
    activeAgents: 1,
    tokenSpendUsd: 2,
    moneySpendUsd: 0,
    pendingApprovals: 0,
    halted: false,
    blocker: '',
  },
];

const logs = [
  {
    logID: 'production-log-1',
    TimeOfLog: '2026-08-11T09:56:00Z',
    type: 1,
    serviceName: 'OmniTrader',
    errorInfo: {
      FullFormattedMessage: 'Production DTO failure: market-data polling failed after every configured venue timed out; the dashboard must display this bounded diagnostic without expanding its panel.',
    },
  },
  {
    id: 'log-2',
    timestamp: '2026-08-11T09:52:00Z',
    type: 0,
    logType: 'Information',
    serviceName: 'Projects',
    message: 'Commander wake completed.',
  },
];

const firmOverview = {
  AsOfUtc: now.toISOString(),
  Portfolio: {
    ReportingCurrency: 'GBP',
    TotalValue: 12_450.25,
    Cash: 7_250,
    InventoryValue: 5_200.25,
    DerivativeEquity: 0,
    DerivativeNotional: 0,
    GrossExposure: 5_200.25,
    NetExposure: 5_200.25,
    UnrealizedPnL: 105.2,
    RealizedPnLToday: 42.1,
    CostsToday: 1.3,
    HasRealAccounts: true,
    Warnings: [],
  },
  Simulated: {
    TotalValue: 25_100,
    Cash: 20_000,
    InventoryValue: 5_100,
    UnrealizedPnL: 250,
    GrossExposure: 5_100,
    RealizedPnLToday: -12,
  },
  Health: { TradingPermitted: false, Summary: 'Attention required', Blockers: ['Unknown order'] },
  Controls: { SafeModeActive: false, SafeModeReason: '', SafeModeSinceUtc: null, KillSwitches: [] },
  Exceptions: {
    AwaitingApproval: 1,
    UnknownOrders: 1,
    MaterialBreaks: 1,
    CriticalAlerts: 1,
    UnacknowledgedCritical: 1,
  },
  Alerts: [
    {
      Id: 'alert-1',
      Severity: 'Critical',
      Title: 'Unknown live order',
      Message: 'A broker order needs reconciliation.',
      CreatedUtc: '2026-08-11T09:57:00Z',
      NeedsAcknowledgement: true,
    },
  ],
  Trend: Array.from({ length: 30 }, (_, index) => ({
    Timestamp: new Date(Date.UTC(2026, 6, 13 + index)).toISOString(),
    Value: 12_000 + index * 15,
  })),
};

function responseForPath(pathWithQuery: string, role: DashboardRole): unknown {
  const url = new URL(pathWithQuery, 'https://klive.dev');
  const path = url.pathname;

  switch (path) {
    case '/KMProfiles/GetCurrentProfile':
      return {
        UserID: `e2e-${role.toLowerCase()}`,
        Name: `${role} Fixture`,
        Username: `${role} Fixture`,
        KlivesManagementRank: roleRank[role],
      };
    case '/GeneralBotStatistics/GetFrontpageStats':
      return {
        BotUptimeHumanized: '2d 4h',
        CpuUsagePercentage: 37,
        RamUsagePercentage: 62,
        RamUsedGB: 19.8,
        RamTotalGB: 32,
        ProcessMemoryMB: 734,
        TotalServicesActive: 3,
        TotalServicesRegistered: 4,
        TotalLogs: 42_500,
        TotalErrorLogs: 1,
        TotalScheduledTasks: 8,
        NextTaskScheduledSummary: 'RAG refresh in 6 minutes',
        lastOmnipotentUpdateHumanized: '4 minutes ago',
        DiskStatistics: [
          { Name: 'C:', DriveName: 'C:', TotalSizeGB: 1000, UsedSpaceGB: 712, UsagePercentage: 71.2 },
        ],
        Services: services,
      };
    case '/GeneralBotStatistics/GetHardwareStats':
      return {
        CpuUsagePercentage: 37,
        RamUsagePercentage: 62,
        RamUsedGB: 19.8,
        RamTotalGB: 32,
        DiskStatistics: [
          { Name: 'C:', DriveName: 'C:', TotalSizeGB: 1000, UsedSpaceGB: 712, UsagePercentage: 71.2 },
        ],
      };
    case '/GeneralBotStatistics/GetServicesStats':
      return { TotalServicesActive: 3, TotalServicesRegistered: 4, Services: services };
    case '/GeneralBotStatistics/GetProcessStats':
      return { ProcessMemoryMB: 734, ProcessThreadCount: 58, GCTotalMemoryMB: 380 };
    case '/KliveAPI/Statistics':
      return {
        lifetime: {
          totalRequests: 42_500,
          successfulRequests: 42_120,
          clientErrorRequests: 300,
          serverErrorRequests: 80,
          avgResponseMs: 18.4,
          maxResponseMs: 812,
          availabilityPct: 99.81,
          lastRequestAt: '2026-08-11T09:59:58Z',
        },
        dailyHistory: [],
        topRoutes: [],
        slowestRoutes: [],
      };
    case '/System/UptimeStatistics':
      return {
        TotalUptimeSeconds: 792_000,
        AverageUptimeHours: 44,
        CurrentUptimeSeconds: 187_200,
        TotalOutageSeconds: 1_200,
        TotalPeriods: 5,
        Periods: [],
      };
    case '/api/logs':
      return url.searchParams.get('type') === '1' ? logs.filter((entry) => entry.type === 1) : logs;
    case '/api/logs/summary':
      return { TotalLogs: 42_500, ErrorCount: 1, WarningCount: 3, Hours: 24 };
    case '/projects/list':
      return projects;
    case '/projects/analytics/all':
      return {
        range: '7d',
        summary: {
          activeProjects: 3,
          activeAgents: 5,
          rangeSpendUsd: 22,
          wakes: 48,
          successRate: 89.6,
          rangeTokens: 42_000,
        },
        series: Array.from({ length: 7 }, (_, index) => ({
          day: new Date(Date.UTC(2026, 7, 5 + index)).toISOString(),
          spendUsd: 2 + index * 0.35,
          events: 4 + index,
        })),
        projects: [
          { projectID: 'project-approval', activeAgents: 3, budgetUsedPct: 62.5, lastActivityAt: '2026-08-11T09:58:00Z' },
          { projectID: 'project-blocked', activeAgents: 1, budgetUsedPct: 50, lastActivityAt: '2026-08-11T09:40:00Z' },
          { projectID: 'project-active', activeAgents: 1, budgetUsedPct: 25, lastActivityAt: '2026-08-11T09:30:00Z' },
        ],
      };
    case '/kliveagent/status':
      return { ready: true, state: 'Ready', progress: 1, message: 'Ready' };
    case '/kliveagent/jobs':
      return [
        {
          jobId: 'job-1',
          name: 'Audit dashboard data',
          goal: 'Validate the compact overview',
          status: 'Active',
          attentionRequired: true,
          attentionMessage: 'Confirmation needed before publishing.',
          lastUpdated: '2026-08-11T09:55:00Z',
        },
      ];
    case '/kliveagent/notifications':
      return [
        {
          notificationId: 'notification-1',
          kind: 'attention',
          title: 'Agent needs attention',
          body: 'One confirmation is waiting.',
          read: false,
          createdAt: '2026-08-11T09:54:00Z',
        },
      ];
    case '/kliveagent/stats/summary':
      return {
        LifetimeScriptsRun: 120,
        LifetimeScriptsSucceeded: 114,
        LifetimeScriptSuccessRatePct: 95,
        TodayScriptsRun: 12,
        TodayScriptsSucceeded: 11,
        TodayScriptSuccessRatePct: 91.7,
        TodayMessages: 18,
        TodayPromptTokens: 12_500,
        TodayCompletionTokens: 3_400,
        TodayTotalTokens: 15_900,
        TodayIterations: 24,
        TodayEstimatedCostUsd: 0.82,
      };
    case '/api/omnitrader/firm/overview':
      return firmOverview;
    case '/api/omnitrader/status':
      return { KrakenConfigured: true, DatabaseReady: true, StartedUtc: '2026-08-10T00:00:00Z' };
    case '/api/omnitrader/deployments':
      return [
        { Id: 'paper-1', Mode: 'Paper', Status: 'Running', EquityInitial: 10_000, EquityCurrent: 10_200, Armed: false },
      ];
    case '/api/omnitrader/backtests':
      return [{ Id: 'backtest-1', Status: 'Completed' }];
    case '/cs2arbitragebot/getscanalytics':
      return {
        PercentageChanceOfFindingPositiveGainListing: 8.4,
        TotalListingsScanned: 42_018,
        HighestPredictedGainFoundSoFar: 1.237,
      };
    case '/memescraper/memeScraperAnalytics':
      return {
        TotalInstagramSources: 8,
        TotalReelsDownloaded: 1_284,
        MemesDownloadedPerDay: { [today]: 17 },
        ReelsDownloadedPerSource: { fixture_source: 400 },
        TopNichesByDownload: { tech: 100 },
      };
    case '/omnigram/dashboard-stats':
      return { TotalAccounts: 3, ActiveAccounts: 2, TotalPosts: 50, PostedCount: 45, PendingCount: 5, SuccessRate: 96 };
    case '/omnitumblr/dashboard-stats':
      return { TotalAccounts: 2, ActiveAccounts: 2, TotalPosts: 30, PostedCount: 27, PendingCount: 3, SuccessRate: 93 };
    case '/KliveCloud/GetDriveInfo':
      return {
        TotalSpaceGB: 1000,
        UsedSpaceGB: 412,
        AvailableSpaceGB: 588,
        UsagePercentage: 41.2,
        totalBytes: 1_000_000_000_000,
        usedBytes: 412_000_000_000,
      };
    case '/klivemail/stats':
      return { unread: 7, mailboxCount: 4, messageCount: 320, unreadCount: 7, MailboxCount: 4, MessageCount: 320, UnreadCount: 7 };
    case '/omnidefence/overview':
      return {
        blockedIps: 3,
        tarpitIps: 1,
        blocked: 3,
        tarpitted: 1,
        watched: 6,
        totalRequests24h: 14_000,
        Blocked: 3,
        Tarpitted: 1,
        Watched: 6,
      };
    case '/omniscience/stats/overview':
      return { Persons: 42, Messages: 20_000, RadarAlerts: 2, radarAlerts: 2, radar_alerts_24h: 2 };
    case '/klivetech/GetAllGadgets':
      return [
        { gadgetID: 'gadget-1', name: 'Desk display', connected: true, IsConnected: true, isOnline: true },
        { gadgetID: 'gadget-2', name: 'Sensor', connected: false, IsConnected: false, isOnline: false },
      ];
    case '/klivegames/servers':
      return { servers: [
          { Id: 'game-1', Name: 'Build server', Status: 'Running', Game: 'Minecraft' },
          { Id: 'game-2', Name: 'Terraria', Status: 'Stopped', Game: 'Terraria' },
        ] };
    case '/klivelink/agents':
      return [{ agentId: 'link-1', machineName: 'DESKTOP', connected: true }];
    default:
      return { success: true };
  }
}

async function fulfilJson(route: Route, payload: unknown, status = 200) {
  await route.fulfill({
    status,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
      'access-control-allow-headers': 'Authorization, Content-Type, X-Klive-Client, X-Klive-Page',
      'content-type': 'application/json; charset=utf-8',
    },
    body: status === 204 ? '' : JSON.stringify(payload),
  });
}

/**
 * Installs a complete in-browser KliveAPI fake. The fake deliberately understands
 * `/batch`, because role tests need to inspect the paths inside the batch request,
 * not merely the single outer POST.
 */
export async function installDashboardApiMock(page: Page, role: DashboardRole): Promise<DashboardApiMock> {
  const state: DashboardApiMock = { requestedPaths: [], mutations: [], batchCalls: 0 };

  // Keep the authentication/session and Projects event sockets connected without
  // allowing a test to reach the real KliveAPI host.
  await page.routeWebSocket('wss://klive.dev/**', () => {});

  await page.route('https://klive.dev/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathWithQuery = `${url.pathname}${url.search}`;

    if (request.method() === 'OPTIONS') {
      await fulfilJson(route, null, 204);
      return;
    }

    if (url.pathname === '/batch' && request.method() === 'POST') {
      state.batchCalls += 1;
      let entries: Array<{ path?: string }> = [];
      try {
        entries = JSON.parse(request.postData() ?? '[]');
      } catch {
        await fulfilJson(route, { error: 'invalid batch fixture payload' }, 400);
        return;
      }

      const items = entries
        .filter((entry): entry is { path: string } => typeof entry?.path === 'string')
        .map(({ path }) => {
          state.requestedPaths.push(path);
          return {
            path,
            status: 200,
            ok: true,
            contentType: 'application/json; charset=utf-8',
            body: responseForPath(path, role),
          };
        });

      await fulfilJson(route, items);
      return;
    }

    state.requestedPaths.push(pathWithQuery);
    if (request.method() !== 'GET') {
      state.mutations.push({ method: request.method(), path: pathWithQuery, body: request.postData() });
    }

    if (url.pathname === '/KMProfiles/LoginStatus') {
      await route.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': '*', 'content-type': 'text/plain; charset=utf-8' },
        body: 'SessionActive',
      });
      return;
    }

    if (url.pathname.includes('Upload') || url.pathname.includes('/upload')) {
      await fulfilJson(route, { success: true, uploaded: 1, itemID: 'uploaded-fixture' });
      return;
    }

    if (url.pathname === '/GeneralBotStatistics/RestartService') {
      await fulfilJson(route, { success: true, state: 'queued', service: url.searchParams.get('serviceName') ?? 'OmniTrader' });
      return;
    }

    if (url.pathname === '/projects/halt-all') {
      await fulfilJson(route, { success: true, halted: 3 });
      return;
    }

    if (url.pathname.includes('/safe-mode')) {
      await fulfilJson(route, { success: true, safeModeActive: true, reason: 'dashboard protective action' });
      return;
    }

    await fulfilJson(route, responseForPath(pathWithQuery, role));
  });

  return state;
}

export async function openDashboard(
  page: Page,
  role: DashboardRole,
  options: { collapsed?: boolean } = {},
): Promise<DashboardApiMock> {
  const api = await installDashboardApiMock(page, role);
  await page.context().addCookies([
    { name: 'password', value: `e2e-${role.toLowerCase()}`, url: dashboardTestOrigin },
  ]);
  await page.addInitScript((collapsed) => {
    window.localStorage.setItem('vnavCollapsed', collapsed ? '1' : '0');
  }, Boolean(options.collapsed));
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  const shell = page.getByTestId('dashboard-shell');
  try {
    await shell.waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    // Nuxt dev occasionally aborts a module stream and leaves an otherwise empty
    // SPA document. One reload distinguishes that transport hiccup from a repeatable
    // dashboard boot failure, which still fails below.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await shell.waitFor({ state: 'visible', timeout: 20_000 });
  }
  return api;
}
