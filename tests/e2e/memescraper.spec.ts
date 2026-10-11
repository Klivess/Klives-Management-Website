import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { catalogPayload, mePayload } from './fixtures/permissions';

/**
 * MemeScraper pages against fixtures written by the real analytics engine
 * (Omnipotent.Tests MemeScraperFixtureExport: MEMESCRAPER_FIXTURES=<this folder>/fixtures/memescraper).
 * Each step also saves a screenshot under test-results/memescraper/ for visual review.
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
/** The first page a cold dev server serves compiles the whole app. */
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
    if (p.get('niche')) return `${base}-niche`;
    if (p.get('granularity') === 'week') return `${base}-week`;
    return base;
}

function reelsKey(p: URLSearchParams) {
    const base = p.get('from') ? '30d' : (p.get('range') ?? '30d');
    if (p.get('sources')) return `${base}-src`;
    if (p.get('q')) return `${base}-q`;
    if (p.get('sort') === 'views') return `${base}-views`;
    if (Number(p.get('offset') ?? 0) >= 48) return `${base}-p2`;
    return base;
}

function historyKey(p: URLSearchParams) {
    if (p.get('sources')) return 'src';
    const base = p.get('range') ?? '30d';
    return p.get('status') === 'failed' ? `${base}-failed` : base;
}

async function mockApi(page: Page, rank = 5) {
    const state = {
        requests: [] as string[],
        mutations: [] as { path: string; body: any }[],
        health: structuredClone(baseHealth),
        settings: { Paused: false, IntervalHours: 24, MaxPagesPerScrape: 40, OnServer: true },
    };
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
        state.requests.push(`${request.method()} ${path}${url.search}`);
        if (request.method() === 'POST') {
            const raw = request.postData();
            let body: any = raw;
            try { body = raw ? JSON.parse(raw) : null; } catch { /* plain text */ }
            state.mutations.push({ path: `${path}${url.search}`, body });
        }

        switch (path) {
            case '/KMProfiles/LoginStatus': return route.fulfill({ status: 200, headers: cors, body: 'SessionActive' });
            case '/KMProfiles/me': return json(mePayload({ rank }));
            case '/KMProfiles/permissions/catalog': return json(catalogPayload(false));
            case '/KMProfiles/GetCurrentProfile': return json({ Name: rank === 5 ? 'Klives' : 'Guest', KlivesManagementRank: rank });
            case '/memescraper/scraperHealth': return json(state.health);
            case '/memescraper/summary': return json(summary);
            case '/memescraper/dashboard': {
                const key = dashboardKey(p);
                return json(dashboards[key] ?? dashboards[key.split('-')[0]] ?? dashboards['30d']);
            }
            case '/memescraper/reels': {
                if (p.get('format') === 'csv') return route.fulfill({ status: 200, headers: cors, contentType: 'text/csv', body: 'PostID,Owner\n1,codememes\n' });
                // The single-source fixture belongs to @codememes; any other source gets an honest empty page.
                if (p.get('sources') && p.get('sources') !== 'codememes') return json({ ...reelPages['30d'], Filtered: 0, Rows: [] });
                const key = reelsKey(p);
                return json(reelPages[key] ?? reelPages[key.split('-')[0]] ?? reelPages['30d']);
            }
            case '/memescraper/reel': {
                const detail = reelDetails[p.get('postId') ?? ''];
                return detail ? json(detail) : json({ error: 'No reel with that post id.' }, 404);
            }
            case '/memescraper/reelThumb': return route.fulfill({ status: 200, headers: cors, contentType: 'image/svg+xml', body: thumbSvg(p.get('postId') ?? 'x') });
            case '/memescraper/reelVideo': return json({ error: 'The reel\'s video file is missing.' }, 404);
            case '/memescraper/scrapeHistory': {
                const who = p.get('sources');
                if (who && who !== 'codememes') {
                    const rows = histories.all.Rows.filter((r: any) => r.Username === who).slice(0, Number(p.get('limit') ?? 25));
                    return json({ ...histories.all, Filtered: rows.length, Rows: rows });
                }
                return json(histories[historyKey(p)] ?? histories['30d']);
            }
            case '/memescraper/settings': return json(state.settings);
            case '/memescraper/saveSettings': {
                const body = state.mutations[state.mutations.length - 1].body ?? {};
                if (typeof body.paused === 'boolean') state.settings.Paused = body.paused;
                if (typeof body.intervalHours === 'number') state.settings.IntervalHours = body.intervalHours;
                if (typeof body.maxPagesPerScrape === 'number') state.settings.MaxPagesPerScrape = body.maxPagesPerScrape;
                state.health.Settings = { ...state.settings };
                return json(state.settings);
            }
            case '/memescraper/scrapeNow': {
                const who = p.get('sourceAccountID') ? state.health.Sources.find((s: any) => s.AccountID === p.get('sourceAccountID'))?.Username : null;
                state.health.CurrentScrape = `@${who ?? 'codememes'} (manual:Klives) since 2026-10-11 15:01:00Z`;
                state.health.ScrapeQueued = who ? 1 : state.health.Sources.filter((s: any) => s.DownloadReels).length;
                return json({ queued: [who ?? 'codememes'], note: 'Scrapes run one at a time.' }, 202);
            }
            case '/memescraper/diagnoseProviders': return json({ Username: p.get('username'), State: 'queued', Results: [] }, 202);
            case '/memescraper/updateInstagramSource': {
                const body = state.mutations[state.mutations.length - 1].body;
                return json({ Username: 'x', AccountID: body.accountId, DownloadReels: body.downloadReels ?? true, Niches: body.niches ?? [] });
            }
            case '/memescraper/removeInstagramSource': return json({ removed: 'x', reelsDeleted: 0 });
            case '/memescraper/refreshSourceProfile': return json({ State: 'queued' }, 202);
            case '/memescraper/addInstagramSource': return route.fulfill({ status: 200, headers: cors, body: 'Instagram source being added.' });
            default: return json({});
        }
    });
    return state;
}

test.beforeEach(async ({ context }) => {
    const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '4173'}`).origin;
    await context.addCookies([{ name: 'km_session', value: 'kms_e2e', url: origin }]);
});

test('overview: KPIs, insights, chart and the shared date window', async ({ page }) => {
    const state = await mockApi(page);
    await page.setViewportSize({ width: 1500, height: 1200 });
    await page.goto('/schemery/memescraper');

    await expect(page.getByRole('heading', { name: 'Reel scraper' })).toBeVisible(BOOT);
    const d30 = dashboards['30d'];
    await expect(page.locator('.ot-kpi').filter({ hasText: 'Reels downloaded' })).toContainText(d30.Kpis.Downloaded.toLocaleString());
    await expect(page.locator('.ot-kpi').filter({ hasText: 'Active sources' })).toContainText(`${d30.Kpis.ActiveSources} / ${d30.Kpis.SourcesInScope}`);
    await expect(page.getByText('@techhumour keeps failing').first()).toBeVisible();
    await expect(page.getByText('@uni.struggles has gone quiet')).toBeVisible();
    await expect(page.locator('.ms-bars svg')).toBeVisible();
    await expect(page.locator('.ms-ranked').first()).toContainText('@catmemes.daily');
    await expect(page.locator('.ms-reel')).toHaveCount(d30.TopReels.length);
    expect(state.requests.some(r => r.startsWith('GET /memescraper/dashboard') && r.includes('range=30d') && r.includes('tz='))).toBe(true);
    await page.screenshot({ path: `${SHOTS}/overview-30d.png`, fullPage: true });

    // Presets rewrite the URL and the request; the data follows.
    await page.getByRole('button', { name: '90D' }).click();
    await expect(page).toHaveURL(/range=90d/);
    await expect(page.locator('.ot-kpi').filter({ hasText: 'Reels downloaded' })).toContainText(dashboards['90d'].Kpis.Downloaded.toLocaleString());
    expect(state.requests.some(r => r.includes('/memescraper/dashboard') && r.includes('range=90d'))).toBe(true);

    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page).toHaveURL(/range=all/);
    await expect(page.locator('.ms-rangebar .summary')).toContainText(new Date(`${dashboards.all.Range.From}T12:00:00`).getFullYear().toString());

    // A custom window from the date inputs.
    await page.locator('#ms-range-from').fill('2026-08-01');
    await expect(page).toHaveURL(/from=2026-08-01/);
    await page.locator('#ms-range-to').fill('2026-08-31');
    await expect(page).toHaveURL(/to=2026-08-31/);
    await expect(page.getByText('4 days without a download')).toBeVisible();
    await expect(page.locator('#ms-range-from')).toHaveClass(/ot-input/);
    await page.screenshot({ path: `${SHOTS}/overview-custom-august.png`, fullPage: true });

    // The window survives switching tabs.
    await page.locator('.ot-nav').getByRole('link', { name: /^Sources/ }).click();
    await expect(page).toHaveURL(/\/schemery\/memescraper\/sources\?.*from=2026-08-01/);
});

test('overview: drag across the chart zooms, legend filters, drawer edits a source', async ({ page }) => {
    const state = await mockApi(page);
    await page.setViewportSize({ width: 1500, height: 1100 });
    await page.goto('/schemery/memescraper');
    const svg = page.locator('.ms-bars svg');
    await expect(svg).toBeVisible(BOOT);

    const box = (await svg.boundingBox())!;
    await page.mouse.move(box.x + 70, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height / 2, { steps: 8 });
    await expect(page.locator('.ms-bars .brush')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/overview-brush.png` });
    await page.mouse.up();
    await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}|to=\d{4}-\d{2}-\d{2}.*from=/);

    await page.getByRole('button', { name: '30D' }).click();
    await page.locator('.ms-bars .ms-legendbtn').filter({ hasText: '@codememes' }).click();
    await expect(page).toHaveURL(/src=codememes/);
    await expect(page.getByRole('button', { name: /Stop filtering to @codememes/ })).toBeVisible();
    expect(state.requests.some(r => r.includes('/memescraper/dashboard') && r.includes('sources=codememes'))).toBe(true);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page).not.toHaveURL(/src=/);

    // Insight chip → source drawer → pause and edit niches (JSON bodies).
    await page.locator('.ms-insight').filter({ hasText: 'gone quiet' }).getByRole('button', { name: '@uni.struggles' }).click();
    const drawer = page.locator('.ot-drawer');
    await expect(drawer.getByText('@uni.struggles').first()).toBeVisible();
    await expect(drawer.getByText('Quiet', { exact: true })).toBeVisible();
    await expect(drawer.getByText('Recent scrapes')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/source-drawer.png` });
    await drawer.getByRole('button', { name: 'Pause reels' }).click();
    await expect.poll(() => state.mutations.find(m => m.path === '/memescraper/updateInstagramSource')?.body).toMatchObject({ downloadReels: false });
    await drawer.locator('#ms-source-niches').fill('campus');
    await drawer.locator('#ms-source-niches').press('Enter');
    await drawer.getByRole('button', { name: 'Save niches' }).click();
    await expect.poll(() => state.mutations.filter(m => m.path === '/memescraper/updateInstagramSource').at(-1)?.body?.niches).toEqual(['relatable', 'students', 'campus']);
});

test('sources: table, state filters and per-source scrape', async ({ page }) => {
    const state = await mockApi(page);
    await page.setViewportSize({ width: 1500, height: 1100 });
    await page.goto('/schemery/memescraper/sources');

    await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible(BOOT);
    const rows = page.locator('table.ot-table tbody tr');
    await expect(rows).toHaveCount(dashboards['30d'].Sources.length);
    await page.screenshot({ path: `${SHOTS}/sources.png`, fullPage: true });

    await page.getByRole('button', { name: /Needs attention/ }).click();
    await expect(page).toHaveURL(/state=attention/);
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: '@techhumour' })).toHaveCount(1);
    await expect(rows.filter({ hasText: '@sigmagrindset' })).toHaveCount(1);
    await expect(rows.filter({ hasText: '@sigmagrindset' })).toContainText('overdue');

    await rows.filter({ hasText: '@sigmagrindset' }).getByRole('button', { name: '▶' }).click();
    await expect.poll(() => state.mutations.some(m => m.path.startsWith('/memescraper/scrapeNow?sourceAccountID='))).toBe(true);
    await expect(page.locator('.ot-top')).toContainText('Scraping @sigmagrindset');

    await rows.filter({ hasText: '@techhumour' }).click();
    await expect(page.locator('.ot-drawer')).toContainText('4 failed scrapes in a row');
    await page.waitForTimeout(400); // let the drawer finish sliding in before the screenshot
    await page.screenshot({ path: `${SHOTS}/sources-drawer-failing.png` });
});

test('library: search, sort, table view, reel drawer and CSV', async ({ page }) => {
    const state = await mockApi(page);
    await page.setViewportSize({ width: 1500, height: 1100 });
    await page.goto('/schemery/memescraper/library');

    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible(BOOT);
    await expect(page.locator('.libgrid .ms-reel')).toHaveCount(reelPages['30d'].Rows.length);
    await expect(page.locator('.ot-pagehead .subtitle')).toContainText(`${reelPages['30d'].Filtered.toLocaleString()} of ${reelPages['30d'].Total.toLocaleString()} reels`);
    await page.screenshot({ path: `${SHOTS}/library-grid.png`, fullPage: true });

    await page.getByLabel('Sort by').selectOption('views');
    await expect(page).toHaveURL(/sort=views/);
    await expect(page.locator('.libgrid .ms-reel').first()).toContainText(reelPages['30d-views'].Rows[0].Owner);

    await page.getByLabel('Search the library').fill('cat');
    await expect(page).toHaveURL(/q=cat/);
    expect(state.requests.some(r => r.includes('/memescraper/reels') && r.includes('q=cat'))).toBe(true);
    await page.getByLabel('Search the library').fill('');
    await expect(page).not.toHaveURL(/q=cat/);

    await page.getByRole('button', { name: 'Table' }).click();
    await expect(page).toHaveURL(/view=table/);
    await expect(page.locator('table.ot-table tbody tr')).toHaveCount(reelPages['30d-views'].Rows.length);
    await page.screenshot({ path: `${SHOTS}/library-table.png`, fullPage: true });

    await page.locator('table.ot-table tbody tr').first().click();
    const drawer = page.locator('.ot-drawer');
    await expect(drawer.getByText('Views', { exact: true })).toBeVisible();
    await expect(drawer).toContainText(`of ${reelDetails[reelPages['30d-views'].Rows[0].PostID].OwnerReels.toLocaleString()} reels`);
    await page.screenshot({ path: `${SHOTS}/reel-drawer.png` });
    await drawer.getByRole('button', { name: /Close/ }).click();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    expect((await download).suggestedFilename()).toMatch(/^memescraper-reels-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(state.requests.some(r => r.includes('/memescraper/reels') && r.includes('format=csv') && !r.includes('offset='))).toBe(true);
});

test('health: providers, runs, schedule settings and history filters', async ({ page }) => {
    const state = await mockApi(page);
    await page.setViewportSize({ width: 1500, height: 1200 });
    await page.goto('/schemery/memescraper/health');

    await expect(page.getByRole('heading', { name: 'Health' })).toBeVisible(BOOT);
    await expect(page.getByText('inflact.com').first()).toBeVisible();
    await expect(page.locator('.ot-rule.pass')).toHaveCount(2);
    await expect(page.locator('.ot-kpi').filter({ hasText: 'Library on disk' })).toContainText('3 missing');
    await expect(page.getByText('Scrape runs')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/health.png`, fullPage: true });

    await page.locator('#ms-interval').fill('12');
    await page.locator('.ms-switch').click();
    await page.getByRole('button', { name: 'Save schedule' }).click();
    await expect.poll(() => state.mutations.find(m => m.path === '/memescraper/saveSettings')?.body).toEqual({ paused: true, intervalHours: 12 });
    await expect(page.getByText('Scheduled scrapes are paused').first()).toBeVisible();

    await page.getByRole('group', { name: 'Outcome' }).getByRole('button', { name: 'Failed' }).click();
    await expect(page).toHaveURL(/status=failed/);
    const failedRows = page.locator('.ot-card').filter({ hasText: 'Scrape history' }).locator('tbody tr.clickable');
    await expect(failedRows).toHaveCount(histories['30d-failed'].Rows.length);
    await failedRows.first().click();
    await expect(page.locator('.detailrow')).toContainText('Error');
    await page.screenshot({ path: `${SHOTS}/health-failed-runs.png`, fullPage: true });
});

test('a guest sees analytics but no controls', async ({ page }) => {
    await mockApi(page, 1);
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto('/schemery/memescraper');
    await expect(page.getByRole('heading', { name: 'Reel scraper' })).toBeVisible(BOOT);
    await expect(page.locator('.ot-kpi').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Scrape all/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add source' })).toHaveCount(0);
});

test('phone width keeps the page usable', async ({ page }) => {
    await mockApi(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/schemery/memescraper');
    await expect(page.getByRole('heading', { name: 'Reel scraper' })).toBeVisible(BOOT);
    await expect(page.locator('.ms-bars svg')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/overview-phone.png`, fullPage: true });
});
