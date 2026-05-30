<template>
  <div class="msg" :class="isUser ? 'msg-user' : 'msg-agent'">
    <div class="msg-avatar" :title="roleLabel">{{ isUser ? '✦' : '◈' }}</div>
    <div class="msg-body">
      <div class="msg-head">
        <span class="msg-role">{{ roleLabel }}</span>
        <span v-if="timeLabel" class="msg-time">{{ timeLabel }}</span>
      </div>

      <div v-if="message.content" class="msg-content" v-html="renderMarkdown(message.content)"></div>

      <div v-if="message.scripts && message.scripts.length" class="msg-scripts">
        <ScriptResultCard v-for="(script, si) in message.scripts" :key="si" :script="script" />
      </div>

      <div v-if="message.pending && !message.content" class="msg-typing">
        <span></span><span></span><span></span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { renderMarkdown } from '~/scripts/agentMarkdown';
import ScriptResultCard from './ScriptResultCard.vue';

const props = defineProps({
  // { role: 'User' | 'KliveAgent', content, scripts: [], pending?, timestamp }
  message: { type: Object, required: true },
});

const isUser = computed(() => props.message.role === 'User');
const roleLabel = computed(() => (isUser.value ? 'You' : 'KliveAgent'));

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

.msg-scripts {
  margin-top: 6px;
}

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
