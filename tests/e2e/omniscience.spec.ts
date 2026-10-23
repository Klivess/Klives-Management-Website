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
