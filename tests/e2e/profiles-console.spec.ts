import { expect, test, type Page } from '@playwright/test';
import { installProfilesApiMock, signIn } from './fixtures/profiles-api';

/** Where review screenshots go (Playwright clears test-results on every run). */
const SCREENS = process.env.E2E_SCREENS_DIR ?? 'test-results/screens';

/*
 * The profile console: the directory, a profile's live overview, the permission editor, the
 * new-profile wizard, sessions, and KliveCloud's people-based sharing. Klives is signed in.
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

test('the directory shows who is online, where, and what they hold', async ({ page, context }) => {
  await installProfilesApiMock(page);
  await signIn(context);
  await page.goto('/administration/profiles');
  await ready(page);

  await expect(page.getByRole('heading', { name: 'Profiles', level: 1 })).toBeVisible();
  const rows = page.locator('.pc-row');
  await expect(rows).toHaveCount(5);
  await expect(rows.filter({ hasText: 'Sam Carter' })).toContainText('On KM: Klivecloud');
  await expect(rows.filter({ hasText: 'Jo Lindqvist' })).toContainText('Suspended');
  await expect(rows.filter({ hasText: 'Max Byrne' })).toContainText('Sign-in off');
  await expect(page.locator('.ot-kpi').filter({ hasText: 'Online now' })).toContainText('2');

  await page.getByRole('button', { name: 'Online' }).click();
  await expect(rows).toHaveCount(3);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREENS}/profiles-directory.png`, fullPage: true });
});

test('a profile can be suspended straight from the directory', async ({ page, context }) => {
  const api = await installProfilesApiMock(page);
  await signIn(context);
  await page.goto('/administration/profiles');
  await ready(page);

  await page.getByRole('button', { name: 'Actions for Sam Carter' }).click();
  await page.getByRole('menuitem', { name: 'Suspend…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Suspend Sam Carter' });
  await dialog.getByRole('button', { name: '1 day' }).click();
  await dialog.getByLabel(/Reason/).fill('Taking a break');
  await dialog.getByRole('button', { name: 'Suspend' }).click();

  await expect.poll(() => api.mutations.find(m => m.path === '/KMProfiles/access/suspend')?.body)
    .toEqual({ id: 'sam', minutes: 1440, reason: 'Taking a break' });
  await expect(page.locator('.pc-row').filter({ hasText: 'Sam Carter' })).toContainText('Suspended');
});

test('a profile page shows them live, with what they did recently', async ({ page, context }) => {
  await installProfilesApiMock(page);
  await signIn(context);
  await page.goto('/administration/profiles/sam');
  await ready(page);

  await expect(page.getByRole('heading', { name: /Sam Carter/ })).toBeVisible();
  await expect(page.locator('.pd-presence')).toContainText('On KM: Klivecloud');
  await expect(page.getByText('Requests by service').first()).toBeVisible();
  await expect(page.locator('.tl-item').filter({ hasText: '/KliveCloud/Browse' }).first()).toBeVisible();
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

test('the activity tab charts requests and lists what happened', async ({ page, context }) => {
  await installProfilesApiMock(page);
  await signIn(context);
  await page.goto('/administration/profiles/sam?tab=activity');
  await ready(page);

  await expect(page.getByRole('heading', { name: 'Requests by service' })).toBeVisible();
  await expect(page.locator('.tl-item.denied')).toContainText('refused · missing permission');
  await expect(page.getByText('Klives', { exact: false }).first()).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SCREENS}/profile-activity.png`, fullPage: true });
});

test('one device can be signed out', async ({ page, context }) => {
  const api = await installProfilesApiMock(page);
  await signIn(context);
  await page.goto('/administration/profiles/sam?tab=sessions');
  await ready(page);

  const iphone = page.locator('.ss-item').filter({ hasText: 'Safari on iPhone' });
  await iphone.getByRole('button', { name: 'Sign out' }).click();
  await expect.poll(() => api.mutations.find(m => m.path === '/KMProfiles/sessions/revoke')?.body)
    .toEqual({ id: 'sam', sessionId: 'session-sam-1' });
});

test('the new-profile wizard creates exactly what was chosen', async ({ page, context }) => {
  const api = await installProfilesApiMock(page);
  await signIn(context);
  await page.goto('/administration/profiles/new');
  await ready(page);

  await page.getByLabel('Name').fill('Riley');
  await page.locator('label.pn-rank').filter({ has: page.locator('.km-rank', { hasText: /^Associate$/ }) }).click();
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

test('KliveCloud items are shared with people, not ranks', async ({ page, context }) => {
  const api = await installProfilesApiMock(page);
  await signIn(context);
  await page.goto('/klivecloud');
  await ready(page);

  const designs = page.locator('.file-item').filter({ hasText: 'Designs' });
  await expect(designs).toContainText('2 people');
  await expect(page.locator('.file-item').filter({ hasText: 'Quarterly report.pdf' })).toContainText('View only');

  await designs.hover();
  await designs.getByTitle('Share with people').click();
  const dialog = page.getByRole('dialog', { name: 'Share “Designs”' });
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
  await expect(page.locator('.ss-item')).toHaveCount(2);
  await expect(page.locator('.ss-item').first()).toContainText('This device');
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
  ] as const) {
    await page.goto(path);
    await expect(page.locator('.pc-os')).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `${SCREENS}/${name}.png`, fullPage: false });
  }
});
