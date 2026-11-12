<template>
    <OmniscienceV3Shell>
        <div class="ot-pagehead">
            <div>
                <h1>People</h1>
                <p class="subtitle">Everyone Omniscience has seen, from the read model the projections keep current. Open a person for their page.</p>
            </div>
            <div class="ot-actions">
                <span class="omni-muted" v-if="people.loadedAt.value">updated <OmniscienceV3Time :ms="people.loadedAt.value" mode="age" /></span>
                <button class="ot-btn ghost" type="button" :disabled="people.loading.value" @click="people.reload()">Refresh</button>
            </div>
        </div>

        <div class="ot-filterbar">
            <label class="ot-search">
                <span class="visually-hidden">Name</span>
                <input v-model="filters.q" class="ot-input" type="search" placeholder="Name or username…" data-testid="people-search" />
            </label>
            <select v-model="filters.tier" class="ot-select auto" aria-label="Tier">
                <option value="">All tiers</option>
                <option value="tracked">Tracked</option>
                <option value="watch">Watch</option>
                <option value="archive">Archive</option>
            </select>
            <select v-model="filters.platform" class="ot-select auto" aria-label="Platform">
                <option value="">All platforms</option>
                <option v-for="p in PLATFORMS" :key="p" :value="p">{{ p }}</option>
            </select>
            <div class="ot-segment" role="group" aria-label="Sort by">
                <button v-for="s in SORTS" :key="s.value" type="button" :aria-pressed="filters.sort === s.value" @click="filters.sort = s.value">{{ s.label }}</button>
            </div>
            <span class="summary"><b>{{ people.items.value.length }}</b> loaded{{ people.hasMore.value ? ', more available' : '' }}</span>
            <div class="grow"></div>
        </div>

        <OmniscienceV3Panel title="People" flush :loading="people.loading.value" :error="people.error.value" :has-data="people.items.value.length > 0"
                            :empty="!people.items.value.length" :empty-kind="filtered ? 'filtered' : 'empty'"
                            :empty-title="filtered ? 'Nobody matches these filters' : 'Nobody yet'"
                            empty-text="People appear here as their messages are imported and the projections build their cards." @retry="people.reload()">
            <OmniTraderDataTable :rows="people.items.value" :columns="columns" :row-key="r => r.personId" label="people" :searchable="false" pinned selectable
                                 max-height="none" :row-class="r => (r.isSelf ? 'self' : '')" @select="open($event)">
                <template #cell-displayName="{ row }">
                    <span class="cellstack">
                        <span><strong>{{ row.displayName }}</strong>
                            <span v-if="row.isSelf" class="ot-chip sm">you</span>
                            <span v-if="row.pinned" class="ot-chip sm" title="Pinned">★</span>
                            <span v-if="restricted(row.ageBand)" class="ot-chip sm warn" title="Under 18, or may be: routine and identity details are not shown">minor</span>
                        </span>
                        <span class="sub omni-mono">{{ row.personId }}</span>
                    </span>
                </template>
                <template #cell-tier="{ row }"><span class="ot-chip" :class="row.tier === 'tracked' ? 'ok' : row.tier === 'watch' ? 'warn' : ''">{{ row.tier }}</span></template>
                <template #cell-platforms="{ row }">{{ row.platforms.join(', ') || '—' }}</template>
                <template #cell-msgs="{ row }">{{ omniCount(row.msgs) }}</template>
                <template #cell-msgs30="{ row }">{{ omniCount(row.msgs30) }}</template>
                <template #cell-lastSeenMs="{ row }"><OmniscienceV3Time :ms="row.lastSeenMs" mode="age" /></template>
                <template #cell-topGuild="{ row }">{{ row.topGuild ?? '—' }}</template>
                <template #cell-mood="{ row }">
                    <span v-if="row.sentiment90" class="mood" :title="moodTitle(row.sentiment90)">
                        <span class="pos" :style="{ width: share(row.sentiment90, 'positive') }"></span>
                        <span class="neu" :style="{ width: share(row.sentiment90, 'neutral') }"></span>
                        <span class="neg" :style="{ width: share(row.sentiment90, 'negative') }"></span>
                    </span>
                    <span v-else class="omni-muted">—</span>
                </template>
            </OmniTraderDataTable>
            <template v-if="people.hasMore.value" #footer>
                <button class="ot-btn sm" type="button" :disabled="people.loadingMore.value" @click="people.loadMore()">
                    {{ people.loadingMore.value ? 'Loading…' : 'Load more people' }}
                </button>
            </template>
        </OmniscienceV3Panel>
    </OmniscienceV3Shell>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { OMNI_BASE, omniGet } from '~/scripts/omniscience/api';
import type { DirectoryPageDto, DirectorySort, PersonCardDto } from '~/scripts/omniscience/contracts';
import { omniCount, omniPercent } from '~/scripts/omniscience/format';
import { useOmniDebounced, useOmniPaged } from '~/composables/useOmniscienceV3';
import { useUrlState } from '~/composables/useOmniTrader';
import type { TableColumn } from '~/components/OmniTrader/DataTable.vue';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Omniscience v3 · People' });

const PLATFORMS = ['discord', 'whatsapp', 'telegram', 'instagram', 'messenger'];
const SORTS: { value: DirectorySort; label: string }[] = [
    { value: 'LastSeen', label: 'Last seen' }, { value: 'Messages', label: 'Most messages' }, { value: 'Recent', label: 'Most recent 30d' }, { value: 'Name', label: 'Name' },
];

const router = useRouter();
const { state: filters } = useUrlState({ q: '', tier: '', platform: '', sort: 'LastSeen' as DirectorySort });
const filtered = computed(() => !!(filters.q || filters.tier || filters.platform));

const people = useOmniPaged<PersonCardDto, string>((cursor, signal) => omniGet<DirectoryPageDto>('people', {
    q: filters.q.trim(), tier: filters.tier, platform: filters.platform, sort: filters.sort, cursor, limit: 100,
}, signal));
useOmniDebounced(() => [filters.q, filters.tier, filters.platform, filters.sort].join('\u0001'), () => { void people.reload(); });

function open(row: PersonCardDto) { void router.push(`${OMNI_BASE}/people/${encodeURIComponent(row.personId)}`); }
function restricted(band: string): boolean { return band === 'Minor' || band === 'LikelyMinor'; }

function total(mix: Record<string, number>): number { return Object.values(mix).reduce((a, b) => a + b, 0); }
function share(mix: Record<string, number>, label: string): string {
    const t = total(mix);
    return t ? `${Math.round(((mix[label] ?? 0) / t) * 100)}%` : '0%';
}
function moodTitle(mix: Record<string, number>): string {
    const t = total(mix);
    if (!t) return 'No messages read in 90 days';
    return ['positive', 'neutral', 'negative'].map(l => `${l} ${omniPercent((mix[l] ?? 0) / t)}`).join(' · ') + ' (last 90 days)';
}

const columns: TableColumn[] = [
    { key: 'displayName', label: 'Person' },
    { key: 'tier', label: 'Tier' },
    { key: 'platforms', label: 'Platforms', optional: true },
    { key: 'msgs', label: 'Messages', num: true },
    { key: 'msgs30', label: '30 days', num: true },
    { key: 'lastSeenMs', label: 'Last seen', num: true },
    { key: 'topGuild', label: 'Most active in', optional: true },
    { key: 'mood', label: 'Tone (90 d)', optional: true },
];
</script>

<style scoped>
.mood { display: inline-flex; width: 90px; height: 8px; border-radius: 4px; overflow: hidden; background: var(--ot-line); vertical-align: middle; }
.mood .pos { background: var(--ot-ok, #3fb950); }
.mood .neu { background: var(--ot-muted, #8b949e); }
.mood .neg { background: var(--ot-bad, #f85149); }
</style>
