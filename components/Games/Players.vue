<template>
  <div class="kgx-pl" :style="{ '--g': game.accent }">
    <form class="kgx-pl__act" @submit.prevent="primary && act(name, primary)">
      <label class="kgx-field kgx-field--grow">
        <span class="kgx-sr">Player name</span>
        <input v-model="name" placeholder="Player name" autocomplete="off" spellcheck="false" :disabled="!canAct" data-testid="player-name" />
      </label>
      <button v-for="a in nameActions" :key="a" type="button" class="kgx-btn kgx-btn--sm" :data-tone="a === 'ban' ? 'crit' : undefined" :disabled="!canAct || !name.trim()" :title="canAct ? '' : reason" @click="act(name, a)">
        <GamesIcon :name="ACTIONS[a]?.icon ?? 'user'" />{{ ACTIONS[a]?.label ?? a }}
      </button>
    </form>
    <p v-if="!canAct" class="kgx-note"><GamesIcon name="lock" />{{ reason }}</p>

    <section class="kgx-card" aria-label="Online now">
      <header class="kgx-card__head">
        <h2 class="kgx-card__title"><GamesIcon name="users" />Online now</h2>
        <span class="kgx-card__meta kgx-num">{{ online.length }}<template v-if="max"> / {{ max }}</template></span>
      </header>
      <ul v-if="online.length" class="kgx-pl__online">
        <li v-for="p in online" :key="p" class="kgx-pl__who" :data-testid="`online-${p}`">
          <span class="kgx-avatar">{{ p.charAt(0).toUpperCase() }}</span>
          <span class="kgx-pl__name">{{ p }}</span>
          <span class="kgx-pl__since kgx-dim">{{ sinceOf(p) }}</span>
          <span class="kgx-pl__btns">
            <button v-for="a in rowActions" :key="a" class="kgx-iconbtn" :data-tone="a === 'ban' ? 'crit' : undefined" :disabled="!canAct" :title="canAct ? `${ACTIONS[a]?.label ?? a} ${p}` : reason" :aria-label="`${ACTIONS[a]?.label ?? a} ${p}`" @click="act(p, a)"><GamesIcon :name="ACTIONS[a]?.icon ?? 'user'" /></button>
          </span>
        </li>
      </ul>
      <p v-else class="kgx-empty">{{ live ? (server.gameType === 'Terraria' ? 'Nobody has joined since it started.' : 'Nobody is on right now.') : 'The server is not running.' }}</p>
    </section>

    <section class="kgx-card" aria-label="Everyone who has played">
      <header class="kgx-card__head">
        <h2 class="kgx-card__title"><GamesIcon name="history" />Everyone who has played</h2>
        <span class="kgx-card__meta">{{ known == null ? '' : `${known.length}` }}</span>
      </header>
      <div v-if="known && known.length" class="kgx-scroll-x">
        <table class="kgx-table">
          <thead><tr><th>Player</th><th>Last seen</th><th class="kgx-r">Joins</th><th class="kgx-r">Played</th><th>First seen</th><th class="kgx-r"><span class="kgx-sr">Actions</span></th></tr></thead>
          <tbody>
            <tr v-for="p in known" :key="p.name" :data-testid="`known-${p.name}`">
              <td><span class="kgx-pl__cell"><span class="kgx-avatar kgx-avatar--sm" :data-on="p.online || undefined">{{ p.name.charAt(0).toUpperCase() }}</span>{{ p.name }}<span v-if="p.online" class="kgx-tag" data-tone="ok">online</span></span></td>
              <td :title="kgWhen(p.lastSeenUtc)">{{ p.online ? 'now' : kgAgo(p.lastSeenUtc, now) }}</td>
              <td class="kgx-r kgx-num">{{ p.joins }}</td>
              <td class="kgx-r kgx-num">{{ kgDuration(p.playedSeconds) }}</td>
              <td class="kgx-dim" :title="kgWhen(p.firstSeenUtc)">{{ kgAgo(p.firstSeenUtc, now) }}</td>
              <td class="kgx-r">
                <button v-for="a in knownActions" :key="a" class="kgx-iconbtn" :data-tone="a === 'ban' ? 'crit' : undefined" :disabled="!canAct" :title="canAct ? `${ACTIONS[a]?.label ?? a} ${p.name}` : reason" :aria-label="`${ACTIONS[a]?.label ?? a} ${p.name}`" @click="act(p.name, a)"><GamesIcon :name="ACTIONS[a]?.icon ?? 'user'" /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="kgx-empty">{{ known == null ? 'This server does not keep a player history yet.' : 'Players appear here the first time they join.' }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { KliveGamesApi } from '~/composables/useKliveGames';
import { kgAgo, kgDuration, kgGame, kgStatus, kgWhen, type KgKnownPlayer, type KgServer } from '~/scripts/kliveGames';

const props = defineProps<{ server: KgServer; api: KliveGamesApi; now: number; canAct: boolean; reason: string }>();

const ACTIONS: Record<string, { label: string; icon: string; undo?: string }> = {
  op: { label: 'Op', icon: 'crown', undo: 'deop' },
  deop: { label: 'De-op', icon: 'minus', undo: 'op' },
  kick: { label: 'Kick', icon: 'kick' },
  ban: { label: 'Ban', icon: 'ban', undo: 'pardon' },
  pardon: { label: 'Pardon', icon: 'check', undo: 'ban' },
  'whitelist-add': { label: 'Whitelist', icon: 'shield-check', undo: 'whitelist-remove' },
  'whitelist-remove': { label: 'Un-whitelist', icon: 'shield', undo: 'whitelist-add' },
};

const game = computed(() => kgGame(props.server.gameType));
const live = computed(() => kgStatus(props.server.status).live);
const name = ref('');
const supported = ref<string[]>(props.server.supportedPlayerActions.length ? props.server.supportedPlayerActions : []);
const known = ref<KgKnownPlayer[] | null>(null);
const online = computed(() => props.server.onlinePlayers);
const max = computed(() => props.server.maxPlayers);

const has = (a: string) => supported.value.includes(a);
const nameActions = computed(() => ['whitelist-add', 'op', 'pardon', 'ban'].filter(has));
const rowActions = computed(() => ['op', 'kick', 'ban'].filter(has));
const knownActions = computed(() => ['op', 'whitelist-add', 'ban', 'pardon'].filter(has));
const primary = computed(() => nameActions.value[0] ?? null);

function sinceOf(player: string): string {
  const p = known.value?.find(k => k.name.toLowerCase() === player.toLowerCase());
  if (!p) return '';
  return p.joins > 1 ? `${kgDuration(p.playedSeconds)} played · ${p.joins} visits` : 'first visit';
}

async function load() {
  const r = await props.api.getPlayers(props.server.id);
  if (!r.ok) return;
  if (Array.isArray(r.data.supportedActions)) supported.value = r.data.supportedActions;
  known.value = Array.isArray(r.data.known) ? r.data.known : null;
}

async function act(player: string, action: string) {
  const who = player.trim();
  if (!who || !props.canAct) return;
  const r = await props.api.playerAction(props.server.id, action, who, true);
  if (r.ok) {
    const undo = ACTIONS[action]?.undo;
    const sent = (r.data as any)?.command ?? `${action} ${who}`;
    props.api.say('ok', `Sent: ${sent}`, undefined, undo && has(undo) ? { label: 'Undo', run: () => props.api.playerAction(props.server.id, undo, who) } : undefined);
    if (player === name.value) name.value = '';
    load();
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  load();
  timer = setInterval(() => { if (live.value && document.visibilityState !== 'hidden') load(); }, 12_000);
});
onBeforeUnmount(() => { if (timer) clearInterval(timer); });
watch(() => props.server.id, () => { known.value = null; load(); });
watch(() => props.server.onlinePlayers.join(','), () => load());
</script>
