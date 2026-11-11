<template>
  <svg class="kax-spark" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" role="img" :aria-label="label">
    <template v-if="bars">
      <rect v-for="(b, i) in shapes" :key="i" :x="b.x" :y="b.y" :width="b.w" :height="b.h" rx="1.5" :fill="b.failed ? 'var(--kax-crit)' : color" :opacity="b.zero ? 0.25 : 0.85">
        <title>{{ b.title }}</title>
      </rect>
    </template>
    <template v-else>
      <path :d="area" :fill="color" opacity="0.14" />
      <path :d="line" fill="none" :stroke="color" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
    </template>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/** A tiny chart: bars (one per bucket, a red cap for failures) or a filled line. No axes; the caption carries the numbers. */
const props = withDefaults(defineProps<{
  points: Array<{ v: number; failed?: number; label?: string }>;
  bars?: boolean;
  color?: string;
  label?: string;
  format?: (v: number) => string;
}>(), { bars: false, color: 'var(--kax-accent)', label: 'Trend' });

const W = 300;
const H = 34;
const max = computed(() => Math.max(1, ...props.points.map(p => p.v)));

const shapes = computed(() => {
  const n = Math.max(1, props.points.length);
  const slot = W / n;
  const w = Math.max(2, slot - 2);
  const out: Array<{ x: number; y: number; w: number; h: number; failed: boolean; zero: boolean; title: string }> = [];
  props.points.forEach((p, i) => {
    const h = p.v > 0 ? Math.max(2, (p.v / max.value) * (H - 2)) : 1.5;
    const title = `${p.label ?? ''} ${props.format ? props.format(p.v) : p.v}`.trim();
    out.push({ x: i * slot + 1, y: H - h, w, h, failed: false, zero: p.v <= 0, title });
    if (p.failed && p.v > 0) {
      const fh = Math.max(1.5, (Math.min(p.failed, p.v) / max.value) * (H - 2));
      out.push({ x: i * slot + 1, y: H - fh, w, h: fh, failed: true, zero: false, title: `${p.label ?? ''} ${p.failed} failed`.trim() });
    }
  });
  return out;
});

const coords = computed(() => {
  const n = props.points.length;
  return props.points.map((p, i) => [n <= 1 ? W / 2 : (i / (n - 1)) * W, H - 2 - (p.v / max.value) * (H - 4)] as const);
});
const line = computed(() => coords.value.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' '));
const area = computed(() => (coords.value.length ? `${line.value} L${W},${H} L0,${H} Z` : ''));
</script>
