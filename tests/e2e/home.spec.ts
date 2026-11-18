import { expect, test, type Page } from '@playwright/test';
import { openDashboard, type DashboardRole } from './fixtures/dashboard-api';

/*
 * Home (/dashboard). The fixture is the shared KliveAPI fake in fixtures/dashboard-api.ts; the cases
 * below come from the live server on 13 Nov 2026 (scrubbed): a run-once service that is stopped by
 * design, a Steam login waiting for approval, a Tumblr edge block, a fleet that is entirely halted,
 * a sign-in code that just arrived, a 93% system disk.
 */

const SCREENS = 'test-results/home';

const halted = [
  { stewardID: 'p1', name: 'Shop launch', status: 'Paused', halted: true, pendingApprovals: 0 },
  { stewardID: 'p2', name: 'Supplier research', status: 'Paused', halted: true, pendingApprovals: 0 },
  { stewardID: 'p3', name: 'Old work', status: 'Archived', halted: false, pendingApprovals: 0 },
];

/** The hero shows four findings; the fixture has more, so tests that want a specific one open the rest. */
async function showAllFindings(page: Page) {
  const more = page.getByTestId('findings-more');
  if (await more.count() && /more/.test(await more.innerText())) await more.click();
}

async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'the page must not scroll sideways').toBeLessThanOrEqual(1);
}

for (const role of ['Guest', 'Admin', 'Klives'] as DashboardRole[]) {
  test(`${role} gets only what their access allows`, async ({ page }) => {
    const api = await openDashboard(page, role);
    await expect(page.getByTestId('home-greeting')).toContainText(/Good (morning|afternoon|evening)|Still up/);
    await expect(page.getByTestId('home-verdict')).toBeVisible();
    await expect(page.getByTestId('pulse-cs2')).toBeVisible();

    const owner = role === 'Klives';
    await expect(page.getByTestId('home-ask')).toHaveCount(owner ? 1 : 0);
    await expect(page.getByTestId('qa-new-steward')).toHaveCount(owner ? 1 : 0);
    await expect(page.getByTestId('qa-upload')).toBeVisible();
    await expect(page.getByTestId('pulse-stewards')).toHaveCount(owner ? 1 : 0);
    await expect(page.getByTestId('pulse-blox')).toHaveCount(role === 'Guest' ? 0 : 1);

    await expect.poll(() => api.batchCalls).toBeGreaterThanOrEqual(3);
    if (!owner) {
      const forbidden = ['/demiurge/', '/kliveagent/', '/omnidefence/', '/omniscience/', '/klivemail/', '/klivetech/', '/klivegames/', '/klivelink/', '/KMProfiles/activity'];
      expect(api.requestedPaths.filter(path => forbidden.some(prefix => path.startsWith(prefix))), `${role} must not probe routes it cannot read`).toEqual([]);
    }
    if (role === 'Guest') {
      expect(api.requestedPaths.filter(path => path.startsWith('/omniblox/') || path.startsWith('/api/logs'))).toEqual([]);
    }
  });
}

test('the verdict counts what is wrong, never the service that stops by design', async ({ page }) => {
  await openDashboard(page, 'Klives');
  const hero = page.getByTestId('home-hero');
  await expect(page.getByTestId('pulse-tumblr')).toBeVisible();
  await showAllFindings(page);

  // OmniTrader is stopped (a finding with a Restart button); the run-once Startup Manager is not mentioned at all.
  await expect(hero.getByTestId('finding-service:OmniTrader')).toContainText('OmniTrader is stopped');
  await expect(hero.getByTestId('finding-restart-OmniTrader')).toBeVisible();
  await expect(page.getByText('Omnipotent Startup Manager')).toHaveCount(0);

  // The Steam approval and the Tumblr edge block are said in words, with their system.
  await expect(hero.getByTestId('finding-cs2:steam')).toContainText('needs approving in the Steam app');
  await expect(page.getByTestId('pulse-tumblr')).toContainText("Tumblr is refusing this server's requests");

  // The 93% system disk with 15.7 GB free is known, not an alarm.
  await expect(page.getByTestId('home-quiet')).toContainText('C:\\ 93% full');
  await expect(hero.locator('[data-testid^="finding-disk"]')).toHaveCount(0);

  await page.screenshot({ path: `${SCREENS}/owner-1440.png`, fullPage: true });
});

test('muting a finding moves it to the known line for a day, and back', async ({ page }) => {
  await openDashboard(page, 'Klives');
  await expect(page.getByTestId('pulse-cs2')).toBeVisible();
  await showAllFindings(page);
  const finding = page.getByTestId('finding-cs2:steam');
  await expect(finding).toBeVisible();
  await page.getByTestId('finding-mute-cs2:steam').click();
  await expect(finding).toHaveCount(0);
  await expect(page.getByTestId('home-quiet')).toContainText('needs approving in the Steam app');

  // It survives a reload (per browser), until unmuted.
  await page.reload();
  await expect(page.getByTestId('home-quiet')).toContainText('needs approving in the Steam app', { timeout: 20_000 });
  await page.getByTestId('home-quiet').getByRole('button', { name: /Count .*Steam.* again/ }).click();
  await showAllFindings(page);
  await expect(page.getByTestId('finding-cs2:steam')).toBeVisible();
});

test('CS2 reads its 9 KB status, not the 467 KB scan analytics; KliveLink reads v2', async ({ page }) => {
  const api = await openDashboard(page, 'Klives');
  await expect(page.getByTestId('pulse-cs2').getByTestId('pulse-value')).toHaveText('150');
  await expect.poll(() => api.requestedPaths.some(path => path.startsWith('/cs2arbitragebot/status'))).toBe(true);
  expect(api.requestedPaths.filter(path => path.startsWith('/cs2arbitragebot/getscanalytics'))).toEqual([]);
  await expect.poll(() => api.requestedPaths.includes('/klivelink/v2/agents')).toBe(true);
  expect(api.requestedPaths.filter(path => path === '/klivelink/agents')).toEqual([]);
});

test('MemeScraper is judged against its own schedule', async ({ page }) => {
  // On time: nothing to say, the next scrape in the foot.
  await openDashboard(page, 'Klives');
  await expect(page.getByTestId('pulse-memes')).toContainText(/Next scrape in/);
  await expect(page.getByTestId('finding-memes:overdue')).toHaveCount(0);
});

test('an overdue scrape is a finding', async ({ page }) => {
  await openDashboard(page, 'Klives', {
    overrides: {
      '/memescraper/summary': {
        TotalReelsDownloaded: 1284, DownloadedToday: 0, Downloaded7d: 40, DownloadedPrev7d: 90, FailingSources: 0,
        LastDownloadUtc: new Date(Date.now() - 30 * 3600_000).toISOString(),
        NextScrapeDueUtc: new Date(Date.now() - 6 * 3600_000).toISOString(),
        ScrapeIntervalHours: 24, Paused: false, SchedulerState: 'idle', LastSchedulerTickUtc: new Date(Date.now() - 60_000).toISOString(),
        MemesDownloadedPerDay: {},
      },
    },
  });
  await expect(page.getByTestId('pulse-memes')).toContainText('Scrapes are overdue');
  await showAllFindings(page);
  await expect(page.getByTestId('finding-memes:overdue')).toContainText('Scrapes are overdue');
});

test('asking from Home opens KliveAgent and sends it there, once', async ({ page }) => {
  const api = await openDashboard(page, 'Klives');
  await page.keyboard.press('/');
  await expect(page.getByTestId('home-ask-input')).toBeFocused();
  await page.keyboard.type('Why are scripts failing today?');
  await page.keyboard.press('Enter');
  // The dev server compiles the KliveAgent page on first visit: give it the time the palette test gives.
  await expect(page).toHaveURL(/\/kliveagent/, { timeout: 30_000 });
  await expect.poll(() => api.mutations.some(m => m.path.startsWith('/kliveagent/chat') && (m.body ?? '').includes('Why are scripts failing today?')), { timeout: 30_000 }).toBe(true);
  // The text leaves the address, so a reload never sends it twice.
  await expect(page).not.toHaveURL(/ask=/);
});

test('the palette goes anywhere from the keyboard', async ({ page }) => {
  await openDashboard(page, 'Klives');
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('home-palette')).toBeVisible();
  await page.getByTestId('home-palette-input').fill('omnidef');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/omnidefence$/, { timeout: 30_000 });
});

test('jump back in follows this browser\'s habits; number keys open them', async ({ page }) => {
  await openDashboard(page, 'Klives', {
    visits: [
      { path: '/schemery/omniblox', score: 9 },
      { path: '/kliveagent', score: 5 },
      { path: '/admin', score: 3 },
    ],
  });
  const jump = page.getByTestId('home-jump');
  await expect(jump).toContainText('Jump back in');
  await expect(jump.locator('a').first()).toHaveAttribute('href', '/schemery/omniblox');
  // The busiest system's tile comes first too.
  await expect(page.locator('.hom-grid .hom-tile').first()).toHaveAttribute('data-testid', 'pulse-blox');
  await page.keyboard.press('2');
  await expect(page).toHaveURL(/\/kliveagent/, { timeout: 30_000 });
});

test('a fresh sign-in code is one click to copy and never kept in storage', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openDashboard(page, 'Klives');
  await expect(page.getByTestId('qa-code')).toHaveText('48K2Q');
  await page.getByTestId('qa-copy-code').click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('48K2Q');
  // The snapshot that makes Home paint instantly next time leaves the mail list out.
  await page.waitForTimeout(2_500);
  const stored = await page.evaluate(() => Object.keys(sessionStorage).filter(k => k.startsWith('km:home:snapshot')).map(k => sessionStorage.getItem(k) ?? '').join(''));
  expect(stored.length).toBeGreaterThan(0);
  expect(stored).not.toContain('48K2Q');
});

test('upload from the button, and resume a halted fleet after confirming', async ({ page }) => {
  const api = await openDashboard(page, 'Klives', { overrides: { '/demiurge/list': halted } });

  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('qa-upload').click();
  await (await chooser).setFiles({ name: 'home-fixture.txt', mimeType: 'text/plain', buffer: Buffer.from('fixture') });
  await expect.poll(() => api.mutations.some(m => /UploadFile/.test(m.path))).toBe(true);

  await expect(page.getByTestId('home-quiet')).toContainText('Fleet halted');
  await page.getByTestId('ctl-resume').click();
  const dialog = page.getByTestId('home-confirm');
  await expect(dialog).toContainText('Resume 2 Stewards?');
  // Cancel has the focus: Enter by reflex does nothing.
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  expect(api.mutations.some(m => m.path === '/demiurge/unhalt-all')).toBe(false);

  await page.getByTestId('ctl-resume').click();
  await page.getByTestId('home-confirm-confirm').click();
  await expect.poll(() => api.mutations.some(m => m.path === '/demiurge/unhalt-all')).toBe(true);
});

test('fits a laptop above the fold without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDashboard(page, 'Klives');
  await expect(page.locator('.hom-grid .hom-tile').first()).toBeVisible();
  await noSideScroll(page);
  // The verdict, the actions and the first row of systems are all on the first screen.
  const firstTile = await page.locator('.hom-grid .hom-tile').first().boundingBox();
  expect(firstTile && firstTile.y + firstTile.height).toBeLessThanOrEqual(900);
  await page.screenshot({ path: `${SCREENS}/owner-1440x900.png` });

  await page.setViewportSize({ width: 1280, height: 800 });
  await noSideScroll(page);
});

test('a phone gets one readable column of findings and two of systems', async ({ page }) => {
  // Opened at phone size, as a phone would: the site nav starts as a 56 px rail.
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page, 'Klives', { collapsed: true });
  await expect(page.getByTestId('home-root')).toHaveAttribute('data-size', 'sm');
  await expect(page.getByTestId('home-verdict')).toBeVisible();
  await expect(page.getByTestId('finding-trader:exceptions')).toContainText('Trading exceptions');
  await noSideScroll(page);
  await page.screenshot({ path: `${SCREENS}/owner-390.png`, fullPage: true });
});
