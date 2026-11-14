<template>
  <div class="tmb-pane" data-testid="tmb-activity">
    <div class="tmb-cols">
      <div class="tmb-panel">
        <div class="tmb-panel__title"><TumblrIcon name="heart" />On Tumblr<small>{{ activity ? `${activity.length} recent` : '' }}</small></div>
        <template v-if="activity">
          <ul v-if="activity.length" class="tmb-feed">
            <li v-for="a in activity.slice(0, 60)" :key="a.Id">
              <span class="tmb-feed__glyph" :data-tone="a.Type === 'follow' ? 'ok' : a.Type.startsWith('reblog') ? 'violet' : a.Type === 'like' ? 'accent' : 'info'">{{ activityGlyph(a.Type) }}</span>
              <div style="min-width: 0"><b>@{{ a.FromBlog ?? 'someone' }}</b> {{ ACTIVITY_LABEL[a.Type] ?? a.Type.replace(/_/g, ' ') }}<span v-if="a.Text" class="tmb-dim"> — “{{ a.Text }}”</span></div>
              <span class="tmb-feed__when" :title="fmtWhen(a.Utc)">{{ fmtRelative(a.Utc, now) }}</span>
            </li>
          </ul>
          <div v-else class="tmb-empty">Nothing yet: likes, reblogs, replies and follows show here as Tumblr reports them.</div>
        </template>
        <div v-else class="tmb-empty">Pick a blog to see what people did with its posts.</div>
      </div>

      <div class="tmb-panel">
        <div class="tmb-panel__title">
          <TumblrIcon name="history" />What OmniTumblr did
          <div class="tmb-seg" role="group" aria-label="Show" style="margin-left: auto">
            <button v-for="f in FILTERS" :key="f.id" class="tmb-seg__opt" :aria-pressed="filter === f.id" @click="filter = f.id">{{ f.label }}</button>
          </div>
        </div>
        <div v-if="events === null" style="display: grid; gap: 8px"><div v-for="n in 6" :key="n" class="tmb-skel" style="height: 22px"></div></div>
        <ul v-else-if="shown.length" class="tmb-feed">
          <li v-for="(e, i) in shown.slice(0, 120)" :key="`${e.Utc}-${i}`">
            <span class="tmb-feed__glyph" :data-tone="TONE[e.Level]"><TumblrIcon :name="ICON[e.Level]" /></span>
            <div style="min-width: 0; overflow-wrap: anywhere">
              <span>{{ e.Message }}</span>
              <button v-if="e.PostId" class="tmb-link-btn" style="margin-left: 6px; font-size: 11.5px" @click="emit('open', e.PostId)">open post</button>
            </div>
            <span class="tmb-feed__when" :title="fmtWhen(e.Utc)">{{ fmtRelative(e.Utc, now) }}</span>
          </li>
        </ul>
        <div v-else class="tmb-empty">Nothing here.</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ACTIVITY_LABEL, activityGlyph, fmtRelative, fmtWhen, type ActivityItem, type OmniEvent } from '~/composables/useOmniTumblr';

const props = defineProps<{ activity: ActivityItem[] | null; events: OmniEvent[] | null; now: number }>();
const emit = defineEmits<{ open: [postId: string] }>();

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'problems', label: 'Problems' },
  { id: 'posts', label: 'Posts' },
  { id: 'quiet', label: 'Hide Tumblr link' },
] as const;
const filter = ref<(typeof FILTERS)[number]['id']>('quiet');
const TONE: Record<OmniEvent['Level'], string> = { Info: 'info', Success: 'ok', Warning: 'warn', Error: 'crit' };
const ICON: Record<OmniEvent['Level'], string> = { Info: 'info', Success: 'check', Warning: 'alert', Error: 'octagon-x' };

const shown = computed(() => (props.events ?? []).filter(e => {
  if (filter.value === 'problems') return e.Level === 'Warning' || e.Level === 'Error';
  if (filter.value === 'posts') return e.Kind.startsWith('publish') || e.Kind.startsWith('post') || e.Kind.startsWith('reblog');
  // The edge comes and goes every hour; it has its own history in Settings.
  if (filter.value === 'quiet') return !e.Kind.startsWith('tumblr.edge');
  return true;
}));
</script>
