/* Microphone → 16 kHz frames with a speech probability each.

   Primary: Silero VAD (via @ricky0123/vad-web on onnxruntime-web), which tells speech from keyboards,
   fans and music far better than loudness can. Its scripts, model and wasm are self-hosted under
   /talk/ (copied there by scripts/copy-talk-assets.mjs) and loaded only when talk mode starts, so
   nobody downloads them who never talks.

   Fallback: if any of that fails to load, a small resampling worklet plus an adaptive loudness gate,
   so talk mode still works — just less discerning about what counts as speech. */

export interface Detector {
    kind: 'silero' | 'energy';
    stop(): Promise<void>;
}

export interface DetectorOptions {
    ctx: AudioContext;
    stream: MediaStream;
    /** Called once per 32 ms frame (512 samples at 16 kHz), probability 0..1. */
    onFrame: (probability: number, frame: Float32Array) => void;
    prefer?: 'silero' | 'energy';
    assetBase?: string;
}

const ASSET_BASE = '/talk/';

export async function startDetector(options: DetectorOptions): Promise<Detector> {
    if (options.prefer !== 'energy') {
        try {
            return await startSilero(options);
        } catch (error) {
            console.warn('[talk] Silero VAD unavailable, using the loudness detector instead:', error);
        }
    }
    return startEnergy(options);
}

// ── Silero ──

const loadedScripts = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
    let pending = loadedScripts.get(src);
    if (!pending) {
        pending = new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => { loadedScripts.delete(src); reject(new Error(`Could not load ${src}`)); };
            document.head.appendChild(script);
        });
        loadedScripts.set(src, pending);
    }
    return pending;
}

async function startSilero({ ctx, stream, onFrame, assetBase = ASSET_BASE }: DetectorOptions): Promise<Detector> {
    await loadScript(`${assetBase}ort.wasm.min.js`);
    const ort = (window as any).ort;
    if (!ort?.env?.wasm) throw new Error('onnxruntime-web did not initialise');
    // Single-threaded: the threaded build needs cross-origin isolation, and a 2 MB model does not need it.
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = assetBase;
    await loadScript(`${assetBase}vad.bundle.min.js`);
    const vad = (window as any).vad;
    if (!vad?.MicVAD) throw new Error('vad-web did not initialise');

    const micVad = await vad.MicVAD.new({
        model: 'v5',
        baseAssetPath: assetBase,
        onnxWASMBasePath: assetBase,
        audioContext: ctx,
        // Our stream, our lifecycle: vad-web must not stop or replace it.
        getStream: async () => stream,
        pauseStream: async () => { /* kept open */ },
        resumeStream: async () => stream,
        startOnLoad: false,
        submitUserSpeechOnPause: false,
        // Turn-taking is ours (scripts/talk/endpointer.ts); these only keep vad-web's own segmenter quiet.
        positiveSpeechThreshold: 0.5,
        negativeSpeechThreshold: 0.35,
        redemptionMs: 1400,
        preSpeechPadMs: 300,
        minSpeechMs: 250,
        onFrameProcessed: (probabilities: { isSpeech: number }, frame: Float32Array) =>
            onFrame(probabilities?.isSpeech ?? 0, frame),
        onSpeechStart: () => { },
        onSpeechEnd: () => { },
        onVADMisfire: () => { },
    });
    await micVad.start();
    return {
        kind: 'silero',
        async stop() {
            try { await micVad.destroy(); } catch { /* already gone */ }
        },
    };
}

// ── Loudness fallback ──

// Resamples the mic to 16 kHz (linear interpolation) and posts 512-sample frames.
const CAPTURE_WORKLET = `
class TalkCapture16k extends AudioWorkletProcessor {
  constructor() { super(); this.ratio = sampleRate / 16000; this.pos = 0; this.last = 0; this.buf = new Float32Array(512); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch || ch.length === 0) return true;
    let t = this.pos;
    while (t < ch.length - 1) {
      const i = Math.floor(t);
      const f = t - i;
      const a = i < 0 ? this.last : ch[i];
      const b = ch[i + 1];
      this.buf[this.n++] = a + (b - a) * f;
      if (this.n === 512) { this.port.postMessage(this.buf.slice(0)); this.n = 0; }
      t += this.ratio;
    }
    this.pos = t - ch.length;
    this.last = ch[ch.length - 1];
    return true;
  }
}
registerProcessor('talk-capture-16k', TalkCapture16k);
`;

async function startEnergy({ ctx, stream, onFrame }: DetectorOptions): Promise<Detector> {
    const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: 'application/javascript' }));
    try { await ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, 'talk-capture-16k', { numberOfInputs: 1, numberOfOutputs: 1 });
    // A node that reaches no destination is not pulled by every engine; route it through silence.
    const sink = ctx.createGain();
    sink.gain.value = 0;
    node.connect(sink);
    sink.connect(ctx.destination);
    let floor = 0.01;
    node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        const frame = event.data;
        let sum = 0;
        for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
        const rms = Math.sqrt(sum / frame.length);
        // Noise floor: follows quiet quickly, loud slowly, so speech does not raise its own bar.
        floor = rms < floor ? floor * 0.9 + rms * 0.1 : floor + (rms - floor) * 0.002;
        const ratio = rms / Math.max(floor, 0.002);
        const probability = rms < 0.008 ? 0 : Math.max(0, Math.min(1, (ratio - 2) / 4));
        onFrame(probability, frame);
    };
    source.connect(node);
    return {
        kind: 'energy',
        async stop() {
            try { source.disconnect(); node.port.onmessage = null; node.disconnect(); sink.disconnect(); } catch { /* closed */ }
        },
    };
}
