/* Turn-taking for talk mode. Fed one voice-activity probability per audio frame (32 ms at 16 kHz), it
   decides when Klives started speaking, when he paused, and when his turn is over, and emits the audio
   that belongs to the turn as it goes (so the server has it all the moment the turn ends).

   The commit delay is the main latency this controls. It adapts: the server reads the provisional
   transcript taken at the first pause and says whether the sentence sounded finished. "Restart the
   trader." commits quickly; "check the logs and, um" waits. Push-to-talk skips the wait entirely. */

export type EndpointHint = 'complete' | 'incomplete' | null;

export interface EndpointerOptions {
    /** Probability at which a frame counts as speech when nothing is playing. */
    startProb: number;
    /** Consecutive speech frames needed to start a turn. */
    startFrames: number;
    /** Below this a frame counts as silence. */
    stopProb: number;
    /** Silence that counts as a pause (the server transcribes speculatively). */
    pauseMs: number;
    commitCompleteMs: number;
    commitDefaultMs: number;
    commitIncompleteMs: number;
    /** A turn with less speech than this is a cough or a click. */
    minSpeechMs: number;
    maxUtteranceMs: number;
    /** Audio kept from before the start was detected, so the first syllable is not clipped. */
    preRollMs: number;
    /** While the agent is speaking: stricter, so its own voice leaking into the mic is not a barge-in. */
    bargeInProb: number;
    bargeInMs: number;
    frameMs: number;
    /** Multiplies every commit delay (0.6 = snappier, 1.6 = more patient). */
    sensitivity: number;
}

export const DEFAULT_ENDPOINTER: EndpointerOptions = {
    startProb: 0.6,
    startFrames: 2,
    stopProb: 0.35,
    pauseMs: 256,
    commitCompleteMs: 450,
    commitDefaultMs: 750,
    commitIncompleteMs: 1100,
    minSpeechMs: 250,
    maxUtteranceMs: 45_000,
    preRollMs: 320,
    bargeInProb: 0.85,
    bargeInMs: 200,
    frameMs: 32,
    sensitivity: 1,
};

/** The relaxed barge-in used with headphones, where the agent's voice cannot reach the mic. */
export const HEADPHONE_BARGE_IN = { bargeInProb: 0.6, bargeInMs: 64 };

export type EndpointerEvent =
    | { type: 'start'; utt: number }
    | { type: 'audio'; utt: number; frame: Float32Array }
    | { type: 'pause'; utt: number }
    | { type: 'resume'; utt: number }
    | { type: 'commit'; utt: number; endpointMs: number }
    | { type: 'cancel'; utt: number }
    /** Speech started while the agent was talking: stop its audio now. Precedes the 'start'. */
    | { type: 'bargeIn' };

type State = 'idle' | 'speaking';

export class Endpointer {
    options: EndpointerOptions;
    private state: State = 'idle';
    private utt = 0;
    private run = 0;
    private silenceMs = 0;
    private speechMs = 0;
    private durationMs = 0;
    private paused = false;
    private hint: EndpointHint = null;
    private playing = false;
    private handsFree = true;
    private pttHeld = false;
    private heldMs = 0;
    private readonly preRoll: Float32Array[] = [];

    constructor(options: Partial<EndpointerOptions> = {}) {
        this.options = { ...DEFAULT_ENDPOINTER, ...options };
    }

    get speaking(): boolean { return this.state === 'speaking'; }
    get utterance(): number { return this.utt; }

    configure(options: Partial<EndpointerOptions>) {
        this.options = { ...this.options, ...options };
    }

    /** The server's verdict on the provisional transcript of the current utterance. */
    setHint(utt: number, hint: EndpointHint) {
        if (utt === this.utt && this.state === 'speaking') this.hint = hint;
    }

    setPlaying(playing: boolean) { this.playing = playing; }

    setHandsFree(handsFree: boolean) {
        this.handsFree = handsFree;
        if (!handsFree && this.state === 'speaking' && !this.pttHeld) this.reset();
    }

    /** Push-to-talk pressed: a turn starts now, whatever the detector thinks. */
    pttDown(): EndpointerEvent[] {
        if (this.pttHeld) return [];
        this.pttHeld = true;
        this.heldMs = 0;
        const events: EndpointerEvent[] = [];
        if (this.playing) events.push({ type: 'bargeIn' });
        if (this.state !== 'speaking') events.push(...this.begin());
        return events;
    }

    /** Push-to-talk released: the turn is over now — no silence to wait for. A hold too short to say
     *  anything is an accidental tap; how loud it was does not matter, he meant to talk. */
    pttUp(): EndpointerEvent[] {
        if (!this.pttHeld) return [];
        this.pttHeld = false;
        if (this.state !== 'speaking') return [];
        const utt = this.utt;
        const held = this.heldMs;
        this.reset();
        return [held >= this.options.minSpeechMs ? { type: 'commit', utt, endpointMs: 0 } : { type: 'cancel', utt }];
    }

    reset() {
        this.state = 'idle';
        this.silenceMs = 0;
        this.speechMs = 0;
        this.durationMs = 0;
        this.paused = false;
        this.hint = null;
        this.run = 0;
    }

    /** One frame of 16 kHz audio and its speech probability. */
    process(prob: number, frame: Float32Array): EndpointerEvent[] {
        const o = this.options;
        const events: EndpointerEvent[] = [];

        if (this.state === 'idle') {
            this.remember(frame);
            if (!this.handsFree) return events; // push-to-talk: only the key starts a turn
            const threshold = this.playing ? o.bargeInProb : o.startProb;
            const needed = this.playing ? Math.max(1, Math.ceil(o.bargeInMs / o.frameMs)) : o.startFrames;
            this.run = prob >= threshold ? this.run + 1 : 0;
            if (this.run < needed) return events;
            if (this.playing) events.push({ type: 'bargeIn' });
            events.push(...this.begin());
            return events;
        }

        events.push({ type: 'audio', utt: this.utt, frame });
        this.durationMs += o.frameMs;

        if (this.pttHeld) {
            this.heldMs += o.frameMs;
            if (prob >= o.stopProb) this.speechMs += o.frameMs;
            if (this.durationMs >= o.maxUtteranceMs) {
                this.pttHeld = false;
                events.push(...this.finish(0));
            }
            return events;
        }

        if (prob >= o.stopProb) {
            this.speechMs += o.frameMs;
            this.silenceMs = 0;
            if (this.paused) {
                this.paused = false;
                this.hint = null;
                events.push({ type: 'resume', utt: this.utt });
            }
        } else {
            this.silenceMs += o.frameMs;
            if (!this.paused && this.silenceMs >= o.pauseMs) {
                this.paused = true;
                events.push({ type: 'pause', utt: this.utt });
            }
            if (this.silenceMs >= this.commitDelay()) {
                events.push(...this.finish(this.silenceMs));
                return events;
            }
        }

        if (this.durationMs >= o.maxUtteranceMs) events.push(...this.finish(this.silenceMs));
        return events;
    }

    /** How long a silence ends the turn right now. */
    commitDelay(): number {
        const o = this.options;
        const base = this.hint === 'complete' ? o.commitCompleteMs
            : this.hint === 'incomplete' ? o.commitIncompleteMs
                : o.commitDefaultMs;
        return Math.max(o.pauseMs + o.frameMs, base * o.sensitivity);
    }

    private begin(): EndpointerEvent[] {
        this.state = 'speaking';
        this.utt = (this.utt % 65535) + 1;
        this.silenceMs = 0;
        this.speechMs = this.run * this.options.frameMs;
        this.durationMs = 0;
        this.paused = false;
        this.hint = null;
        this.run = 0;
        const events: EndpointerEvent[] = [{ type: 'start', utt: this.utt }];
        for (const frame of this.preRoll.splice(0)) {
            events.push({ type: 'audio', utt: this.utt, frame });
            this.durationMs += this.options.frameMs;
        }
        return events;
    }

    private finish(endpointMs: number): EndpointerEvent[] {
        const utt = this.utt;
        const enough = this.speechMs >= this.options.minSpeechMs;
        this.reset();
        return [enough ? { type: 'commit', utt, endpointMs } : { type: 'cancel', utt }];
    }

    private remember(frame: Float32Array) {
        this.preRoll.push(frame);
        const keep = Math.max(1, Math.round(this.options.preRollMs / this.options.frameMs));
        while (this.preRoll.length > keep) this.preRoll.shift();
    }
}

/** Float samples in -1..1 → little-endian PCM16, the wire format. */
export function toPcm16(frame: Float32Array): Int16Array {
    const out = new Int16Array(frame.length);
    for (let i = 0; i < frame.length; i++) {
        const s = Math.max(-1, Math.min(1, frame[i]));
        out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
}
