import type { Page, Route } from '@playwright/test';
import { catalogPayload, mePayload } from './permissions';

/**
 * A stateful stand-in for the routes behind the KliveAgent page. Payloads have the shapes the server
 * produces (KliveAgentRoutes, KliveAgentStats, KliveAgentScheduler, ProjectPromptCacheAnalytics), taken
 * from a live capture on 2026-11-11; every value is invented. Actions change the state, so a test can
 * cancel a scheduled task or mark results read and watch the page follow.
 */

export interface AgentMockOptions {
  /** A server from before /kliveagent/schedule existed: that route answers 404. */
  legacyServer?: boolean;
  /** KliveAgent still warming up until this many status reads have been answered. */
  startingReads?: number;
}

export interface AgentApiMock {
  requestedPaths: string[];
  directGets: string[];
  batchCalls: string[][];
  posts: Array<{ path: string; body: any }>;
  schedule: { active: any[]; recent: any[]; maxActive: number };
  unread: Set<string>;
}

export const agentTestOrigin = new URL(
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '4173'}`,
).origin;

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const CONVERSATIONS = () => [
  { conversationId: 'conv_mine_recent', sourceChannel: 'API', lastUpdated: iso(20 * MIN), messageCount: 4, lastMessage: 'The KliveAPI restarts were deploys, not crashes.', activeRun: null, latestRunStatus: null },
  { conversationId: 'omnitrader-alpha-20261110-2117', sourceChannel: 'API', lastUpdated: iso(2 * HOUR), messageCount: 2, lastMessage: 'Batch report — 1 paper, 0 candidates.', activeRun: null, latestRunStatus: null },
  { conversationId: 'omnitrader-alpha-synthesis-20261110-1451', sourceChannel: 'API', lastUpdated: iso(9 * HOUR), messageCount: 2, lastMessage: 'Synthesis of the week.', activeRun: null, latestRunStatus: null },
  { conversationId: 'discord-1234', sourceChannel: 'Discord', lastUpdated: iso(2 * DAY), messageCount: 6, lastMessage: 'Sent you the summary on Discord.', activeRun: null, latestRunStatus: null },
  { conversationId: 'conv_mine_older', sourceChannel: 'API', lastUpdated: iso(9 * DAY), messageCount: 10, lastMessage: 'Tumblr keys are saved in the account registry.', activeRun: null, latestRunStatus: null },
  { conversationId: 'conv_empty', sourceChannel: 'API', lastUpdated: iso(3 * DAY), messageCount: 0, lastMessage: '', activeRun: null, latestRunStatus: null },
];

function conversationDetail(id: string) {
  return {
    conversationId: id,
    sourceChannel: 'API',
    lastUpdated: iso(20 * MIN),
    messages: [
      { messageId: 'm1', requestId: 'r1', role: 'User', senderName: 'Website', content: 'Why did KliveAPI restart so often this week?', timestamp: iso(30 * MIN), deliveryStatus: 'completed' },
      {
        messageId: 'm2', requestId: 'r1', role: 'KliveAgent', content: 'The KliveAPI restarts were **deploys**, not crashes.', timestamp: iso(20 * MIN), deliveryStatus: 'completed',
        scriptResults: [
          { code: 'var s = GetService("KliveAPI");\nLog(s.Uptime);', output: '02:11:00', success: true, executionTimeMs: 120 },
          { code: 'var x = Broken(', errorMessage: 'Compilation failed — 1 error(s); nothing ran.', success: false, executionTimeMs: 40 },
        ],
      },
    ],
    recentRuns: [
      { requestId: 'r1', status: 'Completed', promptTokens: 52_000, completionTokens: 1_200, iteration: 3,
        activity: [{ iteration: 1, kind: 'script', text: 'Read the uptime periods' }, { iteration: 2, kind: 'think', text: 'Matched starts to commits' }] },
    ],
  };
}

function statsPayload() {
  const daily = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(Date.now() - (29 - i) * DAY).toISOString().slice(0, 10);
    const messages = i % 4 === 0 ? 0 : 3;
    return {
      date, messages, promptTokens: messages * 900_000, completionTokens: messages * 9_000, totalTokens: messages * 909_000,
      iterations: messages * 20, scripts: messages * 4, scriptFailures: messages, scriptFailureRatePct: 25,
      apiMessages: messages, discordMessages: 0, avgLatencyMs: messages ? 600_000 : 0, maxLatencyMs: messages ? 1_500_000 : 0,
      memorySaves: 1, memoryRecalls: 2, estimatedCostUsd: 0,
    };
  });
  return {
    lifetime: { messages: 1040, promptTokens: 489_137_000, completionTokens: 6_954_312, totalTokens: 496_091_312, scripts: 4620, scriptFailures: 1681, estimatedCostUsd: 376.2 },
    today: null,
    historyWindow: { firstDay: '2026-05-01', lastDay: daily[29].date, totalDays: 129 },
    dailyHistory: daily,
    weeklyHistory: [{ week: '2026-W45', messages: 20, promptTokens: 18_000_000, completionTokens: 180_000, totalTokens: 18_180_000, scripts: 80, scriptFailures: 20 }],
    monthlyHistory: [{ month: '2026-11', messages: 29, promptTokens: 26_000_000, completionTokens: 260_000, totalTokens: 26_260_000, scripts: 238, scriptFailures: 111 }],
    topCapabilities: [
      { name: 'accountregistry.get', executions: 38, failures: 30, avgDurationMs: 146, lastExecutedAt: iso(20 * DAY) },
      { name: 'accountregistry.list', executions: 38, failures: 13, avgDurationMs: 20, lastExecutedAt: iso(20 * DAY) },
    ],
    performance: {
      measuredRuns: 146, completedRuns: 135, stoppedRuns: 10, failedRuns: 1, avgDurationMs: 1_733_780, maxDurationMs: 12_684_743,
      recentP50DurationMs: 837_954, recentP95DurationMs: 5_723_806,
      stages: [
        { name: 'model', calls: 7207, avgMs: 24_506, totalMs: 176_612_000, maxMs: 300_000 },
        { name: 'nativeTool', calls: 3874, avgMs: 10_822, totalMs: 41_924_000, maxMs: 200_000 },
        { name: 'prompt.repoMap', calls: 102, avgMs: 891, totalMs: 91_000, maxMs: 2_000 },
      ],
      recent: [
        { startedAtUtc: iso(3 * HOUR), outcome: 'completed', durationMs: 55_500, iterations: 10, promptTokens: 1, completionTokens: 1, stages: { model: { count: 10, totalMs: 51_700 }, nativeTool: { count: 4, totalMs: 2_400 } } },
        { startedAtUtc: iso(10 * HOUR), outcome: 'stopped', durationMs: 701_500, iterations: 16, promptTokens: 1, completionTokens: 1, stages: { model: { count: 16, totalMs: 285_400 }, waitTool: { count: 2, totalMs: 281_900 } } },
      ],
    },
  };
}

const PROMPT_CACHE = {
  status: 'degraded', verdict: 'Uncached input remains above target: reusable-prefix efficiency is 97.6% against the 99.7% target.',
  requests: 419, measuredRequests: 419, cacheHitRatePct: 91.9, targetCacheHitRatePct: 99.7, meetsCacheHitTarget: false,
  reusablePrefixEfficiencyPct: 97.6, firstTurnHitRatePct: 4, continuationHitRatePct: 94.4, uncachedTokens: 1_200_000,
  zeroHitRequests: 28, averageRequestDurationMs: 18_741, averageQueueDurationMs: 0,
  series: [{ date: '2026-11-09', requests: 60, cacheHitRatePct: 92 }, { date: '2026-11-10', requests: 40, cacheHitRatePct: 90 }],
  breakdown: [{ key: 'AIRouter|Qwen3.8|chat', provider: 'AIRouter', model: 'Qwen3.8', requests: 419, cacheHitRatePct: 91.9, averageRequestDurationMs: 18_741 }],
  recent: [],
};

const MEMORIES = [
  { id: 'mem-1', content: 'OmniTrader Alpha Lab writes a batch report three times a day.', memoryType: 'Fact', title: null, tags: ['omnitrader', 'alpha-lab'], createdAt: iso(2 * DAY), source: 'agent', importance: 1 },
  { id: 'mem-2', content: 'Tumblr edge 403s come from nginx, not the API.', memoryType: 'Lesson', title: 'Tumblr 403s', tags: ['tumblr', 'lessons-learned'], createdAt: iso(5 * DAY), source: 'agent', importance: 2 },
  { id: 'mem-3', content: 'The SpamMe project posts reels every evening.', memoryType: 'Fact', title: null, tags: ['instagram'], createdAt: iso(8 * DAY), source: 'projects', importance: 1 },
];

async function fulfilJson(route: Route, payload: unknown, status = 200, headers: Record<string, string> = {}) {
  await route.fulfill({
    status,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
      'access-control-allow-headers': 'Authorization, Content-Type, X-Klive-Client, X-Klive-Page',
      'access-control-expose-headers': 'X-Klive-Pending-Wait',
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
    body: status === 204 ? '' : JSON.stringify(payload),
  });
}

export async function installAgentApiMock(page: Page, options: AgentMockOptions = {}): Promise<AgentApiMock> {
  let statusReads = 0;
  const notifications = [
    { notificationId: 'run-unread', kind: 'chat-completed', title: 'KliveAgent finished a conversation', body: 'The KliveAPI restarts were deploys.', conversationId: 'conv_mine_recent', requestId: 'r1', createdAt: iso(25 * MIN), readAt: null },
    { notificationId: 'msg-read', kind: 'agent-message', title: 'KliveAgent messaged you', body: 'Your Tumblr keys are ready.', conversationId: 'conv_mine_older', createdAt: iso(3 * DAY), readAt: iso(3 * DAY) },
    { notificationId: 'run-interrupted', kind: 'chat-interrupted', title: 'KliveAgent run was interrupted by a restart', body: 'Interrupted.', conversationId: 'conv_mine_older', createdAt: iso(4 * DAY), readAt: iso(4 * DAY) },
  ];
  const state: AgentApiMock = {
    requestedPaths: [], directGets: [], batchCalls: [], posts: [],
    unread: new Set(['run-unread']),
    schedule: {
      active: [
        { id: 'task-soon', instruction: 'Check the overnight error log and tell me what needs fixing.', dueAtUtc: new Date(Date.now() + 40 * MIN).toISOString(), repeatEverySeconds: 86_400, createdAt: iso(5 * DAY), conversationId: 'conv_mine_recent', enabled: true, firing: false, lastFiredAt: iso(DAY), firedCount: 4, lastOutcome: 'Two warnings, nothing urgent.' },
        { id: 'task-later', instruction: 'Re-check the Steam login.', dueAtUtc: new Date(Date.now() + 6 * HOUR).toISOString(), repeatEverySeconds: null, createdAt: iso(DAY), conversationId: null, enabled: true, firing: false, lastFiredAt: null, firedCount: 0, lastOutcome: null },
      ],
      recent: [{ id: 'task-done', instruction: 'Tell me when the deploy finished.', dueAtUtc: iso(2 * DAY), repeatEverySeconds: null, createdAt: iso(3 * DAY), enabled: false, firing: false, lastFiredAt: iso(2 * DAY), firedCount: 1, lastOutcome: 'Deploy finished at 02:11.' }],
      maxActive: 64,
    },
  };

  const answer = (path: string): { status: number; body: unknown } => {
    const url = new URL(path, 'https://klive.dev');
    switch (url.pathname) {
      case '/KMProfiles/me': return { status: 200, body: mePayload({ rank: 5, userId: 'e2e-klives', name: 'Klives Fixture' }) };
      case '/KMProfiles/permissions/catalog': return { status: 200, body: catalogPayload(true) };
      case '/kliveagent/status': {
        statusReads++;
        const ready = statusReads > (options.startingReads ?? 0);
        return { status: 200, body: ready
          ? { ready: true, state: 'ready', progress: 100, message: 'KliveAgent is ready.', codebase: { ready: true } }
          : { ready: false, state: 'starting', progress: 45, message: 'Restoring background tasks…' } };
      }
      case '/kliveagent/computer': return { status: 200, body: { enabled: true, computer: { target: 'container', setting: 'auto', containerId: 'c0ffee', suspended: true, ready: false, pendingTakeovers: [] } } };
      case '/kliveagent/chat/runs': return { status: 200, body: [] };
      case '/kliveagent/notifications': {
        const list = notifications.map(n => ({ ...n, readAt: state.unread.has(n.notificationId) ? null : n.readAt ?? iso(MIN) }));
        return { status: 200, body: url.searchParams.get('unreadOnly') === 'true' ? list.filter(n => !n.readAt) : list };
      }
      case '/kliveagent/schedule': return options.legacyServer ? { status: 404, body: { error: 'Route not found' } } : { status: 200, body: state.schedule };
      case '/kliveagent/stats/summary': return { status: 200, body: { TodayUtcDate: new Date().toISOString().slice(0, 10), TodayMessages: 3, TodayTotalTokens: 2_700_000, TodayIterations: 60, LifetimeScriptsRun: 4620, LifetimeScriptFailures: 1681 } };
      case '/kliveagent/jobs': return { status: 200, body: [] };
      case '/kliveagent/tasks': return { status: 200, body: [{ taskId: 't1', description: 'Auto-approver', status: 'Completed', createdAt: '2026-05-28T21:51:54Z', completedAt: '2026-05-28T21:57:56Z' }] };
      case '/kliveagent/conversations': return { status: 200, body: CONVERSATIONS() };
      case '/kliveagent/conversations/get': {
        const id = url.searchParams.get('id') ?? '';
        return CONVERSATIONS().some(c => c.conversationId === id) ? { status: 200, body: conversationDetail(id) } : { status: 404, body: { error: 'Conversation not found.' } };
      }
      case '/kliveagent/stats': return { status: 200, body: statsPayload() };
      case '/kliveagent/stats/prompt-cache': return { status: 200, body: PROMPT_CACHE };
      case '/kliveagent/memories': return { status: 200, body: url.searchParams.get('query') ? MEMORIES.filter(m => m.content.toLowerCase().includes(url.searchParams.get('query')!.toLowerCase())) : MEMORIES };
      case '/kliveagent/shortcuts': return { status: 200, body: [{ id: 'sc-1', title: 'Restart a service', content: 'await RestartService("X");', memoryType: 'Shortcut', tags: ['ops'], createdAt: iso(DAY) }] };
      case '/kliveagent/capabilities': return { status: 200, body: [
        { name: 'accountregistry.get', displayName: 'Get account', category: 'Accounts', description: 'Read one stored login.', permissionTier: 'Read', requiresConfirmation: false },
        { name: 'services.restart', displayName: 'Restart', category: 'Services', description: 'Restart a service.', permissionTier: 'Critical', requiresConfirmation: true, confirmationMessage: 'Restart?' },
      ] };
      case '/kliveagent/servicetools': return { status: 200, body: { ready: true, serviceCount: 1, operationCount: 2, services: [{ key: 'KliveAPI', displayName: 'KliveAPI', summary: 'The HTTP gateway.', annotated: true, tools: ['kliveapi'], operations: [{ op: 'stats', mutating: false }, { op: 'restart', mutating: true, destructive: true }] }] } };
      case '/kliveagent/servicetools/audit': return { status: 200, body: [] };
      default: return { status: 200, body: { success: true } };
    }
  };

  await page.routeWebSocket('wss://klive.dev/**', () => {});
  await page.route('https://klive.dev/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const pathWithQuery = `${url.pathname}${url.search}`;
    if (request.method() === 'OPTIONS') { await fulfilJson(route, null, 204); return; }

    if (url.pathname === '/batch' && request.method() === 'POST') {
      const paths = (JSON.parse(request.postData() ?? '[]') as Array<{ path?: string }>).map(e => e.path).filter((p): p is string => typeof p === 'string');
      state.batchCalls.push(paths);
      state.requestedPaths.push(...paths);
      await fulfilJson(route, paths.map(path => {
        const result = answer(path);
        return { path, status: result.status, ok: result.status < 300, contentType: 'application/json', body: result.body };
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
      const result = answer(pathWithQuery);
      await fulfilJson(route, result.body, result.status);
      return;
    }

    let body: any = null;
    try { body = JSON.parse(request.postData() ?? 'null'); } catch { body = request.postData(); }
    state.posts.push({ path: url.pathname, body });
    switch (url.pathname) {
      case '/kliveagent/notifications/read-all': {
        const marked = state.unread.size;
        state.unread.clear();
        await fulfilJson(route, { success: true, marked });
        return;
      }
      case '/kliveagent/notifications/read':
        state.unread.delete(body?.notificationId);
        await fulfilJson(route, { success: true });
        return;
      case '/kliveagent/schedule/cancel': {
        const task = state.schedule.active.find(t => t.id === body?.id);
        if (!task) { await fulfilJson(route, { success: false }, 409); return; }
        state.schedule.active = state.schedule.active.filter(t => t.id !== body.id);
        state.schedule.recent = [{ ...task, enabled: false, lastOutcome: 'cancelled by Klives' }, ...state.schedule.recent];
        await fulfilJson(route, { success: true });
        return;
      }
      case '/kliveagent/memories/delete':
        await fulfilJson(route, { success: true });
        return;
      default:
        await fulfilJson(route, { success: true });
    }
  });
  return state;
}

/** Opens /kliveagent with the fake server behind it; retries a load the Windows dev server dropped. */
export async function openKliveAgent(page: Page, options: AgentMockOptions & { path?: string } = {}): Promise<AgentApiMock> {
  const api = await installAgentApiMock(page, options);
  await page.context().addCookies([{ name: 'password', value: 'e2e-klives', url: agentTestOrigin }]);
  await page.addInitScript(() => { window.localStorage.setItem('vnavCollapsed', '1'); });
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(options.path ?? '/kliveagent', { waitUntil: 'domcontentloaded', timeout: 20_000 });
      await page.getByTestId('kax-root').waitFor({ state: 'visible', timeout: 20_000 });
      break;
    } catch (error) {
      if (attempt >= 2) throw error;
      await page.waitForTimeout(3_000 * (attempt + 1));
    }
  }
  return api;
}
