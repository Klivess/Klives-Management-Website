<!--
  Part-to-whole: a chart.js 100% stacked bar (hover a segment for share and count)
  plus a labelled list, so every value is readable without colour or hovering.
-->
<template>
  <div class="tel-mix">
    <div class="plot"><canvas ref="canvas" role="img" :aria-label="aria"></canvas></div>
    <ul>
      <li v-for="it in shown" :key="it.label">
        <i :style="{ background: `var(${it.color})` }" aria-hidden="true"></i>
        <span class="l">{{ it.label }}</span>
        <b>{{ pct(it.value) }}</b>
        <span class="c">{{ fmtCount(it.value) }}</span>
      </li>
      <li v-if="!shown.length" class="empty">No requests</li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { fmtCount } from '~/scripts/apiTelemetryShared';
import { Chart, ensureChartsRegistered, cssVar, tooltipOptions } from '~/scripts/telChart';

const props = defineProps<{ items: { label: string; value: number; color: string }[]; label: string }>();
const canvas = ref<HTMLCanvasElement | null>(null);
const chart = shallowRef<Chart | null>(null);
const shown = computed(() => props.items.filter(i => i.value > 0));
const total = computed(() => shown.value.reduce((s, i) => s + i.value, 0));
const pct = (v: number) => total.value ? `${((v / total.value) * 100).toFixed(v / total.value < 0.01 ? 2 : 1)}%` : '—';
const aria = computed(() => `${props.label}: ` + shown.value.map(i => `${i.label} ${pct(i.value)}`).join(', '));

function build() {
  const el = canvas.value;
  if (!el) return;
  ensureChartsRegistered();
  chart.value?.destroy();
  const surface = cssVar(el, '--tel-surface');
  chart.value = new Chart(el, {
    type: 'bar',
    data: {
      labels: [props.label],
      datasets: shown.value.map(it => ({
        label: it.label,
        data: [total.value ? (it.value / total.value) * 100 : 0],
        backgroundColor: cssVar(el, it.color),
        borderColor: surface,
        borderWidth: { left: 1, right: 1, top: 0, bottom: 0 } as any, // 2px surface gap between segments
        borderSkipped: false,
        barPercentage: 1,
        categoryPercentage: 1,
      })),
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipOptions(el),
          callbacks: {
            title: () => '',
            label: item => `${pct(shown.value[item.datasetIndex].value)} · ${fmtCount(shown.value[item.datasetIndex].value)}  ${item.dataset.label}`,
          },
        },
      },
      scales: {
        x: { stacked: true, display: false, max: 100 },
        y: { stacked: true, display: false },
      },
    },
  });
}

watch(() => props.items, build, { deep: true });
onMounted(build);
onBeforeUnmount(() => { chart.value?.destroy(); chart.value = null; });
</script>

<style scoped>
.plot { position: relative; height: 14px; border-radius: 3px; overflow: hidden; background: var(--tel-track); }
ul { margin-top: 6px !important; display: grid; gap: 1px; }
li { display: grid; grid-template-columns: 9px 1fr auto 52px; align-items: center; gap: 6px; font-size: 11px; }
li > i { width: 9px; height: 9px; border-radius: 2px; }
.l { color: var(--tel-text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
b { color: var(--tel-text); font-weight: 600; }
.c { color: var(--tel-muted); text-align: right; }
.empty { color: var(--tel-muted); display: block; }
</style>
