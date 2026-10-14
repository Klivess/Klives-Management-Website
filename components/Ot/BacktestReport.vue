<template>
    <div class="otbr">
        <div v-if="result.StrategyErrors" class="ot-banner warn">
            <span class="glyph">⚠</span><strong>{{ result.StrategyErrors }} strategy error(s)</strong><span class="mono small">{{ result.FirstStrategyError }}</span>
        </div>
        <div v-if="result.Liquidated" class="ot-banner"><span class="glyph">⛔</span><strong>Liquidated</strong></div>

        <div class="ot-statbar">
            <div v-for="s in stats" :key="s.k" class="ot-stat" :title="s.hint"><span class="k">{{ s.k }}</span><span class="v" :class="s.cls">{{ s.v }}</span><span v-if="s.sub" class="s">{{ s.sub }}</span></div>
        </div>

        <nav class="ot-tabs flush">
            <button v-for="t in tabs" :key="t" type="button" :aria-selected="tab === t" @click="tab = t">{{ t }}</button>
        </nav>

        <div class="pane">
            <template v-if="tab === 'Equity'">
                <OtSeries :series="equitySeries" :height="height" :decimals="0" />
                <OtSeries v-if="drawdown.length" :series="[{ name: 'drawdown %', type: 'area', color: '#f2545b', data: drawdown }]" :height="120" format="pct" :decimals="1" />
            </template>
            <OtGrid v-else-if="tab === 'Trades'" :rows="trades" :columns="tradeCols" :grid-key="`${gridKey}.trades`" :row-key="(r: any) => `${r.Symbol}${r.EntryTime}${r.i}`" export-name="trades" max-height="460px" default-sort="EntryTime" />
            <div v-else-if="tab === 'Monthly'" class="pad">
                <OtHeatmap v-if="monthly.rows.length" :rows="monthly.rows" :cols="MONTHS" :values="monthly.values" :row-totals="monthly.totals" :decimals="1" />
                <div v-else class="muted">No monthly data</div>
            </div>
            <div v-else-if="tab === 'Distribution'" class="pad dist">
                <div>
                    <h4 class="ot-sectionhead">Bar returns %</h4>
                    <div class="hist"><span v-for="(b, i) in a?.ReturnHistogram ?? []" :key="i" :style="{ height: `${(b.Count / histMax(a?.ReturnHistogram)) * 100}%` }" :class="b.From >= 0 ? 'p' : 'n'" :title="`${b.From.toFixed(2)} … ${b.To.toFixed(2)}: ${b.Count}`"></span></div>
                </div>
                <div>
                    <h4 class="ot-sectionhead">Trade returns %</h4>
                    <div class="hist"><span v-for="(b, i) in a?.TradeHistogram ?? []" :key="i" :style="{ height: `${(b.Count / histMax(a?.TradeHistogram)) * 100}%` }" :class="b.From >= 0 ? 'p' : 'n'" :title="`${b.From.toFixed(2)} … ${b.To.toFixed(2)}: ${b.Count}`"></span></div>
                </div>
                <div class="kvs">
                    <div v-for="s in riskStats" :key="s.k" class="kv"><span class="k">{{ s.k }}</span><span class="v mono" :class="s.cls">{{ s.v }}</span></div>
                </div>
            </div>
            <OtSeries v-else-if="tab === 'Rolling'" :series="[{ name: 'rolling Sharpe', type: 'baseline', data: (a?.RollingSharpe ?? []).map((p: any) => ({ t: p.T, v: p.V })) }]" :baseline="0" :height="height" :decimals="2" />
            <OtSeries v-else-if="tab === 'Plots'" :series="plotSeries" :height="height" :decimals="4" />
            <OtChart v-else-if="tab === 'Chart' && chartSymbol" :symbol="chartSymbol" :interval="interval" :markers="markers" persist="report" :height="height + 60" :live="false" />
            <div v-else-if="tab === 'Validation'" class="pad">
                <pre class="ot-code">{{ JSON.stringify(result.Validation, null, 2) }}</pre>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { fmtBig, fmtChg, fmtInt, fmtN, fmtPctPlain, fmtSignedN, tone } from '~/composables/useTerminal';
import type { GridColumn } from '~/components/Ot/Grid.vue';
import type { SeriesDef } from '~/components/Ot/Series.vue';
import type { ChartMarker } from '~/components/Ot/Chart.vue';

/** The engine stores MAE as a magnitude; show it as the adverse move it is. */
const adverse = (v: number | null | undefined) => (v === null || v === undefined ? v : -Math.abs(v));

const props = withDefaults(defineProps<{ result: any; interval?: string; height?: number; gridKey?: string }>(), { interval: 'OneDay', height: 300, gridKey: 'report' });

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const a = computed(() => props.result?.Analysis ?? null);
const tab = ref('Equity');
const tabs = computed(() => ['Equity', 'Trades', 'Monthly', 'Distribution', 'Rolling', ...(props.result?.Plots && Object.keys(props.result.Plots).length ? ['Plots'] : []), 'Chart', ...(props.result?.Validation ? ['Validation'] : [])]);
const chartSymbol = computed(() => props.result?.Symbols?.[0] ?? props.result?.Trades?.[0]?.Symbol ?? null);

const stats = computed(() => {
    const r = props.result, x = a.value;
    const ret = Number(r.TotalPnLPercent ?? x?.TotalReturnPct);
    return [
        { k: 'Return', v: fmtChg(ret, 1), cls: tone(ret), sub: `B&H ${fmtChg(x?.BenchmarkReturnPct ?? r.BuyAndHoldPnLPercent, 1)}` },
        { k: 'CAGR', v: fmtChg(x?.CagrPct, 1), cls: tone(x?.CagrPct), sub: `bench ${fmtChg(x?.BenchmarkCagrPct, 1)}` },
        { k: 'Sharpe', v: fmtN(x?.Sharpe ?? r.SharpeRatio, 2), cls: tone(x?.Sharpe), sub: `bench ${fmtN(x?.BenchmarkSharpe, 2)}` },
        { k: 'Sortino', v: fmtN(x?.Sortino, 2), cls: '' },
        { k: 'Calmar', v: fmtN(x?.Calmar, 2), cls: '' },
        { k: 'Max DD', v: fmtPctPlain(x?.MaxDrawdownPct ?? r.MaxDrawdownPercent, 1), cls: 'neg', sub: `${fmtN(x?.MaxDrawdownDays, 0)}d` },
        { k: 'Vol', v: fmtPctPlain(x?.VolatilityPct, 1), cls: '' },
        { k: 'Trades', v: fmtInt(r.TotalTrades), cls: '', sub: `${fmtN(x?.TradesPerYear, 0)}/yr` },
        { k: 'Win rate', v: fmtPctPlain(Number(r.WinRate), 1), cls: '' },
        { k: 'Profit factor', v: fmtN(x?.ProfitFactor, 2), cls: (x?.ProfitFactor ?? 0) >= 1 ? 'pos' : 'neg' },
        { k: 'Expectancy', v: fmtChg(x?.ExpectancyPct, 2), cls: tone(x?.ExpectancyPct) },
        { k: 'Exposure', v: fmtPctPlain(x?.ExposurePct, 0), cls: '' },
        { k: 'Alpha', v: fmtSignedN(x?.Alpha, 2), cls: tone(x?.Alpha), hint: 'annualised, vs benchmark' },
        { k: 'Beta', v: fmtN(x?.Beta, 2), cls: '' },
        { k: 'Avg hold', v: `${fmtN(x?.AvgBarsHeld, 1)} bars`, cls: '' },
        { k: 'Fees', v: fmtBig(Number(r.TotalFeesPaid)), cls: '', sub: `${fmtPctPlain(x?.FeesPctOfGross, 1)} of gross` },
    ];
});

const riskStats = computed(() => {
    const x = a.value;
    if (!x) return [];
    return [
        { k: 'VaR 95', v: fmtChg(x.VaR95Pct, 2), cls: 'neg' }, { k: 'CVaR 95', v: fmtChg(x.CVaR95Pct, 2), cls: 'neg' },
        { k: 'Skew', v: fmtN(x.Skew, 2), cls: '' }, { k: 'Kurtosis', v: fmtN(x.Kurtosis, 2), cls: '' },
        { k: 'Tail ratio', v: fmtN(x.TailRatio, 2), cls: '' }, { k: 'Omega', v: fmtN(x.Omega, 2), cls: '' },
        { k: 'Ulcer', v: fmtN(x.UlcerIndex, 2), cls: '' }, { k: 'SQN', v: fmtN(x.Sqn, 2), cls: '' },
        { k: 'Kelly', v: fmtPctPlain(x.KellyPct, 1), cls: '' }, { k: 'Payoff', v: fmtN(x.PayoffRatio, 2), cls: '' },
        { k: 'Avg MAE', v: fmtChg(adverse(x.AvgMaePct), 2), cls: 'neg' }, { k: 'Avg MFE', v: fmtChg(x.AvgMfePct, 2), cls: 'pos' },
        { k: 'Best bar', v: fmtChg(x.BestBarPct, 2), cls: 'pos' }, { k: 'Worst bar', v: fmtChg(x.WorstBarPct, 2), cls: 'neg' },
        { k: 'Up capture', v: fmtN(x.UpCapture, 2), cls: '' }, { k: 'Down capture', v: fmtN(x.DownCapture, 2), cls: '' },
        { k: 'Info ratio', v: fmtN(x.InformationRatio, 2), cls: '' }, { k: 'Tracking error', v: fmtPctPlain(x.TrackingErrorPct, 1), cls: '' },
        { k: 'Long P&L', v: fmtBig(x.LongPnL), cls: tone(x.LongPnL) }, { k: 'Short P&L', v: fmtBig(x.ShortPnL), cls: tone(x.ShortPnL) },
    ];
});

const equitySeries = computed<SeriesDef[]>(() => {
    const curve = (props.result?.EquityCurve ?? []).map((p: any) => ({ t: p.Ts, v: Number(p.Equity) }));
    const out: SeriesDef[] = [{ name: 'strategy', type: 'area', color: '#f5a524', data: curve }];
    const bench = a.value?.Benchmark ?? [];
    if (bench.length) out.push({ name: props.result?.BenchmarkSymbol ?? 'benchmark', color: '#7d8893', data: bench.map((p: any) => ({ t: p.T, v: p.V })), dashed: true });
    return out;
});
const drawdown = computed(() => (a.value?.Drawdown ?? []).map((p: any) => ({ t: p.T, v: p.V })));
const plotSeries = computed<SeriesDef[]>(() => Object.entries(props.result?.Plots ?? {}).map(([name, pts]) => ({ name, data: (pts as any[]).map(p => ({ t: p.T, v: p.V })) })));

const monthly = computed(() => {
    const m = a.value?.Monthly ?? {};
    const years = Object.keys(m).map(Number).sort((x, y) => y - x);
    const values = years.map(y => MONTHS.map((_, i) => m[y]?.[i + 1] ?? null));
    const totals = values.map(row => {
        const v = row.filter((x): x is number => x !== null);
        return v.length ? (v.reduce((acc, r) => acc * (1 + r / 100), 1) - 1) * 100 : null;
    });
    return { rows: years, values, totals };
});

function histMax(h?: { Count: number }[]) { return Math.max(1, ...(h ?? []).map(b => b.Count)); }

const trades = computed(() => (props.result?.Trades ?? []).map((t: any, i: number) => ({
    ...t, i, Side: t.IsShort ? 'short' : 'long',
    RetPct: Number(t.EntryPrice) ? ((Number(t.ExitPrice) / Number(t.EntryPrice) - 1) * 100 * (t.IsShort ? -1 : 1)) : null,
})));
const tradeCols: GridColumn[] = [
    { key: 'Symbol', label: 'Symbol', format: 'sym' }, { key: 'Side', label: 'Side', format: 'text', class: r => (r.IsShort ? 'neg' : 'pos') },
    { key: 'EntryTime', label: 'Entry', format: 'datetime' }, { key: 'ExitTime', label: 'Exit', format: 'datetime' },
    { key: 'EntryPrice', label: 'In', format: 'price' }, { key: 'ExitPrice', label: 'Out', format: 'price' }, { key: 'Qty', label: 'Qty', format: 'num', decimals: 4, hidden: true },
    { key: 'RetPct', label: 'Ret %', format: 'chg', heat: 10 }, { key: 'RealizedPnL', label: 'P&L', format: 'signed', signed: true, value: r => Number(r.RealizedPnL) },
    { key: 'MaePct', label: 'MAE', format: 'chg', decimals: 1, value: r => adverse(r.MaePct), hint: 'Worst move against the position while open' }, { key: 'MfePct', label: 'MFE', format: 'chg', decimals: 1 },
    { key: 'BarsHeld', label: 'Bars', format: 'int' }, { key: 'ExitReason', label: 'Exit', format: 'text' }, { key: 'Fees', label: 'Fees', format: 'num', value: r => Number(r.Fees), hidden: true },
];

const markers = computed<ChartMarker[]>(() => {
    const out: ChartMarker[] = [];
    for (const t of props.result?.Trades ?? []) {
        if (chartSymbol.value && t.Symbol && t.Symbol !== chartSymbol.value) continue;
        out.push({ time: t.EntryTime, position: t.IsShort ? 'aboveBar' : 'belowBar', shape: t.IsShort ? 'arrowDown' : 'arrowUp', color: t.IsShort ? '#f2545b' : '#26c281', text: t.IsShort ? 'S' : 'B' });
        if (t.ExitReason !== 'open') out.push({ time: t.ExitTime, position: t.IsShort ? 'belowBar' : 'aboveBar', shape: 'circle', color: '#f5a524', text: t.ExitReason === 'signal' ? '' : t.ExitReason });
    }
    return out;
});
</script>

<style scoped>
.otbr { display: flex; flex-direction: column; min-width: 0; }
.pane { border: 1px solid var(--ot-line); border-top: 0; border-radius: 0 0 var(--ot-radius) var(--ot-radius); min-height: 120px; }
.pad { padding: 8px; }
.small { font-size: 11px; }
.dist { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.dist .kvs { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 1px 16px; }
.kv { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.035); font-size: 11.5px; }
.kv .k { color: var(--ot-muted); }
.hist { display: flex; align-items: flex-end; gap: 1px; height: 120px; border-bottom: 1px solid var(--ot-line-strong); }
.hist span { flex: 1 1 0; min-height: 1px; }
.hist span.p { background: rgba(38, 194, 129, 0.7); }
.hist span.n { background: rgba(242, 84, 91, 0.7); }
</style>
