<template>
  <svg v-if="shape" class="hom-spark" :data-tone="tone" viewBox="0 0 100 32" preserveAspectRatio="none" role="img" :aria-label="summary">
    <defs>
      <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="currentColor" stop-opacity="0.32" />
        <stop offset="1" stop-color="currentColor" stop-opacity="0" />
      </linearGradient>
    </defs>
    <template v-if="bars">
      <rect v-for="(bar, index) in shape.bars" :key="index" class="hom-spark__bar" :x="bar.x" :y="bar.y" :width="bar.w" :height="bar.h" rx="0.8" />
    </template>
    <template v-else>
      <path :d="shape.area" :fill="`url(#${gradientId})`" />
      <path class="hom-spark__line" :d="shape.line" vector-effect="non-scaling-stroke" />
    </template>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SeriesPoint } from '~/scripts/adminConsole';

/* Shape only: the figure it belongs to is printed beside it. Bars for counts per interval, a line for gauges. */
const props = withDefaults(defineProps<{ points?: SeriesPoint[]; bars?: boolean; tone?: string; min?: number; max?: number; label?: string }>(), {
  points: () => [], bars: false, tone: 'ok', min: undefined, max: undefined, label: 'Trend',
});

const gradientId = `hom-spark-${Math.random().toString(36).slice(2, 9)}`;

const shape = computed(() => {
  const points = props.points;
  if (!points || points.length < 2) return null;
  const values = points.map(point => point.v);
  const lo = props.min ?? Math.min(0, ...values);
  let hi = props.max ?? Math.max(...values);
  if (props.max == null) hi = hi <= lo ? lo + 1 : lo + (hi - lo) * 1.08;
  const t0 = points[0].t;
  const span = Math.max(1, points[points.length - 1].t - t0);
  const y = (v: number) => 31 - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * 28;
  const xy = points.map(point => ({ x: ((point.t - t0) / span) * 100, y: y(point.v) }));
  const line = xy.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
  const slot = 100 / points.length;
  const bars = points.map((point, i) => {
    const h = point.v > lo ? Math.max(1.5, 31 - y(point.v)) : 1;
    return { x: i * slot + slot * 0.16, w: slot * 0.68, y: 31 - h, h };
  });
  return { line, area: `${line} L100 32 L0 32 Z`, bars };
});

const summary = computed(() => {
  const values = props.points.map(point => point.v);
  if (values.length < 2) return `${props.label}: no history yet`;
  const round = (v: number) => (Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10);
  return `${props.label}: now ${round(values[values.length - 1])}, low ${round(Math.min(...values))}, high ${round(Math.max(...values))}`;
});
</script>
