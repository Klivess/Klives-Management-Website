// Copies the files talk mode's speech detector loads at runtime into public/talk/, so they are served
// from this site (no CDN) and only downloaded when someone turns talk mode on. Run on install.
//   onnxruntime-web: the WASM-only UMD build and its single-threaded-capable wasm.
//   @ricky0123/vad-web: its UMD bundle, its audio worklet and the Silero v5 model.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'public', 'talk');
const files = [
    ['node_modules/onnxruntime-web/dist/ort.wasm.min.js', 'ort.wasm.min.js'],
    ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.wasm'],
    ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.mjs'],
    ['node_modules/@ricky0123/vad-web/dist/bundle.min.js', 'vad.bundle.min.js'],
    ['node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js', 'vad.worklet.bundle.min.js'],
    ['node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx', 'silero_vad_v5.onnx'],
];

mkdirSync(target, { recursive: true });
let copied = 0;
for (const [from, to] of files) {
    const source = join(root, from);
    if (!existsSync(source)) {
        console.warn(`[talk assets] missing ${from}; talk mode will fall back to the loudness detector.`);
        continue;
    }
    copyFileSync(source, join(target, to));
    copied++;
}
console.log(`[talk assets] ${copied}/${files.length} files in public/talk/`);
