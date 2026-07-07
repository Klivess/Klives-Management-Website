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
    </div>

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
import ApprovalCard from '~/components/Projects/ApprovalCard.vue';
import ProjectsArtifactImage from '~/components/Projects/ArtifactImage.vue';

const props = defineProps<{ projectId: string }>();
const emit = defineEmits<{ (e: 'events', events: any[]): void; (e: 'select', ev: any): void }>();

const events = ref<any[]>([]);
const pendingGates = ref<any[]>([]);
const draft = ref('');
const sending = ref(false);
const scrollEl = ref<HTMLElement | null>(null);
let since = 0;
let poll: ReturnType<typeof setInterval> | null = null;

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

async function loadEvents() {
  try {
    const res = await RequestGETFromKliveAPI(`/projects/events?projectID=${props.projectId}&since=${since}&max=500`, false, false);
    if (!res.ok) return;
    const json = await res.json();
    const batch = Array.isArray(json.events) ? json.events : [];
    if (batch.length) {
      events.value.push(...batch);
      since = json.lastSequence ?? since;
      emit('events', events.value);
      await nextTick();
      if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight;
    }
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
  try {
    await RequestPOSTFromKliveAPI('/projects/message', JSON.stringify({ projectID: props.projectId, text }), false, true);
    draft.value = '';
    await loadEvents();
  } finally { sending.value = false; }
}

async function onResolve(gateID: string, decision: string, comment: string) {
  await RequestPOSTFromKliveAPI('/projects/gates/resolve',
    JSON.stringify({ projectID: props.projectId, gateID, decision, comment }), false, true);
  await loadGates();
}

onMounted(() => {
  loadEvents(); loadGates();
  poll = setInterval(() => { loadEvents(); loadGates(); }, 3000);
});
onBeforeUnmount(() => { if (poll) clearInterval(poll); });
</script>

<style scoped>
.conversation-panel { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.cp-events { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.cp-event { padding: 8px 12px; border-radius: 8px; background: #1c1c20; border-left: 3px solid #444; cursor: pointer; transition: background 0.1s; }
.cp-event:hover { background: #22222a; }
.a-klives { border-left-color: #7fb0d9; }
.a-commander { border-left-color: #4d9e39; }
.a-stimulus { border-left-color: #d98c2b; }
.a-system { border-left-color: #555; }
.cp-meta { display: flex; gap: 8px; font-size: 11px; color: #888; margin-bottom: 4px; }
.cp-who { font-weight: 600; color: #bbb; }
.cp-text { font-size: 14px; color: #e6e6e6; white-space: pre-wrap; }
.cp-tool { font-size: 12px; color: #aaa; }
.cp-tool code { color: #7fd97f; }
.cp-composer { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #2a2a2e; }
.cp-input { flex: 1; background: #1a1a1e; color: #eee; border: 1px solid #333; border-radius: 6px; padding: 10px; }
.cp-send { background: #4d9e39; color: #fff; border: none; padding: 10px 18px; border-radius: 6px; cursor: pointer; font-weight: 600; }
.cp-send:disabled { opacity: 0.5; cursor: default; }
</style>
