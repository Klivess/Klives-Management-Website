<template>
  <div class="dpl-curvewrap">
  <svg class="dpl-curve" :viewBox="`0 0 ${W} ${height}`" preserveAspectRatio="none" role="img" :aria-label="label" @pointermove="hover" @pointerleave="at = null">
    <line v-if="baseY != null" class="dpl-curve__base" x1="0" :x2="W" :y1="baseY" :y2="baseY" />
    <polyline v-if="pacePath" class="dpl-curve__pace" :points="pacePath" />
    <path v-if="area" class="dpl-curve__area" :data-tone="tone" :d="area" />
    <polyline v-if="linePath" class="dpl-curve__line" :data-tone="tone" :points="linePath" />
    <g v-if="at != null && pts[at]">
      <line class="dpl-curve__cursor" :x1="pts[at][0]" :x2="pts[at][0]" y1="0" :y2="height" />
      <circle class="dpl-curve__dot" :data-tone="tone" :cx="pts[at][0]" :cy="pts[at][1]" r="2.5" />
    </g>
  </svg>
  <div v-if="readout && at != null && live[at]" class="dpl-curve__readout">
    <b>{{ format(live[at][1]) }}</b> · {{ when(live[at][0]) }}
  </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

/**
 * A line with an optional dashed "pace" line (what the backtest implied from the same start) and a
 * baseline at the starting value. Width is a fixed viewBox stretched to the container.
 */
const props = withDefaults(defineProps<{
  live: [number, number][];
  pace?: [number, number][];
  base?: number | null;
  height?: number;
  tone?: string;
  label?: string;
  readout?: boolean;
  format?: (v: number) => string;
}>(), { pace: () => [], base: null, height: 48, tone: 'neutral', label: 'Equity', readout: false, format: (v: number) => v.toFixed(2) });

const W = 600;
const at = ref<number | null>(null);

const bounds = computed(() => {
  const all = [...props.live, ...props.pace];
  if (!all.length) return null;
  let tMin = Infinity, tMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (const [t, v] of all) {
    if (t < tMin) tMin = t; if (t > tMax) tMax = t;
    if (v < vMin) vMin = v; if (v > vMax) vMax = v;
  }
  if (props.base != null) { vMin = Math.min(vMin, props.base); vMax = Math.max(vMax, props.base); }
  if (vMax - vMin < 1e-9) { vMax += 1; vMin -= 1; }
  if (tMax - tMin < 1) tMax = tMin + 1;
  const pad = (vMax - vMin) * 0.08;
  return { tMin, tMax, vMin: vMin - pad, vMax: vMax + pad };
});

function project([t, v]: [number, number]): [number, number] {
  const b = bounds.value!;
  return [((t - b.tMin) / (b.tMax - b.tMin)) * W, props.height - ((v - b.vMin) / (b.vMax - b.vMin)) * props.height];
}

const pts = computed(() => (bounds.value ? props.live.map(project) : []));
const linePath = computed(() => (pts.value.length > 1 ? pts.value.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') : ''));
const pacePath = computed(() => (bounds.value && props.pace.length > 1 ? props.pace.map(project).map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') : ''));
const area = computed(() => {
  if (pts.value.length < 2) return '';
  const first = pts.value[0];
  const last = pts.value[pts.value.length - 1];
  return `M${first[0]},${props.height} L${pts.value.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L')} L${last[0]},${props.height} Z`;
});
const baseY = computed(() => (bounds.value && props.base != null ? project([bounds.value.tMin, props.base])[1] : null));

function hover(event: PointerEvent) {
  if (!props.readout || !pts.value.length) return;
  const el = event.currentTarget as SVGElement;
  const rect = el.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * W;
  let best = 0;
  for (let i = 1; i < pts.value.length; i++) if (Math.abs(pts.value[i][0] - x) < Math.abs(pts.value[best][0] - x)) best = i;
  at.value = best;
}

function when(t: number) {
  return new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
}
</script>
