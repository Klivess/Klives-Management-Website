<template>
    <div v-if="personId" class="replica-panel">
        <header class="rp-head">
            <div class="rp-title-row">
                <span class="rp-mark">R</span>
                <div><h3>Replica <span>· {{ displayName || 'this person' }}</span></h3><small>Temporal persona engine · {{ status?.pipeline_version || 'legacy' }}</small></div>
                <span v-if="status?.status" class="rp-status-pill" :class="statusClass">{{ statusText }}</span>
            </div>
            <div class="rp-head-actions">
                <button v-if="isReady" class="rp-button ghost" :class="{ active: mode === 'eras' }" @click="mode = mode === 'eras' ? 'chat' : 'eras'">{{ mode === 'eras' ? 'Chat' : 'Era lab' }}</button>
                <button v-if="canTrain" class="rp-button violet" :disabled="busy" @click="startTraining">{{ isReady ? 'Retrain' : 'Train Replica' }}</button>
            </div>
        </header>
        <div class="rp-disclosure"><strong>AI SIMULATION</strong><span>Not the real person. Generated replies are interpretations, never statements or intentions by them.</span></div>

        <div v-if="status?.status === 'ready' || status?.status === 'stale'" class="rp-readiness">
            <span><b>{{ formatCompact(status.target_messages) }}</b> messages</span>
            <span><b>{{ formatCompact(status.embedded_messages) }}</b> embedded</span>
            <span><b>{{ formatCompact(status.stimulus_reply_pairs) }}</b> reply pairs</span>
            <span><b>{{ status.era_count || 0 }}</b> eras</span>
            <span v-if="status.is_stale" class="rp-warning">New corpus data since training</span>
        </div>
        <div v-if="status?.coverage_warnings?.length" class="rp-coverage-warning">⚠ {{ status.coverage_warnings.join(' · ') }}</div>

        <div v-if="status?.status === 'training' || activeJobId" class="rp-training">
            <div class="rp-train-bar"><div class="rp-train-fill" :style="{ width: (job?.progress_pct || 0) + '%' }" /></div>
            <div class="rp-train-meta"><strong>{{ stageLabel(job?.stage) }}</strong><small>{{ job?.progress_pct || 0 }}%</small></div>
            <p v-if="job?.error" class="rp-error">{{ job.error }}</p>
            <details v-if="job?.log?.length" class="rp-details"><summary>Training log · {{ job.log.length }}</summary><ul class="rp-log"><li v-for="(entry, index) in [...job.log].reverse()" :key="index"><span>{{ fmtTime(entry.at) }}</span><b>{{ entry.stage }}</b><p>{{ entry.msg }}</p></li></ul></details>
        </div>

        <div v-else-if="isReady && mode === 'chat'" class="rp-ready">
            <div class="rp-scopebar">
                <label><span>Persona era</span><select v-model="scopeMode" class="rp-select" @change="applyScope"><option value="live">Current / latest</option><option v-for="era in eras" :key="era.era" :value="era.era">{{ era.era }} era</option><option value="custom">Custom as-of date…</option></select></label>
                <label v-if="scopeMode === 'custom'"><span>As of</span><input v-model="customDate" type="date" class="rp-select" @change="applyScope" /></label>
                <label><span>Context</span><select v-model="contextKind" class="rp-select" @change="applyScope"><option value="auto">Auto / mixed</option><option value="dm">Direct messages</option><option value="group_dm">Group DMs</option><option value="guild_channel">Server</option></select></label>
                <div class="rp-scope-secure">No evidence after {{ scopeMode === 'live' ? 'now' : scopeDateLabel }} enters this chat.</div>
            </div>
            <div v-if="displayStyle?.sample_size" class="rp-style-strip">
                <span><small>Style samples</small><strong>{{ displayStyle.sample_size }}</strong></span>
                <span><small>Median length</small><strong>{{ Math.round(displayStyle.median_length || 0) }} chars</strong></span>
                <span><small>Lowercase</small><strong>{{ pct(displayStyle.lowercase_start_rate) }}</strong></span>
                <span><small>Emoji</small><strong>{{ pct(displayStyle.emoji_rate) }}</strong></span>
                <span v-if="displayStyle.dominant_laugh"><small>Laughter</small><strong>{{ displayStyle.dominant_laugh }}</strong></span>
                <span class="rp-style-tokens"><small>Era vocabulary</small><strong>{{ (displayStyle.signature_tokens || []).slice(0, 4).join(' · ') || '—' }}</strong></span>
            </div>

            <div class="rp-chat">
                <aside class="rp-chat-side">
                    <button class="rp-new-chat" @click="newChat">+ New simulation</button>
                    <div class="rp-chat-list-label">Conversations <span>{{ chats.length }}</span></div>
                    <ul class="rp-chat-list">
                        <li v-for="chat in chats" :key="chat.chat_id" :class="{ active: activeChatId === chat.chat_id }" @click="selectChat(chat)">
                            <span class="rp-chat-title">{{ chat.title || 'Untitled simulation' }}<small>{{ chat.as_of_at ? new Date(chat.as_of_at).getUTCFullYear() : 'Current' }} · {{ chat.context_kind }}</small></span>
                            <span class="rp-chat-actions"><button title="Rename" @click.stop="renameChat(chat)">✎</button><button title="Delete" @click.stop="deleteChat(chat)">×</button></span>
                        </li>
                        <li v-if="!chats.length" class="rp-chat-empty">No simulations yet.</li>
                    </ul>
                    <div class="rp-memory-note"><strong>Memory</strong><p>Recent turns plus compact long-term chat memory. Never added to real-world facts.</p></div>
                </aside>
                <section class="rp-chat-main">
                    <div ref="threadEl" class="rp-thread">
                        <div v-if="!activeChatId" class="rp-empty"><span>◇</span><h4>Start a temporal simulation</h4><p>Pick an era and context, then start a new conversation. Every response is grounded in evidence available at that time.</p><button class="rp-button violet" @click="newChat">New simulation</button></div>
                        <template v-else>
                            <div class="rp-thread-scope">Simulating {{ scopeMode === 'live' ? 'the latest available persona' : `the ${scopeDateLabel} persona` }} · {{ contextKind === 'auto' ? 'mixed context' : contextKind }}</div>
                            <article v-for="message in messages" :key="message.message_id" class="rp-msg" :class="message.role">
                                <div class="rp-msg-bubble">{{ message.content }}</div>
                                <div v-if="message.role === 'assistant'" class="rp-msg-meta">
                                    <span>{{ message.generation_version || 'legacy' }} · {{ Math.round(message.latency_ms || 0) }}ms<span v-if="message.used_self_critique"> · polished</span></span>
                                    <div>
                                        <button v-if="message.evidence_count" @click="toggleEvidence(message)">{{ evidenceById[message.message_id] ? 'Hide' : 'Show' }} evidence · {{ message.evidence_count }}</button>
                                        <button :class="{ active: feedback[message.message_id] === 1 }" title="Accurate voice" @click="rate(message, 1)">↑</button>
                                        <button :class="{ active: feedback[message.message_id] === -1 }" title="Inaccurate voice" @click="rate(message, -1)">↓</button>
                                    </div>
                                </div>
                                <div v-if="evidenceById[message.message_id]" class="rp-evidence">
                                    <strong>Historical evidence consulted <span>not proof of the generated reply</span></strong>
                                    <div v-if="evidenceById[message.message_id].loading" class="rp-muted">Loading evidence…</div>
                                    <article v-for="item in evidenceById[message.message_id].items" :key="item.message_id">
                                        <div><span>{{ item.match_kind }} · {{ item.context_kind }}</span><time>{{ fmtDate(item.sent_at) }}</time></div>
                                        <p v-if="item.stimulus" class="rp-evidence-stimulus">{{ item.stimulus }}</p>
                                        <p>{{ item.reply }}</p><code>{{ item.message_id }}</code>
                                    </article>
                                </div>
                            </article>
                            <div v-if="sending" class="rp-msg assistant"><div class="rp-msg-bubble rp-typing"><i /><i /><i /></div></div>
                        </template>
                    </div>
                    <div v-if="sendError" class="rp-error rp-send-error">{{ sendError }}</div>
                    <div class="rp-compose">
                        <div class="rp-compose-options"><label><input v-model="useSelfCritique" type="checkbox" /> Self-critique pass <span>slower, same scoped evidence</span></label><span v-if="activeChatId">Enter to send · Shift+Enter for a new line</span></div>
                        <div class="rp-compose-row">
                            <textarea v-model="draftInput" :disabled="!activeChatId || sending" rows="2" placeholder="Message the simulation…" @keydown.enter.exact.prevent="send" @keydown.enter.shift.exact="newline" />
                            <button class="rp-button violet" :disabled="!activeChatId || sending || !draftInput.trim()" @click="send">{{ sending ? 'Generating…' : 'Send' }}</button>
                        </div>
                    </div>
                </section>
            </div>
        </div>

        <div v-else-if="isReady && mode === 'eras'" class="rp-era-lab">
            <section class="rp-era-map">
                <div class="rp-section-title"><div><h4>Personality over time</h4><p>Measured annual style fingerprints, not a static persona averaged across years.</p></div></div>
                <div class="rp-era-timeline">
                    <button v-for="era in eraTimeline" :key="era.era" :class="{ selected: scopeMode === era.era }" @click="useEra(era)">
                        <span class="rp-era-year">{{ era.era }}</span><span class="rp-era-count">{{ formatCompact(era.message_count) }} messages</span>
                        <i><b :style="{ width: eraWidth(era) + '%' }" /></i>
                        <span class="rp-era-metrics">{{ Math.round(era.style?.median_length || 0) }} chars · {{ pct(era.style?.lowercase_start_rate) }} lowercase · {{ pct(era.style?.emoji_rate) }} emoji</span>
                    </button>
                </div>
            </section>
            <section class="rp-era-compare">
                <div class="rp-section-title"><div><h4>Same prompt, different era</h4><p>Compare two independently scoped generations with no future evidence.</p></div></div>
                <div class="rp-compare-controls">
                    <label><span>Left era</span><select v-model="leftEra" class="rp-select"><option v-for="era in eras" :key="era.era" :value="era.era">{{ era.era }}</option></select></label>
                    <label><span>Right era</span><select v-model="rightEra" class="rp-select"><option v-for="era in eras" :key="era.era" :value="era.era">{{ era.era }}</option></select></label>
                    <label><span>Context</span><select v-model="compareContext" class="rp-select"><option value="auto">Auto / mixed</option><option value="dm">DM</option><option value="group_dm">Group DM</option><option value="guild_channel">Server</option></select></label>
                </div>
                <textarea v-model="compareInput" class="rp-compare-input" rows="3" placeholder="Ask the same thing to both eras…" />
                <button class="rp-button violet" :disabled="compareLoading || !leftEra || !rightEra || leftEra === rightEra || !compareInput.trim()" @click="compareEras">{{ compareLoading ? 'Comparing…' : 'Compare responses' }}</button>
                <div v-if="compareError" class="rp-error">{{ compareError }}</div>
                <div v-if="compareResult" class="rp-compare-results">
                    <article v-for="side in ['left','right']" :key="side" :class="side">
                        <header><strong>{{ compareResult[side].era }}</strong><span>{{ compareResult[side].evidence_count }} evidence · {{ compareResult[side].generation_version }}</span></header>
                        <p>{{ compareResult[side].polished || compareResult[side].draft }}</p>
                        <footer><span>{{ Math.round(compareResult[side].style?.median_length || 0) }} chars typical</span><span>{{ pct(compareResult[side].style?.lowercase_start_rate) }} lowercase</span><span>{{ pct(compareResult[side].style?.emoji_rate) }} emoji</span></footer>
                    </article>
                </div>
            </section>
        </div>

        <div v-else class="rp-idle">
            <span class="rp-idle-mark">◇</span>
            <h4>{{ status?.status === 'failed' ? 'Training needs attention' : 'Build a temporal Replica' }}</h4>
            <p v-if="status?.last_error" class="rp-error">{{ status.last_error }}</p>
            <p v-else>Analyse distinct eras, context-specific voice, conversational reflexes and real stimulus→reply pairs. Training stays on linked, allow-listed people.</p>
            <p v-if="!profileTargeted" class="rp-muted">Add this person to profile targets before training.</p>
        </div>
    </div>
</template>

<script setup lang="ts">
import { formatCompact, formatDate as formatDateValue, omniscienceError, toUnixMs, useOmniscienceApi } from '~/composables/useOmniscienceApi';

const props = defineProps({
    personId: { type: String, required: true },
    displayName: { type: String, default: '' },
    profileTargeted: { type: Boolean, default: false },
});
const api = useOmniscienceApi();
const status = ref<any>(null);
const job = ref<any>(null);
const activeJobId = ref<number | null>(null);
const chats = ref<any[]>([]);
const activeChatId = ref<number | null>(null);
const messages = ref<any[]>([]);
const draftInput = ref('');
const useSelfCritique = ref(false);
const sending = ref(false);
const busy = ref(false);
const sendError = ref('');
const threadEl = ref<HTMLElement | null>(null);
const mode = ref<'chat' | 'eras'>('chat');
const eras = ref<any[]>([]);
const scopeMode = ref('live');
const customDate = ref('');
const contextKind = ref('auto');
const lastStyle = ref<any>(null);
const evidenceById = ref<Record<string, any>>({});
const feedback = ref<Record<string, number>>({});
const leftEra = ref('');
const rightEra = ref('');
const compareContext = ref('auto');
const compareInput = ref('');
const compareResult = ref<any>(null);
const compareLoading = ref(false);
const compareError = ref('');
let statusTimer: ReturnType<typeof setInterval> | null = null;
let jobTimer: ReturnType<typeof setInterval> | null = null;

const isReady = computed(() => ['ready', 'stale'].includes(status.value?.status));
const canTrain = computed(() => props.profileTargeted && status.value?.status !== 'training');
const statusText = computed(() => !status.value?.status || status.value.status === 'none' ? 'NOT TRAINED' : status.value.status.toUpperCase());
const statusClass = computed(() => isReady.value ? 'good' : status.value?.status === 'failed' ? 'bad' : 'mid');
const selectedEra = computed(() => eras.value.find(era => era.era === scopeMode.value));
const scopeAsOfAt = computed(() => scopeMode.value === 'custom' ? toUnixMs(customDate.value, true) : selectedEra.value?.end_at ?? null);
const scopeDateLabel = computed(() => scopeAsOfAt.value ? new Date(scopeAsOfAt.value).toISOString().slice(0, 10) : 'now');
const displayStyle = computed(() => scopeMode.value === 'live' ? lastStyle.value : selectedEra.value?.style || lastStyle.value);
const eraTimeline = computed(() => [...eras.value].sort((a, b) => Number(a.era) - Number(b.era)));
const maxEraMessages = computed(() => Math.max(1, ...eras.value.map(era => era.message_count || 0)));

function pct(value: number) { return `${Math.round((value || 0) * 100)}%`; }
function eraWidth(era: any) { return Math.max(3, Math.round((era.message_count || 0) / maxEraMessages.value * 100)); }
function fmtTime(value: any) { return value ? new Date(value).toLocaleTimeString() : ''; }
function fmtDate(value: any) { return formatDateValue(value, true); }
function stageLabel(stage: string) {
    return ({ loading_person: 'Loading identities…', loading_messages: 'Loading messages…', temporal: 'Mapping personality eras…', voice: 'Building era-stratified voice…', opinions: 'Extracting opinion history…', reflexes: 'Capturing reflexes…', stylometric: 'Selecting diverse exemplars…', relational: 'Mapping relational registers…', forbidden: 'Recording generic patterns…', embedding: 'Embedding evidence…', done: 'Done' } as any)[stage] || 'Initialising…';
}
function newline(event: KeyboardEvent) { const el = event.target as HTMLTextAreaElement; const start = el.selectionStart; draftInput.value = draftInput.value.slice(0, start) + '\n' + draftInput.value.slice(el.selectionEnd); nextTick(() => { el.selectionStart = el.selectionEnd = start + 1; }); }

async function loadStatus() {
    if (!props.personId) return;
    try {
        status.value = await api.get('/omniscience/replica/status?personId=' + encodeURIComponent(props.personId));
        if (isReady.value) {
            if (!chats.value.length) await loadChats();
            if (!eras.value.length) await loadEras();
        }
    } catch { /* retain last good status */ }
}
async function loadEras() {
    try {
        const data = await api.get('/omniscience/replica/eras?personId=' + encodeURIComponent(props.personId));
        eras.value = data.eras || [];
        if (eras.value.length) {
            leftEra.value ||= eras.value[eras.value.length - 1].era;
            rightEra.value ||= eras.value[0].era;
        }
    } catch { eras.value = []; }
}
async function loadChats() {
    const list = await api.get('/omniscience/replica/chats?personId=' + encodeURIComponent(props.personId));
    chats.value = list || [];
    if (chats.value.length && !activeChatId.value) await selectChat(chats.value[0]);
}
async function selectChat(chat: any) {
    activeChatId.value = chat.chat_id;
    scopeMode.value = chat.as_of_at ? (eras.value.some(era => era.end_at === chat.as_of_at) ? String(new Date(chat.as_of_at).getUTCFullYear()) : 'custom') : 'live';
    if (chat.as_of_at) customDate.value = new Date(chat.as_of_at).toISOString().slice(0, 10);
    contextKind.value = chat.context_kind || 'auto';
    messages.value = await api.get('/omniscience/replica/chats/messages?chatId=' + chat.chat_id) || [];
    const latest = [...messages.value].reverse().find(message => message.style?.sample_size);
    lastStyle.value = latest?.style || null;
    evidenceById.value = {};
    await nextTick(); scrollToBottom();
}
async function newChat() {
    sendError.value = '';
    try {
        const result = await api.post('/omniscience/replica/chats/new', { personId: props.personId, asOfAt: scopeAsOfAt.value, contextKind: contextKind.value });
        await loadChats();
        const chat = chats.value.find(item => item.chat_id === result.chat_id);
        if (chat) await selectChat(chat);
    } catch (cause) { sendError.value = omniscienceError(cause, 'Could not create chat.'); }
}
async function applyScope() {
    compareResult.value = null;
    if (!activeChatId.value) return;
    const chat = chats.value.find(item => item.chat_id === activeChatId.value);
    const unchanged = (chat?.as_of_at ?? null) === (scopeAsOfAt.value ?? null)
        && (chat?.context_kind || 'auto') === contextKind.value;
    if (unchanged) return;
    // Never carry generated turns across eras: they may encode a later voice or
    // knowledge. An untouched chat can be re-scoped; otherwise start a new one.
    if (messages.value.some(message => message.role === 'assistant')) {
        await newChat();
        sendError.value = 'Scope changed — started a new simulation so earlier turns cannot leak across eras.';
        return;
    }
    try { await api.post('/omniscience/replica/chats/settings', { chatId: activeChatId.value, asOfAt: scopeAsOfAt.value, contextKind: contextKind.value }); }
    catch (cause) { sendError.value = omniscienceError(cause, 'Could not update scope.'); }
}
function useEra(era: any) { scopeMode.value = era.era; mode.value = 'chat'; void applyScope(); }
async function renameChat(chat: any) {
    const title = prompt('Conversation name', chat.title || '');
    if (title === null) return;
    await api.post('/omniscience/replica/chats/rename', { chatId: chat.chat_id, title });
    chat.title = title;
}
async function deleteChat(chat: any) {
    if (!confirm('Delete this simulation and its memory?')) return;
    await api.post('/omniscience/replica/chats/delete', { chatId: chat.chat_id });
    if (activeChatId.value === chat.chat_id) { activeChatId.value = null; messages.value = []; }
    await loadChats();
}
async function send() {
    const text = draftInput.value.trim();
    if (!text || !activeChatId.value || sending.value) return;
    messages.value.push({ message_id: 'pending-' + Date.now(), role: 'user', content: text, sent_at: Date.now() });
    draftInput.value = ''; sending.value = true; sendError.value = '';
    await nextTick(); scrollToBottom();
    try {
        const result = await api.post('/omniscience/replica/chats/send', {
            chatId: activeChatId.value, personId: props.personId, message: text,
            useSelfCritique: useSelfCritique.value, asOfAt: scopeAsOfAt.value,
            contextKind: contextKind.value, includeEvidence: true,
        }, { timeoutMs: 180_000 });
        lastStyle.value = result.style;
        messages.value = await api.get('/omniscience/replica/chats/messages?chatId=' + activeChatId.value) || [];
        if (result.low_coverage) sendError.value = 'Low contemporaneous coverage: this response is intentionally less specific.';
    } catch (cause) { sendError.value = omniscienceError(cause, 'Generation failed.'); }
    finally { sending.value = false; await nextTick(); scrollToBottom(); }
}
async function toggleEvidence(message: any) {
    if (evidenceById.value[message.message_id]) { delete evidenceById.value[message.message_id]; return; }
    evidenceById.value[message.message_id] = { loading: true, items: [] };
    try {
        const data = await api.get('/omniscience/replica/evidence?messageId=' + message.message_id);
        evidenceById.value[message.message_id] = { loading: false, items: data.evidence || [] };
    } catch (cause) { evidenceById.value[message.message_id] = { loading: false, items: [], error: omniscienceError(cause) }; }
}
async function rate(message: any, rating: number) {
    feedback.value[message.message_id] = rating;
    try { await api.post('/omniscience/replica/feedback', { personId: props.personId, chatId: activeChatId.value, messageId: message.message_id, rating, asOfAt: message.as_of_at, contextKind: message.context_kind }); }
    catch { delete feedback.value[message.message_id]; }
}
async function compareEras() {
    const left = eras.value.find(era => era.era === leftEra.value);
    const right = eras.value.find(era => era.era === rightEra.value);
    if (!left || !right) return;
    compareLoading.value = true; compareError.value = ''; compareResult.value = null;
    try {
        compareResult.value = await api.post('/omniscience/replica/compare', {
            personId: props.personId, message: compareInput.value,
            leftAsOfAt: left.end_at, rightAsOfAt: right.end_at, contextKind: compareContext.value,
        }, { timeoutMs: 240_000 });
    } catch (cause) { compareError.value = omniscienceError(cause, 'Era comparison failed.'); }
    finally { compareLoading.value = false; }
}
async function startTraining() {
    if (busy.value) return;
    busy.value = true;
    try {
        const result = await api.post('/omniscience/replica/train', { personId: props.personId });
        activeJobId.value = result.job_id;
        status.value = { ...(status.value || {}), status: 'training' };
        startJobPolling();
    } catch (cause) { alert(omniscienceError(cause, 'Could not start training.')); }
    finally { busy.value = false; }
}
function startJobPolling() {
    stopJobPolling();
    jobTimer = setInterval(async () => {
        if (!activeJobId.value) return;
        try {
            const current = await api.get('/omniscience/replica/job?jobId=' + activeJobId.value);
            job.value = current;
            if (['ok', 'failed', 'cancelled'].includes(current.status)) {
                stopJobPolling(); activeJobId.value = null; status.value = null; eras.value = []; chats.value = [];
                await loadStatus();
            }
        } catch { /* retry next tick */ }
    }, 1600);
}
function stopJobPolling() { if (jobTimer) { clearInterval(jobTimer); jobTimer = null; } }
function scrollToBottom() { if (threadEl.value) threadEl.value.scrollTop = threadEl.value.scrollHeight; }
async function initialise() {
    activeChatId.value = null; messages.value = []; chats.value = []; eras.value = []; status.value = null; evidenceById.value = {};
    stopJobPolling(); await loadStatus();
}
watch(() => props.personId, initialise);
onMounted(async () => {
    await initialise();
    statusTimer = setInterval(() => { if (document.visibilityState === 'visible') void loadStatus(); }, 30_000);
});
onBeforeUnmount(() => { if (statusTimer) clearInterval(statusTimer); stopJobPolling(); });
</script>

<style scoped>
.replica-panel { margin-bottom: 14px; padding: 14px; border: 1px solid rgba(151,113,255,.25); border-radius: 13px; background: linear-gradient(145deg,rgba(151,113,255,.065),rgba(95,211,255,.025)); }
.rp-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; }
.rp-title-row { display: flex; align-items: center; gap: 9px; }
.rp-mark { display: grid; place-items: center; width: 31px; height: 31px; border: 1px solid rgba(151,113,255,.45); border-radius: 9px; color: var(--os-violet); background: rgba(151,113,255,.12); font: 800 14px var(--os-mono); }
.rp-title-row h3 { margin: 0; color: var(--os-ink); font-size: 14px; }
.rp-title-row h3 span { color: var(--os-violet); }
.rp-title-row small { display: block; margin-top: 2px; overflow: hidden; color: var(--os-faint); font: 600 8px var(--os-mono); text-transform: uppercase; letter-spacing: .06em; text-overflow: ellipsis; white-space: nowrap; }
.rp-head-actions { display: flex; gap: 6px; }
.rp-button { padding: 7px 11px; border: 1px solid var(--os-line); border-radius: 7px; background: rgba(255,255,255,.03); color: var(--os-ink); cursor: pointer; font: 700 10px inherit; }
.rp-button.violet { border-color: rgba(151,113,255,.45); background: rgba(151,113,255,.14); color: var(--os-violet); }
.rp-button.ghost.active { border-color: var(--os-cyan); color: var(--os-cyan); }
.rp-button:disabled { opacity: .45; cursor: wait; }
.rp-status-pill { padding: 3px 7px; border: 1px solid var(--os-line); border-radius: 999px; color: var(--os-amber); font: 750 8px var(--os-mono); }
.rp-status-pill.good { border-color: rgba(107,255,159,.35); color: var(--os-green); }
.rp-status-pill.bad { color: var(--os-red); }
.rp-disclosure { display: flex; align-items: center; gap: 8px; padding: 7px 9px; margin-bottom: 10px; border: 1px solid rgba(255,194,71,.18); border-radius: 7px; background: rgba(255,194,71,.04); }
.rp-disclosure strong { color: var(--os-amber); font: 800 8px var(--os-mono); letter-spacing: .08em; }
.rp-disclosure span { color: var(--os-muted); font-size: 9px; }
.rp-readiness { display: flex; flex-wrap: wrap; gap: 12px; margin: 7px 0 10px; color: var(--os-muted); font-size: 9px; }
.rp-readiness b { color: var(--os-cyan); }
.rp-warning { color: var(--os-amber); }
.rp-coverage-warning { margin-bottom: 9px; color: var(--os-amber); font-size: 9px; }
.rp-train-bar { height: 7px; overflow: hidden; border-radius: 5px; background: rgba(255,255,255,.07); }
.rp-train-fill { height: 100%; background: linear-gradient(90deg,var(--os-violet),var(--os-cyan)); transition: width .3s; }
.rp-train-meta { display: flex; justify-content: space-between; margin-top: 7px; color: var(--os-muted); font-size: 10px; }
.rp-log { max-height: 180px; overflow: auto; padding: 0; list-style: none; }
.rp-log li { display: grid; grid-template-columns: 70px 90px 1fr; gap: 6px; padding: 4px 0; color: var(--os-muted); font-size: 9px; }
.rp-log li p { margin: 0; }
.rp-scopebar { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; padding: 9px; margin-bottom: 8px; border: 1px solid var(--os-line); border-radius: 9px; background: rgba(255,255,255,.018); }
.rp-scopebar label > span, .rp-compare-controls label > span { display: block; margin-bottom: 4px; color: var(--os-faint); font: 700 8px var(--os-mono); text-transform: uppercase; }
.rp-select { min-width: 125px; padding: 7px 9px; border: 1px solid var(--os-line); border-radius: 6px; background: #101824; color: var(--os-ink-dim); font-size: 10px; }
.rp-scope-secure { flex: 1; min-width: 180px; color: var(--os-faint); font-size: 9px; text-align: right; }
.rp-style-strip { display: flex; gap: 12px; overflow-x: auto; padding: 7px 9px; margin-bottom: 8px; border: 1px solid var(--os-line); border-radius: 8px; }
.rp-style-strip > span { min-width: max-content; }
.rp-style-strip small, .rp-style-strip strong { display: block; }
.rp-style-strip small { color: var(--os-faint); font-size: 7px; text-transform: uppercase; }
.rp-style-strip strong { margin-top: 2px; color: var(--os-ink-dim); font: 700 9px var(--os-mono); }
.rp-style-tokens { flex: 1; }
.rp-chat { display: grid; grid-template-columns: 210px minmax(0,1fr); gap: 9px; height: 540px; }
.rp-chat-side { display: flex; flex-direction: column; min-height: 0; padding: 8px; border: 1px solid var(--os-line); border-radius: 9px; background: rgba(3,7,13,.3); }
.rp-new-chat { width: 100%; padding: 7px; border: 1px solid rgba(151,113,255,.3); border-radius: 6px; background: rgba(151,113,255,.1); color: var(--os-violet); cursor: pointer; font-size: 10px; }
.rp-chat-list-label { display: flex; justify-content: space-between; gap: 6px; padding: 12px 3px 5px; overflow: hidden; color: var(--os-faint); font: 700 8px var(--os-mono); text-transform: uppercase; white-space: nowrap; }
.rp-chat-list { flex: 1; min-height: 0; overflow-y: auto; padding: 0; margin: 0; list-style: none; }
.rp-chat-list li { display: flex; align-items: center; padding: 7px; border-radius: 6px; cursor: pointer; }
.rp-chat-list li.active { background: rgba(151,113,255,.12); }
.rp-chat-list li:hover { background: rgba(255,255,255,.04); }
.rp-chat-title { flex: 1; min-width: 0; overflow: hidden; color: var(--os-ink-dim); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.rp-chat-title small { display: block; margin-top: 2px; color: var(--os-faint); font-size: 8px; }
.rp-chat-actions { display: none; }
.rp-chat-list li:hover .rp-chat-actions { display: flex; }
.rp-chat-actions button { border: 0; background: transparent; color: var(--os-muted); cursor: pointer; }
.rp-chat-empty { color: var(--os-faint); font-size: 9px; }
.rp-memory-note { padding-top: 8px; border-top: 1px solid var(--os-line); }
.rp-memory-note strong { color: var(--os-muted); font-size: 8px; text-transform: uppercase; }
.rp-memory-note p { margin: 3px 0 0; color: var(--os-faint); font-size: 8px; line-height: 1.4; }
.rp-chat-main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.rp-thread { flex: 1; min-height: 0; overflow-y: auto; padding: 10px; border: 1px solid var(--os-line); border-radius: 9px; background: rgba(3,7,13,.28); }
.rp-thread-scope { margin-bottom: 12px; color: var(--os-faint); font: 600 8px var(--os-mono); text-align: center; text-transform: uppercase; letter-spacing: .06em; }
.rp-empty { display: grid; place-items: center; height: 100%; padding: 25px; text-align: center; }
.rp-empty > span { color: var(--os-violet); font-size: 32px; }
.rp-empty h4 { margin: 10px 0 5px; color: var(--os-ink); }
.rp-empty p { max-width: 390px; margin: 0 0 13px; color: var(--os-muted); font-size: 10px; line-height: 1.55; }
.rp-msg { display: flex; flex-direction: column; margin-bottom: 10px; }
.rp-msg.user { align-items: flex-end; }
.rp-msg.assistant { align-items: flex-start; }
.rp-msg-bubble { max-width: 82%; padding: 8px 11px; border: 1px solid var(--os-line); border-radius: 11px; background: rgba(255,255,255,.04); color: var(--os-ink); font-size: 12px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
.rp-msg.user .rp-msg-bubble { border-color: rgba(151,113,255,.25); background: rgba(151,113,255,.14); }
.rp-msg-meta { display: flex; align-items: center; gap: 8px; max-width: 90%; margin-top: 3px; color: var(--os-faint); font-size: 8px; }
.rp-msg-meta > div { display: flex; gap: 4px; }
.rp-msg-meta button { padding: 1px 4px; border: 0; background: transparent; color: var(--os-cyan); cursor: pointer; font-size: 8px; }
.rp-msg-meta button.active { color: var(--os-violet); }
.rp-typing { display: flex; gap: 4px; }
.rp-typing i { width: 5px; height: 5px; border-radius: 50%; background: var(--os-violet); animation: rp-bounce 1s infinite; }
.rp-typing i:nth-child(2) { animation-delay: .15s; }.rp-typing i:nth-child(3) { animation-delay: .3s; }
@keyframes rp-bounce { 50% { transform: translateY(-4px); opacity: .5; } }
.rp-evidence { width: 94%; padding: 8px; margin-top: 5px; border: 1px solid var(--os-line); border-radius: 8px; background: rgba(0,0,0,.18); }
.rp-evidence > strong { display: block; margin-bottom: 7px; color: var(--os-cyan); font-size: 9px; }
.rp-evidence > strong span { margin-left: 5px; color: var(--os-faint); font-weight: 400; }
.rp-evidence article { padding: 6px 0; border-top: 1px solid rgba(255,255,255,.05); }
.rp-evidence article > div { display: flex; justify-content: space-between; color: var(--os-faint); font-size: 8px; }
.rp-evidence article p { margin: 4px 0; color: var(--os-ink-dim); font-size: 10px; white-space: pre-wrap; }
.rp-evidence-stimulus { opacity: .7; }
.rp-evidence code { color: var(--os-faint); font-size: 8px; overflow-wrap: anywhere; }
.rp-compose { margin-top: 7px; }
.rp-compose-options { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 5px; color: var(--os-faint); font-size: 8px; }
.rp-compose-options label input { vertical-align: middle; }
.rp-compose-options label span { margin-left: 4px; }
.rp-compose-row { display: flex; gap: 7px; }
.rp-compose-row textarea { flex: 1; resize: vertical; padding: 8px 10px; border: 1px solid var(--os-line); border-radius: 8px; outline: 0; background: rgba(3,7,13,.45); color: var(--os-ink); font: 500 11px/1.5 inherit; }
.rp-compose-row textarea:focus { border-color: rgba(151,113,255,.55); }
.rp-send-error { margin-top: 5px; }
.rp-error { color: var(--os-red); font-size: 10px; }
.rp-muted { color: var(--os-muted); font-size: 10px; }
.rp-idle { padding: 25px 12px; text-align: center; }
.rp-idle-mark { color: var(--os-violet); font-size: 30px; }
.rp-idle h4 { margin: 8px 0; color: var(--os-ink); }
.rp-idle p { max-width: 570px; margin: 5px auto; color: var(--os-muted); font-size: 10px; line-height: 1.55; }
.rp-era-map { margin-bottom: 16px; }
.rp-section-title h4 { margin: 0; color: var(--os-ink); font-size: 12px; }
.rp-section-title p { margin: 3px 0 10px; color: var(--os-muted); font-size: 10px; }
.rp-era-timeline { display: flex; gap: 7px; overflow-x: auto; padding-bottom: 6px; }
.rp-era-timeline button { display: grid; grid-template-columns: auto minmax(0,1fr); min-width: 165px; padding: 9px; border: 1px solid var(--os-line); border-radius: 8px; background: rgba(255,255,255,.018); color: inherit; cursor: pointer; text-align: left; }
.rp-era-timeline button.selected { border-color: var(--os-violet); background: rgba(151,113,255,.08); }
.rp-era-year { grid-column: 1; color: var(--os-violet); font: 800 15px var(--os-mono); }
.rp-era-count { grid-column: 2; color: var(--os-faint); font-size: 8px; text-align: right; }
.rp-era-timeline i { display: block; grid-column: 1 / -1; height: 4px; margin: 8px 0; border-radius: 3px; background: rgba(255,255,255,.06); }
.rp-era-timeline i b { display: block; height: 100%; border-radius: 3px; background: linear-gradient(90deg,var(--os-violet),var(--os-cyan)); }
.rp-era-metrics { grid-column: 1 / -1; color: var(--os-muted); font-size: 8px; line-height: 1.5; }
.rp-compare-controls { display: flex; gap: 8px; margin-bottom: 8px; }
.rp-compare-controls label { flex: 1; }
.rp-compare-controls .rp-select { width: 100%; }
.rp-compare-input { width: 100%; padding: 9px; margin-bottom: 8px; border: 1px solid var(--os-line); border-radius: 8px; background: rgba(3,7,13,.4); color: var(--os-ink); font: 500 11px inherit; resize: vertical; }
.rp-compare-results { display: grid; grid-template-columns: repeat(2,1fr); gap: 9px; margin-top: 12px; }
.rp-compare-results article { padding: 11px; border: 1px solid var(--os-line); border-radius: 9px; background: rgba(255,255,255,.018); }
.rp-compare-results article.left { border-top: 2px solid var(--os-cyan); }.rp-compare-results article.right { border-top: 2px solid var(--os-violet); }
.rp-compare-results header { display: flex; justify-content: space-between; color: var(--os-faint); font-size: 8px; }
.rp-compare-results header strong { color: var(--os-cyan); font-size: 13px; }
.rp-compare-results p { min-height: 60px; color: var(--os-ink); font-size: 12px; white-space: pre-wrap; }
.rp-compare-results footer { display: flex; flex-wrap: wrap; gap: 8px; color: var(--os-faint); font-size: 8px; }
@media (max-width: 850px) { .rp-chat { grid-template-columns: 1fr; height: auto; } .rp-chat-side { max-height: 180px; } .rp-thread { height: 430px; } .rp-memory-note { display: none; } .rp-scope-secure { text-align: left; } }
@media (max-width: 620px) { .rp-head { align-items: flex-start; flex-direction: column; } .rp-disclosure { align-items: flex-start; flex-direction: column; } .rp-style-strip { display: none; } .rp-compare-results { grid-template-columns: 1fr; } .rp-compare-controls { flex-direction: column; } .rp-compose-options > span { display: none; } }
</style>
