<template>
  <div ref="root" class="odx-spark" :data-tone="tone" @pointermove="onMove" @pointerleave="hover = null">
    <svg v-if="points.length > 1" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" role="img" :aria-label="label">
      <template v-if="bars">
        <rect
          v-for="(bar, i) in barRects"
          :key="i"
          class="odx-spark__bar"
          :x="bar.x" :y="bar.y" :width="bar.w" :height="bar.h"
          :data-zero="bar.zero || undefined"
          :opacity="hover != null && hover !== i ? 0.5 : 1"
        />
      </template>
      <template v-else>
        <path class="odx-spark__area" :d="area" fill="currentColor" opacity="0.13" />
        <path class="odx-spark__line" :d="line" />
      </template>
    </svg>
    <div v-else class="odx-spark__empty">{{ emptyText }}</div>
    <template v-if="hover != null && points[hover]">
      <span class="odx-spark__cross" :style="{ left: `${crossX}%` }"></span>
      <span class="odx-tip" :style="{ left: `${crossX}%` }">
        <b>{{ format(points[hover].v) }}</b> <span>{{ when(points[hover].t) }}</span>
      </span>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

/** A small series: a line, or bars for counts per hour. Hover shows the value under the pointer. */
const props = withDefaults(defineProps<{
  points: { t: number; v: number }[];
  tone?: string;
  bars?: boolean;
  label?: string;
  format?: (value: number) => string;
  emptyText?: string;
}>(), {
  tone: 'info',
  bars: false,
  label: 'Trend',
  format: (value: number) => Math.round(value).toLocaleString('en-GB'),
  emptyText: 'No history yet',
});

const W = 100;
const H = 30;
const root = ref<HTMLElement | null>(null);
const hover = ref<number | null>(null);

const max = computed(() => Math.max(1, ...props.points.map(p => p.v)));

const coords = computed(() => {
  const n = props.points.length;
  return props.points.map((p, i) => ({ x: n > 1 ? (i / (n - 1)) * W : 0, y: H - (p.v / max.value) * (H - 2) - 1 }));
});
const line = computed(() => coords.value.map((c, i) => `${i ? 'L' : 'M'}${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' '));
const area = computed(() => (coords.value.length ? `${line.value} L${W},${H} L0,${H} Z` : ''));

const barRects = computed(() => {
  const n = props.points.length;
  const slot = W / Math.max(1, n);
  const gap = Math.min(0.6, slot * 0.25);
  return props.points.map((p, i) => {
    const h = p.v > 0 ? Math.max(1.2, (p.v / max.value) * (H - 1)) : 1;
    return { x: i * slot + gap / 2, y: H - h, w: Math.max(0.4, slot - gap), h, zero: p.v <= 0 };
  });
});

const crossX = computed(() => {
  if (hover.value == null) return 0;
  const n = props.points.length;
  if (props.bars) return ((hover.value + 0.5) / Math.max(1, n)) * 100;
  return n > 1 ? (hover.value / (n - 1)) * 100 : 0;
});

function onMove(event: PointerEvent) {
  const el = root.value;
  if (!el || props.points.length < 2) return;
  const rect = el.getBoundingClientRect();
  const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)));
  const n = props.points.length;
  hover.value = props.bars ? Math.min(n - 1, Math.floor(fraction * n)) : Math.round(fraction * (n - 1));
}

function when(t: number): string {
  const at = new Date(t);
  const sameDay = at.toDateString() === new Date().toDateString();
  return sameDay ? at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : at.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}
</script>
