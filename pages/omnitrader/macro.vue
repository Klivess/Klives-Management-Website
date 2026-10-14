<template>
    <OmniTraderShell>
        <div class="ot-pagehead">
            <h1><span class="code">ECO</span>Macro</h1>
        </div>
        <nav class="ot-tabs" role="tablist">
            <button v-for="t in TABS" :key="t.id" role="tab" type="button" :aria-selected="state.tab === t.id" @click="state.tab = t.id"><span class="fn">{{ t.code }}</span>{{ t.label }}</button>
        </nav>

        <!-- economy -->
        <div v-if="state.tab === 'eco'" class="ot-grid sidebar">
            <OtPanel title="Indicators" code="ECO" flush :loading="loadingMacro" :error="macroError" :empty="!macro.length">
                <OtGrid :rows="macroRows" :columns="macroCols" grid-key="macro" selectable :selected-key="selectedSeries" :row-key="(r: any) => r.Id" export-name="macro" max-height="calc(100vh - 220px)"
                        @select="(r: any) => (selectedSeries = r.Id)" />
            </OtPanel>
            <div class="ot-stack">
                <OtPanel :title="selected?.Info?.Name ?? 'Series'" :code="selected?.Info?.Code" persist="macro.series">
                    <template #controls><span v-if="selected" class="mono small muted">{{ selected.Info.Source }} · {{ selected.Info.Unit }} · {{ selected.Info.Frequency }}</span></template>
                    <OtSeries v-if="selected" :series="[{ name: selected.Info.Name, type: 'area', data: selected.Points.map((p: any) => ({ t: p.T, v: p.V })) }]" :height="300" :decimals="2" />
                </OtPanel>
                <OtPanel title="FRED" code="FRED" persist="macro.fred">
                    <div class="row">
                        <input v-model="fredId" class="ot-input sm mono" placeholder="DGS10, UNRATE, CPIAUCSL…" @keydown.enter="loadFred" />
                        <button class="ot-btn sm" @click="loadFred">Load</button>
                    </div>
                    <div v-if="fredError" class="muted small" style="margin-top:6px">{{ fredError }}</div>
                    <OtSeries v-if="fred.length" :series="[{ name: fredId.toUpperCase(), data: fred.map((p: any) => ({ t: p.T, v: p.V })) }]" :height="220" />
                </OtPanel>
            </div>
        </div>

        <!-- curve -->
        <div v-else-if="state.tab === 'curve'" class="ot-stack">
            <div class="ot-statbar">
                <div v-for="p in latestCurve?.Points ?? []" :key="p.Tenor" class="ot-stat"><span class="k">{{ p.Tenor }}</span><span class="v">{{ fmtN(p.Yield, 2) }}</span><span class="s" :class="tone(changeOf(p.Tenor))">{{ fmtSignedN(changeOf(p.Tenor), 2) }} 1M</span></div>
                <div class="ot-stat"><span class="k">2s10s</span><span class="v" :class="tone(latestCurve?.Spread2s10s)">{{ fmtSignedN(latestCurve?.Spread2s10s, 2) }}</span></div>
                <div class="ot-stat"><span class="k">3m10y</span><span class="v" :class="tone(latestCurve?.Spread3m10y)">{{ fmtSignedN(latestCurve?.Spread3m10y, 2) }}</span></div>
            </div>
            <div class="ot-grid two">
                <OtPanel title="Curve" code="YC" :loading="loadingCurve" :error="curveError" :empty="!curveSeries.length" persist="macro.curve">
                    <template #controls>
                        <span class="mono small muted">vs</span>
                        <select v-model.number="compareDays" class="ot-select sm auto"><option v-for="d in [7, 30, 90, 180, 365, 730]" :key="d" :value="d">{{ d }}d</option></select>
                    </template>
                    <OtCurve :series="curveSeries" :height="260" />
                </OtPanel>
                <OtPanel title="Spreads (pp)" code="SPRD" persist="macro.spreads" :loading="loadingCurve">
                    <OtSeries :series="spreadSeries" :height="260" :decimals="2" />
                </OtPanel>
            </div>
            <OtPanel title="Tenor history" persist="macro.tenors" :loading="loadingCurve">
                <template #controls>
                    <button v-for="t in TENORS" :key="t" class="ot-chip" type="button" :aria-pressed="tenors.includes(t)" @click="toggleTenor(t)">{{ t }}</button>
                </template>
                <OtSeries :series="tenorSeries" :height="280" :decimals="2" />
            </OtPanel>
        </div>

        <!-- vol -->
        <div v-else-if="state.tab === 'vol'" class="ot-stack">
            <div class="ot-statbar">
                <div v-for="k in VOLKEYS" :key="k.key" class="ot-stat lg"><span class="k">{{ k.label }}</span><span class="v">{{ fmtN(vol?.Latest?.[k.key], 2) }}</span></div>
                <div class="ot-stat lg"><span class="k">VIX / VIX3M</span><span class="v" :class="(vol?.Latest?.Ratio ?? 0) > 1 ? 'neg' : 'pos'">{{ fmtN(vol?.Latest?.Ratio, 3) }}</span><span class="s">{{ (vol?.Latest?.Ratio ?? 0) > 1 ? 'backwardation' : 'contango' }}</span></div>
            </div>
            <OtPanel title="Volatility indices" code="VOL" :loading="loadingVol" :error="volError" :empty="!vol" persist="macro.volhist">
                <OtSeries :series="volSeries" :height="320" :decimals="2" />
            </OtPanel>
            <OtPanel title="Term ratio (VIX / VIX3M)" persist="macro.volratio" :loading="loadingVol">
                <OtSeries :series="ratioSeries" :baseline="1" :height="200" :decimals="3" />
            </OtPanel>
        </div>

        <!-- correlation -->
        <div v-else-if="state.tab === 'corr'" class="ot-stack">
            <div class="ot-toolbar">
                <input v-model="corrText" class="ot-input sm mono wide" spellcheck="false" @keydown.enter="loadCorr" />
                <div class="ot-segment sm mono"><button v-for="i in ['OneHour', 'FourHour', 'OneDay', 'OneWeek']" :key="i" type="button" :aria-pressed="corrInterval === i" @click="corrInterval = i; loadCorr()">{{ intervalShort(i) }}</button></div>
                <label class="inline">Bars <select v-model.number="corrBars" class="ot-select sm auto" @change="loadCorr"><option v-for="b in [30, 60, 90, 180, 365, 730]" :key="b" :value="b">{{ b }}</option></select></label>
                <button class="ot-btn sm primary" :disabled="loadingCorr" @click="loadCorr">Run</button>
                <span v-if="corr" class="summary">{{ corr.Observations }} returns · {{ fmtDay10(corr.From) }} → {{ fmtDay10(corr.To) }}<template v-if="corr.Missing?.length"> · missing {{ corr.Missing.join(', ') }}</template></span>
            </div>
            <div v-if="loadingCorr" class="ot-state compact"><span class="ot-spin"></span></div>
            <div v-else-if="corrError" class="ot-state compact error"><strong>{{ corrError }}</strong></div>
            <div v-else-if="corr?.Matrix" class="ot-grid sidebar">
                <OtPanel title="Return correlation" code="CORR" persist="macro.corr">
                    <OtHeatmap :rows="corr.Symbols" :cols="corr.Symbols" :values="corr.Matrix" :scale="1" :decimals="2" />
                </OtPanel>
                <OtPanel title="Window stats" flush persist="macro.corrstats">
                    <OtGrid :rows="corr.Stats" :columns="corrCols" bare :row-key="(r: any) => r.Symbol" />
                </OtPanel>
            </div>
        </div>
    </OmniTraderShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useUrlState } from '~/composables/useOmniTrader';
import { fmtDay10, fmtN, fmtSignedN, intervalShort, tGet, tone, usePersisted } from '~/composables/useTerminal';
import type { GridColumn } from '~/components/Ot/Grid.vue';
import type { CurveSeries } from '~/components/Ot/Curve.vue';
import type { SeriesDef } from '~/components/Ot/Series.vue';

definePageMeta({ layout: 'navbar' });

const TABS = [{ id: 'eco', code: 'ECO', label: 'Economy' }, { id: 'curve', code: 'YC', label: 'Treasury curve' }, { id: 'vol', code: 'VOL', label: 'Vol term' }, { id: 'corr', code: 'CORR', label: 'Correlation' }];
const { state } = useUrlState({ tab: 'eco', symbols: '' });

// economy
const macro = ref<any[]>([]);
const loadingMacro = ref(false);
const macroError = ref<string | null>(null);
const selectedSeries = ref<string | null>(null);
async function loadMacro() {
    loadingMacro.value = true;
    try { macro.value = await tGet<any[]>('/terminal/macro') ?? []; macroError.value = null; if (!selectedSeries.value) selectedSeries.value = macro.value[0]?.Info?.Id ?? null; }
    catch (e: any) { macroError.value = e?.message ?? 'failed'; }
    finally { loadingMacro.value = false; }
}
const selected = computed(() => macro.value.find(m => m.Info.Id === selectedSeries.value) ?? null);
const macroRows = computed(() => macro.value.map(m => {
    const pts = m.Points ?? [];
    const yearAgo = pts.length ? pts.filter((p: any) => new Date(p.T).getTime() <= new Date(pts[pts.length - 1].T).getTime() - 365 * 86400_000).at(-1) : null;
    return {
        Id: m.Info.Id, Group: m.Info.Group, Name: m.Info.Name, Unit: m.Info.Unit, Source: m.Info.Source, Latest: m.Latest, Previous: m.Previous,
        Change: m.Latest !== null && m.Previous !== null ? m.Latest - m.Previous : null, YearAgo: yearAgo?.V ?? null,
        Date: m.LatestDate, Spark: pts.slice(-36).map((p: any) => p.V), Error: m.Error,
    };
}));
const macroCols: GridColumn[] = [
    { key: 'Group', label: 'Group', format: 'text' }, { key: 'Name', label: 'Series', format: 'text' },
    { key: 'Latest', label: 'Latest', format: 'num' }, { key: 'Change', label: 'Δ', format: 'signed', signed: true }, { key: 'YearAgo', label: '1Y ago', format: 'num' },
    { key: 'Unit', label: 'Unit', format: 'text', hidden: true }, { key: 'Date', label: 'As of', format: 'date' }, { key: 'Spark', label: '3Y', format: 'spark', sortable: false },
    { key: 'Source', label: 'Source', format: 'text', hidden: true }, { key: 'Error', label: 'Error', format: 'text', hidden: true, clip: 260 },
];

const fredId = usePersisted('macro.fredId', 'DGS10');
const fred = ref<any[]>([]);
const fredError = ref('');
async function loadFred() {
    fredError.value = '';
    try { fred.value = await tGet<any[]>('/terminal/macro/fred', { series: fredId.value }) ?? []; }
    catch (e: any) { fredError.value = e?.message ?? 'failed'; fred.value = []; }
}

// curve
const curve = ref<any>(null);
const loadingCurve = ref(false);
const curveError = ref<string | null>(null);
const compareDays = usePersisted('macro.compareDays', 30);
const TENORS = ['1 Mo', '3 Mo', '6 Mo', '1 Yr', '2 Yr', '5 Yr', '10 Yr', '30 Yr'];
const tenors = usePersisted<string[]>('macro.tenors', ['3 Mo', '2 Yr', '10 Yr', '30 Yr']);
async function loadCurve() {
    loadingCurve.value = true;
    try { curve.value = await tGet<any>('/terminal/macro/curve'); curveError.value = null; }
    catch (e: any) { curveError.value = e?.message ?? 'failed'; }
    finally { loadingCurve.value = false; }
}
const history = computed<any[]>(() => [...(curve.value?.History ?? [])].sort((a, b) => new Date(a.Date).getTime() - new Date(b.Date).getTime()));
const latestCurve = computed(() => history.value.at(-1) ?? null);
function curveAgo(days: number) {
    const last = latestCurve.value;
    if (!last) return null;
    const cut = new Date(last.Date).getTime() - days * 86400_000;
    return [...history.value].reverse().find(c => new Date(c.Date).getTime() <= cut) ?? null;
}
function changeOf(tenor: string) {
    const a = latestCurve.value?.Points?.find((p: any) => p.Tenor === tenor)?.Yield;
    const b = curveAgo(30)?.Points?.find((p: any) => p.Tenor === tenor)?.Yield;
    return a !== undefined && b !== undefined ? a - b : null;
}
const toCurve = (c: any, name: string, color: string, dashed = false): CurveSeries | null => c ? {
    name, color, dashed, points: (c.Points ?? []).map((p: any) => ({ x: p.Years, y: p.Yield, label: p.Tenor.replace(' Mo', 'M').replace(' Yr', 'Y') })),
} : null;
const curveSeries = computed(() => [
    toCurve(latestCurve.value, fmtDay10(latestCurve.value?.Date), '#f5a524'),
    toCurve(curveAgo(compareDays.value), `${compareDays.value}d ago`, '#4aa8ff', true),
].filter((s): s is CurveSeries => !!s));
const spreadSeries = computed<SeriesDef[]>(() => [
    { name: '2s10s', type: 'baseline', data: history.value.map(c => ({ t: c.Date, v: c.Spread2s10s })) },
    { name: '3m10y', data: history.value.map(c => ({ t: c.Date, v: c.Spread3m10y })), color: '#a78bfa' },
]);
const tenorSeries = computed<SeriesDef[]>(() => tenors.value.map(t => ({ name: t, data: history.value.map(c => ({ t: c.Date, v: c.Points?.find((p: any) => p.Tenor === t)?.Yield ?? null })) })));
function toggleTenor(t: string) { tenors.value = tenors.value.includes(t) ? tenors.value.filter(x => x !== t) : [...tenors.value, t]; }

// vol
const vol = ref<any>(null);
const loadingVol = ref(false);
const volError = ref<string | null>(null);
const VOLKEYS = [{ key: 'Vix9d', label: 'VIX9D' }, { key: 'Vix', label: 'VIX' }, { key: 'Vix3m', label: 'VIX3M' }, { key: 'Vix6m', label: 'VIX6M' }, { key: 'Vvix', label: 'VVIX' }, { key: 'Skew', label: 'SKEW' }];
async function loadVol() {
    loadingVol.value = true;
    try { vol.value = await tGet<any>('/terminal/macro/volterm'); volError.value = null; }
    catch (e: any) { volError.value = e?.message ?? 'failed'; }
    finally { loadingVol.value = false; }
}
const volSeries = computed<SeriesDef[]>(() => Object.entries(vol.value?.History ?? {}).filter(([k]) => !/skew/i.test(k)).map(([k, pts]) => ({ name: k.toUpperCase(), data: (pts as any[]).map(p => ({ t: p.T, v: p.V })) })));
const ratioSeries = computed<SeriesDef[]>(() => {
    const h = vol.value?.History ?? {};
    const vix = h.VIX ?? h.Vix ?? h.vix ?? [];
    const v3 = h.VIX3M ?? h.Vix3m ?? h.vix3m ?? [];
    const map = new Map<string, number>((v3 as any[]).map(p => [fmtDay10(p.T), p.V]));
    return [{ name: 'VIX/VIX3M', type: 'baseline', data: (vix as any[]).map(p => ({ t: p.T, v: map.get(fmtDay10(p.T)) ? p.V / map.get(fmtDay10(p.T))! : null })) }];
});

// correlation
const corrText = usePersisted('macro.corrSymbols', 'SPY QQQ IWM EFA EEM TLT GLD USO UUP BTCUSDT ETHUSDT');
const corrInterval = usePersisted('macro.corrInterval', 'OneDay');
const corrBars = usePersisted('macro.corrBars', 180);
const corr = ref<any>(null);
const loadingCorr = ref(false);
const corrError = ref<string | null>(null);
if (state.symbols) corrText.value = state.symbols.split(',').join(' ');
async function loadCorr() {
    loadingCorr.value = true;
    try {
        const symbols = corrText.value.split(/[\s,]+/).map(s => s.trim().toUpperCase()).filter(Boolean).join(',');
        corr.value = await tGet<any>('/terminal/correlation', { symbols, interval: corrInterval.value, bars: corrBars.value });
        corrError.value = corr.value?.Error ?? null;
    } catch (e: any) { corrError.value = e?.message ?? 'failed'; }
    finally { loadingCorr.value = false; }
}
const corrCols: GridColumn[] = [
    { key: 'Symbol', label: 'Symbol', format: 'sym' }, { key: 'ReturnPct', label: 'Return', format: 'chg', heat: 20 },
    { key: 'VolPct', label: 'Vol ann.', format: 'pct' }, { key: 'BetaToFirst', label: 'β to first', format: 'num' },
];

const loaded = new Set<string>();
function loadTab(t: string) {
    if (loaded.has(t)) return;
    loaded.add(t);
    if (t === 'eco') void loadMacro();
    else if (t === 'curve') void loadCurve();
    else if (t === 'vol') void loadVol();
    else if (t === 'corr') void loadCorr();
}
watch(() => state.tab, loadTab, { immediate: true });
</script>

<style scoped>
.row { display: flex; gap: 6px; }
.small { font-size: 10.5px; }
.wide { flex: 1 1 360px; text-transform: uppercase; }
</style>
