/* Talk mode: a hands-free spoken conversation with KliveAgent, voiced by OpenAI's GPT-Live.

   Browser ⇄ OpenAI (WebRTC): the microphone goes up and the voice comes down directly; transcripts
   arrive on the "oai-events" data channel. GPT-Live hears, takes turns and handles interruptions.
   Browser ⇄ KliveAgent (/kliveagent/voice): the page sends its WebRTC offer and gets OpenAI's answer
   back (the server holds the key and the session's configuration), then hears what KliveAgent is
   doing: each spoken request as a turn, tools, state, minutes used.
   KliveAgent ⇄ OpenAI (the server's sideband): GPT-Live delegates every real request to KliveAgent,
   which answers through it.

   Browser APIs are only touched inside start() and the handlers it installs, so this is SSR-safe. */

import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { BuildKliveWsUrl } from '~/scripts/APIInterface';
import { describeMediaError } from '~/scripts/klivechat/call';
import { DEFAULT_TALK_PREFS, loadTalkPrefs, saveTalkPrefs, type TalkPrefs } from '~/scripts/talk/prefs';

export type TalkState = 'off' | 'starting' | 'connecting' | 'listening' | 'hearing' | 'thinking' | 'tool' | 'speaking'
    | 'standby' | 'error';

export interface TalkTurnEvent {
    text: string;
    clientMessageId: string;
    requestId: string | null;
    steering: boolean;
    accepted: boolean;
    error?: string | null;
    resubmitOf?: string | null;
}

export interface TalkTiming {
    /** From the end of his words to the voice starting to answer. */
    voiceMs?: number;
    /** From the voice handing the request over to KliveAgent's first words reaching it. */
    agentMs?: number;
}

export interface TalkUsage {
    seconds: number;
    costUsd: number;
    final: boolean;
}

export interface TalkHandlers {
    /** A spoken request reached the agent: show it, and follow its run. */
    onTurn?: (event: TalkTurnEvent) => void;
    /** A local command ("stop", "say that again") was handled without a new agent turn. */
    onCommand?: (command: string, text: string) => void;
}

const RECONNECT_DELAYS_MS = [500, 1000, 2000, 5000, 10000];
const ICE_GATHER_MS = 3000;
const NEW_UTTERANCE_AFTER_MS = 1200;
const SPEAKING_HOLD_MS = 600;

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
    const voices = ref<{ id: string; name: string }[]>([]);
    const serverSettings = ref<Record<string, any> | null>(null);
    const timing = ref<TalkTiming | null>(null);
    const usage = ref<TalkUsage | null>(null);
    const model = ref('');

    let ctx: AudioContext | null = null;
    let stream: MediaStream | null = null;
    let pc: RTCPeerConnection | null = null;
    let channel: RTCDataChannel | null = null;
    let output: HTMLAudioElement | null = null;
    let micAnalyser: AnalyserNode | null = null;
    let voiceAnalyser: AnalyserNode | null = null;
    let socket: WebSocket | null = null;
    let conversationId = '';
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    let uiTimer: ReturnType<typeof setInterval> | null = null;
    let hushTimer: ReturnType<typeof setTimeout> | null = null;
    let takenOver = false;
    let generation = 0;
    let lastHeardAt = 0;
    let lastVoiceAt = 0;
    let awaitingVoice = false;
    let delegatedAt = 0;
    let awaitingAgent = false;
    let toolState: 'thinking' | 'tool' | null = null;
    let standby = false;
    let heardText = '';
    let voiceText = '';

    onMounted(() => Object.assign(prefs, loadTalkPrefs()));
    onBeforeUnmount(() => {
        void stop();
        try { void ctx?.close(); } catch { /* closed */ }
        ctx = null;
    });

    // ── Lifecycle ──

    /** Must be called from a click or key press: that gesture is what lets the voice play. */
    async function start(forConversation: string) {
        if (active.value) {
            if (forConversation !== conversationId) { conversationId = forConversation; restart(); }
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
            output ??= createOutput();
            // Unlock playback inside the gesture; the voice's stream is attached once WebRTC connects.
            void output.play().catch(() => { /* nothing to play yet */ });
            await resumed;
            stream = await acquireMic();
            if (!active.value) { releaseMic(); return; }
            micAnalyser = analyse(stream);
            if (muted.value) stream.getAudioTracks().forEach(track => { track.enabled = false; });
            connect();
            uiTimer = setInterval(tick, 60);
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
        if (hushTimer) { clearTimeout(hushTimer); hushTimer = null; }
        teardownCall(true);
        const closing = socket;
        socket = null;
        try { closing?.close(1000, 'talk mode off'); } catch { /* closed */ }
        releaseMic();
        micAnalyser = null;
        micLevel.value = 0;
        voiceLevel.value = 0;
    }

    /** A new GPT-Live session for the same conversation (a new voice, a lost or expired session). */
    function restart() {
        teardownCall(true);
        const old = socket;
        socket = null;
        connected.value = false;
        try { old?.close(1000, 'restarting'); } catch { /* closed */ }
        connect();
    }

    function createOutput(): HTMLAudioElement {
        const el = new Audio();
        el.autoplay = true;
        (el as any).playsInline = true;
        return el;
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

    function analyse(source: MediaStream): AnalyserNode | null {
        if (!ctx) return null;
        try {
            const node = ctx.createAnalyser();
            node.fftSize = 512;
            ctx.createMediaStreamSource(source).connect(node);
            return node;
        } catch { return null; }
    }

    const buffer = new Float32Array(512);
    function levelOf(node: AnalyserNode | null): number {
        if (!node) return 0;
        node.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
        return Math.min(1, Math.sqrt(sum / buffer.length) * 6);
    }

    function tick() {
        micLevel.value = muted.value ? 0 : levelOf(micAnalyser);
        const level = levelOf(voiceAnalyser);
        voiceLevel.value = level;
        const now = performance.now();
        if (level > 0.04) {
            lastVoiceAt = now;
            noteVoiceStarted(now);
        }
        refreshState(now);
    }

    function refreshState(now = performance.now()) {
        if (!active.value || !connected.value || state.value === 'error') return;
        let next: TalkState;
        if (now - lastVoiceAt < SPEAKING_HOLD_MS) next = 'speaking';
        else if (now - lastHeardAt < SPEAKING_HOLD_MS) next = 'hearing';
        else if (toolState) next = toolState;
        else if (standby) next = 'standby';
        else next = 'listening';
        if (state.value !== next) state.value = next;
    }

    // ── KliveAgent's socket ──

    function connect() {
        if (!active.value) return;
        const mine = ++generation;
        state.value = 'connecting';
        const ws = new WebSocket(BuildKliveWsUrl('/kliveagent/voice', { conversationId }));
        socket = ws;
        ws.onmessage = event => {
            if (socket !== ws || typeof event.data !== 'string') return;
            void onServerMessage(event.data, mine);
        };
        ws.onclose = event => {
            if (socket !== ws) return;
            socket = null;
            connected.value = false;
            teardownCall(false);
            if (!active.value || takenOver) return;
            if (event.code === 4003 || event.code === 4403 || event.code === 4400) {
                error.value = event.reason || 'Talk mode is not available.';
                void stop().then(() => { state.value = 'error'; });
                return;
            }
            scheduleReconnect();
        };
    }

    function scheduleReconnect() {
        if (!active.value || reconnectTimer) return;
        state.value = 'connecting';
        const delay = RECONNECT_DELAYS_MS[Math.min(reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
        reconnectAttempt += 1;
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            restart();
        }, delay);
    }

    function send(payload: Record<string, unknown>) {
        if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
    }

    async function onServerMessage(raw: string, mine: number) {
        let m: any;
        try { m = JSON.parse(raw); } catch { return; }
        switch (m.t) {
            case 'ready':
                serverSettings.value = m.settings ?? null;
                model.value = m.settings?.model ?? '';
                voices.value = Array.isArray(m.settings?.voices) ? m.settings.voices.map((id: string) => ({ id, name: id })) : [];
                if (m.unavailable) {
                    error.value = m.unavailable;
                    await stop();
                    state.value = 'error';
                    return;
                }
                await call(mine);
                break;
            case 'answer':
                if (mine !== generation || !pc) return;
                try {
                    await pc.setRemoteDescription({ type: 'answer', sdp: m.sdp });
                    model.value = m.model ?? model.value;
                } catch (e) {
                    error.value = 'The voice could not connect: ' + (e instanceof Error ? e.message : String(e));
                    scheduleReconnect();
                }
                break;
            case 'live':
                connected.value = true;
                reconnectAttempt = 0;
                refreshState();
                break;
            case 'delegation':
                delegatedAt = performance.now();
                awaitingAgent = true;
                toolState = 'thinking';
                break;
            case 'heard':
                caption.value = m.text ?? '';
                captionFinal.value = true;
                break;
            case 'turn':
                handlers.onTurn?.(m as TalkTurnEvent);
                break;
            case 'said':
                if (awaitingAgent) {
                    awaitingAgent = false;
                    timing.value = { ...(timing.value ?? {}), agentMs: Math.round(performance.now() - delegatedAt) };
                }
                break;
            case 'state':
                detail.value = m.detail ?? '';
                toolState = m.state === 'thinking' || m.state === 'tool' ? m.state : null;
                refreshState();
                break;
            case 'command':
                handlers.onCommand?.(m.command, m.text ?? '');
                break;
            case 'usage':
                usage.value = { seconds: Number(m.seconds ?? 0), costUsd: Number(m.costUsd ?? 0), final: !!m.final };
                break;
            case 'standby':
                standby = !!m.paused;
                refreshState();
                break;
            case 'error':
                error.value = m.message || 'Something went wrong.';
                if (m.fatal) {
                    teardownCall(true);
                    if (m.code === 'openai') { await stop(); state.value = 'error'; }
                    else scheduleReconnect();
                }
                break;
            case 'closed':
                if (m.takenOver) {
                    takenOver = true;
                    error.value = m.reason || 'Talk mode moved to another tab.';
                    void stop();
                    return;
                }
                // GPT-Live ended the session (its time limit, or a lost connection): start a fresh one.
                if (active.value && m.reason !== 'close_requested') scheduleReconnect();
                break;
        }
    }

    // ── The WebRTC call with GPT-Live ──

    async function call(mine: number) {
        if (!stream || !active.value) return;
        teardownCall(false);
        const peer = new RTCPeerConnection();
        pc = peer;
        peer.ontrack = event => {
            if (pc !== peer || !output) return;
            const remote = event.streams[0] ?? new MediaStream([event.track]);
            output.srcObject = remote;
            void output.play().catch(() => { /* a later gesture plays it */ });
            voiceAnalyser = analyse(remote);
        };
        peer.onconnectionstatechange = () => {
            if (pc !== peer) return;
            if (peer.connectionState === 'failed') {
                error.value = 'The voice connection failed.';
                scheduleReconnect();
            }
        };
        stream.getTracks().forEach(track => peer.addTrack(track, stream!));
        const events = peer.createDataChannel('oai-events');
        channel = events;
        events.onmessage = event => { if (channel === events) onLiveEvent(event.data); };
        events.onopen = () => { if (muted.value) sendLive({ type: 'session.input_audio.mute' }); };

        await peer.setLocalDescription(await peer.createOffer());
        await iceGathered(peer);
        if (pc !== peer || mine !== generation) return;
        send({ t: 'offer', sdp: peer.localDescription?.sdp ?? '', voice: prefs.voice });
    }

    function iceGathered(peer: RTCPeerConnection): Promise<void> {
        if (peer.iceGatheringState === 'complete') return Promise.resolve();
        return new Promise(resolve => {
            const done = () => { peer.removeEventListener('icegatheringstatechange', check); clearTimeout(timer); resolve(); };
            const check = () => { if (peer.iceGatheringState === 'complete') done(); };
            const timer = setTimeout(done, ICE_GATHER_MS);
            peer.addEventListener('icegatheringstatechange', check);
        });
    }

    function sendLive(event: Record<string, unknown>) {
        if (channel?.readyState === 'open') channel.send(JSON.stringify(event));
    }

    function teardownCall(hangUp: boolean) {
        if (hangUp) sendLive({ type: 'session.close' });
        const peer = pc;
        pc = null;
        channel = null;
        voiceAnalyser = null;
        if (output) output.srcObject = null;
        try { peer?.close(); } catch { /* closed */ }
        toolState = null;
        standby = false;
    }

    function onLiveEvent(raw: string) {
        let e: any;
        try { e = JSON.parse(raw); } catch { return; }
        const now = performance.now();
        switch (e.type) {
            case 'session.started':
                connected.value = true;
                reconnectAttempt = 0;
                break;
            case 'session.input_transcript.delta':
                if (now - lastHeardAt > NEW_UTTERANCE_AFTER_MS) heardText = '';
                heardText += e.delta ?? '';
                lastHeardAt = now;
                awaitingVoice = true;
                caption.value = heardText.trim();
                captionFinal.value = false;
                break;
            case 'session.output_transcript.delta':
                if (now - lastVoiceAt > NEW_UTTERANCE_AFTER_MS) voiceText = '';
                voiceText += e.delta ?? '';
                lastVoiceAt = now;
                noteVoiceStarted(now);
                if (now - lastHeardAt > SPEAKING_HOLD_MS) { caption.value = voiceText.trim(); captionFinal.value = true; }
                break;
            case 'session.input_audio.muted':
                muted.value = true;
                break;
            case 'session.input_audio.unmuted':
                muted.value = false;
                break;
            case 'session.paused':
                standby = true;
                break;
            case 'session.resumed':
                standby = false;
                break;
            case 'error':
                if (e.error?.message) error.value = e.error.message;
                break;
        }
        refreshState(now);
    }

    function noteVoiceStarted(now: number) {
        if (!awaitingVoice || lastHeardAt === 0) return;
        awaitingVoice = false;
        const ms = Math.round(now - lastHeardAt);
        timing.value = { ...(timing.value ?? {}), voiceMs: ms };
        send({ t: 'first_audio', ms });
    }

    // ── Controls ──

    /** Stop the voice now (the button, or Escape): the rest of the current answer stays unsaid. */
    function interrupt() {
        send({ t: 'hush' });
        if (!output) return;
        output.muted = true;
        if (hushTimer) clearTimeout(hushTimer);
        hushTimer = setTimeout(() => { hushTimer = null; if (output) output.muted = false; }, 1500);
    }

    /** Cancel what KliveAgent is doing for the conversation. */
    function stopRun() {
        send({ t: 'stop_run' });
    }

    function setMuted(value: boolean) {
        muted.value = value;
        stream?.getAudioTracks().forEach(track => { track.enabled = !value; });
        sendLive({ type: value ? 'session.input_audio.mute' : 'session.input_audio.unmute' });
    }

    function updatePrefs(update: Partial<TalkPrefs>) {
        const voiceChanged = 'voice' in update && update.voice !== prefs.voice;
        Object.assign(prefs, update);
        saveTalkPrefs({ ...prefs });
        // GPT-Live fixes the voice when a session starts: a new voice is a new session.
        if (voiceChanged && active.value) restart();
    }

    return {
        prefs, active, connected, state, detail, caption, captionFinal, micLevel, voiceLevel, error, muted,
        voices, serverSettings, timing, usage, model,
        start, stop, interrupt, stopRun, setMuted, updatePrefs,
    };
}
