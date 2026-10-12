import { BuildKliveWsUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import type { ChatMe, RoomSummary } from './types';

/* REST calls for the lobby and the room page. Each returns data or throws an Error whose message can be
   shown as-is. */

async function readError(response: Response, fallback: string): Promise<string> {
    try {
        const text = (await response.text()).trim();
        if (text && text.length < 200 && !text.startsWith('{') && !text.startsWith('<')) return text;
    } catch { /* no body */ }
    return fallback;
}

export async function fetchMe(): Promise<ChatMe | null> {
    try {
        const response = await RequestGETFromKliveAPI('/klivechat/me', false, false);
        if (!response.ok) return null;
        const data = await response.json();
        return data?.name ? data as ChatMe : null;
    } catch {
        return null;
    }
}

export async function fetchRooms(): Promise<RoomSummary[]> {
    const response = await RequestGETFromKliveAPI('/klivechat/rooms', false, false);
    if (!response.ok) throw new Error(await readError(response, `Couldn't load rooms (${response.status}).`));
    const data = await response.json();
    return Array.isArray(data) ? data : [];
}

/** The room, or null when it doesn't exist (any other failure throws). */
export async function fetchRoom(roomId: string): Promise<RoomSummary | null> {
    const response = await RequestGETFromKliveAPI(`/klivechat/rooms?id=${encodeURIComponent(roomId)}`, false, false);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(await readError(response, `Couldn't reach KliveChat (${response.status}).`));
    return await response.json();
}

export async function createRoom(name: string, persistent = false): Promise<RoomSummary> {
    const query = new URLSearchParams({ name });
    if (persistent) query.set('persistent', 'true');
    const response = await RequestPOSTFromKliveAPI(`/klivechat/create?${query}`);
    if (!response.ok) throw new Error(await readError(response, response.status === 403 ? "You can't create rooms." : `Couldn't create the room (${response.status}).`));
    return await response.json();
}

export async function deleteRoom(roomId: string): Promise<void> {
    const response = await RequestPOSTFromKliveAPI(`/klivechat/delete?id=${encodeURIComponent(roomId)}`);
    if (!response.ok) throw new Error(await readError(response, `Couldn't delete the room (${response.status}).`));
}

export async function updateRoom(roomId: string, changes: { name?: string; persistent?: boolean; locked?: boolean }): Promise<RoomSummary> {
    const query = new URLSearchParams({ id: roomId });
    if (changes.name !== undefined) query.set('name', changes.name);
    if (changes.persistent !== undefined) query.set('persistent', String(changes.persistent));
    if (changes.locked !== undefined) query.set('locked', String(changes.locked));
    const response = await RequestPOSTFromKliveAPI(`/klivechat/update?${query}`);
    if (!response.ok) throw new Error(await readError(response, `Couldn't update the room (${response.status}).`));
    return await response.json();
}

export function roomLink(roomId: string): string {
    return `${window.location.origin}/shared/klivechat/${roomId}`;
}

/** Pulls a room id out of a pasted link, a bare id, or "klivechat/<id>". */
export function parseRoomInput(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/klivechat\/([A-Za-z0-9]{4,32})/) ?? trimmed.match(/^([A-Za-z0-9]{4,32})$/);
    return match ? match[1] : null;
}

/**
 * The live room list. Pushes a snapshot on every change; while the socket is down it falls back to polling
 * so the list never silently goes stale. Returns a stop function.
 */
export function watchRooms(handlers: {
    onRooms: (rooms: RoomSummary[]) => void;
    onStatus: (status: 'live' | 'polling' | 'error', detail?: string) => void;
}): () => void {
    let socket: WebSocket | null = null;
    let stopped = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let backoff = 1000;

    async function poll() {
        if (stopped) return;
        try {
            handlers.onRooms(await fetchRooms());
            if (!socket || socket.readyState !== WebSocket.OPEN) handlers.onStatus('polling');
        } catch (error) {
            handlers.onStatus('error', error instanceof Error ? error.message : String(error));
        }
        if (!stopped && (!socket || socket.readyState !== WebSocket.OPEN)) {
            pollTimer = setTimeout(poll, document.visibilityState === 'hidden' ? 60_000 : 15_000);
        }
    }

    function connect() {
        if (stopped) return;
        const ws = new WebSocket(BuildKliveWsUrl('/klivechat/lobby'));
        socket = ws;
        ws.onopen = () => {
            backoff = 1000;
            if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
            handlers.onStatus('live');
            pingTimer = setInterval(() => { try { ws.send('{"type":"ping"}'); } catch { /* closing */ } }, 25_000);
        };
        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message?.type === 'rooms' && Array.isArray(message.rooms)) handlers.onRooms(message.rooms);
            } catch { /* ignore malformed frames */ }
        };
        ws.onclose = () => {
            if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
            if (socket === ws) socket = null;
            if (stopped) return;
            if (!pollTimer) void poll();
            reconnectTimer = setTimeout(connect, backoff);
            backoff = Math.min(backoff * 2, 30_000);
        };
    }

    void poll();
    connect();

    return () => {
        stopped = true;
        if (pollTimer) clearTimeout(pollTimer);
        if (reconnectTimer) clearTimeout(reconnectTimer);
        if (pingTimer) clearInterval(pingTimer);
        if (socket && socket.readyState <= WebSocket.OPEN) socket.close(1000);
    };
}
