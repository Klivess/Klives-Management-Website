<template>
    <div>
        <div class="kt-actions" style="margin-bottom:var(--kt-space-2)">
            <span class="muted" style="font-size:11px">
                {{ points.length }} readings
                <template v-if="points.length > 1"> · {{ spanLabel }}</template>
            </span>
            <span class="grow"></span>
            <button class="kt-btn ghost sm" :aria-pressed="showTable" @click="showTable = !showTable">
                {{ showTable ? 'Show chart' : 'Show data' }}
            </button>
        </div>

        <div v-if="!showTable" ref="host" class="kt-chart">
            <svg v-if="ready" :height="height" :viewBox="`0 0 ${width} ${height}`"
                 role="img" :aria-label="ariaLabel" tabindex="0"
                 @mousemove="onHover" @mouseleave="hoverIndex = null" @keydown="onKey">
                <line v-for="tick in yTicks" :key="`g${tick.value}`" class="gridline"
                      :x1="padLeft" :x2="width - padRight" :y1="tick.y" :y2="tick.y" />
                <text v-for="tick in yTicks" :key="`t${tick.value}`" class="axis"
                      :x="padLeft - 6" :y="tick.y + 3" text-anchor="end">{{ tick.label }}</text>
                <text v-for="tick in xTicks" :key="`x${tick.x}`" class="axis"
                      :x="tick.x" :y="height - 4" text-anchor="middle">{{ tick.label }}</text>

                <path class="trace" :d="path" :stroke="stroke" />

                <template v-if="hovered">
                    <line class="crosshair" :x1="hovered.px" :x2="hovered.px"
                          :y1="padTop" :y2="height - padBottom" />
                    <circle class="marker" :cx="hovered.px" :cy="hovered.py" r="3" :fill="stroke" />
                </template>
            </svg>

            <div v-if="hovered" class="kt-tooltip" :style="tooltipStyle">
                {{ formatValue(hovered.point.y) }} · #{{ hovered.point.seq }}<br />
                {{ new Date(hovered.point.x).toLocaleTimeString() }}
            </div>

            <!-- An axis that does not start at zero exaggerates every wiggle, so it says so. -->
            <p v-if="!includesZero" class="muted" style="font-size:10px;margin-top:var(--kt-space-1)">
                Vertical axis starts at {{ formatValue(bounds.min) }}, not zero.
            </p>
        </div>

        <div v-else class="kt-tablewrap" style="max-height:300px">
            <table class="kt-table">
                <thead><tr><th class="num">Seq</th><th>Time</th><th class="num">Value</th></tr></thead>
                <tbody>
                    <tr v-for="point in reversedPoints" :key="point.seq">
                        <td class="num">{{ point.seq }}</td>
                        <td class="mono">{{ new Date(point.x).toLocaleTimeString() }}</td>
                        <td class="num">{{ formatValue(point.y) }}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { fmtDuration } from '~/scripts/kliveTech';
import type { TracePoint } from '~/scripts/kliveTechLive';

const props = withDefaults(defineProps<{
    points: TracePoint[];
    height?: number;
    stroke?: string;
    label?: string;
    /** A boolean stream is a square wave; interpolating between 0 and 1 is a lie. */
    step?: boolean;
    format?: (value: number) => string;
}>(), {
    height: 200,
    stroke: 'var(--kt-accent)',
    label: 'trace',
});

const host = ref<HTMLElement | null>(null);
const width = ref(600);
const showTable = ref(false);
const hoverIndex = ref<number | null>(null);

const padLeft = 46;
const padRight = 10;
const padTop = 10;
const padBottom = 18;

let observer: ResizeObserver | null = null;
onMounted(() => {
    if (typeof ResizeObserver === 'undefined' || !host.value) return;
    // Measuring real pixels keeps the labels from stretching with a viewBox scale.
    observer = new ResizeObserver((entries) => {
        const measured = entries[0]?.contentRect.width ?? 0;
        if (measured > 0) width.value = measured;
    });
    observer.observe(host.value);
});
onBeforeUnmount(() => observer?.disconnect());

const ready = computed(() => props.points.length > 1);
const reversedPoints = computed(() => [...props.points].reverse());

function formatValue(value: number): string {
    if (props.format) return props.format(value);
    return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

const bounds = computed(() => {
    const ys = props.points.map(p => p.y);
    let min = Math.min(...ys);
    let max = Math.max(...ys);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
    if (max - min < Number.EPSILON) { min -= 1; max += 1; }
    else { const pad = (max - min) * 0.08; min -= pad; max += pad; }
    return { min, max };
});

const includesZero = computed(() => bounds.value.min <= 0 && bounds.value.max >= 0);

const xBounds = computed(() => {
    const xs = props.points.map(p => p.x);
    const min = Math.min(...xs);
    const max = Math.max(...xs);
    return { min, max: max === min ? min + 1 : max };
});

function toX(x: number): number {
    const { min, max } = xBounds.value;
    return padLeft + ((x - min) / (max - min)) * (width.value - padLeft - padRight);
}
function toY(y: number): number {
    const { min, max } = bounds.value;
    return padTop + (1 - (y - min) / (max - min)) * (props.height - padTop - padBottom);
}

const path = computed(() => {
    if (!ready.value) return '';
    return props.points.map((point, index) => {
        const x = toX(point.x).toFixed(2);
        const y = toY(point.y).toFixed(2);
        if (index === 0) return `M${x},${y}`;
        if (props.step) {
            const previous = toY(props.points[index - 1].y).toFixed(2);
            return `L${x},${previous} L${x},${y}`;
        }
        return `L${x},${y}`;
    }).join(' ');
});

const yTicks = computed(() => {
    const { min, max } = bounds.value;
    return [0, 0.25, 0.5, 0.75, 1].map((fraction) => {
        const value = min + (max - min) * (1 - fraction);
        return { value, y: padTop + fraction * (props.height - padTop - padBottom), label: formatValue(value) };
    });
});

const xTicks = computed(() => {
    if (!ready.value) return [];
    const { min, max } = xBounds.value;
    return [0, 0.5, 1].map((fraction) => {
        const at = min + (max - min) * fraction;
        return {
            x: padLeft + fraction * (width.value - padLeft - padRight),
            label: new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        };
    });
});

const spanLabel = computed(() => {
    const { min, max } = xBounds.value;
    return `${fmtDuration(max - min)} span`;
});

const hovered = computed(() => {
    if (hoverIndex.value === null) return null;
    const point = props.points[hoverIndex.value];
    if (!point) return null;
    return { point, px: toX(point.x), py: toY(point.y) };
});

const tooltipStyle = computed(() => {
    if (!hovered.value) return {};
    const flip = hovered.value.px > width.value * 0.6;
    return {
        left: `${hovered.value.px + (flip ? -8 : 8)}px`,
        top: `${hovered.value.py}px`,
        transform: flip ? 'translate(-100%, -50%)' : 'translateY(-50%)',
    };
});

function nearestIndex(clientX: number): number | null {
    const rect = host.value?.getBoundingClientRect();
    if (!rect || !props.points.length) return null;
    const target = clientX - rect.left;
    let best = 0;
    let bestDistance = Infinity;
    props.points.forEach((point, index) => {
        const distance = Math.abs(toX(point.x) - target);
        if (distance < bestDistance) { bestDistance = distance; best = index; }
    });
    return best;
}

function onHover(event: MouseEvent) { hoverIndex.value = nearestIndex(event.clientX); }

// Arrow keys walk the series, so the readings are reachable without a mouse.
function onKey(event: KeyboardEvent) {
    if (!props.points.length) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const current = hoverIndex.value ?? props.points.length - 1;
    const next = event.key === 'ArrowLeft' ? current - 1 : current + 1;
    hoverIndex.value = Math.min(props.points.length - 1, Math.max(0, next));
}

const ariaLabel = computed(() => {
    if (!ready.value) return `${props.label}: not enough readings to plot`;
    const first = props.points[0];
    const last = props.points[props.points.length - 1];
    return `${props.label}: ${props.points.length} readings, from ${formatValue(first.y)} ` +
        `to ${formatValue(last.y)}. Use the arrow keys to read individual values.`;
});
</script>
