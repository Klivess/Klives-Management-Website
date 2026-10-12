import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { expect, test, type BrowserContext, type Page, type Route, type WebSocketRoute } from '@playwright/test';
import WebSocket from 'ws';
import { catalogPayload, mePayload } from './fixtures/permissions';

/**
 * KliveChat. The lobby and the room's non-call states run against mocks. The call test runs two real
 * Chromium pages (fake camera and microphone) against the real C# room engine: the page's signalling
 * socket is bridged to the host in Omnipotent.Tests/KliveChat/KliveChatE2EHost.cs. Start it, then run with
 * KLIVECHAT_HOST=ws://127.0.0.1:<port>. Screenshots land in test-results/klivechat/.
 */

const API = 'https://klive.dev';
const SHOTS = 'test-results/klivechat';
const BOOT = { timeout: 45_000 };
const HOST = process.env.KLIVECHAT_HOST;
const ROOM_ID = `e2e${Date.now().toString(36)}`;
const MINUTE = 60_000;
const NOW = Date.now();
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

/**
 * Chrome's default fake microphone is a 20 ms beep, too short to say anything about a speaking indicator.
 * This "voice" is two seconds of a 220 + 330 Hz chord at about -14 dBFS, then a second of silence, looped.
 */
function writeVoiceWav(path: string) {
    const rate = 48_000;
    const samples = rate * 3;
    const data = Buffer.alloc(samples * 2);
    for (let i = 0; i < samples; i++) {
        const t = i / rate;
        const value = t < 2 ? 0.1 * Math.sin(2 * Math.PI * 220 * t) + 0.1 * Math.sin(2 * Math.PI * 330 * t) : 0;
        data.writeInt16LE(Math.round(value * 32767), i * 2);
    }
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + data.length, 4);
    header.write('WAVEfmt ', 8);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(1, 22); // mono
    header.writeUInt32LE(rate, 24);
    header.writeUInt32LE(rate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(data.length, 40);
    mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(path, Buffer.concat([header, data]));
}

const VOICE = resolve(tmpdir(), 'klivechat-e2e-voice.wav');
writeVoiceWav(VOICE);

test.describe.configure({ timeout: 150_000 });
test.use({
    launchOptions: {
        args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            `--use-file-for-fake-audio-capture=${VOICE}`,
            '--disable-features=WebRtcHideLocalIpsWithMdns',
        ],
    },
    permissions: ['microphone', 'camera', 'clipboard-read', 'clipboard-write'],
});

const ME = { name: 'Klives', rank: 5, userId: 'klives', canCreate: true, canModerate: true, canDeleteAnyRoom: true };

function person(id: string, name: string, over: Record<string, unknown> = {}) {
    return { id, name, isGuest: false, isMuted: false, hasVideo: false, isScreenSharing: false, connected: true, ...over };
}

function roomSummary(id: string, name: string, over: Record<string, unknown> = {}) {
    return {
        roomId: id, name, createdBy: 'Klives', createdUtc: iso(3 * 24 * 60 * MINUTE), lastActiveUtc: iso(2 * 60 * MINUTE),
        persistent: false, locked: false, userCount: 0, participants: [] as unknown[], roomPath: `/shared/klivechat/${id}`, canManage: true, ...over,
    };
}

const LOBBY = [
    roomSummary('general000', 'General', {
        persistent: true, userCount: 3, lastActiveUtc: iso(MINUTE),
        participants: [person('a', 'Sam Carter', { hasVideo: true }), person('b', 'Alex Moreno', { isMuted: true }), person('c', 'jordan', { isGuest: true, isScreenSharing: true })],
    }),
    roomSummary('movienight', 'Movie night', { createdBy: 'Sam Carter', canManage: false, lastActiveUtc: iso(5 * 60 * MINUTE) }),
    roomSummary('standup123', 'Standup', { locked: true, lastActiveUtc: iso(26 * 60 * MINUTE) }),
];

const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'Authorization, Content-Type, X-Klive-Client, X-Klive-Page, Cache-Control',
    'access-control-expose-headers': '*',
};

interface ApiState {
    rooms: ReturnType<typeof roomSummary>[];
    mutations: string[];
}

async function mockApi(page: Page, who: 'klives' | 'guest', rooms = structuredClone(LOBBY)): Promise<ApiState> {
    const state: ApiState = { rooms, mutations: [] };
    await page.route(`${API}/**`, async (route: Route) => {
        const request = route.request();
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
        const url = new URL(request.url());
        const json = (body: unknown, status = 200) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
        if (request.method() === 'POST') state.mutations.push(`${url.pathname}${url.search}`);
        const id = url.searchParams.get('id');
        switch (url.pathname) {
            case '/klivechat/me': return who === 'klives' ? json(ME) : json({}, 401);
            case '/klivechat/rooms': {
                if (!id) return json(who === 'klives' ? state.rooms : []);
                const room = state.rooms.find(r => r.roomId === id) ?? (id === ROOM_ID ? roomSummary(ROOM_ID, 'Standup') : null);
                return room ? json(room) : route.fulfill({ status: 404, headers: cors, body: 'Room not found' });
            }
            case '/klivechat/create': {
                const created = roomSummary('newroom789', url.searchParams.get('name') || "Klives's room", { lastActiveUtc: new Date().toISOString() });
                state.rooms.unshift(created);
                return json(created);
            }
            case '/klivechat/update': {
                const room = state.rooms.find(r => r.roomId === id)!;
                if (url.searchParams.has('name')) room.name = url.searchParams.get('name')!;
                if (url.searchParams.has('persistent')) room.persistent = url.searchParams.get('persistent') === 'true';
                if (url.searchParams.has('locked')) room.locked = url.searchParams.get('locked') === 'true';
                return json(room);
            }
            case '/klivechat/delete':
                state.rooms = state.rooms.filter(r => r.roomId !== id);
                return json({ success: true, roomId: id });
            case '/KMProfiles/me': return who === 'klives' ? json(mePayload({ rank: 5, name: 'Klives', userId: 'klives' })) : json({}, 401);
            case '/KMProfiles/permissions/catalog': return json(catalogPayload(false));
            case '/KMProfiles/LoginStatus': return route.fulfill({ status: 200, headers: cors, body: 'SessionActive' });
            default: return json({ error: 'NotFound' }, 404);
        }
    });
    return state;
}

async function signIn(context: BrowserContext) {
    const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '4173'}`).origin;
    await context.addCookies([{ name: 'km_session', value: 'kms_e2e', url: origin }]);
}

/** A stand-in signalling server that admits the page alone into an empty room (for the non-call tests). */
async function soloRoom(page: Page) {
    await page.routeWebSocket(/klive\.dev/, ws => ws.close({ code: 1000 }));
    await page.routeWebSocket(/\/klivechat\/ws/, ws => {
        const url = new URL(ws.url());
        ws.send(JSON.stringify({
            type: 'room-info',
            payload: {
                protocol: 2, roomId: url.searchParams.get('roomId'), roomName: 'Klives\'s room', clientId: 'aaaa000000000001', users: [], resumed: false,
                room: { id: url.searchParams.get('roomId'), name: "Klives's room", createdBy: 'Klives', createdUtc: new Date().toISOString(), persistent: false, locked: false },
                self: { id: 'aaaa000000000001', name: 'Klives', rank: 5, isGuest: false, isMuted: false, hasVideo: false, isScreenSharing: false, canModerate: true, isHost: true, connected: true },
                chat: [], iceServers: [], serverTime: new Date().toISOString(),
            },
        }));
        ws.onMessage(() => { /* media-state, pings */ });
    });
}

/**
 * Navigates and waits for `ready`. On this Windows machine a cold dev-server page load sometimes fails to fetch
 * one of its hundreds of modules (net::ERR_NO_BUFFER_SPACE) and never hydrates; such a page gets one reload.
 */
async function gotoReady(page: Page, url: string, ready: string) {
    await page.goto(url);
    try {
        await page.locator(ready).first().waitFor({ timeout: 40_000 });
    } catch {
        await page.reload();
        await page.locator(ready).first().waitFor({ timeout: 60_000 });
    }
}

const openRoom = (page: Page) => gotoReady(page, `/shared/klivechat/${ROOM_ID}`, '.kc-join');

test('lobby: live room list, create-and-join, manage menu', async ({ page, context }) => {
    await signIn(context);
    const api = await mockApi(page, 'klives');
    let lobby: WebSocketRoute | null = null;
    await page.routeWebSocket(/klive\.dev/, ws => ws.close({ code: 1000 }));
    await page.routeWebSocket(/\/klivechat\/lobby/, ws => {
        lobby = ws;
        ws.send(JSON.stringify({ type: 'rooms', rooms: api.rooms }));
        ws.onMessage(() => undefined);
    });
    await page.routeWebSocket(/\/KMProfiles\/SessionWatch/, ws => {
        ws.send(JSON.stringify({ type: 'session-state', state: 'SessionActive' }));
        ws.onMessage(() => undefined);
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoReady(page, '/klivechat', '.kc-room');

    const rows = page.locator('.kc-room');
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText('General');
    await expect(rows.first()).toContainText('Sam Carter, Alex Moreno, jordan');
    await expect(page.locator('.ot-top')).toContainText('3 rooms');
    await expect(page.locator('.ot-top')).toContainText('3 in calls');
    await expect(page.locator('.ot-fresh')).toContainText('Live');
    // No explanatory copy: the page is the list and the create box.
    await expect(page.getByText(/command-deck|signal channel|Shareable links/i)).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/lobby.png`, fullPage: true });

    // A push from the server updates the list in place.
    api.rooms[1] = { ...api.rooms[1], userCount: 1, participants: [person('d', 'Sam Carter')], lastActiveUtc: new Date().toISOString() };
    (lobby as WebSocketRoute | null)?.send(JSON.stringify({ type: 'rooms', rooms: api.rooms }));
    await expect(rows.nth(1)).toContainText('live now');

    // Copy link.
    await rows.nth(1).getByTitle('Copy link').click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('/shared/klivechat/movienight');

    // Manage menu: only on rooms you can manage; Keep toggles through /klivechat/update.
    await expect(rows.nth(1).getByTitle('More')).toHaveCount(0);
    await rows.nth(2).getByTitle('More').click();
    await page.screenshot({ path: `${SHOTS}/lobby-menu.png` });
    await page.getByRole('menuitem', { name: 'Keep' }).click();
    await expect.poll(() => api.mutations.some(m => m.startsWith('/klivechat/update?id=standup123') && m.includes('persistent=true'))).toBe(true);

    // Delete asks once, inline.
    await rows.nth(2).getByTitle('More').click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('menuitem', { name: 'Confirm delete' }).click();
    await expect(rows).toHaveCount(2);

    // Create goes straight into the call: no second "Join" click.
    await soloRoom(page);
    await page.getByLabel('New room name').fill('Planning');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/shared\/klivechat\/newroom789$/);
    await expect(page.locator('.kc-controls')).toBeVisible(BOOT);
    expect(api.mutations.some(m => m.startsWith('/klivechat/create?name=Planning'))).toBe(true);
    await expect(page.getByText('Nobody else is here')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/room-alone.png` });

    // Leaving shows an end screen in place, not a redirect.
    await page.getByRole('button', { name: 'Leave' }).click();
    await expect(page.getByRole('heading', { name: 'You left the call' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rejoin' })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/room-left.png` });
});

test('lobby at phone width', async ({ page, context }) => {
    await signIn(context);
    await mockApi(page, 'klives');
    await page.routeWebSocket(/klive\.dev/, ws => ws.close({ code: 1000 }));
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoReady(page, '/klivechat', '.kc-room');
    await expect(page.locator('.kc-room')).toHaveCount(3);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `${SHOTS}/lobby-phone.png`, fullPage: true });
});

test('guest: pre-join, and rooms that are gone', async ({ page }) => {
    await mockApi(page, 'guest');
    await page.routeWebSocket(/klive\.dev/, ws => ws.close({ code: 1000 }));
    await page.setViewportSize({ width: 1280, height: 800 });

    // The directory is for members; guests get a join box.
    await gotoReady(page, '/klivechat', '.kc-joinbox');
    await expect(page.locator('.kc-room')).toHaveCount(0);

    await page.goto(`/shared/klivechat/${ROOM_ID}`);
    await expect(page.getByRole('heading', { name: 'Standup' })).toBeVisible(BOOT);
    await expect(page.getByText("Nobody's in the call")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Join' })).toBeDisabled();
    await page.getByLabel('Name').fill('Sam');
    await expect(page.getByRole('button', { name: 'Join' })).toBeEnabled();
    await expect.poll(() => page.locator('.kc-preview-level span').evaluate(el => getComputedStyle(el).transform)).not.toBe('matrix(0, 0, 0, 1, 0, 0)');
    await page.screenshot({ path: `${SHOTS}/prejoin-guest.png` });

    await page.goto('/shared/klivechat/doesnotexist');
    await expect(page.getByRole('heading', { name: 'Room not found' })).toBeVisible(BOOT);
    await page.screenshot({ path: `${SHOTS}/room-not-found.png` });

    // Links from the old room address still open the room.
    await page.goto(`/klivechat/${ROOM_ID}`);
    await expect(page).toHaveURL(new RegExp(`/shared/klivechat/${ROOM_ID}$`));
    await expect(page.getByRole('heading', { name: 'Standup' })).toBeVisible(BOOT);
});

// ───────────────────────────── the real thing ─────────────────────────────

interface Bridge {
    /** Cuts the page's current signalling connection like a network drop (no close handshake). */
    drop(): void;
    opened(): number;
}

async function bridgeToHost(page: Page): Promise<Bridge> {
    const upstreams: WebSocket[] = [];
    await page.routeWebSocket(/klive\.dev/, ws => ws.close({ code: 1000 }));
    await page.routeWebSocket(/\/klivechat\/ws/, route => {
        const url = new URL(route.url());
        const upstream = new WebSocket(`${HOST}/klivechat/ws${url.search}`);
        const queued: string[] = [];
        upstream.on('open', () => { for (const message of queued.splice(0)) upstream.send(message); });
        upstream.on('message', (data, isBinary) => { try { route.send(isBinary ? (data as Buffer) : data.toString()); } catch { /* page gone */ } });
        upstream.on('close', (code, reason) => {
            const valid = code === 1000 || (code >= 1001 && code <= 1014 && code !== 1005 && code !== 1006) || (code >= 3000 && code <= 4999);
            try { route.close({ code: valid ? code : 4000, reason: valid ? reason.toString() : 'network' }); } catch { /* already closed */ }
        });
        upstream.on('error', () => undefined);
        route.onMessage(message => {
            const text = typeof message === 'string' ? message : message.toString();
            if (upstream.readyState === WebSocket.OPEN) upstream.send(text);
            else queued.push(text);
        });
        route.onClose((code, reason) => {
            try { upstream.close(code && code >= 1000 && code !== 1005 && code !== 1006 ? code : 1000, reason); } catch { /* gone */ }
        });
        upstreams.push(upstream);
    });
    return {
        drop: () => upstreams[upstreams.length - 1]?.terminate(),
        opened: () => upstreams.length,
    };
}

const tile = (page: Page, name: string) => page.locator('.kc-tile.kind-camera', { has: page.locator('.kc-tile-name', { hasText: new RegExp(`^${name}$`) }) });

test('a real call between two browsers', async ({ browser }) => {
    test.skip(!HOST, 'Set KLIVECHAT_HOST (see Omnipotent.Tests/KliveChat/KliveChatE2EHost.cs)');
    const options = { permissions: ['microphone', 'camera', 'clipboard-read', 'clipboard-write'], viewport: { width: 1280, height: 760 } };
    const klivesContext = await browser.newContext(options);
    const samContext = await browser.newContext(options);
    await signIn(klivesContext);
    const klives = await klivesContext.newPage();
    const sam = await samContext.newPage();
    await mockApi(klives, 'klives');
    await mockApi(sam, 'guest');
    await bridgeToHost(klives);
    const samBridge = await bridgeToHost(sam);

    // Klives opens the link and joins from the pre-join screen.
    await openRoom(klives);
    await klives.getByRole('button', { name: 'Join' }).click();
    await expect(klives.locator('.kc-controls')).toBeVisible(BOOT);
    await expect(klives.getByText('Nobody else is here')).toBeVisible();

    // Sam is a guest and picks a name.
    await openRoom(sam);
    await sam.getByLabel('Name').fill('Sam');
    await sam.getByRole('button', { name: 'Join' }).click();

    await expect(tile(klives, 'Sam')).toBeVisible({ timeout: 20_000 });
    await expect(tile(sam, 'Klives')).toBeVisible({ timeout: 20_000 });
    await expect(klives.locator('.kc-top-meta')).toContainText('2');
    // Media is peer-to-peer: the tile stops saying "Connecting" once the connection is up.
    await expect(tile(klives, 'Sam').locator('.kc-tile-status')).toHaveCount(0, { timeout: 25_000 });
    await expect(tile(sam, 'Klives').locator('.kc-tile-status')).toHaveCount(0, { timeout: 25_000 });
    // Chrome's fake microphone beeps: the speaking ring follows the remote audio level.
    await expect(klives.locator('.kc-tile.kind-camera.speaking', { hasText: 'Sam' })).toBeVisible({ timeout: 20_000 });

    // Camera on: frames arrive on the other side.
    await sam.getByTitle('Turn camera on (V)').click();
    await expect.poll(() => tile(klives, 'Sam').locator('video').evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 20_000 }).toBeGreaterThan(0);
    await expect(tile(klives, 'Sam').locator('video')).toBeVisible();
    await klives.screenshot({ path: `${SHOTS}/call-two.png` });

    // Chat: unread badge, then the message with its link.
    await klives.keyboard.press('c');
    await klives.getByLabel('Message').fill('agenda https://example.com/doc.');
    await klives.keyboard.press('Enter');
    await expect(sam.locator('.kc-ctl .kc-badge:not(.quiet)')).toHaveText('1');
    await expect(sam.locator('.kc-chat-preview')).toContainText('agenda');
    await sam.getByTitle('Chat (C)').click();
    const link = sam.locator('.kc-msg-text a').last();
    await expect(link).toHaveAttribute('href', 'https://example.com/doc');
    await sam.getByLabel('Message').fill('on it');
    await sam.keyboard.press('Enter');
    await expect(klives.locator('.kc-msg-text', { hasText: 'on it' }).last()).toBeVisible();
    await klives.screenshot({ path: `${SHOTS}/call-chat.png` });

    // Screen share runs alongside the camera; the viewer's stage switches to it on its own.
    await sam.getByTitle('Chat (C)').click(); // close Sam's chat again
    await klives.keyboard.press('Escape');
    await klives.keyboard.press('s');
    await expect(klives.locator('.kc-tile.kind-screen', { hasText: 'Your screen' })).toBeVisible();
    await expect(klives.locator('.kc-stage.presenting')).toHaveCount(0); // your own share doesn't take your stage
    const shared = sam.locator('.kc-focus .kc-tile.kind-screen');
    await expect(shared).toContainText("Klives's screen", { timeout: 20_000 });
    await expect.poll(() => shared.locator('video').evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 20_000 }).toBeGreaterThan(0);
    await expect(shared.locator('.kc-tile-label .kc-icon')).toHaveCount(2); // screen + its audio
    await expect(tile(sam, 'Klives')).toBeVisible(); // camera tile moves to the strip
    await sam.screenshot({ path: `${SHOTS}/call-presenting.png` });
    await sam.setViewportSize({ width: 390, height: 844 });
    await sam.screenshot({ path: `${SHOTS}/call-presenting-phone.png` });
    await sam.setViewportSize({ width: 1280, height: 760 });
    await shared.getByTitle('Unpin').click();
    await expect(sam.locator('.kc-stage.presenting')).toHaveCount(0);
    await klives.keyboard.press('s');
    await expect(sam.locator('.kc-tile.kind-screen')).toHaveCount(0, { timeout: 10_000 });

    // A network drop on Sam's side: same seat comes back, nobody sees Sam leave, media keeps flowing.
    const before = samBridge.opened();
    samBridge.drop();
    await expect.poll(() => samBridge.opened(), { timeout: 15_000 }).toBeGreaterThan(before);
    await expect(sam.locator('.kc-top .ot-chip.warn')).toHaveCount(0, { timeout: 15_000 });
    await klives.waitForTimeout(1500);
    await expect(klives.locator('.kc-chat-system', { hasText: 'Sam left' })).toHaveCount(0);
    await expect(tile(klives, 'Sam').locator('.kc-tile-status')).toHaveCount(0);
    await expect.poll(() => tile(klives, 'Sam').locator('video').evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0);

    // Moderation from the people panel: Klives (the host) mutes Sam.
    await klives.getByTitle('People (P)').click();
    await klives.locator('.kc-person-row', { hasText: 'Sam' }).click();
    await klives.screenshot({ path: `${SHOTS}/call-people.png` });
    await klives.getByRole('button', { name: 'Mute', exact: true }).click();
    await expect(sam.locator('.kc-notice')).toContainText('Klives muted you');
    await expect(sam.getByTitle('Unmute (M)')).toBeVisible();
    await expect(tile(klives, 'Sam').locator('.kc-muted-icon')).toBeVisible();

    // Removing takes two clicks and ends the call for Sam in place.
    await klives.getByRole('button', { name: 'Remove' }).click();
    await klives.getByRole('button', { name: 'Confirm remove' }).click();
    await expect(sam.getByRole('heading', { name: 'Klives removed you from the call' })).toBeVisible();
    await expect(tile(klives, 'Sam')).toHaveCount(0);
    await sam.screenshot({ path: `${SHOTS}/call-removed.png` });

    // Rejoin works (a kick isn't a ban); then a normal leave is seen at once, well inside the reconnect grace.
    await sam.getByRole('button', { name: 'Rejoin' }).click();
    await expect(tile(klives, 'Sam')).toBeVisible({ timeout: 20_000 });
    await sam.getByRole('button', { name: 'Leave' }).click();
    await expect(sam.getByRole('heading', { name: 'You left the call' })).toBeVisible();
    await expect(tile(klives, 'Sam')).toHaveCount(0, { timeout: 5_000 });

    await klivesContext.close();
    await samContext.close();
});
