/* Per-browser talk-mode preferences. Storage can be blocked (private windows, cleared site data), so
   every access is guarded and everything has a default. */

export interface TalkPrefs {
    /** Which composer the KliveAgent page opens with. */
    mode: 'type' | 'talk';
    micId: string | null;
    /** A GPT-Live voice; null = the server's default (KliveAgent_LiveVoice). */
    voice: string | null;
    showLatency: boolean;
}

// The same key as before GPT-Live, so the page still opens in the mode it was left in; preferences
// the old talk mode had (hands-free, speed, sensitivity, headphones) are simply dropped.
const PREFS_KEY = 'kliveagent.talk:v1';

export const DEFAULT_TALK_PREFS: TalkPrefs = {
    mode: 'type',
    micId: null,
    voice: null,
    showLatency: false,
};

export function loadTalkPrefs(): TalkPrefs {
    try {
        const raw = localStorage.getItem(PREFS_KEY);
        if (!raw) return { ...DEFAULT_TALK_PREFS };
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_TALK_PREFS };
        return {
            mode: parsed.mode === 'talk' ? 'talk' : 'type',
            micId: typeof parsed.micId === 'string' ? parsed.micId : null,
            // A Kokoro voice from the old talk mode means nothing to GPT-Live.
            voice: typeof parsed.voice === 'string' && !/^[a-z]{2}_/.test(parsed.voice) ? parsed.voice : null,
            showLatency: parsed.showLatency === true,
        };
    } catch {
        return { ...DEFAULT_TALK_PREFS };
    }
}

export function saveTalkPrefs(prefs: TalkPrefs) {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* storage blocked */ }
}
