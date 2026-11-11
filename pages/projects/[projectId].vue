<template>
  <ProjectsShell :status="shellStatus" :status-tone="shellTone" :working="liveCount > 0" :crumb="project?.name" :commands="paletteCommands">
    <div v-if="loadError" class="pjx-banner" data-tone="fault" role="alert">
      <ProjectsIcon name="alert" />
      <div class="pjx-banner__body"><b>This project could not be loaded</b>{{ loadError }}</div>
      <div class="pjx-banner__actions"><button class="pjx-btn pjx-btn--sm" @click="refresh">Retry</button><NuxtLink class="pjx-btn pjx-btn--ghost pjx-btn--sm" to="/projects">All projects</NuxtLink></div>
    </div>

    <div v-else-if="project" class="pjx-ws">
      <!-- ── header: who, what state, what next ── -->
      <header class="pjx-card pjx-ws-head" :data-tone="state.tone">
        <div class="pjx-ws-head__titles">
          <div class="pjx-ws-head__row">
            <template v-if="!renaming">
              <h1>{{ project.name }}</h1>
              <button v-if="can.manage" class="pjx-iconbtn pjx-iconbtn--sm" title="Rename project" aria-label="Rename project" @click="startRename"><ProjectsIcon name="edit" /></button>
            </template>
            <template v-else>
              <input ref="renameInput" v-model="renameValue" class="pjx-input" style="max-width: 420px; height: 34px; font-size: 16px" aria-label="Project name" @keyup.enter="commitRename" @keyup.esc="renaming = false" />
              <button class="pjx-btn pjx-btn--primary pjx-btn--sm" :disabled="renameSaving" @click="commitRename">{{ renameSaving ? 'Saving…' : 'Save' }}</button>
              <button class="pjx-btn pjx-btn--ghost pjx-btn--sm" @click="renaming = false">Cancel</button>
            </template>
            <span class="pjx-chip" :data-tone="state.tone" :data-live="state.live || undefined" data-testid="project-status"><span class="pjx-chip__dot"></span>{{ statusLabel }}</span>
            <span v-if="liveCount" class="pjx-chip" data-tone="work" data-live><span class="pjx-chip__dot"></span>{{ liveCount }} working</span>
            <button v-if="pendingGates > 0" class="pjx-chip" data-tone="need" style="cursor: pointer" @click="setTab('overview')"><ProjectsIcon name="inbox" />{{ pendingGates }} {{ pendingGates === 1 ? 'approval' : 'approvals' }} waiting</button>
          </div>
          <p class="pjx-ws-head__goal" :data-open="goalOpen || undefined" :title="goalOpen ? '' : 'Show the full goal'" @click="goalOpen = !goalOpen">{{ project.goal }}</p>
        </div>

        <div class="pjx-ws-head__actions">
          <ProjectsHistoryExport :project-id="projectId" />
          <template v-if="can.manage">
            <button v-if="project.status === 'Active' || project.status === 'Planning'" class="pjx-btn pjx-btn--stop" :disabled="actionBusy" title="Pause: stops the in-flight wake too" @click="runAction('pause')"><ProjectsIcon name="pause" />Pause</button>
            <button v-else-if="project.status === 'Paused' || project.status === 'BudgetPaused'" class="pjx-btn pjx-btn--go" :disabled="actionBusy" @click="runAction('resume')"><ProjectsIcon name="play" />Resume</button>
            <button v-else-if="project.status === 'Blocked'" class="pjx-btn pjx-btn--go" :disabled="actionBusy" title="Clear the block and resume, once the cause is fixed" @click="runAction('resume')"><ProjectsIcon name="play" />Unblock</button>
            <button v-if="project.status === 'Archived'" class="pjx-btn" :disabled="actionBusy" @click="runAction('unarchive')"><ProjectsIcon name="unarchive" />Unshelve</button>
            <button v-else class="pjx-iconbtn" :disabled="actionBusy" title="Shelve this project" aria-label="Shelve this project" @click="runAction('archive')"><ProjectsIcon name="archive" /></button>
          </template>
        </div>

        <!-- The figures that answer "is it healthy and what is it costing", one click from the detail. -->
        <section class="pjx-ws-pulse" aria-label="Project at a glance">
          <button class="pjx-pulse" @click="openBudget">
            <span class="pjx-pulse__label">Model budget</span>
            <span class="pjx-pulse__value pjx-num" :data-tone="tokenTone">{{ pjUsd(ledger.tokenSpendUsd) }}<span class="pjx-dim" style="font-weight: 500">{{ isUnlimited(project.tokenBudgetUsd) ? ' · no cap' : ` of ${pjUsd(project.tokenBudgetUsd)}` }}</span></span>
            <div v-if="tokenPct != null" class="pjx-meter" :data-tone="tokenTone === 'fault' ? 'fault' : tokenTone === 'need' ? 'need' : undefined"><span class="pjx-meter__fill" :style="{ width: `${tokenPct}%` }"></span></div>
            <span v-else class="pjx-pulse__sub">lifetime spend</span>
          </button>
          <button class="pjx-pulse" @click="openBudget">
            <span class="pjx-pulse__label">External money</span>
            <span class="pjx-pulse__value pjx-num">{{ pjUsd(ledger.moneySpendUsd) }}<span class="pjx-dim" style="font-weight: 500"> of {{ pjUsd(project.moneyBudgetUsd) }}</span></span>
            <span class="pjx-pulse__sub">autonomous up to {{ pjUsd(project.moneyAutonomousThresholdUsd) }} an action</span>
          </button>
          <button class="pjx-pulse" @click="setTab('agents')">
            <span class="pjx-pulse__label">Task force</span>
            <span class="pjx-pulse__value" :data-tone="liveCount ? 'work' : undefined">{{ liveCount }} working<span class="pjx-dim" style="font-weight: 500"> · {{ agents.length }} on roster</span></span>
            <span class="pjx-pulse__sub">cap {{ project.subAgentCap }} agents</span>
          </button>
          <button class="pjx-pulse" @click="setTab('plan')">
            <span class="pjx-pulse__label">Plan</span>
            <span class="pjx-pulse__value" :data-tone="grandPlan.current ? undefined : 'plan'">{{ grandPlan.current ? `Grand Plan v${grandPlan.current.version}` : project.status === 'Planning' ? 'Drafting' : 'No plan yet' }}</span>
            <span class="pjx-pulse__sub" :title="digest.currentFocus || ''">{{ digest.currentFocus || (digest.nextSteps?.[0] ?? 'no focus recorded') }}</span>
          </button>
          <button class="pjx-pulse" @click="setTab('observables')">
            <span class="pjx-pulse__label">{{ topObservable?.name || 'Live values' }}</span>
            <span class="pjx-pulse__value pjx-num">{{ topObservable?.displayValue ?? '—' }}</span>
            <span class="pjx-pulse__sub">{{ topObservable ? `updated ${ageWords(topObservable.updatedAt, now)} ago` : 'agents publish these as they work' }}</span>
          </button>
        </section>
      </header>

      <div v-if="actionError" class="pjx-banner" data-tone="fault" role="alert">
        <ProjectsIcon name="alert" /><div class="pjx-banner__body">{{ actionError }}</div>
        <div class="pjx-banner__actions"><button class="pjx-btn pjx-btn--ghost pjx-btn--sm" @click="actionError = ''">Dismiss</button></div>
      </div>
      <div v-if="project.status === 'Blocked'" class="pjx-banner" data-tone="fault" role="alert">
        <ProjectsIcon name="octagon-x" />
        <div class="pjx-banner__body"><b>Blocked: action required</b>{{ project.blockedReason || 'The Commander stopped and is waiting for you.' }} Fix the cause, then Unblock to set the fleet back to work.</div>
        <div v-if="can.manage" class="pjx-banner__actions"><button class="pjx-btn pjx-btn--go pjx-btn--sm" :disabled="actionBusy" @click="runAction('resume')">Unblock</button></div>
      </div>
      <div v-if="detailsLoading" class="pjx-banner" role="status"><ProjectsIcon name="refresh" class="pjx-spin" /><div class="pjx-banner__body">{{ detailsLoading }}</div></div>

      <!-- ── sections ── -->
      <nav class="pjx-tabs" role="tablist" aria-label="Project sections">
        <button v-for="(t, i) in tabs" :key="t.id" class="pjx-tab" type="button" role="tab" :aria-selected="tab === t.id" :title="`${t.label} (${(i + 1) % 10})`" @click="setTab(t.id)">
          <ProjectsIcon :name="t.icon" />{{ t.label }}
          <span v-if="t.id === 'overview' && pendingGates > 0" class="pjx-tab__count" data-tone="need">{{ pendingGates }}</span>
          <span v-else-if="t.id === 'agents' && agents.length" class="pjx-tab__count">{{ agents.length }}</span>
          <span v-else-if="t.id === 'observables' && observables.length" class="pjx-tab__count">{{ observables.length }}</span>
        </button>
        <span class="pjx-tabs__keys"><span class="pjx-kbd">1</span>–<span class="pjx-kbd">0</span> switch</span>
      </nav>

      <div class="pjx-ws-body" :data-rail="showRail || undefined">
        <section class="pjx-ws-main" :aria-label="currentTabLabel">
          <ProjectsOverviewTab v-if="tab === 'overview'" :project-id="projectId" :project="project" :digest="digest" :ledger="ledger"
            :agents="agents" :observables="observables" :grand-plan="grandPlan" :events="events"
            @navigate="setTab" @changed="refresh" />
          <div v-show="tab === 'conversation'" class="pjx-card pw-chat">
            <ProjectsConversationPanel :project-id="projectId" @events="onEvents" @select="selectEvent" />
          </div>
          <ProjectsCard v-if="tab === 'timeline'" title="Timeline" icon="timeline" meta="Every event, by agent lane. Click a marker for its details." flush>
            <ProjectsTimeline :events="events" :agent-labels="agentLabels" @select="selectEvent" />
          </ProjectsCard>
          <div v-if="tab === 'plan'" class="pjx-stack">
            <ProjectsCard title="Step ledger" icon="plan" meta="The linear path the Commander is walking right now"><ProjectsStepsPanel :project-id="projectId" /></ProjectsCard>
            <ProjectsCard title="Grand Plan" icon="target" meta="The approved north star: mission, milestones, risks and success criteria">
              <ProjectsGrandPlanPanel :project-id="projectId" :grand-plan="grandPlan" />
            </ProjectsCard>
            <ProjectsCard title="Councils" icon="users" meta="Adversarial reviews the Commander convened before big decisions" :empty="!councils.length"
              empty-title="No councils yet" empty-text="The Commander convenes one before a plan, a pivot or an irreversible spend.">
              <ProjectsCouncilsPanel :project-id="projectId" :councils="councils" />
            </ProjectsCard>
          </div>
          <ProjectsCard v-if="tab === 'agents'" title="Task force" icon="bot" :meta="`${agents.length} on the roster · cap ${project.subAgentCap}`">
            <ProjectsAgentsPanel :project-id="projectId" :cap="project.subAgentCap" @watch="() => setTab('computers')" @roster-changed="loadAgents" />
          </ProjectsCard>
          <ProjectsComputersPanel v-if="tab === 'computers'" :project-id="projectId" />
          <ProjectsCard v-if="tab === 'files'" title="Files" icon="folder" meta="/project: shared by you and every agent"><ProjectsFilesPanel :project-id="projectId" :status="project.status" /></ProjectsCard>
          <ProjectsCard v-if="tab === 'observables'" title="Observables" icon="gauge" meta="Live values the agents keep measured for you">
            <ProjectsObservablesPanel :project-id="projectId" :observables="observables" @changed="loadObservables" />
          </ProjectsCard>
          <ProjectsAnalyticsDashboard v-if="tab === 'analytics'" :project-id="projectId" compact-header />
          <div v-if="tab === 'settings'" class="pjx-stack">
            <ProjectsCard title="Settings" icon="settings" meta="This project's own configuration, independent of every other project">
              <ProjectsSettingsPanel :project-id="projectId" />
            </ProjectsCard>
            <ProjectsCard title="Wake triggers" icon="broadcast" meta="Timers, webhooks, email and screen watches that wake the agents">
              <ProjectsHooksPanel :project-id="projectId" />
            </ProjectsCard>
          </div>
        </section>

        <aside v-if="showRail" class="pjx-rail" aria-label="Budget, plan and live values">
          <div class="pjx-card">
            <section id="pjx-budget" class="pjx-rail__section" aria-label="Budget">
              <div class="pjx-rail__label">Budget
                <button v-if="can.manage" class="pjx-btn pjx-btn--ghost pjx-btn--xs budget-edit-btn" @click="toggleBudgetEdit">{{ editingBudget ? 'Cancel' : 'Edit' }}</button>
              </div>
              <div class="pjx-budget">
                <div class="pjx-budget__row">
                  <div class="pjx-budget__head"><span>Model</span><b>{{ pjUsd(ledger.tokenSpendUsd) }} {{ isUnlimited(project.tokenBudgetUsd) ? '· no cap' : `/ ${pjUsd(project.tokenBudgetUsd)}` }}</b></div>
                  <div v-if="tokenPct != null" class="pjx-meter" :data-tone="tokenTone === 'fault' ? 'fault' : tokenTone === 'need' ? 'need' : undefined"><span class="pjx-meter__fill" :style="{ width: `${tokenPct}%` }"></span></div>
                </div>
                <div class="pjx-budget__row">
                  <div class="pjx-budget__head"><span>External</span><b>{{ pjUsd(ledger.moneySpendUsd) }} / {{ pjUsd(project.moneyBudgetUsd) }}</b></div>
                  <div class="pjx-meter"><span class="pjx-meter__fill" :style="{ width: `${moneyPct ?? 0}%` }"></span></div>
                  <span class="pjx-budget__foot">Autonomous up to {{ pjUsd(project.moneyAutonomousThresholdUsd) }} an action · cap {{ project.subAgentCap }} agents</span>
                </div>
              </div>
              <template v-if="editingBudget">
                <div class="pjx-budget-form">
                  <div class="pjx-field"><label for="bf-token">Model budget ($)</label><input id="bf-token" v-model.number="budgetDraft.tokenBudgetUsd" type="number" min="0.01" step="1" class="pjx-input pjx-num" /></div>
                  <div class="pjx-field"><label for="bf-money">External budget ($)</label><input id="bf-money" v-model.number="budgetDraft.moneyBudgetUsd" type="number" min="0" step="1" class="pjx-input pjx-num" /></div>
                  <div class="pjx-field"><label for="bf-auto">Autonomous ≤ ($)</label><input id="bf-auto" v-model.number="budgetDraft.moneyAutonomousThresholdUsd" type="number" min="0" step="0.5" class="pjx-input pjx-num" /></div>
                  <div class="pjx-field"><label for="bf-cap">Agent cap</label><input id="bf-cap" v-model.number="budgetDraft.subAgentCap" type="number" min="1" step="1" class="pjx-input pjx-num" /></div>
                </div>
                <!-- Lowering the cap under the live roster retires agents the moment you save, so the cost is stated before the click. -->
                <p v-if="capReduction > 0" class="pjx-note bf-warn" data-tone="need" style="margin-top: 8px">
                  {{ capReduction }} {{ capReduction === 1 ? 'agent' : 'agents' }} will be retired immediately and {{ capReduction === 1 ? 'its desktop' : 'their desktops' }} destroyed. The Commander picks the least disruptive ones and is handed everything they were working on, so no work is lost.
                </p>
                <p v-if="budgetError" class="pjx-note" data-tone="fault" style="margin-top: 8px">{{ budgetError }}</p>
                <div style="display: flex; justify-content: flex-end; margin-top: 8px">
                  <button class="pjx-btn pjx-btn--sm" :class="capReduction > 0 ? 'pjx-btn--danger' : 'pjx-btn--primary'" :disabled="budgetSaving" @click="saveBudgets">{{ budgetSaving ? 'Saving…' : capReduction > 0 ? `Save and retire ${capReduction}` : 'Save budgets' }}</button>
                </div>
                <p v-if="retiredSummary" class="pjx-note bf-retired" data-tone="work" style="margin-top: 8px">{{ retiredSummary }}</p>
                <p v-if="project.status === 'BudgetPaused'" class="pjx-note" data-tone="need" style="margin-top: 8px">Raising the model budget above current spend resumes the project.</p>
              </template>
            </section>

            <section class="pjx-rail__section" aria-label="Plan">
              <div class="pjx-rail__label">{{ grandPlan.current ? `Plan · Grand Plan v${grandPlan.current.version}` : project.status === 'Planning' ? 'Plan · drafting' : 'Plan' }}
                <button class="pjx-btn pjx-btn--ghost pjx-btn--xs" @click="setTab('plan')">Open</button>
              </div>
              <template v-if="digest.currentFocus || digest.nextSteps?.length">
                <p v-if="digest.currentFocus" class="pjx-focus">{{ digest.currentFocus }}</p>
                <ol v-if="digest.nextSteps?.length" class="pjx-steps" style="margin-top: 8px">
                  <li v-for="(s, i) in digest.nextSteps" :key="i">{{ s }}</li>
                </ol>
              </template>
              <p v-else class="pjx-prose">{{ digest.currentPlan || 'No plan yet.' }}</p>
              <template v-if="digest.openThreads">
                <div class="pjx-rail__label" style="margin-top: 12px">Open threads</div>
                <p class="pjx-prose">{{ digest.openThreads }}</p>
              </template>
            </section>

            <section v-if="observables.length" class="pjx-rail__section" aria-label="Live values">
              <div class="pjx-rail__label">Live values <button class="pjx-btn pjx-btn--ghost pjx-btn--xs" @click="setTab('observables')">All {{ observables.length }}</button></div>
              <ul class="pjx-obs">
                <li v-for="o in topObservables" :key="o.observableID">
                  <span class="pjx-obs__name" :title="o.name">{{ o.name }}</span>
                  <ProjectsSpark v-if="observableSeries(o).length > 1" :values="observableSeries(o)" :label="`${o.name} history`" />
                  <span class="pjx-obs__value">{{ o.displayValue }}</span>
                </li>
              </ul>
            </section>
          </div>
        </aside>
      </div>

      <ProjectsEventDetail :project-id="projectId" :event="selectedEvent" @close="selectedEvent = null" />
    </div>

    <div v-else class="pjx-card" role="status" style="padding: 40px 16px">
      <div class="pjx-empty"><ProjectsIcon name="refresh" class="pjx-spin" /><b>{{ loadingStage }}</b><span>The workspace opens as soon as this step finishes.</span></div>
    </div>
  </ProjectsShell>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import { useEventStream } from '~/composables/useEventStream';
import { useAccess } from '~/composables/useAccess';
import { pjxPost, usePjxToasts } from '~/composables/useProjectsConsole';
import { ageWords, budgetPct, isUnlimited, observableSeries, pjUsd, projectState, type PjCommand } from '~/scripts/projectsConsole';
import ProjectsShell from '~/components/Projects/Shell.vue';
import ProjectsIcon from '~/components/Projects/Icon.vue';
import ProjectsSpark from '~/components/Projects/Spark.vue';
import ProjectsCard from '~/components/Projects/Card.vue';
import ProjectsOverviewTab from '~/components/Projects/OverviewTab.vue';
import ProjectsTimeline from '~/components/Projects/Timeline.vue';
import ProjectsConversationPanel from '~/components/Projects/ConversationPanel.vue';
import ProjectsAnalyticsDashboard from '~/components/Projects/AnalyticsDashboard.vue';
import ProjectsComputersPanel from '~/components/Projects/ComputersPanel.vue';
import ProjectsAgentsPanel from '~/components/Projects/AgentsPanel.vue';
import ProjectsObservablesPanel from '~/components/Projects/ObservablesPanel.vue';
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
const access = useAccess();
const { toast } = usePjxToasts();
const can = computed(() => ({ manage: access.can('projects.lifecycle.manage') }));

const tabs = [
  { id: 'overview', label: 'Overview', icon: 'layers' },
  { id: 'conversation', label: 'Chat', icon: 'message' },
  { id: 'timeline', label: 'Timeline', icon: 'timeline' },
  { id: 'plan', label: 'Plan', icon: 'plan' },
  { id: 'agents', label: 'Agents', icon: 'users' },
  { id: 'computers', label: 'Computers', icon: 'monitor' },
  { id: 'files', label: 'Files', icon: 'folder' },
  { id: 'observables', label: 'Observables', icon: 'gauge' },
  { id: 'analytics', label: 'Analytics', icon: 'chart' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
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
const now = ref(Date.now());
let poll: ReturnType<typeof setInterval> | null = null;
let clock: ReturnType<typeof setInterval> | null = null;
let projectRetry: ReturnType<typeof setTimeout> | null = null;

const pendingGates = computed(() =>
  Math.max(0, events.value.filter(e => e.type === 'approval-requested').length -
  events.value.filter(e => e.type === 'approval-resolved').length));
const liveCount = computed(() => Object.keys(activity.value).length);
const state = computed(() => projectState({ status: project.value?.status ?? 'Paused', halted: !!project.value?.haltedFromStatus, workingAgents: liveCount.value, executionDisposition: '' }));
const statusLabel = computed(() => {
  const s = project.value?.status;
  if (s === 'Paused' && project.value?.haltedFromStatus) return 'Halted';
  return ({ BudgetPaused: 'Out of budget', Archived: 'Shelved' } as Record<string, string>)[s] ?? s ?? '';
});
const tokenPct = computed(() => project.value ? budgetPct(ledger.value.tokenSpendUsd || 0, project.value.tokenBudgetUsd) : null);
const moneyPct = computed(() => project.value?.moneyBudgetUsd > 0 ? Math.min(100, 100 * (ledger.value.moneySpendUsd || 0) / project.value.moneyBudgetUsd) : null);
const tokenTone = computed(() => tokenPct.value == null ? undefined : tokenPct.value >= 100 ? 'fault' : tokenPct.value >= 80 ? 'need' : undefined);

const shellStatus = computed(() => {
  if (!project.value) return '';
  if (project.value.status === 'Blocked') return `Blocked${project.value.blockedReason ? ': ' + project.value.blockedReason : ''}`;
  if (pendingGates.value) return `${pendingGates.value} approval${pendingGates.value === 1 ? '' : 's'} waiting for you`;
  if (liveCount.value) return `${liveCount.value} agent${liveCount.value === 1 ? '' : 's'} working`;
  return statusLabel.value;
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
      loadError.value = res.status === 404 ? 'This project does not exist or has been removed.' : `The project could not be loaded (HTTP ${res.status}).`;
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
const topObservable = computed(() => topObservables.value[0] ?? null);

// ── lifecycle actions ──
const actionBusy = ref(false);
const actionError = ref('');
async function runAction(kind: 'pause' | 'resume' | 'archive' | 'unarchive') {
  if (actionBusy.value) return;
  actionBusy.value = true;
  actionError.value = '';
  const r = await pjxPost(`/projects/${kind}`, { projectID: projectId });
  actionBusy.value = false;
  if (!r.ok) { actionError.value = r.error; return; }
  const done = { pause: 'Paused', resume: 'Resumed', archive: 'Shelved', unarchive: 'Unshelved' }[kind];
  toast(r.pending ? `${done.replace(/ed$/, 'ing')}: still settling, this page updates when it lands.` : `${done}.`, r.pending ? 'need' : 'work');
  await loadProject();
}

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
async function openBudget() {
  if (!showRail.value) setTab('plan');
  await nextTick();
  if (!editingBudget.value && can.value.manage) toggleBudgetEdit();
  document.getElementById('pjx-budget')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
      retiredSummary.value = `Retired ${retired.map(h => `${h.role} (${h.agentID})`).join(', ')}. `
        + (unowned ? `${unowned} milestone${unowned === 1 ? '' : 's'} now unowned; ` : '')
        + 'their work is preserved and the Commander has been told.';
      await loadAgents();
    } else {
      retiredSummary.value = '';
      editingBudget.value = false;
      toast('Budgets saved.', 'work');
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
async function commitRename() {
  const name = renameValue.value.trim();
  if (!name || name === project.value?.name) { renaming.value = false; return; }
  renameSaving.value = true;
  const r = await pjxPost('/projects/rename', { projectID: projectId, name });
  renameSaving.value = false;
  if (!r.ok) { actionError.value = r.error; return; }
  if (r.body) project.value = r.body;
  renaming.value = false;
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

const paletteCommands = computed<PjCommand[]>(() => {
  const list: PjCommand[] = tabs.map((t, i) => ({ id: `tab:${t.id}`, title: `${t.label}`, group: 'Go to' as const, icon: t.icon, hint: `tab ${(i + 1) % 10}`, keywords: `${project.value?.name ?? ''} section`, run: () => setTab(t.id) }));
  const p = project.value;
  if (p && can.value.manage) {
    if (p.status === 'Active' || p.status === 'Planning') list.unshift({ id: 'pause', title: `Pause ${p.name}`, group: 'Actions', icon: 'pause', keywords: 'stop halt', run: () => runAction('pause') });
    else if (['Paused', 'BudgetPaused', 'Blocked'].includes(p.status)) list.unshift({ id: 'resume', title: `${p.status === 'Blocked' ? 'Unblock' : 'Resume'} ${p.name}`, group: 'Actions', icon: 'play', keywords: 'start continue', run: () => runAction('resume') });
    list.push({ id: 'budget', title: 'Edit budgets', group: 'Actions', icon: 'coins', keywords: 'money cap agents', run: openBudget });
    list.push({ id: 'rename', title: 'Rename project', group: 'Actions', icon: 'edit', run: startRename });
  }
  return list;
});

function onKey(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.querySelector('.pjx-layer.pjx-dialog, .pjx-layer.pjx-palette, .pjx-layer.pjx-sheet, .ot-drawer')) return;
  if (/^[0-9]$/.test(e.key)) {
    const index = e.key === '0' ? 9 : Number(e.key) - 1;
    if (tabs[index]) { e.preventDefault(); setTab(tabs[index].id); }
  }
}

onMounted(() => {
  refresh();
  activityStream.connect();
  // Safety net only; never while the tab is hidden.
  poll = setInterval(() => { if (!document.hidden) refresh(); }, 30000);
  clock = setInterval(() => { now.value = Date.now(); }, 30000);
  window.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  if (poll) clearInterval(poll);
  if (clock) clearInterval(clock);
  if (refreshTimer) clearTimeout(refreshTimer);
  if (projectRetry) clearTimeout(projectRetry);
  activityStream.disconnect();
  window.removeEventListener('keydown', onKey);
});
</script>

<style scoped>
.pw-chat { height: clamp(460px, calc(100vh - 330px), 900px); overflow: hidden; }
</style>
