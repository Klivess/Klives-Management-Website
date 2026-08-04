<template>
    <OmniTraderShell>
        <div class="ot-pagehead">
            <div class="ot-actions">
                <button class="ot-btn ghost" :disabled="loading" @click="loadAll">Refresh</button>
            </div>
        </div>

        <div class="ot-kpis">
            <OmniTraderKpi label="Registered" :value="String(strategies.length)" :loading="loading && !strategies.length"
                           foot="discovered at startup" />
            <OmniTraderKpi label="Running" tone="good" :value="String(runningCount)"
                           :loading="loading && !deployments.length"
                           :foot="`of ${deployments.length} deployment(s)`" />
            <OmniTraderKpi label="Armed live" :tone="armedCount ? 'bad' : ''" :value="String(armedCount)"
                           :loading="loading && !deployments.length"
                           foot="able to place real orders now" />
            <OmniTraderKpi label="Versions" tone="info" :value="String(versions.length)"
                           :loading="loading && !versions.length" foot="immutable configurations" />
            <OmniTraderKpi label="Live authority" :tone="liveAuthorityCount ? 'warn' : ''"
                           :value="String(liveAuthorityCount)" :loading="loading && !versions.length"
                           foot="versions cleared for real money" />
        </div>

        <div class="ot-grid sidebar">
            <div class="ot-stack">
                <OmniTraderCard title="Deployments" subtitle="Running strategy instances" flush
                                :loading="loading" :empty="!deployments.length"
                                empty-title="No deployments"
                                empty-text="Deploy a strategy from the panel on the right.">
                    <OmniTraderDataTable :rows="deployments" :columns="deploymentColumns" label="deployments"
                                         selectable :row-key="d => d.Id" :selected-key="selected?.Id ?? null"
                                         default-sort="CreatedUtc" search-placeholder="Filter deployments…"
                                         :row-class="d => d.Status === 'Errored' ? 'attention' : ''"
                                         @select="openDeployment($event)">
                        <template #cell-StrategyClass="{ row }">
                            <span class="cellstack">
                                <span>{{ prettyName(row.StrategyClass) }}</span>
                                <span class="sub">{{ row.Symbol }} · {{ row.Interval }}</span>
                            </span>
                        </template>
                        <template #cell-Mode="{ row }">
                            <span class="cellstack">
                                <span class="ot-chip" :class="row.Mode === 'Live' ? 'live' : 'paper'">{{ row.Mode }}</span>
                                <span v-if="row.Mode === 'Live'" class="sub">
                                    <span class="ot-chip" :class="row.Armed ? 'bad' : ''">
                                        {{ row.Armed ? 'ARMED' : 'disarmed' }}
                                    </span>
                                </span>
                            </span>
                        </template>
                        <template #cell-Status="{ row }">
                            <span class="cellstack">
                                <span class="ot-chip" :class="statusTone(row.Status)">{{ row.Status }}</span>
                                <span v-if="row.Error" class="sub" style="color:var(--ot-negative)">{{ row.Error }}</span>
                            </span>
                        </template>
                        <template #cell-EquityCurrent="{ row }">{{ fmtNum(row.EquityCurrent, 2) }}</template>
                        <template #cell-PnLPercent="{ row }">
                            <span :class="row.PnLPercent >= 0 ? 'pos' : 'neg'">{{ fmtSignedPct(row.PnLPercent) }}</span>
                        </template>
                        <template #cell-CreatedUtc="{ row }">
                            <span :title="fmtTime(row.CreatedUtc)">{{ fmtAgo(row.CreatedUtc) }}</span>
                        </template>
                        <template #cell-actions="{ row }">
                            <button v-if="row.Mode === 'Live' && !row.Armed" class="ot-btn sm danger"
                                    :disabled="busy" @click.stop="armLive(row)">Arm</button>
                            <button v-if="row.Status === 'Running'" class="ot-btn sm ghost"
                                    :disabled="busy" @click.stop="lifecycle(row, 'pause')">Pause</button>
                            <button v-else-if="row.Mode === 'Paper'" class="ot-btn sm ghost"
                                    :disabled="busy" @click.stop="lifecycle(row, 'resume')">Resume</button>
                            <button class="ot-btn sm danger" :disabled="busy" @click.stop="lifecycle(row, 'kill')">Stop</button>
                        </template>
                    </OmniTraderDataTable>
                </OmniTraderCard>

                <OmniTraderCard title="Versions & authority" flush
                                :loading="loading" :empty="!versions.length"
                                empty-title="No versions registered"
                                empty-text="A version gives a configuration an identity that evidence and authority can attach to.">
                    <OmniTraderDataTable :rows="versions" :columns="versionColumns" label="versions"
                                         :row-key="v => v.Id" default-sort="CreatedUtc"
                                         search-placeholder="Filter versions…">
                        <template #cell-StrategyClass="{ row }">
                            <span class="cellstack">
                                <span>{{ prettyName(row.StrategyClass) }}</span>
                                <span class="sub">{{ row.Notes || 'no notes' }}</span>
                            </span>
                        </template>
                        <template #cell-Version="{ row }">v{{ row.Version }}</template>
                        <template #cell-Status="{ row }">
                            <span class="ot-chip" :class="row.Status === 'promoted' ? 'ok' : ''">{{ row.Status }}</span>
                        </template>
                        <template #cell-Authority="{ row }">
                            <span class="ot-chip" :class="authorityTone(row.Authority)">{{ row.Authority }}</span>
                        </template>
                        <template #cell-ApprovedBy="{ row }">
                            <span class="cellstack">
                                <span>{{ row.ApprovedBy ?? '—' }}</span>
                                <span v-if="row.ApprovedUtc" class="sub">{{ fmtAgo(row.ApprovedUtc) }}</span>
                            </span>
                        </template>
                        <template #cell-actions="{ row }">
                            <button class="ot-btn sm ghost" :disabled="busy" @click="openPromotion(row)">Promote…</button>
                        </template>
                    </OmniTraderDataTable>
                    <template #footer>
                        Promotion requires one rung at a time, a completed experiment, and for demo and
                        above at least 30 trades, positive Sharpe and drawdown under 50%.
                    </template>
                </OmniTraderCard>
            </div>

            <div class="ot-stack">
                <OmniTraderCard title="Deploy" subtitle="Start a strategy instance">
                    <div class="ot-field" style="margin-bottom:12px">
                        <label for="dp-strategy">Strategy</label>
                        <select id="dp-strategy" class="ot-select" v-model="deployForm.strategyClass">
                            <option value="">Choose…</option>
                            <option v-for="s in strategies" :key="s.ClassName" :value="s.ClassName">{{ s.Name }}</option>
                        </select>
                        <span v-if="selectedStrategy" class="help">{{ selectedStrategy.Description }}</span>
                    </div>

                    <div class="ot-formgrid" style="margin-bottom:12px">
                        <div class="ot-field">
                            <label for="dp-mode">Mode</label>
                            <select id="dp-mode" class="ot-select" v-model="deployForm.mode">
                                <option value="Paper">Paper</option>
                                <option value="Live">Live</option>
                            </select>
                        </div>
                        <div class="ot-field">
                            <label for="dp-symbol">Symbol</label>
                            <input id="dp-symbol" class="ot-input mono" v-model="deployForm.symbol" />
                        </div>
                        <div class="ot-field">
                            <label for="dp-interval">Interval</label>
                            <select id="dp-interval" class="ot-select" v-model="deployForm.interval">
                                <option v-for="i in INTERVALS" :key="i.value" :value="i.value">{{ i.label }}</option>
                            </select>
                        </div>
                        <div class="ot-field">
                            <label for="dp-capital">Capital</label>
                            <input id="dp-capital" class="ot-input mono" type="number" v-model.number="deployForm.initialQuote" />
                        </div>
                        <div class="ot-field">
                            <label for="dp-leverage">Leverage</label>
                            <input id="dp-leverage" class="ot-input mono" type="number" min="1" max="10"
                                   v-model.number="deployForm.leverage" />
                        </div>
                    </div>

                    <div v-if="deployForm.mode === 'Live'" class="ot-banner warn" style="margin-bottom:12px">
                        <span class="glyph" aria-hidden="true">⚠</span>
                        <div>
                            Live deployments start <b>disarmed</b> and route through <b>Kraken spot only</b> —
                            the strategy engine has no IG or Trading 212 router yet. Use the Execution ticket
                            for those venues.
                        </div>
                    </div>

                    <details v-if="paramGroups.length" style="margin-bottom:12px">
                        <summary class="summary">Strategy parameters ({{ paramCount }})</summary>
                        <div v-for="group in paramGroups" :key="group.name" style="margin-top:12px">
                            <h4 class="ot-sectionhead">{{ group.name }}</h4>
                            <div class="ot-formgrid">
                                <div v-for="p in group.params" :key="p.Name" class="ot-field">
                                    <label :for="`param-${p.Name}`" :title="p.Help ?? ''">{{ p.Label }}</label>
                                    <select v-if="p.Options?.length" :id="`param-${p.Name}`" class="ot-select"
                                            v-model="deployParams[p.Name]">
                                        <option v-for="o in p.Options" :key="o" :value="o">{{ o }}</option>
                                    </select>
                                    <label v-else-if="p.Type === 'bool'" class="ot-check">
                                        <input :id="`param-${p.Name}`" type="checkbox" v-model="deployParams[p.Name]" />
                                        enabled
                                    </label>
                                    <input v-else :id="`param-${p.Name}`" class="ot-input mono"
                                           :type="p.Type === 'string' ? 'text' : 'number'"
                                           :step="p.Step ?? 'any'" :min="p.Min ?? undefined" :max="p.Max ?? undefined"
                                           v-model="deployParams[p.Name]" />
                                    <span v-if="p.Help" class="help">{{ p.Help }}</span>
                                </div>
                            </div>
                        </div>
                    </details>

                    <button class="ot-btn primary block" :disabled="busy || !deployForm.strategyClass" @click="deploy">
                        {{ busy ? 'Deploying…' : `Deploy to ${deployForm.mode}` }}
                    </button>
                </OmniTraderCard>

                <OmniTraderCard title="Register a version" subtitle="Give a configuration an identity">
                    <p class="note">
                        A version is an immutable configuration. Evidence and authority attach to it, which
                        is what makes a promotion mean something.
                    </p>
                    <div class="ot-field" style="margin-bottom:12px">
                        <label for="vf-strategy">Strategy</label>
                        <select id="vf-strategy" class="ot-select" v-model="versionForm.strategyClass">
                            <option value="">Choose…</option>
                            <option v-for="s in strategies" :key="s.ClassName" :value="s.ClassName">{{ s.Name }}</option>
                        </select>
                    </div>
                    <div class="ot-field" style="margin-bottom:12px">
                        <label for="vf-notes">Notes</label>
                        <input id="vf-notes" class="ot-input" v-model="versionForm.notes" placeholder="what changed" />
                    </div>
                    <button class="ot-btn block" :disabled="busy || !versionForm.strategyClass" @click="createVersion">
                        Register version
                    </button>
                    <template #footer>Uses the parameters currently set in the Deploy panel.</template>
                </OmniTraderCard>
            </div>
        </div>

        <!-- Deployment detail -->
        <OmniTraderDrawer :open="!!selected" @close="selected = null"
                          :title="selected ? prettyName(selected.StrategyClass) : ''"
                          :subtitle="selected ? `${selected.Symbol} · ${selected.Interval} · ${selected.Mode}` : ''">
            <template v-if="selected">
                <div v-if="selected.Mode === 'Live' && selected.Armed" class="ot-banner">
                    <span class="glyph" aria-hidden="true">⛔</span>
                    <div>
                        <strong>Armed for live trading</strong>
                        This deployment can place real orders on Kraken right now.
                    </div>
                </div>

                <OmniTraderLineChart v-if="equitySeries[0]?.points.length > 1" :series="equitySeries" :height="200"
                                     :format="v => fmtNum(v, 2)" />

                <h4 class="ot-sectionhead" style="margin-top:16px">Deployment</h4>
                <dl class="ot-kv">
                    <dt>Status</dt><dd>{{ selected.Status }}</dd>
                    <dt>Equity</dt><dd>{{ fmtNum(selected.EquityCurrent, 2) }}</dd>
                    <dt>P&L</dt>
                    <dd :class="selected.PnLPercent >= 0 ? 'pos' : 'neg'">{{ fmtSignedPct(selected.PnLPercent) }}</dd>
                    <dt>Created</dt><dd>{{ fmtTime(selected.CreatedUtc) }}</dd>
                    <dt>Id</dt><dd>{{ selected.Id }}</dd>
                    <dt v-if="selected.Error">Error</dt>
                    <dd v-if="selected.Error" class="neg">{{ selected.Error }}</dd>
                </dl>

                <div v-if="detail?.Orders?.length" style="margin-top:20px">
                    <h4 class="ot-sectionhead">Recent orders</h4>
                    <div class="ot-tablewrap">
                        <table class="ot-table">
                            <thead><tr><th>Side</th><th class="num">Qty</th><th class="num">Price</th><th class="num">When</th></tr></thead>
                            <tbody>
                                <tr v-for="(o, index) in detail.Orders.slice(0, 20)" :key="index">
                                    <td><strong :class="o.Side === 'Buy' ? 'pos' : 'neg'">{{ o.Side }}</strong></td>
                                    <td class="num">{{ fmtNum(o.Quantity) }}</td>
                                    <td class="num">{{ fmtNum(o.Price, 6) }}</td>
                                    <td class="num">{{ fmtAgo(o.Timestamp ?? o.CreatedUtc) }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </template>

            <template #footer>
                <button class="ot-btn ghost" @click="selected = null">Close</button>
                <button v-if="selected?.Status === 'Running'" class="ot-btn ghost" :disabled="busy"
                        @click="lifecycle(selected, 'pause')">Pause</button>
                <button v-if="selected" class="ot-btn danger" :disabled="busy" @click="lifecycle(selected, 'kill')">
                    Stop deployment
                </button>
            </template>
        </OmniTraderDrawer>

        <!-- promotion gate -->
        <div v-if="promotion" class="ot-modal-backdrop" @click.self="promotion = null">
            <div class="ot-modal" role="dialog" aria-modal="true" aria-label="Promote strategy version">
                <header>
                    <h3>Promote {{ prettyName(promotion.version.StrategyClass) }} v{{ promotion.version.Version }}</h3>
                    <button class="ot-btn ghost sm" @click="promotion = null">Close ✕</button>
                </header>
                <div class="body">
                    <div class="ot-field" style="margin-bottom:16px;max-width:340px">
                        <label for="promo-authority">Requested authority</label>
                        <select id="promo-authority" class="ot-select" v-model="promotion.requested" @change="assessPromotion">
                            <option value="Paper">Paper</option>
                            <option value="Demo">Demo (broker simulation)</option>
                            <option value="ApprovalRequired">Live — approval required</option>
                            <option value="Automated">Live — fully automated</option>
                        </select>
                        <span class="help">Currently {{ promotion.version.Authority }}.</span>
                    </div>

                    <template v-if="promotion.assessment">
                        <div class="ot-banner" :class="promotion.assessment.Eligible ? 'ok' : 'warn'">
                            <span class="glyph" aria-hidden="true">{{ promotion.assessment.Eligible ? '✓' : '⚠' }}</span>
                            <div>
                                <strong>{{ promotion.assessment.Eligible ? 'Requirements met' : 'Not eligible yet' }}</strong>
                                {{ promotion.assessment.Summary }}
                            </div>
                        </div>
                        <div class="ot-rules">
                            <div v-for="(r, index) in promotion.assessment.Requirements" :key="index"
                                 class="ot-rule" :class="r.Met ? 'pass' : 'hard'">
                                <span class="icon" aria-hidden="true">{{ r.Met ? '✓' : '✕' }}</span>
                                <span class="name">{{ r.Name }}</span>
                                <span class="detail">{{ r.Detail }}</span>
                                <span class="measure"></span>
                            </div>
                        </div>
                    </template>
                </div>
                <footer>
                    <button class="ot-btn ghost" @click="promotion = null">Cancel</button>
                    <button class="ot-btn primary" :disabled="busy || !promotion.assessment?.Eligible" @click="doPromote">
                        Promote to {{ promotion.requested }}
                    </button>
                </footer>
            </div>
        </div>
    </OmniTraderShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import Swal from 'sweetalert2';
import {
    useOmniTrader, fmtNum, fmtSignedPct, fmtAgo, fmtTime, seriesColour, SWAL_THEME,
} from '~/composables/useOmniTrader';
import type { TableColumn } from '~/components/OmniTrader/DataTable.vue';

definePageMeta({ layout: 'navbar' });

const { get, post, engineGet, enginePost, refreshOverview } = useOmniTrader();

const INTERVALS = [
    { value: 'FiveMinute', label: '5m' }, { value: 'FifteenMinute', label: '15m' },
    { value: 'OneHour', label: '1h' }, { value: 'FourHour', label: '4h' }, { value: 'OneDay', label: '1d' },
];

const strategies = ref<any[]>([]);
const deployments = ref<any[]>([]);
const versions = ref<any[]>([]);
const loading = ref(false);
const busy = ref(false);
const promotion = ref<any>(null);
const selected = ref<any>(null);
const detail = ref<any>(null);
const equity = ref<any[]>([]);

const deployForm = reactive({
    strategyClass: '', mode: 'Paper', symbol: 'BTCUSDT', interval: 'OneHour',
    initialQuote: 10000, leverage: 1,
});
const deployParams = reactive<Record<string, any>>({});
const versionForm = reactive({ strategyClass: '', notes: '' });

const deploymentColumns: TableColumn[] = [
    { key: 'StrategyClass', label: 'Strategy', width: '210px' },
    { key: 'Mode', label: 'Mode', width: '120px' },
    { key: 'Status', label: 'Status', width: '130px' },
    { key: 'EquityCurrent', label: 'Equity', num: true },
    { key: 'PnLPercent', label: 'P&L', num: true },
    { key: 'CreatedUtc', label: 'Age', num: true, width: '100px' },
    { key: 'actions', label: '', sortable: false, num: true, width: '190px' },
];

const versionColumns: TableColumn[] = [
    { key: 'StrategyClass', label: 'Strategy', width: '220px' },
    { key: 'Version', label: 'Version', num: true, width: '90px', sortValue: v => v.Version },
    { key: 'Status', label: 'Status', width: '110px' },
    { key: 'Authority', label: 'Authority', width: '150px' },
    { key: 'ApprovedBy', label: 'Approved', width: '140px' },
    { key: 'actions', label: '', sortable: false, num: true, width: '110px' },
];

const selectedStrategy = computed(() => strategies.value.find(s => s.ClassName === deployForm.strategyClass));
const runningCount = computed(() => deployments.value.filter(d => d.Status === 'Running').length);
const armedCount = computed(() => deployments.value.filter(d => d.Mode === 'Live' && d.Armed).length);
const liveAuthorityCount = computed(() =>
    versions.value.filter(v => v.Authority === 'ApprovalRequired' || v.Authority === 'Automated').length);

const paramGroups = computed(() => {
    const params = selectedStrategy.value?.Parameters ?? [];
    const groups: Record<string, any[]> = {};
    for (const p of params) (groups[p.Group] ||= []).push(p);
    return Object.entries(groups).map(([name, list]) => ({ name, params: list }));
});
const paramCount = computed(() => selectedStrategy.value?.Parameters?.length ?? 0);

const equitySeries = computed(() => [{
    name: 'Deployment equity',
    colour: seriesColour(0),
    fill: 'rgba(57, 135, 229, 0.12)',
    points: equity.value.map((e: any) => ({
        x: new Date(e.Ts ?? e.Timestamp).getTime(),
        y: e.Equity ?? e.Value ?? 0,
    })),
}]);

watch(selectedStrategy, meta => {
    for (const key of Object.keys(deployParams)) delete deployParams[key];
    for (const p of (meta?.Parameters ?? [])) deployParams[p.Name] = p.Default;
});

function prettyName(className: string) {
    return strategies.value.find(s => s.ClassName === className)?.Name ?? className;
}
function statusTone(status: string) {
    return ({ Running: 'ok', Paused: 'warn', Errored: 'bad', Stopped: '' } as Record<string, string>)[status] ?? '';
}
function authorityTone(authority: string) {
    return ({ Automated: 'bad', ApprovalRequired: 'warn', Demo: 'info', Paper: '', Observe: '' } as Record<string, string>)[authority] ?? '';
}

async function loadAll() {
    loading.value = true;
    try {
        const [s, d, v] = await Promise.all([
            engineGet<any[]>('/strategies'),
            engineGet<any[]>('/deployments'),
            get<any[]>('/strategy-versions'),
        ]);
        strategies.value = s;
        deployments.value = d;
        versions.value = v;
    } catch (e: any) {
        Swal.fire({ title: 'Load failed', text: e?.message, icon: 'error', ...SWAL_THEME });
    } finally { loading.value = false; }
}

async function openDeployment(row: any) {
    selected.value = row;
    detail.value = null;
    equity.value = [];
    try {
        const [d, e] = await Promise.all([
            engineGet<any>('/deployment', { id: row.Id }),
            engineGet<any[]>('/deployment/equity', { id: row.Id }),
        ]);
        detail.value = d;
        equity.value = e ?? [];
    } catch { /* the drawer still shows what the table already knew */ }
}

async function deploy() {
    if (deployForm.mode === 'Live') {
        const confirmed = await Swal.fire({
            title: 'Deploy to LIVE?',
            text: 'It starts disarmed — no orders reach Kraken until you arm it.',
            icon: 'warning', showCancelButton: true, ...SWAL_THEME, confirmButtonColor: '#ff6b6b',
        });
        if (!confirmed.isConfirmed) return;
    }

    busy.value = true;
    try {
        await enginePost('/deployment/create', undefined, {
            StrategyClass: deployForm.strategyClass,
            Symbol: deployForm.symbol,
            Interval: deployForm.interval,
            Mode: deployForm.mode,
            InitialQuoteBalance: deployForm.initialQuote,
            Leverage: deployForm.leverage,
            Parameters: { ...deployParams },
        });
        await loadAll();
        await refreshOverview();
    } catch (e: any) {
        Swal.fire({ title: 'Deploy failed', text: e?.message, icon: 'error', ...SWAL_THEME });
    } finally { busy.value = false; }
}

async function armLive(d: any) {
    const outcome = await Swal.fire({
        title: 'Arm live trading?',
        html: `This lets <b>${prettyName(d.StrategyClass)}</b> place real orders on Kraken.<br>
               Type the deployment id to confirm.`,
        input: 'text', inputPlaceholder: d.Id,
        icon: 'warning', showCancelButton: true, ...SWAL_THEME, confirmButtonColor: '#ff6b6b',
    });
    if (!outcome.isConfirmed) return;

    busy.value = true;
    try {
        await enginePost('/deployment/arm-live', { id: d.Id, confirm: outcome.value ?? '' });
        await loadAll();
    } catch (e: any) {
        Swal.fire({ title: 'Arm failed', text: e?.message, icon: 'error', ...SWAL_THEME });
    } finally { busy.value = false; }
}

async function lifecycle(d: any, action: 'pause' | 'resume' | 'kill') {
    if (action === 'kill') {
        const confirmed = await Swal.fire({
            title: 'Stop deployment?', text: 'Live deployments are flattened and disarmed.',
            icon: 'warning', showCancelButton: true, ...SWAL_THEME,
        });
        if (!confirmed.isConfirmed) return;
    }
    busy.value = true;
    try {
        await enginePost(`/deployment/${action}`, { id: d.Id });
        if (action === 'kill') selected.value = null;
        await loadAll();
        await refreshOverview();
    } catch (e: any) {
        Swal.fire({ title: 'Action failed', text: e?.message, icon: 'error', ...SWAL_THEME });
    } finally { busy.value = false; }
}

async function createVersion() {
    busy.value = true;
    try {
        await post('/strategy-version/create', undefined, {
            StrategyClass: versionForm.strategyClass,
            Notes: versionForm.notes,
            Parameters: { ...deployParams },
        });
        versionForm.notes = '';
        await loadAll();
    } catch (e: any) {
        Swal.fire({ title: 'Failed', text: e?.message, icon: 'error', ...SWAL_THEME });
    } finally { busy.value = false; }
}

function openPromotion(version: any) {
    promotion.value = { version, requested: nextAuthority(version.Authority), assessment: null };
    void assessPromotion();
}

function nextAuthority(current: string) {
    const ladder = ['Observe', 'Paper', 'Demo', 'ApprovalRequired', 'Automated'];
    const index = ladder.indexOf(current);
    return ladder[Math.min(ladder.length - 1, index + 1)];
}

async function assessPromotion() {
    if (!promotion.value) return;
    promotion.value.assessment = await get('/promotion/assess', {
        strategy: promotion.value.version.StrategyClass,
        version: promotion.value.version.Version,
        authority: promotion.value.requested,
    });
}

async function doPromote() {
    busy.value = true;
    try {
        const outcome = await post<any>('/promotion/promote', {
            strategy: promotion.value.version.StrategyClass,
            version: promotion.value.version.Version,
            authority: promotion.value.requested,
        });
        if (!outcome.Promoted) {
            promotion.value.assessment = outcome;
            Swal.fire({ title: 'Promotion refused', text: outcome.Summary, icon: 'warning', ...SWAL_THEME });
            return;
        }
        promotion.value = null;
        await loadAll();
    } finally { busy.value = false; }
}

onMounted(loadAll);
</script>

<style scoped>
.note { margin: 0 0 var(--ot-space-3); font-size: 12.5px; color: var(--ot-text-2); line-height: 1.5; }
.summary { cursor: pointer; font-size: 12.5px; color: var(--ot-text-2); }
</style>
