<template>
  <div class="cs2x-chart" data-testid="cs2x-balance-chart" @mouseleave="hover = null" @mousemove="onMove">
    <svg ref="svg" :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="summary" :style="{ height: `${H}px` }" preserveAspectRatio="none">
      <line v-for="t in ticks" :key="t.v" class="cs2x-chart__grid" x1="0" :x2="W" :y1="y(t.v)" :y2="y(t.v)" />
      <text v-for="t in ticks" :key="`l${t.v}`" class="cs2x-chart__axis" x="2" :y="y(t.v) - 3">£{{ t.v }}</text>
      <path :d="areaCsfloat" fill="color-mix(in srgb, var(--x-float) 22%, transparent)" />
      <path :d="lineCsfloat" fill="none" stroke="var(--x-float)" stroke-width="1.6" vector-effect="non-scaling-stroke" />
      <path :d="areaSteamKnown" fill="color-mix(in srgb, var(--x-steam) 20%, transparent)" />
      <path :d="areaSteamCarried" fill="url(#cs2x-hatch)" />
      <path :d="lineTotal" fill="none" stroke="var(--x-steam)" stroke-width="1.6" vector-effect="non-scaling-stroke" />
      <defs>
        <pattern id="cs2x-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="color-mix(in srgb, var(--x-steam) 6%, transparent)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="color-mix(in srgb, var(--x-steam) 45%, transparent)" stroke-width="1.4" />
        </pattern>
      </defs>
      <template v-if="hover != null && points[hover]">
        <line :x1="px(hover)" :x2="px(hover)" y1="0" :y2="H - 14" stroke="rgba(242,163,65,0.45)" stroke-dasharray="3 3" />
        <circle :cx="px(hover)" :cy="y(points[hover].csfloat + points[hover].steam)" r="3.5" fill="var(--x-steam)" />
      </template>
      <text v-for="t in xTicks" :key="t.i" class="cs2x-chart__axis" :x="px(t.i)" :y="H - 2" text-anchor="middle">{{ t.label }}</text>
    </svg>
    <div v-if="hover != null && points[hover]" class="cs2x-chart__tip" :style="{ left: `${(px(hover) / W) * 100}%`, top: '6px' }">
      <b>{{ dateLabel(points[hover].at) }}</b>
      <div><span>CSFloat</span><span>£{{ points[hover].csfloat.toFixed(2) }}</span></div>
      <div><span>Steam{{ points[hover].carried ? ' (last known)' : '' }}</span><span>£{{ points[hover].steam.toFixed(2) }}</span></div>
      <div><span>Total</span><span>£{{ (points[hover].csfloat + points[hover].steam).toFixed(2) }}</span></div>
    </div>
    <div class="cs2x-legend" style="margin-top: 6px">
      <span><i style="--c: var(--x-float)"></i>CSFloat</span>
      <span><i style="--c: var(--x-steam)"></i>Steam wallet</span>
      <span><i class="is-hollow" style="--c: var(--x-steam)"></i>Steam carried forward (not read that day)</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Cs2BalancePoint } from '~/scripts/cs2Arbitrage';

const props = defineProps<{ points: Cs2BalancePoint[] }>();
const W = 600;
const H = 170;
const PLOT = H - 16;
const hover = ref<number | null>(null);
const svg = ref<SVGSVGElement | null>(null);

const max = computed(() => {
  const top = Math.max(1, ...props.points.map((p) => p.csfloat + p.steam));
  const step = top > 200 ? 50 : top > 80 ? 25 : top > 30 ? 10 : 5;
  return Math.ceil(top / step) * step;
});
const ticks = computed(() => {
  const step = max.value / 4;
  return [1, 2, 3, 4].map((i) => ({ v: Math.round(step * i) }));
});
const t0 = computed(() => props.points[0]?.at ?? 0);
const t1 = computed(() => Math.max(t0.value + 1, props.points[props.points.length - 1]?.at ?? 1));
const px = (i: number) => ((props.points[i].at - t0.value) / (t1.value - t0.value)) * W;
const y = (v: number) => PLOT - (v / max.value) * (PLOT - 6);

const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
const lineCsfloat = computed(() => path(props.points.map((p) => p.csfloat)));
const lineTotal = computed(() => path(props.points.map((p) => p.csfloat + p.steam)));
const areaCsfloat = computed(() => (props.points.length ? `${lineCsfloat.value}L${W},${PLOT}L0,${PLOT}Z` : ''));

/** The Steam band between the CSFloat line and the total, split by whether that day's Steam value was read. */
function band(carried: boolean) {
  const pts = props.points;
  let d = '';
  for (let i = 0; i < pts.length - 1; i++) {
    if (pts[i + 1].carried !== carried) continue;
    const a = i, b = i + 1;
    d += `M${px(a).toFixed(1)},${y(pts[a].csfloat + pts[a].steam).toFixed(1)}L${px(b).toFixed(1)},${y(pts[b].csfloat + pts[b].steam).toFixed(1)}`
      + `L${px(b).toFixed(1)},${y(pts[b].csfloat).toFixed(1)}L${px(a).toFixed(1)},${y(pts[a].csfloat).toFixed(1)}Z`;
  }
  return d;
}
const areaSteamKnown = computed(() => band(false));
const areaSteamCarried = computed(() => band(true));

const dateLabel = (at: number) => new Date(at).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: '2-digit' });
const xTicks = computed(() => {
  const n = props.points.length;
  if (!n) return [];
  const every = Math.max(1, Math.ceil(n / 6));
  return props.points.map((p, i) => ({ i, label: new Date(p.at).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) }))
    .filter((t) => t.i % every === 0 || t.i === n - 1);
});

function onMove(event: MouseEvent) {
  const box = svg.value?.getBoundingClientRect();
  if (!box || !props.points.length) return;
  const at = t0.value + ((event.clientX - box.left) / box.width) * (t1.value - t0.value);
  let best = 0;
  for (let i = 1; i < props.points.length; i++) if (Math.abs(props.points[i].at - at) < Math.abs(props.points[best].at - at)) best = i;
  hover.value = best;
}
const summary = computed(() => {
  const last = props.points[props.points.length - 1];
  return last ? `Balance history: £${(last.csfloat + last.steam).toFixed(2)} on the last record` : 'No balance records';
});
</script>
