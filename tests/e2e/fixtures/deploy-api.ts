import { type Page } from '@playwright/test';
import { apiOrigin, load, maybe, mockApi } from './omnitrader-api';

/**
 * A stateful fake of the Deploy page's routes, layered over the OmniTrader shell's mock. Every payload
 * starts from a deploy-*.json fixture written by the engine (Omnipotent.Tests DeployFixtureExport:
 * the real planner, catalog and health rules over synthetic strategies), so field names and shapes
 * are the server's own.
 */

export const DEPLOY_NOW = Date.parse(load('deploy-meta').GeneratedUtc) + 60_000;
const T = '/api/omnitrader';

export interface DeployState {
  deployments: any[];
  posts: { path: string; body: any }[];
  requests: string[];
  errors: string[];
  planRequests: URLSearchParams[];
}

/**
 * `legacy`: the server as it is before the OmniTrader backend of this change is deployed (the site and the
 * server deploy separately): no /deploy routes, and deployment rows without Health, Origin, StrategyName or Shape.
 */
export async function mockDeployApi(page: Page, options: { legacy?: boolean } = {}): Promise<DeployState> {
  const shell = await mockApi(page);
  await page.clock.setFixedTime(DEPLOY_NOW);
  const rows = JSON.parse(JSON.stringify(load('deploy-deployments')));
  if (options.legacy) for (const r of rows) { delete r.Health; delete r.Origin; delete r.StrategyName; delete r.Label; delete r.Shape; }
  const state: DeployState = {
    deployments: rows,
    posts: shell.posts,
    requests: shell.requests,
    errors: shell.errors,
    planRequests: [],
  };
  const catalog = load('deploy-catalog');
  let seq = 0;

  function planFor(p: URLSearchParams) {
    const key = p.get('candidate') ?? (p.get('strategy') ?? '').replace(/^studio:/, '').replace(/@v\d+$/, '');
    const suffix = p.get('mode') === 'Live' ? '-Live' : p.get('interval') ? `-${p.get('interval')}` : p.get('symbol') ? `-${p.get('symbol')}` : '';
    const plan = maybe(`deploy-plan-${key}${suffix}`) ?? maybe(`deploy-plan-${key}`);
    if (!plan) return null;
    const capital = Number(p.get('capital'));
    if (capital > 0) { plan.Capital = capital; plan.Request.InitialQuoteBalance = capital; }
    return plan;
  }

  /** One GET as the server answers it: [status, body]. */
  function get(path: string, p: URLSearchParams): [number, unknown] {
    switch (path) {
      case `${T}/deployments`: return [200, state.deployments];
      case `${T}/status`: return [200, { Service: 'OmniTrader', DeployedCount: state.deployments.filter(d => d.Status === 'Running').length, KrakenConfigured: true, Uptime: '13:00:00' }];
      case `${T}/deploy/catalog`: return options.legacy ? [404, { Error: 'Not found' }] : [200, catalog];
      case `${T}/deploy/plan`: {
        if (options.legacy) return [404, { Error: 'Not found' }];
        state.planRequests.push(p);
        const plan = planFor(p);
        return plan ? [200, plan] : [404, { Error: 'No such candidate' }];
      }
      case `${T}/deployment`: {
        const id = p.get('id');
        const row = state.deployments.find(d => d.Id === id);
        if (!row) return [404, 'Not found'];
        const detail = maybe('deploy-detail-trend');
        if (detail && detail.Deployment.Id === id) return [200, { ...detail, Deployment: { ...detail.Deployment, Status: row.Status }, Health: row.Health }];
        return [200, { Deployment: { Id: row.Id, StrategyClass: row.StrategyClass, Config: { Symbol: row.Symbol, FeeFraction: 0.001, SlippageFraction: 0.0005, Margin: { Leverage: 1 } }, Mode: row.Mode, Status: row.Status, EquityInitial: row.EquityInitial, EquityCurrent: row.EquityCurrent, CreatedUtc: row.CreatedUtc }, StrategyName: row.StrategyName, Health: row.Health, Trades: [], Orders: [], Fills: [] }];
      }
      case `${T}/deployment/equity`: return [200, p.get('id') === '0f1e2d3c4b5a69788796a5b4c3d2e1f0' ? load('deploy-equity-trend') : []];
      case `${T}/firm/strategy-versions`: return [200, []];
      default: return [-1, null];
    }
  }

  await page.route(`${apiOrigin}/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type, X-Klive-Client, X-Klive-Page, Cache-Control', 'access-control-expose-headers': '*' };
    if (request.method() === 'OPTIONS') return route.fallback();
    const json = (body: unknown, status = 200) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: typeof body === 'string' ? body : JSON.stringify(body) });

    if (path === '/batch' && request.method() === 'POST') {
      const items = JSON.parse(request.postData() ?? '[]') as { path: string }[];
      return json(items.map(item => {
        const u = new URL(item.path, apiOrigin);
        const [status, body] = get(u.pathname, u.searchParams);
        return status < 0
          ? { path: item.path, status: 404, ok: false, contentType: 'application/json', body: '{}' }
          : { path: item.path, status, ok: status < 400, contentType: 'application/json', body: JSON.stringify(body) };
      }));
    }

    if (request.method() === 'GET') {
      const [status, body] = get(path, url.searchParams);
      if (status < 0) return route.fallback();
      state.requests.push(`GET ${path}${url.search}`);
      return json(body, status);
    }

    // Writes: record, then change the state the way the server would.
    let body: any = null;
    try { body = JSON.parse(request.postData() ?? 'null'); } catch { body = request.postData(); }
    const id = url.searchParams.get('id');
    const row = state.deployments.find(d => d.Id === id);
    const record = () => state.posts.push({ path: `${path}${url.search}`, body });
    switch (path) {
      case `${T}/deployment/create`: {
        record();
        if (body?.Mode === 'Live' && /[.=^]|^[A-Z]{1,5}$/.test(body?.Symbol ?? '')) return json({ Error: 'Live deployments trade on Kraken spot only' }, 400);
        const newId = `e2e${String(++seq).padStart(29, '0')}`;
        state.deployments.unshift({
          Id: newId, StrategyClass: body.StrategyClass, StrategyName: body.Origin?.StrategyName, Label: body.Origin?.Label, Symbol: body.Symbol,
          Interval: body.Interval, Mode: body.Mode, Status: body.Mode === 'Live' ? 'Paused' : 'Running', Armed: false,
          EquityInitial: body.InitialQuoteBalance, EquityCurrent: body.InitialQuoteBalance, PnLPercent: 0, CreatedUtc: new Date(DEPLOY_NOW).toISOString(),
          Shape: body.Origin?.Shape, Origin: { Source: body.Origin?.Source, CandidateId: body.Origin?.CandidateId, CandidateStatus: body.Origin?.CandidateStatus, Score: body.Origin?.Score, StrategyVersion: body.Origin?.StrategyVersion, BarsPerTrade: body.Origin?.BarsPerTrade, Evaluated: body.Origin?.Evaluated },
          Health: body.Mode === 'Live'
            ? { State: 'disarmed', Tone: 'info', Title: 'Disarmed', Detail: 'It follows the market but sends nothing to Kraken until you arm it.', Orders: 0, BarsTotal: 0, InMemory: true }
            : { State: 'starting', Tone: 'info', Title: 'Waiting for data', Orders: 0, BarsTotal: 0, InMemory: true },
        });
        return json({ Id: newId, Mode: body.Mode });
      }
      case `${T}/deployment/pause`:
        record();
        if (!row) return json({ Paused: false }, 404);
        row.Status = 'Paused'; row.Health = { State: 'paused', Tone: 'neutral', Title: 'Paused' };
        return json({ Paused: true });
      case `${T}/deployment/resume`:
        record();
        if (!row) return json({ Resumed: false }, 404);
        row.Status = 'Running'; row.Health = { State: 'starting', Tone: 'info', Title: 'Waiting for data' };
        return json({ Resumed: true });
      case `${T}/deployment/kill`:
        record();
        if (!row) return json({ Killed: false }, 404);
        row.Status = 'Stopped'; row.Armed = false; row.Health = { State: 'stopped', Tone: 'neutral', Title: 'Stopped' };
        return json({ Killed: true });
      case `${T}/deployment/delete`:
        record();
        state.deployments = state.deployments.filter(d => d.Id !== id);
        return json({ Deleted: true });
      case `${T}/deployment/arm-live`:
        record();
        if (!row || url.searchParams.get('confirm') !== id) return json('confirm token must equal id', 400);
        row.Armed = true; row.Health = { State: 'disarmed', Tone: 'info', Title: 'Armed' };
        return json({ Armed: true });
      default:
        return route.fallback();
    }
  });
  return state;
}
