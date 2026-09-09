<template>
  <svg v-if="history.length > 1" viewBox="0 0 100 28" role="img" :aria-label="`${name}: ${history.length} history samples, latest ${history.at(-1)?.value}`" class="result-spark">
    <title>{{ name }}: {{ history[0]?.value }} → {{ history.at(-1)?.value }}</title>
    <path :d="path" />
  </svg>
  <span v-else class="no-trend">No trend yet</span>
</template>
<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{ name: string; history: { timestamp: string; value: number }[] }>();
const path = computed(() => {
  const values = props.history.map(p => p.value);
  const min = Math.min(...values), max = Math.max(...values);
  const start = new Date(props.history[0]?.timestamp || 0).getTime();
  const end = new Date(props.history.at(-1)?.timestamp || 0).getTime();
  return props.history.map((p, i) => `${i ? 'L' : 'M'}${2 + 96 * (new Date(p.timestamp).getTime() - start) / Math.max(1, end - start)},${max === min ? 14 : 25 - 22 * (p.value - min) / (max - min)}`).join(' ');
});
</script>
<style scoped>
.result-spark { width:84px; height:28px; flex-shrink:0; }.result-spark path { fill:none; stroke:currentColor; stroke-width:1.6; }.no-trend { color:#929096; font-size:11px; }
</style>
