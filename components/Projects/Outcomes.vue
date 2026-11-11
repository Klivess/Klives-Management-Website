<template>
  <div class="pjx-outcomes" role="img" :aria-label="summary" :title="summary">
    <div v-for="(b, i) in bins" :key="i" class="pjx-outcomes__bin" :title="binTitle(b)">
      <!-- Each bin is as tall as its share of the busiest bin, so the strip reads as activity over time. -->
      <span v-if="b.total" class="pjx-outcomes__stack" :style="{ height: `${Math.max(18, (100 * b.total) / max)}%` }">
        <i v-if="b.completed" class="ok" :style="{ flex: b.completed }"></i>
        <i v-if="b.failed" class="fail" :style="{ flex: b.failed }"></i>
        <i v-if="b.deferred" class="defer" :style="{ flex: b.deferred }"></i>
        <i v-if="b.cancelled" class="cancel" :style="{ flex: b.cancelled }"></i>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { OverviewPoint } from '~/composables/useProjectsOverview';
import { outcomeBins, outcomeTotals, type PjBin } from '~/scripts/projectsConsole';

const props = withDefaults(defineProps<{ series: OverviewPoint[]; maxBins?: number; label?: string }>(), { maxBins: 24, label: 'Wake outcomes' });
const bins = computed(() => outcomeBins(props.series, props.maxBins));
const max = computed(() => Math.max(1, ...bins.value.map(b => b.total)));
const summary = computed(() => {
  const t = outcomeTotals(props.series);
  const total = t.completed + t.failed + t.deferred + t.cancelled;
  return total
    ? `${props.label}: ${t.completed} completed, ${t.failed} failed, ${t.deferred} deferred, ${t.cancelled} cancelled`
    : `${props.label}: no wakes recorded in this window`;
});
function binTitle(b: PjBin) {
  const when = new Date(b.date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return b.total ? `${when}: ${b.completed} completed · ${b.failed} failed · ${b.deferred} deferred · ${b.cancelled} cancelled` : `${when}: no wakes`;
}
</script>
