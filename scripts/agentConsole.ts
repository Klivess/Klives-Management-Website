/**
 * Rules for the KliveAgent console: what a conversation is, how runs and results are labelled, what
 * the page should say first, and what the command palette can do. No Vue and no network here, so the
 * same rules can be read in one place and tested without a browser.
 *
 * Shapes follow the server (Omnipotent/Services/KliveAgent: KliveAgentRoutes, KliveAgentStats,
 * KliveAgentScheduler). Every field is optional: the site and the server deploy separately.
 */
import { commandScore, fmtCompact, fmtDuration, fmtInt, fmtMs, fmtPct, fmtRelative, isNum, toMs } from '~/scripts/adminConsole';

export { fmtCompact, fmtDuration, fmtInt, fmtMs, fmtPct, fmtRelative, isNum, toMs };

const NONE = '—';

export type AgentTone = 'ok' | 'warn' | 'crit' | 'info' | 'neutral' | 'accent';

// ───────────────────────────── conversations ─────────────────────────────

export interface ConversationSummary {
  conversationId: string;
  sourceChannel?: string;
  lastUpdated?: string;
  messageCount?: number;
  lastMessage?: string;
  activeRun?: { requestId?: string; status?: string; phase?: string } | null;
  latestRunStatus?: string | null;
}

/**
 * Where a conversation came from. Live (11 Nov 2026): of 333 conversations, 83 were OmniTrader Alpha
 * batch reports written by the server itself and 2 were Discord DMs, so "Recent" was mostly machine
 * reports. Klives's own chats are the default view; the rest are a filter away.
 */
export type ConversationOrigin = 'mine' | 'automated' | 'discord' | 'scheduled';

const AUTOMATED_LABELS: Array<[RegExp, string]> = [
  [/^omnitrader-alpha-synthesis-/i, 'Alpha Lab synthesis'],
  [/^omnitrader-alpha-/i, 'Alpha Lab batch report'],
  [/^omnitrader-/i, 'OmniTrader report'],
  [/^projects?-/i, 'Projects report'],
];

export function conversationOrigin(c: Pick<ConversationSummary, 'conversationId' | 'sourceChannel'>): ConversationOrigin {
  const id = String(c.conversationId ?? '');
  if (/^discord/i.test(id) || String(c.sourceChannel ?? '').toLowerCase() === 'discord') return 'discord';
  if (/^scheduled-/i.test(id)) return 'scheduled';
  if (AUTOMATED_LABELS.some(([pattern]) => pattern.test(id))) return 'automated';
  // Service-made ids read "<service>-<words>-yyyymmdd-hhmm"; the page and talk mode use conv_/msg_ ids or GUIDs.
  if (/^[a-z]+(?:-[a-z]+)*-\d{8}-\d{4}$/i.test(id)) return 'automated';
  return 'mine';
}

export const ORIGIN_LABELS: Record<ConversationOrigin, string> = {
  mine: 'You', automated: 'Automated', discord: 'Discord', scheduled: 'Scheduled',
};

/** Markdown and line breaks out, so a preview reads as a sentence. */
export function plainText(text: unknown, max = 140): string {
  let value = String(text ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>|~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (value.length > max) value = value.slice(0, max - 1).trimEnd() + '…';
  return value;
}

export function automatedLabel(id: string): string | null {
  const hit = AUTOMATED_LABELS.find(([pattern]) => pattern.test(id));
  return hit ? hit[1] : null;
}

/** A short name for a conversation: what the automation was, or the latest words in it. */
export function conversationTitle(c: ConversationSummary): string {
  const label = automatedLabel(c.conversationId);
  if (label) {
    const stamp = /(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(c.conversationId);
    return stamp ? `${label} · ${stamp[3]}/${stamp[2]} ${stamp[4]}:${stamp[5]}` : label;
  }
  return plainText(c.lastMessage, 90) || 'Empty conversation';
}

export type ConversationFilter = 'mine' | 'auto' | 'all';

export interface ConversationGroup { id: string; label: string; items: ConversationSummary[] }

export function filterConversations(list: ConversationSummary[], filter: ConversationFilter, text: string): ConversationSummary[] {
  const needle = text.trim().toLowerCase();
  return list.filter(c => {
    // 14 of 333 live conversations had no messages at all: nothing to open.
    if (!c.messageCount && !c.activeRun) return false;
    const origin = conversationOrigin(c);
    if (filter === 'mine' && origin !== 'mine' && origin !== 'discord') return false;
    if (filter === 'auto' && (origin === 'mine' || origin === 'discord')) return false;
    if (!needle) return true;
    return `${c.lastMessage ?? ''} ${c.conversationId} ${automatedLabel(c.conversationId) ?? ''}`.toLowerCase().includes(needle);
  });
}

export function countByFilter(list: ConversationSummary[]): Record<ConversationFilter, number> {
  const counts: Record<ConversationFilter, number> = { mine: 0, auto: 0, all: 0 };
  list.forEach(c => {
    if (!c.messageCount && !c.activeRun) return;
    counts.all++;
    const origin = conversationOrigin(c);
    if (origin === 'mine' || origin === 'discord') counts.mine++;
    else counts.auto++;
  });
  return counts;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Newest first, in Today / Yesterday / This week / Earlier. */
export function groupByDay(list: ConversationSummary[], now: number): ConversationGroup[] {
  const today = startOfDay(now);
  const yesterday = today - 86_400_000;
  const week = today - 6 * 86_400_000;
  const groups: ConversationGroup[] = [
    { id: 'today', label: 'Today', items: [] },
    { id: 'yesterday', label: 'Yesterday', items: [] },
    { id: 'week', label: 'This week', items: [] },
    { id: 'earlier', label: 'Earlier', items: [] },
  ];
  const sorted = [...list].sort((a, b) => (toMs(b.lastUpdated) ?? 0) - (toMs(a.lastUpdated) ?? 0));
  sorted.forEach(c => {
    const at = toMs(c.lastUpdated) ?? 0;
    const target = at >= today ? groups[0] : at >= yesterday ? groups[1] : at >= week ? groups[2] : groups[3];
    target.items.push(c);
  });
  return groups.filter(group => group.items.length);
}

/** "14:05" today, "Tue" this week, "3 Nov" before. */
export function shortWhen(value: unknown, now: number): string {
  const at = toMs(value);
  if (at == null) return '';
  const d = new Date(at);
  if (at >= startOfDay(now)) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (at >= startOfDay(now) - 6 * 86_400_000) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

// ───────────────────────────── runs ─────────────────────────────

export const PHASE_LABELS: Record<string, string> = {
  preparing: 'Preparing', queued: 'Queued', thinking: 'Thinking', running: 'Running', observing: 'Observing',
  waiting: 'Waiting', retrying: 'Retrying', steering: 'Steering', final: 'Done',
};

export type RunOutcome = 'running' | 'completed' | 'stopped-by-you' | 'stopped' | 'failed' | 'interrupted';

export function runOutcome(message: { pending?: boolean; status?: string; deliveryStatus?: string; stopReason?: string | null }): RunOutcome {
  if (message.pending) return 'running';
  const status = String(message.status || message.deliveryStatus || 'completed').toLowerCase();
  if (status === 'cancelled') return message.stopReason === 'user' ? 'stopped-by-you' : 'stopped';
  if (status === 'failed' || status === 'interrupted') return status;
  return 'completed';
}

export const OUTCOME_LABELS: Record<RunOutcome, string> = {
  running: 'Working', completed: 'Done', 'stopped-by-you': 'Stopped', stopped: 'Stopped', failed: 'Failed', interrupted: 'Interrupted',
};

// ───────────────────────────── results (notifications) ─────────────────────────────

export interface AgentNote {
  notificationId: string;
  kind?: string;
  title?: string;
  body?: string;
  conversationId?: string | null;
  requestId?: string | null;
  jobId?: string | null;
  projectId?: string | null;
  artifactPaths?: string[];
  createdAt?: string;
  readAt?: string | null;
}

export function noteTone(kind: string | undefined): AgentTone {
  if (kind === 'chat-interrupted' || kind === 'job-attention') return 'warn';
  if (kind === 'agent-message') return 'accent';
  if (kind === 'job-completed' || kind === 'chat-completed') return 'ok';
  return 'neutral';
}

export function noteIcon(kind: string | undefined): string {
  if (kind === 'agent-message') return 'message';
  if (kind === 'chat-interrupted') return 'alert';
  if (kind === 'job-attention') return 'flag';
  if (kind?.startsWith('job')) return 'layers';
  return 'check';
}

// ───────────────────────────── scheduled tasks ─────────────────────────────

export interface ScheduledTask {
  id: string;
  instruction?: string;
  dueAtUtc?: string;
  repeatEverySeconds?: number | null;
  createdAt?: string;
  conversationId?: string | null;
  enabled?: boolean;
  firing?: boolean;
  lastFiredAt?: string | null;
  firedCount?: number;
  lastOutcome?: string | null;
}

export interface ScheduleState { active: ScheduledTask[]; recent: ScheduledTask[]; maxActive: number }

export function readSchedule(body: unknown): ScheduleState | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const value = body as Partial<ScheduleState>;
  if (!Array.isArray(value.active)) return null;
  return { active: value.active, recent: Array.isArray(value.recent) ? value.recent : [], maxActive: Number(value.maxActive) || 64 };
}

export function fmtEvery(seconds: number | null | undefined): string {
  if (!isNum(seconds) || seconds <= 0) return 'once';
  if (seconds % 86_400 === 0) return seconds === 86_400 ? 'daily' : `every ${seconds / 86_400} days`;
  if (seconds % 3600 === 0) return seconds === 3600 ? 'hourly' : `every ${seconds / 3600} h`;
  return `every ${fmtDuration(seconds)}`;
}

/** "in 4h 10m", "overdue 3m" (fires on the next 20 s tick), "now" while firing. */
export function dueLabel(task: ScheduledTask, now: number): { text: string; tone: AgentTone } {
  if (task.firing) return { text: 'firing now', tone: 'accent' };
  const due = toMs(task.dueAtUtc);
  if (due == null) return { text: NONE, tone: 'neutral' };
  const delta = (due - now) / 1000;
  if (delta < -60) return { text: `overdue ${fmtDuration(-delta)}`, tone: 'warn' };
  if (delta < 60) return { text: 'due now', tone: 'accent' };
  return { text: `in ${fmtDuration(delta)}`, tone: delta < 3600 ? 'info' : 'neutral' };
}

// ───────────────────────────── jobs and background tasks ─────────────────────────────

export interface AgentJob {
  jobId: string;
  clientJobId?: string;
  name?: string;
  goal?: string;
  status?: string;
  projectId?: string;
  attentionRequired?: boolean;
  attentionMessage?: string;
  lastUpdated?: string;
  result?: string;
  artifactPaths?: string[];
}

export interface BackgroundTask {
  taskId: string;
  description?: string;
  status?: string;
  createdAt?: string;
  completedAt?: string;
  result?: string;
  errorMessage?: string;
}

export const canStopJob = (job: AgentJob) => ['Active', 'Planning'].includes(job.status ?? '');
export const canResumeJob = (job: AgentJob) => ['Paused', 'Blocked', 'BudgetPaused'].includes(job.status ?? '');
export const canSteerJob = (job: AgentJob) => ['Active', 'Planning'].includes(job.status ?? '');
export function jobTone(status: string | undefined): AgentTone {
  if (status === 'Completed') return 'ok';
  if (status === 'Active' || status === 'Planning') return 'accent';
  if (status === 'Blocked' || status === 'BudgetPaused' || status === 'Failed') return 'warn';
  return 'neutral';
}

// ───────────────────────────── computer ─────────────────────────────

export interface AgentComputer {
  target?: string;
  setting?: string;
  containerId?: string | null;
  suspended?: boolean;
  ready?: boolean;
  pendingTakeovers?: Array<{ approvalId: string; message?: string }>;
}

export function computerState(enabled: boolean | undefined, computer: AgentComputer | null): { word: string; tone: AgentTone; detail: string } {
  if (enabled === false) return { word: 'Off', tone: 'neutral', detail: 'Computer use is switched off in OmniSettings.' };
  if (!computer) return { word: NONE, tone: 'neutral', detail: 'Not reported yet.' };
  const where = computer.target === 'container' ? 'its own desktop' : computer.target === 'host' ? 'the host machine' : (computer.target ?? 'a computer');
  if (computer.pendingTakeovers?.length) return { word: 'Needs you', tone: 'warn', detail: `Waiting for you to take over ${where}.` };
  if (computer.target === 'container' && computer.suspended) return { word: 'Asleep', tone: 'neutral', detail: `Uses ${where}; stopped while idle to free memory, wakes when needed.` };
  if (computer.ready === false) return { word: 'Starting', tone: 'info', detail: `Uses ${where}.` };
  return { word: 'Awake', tone: 'ok', detail: `Uses ${where}.` };
}

// ───────────────────────────── usage ─────────────────────────────

export interface FlatSummary {
  TodayUtcDate?: string;
  LifetimeScriptsRun?: number;
  LifetimeScriptFailures?: number;
  LifetimeScriptSuccessRatePct?: number;
  TodayScriptsRun?: number;
  TodayScriptFailures?: number;
  TodayMessages?: number;
  TodayTotalTokens?: number;
  TodayIterations?: number;
  TodayEstimatedCostUsd?: number;
  LifetimeMessages?: number;
  LifetimePromptTokens?: number;
  LifetimeCompletionTokens?: number;
  EstimatedCostUsd?: number;
}

export interface UsageBucket {
  key: string;
  label: string;
  messages: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  iterations: number;
  scripts: number;
  scriptFailures: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
  memorySaves: number;
  estimatedCostUsd: number;
  apiMessages: number;
  discordMessages: number;
}

const num = (value: unknown, fallback = 0) => (isNum(value) ? value : Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : fallback);

export function readBucket(raw: any, key: 'date' | 'week' | 'month'): UsageBucket {
  const value = typeof raw?.[key] === 'string' ? raw[key] : '';
  const promptTokens = num(raw?.promptTokens);
  const completionTokens = num(raw?.completionTokens);
  return {
    key: value,
    label: key === 'month' ? value : value.slice(5),
    messages: num(raw?.messages),
    promptTokens,
    completionTokens,
    totalTokens: num(raw?.totalTokens, promptTokens + completionTokens),
    iterations: num(raw?.iterations),
    scripts: num(raw?.scripts),
    scriptFailures: num(raw?.scriptFailures),
    avgLatencyMs: num(raw?.avgLatencyMs),
    maxLatencyMs: num(raw?.maxLatencyMs),
    memorySaves: num(raw?.memorySaves),
    estimatedCostUsd: num(raw?.estimatedCostUsd),
    apiMessages: num(raw?.apiMessages),
    discordMessages: num(raw?.discordMessages),
  };
}

export interface UsageStats {
  daily: UsageBucket[];
  weekly: UsageBucket[];
  monthly: UsageBucket[];
  lifetime: Record<string, number>;
  performance: any | null;
  topCapabilities: Array<{ name: string; executions: number; failures: number; avgDurationMs?: number; lastExecutedAt?: string }>;
  firstDay: string | null;
}

export function readStats(data: any): UsageStats | null {
  if (!data || typeof data !== 'object' || !data.lifetime) return null;
  return {
    daily: Array.isArray(data.dailyHistory) ? data.dailyHistory.map((b: any) => readBucket(b, 'date')) : [],
    weekly: Array.isArray(data.weeklyHistory) ? data.weeklyHistory.map((b: any) => readBucket(b, 'week')) : [],
    monthly: Array.isArray(data.monthlyHistory) ? data.monthlyHistory.map((b: any) => readBucket(b, 'month')) : [],
    lifetime: data.lifetime ?? {},
    performance: data.performance && typeof data.performance === 'object' ? data.performance : null,
    topCapabilities: Array.isArray(data.topCapabilities) ? data.topCapabilities : [],
    firstDay: data.historyWindow?.firstDay ?? null,
  };
}

export const USAGE_RANGES = [
  { id: '7D', label: '7D', gran: 'day', count: 7 },
  { id: '30D', label: '30D', gran: 'day', count: 30 },
  { id: '90D', label: '90D', gran: 'day', count: 90 },
  { id: '6M', label: '6M', gran: 'week', count: 26 },
  { id: '1Y', label: '1Y', gran: 'month', count: 12 },
  { id: 'ALL', label: 'All', gran: 'month', count: Infinity },
] as const;
export type UsageRangeId = typeof USAGE_RANGES[number]['id'];

/** The buckets for a range. Days the agent did nothing are missing from the history: put them back as zeros. */
export function bucketsFor(stats: UsageStats | null, rangeId: UsageRangeId, now: number): UsageBucket[] {
  if (!stats) return [];
  const range = USAGE_RANGES.find(r => r.id === rangeId) ?? USAGE_RANGES[1];
  if (range.gran === 'day') {
    const byKey = new Map(stats.daily.map(b => [b.key, b]));
    const out: UsageBucket[] = [];
    for (let i = range.count - 1; i >= 0; i--) {
      const d = new Date(now - i * 86_400_000);
      const key = d.toISOString().slice(0, 10);
      out.push(byKey.get(key) ?? readBucket({ date: key }, 'date'));
    }
    return out;
  }
  const all = range.gran === 'week' ? stats.weekly : stats.monthly;
  return Number.isFinite(range.count) && all.length > range.count ? all.slice(all.length - range.count) : all;
}

export interface UsagePeriod {
  messages: number; promptTokens: number; completionTokens: number; totalTokens: number; iterations: number;
  scripts: number; scriptFailures: number; scriptSuccessPct: number | null; avgLatencyMs: number | null; maxLatencyMs: number;
  costUsd: number; memorySaves: number; avgIterations: number | null; avgPromptPerMessage: number | null;
}

/** Sums over exactly the buckets on screen, so every figure on the page describes the same window. */
export function summarise(buckets: UsageBucket[]): UsagePeriod {
  const sum = (pick: (b: UsageBucket) => number) => buckets.reduce((total, b) => total + (pick(b) || 0), 0);
  const messages = sum(b => b.messages);
  const scripts = sum(b => b.scripts);
  const scriptFailures = sum(b => b.scriptFailures);
  const latencyWeight = buckets.reduce((total, b) => total + b.avgLatencyMs * b.messages, 0);
  return {
    messages,
    promptTokens: sum(b => b.promptTokens),
    completionTokens: sum(b => b.completionTokens),
    totalTokens: sum(b => b.totalTokens),
    iterations: sum(b => b.iterations),
    scripts,
    scriptFailures,
    scriptSuccessPct: scripts ? ((scripts - scriptFailures) / scripts) * 100 : null,
    avgLatencyMs: messages ? latencyWeight / messages : null,
    maxLatencyMs: Math.max(0, ...buckets.map(b => b.maxLatencyMs)),
    costUsd: sum(b => b.estimatedCostUsd),
    memorySaves: sum(b => b.memorySaves),
    avgIterations: messages ? sum(b => b.iterations) / messages : null,
    avgPromptPerMessage: messages ? sum(b => b.promptTokens) / messages : null,
  };
}

/**
 * The model behind KliveAgent has been a flat-fee AIRouter plan since September: 0 USD while tens of
 * millions of tokens go through is the truth, but "$0.0000" next to "Est. cost" read as broken.
 */
export function costLabel(usd: number, tokens: number): { value: string; note: string } {
  if (usd > 0) return { value: `$${usd >= 100 ? usd.toFixed(0) : usd.toFixed(2)}`, note: 'estimated at list prices' };
  if (tokens > 0) return { value: 'Flat fee', note: 'no per-token cost on the current model' };
  return { value: '$0', note: 'nothing used' };
}

export function scriptTone(pct: number | null): AgentTone {
  if (pct == null) return 'neutral';
  if (pct < 50) return 'crit';
  if (pct < 75) return 'warn';
  return 'ok';
}

export const STAGE_LABELS: Record<string, string> = {
  preparation: 'Preparation', systemPrompt: 'System prompt', conversationPrompt: 'History', toolDefinitions: 'Tool definitions',
  attachments: 'Attachments', model: 'Model', firstToken: 'First token', modelError: 'Model errors', modelRetry: 'Model retries',
  retryBackoff: 'Retry wait', firstVisibleText: 'Start → first text', script: 'C# scripts', nativeTool: 'Native tools',
  computerTool: 'Computer', waitTool: 'Explicit waits',
};
export function stageLabel(name: string): string {
  if (STAGE_LABELS[name]) return STAGE_LABELS[name];
  if (name.startsWith('prompt.')) return `Prompt · ${name.slice(7)}`;
  if (name.startsWith('talk.')) return `Talk · ${name.slice(5)}`;
  return name;
}

// ───────────────────────────── what the page says first ─────────────────────────────

export interface AgentVerdictInput {
  ready: boolean;
  state: string;
  progress: number;
  statusMessage: string;
  reachable: boolean;
  runningRuns: number;
  unread: number;
  takeovers: number;
  approvals: number;
  overdueTasks: number;
  attentionJobs: number;
}

export interface AgentVerdict { tone: AgentTone; word: string; detail: string }

export function computeVerdict(input: AgentVerdictInput): AgentVerdict {
  if (!input.reachable) return { tone: 'crit', word: 'Offline', detail: 'No answer from the server. The page keeps trying.' };
  if (input.state === 'failed') return { tone: 'crit', word: 'Failed to start', detail: input.statusMessage || 'KliveAgent failed to start; see the bot logs.' };
  if (!input.ready) return { tone: 'info', word: `Starting ${Math.round(input.progress)}%`, detail: input.statusMessage || 'Warming up.' };
  if (input.takeovers || input.approvals) {
    const n = input.takeovers + input.approvals;
    return { tone: 'warn', word: 'Needs you', detail: `${n} ${n === 1 ? 'decision is' : 'decisions are'} waiting on the live view.` };
  }
  if (input.attentionJobs) return { tone: 'warn', word: 'Needs you', detail: `${input.attentionJobs} background job${input.attentionJobs === 1 ? ' needs' : 's need'} attention.` };
  if (input.runningRuns) return { tone: 'accent', word: 'Working', detail: `${input.runningRuns} run${input.runningRuns === 1 ? '' : 's'} in progress.` };
  if (input.overdueTasks) return { tone: 'warn', word: 'Ready', detail: `${input.overdueTasks} scheduled task${input.overdueTasks === 1 ? ' is' : 's are'} overdue.` };
  return { tone: 'ok', word: 'Ready', detail: input.unread ? `${input.unread} unread result${input.unread === 1 ? '' : 's'}.` : 'Nothing running.' };
}

// ───────────────────────────── command palette ─────────────────────────────

export interface AgentCommand {
  id: string;
  group: 'Go to' | 'Actions' | 'Conversations' | 'Scheduled' | 'Library';
  title: string;
  icon: string;
  keywords?: string;
  hint?: string;
  danger?: boolean;
  run: () => unknown;
}

export function scoreAgentCommand(query: string, command: AgentCommand): number {
  // commandScore favours anything not in its 'Services' group; conversations should not outrank actions.
  const base = commandScore(query, { title: command.title, keywords: command.keywords, group: command.group === 'Conversations' ? 'Services' : 'Actions' });
  return base;
}

// ───────────────────────────── export ─────────────────────────────

function csvField(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** One row per message and one per script the agent ran, so nothing in the transcript is lost. */
export function conversationCsv(messages: any[]): string {
  const rows: unknown[][] = [[
    'messageIndex', 'role', 'timestamp', 'rowType', 'scriptIndex', 'content', 'scriptCode', 'scriptOutput',
    'scriptSuccess', 'scriptErrorMessage', 'scriptExecutionTimeMs', 'pending',
  ]];
  messages.forEach((m, mi) => {
    rows.push([mi, m.role ?? '', m.timestamp ?? '', 'message', '', m.content ?? '', '', '', '', '', '', m.pending ? 'true' : '']);
    (Array.isArray(m.scripts) ? m.scripts : []).forEach((s: any, si: number) => {
      rows.push([mi, m.role ?? '', m.timestamp ?? '', 'script', si, '', s.code ?? '', s.output ?? '',
        s.success == null ? '' : String(s.success), s.errorMessage ?? '', s.executionTimeMs == null ? '' : String(s.executionTimeMs), '']);
    });
  });
  // A BOM so Excel reads the UTF-8 correctly.
  return '﻿' + rows.map(r => r.map(csvField).join(',')).join('\r\n');
}

export function fmtTokens(value: unknown): string {
  return isNum(value) ? fmtCompact(value) : NONE;
}

export function fmtSize(size: number): string {
  return size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function fmtWhen(value: unknown, now: number): string {
  return toMs(value) == null ? NONE : fmtRelative(value, now);
}

export { fmtInt as fmtCount };
