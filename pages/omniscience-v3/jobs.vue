<template>
    <OmniscienceV3Shell>
        <div class="omni-pagehead">
            <div>
                <h1>Jobs</h1>
                <p class="subtitle">All background work is a durable job: leased, retried with backoff, and parked as “dead” after its last attempt.</p>
            </div>
            <div class="omni-actions">
                <span class="omni-muted" v-if="jobs.loadedAt.value">updated <OmniscienceV3Time :ms="jobs.loadedAt.value" mode="age" /></span>
                <button class="omni-btn ghost" type="button" :disabled="jobs.loading.value" @click="jobs.reload()">Refresh</button>
            </div>
        </div>

        <div class="omni-filterbar">
            <div class="omni-segment" role="group" aria-label="Job state">
                <button v-for="s in STATES" :key="s.value" type="button" :aria-pressed="filters.state === s.value" @click="filters.state = s.value">{{ s.label }}</button>
            </div>
            <select v-model="filters.lane" class="omni-select auto" aria-label="Lane">
                <option value="">All lanes</option>
                <option v-for="l in LANES" :key="l" :value="l">{{ l }}</option>
            </select>
            <select v-model="filters.module" class="omni-select auto" aria-label="Module">
                <option value="">All modules</option>
                <option v-for="m in moduleIds" :key="m" :value="m">{{ m }}</option>
            </select>
            <label class="omni-search">
                <span class="visually-hidden">Job kind</span>
                <input v-model="filters.kind" class="omni-input" type="search" placeholder="kind (exact)…" />
            </label>
            <label class="omni-search">
                <span class="visually-hidden">Subject id</span>
                <input v-model="filters.subjectId" class="omni-input" type="search" placeholder="subject id…" />
            </label>
            <span class="summary"><b>{{ jobs.items.value.length }}</b> loaded{{ jobs.hasMore.value ? ', more available' : '' }}</span>
            <button v-if="activeCount" class="omni-filterchip" type="button" @click="clearFilters">Clear filters <span class="x" aria-hidden="true">✕</span></button>
            <div class="grow"></div>
            <!-- Dead jobs are retried one at a time from the job's own panel; after a fix has been deployed that is one visit per job. -->
            <button v-if="canManage && filters.state === 'dead' && jobs.items.value.length" class="omni-btn primary sm" type="button" :disabled="busy !== null"
                    data-testid="retry-dead" @click="retryDead">{{ filters.module ? `Retry all dead ${filters.module} jobs` : 'Retry all dead jobs' }}</button>
        </div>

        <OmniscienceV3Panel title="Jobs" flush :loading="jobs.loading.value" :error="jobs.error.value" :has-data="jobs.items.value.length > 0"
                            :empty="!jobs.items.value.length" :empty-kind="activeCount ? 'filtered' : 'empty'"
                            :empty-title="activeCount ? 'No jobs match these filters' : 'No jobs yet'"
                            :empty-text="filters.state === 'dead' ? 'Nothing has failed every attempt.' : undefined" @retry="jobs.reload()">
            <OmniscienceV3DataTable :rows="jobs.items.value" :columns="columns" :row-key="r => String(r.jobId)" label="jobs" :searchable="false" pinned selectable
                                 :selected-key="filters.job || null" default-sort="jobId" max-height="none"
                                 :row-class="r => (r.state === 'dead' ? 'attention' : '')" @select="filters.job = String($event.jobId)">
                <template #cell-jobId="{ row }"><span class="omni-mono">#{{ row.jobId }}</span></template>
                <template #cell-kind="{ row }">
                    <span class="cellstack">
                        <span>{{ row.kind }}</span>
                        <span class="sub omni-mono">{{ row.moduleId }}<template v-if="row.subjectId"> · {{ row.subjectKind }} {{ row.subjectId }}</template></span>
                    </span>
                </template>
                <template #cell-state="{ row }"><span class="omni-chip" :class="omniStateTone(row.state)">{{ row.state }}</span></template>
                <template #cell-attempts="{ row }">{{ row.attempts }} / {{ row.maxAttempts }}</template>
                <template #cell-createdAtMs="{ row }"><OmniscienceV3Time :ms="row.createdAtMs" mode="age" /></template>
                <template #cell-took="{ row }">{{ took(row) }}</template>
                <template #cell-errorClass="{ row }">
                    <span v-if="row.errorClass" class="neg" :title="row.errorMessage ?? ''">{{ row.errorClass }}</span>
                    <span v-else class="omni-muted">—</span>
                </template>
            </OmniscienceV3DataTable>
            <template v-if="jobs.hasMore.value" #footer>
                <button class="omni-btn sm" type="button" :disabled="jobs.loadingMore.value" @click="jobs.loadMore()">
                    {{ jobs.loadingMore.value ? 'Loading…' : 'Load older jobs' }}
                </button>
            </template>
        </OmniscienceV3Panel>

        <OmniscienceV3Drawer :open="!!filters.job" :title="detail.data.value ? `Job #${detail.data.value.jobId} · ${detail.data.value.kind}` : `Job #${filters.job}`"
                          :subtitle="detail.data.value?.moduleId" wide @close="filters.job = ''">
            <OmniscienceV3ErrorBlock v-if="detail.error.value && !detail.data.value" :error="detail.error.value" what="This job" @retry="detail.refresh()" />
            <div v-else-if="!detail.data.value" class="omni-skelrows" aria-busy="true"><div v-for="n in 6" :key="n" class="omni-skel"></div></div>
            <template v-else>
                <div class="omni-row">
                    <span class="omni-chip" :class="omniStateTone(job!.state)">{{ job!.state }}</span>
                    <span class="omni-chip">{{ job!.lane }}</span>
                    <span class="omni-muted">attempt {{ job!.attempts }} of {{ job!.maxAttempts }} · priority {{ job!.priority }}</span>
                    <span style="flex:1"></span>
                    <template v-if="canManage">
                        <button v-if="job!.state === 'queued' || job!.state === 'leased'" class="omni-btn warn sm" type="button" :disabled="busy !== null" @click="act('cancel')">Cancel</button>
                        <button v-if="job!.state === 'dead' || job!.state === 'cancelled'" class="omni-btn primary sm" type="button" :disabled="busy !== null" @click="act('retry')">Retry</button>
                    </template>
                </div>

                <div v-if="job!.errorMessage" class="omni-banner" role="alert">
                    <span class="glyph" aria-hidden="true">⚠</span>
                    <div><strong>{{ job!.errorClass ?? 'Error' }}</strong><span class="muted omni-wrap">{{ job!.errorMessage }}</span></div>
                </div>

                <section class="omni-section">
                    <h4>Timing</h4>
                    <dl class="omni-kv">
                        <dt>Created</dt><dd><OmniscienceV3Time :ms="job!.createdAtMs" seconds /></dd>
                        <dt>Not before</dt><dd><OmniscienceV3Time :ms="job!.notBeforeMs" seconds /></dd>
                        <dt>Started</dt><dd><OmniscienceV3Time :ms="job!.startedAtMs" seconds /></dd>
                        <dt>Finished</dt><dd><OmniscienceV3Time :ms="job!.finishedAtMs" seconds /></dd>
                        <dt>Took</dt><dd>{{ took(job!) }}</dd>
                        <dt>Lease</dt>
                        <dd v-if="job!.leaseOwner">{{ job!.leaseOwner }}, expires <OmniscienceV3Time :ms="job!.leaseExpiresMs" mode="age" /></dd>
                        <dd v-else class="omni-muted">not leased</dd>
                    </dl>
                </section>

                <section class="omni-section">
                    <h4>Identity</h4>
                    <dl class="omni-kv">
                        <dt>Subject</dt><dd>{{ job!.subjectId ? `${job!.subjectKind} ${job!.subjectId}` : '—' }}</dd>
                        <dt>Dedupe key</dt><dd>{{ job!.dedupeKey ?? '—' }}</dd>
                        <dt>Parent job</dt>
                        <dd><a v-if="job!.parentJobId" href="#" @click.prevent="filters.job = String(job!.parentJobId)">#{{ job!.parentJobId }}</a><template v-else>—</template></dd>
                        <dt>Tactic run</dt>
                        <dd><NuxtLink v-if="job!.runId" :to="`${OMNI_BASE}/tactics?run=${encodeURIComponent(job!.runId)}`">{{ job!.runId }}</NuxtLink><template v-else>—</template></dd>
                    </dl>
                    <div class="omni-row" style="margin-top:8px">
                        <NuxtLink class="omni-btn ghost sm" :to="`${OMNI_BASE}/jobs?parentJobId=${job!.jobId}`">Child jobs</NuxtLink>
                        <NuxtLink class="omni-btn ghost sm" :to="`${OMNI_BASE}/llm?jobId=${job!.jobId}`">LLM calls of this job</NuxtLink>
                    </div>
                </section>

                <section class="omni-section"><h4>Progress</h4><OmniscienceV3Json :value="job!.progressJson" /></section>
                <section class="omni-section"><h4>Payload</h4><OmniscienceV3Json :value="job!.payloadJson" /></section>
                <section class="omni-section"><h4>Result</h4><OmniscienceV3Json :value="job!.resultJson" /></section>
            </template>
        </OmniscienceV3Drawer>
    </OmniscienceV3Shell>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { OMNI_BASE, omniGet, omniPost } from '~/scripts/omniscience/api';
import type { DeadJobsRetriedDto, JobActionResultDto, JobPage, JobRecord, Lane } from '~/scripts/omniscience/contracts';
import { omniDuration, omniStateTone } from '~/scripts/omniscience/format';
import { useOmniAction, useOmniDebounced, useOmniEngine, useOmniPaged, useOmniResource, useOmniTime } from '~/composables/useOmniscienceV3';
import { useOmniUrlState } from '~/composables/useOmniscienceV3';
import { useAccess } from '~/composables/useAccess';
import type { TableColumn } from '~/components/OmniscienceV3/DataTable.vue';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Omniscience v3 · Jobs' });

const STATES = [
    { value: '', label: 'All' }, { value: 'queued', label: 'Queued' }, { value: 'leased', label: 'Running' },
    { value: 'succeeded', label: 'Succeeded' }, { value: 'dead', label: 'Dead' }, { value: 'cancelled', label: 'Cancelled' },
];
const LANES: Lane[] = ['Cpu', 'Io', 'LlmBackground', 'LlmInteractive', 'Coordinator'];

const { can } = useAccess();
const canManage = computed(() => can('omniscience.engine.manage'));
const { status, refreshStatus } = useOmniEngine();
const { now } = useOmniTime();
const { busy, run } = useOmniAction();
const { state: filters } = useOmniUrlState({ state: '', lane: '', module: '', kind: '', subjectId: '', runId: '', parentJobId: '', errorClass: '', job: '' });

const moduleIds = computed(() => (status.value?.modules ?? []).map(m => m.moduleId).sort());
const FILTER_KEYS = ['state', 'lane', 'module', 'kind', 'subjectId', 'runId', 'parentJobId', 'errorClass'] as const;
const activeCount = computed(() => FILTER_KEYS.filter(k => filters[k] !== '').length);
function clearFilters() { for (const k of FILTER_KEYS) filters[k] = ''; }

const jobs = useOmniPaged<JobRecord, number>((cursor, signal) => omniGet<JobPage>('jobs', {
    state: filters.state, lane: filters.lane, module: filters.module, kind: filters.kind, subjectId: filters.subjectId,
    runId: filters.runId, parentJobId: filters.parentJobId, errorClass: filters.errorClass, cursor, limit: 100,
}, signal), { pollMs: 10_000 });

useOmniDebounced(() => FILTER_KEYS.map(k => filters[k]).join('\u0001'), () => { void jobs.reload(); });

const detail = useOmniResource<JobRecord | null>(
    signal => (filters.job ? omniGet<JobRecord>('jobs/get', { id: filters.job }, signal) : Promise.resolve(null)),
    { immediate: false });
const job = computed(() => detail.data.value);
watch(() => filters.job, id => {
    detail.data.value = null;
    detail.error.value = null;
    if (id) void detail.refresh();
}, { immediate: true });

function took(j: JobRecord): string {
    if (!j.startedAtMs) return '—';
    return omniDuration((j.finishedAtMs ?? now.value) - j.startedAtMs);
}

async function act(what: 'cancel' | 'retry') {
    const current = job.value;
    if (!current) return;
    const result = await run(`${what}:${current.jobId}`, () => omniPost<JobActionResultDto>(`jobs/${what}`, { jobId: current.jobId }),
        r => (r.changed ? `Job #${r.jobId} is now ${r.state}.` : `Job #${r.jobId} was already ${r.state}; nothing changed.`));
    if (!result) return;
    void detail.refresh();
    void jobs.reload(true);
    void refreshStatus();
}

/** Every dead job (of the module chosen, when one is) goes back in the queue; one whose work is already queued again is closed. */
async function retryDead() {
    const result = await run('retry-dead', () => omniPost<DeadJobsRetriedDto>('jobs/retry-dead', { moduleId: filters.module || null }),
        r => `${r.retried} job${r.retried === 1 ? '' : 's'} queued again${r.closed ? `; ${r.closed} closed, because the same work was already queued again` : ''}.`);
    if (!result) return;
    filters.job = '';
    void jobs.reload(true);
    void refreshStatus();
}

const columns: TableColumn[] = [
    { key: 'jobId', label: 'Job', width: '90px' },
    { key: 'kind', label: 'Kind', sortValue: r => `${r.kind} ${r.moduleId}` },
    { key: 'lane', label: 'Lane' },
    { key: 'state', label: 'State' },
    { key: 'attempts', label: 'Attempts', num: true },
    { key: 'createdAtMs', label: 'Created', num: true },
    { key: 'took', label: 'Took', num: true, sortValue: r => (r.startedAtMs ? (r.finishedAtMs ?? Date.now()) - r.startedAtMs : -1) },
    { key: 'errorClass', label: 'Error' },
];
</script>
