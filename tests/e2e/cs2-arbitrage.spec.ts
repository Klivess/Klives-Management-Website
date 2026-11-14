import { expect, test } from '@playwright/test';
import { openCs2 } from './fixtures/cs2-api';

/**
 * The CS2 Arbitrage console (.cs2x) against a fake of the bot shaped like the live server on 2026-11-13: buying off,
 * the Steam exit's bar at 888%, the Steam login dead for 16 days, one relist up 25 days that should have sold ~54 times,
 * and an exit model that turned down all but one of today's screen passes.
 */

test.describe('CS2 Arbitrage console', () => {
  test('says what the bot is doing and what needs Klives, from one batch', async ({ page }) => {
    const api = await openCs2(page);
    const verdict = page.getByTestId('cs2x-verdict');
    await expect(verdict).toContainText('Watching, not buying: auto-buy is off.');
    await expect(verdict).toContainText('the exit model passed 1 of 46 it checked today');
    await expect(verdict).toContainText('Auto-buy off');
    await expect(verdict).toContainText('Steam exit off (bar 888%)');
    await expect(page.getByTestId('need-stuck-buy-stuck')).toContainText('Relist not selling');
    await expect(page.getByTestId('need-steam-login')).toContainText('Steam login needs approving');

    // Status and the deal flow travel together; the analytics are the compact ones (no order books).
    await expect.poll(() => api.batchCalls.some((b) => b.includes('/cs2arbitragebot/status') && b.some((p) => p.startsWith('/cs2arbitragebot/opportunities')))).toBe(true);
    expect(api.requestedPaths).toContain('/cs2arbitragebot/getscanalytics?compact=1');
    expect(api.requestedPaths).not.toContain('/cs2arbitragebot/getscanalytics');

    await expect(page.getByTestId('kpi-bankroll')).toContainText('Steam stale');
    await expect(page.getByTestId('kpi-open')).toContainText('1 need you');
    await expect(page.getByTestId('kpi-made')).toContainText('+£0.40');
  });

  test('asks for a Steam login in one click and then says it is waiting for approval', async ({ page }) => {
    const api = await openCs2(page);
    await page.getByTestId('need-action-steam-login').click();
    await expect(page.getByTestId('cs2x-toast')).toContainText('Approve the sign-in request in the Steam app');
    expect(api.posts.map((p) => p.path)).toContain('/cs2arbitragebot/steam/login');
    await expect(page.getByTestId('need-steam-login')).toContainText('Steam login waiting for you', { timeout: 10_000 });
    await expect(page.getByTestId('steam-session')).toContainText('waiting for you');
  });

  test('a stuck relist is checked on CSFloat and settles into the track record', async ({ page }) => {
    const api = await openCs2(page);
    await page.getByTestId('need-action-stuck-buy-stuck').click();
    await expect(page.getByTestId('cs2x-toast')).toContainText('Sold and delivered');
    expect(api.posts.find((p) => p.path === '/cs2arbitragebot/positions/recheck')?.body).toEqual({ id: 'buy-stuck' });
    await expect(page.getByTestId('need-stuck-buy-stuck')).toHaveCount(0);
    const record = page.getByTestId('cs2x-record');
    await expect(record).toContainText('Sticker | Censored (Foil)');
    await expect(record).toContainText('inferred from listing');
    await expect(record).toContainText('made on 4 sales');
  });

  test('a position opens in its sheet with its lock, decision and timeline, and keeps the link', async ({ page }) => {
    await openCs2(page);
    await page.getByTestId('pos-buy-locked').click();
    const sheet = page.getByTestId('cs2x-sheet');
    await expect(sheet).toContainText('Sticker | Vitality (Holo) | Austin 2025');
    await expect(sheet.getByTestId('cs2-lock-note')).toContainText(/Trade-locked for 3d [34]h/);
    await expect(sheet).toContainText('planned at purchase');
    await expect(sheet.getByTestId('cs2-exit-decision')).toContainText('CSFloat at $0.92');
    await expect(sheet).toContainText('Trade protection lifts');
    await expect(page).toHaveURL(/pos=buy-locked/);

    // ] steps to the next position in the list; Esc closes and drops the link.
    await page.keyboard.press(']');
    await expect(sheet).not.toContainText('Austin 2025');
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(page).not.toHaveURL(/pos=/);
  });

  test('a shared link opens its position straight away', async ({ page }) => {
    await openCs2(page, { path: '/schemery/cs2arbitragebot?pos=buy-stuck' });
    const sheet = page.getByTestId('cs2x-sheet');
    await expect(sheet).toContainText('Sticker | Censored (Foil)');
    await expect(sheet.getByTestId('cs2-relist-state')).toContainText('54.4 expected sales passed');
  });

  test('closing a position by hand records the sale price and refuses a bad one', async ({ page }) => {
    const api = await openCs2(page, { path: '/schemery/cs2arbitragebot?pos=buy-stuck' });
    await page.getByTestId('sheet-close').click();
    const dialog = page.getByTestId('cs2x-close-dialog');
    await expect(dialog.getByTestId('close-price')).toHaveValue('2.94'); // pre-filled from the relist
    await dialog.getByTestId('close-price').fill('abc');
    await dialog.getByTestId('close-confirm').click();
    await expect(dialog).toContainText('Enter the price it sold for');
    expect(api.posts.filter((p) => p.path === '/cs2arbitragebot/positions/close')).toHaveLength(0);

    await dialog.getByTestId('close-price').fill('2.94');
    await dialog.getByTestId('close-note').fill('sold it myself');
    await dialog.getByTestId('close-confirm').click();
    await expect(dialog).toHaveCount(0);
    expect(api.posts.find((p) => p.path === '/cs2arbitragebot/positions/close')?.body).toEqual({ id: 'buy-stuck', note: 'sold it myself', soldForCents: 294 });
    await expect(page.getByTestId('cs2x-toast')).toContainText('sold for $2.94');
  });

  test('the deal flow separates the exit model\'s verdict from the quick screen', async ({ page }) => {
    await openCs2(page);
    const deals = page.getByTestId('cs2x-deals');
    await expect(deals.getByTestId('deals-buy')).toContainText('1');
    await expect(deals.getByTestId('deals-model')).toContainText('1');
    await expect(deals.getByTestId('deals-screen')).toContainText('1');

    const row = deals.getByTestId('deal-deal-luck');
    await expect(row).toContainText('+12.0%'); // the screen's estimate, struck through
    await expect(row).toContainText('-12.5%'); // the model's value
    await expect(row).toContainText('Rejected');
    await row.click();
    const detail = deals.getByTestId('deal-detail-deal-luck');
    await expect(detail).toContainText('Relist on CSFloat');
    await expect(detail).toContainText('~41d');
    await expect(detail).toContainText('Steam: Steam at £2.77');

    await deals.getByTestId('deals-buy').click();
    await expect(deals.getByTestId('deal-deal-ence')).toBeVisible();
    await expect(deals.getByTestId('deal-deal-luck')).toHaveCount(0);
    await deals.getByTestId('deals-all').click();
    await page.keyboard.press('/');
    await page.keyboard.type('mac-10');
    await expect(deals.getByTestId('deal-deal-mac')).toBeVisible();
    await expect(deals.getByTestId('deal-deal-ence')).toHaveCount(0);
  });

  test('the funnel, the balances and the engine say what the old page hid', async ({ page }) => {
    await openCs2(page);
    const funnel = page.getByTestId('cs2x-funnel');
    await expect(funnel.getByTestId('funnel-totals')).toContainText('of 46 confirmed by the model');
    await expect(funnel).toContainText('buying off × 1');
    await expect(funnel.getByTestId('funnel-note')).toContainText("exit model's own counts start");
    await expect(page.getByTestId('balance-carried')).toContainText('carries the last known £60.84 forward');
    const engine = page.getByTestId('cs2x-engine');
    await expect(engine.getByTestId('steam-misses')).toContainText('81 lookups saved');
    await expect(engine).toContainText('Souvenir PP-Bizon');
    await expect(engine).toContainText('loading positions and scan history');
    await expect(engine.getByTestId('engine-alert')).toHaveCount(2);
    await expect(engine.getByTestId('engine-alert').first()).toContainText('relist overdue');
    const model = page.getByTestId('cs2-exit-model');
    await expect(model).toContainText('lifts 07:00 UTC');
    await expect(model).toContainText('last 100 purchases and 0 sales');
  });

  test('the command palette jumps to a position', async ({ page }) => {
    await openCs2(page);
    await page.keyboard.press('Control+K');
    const palette = page.getByTestId('cs2x-palette');
    await palette.getByTestId('palette-input').fill('censored');
    await page.keyboard.press('Enter');
    await expect(palette).toHaveCount(0);
    await expect(page.getByTestId('cs2x-sheet')).toContainText('Sticker | Censored (Foil)');
  });

  test('a viewer sees the bot but none of the Klives-only controls', async ({ page }) => {
    await openCs2(page, { role: 'Guest' });
    await expect(page.getByTestId('cs2x-verdict')).toContainText('Watching, not buying');
    await expect(page.getByTestId('cs2x-scan')).toHaveCount(0);
    await expect(page.getByTestId('cs2x-settings-open')).toHaveCount(0);
    await expect(page.getByTestId('need-action-steam-login')).toHaveCount(0);
    await expect(page.getByTestId('need-action-stuck-buy-stuck')).toHaveCount(0);
    await page.getByTestId('pos-buy-stuck').click();
    await expect(page.getByTestId('cs2x-sheet')).toBeVisible();
    await expect(page.getByTestId('sheet-close')).toHaveCount(0);
  });

  test('while the bot starts it says so and waits instead of erroring', async ({ page }) => {
    const api = await openCs2(page, { scenario: 'starting' });
    await expect(page.getByTestId('cs2x-verdict')).toContainText('Starting up: loading positions and scan history.');
    await expect(page.getByTestId('cs2x-starting')).toBeVisible();
    // The first batch can't know yet; after it, only status is asked for, and never the history routes.
    await expect.poll(() => api.batchCalls.length, { timeout: 15_000 }).toBeGreaterThan(1);
    expect(api.batchCalls.slice(1).flat().filter((p) => !p.startsWith('/cs2arbitragebot/status'))).toEqual([]);
    expect(api.requestedPaths.filter((p) => /getscanalytics|scanresults|latestliquidityplan|balanceHistory/.test(p))).toEqual([]);
    await expect(page.getByTestId('cs2x-deals')).not.toContainText('starting up');
  });

  test('the Schemes card says what the exit model confirmed and that buying is off', async ({ page }) => {
    const api = await openCs2(page);
    // In-app navigation (a second goto can exhaust the dev server's sockets).
    await page.getByLabel('Back to schemes').click();
    const card = page.locator('.scheme-card', { hasText: 'CS2 Arbitrage Bot' });
    await expect(card).toContainText('Watching');
    await expect(card).toContainText('Worth buying');
    await expect(card.locator('.stat-item', { hasText: 'Worth buying' })).toContainText('1');
    await expect(card).not.toContainText('4,543');
    expect(api.requestedPaths.filter((p) => p.startsWith('/cs2arbitragebot/getscanalytics')).every((p) => p.includes('compact=1'))).toBe(true);
  });

  test('an older bot build degrades: no funnel counts, and new actions explain themselves', async ({ page }) => {
    await openCs2(page, { scenario: 'legacy' });
    await expect(page.getByTestId('funnel-totals')).toContainText('model not counted yet');
    await page.getByTestId('need-action-steam-login').click();
    await expect(page.getByTestId('cs2x-toast')).toContainText('does not have that yet');
  });
});
