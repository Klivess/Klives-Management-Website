<!-- A small line or bar trend for a tile or a table row. Gaps (null) are not drawn. -->
<template>
  <svg class="llx-spark" :class="{ 'llx-spark--bars': bars }" :viewBox="`0 0 ${width} ${height}`" preserveAspectRatio="none"
       role="img" :aria-label="aria" :data-tone="tone">
    <template v-if="bars">
      <rect v-for="(b, i) in barRects" :key="i" :x="b.x" :y="b.y" :width="b.w" :height="b.h" rx="0.6" />
    </template>
    <template v-else>
      <path v-if="area" class="llx-spark__area" :d="area" />
      <path class="llx-spark__line" :d="line" />
    </template>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  points: (number | null)[];
  bars?: boolean;
  tone?: string;
  label?: string;
  width?: number;
  height?: number;
  format?: (v: number) => string;
}>(), { tone: 'info', label: 'Trend', width: 120, height: 30 });

const values = computed(() => props.points.map(v => (typeof v === 'number' && Number.isFinite(v) ? v : null)));
const max = computed(() => Math.max(0, ...values.value.filter((v): v is number => v != null)));
const min = computed(() => props.bars ? 0 : Math.min(max.value, ...values.value.filter((v): v is number => v != null)));
const step = computed(() => values.value.length > 1 ? props.width / (values.value.length - (props.bars ? 0 : 1)) : props.width);

function y(v: number) {
  const range = max.value - min.value || 1;
  return props.height - 2 - ((v - min.value) / range) * (props.height - 4);
}

const line = computed(() => {
  let d = '';
  let pen = false;
  values.value.forEach((v, i) => {
    if (v == null) { pen = false; return; }
    d += `${pen ? 'L' : 'M'}${(i * step.value).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  return d;
});
const area = computed(() => {
  const pts = values.value.map((v, i) => (v == null ? null : [i * step.value, y(v)] as const)).filter((p): p is readonly [number, number] => p != null);
  if (pts.length < 2) return '';
  return `M${pts[0][0]},${props.height} ` + pts.map(p => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') + ` L${pts[pts.length - 1][0]},${props.height} Z`;
});
const barRects = computed(() => values.value.map((v, i) => {
  const w = Math.max(1, step.value - 1);
  const h = v == null || max.value === 0 ? 0 : Math.max(v > 0 ? 1 : 0, (v / max.value) * (props.height - 2));
  return { x: i * step.value, y: props.height - h, w, h };
}));
const aria = computed(() => {
  const vs = values.value.filter((v): v is number => v != null);
  if (!vs.length) return `${props.label}: no data`;
  const f = props.format ?? ((v: number) => String(Math.round(v)));
  return `${props.label}: latest ${f(vs[vs.length - 1])}, peak ${f(Math.max(...vs))}`;
});
</script>
