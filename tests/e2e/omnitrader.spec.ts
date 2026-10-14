import { expect, test, type Page } from '@playwright/test';
import {
    BOOT, SHOTS, alphaCandidates, alphaIdeas, alphaPapers, labBacktests, load, mockApi, orderBook, studioList,
} from './fixtures/omnitrader-api';

const fixed = (v: number, d: number) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

/** OmniTrader terminal pages against engine-generated fixtures; screenshots land in test-results/omnitrader/. */

test.describe.configure({ timeout: 150_000 });

test.beforeEach(async ({ context }) => {
    const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '4173'}`).origin;
    await context.addCookies([{ name: 'km_session', value: 'kms_e2e', url: origin }]);
});

/** Charts and grids paint after their data lands; give them a beat before capturing. */
async function shot(page: Page, name: string, fullPage = false) {
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage });
}

async function command(page: Page, text: string) {
    const input = page.locator('.ot-cmd input');
    await input.click();
    await input.fill(text);
    await input.press('Enter');
}

test('monitor, command line and security tabs', async ({ page }) => {
    const state = await mockApi(page);
    await page.setViewportSize({ width: 1680, height: 1050 });
    await page.goto('/omnitrader');

    await expect(page.getByRole('heading', { name: /Market monitor/ })).toBeVisible(BOOT);
    await expect(page.locator('.ot-terminal')).toBeVisible();
    await expect(page.locator('.ot-statbar').first()).toContainText('S&P 500');
    await expect(page.locator('.ot-panel').filter({ hasText: 'Indices' }).locator('tbody tr').first()).toBeVisible();
    await expect(page.locator('.ot-panel').filter({ hasText: 'Crypto market' })).toContainText('Fear & Greed');
    await expect(page.locator('.ot-panel').filter({ hasText: 'US Treasury curve' }).locator('svg')).toBeVisible();
    await expect(page.locator('.ot-panel').filter({ hasText: 'Headlines' })).toContainText('Fixture headline 1');
    await expect(page.locator('.ot-tape .item').first()).toBeVisible();
    await shot(page, 'monitor', true);

    // Panel visibility is a persisted toggle.
    await page.locator('details.ot-menu').filter({ hasText: 'Panels' }).locator('summary').click();
    await page.locator('.pop label').filter({ hasText: 'Headlines' }).locator('input').uncheck();
    await expect(page.locator('.ot-panel').filter({ hasText: 'Headlines' })).toBeHidden();

    // Command line: SECURITY + FUNCTION.
    await command(page, 'BTCUSDT GP');
    await expect(page).toHaveURL(/instrument\?symbol=BTCUSDT&tab=GP/);
    await expect(page.locator('.otc-host canvas').first()).toBeVisible(BOOT);
    await expect(page.locator('.otc-legend.main')).toContainText('BTCUSDT');
    await expect(page.locator('.otc-legend.main')).toContainText('EMA');
    await expect(page.locator('.otc-legend.pane').first()).toContainText('RSI');
    expect(state.posts.some(r => r.path.startsWith('/api/omnitrader/terminal/chart') && r.body?.Indicators?.length === 3)).toBe(true);
    await shot(page, 'chart');

    // Interval change re-requests; a formula overlay is added.
    await page.locator('.otc-bar .ot-segment').first().getByRole('button', { name: '4h' }).click();
    await expect.poll(() => state.posts.some(r => r.body?.Interval === 'FourHour')).toBe(true);
    await page.locator('.otc-bar').getByRole('button', { name: '+ Formula' }).click();
    await page.locator('.otc-formulas input').first().fill('crossover(ema(close, 20), ema(close, 50))');
    await page.locator('.otc-formulas').getByRole('button', { name: 'Apply' }).click();
    await expect.poll(() => state.posts.some(r => r.body?.Formulas?.length === 1)).toBe(true);
    await expect(page.locator('.otc-legend.main')).toContainText('F1');
    await shot(page, 'chart-formula');

    // Indicator picker adds a study.
    await page.locator('.otc-bar').getByRole('button', { name: /Indicators/ }).click();
    await page.locator('.picker input').fill('macd');
    await page.locator('.picker .row').first().click();
    await expect.poll(() => state.posts.some(r => r.body?.Indicators?.some((i: any) => i.Id === 'macd'))).toBe(true);
    await expect(page.locator('.otc-legend.pane').filter({ hasText: 'MACD' })).toBeVisible();

    // Stats and seasonality.
    await page.getByRole('tab', { name: /HP/ }).click();
    await expect(page.locator('.ot-panel').filter({ hasText: 'Trailing returns' })).toContainText('1Y');
    await expect(page.locator('.ot-panel').filter({ hasText: 'Realised volatility cone' }).locator('tbody tr')).not.toHaveCount(0);
    await shot(page, 'security-hp', true);
    await page.getByRole('tab', { name: /SEAS/ }).click();
    await expect(page.locator('.othm').first()).toContainText('Jan');
    await shot(page, 'security-seas', true);
    await page.getByRole('tab', { name: /DER/ }).click();
    await expect(page.locator('.ot-panel').filter({ hasText: 'Cross-venue funding' })).toContainText('OKX');
    await shot(page, 'security-der', true);

    // Order book: a mirrored ladder at the engine's grouping, prices to the grouping's decimals, real spread.
    await page.getByRole('tab', { name: /DES/ }).click();
    const book = page.locator('.book');
    await expect(book.locator('.side.bid .lvl')).toHaveCount(orderBook.Bids.length, BOOT);
    await expect(book.locator('.side.ask .lvl')).toHaveCount(orderBook.Asks.length);
    await expect(book.locator('.side.bid .lvl').first().locator('.p')).toHaveText(fixed(orderBook.Bids[0][0], 1));
    await expect(book.locator('.side.ask .lvl').first().locator('.p')).toHaveText(fixed(orderBook.Asks[0][0], 1));
    await expect(book.locator('.side.bid .lvl').nth(2).locator('.t')).toHaveText(fixed(orderBook.Bids[2][2], 5));
    await expect(book.locator('.bookhead')).toContainText('Spread 0.01');
    await expect(book.locator('.bookhead')).toContainText('0.0012 bps');
    // ±0.5% is beyond what the snapshot reaches: a lower bound, marked as such.
    await expect(book.locator('.bands td.partial').first()).toContainText('≥');
    await shot(page, 'security-orderbook', true);
    await page.locator('.ot-panel').filter({ hasText: 'Order book' }).locator('select').first().selectOption('1');
    await expect.poll(() => state.requests.some(r => r.includes('/terminal/crypto/orderbook') && r.includes('group=1'))).toBe(true);
    expect(state.errors, state.errors.join('\n')).toEqual([]);
});

test('screener, crypto, macro, news and alerts', async ({ page }) => {
    const state = await mockApi(page);
    await page.setViewportSize({ width: 1680, height: 1050 });
    await page.goto('/omnitrader/screener');
    await expect(page.getByRole('heading', { name: /Screener/ })).toBeVisible(BOOT);
    await page.getByRole('button', { name: /Run/ }).click();
    const rows = page.locator('.ot-panel').filter({ hasText: 'Results' }).locator('tbody tr');
    await expect(rows).toHaveCount(load('screener-result').Rows.length);
    expect(state.posts.some(r => r.path.startsWith('/api/omnitrader/terminal/screener/run'))).toBe(true);
    await shot(page, 'screener', true);

    await command(page, 'CRYPTO');
    await expect(page.getByRole('heading', { name: /Crypto market/ })).toBeVisible();
    await expect(page.locator('.ot-panel').filter({ hasText: 'Top coins' }).locator('tbody tr')).toHaveCount(load('crypto-coins').length);
    await shot(page, 'crypto', true);

    await command(page, 'YC');
    await expect(page.locator('.ot-panel').filter({ hasText: 'Curve' }).locator('svg').first()).toBeVisible();
    await shot(page, 'macro-curve', true);
    await command(page, 'CORR SPY TLT GLD');
    await expect(page.locator('.othm')).toBeVisible();
    await shot(page, 'macro-corr', true);

    await command(page, 'N');
    await expect(page.locator('.news li')).toHaveCount(load('news').length);

    await command(page, 'ALERTS');
    await expect(page.locator('.ot-panel').filter({ hasText: 'Alerts' }).locator('tbody tr')).toHaveCount(load('alerts').length);
    await page.locator('.form input.up').fill('ethusdt');
    await page.locator('.form .presets .ot-chip').filter({ hasText: 'rsi(14) < 30' }).click();
    await page.getByRole('button', { name: 'Test' }).click();
    await expect(page.locator('.test')).toContainText('true on 120');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => state.posts.find(r => r.path.startsWith('/api/omnitrader/terminal/alert/save'))?.body?.Condition).toBe('rsi(14) < 30');
    await shot(page, 'alerts', true);
    expect(state.errors, state.errors.join('\n')).toEqual([]);
});

test('studio: blueprint and script editors, quick test', async ({ page }) => {
    const state = await mockApi(page);
    await page.setViewportSize({ width: 1720, height: 1080 });
    const blueprint = studioList.find((s: any) => s.Kind === 'Blueprint' && s.Author === 'klives');
    const script = studioList.find((s: any) => s.Kind === 'Script');
    await page.goto(`/omnitrader/studio?id=${blueprint.Id}`);

    await expect(page.locator('.studio .li')).toHaveCount(studioList.length, BOOT);
    await expect(page.locator('.edhead input.name')).toHaveValue(blueprint.Name);
    await expect(page.locator('.otbp')).toContainText('Enter long');
    await expect(page.locator('.otbp .otop').first()).toBeVisible();
    await shot(page, 'studio-blueprint', true);

    await page.getByRole('button', { name: /Quick test/ }).click();
    await expect(page.locator('.otbr .ot-statbar')).toContainText('Sharpe');
    expect(state.posts.some(r => r.path.startsWith('/api/omnitrader/studio/quick-test') && r.body?.Draft?.Kind === 'Blueprint')).toBe(true);
    await shot(page, 'studio-quicktest', true);

    await page.locator('.studio .li').filter({ hasText: script.Name }).click();
    await expect(page.locator('.cm-editor')).toBeVisible();
    await expect(page.locator('.cm-content')).toContainText('class');
    // Token colours survive the terminal's colour-inherit reset.
    await expect(page.locator('.cm-content .tok-keyword').first()).toHaveCSS('color', 'rgb(245, 165, 36)');
    await expect(page.locator('.cm-content .tok-string').first()).toHaveCSS('color', 'rgb(38, 194, 129)');
    await shot(page, 'studio-script', true);
    expect(state.errors, state.errors.join('\n')).toEqual([]);
});

test('lab blotter, job report, compare and study', async ({ page }) => {
    const state = await mockApi(page);
    await page.setViewportSize({ width: 1720, height: 1080 });
    await page.goto('/omnitrader/lab');
    const rows = page.locator('.ot-panel').filter({ hasText: 'Backtests' }).locator('tbody tr');
    await expect(rows).toHaveCount(labBacktests.Rows.length, BOOT);
    await shot(page, 'lab-backtests', true);

    await rows.nth(1).locator('td').nth(2).click();
    const drawer = page.locator('.ot-drawer');
    await expect(drawer.locator('.otbr .ot-statbar')).toContainText('CAGR');
    await drawer.getByRole('button', { name: 'Trades' }).click();
    await expect(drawer.locator('.otbr tbody tr').first()).toBeVisible();
    await shot(page, 'lab-job');
    await drawer.getByRole('button', { name: /Close/ }).click();

    await rows.nth(0).locator('input[type=checkbox]').check();
    await rows.nth(1).locator('input[type=checkbox]').check();
    await page.locator('.ot-toolbar').getByRole('button', { name: /Compare 2/ }).click();
    await expect(page.locator('.ot-panel').filter({ hasText: 'Metrics' }).locator('tbody tr')).toHaveCount(2);
    await shot(page, 'lab-compare', true);

    await page.getByRole('button', { name: 'Studies', exact: true }).click();
    await page.locator('.ot-panel').filter({ hasText: 'Studies' }).locator('tbody tr').first().click();
    await expect(page.locator('.othm')).toBeVisible();
    await expect(page.locator('.ot-statbar')).toContainText('Deflated Sharpe');
    await shot(page, 'lab-study', true);
    expect(state.errors, state.errors.join('\n')).toEqual([]);
});

test('alpha lab: papers, paper drawer, candidate evaluation', async ({ page }) => {
    const state = await mockApi(page);
    await page.setViewportSize({ width: 1680, height: 1050 });
    await page.goto('/omnitrader/research');
    await expect(page.getByRole('heading', { name: /Alpha Lab/ })).toBeVisible(BOOT);
    const rows = page.locator('.ot-panel').filter({ hasText: 'Papers' }).locator('tbody tr');
    await expect(rows).toHaveCount(alphaPapers.Rows.length);
    await shot(page, 'alpha-papers', true);

    const top = [...alphaPapers.Rows].sort((a: any, b: any) => b.Relevance - a.Relevance)[0];
    await rows.filter({ hasText: top.Title }).click();
    const drawer = page.locator('.ot-drawer');
    await expect(drawer).toContainText(top.Title);
    await expect(drawer.getByRole('button', { name: 'Analyse now' })).toBeVisible();
    await shot(page, 'alpha-paper');
    await drawer.getByRole('button', { name: /Close/ }).click();

    await page.getByRole('button', { name: 'candidates', exact: true }).click();
    const crow = page.locator('.ot-panel').filter({ hasText: 'Candidates' }).locator('tbody tr');
    await expect(crow).toHaveCount(alphaCandidates.length);
    await crow.first().click();
    await expect(drawer).toContainText('Deflated SR');
    await expect(drawer.locator('.findings li').first()).toBeVisible();
    await shot(page, 'alpha-candidate');
    await drawer.getByRole('button', { name: /Close/ }).click();

    // A synthesis: a C# strategy drawing on two papers, measured against its single-paper part.
    const synth = alphaCandidates.find((c: any) => c.Synthesis);
    await expect(crow.filter({ hasText: synth.StrategyName })).toContainText(`⊕ ${synth.PaperIds.length} papers`);
    await crow.filter({ hasText: synth.StrategyName }).click();
    await expect(drawer).toContainText(`Synthesis of ${synth.PaperIds.length} papers`);
    await expect(drawer).toContainText('C# strategy');
    await expect(drawer).toContainText('Against its single-paper parts');
    await expect(drawer.locator('.findings')).toContainText('vs parts:');
    await shot(page, 'alpha-synthesis');
    await drawer.getByRole('button', { name: /Close/ }).click();

    // The idea library: pick ideas from two different papers and ask for a synthesis.
    await page.getByRole('button', { name: 'ideas', exact: true }).click();
    const irow = page.locator('.ot-panel').filter({ hasText: 'Idea library' }).locator('tbody tr');
    await expect(irow).toHaveCount(alphaIdeas.Rows.length);
    const firstPerPaper = new Map<string, any>();
    for (const i of alphaIdeas.Rows) if (!firstPerPaper.has(i.PaperId)) firstPerPaper.set(i.PaperId, i);
    const [a, b] = [...firstPerPaper.values()];
    await page.getByRole('button', { name: `Combine ${a.Name}` }).click();
    await page.getByRole('button', { name: `Combine ${b.Name}` }).click();
    await expect(page.locator('.tray')).toContainText('2 papers');
    await shot(page, 'alpha-ideas', true);
    await page.locator('.tray').getByRole('button', { name: 'Synthesise' }).click();
    await page.getByRole('button', { name: 'Send' }).click();
    await expect.poll(() => state.posts.find(r => r.path.startsWith('/api/omnitrader/alpha/synthesise'))?.body?.IdeaIds).toEqual([a.Id, b.Id]);
    await expect(page.locator('.tray')).toBeHidden();
    expect(state.errors, state.errors.join('\n')).toEqual([]);
});
