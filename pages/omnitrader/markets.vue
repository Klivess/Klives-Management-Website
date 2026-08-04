<template>
    <OmniTraderShell>
        <!-- Global controls: everything here re-scopes the whole page. Anything that
             changes one card lives in that card's own header. -->
        <div class="ot-filterbar">
            <label class="ot-field auto">
                <span class="visually-hidden">Watchlist</span>
                <select class="ot-select auto" v-model="filters.watchlist" @change="load">
                    <option v-if="!watchlists.length" value="">No watchlists yet</option>
                    <option v-for="w in watchlists" :key="w.Id" :value="w.Id">
                        {{ w.Name }} ({{ w.InstrumentIds.length }})
                    </option>
                </select>
            </label>

            <div class="ot-segment" role="group" aria-label="Timeframe">
                <button v-for="i in INTERVALS" :key="i.value" type="button"
                        :aria-pressed="filters.interval === i.value"
                        @click="filters.interval = i.value; load()">{{ i.label }}</button>
            </div>

            <span class="summary">
                <b>{{ rows.length }}</b> instruments
                <span class="sep" aria-hidden="true">·</span>
                {{ intervalLabel }} bars
                <span class="sep" aria-hidden="true">·</span>
                <span :class="staleCount ? 'neg' : ''">{{ staleCount }} stale</span>
            </span>

            <div class="grow"></div>
            <button class="ot-btn ghost" @click="renameWatchlist">Rename</button>
            <button class="ot-btn ghost" @click="newWatchlist">New list</button>
            <button class="ot-btn" :disabled="loading" @click="load">{{ loading ? 'Evaluating…' : 'Re-evaluate' }}</button>
        </div>

        <div v-if="staleCount" class="ot-banner warn">
            <span class="glyph" aria-hidden="true">⚠</span>
            <div>
                <strong>{{ staleCount }} instrument(s) are running on stale data</strong>
                Their prices are underlined below with the reason. Automated actions on a stale
                instrument are blocked by the data-integrity layer.
            </div>
        </div>

        <div class="ot-kpis">
            <!-- Tone only once there is a reading: an unmeasured breadth is not a bad one. -->
            <OmniTraderKpi label="Advancing" :tone="breadth ? (breadth.AdvancingPercent >= 50 ? 'good' : 'bad') : ''"
                           :value="fmtPct(breadth?.AdvancingPercent, 0)" :loading="loading && !rows.length"
                           :foot="`of ${breadth?.Members ?? 0} members, last session`"
                           help="Share of the watchlist that closed up. Direction without participation is a narrow move." />
            <OmniTraderKpi label="Above trend" :tone="breadth ? (breadth.AboveTrendPercent >= 50 ? 'good' : 'warn') : ''"
                           :value="fmtPct(breadth?.AboveTrendPercent, 0)" :loading="loading && !rows.length"
                           foot="participation, not just direction" />
            <OmniTraderKpi label="Clean breakouts" tone="info" :value="String(breakoutCount)"
                           :loading="loading && !rows.length" foot="quality above 0.5 on this bar" />
            <OmniTraderKpi label="Trending up" :value="String(regimeCounts.TrendingUp ?? 0)"
                           :loading="loading && !rows.length"
                           :foot="`${regimeCounts.RangeBound ?? 0} ranging · ${regimeCounts.Volatile ?? 0} volatile`" />
            <OmniTraderKpi label="Session" small :value="session?.LondonOpen ? 'London open' : 'London closed'"
                           :loading="loading && !rows.length" foot="crypto trades 24/7; CFDs do not" />
        </div>

        <!-- Adding an instrument is one gesture, not a modal and a save: type, then drag the
             card onto the watchlist (or press ＋). Each match is evaluated, because whether
             something is worth watching is a judgement about its price action. -->
        <OmniTraderCard title="Add instruments"
                        :subtitle="addSubtitle">
            <template #controls>
                <span v-if="addBusy" class="ot-chip">saving…</span>
                <span v-else-if="justAdded" class="ot-chip ok">{{ justAdded }} added</span>
            </template>

            <label class="ot-search wide">
                <span class="visually-hidden">Search for an instrument</span>
                <input class="ot-input" type="search" v-model="search" @input="searchInstruments"
                       placeholder="btc, aapl, vod.l, ^ftse, gold…" />
            </label>

            <div v-if="searching" class="ot-skelrows" aria-busy="true">
                <div class="ot-skel" style="width:100%;height:96px"></div>
            </div>

            <div v-else-if="searchResults.length" class="minigrid">
                <OmniTraderInstrumentCard v-for="match in searchResults" :key="match.WatchKey"
                                          :row="match.Row" :name="match.DisplayName"
                                          :asset-class="match.AssetClass" :exchange="match.Exchange ?? undefined"
                                          :watch-key="match.WatchKey" :watched="watchedIds.has(match.WatchKey)"
                                          @add="addInstrument(match.WatchKey, match.DisplayName)" />
            </div>

            <OmniTraderStateBlock v-else-if="search.trim().length >= 2" compact kind="filtered"
                                  title="No matches"
                                  detail="Search any stock, crypto pair or index. You can watch and chart something even if no venue mapping exists yet." />

            <OmniTraderStateBlock v-else compact
                                  title="Search to add"
                                  detail="Type at least two characters. Drag a result onto the watchlist below, or press ＋ on it." />
        </OmniTraderCard>

        <div class="ot-grid sidebar">
            <div class="dropzone" :class="{ over: dragOver }"
                 @dragenter.prevent="onDragEnter" @dragover.prevent="onDragOver"
                 @dragleave="onDragLeave" @drop.prevent="onDrop">
                <div v-if="dragOver" class="dropbanner" aria-hidden="true">Drop to add to “{{ watchlistName }}”</div>
                <OmniTraderCard title="Watchlist" :subtitle="`Ranked by momentum on ${intervalLabel} bars`" flush
                                :loading="loading" :empty="!rows.length"
                                empty-title="Nothing to evaluate"
                                empty-text="Search above, then drag an instrument here — or press ＋ on it.">
                    <template #controls>
                        <span class="ot-chip">click a row to open its chart</span>
                    </template>
                    <OmniTraderDataTable :rows="rows" :columns="columns" label="instruments" pinned selectable
                                         :row-key="r => r.InstrumentId" 
                                         default-sort="MomentumScore" search-placeholder="Filter instruments…"
                                         :row-class="r => r.Stale ? 'attention' : ''"
                                         @select="openInstrument($event.InstrumentId)">
                        <template #cell-DisplayName="{ row }">
                            <span class="cellstack">
                                <span>{{ row.DisplayName }}</span>
                                <span class="sub">{{ row.AssetClass }}</span>
                            </span>
                        </template>
                        <template #cell-Spark="{ row }">
                            <OmniTraderSparkline v-if="row.Spark?.length > 1" :values="row.Spark" :height="24"
                                                 :label="`${row.DisplayName} price`" style="width:80px" />
                            <span v-else class="muted">—</span>
                        </template>
                        <template #cell-Price="{ row }">
                            <span class="cellstack">
                                <span :class="{ 'ot-stale': row.Stale }" :title="row.DataIssue ?? ''">{{ fmtNum(row.Price, 6) }}</span>
                                <!-- A shut exchange is not a broken feed, and must not read like one. -->
                                <span v-if="row.Stale" class="sub" style="color:var(--ot-warning)">stale</span>
                                <span v-else-if="row.MarketClosed" class="sub muted">market closed</span>
                            </span>
                        </template>
                        <template #cell-ChangePercent24h="{ row }">
                            <span :class="row.ChangePercent24h >= 0 ? 'pos' : 'neg'">
                                {{ fmtSignedPct(row.ChangePercent24h) }}
                            </span>
                        </template>
                        <template #cell-Regime="{ row }">
                            <span class="cellstack">
                                <span class="ot-chip" :class="regimeTone(row.Regime)">{{ regimeLabel(row.Regime) }}</span>
                                <span class="sub">{{ (row.RegimeConfidence * 100).toFixed(0) }}% confidence</span>
                            </span>
                        </template>
                        <template #cell-MomentumScore="{ row }">
                            <span :class="row.MomentumScore >= 0 ? 'pos' : 'neg'">{{ fmtNum(row.MomentumScore, 1) }}</span>
                        </template>
                        <template #cell-Breakout="{ row }">
                            <span v-if="row.BreakoutDirection === 0" class="ot-chip">in range</span>
                            <span v-else class="ot-chip"
                                  :class="row.BreakoutQuality > 0.5 ? (row.BreakoutDirection > 0 ? 'ok' : 'bad') : 'warn'">
                                {{ row.BreakoutDirection > 0 ? '▲ up' : '▼ down' }} {{ (row.BreakoutQuality * 100).toFixed(0) }}
                            </span>
                        </template>
                        <template #cell-AlignmentScore="{ row }">
                            <span :class="row.AlignmentScore > 0 ? 'pos' : row.AlignmentScore < 0 ? 'neg' : ''">
                                {{ row.AlignmentScore.toFixed(2) }}
                            </span>
                        </template>
                        <template #cell-AnnualizedVolatility="{ row }">{{ fmtPct(row.AnnualizedVolatility, 0) }}</template>
                        <template #cell-AverageQuoteVolume="{ row }">{{ fmtCompact(row.AverageQuoteVolume) }}</template>
                        <template #cell-EstimatedSpreadPercent="{ row }">{{ fmtPct(row.EstimatedSpreadPercent, 3) }}</template>
                        <template #cell-TradableOn="{ row }">
                            <span v-for="v in row.TradableOn" :key="v" class="ot-chip venue">{{ v }}</span>
                            <span v-if="!row.TradableOn.length" class="ot-chip warn">unmapped</span>
                        </template>
                        <template #cell-actions="{ row }">
                            <button class="ot-btn sm ghost" :disabled="addBusy"
                                    :title="`Remove ${row.DisplayName} from this watchlist`"
                                    @click.stop="removeInstrument(row.InstrumentId, row.DisplayName)">✕</button>
                        </template>
                    </OmniTraderDataTable>
                </OmniTraderCard>
            </div>

            <div class="ot-stack">
                <OmniTraderCard title="Momentum leaders">
                    <OmniTraderBarList :items="momentumBars" :format="v => v.toFixed(1)" :limit="10"
                                       empty-title="Nothing evaluated yet"
                                       :on-select="openInstrument" />
                </OmniTraderCard>

                <OmniTraderCard title="Regime mix">
                    <OmniTraderBarList :items="regimeBars" :format="v => `${v}`" :signed="false"
                                       empty-title="Nothing evaluated yet" />
                    <template #footer>
                        Regime is classified from the same candles the strategies read.
                    </template>
                </OmniTraderCard>

                <OmniTraderCard title="Liquidity risk">
                    <OmniTraderBarList :items="spreadBars" :format="v => `${v.toFixed(3)}%`" :signed="false"
                                       :limit="6" empty-title="Nothing evaluated yet" />
                    <template #footer>Estimated spread, widest first. High spread erodes an edge before it starts.</template>
                </OmniTraderCard>
            </div>
        </div>

    </OmniTraderShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import Swal from 'sweetalert2';
import {
    useOmniTrader, useUrlState, fmtNum, fmtPct, fmtSignedPct, fmtCompact,
    regimeTone, regimeLabel, INSTRUMENT_MIME, SWAL_THEME, type MarketRow,
} from '~/composables/useOmniTrader';
import type { TableColumn } from '~/components/OmniTrader/DataTable.vue';

definePageMeta({ layout: 'navbar' });

const router = useRouter();
const { get, post } = useOmniTrader();

const INTERVALS = [
    { value: 'FifteenMinute', label: '15m' }, { value: 'OneHour', label: '1h' },
    { value: 'FourHour', label: '4h' }, { value: 'OneDay', label: '1d' },
];

// Filters live in the URL so a view can be linked, bookmarked and returned to.
const { state: filters } = useUrlState({ watchlist: '', interval: 'OneHour' });

const watchlists = ref<Array<{ Id: string; Name: string; InstrumentIds: string[] }>>([]);
const rows = ref<MarketRow[]>([]);
const breadth = ref<any>(null);
const session = ref<any>(null);
const loading = ref(false);
const busy = ref(false);

interface SearchMatch {
    Row: MarketRow | null;
    Symbol: string;
    Exchange: string | null;
    InstrumentId: string | null;
    DisplayName: string;
    AssetClass: string;
    WatchKey: string;
    TradableOn: string[];
    Tradable: boolean;
}

const search = ref('');
const searching = ref(false);
const searchResults = ref<SearchMatch[]>([]);
const addBusy = ref(false);
const justAdded = ref('');
const dragOver = ref(false);
// Drag events fire for every child element entered, so a plain leave handler flickers the
// highlight. Counting enters and leaves is what keeps it steady.
let dragDepth = 0;

const columns: TableColumn[] = [
    { key: 'DisplayName', label: 'Instrument', width: '190px' },
    { key: 'Spark', label: 'Trend', sortable: false, width: '92px' },
    { key: 'Price', label: 'Price', num: true },
    { key: 'ChangePercent24h', label: '24h', num: true },
    { key: 'Regime', label: 'Regime', sortValue: r => r.Regime },
    { key: 'MomentumScore', label: 'Momentum', num: true },
    { key: 'Breakout', label: 'Breakout', sortValue: r => r.BreakoutDirection * r.BreakoutQuality },
    { key: 'AlignmentScore', label: 'Alignment', num: true },
    { key: 'AnnualizedVolatility', label: 'Vol', num: true, optional: true },
    { key: 'AverageQuoteVolume', label: 'Liquidity', num: true, optional: true },
    { key: 'EstimatedSpreadPercent', label: 'Spread', num: true, optional: true },
    { key: 'TradableOn', label: 'Venues', sortable: false },
    { key: 'actions', label: '', sortable: false, num: true, width: '48px' },
];

const intervalLabel = computed(() => INTERVALS.find(i => i.value === filters.interval)?.label ?? filters.interval);
const staleCount = computed(() => rows.value.filter(r => r.Stale).length);
const watchlistName = computed(() =>
    watchlists.value.find(w => w.Id === filters.watchlist)?.Name ?? 'this watchlist');
const watchedIds = computed(() => new Set(
    (watchlists.value.find(w => w.Id === filters.watchlist)?.InstrumentIds ?? [])));
const addSubtitle = computed(() =>
    `Drag onto “${watchlistName.value}”, or press ＋ — saved immediately`);
const breakoutCount = computed(() => rows.value.filter(r => r.BreakoutDirection !== 0 && r.BreakoutQuality > 0.5).length);

const regimeCounts = computed(() => {
    const counts: Record<string, number> = {};
    for (const row of rows.value) counts[row.Regime] = (counts[row.Regime] ?? 0) + 1;
    return counts;
});

const momentumBars = computed(() => rows.value.map(r => ({
    key: r.InstrumentId, label: r.DisplayName, value: r.MomentumScore,
    secondary: `${regimeLabel(r.Regime)} · ${fmtSignedPct(r.ChangePercent24h)} over 24h`,
})));

const regimeBars = computed(() => Object.entries(regimeCounts.value)
    .map(([regime, count]) => ({ key: regime, label: regimeLabel(regime), value: count })));

const spreadBars = computed(() => rows.value
    .filter(r => r.EstimatedSpreadPercent > 0)
    .map(r => ({ key: r.InstrumentId, label: r.DisplayName, value: r.EstimatedSpreadPercent })));

// A watchlist row is a jumping-off point, not the whole story: open the instrument's own
// page, where the candles, the live quote and the position all live.
function openInstrument(instrumentId: string) {
    void router.push({ path: '/omnitrader/instrument', query: { symbol: instrumentId, interval: filters.interval } });
}

async function loadWatchlists() {
    watchlists.value = await get('/markets/watchlists');
    if (!filters.watchlist && watchlists.value.length) filters.watchlist = watchlists.value[0].Id;
}

async function load() {
    loading.value = true;
    try {
        const data = await get<any>('/markets', { watchlist: filters.watchlist, interval: filters.interval });
        rows.value = data.Rows ?? [];
        breadth.value = data.Breadth;
        session.value = data.Session;
    } catch (e: any) {
        Swal.fire({ title: 'Could not evaluate markets', text: e?.message, icon: 'error', ...SWAL_THEME });
    } finally { loading.value = false; }
}

// ── adding and removing instruments ──────────────────────────────────────────

let searchTimer: ReturnType<typeof setTimeout> | null = null;
let searchToken = 0;

function searchInstruments() {
    if (searchTimer) clearTimeout(searchTimer);
    if (search.value.trim().length < 2) {
        searchResults.value = [];
        searching.value = false;
        return;
    }
    // Debounced, and each result set carries a token: every match costs a candle fetch, so a
    // slow early query must never land on top of a newer one's answers.
    searching.value = true;
    searchTimer = setTimeout(async () => {
        const token = ++searchToken;
        try {
            // The evaluated search, not just the instrument master: anything listed can be
            // watched and charted, whether or not the firm can deal it yet.
            const found = await get<SearchMatch[]>('/markets/search', {
                q: search.value, interval: filters.interval,
            });
            if (token !== searchToken) return;
            searchResults.value = found ?? [];
        } catch {
            if (token === searchToken) searchResults.value = [];
        } finally {
            if (token === searchToken) searching.value = false;
        }
    }, 300);
}

// Interval changes what the mini cards mean, so re-evaluate whatever is on screen.
watch(() => filters.interval, () => { if (searchResults.value.length) searchInstruments(); });

async function toggleInstrument(id: string, name: string, remove: boolean) {
    if (!id || addBusy.value) return;
    addBusy.value = true;
    try {
        // The server does the read-modify-write, so two tabs cannot overwrite each other's
        // additions and the page never has to hold a draft copy of the list.
        await post('/markets/watchlist/instrument', undefined, {
            WatchlistId: filters.watchlist, InstrumentId: id, Remove: remove,
        });
        justAdded.value = remove ? '' : name;
        if (!remove) setTimeout(() => { if (justAdded.value === name) justAdded.value = ''; }, 2500);
        await loadWatchlists();
        await load();
    } catch (e: any) {
        Swal.fire({
            title: remove ? 'Could not remove' : 'Could not add', text: e?.message,
            icon: 'error', ...SWAL_THEME,
        });
    } finally { addBusy.value = false; }
}

const addInstrument = (id: string, name: string) => toggleInstrument(id, name, false);
const removeInstrument = (id: string, name: string) => toggleInstrument(id, name, true);

function onDragEnter(event: DragEvent) {
    if (!event.dataTransfer?.types.includes(INSTRUMENT_MIME)) return;
    dragDepth++;
    dragOver.value = true;
}

function onDragOver(event: DragEvent) {
    if (!event.dataTransfer?.types.includes(INSTRUMENT_MIME)) return;
    event.dataTransfer.dropEffect = 'copy';
}

function onDragLeave() {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dragOver.value = false;
}

function onDrop(event: DragEvent) {
    dragDepth = 0;
    dragOver.value = false;
    const id = event.dataTransfer?.getData(INSTRUMENT_MIME);
    if (!id || watchedIds.value.has(id)) return;
    const match = searchResults.value.find(m => m.WatchKey === id);
    void addInstrument(id, match?.DisplayName ?? id);
}

// ── watchlist management ─────────────────────────────────────────────────────

async function renameWatchlist() {
    const current = watchlists.value.find(w => w.Id === filters.watchlist);
    if (!current) return;
    const answer = await Swal.fire({
        title: 'Rename watchlist', input: 'text', inputValue: current.Name,
        showCancelButton: true, ...SWAL_THEME,
    });
    if (!answer.isConfirmed || !answer.value) return;
    await saveList(current.Id, answer.value, current.InstrumentIds);
}

async function newWatchlist() {
    const answer = await Swal.fire({
        title: 'New watchlist', input: 'text', inputPlaceholder: 'e.g. Majors',
        showCancelButton: true, ...SWAL_THEME,
    });
    if (!answer.isConfirmed || !answer.value) return;
    await saveList('', answer.value, []);
}

async function saveList(id: string, name: string, instrumentIds: string[]) {
    busy.value = true;
    try {
        const saved = await post<any>('/markets/watchlist/save', undefined, {
            Id: id, Name: name, InstrumentIds: instrumentIds,
        });
        await loadWatchlists();
        filters.watchlist = saved.Id;
        await load();
    } catch (e: any) {
        Swal.fire({ title: 'Save failed', text: e?.message, icon: 'error', ...SWAL_THEME });
    } finally { busy.value = false; }
}

onMounted(async () => {
    await loadWatchlists();
    await load();
});
</script>

<style scoped>
/* Search results: as many mini cards as the width allows, one row deep before it wraps.
   Auto-fill rather than a fixed count, so a wide monitor shows more instead of stretching. */
.minigrid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: var(--ot-space-3);
    max-height: 420px;
    overflow-y: auto;
}
.ot-search.wide { display: block; margin-bottom: var(--ot-space-3); }
.ot-search.wide .ot-input { width: 100%; }

/* The drop target is the whole watchlist card, so the gesture does not require aim. */
.dropzone { position: relative; border-radius: var(--ot-radius); min-width: 0; }
.dropzone.over { outline: 2px dashed var(--ot-accent); outline-offset: 3px; }
.dropbanner {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--ot-radius);
    background: rgba(11, 13, 10, 0.72);
    color: var(--ot-accent);
    font-size: 14px;
    font-weight: 600;
    pointer-events: none;
}

.ot-chip.venue { margin-right: 4px; }
.ot-field.auto { width: auto; }
.visually-hidden {
    position: absolute; width: 1px; height: 1px; overflow: hidden;
    clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap;
}
</style>
