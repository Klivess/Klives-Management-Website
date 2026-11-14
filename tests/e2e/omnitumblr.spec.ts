import { expect, test, type Page } from '@playwright/test';
import { openTumblr, type TumblrApiMock } from './fixtures/omnitumblr-api';

/**
 * The OmniTumblr console against a fake server shaped like production (fixtures/omnitumblr-api.ts).
 * What it must do: say what needs attention and how often Tumblr refuses the server, show the whole fleet's
 * schedule on one screen, and let a post be approved, edited or rescheduled in a click or two, without
 * leaving the page. Screenshots go to test-results/omnitumblr/ for review.
 */

const SHOTS = 'test-results/omnitumblr';
test.describe.configure({ timeout: 120_000 });

const posted = (api: TumblrApiMock, path: string) => api.posts.filter(p => p.path === path);

async function hide(page: Page, hidden: boolean) {
  await page.evaluate(value => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (value ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

test.describe('OmniTumblr console', () => {
  test('one screen: the verdict, the figures, Tumblr refusing the server, the schedule and the fleet', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1100 });
    const api = await openTumblr(page);

    await expect(page.getByTestId('tmb-verdict-title')).toHaveText('Tumblr is refusing the server');
    await expect(page.getByTestId('tmb-verdict')).toContainText('69% of the time');
    await expect(page.getByTestId('tmb-link')).toContainText('Tumblr refusing');
    await expect(page.getByTestId('kpi-tumblr')).toContainText('31%');
    await expect(page.getByTestId('kpi-tumblr')).toContainText('148 blocks');
    await expect(page.getByTestId('kpi-followers')).toContainText('132');
    await expect(page.getByTestId('kpi-posts')).toContainText('of 15 slots');
    await expect(page.getByTestId('kpi-queue')).toContainText('1 to approve');

    // The schedule: posts on a line per blog, and the stretches when Tumblr refused the server.
    const schedule = page.getByTestId('tmb-schedule');
    await expect(schedule.getByTestId('tmb-mark').first()).toBeVisible();
    expect(await schedule.getByTestId('tmb-mark').count()).toBeGreaterThanOrEqual(6);
    expect(await schedule.getByTestId('tmb-band').count()).toBe(3);

    // The fleet, with the week's signals from the event log.
    await expect(page.getByTestId('fleet-memeblog')).toContainText('151.7');
    await expect(page.getByTestId('fleet-memeblog')).toContainText('⏳4');
    await expect(page.getByTestId('fleet-sideblog')).toContainText('↷1');

    // One batch read everything: overview, the whole queue and the history.
    const first = api.batchCalls[0];
    expect(first).toEqual(expect.arrayContaining(['/omnitumblr/overview', '/omnitumblr/posts?status=pending&limit=200', '/omnitumblr/posts?status=Published,Failed,Skipped,Cancelled,Removed&limit=200']));
    expect(api.directGets.filter(g => g.startsWith('/omnitumblr/overview') || g.startsWith('/omnitumblr/blog?'))).toEqual([]);
    // Thumbnails carry the post's version, so the browser may keep them.
    await expect.poll(() => api.directGets.some(g => g.startsWith('/omnitumblr/media') && g.includes('&v=v-'))).toBe(true);

    await page.screenshot({ path: `${SHOTS}/console.png`, fullPage: true });
  });

  test('the queue: approve in one click, and open a post to edit it in place', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 1000 });
    const api = await openTumblr(page);
    const queue = page.getByTestId('tmb-queue');
    await expect(queue.getByTestId('queue-p-held')).toContainText('Waiting for Tumblr to answer');
    await expect(queue).toContainText('Due now');

    await queue.getByTestId('approve-p-approval').click();
    await expect.poll(() => posted(api, '/omnitumblr/posts/approve').length).toBe(1);
    expect(posted(api, '/omnitumblr/posts/approve')[0].body).toEqual({ postId: 'p-approval' });
    await expect(page.getByTestId('tmb-toast').first()).toContainText('Approved');

    // Open the next post: edit the caption and save.
    await queue.getByTestId('queue-p-next').locator('.tmb-row__main').click();
    const sheet = page.getByTestId('tmb-post-sheet');
    await expect(sheet).toContainText('Video post on @memeblog');
    await expect(sheet.locator('.tmb-tagbox__tag', { hasText: 'memes' })).toHaveAttribute('data-tone', 'warn');
    await expect(sheet.locator('.tmb-tagbox__tag', { hasText: 'cats' })).toHaveAttribute('data-tone', 'ok');
    await sheet.locator('#tmb-cap').fill('the cat has a five-year plan');
    await sheet.getByTestId('tmb-save-post').click();
    await expect.poll(() => posted(api, '/omnitumblr/posts/update').length).toBe(1);
    expect(posted(api, '/omnitumblr/posts/update')[0].body).toEqual({ postId: 'p-next', caption: 'the cat has a five-year plan' });
    await page.screenshot({ path: `${SHOTS}/post-sheet.png` });

    // Esc closes the sheet; the address followed it and lets go again.
    await expect(page).toHaveURL(/post=p-next/);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(page).not.toHaveURL(/post=/);
  });

  test('a schedule marker opens its post; a published one shows how it did', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 1000 });
    await openTumblr(page);
    await page.getByTestId('tmb-schedule').getByRole('button', { name: /parkour/ }).click();
    const sheet = page.getByTestId('tmb-post-sheet');
    await expect(sheet).toContainText('How it did');
    await expect(sheet).toContainText('412');
  });

  test('a blog is one click: the scope follows, and Strategy saves a new schedule', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 1000 });
    const api = await openTumblr(page);

    await page.getByTestId('fleet-sideblog').click();
    await expect(page.getByTestId('scope-sideblog')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('tmb-queue')).not.toContainText('@memeblog');
    await expect(page).toHaveURL(/blog=b-side/);

    await page.getByTestId('tab-strategy').click();
    const strategy = page.getByTestId('tmb-strategy');
    await expect(strategy).toContainText('20.2k');
    await strategy.getByRole('button', { name: 'Daily 18:00' }).click();
    await expect(page.getByTestId('tmb-savebar')).toBeVisible();
    await page.getByTestId('tmb-save-strategy').click();
    await expect.poll(() => posted(api, '/omnitumblr/blogs/update').length).toBe(1);
    const body = posted(api, '/omnitumblr/blogs/update')[0].body;
    expect(body.blogId).toBe('b-side');
    expect(body.strategy.Slots).toHaveLength(7);
    await expect(page.getByTestId('tmb-toast').first()).toContainText('Strategy saved');
    await expect(page.getByTestId('tmb-savebar')).toBeHidden();
    await page.screenshot({ path: `${SHOTS}/strategy.png`, fullPage: true });
  });

  test('reach: findings, tags as Tumblr lists them, and trying a tag', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 1000 });
    const api = await openTumblr(page, { path: '/schemery/omnitumblr?tab=reach&blog=b-meme' });
    const reach = page.getByTestId('tmb-reach');
    await expect(reach).toContainText('14 of the last 17 posts got no notes at all');
    await expect(reach).toContainText('Flooded');
    // Typed but not committed with a comma: the click itself adds it (the box loses focus first).
    await reach.locator('#tmb-reach-try').fill('shitpost');
    await reach.getByTestId('tmb-check-tags').click();
    await expect.poll(() => posted(api, '/omnitumblr/tags/research').length).toBe(1);
    await expect(reach).toContainText('#shitpost');
  });

  test('compose from the keyboard: N opens it, a text post goes to the chosen blog', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 1000 });
    const api = await openTumblr(page);
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('n');
    const compose = page.getByTestId('tmb-compose');
    await expect(compose).toBeVisible();
    await compose.getByTestId('compose-blog-sideblog').click();
    await compose.getByRole('button', { name: 'Text' }).click();
    await compose.locator('#tmb-c-title').fill('PSA');
    await compose.getByTestId('tmb-compose-caption').fill('drink some water');
    await compose.getByTestId('tmb-compose-submit').click();
    await expect.poll(() => posted(api, '/omnitumblr/posts/create').length).toBe(1);
    const body = posted(api, '/omnitumblr/posts/create')[0].body;
    expect(body).toMatchObject({ blogIds: ['b-side'], kind: 'Text', caption: 'drink some water', title: 'PSA', scheduledUtc: null });
    await expect(compose).toContainText('Created 1 post');
  });

  test('the old pages land in the console: a blog tab, compose and settings', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 1000 });
    await openTumblr(page, { path: '/schemery/omnitumblr/blog/b-meme?tab=analytics' });
    await expect(page.getByTestId('tmb-analytics')).toContainText('notes a post');
    await expect(page.getByTestId('scope-memeblog')).toHaveAttribute('aria-pressed', 'true');

    await page.goto('/schemery/omnitumblr/settings');
    const settings = page.getByTestId('tmb-settings');
    await expect(settings.getByTestId('tmb-link-history')).toContainText('31%answered, 7 days');
    await expect(settings.getByTestId('tmb-link-history')).toContainText('tagged ×96');
    await expect(settings).toContainText('2.21k fingerprints');
    await page.screenshot({ path: `${SHOTS}/settings.png`, fullPage: true });

    await page.goto('/schemery/omnitumblr/compose?blog=b-side');
    await expect(page.getByTestId('tmb-compose')).toBeVisible();
    await expect(page.getByTestId('compose-blog-sideblog')).toHaveAttribute('aria-pressed', 'true');
  });

  test('the palette finds a post by its caption and opens it', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 1000 });
    await openTumblr(page);
    await page.keyboard.press('Control+k');
    await page.getByTestId('tmb-palette-input').fill('goose');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('tmb-post-sheet')).toContainText('on @sideblog');
  });

  test('adding blogs: authorize, pick, manage, then land on the new blog\'s strategy', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 1000 });
    const api = await openTumblr(page, { blocked: false });
    await page.getByTestId('tmb-add-blogs').click();
    const wizard = page.getByTestId('tmb-connect');
    await wizard.getByTestId('tmb-authorize').click();
    await expect(wizard).toContainText('Which blogs should OmniTumblr run?', { timeout: 15_000 });
    await wizard.getByLabel(/@artdump/).check();
    await wizard.getByTestId('tmb-manage-blogs').click();
    await expect(wizard).toContainText('Now managing @artdump');
    await wizard.getByRole('button', { name: 'Set up the blog' }).click();
    await expect(page.getByTestId('tmb-strategy')).toBeVisible();
    expect(posted(api, '/omnitumblr/blogs/add')[0].body).toMatchObject({ connectionId: 'c-1', blogs: ['artdump'] });
  });

  test('a server from before the new fields still gives a working console', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 1000 });
    const api = await openTumblr(page, { legacy: true, blocked: false });
    await expect(page.getByTestId('tmb-verdict-title')).toBeVisible();
    await expect(page.getByTestId('kpi-tumblr')).toContainText('no record yet');
    await expect(page.getByTestId('fleet-memeblog')).toContainText('—');
    await expect.poll(() => api.directGets.some(g => g.startsWith('/omnitumblr/media'))).toBe(true);
    expect(api.directGets.filter(g => g.startsWith('/omnitumblr/media')).every(g => !g.includes('&v='))).toBe(true);
  });

  test('nothing is read while the tab is hidden, and it catches up when shown', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    const api = await openTumblr(page);
    await expect.poll(() => api.batchCalls.length).toBeGreaterThan(0);
    await page.waitForTimeout(1_000);
    await hide(page, true);
    const before = api.batchCalls.length;
    await page.waitForTimeout(1_500);
    expect(api.batchCalls.length).toBe(before);
    // Shown again after more than 15 s without a read: one batch at once. (The page compares with its last read.)
    await page.evaluate(() => { const real = Date.now; Date.now = () => real() + 60_000; });
    await hide(page, false);
    await expect.poll(() => api.batchCalls.length).toBe(before + 1);
  });

  test('a phone gets the same console without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openTumblr(page);
    await expect(page.getByTestId('tmb-verdict-title')).toBeVisible();
    const overflow = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="tmb-root"]') as HTMLElement;
      return root.scrollWidth - root.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `${SHOTS}/phone.png`, fullPage: true });
  });
});
