<template>
  <div class="pfx" data-testid="pfx-root">
    <!-- ── bar ── -->
    <header class="pfx-bar">
      <div class="pfx-bar__id">
        <span class="pfx-bar__mark"><PeopleIcon name="users" /></span>
        <h1 class="pfx-bar__title">Profiles</h1>
        <span class="pfx-bar__sub" data-testid="pfx-subline">{{ subline }}</span>
      </div>
      <button class="pfx-search" aria-label="Find a profile or run an action" aria-keyshortcuts="Control+K" data-testid="pfx-search" @click="paletteOpen = true">
        <PeopleIcon name="search" />
        <span class="pfx-search__text">Find someone, suspend, sign out idle devices…</span>
        <span class="pfx-kbd">Ctrl</span><span class="pfx-kbd">K</span>
      </button>
      <span class="pfx-bar__spacer"></span>
      <div class="pfx-bar__actions">
        <button class="pfx-live" :data-state="linkState" :data-tone="linkTone" :title="linkTitle" :aria-label="linkTitle" data-testid="pfx-live" @click="setPaused(!paused)">
          <span class="pfx-live__dot"></span>
          <span class="pfx-hide-sm">{{ linkWord }}</span>
          <span v-if="linkState === 'live'" :key="loadedAt" class="pfx-live__sweep"></span>
        </button>
        <button class="pfx-iconbtn" title="Refresh now (R)" aria-label="Refresh now" @click="refresh()"><PeopleIcon name="refresh" :class="{ 'pfx-spin': loading }" /></button>
        <NuxtLink v-if="can('profiles.permissions.view')" class="pfx-btn pfx-btn--ghost" to="/administration/profiles/catalog" title="Every permission, its tier, and who holds it" aria-label="Permissions"><PeopleIcon name="catalog" /><span class="pfx-hide-sm">Permissions</span></NuxtLink>
        <NuxtLink v-if="can('profiles.lifecycle.create')" class="pfx-btn pfx-btn--primary" to="/administration/profiles/new" data-testid="pfx-new" title="New profile (N)" aria-label="New profile"><PeopleIcon name="user-plus" /><span class="pfx-hide-sm">New profile</span></NuxtLink>
      </div>
    </header>

    <div class="pfx-main" :class="{ 'pfx-enter': firstPaint }">
      <div v-if="error && !list" class="pfx-banner" data-tone="crit" role="alert">
        <PeopleIcon name="octagon-x" />
        <div><strong>Couldn't load the directory</strong>{{ error }}</div>
        <div class="pfx-banner__actions"><button class="pfx-btn pfx-btn--sm" @click="refresh()">Try again</button></div>
      </div>

      <!-- ── figures, then the review ── -->
      <div class="pfx-kpis">
        <PeopleKpi label="Online now" icon="activity" :value="list ? String(online) : null" :tone="online ? 'ok' : ''" clickable testid="kpi-online" @open="filter = 'online'">
          <template #sub><template v-if="list">{{ idle ? `${idle} idle · ` : '' }}{{ tabs }} tab{{ tabs === 1 ? '' : 's' }} open</template></template>
          <div v-if="presenceMix.length" style="padding-top: 14px">
            <div class="pfx-mix"><span v-for="m in presenceMix" :key="m.id" :style="{ flex: m.count, background: m.color }"></span></div>
            <div class="pfx-mix__legend"><span v-for="m in presenceMix" :key="m.id"><i :style="{ background: m.color }"></i>{{ m.label }} {{ m.count }}</span></div>
          </div>
        </PeopleKpi>
        <PeopleKpi label="Requests" icon="route" unit="24 h" :value="list ? fmtCount(requests) : null" :tone="refused ? 'warn' : ''" :state="refused ? `${refused} refused` : ''" testid="kpi-requests">
          <template #sub><template v-if="list">{{ busiest ? `mostly ${busiest}` : 'nothing yet today' }}</template></template>
          <PeopleSpark v-if="hourly.length" :values="hourly" />
        </PeopleKpi>
        <PeopleKpi label="Signed-in devices" icon="device" :value="list ? String(devices) : null" :tone="idleDevices ? 'warn' : ''" :state="idleDevices ? `${idleDevices} idle` : ''" clickable testid="kpi-devices" @open="idleDevices ? (idleOpen = true) : undefined">
          <template #sub><template v-if="list">{{ idleDevices ? `${idleDevices} unused for 7+ days` : 'all used this week' }}</template></template>
          <div v-if="devices" style="padding-top: 14px">
            <div class="pfx-mix"><span :style="{ flex: devices - idleDevices, background: '#a78bfa' }"></span><span v-if="idleDevices" :style="{ flex: idleDevices, background: '#fbbf24' }"></span></div>
          </div>
        </PeopleKpi>
        <PeopleKpi label="Permissions in use" icon="layers" :value="usage ? `${usage.pct}%` : list ? '—' : null" :tone="usage && usage.pct < 40 ? 'warn' : ''" testid="kpi-usage">
          <template #sub>
            <template v-if="usage"><b>{{ usage.used }}</b> of {{ usage.held }} held were used in 30 days</template>
            <template v-else-if="list">needs activity access and the newer server</template>
          </template>
          <div v-if="usage" style="padding-top: 14px"><span class="pfx-meter" :data-tone="usage.pct < 40 ? 'warn' : 'violet'"><span :style="{ width: `${usage.pct}%` }"></span></span></div>
        </PeopleKpi>
      </div>

      <PeopleReview :review="review" @act="onIssue">
        <template #foot>
          <span><b>{{ rows.length }}</b> profiles</span>
          <span v-if="trackingSince">activity on record since <b>{{ trackingSince }}</b></span>
          <span v-if="insights?.passwordBearer">passwords as API keys: <b :style="{ color: insights.passwordBearer.accepted ? 'var(--pfx-warn)' : 'var(--pfx-ok)' }">{{ insights.passwordBearer.accepted ? 'accepted' : 'off' }}</b></span>
          <span v-if="!insightsSupported" title="This server predates /KMProfiles/insights">review figures need the newer server</span>
        </template>
      </PeopleReview>

      <!-- ── the directory ── -->
      <section class="pfx-card" aria-label="Directory">
        <header class="pfx-card__head">
          <h2 class="pfx-card__title"><PeopleIcon :name="view === 'matrix' ? 'grid' : 'users'" />{{ view === 'matrix' ? 'Who holds what' : 'Everyone' }}</h2>
          <span class="pfx-card__meta pfx-num" data-testid="pfx-count">{{ view === 'list' ? `${visible.length} of ${rows.length}` : `${catalog.services.value.length} services` }}</span>
          <div class="pfx-card__tools">
            <div class="pfx-seg" role="group" aria-label="View">
              <button class="pfx-seg__opt" :aria-pressed="view === 'list'" title="List (L)" @click="setView('list')"><PeopleIcon name="list" />List</button>
              <button v-if="canSeeGrants" class="pfx-seg__opt" :aria-pressed="view === 'matrix'" title="Who holds what (M)" data-testid="view-matrix" @click="setView('matrix')"><PeopleIcon name="grid" />Matrix</button>
            </div>
          </div>
        </header>

        <template v-if="view === 'list'">
          <div class="pfx-dir__tools">
            <label class="pfx-field">
              <PeopleIcon name="search" />
              <input ref="searchInput" v-model="search" type="search" placeholder="Filter by name, rank or page  ( / )" aria-label="Filter profiles" data-testid="pfx-filter" @keydown.esc="search = ''; ($event.target as HTMLInputElement).blur()" />
            </label>
            <div class="pfx-seg" role="group" aria-label="Show">
              <button v-for="f in FILTERS" :key="f.id" class="pfx-seg__opt" :aria-pressed="filter === f.id" :data-tone="f.id === 'attention' && counts.attention ? 'warn' : undefined" :data-testid="`filter-${f.id}`" @click="filter = f.id">
                {{ f.label }}<span v-if="f.id !== 'all' && counts[f.id]" class="pfx-seg__count">{{ counts[f.id] }}</span>
              </button>
            </div>
            <span class="pfx-toolbar__grow"></span>
            <label class="pfx-dim" style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px">
              Sort
              <select v-model="sort" class="pfx-select pfx-select--sm" aria-label="Sort profiles">
                <option v-for="s in SORTS" :key="s.id" :value="s.id">{{ s.label }}</option>
              </select>
            </label>
          </div>

          <div class="pfx-table" role="grid" aria-label="Profiles">
            <div class="pfx-trow pfx-trow--head" role="row">
              <span></span><span role="columnheader">Who</span><span role="columnheader" class="pfx-trow__where">Where</span>
              <span role="columnheader" class="pfx-trow__activity">Last 24 hours</span><span role="columnheader" class="pfx-trow__access">Permissions · 30 d</span>
              <span role="columnheader" class="pfx-trow__devices">Devices</span><span></span>
            </div>
            <template v-if="!list && loading">
              <div v-for="n in 5" :key="n" class="pfx-trow"><span class="pfx-skel" style="height: 32px; width: 32px"></span><span class="pfx-skel" style="height: 14px; width: 60%"></span></div>
            </template>
            <PeopleRow
              v-for="(row, i) in visible"
              :key="row.userId"
              :row="row"
              :insights="insights"
              :now="now"
              :selected="selectedId === row.userId || sheetId === row.userId"
              @open="select(i); openSheet(row.userId)"
              @page="openPage(row.userId)"
              @menu="e => openMenu(row, e)"
            />
            <div v-if="list && !visible.length" class="pfx-empty"><PeopleIcon name="filter" />{{ rows.length ? 'Nobody matches these filters.' : 'No profiles yet.' }}
              <button v-if="rows.length" class="pfx-btn pfx-btn--sm" @click="filter = 'all'; search = ''">Show everyone</button>
            </div>
          </div>
          <footer class="pfx-card__foot">
            <span><span class="pfx-kbd">↑</span> <span class="pfx-kbd">↓</span> move · <span class="pfx-kbd">↵</span> quick look · <span class="pfx-kbd">O</span> open · <span class="pfx-kbd">/</span> filter · <span class="pfx-kbd">M</span> matrix</span>
          </footer>
        </template>

        <PeopleMatrix v-else :services="catalog.services.value" :people="matrixPeople" @cell="(id, service) => openPage(id, 'access', service)" @person="id => openSheet(id)" />
      </section>
    </div>

    <!-- ── one profile, beside the list ── -->
    <PeopleSheet
      :profile="sheet"
      :person="sheetPerson"
      :insights="insights"
      :sessions="sheetSessions"
      :activity="sheetActivity"
      :loading="sheetLoading"
      :busy="busy"
      :now="now"
      :can-control="!!sheet && sheet.manageable && can('profiles.access.control')"
      :can-activity="can('profiles.activity.read')"
      :can-access="canSeeGrants"
      :title-of="titleOf"
      @close="closeSheet()"
      @page="tab => sheet && openPage(sheet.userId, tab)"
      @suspend="sheet && (suspending = sheet)"
      @unsuspend="sheet && actions.unsuspend(sheet)"
      @read-only="on => sheet && actions.setReadOnly(sheet, on)"
      @login="on => sheet && (on ? actions.setLogin(sheet, true) : (confirming = { row: sheet, kind: 'login-off' }))"
      @sign-out-all="sheet && (confirming = { row: sheet, kind: 'signout' })"
      @sign-out-idle="sheet && signOutIdleOf(sheet, sheetIdleIds)"
      @revoke="id => sheet && actions.signOutDevice(sheet, id).then(() => sheet && loadSheet(sheet.userId, true))"
    />

    <!-- ── row menu ── -->
    <Teleport to="body">
      <div v-if="menu" class="pfx-layer" style="position: fixed; inset: 0; z-index: 1190" @pointerdown.self="menu = null">
        <div class="pfx-menu" role="menu" :aria-label="`Actions for ${menu.row.name}`" :style="{ top: `${menu.y}px`, left: `${menu.x}px` }" data-testid="pfx-menu" @keydown.esc="menu = null">
          <button class="pfx-menu__item" role="menuitem" @click="withMenu(r => openPage(r.userId))"><PeopleIcon name="external" />Open profile</button>
          <button class="pfx-menu__item" role="menuitem" @click="withMenu(r => openSheet(r.userId))"><PeopleIcon name="eye" />Quick look</button>
          <template v-if="menu.row.manageable && can('profiles.access.control')">
            <div class="pfx-menu__sep"></div>
            <button v-if="!menu.row.suspended" class="pfx-menu__item" role="menuitem" @click="withMenu(r => (suspending = r))"><PeopleIcon name="pause" />Suspend…</button>
            <button v-else class="pfx-menu__item" role="menuitem" @click="withMenu(r => actions.unsuspend(r))"><PeopleIcon name="play" />Lift suspension</button>
            <button class="pfx-menu__item" role="menuitem" @click="withMenu(r => actions.setReadOnly(r, !r.readOnly))"><PeopleIcon name="eye" />{{ menu.row.readOnly ? 'Lift read-only' : 'Make read-only' }}</button>
            <button class="pfx-menu__item" role="menuitem" :disabled="!menu.row.idleDevices" @click="withMenu(r => signOutIdleOf(r))"><PeopleIcon name="clock" />Sign out idle devices{{ menu.row.idleDevices ? ` (${menu.row.idleDevices})` : '' }}</button>
            <button class="pfx-menu__item" role="menuitem" :disabled="!menu.row.sessions" @click="withMenu(r => (confirming = { row: r, kind: 'signout' }))"><PeopleIcon name="signout" />Sign out everywhere</button>
            <button class="pfx-menu__item" role="menuitem" data-danger="true" @click="withMenu(r => (r.canLogin ? (confirming = { row: r, kind: 'login-off' }) : actions.setLogin(r, true)))"><PeopleIcon name="power" />{{ menu.row.canLogin ? 'Turn sign-in off…' : 'Turn sign-in on' }}</button>
          </template>
          <template v-else-if="menu.row.isYou && menu.row.idleDevices">
            <div class="pfx-menu__sep"></div>
            <button class="pfx-menu__item" role="menuitem" @click="withMenu(r => signOutIdleOf(r))"><PeopleIcon name="clock" />Sign out my idle devices ({{ menu.row.idleDevices }})</button>
          </template>
          <template v-if="canSeeGrants && !menu.row.isOwner">
            <div class="pfx-menu__sep"></div>
            <button class="pfx-menu__item" role="menuitem" @click="withMenu(r => openPage(r.userId, 'access'))"><PeopleIcon name="layers" />{{ menu.row.unused.length ? `Permissions · ${menu.row.unused.length} unused` : 'Permissions' }}</button>
          </template>
        </div>
      </div>
    </Teleport>

    <!-- ── dialogs ── -->
    <PeopleSuspendDialog :open="!!suspending" :name="suspending?.name ?? ''" :busy="busy === 'suspend'" @close="suspending = null" @confirm="doSuspend" />

    <PeopleDialog :open="!!confirming" :title="confirmCopy.title" :sub="confirmCopy.sub" :icon="confirming?.kind === 'login-off' ? 'power' : 'signout'" tone="crit" testid="pfx-confirm" @close="confirming = null">
      <p>{{ confirmCopy.text }}</p>
      <template #actions>
        <button class="pfx-btn pfx-btn--ghost" @click="confirming = null">Cancel</button>
        <button class="pfx-btn pfx-btn--solid-danger" :disabled="!!busy" data-testid="pfx-confirm-go" @click="runConfirmed">{{ confirmCopy.button }}</button>
      </template>
    </PeopleDialog>

    <PeopleDialog :open="idleOpen" title="Sign out idle devices" :sub="`Devices nobody has used for ${IDLE_DAYS}+ days. Each would otherwise stay signed in for 30 days after its last use.`" icon="clock" tone="warn" testid="pfx-idle" @close="idleOpen = false">
      <div v-for="r in idleRows" :key="r.userId" class="pfx-form__row">
        <span style="display: flex; align-items: center; gap: 9px; min-width: 0">
          <PeopleAvatar :name="r.name" :id="r.userId" :owner="r.isOwner" :size="26" />
          <span class="pfx-truncate"><strong>{{ r.name }}</strong><span class="pfx-dim"> · {{ r.idleDevices }} of {{ r.sessions }} device{{ r.sessions === 1 ? '' : 's' }}</span></span>
        </span>
        <span v-if="!canSignOutIdle(r)" class="pfx-dim" style="font-size: 12px">not yours to manage</span>
        <label v-else class="pfx-check"><input v-model="idlePick" type="checkbox" :value="r.userId" />Sign out</label>
      </div>
      <p class="pfx-help" style="margin-top: 10px">Your own idle devices are signed out from your account; the device you're on is never touched.</p>
      <template #actions>
        <button class="pfx-btn pfx-btn--ghost" @click="idleOpen = false">Cancel</button>
        <button class="pfx-btn pfx-btn--warn" :disabled="!!busy || !idlePick.length" data-testid="pfx-idle-go" @click="signOutIdleChosen">
          <PeopleIcon name="signout" />Sign out {{ idleChosenCount }} device{{ idleChosenCount === 1 ? '' : 's' }}
        </button>
      </template>
    </PeopleDialog>

    <PeoplePalette :open="paletteOpen" :commands="commands" @close="paletteOpen = false" />
    <PeopleToasts :toasts="toasts" @dismiss="dismiss" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAccess, usePermissionCatalog } from '~/composables/useAccess';
import { useProfilesConsole } from '~/composables/useProfilesConsole';
import { fmtCount } from '~/scripts/profileFormat';
import type { ProfileRow } from '~/scripts/profilesApi';
import {
  addSeries, computeReview, FILTERS, IDLE_DAYS, isIdleSession, matchesFilter, matchesText, SORTS, sortRows,
  type ConsoleCommand, type DirectoryFilter, type DirectorySort, type PersonRow, type ReviewIssue,
} from '~/scripts/profilesConsole';

definePageMeta({ layout: 'navbar' });

const router = useRouter();
const { can } = useAccess();
const catalog = usePermissionCatalog();
const console_ = useProfilesConsole();
const {
  list, insights, insightsSupported, rows, loading, error, loadedAt, now, linkState, paused, setPaused, refresh,
  toasts, busy, dismiss, actions, sheetId, sheet, sheetSessions, sheetActivity, sheetLoading, openSheet, closeSheet, loadSheet,
} = console_;

const canSeeGrants = computed(() => can('profiles.permissions.view'));
const titleOf = (key: string) => catalog.describe(key).title;

// ───────────────────────────── preferences ─────────────────────────────

const PREFS_KEY = 'pfx:directory';
const search = ref('');
const filter = ref<DirectoryFilter>('all');
const sort = ref<DirectorySort>('rank');
const view = ref<'list' | 'matrix'>('list');
if (import.meta.client) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? '{}');
    if (SORTS.some(s => s.id === saved.sort)) sort.value = saved.sort;
    if (saved.view === 'matrix' || saved.view === 'list') view.value = saved.view;
  } catch { /* storage blocked: defaults */ }
}
watch([sort, view], () => {
  try { window.localStorage.setItem(PREFS_KEY, JSON.stringify({ sort: sort.value, view: view.value })); } catch { /* storage blocked */ }
});
function setView(next: 'list' | 'matrix') {
  view.value = next === 'matrix' && !canSeeGrants.value ? 'list' : next;
  if (view.value === 'matrix') void catalog.load();
}

// ───────────────────────────── bar ─────────────────────────────

const linkTone = computed(() => ({ live: 'ok', paused: 'neutral', stale: 'warn', offline: 'crit', connecting: 'neutral' } as Record<string, string>)[linkState.value]);
const linkWord = computed(() => ({ live: 'Live', paused: 'Paused', stale: 'Stale', offline: 'Offline', connecting: 'Connecting' } as Record<string, string>)[linkState.value]);
const linkTitle = computed(() => (linkState.value === 'live' ? 'Live: read every 15 seconds while this tab is open. Click to pause.'
  : linkState.value === 'paused' ? 'Paused. Click to resume.' : linkState.value === 'offline' ? 'No answer from the server. Still trying.' : 'Connecting…'));

const online = computed(() => rows.value.filter(r => r.presence.state === 'online').length);
const idle = computed(() => rows.value.filter(r => r.presence.state === 'idle').length);
const tabs = computed(() => rows.value.reduce((n, r) => n + r.presence.connections, 0));
const subline = computed(() => (list.value ? `${rows.value.length} profiles · ${online.value} online` : ''));

// ───────────────────────────── figures ─────────────────────────────

const requests = computed(() => rows.value.reduce((n, r) => n + r.requests24h, 0));
const refused = computed(() => rows.value.reduce((n, r) => n + r.denied24h, 0));
const hourly = computed(() => addSeries(rows.value.map(r => r.hourly)));
const busiest = computed(() => {
  const top = [...rows.value].sort((a, b) => b.requests24h - a.requests24h)[0];
  return top && top.requests24h ? top.name : '';
});
const devices = computed(() => rows.value.reduce((n, r) => n + r.sessions, 0));
const idleDevices = computed(() => rows.value.reduce((n, r) => n + r.idleDevices, 0));
const presenceMix = computed(() => {
  const counts = { online: online.value, idle: idle.value, offline: rows.value.length - online.value - idle.value };
  return [
    { id: 'online', label: 'Online', count: counts.online, color: '#4ade80' },
    { id: 'idle', label: 'Idle', count: counts.idle, color: '#fbbf24' },
    { id: 'offline', label: 'Offline', count: counts.offline, color: '#3b3a4c' },
  ].filter(m => m.count > 0);
});
/** Across profiles that can sign in (the owner excluded): held permissions used in the last 30 days. */
const usage = computed(() => {
  const people = rows.value.filter(r => !r.isOwner && r.canLogin && r.used != null);
  if (!people.length) return null;
  const held = people.reduce((n, r) => n + r.held, 0);
  const used = people.reduce((n, r) => n + (r.used ?? 0), 0);
  return { held, used, pct: held ? Math.round((used / held) * 100) : 100 };
});
const trackingSince = computed(() => {
  const ms = Date.parse(insights.value?.trackingSinceUtc ?? '');
  return Number.isFinite(ms) ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
});

const review = computed(() => computeReview(rows.value, insights.value, now.value));

// ───────────────────────────── the list ─────────────────────────────

const counts = computed<Record<DirectoryFilter, number>>(() => ({
  all: rows.value.length,
  online: rows.value.filter(r => matchesFilter(r, 'online')).length,
  attention: rows.value.filter(r => matchesFilter(r, 'attention')).length,
  off: rows.value.filter(r => matchesFilter(r, 'off')).length,
  suspended: rows.value.filter(r => matchesFilter(r, 'suspended')).length,
}));
const visible = computed(() => sortRows(rows.value.filter(r => matchesFilter(r, filter.value) && matchesText(r, search.value)), sort.value));
const selectedId = ref<string | null>(null);
function select(index: number) {
  selectedId.value = visible.value[index]?.userId ?? null;
}
const selectedIndex = computed(() => visible.value.findIndex(r => r.userId === selectedId.value));
const sheetPerson = computed(() => rows.value.find(r => r.userId === sheetId.value) ?? null);
/** The sheet's idle devices by id, once its device list has loaded (undefined until then: the list's idleDays path). */
const sheetIdleIds = computed(() => (sheetSessions.value.length
  ? sheetSessions.value.filter(s => !s.current && isIdleSession(s, now.value)).map(s => s.sessionId)
  : undefined));
const matrixPeople = computed(() => sortRows(rows.value, 'rank').map(r => ({ userId: r.userId, name: r.name, isOwner: r.isOwner, effective: r.insight?.effective })));

function openPage(userId: string, tab = '', service = '') {
  const query: Record<string, string> = {};
  if (tab) query.tab = tab;
  if (service) query.service = service;
  void router.push({ path: `/administration/profiles/${userId}`, query });
}

// ───────────────────────────── review actions ─────────────────────────────

function onIssue(issue: ReviewIssue) {
  const action = issue.action;
  if (!action) return;
  if (action.kind === 'filter') { view.value = 'list'; filter.value = action.filter; search.value = ''; }
  else if (action.kind === 'profile') openPage(action.userId, action.tab);
  else if (action.kind === 'sheet') openSheet(action.userId);
  else if (action.kind === 'idle') idleOpen.value = true;
  else if (action.kind === 'settings') void router.push({ path: '/administration/omnisettings', query: { q: 'KMProfiles_AcceptPasswordAsBearer', focus: 'KMProfiles_AcceptPasswordAsBearer' } });
}

// ───────────────────────────── actions ─────────────────────────────

const menu = ref<{ row: PersonRow; x: number; y: number } | null>(null);
function openMenu(row: PersonRow, event: MouseEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  menu.value = { row, x: Math.max(8, Math.min(rect.right - 224, window.innerWidth - 232)), y: Math.min(rect.bottom + 4, window.innerHeight - 320) };
}
/** Runs a menu item on the row it was opened for, after closing the menu. */
function withMenu(run: (row: PersonRow) => unknown) {
  const row = menu.value?.row;
  menu.value = null;
  if (row) void run(row);
}

const suspending = ref<ProfileRow | null>(null);
async function doSuspend(options: { minutes?: number; untilUtc?: string }, reason: string) {
  const row = suspending.value;
  if (!row) return;
  if (await actions.suspend(row, options, reason)) suspending.value = null;
}

const confirming = ref<{ row: ProfileRow; kind: 'signout' | 'login-off' } | null>(null);
const confirmCopy = computed(() => {
  const c = confirming.value;
  if (!c) return { title: '', sub: '', text: '', button: '' };
  return c.kind === 'signout'
    ? { title: `Sign ${c.row.name} out everywhere?`, sub: `${c.row.sessions} device${c.row.sessions === 1 ? '' : 's'}`, text: 'Every session ends now and every open tab goes back to the sign-in page. They can sign in again with their password.', button: 'Sign out everywhere' }
    : { title: `Turn sign-in off for ${c.row.name}?`, sub: 'Their permissions are kept', text: 'Every session ends now and they can’t sign in again until you turn it back on.', button: 'Turn sign-in off' };
});
async function runConfirmed() {
  const c = confirming.value;
  if (!c) return;
  const ok = c.kind === 'signout' ? await actions.signOutEverywhere(c.row) : await actions.setLogin(c.row, false);
  if (ok) confirming.value = null;
}

const canSignOutIdle = (r: PersonRow) => r.isYou || (r.manageable && can('profiles.access.control'));
/** From the sheet, with its device list loaded, devices go one by one; from the list, by idleDays (see useProfileActions). */
async function signOutIdleOf(row: ProfileRow, idleSessionIds?: string[]) {
  const result = await actions.signOutIdle(row, idleSessionIds);
  if (result && sheet.value?.userId === row.userId) void loadSheet(row.userId, true);
}

const idleOpen = ref(false);
const idlePick = ref<string[]>([]);
const idleRows = computed(() => rows.value.filter(r => r.idleDevices > 0));
const idleChosenCount = computed(() => idleRows.value.filter(r => idlePick.value.includes(r.userId)).reduce((n, r) => n + r.idleDevices, 0));
watch(idleOpen, open => { if (open) idlePick.value = idleRows.value.filter(canSignOutIdle).map(r => r.userId); });
async function signOutIdleChosen() {
  const chosen = idleRows.value.filter(r => idlePick.value.includes(r.userId) && canSignOutIdle(r));
  idleOpen.value = false;
  for (const row of chosen) await actions.signOutIdle(row);
}

// ───────────────────────────── palette ─────────────────────────────

const paletteOpen = ref(false);
const commands = computed<ConsoleCommand[]>(() => {
  const out: ConsoleCommand[] = [];
  for (const r of sortRows(rows.value, 'rank')) {
    out.push({ id: `open-${r.userId}`, group: 'Profiles', title: r.name, icon: 'user', hint: r.isOwner ? 'Owner' : r.rank, keywords: `${r.rank} open profile`, run: () => openPage(r.userId) });
  }
  if (can('profiles.lifecycle.create')) out.push({ id: 'new', group: 'Go to', title: 'New profile', icon: 'user-plus', keywords: 'create add', run: () => router.push('/administration/profiles/new') });
  if (canSeeGrants.value) {
    out.push({ id: 'catalog', group: 'Go to', title: 'Permission catalog', icon: 'catalog', keywords: 'permissions keys routes tiers', run: () => router.push('/administration/profiles/catalog') });
    out.push({ id: 'matrix', group: 'Go to', title: 'Who holds what (matrix)', icon: 'grid', keywords: 'access matrix compare', run: () => setView('matrix') });
  }
  out.push({ id: 'account', group: 'Go to', title: 'Your account', icon: 'user', keywords: 'me password devices', run: () => router.push('/account') });
  for (const f of FILTERS) out.push({ id: `filter-${f.id}`, group: 'Show', title: `Show: ${f.label}`, icon: 'filter', run: () => { view.value = 'list'; filter.value = f.id; } });
  if (idleDevices.value) out.push({ id: 'idle-all', group: 'Actions', title: `Sign out idle devices (${idleDevices.value})`, icon: 'clock', keywords: 'sessions unused stale', run: () => { idleOpen.value = true; } });
  if (can('profiles.access.control')) {
    for (const r of rows.value.filter(row => row.manageable)) {
      if (!r.suspended) out.push({ id: `suspend-${r.userId}`, group: 'Actions', title: `Suspend ${r.name}…`, icon: 'pause', keywords: 'pause lock', run: () => { suspending.value = r; } });
      else out.push({ id: `unsuspend-${r.userId}`, group: 'Actions', title: `Lift ${r.name}'s suspension`, icon: 'play', run: () => actions.unsuspend(r) });
      out.push({ id: `ro-${r.userId}`, group: 'Actions', title: r.readOnly ? `Lift read-only for ${r.name}` : `Make ${r.name} read-only`, icon: 'eye', run: () => actions.setReadOnly(r, !r.readOnly) });
      if (r.idleDevices) out.push({ id: `idle-${r.userId}`, group: 'Actions', title: `Sign out ${r.name}'s idle devices (${r.idleDevices})`, icon: 'clock', danger: true, run: () => signOutIdleOf(r) });
      if (r.sessions) out.push({ id: `signout-${r.userId}`, group: 'Actions', title: `Sign ${r.name} out everywhere`, icon: 'signout', danger: true, run: () => actions.signOutEverywhere(r) });
      out.push({ id: `login-${r.userId}`, group: 'Actions', title: r.canLogin ? `Turn sign-in off for ${r.name}` : `Turn sign-in on for ${r.name}`, icon: 'power', danger: r.canLogin, run: () => actions.setLogin(r, !r.canLogin) });
    }
  }
  out.push({ id: 'refresh', group: 'Actions', title: 'Refresh now', icon: 'refresh', run: () => refresh() });
  return out;
});

// ───────────────────────────── keyboard ─────────────────────────────

const searchInput = ref<HTMLInputElement | null>(null);
function typing(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}
function onKey(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); paletteOpen.value = true; return; }
  if (paletteOpen.value || suspending.value || confirming.value || idleOpen.value || typing(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'Escape') { if (menu.value) menu.value = null; else if (sheetId.value) closeSheet(); return; }
  if (view.value === 'list' && (event.key === 'ArrowDown' || event.key === 'j' || event.key === 'ArrowUp' || event.key === 'k')) {
    event.preventDefault();
    const n = visible.value.length;
    if (!n) return;
    const at = selectedIndex.value;
    const next = event.key === 'ArrowDown' || event.key === 'j' ? Math.min(n - 1, at + 1) : Math.max(0, at < 0 ? 0 : at - 1);
    select(next);
    if (sheetId.value) openSheet(visible.value[next].userId);
    void nextTick(() => document.querySelector(`[data-testid="row-${visible.value[next].userId}"]`)?.scrollIntoView({ block: 'nearest' }));
    return;
  }
  const current = visible.value[selectedIndex.value];
  if (event.key === 'Enter' && current) { event.preventDefault(); openSheet(current.userId); return; }
  if (event.key === 'o' && (current || sheetId.value)) { event.preventDefault(); openPage(current?.userId ?? sheetId.value!); return; }
  if (event.key === '/') { event.preventDefault(); setView('list'); void nextTick(() => searchInput.value?.focus()); return; }
  if (event.key === 'm' && canSeeGrants.value) { setView(view.value === 'matrix' ? 'list' : 'matrix'); return; }
  if (event.key === 'l') { setView('list'); return; }
  if (event.key === 'r') { void refresh(); return; }
  if (event.key === 'n' && can('profiles.lifecycle.create')) { void router.push('/administration/profiles/new'); }
}

const firstPaint = ref(true);
onMounted(() => {
  void catalog.load();
  window.addEventListener('keydown', onKey);
  window.setTimeout(() => { firstPaint.value = false; }, 800);
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<style lang="scss" src="~/assets/scss/profiles-console.scss"></style>
