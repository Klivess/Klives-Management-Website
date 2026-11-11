<template>
  <div class="conversation-panel">
    <div class="cp-toolbar">
      <div class="pjx-seg" role="group" aria-label="Conversation detail">
        <button type="button" class="pjx-seg__opt" :aria-pressed="detail === 'messages'" @click="detail = 'messages'">Messages</button>
        <button type="button" class="pjx-seg__opt" :aria-pressed="detail === 'everything'" @click="detail = 'everything'">Everything</button>
      </div>
      <span class="cp-count">{{ messageCount }} {{ messageCount === 1 ? 'message' : 'messages' }} · {{ actionCount }} {{ actionCount === 1 ? 'action' : 'actions' }}</span>
    </div>

    <div class="cp-events" ref="scrollEl" @scroll.passive="onScroll">
      <!-- Everything lives in one measurable wrapper so a ResizeObserver can see the list grow when
           a screenshot finishes loading, long after its event was appended. -->
      <div class="cp-inner" ref="innerEl">
        <template v-for="item in items" :key="item.key">
          <div v-if="item.kind === 'event'" class="cp-event" :class="['a-' + item.event.author, 't-' + item.event.type, { pending: item.event._optimistic }]" @click="$emit('select', item.event)">
            <div class="cp-meta">
              <span class="cp-who">{{ whoLabel(item.event) }}</span>
              <span v-if="typeLabel(item.event)" class="cp-type">{{ typeLabel(item.event) }}</span>
              <span class="cp-time">{{ item.event._optimistic ? 'sending…' : time(item.event.timestamp) }}</span>
            </div>
            <div v-if="isProse(item.event)" class="cp-text pj-prose" v-html="renderMarkdown(item.event.text)"></div>
            <div v-else class="cp-text plain">{{ item.event.text }}</div>
            <div v-if="(item.event.artifactIDs || []).length" class="cp-shots">
              <ProjectsArtifactImage v-for="id in item.event.artifactIDs" :key="id" :project-id="projectId" :artifact-id="id" thumb />
            </div>
          </div>

          <div v-else class="cp-burst" :class="['a-' + item.author, { open: isOpen(item) }]">
            <button type="button" class="cp-burst-head" :aria-expanded="isOpen(item)" @click="toggle(item)">
              <ProjectsIcon name="chevron-right" class="cp-burst-caret" />
              <span class="cp-who">{{ item.whoLabel }}</span>
              <span class="cp-burst-title">{{ item.title }}</span>
              <span class="cp-burst-tools">
                <span v-for="t in item.tools" :key="t.name" class="cp-tool-chip" :class="{ failed: t.failed }">{{ t.name }}<template v-if="t.count > 1"> ×{{ t.count }}</template></span>
              </span>
              <span class="cp-time">{{ time(item.start) }}<template v-if="item.end !== item.start">–{{ time(item.end) }}</template></span>
            </button>
            <div v-if="!isOpen(item) && item.lastShot" class="cp-shots cp-burst-preview">
              <ProjectsArtifactImage :project-id="projectId" :artifact-id="item.lastShot" thumb />
            </div>
            <ol v-if="isOpen(item)" class="cp-burst-list">
              <li v-for="e in item.events" :key="e.eventID || e.sequence" :class="'t-' + e.type" @click="$emit('select', e)">
                <template v-if="e.type === 'tool-call' || e.type === 'tool-result'">
                  <code>{{ e.toolName }}</code>
                  <span class="cp-tool-text">{{ e.text }}</span>
                </template>
                <span v-else class="cp-thought">{{ e.text }}</span>
                <div v-if="(e.artifactIDs || []).length" class="cp-shots">
                  <ProjectsArtifactImage v-for="id in e.artifactIDs" :key="id" :project-id="projectId" :artifact-id="id" thumb />
                </div>
              </li>
            </ol>
          </div>
        </template>

        <div v-if="needs.length" class="cp-needs">
          <ProjectsNeedCard v-for="n in needs" :key="n.key" :need="n" :now="now" :busy="resolving" :can-resolve="canResolve" @resolve="onResolve" />
        </div>

        <div v-if="loaded && !items.length && !pendingGates.length && !liveAgents.length" class="cp-empty">
          <ProjectsIcon name="message" />
          <b>No conversation yet</b>
          <span>Say hello to the Commander below, or wait for it to report in.</span>
        </div>

        <!-- Who is mid-turn right now. An agent can spend minutes on one turn, and nothing is written
             to the event log until it finishes: this is the only window into that gap. -->
        <div v-for="a in liveAgents" :key="a.agentID" class="cp-live" :class="'a-' + (a.agentID === 'commander' ? 'commander' : 'agent')">
          <div class="cp-live-head">
            <span class="cp-live-dot" :class="'ph-' + a.phase"></span>
            <span class="cp-who">{{ agentLabel(a) }}</span>
            <span class="cp-live-phase">{{ phaseLabel(a) }}<span class="cp-ellipsis">…</span></span>
            <code v-if="a.toolName" class="cp-live-tool">{{ a.toolName }}</code>
            <span class="cp-live-spacer"></span>
            <span v-if="a.model" class="cp-live-model">{{ shortModel(a.model) }}</span>
            <span class="cp-live-elapsed">{{ elapsed(a) }}</span>
          </div>
          <div v-if="a.phase === 'writing' && a.preview" class="cp-live-preview">{{ a.preview }}</div>
          <div v-else-if="a.detail" class="cp-live-detail">{{ toolArgs(a) }}</div>
        </div>

        <!-- When the Commander is not mid-turn, say why and when it runs next, so a quiet chat never
             reads as being ignored. -->
        <div v-if="commanderStatus" class="cp-status" role="status">
          <span class="pjx-chip" :data-tone="commanderStatus.tone">{{ commanderStatus.label }}</span>
          <span class="cp-who">Commander</span>
          <span class="cp-status-detail">{{ commanderStatus.detail }}</span>
          <span v-if="commanderStatus.next" class="cp-status-next">next {{ commanderStatus.next }}</span>
        </div>
      </div>
    </div>

    <button v-if="!stick" type="button" class="cp-jump" @click="pinToBottom(true)"><ProjectsIcon name="arrow-down" />Latest</button>

    <div v-if="sendError" class="cp-notice bad" role="alert"><ProjectsIcon name="alert" /><span>{{ sendError }}</span><button class="pjx-btn pjx-btn--ghost pjx-btn--xs" @click="sendError = ''">Dismiss</button></div>
    <div v-if="promotionNotice" class="cp-notice warn"><ProjectsIcon name="info" /><span>{{ promotionNotice }}</span><button class="pjx-btn pjx-btn--ghost pjx-btn--xs" @click="promotionNotice = ''">Dismiss</button></div>
    <div class="cp-composer">
      <div class="cp-composer-row">
        <textarea
          ref="inputEl"
          v-model="draft"
          class="pjx-textarea cp-input"
          :disabled="sending"
          rows="1"
          :placeholder="placeholder"
          aria-label="Message the Commander"
          @keydown.enter.exact.prevent="send"
          @input="autosize"
        ></textarea>
        <button class="pjx-btn pjx-btn--primary cp-send" :disabled="sending || !draft.trim()" @click="send"><ProjectsIcon name="arrow-right" />Send</button>
      </div>
      <div class="cp-composer-foot">
        <div class="pjx-seg" role="group" aria-label="Message kind">
          <button type="button" class="pjx-seg__opt" :aria-pressed="kind === 'task'" title="A durable task: it stays on the Commander's books until its deliverable is verified." @click="kind = 'task'">Task</button>
          <button type="button" class="pjx-seg__opt" :aria-pressed="kind === 'steering'" title="Chat: a one-off steer or question; it stays in force briefly, then ages out." @click="kind = 'steering'">Chat</button>
          <button type="button" class="pjx-seg__opt" :aria-pressed="kind === 'rule'" title="Rule: standing policy for every agent. Nothing discharges it but you." @click="kind = 'rule'">Rule</button>
        </div>
        <span class="cp-hint">{{ kindHint }}</span>
        <span class="cp-hint cp-keys"><span class="pjx-kbd">Enter</span> send · <span class="pjx-kbd">Shift</span>+<span class="pjx-kbd">Enter</span> new line</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';
import { useEventStream } from '~/composables/useEventStream';
import { renderMarkdown } from '~/scripts/agentMarkdown';
import ProjectsNeedCard from '~/components/Projects/NeedCard.vue';
import ProjectsIcon from '~/components/Projects/Icon.vue';
import { useAccess } from '~/composables/useAccess';
import { pjxPost, usePjxToasts } from '~/composables/useProjectsConsole';
import type { PjNeed, PjTone } from '~/scripts/projectsConsole';
import ProjectsArtifactImage from '~/components/Projects/ArtifactImage.vue';
import { PJ_SCHEDULE_STATE, pjNextRun, useProjectSchedule } from '~/composables/useProjectsUi';

const props = defineProps<{ projectId: string }>();
const emit = defineEmits<{ (e: 'events', events: any[]): void; (e: 'select', ev: any): void }>();

const events = ref<any[]>([]);
const pendingGates = ref<any[]>([]);
const access = useAccess();
const canResolve = computed(() => access.can('projects.gates.resolve'));
const { toast } = usePjxToasts();
const resolving = ref(false);
// Pending approvals in the same card the fleet board and the overview use, oldest first.
const needs = computed<PjNeed[]>(() => [...pendingGates.value]
  .sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0))
  .map(g => ({ key: g.gateID, kind: 'approval', projectID: props.projectId, projectName: 'This project', label: g.title, since: g.createdAt ?? null, gate: g })));
const draft = ref('');
// Task stays the default (a real request must not be silently downgraded); Chat sends it as one-off
// steering; Rule sends it as standing policy no acknowledgement discharges. Constraint-shaped messages
// are still promoted to Rule automatically on the server, and the composer says so when it happens.
const kind = ref<'task' | 'steering' | 'rule'>('task');
const kindHint = computed(() => kind.value === 'steering'
  ? 'Chat — a steer or question; the Commander answers it and carries on.'
  : kind.value === 'rule'
    ? 'Rule — standing policy for every agent until you revoke it.'
    : 'Task — stays on the Commander’s books until it is delivered.');
const placeholder = computed(() => kind.value === 'rule' ? 'A rule every agent must follow…'
  : kind.value === 'steering' ? 'Ask or steer the Commander…' : 'Give the Commander a task…');
const detail = ref<'messages' | 'everything'>('messages');
const promotionNotice = ref('');
const sending = ref(false);
const sendError = ref('');
const loaded = ref(false);
const scrollEl = ref<HTMLElement | null>(null);
const innerEl = ref<HTMLElement | null>(null);
const inputEl = ref<HTMLTextAreaElement | null>(null);
const since = ref(0);
const seenSeqs = new Set<number>();
const openBursts = ref<Set<string>>(new Set());
let poll: ReturnType<typeof setInterval> | null = null;

const activity = ref<Record<string, any>>({});
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | null = null;
let ro: ResizeObserver | null = null;

const SCHEDULE_EVENTS = new Set(['commander-wake', 'wake-completed', 'wake-waiting', 'wake-deferred', 'wake-failed', 'wake-cancelled']);
const { schedule, reload: reloadSchedule } = useProjectSchedule(() => props.projectId, 15000);

const stream = useEventStream({
  projectId: props.projectId,
  sinceRef: since,
  onEvent: (e: any) => {
    appendEvents([e]);
    if (SCHEDULE_EVENTS.has(e.type) && (!e.agentID || e.agentID === 'commander')) reloadSchedule();
  },
  onActivity: (a: any) => { activity.value = { ...activity.value, [a.agentID]: a }; },
  onActivityEnded: (agentID: string) => {
    const next = { ...activity.value };
    delete next[agentID];
    activity.value = next;
  },
});

const liveAgents = computed(() => Object.values(activity.value)
  .filter((a: any) => now.value - new Date(a.updatedAt).getTime() < 10 * 60 * 1000)
  .sort((a: any, b: any) => {
    if (a.agentID === 'commander') return -1;
    if (b.agentID === 'commander') return 1;
    return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime();
  }));

const commanderStatus = computed(() => {
  if (liveAgents.value.some((a: any) => a.agentID === 'commander')) return null;
  const entry = schedule.value?.agents.find(a => a.agentID === 'commander');
  if (!entry || entry.state === 'working') return null;
  const state = PJ_SCHEDULE_STATE[entry.state] ?? { label: entry.state, tone: '' };
  const tone: PjTone = entry.state === 'waiting' ? 'need' : entry.state === 'held' ? 'fault' : 'rest';
  return {
    label: state.label, tone, detail: entry.detail,
    next: entry.state === 'done' ? '' : pjNextRun(entry.nextWakeAt, now.value),
  };
});

function agentLabel(a: any) {
  if (a.agentID === 'commander') return 'Commander';
  return a.role ? a.role.replace(/-/g, ' ') : 'Agent ' + a.agentID;
}
function phaseLabel(a: any) {
  if (a.phase === 'writing') return 'is writing';
  if (a.phase === 'tool') return 'is running';
  return 'is thinking';
}
function shortModel(model: string) { return model.includes('/') ? model.split('/').pop() : model; }
function toolArgs(a: any) {
  const d = a.detail || '';
  const prefix = (a.toolName || '') + '(';
  return d.startsWith(prefix) && d.endsWith(')') ? d.slice(prefix.length, -1) : d;
}
function elapsed(a: any) {
  const secs = Math.max(0, Math.round((now.value - new Date(a.startedAt).getTime()) / 1000));
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

// Following the bottom is a STATE: screenshot thumbnails load after their event is laid out, so a
// one-shot scroll lands short. `stick` stays true until the reader scrolls up; every growth re-pins.
const stick = ref(true);
const STICK_SLACK = 120;
function onScroll() {
  const el = scrollEl.value;
  if (el) stick.value = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_SLACK;
}
function pinToBottom(force = false) {
  if (force) stick.value = true;
  if (!stick.value) return;
  nextTick(() => { const el = scrollEl.value; if (el) el.scrollTop = el.scrollHeight; });
}
watch(() => liveAgents.value.length, () => pinToBottom());

async function loadActivity() {
  try {
    const res = await RequestGETFromKliveAPI(`/projects/activity?projectID=${props.projectId}`, false, false);
    if (!res.ok) return;
    const list = await res.json();
    const next: Record<string, any> = {};
    for (const a of Array.isArray(list) ? list : []) next[a.agentID] = a;
    activity.value = next;
  } catch { /* transient */ }
}

function appendEvents(batch: any[]) {
  let added = false;
  for (const e of batch) {
    if (typeof e.sequence === 'number') {
      if (seenSeqs.has(e.sequence)) continue;
      seenSeqs.add(e.sequence);
    }
    if (e.type === 'klives-message' && e.author === 'klives') {
      const idx = events.value.findIndex(x => x._optimistic && x.type === 'klives-message' && x.text === e.text);
      if (idx >= 0) events.value.splice(idx, 1);
    }
    events.value.push(e);
    added = true;
    if (e.type === 'approval-requested' || e.type === 'approval-resolved') loadGates();
  }
  if (added) {
    emit('events', events.value);
    pinToBottom();
  }
}

// Chatty internal events stay off the conversation view; the Timeline shows everything. Tool traffic
// and thoughts are folded into work bursts so the messages between them stay readable.
const CHAT_TYPES = new Set(['klives-message', 'commander-message', 'commander-thought', 'tool-call', 'tool-result', 'stimulus', 'approval-requested', 'approval-resolved', 'agent-handover']);
const WORK_TYPES = new Set(['tool-call', 'tool-result', 'commander-thought']);

type Item =
  | { kind: 'event'; key: string; event: any }
  | { kind: 'burst'; key: string; author: string; whoLabel: string; title: string; events: any[]; start: string; end: string;
      tools: { name: string; count: number; failed: boolean }[]; lastShot: string | null };

const items = computed<Item[]>(() => {
  const out: Item[] = [];
  let burst: Extract<Item, { kind: 'burst' }> | null = null;
  const close = () => { if (burst) { finishBurst(burst); out.push(burst); burst = null; } };
  for (const e of events.value) {
    if (!CHAT_TYPES.has(e.type)) continue;
    if (WORK_TYPES.has(e.type)) {
      const author = e.agentID || e.author || 'commander';
      if (!burst || burst.author !== author) {
        close();
        burst = { kind: 'burst', key: 'b-' + (e.sequence ?? e.eventID ?? e.timestamp), author, whoLabel: whoLabel(e),
          title: '', events: [], start: e.timestamp, end: e.timestamp, tools: [], lastShot: null };
      }
      burst.events.push(e);
      burst.end = e.timestamp;
      continue;
    }
    close();
    out.push({ kind: 'event', key: 'e-' + (e.sequence ?? e.eventID ?? e.timestamp + e.type), event: e });
  }
  close();
  return out;
});

function finishBurst(b: Extract<Item, { kind: 'burst' }>) {
  const counts = new Map<string, { name: string; count: number; failed: boolean }>();
  for (const e of b.events) {
    if (e.type === 'tool-call') {
      const name = shortTool(e.toolName || 'tool');
      const entry = counts.get(name) ?? { name, count: 0, failed: false };
      entry.count++;
      counts.set(name, entry);
    } else if (e.type === 'tool-result' && /fail|error|denied|refused/i.test(e.text || '')) {
      const name = shortTool(e.toolName || 'tool');
      const entry = counts.get(name) ?? { name, count: 0, failed: false };
      entry.failed = true;
      counts.set(name, entry);
    }
    for (const id of e.artifactIDs || []) b.lastShot = id;
  }
  b.tools = [...counts.values()].sort((x, y) => y.count - x.count).slice(0, 5);
  const thought = [...b.events].reverse().find(e => e.type === 'commander-thought' && (e.text || '').trim());
  const calls = b.events.filter(e => e.type === 'tool-call').length;
  b.title = thought ? clipLine(thought.text, 140) : `${calls} action${calls === 1 ? '' : 's'}`;
}

function shortTool(name: string) {
  return name.replace(/^computer_/, '').replace(/^klivemail_/, 'mail ').replace(/_/g, ' ');
}
function clipLine(text: string, max: number) {
  const line = (text || '').replace(/\s+/g, ' ').trim();
  return line.length > max ? line.slice(0, max - 1) + '…' : line;
}
function isOpen(item: Extract<Item, { kind: 'burst' }>) { return detail.value === 'everything' || openBursts.value.has(item.key); }
function toggle(item: Extract<Item, { kind: 'burst' }>) {
  const next = new Set(openBursts.value);
  if (next.has(item.key)) next.delete(item.key); else next.add(item.key);
  openBursts.value = next;
}

const messageCount = computed(() => items.value.filter(i => i.kind === 'event').length);
const actionCount = computed(() => events.value.filter(e => e.type === 'tool-call').length);

function isProse(e: any) { return e.type === 'commander-message' || e.type === 'klives-message' || e.type === 'agent-handover'; }
function whoLabel(e: any) {
  if (e.author === 'klives') return 'You';
  if (e.author === 'commander') return 'Commander';
  if (e.author === 'stimulus') return 'Stimulus';
  if (e.author === 'agent') return 'Agent ' + (e.agentID || '');
  return 'System';
}
function typeLabel(e: any) {
  if (e.type === 'commander-message' && typeof e.payloadJson === 'string' && e.payloadJson.includes('"instant":true'))
    return 'instant reply';
  return ({ stimulus: 'stimulus', 'approval-requested': 'approval requested', 'approval-resolved': 'approval resolved', 'agent-handover': 'handover' } as Record<string, string>)[e.type] ?? '';
}
function time(iso: string) { const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); }

function autosize() {
  const el = inputEl.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 220) + 'px';
}

async function loadEvents(initial = false) {
  try {
    const query = initial ? `tail=true&max=500` : `since=${since.value}&max=500`;
    const res = await RequestGETFromKliveAPI(`/projects/events?projectID=${props.projectId}&${query}`, false, false);
    if (!res.ok) return;
    const json = await res.json();
    const batch = Array.isArray(json.events) ? json.events : [];
    if (json.lastSequence && json.lastSequence > since.value) since.value = json.lastSequence;
    appendEvents(batch);
  } catch { /* transient */ }
}

async function loadGates() {
  try {
    const res = await RequestGETFromKliveAPI(`/projects/gates?projectID=${props.projectId}`, false, false);
    if (res.ok) pendingGates.value = await res.json();
  } catch { /* transient */ }
}

async function send() {
  const text = draft.value.trim();
  if (!text || sending.value) return;
  sending.value = true;
  events.value.push({ type: 'klives-message', author: 'klives', text, timestamp: new Date().toISOString(), _optimistic: true });
  emit('events', events.value);
  pinToBottom(true);
  draft.value = '';
  nextTick(autosize);
  const r = await pjxPost<any>('/projects/message', { projectID: props.projectId, text, kind: kind.value });
  sending.value = false;
  if (!r.ok) {
    // The optimistic bubble came off and the words go back in the box: before, a failed message stayed in
    // the thread looking sent while the text was gone.
    const idx = events.value.findIndex(x => x._optimistic && x.text === text);
    if (idx >= 0) events.value.splice(idx, 1);
    emit('events', events.value);
    if (!draft.value.trim()) { draft.value = text; nextTick(autosize); }
    sendError.value = `Your message didn't send: ${r.error} It is back in the box.`;
    return;
  }
  sendError.value = '';
  if (r.body?.receipt?.promotedToRule) {
    promotionNotice.value = 'Saved as a standing rule: it stays in force until you revoke it.';
    setTimeout(() => { promotionNotice.value = ''; }, 9000);
  }
}

async function onResolve(_projectID: string, gateID: string, decision: string, comment: string) {
  if (resolving.value) return;
  resolving.value = true;
  const r = await pjxPost('/projects/gates/resolve', { projectID: props.projectId, gateID, decision, comment });
  resolving.value = false;
  if (!r.ok) { toast(r.error, 'fault', 6000); return; }
  toast(decision === 'Discuss' ? 'Opened a discussion with the Commander.' : decision === 'Approve' ? 'Approved.' : 'Denied.', decision === 'Deny' ? 'need' : 'work');
  await loadGates();
}

onMounted(async () => {
  if (innerEl.value && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => {
      if (!stick.value) return;
      const el = scrollEl.value;
      if (el) el.scrollTop = el.scrollHeight;
    });
    ro.observe(innerEl.value);
  }
  await loadEvents(true);
  loaded.value = true;
  loadGates();
  loadActivity();
  stream.connect();
  clock = setInterval(() => { now.value = Date.now(); }, 1000);
  poll = setInterval(() => { loadEvents(); loadGates(); loadActivity(); }, 30000);
});
onBeforeUnmount(() => {
  if (poll) clearInterval(poll);
  if (clock) clearInterval(clock);
  if (ro) ro.disconnect();
  stream.disconnect();
});
</script>

<style scoped>
.conversation-panel { position: relative; display: flex; flex-direction: column; height: 100%; min-height: 0; }
.cp-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 12px; border-bottom: 1px solid var(--pjx-line); }
.cp-count { color: var(--pjx-ink-3); font-size: 11.5px; }
.cp-events { flex: 1; min-height: 0; overflow-x: hidden; overflow-y: auto; }
.cp-inner { display: flex; flex-direction: column; gap: 8px; padding: 12px; }

.cp-event { min-width: 0; padding: 8px 12px; border: 1px solid var(--pjx-line); border-radius: 12px; background: rgba(168, 176, 214, 0.03); cursor: pointer; transition: border-color 120ms, background 120ms; }
.cp-event:hover { border-color: var(--pjx-line-strong); }
.cp-event.a-klives { align-self: flex-end; max-width: min(86%, 760px); border-color: color-mix(in srgb, var(--pjx-accent) 28%, transparent); background: color-mix(in srgb, var(--pjx-accent) 8%, transparent); }
.cp-event.a-commander { border-left: 3px solid color-mix(in srgb, var(--pjx-work) 55%, transparent); }
.cp-event.a-stimulus { border-left: 3px solid color-mix(in srgb, var(--pjx-need) 55%, transparent); }
.cp-event.t-approval-requested, .cp-event.t-approval-resolved { border-left: 3px solid color-mix(in srgb, var(--pjx-plan) 60%, transparent); }
.cp-event.pending { opacity: 0.65; }
.cp-meta { display: flex; align-items: baseline; gap: 8px; margin-bottom: 3px; color: var(--pjx-ink-3); font-size: 11px; }
.cp-who { color: var(--pjx-ink-2); font-weight: 650; text-transform: capitalize; }
.cp-type { padding: 0 6px; border-radius: 999px; background: rgba(168, 176, 214, 0.08); color: var(--pjx-ink-3); font-size: 10px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
.cp-time { color: var(--pjx-ink-4); font-family: var(--pjx-mono); font-size: 10.5px; white-space: nowrap; }
.cp-text { color: var(--pjx-ink); font-size: 13px; overflow-wrap: anywhere; word-break: break-word; }
.cp-text.plain { color: var(--pjx-ink-2); font-size: 12.5px; white-space: pre-wrap; }
.cp-shots { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px; margin-top: 8px; }
.cp-needs { display: flex; flex-direction: column; gap: 8px; }
.cp-needs :deep(.pjx-need__project) { display: none; }
.cp-needs :deep(.pjx-need__age) { margin-left: auto; }
.cp-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 40px 12px; color: var(--pjx-ink-3); font-size: 12.5px; text-align: center; }
.cp-empty b { color: var(--pjx-ink-2); font-weight: 600; }
.cp-empty :deep(.pjx-icon) { color: var(--pjx-ink-4); font-size: 22px; }

.cp-burst { min-width: 0; border: 1px solid var(--pjx-line); border-radius: 10px; background: rgba(8, 9, 13, 0.25); }
.cp-burst-head { display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0; padding: 6px 10px; color: var(--pjx-ink-2); font-size: 12px; text-align: left; cursor: pointer; }
.cp-burst-head:hover { background: rgba(168, 176, 214, 0.03); }
.cp-burst-caret { flex: none; color: var(--pjx-ink-4); transition: transform 120ms; }
.cp-burst.open .cp-burst-caret { transform: rotate(90deg); }
.cp-burst-title { flex: 1 1 auto; min-width: 0; overflow: hidden; color: var(--pjx-ink-3); text-overflow: ellipsis; white-space: nowrap; }
.cp-burst-tools { display: flex; flex: 0 1 auto; gap: 4px; min-width: 0; overflow: hidden; }
.cp-tool-chip { padding: 0 6px; border-radius: 6px; background: color-mix(in srgb, var(--pjx-accent) 12%, transparent); color: color-mix(in srgb, var(--pjx-accent) 70%, white); font-family: var(--pjx-mono); font-size: 10.5px; white-space: nowrap; }
.cp-tool-chip.failed { background: color-mix(in srgb, var(--pjx-fault) 14%, transparent); color: color-mix(in srgb, var(--pjx-fault) 70%, white); }
.cp-burst-preview { margin-top: 0; padding: 0 10px 8px; }
.cp-burst-list { display: flex; flex-direction: column; gap: 4px; padding: 0 10px 8px 30px; font-size: 12px; }
.cp-burst-list li { color: var(--pjx-ink-2); overflow-wrap: anywhere; cursor: pointer; }
.cp-burst-list li:hover { color: var(--pjx-ink); }
.cp-burst-list code { margin-right: 6px; color: color-mix(in srgb, var(--pjx-accent) 75%, white); font-family: var(--pjx-mono); }
.cp-burst-list .t-tool-result code { color: var(--pjx-info); }
.cp-thought { color: var(--pjx-ink-3); font-style: italic; }
.cp-tool-text { white-space: pre-wrap; }

.cp-status { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; padding: 7px 2px 2px; border-top: 1px dashed var(--pjx-line); color: var(--pjx-ink-3); font-size: 12px; }
.cp-status-detail { min-width: 0; overflow-wrap: anywhere; }
.cp-status-next { margin-left: auto; font-family: var(--pjx-mono); font-size: 11px; }
.cp-live { min-width: 0; padding: 7px 12px; border: 1px dashed var(--pjx-line-strong); border-left: 3px solid var(--pjx-line-strong); border-radius: 10px; background: rgba(168, 176, 214, 0.02); }
.cp-live.a-commander { border-left-color: color-mix(in srgb, var(--pjx-work) 60%, transparent); }
.cp-live.a-agent { border-left-color: color-mix(in srgb, var(--pjx-plan) 60%, transparent); }
.cp-live-head { display: flex; align-items: center; gap: 8px; color: var(--pjx-ink-3); font-size: 11px; }
.cp-live-spacer { flex: 1; }
.cp-live-phase { color: var(--pjx-ink-2); }
.cp-live-tool { color: color-mix(in srgb, var(--pjx-accent) 75%, white); font-family: var(--pjx-mono); font-size: 11px; }
.cp-live-model, .cp-live-elapsed { color: var(--pjx-ink-4); font-family: var(--pjx-mono); }
.cp-live-preview { margin-top: 4px; color: var(--pjx-ink-2); font-size: 12.5px; overflow-wrap: anywhere; white-space: pre-wrap; word-break: break-word; }
.cp-live-detail { margin-top: 4px; color: var(--pjx-ink-3); font-size: 12px; overflow-wrap: anywhere; word-break: break-word; }
.cp-live-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--pjx-info); animation: cp-pulse 1.4s ease-in-out infinite; }
.cp-live-dot.ph-writing { background: var(--pjx-work); animation-duration: 0.9s; }
.cp-live-dot.ph-tool { background: var(--pjx-need); }
.cp-ellipsis { animation: cp-fade 1.4s ease-in-out infinite; }
@keyframes cp-pulse { 0%, 100% { opacity: 0.25; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }
@keyframes cp-fade { 0%, 100% { opacity: 0.2; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .cp-live-dot, .cp-ellipsis { animation: none; opacity: 1; } }

.cp-jump { position: absolute; right: 16px; bottom: 118px; z-index: 2; display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 10px; border: 1px solid var(--pjx-line-strong); border-radius: 999px; background: var(--pjx-surface-3); color: var(--pjx-ink); font-size: 11.5px; font-weight: 600; box-shadow: 0 6px 18px -8px rgba(0, 0, 0, 0.7); cursor: pointer; }
.cp-notice { display: flex; align-items: center; gap: 8px; padding: 5px 12px; border-top: 1px solid var(--pjx-line); font-size: 12px; }
.cp-notice span { flex: 1; min-width: 0; }
.cp-notice.bad { background: color-mix(in srgb, var(--pjx-fault) 10%, transparent); color: color-mix(in srgb, var(--pjx-fault) 60%, white); }
.cp-notice.warn { background: color-mix(in srgb, var(--pjx-need) 10%, transparent); color: color-mix(in srgb, var(--pjx-need) 60%, white); }
.cp-composer { display: flex; flex-direction: column; gap: 7px; padding: 10px 12px; border-top: 1px solid var(--pjx-line); background: rgba(8, 9, 13, 0.3); }
.cp-composer-row { display: flex; align-items: flex-end; gap: 8px; }
.pjx .cp-input { flex: 1; min-width: 0; height: auto; min-height: 38px; max-height: 220px; padding: 8px 10px; line-height: 20px; resize: none; font-size: 13px; }
.pjx .cp-send { height: 38px; }
.cp-composer-foot { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.cp-hint { color: var(--pjx-ink-3); font-size: 11.5px; }
.cp-keys { margin-left: auto; color: var(--pjx-ink-4); }
@media (max-width: 720px) { .cp-keys { display: none; } .cp-event.a-klives { max-width: 100%; } .cp-jump { bottom: 132px; } }
</style>
