import { expect, test, type Page } from '@playwright/test';
import { openOmniscience, type OmniscienceApiMock } from './fixtures/omniscience-api';

/**
 * The Omniscience console against a fake server shaped like production (fixtures/omniscience-api.ts).
 * What it must do: say what needs Klives at a glance, get to any person in a keystroke or two, show
 * the messages behind what it claims, and ask the server for little (the old page made eight reads
 * every 90 seconds, hidden tabs included, and swallowed a briefing that never arrived).
 */

const SHOTS = 'test-results/omniscience';
const posts = (api: OmniscienceApiMock, path: string) => api.posts.filter(post => post.path === path);
const omniGets = (api: OmniscienceApiMock) => api.directGets.filter(path => path.startsWith('/omniscience/'));

test.describe.configure({ timeout: 150_000 });

async function hide(page: Page, hidden: boolean) {
  await page.evaluate(value => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (value ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function expectNoHorizontalOverflow(page: Page) {
  const report = await page.evaluate(() => {
    const client = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll<HTMLElement>('.omx *')]
      .filter(element => {
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        // What scrolls inside its own box (the tab row, a wide table) is allowed to be wider than the screen.
        for (let parent = element.parentElement; parent; parent = parent.parentElement) if (/(auto|scroll)/.test(getComputedStyle(parent).overflowX)) return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.right > client + 1;
      })
      .slice(0, 8)
      .map(element => ({ tag: element.tagName.toLowerCase(), className: String(element.className).slice(0, 80), right: Math.round(element.getBoundingClientRect().right) }));
    return { scroll: document.documentElement.scrollWidth, client, offenders };
  });
  expect(report.offenders, JSON.stringify(report)).toEqual([]);
  expect(report.scroll, JSON.stringify(report)).toBeLessThanOrEqual(report.client + 1);
}

test.describe('Omniscience console', () => {
  test('the brief says what is held and what needs you, from two batched reads', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const api = await openOmniscience(page, { sourceDown: true });

    const kpis = page.getByTestId('omx-kpis');
    await expect(kpis).toContainText('46K');
    await expect(kpis).toContainText('5.7M');
    await expect(kpis).toContainText('2 tracked');

    // Worst first: a source that stopped collecting, then the decisions that are waiting.
    const needs = page.getByTestId('omx-needs').locator('.omx-need');
    await expect(needs.first()).toContainText('1 source not collecting');
    await expect(needs.first()).toContainText('klives-alt: token rejected');
    await expect(page.getByTestId('omx-needs')).toContainText('1 possible same-person link');
    await expect(page.getByTestId('omx-needs')).toContainText('1 person suggested to track');
    await expect(page.getByTestId('omx-needs')).toContainText('260 message windows wait for the graph pass');
    await expect(page.getByTestId('omx-view-review')).toContainText('3');

    await expect(page.getByTestId('omx-working-set')).toContainText('Ada Example');
    await expect(page.getByTestId('omx-radar')).toContainText('has anyone seen klives today');
    // The briefing is markdown, shown as text with structure rather than as a wall of symbols.
    await expect(page.getByTestId('omx-briefing').locator('h1')).toHaveText('Today');
    await expect(page.getByTestId('omx-briefing').locator('strong')).toHaveText('3 mentions');
    await expect(page.getByTestId('omx-briefing').locator('li')).toHaveCount(2);

    // Everything above came from two batches and the briefing; nothing was asked for one by one.
    await expect.poll(() => api.batchCalls.length).toBe(2);
    expect(omniGets(api)).toEqual(['/omniscience/briefing/preview']);
    await shot(page, 'brief');

    // A need is a way in.
    await needs.first().click();
    await expect(page).toHaveURL(/view=engine/);
  });

  test('a hidden tab reads nothing and catches up once when it is shown again', async ({ page }) => {
    // Live, 12 Nov 2026: a tab left open overnight sent the old page's eight reads every 90 s for 11 hours.
    await page.clock.install({ time: Date.now() });
    const api = await openOmniscience(page);
    await expect.poll(() => api.batchCalls.length).toBe(2);
    await hide(page, true);
    await page.clock.runFor(6 * 60_000);
    expect(api.batchCalls.length).toBe(2);
    await hide(page, false);
    await expect.poll(() => api.batchCalls.length).toBe(4);
    await page.clock.runFor(20_000);
    expect(api.batchCalls.length).toBe(4);
  });

  test('a briefing that is still being written is said, not left blank', async ({ page }) => {
    // Live, 14 Nov 2026: 480 of 499 preview reads answered 503 and the old page showed an empty panel.
    await openOmniscience(page, { briefing: 'warming' });
    await expect(page.getByTestId('omx-briefing')).toContainText('The briefing is being written');
  });

  test('people: filter, change a tier in place, pin, peek, and open with the keyboard', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const api = await openOmniscience(page, { path: '/omniscience?view=people' });
    const rows = page.getByTestId('omx-people-table').locator('tbody tr');
    await expect(rows).toHaveCount(5);
    await expect(page.getByTestId('omx-people-total')).toHaveText('1–5 of 5');

    await page.getByTestId('omx-people-search').fill('dee');
    await expect(rows).toHaveCount(2);
    await expect(page).toHaveURL(/q=dee/);
    expect(omniGets(api).some(path => path.startsWith('/omniscience/workspace/directory?') && path.includes('search=dee'))).toBe(true);
    await page.getByTestId('omx-people-search').fill('');
    await expect(rows).toHaveCount(5);

    const tiers = page.getByRole('group', { name: 'Tier' });
    await tiers.getByRole('button', { name: 'Tracked' }).click();
    await expect(rows).toHaveCount(2);
    await expect(page).toHaveURL(/tier=tracked/);
    await tiers.getByRole('button', { name: 'All' }).click();
    await expect(rows).toHaveCount(5);

    await page.getByTestId('omx-person-cy').getByRole('combobox').selectOption('tracked');
    await expect.poll(() => posts(api, '/omniscience/persons/tier-set').at(-1)?.body).toEqual({ personId: 'cy', tier: 'tracked' });
    await page.getByTestId('omx-person-bo').getByRole('button', { name: 'Pin Bo Example' }).click();
    await expect.poll(() => posts(api, '/omniscience/workspace/pins/set').at(-1)?.body).toEqual({ personId: 'bo', pinned: true });
    await expect(page.getByTestId('omx-person-bo').getByRole('button', { name: 'Unpin Bo Example' })).toBeVisible();
    await shot(page, 'people');

    // A click on a row peeks; Enter opens the whole dossier.
    await page.getByTestId('omx-person-ada').locator('td').nth(3).click();
    const peek = page.getByTestId('omx-peek');
    await expect(peek).toContainText('Ada Example');
    await expect(peek).toContainText('Lives in Leeds');
    await expect(peek).toContainText('night owl');
    await shot(page, 'peek');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('omx-dossier-name')).toHaveText('Ada Example');
    await expect(page).toHaveURL(/view=person&id=ada/);
    await expect(peek).toHaveCount(0);
  });

  test('two people can be put side by side, and merged when they are one person', async ({ page }) => {
    const api = await openOmniscience(page, { path: '/omniscience?view=people&q=dee' });
    const rows = page.getByTestId('omx-people-table').locator('tbody tr');
    await expect(rows).toHaveCount(2);
    await page.getByLabel('Select Dee Example', { exact: true }).check();
    await expect(page.getByTestId('omx-merge')).toBeDisabled();
    await page.getByLabel('Select Dee E.', { exact: true }).check();

    await page.getByTestId('omx-compare').click();
    await expect(page.getByTestId('omx-compare-card')).toContainText('1 shared conversations');
    await expect(page.getByTestId('omx-compare-card')).toContainText('general');

    // The fuller record is the one kept, and nothing happens before a yes.
    await page.getByTestId('omx-merge').click();
    await expect(page.getByTestId('omx-dialog')).toContainText('Merge Dee E. into Dee Example?');
    expect(posts(api, '/omniscience/persons/merge')).toHaveLength(0);
    await page.getByTestId('omx-dialog-yes').click();
    await expect.poll(() => posts(api, '/omniscience/persons/merge').at(-1)?.body).toEqual({ keep_person_id: 'dee', merge_person_id: 'dee2' });
    await expect(rows).toHaveCount(1);
  });

  test('a dossier: an old link still lands, facts can be added, messages load when asked for', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const api = await openOmniscience(page, { path: '/omniscience-person?personId=ada&tab=Knowledge' });
    await expect(page).toHaveURL(/view=person/);
    await expect(page).toHaveURL(/tab=knowledge/);
    await expect(page.getByTestId('omx-dossier-name')).toHaveText('Ada Example');

    const facts = page.getByTestId('omx-facts');
    await expect(facts).toContainText('Lives in Leeds');
    await expect(facts).not.toContainText('Lives in Bristol');
    await page.getByLabel(/Show withdrawn/).check();
    await expect(facts).toContainText('Lives in Bristol');

    await page.getByTestId('omx-fact-new').fill('Has a cat called Miso');
    await page.getByRole('button', { name: 'Add what you know' }).click();
    await expect.poll(() => posts(api, '/omniscience/persons/observe').at(-1)?.body).toEqual({ personId: 'ada', observation: 'Has a cat called Miso', category: 'misc' });
    await expect(facts).toContainText('Has a cat called Miso');

    await page.getByTestId('omx-tab-summary').click();
    const dossier = page.getByTestId('omx-dossier');
    await expect(dossier).toContainText('Surest facts');
    await expect(dossier).toContainText('night owl');
    await expect(dossier).toContainText('Big Five');
    await expect(dossier).toContainText('82%');
    await shot(page, 'dossier');

    // Their own messages are raw material: read only when the tab is opened.
    expect(api.requestedPaths.some(path => path.startsWith('/omniscience/persons/messages'))).toBe(false);
    await page.getByTestId('omx-tab-messages').click();
    await expect(page.getByTestId('omx-messages')).toContainText('the move to Leeds is finally done');
    await expect(page.getByTestId('omx-messages')).toContainText('Climbers · #general');

    await page.getByTestId('omx-profile-target').click();
    await expect.poll(() => posts(api, '/omniscience/persons/profile-targets/set').at(-1)?.search).toContain('enabled=false');
    await expect(page.getByTestId('omx-profile-target')).toContainText('Profile them');
    await page.getByTestId('omx-tier').getByRole('button', { name: 'watch' }).click();
    await expect.poll(() => posts(api, '/omniscience/persons/tier-set').at(-1)?.body).toEqual({ personId: 'ada', tier: 'watch' });

    await page.getByTestId('omx-tab-profile').click();
    await expect(page.getByTestId('omx-profile').locator('h2', { hasText: 'Who she is' })).toBeVisible();
    await page.getByTestId('omx-tab-circle').click();
    await expect(page.getByTestId('omx-graph')).toContainText('Bo Example');
    await page.getByTestId('omx-tab-replica').click();
    await expect(page.getByTestId('omx-fidelity')).toContainText('Not measured yet');
  });

  test('ask: by meaning, a question with its citations, and an exact search that can be saved', async ({ page }) => {
    const api = await openOmniscience(page, { path: '/omniscience?view=ask' });
    const results = page.getByTestId('omx-ask-results');
    await page.getByTestId('omx-ask-input').fill('moving house');
    await page.getByTestId('omx-ask-run').click();
    await expect(results).toContainText('the move to Leeds is finally done');
    await expect(results).toContainText('88%');
    expect(omniGets(api).some(path => path.startsWith('/omniscience/search/semantic?q=moving%20house'))).toBe(true);

    await page.getByTestId('omx-ask-ask').click();
    await page.getByTestId('omx-ask-input').fill('where does Ada live?');
    await page.getByTestId('omx-ask-run').click();
    await expect(page.getByTestId('omx-answer').locator('strong')).toHaveText('moved to Leeds');
    await expect(results.locator('.omx-msg')).toHaveCount(2);
    await shot(page, 'ask');

    // An exact search over every message would never finish: it asks for a boundary first.
    await page.getByTestId('omx-ask-scope').click();
    await page.getByTestId('omx-ask-input').fill('');
    await page.getByTestId('omx-ask-run').click();
    await expect(page.getByRole('alert')).toContainText('Name a person, a conversation or a date first');
    expect(posts(api, '/omniscience/workspace/search')).toHaveLength(0);

    const filters = page.getByTestId('omx-scope-filters');
    await filters.getByRole('searchbox').fill('ada');
    await filters.getByRole('button', { name: /Ada Example/ }).click();
    await page.getByTestId('omx-ask-input').fill('library');
    await page.getByTestId('omx-ask-run').click();
    await expect.poll(() => posts(api, '/omniscience/workspace/search').at(-1)?.body).toMatchObject({ q: 'library', personId: 'ada', contextKind: 'all', platform: 'all' });
    await expect(results.locator('.omx-msg')).toHaveCount(1);

    await page.getByTestId('omx-ask-save').click();
    await page.getByLabel('Name of the investigation').fill('Ada and the library');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByTestId('omx-saved')).toContainText('Ada and the library');
    expect(posts(api, '/omniscience/workspace/queries/save').at(-1)?.body.query).toMatchObject({ q: 'library', personId: 'ada' });
  });

  test('review: decisions are cleared from the keyboard, and a watchlist starts in one form', async ({ page }) => {
    const api = await openOmniscience(page, { path: '/omniscience?view=review' });
    const queue = page.getByTestId('omx-queue').locator('> li');
    await expect(queue).toHaveCount(3);
    await expect(queue.first()).toContainText('Dee Example and Dee E.');
    await page.keyboard.press('y');
    await expect.poll(() => posts(api, '/omniscience/identity-links/resolve').at(-1)?.body).toEqual({ suggestionId: 'l1', action: 'accept' });
    await expect(queue).toHaveCount(2);
    await expect(queue.first()).toContainText('Cy Example');
    await page.keyboard.press('n');
    await expect.poll(() => posts(api, '/omniscience/targets/dismiss').at(-1)?.body).toEqual({ personId: 'cy' });
    await expect(queue).toHaveCount(1);
    await expect(page.getByTestId('omx-view-review')).toContainText('1');
    await shot(page, 'review');

    await page.getByTestId('omx-review-watch').click();
    await page.getByTestId('omx-watch-terms').fill('leeds, library');
    await page.getByRole('button', { name: 'Start watching' }).click();
    await expect.poll(() => posts(api, '/omniscience/watchlists/add').at(-1)?.body).toMatchObject({ terms: 'leeds, library', notify: true });
    await expect(page.getByTestId('omx-watchlists').locator('> li')).toHaveCount(2);

    await page.getByTestId('omx-review-mentions').click();
    await expect(page.getByTestId('omx-mentions')).toContainText('has anyone seen klives today');
  });

  test('conversations: the messages themselves can be read, and lead back to the person', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const api = await openOmniscience(page, { path: '/omniscience?view=talk' });
    const list = page.getByTestId('omx-conversations').locator('> li');
    await expect(list).toHaveCount(2);
    await list.filter({ hasText: 'Climbers' }).click();
    await expect(page).toHaveURL(/c=c2/);
    await expect(page.getByTestId('omx-talk-messages')).toContainText('back at the library tomorrow');
    expect(omniGets(api).some(path => path.startsWith('/omniscience/conversations/messages?conversationId=c2'))).toBe(true);
    await shot(page, 'conversations');
    await page.getByTestId('omx-talk-messages').getByRole('button', { name: 'Ada Example' }).click();
    await expect(page.getByTestId('omx-peek')).toContainText('Lives in Leeds');
  });

  test('engine: what is wrong is named, health is read only here, and a pass can be started', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const api = await openOmniscience(page, { sourceDown: true });
    await expect.poll(() => api.batchCalls.length).toBe(2);
    expect(api.requestedPaths.some(path => path.startsWith('/omniscience/workspace/health'))).toBe(false);

    await page.getByTestId('omx-view-engine').click();
    await expect(page.getByTestId('omx-engine-issues')).toContainText('1 source not collecting');
    await expect(page.getByTestId('omx-health')).toContainText('1 source has not sent an event for 5 days.');
    await expect(page.getByTestId('omx-health')).toContainText('97%');
    await expect(page.getByTestId('omx-sources')).toContainText('token rejected');
    await expect(page.getByTestId('omx-pipeline')).toContainText('260');
    await expect(page.getByTestId('omx-profiler')).toContainText('completed');
    await expect(page.getByTestId('omx-view-engine')).toContainText('2');
    await shot(page, 'engine');

    await page.getByTestId('omx-run-deduction').click();
    await expect.poll(() => posts(api, '/omniscience/deduction/run').length).toBe(1);
  });

  test('Ctrl K finds a person by a few letters and runs a command', async ({ page }) => {
    const api = await openOmniscience(page);
    await page.keyboard.press('Control+k');
    const palette = page.getByTestId('omx-palette');
    await expect(palette).toContainText('Go to People');
    await expect(palette).toContainText('Ada Example');
    await palette.getByRole('textbox').fill('bo');
    await expect(palette).toContainText('Bo Example');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('omx-dossier-name')).toHaveText('Bo Example');
    await expect(palette).toHaveCount(0);

    await page.getByTestId('omx-find').click();
    await page.getByTestId('omx-palette').getByRole('textbox').fill('deduction');
    await page.getByTestId('omx-palette').getByRole('button', { name: /Run a deduction pass/ }).click();
    await expect.poll(() => posts(api, '/omniscience/deduction/run').length).toBe(1);

    // The person just opened is remembered for next time, on this browser only.
    await page.getByTestId('omx-view-brief').click();
    await expect(page.getByTestId('omx-working-set')).toContainText('Bo Example');
  });

  test('on a phone nothing runs off the side', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openOmniscience(page);
    await expect(page.getByTestId('omx-needs')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await shot(page, 'phone-brief');
    await page.getByTestId('omx-view-people').click();
    await expect(page.getByTestId('omx-people-table').locator('tbody tr')).toHaveCount(5);
    await expectNoHorizontalOverflow(page);
    await page.getByTestId('omx-person-ada').getByRole('button', { name: 'Ada Example', exact: true }).click();
    await expect(page.getByTestId('omx-dossier-name')).toHaveText('Ada Example');
    await expectNoHorizontalOverflow(page);
    await shot(page, 'phone-dossier');
  });
});
