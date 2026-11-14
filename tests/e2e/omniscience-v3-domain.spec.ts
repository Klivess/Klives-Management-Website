import { expect, test, type Page } from '@playwright/test';
import { BOOT, NOW, V3, loadPage, mockV3 } from './fixtures/omniscience-v3-api';

/**
 * The Omniscience v3 pages built on the WS-C contract (people, signals, digests, communities,
 * links, data controls, health) against the typed mock, synthetic people only. Screenshots land
 * in test-results/omniscience-v3/.
 */

const SHOTS = 'test-results/omniscience-v3';
const BASE = '/omniscience-v3';
const DAY = 86_400_000;

test.describe.configure({ timeout: 150_000 });

test.beforeEach(async ({ context }) => {
    const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '4173'}`).origin;
    await context.addCookies([{ name: 'km_session', value: 'kms_e2e', url: origin }]);
});

async function shot(page: Page, name: string) {
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

/** Later visits in one test go through the app's router (see the engine spec for why). */
async function go(page: Page, path: string) {
    const mounted = await page.evaluate(() => !!(document.querySelector('#__nuxt') as any)?.__vue_app__).catch(() => false);
    if (!mounted) { await loadPage(page, path); return; }
    await page.evaluate(to => (document.querySelector('#__nuxt') as any).__vue_app__.config.globalProperties.$router.push(to), path);
}

const card = (page: Page, title: string) => page.locator('.ot-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const posts = (state: Awaited<ReturnType<typeof mockV3>>, sub: string) => state.posts.filter(r => r.path === `${V3}/${sub}`);

test('people: the directory filters, a person page shows the dossier, and a brief can be requested', async ({ page }) => {
    const state = await mockV3(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await loadPage(page, `${BASE}/people`);
    const rows = card(page, 'People').locator('tbody tr');
    await expect(rows).toHaveCount(6, BOOT);
    await expect(rows.filter({ hasText: 'Synthetic Dee' })).toContainText('minor');

    await page.getByTestId('people-search').fill('ada');
    await expect(rows).toHaveCount(1);
    expect(state.requests.some(r => r.startsWith(`GET ${V3}/people?`) && r.includes('q=ada'))).toBe(true);
    await expect(page).toHaveURL(/q=ada/);
    await rows.first().click();

    await expect(page.getByTestId('person-name')).toHaveText('Synthetic Ada', BOOT);
    await expect(page.getByTestId('person-chips')).toContainText('tracked');
    await expect(page.getByTestId('person-kpis')).toContainText('4,210');
    await expect(card(page, 'Talks most with')).toContainText('Synthetic Bo');
    await expect(card(page, 'Facts')).toContainText('rock climbing');
    await expect(card(page, 'Relationships')).toContainText('closer');
    await expect(card(page, 'Similar people')).toContainText('talks about games');
    await expect(card(page, 'What they share (90 days)')).toContainText('Synthetic video vid001');

    // No brief yet is an empty panel with the way to write one, not an error.
    await expect(card(page, 'Brief')).toContainText('No brief yet');
    await page.getByTestId('brief-request').click();
    await expect(card(page, 'Brief')).toContainText('planning a climbing trip');
    expect(posts(state, 'briefs/person').at(-1)?.body).toEqual({ personId: 'person-a' });
    await shot(page, 'person');

    // The person can be handed to a tactic.
    await page.getByRole('button', { name: 'Run a tactic on this person' }).click();
    await expect(page).toHaveURL(/\/omniscience-v3\/tactics/);
    expect(state.unknown).toEqual([]);
    expect(state.errors).toEqual([]);
});

test('people: someone under 18 shows no routine, facts or look-alikes, and analysis-off is said plainly', async ({ page }) => {
    const state = await mockV3(page);
    await loadPage(page, `${BASE}/people/person-d`);
    await expect(page.getByTestId('person-chips')).toContainText('under 18 or may be', BOOT);
    await expect(page.getByText('Hours and weekdays are not shown for this person.')).toBeVisible();
    await expect(card(page, 'Similar people')).toContainText('Withheld by policy');
    await expect(card(page, 'Similar people')).toContainText('never worked out for someone who is, or may be, under 18');
    await expect(card(page, 'Facts')).toContainText('No facts recorded');

    await go(page, `${BASE}/people/person-e`);
    await expect(page.getByTestId('analysis-off')).toBeVisible(BOOT);
    await expect(page.getByText('Analysis is switched off for this person.')).toBeVisible();
    expect(state.unknown).toEqual([]);
    expect(state.errors).toEqual([]);
});

test('signals: verdicts and bulk state on alerts, a snoozed reply, notices in words, a new watch rule, a check-in', async ({ page }) => {
    const state = await mockV3(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await loadPage(page, `${BASE}/signals`);
    const alerts = page.getByTestId('alerts-table').locator('tbody tr');
    await expect(alerts).toHaveCount(2, BOOT);
    await expect(page.getByTestId('signals-tab-alerts')).toContainText('2');

    await alerts.first().locator('td').first().click(); // the row's middle is the person link
    await expect(page.locator('.ot-drawer')).toContainText('has anyone asked you about the trip?');
    await page.locator('.ot-drawer').getByRole('button', { name: 'Close panel' }).click();
    await expect(page.locator('.ot-drawer')).toHaveCount(0);
    await alerts.first().getByTitle('This was right').click();
    await expect.poll(() => posts(state, 'signals/alerts/feedback').at(-1)?.body).toEqual({ alertId: 'a1', verdict: 'Correct', messageId: 'm-a1' });
    await expect(alerts).toHaveCount(1);
    await page.getByTestId('alerts-all-seen').click();
    await expect.poll(() => posts(state, 'signals/alerts/state').at(-1)?.body).toEqual({ state: 'Seen', all: true, kind: null });
    await expect(card(page, 'Alerts')).toContainText('Nothing new');
    await shot(page, 'signals-alerts');

    await page.getByTestId('signals-tab-inbox').click();
    await expect(page.getByTestId('inbox-table')).toContainText('are you coming on Saturday?');
    await page.getByRole('button', { name: 'Snooze a day' }).click();
    await expect.poll(() => posts(state, 'signals/inbox/resolve').at(-1)?.body).toEqual({ itemIds: ['i1'], action: 'Snooze', untilMs: NOW + DAY });
    await expect(card(page, 'Replies you owe')).toContainText('Nobody is waiting on you');

    await page.getByTestId('signals-tab-notices').click();
    const notices = page.getByTestId('notices-list');
    await expect(notices).toContainText('Synthetic Cy wrote again after 41 days of silence (watch “Old friends”).');
    await expect(notices).toContainText('Synthetic WhatsApp has been silent for 14.2 hours; it usually brings 120 messages a day.');
    await expect(notices).not.toContainText('tournament'); // already seen
    await notices.locator('li', { hasText: 'Synthetic Cy' }).getByRole('button', { name: 'Seen' }).click();
    await expect.poll(() => posts(state, 'signals/notices/state').at(-1)?.body).toEqual({ state: 'Seen', noticeIds: ['n1'], all: false });

    await page.getByTestId('signals-tab-watches').click();
    await expect(page.getByTestId('watch-table')).toContainText('Trip plans');
    const form = page.getByTestId('watch-form');
    await form.getByLabel('Name').fill('Birthday');
    await form.getByLabel('What to watch for').fill('someone planning a surprise for me');
    await form.getByLabel('Only in these servers (ids, optional)').fill('guild-1, guild-2');
    await form.getByRole('button', { name: 'Create rule' }).click();
    await expect.poll(() => posts(state, 'signals/watchlists/save').at(-1)?.body).toEqual({
        watchId: null, name: 'Birthday', text: 'someone planning a surprise for me', enabled: true, guilds: ['guild-1', 'guild-2'], conversations: null, persons: null,
    });
    await expect(page.getByTestId('watch-table')).toContainText('Birthday');

    await page.getByTestId('signals-tab-checkins').click();
    await expect(page.getByTestId('checkins-list')).toContainText('A short, low-pressure message is usually welcome.');
    await page.getByRole('button', { name: 'I reached out' }).click();
    await expect.poll(() => posts(state, 'insights/wellbeing/state').at(-1)?.body).toEqual({ suggestionId: 'wb1', state: 'done' });
    expect(state.unknown).toEqual([]);
    expect(state.errors).toEqual([]);
});

test('digests: read one, write one now and see it finish, and subscribe weekly', async ({ page }) => {
    const state = await mockV3(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await loadPage(page, `${BASE}/digests`);
    const list = page.getByTestId('digest-list').locator('li');
    await expect(list).toHaveCount(2, BOOT);
    await list.first().getByRole('button').click();
    await expect(page.getByTestId('digest-section')).toContainText('a tournament was organised');
    await expect(page).toHaveURL(/digest=dg-1/);
    await page.getByTestId('digest-seen').click();
    await expect.poll(() => posts(state, 'digests/seen').at(-1)?.body).toEqual({ scopeKind: 'all', scopeId: null, atMs: NOW - 3_600_000 });

    const runForm = page.getByTestId('digest-run');
    await runForm.getByLabel('Of').selectOption('guild');
    await runForm.getByLabel('Server id').fill('guild-1');
    await runForm.getByLabel('Covering').selectOption('24');
    await runForm.getByRole('button', { name: 'Write it' }).click();
    await expect.poll(() => posts(state, 'digests/run').at(-1)?.body).toEqual({ scopeKind: 'guild', scopeId: 'guild-1', fromMs: NOW - DAY, toMs: NOW });
    await expect(page.getByText('Being written', { exact: true })).toBeVisible();
    await expect(page.getByTestId('digest-section')).toContainText('a tournament was organised', { timeout: 20_000 });
    await expect(page.getByText('Being written', { exact: true })).toHaveCount(0);

    const sub = page.getByTestId('sub-form');
    await sub.getByLabel('Subscription name').fill('Ada weekly');
    await sub.getByLabel('Of', { exact: true }).selectOption('person');
    await sub.getByLabel('Scope id').fill('person-a');
    await sub.getByLabel('Cadence').selectOption('weekly');
    await sub.getByLabel('Weekday').selectOption('5');
    await sub.getByLabel('Time of day').fill('18:30');
    await sub.getByRole('button', { name: 'Subscribe' }).click();
    await expect.poll(() => posts(state, 'digests/subscriptions/save').at(-1)?.body).toEqual({
        subscriptionId: null, name: 'Ada weekly', scopeKind: 'person', scopeId: 'person-a', cadence: 'weekly', at: '18:30', weekday: 5, enabled: true,
    });
    await expect(page.getByTestId('subs-table')).toContainText('Friday 18:30');
    await shot(page, 'digests');
    expect(state.unknown).toEqual([]);
    expect(state.errors).toEqual([]);
});

test('communities: a place page, a place without one yet, circles and the people map', async ({ page }) => {
    const state = await mockV3(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await loadPage(page, `${BASE}/communities`);
    const places = page.getByTestId('spaces-list').locator('li');
    await expect(places).toHaveCount(2, BOOT);
    await places.first().getByRole('button').click();
    await expect(page.getByTestId('space-core')).toContainText('Synthetic Ada');
    await expect(page).toHaveURL(/scopeId=guild-1/);
    await expect(card(page, 'What changed')).toContainText('Twice the usual messages');
    await expect(card(page, 'Rising')).toContainText('Synthetic Eli');
    await page.getByTestId('space-refresh').click();
    await expect.poll(() => posts(state, 'insights/space/refresh').at(-1)?.body).toEqual({ scopeKind: 'guild', scopeId: 'guild-1' });
    await shot(page, 'communities-place');

    await places.nth(1).getByRole('button').click();
    await expect(page.getByText('There is no community page for this server or chat yet.')).toBeVisible();

    await page.getByTestId('communities-tab-circles').click();
    await expect(page.getByTestId('circles')).toContainText('Synthetic Cy');
    await expect(page.getByText('34% of their ties reach another circle')).toBeVisible();
    await page.getByTestId('communities-tab-map').click();
    await expect(page.getByTestId('people-map').locator('circle')).toHaveCount(4);
    expect(state.unknown).toEqual([]);
    expect(state.errors).toEqual([]);
});

test('links: search by words, private links are marked, and a link can be followed', async ({ page }) => {
    const state = await mockV3(page);
    await loadPage(page, `${BASE}/links`);
    const rows = page.getByTestId('links-table').locator('tbody tr');
    await expect(rows).toHaveCount(4, BOOT);
    await expect(page.getByTestId('links-table')).toContainText('private link (never looked up)');
    await page.getByTestId('links-q').fill('repo');
    await expect(rows).toHaveCount(1);
    await page.getByTestId('links-q').fill('');
    await expect(rows).toHaveCount(4);

    await rows.first().getByRole('button', { name: 'Follow' }).click();
    await expect(page.getByTestId('track-table').locator('tr')).toHaveCount(2);
    expect(state.requests.some(r => r.startsWith(`GET ${V3}/links/track?`) && r.includes('url=https'))).toBe(true);
    await expect(card(page, 'Synthetic video vid001')).toContainText('Synthetic Bo');
    expect(state.unknown).toEqual([]);
    expect(state.errors).toEqual([]);
});

test('data controls: analysis off with a typed confirmation, erase asks for ERASE, analysis back on, backups', async ({ page }) => {
    const state = await mockV3(page);
    await page.setViewportSize({ width: 1600, height: 1100 });
    await loadPage(page, `${BASE}/data?person=person-a`);
    const form = page.getByTestId('forget-form');
    await expect(form.getByLabel('Person id')).toHaveValue('person-a', BOOT);
    await form.getByRole('button', { name: 'Preview' }).click();
    const preview = page.getByTestId('forget-preview');
    await expect(preview).toContainText('This will forget what was worked out about Synthetic Ada');
    await expect(preview).toContainText('(kept)');
    expect(posts(state, 'data/forget/preview').at(-1)?.body).toEqual({ personId: 'person-a', includeDirectChats: false, level: 'derived' });

    const confirm = page.getByTestId('forget-confirm');
    await expect(confirm).toBeDisabled();
    await page.getByTestId('forget-typed').fill('forget');
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect.poll(() => posts(state, 'data/forget/confirm').at(-1)?.body).toEqual({ personId: 'person-a', confirmToken: 'tok-derived-person-a' });
    await expect(page.getByTestId('forget-run')).toContainText('Done', { timeout: 15_000 });
    await expect(page.getByTestId('analysis-off-table')).toContainText('Synthetic Ada');

    await form.getByLabel(/Erase everything/).check();
    await form.getByLabel(/Also erase your own messages/).check();
    await form.getByRole('button', { name: 'Preview' }).click();
    await expect(preview).toContainText('This will erase Synthetic Ada');
    expect(posts(state, 'data/forget/preview').at(-1)?.body).toEqual({ personId: 'person-a', includeDirectChats: true, level: 'erase' });
    await page.getByTestId('forget-typed').fill('FORGET');
    await expect(page.getByTestId('forget-confirm')).toBeDisabled();
    await page.getByTestId('forget-typed').fill('ERASE');
    await expect(page.getByTestId('forget-confirm')).toBeEnabled();
    await shot(page, 'data-erase-preview');
    expect(posts(state, 'data/forget/confirm')).toHaveLength(1); // nothing erased without the click

    await page.getByTestId('analysis-off-table').locator('tr', { hasText: 'Synthetic Eli' }).getByRole('button', { name: 'Switch back on' }).click();
    await expect.poll(() => posts(state, 'data/analysis/on').at(-1)?.body).toEqual({ personId: 'person-e' });
    await expect(page.getByTestId('analysis-off-table')).not.toContainText('Synthetic Eli');

    await expect(page.getByTestId('backups-table')).toContainText('corpus, intel');
    await page.getByTestId('backup-run').click();
    await expect.poll(() => posts(state, 'data/backups/run').length).toBe(1);
    expect(state.unknown).toEqual([]);
    expect(state.errors).toEqual([]);
});

test('health: problems in plain words, monitors with a topic status, findings and translation', async ({ page }) => {
    const state = await mockV3(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await loadPage(page, `${BASE}/health`);
    const open = page.getByTestId('health-open');
    await expect(open).toContainText('Synthetic WhatsApp has been silent for 14.2 hours', BOOT);
    await expect(open).toContainText('2 knowledge.deduction jobs failed for good in the last day: provider answered 503 three times.');
    const rules = page.getByTestId('monitor-rules');
    await expect(rules).toContainText('Topic surge: “tournament” in 1 place');
    await expect(rules).toContainText('Person activity: 1 person, back after 30 days');

    await rules.locator('tr', { hasText: 'tournament' }).click();
    await expect(page.getByTestId('topic-status')).toContainText('surging');
    await expect(page.getByTestId('monitor-events')).toContainText('A burst of positive messages about you: 9 from 4 people in 6 hours');
    await expect(page.getByTestId('translate-status')).toContainText('40 of 600');

    await rules.locator('tr', { hasText: 'Old friends' }).getByRole('button', { name: 'Turn off' }).click();
    await expect.poll(() => posts(state, 'monitors/rules/enabled').at(-1)?.body).toEqual({ watchId: 'mw1', enabled: false });
    await shot(page, 'health');
    expect(state.unknown).toEqual([]);
    expect(state.errors).toEqual([]);
});

test('a profile that may only read sees no controls on these pages, and data controls refuse it in place', async ({ page }) => {
    const state = await mockV3(page, { permissions: ['omniscience.overview.view', 'omniscience.persons.read', 'omniscience.messages.read'] });
    await loadPage(page, `${BASE}/signals`);
    await expect(page.getByTestId('alerts-table')).toBeVisible(BOOT);
    await expect(page.getByTestId('alerts-all-seen')).toHaveCount(0);
    await expect(page.getByTitle('This was right')).toHaveCount(0);

    await go(page, `${BASE}/people/person-a`);
    await expect(page.getByTestId('person-name')).toHaveText('Synthetic Ada', BOOT);
    await expect(page.getByTestId('brief-request')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Data controls…' })).toHaveCount(0);

    await go(page, `${BASE}/data`);
    await expect(page.getByRole('heading', { name: "You can't open Omniscience data controls" })).toBeVisible(BOOT);
    expect(state.requests.filter(r => r.includes(`${V3}/data/`))).toEqual([]);
    expect(state.unknown).toEqual([]);
});
