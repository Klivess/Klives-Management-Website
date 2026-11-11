<template>
  <div class="pjx-ov">
    <!-- Decisions first: the same inline cards as the fleet board. -->
    <section v-if="gates.length" class="pjx-card" aria-label="Approvals waiting for you">
      <header class="pjx-card__head">
        <h2 class="pjx-card__title"><ProjectsIcon name="inbox" />Waiting for your decision</h2>
        <span class="pjx-card__meta">{{ gates.length }} {{ gates.length === 1 ? 'approval' : 'approvals' }}</span>
      </header>
      <div class="pjx-needs">
        <ProjectsNeedCard v-for="n in needs" :key="n.key" :need="n" :now="now" :busy="resolving" :can-resolve="canResolve" @resolve="resolveGate" />
      </div>
    </section>

    <div class="pjx-ov__grid">
      <div class="pjx-ov__col">
        <!-- ── now ── -->
        <section class="pjx-card" aria-label="Now">
          <header class="pjx-card__head">
            <h2 class="pjx-card__title"><ProjectsIcon name="zap" />Now</h2>
            <span class="pjx-card__meta">{{ nowSubtitle }}</span>
          </header>
          <div class="pjx-card__body pjx-ov__now">
            <p v-if="digest.currentFocus" class="pjx-ov__focus"><span class="pjx-chip" data-tone="info">Focus</span>{{ digest.currentFocus }}</p>
            <div v-if="activeStep" class="pjx-ov__step">
              <div class="pjx-ov__step-head">
                <span class="pjx-chip" data-tone="work">Active step</span>
                <strong>{{ activeStep.title }}</strong>
                <span v-if="activeStep.attempts" class="pjx-dim">· {{ activeStep.attempts }} {{ activeStep.attempts === 1 ? 'attempt' : 'attempts' }}</span>
              </div>
              <p v-if="activeStep.nextConcreteAction" class="pjx-ov__next">Next: {{ activeStep.nextConcreteAction }}</p>
            </div>
            <p v-else-if="!digest.currentFocus" class="pjx-dim" style="font-size: 12.5px">No active step. The Commander sets one when it plans its next move.</p>

            <ul v-if="liveAgents.length" class="pjx-ov__live" aria-label="Agents working right now">
              <li v-for="a in liveAgents" :key="a.agentID">
                <span class="pjx-ov__pulse" :data-phase="a.phase" aria-hidden="true"></span>
                <strong>{{ a.agentID === 'commander' ? 'Commander' : (a.role || a.agentID) }}</strong>
                <span class="pjx-dim">{{ a.phase === 'writing' ? 'is writing' : a.phase === 'tool' ? 'is running' : 'is thinking' }}</span>
                <code v-if="a.toolName" class="pjx-mono">{{ a.toolName }}</code>
                <span class="pjx-ov__elapsed pjx-mono">{{ elapsed(a.startedAt) }}</span>
              </li>
            </ul>
            <ol v-if="nextSteps.length" class="pjx-steps" aria-label="Up next">
              <li v-for="s in nextSteps" :key="s.key">{{ s.text }}</li>
            </ol>
            <!-- Why each agent is or is not working right now, and when it next runs: the timeline shows
                 what happened, this shows what is about to happen. -->
            <ul v-if="scheduleRows.length" class="pjx-ov__schedule" aria-label="Agent schedule">
              <li v-for="row in scheduleRows" :key="row.agentID">
                <span class="pjx-chip" :data-tone="scheduleTone(row.state)">{{ stateOf(row).label }}</span>
                <strong>{{ row.label }}</strong>
                <span class="pjx-dim pjx-truncate" :title="row.detail">{{ row.detail }}</span>
                <span class="pjx-mono pjx-dim pjx-ov__nextrun">{{ row.nextWakeAt && row.state !== 'working' ? `next ${pjNextRun(row.nextWakeAt, now)}` : '' }}</span>
              </li>
            </ul>
            <p v-if="schedule" class="pjx-faint" style="font-size: 11.5px">
              LLM: {{ schedule.router.inFlight }}/{{ schedule.router.slots }} slots busy · {{ schedule.router.waiting }} queued
              · {{ schedule.liveConversations }}/{{ schedule.conversationBudget }} conversations live
              <template v-if="schedule.deferredWakes"> · {{ schedule.deferredWakes }} {{ schedule.deferredWakes === 1 ? 'wake' : 'wakes' }} waiting fleet-wide</template>
            </p>
          </div>
          <footer v-if="lastEvent" class="pjx-card__foot" style="gap: 6px">
            <ProjectsIcon name="clock" />Last event {{ pjAgo(lastEvent.timestamp, now) }} · {{ lastEvent.type }}<template v-if="lastEvent.agentID"> · {{ lastEvent.agentID }}</template>
          </footer>
        </section>

        <!-- ── conversation, with a reply box ── -->
        <section class="pjx-card" aria-label="Recent conversation">
          <header class="pjx-card__head">
            <h2 class="pjx-card__title"><ProjectsIcon name="message" />Recent conversation</h2>
            <div class="pjx-card__tools"><button class="pjx-btn pjx-btn--ghost pjx-btn--sm" @click="$emit('navigate', 'conversation')">Open chat<ProjectsIcon name="arrow-right" /></button></div>
          </header>
          <div class="pjx-card__body">
            <ul v-if="messages.length" class="po-messages pjx-ov__messages">
              <li v-for="m in messages" :key="m.eventID || m.sequence" :data-from="m.author === 'klives' ? 'you' : 'agent'">
                <div class="pjx-ov__msg-head">
                  <strong>{{ m.author === 'klives' ? 'You' : m.author === 'commander' ? 'Commander' : (m.agentID || 'Agent') }}</strong>
                  <span class="pjx-dim">{{ pjAgo(m.timestamp, now) }}</span>
                </div>
                <div class="pj-prose pjx-ov__msg" v-html="renderMarkdown(clip(m.text, 480))"></div>
              </li>
            </ul>
            <p v-else class="pjx-dim" style="font-size: 12.5px">No messages yet. Say hello below, or wait for the Commander to report in.</p>
            <form v-if="canMessage" class="pjx-ov__reply" @submit.prevent="sendMessage">
              <input v-model="draft" class="pjx-input" :disabled="sending" placeholder="Ask or steer the Commander…" aria-label="Message the Commander" />
              <button class="pjx-btn pjx-btn--primary pjx-btn--sm" type="submit" :disabled="sending || !draft.trim()"><ProjectsIcon name="arrow-right" />{{ sending ? 'Sending…' : 'Send' }}</button>
            </form>
          </div>
        </section>

        <!-- ── plan ── -->
        <section class="pjx-card" aria-label="Plan">
          <header class="pjx-card__head">
            <h2 class="pjx-card__title"><ProjectsIcon name="plan" />Plan</h2>
            <span class="pjx-card__meta">{{ planSubtitle }}</span>
            <div class="pjx-card__tools"><button class="pjx-btn pjx-btn--ghost pjx-btn--sm" @click="$emit('navigate', 'plan')">Full plan<ProjectsIcon name="arrow-right" /></button></div>
          </header>
          <div class="pjx-card__body">
            <template v-if="milestones.length">
              <div class="pjx-budget__head" style="margin-bottom: 6px"><span>Milestones</span><b class="pjx-num">{{ milestonesDone }} / {{ milestones.length }}</b></div>
              <div class="pjx-meter" style="margin-bottom: 10px"><span class="pjx-meter__fill" :style="{ width: milestonePct + '%' }"></span></div>
              <ul class="pjx-ov__ms">
                <li v-for="m in milestones.slice(0, 6)" :key="m.id || m.title">
                  <span class="pjx-chip" :data-tone="msTone(m.status)">{{ msLabel(m.status) }}</span>
                  <span>{{ m.title }}</span>
                </li>
              </ul>
            </template>
            <p v-else class="pjx-dim" style="font-size: 12.5px">{{ project.status === 'Planning' ? 'The Commander is drafting a Grand Plan for your approval.' : 'Milestones and steps appear here as the Commander plans.' }}</p>
          </div>
        </section>
      </div>

      <div class="pjx-ov__col">
        <!-- ── computers ── -->
        <section class="pjx-card" aria-label="Computers">
          <header class="pjx-card__head">
            <h2 class="pjx-card__title"><ProjectsIcon name="monitor" />Computers</h2>
            <span class="pjx-card__meta">{{ computers.length ? computersSubtitle : 'none yet' }}</span>
            <div class="pjx-card__tools"><button class="pjx-btn pjx-btn--ghost pjx-btn--sm" @click="$emit('navigate', 'computers')">All<ProjectsIcon name="arrow-right" /></button></div>
          </header>
          <div class="pjx-card__body pjx-ov__computers">
            <ProjectsComputerCard v-for="c in computers.slice(0, 2)" :key="c.containerID" :computer="c" :label="computerLabel(c)"
              show-live compact @control="$emit('navigate', 'computers')" @inspect="$emit('navigate', 'computers')"
              @resume="$emit('navigate', 'computers')" @repair="$emit('navigate', 'computers')" />
            <p v-if="computers.length > 2" class="pjx-dim" style="font-size: 12px">+ {{ computers.length - 2 }} more</p>
            <p v-if="!computers.length" class="pjx-dim" style="font-size: 12.5px">An agent's computer appears the first time it uses a desktop, browser or terminal tool.</p>
          </div>
        </section>

        <!-- ── live values ── -->
        <section class="pjx-card" aria-label="Observables">
          <header class="pjx-card__head">
            <h2 class="pjx-card__title"><ProjectsIcon name="gauge" />Live values</h2>
            <div class="pjx-card__tools"><button class="pjx-btn pjx-btn--ghost pjx-btn--sm" @click="$emit('navigate', 'observables')">All<ProjectsIcon name="arrow-right" /></button></div>
          </header>
          <div class="pjx-card__body">
            <ul v-if="observables.length" class="po-obs pjx-obs">
              <li v-for="o in topObservables" :key="o.observableID">
                <span class="pjx-obs__name" :title="o.description || o.name">{{ o.name }}</span>
                <ProjectsSpark v-if="observableSeries(o).length > 1" :values="observableSeries(o)" :label="`${o.name} history`" />
                <span class="pjx-obs__value">{{ o.displayValue }}</span>
              </li>
            </ul>
            <p v-else class="pjx-dim" style="font-size: 12.5px">Agents publish live values here: balances, followers, items shipped.</p>
          </div>
        </section>

        <!-- ── team ── -->
        <section class="pjx-card" aria-label="Agents">
          <header class="pjx-card__head">
            <h2 class="pjx-card__title"><ProjectsIcon name="users" />Team</h2>
            <span class="pjx-card__meta">{{ agents.length }} on the roster · cap {{ project.subAgentCap }}</span>
            <div class="pjx-card__tools"><button class="pjx-btn pjx-btn--ghost pjx-btn--sm" @click="$emit('navigate', 'agents')">Manage<ProjectsIcon name="arrow-right" /></button></div>
          </header>
          <div class="pjx-card__body">
            <ul v-if="agents.length" class="pjx-ov__team">
              <li v-for="a in agents.slice(0, 8)" :key="a.agentID">
                <span class="pjx-chip__dot" :style="{ background: a.awake ? 'var(--pjx-work)' : 'var(--pjx-ink-4)' }" aria-hidden="true"></span>
                <span class="pjx-ov__role">{{ a.isCommander ? 'Commander' : a.role }}</span>
                <span class="pjx-dim pjx-truncate" :title="a.objective">{{ a.objective }}</span>
                <span class="pjx-faint pjx-mono">{{ a.lastReportAt ? pjAgo(a.lastReportAt, now) : '' }}</span>
              </li>
            </ul>
            <p v-else class="pjx-dim" style="font-size: 12.5px">The Commander recruits agents as the plan needs them.</p>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import ProjectsComputerCard from '~/components/Projects/ComputerCard.vue';
import ProjectsNeedCard from '~/components/Projects/NeedCard.vue';
import ProjectsIcon from '~/components/Projects/Icon.vue';
import ProjectsSpark from '~/components/Projects/Spark.vue';
import { renderMarkdown } from '~/scripts/agentMarkdown';
import { useEventStream } from '~/composables/useEventStream';
import { useAccess } from '~/composables/useAccess';
import { pjxPost, usePjxPoll, usePjxToasts } from '~/composables/useProjectsConsole';
import { PJ_SCHEDULE_STATE, pjAgo, pjGet, pjNextRun, useProjectSchedule, type ProjectsComputer, type ProjectsScheduleEntry } from '~/composables/useProjectsUi';
import { observableSeries, type PjNeed, type PjTone } from '~/scripts/projectsConsole';

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

const access = useAccess();
const canResolve = computed(() => access.can('projects.gates.resolve'));
const canMessage = computed(() => access.can('projects.agents.message'));
const { toast } = usePjxToasts();

const steps = ref<any[]>([]);
const SCHEDULE_EVENTS = new Set(['commander-wake', 'agent-wake', 'wake-completed', 'wake-waiting', 'wake-deferred', 'wake-failed', 'wake-cancelled']);
const { schedule, reload: loadSchedule } = useProjectSchedule(() => props.projectId, 15000);
const scheduleRows = computed<ProjectsScheduleEntry[]>(() => (schedule.value?.agents ?? []).slice(0, 8));
function stateOf(row: ProjectsScheduleEntry) { return PJ_SCHEDULE_STATE[row.state] ?? { label: row.state, tone: '' }; }
function scheduleTone(state: string): PjTone { return state === 'working' ? 'work' : state === 'waiting' ? 'need' : state === 'held' ? 'fault' : 'rest'; }
const gates = ref<any[]>([]);
const computers = ref<ProjectsComputer[]>([]);
const activity = ref<Record<string, any>>({});
const recent = ref<any[]>([]);
const now = ref(Date.now());
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

// Approvals in the fleet board's card shape: oldest first, each with its age.
const needs = computed<PjNeed[]>(() => [...gates.value]
  .sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0))
  .map(g => ({ key: g.gateID, kind: 'approval', projectID: props.projectId, projectName: props.project?.name ?? 'This project', label: g.title, since: g.createdAt ?? null, gate: g })));

const activeStep = computed(() => steps.value.find(s => s.status === 'Active') ?? null);
const stepCounts = computed(() => ({
  total: steps.value.length,
  done: steps.value.filter(s => s.status === 'Done').length,
  blocked: steps.value.filter(s => s.status === 'Blocked').length,
}));
const lastEvent = computed(() => props.events.length ? props.events[props.events.length - 1] : null);
const nextSteps = computed(() => {
  // The ledger's waiting steps are 'Queued' (ProjectStepStatus); this read 'Pending' before and never matched.
  const pending = steps.value.filter(s => s.status === 'Queued')
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).slice(0, 4).map(s => ({ key: s.stepID, text: s.title }));
  if (pending.length) return pending;
  return (props.digest.nextSteps ?? []).slice(0, 4).map((t: string, i: number) => ({ key: 'd' + i, text: t }));
});
const liveAgents = computed(() => Object.values(activity.value)
  .filter((a: any) => now.value - new Date(a.updatedAt).getTime() < 10 * 60 * 1000));
const nowSubtitle = computed(() => {
  if (liveAgents.value.length) return `${liveAgents.value.length} ${liveAgents.value.length === 1 ? 'agent' : 'agents'} working right now`;
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

const content = computed(() => props.grandPlan?.current?.content ?? null);
const milestones = computed<any[]>(() => content.value?.milestones ?? []);
const milestonesDone = computed(() => milestones.value.filter(m => m.status === 'Done').length);
const milestonePct = computed(() => milestones.value.length ? Math.round(100 * milestonesDone.value / milestones.value.length) : 0);
const planSubtitle = computed(() => {
  const blocked = stepCounts.value.blocked ? ` · ${stepCounts.value.blocked} blocked` : '';
  if (props.grandPlan?.current) return `Grand Plan v${props.grandPlan.current.version} · ${stepCounts.value.done}/${stepCounts.value.total} steps done${blocked}`;
  return props.project.status === 'Planning' ? 'Awaiting your approval' : `${stepCounts.value.total} steps in the ledger${blocked}`;
});
function msTone(status: string): PjTone { return status === 'Done' ? 'work' : status === 'InProgress' ? 'info' : status === 'Blocked' ? 'fault' : 'rest'; }
function msLabel(status: string) { return status === 'InProgress' ? 'In progress' : status || 'Pending'; }

const topObservables = computed(() => [...props.observables]
  .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 6));

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

const resolving = ref(false);
async function resolveGate(_projectID: string, gateID: string, decision: string, comment: string) {
  if (resolving.value) return;
  resolving.value = true;
  const r = await pjxPost('/projects/gates/resolve', { projectID: props.projectId, gateID, decision, comment });
  resolving.value = false;
  if (!r.ok) { toast(r.error, 'fault', 6000); return; }
  toast(decision === 'Discuss' ? 'Opened a discussion with the Commander.' : decision === 'Approve' ? 'Approved.' : 'Denied.', decision === 'Deny' ? 'need' : 'work');
  await loadGates();
  emit('changed');
}

// One line to the Commander without leaving the overview; the Chat tab has the full conversation.
const draft = ref('');
const sending = ref(false);
async function sendMessage() {
  const text = draft.value.trim();
  if (!text || sending.value) return;
  sending.value = true;
  // A one-off steer, like the Chat tab's "Chat" kind: it ages out instead of sitting on the Commander's books.
  const r = await pjxPost('/projects/message', { projectID: props.projectId, text, kind: 'steering' });
  sending.value = false;
  if (!r.ok) { toast(r.error, 'fault', 6000); return; }
  draft.value = '';
  recent.value = [...recent.value, { eventID: `local-${Date.now()}`, type: 'klives-message', author: 'klives', text, timestamp: new Date().toISOString() }].slice(-12);
  toast(r.pending ? 'Message queued: the Commander reads it when the project wakes.' : 'Sent to the Commander.', r.pending ? 'need' : 'work');
}

usePjxPoll(() => { loadSteps(); loadGates(); loadComputers(); }, 15000, { immediate: false });
onMounted(() => {
  loadSteps(); loadGates(); loadComputers(); loadActivity();
  stream.connect();
  clock = setInterval(() => { now.value = Date.now(); }, 1000);
});
onBeforeUnmount(() => { if (clock) clearInterval(clock); stream.disconnect(); });
</script>
