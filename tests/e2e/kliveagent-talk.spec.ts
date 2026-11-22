import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';
import { openDashboard } from './fixtures/dashboard-api';

/**
 * Talk mode on GPT-Live, end to end in a real Chromium with a real WebRTC call.
 *
 * OpenAI is played by a second RTCPeerConnection inside the page (window.__fakeLive): it answers the
 * page's offer, sends a tone as "the voice", and speaks GPT-Live's data-channel events (session.started,
 * transcripts). KliveAgent's /kliveagent/voice socket is mocked: it relays the offer to the fake peer
 * and answers with what the server sends (the answer, the delegated turn, state, usage).
 *
 * Checks: the page sends a real SDP offer and applies the answer; transcripts become captions; a
 * delegated turn lands in the conversation as a spoken message and its run's reply follows; the voice
 * speaking is noticed and the latency reported; Escape asks the server to hush the voice; mute and
 * hang-up reach GPT-Live over the data channel; a new voice starts a new call; the mode survives a reload.
 */

const API = 'https://klive.dev';

test.describe.configure({ timeout: 120_000 });
test.use({
    launchOptions: {
        args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            '--autoplay-policy=no-user-gesture-required',
            // Two peers in one page find each other by their real local addresses, not mDNS names.
            '--disable-features=WebRtcHideLocalIpsWithMdns',
        ],
    },
    permissions: ['microphone'],
});

/** OpenAI's side of the call, inside the page. */
async function installFakeLive(page: Page) {
    await page.addInitScript(() => {
        const live: any = { received: [] as any[], channel: null as RTCDataChannel | null, peers: 0 };
        live.answer = async (offer: string) => {
            const peer = new RTCPeerConnection();
            live.peers += 1;
            const ctx = new AudioContext();
            const tone = ctx.createOscillator();
            const gain = ctx.createGain();
            gain.gain.value = 0;
            const out = ctx.createMediaStreamDestination();
            tone.connect(gain).connect(out);
            tone.start();
            live.speak = (on: boolean) => { gain.gain.value = on ? 0.5 : 0; };
            out.stream.getTracks().forEach(track => peer.addTrack(track, out.stream));
            peer.ondatachannel = event => {
                live.channel = event.channel;
                event.channel.onmessage = e => live.received.push(JSON.parse(e.data));
                event.channel.onopen = () => live.send({ type: 'session.started', event_id: 'e0', session: { id: 'live_e2e', status: 'active' } });
            };
            await peer.setRemoteDescription({ type: 'offer', sdp: offer });
            await peer.setLocalDescription(await peer.createAnswer());
            await new Promise<void>(resolve => {
                if (peer.iceGatheringState === 'complete') return resolve();
                const timer = setTimeout(resolve, 3000);
                peer.addEventListener('icegatheringstatechange', () => {
                    if (peer.iceGatheringState === 'complete') { clearTimeout(timer); resolve(); }
                });
            });
            return peer.localDescription!.sdp;
        };
        live.send = (event: any) => { if (live.channel?.readyState === 'open') live.channel.send(JSON.stringify(event)); };
        (window as any).__fakeLive = live;
    });
}

interface FakeVoiceServer {
    messages: any[];
    urls: string[];
    offers: any[];
    socket: WebSocketRoute | null;
}

async function mockVoiceSocket(page: Page): Promise<FakeVoiceServer> {
    const server: FakeVoiceServer = { messages: [], urls: [], offers: [], socket: null };
    await page.routeWebSocket(/\/kliveagent\/(voice|talk)/, (ws: WebSocketRoute) => {
        server.urls.push(ws.url());
        server.socket = ws;
        ws.send(JSON.stringify({
            t: 'ready', conversationId: 'conv',
            settings: { model: 'gpt-live-1.1', voice: 'marin', voices: ['marin', 'cedar', 'sage'], idleSeconds: 20, thinking: 'low' },
        }));
        ws.onMessage(async message => {
            if (typeof message !== 'string') return;
            const m = JSON.parse(message);
            server.messages.push(m);
            if (m.t === 'offer') {
                server.offers.push(m);
                const sdp = await page.evaluate(offer => (window as any).__fakeLive.answer(offer), m.sdp as string);
                ws.send(JSON.stringify({ t: 'answer', sdp, sessionId: 'live_e2e', model: 'gpt-live-1.1', voice: m.voice ?? 'marin' }));
            }
        });
    });
    return server;
}

/** What the server says once GPT-Live has delegated "Check the trader." to KliveAgent. */
function delegate(server: FakeVoiceServer) {
    const ws = server.socket!;
    ws.send(JSON.stringify({ t: 'delegation', id: 'item_1' }));
    ws.send(JSON.stringify({ t: 'heard', text: 'Check the trader.' }));
    ws.send(JSON.stringify({ t: 'turn', text: 'Check the trader.', clientMessageId: 'spk_e2e_turn_one', requestId: 'talk-run', steering: false, accepted: true }));
    ws.send(JSON.stringify({ t: 'state', state: 'tool', detail: 'running read_trader' }));
    ws.send(JSON.stringify({ t: 'said', text: 'The trader is up and trading normally.' }));
    ws.send(JSON.stringify({ t: 'state', state: 'listening' }));
    ws.send(JSON.stringify({ t: 'usage', seconds: 30, costUsd: 0.025, final: false }));
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

const liveReceived = (page: Page) => page.evaluate(() => (window as any).__fakeLive.received.map((e: any) => e.type) as string[]);

test('a spoken conversation runs over WebRTC with GPT-Live, and KliveAgent answers through it', async ({ page }) => {
    await openDashboard(page, 'Klives');
    await installFakeLive(page);
    const server = await mockVoiceSocket(page);
    await mockRun(page);
    await openKliveAgent(page);

    const toggle = page.getByTestId('talk-toggle');
    await expect(toggle).toBeEnabled({ timeout: 30_000 });
    await toggle.click();
    await expect(page.getByTestId('talk-bar')).toBeVisible();

    // The voice socket names the conversation; the old Whisper/Kokoro socket is never opened.
    await expect.poll(() => server.urls.length).toBeGreaterThan(0);
    const url = new URL(server.urls[0]);
    expect(url.pathname).toBe('/kliveagent/voice');
    expect(url.searchParams.get('conversationId')).toMatch(/^conv_/);

    // A real SDP offer goes up (microphone and the oai-events data channel), and the answer connects.
    await expect.poll(() => server.offers.length, { timeout: 20_000 }).toBe(1);
    expect(server.offers[0].sdp).toMatch(/^v=0\r\n/);
    expect(server.offers[0].sdp).toContain('m=audio');
    expect(server.offers[0].sdp).toContain('m=application');
    await expect(page.getByTestId('talk-state')).toContainText('Listening', { timeout: 20_000 });

    // GPT-Live hears him: the transcript is the caption.
    await page.evaluate(() => {
        const live = (window as any).__fakeLive;
        live.send({ type: 'session.input_transcript.delta', event_id: 'e1', delta: 'Check', start_ms: 0, end_ms: 300 });
        live.send({ type: 'session.input_transcript.delta', event_id: 'e2', delta: ' the trader.', start_ms: 300, end_ms: 900 });
    });
    await expect(page.getByTestId('talk-caption')).toContainText('Check the trader.');

    // The delegated turn lands in the conversation as a spoken message, and its run's reply follows.
    delegate(server);
    const chat = page.getByTestId('kax-thread');
    await expect(chat).toContainText('Check the trader.');
    await expect(chat.locator('[data-testid="msg-user"] [data-testid="msg-spoken"]')).toHaveCount(1);
    await expect(chat).toContainText('The trader is up and trading normally.');
    await expect(page.getByTestId('talk-usage')).toContainText('0.5 min · $0.03');

    // The voice answers (audio and its transcript): the page notices and reports the latency.
    await page.evaluate(() => {
        const live = (window as any).__fakeLive;
        live.speak(true);
        live.send({ type: 'session.output_transcript.delta', event_id: 'e3', delta: 'The trader is up.', start_ms: 1500, end_ms: 2600 });
    });
    await expect.poll(() => server.messages.find(m => m.t === 'first_audio'), { timeout: 15_000 }).toBeTruthy();
    await expect(page.getByTestId('talk-state')).toContainText('Speaking');
    await expect(page.getByTestId('talk-caption')).toContainText('The trader is up.'); // the voice's words while it speaks

    // Escape asks the server to hush the voice.
    await page.keyboard.press('Escape');
    await expect.poll(() => server.messages.some(m => m.t === 'hush')).toBe(true);
    await page.evaluate(() => (window as any).__fakeLive.speak(false));

    // Mute reaches GPT-Live over the data channel.
    await page.getByTestId('talk-mute').click();
    await expect.poll(() => liveReceived(page)).toContain('session.input_audio.mute');
    await page.getByTestId('talk-mute').click();
    await expect.poll(() => liveReceived(page)).toContain('session.input_audio.unmute');

    // Settings list GPT-Live's voices; a new voice is a new call with that voice.
    await page.getByTestId('talk-settings').click();
    await expect(page.getByTestId('talk-settings-panel')).toContainText('cedar');
    await expect(page.getByTestId('talk-settings-panel')).toContainText('gpt-live-1.1');
    await page.getByTestId('talk-voice').selectOption('cedar');
    await expect.poll(() => server.offers.length, { timeout: 20_000 }).toBe(2);
    expect(server.offers[1].voice).toBe('cedar');

    // Back to typing hangs up; the remembered mode survives a reload (waiting for a tap, as audio needs one).
    await expect(page.getByTestId('talk-state')).toContainText('Listening', { timeout: 20_000 });
    await page.getByTestId('talk-exit').click();
    await expect.poll(() => liveReceived(page)).toContain('session.close');
    await expect(chat.locator('textarea')).toBeVisible();
    await page.keyboard.press('Control+.');
    await expect(page.getByTestId('talk-bar')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('talk-toggle')).toHaveClass(/is-resumable/, { timeout: 30_000 });
});

test('a voice the server cannot start is reported, not retried forever', async ({ page }) => {
    await openDashboard(page, 'Klives');
    await page.routeWebSocket(/\/kliveagent\/voice/, ws => {
        ws.send(JSON.stringify({
            t: 'ready', conversationId: 'conv', settings: { model: 'gpt-live-1.1', voice: 'marin', voices: ['marin'] },
            unavailable: 'The OpenAI router is switched off on the KliveLLM page.',
        }));
    });
    await openKliveAgent(page);
    await expect(page.getByTestId('talk-toggle')).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId('talk-toggle').click();
    await expect(page.getByText('The OpenAI router is switched off')).toBeVisible({ timeout: 15_000 });
});
