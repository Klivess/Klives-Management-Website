<template>
  <svg
    v-if="points.length > 1"
    v-bind="attrs"
    class="dashboard-sparkline"
    :class="`dashboard-sparkline--${tone}`"
    viewBox="0 0 100 28"
    preserveAspectRatio="none"
    role="img"
    :aria-label="summary"
  >
    <path class="dashboard-sparkline__baseline" d="M0,27 L100,27" />
    <path class="dashboard-sparkline__line" :d="path" />
    <circle class="dashboard-sparkline__point" :cx="last.x" :cy="last.y" r="1.7" />
  </svg>
  <span v-else v-bind="attrs" class="dashboard-sparkline__empty" role="img" :aria-label="summary">—</span>
</template>

<script setup lang="ts">
import { computed, useAttrs } from 'vue';

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<{
  values: number[];
  label?: string;
  tone?: 'neutral' | 'good' | 'success' | 'warning' | 'danger' | 'info' | 'paper' | 'live';
}>(), {
  label: 'Recent trend',
  tone: 'neutral',
});

const attrs = useAttrs();

const finiteValues = computed(() => props.values.filter(Number.isFinite));

const points = computed(() => {
  const values = finiteValues.value;
  if (values.length < 2) return [];

  let min = Math.min(...values);
  let max = Math.max(...values);
  if (Math.abs(max - min) < Number.EPSILON) {
    min -= 0.5;
    max += 0.5;
  }

  const verticalInset = 2;
  const usableHeight = 28 - verticalInset * 2;
  const step = 100 / (values.length - 1);
  return values.map((value, index) => ({
    x: index * step,
    y: verticalInset + usableHeight - ((value - min) / (max - min)) * usableHeight,
  }));
});

const path = computed(() => points.value
  .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
  .join(' '));

const last = computed(() => points.value.at(-1) ?? { x: 0, y: 0 });

const summary = computed(() => {
  const values = finiteValues.value;
  if (values.length < 2) return `${props.label}: not enough readings yet`;
  const direction = values.at(-1)! > values[0]
    ? 'rising'
    : values.at(-1)! < values[0]
      ? 'falling'
      : 'flat';
  return `${props.label}: ${direction} across ${values.length} readings`;
});
</script>

<style scoped>
.dashboard-sparkline {
  display: block;
  width: 100%;
  min-width: 48px;
  height: 28px;
  overflow: visible;
  color: #8d8d8d;
}

.dashboard-sparkline__line,
.dashboard-sparkline__baseline {
  fill: none;
  vector-effect: non-scaling-stroke;
}

.dashboard-sparkline__line {
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.dashboard-sparkline__baseline {
  stroke: rgba(255, 255, 255, 0.06);
  stroke-width: 1;
}

.dashboard-sparkline__point { fill: currentColor; }
.dashboard-sparkline--good { color: #62ce47; }
.dashboard-sparkline--success { color: #62ce47; }
.dashboard-sparkline--warning { color: #e3b341; }
.dashboard-sparkline--danger { color: #ef6464; }
.dashboard-sparkline--info { color: #38bdf8; }
.dashboard-sparkline--paper { color: #7ad4f7; }
.dashboard-sparkline--live { color: #fbbf24; }

.dashboard-sparkline__empty {
  display: grid;
  min-height: 28px;
  place-items: center;
  color: #656565;
  font-size: 11px;
}
</style>
