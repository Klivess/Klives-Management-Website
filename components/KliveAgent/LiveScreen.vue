<template>
  <section class="live-screen">
    <div class="ls-head">
      <span class="ls-title">
        <span class="ls-dot" :class="{ 'ls-dot-live': containerId || connected || !!displaySrc }"></span>
        {{ containerId ? "KliveAgent's computer" : 'Live View' }}
      </span>
      <div class="ls-meta">
        <span v-if="!containerId && !connected && !displaySrc" class="ls-chip">connecting…</span>
        <span v-if="phase" class="ls-chip" :class="'phase-' + phase">{{ phaseLabel }}</span>
        <span v-if="iteration" class="ls-chip">step {{ iteration }}</span>
        <button class="ls-close" type="button" title="Hide live view" @click="$emit('close')">✕</button>
      </div>
    </div>

    <div class="ls-body">
      <div v-if="containerId && asleep" class="ls-empty">
        <div class="ls-empty-glyph">💤</div>
        <p class="ls-empty-title">KliveAgent's computer is asleep</p>
        <p class="ls-empty-sub">It was stopped after idling to free memory. Its files, apps and browser sign-ins are kept, and it wakes up the moment KliveAgent needs it.</p>
      </div>
      <!-- KliveAgent's own desktop: live and controllable in place (take over any time). -->
      <ContainerRemoteDesktop
        v-else-if="containerId"
        :key="containerId + (containerTakeover ? ':takeover' : '')"
        class="ls-crd"
        :container-id="containerId"
        label="KliveAgent's desktop"
        :start-control="!!containerTakeover"
      />
      <template v-else>
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
      </template>

      <div v-if="statusNote && !containerId && displaySrc" class="ls-status">{{ statusNote }}</div>

      <!-- Takeover of KliveAgent's own desktop: you drive it right here; this bar hands it back. -->
      <div v-if="containerTakeover" class="ls-takeover-bar">
        <div class="ls-takeover-text">
          <strong>🖐 KliveAgent needs you:</strong> {{ approval.message }}
          <span class="ls-takeover-hint">Click “Controlling” above if needed, do it on the desktop, then hand it back.</span>
        </div>
        <div class="ls-takeover-actions">
          <button class="approval-approve" type="button" @click="$emit('resolve-takeover', { approvalId: approval.approvalId, outcome: 'done' })">✓ Done — continue</button>
          <button class="approval-deny" type="button" @click="$emit('resolve-takeover', { approvalId: approval.approvalId, outcome: 'cancel' })">✕ Can't do it</button>
        </div>
      </div>

      <!-- Human-in-the-loop gate: the run blocks here until you answer. -->
      <div v-else-if="approval" class="ls-approval" :class="{ 'ls-approval-takeover': isIntervention }">
        <div class="approval-head">{{ isIntervention ? '🖐 Take over needed' : '⚠ Approval needed' }}</div>
        <div class="approval-msg">{{ approval.message }}</div>
        <img
          v-if="approval.frameBase64"
          class="approval-frame"
          :src="'data:image/jpeg;base64,' + approval.frameBase64"
          alt="What the agent is about to do"
        />
        <!-- Intervention (captcha/login/2FA): launch the scoped remote desktop to solve it. -->
        <div v-if="isIntervention" class="approval-actions">
          <a class="approval-takeover" :href="approval.solveUrl" target="_blank" rel="noopener">🖥 Open Remote Desktop →</a>
        </div>
        <!-- Irreversible-action approval: approve / deny. -->
        <div v-else class="approval-actions">
          <button class="approval-approve" type="button" @click="$emit('approve', { approvalId: approval.approvalId, approved: true })">✓ Approve</button>
          <button class="approval-deny" type="button" @click="$emit('approve', { approvalId: approval.approvalId, approved: false })">✕ Deny</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { GetAuthToken } from '~/scripts/APIInterface';
import { computed, onMounted, watch } from 'vue';
import { useScreenStream } from '~/composables/useScreenStream';
import ContainerRemoteDesktop from '~/components/Projects/ContainerRemoteDesktop.vue';

const props = defineProps({
  frame: { type: String, default: null },
  phase: { type: String, default: '' },
  statusNote: { type: String, default: '' },
  iteration: { type: Number, default: 0 },
  approval: { type: Object, default: null },
  // KliveAgent's own container desktop. When set, the view streams that desktop (and lets you drive
  // it) instead of the host machine's screen.
  containerId: { type: String, default: null },
  // The desktop is stopped (idle); show that instead of a stream that cannot connect.
  asleep: { type: Boolean, default: false },
});

defineEmits(['approve', 'close', 'resolve-takeover']);

const PHASE_LABELS = {
  preparing: 'Preparing', queued: 'Queued', thinking: 'Thinking', running: 'Running', observing: 'Observing',
  waiting: 'Waiting', retrying: 'Retrying', steering: 'Steering', final: 'Done',
};
const phaseLabel = computed(() => PHASE_LABELS[props.phase] || props.phase);
const isIntervention = computed(() => props.approval && props.approval.kind === 'intervention' && props.approval.solveUrl);
// A takeover of KliveAgent's own desktop happens in place: the desktop is already on screen.
const containerTakeover = computed(() => props.containerId && props.approval
  && props.approval.kind === 'intervention' && props.approval.containerId === props.containerId);

// ── Host-screen video stream over a KliveAPI WebSocket (only when the computer is the host) ──
const { streamSrc, connected, connect, disconnect } = useScreenStream();

// The display falls back to the last annotated poll frame until the live stream is connected.
const displaySrc = computed(() => streamSrc.value || (props.frame ? 'data:image/jpeg;base64,' + props.frame : null));

function syncHostStream() {
  if (props.containerId) { disconnect(); return; }
  const credential = GetAuthToken();
  if (credential) connect(`authorization=${encodeURIComponent(credential)}`); // not signed in → just show fallback frames
}

onMounted(syncHostStream);
watch(() => props.containerId, (now, before) => { if (!!now !== !!before) syncHostStream(); });
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
.ls-chip.phase-thinking,
.ls-chip.phase-preparing { background: rgba($secondary, 0.18); color: $secondary; }
.ls-chip.phase-running,
.ls-chip.phase-steering { background: rgba(255, 196, 0, 0.16); color: #ffc400; }
.ls-chip.phase-observing { background: rgba(0, 170, 255, 0.16); color: #4cc2ff; }
.ls-chip.phase-queued,
.ls-chip.phase-waiting,
.ls-chip.phase-retrying { background: rgba(160, 120, 255, 0.16); color: #b89cff; }
.ls-chip.phase-final { background: rgba(0, 200, 120, 0.16); color: #2ecf86; }

/* KliveAgent's own desktop, embedded and controllable */
.ls-crd {
  width: 100%;
  height: 100%;
  border: none;
  border-radius: 0;
}

/* In-place takeover of KliveAgent's desktop: a bar, not a modal, so the desktop stays usable */
.ls-takeover-bar {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 12px;
  background: rgba(0, 18, 14, 0.95);
  border: 1px solid rgba(46, 207, 134, 0.55);
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
}
.ls-takeover-text {
  flex: 1 1 240px;
  min-width: 0;
  font-size: 13px;
  color: #e6e6e6;
  line-height: 1.45;
  word-break: break-word;
}
.ls-takeover-text strong { color: #2ecf86; }
.ls-takeover-hint { display: block; font-size: 11px; color: #9a9a9a; margin-top: 2px; }
.ls-takeover-actions { display: flex; gap: 8px; flex: 0 0 auto; }
.ls-takeover-actions button { padding: 8px 12px; }

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

/* Intervention (captcha/login/2FA takeover) variant */
.ls-approval-takeover {
  background: rgba(0, 18, 14, 0.96);
  border-color: rgba(46, 207, 134, 0.5);
}
.ls-approval-takeover .approval-head { color: #2ecf86; }
.approval-takeover {
  flex: 1;
  text-align: center;
  text-decoration: none;
  font-size: 14px;
  font-weight: 800;
  color: #04130b;
  background: #2ecf86;
  border-radius: 8px;
  padding: 11px 0;
}
.approval-takeover:hover { background: #38e095; }
</style>
