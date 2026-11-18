<template>
  <div class="tmb-pane" data-testid="tmb-queue">
    <div v-if="awaiting.length && canAct" class="tmb-note" data-tone="warn">
      <TumblrIcon name="inbox" />
      <div style="flex: 1"><strong>{{ tmbPlural(awaiting.length, 'post') }} waiting for your approval.</strong> Nothing on autopilot goes out until it is approved. Open one to edit it first.</div>
      <button class="tmb-btn tmb-btn--sm tmb-btn--ok" data-testid="tmb-approve-all" @click="emit('approve-all')"><TumblrIcon name="check" />Approve all</button>
    </div>

    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
      <div class="tmb-seg" role="group" aria-label="Show">
        <button v-for="f in FILTERS" :key="f.id" class="tmb-seg__opt" :aria-pressed="filter === f.id" @click="filter = f.id">{{ f.label }}<span v-if="count(f.id)" class="tmb-count">{{ count(f.id) }}</span></button>
      </div>
      <span class="tmb-dim" style="font-size: 11.5px; margin-left: auto">Soonest first · click a post to edit it</span>
    </div>

    <div v-if="!shown.length" class="tmb-empty">
      <TumblrIcon name="clock" />
      <strong>{{ filter === 'all' ? 'Nothing queued' : 'Nothing here' }}</strong>
      <template v-if="filter === 'all'">{{ autopilotOn ? 'Autopilot plans a few days ahead; Plan now fills empty slots at once.' : 'Compose a post, or switch a blog\'s autopilot on.' }}</template>
    </div>
    <template v-for="group in groups" :key="group.label">
      <div class="tmb-day">{{ group.label }}<span class="tmb-count">{{ group.items.length }}</span></div>
      <div v-for="p in group.items" :key="p.PostId" class="tmb-row" :data-tone="rowTone(p)" :data-testid="`queue-${p.PostId}`">
        <TumblrThumb :path="tmbThumb(p)" :kind="p.Kind" size="sm" :badge="p.IsVideo && p.DurationSeconds ? fmtClipLength(p.DurationSeconds) : null" />
        <div class="tmb-row__main" role="button" tabindex="0" @click="emit('open', p.PostId)" @keydown.enter.prevent="emit('open', p.PostId)">
          <div class="tmb-row__meta">
            <span v-if="showBlog" class="tmb-row__blog">@{{ p.BlogName }}</span>
            <span :title="fmtWhen(tmbDueUtc(p))">{{ tmbClock(tmbDueUtc(p)) }} · {{ fmtRelative(tmbDueUtc(p), now) }}</span>
            <span class="tmb-chip" :data-tone="tmbStatusTone(p.Status)">{{ tmbStatusLabel(p.Status) }}</span>
            <span v-if="p.Kind === 'Reblog'" class="tmb-chip" data-tone="violet">reblog{{ p.ReblogTag ? ` · #${p.ReblogTag}` : '' }}</span>
            <span v-else-if="p.Origin === 'Manual'" class="tmb-chip" data-tone="neutral">yours</span>
            <span v-if="p.TumblrState !== 'Published'" class="tmb-chip" data-tone="neutral">{{ p.TumblrState.toLowerCase() }}</span>
          </div>
          <p class="tmb-row__cap" :data-muted="!p.Caption || p.CaptionPending || undefined">{{ tmbCaption(p) }}</p>
          <div v-if="p.Tags.length" class="tmb-row__tags">
            <span v-for="t in p.Tags.slice(0, 7)" :key="t" class="tmb-tag">#{{ t }}</span>
            <span v-if="p.Tags.length > 7" class="tmb-faint" style="font-size: 11px">+{{ p.Tags.length - 7 }}</span>
          </div>
          <p v-if="p.BlockedReason" class="tmb-row__notice" data-tone="warn">{{ p.BlockedReason }}</p>
        </div>
        <div class="tmb-row__side">
          <div class="tmb-row__actions">
            <button v-if="p.Status === 'AwaitingApproval' && canAct" class="tmb-btn tmb-btn--xs tmb-btn--ok" :data-testid="`approve-${p.PostId}`" @click="emit('action', 'approve', p.PostId)"><TumblrIcon name="check" />Approve</button>
            <button v-if="canPublish && p.Status !== 'Publishing'" class="tmb-btn tmb-btn--xs" title="Publish now, ignoring the schedule" @click="emit('action', 'publish-now', p.PostId)"><TumblrIcon name="send" />Now</button>
            <button v-if="canAct && p.Origin === 'Autopilot' && p.Kind !== 'Reblog' && p.Status !== 'Publishing'" class="tmb-iconbtn tmb-iconbtn--sm" title="Swap the content" aria-label="Swap the content" @click="emit('action', 'swap-content', p.PostId)"><TumblrIcon name="swap" /></button>
            <button v-if="canAct && p.Status !== 'Publishing'" class="tmb-iconbtn tmb-iconbtn--sm" :title="p.Origin === 'Autopilot' && p.Kind !== 'Reblog' ? 'Skip this slot' : 'Cancel'" aria-label="Skip or cancel" @click="emit('action', p.Origin === 'Autopilot' && p.Kind !== 'Reblog' ? 'skip' : 'cancel', p.PostId)"><TumblrIcon name="skip" /></button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { fmtClipLength, fmtRelative, fmtWhen } from '~/composables/useOmniTumblr';
import {
  tmbCaption, tmbClock, tmbDueUtc, tmbGroupByDay, tmbPlural, tmbStatusLabel, tmbStatusTone, tmbThumb, type TmbPost,
} from '~/scripts/tumblrConsole';

const props = defineProps<{ posts: TmbPost[]; now: number; showBlog: boolean; canAct: boolean; canPublish: boolean; autopilotOn: boolean }>();
const emit = defineEmits<{ open: [postId: string]; action: [action: string, postId: string]; 'approve-all': [] }>();

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'approval', label: 'Needs approval' },
  { id: 'held', label: 'On hold' },
  { id: 'yours', label: 'Yours' },
  { id: 'reblogs', label: 'Reblogs' },
] as const;
type Filter = (typeof FILTERS)[number]['id'];
const filter = ref<Filter>('all');

const awaiting = computed(() => props.posts.filter(p => p.Status === 'AwaitingApproval'));
function matches(p: TmbPost, f: Filter): boolean {
  switch (f) {
    case 'approval': return p.Status === 'AwaitingApproval';
    case 'held': return !!p.BlockedReason || p.CaptionPending;
    case 'yours': return p.Origin === 'Manual';
    case 'reblogs': return p.Kind === 'Reblog';
    default: return true;
  }
}
const count = (f: Filter) => (f === 'all' ? 0 : props.posts.filter(p => matches(p, f)).length);
const shown = computed(() => props.posts.filter(p => matches(p, filter.value)));
const groups = computed(() => tmbGroupByDay(shown.value, tmbDueUtc, props.now, true));

function rowTone(p: TmbPost): string | undefined {
  if (p.Status === 'AwaitingApproval' || p.BlockedReason) return 'warn';
  return undefined;
}
</script>
