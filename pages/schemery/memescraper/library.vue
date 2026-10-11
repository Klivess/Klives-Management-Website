<template>
    <MemeScraperShell>
        <div class="ot-pagehead">
            <div>
                <h1>Library</h1>
                <p class="subtitle">{{ subtitle }}</p>
            </div>
            <div class="ot-actions">
                <button class="ot-btn ghost" :disabled="exporting || !page?.Filtered" :title="page ? `Download the ${page.Filtered.toLocaleString()} matching reels as CSV` : undefined" @click="exportCsv">
                    {{ exporting ? 'Exporting…' : 'Export CSV' }}
                </button>
            </div>
        </div>

        <MemeScraperRangeBar :range-view="page?.Range" :options="page?.Options" :loading="loading" :show-granularity="false" :show-baseline="false" />

        <div class="ot-filterbar libtools" role="group" aria-label="Library filters">
            <label class="ot-search">
                <span class="glyph" aria-hidden="true">⌕</span>
                <input v-model="searchDraft" class="ot-input" type="search" placeholder="Caption, @account or shortcode…" aria-label="Search the library" />
            </label>
            <select class="ot-select auto" :value="String(minViews ?? '')" aria-label="Minimum views" @change="set({ minViews: ($event.target as HTMLSelectElement).value || null })">
                <option value="">Any views</option>
                <option v-for="v in VIEW_FLOORS" :key="v" :value="String(v)">{{ fmtCount(v) }}+ views</option>
            </select>
            <select class="ot-select auto" :value="via ?? ''" aria-label="Found via" @change="set({ via: ($event.target as HTMLSelectElement).value || null })">
                <option value="">Any provider</option>
                <option value="inflact">inflact.com</option>
                <option value="instagram">Instagram (direct)</option>
            </select>
            <select class="ot-select auto" :value="sort" aria-label="Sort by" @change="set({ sort: ($event.target as HTMLSelectElement).value === 'downloaded' ? null : ($event.target as HTMLSelectElement).value })">
                <option v-for="s in SORTS" :key="s.key" :value="s.key">{{ s.label }}</option>
            </select>
            <button class="ot-btn ghost sm" :title="descending ? 'Highest / newest first' : 'Lowest / oldest first'" @click="set({ dir: descending ? 'asc' : null })">{{ descending ? '↓' : '↑' }}</button>
            <span class="grow"></span>
            <div class="ot-segment sm" role="group" aria-label="View">
                <button type="button" :aria-pressed="view === 'grid'" @click="set({ view: null })">Grid</button>
                <button type="button" :aria-pressed="view === 'table'" @click="set({ view: 'table' })">Table</button>
            </div>
        </div>

        <div v-if="error && !page" class="ot-banner" role="alert">
            <span class="glyph" aria-hidden="true">⚠</span>
            <div><strong>The library could not load</strong> {{ error }}</div>
            <div class="actions"><button class="ot-btn sm" @click="fetchPage">Retry</button></div>
        </div>

        <template v-if="!page && !error">
            <div class="libgrid">
                <div v-for="n in 12" :key="n" class="ot-skel" style="height:280px"></div>
            </div>
        </template>

        <OmniTraderCard v-else-if="page && !page.Rows.length" :empty="true" :empty-kind="hasNarrowing ? 'filtered' : 'empty'"
                        :empty-title="hasNarrowing ? 'No reels match' : 'No reels downloaded in this window'"
                        :empty-text="hasNarrowing ? 'Loosen the search or filters, or widen the date range.' : 'Pick a longer range, or run a scrape.'" />

        <template v-else-if="page">
            <div v-if="view === 'grid'" class="libgrid" :class="{ dim: loading }">
                <MemeScraperReelCard v-for="r in page.Rows" :key="r.PostID" :reel="r" @open="reelId = $event" />
            </div>
            <OmniTraderCard v-else flush :class="{ dim: loading }">
                <div class="ot-tablewrap">
                    <table class="ot-table">
                        <thead>
                            <tr>
                                <th style="width:52px"></th>
                                <th>Account</th>
                                <th>Caption</th>
                                <th class="num sortable" @click="sortBy('views')">Views <span v-if="sort === 'views'" class="sort">{{ descending ? '▼' : '▲' }}</span></th>
                                <th class="num sortable" @click="sortBy('likes')">Likes <span v-if="sort === 'likes'" class="sort">{{ descending ? '▼' : '▲' }}</span></th>
                                <th class="num sortable" @click="sortBy('comments')">Comments <span v-if="sort === 'comments'" class="sort">{{ descending ? '▼' : '▲' }}</span></th>
                                <th class="num sortable" @click="sortBy('engagement')">Eng. <span v-if="sort === 'engagement'" class="sort">{{ descending ? '▼' : '▲' }}</span></th>
                                <th class="sortable" @click="sortBy('posted')">Posted <span v-if="sort === 'posted'" class="sort">{{ descending ? '▼' : '▲' }}</span></th>
                                <th class="sortable" @click="sortBy('downloaded')">Saved <span v-if="sort === 'downloaded'" class="sort">{{ descending ? '▼' : '▲' }}</span></th>
                                <th class="num sortable" @click="sortBy('age')">Age <span v-if="sort === 'age'" class="sort">{{ descending ? '▼' : '▲' }}</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="r in page.Rows" :key="r.PostID" class="clickable" tabindex="0" @click="reelId = r.PostID" @keydown.enter="reelId = r.PostID">
                                <td><OmniTumblrThumb :path="r.VideoExists === false ? null : reelThumbPath(r.PostID)" kind="Video" size="xs" /></td>
                                <td><button type="button" class="ms-linkbtn" :title="`Show only @${r.Owner}`" @click.stop="range.setSources([r.Owner])">@{{ r.Owner }}</button></td>
                                <td class="caption" :title="r.Description ?? undefined">{{ r.Description || '—' }}</td>
                                <td class="num">{{ fmtCount(r.Views) }}</td>
                                <td class="num">{{ r.Likes ? fmtCount(r.Likes) : '—' }}</td>
                                <td class="num">{{ fmtCount(r.Comments) }}</td>
                                <td class="num">{{ r.EngagementPct != null ? `${r.EngagementPct.toFixed(1)}%` : '—' }}</td>
                                <td class="nowrap" :title="fmtStamp(r.PostedUtc)">{{ fmtRel(r.PostedUtc, now, '—') }}</td>
                                <td class="nowrap" :title="fmtStamp(r.DownloadedUtc)">{{ fmtRel(r.DownloadedUtc, now, '—') }}</td>
                                <td class="num">{{ fmtHours(r.AgeHours) }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </OmniTraderCard>

            <div class="pager">
                <button class="ot-btn ghost sm" :disabled="pageIndex === 0 || loading" @click="goPage(pageIndex - 1)">← Previous</button>
                <span>{{ (page.Offset + 1).toLocaleString() }}–{{ (page.Offset + page.Rows.length).toLocaleString() }} of {{ page.Filtered.toLocaleString() }}</span>
                <button class="ot-btn ghost sm" :disabled="page.Offset + page.Rows.length >= page.Filtered || loading" @click="goPage(pageIndex + 1)">Next →</button>
                <span class="grow"></span>
                <select class="ot-select auto" :value="String(pageSize)" aria-label="Reels per page" @change="set({ size: ($event.target as HTMLSelectElement).value === '48' ? null : ($event.target as HTMLSelectElement).value, page: null })">
                    <option v-for="n in [24, 48, 96, 192]" :key="n" :value="String(n)">{{ n }} per page</option>
                </select>
            </div>
        </template>

        <MemeScraperReelDrawer :open="!!reelId" :post-id="reelId" @close="reelId = null" @source="showOnly" />
    </MemeScraperShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
    downloadFile, fmtRel, fmtDayRange, fmtHours, fmtStamp, msGet, reelThumbPath, toast, useMemeDataVersion, useMemeNow, useMemeRange,
    type ReelPage,
} from '~/composables/useMemeScraper';
import { fmtCount, q } from '~/composables/useOmniTumblr';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Library · MemeScraper · Klives Management' });

const VIEW_FLOORS = [1_000, 10_000, 100_000, 1_000_000, 10_000_000];
const SORTS = [
    { key: 'downloaded', label: 'Newest downloads' },
    { key: 'posted', label: 'Newest on Instagram' },
    { key: 'views', label: 'Most views' },
    { key: 'likes', label: 'Most likes' },
    { key: 'comments', label: 'Most comments' },
    { key: 'engagement', label: 'Best engagement' },
    { key: 'age', label: 'Age when saved' },
    { key: 'owner', label: 'Account' },
];

const route = useRoute();
const router = useRouter();
const now = useMemeNow();
const range = useMemeRange();
const { version } = useMemeDataVersion();

const page = ref<ReelPage | null>(null);
const error = ref<string | null>(null);
const loading = ref(false);
const exporting = ref(false);
const reelId = ref<string | null>(null);

const str = (key: string) => (typeof route.query[key] === 'string' && (route.query[key] as string).trim() ? (route.query[key] as string).trim() : null);
const search = computed(() => str('q'));
const minViews = computed(() => (str('minViews') ? Number(str('minViews')) : null));
const via = computed(() => str('via'));
const sort = computed(() => (SORTS.some(s => s.key === str('sort')) ? str('sort')! : 'downloaded'));
const descending = computed(() => str('dir') !== 'asc');
const view = computed(() => (str('view') === 'table' ? 'table' : 'grid'));
const pageSize = computed(() => {
    const n = Number(str('size'));
    return [24, 48, 96, 192].includes(n) ? n : 48;
});
const pageIndex = computed(() => Math.max(0, Number(str('page') ?? 1) - 1));
const hasNarrowing = computed(() => !!search.value || !!minViews.value || !!via.value || range.hasFilters.value);

function set(patch: Record<string, string | null>, keepPage = false) {
    const query: Record<string, any> = { ...route.query };
    for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') delete query[k];
        else query[k] = v;
    }
    if (!keepPage && !('page' in patch)) delete query.page;
    void router.replace({ query });
}

function sortBy(key: string) {
    if (sort.value === key) set({ dir: descending.value ? 'asc' : null });
    else set({ sort: key === 'downloaded' ? null : key, dir: null });
}

function goPage(index: number) {
    set({ page: index <= 0 ? null : String(index + 1) }, true);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Search is debounced so typing does not fire a request per key.
const searchDraft = ref(search.value ?? '');
let searchTimer: ReturnType<typeof setTimeout> | null = null;
watch(searchDraft, value => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        if ((value.trim() || null) !== search.value) set({ q: value.trim() || null });
    }, 350);
});
watch(search, value => { if ((value ?? '') !== searchDraft.value.trim()) searchDraft.value = value ?? ''; });

const params = computed(() => ({
    ...range.params.value,
    granularity: null,
    q: search.value,
    minViews: minViews.value,
    via: via.value,
    sort: sort.value,
    dir: descending.value ? 'desc' : 'asc',
    offset: pageIndex.value * pageSize.value,
    limit: pageSize.value,
}));

let controller: AbortController | null = null;
async function fetchPage() {
    controller?.abort();
    const mine = new AbortController();
    controller = mine;
    loading.value = true;
    try {
        const result = await msGet<ReelPage>(`/memescraper/reels${q(params.value)}`, mine.signal);
        if (mine.signal.aborted) return;
        if (result.ok && result.data) {
            page.value = result.data;
            error.value = null;
            // Past the end after a filter change: back to the last page that exists.
            if (!result.data.Rows.length && result.data.Filtered > 0 && pageIndex.value > 0) goPage(Math.floor((result.data.Filtered - 1) / pageSize.value));
        } else {
            error.value = result.error ?? 'The library could not be loaded.';
        }
    } catch (e) {
        if (!mine.signal.aborted) error.value = e instanceof Error ? e.message : String(e);
    } finally {
        if (controller === mine) loading.value = false;
    }
}

watch(() => JSON.stringify(params.value), () => { void fetchPage(); });
watch(version, () => { void fetchPage(); });
onMounted(fetchPage);
onBeforeUnmount(() => {
    controller?.abort();
    if (searchTimer) clearTimeout(searchTimer);
});

const subtitle = computed(() => {
    const p = page.value;
    if (!p) return 'Loading…';
    const span = p.Range.AllTime ? 'all time' : `saved ${fmtDayRange(p.Range.From, p.Range.To)}`;
    return `${p.Filtered.toLocaleString()} of ${p.Total.toLocaleString()} reels · ${span}`;
});

async function exportCsv() {
    exporting.value = true;
    try {
        const stamp = new Date().toISOString().slice(0, 10);
        const ok = await downloadFile(`/memescraper/reels${q({ ...params.value, offset: null, limit: null, format: 'csv' })}`, `memescraper-reels-${stamp}.csv`);
        if (!ok) toast('The export failed', 'error');
    } finally {
        exporting.value = false;
    }
}

function showOnly(owner: string) {
    reelId.value = null;
    range.setSources([owner]);
}
</script>

<style scoped>
.libtools { gap: var(--ot-space-2); }
.libtools .ot-search { flex: 1 1 240px; max-width: 380px; }
.libtools .ot-select { height: var(--ot-control); font-size: 12.5px; }
.libgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: var(--ot-space-3); margin-bottom: var(--ot-space-3); }
@media (max-width: 600px) { .libgrid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ot-space-2); } }
.dim { opacity: 0.55; transition: opacity var(--ot-normal); }
.caption { max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ot-text-2); }
.pager { display: flex; align-items: center; gap: var(--ot-space-2); padding: var(--ot-space-3) 0; font-size: 12px; color: var(--ot-text-2); flex-wrap: wrap; }
.pager .grow { flex: 1 1 auto; }
th.sortable { cursor: pointer; user-select: none; }
th.sortable:hover { color: var(--ot-text); }
th .sort { color: var(--ot-accent); }
</style>
