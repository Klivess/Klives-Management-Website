<!--
  Hour-of-week grid (last 4 weeks), chart.js matrix: when is the API busy, and when
  is it slow? The server sends UTC cells (dayOfWeek*24 + hour); they're rotated into
  the viewer's local time so "Tuesday 09:00" means the viewer's Tuesday 09:00.
-->
<template>
  <div class="tel-week">
    <div class="tel-week__head">
      <div class="seg" role="group" aria-label="Metric">
        <button v-for="m in metrics" :key="m.key" type="button" :aria-pressed="metric === m.key" @click="metric = m.key">{{ m.label }}</button>
      </div>
      <span class="hint">{{ tzNote }}</span>
    </div>
    <div class="plot"><canvas ref="canvas" role="img" :aria-label="`${activeLabel} by day and hour, local time. Hover a cell for its value.`"></canvas></div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { fmtMs, fmtPct, fmtCount } from '~/scripts/apiTelemetryShared';
import { Chart, ensureChartsRegistered, cssVar, tooltipOptions, axisTicks } from '~/scripts/telChart';

const props = defineProps<{ avgCount: (number | null)[]; p95: (number | null)[]; errPct: (number | null)[] }>();
const metrics = [
  { key: 'avgCount', label: 'Traffic' },
  { key: 'p95', label: 'p95' },
  { key: 'errPct', label: 'Errors' },
] as const;
const metric = ref<'avgCount' | 'p95' | 'errPct'>('avgCount');
const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const canvas = ref<HTMLCanvasElement | null>(null);
const chart = shallowRef<Chart | null>(null);

// Whole-hour rotation; a fractional zone (e.g. +05:30) rounds to the nearest hour.
const offsetHours = Math.round(-new Date().getTimezoneOffset() / 60);
const tzNote = `Local time (UTC${offsetHours >= 0 ? '+' : ''}${offsetHours}) · last 4 weeks`;
const activeLabel = computed(() => metrics.find(m => m.key === metric.value)!.label);

const local = computed(() => {
  const src = props[metric.value] ?? [];
  const out: (number | null)[] = new Array(168).fill(null);
  for (let utc = 0; utc < 168; utc++) out[(utc + offsetHours + 168) % 168] = src[utc] ?? null;
  return out;
});

function valueText(v: number | null) {
  return metric.value === 'p95' ? fmtMs(v) : metric.value === 'errPct' ? fmtPct(v) : `${fmtCount(v)} req/h`;
}

function build() {
  const el = canvas.value;
  if (!el) return;
  ensureChartsRegistered();
  chart.value?.destroy();
  const ramp = ['--tel-seq-1', '--tel-seq-2', '--tel-seq-3', '--tel-seq-4', '--tel-seq-5', '--tel-seq-6', '--tel-seq-7'].map(v => cssVar(el, v));
  const track = cssVar(el, '--tel-track');
  const vals = local.value;
  const max = Math.max(0, ...vals.filter((v): v is number => v != null));
  const cells = vals.map((v, i) => ({ x: i % 24, y: Math.floor(i / 24), v }));
  chart.value = new Chart(el, {
    type: 'matrix',
    data: {
      datasets: [{
        label: activeLabel.value,
        data: cells as any,
        backgroundColor: (ctx: any) => {
          const v = ctx.raw?.v;
          if (v == null || !(max > 0) || v <= 0) return track;
          return ramp[Math.min(ramp.length - 1, Math.floor((v / max) * (ramp.length - 1) + 0.0001))];
        },
        borderWidth: 0,
        width: ({ chart: c }: any) => Math.max(1, (c.chartArea?.width ?? 0) / 24 - 2),
        height: ({ chart: c }: any) => Math.max(1, (c.chartArea?.height ?? 0) / 7 - 2),
      } as any],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipOptions(el),
          displayColors: false,
          callbacks: {
            title: (items: any[]) => items.length ? `${days[items[0].raw.y]} ${String(items[0].raw.x).padStart(2, '0')}:00` : '',
            label: (item: any) => valueText(item.raw.v),
          },
        },
      },
      scales: {
        x: { type: 'linear', offset: true, min: -0.5, max: 23.5, grid: { display: false }, border: { display: false },
          ticks: { ...axisTicks(el), stepSize: 6, callback: (v: any) => String(v).padStart(2, '0') } },
        y: { type: 'linear', offset: true, min: -0.5, max: 6.5, reverse: true, grid: { display: false }, border: { display: false },
          ticks: { ...axisTicks(el), stepSize: 1, callback: (v: any) => days[Number(v)] ?? '' }, afterFit: (s: any) => { s.width = 30; } },
      },
    } as any,
  });
}

watch([local, metric], build);
onMounted(build);
onBeforeUnmount(() => { chart.value?.destroy(); chart.value = null; });
</script>

<style scoped>
.tel-week__head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.seg { display: inline-flex; border: 1px solid var(--tel-line); border-radius: 5px; overflow: hidden; }
.seg button { font-size: 10.5px; padding: 1px 7px; color: var(--tel-text-2); }
.seg button[aria-pressed='true'] { background: var(--tel-hover); color: var(--tel-text); }
.hint { font-size: 10.5px; color: var(--tel-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.plot { position: relative; height: 120px; }
</style>
