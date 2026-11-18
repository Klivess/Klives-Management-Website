<template>
  <div class="tmb-pane" data-testid="tmb-history">
    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
      <div class="tmb-seg" role="group" aria-label="Status">
        <button v-for="f in FILTERS" :key="f" class="tmb-seg__opt" :aria-pressed="filter === f" @click="emit('filter', f)">{{ f }}<span v-if="count(f)" class="tmb-count">{{ count(f) }}</span></button>
      </div>
      <div class="tmb-seg" role="group" aria-label="Sort">
        <button class="tmb-seg__opt" :aria-pressed="sort === 'recent'" @click="sort = 'recent'">Newest</button>
        <button class="tmb-seg__opt" :aria-pressed="sort === 'notes'" @click="sort = 'notes'">Most notes</button>
      </div>
      <input v-model="search" class="tmb-input" style="max-width: 260px; margin-left: auto" placeholder="Filter by caption or tag" aria-label="Filter by caption or tag" />
    </div>

    <div v-if="posts === null" style="display: grid; gap: 8px"><div v-for="n in 5" :key="n" class="tmb-skel" style="height: 40px"></div></div>
    <div v-else-if="!shown.length" class="tmb-empty"><TumblrIcon name="send" /><strong>No posts here</strong></div>
    <div v-else class="tmb-tablewrap">
      <table class="tmb-table">
        <thead>
          <tr>
            <th></th>
            <th>Post</th>
            <th>When</th>
            <th class="num" title="Likes, reblogs and replies together">Notes</th>
            <th class="num">♥</th>
            <th class="num">⟳</th>
            <th class="num" title="Notes after one day and after one week">24 h · 7 d</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in shown" :key="p.PostId" data-clickable :data-testid="`history-${p.PostId}`" tabindex="0" @click="emit('open', p.PostId)" @keydown.enter="emit('open', p.PostId)">
            <td style="width: 46px"><TumblrThumb :path="tmbThumb(p)" :kind="p.Kind" size="xs" /></td>
            <td style="max-width: 460px">
              <div class="tmb-row__meta" style="margin-bottom: 2px"><span v-if="showBlog" class="tmb-row__blog">@{{ p.BlogName }}</span><span v-if="p.Kind === 'Reblog'" class="tmb-chip" data-tone="violet">reblog</span></div>
              <div class="tmb-truncate" :title="tmbCaption(p)">{{ tmbCaption(p) }}</div>
              <div v-if="p.LastError && p.Status !== 'Published'" class="tmb-row__notice" :data-tone="p.Status === 'Failed' ? 'crit' : 'warn'" style="white-space: normal">{{ p.LastError }}</div>
            </td>
            <td class="tmb-dim" style="white-space: nowrap" :title="fmtWhen(p.PublishedUtc ?? p.ScheduledUtc)">{{ fmtRelative(p.PublishedUtc ?? p.ScheduledUtc, now) }}</td>
            <td class="num"><b v-if="p.Status === 'Published' && p.Kind !== 'Reblog'" class="tmb-notes" style="font-size: 14px">{{ fmtCount(p.Notes) }}</b></td>
            <td class="num tmb-dim">{{ p.Kind === 'Reblog' ? '' : p.Likes ?? '' }}</td>
            <td class="num tmb-dim">{{ p.Kind === 'Reblog' ? '' : p.Reblogs ?? '' }}</td>
            <td class="num tmb-dim">{{ p.Status === 'Published' && p.Kind !== 'Reblog' ? `${p.NotesAt24h ?? '·'} · ${p.NotesAt7d ?? '·'}` : '' }}</td>
            <td><span class="tmb-chip" :data-tone="tmbStatusTone(p.Status)">{{ tmbStatusLabel(p.Status) }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="posts && posts.length >= 200" class="tmb-help">The newest 200 posts across the blogs in view.</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { fmtCount, fmtRelative, fmtWhen } from '~/composables/useOmniTumblr';
import { tmbCaption, tmbStatusLabel, tmbStatusTone, tmbThumb, type TmbPost } from '~/scripts/tumblrConsole';

const props = defineProps<{ posts: TmbPost[] | null; filter: string; now: number; showBlog: boolean }>();
const emit = defineEmits<{ open: [postId: string]; filter: [value: string] }>();

const FILTERS = ['All', 'Published', 'Failed', 'Skipped', 'Cancelled', 'Removed'];
const sort = ref<'recent' | 'notes'>('recent');
const search = ref('');

const count = (f: string) => (f === 'All' ? 0 : (props.posts ?? []).filter(p => p.Status === f).length);
const shown = computed(() => {
  const text = search.value.trim().toLowerCase();
  const list = (props.posts ?? []).filter(p => (props.filter === 'All' || p.Status === props.filter)
    && (!text || (p.Caption ?? '').toLowerCase().includes(text) || p.Tags.some(t => t.toLowerCase().includes(text)) || (p.ReblogOf ?? '').toLowerCase().includes(text)));
  return sort.value === 'notes'
    ? [...list].sort((a, b) => (b.Kind === 'Reblog' ? -1 : b.Notes) - (a.Kind === 'Reblog' ? -1 : a.Notes))
    : [...list].sort((a, b) => (b.PublishedUtc ?? b.ScheduledUtc).localeCompare(a.PublishedUtc ?? a.ScheduledUtc));
});
</script>
