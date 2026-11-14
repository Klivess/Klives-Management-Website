import { expect, test, type Page } from '@playwright/test';
import { installOmniscienceApiMock } from './fixtures/omniscience-api';

const screens = process.env.E2E_SCREENS_DIR ?? 'test-results/screens';

async function goto(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.os-workspace-nav')).toBeVisible({ timeout: 30_000 });
}

async function expectNoHorizontalOverflow(page: Page) {
  const report = await page.evaluate(() => {
    const client = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter(element => {
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.right > client + 1;
      })
      .slice(0, 8)
      .map(element => ({
        tag: element.tagName.toLowerCase(),
        className: String(element.className).slice(0, 90),
        right: Math.round(element.getBoundingClientRect().right),
      }));
    return { scroll: document.documentElement.scrollWidth, client, offenders };
  });
  expect(report.scroll, JSON.stringify(report.offenders)).toBeLessThanOrEqual(report.client + 1);
}

test('a hidden tab stops polling and catches up once when it is shown again', async ({ page }) => {
  // Live, 12 Nov 2026: a tab left open overnight sent the page's eight reads every 90 s for 11 hours.
  await page.clock.install({ time: Date.now() });
  await installOmniscienceApiMock(page);
  const reads: string[] = [];
  page.on('request', request => { if (request.url().includes('/omniscience/workspace/directory')) reads.push(request.url()); });
  await goto(page, '/omniscience');
  await expect.poll(() => reads.length).toBe(1);
  await page.clock.runFor(91_000);
  await expect.poll(() => reads.length).toBe(2); // still polling while looked at

  const visibility = (hidden: boolean, announce: boolean) => page.evaluate(([isHidden, tell]) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (isHidden ? 'hidden' : 'visible') });
    if (tell) document.dispatchEvent(new Event('visibilitychange'));
  }, [hidden, announce] as const);
  await visibility(true, false); // hidden, and the page is not told
  await page.clock.runFor(10 * 60_000);
  expect(reads.length).toBe(2);

  await visibility(false, true);
  await expect.poll(() => reads.length).toBe(3);
  await page.clock.runFor(30_000);
  expect(reads.length).toBe(3);
});

test('overview loads the live workspace and unified command palette', async ({ page }) => {
  await installOmniscienceApiMock(page);
  await goto(page, '/omniscience');

  await expect(page.getByRole('heading', { name: 'Good to see you, Klives.' })).toBeVisible();
  await expect(page.getByText('Alice Example', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('People directory')).toBeVisible();

  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Omniscience command palette' });
  await expect(palette).toBeVisible();
  await palette.getByRole('textbox').fill('Leeds');
  await expect(palette.getByText('Lives in Leeds')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette).toHaveCount(0);
  await page.screenshot({ path: `${screens}/omniscience-overview.png`, fullPage: true });
});

test('explorer runs, saves and exports a scoped investigation', async ({ page }) => {
  await installOmniscienceApiMock(page);
  await goto(page, '/omniscience-explore');

  await page.getByPlaceholder('Exact words or phrase in message content…').fill('alpha');
  await page.getByLabel('Conversation ID').fill('c1');
  await page.getByRole('button', { name: 'Run query' }).click();
  await expect(page.getByText('alpha one')).toBeVisible();
  await expect(page.getByText('alpha two')).toBeVisible();

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByPlaceholder('Investigation name').fill('Playwright investigation');
  await page.getByRole('button', { name: 'Save investigation' }).click();
  await expect(page.getByText('Playwright investigation')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('messages.csv');
  await page.screenshot({ path: `${screens}/omniscience-explorer.png`, fullPage: true });
});

test('timeline, activity and data health render real API states', async ({ page }) => {
  await installOmniscienceApiMock(page);
  await goto(page, '/omniscience-explore?tab=Timeline&personId=p1');

  await expect(page.getByText('Evidence timeline')).toBeVisible();
  await expect(page.getByText('alpha one')).toBeVisible();
  await expect(page.getByText('Activity rhythm')).toBeVisible();
  await expect(page.getByText('Private chat').first()).toBeVisible();

  await page.getByRole('button', { name: /Health/ }).click();
  await expect(page.getByText('All systems nominal')).toBeVisible();
  await expect(page.getByText('Embedding coverage')).toBeVisible();
});

test('data health says when embeddings are still being counted, then shows the coverage', async ({ page }) => {
  // 14 Nov 2026: the health route did not answer in 60 s; it now answers at once and counts in the background.
  await page.clock.install({ time: Date.now() });
  await installOmniscienceApiMock(page);
  let calls = 0;
  await page.route('https://klive.dev/omniscience/workspace/health', async route => {
    const counted = calls++ > 0;
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ status: 'healthy', warnings: [], sources: [], activity_counts: { ready: true, running: false }, checked_at: 1_800_000_000_000,
        metrics: { persons: 2, messages: 4, tracked_messages: 3, stimulus_reply_pairs: 2, replica_eras: 2, replicas_ready: 1, failed_replica_jobs_7d: 0,
          latest_message_at: 1_800_000_000_000, tracked_embedded: counted ? 3 : null, tracked_embedding_coverage_pct: counted ? 100 : null,
          tracked_embedding_counting: !counted } }) });
  });
  await goto(page, '/omniscience-explore?tab=Timeline&personId=p1');
  await page.getByRole('button', { name: /Health/ }).click();
  const coverage = page.locator('.os-health-metrics > div', { hasText: 'Embedding coverage' });
  await expect(coverage).toContainText('—');
  await expect(coverage).toContainText('counting…');
  await expect(coverage).not.toContainText('null');
  await page.clock.runFor(10_500);
  await expect(coverage).toContainText('100%');
  await expect(coverage).toContainText('3 / 3 tracked');
  expect(calls).toBe(2);
});

test('mobile overview and Replica remain within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installOmniscienceApiMock(page);
  await goto(page, '/omniscience');
  await expect(page.getByText('People directory')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await goto(page, '/omniscience-person?personId=p1&tab=Replica');
  await expect(page.locator('.replica-panel')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${screens}/omniscience-mobile-replica.png`, fullPage: true });
});

test('temporal Replica chats, cites evidence and compares eras', async ({ page }) => {
  await installOmniscienceApiMock(page);
  await goto(page, '/omniscience-person?personId=p1&tab=Replica');

  const replica = page.locator('.replica-panel');
  await expect(replica).toBeVisible({ timeout: 30_000 });
  await expect(replica.getByText('AI SIMULATION')).toBeVisible();
  await replica.getByLabel('Persona era').selectOption('2022');
  await replica.getByRole('button', { name: '+ New simulation' }).click();
  await replica.getByPlaceholder('Message the simulation…').fill('How did you respond back then?');
  await replica.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(replica.getByText('Temporal fixture reply')).toBeVisible();
  await replica.getByRole('button', { name: /Show evidence/ }).click();
  await expect(replica.getByText('historical reply')).toBeVisible();

  await replica.getByRole('button', { name: 'Era lab' }).click();
  await expect(replica.getByText('Personality over time')).toBeVisible();
  await replica.getByPlaceholder('Ask the same thing to both eras…').fill('Compare your answer');
  await replica.getByRole('button', { name: 'Compare responses' }).click();
  await expect(replica.getByText('Earlier answer')).toBeVisible();
  await expect(replica.getByText('Later answer')).toBeVisible();
  await page.screenshot({ path: `${screens}/omniscience-replica-eras.png`, fullPage: true });
});
