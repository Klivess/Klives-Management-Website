import { expect, test, type Page } from '@playwright/test';
import { dashboardTestOrigin, installDashboardApiMock } from './fixtures/dashboard-api';
import { mePayload } from './fixtures/permissions';

/*
 * Reported 2026-11-11: a profile without the permission could tick "Reveal secrets" on Accounts and
 * read every agent password. The page now reveals one secret at a time, only for a profile holding
 * accounts.secrets.reveal, and the server refuses everyone else (AccountSecretsRevealGateTests).
 */

const accounts = [
  { accountID: 'acc-1', serviceKey: 'example-social.test', serviceDisplay: 'Example Social', username: 'studio_one', email: 'studio.one@klive.dev', description: 'Publishing account for the studio page.', notes: '', status: 'Active', createdBy: 'project:p-1', owners: ['project:p-1', 'KliveAgent'], createdAt: new Date(Date.now() - 20 * 86_400_000).toISOString(), updatedAt: new Date().toISOString(), lastUsedAt: new Date(Date.now() - 3_600_000).toISOString(), secrets: [{ name: 'password', value: '••••••', placeholder: '{account:example-social.test/studio_one/password}', updatedAt: new Date().toISOString() }] },
  { accountID: 'acc-2', serviceKey: 'example-shop.test', serviceDisplay: 'Example Shop', username: 'seller@klive.dev', email: 'seller@klive.dev', description: '', notes: 'Payouts need a verified email.', status: 'Banned', createdBy: 'project:p-2', owners: [], createdAt: new Date(Date.now() - 40 * 86_400_000).toISOString(), updatedAt: new Date().toISOString(), secrets: [{ name: 'password', value: '••••••', placeholder: '{account:example-shop.test/seller@klive.dev/password}', updatedAt: new Date().toISOString() }] },
];

async function setup(page: Page, permissions?: string[]) {
  const overrides = permissions
    ? { '/KMProfiles/me': mePayload({ rank: 4, permissions, userId: 'e2e-viewer', name: 'Viewer Fixture' }) }
    : {};
  await installDashboardApiMock(page, permissions ? 'Admin' : 'Klives', overrides);
  await page.context().addCookies([{ name: 'password', value: permissions ? 'e2e-admin' : 'e2e-klives', url: dashboardTestOrigin }]);
  const state = { requested: [] as string[], mutations: [] as { path: string; body: any }[] };
  await page.route('https://klive.dev/accounts/**', async route => {
    const url = new URL(route.request().url());
    state.requested.push(url.pathname + url.search);
    const json = (value: any, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (url.pathname === '/accounts/list') return json(accounts);
    if (url.pathname === '/accounts/secret') return json({ accountID: url.searchParams.get('accountID'), name: url.searchParams.get('name'), value: 'fixture-pass-1' });
    if (route.request().method() === 'POST') { state.mutations.push({ path: url.pathname, body: route.request().postDataJSON() }); return json({ updated: true, deleted: true }); }
    return route.fallback();
  });
  await page.route('https://klive.dev/projects/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/projects/list') return route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ projectID: 'p-1', name: 'Studio page', status: 'Active' }]) });
    if (url.pathname === '/projects/computers/health') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ available: true }) });
    return route.fallback();
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto('/projects/accounts', { waitUntil: 'domcontentloaded' });
    try { await expect(page.getByTestId('accounts-table')).toBeVisible({ timeout: 20_000 }); break; }
    catch (e) { if (attempt === 2) throw e; }
  }
  return state;
}

test('the owner reveals one secret at a time, copies it and manages records', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1500, height: 900 });
  const state = await setup(page);
  const row = page.locator('tr[data-account-id="acc-1"]');
  await expect(row).toContainText('Studio page');
  await expect(row.getByLabel('password for example-social.test', { exact: true })).toHaveText('••••••••');
  await row.getByRole('button', { name: 'Reveal the password for example-social.test' }).click();
  await expect(row.getByLabel('password for example-social.test', { exact: true })).toHaveText('fixture-pass-1');
  expect(state.requested.filter(p => p.startsWith('/accounts/secret'))).toEqual(['/accounts/secret?accountID=acc-1&name=password']);
  expect(state.requested.some(p => p.includes('revealSensitive'))).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('accounts.png'), fullPage: true });
  await row.getByRole('button', { name: 'Hide the password for example-social.test' }).click();
  await expect(row.getByLabel('password for example-social.test', { exact: true })).toHaveText('••••••••');

  await page.locator('tr[data-account-id="acc-2"]').getByRole('button', { name: 'Delete example-shop.test seller@klive.dev' }).click();
  await page.getByRole('dialog', { name: 'Delete this account record?' }).getByRole('button', { name: 'Delete' }).click();
  await expect.poll(() => state.mutations.at(-1)).toEqual({ path: '/accounts/delete', body: { accountID: 'acc-2' } });
  await expect(page.locator('tr[data-account-id="acc-2"]')).toHaveCount(0);
});

test('a profile that may only view the registry gets no way to reveal or edit', async ({ page }) => {
  const state = await setup(page, ['accounts.registry.read', 'projects.overview.view']);
  const row = page.locator('tr[data-account-id="acc-1"]');
  await expect(row).toContainText('studio_one');
  await expect(row.getByRole('button', { name: /Reveal the password/ })).toHaveCount(0);
  await expect(row.getByRole('button', { name: /Copy the password for/ })).toHaveCount(0);
  await expect(row.getByRole('button', { name: /Delete/ })).toHaveCount(0);
  await expect(page.getByText('Your profile can see which accounts exist, not their secrets.')).toBeVisible();
  // The placeholder (what agents type) is not a secret and stays copyable.
  await expect(row.getByRole('button', { name: 'Copy the password placeholder for example-social.test' })).toBeVisible();
  expect(state.requested.some(p => p.startsWith('/accounts/secret') || p.includes('revealSensitive'))).toBe(false);
});
