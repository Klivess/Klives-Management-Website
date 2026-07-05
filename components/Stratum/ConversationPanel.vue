<template>
  <section class="conversation-panel">
    <header class="conv-header">
      <h3>Stratum Engineer</h3>
      <div class="conv-status">
        <template v-if="activeTurn">
          <span class="spinner" />
          <span class="status-text">{{ activeTurn.status === 'AwaitingApproval' ? 'Waiting for your approval' : 'Engineer is working…' }}</span>
          <button class="cancel-btn" @click="cancelTurn">Cancel</button>
        </template>
        <span v-else class="status-text idle">Idle — send a message to start</span>
      </div>
    </header>

    <div ref="scroller" class="conv-scroll">
      <div v-if="events.length === 0 && !loading" class="conv-empty">
        Describe the device you want to build. The Engineer plans, designs verified CAD,
        picks electronics, writes firmware, and asks for your approval at each milestone.
      </div>

      <template v-for="item in renderItems" :key="item.key">
        <!-- user / agent bubbles -->
        <div v-if="item.kind === 'user'" class="msg user-msg">
          <div class="msg-text">{{ item.event!.Text }}</div>
          <div class="msg-time">{{ formatTime(item.event!.Timestamp) }}</div>
        </div>
        <div v-else-if="item.kind === 'agent'" class="msg agent-msg">
          <div class="msg-author">Engineer</div>
          <div class="msg-text">{{ item.event!.Text }}</div>
          <div class="msg-time">{{ formatTime(item.event!.Timestamp) }}</div>
        </div>
        <div v-else-if="item.kind === 'thought'" class="thought-row">{{ item.event!.Text }}</div>

        <!-- tool activity -->
        <ToolActivityCard v-else-if="item.kind === 'tool'" :call="item.event!" :result="item.result" />

        <!-- inline render image -->
        <div v-else-if="item.kind === 'image'" class="image-row">
          <img
            v-if="imageUrls[item.event!.ArtifactIDs[0]]"
            :src="imageUrls[item.event!.ArtifactIDs[0]]"
            class="render-img"
            alt="render"
            @click="lightboxUrl = imageUrls[item.event!.ArtifactIDs[0]]"
          />
          <div v-else class="image-loading">loading render…</div>
        </div>

        <!-- system lines -->
        <div v-else-if="item.kind === 'system'" class="system-row" :class="item.event!.Type">{{ item.event!.Text }}</div>
      </template>

      <GateCard v-if="currentGate" :gate="currentGate" @resolve="resolveGate" @preview="id => emit('select-artifact', id)" />
    </div>

    <footer class="conv-composer">
      <textarea
        v-model="composer"
        class="composer-input"
        rows="2"
        :placeholder="activeTurn ? 'The engineer is working — wait or cancel the turn first.' : 'Message the Stratum Engineer…'"
        :disabled="!!activeTurn || sending"
        @keydown.enter.exact.prevent="send"
      />
      <button class="send-btn" :disabled="!!activeTurn || sending || !composer.trim()" @click="send">
        {{ sending ? '…' : 'Send' }}
      </button>
    </footer>
    <div v-if="errorNote" class="error-note">{{ errorNote }}</div>

    <details class="legacy-runs">
      <summary>Legacy agent runs (read-only history)</summary>
      <ul v-if="legacyRuns.length" class="legacy-list">
        <li v-for="r in legacyRuns" :key="r.runID">
          <span class="legacy-type">{{ r.agentType }}</span>
          <span class="legacy-status" :class="r.status.toLowerCase()">{{ r.status }}</span>
          <span class="legacy-prompt">{{ r.userPrompt }}</span>
          <span class="legacy-time">{{ formatTime(r.createdAt) }}</span>
        </li>
      </ul>
      <div v-else class="muted">No legacy runs.</div>
    </details>

    <!-- lightbox -->
    <div v-if="lightboxUrl" class="lightbox" @click="lightboxUrl = null">
      <img :src="lightboxUrl" alt="render full size" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import ToolActivityCard from '~/components/Stratum/ToolActivityCard.vue';
import GateCard, { type GateInfo } from '~/components/Stratum/GateCard.vue';

interface TimelineEvent {
  Sequence: number;
  EventID: string;
  ProjectID: string;
  TurnID?: string | null;
  Timestamp: string;
  Type: string;
  Author: string;
  Text: string;
  ToolName?: string | null;
  ToolCallId?: string | null;
  PayloadJson?: string | null;
  ArtifactIDs: string[];
  GateID?: string | null;
}

interface ActiveTurn { turnID: string; status: string; startedAt?: string | null }

interface LegacyRun { runID: string; agentType: string; status: string; createdAt: string; userPrompt: string }

const props = defineProps<{ projectId: string }>();
const emit = defineEmits<{
  (e: 'select-artifact', artifactID: string): void;
  (e: 'project-changed'): void;
}>();

const events = ref<TimelineEvent[]>([]);
const lastSeq = ref(0);
const activeTurn = ref<ActiveTurn | null>(null);
const currentGate = ref<GateInfo | null>(null);
const composer = ref('');
const sending = ref(false);
const loading = ref(true);
const errorNote = ref('');
const legacyRuns = ref<LegacyRun[]>([]);
const scroller = ref<HTMLElement | null>(null);
const lightboxUrl = ref<string | null>(null);
const imageUrls = ref<Record<string, string>>({});
const seenEventIds = new Set<string>();
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let destroyed = false;

// ── timeline rendering model ──
// tool-call + tool-result pairs collapse into one card; artifact-added events are
// invisible (they refresh the workbench); gate state renders from currentGate.
interface RenderItem {
  key: string;
  kind: 'user' | 'agent' | 'thought' | 'tool' | 'image' | 'system';
  event?: TimelineEvent;
  result?: TimelineEvent | null;
}

const renderItems = computed<RenderItem[]>(() => {
  const items: RenderItem[] = [];
  const resultsByCallId = new Map<string, TimelineEvent>();
  for (const e of events.value) {
    if (e.Type === 'tool-result' && e.ToolCallId) resultsByCallId.set(e.ToolCallId, e);
  }
  for (const e of events.value) {
    switch (e.Type) {
      case 'user-message':
        items.push({ key: e.EventID, kind: 'user', event: e });
        break;
      case 'agent-message':
        items.push({ key: e.EventID, kind: 'agent', event: e });
        break;
      case 'thought':
        items.push({ key: e.EventID, kind: 'thought', event: e });
        break;
      case 'tool-call':
        items.push({ key: e.EventID, kind: 'tool', event: e, result: e.ToolCallId ? resultsByCallId.get(e.ToolCallId) ?? null : null });
        break;
      case 'image':
        if (e.ArtifactIDs?.length) items.push({ key: e.EventID, kind: 'image', event: e });
        break;
      case 'gate-resolved':
      case 'turn-started':
      case 'turn-completed':
      case 'turn-failed':
      case 'turn-cancelled':
      case 'status':
        items.push({ key: e.EventID, kind: 'system', event: e });
        break;
      // tool-result (paired above) and artifact-added are not rendered as rows.
    }
  }
  return items;
});

async function poll() {
  if (destroyed) return;
  try {
    const res = await RequestGETFromKliveAPI(
      `/stratum/conversation/events?projectID=${encodeURIComponent(props.projectId)}&since=${lastSeq.value}`,
      false, false,
    );
    if (res.ok) {
      const data = await res.json();
      const incoming: TimelineEvent[] = Array.isArray(data.events) ? data.events : [];
      let sawArtifacts = false;
      for (const e of incoming) {
        if (seenEventIds.has(e.EventID)) continue;
        seenEventIds.add(e.EventID);
        events.value.push(e);
        if (e.Type === 'artifact-added') sawArtifacts = true;
        if (e.Type === 'image' && e.ArtifactIDs?.length) void fetchImage(e.ArtifactIDs[0]);
      }
      if (typeof data.lastSequence === 'number' && data.lastSequence > lastSeq.value) lastSeq.value = data.lastSequence;
      const hadTurn = !!activeTurn.value;
      activeTurn.value = data.activeTurn ?? null;
      currentGate.value = data.currentGate ?? null;
      if (sawArtifacts || (hadTurn && !activeTurn.value)) emit('project-changed');
      if (incoming.length > 0) scrollToBottom();
    }
  } catch { /* transient network errors: keep polling */ }
  finally {
    loading.value = false;
    if (!destroyed) pollTimer = setTimeout(poll, 1500);
  }
}

async function fetchImage(artifactID: string) {
  if (imageUrls.value[artifactID]) return;
  try {
    const res = await RequestGETFromKliveAPI(
      `/stratum/artifacts/download?projectID=${encodeURIComponent(props.projectId)}&artifactID=${encodeURIComponent(artifactID)}`,
      false, false,
    );
    if (!res.ok) return;
    const blob = await res.blob();
    imageUrls.value = { ...imageUrls.value, [artifactID]: URL.createObjectURL(blob) };
    scrollToBottom();
  } catch { /* ignore */ }
}

async function send() {
  const text = composer.value.trim();
  if (!text || sending.value || activeTurn.value) return;
  sending.value = true;
  errorNote.value = '';
  try {
    const res = await RequestPOSTFromKliveAPI(
      `/stratum/conversation/send?projectID=${encodeURIComponent(props.projectId)}`,
      JSON.stringify({ text }), false, false,
    );
    if (res.ok) {
      composer.value = '';
    } else {
      try { errorNote.value = (await res.json())?.error ?? `Send failed (HTTP ${res.status}).`; }
      catch { errorNote.value = `Send failed (HTTP ${res.status}).`; }
    }
  } finally {
    sending.value = false;
  }
}

async function cancelTurn() {
  await RequestPOSTFromKliveAPI(
    `/stratum/conversation/cancel-turn?projectID=${encodeURIComponent(props.projectId)}`,
    '', false, false,
  );
}

async function resolveGate(decision: 'Approve' | 'Reject', comment: string) {
  if (!currentGate.value) return;
  const res = await RequestPOSTFromKliveAPI(
    `/stratum/conversation/approve?projectID=${encodeURIComponent(props.projectId)}`,
    JSON.stringify({ gateID: currentGate.value.gateID, decision, comment }), false, false,
  );
  if (res.ok) currentGate.value = null;
}

async function loadLegacyRuns() {
  try {
    const res = await RequestGETFromKliveAPI(`/stratum/runs/list?projectID=${encodeURIComponent(props.projectId)}`, false, false);
    if (!res.ok) return;
    const data = await res.json();
    legacyRuns.value = (Array.isArray(data) ? data : [])
      .filter((r: any) => r.agentType !== 'Engineer')
      .map((r: any) => ({
        runID: String(r.runID ?? ''),
        agentType: String(r.agentType ?? ''),
        status: String(r.status ?? ''),
        createdAt: String(r.createdAt ?? ''),
        userPrompt: String(r.userPrompt ?? ''),
      }));
  } catch { /* ignore */ }
}

function scrollToBottom() {
  nextTick(() => {
    if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight;
  });
}

function formatTime(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString();
}

function reset() {
  events.value = [];
  lastSeq.value = 0;
  seenEventIds.clear();
  activeTurn.value = null;
  currentGate.value = null;
  for (const url of Object.values(imageUrls.value)) URL.revokeObjectURL(url);
  imageUrls.value = {};
  loading.value = true;
}

onMounted(() => {
  void poll();
  void loadLegacyRuns();
});

onBeforeUnmount(() => {
  destroyed = true;
  if (pollTimer) clearTimeout(pollTimer);
  for (const url of Object.values(imageUrls.value)) URL.revokeObjectURL(url);
});

watch(() => props.projectId, () => {
  reset();
  void loadLegacyRuns();
});
</script>

<style scoped>
.conversation-panel {
  display: flex; flex-direction: column; min-height: 420px;
  background: #1f1f23; border: 1px solid #2a2a2e; border-radius: 8px; padding: 12px;
}
.conv-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.conv-header h3 { margin: 0; font-size: 14px; color: #aaa; text-transform: uppercase; letter-spacing: 0.05em; }
.conv-status { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.status-text { color: #9fcf92; }
.status-text.idle { color: #666; }
.spinner {
  width: 12px; height: 12px; border: 2px solid #4d9e39; border-top-color: transparent;
  border-radius: 50%; animation: spin 0.9s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.cancel-btn {
  background: #3a2a2a; border: 1px solid #5a3a3a; color: #ff9a9a;
  border-radius: 4px; font-size: 11px; padding: 3px 10px; cursor: pointer;
}
.cancel-btn:hover { background: #4a3030; }

.conv-scroll { flex: 1; overflow-y: auto; min-height: 240px; padding: 4px 2px; }
.conv-empty { color: #777; font-size: 13px; padding: 24px 12px; text-align: center; }

.msg { max-width: 86%; margin: 8px 0; padding: 8px 12px; border-radius: 10px; font-size: 13px; }
.user-msg { margin-left: auto; background: #2d4030; color: #d9f2d2; }
.agent-msg { margin-right: auto; background: #26262b; color: #e3e3e3; }
.msg-author { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #8fc97f; margin-bottom: 3px; }
.msg-text { white-space: pre-wrap; word-break: break-word; }
.msg-time { font-size: 10px; color: #777; margin-top: 4px; text-align: right; }

.thought-row { color: #7e7e88; font-size: 12px; font-style: italic; margin: 4px 8px; white-space: pre-wrap; }
.system-row { color: #666; font-size: 11px; text-align: center; margin: 6px 0; }
.system-row.turn-failed { color: #ff9a9a; }
.system-row.turn-cancelled { color: #d8b46a; }
.system-row.gate-resolved { color: #9fcf92; }

.image-row { margin: 8px 0; }
.render-img {
  max-width: 420px; max-height: 320px; border-radius: 8px; border: 1px solid #2a2a2e;
  cursor: zoom-in; display: block;
}
.image-loading { color: #666; font-size: 12px; font-style: italic; }

.conv-composer { display: flex; gap: 8px; margin-top: 8px; }
.composer-input {
  flex: 1; background: #161618; border: 1px solid #3a3a3e; color: #ddd;
  border-radius: 6px; padding: 8px 10px; font-size: 13px; resize: vertical;
}
.composer-input:disabled { opacity: 0.55; }
.send-btn {
  background: #4d9e39; color: #fff; border: none; border-radius: 6px;
  font-weight: 700; font-size: 13px; padding: 0 18px; cursor: pointer;
}
.send-btn:hover:not(:disabled) { background: #5cb946; }
.send-btn:disabled { opacity: 0.5; cursor: default; }
.error-note { color: #ff9a9a; font-size: 12px; margin-top: 6px; }

.legacy-runs { margin-top: 10px; font-size: 12px; color: #888; }
.legacy-runs summary { cursor: pointer; }
.legacy-list { list-style: none; margin: 6px 0 0; padding: 0; }
.legacy-list li { display: flex; gap: 8px; align-items: center; padding: 4px 6px; border-radius: 4px; }
.legacy-list li:hover { background: #26262b; }
.legacy-type { font-family: monospace; color: #9fcf92; min-width: 80px; }
.legacy-status { font-size: 10px; padding: 2px 6px; border-radius: 3px; background: #2a2a2e; }
.legacy-status.completed { color: #9fcf92; }
.legacy-status.failed, .legacy-status.interrupted { color: #ff9a9a; }
.legacy-prompt { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #999; }
.legacy-time { font-size: 10px; color: #666; }
.muted { color: #666; }

.lightbox {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.85); z-index: 1000;
  display: flex; align-items: center; justify-content: center; cursor: zoom-out;
}
.lightbox img { max-width: 92vw; max-height: 92vh; border-radius: 8px; }
</style>
