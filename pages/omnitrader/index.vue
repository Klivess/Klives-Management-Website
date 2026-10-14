<template>
    <OmniTraderShell>
        <div class="ot-pagehead">
            <h1><span class="code">MON</span>Market monitor</h1>
            <div class="ot-actions">
                <span class="ot-fresh" :class="{ stale: stale }"><span class="ot-dot" :class="error ? 'bad' : stale ? 'warn' : 'ok'"></span>{{ monitor ? fmtAge(monitor.AsOfUtc) : '—' }}</span>
                <details class="ot-menu">
                    <summary class="ot-btn sm">Panels</summary>
                    <div class="pop">
                        <label v-for="p in PANELS" :key="p.id" class="item"><input v-model="shown[p.id]" type="checkbox" /> {{ p.label }}</label>
                    </div>
                </details>
                <button class="ot-btn sm" :disabled="loading" @click="refresh">Refresh</button>
            </div>
        </div>

        <div class="ot-statbar">
            <div v-for="k in headline" :key="k.label" class="ot-stat lg clickable" @click="k.symbol && openSymbol(k.symbol)">
                <span class="k">{{ k.label }}</span>
                <span class="v">{{ k.value }}</span>
                <span class="s" :class="tone(k.change)">{{ k.changeText }}</span>
            </div>
        </div>

        <div v-if="error && !monitor" class="ot-banner"><span class="glyph">⚠</span><strong>Monitor unavailable</strong><span class="muted">{{ error }}</span></div>

        <div class="mon">
            <OtPanel v-for="s in sections" v-show="shown[s.Id]" :key="s.Id" :title="s.Title" :code="CODES[s.Id]" flush :persist="`mon.${s.Id}`"
                     :error="s.Error" :loading="loading && !monitor" :empty="!s.Rows.length" class="sec" :class="`s-${s.Id}`">
                <OtQuotes :rows="s.Rows" :name-header="s.Title" :yearly="s.Id === 'indices' || s.Id === 'sectors'" :range="s.Id !== 'rates' && s.Id !== 'sectors'"
                          :heat-scale="s.Id === 'crypto' ? 8 : s.Id === 'vol' ? 10 : 2.5" />
            </OtPanel>
        </div>

        <div class="lower">
            <div class="col">
                <OtPanel v-show="shown.crypto" title="Crypto market" code="CRYPTO" persist="mon.cryptomkt" :loading="loading && !monitor" class="cm">
                    <template #controls><NuxtLink class="ot-btn ghost xs" to="/omnitrader/crypto">more</NuxtLink></template>
                    <div class="ot-statbar bare">
                        <div class="ot-stat"><span class="k">Total mcap</span><span class="v">{{ fmtBig(g?.TotalMarketCapUsd) }}</span><span class="s" :class="tone(g?.MarketCapChange24hPct)">{{ fmtChg(g?.MarketCapChange24hPct) }}</span></div>
                        <div class="ot-stat"><span class="k">24h volume</span><span class="v">{{ fmtBig(g?.TotalVolumeUsd) }}</span></div>
                        <div class="ot-stat"><span class="k">BTC dom</span><span class="v">{{ fmtPctPlain(g?.BtcDominancePct) }}</span></div>
                        <div class="ot-stat"><span class="k">ETH dom</span><span class="v">{{ fmtPctPlain(g?.EthDominancePct) }}</span></div>
                        <div class="ot-stat"><span class="k">BTC DVOL</span><span class="v">{{ fmtN(monitor?.Dvol?.BTC, 1) }}</span></div>
                        <div class="ot-stat"><span class="k">ETH DVOL</span><span class="v">{{ fmtN(monitor?.Dvol?.ETH, 1) }}</span></div>
                    </div>
                    <div class="fng">
                        <div class="gauge">
                            <span class="k">Fear &amp; Greed</span>
                            <span class="v mono" :style="{ color: fngColour(monitor?.FearGreed?.Value) }">{{ monitor?.FearGreed?.Value ?? '—' }}</span>
                            <span class="s">{{ monitor?.FearGreed?.Label ?? '' }}</span>
                        </div>
                        <svg class="fngspark" viewBox="0 0 100 24" preserveAspectRatio="none">
                            <polyline :points="fngSpark" fill="none" stroke="var(--ot-accent)" stroke-width="1.2" vector-effect="non-scaling-stroke" />
                        </svg>
                    </div>
                    <table class="ot-table">
                        <thead><tr><th>Perp</th><th class="num">Funding</th><th class="num">Ann.</th><th class="num">Basis</th><th class="num">24h</th></tr></thead>
                        <tbody>
                            <tr v-for="f in monitor?.Funding ?? []" :key="f.Symbol" class="clickable" @click="openSymbol(f.Symbol, 'DER')">
                                <td class="sym">{{ f.Symbol.replace('USDT', '') }}</td>
                                <td class="num" :class="tone(f.FundingRate)">{{ (f.FundingRate * 100).toFixed(4) }}%</td>
                                <td class="num" :class="tone(f.FundingAnnualPct)" :style="{ background: heat(f.FundingAnnualPct, 30) }">{{ fmtChg(f.FundingAnnualPct, 1) }}</td>
                                <td class="num" :class="tone(f.BasisPct)">{{ fmtChg(f.BasisPct, 3) }}</td>
                                <td class="num" :class="tone(f.PriceChangePct24h)">{{ fmtChg(f.PriceChangePct24h) }}</td>
                            </tr>
                        </tbody>
                    </table>
                </OtPanel>

                <OtPanel v-show="shown.curve" title="US Treasury curve" code="YC" persist="mon.curve" :loading="loading && !monitor" :empty="!curveSeries.length" class="curve">
                    <template #controls>
                        <span class="mono muted small">2s10s <b :class="tone(monitor?.Curve?.Spread2s10s)">{{ fmtSignedN(monitor?.Curve?.Spread2s10s, 2) }}</b></span>
                        <span class="mono muted small">3m10y <b :class="tone(monitor?.Curve?.Spread3m10y)">{{ fmtSignedN(monitor?.Curve?.Spread3m10y, 2) }}</b></span>
                    </template>
                    <OtCurve :series="curveSeries" :height="170" />
                </OtPanel>

                <OtPanel v-show="shown.volterm" title="VIX term structure" code="VIX" persist="mon.volterm" :loading="loading && !monitor" :empty="!monitor?.VolTerm" class="vt">
                    <template #controls>
                        <span class="ot-chip" :class="(monitor?.VolTerm?.Ratio ?? 0) > 1 ? 'bad' : 'ok'">{{ (monitor?.VolTerm?.Ratio ?? 0) > 1 ? 'backwardation' : 'contango' }} {{ fmtN(monitor?.VolTerm?.Ratio, 2) }}</span>
                    </template>
                    <div class="bars">
                        <div v-for="b in volBars" :key="b.label" class="vb">
                            <span class="lbl mono">{{ b.label }}</span>
                            <span class="track"><span class="fill" :style="{ width: `${b.pct}%` }"></span></span>
                            <span class="val mono">{{ fmtN(b.value, 2) }}</span>
                        </div>
                    </div>
                    <div class="ot-statbar bare">
                        <div class="ot-stat"><span class="k">VVIX</span><span class="v">{{ fmtN(monitor?.VolTerm?.Vvix, 1) }}</span></div>
                        <div class="ot-stat"><span class="k">SKEW</span><span class="v">{{ fmtN(monitor?.VolTerm?.Skew, 1) }}</span></div>
                        <div class="ot-stat"><span class="k">As of</span><span class="v">{{ fmtDay10(monitor?.VolTerm?.Date) }}</span></div>
                    </div>
                </OtPanel>
            </div>

            <div class="col">
                <OtPanel v-show="shown.breadth" title="Breadth" code="S&P 500" persist="mon.breadth" :loading="breadthLoading && !breadth" :empty="!breadth" :error="breadthError" refreshable class="br" @refresh="loadBreadth">
                    <template #controls>
                        <select v-model="breadthUniverse" class="ot-select sm auto" @change="loadBreadth">
                            <option value="sp500">S&amp;P 500</option><option value="ftse100">FTSE 100</option><option value="megacaps">Mega caps</option>
                        </select>
                    </template>
                    <template v-if="breadth">
                        <div class="adv">
                            <span class="pos mono">▲ {{ breadth.Advancers }}</span>
                            <span class="advbar"><span class="up" :style="{ width: `${advPct}%` }"></span></span>
                            <span class="neg mono">{{ breadth.Decliners }} ▼</span>
                        </div>
                        <div class="ot-statbar bare">
                            <div class="ot-stat"><span class="k">&gt; 50d MA</span><span class="v">{{ fmtPctPlain(breadth.PctAbove50d) }}</span></div>
                            <div class="ot-stat"><span class="k">&gt; 200d MA</span><span class="v">{{ fmtPctPlain(breadth.PctAbove200d) }}</span></div>
                            <div class="ot-stat"><span class="k">Near 52w high</span><span class="v pos">{{ fmtPctPlain(breadth.PctNear52wHigh) }}</span></div>
                            <div class="ot-stat"><span class="k">Near 52w low</span><span class="v neg">{{ fmtPctPlain(breadth.PctNear52wLow) }}</span></div>
                            <div class="ot-stat"><span class="k">Median chg</span><span class="v" :class="tone(breadth.MedianChangePct)">{{ fmtChg(breadth.MedianChangePct) }}</span></div>
                        </div>
                        <div class="sectors">
                            <div v-for="s in breadth.Sectors" :key="s.Sector" class="sct" :style="{ background: heat(s.ChangePct, 2) }" :title="`${s.Count} members`">
                                <span class="n">{{ s.Sector }}</span><span class="mono" :class="tone(s.ChangePct)">{{ fmtChg(s.ChangePct) }}</span>
                            </div>
                        </div>
                    </template>
                </OtPanel>

                <OtPanel v-show="shown.movers" title="Movers" code="MOST" flush persist="mon.movers" :loading="moversLoading" :error="moversError" class="mv">
                    <template #controls>
                        <div class="ot-segment sm">
                            <button v-for="m in MOVERS" :key="m.id" type="button" :aria-pressed="moverScreen === m.id" @click="moverScreen = m.id; loadMovers()">{{ m.label }}</button>
                        </div>
                    </template>
                    <OtQuotes :rows="movers" name-header="Equity" :range="false" :yearly="false" />
                </OtPanel>
            </div>

            <div class="col">
                <OtPanel v-show="shown.news" title="Headlines" code="N" flush persist="mon.news" :loading="newsLoading && !news.length" :empty="!news.length" max-height="660px" class="nw">
                    <template #controls>
                        <div class="ot-segment sm">
                            <button v-for="c in NEWS" :key="c" type="button" :aria-pressed="newsCat === c" @click="newsCat = c; loadNews()">{{ c }}</button>
                        </div>
                    </template>
                    <ul class="news">
                        <li v-for="n in news" :key="n.Url">
                            <span class="t mono">{{ fmtAge(n.PublishedUtc) }}</span>
                            <a :href="n.Url" target="_blank" rel="noopener">{{ n.Title }}</a>
                            <span class="src">{{ n.Source }}</span>
                        </li>
                    </ul>
                </OtPanel>
            </div>
        </div>
    </OmniTraderShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
    fmtAge, fmtBig, fmtChg, fmtDay10, fmtN, fmtPctPlain, fmtPrice, fmtSignedN, heat, tGet, tone, usePersisted, useTicker, type QuoteRow,
} from '~/composables/useTerminal';
import type { CurveSeries } from '~/components/Ot/Curve.vue';

definePageMeta({ layout: 'navbar' });

const router = useRouter();
const PANELS = [
    { id: 'indices', label: 'Indices' }, { id: 'fx', label: 'FX' }, { id: 'commodities', label: 'Commodities' }, { id: 'rates', label: 'Rates' },
    { id: 'vol', label: 'Volatility' }, { id: 'crypto', label: 'Crypto' }, { id: 'sectors', label: 'Sectors' }, { id: 'curve', label: 'Yield curve' },
    { id: 'volterm', label: 'VIX term' }, { id: 'breadth', label: 'Breadth' }, { id: 'movers', label: 'Movers' }, { id: 'news', label: 'Headlines' },
];
const CODES: Record<string, string> = { indices: 'WEI', fx: 'FX', commodities: 'CMDTY', rates: 'GOVT', vol: 'VOL', crypto: 'CRYPTO', sectors: 'SECT' };
const MOVERS = [{ id: 'day_gainers', label: 'Gainers' }, { id: 'day_losers', label: 'Losers' }, { id: 'most_actives', label: 'Active' }];
const NEWS = ['markets', 'crypto', 'macro', 'all'];

const shown = usePersisted<Record<string, boolean>>('monitor.panels', Object.fromEntries(PANELS.map(p => [p.id, true])));
for (const p of PANELS) if (shown.value[p.id] === undefined) shown.value[p.id] = true;

const monitor = ref<any>(null);
const loading = ref(false);
const error = ref('');
const stale = computed(() => !!monitor.value && Date.now() - new Date(monitor.value.AsOfUtc).getTime() > 120_000);

const sections = computed<any[]>(() => monitor.value?.Sections ?? PANELS.slice(0, 7).map(p => ({ Id: p.id, Title: p.label, Rows: [] })));
const g = computed(() => monitor.value?.CryptoGlobal);

async function refresh() {
    loading.value = true;
    try { monitor.value = await tGet('/terminal/monitor'); error.value = ''; }
    catch (e: any) { error.value = e?.message ?? 'failed'; }
    finally { loading.value = false; }
}
useTicker(refresh, 30000);

const HEAD = ['^GSPC', '^NDX', '^RUT', '^VIX', '^TNX', 'DX-Y.NYB', 'EURUSD=X', 'GC=F', 'CL=F', 'BTCUSDT', 'ETHUSDT'];
const HEAD_LABEL: Record<string, string> = { '^GSPC': 'S&P 500', '^NDX': 'Nasdaq 100', '^RUT': 'Russell 2k', '^VIX': 'VIX', '^TNX': 'US 10Y', 'DX-Y.NYB': 'DXY', 'EURUSD=X': 'EURUSD', 'GC=F': 'Gold', 'CL=F': 'WTI', BTCUSDT: 'Bitcoin', ETHUSDT: 'Ether' };
const headline = computed(() => {
    const all: QuoteRow[] = (monitor.value?.Sections ?? []).flatMap((s: any) => s.Rows);
    return HEAD.map(sym => {
        const q = all.find(r => r.Symbol === sym);
        return { label: HEAD_LABEL[sym] ?? sym, symbol: sym, value: fmtPrice(q?.Price), change: q?.ChangePct ?? null, changeText: fmtChg(q?.ChangePct) };
    });
});

const curveSeries = computed<CurveSeries[]>(() => {
    const m = monitor.value;
    if (!m?.Curve) return [];
    const toSeries = (c: any, name: string, color?: string, dashed = false): CurveSeries | null => c ? {
        name, color, dashed, points: (c.Points ?? []).map((p: any) => ({ x: p.Years, y: p.Yield, label: p.Tenor.replace(' Mo', 'M').replace(' Yr', 'Y') })),
    } : null;
    return [toSeries(m.Curve, `Now ${fmtDay10(m.Curve.Date)}`, '#f5a524'), toSeries(m.CurveMonthAgo, '1M ago', '#4aa8ff', true), toSeries(m.CurveYearAgo, '1Y ago', '#7d8893', true)]
        .filter((s): s is CurveSeries => !!s);
});

const volBars = computed(() => {
    const v = monitor.value?.VolTerm;
    if (!v) return [];
    const rows = [{ label: 'VIX9D', value: v.Vix9d }, { label: 'VIX', value: v.Vix }, { label: 'VIX3M', value: v.Vix3m }, { label: 'VIX6M', value: v.Vix6m }];
    const max = Math.max(...rows.map(r => r.value ?? 0), 1);
    return rows.map(r => ({ ...r, pct: ((r.value ?? 0) / max) * 100 }));
});

const fngSpark = computed(() => {
    const h = (monitor.value?.FearGreedHistory ?? []).map((p: any) => p.Value);
    if (h.length < 2) return '';
    return h.map((v: number, i: number) => `${(i / (h.length - 1)) * 100},${24 - (v / 100) * 22 - 1}`).join(' ');
});
function fngColour(v?: number) { if (v === undefined) return undefined; return v < 25 ? '#f2545b' : v < 45 ? '#e8a317' : v < 55 ? '#aab3bd' : v < 75 ? '#8fd16a' : '#26c281'; }

// breadth
const breadth = ref<any>(null);
const breadthLoading = ref(false);
const breadthError = ref<string | null>(null);
const breadthUniverse = usePersisted('monitor.breadthUniverse', 'sp500');
const advPct = computed(() => { const b = breadth.value; return b && b.Advancers + b.Decliners ? (b.Advancers / (b.Advancers + b.Decliners)) * 100 : 50; });
async function loadBreadth() {
    breadthLoading.value = true;
    try { breadth.value = await tGet('/terminal/breadth', { universe: breadthUniverse.value }); breadthError.value = null; }
    catch (e: any) { breadthError.value = e?.message ?? 'failed'; }
    finally { breadthLoading.value = false; }
}
useTicker(loadBreadth, 10 * 60_000);

// movers
const movers = ref<QuoteRow[]>([]);
const moversLoading = ref(false);
const moversError = ref<string | null>(null);
const moverScreen = usePersisted('monitor.movers', 'day_gainers');
async function loadMovers() {
    moversLoading.value = true;
    try { const r = await tGet<any>('/terminal/movers', { screen: moverScreen.value, count: 15 }); movers.value = r?.Rows ?? []; moversError.value = null; }
    catch (e: any) { moversError.value = e?.message ?? 'failed'; }
    finally { moversLoading.value = false; }
}
useTicker(loadMovers, 120_000);

// news
const news = ref<any[]>([]);
const newsLoading = ref(false);
const newsCat = usePersisted('monitor.news', 'markets');
async function loadNews() {
    newsLoading.value = true;
    try { news.value = await tGet<any[]>('/terminal/news', { category: newsCat.value === 'all' ? undefined : newsCat.value, limit: 40 }) ?? []; }
    catch { /* headlines are optional */ }
    finally { newsLoading.value = false; }
}
useTicker(loadNews, 180_000);

function openSymbol(symbol: string, tab = 'GP') { void router.push(`/omnitrader/instrument?symbol=${encodeURIComponent(symbol)}&tab=${tab}`); }
</script>

<style scoped>
.mon { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: var(--ot-gutter); align-items: start; margin-bottom: var(--ot-gutter); }
.mon > * { grid-column: span 3; }
.mon > .s-indices { grid-column: span 6; }
/* Fixed columns keep every panel where muscle memory expects it; each column stacks without gaps. */
.lower { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--ot-gutter); align-items: start; }
.lower > .col { display: flex; flex-direction: column; gap: var(--ot-gutter); min-width: 0; }
@media (max-width: 1500px) {
    .mon > *, .mon > .s-indices { grid-column: span 6; }
    .lower { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .lower > .col:last-child { grid-column: 1 / -1; }
}
@media (max-width: 900px) { .mon > *, .mon > .s-indices { grid-column: span 12; } .lower { grid-template-columns: minmax(0, 1fr); } }
.ot-stat.clickable { cursor: pointer; }
.ot-stat.clickable:hover { background: var(--ot-surface-2); }
.small { font-size: 10.5px; }
.fng { display: flex; align-items: center; gap: 12px; padding: 6px 0; }
.fng .gauge { display: flex; flex-direction: column; min-width: 110px; }
.fng .k { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.7px; color: var(--ot-muted); font-weight: 650; }
.fng .v { font-size: 22px; font-weight: 700; line-height: 26px; }
.fng .s { font-size: 11px; color: var(--ot-text-2); }
.fngspark { flex: 1 1 auto; height: 30px; }
.bars { display: flex; flex-direction: column; gap: 5px; padding: 4px 0 8px; }
.vb { display: grid; grid-template-columns: 54px 1fr 50px; gap: 8px; align-items: center; font-size: 11px; }
.vb .track { height: 8px; background: rgba(255, 255, 255, 0.05); border-radius: 2px; overflow: hidden; }
.vb .fill { display: block; height: 100%; background: var(--ot-info); }
.vb .val { text-align: right; }
.adv { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.advbar { flex: 1 1 auto; height: 6px; background: var(--ot-negative); border-radius: 2px; overflow: hidden; }
.advbar .up { display: block; height: 100%; background: var(--ot-positive); }
.sectors { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 2px; margin-top: 6px; }
.sct { display: flex; justify-content: space-between; gap: 6px; padding: 3px 6px; font-size: 11px; border-radius: 2px; background: rgba(255, 255, 255, 0.02); }
.sct .n { color: var(--ot-text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.news { list-style: none; margin: 0; padding: 0; }
.news li { display: grid; grid-template-columns: 34px 1fr auto; gap: 8px; padding: 3px 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.035); font-size: 12px; align-items: baseline; }
.news li:hover { background: var(--ot-surface-3); }
.news .t { color: var(--ot-muted); font-size: 10.5px; }
.news a { color: var(--ot-text); }
.news a:hover { color: var(--ot-accent); }
.news .src { color: var(--ot-muted); font-size: 10.5px; white-space: nowrap; }
</style>
