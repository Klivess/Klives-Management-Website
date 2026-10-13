/* Talk mode: a hands-free spoken conversation with KliveAgent over one WebSocket.

   Mic → voice-activity detector → turn-taking (endpointer) → 16 kHz PCM streamed while Klives speaks.
   Server → transcripts, state, and the reply as synthesised segments, played back to back.

   Browser APIs are only touched inside start() and the handlers it installs, so this is SSR-safe. */

import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { BuildKliveWsUrl } from '~/scripts/APIInterface';
import { describeMediaError } from '~/scripts/klivechat/call';
import { DEFAULT_ENDPOINTER, Endpointer, HEADPHONE_BARGE_IN, toPcm16, type EndpointerEvent } from '~/scripts/talk/endpointer';
import { startDetector, type Detector } from '~/scripts/talk/detector';
import { TalkPlayer } from '~/scripts/talk/player';
import { DEFAULT_TALK_PREFS, loadTalkPrefs, saveTalkPrefs, type TalkPrefs } from '~/scripts/talk/prefs';

export type TalkState = 'off' | 'starting' | 'connecting' | 'listening' | 'hearing' | 'transcribing'
    | 'thinking' | 'tool' | 'speaking' | 'error';

export interface TalkTurnEvent {
    utt: number;
    text: string;
    clientMessageId: string;
    requestId: string | null;
    steering: boolean;
    accepted: boolean;
    error?: string | null;
    resubmitOf?: string | null;
}

export interface TalkTiming {
    endpointMs?: number;
    sttMs?: number;
    sttReused?: boolean;
    firstAudioMs?: number;
}

export interface TalkHandlers {
    /** A spoken turn reached the agent: show it, and follow its run. */
    onTurn?: (event: TalkTurnEvent) => void;
    /** A local command ("stop", "say that again") was handled without the agent. */
    onCommand?: (command: string, text: string) => void;
}

const RECONNECT_DELAYS_MS = [500, 1000, 2000, 5000, 10000];
const FILLER_AFTER_MS = 1200;

export function useTalkMode(handlers: TalkHandlers = {}) {
    const prefs = reactive<TalkPrefs>({ ...DEFAULT_TALK_PREFS });
    const active = ref(false);
    const connected = ref(false);
    const state = ref<TalkState>('off');
    const detail = ref('');
    const caption = ref('');
    const captionFinal = ref(false);
    const micLevel = ref(0);
    const voiceLevel = ref(0);
    const error = ref('');
    const muted = ref(false);
    const pttHeld = ref(false);
    const voices = ref<{ id: string; name: string }[]>([]);
    const serverSettings = ref<Record<string, unknown> | null>(null);
    const detectorKind = ref<'' | 'silero' | 'energy'>('');
    const timing = ref<TalkTiming | null>(null);

    const endpointer = new Endpointer();
    let ctx: AudioContext | null = null;
    let player: TalkPlayer | null = null;
    let stream: MediaStream | null = null;
    let detector: Detector | null = null;
    let socket: WebSocket | null = null;
    let conversationId = '';
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    let uiTimer: ReturnType<typeof setInterval> | null = null;
    let bufferTimer: ReturnType<typeof setInterval> | null = null;
    let fillerTimer: ReturnType<typeof setTimeout> | null = null;
    let takenOver = false;
    const segmentMeta = new Map<string, string>();
    let currentTurn = 0;
    let audibleTurn = 0;
    let fillerTurn = 0;
    let lastCommitAt = 0;
    let awaitingFirstAudio = false;

    onMounted(() => Object.assign(prefs, loadTalkPrefs()));
    onBeforeUnmount(() => {
        void stop();
        try { void ctx?.close(); } catch { /* closed */ }
        ctx = null;
        player = null;
    });

    // ── Lifecycle ──

    /** Must be called from a click or key press: that gesture is what lets audio play. */
    async function start(forConversation: string) {
        if (active.value) {
            if (forConversation !== conversationId) switchConversation(forConversation);
            return;
        }
        error.value = '';
        takenOver = false;
        active.value = true;
        state.value = 'starting';
        conversationId = forConversation;
        try {
            ctx ??= new AudioContext();
            const resumed = ctx.resume();
            if (!player) {
                player = new TalkPlayer(ctx);
                player.onTurnAudible = onTurnAudible;
                player.onIdle = onPlaybackIdle;
            }
            await resumed;
            stream = await acquireMic();
            if (!active.value) { releaseMic(); return; }
            const prefer = (window as unknown as { __kliveTalkVad?: 'silero' | 'energy' }).__kliveTalkVad;
            detector = await startDetector({ ctx, stream, onFrame, prefer });
            detectorKind.value = detector.kind;
            if (!active.value) { await detector.stop(); detector = null; releaseMic(); return; }
            applyEndpointerPrefs();
            connect();
            uiTimer = setInterval(() => { voiceLevel.value = player?.level() ?? 0; }, 60);
            bufferTimer = setInterval(() => {
                if (player?.playing) send({ t: 'buffer', aheadMs: Math.round(player.aheadMs) });
            }, 250);
        } catch (e) {
            error.value = e instanceof Error ? e.message : String(e);
            await stop();
            state.value = 'error';
        }
    }

    async function stop() {
        active.value = false;
        connected.value = false;
        if (state.value !== 'error') state.value = 'off';
        caption.value = '';
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        if (uiTimer) { clearInterval(uiTimer); uiTimer = null; }
        if (bufferTimer) { clearInterval(bufferTimer); bufferTimer = null; }
        if (fillerTimer) { clearTimeout(fillerTimer); fillerTimer = null; }
        player?.stop();
        endpointer.reset();
        const closing = socket;
        socket = null;
        try { closing?.close(1000, 'talk mode off'); } catch { /* closed */ }
        if (detector) { await detector.stop(); detector = null; }
        releaseMic();
        micLevel.value = 0;
        voiceLevel.value = 0;
    }

    async function acquireMic(): Promise<MediaStream> {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Media devices need HTTPS.');
        const constraints = (deviceId: string | null): MediaTrackConstraints => ({
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
        });
        try {
            return await navigator.mediaDevices.getUserMedia({ audio: constraints(prefs.micId) });
        } catch (first) {
            const name = (first as { name?: string })?.name;
            if (prefs.micId && (name === 'OverconstrainedError' || name === 'NotFoundError')) {
                try { return await navigator.mediaDevices.getUserMedia({ audio: constraints(null) }); }
                catch (second) { throw new Error(describeMediaError(second, 'microphone')); }
            }
            throw new Error(describeMediaError(first, 'microphone'));
        }
    }

    function releaseMic() {
        stream?.getTracks().forEach(track => track.stop());
        stream = null;
    }

    // ── Socket ──

    function connect() {
        if (!active.value) return;
        state.value = connected.value ? state.value : 'connecting';
        const url = BuildKliveWsUrl('/kliveagent/talk', {
            conversationId,
            voice: prefs.voice,
            speed: prefs.speed,
            format: 'wav',
        });
        const ws = new WebSocket(url);
        ws.binaryType = 'arraybuffer';
        socket = ws;
        ws.onmessage = event => {
            if (socket !== ws) return;
            if (typeof event.data === 'string') onMessage(event.data);
            else onBinary(event.data as ArrayBuffer);
        };
        ws.onclose = event => {
            if (socket !== ws) return;
            socket = null;
            connected.value = false;
            endpointer.reset();
            if (!active.value || takenOver) return;
            if (event.code === 4003 || event.code === 4403 || event.code === 4400) {
                error.value = event.reason || 'Talk mode is not available.';
                void stop().then(() => { state.value = 'error'; });
                return;
            }
            state.value = 'connecting';
            const delay = RECONNECT_DELAYS_MS[Math.min(reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
            reconnectAttempt += 1;
            reconnectTimer = setTimeout(connect, delay);
        };
    }

    function switchConversation(next: string) {
        conversationId = next;
        player?.stop();
        endpointer.reset();
        const old = socket;
        socket = null;
        connected.value = false;
        try { old?.close(1000, 'conversation changed'); } catch { /* closed */ }
        connect();
    }

    function send(payload: Record<string, unknown>) {
        if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
    }

    function sendAudio(utt: number, frame: Float32Array) {
        if (socket?.readyState !== WebSocket.OPEN) return;
        const pcm = toPcm16(frame);
        const message = new Uint8Array(3 + pcm.byteLength);
        message[0] = 0x02;
        message[1] = (utt >> 8) & 0xff;
        message[2] = utt & 0xff;
        message.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), 3);
        socket.send(message);
    }

    function onMessage(raw: string) {
        let m: any;
        try { m = JSON.parse(raw); } catch { return; }
        switch (m.t) {
            case 'ready':
                connected.value = true;
                reconnectAttempt = 0;
                serverSettings.value = m.settings ?? null;
                player?.resetTurns();
                currentTurn = audibleTurn = fillerTurn = 0;
                segmentMeta.clear();
                state.value = 'listening';
                break;
            case 'voices':
                voices.value = Array.isArray(m.voices) ? m.voices : [];
                break;
            case 'partial':
                if (m.utt === endpointer.utterance && endpointer.speaking) {
                    caption.value = m.text;
                    captionFinal.value = false;
                    endpointer.setHint(m.utt, m.hint);
                }
                break;
            case 'turn':
                caption.value = m.text;
                captionFinal.value = true;
                handlers.onTurn?.(m as TalkTurnEvent);
                break;
            case 'state':
                applyServerState(m.state, m.detail);
                break;
            case 'tool':
                if (m.phase === 'start') scheduleFiller();
                break;
            case 'turn_start':
                currentTurn = m.turn;
                player?.beginTurn(m.turn);
                break;
            case 'segment':
                if (m.skipped) void player?.enqueue(m.turn, m.seq, m.text ?? '', null);
                else segmentMeta.set(`${m.turn}:${m.seq}`, m.text ?? '');
                break;
            case 'turn_end':
                if (!player?.playing && state.value !== 'hearing') state.value = 'listening';
                break;
            case 'timing':
                timing.value = { ...(timing.value ?? {}), endpointMs: m.endpointMs, sttMs: m.sttMs, sttReused: m.sttReused, firstAudioMs: undefined };
                break;
            case 'discarded':
                caption.value = '';
                if (state.value === 'transcribing') state.value = 'listening';
                break;
            case 'command':
                handlers.onCommand?.(m.command, m.text);
                break;
            case 'stop_audio':
                player?.stop();
                endpointer.setPlaying(false);
                break;
            case 'error':
                error.value = m.message || 'Something went wrong.';
                break;
            case 'closed':
                takenOver = true;
                error.value = m.reason || 'Talk mode moved to another tab.';
                void stop();
                break;
        }
    }

    function onBinary(data: ArrayBuffer) {
        const bytes = new Uint8Array(data);
        if (bytes.length < 3 || !player) return;
        const view = new DataView(data);
        if (bytes[0] === 0x01 && bytes.length > 5) {
            const turn = view.getUint16(1);
            const seq = view.getUint16(3);
            const key = `${turn}:${seq}`;
            const text = segmentMeta.get(key) ?? '';
            segmentMeta.delete(key);
            void player.enqueue(turn, seq, text, data.slice(5));
        } else if (bytes[0] === 0x03) {
            void player.setFiller(view.getUint16(1), data.slice(3));
        }
    }

    function applyServerState(next: TalkState, nextDetail?: string) {
        detail.value = nextDetail ?? '';
        // While audio plays the face of the conversation is "speaking", whatever the run is doing.
        if (player?.playing && next !== 'hearing') return;
        if (endpointer.speaking && next !== 'transcribing') return;
        state.value = next;
    }

    // ── Audio in ──

    function onFrame(probability: number, frame: Float32Array) {
        let sum = 0;
        for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
        micLevel.value = Math.min(1, Math.sqrt(sum / frame.length) * 6);
        if (!connected.value || muted.value) return;
        endpointer.setPlaying(!!player?.playing);
        handle(endpointer.process(probability, frame));
    }

    function handle(events: EndpointerEvent[]) {
        for (const event of events) {
            switch (event.type) {
                case 'bargeIn':
                    interrupt();
                    break;
                case 'start':
                    send({ t: 'speech_start', utt: event.utt });
                    caption.value = '';
                    captionFinal.value = false;
                    state.value = 'hearing';
                    break;
                case 'audio':
                    sendAudio(event.utt, event.frame);
                    break;
                case 'pause':
                    send({ t: 'pause', utt: event.utt });
                    break;
                case 'resume':
                    send({ t: 'resume', utt: event.utt });
                    break;
                case 'commit':
                    send({ t: 'commit', utt: event.utt, endpointMs: event.endpointMs });
                    lastCommitAt = performance.now();
                    awaitingFirstAudio = true;
                    player?.earcon();
                    state.value = 'transcribing';
                    break;
                case 'cancel':
                    send({ t: 'cancel_utt', utt: event.utt });
                    state.value = 'listening';
                    break;
            }
        }
    }

    /** Stop the agent's voice now (barge-in, the interrupt button, or Escape). */
    function interrupt() {
        const heard = player?.stop();
        endpointer.setPlaying(false);
        if (heard) send({ t: 'interrupt', turn: heard.turn, heardText: heard.heardText });
    }

    function pttDown() {
        if (!connected.value || muted.value) return;
        pttHeld.value = true;
        handle(endpointer.pttDown());
    }

    function pttUp() {
        if (!pttHeld.value) return;
        pttHeld.value = false;
        handle(endpointer.pttUp());
    }

    function setMuted(value: boolean) {
        muted.value = value;
        stream?.getAudioTracks().forEach(track => { track.enabled = !value; });
        if (value && endpointer.speaking) {
            send({ t: 'cancel_utt', utt: endpointer.utterance });
            endpointer.reset();
            state.value = 'listening';
        }
    }

    // ── Audio out ──

    function onTurnAudible(turn: number) {
        audibleTurn = turn;
        state.value = 'speaking';
        endpointer.setPlaying(true);
        if (awaitingFirstAudio) {
            awaitingFirstAudio = false;
            const ms = Math.round(performance.now() - lastCommitAt);
            timing.value = { ...(timing.value ?? {}), firstAudioMs: ms };
            send({ t: 'first_audio', turn, ms });
        }
    }

    function onPlaybackIdle() {
        endpointer.setPlaying(false);
        if (state.value === 'speaking') state.value = 'listening';
    }

    /** A tool that runs a while with nothing said yet gets a short "one sec". */
    function scheduleFiller() {
        if (fillerTimer) clearTimeout(fillerTimer);
        const turn = currentTurn;
        fillerTimer = setTimeout(() => {
            fillerTimer = null;
            if (state.value !== 'tool' || audibleTurn === turn || fillerTurn === turn) return;
            if (performance.now() - lastCommitAt < FILLER_AFTER_MS) return;
            if (player?.playFiller()) fillerTurn = turn;
        }, FILLER_AFTER_MS);
    }

    // ── Preferences ──

    function applyEndpointerPrefs() {
        endpointer.configure({
            sensitivity: prefs.sensitivity,
            ...(prefs.headphones
                ? HEADPHONE_BARGE_IN
                : { bargeInProb: DEFAULT_ENDPOINTER.bargeInProb, bargeInMs: DEFAULT_ENDPOINTER.bargeInMs }),
        });
        endpointer.setHandsFree(prefs.handsFree);
    }

    function updatePrefs(update: Partial<TalkPrefs>) {
        const voiceChanged = ('voice' in update && update.voice !== prefs.voice) || ('speed' in update && update.speed !== prefs.speed);
        Object.assign(prefs, update);
        saveTalkPrefs({ ...prefs });
        applyEndpointerPrefs();
        if (voiceChanged) send({ t: 'config', voice: prefs.voice, speed: prefs.speed });
    }

    return {
        prefs, active, connected, state, detail, caption, captionFinal, micLevel, voiceLevel, error, muted, pttHeld,
        voices, serverSettings, detectorKind, timing,
        start, stop, interrupt, pttDown, pttUp, setMuted, updatePrefs,
    };
}
