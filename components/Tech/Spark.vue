<template>
  <svg class="ktx-spark" :viewBox="`0 0 ${width} ${height}`" preserveAspectRatio="none" role="img" :aria-label="label || 'trend'">
    <template v-if="shape">
      <path v-if="area" class="ktx-spark__area" :d="shape.area" :style="{ fill: colour }" />
      <path class="ktx-spark__line" :d="shape.line" :style="{ stroke: colour }" />
      <circle class="ktx-spark__dot" :cx="shape.last[0]" :cy="shape.last[1]" r="1.8" :style="{ fill: colour }" />
    </template>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/** A small trend line. `step` draws a boolean as a square wave rather than a slope. */
const props = withDefaults(defineProps<{
  points: number[];
  colour?: string;
  width?: number;
  height?: number;
  area?: boolean;
  step?: boolean;
  label?: string;
}>(), { colour: 'var(--ktx-signal)', width: 120, height: 28, area: true, step: false, label: '' });

const shape = computed(() => {
  const values = props.points.filter(v => Number.isFinite(v));
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;
  const w = props.width;
  const h = props.height - pad * 2;
  const xy = values.map((v, i) => [(i / (values.length - 1)) * w, pad + h - ((v - min) / span) * h]);
  let line = `M${xy[0][0].toFixed(1)},${xy[0][1].toFixed(1)}`;
  for (let i = 1; i < xy.length; i++) {
    if (props.step) line += ` H${xy[i][0].toFixed(1)} V${xy[i][1].toFixed(1)}`;
    else line += ` L${xy[i][0].toFixed(1)},${xy[i][1].toFixed(1)}`;
  }
  const area = `${line} L${w},${props.height} L0,${props.height} Z`;
  return { line, area, last: xy[xy.length - 1] };
});
</script>
