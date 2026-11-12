import { expect, test, type Page } from '@playwright/test';
import { openLlm } from './fixtures/klivellm-api';
import { blankScenario, llmUsd, simulateCost } from '../../scripts/kliveLlm';

/**
 * The KliveLLM console against a fake of the /klivellm routes (fixtures/klivellm-api.ts).
 * What it must do: show which service sends what to which router and model; let a route be
 * changed with a preview first; zoom the window in and out; price recorded tokens at other rates;
 * open any call; and read little while nobody is looking.
 */

async function hide(page: Page, hidden: boolean) {
  await page.evaluate(value => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (value ? 'hidden' : 'visible') });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

const horizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('KliveLLM console', () => {
  test('shows every service, where its calls went, and what is in flight', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const api = await openLlm(page);

    await expect(page.getByTestId('llx-verdict')).toBeVisible();
    await expect(page.getByTestId('kpi-calls')).toContainText(/\d/);
    await expect(page.getByTestId('kpi-cost')).toContainText('$');

    // The routing map: lanes on the left, routers in the middle, models on the right.
    const map = page.locator('.llx-flow__svg');
    await expect(map).toContainText('Projects › Commander');
    await expect(map).toContainText('AIRouter');
    await expect(map).toContainText('Qwen3.8');
    // Stratum's own service route sends it to OpenRouter's Sonnet.
    await expect(map).toContainText('anthropic/claude-sonnet-5');
    await expect(page.getByTestId('llx-inflight')).toContainText('Commander');
    // A lane label from the routing catalogue when the live feed has none (an older server).
    await expect(page.getByTestId('llx-inflight')).toContainText('Studio agents');

    // The overview rides in a batch with everything else, never as a GET of its own.
    await expect.poll(() => api.batchCalls.length).toBeGreaterThanOrEqual(1);
    expect(api.batchCalls[0].some(p => p.startsWith('/klivellm/overview?'))).toBe(true);
    expect(api.directGets.filter(p => p.startsWith('/klivellm/overview'))).toEqual([]);

    // Ctrl+K finds a tab by a few letters of it.
    await page.keyboard.press('Control+k');
    await expect(page.getByTestId('llx-palette')).toBeVisible();
    await page.keyboard.type('routing');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('llx-routing')).toBeVisible();

    await expect.poll(() => horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect.poll(() => horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => horizontalOverflow(page)).toBeLessThanOrEqual(1);

    // The page asked only for routes the server has.
    expect(api.unknownPaths.filter(p => p.startsWith('/klivellm/'))).toEqual([]);
  });

  test('routes a lane to another router: preview first, then apply, and the map follows', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const api = await openLlm(page);
    await page.getByTestId('tab-routing').click();

    const row = page.getByTestId('route-Projects/commander');
    await expect(row).toContainText('AIRouter');
    await page.getByTestId('lane-router-Projects/commander').selectOption('openrouter');

    const pending = page.getByTestId('routing-pending');
    await expect(pending).toContainText('1 unsaved change');
    await expect(page.getByTestId('tab-routing')).toContainText('1 unsaved');

    await pending.getByTestId('routing-review').click();
    const dialog = page.getByTestId('routing-preview');
    await expect(dialog).toContainText('Projects › Commander');
    await expect(dialog).toContainText('OpenRouter');
    // Projects holds warm sessions on AIRouter: the preview says they go cold once.
    await expect(dialog).toContainText('warm session');
    expect(api.posts.some(p => p.path === '/klivellm/routing/apply')).toBe(false);

    await dialog.getByTestId('routing-note').fill('Commander to OpenRouter for the weekend');
    await dialog.getByTestId('routing-apply').click();
    await expect(page.getByText('Routing saved as revision 2.')).toBeVisible();
    await expect(page.getByTestId('routing-pending')).toHaveCount(0);

    const apply = api.posts.find(p => p.path === '/klivellm/routing/apply')!;
    expect(apply.body.baseRevision).toBe(1);
    expect(apply.body.document.lanes['Projects/commander'].router).toBe('openrouter');
    expect(apply.body.note).toBe('Commander to OpenRouter for the weekend');

    await expect(row).toContainText('OpenRouter');
    await expect(page.getByTestId('routing-history')).toContainText('r2');
    await expect(page.getByTestId('routing-history')).toContainText('Commander to OpenRouter for the weekend');

    await page.getByTestId('tab-overview').click();
    await expect(page.locator('.llx-flow__svg')).toContainText('openai/gpt-5-mini');
  });

  test('zooms the window in and out, and every read follows it', async ({ page }) => {
    const api = await openLlm(page);
    await page.getByTestId('range-7d').click();
    await expect(page.getByTestId('window-label')).toHaveText('Last 7d');
    await expect(page).toHaveURL(/range=7d/);
    await expect.poll(() => api.requestedPaths.some(p => p.startsWith('/klivellm/overview?range=7d'))).toBe(true);

    await page.getByTestId('zoom-in').click();
    await expect(page).toHaveURL(/[?&]from=\d+/);
    await expect.poll(() => api.requestedPaths.filter(p => p.startsWith('/klivellm/overview?from=')).length).toBeGreaterThan(0);
    const zoomed = new URL(api.requestedPaths.filter(p => p.startsWith('/klivellm/overview?from=')).pop()!, 'https://klive.dev');
    const span = Number(zoomed.searchParams.get('to')) - Number(zoomed.searchParams.get('from'));
    expect(span).toBeGreaterThan(3.4 * 86_400_000);
    expect(span).toBeLessThan(3.6 * 86_400_000);

    await page.getByTestId('zoom-out').click();
    await page.getByTestId('zoom-back').click();
    await page.getByTestId('zoom-back').click();
    await expect(page.getByTestId('window-label')).toHaveText('Last 7d');
  });

  test('prices the recorded tokens at other rates in the simulator', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const api = await openLlm(page);
    await page.getByTestId('tab-costs').click();
    const sim = page.getByTestId('llx-simulator');
    await expect(sim.getByTestId('sim-recorded')).toContainText('calls');
    await expect.poll(() => api.lastSimulator != null).toBe(true);

    await sim.getByTestId('scenario-0-input').fill('3');
    await sim.getByTestId('scenario-0-output').fill('15');
    const totals = api.lastSimulator.totals;
    const scenario = { ...blankScenario('a', 'A'), input: 3, output: 15 };
    await expect(sim.getByTestId('scenario-0-cost')).toHaveText(llmUsd(simulateCost(totals, scenario).costUsd));

    // No cache at all costs more: every prompt token is billed as fresh input.
    await sim.getByTestId('scenario-0').locator('select').nth(1).selectOption('none');
    await expect(sim.getByTestId('scenario-0-cost')).toHaveText(llmUsd(simulateCost(totals, { ...scenario, cache: 'none' }).costUsd));

    // A second scenario loads a model's prices from the price book.
    await sim.getByTestId('scenario-add').click();
    await sim.getByTestId('scenario-1-load').selectOption('openrouter|anthropic/claude-sonnet-5');
    await expect(sim.getByTestId('scenario-1-input')).toHaveValue('3');
    await expect(sim.getByTestId('scenario-1-output')).toHaveValue('15');
    await expect(sim.getByTestId('scenario-1')).toContainText('claude-sonnet-5');
    await expect(page.getByTestId('llx-forecast')).toContainText('Next 30 days');
    await expect(page.getByTestId('llx-pricebook')).toContainText('google/gemini-3-flash');
  });

  test('opens a call with its attempts, its timeline and its kept text', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const api = await openLlm(page);
    await page.getByTestId('tab-calls').click();
    await expect(page.getByTestId('calls-table')).toContainText('Commander');

    await page.getByTestId('calls-failed').check();
    await expect.poll(() => api.requestedPaths.some(p => p.startsWith('/klivellm/calls?') && p.includes('failed=1'))).toBe(true);
    await page.getByTestId('calls-table').locator('tbody tr').first().click();
    const dialog = page.getByTestId('llx-call-dialog');
    await expect(dialog.getByTestId('call-outcome')).toHaveText('Router error');
    await expect(dialog).toContainText('Attempts');
    await expect(dialog.locator('table tbody tr')).toHaveCount(3);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    await page.getByTestId('calls-failed').uncheck();
    await page.getByTestId('calls-row-90000').click();
    await dialog.getByTestId('call-show-text').click();
    await expect(dialog.getByTestId('call-reply')).toContainText('Post the next clip');
    await expect(dialog).toContainText('You are the Commander.');
  });

  test('reads on its tiers while looked at, and nothing from a hidden tab', async ({ page }) => {
    await page.clock.install({ time: Date.now() });
    const api = await openLlm(page);
    await expect.poll(() => api.batchCalls.length).toBeGreaterThanOrEqual(1);
    const live = () => api.directGets.filter(p => p.startsWith('/klivellm/live')).length;

    const batches = api.batchCalls.length;
    const lives = live();
    await page.clock.runFor(20_500);
    await expect.poll(() => api.batchCalls.length).toBeGreaterThan(batches);
    expect(live()).toBeGreaterThanOrEqual(lives + 3);

    await hide(page, true);
    const hiddenBatches = api.batchCalls.length;
    const hiddenLives = live();
    await page.clock.runFor(5 * 60_000);
    expect(api.batchCalls.length).toBe(hiddenBatches);
    expect(live()).toBe(hiddenLives);

    await hide(page, false);
    await expect.poll(() => live()).toBeGreaterThan(hiddenLives);
  });

  test('a profile that may look but not change sees the routing read-only', async ({ page }) => {
    await openLlm(page, { permissions: ['klivellm.overview.view', 'klivellm.analytics.read'] });
    await expect(page.getByTestId('tab-calls')).toHaveCount(0);
    await page.getByTestId('tab-routing').click();
    await expect(page.getByTestId('llx-routing')).toContainText('changing it needs');
    await expect(page.getByTestId('lane-router-Projects/commander')).toBeDisabled();
    await expect(page.getByTestId('override-set')).toHaveCount(0);
  });

  test('adds a router with its key, then tests it', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const api = await openLlm(page);
    await page.getByTestId('tab-routers').click();
    await expect(page.getByTestId('airouter-envelope')).toContainText('Slots busy');

    await page.getByTestId('router-add').click();
    const dialog = page.getByTestId('llx-router-dialog');
    await dialog.getByTestId('router-name').fill('Groq');
    await dialog.getByTestId('router-url').fill('https://api.groq.example/openai/v1');
    await dialog.getByTestId('router-model').fill('llama-4-70b');
    await dialog.getByTestId('router-key').fill('test-key-not-real');
    await dialog.getByTestId('router-save').click();

    await expect(page.getByTestId('router-groq')).toBeVisible();
    const save = api.posts.find(p => p.path === '/klivellm/routers/save')!;
    expect(save.body.router).toMatchObject({ name: 'Groq', baseUrl: 'https://api.groq.example/openai/v1', defaultModel: 'llama-4-70b', billing: 'PerToken' });
    expect(api.posts.find(p => p.path === '/klivellm/routers/key')!.body).toEqual({ id: 'groq', key: 'test-key-not-real' });

    await page.getByTestId('router-test-groq').click();
    await expect(page.getByTestId('router-groq').getByTestId('router-test-result')).toContainText('Reachable');
  });

  test('opens a lane from Services and pauses it after asking', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const api = await openLlm(page);
    await page.getByTestId('tab-services').click();
    await page.getByTestId('lane-Projects/commander').click();

    const sheet = page.getByTestId('llx-lane-sheet');
    await expect(sheet).toContainText('Projects › Commander');
    await expect(sheet.getByTestId('lane-chain')).toContainText('RemoteLLMProvider');

    await sheet.getByTestId('lane-pause').click();
    await page.getByTestId('llx-confirm-yes').click();
    await expect.poll(() => api.posts.some(p => p.path === '/klivellm/service/pause' && p.body.paused === true && p.body.lane === 'commander')).toBe(true);
    await expect(sheet.getByTestId('lane-pause')).toContainText('Resume');
  });

  test('explores a metric split by router, against the window before', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const api = await openLlm(page);
    await page.getByTestId('tab-analytics').click();
    const explorer = page.getByTestId('analytics-explorer');
    await explorer.getByTestId('analytics-metric').selectOption('totalTokens');
    await explorer.getByTestId('analytics-groupby').selectOption('router');
    await explorer.getByTestId('analytics-compare').check();
    await expect.poll(() => api.requestedPaths.some(p => p.startsWith('/klivellm/series?') && p.includes('metrics=totalTokens') && p.includes('groupBy=router') && p.includes('compare=1'))).toBe(true);
    await expect(explorer).toContainText('the window before');
    await expect(page.locator('.llx-hists')).toContainText('First token');
    await expect(page.locator('.llx-week')).toBeVisible();
  });
});
