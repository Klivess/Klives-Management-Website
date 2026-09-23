<!--
  Ranked horizontal bars (chart.js). Hover for the detail line; click a bar (or use
  the keyboard list below the chart) to drill in.
-->
<template>
  <div class="tel-bars">
    <div class="plot" :style="{ height: `${Math.max(40, items.length * 19 + 8)}px` }">
      <canvas ref="canvas" role="img" :aria-label="aria"></canvas>
    </div>
    <p v-if="!items.length" class="empty">{{ emptyText }}</p>
    <!-- Keyboard / screen-reader path to the same drill-downs. -->
    <ul class="sr-only">
      <li v-for="(it, i) in items" :key="it.key"><button type="button" @click="$emit('select', i)">{{ it.label }}: {{ it.valueText }}</button></li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { Chart, ensureChartsRegistered, cssVar, theme, tooltipOptions, axisTicks } from '~/scripts/telChart';
import type { BarItem } from '~/scripts/apiTelemetryShared';

const props = withDefaults(defineProps<{ items: BarItem[]; color?: string; label: string; emptyText?: string; format?: (v: number) => string }>(),
  { color: '--tel-s1', emptyText: 'No data in this window' });
const emit = defineEmits<{ select: [index: number] }>();

const canvas = ref<HTMLCanvasElement | null>(null);
const chart = shallowRef<Chart | null>(null);
const aria = computed(() => `${props.label}: ` + props.items.map(i => `${i.label} ${i.valueText}`).join('; '));

function build() {
  const el = canvas.value;
  if (!el) return;
  ensureChartsRegistered();
  chart.value?.destroy();
  if (!props.items.length) return;
  const t = theme(el);
  const color = cssVar(el, props.color);
  const items = props.items;
  chart.value = new Chart(el, {
    type: 'bar',
    data: {
      labels: items.map(i => i.label),
      datasets: [{ label: props.label, data: items.map(i => i.value), backgroundColor: color, hoverBackgroundColor: cssVar(el, '--tel-s1-hover'),
        borderRadius: 2, barPercentage: 0.7, categoryPercentage: 1, minBarLength: 2 }],
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
            title: tt => tt.length ? items[tt[0].dataIndex].label : '',
            label: tt => [items[tt.dataIndex].valueText, ...(items[tt.dataIndex].detail ? [items[tt.dataIndex].detail!] : []), 'Click to open'],
          },
        },
      },
      scales: {
        x: { beginAtZero: true, grid: { color: t.grid }, border: { display: false },
          ticks: { ...axisTicks(el), maxTicksLimit: 4, callback: (v: any) => props.format ? props.format(Number(v)) : String(v) } },
        y: { grid: { display: false }, border: { color: t.axis },
          ticks: { ...axisTicks(el), autoSkip: false, color: t.text, font: { size: 10, family: 'JetBrains Mono, ui-monospace, Consolas, monospace' },
            callback: (_v: any, i: number) => { const s = items[i]?.label ?? ''; return s.length > 44 ? `${s.slice(0, 43)}…` : s; } },
          afterFit: (s: any) => { s.width = Math.min(300, Math.max(120, s.width)); } },
      },
      onHover: (_e, els, c) => { c.canvas.style.cursor = els.length ? 'pointer' : 'default'; },
      onClick: (_e, els) => { if (els.length) emit('select', els[0].index); },
    },
  });
}

watch(() => props.items, build, { deep: true });
onMounted(build);
onBeforeUnmount(() => { chart.value?.destroy(); chart.value = null; });
</script>

<style scoped>
.plot { position: relative; }
.empty { color: var(--tel-muted); font-size: 11px; padding: 4px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
