import { expect, test } from '@playwright/test';
import { openKliveAgent } from './fixtures/kliveagent-api';

/**
 * The KliveAgent console against a fake server shaped like the live one (11 Nov 2026): Klives's own
 * conversations first, machine reports a filter away, results and scheduled tasks beside the thread,
 * everything polled through /batch, and Insights and Library loaded only when opened.
 */

test.describe.configure({ timeout: 90_000 });
// Wide enough for the side column (it becomes a drawer at 1280 px and below); the phone test sets its own size.
test.use({ viewport: { width: 1440, height: 900 } });

test('opens on your own conversations and loads one with its run details', async ({ page }) => {
  const api = await openKliveAgent(page);

  await expect(page.getByTestId('kax-verdict')).toContainText('Ready');
  const rail = page.getByTestId('kax-rail');
  // Yours: two web chats and the Discord one. The empty conversation and the two Alpha reports are not here.
  await expect(rail.getByTestId('rail-conv')).toHaveCount(3);
  await expect(rail).toContainText('1 empty hidden');
  await rail.getByTestId('rail-filter-auto').click();
  await expect(rail.getByTestId('rail-conv')).toHaveCount(2);
  await expect(rail).toContainText('Alpha Lab batch report');
  await rail.getByTestId('rail-filter-mine').click();

  await rail.getByTestId('rail-conv').first().click();
  await expect(page.getByTestId('kax-chat-title')).toContainText('Why did KliveAPI restart');
  await expect(page).toHaveURL(/conversation=conv_mine_recent/);
  const agentMsg = page.getByTestId('msg-agent');
  await expect(agentMsg).toContainText('deploys');
  await expect(agentMsg.getByTestId('msg-phase')).toHaveText('Done');
  await expect(agentMsg).toContainText('2 scripts · 1 failed');
  await agentMsg.getByRole('button', { name: /2 steps/ }).click();
  await expect(agentMsg).toContainText('Matched starts to commits');
  await expect(page.getByTestId('kax-turn-scripts')).toContainText('1 failed');

  // The side data arrives in one batch; nothing is polled route by route.
  await expect.poll(() => api.batchCalls.length).toBeGreaterThan(0);
  const fast = api.batchCalls.find(paths => paths.includes('/kliveagent/status'));
  expect(fast).toEqual(expect.arrayContaining(['/kliveagent/chat/runs?includeCompleted=false', '/kliveagent/notifications?unreadOnly=true&limit=50', '/kliveagent/computer', '/kliveagent/schedule']));
  expect(api.directGets.filter(path => path.startsWith('/kliveagent/tasks') || path.startsWith('/kliveagent/jobs') || path.startsWith('/kliveagent/notifications'))).toEqual([]);
  // A run the page watched is not marked read by the page: the server does that itself.
  expect(api.posts.filter(p => p.path === '/kliveagent/notifications/read')).toEqual([]);
});

test('results, scheduled tasks and the computer sit beside the thread', async ({ page }) => {
  const api = await openKliveAgent(page);
  const side = page.getByTestId('kax-side');

  const inbox = side.getByTestId('kax-inbox');
  await expect(inbox.getByTestId('inbox-unread')).toHaveText('1 unread');
  await inbox.getByTestId('inbox-read-all').click();
  await expect(inbox.getByTestId('inbox-unread')).toHaveCount(0);
  await expect.poll(() => api.posts.map(p => p.path)).toContain('/kliveagent/notifications/read-all');

  const schedule = side.getByTestId('kax-schedule');
  await expect(schedule.getByTestId('schedule-row')).toHaveCount(2);
  await expect(schedule.getByTestId('schedule-row').first()).toContainText(/in (39|40)m/);
  await expect(schedule.getByTestId('schedule-row').first()).toContainText('daily · fired 4×');
  await schedule.getByTestId('schedule-cancel').first().click();
  const dialog = page.getByTestId('kax-cancel-dialog');
  await expect(dialog).toContainText('overnight error log');
  // The destructive button never takes the focus: Enter alone cancels nothing.
  await expect(page.getByTestId('kax-cancel-confirm')).not.toBeFocused();
  await page.getByTestId('kax-cancel-confirm').click();
  await expect.poll(() => api.posts.find(p => p.path === '/kliveagent/schedule/cancel')?.body).toEqual({ id: 'task-soon' });
  await expect(schedule.getByTestId('schedule-row')).toHaveCount(1);

  await expect(side.getByTestId('kax-computer')).toContainText('Asleep');
  await expect(side.getByTestId('kax-work')).toContainText('No background jobs. 1 finished task');
  await expect(side.getByTestId('kax-vitals')).toContainText('messages');
});

test('a server without the schedule route says so instead of "nothing scheduled"', async ({ page }) => {
  await openKliveAgent(page, { legacyServer: true });
  await expect(page.getByTestId('kax-schedule')).toContainText('does not list scheduled tasks yet');
});

test('while KliveAgent starts the composer waits and says why', async ({ page }) => {
  await openKliveAgent(page, { startingReads: 2 });
  const input = page.getByTestId('kax-input');
  await expect(page.getByTestId('kax-verdict')).toContainText('Starting 45%');
  await expect(input).toBeDisabled();
  await expect(input).toHaveAttribute('placeholder', /starting/i);
  await expect(input).toBeEnabled({ timeout: 15_000 });
  await expect(page.getByTestId('kax-verdict')).toContainText('Ready');
});

test('a starter fills the composer, and the palette opens conversations and views', async ({ page }) => {
  await openKliveAgent(page);
  await page.getByTestId('kax-new-chat').click();
  await expect(page.getByTestId('kax-hello')).toBeVisible();
  await page.getByTestId('starter-broken').click();
  await expect(page.getByTestId('kax-input')).toHaveValue(/Check every Omnipotent service/);
  await expect(page.getByTestId('kax-input')).toBeFocused();

  await page.getByTestId('kax-input').fill('');
  // Ctrl+K works from inside the composer too.
  await page.keyboard.press('Control+k');
  await page.getByTestId('kax-palette-input').fill('tumblr keys');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/conversation=conv_mine_older/);

  await page.keyboard.press('Control+k');
  await page.getByTestId('kax-palette-input').fill('insights');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('kax-insights')).toBeVisible();
});

test('Insights reads the history once and labels the flat-fee model honestly', async ({ page }) => {
  const api = await openKliveAgent(page);
  await page.getByTestId('view-insights').click();
  const insights = page.getByTestId('kax-insights');
  await expect(insights.getByTestId('kpi-cost')).toContainText('Flat fee');
  await expect(insights.getByTestId('kpi-scripts')).toContainText('75%');
  await expect(insights.getByTestId('kpi-cache')).toContainText('91.9%');
  await expect(insights.getByTestId('kax-capabilities')).toContainText('accountregistry.get');
  await expect(insights).toContainText('Where run time goes');
  await insights.getByTestId('range-7D').click();
  await expect.poll(() => api.directGets.filter(p => p.startsWith('/kliveagent/stats/prompt-cache')).length).toBeGreaterThanOrEqual(2);
  expect(api.directGets.filter(p => p === '/kliveagent/stats').length).toBe(1);
  await expect(page).toHaveURL(/view=insights/);
});

test('Insights says how scripts are doing and where a model call spends its time', async ({ page }) => {
  const api = await openKliveAgent(page);
  await page.getByTestId('view-insights').click();

  const health = page.getByTestId('kax-script-health');
  // 121 scripts, one of them stopped by hand: 100 of the 120 that count ran.
  await expect(health.getByTestId('script-verdict')).toContainText('100 of 120 scripts ran (83%)');
  await expect(health.getByTestId('script-verdict')).toContainText('9 did not compile, 8 threw, 2 ran out of time');
  await expect(health.getByTestId('script-verdict')).toContainText('14 ran only because the engine fixed them first');
  // A percentile is the edge of a histogram bucket, and days before tracking began are unknown, not zero.
  await expect(health).toContainText('< 250 ms');
  await expect(health).toContainText('recorded since');
  await expect(health.getByTestId('script-failures')).toContainText("'Widget' does not contain a definition for 'Depth'");
  await expect(health.getByTestId('script-failures')).toContainText('did not compile');

  const causes = page.getByTestId('kax-script-causes');
  await expect(causes.getByTestId('script-repairs')).toContainText('member of an object-typed value');
  await expect(causes.getByTestId('script-codes')).toContainText('CS1061');

  const split = page.getByTestId('kax-model-split');
  await expect(split).toContainText('Waiting for the provider');
  await expect(split).toContainText('45.0%');
  await expect(split).toContainText('One other call in flight');
  // 250 calls at the "high" effort averaged 25.4 s each.
  await expect(split).toContainText('by the reasoning effort asked for');
  await expect(split).toContainText('25.40 s');
  await expect(split.getByTestId('provider-slow')).toHaveCount(0);

  // The parts of a model call are not listed again beside the whole.
  const stages = page.getByTestId('kax-stages');
  await expect(stages).toContainText('Native tools');
  await expect(stages).not.toContainText('Waiting for the provider');
  await expect(stages).not.toContainText('Later compiles');

  await expect(page.getByTestId('kax-slow-tools')).toContainText('example_research');
  await expect(page.getByTestId('kax-slow-tools')).toContainText('hit the limit');

  // One read per range, and a range the server keeps the same days for is not read twice.
  await page.getByTestId('range-7D').click();
  await expect.poll(() => api.directGets.filter(p => p.startsWith('/kliveagent/stats/scripts'))).toEqual(['/kliveagent/stats/scripts?days=30', '/kliveagent/stats/scripts?days=7']);
  await page.getByTestId('range-30D').click();
  await expect(health.getByTestId('script-verdict')).toBeVisible();
  expect(api.directGets.filter(p => p.startsWith('/kliveagent/stats/scripts')).length).toBe(2);
});

test('a server without script health says so instead of showing zeros', async ({ page }) => {
  await openKliveAgent(page, { legacyServer: true });
  await expect(page.getByTestId('kax-vitals').getByTestId('vitals-provider')).toHaveCount(0);
  await page.getByTestId('view-insights').click();
  await expect(page.getByTestId('kax-script-health')).toContainText('does not report script health yet');
  await expect(page.getByTestId('kax-script-causes')).toContainText('Not reported by this server yet');
  await expect(page.getByTestId('kax-slow-tools')).toContainText('Not reported by this server yet');
});

test('a slow provider is said beside the chat, where the waiting happens', async ({ page }) => {
  await openKliveAgent(page, { providerSlow: true });
  const line = page.getByTestId('kax-vitals').getByTestId('vitals-provider');
  await expect(line).toContainText('The model provider is slow right now');
  await expect(line).toContainText('47.00 s');
  await expect(line).toContainText('9 calls in the last 15 minutes');
  // The server also files it under Results; that entry has no conversation, so it opens the figures.
  await page.getByTestId('kax-inbox').getByTestId('inbox-row').filter({ hasText: 'The model provider is slow' }).click();
  await expect(page.getByTestId('kax-insights')).toBeVisible();
  await expect(page.getByTestId('kax-model-split').getByTestId('provider-slow')).toContainText('not in this server');
});

test('a run that kept a plan shows it with its answer', async ({ page }) => {
  await openKliveAgent(page);
  await page.getByTestId('kax-rail').getByTestId('rail-conv').first().click();
  const ledger = page.getByTestId('msg-agent').getByTestId('msg-ledger');
  await expect(ledger).toContainText('Plan');
  await expect(ledger).toContainText('2 of 3 done');
  // The run has answered, so the plan is one line until it is opened.
  await expect(ledger).not.toContainText('Check the watchdog log');
  await ledger.getByRole('button').click();
  await expect(ledger).toContainText('Check the watchdog log for forced restarts');
  await expect(ledger).toContainText('35 starts in 7 days');
  await expect(ledger).toContainText('/api/uptime/periods');
});

test('Library filters memories and deletes only after a confirmation', async ({ page }) => {
  const api = await openKliveAgent(page);
  await page.getByTestId('view-library').click();
  await expect(page.getByTestId('view-library')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('view-chat')).toHaveAttribute('aria-selected', 'false');
  const library = page.getByTestId('kax-library');
  await expect(library.getByTestId('lib-memory')).toHaveCount(3);
  await library.getByRole('button', { name: /^tumblr/ }).click();
  await expect(library.getByTestId('lib-memory')).toHaveCount(1);
  await library.getByTestId('lib-delete').click();
  await expect(page.getByTestId('kax-delete-dialog')).toContainText('Tumblr 403s');
  await page.getByTestId('kax-delete-confirm').click();
  await expect.poll(() => api.posts.find(p => p.path === '/kliveagent/memories/delete')?.body).toEqual({ id: 'mem-2' });
  await expect(library.getByTestId('lib-memory')).toHaveCount(0);

  await library.getByTestId('lib-tab-capabilities').click();
  await expect(library).toContainText('asks first');
});

test('at phone width the rail and side panel become drawers and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openKliveAgent(page);
  await expect(page.getByTestId('kax-rail')).toHaveCount(0);
  await page.getByTestId('kax-rail-open').click();
  await expect(page.getByTestId('kax-rail')).toBeVisible();
  await page.getByTestId('rail-conv').first().click();
  await expect(page.getByTestId('kax-chat-title')).toContainText('Why did KliveAPI');
  await page.getByTestId('kax-side-toggle').click();
  await expect(page.getByTestId('kax-side-drawer')).toContainText('Results');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
