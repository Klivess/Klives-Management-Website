import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';
import { openDashboard } from './fixtures/dashboard-api';

/**
 * Talk mode end to end in a real Chromium: a fake microphone "speaks" (a 1.2 s chord, then silence,
 * looped), the page detects the turn, streams it, and commits it; a mocked talk socket plays the
 * server's part (provisional transcript, accepted turn, a spoken reply). Checks the protocol the page
 * speaks, that the turn and its reply land in the conversation, that the reply is played (first-audio
 * report) and cut off when Klives talks over it, and that the mode survives a reload.
 *
 * The loudness detector is forced for the conversation tests (a chord is not speech to Silero); a
 * separate test checks that the Silero model and its runtime load from /talk/.
 */

const API = 'https://klive.dev';

function wav(samples: Float32Array, rate: number): Buffer {
    const data = Buffer.alloc(samples.length * 2);
    for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + data.length, 4);
    header.write('WAVEfmt ', 8);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(rate, 24);
    header.writeUInt32LE(rate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(data.length, 40);
    return Buffer.concat([header, data]);
}

function chord(seconds: number, rate: number, silenceAfter = 0): Float32Array {
    const out = new Float32Array(Math.round((seconds + silenceAfter) * rate));
    for (let i = 0; i < Math.round(seconds * rate); i++) {
        const t = i / rate;
        out[i] = 0.18 * Math.sin(2 * Math.PI * 220 * t) + 0.12 * Math.sin(2 * Math.PI * 330 * t);
    }
    return out;
}

const VOICE = resolve(tmpdir(), 'kliveagent-talk-e2e-voice.wav');
mkdirSync(resolve(VOICE, '..'), { recursive: true });
writeFileSync(VOICE, wav(chord(1.2, 48_000, 2.8), 48_000));

// A five-second "reply", long enough to still be playing when the microphone loop speaks again.
const REPLY = wav(chord(5, 24_000), 24_000);

test.describe.configure({ timeout: 120_000 });
test.use({
    launchOptions: {
        args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            `--use-file-for-fake-audio-capture=${VOICE}`,
            '--autoplay-policy=no-user-gesture-required',
        ],
    },
    permissions: ['microphone'],
});

interface FakeTalkServer {
    messages: any[];
    audioFrames: number;
    urls: string[];
}

async function mockTalkSocket(page: Page): Promise<FakeTalkServer> {
    const server: FakeTalkServer = { messages: [], audioFrames: 0, urls: [] };
    await page.routeWebSocket(/\/kliveagent\/talk/, (ws: WebSocketRoute) => {
        server.urls.push(ws.url());
        let turns = 0;
        ws.send(JSON.stringify({ t: 'ready', conversationId: 'conv', settings: { voice: 'bm_george', speed: 1, format: 'wav' } }));
        ws.send(JSON.stringify({ t: 'voices', voices: [{ id: 'bm_george', name: 'George' }, { id: 'af_heart', name: 'Heart' }] }));
        ws.onMessage(message => {
            if (typeof message !== 'string') {
                server.audioFrames += 1;
                return;
            }
            const m = JSON.parse(message);
            server.messages.push(m);
            if (m.t === 'pause') ws.send(JSON.stringify({ t: 'partial', utt: m.utt, text: 'Check the trader.', hint: 'complete' }));
            if (m.t === 'commit' && turns === 0) {
                turns += 1;
                ws.send(JSON.stringify({ t: 'timing', utt: m.utt, endpointMs: m.endpointMs, sttMs: 0, sttReused: true }));
                ws.send(JSON.stringify({ t: 'turn', utt: m.utt, text: 'Check the trader.', clientMessageId: 'spk_e2e_turn_one', requestId: 'talk-run', steering: false, accepted: true }));
                ws.send(JSON.stringify({ t: 'turn_start', turn: 1 }));
                ws.send(JSON.stringify({ t: 'segment', turn: 1, seq: 1, text: 'The trader is up and trading normally.', format: 'wav', ms: 5000 }));
                const frame = Buffer.alloc(5 + REPLY.length);
                frame[0] = 0x01;
                frame.writeUInt16BE(1, 1);
                frame.writeUInt16BE(1, 3);
                REPLY.copy(frame, 5);
                ws.send(frame);
                ws.send(JSON.stringify({ t: 'turn_end', turn: 1, spoken: 'The trader is up and trading normally.' }));
            }
        });
    });
    return server;
}

/** The dev server occasionally aborts the first navigation to a cold page; one retry tells that
 *  transport hiccup apart from a page that really fails to load (as openDashboard does). */
async function openKliveAgent(page: Page) {
    for (let attempt = 0; ; attempt++) {
        try {
            await page.goto('/kliveagent', { waitUntil: 'domcontentloaded' });
            return;
        } catch (error) {
            if (attempt >= 1 || !String(error).includes('ERR_ABORTED')) throw error;
        }
    }
}

async function mockRun(page: Page) {
    const headers = { 'access-control-allow-origin': '*', 'content-type': 'application/json', 'access-control-expose-headers': 'X-Klive-Pending-Wait', 'X-Klive-Pending-Wait': 'supported' };
    await page.route(`${API}/kliveagent/chat/pending**`, route => route.fulfill({
        headers,
        body: JSON.stringify({
            requestId: 'talk-run', sequence: 2, status: 'Completed', response: 'The trader is up and trading normally.',
            finalResponse: { response: 'The trader is up and trading normally.' },
        }),
    }));
}

test('a spoken turn is detected, streamed, answered aloud and can be talked over', async ({ page }) => {
    await openDashboard(page, 'Klives');
    await page.addInitScript(() => { (window as any).__kliveTalkVad = 'energy'; });
    const server = await mockTalkSocket(page);
    await mockRun(page);
    await openKliveAgent(page);

    const toggle = page.getByTestId('talk-toggle');
    await expect(toggle).toBeEnabled({ timeout: 30_000 });
    await toggle.click();
    await expect(page.getByTestId('talk-bar')).toBeVisible();

    // The socket names the conversation and carries the credential the way every KliveAPI socket does.
    await expect.poll(() => server.urls.length).toBeGreaterThan(0);
    const url = new URL(server.urls[0]);
    expect(url.searchParams.get('conversationId')).toMatch(/^conv_/);
    expect(url.searchParams.get('format')).toBe('wav');

    // Turn-taking: start, audio while speaking, a pause (answered with a provisional transcript), a commit.
    await expect.poll(() => server.messages.map(m => m.t), { timeout: 20_000 })
        .toEqual(expect.arrayContaining(['speech_start', 'pause', 'commit']));
    expect(server.audioFrames).toBeGreaterThan(20); // ~32 ms frames for over a second of "speech"
    const commit = server.messages.find(m => m.t === 'commit');
    expect(commit.endpointMs).toBeGreaterThanOrEqual(256);
    expect(commit.endpointMs).toBeLessThan(1200);

    // The turn lands in the conversation as a spoken message, and its run's reply follows.
    const chat = page.locator('.chat-panel');
    await expect(chat).toContainText('Check the trader.');
    await expect(chat.locator('.msg-user .msg-spoken')).toHaveCount(1);
    await expect(chat).toContainText('The trader is up and trading normally.');

    // The reply is played (the page reports when its first audio started)...
    await expect.poll(() => server.messages.find(m => m.t === 'first_audio'), { timeout: 15_000 }).toBeTruthy();
    // ...and when the microphone "speaks" again over it, the reply is cut off and reported.
    await expect.poll(() => server.messages.find(m => m.t === 'interrupt'), { timeout: 15_000 })
        .toMatchObject({ t: 'interrupt', turn: 1 });

    // Settings show the voices the server offered.
    await page.getByTestId('talk-settings').click();
    await expect(page.getByTestId('talk-settings-panel')).toContainText('George');
    await expect(page.getByTestId('talk-settings-panel')).toContainText('loudness');

    // Back to typing, and the remembered mode survives a reload (waiting for a tap, as audio needs one).
    await page.getByTestId('talk-exit').click();
    await expect(chat.locator('textarea')).toBeVisible();
    await page.keyboard.press('Control+.');
    await expect(page.getByTestId('talk-bar')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('talk-toggle')).toHaveClass(/is-resumable/, { timeout: 30_000 });
});

test('hold-to-talk commits the moment the key is released', async ({ page }) => {
    await openDashboard(page, 'Klives');
    await page.addInitScript(() => {
        (window as any).__kliveTalkVad = 'energy';
        localStorage.setItem('kliveagent.talk:v1', JSON.stringify({ handsFree: false }));
    });
    const server = await mockTalkSocket(page);
    await mockRun(page);
    await openKliveAgent(page);
    await expect(page.getByTestId('talk-toggle')).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId('talk-toggle').click();
    await expect(page.getByTestId('talk-state')).toContainText('Hold Space', { timeout: 15_000 });

    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()); // Space is not typing
    await page.keyboard.down('Space');
    await page.waitForTimeout(900);
    await page.keyboard.up('Space');

    await expect.poll(() => server.messages.find(m => m.t === 'commit'), { timeout: 10_000 }).toMatchObject({ endpointMs: 0 });
    expect(server.messages.filter(m => m.t === 'speech_start')).toHaveLength(1);
});

test('the Silero speech detector loads from this site', async ({ page }) => {
    await openDashboard(page, 'Klives');
    await mockTalkSocket(page);
    const assets: string[] = [];
    page.on('request', request => {
        const url = new URL(request.url());
        if (url.pathname.startsWith('/talk/')) assets.push(url.pathname);
    });
    await openKliveAgent(page);
    await expect(page.getByTestId('talk-toggle')).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId('talk-toggle').click();
    await page.getByTestId('talk-settings').click();
    await expect(page.getByTestId('talk-settings-panel')).toContainText('Silero VAD', { timeout: 45_000 });
    expect(assets).toEqual(expect.arrayContaining(['/talk/ort.wasm.min.js', '/talk/vad.bundle.min.js', '/talk/silero_vad_v5.onnx']));
});
