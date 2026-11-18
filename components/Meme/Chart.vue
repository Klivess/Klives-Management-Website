<template>
  <div ref="root" class="msx-chart" data-testid="msx-chart" @mouseleave="onLeave">
    <svg v-if="width > 0" :viewBox="`0 0 ${width} ${height}`" :height="height" role="img" :aria-label="summary"
         @mousemove="onMove" @mousedown="onDown" @mouseup="onUp">
      <g>
        <line v-for="t in ticks" :key="t.v" class="msx-chart__grid" :x1="PAD_L" :x2="width - PAD_R" :y1="t.y" :y2="t.y" />
        <text v-for="t in ticks" :key="`l${t.v}`" class="msx-chart__axis" :x="PAD_L - 6" :y="t.y + 3.5" text-anchor="end">{{ msCompact(t.v) }}</text>
      </g>
      <rect v-if="hover !== null" class="msx-chart__hover" :x="xOf(hover)" :y="PAD_T" :width="step" :height="plotH" />
      <rect v-if="brush" class="msx-chart__brush" :x="Math.min(brush.a, brush.b) * step + PAD_L" :y="PAD_T" :width="(Math.abs(brush.b - brush.a) + 1) * step" :height="plotH" />
      <g v-for="(bar, i) in rects" :key="buckets[i].key">
        <rect v-for="(seg, j) in bar" :key="j" :x="seg.x" :y="seg.y" :width="seg.w" :height="seg.h" :fill="seg.fill"
              :opacity="buckets[i].incomplete ? 0.55 : 1" rx="1.5" />
      </g>
      <path v-if="showPrevious && prevPath" class="msx-chart__prev" :d="prevPath" />
      <g>
        <text v-for="l in labels" :key="l.i" class="msx-chart__axis" :x="xOf(l.i) + step / 2" :y="height - 4" text-anchor="middle">{{ l.text }}</text>
      </g>
    </svg>

    <div v-if="tip" class="msx-chart__tip" :style="{ left: `${tip.left}px`, top: `${tip.top}px` }">
      <h4>{{ tip.title }}</h4>
      <ul>
        <li v-for="row in tip.rows" :key="row.label"><i :style="{ background: row.colour }"></i>{{ row.label }}<b>{{ msInt(row.value) }}</b></li>
      </ul>
      <span v-for="line in tip.extra" :key="line" class="msx-dim">{{ line }}</span>
    </div>

    <div v-if="keys.length > 1" class="msx-legend" role="group" aria-label="Sources in the chart">
      <button v-for="(k, i) in keys" :key="k" class="msx-legend__item" type="button" :aria-pressed="selected.includes(k.toLowerCase())"
              :disabled="k === 'Other'" :title="k === 'Other' ? 'Every other source' : `Show only @${k}`" @click="k !== 'Other' && $emit('legend', k)">
        <i :style="{ background: colours[i] }"></i>{{ k === 'Other' ? 'Other' : `@${k}` }}<b>{{ msInt(totals[i]) }}</b>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { msCompact, msDay, msDayRange, msInt } from '~/scripts/memeConsole';

export interface MsChartBucket {
  key: string; from: string; to: string; incomplete: boolean; stack: number[]; previous: number | null; extra: string[];
}

const props = withDefaults(defineProps<{
  buckets: MsChartBucket[]; keys: string[]; colours: string[]; height?: number; showPrevious?: boolean; selected?: string[]; granularity?: string;
}>(), { height: 230, showPrevious: true, selected: () => [], granularity: 'day' });
const emit = defineEmits<{ zoom: [from: string, to: string]; legend: [key: string] }>();

const PAD_L = 34;
const PAD_R = 6;
const PAD_T = 8;
const PAD_B = 20;

const root = ref<HTMLElement | null>(null);
const width = ref(0);
let observer: ResizeObserver | null = null;
onMounted(() => {
  if (!root.value) return;
  width.value = root.value.clientWidth;
  observer = new ResizeObserver(() => { width.value = root.value?.clientWidth ?? 0; });
  observer.observe(root.value);
});
onBeforeUnmount(() => observer?.disconnect());

const plotH = computed(() => props.height - PAD_T - PAD_B);
const n = computed(() => Math.max(1, props.buckets.length));
const step = computed(() => Math.max(1, (width.value - PAD_L - PAD_R) / n.value));
const xOf = (i: number) => PAD_L + i * step.value;

const max = computed(() => {
  let m = 1;
  for (const b of props.buckets) {
    m = Math.max(m, b.stack.reduce((a, v) => a + v, 0));
    if (props.showPrevious && b.previous !== null) m = Math.max(m, b.previous);
  }
  return niceMax(m);
});

function niceMax(v: number) {
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const f of [1, 2, 2.5, 5, 10]) if (f * pow >= v) return f * pow;
  return 10 * pow;
}

const yOf = (v: number) => PAD_T + plotH.value - (v / max.value) * plotH.value;
const ticks = computed(() => [0, 0.5, 1].map(f => ({ v: Math.round(max.value * f), y: yOf(max.value * f) })));

const rects = computed(() => {
  const w = Math.max(1, Math.min(28, step.value * 0.72));
  return props.buckets.map((b, i) => {
    let acc = 0;
    const x = xOf(i) + (step.value - w) / 2;
    return b.stack.map((v, j) => {
      const y0 = yOf(acc);
      acc += v;
      const y1 = yOf(acc);
      return { x, y: y1, w, h: Math.max(0, y0 - y1 - (v > 0 ? 0.6 : 0)), fill: props.colours[j] ?? '#888' };
    }).filter(s => s.h > 0);
  });
});

const prevPath = computed(() => {
  const pts = props.buckets.map((b, i) => (b.previous === null ? null : [xOf(i) + step.value / 2, yOf(b.previous)] as const));
  let d = '';
  let pen = false;
  for (const p of pts) {
    if (!p) { pen = false; continue; }
    d += `${pen ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    pen = true;
  }
  return d;
});

const labels = computed(() => {
  const count = props.buckets.length;
  if (!count) return [];
  const every = Math.max(1, Math.ceil(count / Math.max(2, Math.floor((width.value - PAD_L) / 64))));
  const out: { i: number; text: string }[] = [];
  for (let i = 0; i < count; i += every) {
    const b = props.buckets[i];
    out.push({ i, text: props.granularity === 'month' ? new Date(`${b.from}T12:00:00`).toLocaleDateString('en-GB', { month: 'short' }) : msDay(b.from) });
  }
  return out;
});

const totals = computed(() => props.keys.map((_, j) => props.buckets.reduce((a, b) => a + (b.stack[j] ?? 0), 0)));
const summary = computed(() => `Reels downloaded per ${props.granularity}: ${msInt(totals.value.reduce((a, v) => a + v, 0))} in ${props.buckets.length} buckets`);

// ── hover + drag to zoom ──
const hover = ref<number | null>(null);
const brush = ref<{ a: number; b: number } | null>(null);
let dragging = false;

function indexAt(event: MouseEvent): number | null {
  const svg = event.currentTarget as SVGSVGElement;
  const box = svg.getBoundingClientRect();
  const x = ((event.clientX - box.left) / box.width) * width.value;
  const i = Math.floor((x - PAD_L) / step.value);
  return i >= 0 && i < props.buckets.length ? i : null;
}

function onMove(event: MouseEvent) {
  const i = indexAt(event);
  hover.value = i;
  if (dragging && brush.value && i !== null) brush.value = { ...brush.value, b: i };
}
function onDown(event: MouseEvent) {
  const i = indexAt(event);
  if (i === null || props.buckets.length < 3) return;
  dragging = true;
  brush.value = { a: i, b: i };
}
function onUp() {
  if (dragging && brush.value && brush.value.a !== brush.value.b) {
    const lo = Math.min(brush.value.a, brush.value.b);
    const hi = Math.max(brush.value.a, brush.value.b);
    emit('zoom', props.buckets[lo].from, props.buckets[hi].to);
  }
  dragging = false;
  brush.value = null;
}
function onLeave() {
  hover.value = null;
  dragging = false;
  brush.value = null;
}

const tip = computed(() => {
  const i = hover.value;
  if (i === null || dragging || !width.value) return null;
  const b = props.buckets[i];
  const rows = props.keys.map((k, j) => ({ label: k === 'Other' ? 'Other' : props.keys.length === 1 ? 'Reels' : `@${k}`, value: b.stack[j] ?? 0, colour: props.colours[j] }))
    .filter(r => r.value > 0).sort((a, z) => z.value - a.value).slice(0, 7);
  const total = b.stack.reduce((a, v) => a + v, 0);
  const extra = [...b.extra];
  if (props.keys.length > 1) extra.unshift(`${msInt(total)} reels in all`);
  if (b.previous !== null && props.showPrevious) extra.push(`${msInt(b.previous)} in the previous period`);
  if (b.incomplete) extra.push('Still in progress');
  const left = Math.min(Math.max(0, xOf(i) + step.value + 8), Math.max(0, width.value - 250));
  return { title: b.from === b.to ? msDay(b.from, true) : msDayRange(b.from, b.to), rows: rows.length ? rows : [{ label: 'No reels', value: 0, colour: 'transparent' }], extra, left: xOf(i) + step.value + 260 > width.value ? Math.max(0, xOf(i) - 250) : left, top: 6 };
});
</script>
