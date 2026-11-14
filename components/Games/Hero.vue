<template>
  <header class="kgx-hero" :style="{ '--g': game.accent }" data-testid="hero">
    <div class="kgx-hero__id">
      <button class="kgx-iconbtn kgx-hero__back" title="All servers" aria-label="All servers" @click="emit('back')"><GamesIcon name="arrow-left" /></button>
      <GamesGlyph :game="server.gameType" size="lg" />
      <div class="kgx-hero__names">
        <h1 class="kgx-hero__title kgx-truncate" data-testid="hero-name">{{ server.name }}</h1>
        <p class="kgx-hero__build">
          <span>{{ game.label }}</span><span>{{ kgBuildLine(server) }}</span>
          <span v-if="server.javaMajor">Java {{ server.javaMajor }}</span>
          <span v-if="server.usesMemoryLimit">{{ kgMb(server.ramMb) }} heap</span>
        </p>
      </div>
      <span class="kgx-pill kgx-pill--lg" :data-tone="st.tone" :data-busy="st.busy || !!busy || undefined" data-testid="hero-status"><i></i>{{ busy ? busyLabel : st.label }}</span>
    </div>

    <div class="kgx-hero__actions">
      <template v-if="can.start">
        <button class="kgx-btn kgx-btn--go" :disabled="!allowed.operate || !!busy" :title="allowed.operate ? 'Start (S)' : needs.operate" data-testid="act-start" @click="emit('lifecycle', 'start')">
          <GamesIcon :name="allowed.operate ? 'play' : 'lock'" />Start
        </button>
      </template>
      <template v-else>
        <button class="kgx-btn" :disabled="!allowed.operate || !can.restart || !!busy" :title="allowed.operate ? 'Restart' : needs.operate" data-testid="act-restart" @click="emit('lifecycle', 'restart')">
          <GamesIcon :name="allowed.operate ? 'restart' : 'lock'" />Restart
        </button>
        <button class="kgx-btn kgx-btn--stop" :disabled="!allowed.operate || !can.stop || !!busy" :title="allowed.operate ? 'Stop (S)' : needs.operate" data-testid="act-stop" @click="emit('lifecycle', 'stop')">
          <GamesIcon :name="allowed.operate ? 'stop' : 'lock'" />Stop
        </button>
      </template>
      <div class="kgx-menuwrap">
        <button class="kgx-iconbtn" :aria-expanded="menu" aria-label="More actions" data-testid="act-more" @click="menu = !menu"><GamesIcon name="more" /></button>
        <div v-if="menu" class="kgx-menu" role="menu" @click="menu = false">
          <button role="menuitem" :disabled="!allowed.manage || !!jobRunning" :title="allowed.manage ? '' : needs.manage" @click="emit('backup')"><GamesIcon name="archive" />Back up now</button>
          <button role="menuitem" @click="emit('tab', 'console')"><GamesIcon name="terminal" />Open console</button>
          <button role="menuitem" :disabled="!server.network.joinAddress && !server.network.lanAddress" @click="emit('copy', server.network.joinAddress ?? server.network.lanAddress ?? '')"><GamesIcon name="copy" />Copy join address</button>
          <hr />
          <button role="menuitem" class="kgx-menu__danger" :disabled="!allowed.manage || !can.kill" :title="allowed.manage ? 'Ends the process at once: unsaved progress is lost' : needs.manage" data-testid="act-kill" @click="emit('lifecycle', 'kill')"><GamesIcon name="bolt" />Force kill</button>
        </div>
      </div>
    </div>

    <div class="kgx-hero__join">
      <template v-if="server.isPublic">
        <button class="kgx-addr" :title="`Copy ${server.network.joinAddress}`" data-testid="join-public" @click="emit('copy', server.network.joinAddress ?? '')">
          <GamesIcon name="globe" /><span class="kgx-mono">{{ server.network.joinAddress }}</span><GamesIcon name="copy" />
        </button>
        <span v-for="p in server.network.ports" :key="`${p.protocol}${p.port}`" class="kgx-fwd" :data-state="p.state === 'missing' && !can.live ? 'pending' : p.state" :title="fwdTitle(p.state)" :data-testid="`fwd-${p.port}`">
          <i></i>{{ p.protocol }} {{ p.port }} · {{ fwdWord(p.state) }}
        </span>
      </template>
      <span v-else class="kgx-fwd" data-state="local"><GamesIcon name="home" />Local network only</span>
      <button v-if="server.network.lanAddress" class="kgx-addr kgx-addr--quiet" :title="`Copy ${server.network.lanAddress}`" @click="emit('copy', server.network.lanAddress ?? '')">
        <GamesIcon name="home" /><span class="kgx-mono">{{ server.network.lanAddress }}</span>
      </button>
    </div>

    <div v-if="server.lastError && (server.status === 'Crashed' || server.status === 'Stopped')" class="kgx-hero__error" :data-tone="server.status === 'Crashed' ? 'crit' : 'neutral'" data-testid="hero-error">
      <GamesIcon name="alert" />
      <span>{{ server.lastError }}</span>
      <span class="kgx-dim">{{ server.lastErrorAt ? `${server.lastErrorApprox ? 'around ' : ''}${kgWhen(server.lastErrorAt)}` : '' }}</span>
    </div>

    <dl class="kgx-stats">
      <div class="kgx-stat">
        <dt><GamesIcon name="clock" />{{ st.live ? 'Up' : 'Last ran' }}</dt>
        <dd class="kgx-num">{{ upText }}</dd>
        <span class="kgx-stat__sub">{{ upSub }}</span>
      </div>
      <div class="kgx-stat">
        <dt><GamesIcon name="users" />Players</dt>
        <dd class="kgx-num">{{ st.live ? server.onlinePlayers.length : '—' }}<small v-if="st.live && server.maxPlayers">/ {{ server.maxPlayers }}</small></dd>
        <span class="kgx-stat__sub">{{ playersSub }}</span>
      </div>
      <div class="kgx-stat">
        <dt><GamesIcon name="cpu" />CPU</dt>
        <dd class="kgx-num">{{ st.live ? kgPct(server.cpuPercent) : '—' }}</dd>
        <GamesSpark v-if="server.spark" :values="server.spark.cpu" :max="100" tone="info" fill label="CPU, last 10 minutes" />
        <span v-else class="kgx-stat__sub">of {{ host?.cores ?? 4 }} cores</span>
      </div>
      <div class="kgx-stat">
        <dt><GamesIcon name="memory" />Memory</dt>
        <dd class="kgx-num">{{ st.live ? kgBytes(server.ramUsedBytes) : '—' }}<small v-if="server.usesMemoryLimit">/ {{ kgMb(server.ramMb) }}</small></dd>
        <GamesSpark v-if="server.spark" :values="server.spark.ramMb" :max="server.usesMemoryLimit ? Math.max(server.ramMb * 1.25, 1) : undefined" tone="ok" fill label="Memory, last 10 minutes" />
        <span v-else class="kgx-stat__sub">{{ memSub }}</span>
      </div>
      <div class="kgx-stat">
        <dt><GamesIcon name="disk" />Disk</dt>
        <dd class="kgx-num">{{ server.storage ? kgBytes(server.storage.serverBytes) : '—' }}</dd>
        <span class="kgx-stat__sub">{{ server.storage ? `${kgInt(server.storage.files)} files · backups ${kgBytes(server.storage.backupBytes)}` : (server.legacy ? 'needs the newer server' : 'measuring…') }}</span>
      </div>
      <div class="kgx-stat kgx-stat--button" role="button" tabindex="0" :data-tone="backupTone" data-testid="stat-backup" @click="emit('tab', 'backups')" @keydown.enter="emit('tab', 'backups')">
        <dt><GamesIcon name="archive" />Backup</dt>
        <dd>{{ backupText }}</dd>
        <span class="kgx-stat__sub">{{ backupSub }}</span>
        <span v-if="jobRunning" class="kgx-stat__bar"><i :style="{ width: `${jobPct}%` }"></i></span>
      </div>
    </dl>
  </header>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  fmtInt as kgInt, kgAgo, kgBuildLine, kgBytes, kgCan, kgDuration, kgEvery, kgGame, kgMb, kgPct, kgStatus, kgWhen, toMs,
  type KgHost, type KgPortState, type KgServer,
} from '~/scripts/kliveGames';

const props = defineProps<{
  server: KgServer;
  host: KgHost | null;
  now: number;
  busy?: string;
  allowed: { operate: boolean; manage: boolean };
  needs: { operate: string; manage: string };
}>();
const emit = defineEmits<{ lifecycle: [op: 'start' | 'stop' | 'restart' | 'kill']; backup: []; copy: [text: string]; tab: [tab: string]; back: [] }>();

const menu = ref(false);
const game = computed(() => kgGame(props.server.gameType));
const st = computed(() => kgStatus(props.server.status));
const can = computed(() => kgCan(props.server));
const busyLabel = computed(() => (props.busy ? 'Working…' : ''));

const job = computed(() => props.server.backups.job);
const jobRunning = computed(() => !!job.value && !job.value.finishedUtc);
const jobPct = computed(() => (job.value && job.value.bytesTotal ? Math.min(100, (job.value.bytesDone / job.value.bytesTotal) * 100) : 4));

const upText = computed(() => {
  const s = props.server;
  if (st.value.live) {
    const since = toMs(s.runningSinceUtc ?? s.lastStartedUtc);
    return since ? kgDuration((props.now - since) / 1000) : '—';
  }
  const last = s.lastStoppedUtc ?? s.lastStartedUtc;
  return last ? kgAgo(last, props.now) : 'Never';
});
const upSub = computed(() => {
  const s = props.server;
  if (s.status === 'Starting' || s.status === 'Stalled') return s.lastStartupSeconds ? `last start took ${kgDuration(s.lastStartupSeconds)}` : 'loading…';
  if (st.value.live) return s.lastStartupSeconds ? `ready in ${kgDuration(s.lastStartupSeconds)}` : (s.adopted ? 're-attached' : '');
  if (s.crashes7d) return `${s.crashes7d} crash${s.crashes7d === 1 ? '' : 'es'} this week`;
  return s.lastStartedUtc ? `started ${kgWhen(s.lastStartedUtc)}` : `deployed ${kgAgo(s.createdUtc, props.now)}`;
});
const playersSub = computed(() => {
  const p = props.server.players;
  const bits: string[] = [];
  if (p.peak24h) bits.push(`peak ${p.peak24h} today`);
  if (p.known != null) bits.push(`${p.known} known`);
  if (!bits.length && p.lastSeenUtc) bits.push(`last seen ${kgAgo(p.lastSeenUtc, props.now)}`);
  return bits.join(' · ');
});
const memSub = computed(() => (props.server.usesMemoryLimit ? 'heap reserved when running' : 'no heap limit for this game'));

const backupTone = computed(() => {
  const b = props.server.backups;
  if (b.count == null) return undefined;
  if (job.value?.stage === 'failed') return 'crit';
  if (!b.count && !b.everyHours) return 'warn';
  return undefined;
});
const backupText = computed(() => {
  const b = props.server.backups;
  if (jobRunning.value) return job.value!.operation === 'restore' ? 'Restoring…' : (job.value!.stage === 'saving' ? 'Saving world…' : `${Math.floor(jobPct.value)}%`);
  if (b.count == null) return '—';
  if (!b.count) return 'Never';
  return kgAgo(b.lastUtc, props.now);
});
const backupSub = computed(() => {
  const b = props.server.backups;
  if (b.count == null) return props.server.legacy ? 'open Backups' : '';
  const sched = b.everyHours ? `${kgEvery(b.everyHours)}, keep ${b.keep || 'all'}` : 'no schedule';
  return b.count ? `${b.count} · ${kgBytes(b.bytes ?? 0)} · ${sched}` : sched;
});

function fwdWord(state: KgPortState): string {
  switch (state) {
    case 'forwarded': return 'forwarded';
    case 'missing': return kgCan(props.server).live ? 'not forwarded' : 'forwarded at start';
    case 'elsewhere': return 'points elsewhere';
    case 'no-upnp': return 'no UPnP router';
    case 'local': return 'local';
    default: return 'checking';
  }
}
function fwdTitle(state: KgPortState): string {
  switch (state) {
    case 'forwarded': return 'The router forwards this port to this machine.';
    case 'missing': return kgCan(props.server).live
      ? 'The router has no forward for this port, so players outside the house cannot join. KliveGames re-adds dropped forwards every 10 minutes while the server runs.'
      : 'KliveGames adds the forward when the server starts.';
    case 'elsewhere': return 'The router forwards this port to a different machine on the network.';
    case 'no-upnp': return 'No UPnP router answered; forward the port on the router by hand.';
    default: return 'Reading the router’s forwards…';
  }
}
</script>
