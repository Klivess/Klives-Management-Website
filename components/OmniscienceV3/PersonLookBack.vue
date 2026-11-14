<template>
    <div class="lookback" data-testid="person-lookback">
        <div class="ot-filterbar">
            <label class="pick">Show
                <select v-model="look.look" class="ot-input auto" data-testid="lookback-mode">
                    <option v-for="m in MODES" :key="m.value" :value="m.value">{{ m.label }}</option>
                </select>
            </label>
            <label v-if="dated" class="pick">on <input v-model="look.lookOn" class="ot-input" type="date" :max="today || undefined" data-testid="lookback-date" /></label>
            <label class="pick">Status
                <select v-model="look.lookStatus" class="ot-input auto" data-testid="lookback-status">
                    <option v-for="s in STATUSES" :key="s.value" :value="s.value">{{ s.label }}</option>
                </select>
            </label>
            <span class="grow"></span>
            <span v-if="query" class="summary"><b>{{ facts.items.value.length }}</b>{{ facts.hasMore.value ? '+' : '' }} shown</span>
            <button v-if="activeCount" class="ot-btn ghost sm" type="button" @click="reset()">Clear</button>
        </div>
        <OmniscienceV3Panel title="Look back" :subtitle="hint" flush :loading="!!query && facts.loading.value" :error="query ? facts.error.value : null"
                            :has-data="facts.items.value.length > 0" :empty="!facts.items.value.length" :empty-kind="query ? 'filtered' : 'empty'"
                            :empty-title="emptyTitle" :empty-text="emptyText" what="These facts"
                            :footnote="restricted ? 'They are, or may be, under 18: restricted facts and anything worked out about them are left out, at every date.' : undefined"
                            @retry="facts.reload()">
            <table class="ot-table compact" data-testid="lookback-table">
                <thead><tr><th>Kind</th><th>What</th><th>Value</th><th>Status</th><th class="num">Confidence</th><th>When</th><th>How we know</th><th>First said</th><th>On record since</th></tr></thead>
                <tbody>
                    <tr v-for="f in facts.items.value" :key="f.assertionId" class="clickable" :data-testid="`lookback-${f.assertionId}`" @click="emit('open', f.assertionId)">
                        <td class="omni-muted">{{ omniHumanise(f.category) }}</td>
                        <td>{{ f.attributeTitle }}</td>
                        <td>{{ f.polarity === 'negated' ? 'not ' : '' }}{{ f.value }}</td>
                        <td><span class="ot-chip sm" :class="factTone(f.status)" :title="factStatusHelp(f.status)">{{ f.status }}</span></td>
                        <td class="num">{{ omniPercent(f.probability) }}</td>
                        <td class="omni-muted">{{ factValidity(f, month) || '—' }}</td>
                        <td class="omni-muted">{{ sourceKindLabel(f.sourceKind) }}</td>
                        <td><OmniscienceV3Time :ms="f.firstEvidenceMs" mode="absolute" /></td>
                        <td><OmniscienceV3Time :ms="f.recordedAtMs" mode="absolute" /></td>
                    </tr>
                </tbody>
            </table>
            <template v-if="facts.hasMore.value" #footer>
                <button class="ot-btn sm" type="button" :disabled="facts.loadingMore.value" @click="facts.loadMore()">{{ facts.loadingMore.value ? 'Loading…' : 'Load more' }}</button>
            </template>
        </OmniscienceV3Panel>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { omniGet } from '~/scripts/omniscience/api';
import type { KnowledgeFactDto, KnowledgeFactsPageDto } from '~/scripts/omniscience/contracts';
import { omniPercent, omniZonedToMs } from '~/scripts/omniscience/format';
import { omniHumanise } from '~/scripts/omniscience/findings';
import { factStatusHelp, factTone, factValidity, sourceKindLabel } from '~/scripts/omniscience/knowledge';
import { useOmniDebounced, useOmniPaged, useOmniTime } from '~/composables/useOmniscienceV3';
import { useUrlState } from '~/composables/useOmniTrader';

/**
 * A person's facts at another date, or the ones the list of what is known leaves out.
 * Three questions about a past day are different and all asked here: what was true then as far as is
 * known today, what was true then going only by what had been said by then, and what was on record
 * then (which includes what was later corrected). Facts still being checked and facts Klives rejected
 * are never shown as knowledge; picking their status is the way to see them.
 */
const props = defineProps<{ personId: string }>();
const emit = defineEmits<{ open: [assertionId: string] }>();

const MODES = [
    { value: '', label: 'What is known now' },
    { value: 'asof', label: 'What was true on a date' },
    { value: 'said', label: 'What was true on a date, from what had been said by then' },
    { value: 'known', label: 'What was on record on a date' },
];
const EVERY_STATUS = 'proposed,accepted,confirmed,contested,rejected,inferred';
const STATUSES = [
    { value: '', label: 'Shown as knowledge' },
    { value: 'all', label: 'Everything recorded' },
    { value: 'proposed', label: 'Still being checked' },
    { value: 'accepted', label: 'Accepted' },
    { value: 'confirmed', label: 'Confirmed by you' },
    { value: 'contested', label: 'Contested' },
    { value: 'rejected', label: 'Rejected by you' },
    { value: 'inferred', label: 'Worked out, not stated' },
];

const { zone, lens, at, now } = useOmniTime();
const { state: look, reset, activeCount } = useUrlState({ look: '', lookOn: '', lookStatus: '' });
const dated = computed(() => look.look !== '');
const today = computed(() => (now.value ? at(now.value).slice(0, 10) : ''));
const restricted = ref(false);

/** The last minute of the chosen day in the time lens's zone: "on the 14th" means by the end of the 14th. */
const instant = computed<number | null>(() => {
    if (!dated.value || !look.lookOn) return null;
    const lastMinute = omniZonedToMs(`${look.lookOn}T23:59`, zone.value);
    return lastMinute === null ? null : lastMinute + 59_999;
});

/** What to ask the server, or null when there is nothing to ask: no date yet, or exactly the list of what is known. */
const query = computed(() => {
    if (dated.value ? instant.value === null : !look.lookStatus) return null;
    return {
        mode: look.look === 'known' ? 'known' : dated.value ? 'asof' : 'current',
        at: instant.value,
        knownByThen: look.look === 'said' ? true : null,
        status: look.lookStatus === 'all' ? EVERY_STATUS : look.lookStatus,
    };
});

const facts = useOmniPaged<KnowledgeFactDto, string>(async (cursor, signal) => {
    const q = query.value;
    if (!q) return { items: [], nextCursor: null };
    const page = await omniGet<KnowledgeFactsPageDto>('knowledge/facts', { person: props.personId, ...q, cursor, limit: 100 }, signal);
    restricted.value = page.minorRestricted;
    return page;
});
useOmniDebounced(() => JSON.stringify(query.value), () => { void facts.reload(); }, 50);

const hint = computed(() => {
    switch (look.look) {
        case 'asof': return 'What held on that day, as far as is known today. Something learned later about that time is included.';
        case 'said': return 'What held on that day, going only by messages sent up to then. Nothing learned later is included.';
        case 'known': return 'What was on record at the end of that day, including what was corrected later. It cannot go back further than the day their messages were first read.';
        default: return look.lookStatus ? 'How things stand now, for the status you picked.' : undefined;
    }
});
const emptyTitle = computed(() => (query.value ? 'Nothing for that' : dated.value ? 'Pick the date' : 'Pick a date or a status'));
const emptyText = computed(() => {
    if (query.value) return look.look === 'known' ? 'Nothing was on record that day.' : 'No fact matches.';
    if (dated.value) return `Days are counted in ${lens.value === 'Utc' ? 'UTC' : zone.value}.`;
    return 'The list above is what is known now. Here you can go back to an earlier date, or see what that list leaves out: facts still being checked, and ones you rejected.';
});

function month(ms: number): string { return at(ms).slice(0, 7); }
function refresh() { if (query.value) void facts.reload(true); }
defineExpose({ refresh });
</script>

<style scoped>
.lookback { margin-top: var(--ot-gutter); }
.pick { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--ot-muted); }
.grow { flex: 1; }
</style>
