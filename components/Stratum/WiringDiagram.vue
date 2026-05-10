<template>
  <div class="wiring-diagram">
    <div class="wd-header">
      <h4>Wiring diagram</h4>
      <span class="wd-stats" v-if="graph">{{ graph.nodes.length }} modules, {{ graph.edges.length }} wires</span>
      <span v-else class="muted">No design loaded.</span>
    </div>
    <div v-if="graph" class="wd-summary muted">{{ graph.summary }}</div>
    <svg
      v-if="graph"
      ref="svgEl"
      class="wd-svg"
      :viewBox="viewBox"
      preserveAspectRatio="xMidYMid meet"
    >
      <!-- edges -->
      <g class="edges">
        <line
          v-for="e in laidOutEdges"
          :key="e.id"
          :x1="e.x1" :y1="e.y1" :x2="e.x2" :y2="e.y2"
          :stroke="signalColor(e.signal)"
          stroke-width="1.6"
          stroke-linecap="round"
        />
        <text
          v-for="e in laidOutEdges"
          :key="'lbl-'+e.id"
          :x="(e.x1 + e.x2)/2" :y="(e.y1 + e.y2)/2 - 4"
          class="edge-label"
          text-anchor="middle"
        >{{ e.signal || (e.sourcePin + '→' + e.targetPin) }}</text>
      </g>
      <!-- nodes -->
      <g class="nodes">
        <g
          v-for="n in laidOutNodes"
          :key="n.id"
          :transform="`translate(${n.x - n.w/2}, ${n.y - n.h/2})`"
          class="node"
          :data-category="n.category"
        >
          <rect :width="n.w" :height="n.h" rx="6" ry="6" />
          <text class="node-id" x="8" y="14">{{ n.id }}</text>
          <text class="node-module" x="8" y="28">{{ n.moduleId }}</text>
          <text class="node-role" x="8" y="42">{{ n.role }}</text>
        </g>
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';

interface Pin { name: string; kind: string; }
interface Node { id: string; moduleId: string; label: string; role: string; category: string; pins: Pin[]; }
interface Edge { id: string; source: string; sourcePin: string; target: string; targetPin: string; signal: string; }
interface Graph { nodes: Node[]; edges: Edge[]; summary: string; }

const props = defineProps<{ graph: Graph | null }>();

interface LaidOutNode extends Node { x: number; y: number; w: number; h: number; vx: number; vy: number; }
interface LaidOutEdge extends Edge { x1: number; y1: number; x2: number; y2: number; }

const laidOutNodes = ref<LaidOutNode[]>([]);
const laidOutEdges = ref<LaidOutEdge[]>([]);
const viewBox = ref('0 0 800 600');
const svgEl = ref<SVGSVGElement | null>(null);

function layout() {
  if (!props.graph || !props.graph.nodes.length) {
    laidOutNodes.value = [];
    laidOutEdges.value = [];
    return;
  }
  const W = 800, H = 600, nodeW = 140, nodeH = 56;
  const N = props.graph.nodes.length;
  // Initial layout: circle.
  const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 80;
  const nodes: LaidOutNode[] = props.graph.nodes.map((n, i) => ({
    ...n,
    w: nodeW, h: nodeH, vx: 0, vy: 0,
    x: cx + R * Math.cos((i / N) * Math.PI * 2),
    y: cy + R * Math.sin((i / N) * Math.PI * 2),
  }));
  const idIdx = new Map(nodes.map((n, i) => [n.id, i]));

  // Force-directed: repulsion between all pairs, spring along edges. 200 iterations is plenty for <30 nodes.
  const k = 90;            // repulsion constant
  const springLen = 200;   // ideal edge length
  const springK = 0.04;
  for (let iter = 0; iter < 250; iter++) {
    // repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = Math.max(dx * dx + dy * dy, 25);
        const d = Math.sqrt(d2);
        const f = (k * k) / d2;
        const fx = (dx / d) * f, fy = (dy / d) * f;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }
    }
    // springs
    for (const e of props.graph.edges) {
      const ai = idIdx.get(e.source); const bi = idIdx.get(e.target);
      if (ai === undefined || bi === undefined) continue;
      const a = nodes[ai], b = nodes[bi];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const f = springK * (d - springLen);
      const fx = (dx / d) * f, fy = (dy / d) * f;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }
    // integrate w/ damping
    const damp = 0.55;
    for (const n of nodes) {
      n.x += n.vx * damp;
      n.y += n.vy * damp;
      n.vx *= 0.6; n.vy *= 0.6;
      // clamp inside viewport
      n.x = Math.max(nodeW / 2 + 4, Math.min(W - nodeW / 2 - 4, n.x));
      n.y = Math.max(nodeH / 2 + 4, Math.min(H - nodeH / 2 - 4, n.y));
    }
  }
  laidOutNodes.value = nodes;

  // Edges: connect node centres (with slight offset along normal for parallel edges).
  const edges: LaidOutEdge[] = [];
  const seenPair = new Map<string, number>();
  for (const e of props.graph.edges) {
    const ai = idIdx.get(e.source); const bi = idIdx.get(e.target);
    if (ai === undefined || bi === undefined) continue;
    const a = nodes[ai], b = nodes[bi];
    const key = ai < bi ? `${ai}-${bi}` : `${bi}-${ai}`;
    const occurrence = (seenPair.get(key) || 0);
    seenPair.set(key, occurrence + 1);
    // perpendicular offset so parallel wires fan out
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
    const nx = -dy / d, ny = dx / d;
    const off = (occurrence - 0.5) * 8;
    edges.push({
      ...e,
      x1: a.x + nx * off, y1: a.y + ny * off,
      x2: b.x + nx * off, y2: b.y + ny * off,
    });
  }
  laidOutEdges.value = edges;
  viewBox.value = `0 0 ${W} ${H}`;
}

function signalColor(sig: string): string {
  const s = (sig || '').toUpperCase();
  if (s.includes('GND')) return '#444';
  if (s.includes('VCC') || s.includes('5V') || s.includes('3V3') || s.includes('VIN') || s.includes('VM')) return '#d04a3a';
  if (s.includes('I2C') || s.includes('SDA') || s.includes('SCL')) return '#3aa0d0';
  if (s.includes('SPI')) return '#9b59b6';
  if (s.includes('PWM')) return '#e1a83a';
  if (s.includes('UART') || s.includes('TX') || s.includes('RX')) return '#3ad07a';
  if (s.includes('MOTOR')) return '#c45a8c';
  return '#888';
}

watch(() => props.graph, layout, { deep: true });
onMounted(layout);
</script>

<style scoped>
.wiring-diagram {
  background: #161516;
  border: 1px solid #2a292a;
  border-radius: 6px;
  padding: 0.7rem 0.9rem;
  color: #ddd;
}
.wd-header { display: flex; justify-content: space-between; align-items: baseline; }
.wd-header h4 { margin: 0; font-size: 0.95rem; }
.wd-stats { font-size: 0.75rem; opacity: 0.7; }
.wd-summary { font-size: 0.78rem; margin: 0.3rem 0 0.6rem; }
.wd-svg { width: 100%; height: 480px; background: #0e0d0e; border-radius: 4px; }
.muted { opacity: 0.55; }
.node rect { fill: #211f21; stroke: #4d9e39; stroke-width: 1.2; }
.node[data-category="MCU"] rect { stroke: #4d9e39; }
.node[data-category="MotorDriver"] rect, .node[data-category="StepperDriver"] rect { stroke: #c45a8c; }
.node[data-category="Sensor"] rect { stroke: #3aa0d0; }
.node[data-category="Actuator"] rect { stroke: #e1a83a; }
.node[data-category="Power"] rect { stroke: #d04a3a; }
.node[data-category="Comms"] rect { stroke: #9b59b6; }
.node-id { fill: #fff; font-size: 11px; font-weight: 600; }
.node-module { fill: #aaa; font-size: 10px; }
.node-role { fill: #777; font-size: 9px; }
.edge-label { fill: #888; font-size: 8px; pointer-events: none; }
</style>
