<template>
    <OmniTraderShell>
        <div class="ot-pagehead">
            <div>
                <h1>Research</h1>
                <p class="question">
                    Does this idea survive contact with the cost model? Backtests, and the experiment log
                    that turns a good result into evidence a version can be promoted on.
                </p>
            </div>
            <div class="ot-actions">
                <button class="ot-btn ghost" :disabled="loading" @click="loadAll">Refresh</button>
            </div>
        </div>

        <div class="ot-kpis">
            <OmniTraderKpi label="Backtest jobs" :value="String(jobs.length)" :loading="loading && !jobs.length"
                           :foot="`${runningJobs} queued or running`" />
            <OmniTraderKpi label="Experiments" tone="info" :value="String(experiments.length)"
                           :loading="loading && !experiments.length"
                           :foot="`${completeExperiments} complete`" />
            <OmniTraderKpi label="Best Sharpe" :tone="(bestSharpe ?? 0) > 1 ? 'good' : ''"
                           :value="bestSharpe !== null ? bestSharpe.toFixed(2) : '—'"
                           :loading="loading && !jobs.length" foot="across completed jobs"
                           help="A Sharpe ratio from a single backtest is a hypothesis, not a result. Walk-forward validation is what makes it evidence." />
            <OmniTraderKpi label="Unattached results" :tone="unattached ? 'warn' : ''" :value="String(unattached)"
                           :loading="loading && !jobs.length"
                           foot="completed jobs with no experiment"
                           help="A result with no recorded hypothesis cannot support a promotion." />
        </div>

        <div class="ot-grid sidebar">
            <div class="ot-stack">
                <OmniTraderCard title="Backtest jobs" question="Click a job for its full result" flush
                                :loading="loading" :empty="!jobs.length"
                                empty-title="No backtests yet"
                                empty-text="Queue one from the panel on the right.">
                    <OmniTraderDataTable :rows="jobs" :columns="jobColumns" label="jobs" selectable
                                         :row-key="j => j.Id" :selected-key="selectedJob?.Id ?? null"
                                         default-sort="QueuedUtc" search-placeholder="Filter jobs…"
                                         :row-class="j => j.Status === 'Failed' ? 'attention' : ''"
                                         @select="openJob($event)">
                        <template #cell-StrategyClass="{ row }">
                            <span class="cellstack">
                                <span>{{ row.StrategyClass }}</span>
                                <span class="sub">{{ row.Coin }}{{ row.Currency }} · {{ row.Interval }} · {{ row.CandleCount }} bars</span>
                            </span>
                        </template>
                        <template #cell-Status="{ row }">
                            <span class="cellstack">
                                <span class="ot-chip" :class="jobTone(row.Status)">{{ row.Status }}</span>
                                <span v-if="row.Status === 'Running'" class="sub">{{ row.ProgressPct?.toFixed(0) }}% · {{ row.CandlesDone }}/{{ row.CandlesTotal }}</span>
                                <span v-else-if="row.Error" class="sub" style="color:var(--ot-negative)">{{ row.Error }}</span>
                            </span>
                        </template>
                        <template #cell-TotalPnLPercent="{ row }">
                            <span v-if="row.TotalPnLPercent === null || row.TotalPnLPercent === undefined" class="muted">—</span>
                            <span v-else :class="row.TotalPnLPercent >= 0 ? 'pos' : 'neg'">{{ fmtSignedPct(row.TotalPnLPercent) }}</span>
                        </template>
                        <template #cell-SharpeRatio="{ row }">{{ row.SharpeRatio?.toFixed(2) ?? '—' }}</template>
                        <template #cell-MaxDrawdownPercent="{ row }">
                            {{ row.MaxDrawdownPercent !== null && row.MaxDrawdownPercent !== undefined ? fmtPct(row.MaxDrawdownPercent) : '—' }}
                        </template>
                        <template #cell-actions="{ row }">
                            <button v-if="row.Status === 'Completed'" class="ot-btn sm ghost"
                                    :disabled="busy" @click.stop="attach(row)">Attach…</button>
                            <button v-else-if="row.Status === 'Running' || row.Status === 'Queued'"
                                    class="ot-btn sm danger" :disabled="busy" @click.stop="cancelJob(row)">Cancel</button>
                        </template>
                    </OmniTraderDataTable>
                </OmniTraderCard>

                <OmniTraderCard title="Experiments" question="Hypothesis → evidence → promotion" flush
                                :loading="loading" :empty="!experiments.length"
                                empty-title="No experiments"
                                empty-text="Record a hypothesis before you test it — that is what makes the result evidence rather than a search.">
                    <OmniTraderDataTable :rows="experiments" :columns="experimentColumns" label="experiments"
                                         :row-key="e => e.Id" search-placeholder="Filter experiments…">
                        <template #cell-Name="{ row }">
                            <span class="cellstack">
                                <span>{{ row.Name }}</span>
                                <span class="sub">{{ row.StrategyClass }} — {{ row.Hypothesis || 'no hypothesis recorded' }}</span>
                            </span>
                        </template>
                        <template #cell-Status="{ row }">
                            <span class="ot-chip" :class="row.Status === 'Complete' ? 'ok' : ''">{{ row.Status }}</span>
                        </template>
                        <template #cell-Return="{ row }">
                            <span v-if="row.Results?.TotalPnLPercent === undefined" class="muted">—</span>
                            <span v-else :class="row.Results.TotalPnLPercent >= 0 ? 'pos' : 'neg'">
                                {{ fmtSignedPct(row.Results.TotalPnLPercent) }}
                            </span>
                        </template>
                        <template #cell-Sharpe="{ row }">{{ row.Results?.SharpeRatio?.toFixed(2) ?? '—' }}</template>
                        <template #cell-Trades="{ row }">{{ row.Results?.TotalTrades ?? '—' }}</template>
                        <template #cell-Jobs="{ row }">{{ row.JobIds?.length ?? 0 }}</template>
                    </OmniTraderDataTable>
                </OmniTraderCard>
            </div>

            <div class="ot-stack">
                <OmniTraderCard title="Run a backtest" question="Same cost model as production">
                    <div class="ot-field" style="margin-bottom:12px">
                        <label for="bt-strategy">Strategy</label>
                        <select id="bt-strategy" class="ot-select" v-model="btForm.strategyClass">
                            <option value="">Choose…</option>
                            <option v-for="s in strategies" :key="s.ClassName" :value="s.ClassName">{{ s.Name }}</option>
                        </select>
                    </div>
                    <div class="ot-formgrid" style="margin-bottom:12px">
                        <div class="ot-field"><label for="bt-coin">Coin</label>
                            <input id="bt-coin" class="ot-input mono" v-model="btForm.coin" /></div>
                        <div class="ot-field"><label for="bt-cur">Currency</label>
                            <input id="bt-cur" class="ot-input mono" v-model="btForm.currency" /></div>
                        <div class="ot-field">
                            <label for="bt-interval">Interval</label>
                            <select id="bt-interval" class="ot-select" v-model="btForm.interval">
                                <option v-for="i in INTERVALS" :key="i.value" :value="i.value">{{ i.label }}</option>
                            </select>
                        </div>
                        <div class="ot-field"><label for="bt-bars">Bars</label>
                            <input id="bt-bars" class="ot-input mono" type="number" v-model.number="btForm.candleCount" /></div>
                        <div class="ot-field"><label for="bt-capital">Capital</label>
                            <input id="bt-capital" class="ot-input mono" type="number" v-model.number="btForm.initialQuote" /></div>
                        <div class="ot-field"><label for="bt-fee">Fee</label>
                            <input id="bt-fee" class="ot-input mono" type="number" step="0.0001" v-model.number="btForm.feeFraction" /></div>
                        <div class="ot-field"><label for="bt-slip">Slippage</label>
                            <input id="bt-slip" class="ot-input mono" type="number" step="0.0001" v-model.number="btForm.slippageFraction" /></div>
                        <div class="ot-field"><label for="bt-lev">Leverage</label>
                            <input id="bt-lev" class="ot-input mono" type="number" min="1" max="10" v-model.number="btForm.leverage" /></div>
                    </div>
                    <label class="ot-check">
                        <input type="checkbox" v-model="btForm.runValidation" />
                        Run walk-forward validation
                    </label>
                    <button class="ot-btn primary block" style="margin-top:12px"
                            :disabled="busy || !btForm.strategyClass" @click="queueBacktest">Queue backtest</button>
                    <template #footer>
                        Costs, precision and minimum sizes come from the same model production uses, so a
                        backtest is comparable with demo and live rather than optimistic.
                    </template>
                </OmniTraderCard>

                <OmniTraderCard title="New experiment" question="Write the hypothesis down first">
                    <div class="ot-field" style="margin-bottom:12px">
                        <label for="ex-name">Name</label>
                        <input id="ex-name" class="ot-input" v-model="expForm.name" placeholder="IBS on 4h, tighter stop" />
                    </div>
                    <div class="ot-field" style="margin-bottom:12px">
                        <label for="ex-strategy">Strategy</label>
                        <select id="ex-strategy" class="ot-select" v-model="expForm.strategyClass">
                            <option value="">Choose…</option>
                            <option v-for="s in strategies" :key="s.ClassName" :value="s.ClassName">{{ s.Name }}</option>
                        </select>
                    </div>
                    <div class="ot-field" style="margin-bottom:12px">
                        <label for="ex-hypothesis">Hypothesis</label>
                        <textarea id="ex-hypothesis" class="ot-input" rows="3" v-model="expForm.hypothesis"
                                  placeholder="What do you expect to be true, and how would the test show you were wrong?"></textarea>
                    </div>
                    <button class="ot-btn block" :disabled="busy || !expForm.name || !expForm.strategyClass"
                            @click="createExperiment">Record hypothesis</button>
                </OmniTraderCard>
            </div>
        </div>

        <!-- Backtest result -->
        <OmniTraderDrawer :open="!!selectedJob" @close="selectedJob = null"
                          :title="selectedJob ? selectedJob.StrategyClass : ''"
                          :subtitle="selectedJob ? `${selectedJob.Coin}${selectedJob.Currency} · ${selectedJob.Interval}` : ''">
            <template v-if="selectedJob">
                <OmniTraderStateBlock v-if="!jobDetail" compact title="Loading result…" />
                <template v-else-if="jobDetail.Result">
                    <OmniTraderLineChart v-if="curveSeries[0].points.length > 1" :series="curveSeries" :height="200"
                                         :format="v => fmtNum(v, 0)" />

                    <div class="ot-kpis tight" style="margin-top:16px">
                        <OmniTraderKpi label="Return" small
                                       :tone="jobDetail.Result.TotalPnLPercent >= 0 ? 'good' : 'bad'"
                                       :value="fmtSignedPct(jobDetail.Result.TotalPnLPercent)"
                                       :foot="`buy & hold ${fmtSignedPct(jobDetail.Result.BuyAndHoldPnLPercent)}`" />
                        <OmniTraderKpi label="Sharpe" small :value="jobDetail.Result.SharpeRatio?.toFixed(2) ?? '—'"
                                       :foot="`Sortino ${jobDetail.Result.SortinoRatio?.toFixed(2) ?? '—'}`" />
                        <OmniTraderKpi label="Max drawdown" small tone="bad"
                                       :value="fmtPct(jobDetail.Result.MaxDrawdownPercent)"
                                       :foot="`${jobDetail.Result.MaxDrawdownDurationBars ?? 0} bars underwater`" />
                    </div>

                    <h4 class="ot-sectionhead" style="margin-top:16px">Result</h4>
                    <dl class="ot-kv">
                        <dt>Trades</dt>
                        <dd>{{ jobDetail.Result.TotalTrades }} ({{ jobDetail.Result.WinningTrades }} winners,
                            {{ fmtPct(jobDetail.Result.WinRate, 1) }})</dd>
                        <dt>Profit factor</dt><dd>{{ jobDetail.Result.ProfitFactor?.toFixed(2) ?? '—' }}</dd>
                        <dt>Expectancy</dt><dd>{{ fmtNum(jobDetail.Result.Expectancy, 2) }}</dd>
                        <dt>Fees paid</dt><dd>{{ fmtNum(jobDetail.Result.TotalFeesPaid, 2) }}</dd>
                        <dt>Final equity</dt>
                        <dd>{{ fmtNum(jobDetail.Result.FinalEquity, 2) }} from {{ fmtNum(jobDetail.Result.InitialEquity, 2) }}</dd>
                        <dt>Beats buy &amp; hold</dt>
                        <dd>{{ jobDetail.Result.BeatsBuyAndHold ? 'yes' : 'no' }}</dd>
                        <dt>Candles</dt><dd>{{ jobDetail.Result.TotalCandles }}</dd>
                        <dt>Window</dt>
                        <dd>{{ fmtDay(jobDetail.Result.StartTime) }} → {{ fmtDay(jobDetail.Result.EndTime) }}</dd>
                    </dl>

                    <div v-if="jobDetail.Result.Validation" class="ot-banner info" style="margin-top:16px">
                        <span class="glyph" aria-hidden="true">ℹ</span>
                        <div>
                            <strong>Walk-forward validation ran</strong>
                            Out-of-sample results are what make this evidence rather than a fit.
                        </div>
                    </div>
                </template>
                <OmniTraderStateBlock v-else :kind="jobDetail.Error ? 'error' : 'empty'"
                                      :title="jobDetail.Error ? 'This job failed' : 'No result yet'"
                                      :detail="jobDetail.Error ?? 'The job has not finished.'" />
            </template>

            <template #footer>
                <button class="ot-btn ghost" @click="selectedJob = null">Close</button>
                <button v-if="selectedJob?.Status === 'Completed'" class="ot-btn" :disabled="busy"
                        @click="attach(selectedJob)">Attach to experiment</button>
            </template>
        </OmniTraderDrawer>
    </OmniTraderShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import Swal from 'sweetalert2';
import {
    useOmniTrader, fmtSignedPct, fmtPct, fmtNum, fmtDay, seriesColour, SWAL_THEME,
} from '~/composables/useOmniTrader';
import type { TableColumn } from '~/components/OmniTrader/DataTable.vue';

definePageMeta({ layout: 'navbar' });

const { get, post, engineGet, enginePost } = useOmniTrader();

const INTERVALS = [
    { value: 'FifteenMinute', label: '15m' }, { value: 'OneHour', label: '1h' },
    { value: 'FourHour', label: '4h' }, { value: 'OneDay', label: '1d' },
];

const strategies = ref<any[]>([]);
const jobs = ref<any[]>([]);
const experiments = ref<any[]>([]);
const loading = ref(false);
const busy = ref(false);
const selectedJob = ref<any>(null);
const jobDetail = ref<any>(null);

const btForm = reactive({
    strategyClass: '', coin: 'BTC', currency: 'USD', interval: 'OneHour', candleCount: 1000,
    initialQuote: 10000, feeFraction: 0.001, slippageFraction: 0.0005, leverage: 1, runValidation: false,
});
const expForm = reactive({ name: '', strategyClass: '', hypothesis: '' });

const jobColumns: TableColumn[] = [
    { key: 'StrategyClass', label: 'Strategy', width: '230px' },
    { key: 'Status', label: 'Status', width: '150px' },
    { key: 'TotalPnLPercent', label: 'Return', num: true },
    { key: 'SharpeRatio', label: 'Sharpe', num: true },
    { key: 'MaxDrawdownPercent', label: 'Max DD', num: true },
    { key: 'TotalTrades', label: 'Trades', num: true },
    { key: 'QueuedUtc', label: 'Queued', num: true, optional: true },
    { key: 'actions', label: '', sortable: false, num: true, width: '100px' },
];

const experimentColumns: TableColumn[] = [
    { key: 'Name', label: 'Experiment' },
    { key: 'Status', label: 'Status', width: '120px' },
    { key: 'Return', label: 'Return', num: true, sortValue: e => e.Results?.TotalPnLPercent ?? null },
    { key: 'Sharpe', label: 'Sharpe', num: true, sortValue: e => e.Results?.SharpeRatio ?? null },
    { key: 'Trades', label: 'Trades', num: true, sortValue: e => e.Results?.TotalTrades ?? null },
    { key: 'Jobs', label: 'Jobs', num: true, sortValue: e => e.JobIds?.length ?? 0 },
];

const runningJobs = computed(() => jobs.value.filter(j => j.Status === 'Running' || j.Status === 'Queued').length);
const completeExperiments = computed(() => experiments.value.filter(e => e.Status === 'Complete').length);
const bestSharpe = computed(() => {
    const values = jobs.value.map(j => j.SharpeRatio).filter(s => s !== null && s !== undefined) as number[];
    return values.length ? Math.max(...values) : null;
});
const unattached = computed(() => {
    const attached = new Set(experiments.value.flatMap(e => e.JobIds ?? []));
    return jobs.value.filter(j => j.Status === 'Completed' && !attached.has(j.Id)).length;
});

const curveSeries = computed(() => [{
    name: 'Equity',
    colour: seriesColour(0),
    fill: 'rgba(57, 135, 229, 0.12)',
    points: (jobDetail.value?.Result?.EquityCurve ?? []).map((p: any) => ({
        x: new Date(p.Ts).getTime(), y: p.Equity,
    })),
}]);

function jobTone(status: string) {
    return ({ Completed: 'ok', Running: 'info', Queued: '', Failed: 'bad', Cancelled: 'warn' } as Record<string, string>)[status] ?? '';
}

async function loadAll() {
    loading.value = true;
    try {
        const [s, j, e] = await Promise.all([
            engineGet<any[]>('/strategies'),
            engineGet<any[]>('/backtests'),
            get<any[]>('/experiments'),
        ]);
        strategies.value = s;
        jobs.value = j;
        experiments.value = e;
    } catch (e: any) {
        Swal.fire({ title: 'Load failed', text: e?.message, icon: 'error', ...SWAL_THEME });
    } finally { loading.value = false; }
}

async function openJob(job: any) {
    selectedJob.value = job;
    jobDetail.value = null;
    try { jobDetail.value = await engineGet<any>('/backtest', { id: job.Id }); }
    catch (e: any) { jobDetail.value = { Error: e?.message ?? 'Could not load the result' }; }
}

async function queueBacktest() {
    busy.value = true;
    try {
        await enginePost('/backtest/create', undefined, {
            StrategyClass: btForm.strategyClass,
            Coin: btForm.coin,
            Currency: btForm.currency,
            Interval: btForm.interval,
            CandleCount: btForm.candleCount,
            InitialQuoteBalance: btForm.initialQuote,
            FeeFraction: btForm.feeFraction,
            SlippageFraction: btForm.slippageFraction,
            Leverage: btForm.leverage,
            Validation: btForm.runValidation ? { InSampleBars: 180, OosBars: 60, WarmupBars: 30 } : null,
        });
        await loadAll();
    } catch (e: any) {
        Swal.fire({ title: 'Queue failed', text: e?.message, icon: 'error', ...SWAL_THEME });
    } finally { busy.value = false; }
}

async function cancelJob(job: any) {
    busy.value = true;
    try {
        await enginePost('/backtest/cancel', { id: job.Id });
        await loadAll();
    } finally { busy.value = false; }
}

async function createExperiment() {
    busy.value = true;
    try {
        await post('/experiment/create', undefined, {
            Name: expForm.name, StrategyClass: expForm.strategyClass, Hypothesis: expForm.hypothesis,
        });
        expForm.name = ''; expForm.hypothesis = '';
        await loadAll();
    } catch (e: any) {
        Swal.fire({ title: 'Failed', text: e?.message, icon: 'error', ...SWAL_THEME });
    } finally { busy.value = false; }
}

async function attach(job: any) {
    if (!experiments.value.length) {
        Swal.fire({
            title: 'No experiments yet',
            text: 'Record a hypothesis first — attaching a result to nothing does not make it evidence.',
            icon: 'info', ...SWAL_THEME,
        });
        return;
    }
    const options: Record<string, string> = {};
    for (const e of experiments.value) options[e.Id] = e.Name;
    const outcome = await Swal.fire({
        title: 'Attach to experiment', input: 'select', inputOptions: options,
        showCancelButton: true, ...SWAL_THEME,
    });
    if (!outcome.isConfirmed || !outcome.value) return;

    busy.value = true;
    try {
        await post('/experiment/attach', { id: outcome.value, job: job.Id });
        await loadAll();
    } finally { busy.value = false; }
}

onMounted(loadAll);
</script>
