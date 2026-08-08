<template>
    <svg v-if="points.length > 1" class="kt-spark" :width="width" :height="height"
         :viewBox="`0 0 ${width} ${height}`" preserveAspectRatio="none"
         role="img" :aria-label="ariaLabel">
        <path :d="path" :stroke="stroke" />
        <circle :cx="last.x" :cy="last.y" r="1.6" :fill="stroke" />
    </svg>
    <span v-else class="kt-sr">{{ ariaLabel }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
    values: number[];
    width?: number;
    height?: number;
    stroke?: string;
    label?: string;
}>(), {
    width: 90,
    height: 24,
    stroke: 'var(--kt-accent)',
    label: 'recent trend',
});

const points = computed(() => {
    const values = props.values.filter(v => Number.isFinite(v));
    if (values.length < 2) return [];

    let min = Math.min(...values);
    let max = Math.max(...values);
    // A flat series has no range to scale into; centre it rather than divide by zero.
    if (max - min < Number.EPSILON) { min -= 0.5; max += 0.5; }

    const stepX = props.width / (values.length - 1);
    const inset = 2; // keep the stroke and the end marker inside the box
    const usable = props.height - inset * 2;
    return values.map((value, index) => ({
        x: index * stepX,
        y: inset + usable - ((value - min) / (max - min)) * usable,
    }));
});

const path = computed(() =>
    points.value.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '));

const last = computed(() => points.value[points.value.length - 1] ?? { x: 0, y: 0 });

const ariaLabel = computed(() => {
    const values = props.values.filter(v => Number.isFinite(v));
    if (values.length < 2) return `${props.label}: not enough readings yet`;
    const first = values[0];
    const final = values[values.length - 1];
    const direction = final > first ? 'rising' : final < first ? 'falling' : 'flat';
    return `${props.label}: ${direction} over the last ${values.length} readings`;
});
</script>
