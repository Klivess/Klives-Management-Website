<template>
  <section class="mech-chat">
    <header class="mech-chat-header">
      <h3>Mechanical Engineer</h3>
      <span class="muted">Persistent conversation about this project's design.</span>
    </header>

    <div class="mech-chat-messages" ref="scrollEl">
      <div v-if="!messages.length && !loading" class="mech-chat-empty">
        Ask why a dimension is the way it is, request explanations of mating interfaces, or propose new features ("add a battery compartment behind the trigger"). Proposals become amendments to the design once you approve them.
      </div>
      <div
        v-for="m in messages"
        :key="m.MessageID"
        class="mech-chat-row"
        :class="['author-' + m.Author, 'intent-' + m.Intent]"
      >
        <div class="mech-chat-bubble">
          <div class="mech-chat-meta">
            <span class="who">{{ m.Author === 'user' ? 'You' : 'Engineer' }}</span>
            <span class="when">{{ formatTime(m.CreatedAt) }}</span>
            <span v-if="m.Intent && m.Intent !== 'answer' && m.Intent !== 'question'" class="intent-pill">{{ intentLabel(m.Intent) }}</span>
          </div>
          <div class="mech-chat-text" v-text="m.Text"></div>
          <div v-if="m.ReferencedArtifactIDs?.length" class="mech-chat-refs">
            <button
              v-for="ref in m.ReferencedArtifactIDs"
              :key="ref"
              class="ref-pill"
              type="button"
              @click="$emit('reference', ref)"
            >{{ shortRef(ref) }}</button>
          </div>
          <div v-if="m.Intent === 'proposal'" class="mech-chat-actions">
            <button
              v-if="!m.ProposalApproved"
              class="approve-btn"
              :disabled="approving === m.MessageID"
              @click="approveProposal(m.MessageID)"
              type="button"
            >{{ approving === m.MessageID ? 'Spawning amendment…' : 'Approve &amp; amend' }}</button>
            <span v-else class="approved-tag">✓ Approved · run {{ shortRef(m.TriggeredRunID || '') }}</span>
          </div>
        </div>
      </div>
    </div>

    <form class="mech-chat-input" @submit.prevent="send">
      <textarea
        v-model="draft"
        :disabled="sending"
        rows="2"
        placeholder="Ask the engineer or describe a change…"
        @keydown.enter.exact.prevent="send"
      ></textarea>
      <button type="submit" :disabled="sending || !draft.trim()">
        {{ sending ? '…' : 'Send' }}
      </button>
    </form>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

interface ChatMessage {
  MessageID: string;
  ConversationID: string;
  ProjectID: string;
  AgentRole: string;
  Author: string;
  CreatedAt: string;
  Text: string;
  ReferencedArtifactIDs: string[];
  Intent: string;
  ProposalJson?: string | null;
  ProposalApproved: boolean;
  TriggeredRunID?: string | null;
  Sequence: number;
}

const props = defineProps<{
  projectId: string;
}>();
const emit = defineEmits<{
  (e: 'reference', artifactID: string): void;
  (e: 'amendment-spawned', runID: string): void;
}>();

const messages = ref<ChatMessage[]>([]);
const draft = ref('');
const sending = ref(false);
const approving = ref<string | null>(null);
const loading = ref(false);
const scrollEl = ref<HTMLElement | null>(null);

let pollTimer: number | null = null;
let lastSeq = 0;

async function loadHistory() {
  loading.value = true;
  try {
    const res = await RequestGETFromKliveAPI(
      `/stratum/chat/messages?projectID=${encodeURIComponent(props.projectId)}&agentRole=MechanicalEngineer&since=0`,
      false, false,
    );
    if (!res.ok) return;
    const body = await res.json();
    messages.value = Array.isArray(body?.messages) ? body.messages : [];
    lastSeq = Number(body?.nextSequence ?? 0) - 1;
    if (lastSeq < 0) lastSeq = 0;
    scrollToBottom();
  } finally {
    loading.value = false;
  }
}

async function pollOnce() {
  try {
    const res = await RequestGETFromKliveAPI(
      `/stratum/chat/messages?projectID=${encodeURIComponent(props.projectId)}&agentRole=MechanicalEngineer&since=${lastSeq}`,
      false, false,
    );
    if (!res.ok) return;
    const body = await res.json();
    const fresh: ChatMessage[] = Array.isArray(body?.messages) ? body.messages : [];
    if (fresh.length) {
      // De-duplicate by MessageID — the optimistic POST already appended these.
      const existing = new Set(messages.value.map(m => m.MessageID));
      const additions = fresh.filter(m => !existing.has(m.MessageID));
      if (additions.length) {
        messages.value = [...messages.value, ...additions];
        scrollToBottom();
        // Notify parent if any of the additions is an amendment-spawn record.
        for (const m of additions) {
          if (m.Intent === 'amendment-spawned' && m.TriggeredRunID) emit('amendment-spawned', m.TriggeredRunID);
        }
      }
      for (const m of fresh) lastSeq = Math.max(lastSeq, m.Sequence);
    }
  } catch { /* ignore polling errors */ }
}

async function send() {
  const text = draft.value.trim();
  if (!text || sending.value) return;
  sending.value = true;
  try {
    const res = await RequestPOSTFromKliveAPI(
      `/stratum/chat/send?projectID=${encodeURIComponent(props.projectId)}`,
      JSON.stringify({ text }),
      false, true,
    );
    if (!res.ok) {
      const errBody = await res.text();
      console.error('chat send failed', errBody);
      return;
    }
    const body = await res.json();
    const newMsgs: ChatMessage[] = [];
    if (body?.userMessage) newMsgs.push(body.userMessage);
    if (body?.agentMessage) newMsgs.push(body.agentMessage);
    const existing = new Set(messages.value.map(m => m.MessageID));
    for (const m of newMsgs) if (!existing.has(m.MessageID)) messages.value.push(m);
    for (const m of newMsgs) lastSeq = Math.max(lastSeq, m.Sequence);
    draft.value = '';
    scrollToBottom();
  } finally {
    sending.value = false;
  }
}

async function approveProposal(messageID: string) {
  approving.value = messageID;
  try {
    const res = await RequestPOSTFromKliveAPI(
      `/stratum/chat/approve-proposal?projectID=${encodeURIComponent(props.projectId)}&messageID=${encodeURIComponent(messageID)}`,
      '', false, false,
    );
    if (!res.ok) {
      const errBody = await res.text();
      console.error('approve failed', errBody);
      return;
    }
    const body = await res.json();
    if (body?.runID) emit('amendment-spawned', body.runID);
    // Optimistically mark approved; the next poll will sync the canonical state.
    const target = messages.value.find(m => m.MessageID === messageID);
    if (target) {
      target.ProposalApproved = true;
      target.TriggeredRunID = body?.runID ?? null;
    }
  } finally {
    approving.value = null;
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (!scrollEl.value) return;
    scrollEl.value.scrollTop = scrollEl.value.scrollHeight;
  });
}

function formatTime(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function shortRef(s: string) { return s ? s.slice(0, 8) : ''; }
function intentLabel(intent: string): string {
  switch (intent) {
    case 'proposal': return 'proposal';
    case 'feature-request': return 'feature';
    case 'tweak': return 'tweak';
    case 'amendment-spawned': return 'amendment';
    case 'system': return 'system';
    default: return intent;
  }
}

onMounted(async () => {
  await loadHistory();
  pollTimer = window.setInterval(pollOnce, 4000);
});
onBeforeUnmount(() => {
  if (pollTimer != null) window.clearInterval(pollTimer);
});
watch(() => props.projectId, async () => {
  messages.value = [];
  lastSeq = 0;
  await loadHistory();
});
</script>

<style scoped>
.mech-chat {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #1f1f23;
  border: 1px solid #2a2a2e;
  border-radius: 8px;
  padding: 12px;
  min-height: 0;
  height: 100%;
}
.mech-chat-header { display: flex; justify-content: space-between; align-items: baseline; }
.mech-chat-header h3 { margin: 0; font-size: 14px; color: #aaa; text-transform: uppercase; letter-spacing: 0.05em; }
.muted { color: #666; font-size: 11px; }
.mech-chat-messages {
  flex: 1 1 auto;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 4px;
  min-height: 220px;
}
.mech-chat-empty { color: #777; font-size: 12px; padding: 8px; }
.mech-chat-row { display: flex; }
.mech-chat-row.author-user { justify-content: flex-end; }
.mech-chat-row.author-agent { justify-content: flex-start; }
.mech-chat-bubble {
  max-width: 86%;
  background: #2a2a2e;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;
  color: #e6e6e6;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mech-chat-row.author-user .mech-chat-bubble { background: #2d4030; color: #b9e8b4; }
.mech-chat-row.intent-proposal .mech-chat-bubble { border: 1px solid #4d9e39; }
.mech-chat-row.intent-amendment-spawned .mech-chat-bubble { background: #1f2f23; border: 1px solid #356c2a; }
.mech-chat-row.intent-system .mech-chat-bubble { background: #2a1a1a; color: #ff8484; }
.mech-chat-meta { display: flex; gap: 8px; align-items: center; font-size: 10px; color: #888; }
.mech-chat-meta .who { font-weight: 600; color: #aaa; }
.intent-pill {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 3px;
  background: #4d9e39;
  color: #112;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.mech-chat-text { white-space: pre-wrap; line-height: 1.45; }
.mech-chat-refs { display: flex; flex-wrap: wrap; gap: 4px; }
.ref-pill {
  font-size: 10px;
  font-family: 'Consolas', 'Courier New', monospace;
  background: #1a1a1d;
  color: #b6c8ff;
  border: 1px solid #2d3a55;
  border-radius: 3px;
  padding: 2px 6px;
  cursor: pointer;
}
.ref-pill:hover { background: #25304a; }
.mech-chat-actions { margin-top: 4px; }
.approve-btn {
  background: #4d9e39;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.approve-btn:disabled { background: #2a3a26; color: #99b58e; cursor: not-allowed; }
.approve-btn:hover:not(:disabled) { background: #5fb849; }
.approved-tag { color: #b9e8b4; font-size: 11px; font-style: italic; }
.mech-chat-input { display: flex; gap: 8px; }
.mech-chat-input textarea {
  flex: 1;
  background: #161618;
  color: #e6e6e6;
  border: 1px solid #2a2a2e;
  border-radius: 4px;
  padding: 8px;
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  min-height: 40px;
}
.mech-chat-input button {
  background: #4d9e39;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 0 16px;
  font-weight: 600;
  cursor: pointer;
}
.mech-chat-input button:disabled { background: #2a3a26; color: #99b58e; cursor: not-allowed; }
</style>
