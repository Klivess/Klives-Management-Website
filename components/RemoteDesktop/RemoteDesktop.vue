<template>
  <div ref="root" class="remote-desktop" :class="{ 'rd-fullscreen': isFullscreen }">
    <!-- Toolbar -->
    <div class="rd-toolbar">
      <span class="rd-status">
        <span class="rd-dot" :class="{ 'rd-dot-live': streamConnected }"></span>
        {{ streamConnected ? 'Live' : 'Connecting…' }}
        <span class="rd-sep">·</span>
        <span :class="inputConnected ? 'rd-in-ok' : 'rd-in-no'">{{ inputConnected ? 'input ready' : 'input offline' }}</span>
      </span>

      <div class="rd-tools">
        <button
          type="button"
          class="rd-btn"
          :class="{ 'rd-btn-on': control }"
          :title="control ? 'Click to stop sending input (view only)' : 'Click to take control'"
          @click="control = !control"
        >{{ control ? '🖲 Controlling' : '👁 View only' }}</button>

        <div class="rd-keys" v-if="control">
          <button type="button" class="rd-key" title="Escape" @click="pressKeys(['escape'])">Esc</button>
          <button type="button" class="rd-key" title="Tab" @click="pressKeys(['tab'])">Tab</button>
          <button type="button" class="rd-key" title="Enter" @click="pressKeys(['enter'])">⏎</button>
          <button type="button" class="rd-key" title="Windows key" @click="pressKeys(['win'])">⊞</button>
          <button type="button" class="rd-key" title="Select all (Ctrl+A)" @click="pressKeys(['ctrl','a'])">⌘A</button>
          <button type="button" class="rd-key" title="Paste (Ctrl+V)" @click="pressKeys(['ctrl','v'])">Paste</button>
        </div>

        <button type="button" class="rd-btn" :title="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'" @click="toggleFullscreen">
          {{ isFullscreen ? '⤢ Exit' : '⤢ Full' }}
        </button>
      </div>
    </div>

    <!-- Stage: the live frame + the input-capture surface -->
    <div
      ref="stage"
      class="rd-stage"
      tabindex="0"
      :class="{ 'rd-stage-control': control }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel.prevent="onWheel"
      @contextmenu.prevent
      @keydown="onKeyDown"
    >
      <img v-if="streamSrc" ref="img" :src="streamSrc" class="rd-frame" alt="Live screen of the machine" draggable="false" />
      <div v-else class="rd-empty">
        <div class="rd-empty-glyph">🖥</div>
        <p>Connecting to the machine…</p>
      </div>

      <div v-if="control && !inputConnected" class="rd-overlay-note">Reconnecting input…</div>
      <div v-else-if="!control" class="rd-overlay-note rd-overlay-soft">View only. Press “Controlling” to drive</div>
    </div>

    <!-- Resolve bar (captcha-solve mode) -->
    <div v-if="allowResolve" class="rd-resolve">
      <span class="rd-resolve-hint">Solved it? The agent resumes automatically a moment after you stop, or tap:</span>
      <button type="button" class="rd-done" :disabled="resolved" @click="markDone">
        {{ resolved ? '✓ Handed back' : '✓ Done, I solved it' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { KliveAPIUrl } from '~/scripts/APIInterface';
import { useScreenStream } from '~/composables/useScreenStream';

const props = defineProps({
  // 'password' → use the logged-in Klives password cookie; 'token' → use a scoped handoff token.
  authMode: { type: String, default: 'password' },
  token: { type: String, default: '' },
  fps: { type: Number, default: 18 },
  quality: { type: Number, default: 60 },
  startControl: { type: Boolean, default: true },
  allowResolve: { type: Boolean, default: false },
});
const emit = defineEmits(['resolved']);

const root = ref(null);
const stage = ref(null);
const img = ref(null);
const control = ref(props.startControl);
const isFullscreen = ref(false);
const resolved = ref(false);

// ── Video (reused composable) ──
const { streamSrc, connected: streamConnected, connect: connectStream, disconnect: disconnectStream } = useScreenStream();

function getPassword() {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(/(?:^|; )password=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : '';
}
function authPart() {
  return props.authMode === 'token'
    ? `token=${encodeURIComponent(props.token)}`
    : `authorization=${encodeURIComponent(getPassword())}`;
}
function wsBase() {
  return KliveAPIUrl.replace('https', 'wss').replace('http', 'ws');
}

// ── Input channel (two-way) ──
const inputConnected = ref(false);
let inputWs = null;
let inputReconnect = null;
let stopped = false;

function openInput() {
  if (stopped || typeof window === 'undefined') return;
  try {
    inputWs = new WebSocket(`${wsBase()}/kliveagent/remote/input?${authPart()}`);
    inputWs.onopen = () => { inputConnected.value = true; };
    inputWs.onclose = () => { inputConnected.value = false; if (!stopped) scheduleInputReconnect(); };
    inputWs.onerror = () => { try { inputWs && inputWs.close(); } catch {} };
  } catch {
    scheduleInputReconnect();
  }
}
function scheduleInputReconnect() {
  if (stopped || inputReconnect) return;
  inputReconnect = setTimeout(() => { inputReconnect = null; openInput(); }, 1500);
}
function send(obj) {
  if (inputWs && inputWs.readyState === WebSocket.OPEN) {
    try { inputWs.send(JSON.stringify(obj)); } catch {}
  }
}

// ── Coordinate mapping: client pixel → normalized [0,1] of the streamed virtual screen ──
// Accounts for object-fit: contain letterboxing inside the stage.
function norm(e) {
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

const BTN = { 0: 'left', 1: 'middle', 2: 'right' };
let pressed = false;
let lastMoveSent = 0;
let lastPt = { x: 0, y: 0 };

function onPointerDown(e) {
  if (!control.value) return;
  try { stage.value && stage.value.focus(); } catch {}
  const p = norm(e);
  if (!p) return;
  lastPt = p;
  pressed = true;
  send({ t: 'down', x: p.x, y: p.y, button: BTN[e.button] || 'left' });
}
function onPointerMove(e) {
  if (!control.value) return;
  const now = performance.now();
  if (now - lastMoveSent < 22) return; // ~45 Hz cap
  const p = norm(e);
  if (!p) return;
  lastMoveSent = now;
  lastPt = p;
  send({ t: 'move', x: p.x, y: p.y });
}
function onPointerUp(e) {
  if (!control.value) return;
  const p = norm(e) || lastPt;
  if (pressed) send({ t: 'up', x: p.x, y: p.y, button: BTN[e.button] || 'left' });
  pressed = false;
}
function onWheel(e) {
  if (!control.value) return;
  const p = norm(e) || lastPt;
  const notch = (d) => Math.min(5, Math.max(1, Math.round(Math.abs(d) / 100)));
  const dy = e.deltaY ? -Math.sign(e.deltaY) * notch(e.deltaY) : 0;
  const dx = e.deltaX ? Math.sign(e.deltaX) * notch(e.deltaX) : 0;
  if (dy || dx) send({ t: 'scroll', x: p.x, y: p.y, dy, dx });
}

// ── Keyboard ──
const KEYMAP = {
  Enter: 'enter', Backspace: 'backspace', Tab: 'tab', Escape: 'escape', ' ': 'space',
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Delete: 'delete', Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown', Insert: 'insert',
  Control: 'ctrl', Alt: 'alt', Shift: 'shift', Meta: 'win',
};
function mapKey(k) {
  if (KEYMAP[k]) return KEYMAP[k];
  if (/^F\d{1,2}$/.test(k)) return k.toLowerCase();
  if (k && k.length === 1) return k.toLowerCase();
  return null;
}
function onKeyDown(e) {
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
  const mods = [];
  if (e.ctrlKey) mods.push('ctrl');
  if (e.altKey) mods.push('alt');
  if (e.shiftKey) mods.push('shift');
  if (e.metaKey) mods.push('win');
  send({ t: 'key', keys: [...mods, name] });
  e.preventDefault();
}
function pressKeys(keys) {
  send({ t: 'key', keys });
  try { stage.value && stage.value.focus(); } catch {}
}

// ── Resolve ──
function markDone() {
  if (resolved.value) return;
  resolved.value = true;
  send({ t: 'resolve' });
  emit('resolved');
}

// ── Fullscreen ──
async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) { await root.value.requestFullscreen(); }
    else { await document.exitFullscreen(); }
  } catch {}
}
function onFsChange() { isFullscreen.value = !!document.fullscreenElement; }

// ── Lifecycle ──
function start() {
  stopped = false;
  connectStream(`${authPart()}&fps=${props.fps}&quality=${props.quality}`);
  openInput();
}
function stop() {
  stopped = true;
  if (inputReconnect) { clearTimeout(inputReconnect); inputReconnect = null; }
  try { inputWs && inputWs.close(); } catch {}
  inputWs = null;
  inputConnected.value = false;
  disconnectStream();
}

onMounted(() => {
  start();
  document.addEventListener('fullscreenchange', onFsChange);
});
onBeforeUnmount(() => {
  stop();
  document.removeEventListener('fullscreenchange', onFsChange);
});
// If the token changes (new handoff in the same page), reconnect cleanly.
watch(() => props.token, () => { if (props.authMode === 'token') { stop(); start(); } });
</script>

<style scoped lang="scss">
.remote-desktop {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: #0d0d0d;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 12px;
  overflow: hidden;
}
.rd-fullscreen { border-radius: 0; }

.rd-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 12px;
  background: #151515;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex: 0 0 auto;
}
.rd-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #9a9a9a;
  font-weight: 600;
}
.rd-sep { opacity: 0.4; }
.rd-in-ok { color: #2ecf86; }
.rd-in-no { color: #e0a23a; }
.rd-dot { width: 8px; height: 8px; border-radius: 50%; background: #4a4a4a; }
.rd-dot-live { background: #ff4d4d; box-shadow: 0 0 0 0 rgba(255, 77, 77, 0.6); animation: rd-pulse 1.6s infinite; }
@keyframes rd-pulse {
  0% { box-shadow: 0 0 0 0 rgba(255, 77, 77, 0.55); }
  70% { box-shadow: 0 0 0 7px rgba(255, 77, 77, 0); }
  100% { box-shadow: 0 0 0 0 rgba(255, 77, 77, 0); }
}

.rd-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rd-keys { display: flex; gap: 4px; }
.rd-btn, .rd-key {
  font-size: 12px;
  font-weight: 700;
  color: #cfcfcf;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 7px;
  padding: 6px 10px;
  cursor: pointer;
}
.rd-key { padding: 6px 8px; min-width: 34px; }
.rd-btn:hover, .rd-key:hover { background: rgba(255, 255, 255, 0.12); color: #fff; }
.rd-btn-on { background: rgba(77, 158, 57, 0.22); border-color: rgba(77, 158, 57, 0.5); color: #8fe07a; }

.rd-stage {
  position: relative;
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: repeating-linear-gradient(45deg, #0e0e0e, #0e0e0e 10px, #101010 10px, #101010 20px);
  outline: none;
  overflow: hidden;
  touch-action: none; /* let us own touch gestures for input forwarding */
}
.rd-stage-control { cursor: crosshair; }
.rd-frame { max-width: 100%; max-height: 100%; object-fit: contain; display: block; user-select: none; -webkit-user-drag: none; }

.rd-empty { text-align: center; color: #5a5a5a; }
.rd-empty-glyph { font-size: 40px; opacity: 0.5; }

.rd-overlay-note {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  color: #fff;
  background: rgba(0, 0, 0, 0.65);
  padding: 4px 12px;
  border-radius: 999px;
  pointer-events: none;
}
.rd-overlay-soft { background: rgba(0, 0, 0, 0.45); color: #cfcfcf; }

.rd-resolve {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 14px;
  background: #151515;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  flex: 0 0 auto;
}
.rd-resolve-hint { font-size: 12px; color: #9a9a9a; }
.rd-done {
  font-size: 14px;
  font-weight: 800;
  color: #04130b;
  background: #2ecf86;
  border: none;
  border-radius: 9px;
  padding: 10px 18px;
  cursor: pointer;
}
.rd-done:hover { background: #38e095; }
.rd-done:disabled { background: #2a4a3a; color: #8aa99a; cursor: default; }
</style>
