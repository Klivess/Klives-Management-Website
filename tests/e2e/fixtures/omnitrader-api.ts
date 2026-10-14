import { type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { catalogPayload, mePayload } from './permissions';

/**
 * Mocked Klive API for the OmniTrader terminal pages, replaying fixtures written by the engine
 * (Omnipotent.Tests OmniTraderFixtureExport: OMNITRADER_FIXTURES=<this folder>/omnitrader).
 */

export const apiOrigin = 'https://klive.dev';
export const FIXTURES = fileURLToPath(new URL('./omnitrader/', import.meta.url));
export const load = (name: string) => JSON.parse(readFileSync(`${FIXTURES}${name}.json`, 'utf8'));
export const maybe = (name: string) => (existsSync(`${FIXTURES}${name}.json`) ? load(name) : null);
export const meta = load('meta');
export const NOW = new Date(meta.GeneratedUtc).getTime() + 60_000;
export const SHOTS = 'test-results/omnitrader';
export const BOOT = { timeout: 60_000 };

export const chart = load('chart-BTCUSDT');
export const studioList = load('studio-list');
export const labBacktests = load('lab-backtests');
export const labStudies = load('lab-studies');
export const alphaPapers = load('alpha-papers');
export const alphaCandidates = load('alpha-candidates');

function overview() {
    return {
        AsOfUtc: meta.GeneratedUtc,
        Portfolio: { ReportingCurrency: 'GBP', TotalValue: 25_000, Cash: 25_000, InventoryValue: 0, DerivativeEquity: 0, DerivativeNotional: 0, GrossExposure: 0, NetExposure: 0, UnrealizedPnL: 0, RealizedPnLToday: 0, CostsToday: 0, Positions: 0, Warnings: [], HasRealAccounts: true },
        Simulated: { TotalValue: 0, Cash: 0, InventoryValue: 0, UnrealizedPnL: 0, GrossExposure: 0, Positions: 0, RealizedPnLToday: 0 },
        Health: { TradingPermitted: true, Summary: 'ok', Blockers: [] },
        Controls: { SafeModeActive: false, SafeModeReason: null, SafeModeSinceUtc: null, KillSwitches: [] },
        Exceptions: { AwaitingApproval: 0, UnknownOrders: 0, MaterialBreaks: 0, CriticalAlerts: 0, UnacknowledgedCritical: 0 },
        Alerts: [], Venues: [], Strategies: { Total: 3, Running: 0, Deployments: 0 },
        Trend: { WindowDays: 30, Points: [], Change24h: null, ChangePercent24h: null, PeakValue: null, TroughValue: null },
    };
}

/** The chart route answers per requested indicator; the fixture holds one computed result per catalog id. */
function chartFor(body: any) {
    const byId = new Map<string, any>();
    for (const r of chart.Indicators) if (!byId.has(r.Id)) byId.set(r.Id, r);
    const indicators = (body?.Indicators ?? []).map((req: any) => {
        const r = chart.Indicators.find((x: any) => x.Key === req.Key) ?? byId.get(req.Id);
        return r ? { ...r, Key: req.Key } : { Id: req.Id, Key: req.Key, Name: req.Id, Error: `no fixture for ${req.Id}`, Inputs: {}, Values: {} };
    });
    const formulas = (body?.Formulas ?? []).map((f: any, i: number) => {
        const src = /cross|>|</.test(f.Formula ?? '') ? chart.Formulas[0] : chart.Formulas[1];
        return { ...src, Key: f.Key, Formula: f.Formula ?? src.Formula, Lookback: src.Lookback ?? i };
    });
    const compare = chart.Compare.filter((c: any) => (body?.Compare ?? []).includes(c.Symbol));
    return { ...chart, Symbol: body?.Symbol ?? chart.Symbol, Interval: body?.Interval ?? chart.Interval, Indicators: indicators, Formulas: formulas, Compare: compare };
}

function compareFor(ids: string[]) {
    return ids.map(id => {
        const job = maybe(`backtest-${id}`);
        if (!job?.Result) return { Id: id, Error: 'not found' };
        const r = job.Result, a = r.Analysis ?? {};
        const start = r.EquityCurve?.[0]?.Equity ?? r.InitialEquity;
        return {
            Id: id, StrategyClass: job.StrategyClass, Label: job.Config?.Label, Symbol: job.Config?.Coin, Interval: job.Config?.Interval,
            Summary: { ReturnPct: r.TotalPnLPercent, BenchmarkPct: a.BenchmarkReturnPct, CagrPct: a.CagrPct, Sharpe: a.Sharpe, Sortino: a.Sortino, MaxDrawdownPct: r.MaxDrawdownPercent, Calmar: a.Calmar, TotalTrades: r.TotalTrades, WinRatePct: r.WinRate, ProfitFactor: a.ProfitFactor, ExposurePct: a.ExposurePct, Alpha: a.Alpha, Beta: a.Beta },
            Equity: (r.EquityCurve ?? []).filter((_: any, i: number) => i % 3 === 0).map((p: any) => ({ T: Math.floor(new Date(p.Ts).getTime() / 1000), V: (p.Equity / start) * 100 })),
        };
    });
}

export async function mockApi(page: Page) {
    const state = { requests: [] as string[], posts: [] as { path: string; body: any }[], errors: [] as string[] };
    page.on('pageerror', e => state.errors.push(`pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') state.errors.push(`console: ${m.text()}`); });
    await page.clock.setFixedTime(NOW);
    await page.routeWebSocket('wss://klive.dev/**', () => {});
    await page.route(`${apiOrigin}/**`, async route => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname;
        const p = url.searchParams;
        const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type, X-Klive-Client, X-Klive-Page, Cache-Control', 'access-control-expose-headers': '*' };
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
        const json = (body: unknown, status = 200) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
        let body: any = null;
        if (request.method() === 'POST') {
            try { body = JSON.parse(request.postData() ?? 'null'); } catch { body = request.postData(); }
            state.posts.push({ path: `${path}${url.search}`, body });
        }
        state.requests.push(`${request.method()} ${path}${url.search}`);
        const T = '/api/omnitrader';

        switch (path) {
            case '/KMProfiles/LoginStatus': return route.fulfill({ status: 200, headers: cors, body: 'SessionActive' });
            case '/KMProfiles/me': return json(mePayload({ rank: 5 }));
            case '/KMProfiles/permissions/catalog': return json(catalogPayload(false));
            case '/KMProfiles/GetCurrentProfile': return json({ Name: 'Klives', KlivesManagementRank: 5 });

            case `${T}/firm/overview`: return json(overview());
            case `${T}/firm/quote`: {
                const sym = (p.get('symbol') ?? 'BTCUSDT').toUpperCase();
                const close = chart.Close.at(-1), prev = chart.Close.at(-2);
                return json({ Symbol: sym, InstrumentId: null, DisplayName: sym === 'BTCUSDT' ? 'Bitcoin' : sym, AssetClass: 'Crypto', Price: close, PreviousClose: prev, ChangePercent: (close / prev - 1) * 100, Streaming: true });
            }
            case `${T}/firm/search`: return json([{ Symbol: 'BTCUSDT', DisplayName: 'Bitcoin / Tether', AssetClass: 'Crypto', Exchange: 'Binance' }, { Symbol: 'ETHUSDT', DisplayName: 'Ether / Tether', AssetClass: 'Crypto', Exchange: 'Binance' }]);
            case `${T}/firm/markets/watchlists`: return json([]);
            case `${T}/firm/markets`: return json({ Rows: [] });
            case `${T}/firm/portfolio`: return json({ Lines: [] });
            case `${T}/firm/experiments`: return json([]);

            case `${T}/terminal/quotes`: return json(load('quotes'));
            case `${T}/terminal/chart`: return json(chartFor(request.method() === 'POST' ? body : { Symbol: p.get('symbol'), Interval: p.get('interval') }));
            case `${T}/terminal/indicators`: return json(load('indicators'));
            case `${T}/terminal/formula/reference`: return json(load('formula-reference'));
            case `${T}/terminal/formula/check`: {
                const f = String(body?.Formula ?? '');
                const bad = /\)\s*$/.test(f) ? (f.split('(').length !== f.split(')').length) : f.trim().endsWith('>');
                return json(bad ? { Ok: false, Errors: [{ Message: 'Unexpected end of formula', Position: f.length, Length: 1 }] }
                    : { Ok: true, Errors: [], IsBoolean: /[<>]|cross/.test(f), Lookback: 50, Bars: 300, TrueCount: 41, Last: 1, Preview: [] });
            }
            case `${T}/terminal/monitor`: return json(load('monitor'));
            case `${T}/terminal/breadth`: return json(load('breadth'));
            case `${T}/terminal/movers`: return json(load('movers'));
            case `${T}/terminal/news`: return json(load('news'));
            case `${T}/terminal/stats`: return json(load('stats-BTCUSDT'));
            case `${T}/terminal/seasonality`: return json(load('seasonality-BTCUSDT'));
            case `${T}/terminal/correlation`: return json(load('correlation'));
            case `${T}/terminal/universes`: return json(load('universes'));
            case `${T}/terminal/cost-presets`: return json(load('cost-presets'));
            case `${T}/terminal/layouts`: return json([]);
            case `${T}/terminal/screener/fields`: return json(load('screener-fields'));
            case `${T}/terminal/screener/presets`: return json(load('screener-presets'));
            case `${T}/terminal/screener/saved`: return json([]);
            case `${T}/terminal/screener/run`: return json(load('screener-result'));
            case `${T}/terminal/crypto/global`: return json(load('crypto-global'));
            case `${T}/terminal/crypto/coins`: return json(load('crypto-coins'));
            case `${T}/terminal/crypto/funding`: return json(load('crypto-funding'));
            case `${T}/terminal/crypto/fear-greed`: return json(load('crypto-fng'));
            case `${T}/terminal/crypto/dvol`: return json(load('crypto-dvol'));
            case `${T}/terminal/crypto/defi`: return json(load('crypto-defi'));
            case `${T}/terminal/crypto/trending`: return json(load('crypto-trending'));
            case `${T}/terminal/crypto/derivatives`: return json(load('crypto-derivatives'));
            case `${T}/terminal/crypto/orderbook`: return json({ Symbol: 'BTCUSDT', Bids: [[64000, 1.2], [63990, 2.1]], Asks: [[64010, 0.8], [64020, 1.9]], Mid: 64005, SpreadBps: 1.56, BidDepth1Pct: 2.1e6, AskDepth1Pct: 1.8e6, Imbalance: 0.077 });
            case `${T}/terminal/macro`: return json(load('macro'));
            case `${T}/terminal/macro/curve`: return json(load('macro-curve'));
            case `${T}/terminal/macro/volterm`: return json(load('macro-volterm'));
            case `${T}/terminal/alerts`: return json(load('alerts'));
            case `${T}/terminal/alert/events`: return json(load('alert-events'));
            case `${T}/terminal/alert/test`: return json({ Ok: true, Value: true, BarUtc: meta.GeneratedUtc, Close: chart.Close.at(-1), TrueBars: 120, Bars: 300, Error: null });
            case `${T}/terminal/alert/save`: return json({ ...body, Id: body?.Id ?? 'al_new000000001', UpdatedUtc: meta.GeneratedUtc });

            case `${T}/studio/list`: return json(studioList);
            case `${T}/studio/get`: return json(load(`studio-get-${p.get('id')}`));
            case `${T}/studio/templates`: return json(load('studio-templates'));
            case `${T}/studio/reference`: return json(load('studio-reference'));
            case `${T}/studio/check`: return json(load('studio-check'));
            case `${T}/studio/quick-test`: return json(load('studio-quick-test'));
            case `${T}/studio/backtest`: return json({ JobId: labBacktests.Rows[0].Id });

            case `${T}/lab/strategies`: return json(load('lab-strategies'));
            case `${T}/lab/backtests`: return json(labBacktests);
            case `${T}/lab/backtest`: return request.method() === 'POST' ? json({ JobId: labBacktests.Rows[0].Id }) : json(load(`backtest-${p.get('id')}`));
            case `${T}/lab/studies`: return json(labStudies);
            case `${T}/lab/study`: return json(load(`study-${p.get('id')}`));
            case `${T}/lab/compare`: return json(compareFor(body?.JobIds ?? []));

            case `${T}/alpha/overview`: return json(load('alpha-overview'));
            case `${T}/alpha/papers`: return json(alphaPapers);
            case `${T}/alpha/paper`: return json(load(`alpha-paper-${String(p.get('id')).replace(':', '_')}`));
            case `${T}/alpha/candidates`: return json(alphaCandidates);
            case `${T}/alpha/candidate`: return json(load(`alpha-candidate-${p.get('id')}`));
            case `${T}/alpha/runs`: return json(load('alpha-runs'));
            default: return json({});
        }
    });
    return state;
}
