<template>
  <div class="conversation-panel">
    <div class="cp-events" ref="scrollEl">
      <div
        v-for="e in visibleEvents" :key="e.eventID"
        class="cp-event" :class="'a-' + e.author"
        @click="$emit('select', e)"
      >
        <div class="cp-meta">
          <span class="cp-who">{{ whoLabel(e) }}</span>
          <span class="cp-type">{{ e.type }}</span>
          <span class="cp-time">{{ time(e.timestamp) }}</span>
        </div>
        <div v-if="e.type === 'tool-call' || e.type === 'tool-result'" class="cp-tool">
          <code>{{ e.toolName }}</code> {{ e.text }}
        </div>
        <div v-else class="cp-text">{{ e.text }}</div>
        <!-- A single computer action can return several frames; row them up so a multi-frame result
             costs one thumbnail of height, not one per frame. -->
        <div v-if="(e.artifactIDs || []).length" class="cp-shots">
          <ProjectsArtifactImage
            v-for="id in e.artifactIDs"
            :key="id"
            :project-id="projectId"
            :artifact-id="id"
            thumb
          />
        </div>
      </div>

      <ApprovalCard
        v-for="g in pendingGates"
        :key="g.gateID"
        :gate="g"
        @resolve="onResolve"
      />

      <div v-if="loaded && !visibleEvents.length && !pendingGates.length && !liveAgents.length" class="cp-empty">
        No conversation yet. Say hello to the Commander, or wait for it to report in.
      </div>

      <!-- Who is mid-turn right now. An agent can spend minutes on one turn, and nothing is written
           to the event log until it finishes — this is the only window into that gap. -->
      <div
        v-for="a in liveAgents" :key="a.agentID"
        class="cp-live" :class="'a-' + (a.agentID === 'commander' ? 'commander' : 'agent')"
      >
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

    <div v-if="sendError" class="cp-send-error">{{ sendError }} <button class="cp-err-dismiss" @click="sendError = ''">✕</button></div>
    <div class="cp-composer">
      <button
        class="cp-kind"
        :class="{ 'cp-kind-chat': kind === 'steering' }"
        :title="kindHint"
        @click="kind = kind === 'steering' ? 'task' : 'steering'"
      >{{ kind === 'steering' ? 'Chat' : 'Task' }}</button>
      <input
        v-model="draft"
        class="cp-input"
        :disabled="sending"
        placeholder="Message the Commander…"
        @keyup.enter="send"
      />
      <button class="cp-send" :disabled="sending || !draft.trim()" @click="send">Send</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import { useEventStream } from '~/composables/useEventStream';
import ApprovalCard from '~/components/Projects/ApprovalCard.vue';
import ProjectsArtifactImage from '~/components/Projects/ArtifactImage.vue';

const props = defineProps<{ projectId: string }>();
const emit = defineEmits<{ (e: 'events', events: any[]): void; (e: 'select', ev: any): void }>();

const events = ref<any[]>([]);
const pendingGates = ref<any[]>([]);
const draft = ref('');
// Every message used to become a durable Task directive, so "continue operations" landed on the
// Commander's books as a deliverable to acknowledge and complete. Task stays the default (a real
// request must not be silently downgraded); Chat sends it as one-off steering instead.
const kind = ref<'task' | 'steering'>('task');
const kindHint = computed(() => kind.value === 'steering'
  ? 'Chat: a one-off steer. Open until the Commander answers, then done. Click for Task.'
  : 'Task: a durable directive that stays on the Commander books until its deliverable is verified. Click for Chat.');
const sending = ref(false);
const sendError = ref('');
const loaded = ref(false);
const scrollEl = ref<HTMLElement | null>(null);
const since = ref(0);
const seenSeqs = new Set<number>();
let poll: ReturnType<typeof setInterval> | null = null;

// Live "who is generating right now" indicators, keyed by agentID. These are ephemeral snapshots
// pushed over the same socket — an agent appears when its model turn starts and is removed when the
// server says it ended, so this map only ever holds agents actually working.
const activity = ref<Record<string, any>>({});
// Ticks once a second purely so the elapsed time in each indicator counts up.
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | null = null;

// Live server-push (Phase 3): the WebSocket streams new events after the initial backlog load, so
// the conversation updates the instant the Commander acts. The slow poll below is only a safety net.
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

// Commander first, then longest-running. A missed "ended" signal (socket drop mid-turn) would
// otherwise strand an indicator forever, so anything the server hasn't refreshed in 10 minutes —
// its own sweep interval — is dropped here too.
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
// "anthropic/claude-sonnet-4.5" → "claude-sonnet-4.5"; the provider prefix is noise here.
function shortModel(model: string) { return model.includes('/') ? model.split('/').pop() : model; }
// The server's audit description is "tool_name(arg=…, arg=…)" and the tool name already has its own
// chip, so show just the arguments (already redacted server-side, same text the Timeline shows).
function toolArgs(a: any) {
  const detail = a.detail || '';
  const prefix = (a.toolName || '') + '(';
  return detail.startsWith(prefix) && detail.endsWith(')')
    ? detail.slice(prefix.length, -1)
    : detail;
}
function elapsed(a: any) {
  const secs = Math.max(0, Math.round((now.value - new Date(a.startedAt).getTime()) / 1000));
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

// An indicator appearing/disappearing changes the list height; follow it only when the reader is
// already at the bottom, so scrolling back through history is never yanked away. Deliberately not
// watching the preview text — that updates several times a second.
watch(() => liveAgents.value.length, () => {
  const el = scrollEl.value;
  if (!el || el.scrollHeight - el.scrollTop - el.clientHeight > 120) return;
  nextTick(() => { if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight; });
});

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
    // Replace the optimistic echo with the authoritative event when it arrives.
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
    nextTick(() => { if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight; });
  }
}

// Chatty internal events stay off the conversation view; the Timeline shows everything.
const CHAT_TYPES = new Set(['klives-message', 'commander-message', 'commander-thought', 'tool-call', 'tool-result', 'stimulus', 'approval-requested', 'approval-resolved']);
const visibleEvents = computed(() => events.value.filter(e => CHAT_TYPES.has(e.type)));

function whoLabel(e: any) {
  if (e.author === 'klives') return 'Klives';
  if (e.author === 'commander') return 'Commander';
  if (e.author === 'stimulus') return 'Stimulus';
  if (e.author === 'agent') return 'Agent ' + (e.agentID || '');
  return 'System';
}
function time(iso: string) { const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleTimeString(); }

async function loadEvents(initial = false) {
  try {
    // Initial backlog pulls the most-recent events (tail=true); later polls page forward from the
    // cursor. Loading with since=0 returned the OLDEST 500 events while the cursor jumped to
    // lastSequence — so a long-running project opened on days-old history and never showed the rest.
    const query = initial
      ? `tail=true&max=500`
      : `since=${since.value}&max=500`;
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
  // Optimistic echo: show the message instantly; the authoritative event replaces it on arrival.
  events.value.push({ type: 'klives-message', author: 'klives', text, timestamp: new Date().toISOString(), _optimistic: true });
  emit('events', events.value);
  nextTick(() => { if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight; });
  draft.value = '';
  try {
    const res = await RequestPOSTFromKliveAPI('/projects/message', JSON.stringify({ projectID: props.projectId, text, kind: kind.value }), false, true);
    if (!res.ok) sendError.value = "Message didn't send. Try again.";
  } catch { sendError.value = "Message didn't send. Try again."; }
  finally { sending.value = false; }
}

async function onResolve(gateID: string, decision: string, comment: string) {
  await RequestPOSTFromKliveAPI('/projects/gates/resolve',
    JSON.stringify({ projectID: props.projectId, gateID, decision, comment }), false, true);
  await loadGates();
}

onMounted(async () => {
  // Initial backlog over HTTP (most-recent events; sets the cursor), then live push takes over.
  await loadEvents(true);
  loaded.value = true;
  loadGates();
  // Paints anyone already mid-turn before the socket's own snapshot lands.
  loadActivity();
  stream.connect();
  clock = setInterval(() => { now.value = Date.now(); }, 1000);
  // Safety-net resync in case the socket drops without reconnecting (much slower than the old 3s poll).
  // Activity is included so a missed "ended" push can't strand an indicator until the stale cutoff.
  poll = setInterval(() => { loadEvents(); loadGates(); loadActivity(); }, 30000);
});
onBeforeUnmount(() => {
  if (poll) clearInterval(poll);
  if (clock) clearInterval(clock);
  stream.disconnect();
});
</script>

<style scoped>
.conversation-panel { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.cp-events { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.cp-event { min-width: 0; padding: 8px 12px; border-radius: 8px; background: #1c1c20; border-left: 3px solid #444; cursor: pointer; transition: background 0.1s; }
.cp-event:hover { background: #22222a; }
.a-klives { border-left-color: #7fb0d9; }
.a-commander { border-left-color: #4d9e39; }
.a-stimulus { border-left-color: #d98c2b; }
.a-system { border-left-color: #555; }
.cp-meta { display: flex; gap: 8px; font-size: 11px; color: #888; margin-bottom: 4px; }
.cp-who { font-weight: 600; color: #bbb; }
.cp-text { font-size: 14px; color: #e6e6e6; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
.cp-tool { font-size: 12px; color: #aaa; overflow-wrap: anywhere; word-break: break-word; }
.cp-tool code { color: #7fd97f; }
.cp-shots { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start; }
.cp-empty { color: #777; font-size: 13px; text-align: center; padding: 24px 12px; }

/* Live "currently generating" indicator — deliberately lighter than a real message: dashed border
   and dimmer text, so nothing here is mistaken for something the agent actually committed. */
.cp-live { min-width: 0; padding: 7px 12px; border-radius: 8px; background: #17171b; border: 1px dashed #333; border-left: 3px solid #444; }
.cp-live.a-commander { border-left-color: #4d9e39; }
.cp-live.a-agent { border-left-color: #7f6bd9; }
.cp-live-head { display: flex; align-items: center; gap: 8px; font-size: 11px; color: #888; }
.cp-live-head .cp-who { text-transform: capitalize; }
.cp-live-spacer { flex: 1; }
.cp-live-phase { color: #9a9a9a; }
.cp-live-tool { color: #7fd97f; font-size: 11px; }
.cp-live-model { color: #666; font-family: ui-monospace, monospace; }
.cp-live-elapsed { color: #666; font-variant-numeric: tabular-nums; }
/* The preview is the live TAIL of the turn (the server sends the last ~280 chars), so it must not be
   height-clipped — clipping the overflow would hide exactly the newest text this exists to show. */
.cp-live-preview { margin-top: 4px; font-size: 12.5px; color: #b9b9c4; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
.cp-live-detail { margin-top: 4px; font-size: 12px; color: #8a8a94; overflow-wrap: anywhere; word-break: break-word; }
.cp-live-dot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 auto; background: #7fb0d9; animation: cp-pulse 1.4s ease-in-out infinite; }
.cp-live-dot.ph-writing { background: #4d9e39; animation-duration: 0.9s; }
.cp-live-dot.ph-tool { background: #d98c2b; }
.cp-ellipsis { animation: cp-fade 1.4s ease-in-out infinite; }
@keyframes cp-pulse { 0%, 100% { opacity: 0.25; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }
@keyframes cp-fade { 0%, 100% { opacity: 0.2; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .cp-live-dot, .cp-ellipsis { animation: none; opacity: 1; }
}
.cp-send-error { display: flex; justify-content: space-between; align-items: center; background: #3a1717; color: #e08a8a; font-size: 12px; padding: 6px 12px; border-top: 1px solid #5a2424; }
.cp-err-dismiss { background: none; border: none; color: #e08a8a; cursor: pointer; }
.cp-composer { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #2a2a2e; }
.cp-input { flex: 1; min-width: 0; background: #1a1a1e; color: #eee; border: 1px solid #333; border-radius: 6px; padding: 10px; }
.cp-kind { flex: 0 0 auto; background: #1a1a1e; color: #bbb; border: 1px solid #333; border-radius: 6px; padding: 10px 12px; cursor: pointer; font-size: 12px; font-weight: 600; }
.cp-kind:hover { border-color: #555; }
.cp-kind-chat { color: #7fb0d9; border-color: #3d5a70; }
.cp-send { background: #4d9e39; color: #fff; border: none; padding: 10px 18px; border-radius: 6px; cursor: pointer; font-weight: 600; }
.cp-send:disabled { opacity: 0.5; cursor: default; }
</style>
