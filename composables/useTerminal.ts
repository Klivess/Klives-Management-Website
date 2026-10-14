import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

/* OmniTrader terminal client: API calls, persisted UI state, formatting and the command line. */

const ENGINE = '/api/omnitrader';

export class TerminalError extends Error {
    constructor(message: string, public status: number) { super(message); }
}

type Params = Record<string, string | number | boolean | undefined | null>;

export function qs(params?: Params): string {
    if (!params) return '';
    const pairs = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    return pairs.length ? `?${pairs.join('&')}` : '';
}

async function read<T>(res: Response | null | undefined, what: string): Promise<T> {
    const text = res ? await res.text() : '';
    if (!res || !res.ok) {
        let message = !res ? `${what}: API unreachable` : res.status === 403 || res.status === 401 ? `${what}: no permission` : `${what}: HTTP ${res.status}`;
        try { const body = JSON.parse(text); message = body.Error ?? body.error ?? message; } catch { /* keep */ }
        throw new TerminalError(message, res?.status ?? 0);
    }
    return (text ? JSON.parse(text) : null) as T;
}

export async function tGet<T>(path: string, params?: Params, signal?: AbortSignal): Promise<T> {
    const res = await RequestGETFromKliveAPI(`${ENGINE}${path}${qs(params)}`, false, false, {}, signal);
    return read<T>(res, path);
}

export async function tPost<T>(path: string, body?: unknown, params?: Params, signal?: AbortSignal): Promise<T> {
    const res = await RequestPOSTFromKliveAPI(`${ENGINE}${path}${qs(params)}`, body === undefined ? '' : JSON.stringify(body), false, true, signal);
    return read<T>(res, path);
}

export interface SymbolMatch { Symbol: string; DisplayName?: string; AssetClass?: string; Exchange?: string; InstrumentId?: string | null; Tradable?: boolean }

/** Instrument master first, then Yahoo's symbol search. */
export async function searchSymbols(q: string, signal?: AbortSignal): Promise<SymbolMatch[]> {
    const res = await RequestGETFromKliveAPI(`/api/omnitrader/firm/search${qs({ q })}`, false, false, {}, signal);
    return (await read<SymbolMatch[]>(res, 'search')) ?? [];
}

/** A request whose previous in-flight call is cancelled when a new one starts. */
export function useLatest() {
    let controller: AbortController | null = null;
    return {
        next(): AbortSignal {
            controller?.abort();
            controller = new AbortController();
            return controller.signal;
        },
        abort() { controller?.abort(); controller = null; },
    };
}

/** Deep copy of API-shaped data. structuredClone throws on Vue reactive proxies; this reads through them. */
export function clone<T>(value: T): T {
    return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

export function isAbort(e: unknown): boolean {
    return e instanceof DOMException && e.name === 'AbortError';
}

// ── persisted UI state ───────────────────────────────────────────────────────

export function usePersisted<T>(key: string, fallback: T): Ref<T> {
    const state = ref(fallback) as Ref<T>;
    if (typeof window !== 'undefined') {
        try {
            const raw = window.localStorage.getItem(`ot.${key}`);
            if (raw !== null) state.value = JSON.parse(raw) as T;
        } catch { /* fall back */ }
        watch(state, value => {
            try { window.localStorage.setItem(`ot.${key}`, JSON.stringify(value)); } catch { /* quota */ }
        }, { deep: true });
    }
    return state;
}

/** Poll while the tab is visible. */
export function useTicker(fn: () => void | Promise<void>, intervalMs: number, immediate = true) {
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = () => { if (!document.hidden) void fn(); };
    const onVisibility = () => { if (!document.hidden) void fn(); };
    onMounted(() => {
        if (immediate) void fn();
        timer = setInterval(tick, intervalMs);
        document.addEventListener('visibilitychange', onVisibility);
    });
    onBeforeUnmount(() => {
        if (timer) clearInterval(timer);
        document.removeEventListener('visibilitychange', onVisibility);
    });
    return { refresh: fn };
}

// ── intervals ────────────────────────────────────────────────────────────────

export const INTERVALS = [
    { value: 'OneMinute', short: '1m' }, { value: 'FiveMinute', short: '5m' }, { value: 'FifteenMinute', short: '15m' },
    { value: 'ThirtyMinute', short: '30m' }, { value: 'OneHour', short: '1h' }, { value: 'FourHour', short: '4h' },
    { value: 'OneDay', short: '1D' }, { value: 'OneWeek', short: '1W' },
] as const;

export function intervalShort(value: string): string {
    return INTERVALS.find(i => i.value === value)?.short ?? value;
}

export function parseInterval(raw: string): string | null {
    const t = raw.trim().toLowerCase();
    const map: Record<string, string> = {
        '1m': 'OneMinute', '1min': 'OneMinute', '5m': 'FiveMinute', '15m': 'FifteenMinute', '30m': 'ThirtyMinute',
        '1h': 'OneHour', 'h1': 'OneHour', '60': 'OneHour', '4h': 'FourHour', 'h4': 'FourHour',
        '1d': 'OneDay', 'd': 'OneDay', 'd1': 'OneDay', 'day': 'OneDay', '1w': 'OneWeek', 'w': 'OneWeek', 'week': 'OneWeek',
    };
    return map[t] ?? null;
}

// ── formatting ───────────────────────────────────────────────────────────────

export const DASH = '—';

const bad = (v: unknown): v is null | undefined => v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v));

/** Price with magnitude-aware decimals: 0.00001234, 1.2345, 123.45, 12,345. */
export function fmtPrice(v: number | null | undefined, decimals?: number): string {
    if (bad(v)) return DASH;
    const a = Math.abs(v);
    const d = decimals ?? (a >= 10000 ? 0 : a >= 100 ? 2 : a >= 1 ? 3 : a >= 0.01 ? 4 : 6);
    return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtN(v: number | null | undefined, d = 2): string {
    if (bad(v)) return DASH;
    return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtInt(v: number | null | undefined): string {
    if (bad(v)) return DASH;
    return Math.round(v).toLocaleString('en-US');
}

/** toFixed without a negative zero ("-0.0"). */
function fixed(v: number, d: number): string {
    const s = v.toFixed(d);
    return Number(s) === 0 ? (0).toFixed(d) : s;
}

export function fmtChg(v: number | null | undefined, d = 2): string {
    if (bad(v)) return DASH;
    const s = fixed(v, d);
    return `${v > 0 && Number(s) !== 0 ? '+' : ''}${s}%`;
}

export function fmtPctPlain(v: number | null | undefined, d = 1): string {
    if (bad(v)) return DASH;
    return `${fixed(v, d)}%`;
}

export function fmtSignedN(v: number | null | undefined, d = 2): string {
    if (bad(v)) return DASH;
    const s = fixed(v, d);
    return `${v > 0 && Number(s) !== 0 ? '+' : ''}${s}`;
}

export function fmtBig(v: number | null | undefined, d = 2): string {
    if (bad(v)) return DASH;
    const a = Math.abs(v);
    const s = v < 0 ? '-' : '';
    if (a >= 1e12) return `${s}${(a / 1e12).toFixed(d)}T`;
    if (a >= 1e9) return `${s}${(a / 1e9).toFixed(d)}B`;
    if (a >= 1e6) return `${s}${(a / 1e6).toFixed(d)}M`;
    if (a >= 1e3) return `${s}${(a / 1e3).toFixed(1)}K`;
    return `${s}${a.toFixed(0)}`;
}

export function fmtDay10(iso: string | number | null | undefined): string {
    if (iso === null || iso === undefined || iso === '') return DASH;
    const d = typeof iso === 'number' ? new Date(iso * 1000) : new Date(iso);
    return Number.isNaN(d.getTime()) ? DASH : d.toISOString().slice(0, 10);
}

export function fmtDateTime(iso: string | number | null | undefined): string {
    if (iso === null || iso === undefined || iso === '') return DASH;
    const d = typeof iso === 'number' ? new Date(iso * 1000) : new Date(iso);
    return Number.isNaN(d.getTime()) ? DASH : d.toISOString().slice(0, 16).replace('T', ' ');
}

export function fmtAge(iso: string | null | undefined): string {
    if (!iso) return DASH;
    const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (!Number.isFinite(s)) return DASH;
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
}

export function tone(v: number | null | undefined): '' | 'pos' | 'neg' {
    if (bad(v) || v === 0) return '';
    return v > 0 ? 'pos' : 'neg';
}

/** Diverging background for a heat cell; `scale` is the magnitude that saturates. */
export function heat(v: number | null | undefined, scale = 5): string | undefined {
    if (bad(v) || v === 0) return undefined;
    const a = Math.min(1, Math.abs(v) / scale);
    const alpha = (0.08 + a * 0.5).toFixed(3);
    return v > 0 ? `rgba(38, 194, 129, ${alpha})` : `rgba(242, 84, 91, ${alpha})`;
}

/** Sequential background (0..1). */
export function heatSeq(fraction: number | null | undefined): string | undefined {
    if (bad(fraction)) return undefined;
    const a = Math.max(0, Math.min(1, fraction));
    return `rgba(74, 168, 255, ${(0.06 + a * 0.55).toFixed(3)})`;
}

/** Terminal tickers for Yahoo index/FX/futures symbols. */
const TICKER_ALIASES: Record<string, string> = {
    '^GSPC': 'SPX', '^NDX': 'NDX', '^DJI': 'INDU', '^RUT': 'RTY', '^GSPTSE': 'TSX', '^BVSP': 'IBOV', '^MXX': 'MEXBOL',
    '^FTSE': 'UKX', '^GDAXI': 'DAX', '^FCHI': 'CAC', '^STOXX50E': 'SX5E', 'FTSEMIB.MI': 'FTSEMIB', '^IBEX': 'IBEX', '^SSMI': 'SMI', '^AEX': 'AEX',
    '^N225': 'NKY', '^HSI': 'HSI', '000001.SS': 'SHCOMP', '^KS11': 'KOSPI', '^BSESN': 'SENSEX', '^NSEI': 'NIFTY', '^AXJO': 'AS51', '^TWII': 'TWSE',
    '^VIX': 'VIX', '^VVIX': 'VVIX', '^VIX9D': 'VIX9D', '^VIX3M': 'VIX3M', '^VIX6M': 'VIX6M', '^MOVE': 'MOVE', '^OVX': 'OVX', '^GVZ': 'GVZ', '^SKEW': 'SKEW',
    '^IRX': 'US3M', '^FVX': 'US5Y', '^TNX': 'US10Y', '^TYX': 'US30Y', 'DX-Y.NYB': 'DXY',
    'GC=F': 'GOLD', 'SI=F': 'SILVER', 'HG=F': 'COPPER', 'PL=F': 'PLAT', 'CL=F': 'WTI', 'BZ=F': 'BRENT', 'NG=F': 'NATGAS', 'RB=F': 'RBOB',
    'ZC=F': 'CORN', 'ZW=F': 'WHEAT', 'ZS=F': 'SOY', 'KC=F': 'COFFEE',
};

export function shortSymbol(symbol: string): string {
    return TICKER_ALIASES[symbol] ?? symbol.replace(/^\^/, '').replace(/=X$|=F$/, '');
}

export const SERIES_COLOURS = ['#4aa8ff', '#f5a524', '#26c281', '#e05cc0', '#a78bfa', '#2ec4c9', '#f2545b', '#c8d05a'];
export const colourAt = (i: number) => SERIES_COLOURS[((i % SERIES_COLOURS.length) + SERIES_COLOURS.length) % SERIES_COLOURS.length];

export const SWAL_TERMINAL = { background: '#13161a', color: '#e2e6eb', confirmButtonColor: '#f5a524' } as const;

export function downloadCsv(name: string, header: string[], rows: (string | number | null | undefined)[][]) {
    const esc = (v: string | number | null | undefined) => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const body = [header, ...rows].map(r => r.map(esc).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([body], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name.endsWith('.csv') ? name : `${name}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── symbols ──────────────────────────────────────────────────────────────────

export function isCrypto(symbol: string): boolean {
    const s = symbol.toUpperCase();
    if (/[\^.=-]/.test(s)) return false;
    return ['USDT', 'USDC', 'FDUSD', 'BUSD', 'USD', 'GBP', 'EUR', 'BTC', 'ETH', 'BNB', 'TRY', 'BRL'].some(q => s.endsWith(q) && s.length > q.length + 1);
}

/** "BTCUSDT" → "BTC" — for coin-level lookups (CoinGecko rows, Deribit currencies). */
export function baseAsset(symbol: string): string {
    const s = symbol.toUpperCase();
    for (const q of ['USDT', 'USDC', 'FDUSD', 'BUSD', 'USD', 'GBP', 'EUR', 'TRY', 'BRL', 'BTC', 'ETH', 'BNB'])
        if (s.endsWith(q) && s.length > q.length) return s.slice(0, -q.length);
    return s.split(/[-=.]/)[0];
}

const recent = ref<string[]>([]);
let recentLoaded = false;
export function useRecentSymbols() {
    if (!recentLoaded && typeof window !== 'undefined') {
        recentLoaded = true;
        try { recent.value = JSON.parse(window.localStorage.getItem('ot.recentSymbols') ?? '[]'); } catch { recent.value = []; }
    }
    function push(symbol: string) {
        const s = symbol.toUpperCase();
        recent.value = [s, ...recent.value.filter(x => x !== s)].slice(0, 16);
        try { window.localStorage.setItem('ot.recentSymbols', JSON.stringify(recent.value)); } catch { /* ignore */ }
    }
    return { recent, push };
}

// ── command line ─────────────────────────────────────────────────────────────

export interface TerminalFunction {
    code: string;
    label: string;
    /** Takes a security: `AAPL DES`. */
    security?: boolean;
    route: (symbol?: string, args?: string[]) => string;
    group: 'Security' | 'Markets' | 'Research' | 'Book' | 'Platform';
}

const sec = (tab: string) => (s?: string, args?: string[]) => {
    const interval = args?.map(parseInterval).find(Boolean);
    return `/omnitrader/instrument?symbol=${encodeURIComponent(s ?? 'BTCUSDT')}&tab=${tab}${interval ? `&interval=${interval}` : ''}`;
};

export const FUNCTIONS: TerminalFunction[] = [
    { code: 'GP', label: 'Chart', security: true, route: sec('GP'), group: 'Security' },
    { code: 'DES', label: 'Description & key stats', security: true, route: sec('DES'), group: 'Security' },
    { code: 'FA', label: 'Financial statements', security: true, route: sec('FA'), group: 'Security' },
    { code: 'HP', label: 'Returns, volatility, drawdowns', security: true, route: sec('HP'), group: 'Security' },
    { code: 'SEAS', label: 'Seasonality', security: true, route: sec('SEAS'), group: 'Security' },
    { code: 'OMON', label: 'Options', security: true, route: sec('OMON'), group: 'Security' },
    { code: 'DER', label: 'Perp funding, OI, positioning', security: true, route: sec('DER'), group: 'Security' },
    { code: 'CF', label: 'SEC filings', security: true, route: sec('CF'), group: 'Security' },
    { code: 'CN', label: 'Security news', security: true, route: sec('CN'), group: 'Security' },
    { code: 'BT', label: 'Backtest on this security', security: true, route: s => `/omnitrader/lab?new=1&symbol=${encodeURIComponent(s ?? '')}`, group: 'Security' },
    { code: 'ALRT', label: 'Alert on this security', security: true, route: s => `/omnitrader/alerts?symbol=${encodeURIComponent(s ?? '')}`, group: 'Security' },
    { code: 'MON', label: 'Market monitor', route: () => '/omnitrader', group: 'Markets' },
    { code: 'WEI', label: 'World equity indices', route: () => '/omnitrader?focus=indices', group: 'Markets' },
    { code: 'CRYPTO', label: 'Crypto market', route: () => '/omnitrader/crypto', group: 'Markets' },
    { code: 'ECO', label: 'Macro, curves, vol term structure', route: () => '/omnitrader/macro', group: 'Markets' },
    { code: 'VOL', label: 'Volatility term structure', route: () => '/omnitrader/macro?tab=vol', group: 'Markets' },
    { code: 'YC', label: 'Yield curve', route: () => '/omnitrader/macro?tab=curve', group: 'Markets' },
    { code: 'SCRN', label: 'Screener', route: () => '/omnitrader/screener', group: 'Markets' },
    { code: 'MOST', label: 'Most active / movers', route: () => '/omnitrader/screener?movers=1', group: 'Markets' },
    { code: 'CORR', label: 'Correlation matrix', route: (_s, args) => `/omnitrader/macro?tab=corr${args?.length ? `&symbols=${encodeURIComponent(args.join(','))}` : ''}`, group: 'Markets' },
    { code: 'N', label: 'News', route: () => '/omnitrader/news', group: 'Markets' },
    { code: 'ALERTS', label: 'Market alerts', route: () => '/omnitrader/alerts', group: 'Markets' },
    { code: 'WL', label: 'Watchlists', route: () => '/omnitrader/markets', group: 'Markets' },
    { code: 'STUDIO', label: 'Strategy studio', route: () => '/omnitrader/studio', group: 'Research' },
    { code: 'LAB', label: 'Backtests & studies', route: () => '/omnitrader/lab', group: 'Research' },
    { code: 'ALPHA', label: 'Alpha Lab (papers → strategies)', route: () => '/omnitrader/research', group: 'Research' },
    { code: 'DEPLOY', label: 'Strategy deployments', route: () => '/omnitrader/strategies', group: 'Research' },
    { code: 'DESK', label: 'Firm command centre', route: () => '/omnitrader/desk', group: 'Book' },
    { code: 'PORT', label: 'Portfolio', route: () => '/omnitrader/portfolio', group: 'Book' },
    { code: 'EMSX', label: 'Execution & orders', route: () => '/omnitrader/execution', group: 'Book' },
    { code: 'RISK', label: 'Risk', route: () => '/omnitrader/risk', group: 'Book' },
    { code: 'PERF', label: 'Performance', route: () => '/omnitrader/performance', group: 'Book' },
    { code: 'JRNL', label: 'Journal', route: () => '/omnitrader/journal', group: 'Book' },
    { code: 'SYS', label: 'Systems & data sources', route: () => '/omnitrader/systems', group: 'Platform' },
];

const FN_ALIASES: Record<string, string> = {
    CHART: 'GP', G: 'GP', GIP: 'GP', INFO: 'DES', FIN: 'FA', FINANCIALS: 'FA', OPT: 'OMON', OPTIONS: 'OMON',
    STATS: 'HP', SEASON: 'SEAS', NEWS: 'CN', FUND: 'DER', FUNDING: 'DER', FILINGS: 'CF', SEC: 'CF',
    MACRO: 'ECO', CURVE: 'YC', SCREEN: 'SCRN', SCREENER: 'SCRN', MOVERS: 'MOST', HOME: 'MON',
    BACKTEST: 'BT', ALERT: 'ALRT', RESEARCH: 'ALPHA', PAPERS: 'ALPHA', STRATEGIES: 'DEPLOY', ORDERS: 'EMSX',
    EXEC: 'EMSX', PORTFOLIO: 'PORT', HELP: 'MON', SYSTEMS: 'SYS', WATCHLIST: 'WL',
};

export function findFunction(code: string): TerminalFunction | undefined {
    const c = code.toUpperCase();
    return FUNCTIONS.find(f => f.code === c) ?? FUNCTIONS.find(f => f.code === FN_ALIASES[c]);
}

export type ParsedCommand =
    | { kind: 'route'; to: string; label: string }
    | { kind: 'none' };

/**
 * `AAPL` → chart · `AAPL DES` · `BTCUSDT 4h` · `SCRN` · `CORR SPY QQQ TLT` · `AAPL GO`.
 * A function code wins over a ticker of the same name only when it stands alone.
 */
export function parseCommand(input: string): ParsedCommand {
    const tokens = input.trim().replace(/<GO>/gi, '').split(/\s+/).filter(Boolean);
    if (!tokens.length) return { kind: 'none' };
    const first = tokens[0].toUpperCase();
    const fn = findFunction(first);
    if (fn && (!fn.security || tokens.length === 1)) {
        if (fn.security) return { kind: 'route', to: fn.route(undefined, tokens.slice(1)), label: fn.label };
        return { kind: 'route', to: fn.route(undefined, tokens.slice(1).map(t => t.toUpperCase())), label: fn.label };
    }
    const symbol = first;
    const rest = tokens.slice(1);
    const fnToken = rest.find(t => findFunction(t)?.security);
    const f = fnToken ? findFunction(fnToken)! : findFunction('GP')!;
    const args = rest.filter(t => t !== fnToken && t.toUpperCase() !== 'GO');
    return { kind: 'route', to: f.route(symbol, args), label: `${symbol} ${f.code}` };
}

// ── shared payload types ─────────────────────────────────────────────────────

export interface QuoteRow {
    Symbol: string; Name?: string | null; QuoteType?: string | null; Exchange?: string | null; Currency?: string | null;
    MarketState?: string | null; Price?: number | null; Change?: number | null; ChangePct?: number | null;
    PreviousClose?: number | null; Open?: number | null; DayHigh?: number | null; DayLow?: number | null;
    Volume?: number | null; AvgVolume3M?: number | null; MarketCap?: number | null; TrailingPE?: number | null;
    ForwardPE?: number | null; Eps?: number | null; DividendYieldPct?: number | null; High52w?: number | null;
    Low52w?: number | null; Change52wPct?: number | null; Avg50d?: number | null; Avg200d?: number | null;
    PriceToBook?: number | null; PreMarketPrice?: number | null; PreMarketChangePct?: number | null;
    PostMarketPrice?: number | null; PostMarketChangePct?: number | null; AsOfUtc?: string | null; Source?: string;
}

export interface IndicatorInputSpec { Name: string; Label: string; Kind: string; Default: unknown; Min?: number | null; Max?: number | null; Step?: number | null; Options?: string[] | null }
export interface IndicatorOutputSpec { Name: string; Label: string; Style: string; Color?: number | null; DisplayOffset?: number }
export interface IndicatorSpec {
    Id: string; Name: string; Short: string; Category: string; Description: string; Overlay: boolean;
    Inputs: IndicatorInputSpec[]; Outputs: IndicatorOutputSpec[]; Levels?: number[] | null; RangeMin?: number | null; RangeMax?: number | null;
}

export interface IndicatorResult { Id: string; Key?: string | null; Name: string; Error?: string | null; Inputs: Record<string, unknown>; Values: Record<string, (number | null)[]> }

export interface ChartPayload {
    Symbol: string; Interval: string; Source?: string | null; AssetClass: string; Streaming: boolean; Forming: boolean; BarsPerYear: number;
    Time: number[]; Open: number[]; High: number[]; Low: number[]; Close: number[]; Volume: number[];
    Indicators: IndicatorResult[];
    Formulas: { Key: string; Formula: string; IsBoolean?: boolean; Values?: (number | null)[]; Errors?: { Message: string; Position: number }[] }[];
    Compare: { Symbol: string; Close?: (number | null)[]; Error?: string }[];
}

let indicatorCatalog: Promise<IndicatorSpec[]> | null = null;
export function loadIndicatorCatalog(): Promise<IndicatorSpec[]> {
    indicatorCatalog ??= tGet<IndicatorSpec[]>('/terminal/indicators').catch(e => { indicatorCatalog = null; throw e; });
    return indicatorCatalog;
}

let formulaReference: Promise<any> | null = null;
export function loadFormulaReference(): Promise<any> {
    formulaReference ??= tGet<any>('/terminal/formula/reference').catch(e => { formulaReference = null; throw e; });
    return formulaReference;
}
