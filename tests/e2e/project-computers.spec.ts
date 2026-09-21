import { expect, test, type Page } from '@playwright/test';
import { dashboardTestOrigin, installDashboardApiMock } from './fixtures/dashboard-api';

async function computers(page: Page, unavailable = false, worker = false) {
  await installDashboardApiMock(page, 'Klives');
  await page.context().addCookies([{ name: 'password', value: 'e2e-klives', url: dashboardTestOrigin }]);
  let suspended = true;
  const resumeCalls: any[] = [];
  const requests: any[] = [];
  const inputSockets: string[] = [];
  const jobs: any[] = [];
  await page.routeWebSocket('wss://klive.dev/projects/**', () => {});
  await page.routeWebSocket('wss://klive.dev/projects/containers/remote/input?*', socket => { inputSockets.push(socket.url()); });
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
      worker ? { computerID: 'ka-one', agentID: 'commander', provider: 'incus', state: 'ready' }
        : { containerID: 'computer-1', agentID: 'commander', suspended, lost: false },
    ]);
    if (url.pathname === '/projects/computers/request') {
      const request = route.request().postDataJSON();
      requests.push(request);
      if (request.target === 'jobs' && request.method === 'POST') {
        const job = { id: request.payload.operationID, state: 'running' };
        jobs.push(job); return json(job);
      }
      if (request.target === 'jobs') return json(jobs);
      return json({ id: request.target.split('/')[1], state: 'running', cursor: 5, output: request.cursor ? '' : 'hello' });
    }
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
  return { resumeCalls, requests, inputSockets };
}

test('sleeping computers preserve their setup and resume explicitly', async ({ page }) => {
  const { resumeCalls: calls } = await computers(page);
  await expect(page.getByText('Sleeping — installed apps and files are preserved.')).toBeVisible();
  await expect(page.locator('.live-desktop')).toHaveCount(0);
  await page.getByRole('button', { name: 'Resume computer' }).click();
  await expect(page.locator('.live-desktop')).toHaveCount(1);
  expect(calls).toEqual([{ containerID: 'computer-1' }]);
});

test('host outages have a diagnosis instead of an endless connecting screen', async ({ page }) => {
  const { resumeCalls: calls } = await computers(page, true);
  await expect(page.getByText('Project computers are unavailable')).toBeVisible();
  await expect(page.getByText('Docker engine is unreachable.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume computer' })).toBeDisabled();
  await expect(page.locator('.live-desktop')).toHaveCount(0);
  expect(calls).toHaveLength(0);
});

test('viewing a worker leaves agent input available and terminals reconnect to the same job', async ({ page }) => {
  const { requests, inputSockets } = await computers(page, false, true);
  await page.locator('.live-desktop').click();
  await expect(page.getByRole('button', { name: '👁 View only', exact: true })).toBeVisible();
  expect(inputSockets).toHaveLength(0);
  await page.getByRole('button', { name: '👁 View only', exact: true }).click();
  await expect.poll(() => inputSockets.length).toBe(1);
  await page.getByRole('button', { name: '🖲 Controlling', exact: true }).click();
  await page.getByRole('button', { name: 'Terminal', exact: true }).click();
  await page.getByLabel('Command', { exact: true }).fill('sleep 120; echo hello');
  await page.getByRole('button', { name: 'Start new job' }).click();
  await expect(page.getByLabel('Terminal output')).toContainText('hello');
  const launches = () => requests.filter(r => r.target === 'jobs' && r.method === 'POST');
  expect(launches()).toHaveLength(1);
  const id = launches()[0].payload.operationID;
  await page.getByTitle('Close (Esc)').click();
  await page.locator('.live-desktop').click();
  await page.getByRole('button', { name: 'Terminal', exact: true }).click();
  await expect(page.getByText(`Job ${id}`, { exact: false })).toBeVisible();
  await expect(page.getByLabel('Terminal output')).toContainText('hello');
  expect(launches()).toHaveLength(1);
});
