/* Plays the agent's reply: segments arrive one by one (each a few words to a sentence of audio) and are
   scheduled back to back on one AudioContext so they sound like one continuous voice. A barge-in fades
   them out at once and reports how much was actually heard, so the agent knows where it was cut off. */

interface Scheduled {
    turn: number;
    seq: number;
    text: string;
    start: number;
    end: number;
    source: AudioBufferSourceNode;
}

interface Waiting {
    text: string;
    buffer: AudioBuffer | null; // null: the server could not synthesise this one; skip it
}

export class TalkPlayer {
    readonly ctx: AudioContext;
    private readonly output: GainNode;
    private readonly analyser: AnalyserNode;
    private readonly levelData: Float32Array;
    private turn = 0;
    private nextSeq = 1;
    private nextStart = 0;
    private readonly waiting = new Map<number, Waiting>();
    private scheduled: Scheduled[] = [];
    private readonly fillers = new Map<number, AudioBuffer>();
    private idleTimer: ReturnType<typeof setTimeout> | null = null;

    /** The first segment of a turn started playing. */
    onTurnAudible: ((turn: number) => void) | null = null;
    /** Nothing left to play. */
    onIdle: (() => void) | null = null;

    constructor(ctx: AudioContext) {
        this.ctx = ctx;
        this.output = ctx.createGain();
        this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = 512;
        this.levelData = new Float32Array(this.analyser.fftSize);
        this.output.connect(this.analyser);
        this.analyser.connect(ctx.destination);
    }

    /** Milliseconds of audio queued ahead of the playhead. */
    get aheadMs(): number {
        return Math.max(0, (this.nextStart - this.ctx.currentTime) * 1000);
    }

    get playing(): boolean {
        return this.scheduled.some(s => s.end > this.ctx.currentTime);
    }

    get currentTurn(): number { return this.turn; }

    /** Output level 0..1, for the orb. */
    level(): number {
        this.analyser.getFloatTimeDomainData(this.levelData as Float32Array<ArrayBuffer>);
        let sum = 0;
        for (const v of this.levelData) sum += v * v;
        return Math.min(1, Math.sqrt(sum / this.levelData.length) * 5);
    }

    /** A new reply begins: anything left of an older one is dropped. */
    beginTurn(turn: number) {
        if (turn === this.turn) return;
        if (this.playing) this.stopSources(0.03);
        this.turn = turn;
        this.nextSeq = 1;
        this.waiting.clear();
    }

    /** A new connection numbers its turns from 1 again. */
    resetTurns() {
        if (this.playing) this.stopSources(0.03);
        this.turn = 0;
        this.nextSeq = 1;
        this.waiting.clear();
    }

    /** One segment of the reply. Segments may decode out of order; they always play in order. */
    async enqueue(turn: number, seq: number, text: string, data: ArrayBuffer | null): Promise<void> {
        if (turn !== this.turn) {
            if (turn < this.turn) return; // a reply that has already been superseded
            this.beginTurn(turn);
        }
        let buffer: AudioBuffer | null = null;
        if (data && data.byteLength > 0) {
            try { buffer = await this.ctx.decodeAudioData(data); }
            catch { buffer = null; }
        }
        if (turn !== this.turn || seq < this.nextSeq) return; // superseded while decoding
        this.waiting.set(seq, { text, buffer });
        this.drain();
    }

    private drain() {
        while (this.waiting.has(this.nextSeq)) {
            const seq = this.nextSeq++;
            const item = this.waiting.get(seq)!;
            this.waiting.delete(seq);
            if (!item.buffer) continue;
            const source = this.ctx.createBufferSource();
            source.buffer = item.buffer;
            source.connect(this.output);
            const now = this.ctx.currentTime;
            const start = Math.max(now + 0.015, this.nextStart);
            source.start(start);
            const first = !this.scheduled.some(s => s.turn === this.turn);
            const entry: Scheduled = { turn: this.turn, seq, text: item.text, start, end: start + item.buffer.duration, source };
            this.scheduled.push(entry);
            this.nextStart = entry.end;
            if (first) {
                const turn = this.turn;
                setTimeout(() => this.onTurnAudible?.(turn), Math.max(0, (start - now) * 1000));
            }
            source.onended = () => {
                this.scheduled = this.scheduled.filter(s => s !== entry);
                this.scheduleIdleCheck();
            };
        }
    }

    private scheduleIdleCheck() {
        if (this.idleTimer) clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(() => {
            this.idleTimer = null;
            if (!this.playing && this.waiting.size === 0) this.onIdle?.();
        }, 60);
    }

    /**
     * Barge-in: fade out within ~30 ms and stop. Returns what of the current turn was heard — every
     * finished segment, plus the share of the playing one that had been played, cut at a word.
     */
    stop(): { turn: number; heardText: string } | null {
        if (!this.playing && this.waiting.size === 0) return null;
        const now = this.ctx.currentTime;
        const heard: string[] = [];
        for (const s of this.scheduled.filter(x => x.turn === this.turn).sort((a, b) => a.seq - b.seq)) {
            if (s.end <= now) heard.push(s.text);
            else if (s.start < now) {
                const share = (now - s.start) / Math.max(0.001, s.end - s.start);
                const words = s.text.split(/\s+/);
                heard.push(words.slice(0, Math.floor(words.length * share)).join(' '));
            }
        }
        const turn = this.turn;
        this.stopSources(0.03);
        this.waiting.clear();
        this.nextSeq = Number.MAX_SAFE_INTEGER; // the rest of this turn is not wanted any more
        return { turn, heardText: heard.filter(Boolean).join(' ').trim() };
    }

    private stopSources(fadeSeconds: number) {
        const now = this.ctx.currentTime;
        this.output.gain.cancelScheduledValues(now);
        this.output.gain.setValueAtTime(this.output.gain.value, now);
        this.output.gain.linearRampToValueAtTime(0, now + fadeSeconds);
        const sources = this.scheduled.map(s => s.source);
        this.scheduled = [];
        this.nextStart = 0;
        setTimeout(() => {
            for (const source of sources) { try { source.stop(); } catch { /* already ended */ } }
            this.output.gain.cancelScheduledValues(this.ctx.currentTime);
            this.output.gain.setValueAtTime(1, this.ctx.currentTime);
        }, fadeSeconds * 1000 + 20);
    }

    async setFiller(index: number, data: ArrayBuffer) {
        try { this.fillers.set(index, await this.ctx.decodeAudioData(data)); } catch { /* optional */ }
    }

    /** A short "one sec" while a tool runs and nothing has been said yet. */
    playFiller(): boolean {
        if (this.playing || this.fillers.size === 0) return false;
        const choices = [...this.fillers.values()];
        const buffer = choices[Math.floor(Math.random() * choices.length)];
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.output);
        source.start();
        return true;
    }

    /** A soft two-note click: "heard you". Synthesised, so it costs nothing and plays instantly. */
    earcon() {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(660, now + 0.08);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.13);
    }

    dispose() {
        this.stopSources(0);
        if (this.idleTimer) clearTimeout(this.idleTimer);
        try { this.analyser.disconnect(); this.output.disconnect(); } catch { /* closed */ }
    }
}
