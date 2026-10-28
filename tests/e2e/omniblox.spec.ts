import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { catalogPayload, mePayload } from './fixtures/permissions';

/**
 * OmniBlox pages against fixtures written by the real studio: Omnipotent.Tests OmniBloxFixtureExport runs
 * the pipeline with a scripted model and a fake Roblox and serializes what the routes return
 * (OMNIBLOX_FIXTURES=<this folder>/fixtures/omniblox). Game ids change on every export, so they come from
 * meta.json. Each step also saves a screenshot under test-results/omniblox/ for visual review.
 */

const apiOrigin = 'https://klive.dev';
const FIXTURES = fileURLToPath(new URL('./fixtures/omniblox/', import.meta.url));
const load = (name: string) => JSON.parse(readFileSync(`${FIXTURES}${name}.json`, 'utf8'));
const meta = load('meta') as { NowUtc: string; Live: string; Building: string; Abandoned: string; PineTree: number; PlaytestPlaceId: number };
const NOW = new Date(meta.NowUtc).getTime() + 60_000;
const SHOTS = 'test-results/omniblox';
/** The first page a cold dev server serves compiles the whole app. */
const BOOT = { timeout: 45_000 };

test.describe.configure({ timeout: 120_000 });

interface MockOptions {
    rank?: number;
    permissions?: string[];
    extraTasks?: any[];
    newGameConflict?: boolean;
    /** Edits a game's detail before it is served (e.g. a paused watchdog, a cycle still running). */
    patchGame?: (id: string, detail: any) => void;
    /** Edits the overview (its games and attention list) once, before anything is served. */
    patchOverview?: (overview: any) => void;
}

async function mockApi(page: Page, options: MockOptions = {}) {
    const rank = options.rank ?? 5;
    const state = {
        overview: load('overview'),
        mutations: [] as { path: string; body: any }[],
        /** The owner's Roblox account (RobloxConnection.View); Quick Log In advances one step per poll. */
        roblox: { Connected: false, Account: null, CreatorUserId: 42, CreatorGroupId: null, Pending: null, LastError: null, Waiting: [] } as any,
        /** The owner action the game page shows once one was started (GameActions: it finishes at once here). */
        ownerAction: null as any,
    };
    const robloxAccount = (method: string) => ({ UserId: 42, Name: 'StudioOwner', Method: method, ConnectedUtc: meta.NowUtc, VerifiedUtc: meta.NowUtc });
    state.overview.OwnerTasks.unshift(...(options.extraTasks ?? []));
    options.patchOverview?.(state.overview);

    await page.clock.setFixedTime(NOW);
    await page.routeWebSocket('wss://klive.dev/**', () => {});
    await page.route(`${apiOrigin}/**`, async route => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname;
        const p = url.searchParams;
        const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type, X-Klive-Client, X-Klive-Page, Cache-Control', 'access-control-expose-headers': '*' };
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
        const json = (body: unknown, status = 200) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
        const file = (relative: string, contentType: string) => existsSync(`${FIXTURES}${relative}`)
            ? route.fulfill({ status: 200, headers: cors, contentType, body: readFileSync(`${FIXTURES}${relative}`) })
            : json({ error: 'Not made yet.' }, 404);
        const fixture = (name: string) => existsSync(`${FIXTURES}${name}.json`) ? json(load(name)) : json({ error: 'No such game.' }, 404);

        let body: any = null;
        if (request.method() === 'POST') {
            const raw = request.postData();
            if (raw && (request.headers()['content-type'] ?? '').includes('json')) body = JSON.parse(raw); // throws on "[object Object]"
            state.mutations.push({ path, body });
        }

        switch (path) {
            case '/KMProfiles/LoginStatus': return route.fulfill({ status: 200, headers: cors, body: 'SessionActive' });
            case '/KMProfiles/me': return json(mePayload({ rank, permissions: options.permissions }));
            case '/KMProfiles/permissions/catalog': return json(catalogPayload(false));
            case '/KMProfiles/GetCurrentProfile': return json({ Name: rank === 5 ? 'Klives' : 'Guest', KlivesManagementRank: rank });

            case '/omniblox/overview': return json(state.overview);
            case '/omniblox/games': return json({ Games: state.overview.Games });
            case '/omniblox/game': {
                const name = `game-${p.get('id')}`;
                if (!existsSync(`${FIXTURES}${name}.json`)) return json({ error: 'No such game.' }, 404);
                const detail = load(name);
                options.patchGame?.(p.get('id')!, detail);
                if (state.ownerAction && detail.Game) detail.Game.OwnerAction = state.ownerAction;
                return json(detail);
            }
            case '/omniblox/game/media': return file(`media/${p.get('id')}/${p.get('file')}`, 'image/png');
            case '/omniblox/game/render': return file(`render/${p.get('id')}-${(p.get('view') ?? '').replace(':', '-')}.png`, 'image/png');
            case '/omniblox/game/live': {
                const name = `live-${p.get('id')}`;
                if (!existsSync(`${FIXTURES}${name}.json`)) return json({ Live: null });
                const live = load(name);
                const detail = { Live: live.Live };
                options.patchGame?.(p.get('id')!, detail);
                return json({ Live: detail.Live });
            }
            case '/omniblox/game/cycle': return fixture(`cycle-${p.get('id')}-${p.get('cycle')}`);
            case '/omniblox/game/cycle/image': return file(`cycle/${p.get('id')}/${p.get('cycle')}/${p.get('file')}`, 'image/png');
            case '/omniblox/game/map': return fixture(`map-${p.get('id')}`);
            case '/omniblox/game/files': return fixture(`files-${p.get('id')}`);
            case '/omniblox/game/file': {
                const contents = existsSync(`${FIXTURES}filecontents-${p.get('id')}.json`) ? load(`filecontents-${p.get('id')}`) : {};
                const text = contents[p.get('path') ?? ''];
                return text == null ? json({ error: 'No such file.' }, 404) : json({ Path: p.get('path'), Content: text });
            }
            case '/omniblox/game/telemetry': return fixture(`telemetry-${p.get('id')}-${p.get('days') ?? '7'}`);
            case '/omniblox/game/place': {
                // A playtest build for Studio; "latest" plays r2 here because (say) the files are mid-edit.
                const build = p.get('build') === 'latest' ? 'r2' : p.get('build') ?? 'r2';
                const title = load(`game-${p.get('id')}`).Summary.Title;
                return route.fulfill({
                    status: 200,
                    headers: {
                        ...cors,
                        'content-disposition': `attachment; filename="${title} ${build}.rbxlx"`,
                        'x-omniblox-build': build,
                        ...(p.get('build') === 'latest' ? { 'x-omniblox-note': encodeURIComponent('The files do not compile right now (src/server/Rebirth.server.luau:12:1: expected an expression), so this is r2, the last clean build.') } : {}),
                    },
                    contentType: 'application/xml',
                    body: '<roblox version="4"></roblox>',
                });
            }
            case '/omniblox/events': return p.get('gameId') ? fixture(`events-${p.get('gameId')}`) : fixture('events');
            case '/omniblox/assets': {
                if (p.get('q')) return p.get('q')!.includes('tree') ? fixture('assets-search-tree') : json({ Assets: [], Stats: load('assets').Stats });
                const all = load('assets');
                const status = p.get('status');
                return json(status ? { ...all, Assets: all.Assets.filter((a: any) => a.Status === status) } : all);
            }
            case '/omniblox/asset': return fixture(`asset-${p.get('id')}`);
            case '/omniblox/asset/image': return file(`asset/${p.get('id')}-${p.get('view') ?? 'thumb'}.png`, 'image/png');
            case '/omniblox/playbook': return fixture('playbook');
            case '/omniblox/tasks': return fixture('tasks');

            case '/omniblox/tasks/resolve': {
                state.overview.OwnerTasks = state.overview.OwnerTasks.filter((t: any) => t.TaskId !== body?.taskId);
                return json({ ok: true });
            }
            case '/omniblox/roblox': return json(state.roblox);
            case '/omniblox/roblox/quicklogin':
                state.roblox = { ...state.roblox, LastError: null, Pending: { Code: 'QK7Z2P', ExpiresUtc: new Date(NOW + 300_000).toISOString(), StartedUtc: meta.NowUtc, State: 'Created', AccountName: null, ConfirmUrl: 'https://www.roblox.com/crossdevicelogin/ConfirmCode' } };
                return json(state.roblox);
            case '/omniblox/roblox/quicklogin/poll': {
                const pending = state.roblox.Pending;
                if (pending?.State === 'Created') state.roblox = { ...state.roblox, Pending: { ...pending, State: 'UserLinked', AccountName: 'St*********' } };
                else if (pending) state.roblox = { ...state.roblox, Pending: null, Connected: true, Account: robloxAccount('quick-login'), Waiting: [] };
                return json(state.roblox);
            }
            case '/omniblox/roblox/quicklogin/cancel': state.roblox = { ...state.roblox, Pending: null }; return json(state.roblox);
            case '/omniblox/roblox/cookie':
                state.roblox = body?.cookie === 'good-session'
                    ? { ...state.roblox, Connected: true, Account: robloxAccount('pasted'), LastError: null }
                    : { ...state.roblox, LastError: 'Roblox does not accept this session: it was signed out, has expired, or was not copied whole.' };
                return json(state.roblox);
            case '/omniblox/roblox/verify': return json(state.roblox);
            case '/omniblox/roblox/apikey':
                state.roblox = { ...state.roblox, LastError: null, ApiKey: { Set: true, Info: { Name: 'OmniBlox studio', OwnerUserId: 42, Scopes: ['universe-places: write'], ExpiresUtc: null, CheckedUtc: meta.NowUtc }, MatchesAccount: true } };
                return json(state.roblox);
            case '/omniblox/games/action': {
                const started = `${body?.action} on ${body?.gameId}`;
                state.ownerAction = { Kind: body?.action, Title: started, StartedUtc: meta.NowUtc, FinishedUtc: meta.NowUtc, Running: false, Ok: true, Steps: ['Products: 2 updated on Roblox.', 'Published the current build: version 12'], Message: 'Everything is on Roblox again.' };
                return json({ ok: true, started });
            }
            case '/omniblox/tasks/delegate': return json({ ok: true, message: 'Uploading it with your Roblox account now.' });
            case '/omniblox/roblox/disconnect': state.roblox = { ...state.roblox, Connected: false, Account: null }; return json(state.roblox);
            case '/omniblox/studio/toggle': {
                if (typeof body?.enabled === 'boolean') state.overview.Enabled = body.enabled;
                if (typeof body?.harvester === 'boolean') state.overview.HarvesterEnabled = body.harvester;
                return json({ ok: true, enabled: state.overview.Enabled, harvester: state.overview.HarvesterEnabled });
            }
            case '/omniblox/games/new':
                return options.newGameConflict
                    ? json({ error: 'Already 1 game(s) in production (OmniBlox_MaxGamesInProduction = 1). Pause or finish one first.' }, 409)
                    : json({ ok: true, gameId: meta.Building });
            case '/omniblox/games/approve': {
                const kind = body?.gate === 'build' ? 'BuildSignoff' : 'LaunchApproval';
                state.overview.OwnerTasks = state.overview.OwnerTasks.filter((t: any) => !(t.Kind === kind && t.GameId === body?.gameId));
                return json({ ok: true, gate: body?.gate });
            }
            case '/omniblox/games/reject': return json({ ok: true, gate: body?.gate });
            case '/omniblox/games/playtest': {
                const place = meta.PlaytestPlaceId;
                return json({
                    ok: true, build: body?.build === 'latest' ? 'r2' : body?.build, version: 5, reused: false,
                    joinUrl: `https://www.roblox.com/games/start?placeId=${place}`, gameUrl: `https://www.roblox.com/games/${place}`,
                    universeId: 3003, placeId: place, ownExperience: false, serversRestarted: true, warnings: [],
                });
            }
            case '/omniblox/games/playtest/follow': return json({ ok: true, follow: body?.follow });
            case '/omniblox/games/steer': return json({ ok: true, directiveId: 'd3', resumed: false });
            case '/omniblox/games/build':
                return json({ ok: true, revision: 2, mapScore: 54, report: 'BUILD OK — revision 2 (no file changed since it was built): 308 instances, 28 scripts.\nMap: score 54/100 — The play area is only 280×280 studs.' });
            case '/omniblox/games/test': return json({ ok: true, started: true });
            case '/omniblox/games/pause':
            case '/omniblox/games/resume':
            case '/omniblox/games/revive':
            case '/omniblox/games/directive':
            case '/omniblox/games/maintain':
            case '/omniblox/games/abandon':
                return json({ ok: true });
            default:
                return json({});
        }
    });
    return state;
}

/** Elements that push the page wider than the viewport (the outermost ones only); empty when nothing does. */
async function pageOverflow(page: Page) {
    return page.evaluate(() => {
        const width = window.innerWidth;
        if (document.documentElement.scrollWidth <= width + 1) return [];
        const sticksOut = (el: Element) => el.getBoundingClientRect().right > width + 1;
        // Content inside its own scroller (the section nav, wide tables) does not widen the page.
        const scrolled = (el: Element) => {
            for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
                if (getComputedStyle(p).overflowX !== 'visible') return true;
            }
            return false;
        };
        return [...document.querySelectorAll('body *')]
            .filter(el => sticksOut(el) && !scrolled(el) && !(el.parentElement && sticksOut(el.parentElement)))
            .slice(0, 8)
            .map(el => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} (right ${Math.round(el.getBoundingClientRect().right)})`);
    });
}

test.beforeEach(async ({ context }) => {
    const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '4173'}`).origin;
    await context.addCookies([{ name: 'km_session', value: 'kms_e2e', url: origin }]);
});

test('studio: games, owner tasks, numbers and switches', async ({ page }) => {
    const state = await mockApi(page);
    await page.setViewportSize({ width: 1500, height: 1100 });
    await page.goto('/schemery/omniblox');

    await expect(page.getByRole('heading', { name: 'Game studio' })).toBeVisible(BOOT);
    await expect(page.getByText('Needs you')).toBeVisible();
    const tasks = page.locator('.bx-tasks');
    await expect(tasks.getByText('Upload the icon for "Lava Forest Obby"')).toBeVisible();
    await expect(tasks.getByText('Answer the maturity questionnaire for "Lava Forest Obby"')).toBeVisible();
    const cards = page.locator('.bx-game');
    await expect(cards).toHaveCount(3);
    await expect(cards.filter({ hasText: 'Candy Factory Tycoon' })).toContainText('Build');
    await expect(cards.filter({ hasText: 'Lava Forest Obby' })).toContainText('Live');
    await expect(cards.filter({ hasText: 'Space Station Simulator' })).toContainText('Abandoned');
    await expect(page.locator('.ot-kpi').filter({ hasText: 'Revenue, 30 days' })).toContainText('spent $0');
    await expect(page.getByText('Every experience slot is taken')).toBeVisible();
    await expect(page.locator('.bx-events li').first()).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}/studio.png`, fullPage: true });

    // Resolving an owner task posts a JSON body and the task leaves the list.
    const questionnaire = page.locator('.bx-tasks li').filter({ hasText: 'maturity questionnaire' });
    await questionnaire.getByRole('button', { name: 'Done' }).click();
    await expect(tasks.getByText('Answer the maturity questionnaire for "Lava Forest Obby"')).toHaveCount(0);
    const resolve = state.mutations.find(m => m.path === '/omniblox/tasks/resolve');
    expect(resolve?.body).toMatchObject({ action: 'done' });
    expect(typeof resolve?.body.taskId).toBe('string');

    // The harvester switch.
    await page.getByRole('button', { name: 'Harvester on' }).click();
    await expect(page.getByRole('button', { name: 'Harvester off' })).toBeVisible();
    expect(state.mutations.find(m => m.path === '/omniblox/studio/toggle')?.body).toEqual({ harvester: false });
});

test('studio: starting a game while one is in production says why it cannot', async ({ page }) => {
    const state = await mockApi(page, { newGameConflict: true });
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto('/schemery/omniblox');
    await expect(page.getByRole('heading', { name: 'Game studio' })).toBeVisible(BOOT);

    await page.getByRole('button', { name: 'New game' }).click();
    await page.getByLabel('Theme to explore').fill('pirates');
    await page.getByRole('button', { name: 'Start researching' }).click();
    await expect(page.getByRole('alert')).toContainText('Already 1 game(s) in production');
    expect(state.mutations.find(m => m.path === '/omniblox/games/new')?.body).toEqual({ theme: 'pirates' });
});

test('studio: the owner gates are approved from their tasks, each for its own gate', async ({ page }) => {
    const signoff = {
        TaskId: 't_signoff1', Kind: 'BuildSignoff', GameId: meta.Building, Title: 'Play and sign off "Candy Factory Tycoon" (r2)',
        Detail: '"Candy Factory Tycoon" passed its tests on revision r2: map 87/100.\nPlay it before it is marketed.',
        Status: 'Open', CreatedUtc: meta.NowUtc, ResolvedUtc: null, Files: [], DedupeKey: `signoff:${meta.Building}`,
    };
    const approval = {
        TaskId: 't_approve1', Kind: 'LaunchApproval', GameId: meta.Live, Title: 'Approve the launch of "Lava Forest Obby"',
        Detail: 'Ready to go public as "Lava Forest Obby" in experience 1001 (revision r1, run clean in Roblox\'s engine).',
        Status: 'Open', CreatedUtc: meta.NowUtc, ResolvedUtc: null, Files: [], DedupeKey: `approve:${meta.Live}`,
    };
    const state = await mockApi(page, { extraTasks: [signoff, approval] });
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto('/schemery/omniblox');
    await expect(page.getByRole('heading', { name: 'Game studio' })).toBeVisible(BOOT);

    // Neither gate is a plain "done".
    const signoffRow = page.locator('.bx-tasks li').filter({ hasText: 'Play and sign off' });
    await expect(signoffRow.getByText('Build sign-off')).toBeVisible();
    await expect(signoffRow.getByRole('button', { name: 'Done' })).toHaveCount(0);
    await expect(signoffRow.getByRole('link', { name: '▶ Play it' })).toHaveAttribute('href', `/schemery/omniblox/game/${meta.Building}?play=1`);
    await signoffRow.getByRole('button', { name: 'Approve build' }).click();
    await expect(page.locator('.bx-tasks').getByText('Play and sign off "Candy Factory Tycoon" (r2)')).toHaveCount(0);
    expect(state.mutations.find(m => m.path === '/omniblox/games/approve')?.body).toEqual({ gameId: meta.Building, gate: 'build' });

    const row = page.locator('.bx-tasks li').filter({ hasText: 'Approve the launch' });
    await expect(row.getByRole('button', { name: 'Done' })).toHaveCount(0);
    await row.getByRole('button', { name: 'Approve launch' }).click();
    await expect(page.locator('.bx-tasks').getByText('Approve the launch of "Lava Forest Obby"')).toHaveCount(0);
    expect(state.mutations.filter(m => m.path === '/omniblox/games/approve').at(-1)?.body).toEqual({ gameId: meta.Live, gate: 'launch' });
});

test('a tested build waits for the owner: play it, sign it off or ask for changes; then the launch', async ({ page }) => {
    let gate: 'build' | 'launch' = 'build';
    const state = await mockApi(page, {
        patchGame: (id, detail) => {
            if (id !== meta.Building || !detail.Game) return;
            const g = detail.Game;
            g.Stage = 'Launch';
            g.WaitingReason = gate === 'build' ? `waiting for you to play r${g.Build.Revision} and sign it off` : 'waiting for your launch approval';
            g.Store.Title = 'Candy Factory Tycoon';
            g.Store.Description = 'Build the sweetest factory on the server!';
            detail.Approvals = {
                ...detail.Approvals, Waiting: gate, Revision: g.Build.Revision,
                SignoffRevision: gate === 'launch' ? g.Build.Revision : null, SignoffUtc: gate === 'launch' ? meta.NowUtc : null,
                History: gate === 'launch' ? [{ Gate: 'build', Decision: 'approved', Note: 'Fun from the first button.', Revision: g.Build.Revision, Utc: meta.NowUtc }] : [],
            };
            detail.OwnerTasks.push({
                TaskId: 't_gate', Kind: gate === 'build' ? 'BuildSignoff' : 'LaunchApproval', GameId: id, Title: gate === 'build' ? 'Play and sign off "Candy Factory Tycoon" (r2)' : 'Approve the launch of "Candy Factory Tycoon"',
                Detail: '…', Status: 'Open', CreatedUtc: meta.NowUtc, ResolvedUtc: null, Files: [], DedupeKey: `${gate}:${id}`,
            });
        },
    });
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto(`/schemery/omniblox/game/${meta.Building}`);
    await expect(page.getByRole('heading', { name: 'Candy Factory Tycoon' })).toBeVisible(BOOT);

    // Gate 1: the build. The gate card replaces the task in "Needs you".
    const card = page.locator('.bx-gate');
    await expect(card).toContainText('Play and sign off r2');
    await expect(card).toContainText('Gate 1 of 2');
    await expect(page.locator('.ot-card').filter({ hasText: 'Needs you' }).getByText('Play and sign off "Candy Factory Tycoon"')).toHaveCount(0);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/gate-build.png`, fullPage: true });
    await card.getByRole('button', { name: 'Request changes' }).click();
    await card.getByLabel('What to change').fill('The first dropper costs more than players start with.');
    await card.getByRole('button', { name: 'Send to the builder' }).click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omniblox/games/reject')?.body)
        .toEqual({ gameId: meta.Building, gate: 'build', note: 'The first dropper costs more than players start with.', backToBuild: true });
    // Approved: the game reloads at the next gate (the server moves it on; here the mock does).
    gate = 'launch';
    await card.getByRole('button', { name: 'Approve build' }).click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omniblox/games/approve')?.body).toEqual({ gameId: meta.Building, gate: 'build' });

    // Gate 2: the launch, with the store page and the prices it covers.
    await expect(card).toContainText('Approve the launch');
    await expect(card).toContainText('Build the sweetest factory on the server!');
    await expect(card).toContainText('2x Candy · R$ 99');
    await card.getByText(/Your earlier decisions/).click();
    await expect(card).toContainText('Fun from the first button.');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/gate-launch.png`, fullPage: true });
    await card.getByRole('button', { name: 'Request changes' }).click();
    await card.getByLabel('What to change').fill('Make the 2x pass 79 R$.');
    await card.getByRole('button', { name: 'Send to the marketer' }).click();
    await expect.poll(() => state.mutations.filter(m => m.path === '/omniblox/games/reject').at(-1)?.body)
        .toEqual({ gameId: meta.Building, gate: 'launch', note: 'Make the 2x pass 79 R$.', backToBuild: false });
    await card.getByRole('button', { name: 'Approve launch' }).click();
    await expect.poll(() => state.mutations.filter(m => m.path === '/omniblox/games/approve').at(-1)?.body).toEqual({ gameId: meta.Building, gate: 'launch' });
});

test('live game: overview, world, store, numbers, brain, files and activity', async ({ page }) => {
    const state = await mockApi(page);
    await page.setViewportSize({ width: 1500, height: 1100 });
    await page.goto(`/schemery/omniblox/game/${meta.Live}`);

    await expect(page.getByRole('heading', { name: 'Lava Forest Obby' })).toBeVisible(BOOT);
    await expect(page.getByText('Leap over glowing lava through a pine forest.')).toBeVisible();
    await expect(page.getByText('Three stages with checkpoints')).toBeVisible();
    await expect(page.locator('.bx-table tr.chosen')).toContainText('A lava obby through a pine forest');
    // It went through both owner gates.
    const approvals = page.locator('.ot-card').filter({ hasText: 'Your approvals' });
    await expect(approvals.locator('.bx-approvals > li')).toHaveCount(2);
    await expect(approvals).toContainText('Build sign-off · r1');
    await expect(approvals).toContainText('Store page and prices look right.');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/game-overview.png`, fullPage: true });

    await page.getByRole('tab', { name: 'World' }).click();
    await expect(page.locator('.bx-img img').first()).toBeVisible();
    await page.getByRole('button', { name: 'Spawn' }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/game-world.png`, fullPage: true });

    await page.getByRole('tab', { name: 'Store' }).click();
    await expect(page.locator('.bx-table').getByText('Skip Stage', { exact: true })).toBeVisible();
    await expect(page.getByText('Compliance passed')).toBeVisible();
    await expect(page.locator('figure img').first()).toBeVisible();
    // The fixture studio has no Roblox session, so the icon and questionnaire are still owed.
    const publishing = page.locator('.ot-card').filter({ hasText: 'Publishing' });
    await expect(publishing).toContainText('not uploaded yet');
    await expect(publishing).toContainText('questionnaire not answered yet');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/game-store.png`, fullPage: true });

    await page.getByRole('tab', { name: 'Numbers' }).click();
    await expect(page.locator('.ot-kpi').filter({ hasText: 'Players per day' })).toBeVisible();
    await expect(page.getByText('How far players get')).toBeVisible();
    await expect(page.getByText('Day 7', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '30 days' }).click();
    await expect(page.getByText('Gameplay telemetry, last 30 days')).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/game-numbers.png`, fullPage: true });

    await page.getByRole('tab', { name: /Brain/ }).click();
    await expect(page.getByText('Hand-overs')).toBeVisible();
    await expect(page.locator('.cycles > li').first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/game-brain.png`, fullPage: true });

    await page.getByRole('tab', { name: 'Files' }).click();
    await page.getByRole('option', { name: /Welcome\.server\.luau/ }).click();
    await expect(page.locator('pre.code')).toContainText('Players.PlayerAdded');
    await page.screenshot({ path: `${SHOTS}/game-files.png`, fullPage: true });

    await page.getByRole('tab', { name: 'Activity' }).click();
    await expect(page.locator('.bx-events li').first()).toBeVisible();

    await page.getByRole('button', { name: 'Maintain now' }).click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omniblox/games/maintain')?.body).toEqual({ gameId: meta.Live });
});

test('game in production: exit criteria, steering and pausing', async ({ page }) => {
    const state = await mockApi(page);
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto(`/schemery/omniblox/game/${meta.Building}`);

    await expect(page.getByRole('heading', { name: 'Candy Factory Tycoon' })).toBeVisible(BOOT);
    await expect(page.locator('.checklist li.met').filter({ hasText: 'The game has been built at least once' })).toBeVisible();
    await expect(page.locator('.checklist li:not(.met)').filter({ hasText: 'Every milestone is done' })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/game-building.png`, fullPage: true });

    await page.getByRole('button', { name: 'Steer' }).click();
    await page.getByLabel('New direction').fill('Add a candy machine finale');
    await page.getByRole('button', { name: 'Send direction' }).click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omniblox/games/steer')?.body)
        .toEqual({ gameId: meta.Building, note: 'Add a candy machine finale' });

    await page.getByRole('button', { name: 'Pause' }).click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omniblox/games/pause')?.body).toEqual({ gameId: meta.Building, paused: true });

    await page.getByRole('tab', { name: 'World' }).click();
    await expect(page.locator('.bx-img img').first()).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/game-building-world.png`, fullPage: true });
});

test('a game at work: every step live, the owner\'s directions, the engine run and the map', async ({ page }) => {
    // The builder is mid-cycle: the live view follows it closely.
    const state = await mockApi(page, {
        patchGame: (id, detail) => {
            if (id !== meta.Building || !detail.Live) return;
            detail.Live.Running = true;
            detail.Live.Status = 'running run_tests';
        },
    });
    await page.setViewportSize({ width: 1500, height: 1100 });
    await page.goto(`/schemery/omniblox/game/${meta.Building}`);
    await expect(page.getByRole('heading', { name: 'Candy Factory Tycoon' })).toBeVisible(BOOT);

    const live = page.locator('.bx-live');
    await expect(live).toContainText('Working now');
    await expect(live).toContainText('running run_tests');
    await expect(live.locator('.bx-entries > li').filter({ hasText: 'BUILD OK' })).toBeVisible();
    await expect(live.locator('.bx-entries > li').filter({ hasText: 'scatter_assets' }).first()).toBeVisible();
    await expect(live.locator('.pic img').first()).toBeVisible(); // the map the builder looked at
    await live.locator('.pic').first().click();
    await expect(live.locator('.pic.big')).toHaveCount(1);

    // The owner's directions: the open one leads, the finished one says what was done.
    const directions = page.locator('.ot-card').filter({ hasText: 'Your directions' });
    await expect(directions).toContainText('Add a candy machine finale that unlocks after the first rebirth.');
    await expect(directions).toContainText('Open · delivered');
    await expect(directions).toContainText('Doubled the plot to 100×100');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/game-at-work.png`, fullPage: true });
    await directions.locator('li').filter({ hasText: 'candy machine finale' }).getByRole('button', { name: 'Drop' }).click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omniblox/games/directive')?.body)
        .toEqual({ gameId: meta.Building, directiveId: 'd2', action: 'drop' });

    // Key facts read as facts, not as raw objects.
    await expect(page.locator('.facts').first()).not.toContainText('[object Object]');

    // Tests: the engine run's failing check and boot error, located in the game's files.
    await page.getByRole('tab', { name: /Tests/ }).click();
    const cases = page.locator('.cases');
    await expect(cases.getByText('Factory · the first dropper is affordable')).toBeVisible();
    await expect(cases.locator('.detail').filter({ hasText: 'starting candy 50 < first dropper 60' })).toBeVisible();
    await expect(page.locator('.cases code').filter({ hasText: 'src/server/Welcome.server.luau:4' })).toBeVisible();
    await expect(page.locator('.checks li').filter({ hasText: 'Roblox\'s engine' })).toHaveClass(/bad/);
    await page.getByRole('button', { name: 'Build now' }).click();
    await expect(page.locator('pre.report')).toContainText('BUILD OK');
    expect(state.mutations.find(m => m.path === '/omniblox/games/build')?.body).toEqual({ gameId: meta.Building });
    await page.getByRole('button', { name: 'Run in Roblox' }).click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omniblox/games/test')?.body).toEqual({ gameId: meta.Building });
    await expect(page.locator('.swal2-popup')).toContainText('Running in Roblox');
    await page.locator('.swal2-confirm').click();
    await expect(page.locator('.swal2-popup')).toHaveCount(0);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/game-tests.png`, fullPage: true });

    // World: the map with its plan, the map report, and a zone's own view.
    await page.getByRole('tab', { name: 'World' }).click();
    const report = page.locator('.ot-card').filter({ hasText: 'Map report' });
    await expect(report.locator('.score .value')).toHaveText(/\d+/);
    await expect(report).toContainText('75 is the bar');
    await expect(report.locator('.cats li')).toHaveCount(7);
    await expect(report.locator('.cats li').filter({ hasText: 'Gameplay layout' })).toContainText('/20');
    await expect(page.locator('.zones')).toContainText('Plot 2');
    await page.locator('.zone').filter({ hasText: 'Plot 2' }).click();
    await expect.poll(() => page.locator('.bx-world .bx-img img').first().getAttribute('src')).toBeTruthy();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/game-world-map.png`, fullPage: true });
});

test('without an API key the local engine stands in, and the Tests tab says so', async ({ page }) => {
    // The same failing run, as the studio records it when there is no key or slot: in the local engine.
    const state = await mockApi(page, {
        patchGame: (id, detail) => {
            if (id !== meta.Building || !detail.Game) return;
            detail.EngineAvailable = false;
            detail.LocalEngine = true;
            const run = detail.Game.Build.LastEngineRun;
            Object.assign(run, { Local: true, Version: null, Summary: `Local engine: ${run.Summary}` });
            detail.Summary.Engine = { ...detail.Summary.Engine, Local: true, Summary: run.Summary };
        },
    });
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto(`/schemery/omniblox/game/${meta.Building}?tab=tests`);
    await expect(page.getByRole('heading', { name: 'Candy Factory Tycoon' })).toBeVisible(BOOT);

    const card = page.locator('.ot-card').filter({ hasText: 'Last run in the local engine' });
    await expect(card.locator('.testline .ot-chip').filter({ hasText: 'Local engine' })).toBeVisible();
    await expect(card.locator('.testline')).not.toContainText('Local engine:'); // the chip says it once
    await expect(card).toContainText('Roblox\'s engine runs the game again before launch');
    await expect(card.locator('.cases code').filter({ hasText: 'src/server/Welcome.server.luau:4' })).toBeVisible();
    await expect(card).not.toContainText('place version');
    await expect(page.locator('.checks li').filter({ hasText: 'Local engine' })).toHaveClass(/bad/);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/game-tests-local.png`, fullPage: true });

    await expect(page.getByRole('button', { name: 'Run in Roblox' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Run locally' }).click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omniblox/games/test')?.body).toEqual({ gameId: meta.Building });
    await expect(page.locator('.swal2-popup')).toContainText('Running in the local engine');
});

test('a simulator\'s world shows the economy bot\'s timeline and any wall', async ({ page }) => {
    await mockApi(page, {
        patchGame: (id, detail) => {
            if (id !== meta.Building || !detail.Game) return;
            detail.Game.Build.Economy = 'A player who plays well: first harvest 14 s, first sale 62 s (19 coins a minute at the start), first purchase 1.0 min, every zone 24 min, first rebirth 53 min.\n     1.0 min  tool: Stone Axe (20)\n     5.6 min  unlock Pine Forest (55)';
            detail.Game.Build.EconomyFindings = ['[error] economy: 1 zone(s) are out of reach within six hours of play: an economy wall.'];
        },
    });
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto(`/schemery/omniblox/game/${meta.Building}?tab=world`);
    await expect(page.getByRole('heading', { name: 'Candy Factory Tycoon' })).toBeVisible(BOOT);
    const economy = page.locator('.ot-card').filter({ hasText: 'Economy check' });
    await expect(economy.locator('pre.timeline')).toContainText('unlock Pine Forest (55)');
    await expect(economy.locator('.findings li.error')).toContainText('out of reach within six hours');
});

test('a live game shows the icon and the rating the studio published, with its answers', async ({ page }) => {
    await mockApi(page, {
        patchGame: (id, detail) => {
            if (id !== meta.Live || !detail.Game) return;
            detail.Game.Publish.IconUploadedUtc = meta.NowUtc;
            detail.Game.Publish.Questionnaire = {
                Utc: meta.NowUtc, QuestionnaireIds: ['main-1', 'add-1'], Published: true, StoppedReason: null, AgeRating: 'Minimal', MinimumAge: 0,
                Answers: ['Does your experience contain violence? → No (because Violence: none)', 'How can players communicate? → Only Roblox\'s chat (because only Roblox\'s standard text chat)'],
            };
        },
    });
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto(`/schemery/omniblox/game/${meta.Live}?tab=store`);
    const publishing = page.locator('.ot-card').filter({ hasText: 'Publishing' });
    await expect(publishing).toContainText('Maturity rating', BOOT);
    await expect(publishing).toContainText('Minimal · answered');
    await expect(publishing).toContainText('uploaded');
    await publishing.getByText('2 answers').click();
    await expect(publishing).toContainText('Does your experience contain violence? → No (because Violence: none)');
    await page.screenshot({ path: `${SHOTS}/game-store-rated.png`, fullPage: true });
});

test('a public game nobody can play says so on its card, in the studio\'s attention list and on its page', async ({ page }) => {
    // What Roblox answered for the first launched game (Oct 2026): public, but unrated, so closed to every player.
    const closed = {
        Playable: false, Status: 'ContextualPlayabilityUnrated', Maturity: 'unrated', MaturityLabel: 'Unknown', CheckedUtc: meta.NowUtc, SinceUtc: '2026-10-02T09:00:00Z', Error: null,
        Why: 'it has no maturity rating, and Roblox lets nobody but the creator play an unrated experience (answer its Maturity & Compliance questionnaire)',
    };
    await mockApi(page, {
        patchOverview: o => {
            const live = o.Games.find((g: any) => g.GameId === meta.Live);
            live.Reach = closed;
            o.Attention.unshift({ Level: 'error', Title: `Nobody can play "${live.Title}"`, Detail: `Roblox reports ${closed.Status}: ${closed.Why}.`, Action: null });
        },
        patchGame: (id, detail) => { if (id === meta.Live && detail.Summary) detail.Summary.Reach = closed; },
    });
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto('/schemery/omniblox');
    const card = page.locator('.bx-game').filter({ has: page.locator(`a[href="/schemery/omniblox/game/${meta.Live}"]`) });
    await expect(card.locator('.ot-chip', { hasText: 'Nobody can play' })).toBeVisible(BOOT);
    await expect(card).toContainText('Public, but nobody can play it: it has no maturity rating');
    await expect(page.getByText(/^Nobody can play "/).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/studio-unplayable.png`, fullPage: true });

    await page.goto(`/schemery/omniblox/game/${meta.Live}`);
    const banner = page.locator('.ot-banner.bad').filter({ hasText: 'Nobody can play this game' });
    await expect(banner).toBeVisible(BOOT);
    await expect(banner).toContainText('ContextualPlayabilityUnrated');
    await expect(banner).toContainText('Maturity & Compliance questionnaire');
    await page.screenshot({ path: `${SHOTS}/game-unplayable.png`, fullPage: true });
});

test('the owner connects their Roblox account with Quick Log In, or by pasting a cookie', async ({ page }) => {
    const state = await mockApi(page, {
        patchOverview: o => o.Attention.unshift({ Level: 'warning', Title: 'OmniBlox cannot create experiences', Detail: 'It creates the experiences its games publish to with your Roblox account, and none is connected.', Action: 'roblox' }),
    });
    state.roblox.Waiting = ['Answer the maturity questionnaire: nobody can play "Lava Forest Obby" until you do', 'Upload the icon for "Lava Forest Obby"'];
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto('/schemery/omniblox');
    const card = page.locator('.ot-card').filter({ has: page.getByRole('heading', { name: 'Roblox account' }) });
    await expect(card.getByRole('button', { name: 'Connect with Quick Log In' })).toBeVisible(BOOT);
    await expect(card).toContainText('Without the questionnaire Roblox lets nobody play a public game');
    await expect(card).toContainText('nobody can play "Lava Forest Obby"');

    // The overview's attention item starts it: a code to type into Roblox's Quick Log In.
    await page.getByRole('button', { name: 'Connect Roblox' }).click();
    await expect(card.getByLabel('Quick Log In code')).toHaveText('QK7Z2P');
    await expect(card.getByRole('link', { name: 'Quick Log In ↗' })).toHaveAttribute('href', 'https://www.roblox.com/crossdevicelogin/ConfirmCode');
    await expect(card).toContainText('same network as the server');
    await page.screenshot({ path: `${SHOTS}/roblox-code.png`, fullPage: true });

    // Entered on the signed-in device, then confirmed: the card follows along by itself.
    await expect(card).toContainText('St********* entered the code: press Confirm Login', { timeout: 10_000 });
    await expect(card.locator('.ot-chip', { hasText: 'Connected' })).toBeVisible({ timeout: 10_000 });
    await expect(card).toContainText('StudioOwner');
    await expect(card).toContainText('signed in with Quick Log In');
    await page.screenshot({ path: `${SHOTS}/roblox-connected.png`, fullPage: true });

    // Disconnecting asks first.
    await card.getByRole('button', { name: 'Disconnect' }).click();
    await page.locator('.swal2-confirm').click();
    await expect(card.getByRole('button', { name: 'Connect with Quick Log In' })).toBeVisible();

    // The fallback: a pasted cookie, checked by the server, never left in the page.
    await card.getByText('Or paste a session cookie').click();
    const input = card.getByLabel('Roblox session cookie');
    await input.fill('stale-session');
    await card.getByRole('button', { name: 'Check and save' }).click();
    await expect(card.getByRole('alert')).toContainText('Roblox does not accept this session');
    await expect(input).toHaveValue('');
    await input.fill('good-session');
    await card.getByRole('button', { name: 'Check and save' }).click();
    await expect(card).toContainText('pasted cookie');
    expect(state.mutations.filter(m => m.path === '/omniblox/roblox/cookie').map(m => m.body)).toEqual([{ cookie: 'stale-session' }, { cookie: 'good-session' }]);
});

test('the owner manages a live game on Roblox: update, take down and archive, move to their own experience', async ({ page }) => {
    const state = await mockApi(page);
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto(`/schemery/omniblox/game/${meta.Live}`);
    const card = page.locator('.ot-card').filter({ has: page.getByRole('heading', { name: 'Manage on Roblox' }) });
    await expect(card).toContainText('Experience 1001', BOOT);

    await card.getByRole('button', { name: 'Update on Roblox' }).click();
    await expect(card.locator('.ot-chip', { hasText: 'Done' })).toBeVisible();
    await expect(card).toContainText('Everything is on Roblox again.');
    await expect(card).toContainText('Published the current build: version 12');
    await page.screenshot({ path: `${SHOTS}/game-manage.png`, fullPage: true });

    await card.getByRole('button', { name: 'Take down…' }).click();
    await card.getByLabel(/Also archive the experience/).check();
    await card.getByRole('button', { name: 'Take it down and archive it' }).click();
    await page.locator('.swal2-confirm').click();

    await card.getByRole('button', { name: 'Move…' }).click();
    await card.getByLabel('An experience of mine:').check();
    await card.getByLabel('Experience as universeId:placeId').fill('5005:6006');
    await card.getByRole('button', { name: 'Move it' }).click();
    await page.locator('.swal2-confirm').click();

    await expect.poll(() => state.mutations.filter(m => m.path === '/omniblox/games/action').map(m => m.body)).toEqual([
        { gameId: meta.Live, action: 'sync' },
        { gameId: meta.Live, action: 'takedown', archive: true },
        { gameId: meta.Live, action: 'move', target: '5005:6006' },
    ]);
});

test('"Do it yourself" hands an owner task back to the studio', async ({ page }) => {
    const state = await mockApi(page, {
        extraTasks: [{ TaskId: 't_icon', Kind: 'UploadIcon', GameId: meta.Live, Title: 'Upload the icon for "Lava Forest Obby"', Detail: 'Roblox has no API key for an experience\'s icon.', Status: 'Open', CreatedUtc: meta.NowUtc, ResolvedUtc: null, Files: ['icon.png'], DedupeKey: `icon:${meta.Live}` }],
    });
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto('/schemery/omniblox');
    const task = page.locator('.bx-tasks li').filter({ hasText: 'Upload the icon for "Lava Forest Obby"' }).first();
    await task.getByRole('button', { name: 'Do it yourself' }).click(BOOT);
    await expect(page.locator('.swal2-popup')).toContainText('Uploading it with your Roblox account now.');
    expect(state.mutations.find(m => m.path === '/omniblox/tasks/delegate')?.body).toEqual({ taskId: 't_icon' });
    // The decisions stay the owner's: no "Do it yourself" on an approval.
    await page.locator('.swal2-confirm').click();
    await expect(page.locator('.bx-tasks li').filter({ hasText: 'Approve' }).getByRole('button', { name: 'Do it yourself' })).toHaveCount(0);
});

test('the Roblox account card sets the API key, switches accounts and moves games off the old one', async ({ page }) => {
    const state = await mockApi(page);
    state.roblox = {
        ...state.roblox, Connected: true,
        Account: { UserId: 77, Name: 'NewStudio', Method: 'quick-login', ConnectedUtc: meta.NowUtc, VerifiedUtc: meta.NowUtc },
        ApiKey: { Set: true, Info: { Name: 'Old key', OwnerUserId: 42, Scopes: [], ExpiresUtc: null, CheckedUtc: meta.NowUtc }, MatchesAccount: false },
        OldAccountGames: [{ GameId: meta.Live, Title: 'Lava Forest Obby', Stage: 'Live', UniverseId: 1001 }],
    };
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto('/schemery/omniblox');
    const card = page.locator('.ot-card').filter({ has: page.getByRole('heading', { name: 'Roblox account' }) });
    await expect(card).toContainText('NewStudio', BOOT);
    await expect(card.locator('.ot-chip', { hasText: "another account's" })).toBeVisible();
    await expect(card).toContainText('Still on the old account');
    await page.screenshot({ path: `${SHOTS}/roblox-switch.png`, fullPage: true });

    await card.getByRole('button', { name: 'Change' }).click();
    await card.getByLabel('Roblox Open Cloud API key').fill('new-key-value');
    await card.getByRole('button', { name: 'Check and save' }).click();
    await expect(card).toContainText('"OmniBlox studio" · user 42');
    await expect(card.getByLabel('Roblox Open Cloud API key')).toHaveCount(0);

    await card.getByRole('button', { name: 'Move to this account' }).click();
    await page.locator('.swal2-confirm').click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omniblox/games/action')?.body).toEqual({ gameId: meta.Live, action: 'move', target: 'new' });
    await page.locator('.swal2-confirm').click(); // the "Moving" notice

    await card.getByRole('button', { name: 'Switch to another account' }).click();
    await page.locator('.swal2-confirm').click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omniblox/roblox/quicklogin')?.body).toEqual({ switchAccount: true });
    expect(state.mutations.find(m => m.path === '/omniblox/roblox/apikey')?.body).toEqual({ apiKey: 'new-key-value' });
});

test('a game the watchdog paused waits for the owner, and resumes', async ({ page }) => {
    const state = await mockApi(page, {
        patchGame: (id, detail) => {
            if (id !== meta.Building || !detail.Game) return;
            detail.Game.Paused = true;
            detail.Game.Progress.Level = 3;
            detail.Watchdog = { ...detail.Watchdog, Level: 3, Name: 'waiting for the owner', StalledCycles: 8, History: ['10-20 09:12 level 1 after a test run: engine game: Factory · the first dropper is affordable', '10-20 11:40 level 3 after a builder cycle'] };
        },
    });
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto(`/schemery/omniblox/game/${meta.Building}`);
    await expect(page.getByRole('heading', { name: 'Candy Factory Tycoon' })).toBeVisible(BOOT);
    const banner = page.locator('.ot-banner').filter({ hasText: 'Watchdog' });
    await expect(banner).toContainText('waiting for the owner');
    await expect(banner).toContainText('Nothing is lost while it waits');
    await page.screenshot({ path: `${SHOTS}/game-watchdog.png`, fullPage: true });
    await banner.getByRole('button', { name: 'Resume' }).click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omniblox/games/resume')?.body).toEqual({ gameId: meta.Building });
});

test('an abandoned game can be revived where it stopped', async ({ page }) => {
    const state = await mockApi(page);
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto(`/schemery/omniblox/game/${meta.Abandoned}`);
    await expect(page.getByRole('heading', { name: 'Space Station Simulator' })).toBeVisible(BOOT);
    await page.locator('.ot-pagehead').getByRole('button', { name: 'Revive' }).click();
    await expect(page.locator('.swal2-popup')).toContainText('It goes back to Research');
    await page.locator('.swal2-confirm').click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omniblox/games/revive')?.body).toEqual({ gameId: meta.Abandoned });
});

test('the brain keeps every step of recent cycles', async ({ page }) => {
    await mockApi(page);
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto(`/schemery/omniblox/game/${meta.Building}?tab=brain`);
    await expect(page.getByRole('heading', { name: 'Candy Factory Tycoon' })).toBeVisible(BOOT);
    // (Keyed on the button's class: its label changes once the log is open.)
    const first = page.locator('.cycles > li').filter({ has: page.locator('.logbtn') }).first();
    await first.getByRole('button', { name: 'Show every step' }).click();
    await expect(first.getByRole('button', { name: 'Hide the full log' })).toBeVisible();
    await expect(first.locator('.bx-entries > li').first()).toBeVisible();
    await expect(first.locator('.bx-entries')).toContainText('finish_cycle');
    await page.screenshot({ path: `${SHOTS}/game-brain-log.png`, fullPage: true });
});

test('playing a game mid-build: Roblox in one click, Studio, Follow and what playtests reported', async ({ page, context }) => {
    const state = await mockApi(page);
    // The join link opens Roblox's site, which hands over to the Roblox app; stand in for it.
    await context.route('https://www.roblox.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Roblox</title><p>Launching Roblox…</p>' }));
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto('/schemery/omniblox');
    await expect(page.getByRole('heading', { name: 'Game studio' })).toBeVisible(BOOT);

    // The game in production can be played from the studio's header and from its card; a game still in research cannot.
    await expect(page.getByRole('link', { name: '▶ Play Candy Factory Tycoon' })).toBeVisible();
    await expect(page.locator('.bx-game').filter({ hasText: 'Space Station Simulator' }).getByRole('link', { name: /^Play / })).toHaveCount(0);
    await page.locator('.bx-game').filter({ hasText: 'Candy Factory Tycoon' }).getByRole('link', { name: 'Play Candy Factory Tycoon', exact: true }).click();

    await expect(page).toHaveURL(/play=1/);
    const panel = page.locator('.bx-play');
    await expect(panel.getByRole('heading', { name: 'Play Candy Factory Tycoon' })).toBeVisible();
    await expect(panel).toContainText('Plays in your private playtest experience (3003).');
    await expect(panel).toContainText('In a playtest now');
    await expect(panel.getByRole('link', { name: 'Join ↗' })).toHaveAttribute('href', `https://www.roblox.com/games/start?placeId=${meta.PlaytestPlaceId}`);
    const sessions = panel.locator('.sessions > li');
    await expect(sessions).toHaveCount(2);
    await expect(sessions.first()).toContainText('playing now');
    await expect(sessions.first()).toContainText('test-bought 2x Candy');
    await expect(sessions.first()).toContainText('rated it Okay: confusing');
    await expect(sessions.first().locator('.errors')).toContainText('attempt to compare number <= nil');
    await expect(sessions.nth(1)).toContainText('Studio');
    await expect(sessions.nth(1)).toContainText('test-bought 500 Candy');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/play-panel.png`, fullPage: true });

    // Play in Roblox: a tab opens on the click and lands on the join link once the build is in Roblox.
    const [tab] = await Promise.all([context.waitForEvent('page'), panel.getByRole('button', { name: '▶ Play in Roblox' }).click()]);
    await expect(tab).toHaveURL(new RegExp(`roblox\\.com/games/start\\?placeId=${meta.PlaytestPlaceId}`));
    expect(state.mutations.find(m => m.path === '/omniblox/games/playtest')?.body).toEqual({ gameId: meta.Building, build: 'latest', fresh: false });
    await expect(panel.getByRole('status')).toContainText('r2 is in Roblox (version 5).');
    await tab.close();

    // An earlier build, with fresh saves.
    await panel.getByLabel('Build', { exact: true }).selectOption('r1');
    await panel.getByLabel('Start with fresh saves').check();
    const [tab2] = await Promise.all([context.waitForEvent('page'), panel.getByRole('button', { name: '▶ Play in Roblox' }).click()]);
    await expect.poll(() => state.mutations.filter(m => m.path === '/omniblox/games/playtest').at(-1)?.body)
        .toEqual({ gameId: meta.Building, build: 'r1', fresh: true });
    await tab2.close();

    // Studio: the place file downloads, named after the build it is, and says when it is not the one asked for.
    await panel.getByLabel('Build', { exact: true }).selectOption('latest');
    const [download] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: '⤓ Open in Roblox Studio' }).click()]);
    expect(download.suggestedFilename()).toBe('Candy Factory Tycoon r2.rbxlx');
    await expect(panel.getByRole('status')).toContainText('Open it in Roblox Studio and press Play (F5).');
    await expect(panel.getByRole('status')).toContainText('so this is r2, the last clean build');

    // Follow is on; switching it off posts.
    const follow = panel.getByRole('checkbox', { name: /Follow the build/ });
    await expect(follow).toBeChecked();
    await follow.click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omniblox/games/playtest/follow')?.body).toEqual({ gameId: meta.Building, follow: false });

    await panel.getByRole('button', { name: 'Close the Play panel' }).click();
    await expect(page).not.toHaveURL(/play=1/);
    await expect(panel).toHaveCount(0);
});

test('a live game is played in the playtest experience, never its own', async ({ page }) => {
    await mockApi(page);
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto(`/schemery/omniblox/game/${meta.Live}?tab=world`);
    await expect(page.getByRole('heading', { name: 'Lava Forest Obby' })).toBeVisible(BOOT);

    await page.getByRole('button', { name: '▶ Play this world' }).click();
    const panel = page.locator('.bx-play');
    await expect(panel).toContainText('It is running "Candy Factory Tycoon" (r2) now; playing this game replaces it.');
    await expect(panel.getByRole('link', { name: 'Join ↗' })).toHaveCount(0);
    await expect(panel).toContainText('None yet.');
});

test('asset library: filter, search and the model drawer', async ({ page }) => {
    await mockApi(page);
    await page.setViewportSize({ width: 1500, height: 1100 });
    await page.goto('/schemery/omniblox/assets');

    await expect(page.getByRole('heading', { name: 'Asset Library' })).toBeVisible(BOOT);
    await expect(page.locator('.bx-asset')).toHaveCount(10);
    await expect(page.locator('.bx-asset').filter({ hasText: 'Wooden Crate' })).toContainText('props');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/assets.png`, fullPage: true });

    await page.getByRole('button', { name: /^Rejected/ }).click();
    await expect(page.locator('.bx-asset')).toHaveCount(1);
    await expect(page.locator('.bx-asset')).toContainText('Union Arch');

    await page.getByLabel('Search models').fill('tree');
    await expect(page.locator('.bx-asset').first()).toContainText('Pine Tree');
    await page.locator('.bx-asset').first().click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toContainText('What the labeller saw');
    await expect(drawer).toContainText('low-poly pine tree');
    await expect(drawer).toContainText('backdoor');
    await drawer.getByRole('button', { name: 'Front' }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/asset-drawer.png` });
    await expect(page).toHaveURL(/asset=900001/);
});

test('playbook: lessons and filters', async ({ page }) => {
    await mockApi(page);
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto('/schemery/omniblox/playbook');

    await expect(page.getByRole('heading', { name: 'Playbook' })).toBeVisible(BOOT);
    await expect(page.locator('.lessons > li')).toHaveCount(4);
    await page.screenshot({ path: `${SHOTS}/playbook.png`, fullPage: true });
    await page.getByRole('button', { name: 'failed', exact: true }).click();
    await expect(page.locator('.lessons > li')).toHaveCount(1);
    await expect(page.locator('.lessons > li')).toContainText('VIP pass');
});

test('a read-only profile sees the studio but no controls', async ({ page }) => {
    await mockApi(page, { rank: 4, permissions: ['omniblox.overview.view', 'omniblox.studio.read'] });
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto('/schemery/omniblox');
    await expect(page.getByRole('heading', { name: 'Game studio' })).toBeVisible(BOOT);
    await expect(page.locator('.bx-game')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'New game' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Harvester/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Done' })).toHaveCount(0);
});

test('the Schemes page lists OmniBlox with its numbers', async ({ page }) => {
    await mockApi(page);
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto('/schemes');
    const card = page.locator('.scheme-card').filter({ hasText: 'OmniBlox' });
    await expect(card).toBeVisible(BOOT);
    await expect(card.locator('.stat-item').filter({ hasText: 'Live games' })).toContainText('1');
    await expect(card.locator('.stat-item').filter({ hasText: 'In production' })).toContainText('1');
    await card.click();
    await expect(page.getByRole('heading', { name: 'Game studio' })).toBeVisible();
});

test('phone width keeps the studio and a game usable', async ({ page }) => {
    await mockApi(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/schemery/omniblox');
    await expect(page.getByRole('heading', { name: 'Game studio' })).toBeVisible(BOOT);
    await expect(page.locator('.bx-game').first()).toBeVisible();
    expect(await pageOverflow(page)).toEqual([]);
    await page.screenshot({ path: `${SHOTS}/studio-phone.png`, fullPage: true });

    // Navigate in-app: a second full page load on the dev server can exhaust sockets on Windows.
    await page.locator('.bx-game').filter({ hasText: 'Lava Forest Obby' }).click();
    await expect(page.getByRole('heading', { name: 'Lava Forest Obby' })).toBeVisible();
    expect(await pageOverflow(page)).toEqual([]);
    await page.screenshot({ path: `${SHOTS}/game-phone.png`, fullPage: true });

    await page.getByRole('button', { name: '▶ Play', exact: true }).click();
    await expect(page.locator('.bx-play')).toBeVisible();
    expect(await pageOverflow(page)).toEqual([]);
    await page.screenshot({ path: `${SHOTS}/play-phone.png`, fullPage: true });
});
