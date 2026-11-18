<template>
  <div class="msx-view" data-testid="msx-overview">
    <!-- ── pulse + figures ── -->
    <div class="msx-top" :class="{ 'msx-stale': c.stale.value }">
      <div class="msx-rail">
      <section class="msx-pulse" :data-tone="verdict.tone" aria-label="State" data-testid="msx-pulse">
        <div class="msx-pulse__state">
          <span class="msx-pulse__glyph"><MemeIcon :name="glyph" :class="{ 'msx-spin': verdict.tone === 'info' && c.starting.value }" /></span>
          <div style="min-width: 0">
            <h2 class="msx-pulse__title">{{ verdict.title }}</h2>
            <p class="msx-pulse__detail">{{ verdict.detail || ' ' }}</p>
          </div>
        </div>

        <div v-if="progress" class="msx-progress" :title="`${msInt(progress.Done)} of ${msInt(progress.Total)} reel files read`">
          <span :style="{ width: `${Math.round((progress.Done / Math.max(1, progress.Total)) * 100)}%` }"></span>
        </div>

        <dl class="msx-pulse__facts">
          <div class="msx-pulse__fact"><dt>Library</dt><dd class="msx-num">{{ d ? msInt(d.Library.TotalReels) : h ? msInt(h.ReelsOnDisk) : '—' }} <span class="msx-dim" style="font-weight: 400">reels</span></dd></div>
          <div class="msx-pulse__fact"><dt>Last reel</dt><dd>{{ msAgo(d?.Library.LastDownloadUtc, c.now.value, '—') }}</dd></div>
          <div class="msx-pulse__fact"><dt>Next scrape</dt><dd :title="h?.NextScrapeDueUtc ? msStamp(h.NextScrapeDueUtc) : ''">{{ nextScrape }}</dd></div>
        </dl>

        <div class="msx-issues" data-testid="msx-issues">
          <div v-for="issue in issues" :key="issue.id" class="msx-issue" :data-tone="issue.tone" :data-testid="`issue-${issue.id}`">
            <span class="msx-issue__bar"></span>
            <div style="min-width: 0">
              <div class="msx-issue__title">{{ issue.title }}</div>
              <div class="msx-issue__detail">{{ issue.detail }}</div>
            </div>
            <button v-if="issue.action && canAct(issue.action)" class="msx-btn msx-btn--xs" :class="{ 'msx-btn--violet': issue.action.kind === 'pause-sources' }" type="button" @click="$emit('act', issue.action)">
              {{ issue.action.label }}
            </button>
          </div>
          <div v-if="!issues.length && d" class="msx-allclear"><MemeIcon name="check-circle" />Nothing needs you. Every source is scraping normally.</div>
        </div>
      </section>

      <section class="msx-card msx-card--flush" aria-label="Latest scrapes" data-testid="msx-feed">
        <header class="msx-card__head">
          <h2 class="msx-card__title"><MemeIcon name="activity" />Latest scrapes</h2>
          <span class="msx-card__meta">{{ h?.ScrapeHistoryCount ? `${msInt(h.ScrapeHistoryCount)} recorded` : '' }}</span>
          <div class="msx-card__tools"><button class="msx-btn msx-btn--xs msx-btn--ghost" type="button" @click="c.setView('activity')">All<MemeIcon name="chevron-right" /></button></div>
        </header>
        <div class="msx-feed">
          <div v-if="h?.CurrentScrape" class="msx-feed__row msx-feed__now" data-tone="ok">
            <span class="msx-feed__dot msx-live__dot" style="animation: msx-breathe 1.2s infinite"></span>
            <span class="msx-truncate"><span class="msx-feed__who">{{ msCurrentSubject(h.CurrentScrape) }}</span> <span class="msx-feed__what">{{ h.CurrentScrape.startsWith('provider') ? 'provider check running' : h.CurrentScrape.startsWith('profile') ? 'profile refresh running' : 'scraping now' }}</span></span>
            <span class="msx-feed__when">{{ (h.ScrapeQueued ?? 0) > 1 ? `${h.ScrapeQueued - 1} queued` : 'now' }}</span>
          </div>
          <button v-for="s in feed" :key="s.StartedUtc + s.Username" class="msx-feed__row" type="button" :data-tone="feedTone(s)" :title="s.ProviderSummary ?? ''" @click="c.openSource(s.Username)">
            <span class="msx-feed__dot"></span>
            <span class="msx-truncate">
              <span class="msx-feed__who">@{{ s.Username }}</span>
              <span class="msx-feed__what"> · <template v-if="s.Error">failed</template><template v-else-if="s.Downloaded"><span class="msx-feed__new">+{{ s.Downloaded }}</span> new</template><template v-else-if="s.ReelsFound">nothing new</template><template v-else>no reels found</template></span>
            </span>
            <span class="msx-feed__when">{{ msAgo(s.FinishedUtc ?? s.StartedUtc, c.now.value) }}</span>
          </button>
          <div v-if="h && !feed.length && !h.CurrentScrape" class="msx-empty">No scrapes recorded yet.</div>
        </div>
      </section>
      </div>

      <div class="msx-col">
      <div class="msx-kpis">
        <MemeKpi label="Reels saved" icon="film" testid="kpi-reels" :value="k ? msInt(k.Downloaded) : null"
                 :change="cmp(k?.Downloaded, k?.DownloadedPrev)" :baseline="baseline" clickable @open="c.setView('library')">
          <template #foot><template v-if="k"><b>{{ perDay }}</b> a day · library {{ msCompact(k.LibraryAtEnd) }}</template></template>
          <MemeSpark :points="spark" bars label="Reels per bucket" />
        </MemeKpi>
        <MemeKpi label="Active sources" icon="users" testid="kpi-active" :value="k ? `${k.ActiveSources}` : null" :unit="k ? `of ${k.SourcesInScope}` : ''"
                 :change="cmp(k?.ActiveSources, k?.ActiveSourcesPrev)" change-mode="count" :baseline="baseline" clickable
                 :tone="k && k.SourcesInScope && k.ActiveSources < k.SourcesInScope / 2 ? 'warn' : ''" @open="c.setView('sources')">
          <template #foot><template v-if="k">produced a reel<template v-if="emptyCount"> · <b>{{ emptyCount }}</b> never have</template></template></template>
          <MemeSpark :points="activeSpark" bars colour="#57d3c8" label="Reels by source" />
        </MemeKpi>
        <MemeKpi label="Median views" icon="eye" testid="kpi-views" :value="k ? msCompact(k.MedianViews) : null"
                 :change="cmp(k?.MedianViews, k?.MedianViewsPrev)" :baseline="baseline">
          <template #foot><template v-if="k">avg {{ msCompact(k.AvgViews) }} · <b>{{ k.ViralReels }}</b> over 1M</template></template>
          <MemeSpark :points="viewsSpark" colour="#7aa7ff" label="Views captured per bucket" />
        </MemeKpi>
        <MemeKpi label="Engagement" icon="heart" testid="kpi-engagement" :value="k?.MedianEngagementPct != null ? k.MedianEngagementPct.toFixed(2) : k ? '—' : null" unit="%"
                 :change="cmp(k?.MedianEngagementPct, k?.MedianEngagementPctPrev)" change-mode="points" :baseline="baseline">
          <template #foot>median (likes + comments) ÷ views</template>
        </MemeKpi>
        <MemeKpi label="Freshness" icon="clock" testid="kpi-fresh" :value="k ? msHours(k.MedianAgeHours) : null"
                 :change="cmp(k?.MedianAgeHours, k?.MedianAgeHoursPrev)" :good-direction="-1" :baseline="baseline">
          <template #foot>median age when saved (posted → saved)</template>
        </MemeKpi>
        <MemeKpi label="Scrape success" icon="radar" testid="kpi-success" :value="k ? msPct(k.SuccessRate, k.SuccessRate != null && k.SuccessRate < 99.95 && k.SuccessRate > 99 ? 1 : 0) : null"
                 :tone="k?.SuccessRate != null ? (k.SuccessRate < 75 ? 'crit' : k.SuccessRate < 90 ? 'warn' : '') : ''"
                 :change="cmp(k?.SuccessRate, k?.SuccessRatePrev)" change-mode="points" :baseline="baseline" clickable @open="c.setView('activity')">
          <template #foot><template v-if="k">{{ msInt(k.Scrapes) }} scrapes · <b>{{ k.ScrapeFailures }}</b> failed · {{ msDuration((k.MedianScrapeSeconds ?? 0) * 1000) }} each</template></template>
        </MemeKpi>
      </div>

      <section class="msx-card" aria-label="Reels saved over time" :class="{ 'msx-stale': c.stale.value }">
        <header class="msx-card__head">
          <h2 class="msx-card__title"><MemeIcon name="layers" />Reels saved</h2>
          <span class="msx-card__meta">{{ chartMeta }}</span>
          <div class="msx-card__tools">
            <div class="msx-seg" role="group" aria-label="Bars">
              <button class="msx-seg__opt" type="button" :aria-pressed="c.prefs.value.chart === 'stack'" @click="c.prefs.value.chart = 'stack'">By source</button>
              <button class="msx-seg__opt" type="button" :aria-pressed="c.prefs.value.chart === 'total'" @click="c.prefs.value.chart = 'total'">Total</button>
            </div>
            <div class="msx-seg" role="group" aria-label="Bucket size">
              <button v-for="g in GRAINS" :key="g.id" class="msx-seg__opt" type="button" :aria-pressed="(d?.Range.Granularity ?? 'day') === g.id" @click="c.setGranularity(g.id)">{{ g.label }}</button>
            </div>
            <button v-if="d?.Range.HasBaseline" class="msx-btn msx-btn--xs msx-btn--ghost" type="button" :aria-pressed="c.prefs.value.showPrevious" title="Dashed line: the previous period" @click="c.prefs.value.showPrevious = !c.prefs.value.showPrevious">Previous</button>
          </div>
        </header>
        <div class="msx-card__body">
          <MemeChart v-if="d && d.Series.length" :buckets="buckets" :keys="chartKeys" :colours="chartColours" :granularity="d.Range.Granularity"
                     :show-previous="c.prefs.value.showPrevious && d.Range.HasBaseline" :selected="selectedKeys"
                     @zoom="(f, t) => c.zoom(f, t)" @legend="key => c.toggleSource(key)" />
          <div v-else-if="d" class="msx-empty"><MemeIcon name="film" /><b>No reels in this window</b>Try a longer range.</div>
          <div v-else class="msx-skel" style="height: 230px"></div>
          <p v-if="d && d.Range.HasBaseline" class="msx-note" style="margin-top: 6px">Drag across the bars to zoom into those days.</p>
        </div>
      </section>

      <!-- ── top reels ── -->
      <section class="msx-card" aria-label="Most viewed reels">
        <header class="msx-card__head">
          <h2 class="msx-card__title"><MemeIcon name="sparkles" />Most viewed</h2>
          <span class="msx-card__meta">{{ d ? `saved ${d.Range.AllTime ? 'ever' : 'in this window'}, by views when saved` : '' }}</span>
          <div class="msx-card__tools">
            <button v-if="c.allowed.value.read" class="msx-btn msx-btn--xs msx-btn--ghost" type="button" @click="$emit('library', 'views')">Library<MemeIcon name="chevron-right" /></button>
          </div>
        </header>
        <div class="msx-card__body">
          <div v-if="d?.TopReels.length" class="msx-strip" data-testid="msx-top-reels">
            <MemeReelCard v-for="(r, i) in d.TopReels" :key="r.PostID" :reel="r" :rank="i + 1" @open="id => c.openReel(id, d!.TopReels.map(x => x.PostID))" />
          </div>
          <div v-else-if="d" class="msx-empty">No reels saved in this window.</div>
          <div v-else class="msx-strip"><div v-for="i in 8" :key="i" class="msx-skel" style="aspect-ratio: 9 / 14"></div></div>
        </div>
      </section>
      </div>
    </div>


    <!-- ── sources, niches, timing ── -->
    <div class="msx-trio">
      <section class="msx-card" aria-label="Top sources">
        <header class="msx-card__head">
          <h2 class="msx-card__title"><MemeIcon name="users" />Top sources</h2>
          <div class="msx-card__tools"><button class="msx-btn msx-btn--xs msx-btn--ghost" type="button" @click="c.setView('sources')">All {{ d?.Library.Sources ?? '' }}<MemeIcon name="chevron-right" /></button></div>
        </header>
        <div class="msx-card__body">
          <div v-if="topSources.length" class="msx-rank" data-testid="msx-top-sources">
            <button v-for="s in topSources" :key="s.Username" class="msx-rank__row" type="button" :title="`${msInt(s.Downloaded)} reels · median ${msCompact(s.MedianViews)} views · ${msInt(s.TotalReels)} ever`" @click="c.openSource(s.Username)">
              <span class="msx-rank__name"><i :style="{ background: colourOf(s.Username) }"></i><span>@{{ s.Username }}</span></span>
              <span v-if="d?.Range.HasBaseline" class="msx-delta" :data-dir="dirOf(s)">{{ msChangeText(msCompare(s.Downloaded, s.DownloadedPrev)) }}</span>
              <span class="msx-rank__value">{{ msInt(s.Downloaded) }}</span>
              <span class="msx-rank__bar"><span :style="{ width: `${(s.Downloaded / topMax) * 100}%`, background: colourOf(s.Username) }"></span></span>
            </button>
          </div>
          <div v-else class="msx-empty">No source produced a reel in this window.</div>
        </div>
      </section>

      <section class="msx-card" aria-label="Niches">
        <header class="msx-card__head">
          <h2 class="msx-card__title"><MemeIcon name="hash" />Niches</h2>
          <span class="msx-card__meta">click to filter</span>
        </header>
        <div class="msx-card__body">
          <div v-if="niches.length" class="msx-rank">
            <button v-for="n in niches" :key="n.Name" class="msx-rank__row" type="button" :aria-pressed="c.filterNiche.value === n.Name" @click="c.setNiche(c.filterNiche.value === n.Name ? null : n.Name)">
              <span class="msx-rank__name"><span>{{ n.Name }}</span><span class="msx-faint" style="font-size: 11px">{{ n.Sources }} src</span></span>
              <span class="msx-dim msx-num" style="font-size: 11.5px">{{ msCompact(n.MedianViews) }} med.</span>
              <span class="msx-rank__value">{{ msInt(n.Downloaded) }}</span>
              <span class="msx-rank__bar"><span :style="{ width: `${(n.Downloaded / nicheMax) * 100}%`, background: '#c08bff' }"></span></span>
            </button>
          </div>
          <div v-else class="msx-empty">No niches yet. Tag sources from their sheet.</div>
        </div>
      </section>

      <section class="msx-card" aria-label="When sources post">
        <header class="msx-card__head">
          <h2 class="msx-card__title"><MemeIcon name="calendar" />When they post</h2>
          <span class="msx-card__meta">{{ d?.Range.TimeZone ?? '' }}</span>
        </header>
        <div class="msx-card__body">
          <div v-if="d?.Heatmap.length" class="msx-heat" role="img" :aria-label="d.BusiestSlot ? `Busiest: ${d.BusiestSlot}` : 'Posting times'">
            <template v-for="dow in DAYS" :key="dow.i">
              <span class="msx-heat__day">{{ dow.label }}</span>
              <span v-for="hour in 24" :key="hour" class="msx-heat__cell" :style="cellStyle(dow.i, hour - 1)" :title="cellTitle(dow.i, hour - 1)"></span>
            </template>
            <span></span>
            <span v-for="hour in 24" :key="`h${hour}`" class="msx-heat__hour">{{ (hour - 1) % 6 === 0 ? hour - 1 : '' }}</span>
          </div>
          <div v-else class="msx-empty">No posting times in this window.</div>
          <p v-if="d?.BusiestSlot || d?.BestViewsSlot" class="msx-note" style="margin-top: 10px">
            <template v-if="d.BusiestSlot">Busiest <b style="color: var(--msx-ink-2)">{{ d.BusiestSlot }}</b>.</template>
            <template v-if="d.BestViewsSlot"> Most views per reel <b style="color: var(--msx-ink-2)">{{ d.BestViewsSlot }}</b>.</template>
          </p>
          <div v-if="d?.AgeDistribution.length" class="msx-dist" aria-label="How old reels were when saved">
            <div v-for="b in d.AgeDistribution.filter(x => x.Count > 0).slice(0, 5)" :key="b.Label" class="msx-dist__row">
              <span class="msx-dist__label">{{ b.Label }}</span>
              <span class="msx-dist__bar"><span :style="{ width: `${b.Share}%` }"></span></span>
              <span class="msx-dist__value">{{ msPct(b.Share) }}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useMemeConsole } from '~/composables/useMemeConsole';
import {
  msAgo, msChangeText, msCompact, msCompare, msCurrentSubject, msDue, msDuration, msHours, msInt, msPct, msSourceColours, msStamp,
  type MsGranularity, type MsIssueAction, type MsScrape, type MsSource,
} from '~/scripts/memeConsole';
import type { MsChartBucket } from '~/components/Meme/Chart.vue';

defineEmits<{ act: [action: MsIssueAction]; library: [sort: string] }>();
const c = useMemeConsole();

const d = computed(() => c.dashboard.value);
const h = computed(() => c.health.value);
const k = computed(() => d.value?.Kpis ?? null);
const verdict = computed(() => c.verdict.value);
const issues = computed(() => verdict.value.issues.filter(i => i.id !== 'starting'));
const progress = computed(() => (h.value && !h.value.DataLoaded ? h.value.Startup?.Progress ?? null : null));
const emptyCount = computed(() => d.value?.Library.EmptySources ?? d.value?.Sources.filter(s => s.State === 'empty').length ?? 0);

const glyph = computed(() => ({ ok: 'check-circle', warn: 'alert', crit: 'octagon-x', info: 'refresh', violet: 'ghost', neutral: 'pulse' } as Record<string, string>)[verdict.value.tone] ?? 'pulse');
const nextScrape = computed(() => {
  const hh = h.value;
  if (!hh) return '—';
  if (hh.Settings?.Paused) return 'paused';
  if (hh.CurrentScrape) return 'running';
  return msDue(hh.NextScrapeDueUtc, c.now.value);
});

const canAct = (a: MsIssueAction) => {
  if (a.kind === 'pause-sources') return c.allowed.value.manage;
  if (a.kind === 'check-providers' || a.kind === 'resume-schedule') return c.allowed.value.run;
  return true;
};

const cmp = (a: number | null | undefined, b: number | null | undefined) => (d.value?.Range.HasBaseline ? msCompare(a, b) : null);
const baseline = computed(() => (d.value?.Range.HasBaseline ? `against the previous ${d.value.Range.Days} days` : ''));
const perDay = computed(() => (k.value ? k.value.PerDay.toFixed(k.value.PerDay < 10 ? 1 : 0) : ''));
const spark = computed(() => (d.value?.Series ?? []).slice(-40).map(b => b.Downloads));
const viewsSpark = computed(() => (d.value?.Series ?? []).slice(-40).map(b => b.Views));
const activeSpark = computed(() => (d.value?.Sources ?? []).filter(s => s.Downloaded > 0).slice(0, 24).map(s => s.Downloaded));

const GRAINS: { id: MsGranularity; label: string }[] = [{ id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }];

// Colours follow all-time volume, so the biggest accounts keep theirs when the window changes.
const colourMap = computed(() => {
  const ranking = [...(d.value?.Sources ?? [])].sort((a, b) => b.TotalReels - a.TotalReels).map(s => s.Username);
  return msSourceColours([...(d.value?.StackKeys ?? []), ...(d.value?.Sources ?? []).map(s => s.Username)], ranking);
});
const colourOf = (name: string) => colourMap.value[name] ?? '#ff6b9a';
const chartKeys = computed(() => (c.prefs.value.chart === 'stack' ? d.value?.StackKeys ?? [] : ['Reels']));
const chartColours = computed(() => (c.prefs.value.chart === 'stack' ? chartKeys.value.map(colourOf) : ['#ff6b9a']));
const selectedKeys = computed(() => c.filterSources.value.map(s => s.toLowerCase()));
const buckets = computed<MsChartBucket[]>(() => (d.value?.Series ?? []).map(b => ({
  key: b.Key, from: b.From, to: b.To, incomplete: b.Incomplete,
  stack: c.prefs.value.chart === 'stack' ? b.Stack : [b.Downloads],
  previous: b.Previous,
  extra: [`${msCompact(b.Views)} views captured`, ...(b.Scrapes ? [`${b.Scrapes} scrapes${b.ScrapeFailures ? `, ${b.ScrapeFailures} failed` : ''}`] : [])],
})));
const chartMeta = computed(() => {
  const kk = k.value;
  if (!kk) return '';
  const parts = [];
  if (kk.BestDay) parts.push(`best day ${kk.BestDayCount}`);
  if (kk.LongestGapDays) parts.push(`longest gap ${kk.LongestGapDays} d`);
  return parts.join(' · ');
});

const feed = computed<(Omit<MsScrape, 'Status' | 'DurationMs'>)[]>(() => (h.value?.RecentScrapes ?? []).slice(0, h.value?.CurrentScrape ? 8 : 9));
const feedTone = (s: { Error: string | null; Downloaded: number; DownloadFailures: number; ReelsFound: number }) =>
  s.Error ? 'crit' : s.DownloadFailures ? 'warn' : s.Downloaded ? 'ok' : s.ReelsFound ? 'neutral' : 'violet';

const topSources = computed(() => (d.value?.Sources ?? []).filter(s => s.Downloaded > 0).slice(0, 8));
const topMax = computed(() => Math.max(1, ...topSources.value.map(s => s.Downloaded)));
const dirOf = (s: MsSource) => {
  const ch = msCompare(s.Downloaded, s.DownloadedPrev);
  return !ch || !ch.dir ? 'flat' : ch.dir > 0 ? 'up' : 'down';
};

const niches = computed(() => (d.value?.Niches ?? []).filter(n => n.Downloaded > 0 || n.Sources > 0).slice(0, 8));
const nicheMax = computed(() => Math.max(1, ...niches.value.map(n => n.Downloaded)));

const DAYS = [{ i: 1, label: 'Mon' }, { i: 2, label: 'Tue' }, { i: 3, label: 'Wed' }, { i: 4, label: 'Thu' }, { i: 5, label: 'Fri' }, { i: 6, label: 'Sat' }, { i: 0, label: 'Sun' }];
const heat = computed(() => {
  const map = new Map<string, { Reels: number; AvgViews: number }>();
  for (const cell of d.value?.Heatmap ?? []) map.set(`${cell.Dow}-${cell.Hour}`, cell);
  return map;
});
const heatMax = computed(() => Math.max(1, ...(d.value?.Heatmap ?? []).map(x => x.Reels)));
function cellStyle(dow: number, hour: number) {
  const cell = heat.value.get(`${dow}-${hour}`);
  if (!cell) return {};
  const a = 0.12 + (cell.Reels / heatMax.value) * 0.88;
  return { background: `rgba(255, 107, 154, ${a.toFixed(2)})` };
}
function cellTitle(dow: number, hour: number) {
  const cell = heat.value.get(`${dow}-${hour}`);
  const day = DAYS.find(x => x.i === dow)?.label ?? '';
  return cell ? `${day} ${String(hour).padStart(2, '0')}:00 · ${cell.Reels} reels · ${msCompact(cell.AvgViews)} avg views` : `${day} ${String(hour).padStart(2, '0')}:00 · none`;
}
</script>
