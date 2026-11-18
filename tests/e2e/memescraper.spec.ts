import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { catalogPayload, mePayload } from './fixtures/permissions';

/**
 * The MemeScraper console (pages/schemery/memescraper/index.vue, components/Meme/*) against fixtures written by
 * the real analytics engine (Omnipotent.Tests MemeScraperFixtureExport: MEMESCRAPER_FIXTURES=<this folder>/fixtures/memescraper).
 * The fake API answers /batch the way KliveAPI does. Screenshots go to test-results/memescraper/ for review.
 */

const apiOrigin = 'https://klive.dev';
const FIXTURES = fileURLToPath(new URL('./fixtures/memescraper/', import.meta.url));
const load = (name: string) => JSON.parse(readFileSync(`${FIXTURES}${name}.json`, 'utf8'));
const dashboards = load('dashboards');
const reelPages = load('reels');
const reelDetails = load('reel-details');
const histories = load('scrape-history');
const summary = load('summary');
const baseHealth = load('health');
/** The fixtures were generated at this instant; the browser clock is pinned just after it. */
const NOW = new Date(baseHealth.GeneratedUtc).getTime() + 60_000;
const SHOTS = 'test-results/memescraper';
const BOOT = { timeout: 45_000 };

test.describe.configure({ timeout: 120_000 });

function thumbSvg(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = h % 360;
  const b = (a + 50) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="270" height="420" viewBox="0 0 270 420">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${a},50%,36%)"/><stop offset="1" stop-color="hsl(${b},55%,16%)"/></linearGradient></defs>
<rect width="270" height="420" fill="url(#g)"/><circle cx="135" cy="170" r="54" fill="rgba(255,255,255,0.16)"/>
<text x="135" y="320" text-anchor="middle" font-family="sans-serif" font-size="26" fill="rgba(255,255,255,0.8)">meme ${seed.slice(-3)}</text></svg>`;
}

function dashboardKey(p: URLSearchParams) {
  const base = p.get('from') ? 'custom' : (p.get('range') ?? '30d');
  if (p.get('sources')) return `${base}-src`;
  return base;
}

function reelsKey(p: URLSearchParams) {
  const range = p.get('range');
  const base = p.get('from') || !range || range === 'all' ? '30d' : range;
  if (p.get('sources')) return `${base}-src`;
  if (p.get('q')) return `${base}-q`;
  if (p.get('sort') === 'views') return `${base}-views`;
  return base;
}

interface Answer { status: number; body: unknown; contentType?: string }

async function mockApi(page: Page, opts: { rank?: number; starting?: boolean } = {}) {
  const state = {
    requests: [] as string[],
    batches: [] as string[][],
    mutations: [] as { path: string; body: any }[],
    health: structuredClone(baseHealth),
    starting: !!opts.starting,
  };
  if (state.starting) {
    state.health.DataLoaded = false;
    state.health.Startup = { ...state.health.Startup, DataReadyUtc: null, DataLoadMs: null, Progress: { Done: 4210, Total: 6521 }, Reels: null, Reconcile: null };
  }

  function answer(method: string, path: string, p: URLSearchParams, body: any): Answer {
    const ok = (b: unknown, status = 200): Answer => ({ status, body: b });
    if (path.startsWith('/memescraper/') && state.starting && !['/memescraper/scraperHealth'].includes(path)) {
      return ok({ error: 'MemeScraper is still loading its data; try again in a moment.' }, 503);
    }
    switch (path) {
      case '/memescraper/scraperHealth': return ok(state.health);
      case '/memescraper/summary': return ok(summary);
      case '/memescraper/dashboard': {
        const key = dashboardKey(p);
        return ok(dashboards[key] ?? dashboards[key.split('-')[0]] ?? dashboards['30d']);
      }
      case '/memescraper/reels': {
        if (p.get('format') === 'csv') return { status: 200, body: 'PostID,Owner\n1,codememes\n', contentType: 'text/csv' };
        if (p.get('sources') && p.get('sources') !== 'codememes') return ok({ ...reelPages['30d'], Filtered: 0, Rows: [] });
        const key = reelsKey(p);
        return ok(reelPages[key] ?? reelPages['30d']);
      }
      case '/memescraper/reel': {
        const detail = reelDetails[p.get('postId') ?? ''];
        if (detail) return ok(detail);
        const row = Object.values(reelPages).flatMap((pg: any) => pg.Rows).find((r: any) => r.PostID === p.get('postId'));
        return row ? ok({ Reel: { ...row, VideoExists: true, Bytes: 4_200_000 }, OwnerReels: 120, OwnerRank: 7, OwnerMedianViews: 50_000, Thumbnail: false }) : ok({ error: 'No reel with that post id.' }, 404);
      }
      case '/memescraper/reelVideo': return ok({ error: 'The reel\'s video file is missing.' }, 404);
      case '/memescraper/scrapeHistory': {
        const who = p.get('sources');
        if (who) {
          const rows = histories.all.Rows.filter((r: any) => r.Username === who).slice(0, Number(p.get('limit') ?? 25));
          return ok({ ...histories.all, Filtered: rows.length, Rows: rows });
        }
        if (p.get('status') === 'failed') return ok(histories['30d-failed']);
        return ok(histories['30d']);
      }
      case '/memescraper/saveSettings': {
        if (typeof body?.paused === 'boolean') state.health.Settings.Paused = body.paused;
        if (typeof body?.intervalHours === 'number') state.health.Settings.IntervalHours = body.intervalHours;
        if (typeof body?.maxPagesPerScrape === 'number') state.health.Settings.MaxPagesPerScrape = body.maxPagesPerScrape;
        return ok({ ...state.health.Settings, OnServer: true });
      }
      case '/memescraper/scrapeNow': {
        const who = p.get('sourceAccountID') ? state.health.Sources.find((s: any) => s.AccountID === p.get('sourceAccountID'))?.Username : null;
        state.health.CurrentScrape = `@${who ?? 'codememes'} (manual:Klives) since 2026-10-11 15:01:00Z`;
        state.health.ScrapeQueued = who ? 1 : state.health.Sources.filter((s: any) => s.DownloadReels).length;
        return ok({ queued: who ? [who] : state.health.Sources.filter((s: any) => s.DownloadReels).map((s: any) => s.Username), note: 'Scrapes run one at a time.' }, 202);
      }
      case '/memescraper/diagnoseProviders': return ok({ Username: p.get('username'), State: 'queued', Results: [] }, 202);
      case '/memescraper/updateInstagramSource': return ok({ Username: 'x', AccountID: body?.accountId, DownloadReels: body?.downloadReels ?? true, Niches: body?.niches ?? [] });
      case '/memescraper/removeInstagramSource': return ok({ removed: 'x', reelsDeleted: body?.deleteReels ? 12 : 0 });
      case '/memescraper/refreshSourceProfile': return ok({ State: 'queued' }, 202);
      case '/memescraper/addInstagramSource': return { status: 200, body: 'Instagram source being added.', contentType: 'text/plain' };
      default: return ok({});
    }
  }

  await page.clock.setFixedTime(NOW);
  await page.routeWebSocket('wss://klive.dev/**', () => {});
  await page.route(`${apiOrigin}/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type, X-Klive-Client, X-Klive-Page, Cache-Control', 'access-control-expose-headers': '*' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
    const json = (body: unknown, status = 200) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
    state.requests.push(`${request.method()} ${path}${url.search}`);
    let body: any = null;
    if (request.method() === 'POST') {
      const raw = request.postData();
      body = raw;
      try { body = raw ? JSON.parse(raw) : null; } catch { /* plain text */ }
      if (path !== '/batch') state.mutations.push({ path: `${path}${url.search}`, body });
    }

    switch (path) {
      case '/KMProfiles/LoginStatus': return route.fulfill({ status: 200, headers: cors, body: 'SessionActive' });
      case '/KMProfiles/me': return json(mePayload({ rank: opts.rank ?? 5 }));
      case '/KMProfiles/permissions/catalog': return json(catalogPayload(false));
      case '/KMProfiles/GetCurrentProfile': return json({ Name: 'Klives', KlivesManagementRank: opts.rank ?? 5 });
      case '/memescraper/reelThumb': return route.fulfill({ status: 200, headers: cors, contentType: 'image/svg+xml', body: thumbSvg(url.searchParams.get('postId') ?? 'x') });
      case '/batch': {
        const paths: string[] = (Array.isArray(body) ? body : []).map((e: any) => e.path);
        state.batches.push(paths);
        return json(paths.map(full => {
          const u = new URL(full, apiOrigin);
          state.requests.push(`GET ${u.pathname}${u.search} (batch)`);
          const a = answer('GET', u.pathname, u.searchParams, null);
          return { path: full, status: a.status, ok: a.status >= 200 && a.status < 300, contentType: a.contentType ?? 'application/json', body: a.body };
        }));
      }
      default: {
        const a = answer(request.method(), path, url.searchParams, body);
        if (a.contentType && a.contentType !== 'application/json') return route.fulfill({ status: a.status, headers: cors, contentType: a.contentType, body: String(a.body) });
        return json(a.body, a.status);
      }
    }
  });
  return state;
}

test.beforeEach(async ({ context }) => {
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '4173'}`).origin;
  await context.addCookies([{ name: 'km_session', value: 'kms_e2e', url: origin }]);
});

test('overview: state, what needs you, figures, chart and feed in one request', async ({ page }) => {
  const state = await mockApi(page);
  await page.setViewportSize({ width: 1600, height: 1250 });
  await page.goto('/schemery/memescraper');

  const d30 = dashboards['30d'];
  await expect(page.getByTestId('kpi-reels')).toContainText(d30.Kpis.Downloaded.toLocaleString('en-GB'), BOOT);
  await expect(page.getByTestId('kpi-active')).toContainText(`${d30.Kpis.ActiveSources}`);
  await expect(page.getByTestId('kpi-active')).toContainText('2 never have');
  // The first read is one /batch: the window's dashboard and the scraper's health.
  expect(state.batches[0].some(p => p.startsWith('/memescraper/dashboard') && p.includes('range=30d') && p.includes('tz='))).toBe(true);
  expect(state.batches[0]).toContain('/memescraper/scraperHealth');
  expect(state.requests.some(r => r.startsWith('GET /memescraper/dashboard') && !r.endsWith('(batch)'))).toBe(false);

  // What needs a person: the failing source first, then the two that never had a reel.
  const pulse = page.getByTestId('msx-pulse');
  await expect(pulse).toContainText('@techhumour keeps failing');
  await expect(page.getByTestId('issue-empty')).toContainText('2 sources have never had a reel');
  await expect(page.getByTestId('issue-empty').getByRole('button', { name: 'Pause all 2' })).toBeVisible();
  await expect(page.getByTestId('issue-quiet')).toContainText('@uni.struggles');

  await expect(page.getByTestId('msx-chart').locator('svg')).toBeVisible();
  await expect(page.getByTestId('msx-top-reels').locator('.msx-reel')).toHaveCount(d30.TopReels.length);
  await expect(page.getByTestId('msx-top-sources')).toContainText('@catmemes.daily');
  await expect(page.getByTestId('msx-feed').locator('.msx-feed__row')).toHaveCount(9);
  await expect(page.getByTestId('msx-subline')).toContainText(`${d30.Library.TotalReels.toLocaleString('en-GB')} reels`);
  await page.screenshot({ path: `${SHOTS}/overview-1600.png`, fullPage: true });
});

test('window: presets and dates live in the URL, the legend filters to a source', async ({ page }) => {
  const state = await mockApi(page);
  await page.setViewportSize({ width: 1500, height: 1100 });
  await page.goto('/schemery/memescraper');
  await expect(page.getByTestId('kpi-reels')).toContainText(dashboards['30d'].Kpis.Downloaded.toLocaleString('en-GB'), BOOT);

  await page.getByRole('button', { name: '90D' }).click();
  await expect(page).toHaveURL(/range=90d/);
  await expect(page.getByTestId('kpi-reels')).toContainText(dashboards['90d'].Kpis.Downloaded.toLocaleString('en-GB'));
  expect(state.batches.some(b => b.some(p => p.includes('range=90d')))).toBe(true);

  await page.getByTestId('msx-dates').click();
  await page.locator('#msx-from').fill('2026-08-01');
  await page.locator('#msx-to').fill('2026-08-31');
  await expect(page).toHaveURL(/from=2026-08-01/);
  await expect(page).toHaveURL(/to=2026-08-31/);
  await expect(page.getByTestId('msx-window')).toContainText('Aug 2026');

  await page.getByRole('button', { name: '30D' }).click();
  await page.locator('.msx-legend__item').filter({ hasText: '@codememes' }).click();
  await expect(page).toHaveURL(/src=codememes/);
  await expect(page.getByRole('button', { name: 'Stop filtering to @codememes' })).toBeVisible();
  expect(state.batches.some(b => b.some(p => p.includes('sources=codememes')))).toBe(true);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).not.toHaveURL(/src=/);
});

test('pausing the sources that never had a reel: confirm, one request each, undo offered', async ({ page }) => {
  const state = await mockApi(page);
  await page.setViewportSize({ width: 1500, height: 1100 });
  await page.goto('/schemery/memescraper');
  await page.getByTestId('issue-empty').getByRole('button', { name: 'Pause all 2' }).click(BOOT);

  const dialog = page.getByTestId('msx-pause-dialog');
  await expect(dialog).toContainText('@lol.reposts');
  await expect(dialog).toContainText('@memevault.archive');
  await page.screenshot({ path: `${SHOTS}/pause-empty-dialog.png` });
  await dialog.getByTestId('pause-confirm').click();

  await expect.poll(() => state.mutations.filter(m => m.path === '/memescraper/updateInstagramSource').length).toBe(2);
  for (const m of state.mutations.filter(x => x.path === '/memescraper/updateInstagramSource')) expect(m.body).toMatchObject({ downloadReels: false });
  const toast = page.getByTestId('msx-toast').filter({ hasText: 'Paused 2 sources' });
  await expect(toast).toBeVisible();
  await expect(toast.getByRole('button', { name: 'Undo' })).toBeVisible();
});

test('sources: states, search, sheet with actions and niches', async ({ page }) => {
  const state = await mockApi(page);
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto('/schemery/memescraper?view=sources');
  const table = page.getByTestId('msx-sources');
  await expect(table.locator('tbody tr')).toHaveCount(dashboards['30d'].Sources.filter((s: any) => s.Registered).length, BOOT);
  await page.screenshot({ path: `${SHOTS}/sources-1600.png`, fullPage: true });

  await page.getByTestId('sources-states').getByRole('button', { name: /Never had a reel/ }).click();
  await expect(page).toHaveURL(/state=empty/);
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await page.getByTestId('sources-states').getByRole('button', { name: /^All/ }).click();

  await page.getByTestId('sources-search').fill('gym');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await table.locator('tbody tr').first().click();

  const sheet = page.getByTestId('msx-sheet');
  await expect(sheet).toContainText('@gymhumor');
  await expect(sheet.getByTestId('sheet-state')).toContainText('Healthy');
  await expect(sheet).toContainText('Recent scrapes');
  expect(state.batches.some(b => b.some(p => p.includes('/memescraper/scrapeHistory') && p.includes('sources=gymhumor')))).toBe(true);

  await sheet.getByTestId('sheet-pause').click();
  await expect.poll(() => state.mutations.find(m => m.path === '/memescraper/updateInstagramSource')?.body).toMatchObject({ downloadReels: false });

  await sheet.getByTestId('sheet-niche').fill('fitness');
  await sheet.getByTestId('sheet-niche').press('Enter');
  await sheet.getByTestId('sheet-niche-save').click();
  await expect.poll(() => state.mutations.filter(m => m.path === '/memescraper/updateInstagramSource').at(-1)?.body?.niches).toContain('fitness');
  await page.screenshot({ path: `${SHOTS}/source-sheet.png` });

  await sheet.getByTestId('sheet-scrape').click();
  await expect.poll(() => state.mutations.some(m => m.path.startsWith('/memescraper/scrapeNow?sourceAccountID='))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
});

test('library: thumbnails load as they come into view, search, viewer with arrows', async ({ page }) => {
  const state = await mockApi(page);
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto('/schemery/memescraper?view=library');
  const grid = page.getByTestId('library-grid');
  const rows = reelPages['30d'].Rows.length;
  await expect(grid.locator('.msx-reel')).toHaveCount(rows, BOOT);
  await expect(grid.locator('img.msx-thumb').first()).toBeVisible();
  // Only what is on (or near) the screen asked for its thumbnail, not the whole page of reels at once.
  const thumbs = () => state.requests.filter(r => r.startsWith('GET /memescraper/reelThumb')).length;
  await expect.poll(thumbs).toBeGreaterThan(0);
  expect(thumbs()).toBeLessThan(rows);
  expect(state.requests.some(r => r.startsWith('GET /memescraper/reels?') && r.includes('range=all') && r.includes('limit=36'))).toBe(true);
  // The library's scope is everything ever saved, and the window buttons say so; picking 30D narrows it.
  await expect(page.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: `${SHOTS}/library-1500.png` });
  await page.getByRole('button', { name: '30D' }).click();
  await expect(page).toHaveURL(/range=30d/);
  await expect.poll(() => state.requests.some(r => r.startsWith('GET /memescraper/reels?') && r.includes('range=30d'))).toBe(true);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page).toHaveURL(/range=all/);

  await page.getByTestId('library-search').fill('cat');
  await expect(page).toHaveURL(/q=cat/);
  await expect.poll(() => state.requests.some(r => r.startsWith('GET /memescraper/reels?') && r.includes('q=cat'))).toBe(true);

  const first = reelPages['30d-q'].Rows[0];
  const second = reelPages['30d-q'].Rows[1];
  await grid.locator(`[data-testid="reel-${first.PostID}"]`).click();
  const viewer = page.getByTestId('msx-viewer');
  await expect(viewer).toContainText(`@${first.Owner}`);
  await expect(page.getByTestId('viewer-state')).toContainText('no longer on disk');
  await page.screenshot({ path: `${SHOTS}/reel-viewer.png` });
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => state.requests.some(r => r.includes(`/memescraper/reel?postId=${second.PostID}`))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
});

test('activity: schedule settings, providers, start-up and the scrape log', async ({ page }) => {
  const state = await mockApi(page);
  await page.setViewportSize({ width: 1500, height: 1200 });
  await page.goto('/schemery/memescraper?view=activity');
  await expect(page.getByTestId('act-startup')).toContainText('reel index', BOOT);
  await expect(page.getByTestId('act-startup')).toContainText('2 new');
  await expect(page.getByTestId('act-providers')).toContainText('inflact.com');
  await expect(page.getByTestId('act-check-result')).toContainText('@codememes');
  await expect(page.getByTestId('act-disk')).toContainText('3 missing');
  await expect(page.getByTestId('act-disk')).toContainText('412 made · 5,180 to go');
  await expect(page.getByTestId('act-log-table').locator('tbody tr').first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/activity-1500.png`, fullPage: true });

  await page.getByTestId('act-log').getByRole('button', { name: 'Failed' }).click();
  await expect.poll(() => state.requests.some(r => r.includes('/memescraper/scrapeHistory') && r.includes('status=failed'))).toBe(true);

  await page.getByTestId('act-paused').click();
  await page.getByTestId('act-save').click();
  await expect.poll(() => state.mutations.find(m => m.path === '/memescraper/saveSettings')?.body).toEqual({ paused: true });
  await expect(page.getByTestId('msx-toast').filter({ hasText: 'Scheduled scrapes paused' })).toBeVisible();
});

test('palette: find a source by typing, add a typed account', async ({ page }) => {
  const state = await mockApi(page);
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto('/schemery/memescraper');
  await expect(page.getByTestId('kpi-reels')).toContainText(/\d/, BOOT);

  await page.keyboard.press('Control+k');
  await page.getByTestId('palette-input').fill('codem');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('msx-sheet')).toContainText('@codememes');
  await page.keyboard.press('Escape');

  await page.keyboard.press('Control+k');
  await page.getByTestId('palette-input').fill('freshmemes.uk');
  await page.getByRole('option', { name: /Add @freshmemes\.uk/ }).click();
  const add = page.getByTestId('msx-add-dialog');
  await expect(add.getByTestId('add-username')).toHaveValue('freshmemes.uk');
  await add.getByTestId('add-submit').click();
  await expect.poll(() => state.mutations.find(m => m.path === '/memescraper/addInstagramSource')?.body).toMatchObject({ username: 'freshmemes.uk', downloadReels: true });
  await expect(add).toBeHidden();

  // Number keys switch views.
  await page.keyboard.press('3');
  await expect(page).toHaveURL(/view=library/);
});

test('starting up: progress instead of errors, then the figures arrive', async ({ page }) => {
  const state = await mockApi(page, { starting: true });
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto('/schemery/memescraper');
  await expect(page.getByTestId('msx-starting')).toContainText('4,210 of 6,521', BOOT);
  await expect(page.getByTestId('msx-live')).toContainText('Starting');
  await page.screenshot({ path: `${SHOTS}/starting.png` });

  state.starting = false;
  state.health = structuredClone(baseHealth);
  await expect(page.getByTestId('kpi-reels')).toContainText(dashboards['30d'].Kpis.Downloaded.toLocaleString('en-GB'), { timeout: 15_000 });
  await expect(page.getByTestId('msx-starting')).toBeHidden();
});

test('phone width: no sideways scroll, views still reachable', async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 390, height: 860 });
  await page.goto('/schemery/memescraper');
  await expect(page.getByTestId('kpi-reels')).toContainText(/\d/, BOOT);
  const overflow = await page.getByTestId('msx-root').evaluate(el => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${SHOTS}/overview-390.png`, fullPage: true });
  await page.getByTestId('tab-sources').click();
  await expect(page.getByTestId('msx-sources').locator('tbody tr').first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/sources-390.png`, fullPage: true });
});

test('old addresses land on the matching view', async ({ page }) => {
  await mockApi(page);
  await page.goto('/schemery/memescraper/health?range=90d');
  await expect(page).toHaveURL(/\/schemery\/memescraper\?.*view=activity/, BOOT);
  await expect(page).toHaveURL(/range=90d/);
  await expect(page.getByTestId('msx-activity')).toBeVisible();
});
