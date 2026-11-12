import type { Page, Route } from '@playwright/test';
import { catalogPayload, mePayload, PERMISSIONS } from './permissions';

/**
 * A stateful stand-in for the /klivellm routes, with the shapes KliveLLMRoutes.cs and LlmQuery.cs
 * write (overview, live, routing view, routers view, series, breakdown, distribution, heatmap,
 * simulator, calls, call detail). The figures are invented but consistent: every lane's traffic
 * goes to the router its route resolves to, so applying a route moves its ribbon on the map.
 */

export interface LlmApiMock {
  requestedPaths: string[];
  directGets: string[];
  batchCalls: string[][];
  posts: Array<{ path: string; body: any }>;
  state: { revision: number; document: any; history: any[]; prices: any[] };
  /** The last /klivellm/simulator answer, so a test can check the page's arithmetic. */
  lastSimulator: any;
  /** Paths this fake had no answer for. */
  unknownPaths: string[];
}

export interface LlmMockOptions {
  /** Permission keys the signed-in profile holds; everything (the owner) when left out. */
  permissions?: string[];
}

export const llmTestOrigin = new URL(
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '4173'}`,
).origin;

const HOUR = 3_600_000;
const DAY = 86_400_000;
const WIDTHS = [60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000, 3_600_000, 7_200_000, 10_800_000, 21_600_000, 43_200_000, 86_400_000, 172_800_000, 604_800_000];
const PRESETS: Record<string, number> = { '15m': 15 * 60_000, '1h': HOUR, '6h': 6 * HOUR, '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY, '90d': 90 * DAY, '1y': 365 * DAY };

const ROUTERS = [
  { id: 'openrouter', name: 'OpenRouter', kind: 'openrouter', builtIn: true, billing: 'PerToken', enabled: true, monthlyFeeUsd: null, defaultModel: 'openai/gpt-5-mini', keySet: true },
  { id: 'openrouter-free', name: 'OpenRouter (free model)', kind: 'openrouter', builtIn: true, billing: 'Free', enabled: true, monthlyFeeUsd: null, defaultModel: 'meta-llama/llama-4-scout:free', keySet: true },
  { id: 'airouter', name: 'AIRouter', kind: 'airouter', builtIn: true, billing: 'Flat', enabled: true, monthlyFeeUsd: 20, defaultModel: 'Qwen3.8', keySet: true },
  { id: 'huggingface', name: 'HuggingFace', kind: 'huggingface', builtIn: true, billing: 'PerToken', enabled: true, monthlyFeeUsd: null, defaultModel: 'Qwen/Qwen3-32B', keySet: false },
  { id: 'custom', name: 'Custom endpoint', kind: 'openai', builtIn: true, billing: 'PerToken', enabled: true, monthlyFeeUsd: null, defaultModel: null, keySet: false },
  { id: 'local', name: 'Local model', kind: 'local', builtIn: true, billing: 'Free', enabled: true, monthlyFeeUsd: null, defaultModel: 'local-gguf', keySet: true },
];

const LANES = [
  { service: 'KliveAgent', lane: 'chat', label: 'Chat', description: 'Klives talking to KliveAgent', workClass: 'Interactive', needsToolCalling: true, defaultSpending: 'PrimaryOnly', modelSource: 'KliveAgent_FastModel', fixedRouter: null, perDay: 120, prompt: 18_000, completion: 900 },
  { service: 'KliveAgent', lane: 'speech', label: 'Speech', description: 'Whisper and Kokoro', workClass: 'Interactive', needsToolCalling: false, defaultSpending: 'PrimaryOnly', modelSource: null, fixedRouter: 'airouter', perDay: 15, prompt: 0, completion: 0 },
  { service: 'Projects', lane: 'commander', label: 'Commander', description: 'Each project’s planner', workClass: 'Background', needsToolCalling: true, defaultSpending: 'PrimaryOnly', modelSource: 'per-project model routes', fixedRouter: null, perDay: 900, prompt: 42_000, completion: 1_100 },
  { service: 'Projects', lane: 'subagent', label: 'Sub-agents', description: 'Workers a commander starts', workClass: 'Background', needsToolCalling: true, defaultSpending: 'PrimaryOnly', modelSource: 'per-project model routes', fixedRouter: null, perDay: 1_500, prompt: 28_000, completion: 700 },
  { service: 'Projects', lane: 'utility', label: 'Utility', description: 'Summaries and titles', workClass: 'Background', needsToolCalling: false, defaultSpending: 'PrimaryOnly', modelSource: null, fixedRouter: null, perDay: 300, prompt: 3_000, completion: 300 },
  { service: 'OmniBlox', lane: 'agents', label: 'Studio agents', description: 'The game builders', workClass: 'Background', needsToolCalling: true, defaultSpending: 'Never', modelSource: null, fixedRouter: null, perDay: 400, prompt: 24_000, completion: 1_400 },
  { service: 'Omniscience', lane: 'profiling', label: 'Profiling', description: 'Free-model profile passes', workClass: 'Batch', needsToolCalling: false, defaultSpending: 'Never', modelSource: null, fixedRouter: null, perDay: 2_000, prompt: 2_000, completion: 400, free: true },
  { service: 'Stratum', lane: 'engineer', label: 'Engineer', description: 'The geometry agent', workClass: 'Interactive', needsToolCalling: true, defaultSpending: 'PrimaryOnly', modelSource: 'StratumEngineerModelID', fixedRouter: null, perDay: 30, prompt: 30_000, completion: 2_000 },
].map(l => ({ ...l, key: `${l.service}/${l.lane}` }));

const PRICES = [
  { router: 'openrouter', model: 'openai/gpt-5-mini', inputPerMTok: 0.25, cachedInputPerMTok: 0.025, cacheWritePerMTok: null, outputPerMTok: 2, source: 'openrouter', updatedUtc: '2026-11-10T09:00:00Z' },
  { router: 'openrouter', model: 'anthropic/claude-sonnet-5', inputPerMTok: 3, cachedInputPerMTok: 0.3, cacheWritePerMTok: 3.75, outputPerMTok: 15, source: 'openrouter', updatedUtc: '2026-11-10T09:00:00Z' },
  { router: '*', model: 'Qwen3.8', inputPerMTok: 0.4, cachedInputPerMTok: 0.08, cacheWritePerMTok: null, outputPerMTok: 1.6, source: 'manual', updatedUtc: '2026-11-01T12:00:00Z' },
];

/** Deterministic noise, so a run looks the same every time. */
function noise(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

async function fulfilJson(route: Route, payload: unknown, status = 200) {
  await route.fulfill({
    status,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
      'access-control-allow-headers': 'Authorization, Content-Type, X-Klive-Client, X-Klive-Page',
      'access-control-expose-headers': 'RequestDeniedCode',
      'content-type': 'application/json; charset=utf-8',
    },
    body: status === 204 ? '' : typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}

export async function installLlmApiMock(page: Page, options: LlmMockOptions = {}): Promise<LlmApiMock> {
  const t0 = Date.now();
  const routers = ROUTERS.map(r => ({ ...r }));
  const state = {
    revision: 1,
    document: {
      schemaVersion: 1, revision: 1, updatedUtc: new Date(t0 - 3 * DAY).toISOString(), updatedBy: 'Klives',
      default: {} as Record<string, any>, services: { Stratum: { router: 'openrouter', model: 'anthropic/claude-sonnet-5' } } as Record<string, any>, lanes: {} as Record<string, any>,
      override: null as any, routers: [] as any[], capture: {} as Record<string, any>,
    },
    history: [{ revision: 1, atUtc: new Date(t0 - 3 * DAY).toISOString(), by: 'Klives', note: 'Stratum on Sonnet', changes: ['Stratum: router inherited → openrouter', 'Stratum: model inherited → anthropic/claude-sonnet-5'], before: null as any, after: null as any }] as any[],
    prices: PRICES.map(p => ({ ...p })),
  };
  state.history[0].after = JSON.parse(JSON.stringify(state.document));
  const mock: LlmApiMock = { requestedPaths: [], directGets: [], batchCalls: [], posts: [], state, lastSimulator: null, unknownPaths: [] };
  const me = options.permissions
    ? mePayload({ rank: 4, userId: 'e2e-admin', name: 'Admin Fixture', permissions: options.permissions })
    : mePayload({ rank: 5, userId: 'e2e-klives', name: 'Klives Fixture' });

  // ── routing ──
  const routerById = (id?: string | null) => routers.find(r => r.id === String(id ?? '').toLowerCase());
  const routerName = (id?: string | null) => routerById(id)?.name ?? id ?? '—';
  const overrideOn = () => (state.document.override && new Date(state.document.override.untilUtc).getTime() > Date.now() ? state.document.override : null);

  function resolve(lane: (typeof LANES)[number], doc = state.document) {
    const lp: any = doc.lanes?.[lane.key] ?? {};
    const sp: any = doc.services?.[lane.service] ?? {};
    const dp: any = doc.default ?? {};
    const chain: string[] = [];
    let router: string, source: string, model: string | null = null;
    const ov = doc.override && new Date(doc.override.untilUtc).getTime() > Date.now() && (!doc.override.services?.length || doc.override.services.includes(lane.service)) ? doc.override : null;
    if (lane.fixedRouter) { router = lane.fixedRouter; source = 'fixed'; chain.push(`${lane.label} always uses ${routerName(router)}: its endpoint is not a chat router.`); }
    else if (ov) { router = ov.router; source = 'override'; model = ov.model ?? null; chain.push(`Emergency override: ${routerName(router)}.`); }
    else if (lp.router) { router = lp.router; source = 'lane'; model = lp.model ?? null; chain.push(`${lane.service} › ${lane.label} is set to ${routerName(router)}.`); }
    else if (sp.router) { router = sp.router; source = 'service'; model = lp.model ?? sp.model ?? null; chain.push(`${lane.service} is set to ${routerName(router)}.`); }
    else if ((lane as any).free) { router = 'openrouter-free'; source = 'free-model'; chain.push('A free-model call with no router set for it: OpenRouter’s free model, as always.'); }
    else if (dp.router) { router = dp.router; source = 'default'; model = lp.model ?? sp.model ?? dp.model ?? null; chain.push(`No router set for ${lane.service}: the default route, ${routerName(router)}.`); }
    else { router = 'airouter'; source = 'setting'; model = lp.model ?? sp.model ?? dp.model ?? null; chain.push(`No router set anywhere: RemoteLLMProvider, which selects ${routerName(router)}.`); }
    const r = routerById(router);
    model = model ?? r?.defaultModel ?? null;
    const pin = !!(lp.pin ?? sp.pin ?? dp.pin);
    const spending = lp.spending ?? sp.spending ?? lane.defaultSpending;
    const fallbacks = (lp.fallbacks ?? sp.fallbacks ?? dp.fallbacks ?? []).map((f: any) => ({ router: f.router, name: routerName(f.router), model: f.model ?? null, billing: routerById(f.router)?.billing ?? 'PerToken' }));
    if (fallbacks.length) chain.push(`On a router failure: ${fallbacks.map((f: any) => f.name).join(', then ')}.`);
    const paused = lp.paused || sp.paused;
    const budget = lp.budget ?? sp.budget ?? null;
    const warnings: string[] = [];
    let blocked: string | null = null, blockReason: string | null = null;
    if (paused) { blocked = 'Paused'; blockReason = `${lane.service}${lp.paused ? ` › ${lane.label}` : ''} is paused from KliveLLM.`; chain.push(`Refused: ${blockReason}`); }
    else if (spending === 'Never' && r?.billing === 'PerToken') { blocked = 'SpendingNotAllowed'; blockReason = `${lane.service} may never spend per token, and ${r.name} bills per token.`; chain.push(`Refused: ${blockReason}`); }
    return {
      router, routerName: routerName(router), billing: r?.billing ?? 'PerToken', model, pin, source, fallbacks, spending,
      thinking: lp.thinking ?? sp.thinking ?? null, serviceTier: lp.serviceTier ?? sp.serviceTier ?? null, maxParallel: lp.maxParallel ?? sp.maxParallel ?? null,
      budget, budgetScope: lp.budget ? 'lane' : sp.budget ? 'service' : null,
      budgetStatus: budget ? { exceeded: false, warning: false, limit: budget.dailyUsd ? 'daily spend' : 'monthly spend', fraction: 0.31, detail: '$1.55 of $5.00 today', resetsIn: '07:12:00' } : null,
      capture: !!(doc.capture?.[lane.key] && new Date(doc.capture[lane.key].untilUtc).getTime() > Date.now()),
      blocked, blockReason, chain, warnings,
    };
  }

  const laneRow = (lane: (typeof LANES)[number]) => ({
    key: lane.key, service: lane.service, lane: lane.lane, label: lane.label, description: lane.description, catalogued: true,
    workClass: lane.workClass, needsToolCalling: lane.needsToolCalling, defaultSpending: lane.defaultSpending, modelSource: lane.modelSource,
    modelSourceLink: null, fixedRouter: lane.fixedRouter, sessions: lane.service === 'Projects' ? 6 : 1, warmSessions: lane.service === 'Projects' ? 4 : 1,
    effective: resolve(lane),
  });

  const routingView = () => ({
    revision: state.revision,
    document: { ...JSON.parse(JSON.stringify(state.document)), revision: state.revision },
    defaultRouterFromSetting: 'airouter',
    routers: routers.map(r => ({ id: r.id, name: r.name, kind: r.kind, builtIn: r.builtIn, billing: r.billing, enabled: r.enabled, monthlyFeeUsd: r.monthlyFeeUsd, defaultModel: r.defaultModel, baseUrl: (r as any).baseUrl ?? null, maxParallel: null, requestsPerMinute: null, notes: null })),
    lanes: LANES.map(laneRow),
    services: [...new Set(LANES.map(l => l.service))],
    spendingOptions: ['Never', 'PrimaryOnly', 'Anywhere'],
    thinkingOptions: ['off', 'low', 'medium', 'high'],
    serviceTierOptions: ['default', 'flex', 'priority'],
    circuits: [],
  });
  const routingSummary = () => ({
    revision: state.revision, updatedUtc: state.document.updatedUtc, updatedBy: state.document.updatedBy,
    defaultRouter: state.document.default?.router ?? 'airouter', defaultRouterName: routerName(state.document.default?.router ?? 'airouter'),
    followsSetting: !state.document.default?.router, override: overrideOn(), capture: {},
    paused: [...Object.entries(state.document.services).filter(([, p]: any) => p?.paused).map(([k]) => k), ...Object.entries(state.document.lanes).filter(([, p]: any) => p?.paused).map(([k]) => k)],
  });

  // ── figures ──
  function windowOf(q: URLSearchParams, fallback = '24h') {
    const now = Date.now();
    let from: number, to: number;
    if (q.get('from')) { from = Number(q.get('from')); to = q.get('to') ? Number(q.get('to')) : now; }
    else { const range = q.get('range') ?? fallback; to = now + 1; from = now - (PRESETS[range] ?? DAY); }
    const span = to - from;
    let step = q.get('bucket') && q.get('bucket') !== 'auto' ? ({ '1m': 60_000, '5m': 300_000, '15m': 900_000, '1h': HOUR, '6h': 6 * HOUR, '1d': DAY, '7d': 7 * DAY } as Record<string, number>)[q.get('bucket')!] ?? 600_000
      : WIDTHS.find(w => span / w <= Number(q.get('points') ?? 160)) ?? DAY;
    from = Math.floor(from / step) * step;
    to = Math.ceil(to / step) * step;
    const count = Math.max(1, Math.round((to - from) / step));
    const name = step >= DAY ? `${step / DAY}d` : step >= HOUR ? `${step / HOUR}h` : `${step / 60_000}m`;
    return { from, to, step, count, bucket: name, days: (to - from) / DAY };
  }

  const isFree = (router: string) => routerById(router)?.billing !== 'PerToken';
  const priceFor = (router: string, model: string | null) => state.prices.find(p => p.model === model && (p.router === router || p.router === '*')) ?? null;

  function laneValues(lane: (typeof LANES)[number], days: number, scale = 1) {
    const eff = resolve(lane);
    const calls = Math.round(lane.perDay * days * scale);
    const failed = Math.round(calls * (lane.lane === 'commander' ? 0.02 : 0.006));
    const prompt = calls * lane.prompt;
    const completion = calls * lane.completion;
    const cachedShare = eff.router === 'airouter' ? 0.72 : eff.router === 'openrouter' ? 0.55 : 0;
    const cached = Math.round(prompt * cachedShare);
    const price = priceFor(eff.router, eff.model) ?? { inputPerMTok: 0.4, cachedInputPerMTok: 0.08, outputPerMTok: 1.6 };
    const list = ((prompt - cached) * price.inputPerMTok + cached * (price.cachedInputPerMTok ?? price.inputPerMTok) + completion * price.outputPerMTok) / 1e6;
    const est = isFree(eff.router) ? 0 : list;
    const p95 = eff.router === 'airouter' ? 9_400 : eff.router === 'openrouter' ? 6_100 : 3_200;
    return {
      calls, ok: calls - failed, failed, errorPct: calls ? (failed / calls) * 100 : null, attempts: Math.round(calls * 1.04), retries: Math.round(calls * 0.04),
      promptTokens: prompt, cachedTokens: cached, freshTokens: prompt - cached, completionTokens: completion, reasoningTokens: Math.round(completion * 0.2), totalTokens: prompt + completion,
      cacheHitPct: prompt && cachedShare ? cachedShare * 100 : null, prefixReusePct: prompt && cachedShare ? cachedShare * 100 + 8 : null, wastedPrefillTokens: Math.round((prompt - cached) * 0.4),
      costUsd: est, estCostUsd: est, listCostUsd: list, unpricedTokens: 0,
      p50TotalMs: Math.round(p95 * 0.45), p95TotalMs: p95, p50ProviderMs: Math.round(p95 * 0.4), p95ProviderMs: Math.round(p95 * 0.9), p99ProviderMs: Math.round(p95 * 1.6),
      p50TtftMs: Math.round(p95 * 0.12), p95TtftMs: Math.round(p95 * 0.3), meanQueueMs: eff.router === 'airouter' ? 820 : 40, p95QueueMs: eff.router === 'airouter' ? 4_100 : 120,
      tokensPerSec: eff.router === 'airouter' ? 42 : 88, rateLimited: Math.round(calls * 0.002), attemptRateLimited: Math.round(calls * 0.003), fallbacks: 0,
      redirected: lane.service === 'KliveAgent' ? 6 : 0, truncated: lane.lane === 'subagent' ? 7 : 0, coldStarts: Math.round(calls * 0.05), compacted: Math.round(calls * 0.01),
      attemptFailurePct: 1.2, attemptFailures: Math.round(calls * 0.012), timeouts: 0, serverErrors: failed, toolCalls: lane.needsToolCalling ? calls * 2 : 0,
      meanPromptTokens: lane.prompt, p95PromptTokens: lane.prompt * 1.8, meanCompletionTokens: lane.completion, requestBytes: lane.prompt * 4,
    } as Record<string, number | null>;
  }

  const ADDITIVE = new Set(['calls', 'ok', 'failed', 'attempts', 'retries', 'promptTokens', 'cachedTokens', 'freshTokens', 'completionTokens', 'reasoningTokens', 'totalTokens', 'wastedPrefillTokens',
    'costUsd', 'estCostUsd', 'listCostUsd', 'unpricedTokens', 'rateLimited', 'attemptRateLimited', 'fallbacks', 'redirected', 'truncated', 'coldStarts', 'compacted', 'attemptFailures', 'timeouts', 'serverErrors', 'toolCalls']);
  function sum(list: Record<string, number | null>[]): Record<string, number | null> {
    const out: Record<string, number | null> = {};
    const calls = list.reduce((s, v) => s + Number(v.calls ?? 0), 0);
    const keys = new Set(list.flatMap(v => Object.keys(v)));
    for (const k of keys) {
      if (ADDITIVE.has(k)) out[k] = list.reduce((s, v) => s + Number(v[k] ?? 0), 0);
      else {
        const weighted = list.filter(v => v[k] != null && Number(v.calls ?? 0) > 0);
        const w = weighted.reduce((s, v) => s + Number(v.calls), 0);
        out[k] = w ? weighted.reduce((s, v) => s + Number(v[k]) * Number(v.calls), 0) / w : null;
      }
    }
    out.errorPct = calls ? (Number(out.failed ?? 0) / calls) * 100 : null;
    out.cacheHitPct = out.promptTokens ? (Number(out.cachedTokens ?? 0) / Number(out.promptTokens)) * 100 : null;
    return out;
  }
  const filtered = (q: URLSearchParams) => LANES.filter(l => {
    const list = (name: string) => (q.get(name) ? q.get(name)!.split(',') : null);
    const svc = list('service'), lane = list('lane'), router = list('router'), model = list('model');
    const eff = resolve(l);
    return (!svc || svc.includes(l.service)) && (!lane || lane.includes(l.key)) && (!router || router.includes(eff.router)) && (!model || model.includes(String(eff.model)));
  });
  function seriesOf(values: Record<string, number | null>, metrics: string[], w: ReturnType<typeof windowOf>, seed: number) {
    const rand = noise(seed);
    const shape = Array.from({ length: w.count }, (_, i) => {
      const t = w.from + i * w.step;
      if (t > Date.now()) return 0;
      const hour = new Date(t).getUTCHours();
      return (0.55 + 0.45 * Math.sin(((hour - 6) / 24) * Math.PI * 2)) * (0.75 + rand() * 0.5);
    });
    const total = shape.reduce((s, v) => s + v, 0) || 1;
    const out: Record<string, (number | null)[]> = {};
    for (const m of metrics) {
      const v = values[m];
      out[m] = shape.map(s => (v == null ? null : ADDITIVE.has(m) ? Math.round((Number(v) * s / total) * 1000) / 1000 : s === 0 ? null : Math.round(Number(v) * (0.85 + s * 0.2) * 100) / 100));
    }
    return out;
  }
  const dimension = (lane: (typeof LANES)[number], by: string) => {
    const eff = resolve(lane);
    switch (by) {
      case 'service': return { key: lane.service, label: lane.service };
      case 'router': return { key: eff.router, label: eff.routerName };
      case 'model': return { key: String(eff.model ?? '(none)'), label: String(eff.model ?? '(none)') };
      case 'provider': return eff.router.startsWith('openrouter') ? { key: 'Together', label: 'Together' } : { key: '', label: '(not reported)' };
      case 'kind': return lane.lane === 'speech' ? { key: 'stt', label: 'Speech to text' } : lane.needsToolCalling ? { key: 'tool', label: 'Tool session' } : { key: 'chat', label: 'Chat' };
      default: return { key: lane.key, label: `${lane.service} › ${lane.label}` };
    }
  };
  function groupsOf(q: URLSearchParams, by: string, w: ReturnType<typeof windowOf>, scale = 1) {
    const map = new Map<string, { key: string; label: string; parts: Record<string, number | null>[]; lanes: string[] }>();
    for (const lane of filtered(q)) {
      const d = dimension(lane, by);
      const g = map.get(d.key) ?? { key: d.key, label: d.label, parts: [], lanes: [] };
      g.parts.push(laneValues(lane, w.days, scale));
      g.lanes.push(lane.key);
      map.set(d.key, g);
    }
    return [...map.values()].map(g => ({ ...g, values: sum(g.parts) })).sort((a, b) => Number(b.values.calls) - Number(a.values.calls));
  }

  function overview(q: URLSearchParams) {
    const w = windowOf(q);
    const lanes = LANES.map(l => ({ lane: l, v: laneValues(l, w.days), p: laneValues(l, w.days, 0.9) }));
    const total = sum(lanes.map(x => x.v));
    const previous = sum(lanes.map(x => x.p));
    const metrics = ['calls', 'totalTokens', 'promptTokens', 'completionTokens', 'estCostUsd', 'listCostUsd', 'p95TotalMs', 'p50TtftMs', 'errorPct', 'cacheHitPct', 'failed', 'fallbacks', 'meanQueueMs'];
    const flows = lanes.filter(x => Number(x.v.calls) > 0).map(x => {
      const eff = resolve(x.lane);
      return { lane: x.lane.key, laneLabel: `${x.lane.service} › ${x.lane.label}`, router: eff.router, routerLabel: eff.routerName, model: eff.model ?? '(none)', provider: eff.router.startsWith('openrouter') ? 'Together' : '', calls: x.v.calls, tokens: x.v.totalTokens, costUsd: x.v.estCostUsd, listCostUsd: x.v.listCostUsd, failed: x.v.failed };
    });
    return {
      asOf: Date.now(),
      ledger: { running: true, queued: 0, inFlight: 2, enqueued: 51_220, written: 51_220, dropped: 0, writeFailures: 0, dbBytes: 182_000_000, contentBytes: 0, startedUtc: new Date(t0 - 2 * DAY).toISOString(), firstLiveMs: t0 - 2 * DAY },
      routing: routingSummary(),
      data: {
        from: w.from, to: w.to, step: w.step, bucket: w.bucket, count: w.count, total, previous, series: seriesOf(total, metrics, w, 7),
        lanes: lanes.filter(x => Number(x.v.calls) > 0).map((x, i) => ({ key: x.lane.key, label: `${x.lane.service} › ${x.lane.label}`, values: x.v, previous: x.p, spark: seriesOf(x.v, ['calls'], w, 11 + i).calls })),
        routers: [], flows,
      },
      marks: [{ id: 1, ts: Math.max(w.from + w.step, Date.now() - 5 * HOUR), kind: 'routing', title: `Routing revision ${state.revision}`, detail: null }],
    };
  }

  const callRecord = (id: number, lane: (typeof LANES)[number], ago: number, outcome = 'ok') => {
    const eff = resolve(lane);
    const prompt = lane.prompt, completion = lane.completion;
    return {
      id, startedMs: Date.now() - ago - 6_000, endedMs: Date.now() - ago, service: lane.service, lane: lane.lane, laneLabel: lane.label, subject: lane.service === 'Projects' ? 'tiktok-growth' : null,
      operation: null, session: `s-${lane.lane}-1`, kind: lane.needsToolCalling ? 'tool' : 'chat', workClass: lane.workClass, router: eff.router, routerName: eff.routerName,
      provider: eff.router.startsWith('openrouter') ? 'Together' : null, modelRequested: eff.model, model: eff.model, stream: true, outcome,
      httpStatus: outcome === 'ok' ? 200 : 503, finishReason: outcome === 'ok' ? 'stop' : null, attempts: outcome === 'ok' ? 1 : 3,
      promptTokens: prompt, cachedTokens: Math.round(prompt * 0.7), cacheWriteTokens: 0, completionTokens: completion, reasoningTokens: 120, cacheMetrics: true,
      costUsd: null, upstreamCostUsd: null, estCostUsd: isFree(eff.router) ? 0 : 0.0042, listCostUsd: 0.0042, billing: eff.billing,
      queueMs: 640, providerMs: 5_100, totalMs: 5_900, ttftMs: 1_150, requestBytes: prompt * 4, toolCalls: lane.needsToolCalling ? 2 : 0,
      flags: id % 5 === 0 ? ['ContentKept'] : [], fallbackFrom: null, epoch: null, epochTurn: 4, revision: state.revision,
      error: outcome === 'ok' ? null : 'AIRouter answered 503: no capacity', attemptLog: null, textKept: id % 5 === 0,
    };
  };
  const calls = Array.from({ length: 140 }, (_, i) => callRecord(90_000 - i, LANES[i % LANES.length], i * 37_000, i % 23 === 7 ? 'unavailable' : 'ok'));

  const hist = (p50: number, unit: string) => ({
    unit, count: 4_200, mean: p50 * 1.3, max: p50 * 9, p50, p90: p50 * 2.1, p95: p50 * 2.6, p99: p50 * 4.4,
    buckets: Array.from({ length: 18 }, (_, i) => { const lo = p50 / 8 * Math.pow(1.4, i); return { lo: Math.round(lo), hi: Math.round(lo * 1.4), count: Math.round(600 * Math.exp(-Math.pow(i - 7, 2) / 10)) }; }),
  });

  function simulator(q: URLSearchParams) {
    const w = windowOf(q, '30d');
    const by = q.get('groupBy') ?? 'lane';
    const bucketsOf = (v: Record<string, number | null>) => ({
      inputTokens: Number(v.freshTokens), cacheReadTokens: Number(v.cachedTokens), cacheWriteTokens: 0, outputTokens: Number(v.completionTokens), reasoningTokens: Number(v.reasoningTokens),
      totalTokens: Number(v.totalTokens), calls: Number(v.calls), unmeasuredPromptTokens: 0, actualCostUsd: Number(v.estCostUsd), listCostUsd: Number(v.listCostUsd),
    });
    const groups = groupsOf(q, by, w);
    const total = sum(groups.map(g => g.values));
    const days = Math.max(1, Math.ceil(w.days));
    const dayFrom = Math.floor(w.from / DAY) * DAY;
    const daily = sum(groups.map(g => g.values));
    return {
      from: w.from, to: w.to, groupBy: by, totals: bucketsOf(total),
      groups: groups.map(g => ({ key: g.key, label: g.label, buckets: bucketsOf(g.values) })),
      days: Array.from({ length: days }, (_, i) => {
        const share: Record<string, number | null> = {};
        for (const [k, v] of Object.entries(daily)) share[k] = ADDITIVE.has(k) ? Number(v ?? 0) / days : v;
        return { day: dayFrom + i * DAY, buckets: bucketsOf(share) };
      }),
      models: [], note: 'Input is the prompt tokens processed fresh (prompt minus cache reads); cache writes are part of it.',
    };
  }

  const getResponse = (pathWithQuery: string): { status: number; body: unknown } => {
    const url = new URL(pathWithQuery, 'https://klive.dev');
    const q = url.searchParams;
    const path = url.pathname;
    if (path === '/KMProfiles/me') return { status: 200, body: me };
    if (path === '/KMProfiles/permissions/catalog') return { status: 200, body: catalogPayload(true) };
    const need = (key: string) => me.permissions.includes(key) || me.isOwner;
    switch (path) {
      case '/klivellm/overview': return { status: 200, body: overview(q) };
      case '/klivellm/live':
        return { status: 200, body: {
          asOf: Date.now(), ledger: overview(q).ledger, ledgerError: null,
          inFlight: [
            { id: 99_001, service: 'Projects', lane: 'commander', laneLabel: 'Commander', laneKey: 'Projects/commander', subject: 'tiktok-growth', kind: 'tool', router: resolve(LANES[2]).router, routerName: resolve(LANES[2]).routerName, model: resolve(LANES[2]).model, state: 'Streaming', elapsedMs: 4_200, stateMs: 1_000, queueMs: 300, ttftMs: 900, streamedChars: 420, attempts: 1, fallbackFrom: null, sessionId: 's-1', workClass: 'Background' },
            { id: 99_002, service: 'OmniBlox', lane: 'agents', laneKey: 'OmniBlox/agents', subject: 'game-7', kind: 'tool', router: 'airouter', routerName: 'AIRouter', model: 'Qwen3.8', state: 'Queued', elapsedMs: 1_900, stateMs: 1_900, queueMs: 1_900, ttftMs: null, streamedChars: 0, attempts: 1, fallbackFrom: null, sessionId: 's-2', workClass: 'Background' },
          ],
          recent: calls.slice(0, 30),
          routers: routers.map(r => ({ router: r.id, state: r.keySet ? 'up' : 'nodata', recentStates: Array.from({ length: 60 }, (_, i) => (r.keySet ? (i === 41 ? 'degraded' : 'up') : 'nodata')), gauges: {} })),
          airouter: { inFlight: 2, maxParallel: 3, waiting: 1, requestsInWindow: 410, requestCeiling: 1_000, tokensInWindow: 6_200_000, tokenCeiling: 20_000_000, coolOffSeconds: 0, totalAdmitted: 9_100, totalWaitedMs: 1_200_000, totalPenalties: 3, warmCohort: 3, residents: 3, trackedConversations: 11, maxWaitedMs: 4_100, prefixLifetimeSeconds: 540, conversationBudget: 3, cacheHitPct1h: 71.4, cacheRequests1h: 180 },
          circuits: [], routing: routingSummary(),
        } };
      case '/klivellm/routing': return { status: 200, body: routingView() };
      case '/klivellm/routing/history': return { status: 200, body: { revision: state.revision, history: [...state.history].reverse().map(h => ({ revision: h.revision, atUtc: h.atUtc, by: h.by, note: h.note, changes: h.changes })) } };
      case '/klivellm/routers':
        return { status: 200, body: { asOf: Date.now(), defaultRouter: state.document.default?.router ?? 'airouter', routers: routers.map(r => ({
          ...r, maxParallel: null, requestsPerMinute: null, notes: null, baseUrl: (r as any).baseUrl ?? null, configError: r.keySet ? null : 'No key set (HuggingFaceLLMToken).',
          endpoint: r.id === 'local' ? null : `https://${r.id}.example/v1/chat/completions`,
          live: { router: r.id, state: r.keySet ? 'up' : 'nodata', lastProbeUtc: new Date(Date.now() - 40_000).toISOString(), lastProbeOk: r.keySet, lastProbeMs: 180, lastProbeError: r.keySet ? null : 'no key', lastSuccessUtc: new Date().toISOString(), lastFailureUtc: null, lastFailure: null, modelCount: r.id === 'openrouter' ? 320 : 4, modelsFetchedUtc: new Date(Date.now() - HOUR).toISOString(), gauges: r.id === 'openrouter' ? { creditRemainingUsd: 41.2, creditUsedUsd: 158.8 } : r.id === 'airouter' ? { inFlight: 2, queued: 1, slotsBusy: 2, waiting: 1 } : {}, recentStates: Array.from({ length: 60 }, () => (r.keySet ? 'up' : 'nodata')) },
          uptime: { h24: { availabilityPct: r.keySet ? 99.93 : null }, d7: { availabilityPct: r.keySet ? 99.81 : null }, d30: { availabilityPct: r.keySet ? 99.7 : null } },
          latency24h: r.keySet ? { count: 4_000, p50: 2_100, p95: 8_800, p99: 15_100 } : { count: 0, p50: null, p95: null, p99: null },
          traffic24h: { calls: LANES.filter(l => resolve(l).router === r.id).reduce((s, l) => s + l.perDay, 0), tokens: 1_000_000, share: 0.2 },
          circuits: [], keySetting: r.id === 'local' ? null : `${r.id.toUpperCase()}_KEY`,
        })) } };
      case '/klivellm/router': {
        const r = routerById(q.get('id'));
        if (!r) return { status: 404, body: { error: `There is no router '${q.get('id')}'.` } };
        const w = windowOf(q, '7d');
        const groups = groupsOf(new URLSearchParams({ router: r.id }), 'lane', w);
        const total = sum(groups.map(g => g.values));
        return { status: 200, body: {
          router: { id: r.id, name: r.name, kind: r.kind, builtIn: r.builtIn, billing: r.billing, enabled: r.enabled, monthlyFeeUsd: r.monthlyFeeUsd, baseUrl: null, defaultModel: r.defaultModel, notes: null },
          live: { router: r.id, state: 'up', gauges: r.id === 'airouter' ? { slotsBusy: 2, waiting: 1 } : {}, recentStates: [] },
          hours: Array.from({ length: 24 * 30 }, (_, i) => ({ ts: Math.floor(Date.now() / HOUR) * HOUR - (24 * 30 - i) * HOUR, up: i % 97 === 3 ? 50 : 60, degraded: i % 97 === 3 ? 8 : 0, down: i % 97 === 3 ? 2 : 0, noData: 0, probeOk: 60, probeFail: 0 })),
          minutes: Array.from({ length: 360 }, (_, i) => ({ ts: Math.floor(Date.now() / 60_000) * 60_000 - (360 - i) * 60_000, state: i === 200 ? 'degraded' : 'up', probeMs: 160, gauges: r.id === 'airouter' ? { slotsBusy: i % 4, waiting: i % 3 } : {} })),
          series: { from: w.from, to: w.to, step: w.step, bucket: w.bucket, count: w.count, totalSeries: seriesOf(total, ['calls', 'attempts', 'p50ProviderMs', 'p95ProviderMs', 'p99ProviderMs', 'p95TtftMs', 'attemptFailurePct', 'attemptRateLimited', 'tokensPerSec', 'cacheHitPct'], w, 21), total },
          distribution: { provider: hist(2_000, 'ms'), ttft: hist(800, 'ms'), outcomes: [{ outcome: 'ok', calls: 4_100, attempts: 4_180 }, { outcome: 'rate_limited', calls: 4, attempts: 22 }, { outcome: 'unavailable', calls: 9, attempts: 30 }] },
          providers: { groups: [] }, models: { groups: groupsOf(new URLSearchParams({ router: r.id }), 'model', w).map(g => ({ key: g.key, label: g.label, values: g.values, share: { calls: 1 } })) },
          lanes: { groups: groups.map(g => ({ key: g.key, label: g.label, values: g.values, share: { calls: Number(g.values.calls) / Math.max(1, Number(total.calls)) } })) },
          catalogue: [r.defaultModel, 'openai/gpt-5', 'google/gemini-3-flash'].filter(Boolean), prices: state.prices.filter(p => p.router === r.id), circuits: [],
        } };
      }
      case '/klivellm/series': {
        if (!need('klivellm.analytics.read')) return { status: 403, body: { error: 'Not allowed' } };
        const w = windowOf(q);
        const metrics = (q.get('metrics') ?? 'calls').split(',');
        const by = q.get('groupBy');
        const totalValues = sum(filtered(q).map(l => laneValues(l, w.days)));
        const groups = by ? groupsOf(q, by, w).slice(0, Number(q.get('top') ?? 8)).map((g, i) => ({ key: g.key, label: g.label, total: Object.fromEntries(metrics.map(m => [m, g.values[m] ?? null])), series: seriesOf(g.values, metrics, w, 31 + i) })) : [];
        return { status: 200, body: {
          from: w.from, to: w.to, step: w.step, bucket: w.bucket, tier: w.step >= DAY ? '1d' : w.step >= HOUR ? '1h' : '1m', count: w.count, groupBy: by, metrics, filters: {},
          groups, total: Object.fromEntries(metrics.map(m => [m, totalValues[m] ?? null])), totalSeries: seriesOf(totalValues, metrics, w, 5),
          previous: q.get('compare') ? { from: w.from - (w.to - w.from), to: w.from, total: Object.fromEntries(metrics.map(m => [m, totalValues[m] == null ? null : Number(totalValues[m]) * 0.9])), series: seriesOf(totalValues, metrics, w, 6) } : null,
        } };
      }
      case '/klivellm/breakdown': {
        const w = windowOf(q);
        const by = q.get('groupBy') ?? 'lane';
        const scale = q.get('from') && Number(q.get('to')) <= Date.now() - 60_000 ? 0.8 : 1;
        if (by === 'subject') return { status: 200, body: { from: w.from, to: w.to, groupBy: 'subject', groups: [{ key: 'Projects#tiktok-growth', subject: 'tiktok-growth', service: 'Projects', lanes: ['commander', 'subagent'], values: sum([laneValues(LANES[2], w.days, 0.6)]) }] } };
        const groups = groupsOf(q, by, w, scale);
        const total = sum(groups.map(g => g.values));
        return { status: 200, body: { from: w.from, to: w.to, step: w.step, groupBy: by, total, groups: groups.map(g => ({
          key: g.key, label: g.label, values: g.values, share: { calls: Number(g.values.calls) / Math.max(1, Number(total.calls)), tokens: Number(g.values.totalTokens) / Math.max(1, Number(total.totalTokens)), cost: 0 },
          lastBucket: w.to - w.step, routers: [], models: [], spark: null,
        })) } };
      }
      case '/klivellm/distribution':
        return { status: 200, body: { from: 0, to: 0, total: hist(4_000, 'ms'), provider: hist(3_400, 'ms'), ttft: hist(900, 'ms'), queue: hist(300, 'ms'), prompt: hist(12_000, 'tokens'), completion: hist(700, 'tokens'),
          outcomes: [{ outcome: 'ok', calls: 12_400, attempts: 12_900 }, { outcome: 'unavailable', calls: 61, attempts: 180 }, { outcome: 'cancelled', calls: 14, attempts: 14 }] } };
      case '/klivellm/heatmap':
        return { status: 200, body: { metric: q.get('metric') ?? 'calls', tzOffsetMinutes: 0, days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], values: Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, h) => Math.round(200 + 180 * Math.sin(((h - 6) / 24) * Math.PI * 2) + d * 10))) } };
      case '/klivellm/simulator': return { status: 200, body: (mock.lastSimulator = simulator(q)) };
      case '/klivellm/calls': {
        let list = calls.filter(c => (!q.get('lane') || q.get('lane')!.split(',').includes(`${c.service}/${c.lane}`)) && (!q.get('failed') || c.outcome !== 'ok') && (!q.get('service') || q.get('service')!.split(',').includes(c.service)));
        if (q.get('sort') === 'slowest') list = [...list].sort((a, b) => b.totalMs - a.totalMs);
        const limit = Number(q.get('limit') ?? 100);
        const start = q.get('next') ? list.findIndex(c => `${c.endedMs}:${c.id}` === q.get('next')) + 1 : 0;
        const page = list.slice(start, start + limit);
        const last = page[page.length - 1];
        return { status: 200, body: { from: 0, to: 0, sort: q.get('sort') ?? 'newest', capped: false, next: page.length === limit && last ? `${last.endedMs}:${last.id}` : null, calls: page } };
      }
      case '/klivellm/call': {
        const c = calls.find(x => x.id === Number(q.get('id')));
        if (!c) return { status: 404, body: { error: 'That call is not in the ledger.' } };
        return { status: 200, body: { canReadText: need('klivellm.content.read'), call: { ...c, epoch: 3, attemptLog: c.outcome === 'ok'
          ? [{ router: c.router, outcome: 'ok', status: 200, queueMs: 640, providerMs: 5_100, retryAfterMs: null }]
          : [{ router: 'airouter', outcome: 'unavailable', status: 503, queueMs: 640, providerMs: 1_200, retryAfterMs: 2_000 }, { router: 'airouter', outcome: 'unavailable', status: 503, queueMs: 0, providerMs: 1_100, retryAfterMs: 4_000 }, { router: 'airouter', outcome: 'unavailable', status: 503, queueMs: 0, providerMs: 1_000, retryAfterMs: null }] } } };
      }
      case '/klivellm/call/content':
        return { status: 200, body: { id: Number(q.get('id')), keptAt: new Date().toISOString(), request: JSON.stringify({ model: 'Qwen3.8', messages: [{ role: 'system', content: 'You are the Commander.' }, { role: 'user', content: 'Plan the next step.' }] }), response: 'Post the next clip at 18:00.' } };
      case '/klivellm/prices': return { status: 200, body: { entries: state.prices, missing: [{ router: 'openrouter', model: 'google/gemini-3-flash', tokens: 1_200_000, billing: 'PerToken' }] } };
      case '/klivellm/settings': return { status: 200, body: { callRetentionDays: 90, keptTextRetentionDays: 3, routerProbes: true, ledger: overview(q).ledger, ledgerError: null, retention: { minuteRetentionDays: 14, hourRetentionDays: 400 } } };
      default:
        // Routes the console does not use (presence, notices…) answer as the OmniDefence fake does;
        // an unknown /klivellm route is a missing route, which the page must survive.
        mock.unknownPaths.push(pathWithQuery);
        return path.startsWith('/klivellm/') ? { status: 404, body: { error: 'Route not found.' } } : { status: 200, body: { success: true } };
    }
  };

  function changesBetween(a: any, b: any): string[] {
    const out: string[] = [];
    for (const part of ['services', 'lanes']) {
      const keys = new Set([...Object.keys(a?.[part] ?? {}), ...Object.keys(b?.[part] ?? {})]);
      for (const k of keys) {
        const x = a?.[part]?.[k] ?? {}, y = b?.[part]?.[k] ?? {};
        for (const f of new Set([...Object.keys(x), ...Object.keys(y)])) {
          if (f === 'isEmpty' || JSON.stringify(x[f] ?? null) === JSON.stringify(y[f] ?? null)) continue;
          out.push(`${k}: ${f} ${x[f] ?? 'inherited'} → ${y[f] ?? 'inherited'}`);
        }
      }
    }
    if (JSON.stringify(a?.default ?? {}) !== JSON.stringify(b?.default ?? {})) out.push('Default route changed');
    return out;
  }
  function commit(next: any, by: string, note: string | null) {
    const before = JSON.parse(JSON.stringify(state.document));
    state.revision += 1;
    state.document = { ...JSON.parse(JSON.stringify(next)), revision: state.revision, updatedUtc: new Date().toISOString(), updatedBy: by };
    const entry = { revision: state.revision, atUtc: new Date().toISOString(), by, note: note || null, changes: changesBetween(before, state.document), before, after: JSON.parse(JSON.stringify(state.document)) };
    state.history.push(entry);
    return entry;
  }

  await page.routeWebSocket('wss://klive.dev/**', () => {});
  await page.route('https://klive.dev/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const pathWithQuery = `${url.pathname}${url.search}`;
    if (request.method() === 'OPTIONS') { await fulfilJson(route, null, 204); return; }

    if (url.pathname === '/batch' && request.method() === 'POST') {
      const entries: Array<{ path?: string }> = JSON.parse(request.postData() ?? '[]');
      const paths = entries.map(e => e.path).filter((p): p is string => typeof p === 'string');
      mock.batchCalls.push(paths);
      mock.requestedPaths.push(...paths);
      await fulfilJson(route, paths.map(path => {
        const answer = getResponse(path);
        return { path, status: answer.status, ok: answer.status >= 200 && answer.status < 300, contentType: 'application/json', body: answer.body };
      }));
      return;
    }
    mock.requestedPaths.push(pathWithQuery);

    if (request.method() === 'GET') {
      mock.directGets.push(pathWithQuery);
      if (url.pathname === '/KMProfiles/LoginStatus') {
        await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'text/plain' }, body: 'SessionActive' });
        return;
      }
      if (url.pathname === '/klivellm/export') {
        await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'text/csv' }, body: 'id,service\n1,Projects\n' });
        return;
      }
      const answer = getResponse(pathWithQuery);
      await fulfilJson(route, answer.body, answer.status);
      return;
    }

    let body: any = null;
    try { body = JSON.parse(request.postData() ?? 'null'); } catch { body = request.postData(); }
    mock.posts.push({ path: url.pathname, body });
    switch (url.pathname) {
      case '/KMProfiles/Login':
        await fulfilJson(route, { token: 'kms_e2e-klives', sessionId: 'session-e2e', expiresUtc: '2027-01-01T00:00:00Z', me });
        return;
      case '/klivellm/routing/preview': {
        const next = body.document;
        const lanes = LANES.map(l => ({ l, before: resolve(l), after: resolve(l, next) }))
          .filter(x => JSON.stringify([x.before.router, x.before.model, x.before.spending, x.before.blocked]) !== JSON.stringify([x.after.router, x.after.model, x.after.spending, x.after.blocked]))
          .map(x => ({ key: x.l.key, label: `${x.l.service} › ${x.l.label}`, before: x.before, after: x.after, warmSessionsGoingCold: x.before.router !== x.after.router ? (x.l.service === 'Projects' ? 4 : 1) : 0 }));
        await fulfilJson(route, { valid: true, error: null, conflict: body.baseRevision !== state.revision, revision: state.revision, changes: changesBetween(state.document, next), lanes });
        return;
      }
      case '/klivellm/routing/apply':
        if (body.baseRevision !== state.revision) {
          await fulfilJson(route, { error: `The routing changed (revision ${state.revision}) since this edit began.`, detail: { revision: state.revision, conflict: true } }, 409);
          return;
        }
        {
          const entry = commit(body.document, 'Klives', body.note);
          await fulfilJson(route, { ok: true, revision: state.revision, entry: { revision: entry.revision, atUtc: entry.atUtc, by: entry.by, note: entry.note, changes: entry.changes }, routing: routingView() });
        }
        return;
      case '/klivellm/routing/revert': {
        const h = state.history.find(x => x.revision === body.revision);
        const target = body.before ? h?.before : h?.after;
        if (!target) { await fulfilJson(route, { error: 'Not in the history.' }, 404); return; }
        commit(target, 'Klives', body.note ?? `Restored revision ${body.revision}`);
        await fulfilJson(route, { ok: true, revision: state.revision, routing: routingView() });
        return;
      }
      case '/klivellm/routing/override': {
        const next = JSON.parse(JSON.stringify(state.document));
        next.override = body.clear ? null : { router: body.router, model: body.model ?? null, untilUtc: new Date(Date.now() + body.minutes * 60_000).toISOString(), reason: body.reason ?? null, setBy: 'Klives', services: body.services ?? null };
        commit(next, 'Klives', body.clear ? 'Override cleared' : body.reason ?? 'Override set');
        await fulfilJson(route, { ok: true, revision: state.revision, routing: routingView() });
        return;
      }
      case '/klivellm/service/pause': {
        const next = JSON.parse(JSON.stringify(state.document));
        const map = body.lane ? next.lanes : next.services;
        const key = body.lane ? `${body.service}/${body.lane}` : body.service;
        map[key] = { ...(map[key] ?? {}), paused: body.paused ? true : null, pausedReason: body.paused ? body.reason ?? null : null };
        commit(next, 'Klives', `${body.paused ? 'Paused' : 'Resumed'} ${key}`);
        await fulfilJson(route, { ok: true, revision: state.revision, routing: routingView() });
        return;
      }
      case '/klivellm/budgets/save': {
        const next = JSON.parse(JSON.stringify(state.document));
        const map = body.scope.includes('/') ? next.lanes : next.services;
        map[body.scope] = { ...(map[body.scope] ?? {}), budget: body.budget };
        commit(next, 'Klives', `Budget for ${body.scope}`);
        await fulfilJson(route, { ok: true, revision: state.revision, routing: routingView() });
        return;
      }
      case '/klivellm/routers/save': {
        const def = body.router;
        if (!def.builtIn && !def.id) {
          const id = String(def.name).toLowerCase().replace(/[^a-z0-9]+/g, '-');
          routers.push({ id, name: def.name, kind: 'openai', builtIn: false, billing: def.billing, enabled: def.enabled, monthlyFeeUsd: def.monthlyFeeUsd, defaultModel: def.defaultModel, keySet: false, baseUrl: def.baseUrl } as any);
          await fulfilJson(route, { ok: true, id, revision: state.revision });
          return;
        }
        const r = routerById(def.id);
        if (r) Object.assign(r, { enabled: def.enabled, monthlyFeeUsd: def.monthlyFeeUsd ?? r.monthlyFeeUsd });
        await fulfilJson(route, { ok: true, id: def.id, revision: state.revision });
        return;
      }
      case '/klivellm/routers/key': {
        const r = routerById(body.id);
        if (r) r.keySet = !!body.key;
        await fulfilJson(route, { ok: true, id: body.id, keySet: !!body.key });
        return;
      }
      case '/klivellm/routers/test':
        await fulfilJson(route, body.completion
          ? { ok: true, stage: 'completion', ms: 640, status: 200, error: null, reply: { model: routerById(body.id)?.defaultModel, content: 'ok', promptTokens: 9, completionTokens: 1, costUsd: 0.0000021 } }
          : { ok: true, stage: 'reachability', ms: 182, status: 200, error: null, reply: { models: 312 } });
        return;
      case '/klivellm/prices/save':
        for (const e of body.entries ?? []) {
          const i = state.prices.findIndex(p => p.router === e.router && p.model === e.model);
          if (i >= 0) state.prices[i] = { ...state.prices[i], ...e }; else state.prices.push({ ...e, updatedUtc: new Date().toISOString() });
        }
        await fulfilJson(route, { ok: true, entries: state.prices });
        return;
      case '/klivellm/prices/refresh':
        await fulfilJson(route, { ok: true, imported: 312, entries: state.prices });
        return;
      default:
        await fulfilJson(route, { ok: true });
    }
  });

  return mock;
}

export async function openLlm(page: Page, options: LlmMockOptions & { path?: string } = {}): Promise<LlmApiMock> {
  const api = await installLlmApiMock(page, options);
  await page.context().addCookies([{ name: 'password', value: 'e2e-klives', url: llmTestOrigin }]);
  await page.addInitScript(() => { window.localStorage.setItem('vnavCollapsed', '0'); });
  // Windows dev-server runs sometimes stall a navigation (ERR_NO_BUFFER_SPACE): load again.
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(options.path ?? '/klivellm', { waitUntil: 'domcontentloaded', timeout: 20_000 });
      await page.getByTestId('llx-root').waitFor({ state: 'visible', timeout: 20_000 });
      break;
    } catch (error) {
      if (attempt >= 2) throw error;
      await page.waitForTimeout(3_000 * (attempt + 1));
    }
  }
  return api;
}

/** The permission keys KliveLLM defines, for profiles built in a test. */
export const LLM_PERMISSIONS = PERMISSIONS.filter(p => p.serviceKey === 'klivellm').map(p => p.key);
