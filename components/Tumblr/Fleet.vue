<template>
  <section id="tmb-fleet" class="tmb-card" aria-label="Blogs" data-testid="tmb-fleet">
    <header class="tmb-card__head">
      <h2 class="tmb-card__title"><TumblrIcon name="layers" />Blogs</h2>
      <span class="tmb-card__meta">{{ meta }}</span>
      <div class="tmb-card__tools">
        <span class="tmb-dim" style="font-size: 11.5px">Click a blog to show only it below</span>
        <button v-if="canManage" class="tmb-btn tmb-btn--sm" data-testid="tmb-add-blogs" @click="emit('add')"><TumblrIcon name="plus" />Add blogs</button>
      </div>
    </header>
    <div v-if="!loaded" class="tmb-card__body" style="display: grid; gap: 8px">
      <div v-for="n in 3" :key="n" class="tmb-skel" style="height: 34px"></div>
    </div>
    <div v-else-if="!blogs.length" class="tmb-empty">
      <TumblrIcon name="layers" /><strong>No blogs yet</strong>
      Connect a Tumblr account and pick the blogs OmniTumblr should run: each gets a schedule, a content source and a caption voice.
      <button v-if="canManage" class="tmb-btn tmb-btn--primary" style="margin-top: 6px" @click="emit('add')">Add your first blog</button>
    </div>
    <div v-else class="tmb-tablewrap">
      <table class="tmb-table">
        <thead>
          <tr>
            <th>Blog</th>
            <th>State</th>
            <th class="num">Followers</th>
            <th>Posts, 7 days</th>
            <th class="num" title="Average notes on the blog's own posts, last 30 days">Notes / post</th>
            <th class="num">Queue</th>
            <th>Next post</th>
            <th title="From the event log, last 7 days">This week</th>
            <th>Autopilot</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in blogs" :key="b.BlogId" data-clickable :data-selected="selected === b.BlogId || undefined" :data-testid="`fleet-${b.Name}`"
              @click="emit('select', selected === b.BlogId ? null : b.BlogId)">
            <td>
              <div class="tmb-blogcell">
                <TumblrAvatar :src="b.AvatarUrl" :name="b.Name" :size="30" />
                <div style="min-width: 0">
                  <div class="tmb-blogcell__name">@{{ b.Name }}</div>
                  <div class="tmb-blogcell__title">{{ b.Title || 'Untitled' }}</div>
                </div>
              </div>
            </td>
            <td><span class="tmb-chip tmb-chip--dot" :data-tone="tmbBlogTone(b.State)" :title="b.StateReason">{{ tmbBlogStateLabel(b) }}</span></td>
            <td class="num">
              <b>{{ fmtCount(b.Followers) }}</b>
              <span v-if="b.FollowersDelta7d" :class="b.FollowersDelta7d > 0 ? 'tmb-pos' : 'tmb-neg'" style="font-size: 11px; margin-left: 4px">{{ fmtSignedCount(b.FollowersDelta7d) }}</span>
            </td>
            <td>
              <div style="display: flex; align-items: center; gap: 8px">
                <span class="tmb-num" style="min-width: 34px">{{ b.Published7d }}<span class="tmb-faint">/{{ b.SlotsPerWeek }}</span></span>
                <span class="tmb-meter" :title="`${b.Published7d} published of ${b.SlotsPerWeek} slots a week`"><span :style="{ width: `${Math.min(100, b.SlotsPerWeek ? (b.Published7d / b.SlotsPerWeek) * 100 : 0)}%` }" :data-tone="paceTone(b)"></span></span>
              </div>
            </td>
            <td class="num" :class="{ 'tmb-dim': b.AvgNotes30d == null }">{{ b.AvgNotes30d ?? '—' }}</td>
            <td class="num">
              {{ b.Pending }}
              <span v-if="b.AwaitingApproval" class="tmb-count" data-tone="warn" :title="`${b.AwaitingApproval} waiting for approval`" style="margin-left: 4px">{{ b.AwaitingApproval }}</span>
            </td>
            <td class="tmb-dim" style="white-space: nowrap" :title="b.NextPost ? fmtWhen(b.NextPost.ScheduledUtc) : ''">
              <template v-if="b.NextPost">{{ new Date(b.NextPost.ScheduledUtc).getTime() < now - 60_000 ? 'due now' : fmtRelative(b.NextPost.ScheduledUtc, now) }}</template>
              <template v-else>{{ b.Autopilot ? 'planning…' : '—' }}</template>
            </td>
            <td>
              <span class="tmb-signals">
                <template v-for="s in signals(b.BlogId)" :key="s.label">
                  <span :data-tone="s.tone" :title="s.title">{{ s.label }}</span>
                </template>
              </span>
            </td>
            <td @click.stop>
              <button class="tmb-switch" role="switch" :aria-checked="b.Autopilot" :aria-label="`Autopilot for @${b.Name}`" :disabled="!canManage"
                      :title="canManage ? (b.Autopilot ? 'Plans and publishes on the schedule' : 'Only posts you compose go out') : 'Needs “Manage blogs”'"
                      :data-testid="`autopilot-${b.Name}`" @click="emit('autopilot', b.BlogId, !b.Autopilot)"></button>
            </td>
            <td class="num" @click.stop>
              <div style="display: inline-flex; gap: 2px">
                <button v-if="canManage" class="tmb-iconbtn tmb-iconbtn--sm" :title="b.Paused ? 'Resume' : 'Pause'" :aria-label="b.Paused ? `Resume @${b.Name}` : `Pause @${b.Name}`" @click="emit('pause', b.BlogId, !b.Paused)">
                  <TumblrIcon :name="b.Paused ? 'play' : 'pause'" />
                </button>
                <button v-if="canAct" class="tmb-iconbtn tmb-iconbtn--sm" title="Compose for this blog" :aria-label="`Compose for @${b.Name}`" @click="emit('compose', b.BlogId)"><TumblrIcon name="edit" /></button>
                <a class="tmb-iconbtn tmb-iconbtn--sm" :href="b.Url ?? `https://${b.Name}.tumblr.com/`" target="_blank" rel="noopener noreferrer" :aria-label="`@${b.Name} on Tumblr`" title="Open on Tumblr"><TumblrIcon name="external" /></a>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { fmtCount, fmtRelative, fmtSignedCount, fmtWhen, type BlogSummary } from '~/composables/useOmniTumblr';
import { tmbBlogStateLabel, tmbBlogTone, type TmbBlogWeek, type TmbTone } from '~/scripts/tumblrConsole';

const props = defineProps<{ blogs: BlogSummary[]; week: TmbBlogWeek[]; selected: string | null; now: number; loaded: boolean; canManage: boolean; canAct: boolean }>();
const emit = defineEmits<{ select: [blogId: string | null]; autopilot: [blogId: string, on: boolean]; pause: [blogId: string, paused: boolean]; compose: [blogId: string]; add: [] }>();

const meta = computed(() => {
  const followers = props.blogs.reduce((s, b) => s + (b.Followers ?? 0), 0);
  const slots = props.blogs.reduce((s, b) => s + b.SlotsPerWeek, 0);
  return `${props.blogs.length} blog${props.blogs.length === 1 ? '' : 's'} · ${fmtCount(followers)} followers · ${slots} slots a week`;
});

function paceTone(b: BlogSummary): TmbTone {
  if (!b.SlotsPerWeek) return 'neutral';
  const share = b.Published7d / b.SlotsPerWeek;
  return share >= 0.85 ? 'accent' : share >= 0.5 ? 'warn' : 'crit';
}

/** The week in a few glyphs: what went out late, what was skipped, what reblogs found. */
function signals(blogId: string): { label: string; tone?: TmbTone; title: string }[] {
  const w = props.week.find(x => x.BlogId === blogId);
  if (!w) return [{ label: '—', title: 'The server does not report this yet' }];
  const out: { label: string; tone?: TmbTone; title: string }[] = [];
  if (w.EdgeWaits) out.push({ label: `⏳${w.EdgeWaits}`, tone: 'warn', title: `${w.EdgeWaits} time(s) a due post waited for Tumblr to answer the server` });
  if (w.Missed) out.push({ label: `↷${w.Missed}`, tone: 'crit', title: `${w.Missed} slot(s) missed and skipped` });
  if (w.Failed) out.push({ label: `✕${w.Failed}`, tone: 'crit', title: `${w.Failed} post(s) failed` });
  if (w.ReblogsPicked || w.ReblogsEmpty) out.push({ label: `⟳${w.ReblogsPicked}/${w.ReblogsPicked + w.ReblogsEmpty}`, tone: w.ReblogsPicked ? 'violet' : 'neutral', title: `Reblogs: ${w.ReblogsPicked} picked, ${w.ReblogsEmpty} passes found nothing` });
  if (!out.length) out.push({ label: '✓', tone: 'ok', title: 'Nothing went wrong this week' });
  return out;
}
</script>
