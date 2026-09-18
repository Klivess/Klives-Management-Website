import { expect, test, type Page } from '@playwright/test';
import { dashboardTestOrigin, installDashboardApiMock } from './fixtures/dashboard-api';

async function computers(page: Page, unavailable = false) {
  await installDashboardApiMock(page, 'Klives');
  await page.context().addCookies([{ name: 'password', value: 'e2e-klives', url: dashboardTestOrigin }]);
  let suspended = true;
  const resumeCalls: any[] = [];
  await page.routeWebSocket('wss://klive.dev/projects/**', () => {});
  await page.route('https://klive.dev/projects/**', async route => {
    const url = new URL(route.request().url());
    const json = (value: any) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
    if (url.pathname === '/projects/get') return json({
      projectID: 'computers-test', name: 'Computer test', goal: 'Work', status: 'Active',
      createdAt: '2026-09-18T12:00:00Z', tokenBudgetUsd: 10, moneyBudgetUsd: 0, subAgentCap: 1,
    });
    if (url.pathname === '/projects/computers/health') return json({
      daemonProblem: unavailable ? 'Docker engine is unreachable.' : null,
      recoveryStatus: 'Checking host dependencies; computer data is preserved.',
    });
    if (url.pathname === '/projects/containers') return json([
      { containerID: 'computer-1', agentID: 'commander', suspended, lost: false },
    ]);
    if (url.pathname === '/projects/computers/resume') {
      resumeCalls.push(route.request().postDataJSON());
      suspended = false;
      return json({ resumed: true });
    }
    if (url.pathname === '/projects/events') return json({ events: [], lastSequence: 0 });
    if (url.pathname === '/projects/ledger') return json({ tokenSpendUsd: 0, moneySpendUsd: 0 });
    if (url.pathname === '/projects/grandplan') return json({ current: null, versions: [] });
    if (url.pathname === '/projects/digest') return json({});
    return json([]);
  });
  await page.goto('/projects/computers-test');
  await expect(page.getByRole('heading', { name: 'Computer test' })).toBeVisible();
  await page.getByRole('button', { name: 'Desktops', exact: true }).click();
  return resumeCalls;
}

test('sleeping computers preserve their setup and resume explicitly', async ({ page }) => {
  const calls = await computers(page);
  await expect(page.getByText('Sleeping — installed apps and files are preserved.')).toBeVisible();
  await expect(page.locator('.live-desktop')).toHaveCount(0);
  await page.getByRole('button', { name: 'Resume computer' }).click();
  await expect(page.locator('.live-desktop')).toHaveCount(1);
  expect(calls).toEqual([{ containerID: 'computer-1' }]);
});

test('host outages have a diagnosis instead of an endless connecting screen', async ({ page }) => {
  const calls = await computers(page, true);
  await expect(page.getByText('Project computers are unavailable')).toBeVisible();
  await expect(page.getByText('Docker engine is unreachable.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume computer' })).toBeDisabled();
  await expect(page.locator('.live-desktop')).toHaveCount(0);
  expect(calls).toHaveLength(0);
});
