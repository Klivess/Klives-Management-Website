import { markRaw, reactive } from 'vue';
import { BuildKliveWsUrl } from '~/scripts/APIInterface';
import { guestIdentity, loadPrefs, savePrefs, tabSecret, type ChatPrefs } from './prefs';
import type { IceServerConfig, ParticipantSummary, RoomState, ServerChatMessage, WireMessage } from './types';

/*
 * One KliveChat call: signalling with the server, a WebRTC mesh to every other participant, and this
 * browser's microphone, camera and screen.
 *
 * Media layout. Every peer connection carries exactly four transceivers in a fixed order — microphone,
 * camera, screen, screen audio — created once by the side that offers. Turning the camera or a screen
 * share on or off is a replaceTrack on the matching transceiver, so it never renegotiates, and the
 * receiving side knows what a track is from its position alone. Camera and screen can run together.
 *
 * Roles. For each pair, the participant with the larger id offers (and is the "impolite" side of perfect
 * negotiation); the other answers. Both learn about each other on every join, so exactly one offers and
 * the simultaneous-offer glare the old page could hit can't happen. Every offer, answer and candidate
 * carries a session id (pcId) minted by the offerer, so a rebuilt connection and a stale one are never
 * confused.
 *
 * Recovery. A failed or stuck connection gets one ICE restart, then a rebuild. The signalling socket
 * pings every ten seconds and reconnects with backoff; the participant id comes from a per-tab secret, so
 * a reconnect (or a server restart) lands back in the same seat and working media connections are kept.
 */

export type CallPhase = 'prejoin' | 'connecting' | 'live' | 'reconnecting' | 'ended';
export type EndReason = 'left' | 'kicked' | 'banned' | 'deleted' | 'not-found' | 'locked' | 'full' | 'replaced';
export type MediaHealth = 'connecting' | 'connected' | 'failed';
export type Quality = 'good' | 'fair' | 'poor';

export interface PeerStats {
    rtt: number | null;
    loss: number | null;
    route: 'lan' | 'direct' | 'relay' | null;
    quality: Quality | null;
    kbpsIn: number | null;
}

export interface PeerView {
    id: string;
    name: string;
    rank: number;
    isGuest: boolean;
    isHost: boolean;
    canModerate: boolean;
    isMuted: boolean;
    hasVideo: boolean;
    isScreenSharing: boolean;
    hasScreenAudio: boolean;
    /** Their signalling seat is connected (false while the server holds it for a reconnect). */
    connected: boolean;
    joinedAt: number;
    media: MediaHealth;
    speaking: boolean;
    level: number;
    camTrack: MediaStreamTrack | null;
    screenTrack: MediaStreamTrack | null;
    /** Frames are arriving on that track. */
    camLive: boolean;
    screenLive: boolean;
    volume: number;
    localMute: boolean;
    stats: PeerStats;
}

export interface ChatEntry {
    key: string;
    id: string | null;
    senderId: string;
    senderName: string;
    senderIsGuest: boolean;
    text: string;
    ts: number;
    state: 'sent' | 'pending' | 'failed';
    clientMsgId?: string;
    system?: boolean;
}

export interface Notice {
    id: number;
    text: string;
    tone: 'info' | 'warn' | 'error';
}

export interface DeviceOption {
    id: string;
    label: string;
}

interface PeerLink {
    id: string;
    pc: RTCPeerConnection | null;
    pcId: string | null;
    makingOffer: boolean;
    ignoreOffer: boolean;
    queue: Promise<void>;
    iceRestarts: number;
    rebuilds: number;
    connectTimer: ReturnType<typeof setTimeout> | null;
    disconnectTimer: ReturnType<typeof setTimeout> | null;
    micAudio: HTMLAudioElement;
    screenAudio: HTMLAudioElement;
    receivers: (RTCRtpReceiver | null)[];
    lastStats: { at: number; bytes: number; lost: number; received: number } | null;
    speakingUntil: number;
    /** After our reconnect: a peer the server hasn't re-announced yet, kept while its media still flows. */
    unconfirmedUntil: number | null;
}

/** Transceiver order on every connection. */
const SLOT_KINDS = ['audio', 'video', 'video', 'audio'] as const;
const MIC = 0;
const CAMERA = 1;
const SCREEN = 2;
const SCREEN_AUDIO = 3;

const DEFAULT_ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
const RECONNECT_DELAYS = [400, 1000, 2000, 4000, 8000];
const HEARTBEAT_MS = 10_000;
const HEARTBEAT_DEAD_MS = 25_000;
/** RMS of the local mic (about -34 dBFS). */
const SPEAKING_THRESHOLD_LOCAL = 0.02;
/** RFC 6464 level of a peer's packets (about -38 dBov): quiet speech clears it, a noise-suppressed room doesn't. */
const SPEAKING_THRESHOLD_REMOTE = 0.012;
const MAX_CHAT = 400;

/** Close reasons the server uses for "this call is over for you"; anything else is a dropped connection. */
const TERMINAL: Record<string, EndReason> = {
    'Invalid Room ID': 'not-found',
    'Room deleted': 'deleted',
    'Removed from room': 'kicked',
    'Banned from room': 'banned',
    'Room locked': 'locked',
    'Room full': 'full',
    'Replaced': 'replaced',
};

function randomId(): string {
    const data = new Uint8Array(8);
    crypto.getRandomValues(data);
    return Array.from(data, b => b.toString(16).padStart(2, '0')).join('');
}

export function describeMediaError(error: unknown, device: 'microphone' | 'camera' | 'screen'): string {
    const name = (error as { name?: string })?.name ?? '';
    const Device = device[0].toUpperCase() + device.slice(1);
    switch (name) {
        case 'NotAllowedError':
        case 'SecurityError':
            return device === 'screen' ? 'Screen sharing was blocked.' : `${Device} access is blocked for this site.`;
        case 'NotFoundError':
        case 'OverconstrainedError':
            return `No ${device} found.`;
        case 'NotReadableError':
        case 'AbortError':
            return `The ${device} is in use by another app.`;
        default:
            return typeof navigator !== 'undefined' && !navigator.mediaDevices ? 'Media devices need HTTPS.' : `${Device} unavailable.`;
    }
}

function emptyStats(): PeerStats {
    return { rtt: null, loss: null, route: null, quality: null, kbpsIn: null };
}

function trackKind(track: MediaStreamTrack | null | undefined): string | null {
    return track ? track.kind : null;
}

export class KliveChatCall {
    readonly state = reactive({
        phase: 'prejoin' as CallPhase,
        endReason: null as EndReason | null,
        endDetail: '',
        signal: 'idle' as 'idle' | 'connecting' | 'open' | 'closed',
        reconnectAttempt: 0,
        selfId: '',
        selfName: '',
        signedIn: false,
        canModerate: false,
        isHost: false,
        room: null as RoomState | null,
        peers: [] as PeerView[],
        chat: [] as ChatEntry[],
        unread: 0,
        lastIncoming: null as ChatEntry | null,
        notices: [] as Notice[],
        joinedAt: 0,
        audioBlocked: false,
        serverProtocol: 1,
        local: {
            micOn: true,
            micReady: false,
            micError: '',
            micLevel: 0,
            speaking: false,
            mutedTalking: false,
            pttHeld: false,
            camOn: false,
            camError: '',
            camTrack: null as MediaStreamTrack | null,
            facing: 'user' as 'user' | 'environment',
            screenOn: false,
            screenAudio: false,
            screenTrack: null as MediaStreamTrack | null,
        },
        devices: {
            mics: [] as DeviceOption[],
            cams: [] as DeviceOption[],
            speakers: [] as DeviceOption[],
        },
        prefs: loadPrefs() as ChatPrefs,
        canShareScreen: false,
        canPickSpeaker: false,
    });

    private ws: WebSocket | null = null;
    private wsGeneration = 0;
    private lastInbound = 0;
    private lastPing = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private tickTimer: ReturnType<typeof setInterval> | null = null;
    private ticks = 0;
    private secret: string;
    private guestName = '';
    private iceServers: RTCIceServer[] = DEFAULT_ICE;
    private readonly links = new Map<string, PeerLink>();
    private chatOpen = false;
    private joining = false;
    private announcedSnapshot = false;
    private noticeSeq = 0;
    private destroyed = false;

    private micTrack: MediaStreamTrack | null = null;
    private camTrack: MediaStreamTrack | null = null;
    private screenTrack: MediaStreamTrack | null = null;
    private screenAudioTrack: MediaStreamTrack | null = null;

    private audioCtx: AudioContext | null = null;
    private meterTrack: MediaStreamTrack | null = null;
    private meterSource: MediaStreamAudioSourceNode | null = null;
    private analyser: AnalyserNode | null = null;
    private meterBuffer: Float32Array<ArrayBuffer> | null = null;
    private localSpeakingUntil = 0;
    private localLoudSince = 0;
    private mutedTalkingUntil = 0;

    private readonly onDeviceChange = () => void this.refreshDevices();
    private readonly onOnline = () => {
        if (this.isActive() && !this.ws) this.connectNow();
    };

    constructor(readonly roomId: string, identity: { signedIn: boolean; name: string }) {
        this.secret = tabSecret(roomId);
        this.state.signedIn = identity.signedIn;
        this.state.selfName = identity.name;
        this.guestName = identity.signedIn ? '' : identity.name;
        this.state.canShareScreen = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
        this.state.canPickSpeaker = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
        this.state.local.micOn = !this.state.prefs.joinMuted && !this.state.prefs.pushToTalk;
        navigator.mediaDevices?.addEventListener?.('devicechange', this.onDeviceChange);
        window.addEventListener('online', this.onOnline);
        this.tickTimer = setInterval(() => this.tick(), 100);
    }

    // ───────────────────────────── lifecycle ─────────────────────────────

    /** Opens the microphone (and the camera, if preferred) for the pre-join preview. */
    async prepare(): Promise<void> {
        await this.acquireMic();
        if (this.state.prefs.joinWithCamera && !this.state.local.camOn) await this.setCamOn(true);
        await this.refreshDevices();
    }

    async join(name?: string): Promise<void> {
        if (this.joining || this.isActive()) return;
        this.joining = true;
        try {
            if (name !== undefined && !this.state.signedIn) {
                this.guestName = name.trim().slice(0, 32) || 'Guest';
                this.state.selfName = this.guestName;
                this.setPref('guestName', this.guestName);
            }
            void this.audioCtx?.resume();
            if (!this.micTrack && !this.state.local.micError) await this.acquireMic();
            if (this.destroyed) return;
            this.state.phase = 'connecting';
            this.state.endReason = null;
            this.announcedSnapshot = false;
            this.connectNow();
        } finally {
            this.joining = false;
        }
    }

    leave() {
        this.end('left');
    }

    async rejoin(): Promise<void> {
        if (this.state.endReason === 'replaced') this.secret = tabSecret(this.roomId, true);
        this.state.endReason = null;
        this.state.endDetail = '';
        this.state.selfId = '';
        this.state.joinedAt = 0;
        this.state.reconnectAttempt = 0;
        await this.prepare();
        await this.join();
    }

    destroy() {
        this.destroyed = true;
        this.teardown();
        if (this.tickTimer) clearInterval(this.tickTimer);
        navigator.mediaDevices?.removeEventListener?.('devicechange', this.onDeviceChange);
        window.removeEventListener('online', this.onOnline);
        void this.audioCtx?.close().catch(() => undefined);
        this.audioCtx = null;
    }

    private isActive() {
        return !this.destroyed && (this.state.phase === 'connecting' || this.state.phase === 'live' || this.state.phase === 'reconnecting');
    }

    private end(reason: EndReason, detail = '') {
        if (this.state.phase === 'ended') return;
        this.state.phase = 'ended';
        this.state.endReason = reason;
        this.state.endDetail = detail;
        this.state.notices.splice(0);
        this.teardown();
    }

    /** Closes the socket and every connection, and turns off the mic, camera and screen. */
    private teardown() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        this.wsGeneration++;
        if (this.ws) {
            try { this.ws.close(1000, 'Left room'); } catch { /* already closed */ }
            this.ws = null;
        }
        this.state.signal = 'closed';
        for (const id of [...this.links.keys()]) this.dropPeer(id);
        this.state.peers.splice(0);
        this.stopScreenTracks();
        this.camTrack?.stop();
        this.camTrack = null;
        this.state.local.camTrack = null;
        this.state.local.camOn = false;
        this.micTrack?.stop();
        this.micTrack = null;
        this.state.local.micReady = false;
        this.teardownMeter();
    }

    // ───────────────────────────── signalling socket ─────────────────────────────

    private connectNow() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        const generation = ++this.wsGeneration;
        const params: Record<string, string> = { roomId: this.roomId, protocol: '2', secret: this.secret };
        if (!this.state.signedIn) {
            params.name = this.guestName || 'Guest';
            const identity = guestIdentity();
            if (identity) params.guestIdentity = identity;
        }
        let ws: WebSocket;
        try {
            ws = new WebSocket(BuildKliveWsUrl('/klivechat/ws', params));
        } catch {
            this.scheduleReconnect();
            return;
        }
        this.ws = ws;
        this.state.signal = 'connecting';
        ws.onopen = () => {
            if (generation !== this.wsGeneration) return;
            this.state.signal = 'open';
            this.lastInbound = Date.now();
        };
        ws.onmessage = (event) => {
            if (generation !== this.wsGeneration) return;
            this.lastInbound = Date.now();
            let message: WireMessage;
            try {
                message = JSON.parse(event.data);
            } catch {
                return;
            }
            this.onMessage(message);
        };
        ws.onclose = (event) => {
            if (generation !== this.wsGeneration) return;
            this.ws = null;
            this.state.signal = 'closed';
            this.onSocketClosed(event.reason);
        };
    }

    private onSocketClosed(reason: string) {
        if (!this.isActive()) return;
        const terminal = TERMINAL[reason];
        if (terminal) {
            this.end(terminal);
            return;
        }
        if (reason === 'Session conflict') this.secret = tabSecret(this.roomId, true);
        this.scheduleReconnect();
    }

    private scheduleReconnect() {
        if (!this.isActive()) return;
        this.state.phase = this.state.phase === 'connecting' ? 'connecting' : 'reconnecting';
        const delay = RECONNECT_DELAYS[Math.min(this.state.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
        this.state.reconnectAttempt++;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.isActive()) this.connectNow();
        }, delay);
    }

    /** A socket that stopped answering is abandoned rather than waited on. */
    private heartbeat(now: number) {
        if (this.state.signal !== 'open' || !this.ws || this.state.serverProtocol < 2) return;
        if (now - this.lastInbound > HEARTBEAT_DEAD_MS) {
            // Abandoned, not closed: a close frame reaching a merely slow server would read as leaving the
            // room. The reconnect takes the seat over and the server retires this socket itself.
            this.wsGeneration++;
            this.ws = null;
            this.state.signal = 'closed';
            this.scheduleReconnect();
            return;
        }
        if (now - this.lastPing >= HEARTBEAT_MS) {
            this.lastPing = now;
            this.send('ping', null, { t: now });
        }
    }

    private send(type: string, targetId: string | null, payload?: unknown): boolean {
        const ws = this.ws;
        if (!ws || ws.readyState !== WebSocket.OPEN) return false;
        try {
            ws.send(JSON.stringify(targetId ? { type, targetId, payload } : { type, payload }));
            return true;
        } catch {
            return false;
        }
    }

    // ───────────────────────────── room events ─────────────────────────────

    private onMessage(message: WireMessage) {
        const payload = message.payload;
        switch (message.type) {
            case 'room-info': this.onRoomInfo(payload); break;
            case 'user-joined': this.onUserJoined(payload as ParticipantSummary); break;
            case 'user-left': this.onUserLeft(String(payload?.id ?? message.senderId ?? '')); break;
            case 'participant-state': if (payload?.id) this.upsertPeer(payload as ParticipantSummary); break;
            case 'participant-removed': this.onParticipantRemoved(payload); break;
            case 'chat-message': this.onChat(payload as ServerChatMessage, message.senderId); break;
            case 'force-mute': this.onForceMute(payload); break;
            case 'room-updated': this.onRoomUpdated(payload); break;
            case 'room-error': this.notify(String(payload?.message ?? 'Something went wrong.'), 'warn'); break;
            case 'offer':
            case 'answer':
            case 'ice-candidate':
            case 'renegotiate':
                if (message.senderId) this.enqueueSignal(message.senderId, message);
                break;
        }
    }

    private onRoomInfo(info: any) {
        this.state.serverProtocol = Number(info?.protocol ?? 1);
        const selfId = String(info?.clientId ?? '');
        if (this.state.selfId && selfId !== this.state.selfId) {
            // A different seat: every connection we hold was made under the old id.
            for (const id of [...this.links.keys()]) this.dropPeer(id);
        }
        this.state.selfId = selfId;
        const ice = Array.isArray(info?.iceServers) ? (info.iceServers as IceServerConfig[]) : [];
        this.iceServers = ice.length ? ice.map(s => ({ urls: s.urls, username: s.username, credential: s.credential })) : DEFAULT_ICE;
        this.state.room = info?.room ?? {
            id: info?.roomId ?? this.roomId, name: info?.roomName ?? 'Room', createdBy: '', createdUtc: '', persistent: false, locked: false,
        };
        if (info?.self) {
            this.state.selfName = info.self.name;
            this.state.canModerate = !!info.self.canModerate;
            this.state.isHost = !!info.self.isHost;
        }
        this.mergeChat(Array.isArray(info?.chat) ? info.chat : []);

        const listed = new Set<string>();
        for (const user of (info?.users ?? []) as ParticipantSummary[]) {
            if (!user?.id) continue;
            listed.add(user.id);
            this.upsertPeer(user);
            const link = this.links.get(user.id);
            if (link) link.unconfirmedUntil = null;
            this.ensureConnection(user.id);
        }
        // After a server restart the room fills back up one reconnect at a time: keep media that still flows.
        const now = Date.now();
        for (const view of [...this.state.peers]) {
            if (listed.has(view.id)) continue;
            const link = this.links.get(view.id);
            if (link?.pc?.connectionState === 'connected') link.unconfirmedUntil = now + 15_000;
            else this.removePeer(view.id, false);
        }

        this.state.phase = 'live';
        this.state.reconnectAttempt = 0;
        if (!this.state.joinedAt) this.state.joinedAt = now;
        this.announcedSnapshot = true;
        this.sendMediaState();
        this.applyAllEncodings();
    }

    private onUserJoined(summary: ParticipantSummary) {
        if (!summary?.id || summary.id === this.state.selfId) return;
        const isNew = !this.peerView(summary.id);
        this.upsertPeer(summary);
        const link = this.links.get(summary.id);
        if (link) link.unconfirmedUntil = null;
        if (isNew && this.announcedSnapshot) this.systemLine(`${summary.name} joined`);
        this.ensureConnection(summary.id);
        this.applyAllEncodings();
    }

    private onUserLeft(id: string) {
        if (!id) return;
        this.removePeer(id, true);
        this.applyAllEncodings();
    }

    private onParticipantRemoved(payload: any) {
        const id = String(payload?.id ?? '');
        if (!id) return;
        const byName = String(payload?.byName ?? 'A moderator');
        if (id === this.state.selfId) {
            this.end(payload?.action === 'ban' ? 'banned' : 'kicked', byName);
            return;
        }
        const name = this.peerView(id)?.name ?? 'Someone';
        this.removePeer(id, false);
        this.systemLine(`${byName} ${payload?.action === 'ban' ? 'banned' : 'removed'} ${name}`);
    }

    private onForceMute(payload: any) {
        this.setMicOn(false);
        this.notify(`${payload?.byName ?? 'A moderator'} muted you`, 'warn');
    }

    private onRoomUpdated(payload: any) {
        const room = payload?.room as RoomState | undefined;
        if (!room) return;
        const before = this.state.room;
        this.state.room = room;
        if (before && before.locked !== room.locked) this.notify(`${payload?.byName ?? 'Someone'} ${room.locked ? 'locked' : 'unlocked'} the room`);
        else if (before && before.name !== room.name) this.notify(`Renamed to “${room.name}”`);
    }

    private peerView(id: string): PeerView | undefined {
        return this.state.peers.find(p => p.id === id);
    }

    private upsertPeer(summary: ParticipantSummary) {
        if (!summary?.id || summary.id === this.state.selfId) return;
        const existing = this.peerView(summary.id);
        const fields = {
            name: summary.name || 'Guest',
            rank: Number(summary.rank ?? 0),
            isGuest: summary.isGuest !== false,
            isHost: !!summary.isHost,
            canModerate: !!summary.canModerate,
            isMuted: !!summary.isMuted,
            hasVideo: !!summary.hasVideo,
            isScreenSharing: !!summary.isScreenSharing,
            hasScreenAudio: !!summary.hasScreenAudio,
            connected: summary.connected !== false,
        };
        if (existing) {
            Object.assign(existing, fields);
            return;
        }
        this.state.peers.push({
            id: summary.id,
            ...fields,
            joinedAt: Date.parse(summary.joinedUtc ?? '') || Date.now(),
            media: 'connecting',
            speaking: false,
            level: 0,
            camTrack: null,
            screenTrack: null,
            camLive: false,
            screenLive: false,
            volume: 1,
            localMute: false,
            stats: emptyStats(),
        });
        this.state.peers.sort((a, b) => a.joinedAt - b.joinedAt);
    }

    private removePeer(id: string, announce: boolean) {
        const view = this.peerView(id);
        if (view && announce) this.systemLine(`${view.name} left`);
        this.dropPeer(id);
        const index = this.state.peers.findIndex(p => p.id === id);
        if (index >= 0) this.state.peers.splice(index, 1);
    }

    // ───────────────────────────── peer connections ─────────────────────────────

    private isOfferer(peerId: string) {
        return this.state.selfId > peerId;
    }

    private link(peerId: string): PeerLink {
        let link = this.links.get(peerId);
        if (!link) {
            link = {
                id: peerId,
                pc: null,
                pcId: null,
                makingOffer: false,
                ignoreOffer: false,
                queue: Promise.resolve(),
                iceRestarts: 0,
                rebuilds: 0,
                connectTimer: null,
                disconnectTimer: null,
                micAudio: this.createAudio(),
                screenAudio: this.createAudio(),
                receivers: [],
                lastStats: null,
                speakingUntil: 0,
                unconfirmedUntil: null,
            };
            this.links.set(peerId, link);
        }
        return link;
    }

    private createAudio(): HTMLAudioElement {
        const audio = new Audio();
        audio.autoplay = true;
        const sink = this.state.prefs.speakerId;
        if (sink && this.state.canPickSpeaker) (audio as any).setSinkId(sink).catch(() => undefined);
        return audio;
    }

    /** Makes sure a working connection to this peer exists or is on its way. */
    private ensureConnection(peerId: string) {
        const link = this.link(peerId);
        const pc = link.pc;
        const dead = !pc || pc.connectionState === 'failed' || pc.connectionState === 'closed';
        if (!dead) return;
        if (this.isOfferer(peerId)) this.startSession(link);
        else if (pc) this.send('renegotiate', peerId, { pcId: link.pcId, reason: 'failed' });
        // Otherwise the peer offers; nothing to do until it does.
    }

    private newConnection(link: PeerLink, pcId: string): RTCPeerConnection {
        this.closeSession(link);
        const pc = new RTCPeerConnection({ iceServers: this.iceServers, bundlePolicy: 'max-bundle' });
        link.pc = pc;
        link.pcId = pcId;
        link.makingOffer = false;
        link.ignoreOffer = false;
        link.lastStats = null;
        pc.onnegotiationneeded = () => void this.makeOffer(link, pc);
        pc.onicecandidate = (event) => {
            if (event.candidate && link.pc === pc) this.send('ice-candidate', link.id, { pcId, candidate: event.candidate.toJSON() });
        };
        pc.onconnectionstatechange = () => this.onConnectionState(link, pc);
        pc.ontrack = () => {
            if (link.pc === pc) this.bindReceivers(link);
        };
        const view = this.peerView(link.id);
        if (view) view.media = 'connecting';
        this.armConnectTimer(link, pc);
        return pc;
    }

    /** Offerer: a fresh connection with the four transceivers; negotiationneeded sends the offer. */
    private startSession(link: PeerLink) {
        const pc = this.newConnection(link, randomId());
        const outgoing = this.outgoingTracks();
        SLOT_KINDS.forEach((kind, slot) => pc.addTransceiver(outgoing[slot] ?? kind, { direction: 'sendrecv' }));
        this.bindReceivers(link);
    }

    private async makeOffer(link: PeerLink, pc: RTCPeerConnection) {
        if (link.pc !== pc) return;
        try {
            link.makingOffer = true;
            await pc.setLocalDescription();
            if (link.pc !== pc || !pc.localDescription) return;
            this.send('offer', link.id, { pcId: link.pcId, sdp: pc.localDescription.toJSON() });
        } catch (error) {
            console.warn('[KliveChat] offer failed', error);
        } finally {
            link.makingOffer = false;
        }
    }

    /** Signalling for one peer is handled strictly in order: a candidate never races its offer. */
    private enqueueSignal(peerId: string, message: WireMessage) {
        if (!this.peerView(peerId) || this.state.phase === 'ended') return;
        const link = this.link(peerId);
        link.queue = link.queue
            .then(() => this.handleSignal(link, message))
            .catch(error => console.warn(`[KliveChat] ${message.type} from ${peerId} failed`, error));
    }

    private async handleSignal(link: PeerLink, message: WireMessage) {
        if (this.links.get(link.id) !== link) return;
        const payload = message.payload ?? {};
        const pcId: string | undefined = typeof payload.pcId === 'string' ? payload.pcId : undefined;

        if (message.type === 'renegotiate') {
            // The answering side lost us and asks the offering side (us) to restore the connection.
            if (this.isOfferer(link.id)) this.recover(link, !link.pc || pcId !== link.pcId);
            return;
        }

        if (message.type === 'ice-candidate') {
            if (!pcId || pcId !== link.pcId || !link.pc || !payload.candidate) return;
            try {
                await link.pc.addIceCandidate(payload.candidate);
            } catch (error) {
                if (!link.ignoreOffer) throw error;
            }
            return;
        }

        const description = payload.sdp as RTCSessionDescriptionInit | undefined;
        if (!pcId || !description?.type) return;
        if (description.type === 'offer') {
            if (!link.pc || link.pcId !== pcId) {
                if (this.isOfferer(link.id)) {
                    // This pair's sessions are ours to start: an offer for some other session is stale.
                    const pc = link.pc;
                    if (!pc || pc.connectionState === 'failed' || pc.connectionState === 'closed') this.startSession(link);
                    return;
                }
                this.newConnection(link, pcId);
            }
        } else if (!link.pc || link.pcId !== pcId) {
            return;
        }

        const pc = link.pc!;
        const collision = description.type === 'offer' && (link.makingOffer || pc.signalingState !== 'stable');
        link.ignoreOffer = this.isOfferer(link.id) && collision;
        if (link.ignoreOffer) return;

        await pc.setRemoteDescription(description);
        if (link.pc !== pc) return;
        if (description.type === 'offer') {
            await this.attachOutgoing(link);
            await pc.setLocalDescription();
            if (link.pc !== pc || !pc.localDescription) return;
            this.send('answer', link.id, { pcId: link.pcId, sdp: pc.localDescription.toJSON() });
        }
        this.bindReceivers(link);
    }

    /** Answerer: the offer created the transceivers; send our tracks on them. */
    private async attachOutgoing(link: PeerLink) {
        const pc = link.pc;
        if (!pc) return;
        const outgoing = this.outgoingTracks();
        const transceivers = pc.getTransceivers();
        for (let slot = 0; slot < Math.min(SLOT_KINDS.length, transceivers.length); slot++) {
            const transceiver = transceivers[slot];
            if (trackKind(transceiver.receiver.track) !== SLOT_KINDS[slot] || transceiver.currentDirection === 'stopped') continue;
            if (transceiver.direction !== 'sendrecv') transceiver.direction = 'sendrecv';
            if (transceiver.sender.track !== outgoing[slot]) await transceiver.sender.replaceTrack(outgoing[slot]);
        }
    }

    private outgoingTracks(): (MediaStreamTrack | null)[] {
        return [this.micTrack, this.camTrack, this.screenTrack, this.screenAudioTrack];
    }

    /** Puts a new local track (or nothing) on one slot of every connection. No renegotiation. */
    private async replaceSlot(slot: number, track: MediaStreamTrack | null) {
        await Promise.all([...this.links.values()].map(async link => {
            const transceiver = link.pc?.getTransceivers()[slot];
            if (!transceiver || trackKind(transceiver.receiver.track) !== SLOT_KINDS[slot]) return;
            if (transceiver.sender.track === track) return;
            try {
                await transceiver.sender.replaceTrack(track);
            } catch (error) {
                console.warn('[KliveChat] replaceTrack failed', error);
            }
        }));
        this.applyAllEncodings();
    }

    /** Wires what the peer sends to audio elements and to the view (video tracks). */
    private bindReceivers(link: PeerLink) {
        const pc = link.pc;
        if (!pc) return;
        const transceivers = pc.getTransceivers();
        link.receivers = SLOT_KINDS.map((kind, slot) => {
            const receiver = transceivers[slot]?.receiver;
            return receiver && trackKind(receiver.track) === kind ? receiver : null;
        });
        const [mic, cam, screen, screenAudio] = link.receivers.map(r => r?.track ?? null);
        this.setAudioTrack(link, link.micAudio, mic);
        this.setAudioTrack(link, link.screenAudio, screenAudio);

        const view = this.peerView(link.id);
        if (!view) return;
        if (view.camTrack !== cam) {
            view.camTrack = cam ? markRaw(cam) : null;
            view.camLive = !!cam && !cam.muted;
            if (cam) {
                cam.onmute = () => { if (view.camTrack === cam) view.camLive = false; };
                cam.onunmute = () => { if (view.camTrack === cam) view.camLive = true; };
            }
        }
        if (view.screenTrack !== screen) {
            view.screenTrack = screen ? markRaw(screen) : null;
            view.screenLive = !!screen && !screen.muted;
            if (screen) {
                screen.onmute = () => { if (view.screenTrack === screen) view.screenLive = false; };
                screen.onunmute = () => { if (view.screenTrack === screen) view.screenLive = true; };
            }
        }
    }

    private setAudioTrack(link: PeerLink, audio: HTMLAudioElement, track: MediaStreamTrack | null) {
        const current = audio.srcObject as MediaStream | null;
        if (track && current?.getAudioTracks()[0] === track) return;
        audio.srcObject = track ? new MediaStream([track]) : null;
        const view = this.peerView(link.id);
        audio.volume = view?.volume ?? 1;
        audio.muted = !!view?.localMute;
        if (track) this.play(audio);
    }

    private play(audio: HTMLAudioElement) {
        audio.play().catch(error => {
            if ((error as { name?: string })?.name === 'NotAllowedError') this.state.audioBlocked = true;
        });
    }

    private onConnectionState(link: PeerLink, pc: RTCPeerConnection) {
        if (link.pc !== pc) return;
        const state = pc.connectionState;
        const view = this.peerView(link.id);
        if (view) view.media = state === 'connected' ? 'connected' : state === 'failed' || state === 'closed' ? 'failed' : 'connecting';
        if (state === 'connected') {
            link.iceRestarts = 0;
            link.rebuilds = 0;
            if (link.connectTimer) clearTimeout(link.connectTimer);
            if (link.disconnectTimer) clearTimeout(link.disconnectTimer);
            link.connectTimer = link.disconnectTimer = null;
            void this.applyEncodings(link);
            return;
        }
        if (state === 'disconnected') {
            // Often recovers by itself (a Wi-Fi hiccup); only step in if it doesn't.
            if (!link.disconnectTimer) {
                link.disconnectTimer = setTimeout(() => {
                    link.disconnectTimer = null;
                    if (link.pc === pc && pc.connectionState === 'disconnected') this.recover(link);
                }, 4000);
            }
            return;
        }
        if (state === 'failed') this.recover(link);
    }

    /** First an ICE restart on the same connection, then a rebuild. Only the offering side acts. */
    private recover(link: PeerLink, rebuild = false) {
        if (!this.isActive() || this.links.get(link.id) !== link) return;
        if (!this.isOfferer(link.id)) {
            this.send('renegotiate', link.id, { pcId: link.pcId, reason: 'failed' });
            if (link.pc) this.armConnectTimer(link, link.pc);
            return;
        }
        const pc = link.pc;
        if (!rebuild && pc && pc.connectionState !== 'closed' && link.iceRestarts < 1 && typeof pc.restartIce === 'function') {
            link.iceRestarts++;
            pc.restartIce();
            this.armConnectTimer(link, pc);
            return;
        }
        link.iceRestarts = 0;
        link.rebuilds++;
        this.startSession(link);
    }

    /** A connection that hasn't come up in time is recovered; the wait grows while a peer stays unreachable. */
    private armConnectTimer(link: PeerLink, pc: RTCPeerConnection) {
        if (link.connectTimer) clearTimeout(link.connectTimer);
        const wait = Math.min(15_000 * 2 ** Math.min(link.rebuilds, 3), 120_000);
        link.connectTimer = setTimeout(() => {
            link.connectTimer = null;
            if (link.pc === pc && pc.connectionState !== 'connected') this.recover(link, link.iceRestarts >= 1);
        }, wait);
    }

    private closeSession(link: PeerLink) {
        if (link.connectTimer) clearTimeout(link.connectTimer);
        if (link.disconnectTimer) clearTimeout(link.disconnectTimer);
        link.connectTimer = link.disconnectTimer = null;
        const pc = link.pc;
        if (pc) {
            pc.onnegotiationneeded = null;
            pc.onicecandidate = null;
            pc.onconnectionstatechange = null;
            pc.ontrack = null;
            try { pc.close(); } catch { /* already closed */ }
        }
        link.pc = null;
        link.pcId = null;
        link.receivers = [];
        const view = this.peerView(link.id);
        if (view) {
            view.camTrack = null;
            view.screenTrack = null;
            view.camLive = false;
            view.screenLive = false;
            view.media = 'connecting';
            view.stats = emptyStats();
        }
    }

    private dropPeer(id: string) {
        const link = this.links.get(id);
        if (!link) return;
        this.closeSession(link);
        link.micAudio.srcObject = null;
        link.screenAudio.srcObject = null;
        this.links.delete(id);
    }

    /** Bitrate caps scale with the size of the call: a mesh sends one copy of each stream per peer. */
    private applyAllEncodings() {
        for (const link of this.links.values()) void this.applyEncodings(link);
    }

    private async applyEncodings(link: PeerLink) {
        const pc = link.pc;
        if (!pc || pc.connectionState !== 'connected') return;
        const peers = Math.max(1, this.state.peers.length);
        const transceivers = pc.getTransceivers();
        await setSenderLimits(transceivers[CAMERA]?.sender, Math.max(250_000, Math.round(1_500_000 / Math.ceil(peers / 2))), 'balanced');
        await setSenderLimits(transceivers[SCREEN]?.sender, Math.max(800_000, Math.round(3_000_000 / Math.ceil(peers / 3))),
            this.state.prefs.smoothScreenShare ? 'maintain-framerate' : 'maintain-resolution');
    }

    // ───────────────────────────── local media ─────────────────────────────

    async acquireMic(): Promise<boolean> {
        const local = this.state.local;
        if (!navigator.mediaDevices?.getUserMedia) {
            local.micError = 'Media devices need HTTPS.';
            return false;
        }
        const prefs = this.state.prefs;
        const constraints = (deviceId: string | null): MediaTrackConstraints => ({
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
            echoCancellation: true,
            noiseSuppression: prefs.noiseSuppression,
            autoGainControl: true,
        });
        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: constraints(prefs.micId) });
        } catch (error) {
            const name = (error as { name?: string })?.name;
            if (prefs.micId && (name === 'OverconstrainedError' || name === 'NotFoundError')) {
                try {
                    stream = await navigator.mediaDevices.getUserMedia({ audio: constraints(null) });
                } catch (retryError) {
                    local.micError = describeMediaError(retryError, 'microphone');
                    return false;
                }
            } else {
                local.micError = describeMediaError(error, 'microphone');
                return false;
            }
        }
        if (this.destroyed) {
            stream.getTracks().forEach(t => t.stop());
            return false;
        }
        const track = stream.getAudioTracks()[0];
        if (!track) return false;
        const previous = this.micTrack;
        this.micTrack = track;
        track.enabled = local.micOn || local.pttHeld;
        track.onended = () => {
            if (this.micTrack !== track) return;
            this.micTrack = null;
            local.micReady = false;
            this.notify('Microphone disconnected', 'warn');
            void this.replaceSlot(MIC, null);
            this.sendMediaState();
            // Unplugged: fall back to whatever is the default now.
            setTimeout(() => { if (this.isActive() && !this.micTrack) void this.acquireMic().then(() => this.sendMediaState()); }, 800);
        };
        local.micError = '';
        local.micReady = true;
        this.setupMeter(track);
        await this.replaceSlot(MIC, track);
        previous?.stop();
        void this.refreshDevices();
        return true;
    }

    setMicOn(on: boolean) {
        const local = this.state.local;
        if (on && !this.micTrack) {
            void this.acquireMic().then(ok => {
                if (!ok) {
                    this.notify(local.micError || 'Microphone unavailable.', 'warn');
                    return;
                }
                local.micOn = true;
                if (this.micTrack) this.micTrack.enabled = true;
                this.sendMediaState();
            });
            return;
        }
        local.micOn = on;
        local.pttHeld = false;
        if (this.micTrack) this.micTrack.enabled = on;
        this.sendMediaState();
    }

    toggleMic() {
        this.setMicOn(!this.state.local.micOn);
    }

    /** Hold-to-talk while muted. */
    pushToTalk(down: boolean) {
        const local = this.state.local;
        if (!this.state.prefs.pushToTalk || local.micOn || !this.micTrack) {
            local.pttHeld = false;
            return;
        }
        if (local.pttHeld === down) return;
        local.pttHeld = down;
        this.micTrack.enabled = down;
        this.sendMediaState();
    }

    async setCamOn(on: boolean): Promise<void> {
        const local = this.state.local;
        if (!on) {
            const track = this.camTrack;
            this.camTrack = null;
            local.camTrack = null;
            local.camOn = false;
            await this.replaceSlot(CAMERA, null);
            track?.stop();
            this.sendMediaState();
            return;
        }
        try {
            const track = await this.openCamera(this.state.prefs.camId);
            if (this.destroyed) {
                track.stop();
                return;
            }
            const previous = this.camTrack;
            this.camTrack = track;
            local.camTrack = markRaw(track);
            local.camOn = true;
            local.camError = '';
            local.facing = facingOf(track);
            track.contentHint = 'motion';
            track.onended = () => { if (this.camTrack === track) void this.setCamOn(false); };
            await this.replaceSlot(CAMERA, track);
            previous?.stop();
            this.sendMediaState();
            void this.refreshDevices();
        } catch (error) {
            local.camError = describeMediaError(error, 'camera');
            local.camOn = false;
            this.notify(local.camError, 'warn');
        }
    }

    toggleCam() {
        void this.setCamOn(!this.state.local.camOn);
    }

    private async openCamera(deviceId: string | null): Promise<MediaStreamTrack> {
        const video: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } };
        if (deviceId) video.deviceId = { exact: deviceId };
        else video.facingMode = { ideal: this.state.local.facing };
        try {
            return (await navigator.mediaDevices.getUserMedia({ video })).getVideoTracks()[0];
        } catch (error) {
            const name = (error as { name?: string })?.name;
            if (!deviceId || (name !== 'OverconstrainedError' && name !== 'NotFoundError')) throw error;
            delete video.deviceId;
            return (await navigator.mediaDevices.getUserMedia({ video })).getVideoTracks()[0];
        }
    }

    /** Next camera in the list (front/back on a phone). */
    async switchCamera() {
        const cams = this.state.devices.cams;
        if (cams.length < 2) return;
        const currentId = this.camTrack?.getSettings().deviceId ?? this.state.prefs.camId;
        const index = cams.findIndex(c => c.id === currentId);
        await this.selectDevice('cam', cams[(index + 1) % cams.length].id);
    }

    async toggleScreen() {
        if (this.state.local.screenOn) {
            await this.stopScreen();
            return;
        }
        if (!navigator.mediaDevices?.getDisplayMedia) return;
        let stream: MediaStream;
        const video = { frameRate: { ideal: 30, max: 60 } };
        const hints = { selfBrowserSurface: 'exclude', surfaceSwitching: 'include', systemAudio: 'include' };
        try {
            stream = await navigator.mediaDevices.getDisplayMedia({
                video,
                audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
                ...hints,
            } as DisplayMediaStreamOptions);
        } catch (error) {
            const name = (error as { name?: string })?.name;
            if (name === 'NotAllowedError' || name === 'AbortError') return; // the picker was cancelled
            if (name !== 'TypeError' && name !== 'NotSupportedError') {
                this.notify(describeMediaError(error, 'screen'), 'warn');
                return;
            }
            // Browsers without audio capture reject the audio constraint.
            try {
                stream = await navigator.mediaDevices.getDisplayMedia({ video, audio: false });
            } catch (retryError) {
                const retryName = (retryError as { name?: string })?.name;
                if (retryName !== 'NotAllowedError' && retryName !== 'AbortError') this.notify(describeMediaError(retryError, 'screen'), 'warn');
                return;
            }
        }
        if (this.destroyed || !this.isActive()) {
            stream.getTracks().forEach(t => t.stop());
            return;
        }
        const screen = stream.getVideoTracks()[0];
        const audio = stream.getAudioTracks()[0] ?? null;
        screen.contentHint = this.state.prefs.smoothScreenShare ? 'motion' : 'detail';
        if (audio) audio.contentHint = 'music';
        screen.onended = () => { if (this.screenTrack === screen) void this.stopScreen(); };
        this.screenTrack = screen;
        this.screenAudioTrack = audio;
        const local = this.state.local;
        local.screenOn = true;
        local.screenAudio = !!audio;
        local.screenTrack = markRaw(screen);
        await Promise.all([this.replaceSlot(SCREEN, screen), this.replaceSlot(SCREEN_AUDIO, audio)]);
        this.sendMediaState();
    }

    async stopScreen() {
        const local = this.state.local;
        local.screenOn = false;
        local.screenAudio = false;
        local.screenTrack = null;
        const tracks = [this.screenTrack, this.screenAudioTrack];
        this.screenTrack = null;
        this.screenAudioTrack = null;
        await Promise.all([this.replaceSlot(SCREEN, null), this.replaceSlot(SCREEN_AUDIO, null)]);
        tracks.forEach(t => t?.stop());
        this.sendMediaState();
    }

    private stopScreenTracks() {
        this.screenTrack?.stop();
        this.screenAudioTrack?.stop();
        this.screenTrack = null;
        this.screenAudioTrack = null;
        this.state.local.screenOn = false;
        this.state.local.screenAudio = false;
        this.state.local.screenTrack = null;
    }

    private sendMediaState() {
        const local = this.state.local;
        this.send('media-state', null, {
            isMuted: !this.micTrack || !(local.micOn || local.pttHeld),
            hasVideo: local.camOn,
            isScreenSharing: local.screenOn,
            hasScreenAudio: local.screenOn && local.screenAudio,
        });
    }

    async selectDevice(kind: 'mic' | 'cam' | 'speaker', id: string | null) {
        if (kind === 'mic') {
            this.setPref('micId', id);
            await this.acquireMic();
        } else if (kind === 'cam') {
            this.setPref('camId', id);
            if (this.state.local.camOn) await this.setCamOn(true);
        } else {
            this.setPref('speakerId', id);
            if (!this.state.canPickSpeaker) return;
            for (const link of this.links.values()) {
                for (const audio of [link.micAudio, link.screenAudio]) (audio as any).setSinkId(id ?? '').catch(() => undefined);
            }
        }
    }

    async setNoiseSuppression(on: boolean) {
        this.setPref('noiseSuppression', on);
        if (this.micTrack) await this.acquireMic();
    }

    setPref<K extends keyof ChatPrefs>(key: K, value: ChatPrefs[K]) {
        this.state.prefs[key] = value;
        savePrefs({ ...this.state.prefs });
        if (key === 'smoothScreenShare') {
            if (this.screenTrack) this.screenTrack.contentHint = value ? 'motion' : 'detail';
            this.applyAllEncodings();
        }
        if (key === 'pushToTalk' && value && this.state.local.micOn) this.setMicOn(false);
    }

    async refreshDevices() {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        try {
            const all = await navigator.mediaDevices.enumerateDevices();
            const pick = (kind: MediaDeviceKind, label: string) => all
                .filter(d => d.kind === kind && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications')
                .map((d, i) => ({ id: d.deviceId, label: d.label || `${label} ${i + 1}` }));
            this.state.devices.mics = pick('audioinput', 'Microphone');
            this.state.devices.cams = pick('videoinput', 'Camera');
            this.state.devices.speakers = this.state.canPickSpeaker ? pick('audiooutput', 'Speaker') : [];
        } catch { /* devices unavailable */ }
    }

    // ───────────────────────────── levels, stats, housekeeping ─────────────────────────────

    private setupMeter(track: MediaStreamTrack) {
        try {
            this.teardownMeter();
            this.audioCtx ??= new AudioContext();
            // A clone that stays enabled, so "you're muted" can still hear you talking.
            this.meterTrack = track.clone();
            this.meterTrack.enabled = true;
            this.meterSource = this.audioCtx.createMediaStreamSource(new MediaStream([this.meterTrack]));
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 512;
            this.meterSource.connect(this.analyser);
            this.meterBuffer = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));
        } catch {
            this.teardownMeter();
        }
    }

    private teardownMeter() {
        try { this.meterSource?.disconnect(); } catch { /* not connected */ }
        this.meterTrack?.stop();
        this.meterTrack = null;
        this.meterSource = null;
        this.analyser = null;
        this.meterBuffer = null;
        this.state.local.micLevel = 0;
        this.state.local.speaking = false;
    }

    private tick() {
        if (this.destroyed) return;
        const now = Date.now();
        this.ticks++;
        this.measureLocal(now);
        if (this.state.phase === 'live' || this.state.phase === 'reconnecting') {
            this.measurePeers(now);
            this.heartbeat(now);
            if (this.ticks % 20 === 0) void this.collectStats();
            for (const [id, link] of this.links) {
                if (link.unconfirmedUntil && now > link.unconfirmedUntil) this.removePeer(id, true);
            }
        }
    }

    private measureLocal(now: number) {
        const local = this.state.local;
        if (!this.analyser || !this.meterBuffer) return;
        this.analyser.getFloatTimeDomainData(this.meterBuffer);
        let sum = 0;
        for (let i = 0; i < this.meterBuffer.length; i++) sum += this.meterBuffer[i] * this.meterBuffer[i];
        const rms = Math.sqrt(sum / this.meterBuffer.length);
        const level = Math.min(1, rms * 6);
        local.micLevel = level > local.micLevel ? level : local.micLevel * 0.75 + level * 0.25;
        const loud = rms > SPEAKING_THRESHOLD_LOCAL;
        const open = local.micOn || local.pttHeld;
        if (loud) this.localSpeakingUntil = now + 350;
        this.localLoudSince = loud ? this.localLoudSince || now : 0;
        if (!open && loud && now - this.localLoudSince > 700) this.mutedTalkingUntil = now + 2500;
        local.speaking = open && now < this.localSpeakingUntil;
        local.mutedTalking = !open && now < this.mutedTalkingUntil;
    }

    private measurePeers(now: number) {
        for (const view of this.state.peers) {
            const link = this.links.get(view.id);
            const receiver = link?.receivers[MIC];
            let level = 0;
            if (receiver && typeof receiver.getSynchronizationSources === 'function') {
                for (const source of receiver.getSynchronizationSources()) {
                    // Browsers disagree on the clock behind `timestamp`; accept either as "recent".
                    const age = Math.min(Math.abs(Date.now() - source.timestamp), Math.abs(performance.now() - source.timestamp));
                    if (age < 1000) level = Math.max(level, source.audioLevel ?? 0);
                }
            }
            if (link && level > SPEAKING_THRESHOLD_REMOTE) link.speakingUntil = now + 400;
            view.level = level > view.level ? level : view.level * 0.7 + level * 0.3;
            const speaking = !!link && !view.isMuted && now < link.speakingUntil;
            if (view.speaking !== speaking) view.speaking = speaking;
        }
    }

    private async collectStats() {
        for (const view of this.state.peers) {
            const link = this.links.get(view.id);
            const pc = link?.pc;
            if (!link || !pc || pc.connectionState !== 'connected') {
                if (view.stats.rtt !== null) view.stats = emptyStats();
                continue;
            }
            try {
                const report = await pc.getStats();
                const byId = new Map<string, any>();
                report.forEach((s: any) => byId.set(s.id, s));
                let pair: any = null;
                report.forEach((s: any) => {
                    if (s.type === 'transport' && s.selectedCandidatePairId) pair = byId.get(s.selectedCandidatePairId) ?? pair;
                });
                if (!pair) report.forEach((s: any) => { if (s.type === 'candidate-pair' && (s.selected || (s.nominated && s.state === 'succeeded'))) pair ??= s; });
                const localCandidate = pair ? byId.get(pair.localCandidateId) : null;
                const remoteCandidate = pair ? byId.get(pair.remoteCandidateId) : null;
                const route: PeerStats['route'] = !pair ? null
                    : localCandidate?.candidateType === 'relay' || remoteCandidate?.candidateType === 'relay' ? 'relay'
                        : localCandidate?.candidateType === 'host' && remoteCandidate?.candidateType === 'host' ? 'lan' : 'direct';
                const rtt = typeof pair?.currentRoundTripTime === 'number' ? Math.round(pair.currentRoundTripTime * 1000) : null;

                let bytes = 0;
                let lost = 0;
                let received = 0;
                report.forEach((s: any) => {
                    if (s.type !== 'inbound-rtp') return;
                    bytes += s.bytesReceived ?? 0;
                    if (s.kind === 'audio') {
                        lost += s.packetsLost ?? 0;
                        received += s.packetsReceived ?? 0;
                    }
                });
                const at = Date.now();
                const previous = link.lastStats;
                link.lastStats = { at, bytes, lost, received };
                let loss: number | null = null;
                let kbpsIn: number | null = null;
                if (previous && at > previous.at) {
                    const dLost = Math.max(0, lost - previous.lost);
                    const dReceived = Math.max(0, received - previous.received);
                    loss = dLost + dReceived > 0 ? Math.round((dLost / (dLost + dReceived)) * 1000) / 10 : 0;
                    kbpsIn = Math.max(0, Math.round(((bytes - previous.bytes) * 8) / (at - previous.at)));
                }
                const quality: Quality | null = rtt === null ? null
                    : rtt > 400 || (loss ?? 0) > 8 ? 'poor'
                        : rtt > 200 || (loss ?? 0) > 2 ? 'fair' : 'good';
                view.stats = { rtt, loss, route, quality, kbpsIn };
            } catch { /* the connection closed mid-read */ }
        }
    }

    // ───────────────────────────── chat ─────────────────────────────

    private mergeChat(history: ServerChatMessage[]) {
        let added = false;
        for (const message of history) {
            if (!message?.id || this.state.chat.some(c => c.id === message.id)) continue;
            this.state.chat.push(this.toEntry(message, message.senderId));
            added = true;
        }
        if (added) this.state.chat.sort((a, b) => a.ts - b.ts);
        if (this.state.chat.length > MAX_CHAT) this.state.chat.splice(0, this.state.chat.length - MAX_CHAT);
    }

    private toEntry(message: ServerChatMessage, senderId?: string): ChatEntry {
        return {
            key: message.id,
            id: message.id,
            senderId: message.senderId ?? senderId ?? '',
            senderName: message.senderName ?? 'Someone',
            senderIsGuest: !!message.senderIsGuest,
            text: String(message.text ?? ''),
            ts: Date.parse(message.ts) || Date.now(),
            state: 'sent',
        };
    }

    private onChat(message: ServerChatMessage, senderId?: string) {
        if (!message?.text) return;
        if (!message.id) {
            // A server from before protocol 2 echoes the message as sent: no id, name or time.
            const from = senderId ?? '';
            message = {
                ...message,
                id: `legacy-${from}-${message.clientMsgId ?? randomId()}`,
                senderId: from,
                senderName: from === this.state.selfId ? this.state.selfName : this.peerView(from)?.name ?? 'Someone',
                ts: new Date().toISOString(),
            };
        }
        if (this.state.chat.some(c => c.id === message.id)) return;
        const entry = this.toEntry(message, senderId);
        if (message.clientMsgId) {
            const mine = this.state.chat.find(c => c.clientMsgId === message.clientMsgId && c.state !== 'sent');
            if (mine) {
                Object.assign(mine, { ...entry, key: mine.key, clientMsgId: mine.clientMsgId });
                return;
            }
        }
        this.state.chat.push(entry);
        if (this.state.chat.length > MAX_CHAT) this.state.chat.splice(0, this.state.chat.length - MAX_CHAT);
        if (entry.senderId !== this.state.selfId && !this.chatOpen) {
            this.state.unread++;
            this.state.lastIncoming = entry;
        }
    }

    private systemLine(text: string) {
        this.state.chat.push({
            key: `sys-${randomId()}`, id: null, senderId: '', senderName: '', senderIsGuest: false, text, ts: Date.now(), state: 'sent', system: true,
        });
    }

    sendChat(text: string): boolean {
        const clean = text.trim();
        if (!clean) return false;
        const clientMsgId = randomId();
        const entry: ChatEntry = {
            key: clientMsgId,
            id: null,
            senderId: this.state.selfId,
            senderName: this.state.selfName,
            senderIsGuest: !this.state.signedIn,
            text: clean,
            ts: Date.now(),
            state: 'pending',
            clientMsgId,
        };
        this.state.chat.push(entry);
        this.deliverChat(clientMsgId);
        return true;
    }

    retryChat(key: string) {
        const entry = this.state.chat.find(c => c.key === key);
        if (!entry || entry.state !== 'failed' || !entry.clientMsgId) return;
        entry.state = 'pending';
        this.deliverChat(entry.clientMsgId);
    }

    private deliverChat(clientMsgId: string) {
        const entry = this.state.chat.find(c => c.clientMsgId === clientMsgId);
        if (!entry) return;
        if (!this.send('chat-message', null, { text: entry.text, clientMsgId })) {
            entry.state = 'failed';
            return;
        }
        setTimeout(() => {
            const pending = this.state.chat.find(c => c.clientMsgId === clientMsgId);
            if (pending && pending.state === 'pending') pending.state = 'failed';
        }, 8000);
    }

    setChatOpen(open: boolean) {
        this.chatOpen = open;
        if (open) {
            this.state.unread = 0;
            this.state.lastIncoming = null;
        }
    }

    // ───────────────────────────── moderation and settings ─────────────────────────────

    moderate(peerId: string, action: 'mute' | 'kick' | 'ban') {
        this.send('moderate-participant', null, { targetId: peerId, action });
    }

    setLocked(locked: boolean) {
        this.send('room-settings', null, { locked });
    }

    renameRoom(name: string) {
        const clean = name.trim();
        if (clean) this.send('room-settings', null, { name: clean });
    }

    setPeerVolume(peerId: string, volume: number) {
        const view = this.peerView(peerId);
        const link = this.links.get(peerId);
        const value = Math.min(1, Math.max(0, volume));
        if (view) view.volume = value;
        if (link) link.micAudio.volume = link.screenAudio.volume = value;
    }

    togglePeerMute(peerId: string) {
        const view = this.peerView(peerId);
        const link = this.links.get(peerId);
        if (!view) return;
        view.localMute = !view.localMute;
        if (link) link.micAudio.muted = link.screenAudio.muted = view.localMute;
    }

    /** After the browser blocked autoplay: one click starts every stream. */
    resumeAudio() {
        this.state.audioBlocked = false;
        void this.audioCtx?.resume();
        for (const link of this.links.values()) {
            if (link.micAudio.srcObject) this.play(link.micAudio);
            if (link.screenAudio.srcObject) this.play(link.screenAudio);
        }
    }

    notify(text: string, tone: Notice['tone'] = 'info') {
        const id = ++this.noticeSeq;
        this.state.notices.push({ id, text, tone });
        if (this.state.notices.length > 4) this.state.notices.shift();
        setTimeout(() => this.dismissNotice(id), tone === 'error' ? 7000 : 4500);
    }

    dismissNotice(id: number) {
        const index = this.state.notices.findIndex(n => n.id === id);
        if (index >= 0) this.state.notices.splice(index, 1);
    }
}

function facingOf(track: MediaStreamTrack): 'user' | 'environment' {
    const facing = track.getSettings?.().facingMode;
    if (facing === 'environment') return 'environment';
    if (facing === 'user') return 'user';
    return /back|rear|environment/i.test(track.label) ? 'environment' : 'user';
}

async function setSenderLimits(sender: RTCRtpSender | undefined, maxBitrate: number, degradation: RTCDegradationPreference) {
    if (!sender) return;
    try {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) return; // not negotiated yet; applied once connected
        let changed = false;
        for (const encoding of params.encodings) {
            if (encoding.maxBitrate !== maxBitrate) {
                encoding.maxBitrate = maxBitrate;
                changed = true;
            }
        }
        if (params.degradationPreference !== degradation) {
            params.degradationPreference = degradation;
            changed = true;
        }
        if (!changed) return;
        try {
            await sender.setParameters(params);
        } catch {
            // Some browsers refuse degradationPreference; the bitrate cap alone still helps.
            delete params.degradationPreference;
            await sender.setParameters(params);
        }
    } catch { /* not supported here */ }
}
