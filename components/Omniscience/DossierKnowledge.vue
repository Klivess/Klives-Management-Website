<template>
    <div class="omx-stack" data-testid="omx-knowledge">
        <section class="omx-card">
            <form class="omx-toolbar" @submit.prevent="add()">
                <input v-model="draft" class="omx-input omx-grow" style="flex-basis: 260px" maxlength="500" placeholder="Something you know about them, e.g. works at a hospital in Manchester" aria-label="A fact you know" data-testid="omx-fact-new" />
                <select v-model="draftCategory" class="omx-select" aria-label="Category"><option v-for="c in OMX_FACT_CATEGORIES" :key="c" :value="c">{{ c }}</option></select>
                <button class="omx-btn primary" type="submit" :disabled="!draft.trim() || !!omx.busy.value"><OmniscienceIcon name="plus" /> Add what you know</button>
            </form>
            <div class="omx-toolbar">
                <input v-model="filter" class="omx-input" style="flex: 1 1 200px; max-width: 320px" type="search" placeholder="Filter facts" aria-label="Filter facts" />
                <div class="omx-seg" role="group" aria-label="Category">
                    <button type="button" :aria-pressed="category === ''" @click="category = ''">All</button>
                    <button v-for="c in categories" :key="c.name" type="button" :aria-pressed="category === c.name" @click="category = c.name">{{ c.name }} {{ c.count }}</button>
                </div>
                <span class="omx-grow"></span>
                <label class="omx-rowflex omx-dim" style="font-size: 12px"><input v-model="showOff" class="omx-check" type="checkbox" /> Show withdrawn ({{ offCount }})</label>
            </div>
            <div v-if="shown.length" data-testid="omx-facts">
                <div v-for="fact in shown" :key="fact.fact_id" class="omx-fact" :class="{ off: omxFactOff(fact.status) }">
                    <span class="omx-fact-conf" :class="{ low: (fact.confidence ?? 0) < 0.5 }">{{ Math.round((fact.confidence ?? 0) * 100) }}%</span>
                    <div>
                        <div class="omx-fact-text">{{ fact.fact }}</div>
                        <div class="omx-fact-meta">
                            {{ fact.source_context }} · {{ fact.extracted_by }}<template v-if="(fact.evidence_message_ids ?? []).length"> · {{ fact.evidence_message_ids.length }} message{{ fact.evidence_message_ids.length === 1 ? '' : 's' }} behind it</template>
                            <template v-if="fact.derivation"> · worked out: {{ omxDerivation(fact.derivation) }}</template>
                        </div>
                    </div>
                    <span class="omx-rowflex" style="flex-wrap: nowrap"><span class="omx-chip">{{ fact.category }}</span><span v-if="omxFactOff(fact.status)" class="omx-chip crit">{{ fact.status }}</span></span>
                </div>
            </div>
            <div v-else class="omx-empty"><strong>{{ facts.length ? 'No fact matches' : 'Nothing known yet' }}</strong>{{ facts.length ? 'Clear the filter to see them all.' : 'Run a deduction pass, or add what you know above.' }}</div>
        </section>

        <div class="omx-two">
            <section class="omx-card">
                <div class="omx-card-head"><h2>Not known yet</h2><span class="omx-sub">{{ openQuestions.length }} open</span></div>
                <ul v-if="openQuestions.length" class="omx-rows">
                    <li v-for="(q, i) in openQuestions" :key="i"><span class="omx-chip">{{ q.slot }}</span><span class="omx-row-main"><small class="wrap" style="color: var(--omx-ink-2)">{{ q.question }}</small></span></li>
                </ul>
                <div v-else class="omx-empty">Nothing is marked as missing.</div>
            </section>
            <section class="omx-card">
                <div class="omx-card-head"><h2>Guesses being watched</h2><span class="omx-sub">{{ hypotheses.length }}</span></div>
                <ul v-if="hypotheses.length" class="omx-rows">
                    <li v-for="(h, i) in hypotheses" :key="i">
                        <span class="omx-row-main"><small class="wrap" style="color: var(--omx-ink-2)">{{ h.statement }}</small><small>{{ (h.evidence_message_ids ?? []).length }} sightings</small></span>
                        <span class="omx-chip" :class="h.status === 'confirmed' ? 'ok' : h.status === 'refuted' ? 'crit' : 'info'">{{ h.status }}</span>
                    </li>
                </ul>
                <div v-else class="omx-empty">A guess is something that may be true and is watched for evidence either way.</div>
            </section>
        </div>
    </div>
</template>

<script setup lang="ts">
import { OMX_FACT_CATEGORIES, omxDerivation, omxFactOff } from '~/scripts/omniscienceConsole';

/** What is known about a person, with how sure each fact is and where it came from; and a way to add what Klives knows himself. */
const props = defineProps<{ personId: string; facts: any[]; openQuestions: any[]; hypotheses: any[] }>();
const emit = defineEmits<{ changed: [] }>();
const omx = useOmx();
const draft = ref('');
const draftCategory = ref('misc');
const filter = ref('');
const category = ref('');
const showOff = ref(false);

const offCount = computed(() => props.facts.filter(f => omxFactOff(f.status)).length);
const categories = computed(() => {
    const counts = new Map<string, number>();
    for (const fact of props.facts) if (showOff.value || !omxFactOff(fact.status)) counts.set(fact.category, (counts.get(fact.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
});
const shown = computed(() => {
    const needle = filter.value.trim().toLowerCase();
    return props.facts
        .filter(f => (showOff.value || !omxFactOff(f.status)) && (!category.value || f.category === category.value) && (!needle || String(f.fact).toLowerCase().includes(needle)))
        .sort((a, b) => String(a.category).localeCompare(String(b.category)) || (b.confidence ?? 0) - (a.confidence ?? 0));
});

async function add() {
    const observation = draft.value.trim();
    if (!observation) return;
    const ok = await omx.act('observe', () => omx.api.post('/omniscience/persons/observe', { personId: props.personId, observation, category: draftCategory.value }), 'Recorded as something you know');
    if (ok) { draft.value = ''; emit('changed'); }
}
</script>
