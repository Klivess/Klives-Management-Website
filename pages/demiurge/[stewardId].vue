<template>
  <DemiurgeShell :status="shellStatus" :status-tone="shellTone" :working="liveCount > 0" :crumb="steward?.name" :commands="paletteCommands">
    <div v-if="loadError" class="dmx-banner" data-tone="fault" role="alert">
      <DemiurgeIcon name="alert" />
      <div class="dmx-banner__body"><b>This Steward could not be loaded</b>{{ loadError }}</div>
      <div class="dmx-banner__actions"><button class="dmx-btn dmx-btn--sm" @click="refresh">Retry</button><NuxtLink class="dmx-btn dmx-btn--ghost dmx-btn--sm" to="/demiurge">All Stewards</NuxtLink></div>
    </div>

    <div v-else-if="steward" class="dmx-ws">
      <!-- ── header: who, what state, what next ── -->
      <header class="dmx-card dmx-ws-head" :data-tone="state.tone">
        <div class="dmx-ws-head__titles">
          <div class="dmx-ws-head__row">
            <template v-if="!renaming">
              <h1>{{ steward.name }}</h1>
              <button v-if="can.manage" class="dmx-iconbtn dmx-iconbtn--sm" title="Rename Steward" aria-label="Rename Steward" @click="startRename"><DemiurgeIcon name="edit" /></button>
            </template>
            <template v-else>
              <input ref="renameInput" v-model="renameValue" class="dmx-input" style="max-width: 420px; height: 34px; font-size: 16px" aria-label="Steward name" @keyup.enter="commitRename" @keyup.esc="renaming = false" />
              <button class="dmx-btn dmx-btn--primary dmx-btn--sm" :disabled="renameSaving" @click="commitRename">{{ renameSaving ? 'Saving…' : 'Save' }}</button>
              <button class="dmx-btn dmx-btn--ghost dmx-btn--sm" @click="renaming = false">Cancel</button>
            </template>
            <span class="dmx-chip" :data-tone="state.tone" :data-live="state.live || undefined" data-testid="steward-status"><span class="dmx-chip__dot"></span>{{ statusLabel }}</span>
            <span v-if="liveCount" class="dmx-chip" data-tone="work" data-live><span class="dmx-chip__dot"></span>{{ liveCount }} working</span>
            <button v-if="pendingGates > 0" class="dmx-chip" data-tone="need" style="cursor: pointer" @click="setTab('overview')"><DemiurgeIcon name="inbox" />{{ pendingGates }} {{ pendingGates === 1 ? 'approval' : 'approvals' }} waiting</button>
          </div>
          <p class="dmx-ws-head__goal" :data-open="goalOpen || undefined" :title="goalOpen ? '' : 'Show the full goal'" @click="goalOpen = !goalOpen">{{ steward.goal }}</p>
        </div>

        <div class="dmx-ws-head__actions">
          <DemiurgeHistoryExport :steward-id="stewardId" />
          <template v-if="can.manage">
            <button v-if="steward.status === 'Active' || steward.status === 'Planning'" class="dmx-btn dmx-btn--stop" :disabled="actionBusy" title="Pause: stops the in-flight wake too" @click="runAction('pause')"><DemiurgeIcon name="pause" />Pause</button>
            <button v-else-if="steward.status === 'Paused' || steward.status === 'BudgetPaused'" class="dmx-btn dmx-btn--go" :disabled="actionBusy" @click="runAction('resume')"><DemiurgeIcon name="play" />Resume</button>
            <button v-else-if="steward.status === 'Blocked'" class="dmx-btn dmx-btn--go" :disabled="actionBusy" title="Clear the block and resume, once the cause is fixed" @click="runAction('resume')"><DemiurgeIcon name="play" />Unblock</button>
            <button v-if="steward.status === 'Archived'" class="dmx-btn" :disabled="actionBusy" @click="runAction('unarchive')"><DemiurgeIcon name="unarchive" />Unshelve</button>
            <button v-else class="dmx-iconbtn" :disabled="actionBusy" title="Shelve this Steward" aria-label="Shelve this Steward" @click="runAction('archive')"><DemiurgeIcon name="archive" /></button>
          </template>
        </div>

        <!-- The figures that answer "is it healthy and what is it costing", one click from the detail. -->
        <section class="dmx-ws-pulse" aria-label="Steward at a glance">
          <button class="dmx-pulse" @click="openBudget">
            <span class="dmx-pulse__label">Model budget</span>
            <span class="dmx-pulse__value dmx-num" :data-tone="tokenTone">{{ dmUsd(ledger.tokenSpendUsd) }}<span class="dmx-dim" style="font-weight: 500">{{ isUnlimited(steward.tokenBudgetUsd) ? ' · no cap' : ` of ${dmUsd(steward.tokenBudgetUsd)}` }}</span></span>
            <div v-if="tokenPct != null" class="dmx-meter" :data-tone="tokenTone === 'fault' ? 'fault' : tokenTone === 'need' ? 'need' : undefined"><span class="dmx-meter__fill" :style="{ width: `${tokenPct}%` }"></span></div>
            <span v-else class="dmx-pulse__sub">lifetime spend</span>
          </button>
          <button class="dmx-pulse" @click="openBudget">
            <span class="dmx-pulse__label">External money</span>
            <span class="dmx-pulse__value dmx-num">{{ dmUsd(ledger.moneySpendUsd) }}<span class="dmx-dim" style="font-weight: 500"> of {{ dmUsd(steward.moneyBudgetUsd) }}</span></span>
            <span class="dmx-pulse__sub">autonomous up to {{ dmUsd(steward.moneyAutonomousThresholdUsd) }} an action</span>
          </button>
          <button class="dmx-pulse" @click="setTab('agents')">
            <span class="dmx-pulse__label">Task force</span>
            <span class="dmx-pulse__value" :data-tone="liveCount ? 'work' : undefined">{{ liveCount }} working<span class="dmx-dim" style="font-weight: 500"> · {{ agents.length }} on roster</span></span>
            <span class="dmx-pulse__sub">cap {{ steward.subAgentCap }} agents</span>
          </button>
          <button class="dmx-pulse" @click="setTab('plan')">
            <span class="dmx-pulse__label">Plan</span>
            <span class="dmx-pulse__value" :data-tone="grandPlan.current ? undefined : 'plan'">{{ grandPlan.current ? `Grand Plan v${grandPlan.current.version}` : steward.status === 'Planning' ? 'Drafting' : 'No plan yet' }}</span>
            <span class="dmx-pulse__sub" :title="digest.currentFocus || ''">{{ digest.currentFocus || (digest.nextSteps?.[0] ?? 'no focus recorded') }}</span>
          </button>
          <button class="dmx-pulse" @click="setTab('observables')">
            <span class="dmx-pulse__label">{{ topObservable?.name || 'Live values' }}</span>
            <span class="dmx-pulse__value dmx-num">{{ topObservable?.displayValue ?? '—' }}</span>
            <span class="dmx-pulse__sub">{{ topObservable ? `updated ${ageWords(topObservable.updatedAt, now)} ago` : 'agents publish these as they work' }}</span>
          </button>
        </section>
      </header>

      <div v-if="actionError" class="dmx-banner" data-tone="fault" role="alert">
        <DemiurgeIcon name="alert" /><div class="dmx-banner__body">{{ actionError }}</div>
        <div class="dmx-banner__actions"><button class="dmx-btn dmx-btn--ghost dmx-btn--sm" @click="actionError = ''">Dismiss</button></div>
      </div>
      <div v-if="steward.status === 'Blocked'" class="dmx-banner" data-tone="fault" role="alert">
        <DemiurgeIcon name="octagon-x" />
        <div class="dmx-banner__body"><b>Blocked: action required</b>{{ steward.blockedReason || 'The Commander stopped and is waiting for you.' }} Fix the cause, then Unblock to set the fleet back to work.</div>
        <div v-if="can.manage" class="dmx-banner__actions"><button class="dmx-btn dmx-btn--go dmx-btn--sm" :disabled="actionBusy" @click="runAction('resume')">Unblock</button></div>
      </div>
      <div v-if="detailsLoading" class="dmx-banner" role="status"><DemiurgeIcon name="refresh" class="dmx-spin" /><div class="dmx-banner__body">{{ detailsLoading }}</div></div>

      <!-- ── sections ── -->
      <nav class="dmx-tabs" role="tablist" aria-label="Steward sections">
        <button v-for="(t, i) in tabs" :key="t.id" class="dmx-tab" type="button" role="tab" :aria-selected="tab === t.id" :title="`${t.label} (${(i + 1) % 10})`" @click="setTab(t.id)">
          <DemiurgeIcon :name="t.icon" />{{ t.label }}
          <span v-if="t.id === 'overview' && pendingGates > 0" class="dmx-tab__count" data-tone="need">{{ pendingGates }}</span>
          <span v-else-if="t.id === 'agents' && agents.length" class="dmx-tab__count">{{ agents.length }}</span>
          <span v-else-if="t.id === 'observables' && observables.length" class="dmx-tab__count">{{ observables.length }}</span>
        </button>
        <span class="dmx-tabs__keys"><span class="dmx-kbd">1</span>–<span class="dmx-kbd">0</span> switch</span>
      </nav>

      <div class="dmx-ws-body" :data-rail="showRail || undefined">
        <section class="dmx-ws-main" :aria-label="currentTabLabel">
          <DemiurgeOverviewTab v-if="tab === 'overview'" :steward-id="stewardId" :steward="steward" :digest="digest" :ledger="ledger"
            :agents="agents" :observables="observables" :grand-plan="grandPlan" :events="events"
            @navigate="setTab" @changed="refresh" />
          <div v-show="tab === 'conversation'" class="dmx-card pw-chat">
            <DemiurgeConversationPanel :steward-id="stewardId" @events="onEvents" @select="selectEvent" />
          </div>
          <DemiurgeCard v-if="tab === 'timeline'" title="Timeline" icon="timeline" meta="Every event, by agent lane. Click a marker for its details." flush>
            <DemiurgeTimeline :events="events" :agent-labels="agentLabels" @select="selectEvent" />
          </DemiurgeCard>
          <div v-if="tab === 'plan'" class="dmx-stack">
            <DemiurgeCard title="Step ledger" icon="plan" meta="The linear path the Commander is walking right now"><DemiurgeStepsPanel :steward-id="stewardId" /></DemiurgeCard>
            <DemiurgeCard title="Grand Plan" icon="target" meta="The approved north star: mission, milestones, risks and success criteria">
              <DemiurgeGrandPlanPanel :steward-id="stewardId" :grand-plan="grandPlan" />
            </DemiurgeCard>
            <DemiurgeCard title="Councils" icon="users" meta="Adversarial reviews the Commander convened before big decisions" :empty="!councils.length"
              empty-title="No councils yet" empty-text="The Commander convenes one before a plan, a pivot or an irreversible spend.">
              <DemiurgeCouncilsPanel :steward-id="stewardId" :councils="councils" />
            </DemiurgeCard>
          </div>
          <DemiurgeCard v-if="tab === 'agents'" title="Task force" icon="bot" :meta="`${agents.length} on the roster · cap ${steward.subAgentCap}`">
            <DemiurgeAgentsPanel :steward-id="stewardId" :cap="steward.subAgentCap" @watch="() => setTab('computers')" @roster-changed="loadAgents" />
          </DemiurgeCard>
          <DemiurgeComputersPanel v-if="tab === 'computers'" :steward-id="stewardId" />
          <DemiurgeCard v-if="tab === 'files'" title="Files" icon="folder" meta="/project: shared by you and every agent"><DemiurgeFilesPanel :steward-id="stewardId" :status="steward.status" /></DemiurgeCard>
          <DemiurgeCard v-if="tab === 'observables'" title="Observables" icon="gauge" meta="Live values the agents keep measured for you">
            <DemiurgeObservablesPanel :steward-id="stewardId" :observables="observables" @changed="loadObservables" />
          </DemiurgeCard>
          <DemiurgeAnalyticsDashboard v-if="tab === 'analytics'" :steward-id="stewardId" compact-header />
          <div v-if="tab === 'settings'" class="dmx-stack">
            <DemiurgeCard title="Settings" icon="settings" meta="This Steward's own configuration, independent of every other Steward">
              <DemiurgeSettingsPanel :steward-id="stewardId" />
            </DemiurgeCard>
            <DemiurgeCard title="Wake triggers" icon="broadcast" meta="Timers, webhooks, email and screen watches that wake the agents">
              <DemiurgeHooksPanel :steward-id="stewardId" />
            </DemiurgeCard>
          </div>
        </section>

        <aside v-if="showRail" class="dmx-rail" aria-label="Budget, plan and live values">
          <div class="dmx-card">
            <section id="dmx-budget" class="dmx-rail__section" aria-label="Budget">
              <div class="dmx-rail__label">Budget
                <button v-if="can.manage" class="dmx-btn dmx-btn--ghost dmx-btn--xs budget-edit-btn" @click="toggleBudgetEdit">{{ editingBudget ? 'Cancel' : 'Edit' }}</button>
              </div>
              <div class="dmx-budget">
                <div class="dmx-budget__row">
                  <div class="dmx-budget__head"><span>Model</span><b>{{ dmUsd(ledger.tokenSpendUsd) }} {{ isUnlimited(steward.tokenBudgetUsd) ? '· no cap' : `/ ${dmUsd(steward.tokenBudgetUsd)}` }}</b></div>
                  <div v-if="tokenPct != null" class="dmx-meter" :data-tone="tokenTone === 'fault' ? 'fault' : tokenTone === 'need' ? 'need' : undefined"><span class="dmx-meter__fill" :style="{ width: `${tokenPct}%` }"></span></div>
                </div>
                <div class="dmx-budget__row">
                  <div class="dmx-budget__head"><span>External</span><b>{{ dmUsd(ledger.moneySpendUsd) }} / {{ dmUsd(steward.moneyBudgetUsd) }}</b></div>
                  <div class="dmx-meter"><span class="dmx-meter__fill" :style="{ width: `${moneyPct ?? 0}%` }"></span></div>
                  <span class="dmx-budget__foot">Autonomous up to {{ dmUsd(steward.moneyAutonomousThresholdUsd) }} an action · cap {{ steward.subAgentCap }} agents</span>
                </div>
              </div>
              <template v-if="editingBudget">
                <div class="dmx-budget-form">
                  <div class="dmx-field"><label for="bf-token">Model budget ($)</label><input id="bf-token" v-model.number="budgetDraft.tokenBudgetUsd" type="number" min="0.01" step="1" class="dmx-input dmx-num" /></div>
                  <div class="dmx-field"><label for="bf-money">External budget ($)</label><input id="bf-money" v-model.number="budgetDraft.moneyBudgetUsd" type="number" min="0" step="1" class="dmx-input dmx-num" /></div>
                  <div class="dmx-field"><label for="bf-auto">Autonomous ≤ ($)</label><input id="bf-auto" v-model.number="budgetDraft.moneyAutonomousThresholdUsd" type="number" min="0" step="0.5" class="dmx-input dmx-num" /></div>
                  <div class="dmx-field"><label for="bf-cap">Agent cap</label><input id="bf-cap" v-model.number="budgetDraft.subAgentCap" type="number" min="1" step="1" class="dmx-input dmx-num" /></div>
                </div>
                <!-- Lowering the cap under the live roster retires agents the moment you save, so the cost is stated before the click. -->
                <p v-if="capReduction > 0" class="dmx-note bf-warn" data-tone="need" style="margin-top: 8px">
                  {{ capReduction }} {{ capReduction === 1 ? 'agent' : 'agents' }} will be retired immediately and {{ capReduction === 1 ? 'its desktop' : 'their desktops' }} destroyed. The Commander picks the least disruptive ones and is handed everything they were working on, so no work is lost.
                </p>
                <p v-if="budgetError" class="dmx-note" data-tone="fault" style="margin-top: 8px">{{ budgetError }}</p>
                <div style="display: flex; justify-content: flex-end; margin-top: 8px">
                  <button class="dmx-btn dmx-btn--sm" :class="capReduction > 0 ? 'dmx-btn--danger' : 'dmx-btn--primary'" :disabled="budgetSaving" @click="saveBudgets">{{ budgetSaving ? 'Saving…' : capReduction > 0 ? `Save and retire ${capReduction}` : 'Save budgets' }}</button>
                </div>
                <p v-if="retiredSummary" class="dmx-note bf-retired" data-tone="work" style="margin-top: 8px">{{ retiredSummary }}</p>
                <p v-if="steward.status === 'BudgetPaused'" class="dmx-note" data-tone="need" style="margin-top: 8px">Raising the model budget above current spend resumes the Steward.</p>
              </template>
            </section>

            <section class="dmx-rail__section" aria-label="Plan">
              <div class="dmx-rail__label">{{ grandPlan.current ? `Plan · Grand Plan v${grandPlan.current.version}` : steward.status === 'Planning' ? 'Plan · drafting' : 'Plan' }}
                <button class="dmx-btn dmx-btn--ghost dmx-btn--xs" @click="setTab('plan')">Open</button>
              </div>
              <template v-if="digest.currentFocus || digest.nextSteps?.length">
                <p v-if="digest.currentFocus" class="dmx-focus">{{ digest.currentFocus }}</p>
                <ol v-if="digest.nextSteps?.length" class="dmx-steps" style="margin-top: 8px">
                  <li v-for="(s, i) in digest.nextSteps" :key="i">{{ s }}</li>
                </ol>
              </template>
              <p v-else class="dmx-prose">{{ digest.currentPlan || 'No plan yet.' }}</p>
              <template v-if="digest.openThreads">
                <div class="dmx-rail__label" style="margin-top: 12px">Open threads</div>
                <p class="dmx-prose">{{ digest.openThreads }}</p>
              </template>
            </section>

            <section v-if="observables.length" class="dmx-rail__section" aria-label="Live values">
              <div class="dmx-rail__label">Live values <button class="dmx-btn dmx-btn--ghost dmx-btn--xs" @click="setTab('observables')">All {{ observables.length }}</button></div>
              <ul class="dmx-obs">
                <li v-for="o in topObservables" :key="o.observableID">
                  <span class="dmx-obs__name" :title="o.name">{{ o.name }}</span>
                  <DemiurgeSpark v-if="observableSeries(o).length > 1" :values="observableSeries(o)" :label="`${o.name} history`" />
                  <span class="dmx-obs__value">{{ o.displayValue }}</span>
                </li>
              </ul>
            </section>
          </div>
        </aside>
      </div>

      <DemiurgeEventDetail :steward-id="stewardId" :event="selectedEvent" @close="selectedEvent = null" />
    </div>

    <div v-else class="dmx-card" role="status" style="padding: 40px 16px">
      <div class="dmx-empty"><DemiurgeIcon name="refresh" class="dmx-spin" /><b>{{ loadingStage }}</b><span>The workspace opens as soon as this step finishes.</span></div>
    </div>
  </DemiurgeShell>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import { useEventStream } from '~/composables/useEventStream';
import { useAccess } from '~/composables/useAccess';
import { dmxPost, useDmxToasts } from '~/composables/useDemiurgeConsole';
import { ageWords, budgetPct, isUnlimited, observableSeries, dmUsd, stewardState, type DmCommand } from '~/scripts/demiurgeConsole';
import DemiurgeShell from '~/components/Demiurge/Shell.vue';
import DemiurgeIcon from '~/components/Demiurge/Icon.vue';
import DemiurgeSpark from '~/components/Demiurge/Spark.vue';
import DemiurgeCard from '~/components/Demiurge/Card.vue';
import DemiurgeOverviewTab from '~/components/Demiurge/OverviewTab.vue';
import DemiurgeTimeline from '~/components/Demiurge/Timeline.vue';
import DemiurgeConversationPanel from '~/components/Demiurge/ConversationPanel.vue';
import DemiurgeAnalyticsDashboard from '~/components/Demiurge/AnalyticsDashboard.vue';
import DemiurgeComputersPanel from '~/components/Demiurge/ComputersPanel.vue';
import DemiurgeAgentsPanel from '~/components/Demiurge/AgentsPanel.vue';
import DemiurgeObservablesPanel from '~/components/Demiurge/ObservablesPanel.vue';
import DemiurgeCouncilsPanel from '~/components/Demiurge/CouncilsPanel.vue';
import DemiurgeGrandPlanPanel from '~/components/Demiurge/GrandPlanPanel.vue';
import DemiurgeStepsPanel from '~/components/Demiurge/StepsPanel.vue';
import DemiurgeHooksPanel from '~/components/Demiurge/HooksPanel.vue';
import DemiurgeSettingsPanel from '~/components/Demiurge/SettingsPanel.vue';
import DemiurgeEventDetail from '~/components/Demiurge/EventDetail.vue';
import DemiurgeFilesPanel from '~/components/Demiurge/FilesPanel.vue';
import DemiurgeHistoryExport from '~/components/Demiurge/HistoryExport.vue';

definePageMeta({ layout: 'navbar' });

const route = useRoute();
const router = useRouter();
const stewardId = String(route.params.stewardId);
const access = useAccess();
const { toast } = useDmxToasts();
const can = computed(() => ({ manage: access.can('demiurge.lifecycle.manage') }));

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

const steward = ref<any>(null);
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
let stewardRetry: ReturnType<typeof setTimeout> | null = null;

const pendingGates = computed(() =>
  Math.max(0, events.value.filter(e => e.type === 'approval-requested').length -
  events.value.filter(e => e.type === 'approval-resolved').length));
const liveCount = computed(() => Object.keys(activity.value).length);
const state = computed(() => stewardState({ status: steward.value?.status ?? 'Paused', halted: !!steward.value?.haltedFromStatus, workingAgents: liveCount.value, executionDisposition: '' }));
const statusLabel = computed(() => {
  const s = steward.value?.status;
  if (s === 'Paused' && steward.value?.haltedFromStatus) return 'Halted';
  return ({ BudgetPaused: 'Out of budget', Archived: 'Shelved' } as Record<string, string>)[s] ?? s ?? '';
});
const tokenPct = computed(() => steward.value ? budgetPct(ledger.value.tokenSpendUsd || 0, steward.value.tokenBudgetUsd) : null);
const moneyPct = computed(() => steward.value?.moneyBudgetUsd > 0 ? Math.min(100, 100 * (ledger.value.moneySpendUsd || 0) / steward.value.moneyBudgetUsd) : null);
const tokenTone = computed(() => tokenPct.value == null ? undefined : tokenPct.value >= 100 ? 'fault' : tokenPct.value >= 80 ? 'need' : undefined);

const shellStatus = computed(() => {
  if (!steward.value) return '';
  if (steward.value.status === 'Blocked') return `Blocked${steward.value.blockedReason ? ': ' + steward.value.blockedReason : ''}`;
  if (pendingGates.value) return `${pendingGates.value} approval${pendingGates.value === 1 ? '' : 's'} waiting for you`;
  if (liveCount.value) return `${liveCount.value} agent${liveCount.value === 1 ? '' : 's'} working`;
  return statusLabel.value;
});
useHead({ title: computed(() => steward.value?.name ? `${steward.value.name} · Demiurge` : 'Steward · Demiurge') });
const shellTone = computed(() => !steward.value ? '' : steward.value.status === 'Blocked' ? 'bad'
  : pendingGates.value || ['Paused', 'BudgetPaused'].includes(steward.value.status) ? 'warn' : 'ok');

const agentLabels = computed(() => {
  const m: Record<string, string> = {};
  for (const a of agents.value) m[a.agentID] = a.role;
  return m;
});

function onEvents(all: any[]) { events.value = all; }
function selectEvent(ev: any) { selectedEvent.value = ev; }

// The rail and header need to know who is mid-turn, cheaply: one socket for the whole page.
const activityStream = useEventStream({
  stewardId,
  onEvent: () => scheduleRefresh(),
  onActivity: (a: any) => { activity.value = { ...activity.value, [a.agentID]: a }; },
  onActivityEnded: (id: string) => { const next = { ...activity.value }; delete next[id]; activity.value = next; },
});

function retryStewardSoon(delay = 1000) {
  if (stewardRetry) clearTimeout(stewardRetry);
  stewardRetry = setTimeout(() => { stewardRetry = null; refresh(); }, delay);
}
async function loadSteward(): Promise<boolean> {
  try {
    if (!steward.value) loadingStage.value = 'Loading the Steward record…';
    const res = await RequestGETFromKliveAPI(`/demiurge/get?stewardID=${stewardId}`, false, false);
    const routeMissing = res.status === 404 && (await res.clone().text()).includes('Route not found');
    let startingStage = '';
    if (res.status >= 500) {
      try {
        const body = await res.clone().json();
        if (body?.ready === false && body?.failed === true) {
          loadError.value = `${body?.stage || 'Demiurge startup failed'}${body?.error ? `: ${body.error}` : ''}`;
          return false;
        }
        if (body?.ready === false) startingStage = body?.stage ? `${body.stage}…` : 'Waiting for the Demiurge API to finish starting…';
      } catch { /* an unrelated 503 is handled as an ordinary load failure below */ }
    } else if (routeMissing) startingStage = 'Waiting for the Demiurge API to finish starting…';
    if (startingStage) {
      loadError.value = '';
      loadingStage.value = startingStage;
      retryStewardSoon(Number(res.headers.get('Retry-After') || 1) * 1000);
      return false;
    }
    if (!res.ok) {
      loadError.value = res.status === 404 ? 'This Steward does not exist or has been removed.' : `The Steward could not be loaded (HTTP ${res.status}).`;
      return false;
    }
    steward.value = await res.json();
    loadError.value = '';
    loadingStage.value = '';
    return true;
  } catch {
    loadingStage.value = 'Reconnecting to Omnipotent…';
    loadError.value = '';
    retryStewardSoon(1000);
    return false;
  }
}
async function loadJson(path: string, target: { value: any }) {
  try { const r = await RequestGETFromKliveAPI(path, false, false); if (r.ok) target.value = await r.json(); } catch { /* transient */ }
}
const loadDigest = () => loadJson(`/demiurge/digest?stewardID=${stewardId}`, digest);
const loadLedger = () => loadJson(`/demiurge/ledger?stewardID=${stewardId}`, ledger);
const loadAgents = () => loadJson(`/demiurge/agents?stewardID=${stewardId}`, agents);
const loadObservables = () => loadJson(`/demiurge/observables?stewardID=${stewardId}&history=120`, observables);
const loadCouncils = () => loadJson(`/demiurge/councils?stewardID=${stewardId}`, councils);
const loadGrandPlan = () => loadJson(`/demiurge/grandplan?stewardID=${stewardId}`, grandPlan);
async function loadActivity() {
  try {
    const r = await RequestGETFromKliveAPI(`/demiurge/activity?stewardID=${stewardId}`, false, false);
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
  const r = await dmxPost(`/demiurge/${kind}`, { stewardID: stewardId });
  actionBusy.value = false;
  if (!r.ok) { actionError.value = r.error; return; }
  const done = { pause: 'Paused', resume: 'Resumed', archive: 'Shelved', unarchive: 'Unshelved' }[kind];
  toast(r.pending ? `${done.replace(/ed$/, 'ing')}: still settling, this page updates when it lands.` : `${done}.`, r.pending ? 'need' : 'work');
  await loadSteward();
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
  if (!editingBudget.value && steward.value) {
    budgetDraft.value = {
      tokenBudgetUsd: Number(steward.value.tokenBudgetUsd) || 0,
      moneyBudgetUsd: Number(steward.value.moneyBudgetUsd) || 0,
      moneyAutonomousThresholdUsd: Number(steward.value.moneyAutonomousThresholdUsd) || 0,
      subAgentCap: Number(steward.value.subAgentCap) || 1,
    };
  }
  editingBudget.value = !editingBudget.value;
}
async function openBudget() {
  if (!showRail.value) setTab('plan');
  await nextTick();
  if (!editingBudget.value && can.value.manage) toggleBudgetEdit();
  document.getElementById('dmx-budget')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
async function saveBudgets() {
  const d = budgetDraft.value;
  if (!(d.tokenBudgetUsd > 0)) { budgetError.value = 'Model budget must be greater than 0.'; return; }
  if (d.moneyBudgetUsd < 0 || d.moneyAutonomousThresholdUsd < 0) { budgetError.value = 'Money values cannot be negative.'; return; }
  if (!(d.subAgentCap >= 1)) { budgetError.value = 'Agent cap must be at least 1.'; return; }
  budgetSaving.value = true;
  budgetError.value = '';
  try {
    const res = await RequestPOSTFromKliveAPI('/demiurge/budget/update', JSON.stringify({ stewardID: stewardId, ...d }), false, true);
    if (!res.ok) { budgetError.value = `Save failed (HTTP ${res.status}).`; return; }
    const saved = await res.json();
    steward.value = saved;
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
  renameValue.value = steward.value?.name ?? '';
  renaming.value = true;
  nextTick(() => renameInput.value?.focus());
}
async function commitRename() {
  const name = renameValue.value.trim();
  if (!name || name === steward.value?.name) { renaming.value = false; return; }
  renameSaving.value = true;
  const r = await dmxPost('/demiurge/rename', { stewardID: stewardId, name });
  renameSaving.value = false;
  if (!r.ok) { actionError.value = r.error; return; }
  if (r.body) steward.value = r.body;
  renaming.value = false;
}

async function refresh() {
  const firstLoad = !steward.value;
  const loaded = await loadSteward();
  if (!loaded && !steward.value) return;
  if (firstLoad) detailsLoading.value = 'Loading budget, plan, agents and live measurements…';
  await Promise.allSettled([loadDigest(), loadLedger(), loadAgents(), loadObservables(), loadCouncils(), loadGrandPlan(), loadActivity()]);
  detailsLoading.value = '';
}

// Live push refreshes the rail on any Steward event (debounced) instead of a tight poll.
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRefresh() { if (refreshTimer) return; refreshTimer = setTimeout(() => { refreshTimer = null; refresh(); }, 1000); }

const paletteCommands = computed<DmCommand[]>(() => {
  const list: DmCommand[] = tabs.map((t, i) => ({ id: `tab:${t.id}`, title: `${t.label}`, group: 'Go to' as const, icon: t.icon, hint: `tab ${(i + 1) % 10}`, keywords: `${steward.value?.name ?? ''} section`, run: () => setTab(t.id) }));
  const p = steward.value;
  if (p && can.value.manage) {
    if (p.status === 'Active' || p.status === 'Planning') list.unshift({ id: 'pause', title: `Pause ${p.name}`, group: 'Actions', icon: 'pause', keywords: 'stop halt', run: () => runAction('pause') });
    else if (['Paused', 'BudgetPaused', 'Blocked'].includes(p.status)) list.unshift({ id: 'resume', title: `${p.status === 'Blocked' ? 'Unblock' : 'Resume'} ${p.name}`, group: 'Actions', icon: 'play', keywords: 'start continue', run: () => runAction('resume') });
    list.push({ id: 'budget', title: 'Edit budgets', group: 'Actions', icon: 'coins', keywords: 'money cap agents', run: openBudget });
    list.push({ id: 'rename', title: 'Rename Steward', group: 'Actions', icon: 'edit', run: startRename });
  }
  return list;
});

function onKey(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.querySelector('.dmx-layer.dmx-dialog, .dmx-layer.dmx-palette, .dmx-layer.dmx-sheet, .ot-drawer')) return;
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
  if (stewardRetry) clearTimeout(stewardRetry);
  activityStream.disconnect();
  window.removeEventListener('keydown', onKey);
});
</script>

<style scoped>
.pw-chat { height: clamp(460px, calc(100vh - 330px), 900px); overflow: hidden; }
</style>
