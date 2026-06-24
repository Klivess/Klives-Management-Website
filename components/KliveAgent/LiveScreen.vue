<template>
  <section class="live-screen">
    <div class="ls-head">
      <span class="ls-title">
        <span class="ls-dot" :class="{ 'ls-dot-live': connected || !!displaySrc }"></span>
        Live View
      </span>
      <div class="ls-meta">
        <span v-if="!connected && !displaySrc" class="ls-chip">connecting…</span>
        <span v-if="phase" class="ls-chip" :class="'phase-' + phase">{{ phaseLabel }}</span>
        <span v-if="iteration" class="ls-chip">step {{ iteration }}</span>
        <button class="ls-close" type="button" title="Hide live view" @click="$emit('close')">✕</button>
      </div>
    </div>

    <div class="ls-body">
      <img
        v-if="displaySrc"
        :src="displaySrc"
        class="ls-frame"
        alt="Live video of what KliveAgent is doing on the machine"
      />
      <div v-else class="ls-empty">
        <div class="ls-empty-glyph">🖥</div>
        <p class="ls-empty-title">Connecting to the live feed…</p>
        <p class="ls-empty-sub">A live video of the machine appears here while KliveAgent works.</p>
      </div>

      <div v-if="statusNote && displaySrc" class="ls-status">{{ statusNote }}</div>

      <!-- Human-in-the-loop gate: the run blocks here until you answer. -->
      <div v-if="approval" class="ls-approval">
        <div class="approval-head">⚠ Approval needed</div>
        <div class="approval-msg">{{ approval.message }}</div>
        <img
          v-if="approval.frameBase64"
          class="approval-frame"
          :src="'data:image/jpeg;base64,' + approval.frameBase64"
          alt="What the agent is about to do"
        />
        <div class="approval-actions">
          <button class="approval-approve" type="button" @click="$emit('approve', { approvalId: approval.approvalId, approved: true })">✓ Approve</button>
          <button class="approval-deny" type="button" @click="$emit('approve', { approvalId: approval.approvalId, approved: false })">✕ Deny</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { KliveAPIUrl } from '~/scripts/APIInterface';

const props = defineProps({
  frame: { type: String, default: null },
  phase: { type: String, default: '' },
  statusNote: { type: String, default: '' },
  iteration: { type: Number, default: 0 },
  approval: { type: Object, default: null },
});

defineEmits(['approve', 'close']);

const PHASE_LABELS = { thinking: 'Thinking', running: 'Running', observing: 'Observing', final: 'Done' };
const phaseLabel = computed(() => PHASE_LABELS[props.phase] || props.phase);

// ── Live video stream over a KliveAPI WebSocket (continuous frames, not per-action screenshots) ──
const streamSrc = ref(null);   // object URL of the latest JPEG frame
const connected = ref(false);
let ws = null;
let reconnectTimer = null;
let lastObjectUrl = null;
let stopped = false;

// The display falls back to the last annotated poll frame until the live stream is connected.
const displaySrc = computed(() => streamSrc.value || (props.frame ? 'data:image/jpeg;base64,' + props.frame : null));

function getPassword() {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(/(?:^|; )password=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : '';
}

function connect() {
  if (stopped || typeof window === 'undefined') return;
  const pw = getPassword();
  if (!pw) return; // not logged in → just show the fallback frames
  const wsBase = KliveAPIUrl.replace('https', 'wss').replace('http', 'ws');
  try {
    ws = new WebSocket(`${wsBase}/kliveagent/screen/stream?authorization=${encodeURIComponent(pw)}`);
    ws.binaryType = 'blob';
    ws.onopen = () => { connected.value = true; };
    ws.onmessage = (ev) => {
      const blob = ev.data instanceof Blob ? ev.data : new Blob([ev.data], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      const prev = lastObjectUrl;
      lastObjectUrl = url;
      streamSrc.value = url;
      if (prev) URL.revokeObjectURL(prev); // free the previous frame so memory stays bounded
    };
    ws.onclose = () => { connected.value = false; if (!stopped) scheduleReconnect(); };
    ws.onerror = () => { try { ws && ws.close(); } catch {} };
  } catch {
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (stopped || reconnectTimer) return;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, 1500);
}

onMounted(connect);
onUnmounted(() => {
  stopped = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  try { ws && ws.close(); } catch {}
  if (lastObjectUrl) URL.revokeObjectURL(lastObjectUrl);
});
</script>

<style scoped lang="scss">
.live-screen {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: #141414;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  overflow: hidden;
}

.ls-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex: 0 0 auto;
}

.ls-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: #8a8a8a;
}

.ls-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4a4a4a;
}
.ls-dot-live {
  background: #ff4d4d;
  box-shadow: 0 0 0 0 rgba(255, 77, 77, 0.6);
  animation: ls-pulse 1.6s infinite;
}
@keyframes ls-pulse {
  0% { box-shadow: 0 0 0 0 rgba(255, 77, 77, 0.55); }
  70% { box-shadow: 0 0 0 7px rgba(255, 77, 77, 0); }
  100% { box-shadow: 0 0 0 0 rgba(255, 77, 77, 0); }
}

.ls-meta { display: flex; align-items: center; gap: 6px; }
.ls-close {
  font-size: 13px;
  line-height: 1;
  color: #9a9a9a;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 3px 6px;
  border-radius: 6px;
}
.ls-close:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
.ls-chip {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: #bdbdbd;
}
.ls-chip.phase-thinking { background: rgba($secondary, 0.18); color: $secondary; }
.ls-chip.phase-running { background: rgba(255, 196, 0, 0.16); color: #ffc400; }
.ls-chip.phase-observing { background: rgba(0, 170, 255, 0.16); color: #4cc2ff; }
.ls-chip.phase-final { background: rgba(0, 200, 120, 0.16); color: #2ecf86; }

.ls-body {
  position: relative;
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    repeating-linear-gradient(45deg, #0e0e0e, #0e0e0e 10px, #101010 10px, #101010 20px);
  overflow: hidden;
}

.ls-frame {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
}

.ls-empty {
  text-align: center;
  color: #5a5a5a;
  padding: 24px;
}
.ls-empty-glyph { font-size: 40px; opacity: 0.5; }
.ls-empty-title { margin: 10px 0 4px; font-size: 14px; color: #8a8a8a; }
.ls-empty-sub { margin: 0; font-size: 12px; max-width: 320px; }

.ls-status {
  position: absolute;
  left: 12px;
  bottom: 12px;
  font-size: 11px;
  color: #cfcfcf;
  background: rgba(0, 0, 0, 0.6);
  padding: 4px 10px;
  border-radius: 999px;
  max-width: calc(100% - 24px);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Approval gate — centered over the live view */
.ls-approval {
  position: absolute;
  inset: 0;
  margin: auto;
  align-self: center;
  width: min(440px, calc(100% - 32px));
  max-height: calc(100% - 32px);
  overflow-y: auto;
  background: rgba(20, 16, 0, 0.96);
  border: 1px solid rgba(255, 196, 0, 0.5);
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.6);
}
.approval-head {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: #ffc400;
  margin-bottom: 6px;
}
.approval-msg {
  font-size: 14px;
  color: #ededed;
  line-height: 1.5;
  margin-bottom: 10px;
  word-break: break-word;
}
.approval-frame {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  margin-bottom: 12px;
}
.approval-actions { display: flex; gap: 10px; }
.approval-approve,
.approval-deny {
  flex: 1;
  font-size: 13px;
  font-weight: 700;
  border-radius: 8px;
  padding: 9px 0;
  cursor: pointer;
  border: 1px solid transparent;
}
.approval-approve { color: #04130b; background: #2ecf86; }
.approval-approve:hover { background: #38e095; }
.approval-deny {
  color: #ff8585;
  background: rgba(255, 80, 80, 0.12);
  border-color: rgba(255, 80, 80, 0.35);
}
.approval-deny:hover { background: rgba(255, 80, 80, 0.22); }
</style>
