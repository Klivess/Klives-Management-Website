<template>
    <main class="botlogs-page">
        <header class="page-toolbar">
            <div class="title-block">
                <NuxtLink to="/admin" class="back-link">â† Admin</NuxtLink>
                <div class="title-row">
                    <h1>Bot logs</h1>
                    <span class="live-indicator"><i></i> Live buffer</span>
                </div>
                <p>Operational events, error concentration, and service activity in one view.</p>
            </div>

            <div class="toolbar-actions">
                <span class="updated-at">{{ refreshLabel }}</span>
                <button class="refresh-button" :disabled="loading" @click="loadData()">
                    <span :class="{ spinning: loading }">â†»</span>
                    {{ loading ? 'Refreshing' : 'Refresh' }}
                </button>
            </div>
        </header>

        <section class="metric-grid" aria-label="Log summary">
            <article class="metric-card">
                <span class="metric-label">Buffered events</span>
                <strong>{{ number(summary?.TotalLogs ?? logs.length) }}</strong>
                <small>{{ number(summary?.UniqueServiceCount ?? serviceOptions.length) }} services reporting</small>
            </article>
            <article class="metric-card metric-card--danger">
                <span class="metric-label">Errors</span>
                <strong>{{ number(summary?.ErrorCount ?? errorCount) }}</strong>
                <small>{{ number(summary?.ErrorsLastHour ?? recentErrorCount) }} in the last hour</small>
            </article>
            <article class="metric-card">
                <span class="metric-label">Error rate</span>
                <strong>{{ percent(summary?.ErrorRate ?? localErrorRate) }}</strong>
                <small>{{ number(summary?.StatusCount ?? statusCount) }} status events</small>
            </article>
            <article class="metric-card">
                <span class="metric-label">Last event</span>
                <strong class="metric-time">{{ relativeTime(summary?.LatestLogAt ?? latestLogAt) }}</strong>
                <small>{{ formatDate(summary?.LatestLogAt ?? latestLogAt) }}</small>
            </article>
        </section>

        <section class="analysis-grid">
            <article class="analysis-card activity-card">
                <div class="card-heading">
                    <div>
                        <span class="eyebrow">Activity</span>
                        <h2>Last {{ summary?.WindowHours ?? 12 }} hours</h2>
                    </div>
                    <span class="legend"><i></i> Errors</span>
                </div>

                <div v-if="timeline.length" class="activity-chart" aria-label="Hourly log activity">
                    <div v-for="bucket in timeline" :key="bucket.Start" class="chart-column" :title="bucketTitle(bucket)">
                        <div class="bar-track">
                            <span class="bar-error" :style="{ height: `${barHeight(bucket.ErrorCount)}%` }"></span>
                            <span class="bar-total" :style="{ height: `${barHeight(bucket.TotalCount)}%` }"></span>
                        </div>
                        <span>{{ bucketLabel(bucket.Start) }}</span>
                    </div>
                </div>
                <div v-else class="empty-analytics">No activity in the current log buffer.</div>
            </article>

            <article class="analysis-card service-card">
                <div class="card-heading">
                    <div>
                        <span class="eyebrow">Service load</span>
                        <h2>Most active services</h2>
                    </div>
                </div>

                <div v-if="topServices.length" class="ranked-list">
                    <button v-for="service in topServices" :key="service.ServiceName" class="service-row" @click="selectService(service.ServiceName)">
                        <span class="service-name">{{ service.ServiceName }}</span>
                        <span class="service-count" :class="{ danger: service.ErrorCount > 0 }">
                            {{ number(service.TotalCount) }}
                            <em v-if="service.ErrorCount">{{ service.ErrorCount }} err</em>
                        </span>
                    </button>
                </div>
                <div v-else class="empty-analytics">Service activity will appear here.</div>
            </article>

            <article class="analysis-card error-card">
                <div class="card-heading">
                    <div>
                        <span class="eyebrow">Error concentration</span>
                        <h2>Leading failure types</h2>
                    </div>
                    <button class="text-button" :class="{ active: selectedType === 'error' }" @click="showErrors">View errors</button>
                </div>

                <div v-if="errorFamilies.length" class="ranked-list">
                    <div v-for="error in errorFamilies" :key="error.Label" class="error-row">
                        <span class="error-label" :title="error.Label">{{ error.Label }}</span>
                        <span class="error-count">{{ number(error.Count) }}</span>
                    </div>
                </div>
                <div v-else class="empty-analytics">No errors in the current log buffer.</div>
            </article>
        </section>

        <section class="log-panel">
            <div class="log-panel-header">
                <div>
                    <span class="eyebrow">Event stream</span>
                    <h2>Recent logs</h2>
                </div>
                <span class="result-count">{{ number(filteredLogs.length) }} matching</span>
            </div>

            <div class="filter-bar">
                <label class="search-field">
                    <span>Search</span>
                    <input v-model.trim="searchTerm" type="search" placeholder="Message, service, error, or ID" />
                </label>
                <label class="select-field">
                    <span>Service</span>
                    <select v-model="selectedService">
                        <option value="">All services</option>
                        <option v-for="service in serviceOptions" :key="service" :value="service">{{ service }}</option>
                    </select>
                </label>
                <div class="type-filter" role="group" aria-label="Log type">
                    <button v-for="type in typeOptions" :key="type.value" :class="{ active: selectedType === type.value }" @click="selectedType = type.value">
                        {{ type.label }}
                    </button>
                </div>
                <button v-if="filtersActive" class="clear-button" @click="clearFilters">Clear</button>
            </div>

            <div v-if="loading && !logs.length" class="panel-state">Loading log streamâ€¦</div>
            <div v-else-if="apiError" class="panel-state panel-state--error">
                <strong>Could not load logs.</strong>
                <span>{{ errorMessage }}</span>
                <button class="retry-button" @click="loadData()">Try again</button>
            </div>
            <div v-else-if="!filteredLogs.length" class="panel-state">
                No logs match the current filters.
                <button v-if="filtersActive" class="text-button" @click="clearFilters">Clear filters</button>
            </div>
            <div v-else class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th class="time-column">Time</th>
                            <th class="type-column">Type</th>
                            <th>Service</th>
                            <th>Message</th>
                            <th class="detail-column"></th>
                        </tr>
                    </thead>
                    <tbody>
                        <template v-for="log in paginatedLogs" :key="log.logID">
                            <tr :class="{ 'is-error': log.type === 1 }">
                                <td class="log-time" :title="formatDate(log.TimeOfLog)">{{ compactTime(log.TimeOfLog) }}</td>
                                <td><span class="type-badge" :class="`type-${logType(log.type).toLowerCase()}`">{{ logType(log.type) }}</span></td>
                                <td><button class="service-tag" @click="selectService(log.serviceName)">{{ log.serviceName || 'System' }}</button></td>
                                <td class="log-message" :title="logText(log)">{{ logText(log) }}</td>
                                <td class="detail-cell">
                                    <button v-if="hasDetails(log)" class="detail-button" :aria-expanded="expandedLogId === log.logID" @click="toggleDetails(log.logID)">
                                        {{ expandedLogId === log.logID ? 'Hide' : 'Details' }}
                                    </button>
                                </td>
                            </tr>
                            <tr v-if="expandedLogId === log.logID" class="expanded-row">
                                <td colspan="5"><pre>{{ detailText(log) }}</pre></td>
                            </tr>
                        </template>
                    </tbody>
                </table>
            </div>

            <footer v-if="totalPages > 1" class="pagination">
                <button :disabled="currentPage === 1" @click="currentPage--">Previous</button>
                <span>Page {{ currentPage }} / {{ totalPages }}</span>
                <button :disabled="currentPage === totalPages" @click="currentPage++">Next</button>
            </footer>
        </section>
    </main>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';

definePageMeta({ layout: 'navbar' });

const logs = ref([]);
const summary = ref(null);
const loading = ref(true);
const apiError = ref(false);
const errorMessage = ref('');
const searchTerm = ref('');
const selectedService = ref('');
const selectedType = ref('all');
const currentPage = ref(1);
const expandedLogId = ref('');
const lastRefreshedAt = ref(null);
const logsPerPage = 35;

const typeOptions = [
    { value: 'all', label: 'All' },
    { value: 'error', label: 'Errors' },
    { value: 'status', label: 'Status' },
    { value: 'update', label: 'Updates' }
];

const serviceOptions = computed(() => [...new Set(logs.value
    .map(log => log.serviceName)
    .filter(Boolean))].sort((a, b) => a.localeCompare(b)));

const filteredLogs = computed(() => {
    const search = searchTerm.value.toLowerCase();
    return [...logs.value]
        .filter(log => {
            if (selectedService.value && log.serviceName !== selectedService.value) return false;
            if (selectedType.value !== 'all' && log.type !== typeNumber(selectedType.value)) return false;
            if (!search) return true;
            return [log.logID, log.serviceName, logText(log), log.errorInfo?.ExceptionType, log.errorInfo?.Message]
                .filter(Boolean)
                .some(value => String(value).toLowerCase().includes(search));
        })
        .sort((a, b) => new Date(b.TimeOfLog) - new Date(a.TimeOfLog));
});

const totalPages = computed(() => Math.max(1, Math.ceil(filteredLogs.value.length / logsPerPage)));
const paginatedLogs = computed(() => filteredLogs.value.slice((currentPage.value - 1) * logsPerPage, currentPage.value * logsPerPage));
const errorCount = computed(() => logs.value.filter(log => log.type === 1).length);
const statusCount = computed(() => logs.value.filter(log => log.type === 0).length);
const recentErrorCount = computed(() => logs.value.filter(log => log.type === 1 && new Date(log.TimeOfLog) >= new Date(Date.now() - 60 * 60 * 1000)).length);
const localErrorRate = computed(() => logs.value.length ? (errorCount.value / logs.value.length) * 100 : 0);
const latestLogAt = computed(() => logs.value.reduce((latest, log) => {
    if (!latest || new Date(log.TimeOfLog) > new Date(latest)) return log.TimeOfLog;
    return latest;
}, null));
const timeline = computed(() => summary.value?.Timeline ?? localTimeline());
const topServices = computed(() => summary.value?.TopServices ?? localTopServices());
const errorFamilies = computed(() => summary.value?.ErrorFamilies ?? localErrorFamilies());
const filtersActive = computed(() => Boolean(searchTerm.value || selectedService.value || selectedType.value !== 'all'));
const refreshLabel = computed(() => lastRefreshedAt.value ? `Updated ${relativeTime(lastRefreshedAt.value)}` : 'Connectingâ€¦');

watch([searchTerm, selectedService, selectedType], () => {
    currentPage.value = 1;
    expandedLogId.value = '';
});

watch(totalPages, pages => {
    if (currentPage.value > pages) currentPage.value = pages;
});

async function loadData() {
    if (!process.client) return;

    loading.value = true;
    apiError.value = false;
    errorMessage.value = '';

    try {
        const [logResponse, summaryResponse] = await Promise.all([
            RequestGETFromKliveAPI('/api/logs?limit=250&sort=desc', false, false),
            RequestGETFromKliveAPI('/api/logs/summary?hours=12', false, false)
        ]);

        if (!logResponse.ok) throw new Error(responseMessage(logResponse));
        const payload = await logResponse.json();
        if (!Array.isArray(payload)) throw new Error('The logs endpoint returned an unexpected format.');

        logs.value = payload;
        summary.value = summaryResponse.ok ? await summaryResponse.json() : null;
        lastRefreshedAt.value = new Date();
    } catch (error) {
        apiError.value = true;
        errorMessage.value = error?.message || 'The log service is unavailable.';
        summary.value = null;
    } finally {
        loading.value = false;
    }
}

function responseMessage(response) {
    if (response.status === 401 || response.status === 403) return 'You do not have permission to read bot logs.';
    if (response.status === 404) return 'The logs endpoint is not available.';
    return `The server returned ${response.status}.`;
}

function typeNumber(type) {
    return type === 'error' ? 1 : type === 'update' ? 2 : 0;
}

function logType(type) {
    return type === 1 ? 'Error' : type === 2 ? 'Update' : 'Status';
}

function logText(log) {
    return log.message || log.errorInfo?.Message || 'No message supplied.';
}

function hasDetails(log) {
    return Boolean(log.errorInfo || log.oldMessage);
}

function detailText(log) {
    const error = log.errorInfo;
    if (error) {
        return [
            error.ExceptionType && `Type: ${error.ExceptionType}`,
            error.Message && `Message: ${error.Message}`,
            error.Source && `Source: ${error.Source}`,
            error.TargetSite && `Target: ${error.TargetSite}`,
            error.StackTrace && `\n${error.StackTrace}`
        ].filter(Boolean).join('\n');
    }
    return `Previous message:\n${log.oldMessage || 'Unavailable'}`;
}

function toggleDetails(logID) {
    expandedLogId.value = expandedLogId.value === logID ? '' : logID;
}

function selectService(serviceName) {
    selectedService.value = serviceName || '';
}

function showErrors() {
    selectedType.value = 'error';
}

function clearFilters() {
    searchTerm.value = '';
    selectedService.value = '';
    selectedType.value = 'all';
}

function number(value) {
    return Number(value || 0).toLocaleString();
}

function percent(value) {
    return `${Number(value || 0).toFixed(1)}%`;
}

function formatDate(value) {
    if (!value) return 'No events yet';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function compactTime(value) {
    if (!value) return 'â€”';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'â€”';
    const today = new Date();
    return date.toDateString() === today.toDateString()
        ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function relativeTime(value) {
    if (!value) return 'No events';
    const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
    if (seconds < 10) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

function barHeight(count) {
    const maximum = Math.max(...timeline.value.map(bucket => bucket.TotalCount), 1);
    return count ? Math.max(6, Math.round((count / maximum) * 100)) : 0;
}

function bucketLabel(start) {
    return new Date(start).toLocaleTimeString([], { hour: '2-digit' });
}

function bucketTitle(bucket) {
    return `${formatDate(bucket.Start)}: ${bucket.TotalCount} events, ${bucket.ErrorCount} errors`;
}

function localTopServices() {
    return Object.values(logs.value.reduce((services, log) => {
        const name = log.serviceName || 'System';
        if (!services[name]) services[name] = { ServiceName: name, TotalCount: 0, ErrorCount: 0 };
        services[name].TotalCount++;
        if (log.type === 1) services[name].ErrorCount++;
        return services;
    }, {})).sort((a, b) => b.TotalCount - a.TotalCount).slice(0, 6);
}

function localTimeline() {
    const currentHour = new Date();
    currentHour.setMinutes(0, 0, 0);
    const start = new Date(currentHour.getTime() - 11 * 60 * 60 * 1000);
    const buckets = Array.from({ length: 12 }, (_, index) => ({
        Start: new Date(start.getTime() + index * 60 * 60 * 1000).toISOString(),
        TotalCount: 0,
        ErrorCount: 0
    }));

    for (const log of logs.value) {
        const index = Math.floor((new Date(log.TimeOfLog).getTime() - start.getTime()) / (60 * 60 * 1000));
        if (index >= 0 && index < buckets.length) {
            buckets[index].TotalCount++;
            if (log.type === 1) buckets[index].ErrorCount++;
        }
    }
    return buckets;
}

function localErrorFamilies() {
    return Object.values(logs.value.filter(log => log.type === 1).reduce((families, log) => {
        const label = log.errorInfo?.ExceptionType || logText(log).slice(0, 80);
        if (!families[label]) families[label] = { Label: label, Count: 0 };
        families[label].Count++;
        return families;
    }, {})).sort((a, b) => b.Count - a.Count).slice(0, 5);
}

onMounted(loadData);
</script>

<style scoped>
.botlogs-page {
    --surface: #181818;
    --surface-raised: #202020;
    --line: #343434;
    --muted: #999;
    --text: #f5f5f5;
    --green: #65bd50;
    --red: #ef6c63;
    max-width: 1560px;
    margin: 0 auto;
    padding: 20px 24px 36px;
    color: var(--text);
}

.page-toolbar,
.toolbar-actions,
.title-row,
.card-heading,
.log-panel-header,
.filter-bar,
.pagination {
    display: flex;
    align-items: center;
}

.page-toolbar {
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 18px;
}

.back-link,
.text-button,
.service-tag,
.detail-button,
.clear-button,
.pagination button,
.retry-button,
.refresh-button,
.type-filter button,
.service-row {
    font: inherit;
    cursor: pointer;
}

.back-link {
    display: inline-block;
    margin-bottom: 7px;
    color: var(--muted);
    font-size: .76rem;
    text-decoration: none;
}

.back-link:hover { color: var(--green); }
.title-row { gap: 10px; }
h1, h2, p { margin: 0; }
h1 { font-size: clamp(1.45rem, 2vw, 1.85rem); letter-spacing: -.035em; }
h2 { font-size: .94rem; letter-spacing: -.01em; }
.title-block p { margin-top: 4px; color: var(--muted); font-size: .82rem; }

.live-indicator,
.updated-at,
.result-count,
.legend {
    color: var(--muted);
    font-size: .72rem;
}

.live-indicator {
    border: 1px solid rgba(101, 189, 80, .35);
    border-radius: 999px;
    padding: 3px 8px;
    color: #b8dfae;
}

.live-indicator i,
.legend i {
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-right: 5px;
    border-radius: 50%;
    background: var(--green);
}
.legend i { background: var(--red); }

.toolbar-actions { gap: 11px; }
.refresh-button {
    border: 1px solid #467f39;
    border-radius: 6px;
    padding: 8px 11px;
    background: #213a1d;
    color: #d8f1d2;
    font-size: .78rem;
    font-weight: 700;
}
.refresh-button:hover:not(:disabled) { background: #294a23; }
.refresh-button:disabled { cursor: wait; opacity: .68; }
.spinning { display: inline-block; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.metric-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
    background: var(--surface);
}

.metric-card {
    min-height: 90px;
    padding: 14px 16px;
    border-right: 1px solid var(--line);
}
.metric-card:last-child { border-right: 0; }
.metric-label, .eyebrow {
    display: block;
    color: var(--muted);
    font-size: .66rem;
    font-weight: 700;
    letter-spacing: .09em;
    text-transform: uppercase;
}
.metric-card strong { display: block; margin: 4px 0 3px; font-size: 1.52rem; letter-spacing: -.04em; }
.metric-card small { color: var(--muted); font-size: .72rem; }
.metric-card--danger strong { color: var(--red); }
.metric-card .metric-time { font-size: 1.18rem; letter-spacing: -.025em; }

.analysis-grid {
    display: grid;
    grid-template-columns: minmax(360px, 1.55fr) minmax(230px, 1fr) minmax(230px, 1fr);
    gap: 12px;
    margin: 12px 0;
}

.analysis-card,
.log-panel {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
}
.analysis-card { min-height: 178px; padding: 14px; }
.card-heading, .log-panel-header { justify-content: space-between; gap: 12px; }
.card-heading h2, .log-panel-header h2 { margin-top: 3px; }
.text-button {
    border: 0;
    padding: 0;
    color: var(--green);
    background: transparent;
    font-size: .73rem;
}
.text-button:hover, .text-button.active { color: #a7e899; text-decoration: underline; }

.activity-chart {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    align-items: end;
    gap: 5px;
    height: 112px;
    margin-top: 13px;
}
.chart-column { display: grid; grid-template-rows: 90px auto; gap: 5px; min-width: 0; color: #777; font-size: .58rem; text-align: center; }
.bar-track { position: relative; height: 90px; border-bottom: 1px solid #3b3b3b; }
.bar-total, .bar-error { position: absolute; bottom: 0; left: 20%; width: 60%; border-radius: 3px 3px 0 0; }
.bar-total { background: #4c8e40; opacity: .72; }
.bar-error { z-index: 1; background: var(--red); min-height: 0; }
.empty-analytics { padding-top: 45px; color: #777; font-size: .78rem; text-align: center; }

.ranked-list { margin-top: 10px; }
.service-row, .error-row {
    display: flex;
    width: 100%;
    min-height: 27px;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border: 0;
    border-bottom: 1px solid rgba(255,255,255,.06);
    padding: 0;
    background: transparent;
    color: var(--text);
    text-align: left;
}
.service-row:hover .service-name { color: var(--green); }
.service-name, .error-label { overflow: hidden; color: #d5d5d5; font-size: .73rem; text-overflow: ellipsis; white-space: nowrap; }
.service-count, .error-count { flex: 0 0 auto; color: #bcbcbc; font-size: .69rem; font-variant-numeric: tabular-nums; }
.service-count.danger, .error-count { color: var(--red); }
.service-count em { margin-left: 4px; color: var(--red); font-size: .62rem; font-style: normal; }
.error-row { cursor: default; }

.log-panel { overflow: hidden; }
.log-panel-header { min-height: 57px; padding: 12px 15px; border-bottom: 1px solid var(--line); }
.filter-bar {
    gap: 9px;
    padding: 10px 15px;
    border-bottom: 1px solid var(--line);
    background: rgba(255,255,255,.012);
}
.search-field, .select-field { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 7px; color: #818181; font-size: .68rem; }
.search-field { flex: 1 1 290px; }
.select-field { flex: 0 1 250px; }
input, select { min-width: 0; border: 1px solid #3b3b3b; border-radius: 5px; padding: 7px 8px; outline: 0; background: #151515; color: #eee; font: inherit; font-size: .75rem; }
input:focus, select:focus { border-color: var(--green); box-shadow: 0 0 0 2px rgba(101,189,80,.11); }
.type-filter { display: flex; overflow: hidden; border: 1px solid #3b3b3b; border-radius: 5px; }
.type-filter button { border: 0; border-right: 1px solid #3b3b3b; padding: 7px 8px; background: #191919; color: #aaa; font-size: .69rem; }
.type-filter button:last-child { border-right: 0; }
.type-filter button:hover, .type-filter button.active { background: #284724; color: #d7f6d1; }
.clear-button { border: 0; padding: 5px; background: transparent; color: #aaa; font-size: .72rem; }
.clear-button:hover { color: var(--text); }

.table-wrap { overflow: auto; }
table { width: 100%; border-spacing: 0; border-collapse: collapse; table-layout: fixed; }
th { height: 31px; border-bottom: 1px solid var(--line); padding: 0 10px; color: #777; font-size: .62rem; font-weight: 700; letter-spacing: .08em; text-align: left; text-transform: uppercase; }
td { height: 35px; border-bottom: 1px solid rgba(255,255,255,.055); padding: 0 10px; color: #d3d3d3; font-size: .75rem; }
tbody tr:not(.expanded-row):hover { background: rgba(101,189,80,.045); }
.is-error .log-message { color: #ffd2cf; }
.time-column { width: 104px; }.type-column { width: 61px; }.detail-column { width: 54px; }
.log-time { color: #999; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .68rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
.type-badge { display: inline-block; border-radius: 3px; padding: 2px 5px; font-size: .58rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
.type-status { background: rgba(101,189,80,.13); color: #9bd88e; }.type-error { background: rgba(239,108,99,.14); color: #ffaaa3; }.type-update { background: rgba(113,162,222,.14); color: #a9cfff; }
.service-tag { max-width: 100%; overflow: hidden; border: 0; padding: 0; background: transparent; color: #90d380; font-size: .72rem; text-align: left; text-overflow: ellipsis; white-space: nowrap; }.service-tag:hover { color: #c1edb8; text-decoration: underline; }
.log-message { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.detail-cell { padding-left: 0; }.detail-button { border: 0; padding: 3px 0; background: transparent; color: #9bd88e; font-size: .67rem; }.detail-button:hover { color: #d2f5cb; text-decoration: underline; }
.expanded-row td { height: auto; padding: 0; border-bottom: 1px solid #4a3938; background: #181313; }.expanded-row pre { max-height: 230px; overflow: auto; margin: 0; padding: 12px 14px; color: #d9c4c2; font: .7rem/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; }
.panel-state { display: grid; min-height: 180px; place-content: center; gap: 9px; color: #999; font-size: .82rem; text-align: center; }.panel-state--error strong { color: var(--red); }.retry-button { justify-self: center; border: 1px solid #88433e; border-radius: 4px; padding: 6px 10px; background: transparent; color: #ffaaa3; font-size: .73rem; }
.pagination { justify-content: center; gap: 13px; padding: 10px; color: #8d8d8d; font-size: .72rem; }.pagination button { border: 1px solid #3b3b3b; border-radius: 4px; padding: 5px 9px; background: #202020; color: #ddd; font-size: .7rem; }.pagination button:hover:not(:disabled) { border-color: #5a9750; }.pagination button:disabled { cursor: not-allowed; opacity: .38; }

@media (max-width: 1050px) { .analysis-grid { grid-template-columns: 1fr 1fr; }.activity-card { grid-column: 1 / -1; }.metric-grid { grid-template-columns: repeat(2, 1fr); }.metric-card:nth-child(2) { border-right: 0; }.metric-card:nth-child(-n+2) { border-bottom: 1px solid var(--line); } }
@media (max-width: 720px) { .botlogs-page { padding: 16px 12px 28px; }.page-toolbar { align-items: flex-start; flex-direction: column; gap: 12px; }.toolbar-actions { width: 100%; justify-content: space-between; }.analysis-grid { grid-template-columns: 1fr; }.activity-card { grid-column: auto; }.filter-bar { align-items: stretch; flex-wrap: wrap; }.search-field, .select-field { flex-basis: 100%; }.type-filter { flex: 1; }.type-filter button { flex: 1; }.time-column { width: 74px; }.type-column { width: 49px; }.detail-column { width: 48px; } th, td { padding: 0 6px; }.service-tag { max-width: 90px; }.metric-card { min-height: 82px; padding: 12px; } }
@media (max-width: 480px) { .metric-card strong { font-size: 1.24rem; }.metric-card small { font-size: .65rem; }.metric-card .metric-time { font-size: .9rem; }.log-message { max-width: 120px; }.activity-chart { gap: 3px; }.chart-column { font-size: .5rem; } }
</style>

