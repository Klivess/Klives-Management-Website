<template>
    <OmniscienceV3Shell>
        <div class="omni-pagehead">
            <div>
                <h1>Engine overview</h1>
                <p class="subtitle">What Omniscience v3 is doing right now: its stores, job lanes, modules and LLM use.</p>
            </div>
            <div class="omni-actions">
                <button class="omni-btn ghost" type="button" @click="refreshStatus()">Refresh</button>
            </div>
        </div>

        <div class="omni-kpis">
            <OmniscienceV3Kpi label="Engine" :value="status?.phase ?? '—'" :tone="phaseTone" :loading="pending"
                           :foot="status?.readyAtMs ? `ready for ${omniDuration(now - status.readyAtMs)}` : status?.stage" />
            <OmniscienceV3Kpi label="Modules" :value="status ? `${enabledModules} / ${status.modules.length}` : '—'" :loading="pending"
                           :tone="failingModules ? 'warn' : ''" :to="`${OMNI_BASE}/modules`"
                           :foot="failingModules ? `${failingModules} with a recent failure` : 'enabled / installed'" />
            <OmniscienceV3Kpi label="Jobs waiting" :value="omniCount(totals.queued)" :loading="pending" :to="`${OMNI_BASE}/jobs?state=queued`"
                           :foot="`${omniCount(totals.leased)} running now`" />
            <OmniscienceV3Kpi label="Dead jobs" :value="omniCount(totals.dead)" :loading="pending" :tone="totals.dead ? 'bad' : 'good'"
                           :to="`${OMNI_BASE}/jobs?state=dead`" foot="failed every attempt" :attention="totals.dead > 0" />
            <OmniscienceV3Kpi label="LLM calls, last hour" :value="omniCount(llmHour.calls)" :loading="pending" :to="`${OMNI_BASE}/llm`"
                           :tone="llmHour.failed ? 'warn' : ''" :foot="llmHour.calls ? `${llmHour.failed} failed` : 'none'" />
            <OmniscienceV3Kpi label="Prompt cache hit rate" :value="llmHour.promptTokens ? omniPercent(llmHour.cachedTokens / llmHour.promptTokens) : '—'"
                           :loading="pending" help="Cached prompt tokens ÷ prompt tokens over the last hour. AIRouter fair use needs this to stay high."
                           :foot="llmHour.promptTokens ? `${omniCompact(llmHour.promptTokens)} prompt tokens` : 'no calls in the last hour'" />
        </div>

        <div class="omni-grid two">
            <OmniscienceV3Panel title="Job lanes" subtitle="Each lane runs its own kind of work so slow LLM jobs never block fast ones."
                                flush :loading="pending" :error="blockingError" :empty="!status?.lanes.length"
                                empty-title="No lanes yet" :empty-text="notReadyText" @retry="refreshStatus()">
                <OmniscienceV3DataTable :rows="status?.lanes ?? []" :columns="laneColumns" :row-key="r => r.lane" label="lanes" bare max-height="none">
                    <template #cell-lane="{ row }">
                        <NuxtLink :to="`${OMNI_BASE}/jobs?lane=${row.lane}`">{{ row.lane }}</NuxtLink>
                    </template>
                    <template #cell-dead="{ row }"><span :class="row.dead ? 'neg' : 'omni-muted'">{{ omniCount(row.dead) }}</span></template>
                </OmniscienceV3DataTable>
            </OmniscienceV3Panel>

            <OmniscienceV3Panel title="Stores" subtitle="One writer per file. Pending writes should stay near zero."
                                flush :loading="pending" :error="blockingError" :empty="!status?.stores.length"
                                empty-title="No stores open" :empty-text="notReadyText" @retry="refreshStatus()">
                <OmniscienceV3DataTable :rows="status?.stores ?? []" :columns="storeColumns" :row-key="r => r.name" label="stores" bare max-height="none">
                    <template #cell-fileBytes="{ row }">{{ omniBytes(row.fileBytes) }}</template>
                    <template #cell-walBytes="{ row }">{{ omniBytes(row.walBytes) }}</template>
                    <template #cell-pendingWrites="{ row }"><span :class="row.pendingWrites > 1000 ? 'neg' : ''">{{ omniCount(row.pendingWrites) }}</span></template>
                    <template #cell-lastCommitMs="{ row }"><OmniscienceV3Time :ms="row.lastCommitMs || null" mode="age" /></template>
                </OmniscienceV3DataTable>
            </OmniscienceV3Panel>
        </div>

        <div class="omni-grid two" style="margin-top: var(--omni-gutter)">
            <OmniscienceV3Panel title="Modules needing attention" subtitle="Modules with a backlog, dead jobs or a recent failure."
                                flush :loading="pending" :error="blockingError" :empty="!attentionModules.length"
                                :empty-kind="status?.modules.length ? 'ok' : 'empty'"
                                :empty-title="status?.modules.length ? 'Every module is caught up' : 'No modules loaded'"
                                :empty-text="status?.modules.length ? undefined : notReadyText" @retry="refreshStatus()">
                <template #controls><NuxtLink class="omni-btn ghost sm" :to="`${OMNI_BASE}/modules`">All modules</NuxtLink></template>
                <OmniscienceV3DataTable :rows="attentionModules" :columns="moduleColumns" :row-key="r => r.moduleId" label="modules" bare max-height="360px">
                    <template #cell-title="{ row }">
                        <NuxtLink :to="`${OMNI_BASE}/modules?module=${encodeURIComponent(row.moduleId)}`">{{ row.title }}</NuxtLink>
                        <span v-if="!row.enabled" class="omni-chip">off</span>
                    </template>
                    <template #cell-lastFailedMs="{ row }">
                        <span v-if="row.lastFailedMs" :title="row.lastError ?? ''"><OmniscienceV3Time :ms="row.lastFailedMs" mode="age" /></span>
                        <span v-else class="omni-muted">—</span>
                    </template>
                </OmniscienceV3DataTable>
            </OmniscienceV3Panel>

            <OmniscienceV3Panel title="LLM, last hour" subtitle="By work class. Background work yields to interactive use."
                                flush :loading="pending" :error="blockingError" :empty="!llmRows.length"
                                empty-title="No LLM calls in the last hour" @retry="refreshStatus()">
                <template #controls><NuxtLink class="omni-btn ghost sm" :to="`${OMNI_BASE}/llm`">All calls</NuxtLink></template>
                <OmniscienceV3DataTable :rows="llmRows" :columns="llmColumns" :row-key="r => r.key" label="work classes" bare max-height="none">
                    <template #cell-cacheHitRate="{ row }">{{ omniPercent(row.cacheHitRate) }}</template>
                    <template #cell-promptTokens="{ row }">{{ omniCompact(row.promptTokens) }}</template>
                    <template #cell-completionTokens="{ row }">{{ omniCompact(row.completionTokens) }}</template>
                    <template #cell-p95LatencyMs="{ row }">{{ omniDuration(row.p95LatencyMs) }}</template>
                    <template #cell-failed="{ row }"><span :class="row.failed ? 'neg' : 'omni-muted'">{{ row.failed }}</span></template>
                </OmniscienceV3DataTable>
            </OmniscienceV3Panel>
        </div>

        <p v-if="status" class="omni-foot omni-muted">
            Engine clock <OmniscienceV3Time :ms="status.nowMs" mode="absolute" seconds /> · Klives's zone {{ status.klivesZone ?? 'not set' }}
            · {{ status.routes.length }} routes registered
            <template v-if="status.stream"> · {{ status.stream.connections }} live-stream connection{{ status.stream.connections === 1 ? '' : 's' }}</template>
        </p>
    </OmniscienceV3Shell>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { OMNI_BASE, OmniApiError } from '~/scripts/omniscience/api';
import { omniBytes, omniCompact, omniCount, omniDuration, omniPercent } from '~/scripts/omniscience/format';
import { useOmniEngine, useOmniTime } from '~/composables/useOmniscienceV3';
import type { TableColumn } from '~/components/OmniscienceV3/DataTable.vue';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Omniscience v3 · Engine' });

const { status, statusError, refreshStatus } = useOmniEngine();
const { now } = useOmniTime();

const pending = computed(() => !status.value && !statusError.value);
/** Only when there is no status at all; a Disabled/Starting engine answers its status and the shell explains it. */
const blockingError = computed(() => (!status.value && statusError.value
    ? new OmniApiError(statusError.value.kind as OmniApiError['kind'], statusError.value.message, 0, 'status') : null));
const notReadyText = computed(() => (status.value && status.value.phase !== 'Ready' ? `The engine is ${status.value.phase.toLowerCase()}.` : undefined));

const phaseTone = computed(() => ({ Ready: 'good', Starting: 'warn', Stopping: 'warn', Failed: 'bad', Disabled: '' }[status.value?.phase ?? 'Disabled'] ?? ''));
const enabledModules = computed(() => (status.value?.modules ?? []).filter(m => m.enabled).length);
const failingModules = computed(() => (status.value?.modules ?? []).filter(m => m.lastFailedMs && (!m.lastSucceededMs || m.lastFailedMs > m.lastSucceededMs)).length);
const attentionModules = computed(() => (status.value?.modules ?? [])
    .filter(m => m.dead > 0 || m.backlog > 0 || m.dirtySubjects > 0 || (m.lastFailedMs && (!m.lastSucceededMs || m.lastFailedMs > m.lastSucceededMs)))
    .sort((a, b) => b.dead - a.dead || b.backlog - a.backlog));

const totals = computed(() => (status.value?.lanes ?? []).reduce(
    (sum, lane) => ({ queued: sum.queued + lane.queued, leased: sum.leased + lane.leased, dead: sum.dead + lane.dead }),
    { queued: 0, leased: 0, dead: 0 }));

const llmRows = computed(() => status.value?.llm?.lastHourByWorkClass ?? []);
const llmHour = computed(() => llmRows.value.reduce(
    (sum, row) => ({
        calls: sum.calls + row.calls, failed: sum.failed + row.failed,
        promptTokens: sum.promptTokens + row.promptTokens, cachedTokens: sum.cachedTokens + row.cachedTokens,
    }),
    { calls: 0, failed: 0, promptTokens: 0, cachedTokens: 0 }));

const laneColumns: TableColumn[] = [
    { key: 'lane', label: 'Lane' },
    { key: 'queued', label: 'Queued', num: true },
    { key: 'leased', label: 'Running', num: true },
    { key: 'succeeded', label: 'Succeeded', num: true },
    { key: 'cancelled', label: 'Cancelled', num: true },
    { key: 'dead', label: 'Dead', num: true },
];
const storeColumns: TableColumn[] = [
    { key: 'name', label: 'Store' },
    { key: 'fileBytes', label: 'File', num: true },
    { key: 'walBytes', label: 'WAL', num: true },
    { key: 'pendingWrites', label: 'Pending writes', num: true },
    { key: 'committedBatches', label: 'Batches', num: true },
    { key: 'lastCommitMs', label: 'Last commit', num: true },
];
const moduleColumns: TableColumn[] = [
    { key: 'title', label: 'Module' },
    { key: 'backlog', label: 'Backlog', num: true },
    { key: 'dirtySubjects', label: 'Dirty', num: true },
    { key: 'queued', label: 'Queued', num: true },
    { key: 'dead', label: 'Dead', num: true },
    { key: 'lastFailedMs', label: 'Last failure', num: true },
];
const llmColumns: TableColumn[] = [
    { key: 'key', label: 'Work class' },
    { key: 'calls', label: 'Calls', num: true },
    { key: 'failed', label: 'Failed', num: true },
    { key: 'promptTokens', label: 'Prompt', num: true },
    { key: 'cacheHitRate', label: 'Cached', num: true },
    { key: 'completionTokens', label: 'Output', num: true },
    { key: 'p95LatencyMs', label: 'p95', num: true },
];
</script>

<style scoped>
.omni-foot { margin-top: 20px; font-size: 12px; }
</style>
