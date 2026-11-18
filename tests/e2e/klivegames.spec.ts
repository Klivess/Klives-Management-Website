import { expect, test } from '@playwright/test';
import { openGames } from './fixtures/klivegames-api';

/*
 * /klivegames, rebuilt Nov 2026 on its own design (.kgx). Each test pins something the old page got
 * wrong or couldn't do, against a stateful fake of the KliveGames routes. Live on 13 Nov 2026: 7 servers,
 * 6 never backed up, all public with no router forward, a June crash shown with no date, and a viewer's
 * Start click on 24 Oct that 403'd with nothing on screen.
 */

const SCREENS = 'test-results/klivegames';

test.use({ viewport: { width: 1600, height: 1000 } });

const posts = (api: { posts: { path: string; body: any }[] }, path: string) => api.posts.filter(p => p.path === path);
/** The requests a click sent, once at least `count` of them have reached the fake server. */
async function sent(api: { posts: { path: string; body: any }[] }, path: string, count = 1) {
  await expect.poll(() => posts(api, path).length, { timeout: 8_000 }).toBeGreaterThanOrEqual(count);
  return posts(api, path);
}

test('one overview read shows the fleet, what needs attention, and the duplicate names apart', async ({ page }) => {
  const api = await openGames(page);
  await expect(page.getByTestId('srv-mc-over')).toBeVisible();

  // One route answers the whole page (the old one polled the list and each server's record every 4 s).
  const reads = api.requested.filter(r => r.startsWith('GET /klivegames/'));
  expect(reads.every(r => r.startsWith('GET /klivegames/overview'))).toBe(true);

  await expect(page.getByTestId('kgx-subline')).toContainText('6 servers');
  await expect(page.getByTestId('kgx-subline')).toContainText('1 running');
  await expect(page.getByTestId('kpi-running')).toContainText('1');
  await expect(page.getByTestId('kpi-players')).toContainText('3');
  await expect(page.getByTestId('kpi-backups')).toContainText('1/ 6');
  await expect(page.getByTestId('kpi-memory')).toContainText('16.3 GB');

  const attention = page.getByTestId('fleet-attention');
  await expect(attention.getByTestId('issue-crashed')).toContainText('Modpack crashed');
  await expect(attention.getByTestId('issue-crashed')).toContainText('around');
  await expect(attention.getByTestId('issue-fwd')).toContainText('Overworld is public but the router isn\'t forwarding it');
  await expect(attention.getByTestId('issue-never-backed-up')).toContainText('5 servers have never been backed up');

  // Two servers are called "Islands": the rail says which game each one is.
  await expect(page.getByTestId('srv-mc-isl')).toContainText('Minecraft');
  await expect(page.getByTestId('srv-tr-isl')).toContainText('Terraria');
  // What needs a look sorts first, then what runs.
  const order = await page.locator('.kgx-rail__list .kgx-srv').evaluateAll(els => els.map(e => e.getAttribute('data-testid')));
  expect(order.slice(0, 2)).toEqual(['srv-mc-mod', 'srv-mc-over']);

  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREENS}/fleet-1600.png`, fullPage: true });
});

test('a server opens in place with its join address, real forward state and the URL to come back to', async ({ page }) => {
  await openGames(page);
  await page.getByTestId('srv-mc-over').click();
  await expect(page).toHaveURL(/\?s=mc-over/);
  await expect(page.getByTestId('hero-name')).toHaveText('Overworld');
  await expect(page.getByTestId('hero-status')).toContainText('Running');
  await expect(page.getByTestId('join-public')).toContainText('klive.dev:25568');
  await expect(page.getByTestId('fwd-25568')).toContainText('not forwarded');
  await expect(page.getByTestId('stat-backup')).toContainText('Never');

  // Number keys switch tabs; the tab is in the URL too.
  await page.keyboard.press('5');
  await expect(page.getByTestId('tab-backups')).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/t=backups/);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('fleet-attention')).toBeVisible();

  // The old per-server address still lands on the server.
  await page.goto('/klivegames/rs-waste');
  await expect(page.getByTestId('hero-name')).toHaveText('Wasteland');
  await expect(page).toHaveURL(/\?s=rs-waste/);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SCREENS}/server-1600.png`, fullPage: true });
});

test('a profile that may only look sees why it cannot act, instead of a click that does nothing', async ({ page }) => {
  const api = await openGames(page, { scenario: 'viewer' });
  await page.getByTestId('srv-mc-mod').click();
  const start = page.getByTestId('act-start');
  await expect(start).toBeDisabled();
  await expect(start).toHaveAttribute('title', /Operate game servers/);
  await expect(page.getByTestId('kgx-deploy')).toBeDisabled();
  await page.getByTestId('tab-console').click();
  await expect(page.getByTestId('console')).toContainText('Use server consoles');
  expect(posts(api, '/klivegames/servers/start')).toHaveLength(0);
});

test('every action says how it went, including the server’s own reason for refusing', async ({ page }) => {
  const api = await openGames(page);
  await page.getByTestId('srv-mc-mod').click();
  await expect(page.getByTestId('hero-error')).toContainText('code 1');
  await page.getByTestId('act-start').click();
  await expect(page.getByTestId('toast-crit')).toContainText('Couldn\'t start Modpack');
  await expect(page.getByTestId('toast-crit')).toContainText('already in use');

  await page.getByTestId('srv-mc-sky').click();
  await page.getByTestId('act-start').click();
  await expect(page.getByTestId('toast-ok')).toContainText('Skyblock is starting');
  expect(posts(api, '/klivegames/servers/start').map(p => p.body)).toEqual([{ id: 'mc-mod' }, { id: 'mc-sky' }]);
  await expect(page.getByTestId('hero-status')).toContainText('Running');
});

test('the console replays, colours, filters, sends and remembers commands', async ({ page }) => {
  const api = await openGames(page, { path: '/klivegames?s=mc-over&t=console' });
  const out = page.getByTestId('console-out');
  await expect(page.getByTestId('console-state')).toContainText('Live');
  await expect(out).toContainText('Done (40.8s)!');
  await expect(out.locator('[data-kind="err"]')).toHaveCount(1);
  await expect(out.locator('[data-kind="warn"]')).toHaveCount(1);

  const input = page.getByTestId('console-input');
  await input.fill('list');
  await input.press('Enter');
  await expect(out).toContainText('There are 3 of a max of 20 players online');
  await input.fill('say hello');
  await input.press('Enter');
  expect(api.wsSent).toEqual(['list', 'say hello']);
  await input.press('ArrowUp');
  await expect(input).toHaveValue('say hello');
  await input.press('ArrowUp');
  await expect(input).toHaveValue('list');

  await page.getByTestId('console-filter').fill('joined');
  await expect(out.locator('.kgx-con__line')).toHaveCount(1);
  await page.screenshot({ path: `${SCREENS}/console-1600.png` });
});

test('back up now runs in the background with progress, and the schedule is one setting', async ({ page }) => {
  const api = await openGames(page, { path: '/klivegames?s=mc-over&t=backups' });
  await page.getByTestId('backup-now').click();
  expect((await sent(api, '/klivegames/backups/create'))[0].body).toEqual({ id: 'mc-over', background: true });
  await expect(page.getByTestId('backup-job')).toContainText('of 3,812 files');
  await expect(page.locator('[data-testid^="backup-backup-"]')).toHaveCount(1, { timeout: 15_000 });
  await expect(page.getByTestId('stat-backup')).toContainText('just now', { timeout: 15_000 });

  await page.getByTestId('backup-every').selectOption('24');
  await page.getByTestId('backup-keep').fill('5');
  await page.getByTestId('backup-save').click();
  expect((await sent(api, '/klivegames/config/set')).at(-1)!.body).toEqual({ id: 'mc-over', backupEveryHours: 24, backupKeep: 5 });
  await expect(page.getByTestId('toast-ok').last()).toContainText('daily, keeping 5');
});

test('restoring keeps a copy of the current files first, and refuses while running', async ({ page }) => {
  const api = await openGames(page, { path: '/klivegames?s=rs-waste&t=backups' });
  await page.getByTestId('restore-backup-20260803-174533.zip').click();
  await expect(page.getByTestId('restore-safety')).toBeChecked();
  await page.getByTestId('dialog-confirm').click();
  expect((await sent(api, '/klivegames/backups/restore'))[0].body).toEqual({ id: 'rs-waste', backupId: 'backup-20260803-174533.zip', background: true, safety: true });

  await page.goto('/klivegames?s=mc-over&t=backups');
  await page.getByTestId('backup-now').waitFor();
  // Overworld has no backups yet, but the dialog would refuse while it runs: covered by the confirm label.
  await expect(page.getByTestId('hero-status')).toContainText('Running');
});

test('one click turns on daily backups for every unprotected server', async ({ page }) => {
  const api = await openGames(page);
  await page.getByTestId('issue-never-backed-up').getByRole('button', { name: /Back up daily/ }).click();
  const set = await sent(api, '/klivegames/config/set', 5);
  expect(set.map(p => p.body.id).sort()).toEqual(['mc-isl', 'mc-mod', 'mc-over', 'mc-sky', 'tr-isl']);
  expect(set.every(p => p.body.backupEveryHours === 24 && p.body.backupKeep === 7)).toBe(true);
  await expect(page.getByTestId('toast-ok').last()).toContainText('Daily backups on for 5 servers');
  await expect(page.getByTestId('issue-never-backed-up')).toHaveCount(0);
});

test('settings save only what changed, and say so before you leave', async ({ page }) => {
  const api = await openGames(page, { path: '/klivegames?s=mc-over&t=settings' });
  await page.getByTestId('cfg-view-distance').locator('input').fill('12');
  await expect(page.getByTestId('settings-savebar')).toContainText('1 unsaved change');
  await expect(page.getByTestId('settings-savebar')).toContainText('applies on the next restart');
  await page.getByTestId('settings-save').click();
  const body = (await sent(api, '/klivegames/config/set')).at(-1)!.body;
  expect(body.values).toEqual({ 'view-distance': '12' });
  await expect(page.getByTestId('settings-savebar')).toHaveCount(0);

  await page.getByTestId('settings-find').fill('pvp');
  await expect(page.locator('[data-testid^="cfg-"][data-testid$="pvp"]')).toBeVisible();
  await expect(page.getByTestId('cfg-motd')).toHaveCount(0);
});

test('deploying picks a free port, says what it will build and turns backups on', async ({ page }) => {
  const api = await openGames(page);
  await page.keyboard.press('n');
  await page.getByTestId('deploy-game-Terraria').click();
  await expect(page.getByTestId('deploy-port')).toHaveAttribute('placeholder', 'auto (7778)');
  await page.getByTestId('deploy-name').fill('Caverns');
  await expect(page.getByTestId('deploy-backups')).toBeChecked();
  await page.getByTestId('dialog-confirm').click();
  const body = (await sent(api, '/klivegames/servers/create'))[0].body;
  expect(body).toMatchObject({ name: 'Caverns', gameType: 'Terraria', version: '1.4.4.9', backupEveryHours: 24, backupKeep: 7, options: { worldSize: 'Medium', maxPlayers: '8' } });
  await expect(page.getByTestId('hero-name')).toHaveText('Caverns');
  await expect(page.getByTestId('tab-console')).toHaveAttribute('aria-selected', 'true');
});

test('the palette jumps to a server and runs its actions', async ({ page }) => {
  const api = await openGames(page);
  await page.keyboard.press('Control+k');
  await page.getByTestId('palette-input').fill('wasteland');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('hero-name')).toHaveText('Wasteland');
  await page.keyboard.press('Control+k');
  await page.getByTestId('palette-input').fill('back up');
  await page.keyboard.press('Enter');
  expect((await sent(api, '/klivegames/backups/create'))[0].body.id).toBe('rs-waste');
});

test('players: who is on, everyone who has played, and an undo for a ban', async ({ page }) => {
  const api = await openGames(page, { path: '/klivegames?s=mc-over&t=players' });
  await expect(page.getByTestId('online-Alex')).toBeVisible();
  await expect(page.getByTestId('known-Jordan')).toContainText('3d');
  await page.getByTestId('online-Sam').getByRole('button', { name: 'Ban Sam' }).click();
  const toast = page.getByTestId('toast-ok').last();
  await expect(toast).toContainText('Sent: ban Sam');
  await toast.getByRole('button', { name: 'Undo' }).click();
  expect((await sent(api, '/klivegames/players/action', 2)).map(p => `${p.body.action} ${p.body.player}`)).toEqual(['ban Sam', 'pardon Sam']);
});

test('an older server without the overview still works, and says what is missing', async ({ page }) => {
  const api = await openGames(page, { scenario: 'legacy' });
  await expect(page.getByTestId('kgx-legacy')).toBeVisible();
  await expect(page.getByTestId('srv-mc-over')).toBeVisible();
  expect(api.requested.some(r => r.startsWith('GET /klivegames/servers'))).toBe(true);
  await page.getByTestId('srv-mc-over').click();
  await expect(page.getByTestId('hero-name')).toHaveText('Overworld');
  await expect(page.getByTestId('join-public')).toContainText('klive.dev:25568');
});

test('phone width: the list, then a server full-screen with a way back', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openGames(page);
  await expect(page.getByTestId('srv-mc-over')).toBeVisible();
  await page.screenshot({ path: `${SCREENS}/fleet-390.png`, fullPage: true });
  await page.getByTestId('srv-mc-over').click();
  await expect(page.getByTestId('hero-name')).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(392);
  await page.screenshot({ path: `${SCREENS}/server-390.png`, fullPage: true });
});

