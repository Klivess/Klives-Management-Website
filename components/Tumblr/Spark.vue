<template>
  <svg class="tmb-spark" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" role="img" :aria-label="label" style="width: 100%; height: 100%; display: block; overflow: visible">
    <defs>
      <linearGradient :id="gid" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" :stop-color="colour" stop-opacity="0.35" />
        <stop offset="1" :stop-color="colour" stop-opacity="0" />
      </linearGradient>
    </defs>
    <template v-if="shape">
      <path :d="shape.area" :fill="`url(#${gid})`" />
      <path :d="shape.line" fill="none" :stroke="colour" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
      <circle :cx="shape.lastX" :cy="shape.lastY" r="2.4" :fill="colour" />
    </template>
    <line v-else x1="0" :y1="H - 1" :x2="W" :y2="H - 1" stroke="var(--tmb-line-strong)" stroke-dasharray="3 3" />
  </svg>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue';

/** A small area line. Flat data keeps a visible line in the middle rather than sitting on the floor. */
const props = withDefaults(defineProps<{ values: number[]; colour?: string; label?: string }>(), { colour: 'var(--tmb-accent)', label: '' });
const W = 120;
const H = 34;
const gid = `tmb-spark-${useId()}`;

const shape = computed(() => {
  const v = props.values.filter(x => Number.isFinite(x));
  if (v.length < 2) return null;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const span = max - min;
  const y = (x: number) => (span === 0 ? H / 2 : H - 2 - ((x - min) / span) * (H - 6));
  const step = W / (v.length - 1);
  const pts = v.map((x, i) => [i * step, y(x)] as const);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return { line, area: `${line} L${W},${H} L0,${H} Z`, lastX: pts[pts.length - 1][0], lastY: pts[pts.length - 1][1] };
});
</script>
