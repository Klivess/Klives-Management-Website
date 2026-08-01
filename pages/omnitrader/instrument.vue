<template>
    <OmniTraderShell>
        <div class="ot-pagehead">
            <div>
                <h1>{{ quote?.DisplayName ?? symbol ?? 'Instrument' }}</h1>
                <p class="question">
                    <span class="mono">{{ quote?.Symbol ?? symbol }}</span>
                    <template v-if="quote?.Exchange"> · {{ quote.Exchange }}</template>
                    <template v-if="quote?.AssetClass"> · {{ quote.AssetClass }}</template>
                    <template v-if="quote?.Currency"> · quoted in {{ quote.Currency }}</template>
                </p>
            </div>
            <div class="ot-actions">
                <!-- Search is here rather than on a separate page: looking something up and
                     looking at it are the same task. -->
                <div class="lookup">
                    <label class="ot-search">
                        <span class="glyph" aria-hidden="true">⌕</span>
                        <span class="visually-hidden">Find any symbol</span>
                        <input class="ot-input" type="search" v-model="search" @input="debouncedSearch"
                               @focus="searchOpen = true" placeholder="Any stock, crypto, index…" />
                    </label>
                    <ul v-if="searchOpen && results.length" class="results">
                        <li v-for="r in results" :key="r.Symbol" @mousedown.prevent="choose(r)">
                            <span class="sym mono">{{ r.Symbol }}</span>
                            <span class="name">{{ r.DisplayName }}</span>
                            <span class="ot-chip" :class="r.Tradable ? 'ok' : ''">
                                {{ r.Tradable ? r.TradableOn.join(', ') : 'chart only' }}
                            </span>
                        </li>
                    </ul>
                </div>
                <NuxtLink v-if="quote?.InstrumentId" class="ot-btn primary"
                          :to="{ path: '/omnitrader/execution', query: { instrument: quote.InstrumentId } }">
                    Order ticket
                </NuxtLink>
            </div>
        </div>

        <div v-if="error" class="ot-banner" role="alert">
            <span class="glyph" aria-hidden="true">⚠</span>
            <div>
                <strong>Could not load {{ symbol }}</strong>
                {{ error }}
            </div>
            <div class="actions"><button class="ot-btn sm" @click="loadAll">Retry</button></div>
        </div>

        <div class="ot-kpis">
            <OmniTraderKpi label="Price" :value="fmtNum(quote?.Price, precision)" :loading="loading && !quote"
                           :tone="signTone(quote?.ChangePercent) === 'pos' ? 'good' : signTone(quote?.ChangePercent) === 'neg' ? 'bad' : ''"
                           :compare="changeCompare" baseline="vs previous close"
                           :compare-format="c => `${c.absolute >= 0 ? '+' : ''}${c.absolute.toFixed(2)}%`"
                           :foot="quote?.Currency ? `in ${quote.Currency}` : undefined" />
            <OmniTraderKpi label="Session" small :value="marketStateLabel" :loading="loading && !quote"
                           :tone="quote?.MarketState === 'REGULAR' ? 'good' : ''"
                           :foot="quote?.Streaming ? 'streamed live' : 'polled every 20s'"
                           help="Crypto streams continuously. Exchange-listed instruments are polled, and are flat outside trading hours because the market is shut — not because the feed is dead." />
            <OmniTraderKpi label="Day range" small :value="dayRange" :loading="loading && !candles.length"
                           foot="low → high, this session" />
            <OmniTraderKpi label="Range (window)" small :value="windowRange" :loading="loading && !candles.length"
                           :foot="`${candles.length} × ${intervalLabel} bars`" />
            <OmniTraderKpi label="Volatility" :value="fmtPct(volatility, 1)" :loading="loading && !candles.length"
                           foot="annualised, from these bars" />
            <OmniTraderKpi label="Last update" small :value="fmtAgo(quote?.AsOfUtc)" :loading="loading && !quote"
                           :foot="quote?.AsOfUtc ? fmtTime(quote.AsOfUtc) : undefined" />
        </div>

        <OmniTraderCard :title="`${quote?.DisplayName ?? symbol} — ${intervalLabel}`"
                        question="Open, high, low, close and volume per bar"
                        :loading="loading && !candles.length" :empty="!candles.length && !loading"
                        empty-title="No bars for this symbol"
                        empty-text="The data feed returned nothing. Check the symbol, or try a longer timeframe.">
            <template #controls>
                <div class="ot-segment sm" role="group" aria-label="Timeframe">
                    <button v-for="i in INTERVALS" :key="i.value" type="button"
                            :aria-pressed="interval === i.value" @click="interval = i.value; loadCandles()">
                        {{ i.label }}
                    </button>
                </div>
                <button class="ot-btn ghost sm" :aria-pressed="showTable" @click="showTable = !showTable">
                    {{ showTable ? 'Show chart' : 'Show data' }}
                </button>
            </template>

            <OmniTraderCandleChart v-show="!showTable" :candles="candles" :height="460" :precision="precision" />

            <div v-if="showTable" class="ot-tablewrap" style="max-height:460px">
                <table class="ot-table">
                    <thead>
                        <tr>
                            <th>Bar (UTC)</th><th class="num">Open</th><th class="num">High</th>
                            <th class="num">Low</th><th class="num">Close</th><th class="num">Change</th>
                            <th class="num">Volume</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="c in reversedCandles" :key="c.Ts">
                            <td class="mono">{{ fmtTime(c.Ts) }}</td>
                            <td class="num">{{ fmtNum(c.Open, precision) }}</td>
                            <td class="num">{{ fmtNum(c.High, precision) }}</td>
                            <td class="num">{{ fmtNum(c.Low, precision) }}</td>
                            <td class="num">{{ fmtNum(c.Close, precision) }}</td>
                            <td class="num" :class="signTone(c.Close - c.Open)">
                                {{ c.Open > 0 ? `${(((c.Close - c.Open) / c.Open) * 100).toFixed(2)}%` : '—' }}
                            </td>
                            <td class="num">{{ fmtCompact(c.Volume) }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <template #footer>
                {{ quote?.Streaming
                    ? 'Crypto bars come from a live exchange stream.'
                    : 'Exchange data is polled, and may lag the venue you would deal on by up to a minute.' }}
            </template>
        </OmniTraderCard>

        <div class="ot-grid two" style="margin-top:16px">
            <OmniTraderCard title="Market state" question="What the shared analytics make of it"
                            :loading="loadingRow" :empty="!row"
                            empty-title="Not evaluated"
                            empty-text="Regime, momentum and breakout come from the watchlist analytics. Add this instrument to a watchlist to have them computed.">
                <dl class="ot-kv">
                    <dt>Regime</dt>
                    <dd>
                        <span class="ot-chip" :class="regimeTone(row?.Regime ?? '')">{{ regimeLabel(row?.Regime) }}</span>
                        <span v-if="row" class="muted"> {{ (row.RegimeConfidence * 100).toFixed(0) }}% confidence</span>
                    </dd>
                    <dt>Momentum</dt><dd :class="signTone(row?.MomentumScore)">{{ fmtNum(row?.MomentumScore, 2) }}</dd>
                    <dt>Breakout</dt>
                    <dd>{{ !row || row.BreakoutDirection === 0 ? 'in range'
                        : `${row.BreakoutDirection > 0 ? 'up' : 'down'} · quality ${(row.BreakoutQuality * 100).toFixed(0)}` }}</dd>
                    <dt>Alignment</dt><dd :class="signTone(row?.AlignmentScore)">{{ fmtNum(row?.AlignmentScore, 2) }}</dd>
                    <dt>Volatility</dt><dd>{{ fmtPct(row?.AnnualizedVolatility, 1) }} annualised</dd>
                    <dt>Liquidity</dt><dd>{{ fmtCompact(row?.AverageQuoteVolume) }} avg quote volume</dd>
                    <dt>Spread</dt><dd>{{ fmtPct(row?.EstimatedSpreadPercent, 3) }} estimated</dd>
                    <dt>Tradable on</dt>
                    <dd>{{ row?.TradableOn?.length ? row.TradableOn.join(', ') : 'no venue mapping' }}</dd>
                </dl>
                <div v-if="row?.Stale" class="ot-banner warn" style="margin-top:12px">
                    <span class="glyph" aria-hidden="true">⚠</span>
                    <div>{{ row.DataIssue || 'This instrument has not had a fresh mark recently.' }}</div>
                </div>
            </OmniTraderCard>

            <OmniTraderCard title="Your position" question="Do we already hold this?"
                            :loading="loadingPositions" :empty="!positions.length"
                            empty-kind="ok" empty-title="No position"
                            empty-text="The firm holds none of this instrument on any venue.">
                <OmniTraderDataTable :rows="positions" :columns="positionColumns" bare
                                     :row-key="p => `${p.InstrumentId}:${p.Venue}`" label="positions">
                    <template #cell-Venue="{ row: p }">
                        <span class="cellstack">
                            <span class="ot-chip" :class="envClass(p.Environment)">{{ p.Environment }}</span>
                            <span class="sub">{{ p.Venue }}</span>
                        </span>
                    </template>
                    <template #cell-Quantity="{ row: p }">
                        <span :class="signTone(p.Quantity)">{{ fmtNum(p.Quantity, 8) }}</span>
                    </template>
                    <template #cell-AveragePrice="{ row: p }">{{ fmtNum(p.AveragePrice, precision) }}</template>
                    <template #cell-UnrealizedPnL="{ row: p }">
                        <span :class="signTone(p.UnrealizedPnL)">{{ fmtSigned(p.UnrealizedPnL, currency) }}</span>
                    </template>
                </OmniTraderDataTable>
            </OmniTraderCard>
        </div>
    </OmniTraderShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
    useOmniTrader, usePolling, fmtNum, fmtPct, fmtSigned, fmtCompact, fmtAgo, fmtTime,
    envClass, regimeTone, signTone,
} from '~/composables/useOmniTrader';
import type { TableColumn } from '~/components/OmniTrader/DataTable.vue';
import type { Candle } from '~/components/OmniTrader/CandleChart.vue';

definePageMeta({ layout: 'navbar' });

const route = useRoute();
const router = useRouter();
const { get, currency } = useOmniTrader();

const INTERVALS = [
    { value: 'FifteenMinute', label: '15m' }, { value: 'OneHour', label: '1h' },
    { value: 'FourHour', label: '4h' }, { value: 'OneDay', label: '1d' },
];

const symbol = ref<string>((route.query.symbol as string) || (route.query.instrument as string) || 'crypto:BTC/USD');
const interval = ref((route.query.interval as string) || 'OneHour');
const candles = ref<Candle[]>([]);
const quote = ref<any>(null);
const row = ref<any>(null);
const positions = ref<any[]>([]);
const loading = ref(false);
const loadingRow = ref(false);
const loadingPositions = ref(false);
const error = ref('');
const showTable = ref(false);

const search = ref('');
const searchOpen = ref(false);
const results = ref<any[]>([]);

const positionColumns: TableColumn[] = [
    { key: 'Venue', label: 'Venue' },
    { key: 'Quantity', label: 'Quantity', num: true },
    { key: 'AveragePrice', label: 'Average', num: true },
    { key: 'UnrealizedPnL', label: 'Unrealized', num: true },
];

const intervalLabel = computed(() => INTERVALS.find(i => i.value === interval.value)?.label ?? interval.value);

// Crypto needs more decimals than a share price; the last close tells us how many.
const precision = computed(() => {
    const price = quote.value?.Price ?? candles.value[candles.value.length - 1]?.Close ?? 0;
    if (price === 0) return 2;
    if (price >= 100) return 2;
    if (price >= 1) return 4;
    return 6;
});

const changeCompare = computed(() => {
    const change = quote.value?.ChangePercent;
    if (change === null || change === undefined) return null;
    return { absolute: change, percent: null, direction: Math.sign(change) };
});

const marketStateLabel = computed(() => {
    const state = quote.value?.MarketState;
    if (!state) return '—';
    return ({ REGULAR: 'Open', CLOSED: 'Closed', PRE: 'Pre-market', POST: 'After hours', POSTPOST: 'Closed' } as Record<string, string>)[state] ?? state;
});

const dayRange = computed(() => {
    const today = candles.value.filter(c => new Date(c.Ts).toDateString() === new Date().toDateString());
    const set = today.length ? today : candles.value.slice(-24);
    if (!set.length) return '—';
    return `${fmtNum(Math.min(...set.map(c => c.Low)), precision.value)} → ${fmtNum(Math.max(...set.map(c => c.High)), precision.value)}`;
});

const windowRange = computed(() => {
    if (!candles.value.length) return '—';
    return `${fmtNum(Math.min(...candles.value.map(c => c.Low)), precision.value)} → ${fmtNum(Math.max(...candles.value.map(c => c.High)), precision.value)}`;
});

// Annualised from the bars actually on screen, so it describes what you are looking at.
const volatility = computed(() => {
    if (candles.value.length < 3) return null;
    const returns: number[] = [];
    for (let i = 1; i < candles.value.length; i++) {
        const prev = candles.value[i - 1].Close;
        if (prev > 0) returns.push(Math.log(candles.value[i].Close / prev));
    }
    if (returns.length < 2) return null;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
    const barsPerYear = { FifteenMinute: 35040, OneHour: 8760, FourHour: 2190, OneDay: 365 }[interval.value] ?? 8760;
    return Math.sqrt(variance) * Math.sqrt(barsPerYear) * 100;
});

const reversedCandles = computed(() => [...candles.value].reverse());

function regimeLabel(regime?: string) {
    if (!regime) return '—';
    return ({
        TrendingUp: 'Trending up', TrendingDown: 'Trending down',
        RangeBound: 'Range bound', Volatile: 'Volatile',
    } as Record<string, string>)[regime] ?? regime;
}

async function loadCandles() {
    loading.value = true;
    try {
        const data = await get<any>('/candles', { symbol: symbol.value, interval: interval.value, count: 400 });
        candles.value = data.Candles ?? [];
        error.value = '';
    } catch (e: any) {
        error.value = e?.message ?? 'The data feed did not respond';
        candles.value = [];
    } finally { loading.value = false; }
}

async function loadQuote() {
    try { quote.value = await get('/quote', { symbol: symbol.value }); }
    catch { /* the chart is still worth showing without a live quote */ }
}

async function loadAnalytics() {
    loadingRow.value = true;
    try {
        const data = await get<any>('/markets', { instruments: symbol.value, interval: interval.value });
        row.value = data.Rows?.[0] ?? null;
    } catch { row.value = null; }
    finally { loadingRow.value = false; }
}

async function loadPositions() {
    loadingPositions.value = true;
    try {
        const view = await get<any>('/portfolio');
        const id = quote.value?.InstrumentId ?? symbol.value;
        positions.value = (view.Lines ?? []).filter((l: any) =>
            l.InstrumentId?.toLowerCase() === String(id).toLowerCase());
    } catch { positions.value = []; }
    finally { loadingPositions.value = false; }
}

async function loadAll() {
    await Promise.all([loadCandles(), loadQuote()]);
    await Promise.all([loadAnalytics(), loadPositions()]);
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedSearch() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
        if (search.value.trim().length < 2) { results.value = []; return; }
        try { results.value = await get('/search', { q: search.value }); }
        catch { results.value = []; }
    }, 250);
}

function choose(match: any) {
    searchOpen.value = false;
    search.value = '';
    results.value = [];
    symbol.value = match.InstrumentId ?? match.Symbol;
    void router.replace({ query: { ...route.query, symbol: symbol.value } });
    void loadAll();
}

// The quote refreshes on its own; bars only need redrawing when one closes.
usePolling(loadQuote, 20000);

watch(() => route.query.symbol, value => {
    if (typeof value === 'string' && value && value !== symbol.value) {
        symbol.value = value;
        void loadAll();
    }
});

onMounted(loadAll);
</script>

<style scoped>
.lookup { position: relative; }
.results {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: var(--ot-z-popover);
    width: min(460px, 80vw);
    max-height: 320px;
    overflow-y: auto;
    list-style: none;
    margin: 0;
    padding: var(--ot-space-1);
    border: 1px solid var(--ot-line-strong);
    border-radius: var(--ot-radius-sm);
    background: var(--ot-surface-2);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55);
}
.results li {
    display: flex;
    align-items: center;
    gap: var(--ot-space-2);
    padding: var(--ot-space-2);
    border-radius: var(--ot-radius-sm);
    cursor: pointer;
    font-size: 12.5px;
}
.results li:hover { background: var(--ot-surface-3); }
.results .sym { min-width: 90px; }
.results .name { flex: 1 1 auto; color: var(--ot-text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.visually-hidden {
    position: absolute; width: 1px; height: 1px; overflow: hidden;
    clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap;
}
</style>
