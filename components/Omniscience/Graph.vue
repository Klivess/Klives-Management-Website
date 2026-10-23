<template>
    <section class="os-panel">
        <div class="os-panel-head">
            <div><h2><span class="os-panel-code">NET</span> Relationship network</h2><p class="os-panel-subtitle">Typed, confidence-scored edges between people and unresolved entities</p></div>
            <div class="os-field-row">
                <select v-model="depth" class="os-select os-graph-depth" aria-label="Graph depth"><option :value="1">1 hop</option><option :value="2">2 hops</option></select>
                <button class="os-btn sm ghost" :disabled="loading" @click="load">Refresh</button>
            </div>
        </div>
        <div class="os-panel-body">
            <div v-if="error" class="os-error-state"><span>{{ error }}</span><button class="os-btn sm" @click="load">Retry</button></div>
            <div v-else-if="!personId" class="os-empty">Select a person to map their network.</div>
            <div v-else-if="loading && !data" class="os-skeleton-stack"><i /><i /><i /></div>
            <template v-else-if="data">
                <div class="os-network-layout">
                    <div class="os-network-canvas">
                        <svg viewBox="0 0 800 520" role="img" aria-label="Relationship graph">
                            <defs>
                                <marker id="os-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker>
                            </defs>
                            <line v-for="edge in positionedEdges" :key="edge.rel_id" :x1="edge.sourceNode.x" :y1="edge.sourceNode.y" :x2="edge.targetNode.x" :y2="edge.targetNode.y"
                                :stroke="edgeColor(edge)" :stroke-width="0.7 + edge.confidence * 2" stroke-opacity=".55" marker-end="url(#os-arrow)" />
                            <g v-for="node in positionedNodes" :key="node.id" class="os-network-node" :class="[node.kind, { root: node.root }]" :transform="`translate(${node.x},${node.y})`" @click="openNode(node)">
                                <circle :r="node.root ? 31 : node.kind === 'entity' ? 19 : 24" />
                                <text class="os-network-label" text-anchor="middle" :y="node.root ? 46 : 38">{{ short(node.label) }}</text>
                                <text v-if="node.kind === 'person'" class="os-network-sub" text-anchor="middle" y="4">{{ node.root ? 'SUBJECT' : formatCompact(node.message_count) }}</text>
                                <text v-else class="os-network-sub" text-anchor="middle" y="4">ENTITY</text>
                            </g>
                        </svg>
                        <div v-if="!data.edges?.length" class="os-network-empty">No typed edges yet. Run deduction to assemble the graph.</div>
                    </div>
                    <aside class="os-network-edges">
                        <div class="os-chart-heading"><span>{{ data.edges.length }} edges</span><small>{{ data.nodes.length }} nodes</small></div>
                        <button v-for="edge in data.edges" :key="edge.rel_id" class="os-network-edge" @click="focusEdge(edge)">
                            <span><strong>{{ nodeLabel(edge.source) }} → {{ nodeLabel(edge.target) }}</strong><small>{{ edge.rel_type }} · {{ edge.evidence_count }} evidence</small></span>
                            <b>{{ Math.round(edge.confidence * 100) }}%</b>
                        </button>
                    </aside>
                </div>
            </template>
        </div>
    </section>
</template>

<script setup lang="ts">
import { formatCompact, omniscienceError, useOmniscienceApi } from '~/composables/useOmniscienceApi';

const props = defineProps<{ personId: string }>();
const emit = defineEmits<{ select: [personId: string] }>();
const api = useOmniscienceApi();
const depth = ref(1);
const data = ref<any>(null);
const loading = ref(false);
const error = ref('');
const positionedNodes = computed(() => {
    const nodes = data.value?.nodes || [];
    const root = nodes.find((node: any) => node.root) || nodes[0];
    const others = nodes.filter((node: any) => node !== root);
    return nodes.map((node: any) => {
        if (node === root) return { ...node, x: 385, y: 255 };
        const index = others.indexOf(node);
        const angle = (index / Math.max(1, others.length)) * Math.PI * 2 - Math.PI / 2;
        const entityOffset = node.kind === 'entity' ? 35 : 0;
        return { ...node, x: 385 + Math.cos(angle) * (245 + entityOffset), y: 255 + Math.sin(angle) * (175 + entityOffset * .5) };
    });
});
const positionedEdges = computed(() => (data.value?.edges || []).map((edge: any) => ({
    ...edge,
    sourceNode: positionedNodes.value.find((node: any) => node.id === edge.source) || { x: 385, y: 255 },
    targetNode: positionedNodes.value.find((node: any) => node.id === edge.target) || { x: 385, y: 255 },
})));
function short(value: string) { return (value || '?').length > 18 ? value.slice(0, 17) + '…' : value || '?'; }
function nodeLabel(id: string) { return short(data.value?.nodes?.find((node: any) => node.id === id)?.label || id); }
function edgeColor(edge: any) { return edge.rel_type?.match(/hostile|conflict|ex/i) ? 'var(--os-red)' : edge.rel_type?.match(/family|partner|romance|friend/i) ? 'var(--os-violet)' : 'var(--os-cyan)'; }
function openNode(node: any) {
    if (node.kind !== 'person' || node.root) return;
    emit('select', node.id);
    if (!hasListener()) void navigateTo('/omniscience-person?personId=' + encodeURIComponent(node.id));
}
function hasListener() { return !!getCurrentInstance()?.vnode.props?.onSelect; }
function focusEdge(edge: any) {
    const source = data.value?.nodes?.find((node: any) => node.id === edge.source);
    if (source && !source.root) openNode(source);
}
async function load() {
    if (!props.personId) { data.value = null; return; }
    loading.value = true; error.value = '';
    try { data.value = await api.get(`/omniscience/workspace/graph?personId=${encodeURIComponent(props.personId)}&depth=${depth.value}&limit=90`); }
    catch (cause) { error.value = omniscienceError(cause, 'Could not load graph.'); }
    finally { loading.value = false; }
}
watch([() => props.personId, depth], load, { immediate: true });
</script>

<style scoped>
.os-graph-depth { width: 90px; }
.os-network-layout { display: grid; grid-template-columns: minmax(0,1fr) 250px; gap: 12px; }
.os-network-canvas { position: relative; min-height: 460px; overflow: hidden; border: 1px solid var(--os-line); border-radius: 11px; background: radial-gradient(circle at center,rgba(95,211,255,.05),transparent 60%),rgba(2,6,12,.35); }
.os-network-canvas svg { width: 100%; height: 460px; color: var(--os-cyan); }
.os-network-node { cursor: pointer; }
.os-network-node circle { fill: #111d2c; stroke: var(--os-cyan); stroke-width: 1.3; transition: fill .12s; }
.os-network-node.root circle { fill: rgba(151,113,255,.22); stroke: var(--os-violet); stroke-width: 2; }
.os-network-node.entity circle { fill: #1c1a24; stroke: var(--os-amber); stroke-dasharray: 3 2; }
.os-network-node:hover circle { fill: rgba(95,211,255,.22); }
.os-network-label { fill: var(--os-ink); font: 700 10px var(--os-mono); pointer-events: none; }
.os-network-sub { fill: var(--os-muted); font: 700 7px var(--os-mono); pointer-events: none; }
.os-network-edges { max-height: 460px; overflow-y: auto; padding-right: 3px; }
.os-network-edge { display: flex; align-items: center; gap: 7px; width: 100%; padding: 8px; margin-bottom: 5px; border: 1px solid var(--os-line); border-radius: 7px; background: rgba(255,255,255,.018); color: inherit; cursor: pointer; text-align: left; }
.os-network-edge > span { flex: 1; min-width: 0; }
.os-network-edge strong, .os-network-edge small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.os-network-edge strong { color: var(--os-ink-dim); font-size: 10px; }
.os-network-edge small { color: var(--os-muted); font-size: 9px; }
.os-network-edge b { color: var(--os-cyan); font: 700 10px var(--os-mono); }
.os-network-empty { position: absolute; inset: 0; display: grid; place-items: center; color: var(--os-faint); font-size: 12px; pointer-events: none; }
@media (max-width: 850px) { .os-network-layout { grid-template-columns: 1fr; } .os-network-edges { max-height: 250px; } }
</style>
