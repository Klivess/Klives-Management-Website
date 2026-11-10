import type { Page, Route } from '@playwright/test';
import { catalogPayload, mePayload, permissionsForRank } from './permissions';

/**
 * A stateful stand-in for the routes behind the Admin page. Payloads have the shape the server's
 * code produces (GeneralBotStatisticsService, OmniServiceMonitor.BuildUptimeReport,
 * KliveApiStatisticsStore.GetSummary, OmniLogging.BuildLogSummary, PortForwardManager); the values
 * are invented. Actions change the state, so a test can restart a service and watch the page react.
 */

export type AdminRole = 'Guest' | 'Admin' | 'Klives';
export type AdminScenario = 'healthy' | 'troubled';

export interface AdminMockOptions {
  role?: AdminRole;
  scenario?: AdminScenario;
  /** A server from before this page's backend changes: no history route, no build identity, no error counts. */
  legacyServer?: boolean;
  /** Extra port mappings to start with. */
  mappings?: PortMapping[];
}

export interface PortMapping {
  Protocol: string;
  PublicPort: number;
  PrivatePort: number;
  PrivateIp: string;
  Description: string;
  LifetimeSeconds: number;
  ExpirationDate: string;
}

export interface AdminApiMock {
  /** Every path asked for, whether directly or inside a /batch. */
  requestedPaths: string[];
  /** Direct (non-batch) GETs only. */
  directGets: string[];
  batchCalls: string[][];
  posts: Array<{ path: string; body: any }>;
  /** Paths the server would have refused for this role. Should stay empty. */
  refused: string[];
  services: ServiceState[];
  mappings: PortMapping[];
  /** Makes the status snapshot fail, as it does while the process is down. */
  offline: boolean;
  /** Holds back the reply to opening a terminal session, as the live server does while it starts a new one. */
  terminalOpenDelayMs: number;
}

interface ServiceState { Name: string; Anteriority: string; IsActive: boolean; startedAt: number; errorsLastHour: number }

export const adminTestOrigin = new URL(
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '4173'}`,
).origin;

const roleRank: Record<AdminRole, number> = { Guest: 1, Admin: 4, Klives: 5 };

/** What each route needs, as registered on the server. */
const routePermissions: Record<string, string> = {
  '/GeneralBotStatistics/GetFrontpageStats': 'system.status.view',
  '/GeneralBotStatistics/History': 'system.status.view',
  '/KliveAPI/Statistics': 'system.status.view',
  '/KliveAPI/telemetry/overview': 'system.api.telemetry.read',
  '/System/UptimeStatistics': 'system.uptime.view',
  '/api/logs': 'system.logs.read',
  '/api/logs/summary': 'system.logs.read',
  '/timemanager/getalltasks': 'system.scheduler.read',
  '/admin/portforwarding/list': 'system.portforwarding.read',
  '/admin/portforwarding/add': 'system.portforwarding.manage',
  '/admin/portforwarding/edit': 'system.portforwarding.manage',
  '/admin/portforwarding/delete': 'system.portforwarding.manage',
  '/seleniumManager/getAllSeleniumInstances': 'system.resources.read',
  '/GeneralBotStatistics/RestartService': 'system.services.control',
  '/GeneralBotStatistics/QuitService': 'system.services.control',
  '/GeneralBotStatistics/UpdateBot': 'system.update.deploy',
  '/admin/terminal/session/open': 'system.terminal.use',
  '/admin/terminal/session/execute': 'system.terminal.use',
};

const SERVICE_NAMES: Array<[string, string]> = [
  ['AccountRegistry', 'Standard'], ['AIRouter', 'High'], ['CS2ArbitrageBot', 'Standard'], ['File Handler', 'Critical'],
  ['General Bot Statistics Service (KM)', 'Low'], ['KliveAgent', 'High'], ['KliveAPI', 'Critical'], ['KliveBot Discord', 'High'],
  ['KliveChat', 'Standard'], ['KliveCloud', 'Standard'], ['KliveGames', 'Standard'], ['KliveLink', 'Standard'],
  ['KliveLLM', 'High'], ['KliveMail', 'Standard'], ['KliveRAG', 'Standard'], ['KliveTech Hub', 'Standard'],
  ['KMProfileManager', 'Critical'], ['MemeScraper', 'Standard'], ['OmniBlox', 'Standard'], ['OmniDefence', 'High'],
  ['OmniGlobalSettingsManager', 'Critical'], ['OmniGram', 'Standard'], ['OmniLogging', 'Critical'], ['Omnipotent Service Monitoring', 'Standard'],
  ['Omniscience', 'Standard'], ['OmniTrader', 'High'], ['OmniTube', 'Low'], ['OmniTumblr', 'Standard'],
  ['OmniUpdater', 'Low'], ['PortForwardManager', 'Standard'], ['Projects', 'High'], ['SeleniumManager', 'Standard'],
  ['Stratum', 'Standard'], ['Time Management', 'High'], ['Tripwires', 'Standard'],
];

const COMMIT_A = '59f29c2dac3dfb52620b39f4d18d99ee376abbf7';
const COMMIT_B = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

function timeSpan(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const pad = (value: number) => String(value).padStart(2, '0');
  const rest = `${pad(Math.floor((seconds % 86_400) / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(Math.floor(seconds % 60))}.1234567`;
  return days > 0 ? `${days}.${rest}` : rest;
}

async function fulfilJson(route: Route, payload: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  await route.fulfill({
    status,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
      'access-control-allow-headers': 'Authorization, Content-Type, X-Klive-Client, X-Klive-Page',
      'access-control-expose-headers': 'RequestDeniedCode',
      'content-type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
    body: status === 204 ? '' : JSON.stringify(payload),
  });
}

export async function installAdminApiMock(page: Page, options: AdminMockOptions = {}): Promise<AdminApiMock> {
  const role = options.role ?? 'Klives';
  const scenario = options.scenario ?? 'healthy';
  const legacy = options.legacyServer ?? false;
  const granted = new Set(permissionsForRank(roleRank[role]));
  const allowed = (permission: string) => role === 'Klives' || granted.has(permission);

  const installedAt = Date.now();
  let processStartedAt = installedAt - (2 * 86_400 + 3 * 3600) * 1000;
  let commit = COMMIT_A;
  let offlineUntilCalls = 0;

  const state: AdminApiMock = {
    requestedPaths: [],
    directGets: [],
    batchCalls: [],
    posts: [],
    refused: [],
    offline: false,
    terminalOpenDelayMs: 0,
    services: [
      ...SERVICE_NAMES.map(([Name, Anteriority]) => ({
        Name,
        Anteriority,
        IsActive: !(scenario === 'troubled' && Name === 'OmniTube'),
        startedAt: processStartedAt + 4_000,
        errorsLastHour: scenario === 'troubled' && Name === 'CS2ArbitrageBot' ? 41 : scenario === 'troubled' && Name === 'OmniBlox' ? 3 : 0,
      })),
      // As on the live server: a Critical service that prepares directories at startup and then stops.
      { Name: 'Omnipotent Startup Manager', Anteriority: 'Critical', IsActive: false, startedAt: processStartedAt, errorsLastHour: 0 },
    ],
    mappings: [
      { Protocol: 'TCP', PublicPort: 443, PrivatePort: 443, PrivateIp: '192.168.1.50', Description: 'KliveAPI HTTPS', LifetimeSeconds: 0, ExpirationDate: 'Permanent' },
      { Protocol: 'TCP', PublicPort: 80, PrivatePort: 80, PrivateIp: '192.168.1.50', Description: 'KliveAPI HTTP', LifetimeSeconds: 0, ExpirationDate: 'Permanent' },
      { Protocol: 'TCP', PublicPort: 25, PrivatePort: 25, PrivateIp: '192.168.1.50', Description: 'KliveMail SMTP', LifetimeSeconds: 0, ExpirationDate: 'Permanent' },
      { Protocol: 'UDP', PublicPort: 25565, PrivatePort: 25565, PrivateIp: '192.168.1.77', Description: 'Minecraft', LifetimeSeconds: 86_400, ExpirationDate: new Date(installedAt + 20 * 3600_000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' },
      ...(options.mappings ?? []),
    ],
  };

  // ── payload builders ──

  /** Vitals at a moment: smooth, deterministic curves so charts have a shape. */
  const vitalsAt = (t: number) => {
    const phase = t / 60_000;
    const elapsed = Math.max(0, t - (installedAt - 3_600_000)) / 1000;
    return {
      cpu: Math.max(4, Math.min(99, 46 + 22 * Math.sin(phase / 6) + 9 * Math.sin(phase * 1.7))),
      ram: 68 + 4 * Math.sin(phase / 11),
      procMB: 2760 + 180 * Math.sin(phase / 9) + elapsed * 0.02,
      heapMB: 1540 + 140 * Math.sin(phase / 7),
      threads: Math.round(206 + 12 * Math.sin(phase / 5)),
      gen2: Math.round(71_000 + elapsed / 11),
      netSent: Math.round(91_000_000_000 + elapsed * 310_000),
      netRecv: Math.round(44_000_000_000 + elapsed * 140_000),
      // Quiet when healthy; otherwise a steady trickle with a burst every quarter of an hour.
      errors: scenario === 'troubled' ? Math.round(900 + elapsed / 240 + 9 * Math.floor(elapsed / 900)) : 900,
      requests: Math.round(48_000_000 + elapsed * 3.6),
      serverErrors: Math.round(311_000 + elapsed / 400),
    };
  };

  const history = () => {
    const now = Date.now();
    const columns: Record<string, number[]> = { T: [], Cpu: [], RamPct: [], ProcessMB: [], HeapMB: [], Threads: [], Gen2: [], NetSent: [], NetReceived: [], Errors: [], Requests: [], ServerErrors: [] };
    for (let i = 719; i >= 0; i--) {
      const t = now - i * 5_000;
      const v = vitalsAt(t);
      columns.T.push(Math.floor(t / 1000));
      columns.Cpu.push(Number(v.cpu.toFixed(1)));
      columns.RamPct.push(Number(v.ram.toFixed(1)));
      columns.ProcessMB.push(Math.round(v.procMB));
      columns.HeapMB.push(Math.round(v.heapMB));
      columns.Threads.push(v.threads);
      columns.Gen2.push(v.gen2);
      columns.NetSent.push(v.netSent);
      columns.NetReceived.push(v.netRecv);
      columns.Errors.push(v.errors);
      columns.Requests.push(v.requests);
      columns.ServerErrors.push(v.serverErrors);
    }
    return { StepSeconds: 5, Count: 720, ...columns };
  };

  const frontpage = () => {
    const now = Date.now();
    const v = vitalsAt(now);
    const services = state.services.map(service => {
      const uptime = service.IsActive ? Math.max(0, (now - service.startedAt) / 1000) : 0;
      const base = { Name: service.Name, ServiceID: service.Name.length.toString().padStart(8, '0'), IsActive: service.IsActive, Uptime: timeSpan(uptime), UptimeHumanized: service.IsActive ? '2 days' : 'Inactive' };
      return legacy ? base : {
        ...base,
        UptimeSeconds: Math.floor(uptime),
        Anteriority: service.Anteriority,
        RunsOnce: service.Name === 'Omnipotent Startup Manager',
        ErrorsLastHour: service.errorsLastHour,
        ErrorsRetained: service.errorsLastHour * 3,
        LastErrorAt: service.errorsLastHour ? new Date(now - 4 * 60_000).toISOString() : null,
      };
    });
    const cFull = scenario === 'troubled';
    const body: Record<string, unknown> = {
      TimeStatisticsGenerated: new Date(now).toISOString(),
      lastOmnipotentUpdate: new Date(processStartedAt - 90_000).toISOString(),
      lastOmnipotentUpdateHumanized: '2 days ago',
      BotUptime: timeSpan((now - processStartedAt) / 1000),
      BotUptimeHumanized: '2 days',
      TotalStatusLogs: 3655,
      TotalErrorLogs: scenario === 'troubled' ? 345 : 12,
      TotalLogs: 4000,
      RamTotalGB: 15.96,
      RamUsedGB: (15.96 * v.ram) / 100,
      RamUsagePercentage: v.ram,
      CpuUsagePercentage: Math.round(v.cpu),
      OSVersion: 'Microsoft Windows NT 10.0.19045.0',
      MachineName: 'TESTSERVER',
      ProcessorCount: 4,
      ProcessorName: 'Intel(R) Core(TM) i5-3570 CPU @ 3.40GHz',
      ProcessMemoryMB: v.procMB,
      ProcessThreadCount: v.threads,
      GCTotalMemoryMB: v.heapMB,
      GCGen0Collections: v.gen2 * 3,
      GCGen1Collections: v.gen2 * 2,
      GCGen2Collections: v.gen2,
      DiskStatistics: [
        { DriveName: 'C:\\', VolumeLabel: '', TotalSizeGB: 223.0, FreeSpaceGB: cFull ? 15.2 : 96.4, UsedSpaceGB: cFull ? 207.8 : 126.6, UsagePercentage: cFull ? 93.2 : 56.8, DriveFormat: 'NTFS' },
        { DriveName: 'D:\\', VolumeLabel: 'Data', TotalSizeGB: 931.5, FreeSpaceGB: 402.1, UsedSpaceGB: 529.4, UsagePercentage: 56.8, DriveFormat: 'NTFS' },
      ],
      NetworkInterfaces: [
        { Name: 'Ethernet', Description: 'Intel(R) 82579LM Gigabit Network Connection', SpeedMbps: 1000, BytesSent: v.netSent, BytesReceived: v.netRecv, ...(legacy ? {} : { IsVirtual: false }) },
        { Name: 'vEthernet (WSL)', Description: 'Hyper-V Virtual Ethernet Adapter', SpeedMbps: 10_000, BytesSent: 1_882_331_223, BytesReceived: 2_120_998_114, ...(legacy ? {} : { IsVirtual: true }) },
        // What an older server also sends (the live one lists 52 of these for one card): a filter
        // driver's instance repeating the adapter's counters, and miniports that never carried a byte.
        ...(legacy ? [
          { Name: 'Ethernet-WFP Native MAC Layer LightWeight Filter-0000', Description: 'Intel(R) 82579LM Gigabit Network Connection-WFP Native MAC Layer LightWeight Filter-0000', SpeedMbps: 1000, BytesSent: v.netSent, BytesReceived: v.netRecv },
          { Name: 'Ethernet-QoS Packet Scheduler-0000', Description: 'Intel(R) 82579LM Gigabit Network Connection-QoS Packet Scheduler-0000', SpeedMbps: 1000, BytesSent: v.netSent, BytesReceived: v.netRecv },
          { Name: 'Local Area Connection* 8', Description: 'WAN Miniport (IP)', SpeedMbps: 0, BytesSent: 0, BytesReceived: 0 },
        ] : []),
      ],
      TotalServicesRegistered: services.length,
      TotalServicesActive: services.filter(service => service.IsActive).length,
      Services: services,
      TotalScheduledTasks: 4,
      NextTaskScheduledSummary: 'OmniscienceNightly due 11/11/2026 03:30 (5 hours remaining)',
    };
    if (!legacy) {
      Object.assign(body, {
        Build: {
          Commit: commit,
          CommitShort: commit.slice(0, 7),
          Version: '1.0.0',
          BuiltUtc: new Date(processStartedAt - 90_000).toISOString(),
          ProcessStartedUtc: new Date(processStartedAt).toISOString(),
          Runtime: '.NET 9.0.4',
        },
        Updater: { Branch: 'master', LastSeenSha: commit, LastCheckUtc: new Date(now - 8_000).toISOString(), LastCheckOk: true, LastError: null, PollIntervalSeconds: 15, AutoDeploy: true, LastNewCommitUtc: null },
        ErrorsLastHour: state.services.reduce((sum, service) => sum + service.errorsLastHour, 0),
        ErrorsLoggedTotal: v.errors,
        ApiRequestsTotal: v.requests,
        ApiServerErrorsTotal: v.serverErrors,
      });
    }
    return body;
  };

  const uptime = (query: URLSearchParams) => {
    const now = Date.now();
    const periods: Array<{ StartTime: string; LastKnownUpTime: string; Commit?: string }> = [];
    // A restart every few days, each a four-minute gap, ending with the running process.
    let end = processStartedAt - 4 * 60_000;
    for (let i = 0; i < 14; i++) {
      const length = (1 + (i * 7) % 5) * 86_400_000 + i * 3_600_000;
      periods.unshift({ StartTime: new Date(end - length).toISOString(), LastKnownUpTime: new Date(end).toISOString() });
      end = end - length - (3 + (i % 3)) * 60_000;
    }
    periods.push({ StartTime: new Date(processStartedAt).toISOString(), LastKnownUpTime: new Date(now).toISOString() });
    if (!legacy) {
      // Commits are only recorded for recent periods. Two deploys, then one restart of the same build.
      const recent = ['1111111', '2222222', '2222222', commit.slice(0, 7)];
      recent.forEach((value, index) => { periods[periods.length - recent.length + index].Commit = value; });
    }
    const days = Number(query.get('days')) || null;
    const windowStart = days ? now - days * 86_400_000 : 0;
    const total = periods.reduce((sum, period) => sum + (Date.parse(period.LastKnownUpTime) - Date.parse(period.StartTime)) / 1000, 0);
    return {
      TotalUptimeSeconds: total,
      AverageUptimeHours: total / 3600 / periods.length,
      CurrentUptimeSeconds: (now - processStartedAt) / 1000,
      TotalOutageSeconds: (now - Date.parse(periods[0].StartTime)) / 1000 - total,
      TotalPeriods: periods.length,
      AsOfUtc: new Date(now).toISOString(),
      WindowDays: days,
      ...(query.get('periods') === '0' ? {} : { Periods: periods.filter(period => Date.parse(period.LastKnownUpTime) >= windowStart) }),
    };
  };

  const apiStatistics = (query: URLSearchParams) => {
    const now = Date.now();
    const days = Math.min(200, Number(query.get('days')) || 200);
    const dailyHistory = Array.from({ length: days }, (_, index) => {
      const offset = days - 1 - index;
      const requests = 180_000 + ((offset * 37_113) % 120_000);
      return {
        date: new Date(now - offset * 86_400_000).toISOString().slice(0, 10),
        requests,
        successes: Math.round(requests * 0.985),
        clientErrors: Math.round(requests * 0.012),
        serverErrors: Math.round(requests * (0.002 + ((offset * 7) % 5) * 0.0006)),
        notFoundRequests: Math.round(requests * 0.006),
        unauthorizedRequests: Math.round(requests * 0.004),
        avgResponseMs: 60 + ((offset * 17) % 90),
        maxResponseMs: 30_000 + ((offset * 7919) % 250_000),
      };
    });
    const route = (path: string, requests: number, avg: number, max: number, method = 'GET') => ({
      route: path, method, requests, successes: Math.round(requests * 0.99), clientErrors: Math.round(requests * 0.008), serverErrors: Math.round(requests * 0.002),
      avgResponseMs: avg, maxResponseMs: max, lastStatusCode: 200, lastRequestAt: new Date(now - 3_000).toISOString(),
    });
    return {
      lifetime: {
        totalRequests: 48_211_904, successfulRequests: 46_100_211, clientErrorRequests: 1_800_211, serverErrorRequests: 311_482,
        notFoundRequests: 900_113, unauthorizedRequests: 600_812, avgResponseMs: 96.4, maxResponseMs: 2_711_004, availabilityPct: 95.62,
        lastRequestAt: new Date(now - 1_200).toISOString(),
      },
      historyWindow: { firstDay: dailyHistory[0].date, lastDay: dailyHistory[days - 1].date, totalDays: days, recordedDays: 200 },
      dailyHistory,
      topRoutes: [
        route('/batch', 9_811_233, 212, 180_221, 'POST'), route('/projects/list', 4_001_882, 31, 90_112),
        route('/GeneralBotStatistics/GetFrontpageStats', 3_200_114, 2.1, 9_114), route('/kliveagent/status', 2_911_004, 1.4, 4_811),
        route('/omnidefence/overview', 1_882_114, 14, 31_882), route('/projects/overview', 1_200_332, 44, 61_114),
        route('/KMProfiles/me', 911_004, 0.9, 2_114), route('/api/logs/summary', 611_882, 3.2, 8_811),
      ],
      slowestRoutes: [
        route('/omniblox/game/map', 3_114, 48_211, 297_114), route('/omniscience/workspace/health', 811, 21_004, 180_332),
        route('/projects/computers/diagnostics', 412, 9_882, 20_114), route('/api/omnitrader/lab/backtests', 9_114, 4_211, 31_004),
        route('/memescraper/dashboard', 21_114, 1_882, 122_004), route('/KliveCloud/ListItems', 61_004, 911, 44_118),
        route('/omnidefence/ip-map', 18_332, 640, 31_882), route('/stratum/runs/list', 2_114, 512, 9_004),
      ],
    };
  };

  const logSummary = (query: URLSearchParams) => {
    const hours = Math.min(48, Math.max(1, Number(query.get('hours')) || 12));
    const now = Date.now();
    const hour = Math.floor(now / 3_600_000) * 3_600_000;
    const noisy = scenario === 'troubled';
    return {
      GeneratedAt: new Date(now).toISOString(),
      WindowHours: hours,
      TotalLogs: 4000,
      StatusCount: noisy ? 3655 : 3988,
      ErrorCount: noisy ? 345 : 12,
      UpdateCount: 0,
      ErrorRate: noisy ? 8.6 : 0.3,
      UniqueServiceCount: 31,
      ErrorsLastHour: state.services.reduce((sum, service) => sum + service.errorsLastHour, 0),
      ErrorsLast24Hours: noisy ? 345 : 12,
      LatestLogAt: new Date(now - 2_000).toISOString(),
      LatestErrorAt: new Date(now - (noisy ? 4 : 190) * 60_000).toISOString(),
      ...(legacy ? {} : { OldestLogAt: new Date(now - 14 * 3_600_000).toISOString(), RetainedCapacity: 4000 }),
      // The buffer reaches back 14 hours, so earlier buckets are empty.
      Timeline: Array.from({ length: hours }, (_, index) => {
        const age = hours - 1 - index;
        return {
          Start: new Date(hour - age * 3_600_000).toISOString(),
          TotalCount: age > 13 ? 0 : 240 + ((age * 53) % 140),
          ErrorCount: age > 13 ? 0 : noisy ? 6 + ((age * 11) % 38) : age % 7 === 3 ? 2 : 0,
        };
      }),
      TopServices: [
        { ServiceName: 'Projects', TotalCount: 1211, ErrorCount: noisy ? 14 : 0, LastActivityAt: new Date(now - 4_000).toISOString() },
        { ServiceName: 'CS2ArbitrageBot', TotalCount: 904, ErrorCount: noisy ? 233 : 4, LastActivityAt: new Date(now - 9_000).toISOString() },
        { ServiceName: 'KliveAgent', TotalCount: 611, ErrorCount: 2, LastActivityAt: new Date(now - 30_000).toISOString() },
      ],
      ErrorFamilies: noisy ? [
        { Label: 'System.Net.Http.HttpRequestException', Count: 211, LastSeenAt: new Date(now - 4 * 60_000).toISOString() },
        { Label: 'System.Threading.Tasks.TaskCanceledException', Count: 84, LastSeenAt: new Date(now - 11 * 60_000).toISOString() },
        { Label: 'Trade re-price was refused by the market: listing is locked', Count: 31, LastSeenAt: new Date(now - 26 * 60_000).toISOString() },
        { Label: 'System.InvalidOperationException', Count: 12, LastSeenAt: new Date(now - 3 * 3_600_000).toISOString() },
      ] : [
        { Label: 'System.Threading.Tasks.TaskCanceledException', Count: 9, LastSeenAt: new Date(now - 190 * 60_000).toISOString() },
        { Label: 'System.Net.Http.HttpRequestException', Count: 3, LastSeenAt: new Date(now - 6 * 3_600_000).toISOString() },
      ],
    };
  };

  /** Due times without a zone, as the server writes most of them. */
  const localStamp = (ms: number) => new Date(ms).toISOString().replace('Z', '');
  const tasks = () => {
    const now = Date.now();
    return [
      { taskName: 'OmniscienceNightly', dateTimeDue: localStamp(now + 5 * 3_600_000), dateTimeSet: localStamp(now - 19 * 3_600_000), agentName: 'Omniscience', topic: 'nightly', reason: 'Nightly profile refresh', isImportant: true },
      { taskName: 'MemeScraperSweep', dateTimeDue: localStamp(now + 22 * 60_000), agentName: 'MemeScraper', topic: 'scrape', reason: 'Scheduled source sweep', isImportant: false },
      { taskName: 'KliveCloudBackup', dateTimeDue: localStamp(now + 2 * 86_400_000), agentName: 'KliveCloud', topic: 'backup', reason: 'Weekly backup', isImportant: true },
      ...(scenario === 'troubled' ? [{ taskName: 'CS2TradePoll', dateTimeDue: localStamp(now - 47 * 60_000), agentName: 'CS2ArbitrageBot', topic: 'poll', reason: 'Trade status poll', isImportant: true }] : []),
    ];
  };

  const portList = () => ({ success: true, localIp: '192.168.1.50', externalIp: '203.0.113.24', mappings: state.mappings, asOfUtc: new Date().toISOString() });

  // ── routing ──

  const getResponse = (pathWithQuery: string): { status: number; body: unknown } => {
    const url = new URL(pathWithQuery, 'https://klive.dev');
    const path = url.pathname;
    const permission = routePermissions[path];
    if (permission && !allowed(permission)) {
      state.refused.push(path);
      return { status: 403, body: { error: 'AccessDenied', reason: 'MissingPermission', message: `Needs ${permission}`, permission: { key: permission } } };
    }
    switch (path) {
      case '/KMProfiles/me':
        return { status: 200, body: mePayload({ rank: roleRank[role], userId: `e2e-${role.toLowerCase()}`, name: `${role} Fixture` }) };
      case '/KMProfiles/permissions/catalog':
        return { status: 200, body: catalogPayload(role === 'Klives') };
      case '/GeneralBotStatistics/GetFrontpageStats':
        return { status: 200, body: frontpage() };
      case '/GeneralBotStatistics/History':
        return legacy ? { status: 404, body: 'Route not found.' } : { status: 200, body: history() };
      case '/System/UptimeStatistics':
        return { status: 200, body: uptime(url.searchParams) };
      case '/KliveAPI/Statistics':
        return { status: 200, body: apiStatistics(url.searchParams) };
      case '/KliveAPI/telemetry/overview':
        // The live figures for 10 November (troubled) and a quiet day (healthy); the page reads kpi and prev.
        return { status: 200, body: {
          kind: 'overview', range: url.searchParams.get('range'),
          kpi: { count: 4281, p50: 0.83, p95: 253, p99: 1011, errorPct: scenario === 'troubled' ? 11.5 : 0.4, clientErrorPct: 3.69, apdex: 0.97 },
          prev: { count: 478, p50: 26.6, p95: 1202, p99: 13_598, errorPct: 0.209, clientErrorPct: 16.7, apdex: 0.839 },
          ts: {}, stages: [], heatmap: [],
        } };
      case '/api/logs/summary':
        return { status: 200, body: logSummary(url.searchParams) };
      case '/api/logs': {
        const service = url.searchParams.get('service');
        const now = Date.now();
        const entries = [
          { logID: 'log-1', TimeOfLog: new Date(now - 60_000).toISOString(), type: 1, serviceName: 'KliveAPI', message: 'Client disconnected mid-response', errorInfo: { ExceptionType: 'System.Net.HttpListenerException', Message: 'The specified network name is no longer available.' } },
          { logID: 'log-2', TimeOfLog: new Date(now - 90_000).toISOString(), type: 0, serviceName: 'Projects', message: 'Commander wake completed.' },
          { logID: 'log-3', TimeOfLog: new Date(now - 120_000).toISOString(), type: 1, serviceName: 'CS2ArbitrageBot', message: 'Trade re-price was refused', errorInfo: null },
        ];
        return { status: 200, body: entries.filter(entry => (!service || entry.serviceName === service) && (!url.searchParams.get('type') || String(entry.type) === url.searchParams.get('type'))) };
      }
      case '/timemanager/getalltasks':
        return { status: 200, body: tasks() };
      case '/admin/portforwarding/list':
        return { status: 200, body: portList() };
      case '/seleniumManager/getAllSeleniumInstances':
        return { status: 200, body: [{ objectID: 81224117, name: 'OmniTumblr edge gate', createdAt: new Date(Date.now() - 3_700_000).toISOString() }] };
      default:
        return { status: 200, body: { success: true } };
    }
  };

  await page.routeWebSocket('wss://klive.dev/**', () => {});

  await page.route('https://klive.dev/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const pathWithQuery = `${url.pathname}${url.search}`;

    if (request.method() === 'OPTIONS') { await fulfilJson(route, null, 204); return; }

    // While the process is down nothing answers at all.
    if (state.offline || offlineUntilCalls > 0) {
      if (url.pathname === '/GeneralBotStatistics/GetFrontpageStats' && offlineUntilCalls > 0) {
        offlineUntilCalls -= 1;
        if (offlineUntilCalls === 0) {
          // The process that comes back is a new one, on the new commit.
          processStartedAt = Date.now() - 4_000;
          commit = COMMIT_B;
          for (const service of state.services) service.startedAt = processStartedAt + 1_000;
        }
      }
      if (state.offline || offlineUntilCalls > 0 || url.pathname !== '/GeneralBotStatistics/GetFrontpageStats') { await route.abort('connectionrefused'); return; }
    }

    if (url.pathname === '/batch' && request.method() === 'POST') {
      const entries: Array<{ path?: string }> = JSON.parse(request.postData() ?? '[]');
      const paths = entries.map(entry => entry.path).filter((path): path is string => typeof path === 'string');
      state.batchCalls.push(paths);
      state.requestedPaths.push(...paths);
      await fulfilJson(route, paths.map(path => {
        const answer = getResponse(path);
        return { path, status: answer.status, ok: answer.status >= 200 && answer.status < 300, contentType: 'application/json', body: answer.body };
      }));
      return;
    }

    state.requestedPaths.push(pathWithQuery);

    if (request.method() === 'GET') {
      state.directGets.push(pathWithQuery);
      if (url.pathname === '/KMProfiles/LoginStatus') {
        await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'text/plain' }, body: 'SessionActive' });
        return;
      }
      const answer = getResponse(pathWithQuery);
      await fulfilJson(route, answer.body, answer.status, answer.status === 403 ? { RequestDeniedCode: '2' } : {});
      return;
    }

    // ── writes ──
    let body: any = null;
    try { body = JSON.parse(request.postData() ?? 'null'); } catch { body = request.postData(); }
    state.posts.push({ path: url.pathname, body });

    const permission = routePermissions[url.pathname];
    if (permission && !allowed(permission)) {
      state.refused.push(url.pathname);
      await fulfilJson(route, { error: 'AccessDenied', reason: 'MissingPermission', message: `Needs ${permission}` }, 403, { RequestDeniedCode: '2' });
      return;
    }

    switch (url.pathname) {
      case '/KMProfiles/Login':
        await fulfilJson(route, { token: `kms_e2e-${role.toLowerCase()}`, sessionId: 'session-e2e', expiresUtc: '2027-01-01T00:00:00Z', me: mePayload({ rank: roleRank[role], name: `${role} Fixture` }) });
        return;
      case '/GeneralBotStatistics/RestartService':
      case '/GeneralBotStatistics/QuitService': {
        const restart = url.pathname.endsWith('RestartService');
        const service = state.services.find(entry => entry.Name.toLowerCase() === String(body?.serviceName ?? '').toLowerCase());
        if (!service) { await fulfilJson(route, { Success: false, Error: `Service '${body?.serviceName}' was not found.` }, 404); return; }
        service.IsActive = restart;
        service.startedAt = Date.now();
        if (restart) service.errorsLastHour = 0;
        await fulfilJson(route, { Success: true, Action: restart ? 'restart' : 'quit', ServiceName: service.Name, Message: `${restart ? 'Restart' : 'Quit'} scheduled for ${service.Name}.` });
        return;
      }
      case '/GeneralBotStatistics/UpdateBot':
        // Accepted, then the process is killed: the next few status reads go unanswered.
        offlineUntilCalls = 2;
        await fulfilJson(route, { Success: true, Message: 'Update script launched. The bot will restart shortly.' });
        return;
      case '/admin/portforwarding/add':
        state.mappings = [...state.mappings, { ...body, ExpirationDate: body.LifetimeSeconds ? 'timed' : 'Permanent' }];
        await fulfilJson(route, { success: true, message: `Port ${body.PublicPort} successfully forwarded to ${body.PrivateIp}:${body.PrivatePort} (${body.Protocol}).` });
        return;
      case '/admin/portforwarding/edit':
        state.mappings = state.mappings.map(mapping => (mapping.PublicPort === body.OldMapping.PublicPort && mapping.Protocol === body.OldMapping.Protocol
          ? { ...body.NewMapping, ExpirationDate: body.NewMapping.LifetimeSeconds ? 'timed' : 'Permanent' } : mapping));
        await fulfilJson(route, { success: true, message: 'Port forward mapping successfully updated.' });
        return;
      case '/admin/portforwarding/delete':
        state.mappings = state.mappings.filter(mapping => !(mapping.PublicPort === body.PublicPort && mapping.Protocol === body.Protocol));
        await fulfilJson(route, { success: true, message: `Port forward mapping for ${body.PublicPort} (${body.Protocol}) successfully deleted.` });
        return;
      case '/admin/terminal/session/open':
        if (state.terminalOpenDelayMs > 0) await new Promise(resolve => setTimeout(resolve, state.terminalOpenDelayMs));
        await fulfilJson(route, { success: true, session: { sessionId: 'e2e-session', currentPath: 'C:\\Omnipotent', welcomeMessage: 'PowerShell session ready.', history: [] } });
        return;
      case '/admin/terminal/session/execute':
        await fulfilJson(route, { success: true, commandId: 'cmd-1', command: body?.command, output: 'ok', error: '', status: 'completed', exitCode: 0, currentPath: 'C:\\Omnipotent' });
        return;
      default:
        await fulfilJson(route, { success: true });
    }
  });

  return state;
}

/**
 * Opens the Admin page, or `path` with the same fake server behind it. `ready` is a selector that
 * shows the page has rendered: the Admin root by default, and a page of its own names one.
 */
export async function openAdmin(page: Page, options: AdminMockOptions & { path?: string; ready?: string } = {}): Promise<AdminApiMock> {
  const api = await installAdminApiMock(page, options);
  await page.context().addCookies([{ name: 'password', value: `e2e-${(options.role ?? 'Klives').toLowerCase()}`, url: adminTestOrigin }]);
  await page.addInitScript(() => { window.localStorage.setItem('vnavCollapsed', '0'); });
  // On Windows a long run against the dev server can exhaust socket buffers
  // (net::ERR_NO_BUFFER_SPACE): the navigation stalls, or a module fails to load and the page stays
  // blank. Nothing is wrong with the page; give the sockets a moment and load it again. The last
  // test of a run is the one most often caught, whichever page it opens.
  const rendered = options.ready ? page.locator(options.ready) : options.path ? null : page.getByTestId('adm-root');
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(options.path ?? '/admin', { waitUntil: 'domcontentloaded', timeout: 15_000 });
      if (rendered) await rendered.waitFor({ state: 'visible', timeout: 15_000 });
      break;
    } catch (error) {
      if (attempt >= 2) throw error;
      await page.waitForTimeout(3_000 * (attempt + 1));
    }
  }
  return api;
}
