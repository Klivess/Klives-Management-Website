<template>
  <svg
    v-if="points.length > 1"
    class="obs-sparkline"
    :width="width"
    :height="height"
    :viewBox="`0 0 ${width} ${height}`"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <polyline :points="polyline" fill="none" :stroke="lineColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
    <!-- End dot: a 2px surface ring keeps it legible where the line doubles back on it. -->
    <circle :cx="last.x" :cy="last.y" r="3" :fill="dotColor" :stroke="surface" stroke-width="2" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

// A single-series trend line — no axes, no legend (the tile/row label names it). The recessive
// gray line de-emphasises the shape; the green end-dot marks "now", the value people read.
const props = withDefaults(defineProps<{
  samples: Array<{ numericValue?: number | null }>;
  width?: number;
  height?: number;
  lineColor?: string;
  dotColor?: string;
  surface?: string;
}>(), {
  width: 60,
  height: 18,
  lineColor: '#4a4a50',
  dotColor: '#4d9e39',
  surface: '#161519',
});

const values = computed(() =>
  props.samples.map(s => (typeof s.numericValue === 'number' ? s.numericValue : NaN)).filter(v => !Number.isNaN(v)));

const points = computed(() => {
  const vs = values.value;
  if (vs.length < 2) return [] as { x: number; y: number }[];
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const span = max - min || 1;
  const pad = 3;
  const w = props.width - pad * 2;
  const h = props.height - pad * 2;
  return vs.map((v, i) => ({
    x: pad + (vs.length === 1 ? 0 : (i / (vs.length - 1)) * w),
    // Flip y: SVG origin is top-left, higher values should sit higher.
    y: pad + h - ((v - min) / span) * h,
  }));
});

const polyline = computed(() => points.value.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
const last = computed(() => points.value[points.value.length - 1] ?? { x: 0, y: 0 });
</script>

<style scoped>
.obs-sparkline { display: block; overflow: visible; }
</style>
