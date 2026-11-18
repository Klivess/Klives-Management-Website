<template>
  <aside class="kgx-rail" aria-label="Game servers">
    <div class="kgx-rail__head">
      <button class="kgx-rail__home" :aria-pressed="!selectedId" data-testid="rail-fleet" @click="emit('select', null)">
        <GamesIcon name="server" /><span>All servers</span><span class="kgx-count kgx-num">{{ servers.length }}</span>
      </button>
      <label class="kgx-rail__find">
        <GamesIcon name="search" />
        <input ref="findBox" :value="query" type="search" placeholder="Filter" aria-label="Filter servers" data-testid="rail-filter" @input="emit('update:query', ($event.target as HTMLInputElement).value)" @keydown.down.prevent="emit('step', 1)" @keydown.up.prevent="emit('step', -1)" @keydown.enter.prevent="emit('step', 0)" />
      </label>
      <div class="kgx-seg kgx-seg--fill" role="group" aria-label="Show">
        <button v-for="f in FILTERS" :key="f.id" class="kgx-seg__opt" :aria-pressed="filter === f.id" :data-testid="`rail-show-${f.id}`" @click="emit('update:filter', f.id)">
          {{ f.label }}<span v-if="counts[f.id]" class="kgx-num">{{ counts[f.id] }}</span>
        </button>
      </div>
    </div>

    <ul class="kgx-rail__list" role="listbox" :aria-activedescendant="selectedId ? `srv-${selectedId}` : undefined">
      <li v-for="s in shown" :id="`srv-${s.id}`" :key="s.id" role="option" :aria-selected="s.id === selectedId">
        <button class="kgx-srv" :data-state="statusOf(s).tone" :aria-current="s.id === selectedId ? 'true' : undefined" :data-testid="`srv-${s.id}`" @click="emit('select', s.id)">
          <GamesGlyph :game="s.gameType" size="sm" />
          <span class="kgx-srv__main">
            <span class="kgx-srv__name kgx-truncate">{{ s.name }}<span v-if="dupes.has(s.name)" class="kgx-srv__game">{{ gameOf(s).label }}</span></span>
            <span class="kgx-srv__meta kgx-truncate">{{ lineOf(s) }}</span>
          </span>
          <span class="kgx-srv__side">
            <span class="kgx-pill" :data-tone="statusOf(s).tone" :data-busy="statusOf(s).busy || !!pending[s.id] || undefined">
              <i></i>{{ pending[s.id] ? 'Working' : statusOf(s).label }}
            </span>
            <span v-if="statusOf(s).live" class="kgx-srv__live kgx-num">
              <span title="Players online"><GamesIcon name="users" />{{ s.onlinePlayers.length }}<template v-if="s.maxPlayers">/{{ s.maxPlayers }}</template></span>
              <GamesSpark v-if="s.spark" :values="s.spark.cpu" :max="100" tone="info" label="CPU, last 10 minutes" />
            </span>
            <span v-else-if="s.backups.job && !s.backups.job.finishedUtc" class="kgx-srv__job kgx-num">{{ jobPct(s) }}</span>
          </span>
        </button>
      </li>
      <li v-if="!shown.length" class="kgx-rail__none">
        <template v-if="servers.length">Nothing matches. <button class="kgx-link" @click="clear">Show all</button></template>
        <template v-else>No servers yet.</template>
      </li>
    </ul>

    <button v-if="canDeploy" class="kgx-rail__deploy" data-testid="rail-deploy" @click="emit('deploy')">
      <GamesIcon name="plus" />Deploy a server<span class="kgx-kbd">N</span>
    </button>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { kgAgo, kgBuildLine, kgGame, kgStatus, type KgRailFilter as RailFilter, type KgServer } from '~/scripts/kliveGames';

const props = defineProps<{
  servers: KgServer[];
  selectedId: string | null;
  filter: RailFilter;
  query: string;
  now: number;
  pending: Record<string, string>;
  attentionIds: Set<string>;
  canDeploy: boolean;
}>();
const emit = defineEmits<{ select: [id: string | null]; 'update:filter': [f: RailFilter]; 'update:query': [q: string]; deploy: []; step: [dir: number] }>();

const FILTERS: { id: RailFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Running' },
  { id: 'attention', label: 'Attention' },
];

const findBox = ref<HTMLInputElement | null>(null);

const statusOf = (s: KgServer) => kgStatus(s.status);
const gameOf = (s: KgServer) => kgGame(s.gameType);

const dupes = computed(() => {
  const seen = new Map<string, number>();
  props.servers.forEach(s => seen.set(s.name, (seen.get(s.name) ?? 0) + 1));
  return new Set([...seen.keys()].filter(name => (seen.get(name) ?? 0) > 1));
});

const counts = computed(() => ({
  all: 0,
  live: props.servers.filter(s => statusOf(s).live).length,
  attention: props.servers.filter(s => props.attentionIds.has(s.id)).length,
}));

const shown = computed(() => {
  const words = props.query.toLowerCase().split(/\s+/).filter(Boolean);
  return props.servers.filter(s => {
    if (props.filter === 'live' && !statusOf(s).live) return false;
    if (props.filter === 'attention' && !props.attentionIds.has(s.id)) return false;
    if (!words.length) return true;
    const hay = `${s.name} ${s.gameType} ${s.flavor} ${s.version} ${s.port} ${s.status}`.toLowerCase();
    return words.every(w => hay.includes(w));
  });
});
defineExpose({ focusFind: () => findBox.value?.focus(), shown });

function lineOf(s: KgServer): string {
  const build = kgBuildLine(s);
  if (statusOf(s).live || statusOf(s).busy) return `${build} · :${s.port}`;
  if (s.status === 'Crashed') return s.lastErrorAt ? `Crashed ${kgAgo(s.lastErrorAt, props.now)}` : 'Crashed';
  const last = s.lastStoppedUtc ?? s.lastStartedUtc;
  return last ? `${build} · ran ${kgAgo(last, props.now)}` : `${build} · never started`;
}

function jobPct(s: KgServer): string {
  const job = s.backups.job!;
  if (job.stage === 'saving') return 'Saving';
  if (!job.bytesTotal) return job.operation === 'restore' ? 'Restoring' : 'Backing up';
  return `${Math.floor((job.bytesDone / job.bytesTotal) * 100)}%`;
}

function clear() {
  emit('update:query', '');
  emit('update:filter', 'all');
}
</script>
