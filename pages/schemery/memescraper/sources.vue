<template>
    <MemeScraperShell>
        <div class="ot-pagehead">
            <div>
                <h1>Sources</h1>
                <p class="subtitle">{{ subtitle }}</p>
            </div>
            <div class="ot-actions">
                <button v-if="can('memescraper.scrape.run')" class="ot-btn" :disabled="actions.requesting.value || !health?.DataLoaded" @click="actions.scrapeAll(reelSources)">▶ Scrape all</button>
                <button v-if="can('memescraper.sources.manage')" class="ot-btn primary" @click="addOpen = true">Add source</button>
            </div>
        </div>

        <MemeScraperAttention />
        <MemeScraperRangeBar :range-view="d?.Range" :options="d?.Options" :loading="loading" :show-granularity="false" />

        <OmniTraderCard :loading="!d" :empty="!d" :error="error && !d ? error : undefined" flush :skeleton-rows="8" @retry="load(true)">
            <OmniTraderDataTable v-if="d" :rows="rows" :columns="columns" :row-key="(r: SourceRow) => r.Username" selectable :selected-key="drawerUser"
                                 label="sources" search-placeholder="Find a source…" default-sort="Downloaded" :row-class="rowClass"
                                 max-height="none" empty-title="No sources match" :empty-text="stateFilter !== 'all' ? 'Try another state filter.' : 'Add a source to start collecting reels.'"
                                 @select="(row: SourceRow) => drawerUser = row.Username">
                <template #tools>
                    <div class="ot-segment sm" role="group" aria-label="State">
                        <button v-for="f in STATE_FILTERS" :key="f.key" type="button" :aria-pressed="stateFilter === f.key" :disabled="f.key !== 'all' && !counts[f.key]" @click="setState(f.key)">
                            {{ f.label }} <span class="count">{{ counts[f.key] ?? 0 }}</span>
                        </button>
                    </div>
                </template>

                <template #cell-Username="{ row }">
                    <span class="who">
                        <MemeScraperAvatar :src="row.ProfilePictureUrl" :name="row.Username" />
                        <span class="cellstack">
                            <span class="handle">@{{ row.Username }}</span>
                            <span class="sub">{{ row.FullName || (row.Registered ? '' : 'no longer a source') }}</span>
                        </span>
                    </span>
                </template>
                <template #cell-State="{ row }">
                    <span class="ot-chip" :class="stateTone(row.State)" :title="row.StateReason">{{ STATE_LABEL[row.State as SourceState] }}</span>
                </template>
                <template #cell-Downloaded="{ row }">
                    <span class="cellstack right">
                        <span>{{ row.Downloaded.toLocaleString() }}</span>
                        <span v-if="row.DownloadedPrev != null" class="ms-delta" :class="row.Downloaded > row.DownloadedPrev ? 'up' : row.Downloaded < row.DownloadedPrev ? 'down' : 'flat'">{{ delta(row.Downloaded, row.DownloadedPrev) }}</span>
                    </span>
                </template>
                <template #cell-Share="{ row }">
                    <span class="share" :title="`${row.Share.toFixed(1)}% of reels in the window`">
                        <span class="track"><span class="fill" :style="{ width: `${Math.max(row.Share ? 2 : 0, (row.Share / maxShare) * 100)}%` }"></span></span>
                        <span class="pct">{{ row.Share >= 10 ? row.Share.toFixed(0) : row.Share.toFixed(1) }}%</span>
                    </span>
                </template>
                <template #cell-Spark="{ row }">
                    <span class="spark">
                        <OmniTraderSparkline v-if="row.Spark.length > 1 && row.Spark.some((v: number) => v > 0)" :values="row.Spark" :height="22" tone="neutral" :filled="false" :label="`@${row.Username} reels across the window`" />
                        <span v-else class="muted">—</span>
                    </span>
                </template>
                <template #cell-MedianViews="{ row }">
                    <span :title="row.AvgViews != null ? `average ${fmtCount(row.AvgViews)} · top ${fmtCount(row.TopViews)}` : undefined">{{ fmtCount(row.MedianViews) }}</span>
                </template>
                <template #cell-TotalReels="{ row }">{{ row.TotalReels.toLocaleString() }}</template>
                <template #cell-LastDownloadUtc="{ row }">
                    <span :title="fmtStamp(row.LastDownloadUtc)">{{ fmtRel(row.LastDownloadUtc, now) }}</span>
                </template>
                <template #cell-NextScrapeDueUtc="{ row }">
                    <span v-if="isScraping(row)" class="running">● running</span>
                    <span v-else-if="!row.Registered" class="muted">—</span>
                    <span v-else-if="!row.DownloadReels" class="muted">paused</span>
                    <span v-else-if="health?.Settings?.Paused" class="muted" title="Scheduled scrapes are paused">schedule off</span>
                    <span v-else :title="fmtStamp(row.NextScrapeDueUtc)" :class="{ late: fmtDue(row.NextScrapeDueUtc, now).startsWith('overdue') }">{{ fmtDue(row.NextScrapeDueUtc, now) }}</span>
                </template>
                <template #cell-Niches="{ row }">
                    <span class="niches">
                        <span v-for="n in row.Niches.slice(0, 3)" :key="n" class="ot-chip">{{ n }}</span>
                        <span v-if="row.Niches.length > 3" class="muted">+{{ row.Niches.length - 3 }}</span>
                    </span>
                </template>
                <template #cell-Followers="{ row }">{{ row.Followers ? fmtCount(row.Followers) : '—' }}</template>
                <template #cell-Scrapes="{ row }">
                    <span :class="{ neg: row.ScrapeFailures > 0 }">{{ row.Scrapes }}<template v-if="row.ScrapeFailures"> · {{ row.ScrapeFailures }} ✗</template></span>
                </template>
                <template #cell-MedianAgeHours="{ row }">{{ fmtHours(row.MedianAgeHours) }}</template>
                <template #cell-Actions="{ row }">
                    <button v-if="can('memescraper.scrape.run') && row.Registered" class="ot-btn ghost sm" :disabled="isScraping(row) || actions.requesting.value"
                            :title="isScraping(row) ? 'Scraping now…' : `Scrape @${row.Username} now`" @click.stop="actions.scrapeSource(row)">▶</button>
                </template>
            </OmniTraderDataTable>
        </OmniTraderCard>

        <MemeScraperSourceDrawer :open="!!drawerUser" :source="drawerSource" :range="d?.Range ?? null" :all-niches="d?.Options.Niches"
                                 @close="drawerUser = null" @open-reel="reelId = $event" @filter="filterTo" />
        <MemeScraperReelDrawer :open="!!reelId" :post-id="reelId" @close="reelId = null" @source="drawerUser = $event" />
        <MemeScraperAddSourceModal :open="addOpen" :existing-niches="d?.Options.Niches" :existing-sources="d?.Options.Sources" @close="addOpen = false" />
    </MemeScraperShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAccess } from '~/composables/useAccess';
import {
    STATE_LABEL, fmtRel, fmtDue, fmtHours, fmtStamp, stateTone, useMemeActions, useMemeDashboard, useMemeHealth, useMemeNow,
    type SourceRow, type SourceState,
} from '~/composables/useMemeScraper';
import { fmtCount } from '~/composables/useOmniTumblr';
import type { TableColumn } from '~/components/OmniTrader/DataTable.vue';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Sources · MemeScraper · Klives Management' });

const route = useRoute();
const router = useRouter();
const { can } = useAccess();
const now = useMemeNow();
const actions = useMemeActions();
const { health } = useMemeHealth();
const { data: d, error, loading, load, range } = useMemeDashboard();

const drawerUser = ref<string | null>(null);
const reelId = ref<string | null>(null);
const addOpen = ref(false);

type StateFilter = 'all' | 'healthy' | 'attention' | 'quiet' | 'paused' | 'removed';
const STATE_FILTERS: { key: StateFilter; label: string; states: SourceState[] }[] = [
    { key: 'all', label: 'All', states: [] },
    { key: 'healthy', label: 'Healthy', states: ['ok'] },
    { key: 'attention', label: 'Needs attention', states: ['bad', 'warn', 'idle'] },
    { key: 'quiet', label: 'Quiet', states: ['quiet'] },
    { key: 'paused', label: 'Paused', states: ['paused'] },
    { key: 'removed', label: 'Removed', states: ['removed'] },
];
const stateFilter = computed<StateFilter>(() => {
    const v = route.query.state;
    return STATE_FILTERS.some(f => f.key === v) ? (v as StateFilter) : 'all';
});
function setState(key: StateFilter) {
    const query = { ...route.query };
    if (key === 'all') delete query.state; else query.state = key;
    void router.replace({ query });
}

const all = computed(() => d.value?.Sources ?? []);
const counts = computed(() => {
    const out: Record<string, number> = { all: all.value.length };
    for (const f of STATE_FILTERS.slice(1)) out[f.key] = all.value.filter(s => f.states.includes(s.State)).length;
    return out;
});
const rows = computed(() => {
    const f = STATE_FILTERS.find(x => x.key === stateFilter.value)!;
    return f.states.length ? all.value.filter(s => f.states.includes(s.State)) : all.value;
});
const maxShare = computed(() => Math.max(1, ...all.value.map(s => s.Share)));
const reelSources = computed(() => all.value.filter(s => s.Registered && s.DownloadReels).length);

const subtitle = computed(() => {
    const lib = d.value?.Library;
    if (!lib) return 'Loading…';
    const parts = [`${lib.Sources} source${lib.Sources === 1 ? '' : 's'}`, `${lib.ReelSources} downloading reels`];
    if (lib.FailingSources) parts.push(`${lib.FailingSources} failing`);
    if (lib.PausedSources) parts.push(`${lib.PausedSources} paused`);
    if (counts.value.quiet) parts.push(`${counts.value.quiet} quiet`);
    return parts.join(' · ');
});

const STATE_ORDER: Record<string, number> = { bad: 0, warn: 1, idle: 2, quiet: 3, ok: 4, paused: 5, removed: 6 };
const columns: TableColumn[] = [
    { key: 'Username', label: 'Source', searchValue: (r: SourceRow) => `${r.Username} ${r.FullName ?? ''} ${r.Niches.join(' ')}`, sortValue: (r: SourceRow) => r.Username.toLowerCase() },
    { key: 'State', label: 'State', sortValue: (r: SourceRow) => STATE_ORDER[r.State] ?? 9, searchValue: (r: SourceRow) => STATE_LABEL[r.State] },
    { key: 'Downloaded', label: 'Reels', num: true },
    { key: 'Share', label: 'Share', width: '150px' },
    { key: 'Spark', label: 'Trend', sortable: false, width: '110px' },
    { key: 'MedianViews', label: 'Median views', num: true },
    { key: 'TotalReels', label: 'Ever', num: true },
    { key: 'LastDownloadUtc', label: 'Last reel', sortValue: (r: SourceRow) => r.LastDownloadUtc ?? '' },
    { key: 'NextScrapeDueUtc', label: 'Next scrape', sortValue: (r: SourceRow) => (r.DownloadReels && r.Registered ? r.NextScrapeDueUtc ?? 'z' : 'zz') },
    { key: 'Niches', label: 'Niches', optional: true, sortValue: (r: SourceRow) => r.Niches.join(',') },
    { key: 'Followers', label: 'Followers', num: true, optional: true },
    { key: 'Scrapes', label: 'Scrapes', num: true, optional: true },
    { key: 'MedianAgeHours', label: 'Freshness', num: true, optional: true },
    { key: 'Actions', label: '', sortable: false, width: '44px' },
];

function rowClass(row: SourceRow) {
    return row.State === 'bad' ? 'attention' : '';
}

function delta(current: number, previous: number) {
    const diff = current - previous;
    return diff === 0 ? '±0' : `${diff > 0 ? '+' : '−'}${Math.abs(diff).toLocaleString()}`;
}

function isScraping(row: SourceRow) {
    return !!health.value?.CurrentScrape?.startsWith(`@${row.Username} (`);
}

const drawerSource = computed(() => all.value.find(s => s.Username.toLowerCase() === drawerUser.value?.toLowerCase()) ?? null);

function filterTo(username: string) {
    drawerUser.value = null;
    range.setSources([username]);
}
</script>

<style scoped>
.who { display: inline-flex; align-items: center; gap: var(--ot-space-2); min-width: 0; }
.handle { font-weight: 600; }
.cellstack.right { align-items: flex-end; }
.share { display: inline-flex; align-items: center; gap: var(--ot-space-2); width: 100%; }
.share .track { position: relative; flex: 1 1 auto; height: 8px; border-radius: 4px; background: rgba(255, 255, 255, 0.05); overflow: hidden; min-width: 50px; }
.share .fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 4px; background: var(--ot-cat-1); }
.share .pct { font-family: var(--ot-mono); font-size: 11.5px; color: var(--ot-text-2); min-width: 40px; text-align: right; }
.spark { display: block; width: 96px; }
.niches { display: inline-flex; gap: 4px; align-items: center; }
.running { color: var(--ot-accent); }
.late { color: var(--ot-warning); }
.neg { color: var(--ot-negative); }
.ot-segment .count { margin-left: 4px; font-family: var(--ot-mono); color: var(--ot-muted); font-size: 10.5px; }
.ot-segment button[aria-pressed='true'] .count { color: inherit; }
.ot-segment button:disabled { opacity: 0.4; cursor: default; }
</style>
