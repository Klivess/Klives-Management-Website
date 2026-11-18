<template>
    <section class="omx-card" data-testid="omx-fidelity">
        <div class="omx-card-head">
            <h2>How close the replica gets</h2><span class="omx-sub">replies it wrote, set against what they really said</span>
            <div class="omx-acts"><button class="omx-btn sm" type="button" :disabled="!!omx.busy.value" @click="run()"><OmniscienceIcon name="play" /> Measure now</button></div>
        </div>
        <div v-if="runs.length">
            <div v-for="r in runs" :key="r.run_id" class="omx-msg">
                <div class="omx-msg-head">
                    <strong class="omx-num" style="font-size: 15px">{{ r.overall_fidelity == null ? 'not scored' : omxPct(r.overall_fidelity) }}</strong>
                    <span>{{ r.method || 'legacy' }} · version {{ r.replica_version }}</span>
                    <span>{{ r.pairs_tested }} of {{ r.pairs_attempted || r.pairs_tested }} replies scored<template v-if="r.pairs_failed">, {{ r.pairs_failed }} failed</template></span>
                    <span>meaning {{ omxPct(r.avg_embedding_similarity) }} · style {{ omxPct(r.avg_style_score) }}</span>
                    <span>{{ omxDateTime(r.ran_at) }}</span>
                </div>
                <details v-if="(r.worst_misses ?? []).length" style="margin-top: 6px">
                    <summary class="omx-dim" style="cursor: pointer">Where it was furthest off</summary>
                    <div v-for="(m, i) in r.worst_misses" :key="i" style="margin-top: 8px; padding-left: 10px; border-left: 2px solid var(--omx-line-strong)">
                        <div class="omx-dim">They were told: {{ m.stimulus }}</div>
                        <div>Really said: {{ m.real }}</div>
                        <div style="color: var(--omx-accent)">Replica (a simulation): {{ m.predicted }}</div>
                    </div>
                </details>
            </div>
        </div>
        <div v-else class="omx-empty"><strong>Not measured yet</strong>Train the replica above, then measure it.</div>
        <div class="omx-card-foot">An experimental comparison of retrieval and style on replies it has not seen, not a calibrated accuracy. Failures stay listed.</div>
    </section>
</template>

<script setup lang="ts">
import { omxDateTime, omxPct } from '~/scripts/omniscienceConsole';

/** Benchmark runs of a person's replica. */
const props = defineProps<{ personId: string }>();
const omx = useOmx();
const runs = ref<any[]>([]);

async function load() {
    try { runs.value = (await omx.api.get('/omniscience/replica/fidelity?personId=' + encodeURIComponent(props.personId)))?.runs ?? []; }
    catch { runs.value = []; }
}
async function run() {
    if (await omx.act('fidelity', () => omx.api.post('/omniscience/replica/fidelity/run', { personId: props.personId }), 'Measurement queued. It shows here when it is done.')) setTimeout(load, 4000);
}
watch(() => props.personId, load, { immediate: true });
</script>
