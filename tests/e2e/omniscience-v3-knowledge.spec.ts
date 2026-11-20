import { expect, test, type Page } from '@playwright/test';
import { BOOT, V3, loadPage, mockV3 } from './fixtures/omniscience-v3-api';

/**
 * The Omniscience v3 pages built on the merged contract: what is known about a person, the review
 * queue, asking, the agenda, the Quality Lab, replicas, sources and imports, and image search.
 * Against the typed mock, synthetic people only. Screenshots land in test-results/omniscience-v3/.
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

/** Later visits in one test go through the app's router (see the engine spec for why). */
async function go(page: Page, path: string) {
    const mounted = await page.evaluate(() => !!(document.querySelector('#__nuxt') as any)?.__vue_app__).catch(() => false);
    if (!mounted) { await loadPage(page, path); return; }
    await page.evaluate(to => (document.querySelector('#__nuxt') as any).__vue_app__.config.globalProperties.$router.push(to), path);
}

const card = (page: Page, title: string) => page.locator('.omni-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
const posts = (state: Awaited<ReturnType<typeof mockV3>>, sub: string) => state.posts.filter(r => r.path === `${V3}/${sub}`);
/** Answers every confirm with yes, and every prompt with `text`. */
const answerDialogs = (page: Page, text = 'settled by hand') => page.on('dialog', d => { void d.accept(d.type() === 'prompt' ? text : undefined); });

test('a person: what is known, with evidence, and a decision about a fact takes effect', async ({ page }) => {
    const state = await mockV3(page);
    await page.setViewportSize({ width: 1600, height: 1100 });
    await loadPage(page, `${BASE}/people/person-a?tab=knowledge`);
    const known = card(page, 'What is known');
    await expect(known).toContainText('Leeds', BOOT);
    await expect(known).toContainText('the library');
    await expect(known.locator('tr', { hasText: 'the library' })).toContainText('confirmed');
    await expect(known.locator('tr', { hasText: 'Bristol' })).toHaveClass(/past/);
    // A period is only as exact as its evidence: it started some time in April or May, so it says "about".
    await expect(known.locator('tr', { hasText: 'Leeds' })).toContainText('since about 2026-05');
    await expect(known.locator('tr', { hasText: 'Bristol' })).toContainText('until about 2026-04');
    await expect(known.locator('tr', { hasText: 'Synthetic Eli' })).toContainText('someone else said it');
    // What was only inferred is labelled as such, apart from the facts.
    await expect(card(page, 'Worked out, not stated')).toContainText('a dog');
    await expect(card(page, 'Worked out, not stated')).toContainText('inferred');
    await expect(card(page, 'Open guesses')).toContainText('May be looking for a new flat');
    await expect(card(page, 'People, places and things they mention')).toContainText('The climbing wall');
    await expect(page.getByTestId('age-band')).toContainText('Adult');
    await expect(page.getByTestId('person-knowledge')).toContainText('3,120 messages read');

    // Looking back. A fact still being checked is not shown as knowledge, but it can be asked for.
    await expect(known.locator('tr', { hasText: 'rock climbing' })).toHaveCount(0);
    const back = page.getByTestId('person-lookback');
    const backRows = back.getByTestId('lookback-table').locator('tbody tr');
    await expect(back).toContainText('Pick a date or a status');
    await back.getByTestId('lookback-status').selectOption('proposed');
    await expect(backRows).toHaveCount(1);
    await expect(backRows.first()).toContainText('rock climbing');
    await back.getByTestId('lookback-status').selectOption('');
    // On a day in April she had not moved yet: Bristol still held, and Leeds had not started.
    await back.getByTestId('lookback-mode').selectOption('asof');
    await expect(back).toContainText('Pick the date');
    await expect(back).toContainText('Days are counted in Europe/London.');
    await back.getByTestId('lookback-date').fill('2026-04-12');
    await expect(back.getByTestId('lookback-table')).toContainText('Bristol');
    await expect(back.getByTestId('lookback-table')).not.toContainText('Leeds');
    await expect(back.getByTestId('lookback-table')).toContainText('Synthetic Eli');
    // "On the 12th" is the end of that day in the time lens's zone (22:59:59.999 UTC in British summer time).
    const endOfDay = Date.UTC(2026, 3, 12, 22, 59, 59, 999);
    expect(state.requests.some(r => r.startsWith(`GET ${V3}/knowledge/facts?`) && r.includes('mode=asof') && r.includes(`at=${endOfDay}`))).toBe(true);
    // Going only by what had been said by then, the sibling is not known yet: that was first said in June.
    await back.getByTestId('lookback-mode').selectOption('said');
    await expect(back.getByTestId('lookback-table')).not.toContainText('Synthetic Eli');
    await expect(back.getByTestId('lookback-table')).toContainText('Bristol');
    expect(state.requests.some(r => r.startsWith(`GET ${V3}/knowledge/facts?`) && r.includes('knownByThen=true'))).toBe(true);
    await shot(page, 'person-knowledge-lookback');
    // What was on record that day: nothing, their messages were first read three days ago. The view is part of the link.
    await back.getByTestId('lookback-mode').selectOption('known');
    await expect(back).toContainText('Nothing was on record that day.');
    await expect(page).toHaveURL(/look=known/);
    await expect(page).toHaveURL(/lookOn=2026-04-12/);
    await back.getByRole('button', { name: 'Clear' }).click();
    await expect(back).toContainText('Pick a date or a status');
    await expect(page).not.toHaveURL(/look=/);

    // A fact opens with the messages it rests on and its earlier versions.
    await page.getByTestId('fact-as-city').click();
    const drawer = page.getByTestId('fact-drawer');
    await expect(drawer).toContainText('synthetic: Leeds');
    await expect(drawer).toContainText('Synthetic Ada');
    await expect(drawer).toContainText('extract-6');
    await shot(page, 'person-knowledge-fact');
    // Rejecting it is recorded, and the fact leaves the profile.
    await page.getByTestId('fact-reject').click();
    await expect.poll(() => posts(state, 'knowledge/facts/review').at(-1)?.body).toMatchObject({ assertionId: 'as-city', verdict: 'reject' });
    await expect(drawer).toHaveCount(0);
    await expect(known.locator('tr', { hasText: 'Leeds' })).toHaveCount(0);
    // It is kept, and found again under what was rejected, where it opens the same way and the decision can be changed.
    await back.getByTestId('lookback-status').selectOption('rejected');
    await expect(backRows).toHaveCount(1);
    await expect(backRows.first()).toContainText('Leeds');
    await backRows.first().click();
    await expect(drawer).toContainText('synthetic: Leeds');
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await back.getByRole('button', { name: 'Clear' }).click();

    // A name is confirmed; an age statement can be thrown out; their messages can be read again on request.
    await page.getByTestId('aliases-table').getByTitle('Yes, that is them').click();
    await expect(page.getByTestId('aliases-table')).toContainText('confirmed');
    expect(posts(state, 'knowledge/aliases/review').at(-1)?.body).toEqual({ aliasId: 'al-1', verdict: 'confirm' });
    await card(page, 'Age').getByTitle(/not about their age/).click();
    await expect.poll(() => posts(state, 'knowledge/age/review').at(-1)?.body).toEqual({ evidenceId: 'age-1', verdict: 'reject' });
    await page.getByTestId('deduce-now').click();
    await expect.poll(() => state.knowledge.deductionRuns).toEqual(['person-a']);
    await shot(page, 'person-knowledge');

    // Timeline and plans: an event keeps the range it could have happened in; people are shown by name.
    await page.getByTestId('person-tab-timeline').click();
    const timeline = card(page, 'Life timeline');
    await expect(timeline).toContainText('Moved to Leeds');
    await expect(timeline.locator('li', { hasText: 'Moved to Leeds' })).toContainText('2026-04 – 2026-05');
    await expect(page.getByTestId('person-plans')).toContainText('Dinner at the noodle place');
    await expect(page.getByTestId('person-plans').locator('li', { hasText: 'Dinner at the noodle place' })).toContainText('Synthetic Ada with Klives');
    expect(state.requests.some(r => r.startsWith(`GET ${V3}/people/names?`))).toBe(true);

    // How it was worked out: runs, claims with the reason one was thrown away, and a merge that can be undone.
    answerDialogs(page);
    await page.getByTestId('person-tab-audit').click();
    await expect(page.getByTestId('runs-table')).toContainText('extract-7', BOOT);
    await expect(page.getByTestId('claims-table').locator('tbody tr')).toHaveCount(2);
    await page.getByRole('group', { name: 'Claim verdict' }).getByRole('button', { name: 'Rejected' }).click();
    await expect(page.getByTestId('claims-table').locator('tbody tr')).toHaveCount(1);
    await expect(page.getByTestId('claims-table')).toContainText('Quote not found');
    await page.getByTestId('merges-table').getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => posts(state, 'knowledge/persons/unmerge').at(-1)?.body).toEqual({ mergeId: 7 });
    await expect(page.getByTestId('merges-table')).toContainText('undone');
    await shot(page, 'person-audit');
    expect(state.unknown).toEqual([]);
    expect(state.errors).toEqual([]);
});

test('a person under 18: no inferences, and the age band says what follows from it', async ({ page }) => {
    const state = await mockV3(page);
    await loadPage(page, `${BASE}/people/person-d?tab=knowledge`);
    await expect(page.getByTestId('person-knowledge')).toContainText('under 18 or may be: restricted facts are not kept', BOOT);
    await expect(card(page, 'Worked out, not stated')).toContainText('Nothing is inferred about someone who is, or may be, under 18.');
    await expect(page.getByTestId('age-band')).toContainText('Minor');
    await expect(page.getByTestId('age-band')).toContainText('no replica, no face labels, no alert about them');
    // Looking back does not get round it: whatever date or status is asked for, the same things are left out, and it says so.
    const back = page.getByTestId('person-lookback');
    await back.getByTestId('lookback-status').selectOption('inferred');
    await expect(back).toContainText('Nothing for that');
    await expect(back).toContainText('restricted facts and anything worked out about them are left out');
    expect(state.unknown).toEqual([]);
    expect(state.errors).toEqual([]);
});

test('review: the queue is settled item by item, and two accounts become one person only on a confirmed yes', async ({ page }) => {
    const state = await mockV3(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    answerDialogs(page, 'Leeds: she moved in April');
    await loadPage(page, `${BASE}/review`);
    const items = page.getByTestId('review-list').locator('> li');
    await expect(items).toHaveCount(3, BOOT);
    await expect(items.first()).toContainText('Age statements disagree'); // most important first
    await expect(items.first()).toContainText('Synthetic Bo');            // by name, not by id
    await page.getByLabel('Kind').selectOption('contradiction');
    await expect(items).toHaveCount(1);
    await items.first().getByRole('button', { name: 'City: Leeds or Bristol?' }).click();
    await expect(items.first()).toContainText('Two facts that cannot both be true.');
    await expect(items.first()).toContainText('"Bristol"');
    await shot(page, 'review');
    await page.getByTestId('review-resolve-rv-1').click();
    await expect.poll(() => posts(state, 'knowledge/review/resolve').at(-1)?.body).toEqual({ itemId: 'rv-1', state: 'resolved', resolution: 'Leeds: she moved in April' });
    await expect(page.getByTestId('review-list')).toHaveCount(0);

    await page.getByTestId('review-tab-links').click();
    const link = page.getByTestId('links-list').locator('> li').first();
    await expect(link).toContainText('Synthetic Ada', BOOT);
    await expect(link).toContainText('Synthetic Eli');
    await expect(link).toContainText('2 independent signs');
    await expect(link).toContainText('They talk to the same three people.');
    await shot(page, 'review-links');
    await page.getByTestId('link-accept-lk-1').click();
    await expect.poll(() => posts(state, 'knowledge/identity-links/decide').at(-1)?.body).toEqual({ linkId: 'lk-1', accept: true, confirm: true });
    await expect(page.getByText('Merged: Synthetic Eli is now part of Synthetic Ada.')).toBeVisible();
    await expect(card(page, 'Accounts that may be one person')).toContainText('No suggestions waiting');
    // A merge is never final: it can be undone from the merged list.
    await page.getByRole('group', { name: 'Decision' }).getByRole('button', { name: 'Merged' }).click();
    await page.getByRole('button', { name: 'Undo the merge' }).click();
    await expect.poll(() => posts(state, 'knowledge/identity-links/undo').at(-1)?.body).toEqual({ linkId: 'lk-1' });
    expect(state.unknown).toEqual([]);
    expect(state.errors).toEqual([]);
});

test('ask: a plan, an answer with its evidence, a verdict on the answer, and a question kept under watch', async ({ page }) => {
    const state = await mockV3(page);
    await page.setViewportSize({ width: 1600, height: 1100 });
    await loadPage(page, `${BASE}/ask`);
    await expect(page.getByTestId('ask-form')).toBeVisible(BOOT);
    await expect(page.getByTestId('ask-submit')).toBeDisabled();
    await page.getByLabel('Question').fill('Does Ada still live in Leeds?');
    await page.getByTestId('ask-plan').click();
    const plan = page.getByTestId('ask-plan-result');
    await expect(plan).toContainText('Whether it is true that: Does Ada still live in Leeds');
    await plan.getByRole('button', { name: '+ Synthetic Ada' }).click();
    await expect(page.getByTestId('ask-people')).toContainText('Synthetic Ada');

    await page.getByTestId('ask-submit').click();
    await expect.poll(() => state.knowledge.asked.at(-1)).toMatchObject({ question: 'Does Ada still live in Leeds?', personIds: ['person-a'], standing: false });
    const report = page.getByTestId('inquiry-report');
    await expect(page.getByTestId('inquiry-verdict')).toHaveText('Yes', BOOT);
    await expect(report).toContainText('82% (70–90%)');
    await expect(report).toContainText('synthetic: I moved to Leeds last month');
    await expect(report).toContainText('412 considered');
    await expect(report).toContainText('A later message saying they moved again');
    await expect(page).toHaveURL(/run=run-iq-4/);
    await shot(page, 'ask-answer');
    await card(page, 'The answer').getByRole('button', { name: 'It was right' }).click();
    await expect.poll(() => posts(state, 'knowledge/inquiries/feedback').at(-1)?.body).toEqual({ inquiryId: 'iq-4', feedback: 'correct' });
    await expect(card(page, 'The answer')).toContainText('you said: correct');

    // Past answers; one that could not tell which person was meant offers the candidates.
    await page.getByTestId('ask-tab-past').click();
    const rows = page.getByTestId('inquiries-table').locator('tbody tr');
    await expect(rows).toHaveCount(4, BOOT);
    await expect(rows.filter({ hasText: 'still at the bakery' })).toContainText('watching');
    await rows.filter({ hasText: 'Where does Ada work?' }).click();
    await expect(page.getByTestId('inquiry-verdict')).toHaveText('Which person?');
    await page.getByTestId('inquiry-report').getByRole('button', { name: 'Synthetic Eli' }).click();
    await expect(page.getByTestId('ask-people')).toContainText('Synthetic Eli');
    await expect(page.getByLabel('Question')).toHaveValue('Where does Ada work?');

    // Someone under 18 is refused in words, not silently.
    await page.getByLabel('About (optional)').fill('dee');
    await page.getByTestId('ask-people').getByRole('option', { name: /Synthetic Dee/ }).click();
    await page.getByTestId('ask-submit').click();
    await expect(page.getByText(/they are, or may be, under 18/)).toBeVisible();

    await page.getByTestId('ask-tab-standing').click();
    const standing = page.getByTestId('standing-table');
    await expect(standing).toContainText('Is Synthetic Bo still at the bakery?', BOOT);
    await expect(standing).toContainText('Synthetic Bo');
    await standing.getByRole('button', { name: 'Stop watching' }).click();
    await expect.poll(() => posts(state, 'knowledge/standing/enabled').at(-1)?.body).toEqual({ questionId: 'sq-1', enabled: false });
    await expect(standing).toContainText('off');
    await shot(page, 'ask-standing');
    expect(state.unknown).toEqual([]);
    expect(state.errors).toEqual([]);
});

test('agenda and quality lab: what is coming, what slipped, and whether the facts can be trusted', async ({ page }) => {
    const state = await mockV3(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await loadPage(page, `${BASE}/agenda`);
    await expect(page.getByTestId('agenda-overdue')).toContainText('Return the board game', BOOT);
    await expect(page.getByTestId('agenda-promises')).toContainText('Send the hiking photos');
    await expect(page.getByTestId('agenda-promises')).toContainText('your promise');
    await expect(page.getByTestId('agenda-promises')).toContainText('Klives with Synthetic Ada');
    await expect(page.getByTestId('agenda-upcoming')).toContainText("Synthetic Bo's birthday");
    await expect(page.getByTestId('agenda-all').locator('li')).toHaveCount(4);
    await page.getByLabel('Status').selectOption('overdue');
    await expect(page.getByTestId('agenda-all').locator('li')).toHaveCount(1);
    expect(state.requests.some(r => r.startsWith(`GET ${V3}/knowledge/plans?`) && r.includes('status=overdue'))).toBe(true);
    await expect(page).toHaveURL(/status=overdue/);
    await shot(page, 'agenda');

    await go(page, `${BASE}/quality`);
    await expect(page.getByTestId('quality-gate')).toContainText('This prompt passed the comparison', BOOT);
    await expect(page.getByTestId('quality-gate')).toContainText('extract-6');
    await expect(page.getByTestId('quality-gold')).toContainText('94%');
    await expect(page.getByTestId('quality-gold')).toContainText('[88%–97%]');
    await expect(page.getByTestId('quality-planted')).toContainText('Recall');
    await page.getByTestId('quality-run-planted').click();
    await expect.poll(() => posts(state, 'knowledge/quality/run').at(-1)?.body).toEqual({ kind: 'planted' });
    await shot(page, 'quality');
    expect(state.unknown).toEqual([]);
    expect(state.errors).toEqual([]);
});

test('replicas: the list, a build, a chat that streams its reply, test replies and a blind test', async ({ page }) => {
    const state = await mockV3(page);
    await page.setViewportSize({ width: 1600, height: 1100 });
    answerDialogs(page);
    await loadPage(page, `${BASE}/replicas`);
    await expect(page.getByTestId('replica-kpis')).toContainText('Replicas', BOOT);
    const people = page.getByTestId('replica-people').locator('tbody tr');
    await expect(people).toHaveCount(3, BOOT);
    await expect(people.filter({ hasText: 'Synthetic Ada' })).toContainText('told apart 61% of the time (52–69%)');
    await expect(people.filter({ hasText: 'Synthetic Dee' })).toContainText('not allowed');
    await shot(page, 'replicas');
    await people.filter({ hasText: 'Synthetic Ada' }).click();

    await expect(page.getByTestId('replica-name')).toHaveText('Synthetic Ada', BOOT);
    await expect(page.getByTestId('replica-chips')).toContainText('ready');
    await expect(card(page, 'In use')).toContainText('Version #2');
    await expect(card(page, 'What there is to learn from')).toContainText('Enough to build from: 2100 usable replies');

    // A chat: the reply arrives as it is written, and every written line says it is a simulation.
    await page.getByTestId('replica-chats').getByRole('button', { name: 'About the trip' }).click();
    const chat = page.getByTestId('replica-chat');
    await expect(chat).toContainText('A simulation.');
    await expect(chat.getByTestId('chat-line-2')).toContainText('yeah!! wouldnt miss it');
    await expect(chat.getByTestId('chat-line-2')).toContainText('simulated');
    await chat.getByTestId('chat-input').fill('bringing anyone?');
    await chat.getByTestId('chat-send').click();
    await expect(chat.getByTestId('chat-line-4')).toContainText('honestly yes, cant wait');
    expect(posts(state, 'replica/chats/send').at(-1)?.body).toEqual({ chatId: 'ch-1', content: 'bringing anyone?' });
    await chat.getByTestId('chat-line-4').getByTitle('Sounds like them').click();
    await expect.poll(() => state.knowledge.ratings.at(-1)).toEqual({ chatId: 'ch-1', seq: 4, rating: 1 });
    await shot(page, 'replica-chat');

    // Versions, and what a version wrote beside what they really said.
    await page.getByTestId('replica-tab-versions').click();
    await page.getByTestId('replica-versions').locator('tbody tr').first().click();
    await expect(card(page, 'Version #2')).toContainText('wouldnt, honestly, proper', BOOT);
    await expect(card(page, 'Version #2')).toContainText('chosen');
    await page.getByTestId('replica-tab-eval').click();
    await expect(page.getByTestId('replica-evals').locator('tbody tr')).toHaveCount(3);
    await expect(page.getByTestId('replica-evals')).toContainText('fooled');
    await expect(page.getByTestId('replica-evals')).toContainText('synthetic: brutal but worth it');

    // Blind test: pick the real reply; the result says which it was.
    await page.getByTestId('replica-tab-blind').click();
    await page.getByTestId('blind-start').click();
    await expect(page.getByTestId('blind-item')).toContainText('how was the climb?');
    await page.getByTestId('blind-a').click();
    await expect(page.getByTestId('blind-last')).toContainText('Right.');
    await page.getByTestId('blind-a').click();
    await expect(page.getByTestId('blind-last')).toContainText('The replica fooled you.');
    await expect(page.getByTestId('blind-done')).toContainText('1 time out of 2');
    // Once it is over, each pair says which reply was really theirs and which one was picked.
    const pairs = page.getByTestId('blind-review').locator('> li');
    await expect(pairs).toHaveCount(2);
    await expect(pairs.nth(0).locator('.reply', { hasText: 'brutal but worth it' })).toContainText('really them');
    await expect(pairs.nth(0).locator('.reply', { hasText: 'brutal but worth it' })).toContainText('your pick');
    await expect(pairs.nth(1).locator('.reply', { hasText: 'yeah should be!!' })).toContainText('really them');
    await expect(pairs.nth(1).locator('.reply', { hasText: 'i think so, will check' })).toContainText('your pick');
    await expect(page).toHaveURL(/blind=bl-1/);
    await shot(page, 'replica-blind');

    // Another one, left half way. Its answers are kept, and it is carried on from the results, read again by its id.
    await page.getByTestId('blind-leave').click();
    await expect(page).not.toHaveURL(/blind=/);
    await page.getByTestId('blind-start').click();
    await expect(page).toHaveURL(/blind=bl-2/);
    await page.getByTestId('blind-b').click();
    await expect(page.getByTestId('blind-progress')).toContainText('1 of 2 answered');
    await expect(page.getByTestId('blind-review')).toHaveCount(0); // nothing is given away while pairs are still open
    await page.getByTestId('blind-leave').click();
    const tests = page.getByTestId('blind-results').locator('> li');
    await expect(tests).toHaveCount(2);
    await expect(tests.first()).toContainText('1 left');
    await tests.first().getByRole('button', { name: 'Carry on' }).click();
    await expect(page.getByTestId('blind-item')).toContainText('free on friday?');
    await expect.poll(() => state.requests.some(r => r.startsWith(`GET ${V3}/replica/blind/session?`) && r.includes('id=bl-2'))).toBe(true);
    // The finished one can be looked at again; a link to a test that no longer exists falls back to the start.
    await tests.nth(1).getByRole('button', { name: 'Look at it' }).click();
    await expect(page.getByTestId('blind-done')).toContainText('1 time out of 2');
    await go(page, `${BASE}/replicas/person-a?tab=blind&blind=bl-404`);
    await expect(page.getByTestId('blind-start')).toBeVisible();
    await expect(page).not.toHaveURL(/blind=/);

    // A new version is built beside the one in use.
    await page.getByTestId('replica-train').click();
    await expect.poll(() => state.knowledge.trained).toEqual(['person-a']);
    await expect(page.getByTestId('replica-stages')).toContainText('Indexing them by meaning', BOOT);
    await expect(page.getByTestId('replica-stages')).toContainText('800 of 2,400');
    await shot(page, 'replica-building');

    // Nobody under 18 has a replica, and the page says so rather than offering to build one.
    await go(page, `${BASE}/replicas/person-d`);
    await expect(page.getByTestId('replica-blocked')).toContainText('under 18', BOOT);
    await expect(page.getByTestId('replica-train')).toBeDisabled();
    expect(state.unknown).toEqual([]);
    expect(state.errors).toEqual([]);
});

test('replicas: a simulated group talks in turns, and never includes someone under 18', async ({ page }) => {
    const state = await mockV3(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await loadPage(page, `${BASE}/replicas?tab=groups`);
    const form = page.getByTestId('group-form');
    await expect(form).toBeVisible(BOOT);
    const pick = async (text: string, name: RegExp) => {
        await form.getByLabel('People (2 to 6)').fill(text);
        await page.getByTestId('group-members').getByRole('option', { name }).click();
    };
    await pick('ada', /Synthetic Ada/);
    await pick('dee', /Synthetic Dee/);
    await form.getByLabel('What they talk about').fill('where to go for the weekend');
    await form.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText(/Synthetic Dee is, or may be, under 18/)).toBeVisible();

    await page.getByTestId('group-members').getByRole('button', { name: 'Remove Synthetic Dee' }).click();
    await pick('bo', /Synthetic Bo/);
    await form.getByRole('button', { name: 'Create' }).click();
    await expect.poll(() => posts(state, 'replica/groups/create').at(-1)?.body).toMatchObject({ personIds: ['person-a', 'person-b'], topic: 'where to go for the weekend' });
    const chat = page.getByTestId('replica-chat');
    await expect(chat).toContainText('Nothing said yet', BOOT);
    await chat.getByTestId('chat-advance').click();
    await expect(chat.getByTestId('chat-line-1')).toContainText('what about the lakes?');
    await expect(chat.getByTestId('chat-line-2')).toContainText('Synthetic Bo');
    await expect(chat.getByTestId('chat-line-2')).toContainText('simulated');
    await shot(page, 'replica-group');
    expect(state.unknown).toEqual([]);
    expect(state.errors).toEqual([]);
});

test('sources: the Discord connection, and an export looked inside before it is imported', async ({ page }) => {
    const state = await mockV3(page);
    await page.setViewportSize({ width: 1600, height: 1100 });
    answerDialogs(page);
    await loadPage(page, `${BASE}/sources`);
    await expect(page.getByTestId('discord-chips')).toContainText('listening', BOOT);
    await expect(card(page, 'Discord (through KliveBot)')).toContainText('48,210');
    const backfill = page.getByTestId('backfill-form');
    await backfill.getByLabel(/whole history/).fill('abc');
    await expect(backfill.getByRole('button', { name: 'Start' })).toBeDisabled();
    await backfill.getByLabel(/whole history/).fill('123456789012345678');
    await backfill.getByRole('button', { name: 'Start' }).click();
    await expect.poll(() => state.knowledge.backfills).toEqual(['123456789012345678']);

    // Looking inside reads the export without importing it; a question it cannot answer blocks the import.
    await page.getByTestId('preview-synthetic-chat.zip').click();
    const preview = page.getByTestId('import-preview');
    await expect(preview).toContainText('WhatsApp chat export', BOOT);
    await expect(preview).toContainText('1,820');
    await expect(page.getByTestId('import-decision')).toContainText('Which time zone was the phone in?');
    await expect(page.getByTestId('import-commit')).toBeDisabled();
    await shot(page, 'sources-preview');
    await page.getByLabel('Time zone the phone was in').fill('Europe/London');
    await page.getByRole('button', { name: 'Look again with these answers' }).click();
    await expect(page.getByTestId('import-decision')).toHaveCount(0);
    await expect(preview).toContainText('Europe/London');
    expect(state.knowledge.previews.at(-1)).toEqual({ name: 'synthetic-chat.zip', zone: 'Europe/London' });
    await expect(page.getByTestId('import-commit')).toContainText('Import 1,780 new messages');
    await page.getByTestId('import-commit').click();
    await expect(page.getByTestId('import-result')).toContainText('1,780 messages added', BOOT);
    await expect(page.getByTestId('ledger-table').locator('tbody tr')).toHaveCount(2);
    expect(posts(state, 'imports/commit').at(-1)?.body).toMatchObject({ name: 'synthetic-chat.zip', format: 'whatsapp', options: { zone: 'Europe/London' } });

    // An upload lands in the inbox and is looked inside straight away.
    await page.getByLabel('Choose an export to upload').setInputFiles({ name: 'new-export.txt', mimeType: 'text/plain', buffer: Buffer.from('synthetic export') });
    await expect.poll(() => state.knowledge.uploads).toEqual(['new-export.txt']);
    await expect(page.getByTestId('inbox-table')).toContainText('new-export.txt', BOOT);
    await expect(page.getByTestId('import-decision')).toBeVisible();
    await shot(page, 'sources');
    expect(state.unknown).toEqual([]);
    expect(state.errors).toEqual([]);
});

test('images: found by description, narrowed by who posted them, and opened with what is known about one', async ({ page }) => {
    const state = await mockV3(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await loadPage(page, `${BASE}/images`);
    await expect(page.getByText('Describe what you are looking for')).toBeVisible(BOOT);
    await page.getByTestId('image-query').fill('a price chart');
    await page.getByRole('button', { name: 'Search' }).click();
    const results = page.getByTestId('image-results').locator('> li');
    await expect(results).toHaveCount(2, BOOT);
    await expect(results.first()).toContainText('A screenshot of a trading app');
    await expect(results.first()).toContainText('the caption says so');
    await expect(results.first().locator('img')).toBeVisible(); // loaded as a blob: the route needs the auth header
    // Each result says where it was posted, what was said with it, and what kind of image it is.
    await expect(results.first()).toContainText('#general in Synthetic server');
    await expect(results.first()).toContainText('synthetic: look at this chart');
    await expect(results.first()).toContainText('screenshot');
    await expect(results.first()).toContainText('posted 2×');
    await expect(results.nth(1)).toContainText('Direct chat');
    await expect(page).toHaveURL(/q=a\+price\+chart|q=a%20price%20chart/);
    await shot(page, 'images');

    // Opened: the post, the picture and the file, with a link to the message where it was sent.
    const drawer = page.locator('.omni-drawer');
    await results.first().getByRole('button').click();
    const link = 'https://discord.com/channels/800000000000000001/900000000000000001/1024709476269436948';
    await expect(drawer.getByTestId('image-discord')).toHaveAttribute('href', link);
    await expect(drawer.getByTestId('image-discord')).toHaveAttribute('target', '_blank');
    await expect(drawer.getByTestId('image-discord-app')).toHaveAttribute('href', 'discord://-/channels/800000000000000001/900000000000000001/1024709476269436948');
    await expect(drawer.getByTestId('image-post')).toContainText('#general in Synthetic server');
    await expect(drawer.getByTestId('image-post')).toContainText('synthetic: look at this chart');
    await expect(drawer.getByTestId('image-post')).toContainText('picture 2 of 4 attachments');
    await expect(drawer.getByTestId('image-post')).toContainText('edited since');
    await expect(drawer.getByTestId('image-post')).toContainText(link);
    await expect(drawer.getByTestId('image-shows')).toContainText('by synthetic-vision');
    await expect(drawer.getByTestId('image-file')).toContainText('chart.png');
    await expect(drawer.getByTestId('image-file')).toContainText('1920 × 1080 px');
    await expect(drawer.getByTestId('image-file')).toContainText('471 KB');
    await expect(drawer.getByTestId('image-file')).toContainText('2 times, this one included');
    await shot(page, 'images-opened');
    await drawer.getByRole('button', { name: 'Close panel' }).click();

    await page.getByTestId('image-person').getByRole('searchbox').fill('bo');
    await page.getByTestId('image-person').getByRole('option', { name: /Synthetic Bo/ }).click();
    await expect(results).toHaveCount(1);
    expect(state.requests.some(r => r.startsWith(`GET ${V3}/media/search?`) && r.includes('person=person-b'))).toBe(true);
    await results.first().getByRole('button').click();
    await expect(drawer).toContainText('A cat asleep on a keyboard.');
    await expect(drawer).toContainText('never say who anyone is');
    // A platform without message links says so instead of offering one.
    await expect(drawer.getByTestId('image-discord')).toHaveCount(0);
    await expect(drawer.getByTestId('image-no-link')).toContainText('whatsapp has none to give');
    await expect(drawer.getByTestId('image-post')).toContainText('nothing was written with it');
    await expect(drawer.getByTestId('image-file')).toContainText('from the file itself');
    // "Only images from here" narrows the search to that conversation.
    await drawer.getByTestId('image-only-here').click();
    await expect(drawer).toHaveCount(0);
    await expect.poll(() => state.requests.some(r => r.startsWith(`GET ${V3}/media/search?`) && r.includes('conversation=conv-dm-a'))).toBe(true);
    expect(state.unknown).toEqual([]);
    expect(state.errors).toEqual([]);
});

test('a profile that may only read sees the knowledge but none of the controls', async ({ page }) => {
    const state = await mockV3(page, { permissions: ['omniscience.overview.view', 'omniscience.persons.read', 'omniscience.messages.read', 'omniscience.replica.read', 'omniscience.sources.view'] });
    await loadPage(page, `${BASE}/people/person-a?tab=knowledge`);
    await expect(card(page, 'What is known')).toContainText('Leeds', BOOT);
    await expect(page.getByTestId('deduce-now')).toHaveCount(0);
    await expect(page.getByTestId('aliases-table').getByTitle('Yes, that is them')).toHaveCount(0);
    await page.getByTestId('fact-as-city').click();
    await expect(page.getByTestId('fact-drawer')).toContainText('synthetic: Leeds');
    await expect(page.getByTestId('fact-confirm')).toHaveCount(0);

    await go(page, `${BASE}/review`);
    await expect(page.getByTestId('review-list').locator('> li')).toHaveCount(3, BOOT);
    await expect(page.getByTestId('review-resolve-rv-1')).toHaveCount(0);

    await go(page, `${BASE}/ask`);
    await expect(page.getByTestId('ask-form')).toContainText('Asking needs the', BOOT);
    await page.getByLabel('Question').fill('Does Ada live in Leeds?');
    await expect(page.getByTestId('ask-submit')).toBeDisabled();

    await go(page, `${BASE}/replicas/person-a`);
    await expect(page.getByTestId('replica-name')).toHaveText('Synthetic Ada', BOOT);
    await expect(page.getByTestId('replica-train')).toHaveCount(0);
    await page.getByTestId('replica-chats').getByRole('button', { name: 'About the trip' }).click();
    await expect(page.getByTestId('replica-chat')).toContainText('yeah!! wouldnt miss it');
    await expect(page.getByTestId('chat-input')).toHaveCount(0);

    await go(page, `${BASE}/sources`);
    await expect(page.getByTestId('discord-chips')).toContainText('listening', BOOT);
    await expect(page.getByTestId('backfill-form')).toHaveCount(0);
    await expect(page.getByTestId('upload')).toHaveCount(0);

    await go(page, `${BASE}/quality`);
    await expect(page.getByTestId('quality-gate')).toBeVisible(BOOT);
    await expect(page.getByTestId('quality-run-lab')).toHaveCount(0);
    expect(state.posts.filter(r => r.path.startsWith(V3))).toEqual([]);
    expect(state.unknown).toEqual([]);
    expect(state.errors).toEqual([]);
});
