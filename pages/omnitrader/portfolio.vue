<template>
    <OmniTraderShell>
        <div class="ot-pagehead">
            <div>
                <h1>Portfolio</h1>
                <p class="question">
                    What is the firm actually exposed to, and does the internal book still agree with what
                    each broker says? Owned inventory and derivative notional are never summed together.
                </p>
            </div>
            <div class="ot-actions">
                <button class="ot-btn ghost" :disabled="busy" @click="runReconciliation">Reconcile now</button>
                <button class="ot-btn" :disabled="loading" @click="loadAll">Refresh</button>
            </div>
        </div>

        <div v-if="materialBreaks" class="ot-banner" role="alert">
            <span class="glyph" aria-hidden="true">⚠</span>
            <div>
                <strong>{{ materialBreaks }} unresolved reconciliation break(s)</strong>
                The internal ledger and broker state disagree in a way the platform cannot explain.
                New automated exposure stays blocked until each one is resolved or explained.
            </div>
        </div>

        <div class="ot-kpis">
            <OmniTraderKpi label="Total value" :value="fmtMoney(view?.TotalValue, currency)" :loading="loading && !view"
                           :spark="totalSpark" foot="cash + inventory + broker equity"
                           help="Derivative notional is deliberately excluded: it is exposure, not an asset the firm owns." />
            <OmniTraderKpi label="Cash" :value="fmtMoney(view?.Cash, currency)" :loading="loading && !view"
                           foot="converted, native amounts preserved" />
            <OmniTraderKpi label="Owned inventory" tone="info" :value="fmtMoney(view?.InventoryValue, currency)"
                           :loading="loading && !view" foot="spot assets held outright" />
            <OmniTraderKpi label="CFD equity" :value="fmtMoney(view?.DerivativeEquity, currency)"
                           :loading="loading && !view" foot="as the broker reports it" />
            <OmniTraderKpi label="CFD notional" tone="violet" :value="fmtMoney(view?.DerivativeNotional, currency)"
                           :loading="loading && !view" foot="exposure — excluded from value" />
            <OmniTraderKpi label="Unrealized" :tone="valueTone(view?.UnrealizedPnL)"
                           :value="fmtSigned(view?.UnrealizedPnL, currency)" :loading="loading && !view"
                           :foot="`across ${view?.Lines?.length ?? 0} position(s)`" />
        </div>

        <OmniTraderCard title="Value by venue" question="Where is the money held, and how has that moved?"
                        :empty="!valueSeries.length" :loading="loading"
                        empty-title="No account snapshots yet"
                        empty-text="A snapshot is written each time an account is reconciled. Run a reconciliation to create the first one."
                        style="margin-bottom:16px">
            <template #controls>
                <div class="ot-segment sm" role="group" aria-label="History window">
                    <button v-for="w in WINDOWS" :key="w.days" type="button" :aria-pressed="windowDays === w.days"
                            @click="windowDays = w.days; loadSeries()">{{ w.label }}</button>
                </div>
            </template>
            <OmniTraderLineChart :series="valueSeries" :height="280" :format="v => fmtMoney(v, currency, 0)" />
        </OmniTraderCard>

        <div class="ot-grid sidebar">
            <OmniTraderCard title="Positions" question="What is open, where, and how far is it offside?"
                            flush :loading="loading" :empty="!view?.Lines?.length"
                            empty-kind="ok" empty-title="Flat" empty-text="No open exposure anywhere.">
                <OmniTraderDataTable :rows="view?.Lines ?? []" :columns="positionColumns" label="positions"
                                     pinned selectable default-sort="Notional"
                                     :row-key="l => `${l.InstrumentId}:${l.Venue}`"
                                     :selected-key="selected ? `${selected.InstrumentId}:${selected.Venue}` : null"
                                     :row-class="l => l.Disagrees ? 'attention' : ''"
                                     search-placeholder="Filter positions…"
                                     @select="selected = $event">
                    <template #cell-DisplayName="{ row }">
                        <span class="cellstack">
                            <span>{{ row.DisplayName }}</span>
                            <span class="sub mono">{{ row.InstrumentId }}</span>
                        </span>
                    </template>
                    <template #cell-Venue="{ row }">
                        <span class="cellstack">
                            <span class="ot-chip" :class="envClass(row.Environment)">{{ row.Environment }}</span>
                            <span class="sub">{{ row.Venue }}</span>
                        </span>
                    </template>
                    <template #cell-Exposure="{ row }">
                        <span class="ot-chip" :class="row.Exposure === 'Derivative' ? 'violet' : 'info'">
                            {{ row.Exposure === 'Derivative' ? 'CFD' : 'owned' }}
                        </span>
                    </template>
                    <template #cell-Quantity="{ row }">
                        <span class="cellstack">
                            <span :class="row.Quantity >= 0 ? 'pos' : 'neg'">{{ fmtNum(row.Quantity, 8) }}</span>
                            <span v-if="row.Disagrees" class="sub" style="color:var(--ot-negative)">
                                broker says {{ fmtNum(row.VenueQuantity, 8) }}
                            </span>
                        </span>
                    </template>
                    <template #cell-AveragePrice="{ row }">
                        <span class="cellstack">
                            <span>{{ fmtNum(row.AveragePrice, 6) }}</span>
                            <span class="sub">{{ row.MarkPrice ? `mark ${fmtNum(row.MarkPrice, 6)}` : 'no mark' }}</span>
                        </span>
                    </template>
                    <template #cell-Notional="{ row }">{{ fmtMoney(row.Notional, currency) }}</template>
                    <template #cell-UnrealizedPnL="{ row }">
                        <span :class="row.UnrealizedPnL >= 0 ? 'pos' : 'neg'">{{ fmtSigned(row.UnrealizedPnL, currency) }}</span>
                    </template>
                    <template #cell-StrategyId="{ row }">{{ row.StrategyId ?? 'manual' }}</template>
                </OmniTraderDataTable>
            </OmniTraderCard>

            <div class="ot-stack">
                <OmniTraderCard title="Allocation" question="How concentrated is the book?">
                    <template #controls>
                        <select class="ot-select auto sm" v-model="allocationKey" aria-label="Allocation dimension">
                            <option value="ExposureByVenue">By venue</option>
                            <option value="ExposureByAssetClass">By asset class</option>
                            <option value="ExposureByCurrency">By currency</option>
                            <option value="ExposureByStrategy">By strategy</option>
                        </select>
                    </template>
                    <OmniTraderBarList :items="allocationBars" :format="v => fmtMoney(v, currency, 0)"
                                       empty-title="No exposure to allocate" />
                    <template #footer>Absolute notional, largest first. Negative bars are short exposure.</template>
                </OmniTraderCard>

                <OmniTraderCard title="Valuation" :question="`How native balances became ${currency}`" flush
                                :empty="!view?.Valuations?.length" empty-title="No cash balances yet">
                    <OmniTraderDataTable :rows="view?.Valuations ?? []" :columns="valuationColumns" bare
                                         :row-key="v => v.Asset" label="assets">
                        <template #cell-Asset="{ row }">
                            <span class="cellstack">
                                <span>{{ row.Asset }}</span>
                                <span class="sub">{{ row.Source }}</span>
                            </span>
                        </template>
                        <template #cell-NativeAmount="{ row }">{{ fmtNum(row.NativeAmount, 4) }}</template>
                        <template #cell-Rate="{ row }">{{ fmtNum(row.Rate, 6) }}</template>
                        <template #cell-ReportingAmount="{ row }">{{ fmtMoney(row.ReportingAmount, currency) }}</template>
                    </OmniTraderDataTable>
                </OmniTraderCard>
            </div>
        </div>

        <div class="ot-grid two" style="margin-top:16px">
            <OmniTraderCard title="Reconciliation" :question="`Last run ${fmtAgo(reconciliation?.LastRunUtc)}`" flush
                            :empty="!reconciliation?.OpenBreaks?.length" empty-kind="ok"
                            empty-title="Internal and broker state agree"
                            empty-text="No open differences.">
                <template #controls>
                    <button class="ot-btn ghost sm" :disabled="busy" @click="runReconciliation">Run now</button>
                </template>
                <OmniTraderDataTable :rows="reconciliation?.OpenBreaks ?? []" :columns="breakColumns" bare
                                     :row-key="b => b.Id" label="breaks"
                                     :row-class="b => b.Material ? 'attention' : ''">
                    <template #cell-Subject="{ row }">
                        <span class="cellstack">
                            <span>{{ row.Subject }}</span>
                            <span class="sub">{{ row.Detail }}</span>
                        </span>
                    </template>
                    <template #cell-Classification="{ row }">
                        <span class="ot-chip" :class="row.Material ? 'bad' : 'warn'">
                            {{ classificationLabel(row.Classification) }}
                        </span>
                    </template>
                    <template #cell-InternalValue="{ row }">
                        {{ row.InternalValue !== null ? fmtNum(row.InternalValue, 8) : '—' }}
                    </template>
                    <template #cell-VenueValue="{ row }">
                        {{ row.VenueValue !== null ? fmtNum(row.VenueValue, 8) : '—' }}
                    </template>
                    <template #cell-actions="{ row }">
                        <button class="ot-btn sm ghost" :disabled="busy" @click="resolveBreak(row)">Explain…</button>
                    </template>
                </OmniTraderDataTable>
                <template #footer>
                    Resolving a break records the explanation. It never edits a ledger entry.
                </template>
            </OmniTraderCard>

            <OmniTraderCard title="Ledger" question="What actually moved, and where did it come from?" flush
                            :empty="!ledger.length" empty-title="No entries"
                            empty-text="The ledger fills as fills are booked.">
                <OmniTraderDataTable :rows="ledger" :columns="ledgerColumns" label="entries"
                                     :row-key="e => e.Id" max-height="420px" default-sort="Ts"
                                     search-placeholder="Filter ledger…">
                    <template #cell-Ts="{ row }">
                        <span class="cellstack">
                            <span :title="fmtTime(row.Ts)">{{ fmtAgo(row.Ts) }}</span>
                            <span class="sub">{{ row.InstrumentId ?? row.SourceType }}</span>
                        </span>
                    </template>
                    <template #cell-Kind="{ row }">
                        <span class="cellstack">
                            <span class="ot-chip" :class="ledgerTone(row.Kind)">{{ row.Kind }}</span>
                            <span v-if="row.CostKind && row.CostKind !== 'None'" class="sub">{{ row.CostKind }}</span>
                        </span>
                    </template>
                    <template #cell-Amount="{ row }">
                        <span :class="row.Amount >= 0 ? 'pos' : 'neg'">{{ fmtNum(row.Amount, 6) }}</span>
                    </template>
                    <template #cell-Origin="{ row }">
                        <span class="ot-chip" :class="row.Origin === 'Platform' ? '' : 'warn'">{{ row.Origin }}</span>
                    </template>
                </OmniTraderDataTable>
                <template #footer>Append-only. A correction is a new Adjustment referencing the original.</template>
            </OmniTraderCard>
        </div>

        <OmniTraderDrawer :open="!!selected" :title="selected?.DisplayName ?? ''"
                          :subtitle="selected ? `${selected.Venue} · ${selected.Environment}` : ''"
                          @close="selected = null">
            <template v-if="selected">
                <div v-if="selected.Disagrees" class="ot-banner">
                    <span class="glyph" aria-hidden="true">⚠</span>
                    <div>
                        <strong>The broker disagrees with the internal book</strong>
                        Internal {{ fmtNum(selected.Quantity, 8) }} versus broker
                        {{ fmtNum(selected.VenueQuantity, 8) }}. Reconciliation classifies this rather than
                        adopting either side.
                    </div>
                </div>
                <dl class="ot-kv">
                    <dt>Instrument</dt><dd>{{ selected.InstrumentId }}</dd>
                    <dt>Kind</dt><dd>{{ selected.Exposure === 'Derivative' ? 'CFD notional' : 'owned inventory' }}</dd>
                    <dt>Quantity</dt><dd>{{ fmtNum(selected.Quantity, 8) }}</dd>
                    <dt>Average price</dt><dd>{{ fmtNum(selected.AveragePrice, 6) }}</dd>
                    <dt>Mark</dt><dd>{{ selected.MarkPrice ? fmtNum(selected.MarkPrice, 6) : 'no mark available' }}</dd>
                    <dt>Notional</dt><dd>{{ fmtMoney(selected.Notional, currency) }}</dd>
                    <dt>Unrealized</dt>
                    <dd :class="selected.UnrealizedPnL >= 0 ? 'pos' : 'neg'">{{ fmtSigned(selected.UnrealizedPnL, currency) }}</dd>
                    <dt>Native currency</dt><dd>{{ selected.NativeCurrency }}</dd>
                    <dt>Strategy</dt><dd>{{ selected.StrategyId ?? 'manual' }}</dd>
                </dl>
            </template>
            <template #footer>
                <button class="ot-btn ghost" @click="selected = null">Close</button>
                <NuxtLink v-if="selected" class="ot-btn"
                          :to="{ path: '/omnitrader/execution', query: { instrument: selected.InstrumentId } }">
                    Trade this instrument
                </NuxtLink>
            </template>
        </OmniTraderDrawer>
    </OmniTraderShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Swal from 'sweetalert2';
import {
    useOmniTrader, fmtMoney, fmtSigned, fmtNum, fmtAgo, fmtTime, envClass, seriesColour, valueTone, SWAL_THEME,
} from '~/composables/useOmniTrader';
import type { TableColumn } from '~/components/OmniTrader/DataTable.vue';

definePageMeta({ layout: 'navbar' });

const { get, post, currency, refreshOverview } = useOmniTrader();

const WINDOWS = [{ days: 7, label: '7d' }, { days: 30, label: '30d' }, { days: 90, label: '90d' }];

const view = ref<any>(null);
const reconciliation = ref<any>(null);
const ledger = ref<any[]>([]);
const series = ref<Array<{ Ts: string; Venue: string; Value: number }>>([]);
const windowDays = ref(30);
const loading = ref(false);
const busy = ref(false);
const selected = ref<any>(null);
const allocationKey = ref('ExposureByVenue');

const materialBreaks = computed(() => reconciliation.value?.MaterialBreaks ?? 0);

const positionColumns: TableColumn[] = [
    { key: 'DisplayName', label: 'Instrument', width: '200px' },
    { key: 'Venue', label: 'Venue', width: '120px' },
    { key: 'Exposure', label: 'Kind', width: '80px' },
    { key: 'Quantity', label: 'Quantity', num: true },
    { key: 'AveragePrice', label: 'Avg / mark', num: true },
    { key: 'Notional', label: 'Notional', num: true },
    { key: 'UnrealizedPnL', label: 'Unrealized', num: true },
    { key: 'StrategyId', label: 'Strategy', optional: true },
];

const valuationColumns: TableColumn[] = [
    { key: 'Asset', label: 'Asset' },
    { key: 'NativeAmount', label: 'Native', num: true },
    { key: 'Rate', label: 'Rate', num: true },
    { key: 'ReportingAmount', label: 'Value', num: true },
];

const breakColumns: TableColumn[] = [
    { key: 'Subject', label: 'Subject' },
    { key: 'Kind', label: 'Kind', width: '110px' },
    { key: 'Classification', label: 'Classification', width: '140px' },
    { key: 'InternalValue', label: 'Internal', num: true },
    { key: 'VenueValue', label: 'Broker', num: true },
    { key: 'actions', label: '', num: true, sortable: false, width: '96px' },
];

const ledgerColumns: TableColumn[] = [
    { key: 'Ts', label: 'When', width: '140px' },
    { key: 'Kind', label: 'Kind', width: '120px' },
    { key: 'Asset', label: 'Asset', width: '90px' },
    { key: 'Amount', label: 'Amount', num: true },
    { key: 'Origin', label: 'Origin', width: '110px' },
];

// One line per venue plus the firm total: the same measure on one scale, never a
// second y-axis.
const valueSeries = computed(() => {
    if (!series.value.length) return [];
    const byVenue = new Map<string, Array<{ x: number; y: number }>>();
    const totals = new Map<number, number>();

    for (const point of series.value) {
        const x = new Date(point.Ts).getTime();
        if (!byVenue.has(point.Venue)) byVenue.set(point.Venue, []);
        byVenue.get(point.Venue)!.push({ x, y: point.Value });
        totals.set(x, (totals.get(x) ?? 0) + point.Value);
    }

    const out = [{
        name: 'Firm total',
        colour: seriesColour(0),
        fill: 'rgba(57, 135, 229, 0.10)',
        points: [...totals.entries()].sort((a, b) => a[0] - b[0]).map(([x, y]) => ({ x, y })),
    }];
    let index = 1;
    for (const [venue, points] of byVenue) {
        if (index >= 6) break;
        out.push({ name: venue, colour: seriesColour(index++), fill: '', points: points.sort((a, b) => a.x - b.x) });
    }
    return out;
});

const totalSpark = computed(() => valueSeries.value[0]?.points.map(p => p.y) ?? []);

const allocationBars = computed(() => {
    const map: Record<string, number> = view.value?.[allocationKey.value] ?? {};
    return Object.entries(map).map(([key, value]) => ({ key, label: key, value: value as number }));
});

function ledgerTone(kind: string) {
    return ({ RealizedPnL: 'ok', Cost: 'warn', Adjustment: 'violet', Exposure: 'info' } as Record<string, string>)[kind] ?? '';
}

function classificationLabel(c: string) {
    return ({
        Timing: 'timing', MissingEvent: 'missing event', MappingError: 'mapping error',
        ExternalManualActivity: 'external activity', Unexplained: 'unexplained',
    } as Record<string, string>)[c] ?? c;
}

async function loadSeries() {
    const from = new Date(Date.now() - windowDays.value * 86400000).toISOString();
    try { series.value = await get('/portfolio/value-series', { from }); }
    catch { series.value = []; }
}

async function loadAll() {
    loading.value = true;
    try {
        const [portfolio, recon, entries] = await Promise.all([
            get<any>('/portfolio'),
            get<any>('/reconciliation'),
            get<any[]>('/ledger', { limit: 300 }),
        ]);
        view.value = portfolio;
        reconciliation.value = recon;
        ledger.value = entries;
        await loadSeries();
    } catch (e: any) {
        Swal.fire({ title: 'Load failed', text: e?.message, icon: 'error', ...SWAL_THEME });
    } finally { loading.value = false; }
}

async function runReconciliation() {
    busy.value = true;
    try {
        const outcome = await post<any>('/reconciliation/run');
        await loadAll();
        await refreshOverview();
        Swal.fire({
            title: 'Reconciliation complete',
            text: `${outcome.Checked} item(s) checked, ${outcome.MaterialBreaks} material break(s).`,
            icon: outcome.MaterialBreaks ? 'warning' : 'success', ...SWAL_THEME,
        });
    } catch (e: any) {
        Swal.fire({ title: 'Reconciliation failed', text: e?.message, icon: 'error', ...SWAL_THEME });
    } finally { busy.value = false; }
}

async function resolveBreak(b: any) {
    const outcome = await Swal.fire({
        title: 'Explain this break',
        html: `<p style="text-align:left">${b.Detail}</p>`,
        input: 'text',
        inputLabel: 'What explains it? (kept in the audit trail)',
        showCancelButton: true, ...SWAL_THEME,
    });
    if (!outcome.isConfirmed) return;

    busy.value = true;
    try {
        await post('/reconciliation/resolve', { id: b.Id, resolution: outcome.value || 'resolved' });
        await loadAll();
        await refreshOverview();
    } finally { busy.value = false; }
}

onMounted(loadAll);
</script>
