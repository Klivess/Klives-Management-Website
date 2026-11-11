import { expect, test, type Page } from '@playwright/test';
import { openDefence, type DefenceApiMock } from './fixtures/omnidefence-api';

/**
 * The OmniDefence console against a fake server shaped like production (fixtures/omnidefence-api.ts).
 * What it must do: say what needs attention at a glance, act on an address in a click or two, and ask
 * the server for little (the old page polled from hidden tabs all night: 215 MB of map in a week).
 */

const batches = (api: DefenceApiMock) => api.batchCalls.length;
const posts = (api: DefenceApiMock, path: string) => api.posts.filter(post => post.path === path);

async function hide(page: Page, hidden: boolean) {
  await page.evaluate(value => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (value ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

test.describe('OmniDefence console', () => {
  test('says what needs attention, with the figures, map, review and records on one page', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const api = await openDefence(page);

    await expect(page.getByTestId('odx-verdict-title')).toHaveText('2 things to look at');
    await expect(page.getByTestId('issue-hostile-answered')).toContainText('10 attackers still answered');
    await expect(page.getByTestId('issue-people-penalised')).toContainText('1 person on Watch or turned away');
    await expect(page.getByTestId('odx-health')).toContainText('built in');

    await expect(page.getByTestId('kpi-requests')).toContainText('2,812');
    await expect(page.getByTestId('kpi-denied')).toContainText('544');
    await expect(page.getByTestId('kpi-denied')).toContainText('19% of requests');
    await expect(page.getByTestId('kpi-blocked')).toContainText('2');
    // The visitors and hostile tiles come from the address records themselves.
    await expect(page.getByTestId('kpi-visitors')).toContainText('known');
    await expect(page.getByTestId('map-count')).toContainText('shown');

    // Review: attackers still answered first, with a one-click block on each.
    const review = page.getByTestId('odx-review');
    await expect(review.getByTestId('review-198.51.100.17')).toContainText('Vuln scanner');
    await expect(review.getByTestId('review-block-198.51.100.17')).toBeVisible();
    await review.getByTestId('review-tab-benign').click();
    await expect(review.getByTestId('review-203.0.113.40')).toBeVisible();
    await expect(review.getByTestId('review-release-203.0.113.40')).toBeVisible();

    // Recent actions come from the server-wide feed.
    await expect(page.getByTestId('odx-feed')).toContainText('blocked automatically');

    // The traffic table is the default tab.
    await expect(page.getByTestId('traffic-table').locator('tbody tr').first()).toBeVisible();

    // One batch carries the overview, regions and the open list; the map comes in its compact form.
    await expect.poll(() => batches(api)).toBeGreaterThanOrEqual(1);
    const first = api.batchCalls[0];
    expect(first).toEqual(expect.arrayContaining(['/omnidefence/overview', '/omnidefence/regions']));
    expect(first.some(path => path.startsWith('/omnidefence/requests?'))).toBe(true);
    expect(api.directGets.filter(path => path.startsWith('/omnidefence/overview'))).toEqual([]);
    expect(api.directGets.some(path => path.startsWith('/omnidefence/ip-map/compact'))).toBe(true);
    expect(api.directGets.some(path => path === '/omnidefence/ip-map')).toBe(false);

    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });

  test('polls every 15 seconds while looked at, and not at all from a hidden tab', async ({ page }) => {
    await page.clock.install({ time: Date.now() });
    const api = await openDefence(page);
    await expect(page.getByTestId('odx-verdict-title')).toHaveText('2 things to look at');
    await expect.poll(() => batches(api)).toBeGreaterThanOrEqual(1);

    const before = batches(api);
    await page.clock.runFor(15_500);
    await expect.poll(() => batches(api)).toBeGreaterThan(before);

    await hide(page, true);
    const hiddenAt = batches(api);
    const mapReads = api.directGets.filter(path => path.startsWith('/omnidefence/ip-map')).length;
    await page.clock.runFor(5 * 60_000);
    expect(batches(api)).toBe(hiddenAt);
    expect(api.directGets.filter(path => path.startsWith('/omnidefence/ip-map')).length).toBe(mapReads);

    // Back in view: fresh figures straight away.
    await hide(page, false);
    await expect.poll(() => batches(api)).toBeGreaterThan(hiddenAt);
  });

  test('block asks for a reason the classifier suggests, and Undo puts the address back', async ({ page }) => {
    const api = await openDefence(page);
    const review = page.getByTestId('odx-review');
    await review.getByTestId('review-block-198.51.100.17').click();

    const dialog = page.getByTestId('odx-block-dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('odx-block-reason')).toHaveValue('Exploit probes');
    await page.getByTestId('odx-block-reason').fill('exploit probes on /.env');
    await page.getByTestId('odx-block-reason').press('Enter');

    await expect.poll(() => posts(api, '/omnidefence/ip/block').map(post => post.body)).toEqual([{ ip: '198.51.100.17', reason: 'exploit probes on /.env' }]);
    await expect(page.getByTestId('odx-toast').first()).toContainText('Blocked 198.51.100.17');

    // It was on Watch before: Undo returns it to Watch, not to Normal.
    await page.getByTestId('odx-toast-action').first().click();
    await expect.poll(() => posts(api, '/omnidefence/ip/status').map(post => post.body)).toEqual([{ ip: '198.51.100.17', status: 'Watch' }]);
  });

  test('the address sheet shows why, and will not block the owner', async ({ page }) => {
    const api = await openDefence(page);
    await page.getByTestId('tab-addresses').click();
    await page.getByTestId('address-search').fill('Klives');
    await expect(page.getByTestId('address-count')).toContainText('1 of');
    await page.getByTestId('address-table').locator('tbody tr').first().click();

    const sheet = page.getByTestId('odx-sheet');
    await expect(page.getByTestId('odx-sheet-ip')).toHaveText('203.0.113.5');
    await expect(sheet).toContainText('Protected');
    await expect(page.getByTestId('sheet-status-Blocked')).toBeDisabled();
    await expect(page.getByTestId('sheet-status-Tarpit')).toBeDisabled();

    // The address is in the link, so it can be shared.
    await expect(page).toHaveURL(/[?&]ip=203\.0\.113\.5/);

    // A scanner's sheet: evidence, and a port scan that reports what it found.
    await page.getByTestId('odx-sheet-close').click();
    await page.getByTestId('address-search').fill('198.51.100.31');
    await page.getByTestId('address-table').locator('tbody tr').first().click();
    await expect(sheet).toContainText('Asked for /.env and /.git/config');
    await page.getByTestId('sheet-scan').click();
    await expect(page.getByTestId('sheet-scan-result')).toContainText('2 open');
    expect(posts(api, '/omnidefence/ip/scan').map(post => post.body.ip)).toEqual(['198.51.100.31']);

    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
  });

  test('Ctrl+K opens any address by typing part of it', async ({ page }) => {
    await openDefence(page);
    await page.keyboard.press('Control+k');
    await expect(page.getByTestId('odx-palette')).toBeVisible();
    await page.getByTestId('odx-palette-input').fill('198.51.100.52');
    await expect(page.getByTestId('cmd-ip-198.51.100.52')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('odx-sheet-ip')).toHaveText('198.51.100.52');
  });

  test('a server still starting is shown as waiting, then the page fills in', async ({ page }) => {
    await page.clock.install({ time: Date.now() });
    await openDefence(page, { scenario: 'starting', missingReads: 1 });
    await expect(page.getByTestId('odx-verdict-title')).toHaveText('Waiting for OmniDefence');
    await expect(page.getByTestId('odx-live')).toContainText('Starting');

    await page.clock.runFor(15_500);
    await expect(page.getByTestId('odx-verdict-title')).toHaveText('2 things to look at');
  });

  test('routes that answer while the fingerprint engine loads read "loading", never "not running"', async ({ page }) => {
    await page.clock.install({ time: Date.now() });
    const api = await openDefence(page, { scenario: 'engine-loading' });
    await expect(page.getByTestId('issue-finishing')).toContainText('Loading the fingerprint engine');
    await expect(page.getByTestId('issue-fp-stopped')).toHaveCount(0);
    await expect(page.getByTestId('odx-startup')).toContainText('2m 2s');

    await page.getByTestId('tab-fingerprint').click();
    await expect(page.getByTestId('fp-engine')).toHaveText('Loading');
    await expect(page.getByTestId('fp-loading')).toBeVisible();

    // The status is asked for every 15 s while start-up finishes. Once the engine is up its own
    // figures are read straight away, not at the next minute's read, so "not running" never shows.
    await page.clock.runFor(15_500);
    await expect(page.getByTestId('issue-finishing')).toBeVisible();
    const fpReads = () => api.requestedPaths.filter(path => path === '/omnidefence/fingerprint/status').length;
    const before = fpReads();
    api.finishStartup();
    await page.clock.runFor(15_500);
    await expect(page.getByTestId('issue-finishing')).toHaveCount(0);
    await expect(page.getByTestId('fp-engine')).toHaveText('Running');
    await expect(page.getByTestId('issue-fp-stopped')).toHaveCount(0);
    await expect(page.getByTestId('fp-loading')).toHaveCount(0);
    expect(fpReads()).toBeGreaterThan(before);
  });

  test('an older server: the full map is read instead, and the missing feed is said so', async ({ page }) => {
    const api = await openDefence(page, { scenario: 'legacy' });
    await expect(page.getByTestId('odx-verdict-title')).toHaveText('2 things to look at');
    await expect.poll(() => api.directGets.some(path => path === '/omnidefence/ip-map')).toBe(true);
    await expect(page.getByTestId('map-count')).not.toContainText('0 shown');
    await expect(page.getByTestId('odx-feed')).toContainText('does not keep a feed');
  });

  test('fits a phone without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openDefence(page);
    await expect(page.getByTestId('odx-verdict-title')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), { timeout: 5_000 }).toBeLessThanOrEqual(1);
  });
});
