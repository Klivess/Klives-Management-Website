<!--
  The routing map: every service lane, the router it went to, and the model that answered, as
  ribbons as wide as their tokens (or calls, or cost). Hover a node or ribbon for its figures; click
  a node to filter the page to it.
-->
<template>
  <div ref="box" class="llx-flow" :style="{ height: `${height + 34}px` }">
    <div class="llx-flow__heads">
      <span>Service › lane</span><span>Router</span><span>Model</span>
    </div>
    <svg v-if="layout.nodes.length" :viewBox="`0 0 ${width} ${height}`" preserveAspectRatio="none" class="llx-flow__svg" role="img" :aria-label="aria">
      <g class="llx-flow__links">
        <path v-for="(l, i) in links" :key="i" :d="l.d" :stroke-width="l.w" :data-failed="failing(l) || undefined"
              :data-active="isActive(l.from) || isActive(l.to) || undefined" :data-dim="hover && !isActive(l.from) && !isActive(l.to) || undefined"
              @mouseenter="tip = { x: l.mx, y: l.my, text: `${nodeLabel(l.from)} → ${nodeLabel(l.to)}: ${fmt(l.value)}${l.failed ? ` · ${l.failed} failed (${Math.round((l.failed / Math.max(1, l.calls)) * 1000) / 10}%)` : ''}` }"
              @mouseleave="tip = null" />
      </g>
      <g class="llx-flow__nodes">
        <g v-for="n in layout.nodes" :key="n.id" :transform="`translate(${x(n.column)}, ${n.y})`" class="llx-flow__node"
           :data-column="n.column" :data-active="isActive(n.id) || undefined" :data-dim="hover && !isActive(n.id) || undefined"
           @mouseenter="hover = n.id" @mouseleave="hover = null" @click="$emit('select', n.column === 0 ? 'lane' : n.column === 1 ? 'router' : 'model', n.key)">
          <rect :width="nodeW" :height="Math.max(2, n.h)" rx="2" />
          <text :x="n.column === 2 ? -6 : nodeW + 6" :y="Math.max(2, n.h) / 2" :text-anchor="n.column === 2 ? 'end' : 'start'" dominant-baseline="middle">
            {{ truncate(n.label) }} <tspan class="llx-flow__fig">{{ fmt(n.value) }}</tspan>
          </text>
        </g>
      </g>
    </svg>
    <div v-else class="llx-empty">{{ emptyText }}</div>
    <div v-if="tip" class="llx-flow__tip" :style="{ left: `${(tip.x / width) * 100}%`, top: `${tip.y + 30}px` }">{{ tip.text }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { layoutFlow, llmCompact, llmInt, llmUsd } from '~/scripts/kliveLlm';

const props = withDefaults(defineProps<{
  flows: any[];
  measure: 'tokens' | 'calls' | 'costUsd';
  height?: number;
  emptyText?: string;
}>(), { height: 300, emptyText: 'No calls in this window.' });
defineEmits<{ select: [kind: 'lane' | 'router' | 'model', key: string] }>();

// The drawing is as wide as the card, one unit to a pixel, so labels are never stretched.
const box = ref<HTMLElement | null>(null);
const width = ref(1000);
let observer: ResizeObserver | null = null;
onMounted(() => {
  if (!box.value || typeof ResizeObserver === 'undefined') return;
  observer = new ResizeObserver(entries => {
    const w = Math.round(entries[0]?.contentRect.width ?? 0);
    if (w > 0) width.value = Math.max(320, w);
  });
  observer.observe(box.value);
});
onBeforeUnmount(() => observer?.disconnect());
const nodeW = 10;
const hover = ref<string | null>(null);
const tip = ref<{ x: number; y: number; text: string } | null>(null);

const layout = computed(() => layoutFlow(props.flows, props.measure, props.height));
const x = (column: number) => column === 0 ? 0 : column === 1 ? width.value / 2 - nodeW / 2 : width.value - nodeW;
const fmt = (v: number) => props.measure === 'costUsd' ? llmUsd(v) : props.measure === 'calls' ? `${llmInt(v)} calls` : `${llmCompact(v)} tokens`;
const nodeIndex = computed(() => new Map(layout.value.nodes.map(n => [n.id, n])));
const nodeLabel = (id: string) => nodeIndex.value.get(id)?.label ?? id;
const truncate = (s: string) => (s.length > 34 ? `${s.slice(0, 32)}…` : s);
/** A ribbon is drawn as failing only when a real share of its calls failed, not for one blip. */
const failing = (l: { failed: number; calls: number }) => l.calls > 0 && l.failed / l.calls >= 0.05;

const neighbours = computed(() => {
  const map = new Map<string, Set<string>>();
  for (const l of layout.value.links) {
    if (!map.has(l.from)) map.set(l.from, new Set());
    if (!map.has(l.to)) map.set(l.to, new Set());
    map.get(l.from)!.add(l.to);
    map.get(l.to)!.add(l.from);
  }
  return map;
});
function isActive(id: string) {
  if (!hover.value) return false;
  if (id === hover.value) return true;
  const direct = neighbours.value.get(hover.value);
  if (direct?.has(id)) return true;
  // A router lights the whole path through it; a lane or model lights its routers' other side too.
  for (const middle of direct ?? []) if (neighbours.value.get(middle)?.has(id) && middle.startsWith('r:')) return true;
  return false;
}

const links = computed(() => layout.value.links.map(l => {
  const from = nodeIndex.value.get(l.from)!, to = nodeIndex.value.get(l.to)!;
  const x0 = x(from.column) + nodeW, x1 = x(to.column);
  const c = (x1 - x0) / 2;
  return { ...l, d: `M${x0},${l.y0} C${x0 + c},${l.y0} ${x1 - c},${l.y1} ${x1},${l.y1}`, mx: (x0 + x1) / 2, my: (l.y0 + l.y1) / 2 };
}));
const aria = computed(() => `Routing map: ${layout.value.nodes.filter(n => n.column === 0).length} lanes, ${layout.value.nodes.filter(n => n.column === 1).length} routers, ${layout.value.nodes.filter(n => n.column === 2).length} models.`);
</script>
