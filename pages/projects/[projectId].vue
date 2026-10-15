<template>
  <ProjectsShell :status="shellStatus" :status-tone="shellTone" :working="liveCount > 0" :crumb="project?.name">
    <div v-if="loadError" class="ot-banner" role="alert">
      <span class="glyph" aria-hidden="true">⚠</span>
      <div><strong>This project could not be loaded</strong>{{ loadError }}</div>
      <div class="actions"><button class="ot-btn sm" @click="refresh">Retry</button></div>
    </div>

    <template v-else-if="project">
      <header class="pw-head">
        <div class="pw-titles">
          <div class="pw-title-row">
            <template v-if="!renaming">
              <h1 class="pw-title">{{ project.name }}</h1>
              <button class="ot-btn ghost sm pw-rename" title="Rename project" aria-label="Rename project" @click="startRename">✎</button>
            </template>
            <template v-else>
              <input ref="renameInput" v-model="renameValue" class="ot-input pw-rename-input" aria-label="Project name"
                @keyup.enter="commitRename" @keyup.esc="cancelRename" />
              <button class="ot-btn primary sm" :disabled="renameSaving" @click="commitRename">{{ renameSaving ? '…' : 'Save' }}</button>
              <button class="ot-btn ghost sm" @click="cancelRename">Cancel</button>
            </template>
            <span class="ot-chip" :class="pjStatusTone(project.status)" data-testid="project-status">{{ pjStatusLabel(project.status) }}</span>
            <span v-if="liveCount" class="ot-chip ok">● {{ liveCount }} working</span>
            <button v-if="pendingGates > 0" class="ot-chip warn pw-approvals" @click="setTab('overview')">
              {{ pendingGates }} approval{{ pendingGates === 1 ? '' : 's' }} waiting
            </button>
          </div>
          <p class="pw-goal" :class="{ open: goalOpen }" :title="goalOpen ? '' : 'Show the full goal'" @click="goalOpen = !goalOpen">{{ project.goal }}</p>
        </div>
        <div class="ot-actions">
          <ProjectsHistoryExport :project-id="projectId" />
          <button v-if="project.status === 'Active' || project.status === 'Planning'" class="ot-btn warn" :disabled="actionBusy"
            title="Halt the fleet — stops the in-flight wake too" @click="pause">Halt</button>
          <button v-else-if="project.status === 'Paused' || project.status === 'BudgetPaused'" class="ot-btn primary" :disabled="actionBusy" @click="resume">Resume</button>
          <button v-else-if="project.status === 'Blocked'" class="ot-btn primary" :disabled="actionBusy"
            title="Clear the block and resume — do this once you've remediated the cause" @click="unblock">Unblock</button>
          <button v-if="project.status === 'Archived'" class="ot-btn" :disabled="actionBusy" @click="unarchive">Unshelve</button>
          <button v-else class="ot-btn ghost" :disabled="actionBusy" title="Shelve this project" @click="archive">Archive</button>
        </div>
      </header>

      <div v-if="actionError" class="ot-banner" role="alert">
        <span class="glyph" aria-hidden="true">⚠</span><div>{{ actionError }}</div>
        <div class="actions"><button class="ot-btn ghost sm" @click="actionError = ''">Dismiss</button></div>
      </div>
      <div v-if="project.status === 'Blocked'" class="ot-banner warn blocked-banner" role="alert">
        <span class="glyph" aria-hidden="true">⛔</span>
        <div>
          <strong>Blocked — action required</strong>
          <span v-if="project.blockedReason">{{ project.blockedReason }}</span>
          <span class="pj-muted"> Remediate the cause, then Unblock to set the fleet back to work.</span>
        </div>
        <div class="actions"><button class="ot-btn primary sm" :disabled="actionBusy" @click="unblock">Unblock</button></div>
      </div>
      <div v-if="detailsLoading" class="ot-banner info" role="status">
        <span class="glyph" aria-hidden="true">↻</span><div>{{ detailsLoading }}</div>
      </div>

      <nav class="pw-tabs" role="tablist" aria-label="Project sections">
        <button v-for="t in tabs" :key="t.id" type="button" role="tab" :aria-selected="tab === t.id" :class="{ active: tab === t.id }" @click="setTab(t.id)">
          {{ t.label }}
          <span v-if="t.id === 'overview' && pendingGates > 0" class="ot-badge warn">{{ pendingGates }}</span>
          <span v-if="t.id === 'agents' && agents.length" class="pw-tab-count">{{ agents.length }}</span>
        </button>
      </nav>

      <div class="pw-body" :class="{ 'with-rail': showRail }">
        <section class="pw-main" :aria-label="currentTabLabel">
          <ProjectsOverviewTab v-if="tab === 'overview'" :project-id="projectId" :project="project" :digest="digest" :ledger="ledger"
            :agents="agents" :observables="observables" :grand-plan="grandPlan" :events="events"
            @navigate="setTab" @changed="refresh" />
          <div v-show="tab === 'conversation'" class="ot-card pw-chat">
            <ProjectsConversationPanel :project-id="projectId" @events="onEvents" @select="selectEvent" />
          </div>
          <OmniTraderCard v-if="tab === 'timeline'" title="Timeline" subtitle="Every event, by agent lane. Click a marker for its details." flush>
            <ProjectsTimeline :events="events" :agent-labels="agentLabels" @select="selectEvent" />
          </OmniTraderCard>
          <div v-if="tab === 'plan'" class="ot-stack">
            <OmniTraderCard title="Step ledger" subtitle="The linear path the Commander is walking right now"><ProjectsStepsPanel :project-id="projectId" /></OmniTraderCard>
            <OmniTraderCard title="Grand Plan" subtitle="The approved north star — mission, milestones, risks and success criteria">
              <ProjectsGrandPlanPanel :project-id="projectId" :grand-plan="grandPlan" />
            </OmniTraderCard>
            <OmniTraderCard title="Councils" subtitle="Adversarial reviews the Commander convened before big decisions" :empty="!councils.length"
              empty-title="No councils yet" empty-text="The Commander convenes one before a plan, a pivot or an irreversible spend.">
              <ProjectsCouncilsPanel :project-id="projectId" :councils="councils" />
            </OmniTraderCard>
          </div>
          <OmniTraderCard v-if="tab === 'agents'" title="Agents" :subtitle="`The task force · cap ${project.subAgentCap}`">
            <ProjectsAgentsPanel :project-id="projectId" :cap="project.subAgentCap" @watch="() => setTab('computers')" @roster-changed="loadAgents" />
          </OmniTraderCard>
          <ProjectsComputersPanel v-if="tab === 'computers'" :project-id="projectId" />
          <OmniTraderCard v-if="tab === 'files'" title="Files" subtitle="/project — shared by you and every agent"><ProjectsFilesPanel :project-id="projectId" :status="project.status" /></OmniTraderCard>
          <OmniTraderCard v-if="tab === 'observables'" title="Observables" subtitle="Live values the agents maintain for you">
            <ProjectsObservablesPanel :project-id="projectId" :observables="observables" @changed="loadObservables" />
          </OmniTraderCard>
          <ProjectsAnalyticsDashboard v-if="tab === 'analytics'" :project-id="projectId" />
          <div v-if="tab === 'settings'" class="ot-stack">
            <OmniTraderCard title="Settings" subtitle="This project's own configuration — independent of every other project">
              <ProjectsSettingsPanel :project-id="projectId" />
            </OmniTraderCard>
            <OmniTraderCard title="Wake triggers" subtitle="Timers, webhooks, email and screen watches that wake the agents">
              <ProjectsHooksPanel :project-id="projectId" />
            </OmniTraderCard>
          </div>
        </section>

        <aside v-if="showRail" class="pw-rail ot-stack" aria-label="Project at a glance">
          <OmniTraderCard title="Budget">
            <template #controls>
              <button class="ot-btn ghost sm budget-edit-btn" :title="editingBudget ? 'Cancel' : 'Edit budgets'" @click="toggleBudgetEdit">{{ editingBudget ? 'Cancel' : 'Edit' }}</button>
            </template>
            <div class="pw-budget">
              <div class="ot-meter" :class="{ warn: tokenPct >= 80 && tokenPct < 100, bad: tokenPct >= 100 }">
                <div class="row"><span class="lbl">Model</span><span class="val">{{ pjMoney(ledger.tokenSpendUsd) }} / {{ pjMoney(project.tokenBudgetUsd) }}</span></div>
                <div class="track"><div class="fill" :style="{ width: Math.min(100, tokenPct) + '%' }"></div></div>
              </div>
              <div class="ot-meter">
                <div class="row"><span class="lbl">External</span><span class="val">{{ pjMoney(ledger.moneySpendUsd) }} / {{ pjMoney(project.moneyBudgetUsd) }}</span></div>
                <div class="track"><div class="fill" :style="{ width: Math.min(100, moneyPct) + '%' }"></div></div>
                <div class="foot"><span>Autonomous ≤ {{ pjMoney(project.moneyAutonomousThresholdUsd) }} per action</span><span>cap {{ project.subAgentCap }} agents</span></div>
              </div>
            </div>
            <div v-if="editingBudget" class="budget-form">
              <div class="ot-formgrid">
                <div class="ot-field"><label for="bf-token">Model budget ($)</label><input id="bf-token" v-model.number="budgetDraft.tokenBudgetUsd" type="number" min="0.01" step="1" class="ot-input mono" /></div>
                <div class="ot-field"><label for="bf-money">External budget ($)</label><input id="bf-money" v-model.number="budgetDraft.moneyBudgetUsd" type="number" min="0" step="1" class="ot-input mono" /></div>
                <div class="ot-field"><label for="bf-auto">Autonomous ≤ ($)</label><input id="bf-auto" v-model.number="budgetDraft.moneyAutonomousThresholdUsd" type="number" min="0" step="0.5" class="ot-input mono" /></div>
                <div class="ot-field"><label for="bf-cap">Agent cap</label><input id="bf-cap" v-model.number="budgetDraft.subAgentCap" type="number" min="1" step="1" class="ot-input mono" /></div>
              </div>
              <!-- Lowering the cap under the live roster retires agents the moment you save, so the
                   cost is stated before the click rather than discovered after it. -->
              <p v-if="capReduction > 0" class="bf-warn">
                {{ capReduction }} agent{{ capReduction === 1 ? '' : 's' }} will be retired immediately and
                {{ capReduction === 1 ? 'its' : 'their' }} desktop{{ capReduction === 1 ? '' : 's' }} destroyed.
                The Commander picks the least disruptive ones and is handed everything they were working on —
                objectives, milestones and their exact next action — so no work is lost.
              </p>
              <p v-if="budgetError" class="bf-error">{{ budgetError }}</p>
              <div class="bf-actions">
                <button class="ot-btn sm" :class="capReduction > 0 ? 'danger' : 'primary'" :disabled="budgetSaving" @click="saveBudgets">
                  {{ budgetSaving ? 'Saving…' : (capReduction > 0 ? `Save and retire ${capReduction}` : 'Save budgets') }}
                </button>
              </div>
              <p v-if="retiredSummary" class="bf-retired">{{ retiredSummary }}</p>
              <p v-if="project.status === 'BudgetPaused'" class="bf-hint">Raising the model budget above current spend resumes the project.</p>
            </div>
          </OmniTraderCard>

          <OmniTraderCard title="Plan" :subtitle="grandPlan.current ? `Grand Plan v${grandPlan.current.version}` : project.status === 'Planning' ? 'Drafting — awaiting your approval' : ''">
            <template #controls><button class="ot-btn ghost sm" @click="setTab('plan')">View →</button></template>
            <template v-if="digest.currentFocus || (digest.nextSteps && digest.nextSteps.length)">
              <p v-if="digest.currentFocus" class="digest-focus"><span class="ot-chip info">Focus</span> {{ digest.currentFocus }}</p>
              <ol v-if="digest.nextSteps && digest.nextSteps.length" class="digest-steps">
                <li v-for="(s, i) in digest.nextSteps" :key="i">{{ s }}</li>
              </ol>
            </template>
            <p v-else class="digest-text">{{ digest.currentPlan || 'No plan yet.' }}</p>
            <template v-if="digest.openThreads">
              <h3 class="ot-sectionhead pw-rail-sub">Open threads</h3>
              <p class="digest-text">{{ digest.openThreads }}</p>
            </template>
          </OmniTraderCard>

          <OmniTraderCard v-if="observables.length" title="Observables">
            <template #controls><button class="ot-btn ghost sm" @click="setTab('observables')">All →</button></template>
            <ul class="obs-mini-list">
              <li v-for="o in topObservables" :key="o.observableID" class="obs-mini-row">
                <span class="obs-mini-name" :title="o.name">{{ o.name }}</span>
                <ProjectsObservableSparkline v-if="o.type === 'Numeric' && o.history && o.history.length > 1" :samples="o.history" :width="52" :height="16" />
                <span class="obs-mini-value">{{ o.displayValue }}</span>
              </li>
            </ul>
          </OmniTraderCard>
        </aside>
      </div>

      <ProjectsEventDetail :project-id="projectId" :event="selectedEvent" @close="selectedEvent = null" />
    </template>

    <div v-else class="pw-loading" role="status">
      <span class="pw-spinner" aria-hidden="true"></span>
      <div><strong>{{ loadingStage }}</strong><small>The workspace opens as soon as this step finishes.</small></div>
    </div>
  </ProjectsShell>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import { useEventStream } from '~/composables/useEventStream';
import { pjMoney, pjStatusLabel, pjStatusTone } from '~/composables/useProjectsUi';
import ProjectsShell from '~/components/Projects/Shell.vue';
import ProjectsOverviewTab from '~/components/Projects/OverviewTab.vue';
import ProjectsTimeline from '~/components/Projects/Timeline.vue';
import ProjectsConversationPanel from '~/components/Projects/ConversationPanel.vue';
import ProjectsAnalyticsDashboard from '~/components/Projects/AnalyticsDashboard.vue';
import ProjectsComputersPanel from '~/components/Projects/ComputersPanel.vue';
import ProjectsAgentsPanel from '~/components/Projects/AgentsPanel.vue';
import ProjectsObservablesPanel from '~/components/Projects/ObservablesPanel.vue';
import ProjectsObservableSparkline from '~/components/Projects/ObservableSparkline.vue';
import ProjectsCouncilsPanel from '~/components/Projects/CouncilsPanel.vue';
import ProjectsGrandPlanPanel from '~/components/Projects/GrandPlanPanel.vue';
import ProjectsStepsPanel from '~/components/Projects/StepsPanel.vue';
import ProjectsHooksPanel from '~/components/Projects/HooksPanel.vue';
import ProjectsSettingsPanel from '~/components/Projects/SettingsPanel.vue';
import ProjectsEventDetail from '~/components/Projects/EventDetail.vue';
import ProjectsFilesPanel from '~/components/Projects/FilesPanel.vue';
import ProjectsHistoryExport from '~/components/Projects/HistoryExport.vue';

definePageMeta({ layout: 'navbar' });

const route = useRoute();
const router = useRouter();
const projectId = String(route.params.projectId);

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'conversation', label: 'Chat' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'plan', label: 'Plan' },
  { id: 'agents', label: 'Agents' },
  { id: 'computers', label: 'Computers' },
  { id: 'files', label: 'Files' },
  { id: 'observables', label: 'Observables' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'settings', label: 'Settings' },
];
// Older links name tabs that were folded into others.
const TAB_ALIASES: Record<string, string> = { desktops: 'computers', councils: 'plan', hooks: 'settings', chat: 'conversation' };
function normalTab(value: unknown) {
  const raw = String(value ?? '');
  const id = TAB_ALIASES[raw] ?? raw;
  return tabs.some(t => t.id === id) ? id : 'overview';
}
const tab = ref(normalTab(route.query.tab));
function setTab(id: string) {
  tab.value = normalTab(id);
  router.replace({ query: { ...route.query, tab: tab.value === 'overview' ? undefined : tab.value } });
}
watch(() => route.query.tab, value => { tab.value = normalTab(value); });
const currentTabLabel = computed(() => tabs.find(t => t.id === tab.value)?.label ?? '');
const showRail = computed(() => ['conversation', 'timeline', 'plan', 'agents', 'files', 'observables'].includes(tab.value));

const project = ref<any>(null);
const digest = ref<any>({});
const ledger = ref<any>({ tokenSpendUsd: 0, moneySpendUsd: 0 });
const events = ref<any[]>([]);
const agents = ref<any[]>([]);
const observables = ref<any[]>([]);
const councils = ref<any[]>([]);
const grandPlan = ref<any>({ current: null, versions: [] });
const activity = ref<Record<string, any>>({});
const loadError = ref('');
const loadingStage = ref('Connecting to Omnipotent…');
const detailsLoading = ref('');
const selectedEvent = ref<any>(null);
const goalOpen = ref(false);
let poll: ReturnType<typeof setInterval> | null = null;
let projectRetry: ReturnType<typeof setTimeout> | null = null;

const pendingGates = computed(() =>
  Math.max(0, events.value.filter(e => e.type === 'approval-requested').length -
  events.value.filter(e => e.type === 'approval-resolved').length));
const liveCount = computed(() => Object.keys(activity.value).length);
const tokenPct = computed(() => project.value?.tokenBudgetUsd > 0 ? 100 * (ledger.value.tokenSpendUsd || 0) / project.value.tokenBudgetUsd : 0);
const moneyPct = computed(() => project.value?.moneyBudgetUsd > 0 ? 100 * (ledger.value.moneySpendUsd || 0) / project.value.moneyBudgetUsd : 0);

const shellStatus = computed(() => {
  if (!project.value) return '';
  if (project.value.status === 'Blocked') return `Blocked${project.value.blockedReason ? ': ' + project.value.blockedReason : ''}`;
  if (pendingGates.value) return `${pendingGates.value} approval${pendingGates.value === 1 ? '' : 's'} waiting for you`;
  if (liveCount.value) return `${liveCount.value} agent${liveCount.value === 1 ? '' : 's'} working`;
  return pjStatusLabel(project.value.status);
});
useHead({ title: computed(() => project.value?.name ? `${project.value.name} · Projects` : 'Project · Projects') });
const shellTone = computed(() => !project.value ? '' : project.value.status === 'Blocked' ? 'bad'
  : pendingGates.value || ['Paused', 'BudgetPaused'].includes(project.value.status) ? 'warn' : 'ok');

const agentLabels = computed(() => {
  const m: Record<string, string> = {};
  for (const a of agents.value) m[a.agentID] = a.role;
  return m;
});

function onEvents(all: any[]) { events.value = all; }
function selectEvent(ev: any) { selectedEvent.value = ev; }

// The rail and header need to know who is mid-turn, cheaply: one socket for the whole page.
const activityStream = useEventStream({
  projectId,
  onEvent: () => scheduleRefresh(),
  onActivity: (a: any) => { activity.value = { ...activity.value, [a.agentID]: a }; },
  onActivityEnded: (id: string) => { const next = { ...activity.value }; delete next[id]; activity.value = next; },
});

function retryProjectSoon(delay = 1000) {
  if (projectRetry) clearTimeout(projectRetry);
  projectRetry = setTimeout(() => { projectRetry = null; refresh(); }, delay);
}
async function loadProject(): Promise<boolean> {
  try {
    if (!project.value) loadingStage.value = 'Loading the project record…';
    const res = await RequestGETFromKliveAPI(`/projects/get?projectID=${projectId}`, false, false);
    const routeMissing = res.status === 404 && (await res.clone().text()).includes('Route not found');
    let startingStage = '';
    if (res.status >= 500) {
      try {
        const body = await res.clone().json();
        if (body?.ready === false && body?.failed === true) {
          loadError.value = `${body?.stage || 'Projects startup failed'}${body?.error ? `: ${body.error}` : ''}`;
          return false;
        }
        if (body?.ready === false) startingStage = body?.stage ? `${body.stage}…` : 'Waiting for the Projects API to finish starting…';
      } catch { /* an unrelated 503 is handled as an ordinary load failure below */ }
    } else if (routeMissing) startingStage = 'Waiting for the Projects API to finish starting…';
    if (startingStage) {
      loadError.value = '';
      loadingStage.value = startingStage;
      retryProjectSoon(Number(res.headers.get('Retry-After') || 1) * 1000);
      return false;
    }
    if (!res.ok) {
      loadError.value = res.status === 404
        ? 'This project does not exist or has been removed.'
        : `The project could not be loaded (HTTP ${res.status}).`;
      return false;
    }
    project.value = await res.json();
    loadError.value = '';
    loadingStage.value = '';
    return true;
  } catch {
    loadingStage.value = 'Reconnecting to Omnipotent…';
    loadError.value = '';
    retryProjectSoon(1000);
    return false;
  }
}
async function loadJson(path: string, target: { value: any }) {
  try { const r = await RequestGETFromKliveAPI(path, false, false); if (r.ok) target.value = await r.json(); } catch { /* transient */ }
}
const loadDigest = () => loadJson(`/projects/digest?projectID=${projectId}`, digest);
const loadLedger = () => loadJson(`/projects/ledger?projectID=${projectId}`, ledger);
const loadAgents = () => loadJson(`/projects/agents?projectID=${projectId}`, agents);
const loadObservables = () => loadJson(`/projects/observables?projectID=${projectId}&history=120`, observables);
const loadCouncils = () => loadJson(`/projects/councils?projectID=${projectId}`, councils);
const loadGrandPlan = () => loadJson(`/projects/grandplan?projectID=${projectId}`, grandPlan);
async function loadActivity() {
  try {
    const r = await RequestGETFromKliveAPI(`/projects/activity?projectID=${projectId}`, false, false);
    if (!r.ok) return;
    const list = await r.json();
    if (Array.isArray(list)) activity.value = Object.fromEntries(list.map((a: any) => [a.agentID, a]));
  } catch { /* transient */ }
}

const topObservables = computed(() =>
  [...observables.value].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 6));

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
async function unblock() { await runAction('/projects/resume'); }
async function archive() { await runAction('/projects/archive'); }
async function unarchive() { await runAction('/projects/unarchive'); }

// ── budget editing ──
const editingBudget = ref(false);
const budgetSaving = ref(false);
const budgetError = ref('');
const budgetDraft = ref({ tokenBudgetUsd: 0, moneyBudgetUsd: 0, moneyAutonomousThresholdUsd: 0, subAgentCap: 1 });
const retiredSummary = ref('');
// How many agents a save at the drafted cap would retire. The backend chooses WHICH; this only states the count.
const capReduction = computed(() => {
  if (!editingBudget.value) return 0;
  const drafted = Number(budgetDraft.value.subAgentCap);
  if (!(drafted >= 1)) return 0;
  return Math.max(0, agents.value.length - drafted);
});
function toggleBudgetEdit() {
  budgetError.value = '';
  retiredSummary.value = '';
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
  if (!(d.tokenBudgetUsd > 0)) { budgetError.value = 'Model budget must be greater than 0.'; return; }
  if (d.moneyBudgetUsd < 0 || d.moneyAutonomousThresholdUsd < 0) { budgetError.value = 'Money values cannot be negative.'; return; }
  if (!(d.subAgentCap >= 1)) { budgetError.value = 'Agent cap must be at least 1.'; return; }
  budgetSaving.value = true;
  budgetError.value = '';
  try {
    const res = await RequestPOSTFromKliveAPI('/projects/budget/update', JSON.stringify({ projectID: projectId, ...d }), false, true);
    if (!res.ok) { budgetError.value = `Save failed (HTTP ${res.status}).`; return; }
    const saved = await res.json();
    project.value = saved;
    const retired: any[] = Array.isArray(saved.retiredAgents) ? saved.retiredAgents : [];
    if (retired.length) {
      const unowned = retired.reduce((n, h) => n + (h.activeMilestoneIDs?.length || 0), 0);
      retiredSummary.value =
        `Retired ${retired.map(h => `${h.role} (${h.agentID})`).join(', ')}. `
        + (unowned ? `${unowned} milestone${unowned === 1 ? '' : 's'} now unowned — ` : '')
        + 'their work is preserved and the Commander has been told.';
      await loadAgents();
    } else {
      retiredSummary.value = '';
      editingBudget.value = false;
    }
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

async function refresh() {
  const firstLoad = !project.value;
  const loaded = await loadProject();
  if (!loaded && !project.value) return;
  if (firstLoad) detailsLoading.value = 'Loading budget, plan, agents and live measurements…';
  await Promise.allSettled([loadDigest(), loadLedger(), loadAgents(), loadObservables(), loadCouncils(), loadGrandPlan(), loadActivity()]);
  detailsLoading.value = '';
}

// Live push refreshes the rail on any project event (debounced) instead of a tight poll.
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRefresh() { if (refreshTimer) return; refreshTimer = setTimeout(() => { refreshTimer = null; refresh(); }, 1000); }

onMounted(() => {
  refresh();
  activityStream.connect();
  poll = setInterval(refresh, 30000); // safety net only
});
onBeforeUnmount(() => {
  if (poll) clearInterval(poll);
  if (refreshTimer) clearTimeout(refreshTimer);
  if (projectRetry) clearTimeout(projectRetry);
  activityStream.disconnect();
});
</script>

<style scoped>
.pw-head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--ot-space-4); flex-wrap: wrap; margin-bottom: var(--ot-space-3); }
.pw-titles { min-width: 0; flex: 1 1 520px; }
.pw-title-row { display: flex; align-items: center; gap: var(--ot-space-2); flex-wrap: wrap; }
.pw-title { margin: 0; font-size: 24px; line-height: 32px; font-weight: 620; letter-spacing: -0.2px; overflow-wrap: anywhere; }
.pw-rename { color: var(--ot-muted); }
.pw-rename-input { max-width: 420px; height: 34px; font-size: 18px; }
.pw-approvals { cursor: pointer; }
.pw-goal { margin: var(--ot-space-1) 0 0; color: var(--ot-text-2); font-size: 13px; line-height: 19px; max-width: 110ch; cursor: pointer;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; white-space: pre-wrap; }
.pw-goal.open { display: block; -webkit-line-clamp: unset; }
.blocked-banner strong { display: block; }
.pw-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--ot-line); margin-bottom: var(--ot-gutter); overflow-x: auto; scrollbar-width: none; }
.pw-tabs::-webkit-scrollbar { height: 0; }
.pw-tabs button { display: inline-flex; align-items: center; gap: 6px; padding: 10px 14px; font-size: 13px; font-weight: 550; color: var(--ot-text-2);
  border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; cursor: pointer; }
.pw-tabs button:hover { color: var(--ot-text); }
.pw-tabs button.active { color: var(--ot-accent); border-bottom-color: var(--ot-accent); }
.pw-tab-count { font-size: 10.5px; color: var(--ot-muted); font-family: var(--ot-mono); }
.pw-body { display: grid; gap: var(--ot-gutter); grid-template-columns: minmax(0, 1fr); align-items: start; }
@media (min-width: 1240px) { .pw-body.with-rail { grid-template-columns: minmax(0, 1fr) minmax(300px, 360px); } }
.pw-main { min-width: 0; }
.pw-chat { height: clamp(460px, calc(100vh - 290px), 900px); overflow: hidden; }
.pw-rail { position: sticky; top: 108px; }
@media (max-width: 1239px) { .pw-rail { position: static; } }
.pw-budget { display: flex; flex-direction: column; gap: var(--ot-space-3); }
.budget-form { margin-top: var(--ot-space-3); border-top: 1px solid var(--ot-line); padding-top: var(--ot-space-3); display: flex; flex-direction: column; gap: var(--ot-space-2); }
.bf-error { font-size: 12px; color: var(--ot-negative); margin: 0; }
.bf-actions { display: flex; justify-content: flex-end; }
.bf-hint { font-size: 11.5px; color: var(--ot-warning); margin: 0; }
.bf-warn { font-size: 11.5px; color: #ffe6b0; line-height: 1.5; margin: 0; background: var(--ot-warning-soft); border-left: 2px solid var(--ot-warning); border-radius: 4px; padding: 8px 10px; }
.bf-retired { font-size: 11.5px; color: var(--ot-positive); line-height: 1.5; margin: 0; }
.pw-rail-sub { margin-top: var(--ot-space-3); }
.digest-text { font-size: 12.5px; color: var(--ot-text-2); white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; line-height: 1.5; }
.digest-focus { font-size: 12.5px; color: var(--ot-text); margin: 0 0 var(--ot-space-2); line-height: 1.5; overflow-wrap: anywhere; }
.digest-steps { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 3px; }
.digest-steps li { font-size: 12.5px; color: var(--ot-text-2); line-height: 1.45; overflow-wrap: anywhere; }
.obs-mini-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.obs-mini-row { display: flex; align-items: center; gap: 8px; font-size: 12.5px; }
.obs-mini-name { color: var(--ot-text-2); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.obs-mini-value { font-weight: 600; font-family: var(--ot-mono); flex-shrink: 0; }
.pw-loading { min-height: 300px; display: flex; align-items: center; justify-content: center; gap: 14px; }
.pw-loading > div { display: flex; flex-direction: column; gap: 4px; }
.pw-loading small { color: var(--ot-muted); }
.pw-spinner { width: 26px; height: 26px; border: 3px solid var(--ot-line-strong); border-top-color: var(--ot-accent); border-radius: 50%; animation: pw-spin .8s linear infinite; }
@keyframes pw-spin { to { transform: rotate(360deg); } }
</style>
