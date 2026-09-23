<!--
  Time-series chart for the telemetry page (chart.js).

  Interactions: chart.js tooltip listing every series at the hovered bucket (value
  first), hover points, a crosshair shared by every chart on the page (telHoverT),
  drag across the plot to zoom the whole page to that window, click a bucket to open
  the traces kept around it, arrow keys to step the crosshair, legend buttons to
  toggle series, and a table view of the exact numbers.
-->
<template>
  <div class="tel-chart" :class="{ dim }">
    <div v-if="series.length > 1 || $slots.aside" class="tel-chart__top">
      <div v-if="series.length > 1" class="tel-chart__legend" role="group" :aria-label="`${label} series`">
        <button v-for="s in series" :key="s.key" type="button" :aria-pressed="!hidden.has(s.key)" @click="toggle(s.key)">
          <i :class="['key', s.kind === 'bar' || stacked ? 'rect' : 'line', { dash: s.dash }]" :style="{ '--c': `var(${s.color})` }" aria-hidden="true"></i>{{ s.label }}
        </button>
      </div>
      <slot name="aside" />
    </div>
    <div v-show="!tableView" class="tel-chart__plot" :style="{ height: `${height}px` }">
      <canvas ref="canvas" role="img" tabindex="0" :aria-label="ariaSummary"
              @pointerdown="onDown" @pointermove="onDragMove" @pointerup="onUp" @pointercancel="cancelDrag" @pointerleave="onLeave"
              @keydown.left.prevent="moveCrosshair(-1)" @keydown.right.prevent="moveCrosshair(1)" @keydown.escape="onLeave" @blur="onLeave"></canvas>
      <span v-if="empty" class="tel-chart__empty">No data in this window</span>
    </div>
    <div v-if="tableView" class="tel-chart__table" :style="{ maxHeight: `${height + 40}px` }">
      <table>
        <thead><tr><th>Time</th><th v-for="s in series" :key="s.key">{{ s.label }}</th></tr></thead>
        <tbody>
          <tr v-for="(_, i) in n" :key="i">
            <td>{{ fmtTime(t0 + i * step, step) }}</td>
            <td v-for="s in series" :key="s.key">{{ fmtUnit(s.values[i], unit) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <button type="button" class="tel-chart__tablebtn" :aria-pressed="tableView" @click="tableView = !tableView">{{ tableView ? 'Chart' : 'Table' }}</button>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { telHoverT, fmtTime, fmtUnit, type TelUnit, type TelSeries } from '~/scripts/apiTelemetryShared';
import { Chart, ensureChartsRegistered, cssVar, theme, tooltipOptions, axisTicks, crosshairPlugin, selectionPlugin } from '~/scripts/telChart';

const props = withDefaults(defineProps<{
  t0: number;
  step: number;
  series: TelSeries[];
  unit?: TelUnit;
  label?: string;
  stacked?: boolean;
  height?: number;
  log?: boolean;
  dim?: boolean;
  /** Fixed y max (e.g. 100 for percentages, 1 for Apdex). */
  yMax?: number;
}>(), { unit: 'count', label: 'Chart', height: 110 });

const emit = defineEmits<{ zoom: [from: number, to: number]; pick: [t: number] }>();

const canvas = ref<HTMLCanvasElement | null>(null);
const chart = shallowRef<Chart | null>(null);
const hidden = ref(new Set<string>(props.series.filter(s => s.hidden).map(s => s.key)));
const tableView = ref(false);
let drag: { a: number; b: number; moved: boolean } | null = null;
let hovering = false;
let raf = 0;

const n = computed(() => props.series.reduce((m, s) => Math.max(m, s.values.length), 0));
const empty = computed(() => !props.series.some(s => s.values.some(v => v != null && v !== 0)));

function toggle(key: string) {
  const next = new Set(hidden.value);
  if (next.has(key)) next.delete(key); else next.add(key);
  if (next.size >= props.series.length) return; // never hide everything
  hidden.value = next;
  const c = chart.value;
  if (!c) return;
  props.series.forEach((s, i) => c.setDatasetVisibility(i, !next.has(s.key)));
  c.update('none');
}

function withAlpha(color: string, alpha: number) {
  if (color.startsWith('#') && (color.length === 7 || color.length === 4)) {
    const hex = color.length === 4 ? color.slice(1).split('').map(c => c + c).join('') : color.slice(1);
    const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
    return `#${hex}${a}`;
  }
  return color;
}

function datasets(el: Element) {
  return props.series.map((s, i) => {
    const color = cssVar(el, s.color);
    const kind = s.kind ?? (props.stacked ? 'area' : 'line');
    const base = {
      label: s.label,
      // Always a plain copy: chart.js instruments its data arrays, and handing it Vue's
      // reactive prop arrays turns every chart update into a reactivity loop.
      data: s.values.map(v => (props.log ? (v != null && v > 0 ? v : null) : v)),
      hidden: hidden.value.has(s.key),
      borderColor: color,
      backgroundColor: color,
    };
    if (kind === 'bar') {
      return { ...base, type: 'bar' as const, borderWidth: 0, borderRadius: 2, borderSkipped: 'start' as const,
        categoryPercentage: 1, barPercentage: n.value > 60 ? 1 : 0.86, hoverBackgroundColor: withAlpha(color, 0.8), stack: props.stacked ? 's' : `s${i}` };
    }
    return {
      ...base,
      type: 'line' as const,
      borderWidth: props.stacked ? 1.5 : 2,
      borderDash: s.dash ? [4, 3] : [],
      pointRadius: 0,
      pointHitRadius: 6,
      pointHoverRadius: 4,
      pointHoverBorderWidth: 2,
      pointHoverBorderColor: theme(el).surface,
      pointHoverBackgroundColor: color,
      tension: 0,
      spanGaps: false,
      fill: kind === 'area' ? (props.stacked ? (i === 0 ? 'origin' : '-1') : 'origin') : false,
      backgroundColor: kind === 'area' ? withAlpha(color, props.stacked ? 0.55 : 0.16) : color,
      stack: props.stacked ? 's' : undefined,
    };
  });
}

function build() {
  const el = canvas.value;
  if (!el) return;
  ensureChartsRegistered();
  chart.value?.destroy();
  const t = theme(el);
  const labels = Array.from({ length: n.value }, (_, i) => i);
  const unit = props.unit;
  chart.value = new Chart(el, {
    type: 'line',
    data: { labels, datasets: datasets(el) as any },
    plugins: [crosshairPlugin, selectionPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      normalized: true,
      // Page-wide time mapping used by the crosshair plugin.
      telTime: { t0: props.t0, step: props.step },
      layout: { padding: { top: 4, right: 4 } },
      interaction: { mode: 'index', intersect: false, axis: 'x' },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipOptions(el),
          filter: (item: any) => item.raw != null,
          callbacks: {
            title: (items: any[]) => items.length ? fmtTime(props.t0 + (items[0].dataIndex) * props.step, props.step) : '',
            label: (item: any) => `${fmtUnit(item.raw as number, unit)}  ${item.dataset.label}`,
            labelColor: (item: any) => ({ borderColor: item.dataset.borderColor as string, backgroundColor: item.dataset.borderColor as string, borderWidth: 0 }),
          },
        },
      },
      scales: {
        x: {
          type: 'category',
          offset: props.series.some(s => s.kind === 'bar'),
          grid: { display: false },
          border: { color: t.axis },
          ticks: { ...axisTicks(el), maxTicksLimit: 4, callback: (v: any) => fmtTime(props.t0 + Number(v) * props.step, props.step) },
        },
        y: {
          type: props.log ? 'logarithmic' : 'linear',
          stacked: !!props.stacked,
          beginAtZero: !props.log,
          max: props.yMax,
          grid: { color: t.grid },
          border: { display: false },
          ticks: { ...axisTicks(el), maxTicksLimit: 4, callback: (v: any) => fmtUnit(Number(v), unit) },
          afterFit: (scale: any) => { scale.width = 46; },
        },
      },
      onHover: (event: any, _elements: any, c: any) => {
        if (drag || event.x == null) return;
        const i = c.scales.x.getValueForPixel(event.x);
        if (i == null || i < 0 || i >= n.value) return;
        hovering = true;
        const next = props.t0 + Math.round(i) * props.step;
        if (telHoverT.value !== next) telHoverT.value = next;
      },
    } as any,
  });
}

/** Cheap in-place data refresh; full rebuild only when the chart's shape changes. */
function refresh() {
  const c = chart.value;
  const el = canvas.value;
  if (!c || !el) { build(); return; }
  if (c.data.datasets.length !== props.series.length) { build(); return; }
  c.data.labels = Array.from({ length: n.value }, (_, i) => i);
  const next = datasets(el);
  next.forEach((d, i) => Object.assign(c.data.datasets[i], d));
  (c.options as any).telTime = { t0: props.t0, step: props.step };
  c.update('none');
}

// Other charts' hovers only move this chart's crosshair (a draw, not an update).
watch(telHoverT, () => {
  if (hovering || !chart.value) return;
  if (!raf) raf = requestAnimationFrame(() => { raf = 0; chart.value?.draw(); });
});

function indexAt(clientX: number): number {
  const c = chart.value!;
  const x = clientX - canvas.value!.getBoundingClientRect().left;
  const v = c.scales.x.getValueForPixel(x) ?? 0;
  return Math.max(0, Math.min(n.value - 1, Math.round(v)));
}
function onDown(e: PointerEvent) {
  if (e.button !== 0 || !chart.value) return;
  const x = e.clientX - canvas.value!.getBoundingClientRect().left;
  drag = { a: x, b: x, moved: false };
  canvas.value!.setPointerCapture(e.pointerId);
}
function onDragMove(e: PointerEvent) {
  if (!drag || !chart.value) return;
  drag.b = e.clientX - canvas.value!.getBoundingClientRect().left;
  if (Math.abs(drag.b - drag.a) > 6) drag.moved = true;
  (chart.value as any).$telDrag = drag.moved ? drag : undefined;
  chart.value.draw();
}
function onUp(e: PointerEvent) {
  const d = drag;
  drag = null;
  const c = chart.value;
  if (!d || !c) return;
  (c as any).$telDrag = undefined;
  c.draw();
  if (d.moved) {
    const rect = canvas.value!.getBoundingClientRect();
    const a = indexAt(Math.min(d.a, d.b) + rect.left);
    const b = indexAt(Math.max(d.a, d.b) + rect.left);
    if (b > a) emit('zoom', props.t0 + a * props.step, props.t0 + (b + 1) * props.step);
  } else {
    emit('pick', props.t0 + indexAt(e.clientX) * props.step);
  }
}
function cancelDrag() {
  drag = null;
  if (chart.value) { (chart.value as any).$telDrag = undefined; chart.value.draw(); }
}
function onLeave() {
  hovering = false;
  if (!drag) telHoverT.value = null;
  chart.value?.tooltip?.setActiveElements([], { x: 0, y: 0 });
  chart.value?.draw();
}
function moveCrosshair(d: number) {
  const c = chart.value;
  if (!c || n.value === 0) return;
  const cur = telHoverT.value == null ? (d > 0 ? -1 : n.value) : Math.round((telHoverT.value - props.t0) / props.step);
  const i = Math.max(0, Math.min(n.value - 1, cur + d));
  hovering = true;
  telHoverT.value = props.t0 + i * props.step;
  const active = c.data.datasets.map((_, di) => ({ datasetIndex: di, index: i })).filter(a => c.isDatasetVisible(a.datasetIndex));
  c.tooltip?.setActiveElements(active, { x: c.scales.x.getPixelForValue(i), y: c.chartArea.top });
  c.setActiveElements(active);
  c.update('none');
}

const ariaSummary = computed(() => {
  const parts = props.series.map(s => {
    const vals = s.values.filter((v): v is number => v != null);
    if (!vals.length) return `${s.label}: no data`;
    return `${s.label}: latest ${fmtUnit(vals[vals.length - 1], props.unit)}, peak ${fmtUnit(Math.max(...vals), props.unit)}`;
  });
  return `${props.label}. ${parts.join('; ')}. Arrow keys step through buckets; drag to zoom; click to open traces.`;
});

watch(() => [props.series, props.t0, props.step], refresh);
watch(() => [props.stacked, props.log, props.yMax, props.unit, props.series.length], () => build());
watch(tableView, v => { if (!v) nextTick(build); });

onMounted(build);
onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf);
  chart.value?.destroy();
  chart.value = null;
});
</script>

<style scoped>
.tel-chart { position: relative; transition: opacity 120ms; }
.tel-chart.dim { opacity: .55; }
.tel-chart__top { display: flex; align-items: flex-start; gap: 6px; margin-bottom: 4px; min-height: 16px; padding-right: 40px; }
.tel-chart__legend { display: flex; flex-wrap: wrap; gap: 2px 10px; flex: 1; }
.tel-chart__legend button { font-size: 11px; color: var(--tel-text-2); gap: 5px; align-items: center; padding: 1px 0; }
.tel-chart__legend button[aria-pressed='false'] { color: var(--tel-muted); text-decoration: line-through; }
.tel-chart__legend button[aria-pressed='false'] .key { opacity: .3; }
.key.line { display: inline-block; width: 12px; height: 2px; border-radius: 1px; background: var(--c); }
.key.line.dash { background: repeating-linear-gradient(90deg, var(--c) 0 4px, transparent 4px 7px); }
.key.rect { display: inline-block; width: 9px; height: 9px; border-radius: 2px; background: var(--c); }
.tel-chart__plot { position: relative; }
.tel-chart__plot canvas { display: block; touch-action: pan-y; cursor: crosshair; }
.tel-chart__plot canvas:focus-visible { outline: 2px solid var(--tel-focus); outline-offset: 2px; border-radius: 3px; }
.tel-chart__empty { position: absolute; inset: 0; display: grid; place-items: center; color: var(--tel-muted); font-size: 11px; pointer-events: none; }
.tel-chart__tablebtn { position: absolute; top: -1px; right: 0; font-size: 10px; color: var(--tel-muted); padding: 1px 4px; border-radius: 3px; }
.tel-chart__tablebtn:hover, .tel-chart__tablebtn[aria-pressed='true'] { color: var(--tel-text); background: var(--tel-hover); }
.tel-chart__table { overflow: auto; font-size: 11px; }
.tel-chart__table table { width: 100%; border-collapse: collapse; }
.tel-chart__table th, .tel-chart__table td { padding: 2px 6px; text-align: right; border-bottom: 1px solid var(--tel-grid); white-space: nowrap; }
.tel-chart__table th:first-child, .tel-chart__table td:first-child { text-align: left; color: var(--tel-muted); }
.tel-chart__table th { position: sticky; top: 0; background: var(--tel-surface); color: var(--tel-text-2); font-weight: 600; }
</style>
