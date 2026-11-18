import { expect, test, type Page } from '@playwright/test';
import { openAdmin, type AdminApiMock } from './fixtures/admin-api';

const STATUS = '/GeneralBotStatistics/GetFrontpageStats';

const statusReads = (api: AdminApiMock) => api.directGets.filter(path => path.startsWith(STATUS)).length;
const postsTo = (api: AdminApiMock, path: string) => api.posts.filter(post => post.path === path);

/** Polled: straight after a resize the nav rail is still animating to its new width. */
async function expectNoSidewaysScroll(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), { message: 'the page must not scroll sideways', timeout: 3_000 })
    .toBeLessThanOrEqual(1);
}

test.describe('Admin console', () => {
  test('answers "is everything all right" on one screen, asks the server for little, and opens no shell unasked', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const api = await openAdmin(page);

    // One service is stopped here, as on the live server: the startup manager, which finishes by
    // design. It is listed as finished and does not count against the status.
    await expect(page.getByTestId('adm-verdict')).toHaveText('All systems nominal');
    await expect(page.getByTestId('adm-hero')).toContainText('35 of 35 services running');
    await expect(page.getByTestId('services-count')).toHaveText('35 of 35 running, 1 finished');
    await expect(page.getByTestId('service-Omnipotent Startup Manager')).toContainText('finished');
    await expect(page.getByTestId('vital-cpu')).toContainText('%');
    await expect(page.getByTestId('vital-ram')).toContainText('GB');
    await expect(page.getByTestId('vital-api')).toContainText('req / min');
    await expect(page.getByTestId('vital-uptime')).toHaveText(/2d 3h/);
    await expect(page.getByTestId('uptime-availability')).toHaveText(/99\.\d\d%/);
    // Restarts that brought a new commit are told apart from restarts of the same build.
    await expect(page.locator('#adm-uptime')).toContainText(/Restarts, \d+ deploys/);
    // The day's API figures come from telemetry, against the day before.
    await expect(page.getByTestId('api-day')).toContainText('4,281');
    await expect(page.getByTestId('api-day')).toContainText('was 478');
    await expect(page.getByTestId('api-day')).toContainText('253 ms');
    for (const tool of ['logs', 'settings', 'telemetry', 'desktop', 'profiles', 'defence', 'schedule', 'klivelink']) {
      await expect(page.getByTestId(`launch-${tool}`)).toBeVisible();
    }

    // Everything an operator checks first is above the fold: verdict, vitals, every service, uptime.
    const fold = await page.evaluate(() => {
      const bottom = (id: string) => document.getElementById(id)?.getBoundingClientRect().bottom ?? Infinity;
      return { services: bottom('adm-services'), uptimeTop: document.getElementById('adm-uptime')?.getBoundingClientRect().top ?? Infinity, height: window.innerHeight };
    });
    expect(fold.services).toBeLessThan(fold.height);
    expect(fold.uptimeTop).toBeLessThan(fold.height);
    await expectNoSidewaysScroll(page);

    // One status read and one batch carrying everything slower: not five requests every ten seconds.
    await expect.poll(() => api.batchCalls.length).toBe(1);
    const batch = api.batchCalls[0];
    expect(batch).toEqual(expect.arrayContaining([
      '/System/UptimeStatistics?days=30',
      '/KliveAPI/Statistics?days=30',
      '/api/logs/summary?hours=24',
      '/timemanager/getalltasks',
      '/admin/portforwarding/list',
      '/seleniumManager/getAllSeleniumInstances',
      '/GeneralBotStatistics/History?minutes=60',
    ]));
    expect(api.refused).toEqual([]);
    expect(api.directGets.filter(path => path.startsWith('/KliveAPI/telemetry/overview'))).toEqual(['/KliveAPI/telemetry/overview?range=24h']);
    // No shell is opened on the server for someone who has not asked for one.
    expect(api.posts.filter(post => post.path.startsWith('/admin/terminal'))).toEqual([]);

    // The vitals keep coming every five seconds; the slow tier does not repeat.
    const before = statusReads(api);
    await expect.poll(() => statusReads(api), { timeout: 9_000 }).toBeGreaterThan(before);
    expect(api.batchCalls.length).toBe(1);

    // A tab nobody is looking at asks for nothing.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(400);
    const whileHidden = statusReads(api);
    await page.waitForTimeout(6_500);
    expect(statusReads(api)).toBe(whileHidden);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => statusReads(api)).toBeGreaterThan(whileHidden);

    // The terminal: a session exists only once the dock is opened, and opening it leaves the page where it was.
    // Starting a new session is slow (a PowerShell runspace in the server process: up to two minutes
    // on the live server), so the screen says what it is waiting for and counts the seconds.
    api.terminalOpenDelayMs = 4_500;
    await expect(page.getByTestId('adm-dock')).toHaveAttribute('data-open', 'false');
    await page.keyboard.press('Control+`');
    await expect(page.getByTestId('adm-dock')).toHaveAttribute('data-open', 'true');
    await expect.poll(() => postsTo(api, '/admin/terminal/session/open').length).toBe(1);
    const terminal = page.locator('.adm-dock .terminal');
    await expect(terminal).toContainText('Connecting...');
    await expect(terminal).toContainText(/Starting PowerShell on the server\.\.\. \ds\. A new session can take a minute or two\./, { timeout: 8_000 });
    const prompt = page.locator('.adm-dock textarea');
    await expect(prompt).toBeFocused({ timeout: 8_000 });
    await expect(terminal).not.toContainText('Starting PowerShell');
    await expect(terminal).toContainText('PowerShell session ready.');
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    await prompt.fill('Get-Date');
    await prompt.press('Enter');
    await expect.poll(() => postsTo(api, '/admin/terminal/session/execute').map(post => post.body?.command)).toEqual(['Get-Date']);

    // Closing keeps the session; reopening does not start another.
    await page.keyboard.press('Control+`');
    await expect(page.getByTestId('adm-dock')).toHaveAttribute('data-open', 'false');
    await page.getByTestId('adm-dock-toggle').click();
    await expect(page.getByTestId('adm-dock')).toHaveAttribute('data-open', 'true');
    expect(postsTo(api, '/admin/terminal/session/open').length).toBe(1);
  });

  test('names what is wrong, fixes it from the headline, and lets a known condition be muted', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const api = await openAdmin(page, { scenario: 'troubled' });

    await expect(page.getByTestId('adm-verdict')).toHaveText('OmniTube is not running');
    await expect(page.getByTestId('adm-hero')).toHaveAttribute('data-tone', 'warn');
    await expect(page.getByTestId('adm-hero')).toContainText('CS2ArbitrageBot logged 41 errors in the last hour');
    await expect(page.getByTestId('adm-hero')).toContainText('C:\\ is 93% full');
    await expect(page.getByTestId('adm-hero')).toContainText('Scheduled task “CS2TradePoll” is overdue');
    await expect(page.getByTestId('adm-hero')).toContainText('12% of API requests failed in the last 24 hours');
    await expect(page.getByTestId('services-count')).toHaveText('34 of 35 running, 1 finished');

    await page.getByTestId('issue-restart-OmniTube').click();
    await expect.poll(() => postsTo(api, '/GeneralBotStatistics/RestartService').map(post => post.body)).toEqual([{ serviceName: 'OmniTube' }]);
    await expect(page.getByTestId('adm-verdict')).toHaveText('CS2ArbitrageBot logged 41 errors in the last hour', { timeout: 8_000 });
    await expect(page.getByTestId('services-count')).toHaveText('35 of 35 running, 1 finished');

    // The disk has been this full for weeks: muting it takes it out of the status, not off the page.
    const disk = 'disk:C:\\:warn';
    await page.getByTestId(`issue-mute-${disk}`).click();
    await expect(page.getByTestId(`issue-${disk}`)).toHaveCount(0);
    await page.getByTestId('muted-toggle').click();
    await expect(page.getByTestId(`issue-${disk}`)).toBeVisible();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('adm-verdict')).toBeVisible();
    await expect(page.getByTestId('muted-toggle')).toHaveText(/1 muted/);
    await expect(page.getByTestId(`issue-${disk}`)).toHaveCount(0);

    // The same page on a phone: one column, nothing off the side.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('service-KliveAPI')).toBeVisible();
    await expectNoSidewaysScroll(page);
  });

  test('services: "/" filters, restart confirms in the row, and the issues view narrows to trouble', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const api = await openAdmin(page, { scenario: 'troubled' });
    await expect(page.getByTestId('service-KliveAPI')).toBeVisible();

    await page.keyboard.press('/');
    await expect(page.getByTestId('services-filter')).toBeFocused();
    await page.keyboard.type('klivea');
    await expect(page.locator('.adm-svc')).toHaveCount(2);
    await expect(page.getByTestId('service-KliveAPI')).toBeVisible();
    await expect(page.getByTestId('service-KliveAgent')).toBeVisible();

    // One click asks, a second confirms: nothing restarts on the first.
    await page.getByTestId('service-KliveAPI').hover();
    await page.getByTestId('service-restart-KliveAPI').click();
    expect(postsTo(api, '/GeneralBotStatistics/RestartService')).toEqual([]);
    await page.getByTestId('service-confirm-KliveAPI').click();
    await expect.poll(() => postsTo(api, '/GeneralBotStatistics/RestartService').map(post => post.body)).toEqual([{ serviceName: 'KliveAPI' }]);

    await page.getByTestId('services-filter').press('Escape');
    await expect(page.locator('.adm-svc')).toHaveCount(36);
    await page.getByTestId('services-mode-issues').click();
    await expect(page.locator('.adm-svc')).toHaveCount(3);
    await expect(page.getByTestId('service-OmniTube')).toContainText('stopped');
    await expect(page.getByTestId('service-CS2ArbitrageBot')).toContainText('41');
  });

  test('command palette: a restart takes Enter twice, a destination takes it once', async ({ page }) => {
    const api = await openAdmin(page);
    await expect(page.getByTestId('service-KliveAPI')).toBeVisible();

    await page.keyboard.press('Control+k');
    const input = page.getByTestId('adm-palette-input');
    await expect(input).toBeFocused();
    await input.fill('rest klivea');
    await expect(page.locator('.adm-cmd').first()).toHaveText(/Restart KliveAPI/);

    await page.keyboard.press('Enter');
    await expect(page.locator('.adm-cmd').first()).toContainText('Press Enter again to confirm');
    expect(postsTo(api, '/GeneralBotStatistics/RestartService')).toEqual([]);
    await page.keyboard.press('Enter');
    await expect.poll(() => postsTo(api, '/GeneralBotStatistics/RestartService').map(post => post.body)).toEqual([{ serviceName: 'KliveAPI' }]);
    await expect(page.getByTestId('adm-palette')).toHaveCount(0);

    await page.keyboard.press('Control+k');
    await page.getByTestId('adm-palette-input').fill('logs');
    await expect(page.locator('.adm-cmd .adm-cmd__title').first()).toHaveText('Logs');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/administration\/botlogs$/, { timeout: 30_000 });
  });

  test('port forwards: validated before the router is asked, and descriptions are only ever text', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    // Any device on the network can create a UPnP mapping and choose its description.
    const hostile = '"><img src=x onerror="window.__pwned = 1">';
    const api = await openAdmin(page, {
      mappings: [{ Protocol: 'TCP', PublicPort: 8081, PrivatePort: 8081, PrivateIp: '192.168.1.90', Description: hostile, LifetimeSeconds: 0, ExpirationDate: 'Permanent' }],
    });

    const hostileRow = page.getByTestId('port-TCP-8081');
    await hostileRow.scrollIntoViewIfNeeded();
    await expect(hostileRow).toContainText(hostile);
    await hostileRow.hover();
    await hostileRow.getByRole('button', { name: /Edit forward/ }).click();
    await expect(page.getByTestId('port-dialog')).toBeVisible();
    await expect(page.getByTestId('port-dialog').locator('input').first()).toHaveValue(hostile);
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('port-dialog')).toHaveCount(0);

    await page.getByTestId('port-add').click();
    await page.getByTestId('port-public').fill('443');
    await page.getByTestId('port-save').click();
    await expect(page.getByTestId('port-error')).toHaveText('TCP port 443 is already forwarded (KliveAPI HTTPS).');
    expect(postsTo(api, '/admin/portforwarding/add')).toEqual([]);

    await page.getByTestId('port-public').fill('27015');
    await page.getByTestId('port-private').fill('27015');
    await page.getByTestId('port-ip').fill('not-an-address');
    await page.getByTestId('port-save').click();
    await expect(page.getByTestId('port-error')).toHaveText('Target must be an IPv4 address on your network.');

    await page.getByTestId('port-ip').fill('192.168.1.60');
    await page.getByTestId('port-dialog').locator('input').first().fill('Game server');
    await page.getByTestId('port-save').click();
    await expect.poll(() => postsTo(api, '/admin/portforwarding/add').map(post => post.body)).toEqual([
      { Description: 'Game server', PublicPort: 27015, PrivatePort: 27015, Protocol: 'TCP', PrivateIp: '192.168.1.60', LifetimeSeconds: 0, ExpirationDate: '' },
    ]);
    await expect(page.getByTestId('port-dialog')).toHaveCount(0);
    await expect(page.getByTestId('port-TCP-27015')).toContainText('Game server');

    const added = page.getByTestId('port-TCP-27015');
    await added.hover();
    await page.getByTestId('port-remove-27015').click();
    expect(postsTo(api, '/admin/portforwarding/delete')).toEqual([]);
    await page.getByTestId('port-remove-confirm-27015').click();
    await expect.poll(() => postsTo(api, '/admin/portforwarding/delete').length).toBe(1);
    await expect(page.getByTestId('port-TCP-27015')).toHaveCount(0);
  });

  test('update: says what it will do, waits through the outage, and reports the build that came back', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const api = await openAdmin(page);
    await expect(page.getByTestId('adm-deploy')).toContainText('59f29c2');

    await page.getByTestId('adm-deploy').click();
    const dialog = page.getByTestId('deploy-dialog');
    await expect(dialog).toContainText('Running 59f29c2');
    await expect(dialog).toContainText('GitHub has nothing newer');
    await expect(dialog).toContainText('recent restarts took about');
    expect(postsTo(api, '/GeneralBotStatistics/UpdateBot')).toEqual([]);

    await page.getByTestId('deploy-confirm').click();
    await expect.poll(() => postsTo(api, '/GeneralBotStatistics/UpdateBot').length).toBe(1);
    const banner = page.getByTestId('adm-deploy-banner');
    await expect(banner).toContainText('Updating Omnipotent');
    await expect(page.getByTestId('adm-deploy')).toBeDisabled();

    // Only a different process counts as back: the old one answering again would not.
    await expect(banner).toContainText('Omnipotent is back', { timeout: 25_000 });
    await expect(banner).toContainText('Back online on a1b2c3d');
    await expect(page.getByTestId('adm-deploy')).toContainText('a1b2c3d');
    await expect(page.getByTestId('adm-deploy')).toBeEnabled();
  });

  test('a limited profile gets the panels it may read and none of the controls', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const api = await openAdmin(page, { role: 'Guest', scenario: 'troubled' });

    await expect(page.getByTestId('adm-verdict')).toHaveText('OmniTube is not running');
    await expect(page.getByTestId('issue-restart-OmniTube')).toHaveCount(0);
    await expect(page.getByTestId('adm-deploy')).toHaveCount(0);
    await expect(page.getByTestId('adm-dock')).toHaveCount(0);
    await expect(page.locator('#adm-uptime')).toHaveCount(0);
    await expect(page.locator('#adm-logs')).toHaveCount(0);
    await expect(page.getByTestId('port-add')).toHaveCount(0);
    await page.getByTestId('service-KliveAPI').hover();
    await expect(page.getByTestId('service-restart-KliveAPI')).toHaveCount(0);

    // Nothing was requested just to be refused.
    await expect.poll(() => api.batchCalls.length).toBeGreaterThanOrEqual(1);
    expect(api.refused).toEqual([]);
    const asked = api.requestedPaths.join('\n');
    for (const forbidden of ['/System/UptimeStatistics', '/api/logs', '/admin/portforwarding', '/admin/terminal', '/KliveAPI/telemetry']) {
      expect(asked).not.toContain(forbidden);
    }
    await expectNoSidewaysScroll(page);
  });

  test('works against a server from before its new routes and fields', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const api = await openAdmin(page, { legacyServer: true, scenario: 'troubled' });

    await expect(page.getByTestId('adm-verdict')).toHaveText('OmniTube is not running');
    // An older server does not say which services finish by design; the startup manager is known by name.
    await expect(page.getByTestId('services-count')).toHaveText('34 of 35 running, 1 finished');
    await expect(page.getByTestId('adm-hero')).not.toContainText('Startup Manager');
    // It also lists every filter driver as a network interface: one adapter is shown, not three.
    await expect(page.locator('#adm-network .adm-nic')).toHaveCount(1);
    await expect(page.locator('#adm-network')).not.toContainText('LightWeight Filter');
    // Uptime read from the TimeSpan text when there is no UptimeSeconds.
    await expect(page.getByTestId('service-KliveAPI')).toContainText(/2d \dh/);
    await expect(page.getByTestId('vital-uptime')).toHaveText(/\d/);
    await expect(page.getByTestId('adm-deploy')).not.toContainText('59f29c2');
    await expect(page.getByTestId('vital-api')).toContainText('requests today');

    // The history route answered 404 once and is not asked for again.
    await page.getByTestId('adm-refresh').click();
    await expect.poll(() => api.batchCalls.length).toBeGreaterThanOrEqual(2);
    expect(api.batchCalls[0]).toContain('/GeneralBotStatistics/History?minutes=60');
    expect(api.batchCalls[1]).not.toContain('/GeneralBotStatistics/History?minutes=60');
  });
});

test.describe('Service logs', () => {
  test('a link from Admin opens the log narrowed by the server, in readable characters', async ({ page }) => {
    const api = await openAdmin(page, { path: '/administration/botlogs?service=KliveAPI&type=error', ready: '.back-link' });

    await expect(page.locator('.back-link')).toHaveText('← Admin');
    await expect.poll(() => api.directGets.filter(path => path.startsWith('/api/logs?'))).toContain('/api/logs?limit=250&sort=desc&service=KliveAPI&type=1');
    await expect(page.locator('.select-field select')).toHaveValue('KliveAPI');
    await expect(page.locator('tbody .service-tag')).toHaveText(['KliveAPI']);
    // The page used to render mis-decoded UTF-8: "â† Admin", "Connectingâ€¦".
    await expect(page.locator('.botlogs-page')).not.toContainText('â');
  });
});
