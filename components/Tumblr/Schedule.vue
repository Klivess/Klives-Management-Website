<template>
  <section id="tmb-schedule" class="tmb-card" aria-label="Schedule" data-testid="tmb-schedule">
    <header class="tmb-card__head">
      <h2 class="tmb-card__title"><TumblrIcon name="calendar" />Schedule</h2>
      <span class="tmb-card__meta">{{ summary }}</span>
      <div class="tmb-card__tools">
        <div class="tmb-sched__legend">
          <span><i style="background: var(--tmb-accent)"></i>published · size = notes</span>
          <span><i data-shape="pending"></i>queued</span>
          <span><i style="background: var(--tmb-warn)"></i>needs approval</span>
          <span><i style="border: 2px solid var(--tmb-violet)"></i>reblog</span>
          <span><i data-shape="band"></i>Tumblr refusing the server</span>
        </div>
        <div class="tmb-seg" role="group" aria-label="Window">
          <button v-for="w in WINDOWS" :key="w.id" class="tmb-seg__opt" :aria-pressed="windowId === w.id" @click="windowId = w.id">{{ w.label }}</button>
        </div>
      </div>
    </header>
    <div class="tmb-sched">
      <div v-if="!blogs.length" class="tmb-empty"><TumblrIcon name="calendar" /><strong>No blogs yet</strong>Add a blog and its posts appear here on one line each.</div>
      <div v-else class="tmb-sched__grid">
        <div></div>
        <div class="tmb-sched__axis">
          <span v-for="t in labelTicks" :key="t.x" class="tmb-sched__tick" :data-major="t.major || undefined" :style="{ left: pct(t.x) }">{{ t.label }}</span>
          <span v-for="(b, i) in layout.bands" :key="`a${i}`" class="tmb-sched__refused" :style="{ left: pct(b.x0), width: pct(Math.max(0.002, b.x1 - b.x0)) }" :title="bandTitle(b)"></span>
        </div>
        <template v-for="lane in layout.lanes" :key="lane.blog.BlogId">
          <div class="tmb-sched__label" :data-selected="selected === lane.blog.BlogId || undefined">
            <button :title="`Show @${lane.blog.Name} only`" @click="emit('select', selected === lane.blog.BlogId ? null : lane.blog.BlogId)">
              <TumblrAvatar :src="lane.blog.AvatarUrl" :name="lane.blog.Name" :size="20" />
              <span class="tmb-sched__name tmb-truncate">@{{ lane.blog.Name }}</span>
            </button>
          </div>
          <div class="tmb-sched__lane" :data-selected="selected === lane.blog.BlogId || undefined">
            <button v-for="m in lane.markers" :key="m.post.PostId" class="tmb-mark" :data-kind="m.kind" :data-tone="m.tone"
                    :style="{ left: pct(m.x), width: `${m.size}px`, height: `${m.size}px` }"
                    :aria-label="describe(m)" data-testid="tmb-mark"
                    @mouseenter="hover(m, $event)" @mouseleave="tip = null" @focus="hover(m, $event)" @blur="tip = null" @click="emit('open', m.post.PostId)">
              <span v-if="m.kind === 'published' && m.post.Notes > 0 && m.size >= 14" class="tmb-mark__count">{{ fmtCount(m.post.Notes) }}</span>
            </button>
          </div>
        </template>
        <div class="tmb-sched__overlay">
          <div class="tmb-sched__past" :style="{ width: pct(layout.nowX) }"></div>
          <span v-for="t in layout.ticks" :key="`g${t.x}`" class="tmb-sched__gridline" :data-major="t.major || undefined" :style="{ left: pct(t.x) }"></span>
          <span v-for="(b, i) in layout.bands" :key="`b${i}`" class="tmb-sched__band" :data-ongoing="b.ongoing || undefined"
                :style="{ left: pct(b.x0), width: pct(Math.max(0.002, b.x1 - b.x0)) }"
                :title="bandTitle(b)" data-testid="tmb-band"></span>
          <span class="tmb-sched__now" :style="{ left: pct(layout.nowX) }"><span>now</span></span>
        </div>
      </div>
    </div>
    <Teleport to="body">
      <div v-if="tip" class="tmb-layer" style="pointer-events: none">
        <div class="tmb-tip" :style="{ left: `${tip.x}px`, top: `${tip.y}px` }">
          <TumblrThumb :path="tmbThumb(tip.marker.post)" :kind="tip.marker.post.Kind" size="sm" />
          <div style="min-width: 0">
            <p class="tmb-tip__cap">{{ tmbCaption(tip.marker.post) }}</p>
            <p class="tmb-tip__meta">@{{ tip.marker.post.BlogName }} · {{ fmtWhen(tmbDueUtc(tip.marker.post)) }} · {{ fmtRelative(tmbDueUtc(tip.marker.post), now) }}</p>
            <p class="tmb-tip__meta">{{ tmbStatusLabel(tip.marker.post.Status) }}<template v-if="tip.marker.kind === 'published'"> · {{ fmtCount(tip.marker.post.Notes) }} notes</template><template v-if="tip.marker.post.BlockedReason"> · {{ tip.marker.post.BlockedReason }}</template></p>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { fmtCount, fmtRelative, fmtWhen, type BlogSummary } from '~/composables/useOmniTumblr';
import {
  tmbCaption, tmbClock, tmbDueUtc, tmbMinutes, tmbStatusLabel, tmbThumb, tumblrSchedule,
  type TmbBand, type TmbEdgeSpan, type TmbMarker, type TmbPost,
} from '~/scripts/tumblrConsole';

const props = defineProps<{ blogs: BlogSummary[]; posts: TmbPost[]; spans: TmbEdgeSpan[]; now: number; selected: string | null }>();
const emit = defineEmits<{ open: [postId: string]; select: [blogId: string | null] }>();

const WINDOWS = [
  { id: 'day', label: '−12 h / +24 h', past: 12, future: 24 },
  { id: 'default', label: '−24 h / +48 h', past: 24, future: 48 },
  { id: 'week', label: '−3 d / +7 d', past: 72, future: 168 },
] as const;
const windowId = ref<(typeof WINDOWS)[number]['id']>('default');
const win = computed(() => WINDOWS.find(w => w.id === windowId.value)!);

/** Minute resolution is plenty and keeps the layout from rebuilding on every clock tick. */
const minute = computed(() => Math.floor(props.now / 60_000) * 60_000);
const layout = computed(() => tumblrSchedule(props.blogs, props.posts, props.spans, minute.value, win.value.past, win.value.future));

const summary = computed(() => {
  let out = 0;
  let queued = 0;
  for (const lane of layout.value.lanes) for (const m of lane.markers) { if (m.kind === 'pending') queued++; else out++; }
  const refused = layout.value.bands.reduce((s, b) => s + (b.x1 - b.x0), 0) * (layout.value.toMs - layout.value.fromMs) / 60_000;
  const parts = [`${out} out`, `${queued} queued`];
  if (refused > 1) parts.push(`Tumblr refused ${tmbMinutes(refused)} of this window`);
  return parts.join(' · ');
});

const pct = (x: number) => `${(x * 100).toFixed(3)}%`;
/** Hour labels, minus the one the "now" pill would sit on. */
const labelTicks = computed(() => layout.value.ticks.filter(t => t.major || Math.abs(t.x - layout.value.nowX) > 0.035));

function describe(m: TmbMarker): string {
  return `@${m.post.BlogName}, ${tmbStatusLabel(m.post.Status)} ${fmtWhen(tmbDueUtc(m.post))}${m.kind === 'published' ? `, ${m.post.Notes} notes` : ''}: ${tmbCaption(m.post)}`;
}

function bandTitle(b: TmbBand): string {
  return `Tumblr refused the server ${tmbClock(b.fromUtc)}–${b.toUtc ? tmbClock(b.toUtc) : 'now'}${b.trigger ? ` (first refused: ${b.trigger})` : ''}`;
}

const tip = ref<{ marker: TmbMarker; x: number; y: number } | null>(null);
function hover(marker: TmbMarker, event: Event) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const x = Math.min(window.innerWidth - 290, Math.max(10, rect.left + rect.width / 2 - 135));
  const y = rect.top > 140 ? rect.top - 108 : rect.bottom + 10;
  tip.value = { marker, x, y };
}
</script>
