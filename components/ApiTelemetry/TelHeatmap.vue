<!--
  Latency heatmap (chart.js matrix): time across, log-latency bucket up, cell shade =
  request count on a single-hue sequential ramp (sqrt-scaled so a few slow outliers
  stay visible beside the bulk). Hover a cell for its count, range and time; the
  page-wide crosshair outlines the hovered column on every heatmap.
-->
<template>
  <div class="tel-heat">
    <div class="plot" :style="{ height: `${height}px` }">
      <canvas ref="canvas" role="img" :aria-label="aria" @pointerleave="onLeave"></canvas>
      <span v-if="!rows.length || !lo.length" class="empty">No data in this window</span>
    </div>
    <div class="scale" aria-hidden="true"><span>fewer</span><i></i><span>more requests</span></div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { telHoverT, fmtMs, fmtTime, fmtCount } from '~/scripts/apiTelemetryShared';
import { Chart, ensureChartsRegistered, cssVar, theme, tooltipOptions, axisTicks, crosshairPlugin } from '~/scripts/telChart';

const props = withDefaults(defineProps<{
  t0: number; step: number; lo: number[]; hi: number[]; rows: number[][]; height?: number;
}>(), { height: 130 });

const canvas = ref<HTMLCanvasElement | null>(null);
const chart = shallowRef<Chart | null>(null);
const RAMP = ['--tel-seq-1', '--tel-seq-2', '--tel-seq-3', '--tel-seq-4', '--tel-seq-5', '--tel-seq-6', '--tel-seq-7'];
let hovering = false;
let raf = 0;

const aria = computed(() => `Latency heatmap over ${props.rows.length} time buckets, from ${fmtMs(props.lo[0])} to ${fmtMs(props.hi[props.hi.length - 1])}. Hover a cell for its request count.`);

function build() {
  const el = canvas.value;
  if (!el) return;
  ensureChartsRegistered();
  chart.value?.destroy();
  const t = theme(el);
  const ramp = RAMP.map(v => cssVar(el, v));
  const cells: { x: number; y: number; v: number }[] = [];
  let max = 0;
  props.rows.forEach((row, i) => row.forEach((v, j) => { if (v > 0) { cells.push({ x: i, y: j, v }); max = Math.max(max, v); } }));
  const nx = Math.max(1, props.rows.length), ny = Math.max(1, props.lo.length);
  chart.value = new Chart(el, {
    type: 'matrix',
    data: {
      labels: Array.from({ length: nx }, (_, i) => i),
      datasets: [{
        label: 'Requests',
        data: cells as any,
        backgroundColor: (ctx: any) => {
          const v = ctx.raw?.v ?? 0;
          return ramp[Math.min(ramp.length - 1, Math.floor(Math.sqrt(v / (max || 1)) * (ramp.length - 1) + 0.0001))];
        },
        borderWidth: 0,
        width: ({ chart: c }: any) => Math.max(1, (c.chartArea?.width ?? 0) / nx - (nx > 150 ? 0 : 1)),
        height: ({ chart: c }: any) => Math.max(1, (c.chartArea?.height ?? 0) / ny - 1),
      } as any],
    },
    plugins: [crosshairPlugin],
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      telTime: { t0: props.t0, step: props.step },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipOptions(el),
          displayColors: false,
          callbacks: {
            title: (items: any[]) => items.length ? fmtTime(props.t0 + items[0].raw.x * props.step, props.step) : '',
            label: (item: any) => [`${fmtCount(item.raw.v)} requests`, `${fmtMs(props.lo[item.raw.y])} – ${fmtMs(props.hi[item.raw.y])}`],
          },
        },
      },
      scales: {
        x: { type: 'linear', offset: true, min: -0.5, max: nx - 0.5, grid: { display: false }, border: { color: t.axis },
          ticks: { ...axisTicks(el), maxTicksLimit: 4, stepSize: Math.max(1, Math.floor(nx / 4)), callback: (v: any) => fmtTime(props.t0 + Number(v) * props.step, props.step) } },
        y: { type: 'linear', offset: true, min: -0.5, max: ny - 0.5, grid: { display: false }, border: { display: false },
          ticks: { ...axisTicks(el), maxTicksLimit: 4, stepSize: Math.max(1, Math.floor(ny / 3)), callback: (v: any) => fmtMs(props.lo[Math.round(Number(v))]) },
          afterFit: (s: any) => { s.width = 46; } },
      },
      onHover: (event: any, _els: any, c: any) => {
        if (event.x == null) return;
        const i = Math.round(c.scales.x.getValueForPixel(event.x));
        if (i < 0 || i >= nx) return;
        hovering = true;
        telHoverT.value = props.t0 + i * props.step;
      },
    } as any,
  });
}

function onLeave() { hovering = false; telHoverT.value = null; }
watch(telHoverT, () => {
  if (hovering || !chart.value) return;
  if (!raf) raf = requestAnimationFrame(() => { raf = 0; chart.value?.draw(); });
});
watch(() => [props.rows, props.lo, props.t0, props.step], build);
onMounted(build);
onBeforeUnmount(() => { if (raf) cancelAnimationFrame(raf); chart.value?.destroy(); chart.value = null; });
</script>

<style scoped>
.plot { position: relative; }
canvas { cursor: crosshair; }
.empty { position: absolute; inset: 0; display: grid; place-items: center; color: var(--tel-muted); font-size: 11px; pointer-events: none; }
.scale { display: flex; align-items: center; gap: 6px; justify-content: flex-end; font-size: 10px; color: var(--tel-muted); margin-top: 3px; }
.scale i { width: 80px; height: 6px; border-radius: 3px;
  background: linear-gradient(90deg, var(--tel-seq-1), var(--tel-seq-3), var(--tel-seq-5), var(--tel-seq-7)); }
</style>
