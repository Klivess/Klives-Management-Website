<!--
  Distribution on the server's log-scale buckets (latency or response size), as a
  chart.js bar chart. Hover a bar for its range and count; p50/p95/p99 are marked
  with labelled dashed lines.
-->
<template>
  <div class="tel-hist">
    <div class="plot"><canvas ref="canvas" role="img" :aria-label="aria"></canvas></div>
    <div class="foot">p50 {{ fmt(p50) }} · p95 {{ fmt(p95) }} · p99 {{ fmt(p99) }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type { Plugin } from 'chart.js';
import { fmtCount, fmtMs, fmtBytes } from '~/scripts/apiTelemetryShared';
import { Chart, ensureChartsRegistered, cssVar, theme, tooltipOptions, axisTicks } from '~/scripts/telChart';

const props = defineProps<{ lo: number[]; hi: number[]; count: number[]; p50: number; p95: number; p99: number; unit: 'ms' | 'bytes' }>();
const canvas = ref<HTMLCanvasElement | null>(null);
const chart = shallowRef<Chart | null>(null);
const fmt = (v: number | undefined) => props.unit === 'ms' ? fmtMs(v) : fmtBytes(v);
const aria = computed(() => `Distribution across ${props.count.length} buckets; p50 ${fmt(props.p50)}, p95 ${fmt(props.p95)}, p99 ${fmt(props.p99)}. Hover a bar for its count.`);

/** Index of the bucket containing a value (the markers sit on bucket centres). */
function bucketOf(v: number) {
  for (let i = 0; i < props.lo.length; i++) if (v >= props.lo[i] && v <= props.hi[i]) return i;
  return v < (props.lo[0] ?? 0) ? 0 : props.lo.length - 1;
}

const markers: Plugin = {
  id: 'telPercentiles',
  afterDatasetsDraw(c) {
    if (!props.lo.length) return;
    const ctx = c.ctx;
    const t = theme(c.canvas);
    ctx.save();
    ctx.setLineDash([2, 2]);
    ctx.strokeStyle = t.text2;
    ctx.fillStyle = t.muted;
    ctx.font = '9px Inter, Roboto, system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const [label, v] of [['p50', props.p50], ['p95', props.p95], ['p99', props.p99]] as const) {
      const x = c.scales.x.getPixelForValue(bucketOf(v));
      ctx.beginPath();
      ctx.moveTo(x, c.chartArea.top + 8);
      ctx.lineTo(x, c.chartArea.bottom);
      ctx.stroke();
      ctx.fillText(label, x, c.chartArea.top + 6);
    }
    ctx.restore();
  },
};

function build() {
  const el = canvas.value;
  if (!el) return;
  ensureChartsRegistered();
  chart.value?.destroy();
  const color = cssVar(el, '--tel-s1');
  const t = theme(el);
  chart.value = new Chart(el, {
    type: 'bar',
    data: {
      labels: props.lo.map(v => fmt(v)),
      datasets: [{ label: 'Requests', data: [...props.count], backgroundColor: color, hoverBackgroundColor: cssVar(el, '--tel-s1-hover'),
        borderRadius: 2, categoryPercentage: 1, barPercentage: 0.88 }],
    },
    plugins: [markers],
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      layout: { padding: { top: 10 } },
      interaction: { mode: 'index', intersect: false, axis: 'x' },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipOptions(el),
          displayColors: false,
          callbacks: {
            title: items => items.length ? `${fmt(props.lo[items[0].dataIndex])} – ${fmt(props.hi[items[0].dataIndex])}` : '',
            label: item => `${fmtCount(item.raw as number)} requests`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, border: { color: t.axis }, ticks: { ...axisTicks(el), maxTicksLimit: 5 } },
        y: { beginAtZero: true, grid: { color: t.grid }, border: { display: false },
          ticks: { ...axisTicks(el), maxTicksLimit: 3, callback: (v: any) => fmtCount(Number(v)) }, afterFit: (s: any) => { s.width = 40; } },
      },
    },
  });
}

watch(() => [props.lo, props.count, props.p50, props.p95, props.p99, props.unit], build);
onMounted(build);
onBeforeUnmount(() => { chart.value?.destroy(); chart.value = null; });
</script>

<style scoped>
.plot { position: relative; height: 104px; }
.foot { font-size: 11px; color: var(--tel-muted); margin-top: 2px; }
</style>
