import { expect, test, type Page } from '@playwright/test';
import { installProfilesApiMock, signIn } from './fixtures/profiles-api';

/** Where review screenshots go (Playwright clears test-results on every run). */
const SCREENS = process.env.E2E_SCREENS_DIR ?? 'test-results/screens';

/*
 * The profile console (its own .pfx design): the directory with its review, quick-look sheet,
 * row menu, palette, keyboard and access matrix; a profile's page (overview, access editor,
 * activity, devices); the new-profile wizard; the permission catalog; KliveCloud's people-based
 * sharing and /account, which share the fixture. Klives is signed in.
 */

async function ready(page: Page, label = 'Owner') {
  const account = page.getByTestId('nav-account');
  try {
    // The first page a cold dev server compiles can take a while.
    await expect(account).toContainText(label, { timeout: 30_000 });
  } catch {
    // Nuxt dev occasionally aborts a module stream and leaves an empty document: one reload
    // tells that transport hiccup apart from a real failure (as dashboard.spec.ts does).
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(account).toContainText(label, { timeout: 30_000 });
  }
}

const rows = (page: Page) => page.locator('.pfx-trow--body');

test('the directory reviews access and shows who is where, how busy, and what they use', async ({ page, context }) => {
  await installProfilesApiMock(page);
  await signIn(context);
  await page.goto('/administration/profiles');
  await ready(page);

  await expect(page.getByRole('heading', { name: 'Profiles', level: 1 })).toBeVisible();
  await expect(rows(page)).toHaveCount(6);
  await expect(page.getByTestId('row-sam')).toContainText('On KM: Klivecloud');
  await expect(page.getByTestId('row-jo')).toContainText('Suspended');
  await expect(page.getByTestId('row-max')).toContainText('Sign-in off');
  await expect(page.getByTestId('row-riv')).toContainText('Dormant');
  await expect(page.getByTestId('row-alex')).toContainText('2 idle');
  await expect(page.getByTestId('kpi-online')).toContainText('2');

  // The review: idle devices, the dormant profile, passwords-as-keys (safe: only Alex, who may), unused grants.
  const review = page.getByTestId('pfx-review');
  await expect(review).toContainText('signed-in devices unused for 7+ days');
  await expect(review).toContainText("can sign in but hasn't in 30+ days");
  await expect(review).toContainText('safe to switch off');

  await page.getByTestId('filter-online').click();
  await expect(rows(page)).toHaveCount(3);
  await page.getByTestId('filter-all').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREENS}/profiles-directory.png`, fullPage: true });
});

test('a profile can be suspended from the quick-look sheet', async ({ page, context }) => {
  const api = await installProfilesApiMock(page);
  await signIn(context);
  await page.goto('/administration/profiles');
  await ready(page);

  await page.getByTestId('row-sam').click();
  const sheet = page.getByTestId('pfx-sheet');
  await expect(sheet.getByTestId('pfx-sheet-name')).toHaveText('Sam Carter');
  await expect(sheet).toContainText('Recent activity');
  await page.screenshot({ path: `${SCREENS}/profiles-sheet.png` });

  await sheet.getByTestId('sheet-suspend').click();
  const dialog = page.getByRole('dialog', { name: 'Suspend Sam Carter' });
  await dialog.getByRole('button', { name: '1 day' }).click();
  await dialog.getByLabel(/Reason/).fill('Taking a break');
  await dialog.getByTestId('pfx-suspend-confirm').click();

  await expect.poll(() => api.mutations.find(m => m.path === '/KMProfiles/access/suspend')?.body)
    .toEqual({ id: 'sam', minutes: 1440, reason: 'Taking a break' });
  await expect(page.getByTestId('row-sam')).toContainText('Suspended');
  await expect(page.getByTestId('pfx-toast').first()).toContainText('Sam Carter is suspended');
});

test('idle devices are signed out from the row menu and from the review', async ({ page, context }) => {
  const api = await installProfilesApiMock(page);
  await signIn(context);
  await page.goto('/administration/profiles');
  await ready(page);

  await page.getByRole('button', { name: 'Actions for Alex Moreno' }).click();
  await page.getByRole('menuitem', { name: /Sign out idle devices \(2\)/ }).click();
  await expect.poll(() => api.mutations.find(m => m.path === '/KMProfiles/sessions/revoke')?.body).toEqual({ id: 'alex', idleDays: 7 });
  await expect(page.getByTestId('pfx-toast').first()).toContainText('Signed out 2 idle devices of Alex Moreno');
});

test('the review opens the idle-device sign-out for everyone at once', async ({ page, context }) => {
  const api = await installProfilesApiMock(page);
  await signIn(context);
  await page.goto('/administration/profiles');
  await ready(page);

  await page.getByTestId('issue-idle').click();
  const dialog = page.getByTestId('pfx-idle');
  await expect(dialog).toContainText('Alex Moreno');
  await dialog.getByTestId('pfx-idle-go').click();
  await expect.poll(() => api.mutations.filter(m => m.path === '/KMProfiles/sessions/revoke').map(m => m.body)).toEqual([{ id: 'alex', idleDays: 7 }]);
});

test('the keyboard moves through the list, opens the sheet and the page', async ({ page, context }) => {
  await installProfilesApiMock(page);
  await signIn(context);
  await page.goto('/administration/profiles');
  await ready(page);
  await expect(rows(page)).toHaveCount(6);

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('pfx-sheet-name')).toHaveText('Sam Carter');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('pfx-sheet-name')).toHaveText('Alex Moreno');
  await page.keyboard.press('o');
  await expect(page).toHaveURL(/\/administration\/profiles\/alex$/);
  await expect(page.getByTestId('pfx-name')).toHaveText('Alex Moreno');
});

test('the palette finds people and actions', async ({ page, context }) => {
  await installProfilesApiMock(page);
  await signIn(context);
  await page.goto('/administration/profiles');
  await ready(page);

  await page.keyboard.press('Control+k');
  const input = page.getByTestId('pfx-palette-input');
  await input.fill('suspend alex');
  await expect(page.getByTestId('cmd-suspend-alex')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Suspend Alex Moreno' })).toBeVisible();
});

test('the matrix shows who holds what and opens the service in the editor', async ({ page, context }) => {
  await installProfilesApiMock(page);
  await signIn(context);
  await page.goto('/administration/profiles');
  await ready(page);

  await page.getByTestId('view-matrix').click();
  const cell = page.getByTestId('cell-klivecloud-sam');
  await expect(cell).toBeVisible();
  await expect(page.getByTestId('cell-klivecloud-klives')).toHaveText('all');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SCREENS}/profiles-matrix.png`, fullPage: true });
  await cell.click();
  await expect(page).toHaveURL(/\/administration\/profiles\/sam\?tab=access&service=klivecloud/);
  await expect(page.getByRole('heading', { name: 'KliveCloud', level: 3 })).toBeVisible();
});

test('a profile page shows them live, with figures and what they did recently', async ({ page, context }) => {
  await installProfilesApiMock(page);
  await signIn(context);
  await page.goto('/administration/profiles/sam');
  await ready(page);

  await expect(page.getByTestId('pfx-name')).toHaveText('Sam Carter');
  await expect(page.getByTestId('pfx-presence')).toContainText('On KM: Klivecloud');
  await expect(page.getByRole('heading', { name: 'Requests by service' })).toBeVisible();
  await expect(page.getByTestId('pfx-recent')).toContainText('/KliveCloud/Browse');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SCREENS}/profile-overview.png`, fullPage: true });
});

test('permission changes are shown before saving, and save the full set', async ({ page, context }) => {
  const api = await installProfilesApiMock(page);
  await signIn(context);
  await page.goto('/administration/profiles/sam?tab=access');
  await ready(page);

  await page.getByRole('tab', { name: /OmniTrader/ }).click();
  const orders = page.getByRole('switch', { name: 'Place and manage orders' });
  await expect(orders).toHaveAttribute('aria-checked', 'false');
  await orders.click();

  const bar = page.getByRole('region', { name: 'Unsaved permission changes' });
  await expect(bar).toContainText('1 unsaved change');
  await expect(bar).toContainText('1 critical');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SCREENS}/profile-access.png`, fullPage: true });

  await bar.getByRole('button', { name: 'Save changes' }).click();
  await expect.poll(() => api.mutations.find(m => m.path === '/KMProfiles/permissions/set')?.body?.grants
    ?.some((g: { key: string }) => g.key === 'omnitrader.orders.place')).toBe(true);
  const saved = api.mutations.find(m => m.path === '/KMProfiles/permissions/set')!.body;
  expect(saved.id).toBe('sam');
  expect(saved.accessVersion).toBe(4);
  await expect(bar).toHaveCount(0);
});

test('a whole service can be set to a tier in one go', async ({ page, context }) => {
  await installProfilesApiMock(page);
  await signIn(context);
  await page.goto('/administration/profiles/alex?tab=access');
  await ready(page);

  await page.getByRole('tab', { name: /KliveMail/ }).click();
  await page.getByRole('group', { name: 'Grant this service up to a tier' }).getByRole('button', { name: 'Read' }).click();
  await expect(page.getByRole('switch', { name: 'Read mail' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('switch', { name: 'Delete mail' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('region', { name: 'Unsaved permission changes' })).toContainText('+3');
});

test('unused permissions are listed and removed as a draft', async ({ page, context }) => {
  const api = await installProfilesApiMock(page);
  await signIn(context);
  await page.goto('/administration/profiles/sam?tab=access');
  await ready(page);

  const unused = page.getByTestId('show-unused');
  await expect(unused).toBeVisible();
  const count = Number((await unused.locator('.pfx-seg__count').textContent()) ?? '0');
  expect(count).toBeGreaterThan(0);
  await unused.click();
  await expect(page.getByRole('heading', { name: 'Unused for 30 days' })).toBeVisible();
  await page.getByTestId('pfx-remove-unused').click();
  const bar = page.getByRole('region', { name: 'Unsaved permission changes' });
  await expect(bar).toContainText(`−${count}`);
  expect(api.mutations.find(m => m.path === '/KMProfiles/permissions/set')).toBeUndefined(); // nothing saved yet
});

test('the activity tab charts requests and lists what happened', async ({ page, context }) => {
  await installProfilesApiMock(page);
  await signIn(context);
  await page.goto('/administration/profiles/sam?tab=activity');
  await ready(page);

  await expect(page.getByRole('heading', { name: 'Requests by service' })).toBeVisible();
  await expect(page.getByTestId('pfx-timeline')).toContainText('refused · missing permission');
  await expect(page.getByRole('heading', { name: 'Busiest routes' }).locator('xpath=../..')).toContainText('GET /KliveCloud/Browse');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SCREENS}/profile-activity.png`, fullPage: true });
});

test('devices: one is signed out, then the idle ones together', async ({ page, context }) => {
  const api = await installProfilesApiMock(page);
  await signIn(context);
  await page.goto('/administration/profiles/sam?tab=devices');
  await ready(page);

  await page.getByRole('button', { name: 'Sign out Safari on iPhone' }).click();
  await expect.poll(() => api.mutations.find(m => m.path === '/KMProfiles/sessions/revoke')?.body)
    .toEqual({ id: 'sam', sessionId: 'session-sam-1' });

  await page.goto('/administration/profiles/alex?tab=devices');
  await expect(page.getByTestId('pfx-devices')).toContainText('Idle');
  await page.getByTestId('pfx-signout-idle').click();
  // The page has the device list, so each idle device goes by its own id (any server version reads that the same way).
  await expect.poll(() => api.mutations.filter(m => m.path === '/KMProfiles/sessions/revoke').map(m => m.body))
    .toEqual([{ id: 'sam', sessionId: 'session-sam-1' }, { id: 'alex', sessionId: 'session-alex-1' }, { id: 'alex', sessionId: 'session-alex-2' }]);
});

test('on a server from before idle sign-out, only the idle devices are signed out', async ({ page, context }) => {
  // That server reads a revoke without a sessionId as "every device": idleDays must never reach it.
  const api = await installProfilesApiMock(page);
  api.overrides['/KMProfiles/insights'] = { status: 404, body: { error: 'NotFound' } };
  await signIn(context);
  await page.goto('/administration/profiles/alex?tab=devices');
  await ready(page);

  await page.getByTestId('pfx-signout-idle').click();
  await expect.poll(() => api.mutations.filter(m => m.path === '/KMProfiles/sessions/revoke').length).toBe(2);
  const bodies = api.mutations.filter(m => m.path === '/KMProfiles/sessions/revoke').map(m => m.body);
  expect(bodies.every(b => typeof b.sessionId === 'string' && b.idleDays === undefined)).toBe(true);

  // The directory has no idle counts without the review, so it offers no idle sign-out at all.
  await page.goto('/administration/profiles');
  await page.getByRole('button', { name: 'Actions for Alex Moreno' }).click();
  await expect(page.getByRole('menuitem', { name: /Sign out idle devices/ })).toBeDisabled();
});

test('the new-profile wizard creates exactly what was chosen', async ({ page, context }) => {
  const api = await installProfilesApiMock(page);
  await signIn(context);
  await page.goto('/administration/profiles/new');
  await ready(page);

  await page.getByLabel('Name').fill('Riley');
  await page.getByRole('radio', { name: /^Associate/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Generate a password')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('tab', { name: /KliveCloud/ }).click();
  await page.getByRole('group', { name: 'Grant this service up to a tier' }).getByRole('button', { name: 'Read' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText('Check and create')).toBeVisible();
  await page.screenshot({ path: `${SCREENS}/profile-wizard-review.png`, fullPage: true });
  await page.getByRole('button', { name: 'Create Riley' }).click();

  await expect(page.getByRole('heading', { name: 'Riley is ready' })).toBeVisible();
  await expect(page.getByText('Vb7-qL2m-Tx9r-Hd4w-Kp')).toBeVisible();
  const created = api.mutations.find(m => m.path === '/KMProfiles/create')!.body;
  expect(created).toMatchObject({ name: 'Riley', rank: 'Associate', generatePassword: true, password: null });
  expect(created.grants.map((g: { key: string }) => g.key).sort()).toEqual([
    'klivecloud.drive.view', 'klivecloud.files.browse', 'klivecloud.files.download',
  ]);
  await page.screenshot({ path: `${SCREENS}/profile-wizard-done.png` });
});

test('the catalog shows who holds each permission', async ({ page, context }) => {
  await installProfilesApiMock(page);
  await signIn(context);
  await page.goto('/administration/profiles/catalog');
  await ready(page);

  const row = page.getByTestId('cat-klivecloud.files.browse');
  await expect(row).toBeVisible();
  await expect(row.locator('.pfx-avatar')).not.toHaveCount(0);
  await page.getByPlaceholder('Search keys, titles or routes').fill('orders');
  await expect(page.getByTestId('cat-omnitrader.orders.place')).toBeVisible();
  await expect(page.getByTestId('cat-klivecloud.files.browse')).toHaveCount(0);
  await page.screenshot({ path: `${SCREENS}/profiles-catalog.png`, fullPage: true });
});

test('KliveCloud items are shared with people, not ranks', async ({ page, context }) => {
  const api = await installProfilesApiMock(page);
  await signIn(context);
  await page.goto('/klivecloud');
  await ready(page);

  const designs = page.getByTestId('row-Designs');
  await expect(designs).toContainText('2 people');
  await expect(page.getByTestId('row-Quarterly report.pdf')).toContainText('View only');

  await designs.click({ button: 'right' });
  await page.getByTestId('menu-people').click();
  const dialog = page.getByRole('dialog', { name: 'Who can use “Designs”' });
  await expect(dialog).toContainText('Sam Carter');
  await expect(dialog).toContainText('from Team');

  await dialog.getByLabel('Add people').fill('Alex');
  await dialog.getByRole('option', { name: /Alex Moreno/ }).click();
  await dialog.getByLabel("Alex Moreno's access").selectOption('Editor');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SCREENS}/klivecloud-share.png` });
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect.poll(() => api.mutations.find(m => m.path === '/KliveCloud/SetItemAccess')?.body).toEqual({
    itemID: 'f-designs',
    inherit: true,
    everyone: null,
    entries: [{ profileId: 'sam', level: 'Editor' }, { profileId: 'alex', level: 'Editor' }],
  });
  await expect(dialog).toHaveCount(0);
});

test('your account lists your permissions and your devices', async ({ page, context }) => {
  await installProfilesApiMock(page, { me: { rank: 1, userId: 'jo', name: 'Jo Lindqvist' } });
  await signIn(context);
  await page.goto('/account');
  await ready(page, 'Guest');

  await expect(page.getByRole('heading', { name: /Jo Lindqvist/ })).toBeVisible();
  await expect(page.locator('.ac-service-name').filter({ hasText: 'KliveCloud' })).toBeVisible();
  const devices = page.getByTestId('ac-devices').locator('.pfx-device');
  await expect(devices).toHaveCount(2);
  await expect(devices.first()).toContainText('This device');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREENS}/account.png`, fullPage: true });
});

test('the console fits a phone', async ({ page, context }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await installProfilesApiMock(page);
  await signIn(context);

  for (const [path, name] of [
    ['/administration/profiles', 'phone-directory'],
    ['/administration/profiles/sam', 'phone-profile'],
    ['/administration/profiles/sam?tab=access', 'phone-access'],
    ['/administration/profiles/catalog', 'phone-catalog'],
  ] as const) {
    await page.goto(path);
    await expect(page.locator('.pfx').first()).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(600);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `${SCREENS}/${name}.png`, fullPage: false });
  }
});
