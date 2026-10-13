<template>
  <div class="talk-bar" :class="'is-' + talk.state" data-testid="talk-bar">
    <button
      class="tb-orb"
      type="button"
      :title="orbTitle"
      :aria-label="orbTitle"
      data-testid="talk-orb"
      @click="onOrbClick"
      @pointerdown="onOrbDown"
      @pointerup="onOrbUp"
      @pointerleave="onOrbUp"
    >
      <span class="tb-orb-glow" :style="{ transform: `scale(${orbScale})` }"></span>
      <KliveChatIcon :name="talk.muted ? 'mic-off' : talk.state === 'speaking' ? 'volume' : 'mic'" :size="20" />
    </button>

    <div class="tb-main">
      <div class="tb-state" data-testid="talk-state">
        <span class="tb-dot"></span>{{ stateLabel }}<span v-if="toolDetail" class="tb-detail"> · {{ toolDetail }}</span>
      </div>
      <div class="tb-caption" :class="{ 'is-final': talk.captionFinal }" data-testid="talk-caption">{{ captionText }}</div>
      <div v-if="talk.prefs.showLatency && talk.timing" class="tb-latency" data-testid="talk-latency">
        end of speech {{ ms(talk.timing.endpointMs) }} · transcript {{ talk.timing.sttReused ? 'ready at the pause' : ms(talk.timing.sttMs) }}
        · first audio {{ ms(talk.timing.firstAudioMs) }}
      </div>
      <div v-if="talk.error" class="tb-error" role="alert">{{ talk.error }}</div>
    </div>

    <div class="tb-actions">
      <button v-if="talk.state === 'speaking'" class="tb-btn" type="button" title="Stop speaking (Esc)" @click="talk.interrupt()">
        <KliveChatIcon name="volume-off" :size="18" />
      </button>
      <button class="tb-btn" :class="{ 'is-on': talk.muted }" type="button" :title="talk.muted ? 'Unmute' : 'Mute'"
        data-testid="talk-mute" @click="talk.setMuted(!talk.muted)">
        <KliveChatIcon :name="talk.muted ? 'mic-off' : 'mic'" :size="18" />
      </button>
      <button class="tb-btn" :class="{ 'is-on': settingsOpen }" type="button" title="Talk settings"
        data-testid="talk-settings" @click="settingsOpen = !settingsOpen">
        <KliveChatIcon name="settings" :size="18" />
      </button>
      <button class="tb-btn" type="button" title="Back to typing (Ctrl+.)" data-testid="talk-exit" @click="$emit('exit')">
        <KliveChatIcon name="keyboard" :size="18" />
      </button>
    </div>

    <div v-if="settingsOpen" class="tb-settings" data-testid="talk-settings-panel">
      <label class="tb-row">
        <span>Voice</span>
        <select :value="talk.prefs.voice ?? ''" @change="setVoice($event.target.value)">
          <option value="">Default ({{ defaultVoice }})</option>
          <option v-for="v in talk.voices" :key="v.id" :value="v.id">{{ v.name && v.name !== v.id ? `${v.name} (${v.id})` : v.id }}</option>
        </select>
      </label>
      <label class="tb-row">
        <span>Speed <small>{{ (talk.prefs.speed ?? 1).toFixed(2) }}×</small></span>
        <input type="range" min="0.8" max="1.4" step="0.05" :value="talk.prefs.speed ?? 1"
          @change="talk.updatePrefs({ speed: Number($event.target.value) })">
      </label>
      <div class="tb-row">
        <span>Turns</span>
        <div class="tb-seg">
          <button type="button" class="tb-seg-btn" :class="{ 'is-on': talk.prefs.handsFree }" @click="talk.updatePrefs({ handsFree: true })">Hands-free</button>
          <button type="button" class="tb-seg-btn" :class="{ 'is-on': !talk.prefs.handsFree }" @click="talk.updatePrefs({ handsFree: false })">Hold to talk</button>
        </div>
      </div>
      <label class="tb-row">
        <span>Pause before replying <small>{{ talk.prefs.sensitivity < 0.9 ? 'snappy' : talk.prefs.sensitivity > 1.2 ? 'patient' : 'normal' }}</small></span>
        <input type="range" min="0.6" max="1.6" step="0.1" :value="talk.prefs.sensitivity"
          @change="talk.updatePrefs({ sensitivity: Number($event.target.value) })">
      </label>
      <label class="tb-row tb-check">
        <input type="checkbox" :checked="talk.prefs.headphones" @change="talk.updatePrefs({ headphones: $event.target.checked })">
        <span>I'm on headphones <small>(interrupting reacts faster)</small></span>
      </label>
      <label class="tb-row tb-check">
        <input type="checkbox" :checked="talk.prefs.showLatency" @change="talk.updatePrefs({ showLatency: $event.target.checked })">
        <span>Show latency</span>
      </label>
      <p class="tb-note">
        {{ talk.detectorKind === 'energy' ? 'Speech detection: loudness (the Silero model did not load).' : talk.detectorKind ? 'Speech detection: Silero VAD.' : '' }}
        Ctrl+. switches modes. In hold-to-talk, hold Space or the mic.
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import KliveChatIcon from '~/components/KliveChat/Icon.vue';

const props = defineProps({
  // reactive(useTalkMode(...)) — refs already unwrapped
  talk: { type: Object, required: true },
});
defineEmits(['exit']);

const settingsOpen = ref(false);

const defaultVoice = computed(() => props.talk.serverSettings?.voice || 'server default');

const stateLabel = computed(() => {
  switch (props.talk.state) {
    case 'starting': return 'Starting…';
    case 'connecting': return 'Connecting…';
    case 'listening': return props.talk.muted ? 'Muted' : props.talk.prefs.handsFree ? 'Listening' : 'Hold Space or the mic to talk';
    case 'hearing': return 'Hearing you…';
    case 'transcribing': return 'Got it…';
    case 'thinking': return 'Thinking…';
    case 'tool': return 'Working';
    case 'speaking': return 'Speaking · talk or press Esc to interrupt';
    case 'error': return 'Talk mode stopped';
    default: return 'Talk mode is off';
  }
});

const toolDetail = computed(() => props.talk.state === 'tool' && props.talk.detail
  ? String(props.talk.detail).replace(/^running\s+/i, '').replace(/_/g, ' ')
  : '');

const captionText = computed(() => props.talk.caption || (props.talk.state === 'listening' && !props.talk.muted ? 'Say something…' : ''));

const orbScale = computed(() => {
  const level = props.talk.state === 'speaking' ? props.talk.voiceLevel : props.talk.micLevel;
  return 1 + Math.min(1, level || 0) * 0.55;
});

const orbTitle = computed(() => props.talk.state === 'speaking' ? 'Interrupt'
  : props.talk.prefs.handsFree ? 'Listening hands-free' : 'Hold to talk');

function onOrbClick() {
  if (props.talk.state === 'speaking') props.talk.interrupt();
}
function onOrbDown(event) {
  if (props.talk.prefs.handsFree) return;
  event.currentTarget?.setPointerCapture?.(event.pointerId);
  props.talk.pttDown();
}
function onOrbUp() {
  if (!props.talk.prefs.handsFree) props.talk.pttUp();
}
function setVoice(value) {
  props.talk.updatePrefs({ voice: value || null });
}
function ms(value) {
  return Number.isFinite(value) ? `${Math.round(value)} ms` : '—';
}
</script>

<style scoped lang="scss">
/* main.scss colours every element green; inside the bar, text takes its colour from its container. */
:where(.talk-bar) * { color: inherit; }

.talk-bar {
  color: #d8d8d8;
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 56px;
}

/* The site styles every <button>; these carry their own chrome. */
.talk-bar .tb-orb,
.talk-bar .tb-btn,
.talk-bar .tb-seg-btn {
  padding: 0;
  border: 0;
  letter-spacing: normal;
  text-transform: none;
  overflow: visible;
  box-shadow: none;
  font-family: inherit;
}

.talk-bar .tb-orb {
  position: relative;
  flex: 0 0 auto;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: #1f2a1c;
  color: #e3f6d9;
  border: 1px solid rgba(98, 206, 71, 0.45);
  cursor: pointer;
  touch-action: none;
  &:hover { background: #263522; border-color: $teritary; box-shadow: none; }
  &:active { background: #2c3d27; }
  :deep(.kc-icon) { position: relative; z-index: 1; color: #e3f6d9; }
}

.tb-orb-glow {
  position: absolute;
  inset: 6px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(98, 206, 71, 0.55), rgba(98, 206, 71, 0.05) 70%);
  transition: transform 80ms linear;
  pointer-events: none;
}

.is-speaking .tb-orb { border-color: #8fd3ff; background: #1b2530; }
.is-speaking .tb-orb-glow { background: radial-gradient(circle, rgba(143, 211, 255, 0.55), rgba(143, 211, 255, 0.05) 70%); }
.is-thinking .tb-orb-glow,
.is-tool .tb-orb-glow,
.is-transcribing .tb-orb-glow { animation: tb-breathe 1.2s ease-in-out infinite; }
.is-error .tb-orb { border-color: #c96464; }

@keyframes tb-breathe {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
}

.tb-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }

.tb-state {
  color: #cfe8c7;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  display: flex;
  align-items: center;
  gap: 6px;
}

.tb-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #5d6b58;
  flex: 0 0 auto;
}
.is-listening .tb-dot,
.is-hearing .tb-dot { background: $teritary; box-shadow: 0 0 6px rgba(98, 206, 71, 0.8); }
.is-speaking .tb-dot { background: #8fd3ff; }
.is-error .tb-dot { background: #c96464; }

.tb-detail { color: #9fb69a; font-weight: 500; }

.tb-caption {
  color: #8e8e8e;
  font-size: 14px;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  &.is-final { color: #e8e8e8; }
}

.tb-latency { color: #7f8f7a; font-size: 11px; font-variant-numeric: tabular-nums; }
.tb-error { color: #f4a6a6; font-size: 12px; }

.tb-actions { display: flex; gap: 6px; flex: 0 0 auto; }

.talk-bar .tb-btn {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #d8d8d8;
  cursor: pointer;
  :deep(.kc-icon) { color: #d8d8d8; }
  &:hover { background: #222; border-color: rgba(255, 255, 255, 0.25); box-shadow: none; }
  &:active { background: #2a2a2a; }
  &.is-on { border-color: rgba(98, 206, 71, 0.6); background: #1f2a1c; }
}

.tb-settings {
  position: absolute;
  right: 0;
  bottom: calc(100% + 10px);
  z-index: 20;
  width: min(340px, 92vw);
  padding: 12px 14px;
  border-radius: 12px;
  background: #161616;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tb-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: #d0d0d0;
  font-size: 12px;
  small { color: #8a8a8a; font-weight: 400; }
  select, input[type="range"] { width: 100%; }
  select {
    background: #1d1d1d;
    color: #e0e0e0;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 7px;
    padding: 6px 8px;
    font-size: 12px;
    option { background: #1d1d1d; color: #e0e0e0; }
  }
}

.tb-check { flex-direction: row; align-items: center; gap: 8px; }

.tb-seg { display: flex; gap: 4px; }
.talk-bar .tb-seg-btn {
  flex: 1;
  padding: 6px 8px;
  border-radius: 7px;
  background: #1d1d1d;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #cfcfcf;
  font-size: 12px;
  cursor: pointer;
  &:hover { background: #242424; box-shadow: none; border-color: rgba(255, 255, 255, 0.25); }
  &.is-on { border-color: rgba(98, 206, 71, 0.6); background: #1f2a1c; color: #e3f6d9; }
}

.tb-note { margin: 0; color: #7d7d7d; font-size: 11px; line-height: 1.4; }

@media (max-width: 640px) {
  .talk-bar { gap: 10px; }
  .talk-bar .tb-orb { width: 46px; height: 46px; }
  .tb-actions { gap: 4px; }
  .talk-bar .tb-btn { width: 32px; height: 32px; }
}
</style>
