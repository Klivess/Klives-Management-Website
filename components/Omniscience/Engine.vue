<template>
    <div data-testid="omx-engine">
        <div class="omx-head">
            <div><h1>Engine</h1><p>What Omniscience is doing with the messages it holds: reading them into facts, writing dossiers, collecting from sources.</p></div>
            <div class="omx-head-actions">
                <button class="omx-btn" type="button" :disabled="!!omx.busy.value" data-testid="omx-run-deduction" @click="omx.run('deduction')"><OmniscienceIcon name="play" /> Run deduction</button>
                <button class="omx-btn" type="button" :disabled="!!omx.busy.value || !!omx.schedule.value?.running" @click="omx.run('profiler')"><OmniscienceIcon name="play" /> {{ omx.schedule.value?.running ? 'Profiler running' : 'Run profiler' }}</button>
                <button class="omx-btn" type="button" :disabled="!!omx.busy.value" @click="omx.run('briefing')"><OmniscienceIcon name="send" /> Send briefing</button>
            </div>
        </div>

        <div class="omx-grid">
            <div class="omx-stack">
                <section v-if="issues.length" class="omx-card attn" data-testid="omx-engine-issues">
                    <div class="omx-card-head"><h2>Needs a look</h2><span class="omx-sub">{{ issues.length }}</span></div>
                    <ul class="omx-rows"><li v-for="n in issues" :key="n.id"><span class="omx-dot" :class="n.tone"></span><div class="omx-row-main"><strong>{{ n.title }}</strong><small class="wrap">{{ n.detail }}</small></div></li></ul>
                </section>

                <section class="omx-card" data-testid="omx-pipeline">
                    <div class="omx-card-head"><h2>Deduction</h2><span class="omx-sub">messages → facts → relationships</span></div>
                    <div class="omx-card-body">
                        <div class="omx-kpis" style="margin-bottom: 0; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr))">
                            <div v-for="k in pipeline" :key="k.label" class="omx-kpi" :class="{ warn: k.warn }"><span class="omx-kpi-label">{{ k.label }}</span><span class="omx-kpi-value" style="font-size: 19px">{{ omxCompact(k.value) }}</span><span class="omx-kpi-sub">{{ k.sub }}</span></div>
                        </div>
                        <p v-if="d?.last_extraction_summary" class="omx-dim" style="margin-top: 12px">Last pass: {{ d.last_extraction_summary }}</p>
                    </div>
                </section>

                <section class="omx-card" data-testid="omx-health">
                    <div class="omx-card-head">
                        <h2>Data health</h2>
                        <span v-if="hp" class="omx-chip" :class="hp.status === 'healthy' ? 'ok' : 'warn'">{{ hp.status === 'healthy' ? 'all well' : 'needs a look' }}</span>
                        <span v-if="hp" class="omx-sub">checked {{ omxAgo(hp.checked_at, omx.now.value) }}</span>
                        <div class="omx-acts"><button class="omx-btn sm" type="button" :disabled="omx.healthState.loading" @click="omx.loadHealth()">{{ omx.healthState.loading ? 'Checking…' : 'Check now' }}</button></div>
                    </div>
                    <div class="omx-card-body">
                        <div v-if="omx.healthState.error" class="omx-error" role="alert"><span class="omx-grow">{{ omx.healthState.error }}</span></div>
                        <div v-else-if="!hp" class="omx-skels" style="padding: 0"><div class="omx-skel" style="width: 62%"></div><div class="omx-skel" style="width: 44%"></div><p class="omx-dim">The checks count through the store; the first answer can take a moment.</p></div>
                        <template v-else>
                            <ul v-if="(hp.warnings ?? []).length" style="margin-bottom: 10px"><li v-for="(w, i) in hp.warnings" :key="i" class="omx-note" style="margin-bottom: 6px">{{ w }}</li></ul>
                            <dl class="omx-kv">
                                <dt>Newest message</dt><dd>{{ omxDateTime(hp.metrics?.latest_message_at) }} <span class="omx-dim">({{ omxAgo(hp.metrics?.latest_message_at, omx.now.value) }})</span></dd>
                                <dt>Messages</dt><dd class="omx-num">{{ omxNum(hp.metrics?.messages) }} · {{ omxNum(hp.metrics?.tracked_messages) }} from tracked people</dd>
                                <dt>Searchable by meaning</dt>
                                <dd>
                                    <template v-if="hp.metrics?.tracked_embedding_counting">counting… <span class="omx-dim">(asked again in a few seconds)</span></template>
                                    <template v-else>{{ omxNum(hp.metrics?.tracked_embedded) }} of tracked people's messages<template v-if="hp.metrics?.tracked_embedding_coverage_pct != null"> ({{ Math.round(hp.metrics.tracked_embedding_coverage_pct) }}%)</template></template>
                                </dd>
                                <dt>Replicas</dt><dd>{{ omxNum(hp.metrics?.replicas_ready) }} ready · {{ omxNum(hp.metrics?.replica_eras) }} eras · <span :style="{ color: Number(hp.metrics?.failed_replica_jobs_7d) > 0 ? 'var(--omx-warn)' : undefined }">{{ omxNum(hp.metrics?.failed_replica_jobs_7d) }} failed jobs in 7 days</span></dd>
                                <dt>Reply pairs</dt><dd class="omx-num">{{ omxNum(hp.metrics?.stimulus_reply_pairs) }}</dd>
                            </dl>
                        </template>
                    </div>
                </section>
            </div>

            <div class="omx-stack">
                <section class="omx-card" data-testid="omx-profiler">
                    <div class="omx-card-head"><h2>Profiler</h2><span class="omx-dot" :class="omx.schedule.value?.running ? 'busy' : profilerBad ? 'warn' : 'ok'"></span><span class="omx-sub">{{ omx.schedule.value?.running ? 'writing dossiers now' : 'idle' }}</span></div>
                    <div class="omx-card-body">
                        <dl class="omx-kv">
                            <dt>Last started</dt><dd>{{ omxDateTime(omx.schedule.value?.last_run_started_at) }}</dd>
                            <dt>Last finished</dt><dd>{{ omxDateTime(omx.schedule.value?.last_run_finished_at) }}</dd>
                            <dt>Outcome</dt><dd :style="{ color: profilerBad ? 'var(--omx-warn)' : undefined }">{{ omx.schedule.value?.last_run_status || OMX_DASH }}</dd>
                            <template v-for="(value, key) in job" :key="key"><dt>{{ String(key).replace(/_/g, ' ') }}</dt><dd class="omx-wrap">{{ value }}</dd></template>
                        </dl>
                    </div>
                </section>

                <section class="omx-card" data-testid="omx-sources">
                    <div class="omx-card-head"><h2>Sources</h2><span class="omx-sub">{{ omx.sources.value ? `${omx.sources.value.length} linked` : '' }}</span></div>
                    <ul v-if="(omx.sources.value ?? []).length" class="omx-rows">
                        <li v-for="s in omx.sources.value!" :key="s.source_id">
                            <span class="omx-dot" :class="s.status === 'active' ? 'ok' : 'crit'"></span>
                            <div class="omx-row-main"><strong>{{ s.self_username || s.label || s.platform }}</strong><small class="wrap">{{ s.platform }} · {{ s.status }} · last event {{ omxAgo(s.last_event_at, omx.now.value) }}<template v-if="s.last_status_message"> · {{ s.last_status_message }}</template></small></div>
                            <div class="omx-row-acts">
                                <button class="omx-btn sm" type="button" :disabled="!!omx.busy.value" title="Read this account's history again" @click="omx.backfillSource(s)">Backfill</button>
                                <button class="omx-btn sm danger icon" type="button" :aria-label="`Remove ${s.self_username || s.label || s.platform}`" @click="omx.removeSource(s)"><OmniscienceIcon name="trash" /></button>
                            </div>
                        </li>
                    </ul>
                    <div v-else class="omx-empty">{{ omx.sources.value ? 'No dedicated source is linked. Feeds from other services may still be arriving.' : 'Reading…' }}</div>
                    <form class="omx-card-body omx-stack" style="border-top: 1px solid var(--omx-line)" @submit.prevent="addSource()">
                        <div class="omx-h" style="margin: 0">Link a Discord account</div>
                        <input v-model="source.label" class="omx-input" maxlength="80" placeholder="A name for it (optional)" aria-label="Source name" />
                        <input v-model="source.token" class="omx-input" type="password" autocomplete="new-password" placeholder="Account token" aria-label="Account token" />
                        <p class="omx-dim" style="font-size: 12px">The token is sent once and never shown again.</p>
                        <button class="omx-btn primary" type="submit" :disabled="!source.token || !!omx.busy.value">Link it</button>
                    </form>
                </section>

                <section class="omx-card">
                    <div class="omx-card-head"><h2>Activity counts</h2><span class="omx-chip" :class="activityTone">{{ activityWord }}</span></div>
                    <div class="omx-card-body"><p class="omx-dim">Per-person message counts behind the People list.<template v-if="omx.activity.value?.completed_at"> Last rebuilt {{ omxAgo(omx.activity.value.completed_at, omx.now.value) }}.</template><template v-if="omx.activity.value?.last_error"> Error: {{ omx.activity.value.last_error }}</template></p></div>
                </section>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { OMX_DASH, omxAgo, omxCompact, omxDateTime, omxNum } from '~/scripts/omniscienceConsole';

/** The engine room: the deduction pipeline, the profiler, where messages come from, and whether the data is whole. */
const omx = useOmx();
const source = reactive({ label: '', token: '' });
const d = computed(() => omx.deduction.value);
const hp = computed(() => omx.health.value);
const issues = computed(() => omx.needs.value.filter(n => n.view === 'engine'));

const pipeline = computed(() => [
    { label: 'Facts', value: d.value?.facts_active, sub: 'in force' },
    { label: 'Q&A pairs', value: d.value?.qa_pairs, sub: 'question and answer' },
    { label: 'Entities', value: d.value?.entities, sub: 'people, places, things' },
    { label: 'Guesses', value: d.value?.open_hypotheses, sub: 'being watched' },
    { label: 'Windows read', value: d.value?.windows_extracted, sub: 'stretches of chat' },
    { label: 'Awaiting graph', value: d.value?.windows_pending_graph, sub: 'windows', warn: Number(d.value?.windows_pending_graph ?? 0) >= 200 },
    { label: 'Reply pairs', value: d.value?.stimulus_reply_pairs, sub: 'for replicas' },
]);
const profilerBad = computed(() => /fail|error/i.test(String(omx.schedule.value?.last_run_status ?? '')));
/** Whatever the running job reports about itself, shown as it is (only its plain values). */
const job = computed<Record<string, string>>(() => {
    const current = omx.schedule.value?.current_job;
    if (!current || typeof current !== 'object') return {};
    return Object.fromEntries(Object.entries(current).filter(([, v]) => v !== null && typeof v !== 'object').slice(0, 8).map(([k, v]) => [k, String(v)]));
});
const activityWord = computed(() => { const a = omx.activity.value; return !a ? 'unknown' : a.last_error ? 'error' : a.running ? 'rebuilding' : a.ready === false ? 'not ready' : 'ready'; });
const activityTone = computed(() => (activityWord.value === 'ready' ? 'ok' : activityWord.value === 'rebuilding' ? 'info' : activityWord.value === 'unknown' ? '' : 'warn'));

async function addSource() {
    if (await omx.addSource({ label: source.label.trim(), token: source.token })) { source.label = ''; source.token = ''; }
}

// The embedding count is worked out in the background on a cold server: ask again while it says "counting".
let recheck: ReturnType<typeof setTimeout> | null = null;
let rechecks = 0;
watch(() => omx.health.value?.metrics?.tracked_embedding_counting, counting => {
    if (recheck) clearTimeout(recheck);
    if (counting && rechecks < 12) recheck = setTimeout(() => { rechecks++; void omx.loadHealth(); }, 10_000);
});
onMounted(() => { if (!omx.health.value) void omx.loadHealth(); void omx.refreshSlow(); });
onBeforeUnmount(() => { if (recheck) clearTimeout(recheck); });
</script>
