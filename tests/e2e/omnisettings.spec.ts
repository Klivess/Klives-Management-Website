import { expect, test, type Page } from '@playwright/test';
import { openSettings, STORED_SECRET, type SettingsApiMock } from './fixtures/settings-api';

const group = (page: Page, owner: string) => page.getByTestId(`group-${owner}`);
const row = (page: Page, owner: string, name: string) => group(page, owner).getByTestId(`setting-${name}`);
const lastSet = (api: SettingsApiMock) => api.sets[api.sets.length - 1];

async function expectNoSidewaysScroll(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), { message: 'the page must not scroll sideways', timeout: 3_000 })
    .toBeLessThanOrEqual(1);
}

test.describe('OmniSettings', () => {
  test('shows the whole store at a glance, with what needs Klives first', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 950 });
    const api = await openSettings(page);

    await expect(page.getByTestId('view-all')).toContainText('32');
    await expect(page.getByTestId('view-all')).toContainText('9 services');
    await expect(page.getByTestId('view-attention')).toContainText('4');
    await expect(page.getByTestId('view-attention')).toContainText('1 service waiting');
    await expect(page.getByTestId('view-attention')).toHaveAttribute('data-tone', 'crit');
    await expect(page.getByTestId('view-custom')).toContainText('5');
    await expect(page.getByTestId('view-recent')).toContainText('2');
    await expect(page.getByTestId('view-secrets')).toContainText('6');
    await expect(page.getByTestId('view-secrets')).toContainText('4 not set');
    await expect(page.getByTestId('view-unread')).toContainText('6');

    // Worst first: a blocked service, an empty secret a service read, a duplicate, and settings no service owns.
    const needs = page.getByTestId('ost-needs');
    await expect(needs.locator('.ost-need').first()).toHaveAttribute('data-testid', 'need-awaiting');
    await expect(needs.getByTestId('need-awaiting')).toContainText('KliveChatService is waiting for KliveChat_TurnSecret');
    await expect(needs.getByTestId('need-empty-secret')).toContainText('OmniTrader.Trading212.Live.ApiSecret has no value');
    await expect(needs.getByTestId('need-duplicate')).toContainText('KliveAgent_Enabled is stored 2 times');
    await expect(needs.getByTestId('need-unowned')).toContainText('3 settings no service owns or reads');

    // Each row says what is known about it.
    await expect(row(page, 'KliveAgent', 'KliveAgent_StallTimeoutMinutes')).toContainText('Stall timeout minutes');
    await expect(row(page, 'KliveAgent', 'KliveAgent_StallTimeoutMinutes')).toContainText('default 30 min');
    await expect(row(page, 'KliveAgent', 'KliveAgent_MaxRunTokens')).toContainText('not read since restart');
    await expect(row(page, 'KliveAgent', 'KliveAgent_ScriptTimeoutSeconds')).toContainText('1d');
    await expect(row(page, 'CS2ArbitrageBot', 'CS2ArbitrageSteamRequestSpacingMs')).toContainText('Steam request spacing ms');

    // One read of the board, nothing else about settings, and no secret anywhere on the page.
    expect(api.boardReads).toEqual(['']);
    expect(api.listReads).toEqual([]);
    expect(await page.content()).not.toContain(STORED_SECRET);
    await expectNoSidewaysScroll(page);
  });

  test('a switch saves when clicked and can be undone from the toast', async ({ page }) => {
    const api = await openSettings(page);
    const vision = row(page, 'KliveAgent', 'KliveAgent_VisionEnabled');
    await expect(vision.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    await expect(vision).toContainText('default on');

    await vision.getByRole('switch').click();
    await expect(vision.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => api.sets.length).toBe(1);
    expect(lastSet(api)).toEqual({ name: 'KliveAgent_VisionEnabled', value: 'true', parentServiceId: '0', parentServiceName: 'KliveAgent', returnView: true });
    // Back on its default: the reset chip goes.
    await expect(vision.getByTestId('reset-KliveAgent_VisionEnabled')).toHaveCount(0);

    await page.getByTestId('toast-action').click();
    await expect.poll(() => api.sets.length).toBe(2);
    expect(lastSet(api).value).toBe('false');
    await expect(vision.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  test('a number is checked before it is sent, saved with Enter, put back with Esc, and reset to its default', async ({ page }) => {
    const api = await openSettings(page);
    const stall = row(page, 'KliveAgent', 'KliveAgent_StallTimeoutMinutes');
    const input = stall.getByRole('textbox', { name: 'KliveAgent_StallTimeoutMinutes' });

    await input.fill('soon');
    await input.press('Enter');
    await expect(stall).toContainText('A whole number.');
    expect(api.sets).toEqual([]);

    await input.press('Escape');
    await expect(input).toHaveValue('45');
    await expect(stall).not.toContainText('A whole number.');

    await input.fill('120');
    await expect(stall.locator('.ost-hint')).toHaveText('2h');
    await expect(page.getByTestId('ost-tray')).toContainText('1 unsaved');
    await input.press('Enter');
    await expect.poll(() => api.sets.length).toBe(1);
    expect(lastSet(api)).toMatchObject({ name: 'KliveAgent_StallTimeoutMinutes', value: '120' });
    await expect(page.getByTestId('ost-tray')).toHaveCount(0);

    await stall.getByTestId('reset-KliveAgent_StallTimeoutMinutes').click();
    await expect.poll(() => api.sets.length).toBe(2);
    expect(lastSet(api).value).toBe('30');
    await expect(input).toHaveValue('30');
    await expect(stall.getByTestId('reset-KliveAgent_StallTimeoutMinutes')).toHaveCount(0);
  });

  test('choices save at once, and a list is edited as entries', async ({ page }) => {
    const api = await openSettings(page);

    await row(page, 'KliveLLM', 'ThinkingType').getByRole('radio', { name: 'High' }).click();
    await expect.poll(() => api.sets.length).toBe(1);
    expect(lastSet(api)).toMatchObject({ name: 'ThinkingType', value: 'High' });

    // Five choices are a menu, and arrow keys on it move between rows rather than saving.
    const provider = row(page, 'KliveLLM', 'RemoteLLMProvider').getByRole('combobox');
    await provider.selectOption('Local');
    await expect.poll(() => api.sets.length).toBe(2);
    expect(lastSet(api)).toMatchObject({ name: 'RemoteLLMProvider', value: 'Local' });
    await provider.focus();
    await provider.press('ArrowDown');
    expect(api.sets.length).toBe(2);

    const slots = row(page, 'OmniBlox', 'OmniBlox_ExperienceSlots');
    const add = slots.getByRole('textbox', { name: 'Add an entry to OmniBlox_ExperienceSlots' });
    await add.fill('slot-two');
    await add.press('Enter');
    await expect(slots.locator('.ost-chip')).toHaveCount(2);
    await expect(slots).toHaveAttribute('data-dirty', 'true');
    expect(api.sets.length).toBe(2);
    await add.press('Enter');
    await expect.poll(() => api.sets.length).toBe(3);
    expect(lastSet(api)).toMatchObject({ name: 'OmniBlox_ExperienceSlots', value: '["slot-one","slot-two"]' });
  });

  test('search ranks by name, service and value, and the arrow keys walk the results', async ({ page }) => {
    await openSettings(page);
    await page.keyboard.press('/');
    await expect(page.getByTestId('ost-search')).toBeFocused();

    await page.keyboard.type('stall timeout');
    await expect(page.getByTestId('ost-search-count')).toHaveText('1 found');
    await expect(page.locator('.ost-row').first()).toHaveAttribute('data-testid', 'setting-KliveAgent_StallTimeoutMinutes');
    await expect(page.locator('.ost-hit').first()).toBeVisible();

    await page.getByTestId('ost-search').fill('openrouter');
    await expect(page.getByTestId('ost-search-count')).toHaveText('3 found');
    await page.getByTestId('ost-search').press('ArrowDown');
    const first = page.locator('.ost-row').first();
    await expect(first.locator('[data-editor]').first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.ost-row').nth(1).locator('[data-editor]').first()).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(page.getByTestId('ost-search')).toBeFocused();

    // A secret's value is never searched.
    await page.getByTestId('ost-search').fill(STORED_SECRET);
    await expect(page.getByTestId('ost-search-count')).toHaveText('0 found');
    await page.getByTestId('ost-search').press('Escape');
    await expect(page.getByTestId('ost-search')).toHaveValue('');
  });

  test('the tiles filter the page and the rail narrows it to one service', async ({ page }) => {
    await openSettings(page);
    await page.getByTestId('view-secrets').click();
    await expect(page.getByTestId('ost-scope')).toContainText('6 secret settings');
    await expect(page.locator('.ost-group .ost-row')).toHaveCount(6);
    await page.getByTestId('view-secrets').click();
    await expect(page.getByTestId('ost-scope')).toHaveCount(0);

    await page.getByTestId('rail-Projects').click();
    await expect(page.locator('.ost-group')).toHaveCount(1);
    await expect(page.getByTestId('ost-scope')).toContainText('3 settings in Projects');
    await page.getByTestId('rail-all').click();
    await expect(page.locator('.ost-group')).toHaveCount(9);

    // "Show" on a Needs-you line narrows the page to exactly the settings it names.
    await page.getByTestId('need-unowned').getByRole('button', { name: 'Show 3' }).click();
    await expect(page.getByTestId('ost-scope')).toContainText('3 settings from “3 settings no service owns or reads”');
    await expect(page.locator('.ost-group .ost-row')).toHaveCount(3);
    await expect(page.getByTestId('ost-needs')).toHaveCount(0);
  });

  test('a service waiting on a secret is first, and leaves the list once the secret is saved', async ({ page }) => {
    const api = await openSettings(page);
    const waiting = page.getByTestId('ost-needs').getByTestId('need-awaiting');
    const field = waiting.getByLabel('Replacement value for KliveChat_TurnSecret', { exact: true });
    await field.fill('turn-secret-from-test');
    await field.press('Enter');
    await expect.poll(() => api.sets.length).toBe(1);
    expect(lastSet(api)).toEqual({
      name: 'KliveChat_TurnSecret', value: 'turn-secret-from-test', parentServiceId: '0', parentServiceName: 'KliveChatService', returnView: true, sensitive: true,
    });
    await expect(page.getByTestId('ost-needs').getByTestId('need-awaiting')).toHaveCount(0);
    await expect(page.getByTestId('view-attention')).toContainText('3');
    expect(await page.content()).not.toContain('turn-secret-from-test');
  });

  test('the copy of a setting that nothing reads can be deleted from Needs you', async ({ page }) => {
    const api = await openSettings(page);
    await page.getByTestId('need-remove-duplicate').click();
    const dialog = page.getByTestId('ost-confirm');
    await expect(dialog).toContainText('KliveAgent_Enabled');
    await expect(dialog).toContainText('id KliveAgent');
    await dialog.getByTestId('ost-confirm-delete').click();
    await expect.poll(() => api.deletes.length).toBe(1);
    expect(api.deletes[0]).toEqual({ name: 'KliveAgent_Enabled', parentServiceId: 'KliveAgent' });
    await expect(page.getByTestId('need-duplicate')).toHaveCount(0);
    await expect(group(page, 'KliveAgent').getByTestId('setting-KliveAgent_Enabled')).toHaveCount(1);
  });

  test('typing in several rows collects in the tray, and Ctrl+S saves them all', async ({ page }) => {
    const api = await openSettings(page);
    await row(page, 'Projects', 'Projects_CacheHaltWindowMinutes').getByRole('textbox').fill('45');
    await row(page, 'CS2ArbitrageBot', 'CS2ArbitrageMinimumProfitPence').getByRole('textbox').fill('30');
    await expect(page.getByTestId('ost-tray')).toContainText('2 unsaved');
    await page.keyboard.press('Control+s');
    await expect.poll(() => api.sets.length).toBe(2);
    expect(api.sets.map(set => [set.name, set.value])).toEqual([
      ['Projects_CacheHaltWindowMinutes', '45'],
      ['CS2ArbitrageMinimumProfitPence', '30'],
    ]);
    await expect(page.getByTestId('ost-tray')).toHaveCount(0);
  });

  test('long text opens in a dialog and saves from it', async ({ page }) => {
    const api = await openSettings(page);
    await row(page, 'KliveAgent', 'KliveAgent_Personality').locator('.ost-longtext').click();
    const dialog = page.getByTestId('ost-text-dialog');
    await expect(dialog).toBeVisible();
    const area = dialog.getByRole('textbox', { name: 'KliveAgent_Personality' });
    await area.fill('Short and kind.');
    await area.press('Control+Enter');
    await expect.poll(() => api.sets.length).toBe(1);
    expect(lastSet(api)).toMatchObject({ name: 'KliveAgent_Personality', value: 'Short and kind.' });
    await expect(dialog).toHaveCount(0);
  });

  test('a link with ?focus= lands on that setting', async ({ page }) => {
    await openSettings(page, { path: '/administration/omnisettings?focus=Projects_FileMaxSizeGb' });
    const target = row(page, 'Projects', 'Projects_FileMaxSizeGb');
    await expect(target.getByRole('textbox')).toBeFocused();
    await expect(target).toHaveAttribute('data-flash', 'true');
  });

  test('on a server from before the board it falls back to the list and still saves', async ({ page }) => {
    const api = await openSettings(page, { legacyServer: true });
    await expect(page.getByTestId('ost-legacy')).toBeVisible();
    expect(api.boardReads).toEqual(['']);
    expect(api.listReads).toEqual(['']);
    await expect(page.getByTestId('view-custom')).toContainText('—');
    await expect(page.getByTestId('ost-needs')).toBeVisible(); // duplicates and unowned settings need no new fields

    const pence = row(page, 'CS2ArbitrageBot', 'CS2ArbitrageMinimumProfitPence').getByRole('textbox');
    await pence.fill('26');
    await pence.press('Enter');
    await expect.poll(() => api.sets.length).toBe(1);
    await expect(row(page, 'CS2ArbitrageBot', 'CS2ArbitrageMinimumProfitPence')).toContainText('Saved');
    expect(await page.content()).not.toContain(STORED_SECRET);
  });

  test('a profile that may only read sees everything and can change nothing', async ({ page }) => {
    const api = await openSettings(page, { readOnly: true });
    await expect(page.getByTestId('ost-readonly')).toBeVisible();
    await expect(row(page, 'KliveAgent', 'KliveAgent_VisionEnabled').getByRole('switch')).toBeDisabled();
    await expect(row(page, 'Projects', 'Projects_FileMaxSizeGb').getByRole('textbox')).toHaveAttribute('readonly', '');
    await expect(group(page, 'KliveLLM').getByLabel('Replacement value for OpenRouterLLMToken', { exact: true })).toBeDisabled();
    await expect(page.getByTestId('need-remove-duplicate')).toHaveCount(0);
    await expect(page.getByTestId('delete-Projects_FileMaxSizeGb')).toHaveCount(0);
    expect(api.sets).toEqual([]);
  });

  test('fits a phone without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSettings(page);
    await expect(page.getByTestId('view-all')).toBeVisible();
    await expect(row(page, 'KliveAgent', 'KliveAgent_StallTimeoutMinutes')).toBeVisible();
    await expectNoSidewaysScroll(page);
  });
});
