import { expect, test, type Page } from '@playwright/test';
import { mePayload, permissionsForRank } from './fixtures/permissions';
import { denial, installProfilesApiMock, signIn, testOrigin } from './fixtures/profiles-api';

/** Where review screenshots go (Playwright clears test-results on every run). */
const SCREENS = process.env.E2E_SCREENS_DIR ?? 'test-results/screens';

/*
 * The site's half of the access contract:
 *   - pages and nav follow the profile's permissions (and change live)
 *   - a refused request is explained in place — never a redirect or a dialog
 *   - only a 401 signs out, and the login page says why
 */

const GUEST = { rank: 1, userId: 'jo', name: 'Jo Lindqvist' };

/** The first page a cold dev server compiles can take a while; wait until the profile is in. */
async function profileLoaded(page: Page, rank = 'Guest') {
  const account = page.getByTestId('nav-account');
  try {
    await expect(account).toContainText(rank, { timeout: 30_000 });
  } catch {
    // Nuxt dev occasionally leaves an empty document: one reload (as dashboard.spec.ts does).
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(account).toContainText(rank, { timeout: 30_000 });
  }
}

test('a limited profile only sees the pages it may open', async ({ page, context }) => {
  await installProfilesApiMock(page, { me: GUEST });
  await signIn(context);
  await page.goto('/klivecloud');
  await profileLoaded(page);

  const nav = page.locator('nav.vnav-body');
  await expect(nav.getByRole('link', { name: 'KliveCloud' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'OmniTrader' })).toBeVisible();
  for (const hidden of ['Omniscience', 'OmniDefence', 'Tripwires', 'KliveMail', 'KliveAgent', 'Projects', 'Profiles', 'API telemetry']) {
    await expect(nav.getByRole('link', { name: hidden, exact: true })).toHaveCount(0);
  }
});

test('a page it cannot open says why, in place, with the nav kept', async ({ page, context }) => {
  const api = await installProfilesApiMock(page, { me: GUEST });
  await signIn(context);
  await page.goto('/omnidefence');
  await profileLoaded(page);

  await expect(page.getByRole('heading', { name: "You can't open OmniDefence" })).toBeVisible();
  await expect(page.getByText('View defence overview')).toBeVisible();
  await expect(page).toHaveURL(/\/omnidefence$/);
  await expect(page.getByTestId('nav-account')).toBeVisible();
  // The page never mounted, so it never asked for anything it would be refused.
  expect(api.requested.filter(path => path.startsWith('/omnidefence'))).toEqual([]);
  await page.screenshot({ path: `${SCREENS}/access-denied.png`, fullPage: true });
});

test('a refused request is explained once, without leaving the page', async ({ page, context }) => {
  const api = await installProfilesApiMock(page, { me: GUEST });
  api.overrides['/KliveCloud/Browse'] = denial('klivecloud.files.browse', '/KliveCloud/Browse');
  await signIn(context);
  await page.goto('/klivecloud');

  const toast = page.getByRole('region', { name: 'Access notices' });
  await expect(toast.getByText('Missing permission: Browse files')).toBeVisible();
  await expect(toast.getByText('KliveCloud · Read')).toBeVisible();
  await expect(page).toHaveURL(/\/klivecloud$/);
  await expect(page.locator('.swal2-popup')).toHaveCount(0);
  await page.screenshot({ path: `${SCREENS}/access-toast.png` });
});

test('access granted live: the page and the nav update without a reload', async ({ page, context }) => {
  const api = await installProfilesApiMock(page, { me: GUEST });
  await signIn(context);
  await page.goto('/omnidefence');
  await expect(page.getByRole('heading', { name: "You can't open OmniDefence" })).toBeVisible();

  // Klives grants a permission: the server pushes `access-changed` down the session channel.
  api.me = mePayload({ ...GUEST, permissions: [...permissionsForRank(1), 'omnidefence.overview.view'], accessVersion: 2 });
  await expect.poll(() => api.sessionWatch !== null).toBe(true);
  api.sessionWatch!.send(JSON.stringify({ type: 'access-changed', version: 2 }));

  await expect(page.getByRole('heading', { name: "You can't open OmniDefence" })).toHaveCount(0);
  await expect(page.locator('nav.vnav-body').getByRole('link', { name: 'OmniDefence' })).toBeVisible();
  await expect(page).toHaveURL(/\/omnidefence$/);
});

test('suspended: the site locks and says why and for how long', async ({ page, context }) => {
  await installProfilesApiMock(page, {
    me: { rank: 3, userId: 'alex', name: 'Alex Moreno', suspended: true, suspensionReason: 'Reviewing the OmniTrader settings', suspendedUntilUtc: new Date(Date.now() + 2 * 3_600_000).toISOString() },
  });
  await signIn(context);
  await page.goto('/dashboard');

  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Your access is suspended');
  await expect(dialog).toContainText('Reviewing the OmniTrader settings');
  await expect(dialog).toContainText('Lifts in');
  await expect(dialog.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await page.screenshot({ path: `${SCREENS}/access-suspended.png` });
});

test('read-only: a banner says changes are blocked', async ({ page, context }) => {
  await installProfilesApiMock(page, { me: { rank: 3, userId: 'alex', name: 'Alex Moreno', readOnly: true } });
  await signIn(context);
  await page.goto('/klivecloud');

  await expect(page.getByRole('status').filter({ hasText: 'Read-only.' })).toBeVisible();
  await page.getByRole('button', { name: 'Hide' }).click();
  await expect(page.getByText('Read-only.')).toHaveCount(0);
});

test('a session ended elsewhere signs this tab out, with the reason', async ({ page, context }) => {
  const api = await installProfilesApiMock(page, { me: GUEST });
  await signIn(context);
  await page.goto('/klivecloud');
  await expect.poll(() => api.sessionWatch !== null).toBe(true);

  api.sessionWatch!.send(JSON.stringify({ type: 'session-state', state: 'SessionRevoked', reason: 'Signed out by Klives' }));

  await expect(page).toHaveURL(/signedOut=SessionRevoked/);
  await expect(page.getByText('You were signed out')).toBeVisible();
  await expect(page.getByText('Signed out by Klives')).toBeVisible();
  expect((await context.cookies()).find(c => c.name === 'km_session')).toBeUndefined();
  await page.screenshot({ path: `${SCREENS}/login-signed-out.png` });
});

test('a 401 from the API signs out and says why', async ({ page, context }) => {
  const api = await installProfilesApiMock(page, { me: GUEST });
  api.overrides['/KMProfiles/me'] = {
    status: 401,
    headers: { RequestDeniedCode: '6', RequestDeniedReason: 'SessionExpired' },
    body: { error: 'Unauthorized', reason: 'SessionExpired', code: 6, route: '/KMProfiles/me', message: 'Your session expired. Sign in again.' },
  };
  await signIn(context);
  await page.goto('/klivecloud');

  await expect(page).toHaveURL(/signedOut=SessionExpired/);
  await expect(page.getByText('Your session expired')).toBeVisible();
  // It returns to where it was after signing in again.
  await expect(page).toHaveURL(/next=(%2F|\/)klivecloud/);
});

test('signing in keeps a session token, never the password', async ({ page, context }) => {
  const api = await installProfilesApiMock(page, { me: { isOwner: true, userId: 'klives', name: 'Klives' } });
  await page.goto('/');
  await page.getByTestId('login-password').fill('correct horse battery');
  await page.getByTestId('login-submit').click();

  await expect(page).toHaveURL(/\/dashboard$/);
  const cookies = await context.cookies();
  expect(cookies.find(c => c.name === 'km_session')?.value).toBe('kms_e2e');
  expect(cookies.find(c => c.name === 'password')).toBeUndefined();
  expect(api.mutations.find(m => m.path === '/KMProfiles/Login')?.body).toEqual({ password: 'correct horse battery' });
});

test('a wrong password says so and stays on the form', async ({ page }) => {
  const api = await installProfilesApiMock(page);
  api.overrides['/KMProfiles/Login'] = { status: 401, body: { error: "That password doesn't match any profile.", reason: 'InvalidCredential' } };
  await page.goto('/');
  await page.getByTestId('login-password').fill('nope');
  await page.getByTestId('login-submit').click();

  await expect(page.getByRole('alert')).toHaveText("That password doesn't match any profile.");
  await expect(page).toHaveURL(new RegExp(`^${testOrigin}/?$`));
  await page.screenshot({ path: `${SCREENS}/login-error.png` });
});

test('a password kept by the previous site is traded for a session', async ({ page, context }) => {
  const api = await installProfilesApiMock(page, { me: GUEST });
  await context.addCookies([{ name: 'password', value: 'old-password', url: testOrigin }]);
  await page.goto('/klivecloud');

  await expect.poll(async () => (await context.cookies()).find(c => c.name === 'km_session')?.value).toBe('kms_e2e');
  expect((await context.cookies()).find(c => c.name === 'password')).toBeUndefined();
  expect(api.mutations.find(m => m.path === '/KMProfiles/Login')?.body).toEqual({ password: 'old-password' });
});
