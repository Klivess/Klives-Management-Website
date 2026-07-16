<template>
  <div ref="root" class="crd" :class="{ 'crd-fullscreen': isFullscreen }">
    <!-- Toolbar -->
    <div class="crd-toolbar">
      <span class="crd-status">
        <span class="crd-dot" :class="{ 'crd-dot-live': streamConnected }"></span>
        {{ streamConnected ? 'Live' : 'Connecting…' }}
        <span class="crd-sep">·</span>
        <span :class="inputConnected ? 'crd-in-ok' : 'crd-in-no'">{{ inputConnected ? 'input ready' : 'input offline' }}</span>
        <span v-if="label" class="crd-sep">·</span>
        <span v-if="label" class="crd-label">{{ label }}</span>
      </span>

      <div class="crd-tools">
        <button
          type="button"
          class="crd-btn"
          :class="{ 'crd-btn-on': control }"
          :title="control ? 'Click to stop sending input (view only)' : 'Click to take control of this agent desktop'"
          @click="control = !control"
        >{{ control ? '🖲 Controlling' : '👁 View only' }}</button>

        <div class="crd-keys" v-if="control">
          <button type="button" class="crd-key" title="Escape" @click="pressKeys(['escape'])">Esc</button>
          <button type="button" class="crd-key" title="Tab" @click="pressKeys(['tab'])">Tab</button>
          <button type="button" class="crd-key" title="Enter" @click="pressKeys(['enter'])">⏎</button>
          <button type="button" class="crd-key" title="Select all (Ctrl+A)" @click="pressKeys(['ctrl','a'])">⌘A</button>
          <button type="button" class="crd-key" title="Paste (Ctrl+V)" @click="pressKeys(['ctrl','v'])">Paste</button>
          <button type="button" class="crd-key" title="Refresh page (F5)" @click="pressKeys(['f5'])">F5</button>
        </div>

        <button type="button" class="crd-btn" :title="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'" @click="toggleFullscreen">
          {{ isFullscreen ? '⤢ Exit' : '⤢ Full' }}
        </button>
      </div>
    </div>

    <!-- Stage: the live frame + the input-capture surface -->
    <div
      ref="stage"
      class="crd-stage"
      tabindex="0"
      :class="{ 'crd-stage-control': control }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel.prevent="onWheel"
      @contextmenu.prevent
      @keydown="onKeyDown"
    >
      <img v-if="frameSrc" ref="img" :src="frameSrc" class="crd-frame" alt="Live agent desktop" draggable="false" />
      <div v-else class="crd-empty">
        <div class="crd-empty-glyph">🖥</div>
        <p>{{ streamConnected ? 'Waiting for first frame…' : 'Connecting to the agent desktop…' }}</p>
      </div>

      <div v-if="control && !inputConnected" class="crd-note">Reconnecting input…</div>
      <div v-else-if="!control" class="crd-note crd-note-soft">View only. Press “Controlling” to drive — e.g. to solve a captcha for the agent</div>
    </div>

    <div class="crd-hint">
      When you stop controlling (or close this view) after sending input, the agent is automatically nudged to re-check its screen and continue.
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { KliveAPIUrl } from '~/scripts/APIInterface';

const props = withDefaults(defineProps<{
  containerId: string;
  label?: string;
  fps?: number;
  quality?: number;
  startControl?: boolean;
}>(), { fps: 12, quality: 60, startControl: false });

const root = ref<HTMLElement | null>(null);
const stage = ref<HTMLElement | null>(null);
const img = ref<HTMLImageElement | null>(null);
const control = ref(props.startControl);
const isFullscreen = ref(false);

function getPassword() {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(/(?:^|; )password=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : '';
}
function wsBase() { return KliveAPIUrl.replace('https', 'wss').replace('http', 'ws'); }

// ── Video stream (same endpoint as LiveDesktop, higher fps/quality for interaction) ──
const frameSrc = ref('');
const streamConnected = ref(false);
let streamWs: WebSocket | null = null;
let lastUrl = '';
let streamReconnect: ReturnType<typeof setTimeout> | null = null;
let stopped = false;

function openStream() {
  if (stopped || !props.containerId || typeof window === 'undefined') return;
  const url = `${wsBase()}/projects/containers/screen/stream?containerID=${encodeURIComponent(props.containerId)}&fps=${props.fps}&quality=${props.quality}&authorization=${encodeURIComponent(getPassword())}`;
  try {
    streamWs = new WebSocket(url);
    streamWs.binaryType = 'blob';
    streamWs.onopen = () => { streamConnected.value = true; };
    streamWs.onclose = () => { streamConnected.value = false; scheduleStreamReconnect(); };
    streamWs.onerror = () => { streamConnected.value = false; try { streamWs && streamWs.close(); } catch { /* ignore */ } };
    streamWs.onmessage = (e) => {
      if (!(e.data instanceof Blob)) return;
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = URL.createObjectURL(e.data);
      frameSrc.value = lastUrl;
    };
  } catch { scheduleStreamReconnect(); }
}
function scheduleStreamReconnect() {
  if (stopped || streamReconnect) return;
  streamReconnect = setTimeout(() => { streamReconnect = null; if (!stopped) openStream(); }, 2000);
}

// ── Input channel (two-way; same wire protocol as the host remote desktop) ──
const inputConnected = ref(false);
let inputWs: WebSocket | null = null;
let inputReconnect: ReturnType<typeof setTimeout> | null = null;

function openInput() {
  if (stopped || !props.containerId || typeof window === 'undefined') return;
  try {
    inputWs = new WebSocket(`${wsBase()}/projects/containers/remote/input?containerID=${encodeURIComponent(props.containerId)}&authorization=${encodeURIComponent(getPassword())}`);
    inputWs.onopen = () => { inputConnected.value = true; };
    inputWs.onclose = () => { inputConnected.value = false; if (!stopped) scheduleInputReconnect(); };
    inputWs.onerror = () => { try { inputWs && inputWs.close(); } catch { /* ignore */ } };
  } catch { scheduleInputReconnect(); }
}
function scheduleInputReconnect() {
  if (stopped || inputReconnect) return;
  inputReconnect = setTimeout(() => { inputReconnect = null; openInput(); }, 1500);
}
function send(obj: Record<string, unknown>) {
  if (inputWs && inputWs.readyState === WebSocket.OPEN) {
    try { inputWs.send(JSON.stringify(obj)); } catch { /* ignore */ }
  }
}

// ── Coordinate mapping: client pixel → normalized [0,1] of the streamed framebuffer ──
// Accounts for object-fit: contain letterboxing inside the stage.
function norm(e: { clientX: number; clientY: number }) {
  const el = img.value;
  if (!el || !el.naturalWidth || !el.naturalHeight) return null;
  const rect = el.getBoundingClientRect();
  const scale = Math.min(rect.width / el.naturalWidth, rect.height / el.naturalHeight);
  const dispW = el.naturalWidth * scale;
  const dispH = el.naturalHeight * scale;
  const offX = (rect.width - dispW) / 2;
  const offY = (rect.height - dispH) / 2;
  const x = (e.clientX - rect.left - offX) / dispW;
  const y = (e.clientY - rect.top - offY) / dispH;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
}

const BTN: Record<number, string> = { 0: 'left', 1: 'middle', 2: 'right' };
let pressed = false;
let lastMoveSent = 0;
let lastPt = { x: 0, y: 0 };

function onPointerDown(e: PointerEvent) {
  if (!control.value) return;
  try { stage.value && stage.value.focus(); } catch { /* ignore */ }
  const p = norm(e);
  if (!p) return;
  lastPt = p;
  pressed = true;
  send({ t: 'down', x: p.x, y: p.y, button: BTN[e.button] || 'left' });
}
function onPointerMove(e: PointerEvent) {
  if (!control.value) return;
  const now = performance.now();
  if (now - lastMoveSent < 22) return; // ~45 Hz cap
  const p = norm(e);
  if (!p) return;
  lastMoveSent = now;
  lastPt = p;
  send({ t: 'move', x: p.x, y: p.y });
}
function onPointerUp(e: PointerEvent) {
  if (!control.value) return;
  const p = norm(e) || lastPt;
  if (pressed) send({ t: 'up', x: p.x, y: p.y, button: BTN[e.button] || 'left' });
  pressed = false;
}
function onWheel(e: WheelEvent) {
  if (!control.value) return;
  const p = norm(e) || lastPt;
  const notch = (d: number) => Math.min(5, Math.max(1, Math.round(Math.abs(d) / 100)));
  const dy = e.deltaY ? -Math.sign(e.deltaY) * notch(e.deltaY) : 0;
  const dx = e.deltaX ? Math.sign(e.deltaX) * notch(e.deltaX) : 0;
  if (dy || dx) send({ t: 'scroll', x: p.x, y: p.y, dy, dx });
}

// ── Keyboard (X11 keysym names understood by the container's VNC transport) ──
const KEYMAP: Record<string, string> = {
  Enter: 'enter', Backspace: 'backspace', Tab: 'tab', Escape: 'escape', ' ': 'space',
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Delete: 'delete', Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown', Insert: 'insert',
  Control: 'ctrl', Alt: 'alt', Shift: 'shift', Meta: 'win',
};
function mapKey(k: string) {
  if (KEYMAP[k]) return KEYMAP[k];
  if (/^F\d{1,2}$/.test(k)) return k.toLowerCase();
  if (k && k.length === 1) return k.toLowerCase();
  return null;
}
function onKeyDown(e: KeyboardEvent) {
  if (!control.value) return;
  // Plain printable character → type it verbatim (handles shift/symbols/unicode correctly).
  if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    send({ t: 'text', text: e.key });
    e.preventDefault();
    return;
  }
  const name = mapKey(e.key);
  if (!name) return;
  // A lone modifier press is meaningless on its own — chords are emitted on the non-modifier key.
  if (['ctrl', 'alt', 'shift', 'win'].includes(name)) { e.preventDefault(); return; }
  const mods: string[] = [];
  if (e.ctrlKey) mods.push('ctrl');
  if (e.altKey) mods.push('alt');
  if (e.shiftKey) mods.push('shift');
  if (e.metaKey) mods.push('win');
  send({ t: 'key', keys: [...mods, name] });
  e.preventDefault();
}
function pressKeys(keys: string[]) {
  send({ t: 'key', keys });
  try { stage.value && stage.value.focus(); } catch { /* ignore */ }
}

// ── Fullscreen ──
async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) { await root.value?.requestFullscreen(); }
    else { await document.exitFullscreen(); }
  } catch { /* ignore */ }
}
function onFsChange() { isFullscreen.value = !!document.fullscreenElement; }

// ── Lifecycle ──
function start() {
  stopped = false;
  openStream();
  openInput();
}
function stop() {
  stopped = true;
  if (streamReconnect) { clearTimeout(streamReconnect); streamReconnect = null; }
  if (inputReconnect) { clearTimeout(inputReconnect); inputReconnect = null; }
  try { streamWs && streamWs.close(); } catch { /* ignore */ }
  try { inputWs && inputWs.close(); } catch { /* ignore */ }
  streamWs = null;
  inputWs = null;
  streamConnected.value = false;
  inputConnected.value = false;
}

onMounted(() => {
  start();
  document.addEventListener('fullscreenchange', onFsChange);
});
onBeforeUnmount(() => {
  stop();
  if (lastUrl) URL.revokeObjectURL(lastUrl);
  document.removeEventListener('fullscreenchange', onFsChange);
});
// A different container in the same modal → reconnect both channels cleanly.
watch(() => props.containerId, () => { stop(); start(); });

defineExpose({ controlling: control });
</script>

<style scoped>
.crd { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; background: #0d0d0d; border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; overflow: hidden; }
.crd-fullscreen { border-radius: 0; }

.crd-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 8px 12px; background: #151515; border-bottom: 1px solid rgba(255,255,255,0.06); flex: 0 0 auto; }
.crd-status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #9a9a9a; font-weight: 600; }
.crd-sep { opacity: 0.4; }
.crd-label { color: #cfcfcf; text-transform: capitalize; }
.crd-in-ok { color: #2ecf86; }
.crd-in-no { color: #e0a23a; }
.crd-dot { width: 8px; height: 8px; border-radius: 50%; background: #4a4a4a; }
.crd-dot-live { background: #ff4d4d; box-shadow: 0 0 0 0 rgba(255,77,77,0.6); animation: crd-pulse 1.6s infinite; }
@keyframes crd-pulse {
  0% { box-shadow: 0 0 0 0 rgba(255,77,77,0.55); }
  70% { box-shadow: 0 0 0 7px rgba(255,77,77,0); }
  100% { box-shadow: 0 0 0 0 rgba(255,77,77,0); }
}

.crd-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.crd-keys { display: flex; gap: 4px; }
.crd-btn, .crd-key { font-size: 12px; font-weight: 700; color: #cfcfcf; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 7px; padding: 6px 10px; cursor: pointer; }
.crd-key { padding: 6px 8px; min-width: 34px; }
.crd-btn:hover, .crd-key:hover { background: rgba(255,255,255,0.12); color: #fff; }
.crd-btn-on { background: rgba(77,158,57,0.22); border-color: rgba(77,158,57,0.5); color: #8fe07a; }

.crd-stage { position: relative; flex: 1 1 0; min-height: 0; display: flex; align-items: center; justify-content: center; background: repeating-linear-gradient(45deg, #0e0e0e, #0e0e0e 10px, #101010 10px, #101010 20px); outline: none; overflow: hidden; touch-action: none; }
.crd-stage-control { cursor: crosshair; }
.crd-frame { max-width: 100%; max-height: 100%; object-fit: contain; display: block; user-select: none; -webkit-user-drag: none; }

.crd-empty { text-align: center; color: #5a5a5a; }
.crd-empty-glyph { font-size: 40px; opacity: 0.5; }

.crd-note { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); font-size: 11px; color: #fff; background: rgba(0,0,0,0.65); padding: 4px 12px; border-radius: 999px; pointer-events: none; white-space: nowrap; }
.crd-note-soft { background: rgba(0,0,0,0.45); color: #cfcfcf; }

.crd-hint { font-size: 11px; color: #8a8a8a; padding: 8px 14px; background: #151515; border-top: 1px solid rgba(255,255,255,0.06); flex: 0 0 auto; }
</style>
