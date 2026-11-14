<template>
  <div ref="root" class="pfx-chart" @pointerleave="hover = -1">
    <svg :viewBox="`0 0 ${width} ${height}`" :height="height" role="img" :aria-label="label">
      <line v-for="g in grid" :key="g.y" class="pfx-chart__grid" x1="0" :x2="width" :y1="g.y" :y2="g.y" />
      <text v-for="g in grid" :key="`t${g.y}`" class="pfx-chart__axis" x="0" :y="g.y - 3">{{ g.label }}</text>
      <g v-for="(bar, i) in bars" :key="i" @pointerenter="hover = i">
        <rect :x="bar.x" y="0" :width="bar.w + gap" :height="height - 16" fill="transparent" />
        <rect v-for="seg in bar.segments" :key="seg.key" :x="bar.x" :y="seg.y" :width="bar.w" :height="seg.h" :fill="seg.color" :opacity="hover === -1 || hover === i ? 0.92 : 0.45" rx="1.5" />
      </g>
      <text v-for="t in ticks" :key="`x${t.x}`" class="pfx-chart__axis" :x="t.x" :y="height - 2" text-anchor="middle">{{ t.label }}</text>
    </svg>
    <div v-if="hover >= 0 && bars[hover]" class="pfx-tip" :style="{ left: `${tipLeft}%`, top: '0px' }">
      <div style="color: var(--pfx-ink-3); margin-bottom: 3px">{{ bars[hover].label }}</div>
      <div v-for="seg in [...bars[hover].segments].reverse()" :key="seg.key"><i :style="{ background: seg.color }"></i>{{ seg.label }}<b>{{ seg.value.toLocaleString() }}</b></div>
      <div v-if="!bars[hover].segments.length" style="color: var(--pfx-ink-3)">nothing</div>
    </div>
    <div class="pfx-chart__legend">
      <span v-for="s in series" :key="s.key"><i :style="{ background: s.color }"></i>{{ s.label }} {{ s.total.toLocaleString() }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

/**
 * Requests per bucket, stacked by service: drawn as plain SVG (no chart library), one hover tip
 * per bucket listing every service in it.
 */
const props = withDefaults(defineProps<{
  t0: number;
  step: number;
  series: { key: string; label: string; color: string; values: number[] }[];
  label?: string;
  height?: number;
}>(), { label: 'Requests by service', height: 150 });

/** Drawn at the element's own width (measured), so labels are never stretched. */
const width = ref(600);
const hover = ref(-1);
const root = ref<HTMLElement | null>(null);
let observer: ResizeObserver | null = null;
onMounted(() => {
  if (!root.value) return;
  width.value = Math.max(120, root.value.clientWidth);
  observer = new ResizeObserver(entries => { width.value = Math.max(120, Math.round(entries[0].contentRect.width)); });
  observer.observe(root.value);
});
onBeforeUnmount(() => observer?.disconnect());
const count = computed(() => Math.max(0, ...props.series.map(s => s.values.length)));
const gap = computed(() => (count.value > 60 ? 1 : 2));
const totals = computed(() => Array.from({ length: count.value }, (_, i) => props.series.reduce((n, s) => n + (s.values[i] ?? 0), 0)));
const peak = computed(() => niceCeil(Math.max(1, ...totals.value)));
const plot = computed(() => props.height - 18);
const series = computed(() => props.series.map(s => ({ ...s, total: s.values.reduce((n, v) => n + v, 0) })).filter(s => s.total > 0));

function niceCeil(n: number) {
  const p = 10 ** Math.floor(Math.log10(n));
  const m = n / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

const daily = computed(() => props.step >= 86_400_000);
function bucketLabel(i: number) {
  const d = new Date(props.t0 + i * props.step);
  return daily.value
    ? d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
    : `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

const bars = computed(() => {
  const n = count.value;
  if (!n) return [];
  const w = Math.max(1, width.value / n - gap.value);
  return Array.from({ length: n }, (_, i) => {
    let y = plot.value;
    const segments = props.series
      .map(s => ({ key: s.key, label: s.label, color: s.color, value: s.values[i] ?? 0 }))
      .filter(seg => seg.value > 0)
      .map(seg => {
        const h = (seg.value / peak.value) * (plot.value - 4);
        y -= h;
        return { ...seg, y, h: Math.max(h, 1) };
      });
    return { x: i * (width.value / n), w, segments, label: `${bucketLabel(i)} · ${totals.value[i].toLocaleString()}` };
  });
});

const grid = computed(() => [0.5, 1].map(f => ({ y: plot.value - f * (plot.value - 4), label: Math.round(peak.value * f).toLocaleString() })));
const ticks = computed(() => {
  const n = count.value;
  if (!n) return [];
  const every = Math.max(1, Math.round(n / 6));
  const out = [];
  for (let i = 0; i < n; i += every) {
    const d = new Date(props.t0 + i * props.step);
    out.push({ x: i * (width.value / n) + width.value / n / 2, label: daily.value ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : d.toLocaleTimeString(undefined, { hour: '2-digit' }) });
  }
  return out;
});
const tipLeft = computed(() => (count.value ? Math.min(88, Math.max(12, ((hover.value + 0.5) / count.value) * 100)) : 50));
</script>
