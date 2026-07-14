<template>
  <div class="projects-list-page">
    <div class="page-header">
      <div>
        <h1 class="page-title">Projects</h1>
        <p class="page-subtitle">Autonomous 24/7 agent task force</p>
      </div>
      <div class="header-actions">
        <button v-if="!loading && projects.length" class="ghost-btn" @click="openBroadcast">📣 Broadcast</button>
        <button
          v-if="!loading && projects.length"
          class="ghost-btn"
          :class="{ danger: !anyHalted, active: anyHalted }"
          :disabled="fleetBusy"
          @click="anyHalted ? unhaltAll() : haltAll()"
        >
          {{ anyHalted ? `▶ Unhalt all (${haltedCount})` : '⏸ Halt all' }}
        </button>
        <NuxtLink to="/projects/accounts" class="ghost-btn">⚿ Accounts</NuxtLink>
        <button class="ghost-btn" :class="{ active: showDefaults }" @click="showDefaults = !showDefaults">⚙ Default settings</button>
        <NuxtLink to="/projects/new" class="primary-btn">+ New project</NuxtLink>
      </div>
    </div>

    <div v-if="fleetMsg" class="info-banner fleet-msg">{{ fleetMsg }}</div>

    <!-- Broadcast composer: one message → every live project's Commander. -->
    <div v-if="showBroadcast" class="broadcast-card">
      <div class="broadcast-head">
        <h2>Broadcast to every project</h2>
        <button class="defaults-close" @click="showBroadcast = false">✕</button>
      </div>
      <p class="broadcast-hint">Delivered to every live project (shelved and completed projects are skipped). Working Commanders receive it immediately; halted/paused ones see it on their next wake.</p>
      <textarea
        v-model="broadcastText"
        class="broadcast-input"
        rows="3"
        placeholder="Message to send to every project…"
        :disabled="fleetBusy"
        @keydown.ctrl.enter="sendBroadcast"
      ></textarea>
      <div class="broadcast-actions">
        <button class="ghost-btn" @click="showBroadcast = false" :disabled="fleetBusy">Cancel</button>
        <button class="primary-btn" :disabled="fleetBusy || !broadcastText.trim()" @click="sendBroadcast">Send to all</button>
      </div>
    </div>

    <div v-if="showDefaults" class="defaults-card">
      <div class="defaults-head">
        <h2>System defaults</h2>
        <button class="defaults-close" @click="showDefaults = false">✕</button>
      </div>
      <ProjectsSettingsPanel system />
    </div>

    <ProjectsAttentionStrip v-if="!loading && projects.length" :projects="projects" />

    <div v-if="loading" class="info-banner">Loading projects…</div>
    <div v-else-if="loadError" class="error-banner">{{ loadError }}</div>
    <div v-else-if="!projects.length" class="empty-banner">
      No projects yet. Create one with a goal and a budget to set the fleet to work.
    </div>

    <template v-else>
    <div v-if="!activeProjects.length" class="empty-banner">All projects are shelved. Unshelve one below, or create a new project.</div>
    <div v-else class="project-grid">
      <NuxtLink
        v-for="p in activeProjects"
        :key="p.projectID"
        :to="`/projects/${p.projectID}`"
        class="project-card"
      >
        <div class="card-head">
          <div class="card-title">{{ p.name || '(untitled)' }}</div>
          <div class="card-pills">
            <span v-if="p.halted" class="halt-chip" title="Halted by fleet halt-all — unhalt to restore its previous state">⏸ halted</span>
            <ProjectsStatusPill :status="p.status" />
          </div>
        </div>
        <div class="card-goal">{{ p.goal || 'No goal' }}</div>

        <div class="card-spend">
          <div class="spend-row">
            <span>Tokens ${{ fmt(p.tokenSpendUsd) }} / ${{ fmt(p.tokenBudgetUsd) }}</span>
            <span v-if="p.pendingApprovals" class="pending">{{ p.pendingApprovals }} pending</span>
          </div>
          <div class="spend-bar"><div class="spend-fill" :class="{ danger: frac(p.tokenSpendUsd, p.tokenBudgetUsd) >= 0.8 }" :style="{ width: pct(p.tokenSpendUsd, p.tokenBudgetUsd) }"></div></div>
        </div>

        <div class="card-meta">
          <span>money ${{ fmt(p.moneySpendUsd) }} / ${{ fmt(p.moneyBudgetUsd) }}</span>
          <span>cap {{ p.subAgentCap }}</span>
        </div>
        <div class="card-time">Started {{ formatTime(p.createdAt) }}</div>
      </NuxtLink>
    </div>

    <!-- Shelved (archived) projects — collapsed section, dimmed cards, quick unshelve. -->
    <div v-if="archivedProjects.length" class="archived-section">
      <button class="archived-toggle" @click="showArchived = !showArchived">
        {{ showArchived ? '▾' : '▸' }} Shelved ({{ archivedProjects.length }})
      </button>
      <div v-if="showArchived" class="project-grid archived-grid">
        <div v-for="p in archivedProjects" :key="p.projectID" class="project-card archived-card">
          <div class="card-head">
            <NuxtLink :to="`/projects/${p.projectID}`" class="card-title archived-link">{{ p.name || '(untitled)' }}</NuxtLink>
            <span class="status-pill s-archived">Archived</span>
          </div>
          <div class="card-goal">{{ p.goal || 'No goal' }}</div>
          <div class="card-meta"><span>tokens ${{ fmt(p.tokenSpendUsd) }} / ${{ fmt(p.tokenBudgetUsd) }}</span></div>
          <button class="unshelve-btn" @click="unarchive(p.projectID)">Unshelve</button>
        </div>
      </div>
    </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import { useEventStream } from '~/composables/useEventStream';
import ProjectsSettingsPanel from '~/components/Projects/SettingsPanel.vue';
import ProjectsAttentionStrip from '~/components/Projects/AttentionStrip.vue';
import ProjectsStatusPill from '~/components/Projects/StatusPill.vue';

definePageMeta({ layout: 'navbar' });

const showDefaults = ref(false);

interface ProjectSummary {
  projectID: string;
  name: string;
  goal: string;
  status: string;
  createdAt: string;
  tokenBudgetUsd: number;
  moneyBudgetUsd: number;
  subAgentCap: number;
  tokenSpendUsd: number;
  moneySpendUsd: number;
  pendingApprovals: number;
  halted: boolean;
  blocker: string;
}

const projects = ref<ProjectSummary[]>([]);
const loading = ref(true);
const loadError = ref('');
const showArchived = ref(false);

const showBroadcast = ref(false);
const broadcastText = ref('');
const fleetBusy = ref(false);
const fleetMsg = ref('');

const activeProjects = computed(() => projects.value.filter(p => p.status !== 'Archived'));
const archivedProjects = computed(() => projects.value.filter(p => p.status === 'Archived'));
const haltedCount = computed(() => projects.value.filter(p => p.halted).length);
const anyHalted = computed(() => haltedCount.value > 0);

function flashFleet(msg: string) {
  fleetMsg.value = msg;
  setTimeout(() => { if (fleetMsg.value === msg) fleetMsg.value = ''; }, 5000);
}

function openBroadcast() {
  showBroadcast.value = true;
  broadcastText.value = '';
}

async function sendBroadcast() {
  const text = broadcastText.value.trim();
  if (!text || fleetBusy.value) return;
  fleetBusy.value = true;
  try {
    const res = await RequestPOSTFromKliveAPI('/projects/broadcast', JSON.stringify({ text }), false, true);
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      flashFleet(`Broadcast delivered to ${data?.delivered ?? '?'} project(s).`);
      showBroadcast.value = false;
      broadcastText.value = '';
    } else {
      flashFleet(`Broadcast failed (HTTP ${res.status}).`);
    }
  } catch (err: any) {
    flashFleet(`Broadcast failed: ${err?.message ?? String(err)}`);
  } finally {
    fleetBusy.value = false;
  }
}

async function haltAll() {
  if (fleetBusy.value) return;
  fleetBusy.value = true;
  try {
    const res = await RequestPOSTFromKliveAPI('/projects/halt-all', '', false, true);
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      flashFleet(`Halted ${data?.halted ?? '?'} project(s). Unhalt to restore each to its previous state.`);
    } else {
      flashFleet(`Halt-all failed (HTTP ${res.status}).`);
    }
    await loadProjects(true);
  } catch (err: any) {
    flashFleet(`Halt-all failed: ${err?.message ?? String(err)}`);
  } finally {
    fleetBusy.value = false;
  }
}

async function unhaltAll() {
  if (fleetBusy.value) return;
  fleetBusy.value = true;
  try {
    const res = await RequestPOSTFromKliveAPI('/projects/unhalt-all', '', false, true);
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      flashFleet(`Restored ${data?.restored ?? '?'} project(s) to their pre-halt state.`);
    } else {
      flashFleet(`Unhalt-all failed (HTTP ${res.status}).`);
    }
    await loadProjects(true);
  } catch (err: any) {
    flashFleet(`Unhalt-all failed: ${err?.message ?? String(err)}`);
  } finally {
    fleetBusy.value = false;
  }
}

async function unarchive(projectID: string) {
  await RequestPOSTFromKliveAPI('/projects/unarchive', JSON.stringify({ projectID }), false, true);
  await loadProjects();
}

function normalise(raw: unknown): ProjectSummary[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is Record<string, any> => p && typeof p === 'object')
    .map(p => ({
      projectID: String(p.projectID ?? ''),
      name: String(p.name ?? ''),
      goal: String(p.goal ?? ''),
      status: String(p.status ?? 'Active'),
      createdAt: String(p.createdAt ?? ''),
      tokenBudgetUsd: Number(p.tokenBudgetUsd ?? 0),
      moneyBudgetUsd: Number(p.moneyBudgetUsd ?? 0),
      subAgentCap: Number(p.subAgentCap ?? 0),
      tokenSpendUsd: Number(p.tokenSpendUsd ?? 0),
      moneySpendUsd: Number(p.moneySpendUsd ?? 0),
      pendingApprovals: Number(p.pendingApprovals ?? 0),
      halted: Boolean(p.halted ?? false),
      blocker: String(p.blocker ?? ''),
    }))
    .filter(p => p.projectID);
}

async function loadProjects(silent = false) {
  if (!silent) loading.value = true;
  loadError.value = '';
  try {
    const res = await RequestGETFromKliveAPI('/projects/list', false, false);
    if (!res.ok) {
      if (!silent) { loadError.value = `Failed to load projects (HTTP ${res.status}).`; projects.value = []; }
      return;
    }
    projects.value = normalise(await res.json());
  } catch (err: any) {
    if (!silent) { loadError.value = err?.message ?? String(err); projects.value = []; }
  } finally {
    if (!silent) loading.value = false;
  }
}

// Live fleet updates (Phase 3): the firehose signals on ANY project's event; debounce a silent
// reload so the dashboard is never frozen. A slow poll is the safety net if the socket drops.
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => { refreshTimer = null; loadProjects(true); }, 1200);
}
const fleetStream = useEventStream({ onFleet: () => scheduleRefresh() });
let safetyPoll: ReturnType<typeof setInterval> | null = null;

function statusClass(s: string) { return 's-' + (s || '').toLowerCase(); }
function fmt(n: number) { return (Number(n) || 0).toFixed(2); }
function frac(a: number, b: number) { return b > 0 ? Math.min(1, (Number(a) || 0) / b) : 0; }
function pct(a: number, b: number) { return (frac(a, b) * 100).toFixed(1) + '%'; }
function formatTime(iso: string): string {
  if (!iso) return '?';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '?' : d.toLocaleString();
}

onMounted(() => {
  loadProjects();
  fleetStream.connect();
  safetyPoll = setInterval(() => loadProjects(true), 30000);
});
onBeforeUnmount(() => {
  if (refreshTimer) clearTimeout(refreshTimer);
  if (safetyPoll) clearInterval(safetyPoll);
  fleetStream.disconnect();
});
</script>

<style scoped>
.projects-list-page { padding: 24px; color: #e6e6e6; }
.page-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 24px; }
.page-title { margin: 0; font-size: 28px; }
.page-subtitle { margin: 4px 0 0; color: #888; font-size: 14px; }
.header-actions { display: flex; gap: 8px; align-items: center; }
.primary-btn { background: #4d9e39; color: #fff; border: none; padding: 10px 18px; border-radius: 6px; cursor: pointer; font-weight: 600; text-decoration: none; display: inline-block; }
.primary-btn:hover { background: #5cb947; }
.ghost-btn { background: #26262b; color: #ccc; border: none; padding: 10px 16px; border-radius: 6px; cursor: pointer; }
.ghost-btn:hover, .ghost-btn.active { background: #333; color: #fff; }
.ghost-btn:disabled { opacity: 0.5; cursor: default; }
.ghost-btn.danger { color: #e0a060; }
.ghost-btn.danger:hover:not(:disabled) { background: #3a2a18; color: #f2b878; }
.fleet-msg { color: #9ecb8e; background: #1c261a; border: 1px solid #2f3f28; }
.broadcast-card { background: #161519; border: 1px solid #2a2a2e; border-radius: 10px; padding: 18px; margin-bottom: 20px; }
.broadcast-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.broadcast-head h2 { margin: 0; font-size: 16px; color: #eee; }
.broadcast-hint { margin: 0 0 12px; color: #888; font-size: 12px; }
.broadcast-input { width: 100%; box-sizing: border-box; background: #0f0f12; color: #e6e6e6; border: 1px solid #2a2a2e; border-radius: 6px; padding: 10px; font-size: 14px; resize: vertical; font-family: inherit; }
.broadcast-input:focus { outline: none; border-color: #4d9e39; }
.broadcast-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
.card-pills { display: flex; align-items: center; gap: 6px; }
.halt-chip { font-size: 11px; padding: 2px 8px; border-radius: 10px; background: #3a2a18; color: #e0a060; white-space: nowrap; }
.defaults-card { background: #161519; border: 1px solid #2a2a2e; border-radius: 10px; padding: 18px; margin-bottom: 20px; }
.defaults-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.defaults-head h2 { margin: 0; font-size: 16px; color: #eee; }
.defaults-close { background: none; border: none; color: #888; font-size: 16px; cursor: pointer; }
.defaults-close:hover { color: #fff; }
.info-banner, .error-banner, .empty-banner { padding: 16px; border-radius: 6px; background: #1f1f23; margin-bottom: 12px; }
.error-banner { color: #ff8484; background: #2a1818; }
.project-grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
.project-card { display: block; padding: 16px; background: #1f1f23; border-radius: 8px; text-decoration: none; color: inherit; border: 1px solid #2a2a2e; transition: transform 0.1s, border-color 0.1s; }
.project-card:hover { transform: translateY(-2px); border-color: #4d9e39; }
.card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.card-title { font-size: 18px; font-weight: 600; }
.card-goal { font-size: 13px; color: #aaa; margin-bottom: 12px; min-height: 34px; }
.card-spend { margin-bottom: 10px; }
.spend-row { display: flex; justify-content: space-between; font-size: 11px; color: #888; margin-bottom: 4px; }
.pending { color: #d9b872; font-weight: 600; }
.spend-bar { height: 6px; background: #26262b; border-radius: 3px; overflow: hidden; }
.spend-fill { height: 100%; background: #4d9e39; border-radius: 3px; transition: width 0.3s; }
.spend-fill.danger { background: #d98c2b; }
.card-meta { display: flex; gap: 12px; font-size: 12px; color: #888; margin-bottom: 6px; }
.card-time { font-size: 11px; color: #666; }
.status-pill { font-size: 11px; padding: 2px 8px; border-radius: 10px; text-transform: capitalize; display: inline-flex; align-items: center; gap: 5px; }
.live-dot { width: 6px; height: 6px; border-radius: 50%; background: #7fd97f; animation: blink 1.6s ease-in-out infinite; }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
.s-active { background: #1d3a1d; color: #7fd97f; }
.s-paused, .s-budgetpaused { background: #3a331d; color: #d9c47f; }
.s-completed { background: #1d2a3a; color: #7fb0d9; }
.s-archived { background: #2a2a2e; color: #999; }
.archived-section { margin-top: 28px; }
.archived-toggle { background: none; border: none; color: #888; cursor: pointer; font-size: 14px; padding: 6px 0; font-weight: 600; }
.archived-toggle:hover { color: #ccc; }
.archived-grid { margin-top: 12px; }
.archived-card { opacity: 0.7; border-style: dashed; }
.archived-card:hover { opacity: 1; transform: none; border-color: #3a3a40; }
.archived-link { color: inherit; text-decoration: none; }
.archived-link:hover { color: #7fb0d9; }
.unshelve-btn { margin-top: 10px; background: #2e5426; color: #fff; border: none; padding: 6px 12px; border-radius: 5px; cursor: pointer; font-size: 12px; }
.unshelve-btn:hover { background: #3a6b30; }
</style>
