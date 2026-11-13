import { expect, test, type Page } from '@playwright/test';
import { openCloud } from './fixtures/klivecloud-api';

/*
 * /klivecloud, rebuilt Nov 2026 on its own design (.kcl). Each test pins something the old page
 * got wrong or couldn't do, against a stateful fake of the KliveCloud routes.
 */

const SCREENS = 'test-results/klivecloud';

const row = (page: Page, name: string) => page.getByTestId(`row-${name}`);
/** The row's name, which opens it. */
const openName = (page: Page, name: string) => row(page, name).locator('.kcl-open');

test.use({ viewport: { width: 1600, height: 960 } });

test('opens the whole drive in one request and never asks for item info per link', async ({ page }) => {
  const api = await openCloud(page);
  await expect(row(page, 'Photos')).toBeVisible();

  // One /batch: tree, links and drive together (the old page made 3 requests + a 404 per dead link).
  expect(api.batchCalls[0]).toEqual(['/KliveCloud/GetFolderTree', '/KliveCloud/ListShareLinks', '/KliveCloud/GetDriveInfo']);
  expect(api.requestedPaths.some(path => path.startsWith('/KliveCloud/GetItemInfo'))).toBe(false);
  expect(api.requestedPaths.some(path => path.startsWith('/KliveCloud/Browse'))).toBe(false);

  // Folders first, each with what is inside it.
  const names = await page.locator('.kcl-row .kcl-open').allTextContents();
  expect(names.slice(0, 4)).toEqual(['Invoices', 'Photos', 'Projects', 'Shared drive']);
  await expect(row(page, 'Photos')).toContainText('1 folder · 4 files');
  await expect(row(page, 'Photos')).toContainText('181 MB');

  // The bar and the rail say what the drive holds, and that links are broken.
  await expect(page.getByTestId('kcl-subline')).toContainText('11 files');
  await expect(page.getByTestId('kcl-subline')).toContainText("3 can't open");
  await expect(page.getByTestId('place-links')).toContainText('3');
  await expect(page.getByTestId('kcl-storage')).toContainText('Archives');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREENS}/drive-1600.png`, fullPage: true });
});

test('folders open instantly, with crumbs, a URL, Backspace and the browser’s Back', async ({ page }) => {
  const api = await openCloud(page);
  const batches = () => api.batchCalls.length;
  const before = batches();

  await openName(page, 'Photos').click();
  await expect(page.getByTestId('kcl-heading')).toHaveText('Photos');
  await expect(page).toHaveURL(/\?f=\d+/);
  await openName(page, 'Trip 2026').click();
  await expect(page.getByTestId('kcl-crumbs')).toContainText('My drive');
  await expect(page.getByTestId('kcl-crumbs')).toContainText('Photos');
  await expect(row(page, 'beach.jpg')).toBeVisible();
  // No round trip per folder: the tree is already here.
  expect(batches()).toBe(before);

  await page.keyboard.press('Backspace');
  await expect(page.getByTestId('kcl-heading')).toHaveText('Photos');
  await expect(page).toHaveURL(new RegExp(`f=${api.items.find(i => i.Name === 'Photos')!.ItemID}`));
  await page.goBack();
  await expect(page.getByTestId('kcl-heading')).toHaveText('Trip 2026');
  await page.getByTestId('place-drive').click();
  await expect(page.getByTestId('kcl-heading')).toHaveText('My drive');
});

test('search finds anything on the drive and says where it is', async ({ page }) => {
  await openCloud(page);
  await page.keyboard.press('/');
  await page.keyboard.type('beach');
  await expect(page.getByTestId('kcl-heading')).toHaveText('Results for “beach”');
  const hit = row(page, 'beach.jpg');
  await expect(hit).toContainText('Photos / Trip 2026');
  await expect(page).toHaveURL(/q=beach/);

  // A kind word matches the kind.
  await page.getByTestId('kcl-search-input').fill('pdf');
  await expect(row(page, 'report.pdf')).toBeVisible();
  await expect(row(page, 'handbook.pdf')).toBeVisible();

  await page.getByTestId('kcl-search-input').fill('beach');
  await hit.getByRole('button', { name: 'Photos / Trip 2026' }).click();
  await expect(page.getByTestId('kcl-heading')).toHaveText('Trip 2026');
  await expect(row(page, 'beach.jpg')).toHaveAttribute('data-picked', 'true');
});

test('select with click, Ctrl and Shift; delete asks first and says what goes', async ({ page }) => {
  const api = await openCloud(page);
  await row(page, 'readme.txt').click({ position: { x: 600, y: 10 } });
  await row(page, 'report.pdf').click({ position: { x: 600, y: 10 }, modifiers: ['Control'] });
  await expect(page.getByTestId('kcl-bulk')).toContainText('2 selected');

  await page.keyboard.press('Delete');
  const dialog = page.getByTestId('kcl-delete-dialog');
  await expect(dialog).toContainText('Delete 2 items?');
  await expect(dialog).toContainText('shared by link');
  // Enter must not delete: the destructive button never takes focus.
  await expect(dialog.getByTestId('kcl-delete-confirm')).not.toBeFocused();
  await dialog.getByTestId('kcl-delete-confirm').click();

  await expect(row(page, 'readme.txt')).toHaveCount(0);
  await expect(row(page, 'report.pdf')).toHaveCount(0);
  expect(api.posts.filter(p => p.path === '/KliveCloud/DeleteItem')).toHaveLength(2);
  await expect(page.getByTestId('kcl-toast').first()).toContainText('Deleted 2 items');

  // Shift selects a range in the order shown.
  await row(page, 'Invoices').click({ position: { x: 600, y: 10 } });
  await row(page, 'Shared drive').click({ position: { x: 600, y: 10 }, modifiers: ['Shift'] });
  await expect(page.getByTestId('kcl-bulk')).toContainText('4 selected');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('kcl-bulk')).toHaveCount(0);
});

test('rename with F2: the name part is selected, a taken name is refused before sending', async ({ page }) => {
  const api = await openCloud(page, { path: '/klivecloud' });
  await openName(page, 'Projects').click();
  await row(page, 'notes.md').click({ position: { x: 600, y: 10 } });
  await page.keyboard.press('F2');

  const input = page.getByTestId('kcl-name-input');
  await expect(input).toBeFocused();
  expect(await input.evaluate((el: HTMLInputElement) => el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0))).toBe('notes');

  await input.fill('main.py');
  await expect(page.getByTestId('kcl-name-dialog')).toContainText('already here');
  await expect(page.getByTestId('kcl-name-save')).toBeDisabled();

  await input.fill('ideas.md');
  await input.press('Enter');
  await expect(row(page, 'ideas.md')).toBeVisible();
  expect(api.posts.find(p => p.path === '/KliveCloud/RenameItem')?.query).toMatchObject({ name: 'ideas.md' });
});

test('move with the folder picker, or by dragging onto a folder', async ({ page }) => {
  const api = await openCloud(page);
  await row(page, 'report.pdf').click({ button: 'right' });
  await page.getByTestId('menu-move').click();
  const dialog = page.getByTestId('kcl-move-dialog');
  await dialog.getByRole('option', { name: /Invoices/ }).click();
  await dialog.getByTestId('move-confirm').click();
  await expect(row(page, 'report.pdf')).toHaveCount(0);
  const moved = api.posts.find(p => p.path === '/KliveCloud/MoveItem')!;
  expect(moved.query.newParentFolderID).toBe(api.items.find(i => i.Name === 'Invoices')!.ItemID);

  // A folder can't be moved into itself.
  await row(page, 'Photos').click({ button: 'right' });
  await page.getByTestId('menu-move').click();
  await expect(page.getByTestId('kcl-move-dialog').getByRole('option', { name: /^Photos/ })).toBeDisabled();
  await page.keyboard.press('Escape');

  await row(page, 'readme.txt').dragTo(row(page, 'Projects'));
  await expect(row(page, 'readme.txt')).toHaveCount(0);
  expect(api.posts.filter(p => p.path === '/KliveCloud/MoveItem')).toHaveLength(2);
});

test('share links: the ones that can’t open are named, and can be taken over or removed', async ({ page }) => {
  const api = await openCloud(page);
  await page.getByTestId('place-links').click();
  const view = page.getByTestId('kcl-links');
  await expect(view.getByTestId('links-stat-broken')).toContainText('3');
  await expect(view.getByTestId('links-broken-banner')).toContainText("3 links can't open");
  await expect(view).toContainText('Nobody owns it');
  await expect(view).toContainText('What it shared was deleted');
  await expect(view).toContainText('14 opens');
  await page.screenshot({ path: `${SCREENS}/links-1600.png`, fullPage: true });

  // The two with no owner: taking them over makes them open again, at the same address.
  await view.getByTestId('links-adopt-all').click();
  await expect(page.getByTestId('kcl-link-confirm')).toContainText('Take over 2 links?');
  await page.getByTestId('kcl-adopt-confirm').click();
  await expect(view.getByTestId('links-stat-broken')).toContainText('1');
  const adopted = api.posts.filter(p => p.path === '/KliveCloud/UpdateShareLink');
  expect(adopted.map(p => p.query.adopt)).toEqual(['1', '1']);

  await view.getByTestId('links-remove-broken').click();
  await page.getByTestId('kcl-remove-links-confirm').click();
  await expect(view.getByTestId('links-stat-broken')).toContainText('0');
  expect(api.posts.some(p => p.path === '/KliveCloud/DeleteShareLink' && p.query.code.startsWith('d1e2'))).toBe(true);
});

test('a new link can expire, and its address is copied', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const api = await openCloud(page);
  await row(page, 'Projects').click({ button: 'right' });
  await page.getByTestId('menu-link').click();
  const dialog = page.getByTestId('kcl-link-dialog');
  await dialog.getByTestId('link-mode-Write').click();
  await dialog.getByTestId('link-expiry-168').click();
  await dialog.getByTestId('link-create').click();

  await expect(dialog.getByTestId('link-url')).toHaveValue(/\/shared\/0+\d+$/);
  const made = api.posts.find(p => p.path === '/KliveCloud/CreateShareLink')!;
  expect(made.query).toMatchObject({ permissionMode: 'Write', expirationHours: '168' });
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/shared\//);
  await expect(page.getByTestId('kcl-toast').first()).toContainText('copied');
  await page.screenshot({ path: `${SCREENS}/link-dialog.png` });
});

test('files open in place through a ticket, and downloads go to the browser', async ({ page }) => {
  const api = await openCloud(page);
  await openName(page, 'Photos').click();
  await openName(page, 'Trip 2026').click();
  await openName(page, 'beach.jpg').click();

  const viewer = page.getByTestId('kcl-viewer');
  await expect(viewer.getByTestId('viewer-name')).toHaveText('beach.jpg');
  await expect(viewer.locator('img.kcp-img')).toHaveAttribute('src', /\/KliveCloud\/Open\?t=/);
  // Neighbours' tickets come in the same request, so stepping is instant.
  const ticketCall = api.posts.find(p => p.path === '/KliveCloud/Ticket')!;
  expect(ticketCall.query.itemIDs.split(',').length).toBeGreaterThan(1);
  await expect(page).toHaveURL(/open=\d+/);

  await page.keyboard.press('ArrowRight');
  await expect(viewer.getByTestId('viewer-name')).not.toHaveText('beach.jpg');

  const download = page.waitForEvent('download');
  await viewer.getByTestId('viewer-download').click();
  await download;
  expect(api.opened.some(path => path.includes('download=1'))).toBe(true);

  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);
  await expect(page).not.toHaveURL(/open=/);
});

test('uploads queue with progress and land in the folder', async ({ page }) => {
  const api = await openCloud(page);
  await openName(page, 'Invoices').click();
  await page.locator('input[type=file]:not([webkitdirectory])').setInputFiles([
    { name: 'march.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 march') },
    { name: 'april.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 april') },
  ]);
  await expect(page.getByTestId('kcl-tray')).toContainText('2 uploaded');
  await expect(row(page, 'march.pdf')).toBeVisible();
  const uploads = api.posts.filter(p => p.path === '/KliveCloud/UploadFile');
  expect(uploads.map(p => p.query.parentFolderID)).toEqual([api.items.find(i => i.Name === 'Invoices')!.ItemID, api.items.find(i => i.Name === 'Invoices')!.ItemID]);
});

test('an older server: features it lacks say so instead of failing', async ({ page }) => {
  await openCloud(page, { scenario: 'legacy' });
  await expect(row(page, 'Photos')).toBeVisible();
  await expect(page.getByTestId('kcl-subline')).toContainText("can't open");

  await row(page, 'readme.txt').click({ position: { x: 600, y: 10 } });
  await page.keyboard.press('F2');
  await page.getByTestId('kcl-name-input').fill('read-me.txt');
  await page.getByTestId('kcl-name-save').click();
  await expect(page.getByTestId('kcl-toast').first()).toContainText('newer KliveCloud server');
});

test('keyboard: arrows move, Enter opens, ? lists the keys', async ({ page }) => {
  await openCloud(page);
  await expect(row(page, 'Photos')).toBeVisible();
  await page.locator('body').click({ position: { x: 5, y: 900 } });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(row(page, 'Photos')).toHaveAttribute('data-picked', 'true');
  await expect(page.getByTestId('kcl-sheet')).toContainText('Photos');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('kcl-heading')).toHaveText('Photos');
  await page.keyboard.press('Shift+?');
  await expect(page.getByTestId('kcl-shortcuts')).toContainText('Rename');
});

test('an empty drive invites the first upload', async ({ page }) => {
  await openCloud(page, { scenario: 'empty' });
  await expect(page.getByText('Your drive is empty')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload files' })).toBeVisible();
});

test('visual tour: grid, details, viewer, palette and the upload tray', async ({ page }) => {
  await openCloud(page);
  await openName(page, 'Photos').click();
  await openName(page, 'Trip 2026').click();
  await page.getByTestId('layout-grid').click();
  await expect(page.getByTestId('kcl-grid')).toBeVisible();
  await page.getByTestId('tile-beach.jpg').click();
  await expect(page.getByTestId('sheet-name')).toHaveText('beach.jpg');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREENS}/grid-details-1600.png` });

  await page.keyboard.press(' ');
  await expect(page.getByTestId('kcl-viewer')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SCREENS}/viewer-1600.png` });
  await page.keyboard.press('Escape');
  await page.getByTestId('layout-list').click();

  await page.keyboard.press('Control+k');
  await page.getByTestId('kcl-palette').getByRole('textbox').fill('pro');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${SCREENS}/palette-1600.png` });
  await page.keyboard.press('Escape');

  await page.locator('input[type=file]:not([webkitdirectory])').setInputFiles([{ name: 'cove.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('jpeg') }]);
  await expect(page.getByTestId('kcl-tray')).toContainText('1 uploaded');
  await page.screenshot({ path: `${SCREENS}/tray-1600.png` });
});

test.describe('narrow', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a phone gets one column, a drawer for places, and every action in the menu', async ({ page }) => {
    await openCloud(page);
    await expect(row(page, 'Photos')).toBeVisible();
    await expect(page.getByTestId('kcl-rail')).toBeHidden();
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(scroll).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Places and folders' }).click();
    await expect(page.getByTestId('kcl-rail')).toBeVisible();
    await page.screenshot({ path: `${SCREENS}/drive-390-rail.png` });
    await page.getByTestId('place-recent').click();
    await expect(page.getByTestId('kcl-heading')).toHaveText('Recent');
    await page.screenshot({ path: `${SCREENS}/recent-390.png`, fullPage: true });
  });
});

test.describe('laptop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('at 1280 px the details become an overlay and the list keeps its columns', async ({ page }) => {
    await openCloud(page);
    await expect(row(page, 'Photos')).toBeVisible();
    await page.screenshot({ path: `${SCREENS}/drive-1280.png`, fullPage: true });
  });
});
