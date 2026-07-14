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
          <ProjectsHistoryExport :project-id="projectId" />
          <ProjectsStatusPill :status="project.status" />
          <button v-if="project.status === 'Active'" class="ctrl" :disabled="actionBusy" @click="pause" title="Halt the fleet — stops the in-flight wake too">Halt</button>
          <button v-else-if="project.status === 'Paused' || project.status === 'BudgetPaused'" class="ctrl ctrl-go" :disabled="actionBusy" @click="resume">Resume</button>
          <button v-else-if="project.status === 'Blocked'" class="ctrl ctrl-go" :disabled="actionBusy" @click="unblock" title="Clear the block and resume — do this once you've remediated the cause">Unblock</button>
          <button v-if="project.status === 'Archived'" class="ctrl ctrl-go" :disabled="actionBusy" @click="unarchive">Unshelve</button>
          <button v-else class="ctrl" :disabled="actionBusy" @click="archive" title="Shelve this project">Archive</button>
        </div>
      </div>
      <div v-if="actionError" class="action-error">{{ actionError }} <button class="ae-dismiss" @click="actionError = ''">✕</button></div>

      <div v-if="project.status === 'Blocked'" class="blocked-banner">
        <span class="bb-icon">⛔</span>
        <div class="bb-body">
          <div class="bb-title">Blocked — action required</div>
          <div v-if="project.blockedReason" class="bb-reason">{{ project.blockedReason }}</div>
          <div class="bb-hint">Remediate the cause, then Unblock to clear it and set the fleet back to work.</div>
        </div>
        <button class="ctrl ctrl-go bb-btn" :disabled="actionBusy" @click="unblock">Unblock</button>
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
            <ProjectsTimeline v-show="tab === 'timeline'" :events="events" :agent-labels="agentLabels" @select="selectEvent" />
            <ProjectsFilesPanel v-if="tab === 'files'" :project-id="projectId" :status="project.status" />
            <ProjectsGrandPlanPanel v-if="tab === 'plan'" :project-id="projectId" :grand-plan="grandPlan" />
            <ProjectsCouncilsPanel v-if="tab === 'councils'" :project-id="projectId" :councils="councils" />
            <ProjectsLiveDesktopWall v-if="tab === 'desktops'" :project-id="projectId" />
            <ProjectsAgentsPanel v-if="tab === 'agents'" :project-id="projectId" @watch="watchDesktop" />
            <ProjectsObservablesPanel v-if="tab === 'observables'" :project-id="projectId" :observables="observables" @changed="loadObservables" />
            <ProjectsHooksPanel v-if="tab === 'hooks'" :project-id="projectId" />
            <ProjectsSettingsPanel v-if="tab === 'settings'" :project-id="projectId" />
          </div>
        </div>

        <div class="pw-side">
          <div class="side-card">
            <div class="side-card-head">
              <h3>Budget</h3>
              <button class="budget-edit-btn" :title="editingBudget ? 'Cancel' : 'Edit budgets'" @click="toggleBudgetEdit">{{ editingBudget ? '✕' : '✎' }}</button>
            </div>
            <ProjectsSpendOverlay
              :token-spent="ledger.tokenSpendUsd || 0"
              :token-budget="project.tokenBudgetUsd"
              :money-spent="ledger.moneySpendUsd || 0"
              :money-budget="project.moneyBudgetUsd"
            />
            <div v-if="editingBudget" class="budget-form">
              <label class="bf-field">
                <span>Token budget ($)</span>
                <input v-model.number="budgetDraft.tokenBudgetUsd" type="number" min="0.01" step="1" class="bf-input" />
              </label>
              <label class="bf-field">
                <span>Money budget ($)</span>
                <input v-model.number="budgetDraft.moneyBudgetUsd" type="number" min="0" step="1" class="bf-input" />
              </label>
              <label class="bf-field">
                <span>Autonomous spend ≤ ($)</span>
                <input v-model.number="budgetDraft.moneyAutonomousThresholdUsd" type="number" min="0" step="0.5" class="bf-input" />
              </label>
              <label class="bf-field">
                <span>Agent cap</span>
                <input v-model.number="budgetDraft.subAgentCap" type="number" min="1" step="1" class="bf-input" />
              </label>
              <div v-if="budgetError" class="bf-error">{{ budgetError }}</div>
              <div class="bf-actions">
                <button class="bf-save" :disabled="budgetSaving" @click="saveBudgets">{{ budgetSaving ? 'Saving…' : 'Save budgets' }}</button>
              </div>
              <p v-if="project.status === 'BudgetPaused'" class="bf-hint">Raising the token budget above current spend resumes the project.</p>
            </div>
          </div>
          <div v-if="grandPlan.current" class="side-card">
            <div class="side-card-head">
              <h3>Grand Plan v{{ grandPlan.current.version }}</h3>
              <button class="obs-all-btn" @click="tab = 'plan'">view →</button>
            </div>
            <p class="digest-text">{{ grandPlan.current.summary }}</p>
          </div>
          <div v-else-if="project.status === 'Planning'" class="side-card">
            <div class="side-card-head">
              <h3>Grand Plan</h3>
              <button class="obs-all-btn" @click="tab = 'plan'">view →</button>
            </div>
            <p class="digest-text">Drafting — awaiting your approval before work begins.</p>
          </div>
          <div v-if="observables.length" class="side-card">
            <div class="side-card-head">
              <h3>Observables</h3>
              <button class="obs-all-btn" @click="tab = 'observables'">all →</button>
            </div>
            <ul class="obs-mini-list">
              <li v-for="o in topObservables" :key="o.observableID" class="obs-mini-row">
                <span class="obs-mini-name" :title="o.name">{{ o.name }}</span>
                <ProjectsObservableSparkline
                  v-if="o.type === 'Numeric' && o.history && o.history.length > 1"
                  :samples="o.history" :width="52" :height="16" />
                <span class="obs-mini-value">{{ o.displayValue }}</span>
              </li>
            </ul>
          </div>
          <div class="side-card">
            <h3>Plan</h3>
            <template v-if="digest.currentFocus || (digest.nextSteps && digest.nextSteps.length)">
              <p v-if="digest.currentFocus" class="digest-focus"><span class="df-label">Focus</span>{{ digest.currentFocus }}</p>
              <ol v-if="digest.nextSteps && digest.nextSteps.length" class="digest-steps">
                <li v-for="(s, i) in digest.nextSteps" :key="i">{{ s }}</li>
              </ol>
            </template>
            <p v-else class="digest-text">{{ digest.currentPlan || '(no plan yet)' }}</p>
            <h3>Org chart</h3>
            <p class="digest-text">{{ digest.orgChart || '(commander only)' }}</p>
            <h3>Open threads</h3>
            <p class="digest-text">{{ digest.openThreads || '(none)' }}</p>
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
import { useEventStream } from '~/composables/useEventStream';
import ProjectsTimeline from '~/components/Projects/Timeline.vue';
import ProjectsConversationPanel from '~/components/Projects/ConversationPanel.vue';
import ProjectsSpendOverlay from '~/components/Projects/SpendOverlay.vue';
import ProjectsLiveDesktopWall from '~/components/Projects/LiveDesktopWall.vue';
import ProjectsAgentsPanel from '~/components/Projects/AgentsPanel.vue';
import ProjectsObservablesPanel from '~/components/Projects/ObservablesPanel.vue';
import ProjectsObservableSparkline from '~/components/Projects/ObservableSparkline.vue';
import ProjectsCouncilsPanel from '~/components/Projects/CouncilsPanel.vue';
import ProjectsGrandPlanPanel from '~/components/Projects/GrandPlanPanel.vue';
import ProjectsHooksPanel from '~/components/Projects/HooksPanel.vue';
import ProjectsSettingsPanel from '~/components/Projects/SettingsPanel.vue';
import ProjectsStatusPill from '~/components/Projects/StatusPill.vue';
import ProjectsEventDetail from '~/components/Projects/EventDetail.vue';
import ProjectsFilesPanel from '~/components/Projects/FilesPanel.vue';
import ProjectsHistoryExport from '~/components/Projects/HistoryExport.vue';

definePageMeta({ layout: 'navbar' });

const route = useRoute();
const projectId = String(route.params.projectId);

const tabs = [
  { id: 'conversation', label: 'Conversation' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'files', label: 'Files' },
  { id: 'plan', label: 'Grand Plan' },
  { id: 'councils', label: 'Councils' },
  { id: 'desktops', label: 'Desktops' },
  { id: 'agents', label: 'Agents' },
  { id: 'observables', label: 'Observables' },
  { id: 'hooks', label: 'Hooks' },
  { id: 'settings', label: 'Settings' },
];
const tab = ref('conversation');

const project = ref<any>(null);
const digest = ref<any>({});
const ledger = ref<any>({ tokenSpendUsd: 0, moneySpendUsd: 0 });
const events = ref<any[]>([]);
const agents = ref<any[]>([]);
const observables = ref<any[]>([]);
const councils = ref<any[]>([]);
const grandPlan = ref<any>({ current: null, versions: [] });
const loadError = ref('');
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
// Clicking an agent in the Agents tab jumps to the Desktops CCTV wall (which shows every screen).
function watchDesktop(_containerId: string) { tab.value = 'desktops'; }

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
async function loadObservables() {
  try { const r = await RequestGETFromKliveAPI(`/projects/observables?projectID=${projectId}&history=120`, false, false); if (r.ok) observables.value = await r.json(); } catch { /* transient */ }
}
async function loadCouncils() {
  try { const r = await RequestGETFromKliveAPI(`/projects/councils?projectID=${projectId}`, false, false); if (r.ok) councils.value = await r.json(); } catch { /* transient */ }
}
async function loadGrandPlan() {
  try { const r = await RequestGETFromKliveAPI(`/projects/grandplan?projectID=${projectId}`, false, false); if (r.ok) grandPlan.value = await r.json(); } catch { /* transient */ }
}

// Top observables for the always-visible side card: most-recently-updated first (agents signal
// relevance by touching a value), capped so the rail stays compact.
const topObservables = computed(() =>
  [...observables.value]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 6));

// Control actions used to fire-and-forget with no error handling and no button disabling — a failed
// POST left the user with no feedback and double-clicks were possible. Route them through a guarded
// helper that disables the buttons and surfaces failures.
const actionBusy = ref(false);
const actionError = ref('');
async function runAction(url: string) {
  if (actionBusy.value) return;
  actionBusy.value = true;
  actionError.value = '';
  try {
    const res = await RequestPOSTFromKliveAPI(url, JSON.stringify({ projectID: projectId }), false, true);
    if (!res.ok) { actionError.value = `That didn't work (HTTP ${res.status}). Try again.`; return; }
    await loadProject();
  } catch (e: any) {
    actionError.value = e?.message ? `That didn't work: ${e.message}` : "That didn't work. Try again.";
  } finally {
    actionBusy.value = false;
  }
}
async function pause() { await runAction('/projects/pause'); }
async function resume() { await runAction('/projects/resume'); }
// Unblock is the resume path: /projects/resume clears BlockedAt/BlockedReason, logs a
// ProjectUnblocked event, and re-wakes the Commander to continue after remediation.
async function unblock() { await runAction('/projects/resume'); }
async function archive() { await runAction('/projects/archive'); }
async function unarchive() { await runAction('/projects/unarchive'); }

// ── budget editing ──
const editingBudget = ref(false);
const budgetSaving = ref(false);
const budgetError = ref('');
const budgetDraft = ref({ tokenBudgetUsd: 0, moneyBudgetUsd: 0, moneyAutonomousThresholdUsd: 0, subAgentCap: 1 });

function toggleBudgetEdit() {
  budgetError.value = '';
  if (!editingBudget.value && project.value) {
    budgetDraft.value = {
      tokenBudgetUsd: Number(project.value.tokenBudgetUsd) || 0,
      moneyBudgetUsd: Number(project.value.moneyBudgetUsd) || 0,
      moneyAutonomousThresholdUsd: Number(project.value.moneyAutonomousThresholdUsd) || 0,
      subAgentCap: Number(project.value.subAgentCap) || 1,
    };
  }
  editingBudget.value = !editingBudget.value;
}

async function saveBudgets() {
  const d = budgetDraft.value;
  if (!(d.tokenBudgetUsd > 0)) { budgetError.value = 'Token budget must be greater than 0.'; return; }
  if (d.moneyBudgetUsd < 0 || d.moneyAutonomousThresholdUsd < 0) { budgetError.value = 'Money values cannot be negative.'; return; }
  if (!(d.subAgentCap >= 1)) { budgetError.value = 'Agent cap must be at least 1.'; return; }
  budgetSaving.value = true;
  budgetError.value = '';
  try {
    const res = await RequestPOSTFromKliveAPI('/projects/budget/update',
      JSON.stringify({ projectID: projectId, ...d }), false, true);
    if (!res.ok) { budgetError.value = `Save failed (HTTP ${res.status}).`; return; }
    project.value = await res.json();
    editingBudget.value = false;
  } catch (e: any) {
    budgetError.value = e?.message ? `Save failed: ${e.message}` : 'Save failed.';
  } finally {
    budgetSaving.value = false;
  }
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
    else actionError.value = `Rename failed (HTTP ${res.status}).`;
  } catch (e: any) {
    actionError.value = e?.message ? `Rename failed: ${e.message}` : 'Rename failed.';
  } finally { renameSaving.value = false; }
}

function refresh() { loadProject(); loadDigest(); loadLedger(); loadAgents(); loadObservables(); loadCouncils(); loadGrandPlan(); }

// Live push (Phase 3): refresh the side-rail data on any project event (debounced) instead of a
// tight 5s poll. ConversationPanel streams its own events; this keeps status/budget/agents fresh.
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRefresh() { if (refreshTimer) return; refreshTimer = setTimeout(() => { refreshTimer = null; refresh(); }, 1000); }
const wsStream = useEventStream({ projectId, onEvent: () => scheduleRefresh() });

onMounted(() => {
  refresh();
  wsStream.connect();
  poll = setInterval(refresh, 30000); // safety net only
});
onBeforeUnmount(() => {
  if (poll) clearInterval(poll);
  if (refreshTimer) clearTimeout(refreshTimer);
  wsStream.disconnect();
});
</script>

<style scoped>
.project-workspace { padding: 24px; color: #e6e6e6; }
.action-error { background: #3a1717; border: 1px solid #5a2424; color: #e08a8a; padding: 8px 12px; border-radius: 8px; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; font-size: 13px; }
.ae-dismiss { background: none; border: none; color: #e08a8a; cursor: pointer; }
.blocked-banner { display: flex; align-items: center; gap: 12px; background: #3a1f17; border: 1px solid #6a3a22; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; }
.bb-icon { font-size: 18px; flex-shrink: 0; }
.bb-body { flex: 1; min-width: 0; }
.bb-title { font-weight: 600; color: #e8a877; font-size: 14px; }
.bb-reason { color: #e6c6b4; font-size: 13px; margin-top: 3px; overflow-wrap: anywhere; }
.bb-hint { color: #b08870; font-size: 12px; margin-top: 4px; }
.bb-btn { flex-shrink: 0; }
.ctrl:disabled { opacity: 0.5; cursor: default; }
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
.pw-tabs { display: flex; gap: 4px; margin-bottom: 12px; border-bottom: 1px solid #2a2a2e; overflow-x: auto; }
.pw-tabs button { position: relative; background: none; border: none; color: #999; padding: 10px 14px; cursor: pointer; font-size: 14px; border-bottom: 2px solid transparent; margin-bottom: -1px; }
.pw-tabs button.active { color: #fff; border-bottom-color: #4d9e39; }
.tab-dot { position: absolute; top: 6px; right: 4px; width: 6px; height: 6px; border-radius: 50%; background: #d9b872; }
.panel-conversation { height: clamp(420px, calc(100vh - 250px), 760px); background: #161519; border-radius: 8px; overflow: hidden; }
.pw-side { display: flex; flex-direction: column; gap: 16px; position: sticky; top: 16px; }
.side-card { background: #161519; border-radius: 8px; padding: 14px; }
.side-card-head { display: flex; justify-content: space-between; align-items: center; }
.budget-edit-btn { background: none; border: none; color: #666; cursor: pointer; font-size: 13px; padding: 2px 6px; border-radius: 4px; }
.budget-edit-btn:hover { color: #ccc; background: #26262b; }
.budget-form { margin-top: 12px; border-top: 1px solid #2a2a2e; padding-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.bf-field { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12px; color: #aaa; }
.bf-input { width: 110px; background: #1a1a1e; color: #eee; border: 1px solid #333; border-radius: 6px; padding: 5px 8px; font-size: 13px; text-align: right; }
.bf-error { font-size: 12px; color: #e08a8a; }
.bf-actions { display: flex; justify-content: flex-end; }
.bf-save { background: #4d9e39; color: #fff; border: none; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 13px; }
.bf-save:disabled { opacity: 0.5; }
.bf-hint { font-size: 11px; color: #d9c47f; margin: 4px 0 0; }
.side-card h3 { margin: 0 0 8px; font-size: 13px; color: #bbb; }
.side-card h3:not(:first-child) { margin-top: 14px; }
.obs-all-btn { background: none; border: none; color: #7fb0d9; cursor: pointer; font-size: 12px; padding: 2px 4px; }
.obs-all-btn:hover { color: #a8ccec; }
.obs-mini-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.obs-mini-row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.obs-mini-name { color: #999; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.obs-mini-value { color: #e6e6e6; font-weight: 600; font-variant-numeric: tabular-nums; flex-shrink: 0; }
.digest-text { font-size: 12px; color: #aaa; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; margin: 0; line-height: 1.5; }
.digest-focus { font-size: 12px; color: #cfcfd6; margin: 0 0 6px; line-height: 1.45; overflow-wrap: anywhere; }
.df-label { font-size: 9px; letter-spacing: 0.05em; text-transform: uppercase; color: #7fd97f; background: #1d3a1d; padding: 1px 6px; border-radius: 6px; margin-right: 6px; }
.digest-steps { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 3px; }
.digest-steps li { font-size: 12px; color: #aaa; line-height: 1.45; overflow-wrap: anywhere; }
.side-card { min-width: 0; overflow: hidden; }
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
