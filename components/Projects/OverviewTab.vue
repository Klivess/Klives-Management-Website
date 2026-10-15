<template>
  <div class="pj-overview">
    <section v-if="gates.length" class="pj-section po-approvals" aria-label="Approvals waiting for you">
      <h2 class="ot-sectionhead">Waiting for your decision</h2>
      <ProjectsApprovalCard v-for="g in gates" :key="g.gateID" :gate="g" @resolve="resolveGate" />
    </section>

    <section class="ot-kpis po-kpis" aria-label="Project at a glance">
      <OmniTraderKpi label="Model spend" :value="pjMoney(ledger.tokenSpendUsd)"
        :tone="tokenPct >= 100 ? 'bad' : tokenPct >= 80 ? 'warn' : ''"
        :foot="`${tokenPct.toFixed(0)}% of ${pjMoney(project.tokenBudgetUsd)} budget`" :attention-soft="tokenPct >= 80 && tokenPct < 100" :attention="tokenPct >= 100" />
      <OmniTraderKpi label="External spend" :value="pjMoney(ledger.moneySpendUsd)"
        :foot="`${pjMoney(project.moneyBudgetUsd)} budget · ≤ ${pjMoney(project.moneyAutonomousThresholdUsd)} per action without asking`" />
      <OmniTraderKpi label="Steps delivered" :value="`${stepCounts.done}`" :foot="stepCounts.total ? `${stepCounts.open} queued · ${stepCounts.blocked} blocked` : 'no step ledger yet'" />
      <OmniTraderKpi label="Agents" :value="`${workingAgents.length} / ${agents.length || 1}`"
        :foot="`working now · cap ${project.subAgentCap}`" :tone="workingAgents.length ? 'good' : ''" />
      <OmniTraderKpi v-if="primary" :label="primary.name" :value="primary.displayValue" small
        :spark="primarySpark" :foot="`updated ${pjAgo(primary.updatedAt, now)}`" />
      <OmniTraderKpi label="Last activity" :value="lastActivityLabel" small :foot="lastActivityFoot" />
    </section>

    <div class="pj-main">
      <div class="ot-stack">
        <OmniTraderCard title="Now" :subtitle="nowSubtitle">
          <div class="po-now">
            <p v-if="digest.currentFocus" class="po-focus"><span class="ot-chip info">Focus</span> {{ digest.currentFocus }}</p>
            <div v-if="activeStep" class="po-step">
              <div class="po-step-head">
                <span class="ot-chip ok">Active step</span>
                <strong>{{ activeStep.title }}</strong>
                <span v-if="activeStep.attempts" class="pj-muted">· {{ activeStep.attempts }} attempt{{ activeStep.attempts === 1 ? '' : 's' }}</span>
              </div>
              <p v-if="activeStep.nextConcreteAction" class="po-next">Next: {{ activeStep.nextConcreteAction }}</p>
            </div>
            <p v-else-if="!digest.currentFocus" class="pj-muted po-empty">No active step. The Commander sets one when it plans its next move.</p>

            <ul v-if="liveAgents.length" class="po-live" aria-label="Agents working right now">
              <li v-for="a in liveAgents" :key="a.agentID">
                <span class="po-live-dot" :class="'ph-' + a.phase" aria-hidden="true"></span>
                <strong>{{ a.agentID === 'commander' ? 'Commander' : (a.role || a.agentID) }}</strong>
                <span class="pj-muted">{{ a.phase === 'writing' ? 'is writing' : a.phase === 'tool' ? 'is running' : 'is thinking' }}</span>
                <code v-if="a.toolName">{{ a.toolName }}</code>
                <span class="po-live-el pj-mono">{{ elapsed(a.startedAt) }}</span>
              </li>
            </ul>
            <ol v-if="nextSteps.length" class="po-queue">
              <li v-for="s in nextSteps" :key="s.key">{{ s.text }}</li>
            </ol>
            <!-- Why each agent is or is not working right now, and when it next runs: the timeline shows
                 what happened, this shows what is about to happen. -->
            <ul v-if="scheduleRows.length" class="po-schedule" aria-label="Agent schedule">
              <li v-for="row in scheduleRows" :key="row.agentID">
                <span class="ot-chip" :class="stateOf(row).tone">{{ stateOf(row).label }}</span>
                <strong>{{ row.label }}</strong>
                <span class="pj-muted po-schedule-detail">{{ row.detail }}</span>
                <span v-if="row.nextWakeAt && row.state !== 'working'" class="pj-mono pj-muted po-schedule-next">next {{ pjNextRun(row.nextWakeAt, now) }}</span>
              </li>
            </ul>
            <p v-if="schedule" class="pj-muted po-capacity">
              LLM: {{ schedule.router.inFlight }}/{{ schedule.router.slots }} slots busy · {{ schedule.router.waiting }} queued
              · {{ schedule.liveConversations }}/{{ schedule.conversationBudget }} conversations live
              <template v-if="schedule.deferredWakes"> · {{ schedule.deferredWakes }} wake{{ schedule.deferredWakes === 1 ? '' : 's' }} waiting fleet-wide</template>
            </p>
          </div>
        </OmniTraderCard>

        <OmniTraderCard title="Recent conversation" :empty="!messages.length" empty-title="No messages yet"
          empty-text="Say hello to the Commander from Chat, or wait for it to report in.">
          <template #controls><button class="ot-btn ghost sm" @click="$emit('navigate', 'conversation')">Open chat →</button></template>
          <ul class="po-messages">
            <li v-for="m in messages" :key="m.eventID || m.sequence" :class="m.author === 'klives' ? 'from-klives' : 'from-agent'">
              <div class="po-msg-head">
                <strong>{{ m.author === 'klives' ? 'You' : m.author === 'commander' ? 'Commander' : (m.agentID || 'Agent') }}</strong>
                <span class="pj-muted">{{ pjAgo(m.timestamp, now) }}</span>
              </div>
              <div class="pj-prose" v-html="renderMarkdown(clip(m.text, 900))"></div>
            </li>
          </ul>
        </OmniTraderCard>

        <OmniTraderCard title="Plan" :subtitle="planSubtitle" :empty="!milestones.length && !steps.length"
          empty-title="No plan yet" :empty-text="project.status === 'Planning' ? 'The Commander is drafting a Grand Plan for your approval.' : 'Milestones and steps appear here as the Commander plans.'">
          <template #controls><button class="ot-btn ghost sm" @click="$emit('navigate', 'plan')">Full plan →</button></template>
          <div v-if="milestones.length" class="po-milestones">
            <div class="ot-meter">
              <div class="row"><span class="lbl">Milestones</span><span class="val">{{ milestonesDone }} / {{ milestones.length }}</span></div>
              <div class="track"><div class="fill" :style="{ width: milestonePct + '%' }"></div></div>
            </div>
            <ul class="po-ms-list">
              <li v-for="m in milestones.slice(0, 6)" :key="m.id || m.title">
                <span class="ot-chip" :class="msTone(m.status)">{{ msLabel(m.status) }}</span>
                <span>{{ m.title }}</span>
              </li>
            </ul>
          </div>
        </OmniTraderCard>
      </div>

      <div class="ot-stack">
        <OmniTraderCard title="Computers" :subtitle="computersSubtitle" :empty="!computers.length"
          empty-title="No computers yet" empty-text="An agent's computer appears the first time it uses a desktop, browser or terminal tool.">
          <template #controls><button class="ot-btn ghost sm" @click="$emit('navigate', 'computers')">All →</button></template>
          <div class="po-computers">
            <ProjectsComputerCard v-for="c in computers.slice(0, 2)" :key="c.containerID" :computer="c" :label="computerLabel(c)"
              show-live compact @control="$emit('navigate', 'computers')" @inspect="$emit('navigate', 'computers')"
              @resume="$emit('navigate', 'computers')" @repair="$emit('navigate', 'computers')" />
            <p v-if="computers.length > 2" class="pj-muted po-more">+ {{ computers.length - 2 }} more</p>
          </div>
        </OmniTraderCard>

        <OmniTraderCard title="Observables" :empty="!observables.length" empty-title="No observables yet"
          empty-text="Agents publish live values here — balances, followers, items shipped.">
          <template #controls><button class="ot-btn ghost sm" @click="$emit('navigate', 'observables')">All →</button></template>
          <ul class="po-obs">
            <li v-for="o in topObservables" :key="o.observableID">
              <span class="po-obs-name" :title="o.description || o.name">{{ o.name }}</span>
              <ProjectsObservableSparkline v-if="o.type === 'Numeric' && o.history && o.history.length > 1" :samples="o.history" :width="64" :height="18" />
              <span class="po-obs-val pj-mono">{{ o.displayValue }}</span>
            </li>
          </ul>
        </OmniTraderCard>

        <OmniTraderCard title="Agents" :subtitle="`${agents.length} on the roster · cap ${project.subAgentCap}`" :empty="!agents.length">
          <template #controls><button class="ot-btn ghost sm" @click="$emit('navigate', 'agents')">Manage →</button></template>
          <ul class="po-team">
            <li v-for="a in agents.slice(0, 8)" :key="a.agentID">
              <span class="ot-dot" :class="a.awake ? 'ok' : ''" aria-hidden="true"></span>
              <span class="po-team-role">{{ a.isCommander ? 'Commander' : a.role }}</span>
              <span class="pj-muted po-team-obj" :title="a.objective">{{ a.objective }}</span>
              <span class="pj-muted pj-mono">{{ a.lastReportAt ? pjAgo(a.lastReportAt, now) : '' }}</span>
            </li>
          </ul>
        </OmniTraderCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import ProjectsApprovalCard from '~/components/Projects/ApprovalCard.vue';
import ProjectsComputerCard from '~/components/Projects/ComputerCard.vue';
import ProjectsObservableSparkline from '~/components/Projects/ObservableSparkline.vue';
import { renderMarkdown } from '~/scripts/agentMarkdown';
import { RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import { useEventStream } from '~/composables/useEventStream';
import { PJ_SCHEDULE_STATE, pjAgo, pjGet, pjMoney, pjNextRun, useProjectSchedule, type ProjectsComputer, type ProjectsScheduleEntry } from '~/composables/useProjectsUi';

const props = defineProps<{
  projectId: string;
  project: any;
  digest: any;
  ledger: any;
  agents: any[];
  observables: any[];
  grandPlan: any;
  events: any[];
}>();
const emit = defineEmits<{ navigate: [tab: string]; changed: [] }>();

const steps = ref<any[]>([]);
const SCHEDULE_EVENTS = new Set(['commander-wake', 'agent-wake', 'wake-completed', 'wake-waiting', 'wake-deferred', 'wake-failed', 'wake-cancelled']);
const { schedule, reload: loadSchedule } = useProjectSchedule(() => props.projectId, 15000);
const scheduleRows = computed<ProjectsScheduleEntry[]>(() => (schedule.value?.agents ?? []).slice(0, 8));
function stateOf(row: ProjectsScheduleEntry) { return PJ_SCHEDULE_STATE[row.state] ?? { label: row.state, tone: '' }; }
const gates = ref<any[]>([]);
const computers = ref<ProjectsComputer[]>([]);
const activity = ref<Record<string, any>>({});
const recent = ref<any[]>([]);
const now = ref(Date.now());
let poll: ReturnType<typeof setInterval> | null = null;
let clock: ReturnType<typeof setInterval> | null = null;

const stream = useEventStream({
  projectId: props.projectId,
  onActivity: (a: any) => { activity.value = { ...activity.value, [a.agentID]: a }; },
  onActivityEnded: (id: string) => { const next = { ...activity.value }; delete next[id]; activity.value = next; },
  onEvent: (e: any) => {
    if (e.type === 'commander-message' || e.type === 'klives-message') recent.value = [...recent.value, e].slice(-12);
    if (e.type === 'approval-requested' || e.type === 'approval-resolved') loadGates();
    if (SCHEDULE_EVENTS.has(e.type)) loadSchedule();
  },
});

const tokenPct = computed(() => props.project.tokenBudgetUsd > 0 ? 100 * (props.ledger.tokenSpendUsd || 0) / props.project.tokenBudgetUsd : 0);
const stepCounts = computed(() => ({
  total: steps.value.length,
  done: steps.value.filter(s => s.status === 'Done').length,
  open: steps.value.filter(s => s.status === 'Pending' || s.status === 'Active').length,
  blocked: steps.value.filter(s => s.status === 'Blocked').length,
}));
const activeStep = computed(() => steps.value.find(s => s.status === 'Active') ?? null);
const nextSteps = computed(() => {
  const pending = steps.value.filter(s => s.status === 'Pending').slice(0, 4).map(s => ({ key: s.stepID, text: s.title }));
  if (pending.length) return pending;
  return (props.digest.nextSteps ?? []).slice(0, 4).map((t: string, i: number) => ({ key: 'd' + i, text: t }));
});
const liveAgents = computed(() => Object.values(activity.value)
  .filter((a: any) => now.value - new Date(a.updatedAt).getTime() < 10 * 60 * 1000));
const workingAgents = computed(() => props.agents.filter(a => a.awake));
const nowSubtitle = computed(() => {
  if (liveAgents.value.length) return `${liveAgents.value.length} agent${liveAgents.value.length === 1 ? '' : 's'} working right now`;
  const commander = schedule.value?.agents.find(a => a.agentID === 'commander');
  if (commander && commander.state !== 'working' && props.project.status === 'Active')
    return commander.state === 'waiting' ? 'Commander is waiting for an LLM slot'
      : commander.state === 'held' ? 'Commander is held by a provider backoff'
      : commander.nextWakeAt ? `Commander asleep · next check-in ${pjNextRun(commander.nextWakeAt, now.value)}` : 'Commander asleep';
  return props.project.status === 'Active' ? 'Idle until the next stimulus or keepalive' : `Project is ${String(props.project.status).toLowerCase()}`;
});

const messages = computed(() => {
  const merged = [...props.events.filter(e => e.type === 'commander-message' || e.type === 'klives-message'), ...recent.value];
  const seen = new Set<string>();
  return merged.filter(e => { const k = String(e.sequence ?? e.eventID ?? e.timestamp); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .slice(-4);
});
const lastEvent = computed(() => props.events.length ? props.events[props.events.length - 1] : null);
const lastActivityLabel = computed(() => lastEvent.value ? pjAgo(lastEvent.value.timestamp, now.value) : '—');
const lastActivityFoot = computed(() => lastEvent.value ? `${lastEvent.value.type}${lastEvent.value.agentID ? ' · ' + lastEvent.value.agentID : ''}` : 'no events yet');

const content = computed(() => props.grandPlan?.current?.content ?? null);
const milestones = computed<any[]>(() => content.value?.milestones ?? []);
const milestonesDone = computed(() => milestones.value.filter(m => m.status === 'Done').length);
const milestonePct = computed(() => milestones.value.length ? Math.round(100 * milestonesDone.value / milestones.value.length) : 0);
const planSubtitle = computed(() => props.grandPlan?.current
  ? `Grand Plan v${props.grandPlan.current.version} · ${stepCounts.value.done}/${stepCounts.value.total} steps done`
  : props.project.status === 'Planning' ? 'Awaiting your approval' : `${stepCounts.value.total} steps in the ledger`);
function msTone(status: string) { return status === 'Done' ? 'ok' : status === 'InProgress' ? 'info' : status === 'Blocked' ? 'bad' : ''; }
function msLabel(status: string) { return status === 'InProgress' ? 'In progress' : status || 'Pending'; }

const topObservables = computed(() => [...props.observables]
  .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 6));
const primary = computed(() => topObservables.value.find(o => o.type === 'Numeric') ?? null);
const primarySpark = computed(() => (primary.value?.history ?? []).map((h: any) => Number(h.value)).filter((v: number) => !Number.isNaN(v)).slice(-30));

const computersSubtitle = computed(() => {
  const running = computers.value.filter(c => c.state === 'running' || c.state === 'degraded').length;
  return `${running} running · ${computers.value.length - running} resting`;
});
function computerLabel(c: ProjectsComputer) {
  if (!c.agentID || c.agentID === 'shared') return 'Shared desktop';
  if (c.agentID === 'commander') return 'Commander';
  return props.agents.find(a => a.agentID === c.agentID)?.role ?? c.agentID;
}

function elapsed(startedAt: string) {
  const secs = Math.max(0, Math.round((now.value - new Date(startedAt).getTime()) / 1000));
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
}
function clip(text: string, max: number) { return (text || '').length > max ? text.slice(0, max) + '…' : text || ''; }

async function loadSteps() { const r = await pjGet<any>(`/projects/steps?projectID=${props.projectId}`); if (r?.steps) steps.value = r.steps; }
async function loadGates() { const r = await pjGet<any[]>(`/projects/gates?projectID=${props.projectId}`); if (Array.isArray(r)) gates.value = r; }
async function loadComputers() { const r = await pjGet<ProjectsComputer[]>(`/projects/computers/list?projectID=${props.projectId}`); if (Array.isArray(r)) computers.value = r; }
async function loadActivity() {
  const r = await pjGet<any[]>(`/projects/activity?projectID=${props.projectId}`);
  if (Array.isArray(r)) activity.value = Object.fromEntries(r.map(a => [a.agentID, a]));
}
async function resolveGate(gateID: string, decision: string, comment: string) {
  await RequestPOSTFromKliveAPI('/projects/gates/resolve', JSON.stringify({ projectID: props.projectId, gateID, decision, comment }), false, true);
  await loadGates();
  emit('changed');
}

onMounted(() => {
  loadSteps(); loadGates(); loadComputers(); loadActivity();
  stream.connect();
  poll = setInterval(() => { loadSteps(); loadGates(); loadComputers(); }, 15000);
  clock = setInterval(() => { now.value = Date.now(); }, 1000);
});
onBeforeUnmount(() => { if (poll) clearInterval(poll); if (clock) clearInterval(clock); stream.disconnect(); });
</script>

<style scoped>
.po-schedule { list-style: none; margin: 0; padding: var(--ot-space-2) 0 0; border-top: 1px solid var(--ot-line); display: flex; flex-direction: column; gap: 6px; }
.po-schedule li { display: grid; grid-template-columns: auto minmax(70px, auto) minmax(0, 1fr) auto; gap: var(--ot-space-2); align-items: baseline; font-size: 12.5px; }
.po-schedule-detail { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.po-schedule-next { font-size: 11.5px; white-space: nowrap; }
.po-capacity { margin: 0; font-size: 11.5px; }
@media (max-width: 720px) { .po-schedule li { grid-template-columns: auto minmax(0, 1fr); } .po-schedule-detail, .po-schedule-next { grid-column: 1 / -1; white-space: normal; } }
.po-approvals { display: flex; flex-direction: column; gap: var(--ot-space-2); }
.po-kpis { grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
.po-now { display: flex; flex-direction: column; gap: var(--ot-space-3); }
.po-focus { margin: 0; font-size: 13.5px; line-height: 20px; display: flex; gap: var(--ot-space-2); align-items: baseline; }
.po-step { border-left: 2px solid var(--ot-accent); padding-left: var(--ot-space-3); }
.po-step-head { display: flex; align-items: center; gap: var(--ot-space-2); flex-wrap: wrap; font-size: 13.5px; }
.po-next { margin: var(--ot-space-1) 0 0; font-size: 12.5px; color: var(--ot-text-2); }
.po-empty { margin: 0; font-size: 12.5px; }
.po-live { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; }
.po-live li { display: flex; align-items: center; gap: var(--ot-space-2); min-width: 0; }
.po-live code { font-family: var(--ot-mono); font-size: 11.5px; color: var(--ot-accent); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.po-live-el { margin-left: auto; color: var(--ot-muted); font-size: 11px; }
.po-live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ot-info); flex: 0 0 auto; animation: po-pulse 1.4s ease-in-out infinite; }
.po-live-dot.ph-writing { background: var(--ot-accent); }
.po-live-dot.ph-tool { background: var(--ot-warning); }
@keyframes po-pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
.po-queue { margin: 0; padding-left: 20px; font-size: 12.5px; color: var(--ot-text-2); display: flex; flex-direction: column; gap: 3px; }
.po-messages { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ot-space-3); }
.po-messages li { padding-left: var(--ot-space-3); border-left: 2px solid var(--ot-line-strong); }
.po-messages li.from-klives { border-left-color: var(--ot-info); }
.po-messages li.from-agent { border-left-color: var(--ot-accent); }
.po-msg-head { display: flex; gap: var(--ot-space-2); align-items: baseline; font-size: 12px; margin-bottom: 2px; }
.po-milestones { display: flex; flex-direction: column; gap: var(--ot-space-3); }
.po-ms-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; }
.po-ms-list li { display: flex; gap: var(--ot-space-2); align-items: center; }
.po-computers { display: flex; flex-direction: column; gap: var(--ot-space-3); }
.po-more { margin: 0; font-size: 12px; }
.po-obs, .po-team { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 12.5px; }
.po-obs li { display: flex; align-items: center; gap: var(--ot-space-2); }
.po-obs-name { flex: 1; min-width: 0; color: var(--ot-text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.po-obs-val { font-weight: 600; }
.po-team li { display: grid; grid-template-columns: 10px minmax(70px, auto) minmax(0, 1fr) auto; gap: var(--ot-space-2); align-items: center; }
.po-team-role { font-weight: 600; text-transform: capitalize; white-space: nowrap; }
.po-team-obj { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
