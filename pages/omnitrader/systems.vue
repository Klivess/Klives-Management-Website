<template>
    <OmniTraderShell>
        <div class="ot-pagehead">
            <div class="ot-actions">
                <button class="ot-btn ghost" :disabled="busy" @click="reconnect">Reconnect venues</button>
                <button class="ot-btn ghost" :disabled="busy" @click="refreshInstruments">Refresh instruments</button>
                <button class="ot-btn" :disabled="loading" @click="loadAll">Refresh</button>
            </div>
        </div>

        <div class="ot-banner" :class="health?.TradingPermitted ? 'ok' : ''" role="status">
            <span class="glyph" aria-hidden="true">{{ health?.TradingPermitted ? '✓' : '⛔' }}</span>
            <div>
                <strong>{{ health?.TradingPermitted ? 'Trading permitted' : 'Trading blocked' }}</strong>
                {{ health?.Summary }}
            </div>
        </div>

        <div class="ot-kpis">
            <OmniTraderKpi label="Venues" :value="String(venues.length)" :loading="loading && !venues.length"
                           :foot="`${healthyVenues} with a healthy order path`"
                           :tone="healthyVenues < venues.length ? 'warn' : ''" />
            <OmniTraderKpi label="Channels down" :tone="downChannels ? 'bad' : 'good'" :value="String(downChannels)"
                           :loading="loading && !venues.length"
                           :foot="`of ${totalChannels} reported · ${unsupportedChannels} unsupported by the venue`" />
            <OmniTraderKpi label="Stale feeds" :tone="staleFeeds ? 'warn' : ''" :value="String(staleFeeds)"
                           :loading="loading" :foot="`of ${freshness.length} tracked instruments`" />
            <OmniTraderKpi label="Open alerts" :tone="openAlerts.length ? 'bad' : 'good'"
                           :value="String(openAlerts.length)" :loading="loading"
                           :foot="`${criticalAlerts} critical`" />
            <OmniTraderKpi label="Instruments" tone="info" :value="String(service?.Instruments ?? 0)"
                           :loading="loading" foot="canonical records" />
            <OmniTraderKpi label="Uptime" small :value="shortUptime" :loading="loading"
                           :foot="service?.Name ?? 'OmniTrader'" />
        </div>

        <!-- Health areas: each says what it measured, not just whether it is happy. -->
        <div class="ot-grid three" style="margin-bottom:16px">
            <OmniTraderCard v-for="area in health?.Areas ?? []" :key="area.Area" :title="area.Area"
                            :attention="!area.Healthy">
                <template #controls>
                    <span class="ot-chip" :class="area.Healthy ? 'ok' : 'bad'">
                        <span class="glyph" aria-hidden="true">{{ area.Healthy ? '✓' : '✕' }}</span>
                        {{ area.Healthy ? 'healthy' : 'degraded' }}
                    </span>
                </template>
                <p class="detail">{{ area.Detail }}</p>
                <div class="signals">
                    <div v-for="signal in area.Signals" :key="signal.Name" class="signal">
                        <span class="ot-dot" :class="signal.Ok ? 'ok' : 'bad'" aria-hidden="true"></span>
                        <span class="name" :title="signal.Detail ?? ''">{{ signal.Name }}</span>
                        <span class="value mono">{{ signal.Value }}</span>
                    </div>
                    <p v-if="!area.Signals.length" class="detail">No signals reported.</p>
                </div>
            </OmniTraderCard>
        </div>

        <div class="ot-grid two">
            <OmniTraderCard title="Venue channels" flush
                            :loading="loading" :empty="!channelRows.length"
                            empty-title="No venue channels" empty-text="No venue is registered yet.">
                <OmniTraderDataTable :rows="channelRows" :columns="channelColumns" label="channels"
                                     :row-key="c => c.key" :row-class="c => c.Connected ? '' : 'attention'"
                                     search-placeholder="Filter channels…">
                    <template #cell-Venue="{ row }">
                        <span class="cellstack">
                            <span>{{ row.Venue }}</span>
                            <span class="sub"><span class="ot-chip" :class="envClass(row.Environment)">{{ row.Environment }}</span></span>
                        </span>
                    </template>
                    <template #cell-Channel="{ row }"><span class="mono">{{ row.Channel }}</span></template>
                    <template #cell-Connected="{ row }">
                        <span class="ot-chip" :class="channelTone(row.State)">
                            <span class="glyph" aria-hidden="true">{{ channelGlyph(row.State) }}</span>
                            {{ channelLabel(row.State) }}
                        </span>
                    </template>
                    <template #cell-LastOkUtc="{ row }">
                        <span v-if="row.State === 'Unsupported'" class="muted">n/a</span>
                        <span v-else-if="row.State === 'Unknown'" class="muted">not yet used</span>
                        <span v-else :title="fmtTime(row.LastOkUtc)">{{ fmtAgo(row.LastOkUtc) }}</span>
                    </template>
                    <template #cell-Detail="{ row }">
                        <span class="cellstack">
                            <span v-if="row.LastError" style="color:var(--ot-negative)">{{ row.LastError }}</span>
                            <span v-else-if="row.QuotaRemaining !== null && row.QuotaRemaining !== undefined" class="sub">
                                quota {{ (row.QuotaRemaining * 100).toFixed(0) }}% remaining
                            </span>
                            <span v-else class="sub">—</span>
                            <span v-if="row.ConsecutiveFailures" class="sub">
                                {{ row.ConsecutiveFailures }} consecutive failure(s)
                            </span>
                        </span>
                    </template>
                </OmniTraderDataTable>
            </OmniTraderCard>

            <OmniTraderCard title="Alerts" flush
                            :loading="loading" :empty="!alerts.length"
                            :empty-kind="showAll ? 'empty' : 'ok'"
                            empty-title="Nothing raised" empty-text="No alert matches this filter.">
                <template #controls>
                    <div class="ot-segment sm" role="group" aria-label="Alert filter">
                        <button type="button" :aria-pressed="!showAll" @click="showAll = false; loadAlerts()">Open</button>
                        <button type="button" :aria-pressed="showAll" @click="showAll = true; loadAlerts()">All</button>
                    </div>
                </template>
                <OmniTraderDataTable :rows="alerts" :columns="alertColumns" label="alerts"
                                     :row-key="a => a.Id" max-height="460px" default-sort="RaisedUtc"
                                     :row-class="a => a.NeedsAcknowledgement ? 'attention' : ''"
                                     search-placeholder="Filter alerts…">
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
                            <span v-if="row.RecoveryHint" class="sub" style="color:var(--ot-info)">→ {{ row.RecoveryHint }}</span>
                        </span>
                    </template>
                    <template #cell-RaisedUtc="{ row }">
                        <span class="cellstack">
                            <span :title="fmtTime(row.RaisedUtc)">{{ fmtAgo(row.RaisedUtc) }}</span>
                            <span v-if="row.OccurrenceCount > 1" class="sub">×{{ row.OccurrenceCount }}</span>
                        </span>
                    </template>
                    <template #cell-actions="{ row }">
                        <button v-if="row.NeedsAcknowledgement" class="ot-btn sm warn"
                                :disabled="busy" @click="acknowledge(row)">Ack</button>
                        <button v-if="row.Open" class="ot-btn sm ghost" :disabled="busy" @click="resolve(row)">Resolve</button>
                        <span v-else class="ot-chip ok">resolved</span>
                    </template>
                </OmniTraderDataTable>
                <template #footer>
                    Alerts deduplicate on the condition, not the occurrence — a flapping feed is one alert
                    with a rising count. Acknowledging says you have seen it; resolving says it is fixed.
                </template>
            </OmniTraderCard>
        </div>

        <div class="ot-grid two" style="margin-top:16px">
            <OmniTraderCard title="Data freshness" flush
                            :loading="loading" :empty="!freshness.length"
                            empty-title="No feeds observed yet"
                            empty-text="Freshness fills in as instruments are evaluated or marked.">
                <OmniTraderDataTable :rows="freshness" :columns="freshnessColumns" label="feeds"
                                     :row-key="f => f.InstrumentId" max-height="360px"
                                     :row-class="f => f.Stale ? 'attention' : ''"
                                     search-placeholder="Filter instruments…">
                    <template #cell-InstrumentId="{ row }"><span class="mono">{{ row.InstrumentId }}</span></template>
                    <template #cell-Age="{ row }">{{ formatAge(row.Age) }}</template>
                    <template #cell-Stale="{ row }">
                        <span class="cellstack">
                            <span class="ot-chip" :class="row.Stale ? 'warn' : 'ok'">{{ row.Stale ? 'stale' : 'fresh' }}</span>
                            <span v-if="row.Issue" class="sub">{{ row.Issue }}</span>
                        </span>
                    </template>
                </OmniTraderDataTable>
                <template #footer>A stale instrument blocks automated actions on itself, not on the whole firm.</template>
            </OmniTraderCard>

            <OmniTraderCard title="Audit trail" flush
                            :loading="loading" :empty="!audit.length"
                            empty-title="No audit events"
                            empty-text="Configuration, authority and emergency actions are recorded here.">
                <OmniTraderDataTable :rows="audit" :columns="auditColumns" label="events"
                                     :row-key="e => `${e.Ts}:${e.Action}:${e.Actor}`" max-height="360px"
                                     default-sort="Ts" search-placeholder="Filter audit…">
                    <template #cell-Ts="{ row }">
                        <span :title="fmtTime(row.Ts)">{{ fmtAgo(row.Ts) }}</span>
                    </template>
                    <template #cell-Action="{ row }"><span class="mono">{{ row.Action }}</span></template>
                    <template #cell-Detail="{ row }">{{ row.Detail ?? row.Scope }}</template>
                </OmniTraderDataTable>
                <template #footer>Append-only.</template>
            </OmniTraderCard>
        </div>

        <!-- Every venue this build can talk to, configured or not. An unconfigured venue has to be
             visible as unconfigured — leaving it out is how you end up wondering whether the
             platform even supports it. -->
        <OmniTraderCard title="Venue connections"
                        flush style="margin-top:16px" :loading="loading" :empty="!connections.length"
                        empty-title="No venues compiled in">
            <OmniTraderDataTable :rows="connections" :columns="connectionColumns" label="venues"
                                 :row-key="c => `${c.Venue}:${c.Environment}`"
                                 :row-class="c => c.Registered && !c.OrderPathHealthy ? 'attention' : ''">
                <template #cell-DisplayName="{ row }">
                    <span class="cellstack">
                        <span>{{ row.DisplayName }}</span>
                        <span class="sub">{{ row.AssetClasses?.join(', ') }} · {{ row.Exposure === 'Derivative' ? 'leveraged notional' : 'owned assets' }}</span>
                    </span>
                </template>
                <template #cell-Environment="{ row }">
                    <span class="cellstack">
                        <span class="ot-chip" :class="envClass(row.Environment)">{{ row.Environment }}</span>
                        <span class="sub">{{ row.RealMoney ? 'real money' : 'simulated' }}</span>
                    </span>
                </template>
                <template #cell-Configured="{ row }">
                    <span class="ot-chip" :class="row.Configured ? 'ok' : row.Registered ? 'warn' : ''">
                        <span class="glyph" aria-hidden="true">{{ row.Configured ? '✓' : row.Registered ? '!' : '○' }}</span>
                        {{ row.Configured ? 'connected' : row.Registered ? 'credentials rejected' : 'not configured' }}
                    </span>
                </template>
                <template #cell-OrderPathHealthy="{ row }">
                    <span v-if="!row.Registered" class="muted">—</span>
                    <span v-else class="ot-chip" :class="row.OrderPathHealthy ? 'ok' : 'bad'">
                        {{ row.OrderPathHealthy ? 'order path up' : 'order path down' }}
                    </span>
                </template>
                <template #cell-SettingKeys="{ row }">
                    <span v-if="!row.SharedKeys?.length && !row.EnvironmentKeys?.length" class="muted">
                        no credentials needed
                    </span>
                    <span v-else class="cellstack keys">
                        <span v-for="key in row.SharedKeys" :key="key">
                            <code class="mono">{{ key }}</code>
                            <span v-if="row.CredentialSource === key" class="ot-chip ok">in use</span>
                        </span>
                        <span v-for="key in row.EnvironmentKeys" :key="key">
                            <code class="mono">{{ key }}</code>
                            <span v-if="row.CredentialSource === key" class="ot-chip ok">in use</span>
                            <span v-else class="sub">optional override</span>
                        </span>
                        <span class="sub guidance">{{ row.Guidance }}</span>
                    </span>
                </template>
            </OmniTraderDataTable>
            <template #footer>
                Credentials live in Omni settings and are never returned by the API. A setting marked
                <b>optional override</b> is only needed when that environment's credential genuinely
                differs — IG issues one API key per account, while a Trading 212 key only works in the
                environment it was generated in.
            </template>
        </OmniTraderCard>

        <OmniTraderCard title="Service" style="margin-top:16px">
            <dl class="ot-kv">
                <dt>Database</dt><dd>{{ service?.DbPath ?? '—' }}</dd>
                <dt>Uptime</dt><dd>{{ service?.Uptime ?? '—' }}</dd>
                <dt>Strategies</dt><dd>{{ service?.Strategies ?? 0 }} discovered</dd>
                <dt>Instruments</dt><dd>{{ service?.Instruments ?? 0 }} canonical records</dd>
            </dl>
        </OmniTraderCard>
    </OmniTraderShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Swal from 'sweetalert2';
import {
    useOmniTrader, fmtAgo, fmtTime, envClass, severityTone, severityGlyph, SWAL_THEME, type AlertRow,
} from '~/composables/useOmniTrader';
import type { TableColumn } from '~/components/OmniTrader/DataTable.vue';

definePageMeta({ layout: 'navbar' });

const { get, post, refreshOverview } = useOmniTrader();

const health = ref<any>(null);
const venues = ref<any[]>([]);
const freshness = ref<any[]>([]);
const audit = ref<any[]>([]);
const service = ref<any>(null);
const connections = ref<any[]>([]);
const alerts = ref<AlertRow[]>([]);
const showAll = ref(false);
const loading = ref(false);
const busy = ref(false);

const channelColumns: TableColumn[] = [
    { key: 'Venue', label: 'Venue', width: '140px' },
    { key: 'Channel', label: 'Channel', width: '150px' },
    { key: 'Connected', label: 'State', width: '90px' },
    { key: 'LastOkUtc', label: 'Last OK', num: true, width: '110px' },
    { key: 'Detail', label: 'Detail', sortable: false },
];

const alertColumns: TableColumn[] = [
    { key: 'Severity', label: 'Severity', width: '120px' },
    { key: 'Title', label: 'Alert', searchValue: a => `${a.Title} ${a.Message}` },
    { key: 'RaisedUtc', label: 'Raised', num: true, width: '110px' },
    { key: 'actions', label: '', num: true, sortable: false, width: '140px' },
];

const freshnessColumns: TableColumn[] = [
    { key: 'InstrumentId', label: 'Instrument' },
    { key: 'Age', label: 'Age', num: true, width: '90px', sortValue: f => (typeof f.Age === 'number' ? f.Age : 0) },
    { key: 'Source', label: 'Source', width: '150px' },
    { key: 'Stale', label: 'State', width: '150px', sortValue: f => (f.Stale ? 1 : 0) },
];

const connectionColumns: TableColumn[] = [
    { key: 'DisplayName', label: 'Venue', width: '230px' },
    { key: 'Environment', label: 'Environment', width: '140px' },
    { key: 'Configured', label: 'Credentials', width: '190px' },
    { key: 'OrderPathHealthy', label: 'Order path', width: '150px' },
    { key: 'SettingKeys', label: 'Omni settings', sortable: false,
      searchValue: c => `${(c.SharedKeys ?? []).join(' ')} ${(c.EnvironmentKeys ?? []).join(' ')}` },
];

const auditColumns: TableColumn[] = [
    { key: 'Ts', label: 'When', num: true, width: '110px' },
    { key: 'Actor', label: 'Actor', width: '120px' },
    { key: 'Action', label: 'Action', width: '190px' },
    { key: 'Detail', label: 'Detail', sortable: false },
];

// Channels are flattened so one table answers "what is down", rather than making
// the operator scan a nested list per venue.
const channelRows = computed(() =>
    venues.value.flatMap(v => (v.Channels ?? []).map((c: any) => ({
        ...c,
        Venue: v.Venue,
        Environment: v.Environment,
        key: `${v.Venue}:${v.Environment}:${c.Channel}`,
    }))));

const healthyVenues = computed(() => venues.value.filter(v => v.OrderPathHealthy).length);
const totalChannels = computed(() => channelRows.value.length);
// A channel nobody has called is not down, and a feature the platform never built is not an
// outage. Counting either produced a permanent red number no action could clear.
const downChannels = computed(() => channelRows.value.filter(c => c.State === 'Down').length);
const unsupportedChannels = computed(() => channelRows.value.filter(c => c.State === 'Unsupported').length);
const staleFeeds = computed(() => freshness.value.filter(f => f.Stale).length);
const openAlerts = computed(() => alerts.value.filter(a => a.Open));
const criticalAlerts = computed(() => openAlerts.value.filter(a => a.Severity === 'Critical').length);

const shortUptime = computed(() => {
    const raw: string | undefined = service.value?.Uptime;
    if (!raw) return '—';
    // The service formats a TimeSpan; keep it to days/hours/minutes for the tile.
    const match = raw.match(/^(?:(\d+)\.)?(\d+):(\d+)/);
    if (!match) return raw;
    const [, days, hours, minutes] = match;
    return days ? `${days}d ${hours}h` : `${hours}h ${minutes}m`;
});

function channelTone(state: string) {
    return ({ Up: 'ok', Down: 'bad', Unknown: '', Unsupported: 'info' } as Record<string, string>)[state] ?? '';
}
function channelGlyph(state: string) {
    return ({ Up: '✓', Down: '✕', Unknown: '○', Unsupported: '–' } as Record<string, string>)[state] ?? '○';
}
function channelLabel(state: string) {
    return ({ Up: 'up', Down: 'down', Unknown: 'not yet used', Unsupported: 'not offered' } as Record<string, string>)[state] ?? state;
}

function formatAge(age: string | number) {
    if (typeof age === 'number') return `${age.toFixed(1)}m`;
    // .NET serialises TimeSpan.MaxValue for "never observed".
    if (typeof age === 'string' && age.startsWith('10675199')) return 'never';
    return age;
}

async function loadAll() {
    loading.value = true;
    try {
        const data = await get<any>('/systems');
        health.value = data.Health;
        venues.value = data.Venues ?? [];
        freshness.value = data.DataFreshness ?? [];
        audit.value = data.Audit ?? [];
        service.value = data.Service;
        connections.value = data.Connections ?? [];
        await loadAlerts();
    } catch (e: any) {
        Swal.fire({ title: 'Load failed', text: e?.message, icon: 'error', ...SWAL_THEME });
    } finally { loading.value = false; }
}

async function loadAlerts() {
    alerts.value = await get('/alerts', { all: showAll.value ? 'true' : 'false' });
}

async function acknowledge(alert: AlertRow) {
    busy.value = true;
    try {
        await post('/alert/acknowledge', { id: alert.Id });
        await loadAlerts();
        await refreshOverview();
    } finally { busy.value = false; }
}

async function resolve(alert: AlertRow) {
    const confirmed = await Swal.fire({
        title: 'Resolve this alert?',
        text: 'Only resolve when the underlying condition is genuinely fixed — acknowledging is how you say you have seen it.',
        icon: 'question', showCancelButton: true, ...SWAL_THEME,
    });
    if (!confirmed.isConfirmed) return;

    busy.value = true;
    try {
        await post('/alert/resolve', { id: alert.Id });
        await loadAlerts();
        await refreshOverview();
    } finally { busy.value = false; }
}

async function reconnect() {
    busy.value = true;
    try {
        const outcome = await post<any>('/venues/connect');
        await loadAll();
        await refreshOverview();
        Swal.fire({
            title: outcome.Failures?.length ? 'Some venues failed' : 'Venues reconnected',
            text: outcome.Failures?.length
                ? `Failed: ${outcome.Failures.join(', ')}`
                : 'Sessions re-established and state reconciled.',
            icon: outcome.Failures?.length ? 'warning' : 'success', ...SWAL_THEME,
        });
    } catch (e: any) {
        Swal.fire({ title: 'Reconnect failed', text: e?.message, icon: 'error', ...SWAL_THEME });
    } finally { busy.value = false; }
}

async function refreshInstruments() {
    busy.value = true;
    try {
        const outcome = await post<any>('/instruments/refresh');
        await loadAll();
        Swal.fire({
            title: 'Instrument master refreshed',
            text: `${outcome.Added} new instrument(s); ${outcome.Total} total.`,
            icon: 'success', ...SWAL_THEME,
        });
    } catch (e: any) {
        Swal.fire({ title: 'Refresh failed', text: e?.message, icon: 'error', ...SWAL_THEME });
    } finally { busy.value = false; }
}

onMounted(loadAll);
</script>

<style scoped>
.detail { margin: 0 0 var(--ot-space-3); font-size: 12.5px; color: var(--ot-text-2); line-height: 1.5; }
.signals { display: flex; flex-direction: column; gap: var(--ot-space-1); max-height: 210px; overflow-y: auto; }
.signal { display: grid; grid-template-columns: 9px 1fr auto; gap: var(--ot-space-2); align-items: center; font-size: 12.5px; }
.signal .name { color: var(--ot-text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.signal .value { font-size: 11.5px; }
code { font-family: var(--ot-mono); color: var(--ot-text-2); font-size: 11.5px; }
.keys { gap: var(--ot-space-1); }
.keys .guidance { max-width: 62ch; line-height: 1.45; margin-top: var(--ot-space-1); }
</style>
