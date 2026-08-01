<template>
    <div class="ot-chart" ref="host">
        <div v-if="!hasData" class="ot-state compact">
            <span class="glyph" aria-hidden="true">○</span>
            <strong>{{ emptyTitle }}</strong>
            <p v-if="emptyText">{{ emptyText }}</p>
        </div>

        <template v-else>
            <div class="head">
                <div class="ot-legend" v-if="series.length > 1">
                    <span v-for="s in series" :key="s.name" class="item">
                        <span class="swatch" :style="{ background: s.colour }"></span>{{ s.name }}
                    </span>
                </div>
                <div class="spacer"></div>
                <!-- A chart always has a text equivalent; it is not an optional extra. -->
                <button class="ot-btn ghost sm" :aria-pressed="showTable" @click="showTable = !showTable">
                    {{ showTable ? 'Show chart' : 'Show data' }}
                </button>
            </div>

            <svg v-show="!showTable" :width="width" :height="height" tabindex="0" role="img"
                 :aria-label="summary" @mousemove="onMove" @mouseleave="focusIndex = null"
                 @keydown.left.prevent="step(-1)" @keydown.right.prevent="step(1)"
                 @focus="focusIndex = focusIndex ?? lastIndex" @blur="focusIndex = null">
                <!-- gridlines and axis sit behind and quieter than the data -->
                <g>
                    <line v-for="t in yTicks" :key="`g${t.value}`" class="grid"
                          :x1="margin.left" :x2="width - margin.right" :y1="t.y" :y2="t.y" />
                    <text v-for="t in yTicks" :key="`yt${t.value}`" class="tick"
                          :x="margin.left - 6" :y="t.y + 3" text-anchor="end">{{ t.label }}</text>
                </g>
                <g>
                    <text v-for="t in xTicks" :key="`xt${t.x}`" class="tick"
                          :x="t.x" :y="height - 6" text-anchor="middle">{{ t.label }}</text>
                </g>

                <!-- a threshold is annotated because it explains the data, not to decorate it -->
                <g v-if="threshold !== undefined && thresholdY !== null">
                    <line class="baseline" :x1="margin.left" :x2="width - margin.right"
                          :y1="thresholdY" :y2="thresholdY" stroke="var(--ot-warning)" />
                    <text class="label" :x="width - margin.right" :y="thresholdY - 5" text-anchor="end"
                          fill="var(--ot-warning)">{{ thresholdLabel }}</text>
                </g>

                <g v-for="(s, i) in projected" :key="s.name">
                    <polyline v-if="s.area" class="series" :points="s.area" :fill="s.fill" stroke="none" />
                    <polyline class="series" :points="s.line" :stroke="s.colour"
                              :stroke-dasharray="s.dashed ? '4 4' : undefined" />
                    <!-- the latest value is direct-labelled; every other point is on hover -->
                    <circle v-if="s.last" :cx="s.last[0]" :cy="s.last[1]" r="3.5" :fill="s.colour" class="marker" />
                    <text v-if="s.last && series.length <= 2" class="label" :x="s.last[0] + 7"
                          :y="s.last[1] + 4 - (i * 13)" :fill="s.colour">{{ formatY(s.lastValue) }}</text>
                </g>

                <g v-if="focusPoint">
                    <line class="crosshair" :x1="focusPoint.x" :x2="focusPoint.x"
                          :y1="margin.top" :y2="height - margin.bottom" />
                    <circle v-for="p in focusMarkers" :key="p.name" :cx="p.x" :cy="p.y" r="4"
                            :fill="p.colour" class="marker" />
                </g>
            </svg>

            <div v-if="focusPoint && !showTable" class="ot-tooltip" :style="tooltipStyle">
                <div class="t">{{ focusPoint.label }}</div>
                <div v-for="p in focusMarkers" :key="p.name" class="r">
                    <span><span class="swatch" :style="{ background: p.colour }"></span> {{ p.name }}</span>
                    <span class="v">{{ formatY(p.value) }}</span>
                </div>
            </div>

            <p v-if="!zeroBased && !showTable" class="axisnote">
                Vertical axis starts at {{ formatY(bounds.min) }}, not zero.
            </p>

            <div v-if="showTable" class="ot-tablewrap" style="max-height:300px">
                <table class="ot-table">
                    <thead>
                        <tr>
                            <th>{{ xLabel }}</th>
                            <th v-for="s in series" :key="s.name" class="num">{{ s.name }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(row, i) in tableRows" :key="i">
                            <td>{{ row.label }}</td>
                            <td v-for="(cell, j) in row.values" :key="j" class="num">{{ cell }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

export interface ChartPoint { x: number; y: number }
export interface ChartSeries {
    name: string;
    colour: string;
    points: ChartPoint[];
    /** A dashed line reads as "this is the comparison", not as a second measurement. */
    dashed?: boolean;
    fill?: string;
}

const props = withDefaults(defineProps<{
    series: ChartSeries[];
    height?: number;
    /** Truncating a value axis is legitimate; hiding that you did is not. */
    zeroBased?: boolean;
    format?: (value: number) => string;
    xLabel?: string;
    threshold?: number;
    thresholdLabel?: string;
    emptyTitle?: string;
    emptyText?: string;
}>(), {
    height: 300,
    zeroBased: false,
    xLabel: 'Time',
    thresholdLabel: 'limit',
    emptyTitle: 'No history yet',
});

const margin = { top: 14, right: 64, bottom: 26, left: 62 };

const host = ref<HTMLElement | null>(null);
const width = ref(760);
const showTable = ref(false);
const focusIndex = ref<number | null>(null);

let observer: ResizeObserver | null = null;
onMounted(() => {
    if (!host.value) return;
    // Rendering at real pixel width keeps text upright and hit-testing honest; a
    // stretched viewBox would distort both.
    observer = new ResizeObserver(entries => {
        width.value = Math.max(280, Math.floor(entries[0].contentRect.width));
    });
    observer.observe(host.value);
    width.value = Math.max(280, Math.floor(host.value.clientWidth));
});
onBeforeUnmount(() => observer?.disconnect());

const hasData = computed(() => props.series.some(s => s.points.length > 1));
const primary = computed(() => props.series.find(s => s.points.length > 1) ?? props.series[0]);
const lastIndex = computed(() => Math.max(0, (primary.value?.points.length ?? 1) - 1));

function formatY(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return props.format ? props.format(value) : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const bounds = computed(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const s of props.series) for (const p of s.points) { xs.push(p.x); ys.push(p.y); }
    if (props.threshold !== undefined) ys.push(props.threshold);
    if (!ys.length) return { min: 0, max: 1, xMin: 0, xMax: 1 };

    let min = Math.min(...ys);
    let max = Math.max(...ys);
    if (props.zeroBased) min = Math.min(0, min);
    if (max === min) { max = min + 1; }
    const pad = (max - min) * 0.08;
    return { min: min - pad, max: max + pad, xMin: Math.min(...xs), xMax: Math.max(...xs) };
});

const plotWidth = computed(() => width.value - margin.left - margin.right);
const plotHeight = computed(() => props.height - margin.top - margin.bottom);

function xAt(x: number): number {
    const { xMin, xMax } = bounds.value;
    const span = Math.max(1, xMax - xMin);
    return margin.left + ((x - xMin) / span) * plotWidth.value;
}
function yAt(y: number): number {
    const { min, max } = bounds.value;
    return margin.top + plotHeight.value - ((y - min) / Math.max(1e-9, max - min)) * plotHeight.value;
}

const projected = computed(() => props.series.map(s => {
    const pts = s.points.map(p => [xAt(p.x), yAt(p.y)] as [number, number]);
    const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    return {
        name: s.name,
        colour: s.colour,
        dashed: s.dashed,
        fill: s.fill,
        line,
        area: s.fill && pts.length
            ? `${pts[0][0].toFixed(1)},${(margin.top + plotHeight.value).toFixed(1)} ${line} ${pts[pts.length - 1][0].toFixed(1)},${(margin.top + plotHeight.value).toFixed(1)}`
            : '',
        last: pts.length ? pts[pts.length - 1] : null,
        lastValue: s.points.length ? s.points[s.points.length - 1].y : 0,
    };
}));

const yTicks = computed(() => {
    const { min, max } = bounds.value;
    const count = props.height < 200 ? 3 : 4;
    return Array.from({ length: count + 1 }, (_, i) => {
        const value = min + ((max - min) / count) * i;
        return { value, y: yAt(value), label: formatY(value) };
    });
});

const xTicks = computed(() => {
    const { xMin, xMax } = bounds.value;
    const count = width.value < 520 ? 3 : 5;
    const spanDays = (xMax - xMin) / 86400000;
    return Array.from({ length: count + 1 }, (_, i) => {
        const value = xMin + ((xMax - xMin) / count) * i;
        const d = new Date(value);
        return {
            x: xAt(value),
            label: spanDays > 3
                ? d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
                : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
        };
    });
});

const thresholdY = computed(() => (props.threshold === undefined ? null : yAt(props.threshold)));

function onMove(event: MouseEvent) {
    const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const points = primary.value?.points ?? [];
    if (points.length < 2) return;
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < points.length; i++) {
        const distance = Math.abs(xAt(points[i].x) - x);
        if (distance < best) { best = distance; nearest = i; }
    }
    focusIndex.value = nearest;
}

function step(delta: number) {
    const count = primary.value?.points.length ?? 0;
    if (!count) return;
    focusIndex.value = Math.max(0, Math.min(count - 1, (focusIndex.value ?? count - 1) + delta));
}

const focusPoint = computed(() => {
    const points = primary.value?.points ?? [];
    const index = focusIndex.value;
    if (index === null || !points[index]) return null;
    const d = new Date(points[index].x);
    return { x: xAt(points[index].x), label: d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) };
});

const focusMarkers = computed(() => {
    const index = focusIndex.value;
    if (index === null) return [];
    return props.series
        .filter(s => s.points[index])
        .map(s => ({
            name: s.name, colour: s.colour,
            value: s.points[index].y,
            x: xAt(s.points[index].x), y: yAt(s.points[index].y),
        }));
});

// Keep the tooltip inside the plot rather than letting it run off the card.
const tooltipStyle = computed(() => {
    if (!focusPoint.value) return {};
    const flip = focusPoint.value.x > width.value - 180;
    return {
        left: `${flip ? focusPoint.value.x - 150 : focusPoint.value.x + 12}px`,
        top: `${margin.top + 8}px`,
    };
});

const tableRows = computed(() => {
    const points = primary.value?.points ?? [];
    return points.map((p, i) => ({
        label: new Date(p.x).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
        values: props.series.map(s => (s.points[i] ? formatY(s.points[i].y) : '—')),
    }));
});

const summary = computed(() => {
    const s = primary.value;
    if (!s || s.points.length < 2) return 'No data';
    const first = s.points[0].y;
    const last = s.points[s.points.length - 1].y;
    const direction = last > first ? 'up' : last < first ? 'down' : 'flat';
    return `${s.name}: ${formatY(first)} to ${formatY(last)}, ${direction} over ${s.points.length} points. Use arrow keys to read individual values.`;
});
</script>

<style scoped>
.head { display: flex; align-items: center; gap: var(--ot-space-3); margin-bottom: var(--ot-space-2); }
.head .spacer { flex: 1 1 auto; }
.axisnote { margin: var(--ot-space-1) 0 0; font-size: 11px; color: var(--ot-muted); }
svg:focus-visible { outline: var(--ot-focus) solid var(--ot-accent); outline-offset: 2px; }
.swatch { display: inline-block; width: 8px; height: 8px; border-radius: 2px; }
</style>
