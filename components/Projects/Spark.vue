<template>
  <svg class="pjx-spark" :viewBox="`0 0 ${w} ${h}`" preserveAspectRatio="none" role="img" :aria-label="label" :data-tone="tone">
    <title>{{ label }}</title>
    <template v-if="bars">
      <rect v-for="(b, i) in barRects" :key="i" class="bar" :class="{ zero: b.zero }" :x="b.x" :y="b.y" :width="b.w" :height="b.h" rx="1" />
    </template>
    <template v-else-if="paths">
      <path class="area" :d="paths.area" />
      <path class="line" :d="paths.line" />
    </template>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { sparkPaths, type PjTone } from '~/scripts/projectsConsole';

const props = withDefaults(defineProps<{
  values: number[];
  tone?: PjTone;
  bars?: boolean;
  label?: string;
  w?: number;
  h?: number;
}>(), { tone: 'accent', bars: false, label: 'Trend', w: 100, h: 28 });

const paths = computed(() => sparkPaths(props.values, props.w, props.h));
const barRects = computed(() => {
  const n = props.values.length;
  if (!n) return [];
  const max = Math.max(...props.values, 0) || 1;
  const gap = n > 40 ? 0.5 : 1;
  const bw = Math.max(0.5, (props.w - gap * (n - 1)) / n);
  return props.values.map((v, i) => {
    const zero = !(v > 0);
    const hh = zero ? 1.5 : Math.max(2, (v / max) * (props.h - 1));
    return { x: i * (bw + gap), y: props.h - hh, w: bw, h: hh, zero };
  });
});
</script>
