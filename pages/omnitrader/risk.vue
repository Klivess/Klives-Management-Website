<template>
    <OmniTraderShell>
        <div class="ot-pagehead">
            <div class="ot-actions">
                <button class="ot-btn" :class="risk?.Controls.SafeModeActive ? 'primary' : 'warn'"
                    :disabled="busy" @click="toggleSafeMode">
                {{ risk?.Controls.SafeModeActive ? 'Clear safe mode' : 'Engage safe mode' }}
                </button>
                <button class="ot-btn ghost" :disabled="loading" @click="load">Refresh</button>
            </div>
        </div>

        <div v-if="risk?.Controls.SafeModeActive" class="ot-banner" role="alert">
            <span class="glyph" aria-hidden="true">🛑</span>
            <div>
                <strong>Safe mode is active — no new automated exposure</strong>
                {{ risk.Controls.SafeModeReason }}
                <template v-if="risk.Controls.SafeModeTriggeredBy">
                    Engaged by {{ risk.Controls.SafeModeTriggeredBy }}, {{ fmtAgo(risk.Controls.SafeModeSinceUtc) }}.
                </template>
                Existing positions are untouched.
            </div>
        </div>

        <!-- Utilisation is what an operator reads under pressure: how close each limit is
             to biting, on one common scale, with the escalation point marked. -->
        <div class="ot-grid three" style="margin-bottom:16px">
            <OmniTraderCard v-for="meter in meters" :key="meter.label" :title="meter.label"
                            :subtitle="meter.subtitle">
                <OmniTraderMeter :label="meter.detail" :percent="meter.percent" :value="meter.value"
                                 :value-tone="meter.tone" :limit="meter.limit" />
            </OmniTraderCard>
            <!-- Skeletons match the meters' geometry so the row does not jump when they land. -->
            <OmniTraderCard v-for="n in (meters.length ? 0 : 4)" :key="`skeleton-${n}`"
                            title="Utilisation" loading empty :skeleton-rows="3" />
        </div>

        <div class="ot-grid sidebar">
            <div class="ot-stack">
                <OmniTraderCard title="Risk budget"
                                :loading="loading && !risk">
                    <template #controls>
                        <span v-if="dirty" class="ot-chip warn">unsaved changes</span>
                    </template>
                    <div class="ot-formgrid">
                        <div v-for="field in LIMIT_FIELDS" :key="field.key" class="ot-field">
                            <label :for="`limit-${field.key}`">{{ field.label }}</label>
                            <input :id="`limit-${field.key}`" class="ot-input mono" type="number" step="any"
                                   v-model.number="draft[field.key]" />
                            <span class="help">{{ field.help }}</span>
                        </div>
                    </div>
                    <div class="actions">
                        <button class="ot-btn primary" :disabled="busy || !dirty" @click="saveLimits">Save budget</button>
                        <button class="ot-btn ghost" :disabled="!dirty" @click="resetDraft">Discard changes</button>
                    </div>
                    <template #footer>
                        A hard limit blocks the order. A soft limit escalates it to approval instead.
                        Firm daily loss and max drawdown additionally trip safe mode by themselves.
                    </template>
                </OmniTraderCard>

                <OmniTraderCard title="Recent risk decisions"
                                subtitle="Every proposal has one, approved or not" flush
                                :loading="loading && !risk" :empty="!decisions.length"
                                empty-title="No decisions yet"
                                empty-text="The record fills as proposals are evaluated.">
                    <OmniTraderDataTable :rows="decisions" :columns="decisionColumns" label="decisions"
                                         selectable :row-key="d => d.Id" :selected-key="selected?.Id ?? null"
                                         max-height="420px" default-sort="DecidedUtc"
                                         search-placeholder="Filter decisions…"
                                         @select="selected = $event">
                        <template #cell-Verdict="{ row }">
                            <span class="ot-chip" :class="verdictTone(row.Verdict)">{{ row.Verdict }}</span>
                        </template>
                        <template #cell-Summary="{ row }">
                            <span v-if="!row.Failures.length" class="muted">all seven layers passed</span>
                            <span v-else class="cellstack">
                                <span v-for="(f, index) in row.Failures.slice(0, 2)" :key="index" class="failline">
                                    <span class="ot-chip" :class="f.Severity === 'Hard' ? 'bad' : 'warn'">{{ f.Rule }}</span>
                                    <span class="sub">{{ f.Detail }}</span>
                                </span>
                                <span v-if="row.Failures.length > 2" class="sub">
                                    +{{ row.Failures.length - 2 }} more
                                </span>
                            </span>
                        </template>
                        <template #cell-DecidedUtc="{ row }">
                            <span :title="fmtTime(row.DecidedUtc)">{{ fmtAgo(row.DecidedUtc) }}</span>
                        </template>
                    </OmniTraderDataTable>
                </OmniTraderCard>

                <OmniTraderCard title="Exposure concentration">
                    <template #controls>
                        <div class="ot-segment sm" role="group" aria-label="Concentration dimension">
                            <button type="button" :aria-pressed="concentration === 'instrument'"
                                    @click="concentration = 'instrument'">Instrument</button>
                            <button type="button" :aria-pressed="concentration === 'venue'"
                                    @click="concentration = 'venue'">Venue</button>
                            <button type="button" :aria-pressed="concentration === 'strategy'"
                                    @click="concentration = 'strategy'">Strategy</button>
                        </div>
                    </template>
                    <OmniTraderBarList :items="concentrationBars" :format="v => fmtMoney(v, currency, 0)"
                                       empty-title="No exposure to measure" />
                    <template #footer>
                        Measured against
                        {{ concentration === 'instrument'
                            ? `the ${fmtMoney(risk?.Limits?.MaxSingleInstrumentExposure, currency, 0)} per-instrument cap`
                            : concentration === 'venue'
                                ? `the ${fmtMoney(risk?.Limits?.MaxVenueExposure, currency, 0)} per-venue cap`
                                : 'the per-strategy daily loss budget' }}.
                    </template>
                </OmniTraderCard>
            </div>

            <div class="ot-stack">
                <OmniTraderCard title="Kill switches" subtitle="Stop new proposals in one scope">
                    <p class="note">
                        A kill switch stops new automated proposals in its scope. Existing positions are
                        untouched — reducing exposure is the separate action below.
                    </p>
                    <div class="ot-formgrid" style="margin-bottom:12px">
                        <div class="ot-field">
                            <label for="ks-kind">Scope</label>
                            <select id="ks-kind" class="ot-select" v-model="killForm.kind">
                                <option value="Firm">Firm</option>
                                <option value="Venue">Venue</option>
                                <option value="Account">Account</option>
                                <option value="Strategy">Strategy</option>
                            </select>
                        </div>
                        <div class="ot-field" v-if="killForm.kind !== 'Firm'">
                            <label for="ks-scope">Target</label>
                            <input id="ks-scope" class="ot-input" v-model="killForm.scope" placeholder="Kraken / strategy id" />
                        </div>
                    </div>
                    <div class="ot-field" style="margin-bottom:12px">
                        <label for="ks-reason">Reason</label>
                        <input id="ks-reason" class="ot-input" v-model="killForm.reason"
                               placeholder="why you are stopping it" />
                        <span class="help">Required — a kill switch is audited.</span>
                    </div>
                    <button class="ot-btn danger block" :disabled="busy || !killForm.reason" @click="engageKill">
                        Engage kill switch
                    </button>

                    <div v-if="killSwitches.length" style="margin-top:16px">
                        <h4 class="ot-sectionhead">Active ({{ killSwitches.length }})</h4>
                        <div v-for="k in killSwitches" :key="k.Key" class="killrow">
                            <div>
                                <span class="ot-chip bad">{{ k.Key }}</span>
                                <span class="sub">{{ k.Reason }} — {{ k.TriggeredBy }}, {{ fmtAgo(k.TriggeredUtc) }}</span>
                            </div>
                            <button class="ot-btn ghost sm" :disabled="busy" @click="releaseKill(k)">Release</button>
                        </div>
                    </div>
                </OmniTraderCard>

                <OmniTraderCard title="Reduce exposure" attention subtitle="Close positions through the risk engine">
                    <p class="note">
                        This submits real closing orders. It changes the firm's economic position, so it
                        previews exactly what it would close and requires the token from that preview.
                    </p>
                    <div class="ot-field" style="margin-bottom:12px">
                        <label for="rv-venue">Venue filter</label>
                        <input id="rv-venue" class="ot-input" v-model="reduceVenue" placeholder="blank = every venue" />
                    </div>
                    <button class="ot-btn warn block" :disabled="busy" @click="previewReduce">
                        Preview what this would close
                    </button>
                </OmniTraderCard>

                <OmniTraderCard title="Operational gates">
                    <dl class="ot-kv">
                        <dt>Unknown orders</dt>
                        <dd :class="risk?.Operations.UnknownOrders ? 'neg' : ''">{{ risk?.Operations.UnknownOrders ?? 0 }}</dd>
                        <dt>Open breaks</dt>
                        <dd :class="risk?.Operations.UnreconciledBreaks ? 'neg' : ''">{{ risk?.Operations.UnreconciledBreaks ?? 0 }}</dd>
                        <dt>Rejections (1h)</dt>
                        <dd>{{ risk?.Operations.RecentRejections ?? 0 }}</dd>
                        <dt>Free inventory</dt>
                        <dd>{{ Object.keys(risk?.Portfolio.FreeInventory ?? {}).length }} asset(s)</dd>
                        <dt>Available funds</dt>
                        <dd>{{ risk?.Portfolio.AvailableFunds !== null && risk?.Portfolio.AvailableFunds !== undefined
                            ? fmtMoney(risk.Portfolio.AvailableFunds, currency) : 'unknown' }}</dd>
                        <dt>Peak equity</dt>
                        <dd>{{ fmtMoney(risk?.Portfolio.PeakEquity, currency) }}</dd>
                    </dl>
                </OmniTraderCard>
            </div>
        </div>

        <!-- Decision detail -->
        <OmniTraderDrawer :open="!!selected" title="Risk decision"
                          :subtitle="selected ? `${selected.Verdict} · ${fmtTime(selected.DecidedUtc)}` : ''"
                          @close="selected = null">
            <template v-if="selected">
                <p class="note">{{ selected.Summary || 'No summary recorded.' }}</p>
                <h4 class="ot-sectionhead">Failures</h4>
                <div v-if="selected.Failures.length" class="ot-rules">
                    <div v-for="(f, index) in selected.Failures" :key="index" class="ot-rule"
                         :class="f.Severity === 'Hard' ? 'hard' : 'soft'">
                        <span class="icon" aria-hidden="true">{{ f.Severity === 'Hard' ? '✕' : '!' }}</span>
                        <span class="name">{{ f.Rule }}</span>
                        <span class="detail">{{ f.Detail ?? layerLabel(f.Layer) }}</span>
                        <span class="measure" v-if="f.Observed !== null">
                            {{ fmtNum(f.Observed, 2) }}<span v-if="f.Limit !== null"> / {{ fmtNum(f.Limit, 2) }}</span>
                        </span>
                    </div>
                </div>
                <OmniTraderStateBlock v-else kind="ok" compact title="No failures"
                                      detail="Every layer passed for this proposal." />
            </template>
            <template #footer>
                <button class="ot-btn ghost" @click="selected = null">Close</button>
            </template>
        </OmniTraderDrawer>

        <!-- Two-step reduction: preview, then a token derived from that exact preview. -->
        <div v-if="reducePreview" class="ot-modal-backdrop" @click.self="reducePreview = null">
            <div class="ot-modal" role="dialog" aria-modal="true" aria-label="Reduce exposure preview">
                <header>
                    <h3>Reduce exposure — preview</h3>
                    <button class="ot-btn ghost sm" @click="reducePreview = null">Close ✕</button>
                </header>
                <div class="body">
                    <div class="ot-banner warn">
                        <span class="glyph" aria-hidden="true">⚠</span>
                        <div>{{ reducePreview.Warning }}</div>
                    </div>

                    <OmniTraderStateBlock v-if="!reducePreview.Positions.length" title="Nothing to close"
                                          detail="No open positions match this filter." />
                    <template v-else>
                        <div class="ot-tablewrap">
                            <table class="ot-table">
                                <thead>
                                    <tr>
                                        <th>Instrument</th><th>Venue</th><th>Action</th>
                                        <th class="num">Quantity</th><th class="num">Notional</th>
                                        <th class="num">Expected P&amp;L</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="p in reducePreview.Positions" :key="p.InstrumentId + p.Venue">
                                        <td>{{ p.DisplayName }}</td>
                                        <td>
                                            <span class="ot-chip" :class="envClass(p.Environment)">{{ p.Environment }}</span>
                                            {{ p.Venue }}
                                        </td>
                                        <td><span class="ot-chip" :class="p.ClosingSide === 'Sell' ? 'bad' : 'ok'">{{ p.ClosingSide }}</span></td>
                                        <td class="num">{{ fmtNum(Math.abs(p.Quantity), 8) }}</td>
                                        <td class="num">{{ fmtNum(p.Notional, 2) }}</td>
                                        <td class="num" :class="p.UnrealizedPnL >= 0 ? 'pos' : 'neg'">{{ fmtNum(p.UnrealizedPnL, 2) }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <dl class="ot-kv" style="margin-top:16px">
                            <dt>Positions</dt><dd>{{ reducePreview.Positions.length }}</dd>
                            <dt>Total notional</dt><dd>{{ fmtNum(reducePreview.TotalNotional, 2) }}</dd>
                            <dt>Expected realized</dt><dd>{{ fmtNum(reducePreview.ExpectedRealized, 2) }}</dd>
                        </dl>
                        <div class="ot-field" style="margin-top:16px">
                            <label for="reduce-token">Type the confirmation token to proceed</label>
                            <input id="reduce-token" class="ot-input mono" v-model="reduceToken"
                                   :placeholder="reducePreview.ConfirmToken" />
                            <span class="help">
                                The token is derived from this exact preview. If the book moves before you
                                confirm, it stops matching and you are asked to look again.
                            </span>
                        </div>
                    </template>
                </div>
                <footer>
                    <button class="ot-btn ghost" @click="reducePreview = null">Cancel</button>
                    <button class="ot-btn danger" :disabled="busy || reduceToken !== reducePreview.ConfirmToken"
                            @click="executeReduce">
                        Close {{ reducePreview.Positions.length }} position(s)
                    </button>
                </footer>
            </div>
        </div>
    </OmniTraderShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import Swal from 'sweetalert2';
import {
    useOmniTrader, fmtMoney, fmtSigned, fmtNum, fmtAgo, fmtTime, fmtPct, envClass,
    layerLabel, verdictTone, signTone, SWAL_THEME,
} from '~/composables/useOmniTrader';
import type { TableColumn } from '~/components/OmniTrader/DataTable.vue';

definePageMeta({ layout: 'navbar' });

const { get, post, currency, refreshOverview } = useOmniTrader();

const LIMIT_FIELDS = [
    { key: 'MaxOrderNotional', label: 'Max order notional', help: 'hard — blocks the order' },
    { key: 'SoftOrderNotional', label: 'Soft order notional', help: 'soft — escalates to approval' },
    { key: 'MaxStrategyDailyLoss', label: 'Strategy daily loss', help: 'per strategy, per day' },
    { key: 'MaxConcurrentPositionsPerStrategy', label: 'Max positions / strategy', help: 'concurrency cap' },
    { key: 'MaxGrossExposure', label: 'Max gross exposure', help: 'sum of absolute notional' },
    { key: 'MaxNetExposure', label: 'Max net exposure', help: 'directional, ±' },
    { key: 'MaxSingleInstrumentExposure', label: 'Max per instrument', help: 'concentration cap' },
    { key: 'MaxVenueExposure', label: 'Max per venue', help: 'venue concentration' },
    { key: 'MaxFirmDailyLoss', label: 'Firm daily loss', help: 'trips safe mode automatically' },
    { key: 'MaxDrawdownPercent', label: 'Max drawdown %', help: 'trips safe mode automatically' },
    { key: 'RepeatedRejectionThreshold', label: 'Rejection threshold', help: 'repeated broker rejections' },
] as const;

const risk = ref<any>(null);
const draft = reactive<Record<string, number>>({});
const loading = ref(false);
const busy = ref(false);
const selected = ref<any>(null);
const reduceVenue = ref('');
const reducePreview = ref<any>(null);
const reduceToken = ref('');
const concentration = ref<'instrument' | 'venue' | 'strategy'>('instrument');
const killForm = reactive({ kind: 'Firm', scope: '', reason: '' });

const decisions = computed(() => risk.value?.RecentDecisions ?? []);
const killSwitches = computed(() => risk.value?.Controls.KillSwitches ?? []);

const decisionColumns: TableColumn[] = [
    { key: 'Verdict', label: 'Verdict', width: '150px' },
    { key: 'Summary', label: 'Why', sortable: false, searchValue: d => `${d.Summary} ${d.Failures.map((f: any) => f.Rule).join(' ')}` },
    { key: 'DecidedUtc', label: 'When', num: true, width: '110px' },
];

const dirty = computed(() =>
    !!risk.value && LIMIT_FIELDS.some(f => Number(draft[f.key]) !== Number(risk.value.Limits[f.key])));

const meters = computed(() => {
    const u = risk.value?.Utilisation;
    const p = risk.value?.Portfolio;
    const limits = risk.value?.Limits;
    if (!u || !p || !limits) return [];
    return [
        {
            label: 'Gross exposure', subtitle: 'Sum of absolute notional',
            detail: 'in use', percent: u.Gross, value: fmtMoney(p.GrossExposure, currency.value),
            limit: `limit ${fmtMoney(limits.MaxGrossExposure, currency.value, 0)}`, tone: '',
        },
        {
            label: 'Net exposure', subtitle: 'Directional lean of the book',
            detail: 'in use', percent: u.Net, value: fmtSigned(p.NetExposure, currency.value),
            limit: `limit ±${fmtMoney(limits.MaxNetExposure, currency.value, 0)}`, tone: '',
        },
        {
            label: 'Daily loss budget', subtitle: 'Trips safe mode on breach',
            detail: 'consumed', percent: u.DailyLoss, value: fmtSigned(p.DailyRealizedPnL, currency.value),
            limit: `limit ${fmtMoney(limits.MaxFirmDailyLoss, currency.value, 0)}`,
            tone: signTone(p.DailyRealizedPnL),
        },
        {
            label: 'Drawdown', subtitle: 'From peak equity',
            detail: 'of the allowance', percent: u.Drawdown, value: fmtPct(p.DrawdownPercent, 2),
            limit: `limit ${limits.MaxDrawdownPercent}%`, tone: (p.DrawdownPercent ?? 0) > 0 ? 'neg' : '',
        },
    ];
});

const concentrationBars = computed(() => {
    const p = risk.value?.Portfolio;
    if (!p) return [];
    const map: Record<string, number> =
        concentration.value === 'instrument' ? p.ExposureByInstrument
        : concentration.value === 'venue' ? p.ExposureByVenue
        : p.DailyPnLByStrategy;
    return Object.entries(map ?? {}).map(([key, value]) => ({ key, label: key, value: value as number }));
});

function resetDraft() {
    if (!risk.value) return;
    for (const field of LIMIT_FIELDS) draft[field.key] = risk.value.Limits[field.key];
}

async function load() {
    loading.value = true;
    try {
        risk.value = await get('/risk');
        resetDraft();
    } catch (e: any) {
        Swal.fire({ title: 'Load failed', text: e?.message, icon: 'error', ...SWAL_THEME });
    } finally { loading.value = false; }
}

async function saveLimits() {
    const confirmed = await Swal.fire({
        title: 'Change the risk budget?',
        text: 'Every future proposal is measured against these numbers. The change is audited.',
        icon: 'question', showCancelButton: true, ...SWAL_THEME,
    });
    if (!confirmed.isConfirmed) return;

    busy.value = true;
    try {
        await post('/risk/limits', undefined, { ...risk.value.Limits, ...draft });
        await load();
        await refreshOverview();
    } catch (e: any) {
        Swal.fire({ title: 'Save failed', text: e?.message, icon: 'error', ...SWAL_THEME });
    } finally { busy.value = false; }
}

async function toggleSafeMode() {
    const enabling = !risk.value?.Controls.SafeModeActive;
    const outcome = await Swal.fire({
        title: enabling ? 'Engage safe mode?' : 'Clear safe mode?',
        input: enabling ? 'text' : undefined,
        inputLabel: enabling ? 'Reason (recorded)' : undefined,
        text: enabling ? undefined : 'Automated proposals resume, subject to the risk engine.',
        icon: 'warning', showCancelButton: true, ...SWAL_THEME,
        confirmButtonColor: enabling ? '#ff6b6b' : '#6ddc4f',
    });
    if (!outcome.isConfirmed) return;

    busy.value = true;
    try {
        await post('/risk/safe-mode', { enable: enabling, reason: outcome.value || 'manual' });
        await load();
        await refreshOverview();
    } finally { busy.value = false; }
}

async function engageKill() {
    busy.value = true;
    try {
        await post('/risk/killswitch', undefined, {
            Kind: killForm.kind, Scope: killForm.scope, Reason: killForm.reason,
        });
        killForm.reason = ''; killForm.scope = '';
        await load();
        await refreshOverview();
    } catch (e: any) {
        Swal.fire({ title: 'Could not engage', text: e?.message, icon: 'error', ...SWAL_THEME });
    } finally { busy.value = false; }
}

async function releaseKill(k: any) {
    const [kind, ...rest] = k.Key.split(':');
    busy.value = true;
    try {
        await post('/risk/killswitch', undefined, { Kind: kind, Scope: rest.join(':'), Release: true });
        await load();
        await refreshOverview();
    } finally { busy.value = false; }
}

async function previewReduce() {
    busy.value = true;
    try {
        reduceToken.value = '';
        reducePreview.value = await post('/risk/reduce/preview', { venue: reduceVenue.value });
    } catch (e: any) {
        Swal.fire({ title: 'Preview failed', text: e?.message, icon: 'error', ...SWAL_THEME });
    } finally { busy.value = false; }
}

async function executeReduce() {
    busy.value = true;
    try {
        const outcome = await post<any>('/risk/reduce/execute', {
            venue: reduceVenue.value, confirm: reduceToken.value,
        });
        reducePreview.value = null;
        await load();
        await refreshOverview();
        Swal.fire({
            title: 'Closing orders submitted',
            text: `${outcome.Requested} position(s) routed through the risk engine.`,
            icon: 'success', ...SWAL_THEME,
        });
    } catch (e: any) {
        Swal.fire({ title: 'Reduction refused', text: e?.message, icon: 'error', ...SWAL_THEME });
    } finally { busy.value = false; }
}

onMounted(load);
</script>

<style scoped>
.note { margin: 0 0 var(--ot-space-3); font-size: 12.5px; color: var(--ot-text-2); line-height: 1.5; }
.actions { display: flex; gap: var(--ot-space-2); margin-top: var(--ot-space-4); }
.killrow {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--ot-space-2);
    padding: var(--ot-space-2) 0;
    border-bottom: 1px solid rgba(146, 196, 130, 0.08);
}
.killrow .sub { display: block; font-size: 11px; color: var(--ot-muted); margin-top: 3px; }
.failline { display: flex; gap: var(--ot-space-2); align-items: baseline; }
</style>
