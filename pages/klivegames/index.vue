<template>
  <div ref="root" class="kgx" :data-size="size" :data-selected="selected ? 'yes' : undefined" :style="rootStyle" data-testid="kgx-root">
    <header class="kgx-bar">
      <div class="kgx-bar__id">
        <span class="kgx-bar__mark"><GamesIcon name="gamepad" /></span>
        <h1 class="kgx-bar__title">KliveGames</h1>
        <span class="kgx-bar__sub" data-testid="kgx-subline">{{ subline }}</span>
      </div>

      <button class="kgx-search" aria-label="Find a server or command" aria-keyshortcuts="Control+K" data-testid="kgx-search" @click="paletteOpen = true">
        <GamesIcon name="search" /><span class="kgx-search__text">Find a server, start, stop, back up…</span>
        <span class="kgx-kbd">Ctrl</span><span class="kgx-kbd">K</span>
      </button>

      <span class="kgx-bar__spacer"></span>

      <div class="kgx-bar__actions">
        <span class="kgx-live" :data-state="linkState" :title="linkTitle" data-testid="kgx-live"><span class="kgx-live__dot"></span>{{ linkWord }}</span>
        <button class="kgx-iconbtn" title="Refresh (R)" aria-label="Refresh" @click="api.refresh()"><GamesIcon name="refresh" :class="{ 'kgx-spin': api.loading.value && loadedOnce }" /></button>
        <button class="kgx-btn kgx-btn--go" :disabled="!allowed.manage" :title="allowed.manage ? 'Deploy a server (N)' : api.needs.manage" data-testid="kgx-deploy" @click="deployOpen = true">
          <GamesIcon :name="allowed.manage ? 'plus' : 'lock'" /><span class="kgx-hide-sm">Deploy</span>
        </button>
      </div>
    </header>

    <div class="kgx-main">
      <div v-if="accessReady && !allowed.read" class="kgx-card kgx-locked" data-testid="kgx-locked">
        <GamesIcon name="lock" />
        <div><b>KliveGames is not part of your access.</b><p>Ask Klives for “View game servers”.</p></div>
      </div>

      <template v-else>
        <p v-if="api.legacy.value" class="kgx-banner" data-testid="kgx-legacy"><GamesIcon name="info" />This server runs an older KliveGames. History, backup schedules, disk use and router checks appear once it runs the November build.</p>
        <p v-if="api.loadError.value && loadedOnce" class="kgx-banner" data-tone="crit"><GamesIcon name="wifi-off" />{{ api.loadError.value }} · showing what was last read {{ api.lastLoadedAt.value ? kgAgo(api.lastLoadedAt.value, api.now.value) : '' }}</p>

        <section class="kgx-strip" aria-label="All servers at a glance">
          <button class="kgx-kpi" data-testid="kpi-running" @click="railFilter = 'live'; select(null)">
            <span class="kgx-kpi__label"><GamesIcon name="play" />Running</span>
            <span class="kgx-kpi__value kgx-num">{{ api.running.value.length }}<small>/ {{ servers.length }}</small></span>
            <span class="kgx-kpi__mix" aria-hidden="true"><i v-for="m in statusMix" :key="m.tone" :data-tone="m.tone" :style="{ flex: m.count }"></i></span>
            <span class="kgx-kpi__sub">{{ runningSub }}</span>
          </button>
          <div class="kgx-kpi" data-testid="kpi-players">
            <span class="kgx-kpi__label"><GamesIcon name="users" />Players</span>
            <span class="kgx-kpi__value kgx-num">{{ api.playersOnline.value }}</span>
            <span class="kgx-kpi__sub">{{ playersSub }}</span>
          </div>
          <div class="kgx-kpi" :data-tone="memTone" data-testid="kpi-memory">
            <span class="kgx-kpi__label"><GamesIcon name="memory" />Host memory</span>
            <span class="kgx-kpi__value kgx-num">{{ host?.ramUsedMb != null ? `${(host.ramUsedMb / 1024).toFixed(1)}` : '—' }}<small v-if="host?.ramTotalMb">/ {{ (host.ramTotalMb / 1024).toFixed(1)}} GB</small></span>
            <span v-if="host?.ramTotalMb" class="kgx-kpi__bar"><i class="kgx-kpi__bar-other" :style="{ width: `${pctOf((host.ramUsedMb ?? 0) - (host.gamesRamUsedMb ?? 0), host.ramTotalMb)}%` }"></i><i class="kgx-kpi__bar-games" :style="{ width: `${pctOf(host.gamesRamUsedMb ?? 0, host.ramTotalMb)}%` }"></i></span>
            <span class="kgx-kpi__sub">{{ memSub }}</span>
          </div>
          <div class="kgx-kpi" data-testid="kpi-cpu">
            <span class="kgx-kpi__label"><GamesIcon name="cpu" />Host CPU</span>
            <span class="kgx-kpi__value kgx-num">{{ host?.cpuPercent != null ? kgPct(host.cpuPercent) : '—' }}</span>
            <span class="kgx-kpi__sub">{{ cpuSub }}</span>
          </div>
          <div class="kgx-kpi" :data-tone="diskTone" data-testid="kpi-disk">
            <span class="kgx-kpi__label"><GamesIcon name="disk" />Storage</span>
            <span class="kgx-kpi__value kgx-num">{{ storageTotal != null ? kgBytes(storageTotal) : '—' }}</span>
            <span class="kgx-kpi__sub">{{ host?.drive ? `${host.drive.name.replace(/\\$/, '')} ${kgBytes(host.drive.freeBytes)} free` : (api.legacy.value ? 'needs the newer server' : '') }}</span>
          </div>
          <button class="kgx-kpi" :data-tone="protectTone" data-testid="kpi-backups" @click="railFilter = 'attention'; select(null)">
            <span class="kgx-kpi__label"><GamesIcon name="shield" />Backed up</span>
            <span class="kgx-kpi__value kgx-num">{{ protectedCount ?? '—' }}<small v-if="protectedCount != null">/ {{ servers.length }}</small></span>
            <span class="kgx-kpi__sub">{{ protectSub }}</span>
          </button>
        </section>

        <div class="kgx-body">
          <GamesRail
            ref="rail"
            v-model:filter="railFilter"
            v-model:query="railQuery"
            :servers="api.sorted.value"
            :selected-id="selectedId"
            :now="api.now.value"
            :pending="api.pending"
            :attention-ids="attentionIds"
            :can-deploy="allowed.manage"
            @select="select"
            @deploy="deployOpen = true"
            @step="stepServer"
          />

          <div class="kgx-work" :class="{ 'kgx-enter': firstPaint }">
            <div v-if="!loadedOnce" class="kgx-card kgx-skeleton" aria-busy="true"><span></span><span></span><span></span></div>

            <GamesFleet
              v-else-if="!selected"
              :servers="servers"
              :by-id="api.byId.value"
              :issues="api.issues.value"
              :activity="api.activity.value"
              :now="api.now.value"
              :legacy="api.legacy.value"
              :pending="api.pending"
              :allowed="allowed"
              :needs="api.needs"
              @open="id => select(id)"
              @fix="fix"
              @lifecycle="(id, op) => api.lifecycle(id, op)"
            />

            <template v-else>
              <GamesHero
                :key="selected.id"
                :server="selected"
                :host="host"
                :now="api.now.value"
                :busy="api.pending[selected.id]"
                :allowed="allowed"
                :needs="api.needs"
                @lifecycle="op => lifecycleSelected(op)"
                @backup="api.backupNow(selected.id)"
                @copy="copy"
                @tab="setTab"
                @back="select(null)"
              />

              <nav class="kgx-tabs" role="tablist" aria-label="Server">
                <button v-for="(t, i) in KG_TABS" :key="t.id" class="kgx-tab" role="tab" :aria-selected="tab === t.id" :data-testid="`tab-${t.id}`" @click="tab = t.id">
                  <GamesIcon :name="t.icon" />{{ t.label }}<span v-if="tabBadge(t.id)" class="kgx-tab__badge kgx-num">{{ tabBadge(t.id) }}</span><span class="kgx-kbd kgx-hide-sm">{{ i + 1 }}</span>
                </button>
              </nav>

              <div class="kgx-pane" role="tabpanel">
                <GamesOverview v-if="tab === 'overview'" :server="selected" :api="api" :issues="serverIssues" :now="api.now.value" @fix="fix" />
                <GamesConsole v-else-if="tab === 'console'" ref="consolePane" :server="selected" :api="api" :allowed="allowed.console" @status="onConsoleStatus" />
                <GamesPlayers v-else-if="tab === 'players'" :server="selected" :api="api" :now="api.now.value" :can-act="allowed.operate && live" :reason="!allowed.operate ? api.needs.operate : 'Start the server to act on players'" />
                <GamesFiles v-else-if="tab === 'files'" :server="selected" :api="api" :now="api.now.value" :can-read="allowed.filesRead" :can-write="allowed.filesWrite" :needs="api.needs" />
                <GamesBackups v-else-if="tab === 'backups'" :server="selected" :api="api" :now="api.now.value" :can-manage="allowed.manage" :can-download="allowed.filesRead" :needs="api.needs" />
                <GamesSettings v-else-if="tab === 'settings'" :server="selected" :api="api" :host="host" :can-manage="allowed.manage" :can-operate="allowed.operate" :needs="api.needs" @deleted="select(null)" />
              </div>
            </template>
          </div>
        </div>
      </template>
    </div>

    <GamesDialog :open="killing && !!selected" :title="`Force-kill ${selected?.name}?`" icon="bolt" tone="crit" confirm-label="Kill it" @close="killing = false" @confirm="killing = false; selected && api.lifecycle(selected.id, 'kill')">
      <p>The process ends at once, without saving: anything since its last save is lost{{ selected?.onlinePlayers.length ? `, and ${selected.onlinePlayers.length} player${selected.onlinePlayers.length === 1 ? ' is' : 's are'} dropped` : '' }}. Use Stop unless it is stuck.</p>
    </GamesDialog>
    <GamesDeploy :open="deployOpen" :api="api" :host="host" :servers="servers" @close="deployOpen = false" @deployed="onDeployed" />
    <GamesPalette :open="paletteOpen" :commands="commands" @close="paletteOpen = false" />

    <Teleport to="body">
      <div class="kgx-layer kgx-toasts" aria-live="polite">
        <div v-for="d in api.downloads.value" :key="`d${d.id}`" class="kgx-toast" data-tone="info">
          <GamesIcon name="download" />
          <div class="kgx-toast__body"><b class="kgx-truncate">{{ d.name }}</b><span class="kgx-num">{{ kgBytes(d.done) }}{{ d.total ? ` of ${kgBytes(d.total)}` : '' }}</span>
            <span class="kgx-bar"><i :style="{ width: d.total ? `${(d.done / d.total) * 100}%` : '30%' }"></i></span></div>
        </div>
        <div v-for="t in api.toasts.value" :key="t.id" class="kgx-toast" :data-tone="t.tone" role="status" :data-testid="`toast-${t.tone}`">
          <GamesIcon :name="t.tone === 'ok' ? 'check' : t.tone === 'crit' ? 'alert' : 'info'" />
          <div class="kgx-toast__body"><b>{{ t.text }}</b><span v-if="t.detail">{{ t.detail }}</span></div>
          <button v-if="t.action" class="kgx-btn kgx-btn--sm" @click="t.action.run(); api.dismiss(t.id)">{{ t.action.label }}</button>
          <button class="kgx-iconbtn" aria-label="Dismiss" @click="api.dismiss(t.id)"><GamesIcon name="x" /></button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import '~/assets/scss/klivegames.scss';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useKliveGames } from '~/composables/useKliveGames';
import { useAccess } from '~/composables/useAccess';
import { kgAgo, kgBytes, kgCan, kgGame, kgMb, kgPct, kgStatus, type KgCommand, type KgIssue, type KgRailFilter, type KgTone } from '~/scripts/kliveGames';

useHead({ title: 'KliveGames' });

type TabId = 'overview' | 'console' | 'players' | 'files' | 'backups' | 'settings';
const KG_TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: 'activity' },
  { id: 'console', label: 'Console', icon: 'terminal' },
  { id: 'players', label: 'Players', icon: 'users' },
  { id: 'files', label: 'Files', icon: 'folder' },
  { id: 'backups', label: 'Backups', icon: 'archive' },
  { id: 'settings', label: 'Settings', icon: 'sliders' },
];

const api = useKliveGames();
const route = useRoute();
const router = useRouter();
const allowed = api.allowed;
const servers = api.servers;
const host = computed(() => api.host.value);
const access = useAccess();
const accessReady = computed(() => !!api.loaded.value || !!access.ready?.value);
const loadedOnce = computed(() => api.loaded.value);

// ── selection, synced to ?s= and ?t= ──
const selectedId = ref<string | null>(typeof route.query.s === 'string' ? route.query.s : null);
const tab = ref<TabId>(KG_TABS.some(t => t.id === route.query.t) ? (route.query.t as TabId) : 'overview');
const selected = computed(() => (selectedId.value ? api.byId.value.get(selectedId.value) ?? null : null));
const live = computed(() => !!selected.value && kgStatus(selected.value.status).live);

function setTab(t: string) { if (KG_TABS.some(x => x.id === t)) tab.value = t as TabId; }
function select(id: string | null, toTab?: TabId) {
  selectedId.value = id;
  if (toTab) tab.value = toTab;
  else if (!id) tab.value = 'overview';
}
watch([selectedId, tab], () => {
  const query: Record<string, string> = {};
  if (selectedId.value) query.s = selectedId.value;
  if (selectedId.value && tab.value !== 'overview') query.t = tab.value;
  if (query.s !== route.query.s || query.t !== route.query.t) router.replace({ query });
});
watch(() => route.query.s, s => { if ((typeof s === 'string' ? s : null) !== selectedId.value) selectedId.value = typeof s === 'string' ? s : null; });
// A deleted (or never existing) server: back to the fleet once the list has loaded.
watch([() => api.loaded.value, selected], () => { if (api.loaded.value && selectedId.value && !selected.value && !api.loading.value) select(null); });

// ── rail ──
const railFilter = ref<KgRailFilter>('all');
const railQuery = ref('');
const rail = ref<any>(null);
const attentionIds = computed(() => new Set(api.issues.value.map(i => i.serverId).filter((x): x is string => !!x)));
function stepServer(dir: number) {
  const list: { id: string }[] = rail.value?.shown ?? api.sorted.value;
  if (!list.length) return;
  if (dir === 0) { select(list[0].id); return; }
  const at = list.findIndex(s => s.id === selectedId.value);
  const next = at < 0 ? (dir > 0 ? 0 : list.length - 1) : Math.max(0, Math.min(list.length - 1, at + dir));
  select(list[next].id, tab.value);
}

// ── bar ──
const subline = computed(() => {
  if (!loadedOnce.value) return 'Reading the servers…';
  const n = servers.value.length;
  const bits = [`${n} server${n === 1 ? '' : 's'}`, `${api.running.value.length} running`];
  if (api.playersOnline.value) bits.push(`${api.playersOnline.value} playing`);
  const crit = api.issues.value.filter(i => i.tone === 'crit').length;
  if (crit) bits.push(`${crit} need${crit === 1 ? 's' : ''} attention`);
  return bits.join(' · ');
});
const hidden = ref(false);
const linkState = computed(() => (api.loadError.value ? 'down' : hidden.value ? 'paused' : 'live'));
const linkWord = computed(() => ({ down: 'Offline', paused: 'Paused', live: 'Live' }[linkState.value]));
const linkTitle = computed(() => (linkState.value === 'live'
  ? `Updated ${api.lastLoadedAt.value ? kgAgo(api.lastLoadedAt.value, Date.now()) : ''}; every 4 s while a server runs, every 10 s otherwise`
  : linkState.value === 'paused' ? 'Paused while this tab is hidden' : api.loadError.value ?? ''));

// ── strip ──
const pctOf = (part: number, whole: number) => (whole > 0 ? Math.max(0, Math.min(100, (part / whole) * 100)) : 0);
const statusMix = computed(() => {
  const by: Record<KgTone, number> = { ok: 0, info: 0, warn: 0, crit: 0, neutral: 0 };
  servers.value.forEach(s => { by[kgStatus(s.status).tone]++; });
  return (['ok', 'info', 'warn', 'crit', 'neutral'] as KgTone[]).filter(t => by[t]).map(t => ({ tone: t, count: by[t] }));
});
const runningSub = computed(() => {
  const busy = servers.value.filter(s => kgStatus(s.status).busy).length;
  const crashed = servers.value.filter(s => s.status === 'Crashed').length;
  const bits: string[] = [];
  if (busy) bits.push(`${busy} changing`);
  if (crashed) bits.push(`${crashed} crashed`);
  if (!bits.length) {
    const lastRun = Math.max(0, ...servers.value.map(s => Date.parse(s.lastStoppedUtc ?? s.lastStartedUtc ?? '') || 0));
    bits.push(api.running.value.length ? 'all healthy' : lastRun ? `last ran ${kgAgo(lastRun, api.now.value)}` : 'none has run');
  }
  return bits.join(' · ');
});
const playersSub = computed(() => {
  const peak = servers.value.reduce((n, s) => n + (s.players.peak24h ?? 0), 0);
  const known = servers.value.reduce((n, s) => n + (s.players.known ?? 0), 0);
  const bits: string[] = [];
  if (peak) bits.push(`peak ${peak} today`);
  if (known) bits.push(`${known} have played`);
  return bits.join(' · ') || (api.legacy.value ? 'on running servers' : 'nobody yet');
});
const memTone = computed(() => {
  const h = host.value;
  if (!h?.ramTotalMb || h.ramUsedMb == null) return undefined;
  const free = h.ramTotalMb - h.ramUsedMb;
  return free < 1024 ? 'crit' : free < 2048 ? 'warn' : undefined;
});
const memSub = computed(() => {
  const h = host.value;
  if (!h?.ramTotalMb) return api.legacy.value ? 'needs the newer server' : '';
  const free = h.ramTotalMb - (h.ramUsedMb ?? 0);
  return `${kgMb(free)} free · games ${kgMb(h.gamesRamUsedMb ?? 0)}`;
});
const cpuSub = computed(() => {
  const games = api.running.value.reduce((n, s) => n + (s.cpuPercent || 0), 0);
  return `${host.value?.cores ?? 4} cores${api.running.value.length ? ` · games ${kgPct(games)}` : ''}`;
});
const storageTotal = computed(() => {
  const withStorage = servers.value.filter(s => s.storage);
  return withStorage.length ? withStorage.reduce((n, s) => n + s.storage!.serverBytes + s.storage!.backupBytes, 0) : null;
});
const diskTone = computed(() => (host.value?.drive && host.value.drive.freeBytes / host.value.drive.totalBytes < 0.08 ? 'crit' : undefined));
const protectedCount = computed(() => (servers.value.some(s => s.backups.count != null) ? servers.value.filter(s => (s.backups.count ?? 0) > 0).length : null));
const protectTone = computed(() => (protectedCount.value != null && servers.value.some(s => s.backups.count === 0 && !s.backups.everyHours) ? 'warn' : undefined));
const protectSub = computed(() => {
  if (protectedCount.value == null) return api.legacy.value ? 'needs the newer server' : '';
  const scheduled = servers.value.filter(s => s.backups.everyHours).length;
  const never = servers.value.filter(s => s.backups.count === 0).length;
  return [scheduled ? `${scheduled} on a schedule` : 'no schedules', never ? `${never} never` : ''].filter(Boolean).join(' · ');
});

const rootStyle = computed(() => ({ '--g': selected.value ? kgGame(selected.value.gameType).accent : '#9be15d' }));

// ── server view ──
const serverIssues = computed(() => (selected.value ? api.issues.value.filter(i => i.serverId === selected.value!.id) : []));
function tabBadge(id: TabId): string {
  const s = selected.value;
  if (!s) return '';
  if (id === 'players' && s.onlinePlayers.length) return String(s.onlinePlayers.length);
  if (id === 'backups' && s.backups.job && !s.backups.job.finishedUtc) return '…';
  if (id === 'overview' && serverIssues.value.length) return String(serverIssues.value.length);
  return '';
}

function lifecycleSelected(op: 'start' | 'stop' | 'restart' | 'kill') {
  const s = selected.value;
  if (!s) return;
  if (op === 'kill') { killing.value = true; return; }
  api.lifecycle(s.id, op);
}
const killing = ref(false);

let statusTimer: ReturnType<typeof setTimeout> | null = null;
function onConsoleStatus() {
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => api.refresh(), 400);
}

async function copy(text: string) {
  if (!text) return;
  try { await navigator.clipboard.writeText(text); api.say('ok', `Copied ${text}`); }
  catch { api.say('warn', 'The browser would not allow copying', text); }
}

function fix(issue: KgIssue) {
  const a = issue.fix?.action;
  if (a === 'schedule-all') {
    const ids = servers.value.filter(s => s.backups.count === 0 && !s.backups.everyHours).map(s => s.id);
    api.scheduleAll(ids);
    return;
  }
  if (!issue.serverId) return;
  if (a === 'start') { api.lifecycle(issue.serverId, 'start'); return; }
  const to: Record<string, TabId> = { console: 'console', backups: 'backups', settings: 'settings', network: 'settings', open: 'overview' };
  select(issue.serverId, to[a ?? 'open'] ?? 'overview');
}

function onDeployed(id: string) {
  deployOpen.value = false;
  api.refresh().then(() => select(id, 'console'));
}

// ── palette ──
const paletteOpen = ref(false);
const deployOpen = ref(false);
const consolePane = ref<any>(null);
const commands = computed<KgCommand[]>(() => {
  const list: KgCommand[] = [];
  const s = selected.value;
  if (s) {
    const c = kgCan(s);
    const name = s.name;
    if (c.start) list.push({ id: 'sel-start', group: name, title: `Start ${name}`, icon: 'play', keywords: 'run boot up', disabled: !allowed.value.operate, run: () => api.lifecycle(s.id, 'start') });
    if (c.stop) list.push({ id: 'sel-stop', group: name, title: `Stop ${name}`, icon: 'stop', keywords: 'shutdown halt', disabled: !allowed.value.operate, run: () => api.lifecycle(s.id, 'stop') });
    if (c.restart) list.push({ id: 'sel-restart', group: name, title: `Restart ${name}`, icon: 'restart', keywords: 'reboot', disabled: !allowed.value.operate, run: () => api.lifecycle(s.id, 'restart') });
    list.push({ id: 'sel-backup', group: name, title: `Back up ${name} now`, icon: 'archive', keywords: 'backup save copy zip', disabled: !allowed.value.manage, run: () => api.backupNow(s.id) });
    if (s.network.joinAddress) list.push({ id: 'sel-copy', group: name, title: `Copy ${s.network.joinAddress}`, icon: 'copy', keywords: 'join address ip connect', run: () => copy(s.network.joinAddress!) });
    KG_TABS.forEach(t => list.push({ id: `tab-${t.id}`, group: name, title: `Open ${t.label}`, icon: t.icon, hint: String(KG_TABS.indexOf(t) + 1), run: () => { tab.value = t.id; } }));
  }
  api.sorted.value.forEach(sv => list.push({
    id: `go-${sv.id}`, group: 'Servers', title: sv.name, icon: 'server',
    keywords: `${kgGame(sv.gameType).label} ${sv.flavor} ${sv.version} ${sv.port}`, hint: kgStatus(sv.status).label,
    run: () => select(sv.id, tab.value),
  }));
  list.push({ id: 'fleet', group: 'KliveGames', title: 'All servers', icon: 'server', keywords: 'fleet overview home', run: () => select(null) });
  list.push({ id: 'deploy', group: 'KliveGames', title: 'Deploy a server', icon: 'plus', keywords: 'new create install', hint: 'N', disabled: !allowed.value.manage, run: () => { deployOpen.value = true; } });
  if (api.running.value.length) list.push({ id: 'stop-all', group: 'KliveGames', title: `Stop every running server (${api.running.value.length})`, icon: 'stop', keywords: 'shutdown all', disabled: !allowed.value.operate, run: () => api.stopAll() });
  const unprotected = servers.value.filter(sv => sv.backups.count === 0 && !sv.backups.everyHours);
  if (unprotected.length) list.push({ id: 'schedule-all', group: 'KliveGames', title: `Back up ${unprotected.length} unprotected server${unprotected.length === 1 ? '' : 's'} daily`, icon: 'shield', keywords: 'backup schedule protect', disabled: !allowed.value.manage, run: () => api.scheduleAll(unprotected.map(sv => sv.id)) });
  list.push({ id: 'refresh', group: 'KliveGames', title: 'Refresh', icon: 'refresh', hint: 'R', run: () => api.refresh() });
  return list;
});

// ── keyboard ──
function typing(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}
function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); paletteOpen.value = !paletteOpen.value; return; }
  if (paletteOpen.value || deployOpen.value || killing.value || document.querySelector('.kgx-layer.kgx-scrim')) return;
  if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
  const s = selected.value;
  switch (e.key) {
    case '/': e.preventDefault(); rail.value?.focusFind?.(); break;
    case 'j': case 'ArrowDown': if (e.key === 'j' || !s) { e.preventDefault(); stepServer(1); } break;
    case 'k': case 'ArrowUp': if (e.key === 'k' || !s) { e.preventDefault(); stepServer(-1); } break;
    case 'Escape': if (s) select(null); break;
    case 'r': case 'R': api.refresh(); break;
    case 'n': case 'N': if (allowed.value.manage) deployOpen.value = true; break;
    case 's': case 'S':
      if (s && allowed.value.operate) { const c = kgCan(s); if (c.start) api.lifecycle(s.id, 'start'); else if (c.stop) api.lifecycle(s.id, 'stop'); }
      break;
    case 'c': if (s) { tab.value = 'console'; nextTick(() => consolePane.value?.focus?.()); } break;
    default:
      if (s && /^[1-6]$/.test(e.key)) tab.value = KG_TABS[Number(e.key) - 1].id;
  }
}

// ── size: the page's own width (the site nav takes ~250 px) ──
const root = ref<HTMLElement | null>(null);
const size = ref<'xl' | 'lg' | 'md' | 'sm'>('lg');
let ro: ResizeObserver | null = null;
const firstPaint = ref(true);

function onVisibility() { hidden.value = document.visibilityState === 'hidden'; }

onMounted(() => {
  api.start();
  window.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibility);
  if (root.value && 'ResizeObserver' in window) {
    ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 1200;
      size.value = w >= 1480 ? 'xl' : w >= 1120 ? 'lg' : w >= 820 ? 'md' : 'sm';
    });
    ro.observe(root.value);
  }
  setTimeout(() => { firstPaint.value = false; }, 600);
});
onBeforeUnmount(() => {
  api.stop();
  window.removeEventListener('keydown', onKey);
  document.removeEventListener('visibilitychange', onVisibility);
  ro?.disconnect();
});
</script>
