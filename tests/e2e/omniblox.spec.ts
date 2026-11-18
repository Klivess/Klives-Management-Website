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

const DAY_MS = 86_400_000;
const shot = (page: Page, name: string, fullPage = true) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage });

// ─────────────────────────────── the studio ───────────────────────────────

test('studio: the verdict, what needs you, the production line, the figures and the switches', async ({ page }) => {
    const state = await mockApi(page);
    await page.setViewportSize({ width: 1600, height: 1100 });
    await page.goto('/schemery/omniblox');

    await expect(page.getByTestId('obx-verdict')).toContainText('Building "Candy Factory Tycoon"', BOOT);
    const inbox = page.getByTestId('obx-inbox');
    await expect(inbox).toContainText('Upload the icon for "Lava Forest Obby"');
    await expect(inbox).toContainText('Answer the maturity questionnaire for "Lava Forest Obby"');
    await expect(inbox).toContainText('Every experience slot is taken');
    await expect(page.getByTestId('lane-Build')).toContainText('Candy Factory Tycoon');
    await expect(page.getByTestId('lane-Live')).toContainText('Lava Forest Obby');
    await expect(page.getByTestId('obx-retired')).toContainText('Space Station Simulator');
    await expect(page.locator('[data-testid^="tile-"]')).toHaveCount(2);
    await expect(page.getByTestId('kpi-revenue')).toContainText('spent $0');
    await expect(page.getByTestId('kpi-production')).toContainText('Candy Factory Tycoon');
    await expect(page.getByTestId('obx-feed').locator('li').first()).toBeVisible();
    await expect(page.getByTestId(`rail-game-${meta.Building}`)).toBeVisible();
    await expect(page.getByTestId('obx-harvester')).toContainText('pine tree');
    await page.waitForTimeout(600);
    await shot(page, 'studio');

    // Done on a chore posts a JSON body and the item leaves the list.
    await inbox.locator('li').filter({ hasText: 'maturity questionnaire' }).getByRole('button', { name: 'Done' }).click();
    await expect(inbox).not.toContainText('Answer the maturity questionnaire');
    const resolve = state.mutations.find(m => m.path === '/omniblox/tasks/resolve');
    expect(resolve?.body).toMatchObject({ action: 'done' });
    expect(typeof resolve?.body.taskId).toBe('string');

    // The harvester switches in one click; switching the studio on asks first.
    const harvester = page.getByTestId('obx-power-harvester');
    await expect(harvester).toHaveAttribute('aria-checked', 'true');
    await harvester.click();
    await expect(harvester).toHaveAttribute('aria-checked', 'false');
    expect(state.mutations.find(m => m.path === '/omniblox/studio/toggle')?.body).toEqual({ harvester: false });
    const studio = page.getByTestId('obx-power-studio');
    await studio.click();
    await expect(studio).toHaveAttribute('aria-checked', 'false');
    await studio.click();
    await expect(page.getByTestId('obx-confirm')).toContainText('Switch the studio on?');
    await page.getByTestId('obx-confirm-yes').click();
    await expect(studio).toHaveAttribute('aria-checked', 'true');
    expect(state.mutations.filter(m => m.path === '/omniblox/studio/toggle').map(m => m.body)).toEqual([{ harvester: false }, { enabled: false }, { enabled: true }]);
});

test('the palette goes to a game, a page or an action from the keyboard', async ({ page }) => {
    await mockApi(page);
    await page.setViewportSize({ width: 1500, height: 1000 });
    await page.goto('/schemery/omniblox');
    await expect(page.getByTestId('obx-verdict')).toBeVisible(BOOT);

    await page.keyboard.press('Control+k');
    await expect(page.getByTestId('obx-palette')).toBeVisible();
    await page.getByTestId('obx-palette-input').fill('lava');
    await page.keyboard.press('Enter');
    // The first visit to a game page compiles it on a cold dev server.
    await expect(page).toHaveURL(new RegExp(`/game/${meta.Live}`), BOOT);
    await expect(page.getByRole('heading', { name: 'Lava Forest Obby' })).toBeVisible(BOOT);

    await page.getByTestId('obx-search').click();
    await page.getByTestId('obx-palette-input').fill('playbook');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/playbook$/);
});

test('studio: starting a game while one is in production says why it cannot', async ({ page }) => {
    const state = await mockApi(page, { newGameConflict: true });
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto('/schemery/omniblox');
    await page.getByTestId('obx-new-game').click(BOOT);
    await page.getByLabel('A theme to explore (optional)').fill('pirates');
    await page.getByTestId('obx-new-start').click();
    await expect(page.getByTestId('obx-new-dialog').getByRole('alert')).toContainText('Already 1 game(s) in production');
    expect(state.mutations.find(m => m.path === '/omniblox/games/new')?.body).toEqual({ theme: 'pirates' });
});

test('studio: the owner gates are approved right from the inbox, each for its own gate', async ({ page }) => {
    const signoff = {
        TaskId: 't_signoff1', Kind: 'BuildSignoff', GameId: meta.Building, Title: 'Play and sign off "Candy Factory Tycoon" (r2)',
        Detail: '"Candy Factory Tycoon" passed its tests on revision r2: map 87/100.\nPlay it before it is marketed.',
        Status: 'Open', CreatedUtc: new Date(NOW - 11 * DAY_MS).toISOString(), ResolvedUtc: null, Files: [], DedupeKey: `signoff:${meta.Building}`,
    };
    const approval = {
        TaskId: 't_approve1', Kind: 'LaunchApproval', GameId: meta.Live, Title: 'Approve the launch of "Lava Forest Obby"',
        Detail: 'Ready to go public as "Lava Forest Obby" in experience 1001 (revision r1, run clean in Roblox\'s engine).',
        Status: 'Open', CreatedUtc: meta.NowUtc, ResolvedUtc: null, Files: [], DedupeKey: `approve:${meta.Live}`,
    };
    const state = await mockApi(page, { extraTasks: [signoff, approval] });
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto('/schemery/omniblox');
    const inbox = page.getByTestId('obx-inbox');

    // The sign-off that has waited 11 days says so, in the verdict and on its row.
    await expect(page.getByTestId('obx-verdict')).toContainText('2 builds waiting for your sign-off, the oldest for 11 d', BOOT);
    const signoffRow = inbox.locator('li').filter({ hasText: 'Play and sign off' });
    await expect(signoffRow).toContainText('waiting 11 d');
    await expect(signoffRow.getByRole('button', { name: 'Done' })).toHaveCount(0);
    await expect(signoffRow.getByRole('link', { name: 'Play it' })).toHaveAttribute('href', `/schemery/omniblox/game/${meta.Building}?play=1`);
    await shot(page, 'studio-gates');
    await signoffRow.getByRole('button', { name: 'Approve build' }).click();
    await expect(inbox).not.toContainText('Play and sign off "Candy Factory Tycoon" (r2)');
    expect(state.mutations.find(m => m.path === '/omniblox/games/approve')?.body).toEqual({ gameId: meta.Building, gate: 'build' });

    // The launch publishes on Roblox, so it asks once more.
    const row = inbox.locator('li').filter({ hasText: 'Approve the launch' });
    await expect(row.getByRole('button', { name: 'Done' })).toHaveCount(0);
    await row.getByRole('button', { name: 'Approve launch' }).click();
    await page.getByTestId('obx-confirm-yes').click();
    await expect(inbox).not.toContainText('Approve the launch of "Lava Forest Obby"');
    expect(state.mutations.filter(m => m.path === '/omniblox/games/approve').at(-1)?.body).toEqual({ gameId: meta.Live, gate: 'launch' });
});

test('"Do it yourself" hands an owner task back to the studio', async ({ page }) => {
    const state = await mockApi(page, {
        extraTasks: [{ TaskId: 't_icon', Kind: 'UploadIcon', GameId: meta.Live, Title: 'Upload the icon for "Lava Forest Obby" (new)', Detail: 'Roblox has no API key for an experience\'s icon.', Status: 'Open', CreatedUtc: meta.NowUtc, ResolvedUtc: null, Files: ['icon.png'], DedupeKey: `icon:${meta.Live}` }],
    });
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto('/schemery/omniblox');
    const task = page.getByTestId('obx-inbox').locator('li').filter({ hasText: '(new)' });
    await expect(task.getByRole('button', { name: 'icon.png' })).toBeVisible(BOOT);
    await task.getByRole('button', { name: 'Do it yourself' }).click();
    await expect(page.getByTestId('obx-toast')).toContainText('Uploading it with your Roblox account now.');
    expect(state.mutations.find(m => m.path === '/omniblox/tasks/delegate')?.body).toEqual({ taskId: 't_icon' });
});

test('a switched-on harvester that adds nothing says how long, and why', async ({ page }) => {
    // Live 13 Nov 2026: on, stepping every minute, nothing added for 9 days.
    await mockApi(page, {
        patchOverview: o => {
            o.Harvester.LastProgressUtc = new Date(NOW - 9 * DAY_MS).toISOString();
            o.Harvester.Idle = 'discovery waits: 4,740 models are queued to download (it resumes below 4,000)';
            o.Harvester.Downloadable = 0;
        },
    });
    await page.setViewportSize({ width: 1500, height: 1100 });
    await page.goto('/schemery/omniblox');
    const card = page.getByTestId('obx-harvester');
    await expect(card.getByTestId('obx-harvester-idle')).toContainText('Nothing added for 9 d', BOOT);
    await expect(card).toContainText('4,740 models are queued');
    await expect(card).toContainText('on · idle');
    await expect(page.getByTestId('obx-verdict')).toContainText('Harvester idle for 9 d');
    await card.scrollIntoViewIfNeeded();
    await shot(page, 'studio-harvester-idle', false);
});

test('a public game nobody can play says so on its tile, in the verdict and inbox, and on its page', async ({ page }) => {
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
    const tile = page.getByTestId(`tile-${meta.Live}`);
    await expect(tile.getByText('Nobody can play', { exact: true })).toBeVisible(BOOT);
    await expect(tile).toContainText('Public, but nobody can play it: it has no maturity rating');
    await expect(page.getByTestId('obx-verdict')).toContainText('Nobody can play Lava Forest Obby');
    await expect(page.getByTestId('obx-inbox').locator('li').first()).toContainText('Nobody can play "Lava Forest Obby"');
    await shot(page, 'studio-unplayable');

    await tile.getByRole('link', { name: 'Lava Forest Obby', exact: true }).click();
    const banner = page.getByTestId('obx-closed');
    await expect(banner).toContainText('ContextualPlayabilityUnrated');
    await expect(banner).toContainText('Maturity & Compliance questionnaire');
});

// ─────────────────────────────── the Roblox account ───────────────────────────────

test('the owner connects their Roblox account with Quick Log In, or by pasting a cookie', async ({ page }) => {
    const state = await mockApi(page, {
        patchOverview: o => o.Attention.unshift({ Level: 'warning', Title: 'OmniBlox cannot create experiences', Detail: 'It creates the experiences its games publish to with your Roblox account, and none is connected.', Action: 'roblox' }),
    });
    state.roblox.Waiting = ['Answer the maturity questionnaire: nobody can play "Lava Forest Obby" until you do', 'Upload the icon for "Lava Forest Obby"'];
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto('/schemery/omniblox');
    const card = page.getByTestId('obx-account');
    await expect(card.getByTestId('obx-account-connect')).toBeVisible(BOOT);
    await expect(card).toContainText('Without the questionnaire Roblox lets nobody play a public game');
    await expect(card).toContainText('nobody can play "Lava Forest Obby"');

    // The inbox's item starts it: a code to type into Roblox's Quick Log In.
    await page.getByTestId('obx-inbox').getByRole('button', { name: 'Connect Roblox' }).click();
    await expect(card.getByTestId('obx-account-code')).toHaveText('QK7Z2P');
    await expect(card.getByRole('link', { name: 'Quick Log In ↗' })).toHaveAttribute('href', 'https://www.roblox.com/crossdevicelogin/ConfirmCode');
    await expect(card).toContainText('same network as the server');
    await shot(page, 'roblox-code');

    // Entered on the signed-in device, then confirmed: the card follows along by itself.
    await expect(card).toContainText('St********* entered the code: press Confirm Login', { timeout: 10_000 });
    await expect(card).toContainText('StudioOwner', { timeout: 10_000 });
    await expect(card).toContainText('Quick Log In · since');
    await expect(card.getByTestId('obx-account-split')).toHaveCount(0);

    // Disconnecting asks first.
    await card.getByRole('button', { name: 'Disconnect' }).click();
    await page.getByTestId('obx-confirm-yes').click();
    await expect(card.getByTestId('obx-account-connect')).toBeVisible();

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

test('games, session and key on different accounts: the split is spelled out, with the way to mend it', async ({ page }) => {
    // Live 13 Nov 2026: games on user 414875755, session and key on OmnipotentArchitect (11932230438).
    const state = await mockApi(page);
    state.roblox = {
        ...state.roblox, Connected: true,
        Account: { UserId: 77, Name: 'NewStudio', Method: 'pasted', ConnectedUtc: meta.NowUtc, VerifiedUtc: meta.NowUtc },
        ApiKey: { Set: true, Info: { Name: 'Studio key', OwnerUserId: 77, Scopes: [], ExpiresUtc: null, CheckedUtc: meta.NowUtc }, MatchesAccount: false },
        OldAccountGames: [{ GameId: meta.Live, Title: 'Lava Forest Obby', Stage: 'Live', UniverseId: 1001 }],
    };
    await page.setViewportSize({ width: 1500, height: 1000 });
    await page.goto('/schemery/omniblox');
    const card = page.getByTestId('obx-account');
    const split = card.getByTestId('obx-account-split');
    await expect(split).toContainText('Roblox refuses every upload until these are one account', BOOT);
    await expect(split).toContainText('session is NewStudio (user 77)');
    await expect(split).toContainText('key was made on user 77');
    await expect(card.getByTestId('obx-account-compare')).toContainText('user 42');
    await expect(page.getByTestId('obx-verdict')).toContainText('Roblox account split');
    await expect(card).toContainText('Still on the old account');
    await shot(page, 'roblox-split');

    await card.getByRole('button', { name: 'Change key' }).click();
    await card.getByLabel('Roblox Open Cloud API key').fill('new-key-value');
    await card.getByRole('button', { name: 'Check and save' }).click();
    await expect(card.getByTestId('obx-account-compare')).toContainText('“OmniBlox studio”');
    await expect(card.getByLabel('Roblox Open Cloud API key')).toHaveCount(0);
    expect(state.mutations.find(m => m.path === '/omniblox/roblox/apikey')?.body).toEqual({ apiKey: 'new-key-value' });

    await card.getByRole('button', { name: 'Move to this account' }).click();
    await page.getByTestId('obx-confirm-yes').click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omniblox/games/action')?.body).toEqual({ gameId: meta.Live, action: 'move', target: 'new' });

    await card.getByTestId('obx-account-switch').click();
    await page.getByTestId('obx-confirm-yes').click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omniblox/roblox/quicklogin')?.body).toEqual({ switchAccount: true });
});

// ─────────────────────────────── a game ───────────────────────────────

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
    await page.setViewportSize({ width: 1500, height: 1050 });
    await page.goto(`/schemery/omniblox/game/${meta.Building}`);
    await expect(page.getByRole('heading', { name: 'Candy Factory Tycoon' })).toBeVisible(BOOT);

    // Gate 1: the build. The gate card stands in for the task.
    const card = page.getByTestId('obx-gate');
    await expect(card).toContainText('Play and sign off r2');
    await expect(card).toContainText('Gate 1 of 2');
    await expect(page.locator('.obx-side')).not.toContainText('Play and sign off "Candy Factory Tycoon"');
    await page.waitForTimeout(400);
    await shot(page, 'gate-build');
    await card.getByRole('button', { name: 'Request changes' }).click();
    await card.getByLabel('What to change').fill('The first dropper costs more than players start with.');
    await card.getByRole('button', { name: 'Send to the builder' }).click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omniblox/games/reject')?.body)
        .toEqual({ gameId: meta.Building, gate: 'build', note: 'The first dropper costs more than players start with.', backToBuild: true });
    gate = 'launch';
    await card.getByTestId('obx-gate-approve').click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omniblox/games/approve')?.body).toEqual({ gameId: meta.Building, gate: 'build' });

    // Gate 2: the launch, with the store page and the prices it covers.
    await expect(card).toContainText('Approve the launch');
    await expect(card).toContainText('Build the sweetest factory on the server!');
    await expect(card).toContainText('2x Candy · R$ 99');
    await card.getByText(/Your earlier decisions/).click();
    await expect(card).toContainText('Fun from the first button.');
    await shot(page, 'gate-launch');
    await card.getByRole('button', { name: 'Request changes' }).click();
    await card.getByLabel('What to change').fill('Make the 2x pass 79 R$.');
    await card.getByRole('button', { name: 'Send to the marketer' }).click();
    await expect.poll(() => state.mutations.filter(m => m.path === '/omniblox/games/reject').at(-1)?.body)
        .toEqual({ gameId: meta.Building, gate: 'launch', note: 'Make the 2x pass 79 R$.', backToBuild: false });
    await card.getByTestId('obx-gate-approve').click();
    await page.getByTestId('obx-confirm-yes').click();
    await expect.poll(() => state.mutations.filter(m => m.path === '/omniblox/games/approve').at(-1)?.body).toEqual({ gameId: meta.Building, gate: 'launch' });
});

test('live game: overview, world, store, numbers, brain, files and activity, by click and by key', async ({ page }) => {
    const state = await mockApi(page);
    await page.setViewportSize({ width: 1600, height: 1100 });
    await page.goto(`/schemery/omniblox/game/${meta.Live}`);

    await expect(page.getByRole('heading', { name: 'Lava Forest Obby' })).toBeVisible(BOOT);
    await expect(page.getByText('Leap over glowing lava through a pine forest.')).toBeVisible();
    await expect(page.getByText('Three stages with checkpoints')).toBeVisible();
    await expect(page.locator('tr[data-chosen]')).toContainText('A lava obby through a pine forest');
    const approvals = page.getByTestId('obx-approvals');
    await expect(approvals.locator('li')).toHaveCount(2);
    await expect(approvals).toContainText('Build sign-off · r1');
    await expect(approvals).toContainText('Store page and prices look right.');
    await page.waitForTimeout(500);
    await shot(page, 'game-overview');

    await page.getByTestId('tab-world').click();
    await expect(page.locator('.obx-frame img').first()).toBeVisible();
    await page.getByRole('button', { name: 'Spawn', exact: true }).click();
    await page.waitForTimeout(500);
    await shot(page, 'game-world');

    await page.getByTestId('tab-store').click();
    await expect(page.locator('.obx-table').getByText('Skip Stage', { exact: true })).toBeVisible();
    await expect(page.getByText('Compliance passed')).toBeVisible();
    await expect(page.locator('figure img').first()).toBeVisible();
    const publishing = page.getByRole('region', { name: 'Publishing' });
    await expect(publishing).toContainText('not uploaded yet');
    await expect(publishing).toContainText('questionnaire not answered yet');
    await shot(page, 'game-store');

    await page.getByTestId('tab-numbers').click();
    await expect(page.locator('.obx-kpi').filter({ hasText: 'Players a day' })).toBeVisible();
    await expect(page.getByText('How far players get')).toBeVisible();
    await expect(page.getByText('Day 7', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '30 d', exact: true }).click();
    await expect(page.getByRole('button', { name: '30 d', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(500);
    await shot(page, 'game-numbers');

    await page.getByTestId('tab-brain').click();
    await expect(page.getByTestId('obx-brain')).toContainText('Hand-overs');
    await expect(page.getByTestId('obx-brain').locator('.obx-lesson').first()).toBeVisible();

    await page.getByTestId('tab-files').click();
    await page.getByRole('option', { name: /Welcome\.server\.luau/ }).click();
    await expect(page.locator('pre.obx-code--file')).toContainText('Players.PlayerAdded');
    await shot(page, 'game-files');

    await page.getByTestId('tab-activity').click();
    await expect(page.getByTestId('obx-feed').locator('li').first()).toBeVisible();

    // 1–8 switch tabs.
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('2');
    await expect(page.getByTestId('tab-world')).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/tab=world/);

    await page.getByRole('button', { name: 'Maintain now' }).click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omniblox/games/maintain')?.body).toEqual({ gameId: meta.Live });
});

test('game in production: exit criteria, steering and pausing', async ({ page }) => {
    const state = await mockApi(page);
    await page.setViewportSize({ width: 1500, height: 1000 });
    await page.goto(`/schemery/omniblox/game/${meta.Building}`);
    await expect(page.getByRole('heading', { name: 'Candy Factory Tycoon' })).toBeVisible(BOOT);
    await expect(page.locator('.obx-criteria li[data-met]').filter({ hasText: 'The game has been built at least once' })).toBeVisible();
    await expect(page.locator('.obx-criteria li:not([data-met])').filter({ hasText: 'Every milestone is done' })).toBeVisible();
    await shot(page, 'game-building');

    // Steer focuses the box; Ctrl+Enter sends.
    await page.getByRole('button', { name: 'Steer', exact: true }).click();
    const box = page.getByLabel('New direction');
    await expect(box).toBeFocused();
    await box.fill('Add a candy machine finale');
    await box.press('Control+Enter');
    await expect.poll(() => state.mutations.find(m => m.path === '/omniblox/games/steer')?.body)
        .toEqual({ gameId: meta.Building, note: 'Add a candy machine finale' });

    await page.getByTestId('obx-pause').click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omniblox/games/pause')?.body).toEqual({ gameId: meta.Building, paused: true });
});

test('a game at work: every step live, the owner\'s directions, the engine run and the map', async ({ page }) => {
    const state = await mockApi(page, {
        patchGame: (id, detail) => {
            if (id !== meta.Building || !detail.Live) return;
            detail.Live.Running = true;
            detail.Live.Status = 'running run_tests';
        },
    });
    await page.setViewportSize({ width: 1600, height: 1100 });
    await page.goto(`/schemery/omniblox/game/${meta.Building}`);
    await expect(page.getByRole('heading', { name: 'Candy Factory Tycoon' })).toBeVisible(BOOT);

    const live = page.getByTestId('obx-live-cycle');
    await expect(live).toContainText('Working now');
    await expect(live).toContainText('running run_tests');
    await expect(live.locator('.obx-step').filter({ hasText: 'BUILD OK' })).toBeVisible();
    await expect(live.locator('.obx-step').filter({ hasText: 'scatter_assets' }).first()).toBeVisible();
    await expect(live.locator('.obx-step__pic img').first()).toBeVisible();
    await live.locator('.obx-step__pic').first().click();
    await expect(live.locator('.obx-step__pic[data-big]')).toHaveCount(1);

    const directions = page.getByTestId('obx-directions');
    await expect(directions).toContainText('Add a candy machine finale that unlocks after the first rebirth.');
    await expect(directions).toContainText('Open · delivered');
    await expect(directions).toContainText('Doubled the plot to 100×100');
    await page.waitForTimeout(500);
    await shot(page, 'game-at-work');
    await directions.locator('li').filter({ hasText: 'candy machine finale' }).getByRole('button', { name: 'Drop' }).click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omniblox/games/directive')?.body)
        .toEqual({ gameId: meta.Building, directiveId: 'd2', action: 'drop' });
    await expect(page.getByRole('region', { name: 'Key facts' })).not.toContainText('[object Object]');

    // Tests: the engine run's failing check and boot error, located in the game's files.
    await page.getByTestId('tab-tests').click();
    const engine = page.getByTestId('obx-engine');
    await expect(engine.getByText('Factory · the first dropper is affordable')).toBeVisible();
    await expect(engine.locator('pre').filter({ hasText: 'starting candy 50 < first dropper 60' })).toBeVisible();
    await expect(engine.locator('code').filter({ hasText: 'src/server/Welcome.server.luau:4' })).toBeVisible();
    await expect(page.getByTestId('obx-checks').locator('.obx-check-row').filter({ hasText: 'Roblox\'s engine' }).locator('.obx-check-row__mark')).toHaveAttribute('data-tone', 'crit');
    await page.getByTestId('obx-build').click();
    await expect(page.getByTestId('obx-checks').locator('pre')).toContainText('BUILD OK');
    expect(state.mutations.find(m => m.path === '/omniblox/games/build')?.body).toEqual({ gameId: meta.Building });
    await page.getByTestId('obx-run').click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omniblox/games/test')?.body).toEqual({ gameId: meta.Building });
    await expect(page.getByTestId('obx-toast').first()).toContainText('Running in Roblox');
    await shot(page, 'game-tests');

    // World: the map with its plan, the map report, and a zone's own view.
    await page.getByTestId('tab-world').click();
    const report = page.getByTestId('obx-map-report');
    await expect(report.locator('.obx-kpi__value')).toHaveText(/\d+/);
    await expect(report).toContainText('75 is the bar');
    await expect(report.locator('.obx-bars__row')).toHaveCount(7);
    await expect(report.locator('.obx-bars__row').filter({ hasText: 'Gameplay layout' })).toContainText('/20');
    const zone = page.getByRole('region', { name: 'Map plan' }).getByRole('button').filter({ hasText: 'Plot 2' });
    await zone.click();
    await expect(zone).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(500);
    await shot(page, 'game-world-map');
});

test('without an API key the local engine stands in, and the Tests tab says so', async ({ page }) => {
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
    await page.setViewportSize({ width: 1500, height: 1000 });
    await page.goto(`/schemery/omniblox/game/${meta.Building}?tab=tests`);
    const engine = page.getByTestId('obx-engine');
    await expect(engine).toContainText('Local engine run', BOOT);
    await expect(engine).not.toContainText('Local engine:');
    await expect(engine).toContainText('Roblox\'s engine runs the game again before launch');
    await expect(engine.locator('code').filter({ hasText: 'src/server/Welcome.server.luau:4' })).toBeVisible();
    await expect(page.getByTestId('obx-checks').locator('.obx-check-row').filter({ hasText: 'Local engine' }).locator('.obx-check-row__mark')).toHaveAttribute('data-tone', 'crit');
    await expect(page.getByTestId('obx-run')).toHaveText(/Run locally/);
    await page.getByTestId('obx-run').click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omniblox/games/test')?.body).toEqual({ gameId: meta.Building });
    await expect(page.getByTestId('obx-toast').first()).toContainText('Running in the local engine');
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
    const economy = page.getByTestId('obx-economy');
    await expect(economy.locator('pre')).toContainText('unlock Pine Forest (55)', BOOT);
    await expect(economy.locator('.obx-issues')).toContainText('out of reach within six hours');
});

test('a live game shows the icon and the rating the studio published, with its answers', async ({ page }) => {
    await mockApi(page, {
        patchGame: (id, detail) => {
            if (id !== meta.Live || !detail.Game) return;
            detail.Game.Publish.IconUploadedUtc = meta.NowUtc;
            detail.Game.Publish.StoreThumbnails = [{ File: 'thumb1.png', Hash: 'ab12', ImageId: 7001, UploadedUtc: meta.NowUtc }];
            detail.Game.Publish.Questionnaire = {
                Utc: meta.NowUtc, QuestionnaireIds: ['main-1', 'add-1'], Published: true, StoppedReason: null, AgeRating: 'Minimal', MinimumAge: 0,
                Answers: ['Does your experience contain violence? → No (because Violence: none)', 'How can players communicate? → Only Roblox\'s chat (because only Roblox\'s standard text chat)'],
            };
        },
    });
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto(`/schemery/omniblox/game/${meta.Live}?tab=store`);
    const publishing = page.getByRole('region', { name: 'Publishing' });
    await expect(publishing).toContainText('Minimal · answered', BOOT);
    await expect(publishing).toContainText('uploaded');
    await expect(publishing).toContainText('1 on the store page');
    await publishing.getByText('2 answers').click();
    await expect(publishing).toContainText('Does your experience contain violence? → No (because Violence: none)');
});

test('a live game whose thumbnails never reached its store page says so', async ({ page }) => {
    await mockApi(page, {
        patchGame: (id, detail) => {
            if (id !== meta.Live || !detail.Game) return;
            detail.Game.Publish.IconUploadedUtc = meta.NowUtc;
            detail.Game.Publish.StoreThumbnails = [];
        },
    });
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto(`/schemery/omniblox/game/${meta.Live}?tab=store`);
    await expect(page.getByRole('region', { name: 'Publishing' })).toContainText('not on the store page yet (1 made)', BOOT);
});

test('the owner manages a live game on Roblox: update, take down and archive, move to their own experience', async ({ page }) => {
    const state = await mockApi(page);
    await page.setViewportSize({ width: 1500, height: 1000 });
    await page.goto(`/schemery/omniblox/game/${meta.Live}`);
    const card = page.getByTestId('obx-manage');
    await expect(card).toContainText('1001', BOOT);

    await card.getByRole('button', { name: 'Update' }).click();
    await expect(card).toContainText('Everything is on Roblox again.');
    await expect(card).toContainText('Published the current build: version 12');
    await shot(page, 'game-manage');

    await card.getByRole('button', { name: 'Take down…' }).click();
    await page.getByLabel(/Also archive the experience/).check();
    await page.getByTestId('obx-takedown').click();

    await card.getByRole('button', { name: 'Move…' }).click();
    await page.getByLabel('An experience of mine:').check();
    await page.getByLabel('Experience as universeId:placeId').fill('5005:6006');
    await page.getByRole('button', { name: 'Move it' }).click();

    await expect.poll(() => state.mutations.filter(m => m.path === '/omniblox/games/action').map(m => m.body)).toEqual([
        { gameId: meta.Live, action: 'sync' },
        { gameId: meta.Live, action: 'takedown', archive: true },
        { gameId: meta.Live, action: 'move', target: '5005:6006' },
    ]);
});

test('a game the watchdog paused waits for the owner, and resumes', async ({ page }) => {
    const state = await mockApi(page, {
        patchGame: (id, detail) => {
            if (id !== meta.Building || !detail.Game) return;
            detail.Game.Paused = true;
            detail.Game.Progress.Level = 3;
            detail.Watchdog = { ...detail.Watchdog, Level: 3, Name: 'waiting for the owner', StalledCycles: 8, History: ['10-20 09:12 level 1 after a test run', '10-20 11:40 level 3 after a builder cycle'] };
        },
    });
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto(`/schemery/omniblox/game/${meta.Building}`);
    const banner = page.getByTestId('obx-watchdog');
    await expect(banner).toContainText('waiting for the owner', BOOT);
    await expect(banner).toContainText('Nothing is lost while it waits');
    await shot(page, 'game-watchdog');
    await banner.getByRole('button', { name: 'Resume' }).click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omniblox/games/resume')?.body).toEqual({ gameId: meta.Building });
});

test('an abandoned game can be revived where it stopped', async ({ page }) => {
    const state = await mockApi(page);
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto(`/schemery/omniblox/game/${meta.Abandoned}`);
    await expect(page.getByRole('heading', { name: 'Space Station Simulator' })).toBeVisible(BOOT);
    await page.getByTestId('obx-revive').click();
    await expect(page.getByTestId('obx-confirm')).toContainText('It goes back to Research');
    await page.getByTestId('obx-confirm-yes').click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omniblox/games/revive')?.body).toEqual({ gameId: meta.Abandoned });
});

test('the brain keeps every step of recent cycles', async ({ page }) => {
    await mockApi(page);
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto(`/schemery/omniblox/game/${meta.Building}?tab=brain`);
    const brain = page.getByTestId('obx-brain');
    const first = brain.locator('.obx-lesson').filter({ has: page.getByRole('button', { name: 'Show every step' }) }).first();
    await first.getByRole('button', { name: 'Show every step' }).click(BOOT);
    const opened = brain.locator('.obx-lesson').filter({ has: page.getByRole('button', { name: 'Hide the steps' }) });
    await expect(opened.locator('.obx-step').first()).toBeVisible();
    await expect(opened.locator('.obx-steps')).toContainText('finish_cycle');
    await shot(page, 'game-brain-log');
});

test('playing a game mid-build: Roblox in one click, Studio, Follow and what playtests reported', async ({ page, context }) => {
    const state = await mockApi(page);
    await context.route('https://www.roblox.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Roblox</title><p>Launching Roblox…</p>' }));
    await page.setViewportSize({ width: 1500, height: 1000 });
    await page.goto('/schemery/omniblox');

    // The game in production plays from the verdict and from its tile; an abandoned one has no tile to play from.
    await expect(page.getByTestId('obx-play-production')).toContainText('Play Candy Factory Tycoon', BOOT);
    await expect(page.getByTestId(`tile-${meta.Abandoned}`)).toHaveCount(0);
    await page.getByTestId(`tile-${meta.Building}`).getByRole('link', { name: 'Play Candy Factory Tycoon' }).click();

    await expect(page).toHaveURL(/play=1/);
    const sheet = page.getByTestId('obx-play');
    await expect(sheet.getByRole('heading', { name: 'Play Candy Factory Tycoon' })).toBeVisible();
    await expect(sheet).toContainText('Plays in your private playtest experience (3003).');
    await expect(sheet).toContainText('In a playtest now');
    await expect(sheet.getByRole('link', { name: 'Join ↗' })).toHaveAttribute('href', `https://www.roblox.com/games/start?placeId=${meta.PlaytestPlaceId}`);
    const sessions = sheet.locator('.obx-lesson');
    await expect(sessions).toHaveCount(2);
    await expect(sessions.first()).toContainText('playing now');
    await expect(sessions.first()).toContainText('test-bought 2x Candy');
    await expect(sessions.first()).toContainText('rated it Okay: confusing');
    await expect(sessions.first()).toContainText('attempt to compare number <= nil');
    await expect(sessions.nth(1)).toContainText('Studio');
    await expect(sessions.nth(1)).toContainText('test-bought 500 Candy');
    await page.waitForTimeout(400);
    await shot(page, 'play-sheet', false);

    const [tab] = await Promise.all([context.waitForEvent('page'), sheet.getByTestId('obx-play-roblox').click()]);
    await expect(tab).toHaveURL(new RegExp(`roblox\\.com/games/start\\?placeId=${meta.PlaytestPlaceId}`));
    expect(state.mutations.find(m => m.path === '/omniblox/games/playtest')?.body).toEqual({ gameId: meta.Building, build: 'latest', fresh: false });
    await expect(sheet.getByTestId('obx-play-message')).toContainText('r2 is in Roblox (version 5).');
    await tab.close();

    await sheet.getByLabel('Build', { exact: true }).selectOption('r1');
    await sheet.getByLabel('Fresh saves').check();
    const [tab2] = await Promise.all([context.waitForEvent('page'), sheet.getByTestId('obx-play-roblox').click()]);
    await expect.poll(() => state.mutations.filter(m => m.path === '/omniblox/games/playtest').at(-1)?.body).toEqual({ gameId: meta.Building, build: 'r1', fresh: true });
    await tab2.close();

    await sheet.getByLabel('Build', { exact: true }).selectOption('latest');
    const [download] = await Promise.all([page.waitForEvent('download'), sheet.getByTestId('obx-play-studio').click()]);
    expect(download.suggestedFilename()).toBe('Candy Factory Tycoon r2.rbxlx');
    await expect(sheet.getByTestId('obx-play-message')).toContainText('Open it in Roblox Studio and press Play (F5).');
    await expect(sheet.getByTestId('obx-play-message')).toContainText('so this is r2, the last clean build');

    const follow = sheet.getByRole('checkbox', { name: /Follow the build/ });
    await expect(follow).toBeChecked();
    await follow.click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omniblox/games/playtest/follow')?.body).toEqual({ gameId: meta.Building, follow: false });

    await page.keyboard.press('Escape');
    await expect(page).not.toHaveURL(/play=1/);
    await expect(sheet).toHaveCount(0);
});

test('a live game is played in the playtest experience, never its own', async ({ page }) => {
    await mockApi(page);
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto(`/schemery/omniblox/game/${meta.Live}?tab=world`);
    await expect(page.getByRole('heading', { name: 'Lava Forest Obby' })).toBeVisible(BOOT);
    await page.keyboard.press('p');
    const sheet = page.getByTestId('obx-play');
    await expect(sheet).toContainText('It runs "Candy Factory Tycoon" (r2) now; playing this game replaces it.');
    await expect(sheet.getByRole('link', { name: 'Join ↗' })).toHaveCount(0);
    await expect(sheet).toContainText('None yet.');
});

// ─────────────────────────────── library and playbook ───────────────────────────────

test('asset library: filter, search and the model sheet', async ({ page }) => {
    await mockApi(page);
    await page.setViewportSize({ width: 1600, height: 1100 });
    await page.goto('/schemery/omniblox/assets');
    await expect(page.getByRole('heading', { name: 'Asset library' })).toBeVisible(BOOT);
    const grid = page.getByTestId('obx-assets');
    await expect(grid.locator('.obx-asset')).toHaveCount(10);
    await expect(grid.locator('.obx-asset').filter({ hasText: 'Wooden Crate' })).toContainText('props');
    await page.waitForTimeout(600);
    await shot(page, 'assets');

    await page.getByTestId('status-rejected').click();
    await expect(grid.locator('.obx-asset')).toHaveCount(1);
    await expect(grid.locator('.obx-asset')).toContainText('Union Arch');

    await page.keyboard.press('/');
    await expect(page.getByTestId('obx-assets-search')).toBeFocused();
    await page.keyboard.type('tree');
    await expect(grid.locator('.obx-asset').first()).toContainText('Pine Tree');
    await grid.locator('.obx-asset').first().click();
    const sheet = page.getByTestId('obx-asset-sheet');
    await expect(sheet).toContainText('What the labeller saw');
    await expect(sheet).toContainText('low-poly pine tree');
    await expect(sheet).toContainText('backdoor');
    await sheet.getByRole('button', { name: 'Front' }).click();
    await page.waitForTimeout(400);
    await shot(page, 'asset-sheet', false);
    await expect(page).toHaveURL(/asset=900001/);
});

test('playbook: lessons and filters', async ({ page }) => {
    await mockApi(page);
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto('/schemery/omniblox/playbook');
    await expect(page.getByRole('heading', { name: 'Playbook' })).toBeVisible(BOOT);
    await expect(page.getByTestId('obx-lesson')).toHaveCount(4);
    await shot(page, 'playbook');
    await page.getByRole('button', { name: 'failed', exact: true }).click();
    await expect(page.getByTestId('obx-lesson')).toHaveCount(1);
    await expect(page.getByTestId('obx-lesson')).toContainText('VIP pass');
});

// ─────────────────────────────── access and widths ───────────────────────────────

test('a read-only profile sees the studio but no controls', async ({ page }) => {
    await mockApi(page, { rank: 4, permissions: ['omniblox.overview.view', 'omniblox.studio.read'] });
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto('/schemery/omniblox');
    await expect(page.getByTestId('obx-verdict')).toBeVisible(BOOT);
    await expect(page.locator('[data-testid^="tile-"]')).toHaveCount(2);
    await expect(page.getByTestId('obx-new-game')).toHaveCount(0);
    await expect(page.getByTestId('obx-power-studio')).toHaveCount(0);
    await expect(page.getByTestId('obx-account')).toHaveCount(0);
    await expect(page.getByTestId('obx-inbox').getByRole('button', { name: 'Done' })).toHaveCount(0);
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
    await expect(page.getByTestId('obx-verdict')).toBeVisible();
});

test('phone width keeps the studio, a game and playing it usable', async ({ page }) => {
    await mockApi(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/schemery/omniblox');
    await expect(page.getByTestId('obx-verdict')).toBeVisible(BOOT);
    await expect(page.locator('[data-testid^="tile-"]').first()).toBeVisible();
    await page.waitForTimeout(400);
    expect(await pageOverflow(page)).toEqual([]);
    await shot(page, 'studio-phone');

    // Navigate in-app: a second full page load on the dev server can exhaust sockets on Windows.
    await page.getByTestId(`tile-${meta.Live}`).getByRole('link', { name: 'Lava Forest Obby', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Lava Forest Obby' })).toBeVisible();
    await page.waitForTimeout(400);
    expect(await pageOverflow(page)).toEqual([]);
    await shot(page, 'game-phone');

    await page.getByTestId('obx-play-open').click();
    await expect(page.getByTestId('obx-play')).toBeVisible();
    expect(await pageOverflow(page)).toEqual([]);
    await shot(page, 'play-phone', false);
});
