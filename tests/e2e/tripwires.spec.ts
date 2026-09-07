import { expect, test, type Page } from '@playwright/test';

const apiOrigin = 'https://klive.dev';

function settings(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true, captureIpAddress: true, captureLocation: true, captureUserAgent: true,
    captureDeviceDetails: true, captureReferrer: true, captureLanguage: true,
    captureQueryParameters: true, honourDoNotTrack: true, ignoreBots: true,
    discordNotifications: true, discordIncludeSensitiveDetails: true,
    notificationCooldownSeconds: 0, deduplicateWindowMinutes: 60, retentionDays: 90,
    expiresUtc: null, maxTrips: null, redirectStatusCode: 302, ...overrides,
  };
}

function tripwire(id = 'tw-1', name = 'Acme proposal') {
  return {
    id, name, createdBy: 'Klives', createdUtc: '2026-09-01T10:00:00Z', updatedUtc: '2026-09-01T10:00:00Z',
    lastTrippedUtc: '2026-09-07T09:59:30Z', totalTrips: 7, status: 'Active', settings: settings(),
    targets: [
      { id: `${id}-target`, label: 'Proposal', destinationUrl: 'https://example.com/proposal', enabled: true, sortOrder: 0, tripCount: 7, createdUtc: '2026-09-01T10:00:00Z', trackingUrl: `https://klive.dev/t?key=token-${id}` },
    ],
  };
}

async function mockApi(page: Page) {
  let items = [tripwire()];
  const mutations: { path: string; body: any }[] = [];
  await page.routeWebSocket('wss://klive.dev/**', () => {});
  await page.route(`${apiOrigin}/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type, X-Klive-Client, X-Klive-Page, Cache-Control' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
    const json = async (body: unknown, status = 200) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/KMProfiles/LoginStatus') return route.fulfill({ status: 200, headers: cors, body: 'SessionActive' });
    if (url.pathname === '/KMProfiles/GetCurrentProfile') return json({ Name: 'Klives', KlivesManagementRank: 5 });
    if (url.pathname === '/tripwires/list') return json(items);
    if (url.pathname === '/tripwires/events') return json({ items: [{ id: 'event-1', targetLabel: 'Proposal', destinationUrl: 'https://example.com/proposal', trippedUtc: '2026-09-07T09:59:30Z', ipAddress: '203.0.113.10', countryCode: 'GB', country: 'United Kingdom', region: 'England', city: 'London', latitude: 51.5, longitude: -0.12, userAgent: 'Mozilla/5.0', browser: 'Chrome 140', operatingSystem: 'Windows', deviceType: 'Desktop', referrer: 'https://discord.com/', doNotTrack: false, isBot: false, isUnique: true, discordNotified: true }], total: 1, limit: 100, offset: 0 });
    if (url.pathname === '/tripwires/summary') return json({ totalTrips: 7, uniqueTrips: 5, tripsLast24Hours: 2, tripsLast7Days: 6, lastTrippedUtc: '2026-09-07T09:59:30Z', daily: [{ date: '2026-09-07', count: 2 }], countries: [{ value: 'United Kingdom', count: 7 }] });
    const body = request.postDataJSON?.() ?? {};
    mutations.push({ path: url.pathname, body });
    if (url.pathname === '/tripwires/create') {
      const created: any = tripwire('tw-new', body.name);
      created.targets = body.targets.map((target: any, index: number) => ({ id: `new-target-${index}`, label: target.label || new URL(target.destinationUrl).hostname, destinationUrl: target.destinationUrl, enabled: true, sortOrder: index, tripCount: 0, createdUtc: '2026-09-07T10:00:00Z', trackingUrl: `https://klive.dev/t?key=new-token-${index}` }));
      created.totalTrips = 0; created.lastTrippedUtc = null;
      items = [created, ...items];
      return json(created, 201);
    }
    if (url.pathname === '/tripwires/update') {
      const index = items.findIndex(item => item.id === body.id);
      items[index] = { ...items[index], name: body.name, settings: body.settings, targets: body.targets.map((target: any) => ({ ...items[index].targets.find(t => t.id === target.id), ...target })) };
      return json(items[index]);
    }
    if (url.pathname === '/tripwires/notification/test') return json({ sent: true });
    if (url.pathname === '/tripwires/events/clear') return json({ cleared: true });
    if (url.pathname === '/tripwires/delete') return json({ deleted: true });
    return json({});
  });
  return mutations;
}

test.beforeEach(async ({ context }) => {
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '4173'}`).origin;
  await context.addCookies([{ name: 'password', value: 'test-password', url: origin }]);
});

test('shows links, telemetry, settings, and creates multiple tracking URLs', async ({ page }) => {
  const mutations = await mockApi(page);
  await page.goto('/tripwires');

  await expect(page.getByRole('heading', { name: 'Acme proposal' })).toBeVisible();
  await expect(page.getByText('https://klive.dev/t?key=token-tw-1')).toBeVisible();
  await expect(page.getByText('United Kingdom').first()).toBeVisible();
  await expect(page.getByText('203.0.113.10')).toBeVisible();
  await expect(page.getByText('Discord').last()).toBeVisible();

  await page.getByTestId('new-tripwire').click();
  await page.getByPlaceholder('e.g. Proposal sent to Acme').fill('Partner launch');
  await page.getByPlaceholder('Label (optional)').fill('Homepage');
  await page.getByPlaceholder('https://example.com/your-page').fill('https://partner.example/start');
  await page.getByRole('button', { name: 'Add another destination' }).click();
  await page.getByPlaceholder('Label (optional)').nth(1).fill('Docs');
  await page.getByPlaceholder('https://example.com/your-page').nth(1).fill('https://partner.example/docs');
  await page.getByTestId('create-submit').click();

  await expect(page.getByRole('heading', { name: 'Partner launch' })).toBeVisible();
  await expect(page.getByText('https://klive.dev/t?key=new-token-0')).toBeVisible();
  await expect(page.getByText('https://klive.dev/t?key=new-token-1')).toBeVisible();
  expect(mutations.find(item => item.path === '/tripwires/create')?.body.targets).toHaveLength(2);

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const discordToggle = page.locator('.tw-discord-card .tw-toggle-row').first();
  await discordToggle.click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect.poll(() => mutations.some(item => item.path === '/tripwires/update')).toBeTruthy();
});
