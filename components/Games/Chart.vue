<template>
  <div class="kgx-chart" @mouseleave="hover = null">
    <div v-for="row in rows" :key="row.label" class="kgx-chart__row" :data-tone="row.tone">
      <div class="kgx-chart__label">
        <span>{{ row.label }}</span>
        <b class="kgx-num">{{ hover != null ? row.format(row.values[hover]) : row.format(kgLast(row.values)) }}</b>
      </div>
      <svg class="kgx-chart__plot" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" @mousemove="onMove">
        <line v-if="row.limit" class="kgx-chart__limit" x1="0" :x2="W" :y1="yOf(row.limit, row)" :y2="yOf(row.limit, row)" vector-effect="non-scaling-stroke" />
        <path class="kgx-chart__area" :d="areaOf(row)" />
        <path class="kgx-chart__line" :d="kgSparkPath(row.values, W, H, row.top)" vector-effect="non-scaling-stroke" />
        <line v-if="hover != null" class="kgx-chart__cursor" :x1="xOf(hover)" :x2="xOf(hover)" y1="0" :y2="H" vector-effect="non-scaling-stroke" />
      </svg>
    </div>
    <div class="kgx-chart__axis">
      <span>{{ startLabel }}</span>
      <span v-if="hover != null" class="kgx-chart__at">{{ atLabel }}</span>
      <span>now</span>
    </div>
    <p v-if="empty" class="kgx-chart__empty">{{ emptyText }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { isNum, kgLast, kgSparkPath, type KgChartRow as ChartRow } from '~/scripts/kliveGames';

/** Rows of one window that share an x-axis and a hover line. */
const props = defineProps<{ rows: ChartRow[]; t0: number; stepSeconds: number; emptyText?: string }>();

const W = 600;
const H = 46;
const hover = ref<number | null>(null);
const count = computed(() => props.rows[0]?.values.length ?? 0);

const rows = computed(() => props.rows.map(r => {
  const peak = Math.max(1, ...r.values.filter(isNum), r.limit ?? 0);
  return { ...r, top: r.max ?? peak * 1.1 };
}));

const empty = computed(() => props.rows.every(r => !r.values.some(isNum)));

function xOf(i: number) { return count.value > 1 ? (i * W) / (count.value - 1) : 0; }
function yOf(v: number, row: { top: number }) { return H - Math.min(1, v / row.top) * H; }

function areaOf(row: { values: (number | null)[]; top: number }): string {
  let d = '';
  let run: string[] = [];
  const flush = (endIndex: number) => {
    if (run.length > 1) {
      const startX = xOf(endIndex - run.length + 1);
      const endX = xOf(endIndex);
      d += `M${startX.toFixed(1)} ${H} L${run.join(' L')} L${endX.toFixed(1)} ${H} Z `;
    }
    run = [];
  };
  row.values.forEach((v, i) => {
    if (isNum(v)) run.push(`${xOf(i).toFixed(1)} ${yOf(v, row).toFixed(1)}`);
    else flush(i - 1);
  });
  flush(row.values.length - 1);
  return d;
}

function onMove(e: MouseEvent) {
  const el = e.currentTarget as SVGElement;
  const rect = el.getBoundingClientRect();
  if (!rect.width || count.value < 2) return;
  const i = Math.round(((e.clientX - rect.left) / rect.width) * (count.value - 1));
  hover.value = Math.max(0, Math.min(count.value - 1, i));
}

const span = computed(() => count.value * props.stepSeconds);
const startLabel = computed(() => (span.value >= 86_000 ? '24 h ago' : span.value >= 3500 ? '1 h ago' : `${Math.round(span.value / 60)} min ago`));
const atLabel = computed(() => {
  if (hover.value == null) return '';
  const at = new Date(props.t0 + hover.value * props.stepSeconds * 1000);
  return at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
});
</script>
