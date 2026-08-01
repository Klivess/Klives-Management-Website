<template>
    <OmniTraderShell>
        <div class="ot-pagehead">
            <div>
                <h1>Markets</h1>
                <p class="question">
                    What is worth trading right now? Regime, momentum, breakout quality, multi-timeframe
                    alignment, volatility and liquidity — the same shared analytics your strategies read.
                </p>
            </div>
        </div>

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
            <button class="ot-btn ghost" @click="openEditor">Edit watchlist</button>
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

        <div class="ot-grid sidebar">
            <OmniTraderCard title="Watchlist" :question="`Ranked by momentum on ${intervalLabel} bars`" flush
                            :loading="loading" :empty="!rows.length"
                            empty-title="Nothing to evaluate"
                            empty-text="Add instruments to this watchlist to see market context.">
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
                            <span v-if="row.Stale" class="sub" style="color:var(--ot-warning)">stale</span>
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
                </OmniTraderDataTable>
            </OmniTraderCard>

            <div class="ot-stack">
                <OmniTraderCard title="Momentum leaders" question="Which instruments are moving hardest?">
                    <OmniTraderBarList :items="momentumBars" :format="v => v.toFixed(1)" :limit="10"
                                       empty-title="Nothing evaluated yet"
                                       :on-select="openInstrument" />
                </OmniTraderCard>

                <OmniTraderCard title="Regime mix" question="Is this a trending tape or a chopping one?">
                    <OmniTraderBarList :items="regimeBars" :format="v => `${v}`" :signed="false"
                                       empty-title="Nothing evaluated yet" />
                    <template #footer>
                        Regime is classified from the same candles the strategies read.
                    </template>
                </OmniTraderCard>

                <OmniTraderCard title="Liquidity risk" question="Where would a fill cost the most?">
                    <OmniTraderBarList :items="spreadBars" :format="v => `${v.toFixed(3)}%`" :signed="false"
                                       :limit="6" empty-title="Nothing evaluated yet" />
                    <template #footer>Estimated spread, widest first. High spread erodes an edge before it starts.</template>
                </OmniTraderCard>
            </div>
        </div>

        <!-- watchlist editor -->
        <div v-if="editing" class="ot-modal-backdrop" @click.self="editing = false">
            <div class="ot-modal" role="dialog" aria-modal="true" aria-label="Edit watchlist">
                <header>
                    <h3>Edit watchlist</h3>
                    <button class="ot-btn ghost sm" @click="editing = false">Close ✕</button>
                </header>
                <div class="body">
                    <div class="ot-formgrid" style="margin-bottom:16px">
                        <div class="ot-field">
                            <label for="wl-name">Name</label>
                            <input id="wl-name" class="ot-input" v-model="editName" />
                        </div>
                        <div class="ot-field">
                            <label for="wl-search">Search any symbol</label>
                            <input id="wl-search" class="ot-input" v-model="search"
                                   placeholder="btc, aapl, vod.l, ^ftse…" @input="searchInstruments" />
                        </div>
                    </div>

                    <div class="ot-grid two">
                        <div>
                            <h4 class="ot-sectionhead">In this list ({{ editIds.length }})</h4>
                            <div class="picker">
                                <button v-for="id in editIds" :key="id" class="ot-chip ok pick"
                                        @click="editIds = editIds.filter(x => x !== id)">{{ id }} ✕</button>
                                <OmniTraderStateBlock v-if="!editIds.length" compact title="Empty list"
                                                      detail="Add instruments from the right." />
                            </div>
                        </div>
                        <div>
                            <h4 class="ot-sectionhead">Available</h4>
                            <div class="picker">
                                <button v-for="i in searchResults" :key="i.Symbol" class="ot-chip pick"
                                        :class="i.Tradable ? 'ok' : ''"
                                        :title="i.Tradable ? `Tradable on ${i.TradableOn.join(', ')}` : 'Chart and analytics only — no venue mapping'"
                                        :disabled="editIds.includes(i.InstrumentId ?? i.Symbol)"
                                        @click="addInstrument(i.InstrumentId ?? i.Symbol)">
                                    {{ i.DisplayName }} +
                                </button>
                                <OmniTraderStateBlock v-if="!searchResults.length" compact kind="filtered"
                                                      title="No matches"
                                                      detail="Search any stock, crypto pair or index — you can watch and chart it even if no venue mapping exists yet." />
                            </div>
                        </div>
                    </div>
                </div>
                <footer>
                    <button class="ot-btn ghost" @click="editing = false">Cancel</button>
                    <button class="ot-btn primary" :disabled="busy || !editName" @click="saveWatchlist">Save watchlist</button>
                </footer>
            </div>
        </div>
    </OmniTraderShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import Swal from 'sweetalert2';
import {
    useOmniTrader, useUrlState, fmtNum, fmtPct, fmtSignedPct, fmtCompact,
    regimeTone, SWAL_THEME, type MarketRow,
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

const editing = ref(false);
const editName = ref('');
const editIds = ref<string[]>([]);
const search = ref('');
const searchResults = ref<Array<{ Symbol: string; InstrumentId: string | null; DisplayName: string; Tradable: boolean; TradableOn: string[] }>>([]);

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
];

const intervalLabel = computed(() => INTERVALS.find(i => i.value === filters.interval)?.label ?? filters.interval);
const staleCount = computed(() => rows.value.filter(r => r.Stale).length);
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

function regimeLabel(regime: string) {
    return ({
        TrendingUp: 'Trending up', TrendingDown: 'Trending down',
        RangeBound: 'Range bound', Volatile: 'Volatile',
    } as Record<string, string>)[regime] ?? regime;
}

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

function openEditor() {
    const current = watchlists.value.find(w => w.Id === filters.watchlist);
    editName.value = current?.Name ?? 'New list';
    editIds.value = [...(current?.InstrumentIds ?? [])];
    editing.value = true;
    searchInstruments();
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;
function searchInstruments() {
    if (searchTimer) clearTimeout(searchTimer);
    // Debounced: a query per keystroke is load with nobody reading the result.
    searchTimer = setTimeout(async () => {
        // The unified search, not just the instrument master: anything listed can be
        // watched and charted, whether or not the firm can deal it yet.
        try { searchResults.value = await get('/search', { q: search.value }); }
        catch { searchResults.value = []; }
    }, 250);
}

function addInstrument(id: string) {
    if (!editIds.value.includes(id)) editIds.value.push(id);
}

async function saveWatchlist() {
    busy.value = true;
    try {
        const saved = await post<any>('/markets/watchlist/save', undefined, {
            Id: filters.watchlist, Name: editName.value, InstrumentIds: editIds.value,
        });
        editing.value = false;
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
.picker {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ot-space-2);
    max-height: 280px;
    overflow-y: auto;
    align-content: flex-start;
}
.pick { cursor: pointer; font-family: inherit; }
.pick:disabled { opacity: 0.35; cursor: not-allowed; }
.ot-chip.venue { margin-right: 4px; }
.ot-field.auto { width: auto; }
.visually-hidden {
    position: absolute; width: 1px; height: 1px; overflow: hidden;
    clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap;
}
</style>
