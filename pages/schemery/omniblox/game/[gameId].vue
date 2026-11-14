<template>
  <ObxShell :crumb="title" :crumb-stage="game?.Stage" :commands="commands" @refresh="load">
    <div v-if="loadError && !detail" class="obx-card">
      <div class="obx-empty" style="min-height: 200px">
        <ObxIcon name="octagon" />
        <span><b>{{ notFound ? 'No such game' : 'Could not load the game' }}</b> {{ loadError }}</span>
        <NuxtLink class="obx-btn obx-btn--sm" to="/schemery/omniblox">Back to the studio</NuxtLink>
      </div>
    </div>

    <template v-else>
      <!-- ── who it is and what it is doing ── -->
      <section class="obx-card obx-gamehead" :data-stage="game?.Stage ?? summary?.Stage" aria-label="Game" data-testid="obx-gamehead">
        <div class="obx-gamehead__art">
          <ObxImg v-if="summary?.HasIcon" :path="bloxMediaPath(gameId, 'icon.png', game?.UpdatedUtc)" :alt="`${title} icon`" fallback="" eager />
          <template v-else>{{ obxInitials(title) }}</template>
        </div>
        <div class="obx-gamehead__text">
          <h1 class="obx-gamehead__title">{{ title }}</h1>
          <div class="obx-gamehead__chips">
            <span v-if="game" class="obx-stage" :data-stage="game.Stage">{{ obxStageWord(game.Stage) }}</span>
            <span v-if="game?.Paused" class="obx-chip" data-tone="neutral">Paused</span>
            <span v-if="game?.UrgentMaintenance" class="obx-chip" data-tone="crit">Urgent maintenance</span>
            <span v-if="summary && obxUnplayable(summary)" class="obx-chip" data-tone="crit">Nobody can play</span>
            <span class="obx-truncate">{{ headline }}</span>
          </div>
        </div>
        <div v-if="game" class="obx-gamehead__actions">
          <button v-if="detail?.Playtest.Playable" class="obx-btn" :class="waitingGate === 'launch' ? '' : 'obx-btn--brand'" aria-keyshortcuts="P" data-testid="obx-play-open" @click="setPlay(true)"><ObxIcon name="play" />Play</button>
          <a v-if="game.Slot && game.Publish.IsPublic" class="obx-btn obx-btn--ghost" :href="bloxRobloxGameUrl(game.Slot.PlaceId)" target="_blank" rel="noopener"><ObxIcon name="external" />Roblox</a>
          <template v-if="canAct && active">
            <button class="obx-btn" aria-keyshortcuts="S" @click="steer"><ObxIcon name="steer" />Steer</button>
            <button class="obx-btn" :disabled="busy" data-testid="obx-pause" @click="setPaused(!game.Paused)"><ObxIcon :name="game.Paused ? 'play' : 'pause'" />{{ game.Paused ? 'Resume' : 'Pause' }}</button>
          </template>
          <button v-if="canAct && game.Stage === 'Live'" class="obx-btn" :disabled="busy || game.UrgentMaintenance" @click="maintain"><ObxIcon name="wrench" />Maintain now</button>
          <button v-if="canManage && game.Stage === 'Abandoned'" class="obx-btn obx-btn--primary" :disabled="busy" data-testid="obx-revive" @click="revive"><ObxIcon name="revive" />Revive</button>
          <button v-if="canManage && active" class="obx-iconbtn" title="Abandon this game" aria-label="Abandon this game" :disabled="busy" data-testid="obx-abandon" @click="abandon"><ObxIcon name="trash" /></button>
        </div>
      </section>

      <!-- ── where it is on the line ── -->
      <section class="obx-card obx-progress" aria-label="Stage" :aria-busy="!detail">
        <ObxTrack v-if="game" :stage="game.Stage" :reached="obxReached(game.StageCycles)" />
        <template v-if="detail">
          <p v-if="detail.Goal" class="obx-goal">{{ detail.Goal }}</p>
          <ul v-if="detail.Checklist.length" class="obx-criteria" aria-label="Exit criteria">
            <li v-for="c in detail.Checklist" :key="c.Text" :data-met="c.Met || undefined"><span class="obx-box">{{ c.Met ? '✓' : '' }}</span>{{ c.Text }}</li>
          </ul>
          <div class="obx-progress__row">
            <span v-for="m in stageMeta" :key="m.label">{{ m.label }} <b>{{ m.value }}</b></span>
          </div>
        </template>
        <div v-else class="obx-skel" style="height: 56px"></div>
      </section>

      <!-- ── what stops it ── -->
      <div v-if="detail && detail.Watchdog.Level > 0 && active" class="obx-banner" :data-tone="detail.Watchdog.Level >= 3 ? 'crit' : 'warn'" role="status" data-testid="obx-watchdog">
        <ObxIcon class="obx-banner__glyph" :name="detail.Watchdog.Level >= 3 ? 'pause' : 'alert'" />
        <div class="obx-banner__text">
          <strong>Watchdog: {{ detail.Watchdog.Name }}</strong>
          <span>{{ watchdogText }}</span>
          <details>
            <summary class="obx-dim" style="font-size: 11.5px">How the watchdog works</summary>
            <ul class="obx-list" style="margin-top: 4px; font-size: 11.5px"><li v-for="l in detail.Watchdog.Ladder" :key="l">{{ l }}</li></ul>
            <ul v-if="detail.Watchdog.History.length" class="obx-list" style="margin-top: 6px; font-size: 11.5px; color: var(--obx-ink-3)"><li v-for="(h, i) in detail.Watchdog.History.slice().reverse()" :key="i">{{ h }}</li></ul>
          </details>
        </div>
        <div class="obx-banner__actions">
          <button v-if="detail.Watchdog.Level >= 3 && canAct" class="obx-btn obx-btn--sm obx-btn--primary" :disabled="busy" @click="resume">Resume</button>
          <button v-if="canAct" class="obx-btn obx-btn--sm" @click="steer">Steer it</button>
        </div>
      </div>
      <div v-else-if="game?.WaitingReason" class="obx-banner" data-tone="warn" role="status">
        <ObxIcon class="obx-banner__glyph" name="clock" />
        <div class="obx-banner__text"><strong>Waiting</strong><span>{{ game.WaitingReason }}</span></div>
      </div>
      <div v-if="closedReach" class="obx-banner" data-tone="crit" role="alert" data-testid="obx-closed">
        <ObxIcon class="obx-banner__glyph" name="octagon" />
        <div class="obx-banner__text">
          <strong>Nobody can play this game</strong>
          <span>Roblox reports {{ closedReach.Status }}{{ closedReach.SinceUtc ? ` since ${obxDate(closedReach.SinceUtc)}` : '' }}: {{ closedReach.Why ?? 'it is closed to players' }}. It is public, but no player can open it until that changes. Checked {{ obxAgo(closedReach.CheckedUtc, now) }}.</span>
        </div>
      </div>
      <div v-if="game?.Publish.LastLaunchError && game.Stage === 'Launch'" class="obx-banner" data-tone="crit" role="status">
        <ObxIcon class="obx-banner__glyph" name="rocket" />
        <div class="obx-banner__text"><strong>Last launch step failed ({{ game.Publish.LastLaunchStep }})</strong><span>{{ game.Publish.LastLaunchError }}</span></div>
      </div>

      <ObxGate v-if="waitingGate && game && detail?.Approvals" :game="game" :gates="detail.Approvals" :playable="detail.Playtest.Playable" :can-manage="canManage" :now="now"
               @changed="reloadAll" @play="setPlay(true)" @tab="id => setTab(id as TabId)" />

      <!-- ── the work ── -->
      <div class="obx-split obx-split--side">
        <div class="obx-stack" style="min-width: 0">
          <nav class="obx-tabs" role="tablist" aria-label="Game sections">
            <button v-for="(t, i) in tabs" :key="t.id" class="obx-tab" role="tab" :aria-selected="tab === t.id" :data-testid="`tab-${t.id}`" @click="setTab(t.id)">
              <ObxIcon :name="t.icon" />{{ t.label }}<span v-if="t.count" class="obx-tab__count" :data-tone="t.tone">{{ t.count }}</span><span class="obx-tab__key">{{ i + 1 }}</span>
            </button>
          </nav>

          <div v-if="!detail" class="obx-stack"><div v-for="n in 3" :key="n" class="obx-skel" style="height: 140px"></div></div>
          <template v-else-if="game">
            <ObxTabOverview v-if="tab === 'overview'" :game="game" :now="now" :approvals="detail.Approvals?.History" @tab="id => setTab(id as TabId)" />
            <ObxTabWorld v-else-if="tab === 'world'" :game="game" :playable="detail.Playtest.Playable" :now="now" @play="setPlay(true)" />
            <ObxTabTests v-else-if="tab === 'tests'" :game="game" :engine-available="detail.EngineAvailable" :local-engine="detail.LocalEngine ?? false" :can-act="canAct" :now="now" @changed="load" />
            <ObxTabStore v-else-if="tab === 'store'" :game="game" :media="detail.Media" :now="now" />
            <ObxTabNumbers v-else-if="tab === 'numbers'" :game="game" :now="now" />
            <ObxTabBrain v-else-if="tab === 'brain'" :game="game" :cycle-logs="detail.CycleLogs" :now="now" />
            <ObxTabFiles v-else-if="tab === 'files'" :game-id="gameId" :revision="game.Build.Revision" />
            <section v-else-if="tab === 'activity'" class="obx-card" aria-label="Activity">
              <header class="obx-card__head"><h2 class="obx-card__title"><ObxIcon name="activity" />Activity</h2><span class="obx-card__meta">this game, newest first</span></header>
              <div class="obx-card__body obx-card__body--flush">
                <div v-if="events === null" class="obx-skel" style="height: 140px; margin: 0 14px 12px"></div>
                <ObxFeed v-else :events="events" :show-game="false" :now="now" :limit="40" filterable empty-text="Nothing recorded for this game yet." />
              </div>
            </section>
          </template>
        </div>

        <aside class="obx-side" aria-label="Now">
          <section v-if="openTasks.length" class="obx-card" data-tone="brick" aria-label="Needs you">
            <header class="obx-card__head"><h2 class="obx-card__title"><ObxIcon name="inbox" />Needs you</h2><span class="obx-card__meta">{{ openTasks.length }}</span></header>
            <div class="obx-card__body obx-card__body--flush"><ObxInbox :items="openTasks" :show-game="false" :now="now" :limit="4" @changed="reloadAll" /></div>
          </section>
          <ObxLiveCycle v-if="detail && game && (detail.Live || active)" :game-id="gameId" :initial="detail.Live" :now="now" @finished="load" />
          <ObxDirections v-if="detail && game && (active || game.Directives.length)" ref="directions" :game="game" :can-act="canAct" :now="now" @changed="load" />
          <ObxManage v-if="game && canManage && (game.Slot || ['Launch', 'Live', 'Sunset'].includes(game.Stage))" :game="game" :now="now" @changed="load" />
        </aside>
      </div>
    </template>

    <ObxPlaySheet v-if="game && detail" :open="playOpen" :game="game" :view="detail.Playtest" :revisions="detail.Revisions" :title="title" :now="now" @close="setPlay(false)" @changed="load" />
  </ObxShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAccess } from '~/composables/useAccess';
import { usePoll } from '~/composables/useOmniTumblr';
import { bloxGet, bloxMediaPath, bloxPost, bloxRobloxGameUrl, useBloxOverview, type BloxEvent, type BloxGameDetail } from '~/composables/useOmniBlox';
import { obxConfirm, obxToast } from '~/composables/useObxConsole';
import {
  obxAgo, obxDate, obxInbox, obxInitials, obxReached, obxSpan, obxStageWord, obxUnplayable, type ObxCommand, type ObxTone,
} from '~/scripts/omniblox/console';

definePageMeta({ layout: 'navbar' });

type TabId = 'overview' | 'world' | 'tests' | 'store' | 'numbers' | 'brain' | 'files' | 'activity';

const route = useRoute();
const router = useRouter();
const { can } = useAccess();
const canAct = computed(() => can('omniblox.studio.act'));
const canManage = computed(() => can('omniblox.studio.manage'));
const { overview, refresh: refreshOverview } = useBloxOverview();

const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | null = null;

const gameId = computed(() => String(route.params.gameId));
const detail = ref<BloxGameDetail | null>(null);
const loadError = ref<string | null>(null);
const notFound = ref(false);
const game = computed(() => detail.value?.Game ?? null);
const summary = computed(() => detail.value?.Summary ?? overview.value?.Games.find(g => g.GameId === gameId.value) ?? null);
const title = computed(() => summary.value?.Title ?? 'Game');
/** A public game Roblox lets nobody into (unrated, private…): the first launch sat like that for four days unnoticed. */
const closedReach = computed(() => (summary.value?.IsPublic && summary.value.Reach?.Playable === false ? summary.value.Reach : null));

useHead(() => ({ title: `${title.value} · OmniBlox` }));

async function load() {
  const id = gameId.value;
  const result = await bloxGet<BloxGameDetail>(`/omniblox/game?id=${encodeURIComponent(id)}`);
  if (id !== gameId.value) return;
  if (result.ok && result.data) {
    detail.value = result.data;
    loadError.value = null;
    notFound.value = false;
  } else {
    loadError.value = result.error;
    notFound.value = result.status === 404;
  }
  if (tab.value === 'activity') void loadEvents();
}
async function reloadAll() { await Promise.all([load(), refreshOverview()]); }

usePoll(load, 20_000);
watch(gameId, () => {
  detail.value = null;
  events.value = null;
  void load();
});

const active = computed(() => !!game.value && !['Live', 'Sunset', 'Abandoned'].includes(game.value.Stage));
/** The owner gate the game is stopped at (play and sign off the build, or approve the launch). */
const waitingGate = computed(() => (game.value?.Stage === 'Launch' ? detail.value?.Approvals?.Waiting ?? null : null));
/** The game's own open tasks; the gate card handles the gate's own task. */
const openTasks = computed(() => {
  const tasks = (detail.value?.OwnerTasks ?? []).filter(t => t.Status === 'Open' && !(waitingGate.value && (t.Kind === 'BuildSignoff' || t.Kind === 'LaunchApproval')));
  return obxInbox({ overview: { OwnerTasks: tasks, Attention: [] } as never, canManage: canManage.value, canAct: canAct.value, now: now.value })
    .map(item => ({ ...item, actions: item.actions.filter(a => a !== 'play') }));
});

const headline = computed(() => {
  const g = game.value;
  if (!g) return 'Loading…';
  if (g.Stage === 'Abandoned') return g.AbandonReason ?? 'Abandoned';
  if (g.Stage === 'Live' && g.Publish.WentPublicUtc) return `Live since ${obxDate(g.Publish.WentPublicUtc)} · ${g.Brief?.Genre ?? ''}`;
  return [g.Brief?.Genre, g.Brief?.Template ? `the old ${g.Brief.Template} template` : null, `started ${obxAgo(g.CreatedUtc, now.value)}`].filter(Boolean).join(' · ');
});

const stageMeta = computed(() => {
  const s = summary.value;
  const g = game.value;
  if (!s || !g) return [];
  const parts: { label: string; value: string }[] = [];
  if (g.Stage === 'Live') {
    if (g.NextMaintenanceUtc) parts.push({ label: 'next care', value: obxAgo(g.NextMaintenanceUtc, now.value) });
    parts.push({ label: 'maintenance cycles', value: String(g.Maintenance.length) });
  } else if (g.Stage !== 'Abandoned' && g.Stage !== 'Sunset') {
    parts.push({ label: `in ${g.Stage.toLowerCase()} for`, value: obxSpan(now.value - Date.parse(g.StageEnteredUtc)) });
    parts.push({ label: 'cycles', value: `${s.StageCycles} (no limit)` });
    if (detail.value?.Checklist.length) parts.push({ label: 'criteria', value: `${detail.value.Checklist.filter(c => c.Met).length}/${detail.value.Checklist.length}` });
    if (g.NextAttemptUtc && Date.parse(g.NextAttemptUtc) > now.value) parts.push({ label: 'next attempt', value: obxAgo(g.NextAttemptUtc, now.value) });
    if (g.ProviderFailures) parts.push({ label: 'model unreachable', value: `${g.ProviderFailures}× in a row (backing off)` });
  }
  if (g.Escalations) parts.push({ label: 'watchdog escalations', value: String(g.Escalations) });
  parts.push({ label: 'model calls', value: s.Usage?.Calls?.toLocaleString() ?? '0' });
  return parts;
});

const watchdogText = computed(() => {
  const w = detail.value?.Watchdog;
  if (!w) return '';
  if (w.Level >= 3) return 'The same problem kept coming back, so the game is paused and waiting for you: resume it, steer it with a direction (that resumes it too), or abandon it. Nothing is lost while it waits.';
  return w.Directive ?? `${w.StalledCycles} cycle(s) without progress.`;
});

// ── tabs (in the URL, so a link can open one; 1–8 switch) ──
const tabs = computed(() => {
  const g = game.value;
  const failing = g?.Build.LastEngineRun && !g.Build.LastEngineRun.Ok ? g.Build.LastEngineRun.Failed + g.Build.LastEngineRun.Errors.length : 0;
  const list: { id: TabId; label: string; icon: string; count?: number; tone?: ObxTone }[] = [
    { id: 'overview', label: 'Overview', icon: 'note' },
    { id: 'world', label: 'World', icon: 'map', count: g?.Build.MapScore ?? undefined, tone: g?.Build.MapScore != null ? (g.Build.MapScore < 75 ? 'crit' : g.Build.MapScore >= 85 ? 'ok' : 'warn') : undefined },
    { id: 'tests', label: 'Tests', icon: 'flask', count: failing || undefined, tone: failing ? 'crit' : undefined },
    { id: 'store', label: 'Store', icon: 'store' },
  ];
  if (g && (g.Stage === 'Live' || g.Stage === 'Sunset' || g.Stats.Daily.length)) list.push({ id: 'numbers', label: 'Numbers', icon: 'chart' });
  list.push({ id: 'brain', label: 'Brain', icon: 'brain', count: g?.Cycles.length || undefined });
  list.push({ id: 'files', label: 'Files', icon: 'code' });
  list.push({ id: 'activity', label: 'Activity', icon: 'activity' });
  return list;
});
const tab = computed<TabId>(() => {
  const wanted = String(route.query.tab ?? 'overview') as TabId;
  return tabs.value.some(t => t.id === wanted) ? wanted : 'overview';
});
function setTab(id: TabId) {
  void router.replace({ query: { ...route.query, tab: id === 'overview' ? undefined : id } });
}

// ── play (kept in the URL, so a tile or a task can open it) ──
const playOpen = computed(() => route.query.play === '1');
function setPlay(open: boolean) {
  void router.replace({ query: { ...route.query, play: open ? '1' : undefined } });
}

const events = ref<BloxEvent[] | null>(null);
async function loadEvents() {
  const result = await bloxGet<{ Events: BloxEvent[] }>(`/omniblox/events?gameId=${encodeURIComponent(gameId.value)}&limit=200`);
  if (result.ok && result.data) events.value = result.data.Events;
  else events.value ??= [];
}
watch(tab, t => { if (t === 'activity') void loadEvents(); }, { immediate: true });

// ── actions ──
const busy = ref(false);
async function act(path: string, body: Record<string, unknown>, success?: string) {
  busy.value = true;
  try {
    const result = await bloxPost(path, { gameId: gameId.value, ...body });
    if (!result.ok) obxToast('That did not work', result.error ?? '', 'crit');
    else if (success) obxToast(success);
    await reloadAll();
    return result.ok;
  } finally {
    busy.value = false;
  }
}
const setPaused = (paused: boolean) => act('/omniblox/games/pause', { paused }, paused ? 'Paused' : 'Running again');
const resume = () => act('/omniblox/games/resume', {}, 'Resumed; the watchdog starts over');
const maintain = () => act('/omniblox/games/maintain', {}, 'Maintenance queued');

async function abandon() {
  if (!await obxConfirm(`Abandon "${title.value}"?`, 'The studio stops working on it and frees its experience slot. Everything is kept, and you can revive it later where it stopped.', 'Abandon', true)) return;
  await act('/omniblox/games/abandon', { reason: 'abandoned by the owner' });
}
async function revive() {
  const where = game.value?.AbandonedFromStage;
  const back = where === 'Test' || where === 'Launch' ? 'Build' : where ?? 'where it stopped';
  if (!await obxConfirm(`Revive "${title.value}"?`, `It goes back to ${back} with all its files and history; the watchdog starts over.`, 'Revive')) return;
  await act('/omniblox/games/revive', {}, 'Revived');
}

const directions = ref<{ focus: () => Promise<void> } | null>(null);
function steer() { void directions.value?.focus(); }

const commands = computed<ObxCommand[]>(() => {
  const list: ObxCommand[] = [];
  if (detail.value?.Playtest.Playable) list.push({ id: 'play', group: 'Actions', title: `Play ${title.value}`, icon: 'play', hint: 'P', run: () => setPlay(true) });
  if (canAct.value && active.value) {
    list.push({ id: 'steer', group: 'Actions', title: 'Steer: give a direction', icon: 'steer', hint: 'S', keywords: 'direction note', run: steer });
    if (game.value) list.push({ id: 'pause', group: 'Actions', title: game.value.Paused ? 'Resume this game' : 'Pause this game', icon: game.value.Paused ? 'play' : 'pause', run: () => setPaused(!game.value!.Paused) });
  }
  if (canManage.value && active.value) list.push({ id: 'abandon', group: 'Actions', title: `Abandon ${title.value}`, icon: 'trash', danger: true, run: abandon });
  tabs.value.forEach((t, i) => list.push({ id: `tab-${t.id}`, group: 'Go to', title: `${t.label} tab`, icon: t.icon, hint: String(i + 1), run: () => setTab(t.id) }));
  return list;
});

function typing(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}
function onKey(event: KeyboardEvent) {
  if (typing(event.target) || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('.obx-layer [role="dialog"]')) return;
  const index = Number(event.key);
  if (Number.isInteger(index) && index >= 1 && index <= tabs.value.length) { event.preventDefault(); setTab(tabs.value[index - 1]!.id); }
  else if ((event.key === 'p' || event.key === 'P') && detail.value?.Playtest.Playable) { event.preventDefault(); setPlay(true); }
  else if ((event.key === 's' || event.key === 'S') && canAct.value && active.value) { event.preventDefault(); steer(); }
}
onMounted(() => {
  window.addEventListener('keydown', onKey);
  clock = setInterval(() => { now.value = Date.now(); }, 15_000);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  if (clock) clearInterval(clock);
});
</script>
