<template>
  <div class="project-workspace">
    <div v-if="loadError" class="error-banner">{{ loadError }}</div>

    <template v-else-if="project">
      <div class="pw-header">
        <div class="pw-head-left">
          <NuxtLink to="/projects" class="back">← Projects</NuxtLink>
          <div class="pw-title-row">
            <template v-if="!renaming">
              <h1 class="pw-title">{{ project.name }}</h1>
              <button class="rename-btn" title="Rename project" @click="startRename">✎</button>
            </template>
            <template v-else>
              <input ref="renameInput" v-model="renameValue" class="rename-input" @keyup.enter="commitRename" @keyup.esc="cancelRename" />
              <button class="rename-save" :disabled="renameSaving" @click="commitRename">{{ renameSaving ? '…' : 'Save' }}</button>
              <button class="rename-cancel" @click="cancelRename">Cancel</button>
            </template>
          </div>
          <p class="pw-goal">{{ project.goal }}</p>
        </div>
        <div class="pw-controls">
          <span v-if="pendingGates" class="approval-badge" @click="tab = 'conversation'">{{ pendingGates }} approval{{ pendingGates === 1 ? '' : 's' }}</span>
          <span class="status-pill" :class="'s-' + (project.status || '').toLowerCase()">
            <span v-if="project.status === 'Active'" class="live-dot"></span>{{ project.status }}
          </span>
          <button v-if="project.status === 'Active'" class="ctrl" @click="pause" title="Halt the fleet — stops the in-flight wake too">Halt</button>
          <button v-else-if="project.status === 'Paused' || project.status === 'BudgetPaused'" class="ctrl ctrl-go" @click="resume">Resume</button>
          <button v-if="project.status === 'Archived'" class="ctrl ctrl-go" @click="unarchive">Unshelve</button>
          <button v-else class="ctrl" @click="archive" title="Shelve this project">Archive</button>
        </div>
      </div>

      <div class="pw-grid">
        <div class="pw-main">
          <div class="pw-tabs">
            <button v-for="t in tabs" :key="t.id" :class="{ active: tab === t.id }" @click="tab = t.id">
              {{ t.label }}<span v-if="t.id === 'conversation' && pendingGates" class="tab-dot"></span>
            </button>
          </div>

          <div class="pw-panel">
            <div v-show="tab === 'conversation'" class="panel-conversation">
              <ProjectsConversationPanel :project-id="projectId" @events="onEvents" @select="selectEvent" />
            </div>
            <ProjectsTimeline v-if="tab === 'timeline'" :events="events" :agent-labels="agentLabels" @select="selectEvent" />
            <ProjectsAgentsPanel v-if="tab === 'agents'" :project-id="projectId" @watch="watchDesktop" />
            <ProjectsHooksPanel v-if="tab === 'hooks'" :project-id="projectId" />
            <ProjectsSettingsPanel v-if="tab === 'settings'" :project-id="projectId" />
          </div>
        </div>

        <div class="pw-side">
          <div class="side-card">
            <h3>Budget</h3>
            <ProjectsSpendOverlay
              :token-spent="ledger.tokenSpendUsd || 0"
              :token-budget="project.tokenBudgetUsd"
              :money-spent="ledger.moneySpendUsd || 0"
              :money-budget="project.moneyBudgetUsd"
            />
          </div>
          <div class="side-card">
            <h3>Plan</h3>
            <p class="digest-text">{{ digest.currentPlan || '(no plan yet)' }}</p>
            <h3>Org chart</h3>
            <p class="digest-text">{{ digest.orgChart || '(commander only)' }}</p>
            <h3>Open threads</h3>
            <p class="digest-text">{{ digest.openThreads || '(none)' }}</p>
          </div>
          <div class="side-card">
            <h3>Live desktop</h3>
            <ProjectsLiveDesktop :container-id="watchContainerId" />
            <p v-if="!watchContainerId" class="side-hint">No desktop selected. Open the Agents tab and click a desktop-capable agent.</p>
          </div>
        </div>
      </div>

      <ProjectsEventDetail :project-id="projectId" :event="selectedEvent" @close="selectedEvent = null" />
    </template>

    <div v-else class="info-banner">Loading project…</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import ProjectsTimeline from '~/components/Projects/Timeline.vue';
import ProjectsConversationPanel from '~/components/Projects/ConversationPanel.vue';
import ProjectsSpendOverlay from '~/components/Projects/SpendOverlay.vue';
import ProjectsLiveDesktop from '~/components/Projects/LiveDesktop.vue';
import ProjectsAgentsPanel from '~/components/Projects/AgentsPanel.vue';
import ProjectsHooksPanel from '~/components/Projects/HooksPanel.vue';
import ProjectsSettingsPanel from '~/components/Projects/SettingsPanel.vue';
import ProjectsEventDetail from '~/components/Projects/EventDetail.vue';

definePageMeta({ layout: 'navbar' });

const route = useRoute();
const projectId = String(route.params.projectId);

const tabs = [
  { id: 'conversation', label: 'Conversation' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'agents', label: 'Agents' },
  { id: 'hooks', label: 'Hooks' },
  { id: 'settings', label: 'Settings' },
];
const tab = ref('conversation');

const project = ref<any>(null);
const digest = ref<any>({});
const ledger = ref<any>({ tokenSpendUsd: 0, moneySpendUsd: 0 });
const events = ref<any[]>([]);
const agents = ref<any[]>([]);
const loadError = ref('');
const watchContainerId = ref('');
const selectedEvent = ref<any>(null);
let poll: ReturnType<typeof setInterval> | null = null;

const pendingGates = computed(() =>
  events.value.filter(e => e.type === 'approval-requested').length -
  events.value.filter(e => e.type === 'approval-resolved').length);

const agentLabels = computed(() => {
  const m: Record<string, string> = {};
  for (const a of agents.value) m[a.agentID] = a.role;
  return m;
});

function onEvents(all: any[]) { events.value = all; }
function selectEvent(ev: any) { selectedEvent.value = ev; }
function watchDesktop(containerId: string) { watchContainerId.value = containerId; }

async function loadProject() {
  try {
    const res = await RequestGETFromKliveAPI(`/projects/get?projectID=${projectId}`, false, false);
    if (!res.ok) { loadError.value = `Failed to load project (HTTP ${res.status}).`; return; }
    project.value = await res.json();
  } catch (err: any) { loadError.value = err?.message ?? String(err); }
}
async function loadDigest() {
  try { const r = await RequestGETFromKliveAPI(`/projects/digest?projectID=${projectId}`, false, false); if (r.ok) digest.value = await r.json(); } catch { /* transient */ }
}
async function loadLedger() {
  try { const r = await RequestGETFromKliveAPI(`/projects/ledger?projectID=${projectId}`, false, false); if (r.ok) ledger.value = await r.json(); } catch { /* transient */ }
}
async function loadAgents() {
  try { const r = await RequestGETFromKliveAPI(`/projects/agents?projectID=${projectId}`, false, false); if (r.ok) agents.value = await r.json(); } catch { /* transient */ }
}

async function pause() {
  await RequestPOSTFromKliveAPI('/projects/pause', JSON.stringify({ projectID: projectId }), false, true);
  await loadProject();
}
async function resume() {
  await RequestPOSTFromKliveAPI('/projects/resume', JSON.stringify({ projectID: projectId }), false, true);
  await loadProject();
}
async function archive() {
  await RequestPOSTFromKliveAPI('/projects/archive', JSON.stringify({ projectID: projectId }), false, true);
  await loadProject();
}
async function unarchive() {
  await RequestPOSTFromKliveAPI('/projects/unarchive', JSON.stringify({ projectID: projectId }), false, true);
  await loadProject();
}

// ── rename ──
const renaming = ref(false);
const renameValue = ref('');
const renameSaving = ref(false);
const renameInput = ref<HTMLInputElement | null>(null);
function startRename() {
  renameValue.value = project.value?.name ?? '';
  renaming.value = true;
  nextTick(() => renameInput.value?.focus());
}
function cancelRename() { renaming.value = false; }
async function commitRename() {
  const name = renameValue.value.trim();
  if (!name || name === project.value?.name) { renaming.value = false; return; }
  renameSaving.value = true;
  try {
    const res = await RequestPOSTFromKliveAPI('/projects/rename', JSON.stringify({ projectID: projectId, name }), false, true);
    if (res.ok) { project.value = await res.json(); renaming.value = false; }
  } finally { renameSaving.value = false; }
}

function refresh() { loadProject(); loadDigest(); loadLedger(); loadAgents(); }
onMounted(() => { refresh(); poll = setInterval(refresh, 5000); });
onBeforeUnmount(() => { if (poll) clearInterval(poll); });
</script>

<style scoped>
.project-workspace { padding: 24px; color: #e6e6e6; }
.pw-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; gap: 16px; }
.back { color: #7fb0d9; text-decoration: none; font-size: 13px; }
.pw-title-row { display: flex; align-items: center; gap: 8px; margin: 6px 0 2px; }
.pw-title { margin: 0; font-size: 26px; }
.rename-btn { background: none; border: none; color: #666; cursor: pointer; font-size: 15px; padding: 2px 6px; border-radius: 4px; }
.rename-btn:hover { color: #ccc; background: #26262b; }
.rename-input { background: #14141a; color: #fff; border: 1px solid #4d9e39; border-radius: 6px; padding: 6px 10px; font-size: 22px; min-width: 320px; }
.rename-save { background: #4d9e39; color: #fff; border: none; padding: 7px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; }
.rename-save:disabled { opacity: 0.5; }
.rename-cancel { background: #26262b; color: #ccc; border: none; padding: 7px 12px; border-radius: 6px; cursor: pointer; }
.pw-goal { margin: 0; color: #999; font-size: 14px; max-width: 720px; }
.pw-controls { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
.ctrl { background: #26262b; color: #ccc; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; }
.ctrl-go { background: #2e5426; color: #fff; }
.approval-badge { background: #3a2f17; color: #d9b872; font-size: 12px; padding: 4px 10px; border-radius: 10px; cursor: pointer; font-weight: 600; }
.pw-grid { display: grid; grid-template-columns: 1fr 340px; gap: 18px; align-items: start; }
.pw-main { min-width: 0; }
.pw-tabs { display: flex; gap: 4px; margin-bottom: 12px; border-bottom: 1px solid #2a2a2e; }
.pw-tabs button { position: relative; background: none; border: none; color: #999; padding: 10px 14px; cursor: pointer; font-size: 14px; border-bottom: 2px solid transparent; margin-bottom: -1px; }
.pw-tabs button.active { color: #fff; border-bottom-color: #4d9e39; }
.tab-dot { position: absolute; top: 6px; right: 4px; width: 6px; height: 6px; border-radius: 50%; background: #d9b872; }
.panel-conversation { height: 560px; background: #161519; border-radius: 8px; overflow: hidden; }
.pw-side { display: flex; flex-direction: column; gap: 16px; position: sticky; top: 16px; }
.side-card { background: #161519; border-radius: 8px; padding: 14px; }
.side-card h3 { margin: 0 0 8px; font-size: 13px; color: #bbb; }
.side-card h3:not(:first-child) { margin-top: 14px; }
.digest-text { font-size: 12px; color: #aaa; white-space: pre-wrap; margin: 0; line-height: 1.5; }
.side-hint { font-size: 11px; color: #666; margin: 8px 0 0; }
.info-banner, .error-banner { padding: 16px; border-radius: 6px; background: #1f1f23; }
.error-banner { color: #ff8484; background: #2a1818; }
.status-pill { font-size: 11px; padding: 3px 10px; border-radius: 10px; display: inline-flex; align-items: center; gap: 5px; }
.live-dot { width: 6px; height: 6px; border-radius: 50%; background: #7fd97f; animation: blink 1.6s ease-in-out infinite; }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
.s-active { background: #1d3a1d; color: #7fd97f; }
.s-paused, .s-budgetpaused { background: #3a331d; color: #d9c47f; }
.s-completed { background: #1d2a3a; color: #7fb0d9; }
.s-archived { background: #2a2a2e; color: #999; }
@media (max-width: 900px) { .pw-grid { grid-template-columns: 1fr; } .pw-side { position: static; } }
</style>
