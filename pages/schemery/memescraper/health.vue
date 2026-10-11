<template>
    <MemeScraperShell>
        <div class="ot-pagehead">
            <div>
                <h1>Health</h1>
                <p class="subtitle">{{ overall.detail || overall.label }}</p>
            </div>
            <div v-if="can('memescraper.scrape.run')" class="ot-actions">
                <button class="ot-btn" :disabled="providerCheckRunning || actions.requesting.value || !health?.DataLoaded" @click="actions.checkProviders(defaultCheckUsername)">
                    {{ providerCheckRunning ? 'Checking providers…' : 'Check providers' }}
                </button>
                <button class="ot-btn" :disabled="actions.requesting.value || !health?.DataLoaded" @click="actions.scrapeAll(reelSources)">▶ Scrape all</button>
            </div>
        </div>

        <MemeScraperAttention show-server-note />

        <div class="ot-kpis ms-kpis6">
            <OmniTraderKpi label="Status" :value="overall.label" small :loading="!health" :tone="overallTone" :foot="health?.CurrentScrape ? health.CurrentScrape : schedulerText" />
            <OmniTraderKpi label="Next scrape" :value="nextScrapeText" small :loading="!health"
                           :foot="health ? `${nextDue ? `@${nextDue.Username} · ` : ''}every ${health.Settings?.IntervalHours ?? health.ScrapeIntervalHours} h${(health.ScrapeQueued ?? 0) > 0 ? ` · ${health.ScrapeQueued} queued` : ''}` : undefined" />
            <OmniTraderKpi label="Scrape success" :value="fmtRate(history?.Stats.SuccessRate)" :loading="!history"
                           :tone="history?.Stats.SuccessRate != null ? (history.Stats.SuccessRate < 75 ? 'bad' : history.Stats.SuccessRate < 90 ? 'warn' : 'good') : ''"
                           :foot="history ? `${history.Stats.Scrapes} runs · ${history.Stats.Failed} failed · ${history.Stats.Partial} partial` : undefined" />
            <OmniTraderKpi label="Run time" :value="fmtRunTime(history?.Stats.MedianSeconds)" :loading="!history"
                           :foot="history ? `median · ${history.Stats.NewReels.toLocaleString()} new reels found` : undefined" />
            <OmniTraderKpi label="Library on disk" :value="health?.Disk ? fmtBytes(health.Disk.Bytes) : '—'" :loading="!health"
                           :attention-soft="!!health?.Disk && health.Disk.MissingVideos > 0"
                           :foot="health?.Disk ? `${health.Disk.Files.toLocaleString()} videos${health.Disk.MissingVideos ? ` · ${health.Disk.MissingVideos} missing` : ''}${health.Disk.OrphanFiles ? ` · ${health.Disk.OrphanFiles} orphaned` : ''}` : 'measuring…'"
                           help="Video files in the media folder. Missing = a reel whose video file is gone; orphaned = a video no reel points at." />
            <OmniTraderKpi label="Failing sources" :value="health ? `${health.FailingSources}` : '—'" :loading="!health"
                           :tone="(health?.FailingSources ?? 0) > 0 ? 'bad' : ''" :to="(health?.FailingSources ?? 0) > 0 ? '/schemery/memescraper/sources?state=attention' : undefined"
                           :foot="health ? `of ${reelSources} downloading reels` : undefined" />
        </div>

        <div class="ms-pair ms-section">
            <OmniTraderCard title="Providers" subtitle="Inflact first; Instagram when inflact fails or returns nothing" :loading="!health" :empty="!health">
                <div v-if="health" class="providers">
                    <div v-for="p in health.Providers" :key="p.Name" class="provider" :class="providerTone(p)">
                        <div class="phead">
                            <div>
                                <strong>{{ providerLabel(p.Name) }}</strong>
                                <span class="role">{{ PROVIDER_ROLE[p.Name] ?? '' }}</span>
                            </div>
                            <span class="ot-chip" :class="providerTone(p)">{{ providerStatus(p) }}</span>
                        </div>
                        <dl class="ot-kv">
                            <dt>Last success</dt><dd>{{ fmtRel(p.LastSuccess, now) }}</dd>
                            <dt>Last failure</dt><dd>{{ fmtRel(p.LastFailure, now) }}</dd>
                            <dt>Runs</dt><dd>{{ p.TotalSuccesses }} ok · {{ p.TotalFailures }} failed <span class="muted">since the server started</span></dd>
                        </dl>
                        <p v-if="isBenched(p)" class="note warnc">Skipped until {{ fmtStamp(p.BenchedUntil) }} after {{ p.ConsecutiveFailures }} failures in a row. A passing provider check re-enables it at once.</p>
                        <p v-if="p.ConsecutiveFailures > 0 && p.LastError" class="note neg">{{ p.LastError }}</p>
                    </div>
                </div>
            </OmniTraderCard>

            <OmniTraderCard title="Provider check" :subtitle="check ? `On @${check.Username} · ${checkStateText}` : 'Tests each provider on its own and downloads one reel from each'"
                            :loading="!health" :empty="!health || !check" empty-title="No check run yet"
                            empty-text="A check runs inflact and Instagram separately against one account, so a breakage names the provider.">
                <template #controls>
                    <button v-if="can('memescraper.scrape.run')" class="ot-btn sm" :disabled="providerCheckRunning || actions.requesting.value" @click="actions.checkProviders(defaultCheckUsername)">
                        {{ providerCheckRunning ? 'Running…' : 'Run a check' }}
                    </button>
                </template>
                <template v-if="check">
                    <p v-if="!check.Results.length" class="muted">{{ check.State === 'queued' ? 'Waiting for the current scrape to finish…' : 'Testing inflact, then Instagram (about a minute)…' }}</p>
                    <div class="ot-rules">
                        <div v-for="r in check.Results" :key="r.Provider" class="ot-rule" :class="r.Ok ? 'pass' : 'hard'">
                            <span class="icon" aria-hidden="true">{{ r.Ok ? '✓' : '✕' }}</span>
                            <span class="name">{{ providerLabel(r.Provider) }}</span>
                            <span class="detail">
                                {{ r.Listed }} listed · {{ r.Reels }} usable · {{ r.Pages }} page{{ r.Pages === 1 ? '' : 's' }}
                                <template v-if="r.DownloadOk === true"> · test download {{ fmtBytes(r.DownloadBytes) }} from {{ r.DownloadHost }}</template>
                                <template v-else-if="r.DownloadOk === false"> · test download failed: {{ r.DownloadError }}</template>
                                <template v-if="r.Note"> · {{ r.Note }}</template>
                                <span v-if="r.Error" class="neg"> · {{ r.Error }}</span>
                            </span>
                            <span class="measure">{{ fmtRunTime(r.DurationMs / 1000) }}</span>
                        </div>
                    </div>
                    <p class="muted small">Requested by {{ check.RequestedBy }} · queued {{ fmtStamp(check.QueuedUtc) }}</p>
                </template>
            </OmniTraderCard>
        </div>

        <MemeScraperRangeBar :range-view="d?.Range" :options="d?.Options" :loading="loading || historyLoading" />

        <OmniTraderCard title="Scrape runs" :subtitle="runsSubtitle" :loading="!d" :empty="!d" class="ms-section">
            <template #controls>
                <label class="ot-check"><input v-model="showNewReels" type="checkbox" /> New reels found</label>
            </template>
            <MemeScraperStackedBars v-if="d" :buckets="runBuckets" :keys="['Succeeded', 'Failed']" :colours="['var(--ot-positive)', 'var(--ot-negative)']"
                                    :granularity="d.Range.Granularity" :height="200" unit="runs" :show-line="showNewReels" line-label="New reels found"
                                    line-colour="var(--ot-cat-1)" empty-title="No scrapes recorded in this window"
                                    empty-text="Scrape history is kept from this version on; older runs were never stored." @zoom="range.zoom" />
        </OmniTraderCard>

        <div class="ms-pair ms-section">
            <MemeScraperSettingsCard />
            <OmniTraderCard title="Coming up" subtitle="Sources by when they are next due" :loading="!health" :empty="!health || !queue.length" empty-title="Nothing scheduled" flush>
                <div class="ot-tablewrap" style="max-height:340px">
                    <table class="ot-table">
                        <thead><tr><th>Source</th><th>Due</th><th>Last run</th><th class="num">Fails</th></tr></thead>
                        <tbody>
                            <tr v-for="s in queue" :key="s.AccountID" :class="{ attention: (s.ConsecutiveScrapeFailures ?? 0) >= 3 }">
                                <td>@{{ s.Username }}</td>
                                <td class="nowrap" :title="fmtStamp(s.NextScrapeDueUtc)">
                                    <span v-if="health?.CurrentScrape?.startsWith(`@${s.Username} (`)" class="running">● running</span>
                                    <span v-else :class="{ late: fmtDue(s.NextScrapeDueUtc, now).startsWith('overdue') }">{{ fmtDue(s.NextScrapeDueUtc, now) }}</span>
                                </td>
                                <td class="lastrun" :title="s.LastScrapeSummary ?? undefined">
                                    <template v-if="s.LastScrapeAttemptUtc">
                                        <span :class="(s.ConsecutiveScrapeFailures ?? 0) > 0 ? 'neg' : ''">{{ (s.ConsecutiveScrapeFailures ?? 0) > 0 ? '✗' : '✓' }}</span>
                                        {{ fmtRel(s.LastScrapeAttemptUtc, now) }} · {{ s.LastScrapeReelsDownloaded }} new
                                    </template>
                                    <span v-else class="muted">not yet</span>
                                </td>
                                <td class="num" :class="{ neg: (s.ConsecutiveScrapeFailures ?? 0) > 0 }">{{ s.ConsecutiveScrapeFailures || '' }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </OmniTraderCard>
        </div>

        <OmniTraderCard title="Scrape history" :subtitle="historySubtitle" flush :loading="!history" :empty="!history" :error="historyError ?? undefined" @retry="loadHistory">
            <template #controls>
                <div class="ot-segment sm" role="group" aria-label="Outcome">
                    <button v-for="s in STATUSES" :key="s.key" type="button" :aria-pressed="status === s.key" @click="setFilter('status', s.key)">{{ s.label }}</button>
                </div>
                <div class="ot-segment sm" role="group" aria-label="Trigger">
                    <button v-for="t in TRIGGERS" :key="t.key" type="button" :aria-pressed="trigger === t.key" @click="setFilter('trigger', t.key)">{{ t.label }}</button>
                </div>
            </template>
            <template v-if="history">
                <div class="ot-tablewrap">
                    <table class="ot-table">
                        <thead>
                            <tr><th>When</th><th>Source</th><th>Trigger</th><th class="num">Took</th><th class="num">Seen</th><th class="num">New</th><th class="num">Saved</th><th>Via</th><th>Result</th></tr>
                        </thead>
                        <tbody>
                            <template v-for="r in history.Rows" :key="r.StartedUtc + r.Username">
                                <tr class="clickable" :class="{ attention: r.Status === 'failed', selected: expanded === r.StartedUtc + r.Username }" tabindex="0"
                                    @click="toggle(r.StartedUtc + r.Username)" @keydown.enter="toggle(r.StartedUtc + r.Username)">
                                    <td class="nowrap" :title="fmtStamp(r.StartedUtc)">{{ fmtRel(r.StartedUtc, now) }}</td>
                                    <td>@{{ r.Username }}</td>
                                    <td class="nowrap">{{ formatTrigger(r.Trigger) }}</td>
                                    <td class="num">{{ fmtRunTime(r.DurationMs != null ? r.DurationMs / 1000 : null) }}</td>
                                    <td class="num">{{ r.ReelsFound }}</td>
                                    <td class="num">{{ r.NewReels }}</td>
                                    <td class="num">{{ r.Downloaded }}<span v-if="r.DownloadFailures" class="neg"> ({{ r.DownloadFailures }}✗)</span></td>
                                    <td class="nowrap">{{ r.SucceededVia ? providerLabel(r.SucceededVia) : '—' }}</td>
                                    <td>
                                        <span class="result" :title="r.Error ?? r.ProviderSummary ?? undefined">
                                            <span class="ot-chip" :class="r.Status === 'failed' ? 'bad' : r.Status === 'partial' ? 'warn' : 'ok'">{{ r.Status === 'failed' ? 'Failed' : r.Status === 'partial' ? 'Partial' : 'OK' }}</span>
                                            <span class="why">{{ r.Error ?? r.ProviderSummary ?? '' }}</span>
                                        </span>
                                    </td>
                                </tr>
                                <tr v-if="expanded === r.StartedUtc + r.Username" class="detailrow">
                                    <td colspan="9">
                                        <dl class="ot-kv">
                                            <dt>Started</dt><dd>{{ fmtStamp(r.StartedUtc) }}</dd>
                                            <dt>Finished</dt><dd>{{ fmtStamp(r.FinishedUtc) }}</dd>
                                            <template v-if="r.ProviderSummary"><dt>Providers</dt><dd class="wrap">{{ r.ProviderSummary }}</dd></template>
                                            <template v-if="r.Error"><dt>Error</dt><dd class="wrap neg">{{ r.Error }}</dd></template>
                                            <template v-for="(n, i) in r.Notes" :key="i"><dt>{{ i === 0 ? 'Notes' : '' }}</dt><dd class="wrap">{{ n }}</dd></template>
                                        </dl>
                                    </td>
                                </tr>
                            </template>
                            <tr v-if="!history.Rows.length">
                                <td colspan="9">
                                    <OmniTraderStateBlock :kind="status !== 'all' || trigger !== 'all' ? 'filtered' : 'empty'" compact
                                                          :title="status !== 'all' || trigger !== 'all' ? 'No runs match these filters' : 'No scrapes in this window'"
                                                          detail="Scrape history is kept from this version on." />
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div v-if="history.Filtered > history.Limit" class="pager">
                    <button class="ot-btn ghost sm" :disabled="historyOffset === 0" @click="historyOffset = Math.max(0, historyOffset - HISTORY_PAGE)">← Newer</button>
                    <span>{{ historyOffset + 1 }}–{{ historyOffset + history.Rows.length }} of {{ history.Filtered }}</span>
                    <button class="ot-btn ghost sm" :disabled="historyOffset + history.Rows.length >= history.Filtered" @click="historyOffset += HISTORY_PAGE">Older →</button>
                </div>
            </template>
        </OmniTraderCard>
    </MemeScraperShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAccess } from '~/composables/useAccess';
import {
    PROVIDER_ROLE, fmtRel, fmtDue, fmtRate, fmtRunTime, fmtStamp, formatTrigger, msGet, parseUtc, providerLabel, useMemeActions,
    useMemeDashboard, useMemeDataVersion, useMemeHealth, useMemeNow, type ProviderHealth, type ScrapePage,
} from '~/composables/useMemeScraper';
import { fmtBytes, q } from '~/composables/useOmniTumblr';
import type { ChartBucket } from '~/components/MemeScraper/StackedBars.vue';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Health · MemeScraper · Klives Management' });

const HISTORY_PAGE = 25;
const STATUSES = [{ key: 'all', label: 'All' }, { key: 'failed', label: 'Failed' }, { key: 'partial', label: 'Partial' }, { key: 'ok', label: 'OK' }];
const TRIGGERS = [{ key: 'all', label: 'Any trigger' }, { key: 'schedule', label: 'Scheduled' }, { key: 'manual', label: 'Manual' }];

const route = useRoute();
const router = useRouter();
const { can } = useAccess();
const now = useMemeNow();
const actions = useMemeActions();
const { version } = useMemeDataVersion();
const { health, overall, providerCheckRunning } = useMemeHealth();
const { data: d, loading, range } = useMemeDashboard();

const showNewReels = ref(true);
const expanded = ref<string | null>(null);
const history = ref<ScrapePage | null>(null);
const historyError = ref<string | null>(null);
const historyLoading = ref(false);
const historyOffset = ref(0);

const status = computed(() => (STATUSES.some(s => s.key === route.query.status) ? String(route.query.status) : 'all'));
const trigger = computed(() => (TRIGGERS.some(t => t.key === route.query.trigger) ? String(route.query.trigger) : 'all'));

function setFilter(key: 'status' | 'trigger', value: string) {
    const query = { ...route.query };
    if (value === 'all') delete query[key]; else query[key] = value;
    void router.replace({ query });
}

const overallTone = computed(() => ({ good: 'good', warn: 'warn', bad: 'bad' } as Record<string, string>)[overall.value.level] ?? '');
const reelSources = computed(() => (health.value?.Sources ?? []).filter(s => s.DownloadReels).length);
const check = computed(() => health.value?.ProviderCheck ?? null);
const checkStateText = computed(() => {
    const c = check.value;
    if (!c) return '';
    if (c.State === 'queued') return 'queued';
    if (c.State === 'running') return 'running';
    const ok = c.Results.filter(r => r.Ok).length;
    return `finished ${fmtRel(c.FinishedUtc, now.value)} · ${ok}/${c.Results.length} passed`;
});

const schedulerText = computed(() => {
    const h = health.value;
    if (!h) return '';
    const state = h.SchedulerState || '—';
    const tick = h.LastSchedulerTickUtc ? `last tick ${fmtRel(h.LastSchedulerTickUtc, now.value)}` : 'no tick yet';
    return `${state.startsWith('idle') ? 'idle' : state} · ${tick}`;
});

const queue = computed(() => [...(health.value?.Sources ?? [])]
    .filter(s => s.DownloadReels)
    .sort((a, b) => (parseUtc(a.NextScrapeDueUtc)?.getTime() ?? Infinity) - (parseUtc(b.NextScrapeDueUtc)?.getTime() ?? Infinity)));
const nextDue = computed(() => queue.value[0] ?? null);
const nextScrapeText = computed(() => {
    const h = health.value;
    if (!h) return '—';
    if (h.CurrentScrape) return 'running now';
    if (h.Settings?.Paused) return 'paused';
    return fmtDue(h.NextScrapeDueUtc, now.value, 'nothing due');
});

const defaultCheckUsername = computed(() => {
    const sources = (health.value?.Sources ?? []).filter(s => s.DownloadReels);
    sources.sort((a, b) => (parseUtc(b.LastSuccessfulScrapeUtc)?.getTime() ?? 0) - (parseUtc(a.LastSuccessfulScrapeUtc)?.getTime() ?? 0));
    return sources[0]?.Username ?? '';
});

function isBenched(p: ProviderHealth) {
    const until = parseUtc(p.BenchedUntil);
    return !!until && until.getTime() > now.value;
}
function providerTone(p: ProviderHealth) {
    if (isBenched(p)) return 'bad';
    if (p.ConsecutiveFailures > 0) return 'warn';
    if (p.TotalSuccesses > 0) return 'ok';
    return '';
}
function providerStatus(p: ProviderHealth) {
    if (isBenched(p)) return 'Benched';
    if (p.ConsecutiveFailures > 0) return `Failing ×${p.ConsecutiveFailures}`;
    if (p.TotalSuccesses > 0) return 'Working';
    return 'Not used yet';
}

const runBuckets = computed<ChartBucket[]>(() => (d.value?.Series ?? []).map(b => ({
    key: b.Key,
    from: b.From,
    to: b.To,
    incomplete: b.Incomplete,
    stack: [b.Scrapes - b.ScrapeFailures, b.ScrapeFailures],
    line: b.NewReelsSeen,
})));
const runsSubtitle = computed(() => {
    const k = d.value?.Kpis;
    if (!k) return undefined;
    return k.Scrapes
        ? `${k.Scrapes} runs · ${fmtRate(k.SuccessRate)} succeeded${k.SuccessRatePrev != null ? ` (previously ${fmtRate(k.SuccessRatePrev)})` : ''} · ${k.DownloadFailures} download failures`
        : 'No runs recorded in this window';
});

const historySubtitle = computed(() => {
    const h = history.value;
    if (!h) return undefined;
    return `${h.Filtered.toLocaleString()} run${h.Filtered === 1 ? '' : 's'} in this window · ${h.Total.toLocaleString()} kept · click a run for details`;
});

async function loadHistory() {
    historyLoading.value = true;
    try {
        const result = await msGet<ScrapePage>(`/memescraper/scrapeHistory${q({ ...range.params.value, granularity: null, status: status.value, trigger: trigger.value, offset: historyOffset.value, limit: HISTORY_PAGE })}`);
        if (result.ok && result.data) {
            history.value = result.data;
            historyError.value = null;
        } else {
            historyError.value = result.error ?? 'The scrape history could not be loaded.';
        }
    } finally {
        historyLoading.value = false;
    }
}

function toggle(key: string) {
    expanded.value = expanded.value === key ? null : key;
}

watch([() => range.key.value, status, trigger], () => {
    if (historyOffset.value !== 0) historyOffset.value = 0;
    else void loadHistory();
});
watch(historyOffset, () => { void loadHistory(); });
watch(version, () => { void loadHistory(); });
// A run that just finished belongs in the table.
watch(() => health.value?.RecentScrapes?.[0]?.FinishedUtc, (next, prev) => { if (prev !== undefined && next !== prev) void loadHistory(); });
onMounted(loadHistory);
</script>

<style scoped>
.providers { display: flex; flex-direction: column; gap: var(--ot-space-3); }
.provider { padding: var(--ot-space-3); border: 1px solid var(--ot-line); border-radius: var(--ot-radius-sm); }
.provider.bad { border-color: rgba(255, 123, 123, 0.45); background: var(--ot-negative-soft); }
.provider.warn { border-color: rgba(240, 180, 41, 0.4); }
.phead { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--ot-space-2); margin-bottom: var(--ot-space-2); }
.phead strong { display: block; }
.role { display: block; font-size: 11.5px; color: var(--ot-muted); }
.note { margin: var(--ot-space-2) 0 0; font-size: 12px; }
.neg { color: var(--ot-negative); }
.warnc { color: var(--ot-warning); }
.small { font-size: 11.5px; margin: var(--ot-space-2) 0 0; }
.running { color: var(--ot-accent); }
.lastrun { white-space: nowrap; }
.result { display: flex; align-items: center; gap: var(--ot-space-2); max-width: 460px; }
.result .why { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ot-text-2); font-size: 12px; }
.late { color: var(--ot-warning); }
.detailrow td { background: var(--ot-surface-2); padding: var(--ot-space-3); height: auto; }
.detailrow .ot-kv dd.wrap { font-family: inherit; white-space: normal; }
.pager { display: flex; align-items: center; gap: var(--ot-space-2); padding: var(--ot-space-2) var(--ot-card-pad); border-top: 1px solid var(--ot-line); font-size: 12px; color: var(--ot-text-2); }
</style>
