<template>
    <div class="rv" :data-testid="`review-detail-${item.itemId}`">
        <p v-if="help" class="omni-muted help">{{ help }}</p>

        <!-- ── a name people use for someone ─────────────────────────────── -->
        <template v-if="item.kind === 'alias' && alias">
            <p class="lead">
                <strong class="said-name">“{{ alias.alias }}”</strong>
                <span class="omni-chip sm">{{ nameKindLabel(alias.nameKind) }}</span>
                <span v-if="alias.commonWord" class="omni-chip sm warn" title="Also an ordinary word, so it never triggers an alert on its own">common word</span>
                <span>for <NuxtLink v-if="item.subjectId" :to="omniPersonLink(item.subjectId)">{{ who(item.subjectId) }}</NuxtLink></span>
                <span v-if="alias.placeName || alias.scopeId">in <NuxtLink v-if="placeTo" :to="placeTo" data-testid="review-place">{{ alias.placeName ?? placeFallback }}</NuxtLink><template v-else>{{ alias.placeName ?? placeFallback }}</template> <span class="omni-muted">({{ placeKindLabel(alias.placeKind, alias.scopeKind) }})</span></span>
            </p>
            <p class="omni-muted">
                Used {{ times(alias.usages) }} by {{ people(alias.speakers) }}<template v-if="alias.selfClaims"> ({{ alias.selfClaims }} by {{ who(item.subjectId) }})</template>,
                last <OmniscienceV3Time :ms="alias.lastSeenMs" mode="age" />.
            </p>
            <OmniscienceV3QuoteList v-if="messages.length" :messages="messages" :mark="alias.alias" />
            <div class="omni-row decide">
                <span v-if="decidedAlias" class="omni-chip" :class="decidedAlias === 'confirmed' ? 'ok' : ''">You {{ decidedAlias }} it</span>
                <template v-else-if="canReview">
                    <button class="omni-btn sm primary" type="button" :disabled="busy !== null" data-testid="alias-confirm" @click="reviewAlias('confirm')">Yes, {{ who(item.subjectId) }} goes by “{{ alias.alias }}”</button>
                    <button class="omni-btn sm" type="button" :disabled="busy !== null" data-testid="alias-reject" @click="reviewAlias('reject')">No, not their name</button>
                </template>
            </div>
        </template>

        <!-- ── two accounts that may be one person ───────────────────────── -->
        <template v-else-if="item.kind === 'identity_link' && link">
            <div class="pair">
                <span class="account"><span class="omni-chip sm">{{ omniPlatformLabel(link.a.platform) }}</span>
                    <NuxtLink :to="omniPersonLink(link.a.personId)">{{ accountName(link.a) }}</NuxtLink><span v-if="link.a.handle" class="omni-muted">@{{ link.a.handle }}</span>
                    <span v-if="ownerDiffers(link.a)" class="omni-muted">({{ who(link.a.personId) }})</span></span>
                <span class="eq" aria-label="may be the same as">=</span>
                <span class="account"><span class="omni-chip sm">{{ omniPlatformLabel(link.b.platform) }}</span>
                    <NuxtLink :to="omniPersonLink(link.b.personId)">{{ accountName(link.b) }}</NuxtLink><span v-if="link.b.handle" class="omni-muted">@{{ link.b.handle }}</span>
                    <span v-if="ownerDiffers(link.b)" class="omni-muted">({{ who(link.b.personId) }})</span></span>
            </div>
            <p class="omni-muted">{{ omniPercent(link.probability) }} likely · {{ link.independentSignals }} independent sign{{ link.independentSignals === 1 ? '' : 's' }}</p>
            <ul v-if="link.signals.length" class="signals">
                <li v-for="(s, i) in link.signals" :key="i"><span class="omni-chip sm">{{ omniHumanise(s.kind) }}</span> {{ s.detail }} <span class="omni-muted">{{ omniPercent(s.strength) }}</span></li>
            </ul>
            <div class="omni-row decide">
                <span v-if="link.verdict !== 'suggested'" class="omni-chip" :class="link.verdict === 'accepted' ? 'ok' : ''">{{ link.verdict === 'accepted' ? 'Merged into one person' : 'Different people' }}</span>
                <template v-else-if="canReview">
                    <button v-if="canMerge" class="omni-btn sm primary" type="button" :disabled="busy !== null" data-testid="review-link-accept" @click="decideLink(true)">Yes, the same person: merge</button>
                    <span v-else class="omni-muted">Merging needs the “Manage sources” permission.</span>
                    <button class="omni-btn sm" type="button" :disabled="busy !== null" data-testid="review-link-reject" @click="decideLink(false)">No, different people</button>
                </template>
            </div>
        </template>

        <!-- ── age statements that cannot all be true ────────────────────── -->
        <template v-else-if="item.kind === 'age_conflict' && age.length">
            <ul class="statements">
                <li v-for="s in age" :key="s.evidenceId">
                    <OmniscienceV3QuoteList :messages="messagesOf(s.messageId, s.quote)" />
                    <div class="omni-row">
                        <span class="omni-chip sm" :class="factTone(ageDecided[s.evidenceId] ?? s.status)">{{ ageDecided[s.evidenceId] ?? s.status }}</span>
                        <span class="omni-muted">{{ omniHumanise(s.kind) }}</span>
                        <template v-if="canReview && !ageDecided[s.evidenceId]">
                            <button class="omni-btn ghost sm" type="button" :disabled="busy !== null" :data-testid="`age-confirm-${s.evidenceId}`" @click="reviewAge(s, 'confirm')">About their age</button>
                            <button class="omni-btn ghost sm" type="button" :disabled="busy !== null" :data-testid="`age-reject-${s.evidenceId}`" @click="reviewAge(s, 'reject')">Not about their age (a joke, a quote)</button>
                        </template>
                    </div>
                </li>
            </ul>
        </template>

        <!-- ── one fact ──────────────────────────────────────────────────── -->
        <template v-else-if="fact">
            <p class="lead">
                <strong>{{ fact.attributeTitle }}</strong>
                <template v-for="(v, i) in fact.values" :key="v"><span v-if="i" class="omni-muted"> or </span><span class="value">“{{ v }}”</span></template>
                <template v-if="fact.objectPersonId"> · about <NuxtLink :to="omniPersonLink(fact.objectPersonId)">{{ who(fact.objectPersonId) }}</NuxtLink></template>
            </p>
            <p v-if="fact.status && fact.value" class="omni-muted">Stands now as “{{ fact.value }}” <span class="omni-chip sm" :class="factTone(fact.status)">{{ fact.status }}</span></p>
            <OmniscienceV3QuoteList v-if="messages.length" :messages="messages" />
            <div class="omni-row decide">
                <button v-if="fact.assertionId" class="omni-btn sm primary" type="button" :data-testid="`review-open-fact-${item.itemId}`" @click="emit('open-fact', fact.assertionId!)">Open the fact: evidence, confirm or correct</button>
                <span v-else class="omni-muted">This fact is no longer kept, so there is nothing left to decide about it here.</span>
            </div>
        </template>

        <!-- ── a hypothesis the evidence settled ─────────────────────────── -->
        <template v-else-if="item.kind === 'hypothesis'">
            <p v-if="note" class="lead">{{ note }}</p>
            <OmniscienceV3QuoteList v-if="messages.length" :messages="messages" />
        </template>

        <!-- ── anything else: what the detail says, in words ─────────────── -->
        <template v-else>
            <p v-if="item.kind === 'alias' && fallbackAlias" class="lead"><strong class="said-name">“{{ fallbackAlias }}”</strong> for {{ who(item.subjectId) }}</p>
            <dl v-if="plain.length" class="omni-kv">
                <template v-for="row in plain" :key="row.label"><dt>{{ row.label }}</dt><dd>{{ row.value }}</dd></template>
            </dl>
            <OmniscienceV3QuoteList v-if="messages.length" :messages="messages" />
        </template>

        <p v-if="item.subjectId && personTab" class="more">
            <NuxtLink :to="omniPersonLink(item.subjectId, personTab)">{{ personTabLabel }}</NuxtLink>
        </p>
    </div>
</template>

<script setup lang="ts">
import { computed, reactive, watchEffect } from 'vue';
import { omniParse, omniPost } from '~/scripts/omniscience/api';
import type { AgeStatementDto, EvidenceContextDto, IdentityLinkDecisionDto, KnowledgeJobStartedDto, KnowledgeReviewItemDto, ReviewAccountDto } from '~/scripts/omniscience/contracts';
import { omniPercent } from '~/scripts/omniscience/format';
import { omniHumanise } from '~/scripts/omniscience/findings';
import { REVIEW_KINDS, factTone } from '~/scripts/omniscience/knowledge';
import { omniPersonLink, omniPlaceLink, omniPlatformLabel, useOmniAction, useOmniNames } from '~/composables/useOmniscienceV3';

/**
 * One review item opened: what it is about in words, with everyone and everywhere it names as a link and the decision
 * it waits for as buttons (a name, two accounts, age statements, a fact). Nothing here is ever shown as an id: the
 * server names each item's people, places and messages ("context"); without that (an older server), what the item's
 * detail says is shown in words and its ids are left out.
 */
const props = defineProps<{ item: KnowledgeReviewItemDto; canReview: boolean; canMerge: boolean }>();
const emit = defineEmits<{ changed: []; 'open-fact': [assertionId: string] }>();

const { busy, run } = useOmniAction();
const { name, want, remember } = useOmniNames();

const ctx = computed(() => props.item.context ?? null);
const alias = computed(() => ctx.value?.alias ?? null);
const link = computed(() => ctx.value?.link ?? null);
const fact = computed(() => ctx.value?.fact ?? null);
const age = computed(() => ctx.value?.age ?? []);
const messages = computed(() => ctx.value?.messages ?? []);
const detail = computed(() => omniParse<Record<string, unknown>>(props.item.detailJson) ?? {});
const note = computed(() => (typeof detail.value.note === 'string' ? detail.value.note : null));

watchEffect(() => {
    remember(ctx.value?.people);
    want([props.item.subjectId, link.value?.a.personId, link.value?.b.personId, fact.value?.objectPersonId]);
});

const who = (id: string | null | undefined): string => (id ? ctx.value?.people[id] ?? name(id) : 'them');
const help = computed(() => REVIEW_KINDS.find(k => k.value === props.item.kind)?.help ?? '');

// ── a name ────────────────────────────────────────────────────────────────
const placeTo = computed(() => (alias.value ? omniPlaceLink(alias.value.scopeKind === 'guild' ? 'guild' : 'conversation', alias.value.scopeId, alias.value.placeKind) : null));
const placeFallback = computed(() => (alias.value?.scopeKind === 'guild' ? 'a server with no name' : 'a chat with no name'));
const decidedAlias = computed(() => (alias.value && (alias.value.status === 'confirmed' || alias.value.status === 'rejected') ? alias.value.status : null));

function nameKindLabel(kind: string): string {
    switch (kind) {
        case 'real_name': return 'real name';
        case 'nickname': return 'nickname';
        default: return omniHumanise(kind).toLowerCase();
    }
}
function placeKindLabel(place: string | null | undefined, scopeKind: string): string {
    switch (place) {
        case 'server': return 'a server';
        case 'group': return 'a group chat';
        case 'dm': return 'a direct chat';
        default: return scopeKind === 'guild' ? 'a server' : 'a chat';
    }
}
const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
const people = (n: number) => (n === 1 ? 'one person' : `${n} people`);

async function reviewAlias(verdict: 'confirm' | 'reject') {
    const a = alias.value;
    if (!a) return;
    const subject = who(props.item.subjectId);
    const result = await run(`alias-${verdict}`, () => omniPost<{ aliasId: string; status: string }>('knowledge/aliases/review', { aliasId: a.aliasId, verdict }),
        r => (r.status === 'confirmed' ? `“${a.alias}” is one of ${subject}’s names.` : `“${a.alias}” is not one of ${subject}’s names.`));
    if (result) emit('changed');
}

// ── two accounts ──────────────────────────────────────────────────────────
const accountName = (a: ReviewAccountDto) => a.name ?? (a.handle ? `@${a.handle}` : who(a.personId));
const ownerDiffers = (a: ReviewAccountDto) => !!a.name && who(a.personId) !== a.name && who(a.personId) !== '…';

async function decideLink(accept: boolean) {
    const l = link.value;
    if (!l) return;
    if (accept && !window.confirm(`Merge ${who(l.b.personId)} into ${who(l.a.personId)}? They become one person and their facts are worked out again together. It can be undone.`)) return;
    const result = await run('link', () => omniPost<IdentityLinkDecisionDto>('knowledge/identity-links/decide', { linkId: l.linkId, accept, confirm: accept }),
        r => (r.merge ? `Merged: ${who(r.merge.absorbed)} is now part of ${who(r.merge.survivor)}.` : 'Recorded: different people. It will not be suggested again.'));
    if (result) emit('changed');
}

// ── age statements ────────────────────────────────────────────────────────
const ageDecided = reactive<Record<string, string>>({});
function messagesOf(messageId: string, quote: string | null | undefined): EvidenceContextDto[] {
    const found = messages.value.filter(m => m.messageId === messageId);
    if (found.length) return found;
    return quote ? [{ messageId, version: 0, role: 'support', quote, weight: 1, deleted: false, edited: false, text: quote }] : [];
}
async function reviewAge(s: AgeStatementDto, verdict: 'confirm' | 'reject') {
    const result = await run(`age-${s.evidenceId}`, () => omniPost<KnowledgeJobStartedDto>('knowledge/age/review', { evidenceId: s.evidenceId, verdict }),
        r => r.detail ?? 'Recorded.');
    if (!result) return;
    ageDecided[s.evidenceId] = verdict === 'confirm' ? 'confirmed' : 'rejected';
    emit('changed');
}

// ── where to look further ─────────────────────────────────────────────────
const personTab = computed(() => {
    switch (props.item.kind) {
        case 'alias': case 'age_conflict': case 'age_evidence': case 'contradiction': case 'possible_change': case 'flapping': case 'rejected_resurfaced': case 'unproven': case 'hypothesis':
            return 'knowledge';
        default: return null;
    }
});
const personTabLabel = computed(() => `Everything known about ${who(props.item.subjectId)} →`);

// ── an item the server did not name (an older server, or a kind added since) ──
const ID_KEY = /(^id$|Id$|Ids$|_id$|_ids$|^identity[AB]$|^messages$|^claims$)/;
const ID_VALUE = /^([a-z]+:[\w.-]+|[a-z]{2,3}[_-][0-9a-f]{6,}|\d{12,})$/i;
const fallbackAlias = computed(() => (typeof detail.value.alias === 'string' ? detail.value.alias : null));
const plain = computed(() => {
    if (props.item.kind === 'hypothesis') return [];
    const rows: { label: string; value: string }[] = [];
    for (const [key, value] of Object.entries(detail.value)) {
        if (ID_KEY.test(key) || (props.item.kind === 'alias' && (key === 'alias' || key === 'scope'))) continue;
        const shown = Array.isArray(value)
            ? value.filter(v => (typeof v === 'string' && !ID_VALUE.test(v)) || typeof v === 'number').map(String).join(', ')
            : typeof value === 'number' ? (value > 0 && value < 1 && /probability|strength|confidence/i.test(key) ? omniPercent(value) : String(value))
                : typeof value === 'string' && !ID_VALUE.test(value) ? value : typeof value === 'boolean' ? (value ? 'yes' : 'no') : '';
        if (shown) rows.push({ label: omniHumanise(key.replace(/([a-z])([A-Z])/g, '$1 $2')).replace(/ ms$/i, ''), value: shown });
    }
    return rows;
});
</script>

<style scoped>
.rv { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.rv p { margin: 0; }
.help { font-size: 12.5px; }
.lead { font-size: 13.5px; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; }
.said-name, .value { font-weight: 600; }
.pair { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px 10px; font-size: 13.5px; }
.account { display: inline-flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }
.pair .eq { color: var(--omni-muted); font-weight: 600; }
.signals, .statements { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; }
.statements { gap: 12px; }
.decide { margin-top: 2px; }
.more { font-size: 12.5px; }
/* Names here are links to their pages: say so, quietly. */
.rv :deep(a:not(.omni-btn)) { text-decoration: underline dotted; text-decoration-color: var(--omni-line-strong); text-underline-offset: 3px; }
.rv :deep(a:not(.omni-btn):hover) { color: var(--omni-accent); text-decoration-color: currentColor; }
</style>
