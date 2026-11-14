<template>
  <svg class="kgx-spark" :viewBox="`0 0 ${w} ${h}`" preserveAspectRatio="none" :data-tone="tone" role="img" :aria-label="label">
    <path v-if="area" class="kgx-spark__area" :d="area" />
    <path class="kgx-spark__line" :d="line" vector-effect="non-scaling-stroke" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { kgSparkPath } from '~/scripts/kliveGames';

/** A small line of recent values. Gaps (the server wasn't running) break the line. */
const props = defineProps<{ values: (number | null)[]; max?: number; tone?: string; label?: string; fill?: boolean }>();
const w = 100;
const h = 28;
const line = computed(() => kgSparkPath(props.values, w, h, props.max));
const area = computed(() => {
  if (!props.fill || !line.value) return '';
  // Close each drawn run down to the baseline.
  return line.value.split('M').filter(Boolean).map(run => {
    const pts = run.trim().split('L').map(p => p.trim());
    const first = pts[0].split(' ')[0];
    const last = pts[pts.length - 1].split(' ')[0];
    return `M${first} ${h} L${pts.join(' L')} L${last} ${h} Z`;
  }).join(' ');
});
</script>
