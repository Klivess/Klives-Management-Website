<template>
    <div class="ot-chart ms-bars" :class="{ fill }" :style="fill ? { minHeight: `${height + (headHeight || 40) + 10}px` } : undefined" ref="host">
        <div v-if="!hasData" class="ot-state compact">
            <span class="glyph" aria-hidden="true">○</span>
            <strong>{{ emptyTitle }}</strong>
            <p v-if="emptyText">{{ emptyText }}</p>
        </div>

        <template v-else>
            <div class="head" ref="headEl">
                <div class="ot-legend">
                    <template v-for="(key, i) in keys" :key="key">
                        <button v-if="legendClickable && key !== 'Other'" type="button" class="item ms-legendbtn" :title="`Show only ${legendPrefix}${key}`" @click="$emit('legend', key)">
                            <span class="swatch sq" :style="{ background: colours[i] }"></span>{{ legendPrefix }}{{ key }}
                        </button>
                        <span v-else class="item"><span class="swatch sq" :style="{ background: colours[i] }"></span>{{ key === 'Other' ? 'Other sources' : legendPrefix + key }}</span>
                    </template>
                    <span v-if="previousOn" class="item"><span class="swatch dash"></span>{{ previousLabel }}</span>
                    <span v-if="lineOn" class="item"><span class="swatch" :style="{ background: lineColour }"></span>{{ lineLabel }}</span>
                </div>
                <div class="spacer"></div>
                <span v-if="brush && buckets.length > 1" class="hint ms-wide-only">Drag across bars to zoom{{ granularity !== 'day' ? ' · click a bar to open it' : '' }}</span>
                <button class="ot-btn ghost sm" :aria-pressed="showTable" @click="showTable = !showTable">{{ showTable ? 'Show chart' : 'Show data' }}</button>
            </div>

            <svg v-show="!showTable" :width="width" :height="chartHeight" tabindex="0" role="img" :aria-label="summary"
                 :class="{ dragging: dragStart !== null }"
                 @mousemove="onMove" @mouseleave="onLeave" @mousedown="onDown" @mouseup="onUp"
                 @keydown.left.prevent="step(-1)" @keydown.right.prevent="step(1)" @keydown.enter.prevent="openFocused"
                 @focus="focusIndex = focusIndex ?? buckets.length - 1" @blur="focusIndex = null">
                <g>
                    <line v-for="t in yTicks" :key="`g${t}`" class="grid" :x1="margin.left" :x2="width - margin.right" :y1="yAt(t)" :y2="yAt(t)" />
                    <text v-for="t in yTicks" :key="`yt${t}`" class="tick" :x="margin.left - 6" :y="yAt(t) + 3" text-anchor="end">{{ fmtTick(t) }}</text>
                    <template v-if="lineOn">
                        <text v-for="t in lineTicks" :key="`lt${t}`" class="tick" :x="width - margin.right + 6" :y="lineY(t) + 3" text-anchor="start">{{ lineFormat(t) }}</text>
                    </template>
                    <text v-for="t in xTicks" :key="`xt${t.index}`" class="tick" :x="t.x" :y="chartHeight - 6" :text-anchor="t.anchor">{{ t.label }}</text>
                </g>

                <rect v-if="brushRect" class="brush" :x="brushRect.x" :y="margin.top" :width="brushRect.w" :height="plotHeight" />
                <rect v-else-if="focusIndex !== null" class="band" :x="margin.left + focusIndex * slot" :y="margin.top" :width="slot" :height="plotHeight" />

                <g>
                    <template v-for="bar in bars" :key="bar.key">
                        <rect v-for="(seg, j) in bar.segments" :key="j" :x="bar.x" :y="seg.y" :width="barWidth" :height="seg.h"
                              :fill="seg.fill" :fill-opacity="bar.incomplete ? 0.5 : 1" rx="1" />
                        <rect v-if="bar.incomplete && bar.top !== null" class="partial" :x="bar.x" :y="bar.top" :width="barWidth" :height="bar.bottom - bar.top" rx="1" />
                    </template>
                </g>

                <polyline v-if="previousOn" class="series prev" :points="previousPoints" />
                <polyline v-if="lineOn" class="series" :points="linePoints" :stroke="lineColour" />
                <g v-if="focusIndex !== null && !brushRect">
                    <circle v-if="previousOn && buckets[focusIndex]?.previous != null" class="marker" :cx="center(focusIndex)" :cy="yAt(buckets[focusIndex].previous!)" r="3.5" fill="var(--ot-text-2)" />
                    <circle v-if="lineOn && buckets[focusIndex]?.line != null" class="marker" :cx="center(focusIndex)" :cy="lineY(buckets[focusIndex].line!)" r="3.5" :fill="lineColour" />
                </g>
            </svg>

            <div v-if="focusBucket && !showTable && !brushRect" class="ot-tooltip" :style="tooltipStyle">
                <div class="t">{{ periodLabel(focusBucket) }}<span v-if="focusBucket.incomplete" class="partialtag"> · partial</span></div>
                <template v-for="(key, i) in keys" :key="key">
                    <div v-if="focusBucket.stack[i]" class="r">
                        <span><span class="swatch" :style="{ background: colours[i] }"></span> {{ key === 'Other' ? 'Other sources' : legendPrefix + key }}</span>
                        <span class="v">{{ focusBucket.stack[i].toLocaleString() }}</span>
                    </div>
                </template>
                <div class="r total"><span>Total {{ unit }}</span><span class="v">{{ total(focusBucket).toLocaleString() }}</span></div>
                <div v-if="previousOn && focusBucket.previous != null" class="r"><span>{{ previousLabel }}</span><span class="v">{{ focusBucket.previous.toLocaleString() }}</span></div>
                <div v-if="lineOn && focusBucket.line != null" class="r"><span>{{ lineLabel }}</span><span class="v">{{ lineFormat(focusBucket.line) }}</span></div>
                <div v-for="(value, label) in focusBucket.extra ?? {}" :key="label" class="r"><span>{{ label }}</span><span class="v">{{ value }}</span></div>
            </div>
            <div v-if="brushRect && brushLabel" class="ot-tooltip" :style="{ left: `${brushRect.x}px`, top: `${margin.top + 4}px` }">
                <div class="t">Zoom to</div>
                <div class="r"><span>{{ brushLabel }}</span></div>
            </div>

            <div v-if="showTable" class="ot-tablewrap" style="max-height:320px">
                <table class="ot-table">
                    <thead>
                        <tr>
                            <th>Period</th>
                            <th v-for="key in keys" :key="key" class="num">{{ key === 'Other' ? 'Other' : legendPrefix + key }}</th>
                            <th class="num">Total</th>
                            <th v-if="previousOn" class="num">{{ previousLabel }}</th>
                            <th v-if="lineOn" class="num">{{ lineLabel }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="b in buckets" :key="b.key">
                            <td>{{ periodLabel(b) }}<span v-if="b.incomplete" class="muted"> (partial)</span></td>
                            <td v-for="(key, i) in keys" :key="key" class="num">{{ b.stack[i] ?? 0 }}</td>
                            <td class="num">{{ total(b) }}</td>
                            <td v-if="previousOn" class="num">{{ b.previous ?? '—' }}</td>
                            <td v-if="lineOn" class="num">{{ b.line != null ? lineFormat(b.line) : '—' }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { fmtDayKey, fmtDayRange, type Granularity } from '~/composables/useMemeScraper';
import { fmtCount } from '~/composables/useOmniTumblr';

export interface ChartBucket {
    key: string;
    from: string;
    to: string;
    incomplete: boolean;
    stack: number[];
    previous?: number | null;
    line?: number | null;
    /** Extra tooltip rows: label → formatted value. */
    extra?: Record<string, string>;
}

const props = withDefaults(defineProps<{
    buckets: ChartBucket[];
    keys: string[];
    colours: string[];
    granularity: Granularity;
    height?: number;
    unit?: string;
    legendPrefix?: string;
    legendClickable?: boolean;
    previousLabel?: string;
    showPrevious?: boolean;
    lineLabel?: string;
    showLine?: boolean;
    lineColour?: string;
    lineFormat?: (value: number) => string;
    brush?: boolean;
    /** Grow to the height the parent gives it (the card is stretched by its grid row); `height` is the minimum. */
    fill?: boolean;
    emptyTitle?: string;
    emptyText?: string;
}>(), {
    height: 260,
    unit: 'reels',
    legendPrefix: '',
    previousLabel: 'Previous period',
    lineLabel: 'Library size',
    lineColour: 'var(--ot-violet)',
    lineFormat: (v: number) => fmtCount(v),
    brush: true,
    emptyTitle: 'Nothing in this window',
});

const emit = defineEmits<{ zoom: [from: string, to: string]; legend: [key: string] }>();

const host = ref<HTMLElement | null>(null);
const headEl = ref<HTMLElement | null>(null);
const width = ref(760);
const hostHeight = ref(0);
const headHeight = ref(0);
const showTable = ref(false);
const focusIndex = ref<number | null>(null);
const dragStart = ref<number | null>(null);
const dragEnd = ref<number | null>(null);
const dragMoved = ref(false);

let observer: ResizeObserver | null = null;
onMounted(() => {
    if (!host.value) return;
    observer = new ResizeObserver(entries => {
        for (const entry of entries) {
            if (entry.target === host.value) {
                width.value = Math.max(280, Math.floor(entry.contentRect.width));
                hostHeight.value = Math.floor(entry.contentRect.height);
            } else if (entry.target === headEl.value) {
                headHeight.value = Math.ceil(entry.contentRect.height + 8); // + its bottom margin
            }
        }
    });
    observer.observe(host.value);
    width.value = Math.max(280, Math.floor(host.value.clientWidth));
    window.addEventListener('mouseup', cancelDrag);
});
onBeforeUnmount(() => {
    observer?.disconnect();
    window.removeEventListener('mouseup', cancelDrag);
});

const total = (b: ChartBucket) => b.stack.reduce((a, v) => a + (v || 0), 0);

// In fill mode the host is sized by its flex parent (basis 0, min-height = legend + `height`), never
// by the svg, so measuring it and sizing the svg to match cannot feed back into a growing loop. The
// legend wraps onto several lines on a phone, so its measured height is part of the minimum.
const chartHeight = computed(() => {
    if (!props.fill || !hostHeight.value) return props.height;
    return Math.max(props.height, hostHeight.value - headHeight.value - 10);
});
watch(headEl, (el, old) => {
    if (old) observer?.unobserve(old);
    if (el) observer?.observe(el);
});
const hasData = computed(() => props.buckets.some(b => total(b) > 0 || (b.previous ?? 0) > 0));
const previousOn = computed(() => props.showPrevious && props.buckets.some(b => b.previous != null));
const lineOn = computed(() => props.showLine && props.buckets.filter(b => b.line != null).length > 1);

const margin = computed(() => ({ top: 12, right: lineOn.value ? 52 : 12, bottom: 26, left: 44 }));
const plotWidth = computed(() => width.value - margin.value.left - margin.value.right);
const plotHeight = computed(() => chartHeight.value - margin.value.top - margin.value.bottom);
const slot = computed(() => plotWidth.value / Math.max(1, props.buckets.length));
const barWidth = computed(() => (slot.value < 4 ? Math.max(1, slot.value - 0.5) : Math.min(34, slot.value * 0.72)));
const center = (i: number) => margin.value.left + (i + 0.5) * slot.value;

/** 1, 2, 2.5 or 5 × 10^k, so gridlines land on round numbers. */
function niceStep(raw: number): number {
    const power = 10 ** Math.floor(Math.log10(raw));
    const f = raw / power;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * power;
}
const yScale = computed(() => {
    const max = Math.max(1, ...props.buckets.map(b => Math.max(total(b), previousOn.value ? b.previous ?? 0 : 0)));
    const step = max <= 4 ? 1 : niceStep(max / 4);
    return { step, top: Math.max(step, Math.ceil(max / step) * step) };
});
const yTicks = computed(() => {
    const ticks: number[] = [];
    for (let v = 0; v <= yScale.value.top + 1e-9; v += yScale.value.step) ticks.push(Math.round(v * 100) / 100);
    return ticks;
});
const yAt = (v: number) => margin.value.top + plotHeight.value - (v / yScale.value.top) * plotHeight.value;
const fmtTick = (v: number) => fmtCount(v);

// The line (library size) has its own axis on the right; it is not zero-based, which the axis makes plain.
const lineRange = computed(() => {
    const values = props.buckets.map(b => b.line).filter((v): v is number => v != null);
    if (!values.length) return { min: 0, max: 1 };
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) { min = Math.max(0, min - 1); max = max + 1; }
    const pad = (max - min) * 0.06;
    return { min: Math.max(0, min - pad), max: max + pad };
});
const lineY = (v: number) => margin.value.top + plotHeight.value - ((v - lineRange.value.min) / Math.max(1e-9, lineRange.value.max - lineRange.value.min)) * plotHeight.value;
const lineTicks = computed(() => {
    const { min, max } = lineRange.value;
    return [0, 1, 2, 3].map(i => Math.round(min + ((max - min) / 3) * i));
});

const bars = computed(() => props.buckets.map((b, i) => {
    const x = margin.value.left + i * slot.value + (slot.value - barWidth.value) / 2;
    const base = margin.value.top + plotHeight.value;
    let y = base;
    const segments: { y: number; h: number; fill: string }[] = [];
    b.stack.forEach((value, k) => {
        if (!value) return;
        const h = (value / yScale.value.top) * plotHeight.value;
        y -= h;
        segments.push({ y, h, fill: props.colours[k] ?? 'var(--ot-cat-1)' });
    });
    return { key: b.key, x, segments, incomplete: b.incomplete, top: segments.length ? y : null, bottom: base };
}));

const previousPoints = computed(() => props.buckets
    .map((b, i) => (b.previous == null ? null : `${center(i).toFixed(1)},${yAt(b.previous).toFixed(1)}`))
    .filter(Boolean).join(' '));
const linePoints = computed(() => props.buckets
    .map((b, i) => (b.line == null ? null : `${center(i).toFixed(1)},${lineY(b.line).toFixed(1)}`))
    .filter(Boolean).join(' '));

function periodLabel(b: ChartBucket): string {
    if (props.granularity === 'day') {
        const d = new Date(`${b.from}T12:00:00`);
        return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    }
    if (props.granularity === 'month' && !b.incomplete) {
        return new Date(`${b.from}T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }
    return fmtDayRange(b.from, b.to);
}

const xTicks = computed(() => {
    const n = props.buckets.length;
    if (!n) return [];
    const count = Math.min(n, width.value < 520 ? 3 : 6);
    const indices = count === 1 ? [0] : Array.from({ length: count }, (_, k) => Math.round((k * (n - 1)) / (count - 1)));
    return [...new Set(indices)].map((index, k, all) => {
        const b = props.buckets[index];
        const d = new Date(`${b.key}T12:00:00`);
        const label = props.granularity === 'month'
            ? d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
            : fmtDayKey(props.granularity === 'week' ? b.key : b.from);
        return { index, x: center(index), anchor: k === 0 ? 'start' : k === all.length - 1 ? 'end' : 'middle', label };
    });
});

function indexAt(event: MouseEvent): number | null {
    const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
    const index = Math.floor((event.clientX - rect.left - margin.value.left) / slot.value);
    if (props.buckets.length === 0) return null;
    return Math.max(0, Math.min(props.buckets.length - 1, index));
}

function onMove(event: MouseEvent) {
    const i = indexAt(event);
    if (dragStart.value !== null) {
        if (i !== null && i !== dragEnd.value) {
            dragEnd.value = i;
            if (i !== dragStart.value) dragMoved.value = true;
        }
        return;
    }
    const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    focusIndex.value = x >= margin.value.left && x <= width.value - margin.value.right ? i : null;
}

function onLeave() {
    if (dragStart.value === null) focusIndex.value = null;
}

function onDown(event: MouseEvent) {
    if (!props.brush || event.button !== 0) return;
    const i = indexAt(event);
    if (i === null) return;
    dragStart.value = i;
    dragEnd.value = i;
    dragMoved.value = false;
    event.preventDefault();
}

function onUp(event: MouseEvent) {
    if (dragStart.value === null) return;
    const a = Math.min(dragStart.value, dragEnd.value ?? dragStart.value);
    const b = Math.max(dragStart.value, dragEnd.value ?? dragStart.value);
    const moved = dragMoved.value;
    cancelDrag();
    if (moved && b > a) emit('zoom', props.buckets[a].from, props.buckets[b].to);
    else if (!moved && props.granularity !== 'day') emit('zoom', props.buckets[a].from, props.buckets[a].to);
    focusIndex.value = indexAt(event);
}

function cancelDrag() {
    dragStart.value = null;
    dragEnd.value = null;
    dragMoved.value = false;
}

const brushRect = computed(() => {
    if (dragStart.value === null || dragEnd.value === null || !dragMoved.value) return null;
    const a = Math.min(dragStart.value, dragEnd.value);
    const b = Math.max(dragStart.value, dragEnd.value);
    return { x: margin.value.left + a * slot.value, w: (b - a + 1) * slot.value, a, b };
});
const brushLabel = computed(() => {
    const r = brushRect.value;
    if (!r) return '';
    return fmtDayRange(props.buckets[r.a].from, props.buckets[r.b].to);
});

function step(delta: number) {
    const n = props.buckets.length;
    if (!n) return;
    focusIndex.value = Math.max(0, Math.min(n - 1, (focusIndex.value ?? n - 1) + delta));
}

function openFocused() {
    if (focusIndex.value === null || props.granularity === 'day' || !props.brush) return;
    const b = props.buckets[focusIndex.value];
    emit('zoom', b.from, b.to);
}

const focusBucket = computed(() => (focusIndex.value === null ? null : props.buckets[focusIndex.value] ?? null));

const tooltipStyle = computed(() => {
    if (focusIndex.value === null) return {};
    const x = center(focusIndex.value);
    const flip = x > width.value - 200;
    return { left: `${flip ? x - 186 : x + 14}px`, top: `${margin.value.top + 6}px` };
});

const summary = computed(() => {
    const totals = props.buckets.map(total);
    const sum = totals.reduce((a, v) => a + v, 0);
    const best = totals.indexOf(Math.max(...totals));
    return `${sum.toLocaleString()} ${props.unit} across ${props.buckets.length} ${props.granularity}s`
        + (best >= 0 && props.buckets[best] ? `; the most was ${totals[best]} in ${periodLabel(props.buckets[best])}` : '')
        + '. Use the arrow keys to read each period.';
});
</script>

<style scoped>
.head { display: flex; align-items: center; gap: var(--ot-space-3); margin-bottom: var(--ot-space-2); flex-wrap: wrap; }
.ms-bars.fill { flex: 1 1 0; display: flex; flex-direction: column; }
.head .spacer { flex: 1 1 auto; }
.hint { font-size: 11px; color: var(--ot-muted); }
.band { fill: var(--ot-text-2); opacity: 0.08; }
.brush { fill: var(--ot-accent); opacity: 0.16; stroke: var(--ot-accent); stroke-width: 1; }
.partial { fill: none; stroke: var(--ot-text-2); stroke-dasharray: 2 2; stroke-width: 1; opacity: 0.6; }
.prev { stroke: var(--ot-text-2); stroke-dasharray: 4 4; stroke-width: 1.5; }
svg { cursor: crosshair; user-select: none; }
svg.dragging { cursor: col-resize; }
svg:focus-visible { outline: var(--ot-focus) solid var(--ot-accent); outline-offset: 2px; }
.swatch { display: inline-block; width: 8px; height: 8px; border-radius: 2px; }
.ot-legend .swatch.sq { width: 10px; height: 10px; }
.ot-legend .swatch.dash { width: 14px; height: 0; border-top: 2px dashed var(--ot-text-2); border-radius: 0; }
.ms-legendbtn { background: none; border: 0; padding: 0; cursor: pointer; font: inherit; color: inherit; }
.ms-legendbtn:hover { color: var(--ot-text); text-decoration: underline; text-underline-offset: 3px; }
.ot-tooltip .r.total { border-top: 1px solid var(--ot-line); margin-top: 2px; padding-top: 2px; }
.partialtag { color: var(--ot-warning); }
</style>
