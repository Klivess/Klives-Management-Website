<template>
  <svg class="msx-spark" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" role="img" :aria-label="label">
    <template v-if="bars">
      <rect v-for="(b, i) in barRects" :key="i" :x="b.x" :y="b.y" :width="b.w" :height="b.h" rx="0.8" :fill="colour" :opacity="b.last ? 1 : 0.55" />
    </template>
    <template v-else-if="line">
      <path :d="area" :fill="colour" opacity="0.14" />
      <path :d="line" fill="none" :stroke="colour" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
    </template>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{ points: number[]; bars?: boolean; colour?: string; label?: string }>(), {
  bars: false,
  colour: '#ff6b9a',
  label: '',
});

const W = 100;
const H = 26;
const max = computed(() => Math.max(1, ...props.points));

const barRects = computed(() => {
  const n = props.points.length;
  if (!n) return [];
  const step = W / n;
  const w = Math.max(0.8, step * 0.72);
  return props.points.map((v, i) => {
    const h = v > 0 ? Math.max(1.5, (v / max.value) * (H - 1)) : 0.6;
    return { x: i * step + (step - w) / 2, y: H - h, w, h, last: i === n - 1 };
  });
});

const coords = computed(() => {
  const n = props.points.length;
  if (n < 2) return [];
  return props.points.map((v, i) => [(i / (n - 1)) * W, H - 1 - (v / max.value) * (H - 3)] as const);
});
const line = computed(() => (coords.value.length ? coords.value.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join('') : ''));
const area = computed(() => (line.value ? `${line.value}L${W},${H}L0,${H}Z` : ''));
</script>
