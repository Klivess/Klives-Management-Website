<template>
  <section class="ktx-card ktx-feed" :data-full="full || undefined" aria-label="Hub history" data-testid="ktx-feed">
    <header class="ktx-card__head">
      <h2 class="ktx-card__title"><TechIcon name="history" />{{ title }}</h2>
      <span class="ktx-card__meta">{{ supported ? metaText : 'needs a newer server' }}</span>
      <div v-if="full && supported" class="ktx-card__tools">
        <div class="ktx-seg" role="group" aria-label="Show">
          <button v-for="f in FEED_FILTERS" :key="f.id" class="ktx-seg__opt" :aria-pressed="filter === f.id" @click="filter = f.id">{{ f.label }}</button>
        </div>
      </div>
    </header>
    <ol v-if="rows.length" class="ktx-feed__list">
      <li v-for="event in rows" :key="event.seq" class="ktx-ev" :data-tone="event.tone" :data-testid="`event-${event.kind}`">
        <span class="ktx-ev__mark"><TechIcon :name="eventIcon(event.kind)" /></span>
        <span class="ktx-ev__body">
          <span class="ktx-ev__text">
            <button v-if="event.gadgetName && !gadgetID" class="ktx-ev__who" @click="emit('open', event.gadgetID)">{{ event.gadgetName }}</button>
            {{ event.text }}
          </span>
          <span class="ktx-ev__meta">{{ fmtClock(event.atUtc, now) }}<template v-if="event.by"> · {{ event.by }}</template></span>
        </span>
      </li>
    </ol>
    <div v-else class="ktx-empty">
      <TechIcon name="history" />
      <span>{{ supported ? 'Nothing has happened since the hub started.' : "This server doesn't keep a hub history yet." }}</span>
    </div>
    <footer v-if="!full && supported && events.length > limit" class="ktx-card__foot">
      <button class="ktx-btn ktx-btn--xs ktx-btn--ghost" @click="emit('more')">All {{ events.length }}<TechIcon name="chevron-right" /></button>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { eventIcon, fmtClock, type HubEvent } from '~/scripts/kliveTech';

/** What the hub did and saw: connections, failures, actions, relay attempts, firmware. Newest first. */
const props = withDefaults(defineProps<{
  events: HubEvent[];
  now: number;
  supported: boolean;
  full?: boolean;
  limit?: number;
  gadgetID?: string;
  title?: string;
}>(), { full: false, limit: 8, gadgetID: '', title: 'History' });
const emit = defineEmits<{ open: [gadgetID: string]; more: [] }>();

const FEED_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'problems', label: 'Problems' },
  { id: 'actions', label: 'Actions' },
  { id: 'links', label: 'Links' },
] as const;
const filter = ref<(typeof FEED_FILTERS)[number]['id']>('all');

const rows = computed(() => {
  let list = props.events;
  if (props.gadgetID) list = list.filter(e => e.gadgetID === props.gadgetID);
  if (filter.value === 'problems') list = list.filter(e => e.tone === 'warn' || e.tone === 'crit');
  else if (filter.value === 'actions') list = list.filter(e => e.kind.startsWith('action') || e.kind === 'firmware');
  else if (filter.value === 'links') list = list.filter(e => /connect|relay|nearby|enrol|forgot|retry|discovery/.test(e.kind));
  return props.full ? list : list.slice(0, props.limit);
});

const metaText = computed(() => {
  const problems = props.events.filter(e => e.tone === 'crit' || e.tone === 'warn').length;
  return problems ? `${props.events.length} · ${problems} problem${problems === 1 ? '' : 's'}` : `${props.events.length}`;
});
</script>
