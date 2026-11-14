<template>
  <div class="kgx-fleet">
    <section class="kgx-card kgx-attn" aria-label="Needs attention" data-testid="fleet-attention">
      <header class="kgx-card__head">
        <h2 class="kgx-card__title"><GamesIcon :name="issues.length ? 'alert' : 'shield-check'" />{{ issues.length ? 'Needs attention' : 'All clear' }}</h2>
        <span v-if="issues.length" class="kgx-card__meta kgx-num">{{ issues.length }}</span>
      </header>
      <ul v-if="issues.length" class="kgx-issues">
        <li v-for="issue in issues" :key="issue.id" class="kgx-issue" :data-tone="issue.tone" :data-testid="`issue-${issue.id.split(':')[0]}`">
          <span class="kgx-issue__mark"></span>
          <span class="kgx-issue__body">
            <span class="kgx-issue__title">{{ issue.title }}</span>
            <span class="kgx-issue__detail">{{ issue.detail }}</span>
          </span>
          <button v-if="issue.fix && fixAllowed(issue)" class="kgx-btn kgx-btn--sm" @click="emit('fix', issue)">{{ issue.fix.label }}<GamesIcon name="chevron-right" /></button>
        </li>
      </ul>
      <p v-else class="kgx-attn__ok">{{ servers.length ? 'Nothing is crashed, stuck, unprotected or unreachable.' : 'Deploy a server to get started.' }}</p>
    </section>

    <section class="kgx-card kgx-fleet__table" aria-label="Servers">
      <header class="kgx-card__head">
        <h2 class="kgx-card__title"><GamesIcon name="server" />Servers</h2>
        <span class="kgx-card__meta">{{ summary }}</span>
        <div class="kgx-card__tools">
          <div class="kgx-seg" role="group" aria-label="Sort by">
            <button v-for="o in SORTS" :key="o.id" class="kgx-seg__opt" :aria-pressed="sortBy === o.id" @click="sortBy = o.id">{{ o.label }}</button>
          </div>
        </div>
      </header>
      <div class="kgx-scroll-x">
        <table class="kgx-table kgx-table--fleet">
          <thead>
            <tr>
              <th>Server</th><th>Status</th><th class="kgx-r">Players</th><th class="kgx-r">CPU</th><th class="kgx-r">Memory</th>
              <th class="kgx-r">Disk</th><th>Backed up</th><th>Last ran</th><th class="kgx-r"><span class="kgx-sr">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in rows" :key="s.id" :data-testid="`fleet-${s.id}`" @click="emit('open', s.id)">
              <td>
                <span class="kgx-cellsrv">
                  <GamesGlyph :game="s.gameType" size="sm" />
                  <span class="kgx-cellsrv__text">
                    <span class="kgx-cellsrv__name">{{ s.name }}</span>
                    <span class="kgx-cellsrv__build">{{ kgGame(s.gameType).label }} · {{ kgBuildLine(s) }} · :{{ s.port }}</span>
                  </span>
                </span>
              </td>
              <td><span class="kgx-pill" :data-tone="kgStatus(s.status).tone" :data-busy="kgStatus(s.status).busy || undefined"><i></i>{{ kgStatus(s.status).label }}</span></td>
              <td class="kgx-r kgx-num">
                <template v-if="kgStatus(s.status).live">{{ s.onlinePlayers.length }}<span class="kgx-faint">/{{ s.maxPlayers || '–' }}</span></template>
                <span v-else class="kgx-faint" :title="s.players.lastSeenUtc ? `Last player seen ${kgWhen(s.players.lastSeenUtc)}` : ''">{{ s.players.known ? `${s.players.known} known` : '—' }}</span>
              </td>
              <td class="kgx-r kgx-num">
                <span v-if="kgStatus(s.status).live" class="kgx-cellspark">
                  <GamesSpark v-if="s.spark" :values="s.spark.cpu" :max="100" tone="info" />{{ kgPct(s.cpuPercent) }}
                </span>
                <span v-else class="kgx-faint">—</span>
              </td>
              <td class="kgx-r kgx-num">
                <template v-if="kgStatus(s.status).live">{{ kgBytes(s.ramUsedBytes) }}<span v-if="s.usesMemoryLimit" class="kgx-faint"> / {{ kgMb(s.ramMb) }}</span></template>
                <span v-else class="kgx-faint">{{ s.usesMemoryLimit ? kgMb(s.ramMb) : '—' }}</span>
              </td>
              <td class="kgx-r kgx-num" :title="s.storage ? `${kgInt(s.storage.files)} files · backups ${kgBytes(s.storage.backupBytes)}` : ''">
                {{ s.storage ? kgBytes(s.storage.serverBytes) : '—' }}
              </td>
              <td>
                <span v-if="s.backups.count == null" class="kgx-faint">—</span>
                <span v-else-if="s.backups.job && !s.backups.job.finishedUtc" class="kgx-tag" data-tone="info">{{ s.backups.job.operation === 'restore' ? 'Restoring…' : 'Backing up…' }}</span>
                <span v-else-if="!s.backups.count" class="kgx-tag" :data-tone="s.backups.everyHours ? 'info' : 'warn'">{{ s.backups.everyHours ? 'First one due' : 'Never' }}</span>
                <span v-else :title="kgWhen(s.backups.lastUtc)">{{ kgAgo(s.backups.lastUtc, now) }}<span v-if="s.backups.everyHours" class="kgx-faint"> · {{ kgEvery(s.backups.everyHours).toLowerCase() }}</span></span>
              </td>
              <td>
                <span v-if="kgStatus(s.status).live" :title="kgWhen(s.runningSinceUtc ?? s.lastStartedUtc)">up {{ upFor(s) }}</span>
                <span v-else-if="s.lastStoppedUtc ?? s.lastStartedUtc" class="kgx-dim" :title="kgWhen(s.lastStoppedUtc ?? s.lastStartedUtc)">{{ kgAgo(s.lastStoppedUtc ?? s.lastStartedUtc, now) }}</span>
                <span v-else class="kgx-faint">never</span>
              </td>
              <td class="kgx-r" @click.stop>
                <button v-if="kgCan(s).start" class="kgx-iconbtn" :disabled="!allowed.operate || !!pending[s.id]" :title="allowed.operate ? `Start ${s.name}` : needs.operate" :aria-label="`Start ${s.name}`" @click="emit('lifecycle', s.id, 'start')"><GamesIcon name="play" /></button>
                <button v-else-if="kgCan(s).stop" class="kgx-iconbtn" :disabled="!allowed.operate || !!pending[s.id]" :title="allowed.operate ? `Stop ${s.name}` : needs.operate" :aria-label="`Stop ${s.name}`" @click="emit('lifecycle', s.id, 'stop')"><GamesIcon name="stop" /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="kgx-card kgx-fleet__activity" aria-label="Recent activity">
      <header class="kgx-card__head">
        <h2 class="kgx-card__title"><GamesIcon name="history" />Recent activity</h2>
        <span v-if="legacy" class="kgx-card__meta">Needs the newer server</span>
      </header>
      <GamesTimeline :entries="activity" :now="now" :servers="byId" show-server dense :empty-text="legacy ? 'This server does not keep a history yet. It will once it runs the November build.' : 'Starts, stops, crashes, joins and backups will show here.'" @open="id => emit('open', id)" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  fmtInt as kgInt, kgAgo, kgBuildLine, kgBytes, kgCan, kgDuration, kgEvery, kgGame, kgMb, kgPct, kgSortServers, kgStatus, kgWhen, toMs,
  type KgActivity, type KgIssue, type KgServer,
} from '~/scripts/kliveGames';

const props = defineProps<{
  servers: KgServer[];
  byId: Map<string, KgServer>;
  issues: KgIssue[];
  activity: KgActivity[];
  now: number;
  legacy: boolean;
  pending: Record<string, string>;
  allowed: { operate: boolean; manage: boolean };
  needs: { operate: string; manage: string };
}>();
const emit = defineEmits<{ open: [id: string]; fix: [issue: KgIssue]; lifecycle: [id: string, op: 'start' | 'stop'] }>();

type SortId = 'status' | 'name' | 'recent' | 'disk';
const SORTS: { id: SortId; label: string }[] = [
  { id: 'status', label: 'Status' },
  { id: 'recent', label: 'Recent' },
  { id: 'disk', label: 'Disk' },
  { id: 'name', label: 'Name' },
];
const sortBy = ref<SortId>('status');

const rows = computed(() => {
  const list = kgSortServers(props.servers);
  if (sortBy.value === 'name') return [...list].sort((a, b) => a.name.localeCompare(b.name));
  if (sortBy.value === 'disk') return [...list].sort((a, b) => (b.storage?.serverBytes ?? -1) - (a.storage?.serverBytes ?? -1));
  if (sortBy.value === 'recent') {
    const at = (s: KgServer) => (kgStatus(s.status).live ? Infinity : toMs(s.lastStoppedUtc ?? s.lastStartedUtc) ?? 0);
    return [...list].sort((a, b) => at(b) - at(a));
  }
  return list;
});

const summary = computed(() => {
  const games = new Map<string, number>();
  props.servers.forEach(s => games.set(kgGame(s.gameType).label, (games.get(kgGame(s.gameType).label) ?? 0) + 1));
  const disk = props.servers.reduce((n, s) => n + (s.storage?.serverBytes ?? 0) + (s.storage?.backupBytes ?? 0), 0);
  const parts = [...games.keys()].map(g => `${games.get(g)} ${g}`);
  if (disk) parts.push(`${kgBytes(disk)} on disk`);
  return parts.join(' · ');
});

function upFor(s: KgServer): string {
  const since = toMs(s.runningSinceUtc ?? s.lastStartedUtc);
  return since ? kgDuration((props.now - since) / 1000) : '—';
}

function fixAllowed(issue: KgIssue): boolean {
  const a = issue.fix?.action;
  if (a === 'start') return props.allowed.operate;
  if (a === 'schedule-all') return props.allowed.manage;
  return true;
}
</script>
