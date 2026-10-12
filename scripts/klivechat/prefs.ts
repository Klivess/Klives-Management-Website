/* Per-browser KliveChat preferences and the per-tab participant secret. Storage can be blocked (private
   windows, cleared site data), so every access is guarded and everything has a default. */

export interface ChatPrefs {
    micId: string | null;
    camId: string | null;
    speakerId: string | null;
    noiseSuppression: boolean;
    pushToTalk: boolean;
    joinMuted: boolean;
    joinWithCamera: boolean;
    smoothScreenShare: boolean;
    mirrorSelf: boolean;
    showStats: boolean;
    guestName: string;
}

const PREFS_KEY = 'klivechat:prefs:v1';
const GUEST_IDENTITY_KEY = 'klivechat-guest-identity';

export const DEFAULT_PREFS: ChatPrefs = {
    micId: null,
    camId: null,
    speakerId: null,
    noiseSuppression: true,
    pushToTalk: false,
    joinMuted: false,
    joinWithCamera: false,
    smoothScreenShare: false,
    mirrorSelf: true,
    showStats: false,
    guestName: '',
};

export function loadPrefs(): ChatPrefs {
    try {
        const raw = localStorage.getItem(PREFS_KEY);
        if (!raw) return { ...DEFAULT_PREFS };
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_PREFS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
    } catch {
        return { ...DEFAULT_PREFS };
    }
}

export function savePrefs(prefs: ChatPrefs) {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* storage blocked */ }
}

function randomToken(bytes: number): string {
    const data = new Uint8Array(bytes);
    crypto.getRandomValues(data);
    return Array.from(data, b => b.toString(36).padStart(2, '0')).join('').replace(/[^a-z0-9]/g, '').slice(0, bytes * 2);
}

/**
 * The secret this tab joins a room with. The server derives the participant id from it, so a reconnect
 * (network blip, server restart) lands back in the same seat and peers keep their media connections.
 * Per tab (sessionStorage): a second tab is a second participant.
 */
export function tabSecret(roomId: string, renew = false): string {
    const key = `klivechat:secret:${roomId}`;
    try {
        let secret = renew ? null : sessionStorage.getItem(key);
        if (!secret || secret.length < 16) {
            secret = randomToken(16);
            sessionStorage.setItem(key, secret);
        }
        return secret;
    } catch {
        return randomToken(16);
    }
}

/** A long-lived guest identity, so a ban sticks to a browser rather than a name. */
export function guestIdentity(): string {
    try {
        let identity = localStorage.getItem(GUEST_IDENTITY_KEY);
        if (!identity) {
            identity = `guest-${randomToken(12)}`;
            localStorage.setItem(GUEST_IDENTITY_KEY, identity);
        }
        return identity;
    } catch {
        return '';
    }
}

/** Set by the lobby right before it opens a room, so the room joins straight away (the click was the gesture). */
const AUTOJOIN_KEY = 'klivechat:autojoin';

export function markAutoJoin(roomId: string) {
    try { sessionStorage.setItem(AUTOJOIN_KEY, `${roomId}|${Date.now()}`); } catch { /* storage blocked */ }
}

export function consumeAutoJoin(roomId: string): boolean {
    try {
        const raw = sessionStorage.getItem(AUTOJOIN_KEY);
        sessionStorage.removeItem(AUTOJOIN_KEY);
        if (!raw) return false;
        const [id, at] = raw.split('|');
        return id === roomId && Date.now() - Number(at) < 60_000;
    } catch {
        return false;
    }
}
