<template>
  <svg v-if="points.length > 1" class="cs2x-spark" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" role="img" :aria-label="label" style="display: block; width: 100%; height: 34px">
    <line v-if="zeroY != null" x1="0" :x2="W" :y1="zeroY" :y2="zeroY" stroke="rgba(222,208,186,0.14)" stroke-dasharray="2 3" />
    <path :d="area" :fill="`color-mix(in srgb, ${color} 18%, transparent)`" />
    <path :d="line" fill="none" :stroke="color" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/** A line of how a figure got here (cumulative profit, a balance). Zero is marked when the line crosses it. */
const props = defineProps<{ points: number[]; tone?: 'ok' | 'crit' | 'info' | 'accent' | 'neutral'; label: string }>();
const W = 200;
const H = 34;
const color = computed(() => ({ ok: 'var(--x-ok)', crit: 'var(--x-crit)', info: 'var(--x-info)', accent: 'var(--x-accent)', neutral: 'var(--x-ink-3)' })[props.tone ?? 'accent']);
const bounds = computed(() => {
  const min = Math.min(0, ...props.points);
  const max = Math.max(0, ...props.points);
  return { min, max: max === min ? min + 1 : max };
});
const xy = computed(() => props.points.map((v, i) => {
  const x = (i / (props.points.length - 1)) * W;
  const y = H - 2 - ((v - bounds.value.min) / (bounds.value.max - bounds.value.min)) * (H - 4);
  return [x, y] as const;
}));
const line = computed(() => xy.value.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(''));
const zeroY = computed(() => (bounds.value.min < 0 ? H - 2 - ((0 - bounds.value.min) / (bounds.value.max - bounds.value.min)) * (H - 4) : null));
const area = computed(() => {
  const base = zeroY.value ?? H;
  return `${line.value}L${W},${base}L0,${base}Z`;
});
</script>
