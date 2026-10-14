<template>
    <div ref="el" class="otcv" :style="{ height: `${height}px` }" @mouseleave="hover = null">
        <svg :viewBox="`0 0 ${W} ${height}`" @mousemove="onMove">
            <g class="grid">
                <line v-for="t in yTicks" :key="`y${t}`" :x1="PAD_L" :x2="W - PAD_R" :y1="y(t)" :y2="y(t)" />
            </g>
            <g class="ticks">
                <text v-for="t in yTicks" :key="`yt${t}`" :x="PAD_L - 4" :y="y(t) + 3" text-anchor="end">{{ t.toFixed(decimals) }}</text>
                <text v-for="(p, i) in xTicks" :key="`xt${i}`" :x="x(p.x)" :y="height - 4" text-anchor="middle">{{ p.label }}</text>
            </g>
            <g v-for="(s, si) in series" :key="s.name">
                <polyline :points="s.points.map(p => `${x(p.x)},${y(p.y)}`).join(' ')" fill="none" :stroke="s.color ?? colourAt(si)"
                          :stroke-width="si === 0 ? 1.8 : 1.2" :stroke-dasharray="s.dashed ? '4 3' : undefined" vector-effect="non-scaling-stroke" />
                <circle v-for="p in s.points" :key="p.x" :cx="x(p.x)" :cy="y(p.y)" r="2" :fill="s.color ?? colourAt(si)" />
            </g>
            <line v-if="hover !== null" class="cross" :x1="x(hover)" :x2="x(hover)" :y1="PAD_T" :y2="height - PAD_B" />
        </svg>
        <div class="lg mono">
            <span v-for="(s, si) in series" :key="s.name" :style="{ color: s.color ?? colourAt(si) }">
                {{ s.name }}<template v-if="hover !== null"> {{ valueAt(s, hover) }}</template>
            </span>
            <span v-if="hover !== null" class="muted">{{ xTicks.find(t => t.x === hover)?.label }}</span>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { colourAt } from '~/composables/useTerminal';

export interface CurveSeries { name: string; color?: string; dashed?: boolean; points: { x: number; y: number; label?: string }[] }
const props = withDefaults(defineProps<{ series: CurveSeries[]; height?: number; decimals?: number; logX?: boolean; suffix?: string }>(), { height: 180, decimals: 2, logX: true, suffix: '%' });

const PAD_L = 34, PAD_R = 8, PAD_T = 18, PAD_B = 16;
const hover = ref<number | null>(null);
const el = ref<HTMLElement | null>(null);
const width = ref(600);
const W = computed(() => width.value);
let ro: ResizeObserver | null = null;
onMounted(() => {
    if (!el.value) return;
    width.value = el.value.clientWidth || 600;
    ro = new ResizeObserver(e => { width.value = Math.max(120, Math.floor(e[0].contentRect.width)); });
    ro.observe(el.value);
});
onBeforeUnmount(() => ro?.disconnect());

const xs = computed(() => [...new Set(props.series.flatMap(s => s.points.map(p => p.x)))].sort((a, b) => a - b));
const ys = computed(() => props.series.flatMap(s => s.points.map(p => p.y)).filter(Number.isFinite));
const xT = (v: number) => (props.logX ? Math.log(v + 0.05) : v);
const xMin = computed(() => xT(xs.value[0] ?? 0));
const xMax = computed(() => xT(xs.value[xs.value.length - 1] ?? 1));
const yMin = computed(() => { const m = Math.min(...ys.value); const M = Math.max(...ys.value); return m - (M - m) * 0.1 - 0.01; });
const yMax = computed(() => { const m = Math.min(...ys.value); const M = Math.max(...ys.value); return M + (M - m) * 0.1 + 0.01; });

function x(v: number) { const span = xMax.value - xMin.value || 1; return PAD_L + ((xT(v) - xMin.value) / span) * (W.value - PAD_L - PAD_R); }
function y(v: number) { const span = yMax.value - yMin.value || 1; return props.height - PAD_B - ((v - yMin.value) / span) * (props.height - PAD_T - PAD_B); }

const yTicks = computed(() => {
    if (!ys.value.length) return [];
    const n = 4, step = (yMax.value - yMin.value) / n;
    return Array.from({ length: n + 1 }, (_, i) => yMin.value + step * i);
});
const xTicks = computed(() => {
    const labels = new Map<number, string>();
    for (const s of props.series) for (const p of s.points) if (p.label && !labels.has(p.x)) labels.set(p.x, p.label);
    return xs.value.map(v => ({ x: v, label: labels.get(v) ?? String(v) }));
});

function onMove(e: MouseEvent) {
    const svg = e.currentTarget as SVGSVGElement;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W.value;
    let best: number | null = null, bd = Infinity;
    for (const v of xs.value) { const d = Math.abs(x(v) - px); if (d < bd) { bd = d; best = v; } }
    hover.value = best;
}

function valueAt(s: CurveSeries, xv: number) {
    const p = s.points.find(q => q.x === xv);
    return p ? `${p.y.toFixed(props.decimals)}${props.suffix}` : '—';
}
</script>

<style scoped>
.otcv { position: relative; width: 100%; }
svg { width: 100%; height: 100%; display: block; }
.grid line { stroke: rgba(255, 255, 255, 0.05); }
.ticks text { fill: var(--ot-axis); font-size: 9.5px; font-family: var(--ot-mono); }
.cross { stroke: rgba(226, 230, 235, 0.3); stroke-dasharray: 2 3; }
.lg { position: absolute; top: 0; left: 36px; display: flex; gap: 10px; font-size: 10.5px; flex-wrap: wrap; }
</style>
