<template>
    <div class="omx-split" data-testid="omx-talk">
        <section class="omx-card">
            <div class="omx-toolbar">
                <input v-model="filter" class="omx-input omx-grow" type="search" placeholder="Filter conversations" aria-label="Filter conversations" />
                <div class="omx-seg" role="group" aria-label="Kind">
                    <button v-for="k in KINDS" :key="k.id" type="button" :aria-pressed="kind === k.id" @click="kind = k.id">{{ k.label }}</button>
                </div>
            </div>
            <div v-if="listError" class="omx-card-body"><div class="omx-error" role="alert"><span class="omx-grow">{{ listError }}</span><button class="omx-btn sm" type="button" @click="loadList()">Try again</button></div></div>
            <div v-else-if="conversations === null" class="omx-skels"><div v-for="n in 7" :key="n" class="omx-skel" :style="{ width: `${50 + (n * 11) % 40}%` }"></div></div>
            <ul v-else-if="shown.length" class="omx-rows" style="max-height: 72vh; overflow-y: auto" data-testid="omx-conversations">
                <li v-for="c in shown" :key="c.conversation_id" :class="{ cursor: c.conversation_id === selected }" style="padding: 0">
                    <button class="omx-rowbtn" type="button" style="border-bottom: 0" @click="open(c.conversation_id)">
                        <span class="omx-row-main"><strong>{{ titleOf(c) }}</strong><small>{{ c.platform }} · {{ kindLabel(c.kind) }} · last {{ omxAgo(c.last_seen, omx.now.value) }}</small></span>
                        <span class="omx-num omx-dim">{{ omxCompact(c.message_count) }}</span>
                    </button>
                </li>
            </ul>
            <div v-else class="omx-empty"><strong>No conversation matches</strong>The {{ conversations.length }} busiest are listed; clear the filter to see them.</div>
            <div v-if="conversations" class="omx-card-foot">The {{ conversations.length }} busiest conversations, most messages first.</div>
        </section>

        <section class="omx-card">
            <div class="omx-card-head">
                <h2 class="omx-clip">{{ current ? titleOf(current) : selected ? selected : 'Pick a conversation' }}</h2>
                <span v-if="current" class="omx-sub">{{ omxNum(current.message_count) }} messages · since {{ omxDate(current.first_seen) }}</span>
                <div class="omx-acts">
                    <button v-if="selected" class="omx-btn sm" type="button" title="Search inside this conversation" @click="omx.go('ask', { mode: 'scope', c: selected })"><OmniscienceIcon name="ask" /> Search in it</button>
                </div>
            </div>
            <div v-if="!selected" class="omx-empty"><strong>The messages themselves</strong>Pick a conversation on the left to read it, newest first.</div>
            <div v-else-if="error" class="omx-card-body"><div class="omx-error" role="alert"><span class="omx-grow">{{ error }}</span><button class="omx-btn sm" type="button" @click="loadMessages(true)">Try again</button></div></div>
            <div v-else-if="loading && !messages.length" class="omx-skels"><div v-for="n in 6" :key="n" class="omx-skel" :style="{ width: `${40 + (n * 19) % 45}%` }"></div></div>
            <div v-else-if="messages.length" data-testid="omx-talk-messages">
                <div v-for="m in messages" :key="m.message_id" class="omx-msg">
                    <div class="omx-msg-head">
                        <button v-if="m.author_person_id" class="omx-link" type="button" style="font-weight: 600" @click="omx.peekId.value = m.author_person_id">{{ m.author_display_name || m.author_username || 'someone' }}</button>
                        <strong v-else>{{ m.author_display_name || m.author_username || 'someone' }}</strong>
                        <span :title="omxDateTime(m.sent_at)">{{ omxDateTime(m.sent_at) }}</span>
                    </div>
                    <div class="omx-msg-text">{{ m.content || '(no text: an attachment or an embed)' }}</div>
                </div>
            </div>
            <div v-else class="omx-empty">No message is stored for this conversation.</div>
            <div v-if="more" class="omx-card-foot"><button class="omx-btn sm" type="button" :disabled="loading" @click="loadMessages(false)">{{ loading ? 'Reading…' : 'Load older' }}</button></div>
        </section>
    </div>
</template>

<script setup lang="ts">
import { omxAgo, omxCompact, omxDate, omxDateTime, omxErrorText, omxNum } from '~/scripts/omniscienceConsole';

/**
 * The messages themselves. The engine has always been able to list conversations and read them;
 * until this view no page did, so a fact could be traced to a message id and no further.
 */
const PAGE = 100;
const KINDS = [{ id: '', label: 'All' }, { id: 'dm', label: 'Direct' }, { id: 'group_dm', label: 'Groups' }, { id: 'guild_channel', label: 'Servers' }];

const omx = useOmx();
const selected = omx.query('c');
const conversations = ref<any[] | null>(null);
const listError = ref('');
const filter = ref('');
const kind = ref('');
const messages = ref<any[]>([]);
const loading = ref(false);
const more = ref(false);
const error = ref('');

const kindLabel = (k: unknown) => (k === 'dm' ? 'direct' : k === 'group_dm' ? 'group' : k === 'guild_channel' ? 'server channel' : String(k ?? 'unknown'));
const titleOf = (c: any) => (c.guild_name && c.title ? `${c.guild_name} · #${c.title}` : c.title || c.guild_name || c.conversation_id);
const shown = computed(() => {
    const needle = filter.value.trim().toLowerCase();
    return (conversations.value ?? []).filter(c => !needle || titleOf(c).toLowerCase().includes(needle));
});
const current = computed(() => (conversations.value ?? []).find(c => c.conversation_id === selected.value) ?? null);

async function loadList() {
    conversations.value = null; listError.value = '';
    try {
        const data = await omx.api.get('/omniscience/conversations?limit=300' + (kind.value ? `&kind=${kind.value}` : ''));
        conversations.value = Array.isArray(data) ? data : data?.conversations ?? [];
    } catch (cause) { listError.value = omxErrorText(cause, 'The conversations could not be listed.'); conversations.value = []; }
}
async function loadMessages(reset: boolean) {
    const id = selected.value;
    if (!id || (loading.value && !reset)) return;
    loading.value = true; error.value = '';
    try {
        const offset = reset ? 0 : messages.value.length;
        const page = await omx.api.get(`/omniscience/conversations/messages?conversationId=${encodeURIComponent(id)}&limit=${PAGE}&offset=${offset}`);
        if (id !== selected.value) return;
        const rows = Array.isArray(page) ? page : [];
        messages.value = reset ? rows : [...messages.value, ...rows];
        more.value = rows.length === PAGE;
    } catch (cause) { if (id === selected.value) error.value = omxErrorText(cause, 'This conversation could not be read.'); }
    finally { loading.value = false; }
}
function open(id: string) { omx.patchQuery({ c: id }); }

watch(kind, loadList, { immediate: true });
watch(selected, () => { messages.value = []; more.value = false; void loadMessages(true); }, { immediate: true });
</script>
