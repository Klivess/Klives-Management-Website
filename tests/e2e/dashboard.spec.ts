import { expect, test, type Page } from '@playwright/test';
import {
  dashboardTestOrigin,
  installDashboardApiMock,
  openDashboard,
  type DashboardRole,
} from './fixtures/dashboard-api';

const navToggle = '[data-testid="nav-toggle"], .vnav-toggle';

async function expectNoDashboardScroll(page: Page) {
  await expect(page.getByTestId('dashboard-shell')).toBeVisible();
  await page.waitForFunction(() => document.fonts?.status === 'loaded');

  const dimensions = await page.evaluate(() => {
    const documentRoot = document.documentElement;
    const body = document.body;
    const shell = document.querySelector<HTMLElement>('[data-testid="dashboard-shell"]');
    const visible = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && bounds.width > 0 && bounds.height > 0;
    };
    const measure = (element: HTMLElement, index: number) => ({
      label: element.querySelector('.dashboard-panel__title')?.textContent?.trim()
        || element.closest('.dashboard-panel')?.querySelector('.dashboard-panel__title')?.textContent?.trim()
        || `panel ${index + 1}`,
      client: element.clientHeight,
      scroll: element.scrollHeight,
    });
    const columns = [...document.querySelectorAll<HTMLElement>('[data-testid^="panel-"]')].filter(visible);
    const panels = [...document.querySelectorAll<HTMLElement>('.dashboard-panel')].filter(visible);
    const panelBodies = [...document.querySelectorAll<HTMLElement>('.dashboard-panel__body')].filter(visible);

    return {
      document: { client: documentRoot.clientHeight, scroll: documentRoot.scrollHeight },
      body: { client: body.clientHeight, scroll: body.scrollHeight },
      shell: shell ? { client: shell.clientHeight, scroll: shell.scrollHeight } : null,
      columns: columns.map((column, index) => measure(column, index)),
      panels: panels.map((panel, index) => measure(panel, index)),
      panelBodies: panelBodies.map((panelBody, index) => measure(panelBody, index)),
    };
  });

  expect(dimensions.document.scroll, 'the dashboard document must not scroll').toBeLessThanOrEqual(dimensions.document.client + 1);
  expect(dimensions.body.scroll, 'the dashboard body must not scroll').toBeLessThanOrEqual(dimensions.body.client + 1);
  expect(dimensions.shell, 'dashboard-shell should exist').not.toBeNull();
  expect(dimensions.shell!.scroll, 'dashboard-shell must not have hidden overflow').toBeLessThanOrEqual(dimensions.shell!.client + 1);
  for (const column of dimensions.columns) {
    expect(column.scroll, `${column.label} column must remain bounded`).toBeLessThanOrEqual(column.client + 1);
  }
  for (const panel of dimensions.panels) {
    expect(panel.scroll, `${panel.label} panel must remain bounded`).toBeLessThanOrEqual(panel.client + 1);
  }
  for (const panelBody of dimensions.panelBodies) {
    expect(panelBody.scroll, `${panelBody.label} panel body must remain bounded`).toBeLessThanOrEqual(panelBody.client + 1);
  }
}

for (const role of ['Guest', 'Admin', 'Klives'] as DashboardRole[]) {
  test(`${role} receives only its permitted dashboard`, async ({ page }) => {
    const api = await openDashboard(page, role);

    await expect(page.getByTestId('panel-system')).toBeVisible();
    await expect(page.getByTestId('panel-analytics')).toBeVisible();
    await expect(page.getByTestId('action-upload')).toBeVisible();

    const isOwner = role === 'Klives';
    await expect(page.getByTestId('panel-work')).toHaveCount(role === 'Guest' ? 0 : 1);
    await expect(page.getByTestId('action-ask-agent')).toHaveCount(isOwner ? 1 : 0);
    await expect(page.getByTestId('action-new-project')).toHaveCount(isOwner ? 1 : 0);
    await expect(page.getByTestId('action-mail')).toHaveCount(isOwner ? 1 : 0);
    await expect(page.getByTestId('protective-menu')).toHaveCount(isOwner ? 1 : 0);
    if (role === 'Admin') {
      await expect(page.getByText(/Production DTO failure: market-data polling failed/).first()).toBeVisible();
    }
    if (isOwner) {
      const workPanel = page.getByTestId('panel-work');
      await expect(workPanel.getByText('Unread', { exact: true })).toBeVisible();
      await expect(workPanel.getByText('Scripts', { exact: true })).toBeVisible();
      await expect(workPanel.getByText('Supplier research', { exact: true }).first()).toBeVisible();
    }

    await expect.poll(() => api.batchCalls).toBeGreaterThanOrEqual(2);
    if (!isOwner) {
      const forbiddenPrefixes = [
        '/projects/',
        '/kliveagent/',
        '/omnidefence/',
        '/omniscience/',
        '/klivemail/',
        '/klivetech/',
        '/klivegames/',
        '/klivelink/',
      ];
      expect(
        api.requestedPaths.filter((path) => forbiddenPrefixes.some((prefix) => path.startsWith(prefix))),
        `${role} must not probe owner-only routes`,
      ).toEqual([]);
    }
    if (role === 'Guest') {
      expect(api.requestedPaths.filter((path) => path.startsWith('/api/logs'))).toEqual([]);
    }
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  for (const initiallyCollapsed of [false, true]) {
    test(`fits ${viewport.width}x${viewport.height} with nav ${initiallyCollapsed ? 'collapsed' : 'expanded'}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openDashboard(page, 'Klives', { collapsed: initiallyCollapsed });
      await expectNoDashboardScroll(page);

      const toggle = page.locator(navToggle).first();
      await expect(toggle).toBeVisible();
      await toggle.click();
      await page.waitForTimeout(200);
      await expectNoDashboardScroll(page);
    });
  }
}

test('smaller viewports reflow without horizontal clipping and remain scrollable', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 720 });
  await openDashboard(page, 'Klives');

  const dimensions = await page.evaluate(() => {
    const root = document.documentElement;
    const shell = document.querySelector<HTMLElement>('[data-testid="dashboard-shell"]')!;
    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      clientHeight: root.clientHeight,
      scrollHeight: root.scrollHeight,
      shellOverflowY: getComputedStyle(shell).overflowY,
    };
  });

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  expect(dimensions.shellOverflowY).not.toBe('hidden');
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect(page.getByTestId('panel-analytics')).toBeVisible();
});

test('owner quick actions are semantic and keyboard operable', async ({ page }) => {
  const api = await openDashboard(page, 'Klives');

  const askAgent = page.getByTestId('action-ask-agent');
  await expect(askAgent).toHaveAttribute('href', /\/kliveagent$/);
  await askAgent.focus();
  await expect(askAgent).toBeFocused();
  await askAgent.press('Enter');
  await expect(page).toHaveURL(/\/kliveagent$/, { timeout: 30_000 });

  // Return to the mocked dashboard to exercise controls which do not navigate.
  await page.goto('/dashboard');
  await page.getByTestId('dashboard-shell').waitFor({ state: 'visible' });
  await expect(page.getByTestId('action-new-project')).toHaveAttribute('href', /\/projects\/new$/);
  await expect(page.getByTestId('action-mail')).toHaveAttribute('href', /\/klivemail$/);

  const upload = page.getByTestId('action-upload');
  await upload.focus();
  await expect(upload).toBeFocused();
  const fileChooserPromise = page.waitForEvent('filechooser');
  await upload.press('Enter');
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({ name: 'dashboard-fixture.txt', mimeType: 'text/plain', buffer: Buffer.from('fixture') });
  await expect.poll(() => api.mutations.some(({ path }) => /upload/i.test(path))).toBe(true);

  const protectiveMenu = page.getByTestId('protective-menu');
  await protectiveMenu.focus();
  await expect(protectiveMenu).toBeFocused();
  await protectiveMenu.press('Enter');
  await expect(protectiveMenu.locator('..')).toHaveAttribute('open', '');
  await expect(page.locator('[role="menu"], [data-testid="protective-actions"]').first()).toBeVisible();
});

test('manual refresh requests both data tiers without privileged route probing for Guest', async ({ page }) => {
  const api = await installDashboardApiMock(page, 'Guest');
  await page.context().addCookies([{ name: 'password', value: 'e2e-guest', url: dashboardTestOrigin }]);
  await page.goto('/dashboard');
  await page.getByTestId('dashboard-shell').waitFor({ state: 'visible' });
  await expect.poll(() => api.batchCalls).toBeGreaterThanOrEqual(2);
  const before = api.batchCalls;

  const refresh = page.getByTestId('dashboard-refresh');
  await refresh.focus();
  await refresh.press('Enter');
  await expect.poll(() => api.batchCalls).toBeGreaterThanOrEqual(before + 2);
});
