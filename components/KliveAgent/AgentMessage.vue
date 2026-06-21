<template>
  <div class="msg" :class="isUser ? 'msg-user' : 'msg-agent'">
    <div class="msg-avatar" :title="roleLabel">{{ isUser ? '✦' : '◈' }}</div>
    <div class="msg-body">
      <div class="msg-head">
        <span class="msg-role">{{ roleLabel }}</span>
        <span v-if="timeLabel" class="msg-time">{{ timeLabel }}</span>
      </div>

      <!-- Live transparency strip: phase, step, running token counts, and a Stop control. -->
      <div v-if="showStatus" class="msg-status">
        <span class="msg-phase" :class="'phase-' + (message.phase || 'thinking')">{{ phaseLabel }}</span>
        <span v-if="message.iteration" class="msg-chip">step {{ message.iteration }}</span>
        <span v-if="tokenLabel" class="msg-chip msg-tokens">{{ tokenLabel }}</span>
        <button v-if="message.pending" class="msg-stop" type="button" @click="$emit('stop')">■ Stop</button>
      </div>

      <div v-if="message.content" class="msg-content" v-html="renderMarkdown(message.content)"></div>

      <div v-if="message.pending && !message.content" class="msg-typing">
        <span></span><span></span><span></span>
      </div>

      <!-- Collapsible activity timeline of what the agent did this turn. -->
      <details v-if="activity.length" class="msg-activity">
        <summary>Activity · {{ activity.length }} step{{ activity.length === 1 ? '' : 's' }}</summary>
        <ul>
          <li v-for="(a, i) in activity" :key="i">
            <span class="act-iter">#{{ a.iteration }}</span>
            <span class="act-kind" :class="'act-' + (a.kind || 'info')">{{ a.kind }}</span>
            <span class="act-text">{{ a.text }}</span>
          </li>
        </ul>
      </details>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { renderMarkdown } from '~/scripts/agentMarkdown';

const props = defineProps({
  // { role, content, scripts, pending?, timestamp, phase?, iteration?, promptTokens?, completionTokens?, activity? }
  message: { type: Object, required: true },
});

defineEmits(['stop']);

const isUser = computed(() => props.message.role === 'User');
const roleLabel = computed(() => (isUser.value ? 'You' : 'KliveAgent'));

const activity = computed(() => (Array.isArray(props.message.activity) ? props.message.activity : []));

// Show the status strip while the turn is live, or afterwards if it carried transparency data.
const showStatus = computed(() =>
  !isUser.value && (props.message.pending || props.message.phase || tokenLabel.value)
);

const PHASE_LABELS = {
  thinking: 'Thinking',
  running: 'Running',
  observing: 'Observing',
  final: 'Done',
};
const phaseLabel = computed(() => PHASE_LABELS[props.message.phase] || (props.message.pending ? 'Working' : 'Done'));

const tokenLabel = computed(() => {
  const p = props.message.promptTokens || 0;
  const c = props.message.completionTokens || 0;
  if (!p && !c) return '';
  return `↑${p.toLocaleString()} ↓${c.toLocaleString()} tok`;
});

const timeLabel = computed(() => {
  const ts = props.message.timestamp;
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
});
</script>

<style scoped lang="scss">
.msg {
  display: flex;
  gap: 12px;
  max-width: 100%;
}

.msg-avatar {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  margin-top: 2px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.msg-user {
  flex-direction: row-reverse;
}
.msg-user .msg-avatar {
  background: rgba($secondary, 0.16);
  color: $teritary;
}
.msg-agent .msg-avatar {
  background: #1c1c1c;
  color: #8a8a8a;
}

.msg-body {
  min-width: 0;
  max-width: 80%;
  background: #1d1d1d;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 10px 14px;
}
.msg-user .msg-body {
  background: rgba($secondary, 0.1);
  border-color: rgba($secondary, 0.28);
}

.msg-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 4px;
}

.msg-role {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: #7a7a7a;
}
.msg-agent .msg-role {
  color: $secondary;
}
.msg-user .msg-role {
  color: $teritary;
}

.msg-time {
  font-size: 10px;
  color: #5a5a5a;
  font-variant-numeric: tabular-nums;
}

.msg-content {
  font-size: 14px;
  line-height: 1.55;
  color: #dcdcdc;
  word-break: break-word;
}
.msg-content :deep(p) {
  margin: 0 0 8px;
}
.msg-content :deep(p:last-child) {
  margin-bottom: 0;
}
.msg-content :deep(code) {
  background: #0e0e0e;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 13px;
  color: $teritary;
}
.msg-content :deep(pre) {
  background: #0b0b0b;
  border-radius: 8px;
  padding: 10px;
  overflow-x: auto;
}
.msg-content :deep(pre code) {
  background: transparent;
  padding: 0;
  color: inherit;
}
.msg-content :deep(a) {
  color: $teritary;
}

/* Live transparency strip */
.msg-status {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}
.msg-phase {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: #bdbdbd;
}
.msg-phase.phase-thinking { background: rgba($secondary, 0.18); color: $secondary; }
.msg-phase.phase-running { background: rgba(255, 196, 0, 0.16); color: #ffc400; }
.msg-phase.phase-observing { background: rgba(0, 170, 255, 0.16); color: #4cc2ff; }
.msg-phase.phase-final { background: rgba(0, 200, 120, 0.16); color: #2ecf86; }

.msg-chip {
  font-size: 10px;
  color: #8a8a8a;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  font-variant-numeric: tabular-nums;
}
.msg-tokens { color: #9a9a9a; }

.msg-stop {
  margin-left: auto;
  font-size: 10px;
  font-weight: 700;
  color: #ff6b6b;
  background: rgba(255, 80, 80, 0.1);
  border: 1px solid rgba(255, 80, 80, 0.3);
  border-radius: 6px;
  padding: 2px 9px;
  cursor: pointer;
}
.msg-stop:hover { background: rgba(255, 80, 80, 0.2); }

/* Activity timeline */
.msg-activity {
  margin-top: 8px;
  font-size: 12px;
}
.msg-activity summary {
  cursor: pointer;
  color: #8a8a8a;
  font-size: 11px;
  user-select: none;
}
.msg-activity ul {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.msg-activity li {
  display: flex;
  gap: 7px;
  align-items: baseline;
  color: #b5b5b5;
}
.act-iter { color: #5a5a5a; font-variant-numeric: tabular-nums; }
.act-kind {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: #7a7a7a;
  min-width: 54px;
}
.act-kind.act-script { color: #4cc2ff; }
.act-kind.act-tool { color: #c08bff; }
.act-kind.act-think { color: $secondary; }
.act-kind.act-error { color: #ff6b6b; }
.act-text { word-break: break-word; }

/* Typing indicator (live "thinking" before the first prose arrives) */
.msg-typing {
  display: flex;
  gap: 5px;
  padding: 4px 0 2px;
}
.msg-typing span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: $secondary;
  animation: msg-blink 1.4s infinite both;
}
.msg-typing span:nth-child(2) {
  animation-delay: 0.2s;
}
.msg-typing span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes msg-blink {
  0%, 80%, 100% {
    opacity: 0.25;
  }
  40% {
    opacity: 1;
  }
}
</style>
