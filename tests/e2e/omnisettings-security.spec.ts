import { expect, test, type Page } from '@playwright/test';

/*
 * Secrets on the OmniSettings page. The fake server below misbehaves on purpose: it sends the stored
 * secret in Value and DropdownOptions, and echoes the attempted secret in a failure body. The page must
 * still show neither, keep every secret field a blank replacement, and clear a replacement once sent.
 */

const existingSecret = 'existing-secret-must-stay-hidden';
const replacementSecret = 'replacement-secret-for-test';

function setting(name: string, type: number, overrides: Record<string, unknown> = {}) {
  return {
    Name: name,
    Type: type,
    Sensitive: true,
    HasValue: true,
    ParentServiceId: 'test-service',
    ParentServiceName: 'Test Service',
    Value: existingSecret,
    WasUsedThisSession: true,
    ReadThisSession: true,
    DropdownOptions: [existingSecret],
    ...overrides,
  };
}

const ROWS = [
  setting('APIKey', 0),
  setting('SecretBool', 1),
  setting('SecretInt', 2),
  setting('SecretDropdown', 3),
  setting('SecretList', 4, { Value: JSON.stringify([existingSecret]) }),
  setting('UnsetSecret', 0, { HasValue: false }),
  setting('InactiveSecret', 0, { WasUsedThisSession: false, ReadThisSession: false }),
  setting('PollInterval', 2, { Sensitive: false, Value: '15', DropdownOptions: [] }),
];

async function installApiMock(page: Page, options: { saveStatus?: number; board?: boolean } = {}) {
  const reads: string[] = [];
  const mutations: Record<string, unknown>[] = [];
  await page.routeWebSocket('wss://klive.dev/**', () => {});
  await page.route('https://klive.dev/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'Authorization, Content-Type, X-Klive-Client, X-Klive-Page, Cache-Control',
    };
    const json = (value: unknown, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(value) });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers, body: '' });
    if (url.pathname === '/KMProfiles/LoginStatus') return route.fulfill({ status: 200, headers, body: 'SessionActive' });
    if (url.pathname === '/KMProfiles/GetCurrentProfile') return json({ Name: 'Klives', KlivesManagementRank: 5 });
    if (url.pathname === '/OmniGlobalSettings/Board') {
      reads.push(`Board${url.search}`);
      return options.board === false ? route.fulfill({ status: 404, headers, body: 'Route not found.' }) : json({ Version: 1, Settings: ROWS });
    }
    if (url.pathname === '/OmniGlobalSettings/List') {
      reads.push(`List${url.search}`);
      return json(ROWS);
    }
    if (url.pathname === '/OmniGlobalSettings/Set') {
      mutations.push(request.postDataJSON());
      // A failure body must never appear in the UI or console, even if it echoes a secret.
      return json({ error: replacementSecret }, options.saveStatus ?? 200);
    }
    return json({});
  });
  return { reads, mutations };
}

test.beforeEach(async ({ context }) => {
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '4173'}`).origin;
  await context.addCookies([{ name: 'password', value: 'test-password', url: origin }]);
});

const service = (page: Page) => page.getByTestId('group-Test Service');

/** As in fixtures/admin-api.ts: the dev server's first compile can leave a page blank, so load it again. */
async function open(page: Page) {
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto('/administration/omnisettings', { waitUntil: 'domcontentloaded', timeout: 15_000 });
      await page.getByTestId('ost-root').waitFor({ state: 'visible', timeout: 15_000 });
      return;
    } catch (error) {
      if (attempt >= 2) throw error;
      await page.waitForTimeout(3_000 * (attempt + 1));
    }
  }
}

for (const board of [true, false]) {
  test(`every secret type is a blank replacement field, including unread settings (${board ? 'board' : 'older list'} route)`, async ({ page }) => {
    const api = await installApiMock(page, { board });
    await open(page);
    await expect(service(page)).toBeVisible();

    for (const name of ['APIKey', 'SecretBool', 'SecretInt', 'SecretDropdown', 'SecretList', 'UnsetSecret', 'InactiveSecret']) {
      const input = service(page).getByLabel(`Replacement value for ${name}`, { exact: true });
      await expect(input).toHaveAttribute('type', 'password');
      await expect(input).toHaveAttribute('autocomplete', 'new-password');
      await expect(input).toHaveValue('');
    }
    await expect(service(page).locator('.ost-secret').filter({ hasText: 'Not set' })).toHaveCount(1);
    await expect(service(page).locator('.ost-secret').filter({ hasText: 'Saved' })).toHaveCount(6);
    await expect(page.getByText(/show (sensitive|secret)/i)).toHaveCount(0);
    // A secret list or choice is never laid out as its entries or options.
    await expect(page.locator('.ost-chips')).toHaveCount(0);
    await expect(page.getByRole('radio')).toHaveCount(0);
    await expect(page.getByTestId('row-save')).toHaveCount(0);
    expect(await page.content()).not.toContain(existingSecret);
    // Nothing asked the server to reveal anything.
    expect(api.reads).toEqual(board ? ['Board'] : ['Board', 'List']);
    expect(api.mutations).toEqual([]);
  });
}

test('replaces a secret once, clears its draft, and leaves ordinary edits as they were', async ({ page }) => {
  const api = await installApiMock(page);
  await open(page);
  const secretInput = service(page).getByLabel('Replacement value for APIKey', { exact: true });

  // The mask is not a new secret.
  await secretInput.fill('********');
  await expect(page.getByTestId('row-save')).toHaveCount(0);

  await secretInput.fill(replacementSecret);
  await service(page).getByTestId('setting-APIKey').getByTestId('row-save').click();
  await expect(secretInput).toHaveValue('');
  await expect(page.getByTestId('row-save')).toHaveCount(0);
  expect(api.mutations).toEqual([{
    name: 'APIKey', value: replacementSecret, parentServiceId: 'test-service', parentServiceName: 'Test Service', returnView: true, sensitive: true,
  }]);
  expect(await page.content()).not.toContain(replacementSecret);

  const ordinary = service(page).getByRole('textbox', { name: 'PollInterval' });
  await expect(ordinary).toHaveValue('15');
  await ordinary.fill('20');
  await ordinary.press('Enter');
  await expect.poll(() => api.mutations.length).toBe(2);
  expect(api.mutations[1]).toEqual({ name: 'PollInterval', value: '20', parentServiceId: 'test-service', parentServiceName: 'Test Service', returnView: true });
});

test('a refused replacement is cleared, and the server body is never shown or logged', async ({ page }) => {
  await installApiMock(page, { saveStatus: 400 });
  const messages: string[] = [];
  page.on('console', message => messages.push(message.text()));
  await open(page);
  const input = service(page).getByLabel('Replacement value for APIKey', { exact: true });
  await input.fill(replacementSecret);
  await input.press('Enter');
  await expect(service(page).getByTestId('setting-APIKey')).toContainText('The server refused this value for a text setting.');
  await expect(input).toHaveValue('');
  expect(await page.content()).not.toContain(replacementSecret);
  expect(messages.join('\n')).not.toContain(replacementSecret);
});
