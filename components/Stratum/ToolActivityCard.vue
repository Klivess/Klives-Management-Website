<template>
  <div class="tool-card" :class="{ failed: looksFailed }">
    <button class="tool-head" @click="expanded = !expanded">
      <span class="tool-icon">{{ result ? (looksFailed ? '✗' : '✓') : '⏳' }}</span>
      <span class="tool-name">{{ call.ToolName || 'tool' }}</span>
      <span class="tool-summary">{{ summary }}</span>
      <span class="tool-chevron">{{ expanded ? '▾' : '▸' }}</span>
    </button>
    <div v-if="expanded" class="tool-body">
      <div v-if="call.PayloadJson" class="tool-section">
        <div class="tool-label">Arguments</div>
        <pre class="tool-pre">{{ prettyArgs }}</pre>
      </div>
      <div v-if="result" class="tool-section">
        <div class="tool-label">Result</div>
        <pre class="tool-pre">{{ result.Text }}</pre>
      </div>
      <div v-else class="tool-running">Running…</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

interface TimelineEvent {
  ToolName?: string | null;
  Text: string;
  PayloadJson?: string | null;
}

const props = defineProps<{
  call: TimelineEvent;
  result?: TimelineEvent | null;
}>();

const expanded = ref(false);

const looksFailed = computed(() => {
  const t = props.result?.Text ?? '';
  return /^(✗|Tool '.*' failed|.*FAILED)/m.test(t.slice(0, 400));
});

const summary = computed(() => {
  const src = props.result?.Text || props.call.Text || '';
  const firstLine = src.split('\n')[0] ?? '';
  return firstLine.length > 110 ? firstLine.slice(0, 110) + '…' : firstLine;
});

const prettyArgs = computed(() => {
  const raw = props.call.PayloadJson ?? '';
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
});
</script>

<style scoped>
.tool-card { background: #161618; border: 1px solid #2a2a2e; border-radius: 6px; margin: 4px 0; font-size: 12px; }
.tool-card.failed { border-color: #5a2a2a; }
.tool-head {
  display: flex; align-items: center; gap: 8px; width: 100%;
  background: none; border: none; color: #ccc; cursor: pointer;
  padding: 6px 10px; text-align: left; font-size: 12px;
}
.tool-icon { flex: 0 0 auto; }
.tool-name { font-family: monospace; color: #8fc97f; flex: 0 0 auto; }
.tool-card.failed .tool-name { color: #ff9a9a; }
.tool-summary { flex: 1; color: #888; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tool-chevron { color: #666; }
.tool-body { padding: 0 10px 8px; }
.tool-section { margin-top: 6px; }
.tool-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #777; margin-bottom: 3px; }
.tool-pre {
  background: #0e0e10; color: #c8c8c8; border-radius: 4px; padding: 8px;
  font-family: 'Consolas', monospace; font-size: 11px; margin: 0;
  max-height: 320px; overflow: auto; white-space: pre-wrap; word-break: break-word;
}
.tool-running { color: #888; font-style: italic; padding: 4px 0; }
</style>
