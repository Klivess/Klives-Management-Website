<template>
  <div class="timeline">
    <div class="tl-toolbar">
      <div class="tl-left">
        <span class="tl-label">Timeline</span>
        <span class="tl-range">{{ rangeLabel }}</span>
      </div>
      <div class="tl-controls">
        <button class="tl-btn" title="Zoom out" @click="zoomBy(1.6)">−</button>
        <button class="tl-btn" title="Zoom in" @click="zoomBy(1 / 1.6)">+</button>
        <span class="tl-sep"></span>
        <button v-for="z in zooms" :key="z.label" class="tl-btn" :class="{ active: nearSpan(z.ms) && following }" @click="setWindow(z.ms)">{{ z.label }}</button>
        <span class="tl-sep"></span>
        <button class="tl-btn" title="Fit all events" @click="fitAll">Fit</button>
        <button class="tl-btn" :class="{ live: following }" title="Follow live" @click="goLive">
          <span class="tl-livedot" :class="{ on: following }"></span>Live
        </button>
      </div>
    </div>

    <div
      ref="wrap"
      class="tl-canvas-wrap"
      :class="{ grabbing: panning }"
      @wheel.prevent="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointerleave="onPointerLeave"
    >
      <svg :width="width" :height="height" class="tl-svg">
        <!-- lane backgrounds + names -->
        <g v-for="(lane, i) in lanes" :key="lane">
          <rect :x="0" :y="laneY(i)" :width="width" :height="laneH - 4" class="lane-bg" :class="{ 'lane-commander': lane === 'commander' }" />
          <text :x="8" :y="laneY(i) + 15" class="lane-name">{{ laneLabel(lane) }}</text>
        </g>

        <!-- proportional time gridlines -->
        <g v-for="t in ticks" :key="'t' + t.x">
          <line :x1="t.x" :y1="0" :x2="t.x" :y2="laneArea" class="grid" />
          <text :x="t.x + 3" :y="height - 5" class="tick-label">{{ t.label }}</text>
        </g>

        <!-- cumulative-spend area under the lanes -->
        <text :x="8" :y="laneArea + 15" class="lane-name">Cumulative tool-calls</text>
        <polyline v-if="spendPath" :points="spendPath" class="spend-line" />

        <!-- event markers (clickable) -->
        <g v-for="ev in placedEvents" :key="ev.eventID">
          <circle
            :cx="ev.x" :cy="ev.y" :r="markerR(ev)"
            :fill="colorFor(ev.type)" class="marker"
            @click.stop="onMarkerClick(ev)"
          >
            <title>{{ fmtTs(ev.ts) }} · {{ ev.type }} — {{ trunc(ev.text) }}</title>
          </circle>
        </g>

        <!-- hover crosshair + time readout -->
        <g v-if="hoverX !== null">
          <line :x1="hoverX" :y1="0" :x2="hoverX" :y2="laneArea" class="hair" />
          <rect :x="hairLabelX" :y="laneArea + 2" :width="hairLabelW" height="15" rx="3" class="hair-bg" />
          <text :x="hairLabelX + 5" :y="laneArea + 13" class="hair-label">{{ hoverLabel }}</text>
        </g>

        <!-- live now-edge with a pulsing head (only when now is in view) -->
        <template v-if="nowX !== null">
          <line :x1="nowX" :y1="0" :x2="nowX" :y2="laneArea" class="now-edge" />
          <circle :cx="nowX" :cy="6" r="4" class="now-pulse" />
        </template>
      </svg>
    </div>

    <div class="tl-legend">
      <span v-for="t in legendTypes" :key="t" class="lg" :class="{ dim: hidden.has(t) }" @click="toggle(t)">
        <i :style="{ background: colorFor(t) }"></i>{{ t }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { eventColor } from '~/components/Projects/eventColors';

const props = defineProps<{ events: any[]; agentLabels?: Record<string, string> }>();
const emit = defineEmits<{ (e: 'select', ev: any): void }>();

const MIN_SPAN = 60_000;                       // 1 minute
const MAX_SPAN = 30 * 24 * 3600_000;           // 30 days

const zooms = [
  { label: '15m', ms: 15 * 60_000 },
  { label: '1h', ms: 60 * 60_000 },
  { label: '6h', ms: 6 * 60 * 60_000 },
  { label: '1d', ms: 24 * 60 * 60_000 },
  { label: '1w', ms: 7 * 24 * 60 * 60_000 },
];

// ── viewport: an explicit [start, end] time window, decoupled from "now" so you can
// pan into history. `following` re-pins the right edge to now each tick. ──
const span = ref(60 * 60_000);
const viewEnd = ref(Date.now());
const following = ref(true);
const now = ref(Date.now());
const viewStart = computed(() => viewEnd.value - span.value);

const wrap = ref<HTMLElement | null>(null);
const width = ref(800);
const laneH = 36;
let tick: ReturnType<typeof setInterval> | null = null;

// Legend doubles as a filter — click a type to hide it.
const hidden = ref(new Set<string>());
function toggle(t: string) { const s = new Set(hidden.value); s.has(t) ? s.delete(t) : s.add(t); hidden.value = s; }
function colorFor(t: string) { return eventColor(t); }

const legendTypes = computed(() => {
  const set = new Set<string>();
  for (const e of props.events) set.add(e.type);
  return Array.from(set).sort();
});

const lanes = computed(() => {
  const set = new Set<string>(['commander']);
  for (const e of props.events) if (e.agentID && e.agentID !== 'commander') set.add(e.agentID);
  return Array.from(set);
});
function laneLabel(lane: string) {
  if (lane === 'commander') return 'Commander';
  return props.agentLabels?.[lane] ?? lane.slice(0, 10);
}
const laneArea = computed(() => lanes.value.length * laneH);
const height = computed(() => laneArea.value + laneH + 22);
function laneY(i: number) { return i * laneH; }

function tsMs(e: any): number { return new Date(e.timestamp).getTime(); }
const eventTimes = computed(() => props.events.map(tsMs).filter(t => !isNaN(t)).sort((a, b) => a - b));
const firstTs = computed(() => eventTimes.value[0] ?? now.value);

function xFor(ts: number) { return ((ts - viewStart.value) / span.value) * width.value; }
function tsForX(px: number) { return viewStart.value + (px / width.value) * span.value; }

const placedEvents = computed(() => {
  const laneIndex = new Map(lanes.value.map((l, i) => [l, i]));
  const lo = viewStart.value, hi = viewEnd.value;
  const out: any[] = [];
  for (const e of props.events) {
    if (hidden.value.has(e.type)) continue;
    const ts = tsMs(e);
    if (isNaN(ts) || ts < lo || ts > hi) continue;
    const lane = e.agentID && laneIndex.has(e.agentID) ? e.agentID : 'commander';
    out.push({ ...e, ts, x: xFor(ts), y: laneY(laneIndex.get(lane) ?? 0) + (laneH - 4) / 2 });
  }
  return out;
});

function markerR(ev: any) {
  return ['approval-requested', 'watchdog-escalation', 'agent-spawned', 'budget-warning', 'budget-paused', 'wake-failed'].includes(ev.type) ? 6 : 4;
}

const nowX = computed(() => {
  if (now.value < viewStart.value || now.value > viewEnd.value) return null;
  return xFor(now.value);
});

const spendPath = computed(() => {
  const calls = props.events
    .filter(e => e.type === 'tool-call')
    .map(tsMs)
    .filter(ts => !isNaN(ts) && ts >= viewStart.value && ts <= viewEnd.value)
    .sort((a, b) => a - b);
  if (!calls.length) return '';
  const trackTop = laneArea.value + 20;
  const trackH = laneH - 6;
  const total = calls.length;
  return calls.map((ts, i) => `${xFor(ts).toFixed(1)},${(trackTop + trackH - (i + 1) / total * trackH).toFixed(1)}`).join(' ');
});

// ── nice, adaptive gridlines ──
const TICK_STEPS = [
  1_000, 5_000, 15_000, 30_000,
  60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000,
  3600_000, 3 * 3600_000, 6 * 3600_000, 12 * 3600_000,
  24 * 3600_000, 2 * 24 * 3600_000, 7 * 24 * 3600_000, 14 * 24 * 3600_000, 30 * 24 * 3600_000,
];
function niceStep(spanMs: number) {
  const ideal = spanMs / 6;
  return TICK_STEPS.find(s => s >= ideal) ?? TICK_STEPS[TICK_STEPS.length - 1];
}
const ticks = computed(() => {
  const step = niceStep(span.value);
  const out: { x: number; label: string }[] = [];
  const start = Math.ceil(viewStart.value / step) * step;
  const sub60 = step < 60_000, subDay = step < 24 * 3600_000;
  for (let t = start; t <= viewEnd.value; t += step) {
    const d = new Date(t);
    const label = sub60
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : subDay
        ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    out.push({ x: xFor(t), label });
  }
  return out;
});

const rangeLabel = computed(() => {
  const s = new Date(viewStart.value), e = new Date(viewEnd.value);
  const sameDay = s.toDateString() === e.toDateString();
  const d = (x: Date) => x.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const t = (x: Date) => x.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return sameDay ? `${d(s)} ${t(s)} – ${t(e)}` : `${d(s)} ${t(s)} – ${d(e)} ${t(e)}`;
});

// ── zoom / pan / follow ──
function clampView() {
  span.value = Math.max(MIN_SPAN, Math.min(MAX_SPAN, span.value));
  const maxEnd = now.value + span.value * 0.05;             // a sliver of future padding
  const minEnd = firstTs.value + span.value * 0.15;          // keep at least the earliest events reachable
  viewEnd.value = Math.max(minEnd, Math.min(maxEnd, viewEnd.value));
}

function nearSpan(ms: number) { return Math.abs(span.value - ms) / ms < 0.02; }

function setWindow(ms: number) { span.value = ms; following.value = true; viewEnd.value = now.value; clampView(); }
function goLive() { following.value = true; viewEnd.value = now.value; clampView(); }
function fitAll() {
  if (eventTimes.value.length) {
    const pad = Math.max((now.value - firstTs.value) * 0.04, 30_000);
    span.value = Math.max(MIN_SPAN, (now.value - firstTs.value) + pad * 2);
    viewEnd.value = now.value + pad;
  } else {
    span.value = 60 * 60_000; viewEnd.value = now.value;
  }
  following.value = false;
  clampView();
}

function zoomAround(factor: number, pivotTs: number) {
  const frac = (pivotTs - viewStart.value) / span.value;
  span.value = Math.max(MIN_SPAN, Math.min(MAX_SPAN, span.value * factor));
  viewEnd.value = pivotTs + (1 - frac) * span.value;
  // Re-pin to live if we zoomed right up against now.
  following.value = now.value - viewEnd.value < span.value * 0.05;
  if (following.value) viewEnd.value = now.value;
  clampView();
}
function zoomBy(factor: number) { zoomAround(factor, following.value ? now.value : (viewStart.value + span.value / 2)); }

function onWheel(e: WheelEvent) {
  const rect = wrap.value?.getBoundingClientRect();
  if (!rect) return;
  const px = e.clientX - rect.left;
  zoomAround(e.deltaY > 0 ? 1.15 : 1 / 1.15, tsForX(px));
}

// panning
const panning = ref(false);
let panStartX = 0, panStartEnd = 0, panMoved = false;
function onPointerDown(e: PointerEvent) {
  if ((e.target as Element)?.classList?.contains('marker')) return; // let the marker handle its click
  panning.value = true; panMoved = false;
  panStartX = e.clientX; panStartEnd = viewEnd.value;
  following.value = false;
  (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
}
function onPointerMove(e: PointerEvent) {
  const rect = wrap.value?.getBoundingClientRect();
  if (rect) { hoverX.value = e.clientX - rect.left; }
  if (!panning.value) return;
  const dx = e.clientX - panStartX;
  if (Math.abs(dx) > 2) panMoved = true;
  const dms = (dx / width.value) * span.value;
  viewEnd.value = panStartEnd - dms;
  clampView();
}
function onPointerUp(e: PointerEvent) {
  panning.value = false;
  (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
}
function onPointerLeave() { panning.value = false; hoverX.value = null; }

// hover crosshair
const hoverX = ref<number | null>(null);
const hoverLabel = computed(() => hoverX.value === null ? '' : fmtTs(tsForX(hoverX.value)));
const hairLabelW = computed(() => Math.max(46, hoverLabel.value.length * 6.2));
const hairLabelX = computed(() => {
  if (hoverX.value === null) return 0;
  return Math.max(0, Math.min(width.value - hairLabelW.value, hoverX.value + 4));
});

function onMarkerClick(ev: any) { if (!panMoved) emit('select', ev); }

function fmtTs(ts: number) {
  const d = new Date(ts);
  return span.value < 24 * 3600_000
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function trunc(s: string) { return s && s.length > 120 ? s.slice(0, 120) + '…' : (s || ''); }
function measure() { if (wrap.value) width.value = wrap.value.clientWidth; }

onMounted(() => {
  measure();
  window.addEventListener('resize', measure);
  tick = setInterval(() => {
    now.value = Date.now();
    if (following.value) viewEnd.value = now.value;
  }, 1000);
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', measure);
  if (tick) clearInterval(tick);
});
</script>

<style scoped>
.timeline { background: #161519; border-radius: 8px; padding: 12px; }
.tl-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 12px; flex-wrap: wrap; }
.tl-left { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.tl-label { font-weight: 600; color: #ccc; }
.tl-range { font-size: 11px; color: #777; font-variant-numeric: tabular-nums; white-space: nowrap; }
.tl-controls { display: flex; align-items: center; gap: 4px; }
.tl-btn { background: #26262b; color: #ccc; border: none; padding: 4px 9px; border-radius: 5px; cursor: pointer; font-size: 12px; display: inline-flex; align-items: center; gap: 5px; }
.tl-btn:hover { background: #33333a; }
.tl-btn.active { background: #4d9e39; color: #fff; }
.tl-btn.live { background: #2a1f1f; color: #d98c8c; }
.tl-btn.live:hover { background: #3a2626; }
.tl-sep { width: 1px; height: 16px; background: #303036; margin: 0 3px; }
.tl-livedot { width: 6px; height: 6px; border-radius: 50%; background: #555; }
.tl-livedot.on { background: #d95b5b; animation: blink 1.6s ease-in-out infinite; }
.tl-canvas-wrap { width: 100%; overflow: hidden; cursor: crosshair; touch-action: none; }
.tl-canvas-wrap.grabbing { cursor: grabbing; }
.tl-svg { display: block; user-select: none; }
.lane-bg { fill: #1c1c20; }
.lane-commander { fill: #1a231a; }
.lane-name { fill: #7a7a7a; font-size: 10px; }
.grid { stroke: #26262b; stroke-width: 1; }
.tick-label { fill: #666; font-size: 9px; }
.marker { stroke: #111; stroke-width: 1; cursor: pointer; transition: r 0.1s; }
.marker:hover { stroke: #fff; stroke-width: 1.5; }
.spend-line { fill: none; stroke: #4d9e39; stroke-width: 1.5; opacity: 0.75; }
.hair { stroke: #5a6b7a; stroke-width: 1; stroke-dasharray: 2 3; pointer-events: none; }
.hair-bg { fill: #0d1b28; opacity: 0.92; }
.hair-label { fill: #9fc4e0; font-size: 9px; font-variant-numeric: tabular-nums; pointer-events: none; }
.now-edge { stroke: #d95b5b; stroke-width: 1; stroke-dasharray: 3 3; }
.now-pulse { fill: #d95b5b; animation: pulse 1.6s ease-out infinite; }
@keyframes pulse { 0% { opacity: 1; r: 4; } 70% { opacity: 0.15; r: 9; } 100% { opacity: 0; r: 9; } }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
.tl-legend { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 10px; font-size: 11px; color: #999; }
.lg { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; user-select: none; }
.lg.dim { opacity: 0.35; }
.lg i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
</style>
