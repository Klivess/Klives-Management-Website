import { expect, test, type Page } from '@playwright/test';
import { openMail, type MailApiMock } from './fixtures/klivemail-api';

/**
 * The KliveMail page against a fake server shaped like production (fixtures/klivemail-api.ts).
 * What it must do: get Klives to a sign-in code in one glance and one click, read and clear mail
 * from the keyboard, reach every message (the old "Load more" stopped at 200), and ask the server
 * for little (the old page polled the summary and the whole list every 10 s, hidden tabs included).
 */

const batches = (api: MailApiMock) => api.batchCalls.length;
const posts = (api: MailApiMock, path: string) => api.posts.filter(p => p.path === path);

async function hide(page: Page, hidden: boolean) {
  await page.evaluate(value => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (value ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('KliveMail', () => {
  test('shows the inbox at a glance: health, codes, addresses by activity, rows grouped by day', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const api = await openMail(page);

    await expect(page.getByTestId('kml-totals')).toContainText('unread');
    await expect(page.getByTestId('kml-health')).toContainText('Receiving');
    await expect(page.getByTestId('kml-health')).toContainText('last mail');
    await page.getByTestId('kml-health').click();
    await expect(page.getByTestId('kml-health-facts')).toContainText('214 since start');
    await expect(page.getByTestId('kml-activity')).toContainText('this week');

    // Addresses with mail, most recent first; the address nobody pinned has its own group.
    const boxes = page.getByTestId('kml-boxes');
    await expect(boxes.locator('.kml-box__name').first()).toHaveText('videos');
    await expect(page.getByTestId('kml-group-unpinned')).toContainText('1');
    await expect(boxes.getByTestId('box-stray@klive.dev')).toBeVisible();
    await expect(boxes.getByTestId('box-writer@klive.dev')).toContainText('jobs.example');
    await expect(page.getByTestId('kml-group-quiet')).toContainText('2');

    // The newest mail carries a code, shown on its row; the HTML-only one has a preview.
    const list = page.getByTestId('kml-list');
    await expect(list.locator('.kml-day').first()).toHaveText('Today');
    const first = api.messages[0];
    await expect(list.getByTestId(`code-${first.Id}`)).toContainText('483 920');
    await expect(list.getByTestId(`row-${api.messages[1].Id}`)).toContainText('confirm your email');

    // With nothing open, the reader offers the latest codes.
    await expect(page.getByTestId('kml-recent-codes')).toContainText('483 920');

    // One batch: the summary, the open list and the latest codes.
    await expect.poll(() => batches(api)).toBeGreaterThanOrEqual(1);
    expect(api.batchCalls[0]).toEqual(expect.arrayContaining(['/klivemail/mailboxes', '/klivemail/messages?page=1&pageSize=8&codes=1']));
    expect(api.batchCalls[0].some(p => p.startsWith('/klivemail/messages?page=1&pageSize=50'))).toBe(true);
    await expect.poll(() => noSideScroll(page)).toBeLessThanOrEqual(1);
  });

  test('copies a code from its row in one click', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const api = await openMail(page);
    await page.getByTestId(`code-${api.messages[0].Id}`).click();
    await expect(page.getByTestId('kml-toast')).toContainText('Code 483920 copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('483920');
    // Copying does not open or mark the message.
    expect(api.messages[0].IsRead).toBe(false);
  });

  test('reads from the keyboard: j opens, the code and the asked-for link sit at the top, counts follow', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 950 });
    const api = await openMail(page);
    await expect(page.getByTestId('kml-totals')).toContainText('unread');
    const before = await page.getByTestId('kml-totals').locator('b').innerText();

    await page.keyboard.press('j');
    const first = api.messages[0];
    await expect(page.getByTestId('msg-subject')).toHaveText(first.Subject);
    await expect(page.getByTestId('msg-code')).toContainText('483 920');
    await expect(page.getByTestId('msg-images-blocked')).toContainText('1 remote image blocked');
    expect(api.directGets).toContain(`/klivemail/messages/detail?id=${first.Id}`);
    await expect(page.getByTestId('kml-totals').locator('b')).toHaveText(String(Number(before) - 1));
    // The next message is read ahead without being marked read.
    await expect.poll(() => api.directGets.some(p => p === `/klivemail/messages/detail?id=${api.messages[1].Id}&peek=1`)).toBe(true);
    expect(api.messages[1].IsRead).toBe(false);

    await page.keyboard.press('j');
    await expect(page.getByTestId('msg-subject')).toHaveText('Confirm your email address');
    const link = page.getByTestId('msg-link-0');
    await expect(link).toContainText('jobs.example');
    await expect(link).toHaveAttribute('href', 'https://jobs.example/verify-email?token=abc');
    await expect(link).toHaveAttribute('rel', /noopener/);

    // The mail renders sandboxed: no scripts, no same-origin, remote loads blocked by its CSP.
    const frame = page.getByTestId('msg-frame');
    await expect(frame).toHaveAttribute('sandbox', 'allow-popups allow-popups-to-escape-sandbox');
    expect(await frame.getAttribute('srcdoc')).toContain('img-src data: cid:;');

    await page.keyboard.press('u');
    await expect.poll(() => posts(api, '/klivemail/messages/bulk-read').length).toBe(1);
    expect(posts(api, '/klivemail/messages/bulk-read')[0].query.read).toBe('0');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('kml-idle')).toBeVisible();
  });

  test('draws the images a mail carries itself (cid:), fetched with the key, as data: URLs', async ({ page }) => {
    const api = await openMail(page);
    const picks = api.messages.find(m => m.Subject === 'Weekly picks')!;
    await page.getByTestId(`row-${picks.Id}`).click();
    const frame = page.getByTestId('msg-frame');
    await expect.poll(async () => (await frame.getAttribute('srcdoc')) ?? '').toContain('src="data:image/png;base64,');
    expect(await frame.getAttribute('srcdoc')).not.toContain('cid:hero@fixture');
    expect(api.directGets).toContain(`/klivemail/attachments/download?id=${picks.Id}-img`);
    // A picture the mail carries is not an attachment: no file chip for it.
    await expect(page.locator('.kml-file')).toHaveCount(0);
  });

  test('selects several and acts on them at once, with an undo for the trash', async ({ page }) => {
    const api = await openMail(page);
    const [a, b, c] = api.messages.slice(5, 8);
    await page.getByTestId(`check-${a.Id}`).click();
    await page.getByTestId(`check-${b.Id}`).click();
    await page.getByTestId(`check-${c.Id}`).click();
    await expect(page.getByTestId('kml-bulk')).toContainText('3 selected');

    await page.getByTestId('bulk-read').click();
    await expect.poll(() => posts(api, '/klivemail/messages/bulk-read').length).toBe(1);
    expect(posts(api, '/klivemail/messages/bulk-read')[0].body.ids).toEqual([a.Id, b.Id, c.Id]);
    expect([a, b, c].every(m => m.IsRead)).toBe(true);

    await page.getByTestId(`check-${a.Id}`).click();
    await page.getByTestId(`check-${b.Id}`).click();
    await page.getByTestId('bulk-trash').click();
    await expect(page.getByTestId(`row-${a.Id}`)).toHaveCount(0);
    await expect(page.getByTestId('kml-toast')).toContainText('2 messages moved to Trash');
    expect(a.deleted && b.deleted).toBe(true);

    await page.getByTestId('kml-toast').getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => posts(api, '/klivemail/messages/bulk-delete').filter(p => p.query.restore === '1').length).toBe(1);
    await expect(page.getByTestId(`row-${a.Id}`)).toBeVisible();
    expect(a.deleted || b.deleted).toBe(false);
  });

  test('reaches every message: real pages instead of one ever-larger page', async ({ page }) => {
    const api = await openMail(page);
    const list = page.getByTestId('kml-list');
    await expect(page.getByTestId('kml-more')).toBeVisible();
    // Scrolling near the end loads the next page by itself (the button is there for the keyboard).
    for (let i = 0; i < 8 && !(await list.textContent())?.includes('That is everything'); i++) {
      await list.evaluate(el => el.scrollTo(0, el.scrollHeight));
      await page.waitForTimeout(400);
    }
    for (const n of [2, 3]) expect(api.directGets.filter(p => p.startsWith(`/klivemail/messages?page=${n}&pageSize=50`)).length).toBe(1);
    await expect(list.locator('.kml-row')).toHaveCount(api.messages.length);
    await expect(page.getByTestId('kml-more')).toHaveCount(0);
    await expect(list).toContainText(`That is everything: ${api.messages.length} messages`);
  });

  test('a mailbox opens from the rail (and from ?mailbox=), and clears with one confirmed click', async ({ page }) => {
    const api = await openMail(page, { path: '/klivemail?mailbox=videos%40klive.dev' });
    await expect(page.getByTestId('kml-list-title')).toHaveText('Avery Video');
    await expect(page.getByTestId('kml-copy-address')).toContainText('videos@klive.dev');
    await expect(page.getByTestId('kml-list').locator('.kml-row__to')).toHaveCount(0);

    const unread = api.messages.filter(m => m.ToAddress === 'videos@klive.dev' && !m.IsRead).length;
    await page.getByTestId('kml-mark-all').click();
    await expect(page.getByTestId('kml-confirm-all')).toContainText(`${unread} unread`);
    await page.getByTestId('kml-confirm-all-yes').click();
    await expect.poll(() => posts(api, '/klivemail/messages/bulk-read').length).toBe(1);
    expect(posts(api, '/klivemail/messages/bulk-read')[0].query).toMatchObject({ all: '1', mailbox: 'videos@klive.dev' });
    expect(api.messages.filter(m => m.ToAddress === 'videos@klive.dev' && !m.IsRead)).toHaveLength(0);

    await page.getByTestId('box-shop@klive.dev').click();
    await expect(page.getByTestId('kml-list-title')).toHaveText('Shopping');
    await expect(page).toHaveURL(/mailbox=shop(%40|@)klive\.dev/);
    await page.getByTestId('filter-unread').click();
    await expect.poll(() => api.directGets.some(p => p.includes('mailbox=shop%40klive.dev') && p.includes('unread=1'))).toBe(true);
  });

  test('searches as you type, and Ctrl+K jumps to any address', async ({ page }) => {
    const api = await openMail(page);
    await page.keyboard.press('/');
    await page.keyboard.type('receipt');
    await expect.poll(() => api.directGets.some(p => p.startsWith('/klivemail/search?q=receipt'))).toBe(true);
    await expect(page.getByTestId('kml-search-note')).toContainText('1 match for “receipt”');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('kml-list-title')).toHaveText('All mail');

    await page.keyboard.press('Control+k');
    await page.getByTestId('kml-palette-input').fill('writer');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('kml-list-title')).toHaveText('Avery Reed');
  });

  test('polls every 15 seconds while looked at, and not at all from a hidden tab', async ({ page }) => {
    await page.clock.install({ time: Date.now() });
    const api = await openMail(page);
    await expect.poll(() => batches(api)).toBeGreaterThanOrEqual(1);
    const before = batches(api);
    await page.clock.runFor(15_500);
    await expect.poll(() => batches(api)).toBeGreaterThan(before);

    await hide(page, true);
    const hiddenAt = batches(api);
    const gets = api.directGets.length;
    await page.clock.runFor(5 * 60_000);
    expect(batches(api)).toBe(hiddenAt);
    expect(api.directGets.length).toBe(gets);

    // Back in view: one read straight away, and a new arrival shows at the top.
    const arrived = api.deliver({ Subject: '771204 is your sign-in code', ToAddress: 'agent@klive.dev', Code: '771204' });
    await hide(page, false);
    await expect(page.getByTestId(`row-${arrived.Id}`)).toBeVisible();
    await expect(page.getByTestId(`code-${arrived.Id}`)).toContainText('771 204');
  });

  test('pins a new address and unpins one, keeping its mail', async ({ page }) => {
    const api = await openMail(page);
    await page.getByTestId('kml-add').click();
    await page.getByTestId('kml-add-address').fill('Bad Name!');
    await expect(page.getByTestId('kml-add-form')).toContainText('Letters, digits');
    await page.getByTestId('kml-add-address').fill('newsletters');
    await page.getByTestId('kml-add-label').fill('News');
    await page.keyboard.press('Enter');
    await expect.poll(() => posts(api, '/klivemail/mailboxes/create').length).toBe(1);
    expect(posts(api, '/klivemail/mailboxes/create')[0].query).toMatchObject({ address: 'newsletters@klive.dev', displayName: 'News' });

    await page.getByTestId('box-shop@klive.dev').hover();
    await page.getByTestId('unpin-shop@klive.dev').click();
    await expect(page.getByTestId('kml-unpin-dialog')).toContainText('Its mail stays');
    await page.getByTestId('kml-unpin-yes').click();
    await expect.poll(() => posts(api, '/klivemail/mailboxes/delete').length).toBe(1);
    await expect(page.getByTestId('kml-boxes').getByTestId('pin-shop@klive.dev')).toBeAttached();
  });

  test('on a server from before this page: no codes, and single-message routes for actions', async ({ page }) => {
    const api = await openMail(page, { scenario: 'legacy' });
    await expect(page.getByTestId('kml-totals')).toContainText('unread');
    await expect(page.getByTestId('kml-health')).toContainText('does not report SMTP health');
    await expect(page.getByTestId('filter-codes')).toHaveCount(0);
    await expect(page.getByTestId('kml-recent-codes')).toHaveCount(0);

    const target = api.messages[3];
    await page.getByTestId(`check-${target.Id}`).click();
    await page.getByTestId('bulk-unread').click();
    await expect.poll(() => posts(api, '/klivemail/messages/mark-unread').length).toBe(1);
    expect(target.IsRead).toBe(false);
  });

  test('a profile that may see counts but not mail gets counts, and no message requests', async ({ page }) => {
    const api = await openMail(page, { permissions: ['klivemail.overview.view', 'klivemail.mailboxes.read'] });
    await expect(page.getByTestId('kml-totals')).toContainText('unread');
    await expect(page.getByTestId('kml-list')).toContainText('Reading mail is not part of your access');
    await page.waitForTimeout(500);
    expect(api.requestedPaths.some(p => p.startsWith('/klivemail/messages'))).toBe(false);
  });

  test('fits a phone: one pane at a time, with a way back', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const api = await openMail(page);
    await expect(page.getByTestId(`row-${api.messages[0].Id}`)).toBeVisible();
    await expect.poll(() => noSideScroll(page)).toBeLessThanOrEqual(1);
    await page.getByTestId(`row-${api.messages[2].Id}`).click();
    await expect(page.getByTestId('msg-subject')).toBeVisible();
    await expect(page.getByTestId('kml-list')).toBeHidden();
    await page.getByRole('button', { name: 'Back to the list' }).click();
    await expect(page.getByTestId('kml-list')).toBeVisible();
    await expect.poll(() => noSideScroll(page)).toBeLessThanOrEqual(1);
  });
});
