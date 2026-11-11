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
