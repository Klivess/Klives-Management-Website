<template>
  <svg class="obx-spark" :viewBox="`0 0 ${W} ${height}`" :style="{ height: `${height}px` }" preserveAspectRatio="none" role="img" :aria-label="label">
    <template v-if="bars">
      <rect v-for="(b, i) in barRects" :key="i" :x="b.x" :y="b.y" :width="b.w" :height="b.h" rx="1" :fill="colour" :opacity="i === barRects.length - 1 ? 1 : 0.55" />
    </template>
    <template v-else-if="points.length > 1">
      <path :d="area" :fill="colour" opacity="0.14" />
      <path :d="line" fill="none" :stroke="colour" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />
    </template>
    <line v-else :x1="0" :x2="W" :y1="height - 1" :y2="height - 1" stroke="currentColor" opacity="0.15" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/** A tiny trend: a line with a soft area, or bars (the last one full strength). */
const props = withDefaults(defineProps<{ values: number[]; height?: number; colour?: string; bars?: boolean; label?: string }>(), {
  height: 26, colour: 'var(--obx-accent)', bars: false, label: 'trend',
});

const W = 100;
const max = computed(() => Math.max(1, ...props.values.map(v => (Number.isFinite(v) ? v : 0))));
const points = computed(() => props.values.map((v, i) => ({
  x: props.values.length > 1 ? (i / (props.values.length - 1)) * W : 0,
  y: props.height - 2 - ((Number.isFinite(v) ? v : 0) / max.value) * (props.height - 4),
})));
const line = computed(() => points.value.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '));
const area = computed(() => `${line.value} L${W},${props.height} L0,${props.height} Z`);
const barRects = computed(() => {
  const n = props.values.length;
  if (!n) return [];
  const slot = W / n;
  return props.values.map((v, i) => {
    const h = Math.max(1, ((Number.isFinite(v) ? v : 0) / max.value) * (props.height - 2));
    return { x: i * slot + slot * 0.15, w: slot * 0.7, y: props.height - h, h };
  });
});
</script>
