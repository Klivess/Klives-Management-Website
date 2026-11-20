<template>
    <OmniscienceV3Shell>
        <div class="omni-pagehead">
            <div>
                <h1>Review</h1>
                <p class="subtitle">What the engine could not settle on its own: facts that contradict each other, age statements, names, and accounts that may belong to one person. Your decision is final and it learns from it.</p>
            </div>
            <div class="omni-actions"><button class="omni-btn ghost" type="button" @click="refreshTab()">Refresh</button></div>
        </div>

        <div class="omni-segment tabs" role="tablist" aria-label="Review">
            <button v-for="t in TABS" :key="t.value" type="button" role="tab" :aria-selected="view.tab === t.value" :aria-pressed="view.tab === t.value"
                    :data-testid="`review-tab-${t.value}`" @click="view.tab = t.value">{{ t.label }}</button>
        </div>

        <!-- ── the queue ────────────────────────────────────────────────────── -->
        <template v-if="view.tab === 'queue'">
            <div class="omni-filterbar">
                <div class="omni-segment" role="group" aria-label="State">
                    <button v-for="s in STATES" :key="s" type="button" :aria-pressed="view.state === s" @click="view.state = s">{{ omniHumanise(s) }}</button>
                </div>
                <select v-model="view.kind" class="omni-select auto" aria-label="Kind">
                    <option value="">All kinds</option>
                    <option v-for="k in REVIEW_KINDS" :key="k.value" :value="k.value">{{ k.label }}</option>
                </select>
                <OmniscienceV3Pick kind="person" label="About" any="anyone" :multiple="false" :model-value="view.person ? [view.person] : []" testid="review-person" @update:model-value="ids => (view.person = ids[0] ?? '')" />
                <div class="omni-segment" role="group" aria-label="Order">
                    <button type="button" :aria-pressed="view.sort === 'priority'" @click="view.sort = 'priority'">Most important first</button>
                    <button type="button" :aria-pressed="view.sort === 'age'" @click="view.sort = 'age'">Oldest first</button>
                </div>
                <span class="summary"><b>{{ queue.items.value.length }}</b> shown</span>
            </div>
            <OmniscienceV3Panel title="To review" flush :loading="queue.loading.value" :error="queue.error.value" :has-data="queue.items.value.length > 0" :empty="!queue.items.value.length"
                                :empty-kind="view.state === 'open' && !view.kind && !view.person ? 'ok' : 'filtered'" :empty-title="view.state === 'open' ? 'Nothing is waiting for you' : 'Nothing here'" @retry="queue.reload()">
                <ul class="items" data-testid="review-list">
                    <li v-for="item in queue.items.value" :key="item.itemId" :class="{ open: expanded === item.itemId }">
                        <div class="row">
                            <span class="omni-chip sm" :title="kindHelp(item.kind)">{{ reviewKindLabel(item.kind) }}</span>
                            <button class="title" type="button" :aria-expanded="expanded === item.itemId" @click="expanded = expanded === item.itemId ? '' : item.itemId">{{ item.title }}</button>
                            <NuxtLink v-if="item.subjectId" class="omni-muted" :to="subjectLink(item)">{{ name(item.subjectId) }}</NuxtLink>
                            <span class="omni-muted"><OmniscienceV3Time :ms="item.createdAtMs" mode="age" /></span>
                            <template v-if="item.state === 'open'">
                                <template v-if="canReview">
                                    <button class="omni-btn ghost sm" type="button" :disabled="busy !== null" :data-testid="`review-resolve-${item.itemId}`" @click="resolve(item, 'resolved')">Settled</button>
                                    <button class="omni-btn ghost sm" type="button" :disabled="busy !== null" @click="resolve(item, 'dismissed')">Dismiss</button>
                                </template>
                            </template>
                            <span v-else class="omni-chip sm" :class="item.state === 'resolved' ? 'ok' : ''">{{ item.state }}{{ item.resolution ? `: ${item.resolution}` : '' }}</span>
                        </div>
                        <div v-if="expanded === item.itemId" class="detail">
                            <p class="omni-muted">{{ kindHelp(item.kind) }} {{ whereToDecide(item.kind) }}</p>
                            <OmniscienceV3Json v-if="detailOf(item) != null" :value="detailOf(item)" max-height="260px" />
                            <p v-if="item.resolvedAtMs" class="omni-muted">{{ omniHumanise(item.state) }} by {{ item.actor ?? 'someone' }} <OmniscienceV3Time :ms="item.resolvedAtMs" mode="age" />.</p>
                        </div>
                    </li>
                </ul>
                <template v-if="queue.hasMore.value" #footer>
                    <button class="omni-btn sm" type="button" :disabled="queue.loadingMore.value" @click="queue.loadMore()">{{ queue.loadingMore.value ? 'Loading…' : 'Load more' }}</button>
                </template>
            </OmniscienceV3Panel>
        </template>

        <!-- ── same person? ─────────────────────────────────────────────────── -->
        <template v-else>
            <div class="omni-filterbar">
                <div class="omni-segment" role="group" aria-label="Decision">
                    <button v-for="v in VERDICTS" :key="v.value" type="button" :aria-pressed="view.verdict === v.value" @click="view.verdict = v.value">{{ v.label }}</button>
                </div>
                <OmniscienceV3Pick kind="person" label="About" any="anyone" :multiple="false" :model-value="view.person ? [view.person] : []" testid="links-person" @update:model-value="ids => (view.person = ids[0] ?? '')" />
                <span class="summary"><b>{{ links.items.value.length }}</b> shown</span>
            </div>
            <div class="omni-grid sidebar">
                <OmniscienceV3Panel title="Accounts that may be one person" flush :loading="links.loading.value" :error="links.error.value" :has-data="links.items.value.length > 0"
                                    :empty="!links.items.value.length" :empty-kind="view.verdict === 'suggested' ? 'ok' : 'empty'"
                                    :empty-title="view.verdict === 'suggested' ? 'No suggestions waiting' : 'Nothing here'"
                                    empty-text="Two accounts are suggested as one person only when several independent signs agree. Nothing is merged until you say so." @retry="links.reload()">
                    <ul class="links" data-testid="links-list">
                        <li v-for="l in links.items.value" :key="l.linkId">
                            <div class="pair">
                                <NuxtLink :to="personLink(l.personA)">{{ name(l.personA) }}</NuxtLink><span class="omni-mono omni-muted">{{ l.identityA }}</span>
                                <span class="eq" aria-hidden="true">=</span>
                                <NuxtLink :to="personLink(l.personB)">{{ name(l.personB) }}</NuxtLink><span class="omni-mono omni-muted">{{ l.identityB }}</span>
                                <span class="omni-chip" :class="l.verdict === 'accepted' ? 'ok' : l.verdict === 'rejected' ? '' : 'info'">{{ l.verdict }}</span>
                                <span class="omni-muted">{{ omniPercent(l.probability) }} · {{ l.independentSignals }} independent sign{{ l.independentSignals === 1 ? '' : 's' }}</span>
                            </div>
                            <ul class="signals">
                                <li v-for="(s, i) in l.signals" :key="i"><span class="omni-chip sm">{{ omniHumanise(s.kind) }}</span> {{ s.detail }} <span class="omni-muted">{{ omniPercent(s.strength) }}</span></li>
                            </ul>
                            <div v-if="canReview" class="omni-row">
                                <template v-if="l.verdict === 'suggested'">
                                    <button v-if="canMerge" class="omni-btn sm primary" type="button" :disabled="busy !== null" :data-testid="`link-accept-${l.linkId}`" @click="decide(l, true)">Yes, the same person: merge</button>
                                    <span v-else class="omni-muted">Merging needs the “Manage sources” permission.</span>
                                    <button class="omni-btn sm" type="button" :disabled="busy !== null" :data-testid="`link-reject-${l.linkId}`" @click="decide(l, false)">No, different people</button>
                                </template>
                                <button v-else-if="l.verdict === 'accepted' && l.mergeId != null && canMerge" class="omni-btn ghost sm" type="button" :disabled="busy !== null" @click="undo(l)">Undo the merge</button>
                            </div>
                        </li>
                    </ul>
                    <template v-if="links.hasMore.value" #footer>
                        <button class="omni-btn sm" type="button" :disabled="links.loadingMore.value" @click="links.loadMore()">{{ links.loadingMore.value ? 'Loading…' : 'Load more' }}</button>
                    </template>
                </OmniscienceV3Panel>

                <OmniscienceV3Card v-if="canMerge" title="Merge two people yourself">
                    <form class="omni-form" data-testid="merge-form" @submit.prevent="merge()">
                        <div class="omni-field"><label for="m-a">Keep</label><OmniscienceV3PersonPick v-model="mergeA" input-id="m-a" :max="1" testid="merge-a" /></div>
                        <div class="omni-field"><label for="m-b">Merge into them</label><OmniscienceV3PersonPick v-model="mergeB" input-id="m-b" :max="1" testid="merge-b" /></div>
                        <div class="omni-field"><label for="m-r">Why (optional)</label><input id="m-r" v-model="mergeReason" class="omni-input" maxlength="200" /></div>
                        <button class="omni-btn primary" type="submit" :disabled="busy !== null || !mergeA.length || !mergeB.length">Merge</button>
                        <span class="help">Their facts are worked out again as one person. A merge can be undone from the person's “How it was worked out” tab.</span>
                    </form>
                </OmniscienceV3Card>
            </div>
        </template>
    </OmniscienceV3Shell>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';
import { OMNI_BASE, omniGet, omniParse, omniPost } from '~/scripts/omniscience/api';
import type { IdentityLinkDecisionDto, IdentityLinkDto, IdentityLinkPageDto, KnowledgeReviewItemDto, KnowledgeReviewPageDto, MergeResultDto } from '~/scripts/omniscience/contracts';
import { omniPercent } from '~/scripts/omniscience/format';
import { omniHumanise } from '~/scripts/omniscience/findings';
import { REVIEW_KINDS, reviewKindLabel } from '~/scripts/omniscience/knowledge';
import { useOmniAction, useOmniDebounced, useOmniNames, useOmniPaged } from '~/composables/useOmniscienceV3';
import { useOmniUrlState } from '~/composables/useOmniscienceV3';
import { useAccess } from '~/composables/useAccess';
import type { PickedPerson } from '~/components/OmniscienceV3/PersonPick.vue';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Omniscience v3 · Review' });

type Tab = 'queue' | 'links';
const TABS: { value: Tab; label: string }[] = [{ value: 'queue', label: 'To review' }, { value: 'links', label: 'Same person?' }];
const STATES = ['open', 'resolved', 'dismissed'];
const VERDICTS = [{ value: 'suggested', label: 'Suggested' }, { value: 'accepted', label: 'Merged' }, { value: 'rejected', label: 'Different people' }];

const { can } = useAccess();
const canReview = computed(() => can('omniscience.review.act'));
const canMerge = computed(() => can('omniscience.sources.manage'));
const { busy, run } = useOmniAction();
const { state: view } = useOmniUrlState({ tab: 'queue' as Tab, state: 'open', kind: '', sort: 'priority', verdict: 'suggested', person: '' });
const expanded = ref('');

function personLink(id: string): string { return `${OMNI_BASE}/people/${encodeURIComponent(id)}`; }
function subjectLink(item: KnowledgeReviewItemDto): string { return `${personLink(item.subjectId ?? '')}?tab=knowledge`; }
function kindHelp(kind: string): string { return REVIEW_KINDS.find(k => k.value === kind)?.help ?? ''; }
/** Kinds with their own decision screen say where it is, so "Settled" is not the only thing on offer. */
function whereToDecide(kind: string): string {
    switch (kind) {
        case 'alias': return 'Confirm or reject the name on the person’s “What is known” tab.';
        case 'age_conflict': case 'age_evidence': return 'Confirm or reject each statement under “Age” on the person’s “What is known” tab.';
        case 'identity_link': return 'Decide it under “Same person?”.';
        case 'contradiction': case 'possible_change': case 'flapping': case 'rejected_resurfaced': case 'unproven':
            return 'Open the fact on the person’s “What is known” tab to confirm, reject or correct it.';
        default: return '';
    }
}
function detailOf(item: KnowledgeReviewItemDto): unknown { return omniParse(item.detailJson); }

// ── the queue ──────────────────────────────────────────────────────────────
const queue = useOmniPaged<KnowledgeReviewItemDto, string>((cursor, signal) =>
    omniGet<KnowledgeReviewPageDto>('knowledge/review', { state: view.state, kind: view.kind, sort: view.sort, person: view.person, cursor, limit: 100 }, signal));
useOmniDebounced(() => `${view.state}|${view.kind}|${view.sort}|${view.person}`, () => { void queue.reload(); }, 50);

async function resolve(item: KnowledgeReviewItemDto, state: 'resolved' | 'dismissed') {
    const note = state === 'resolved' ? window.prompt('What did you decide? (kept with the item)', '') : 'dismissed';
    if (note === null) return;
    const result = await run('review', () => omniPost<{ itemId: string; state: string }>('knowledge/review/resolve', { itemId: item.itemId, state, resolution: note.trim() || state }),
        r => (r.state === 'resolved' ? 'Marked as settled.' : 'Dismissed.'));
    if (result) void queue.reload(true);
}

// ── same person? ───────────────────────────────────────────────────────────
const links = useOmniPaged<IdentityLinkDto, string>((cursor, signal) => omniGet<IdentityLinkPageDto>('knowledge/identity-links', { verdict: view.verdict, person: view.person, cursor, limit: 50 }, signal));
useOmniDebounced(() => `${view.verdict}|${view.person}`, () => { void links.reload(); }, 50);

async function decide(link: IdentityLinkDto, accept: boolean) {
    if (accept && !window.confirm(`Merge ${name(link.personB)} into ${name(link.personA)}? They become one person and their facts are worked out again together. It can be undone.`)) return;
    const result = await run('link', () => omniPost<IdentityLinkDecisionDto>('knowledge/identity-links/decide', { linkId: link.linkId, accept, confirm: accept }),
        r => (r.merge ? `Merged: ${name(r.merge.absorbed)} is now part of ${name(r.merge.survivor)}.` : 'Recorded: different people. It will not be suggested again.'));
    if (result) void links.reload(true);
}

async function undo(link: IdentityLinkDto) {
    if (!window.confirm('Undo this merge? The two become separate people again and the suggestion goes back to the list.')) return;
    const result = await run('link-undo', () => omniPost<{ linkId: string; undone: boolean }>('knowledge/identity-links/undo', { linkId: link.linkId }), () => 'The merge was undone.');
    if (result) void links.reload(true);
}

const { want, name } = useOmniNames();
watchEffect(() => want([...queue.items.value.map(i => i.subjectId), ...links.items.value.flatMap(l => [l.personA, l.personB])]));

const mergeA = ref<PickedPerson[]>([]);
const mergeB = ref<PickedPerson[]>([]);
const mergeReason = ref('');
async function merge() {
    const a = mergeA.value[0], b = mergeB.value[0];
    if (!a || !b) return;
    if (!window.confirm(`Merge ${b.label ?? b.id} into ${a.label ?? a.id}? They become one person. It can be undone.`)) return;
    const result = await run('merge', () => omniPost<MergeResultDto>('knowledge/persons/merge', { personA: a.id, personB: b.id, confirm: true, reason: mergeReason.value.trim() || null }),
        r => (r.changed ? `Merged: ${r.absorbed} is now part of ${r.survivor}.` : 'They were already one person.'));
    if (!result) return;
    mergeA.value = []; mergeB.value = []; mergeReason.value = '';
}

function refreshTab() {
    if (view.tab === 'queue') void queue.reload(); else void links.reload();
}
</script>

<style scoped>
.tabs { margin-bottom: var(--omni-gutter); }
.items, .links { list-style: none; margin: 0; padding: 0; }
.items > li { border-bottom: 1px solid var(--omni-line); }
.items .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 12px; font-size: 13px; }
.items .title { flex: 1 1 320px; min-width: 0; text-align: left; background: none; border: 0; color: inherit; font: inherit; cursor: pointer; padding: 0; }
.items .title:hover { text-decoration: underline; }
.items .detail { padding: 0 12px 12px; display: flex; flex-direction: column; gap: 8px; }
.items .detail p { margin: 0; font-size: 12.5px; }
.links > li { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-bottom: 1px solid var(--omni-line); font-size: 13px; }
.pair { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.pair .eq { color: var(--omni-muted); font-weight: 600; }
.signals { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.omni-form { display: flex; flex-direction: column; gap: 12px; }
</style>
