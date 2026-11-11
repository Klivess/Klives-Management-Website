import { expect, test } from '@playwright/test';
import { dashboardTestOrigin, installDashboardApiMock } from './fixtures/dashboard-api';

/* Creating a project: presets set the budgets in one click, Ctrl+Enter deploys from anywhere on the page,
   and only settings that differ from the system defaults are sent. */
test('a project is created from presets and deployed with Ctrl+Enter', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1500, height: 1000 });
  await installDashboardApiMock(page, 'Klives');
  await page.context().addCookies([{ name: 'password', value: 'e2e-klives', url: dashboardTestOrigin }]);
  const created: any[] = [];
  await page.routeWebSocket('wss://klive.dev/projects/**', () => {});
  await page.route('https://klive.dev/projects/**', async route => {
    const url = new URL(route.request().url());
    const json = (value: any) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
    if (url.pathname === '/projects/system/settings') {
      return json({
        commanderRoutes: ['anthropic/claude-sonnet-4.5'], utilityRoutes: ['openai/gpt-4.1-mini'], councilRoutes: ['anthropic/claude-sonnet-4.5'],
        tierTextRoutes: ['openai/gpt-4.1-mini'], tierTextImageRoutes: ['openai/gpt-4.1'], tierTextImageVideoRoutes: ['anthropic/claude-sonnet-4.5'],
        tierTextImageVideoAudioRoutes: ['google/gemini-2.5-pro'], stimulusFreeRoutes: ['openai/gpt-4.1-mini'], stimulusFallbackRoutes: ['openai/gpt-4.1-mini'],
        routeParameters: {}, visionEnabled: true, containersEnabled: false, desktopImage: 'omnipotent/projects-desktop:latest',
      });
    }
    if (url.pathname === '/projects/create') { created.push(route.request().postDataJSON()); return json({ projectID: 'p-new' }); }
    if (url.pathname === '/projects/computers/health') return json({ available: true });
    if (url.pathname === '/projects/get') return json({ projectID: 'p-new', name: 'Print-on-demand storefront', goal: 'x', status: 'Planning', tokenBudgetUsd: 25, moneyBudgetUsd: 0, moneyAutonomousThresholdUsd: 0, subAgentCap: 5 });
    return json([]);
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto('/projects/new', { waitUntil: 'domcontentloaded' });
    try { await expect(page.getByLabel('Project name')).toBeVisible({ timeout: 20_000 }); break; }
    catch (e) { if (attempt === 2) throw e; }
  }

  await expect(page.getByLabel('Project name')).toBeFocused();
  const deploy = page.getByRole('button', { name: 'Deploy project' });
  await expect(deploy).toBeDisabled();
  await page.getByLabel('Project name').fill('Print-on-demand storefront');
  await page.getByLabel(/The goal/).fill('Build and run a profitable print-on-demand store and report weekly.');
  await page.getByRole('group', { name: 'Model budget presets' }).getByRole('button', { name: /\$25\.00/ }).click();
  await expect(page.getByLabel('Model budget (USD)')).toHaveValue('25');
  await page.getByRole('switch', { name: 'Desktop computers' }).click();
  await page.getByLabel('Browser sign-ins').selectOption('SharedDesktopWithInputLock');
  await expect(page.getByRole('complementary', { name: 'Ready to deploy' })).toContainText('on · shared browser');
  await expect(deploy).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('new-project.png'), fullPage: true });

  await page.getByLabel(/The goal/).press('Control+Enter');
  await expect.poll(() => created.length).toBe(1);
  expect(created[0]).toEqual({
    name: 'Print-on-demand storefront',
    goal: 'Build and run a profitable print-on-demand store and report weekly.',
    tokenBudgetUsd: 25, moneyBudgetUsd: 0, moneyAutonomousThresholdUsd: 0, subAgentCap: 5,
    settings: { containersEnabled: true, desktopAllocation: 'SharedDesktopWithInputLock' },
  });
  await expect(page).toHaveURL(/\/projects\/p-new$/);
});
