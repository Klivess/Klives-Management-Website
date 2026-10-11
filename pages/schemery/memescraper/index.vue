<template>
    <MemeScraperShell>
        <div class="ot-pagehead">
            <div>
                <h1>Reel scraper</h1>
                <p class="subtitle">{{ subtitle }}</p>
            </div>
            <div class="ot-actions">
                <button v-if="can('memescraper.scrape.run')" class="ot-btn" :disabled="actions.requesting.value || !health?.DataLoaded" @click="actions.scrapeAll(reelSources)">
                    {{ (health?.ScrapeQueued ?? 0) > 0 ? `▶ Scrape all (${health!.ScrapeQueued} pending)` : '▶ Scrape all' }}
                </button>
                <button v-if="can('memescraper.sources.manage')" class="ot-btn primary" @click="addOpen = true">Add source</button>
            </div>
        </div>

        <MemeScraperAttention />
        <MemeScraperRangeBar :range-view="d?.Range" :options="d?.Options" :loading="loading" />

        <div v-if="error && !d" class="ot-banner" role="alert">
            <span class="glyph" aria-hidden="true">⚠</span>
            <div><strong>The analytics could not load</strong> {{ error }}</div>
            <div class="actions"><button class="ot-btn sm" @click="load(true)">Retry</button></div>
        </div>

        <div class="ot-kpis ms-kpis6">
            <OmniTraderKpi label="Reels downloaded" :value="k ? k.Downloaded.toLocaleString() : '—'" :loading="!d"
                           :compare="compare(k?.Downloaded, k?.DownloadedPrev)" :baseline="baseline" :compare-format="countChange"
                           :spark="downloadSpark" :foot="k ? `${k.PerDay.toFixed(k.PerDay < 10 ? 1 : 0)} a day · library ${fmtCount(k.LibraryAtEnd)}` : undefined" />
            <OmniTraderKpi label="Active sources" :value="k ? `${k.ActiveSources} / ${k.SourcesInScope}` : '—'" :loading="!d"
                           :compare="compare(k?.ActiveSources, k?.ActiveSourcesPrev)" :baseline="baseline" :compare-format="countChange"
                           :attention-soft="!!k && k.SourcesInScope > 0 && k.ActiveSources < k.SourcesInScope / 2"
                           foot="sources that produced a reel" help="Sources with at least one reel downloaded in the window, out of every source in view (paused ones included)." />
            <OmniTraderKpi label="Median views" :value="fmtCount(k?.MedianViews)" :loading="!d"
                           :compare="compare(k?.MedianViews, k?.MedianViewsPrev)" :baseline="baseline" :compare-format="pctChange"
                           :foot="k ? `avg ${fmtCount(k.AvgViews)} · ${k.ViralReels} over 1M` : undefined"
                           help="Views each reel had when it was downloaded. The median ignores the odd viral outlier; the average does not." />
            <OmniTraderKpi label="Engagement" :value="k?.MedianEngagementPct != null ? `${k.MedianEngagementPct.toFixed(2)}%` : '—'" :loading="!d"
                           :compare="compare(k?.MedianEngagementPct, k?.MedianEngagementPctPrev)" :baseline="baseline" :compare-format="pointChange"
                           foot="median (likes + comments) ÷ views" help="Only reels with a like count; some providers do not report likes." />
            <OmniTraderKpi label="Freshness" :value="fmtHours(k?.MedianAgeHours)" :loading="!d"
                           :compare="compare(k?.MedianAgeHours, k?.MedianAgeHoursPrev)" :baseline="baseline" :compare-format="pctChange" :good-direction="-1"
                           foot="median age of a reel when saved" help="Time between a reel being posted on Instagram and MemeScraper downloading it. Lower is better." />
            <OmniTraderKpi label="Scrape success" :value="fmtRate(k?.SuccessRate)" :loading="!d"
                           :tone="k?.SuccessRate != null ? (k.SuccessRate < 75 ? 'bad' : k.SuccessRate < 90 ? 'warn' : '') : ''"
                           :compare="compare(k?.SuccessRate, k?.SuccessRatePrev)" :baseline="baseline" :compare-format="pointChange"
                           :foot="k ? (k.Scrapes ? `${k.Scrapes} scrapes · ${k.ScrapeFailures} failed · ${fmtRunTime(k.MedianScrapeSeconds)} each` : 'no scrapes recorded in the window') : undefined" />
        </div>

        <div class="ms-main ms-section">
            <OmniTraderCard title="Downloads" :subtitle="chartSubtitle" :loading="!d" :empty="!d" :stale="stale" stale-reason="Loading the new window…" class="ms-fillcard">
                <template #controls>
                    <div class="ot-segment sm" role="group" aria-label="Bars">
                        <button type="button" :aria-pressed="stacked" @click="stacked = true">By source</button>
                        <button type="button" :aria-pressed="!stacked" @click="stacked = false">Total</button>
                    </div>
                    <label v-if="d?.Range.HasBaseline" class="ot-check"><input v-model="showPrevious" type="checkbox" /> Previous period</label>
                    <label class="ot-check"><input v-model="showLibrary" type="checkbox" /> Library size</label>
                </template>
                <MemeScraperStackedBars v-if="d" :buckets="chartBuckets" :keys="chartKeys" :colours="chartColours" :granularity="d.Range.Granularity"
                                        :height="270" fill legend-prefix="@" :legend-clickable="stacked" :show-previous="showPrevious" :show-line="showLibrary"
                                        empty-title="No reels downloaded in this window"
                                        @zoom="range.zoom" @legend="range.toggleSource" />
            </OmniTraderCard>
            <OmniTraderCard title="Insights" :subtitle="d ? `What stands out in ${d.Range.AllTime ? 'the whole library' : 'this window'}` : undefined" :loading="!d" :empty="!d">
                <MemeScraperInsightList v-if="d" :insights="d.Insights" @source="openSource" />
            </OmniTraderCard>
        </div>

        <div class="ms-three ms-section">
            <OmniTraderCard title="Top sources" subtitle="Reels in the window · change against the previous one" :loading="!d"
                            :empty="!d || !d.Sources.some(s => s.Downloaded > 0)" empty-title="No source produced a reel in this window">
                <MemeScraperRankedBars :items="sourceItems" selectable :show-delta="!!d?.Range.HasBaseline" @select="openSource" />
                <template #footer>
                    <NuxtLink class="ms-more" :to="{ path: '/schemery/memescraper/sources', query: range.linkQuery.value }">Every source →</NuxtLink>
                </template>
            </OmniTraderCard>
            <OmniTraderCard title="Niches" subtitle="A reel counts toward each niche of its source" :loading="!d"
                            :empty="!d || !d.Niches.length" empty-title="No niches yet" empty-text="Tag sources with niches from their drawer.">
                <MemeScraperRankedBars :items="nicheItems" selectable colour="var(--ot-cat-3)" :show-delta="!!d?.Range.HasBaseline"
                                       @select="(n: string) => range.setNiche(range.niche.value === n ? null : n)" />
            </OmniTraderCard>
            <OmniTraderCard title="Views per reel" :subtitle="k ? `${fmtCount(k.TotalViews)} views across ${k.Downloaded.toLocaleString()} reels` : undefined" :loading="!d" :empty="!d">
                <MemeScraperDistribution v-if="d" :buckets="d.ViewsDistribution" colour="var(--ot-cat-7)" note="Views at the moment each reel was downloaded." />
            </OmniTraderCard>
        </div>

        <div class="ms-pair ms-section">
            <OmniTraderCard title="When sources post" :subtitle="d?.BusiestSlot ? `Busiest hour: ${d.BusiestSlot}` : 'Instagram posting time, in your time zone'" :loading="!d" :empty="!d">
                <MemeScraperPostingHeatmap v-if="d" :cells="d.Heatmap" :time-zone="d.Range.TimeZone" />
            </OmniTraderCard>
            <OmniTraderCard title="Freshness" subtitle="How old reels were when they were downloaded" :loading="!d" :empty="!d">
                <MemeScraperDistribution v-if="d" :buckets="d.AgeDistribution" colour="var(--ot-cat-4)" :trim="false" />
                <div v-if="d && d.DiscoveredVia.length" class="via">
                    <span class="ot-sectionhead">Found via</span>
                    <div class="viabar" role="img" :aria-label="viaSummary">
                        <span v-for="(v, i) in d.DiscoveredVia" :key="v.Name" :style="{ flexGrow: v.Count, background: `var(--ot-cat-${(i % 8) + 1})` }" :title="`${providerLabel(v.Name)}: ${v.Count.toLocaleString()}`"></span>
                    </div>
                    <div class="ot-legend">
                        <span v-for="(v, i) in d.DiscoveredVia" :key="v.Name" class="item">
                            <span class="swatch" :style="{ background: `var(--ot-cat-${(i % 8) + 1})` }"></span>{{ providerLabel(v.Name) }} · {{ pct(v.Count, k?.Downloaded) }}
                        </span>
                    </div>
                </div>
            </OmniTraderCard>
        </div>

        <OmniTraderCard title="Most viewed reels" :subtitle="d ? `Downloaded ${d.Range.AllTime ? 'ever' : 'in this window'}, by views when saved` : undefined" :loading="!d"
                        :empty="!d || !d.TopReels.length" empty-title="No reels in this window" class="ms-section">
            <template #controls>
                <NuxtLink v-if="can('memescraper.sources.read')" class="ot-btn ghost sm" :to="{ path: '/schemery/memescraper/library', query: { ...range.linkQuery.value, sort: 'views' } }">Open the library →</NuxtLink>
            </template>
            <div v-if="d" class="reelgrid">
                <MemeScraperReelCard v-for="(r, i) in d.TopReels" :key="r.PostID" :reel="r" :rank="i + 1" @open="reelId = $event" />
            </div>
        </OmniTraderCard>

        <MemeScraperSourceDrawer :open="!!drawerUser" :source="drawerSource" :range="d?.Range ?? null" :all-niches="d?.Options.Niches"
                                 @close="drawerUser = null" @open-reel="reelId = $event" @filter="filterTo" />
        <MemeScraperReelDrawer :open="!!reelId" :post-id="reelId" @close="reelId = null" @source="openSource" />
        <MemeScraperAddSourceModal :open="addOpen" :existing-niches="d?.Options.Niches" :existing-sources="d?.Options.Sources" @close="addOpen = false" />
    </MemeScraperShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAccess } from '~/composables/useAccess';
import {
    compare, countChange, fmtRel, fmtHours, fmtRate, fmtRunTime, pctChange, pointChange, providerLabel, sourceColours, useMemeActions,
    useMemeDashboard, useMemeHealth, useMemeNow,
} from '~/composables/useMemeScraper';
import { fmtCount } from '~/composables/useOmniTumblr';
import type { ChartBucket } from '~/components/MemeScraper/StackedBars.vue';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'MemeScraper · Klives Management' });

const { can } = useAccess();
const now = useMemeNow();
const actions = useMemeActions();
const { health } = useMemeHealth();
const { data: d, error, loading, stale, load, range } = useMemeDashboard();

const k = computed(() => d.value?.Kpis ?? null);
const stacked = ref(true);
const showPrevious = ref(true);
const showLibrary = ref(false);
const drawerUser = ref<string | null>(null);
const reelId = ref<string | null>(null);
const addOpen = ref(false);

const reelSources = computed(() => (health.value?.Sources ?? []).filter(s => s.DownloadReels).length);
const baseline = computed(() => (d.value?.Range.HasBaseline ? `vs previous ${d.value.Range.Days} days` : undefined));

const subtitle = computed(() => {
    const lib = d.value?.Library;
    if (!lib) return 'Loading…';
    const parts = [`${lib.Sources} source${lib.Sources === 1 ? '' : 's'}`, `${lib.MatchingReels.toLocaleString()} reels`];
    if (lib.PausedSources) parts.push(`${lib.PausedSources} paused`);
    if (lib.LastDownloadUtc) parts.push(`last reel ${fmtRel(lib.LastDownloadUtc, now.value)}`);
    return parts.join(' · ');
});

const chartSubtitle = computed(() => {
    const r = d.value?.Range;
    if (!r) return undefined;
    const by = r.Granularity === 'day' ? 'Per day' : r.Granularity === 'week' ? 'Per week (Mon–Sun)' : 'Per month';
    return `${by}${k.value?.LongestGapDays ? ` · longest gap ${k.value.LongestGapDays} days` : ''}${k.value?.BestDay ? ` · best day ${k.value.BestDayCount} reels` : ''}`;
});

const downloadSpark = computed(() => (d.value?.Series ?? []).slice(-30).map(b => b.Downloads));

// Colours follow all-time volume, so the biggest accounts keep theirs when the window changes.
const colourMap = computed(() => {
    const ranking = [...(d.value?.Sources ?? [])].sort((a, b) => b.TotalReels - a.TotalReels).map(s => s.Username);
    return sourceColours(d.value?.StackKeys ?? [], ranking);
});
const chartKeys = computed(() => (stacked.value ? d.value?.StackKeys ?? [] : ['Reels']));
const chartColours = computed(() => (stacked.value ? chartKeys.value.map(key => colourMap.value[key] ?? 'var(--ot-cat-1)') : ['var(--ot-cat-1)']));
const chartBuckets = computed<ChartBucket[]>(() => (d.value?.Series ?? []).map(b => ({
    key: b.Key,
    from: b.From,
    to: b.To,
    incomplete: b.Incomplete,
    stack: stacked.value ? b.Stack : [b.Downloads],
    previous: b.Previous,
    line: b.Cumulative,
    extra: {
        'Views captured': fmtCount(b.Views),
        ...(b.Scrapes ? { Scrapes: `${b.Scrapes}${b.ScrapeFailures ? ` (${b.ScrapeFailures} failed)` : ''}` } : {}),
    },
})));

const sourceItems = computed(() => (d.value?.Sources ?? []).filter(s => s.Downloaded > 0).map(s => ({
    key: s.Username,
    label: `@${s.Username}`,
    value: s.Downloaded,
    previous: s.DownloadedPrev,
    share: s.Share,
    colour: colourMap.value[s.Username],
    title: `${s.Downloaded.toLocaleString()} reels · median ${fmtCount(s.MedianViews)} views · ${s.TotalReels.toLocaleString()} ever`,
})));

const nicheItems = computed(() => (d.value?.Niches ?? []).map(n => ({
    key: n.Name,
    label: n.Name,
    value: n.Downloaded,
    previous: n.DownloadedPrev,
    share: n.Share,
    title: `${n.Sources} source${n.Sources === 1 ? '' : 's'} · median ${fmtCount(n.MedianViews)} views`,
})));

const drawerSource = computed(() => d.value?.Sources.find(s => s.Username.toLowerCase() === drawerUser.value?.toLowerCase()) ?? null);

function openSource(username: string) {
    drawerUser.value = username;
}

function filterTo(username: string) {
    drawerUser.value = null;
    range.setSources([username]);
}

const pct = (part: number, whole: number | null | undefined) => (whole ? `${Math.round((part / whole) * 100)}%` : '—');
const viaSummary = computed(() => (d.value?.DiscoveredVia ?? []).map(v => `${providerLabel(v.Name)} ${v.Count}`).join(', '));
</script>

<style scoped>
.ms-fillcard :deep(.body) { display: flex; flex-direction: column; }
.reelgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: var(--ot-space-3); }
@media (max-width: 600px) { .reelgrid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ot-space-2); } }
.ms-more { color: var(--ot-text-2); font-size: 12px; }
.ms-more:hover { color: var(--ot-accent); }
.via { margin-top: var(--ot-space-4); display: flex; flex-direction: column; gap: var(--ot-space-2); }
.via .ot-sectionhead { margin: 0; }
.viabar { display: flex; height: 10px; border-radius: 5px; overflow: hidden; gap: 2px; }
.viabar span { min-width: 3px; }
.ot-legend .swatch { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
</style>
