import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

/**
 * Shared client for the OmniTrader firm API.
 *
 * Three things live here rather than in each page: the global operating context
 * (environment / reporting currency / density, which every page reads), the
 * exception counters the navigation badges show — so a blocked order or an
 * unresolved reconciliation break is visible from whichever page you are on —
 * and every formatter, so a number means exactly the same thing on all ten pages.
 */

const API = '/api/omnitrader/firm';
const ENGINE = '/api/omnitrader';

/**
 * The global environment scope. `All` is a deliberate choice rather than the
 * absence of one — it gets its own unmistakable banding — because defaulting to a
 * single environment would quietly hide live orders from an operator who never
 * chose to filter them out.
 */
export type Environment = 'All' | 'Historical' | 'Paper' | 'Demo' | 'Live';
export type Density = 'standard' | 'compact';

export interface TrendPoint { Ts: string; Value: number }

export interface FirmOverview {
    AsOfUtc: string;
    Portfolio: {
        ReportingCurrency: string;
        TotalValue: number; Cash: number; InventoryValue: number;
        DerivativeEquity: number; DerivativeNotional: number;
        GrossExposure: number; NetExposure: number;
        UnrealizedPnL: number; RealizedPnLToday: number; CostsToday: number;
        Positions: number; Warnings: string[];
        /** False when no live account is connected — every real figure is then genuinely zero. */
        HasRealAccounts: boolean;
    };
    /** Paper and demo money, reported separately and never added to the figures above. */
    Simulated: {
        TotalValue: number; Cash: number; InventoryValue: number;
        UnrealizedPnL: number; GrossExposure: number; Positions: number; RealizedPnLToday: number;
    };
    Health: { TradingPermitted: boolean; Summary: string; Blockers: string[] };
    Controls: {
        SafeModeActive: boolean; SafeModeReason: string | null; SafeModeSinceUtc: string | null;
        KillSwitches: Array<{ Key: string; Reason: string; TriggeredBy: string; TriggeredUtc: string; Automatic: boolean }>;
    };
    Exceptions: {
        AwaitingApproval: number; UnknownOrders: number; MaterialBreaks: number;
        CriticalAlerts: number; UnacknowledgedCritical: number;
    };
    Alerts: AlertRow[];
    Venues: Array<{ Venue: string; Environment: string; IsConfigured: boolean; DisplayName: string; Exposure: string; OrderPathHealthy: boolean }>;
    Strategies: { Total: number; Running: number; Deployments: number };
    Trend: {
        WindowDays: number;
        Points: TrendPoint[];
        Change24h: number | null;
        ChangePercent24h: number | null;
        PeakValue: number | null;
        TroughValue: number | null;
        FirstUtc?: string; LastUtc?: string;
    };
}

export interface AlertRow {
    Id: string; Severity: string; Category: string; Title: string; Message: string;
    RaisedUtc: string; AcknowledgedUtc: string | null; AcknowledgedBy: string | null;
    ResolvedUtc: string | null; OccurrenceCount: number;
    Venue: string | null; Environment: string | null; StrategyId: string | null;
    RecoveryHint: string | null; Open: boolean; NeedsAcknowledgement: boolean;
}

export interface RiskRule {
    Layer: string; Rule: string; Severity: string;
    Detail: string | null; Observed: number | null; Limit: number | null;
}

export interface FirmOrderRow {
    Id: string; ClientReference: string; ProposalId: string; RiskDecisionId: string;
    Venue: string; Environment: string; AccountId: string;
    InstrumentId: string; VenueSymbol: string;
    Side: string; Type: string; Quantity: number;
    LimitPrice: number | null; StopPrice: number | null;
    StopLossPrice: number | null; TakeProfitPrice: number | null;
    State: string; VenueOrderId: string | null;
    FilledQuantity: number; RemainingQuantity: number; AverageFillPrice: number | null;
    Fees: number; FeeCurrency: string; Error: string | null;
    DecisionPrice: number; SlippageBps: number | null; LatencyMs: number | null;
    StrategyId: string | null; DeploymentId: string | null;
    CreatedUtc: string; SubmittedUtc: string | null; AcknowledgedUtc: string | null; CompletedUtc: string | null;
    ApprovedBy: string | null; ApprovedUtc: string | null;
    IsTerminal: boolean; IsLive: boolean; BlocksAutomation: boolean;
}

export interface MarketRow {
    InstrumentId: string; DisplayName: string; AssetClass: string;
    Price: number; ChangePercent24h: number;
    Regime: string; RegimeConfidence: number;
    MomentumScore: number; BreakoutDirection: number; BreakoutQuality: number;
    AlignmentScore: number; AnnualizedVolatility: number;
    AverageQuoteVolume: number; EstimatedSpreadPercent: number;
    TradableOn: string[]; DataAsOfUtc: string | null; Stale: boolean; DataIssue: string | null;
    Spark: number[];
}

/** A page-level filter set, mirrored into the URL so a view is shareable and restorable. */
export interface Paged<T> { Rows: T[]; Filtered: number; Total: number; Offset: number }

// Module-level so every page shares one context and one set of badge counters.
const environment = ref<Environment>('All');
const overview = ref<FirmOverview | null>(null);
const overviewError = ref('');
const loadingOverview = ref(false);
const lastSync = ref<Date | null>(null);
const lastSuccessfulSync = ref<Date | null>(null);
const density = ref<Density>('standard');
let densityRestored = false;

export function useOmniTrader() {
    // Density and environment survive a reload — an operator who set up their view
    // should not have to set it up again on every page load.
    if (!densityRestored && typeof window !== 'undefined') {
        densityRestored = true;
        const savedDensity = window.localStorage.getItem('ot.density') as Density | null;
        if (savedDensity === 'compact' || savedDensity === 'standard') density.value = savedDensity;
        const savedEnv = window.localStorage.getItem('ot.environment') as Environment | null;
        if (savedEnv) environment.value = savedEnv;
        watch(density, value => window.localStorage.setItem('ot.density', value));
        watch(environment, value => window.localStorage.setItem('ot.environment', value));
    }

    function query(params?: Record<string, string | number | boolean | undefined | null>): string {
        if (!params) return '';
        const pairs = Object.entries(params)
            .filter(([, v]) => v !== undefined && v !== null && v !== '')
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
        return pairs.length ? `?${pairs.join('&')}` : '';
    }

    async function get<T>(path: string, params?: Record<string, string | number | undefined | null>): Promise<T> {
        const res = await RequestGETFromKliveAPI(`${API}${path}${query(params)}`, false, false);
        if (!res || !res.ok) throw new Error(describe(res, `GET ${path}`));
        return JSON.parse(await res.text()) as T;
    }

    async function post<T>(path: string, params?: Record<string, string | number | boolean | undefined | null>, body?: unknown): Promise<T> {
        const res = await RequestPOSTFromKliveAPI(`${API}${path}${query(params)}`, body === undefined ? '' : JSON.stringify(body), false, false);
        const text = res ? await res.text() : '';
        if (!res || !res.ok) {
            let message = describe(res, `POST ${path}`);
            try { message = JSON.parse(text).Error ?? message; } catch { /* keep the generic message */ }
            throw new Error(message);
        }
        return (text ? JSON.parse(text) : {}) as T;
    }

    // The strategy engine's own routes predate the firm layer and stay where they are.
    async function engineGet<T>(path: string, params?: Record<string, string | number | undefined | null>): Promise<T> {
        const res = await RequestGETFromKliveAPI(`${ENGINE}${path}${query(params)}`, false, false);
        if (!res || !res.ok) throw new Error(describe(res, `GET ${path}`));
        return JSON.parse(await res.text()) as T;
    }

    async function enginePost<T>(path: string, params?: Record<string, string | number | boolean | undefined | null>, body?: unknown): Promise<T> {
        const res = await RequestPOSTFromKliveAPI(`${ENGINE}${path}${query(params)}`, body === undefined ? '' : JSON.stringify(body), false, false);
        const text = res ? await res.text() : '';
        if (!res || !res.ok) {
            let message = describe(res, `POST ${path}`);
            try { message = JSON.parse(text).Error ?? message; } catch { /* keep the generic message */ }
            throw new Error(message);
        }
        return (text ? JSON.parse(text) : {}) as T;
    }

    function describe(res: Response | null | undefined, what: string): string {
        if (!res) return `${what} could not reach the API`;
        if (res.status === 403 || res.status === 401) return `${what} was refused — this action needs a higher clearance`;
        return `${what} failed (HTTP ${res.status})`;
    }

    async function refreshOverview() {
        loadingOverview.value = true;
        try {
            overview.value = await get<FirmOverview>('/overview');
            overviewError.value = '';
            lastSuccessfulSync.value = new Date();
        } catch (e: any) {
            overviewError.value = e?.message ?? 'OmniTrader is unreachable';
        } finally {
            lastSync.value = new Date();
            loadingOverview.value = false;
        }
    }

    /** Total items demanding a human decision — what the nav badges count. */
    const exceptionCount = computed(() => {
        const e = overview.value?.Exceptions;
        if (!e) return 0;
        return e.AwaitingApproval + e.UnknownOrders + e.MaterialBreaks + e.UnacknowledgedCritical;
    });

    const tradingPermitted = computed(() => overview.value?.Health.TradingPermitted ?? false);
    const currency = computed(() => overview.value?.Portfolio.ReportingCurrency ?? 'GBP');

    return {
        environment, overview, overviewError, loadingOverview, lastSync, lastSuccessfulSync, density,
        exceptionCount, tradingPermitted, currency,
        get, post, engineGet, enginePost, refreshOverview,
    };
}

/**
 * Poll while the tab is visible and stop while it is not — a background tab that
 * keeps hammering the API produces load with nobody reading the result, and comes
 * back showing data from whenever it last ran.
 */
export function usePolling(fn: () => void | Promise<void>, intervalMs: number) {
    let timer: ReturnType<typeof setInterval> | null = null;

    function start() {
        stop();
        timer = setInterval(() => { if (!document.hidden) void fn(); }, intervalMs);
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function onVisibility() { if (!document.hidden) void fn(); }

    onMounted(() => {
        void fn();
        start();
        document.addEventListener('visibilitychange', onVisibility);
    });
    onBeforeUnmount(() => {
        stop();
        document.removeEventListener('visibilitychange', onVisibility);
    });

    return { start, stop, refresh: fn };
}

/**
 * Reactive filter state mirrored into the query string. Filters are part of what
 * you are looking at, so a view can be linked, bookmarked and returned to — and
 * a drill-down that comes back lands on the same filtered set it left.
 */
export function useUrlState<T extends Record<string, string>>(defaults: T) {
    const route = useRoute();
    const router = useRouter();
    const state = reactive({ ...defaults }) as T;

    for (const key of Object.keys(defaults)) {
        const value = route.query[key];
        if (typeof value === 'string') (state as Record<string, string>)[key] = value;
    }

    watch(state, () => {
        const query: Record<string, string> = { ...(route.query as Record<string, string>) };
        for (const [key, value] of Object.entries(state)) {
            if (value === defaults[key] || value === '') delete query[key];
            else query[key] = value as string;
        }
        void router.replace({ query });
    }, { deep: true });

    function reset() { Object.assign(state, defaults); }
    const activeCount = computed(() =>
        Object.entries(state).filter(([key, value]) => value !== defaults[key] && value !== '').length);

    return { state, reset, activeCount };
}

// ── formatting ───────────────────────────────────────────────────────────────
// Shared so a number means the same thing on every page, and so "unknown" never
// renders as zero.

const CURRENCY_SYMBOLS: Record<string, string> = { GBP: '£', USD: '$', EUR: '€' };
export const NO_VALUE = '—';

export function fmtMoney(value: number | null | undefined, currency = 'GBP', decimals = 2): string {
    if (value === null || value === undefined || Number.isNaN(value)) return NO_VALUE;
    const symbol = CURRENCY_SYMBOLS[currency] ?? '';
    const sign = value < 0 ? '-' : '';
    return `${sign}${symbol}${Math.abs(value).toLocaleString(undefined, {
        minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    })}`;
}

export function fmtSigned(value: number | null | undefined, currency = 'GBP'): string {
    if (value === null || value === undefined || Number.isNaN(value)) return NO_VALUE;
    return (value >= 0 ? '+' : '') + fmtMoney(value, currency);
}

export function fmtPct(value: number | null | undefined, decimals = 2): string {
    if (value === null || value === undefined || Number.isNaN(value)) return NO_VALUE;
    return `${value.toFixed(decimals)}%`;
}

export function fmtSignedPct(value: number | null | undefined, decimals = 2): string {
    if (value === null || value === undefined || Number.isNaN(value)) return NO_VALUE;
    return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
}

export function fmtNum(value: number | null | undefined, decimals = 4): string {
    if (value === null || value === undefined || Number.isNaN(value)) return NO_VALUE;
    // Trim trailing zeros so a quantity reads as 0.5 rather than 0.5000.
    return Number(value.toFixed(decimals)).toLocaleString(undefined, { maximumFractionDigits: decimals });
}

export function fmtCompact(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return NO_VALUE;
    const abs = Math.abs(value);
    if (abs >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
    return value.toFixed(0);
}

export function fmtBps(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return NO_VALUE;
    return `${value >= 0 ? '' : ''}${value.toFixed(1)} bps`;
}

export function fmtMs(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return NO_VALUE;
    return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${value.toFixed(0)} ms`;
}

export function fmtDuration(seconds: number | null | undefined): string {
    if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return NO_VALUE;
    if (seconds < 60) return `${seconds.toFixed(0)}s`;
    if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
    if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
    return `${(seconds / 86400).toFixed(1)}d`;
}

export function fmtAgo(iso: string | null | undefined): string {
    if (!iso) return 'never';
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return NO_VALUE;
    const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

export function fmtTime(iso: string | null | undefined): string {
    if (!iso) return NO_VALUE;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? NO_VALUE : `${d.toISOString().replace('T', ' ').slice(0, 19)}Z`;
}

export function fmtDay(iso: string | null | undefined): string {
    if (!iso) return NO_VALUE;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? NO_VALUE : d.toISOString().slice(0, 10);
}

/**
 * A change against a stated baseline. Returns null when there is no baseline to
 * compare against, so the UI can say "no baseline" instead of dividing by zero
 * and presenting the result as growth.
 */
export function changeVs(current: number | null | undefined, previous: number | null | undefined) {
    if (current === null || current === undefined || previous === null || previous === undefined) return null;
    const absolute = current - previous;
    const percent = previous === 0 ? null : (absolute / Math.abs(previous)) * 100;
    return { absolute, percent, direction: absolute > 0 ? 1 : absolute < 0 ? -1 : 0 };
}

/** Direction glyph — colour is never the only carrier of the direction. */
export function directionGlyph(direction: number): string {
    return direction > 0 ? '▲' : direction < 0 ? '▼' : '→';
}

/**
 * Sign → text tone, neutral when the value is unknown. `(x ?? 0) >= 0 ? 'pos' : 'neg'`
 * paints a missing number green, which tells the operator a profit they do not have.
 */
export function signTone(value: number | null | undefined): '' | 'pos' | 'neg' {
    if (value === null || value === undefined || Number.isNaN(value)) return '';
    return value > 0 ? 'pos' : value < 0 ? 'neg' : '';
}

/** The same rule for KPI emphasis. */
export function valueTone(value: number | null | undefined): '' | 'good' | 'bad' {
    if (value === null || value === undefined || Number.isNaN(value)) return '';
    return value >= 0 ? 'good' : 'bad';
}

export function envClass(environment: string | null | undefined): string {
    return (environment ?? 'paper').toLowerCase();
}

/** Order state → chip tone. Unknown is deliberately the loudest state in the UI. */
export function orderStateTone(state: string): string {
    switch (state) {
        case 'Filled': return 'ok';
        case 'Unknown': return 'bad';
        case 'Rejected':
        case 'RiskRejected': return 'bad';
        case 'AwaitingApproval': return 'warn';
        case 'PartiallyFilled':
        case 'Working':
        case 'Acknowledged':
        case 'Submitting': return 'info';
        default: return '';
    }
}

export function severityTone(severity: string): string {
    switch (severity) {
        case 'Critical': return 'bad';
        case 'High': return 'warn';
        case 'Medium': return 'info';
        default: return '';
    }
}

export function severityGlyph(severity: string): string {
    switch (severity) {
        case 'Critical': return '⛔';
        case 'High': return '⚠';
        case 'Medium': return '•';
        default: return 'ℹ';
    }
}

export function ruleTone(severity: string): string {
    return severity === 'Hard' ? 'hard' : severity === 'Soft' ? 'soft' : 'pass';
}

export function ruleGlyph(severity: string): string {
    return severity === 'Hard' ? '✕' : severity === 'Soft' ? '!' : '✓';
}

export function regimeTone(regime: string): string {
    switch (regime) {
        case 'TrendingUp': return 'ok';
        case 'TrendingDown': return 'bad';
        case 'Volatile': return 'warn';
        case 'RangeBound': return 'info';
        default: return '';
    }
}

export function verdictTone(verdict: string): string {
    return verdict === 'Approved' ? 'ok' : verdict === 'RequiresApproval' ? 'warn' : 'bad';
}

export function layerLabel(layer: string): string {
    return ({
        DataIntegrity: 'data integrity', OrderValidity: 'order validity', TradeRisk: 'trade risk',
        StrategyRisk: 'strategy risk', VenueRisk: 'venue risk', PortfolioRisk: 'portfolio risk',
        OperationalRisk: 'operational risk',
    } as Record<string, string>)[layer] ?? layer;
}

/** Utilisation → meter tone. The thresholds are the same everywhere they appear. */
export function utilisationTone(percent: number | null | undefined): string {
    const value = percent ?? 0;
    return value >= 90 ? 'bad' : value >= 70 ? 'warn' : '';
}

/**
 * Categorical chart colours, assigned in fixed order and never cycled: a series
 * keeps its colour when a filter changes which series are on screen. Past eight,
 * fold into "Other" rather than inventing a ninth hue.
 */
export const CHART_SERIES = [
    'var(--ot-cat-1)', 'var(--ot-cat-2)', 'var(--ot-cat-3)', 'var(--ot-cat-4)',
    'var(--ot-cat-5)', 'var(--ot-cat-6)', 'var(--ot-cat-7)', 'var(--ot-cat-8)',
] as const;

export function seriesColour(index: number): string {
    return CHART_SERIES[index % CHART_SERIES.length];
}

/** A dark, readable Swal that matches the OS surfaces. */
export const SWAL_THEME = { background: '#191d16', color: '#e9f1e5' } as const;
