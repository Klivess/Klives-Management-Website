import { expect, test, type Page } from '@playwright/test';
import { BOOT, V3, closePick, loadPage, mockV3, pickById, pickOption } from './fixtures/omniscience-v3-api';

/**
 * The filters every Omniscience search shares: a row of dropdowns that pick by name (people, servers,
 * conversations, platforms, sites), can say "is not", take a date range, live in the page's link, and
 * still accept an id by hand. Against the typed mock, synthetic people only. Screenshots land in
 * test-results/omniscience-v3/.
 */

const SHOTS = 'test-results/omniscience-v3';
const BASE = '/omniscience-v3';

test.describe.configure({ timeout: 150_000 });

test.beforeEach(async ({ context }) => {
    const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '4173'}`).origin;
    await context.addCookies([{ name: 'km_session', value: 'kms_e2e', url: origin }]);
});

async function shot(page: Page, name: string) {
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

type State = Awaited<ReturnType<typeof mockV3>>;
/** The query of the latest request to a route, as its parameters. */
function lastQuery(state: State, route: string): URLSearchParams {
    const found = state.requests.filter(r => r.startsWith(`GET ${V3}/${route}?`) || r === `GET ${V3}/${route}`).at(-1) ?? '';
    return new URLSearchParams(found.includes('?') ? found.slice(found.indexOf('?') + 1) : '');
}
const posts = (state: State, sub: string) => state.posts.filter(r => r.path === `${V3}/${sub}`);

test('images: narrowed by server, conversation, person and kind, all chosen by name', async ({ page }) => {
    const state = await mockV3(page);
    await page.setViewportSize({ width: 1500, height: 1000 });
    await loadPage(page, `${BASE}/images?q=a+price+chart`);
    const results = page.getByTestId('image-results').locator('li');
    await expect(results).toHaveCount(2, BOOT);

    // The filters that matter most are on the bar, each saying it is not set.
    const bar = page.getByTestId('image');
    await expect(bar.getByTestId('image-person')).toContainText('Posted by');
    await expect(bar.getByTestId('image-person')).toContainText('anyone');
    await expect(bar.getByTestId('image-guild')).toContainText('Server');
    await expect(bar.getByTestId('image-when')).toContainText('any time');
    await expect(bar.getByPlaceholder(/conversation id/i)).toHaveCount(0); // no box to paste an id into

    // A server: the dropdown opens on the servers there are, the most recently active first, and narrows as you type.
    await bar.getByTestId('image-guild').locator('.omni-pill > .main').click();
    const servers = bar.getByTestId('image-guild').getByRole('option');
    await expect(servers).toHaveCount(2);
    await expect(servers.first()).toContainText('Synthetic Server');
    await bar.getByTestId('image-guild').getByRole('searchbox').fill('second');
    await expect(servers).toHaveCount(1);
    await servers.first().click();
    await closePick(bar, 'image-guild');
    await expect(bar.getByTestId('image-guild')).toContainText('Second synthetic server');
    await expect.poll(() => lastQuery(state, 'media/search').get('guilds')).toBe('guild-2');
    await expect(page).toHaveURL(/guild=guild-2/);

    // "Is not" leaves the chosen out instead of keeping them.
    await bar.getByTestId('image-guild').locator('.omni-pill > .main').click();
    await bar.getByTestId('image-guild').getByRole('button', { name: 'is not' }).click();
    await closePick(bar, 'image-guild');
    await expect(bar.getByTestId('image-guild')).toContainText('not Second synthetic server');
    await expect.poll(() => lastQuery(state, 'media/search').get('notGuilds')).toBe('guild-2');
    expect(lastQuery(state, 'media/search').get('guilds')).toBeNull();
    await bar.getByRole('button', { name: 'Clear server' }).click();
    await expect.poll(() => lastQuery(state, 'media/search').get('notGuilds')).toBeNull();

    // With a server chosen, the conversation dropdown lists that server's channels only.
    await pickOption(bar, 'image-guild', /Synthetic Server/);
    await closePick(bar, 'image-guild');
    await bar.getByTestId('image-conversation').locator('.omni-pill > .main').click();
    await expect(bar.getByTestId('image-conversation').getByRole('option')).toHaveCount(1);
    await expect(bar.getByTestId('image-conversation').getByRole('option').first()).toContainText('#general');
    expect(lastQuery(state, 'lookup/conversations').get('guilds')).toBe('guild-1');
    await bar.getByTestId('image-conversation').getByRole('option').first().click();
    await closePick(bar, 'image-conversation');
    await expect.poll(() => lastQuery(state, 'media/search').get('conversations')).toBe('conv-general');

    // A person, and a filter from "More filters": the kind of image.
    await pickOption(bar, 'image-person', /Synthetic Ada/, 'ada');
    await closePick(bar, 'image-person');
    await bar.getByRole('button', { name: /More filters/ }).click();
    await bar.getByRole('menuitem', { name: /Kind of image/ }).click();
    await bar.getByTestId('image-kind').getByRole('option', { name: 'Screenshot' }).click();
    await closePick(bar, 'image-kind');
    await expect.poll(() => lastQuery(state, 'media/search').get('kinds')).toBe('screenshot');
    const query = lastQuery(state, 'media/search');
    expect([query.get('persons'), query.get('guilds'), query.get('conversations')]).toEqual(['person-a', 'guild-1', 'conv-general']);
    await expect(results).toHaveCount(1);
    await shot(page, 'filters-images');

    // A range of dates, by name; it stays in the link as its name, so the link keeps meaning "the last week".
    await bar.getByTestId('image-when').locator('.omni-pill > .main').click();
    await bar.getByTestId('image-when').getByRole('option', { name: 'Last 7 days' }).click();
    await expect(bar.getByTestId('image-when')).toContainText('Last 7 days');
    await expect.poll(() => lastQuery(state, 'media/search').get('from')).toMatch(/^\d{13}$/);
    await expect(page).toHaveURL(/when=7d/);

    // Everything at once.
    await bar.getByTestId('image-clear').click();
    await expect(bar.getByTestId('image-person')).toContainText('anyone');
    await expect.poll(() => [...lastQuery(state, 'media/search').keys()].sort()).toEqual(['limit', 'q']);
    await expect(results).toHaveCount(2);
    expect(state.unknown).toEqual([]);
    expect(state.errors).toEqual([]);
});

test('images: a link restores its filters by name, and an id can still be added by hand', async ({ page }) => {
    const state = await mockV3(page);
    await page.setViewportSize({ width: 1500, height: 1000 });
    // An older link (one plain id per filter) still opens filtered; the ids are shown by name.
    await loadPage(page, `${BASE}/images?q=a+cat&person=person-b&conversation=conv-dm-a`);
    const bar = page.getByTestId('image');
    await expect(bar.getByTestId('image-person')).toContainText('Synthetic Bo', BOOT);
    await expect(bar.getByTestId('image-conversation')).toContainText('Synthetic Ada');
    await expect.poll(() => lastQuery(state, 'media/search').get('persons')).toBe('person-b');
    expect(lastQuery(state, 'media/search').get('conversations')).toBe('conv-dm-a');
    await expect(page.getByTestId('image-results').locator('li')).toHaveCount(1);

    // Opening a result offers its own server and poster as filters.
    await page.getByTestId('image-results').getByRole('button').first().click();
    const drawer = page.locator('.omni-drawer');
    await expect(drawer.getByTestId('image-only-here')).toHaveCount(0); // already narrowed to this conversation
    await expect(drawer.getByTestId('image-only-them')).toHaveCount(0);
    await drawer.getByRole('button', { name: 'Close panel' }).click();

    // Something that cannot be chosen by name is added by its id.
    await pickById(bar, 'image-guild', 'discord:1234567890');
    await closePick(bar, 'image-guild');
    await expect.poll(() => lastQuery(state, 'media/search').get('guilds')).toBe('discord:1234567890');
    await expect(bar.getByTestId('image-guild')).toContainText('discord:1234567890');
    expect(state.unknown).toEqual([]);
    expect(state.errors).toEqual([]);
});

test('links and people: the same bar, with what each search is about', async ({ page }) => {
    const state = await mockV3(page);
    await page.setViewportSize({ width: 1500, height: 1000 });
    await loadPage(page, `${BASE}/links`);
    const rows = page.getByTestId('links-table').locator('tbody tr');
    await expect(rows).toHaveCount(4, BOOT);
    const links = page.getByTestId('links');

    // Several kinds at once, from a list; then a site, from the sites links actually come from.
    await pickOption(links, 'links-kind', 'code');
    await pickOption(links, 'links-kind', 'invite');
    await closePick(links, 'links-kind');
    await expect.poll(() => lastQuery(state, 'links/search').get('kinds')).toBe('code,invite');
    await expect(rows).toHaveCount(2);
    await links.getByRole('button', { name: 'Clear kind of link' }).click();
    await pickOption(links, 'links-site', 'github');
    await closePick(links, 'links-site');
    await expect.poll(() => lastQuery(state, 'links/search').get('sites')).toBe('github');
    await expect(rows).toHaveCount(1);
    await links.getByTestId('links-clear').click();
    await expect(rows).toHaveCount(4);

    // "Where" in a row narrows to that conversation, shown by its name.
    await rows.first().getByRole('button', { name: '#general' }).click();
    await expect(links.getByTestId('links-conversation')).toContainText('#general');
    await expect.poll(() => lastQuery(state, 'links/search').get('conversations')).toBe('conv-general');
    // Everyone but one person.
    await pickOption(links, 'links-person', /Synthetic Bo/, 'bo');
    await links.getByTestId('links-person').getByRole('button', { name: 'is not' }).click();
    await closePick(links, 'links-person');
    await expect.poll(() => lastQuery(state, 'links/search').get('notPersons')).toBe('person-b');
    await shot(page, 'filters-links');

    // Following a link keeps who, where and when.
    await page.getByTestId('links-tab-track').click();
    await expect(page.getByTestId('track').getByTestId('track-person')).toContainText('not Synthetic Bo');

    // People: who has written in a server, and how they are filed.
    await loadPage(page, `${BASE}/people`);
    const people = page.locator('.omni-card').filter({ has: page.getByRole('heading', { name: 'People', exact: true }) }).locator('tbody tr');
    await expect(people).toHaveCount(6, BOOT);
    const bar = page.getByTestId('people');
    await pickOption(bar, 'people-guild', /Synthetic Server/);
    await closePick(bar, 'people-guild');
    await expect.poll(() => lastQuery(state, 'people').get('guilds')).toBe('guild-1');
    await expect(people).toHaveCount(5);
    await pickOption(bar, 'people-tier', 'Watch');
    await pickOption(bar, 'people-tier', 'Archive');
    await closePick(bar, 'people-tier');
    await expect.poll(() => lastQuery(state, 'people').get('tiers')).toBe('watch,archive');
    await expect(people).toHaveCount(2);
    // A number range, from "More filters".
    await bar.getByRole('button', { name: /More filters/ }).click();
    await bar.getByRole('menuitem', { name: /Messages/ }).click();
    await bar.getByTestId('people-messages').getByLabel('At least').fill('500');
    await bar.getByTestId('people-messages').getByLabel('At least').blur();
    await expect(bar.getByTestId('people-messages')).toContainText('at least 500 messages');
    await expect.poll(() => lastQuery(state, 'people').get('minMessages')).toBe('500');
    await expect(people).toHaveCount(1);
    await expect(page).toHaveURL(/guild=guild-1/);
    await shot(page, 'filters-people');
    expect(state.unknown).toEqual([]);
    expect(state.errors).toEqual([]);
});

test('explore: a filter value is picked from the values the dataset holds', async ({ page }) => {
    const state = await mockV3(page);
    await page.setViewportSize({ width: 1500, height: 1000 });
    await loadPage(page, `${BASE}/explore`);
    await expect(page.getByTestId('omni-coverage')).toContainText('5,112 records', BOOT);
    await page.getByRole('button', { name: 'Add filter' }).click();
    await page.getByLabel('Filter 1 dimension').selectOption('where.platform');
    // No box to type a value into: the values are listed with how common each is.
    const value = page.getByTestId('explore-value-0');
    await value.locator('.omni-pill > .main').click();
    await expect(value.getByRole('option')).toHaveCount(2);
    await expect(value.getByRole('option').first()).toContainText('4,200');
    await value.getByRole('option', { name: /whatsapp/ }).click();
    await expect.poll(() => posts(state, 'explore/query').at(-1)?.body.filters).toEqual([{ dimension: 'where.platform', op: 'Eq', values: ['whatsapp'] }]);
    expect(posts(state, 'explore/facets').at(-1)?.body).toMatchObject({ dataset: 'messages', dimensions: ['where.platform'] });

    // "Is one of" takes several.
    await page.getByLabel('Filter 1 operator').selectOption('In');
    await pickOption(page, 'explore-value-0', /discord/);
    await closePick(page, 'explore-value-0');
    await expect.poll(() => posts(state, 'explore/query').at(-1)?.body.filters).toEqual([{ dimension: 'where.platform', op: 'In', values: ['whatsapp', 'discord'] }]);
    expect(state.unknown).toEqual([]);
    expect(state.errors).toEqual([]);
});
