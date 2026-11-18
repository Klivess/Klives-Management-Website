<template>
  <ol class="kgx-timeline" :data-dense="dense || undefined">
    <li v-for="(e, i) in entries" :key="`${e.atUtc}-${e.kind}-${i}`" class="kgx-timeline__row" :data-tone="metaOf(e).tone" :data-testid="`act-${e.kind}`">
      <span class="kgx-timeline__dot"><GamesIcon :name="metaOf(e).icon" /></span>
      <span class="kgx-timeline__body">
        <span class="kgx-timeline__line">
          <button v-if="showServer && serverOf(e)" class="kgx-timeline__server" @click="emit('open', e.serverId)">{{ serverOf(e)!.name }}</button>
          <span class="kgx-timeline__text">{{ e.text }}</span>
        </span>
        <span class="kgx-timeline__meta">
          <time :datetime="e.atUtc" :title="kgWhen(e.atUtc)">{{ kgAgo(e.atUtc, now) }}</time>
          <template v-if="extra(e)"> · {{ extra(e) }}</template>
        </span>
      </span>
    </li>
    <li v-if="!entries.length" class="kgx-timeline__none">{{ emptyText ?? 'Nothing has happened yet.' }}</li>
  </ol>
</template>

<script setup lang="ts">
import { kgActivityMeta, kgAgo, kgBytes, kgDuration, kgWhen, type KgActivity, type KgServer } from '~/scripts/kliveGames';

/** What happened, newest first: starts, crashes, joins, backups, changes. */
const props = defineProps<{
  entries: KgActivity[];
  now: number;
  servers?: Map<string, KgServer>;
  showServer?: boolean;
  dense?: boolean;
  emptyText?: string;
}>();
const emit = defineEmits<{ open: [id: string] }>();

const metaOf = (e: KgActivity) => kgActivityMeta(e.kind);
const serverOf = (e: KgActivity) => props.servers?.get(e.serverId) ?? null;

function extra(e: KgActivity): string {
  const bits: string[] = [];
  if (e.kind === 'player-leave' && e.seconds) bits.push(`played ${kgDuration(e.seconds)}`);
  else if ((e.kind === 'stopped' || e.kind === 'crashed' || e.kind === 'killed') && e.seconds) bits.push(`up ${kgDuration(e.seconds)}`);
  if (e.kind === 'backup-pruned' && e.bytes) bits.push(`${kgBytes(e.bytes)} freed`);
  if (e.actor && !e.text.includes(e.actor)) bits.push(`by ${e.actor}`);
  return bits.join(' · ');
}
</script>
