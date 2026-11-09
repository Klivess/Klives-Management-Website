<template>
    <OmniscienceV3Shell>
        <div class="ot-pagehead">
            <div>
                <h1>LLM use</h1>
                <p class="subtitle">Every model call Omniscience makes is logged: what it was for, how much of the prompt was served from cache, and how it ended.</p>
            </div>
            <div class="ot-actions">
                <button class="ot-btn ghost" type="button" @click="reloadAll">Refresh</button>
            </div>
        </div>

        <div class="ot-filterbar">
            <div class="ot-segment" role="group" aria-label="Time window">
                <button v-for="w in WINDOWS" :key="w.value" type="button" :aria-pressed="filters.window === w.value" @click="filters.window = w.value">{{ w.label }}</button>
            </div>
            <select v-model="filters.module" class="ot-select auto" aria-label="Module">
                <option value="">All modules</option>
                <option v-for="m in moduleIds" :key="m" :value="m">{{ m }}</option>
            </select>
            <select v-model="filters.workClass" class="ot-select auto" aria-label="Work class">
                <option value="">All work classes</option>
                <option v-for="c in workClasses" :key="c" :value="c">{{ c }}</option>
            </select>
            <label class="ot-search"><span class="visually-hidden">Purpose</span>
                <input v-model="filters.purpose" class="ot-input" type="search" placeholder="purpose (exact)…" /></label>
            <label class="ot-search"><span class="visually-hidden">Outcome</span>
                <input v-model="filters.outcome" class="ot-input" type="search" placeholder="outcome (exact)…" /></label>
            <span v-if="filters.jobId" class="ot-chip info">job #{{ filters.jobId }}</span>
            <button v-if="activeCount" class="ot-filterchip" type="button" @click="clearFilters">Clear filters <span class="x" aria-hidden="true">✕</span></button>
            <div class="grow"></div>
        </div>

        <div class="ot-kpis">
            <OmniTraderKpi label="Calls" :value="omniCount(total.calls)" :loading="summary.loading.value" :foot="windowLabel" />
            <OmniTraderKpi label="Failed" :value="omniCount(total.failed)" :loading="summary.loading.value" :tone="total.failed ? 'warn' : 'good'"
                           :foot="total.calls ? omniPercent(total.failed / total.calls, 1) + ' of calls' : undefined" />
            <OmniTraderKpi label="Prompt tokens" :value="omniCompact(total.promptTokens)" :loading="summary.loading.value" />
            <OmniTraderKpi label="Served from cache" :value="total.promptTokens ? omniPercent(total.cachedTokens / total.promptTokens) : '—'"
                           :loading="summary.loading.value" :tone="cacheTone"
                           help="Cached prompt tokens ÷ prompt tokens. A low rate is what got an AIRouter key suspended; background work pauses itself below the floor." />
            <OmniTraderKpi label="Output tokens" :value="omniCompact(total.completionTokens)" :loading="summary.loading.value" />
        </div>

        <OmniscienceV3Panel title="Breakdown" :subtitle="`Grouped by ${groupLabel.toLowerCase()}, ${windowLabel}.`" flush
                            :loading="summary.loading.value" :error="summary.error.value" :has-data="!!summary.data.value"
                            :empty="!summaryRows.length" empty-title="No calls in this window" @retry="summary.refresh()">
            <template #controls>
                <div class="ot-segment sm" role="group" aria-label="Group by">
                    <button v-for="g in GROUPS" :key="g.value" type="button" :aria-pressed="filters.groupBy === g.value" @click="filters.groupBy = g.value">{{ g.label }}</button>
                </div>
            </template>
            <OmniTraderDataTable :rows="summaryRows" :columns="summaryColumns" :row-key="r => r.key" label="groups" bare max-height="360px" default-sort="calls"
                                 selectable @select="drill($event)">
                <template #cell-failed="{ row }"><span :class="row.failed ? 'neg' : 'omni-muted'">{{ omniCount(row.failed) }}</span></template>
                <template #cell-promptTokens="{ row }">{{ omniCompact(row.promptTokens) }}</template>
                <template #cell-cacheHitRate="{ row }">{{ omniPercent(row.cacheHitRate) }}</template>
                <template #cell-completionTokens="{ row }">{{ omniCompact(row.completionTokens) }}</template>
                <template #cell-p50LatencyMs="{ row }">{{ omniDuration(row.p50LatencyMs) }}</template>
                <template #cell-p95LatencyMs="{ row }">{{ omniDuration(row.p95LatencyMs) }}</template>
                <template #cell-lastAtMs="{ row }"><OmniscienceV3Time :ms="row.lastAtMs" mode="age" /></template>
            </OmniTraderDataTable>
        </OmniscienceV3Panel>

        <OmniscienceV3Panel title="Calls" subtitle="Newest first." flush style="margin-top: var(--ot-gutter)"
                            :loading="calls.loading.value" :error="calls.error.value" :has-data="calls.items.value.length > 0"
                            :empty="!calls.items.value.length" :empty-kind="activeCount ? 'filtered' : 'empty'"
                            empty-title="No calls match" @retry="calls.reload()">
            <OmniTraderDataTable :rows="calls.items.value" :columns="callColumns" :row-key="r => String(r.callId)" label="calls" :searchable="false" pinned
                                 selectable :selected-key="selected ? String(selected.callId) : null" default-sort="callId" max-height="none"
                                 :row-class="r => (r.outcome === 'ok' ? '' : 'attention')" @select="selected = $event">
                <template #cell-atMs="{ row }"><OmniscienceV3Time :ms="row.atMs" mode="age" /></template>
                <template #cell-purpose="{ row }">
                    <span class="cellstack"><span>{{ row.purpose }}</span><span class="sub omni-mono">{{ row.moduleId }}</span></span>
                </template>
                <template #cell-outcome="{ row }"><span class="ot-chip" :class="row.outcome === 'ok' ? 'ok' : 'bad'">{{ row.outcome }}</span></template>
                <template #cell-promptTokens="{ row }">{{ omniCompact(row.promptTokens) }}</template>
                <template #cell-cached="{ row }">{{ row.promptTokens ? omniPercent((row.cachedTokens ?? 0) / row.promptTokens) : '—' }}</template>
                <template #cell-completionTokens="{ row }">{{ omniCompact(row.completionTokens) }}</template>
                <template #cell-latencyMs="{ row }">{{ omniDuration(row.latencyMs) }}</template>
            </OmniTraderDataTable>
            <template v-if="calls.hasMore.value" #footer>
                <button class="ot-btn sm" type="button" :disabled="calls.loadingMore.value" @click="calls.loadMore()">
                    {{ calls.loadingMore.value ? 'Loading…' : 'Load older calls' }}
                </button>
            </template>
        </OmniscienceV3Panel>

        <OmniTraderDrawer :open="!!selected" :title="selected ? `Call #${selected.callId}` : ''" :subtitle="selected ? `${selected.moduleId} · ${selected.purpose}` : ''" @close="selected = null">
            <template v-if="selected">
                <div class="omni-row">
                    <span class="ot-chip" :class="selected.outcome === 'ok' ? 'ok' : 'bad'">{{ selected.outcome }}</span>
                    <span v-if="selected.workClass" class="ot-chip">{{ selected.workClass }}</span>
                </div>
                <div v-if="selected.error" class="ot-banner" role="alert">
                    <span class="glyph" aria-hidden="true">⚠</span><div class="omni-wrap">{{ selected.error }}</div>
                </div>
                <dl class="ot-kv omni-section">
                    <dt>When</dt><dd><OmniscienceV3Time :ms="selected.atMs" seconds /></dd>
                    <dt>Model</dt><dd>{{ selected.model ?? '—' }}</dd>
                    <dt>Provider</dt><dd>{{ selected.provider ?? '—' }}</dd>
                    <dt>Prompt version</dt><dd>{{ selected.promptVersion ?? '—' }}</dd>
                    <dt>Prompt tokens</dt><dd>{{ omniCount(selected.promptTokens) }}</dd>
                    <dt>Cached tokens</dt><dd>{{ omniCount(selected.cachedTokens) }}</dd>
                    <dt>Output tokens</dt><dd>{{ omniCount(selected.completionTokens) }}</dd>
                    <dt>Request size</dt><dd>{{ omniBytes(selected.requestBytes) }}</dd>
                    <dt>Latency</dt><dd>{{ omniDuration(selected.latencyMs) }}</dd>
                    <dt>Finish reason</dt><dd>{{ selected.finishReason ?? '—' }}</dd>
                    <dt>Job</dt>
                    <dd><NuxtLink v-if="selected.jobId" :to="`${OMNI_BASE}/jobs?job=${selected.jobId}`">#{{ selected.jobId }}</NuxtLink><template v-else>—</template></dd>
                </dl>
            </template>
        </OmniTraderDrawer>
    </OmniscienceV3Shell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { OMNI_BASE, omniGet } from '~/scripts/omniscience/api';
import type { LlmCallDto, LlmCallPage, LlmGroupBy, LlmSummaryDto, LlmSummaryRowDto } from '~/scripts/omniscience/contracts';
import { omniBytes, omniCompact, omniCount, omniDuration, omniPercent } from '~/scripts/omniscience/format';
import { useOmniDebounced, useOmniEngine, useOmniPaged, useOmniResource } from '~/composables/useOmniscienceV3';
import { useUrlState } from '~/composables/useOmniTrader';
import type { TableColumn } from '~/components/OmniTrader/DataTable.vue';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Omniscience v3 · LLM' });

const WINDOWS = [
    { value: '1h', label: '1 h', ms: 3_600_000 }, { value: '24h', label: '24 h', ms: 86_400_000 },
    { value: '7d', label: '7 d', ms: 7 * 86_400_000 }, { value: 'all', label: 'All', ms: 0 },
];
const GROUPS: { value: LlmGroupBy; label: string }[] = [
    { value: 'WorkClass', label: 'Work class' }, { value: 'Module', label: 'Module' }, { value: 'Purpose', label: 'Purpose' },
    { value: 'Model', label: 'Model' }, { value: 'Outcome', label: 'Outcome' },
];
/** Which call filter a breakdown row narrows to when clicked. */
const GROUP_FILTER: Record<LlmGroupBy, 'workClass' | 'module' | 'purpose' | 'outcome' | null> = {
    WorkClass: 'workClass', Module: 'module', Purpose: 'purpose', Outcome: 'outcome', Model: null,
};

const { status } = useOmniEngine();
const { state: filters } = useUrlState({ window: '24h', groupBy: 'WorkClass', module: '', workClass: '', purpose: '', outcome: '', jobId: '' });
const selected = ref<LlmCallDto | null>(null);

const moduleIds = computed(() => (status.value?.modules ?? []).map(m => m.moduleId).sort());
const workClasses = computed(() => {
    // Only classes that have actually been used: the filter is an exact match on what was logged.
    const seen = new Set<string>();
    for (const row of status.value?.llm?.lastHourByWorkClass ?? []) seen.add(row.key);
    if (filters.groupBy === 'WorkClass') for (const row of summaryRows.value) seen.add(row.key);
    if (filters.workClass) seen.add(filters.workClass);
    return [...seen].sort();
});
const windowDef = computed(() => WINDOWS.find(w => w.value === filters.window) ?? WINDOWS[1]!);
const windowLabel = computed(() => (windowDef.value.ms ? `last ${windowDef.value.label}` : 'all time'));
const groupLabel = computed(() => GROUPS.find(g => g.value === filters.groupBy)?.label ?? 'Work class');
const from = () => (windowDef.value.ms ? Date.now() - windowDef.value.ms : null);

const CALL_FILTERS = ['module', 'workClass', 'purpose', 'outcome', 'jobId'] as const;
const activeCount = computed(() => CALL_FILTERS.filter(k => filters[k] !== '').length);
function clearFilters() { for (const k of CALL_FILTERS) filters[k] = ''; }

const summary = useOmniResource(signal => omniGet<LlmSummaryDto>('llm/summary', {
    from: from(), groupBy: filters.groupBy, module: filters.module, workClass: filters.workClass,
}, signal));
const summaryRows = computed<LlmSummaryRowDto[]>(() => summary.data.value?.rows ?? []);

const calls = useOmniPaged<LlmCallDto, number>((cursor, signal) => omniGet<LlmCallPage>('llm/calls', {
    from: from(), module: filters.module, workClass: filters.workClass, purpose: filters.purpose, outcome: filters.outcome,
    jobId: filters.jobId, cursor, limit: 100,
}, signal));

const total = computed(() => summaryRows.value.reduce(
    (sum, r) => ({
        calls: sum.calls + r.calls, failed: sum.failed + r.failed, promptTokens: sum.promptTokens + r.promptTokens,
        cachedTokens: sum.cachedTokens + r.cachedTokens, completionTokens: sum.completionTokens + r.completionTokens,
    }),
    { calls: 0, failed: 0, promptTokens: 0, cachedTokens: 0, completionTokens: 0 }));
const cacheTone = computed(() => {
    if (!total.value.promptTokens) return '';
    const rate = total.value.cachedTokens / total.value.promptTokens;
    return rate >= 0.7 ? 'good' : rate >= 0.4 ? 'warn' : 'bad';
});

function reloadAll() { void summary.refresh(); void calls.reload(); }
useOmniDebounced(() => [filters.window, filters.groupBy, filters.module, filters.workClass].join('\u0001'), () => { void summary.refresh(); });
useOmniDebounced(() => [filters.window, ...CALL_FILTERS.map(k => filters[k])].join('\u0001'), () => { void calls.reload(); });

function drill(row: LlmSummaryRowDto) {
    const key = GROUP_FILTER[filters.groupBy as LlmGroupBy];
    if (key) filters[key] = row.key;
}

const summaryColumns: TableColumn[] = [
    { key: 'key', label: 'Group' },
    { key: 'calls', label: 'Calls', num: true },
    { key: 'failed', label: 'Failed', num: true },
    { key: 'promptTokens', label: 'Prompt', num: true },
    { key: 'cacheHitRate', label: 'Cached', num: true },
    { key: 'completionTokens', label: 'Output', num: true },
    { key: 'p50LatencyMs', label: 'p50', num: true },
    { key: 'p95LatencyMs', label: 'p95', num: true },
    { key: 'lastAtMs', label: 'Last call', num: true },
];
const callColumns: TableColumn[] = [
    { key: 'atMs', label: 'When' },
    { key: 'purpose', label: 'Purpose' },
    { key: 'workClass', label: 'Class' },
    { key: 'model', label: 'Model', optional: true },
    { key: 'outcome', label: 'Outcome' },
    { key: 'promptTokens', label: 'Prompt', num: true },
    { key: 'cached', label: 'Cached', num: true, sortValue: r => (r.promptTokens ? (r.cachedTokens ?? 0) / r.promptTokens : -1) },
    { key: 'completionTokens', label: 'Output', num: true },
    { key: 'latencyMs', label: 'Latency', num: true },
];
</script>
