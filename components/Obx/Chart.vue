<template>
  <div class="obx-chart" @pointerleave="hover = null">
    <svg :viewBox="`0 0 ${W} ${height}`" :style="{ height: `${height}px` }" preserveAspectRatio="none" role="img" :aria-label="label" @pointermove="onMove">
      <line v-for="g in grid" :key="g" :x1="0" :x2="W" :y1="g" :y2="g" stroke="rgba(160,172,230,0.08)" vector-effect="non-scaling-stroke" />
      <template v-if="bars">
        <rect v-for="(b, i) in barRects" :key="i" :x="b.x" :y="b.y" :width="b.w" :height="b.h" rx="1.5" :fill="colour" :opacity="hover === null || hover === i ? 0.9 : 0.4" />
      </template>
      <template v-else-if="pts.length > 1">
        <path :d="area" :fill="`url(#${gradId})`" />
        <path :d="line" fill="none" :stroke="colour" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />
        <circle v-if="hover !== null && pts[hover]" :cx="pts[hover]!.x" :cy="pts[hover]!.y" r="3.5" :fill="colour" vector-effect="non-scaling-stroke" />
      </template>
      <defs>
        <linearGradient :id="gradId" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" :stop-color="colour" stop-opacity="0.32" />
          <stop offset="100%" :stop-color="colour" stop-opacity="0" />
        </linearGradient>
      </defs>
    </svg>
    <div v-if="hover !== null && data[hover]" class="obx-chart__tip" :style="{ left: `${tipLeft}%` }">
      {{ data[hover]!.label }} · <b>{{ format(data[hover]!.value) }}</b>
    </div>
    <div v-if="data.length" class="obx-chart__axis"><span>{{ data[0]!.label }}</span><span>max {{ format(maxValue) }}</span><span>{{ data[data.length - 1]!.label }}</span></div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

/** A day-by-day chart with a hover readout: a line with a fading area, or bars. */
const props = withDefaults(defineProps<{
  data: { label: string; value: number }[];
  height?: number;
  colour?: string;
  bars?: boolean;
  label?: string;
  format?: (v: number) => string;
}>(), { height: 120, colour: 'var(--obx-accent)', bars: false, label: 'chart', format: (v: number) => Math.round(v).toLocaleString() });

const W = 300;
const gradId = `obxg${Math.random().toString(36).slice(2, 8)}`;
const hover = ref<number | null>(null);
const maxValue = computed(() => Math.max(1, ...props.data.map(d => d.value)));
const grid = computed(() => [0.25, 0.5, 0.75].map(f => props.height * f));
const pts = computed(() => props.data.map((d, i) => ({
  x: props.data.length > 1 ? (i / (props.data.length - 1)) * W : W / 2,
  y: props.height - 3 - (d.value / maxValue.value) * (props.height - 10),
})));
const line = computed(() => pts.value.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
const area = computed(() => `${line.value} L${W},${props.height} L0,${props.height} Z`);
const barRects = computed(() => {
  const n = props.data.length;
  if (!n) return [];
  const slot = W / n;
  return props.data.map((d, i) => {
    const h = Math.max(1, (d.value / maxValue.value) * (props.height - 6));
    return { x: i * slot + slot * 0.14, w: slot * 0.72, y: props.height - h, h };
  });
});
const tipLeft = computed(() => {
  if (hover.value === null || props.data.length < 2) return 50;
  return Math.min(88, Math.max(12, (hover.value / (props.data.length - 1)) * 100));
});

function onMove(event: PointerEvent) {
  const el = event.currentTarget as SVGElement;
  const rect = el.getBoundingClientRect();
  if (!props.data.length || rect.width <= 0) return;
  const f = (event.clientX - rect.left) / rect.width;
  hover.value = Math.min(props.data.length - 1, Math.max(0, props.bars ? Math.floor(f * props.data.length) : Math.round(f * (props.data.length - 1))));
}
</script>
