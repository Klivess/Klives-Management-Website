<template>
  <div class="ktx-trace" @pointermove="onMove" @pointerleave="hover = null">
    <svg class="ktx-trace__svg" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" role="img" :aria-label="label">
      <line v-for="g in grid" :key="g" class="ktx-trace__grid" x1="0" :x2="W" :y1="g" :y2="g" />
      <path v-if="shape" class="ktx-trace__area" :d="shape.area" />
      <path v-if="shape" class="ktx-trace__line" :d="shape.line" vector-effect="non-scaling-stroke" />
      <line v-if="hoverX != null" class="ktx-trace__cursor" :x1="hoverX" :x2="hoverX" y1="0" :y2="H" vector-effect="non-scaling-stroke" />
    </svg>
    <div v-if="shape" class="ktx-trace__scale">
      <span>{{ fmt(range.max) }}</span>
      <span>{{ fmt(range.min) }}</span>
    </div>
    <div v-if="hoverPoint" class="ktx-trace__tip" :style="{ left: `${(hoverX! / W) * 100}%` }">
      <b class="ktx-mono">{{ fmt(hoverPoint.y) }}</b>
      <span>#{{ hoverPoint.seq }} · {{ new Date(hoverPoint.x).toLocaleTimeString() }}</span>
    </div>
    <div v-if="!shape" class="ktx-trace__empty">{{ points.length ? 'Waiting for a second sample…' : 'No samples yet' }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TracePoint } from '~/scripts/kliveTechLive';

/** A time chart for one numeric Streamable, drawn from the live buffer. Hover reads a sample. */
const props = withDefaults(defineProps<{ points: TracePoint[]; step?: boolean; label?: string; format?: (v: number) => string }>(), { step: false, label: 'Samples over time' });

const W = 600;
const H = 120;
const grid = [H * 0.25, H * 0.5, H * 0.75];
const hover = ref<number | null>(null);

const range = computed(() => {
  const ys = props.points.map(p => p.y);
  if (!ys.length) return { min: 0, max: 0 };
  let min = Math.min(...ys);
  let max = Math.max(...ys);
  if (min === max) { min -= 1; max += 1; }
  return { min, max };
});

const xs = computed(() => {
  const pts = props.points;
  if (pts.length < 2) return null;
  const t0 = pts[0].x;
  const t1 = pts[pts.length - 1].x;
  const span = t1 - t0 || 1;
  return pts.map(p => ((p.x - t0) / span) * W);
});

const shape = computed(() => {
  const pts = props.points;
  const x = xs.value;
  if (!x) return null;
  const { min, max } = range.value;
  const y = (v: number) => H - 6 - ((v - min) / (max - min)) * (H - 12);
  let line = `M${x[0].toFixed(1)},${y(pts[0].y).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    line += props.step ? ` H${x[i].toFixed(1)} V${y(pts[i].y).toFixed(1)}` : ` L${x[i].toFixed(1)},${y(pts[i].y).toFixed(1)}`;
  }
  return { line, area: `${line} L${W},${H} L0,${H} Z` };
});

const hoverIndex = computed(() => {
  const x = xs.value;
  if (hover.value == null || !x) return null;
  let best = 0;
  for (let i = 1; i < x.length; i++) if (Math.abs(x[i] - hover.value) < Math.abs(x[best] - hover.value)) best = i;
  return best;
});
const hoverPoint = computed(() => (hoverIndex.value == null ? null : props.points[hoverIndex.value]));
const hoverX = computed(() => (hoverIndex.value == null || !xs.value ? null : xs.value[hoverIndex.value]));

function onMove(event: PointerEvent) {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  hover.value = ((event.clientX - box.left) / box.width) * W;
}

function fmt(v: number): string {
  if (props.format) return props.format(v);
  return Math.abs(v) >= 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : v.toLocaleString(undefined, { maximumFractionDigits: 3 });
}
</script>
