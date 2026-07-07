<template>
  <div class="agents-panel">
    <p class="ap-note">The fleet: the Commander and the sub-agents it has spawned. Click a desktop-capable agent to watch it work.</p>
    <div v-if="loading" class="ap-info">Loading roster…</div>
    <ul v-else class="ap-list">
      <li v-for="a in roster" :key="a.agentID" class="ap-item" :class="{ 'is-commander': a.role === 'commander', watchable: hasDesktop(a) }" @click="pick(a)">
        <div class="ap-badge" :style="{ background: tierColor(a.tier) }">{{ tierShort(a.tier) }}</div>
        <div class="ap-body">
          <div class="ap-role">
            {{ a.role }}
            <span v-if="hasDesktop(a)" class="ap-desktop" title="Has a desktop — click to watch">🖥️</span>
          </div>
          <div class="ap-meta">
            <span class="ap-id">{{ a.agentID }}</span>
            <span v-if="a.parentAgentID" class="ap-parent">← {{ a.parentAgentID }}</span>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';

const props = defineProps<{ projectId: string }>();
const emit = defineEmits<{ (e: 'watch', containerId: string): void }>();

const agents = ref<any[]>([]);
const containers = ref<any[]>([]);
const loading = ref(true);
let poll: ReturnType<typeof setInterval> | null = null;

// Commander pinned first, then by creation time.
const roster = computed(() => {
  return [...agents.value].sort((a, b) => {
    if (a.role === 'commander') return -1;
    if (b.role === 'commander') return 1;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
});

function containerFor(a: any) {
  return containers.value.find(c => c.agentID === a.agentID)
      || (a.role === 'commander' ? containers.value.find(c => !c.agentID) : null);
}
function hasDesktop(a: any) { return !!containerFor(a); }
function pick(a: any) { const c = containerFor(a); if (c) emit('watch', c.containerID); }

function tierShort(t: string) {
  return { Text: 'T', TextImage: 'TI', TextImageVideo: 'TIV', TextImageVideoAudio: 'TIVA' }[t] || 'T';
}
function tierColor(t: string) {
  return { Text: '#3a3a44', TextImage: '#17303a', TextImageVideo: '#1d3a1d', TextImageVideoAudio: '#3a2f17' }[t] || '#3a3a44';
}

async function load() {
  try {
    const [ar, cr] = await Promise.all([
      RequestGETFromKliveAPI(`/projects/agents?projectID=${props.projectId}`, false, false),
      RequestGETFromKliveAPI(`/projects/containers?projectID=${props.projectId}`, false, false),
    ]);
    if (ar.ok) agents.value = await ar.json();
    if (cr.ok) containers.value = await cr.json();
  } catch { /* transient */ }
  finally { loading.value = false; }
}

onMounted(() => { load(); poll = setInterval(load, 5000); });
onBeforeUnmount(() => { if (poll) clearInterval(poll); });
</script>

<style scoped>
.agents-panel { padding: 4px 2px; }
.ap-note { font-size: 12px; color: #888; margin: 0 0 12px; }
.ap-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.ap-item { display: flex; gap: 10px; align-items: center; background: #1c1c20; border-radius: 8px; padding: 10px 12px; border: 1px solid transparent; }
.ap-item.is-commander { border-color: #2e5426; }
.ap-item.watchable { cursor: pointer; }
.ap-item.watchable:hover { border-color: #4d9e39; }
.ap-badge { width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #cfe; flex-shrink: 0; }
.ap-role { font-size: 14px; color: #e6e6e6; font-weight: 600; text-transform: capitalize; }
.ap-desktop { margin-left: 4px; font-size: 12px; }
.ap-meta { display: flex; gap: 8px; font-size: 11px; color: #777; font-family: ui-monospace, monospace; margin-top: 2px; }
.ap-info { color: #777; padding: 16px; text-align: center; font-size: 13px; }
</style>
