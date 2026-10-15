<template>
  <div class="conversation-panel">
    <div class="cp-toolbar">
      <div class="ot-segment sm" role="group" aria-label="Conversation detail">
        <button type="button" :aria-pressed="detail === 'messages'" @click="detail = 'messages'">Messages</button>
        <button type="button" :aria-pressed="detail === 'everything'" @click="detail = 'everything'">Everything</button>
      </div>
      <span class="cp-count pj-muted">{{ messageCount }} message{{ messageCount === 1 ? '' : 's' }} · {{ actionCount }} action{{ actionCount === 1 ? '' : 's' }}</span>
    </div>

    <div class="cp-events" ref="scrollEl" @scroll.passive="onScroll">
      <!-- Everything lives in one measurable wrapper so a ResizeObserver can see the list grow when
           a screenshot finishes loading, long after its event was appended. -->
      <div class="cp-inner" ref="innerEl">
        <template v-for="item in items" :key="item.key">
          <div v-if="item.kind === 'event'" class="cp-event" :class="['a-' + item.event.author, 't-' + item.event.type]" @click="$emit('select', item.event)">
            <div class="cp-meta">
              <span class="cp-who">{{ whoLabel(item.event) }}</span>
              <span v-if="typeLabel(item.event)" class="cp-type">{{ typeLabel(item.event) }}</span>
              <span class="cp-time">{{ time(item.event.timestamp) }}</span>
            </div>
            <div v-if="isProse(item.event)" class="cp-text pj-prose" v-html="renderMarkdown(item.event.text)"></div>
            <div v-else class="cp-text plain">{{ item.event.text }}</div>
            <div v-if="(item.event.artifactIDs || []).length" class="cp-shots">
              <ProjectsArtifactImage v-for="id in item.event.artifactIDs" :key="id" :project-id="projectId" :artifact-id="id" thumb />
            </div>
          </div>

          <div v-else class="cp-burst" :class="['a-' + item.author, { open: isOpen(item) }]">
            <button type="button" class="cp-burst-head" :aria-expanded="isOpen(item)" @click="toggle(item)">
              <span class="cp-burst-caret" aria-hidden="true">{{ isOpen(item) ? '▾' : '▸' }}</span>
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

        <ApprovalCard v-for="g in pendingGates" :key="g.gateID" :gate="g" @resolve="onResolve" />

        <div v-if="loaded && !items.length && !pendingGates.length && !liveAgents.length" class="cp-empty">
          No conversation yet. Say hello to the Commander, or wait for it to report in.
        </div>

        <!-- Who is mid-turn right now. An agent can spend minutes on one turn, and nothing is written
             to the event log until it finishes — this is the only window into that gap. -->
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
      </div>
    </div>

    <div v-if="sendError" class="cp-notice bad">{{ sendError }} <button class="ot-btn ghost sm" @click="sendError = ''">Dismiss</button></div>
    <div v-if="promotionNotice" class="cp-notice warn">{{ promotionNotice }} <button class="ot-btn ghost sm" @click="promotionNotice = ''">Dismiss</button></div>
    <div class="cp-composer">
      <div class="cp-composer-row">
        <textarea
          ref="inputEl"
          v-model="draft"
          class="ot-input cp-input"
          :disabled="sending"
          rows="1"
          :placeholder="placeholder"
          aria-label="Message the Commander"
          @keydown.enter.exact.prevent="send"
          @input="autosize"
        ></textarea>
        <button class="ot-btn primary cp-send" :disabled="sending || !draft.trim()" @click="send">Send</button>
      </div>
      <div class="cp-composer-foot">
        <div class="ot-segment sm" role="group" aria-label="Message kind">
          <button type="button" :aria-pressed="kind === 'task'" title="A durable task: it stays on the Commander's books until its deliverable is verified." @click="kind = 'task'">Task</button>
          <button type="button" :aria-pressed="kind === 'steering'" title="Chat: a one-off steer or question; it stays in force briefly, then ages out." @click="kind = 'steering'">Chat</button>
          <button type="button" :aria-pressed="kind === 'rule'" title="Rule: standing policy for every agent. Nothing discharges it but you." @click="kind = 'rule'">Rule</button>
        </div>
        <span class="cp-hint">{{ kindHint }}</span>
        <span class="cp-hint cp-keys">Enter to send · Shift+Enter for a new line</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import { useEventStream } from '~/composables/useEventStream';
import { renderMarkdown } from '~/scripts/agentMarkdown';
import ApprovalCard from '~/components/Projects/ApprovalCard.vue';
import ProjectsArtifactImage from '~/components/Projects/ArtifactImage.vue';

const props = defineProps<{ projectId: string }>();
const emit = defineEmits<{ (e: 'events', events: any[]): void; (e: 'select', ev: any): void }>();

const events = ref<any[]>([]);
const pendingGates = ref<any[]>([]);
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

const stream = useEventStream({
  projectId: props.projectId,
  sinceRef: since,
  onEvent: (e: any) => { appendEvents([e]); },
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
  try {
    const res = await RequestPOSTFromKliveAPI('/projects/message', JSON.stringify({ projectID: props.projectId, text, kind: kind.value }), false, true);
    if (!res.ok) { sendError.value = "Message didn't send. Try again."; return; }
    try {
      const receipt = (await res.json())?.receipt;
      if (receipt?.promotedToRule) {
        promotionNotice.value = 'Saved as a standing rule — it stays in force until you revoke it.';
        setTimeout(() => { promotionNotice.value = ''; }, 9000);
      }
    } catch { /* the message landed; the notice is a nicety */ }
  } catch { sendError.value = "Message didn't send. Try again."; }
  finally { sending.value = false; }
}

async function onResolve(gateID: string, decision: string, comment: string) {
  await RequestPOSTFromKliveAPI('/projects/gates/resolve',
    JSON.stringify({ projectID: props.projectId, gateID, decision, comment }), false, true);
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
.conversation-panel { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.cp-toolbar { display: flex; align-items: center; justify-content: space-between; gap: var(--ot-space-3); padding: var(--ot-space-2) var(--ot-space-3); border-bottom: 1px solid var(--ot-line); }
.cp-count { font-size: 11.5px; }
.cp-events { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; }
.cp-inner { padding: var(--ot-space-3); display: flex; flex-direction: column; gap: var(--ot-space-2); }

.cp-event { min-width: 0; padding: var(--ot-space-2) var(--ot-space-3); border-radius: var(--ot-radius-sm); background: var(--ot-surface-2); border-left: 3px solid var(--ot-line-strong); cursor: pointer; }
.cp-event:hover { background: var(--ot-surface-3); }
.cp-event.a-klives { border-left-color: var(--ot-info); background: rgba(99, 200, 234, 0.06); }
.cp-event.a-commander { border-left-color: var(--ot-accent); }
.cp-event.a-stimulus { border-left-color: var(--ot-warning); }
.cp-event.t-approval-requested, .cp-event.t-approval-resolved { border-left-color: var(--ot-violet); }
.cp-meta { display: flex; gap: var(--ot-space-2); align-items: baseline; font-size: 11px; color: var(--ot-muted); margin-bottom: 3px; }
.cp-who { font-weight: 650; color: var(--ot-text-2); text-transform: capitalize; }
.cp-type { text-transform: uppercase; letter-spacing: 0.6px; font-size: 10px; }
.cp-time { font-family: var(--ot-mono); font-size: 10.5px; color: var(--ot-muted); white-space: nowrap; }
.cp-text { font-size: 13.5px; color: var(--ot-text); overflow-wrap: anywhere; word-break: break-word; }
.cp-text.plain { white-space: pre-wrap; font-size: 12.5px; color: var(--ot-text-2); }
.cp-shots { display: flex; flex-wrap: wrap; gap: var(--ot-space-2); align-items: flex-start; margin-top: var(--ot-space-2); }
.cp-empty { color: var(--ot-muted); font-size: 13px; text-align: center; padding: var(--ot-space-6) var(--ot-space-3); }

.cp-burst { min-width: 0; border-radius: var(--ot-radius-sm); border: 1px solid var(--ot-line); background: rgba(255, 255, 255, 0.015); }
.cp-burst-head { display: flex; align-items: center; gap: var(--ot-space-2); width: 100%; padding: 6px var(--ot-space-3); text-align: left; cursor: pointer; font-size: 12px; color: var(--ot-text-2); min-width: 0; }
.cp-burst-head:hover { background: rgba(255, 255, 255, 0.03); }
.cp-burst-caret { color: var(--ot-muted); width: 10px; flex: 0 0 auto; }
.cp-burst-title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ot-text-2); }
.cp-burst-tools { display: flex; gap: 4px; flex: 0 1 auto; min-width: 0; overflow: hidden; }
.cp-tool-chip { font-family: var(--ot-mono); font-size: 10.5px; padding: 0 5px; border-radius: 4px; background: var(--ot-accent-soft); color: var(--ot-accent); white-space: nowrap; }
.cp-tool-chip.failed { background: var(--ot-negative-soft); color: var(--ot-negative); }
.cp-burst-preview { padding: 0 var(--ot-space-3) var(--ot-space-2); margin-top: 0; }
.cp-burst-list { list-style: none; margin: 0; padding: 0 var(--ot-space-3) var(--ot-space-2) calc(var(--ot-space-3) + 18px); display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.cp-burst-list li { cursor: pointer; overflow-wrap: anywhere; color: var(--ot-text-2); }
.cp-burst-list li:hover { color: var(--ot-text); }
.cp-burst-list code { font-family: var(--ot-mono); color: var(--ot-accent); margin-right: 6px; }
.cp-burst-list .t-tool-result code { color: var(--ot-info); }
.cp-thought { font-style: italic; color: var(--ot-text-2); }
.cp-tool-text { white-space: pre-wrap; }

.cp-live { min-width: 0; padding: 7px var(--ot-space-3); border-radius: var(--ot-radius-sm); background: rgba(255,255,255,0.015); border: 1px dashed var(--ot-line-strong); border-left: 3px solid var(--ot-line-strong); }
.cp-live.a-commander { border-left-color: var(--ot-accent); }
.cp-live.a-agent { border-left-color: var(--ot-violet); }
.cp-live-head { display: flex; align-items: center; gap: var(--ot-space-2); font-size: 11px; color: var(--ot-muted); }
.cp-live-spacer { flex: 1; }
.cp-live-phase { color: var(--ot-text-2); }
.cp-live-tool { color: var(--ot-accent); font-size: 11px; font-family: var(--ot-mono); }
.cp-live-model, .cp-live-elapsed { color: var(--ot-muted); font-family: var(--ot-mono); }
.cp-live-preview { margin-top: 4px; font-size: 12.5px; color: var(--ot-text-2); white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
.cp-live-detail { margin-top: 4px; font-size: 12px; color: var(--ot-muted); overflow-wrap: anywhere; word-break: break-word; }
.cp-live-dot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; background: var(--ot-info); animation: cp-pulse 1.4s ease-in-out infinite; }
.cp-live-dot.ph-writing { background: var(--ot-accent); animation-duration: 0.9s; }
.cp-live-dot.ph-tool { background: var(--ot-warning); }
.cp-ellipsis { animation: cp-fade 1.4s ease-in-out infinite; }
@keyframes cp-pulse { 0%, 100% { opacity: 0.25; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }
@keyframes cp-fade { 0%, 100% { opacity: 0.2; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .cp-live-dot, .cp-ellipsis { animation: none; opacity: 1; } }

.cp-notice { display: flex; justify-content: space-between; align-items: center; gap: var(--ot-space-2); font-size: 12px; padding: 4px var(--ot-space-3); border-top: 1px solid var(--ot-line); }
.cp-notice.bad { background: var(--ot-negative-soft); color: #ffcaca; }
.cp-notice.warn { background: var(--ot-warning-soft); color: #ffe6b0; }
.cp-composer { display: flex; flex-direction: column; gap: 6px; padding: var(--ot-space-3); border-top: 1px solid var(--ot-line); background: var(--ot-surface); }
.cp-composer-row { display: flex; gap: var(--ot-space-2); align-items: flex-end; }
.cp-input { flex: 1; min-width: 0; height: auto; min-height: 38px; max-height: 220px; resize: none; line-height: 20px; padding: 8px 10px; }
.cp-send { height: 38px; }
.cp-composer-foot { display: flex; align-items: center; gap: var(--ot-space-3); flex-wrap: wrap; }
.cp-hint { font-size: 11.5px; color: var(--ot-muted); }
.cp-keys { margin-left: auto; }
@media (max-width: 720px) { .cp-keys { display: none; } }
</style>
