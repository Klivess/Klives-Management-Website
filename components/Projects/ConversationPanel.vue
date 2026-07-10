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
        <ProjectsArtifactImage
          v-for="id in (e.artifactIDs || [])"
          :key="id"
          :project-id="projectId"
          :artifact-id="id"
        />
      </div>

      <ApprovalCard
        v-for="g in pendingGates"
        :key="g.gateID"
        :gate="g"
        @resolve="onResolve"
      />

      <div v-if="loaded && !visibleEvents.length && !pendingGates.length" class="cp-empty">
        No conversation yet. Say hello to the Commander, or wait for it to report in.
      </div>
    </div>

    <div v-if="sendError" class="cp-send-error">{{ sendError }} <button class="cp-err-dismiss" @click="sendError = ''">✕</button></div>
    <div class="cp-composer">
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
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import { useEventStream } from '~/composables/useEventStream';
import ApprovalCard from '~/components/Projects/ApprovalCard.vue';
import ProjectsArtifactImage from '~/components/Projects/ArtifactImage.vue';

const props = defineProps<{ projectId: string }>();
const emit = defineEmits<{ (e: 'events', events: any[]): void; (e: 'select', ev: any): void }>();

const events = ref<any[]>([]);
const pendingGates = ref<any[]>([]);
const draft = ref('');
const sending = ref(false);
const sendError = ref('');
const loaded = ref(false);
const scrollEl = ref<HTMLElement | null>(null);
const since = ref(0);
const seenSeqs = new Set<number>();
let poll: ReturnType<typeof setInterval> | null = null;

// Live server-push (Phase 3): the WebSocket streams new events after the initial backlog load, so
// the conversation updates the instant the Commander acts. The slow poll below is only a safety net.
const stream = useEventStream({
  projectId: props.projectId,
  sinceRef: since,
  onEvent: (e: any) => { appendEvents([e]); },
});

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
    const res = await RequestPOSTFromKliveAPI('/projects/message', JSON.stringify({ projectID: props.projectId, text }), false, true);
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
  stream.connect();
  // Safety-net resync in case the socket drops without reconnecting (much slower than the old 3s poll).
  poll = setInterval(() => { loadEvents(); loadGates(); }, 30000);
});
onBeforeUnmount(() => { if (poll) clearInterval(poll); stream.disconnect(); });
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
.cp-empty { color: #777; font-size: 13px; text-align: center; padding: 24px 12px; }
.cp-send-error { display: flex; justify-content: space-between; align-items: center; background: #3a1717; color: #e08a8a; font-size: 12px; padding: 6px 12px; border-top: 1px solid #5a2424; }
.cp-err-dismiss { background: none; border: none; color: #e08a8a; cursor: pointer; }
.cp-composer { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #2a2a2e; }
.cp-input { flex: 1; background: #1a1a1e; color: #eee; border: 1px solid #333; border-radius: 6px; padding: 10px; }
.cp-send { background: #4d9e39; color: #fff; border: none; padding: 10px 18px; border-radius: 6px; cursor: pointer; font-weight: 600; }
.cp-send:disabled { opacity: 0.5; cursor: default; }
</style>
