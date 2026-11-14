<template>
  <section class="ktx-card ktx-map" aria-label="How gadgets reach Omnipotent" data-testid="ktx-linkmap">
    <header class="ktx-map__head">
      <h2 class="ktx-card__title"><TechIcon name="link" />Links</h2>
      <span class="ktx-card__meta">{{ summary }}</span>
      <span class="ktx-map__legend">
        <span><i data-transport="bluetooth"></i>Bluetooth</span>
        <span><i data-transport="hub"></i>Hub</span>
        <span><i data-transport="relayed"></i>Via hub</span>
        <span><i class="ktx-map__dash"></i>down</span>
      </span>
    </header>
    <div ref="frame" class="ktx-map__frame" :style="{ minHeight: `${needed}px` }">
      <!-- Drawn at the frame's own pixel width, so text stays the same size at any width. -->
      <svg v-if="width" class="ktx-map__svg" :width="width" :height="height" :viewBox="`0 0 ${width} ${height}`" role="img" :aria-label="summary">
        <g class="ktx-map__wires">
          <path v-for="wire in wires" :key="wire.id" :d="wire.d" :data-transport="wire.transport" :data-live="wire.live || undefined" />
        </g>
        <g class="ktx-map__core" :transform="`translate(${cx}, ${height / 2})`">
          <rect x="-36" y="-15" width="72" height="30" rx="9" />
          <text y="4" text-anchor="middle">Omnipotent</text>
        </g>
        <g
          v-for="node in nodes"
          :key="node.key"
          class="ktx-map__node"
          :data-state="node.state"
          :data-transport="node.transport"
          :transform="`translate(${node.x}, ${node.y})`"
          tabindex="0"
          role="button"
          :aria-label="`${node.name}: ${node.stateLabel}`"
          @click="emit('open', node.key)"
          @keydown.enter="emit('open', node.key)"
        >
          <title>{{ node.name }} · {{ node.stateLabel }}</title>
          <circle r="6" />
          <text :x="node.side === 'left' ? -11 : 11" y="4" :text-anchor="node.side === 'left' ? 'end' : 'start'">{{ node.label }}</text>
        </g>
        <text v-if="!nodes.length" class="ktx-map__none" :x="cx" :y="height / 2 + 34" text-anchor="middle">nothing linked yet</text>
      </svg>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { STATE_LABEL, isLive, type FleetItem, type HubStatus } from '~/scripts/kliveTech';

/**
 * Omnipotent in the middle; Bluetooth gadgets to its left; relay hubs to its right with the gadgets
 * they carry beyond them. A wire is solid while the link is up and dashed while it is not.
 */
const props = defineProps<{ fleet: FleetItem[]; status: HubStatus | null }>();
const emit = defineEmits<{ open: [key: string] }>();

const ROW = 26;
const frame = ref<HTMLElement | null>(null);
const width = ref(0);
const frameHeight = ref(0);
let observer: ResizeObserver | null = null;

onMounted(() => {
  if (!frame.value) return;
  observer = new ResizeObserver(entries => {
    const box = entries[0]?.contentRect;
    if (!box) return;
    width.value = Math.round(box.width);
    frameHeight.value = Math.round(box.height);
  });
  observer.observe(frame.value);
});
onBeforeUnmount(() => observer?.disconnect());

/** Every gadget's Bluetooth name starts with "KliveTech" (discovery needs it), so the map drops it. */
function shortName(name: string): string {
  const rest = name.replace(/^klivetech[\s\-_:]*/i, '').trim();
  return rest || name;
}

interface Node { key: string; name: string; label: string; x: number; y: number; side: 'left' | 'right'; state: string; stateLabel: string; transport: string }

const cx = computed(() => Math.round(width.value * 0.46));

/** The height the drawing needs; the frame is at least this tall and grows with its row. The
 *  svg itself is positioned absolutely, so it never feeds back into the size it is drawn at. */
const needed = computed(() => {
  const left = props.fleet.filter(i => i.transport === 'bluetooth').length;
  const right = props.fleet.length - left;
  return Math.max(left, right, 1) * ROW + 16 > 84 ? Math.max(left, right, 1) * ROW + 16 : 84;
});

const layout = computed(() => {
  const w = width.value;
  const direct = props.fleet.filter(i => i.transport === 'bluetooth');
  const hubs = props.fleet.filter(i => i.transport === 'hub');
  const relayed = props.fleet.filter(i => i.transport === 'relayed');
  const sameHub = (child: FleetItem, hub: FleetItem) => {
    const via = (child.gadget?.connectedViaHubID || child.remembered?.connectedViaHubID || '').replace(/:/g, '').toUpperCase();
    const id = (hub.gadget?.hubID || hub.address).replace(/:/g, '').toUpperCase();
    return !!via && via === id;
  };

  // Hubs, each followed by the gadgets it carries; gadgets whose hub is unknown last.
  const right: Array<{ item: FleetItem; parent?: FleetItem }> = [];
  for (const hub of hubs) {
    right.push({ item: hub });
    for (const child of relayed.filter(r => sameHub(r, hub))) right.push({ item: child, parent: hub });
  }
  for (const r of relayed) if (!right.some(e => e.item === r)) right.push({ item: r });

  const height = Math.max(frameHeight.value, needed.value);
  const mid = height / 2;
  const c = cx.value;
  // Left labels get the room between the edge and the node; right ones the room after it.
  const leftX = Math.max(96, Math.min(c - 90, Math.round(c * 0.55)));
  const hubX = c + Math.max(70, Math.round((w - c) * 0.22));
  const childX = hubX + 34;
  const fit = (room: number) => Math.max(6, Math.floor(room / 6.2));
  const label = (item: FleetItem, room: number) => {
    const s = shortName(item.name);
    const max = fit(room);
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  };

  const nodes: Node[] = [];
  const wires: Array<{ id: string; d: string; transport: string; live: boolean }> = [];

  direct.forEach((item, index) => {
    const y = mid + (index - (direct.length - 1) / 2) * ROW;
    nodes.push({ key: item.key, name: item.name, label: label(item, leftX - 16), x: leftX, y, side: 'left', state: item.state, stateLabel: STATE_LABEL[item.state], transport: 'bluetooth' });
    wires.push({ id: `w-${item.key}`, d: `M${c - 36},${mid} C${c - 70},${mid} ${leftX + 40},${y} ${leftX + 6},${y}`, transport: 'bluetooth', live: isLive(item.state) });
  });

  const placed = new Map<FleetItem, { x: number; y: number }>();
  right.forEach((entry, index) => {
    const y = mid + (index - (right.length - 1) / 2) * ROW;
    const x = entry.parent ? childX : hubX;
    placed.set(entry.item, { x, y });
    nodes.push({ key: entry.item.key, name: entry.item.name, label: label(entry.item, w - x - 16), x, y, side: 'right', state: entry.item.state, stateLabel: STATE_LABEL[entry.item.state], transport: entry.item.transport });
    if (entry.parent) {
      const p = placed.get(entry.parent)!;
      wires.push({ id: `w-${entry.item.key}`, d: `M${p.x},${p.y + 6} C${p.x},${y} ${x - 18},${y} ${x - 6},${y}`, transport: 'relayed', live: isLive(entry.item.state) && isLive(entry.parent.state) });
    } else {
      wires.push({ id: `w-${entry.item.key}`, d: `M${c + 36},${mid} C${c + 56},${mid} ${x - 30},${y} ${x - 6},${y}`, transport: entry.item.transport, live: isLive(entry.item.state) });
    }
  });
  return { nodes, wires, height };
});

const nodes = computed(() => layout.value.nodes);
const wires = computed(() => layout.value.wires);
const height = computed(() => layout.value.height);

const summary = computed(() => {
  const up = props.fleet.filter(i => isLive(i.state)).length;
  const hubs = (props.status?.relay?.hubs ?? []).filter(h => h.open).length;
  if (!props.fleet.length) return hubs ? `${hubs} hub up` : 'none';
  return `${up} of ${props.fleet.length} linked${hubs ? ` · ${hubs} hub${hubs === 1 ? '' : 's'}` : ''}`;
});
</script>
