<template>
    <!--
      A sparkline shows shape, never exact values — so it is always labelled by the
      metric beside it and never rendered on its own. The last point is marked
      because "where it ended" is the one value people read off a spark.
    -->
    <svg class="ot-spark" :viewBox="`0 0 ${width} ${height}`" preserveAspectRatio="none"
         :style="{ height: `${height}px`, width: '100%' }" role="img" :aria-label="ariaLabel">
        <polyline v-if="filled" :points="areaPoints" :fill="fill" stroke="none" />
        <polyline :points="linePoints" fill="none" :stroke="stroke" stroke-width="1.5"
                  stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
        <circle :cx="lastPoint[0]" :cy="lastPoint[1]" r="2.4" :fill="stroke" vector-effect="non-scaling-stroke" />
    </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
    values: number[];
    height?: number;
    tone?: 'pos' | 'neg' | 'neutral' | 'auto';
    filled?: boolean;
    label?: string;
}>(), { height: 28, tone: 'auto', filled: true });

const width = 100;

const stroke = computed(() => {
    if (props.tone === 'pos') return 'var(--ot-positive)';
    if (props.tone === 'neg') return 'var(--ot-negative)';
    if (props.tone === 'neutral') return 'var(--ot-cat-1)';
    const v = props.values;
    return v.length > 1 && v[v.length - 1] < v[0] ? 'var(--ot-negative)' : 'var(--ot-positive)';
});

const fill = computed(() =>
    stroke.value === 'var(--ot-negative)' ? 'var(--ot-negative-soft)' : 'var(--ot-positive-soft)');

const points = computed<Array<[number, number]>>(() => {
    const v = props.values;
    if (v.length < 2) return [];
    const min = Math.min(...v);
    const max = Math.max(...v);
    const range = Math.max(1e-9, max - min);
    const pad = 2;
    return v.map((value, i) => [
        (i / (v.length - 1)) * width,
        props.height - pad - ((value - min) / range) * (props.height - pad * 2),
    ]);
});

const linePoints = computed(() => points.value.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' '));
const areaPoints = computed(() => {
    if (!points.value.length) return '';
    return `0,${props.height} ${linePoints.value} ${width},${props.height}`;
});
const lastPoint = computed(() => points.value[points.value.length - 1] ?? [0, 0]);

const ariaLabel = computed(() => {
    const v = props.values;
    if (v.length < 2) return props.label ?? 'trend';
    const change = v[v.length - 1] - v[0];
    const direction = change > 0 ? 'rising' : change < 0 ? 'falling' : 'flat';
    return `${props.label ?? 'Trend'}: ${direction} over the last ${v.length} points`;
});
</script>
