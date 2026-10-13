/* Per-browser talk-mode preferences. Storage can be blocked (private windows, cleared site data), so
   every access is guarded and everything has a default. */

export interface TalkPrefs {
    /** Which composer the KliveAgent page opens with. */
    mode: 'type' | 'talk';
    /** Hands-free (the mic decides when a turn starts and ends) or hold-to-talk. */
    handsFree: boolean;
    /** Multiplies how long a pause ends a turn: lower is snappier, higher is more patient. */
    sensitivity: number;
    micId: string | null;
    /** Barge-in can be more eager when the agent's voice cannot leak into the mic. */
    headphones: boolean;
    /** null = the server's default voice / speed. */
    voice: string | null;
    speed: number | null;
    showLatency: boolean;
}

const PREFS_KEY = 'kliveagent.talk:v1';

export const DEFAULT_TALK_PREFS: TalkPrefs = {
    mode: 'type',
    handsFree: true,
    sensitivity: 1,
    micId: null,
    headphones: false,
    voice: null,
    speed: null,
    showLatency: false,
};

export function loadTalkPrefs(): TalkPrefs {
    try {
        const raw = localStorage.getItem(PREFS_KEY);
        if (!raw) return { ...DEFAULT_TALK_PREFS };
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_TALK_PREFS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
    } catch {
        return { ...DEFAULT_TALK_PREFS };
    }
}

export function saveTalkPrefs(prefs: TalkPrefs) {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* storage blocked */ }
}
