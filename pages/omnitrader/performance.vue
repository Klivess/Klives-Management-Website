<template>
    <OmniTraderShell>
        <div class="ot-pagehead">
            <div>
                <h1>Performance</h1>
                <p class="question">
                    Is the operation making money, and where is it coming from? Attribution, execution
                    quality and operator behaviour, all from the ledger and journal the accounting uses.
                </p>
            </div>
        </div>

        <div class="ot-filterbar">
            <div class="ot-segment" role="group" aria-label="Reporting window">
                <button v-for="w in WINDOWS" :key="w.days" type="button"
                        :aria-pressed="windowDays === w.days" @click="windowDays = w.days; load()">
                    {{ w.label }}
                </button>
            </div>
            <span class="summary">
                <b>{{ windowLabel }}</b>
                <span class="sep" aria-hidden="true">·</span>
                {{ fmtDay(report?.FromUtc) }} → {{ fmtDay(report?.ToUtc) }}
                <span class="sep" aria-hidden="true">·</span>
                <span v-if="hasBaseline">compared with {{ fmtDay(report?.PreviousFromUtc) }} → {{ fmtDay(report?.PreviousToUtc) }}</span>
                <span v-else class="muted">no baseline period yet</span>
            </span>
            <div class="grow"></div>
            <button class="ot-btn ghost" :disabled="loading" @click="load">Refresh</button>
        </div>

        <div class="ot-kpis">
            <OmniTraderKpi label="Net P&L" :tone="valueTone(firm?.NetPnL)"
                           :value="fmtSigned(firm?.NetPnL, currency)" :loading="loading && !report"
                           :compare="compare(firm?.NetPnL, previous?.NetPnL)" :baseline="baselineLabel"
                           :compare-format="moneyChange"
                           :foot="`realized ${fmtSigned(firm?.RealizedPnL, currency)} · costs ${fmtMoney(firm?.Costs, currency)}`"
                           help="Realized P&L plus costs, from closed journal records in this window." />
            <OmniTraderKpi label="Trades" :value="String(firm?.Trades ?? 0)" :loading="loading && !report"
                           :compare="compare(firm?.Trades, previous?.Trades)" :baseline="baselineLabel"
                           :good-direction="0" :foot="`${firm?.Wins ?? 0} winners`" />
            <OmniTraderKpi label="Win rate" :tone="(firm?.WinRate ?? 0) >= 50 ? 'good' : ''"
                           :value="fmtPct(firm?.WinRate, 1)" :loading="loading && !report"
                           :compare="compare(firm?.WinRate, previous?.WinRate)" :baseline="baselineLabel"
                           :compare-format="pointChange"
                           :foot="`payoff ${(firm?.PayoffRatio ?? 0).toFixed(2)}×`"
                           help="Win rate alone decides nothing — read it with payoff ratio and expectancy." />
            <OmniTraderKpi label="Expectancy" :tone="valueTone(firm?.Expectancy)"
                           :value="fmtSigned(firm?.Expectancy, currency)" :loading="loading && !report"
                           :compare="compare(firm?.Expectancy, previous?.Expectancy)" :baseline="baselineLabel"
                           :compare-format="moneyChange" foot="per trade, this window" />
            <!-- Emphasis waits for a reading: a dash is not a drawdown. -->
            <OmniTraderKpi label="Max drawdown" :tone="report ? 'bad' : ''" :value="fmtPct(report?.MaxDrawdownPercent, 2)"
                           :loading="loading && !report" foot="on the account value curve"
                           :good-direction="-1" />
            <OmniTraderKpi label="Fill rate" :tone="exec ? 'info' : ''" :value="fmtPct(exec?.FillRatePercent, 0)"
                           :loading="loading && !report"
                           :compare="compare(exec?.FillRatePercent, previousExec?.FillRatePercent)"
                           :baseline="baselineLabel" :compare-format="pointChange"
                           :foot="`${exec?.Submitted ?? 0} submitted`" />
        </div>

        <!-- Cost honesty: an estimated cost presented as observed is a lie about the P&L. -->
        <div v-if="report" class="ot-banner info">
            <span class="glyph" aria-hidden="true">ℹ</span>
            <div>
                <strong>Cost provenance</strong>
                {{ fmtMoney(Math.abs(report.ObservedCosts), currency) }} observed from broker data,
                {{ fmtMoney(Math.abs(report.EstimatedCosts), currency) }} estimated by the platform's model,
                {{ report.UnavailableCostInstruments }} entr{{ report.UnavailableCostInstruments === 1 ? 'y' : 'ies' }}
                with no cost data at all.
            </div>
        </div>

        <div class="ot-grid two">
            <OmniTraderCard title="Cumulative P&L" question="Is the curve compounding or just noisy?"
                            :loading="loading" :empty="!dailyPoints.length"
                            empty-title="No closed trades in this window"
                            empty-text="A record appears once an order reaches a terminal state and its position closes.">
                <OmniTraderLineChart :series="cumulativeSeries" :height="280" zero-based
                                     :format="v => fmtMoney(v, currency, 0)" :threshold="0" threshold-label="break-even" />
                <template #footer>One point per calendar day. Quiet days hold the running total rather than being skipped.</template>
            </OmniTraderCard>

            <OmniTraderCard title="Firm value" question="What did the account balances actually do?"
                            :loading="loading" :empty="!equityPoints.length"
                            empty-title="No value snapshots"
                            empty-text="Snapshots are written when an account is reconciled.">
                <OmniTraderLineChart :series="equitySeries" :height="280" :format="v => fmtMoney(v, currency, 0)" />
                <template #footer>Account snapshots, independent of the journal — if these disagree, reconciliation is the place to look.</template>
            </OmniTraderCard>
        </div>

        <div class="ot-grid two" style="margin-top:16px">
            <OmniTraderCard title="Attribution" question="Which slice of the operation earned it?">
                <template #controls>
                    <div class="ot-segment sm" role="group" aria-label="Attribution dimension">
                        <button v-for="s in SLICES" :key="s.key" type="button"
                                :aria-pressed="slice === s.key" @click="slice = s.key">{{ s.label }}</button>
                    </div>
                </template>
                <OmniTraderBarList :items="sliceBars" :format="v => fmtSigned(v, currency)"
                                   :empty-title="`No closed trades by ${currentSlice.label.toLowerCase()} in this window`" />
                <template #footer>Net P&amp;L including costs, largest absolute contribution first.</template>
            </OmniTraderCard>

            <OmniTraderCard :title="`${currentSlice.label} detail`" question="Read the numbers, not just the bars"
                            flush :empty="!currentRows.length"
                            :empty-title="`Nothing to break down by ${currentSlice.label.toLowerCase()}`">
                <OmniTraderDataTable :rows="currentRows" :columns="sliceColumns" bare
                                     :row-key="r => r.Key" label="rows" default-sort="NetPnL">
                    <template #cell-NetPnL="{ row }">
                        <span :class="row.NetPnL >= 0 ? 'pos' : 'neg'">{{ fmtSigned(row.NetPnL, currency) }}</span>
                    </template>
                    <template #cell-WinRate="{ row }">{{ fmtPct(row.WinRate, 0) }}</template>
                    <template #cell-Expectancy="{ row }">
                        <span :class="row.Expectancy >= 0 ? 'pos' : 'neg'">{{ fmtSigned(row.Expectancy, currency) }}</span>
                    </template>
                </OmniTraderDataTable>
            </OmniTraderCard>
        </div>

        <div class="ot-grid two" style="margin-top:16px">
            <OmniTraderCard title="Trade outcome distribution"
                            question="Is the edge broad, or one trade carrying everything?"
                            :empty="!pnlBuckets.length"
                            empty-title="Not enough closed trades to describe a distribution"
                            empty-text="A histogram of one or two identical values would imply a shape that is not there.">
                <OmniTraderBarList :items="pnlBuckets" :format="v => `${v} trade(s)`" :signed="false" :limit="12" />
                <template #footer>Buckets are P&amp;L per closed trade, smallest to largest.</template>
            </OmniTraderCard>

            <OmniTraderCard title="Slippage distribution" question="Are fills landing where the decision expected?"
                            :empty="!slippageBuckets.length"
                            empty-title="No slippage measurements in this window"
                            empty-text="Slippage is recorded when a fill can be compared with a decision price.">
                <OmniTraderBarList :items="slippageBuckets" :format="v => `${v} order(s)`" :signed="false" :limit="12" />
                <template #footer>Positive basis points mean the fill was worse than the decision price.</template>
            </OmniTraderCard>
        </div>

        <div class="ot-grid two" style="margin-top:16px">
            <OmniTraderCard title="Execution quality" question="How well did the platform talk to brokers?">
                <dl class="ot-kv">
                    <dt>Submitted</dt><dd>{{ exec?.Submitted ?? 0 }}</dd>
                    <dt>Filled</dt><dd>{{ exec?.Filled ?? 0 }} ({{ fmtPct(exec?.FillRatePercent, 1) }})</dd>
                    <dt>Partially filled</dt><dd>{{ exec?.PartiallyFilled ?? 0 }}</dd>
                    <dt>Rejected</dt>
                    <dd :class="exec?.Rejected ? 'neg' : ''">{{ exec?.Rejected ?? 0 }} ({{ fmtPct(exec?.RejectionRatePercent, 1) }})</dd>
                    <dt>Cancelled</dt><dd>{{ exec?.Cancelled ?? 0 }}</dd>
                    <dt>Unknown</dt><dd :class="exec?.Unknown ? 'neg' : ''">{{ exec?.Unknown ?? 0 }}</dd>
                    <dt>Median slippage</dt><dd>{{ fmtBps(exec?.MedianSlippageBps) }}</dd>
                    <dt>Worst slippage</dt><dd>{{ fmtBps(exec?.WorstSlippageBps) }}</dd>
                    <dt>Median latency</dt><dd>{{ fmtMs(exec?.MedianLatencyMs) }}</dd>
                </dl>

                <div v-if="rejectionReasons.length" style="margin-top:16px">
                    <h4 class="ot-sectionhead">Why brokers rejected</h4>
                    <OmniTraderBarList :items="rejectionReasons" :format="v => `×${v}`" :signed="false" :limit="6" />
                </div>
            </OmniTraderCard>

            <OmniTraderCard title="Behaviour" question="Did intervening actually help?">
                <p class="verdict">{{ behaviour?.Verdict ?? 'No behaviour data in this window.' }}</p>
                <dl class="ot-kv">
                    <dt>Interventions</dt><dd>{{ behaviour?.Interventions ?? 0 }}</dd>
                    <dt>Median approval delay</dt><dd>{{ fmtDuration(behaviour?.MedianApprovalDelaySeconds) }}</dd>
                    <dt>P&L with intervention</dt>
                    <dd :class="signTone(behaviour?.PnLWithIntervention)">
                        {{ fmtSigned(behaviour?.PnLWithIntervention, currency) }}
                    </dd>
                    <dt>P&L left alone</dt>
                    <dd :class="signTone(behaviour?.PnLWithoutIntervention)">
                        {{ fmtSigned(behaviour?.PnLWithoutIntervention, currency) }}
                    </dd>
                </dl>
                <template #footer>
                    Totals, not averages per trade — the verdict above compares the averages.
                </template>
            </OmniTraderCard>
        </div>
    </OmniTraderShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Swal from 'sweetalert2';
import {
    useOmniTrader, fmtMoney, fmtSigned, fmtPct, fmtBps, fmtMs, fmtDay, fmtDuration,
    changeVs, seriesColour, signTone, valueTone, SWAL_THEME,
} from '~/composables/useOmniTrader';
import type { TableColumn } from '~/components/OmniTrader/DataTable.vue';

definePageMeta({ layout: 'navbar' });

const { get, currency } = useOmniTrader();

const WINDOWS = [
    { days: 7, label: '7 days' }, { days: 30, label: '30 days' },
    { days: 90, label: '90 days' }, { days: 365, label: '1 year' },
];

const SLICES = [
    { key: 'ByVenue', label: 'Venue' },
    { key: 'ByStrategy', label: 'Strategy' },
    { key: 'ByInstrument', label: 'Instrument' },
    { key: 'ByRegimeTag', label: 'Tag' },
] as const;

const report = ref<any>(null);
const loading = ref(false);
const windowDays = ref(30);
const slice = ref<typeof SLICES[number]['key']>('ByStrategy');

const firm = computed(() => report.value?.Firm);
const previous = computed(() => report.value?.Previous);
const exec = computed(() => report.value?.Execution);
const previousExec = computed(() => report.value?.PreviousExecution);
const behaviour = computed(() => report.value?.Behaviour);
const hasBaseline = computed(() => report.value?.HasBaseline ?? false);

const windowLabel = computed(() => WINDOWS.find(w => w.days === windowDays.value)?.label ?? `${windowDays.value} days`);
const baselineLabel = computed(() => (hasBaseline.value ? `vs previous ${windowLabel.value}` : ''));

// A comparison is only offered when there is something real to compare against.
function compare(current: number | undefined, prior: number | undefined) {
    if (!hasBaseline.value) return null;
    return changeVs(current, prior);
}
function moneyChange(change: { absolute: number; percent: number | null }) {
    return fmtSigned(change.absolute, currency.value);
}
function pointChange(change: { absolute: number }) {
    return `${change.absolute >= 0 ? '+' : ''}${change.absolute.toFixed(1)} pts`;
}

const currentSlice = computed(() => SLICES.find(s => s.key === slice.value)!);
const currentRows = computed(() => report.value?.[slice.value] ?? []);
const sliceBars = computed(() => currentRows.value.map((r: any) => ({
    key: r.Key, label: r.Label, value: r.NetPnL,
    secondary: `${r.Trades} trade(s), ${fmtPct(r.WinRate, 0)} win rate`,
})));

const sliceColumns: TableColumn[] = [
    { key: 'Label', label: 'Name' },
    { key: 'NetPnL', label: 'Net P&L', num: true },
    { key: 'Trades', label: 'Trades', num: true },
    { key: 'WinRate', label: 'Win rate', num: true },
    { key: 'Expectancy', label: 'Expectancy', num: true },
];

const dailyPoints = computed<any[]>(() => report.value?.Daily ?? []);
const cumulativeSeries = computed(() => [{
    name: 'Cumulative net P&L',
    colour: seriesColour(0),
    fill: 'rgba(57, 135, 229, 0.12)',
    points: dailyPoints.value.map(d => ({ x: new Date(d.Date).getTime(), y: d.Cumulative })),
}]);

const equityPoints = computed<any[]>(() => report.value?.EquityCurve ?? []);
const equitySeries = computed(() => [{
    name: 'Firm value',
    colour: seriesColour(2),
    fill: 'rgba(25, 158, 112, 0.12)',
    points: equityPoints.value.map((p: any) => ({
        x: new Date(p.Item1 ?? p.item1).getTime(),
        y: p.Item2 ?? p.item2 ?? 0,
    })),
}]);

const pnlBuckets = computed(() => (report.value?.PnLDistribution ?? [])
    .map((b: any) => ({ key: b.Label, label: b.Label, value: b.Count })));
const slippageBuckets = computed(() => (report.value?.SlippageDistribution ?? [])
    .map((b: any) => ({ key: b.Label, label: b.Label, value: b.Count })));

const rejectionReasons = computed(() =>
    Object.entries(exec.value?.RejectionReasons ?? {})
        .map(([reason, count]) => ({ key: reason, label: reason, value: count as number })));

async function load() {
    loading.value = true;
    try {
        const from = new Date(Date.now() - windowDays.value * 86400000).toISOString();
        report.value = await get('/performance', { from });
    } catch (e: any) {
        Swal.fire({ title: 'Load failed', text: e?.message, icon: 'error', ...SWAL_THEME });
    } finally { loading.value = false; }
}

onMounted(load);
</script>

<style scoped>
.verdict {
    margin: 0 0 var(--ot-space-3);
    padding: var(--ot-space-3);
    border-radius: var(--ot-radius-sm);
    background: rgba(255, 255, 255, 0.03);
    font-size: 12.5px;
    line-height: 1.5;
}
</style>
