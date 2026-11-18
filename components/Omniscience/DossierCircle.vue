<template>
    <div class="omx-stack" data-testid="omx-circle">
        <section class="omx-card">
            <div class="omx-card-head">
                <h2>Their circle</h2><span class="omx-sub">{{ graph ? `${graph.nodes.length} people · ${graph.edges.length} links` : '' }}</span>
                <div class="omx-acts">
                    <div class="omx-seg" role="group" aria-label="How far out"><button type="button" :aria-pressed="depth === 1" @click="depth = 1">Direct</button><button type="button" :aria-pressed="depth === 2" @click="depth = 2">Friends of friends</button></div>
                </div>
            </div>
            <div class="omx-card-body">
                <div v-if="error" class="omx-error" role="alert"><span class="omx-grow">{{ error }}</span><button class="omx-btn sm" type="button" @click="load()">Try again</button></div>
                <div v-else-if="!graph" class="omx-skels" style="padding: 0"><div class="omx-skel" style="height: 180px"></div></div>
                <div v-else-if="placed.nodes.length > 1" class="omx-graph" data-testid="omx-graph">
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                        <line v-for="edge in placed.edges" :key="edge.key" :x1="edge.x1" :y1="edge.y1" :x2="edge.x2" :y2="edge.y2" :stroke="`rgba(159,143,255,${0.18 + edge.weight * 0.5})`" :stroke-width="0.25 + edge.weight * 0.5" vector-effect="non-scaling-stroke" />
                    </svg>
                    <button v-for="node in placed.nodes" :key="node.id" class="omx-node" :class="{ root: node.root }" type="button" :style="{ left: `${node.x}%`, top: `${node.y}%` }"
                            :title="`${node.label} · ${node.sub}`" @click="node.root ? null : (omx.peekId.value = node.id)">{{ node.label }}</button>
                </div>
                <div v-else class="omx-empty"><strong>No links recorded</strong>Relationships appear after the graph pass has read their conversations.</div>
            </div>
        </section>

        <div class="omx-three">
            <section class="omx-card">
                <div class="omx-card-head"><h2>Relationships</h2><span class="omx-sub">{{ relationships.length }}</span></div>
                <ul v-if="relationships.length" class="omx-rows">
                    <li v-for="(r, i) in relationships" :key="i">
                        <span class="omx-row-main"><strong>{{ r.related_display || r.related_person_id || '?' }}</strong><small>{{ r.rel_type }}</small></span>
                        <span class="omx-chip">{{ Math.round((r.confidence ?? 0) * 100) }}%</span>
                        <button v-if="r.related_person_id" class="omx-btn quiet sm icon" type="button" :aria-label="`Peek at ${r.related_display}`" @click="omx.peekId.value = r.related_person_id"><OmniscienceIcon name="go" /></button>
                    </li>
                </ul>
                <div v-else class="omx-empty">None recorded.</div>
            </section>
            <section class="omx-card">
                <div class="omx-card-head"><h2>Known as</h2><span class="omx-sub">{{ aliases.length }}</span></div>
                <ul v-if="aliases.length" class="omx-rows">
                    <li v-for="(a, i) in aliases" :key="i">
                        <span class="omx-row-main"><strong>{{ a.name }}</strong><small>{{ a.kind }} · used {{ a.uses }} times by {{ a.distinct_speakers }}</small></span>
                        <span class="omx-chip">{{ Math.round((a.confidence ?? 0) * 100) }}%</span>
                    </li>
                </ul>
                <div v-else class="omx-empty">No other name found.</div>
            </section>
            <section class="omx-card">
                <div class="omx-card-head"><h2>In their world</h2><span class="omx-sub">{{ entities.length }}</span></div>
                <div class="omx-card-body">
                    <div v-if="entities.length" class="omx-chips">
                        <span v-for="(e, i) in entities" :key="i" class="omx-chip" :title="e.descriptor || e.kind"><OmniscienceIcon :name="omxEntityIcon(e.kind)" style="width: 11px; height: 11px" /> {{ e.name }} · {{ e.mentions }}</span>
                    </div>
                    <p v-else class="omx-dim">No person, place or thing extracted yet.</p>
                </div>
            </section>
        </div>
    </div>
</template>

<script setup lang="ts">
import { omxEntityIcon, omxErrorText, omxPlaceGraph } from '~/scripts/omniscienceConsole';

/** Who a person is connected to, what else they are called, and the people, places and things they talk about. */
const props = defineProps<{ personId: string; name: string; relationships: any[]; entities: any[]; aliases: any[] }>();
const omx = useOmx();
const depth = ref(1);
const graph = ref<any>(null);
const error = ref('');

const placed = computed(() => (graph.value ? omxPlaceGraph(graph.value.nodes ?? [], graph.value.edges ?? [], props.personId) : { nodes: [], edges: [] }));

async function load() {
    graph.value = null; error.value = '';
    try { graph.value = await omx.api.get(`/omniscience/workspace/graph?personId=${encodeURIComponent(props.personId)}&depth=${depth.value}&limit=60`); }
    catch (cause) { error.value = omxErrorText(cause, 'The graph could not be read.'); }
}
watch(() => [props.personId, depth.value], load, { immediate: true });
</script>
