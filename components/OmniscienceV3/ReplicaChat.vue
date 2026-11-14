<template>
    <div class="chat" data-testid="replica-chat">
        <div class="ot-banner info" role="note">
            <span class="glyph" aria-hidden="true">✎</span>
            <div><strong>A simulation.</strong><span class="muted">Every reply here is written by a model in {{ group ? 'these people’s' : 'this person’s' }} style from their past messages. Nobody said any of it, and nothing is ever sent to anyone.</span></div>
        </div>

        <OmniscienceV3ErrorBlock v-if="error && !lines.length" :error="error" what="This chat" @retry="load()" />
        <div v-else ref="scroller" class="lines" aria-live="polite">
            <p v-if="loading" class="omni-muted">Loading…</p>
            <p v-else-if="!lines.length" class="omni-muted">{{ group ? 'Nothing said yet. Let them talk, or start them off.' : 'Nothing said yet. Write the first message.' }}</p>
            <div v-for="m in lines" :key="m.seq" class="line" :class="[m.role === 'user' ? 'me' : 'them', m.status ?? '']" :data-testid="`chat-line-${m.seq}`">
                <span class="who">{{ m.role === 'user' ? 'You' : m.speaker ?? name(m.personId) }}<span v-if="m.simulated" class="ot-chip sm">simulated</span></span>
                <span class="text">{{ m.content }}</span>
                <span class="meta omni-muted">
                    <OmniscienceV3Time :ms="m.atMs" mode="age" />
                    <template v-if="m.status === 'failed'"> · could not be written{{ m.error ? `: ${m.error}` : '' }}</template>
                    <template v-else-if="m.status === 'pending'"> · waiting for a reply</template>
                    <template v-if="canChat && m.role !== 'user' && m.simulated">
                        <button class="rate" type="button" :class="{ on: rated[m.seq] === 1 }" :disabled="busy !== null" title="Sounds like them" @click="rate(m, 1)">👍</button>
                        <button class="rate" type="button" :class="{ on: rated[m.seq] === -1 }" :disabled="busy !== null" title="Does not sound like them" @click="rate(m, -1)">👎</button>
                    </template>
                </span>
            </div>
            <p v-if="stage" class="omni-muted stage" data-testid="chat-stage">{{ stage }}</p>
            <p v-if="notice" class="notice" role="status">{{ notice }}</p>
        </div>

        <form v-if="canChat && !chat.archived" class="composer" @submit.prevent="send()">
            <textarea v-model="draft" class="ot-input" rows="2" maxlength="4000" :placeholder="group ? 'Say something to the group (optional)…' : 'Write to them…'" :disabled="writing"
                      data-testid="chat-input" @keydown.enter.exact.prevent="send()"></textarea>
            <div class="omni-row">
                <template v-if="group">
                    <label class="turns">Turns <input v-model.number="turns" class="ot-input" type="number" min="1" max="40" /></label>
                    <button class="ot-btn primary" type="submit" :disabled="writing" data-testid="chat-advance">{{ draft.trim() ? 'Say it, then let them talk' : 'Let them talk' }}</button>
                </template>
                <template v-else>
                    <button class="ot-btn primary" type="submit" :disabled="writing || !draft.trim()" data-testid="chat-send">Send</button>
                    <button class="ot-btn ghost" type="button" :disabled="writing || !canRegenerate" title="Write the last reply again" @click="regenerate()">Write it again</button>
                </template>
                <button v-if="writing" class="ot-btn warn" type="button" data-testid="chat-stop" @click="stop()">Stop</button>
            </div>
        </form>
        <p v-else-if="chat.archived" class="omni-muted">This chat is archived.</p>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue';
import { OmniApiError, isOmniAbort, omniGet, omniPost, omniPostStream, toOmniError } from '~/scripts/omniscience/api';
import type { ReplicaActionResultDto, ReplicaChatDto, ReplicaChatMessageDto, ReplicaChatMessagePageDto, ReplicaStreamEventDto } from '~/scripts/omniscience/contracts';
import { useOmniAction, useOmniNames } from '~/composables/useOmniscienceV3';

/**
 * One replica chat (or a simulated group). Replies arrive line by line as they are written;
 * closing the page, or Stop, tells the server to stop writing. Every simulated line says so.
 */
const props = defineProps<{ chat: ReplicaChatDto; canChat: boolean }>();
const emit = defineEmits<{ changed: [] }>();

const group = computed(() => props.chat.kind === 'group_simulation');
const { busy, run } = useOmniAction();
const { want, name } = useOmniNames();

const lines = shallowRef<ReplicaChatMessageDto[]>([]);
const loading = ref(true);
const error = ref<OmniApiError | null>(null);
const draft = ref('');
const turns = ref(6);
const writing = ref(false);
const stage = ref('');
const notice = ref('');
const rated = reactive<Record<number, number>>({});
const scroller = ref<HTMLElement | null>(null);
let controller: AbortController | null = null;

const canRegenerate = computed(() => lines.value.some(l => l.role !== 'user'));

function toBottom() {
    void nextTick(() => { if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight; });
}

function merge(message: ReplicaChatMessageDto) {
    const rest = lines.value.filter(l => l.seq !== message.seq);
    lines.value = [...rest, message].sort((a, b) => a.seq - b.seq);
    want([message.personId]);
    toBottom();
}

async function load() {
    loading.value = true;
    error.value = null;
    try {
        const all: ReplicaChatMessageDto[] = [];
        let cursor: number | null = null;
        // A chat is read from its start; a very long one stops at the newest 2,000 lines it can page to.
        for (let page = 0; page < 10; page++) {
            const got: ReplicaChatMessagePageDto = await omniGet<ReplicaChatMessagePageDto>('replica/chats/messages', { chatId: props.chat.chatId, cursor, limit: 200 });
            all.push(...got.items);
            if (got.nextCursor === null || got.nextCursor === undefined) break;
            cursor = got.nextCursor;
        }
        lines.value = all;
        want(all.map(l => l.personId));
        toBottom();
    } catch (caught) {
        if (!isOmniAbort(caught)) error.value = toOmniError(caught);
    } finally {
        loading.value = false;
    }
}

function onEvent(ev: ReplicaStreamEventDto) {
    switch (ev.type) {
        case 'accepted': stage.value = group.value ? 'They are talking…' : 'Reading what they have said before…'; break;
        case 'stage': stage.value = `${stageLabel(ev.stage)}${ev.of ? ` (${ev.index} of ${ev.of})` : ''}`; break;
        case 'message': if (ev.message) merge(ev.message); break;
        case 'heartbeat': break;
        case 'done': stage.value = ''; break;
        case 'failed': stage.value = ''; notice.value = ev.text ? `It could not be written: ${ev.text}` : 'It could not be written.'; break;
        case 'cancelled': stage.value = ''; notice.value = ev.text ?? 'Stopped.'; break;
        case 'timeout': stage.value = ''; notice.value = ev.text ?? 'Still being written; it will appear here.'; break;
    }
}

function stageLabel(s: string | null | undefined): string {
    switch (s) {
        case 'composing': return 'Finding how they answered things like this';
        case 'generating': return 'Writing possible replies';
        case 'judging': return 'Choosing the one that sounds most like them';
        default: return s ? s.replace(/_/g, ' ') : 'Working';
    }
}

async function stream(path: string, body: unknown) {
    if (writing.value) return;
    writing.value = true;
    notice.value = '';
    const mine = new AbortController();
    controller = mine;
    try {
        await omniPostStream(path, body, line => { if (!mine.signal.aborted) onEvent(line as ReplicaStreamEventDto); }, mine.signal);
    } catch (caught) {
        const e = toOmniError(caught);
        if (e.kind !== 'aborted') notice.value = e.kind === 'refused' ? `Withheld by policy: ${e.message}` : e.message;
    } finally {
        if (controller === mine) controller = null;
        writing.value = false;
        stage.value = '';
        // What the stream showed is what is stored; re-reading also picks up anything written after a timeout.
        await load();
        emit('changed');
    }
}

async function send() {
    const content = draft.value.trim();
    if (group.value) {
        draft.value = '';
        const n = Math.min(40, Math.max(1, Math.round(turns.value || 1)));
        await stream(content ? 'replica/groups/send' : 'replica/groups/advance', content ? { chatId: props.chat.chatId, content, turns: n } : { chatId: props.chat.chatId, turns: n });
        return;
    }
    if (!content) return;
    draft.value = '';
    await stream('replica/chats/send', { chatId: props.chat.chatId, content });
}

async function regenerate() { await stream('replica/chats/regenerate', { chatId: props.chat.chatId }); }

async function stop() {
    controller?.abort(); // closing the stream is what tells the server to stop writing
    if (!group.value) await run('stop', () => omniPost<ReplicaActionResultDto>('replica/chats/cancel', { chatId: props.chat.chatId }), r => r.detail ?? 'Stopped.');
}

async function rate(m: ReplicaChatMessageDto, rating: 1 | -1) {
    const next = rated[m.seq] === rating ? 0 : rating;
    const result = await run('rate', () => omniPost<ReplicaActionResultDto>('replica/chats/rate', { chatId: props.chat.chatId, seq: m.seq, rating: next }),
        () => (next === 0 ? 'Rating removed.' : next > 0 ? 'Noted: that sounds like them.' : 'Noted: that does not sound like them.'));
    if (result) rated[m.seq] = next;
}

watch(() => props.chat.chatId, () => {
    controller?.abort();
    lines.value = [];
    notice.value = '';
    for (const key of Object.keys(rated)) delete rated[Number(key)];
    void load();
}, { immediate: true });
onBeforeUnmount(() => controller?.abort());
</script>

<style scoped>
.chat { display: flex; flex-direction: column; gap: 10px; }
.lines { display: flex; flex-direction: column; gap: 8px; max-height: 56vh; min-height: 160px; overflow-y: auto; padding: 4px 2px; }
.line { display: flex; flex-direction: column; gap: 2px; max-width: min(720px, 88%); padding: 8px 10px; border-radius: 8px; background: var(--ot-surface-2); font-size: 13.5px; }
.line.me { align-self: flex-end; background: var(--ot-accent-soft); }
.line.them { align-self: flex-start; }
.line.failed { box-shadow: inset 2px 0 0 var(--ot-negative); }
.who { display: flex; gap: 6px; align-items: center; font-size: 11.5px; color: var(--ot-muted); }
.text { white-space: pre-wrap; overflow-wrap: anywhere; }
.meta { display: flex; gap: 6px; align-items: center; font-size: 11px; }
.rate { background: none; border: 0; cursor: pointer; padding: 0 2px; opacity: 0.45; font-size: 12px; }
.rate.on, .rate:hover { opacity: 1; }
.stage { font-size: 12.5px; font-style: italic; }
.notice { margin: 0; font-size: 12.5px; color: var(--ot-warning); }
.composer { display: flex; flex-direction: column; gap: 8px; }
.turns { display: flex; align-items: center; gap: 6px; font-size: 12.5px; }
.turns input { width: 70px; }
.ot-banner .muted { display: block; color: var(--ot-text-2); }
p { margin: 0; }
</style>
