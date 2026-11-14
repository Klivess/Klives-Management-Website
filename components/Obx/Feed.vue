<template>
  <div>
    <div v-if="filterable && events.length" class="obx-toolbar" style="padding: 0 14px 8px">
      <div class="obx-seg" role="group" aria-label="Show">
        <button v-for="f in FILTERS" :key="f.id" class="obx-seg__opt" :aria-pressed="filter === f.id" @click="filter = f.id">
          {{ f.label }}<span class="obx-seg__count">{{ count(f.id) }}</span>
        </button>
      </div>
    </div>
    <ol class="obx-feed" data-testid="obx-feed">
      <li v-for="(ev, i) in shown" :key="`${ev.Utc}-${i}`" class="obx-feed__item" :data-tone="levelTone(ev.Level)">
        <span class="obx-dot" :data-tone="levelTone(ev.Level)"></span>
        <div style="min-width: 0">
          <div class="obx-feed__msg">{{ ev.Message }}</div>
          <div class="obx-feed__sub">
            <time :datetime="ev.Utc" :title="obxDateTime(ev.Utc)">{{ obxAgo(ev.Utc, now) }}</time>
            <template v-if="showGame && ev.GameId"><span>·</span><NuxtLink :to="`/schemery/omniblox/game/${ev.GameId}`">{{ gameTitle(ev.GameId) }}</NuxtLink></template>
            <span>·</span><span class="obx-mono">{{ ev.Kind }}</span>
          </div>
        </div>
      </li>
      <li v-if="!filtered.length" class="obx-empty">{{ events.length ? 'Nothing of this kind.' : emptyText }}</li>
    </ol>
    <button v-if="filtered.length > limit && !all" class="obx-btn obx-btn--ghost obx-btn--sm" style="margin: 4px 14px 10px" @click="all = true">Show {{ filtered.length - limit }} more</button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BloxEvent, BloxGameSummary, BloxLevel } from '~/composables/useOmniBlox';
import { obxAgo, obxDateTime, type ObxTone } from '~/scripts/omniblox/console';

/** What the studio did, newest first; problems can be picked out. */
const props = withDefaults(defineProps<{ events: BloxEvent[]; games?: BloxGameSummary[]; now: number; limit?: number; showGame?: boolean; filterable?: boolean; emptyText?: string }>(), {
  games: () => [], limit: 12, showGame: true, filterable: false, emptyText: 'Nothing has happened yet.',
});

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'problems', label: 'Problems' },
  { id: 'done', label: 'Done' },
] as const;
const filter = ref<(typeof FILTERS)[number]['id']>('all');
const all = ref(false);

const matches = (ev: BloxEvent, f: string) => f === 'all' || (f === 'problems' ? ev.Level === 'Warning' || ev.Level === 'Error' : ev.Level === 'Success');
const filtered = computed(() => props.events.filter(ev => matches(ev, filter.value)));
const shown = computed(() => (all.value ? filtered.value : filtered.value.slice(0, props.limit)));
const count = (f: string) => props.events.filter(ev => matches(ev, f)).length;

function levelTone(level: BloxLevel): ObxTone {
  return level === 'Error' ? 'crit' : level === 'Warning' ? 'warn' : level === 'Success' ? 'ok' : 'neutral';
}
function gameTitle(id: string) { return props.games.find(g => g.GameId === id)?.Title ?? id; }
</script>
