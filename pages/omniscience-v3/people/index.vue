<template>
    <OmniscienceV3Shell>
        <div class="omni-pagehead">
            <div>
                <h1>People</h1>
                <p class="subtitle">Everyone Omniscience has seen. Click a row for a quick look, the name for their page, and pick two people to compare them. <kbd>/</kbd> searches.</p>
            </div>
            <div class="omni-actions">
                <span class="omni-muted" v-if="people.loadedAt.value">updated <OmniscienceV3Time :ms="people.loadedAt.value" mode="age" /></span>
                <button class="omni-btn ghost" type="button" :disabled="people.loading.value" @click="people.reload()">Refresh</button>
            </div>
        </div>

        <div class="omni-filterbar">
            <label class="omni-search">
                <span class="visually-hidden">Name</span>
                <input ref="searchBox" v-model="filters.q" class="omni-input" type="search" placeholder="Name or username…" data-testid="people-search" />
            </label>
            <select v-model="filters.tier" class="omni-select auto" aria-label="Tier">
                <option value="">All tiers</option>
                <option value="tracked">Tracked</option>
                <option value="watch">Watch</option>
                <option value="archive">Archive</option>
            </select>
            <select v-model="filters.platform" class="omni-select auto" aria-label="Platform">
                <option value="">All platforms</option>
                <option v-for="p in PLATFORMS" :key="p" :value="p">{{ p }}</option>
            </select>
            <div class="omni-segment" role="group" aria-label="Sort by">
                <button v-for="s in SORTS" :key="s.value" type="button" :aria-pressed="filters.sort === s.value" @click="filters.sort = s.value">{{ s.label }}</button>
            </div>
            <span class="summary"><b>{{ people.items.value.length }}</b> loaded{{ people.hasMore.value ? ', more available' : '' }}</span>
            <div class="grow"></div>
        </div>

        <div v-if="picked.length" class="omni-banner ok" role="status" data-testid="people-picked">
            <div><strong>{{ picked.map(x => x.displayName).join(' and ') }}</strong>
                <span class="muted">{{ picked.length === 2 ? 'Ready to compare.' : 'Pick one more person to compare them.' }}</span></div>
            <div class="actions">
                <button class="omni-btn primary sm" type="button" :disabled="picked.length !== 2" data-testid="people-compare" @click="comparing = true">Compare</button>
                <button class="omni-btn ghost sm" type="button" @click="picked = []">Clear</button>
            </div>
        </div>

        <OmniscienceV3Panel title="People" flush :loading="people.loading.value" :error="people.error.value" :has-data="people.items.value.length > 0"
                            :empty="!people.items.value.length" :empty-kind="filtered ? 'filtered' : 'empty'"
                            :empty-title="filtered ? 'Nobody matches these filters' : 'Nobody yet'"
                            empty-text="People appear here as their messages are imported and the projections build their cards." @retry="people.reload()">
            <OmniscienceV3DataTable :rows="people.items.value" :columns="columns" :row-key="r => r.personId" label="people" :searchable="false" pinned selectable
                                 max-height="none" :selected-key="peekId" :row-class="r => (r.isSelf ? 'self' : '')" @select="peekId = $event.personId">
                <template #cell-displayName="{ row }">
                    <span class="cellstack">
                        <span><NuxtLink class="who" :to="personTo(row.personId)" @click.stop><strong>{{ row.displayName }}</strong></NuxtLink>
                            <span v-if="row.isSelf" class="omni-chip sm">you</span>
                            <span v-if="row.pinned" class="omni-chip sm" title="Pinned">★</span>
                            <span v-if="restricted(row.ageBand)" class="omni-chip sm warn" title="Under 18, or may be: routine and identity details are not shown">minor</span>
                        </span>
                        <span class="sub omni-mono">{{ row.personId }}</span>
                    </span>
                </template>
                <template #cell-tier="{ row }"><span class="omni-chip" :class="row.tier === 'tracked' ? 'ok' : row.tier === 'watch' ? 'warn' : ''">{{ row.tier }}</span></template>
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
                <template #cell-pick="{ row }">
                    <button class="omni-btn ghost sm" type="button" :class="{ active: isPicked(row) }" :aria-pressed="isPicked(row)"
                            :aria-label="`${isPicked(row) ? 'Stop comparing' : 'Compare'} ${row.displayName}`" @click.stop="togglePick(row)">{{ isPicked(row) ? '✓ picked' : 'Compare' }}</button>
                </template>
            </OmniscienceV3DataTable>
            <template v-if="people.hasMore.value" #footer>
                <button class="omni-btn sm" type="button" :disabled="people.loadingMore.value" @click="people.loadMore()">
                    {{ people.loadingMore.value ? 'Loading…' : 'Load more people' }}
                </button>
            </template>
        </OmniscienceV3Panel>

        <OmniscienceV3PersonPeek :person-id="peekId || null" @close="peekId = ''" />
        <OmniscienceV3PairCompare :open="comparing" :a="picked[0] ?? null" :b="picked[1] ?? null" @close="comparing = false" />
    </OmniscienceV3Shell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { OMNI_BASE, omniGet } from '~/scripts/omniscience/api';
import type { DirectoryPageDto, DirectorySort, PersonCardDto } from '~/scripts/omniscience/contracts';
import { omniCount, omniPercent } from '~/scripts/omniscience/format';
import { useOmniDebounced, useOmniPaged } from '~/composables/useOmniscienceV3';
import { useOmniUrlState } from '~/composables/useOmniscienceV3';
import type { TableColumn } from '~/components/OmniscienceV3/DataTable.vue';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Omniscience v3 · People' });

const PLATFORMS = ['discord', 'whatsapp', 'telegram', 'instagram', 'messenger'];
const SORTS: { value: DirectorySort; label: string }[] = [
    { value: 'LastSeen', label: 'Last seen' }, { value: 'Messages', label: 'Most messages' }, { value: 'Recent', label: 'Most recent 30d' }, { value: 'Name', label: 'Name' },
];

const { state: filters } = useOmniUrlState({ q: '', tier: '', platform: '', sort: 'LastSeen' as DirectorySort });
const filtered = computed(() => !!(filters.q || filters.tier || filters.platform));

const people = useOmniPaged<PersonCardDto, string>((cursor, signal) => omniGet<DirectoryPageDto>('people', {
    q: filters.q.trim(), tier: filters.tier, platform: filters.platform, sort: filters.sort, cursor, limit: 100,
}, signal));
useOmniDebounced(() => [filters.q, filters.tier, filters.platform, filters.sort].join('\u0001'), () => { void people.reload(); });

const personTo = (id: string) => `${OMNI_BASE}/people/${encodeURIComponent(id)}`;

// A quick look keeps the list where it was; the full page is one click further.
const peekId = ref('');

// Two people picked from the list are compared side by side; a third replaces the one picked first.
const picked = ref<PersonCardDto[]>([]);
const comparing = ref(false);
const isPicked = (row: PersonCardDto) => picked.value.some(x => x.personId === row.personId);
function togglePick(row: PersonCardDto) {
    picked.value = isPicked(row) ? picked.value.filter(x => x.personId !== row.personId) : [...picked.value, row].slice(-2);
}

const searchBox = ref<HTMLInputElement | null>(null);
function onKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || target?.closest('input, textarea, select, [contenteditable]')) return;
    event.preventDefault();
    searchBox.value?.focus();
}
onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
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
    { key: 'pick', label: '', sortable: false },
];
</script>

<style scoped>
.mood { display: inline-flex; width: 90px; height: 8px; border-radius: 4px; overflow: hidden; background: var(--omni-line); vertical-align: middle; }
.mood .pos { background: var(--omni-ok, #3fb950); }
.mood .neu { background: var(--omni-muted, #8b949e); }
.mood .neg { background: var(--omni-bad, #f85149); }
.who { color: inherit; }
.who:hover strong { color: var(--omni-accent-2); }
.omni-banner .muted { display: block; color: var(--omni-text-2); }
</style>
