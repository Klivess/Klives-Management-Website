<template>
  <div class="timeline">
    <div class="tl-toolbar">
      <span class="tl-label">Timeline</span>
      <div class="tl-zoom">
        <button v-for="z in zooms" :key="z.label" :class="{ active: z.ms === windowMs }" @click="windowMs = z.ms">{{ z.label }}</button>
      </div>
    </div>

    <div ref="wrap" class="tl-canvas-wrap">
      <svg :width="width" :height="height" class="tl-svg">
        <!-- lane backgrounds + names -->
        <g v-for="(lane, i) in lanes" :key="lane">
          <rect :x="0" :y="laneY(i)" :width="width" :height="laneH - 4" class="lane-bg" :class="{ 'lane-commander': lane === 'commander' }" />
          <text :x="8" :y="laneY(i) + 15" class="lane-name">{{ laneLabel(lane) }}</text>
        </g>

        <!-- proportional time gridlines -->
        <g v-for="tick in ticks" :key="'t' + tick.x">
          <line :x1="tick.x" :y1="0" :x2="tick.x" :y2="laneArea" class="grid" />
          <text :x="tick.x + 3" :y="height - 5" class="tick-label">{{ tick.label }}</text>
        </g>

        <!-- cumulative-spend area under the lanes -->
        <text :x="8" :y="laneArea + 15" class="lane-name">Cumulative tool-calls</text>
        <polyline v-if="spendPath" :points="spendPath" class="spend-line" />

        <!-- event markers (clickable) -->
        <g v-for="ev in placedEvents" :key="ev.eventID">
          <circle
            :cx="ev.x" :cy="ev.y" :r="markerR(ev)"
            :fill="colorFor(ev.type)" class="marker"
            @click="$emit('select', ev)"
          >
            <title>{{ ev.type }} — {{ trunc(ev.text) }}</title>
          </circle>
        </g>

        <!-- live now-edge with a pulsing head -->
        <line :x1="width - 1" :y1="0" :x2="width - 1" :y2="laneArea" class="now-edge" />
        <circle :cx="width - 1" :cy="6" r="4" class="now-pulse" />
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
defineEmits<{ (e: 'select', ev: any): void }>();

const zooms = [
  { label: '15m', ms: 15 * 60_000 },
  { label: '1h', ms: 60 * 60_000 },
  { label: '6h', ms: 6 * 60 * 60_000 },
  { label: '1d', ms: 24 * 60 * 60_000 },
  { label: '1w', ms: 7 * 24 * 60 * 60_000 },
];
const windowMs = ref(60 * 60_000);

const wrap = ref<HTMLElement | null>(null);
const width = ref(800);
const laneH = 36;
const now = ref(Date.now());
let tick: ReturnType<typeof setInterval> | null = null;

// Legend doubles as a filter — click a type to hide it.
const hidden = ref(new Set<string>());
function toggle(t: string) { const s = new Set(hidden.value); s.has(t) ? s.delete(t) : s.add(t); hidden.value = s; }
function colorFor(t: string) { return eventColor(t); }

// Only the event types actually present, so the legend stays relevant.
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

const windowStart = computed(() => now.value - windowMs.value);
function xFor(ts: number) {
  const frac = (ts - windowStart.value) / windowMs.value;
  return Math.max(0, Math.min(1, frac)) * width.value;
}

const placedEvents = computed(() => {
  const laneIndex = new Map(lanes.value.map((l, i) => [l, i]));
  return props.events
    .filter(e => !hidden.value.has(e.type))
    .map(e => {
      const ts = new Date(e.timestamp).getTime();
      if (isNaN(ts) || ts < windowStart.value) return null;
      const lane = e.agentID && laneIndex.has(e.agentID) ? e.agentID : 'commander';
      return { ...e, x: xFor(ts), y: laneY(laneIndex.get(lane) ?? 0) + (laneH - 4) / 2 };
    })
    .filter(Boolean) as any[];
});

// Bigger markers for milestone events; small dots for routine tool traffic.
function markerR(ev: any) {
  return ['approval-requested', 'watchdog-escalation', 'agent-spawned', 'budget-warning', 'budget-paused', 'wake-failed'].includes(ev.type) ? 6 : 4;
}

const spendPath = computed(() => {
  const inWindow = props.events
    .filter(e => e.type === 'tool-call')
    .map(e => new Date(e.timestamp).getTime())
    .filter(ts => !isNaN(ts) && ts >= windowStart.value)
    .sort((a, b) => a - b);
  if (!inWindow.length) return '';
  const trackTop = laneArea.value + 20;
  const trackH = laneH - 6;
  const total = inWindow.length;
  return inWindow.map((ts, i) => `${xFor(ts).toFixed(1)},${(trackTop + trackH - (i + 1) / total * trackH).toFixed(1)}`).join(' ');
});

const ticks = computed(() => {
  const out: { x: number; label: string }[] = [];
  const steps = 6;
  const long = windowMs.value >= 24 * 60 * 60_000;
  for (let i = 0; i <= steps; i++) {
    const ts = windowStart.value + (windowMs.value * i) / steps;
    const d = new Date(ts);
    out.push({ x: (i / steps) * width.value, label: long ? d.toLocaleDateString([], { month: 'short', day: 'numeric' }) : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
  }
  return out;
});

function trunc(s: string) { return s && s.length > 120 ? s.slice(0, 120) + '…' : (s || ''); }
function measure() { if (wrap.value) width.value = wrap.value.clientWidth; }

onMounted(() => {
  measure();
  window.addEventListener('resize', measure);
  tick = setInterval(() => { now.value = Date.now(); }, 1000);
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', measure);
  if (tick) clearInterval(tick);
});
</script>

<style scoped>
.timeline { background: #161519; border-radius: 8px; padding: 12px; }
.tl-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.tl-label { font-weight: 600; color: #ccc; }
.tl-zoom button { background: #26262b; color: #ccc; border: none; padding: 4px 10px; border-radius: 5px; margin-left: 4px; cursor: pointer; font-size: 12px; }
.tl-zoom button.active { background: #4d9e39; color: #fff; }
.tl-canvas-wrap { width: 100%; overflow-x: auto; }
.tl-svg { display: block; }
.lane-bg { fill: #1c1c20; }
.lane-commander { fill: #1a231a; }
.lane-name { fill: #7a7a7a; font-size: 10px; }
.grid { stroke: #26262b; stroke-width: 1; }
.tick-label { fill: #666; font-size: 9px; }
.marker { stroke: #111; stroke-width: 1; cursor: pointer; transition: r 0.1s; }
.marker:hover { stroke: #fff; stroke-width: 1.5; }
.spend-line { fill: none; stroke: #4d9e39; stroke-width: 1.5; opacity: 0.75; }
.now-edge { stroke: #d95b5b; stroke-width: 1; stroke-dasharray: 3 3; }
.now-pulse { fill: #d95b5b; animation: pulse 1.6s ease-out infinite; }
@keyframes pulse { 0% { opacity: 1; r: 4; } 70% { opacity: 0.15; r: 9; } 100% { opacity: 0; r: 9; } }
.tl-legend { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 10px; font-size: 11px; color: #999; }
.lg { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; user-select: none; }
.lg.dim { opacity: 0.35; }
.lg i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
</style>
