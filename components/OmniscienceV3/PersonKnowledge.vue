<template>
    <div data-testid="person-knowledge">
        <div class="omni-row head">
            <template v-if="p">
                <span v-if="p.minorRestricted" class="omni-chip warn" title="Routine patterns, inferences and identity facts are not kept for someone who is, or may be, under 18">under 18 or may be: restricted facts are not kept</span>
                <span v-if="p.backlogPending" class="omni-chip info">more messages waiting to be read</span>
                <span class="omni-muted">{{ omniCount(p.coveredMessages) }} messages read · last read <OmniscienceV3Time :ms="p.lastExtractMs" mode="age" /> · prompt {{ p.promptVersion }}</span>
            </template>
            <span class="grow"></span>
            <button v-if="canAnalyse" class="omni-btn sm" type="button" :disabled="busy !== null" data-testid="deduce-now" @click="deduceNow()">Read their messages again now</button>
        </div>

        <OmniscienceV3Panel title="What is known" flush :loading="profile.loading.value" :error="profile.error.value" :has-data="!!p" :empty="!!p && !p.categories.length"
                            empty-title="Nothing known yet" empty-text="Facts appear here once their messages have been read. Only people you track are read continuously." what="This person's facts" @retry="profile.refresh()">
            <template v-if="p">
                <section v-for="c in p.categories" :key="c.category" class="category">
                    <h4 class="omni-h4">{{ omniHumanise(c.category) }}</h4>
                    <table class="omni-table compact">
                        <thead><tr><th>What</th><th>Value</th><th>Status</th><th class="num">Confidence</th><th>When</th><th>How we know</th></tr></thead>
                        <tbody>
                            <tr v-for="f in c.facts" :key="f.assertionId" class="clickable" :class="{ past: isPast(f) }" :data-testid="`fact-${f.assertionId}`" @click="openFact = f.assertionId">
                                <td>{{ f.attributeTitle }}</td>
                                <td>{{ f.polarity === 'negated' ? 'not ' : '' }}{{ f.value }}</td>
                                <td><span class="omni-chip sm" :class="factTone(f.status)" :title="factStatusHelp(f.status)">{{ f.status }}</span></td>
                                <td class="num">{{ omniPercent(f.probability) }}</td>
                                <td class="omni-muted">{{ factValidity(f, month) || '—' }}</td>
                                <td class="omni-muted">{{ sourceKindLabel(f.sourceKind) }}</td>
                            </tr>
                        </tbody>
                    </table>
                </section>
            </template>
        </OmniscienceV3Panel>

        <OmniscienceV3PersonLookBack ref="lookBack" :person-id="personId" @open="openFact = $event" />

        <div class="omni-grid two">
            <OmniscienceV3Panel title="Worked out, not stated" flush :loading="profile.loading.value" :error="profile.error.value" :has-data="!!p" :empty="!!p && !p.inferences.length"
                                empty-title="No inferences" :empty-text="p?.minorRestricted ? 'Nothing is inferred about someone who is, or may be, under 18.' : 'An inference is a conclusion drawn from stated facts. It is always labelled as one.'">
                <ul v-if="p" class="plain">
                    <li v-for="f in p.inferences" :key="f.assertionId" class="clickable" @click="openFact = f.assertionId">
                        <span>{{ f.attributeTitle }}: <strong>{{ f.value }}</strong></span>
                        <span class="omni-chip sm warn">inferred</span>
                        <span class="omni-muted">{{ omniPercent(f.probability) }}</span>
                    </li>
                </ul>
            </OmniscienceV3Panel>
            <OmniscienceV3Panel title="Open guesses" flush :loading="hypotheses.loading.value" :error="hypotheses.error.value" :has-data="!!hypotheses.data.value"
                                :empty="!!hypotheses.data.value && !hypotheses.data.value.length" empty-title="No open guesses"
                                empty-text="A guess is something that may be true and is being watched for evidence either way." @retry="hypotheses.refresh()">
                <ul v-if="hypotheses.data.value" class="plain">
                    <li v-for="h in hypotheses.data.value" :key="h.hypothesisId">
                        <span>{{ h.statement }}</span>
                        <span class="omni-chip sm" :class="h.status === 'open' ? 'info' : ''">{{ h.status }}</span>
                        <span class="omni-muted">{{ omniPercent(h.probability) }} · until <OmniscienceV3Time :ms="h.expiresAtMs" mode="absolute" /></span>
                    </li>
                </ul>
            </OmniscienceV3Panel>
        </div>

        <div class="omni-grid two">
            <OmniscienceV3Panel title="Names people use for them" flush :loading="aliases.loading.value" :error="aliases.error.value" :has-data="!!aliases.data.value"
                                :empty="!!aliases.data.value && !aliases.data.value.length" empty-title="No other names found" @retry="aliases.refresh()">
                <table v-if="aliases.data.value" class="omni-table compact" data-testid="aliases-table">
                    <thead><tr><th>Name</th><th>Kind</th><th class="num">Used</th><th>Status</th><th v-if="canReview"></th></tr></thead>
                    <tbody>
                        <tr v-for="a in aliases.data.value" :key="a.aliasId">
                            <td><strong>{{ a.alias }}</strong><span v-if="a.commonWord" class="omni-chip sm warn" title="Also an ordinary word, so it never triggers an alert on its own">common word</span></td>
                            <td class="omni-muted">{{ omniHumanise(a.nameKind) }}<template v-if="a.scopeId"> · in <OmniscienceV3SelectionItem :kind="a.scopeKind === 'guild' ? 'Guild' : 'Conversation'" :item="{ id: a.scopeId! }" /></template></td>
                            <td class="num">{{ a.usages }} by {{ a.speakers }}</td>
                            <td><span class="omni-chip sm" :class="factTone(a.status)">{{ a.status }}</span></td>
                            <td v-if="canReview" class="actions">
                                <template v-if="a.status !== 'confirmed' && a.status !== 'rejected'">
                                    <button class="omni-btn ghost sm" type="button" :disabled="busy !== null" title="Yes, that is them" @click="reviewAlias(a, 'confirm')">✓</button>
                                    <button class="omni-btn ghost sm" type="button" :disabled="busy !== null" title="No, that is not them" @click="reviewAlias(a, 'reject')">✕</button>
                                </template>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </OmniscienceV3Panel>
            <OmniscienceV3Panel title="People, places and things they mention" flush :loading="entities.loading.value" :error="entities.error.value" :has-data="!!entities.data.value"
                                :empty="!!entities.data.value && !entities.data.value.length" empty-title="Nothing recorded" @retry="entities.refresh()">
                <table v-if="entities.data.value" class="omni-table compact">
                    <thead><tr><th>Name</th><th>Kind</th><th class="num">Mentions</th><th class="num">Last</th></tr></thead>
                    <tbody>
                        <tr v-for="e in entities.data.value" :key="e.entityId"><td>{{ e.name }}</td><td class="omni-muted">{{ omniHumanise(e.kind) }}</td>
                            <td class="num">{{ omniCount(e.mentions) }}</td><td class="num"><OmniscienceV3Time :ms="e.lastEvidenceMs" mode="age" /></td></tr>
                    </tbody>
                </table>
            </OmniscienceV3Panel>
        </div>

        <OmniscienceV3Panel title="Age" :loading="age.loading.value" :error="age.error.value" :has-data="!!age.data.value" what="The age band" @retry="age.refresh()">
            <template v-if="age.data.value">
                <div class="omni-row" data-testid="age-band">
                    <span class="omni-chip" :class="age.data.value.restricted ? 'warn' : 'ok'">{{ omniHumanise(age.data.value.band) }}</span>
                    <span v-if="age.data.value.markedMinorByKlives" class="omni-chip warn">you marked them as under 18</span>
                    <span class="omni-muted">{{ age.data.value.restricted
                        ? 'Treated as under 18: no replica, no face labels, no alert about them, no routine patterns or identity facts.'
                        : 'Nothing says they are under 18.' }}</span>
                </div>
                <table v-if="age.data.value.statements.length" class="omni-table compact statements">
                    <thead><tr><th>Said</th><th>Kind</th><th>Status</th><th>When</th><th v-if="canReview"></th></tr></thead>
                    <tbody>
                        <tr v-for="s in age.data.value.statements" :key="s.evidenceId">
                            <td><q v-if="s.quote">{{ s.quote }}</q><span v-else class="omni-muted">(message no longer readable)</span></td>
                            <td class="omni-muted">{{ omniHumanise(s.kind) }} · {{ sourceKindLabel(s.sourceKind) }}</td>
                            <td><span class="omni-chip sm" :class="factTone(s.status)">{{ s.status }}</span></td>
                            <td><OmniscienceV3Time :ms="s.assertedAtMs" mode="absolute" /></td>
                            <td v-if="canReview" class="actions">
                                <button class="omni-btn ghost sm" type="button" :disabled="busy !== null" title="This statement is about their age" @click="reviewAge(s.evidenceId, 'confirm')">✓</button>
                                <button class="omni-btn ghost sm" type="button" :disabled="busy !== null" title="This is not about their age (a joke, a quote, someone else)" @click="reviewAge(s.evidenceId, 'reject')">✕</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <p v-else class="omni-muted">No statement about their age has been found.</p>
            </template>
        </OmniscienceV3Panel>

        <OmniscienceV3FactDrawer :assertion-id="openFact" :can-review="canReview" @close="openFact = null" @changed="refresh()" />
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { omniGet, omniPost } from '~/scripts/omniscience/api';
import type { AgeBandDto, AliasDto, EntityDto, HypothesisDto, KnowledgeFactDto, KnowledgeJobStartedDto, KnowledgeProfileDto, ReadModelDto } from '~/scripts/omniscience/contracts';
import { omniCount, omniPercent } from '~/scripts/omniscience/format';
import { omniHumanise } from '~/scripts/omniscience/findings';
import { factStatusHelp, factTone, factValidity, sourceKindLabel } from '~/scripts/omniscience/knowledge';
import { useOmniAction, useOmniResource, useOmniTime } from '~/composables/useOmniscienceV3';

/**
 * What the knowledge layer holds about one person: stated facts by category with their status and
 * confidence, what was only inferred (always labelled), open guesses, the names people use for
 * them, what they mention, and the age band that switches the minor guard on.
 */
const props = defineProps<{ personId: string; canReview: boolean; canAnalyse: boolean }>();

const { busy, run } = useOmniAction();
const { at, now } = useOmniTime();
const openFact = ref<string | null>(null);
const lookBack = ref<{ refresh(): void } | null>(null);

const profile = useOmniResource(async signal => {
    const rm = await omniGet<ReadModelDto>('knowledge/profile', { person: props.personId }, signal);
    return rm.body as KnowledgeProfileDto;
});
const p = computed(() => profile.data.value);
const hypotheses = useOmniResource(signal => omniGet<HypothesisDto[]>('knowledge/hypotheses', { person: props.personId }, signal));
const aliases = useOmniResource(signal => omniGet<AliasDto[]>('knowledge/aliases', { person: props.personId }, signal));
const entities = useOmniResource(signal => omniGet<EntityDto[]>('knowledge/entities', { person: props.personId }, signal));
const age = useOmniResource(signal => omniGet<AgeBandDto>('knowledge/age', { person: props.personId }, signal));

function refresh() {
    void profile.refresh(); void hypotheses.refresh(); void aliases.refresh(); void entities.refresh(); void age.refresh();
    lookBack.value?.refresh();
}
defineExpose({ refresh });

function month(ms: number): string { return at(ms).slice(0, 7); }
function isPast(f: KnowledgeFactDto): boolean {
    const ended = f.validToLatestMs ?? f.validToEarliestMs;
    return ended !== null && ended !== undefined && ended <= now.value;
}

async function deduceNow() {
    await run('deduce', () => omniPost<KnowledgeJobStartedDto>('knowledge/deduction/run', { personId: props.personId }),
        r => `Reading their messages now (job ${r.jobId}). New facts appear here when it finishes.`);
}

async function reviewAlias(a: AliasDto, verdict: 'confirm' | 'reject') {
    const result = await run('alias', () => omniPost<{ aliasId: string; status: string }>('knowledge/aliases/review', { aliasId: a.aliasId, verdict }),
        r => (r.status === 'confirmed' ? `“${a.alias}” is one of their names.` : `“${a.alias}” is not one of their names.`));
    if (result) void aliases.refresh();
}

async function reviewAge(evidenceId: string, verdict: 'confirm' | 'reject') {
    const result = await run('age', () => omniPost<KnowledgeJobStartedDto>('knowledge/age/review', { evidenceId, verdict }), r => r.detail ?? 'Recorded.');
    if (result) { void age.refresh(); void profile.refresh(); }
}
</script>

<style scoped>
.head { margin-bottom: 10px; gap: 8px; }
.head .grow { flex: 1; }
.category { padding: 0 0 6px; }
.omni-h4 { margin: 10px 12px 4px; font-size: 11px; letter-spacing: 1.2px; text-transform: uppercase; color: var(--omni-muted); }
tr.past td { opacity: 0.6; }
.plain { list-style: none; margin: 0; padding: 4px 12px; }
.plain li { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; padding: 6px 0; border-bottom: 1px solid var(--omni-line); font-size: 13px; }
.plain li.clickable { cursor: pointer; }
td.actions { white-space: nowrap; text-align: right; }
.statements { margin-top: 10px; }
.omni-grid.two { margin-top: var(--omni-gutter); margin-bottom: var(--omni-gutter); }
q { font-style: italic; }
</style>
