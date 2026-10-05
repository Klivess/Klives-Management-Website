import { expect, test, type Page } from '@playwright/test';

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
    DropdownOptions: [existingSecret],
    ...overrides,
  };
}

async function installApiMock(page: Page, saveStatus = 200) {
  const listQueries: string[] = [];
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
    const json = (value: unknown, status = 200) => route.fulfill({
      status, headers, contentType: 'application/json', body: JSON.stringify(value),
    });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers, body: '' });
    if (url.pathname === '/KMProfiles/LoginStatus') return route.fulfill({ status: 200, headers, body: 'SessionActive' });
    if (url.pathname === '/KMProfiles/GetCurrentProfile') return json({ Name: 'Klives', KlivesManagementRank: 5 });
    if (url.pathname === '/OmniGlobalSettings/List') {
      listQueries.push(url.search);
      return json([
        setting('APIKey', 0),
        setting('SecretBool', 1),
        setting('SecretInt', 2),
        setting('SecretDropdown', 3),
        setting('SecretList', 4, { Value: JSON.stringify([existingSecret]) }),
        setting('UnsetSecret', 0, { HasValue: false }),
        setting('InactiveSecret', 0, { WasUsedThisSession: false }),
        setting('PollInterval', 2, { Sensitive: false, Value: '15' }),
      ]);
    }
    if (url.pathname === '/OmniGlobalSettings/Set') {
      mutations.push(request.postDataJSON());
      // A failure body must never appear in the UI or console, even if it echoes a secret.
      return json({ error: replacementSecret }, saveStatus);
    }
    return json({});
  });
  return { listQueries, mutations };
}

test.beforeEach(async ({ context }) => {
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '4173'}`).origin;
  await context.addCookies([{ name: 'password', value: 'test-password', url: origin }]);
});

test('every secret type is a blank replacement field, including inactive settings', async ({ page }) => {
  const api = await installApiMock(page);
  await page.goto('/administration/omnisettings');
  await page.getByRole('button', { name: /Test Service/ }).click();
  await page.getByRole('button', { name: /Unused This Session/ }).click();

  for (const name of ['APIKey', 'SecretBool', 'SecretInt', 'SecretDropdown', 'SecretList', 'UnsetSecret', 'InactiveSecret']) {
    const input = page.getByLabel(`Replacement value for ${name}`, { exact: true });
    await expect(input).toHaveAttribute('type', 'password');
    await expect(input).toHaveAttribute('autocomplete', 'new-password');
    await expect(input).toHaveValue('');
  }
  await expect(page.getByText('No secret saved', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Secret saved', { exact: true })).toHaveCount(6);
  await expect(page.getByText('Show Sensitive Values')).toHaveCount(0);
  await expect(page.locator('.editor-list')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  expect(await page.content()).not.toContain(existingSecret);
  expect(api.listQueries).toEqual(['']);
  expect(api.mutations).toEqual([]);
});

test('replaces a secret once, clears its draft, and preserves ordinary setting edits', async ({ page }) => {
  const api = await installApiMock(page);
  await page.goto('/administration/omnisettings');
  await page.getByRole('button', { name: /Test Service/ }).click();
  const secretInput = page.getByLabel('Replacement value for APIKey', { exact: true });
  await secretInput.fill('********');
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await secretInput.fill(replacementSecret);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(secretInput).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  expect(api.mutations).toEqual([{
    name: 'APIKey', value: replacementSecret,
    parentServiceId: 'test-service', parentServiceName: 'Test Service', sensitive: true,
  }]);
  expect(await page.content()).not.toContain(replacementSecret);

  const ordinaryInput = page.getByPlaceholder('Enter PollInterval...');
  await expect(ordinaryInput).toHaveValue('15');
  await ordinaryInput.fill('20');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  expect(api.mutations[1]).toEqual({
    name: 'PollInterval', value: '20',
    parentServiceId: 'test-service', parentServiceName: 'Test Service',
  });
});

test('failed replacements clear the draft and never display or log server error bodies', async ({ page }) => {
  await installApiMock(page, 400);
  const messages: string[] = [];
  page.on('console', message => messages.push(message.text()));
  await page.goto('/administration/omnisettings');
  await page.getByRole('button', { name: /Test Service/ }).click();
  const input = page.getByLabel('Replacement value for APIKey', { exact: true });
  await input.fill(replacementSecret);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('The setting could not be saved. Please check the replacement value and try again.')).toBeVisible();
  await expect(input).toHaveValue('');
  expect(await page.content()).not.toContain(replacementSecret);
  expect(messages.join('\n')).not.toContain(replacementSecret);
});
