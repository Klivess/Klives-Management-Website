<!--
  Request lifecycle waterfall as a chart.js floating horizontal bar chart. Rows are
  pipeline stages in order (optionally with the browser's phases around them).
  "mean" and "trace" lay bars end to end — means add, so offsets sum to the mean
  total. Percentiles don't add, so "p95" draws every bar from zero and says so.
  Hover a bar for its duration, share and what the stage means.
-->
<template>
  <div class="tel-wf">
    <div class="plot" :style="{ height: `${plotHeight}px` }"><canvas ref="canvas" role="img" :aria-label="aria"></canvas></div>
    <p class="note">{{ note }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { fmtMs, type WaterfallRow } from '~/scripts/apiTelemetryShared';
import { Chart, ensureChartsRegistered, cssVar, theme, tooltipOptions, axisTicks } from '~/scripts/telChart';

const props = withDefaults(defineProps<{ rows: WaterfallRow[]; mode?: 'mean' | 'p95' | 'trace'; label?: string; hideZero?: boolean }>(),
  { mode: 'mean', label: 'Request lifecycle', hideZero: false });

const canvas = ref<HTMLCanvasElement | null>(null);
const chart = shallowRef<Chart | null>(null);

const laid = computed(() => {
  const rows = props.hideZero ? props.rows.filter(r => r.ms >= 0.001 || r.side === 'client') : props.rows;
  const stacked = props.mode !== 'p95';
  let cursor = 0;
  return rows.map(r => {
    const start = props.mode === 'trace' && r.start != null ? r.start : stacked && r.latency !== false ? cursor : 0;
    if (stacked && r.latency !== false) cursor = Math.max(cursor, start + r.ms);
    return { ...r, latency: r.latency !== false, start };
  });
});
const plotHeight = computed(() => Math.max(60, laid.value.length * 17 + 26));
const aria = computed(() => `${props.label}: ` + laid.value.map(r => `${r.label} ${fmtMs(r.ms)}`).join(', '));
const note = computed(() => props.mode === 'p95'
  ? 'p95 per stage, each from zero — percentiles don’t add up to the total.'
  : props.mode === 'trace'
    ? 'One request, stages laid end to end. Faded bars happen outside client-visible latency.'
    : 'Mean per stage laid end to end (means add up to the mean total). Faded bars are excluded from latency.');

function build() {
  const el = canvas.value;
  if (!el) return;
  ensureChartsRegistered();
  chart.value?.destroy();
  const t = theme(el);
  const rows = laid.value;
  const colors = rows.map(r => {
    const c = cssVar(el, r.color);
    return r.latency ? c : `${c}66`;
  });
  chart.value = new Chart(el, {
    type: 'bar',
    data: {
      labels: rows.map(r => r.label),
      datasets: [{
        label: 'Duration',
        // Floating bars: [start, end]; a minimum visible width keeps tiny stages hoverable.
        data: rows.map(r => [r.start, r.start + Math.max(r.ms, 0)]) as any,
        backgroundColor: colors,
        hoverBackgroundColor: colors,
        borderRadius: 2,
        borderSkipped: false,
        minBarLength: 2,
        barPercentage: 0.7,
        categoryPercentage: 1,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false, axis: 'y' },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipOptions(el),
          displayColors: false,
          callbacks: {
            title: items => items.length ? rows[items[0].dataIndex].label : '',
            label: item => {
              const r = rows[item.dataIndex];
              const out = [`${fmtMs(r.ms)}${r.share != null ? ` · ${(r.share * 100).toFixed(1)}% of latency` : ''}`];
              if (props.mode !== 'p95') out.push(`starts at ${fmtMs(r.start)}`);
              if (!r.latency) out.push('not part of client-visible latency');
              if (r.help) out.push(r.help);
              return out;
            },
          },
        },
      },
      scales: {
        x: { beginAtZero: true, grid: { color: t.grid }, border: { display: false },
          ticks: { ...axisTicks(el), maxTicksLimit: 5, callback: (v: any) => fmtMs(Number(v)) } },
        y: { grid: { display: false }, border: { color: t.axis },
          ticks: { ...axisTicks(el), autoSkip: false, color: t.text2 }, afterFit: (s: any) => { s.width = 128; } },
      },
    },
  });
}

watch(() => [props.rows, props.mode, props.hideZero], build);
onMounted(build);
onBeforeUnmount(() => { chart.value?.destroy(); chart.value = null; });
</script>

<style scoped>
.plot { position: relative; }
.note { margin-top: 4px !important; font-size: 10px; color: var(--tel-muted); }
</style>
