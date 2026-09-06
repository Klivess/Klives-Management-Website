import { expect, test } from '@playwright/test';
import { dashboardTestOrigin, installDashboardApiMock } from './fixtures/dashboard-api';

test.use({ timezoneId: 'Europe/London' });

test('wake analytics supports time ranges, honest outcomes and responsive charts', async ({ page }, testInfo) => {
  await installDashboardApiMock(page, 'Klives');
  await page.context().addCookies([{ name: 'password', value: 'e2e-klives', url: dashboardTestOrigin }]);
  const requests: URL[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const execution = {
    outcomes: 100, observedWakes: 100, activeWakes: 72, productiveWakes: 53,
    interruptedWakes: 28, providerRetries: 17, providerWaitMs: 125000, loopTrips: 3,
    activeRate: 72, productiveRate: 53, interruptionRate: 28, coveragePct: 100,
    interruptionReasons: { RateLimited: 23, Cancellation: 5 },
  };
  await page.route('https://klive.dev/projects/analytics/all?**', async route => {
    const url = new URL(route.request().url());
    requests.push(url);
    await route.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ scope: 'all', generatedAt: '2026-08-01T12:00:00Z',
        range: { key: url.searchParams.get('range'), bucket: url.searchParams.get('bucket') === 'auto' ? 'hour' : url.searchParams.get('bucket'), label: 'Selected time range' },
        summary: { wakes: 100, successfulWakes: 70, failedWakes: 2, deferredWakes: 23, cancelledWakes: 5, events: 400, productiveActions: 88 },
        execution,
        outcomes: [ ['completed', 70], ['failed', 2], ['deferred', 23], ['cancelled', 5] ].map(([key, count]) => ({ key: `wake-${key}`, label: key, count })),
        series: Array.from({ length: 12 }, (_, index) => ({ date: `2026-08-01T${String(index).padStart(2, '0')}:00:00Z`,
          successfulWakes: index + 2, failedWakes: index % 3, deferredWakes: 12 - index, cancelledWakes: index % 2,
          wakes: 16, events: 40, toolCalls: index * 2, productiveActions: index, spendUsd: 0, totalTokens: 0,
          execution: { ...execution, activeRate: 35 + index * 5, productiveRate: 20 + index * 4 },
        })),
      }),
    });
  });
  await page.goto('/projects/analytics');
  await expect(page.getByRole('region', { name: 'Wake execution performance' })).toBeVisible();
  await expect(page.getByText('72.0%', { exact: true })).toBeVisible();
  await expect(page.getByText('28.0%', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Wake outcomes over time', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Active execution and productive wake rates over time' })).toBeVisible();
  await expect.poll(() => requests.at(-1)?.searchParams.get('range')).toBe('24h');

  await page.getByRole('button', { name: '1H', exact: true }).click();
  await expect.poll(() => requests.at(-1)?.searchParams.get('range')).toBe('1h');
  await expect(page.getByRole('button', { name: 'Custom', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Custom', exact: true }).click();
  await page.getByLabel('From (local time)').fill('2026-08-01T12:00');
  await page.getByLabel('To (local time)').fill('2026-08-01T13:00');
  await page.getByLabel('Chart interval', { exact: true }).selectOption('5minute');
  await page.getByRole('button', { name: 'Apply range' }).click();
  await expect.poll(() => requests.at(-1)?.searchParams.get('from')).toBe('2026-08-01T11:00:00.000Z');
  expect(requests.at(-1)?.searchParams.get('to')).toBe('2026-08-01T12:00:00.000Z');
  expect(requests.at(-1)?.searchParams.get('bucket')).toBe('5minute');
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(() => requests.at(-1)?.searchParams.get('fresh')).toBe('1');
  expect(requests.at(-1)?.searchParams.get('from')).toBe('2026-08-01T11:00:00.000Z');

  await page.getByLabel('Wake outcome chart units').selectOption('share');
  await expect(page.getByLabel('Chart interval', { exact: true })).toBeEnabled();
  const requestCount = requests.length;
  await page.getByLabel('From (local time)').fill('2026-08-01T14:00');
  await page.getByRole('button', { name: 'Apply range' }).click();
  await expect(page.getByRole('alert')).toContainText('start time before the end time');
  expect(requests.length).toBe(requestCount);
  await page.getByLabel('From (local time)').fill('2026-08-01T12:00');
  await page.getByRole('button', { name: 'Apply range' }).click();
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('analytics-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('img', { name: 'Wake outcomes over time', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2);
  const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth - window.innerWidth,
    elements: [...document.querySelectorAll('.analytics-dashboard *')].filter(element => element.getBoundingClientRect().right > window.innerWidth + 2)
      .slice(0, 15).map(element => ({ tag: element.tagName, class: element.className, width: element.getBoundingClientRect().width })),
  }));
  expect(overflow.width, JSON.stringify(overflow.elements)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: testInfo.outputPath('analytics-mobile.png'), fullPage: true });
  expect(errors).toEqual([]);
});
