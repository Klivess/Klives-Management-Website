<template>
    <div data-testid="person-audit">
        <OmniscienceV3Panel title="Reading runs" flush :loading="runs.loading.value" :error="runs.error.value" :has-data="runs.items.value.length > 0" :empty="!runs.items.value.length"
                            empty-title="Their messages have not been read yet" empty-text="Each run reads a slice of their conversations twice, checks every claim against the messages, and keeps what holds." @retry="runs.reload()">
            <table class="omni-table compact" data-testid="runs-table">
                <thead><tr><th>Started</th><th>Outcome</th><th class="num">Messages</th><th class="num">Claims found</th><th class="num">Agreed</th><th class="num">Kept</th><th class="num">Rejected</th><th class="num">Model calls</th><th>Prompt</th></tr></thead>
                <tbody>
                    <tr v-for="r in runs.items.value" :key="r.runId" class="clickable" :class="{ selected: filters.run === r.runId }" @click="filters.run = filters.run === r.runId ? '' : r.runId">
                        <td><OmniscienceV3Time :ms="r.startedAtMs" mode="absolute" /></td>
                        <td><span class="omni-chip sm" :class="r.outcome === 'ok' ? 'ok' : r.outcome === 'running' ? 'info' : 'warn'">{{ omniHumanise(r.outcome) }}</span></td>
                        <td class="num">{{ omniCount(r.messages) }}</td>
                        <td class="num">{{ omniCount(r.claimsRaw) }}</td>
                        <td class="num">{{ omniCount(r.claimsAgreed) }}</td>
                        <td class="num">{{ omniCount(r.claimsVerified) }}</td>
                        <td class="num">{{ omniCount(r.claimsRejected) }}</td>
                        <td class="num">{{ r.llmCalls }}</td>
                        <td class="omni-muted">{{ r.promptVersion }}</td>
                    </tr>
                </tbody>
            </table>
            <template v-if="runs.hasMore.value" #footer>
                <button class="omni-btn sm" type="button" :disabled="runs.loadingMore.value" @click="runs.loadMore()">{{ runs.loadingMore.value ? 'Loading…' : 'Load older runs' }}</button>
            </template>
        </OmniscienceV3Panel>

        <div class="omni-filterbar">
            <div class="omni-segment" role="group" aria-label="Claim verdict">
                <button v-for="v in VERDICTS" :key="v.value" type="button" :aria-pressed="filters.verdict === v.value" @click="filters.verdict = v.value">{{ v.label }}</button>
            </div>
            <span v-if="filters.run" class="omni-chip info">one run <button class="x" type="button" aria-label="Show every run" @click="filters.run = ''">✕</button></span>
            <span class="summary"><b>{{ claims.items.value.length }}</b> shown</span>
        </div>
        <OmniscienceV3Panel title="Claims" flush :loading="claims.loading.value" :error="claims.error.value" :has-data="claims.items.value.length > 0" :empty="!claims.items.value.length"
                            empty-title="No claims here" empty-text="A claim is one thing a reading said about them. Rejected claims keep the reason and never their value when it was private." @retry="claims.reload()">
            <table class="omni-table compact" data-testid="claims-table">
                <thead><tr><th>Recorded</th><th>What</th><th>Value</th><th>Verdict</th><th>Why</th><th class="num">Confidence</th><th>How they agreed</th></tr></thead>
                <tbody>
                    <tr v-for="c in claims.items.value" :key="c.claimId">
                        <td><OmniscienceV3Time :ms="c.recordedAtMs" mode="absolute" /></td>
                        <td>{{ omniHumanise(c.attribute) }}</td>
                        <td>{{ c.value ?? '(not kept)' }}</td>
                        <td><span class="omni-chip sm" :class="c.verdict === 'verified' ? 'ok' : 'bad'">{{ c.verdict }}</span></td>
                        <td class="omni-muted">{{ c.reason ? omniHumanise(c.reason) : c.critic ? `critic: ${c.critic}` : '—' }}</td>
                        <td class="num">{{ omniPercent(c.probability) }}</td>
                        <td class="omni-muted">{{ omniHumanise(c.agreement || 'unknown') }}</td>
                    </tr>
                </tbody>
            </table>
            <template v-if="claims.hasMore.value" #footer>
                <button class="omni-btn sm" type="button" :disabled="claims.loadingMore.value" @click="claims.loadMore()">{{ claims.loadingMore.value ? 'Loading…' : 'Load older claims' }}</button>
            </template>
        </OmniscienceV3Panel>

        <OmniscienceV3Panel title="Merges" flush :loading="merges.loading.value" :error="merges.error.value" :has-data="!!merges.data.value" :empty="!!merges.data.value && !merges.data.value.length"
                            empty-title="Never merged" empty-text="When two people turn out to be one, they are merged. A merge can always be undone." @retry="merges.refresh()">
            <table v-if="merges.data.value" class="omni-table compact" data-testid="merges-table">
                <thead><tr><th>When</th><th>Merged</th><th>Into</th><th>By</th><th>Why</th><th v-if="canMerge"></th></tr></thead>
                <tbody>
                    <tr v-for="m in merges.data.value" :key="m.mergeId" :class="{ undone: m.undoneAtMs }">
                        <td><OmniscienceV3Time :ms="m.mergedAtMs" mode="absolute" /></td>
                        <td><NuxtLink :to="omniPersonLink(m.fromPersonId)">{{ m.fromName || name(m.fromPersonId) }}</NuxtLink></td>
                        <td><NuxtLink :to="omniPersonLink(m.intoPersonId)">{{ m.intoName || name(m.intoPersonId) }}</NuxtLink></td>
                        <td>{{ m.actor }}</td>
                        <td class="omni-muted">{{ m.reason ?? '—' }}<span v-if="m.undoneAtMs"> · undone <OmniscienceV3Time :ms="m.undoneAtMs" mode="age" /></span></td>
                        <td v-if="canMerge" class="actions">
                            <button v-if="!m.undoneAtMs" class="omni-btn ghost sm" type="button" :disabled="busy !== null" @click="undo(m.mergeId)">Undo</button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </OmniscienceV3Panel>
    </div>
</template>

<script setup lang="ts">
import { omniGet, omniPost } from '~/scripts/omniscience/api';
import type { ClaimDto, ClaimPageDto, ExtractionRunDto, ExtractionRunPageDto, MergeRowDto } from '~/scripts/omniscience/contracts';
import { omniCount, omniPercent } from '~/scripts/omniscience/format';
import { omniHumanise } from '~/scripts/omniscience/findings';
import { omniPersonLink, useOmniAction, useOmniDebounced, useOmniNames, useOmniPaged, useOmniResource } from '~/composables/useOmniscienceV3';
import { useOmniUrlState } from '~/composables/useOmniscienceV3';
import { watchEffect } from 'vue';

/**
 * How a person's facts came to be: every reading run with what it found and threw away, the
 * claims themselves with the reason each was rejected, and the merges that made them one person.
 */
const props = defineProps<{ personId: string; canMerge: boolean }>();
const emit = defineEmits<{ changed: [] }>();

const VERDICTS = [{ value: '', label: 'All' }, { value: 'verified', label: 'Kept' }, { value: 'rejected', label: 'Rejected' }];
const { busy, run } = useOmniAction();
const { state: filters } = useOmniUrlState({ verdict: '', run: '' });

const runs = useOmniPaged<ExtractionRunDto, string>((cursor, signal) => omniGet<ExtractionRunPageDto>('knowledge/runs', { person: props.personId, cursor, limit: 25 }, signal));
const claims = useOmniPaged<ClaimDto, string>((cursor, signal) =>
    omniGet<ClaimPageDto>('knowledge/claims', { person: props.personId, verdict: filters.verdict, run: filters.run, cursor, limit: 50 }, signal));
useOmniDebounced(() => `${filters.verdict}|${filters.run}`, () => { void claims.reload(); }, 50);
const merges = useOmniResource(signal => omniGet<MergeRowDto[]>('knowledge/persons/merges', { person: props.personId }, signal));
// The two sides of a merge by name: each person's own, sent with the row (an older server sends none, and the names are asked for).
const { name, want } = useOmniNames();
watchEffect(() => want((merges.data.value ?? []).flatMap(m => [m.fromName ? null : m.fromPersonId, m.intoName ? null : m.intoPersonId])));

function refresh() { void runs.reload(); void claims.reload(); void merges.refresh(); }
defineExpose({ refresh });

async function undo(mergeId: number) {
    if (!window.confirm('Undo this merge? The two become separate people again, and their facts are worked out again for each.')) return;
    const result = await run('unmerge', () => omniPost<{ mergeId: number; undone: boolean }>('knowledge/persons/unmerge', { mergeId }), () => 'The merge was undone.');
    if (result) { void merges.refresh(); emit('changed'); }
}
</script>

<style scoped>
.omni-filterbar { margin-top: var(--omni-gutter); }
.omni-chip .x { background: none; border: 0; color: inherit; cursor: pointer; padding: 0 0 0 4px; }
tr.undone td { opacity: 0.6; }
td.actions { white-space: nowrap; text-align: right; }
</style>
