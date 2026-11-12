/**
 * Pure rules for the KliveLLM page: formatting, the metric catalogue, the verdict and its issues,
 * the routing map's layout, the cost simulator, the forecast, the insights, and time-window maths.
 * No Vue, no fetching: everything here is a function of what the server sent, so it can be tested
 * and reasoned about on its own. Lives in scripts/ so none of these names becomes an auto-import.
 */

export const LLM_NONE = '—';

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

// ───────────────────────────── formatting ─────────────────────────────

export function llmInt(value: unknown): string {
  return isFiniteNumber(value) ? Math.round(value).toLocaleString('en-GB') : LLM_NONE;
}

/** 1,284 · 12.9K · 4.2M · 1.3B */
export function llmCompact(value: unknown): string {
  if (!isFiniteNumber(value)) return LLM_NONE;
  const abs = Math.abs(value);
  if (abs < 10_000) return Math.round(value).toLocaleString('en-GB');
  for (const [size, suffix] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']] as const) {
    if (abs >= size) {
      const scaled = value / size;
      return `${Math.abs(scaled) >= 100 ? scaled.toFixed(0) : scaled.toFixed(1)}${suffix}`;
    }
  }
  return String(Math.round(value));
}

/** $0.0042 · $1.27 · $1,284 · $12.9K: money at whatever scale it is. */
export function llmUsd(value: unknown, precise = false): string {
  if (!isFiniteNumber(value)) return LLM_NONE;
  const abs = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  if (abs === 0) return '$0';
  if (abs < 0.01) return `${sign}$${abs.toFixed(precise ? 5 : 4)}`;
  if (abs < 100) return `${sign}$${abs.toFixed(2)}`;
  if (abs < 10_000) return `${sign}$${Math.round(abs).toLocaleString('en-GB')}`;
  return `${sign}$${llmCompact(abs)}`;
}

export function llmPct(value: unknown, digits = 1): string {
  if (!isFiniteNumber(value)) return LLM_NONE;
  return `${value.toFixed(value !== 0 && Math.abs(value) < 0.1 ? 2 : digits)}%`;
}

export function llmMs(value: unknown): string {
  if (!isFiniteNumber(value)) return LLM_NONE;
  if (value >= 3_600_000) return llmDuration(value / 1000);
  if (value >= 60_000) return llmDuration(value / 1000);
  if (value >= 10_000) return `${(value / 1000).toFixed(1)} s`;
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
  return `${Math.round(value)} ms`;
}

export function llmDuration(seconds: unknown): string {
  if (!isFiniteNumber(seconds) || seconds < 0) return LLM_NONE;
  const s = Math.floor(seconds);
  const d = Math.floor(s / 86_400), h = Math.floor((s % 86_400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return s % 60 > 0 && m < 10 ? `${m}m ${s % 60}s` : `${m}m`;
  return `${s}s`;
}

export function llmBytes(value: unknown): string {
  if (!isFiniteNumber(value) || value < 0) return LLM_NONE;
  if (value < 1024) return `${Math.round(value)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = value / 1024, u = 0;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[u]}`;
}

export function llmAgo(at: unknown, now: number): string {
  const ms = typeof at === 'string' ? new Date(at).getTime() : Number(at);
  if (!Number.isFinite(ms) || ms <= 0) return LLM_NONE;
  const delta = (now - ms) / 1000;
  if (Math.abs(delta) < 10) return 'just now';
  return delta > 0 ? `${llmDuration(delta)} ago` : `in ${llmDuration(-delta)}`;
}

export function llmClock(at: unknown): string {
  const ms = typeof at === 'string' ? new Date(at).getTime() : Number(at);
  if (!Number.isFinite(ms) || ms <= 0) return LLM_NONE;
  return new Date(ms).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function llmTime(at: unknown, withSeconds = false): string {
  const ms = Number(at);
  if (!Number.isFinite(ms) || ms <= 0) return LLM_NONE;
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: withSeconds ? '2-digit' : undefined });
}

// ───────────────────────────── metrics ─────────────────────────────

export type LlmUnit = 'count' | 'tokens' | 'ms' | 'pct' | 'usd' | 'rate' | 'bytes';

export interface LlmMetricInfo {
  key: string;
  label: string;
  unit: LlmUnit;
  /** 1 = higher is better, -1 = lower is better, 0 = neither. */
  good: 1 | -1 | 0;
  group: 'Volume' | 'Tokens' | 'Cache' | 'Cost' | 'Latency' | 'Reliability' | 'Shape';
  help?: string;
}

export const LLM_METRICS: LlmMetricInfo[] = [
  { key: 'calls', label: 'Calls', unit: 'count', good: 0, group: 'Volume' },
  { key: 'ok', label: 'Successful calls', unit: 'count', good: 1, group: 'Volume' },
  { key: 'failed', label: 'Failed calls', unit: 'count', good: -1, group: 'Reliability' },
  { key: 'errorPct', label: 'Error rate', unit: 'pct', good: -1, group: 'Reliability', help: 'Calls that ended in failure, of those not cancelled.' },
  { key: 'attempts', label: 'HTTP attempts', unit: 'count', good: 0, group: 'Volume' },
  { key: 'retries', label: 'Retries', unit: 'count', good: -1, group: 'Reliability' },
  { key: 'attemptFailurePct', label: 'Attempt failure rate', unit: 'pct', good: -1, group: 'Reliability', help: 'HTTP attempts that failed, including ones a retry or fallback recovered.' },
  { key: 'rateLimited', label: 'Rate-limited calls', unit: 'count', good: -1, group: 'Reliability' },
  { key: 'attemptRateLimited', label: 'Rate-limited attempts', unit: 'count', good: -1, group: 'Reliability' },
  { key: 'timeouts', label: 'Timeouts', unit: 'count', good: -1, group: 'Reliability' },
  { key: 'serverErrors', label: 'Router errors (5xx)', unit: 'count', good: -1, group: 'Reliability' },
  { key: 'blocked', label: 'Refused by policy', unit: 'count', good: 0, group: 'Reliability', help: 'Paused, over budget, not allowed to spend, or no usable router.' },
  { key: 'fallbacks', label: 'Served by a fallback', unit: 'count', good: -1, group: 'Reliability' },
  { key: 'redirected', label: 'Model redirected', unit: 'count', good: 0, group: 'Shape', help: 'The router did not serve the model asked for, so the route’s model was sent.' },
  { key: 'truncated', label: 'Cut off at the output cap', unit: 'count', good: -1, group: 'Shape' },
  { key: 'promptTokens', label: 'Prompt tokens', unit: 'tokens', good: 0, group: 'Tokens' },
  { key: 'completionTokens', label: 'Completion tokens', unit: 'tokens', good: 0, group: 'Tokens' },
  { key: 'reasoningTokens', label: 'Reasoning tokens', unit: 'tokens', good: 0, group: 'Tokens' },
  { key: 'totalTokens', label: 'Total tokens', unit: 'tokens', good: 0, group: 'Tokens' },
  { key: 'freshTokens', label: 'Fresh prompt tokens', unit: 'tokens', good: -1, group: 'Cache', help: 'Prompt tokens the provider had to process: not served from its cache.' },
  { key: 'cachedTokens', label: 'Cached prompt tokens', unit: 'tokens', good: 1, group: 'Cache' },
  { key: 'cacheHitPct', label: 'Cache hit', unit: 'pct', good: 1, group: 'Cache', help: 'Cached prompt tokens over prompt tokens, where the router reports a cache split.' },
  { key: 'prefixReusePct', label: 'Prefix reuse', unit: 'pct', good: 1, group: 'Cache', help: 'Cache hit on continuation turns only (a prefix existed to be reused).' },
  { key: 'wastedPrefillTokens', label: 'Re-prefilled tokens', unit: 'tokens', good: -1, group: 'Cache', help: 'Continuation prompt tokens the cache did not serve.' },
  { key: 'estCostUsd', label: 'Cost', unit: 'usd', good: -1, group: 'Cost', help: 'What the routers reported, or the price book where they report nothing. Flat-fee and free routers cost nothing per token.' },
  { key: 'listCostUsd', label: 'List-price equivalent', unit: 'usd', good: 0, group: 'Cost', help: 'What the same tokens cost at per-token prices, flat-fee traffic included.' },
  { key: 'costUsd', label: 'Reported cost', unit: 'usd', good: -1, group: 'Cost' },
  { key: 'costPerMTok', label: 'Cost per million tokens', unit: 'usd', good: -1, group: 'Cost' },
  { key: 'p50TotalMs', label: 'Latency p50', unit: 'ms', good: -1, group: 'Latency' },
  { key: 'p95TotalMs', label: 'Latency p95', unit: 'ms', good: -1, group: 'Latency' },
  { key: 'p99TotalMs', label: 'Latency p99', unit: 'ms', good: -1, group: 'Latency' },
  { key: 'p50ProviderMs', label: 'Provider time p50', unit: 'ms', good: -1, group: 'Latency' },
  { key: 'p95ProviderMs', label: 'Provider time p95', unit: 'ms', good: -1, group: 'Latency' },
  { key: 'p99ProviderMs', label: 'Provider time p99', unit: 'ms', good: -1, group: 'Latency' },
  { key: 'p50TtftMs', label: 'First token p50', unit: 'ms', good: -1, group: 'Latency' },
  { key: 'p95TtftMs', label: 'First token p95', unit: 'ms', good: -1, group: 'Latency' },
  { key: 'meanQueueMs', label: 'Queue wait (mean)', unit: 'ms', good: -1, group: 'Latency' },
  { key: 'p95QueueMs', label: 'Queue wait p95', unit: 'ms', good: -1, group: 'Latency' },
  { key: 'tokensPerSec', label: 'Output speed', unit: 'rate', good: 1, group: 'Latency', help: 'Completion tokens per second of generation, on streamed calls.' },
  { key: 'meanPromptTokens', label: 'Mean prompt', unit: 'tokens', good: 0, group: 'Shape' },
  { key: 'p95PromptTokens', label: 'Prompt p95', unit: 'tokens', good: 0, group: 'Shape' },
  { key: 'meanCompletionTokens', label: 'Mean completion', unit: 'tokens', good: 0, group: 'Shape' },
  { key: 'toolCalls', label: 'Tool calls', unit: 'count', good: 0, group: 'Shape' },
  { key: 'coldStarts', label: 'Cold starts', unit: 'count', good: 0, group: 'Cache' },
  { key: 'compacted', label: 'Compactions', unit: 'count', good: 0, group: 'Shape' },
  { key: 'requestBytes', label: 'Request size', unit: 'bytes', good: 0, group: 'Shape' },
];

const metricIndex = new Map(LLM_METRICS.map(m => [m.key, m]));
export function llmMetric(key: string): LlmMetricInfo {
  return metricIndex.get(key) ?? { key, label: key, unit: 'count', good: 0, group: 'Volume' };
}

export function llmFormat(value: unknown, unit: LlmUnit): string {
  switch (unit) {
    case 'usd': return llmUsd(value);
    case 'pct': return llmPct(value);
    case 'ms': return llmMs(value);
    case 'tokens': return llmCompact(value);
    case 'rate': return isFiniteNumber(value) ? `${value.toFixed(value >= 100 ? 0 : 1)} tok/s` : LLM_NONE;
    case 'bytes': return llmBytes(value);
    default: return llmCompact(value);
  }
}

export function llmFormatMetric(value: unknown, key: string): string {
  return llmFormat(value, llmMetric(key).unit);
}

/** TelChart's unit for a metric. */
export function llmTelUnit(key: string): 'ms' | 'count' | 'pct' | 'bytes' | 'num' {
  const unit = llmMetric(key).unit;
  return unit === 'ms' ? 'ms' : unit === 'pct' ? 'pct' : unit === 'bytes' ? 'bytes' : unit === 'usd' || unit === 'rate' ? 'num' : 'count';
}

/** Change of a metric against the previous window, as a fraction, or null when it means nothing. */
export function llmDelta(current: unknown, previous: unknown): number | null {
  if (!isFiniteNumber(current) || !isFiniteNumber(previous) || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

export const LLM_SERIES_COLORS = ['--tel-s1', '--tel-s2', '--tel-s3', '--tel-s4', '--tel-s5', '--tel-s6', '--tel-s7', '--tel-s8'];

// ───────────────────────────── names ─────────────────────────────

export function laneParts(key: string): { service: string; lane: string } {
  const at = key.indexOf('/');
  return at < 0 ? { service: key, lane: 'default' } : { service: key.slice(0, at), lane: key.slice(at + 1) };
}

export const OUTCOME_LABELS: Record<string, { label: string; tone: 'ok' | 'warn' | 'crit' | 'info' | 'neutral' }> = {
  ok: { label: 'OK', tone: 'ok' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  blocked: { label: 'Refused', tone: 'info' },
  rate_limited: { label: 'Rate limited', tone: 'warn' },
  timeout: { label: 'Timeout', tone: 'crit' },
  network: { label: 'Network', tone: 'crit' },
  unavailable: { label: 'Router error', tone: 'crit' },
  auth: { label: 'Key refused', tone: 'crit' },
  invalid_request: { label: 'Bad request', tone: 'warn' },
  model_unavailable: { label: 'Model unavailable', tone: 'warn' },
  empty: { label: 'Empty reply', tone: 'warn' },
  no_credit: { label: 'Out of credit', tone: 'crit' },
  stalled: { label: 'Stalled', tone: 'crit' },
  error: { label: 'Error', tone: 'crit' },
};

export function outcomeInfo(outcome: string | null | undefined) {
  return OUTCOME_LABELS[outcome ?? ''] ?? { label: outcome ?? 'Unknown', tone: 'neutral' as const };
}

export const BILLING_LABELS: Record<string, string> = { PerToken: 'Per token', Flat: 'Flat fee', Free: 'Free', per_token: 'Per token', flat: 'Flat fee', free: 'Free' };

export const SPENDING_LABELS: Record<string, { label: string; help: string }> = {
  Never: { label: 'Never per token', help: 'Free and flat-fee routers only, as primary and as fallback.' },
  PrimaryOnly: { label: 'No paid fallback', help: 'May be routed to a per-token router, but never falls from a free or flat-fee router onto one.' },
  Anywhere: { label: 'Fallback anywhere', help: 'Falls back onto per-token routers too.' },
};

export const STATE_TONES: Record<string, 'ok' | 'warn' | 'crit' | 'neutral'> = { up: 'ok', degraded: 'warn', down: 'crit', nodata: 'neutral' };

// ───────────────────────────── verdict ─────────────────────────────

export interface LlmIssue {
  id: string;
  tone: 'crit' | 'warn' | 'info';
  title: string;
  detail: string;
  /** Where clicking it goes: a tab, optionally with a target. */
  jump?: { tab: string; target?: string };
}

export interface LlmVerdict {
  tone: 'ok' | 'warn' | 'crit' | 'info';
  title: string;
  detail: string;
}

/**
 * What needs attention, from the overview, the live state, the routers and the routing in force.
 * Each rule names its numbers; none fires on a handful of calls.
 */
export function computeLlmIssues(input: { overview?: any; live?: any; routers?: any; routing?: any; now: number }): LlmIssue[] {
  const issues: LlmIssue[] = [];
  const overview = input.overview?.data;
  const total = overview?.total ?? {};
  const routers: any[] = input.routers?.routers ?? [];
  const lanes: any[] = input.routing?.lanes ?? [];
  const summary = input.overview?.routing ?? input.live?.routing;

  if (input.live?.ledgerError) issues.push({ id: 'ledger', tone: 'crit', title: 'The call ledger is not running', detail: input.live.ledgerError, jump: { tab: 'routers' } });
  const dropped = Number(input.live?.ledger?.dropped ?? 0);
  if (dropped > 0) issues.push({ id: 'dropped', tone: 'warn', title: `${llmInt(dropped)} calls were not recorded`, detail: 'The ledger’s queue was full; the calls ran but their rows were dropped.' });

  if (summary?.override) {
    const o = summary.override;
    issues.push({ id: 'override', tone: 'info', title: `Emergency override: everything to ${o.router}`, detail: `Until ${llmClock(o.untilUtc)}${o.reason ? ` · ${o.reason}` : ''}`, jump: { tab: 'routing', target: 'override' } });
  }
  for (const key of summary?.paused ?? []) issues.push({ id: `paused-${key}`, tone: 'info', title: `${key.replace('/', ' › ')} is paused`, detail: 'Its model calls are refused until it is resumed.', jump: { tab: 'routing' } });

  for (const r of routers) {
    if (!r.enabled) continue;
    const state = r.live?.state;
    const used = Number(r.traffic24h?.calls ?? 0) > 0 || lanes.some(l => l.effective?.router === r.id);
    if (!used) continue;
    if (state === 'down') issues.push({ id: `router-down-${r.id}`, tone: 'crit', title: `${r.name} is down`, detail: r.live?.lastFailure ?? r.live?.lastProbeError ?? 'Its last minute failed.', jump: { tab: 'routers', target: r.id } });
    else if (state === 'degraded') issues.push({ id: `router-degraded-${r.id}`, tone: 'warn', title: `${r.name} is degraded`, detail: r.live?.lastFailure ?? 'Some attempts failed or were rate limited in the last minute.', jump: { tab: 'routers', target: r.id } });
    if (!r.keySet && lanes.some(l => l.effective?.router === r.id)) issues.push({ id: `router-key-${r.id}`, tone: 'crit', title: `${r.name} has no key`, detail: r.configError ?? 'Calls routed to it fail before they are sent.', jump: { tab: 'routers', target: r.id } });
    const credit = r.live?.gauges?.creditRemainingUsd;
    if (isFiniteNumber(credit) && credit < 5) issues.push({ id: `credit-${r.id}`, tone: credit < 1 ? 'crit' : 'warn', title: `${r.name} credit is at ${llmUsd(credit)}`, detail: 'Per-token calls stop when it runs out.', jump: { tab: 'costs' } });
  }
  for (const c of input.routers?.routers?.flatMap((r: any) => r.circuits ?? []) ?? [])
    issues.push({ id: `circuit-${c.lane}-${c.router}`, tone: 'warn', title: `${c.lane.replace('/', ' › ')} is skipping ${c.router}`, detail: `It failed ${c.failures}× (${c.lastError}); its fallback is used until ${llmTime(new Date(c.openUntilUtc).getTime())}.`, jump: { tab: 'routing' } });

  for (const lane of lanes) {
    const e = lane.effective;
    if (e?.blocked && e.blocked !== 'Paused') issues.push({ id: `blocked-${lane.key}`, tone: 'warn', title: `${lane.service} › ${lane.label} is refused`, detail: e.blockReason ?? e.blocked, jump: { tab: 'routing' } });
    if (e?.budgetStatus?.exceeded && e.budget?.action === 'warn') issues.push({ id: `budget-${lane.key}`, tone: 'warn', title: `${lane.service} is over its ${e.budgetStatus.limit} budget`, detail: e.budgetStatus.detail, jump: { tab: 'costs' } });
    else if (e?.budgetStatus?.warning) issues.push({ id: `budget-warn-${lane.key}`, tone: 'info', title: `${lane.service} has used ${Math.round(e.budgetStatus.fraction * 100)}% of its ${e.budgetStatus.limit} budget`, detail: e.budgetStatus.detail, jump: { tab: 'costs' } });
  }

  const calls = Number(total.calls ?? 0);
  if (calls >= 30) {
    const err = Number(total.errorPct ?? 0);
    if (err >= 10) issues.push({ id: 'errors', tone: 'crit', title: `${llmPct(err)} of calls are failing`, detail: `${llmInt(total.failed)} of ${llmInt(calls)} in the window.`, jump: { tab: 'calls', target: 'failed' } });
    else if (err >= 3) issues.push({ id: 'errors', tone: 'warn', title: `${llmPct(err)} of calls are failing`, detail: `${llmInt(total.failed)} of ${llmInt(calls)} in the window.`, jump: { tab: 'calls', target: 'failed' } });
    const hit = total.cacheHitPct;
    const prev = input.overview?.data?.previous?.cacheHitPct;
    if (isFiniteNumber(hit) && isFiniteNumber(prev) && prev - hit >= 15)
      issues.push({ id: 'cache', tone: 'warn', title: `Cache hit fell to ${llmPct(hit)}`, detail: `It was ${llmPct(prev)} in the window before: more of every prompt is being processed fresh.`, jump: { tab: 'analytics', target: 'cacheHitPct' } });
    if (Number(total.truncated ?? 0) >= Math.max(5, calls * 0.02))
      issues.push({ id: 'truncated', tone: 'info', title: `${llmInt(total.truncated)} replies hit their output cap`, detail: 'Their text, and any tool call still being written, were cut off.', jump: { tab: 'calls', target: 'truncated' } });
  }
  const aw = input.live?.airouter;
  if (aw && Number(aw.waiting ?? 0) >= 6) issues.push({ id: 'queue', tone: 'warn', title: `${aw.waiting} calls are waiting for an AIRouter slot`, detail: `${aw.inFlight}/${aw.maxParallel} slots busy${aw.coolOffSeconds > 0 ? `, cool-off ${Math.round(aw.coolOffSeconds)}s` : ''}.`, jump: { tab: 'routers', target: 'airouter' } });

  const order = { crit: 0, warn: 1, info: 2 } as const;
  return issues.sort((a, b) => order[a.tone] - order[b.tone]);
}

export function computeLlmVerdict(issues: LlmIssue[], overview: any): LlmVerdict {
  const crit = issues.filter(i => i.tone === 'crit');
  const warn = issues.filter(i => i.tone === 'warn');
  const calls = Number(overview?.data?.total?.calls ?? 0);
  if (crit.length) return { tone: 'crit', title: crit[0].title, detail: crit.length + warn.length > 1 ? `${crit.length + warn.length} things need attention.` : crit[0].detail };
  if (warn.length) return { tone: 'warn', title: warn[0].title, detail: warn.length > 1 ? `${warn.length} things to look at.` : warn[0].detail };
  if (!calls) return { tone: 'info', title: 'No model calls in this window', detail: 'Pick a longer window, or wait for a service to call a model.' };
  return { tone: 'ok', title: 'Every router is answering', detail: `${llmInt(calls)} calls in the window, ${llmPct(overview?.data?.total?.errorPct ?? 0)} failed.` };
}

// ───────────────────────────── routing map ─────────────────────────────

export interface FlowNode { id: string; label: string; column: 0 | 1 | 2; value: number; y: number; h: number; tone?: string; key: string }
export interface FlowLink { from: string; to: string; value: number; y0: number; y1: number; w: number; failed: number; calls: number }

/**
 * A three-column flow: services' lanes → routers → models. Ribbon width is the chosen measure
 * (tokens, calls or cost). Nodes are stacked by size; links keep their order on both ends so the
 * ribbons do not cross more than the data forces.
 */
export function layoutFlow(flows: any[], measure: 'tokens' | 'calls' | 'costUsd', height: number, gap = 10): { nodes: FlowNode[]; links: FlowLink[] } {
  const value = (f: any) => Math.max(0, Number(f[measure] ?? 0));
  const usable = flows.filter(f => value(f) > 0);
  if (!usable.length) return { nodes: [], links: [] };
  const columns: Map<string, FlowNode>[] = [new Map(), new Map(), new Map()];
  const add = (column: 0 | 1 | 2, id: string, label: string, v: number, key: string) => {
    const map = columns[column];
    const node = map.get(id) ?? { id, label, column, value: 0, y: 0, h: 0, key };
    node.value += v;
    map.set(id, node);
  };
  const pairs = new Map<string, { from: string; to: string; value: number; failed: number; calls: number }>();
  const pair = (from: string, to: string, v: number, failed: number, calls: number) => {
    const k = `${from}→${to}`;
    const p = pairs.get(k) ?? { from, to, value: 0, failed: 0, calls: 0 };
    p.value += v;
    p.failed += failed;
    p.calls += calls;
    pairs.set(k, p);
  };
  for (const f of usable) {
    const v = value(f);
    const lane = `l:${f.lane}`, router = `r:${f.router}`, model = `m:${f.model}`;
    add(0, lane, f.laneLabel ?? f.lane, v, f.lane);
    add(1, router, f.routerLabel ?? f.router, v, f.router);
    add(2, model, f.model, v, f.model);
    pair(lane, router, v, Number(f.failed ?? 0), Number(f.calls ?? 0));
    pair(router, model, v, Number(f.failed ?? 0), Number(f.calls ?? 0));
  }
  const total = usable.reduce((s, f) => s + value(f), 0);
  const nodes: FlowNode[] = [];
  for (const map of columns) {
    const list = [...map.values()].sort((a, b) => b.value - a.value);
    // Every node gets a floor first (so a tiny lane can be hovered, and its label has room beside
    // the next one), then the rest of the column is shared by size: the column always fills
    // exactly the height it was given.
    const space = Math.max(10, height - gap * Math.max(0, list.length - 1));
    const minH = Math.min(6, space / Math.max(1, list.length));
    const free = Math.max(0, space - minH * list.length);
    let y = 0;
    for (const node of list) {
      node.h = minH + (node.value / total) * free;
      node.y = y;
      y += node.h + gap;
      nodes.push(node);
    }
  }
  const byId = new Map(nodes.map(n => [n.id, n]));
  const outCursor = new Map<string, number>();
  const inCursor = new Map<string, number>();
  const links: FlowLink[] = [];
  const ordered = [...pairs.values()].sort((a, b) => {
    const fa = byId.get(a.from)!, fb = byId.get(b.from)!;
    if (fa.y !== fb.y) return fa.y - fb.y;
    return byId.get(a.to)!.y - byId.get(b.to)!.y;
  });
  for (const p of ordered) {
    const from = byId.get(p.from)!, to = byId.get(p.to)!;
    const w0 = from.h * (p.value / from.value);
    const w1 = to.h * (p.value / to.value);
    const y0 = from.y + (outCursor.get(p.from) ?? 0);
    const y1 = to.y + (inCursor.get(p.to) ?? 0);
    outCursor.set(p.from, (outCursor.get(p.from) ?? 0) + w0);
    inCursor.set(p.to, (inCursor.get(p.to) ?? 0) + w1);
    links.push({ from: p.from, to: p.to, value: p.value, y0: y0 + w0 / 2, y1: y1 + w1 / 2, w: Math.max(1, Math.min(w0, w1)), failed: p.failed, calls: p.calls });
  }
  return { nodes, links };
}

// ───────────────────────────── simulator ─────────────────────────────

export interface SimBuckets {
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  calls: number;
  unmeasuredPromptTokens: number;
  actualCostUsd: number;
  listCostUsd?: number;
}

export interface SimScenario {
  id: string;
  name: string;
  input: number | null;
  cachedInput: number | null;
  cacheWrite: number | null;
  output: number | null;
  monthlyFee: number | null;
  /** asRecorded: the recorded cache split; none: no cache at all; percent: this share of prompt tokens cached. */
  cache: 'asRecorded' | 'none' | 'percent';
  cachePercent: number;
}

export function blankScenario(id: string, name: string): SimScenario {
  return { id, name, input: null, cachedInput: null, cacheWrite: null, output: null, monthlyFee: null, cache: 'asRecorded', cachePercent: 80 };
}

/**
 * The same tokens at a scenario's prices. Cache writes are part of the fresh input (never an
 * addition); a blank cached or write price bills those tokens as input. "No cache" bills every
 * prompt token as input; a cache percentage re-splits the prompt before pricing.
 */
export function simulateCost(b: SimBuckets, s: SimScenario, days = 0): { tokens: number; costUsd: number; perToken: number; fee: number } {
  const prompt = b.inputTokens + b.cacheReadTokens;
  let cached = b.cacheReadTokens, fresh = b.inputTokens, write = Math.min(b.cacheWriteTokens, b.inputTokens);
  if (s.cache === 'none') { cached = 0; fresh = prompt; write = 0; }
  else if (s.cache === 'percent') {
    cached = Math.round(prompt * Math.min(100, Math.max(0, s.cachePercent)) / 100);
    fresh = prompt - cached;
    write = Math.min(write, fresh);
  }
  const input = s.input ?? 0;
  const perToken = ((fresh - write) * input + write * (s.cacheWrite ?? input) + cached * (s.cachedInput ?? input) + b.outputTokens * (s.output ?? 0)) / 1_000_000;
  const fee = s.monthlyFee && days > 0 ? s.monthlyFee * (days / 30.4375) : 0;
  return { tokens: prompt + b.outputTokens, costUsd: perToken + fee, perToken, fee };
}

/** Monthly token volume at which a flat fee starts to beat a per-token scenario, or null. */
export function breakEvenTokens(scenario: SimScenario, flatMonthlyFee: number, b: SimBuckets): number | null {
  const tokens = b.inputTokens + b.cacheReadTokens + b.outputTokens;
  if (!tokens || !flatMonthlyFee) return null;
  const costPerToken = simulateCost(b, { ...scenario, monthlyFee: null }).perToken / tokens;
  return costPerToken > 0 ? flatMonthlyFee / costPerToken : null;
}

// ───────────────────────────── forecast ─────────────────────────────

export interface LlmForecast {
  method: string;
  sampleDays: number;
  days: { day: number; mean: number; low: number; high: number }[];
  total: { mean: number; low: number; high: number };
  monthEnd: { mean: number; low: number; high: number; soFar: number } | null;
}

/**
 * A projection of a daily series (tokens or cost) for the next <horizon> days. With four weeks or
 * more of history it multiplies a linear trend by each weekday's own level; otherwise it carries the
 * last seven days' mean forward. The band is ±1.28 standard deviations of the residuals (about 80%).
 */
export function forecastDaily(points: { day: number; value: number }[], horizon = 30, now = Date.now()): LlmForecast | null {
  const series = points.filter(p => Number.isFinite(p.value)).sort((a, b) => a.day - b.day);
  // The current day is partial: leave it out of the fit.
  const today = Math.floor(now / 86_400_000) * 86_400_000;
  const full = series.filter(p => p.day < today);
  if (full.length < 3) return null;
  const DAY = 86_400_000;
  const lastDay = full[full.length - 1].day;
  let method: string;
  let predict: (day: number) => number;
  let residuals: number[];
  if (full.length >= 28) {
    const n = full.length;
    const xs = full.map((_, i) => i);
    const ys = full.map(p => p.value);
    const mx = xs.reduce((s, x) => s + x, 0) / n, my = ys.reduce((s, y) => s + y, 0) / n;
    const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0) || 1;
    const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / sxx;
    const intercept = my - slope * mx;
    const factors = new Array(7).fill(0).map(() => ({ sum: 0, n: 0 }));
    full.forEach((p, i) => {
      const trend = intercept + slope * i;
      if (trend > 0) { const f = factors[new Date(p.day).getUTCDay()]; f.sum += p.value / trend; f.n++; }
    });
    const factor = factors.map(f => (f.n ? f.sum / f.n : 1));
    predict = day => {
      const i = n - 1 + (day - lastDay) / DAY;
      return Math.max(0, (intercept + slope * i) * factor[new Date(day).getUTCDay()]);
    };
    residuals = full.map(p => p.value - predict(p.day));
    method = `Linear trend × weekday pattern, fitted on ${n} days`;
  } else {
    const last = full.slice(-7);
    const mean = last.reduce((s, p) => s + p.value, 0) / last.length;
    predict = () => mean;
    residuals = last.map(p => p.value - mean);
    method = `Mean of the last ${last.length} days, carried forward`;
  }
  const sd = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / Math.max(1, residuals.length - 1));
  const days: LlmForecast['days'] = [];
  for (let i = 1; i <= horizon; i++) {
    const day = lastDay + i * DAY;
    const mean = predict(day);
    days.push({ day, mean, low: Math.max(0, mean - 1.28 * sd), high: mean + 1.28 * sd });
  }
  // A sum's spread grows with the square root of its length (independent days).
  const sum = (key: 'mean') => days.reduce((s, d) => s + d[key], 0);
  const totalMean = sum('mean');
  const spread = 1.28 * sd * Math.sqrt(horizon);
  const d = new Date(now);
  const monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const monthEndMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  const soFar = series.filter(p => p.day >= monthStart).reduce((s, p) => s + p.value, 0);
  const remaining = days.filter(p => p.day >= today && p.day < monthEndMs);
  const remainingMean = remaining.reduce((s, p) => s + p.mean, 0);
  const remainingSpread = 1.28 * sd * Math.sqrt(Math.max(1, remaining.length));
  return {
    method,
    sampleDays: full.length,
    days,
    total: { mean: totalMean, low: Math.max(0, totalMean - spread), high: totalMean + spread },
    monthEnd: { mean: soFar + remainingMean, low: soFar + Math.max(0, remainingMean - remainingSpread), high: soFar + remainingMean + remainingSpread, soFar },
  };
}

// ───────────────────────────── insights ─────────────────────────────

export interface LlmInsight { id: string; tone: 'info' | 'warn' | 'good'; title: string; detail: string; jump?: { tab: string; target?: string } }

/** Observations from a breakdown of this window and the one before. Nothing here acts by itself. */
export function computeLlmInsights(current: any, previous: any, routers: any[], routing: any): LlmInsight[] {
  const out: LlmInsight[] = [];
  const cur: any[] = current?.groups ?? [];
  const prev = new Map<string, any>((previous?.groups ?? []).map((g: any) => [g.key, g]));
  for (const g of cur) {
    const p = prev.get(g.key);
    const v = g.values ?? {};
    const pv = p?.values ?? {};
    const tokensDelta = llmDelta(v.totalTokens, pv.totalTokens);
    if (tokensDelta != null && Math.abs(tokensDelta) >= 0.5 && Number(v.totalTokens ?? 0) > 200_000)
      out.push({ id: `tokens-${g.key}`, tone: tokensDelta > 0 ? 'warn' : 'info', title: `${g.label} used ${tokensDelta > 0 ? 'more' : 'fewer'} tokens: ${llmPct(Math.abs(tokensDelta) * 100, 0)} ${tokensDelta > 0 ? 'up' : 'down'}`, detail: `${llmCompact(v.totalTokens)} against ${llmCompact(pv.totalTokens)} in the window before.`, jump: { tab: 'analytics' } });
    const costDelta = llmDelta(v.estCostUsd, pv.estCostUsd);
    if (costDelta != null && costDelta >= 0.5 && Number(v.estCostUsd ?? 0) >= 1)
      out.push({ id: `cost-${g.key}`, tone: 'warn', title: `${g.label} cost ${llmPct(costDelta * 100, 0)} more`, detail: `${llmUsd(v.estCostUsd)} against ${llmUsd(pv.estCostUsd)}.`, jump: { tab: 'costs' } });
    if (isFiniteNumber(v.retries) && Number(v.calls ?? 0) >= 20 && v.retries / v.calls >= 0.15)
      out.push({ id: `retries-${g.key}`, tone: 'warn', title: `${g.label} retries ${llmPct((v.retries / v.calls) * 100, 0)} of its calls`, detail: `${llmInt(v.retries)} extra requests: each one is another prefill.`, jump: { tab: 'calls' } });
    if (isFiniteNumber(v.prefixReusePct) && v.prefixReusePct < 60 && Number(v.wastedPrefillTokens ?? 0) > 1_000_000)
      out.push({ id: `prefill-${g.key}`, tone: 'warn', title: `${g.label} re-prefills ${llmCompact(v.wastedPrefillTokens)} tokens`, detail: `Only ${llmPct(v.prefixReusePct)} of its continuation prompts were served from cache.`, jump: { tab: 'analytics', target: 'prefixReusePct' } });
    if (Number(v.truncated ?? 0) >= 5)
      out.push({ id: `truncated-${g.key}`, tone: 'info', title: `${g.label}: ${llmInt(v.truncated)} replies cut off at the output cap`, detail: 'A larger output limit for that lane would let them finish.', jump: { tab: 'calls' } });
    if (Number(v.redirected ?? 0) >= 5)
      out.push({ id: `redirected-${g.key}`, tone: 'info', title: `${g.label}: ${llmInt(v.redirected)} calls asked for a model their router does not serve`, detail: 'They were sent the route’s model instead. Pin a model, or route the lane where its model is served.', jump: { tab: 'routing' } });
  }
  for (const [key, p] of prev) {
    if (!cur.some(g => g.key === key) && Number(p.values?.calls ?? 0) >= 10)
      out.push({ id: `idle-${key}`, tone: 'info', title: `${p.label} made no calls this window`, detail: `It made ${llmInt(p.values.calls)} in the window before.` });
  }
  const inUse = new Set<string>((routing?.lanes ?? []).flatMap((l: any) => [l.effective?.router, ...(l.effective?.fallbacks ?? []).map((f: any) => f.router)]).filter(Boolean));
  for (const r of routers ?? []) {
    if (r.enabled && r.keySet && !inUse.has(r.id) && !Number(r.traffic24h?.calls ?? 0) && r.id !== 'local')
      out.push({ id: `unused-${r.id}`, tone: 'info', title: `${r.name} is configured but nothing uses it`, detail: 'No lane routes to it or falls back on it.', jump: { tab: 'routing' } });
    const fee = Number(r.monthlyFeeUsd ?? 0);
    if (r.billing === 'Flat' && fee > 0 && r.list30d != null) {
      const saving = r.list30d - fee;
      out.push({ id: `fee-${r.id}`, tone: saving >= 0 ? 'good' : 'warn', title: `${r.name}: ${llmUsd(Math.abs(saving))} ${saving >= 0 ? 'saved' : 'more than per-token'} over 30 days`, detail: `Its ${llmUsd(fee)} fee against ${llmUsd(r.list30d)} of list-price usage.`, jump: { tab: 'costs' } });
    }
  }
  return out;
}

// ───────────────────────────── time windows ─────────────────────────────

export const LLM_PRESETS = ['15m', '1h', '6h', '24h', '7d', '30d', '90d', '1y'] as const;
export const LLM_BUCKETS = ['auto', '1m', '5m', '15m', '1h', '6h', '1d', '7d'] as const;

export function presetMs(preset: string): number {
  const n = parseInt(preset, 10);
  if (preset.endsWith('m')) return n * 60_000;
  if (preset.endsWith('h')) return n * 3_600_000;
  if (preset.endsWith('d')) return n * 86_400_000;
  if (preset.endsWith('y')) return n * 365 * 86_400_000;
  return 86_400_000;
}

export interface LlmWindow { range: string; from: number | null; to: number | null }

export function windowBounds(w: LlmWindow, now: number): { from: number; to: number } {
  if (w.from != null && w.to != null) return { from: w.from, to: w.to };
  return { from: now - presetMs(w.range || '24h'), to: now };
}

/** Twice as wide, around the same middle, never into the future. */
export function zoomOut(w: LlmWindow, now: number): LlmWindow {
  const { from, to } = windowBounds(w, now);
  const span = to - from;
  let nextTo = to + span / 2;
  let nextFrom = from - span / 2;
  if (nextTo > now) { nextFrom -= nextTo - now; nextTo = now; }
  return { range: w.range, from: Math.round(nextFrom), to: Math.round(nextTo) };
}

/** Half as wide, around the same middle. One minute at the finest. */
export function zoomIn(w: LlmWindow, now: number): LlmWindow {
  const { from, to } = windowBounds(w, now);
  const span = Math.max(60_000, (to - from) / 2);
  const mid = (from + to) / 2;
  return { range: w.range, from: Math.round(mid - span / 2), to: Math.round(mid + span / 2) };
}

/** A quarter of the window earlier (−1) or later (+1), never past now. */
export function pan(w: LlmWindow, direction: -1 | 1, now: number): LlmWindow {
  const { from, to } = windowBounds(w, now);
  const span = to - from;
  let shift = direction * span / 4;
  if (to + shift > now) shift = now - to;
  return { range: w.range, from: Math.round(from + shift), to: Math.round(to + shift) };
}

export function describeWindow(w: LlmWindow, now: number): string {
  if (w.from == null || w.to == null) return `Last ${w.range}`;
  const sameDay = new Date(w.from).toDateString() === new Date(w.to).toDateString();
  const fmt = (ms: number, withDate: boolean) => new Date(ms).toLocaleString([], withDate ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { hour: '2-digit', minute: '2-digit' });
  return `${fmt(w.from, true)} – ${fmt(w.to, !sameDay)}${Math.abs(now - w.to) < 90_000 ? ' (now)' : ''}`;
}

/** Query-string parameters for a window, as the /klivellm read routes take them. */
export function windowParams(w: LlmWindow): Record<string, string> {
  return w.from != null && w.to != null ? { from: String(w.from), to: String(w.to) } : { range: w.range || '24h' };
}

export function qs(params: Record<string, string | number | boolean | null | undefined | string[]>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '' || v === false) continue;
    if (Array.isArray(v)) { if (v.length) q.set(k, v.join(',')); continue; }
    q.set(k, v === true ? '1' : String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

// ───────────────────────────── routing drafts ─────────────────────────────

export const POLICY_FIELDS = ['router', 'model', 'pin', 'fallbacks', 'thinking', 'serviceTier', 'spending', 'paused', 'pausedReason', 'maxParallel', 'budget', 'note'] as const;

const POLICY_FIELD_LABELS: Record<string, string> = {
  router: 'router', model: 'model', pin: 'model pin', fallbacks: 'fallbacks', thinking: 'thinking', serviceTier: 'service tier',
  spending: 'spending', paused: 'pause', pausedReason: 'pause reason', maxParallel: 'max parallel', budget: 'budget', note: 'note',
};

function isBlank(value: unknown): boolean {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0)
    || (typeof value === 'object' && !Array.isArray(value) && Object.values(value as object).every(isBlank));
}

/** A policy with its blank fields dropped (and the server's computed isEmpty), or null if nothing is set. */
export function normalizePolicy(policy: any): Record<string, any> | null {
  if (!policy || typeof policy !== 'object') return null;
  const out: Record<string, any> = {};
  for (const field of POLICY_FIELDS) {
    let v = policy[field];
    if (field === 'fallbacks' && Array.isArray(v)) v = v.filter((f: any) => f?.router).map((f: any) => (f.model ? { router: f.router, model: f.model } : { router: f.router }));
    if (field === 'budget' && v && typeof v === 'object') {
      const b: Record<string, any> = {};
      for (const k of ['dailyUsd', 'monthlyUsd', 'dailyTokens', 'monthlyTokens']) if (v[k] != null && v[k] !== '' && Number(v[k]) > 0) b[k] = Number(v[k]);
      if (Object.keys(b).length) b.action = v.action || 'warn';
      v = Object.keys(b).length ? b : null;
    }
    if (field === 'paused' && v === false) v = null;
    if (!isBlank(v)) out[field] = v;
  }
  if (!out.paused) delete out.pausedReason;
  return Object.keys(out).length ? out : null;
}

/** The parts of a routing document a draft can change, in a canonical shape for comparing. */
export function normalizeRouting(doc: any) {
  const map = (m: any) => {
    const out: Record<string, any> = {};
    for (const key of Object.keys(m ?? {}).sort()) { const p = normalizePolicy(m[key]); if (p) out[key] = p; }
    return out;
  };
  return {
    default: normalizePolicy(doc?.default) ?? {},
    services: map(doc?.services),
    lanes: map(doc?.lanes),
    override: doc?.override ?? null,
    routers: [...(doc?.routers ?? [])].sort((a: any, b: any) => String(a.id).localeCompare(String(b.id))),
  };
}

function describe(value: any): string {
  if (value == null) return 'inherited';
  if (Array.isArray(value)) return value.length ? value.map((f: any) => f.model ? `${f.router} (${f.model})` : f.router).join(', ') : 'none';
  if (typeof value === 'object') return Object.entries(value).map(([k, v]) => `${k} ${v}`).join(', ');
  if (value === true) return 'on';
  return String(value);
}

/** What a draft changes against the routing in force, one line per field, in words. */
export function routingDraftChanges(current: any, draft: any): string[] {
  if (!current || !draft) return [];
  const a = normalizeRouting(current), b = normalizeRouting(draft);
  const out: string[] = [];
  const policy = (where: string, p: any, q: any) => {
    for (const field of POLICY_FIELDS) {
      const x = p?.[field] ?? null, y = q?.[field] ?? null;
      if (JSON.stringify(x) !== JSON.stringify(y)) out.push(`${where}: ${POLICY_FIELD_LABELS[field]} ${describe(x)} → ${describe(y)}`);
    }
  };
  policy('Default route', a.default, b.default);
  for (const key of [...new Set([...Object.keys(a.services), ...Object.keys(b.services)])].sort()) policy(key, a.services[key], b.services[key]);
  for (const key of [...new Set([...Object.keys(a.lanes), ...Object.keys(b.lanes)])].sort()) policy(key.replace('/', ' › '), a.lanes[key], b.lanes[key]);
  if (JSON.stringify(a.routers) !== JSON.stringify(b.routers)) out.push('Routers changed');
  return out;
}

/**
 * Carries a draft's edits onto a newer routing document (someone paused a lane, or another tab
 * applied a change, while this draft was open). Field by field: what the draft did not touch takes
 * the newer value; what only the draft changed keeps the draft's; where both changed the same field
 * differently the draft wins and the field is listed as a conflict for the page to point out.
 */
export function rebaseRouting(origin: any, draft: any, latest: any): { doc: any; conflicts: string[] } {
  const doc = cloneRouting(latest);
  const conflicts: string[] = [];
  const same = (x: any, y: any) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
  const merge = (where: string, o: any, d: any, l: any) => {
    const target: Record<string, any> = { ...(l ?? {}) };
    for (const field of POLICY_FIELDS) {
      const base = o?.[field], mine = d?.[field], theirs = l?.[field];
      if (same(mine, base)) continue;
      if (!same(theirs, base) && !same(theirs, mine)) conflicts.push(`${where}: ${POLICY_FIELD_LABELS[field]}`);
      if (mine == null) delete target[field]; else target[field] = cloneRouting(mine);
    }
    return target;
  };
  doc.default = merge('Default route', origin?.default, draft?.default, latest?.default);
  for (const part of ['services', 'lanes'] as const) {
    const keys = new Set([...Object.keys(origin?.[part] ?? {}), ...Object.keys(draft?.[part] ?? {}), ...Object.keys(latest?.[part] ?? {})]);
    doc[part] = doc[part] ?? {};
    for (const key of keys) {
      const merged = merge(part === 'lanes' ? key.replace('/', ' › ') : key, origin?.[part]?.[key], draft?.[part]?.[key], latest?.[part]?.[key]);
      if (normalizePolicy(merged)) doc[part][key] = merged; else delete doc[part][key];
    }
  }
  if (!same(draft?.override, origin?.override)) doc.override = cloneRouting(draft?.override ?? null);
  if (!same(draft?.routers, origin?.routers)) doc.routers = cloneRouting(draft?.routers ?? []);
  return { doc, conflicts };
}

/** Deep copy of a routing document for editing (the server's own copy is never touched). */
export function cloneRouting<T>(doc: T): T {
  return JSON.parse(JSON.stringify(doc ?? {}));
}

// ───────────────────────────── commands ─────────────────────────────

export interface LlmCommand {
  id: string;
  group: string;
  title: string;
  icon: string;
  hint?: string;
  keywords?: string;
  danger?: boolean;
  run: () => unknown;
}

/** Every word must match, in the title or (worth less) the keywords; shorter titles win ties. */
export function llmCommandScore(query: string, c: Pick<LlmCommand, 'title' | 'keywords'>): number {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  const title = c.title.toLowerCase();
  const keys = (c.keywords ?? '').toLowerCase();
  let score = 0;
  for (const word of words) {
    const t = title.indexOf(word);
    const k = keys.indexOf(word);
    if (t < 0 && k < 0) return 0;
    score += t === 0 ? 30 : t > 0 ? (title[t - 1] === ' ' ? 22 : 12) : 6;
  }
  return Math.max(1, score - title.length * 0.15);
}
