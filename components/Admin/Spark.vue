<template>
  <div
    ref="root"
    class="adm-spark"
    :data-tone="tone"
    role="img"
    :aria-label="summary"
    @pointermove="onMove"
    @pointerleave="hover = null"
  >
    <template v-if="geometry">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="currentColor" stop-opacity="0.26" />
            <stop offset="1" stop-color="currentColor" stop-opacity="0" />
          </linearGradient>
        </defs>
        <template v-if="bars">
          <rect
            v-for="(bar, index) in geometry.bars"
            :key="index"
            class="adm-spark__bar"
            :data-zero="bar.zero"
            :x="bar.x"
            :y="bar.y"
            :width="bar.w"
            :height="bar.h"
            rx="0.6"
          />
        </template>
        <template v-else>
          <path class="adm-spark__area" :d="geometry.area" :fill="`url(#${gradientId})`" />
          <path class="adm-spark__line" :d="geometry.line" />
        </template>
      </svg>
      <span v-if="!bars" class="adm-spark__end" :style="{ left: `${geometry.last.x}%`, top: `${geometry.last.y}%` }"></span>
      <template v-if="hover">
        <span class="adm-spark__cross" :style="{ left: `${hover.x}%` }"></span>
        <span class="adm-tip" :style="{ left: `${Math.min(82, Math.max(18, hover.x))}%`, top: '0' }">
          <b>{{ format(hover.point.v) }}</b> <span>{{ clock(hover.point.t) }}</span>
        </span>
      </template>
    </template>
    <span v-else class="adm-spark__empty">{{ emptyText }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { SeriesPoint } from '~/scripts/adminConsole';

/*
 * A trend line with nothing but the line: no axes, one end marker, and a readout under the pointer.
 * The value it belongs to is printed beside it by the tile, so the chart only has to show shape.
 */
const props = withDefaults(defineProps<{
  points: SeriesPoint[];
  /** Fixed scale ends. Left out, the scale fits the data (and never starts above zero). */
  min?: number;
  max?: number;
  tone?: string;
  /** Columns instead of a line: for counts per interval, where joining the points would invent a slope. */
  bars?: boolean;
  format?: (value: number) => string;
  label?: string;
  emptyText?: string;
}>(), {
  tone: 'ok',
  bars: false,
  format: (value: number) => String(Math.round(value)),
  label: 'Trend',
  emptyText: 'Collecting…',
});

const gradientId = `adm-spark-${Math.random().toString(36).slice(2, 10)}`;

const root = ref<HTMLElement | null>(null);
const hover = ref<{ x: number; point: SeriesPoint } | null>(null);

const TOP = 8;
const BOTTOM = 96;

const geometry = computed(() => {
  const points = props.points;
  if (!points || points.length < 2) return null;
  const t0 = points[0].t;
  const span = Math.max(1, points[points.length - 1].t - t0);
  let lo = props.min ?? Math.min(0, ...points.map(point => point.v));
  let hi = props.max ?? Math.max(...points.map(point => point.v));
  if (props.max == null) hi = hi <= lo ? lo + 1 : lo + (hi - lo) * 1.12;
  if (hi <= lo) hi = lo + 1;

  const xy = points.map(point => ({
    x: ((point.t - t0) / span) * 100,
    y: BOTTOM - (Math.min(hi, Math.max(lo, point.v)) - lo) / (hi - lo) * (BOTTOM - TOP),
  }));
  const line = xy.map((p, index) => `${index ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
  // Columns share the width evenly, a sliver of surface between them; an empty interval keeps a
  // faint stub so the time axis stays readable.
  const slot = 100 / points.length;
  const columns = points.map((point, index) => {
    const height = point.v > lo ? Math.max(4, ((Math.min(hi, point.v) - lo) / (hi - lo)) * (BOTTOM - TOP)) : 2;
    return { x: index * slot + slot * 0.14, w: slot * 0.72, y: BOTTOM - height, h: height, zero: point.v <= lo };
  });
  return {
    line,
    area: `${line} L100 100 L0 100 Z`,
    last: xy[xy.length - 1],
    xy: props.bars ? columns.map(column => ({ x: column.x + column.w / 2, y: column.y })) : xy,
    bars: columns,
  };
});

function onMove(event: PointerEvent) {
  const points = props.points;
  const shape = geometry.value;
  if (!root.value || !shape || !points.length) return;
  const bounds = root.value.getBoundingClientRect();
  const x = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 100;
  let nearest = 0;
  for (let i = 1; i < shape.xy.length; i++) {
    if (Math.abs(shape.xy[i].x - x) < Math.abs(shape.xy[nearest].x - x)) nearest = i;
  }
  hover.value = { x: shape.xy[nearest].x, point: points[nearest] };
}

function clock(t: number): string {
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const summary = computed(() => {
  const points = props.points;
  if (!points || points.length < 2) return `${props.label}: no history yet`;
  const values = points.map(point => point.v);
  const minutes = Math.round((points[points.length - 1].t - points[0].t) / 60_000);
  return `${props.label} over the last ${minutes} minutes: now ${props.format(values[values.length - 1])}, low ${props.format(Math.min(...values))}, high ${props.format(Math.max(...values))}`;
});
</script>
