<template>
    <section class="os-panel">
        <div class="os-panel-head">
            <div><h2><span class="os-panel-code">HLTH</span> Data health & coverage</h2><p class="os-panel-subtitle">Collection status, searchable coverage, background jobs and source freshness</p></div>
            <button class="os-btn sm ghost" :disabled="loading" @click="load">{{ loading ? 'Checking…' : 'Run checks' }}</button>
        </div>
        <div class="os-panel-body">
            <div v-if="error" class="os-error-state"><span>{{ error }}</span><button class="os-btn sm" @click="load">Retry</button></div>
            <div v-else-if="loading && !data" class="os-skeleton-stack"><i /><i /><i /></div>
            <template v-else-if="data">
                <div class="os-health-status" :class="data.status">
                    <span class="os-health-dot" />
                    <div><strong>{{ data.status === 'healthy' ? 'All systems nominal' : 'Attention recommended' }}</strong><small>Checked {{ formatDate(data.checked_at, true) }}</small></div>
                    <span class="os-health-activity" :class="{ ready: data.activity_counts?.ready }">Activity summaries: {{ data.activity_counts?.ready ? 'ready' : data.activity_counts?.running ? 'warming' : 'not ready' }}</span>
                </div>
                <div v-if="data.warnings?.length" class="os-health-warnings">
                    <div v-for="warning in data.warnings" :key="warning">⚠ {{ warning }}</div>
                </div>
                <div class="os-health-metrics">
                    <div><span>People</span><strong>{{ formatCompact(data.metrics.persons) }}</strong><small>canonical records</small></div>
                    <div><span>Messages</span><strong>{{ formatCompact(data.metrics.messages) }}</strong><small>captured corpus</small></div>
                    <div><span>Embedding coverage</span><strong>{{ data.metrics.tracked_embedding_coverage_pct }}%</strong><small>{{ formatCompact(data.metrics.tracked_embedded) }} / {{ formatCompact(data.metrics.tracked_messages) }} tracked</small></div>
                    <div><span>Reply pairs</span><strong>{{ formatCompact(data.metrics.stimulus_reply_pairs) }}</strong><small>reaction evidence</small></div>
                    <div><span>Replica eras</span><strong>{{ formatCompact(data.metrics.replica_eras) }}</strong><small>{{ data.metrics.replicas_ready }} ready replicas</small></div>
                    <div><span>Failed jobs · 7d</span><strong :class="{ danger: data.metrics.failed_replica_jobs_7d }">{{ data.metrics.failed_replica_jobs_7d }}</strong><small>Replica training</small></div>
                </div>
                <div class="os-health-coverage">
                    <div><span>Searchable tracked corpus</span><strong>{{ data.metrics.tracked_embedding_coverage_pct }}%</strong></div>
                    <div class="os-meter"><div class="os-meter-fill" :style="{ width: Math.min(100, data.metrics.tracked_embedding_coverage_pct) + '%' }" /></div>
                    <small>Latest captured message: {{ formatDate(data.metrics.latest_message_at, true) }}</small>
                </div>
                <div class="os-chart-heading"><span>Harvest sources</span><small>{{ data.sources.length }} configured</small></div>
                <div v-for="source in data.sources" :key="source.source_id" class="os-row">
                    <span class="os-badge" :class="source.status === 'active' ? 'good' : 'bad'">{{ source.status }}</span>
                    <div class="os-row-main"><strong>{{ source.label || source.platform }}</strong><small>{{ source.platform }} · last event {{ formatDate(source.last_event_at, true) }}<template v-if="source.status_message"> · {{ source.status_message }}</template></small></div>
                </div>
                <div v-if="!data.sources.length" class="os-empty">No dedicated sources configured. Linked live feeds can still provide data.</div>
            </template>
        </div>
    </section>
</template>

<script setup lang="ts">
import { formatCompact, formatDate, omniscienceError, useOmniscienceApi } from '~/composables/useOmniscienceApi';

const api = useOmniscienceApi();
const data = ref<any>(null);
const loading = ref(false);
const error = ref('');
async function load() {
    loading.value = true; error.value = '';
    try { data.value = await api.get('/omniscience/workspace/health'); }
    catch (cause) { error.value = omniscienceError(cause, 'Health checks failed.'); }
    finally { loading.value = false; }
}
onMounted(load);
</script>

<style scoped>
.os-health-status { display: flex; align-items: center; gap: 11px; padding: 13px; border: 1px solid rgba(107,255,159,.25); border-radius: 10px; background: rgba(107,255,159,.045); }
.os-health-status.attention { border-color: rgba(255,194,71,.3); background: rgba(255,194,71,.045); }
.os-health-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--os-green); box-shadow: 0 0 14px var(--os-green); }
.os-health-status.attention .os-health-dot { background: var(--os-amber); box-shadow: 0 0 14px var(--os-amber); }
.os-health-status > div { flex: 1; }
.os-health-status strong, .os-health-status small { display: block; }
.os-health-status strong { color: var(--os-ink); font-size: 13px; }
.os-health-status small { color: var(--os-muted); font-size: 10px; }
.os-health-activity { padding: 4px 8px; border-radius: 999px; background: rgba(255,255,255,.05); color: var(--os-amber); font: 700 9px var(--os-mono); }
.os-health-activity.ready { color: var(--os-green); }
.os-health-warnings { display: grid; gap: 5px; margin: 10px 0; }
.os-health-warnings > div { padding: 8px 10px; border-left: 2px solid var(--os-amber); background: rgba(255,194,71,.05); color: var(--os-amber); font-size: 11px; }
.os-health-metrics { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin: 13px 0; }
.os-health-metrics > div { padding: 11px; border: 1px solid var(--os-line); border-radius: 9px; background: rgba(255,255,255,.018); }
.os-health-metrics span, .os-health-metrics small { display: block; color: var(--os-muted); font-size: 9px; }
.os-health-metrics strong { display: block; margin: 4px 0; color: var(--os-ink); font: 750 20px var(--os-mono); }
.os-health-metrics strong.danger { color: var(--os-red); }
.os-health-coverage { padding: 12px; margin-bottom: 12px; border: 1px solid var(--os-line); border-radius: 9px; }
.os-health-coverage > div:first-child { display: flex; justify-content: space-between; margin-bottom: 8px; color: var(--os-muted); font-size: 10px; }
.os-health-coverage strong { color: var(--os-cyan); }
.os-health-coverage small { display: block; margin-top: 7px; color: var(--os-faint); font-size: 9px; }
@media (max-width: 700px) { .os-health-metrics { grid-template-columns: repeat(2,1fr); } .os-health-activity { display: none; } }
</style>
