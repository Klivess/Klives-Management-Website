import { expect, test, type Page } from '@playwright/test';
import { BOOT } from './fixtures/omnitrader-api';
import { mockDeployApi } from './fixtures/deploy-api';

/** The OmniTrader Deploy console against engine-exported fixtures; screenshots land in test-results/omnitrader-deploy/. */

const SHOTS = 'test-results/omnitrader-deploy';
test.describe.configure({ timeout: 150_000 });

test.beforeEach(async ({ context }) => {
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '4173'}`).origin;
  await context.addCookies([{ name: 'km_session', value: 'kms_e2e', url: origin }]);
});

async function shot(page: Page, name: string, fullPage = false) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage });
}

function realErrors(errors: string[]) {
  // The shell's own polls to routes no fixture covers are not this page's errors.
  return errors.filter(e => !/Failed to load resource|favicon/i.test(e));
}

test('the page says which deployment is not working', async ({ page }) => {
  const state = await mockDeployApi(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/omnitrader/strategies');

  await expect(page.getByTestId('dpl-root')).toBeVisible(BOOT);
  const verdict = page.getByTestId('dpl-verdict');
  await expect(verdict).toContainText('ETF momentum basket: no orders in 143 bars');
  await expect(page.getByTestId('kpi-running')).toContainText('2');
  await expect(page.getByTestId('kpi-health')).toContainText('1');
  await expect(page.getByTestId('kpi-ready')).toContainText('2');

  // Active view: the quiet basket first, flagged; the stopped one hidden until asked for.
  const quiet = page.getByTestId('dpl-row-a1b2c3d4e5f60718293a4b5c6d7e8f90');
  await expect(quiet).toBeVisible();
  await expect(page.getByTestId('dpl-health-a1b2c3d4e5f60718293a4b5c6d7e8f90')).toHaveText(/No orders in 143 bars/);
  await expect(page.getByTestId('dpl-row-99887766554433221100ffeeddccbbaa')).toHaveCount(0);
  await page.getByTestId('dpl-fleet-all').click();
  await expect(page.getByTestId('dpl-row-99887766554433221100ffeeddccbbaa')).toBeVisible();

  // The healthy one is compared with its backtest's pace.
  await expect(page.getByTestId('dpl-row-0f1e2d3c4b5a69788796a5b4c3d2e1f0')).toContainText('Trading: 6 orders');

  // Deployments come in one /batch, not one request per route.
  expect(state.requests.some(r => r.startsWith('GET /api/omnitrader/deployments'))).toBe(false);
  await shot(page, 'overview', true);
  expect(realErrors(state.errors), state.errors.join('\n')).toEqual([]);
});

test('a candidate deploys on the settings it was tested on', async ({ page }) => {
  const state = await mockDeployApi(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/omnitrader/strategies');
  await expect(page.getByTestId('dpl-picker')).toBeVisible(BOOT);

  // Recommended first: the Promoted gold strategy, then the Promising trend one.
  const picks = page.locator('.dpl-pick');
  await expect(picks).toHaveCount(2);
  await expect(picks.first()).toContainText('Gold MACD exits');
  await page.getByTestId('dpl-view-all').click();
  await expect(picks).toHaveCount(4);
  await page.getByTestId('dpl-picker-search').fill('trend');
  await expect(picks).toHaveCount(1);
  await picks.first().click();

  const plan = page.getByTestId('dpl-plan');
  await expect(plan).toBeVisible();
  await expect(page).toHaveURL(/candidate=ac_trend/);
  await expect(page.getByTestId('dpl-plan-verdict')).toContainText('Ready to deploy as tested');
  await expect(page.getByTestId('dpl-interval-FourHour')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('dpl-plan-symbol')).toHaveValue('ETHUSDT');
  await expect(page.getByTestId('dpl-check-version')).toContainText('Pinned to v2');
  await expect(page.getByTestId('dpl-check-fees')).toContainText('0.26 %');
  await expect(plan).toContainText('About 5 trades a month');
  await shot(page, 'plan');

  // Leaving the tested interval re-plans on the server and warns.
  await page.getByTestId('dpl-interval-OneHour').click();
  await expect(page.getByTestId('dpl-check-interval')).toContainText('Tested on 4h bars, set to 1h');
  await expect(page.getByTestId('dpl-plan-verdict')).toContainText('1 thing to know');
  expect(state.planRequests.at(-1)?.get('interval')).toBe('OneHour');
  await page.getByTestId('dpl-interval-FourHour').click();
  await expect(page.getByTestId('dpl-check-interval')).toHaveCount(0);

  // Deploy → confirm → the server gets the plan's request.
  await page.getByTestId('dpl-plan-deploy').click();
  const confirm = page.getByTestId('dpl-confirm-deploy');
  await expect(confirm).toContainText('ETHUSDT · 4h bars');
  await shot(page, 'confirm');
  await page.getByTestId('dpl-confirm-deploy-go').click();

  await expect.poll(() => state.posts.find(p => p.path.startsWith('/api/omnitrader/deployment/create'))?.body).toBeTruthy();
  const sent = state.posts.find(p => p.path.startsWith('/api/omnitrader/deployment/create'))!.body;
  expect(sent.StrategyClass).toBe('studio:st_trend@v2');
  expect(sent.Interval).toBe('FourHour');
  expect(sent.Symbol).toBe('ETHUSDT');
  expect(sent.Mode).toBe('Paper');
  expect(sent.FeeFraction).toBeCloseTo(0.0026, 6);
  expect(sent.Parameters.TradeSymbol).toBe('ETHUSDT');
  expect(sent.Origin.CandidateId).toBe('ac_trend');
  expect(sent.Origin.BarsPerTrade).toBeGreaterThan(0);

  await expect(page.getByTestId('dpl-toast').first()).toContainText('Deployed on paper');
  await expect(page.getByTestId('dpl-sheet')).toBeVisible();
  await expect(page.getByTestId('dpl-sheet-health')).toContainText('Waiting for data');
  expect(realErrors(state.errors), state.errors.join('\n')).toEqual([]);
});

test('the Alpha Lab link opens a plan, and live is refused where it cannot work', async ({ page }) => {
  const state = await mockDeployApi(page);
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto('/omnitrader/strategies?candidate=ac_gold');

  await expect(page.getByTestId('dpl-plan')).toBeVisible(BOOT);
  await expect(page.getByTestId('dpl-plan')).toContainText('Gold MACD exits');
  await expect(page.getByTestId('dpl-mode-Live')).toBeDisabled();
  await expect(page.getByTestId('dpl-plan')).toContainText('Kraken spot only');
  // Edited in the Studio since it was tested: the plan still runs the tested version.
  await expect(page.getByTestId('dpl-check-version')).toContainText('Runs v2, the version that was tested');

  // A basket shows its symbols and loads enough history for its longest lookback.
  await page.getByTestId('dpl-plan-back').click();
  await page.getByTestId('dpl-view-all').click();
  await page.getByTestId('dpl-pick-studio:st_etf').click();
  await expect(page.getByTestId('dpl-plan')).toContainText('SPY · QQQ · IWM · BTCUSDT');
  await expect(page.getByTestId('dpl-check-warmup')).toContainText('Loads 556 bars');
  await expect(page.getByTestId('dpl-check-lab')).toContainText('Not evaluated by the Alpha Lab');
  expect(realErrors(state.errors), state.errors.join('\n')).toEqual([]);
});

test('a live deployment arms only after the symbol is typed', async ({ page }) => {
  const state = await mockDeployApi(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/omnitrader/strategies?candidate=ac_trend');
  await expect(page.getByTestId('dpl-plan')).toBeVisible(BOOT);

  await page.getByTestId('dpl-mode-Live').click();
  await expect(page.getByTestId('dpl-check-live')).toContainText('Starts disarmed');
  await page.getByTestId('dpl-plan-deploy').click();
  await expect(page.getByTestId('dpl-confirm-deploy')).toContainText('real money');
  await page.getByTestId('dpl-confirm-deploy-go').click();
  await expect.poll(() => state.posts.some(p => p.path.startsWith('/api/omnitrader/deployment/create') && p.body?.Mode === 'Live')).toBe(true);
  const live = state.posts.find(p => p.body?.Mode === 'Live')!.body;
  expect(live.MaxPositionQuoteUsd).toBe(live.InitialQuoteBalance);   // caps follow the capital
  expect(live.MaxDailyLossUsd).toBeCloseTo(live.InitialQuoteBalance * 0.05, 2);
  expect(live.AllowedSymbols).toEqual(['ETHUSDT']);

  await page.getByTestId('dpl-sheet').getByRole('button', { name: 'Arm…' }).click();
  const arm = page.getByTestId('dpl-confirm-arm');
  await expect(arm).toBeVisible();
  await expect(page.getByTestId('dpl-arm-go')).toBeDisabled();
  await page.getByTestId('dpl-arm-text').fill('btcusdt');
  await expect(page.getByTestId('dpl-arm-go')).toBeDisabled();
  await page.getByTestId('dpl-arm-text').fill('ethusdt');
  await page.getByTestId('dpl-arm-go').click();
  await expect.poll(() => state.posts.some(p => p.path.includes('/deployment/arm-live'))).toBe(true);
  const armPost = state.posts.find(p => p.path.includes('/deployment/arm-live'))!;
  const id = new URL(armPost.path, 'https://x').searchParams.get('id');
  expect(new URL(armPost.path, 'https://x').searchParams.get('confirm')).toBe(id);
  expect(realErrors(state.errors), state.errors.join('\n')).toEqual([]);
});

test('the sheet shows equity, holdings and fill prices, and stopping asks first', async ({ page }) => {
  const state = await mockDeployApi(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/omnitrader/strategies');
  await page.getByTestId('dpl-row-0f1e2d3c4b5a69788796a5b4c3d2e1f0').click(BOOT);

  const sheet = page.getByTestId('dpl-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.dpl-curve__line')).toBeVisible();
  await expect(sheet.locator('.dpl-curve__pace')).toBeVisible();
  await expect(sheet).toContainText('ETHUSDT');
  await expect(page.getByTestId('dpl-sheet-trades')).toContainText('3,100.0000');
  await expect(sheet).toContainText('Alpha Lab');
  expect(state.requests.some(r => r.includes('/deployment/equity') && r.includes('points=600'))).toBe(true);
  await shot(page, 'sheet');

  await sheet.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByTestId('dpl-confirm-act')).toContainText('start it again from where it stopped');
  await page.getByTestId('dpl-confirm-act-go').click();
  await expect.poll(() => state.posts.some(p => p.path.includes('/deployment/kill'))).toBe(true);
  await expect(page.getByTestId('dpl-sheet-health')).toContainText('Stopped');

  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  expect(realErrors(state.errors), state.errors.join('\n')).toEqual([]);
});

test('the palette deploys by name, and the page fits a phone', async ({ page }) => {
  const state = await mockDeployApi(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/omnitrader/strategies');
  await expect(page.getByTestId('dpl-picker')).toBeVisible(BOOT);

  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('dpl-palette')).toBeVisible();
  await expect(page.locator('.ot-cmd .menu, .ot-cmd [role="listbox"]')).toHaveCount(0);   // the shell's command menu stays shut
  await page.getByTestId('dpl-palette-input').fill('gold');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dpl-plan')).toContainText('Gold MACD exits');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('dpl-plan')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), { timeout: 5_000 }).toBeLessThanOrEqual(1);
  await shot(page, 'phone', true);
  expect(realErrors(state.errors), state.errors.join('\n')).toEqual([]);
});

test('before the backend deploy: the page still shows deployments and says why it cannot plan', async ({ page }) => {
  const state = await mockDeployApi(page, { legacy: true });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/omnitrader/strategies');

  await expect(page.getByTestId('dpl-root')).toBeVisible(BOOT);
  // Rows without Health read as their status; names fall back to the class.
  await expect(page.getByTestId('dpl-row-0f1e2d3c4b5a69788796a5b4c3d2e1f0')).toContainText('studio:st_trend@v2');
  await expect(page.getByTestId('dpl-health-0f1e2d3c4b5a69788796a5b4c3d2e1f0')).toHaveText(/Running/);
  await expect(page.getByTestId('dpl-verdict')).toContainText('2 deployments running normally');
  await expect(page.getByTestId('dpl-picker')).toContainText('does not have the deploy catalog yet');

  // A deep link from the Alpha Lab says the same rather than spinning.
  await page.goto('/omnitrader/strategies?candidate=ac_trend');
  await expect(page.getByTestId('dpl-plan')).toContainText('does not build deploy plans yet');
  expect(realErrors(state.errors).filter(e => !/404/.test(e)), state.errors.join('\n')).toEqual([]);
});
