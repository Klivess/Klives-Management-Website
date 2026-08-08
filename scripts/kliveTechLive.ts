/**
 * KliveTech Streamables live client.
 *
 * One socket at a time, for one gadget. That is not a simplification — the route
 * requires a gadgetID, the hub caps the whole service at 32 live viewers, and each
 * viewer's outbound queue is 8 deep with DropOldest. A socket per fleet gadget would
 * burn the global cap and still lose samples.
 *
 * Three consequences of the server's design shape everything below:
 *
 *   1. The queue drops samples silently. There is no error, no gap marker, nothing —
 *      the sequence simply jumps. So the client watches for the jump and backfills the
 *      hole from /streamables/history, and counts what it missed.
 *   2. A gadget reboot gives the hub a new sessionID and restarts its sequence from
 *      zero. The session has to be compared BEFORE the sequence, or every post-reboot
 *      sample looks like a stale duplicate and the chart freezes for good.
 *   3. A frame event carries only metadata. The JPEG has to be fetched separately, and
 *      only two frames per stream are retained, so a 404 means "expired", not "broken".
 */

import { onBeforeUnmount, ref, shallowRef, triggerRef } from 'vue';
import {
    ktGet, ktGetRaw, ktPassword, wsBase,
    numericValue, isChartable,
    type StreamableEntry, type StreamableSample, type StreamValueType, type StreamMode,
} from '~/scripts/kliveTech';

/** Roughly five minutes at 500ms, and comfortably past the hub's own 512 retained. */
const MAX_POINTS = 600;
/** The protocol's per-gadget ceiling; a gadget cannot legally exceed it. */
const MAX_STREAMS = 32;
/** Non-numeric streams get a text log instead of a chart. */
const MAX_TEXT_ENTRIES = 100;
const BACKFILL_COOLDOWN_MS = 2000;
const FRAME_MIN_INTERVAL_MS = 250;
const HISTORY_SEED_LIMIT = 200;
const HISTORY_SEED_CONCURRENCY = 3;

export interface TracePoint { x: number; y: number; seq: number; raw: unknown }

export interface StreamBuffer {
    streamID: string;
    valueType: StreamValueType;
    sessionID: string;
    lastSequence: number | null;
    points: TracePoint[];
    text: { seq: number; at: number; value: unknown }[];
    /** Samples the server dropped before we ever saw them. Surfaced in diagnostics. */
    gaps: number;
    seeded: boolean;
}

export interface FrameState {
    url: string | null;
    sequence: number | null;
    sha256: string;
    bytes: number | null;
    receivedUtc: string | null;
    expired: boolean;
    error: string;
}

export interface SessionLedgerEntry { at: number; gadgetID: string; sessionID: string }

export type LiveStatus = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'refused' | 'unavailable';

export function useKliveTechLive() {
    const status = ref<LiveStatus>('idle');
    const statusDetail = ref('');
    const gadgetID = ref('');
    const lastMessageAt = ref<number | null>(null);
    const sessionLedger = ref<SessionLedgerEntry[]>([]);
    const recentFrames = ref<string[]>([]);

    /**
     * Samples arrive at up to 25ms across as many as 32 streams — over a thousand a
     * second. Reactivity per message would melt the tab, so the buffers live in a
     * plain Map and a rAF-coalesced flag publishes them at most once a frame.
     */
    const buffers = new Map<string, StreamBuffer>();
    const buffersRef = shallowRef(buffers);
    const frames = new Map<string, FrameState>();
    const framesRef = shallowRef(frames);

    /** The catalog as the socket last described it; the page merges this with its poll. */
    const liveCatalog = ref<StreamableEntry[]>([]);

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelay = 1000;
    let openedAt = 0;
    let stopped = true;
    let paused = false;
    let dirty = false;
    let rafHandle = 0;
    const backfillAt = new Map<string, number>();
    const frameInFlight = new Set<string>();
    const framePending = new Set<string>();
    const frameLastFetch = new Map<string, number>();

    function markDirty() {
        if (dirty || typeof window === 'undefined') return;
        dirty = true;
        rafHandle = window.requestAnimationFrame(() => {
            dirty = false;
            triggerRef(buffersRef);
            triggerRef(framesRef);
        });
    }

    function bufferFor(streamID: string, valueType: StreamValueType, sessionID: string): StreamBuffer {
        let buffer = buffers.get(streamID);
        if (!buffer) {
            if (buffers.size >= MAX_STREAMS) return createDetachedBuffer(streamID, valueType, sessionID);
            buffer = createDetachedBuffer(streamID, valueType, sessionID);
            buffers.set(streamID, buffer);
        }
        return buffer;
    }

    function createDetachedBuffer(streamID: string, valueType: StreamValueType, sessionID: string): StreamBuffer {
        return {
            streamID, valueType, sessionID,
            lastSequence: null, points: [], text: [], gaps: 0, seeded: false,
        };
    }

    function resetBuffer(buffer: StreamBuffer, sessionID: string) {
        buffer.points = [];
        buffer.text = [];
        buffer.lastSequence = null;
        buffer.gaps = 0;
        buffer.seeded = false;
        buffer.sessionID = sessionID;
    }

    function pushPoint(buffer: StreamBuffer, point: TracePoint) {
        buffer.points.push(point);
        // One splice beats a shift per sample once the buffer is full.
        if (buffer.points.length > MAX_POINTS) {
            buffer.points.splice(0, buffer.points.length - MAX_POINTS);
        }
    }

    /* -------------------------------------------------------------- history --- */

    async function seedHistory(streamID: string) {
        const buffer = buffers.get(streamID);
        if (!buffer || !isChartable(buffer.valueType)) return;
        try {
            const samples = await ktGet<StreamableSample[]>(
                `/klivetech/streamables/history?gadgetID=${encodeURIComponent(gadgetID.value)}` +
                `&streamID=${encodeURIComponent(streamID)}&limit=${HISTORY_SEED_LIMIT}`);
            mergeSamples(streamID, samples);
            const current = buffers.get(streamID);
            if (current) current.seeded = true;
            markDirty();
        } catch {
            // History is an optimisation. Live samples still arrive without it.
        }
    }

    async function seedAll(entries: StreamableEntry[]) {
        const chartable = entries.filter(e => isChartable(e.valueType)).map(e => e.streamID);
        for (let i = 0; i < chartable.length; i += HISTORY_SEED_CONCURRENCY) {
            if (stopped) return;
            await Promise.all(chartable.slice(i, i + HISTORY_SEED_CONCURRENCY).map(seedHistory));
        }
    }

    function scheduleBackfill(streamID: string) {
        const now = Date.now();
        const previous = backfillAt.get(streamID) ?? 0;
        if (now - previous < BACKFILL_COOLDOWN_MS) return;
        backfillAt.set(streamID, now);

        const buffer = buffers.get(streamID);
        if (!buffer || buffer.lastSequence === null) return;
        const after = buffer.lastSequence;
        void (async () => {
            try {
                const samples = await ktGet<StreamableSample[]>(
                    `/klivetech/streamables/history?gadgetID=${encodeURIComponent(gadgetID.value)}` +
                    `&streamID=${encodeURIComponent(streamID)}&limit=${HISTORY_SEED_LIMIT}` +
                    `&afterSequence=${after}`);
                mergeSamples(streamID, samples);
                markDirty();
            } catch { /* the hole stays counted in buffer.gaps */ }
        })();
    }

    /** Merges by sequence and re-sorts, so a backfill can land after later live samples. */
    function mergeSamples(streamID: string, samples: StreamableSample[]) {
        const buffer = buffers.get(streamID);
        if (!buffer || !samples.length) return;

        const known = new Set(buffer.points.map(p => p.seq));
        for (const sample of samples) {
            if (sample.sessionID !== buffer.sessionID) continue;
            if (known.has(sample.sequence)) continue;
            const y = numericValue(sample.value);
            if (y === null) continue;
            const at = Date.parse(/[Zz]$/.test(sample.receivedUtc) ? sample.receivedUtc : `${sample.receivedUtc}Z`);
            buffer.points.push({ x: at, y, seq: sample.sequence, raw: sample.value });
            known.add(sample.sequence);
        }
        buffer.points.sort((a, b) => a.seq - b.seq);
        if (buffer.points.length > MAX_POINTS) {
            buffer.points.splice(0, buffer.points.length - MAX_POINTS);
        }
        const highest = buffer.points[buffer.points.length - 1]?.seq;
        if (highest !== undefined && (buffer.lastSequence === null || highest > buffer.lastSequence)) {
            buffer.lastSequence = highest;
        }
    }

    /* --------------------------------------------------------------- frames --- */

    function frameFor(streamID: string): FrameState {
        let frame = frames.get(streamID);
        if (!frame) {
            frame = { url: null, sequence: null, sha256: '', bytes: null, receivedUtc: null, expired: false, error: '' };
            frames.set(streamID, frame);
        }
        return frame;
    }

    async function fetchFrame(streamID: string) {
        if (paused || stopped || typeof document === 'undefined' || document.hidden) return;

        // Never queue more than one behind the current fetch; a backlog of stale frames
        // is worth less than the next fresh one.
        if (frameInFlight.has(streamID)) { framePending.add(streamID); return; }
        const last = frameLastFetch.get(streamID) ?? 0;
        if (Date.now() - last < FRAME_MIN_INTERVAL_MS) { framePending.add(streamID); return; }

        frameInFlight.add(streamID);
        frameLastFetch.set(streamID, Date.now());
        const frame = frameFor(streamID);
        try {
            const response = await ktGetRaw(
                `/klivetech/streamables/latest?gadgetID=${encodeURIComponent(gadgetID.value)}` +
                `&streamID=${encodeURIComponent(streamID)}`);

            if (response.status === 404) {
                // Only two frames are retained per stream; missing one is normal.
                frame.expired = true;
                frame.error = '';
                markDirty();
                return;
            }
            if (!response.ok) {
                frame.error = `Frame fetch failed (${response.status})`;
                markDirty();
                return;
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const previous = frame.url;
            // Assign before revoking: a mounted <img> must never point at a dead URL.
            frame.url = url;
            frame.expired = false;
            frame.error = '';
            frame.bytes = blob.size;
            frame.sequence = Number(response.headers.get('X-KliveTech-Sequence')) || frame.sequence;
            frame.sha256 = response.headers.get('X-KliveTech-SHA256') || '';
            frame.receivedUtc = response.headers.get('X-KliveTech-Received-UTC');
            if (previous) URL.revokeObjectURL(previous);
            markDirty();
        } catch (error: any) {
            frame.error = error?.message ?? 'Frame fetch failed';
            markDirty();
        } finally {
            frameInFlight.delete(streamID);
            if (framePending.delete(streamID) && !stopped && !paused) {
                setTimeout(() => void fetchFrame(streamID), FRAME_MIN_INTERVAL_MS);
            }
        }
    }

    function revokeFrames(streamID?: string) {
        for (const [id, frame] of frames) {
            if (streamID && id !== streamID) continue;
            if (frame.url) URL.revokeObjectURL(frame.url);
            frame.url = null;
        }
        if (streamID) frames.delete(streamID);
        else frames.clear();
    }

    /* ------------------------------------------------------------- messages --- */

    function handleMessage(raw: string) {
        let message: any;
        try { message = JSON.parse(raw); } catch { return; }
        if (!message || typeof message.type !== 'string') return;

        lastMessageAt.value = Date.now();
        if (message.type !== 'ping') {
            recentFrames.value = [
                `${new Date().toLocaleTimeString()} ${message.type}` +
                `${message.streamID ? ` ${message.streamID}` : ''}` +
                `${message.sequence !== undefined ? ` #${message.sequence}` : ''}`,
                ...recentFrames.value,
            ].slice(0, 50);
        }

        switch (message.type) {
            case 'ping': return;                       // keepalive; nothing to do
            case 'snapshot': return onSnapshot(message);
            case 'manifest': return onManifest(message);
            case 'sample': return onSample(message);
            case 'frame': return onFrame(message);
        }
    }

    function onSnapshot(message: { streamables?: StreamableEntry[] }) {
        const entries = message.streamables ?? [];
        liveCatalog.value = entries;
        status.value = 'live';
        statusDetail.value = entries.length
            ? ''
            : 'Connected, but this gadget has published no Streamables.';

        for (const entry of entries) {
            const buffer = bufferFor(entry.streamID, entry.valueType, entry.sessionID);
            if (buffer.sessionID !== entry.sessionID) resetBuffer(buffer, entry.sessionID);
        }
        markDirty();
        void seedAll(entries);
    }

    function onManifest(message: {
        gadgetID?: string; sessionID?: string; revision?: number;
        streamables?: { streamID: string; valueType: StreamValueType; mimeType: string;
                        mode: StreamMode; intervalMs: number; enabled: boolean }[];
    }) {
        const definitions = message.streamables ?? [];
        const sessionID = message.sessionID ?? '';
        const reported = new Set(definitions.map(d => d.streamID));

        // A manifest is the reduced ToPublicDefinition shape, not a catalog entry — it
        // has no latestValue and no droppedEvents. Merging keeps what it omits.
        const sessionChanged = [...buffers.values()].some(b => b.sessionID !== sessionID);
        if (sessionChanged) {
            sessionLedger.value = [
                { at: Date.now(), gadgetID: gadgetID.value, sessionID },
                ...sessionLedger.value,
            ].slice(0, 30);
            revokeFrames();
        }

        for (const [streamID, buffer] of [...buffers]) {
            if (!reported.has(streamID)) { buffers.delete(streamID); revokeFrames(streamID); continue; }
            if (buffer.sessionID !== sessionID) resetBuffer(buffer, sessionID);
        }
        for (const definition of definitions) {
            const buffer = bufferFor(definition.streamID, definition.valueType, sessionID);
            buffer.valueType = definition.valueType;
        }

        liveCatalog.value = liveCatalog.value
            .filter(entry => reported.has(entry.streamID))
            .map((entry) => {
                const definition = definitions.find(d => d.streamID === entry.streamID);
                return definition ? { ...entry, ...definition, sessionID } : entry;
            });

        markDirty();
        // Repopulate what a manifest cannot carry.
        void refreshCatalog();
        if (sessionChanged) void seedAll(liveCatalog.value);
    }

    function onSample(message: StreamableSample & { gadgetName?: string }) {
        const buffer = buffers.get(message.streamID);
        if (!buffer) return;

        // 1. Session first. After a reboot the hub restarts sequences from zero, so a
        //    sequence test run first would reject every new sample for ever.
        if (message.sessionID !== buffer.sessionID) {
            resetBuffer(buffer, message.sessionID);
        }
        // 2. Duplicate or out-of-order.
        if (buffer.lastSequence !== null && message.sequence <= buffer.lastSequence) return;
        // 3. A jump means the 8-deep outbound queue dropped what was in between.
        if (buffer.lastSequence !== null && message.sequence > buffer.lastSequence + 1) {
            buffer.gaps += message.sequence - buffer.lastSequence - 1;
            scheduleBackfill(message.streamID);
        }

        const at = Date.parse(/[Zz]$/.test(message.receivedUtc) ? message.receivedUtc : `${message.receivedUtc}Z`);
        const y = numericValue(message.value);
        if (y !== null && isChartable(buffer.valueType)) {
            pushPoint(buffer, { x: at, y, seq: message.sequence, raw: message.value });
        } else {
            buffer.text.unshift({ seq: message.sequence, at, value: message.value });
            if (buffer.text.length > MAX_TEXT_ENTRIES) buffer.text.length = MAX_TEXT_ENTRIES;
        }
        buffer.lastSequence = message.sequence;

        const entry = liveCatalog.value.find(e => e.streamID === message.streamID);
        if (entry) {
            entry.latestValue = message.value;
            entry.latestSequence = message.sequence;
            entry.latestReceivedUtc = message.receivedUtc;
        }
        markDirty();
    }

    function onFrame(message: { streamID: string; sequence: number; bytes: number; sha256: string }) {
        const frame = frameFor(message.streamID);
        frame.sequence = message.sequence;
        frame.bytes = message.bytes;
        frame.sha256 = message.sha256;
        markDirty();
        void fetchFrame(message.streamID);
    }

    async function refreshCatalog() {
        if (!gadgetID.value) return;
        try {
            liveCatalog.value = await ktGet<StreamableEntry[]>(
                `/klivetech/streamables?gadgetID=${encodeURIComponent(gadgetID.value)}`);
        } catch { /* the fleet poll is the fallback */ }
    }

    /* ----------------------------------------------------------------- socket - */

    function open() {
        if (stopped || paused || typeof window === 'undefined' || !gadgetID.value) return;
        status.value = status.value === 'reconnecting' ? 'reconnecting' : 'connecting';
        try {
            socket = new WebSocket(
                `${wsBase()}/klivetech/streamables/live` +
                `?gadgetID=${encodeURIComponent(gadgetID.value)}` +
                `&authorization=${encodeURIComponent(ktPassword())}`);
            openedAt = Date.now();

            socket.onopen = () => { status.value = 'live'; statusDetail.value = ''; };
            socket.onmessage = (event) => {
                if (typeof event.data === 'string') handleMessage(event.data);
            };
            socket.onerror = () => { try { socket?.close(); } catch { } };
            socket.onclose = (event) => {
                socket = null;
                if (stopped || paused) { status.value = 'idle'; return; }

                // 1008 is the hub refusing us: a missing gadgetID, or all 32 viewer slots
                // taken. Retrying a policy violation for ever is a client bug.
                if (event.code === 1008) {
                    status.value = 'refused';
                    statusDetail.value = event.reason || 'The hub refused this live connection.';
                    return;
                }
                // Dropped on the handshake with nothing received: the route is not
                // reachable from a browser. Say so once and let polling carry the page.
                if (event.code === 1006 && lastMessageAt.value === null) {
                    status.value = 'unavailable';
                    statusDetail.value = 'Live telemetry is unavailable; values are being polled instead.';
                    return;
                }
                status.value = 'reconnecting';
                if (Date.now() - openedAt > 10_000) reconnectDelay = 1000;
                scheduleReconnect();
            };
        } catch {
            scheduleReconnect();
        }
    }

    function scheduleReconnect() {
        if (stopped || paused || reconnectTimer) return;
        // Jitter keeps several tabs from retrying in lockstep against the viewer cap.
        const delay = reconnectDelay + Math.random() * 400;
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            reconnectDelay = Math.min(reconnectDelay * 2, 15_000);
            open();
        }, delay);
    }

    function closeSocket() {
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        const current = socket;
        socket = null;
        if (current) {
            current.onopen = current.onmessage = current.onerror = current.onclose = null;
            try { current.close(1000, 'closed by viewer'); } catch { }
        }
    }

    /* -------------------------------------------------------------------- api - */

    /** Point the socket at a gadget. Closing the old one first keeps us to one slot. */
    function subscribe(id: string) {
        if (id === gadgetID.value && (status.value === 'live' || status.value === 'connecting')) return;
        unsubscribe();
        if (!id) return;
        stopped = false;
        gadgetID.value = id;
        reconnectDelay = 1000;
        lastMessageAt.value = null;
        open();
    }

    function unsubscribe() {
        stopped = true;
        closeSocket();
        buffers.clear();
        revokeFrames();
        backfillAt.clear();
        frameInFlight.clear();
        framePending.clear();
        frameLastFetch.clear();
        liveCatalog.value = [];
        gadgetID.value = '';
        lastMessageAt.value = null;
        status.value = 'idle';
        statusDetail.value = '';
        markDirty();
    }

    /** Suspends the socket and every binary fetch without losing which gadget we were on. */
    function setPaused(value: boolean) {
        paused = value;
        if (value) {
            closeSocket();
            status.value = 'idle';
        } else if (gadgetID.value) {
            stopped = false;
            reconnectDelay = 1000;
            open();
        }
    }

    onBeforeUnmount(() => {
        unsubscribe();
        if (rafHandle && typeof window !== 'undefined') window.cancelAnimationFrame(rafHandle);
    });

    return {
        status, statusDetail, gadgetID, lastMessageAt, liveCatalog,
        buffers: buffersRef, frames: framesRef,
        sessionLedger, recentFrames,
        subscribe, unsubscribe, setPaused, fetchFrame, refreshCatalog,
    };
}
