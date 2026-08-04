<template>
    <OmniTraderShell>
        <div class="ot-pagehead">
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
                           :foot="`across ${view?.Real?.Positions ?? 0} real position(s)`" />
            <OmniTraderKpi label="Simulated" :value="fmtMoney(view?.Simulated?.TotalValue, currency)"
                           :loading="loading && !view" tone="info"
                           :foot="`${view?.Simulated?.Positions ?? 0} paper position(s) — not firm value`"
                           help="Paper and demo balances. Excluded from every real figure on this page, because they are not money." />
        </div>

        <OmniTraderCard title="Firm value" subtitle="Real money only"
                        :empty="!valueSeries.length" :loading="loading"
                        empty-title="No value history yet"
                        empty-text="The firm is valued every reconciliation sweep, about every 5 minutes."
                        style="margin-bottom:16px">
            <template #controls>
                <div class="ot-segment sm" role="group" aria-label="History window">
                    <button v-for="w in WINDOWS" :key="w.days" type="button" :aria-pressed="windowDays === w.days"
                            @click="windowDays = w.days; loadSeries()">{{ w.label }}</button>
                </div>
            </template>
            <OmniTraderLineChart :series="valueSeries" :height="280" :format="v => fmtMoney(v, currency, 0)" />
            <template #footer>
                Cash, owned inventory and broker-reported CFD equity add up to the total. Paper and
                demo balances are excluded.
            </template>
        </OmniTraderCard>

        <div class="ot-grid sidebar">
            <OmniTraderCard title="Positions"
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
                            <span class="sub">
                                {{ row.Venue }}
                                <template v-if="row.Environment !== 'Live'"> · simulated</template>
                            </span>
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
                <OmniTraderCard title="Allocation">
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

                <OmniTraderCard title="Valuation" :subtitle="`How native balances became ${currency}`" flush
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
            <OmniTraderCard title="Reconciliation"
                            :subtitle="`Last run ${fmtAgo(reconciliation?.LastRunUtc)} — holdings the platform did not trade are adopted, not flagged`" flush
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
                    <span v-if="lastRun">
                        Last sweep checked {{ lastRun.Checked }} item(s) ·
                        adopted {{ lastRun.Adopted }} holding(s) the platform had not seen ·
                        ignored {{ lastRun.DustIgnored }} dust fragment(s) ·
                        auto-closed {{ lastRun.AutoResolved }} break(s) whose condition had gone.
                        A break only survives while its difference does.
                    </span>
                    <span v-else>
                        Resolving a break records the explanation. It never edits a ledger entry.
                    </span>
                </template>
            </OmniTraderCard>

            <OmniTraderCard title="Ledger" flush
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
const series = ref<Array<{
    Ts: string; Total: number; Cash: number; InventoryValue: number; DerivativeEquity: number;
}>>([]);
const windowDays = ref(30);
const loading = ref(false);
const busy = ref(false);
const selected = ref<any>(null);
const allocationKey = ref('ExposureByVenue');

const materialBreaks = computed(() => reconciliation.value?.MaterialBreaks ?? 0);
const lastRun = computed(() => reconciliation.value?.LastRun ?? null);

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

// The total and what it is made of, on one scale — the components sum to the total,
// so no second y-axis and nothing to reconcile by eye. Every point is a recorded
// whole-firm valuation in the reporting currency, so there is nothing to add up here.
const COMPONENTS = [
    { key: 'Total', name: 'Firm value', fill: 'rgba(57, 135, 229, 0.10)' },
    { key: 'Cash', name: 'Cash', fill: '' },
    { key: 'InventoryValue', name: 'Owned inventory', fill: '' },
    { key: 'DerivativeEquity', name: 'CFD equity', fill: '' },
] as const;

const valueSeries = computed(() => {
    if (!series.value.length) return [];
    return COMPONENTS.map((component, index) => ({
        name: component.name,
        colour: seriesColour(index),
        fill: component.fill,
        points: series.value.map(point => ({
            x: new Date(point.Ts).getTime(),
            y: point[component.key] ?? 0,
        })),
    }));
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
    try { series.value = (await get<any>('/portfolio/value-series', { from }))?.Points ?? []; }
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
