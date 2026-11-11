<template>
  <section class="odx-card" aria-label="Recent actions" data-testid="odx-feed">
    <header class="odx-card__head">
      <h2 class="odx-card__title"><DefenceIcon name="bolt" />Recent actions</h2>
      <span v-if="counts" class="odx-card__meta">{{ counts }}</span>
      <div class="odx-card__tools">
        <button v-if="events?.length && !full" class="odx-btn odx-btn--xs odx-btn--ghost" @click="emit('more')">All<DefenceIcon name="chevron-right" /></button>
      </div>
    </header>
    <div class="odx-card__body odx-card__body--flush">
      <ul v-if="shown.length" class="odx-list">
        <li v-for="event in shown" :key="event.id" class="odx-feed__item" :data-tone="describeEvent(event).tone">
          <DefenceIcon class="odx-feed__mark" :name="describeEvent(event).icon" />
          <div class="odx-feed__what">
            <div><button class="odx-ip-link" @click="emit('open', event.ip)">{{ event.ip }}</button> {{ lowerFirst(describeEvent(event).label) }}</div>
            <div v-if="event.detail && event.kind !== 'GeoIP'" class="odx-feed__detail" :title="event.detail">{{ event.detail }}</div>
          </div>
          <span class="odx-feed__when" :title="fmtFull(event.ts)">{{ fmtAgo(event.ts, now) }}</span>
        </li>
      </ul>
      <div v-else class="odx-empty">
        <DefenceIcon name="inbox" />
        <span v-if="events === null">This server does not keep a feed of what OmniDefence did yet.</span>
        <span v-else>Nothing blocked, released or relabelled lately.</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { describeEvent, fmtAgo, fmtFull, type DefenceEvent } from '~/scripts/omniDefence';

/** What OmniDefence (and Klives) did lately: automatic blocks, releases, labels, region rules. */
const props = withDefaults(defineProps<{
  events: DefenceEvent[] | null;
  counts24h?: Record<string, number> | null;
  now: number;
  limit?: number;
  full?: boolean;
}>(), { limit: 7, full: false, counts24h: null });
const emit = defineEmits<{ open: [ip: string]; more: [] }>();

/** "Blocked by Klives" after an address reads "… blocked by Klives": only the first letter changes. */
const lowerFirst = (text: string) => (text ? text[0].toLowerCase() + text.slice(1) : text);

/** Being located is not an action anyone took: left out of the feed. */
const shown = computed(() => (props.events ?? []).filter(e => e.kind !== 'GeoIP').slice(0, props.full ? 200 : props.limit));

const counts = computed(() => {
  const c = props.counts24h;
  if (!c) return '';
  const blocks = (c.AutoBlocked ?? 0) + (c.Block ?? 0) + (c.RegionBlock ?? 0) + Object.entries(c).filter(([k]) => k === 'AutoAction:Blocked' || k === 'StatusChange:Blocked').reduce((n, [, v]) => n + v, 0);
  const releases = (c.Untrap ?? 0) + (c.Unblock ?? 0);
  const parts = [];
  if (blocks) parts.push(`${blocks} block${blocks === 1 ? '' : 's'}`);
  if (releases) parts.push(`${releases} release${releases === 1 ? '' : 's'}`);
  return parts.length ? `${parts.join(', ')} today` : '';
});
</script>
