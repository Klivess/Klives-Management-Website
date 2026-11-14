/**
 * Pure rules for the OmniTrader Deploy console (pages/omnitrader/strategies.vue): the shapes the
 * engine returns, formatting, the page verdict, catalog filtering and the "how is it doing against its
 * backtest" arithmetic. Nothing here talks to the API; useDeployConsole does.
 *
 * Every field the server added for this page is optional, because the site and the server deploy
 * separately: an older server answers /deployments without Health or Origin and the page still works.
 */

// ───────────────────────────── shapes ─────────────────────────────

export type Tone = 'ok' | 'info' | 'warn' | 'crit' | 'neutral';

export interface DeployHealth {
  State: string;
  Tone: Tone;
  Title: string;
  Detail?: string | null;
  LastBarUtc?: string | null;
  LastBarSeenUtc?: string | null;
  BarsThisRun?: number;
  BarsTotal?: number;
  Orders?: number;
  Filled?: number;
  Rejected?: number;
  LastOrderUtc?: string | null;
  StallAfterMinutes?: number;
  Errors?: number;
  LastError?: string | null;
  InMemory?: boolean;
}

export interface DeployEvaluatedHeadline {
  Interval?: string;
  ReturnPct?: number | null;
  CagrPct?: number | null;
  Sharpe?: number | null;
  MaxDrawdownPct?: number | null;
  Trades?: number | null;
  Bars?: number | null;
}

export interface DeployOriginSummary {
  Source?: string;
  CandidateId?: string | null;
  CandidateStatus?: string | null;
  Score?: number | null;
  StrategyId?: string | null;
  StrategyVersion?: number | null;
  BarsPerTrade?: number | null;
  Evaluated?: DeployEvaluatedHeadline | null;
}

export interface Deployment {
  Id: string;
  StrategyClass: string;
  StrategyName?: string;
  Label?: string | null;
  Symbol: string;
  Interval: string;
  Mode: 'Paper' | 'Live' | string;
  Status: 'Running' | 'Paused' | 'Stopped' | 'Errored' | string;
  Armed: boolean;
  EquityInitial: number;
  EquityCurrent: number;
  PnLPercent: number;
  CreatedUtc: string;
  ArmedLiveUtc?: string | null;
  PausedUtc?: string | null;
  Error?: string | null;
  Shape?: string | null;
  Origin?: DeployOriginSummary | null;
  Health?: DeployHealth | null;
}

export interface CatalogRow {
  Key: string;
  StrategyClass: string;
  StrategyId?: string | null;
  Name: string;
  Source: 'alpha' | 'studio' | 'builtin' | string;
  Kind: string;
  Shape: 'single' | 'basket' | 'universe' | string;
  CandidateId?: string | null;
  Status?: string | null;
  Score?: number | null;
  Interval: string;
  Symbol: string;
  Symbols: string[];
  BasketSize: number;
  AssetClass: string;
  Sharpe?: number | null;
  ReturnPct?: number | null;
  MaxDrawdownPct?: number | null;
  Trades?: number | null;
  OosSharpe?: number | null;
  StressedReturnPct?: number | null;
  Profitable?: number | null;
  Tested?: number | null;
  Synthesis?: boolean;
  Paper?: string | null;
  Hypothesis?: string | null;
  Version?: number | null;
  CurrentVersion?: number | null;
  UpdatedUtc?: string | null;
  Recommended: boolean;
  Rank: number;
  Running: number;
  Deployed: number;
}

export interface Catalog {
  Rows: CatalogRow[];
  Counts: { Total: number; Recommended: number; Alpha: number; Studio: number; Builtin: number; Deployed: number };
  BuiltUtc: string;
  BuildMs: number;
}

export interface PlanCheck { Id: string; Level: 'pass' | 'info' | 'warn' | 'block'; Title: string; Detail?: string | null }
export interface PlanSymbolChoice { Symbol: string; Primary: boolean; Tested: boolean; Sharpe?: number | null; ReturnPct?: number | null; MaxDrawdownPct?: number | null; Trades?: number | null }
export interface ParamSpec { Name: string; Label: string; Type: string; Default: unknown; Min?: number | null; Max?: number | null; Step?: number | null; Group: string; Help?: string | null; Options?: string[] | null }

export interface PlanEvidence {
  Interval: string;
  Symbols: string[];
  Bars?: number | null;
  ReturnPct?: number | null;
  CagrPct?: number | null;
  Sharpe?: number | null;
  MaxDrawdownPct?: number | null;
  Trades?: number | null;
  WinRatePct?: number | null;
  ExposurePct?: number | null;
  OosSharpe?: number | null;
  StressedReturnPct?: number | null;
  DeflatedSharpe?: number | null;
  CostPreset?: string | null;
  FeeFraction?: number | null;
  SlippageFraction?: number | null;
  EvaluatedUtc?: string | null;
}

export interface PlanRequestBody {
  StrategyClass: string;
  Symbol: string;
  Interval: string;
  Mode: string;
  InitialQuoteBalance: number;
  FeeFraction: number;
  SlippageFraction: number;
  Leverage: number;
  MaxPositionQuoteUsd?: number | null;
  MaxDailyLossUsd?: number | null;
  MaxOrdersPerHour?: number | null;
  AllowedSymbols?: string[] | null;
  Parameters: Record<string, unknown>;
  Execution?: string | null;
  HistoryBars?: number | null;
  Origin: Record<string, unknown>;
}

export interface DeployPlan {
  StrategyClass: string;
  StrategyName: string;
  Description?: string | null;
  Source: string;
  Kind: string;
  Shape: string;
  Basket: string[];
  StrategyVersion?: number | null;
  CurrentVersion?: number | null;
  Candidate?: { Id: string; Status: string; Score?: number | null; Hypothesis?: string; PaperTitle?: string | null; Synthesis: boolean; Papers: number; StrategyId: string; StrategyVersion: number; Findings: string[] } | null;
  Evaluated?: PlanEvidence | null;
  Symbol: string;
  AssetClass: string;
  Feed: string;
  SymbolChoices: PlanSymbolChoice[];
  Interval: string;
  EvaluatedInterval?: string | null;
  IntervalChoices: string[];
  Mode: string;
  Modes: { Mode: string; Allowed: boolean; Reason?: string | null }[];
  Capital: number;
  CapitalChoices: number[];
  Costs: { Preset: string; Name: string; Fee: number; Slippage: number; Note?: string | null; Why?: string | null; EvaluatedPreset?: string | null; EvaluatedFee?: number | null; EvaluatedSlippage?: number | null };
  Execution: string;
  Risk?: { MaxPositionQuoteUsd: number; MaxDailyLossUsd: number; MaxOrdersPerHour: number; AllowedSymbols: string[] } | null;
  ParameterSpecs: ParamSpec[];
  Expect: { BarsPerTrade?: number | null; TradesPerMonth?: number | null; WarmupBars?: number | null; HistoryBars: number; ExposurePct?: number | null; MaxDrawdownPct?: number | null; CagrPct?: number | null; Lines: string[] };
  Checks: PlanCheck[];
  Verdict: 'ready' | 'caution' | 'blocked' | string;
  VerdictTitle: string;
  Label: string;
  Request: PlanRequestBody;
}

export interface PlanOverrides { symbol?: string; interval?: string; mode?: string; capital?: number }

export interface TradeRow {
  Id: string; Symbol: string; Side: string; Type: string; Qty: number; FilledQty: number; Price?: number | null; Fee: number;
  FilledUtc?: string | null; Status: string; PlacedUtc: string; Error?: string | null;
}

export interface DeploymentDetail {
  Deployment: { Id: string; StrategyClass: string; Config: any; Mode: string; Status: string; EquityInitial: number; EquityCurrent: number; CreatedUtc: string; ArmedLiveUtc?: string | null; PausedUtc?: string | null; Error?: string | null };
  StrategyName?: string;
  Interval?: string;
  Execution?: string;
  Armed?: boolean;
  Health?: DeployHealth | null;
  Book?: { Quote: number; UpdatedUtc: string; Fees: number; Holdings: { Symbol: string; Qty: number; AveragePrice: number; OpenedUtc: string }[] } | null;
  Trades?: TradeRow[];
  Orders?: any[];
  Fills?: any[];
}

export interface EquityPoint { Ts: string; Equity: number; MarkPrice?: number; QuoteBalance?: number; BaseBalance?: number }

// ───────────────────────────── formatting ─────────────────────────────

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function numText(value: unknown, digits = 2): string {
  if (!isNumber(value)) return '—';
  return value.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function moneyText(value: unknown, digits?: number): string {
  if (!isNumber(value)) return '—';
  const d = digits ?? (Math.abs(value) >= 1000 ? 0 : 2);
  return value.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function compactMoney(value: unknown): string {
  if (!isNumber(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}m`;
  if (abs >= 10_000) return `${Math.round(value / 1000)}k`;
  if (abs >= 1_000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return moneyText(value, 0);
}

export function pctText(value: unknown, digits = 1): string {
  return isNumber(value) ? `${value.toFixed(digits)} %` : '—';
}

export function signedPctText(value: unknown, digits = 1): string {
  if (!isNumber(value)) return '—';
  const v = Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)} %`;
}

export function signTone(value: unknown): Tone {
  if (!isNumber(value) || Math.abs(value) < 0.005) return 'neutral';
  return value > 0 ? 'ok' : 'crit';
}

export function toMillis(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

export function spanText(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'now';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 60) return `${d} d`;
  return `${Math.round(d / 30.4)} mo`;
}

export function agoText(value: unknown, now: number): string {
  const t = toMillis(value);
  if (t == null) return '—';
  const span = spanText(now - t);
  return span === 'now' ? 'just now' : `${span} ago`;
}

export function dateText(value: unknown): string {
  const t = toMillis(value);
  if (t == null) return '—';
  return new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
}

const INTERVALS: Record<string, string> = {
  OneMinute: '1m', FiveMinute: '5m', FifteenMinute: '15m', ThirtyMinute: '30m', OneHour: '1h', TwoHour: '2h',
  FourHour: '4h', TwelveHour: '12h', OneDay: '1d', OneWeek: '1w', OneMonth: '1M',
};
const INTERVAL_MINUTES: Record<string, number> = {
  OneMinute: 1, FiveMinute: 5, FifteenMinute: 15, ThirtyMinute: 30, OneHour: 60, TwoHour: 120,
  FourHour: 240, TwelveHour: 720, OneDay: 1440, OneWeek: 10080, OneMonth: 43200,
};

/** "OneDay" → "1d". Also takes minutes (1440), which is how a stored deployment config serialises it. */
export function intervalLabel(interval: string | number | null | undefined): string {
  if (interval == null || interval === '') return '—';
  if (typeof interval === 'number') {
    const key = Object.keys(INTERVAL_MINUTES).find(k => INTERVAL_MINUTES[k] === interval);
    return key ? INTERVALS[key] : `${interval}m`;
  }
  return INTERVALS[interval] ?? interval;
}

export function intervalMinutes(interval: string | null | undefined): number {
  return (interval && INTERVAL_MINUTES[interval]) || 60;
}

export function assetLabel(asset: string | null | undefined): string {
  return ({ crypto: 'Crypto', equity: 'Shares & ETFs', fx: 'FX', futures: 'Futures', index: 'Index', mixed: 'Mixed' } as Record<string, string>)[asset ?? ''] ?? (asset || '—');
}

export function statusTone(status: string | null | undefined): Tone {
  return ({ Promoted: 'ok', Promising: 'ok', Weak: 'warn', Rejected: 'crit', Failed: 'crit', Proposed: 'neutral', Evaluating: 'info' } as Record<string, Tone>)[status ?? ''] ?? 'neutral';
}

export function shapeLabel(shape: string | null | undefined, basketSize = 0): string {
  if (shape === 'basket') return basketSize ? `Basket of ${basketSize}` : 'Basket';
  if (shape === 'universe') return 'Coin universe';
  return 'One market';
}

export function sourceLabel(source: string | null | undefined): string {
  return ({ alpha: 'Alpha Lab', studio: 'Studio', builtin: 'Built-in', manual: 'Manual' } as Record<string, string>)[source ?? ''] ?? '—';
}

// ───────────────────────────── deployments ─────────────────────────────

export function isActive(d: Deployment): boolean {
  return d.Status === 'Running' || d.Status === 'Paused';
}

/** Health for a deployment, synthesised from the row alone when the server predates Health. */
export function healthOf(d: Deployment): DeployHealth {
  if (d.Health) return d.Health;
  if (d.Status === 'Stopped') return { State: 'stopped', Tone: 'neutral', Title: 'Stopped' };
  if (d.Status === 'Errored') return { State: 'errored', Tone: 'crit', Title: 'Stopped by an error', Detail: d.Error };
  if (d.Status === 'Paused') return { State: d.Mode === 'Live' ? 'disarmed' : 'paused', Tone: d.Mode === 'Live' ? 'info' : 'neutral', Title: d.Mode === 'Live' ? (d.Armed ? 'Armed' : 'Disarmed') : 'Paused' };
  return { State: 'ok', Tone: 'ok', Title: 'Running' };
}

/** What a deployment's backtest would have made by now, compounding its CAGR over the time it has run. */
export function expectedReturnPct(d: Pick<Deployment, 'CreatedUtc' | 'Origin'>, now: number): number | null {
  const cagr = d.Origin?.Evaluated?.CagrPct;
  const start = toMillis(d.CreatedUtc);
  if (!isNumber(cagr) || start == null) return null;
  const years = Math.max(0, now - start) / (365.25 * 86_400_000);
  return (Math.pow(1 + cagr / 100, years) - 1) * 100;
}

/** Live return minus the backtest's pace, in percentage points; null without evidence. */
export function vsExpected(d: Deployment, now: number): number | null {
  const e = expectedReturnPct(d, now);
  return e == null || !isNumber(d.PnLPercent) ? null : d.PnLPercent - e;
}

export interface PageVerdict { tone: Tone; title: string; detail: string; focusId?: string }

/** One line for the top of the page: the worst thing first, else how many run and how they are doing. */
export function computeVerdict(deployments: Deployment[], catalog: Catalog | null): PageVerdict {
  const active = deployments.filter(isActive);
  const rank: Record<Tone, number> = { crit: 0, warn: 1, info: 2, ok: 3, neutral: 4 };
  const issues = active
    .map(d => ({ d, h: healthOf(d) }))
    .filter(x => x.h.Tone === 'crit' || x.h.Tone === 'warn')
    .sort((a, b) => rank[a.h.Tone] - rank[b.h.Tone]);
  if (issues.length) {
    const first = issues[0];
    const name = first.d.StrategyName ?? first.d.StrategyClass;
    return {
      tone: first.h.Tone,
      title: issues.length === 1 ? `${name}: ${first.h.Title.toLowerCase()}` : `${issues.length} deployments need a look`,
      detail: issues.length === 1 ? (first.h.Detail ?? '') : issues.map(x => `${x.d.StrategyName ?? x.d.StrategyClass}: ${x.h.Title}`).join(' · '),
      focusId: first.d.Id,
    };
  }
  const armed = active.filter(d => d.Mode === 'Live' && d.Armed).length;
  if (!active.length) {
    const ready = catalog?.Counts.Recommended ?? 0;
    return {
      tone: 'neutral',
      title: 'Nothing is deployed',
      detail: ready ? `${ready} Alpha Lab strateg${ready === 1 ? 'y is' : 'ies are'} rated Promising or better and ready to try on paper.` : 'Pick a strategy on the right to start one on paper.',
    };
  }
  const paper = active.filter(d => d.Mode !== 'Live').length;
  return {
    tone: armed ? 'warn' : 'ok',
    title: `${active.length} deployment${active.length === 1 ? '' : 's'} running normally`,
    detail: [paper ? `${paper} on paper` : '', armed ? `${armed} armed for live trading` : active.length - paper ? `${active.length - paper} live, disarmed` : ''].filter(Boolean).join(' · '),
  };
}

// ───────────────────────────── catalog ─────────────────────────────

export type CatalogView = 'recommended' | 'alpha' | 'all';
export type AssetFilter = 'all' | 'crypto' | 'equity' | 'other';
export type CatalogSort = 'rank' | 'sharpe' | 'return' | 'newest';

export interface CatalogFilter { view: CatalogView; asset: AssetFilter; sort: CatalogSort; query: string }

export function filterCatalog(rows: CatalogRow[], f: CatalogFilter): CatalogRow[] {
  const words = f.query.toLowerCase().split(/\s+/).filter(Boolean);
  const out = rows.filter(r => {
    if (f.view === 'recommended' && !r.Recommended) return false;
    if (f.view === 'alpha' && r.Source !== 'alpha') return false;
    if (f.asset === 'crypto' && r.AssetClass !== 'crypto') return false;
    if (f.asset === 'equity' && r.AssetClass !== 'equity') return false;
    if (f.asset === 'other' && (r.AssetClass === 'crypto' || r.AssetClass === 'equity')) return false;
    if (!words.length) return true;
    const hay = `${r.Name} ${r.Symbol} ${r.Symbols.join(' ')} ${r.Status ?? ''} ${r.Paper ?? ''} ${r.CandidateId ?? ''} ${intervalLabel(r.Interval)} ${r.Shape}`.toLowerCase();
    return words.every(w => hay.includes(w));
  });
  const by = (get: (r: CatalogRow) => number | null | undefined) => (a: CatalogRow, b: CatalogRow) => (get(b) ?? -1e9) - (get(a) ?? -1e9);
  if (f.sort === 'sharpe') out.sort(by(r => r.Sharpe));
  else if (f.sort === 'return') out.sort(by(r => r.ReturnPct));
  else if (f.sort === 'newest') out.sort(by(r => toMillis(r.UpdatedUtc)));
  return out;
}

// ───────────────────────────── commands ─────────────────────────────

export interface DeployCommand {
  id: string;
  group: string;
  title: string;
  hint?: string;
  keywords?: string;
  icon: string;
  danger?: boolean;
  run: () => void | Promise<void>;
}

export function scoreDeployCommand(query: string, c: Pick<DeployCommand, 'title' | 'keywords'>): number {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  const title = c.title.toLowerCase();
  const keys = (c.keywords ?? '').toLowerCase();
  let score = 0;
  for (const w of words) {
    const t = title.startsWith(w) ? 30 : title.includes(` ${w}`) ? 20 : title.includes(w) ? 10 : 0;
    const k = keys.includes(w) ? 6 : 0;
    if (!t && !k) return 0;
    score += Math.max(t, k);
  }
  return score - title.length * 0.05;
}

// ───────────────────────────── charts ─────────────────────────────

/** Equity and, when the backtest's CAGR is known, the path it implied from the same start. */
export function equityWithPace(points: EquityPoint[], initial: number, cagrPct: number | null | undefined): { live: [number, number][]; pace: [number, number][] } {
  const live = points.map(p => [toMillis(p.Ts) ?? 0, p.Equity] as [number, number]).filter(p => p[0] > 0);
  if (!live.length || !isNumber(cagrPct)) return { live, pace: [] };
  const t0 = live[0][0];
  const t1 = live[live.length - 1][0];
  const steps = 24;
  const pace: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = t0 + ((t1 - t0) * i) / steps;
    const years = (t - t0) / (365.25 * 86_400_000);
    pace.push([t, initial * Math.pow(1 + cagrPct / 100, years)]);
  }
  return { live, pace };
}
