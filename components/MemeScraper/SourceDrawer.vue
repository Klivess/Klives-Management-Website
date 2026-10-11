<template>
    <OmniTraderDrawer :open="open && !!source" :title="source ? `@${source.Username}` : ''" @close="$emit('close')">
        <template #title>
            <span v-if="source" class="ttl">
                <MemeScraperAvatar :src="source.ProfilePictureUrl" :name="source.Username" :size="34" />
                <span>
                    @{{ source.Username }}
                    <span class="ot-chip" :class="stateTone(source.State)">{{ STATE_LABEL[source.State] }}</span>
                </span>
            </span>
        </template>
        <template #subtitle>
            <span v-if="source">
                <template v-if="source.FullName">{{ source.FullName }} · </template>
                <template v-if="source.Followers">{{ fmtCount(source.Followers) }} followers<span v-if="source.ProfileUpdatedUtc" :title="`Profile read ${fmtStamp(source.ProfileUpdatedUtc)}`"> (as of {{ fmtRel(source.ProfileUpdatedUtc, now) }})</span> · </template>
                <template v-if="source.AddedUtc">added {{ fmtDayKey(source.AddedUtc.slice(0, 10), true) }} · </template>
                <a :href="`https://www.instagram.com/${source.Username}/`" target="_blank" rel="noopener noreferrer" class="iglink">Instagram ↗</a>
            </span>
        </template>

        <template v-if="source">
            <div class="actions">
                <button v-if="can('memescraper.scrape.run') && source.Registered" class="ot-btn sm primary" :disabled="scraping || actions.requesting.value" @click="actions.scrapeSource(source)">
                    {{ scraping ? 'Scraping now…' : '▶ Scrape now' }}
                </button>
                <button v-if="can('memescraper.sources.manage') && source.Registered" class="ot-btn sm" :class="source.DownloadReels ? 'warn' : ''" :disabled="actions.requesting.value"
                        @click="togglePaused">{{ source.DownloadReels ? 'Pause reels' : 'Resume reels' }}</button>
                <button v-if="can('memescraper.sources.manage') && source.Registered" class="ot-btn sm ghost" :disabled="actions.requesting.value || refreshing" @click="actions.refreshProfile(source)"
                        title="Re-read followers, name, picture and bio from Instagram">{{ refreshing ? 'Refreshing…' : 'Refresh profile' }}</button>
                <button class="ot-btn sm ghost" :title="`Filter every chart and table to @${source.Username}`" @click="$emit('filter', source.Username)">Show only this source</button>
                <button v-if="can('memescraper.sources.manage') && source.Registered" class="ot-btn sm danger" :disabled="actions.requesting.value" @click="remove">Remove</button>
            </div>

            <div v-if="source.State !== 'ok'" class="ot-banner" :class="bannerTone">
                <span class="glyph" aria-hidden="true">{{ source.State === 'bad' ? '⚠' : source.State === 'warn' ? '!' : 'ℹ' }}</span>
                <div>{{ source.StateReason }}</div>
            </div>
            <div v-if="refreshResult" class="ot-banner" :class="refreshResult.State === 'failed' ? '' : 'ok'">
                <span class="glyph" aria-hidden="true">{{ refreshResult.State === 'failed' ? '⚠' : '✓' }}</span>
                <div v-if="refreshResult.State === 'failed'">Profile refresh failed: {{ refreshResult.Error }}</div>
                <div v-else>Profile refreshed {{ fmtRel(refreshResult.FinishedUtc, now) }}: {{ fmtCount(refreshResult.FollowersBefore ?? 0) }} → {{ fmtCount(refreshResult.FollowersAfter ?? 0) }} followers.</div>
            </div>

            <h4 class="ot-sectionhead">{{ rangeLabel }}</h4>
            <div class="stats">
                <div class="stat"><span class="k">Reels</span><span class="v">{{ source.Downloaded.toLocaleString() }}</span>
                    <span v-if="source.DownloadedPrev != null" class="ms-delta" :class="source.Downloaded > source.DownloadedPrev ? 'up' : source.Downloaded < source.DownloadedPrev ? 'down' : 'flat'">{{ deltaText(source.Downloaded, source.DownloadedPrev) }} vs before</span></div>
                <div class="stat"><span class="k">Share</span><span class="v">{{ fmtRate(source.Share, source.Share < 10 ? 1 : 0) }}</span><span class="sub">of all reels</span></div>
                <div class="stat"><span class="k">Median views</span><span class="v">{{ fmtCount(source.MedianViews) }}</span><span class="sub">top {{ fmtCount(source.TopViews) }}</span></div>
                <div class="stat"><span class="k">Freshness</span><span class="v">{{ fmtHours(source.MedianAgeHours) }}</span><span class="sub">old when saved</span></div>
                <div class="stat"><span class="k">Engagement</span><span class="v">{{ source.MedianEngagementPct != null ? `${source.MedianEngagementPct.toFixed(2)}%` : '—' }}</span><span class="sub">median</span></div>
                <div class="stat"><span class="k">Scrapes</span><span class="v">{{ source.Scrapes }}</span>
                    <span class="sub" :class="{ neg: source.ScrapeFailures > 0 }">{{ source.ScrapeFailures }} failed · {{ source.AvgNewPerScrape != null ? source.AvgNewPerScrape.toFixed(1) : '—' }} new each</span></div>
            </div>
            <div v-if="source.Spark.length > 1 && source.Spark.some(v => v > 0)" class="spark">
                <OmniTraderSparkline :values="source.Spark" :height="34" tone="neutral" :label="`Reels from @${source.Username} across the window`" />
            </div>

            <h4 class="ot-sectionhead">Schedule</h4>
            <dl class="ot-kv">
                <dt>Next scrape</dt>
                <dd>{{ scraping ? 'running now' : !source.DownloadReels ? 'paused' : `${fmtDue(source.NextScrapeDueUtc, now, 'not scheduled')} · ${fmtStamp(source.NextScrapeDueUtc)}` }}</dd>
                <dt>Last success</dt>
                <dd>{{ fmtRel(source.LastSuccessfulScrapeUtc, now) }}</dd>
                <dt>Last attempt</dt>
                <dd>{{ fmtRel(source.LastScrapeAttemptUtc, now) }}<template v-if="source.LastScrapeAttemptUtc"> · {{ source.LastScrapeReelsDownloaded }} new of {{ source.LastScrapeReelsFound }} seen<template v-if="source.LastScrapeDownloadFailures">, {{ source.LastScrapeDownloadFailures }} failed</template></template></dd>
                <dt>Reels ever</dt>
                <dd>{{ source.TotalReels.toLocaleString() }}<template v-if="source.FirstDownloadUtc"> since {{ fmtDayKey(source.FirstDownloadUtc.slice(0, 10), true) }}</template></dd>
                <dt>Last reel</dt>
                <dd>{{ fmtRel(source.LastDownloadUtc, now) }}</dd>
                <template v-if="source.LastScrapeSummary && source.LastScrapeSummary !== source.LastScrapeError">
                    <dt>Providers</dt>
                    <dd class="wrap">{{ source.LastScrapeSummary }}</dd>
                </template>
                <template v-if="source.LastScrapeError">
                    <dt>Last error</dt>
                    <dd class="wrap neg">{{ source.LastScrapeError }}</dd>
                </template>
            </dl>

            <h4 class="ot-sectionhead">Niches</h4>
            <div v-if="can('memescraper.sources.manage') && source.Registered" class="niches">
                <OmniTumblrTagInput v-model="nicheDraft" prefix="" placeholder="Add a niche…" label="Niches" input-id="ms-source-niches" />
                <div v-if="suggestions.length" class="suggest">
                    <span class="muted">Existing:</span>
                    <button v-for="n in suggestions" :key="n" type="button" class="ot-chip" @click="nicheDraft = [...nicheDraft, n]">+ {{ n }}</button>
                </div>
                <div class="row">
                    <button class="ot-btn sm primary" :disabled="!nichesDirty || actions.requesting.value" @click="saveNiches">Save niches</button>
                    <button v-if="nichesDirty" class="ot-btn sm ghost" @click="resetNiches">Undo</button>
                </div>
            </div>
            <div v-else class="chips">
                <span v-for="n in source.Niches" :key="n" class="ot-chip">{{ n }}</span>
                <span v-if="!source.Niches.length" class="muted">None</span>
            </div>

            <h4 class="ot-sectionhead">Most viewed in this window</h4>
            <div v-if="reelsLoading && !topReels.length" class="ot-skel" style="height:120px"></div>
            <div v-else-if="topReels.length" class="reels">
                <MemeScraperReelCard v-for="(r, i) in topReels" :key="r.PostID" :reel="r" :rank="i + 1" compact @open="$emit('open-reel', $event)" />
            </div>
            <p v-else class="muted">No reels from @{{ source.Username }} in this window.</p>

            <h4 class="ot-sectionhead">Recent scrapes</h4>
            <ul v-if="scrapes.length" class="ot-timeline">
                <li v-for="s in scrapes" :key="s.StartedUtc">
                    <span :class="s.Status === 'failed' ? 'neg' : s.Status === 'partial' ? 'warnc' : ''">
                        {{ s.Status === 'failed' ? '✗' : s.Status === 'partial' ? '!' : '✓' }}
                        {{ s.Status === 'failed' ? s.Error : `${s.Downloaded} new of ${s.ReelsFound} seen` }}
                    </span>
                    <span class="sub">{{ fmtStamp(s.StartedUtc) }} · {{ formatTrigger(s.Trigger) }} · {{ fmtRunTime(s.DurationMs != null ? s.DurationMs / 1000 : null) }}<template v-if="s.SucceededVia"> · via {{ providerLabel(s.SucceededVia) }}</template></span>
                </li>
            </ul>
            <p v-else class="muted">{{ scrapesLoaded ? 'No scrapes recorded yet.' : 'Loading…' }}</p>

            <template v-if="source.Bio || source.TopHashtags.length">
                <h4 class="ot-sectionhead">Profile</h4>
                <p v-if="source.Bio" class="bio">{{ source.Bio }}</p>
                <div v-if="source.TopHashtags.length" class="chips">
                    <span v-for="h in source.TopHashtags" :key="h.Hashtag" class="ot-chip">#{{ h.Hashtag }} <span class="muted">{{ h.Count }}</span></span>
                </div>
            </template>
        </template>
    </OmniTraderDrawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useAccess } from '~/composables/useAccess';
import {
    STATE_LABEL, fmtRel, fmtDayKey, fmtDayRange, fmtDue, fmtHours, fmtRate, fmtRunTime, fmtStamp, formatTrigger, msGet, providerLabel,
    stateTone, useMemeActions, useMemeHealth, useMemeNow, useMemeRange, type RangeView, type ReelPage, type ReelRow, type ScrapePage,
    type ScrapeRow, type SourceRow,
} from '~/composables/useMemeScraper';
import { fmtCount, q } from '~/composables/useOmniTumblr';

const props = defineProps<{ open: boolean; source: SourceRow | null; range: RangeView | null; allNiches?: string[] }>();
const emit = defineEmits<{ close: []; 'open-reel': [postId: string]; filter: [username: string] }>();

const { can } = useAccess();
const now = useMemeNow();
const actions = useMemeActions();
const memeRange = useMemeRange();
const { health } = useMemeHealth();

const topReels = ref<ReelRow[]>([]);
const reelsLoading = ref(false);
const scrapes = ref<ScrapeRow[]>([]);
const scrapesLoaded = ref(false);
const nicheDraft = ref<string[]>([]);

const scraping = computed(() => !!props.source && !!health.value?.CurrentScrape?.startsWith(`@${props.source.Username} (`));
const refreshing = computed(() => {
    const r = health.value?.ProfileRefresh;
    return !!r && !!props.source && r.AccountID === props.source.AccountID && (r.State === 'queued' || r.State === 'running');
});
const refreshResult = computed(() => {
    const r = health.value?.ProfileRefresh;
    if (!r || !props.source || r.AccountID !== props.source.AccountID || (r.State !== 'complete' && r.State !== 'failed')) return null;
    return r;
});
const bannerTone = computed(() => (props.source?.State === 'bad' ? '' : props.source?.State === 'warn' ? 'warn' : 'info'));
const rangeLabel = computed(() => (props.range ? `This window · ${fmtDayRange(props.range.From, props.range.To)}` : 'This window'));

const nichesDirty = computed(() => {
    const current = (props.source?.Niches ?? []).map(n => n.toLowerCase()).sort().join('|');
    return nicheDraft.value.map(n => n.toLowerCase()).sort().join('|') !== current;
});
const suggestions = computed(() => (props.allNiches ?? [])
    .filter(n => !nicheDraft.value.some(d => d.toLowerCase() === n.toLowerCase()))
    .slice(0, 12));

function deltaText(current: number, previous: number) {
    const diff = current - previous;
    return diff === 0 ? '±0' : `${diff > 0 ? '+' : '−'}${Math.abs(diff).toLocaleString()}`;
}

function resetNiches() {
    nicheDraft.value = [...(props.source?.Niches ?? [])];
}

async function load() {
    const s = props.source;
    if (!props.open || !s) return;
    const username = s.Username;
    reelsLoading.value = true;
    scrapesLoaded.value = false;
    const [reels, history] = await Promise.all([
        msGet<ReelPage>(`/memescraper/reels${q({ ...memeRange.params.value, sources: username, niche: null, sort: 'views', limit: 6 })}`),
        msGet<ScrapePage>(`/memescraper/scrapeHistory${q({ sources: username, range: 'all', limit: 8, tz: memeRange.tz })}`),
    ]);
    if (props.source?.Username !== username) return;
    topReels.value = reels.ok && reels.data ? reels.data.Rows : [];
    scrapes.value = history.ok && history.data ? history.data.Rows : [];
    reelsLoading.value = false;
    scrapesLoaded.value = true;
}

watch(() => [props.open, props.source?.Username] as const, ([open], previous) => {
    if (!open) return;
    if (!previous || previous[1] !== props.source?.Username || !previous[0]) {
        topReels.value = [];
        scrapes.value = [];
        resetNiches();
    }
    void load();
}, { immediate: true });

// A save or a finished scrape reloads the dashboard; keep the drawer's own lists in step.
watch(() => props.source, (next, prev) => {
    if (next && prev && next.Username === prev.Username && props.open) {
        if (!nichesDirty.value || next.Niches.join('|') !== prev.Niches.join('|')) resetNiches();
        if (next.LastScrapeAttemptUtc !== prev.LastScrapeAttemptUtc) void load();
    }
});

async function togglePaused() {
    const s = props.source;
    if (!s?.AccountID) return;
    await actions.updateSource(s.AccountID, { downloadReels: !s.DownloadReels });
}

async function saveNiches() {
    const s = props.source;
    if (!s?.AccountID) return;
    await actions.updateSource(s.AccountID, { niches: nicheDraft.value });
}

async function remove() {
    const s = props.source;
    if (!s) return;
    if (await actions.removeSource(s)) emit('close');
}
</script>

<style scoped>
.ttl { display: inline-flex; align-items: center; gap: var(--ot-space-2); }
.ttl .ot-chip { margin-left: var(--ot-space-1); vertical-align: middle; }
.iglink { color: var(--ot-info); }
.actions { display: flex; flex-wrap: wrap; gap: var(--ot-space-2); margin-bottom: var(--ot-space-3); }
.stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--ot-space-2); margin-bottom: var(--ot-space-2); }
.stat { display: flex; flex-direction: column; gap: 1px; padding: var(--ot-space-2); border: 1px solid var(--ot-line); border-radius: var(--ot-radius-sm); background: rgba(255, 255, 255, 0.015); min-width: 0; }
.stat .k { font-size: 10.5px; letter-spacing: 0.7px; text-transform: uppercase; color: var(--ot-muted); font-weight: 650; }
.stat .v { font-family: var(--ot-mono); font-size: 17px; font-weight: 650; }
.stat .sub { font-size: 11px; color: var(--ot-muted); }
.spark { margin-bottom: var(--ot-space-3); }
.ot-sectionhead { margin-top: var(--ot-space-4); }
.ot-kv dd.wrap { white-space: normal; font-family: inherit; font-size: 12px; }
.neg { color: var(--ot-negative); }
.warnc { color: var(--ot-warning); }
.niches { display: flex; flex-direction: column; gap: var(--ot-space-2); }
.niches .row { display: flex; gap: var(--ot-space-2); }
.suggest { display: flex; flex-wrap: wrap; gap: var(--ot-space-1); align-items: center; font-size: 11.5px; }
.suggest .ot-chip { cursor: pointer; background: transparent; font-family: inherit; }
.suggest .ot-chip:hover { border-color: var(--ot-accent); color: var(--ot-text); }
.chips { display: flex; flex-wrap: wrap; gap: var(--ot-space-1); }
.reels { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--ot-space-2); }
.bio { margin: 0 0 var(--ot-space-2); font-size: 12.5px; color: var(--ot-text-2); white-space: pre-line; }
@media (max-width: 520px) {
    .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
