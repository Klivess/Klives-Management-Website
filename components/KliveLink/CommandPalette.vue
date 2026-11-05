<template>
  <Teleport to="body">
    <div v-if="open" class="ot-palette" @click.self="close">
      <div class="box" role="dialog" aria-modal="true" aria-label="Command palette">
        <input ref="input" v-model="query" placeholder="Jump to an agent or action…" @keydown="onKey" />
        <ul>
          <li v-for="(item, i) in items" :key="item.key" :class="{ active: i === index }" @mouseenter="index = i" @click="run(item)">
            <span class="glyph">{{ item.glyph }}</span>
            <span>{{ item.label }}</span>
            <span class="group">{{ item.group }}</span>
          </li>
          <li v-if="!items.length" class="muted" style="cursor:default">No matches.</li>
        </ul>
        <div class="hint"><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>Enter</kbd> open · <kbd>Esc</kbd> close</div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from '#imports';

const props = defineProps<{ agents?: any[] }>();
const router = useRouter();
const open = ref(false);
const query = ref('');
const index = ref(0);
const input = ref<HTMLInputElement | null>(null);

const items = computed(() => {
  const q = query.value.toLowerCase().trim();
  const agents = (props.agents || []).filter(a => {
    if (!q) return true;
    return [a.MachineName, a.AgentId, a.OsVersion, a.AgentVersion]
      .some(v => String(v || '').toLowerCase().includes(q));
  }).slice(0, 18).map(a => ({
    key: a.AgentId,
    glyph: '›',
    label: a.MachineName || a.AgentId,
    group: a.IsConnected ? 'online' : 'offline',
    agentId: a.AgentId,
  }));
  const actions = [
    { key: 'fleet', glyph: '⌁', label: 'Fleet command', group: 'action', to: '/klivelink' },
    { key: 'collection', glyph: '◈', label: 'Global collection search', group: 'action', to: '/klivelink/collection' },
    { key: 'audit', glyph: '▤', label: 'Fleet audit', group: 'action', to: '/klivelink/audit' },
  ].filter(a => !q || a.label.toLowerCase().includes(q));
  return [...actions, ...agents];
});

function toggle() {
  open.value = !open.value;
  if (open.value) {
    query.value = '';
    index.value = 0;
    nextTick(() => input.value?.focus());
  }
}
function close() { open.value = false; }
function run(item: any) {
  if (item.to) router.push(item.to);
  else if (item.agentId) router.push(`/klivelink/${item.agentId}/overview`);
  close();
}
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') { close(); return; }
  if (event.key === 'ArrowDown') { event.preventDefault(); index.value = Math.min(items.value.length - 1, index.value + 1); }
  if (event.key === 'ArrowUp') { event.preventDefault(); index.value = Math.max(0, index.value - 1); }
  if (event.key === 'Enter') { event.preventDefault(); const item = items.value[index.value]; if (item) run(item); }
}
function globalKey(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); toggle(); }
  else if (event.key === '/' && !open.value && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
    event.preventDefault(); toggle();
  }
}
watch(query, () => { index.value = 0; });
onMounted(() => window.addEventListener('keydown', globalKey));
onBeforeUnmount(() => window.removeEventListener('keydown', globalKey));
</script>

<style scoped>
.ot-palette { z-index: var(--ot-z-modal, 100); }
.box { color: var(--ot-text); }
.glyph { color: var(--ot-accent); font-family: var(--ot-mono); width: 16px; }
.muted { color: var(--ot-muted); }
.hint { padding: 6px 12px; border-top: 1px solid var(--ot-line); font-size: 10.5px; color: var(--ot-muted); }
kbd { background: var(--ot-surface-3, #262826); border: 1px solid var(--ot-line); border-radius: 3px; padding: 1px 4px; font-family: var(--ot-mono); font-size: 10px; }
</style>
