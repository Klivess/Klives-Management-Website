<template>
  <div v-if="items.length" class="attention-strip">
    <div class="as-head">
      <span class="as-icon">🔔</span>
      <span class="as-title">Needs your attention</span>
      <span class="as-count">{{ items.length }}</span>
    </div>
    <div class="as-items">
      <NuxtLink
        v-for="it in items"
        :key="it.projectId + it.kind"
        :to="`/projects/${it.projectId}`"
        class="as-item"
        :class="'k-' + it.kind"
      >
        <span class="as-name">{{ it.name }}</span>
        <span class="as-label">{{ it.label }}</span>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

// Cross-project "what needs me" surface (Phase 4). Derives blocking states from the fleet list
// the dashboard already loads (and live-updates), so it needs no extra backend: pending approvals
// and budget-paused projects. Complements the Discord @mention pings.
const props = defineProps<{ projects: any[] }>();

interface AttentionItem { projectId: string; name: string; kind: string; label: string; }

const items = computed<AttentionItem[]>(() => {
  const out: AttentionItem[] = [];
  for (const p of props.projects || []) {
    const name = p.name || '(untitled)';
    if (Number(p.pendingApprovals) > 0)
      out.push({ projectId: p.projectID, name, kind: 'approval', label: `${p.pendingApprovals} approval${p.pendingApprovals === 1 ? '' : 's'} pending` });
    if (p.status === 'BudgetPaused')
      out.push({ projectId: p.projectID, name, kind: 'budget', label: 'Budget exhausted — paused' });
  }
  return out;
});
</script>

<style scoped>
.attention-strip { background: #2a2113; border: 1px solid #4a3a17; border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; }
.as-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.as-icon { font-size: 15px; }
.as-title { font-weight: 600; color: #e8c877; font-size: 14px; }
.as-count { margin-left: 4px; background: #d9a441; color: #201f20; font-size: 11px; font-weight: 700; border-radius: 10px; padding: 1px 8px; }
.as-items { display: flex; flex-wrap: wrap; gap: 8px; }
.as-item { display: flex; align-items: center; gap: 8px; text-decoration: none; background: #1c1a15; border: 1px solid #3a3320; border-radius: 8px; padding: 7px 11px; transition: background 0.1s, border-color 0.1s; }
.as-item:hover { background: #24211a; border-color: #5a4a24; }
.as-name { font-weight: 600; color: #e6e6e6; font-size: 13px; }
.as-label { font-size: 12px; }
.k-approval .as-label { color: #e8c877; }
.k-budget .as-label { color: #e08a8a; }

@media (prefers-color-scheme: light) {
  .attention-strip { background: #fdf6e3; border-color: #e6d3a3; }
  .as-title { color: #9a7b1e; }
  .as-item { background: #fff; border-color: #e6d3a3; }
  .as-item:hover { background: #fbf3dd; }
  .as-name { color: #2a2a2a; }
  .k-approval .as-label { color: #9a7b1e; }
  .k-budget .as-label { color: #c0392b; }
}
</style>
