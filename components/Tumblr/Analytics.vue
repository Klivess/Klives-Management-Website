<template>
  <div class="tmb-pane" data-testid="tmb-analytics">
    <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap">
      <div class="tmb-seg" role="group" aria-label="Range">
        <button v-for="r in RANGES" :key="r.days" class="tmb-seg__opt" :aria-pressed="days === r.days" @click="emit('days', r.days)">{{ r.label }}</button>
      </div>
      <span class="tmb-dim" style="font-size: 12px">{{ data ? `${fmtDate(data.FromUtc)} – ${fmtDate(data.ToUtc)} · ${scopeLabel}` : 'Loading…' }}</span>
    </div>

    <div v-if="!data" style="display: grid; gap: 10px"><div class="tmb-skel" style="height: 70px"></div><div class="tmb-skel" style="height: 200px"></div></div>
    <template v-else>
      <div class="tmb-minikpis">
        <div class="tmb-minikpi"><b>{{ fmtCount(data.Followers) }}</b><span>followers{{ data.FollowersDelta != null ? ` · ${fmtSignedCount(data.FollowersDelta)} in range` : '' }}</span></div>
        <div class="tmb-minikpi"><b>{{ data.PostsPublished }}</b><span>posts · {{ change(data.PostsPublished, data.PostsPublishedPrev) }}</span></div>
        <div class="tmb-minikpi"><b>{{ fmtCount(data.Notes) }}</b><span>notes · {{ change(data.Notes, data.NotesPrev) }}</span></div>
        <div class="tmb-minikpi"><b>{{ data.AvgNotes ?? '—' }}</b><span>notes a post{{ data.MedianNotes != null ? ` · median ${data.MedianNotes}` : '' }}</span></div>
        <div class="tmb-minikpi"><b>{{ data.EngagementRate != null ? `${data.EngagementRate.toFixed(2)}%` : '—' }}</b><span>notes a post ÷ followers</span></div>
        <div class="tmb-minikpi"><b>{{ data.Likes != null ? `${fmtCount(data.Likes)} · ${fmtCount(data.Reblogs)} · ${fmtCount(data.Replies)}` : '—' }}</b><span>likes · reblogs · replies</span></div>
      </div>

      <div class="tmb-cols">
        <div class="tmb-panel">
          <div class="tmb-panel__title"><TumblrIcon name="user" />Followers<small>{{ data.FollowersGrowthPerWeek != null ? `${fmtSignedCount(data.FollowersGrowthPerWeek)} a week` : '' }}</small></div>
          <svg v-if="line" class="tmb-line" viewBox="0 0 400 150" preserveAspectRatio="none" role="img" :aria-label="`Followers from ${line.first} to ${line.last}`">
            <defs><linearGradient id="tmb-fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--tmb-accent)" stop-opacity="0.3" /><stop offset="1" stop-color="var(--tmb-accent)" stop-opacity="0" /></linearGradient></defs>
            <line v-for="g in line.grid" :key="g.y" x1="0" :y1="g.y" x2="400" :y2="g.y" stroke="var(--tmb-line)" vector-effect="non-scaling-stroke" />
            <path :d="line.area" fill="url(#tmb-fl)" />
            <path :d="line.path" fill="none" stroke="var(--tmb-accent)" stroke-width="1.8" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
          </svg>
          <div v-if="line" style="display: flex; justify-content: space-between; font-size: 11px" class="tmb-faint"><span>{{ line.from }} · {{ line.first }}</span><span>{{ line.last }} · {{ line.to }}</span></div>
          <div v-else class="tmb-empty">Not enough readings yet: followers are recorded every few hours.</div>
        </div>

        <div class="tmb-panel">
          <div class="tmb-panel__title"><TumblrIcon name="chart" />Notes by publishing day<small>{{ postedDays }} days with posts</small></div>
          <div v-if="bars.length" class="tmb-bars" role="img" :aria-label="`Notes earned by each ${weekly ? 'week' : 'day'}'s posts`">
            <div v-for="b in bars" :key="b.key" class="tmb-bars__col" :title="b.title">
              <span :style="{ height: `${b.others}%`, background: 'var(--tmb-teal)', opacity: 0.55 }"></span>
              <span :style="{ height: `${b.ours}%`, background: 'var(--tmb-accent)' }"></span>
            </div>
          </div>
          <div v-else class="tmb-empty">No posts in this range.</div>
          <div class="tmb-sched__legend" style="margin-top: 6px"><span><i style="background: var(--tmb-accent)"></i>by OmniTumblr</span><span><i style="background: var(--tmb-teal)"></i>posted on Tumblr directly</span></div>
        </div>
      </div>

      <div class="tmb-cols">
        <div class="tmb-panel" style="overflow-x: auto">
          <div class="tmb-panel__title"><TumblrIcon name="clock" />Best times to post<small>{{ data.BestSlotLabel ?? `average notes by hour, ${data.TimeZone}` }}</small></div>
          <div v-if="data.Heatmap.length" class="tmb-heat" role="table" :aria-label="`Average notes by weekday and hour, ${data.TimeZone}`">
            <span></span>
            <span v-for="h in 24" :key="`h${h}`" style="text-align: center">{{ (h - 1) % 6 === 0 ? String(h - 1).padStart(2, '0') : '' }}</span>
            <template v-for="d in WEEK_ORDER" :key="d">
              <span style="align-self: center">{{ DAY_SHORT[d] }}</span>
              <span v-for="h in 24" :key="`${d}-${h}`" class="tmb-heat__cell" :style="heatStyle(d, h - 1)" :title="heatTitle(d, h - 1)"></span>
            </template>
          </div>
          <div v-else class="tmb-empty">Fills in as the blog posts at different times.</div>
          <p class="tmb-help" style="margin-top: 6px">{{ data.SampleSize }} posts in the sample.</p>
        </div>

        <div class="tmb-panel">
          <div class="tmb-panel__title"><TumblrIcon name="heart" />Top posts<small>including posts made on Tumblr directly</small></div>
          <ol v-if="data.TopPosts.length" class="tmb-feed">
            <li v-for="(t, i) in data.TopPosts.slice(0, 8)" :key="t.Id" style="grid-template-columns: 18px 36px minmax(0, 1fr) auto; align-items: center">
              <span class="tmb-faint tmb-num">{{ i + 1 }}</span>
              <TumblrThumb size="xs" :kind="t.Type === 'video' ? 'Video' : t.Type === 'photo' ? 'Photo' : 'Text'" :path="t.HasThumbnail && t.OmniPostId ? postThumbPath(t.OmniPostId) : null" />
              <div style="min-width: 0">
                <a class="tmb-truncate" style="display: block" :href="t.Url ?? undefined" target="_blank" rel="noopener noreferrer">{{ t.Summary || `${t.Type ?? 'post'} ${t.Id}` }}</a>
                <span class="tmb-feed__when">{{ showBlog && t.BlogName ? `@${t.BlogName} · ` : '' }}{{ fmtDate(t.PublishedUtc) }}{{ t.Ours ? '' : ' · not by OmniTumblr' }}</span>
              </div>
              <b class="tmb-num">{{ fmtCount(t.Notes) }}</b>
            </li>
          </ol>
          <div v-else class="tmb-empty">No posts in this range.</div>
        </div>
      </div>

      <div class="tmb-cols tmb-cols--3">
        <div v-for="r in rankings" :key="r.title" class="tmb-panel">
          <div class="tmb-panel__title">{{ r.title }}<small>avg notes · posts</small></div>
          <div v-if="r.items.length" class="tmb-ranked">
            <div v-for="item in r.items" :key="item.Key" class="tmb-ranked__row" :title="`${item.Posts} posts · ${item.TotalNotes} notes`">
              <div class="tmb-ranked__bar"><span :style="{ width: `${(item.AvgNotes / r.max) * 100}%` }"></span><em>{{ r.prefix }}{{ item.Key }}</em></div>
              <span class="tmb-num" style="text-align: right">{{ item.AvgNotes }} <span class="tmb-faint">· {{ item.Posts }}</span></span>
            </div>
          </div>
          <div v-else class="tmb-empty" style="padding: 12px">Not enough posts yet.</div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { DAY_LONG, DAY_SHORT, WEEK_ORDER, fmtCount, fmtDate, fmtSignedCount, postThumbPath, type Analytics } from '~/composables/useOmniTumblr';

const props = defineProps<{ data: Analytics | null; days: number; scopeLabel: string; showBlog: boolean }>();
const emit = defineEmits<{ days: [days: number] }>();

const RANGES = [{ days: 7, label: '7 d' }, { days: 30, label: '30 d' }, { days: 90, label: '90 d' }, { days: 365, label: '1 y' }];

function change(current: number, previous: number): string {
  if (!previous) return current ? 'none the period before' : 'none';
  const pct = ((current - previous) / previous) * 100;
  return `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(0)}% vs before`;
}

const line = computed(() => {
  const pts = props.data?.FollowersSeries ?? [];
  if (pts.length < 2) return null;
  const vs = pts.map(p => p.V);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const span = max - min || 1;
  const y = (v: number) => 140 - ((v - min) / span) * 124;
  const step = 400 / (pts.length - 1);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${y(p.V).toFixed(1)}`).join(' ');
  return {
    path, area: `${path} L400,150 L0,150 Z`,
    grid: [16, 78, 140].map(g => ({ y: g })),
    first: fmtCount(vs[0]), last: fmtCount(vs[vs.length - 1]),
    from: fmtDate(pts[0].T), to: fmtDate(pts[pts.length - 1].T),
  };
});

const weekly = computed(() => (props.data?.Posting.length ?? 0) > 120);
const postedDays = computed(() => (props.data?.Posting ?? []).filter(d => d.Ours + d.Others > 0).length);
const bars = computed(() => {
  const days = props.data?.Posting ?? [];
  if (!days.some(d => d.Ours + d.Others > 0)) return [];
  const buckets: { key: string; ours: number; others: number; notes: number; label: string }[] = [];
  const size = weekly.value ? 7 : 1;
  for (let i = 0; i < days.length; i += size) {
    const chunk = days.slice(i, i + size);
    buckets.push({
      key: chunk[0].Day,
      ours: chunk.reduce((s, d) => s + d.Ours, 0),
      others: chunk.reduce((s, d) => s + d.Others, 0),
      notes: chunk.reduce((s, d) => s + d.Notes, 0),
      label: new Date(`${chunk[0].Day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
    });
  }
  const max = Math.max(1, ...buckets.map(b => b.notes));
  return buckets.map(b => {
    const posts = b.ours + b.others;
    // Square root, so one post that took off does not flatten every other day; a posted day with no notes is a sliver.
    const height = posts ? Math.max(2, Math.sqrt(b.notes / max) * 100) : 0;
    return {
      key: b.key,
      ours: posts ? (height * b.ours) / posts : 0,
      others: posts ? (height * b.others) / posts : 0,
      title: posts ? `${b.label}: ${b.ours} by OmniTumblr, ${b.others} elsewhere, ${fmtCount(b.notes)} notes` : `${b.label}: no posts`,
    };
  });
});

const heatMap = computed(() => new Map((props.data?.Heatmap ?? []).map(c => [`${c.Dow}:${c.Hour}`, c])));
const heatMax = computed(() => Math.max(1, ...(props.data?.Heatmap ?? []).map(c => c.AvgNotes)));
function heatStyle(day: number, hour: number) {
  const cell = heatMap.value.get(`${day}:${hour}`);
  if (!cell) return {};
  const t = Math.sqrt(cell.AvgNotes / heatMax.value);
  return { background: `rgba(255, 122, 89, ${(0.12 + 0.85 * t).toFixed(3)})` };
}
function heatTitle(day: number, hour: number) {
  const cell = heatMap.value.get(`${day}:${hour}`);
  const span = `${DAY_LONG[day]} ${String(hour).padStart(2, '0')}:00`;
  return cell ? `${span}: ${cell.AvgNotes} notes on average over ${cell.Posts} post(s)` : `${span}: no posts`;
}

const rankings = computed(() => {
  const d = props.data;
  const make = (title: string, items: { Key: string; Posts: number; AvgNotes: number; TotalNotes: number }[] | undefined, prefix = '') => {
    const list = (items ?? []).slice(0, 8);
    return { title, items: list, prefix, max: Math.max(1, ...list.map(i => i.AvgNotes)) };
  };
  return [make('Tags that work', d?.Tags, '#'), make('Content sources', d?.Sources, '@'), make('Caption styles', d?.CaptionModes)];
});
</script>
