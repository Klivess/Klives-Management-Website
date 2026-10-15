import { expect, test, type Page } from '@playwright/test';
import { dashboardTestOrigin, installDashboardApiMock } from './fixtures/dashboard-api';

/**
 * The Projects workspace on the ot-os design system: the project Overview (decisions first), the
 * fleet Computers page, site Playbooks and the autonomy limits in Settings. Every route is mocked;
 * these tests pin what Klives sees and the exact contracts the buttons send.
 */

const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

function computer(over: Record<string, any> = {}) {
  return {
    containerID: 'c-commander-0001', projectID: 'storefront', agentID: 'commander', width: 1280, height: 800,
    createdAt: iso(86_400_000), lastUsedAt: iso(60_000), state: 'running', vncConnected: true, actionInFlight: false, controlledBy: null,
    daemon: {
      protocol: 2, uptimeSeconds: 7200, authConfigured: true, imageVersion: '14',
      components: { display: true, x11vnc: true, windowManager: true, panel: false, session: true, browserProcess: true, browserCdp: true },
      browser: { up: true, process: true, tabs: 2, processes: 7 },
      memory: { usedMB: 900, limitMB: 2048, availableMB: 1100, oomKills: 0 },
      load: 0.3, cpus: 2, diskFreeMB: 20_000, events: [],
    },
    ...over,
  };
}

const fleet = [
  computer(),
  computer({ containerID: 'c-scraper-0002', agentID: 'w1', state: 'asleep', vncConnected: false, daemon: null }),
  computer({ containerID: 'c-writer-0003', projectID: 'newsletter', agentID: 'w7', state: 'unreachable', vncConnected: false, daemon: null }),
];

type Mutation = { path: string; body: any };

async function workspace(page: Page, extra: (path: string, url: URL) => any = () => undefined) {
  await installDashboardApiMock(page, 'Klives');
  await page.context().addCookies([{ name: 'password', value: 'e2e-klives', url: dashboardTestOrigin }]);
  const state = {
    mutations: [] as Mutation[],
    gates: [{ gateID: 'g1', kind: 'action', title: 'First visit to paypal.com', description: 'The scraper wants to open paypal.com to connect payouts.', rationale: 'paypal.com is on your ask-first list.' }],
    playbooks: [
      { domain: 'etsy.com', summary: 'Listing products and replying to buyers.', steps: ['Open Shop Manager', 'Add a listing'], pitfalls: ['Photos must be 2000px wide'], urls: [{ label: 'Shop manager', url: 'https://www.etsy.com/your/shops/me' }], updatedBy: 'project:storefront/w1', updatedAt: iso(3_600_000), verifiedAt: iso(3_600_000), revisions: 3 },
      { domain: 'tiktok.com', summary: 'Posting short videos.', steps: ['Upload from /project/outputs'], pitfalls: [], urls: [], updatedBy: 'klives', updatedAt: iso(86_400_000), verifiedAt: null, revisions: 1 },
    ] as any[],
    settings: {
      commanderRoutes: ['anthropic/claude-sonnet-4.5'], utilityRoutes: ['openai/gpt-4.1-mini'], councilRoutes: ['anthropic/claude-sonnet-4.5'],
      tierTextRoutes: ['openai/gpt-4.1-mini'], tierTextImageRoutes: ['openai/gpt-4.1'], tierTextImageVideoRoutes: ['anthropic/claude-sonnet-4.5'],
      tierTextImageVideoAudioRoutes: ['google/gemini-2.5-pro'], stimulusFreeRoutes: ['openai/gpt-4.1-mini'], stimulusFallbackRoutes: ['openai/gpt-4.1-mini'],
      routeParameters: {}, visionEnabled: true, containersEnabled: true, liveActivityStreaming: true, desktopImage: 'omnipotent/projects-desktop:latest',
      blockedDomains: ['facebook.com'], askFirstDomains: [], allowHostShell: true, allowOutboundEmail: true, allowAccountCreation: true,
    } as Record<string, any>,
  };
  await page.routeWebSocket('wss://klive.dev/projects/**', () => {});
  await page.route('https://klive.dev/projects/**', async route => {
    const url = new URL(route.request().url());
    const json = (value: any, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    const custom = extra(url.pathname, url);
    if (custom !== undefined) return json(custom);
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      state.mutations.push({ path: url.pathname, body });
      if (url.pathname === '/projects/gates/resolve') state.gates = state.gates.filter(g => g.gateID !== body.gateID);
      if (url.pathname === '/projects/playbooks/save') {
        state.playbooks = [...state.playbooks.filter(p => p.domain !== body.domain), { ...body, updatedBy: 'klives', updatedAt: new Date().toISOString(), verifiedAt: body.verified ? new Date().toISOString() : null, revisions: 1 }];
        return json({ ok: true, playbook: body });
      }
      if (url.pathname === '/projects/playbooks/delete') { state.playbooks = state.playbooks.filter(p => p.domain !== body.domain); return json({ ok: true }); }
      if (url.pathname === '/projects/settings/update') {
        Object.assign(state.settings, body);
        return json({ applied: Object.keys(body).filter(k => k !== 'projectID'), unknown: [], settings: state.settings, desktopAllocation: 'PerAgentContainers' });
      }
      if (url.pathname === '/projects/computers/repair') return json({ ok: true, outcome: 'Desktop components restarted; the browser kept running.' });
      return json({ ok: true });
    }
    switch (url.pathname) {
      case '/projects/get': return json({ projectID: 'storefront', name: 'Etsy storefront', goal: 'Run a profitable print-on-demand storefront and report weekly.', status: 'Active', createdAt: iso(5 * 86_400_000), tokenBudgetUsd: 50, moneyBudgetUsd: 20, moneyAutonomousThresholdUsd: 5, subAgentCap: 4 });
      case '/projects/gates': return json(state.gates);
      case '/projects/steps': return json({ steps: [
        { stepID: 's0', title: 'Register the shop', status: 'Done' },
        { stepID: 's1', title: 'List the first ten products', status: 'Active', attempts: 2, nextConcreteAction: 'Upload the mug photos from outputs/photos' },
        { stepID: 's2', title: 'Write the about page', status: 'Pending' },
      ] });
      case '/projects/computers/list': return json(url.searchParams.get('projectID') ? fleet.filter(c => c.projectID === url.searchParams.get('projectID')) : fleet);
      case '/projects/computers/health': return json({ available: true, daemonProblem: null, endpoint: 'npipe://./pipe/docker_engine', lastSupervisionUtc: iso(30_000),
        capacity: { daemonMemoryGB: 8, desktopMemoryLimitGB: 2, maxRunningDesktops: 3, running: 1, stopped: 1, idleSuspendMinutes: 30 } });
      case '/projects/computers/diagnostics': return json({ containerID: url.searchParams.get('containerID'),
        health: { ok: true, protocol: 2, uptimeSeconds: 7200, browserUp: true, components: fleet[0].daemon!.components, browser: { tabs: 2, processCount: 7 },
          resources: { memory: { usedMB: 900, limitMB: 2048, availableMB: 1100, oomKills: 0 }, load1: 0.3, cpus: 2, rootFreeMB: 20000 }, image: { version: '14' } },
        topMemory: [{ pid: 41, comm: 'chromium', rssMB: 610 }, { pid: 7, comm: 'Xvfb', rssMB: 90 }],
        events: [{ seq: 1, at: iso(7_000_000), kind: 'started', message: 'klive-computerd started.' }], logs: { 'browser-service': 'listening on 5902' } });
      case '/projects/list': return json([{ projectID: 'storefront', name: 'Etsy storefront' }, { projectID: 'newsletter', name: 'Newsletter' }]);
      case '/projects/agents': return json([
        { agentID: 'commander', role: 'commander', isCommander: true, awake: true, objective: 'Coordinate the storefront.', lastReportAt: iso(120_000) },
        { agentID: 'w1', role: 'scraper', isCommander: false, awake: false, objective: 'Collect competitor prices.', lastReportAt: iso(3_600_000) },
      ]);
      case '/projects/observables': return json([{ observableID: 'o1', name: 'Revenue this week', type: 'Numeric', displayValue: '$120.00', updatedAt: iso(600_000),
        history: Array.from({ length: 8 }, (_, i) => ({ timestamp: iso((8 - i) * 3_600_000), value: 40 + i * 10, numericValue: 40 + i * 10 })) }]);
      case '/projects/digest': return json({ currentFocus: 'Get the first ten listings live before the weekend.' });
      case '/projects/ledger': return json({ tokenSpendUsd: 12.5, moneySpendUsd: 3 });
      case '/projects/grandplan': return json({ current: { version: 2, content: { milestones: [
        { id: 'm1', title: 'Shop registered', status: 'Done' }, { id: 'm2', title: 'Ten listings live', status: 'InProgress' }, { id: 'm3', title: 'First sale', status: 'Pending' },
      ] } }, versions: [] });
      case '/projects/events': return json({ events: [
        { sequence: 10, eventID: 'e10', type: 'commander-message', author: 'commander', agentID: 'commander', text: 'Two listings are live; photos for the rest are uploading.', timestamp: iso(900_000) },
      ], lastSequence: 10 });
      case '/projects/playbooks': return json(state.playbooks);
      case '/projects/settings': return json(state.settings);
      default: return json([]);
    }
  });
  return state;
}

test('the project overview puts decisions first and summarises the work', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const state = await workspace(page);
  await page.goto('/projects/storefront');
  await expect(page.getByRole('heading', { name: 'Etsy storefront', level: 1 })).toBeVisible();

  const approvals = page.getByRole('region', { name: 'Approvals waiting for you' });
  await expect(approvals).toContainText('First visit to paypal.com');
  await expect(page.getByRole('region', { name: 'Project at a glance' })).toContainText('$12.50');
  await expect(page.getByText('List the first ten products')).toBeVisible();
  await expect(page.getByText('Next: Upload the mug photos from outputs/photos')).toBeVisible();
  await expect(page.locator('.po-messages')).toContainText('Two listings are live; photos for the rest are uploading.');
  await expect(page.locator('.po-obs')).toContainText('Revenue this week');
  await page.screenshot({ path: testInfo.outputPath('workspace-overview.png'), fullPage: true });

  await approvals.getByRole('button', { name: 'Approve' }).click();
  await expect.poll(() => state.mutations.find(m => m.path === '/projects/gates/resolve')?.body)
    .toEqual({ projectID: 'storefront', gateID: 'g1', decision: 'Approve', comment: '' });
  await expect(approvals).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('old tab links still land on the right section', async ({ page }) => {
  await workspace(page);
  await page.goto('/projects/storefront?tab=desktops');
  await expect(page.getByRole('tab', { name: 'Computers' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-container-id="c-commander-0001"]')).toBeVisible();
});

test('autonomy limits save as hard rules the server enforces', async ({ page }) => {
  const state = await workspace(page);
  await page.goto('/projects/storefront?tab=settings');
  const blocked = page.getByLabel('Blocked sites');
  await expect(blocked).toHaveValue('facebook.com');
  await blocked.fill('facebook.com\ninstagram.com');
  await page.getByLabel('Ask-first sites').fill('paypal.com');
  await page.getByLabel('Send email').uncheck();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect.poll(() => state.mutations.find(m => m.path === '/projects/settings/update')?.body).toEqual({
    projectID: 'storefront', blockedDomains: ['facebook.com', 'instagram.com'], askFirstDomains: ['paypal.com'], allowOutboundEmail: false,
  });
  await expect(page.getByRole('button', { name: 'Saved' })).toBeDisabled();
});

test('the computers page shows the whole fleet and repairs gently', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const state = await workspace(page);
  await page.goto('/projects/computers');
  const summary = page.getByRole('region', { name: 'Computer host summary' });
  await expect(summary).toContainText('1 / 3');
  await expect(page.locator('[data-container-id]')).toHaveCount(3);
  await page.screenshot({ path: testInfo.outputPath('computers-fleet.png'), fullPage: true });

  await page.getByRole('group', { name: 'Filter computers' }).getByRole('button', { name: /Problems/ }).click();
  await expect(page.locator('[data-container-id]')).toHaveCount(1);
  await expect(page.locator('[data-container-id="c-writer-0003"]')).toContainText('Unreachable');

  await page.getByRole('group', { name: 'Filter computers' }).getByRole('button', { name: /All/ }).click();
  await page.getByLabel('Repair Commander').selectOption('restart-components');
  await expect.poll(() => state.mutations.find(m => m.path === '/projects/computers/repair')?.body)
    .toEqual({ containerID: 'c-commander-0001', action: 'restart-components' });
  await expect(page.getByText('Desktop components restarted; the browser kept running.')).toBeVisible();

  await page.locator('[data-container-id="c-commander-0001"]').getByRole('button', { name: 'Diagnose' }).click();
  const drawer = page.getByRole('dialog', { name: /Commander/ });
  await expect(drawer).toContainText('chromium');
  await expect(drawer).toContainText('klive-computerd started.');
});

test('playbooks can be searched, written and removed', async ({ page }, testInfo) => {
  const state = await workspace(page);
  await page.goto('/projects/playbooks');
  await expect(page.getByText('etsy.com')).toBeVisible();
  await page.getByLabel('Search playbooks').fill('photos');
  await expect(page.locator('.pb-item')).toHaveCount(1);
  await page.getByLabel('Search playbooks').fill('');
  await page.getByRole('group', { name: 'Verification' }).getByRole('button', { name: 'Verified' }).click();
  await expect(page.locator('.pb-item')).toHaveCount(1);
  await page.getByRole('group', { name: 'Verification' }).getByRole('button', { name: 'All' }).click();
  await page.screenshot({ path: testInfo.outputPath('playbooks.png'), fullPage: true });

  await page.getByRole('button', { name: 'New playbook' }).click();
  await page.getByLabel('Site', { exact: true }).fill('gumroad.com');
  await page.getByLabel('Summary', { exact: true }).fill('Selling digital downloads.');
  await page.getByLabel('What worked — one step per line').fill('Open Products\nNew product → Digital');
  await page.getByLabel('Pitfalls — one per line').fill('Payouts need a verified email');
  await page.getByLabel(/Key URLs/).fill('Dashboard | https://app.gumroad.com/dashboard');
  await page.getByLabel('I just confirmed this works').check();
  await page.getByRole('button', { name: 'Save playbook' }).click();
  await expect.poll(() => state.mutations.find(m => m.path === '/projects/playbooks/save')?.body).toEqual({
    domain: 'gumroad.com', summary: 'Selling digital downloads.', steps: ['Open Products', 'New product → Digital'],
    pitfalls: ['Payouts need a verified email'], urls: [{ label: 'Dashboard', url: 'https://app.gumroad.com/dashboard' }], verified: true,
  });
  await expect(page.locator('.pb-item')).toHaveCount(3);

  page.once('dialog', dialog => dialog.accept());
  await page.locator('.pb-item', { hasText: 'tiktok.com' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect.poll(() => state.mutations.find(m => m.path === '/projects/playbooks/delete')?.body).toEqual({ domain: 'tiktok.com' });
  await expect(page.locator('.pb-item')).toHaveCount(2);
});

test('the shell links every Projects section', async ({ page }) => {
  await workspace(page);
  await page.goto('/projects/playbooks');
  const nav = page.getByRole('navigation', { name: 'Projects sections' });
  for (const [name, path] of [['Computers', '/projects/computers'], ['Accounts', '/projects/accounts'], ['Analytics', '/projects/analytics'], ['Costs', '/projects/cost-simulator'], ['Operations', '/projects']] as const) {
    await nav.getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, '\\/')}$`));
  }
});
