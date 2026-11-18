<!-- One cell per period (minute, hour or day): green up, amber degraded, red down, grey no data. -->
<template>
  <div class="llx-strip" role="img" :aria-label="aria" :style="{ height: `${height}px` }">
    <span v-for="(cell, i) in cells" :key="i" class="llx-strip__cell" :data-state="cell.state" :title="cell.title"></span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  /** Either minute states ("up"…) or counts per period. */
  states?: string[];
  periods?: { ts: number; up: number; degraded: number; down: number; noData: number }[];
  periodLabel?: (ts: number) => string;
  height?: number;
}>(), { height: 18 });

const cells = computed(() => {
  if (props.states) return props.states.map((state, i) => ({ state, title: `${props.states!.length - i} min ago: ${state === 'nodata' ? 'no data' : state}` }));
  return (props.periods ?? []).map(p => {
    const measured = p.up + p.degraded + p.down;
    const state = !measured ? 'nodata' : p.down > measured * 0.05 ? 'down' : p.degraded + p.down > 0 ? 'degraded' : 'up';
    const label = props.periodLabel ? props.periodLabel(p.ts) : new Date(p.ts).toLocaleString();
    return { state, title: `${label}: ${p.up} up, ${p.degraded} degraded, ${p.down} down, ${p.noData} silent minutes` };
  });
});
const aria = computed(() => {
  const counts = cells.value.reduce((acc, c) => { acc[c.state] = (acc[c.state] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  return `Availability: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ') || 'no data'}`;
});
</script>
