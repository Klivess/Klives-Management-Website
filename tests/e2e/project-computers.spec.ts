import { expect, test, type Page } from '@playwright/test';
import { dashboardTestOrigin, installDashboardApiMock } from './fixtures/dashboard-api';

/** A computer as /projects/computers/list reports it. */
function computer(over: Record<string, any> = {}) {
  return {
    containerID: 'computer-1', projectID: 'computers-test', agentID: 'commander', width: 1280, height: 800,
    createdAt: '2026-09-18T12:00:00Z', lastUsedAt: new Date(Date.now() - 120_000).toISOString(),
    state: 'running', vncConnected: true, actionInFlight: false, controlledBy: null,
    daemon: {
      protocol: 2, uptimeSeconds: 5400, authConfigured: true, imageVersion: '14',
      components: { display: true, xvfb: true, x11vnc: true, windowManager: true, panel: true, session: true, browserCdp: true },
      browser: { up: true, process: true, tabs: 3, processes: 9 },
      memory: { usedMB: 1480, limitMB: 2048, availableMB: 560, oomKills: 1 },
      load: 0.4, cpus: 2, diskFreeMB: 18_000,
      events: [{ seq: 4, at: new Date(Date.now() - 600_000).toISOString(), kind: 'oom-kill', message: 'The kernel killed a renderer for memory.' }],
    },
    ...over,
  };
}

async function computers(page: Page, options: { unavailable?: boolean; suspended?: boolean } = {}) {
  await installDashboardApiMock(page, 'Klives');
  await page.context().addCookies([{ name: 'password', value: 'e2e-klives', url: dashboardTestOrigin }]);
  let suspended = options.suspended ?? true;
  const resumeCalls: any[] = [];
  const repairCalls: any[] = [];
  await page.routeWebSocket('wss://klive.dev/projects/**', () => {});
  await page.route('https://klive.dev/projects/**', async route => {
    const url = new URL(route.request().url());
    const json = (value: any) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
    if (url.pathname === '/projects/get') return json({
      projectID: 'computers-test', name: 'Computer test', goal: 'Work', status: 'Active',
      createdAt: '2026-09-18T12:00:00Z', tokenBudgetUsd: 10, moneyBudgetUsd: 0, subAgentCap: 1,
    });
    if (url.pathname === '/projects/computers/health') return json({
      available: !options.unavailable,
      daemonProblem: options.unavailable ? 'Docker engine is unreachable.' : null,
      recoveryStatus: 'Checking host dependencies; computer data is preserved.',
    });
    if (url.pathname === '/projects/computers/list') return json([
      suspended ? computer({ state: 'asleep', vncConnected: false, daemon: null }) : computer(),
    ]);
    if (url.pathname === '/projects/computers/resume') {
      resumeCalls.push(route.request().postDataJSON());
      suspended = false;
      return json({ resumed: true });
    }
    if (url.pathname === '/projects/computers/repair') {
      repairCalls.push(route.request().postDataJSON());
      return json({ ok: true, outcome: 'Browser restarted; sign-ins kept.' });
    }
    if (url.pathname === '/projects/computers/diagnostics') return json({
      containerID: 'computer-1', health: { ok: true, protocol: 2 }, logs: { 'browser-service': 'started' },
    });
    if (url.pathname === '/projects/events') return json({ events: [], lastSequence: 0 });
    if (url.pathname === '/projects/ledger') return json({ tokenSpendUsd: 0, moneySpendUsd: 0 });
    if (url.pathname === '/projects/grandplan') return json({ current: null, versions: [] });
    if (url.pathname === '/projects/digest') return json({});
    return json([]);
  });
  await page.goto('/projects/computers-test');
  await expect(page.getByRole('heading', { name: 'Computer test' })).toBeVisible();
  await page.getByRole('tab', { name: 'Computers' }).click();
  return { resumeCalls, repairCalls };
}

test('sleeping computers preserve their setup and resume explicitly', async ({ page }) => {
  const { resumeCalls } = await computers(page);
  // A project whose ID starts with "computers" is still a workspace, not the fleet page.
  const nav = page.getByRole('navigation', { name: 'Projects sections' });
  await expect(nav.getByRole('link', { name: 'Operations', exact: true })).toHaveClass(/active/);
  await expect(nav.getByRole('link', { name: 'Computers', exact: true })).not.toHaveClass(/active/);
  await expect(page.getByText('Sleeping — installed apps and files are preserved.')).toBeVisible();
  await expect(page.locator('.live-desktop')).toHaveCount(0);
  await page.getByRole('button', { name: 'Resume computer' }).click();
  await expect(page.locator('.live-desktop')).toHaveCount(1);
  expect(resumeCalls).toEqual([{ containerID: 'computer-1' }]);
});

test('host outages have a diagnosis instead of an endless connecting screen', async ({ page }) => {
  const { resumeCalls } = await computers(page, { unavailable: true });
  await expect(page.getByText('Project computers are unavailable')).toBeVisible();
  await expect(page.getByText('Docker engine is unreachable.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume computer' })).toBeDisabled();
  await expect(page.locator('.live-desktop')).toHaveCount(0);
  expect(resumeCalls).toHaveLength(0);
});

test('a running computer shows its health and repairs without a restart', async ({ page }, testInfo) => {
  const { repairCalls } = await computers(page, { suspended: false });
  const card = page.locator('[data-container-id="computer-1"]');
  await expect(card).toContainText('3 tabs');
  await expect(card).toContainText('1480/2048 MB');
  await expect(card).toContainText('1 OOM');
  await expect(card).toContainText('The kernel killed a renderer for memory.');
  await page.screenshot({ path: testInfo.outputPath('computers-tab.png'), fullPage: true });

  await page.getByLabel('Repair Commander').selectOption('restart-browser');
  await expect.poll(() => repairCalls).toEqual([{ containerID: 'computer-1', action: 'restart-browser' }]);
  await expect(page.getByText('Commander: Browser restarted; sign-ins kept.')).toBeVisible();

  await card.getByRole('button', { name: 'Diagnose' }).click();
  await expect(page.getByRole('dialog', { name: /Commander/ })).toBeVisible();
});
