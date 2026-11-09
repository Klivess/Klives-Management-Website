import { expect, test, type Page } from '@playwright/test';
import { BOOT, NOW, V3, mockV3 } from './fixtures/omniscience-v3-api';
import { omniAge, omniCsv, omniDuration, omniInstant, omniMsToZonedInput, omniZonedToMs } from '../../scripts/omniscience/format';

/** Omniscience v3 engine pages against a contract-typed mock; screenshots land in test-results/omniscience-v3/. */

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

/**
 * Opens a page of the app. The first visit is a real load; later ones in the same test go through
 * the app's own router, because every full load of the dev server fetches hundreds of unbundled
 * modules and a long run on Windows eventually exhausts socket buffers (a blank page, not a bug).
 * The destination still mounts from scratch and reads its state from the URL.
 */
async function go(page: Page, path: string) {
    const mounted = await page.evaluate(() => !!(document.querySelector('#__nuxt') as any)?.__vue_app__).catch(() => false);
    if (!mounted) { await page.goto(path); return; }
    await page.evaluate(to => (document.querySelector('#__nuxt') as any).__vue_app__.config.globalProperties.$router.push(to), path);
}

const card = (page: Page, title: string) => page.locator('.ot-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const posts = (state: Awaited<ReturnType<typeof mockV3>>, sub: string) => state.posts.filter(r => r.path === `${V3}/${sub}`);

test.describe('time helpers', () => {
    test('wall-clock times convert through DST gaps and overlaps', () => {
        // Ordinary summer time: London is UTC+1.
        expect(omniZonedToMs('2026-07-01T13:00', 'Europe/London')).toBe(Date.UTC(2026, 6, 1, 12, 0));
        // Spring forward (01:00 → 02:00 on 29 March 2026): 01:30 does not exist and lands after the jump.
        expect(omniZonedToMs('2026-03-29T01:30', 'Europe/London')).toBe(Date.UTC(2026, 2, 29, 1, 30));
        // Autumn back (02:00 → 01:00 on 25 October 2026): 01:30 happens twice; the first one is taken.
        expect(omniZonedToMs('2026-10-25T01:30', 'Europe/London')).toBe(Date.UTC(2026, 9, 25, 0, 30));
        // Southern hemisphere, half a world away from the browser's own zone.
        expect(omniZonedToMs('2026-01-15T09:00', 'Australia/Sydney')).toBe(Date.UTC(2026, 0, 14, 22, 0));
        expect(omniZonedToMs('2026-07-01T12:00', 'UTC')).toBe(NOW);
        expect(omniZonedToMs('not a date', 'UTC')).toBeNull();
        // Round trip through the input format.
        expect(omniMsToZonedInput(NOW, 'Europe/London')).toBe('2026-07-01T13:00');
        expect(omniMsToZonedInput(NOW, 'America/New_York')).toBe('2026-07-01T08:00');
    });

    test('instants, ages, durations and CSV', () => {
        expect(omniInstant(NOW, 'Europe/London')).toBe('2026-07-01 Wed 13:00 BST');
        expect(omniInstant(NOW, 'UTC', true)).toBe('2026-07-01 Wed 12:00:00 UTC');
        expect(omniInstant(null, 'UTC')).toBe('—');
        expect(omniAge(NOW - 90_000, NOW)).toBe('1 m ago');
        expect(omniAge(NOW + 7_200_000, NOW)).toBe('in 2 h');
        expect(omniDuration(245_000)).toBe('4 m 05 s');
        expect(omniCsv(['a', 'b'], [['x,y', 'say "hi"'], [null, 3]])).toBe('a,b\r\n"x,y","say ""hi"""\r\n,3');
    });
});

test('overview shows the engine, and the time lens changes every time on the page', async ({ page }) => {
    const state = await mockV3(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(BASE);

    await expect(page.getByRole('heading', { name: 'Engine overview' })).toBeVisible(BOOT);
    await expect(page.getByTestId('omni-phase')).toContainText('Ready');
    await expect(page.getByTestId('omni-engine-banner')).toHaveCount(0);
    await expect(page.locator('.ot-top')).toContainText('2 dead jobs');
    await expect(card(page, 'Job lanes')).toContainText('LlmBackground');
    await expect(card(page, 'Stores')).toContainText('6.0 GB');
    // Only modules that need attention are listed here: the failing one, not the healthy or the idle one.
    await expect(card(page, 'Modules needing attention')).toContainText('Deduction');
    await expect(card(page, 'Modules needing attention')).not.toContainText('Rollups');
    await expect(card(page, 'LLM, last hour')).toContainText('Interactive');

    // Klives's zone (BST) by default, UTC on demand; the choice survives a reload.
    const foot = page.locator('.omni-foot');
    await expect(foot).toContainText('13:00:00 BST');
    await page.locator('.ot-top .ot-segment').getByRole('button', { name: 'UTC' }).click();
    await expect(foot).toContainText('12:00:00 UTC');
    await shot(page, 'overview');
    await page.reload();
    await expect(page.locator('.omni-foot')).toContainText('12:00:00 UTC', BOOT);

    // The command palette reaches pages and tactics.
    await page.keyboard.press('Control+k');
    await page.getByLabel('Search pages and tactics').fill('set alg');
    await expect(page.locator('.ot-palette li').first()).toContainText('X27 Set algebra');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/omniscience-v3\/tactics\?tactic=x27\.setalgebra/);
    expect(state.unknown).toEqual([]);
    expect(state.errors).toEqual([]);
});

for (const [phase, title, detail] of [
    ['Disabled', 'installed but switched off', 'OmniscienceV3_ShadowEnabled'],
    ['Starting', 'is starting', 'opening stores'],
    ['Failed', 'failed to start', 'corpus.db is locked'],
] as const) {
    test(`an engine that is ${phase.toLowerCase()} says so on every page instead of showing blanks`, async ({ page }) => {
        const state = await mockV3(page, { phase });
        await page.goto(`${BASE}/jobs`);
        await expect(page.getByTestId('omni-engine-banner')).toContainText(title, BOOT);
        await expect(page.getByTestId('omni-engine-banner')).toContainText(detail);
        await expect(page.getByTestId('omni-phase')).toContainText(phase);
        // The panel names the same cause, with a way to try again.
        await expect(card(page, 'Jobs').locator('.ot-state')).toContainText(detail);
        await expect(card(page, 'Jobs').getByRole('button', { name: 'Try again' })).toBeVisible();
        expect(state.unknown).toEqual([]);
    });
}

test('modules: filter, inspect, disable, and edit a setting with server validation', async ({ page }) => {
    const state = await mockV3(page);
    await page.goto(`${BASE}/modules`);
    const table = card(page, 'Modules').locator('tbody');
    await expect(table.locator('tr')).toHaveCount(3, BOOT);

    await page.getByRole('group', { name: 'Module state' }).getByRole('button', { name: /Needs attention/ }).click();
    await expect(table.locator('tr')).toHaveCount(1);
    await expect(page).toHaveURL(/state=attention/);
    await table.locator('tr').first().click();

    const drawer = page.locator('.ot-drawer');
    await expect(drawer).toContainText('provider answered 503 three times');
    await expect(drawer).toContainText('daily at 03:30 (Europe/London)');
    await expect(drawer).toContainText('420 changes behind');
    await expect(page).toHaveURL(/module=knowledge\.deduction/);

    // A number outside the declared range is refused by the server and explained beside the field.
    const setting = drawer.locator('[data-setting="knowledge.deduction.minConfidence"]');
    await setting.getByRole('spinbutton').fill('3');
    await setting.getByRole('button', { name: 'Save' }).click();
    await expect(setting.getByRole('alert')).toContainText('must be at most 1');
    await setting.getByRole('spinbutton').fill('0.9');
    await setting.getByRole('button', { name: 'Save' }).click();
    await expect(setting).toContainText('changed');
    expect(posts(state, 'settings/set').at(-1)?.body).toEqual({ key: 'knowledge.deduction.minConfidence', value: 0.9 });

    await drawer.getByRole('button', { name: 'Disable' }).click();
    await expect(drawer.getByRole('button', { name: 'Enable' })).toBeVisible();
    expect(posts(state, 'modules/enabled').at(-1)?.body).toEqual({ moduleId: 'knowledge.deduction', enabled: false });
    await shot(page, 'modules');
    expect(state.unknown).toEqual([]);
    expect(state.errors).toEqual([]);
});

test('settings: typed values, changed filter, and read-only without the manage permission', async ({ page }) => {
    const state = await mockV3(page);
    await page.goto(`${BASE}/settings`);
    await expect(card(page, 'Engine')).toContainText('kernel.klivesTimeZone', BOOT);

    // A boolean is sent as a boolean, an integer as a number: never as the text that was typed.
    await page.locator('[data-setting="ingest.legacy.enabled"]').getByRole('checkbox').uncheck();
    await expect.poll(() => posts(state, 'settings/set').at(-1)?.body).toEqual({ key: 'ingest.legacy.enabled', value: false });
    const budget = page.locator('[data-setting="kernel.llmSlotMinutesPerDay"]');
    await budget.getByRole('spinbutton').fill('12.5');
    await budget.getByRole('button', { name: 'Save' }).click();
    await expect(budget.getByRole('alert')).toContainText('whole number');
    await budget.getByRole('button', { name: 'Reset to default' }).click();
    await expect.poll(() => posts(state, 'settings/set').at(-1)?.body).toEqual({ key: 'kernel.llmSlotMinutesPerDay', value: 600 });

    await page.getByRole('group', { name: 'Which settings' }).getByRole('button', { name: /Changed/ }).click();
    await expect(page.locator('[data-setting]')).toHaveCount(2);
    await expect(page).toHaveURL(/show=changed/);
    expect(state.unknown).toEqual([]);

    const readOnly = await page.context().newPage();
    await mockV3(readOnly, { permissions: ['omniscience.overview.view'] });
    await readOnly.goto(`${BASE}/settings`);
    await expect(readOnly.getByRole('note')).toContainText('Read only', BOOT);
    await expect(readOnly.locator('[data-setting="ingest.legacy.enabled"]').getByRole('checkbox')).toBeDisabled();
});

test('jobs: filters live in the URL and reach the server, pages use the cursor, a dead job can be retried', async ({ page }) => {
    const state = await mockV3(page);
    await page.goto(`${BASE}/jobs`);
    const rows = card(page, 'Jobs').locator('tbody tr');
    await expect(rows).toHaveCount(4, BOOT);

    await page.getByRole('button', { name: 'Load older jobs' }).click();
    await expect(rows).toHaveCount(6);
    expect(state.requests.some(r => r.startsWith(`GET ${V3}/jobs?`) && r.includes('cursor=1203'))).toBe(true);
    await expect(page.getByRole('button', { name: 'Load older jobs' })).toHaveCount(0);

    await page.getByRole('group', { name: 'Job state' }).getByRole('button', { name: 'Dead' }).click();
    await expect(rows).toHaveCount(1);
    await expect(page).toHaveURL(/state=dead/);
    expect(state.requests.some(r => r.startsWith(`GET ${V3}/jobs?`) && r.includes('state=dead'))).toBe(true);

    await rows.first().click();
    const drawer = page.locator('.ot-drawer');
    await expect(drawer).toContainText('provider answered 503 three times');
    await expect(drawer).toContainText('attempt 5 of 5');
    await drawer.getByRole('button', { name: 'Retry' }).click();
    await expect(drawer.locator('.ot-chip').first()).toHaveText('queued');
    expect(posts(state, 'jobs/retry').at(-1)?.body).toEqual({ jobId: 1204 });
    await shot(page, 'jobs');

    // A shared link reproduces the view: filter and open job.
    await go(page, `${BASE}/jobs?lane=Io&job=1206`);
    await expect(page.locator('.ot-drawer')).toContainText('worker-io-1', BOOT);
    await expect(card(page, 'Jobs').locator('tbody tr')).toHaveCount(1);
    expect(state.unknown).toEqual([]);
    expect(state.errors).toEqual([]);
});

test('llm: breakdown groups drill into the call list', async ({ page }) => {
    const state = await mockV3(page);
    await page.goto(`${BASE}/llm`);
    await expect(card(page, 'Breakdown').locator('tbody tr')).toHaveCount(2, BOOT);
    await expect(card(page, 'Calls').locator('tbody tr')).toHaveCount(3);
    await expect(page.locator('.ot-kpi').filter({ hasText: 'Served from cache' })).toContainText('80%');
    // The window is sent as an instant, never as a label for the server to interpret.
    expect(state.requests.some(r => r.includes(`${V3}/llm/summary`) && r.includes(`from=${NOW - 86_400_000}`))).toBe(true);

    await card(page, 'Breakdown').locator('tbody tr').filter({ hasText: 'Interactive' }).click();
    await expect(page).toHaveURL(/workClass=Interactive/);
    await expect(card(page, 'Calls').locator('tbody tr')).toHaveCount(1);
    await card(page, 'Calls').locator('tbody tr').first().click();
    await expect(page.locator('.ot-drawer')).toContainText('provider answered 503');
    expect(state.unknown).toEqual([]);
    expect(state.errors).toEqual([]);
});

test('tactics: a schema-generated form, an estimate, a streamed run, and its output fed to another tactic', async ({ page }) => {
    const state = await mockV3(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(`${BASE}/tactics`);
    const catalogue = card(page, 'Catalogue').locator('tbody tr');
    await expect(catalogue).toHaveCount(3, BOOT);

    await catalogue.filter({ hasText: 'Set algebra' }).click();
    const drawer = page.locator('.ot-drawer');
    await expect(drawer.getByRole('button', { name: 'Run', exact: true })).toBeDisabled();
    await expect(drawer).toContainText('Needs at least 1 input set.');

    // Input: a saved cohort. Parameters: controls generated from the tactic's JSON Schema.
    await drawer.getByLabel('Add a saved cohort').selectOption('c-close');
    await expect(drawer).toContainText('3 items');
    await expect(drawer).toContainText('A required parameter is missing');
    await drawer.getByLabel('op *').selectOption('sort');
    await drawer.getByLabel('order').selectOption('Label');
    await drawer.getByRole('button', { name: 'Estimate first' }).click();
    await expect(drawer.getByTestId('omni-estimate')).toContainText('3 items');

    await drawer.getByRole('button', { name: 'Run', exact: true }).click();
    const run = posts(state, 'tactics/run').at(-1)?.body;
    expect(run.tactic).toBe('x27.setalgebra');
    expect(run.parameters).toEqual({ op: 'sort', order: 'Label' });
    expect(run.selections).toHaveLength(1);
    expect(run.selections[0].items.map((i: any) => i.id)).toEqual(['person-a', 'person-b', 'person-c']);
    expect(run.asOfMs).toBeNull();

    // The run view follows the NDJSON stream to its end.
    await expect(page.getByTestId('omni-run-state')).toHaveText('succeeded');
    await expect(page.getByTestId('omni-output')).toContainText('Sorted 3 people');
    await expect(page.getByTestId('omni-output')).toContainText('Synthetic Ada');
    await expect(page.getByTestId('omni-run')).toContainText('Stage: combine — 3 people');
    await expect(page).toHaveURL(/run=run-1/);
    await shot(page, 'tactic-run');

    // Outputs are inputs: only tactics that take people are offered, and the set arrives pre-filled.
    await page.getByRole('button', { name: 'Use as input for another tactic' }).click();
    await expect(page.getByTestId('omni-carry')).toContainText('3 Person items from run run-1');
    await expect(catalogue).toHaveCount(2);
    await catalogue.filter({ hasText: 'Save as cohort' }).click();
    await expect(page.locator('.ot-drawer')).toContainText('from run run-1');
    await page.locator('.ot-drawer').getByLabel('name *').fill('Sorted friends');
    await page.locator('.ot-drawer').getByRole('button', { name: 'Run', exact: true }).click();
    await expect.poll(() => posts(state, 'tactics/run').length).toBe(2);
    expect(posts(state, 'tactics/run')[1]!.body.parameters).toEqual({ name: 'Sorted friends' });
    expect(posts(state, 'tactics/run')[1]!.body.selections[0].origin).toBe('run run-1');
    expect(state.unknown).toEqual([]);
    expect(state.errors).toEqual([]);
});

test('tactics: a policy refusal is shown as such, and outbound tactics cannot be started without confirmation', async ({ page }) => {
    const state = await mockV3(page);
    state.refuseRuns = { status: 422, code: 'refused', message: 'This person is covered by the minor-safety guard; replicas are not built for them.' };
    await page.goto(`${BASE}/tactics?tactic=x26.cohort`);
    const drawer = page.locator('.ot-drawer');
    await expect(drawer).toContainText('Save as cohort', BOOT);
    await drawer.getByRole('button', { name: 'Add a selection' }).click();
    await drawer.getByLabel('People ids, one per line').fill('person-a\nperson-a\nperson-b');
    await drawer.getByLabel('People ids, one per line').blur();
    await drawer.getByLabel('name *').fill('Two people');
    await drawer.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(drawer.getByTestId('omni-run-problem')).toContainText('Refused by policy');
    await expect(drawer.getByTestId('omni-run-problem')).toContainText('minor-safety guard');
    // Duplicate ids are one member, not two.
    expect(posts(state, 'tactics/run').at(-1)?.body.selections[0].items).toEqual([{ id: 'person-a' }, { id: 'person-b' }]);

    await go(page, `${BASE}/tactics?tactic=x77.notify`);
    await expect(page.locator('.ot-drawer')).toContainText('acts on the outside world', BOOT);
    await page.locator('.ot-drawer').getByRole('button', { name: 'Add a selection' }).click();
    await page.locator('.ot-drawer').getByLabel('Messages ids, one per line').fill('discord:1');
    await page.locator('.ot-drawer').getByLabel('Messages ids, one per line').blur();
    await expect(page.locator('.ot-drawer').getByRole('button', { name: 'Run', exact: true })).toBeDisabled();
    expect(state.unknown).toEqual([]);
});

test('playbooks: the server validates the draft, and the saved trigger carries only what its kind uses', async ({ page }) => {
    const state = await mockV3(page);
    await page.goto(`${BASE}/playbooks`);
    await expect(card(page, 'Playbooks')).toContainText('Sun at 10:00 (Europe/London)', BOOT);

    await page.getByRole('button', { name: 'New playbook' }).click();
    const drawer = page.locator('.ot-drawer');
    await drawer.getByLabel('Name').fill('Morning sort');
    await drawer.getByLabel('Step 1 tactic').selectOption('x27.setalgebra');
    await drawer.getByLabel('op *').selectOption('topk');
    await drawer.getByLabel('k', { exact: true }).fill('5');
    await drawer.getByLabel('Step 1 input').selectOption('trigger');
    await drawer.getByLabel('Trigger').selectOption('Daily');
    await expect(drawer.getByTestId('omni-pb-problems')).toContainText("needs 'at' as HH:mm");
    await expect(drawer.getByRole('button', { name: 'Save' })).toBeDisabled();
    await drawer.getByLabel('At (Europe/London)').fill('07:30');
    await expect(drawer.getByTestId('omni-pb-next')).toContainText('BST');

    await drawer.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => posts(state, 'playbooks/save').length).toBe(1);
    expect(posts(state, 'playbooks/save')[0]!.body).toEqual({
        id: null, name: 'Morning sort', enabled: true, trigger: { kind: 'Daily', at: '07:30' },
        definition: { steps: [{ tactic: 'x27.setalgebra', parameters: { op: 'topk', k: 5 }, input: { from: 'trigger' } }] },
    });
    await expect(card(page, 'Playbooks').locator('tbody tr')).toHaveCount(2);
    await expect(page).toHaveURL(/playbook=pb-new/);
    await drawer.getByRole('button', { name: 'Run now' }).click();
    await expect.poll(() => posts(state, 'playbooks/run').at(-1)?.body).toEqual({ playbookId: 'pb-new' });
    await shot(page, 'playbook');
    expect(state.unknown).toEqual([]);
    expect(state.errors).toEqual([]);
});

test('explore: the view is the URL, every row opens its records, and a result can feed a tactic', async ({ page }) => {
    const state = await mockV3(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(`${BASE}/explore`);
    const result = card(page, 'Messages');
    // The first dataset and its first measure are chosen without being asked.
    await expect(result.locator('tbody tr')).toHaveCount(1, BOOT);
    await expect(result).toContainText('5,112');
    await expect(page.getByTestId('omni-coverage')).toContainText('5,112 records from 2 sources');

    await page.locator('details.omni-pick').filter({ hasText: 'Split by' }).locator('summary').click();
    await page.getByRole('group', { name: 'Split by' }).getByLabel('Platform').check();
    await expect(result.locator('tbody tr')).toHaveCount(3);
    await expect(page).toHaveURL(/groupBy=where\.platform/);
    const query = posts(state, 'explore/query').at(-1)?.body;
    expect(query).toMatchObject({ dataset: 'messages', measures: ['count'], groupBy: ['where.platform'], bucket: 'None', lens: 'Klives', filters: [], asOfMs: null });
    // An unknown value is shown as unknown, never as zero or blank.
    await expect(result.locator('tbody tr').nth(2)).toContainText('unknown');
    await expect(card(page, 'Messages by Platform').locator('.ot-bar')).toHaveCount(3);

    // An unfinished filter never widens the result: no query is sent until it has a value.
    const before = posts(state, 'explore/query').length;
    await page.getByRole('button', { name: 'Add filter' }).click();
    await page.getByLabel('Filter 1 dimension').selectOption('time.sent');
    await page.getByLabel('Filter 1 operator').selectOption('Gte');
    await expect(page.locator('.frow').first()).toContainText('needs a value');
    await page.waitForTimeout(500);
    expect(posts(state, 'explore/query').length).toBe(before);
    // Typed on Klives's clock (BST), sent as the UTC instant.
    await page.getByLabel(/Filter 1 from/).fill('2026-06-01T00:00');
    await expect.poll(() => posts(state, 'explore/query').at(-1)?.body.filters).toEqual(
        [{ dimension: 'time.sent', op: 'Gte', values: [Date.UTC(2026, 4, 31, 23, 0)] }]);

    // Drill-down: the row's own values narrow the records.
    await result.locator('tbody tr').filter({ hasText: 'whatsapp' }).click();
    await expect(page.getByTestId('omni-records').locator('tbody tr')).toHaveCount(2);
    await expect(page.getByTestId('omni-records')).toContainText('whatsapp:1001');
    expect(posts(state, 'explore/records').at(-1)?.body).toMatchObject({
        drillToken: 'drill-fixture', narrow: [{ dimension: 'where.platform', op: 'Eq', values: ['whatsapp'] }], limit: 100,
    });
    await shot(page, 'explore-drill');
    await page.locator('.ot-drawer').getByRole('button', { name: /Close/ }).click();

    // The link alone restores the whole view.
    const link = new URL(page.url());
    await go(page, `${BASE}/jobs`);
    await expect(page.getByRole('heading', { name: 'Jobs', exact: true }).first()).toBeVisible();
    await go(page, `${link.pathname}${link.search}`);
    await expect(card(page, 'Messages').locator('tbody tr')).toHaveCount(3, BOOT);
    await expect(page.getByLabel('Filter 1 operator')).toHaveValue('Gte');

    await page.getByRole('button', { name: 'Use these records in a tactic' }).click();
    await expect(page).toHaveURL(/\/omniscience-v3\/tactics/);
    await expect(page.getByTestId('omni-carry')).toContainText('1 ExploreDrill item from Explore');
    expect(state.unknown).toEqual([]);
    expect(state.errors).toEqual([]);
});

test('explore: a build without the engine says so', async ({ page }) => {
    const state = await mockV3(page, { exploreInstalled: false });
    await page.goto(`${BASE}/explore`);
    await expect(card(page, 'Messages').locator('.ot-state')).toContainText('The Explore engine is not installed in this build yet.', BOOT);
    expect(state.unknown).toEqual([]);
});

test('live: events arrive over the socket, resume from the last id, and a gap is announced', async ({ page }) => {
    const state = await mockV3(page);
    await page.goto(`${BASE}/live`);
    await expect(page.getByTestId('omni-live-state')).toContainText('connected', BOOT);
    await expect.poll(() => state.sockets.length).toBe(1);
    expect(state.sockets[0]!.url.searchParams.get('authorization')).toBe('kms_e2e');
    expect(state.sockets[0]!.url.searchParams.get('since')).toBeNull();

    state.push({ id: 7, at: NOW, topic: 'job.finished', payload: { jobId: 1203, moduleId: 'knowledge.deduction', state: 'succeeded' } });
    state.push({ id: 8, at: NOW + 1000, topic: 'alert', payload: { title: 'Synthetic alert' } });
    state.push({ id: 9, at: NOW + 2000, topic: 'stream.ping', payload: {} });
    const feed = page.locator('.feed li');
    await expect(feed).toHaveCount(2);
    await expect(feed.first()).toContainText('title Synthetic alert');
    await page.getByRole('group', { name: 'Topic' }).getByRole('button', { name: /^job/ }).click();
    await expect(feed).toHaveCount(1);
    await expect(feed.first()).toContainText('jobId 1203');
    await page.getByRole('group', { name: 'Topic' }).getByRole('button', { name: /^All/ }).click();

    // Paused: nothing moves under the reader, and nothing is lost.
    await page.getByRole('button', { name: 'Pause' }).click();
    state.push({ id: 10, at: NOW + 3000, topic: 'job.progress', payload: { jobId: 1206 } });
    await expect(page.getByRole('button', { name: 'Resume (1 waiting)' })).toBeVisible();
    await expect(feed).toHaveCount(2);
    await page.getByRole('button', { name: /Resume/ }).click();
    await expect(feed).toHaveCount(3);

    // The connection drops: the page reconnects from the last id it saw (the ping advanced it past 9).
    await state.sockets[0]!.ws.close({ code: 1011 });
    await expect.poll(() => state.sockets.at(-1)?.url.searchParams.get('since'), { timeout: 15_000 }).toBe('10');
    state.push({ id: 60, at: NOW + 9000, topic: 'stream.reset', payload: { reason: 'events_pruned' } });
    await expect(page.getByRole('status').filter({ hasText: 'Some events were missed' })).toContainText('events_pruned');
    expect(state.unknown).toEqual([]);
    expect(state.errors).toEqual([]);
});

test('cohorts: members are listed and the cohort becomes a tactic input', async ({ page }) => {
    const state = await mockV3(page);
    await page.goto(`${BASE}/cohorts`);
    await card(page, 'Cohorts').locator('tbody tr').first().click(BOOT);
    await expect(page.locator('.ot-drawer')).toContainText('Synthetic Bo');
    await page.getByRole('button', { name: 'Run a tactic on this cohort' }).click();
    await expect(page.getByTestId('omni-carry')).toContainText('3 Person items from cohort Close friends', BOOT);
    expect(state.unknown).toEqual([]);
});

test('a profile without the engine permission sees no controls it cannot use', async ({ page }) => {
    const state = await mockV3(page, { permissions: ['omniscience.overview.view'] });
    await page.goto(`${BASE}/modules?module=knowledge.deduction`);
    const drawer = page.locator('.ot-drawer');
    await expect(drawer).toContainText('Extracts, verifies and consolidates', BOOT);
    await expect(drawer.getByRole('button', { name: 'Disable' })).toHaveCount(0);

    await go(page, `${BASE}/tactics?tactic=x27.setalgebra`);
    await expect(page.locator('.ot-drawer')).toContainText('You cannot run this tactic.', BOOT);
    await expect(page.locator('.ot-drawer').getByRole('button', { name: 'Run', exact: true })).toBeDisabled();
    expect(state.unknown).toEqual([]);
});
