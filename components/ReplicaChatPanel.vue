<template>
    <!--
        ReplicaChatPanel
        ── Pinned at the top of the Omniscience Dossier. Lets the operator chat with a
           digital recreation of the selected person, trained from their actual messages.
        States:
           • none / stale / failed → primary "Train Replica" CTA + last error
           • training → live progress (polls /replica/job)
           • ready    → ChatGPT-style multi-chat UI: sidebar of conversations, message
                        thread, input bar, self-critique toggle
    -->
    <div class="replica-panel" v-if="personId">
        <div class="rp-head">
            <div class="rp-title-row">
                <span class="panel-code sm">RPL</span>
                <h3>Replica · {{ displayName || 'this person' }}</h3>
                <span v-if="status?.status" class="rp-status-pill" :class="statusClass">{{ statusText }}</span>
            </div>
            <div class="rp-head-actions">
                <button v-if="canTrain" class="micro violet" :disabled="busy" @click="startTraining">
                    {{ status?.status === 'ready' ? 'Retrain' : 'Train Replica' }}
                </button>
            </div>
        </div>

        <!-- Training in progress -->
        <div v-if="status?.status === 'training' || activeJobId" class="rp-training">
            <div class="rp-train-bar">
                <div class="rp-train-fill" :style="{ width: (job?.progress_pct || 0) + '%' }"></div>
            </div>
            <div class="rp-train-meta">
                <strong>{{ stageLabel(job?.stage) }}</strong>
                <small>{{ job?.progress_pct || 0 }}%</small>
                <small v-if="job?.status === 'failed'" class="bad">FAILED</small>
            </div>
            <p v-if="job?.error" class="rp-error">{{ job.error }}</p>
            <details v-if="(job?.log || []).length" class="details">
                <summary>Training log ({{ job.log.length }})</summary>
                <ul class="rp-log">
                    <li v-for="(l, i) in job.log.slice().reverse()" :key="i">
                        <span class="mono">{{ fmtTime(l.at) }}</span>
                        <span class="rp-log-stage">{{ l.stage }}</span>
                        <span>{{ l.msg }}</span>
                    </li>
                </ul>
            </details>
        </div>

        <!-- Ready: chat UI -->
        <div v-else-if="status?.status === 'ready'" class="rp-chat">
            <aside class="rp-chat-side">
                <button class="rp-new-chat" @click="newChat">+ New chat</button>
                <ul class="rp-chat-list">
                    <li v-for="c in chats" :key="c.chat_id"
                        :class="{ active: activeChatId === c.chat_id }"
                        @click="selectChat(c)">
                        <span class="rp-chat-title">{{ c.title || 'Untitled' }}</span>
                        <button class="rp-chat-del" :title="'Delete chat'" @click.stop="deleteChat(c)">×</button>
                    </li>
                    <li v-if="!chats.length" class="muted rp-chat-empty">No chats yet.</li>
                </ul>
            </aside>
            <section class="rp-chat-main">
                <div ref="threadEl" class="rp-thread">
                    <div v-if="!activeChatId" class="muted rp-empty">
                        Pick a chat or start a new one. The replica is built from
                        <strong>{{ status.messages_embedded }}</strong> of {{ displayName || 'their' }} messages.
                    </div>
                    <div v-else>
                        <div v-for="m in messages" :key="m.message_id" class="rp-msg" :class="m.role">
                            <div class="rp-msg-bubble">{{ m.content }}</div>
                            <small v-if="m.role === 'assistant'" class="rp-msg-meta">
                                {{ Math.round((m.latency_ms || 0)) }}ms<span v-if="m.used_self_critique"> · polished</span>
                            </small>
                        </div>
                        <div v-if="sending" class="rp-msg assistant">
                            <div class="rp-msg-bubble rp-typing">{{ displayName || 'Replica' }} is thinking…</div>
                        </div>
                    </div>
                </div>
                <div class="rp-compose">
                    <label class="rp-toggle">
                        <input type="checkbox" v-model="useSelfCritique" />
                        <span>Self-critique pass (slower, more in-character)</span>
                    </label>
                    <div class="rp-compose-row">
                        <textarea
                            v-model="draftInput"
                            :disabled="!activeChatId || sending"
                            placeholder="Type a message…"
                            rows="2"
                            @keydown.enter.exact.prevent="send"></textarea>
                        <button class="micro violet" :disabled="!activeChatId || sending || !draftInput.trim()" @click="send">
                            {{ sending ? 'Sending…' : 'Send' }}
                        </button>
                    </div>
                </div>
            </section>
        </div>

        <!-- Idle / failed / stale: CTA -->
        <div v-else class="rp-idle">
            <p v-if="status?.last_error" class="rp-error">{{ status.last_error }}</p>
            <p v-else class="muted">No replica trained yet for this person. Training reads their full message history,
                builds a voice rulebook, an opinion ledger, conversational reflexes and a relational map, then embeds every message locally.</p>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

const props = defineProps({
    personId: { type: String, required: true },
    displayName: { type: String, default: '' },
    profileTargeted: { type: Boolean, default: false },
});

const status = ref(null);
const job = ref(null);
const activeJobId = ref(null);
const chats = ref([]);
const activeChatId = ref(null);
const messages = ref([]);
const draftInput = ref('');
const useSelfCritique = ref(false);
const sending = ref(false);
const busy = ref(false);
const threadEl = ref(null);

let statusTimer = null;
let jobTimer = null;

const canTrain = computed(() => {
    // Only profile-targeted people can be trained (server enforces this too).
    if (!props.profileTargeted) return false;
    const s = status.value?.status;
    return s !== 'training';
});

const statusText = computed(() => {
    const s = status.value?.status;
    if (!s || s === 'none') return 'NOT TRAINED';
    return s.toUpperCase();
});
const statusClass = computed(() => {
    const s = status.value?.status;
    if (s === 'ready') return 'good';
    if (s === 'training') return 'mid';
    if (s === 'failed') return 'bad';
    return 'mid';
});

function stageLabel(stage) {
    switch (stage) {
        case 'loading_person': return 'Loading person + identities…';
        case 'loading_messages': return 'Loading messages from corpus…';
        case 'voice': return 'Building voice rulebook…';
        case 'opinions': return 'Extracting opinions…';
        case 'reflexes': return 'Capturing conversational reflexes…';
        case 'stylometric': return 'Selecting stylometric exemplars…';
        case 'relational': return 'Mapping relationships…';
        case 'forbidden': return 'Recording forbidden patterns…';
        case 'embedding': return 'Embedding messages…';
        case 'done': return 'Done';
        default: return 'Initialising…';
    }
}

function fmtTime(ms) {
    if (!ms) return '';
    try { return new Date(Number(ms)).toLocaleTimeString(); } catch { return ''; }
}

async function fetchJSON(url) {
    const r = await RequestGETFromKliveAPI(url, false, true);
    if (!r.ok) return null;
    try { return await r.json(); } catch { return null; }
}
async function postJSON(url, body) {
    const r = await RequestPOSTFromKliveAPI(url, body ? JSON.stringify(body) : '', false, true);
    if (!r.ok) {
        let msg = 'Request failed';
        try { msg = await r.text(); } catch {}
        return { ok: false, error: msg, status: r.status };
    }
    try { return await r.json(); } catch { return { ok: true }; }
}

async function loadStatus() {
    if (!props.personId) return;
    const s = await fetchJSON('/omniscience/replica/status?personId=' + encodeURIComponent(props.personId));
    status.value = s;
    if (s?.status === 'ready') {
        await loadChats();
    }
}

async function loadChats() {
    const list = await fetchJSON('/omniscience/replica/chats?personId=' + encodeURIComponent(props.personId));
    chats.value = list || [];
    if (chats.value.length && !activeChatId.value) {
        await selectChat(chats.value[0]);
    }
}

async function selectChat(c) {
    activeChatId.value = c.chat_id;
    const list = await fetchJSON('/omniscience/replica/chats/messages?chatId=' + c.chat_id);
    messages.value = list || [];
    await nextTick();
    scrollToBottom();
}

async function newChat() {
    const r = await postJSON('/omniscience/replica/chats/new', { personId: props.personId });
    if (r?.chat_id) {
        await loadChats();
        const c = chats.value.find(x => x.chat_id === r.chat_id);
        if (c) await selectChat(c);
    }
}

async function deleteChat(c) {
    if (!confirm('Delete this chat? This cannot be undone.')) return;
    await postJSON('/omniscience/replica/chats/delete', { chatId: c.chat_id });
    if (activeChatId.value === c.chat_id) {
        activeChatId.value = null;
        messages.value = [];
    }
    await loadChats();
}

async function send() {
    const text = draftInput.value.trim();
    if (!text || !activeChatId.value || sending.value) return;
    // Optimistically add the user turn so the input clears immediately.
    messages.value.push({ message_id: 'pending-' + Date.now(), role: 'user', content: text, sent_at: Date.now() });
    draftInput.value = '';
    sending.value = true;
    await nextTick();
    scrollToBottom();
    try {
        const r = await postJSON('/omniscience/replica/chats/send', {
            chatId: activeChatId.value,
            personId: props.personId,
            message: text,
            useSelfCritique: useSelfCritique.value,
        });
        if (r?.ok) {
            // Reload from server so we have the canonical message rows + IDs.
            const list = await fetchJSON('/omniscience/replica/chats/messages?chatId=' + activeChatId.value);
            messages.value = list || [];
        } else {
            messages.value.push({ message_id: 'err-' + Date.now(), role: 'assistant', content: '⚠ ' + (r?.error || 'Request failed'), sent_at: Date.now() });
        }
    } finally {
        sending.value = false;
        await nextTick();
        scrollToBottom();
    }
}

function scrollToBottom() {
    const el = threadEl.value;
    if (el) el.scrollTop = el.scrollHeight;
}

async function startTraining() {
    if (busy.value) return;
    busy.value = true;
    try {
        const r = await postJSON('/omniscience/replica/train', { personId: props.personId });
        if (r?.ok) {
            activeJobId.value = r.job_id;
            status.value = { ...(status.value || {}), status: 'training' };
            startJobPolling();
        } else {
            alert(r?.error || 'Could not start training.');
        }
    } finally { busy.value = false; }
}

function startJobPolling() {
    stopJobPolling();
    jobTimer = setInterval(async () => {
        if (!activeJobId.value) return;
        const j = await fetchJSON('/omniscience/replica/job?jobId=' + activeJobId.value);
        if (!j) return;
        job.value = j;
        if (j.status === 'ok' || j.status === 'failed' || j.status === 'cancelled') {
            stopJobPolling();
            activeJobId.value = null;
            await loadStatus();
        }
    }, 1500);
}
function stopJobPolling() { if (jobTimer) { clearInterval(jobTimer); jobTimer = null; } }

function startStatusPolling() {
    if (statusTimer) clearInterval(statusTimer);
    statusTimer = setInterval(loadStatus, 30000);
}
function stopStatusPolling() { if (statusTimer) { clearInterval(statusTimer); statusTimer = null; } }

watch(() => props.personId, async () => {
    activeChatId.value = null;
    messages.value = [];
    chats.value = [];
    job.value = null;
    activeJobId.value = null;
    stopJobPolling();
    await loadStatus();
}, { immediate: false });

onMounted(async () => {
    await loadStatus();
    startStatusPolling();
});
onBeforeUnmount(() => { stopStatusPolling(); stopJobPolling(); });
</script>

<style scoped>
.replica-panel {
    border: 1px solid rgba(170, 130, 255, 0.25);
    border-radius: 10px;
    background: rgba(40, 25, 70, 0.32);
    padding: 14px;
    margin-bottom: 18px;
}
.rp-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 10px;
}
.rp-title-row { display: flex; align-items: center; gap: 8px; }
.rp-title-row h3 { margin: 0; font-size: 1.05rem; }
.rp-status-pill {
    padding: 2px 8px; border-radius: 999px; font-size: 0.7rem; letter-spacing: 0.05em;
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
}
.rp-status-pill.good { color: #6cffb6; border-color: rgba(108,255,182,0.4); }
.rp-status-pill.mid { color: #ffd56a; border-color: rgba(255,213,106,0.4); }
.rp-status-pill.bad { color: #ff7a8c; border-color: rgba(255,122,140,0.4); }

.rp-training { padding: 8px 4px 0; }
.rp-train-bar {
    height: 8px; border-radius: 4px; background: rgba(255,255,255,0.08); overflow: hidden;
    margin-bottom: 6px;
}
.rp-train-fill {
    height: 100%; background: linear-gradient(90deg, #aa82ff, #6cffb6); transition: width 0.4s ease;
}
.rp-train-meta { display: flex; gap: 10px; align-items: baseline; }
.rp-train-meta .bad { color: #ff7a8c; }
.rp-error { color: #ff7a8c; font-size: 0.85rem; margin-top: 6px; }

.rp-log { list-style: none; padding: 0; margin: 0; max-height: 180px; overflow: auto; font-size: 0.78rem; }
.rp-log li { display: flex; gap: 8px; padding: 2px 0; }
.rp-log-stage { color: #aa82ff; min-width: 70px; }

.rp-idle { padding: 6px 4px; font-size: 0.88rem; }

.rp-chat { display: grid; grid-template-columns: 220px 1fr; gap: 12px; height: 480px; }
@media (max-width: 700px) { .rp-chat { grid-template-columns: 1fr; height: auto; } }
.rp-chat-side {
    border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 8px; overflow: auto;
    background: rgba(20,15,35,0.4);
}
.rp-new-chat {
    width: 100%; padding: 8px; border-radius: 6px;
    background: rgba(170,130,255,0.18); border: 1px solid rgba(170,130,255,0.35);
    color: inherit; cursor: pointer; margin-bottom: 8px;
}
.rp-new-chat:hover { background: rgba(170,130,255,0.28); }
.rp-chat-list { list-style: none; padding: 0; margin: 0; }
.rp-chat-list li {
    display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 6px;
    cursor: pointer; font-size: 0.82rem;
}
.rp-chat-list li:hover { background: rgba(255,255,255,0.05); }
.rp-chat-list li.active { background: rgba(170,130,255,0.18); }
.rp-chat-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rp-chat-del {
    background: transparent; border: none; color: rgba(255,255,255,0.5); cursor: pointer;
    font-size: 1rem; padding: 0 4px;
}
.rp-chat-del:hover { color: #ff7a8c; }
.rp-chat-empty { font-size: 0.78rem; padding: 8px; }

.rp-chat-main { display: flex; flex-direction: column; min-height: 0; }
.rp-thread {
    flex: 1; overflow-y: auto; padding: 8px; border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px; background: rgba(20,15,35,0.4); margin-bottom: 8px;
}
.rp-empty { padding: 20px; text-align: center; }
.rp-msg { display: flex; flex-direction: column; margin-bottom: 8px; }
.rp-msg.user { align-items: flex-end; }
.rp-msg.assistant { align-items: flex-start; }
.rp-msg-bubble {
    max-width: 80%; padding: 8px 12px; border-radius: 12px; white-space: pre-wrap;
    background: rgba(255,255,255,0.06);
}
.rp-msg.user .rp-msg-bubble {
    background: linear-gradient(135deg, rgba(170,130,255,0.35), rgba(108,255,182,0.18));
}
.rp-msg-meta { color: rgba(255,255,255,0.45); font-size: 0.7rem; margin-top: 2px; }
.rp-typing { font-style: italic; opacity: 0.7; }

.rp-compose { display: flex; flex-direction: column; gap: 6px; }
.rp-toggle { font-size: 0.78rem; display: flex; gap: 6px; align-items: center; }
.rp-compose-row { display: flex; gap: 8px; }
.rp-compose-row textarea {
    flex: 1; resize: vertical; padding: 8px; border-radius: 6px;
    background: rgba(20,15,35,0.5); color: inherit;
    border: 1px solid rgba(255,255,255,0.12);
}
.rp-compose-row textarea:focus { outline: none; border-color: rgba(170,130,255,0.55); }

.muted { color: rgba(255,255,255,0.55); }
.mono { font-family: monospace; }
.panel-code.sm { font-size: 0.65rem; padding: 2px 6px; border-radius: 4px;
    background: rgba(170,130,255,0.18); border: 1px solid rgba(170,130,255,0.35); color: #d8c9ff; }
</style>
