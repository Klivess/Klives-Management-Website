<template>
    <OmniTraderShell>
        <div class="ot-pagehead">
            <div>
                <h1>Command Centre</h1>
                <p class="question">
                    Is the operation healthy, and is anything waiting on me? Value, exposure and exceptions
                    for {{ scopeLabel }}, refreshed every 15 seconds.
                </p>
            </div>
            <div class="ot-actions">
                <NuxtLink class="ot-btn ghost" to="/omnitrader/execution">Order ticket</NuxtLink>
                <button class="ot-btn" :class="overview?.Controls.SafeModeActive ? 'primary' : 'warn'"
                        :disabled="busy" @click="toggleSafeMode">
                    {{ overview?.Controls.SafeModeActive ? 'Clear safe mode' : 'Engage safe mode' }}
                </button>
            </div>
        </div>

        <!-- Exceptions outrank every number on the page: they are the only things that
             cannot wait for the operator to go looking. -->
        <section v-if="exceptionCount > 0" class="exceptions" aria-label="Items needing a decision">
            <h2 class="ot-sectionhead">Needs a decision — {{ exceptionCount }} item(s)</h2>
            <div class="ot-kpis tight">
                <OmniTraderKpi v-if="ex.AwaitingApproval" label="Awaiting approval" attention-soft
                               :value="String(ex.AwaitingApproval)" to="/omnitrader/execution"
                               foot="orders held for a human decision" />
                <OmniTraderKpi v-if="ex.UnknownOrders" label="Unknown outcome" attention
                               :value="String(ex.UnknownOrders)" to="/omnitrader/execution"
                               foot="never retried — resolve by reconciling" />
                <OmniTraderKpi v-if="ex.MaterialBreaks" label="Reconciliation breaks" attention
                               :value="String(ex.MaterialBreaks)" to="/omnitrader/portfolio"
                               foot="internal and broker state disagree" />
                <OmniTraderKpi v-if="ex.UnacknowledgedCritical" label="Critical alerts" attention
                               :value="String(ex.UnacknowledgedCritical)" to="/omnitrader/systems"
                               foot="unacknowledged" />
            </div>
        </section>

        <!-- Owned inventory and CFD exposure are kept visually apart on purpose: one is an
             asset, the other is a notional the firm does not own. -->
        <div class="ot-kpis">
            <OmniTraderKpi label="Firm value" :value="fmtMoney(p?.TotalValue, currency)"
                           :loading="!overview" :compare="valueChange" baseline="vs 24 hours ago"
                           :compare-format="formatMoneyChange" :spark="valueSpark"
                           help="Cash plus marked owned inventory plus broker-reported CFD equity. CFD notional is excluded — it is exposure, not an asset."
                           :foot="trendFoot" />
            <OmniTraderKpi label="Cash" :value="fmtMoney(p?.Cash, currency)" :loading="!overview"
                           foot="across all accounts, converted" />
            <OmniTraderKpi label="Owned inventory" tone="info" :value="fmtMoney(p?.InventoryValue, currency)"
                           :loading="!overview" foot="spot assets, marked to market" />
            <OmniTraderKpi label="CFD notional" tone="violet" :value="fmtMoney(p?.DerivativeNotional, currency)"
                           :loading="!overview" foot="exposure, not an owned asset"
                           help="Derivative notional is never summed with owned inventory." />
            <OmniTraderKpi label="Realized today" :tone="valueTone(p?.RealizedPnLToday)"
                           :value="fmtSigned(p?.RealizedPnLToday, currency)" :loading="!overview"
                           :foot="`costs ${fmtMoney(p?.CostsToday, currency)} · since 00:00 UTC`" />
            <OmniTraderKpi label="Unrealized" :tone="valueTone(p?.UnrealizedPnL)"
                           :value="fmtSigned(p?.UnrealizedPnL, currency)" :loading="!overview"
                           :foot="`${p?.Positions ?? 0} open position(s)`" />
        </div>

        <div class="ot-grid sidebar">
            <div class="ot-stack">
                <OmniTraderCard title="Firm value" question="Where has the book been over the last 30 days?"
                                :empty="!valuePoints.length"
                                empty-title="No value history yet"
                                empty-text="Snapshots are recorded each time an account is reconciled. Run a reconciliation on Portfolio to create the first one.">
                    <template #controls>
                        <span class="ot-chip">{{ currency }}</span>
                    </template>
                    <OmniTraderLineChart :series="valueSeries" :height="260"
                                         :format="v => fmtMoney(v, currency, 0)" x-label="Snapshot" />
                    <template #footer>
                        Account snapshots, not tick data — the curve moves when a venue is reconciled.
                    </template>
                </OmniTraderCard>

                <OmniTraderCard title="Exposure against limits"
                                question="How much of the risk budget is already spent?">
                    <template #controls>
                        <NuxtLink class="ot-btn ghost sm" to="/omnitrader/risk">Risk controls</NuxtLink>
                    </template>
                    <div class="ot-grid three">
                        <OmniTraderMeter label="Gross exposure" :percent="util.gross"
                                         :value="fmtMoney(p?.GrossExposure, currency)"
                                         :limit="`limit ${fmtMoney(limits.MaxGrossExposure, currency, 0)}`" />
                        <OmniTraderMeter label="Net exposure" :percent="util.net"
                                         :value="fmtSigned(p?.NetExposure, currency)"
                                         :limit="`limit ±${fmtMoney(limits.MaxNetExposure, currency, 0)}`" />
                        <OmniTraderMeter label="Daily loss budget" :percent="util.loss"
                                         :value="fmtSigned(p?.RealizedPnLToday, currency)"
                                         :value-tone="signTone(p?.RealizedPnLToday)"
                                         :limit="`limit ${fmtMoney(limits.MaxFirmDailyLoss, currency, 0)}`" />
                    </div>
                    <div v-if="p?.Warnings?.length" class="warnings">
                        <span v-for="w in p.Warnings" :key="w" class="ot-chip warn">
                            <span class="glyph" aria-hidden="true">⚠</span> {{ w }}
                        </span>
                    </div>
                </OmniTraderCard>

                <OmniTraderCard title="Open alerts" question="What has the platform raised that is still open?"
                                flush :empty="!alerts.length" empty-kind="ok"
                                empty-title="Nothing open" empty-text="No alert is currently raised.">
                    <template #controls>
                        <NuxtLink class="ot-btn ghost sm" to="/omnitrader/systems">All alerts</NuxtLink>
                    </template>
                    <OmniTraderDataTable :rows="alerts" :columns="alertColumns" label="alerts"
                                         :row-key="a => a.Id" :row-class="a => a.NeedsAcknowledgement ? 'attention' : ''"
                                         max-height="360px" default-sort="RaisedUtc">
                        <template #cell-Severity="{ row }">
                            <span class="ot-chip" :class="severityTone(row.Severity)">
                                <span class="glyph" aria-hidden="true">{{ severityGlyph(row.Severity) }}</span>
                                {{ row.Severity }}
                            </span>
                        </template>
                        <template #cell-Title="{ row }">
                            <span class="cellstack">
                                <span>{{ row.Title }}</span>
                                <span class="sub">{{ row.Message }}</span>
                                <span v-if="row.RecoveryHint" class="sub" style="color:var(--ot-info)">
                                    Next: {{ row.RecoveryHint }}
                                </span>
                            </span>
                        </template>
                        <template #cell-Scope="{ row }">
                            {{ [row.Venue, row.Environment].filter(Boolean).join(' · ') || '—' }}
                        </template>
                        <template #cell-RaisedUtc="{ row }">
                            <span class="cellstack">
                                <span>{{ fmtAgo(row.RaisedUtc) }}</span>
                                <span v-if="row.OccurrenceCount > 1" class="sub">×{{ row.OccurrenceCount }} occurrences</span>
                            </span>
                        </template>
                        <template #cell-actions="{ row }">
                            <button v-if="row.NeedsAcknowledgement" class="ot-btn sm warn"
                                    :disabled="busy" @click.stop="acknowledge(row.Id)">Acknowledge</button>
                            <span v-else-if="row.AcknowledgedBy" class="ot-chip">seen by {{ row.AcknowledgedBy }}</span>
                        </template>
                    </OmniTraderDataTable>
                </OmniTraderCard>
            </div>

            <div class="ot-stack">
                <OmniTraderCard title="Venues" question="Can the firm actually reach a broker?" flush>
                    <table class="ot-table">
                        <tbody>
                            <tr v-for="venue in overview?.Venues ?? []" :key="venue.Venue + venue.Environment">
                                <td>
                                    <span class="cellstack">
                                        <span>{{ venue.DisplayName }}</span>
                                        <span class="sub">{{ venue.Exposure === 'Derivative' ? 'leveraged exposure' : 'owned inventory' }}</span>
                                    </span>
                                </td>
                                <td><span class="ot-chip" :class="envClass(venue.Environment)">{{ venue.Environment }}</span></td>
                                <td class="num">
                                    <span class="ot-chip" :class="venue.OrderPathHealthy ? 'ok' : venue.IsConfigured ? 'warn' : ''">
                                        <span class="glyph" aria-hidden="true">{{ venue.OrderPathHealthy ? '✓' : venue.IsConfigured ? '!' : '○' }}</span>
                                        {{ venue.OrderPathHealthy ? 'order path up' : venue.IsConfigured ? 'degraded' : 'not configured' }}
                                    </span>
                                </td>
                            </tr>
                            <tr v-if="!overview?.Venues?.length">
                                <td colspan="3"><OmniTraderStateBlock compact title="No venues registered"
                                    detail="A venue with missing credentials is not registered. Set them in Omni settings." /></td>
                            </tr>
                        </tbody>
                    </table>
                </OmniTraderCard>

                <OmniTraderCard title="Controls" question="What is currently restraining automation?">
                    <dl class="ot-kv">
                        <dt>Safe mode</dt>
                        <dd>
                            <span class="ot-chip" :class="overview?.Controls.SafeModeActive ? 'bad' : 'ok'">
                                <span class="glyph" aria-hidden="true">{{ overview?.Controls.SafeModeActive ? '⛔' : '✓' }}</span>
                                {{ overview?.Controls.SafeModeActive ? 'Active' : 'Clear' }}
                            </span>
                        </dd>
                        <template v-if="overview?.Controls.SafeModeActive">
                            <dt>Reason</dt><dd>{{ overview.Controls.SafeModeReason }}</dd>
                            <dt>Since</dt><dd>{{ fmtAgo(overview.Controls.SafeModeSinceUtc) }}</dd>
                        </template>
                        <dt>Kill switches</dt>
                        <dd>{{ overview?.Controls.KillSwitches.length ?? 0 }}</dd>
                        <dt>Strategies</dt>
                        <dd>{{ overview?.Strategies.Running ?? 0 }} running / {{ overview?.Strategies.Total ?? 0 }} available</dd>
                    </dl>
                    <div v-if="overview?.Controls.KillSwitches.length" class="switches">
                        <span v-for="k in overview.Controls.KillSwitches" :key="k.Key"
                              class="ot-chip bad" :title="`${k.Reason} — ${k.TriggeredBy}`">{{ k.Key }}</span>
                    </div>
                </OmniTraderCard>

                <OmniTraderCard title="Today" question="What has happened since midnight UTC?">
                    <dl class="ot-kv">
                        <dt>Realized</dt>
                        <dd :class="signTone(p?.RealizedPnLToday)">{{ fmtSigned(p?.RealizedPnLToday, currency) }}</dd>
                        <dt>Costs</dt><dd>{{ fmtMoney(p?.CostsToday, currency) }}</dd>
                        <dt>Gross exposure</dt><dd>{{ fmtMoney(p?.GrossExposure, currency) }}</dd>
                        <dt>Net exposure</dt><dd>{{ fmtSigned(p?.NetExposure, currency) }}</dd>
                        <dt>Positions</dt><dd>{{ p?.Positions ?? 0 }}</dd>
                        <dt>Peak (30d)</dt><dd>{{ fmtMoney(overview?.Trend?.PeakValue, currency, 0) }}</dd>
                    </dl>
                </OmniTraderCard>
            </div>
        </div>
    </OmniTraderShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Swal from 'sweetalert2';
import {
    useOmniTrader, fmtMoney, fmtSigned, fmtAgo, envClass, severityTone, severityGlyph, changeVs, signTone, valueTone,
    seriesColour, SWAL_THEME,
} from '~/composables/useOmniTrader';
import type { TableColumn } from '~/components/OmniTrader/DataTable.vue';

definePageMeta({ layout: 'navbar' });

const { overview, exceptionCount, currency, environment, get, post, refreshOverview } = useOmniTrader();
const busy = ref(false);

const p = computed(() => overview.value?.Portfolio);
const ex = computed(() => overview.value?.Exceptions ?? {
    AwaitingApproval: 0, UnknownOrders: 0, MaterialBreaks: 0, CriticalAlerts: 0, UnacknowledgedCritical: 0,
});
const alerts = computed(() => overview.value?.Alerts ?? []);
const scopeLabel = computed(() =>
    environment.value === 'All' ? 'every environment' : `the ${environment.value.toLowerCase()} environment`);

const alertColumns: TableColumn[] = [
    { key: 'Severity', label: 'Severity', width: '110px' },
    { key: 'Title', label: 'Alert', searchValue: r => `${r.Title} ${r.Message}` },
    { key: 'Scope', label: 'Scope', width: '140px', sortValue: r => `${r.Venue ?? ''}${r.Environment ?? ''}` },
    { key: 'RaisedUtc', label: 'Raised', num: true, width: '120px' },
    { key: 'actions', label: '', num: true, sortable: false, width: '120px' },
];

// The 30-day value trend arrives with the overview, so the headline has a baseline
// without a second request.
const valuePoints = computed(() => overview.value?.Trend?.Points ?? []);
const valueSpark = computed(() => valuePoints.value.map(pt => pt.Value));
const valueSeries = computed(() => [{
    name: 'Firm value',
    colour: seriesColour(0),
    fill: 'rgba(57, 135, 229, 0.12)',
    points: valuePoints.value.map(pt => ({ x: new Date(pt.Ts).getTime(), y: pt.Value })),
}]);

const valueChange = computed(() => {
    const trend = overview.value?.Trend;
    if (!trend || trend.Change24h === null || trend.Change24h === undefined) return null;
    return { absolute: trend.Change24h, percent: trend.ChangePercent24h, direction: Math.sign(trend.Change24h) };
});

const trendFoot = computed(() => {
    if (!overview.value) return undefined;
    if (!valueChange.value) return 'No snapshot from 24 hours ago to compare against';
    return undefined;
});

function formatMoneyChange(change: { absolute: number; percent: number | null }) {
    const money = fmtSigned(change.absolute, currency.value);
    return change.percent === null ? money : `${money} (${change.percent >= 0 ? '+' : ''}${change.percent.toFixed(2)}%)`;
}

// Utilisation is measured against the configured budget, pulled once. Without the
// real limits the meters would be measuring against an invented denominator.
const limits = ref({ MaxGrossExposure: 0, MaxNetExposure: 0, MaxFirmDailyLoss: 0 });

const util = computed(() => {
    const portfolio = p.value;
    if (!portfolio) return { gross: 0, net: 0, loss: 0 };
    const pct = (value: number, limit: number) => (limit > 0 ? Math.min(100, (value / limit) * 100) : 0);
    return {
        gross: pct(portfolio.GrossExposure, limits.value.MaxGrossExposure),
        net: pct(Math.abs(portfolio.NetExposure), limits.value.MaxNetExposure),
        loss: pct(Math.abs(Math.min(0, portfolio.RealizedPnLToday)), limits.value.MaxFirmDailyLoss),
    };
});

async function toggleSafeMode() {
    const enabling = !overview.value?.Controls.SafeModeActive;
    const confirmed = await Swal.fire({
        title: enabling ? 'Engage safe mode?' : 'Clear safe mode?',
        text: enabling
            ? 'All new automated exposure stops firm-wide. Existing positions are untouched — reducing exposure is a separate action on the Risk page.'
            : 'Automated proposals resume, subject to the risk engine.',
        icon: 'warning', showCancelButton: true, ...SWAL_THEME,
        confirmButtonColor: enabling ? '#ff6b6b' : '#6ddc4f',
    });
    if (!confirmed.isConfirmed) return;

    busy.value = true;
    try {
        await post('/risk/safe-mode', { enable: enabling, reason: 'command centre' });
        await refreshOverview();
    } catch (e: any) {
        Swal.fire({ title: 'Failed', text: e?.message, icon: 'error', ...SWAL_THEME });
    } finally { busy.value = false; }
}

async function acknowledge(id: string) {
    busy.value = true;
    try {
        await post('/alert/acknowledge', { id });
        await refreshOverview();
    } catch (e: any) {
        Swal.fire({ title: 'Could not acknowledge', text: e?.message, icon: 'error', ...SWAL_THEME });
    } finally { busy.value = false; }
}

onMounted(async () => {
    try {
        const risk = await get<any>('/risk');
        if (risk?.Limits) limits.value = risk.Limits;
    } catch { /* the meters show 0% of an unknown limit rather than a made-up one */ }
});
</script>

<style scoped>
.exceptions { margin-bottom: var(--ot-space-4); }
.warnings { display: flex; flex-wrap: wrap; gap: var(--ot-space-2); margin-top: var(--ot-space-3); }
.switches { display: flex; flex-wrap: wrap; gap: var(--ot-space-2); margin-top: var(--ot-space-3); }
</style>
