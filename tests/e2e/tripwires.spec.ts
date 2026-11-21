import { expect, test, type Page } from '@playwright/test';
import { openTripwires, type TripwiresApiMock } from './fixtures/tripwires-api';

/**
 * The Tripwires console against a fake server shaped like production (fixtures/tripwires-api.ts).
 * What it must do: show at a glance who tripped what (and which trips were Klives testing), make a
 * link from a pasted URL in one step, say when a closed link is still being visited, and ask the
 * server for little.
 */

const posts = (api: TripwiresApiMock, path: string) => api.posts.filter(p => p.path === path);

async function hide(page: Page, hidden: boolean) {
  await page.evaluate(value => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (value ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

test.describe('Tripwires console', () => {
  test('all activity: figures, what needs attention, and the latest trips without KM accounts', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openTripwires(page);

    await expect(page.getByTestId('twx-subline')).toContainText('2 of 3 live');
    // The capped link that kept being opened after it closed.
    await expect(page.getByTestId('issue-closed-tw2capped')).toContainText('Forum post turned away 53 visits');
    await expect(page.getByTestId('issue-closed-tw2capped')).toContainText('no longer available');

    await expect(page.getByTestId('fig-known')).toContainText('3');
    await expect(page.getByTestId('fig-closed')).toContainText('53');
    await expect(page.getByTestId('fig-previews')).toContainText('3');

    const feed = page.getByTestId('all-trips');
    // The VPN exit is flagged, the private trip says so, Klives's own trips are hidden by default.
    await expect(feed.getByText('VPN / proxy').first()).toBeVisible();
    await expect(feed.getByText('Private').first()).toBeVisible();
    await expect(feed.getByText('Klives')).toHaveCount(0);
    await page.getByTestId('toggle-known').click();
    await expect(feed.getByText('Klives').first()).toBeVisible();

    // A row opens to everything kept, with the address linked to OmniDefence.
    await feed.getByText('Example VPN Ltd').first().click();
    await expect(feed.getByText('203.0.113.77')).toBeVisible();
    await expect(feed.getByText("(the VPN's exit, not the person)")).toBeVisible();
    await expect(feed.locator('a[href="/omnidefence?ip=203.0.113.77"]')).toBeVisible();
  });

  test('one tripwire: links, figures, trips, people', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const api = await openTripwires(page);
    await page.getByTestId('rail-tw1scammer').click();

    await expect(page.getByTestId('detail-name')).toHaveText('Scammer');
    await expect(page).toHaveURL(/id=tw1scammer/);
    await expect(page.getByTestId('link-tw1scammer-t0')).toContainText('https://klive.dev/t?key=token-tw1scammer');
    await expect(page.getByTestId('fig-detail-known')).toContainText('3');
    await expect(page.getByTestId('fig-vpn')).toContainText('1');
    await expect(page.getByTestId('fig-preview')).toContainText('Discord');

    const trips = page.getByTestId('detail-trips');
    await expect(trips.locator('.twx-trip')).toHaveCount(2);
    await expect(page.getByTestId('known-hidden')).toContainText('3 trips from KM accounts hidden');

    await page.getByTestId('tab-visitors').click();
    const people = page.getByTestId('visitors');
    await expect(people.locator('.twx-person')).toHaveCount(1);
    await people.locator('.twx-person').first().click();
    await expect(page.getByTestId('visitor-filter')).toContainText('Only visitor aa11');
    await expect(trips.locator('.twx-trip')).toHaveCount(1);
    expect(api.requestedPaths.some(p => p.startsWith('/tripwires/events?') && p.includes('visitor=aa11bb22cc33dd44ee55ff66'))).toBeTruthy();

    // Copy puts the tracking link on the clipboard.
    await page.getByTestId('detail-copy').click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://klive.dev/t?key=token-tw1scammer-0000000000');
  });

  test('a pasted link becomes a tripwire in one step, with the settings used last', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 950 });
    const api = await openTripwires(page);

    await page.getByTestId('twx-quick-input').fill('shop.example/offer/spring-sale');
    await page.getByTestId('twx-quick-input').press('Enter');

    await expect(page.getByTestId('detail-name')).toHaveText('shop.example spring sale');
    const create = posts(api, '/tripwires/create')[0];
    expect(create.body.targets).toEqual([{ label: '', destinationUrl: 'https://shop.example/offer/spring-sale' }]);
    // Scammer was edited last, and it does not honour Do Not Track: the new one starts the same way.
    expect(create.body.settings.honourDoNotTrack).toBe(false);
    expect(create.body.settings.maxTrips).toBeNull();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^https:\/\/klive\.dev\/t\?key=new-/);
    await expect(page.getByTestId('twx-toast').first()).toContainText('on your clipboard');
  });

  test('the full form takes several pasted links and shows the cost of honouring Do Not Track', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 950 });
    const api = await openTripwires(page);

    await page.keyboard.press('n');
    const composer = page.getByTestId('twx-composer');
    await expect(composer).toBeVisible();
    await expect(page.getByTestId('composer-source')).toHaveValue('tw1scammer');
    await expect(page.getByTestId('composer-dnt')).toContainText('of your last 15 trips sent it');

    await page.getByTestId('composer-url').first().focus();
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.setData('text', 'https://a.example/one\nhttps://b.example/two');
      document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await expect(page.getByTestId('composer-url')).toHaveCount(2);
    await page.getByTestId('composer-name').fill('Two places');
    await page.getByTestId('composer-submit').click();

    await expect(page.getByTestId('detail-name')).toHaveText('Two places');
    expect(posts(api, '/tripwires/create')[0].body.targets.map((t: any) => t.destinationUrl)).toEqual(['https://a.example/one', 'https://b.example/two']);
  });

  test('a closed tripwire says what visitors get, and can take trips again', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 950 });
    const api = await openTripwires(page, { path: '/tripwires?id=tw2capped' });

    await expect(page.getByTestId('detail-status')).toHaveText('Limit reached');
    const banner = page.getByTestId('detail-closed');
    await expect(banner).toContainText('Reached its limit of 10 trips');
    await expect(banner).toContainText('This link is no longer available');
    await expect(banner).toContainText('53 visits arrived since');

    await banner.getByRole('button', { name: 'Raise the limit' }).click();
    await expect(page.getByTestId('detail-status')).toHaveText('Active');
    expect(posts(api, '/tripwires/update')[0].body).toEqual({ id: 'tw2capped', settings: { maxTrips: 20 } });
  });

  test('settings: keyboard, privacy, closed behaviour, Discord, and pause with undo', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 950 });
    const api = await openTripwires(page, { path: '/tripwires?id=tw3quiet' });
    await expect(page.getByTestId('detail-name')).toHaveText('Two links');

    await page.keyboard.press('s');
    const sheet = page.getByTestId('twx-settings');
    await expect(sheet).toBeVisible();
    await page.getByTestId('settings-dnt').click();
    await page.getByTestId('settings-closed').selectOption('redirect');
    await page.getByTestId('settings-max').fill('5');
    await page.getByTestId('settings-save').click();
    await expect.poll(() => posts(api, '/tripwires/update').length).toBe(1);
    const saved = posts(api, '/tripwires/update')[0].body;
    expect(saved.settings.honourDoNotTrack).toBe(false);
    expect(saved.settings.closedBehaviour).toBe('redirect');
    expect(saved.settings.maxTrips).toBe(5);
    expect(saved.targets.map((t: any) => t.id)).toEqual(['tw3quiet-t0', 'tw3quiet-t1']);
    await expect(sheet).toContainText('Everything is saved');
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();

    await page.getByTestId('detail-pause').click();
    await expect(page.getByTestId('detail-status')).toHaveText('Disabled');
    expect(posts(api, '/tripwires/update')[1].body).toEqual({ id: 'tw3quiet', settings: { enabled: false } });
    await page.getByTestId('twx-toast').getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByTestId('detail-status')).toHaveText('Active');
  });

  test('delete asks first, then the tripwire is gone', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 950 });
    const api = await openTripwires(page, { path: '/tripwires?id=tw3quiet' });
    await page.getByTestId('detail-more').click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(page.getByTestId('twx-confirm')).toContainText('Delete Two links?');
    await page.getByTestId('confirm-yes').click();
    await expect(page.getByTestId('rail-tw3quiet')).toHaveCount(0);
    expect(posts(api, '/tripwires/delete')[0].body).toEqual({ id: 'tw3quiet' });
    await expect(page).not.toHaveURL(/id=tw3quiet/);
  });

  test('asks for little: one batch per poll, nothing while hidden', async ({ page }) => {
    await page.clock.install({ time: Date.now() });
    await page.setViewportSize({ width: 1500, height: 950 });
    const api = await openTripwires(page);
    await expect.poll(() => api.batchCalls.length).toBeGreaterThan(0);
    expect(api.batchCalls[0]).toEqual(['/tripwires/overview']);
    expect(api.directGets.filter(p => p.startsWith('/tripwires/'))).toEqual([]);

    await page.clock.runFor(15_500);
    await expect.poll(() => api.batchCalls.length).toBe(2);

    await hide(page, true);
    const before = api.batchCalls.length;
    await page.clock.runFor(60_000);
    expect(api.batchCalls.length).toBe(before);
    await hide(page, false);
    await expect.poll(() => api.batchCalls.length).toBeGreaterThan(before);
  });

  test('an older server without the overview still lists and opens tripwires', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 950 });
    const api = await openTripwires(page, { legacy: true });
    await expect(page.getByTestId('rail-tw2capped')).toBeVisible();
    await expect(page.getByText('does not send trips across tripwires yet')).toBeVisible();
    expect(api.requestedPaths).toContain('/tripwires/list');
    expect(api.requestedPaths.some(p => p.startsWith('/tripwires/summary?id='))).toBeTruthy();

    await page.getByTestId('rail-tw2capped').click();
    await expect(page.getByTestId('detail-trips').locator('.twx-trip')).toHaveCount(10);
    // No OmniDefence intel from an older server: the figures say so instead of showing zero.
    await expect(page.getByTestId('fig-vpn')).toContainText('—');
  });

  test('a stopped Discord bot is said at the top', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 950 });
    await openTripwires(page, { discordDown: true });
    await expect(page.getByTestId('issue-discord-down')).toContainText('KliveBot is not running');
    await expect(page.getByTestId('issue-discord-down')).toContainText('2 tripwires cannot send Discord alerts');
  });

  test('phone width: no sideways scroll, rail above the content', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openTripwires(page, { path: '/tripwires?id=tw1scammer' });
    await expect(page.getByTestId('detail-name')).toHaveText('Scammer');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
