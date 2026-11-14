<template>
    <OmniscienceV3Shell>
        <div class="ot-pagehead">
            <div>
                <h1>Quality Lab</h1>
                <p class="subtitle">How often the facts are right, measured two ways: against your own confirm and reject decisions, and against a made-up set of conversations where the true facts are known. A prompt that does worse than the last one is blocked before it reads anything.</p>
            </div>
            <div class="ot-actions">
                <button class="ot-btn ghost" type="button" :disabled="lab.refreshing.value" @click="lab.refresh()">Refresh</button>
                <template v-if="canRun">
                    <button class="ot-btn" type="button" :disabled="busy !== null" data-testid="quality-run-lab" @click="start('lab')">Measure against my decisions</button>
                    <button class="ot-btn" type="button" :disabled="busy !== null" data-testid="quality-run-planted" @click="start('planted')">Run the planted-fact test</button>
                </template>
            </div>
        </div>

        <OmniscienceV3ErrorBlock v-if="lab.error.value && !q" :error="lab.error.value" what="The Quality Lab" @retry="lab.refresh()" />
        <template v-else-if="q">
            <div class="ot-banner" :class="gateTone" role="status" data-testid="quality-gate">
                <span class="glyph" aria-hidden="true">{{ q.gate?.decision === 'block' ? '⛔' : q.gate ? '✓' : 'ℹ' }}</span>
                <div>
                    <strong>{{ gateTitle }}</strong>
                    <span class="muted">Prompt in use: {{ q.promptVersion }}<template v-if="q.gate"> · compared with {{ q.gate.baseline ?? 'nothing earlier' }} · decided <OmniscienceV3Time :ms="q.gate.decidedAtMs" mode="age" /></template></span>
                    <ul v-if="q.gate?.reasons.length" class="reasons"><li v-for="(r, i) in q.gate.reasons" :key="i">{{ r }}</li></ul>
                </div>
            </div>

            <div class="ot-grid two">
                <OmniscienceV3Panel title="Against your decisions" flush :has-data="true" :empty="!q.gold.length" empty-title="Not measured yet"
                                    empty-text="Each fact you confirm, reject or correct is a known answer. Once there are enough, this shows how often the engine agreed with you.">
                    <OmniscienceV3QualityTable :metrics="q.gold" testid="quality-gold" />
                </OmniscienceV3Panel>
                <OmniscienceV3Panel title="Against planted facts" flush :has-data="true" :empty="!q.planted.length" empty-title="Not run yet"
                                    empty-text="A made-up set of conversations with known facts, jokes, quotes and traps is read by the real model in a scratch store. Nothing real is touched.">
                    <OmniscienceV3QualityTable :metrics="q.planted" testid="quality-planted" />
                </OmniscienceV3Panel>
            </div>
            <p class="omni-muted asof">Measured <OmniscienceV3Time :ms="q.asOfMs" />. A range in brackets is where the true value most likely lies given how few cases there are: a wide range means too few to say.</p>
        </template>
        <div v-else class="ot-skelrows" aria-busy="true"><div v-for="n in 6" :key="n" class="ot-skel"></div></div>
    </OmniscienceV3Shell>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { OMNI_BASE, omniGet, omniPost } from '~/scripts/omniscience/api';
import type { KnowledgeJobStartedDto, QualityLabDto, ReadModelDto } from '~/scripts/omniscience/contracts';
import { useOmniAction, useOmniResource } from '~/composables/useOmniscienceV3';
import { useAccess } from '~/composables/useAccess';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Omniscience v3 · Quality Lab' });

const { can } = useAccess();
const canRun = computed(() => can('omniscience.analysis.run'));
const { busy, run } = useOmniAction();

const lab = useOmniResource(async signal => {
    const rm = await omniGet<ReadModelDto>('knowledge/quality', {}, signal);
    return rm.body as QualityLabDto;
}, { pollMs: 60_000 });
const q = computed(() => lab.data.value);

const gateTone = computed(() => (q.value?.gate?.decision === 'block' ? '' : q.value?.gate ? 'ok' : 'info'));
const gateTitle = computed(() => {
    const gate = q.value?.gate;
    if (!gate) return 'This prompt has not been compared with an earlier one yet, so nothing is blocked.';
    return gate.decision === 'block' ? 'This prompt is blocked: it does worse than the one before it. Nothing is read with it.' : 'This prompt passed the comparison with the one before it.';
});

async function start(kind: 'lab' | 'planted') {
    await run(`quality-${kind}`, () => omniPost<KnowledgeJobStartedDto>('knowledge/quality/run', { kind }),
        r => `Started (job ${r.jobId}). ${r.detail ?? 'The numbers here update when it finishes.'} Follow it under ${OMNI_BASE}/jobs.`);
}
</script>

<style scoped>
.ot-grid.two { margin-top: var(--ot-gutter); }
.ot-banner .muted { display: block; color: var(--ot-text-2); }
.reasons { margin: 6px 0 0; padding-left: 18px; font-size: 12.5px; }
.asof { margin: 10px 0 0; font-size: 12px; }
</style>
