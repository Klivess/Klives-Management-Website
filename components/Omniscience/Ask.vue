<template>
    <div class="omx-grid" data-testid="omx-ask">
        <div class="omx-stack">
            <section class="omx-card">
                <form class="omx-toolbar" @submit.prevent="run()">
                    <div class="omx-seg" role="group" aria-label="How to look">
                        <button v-for="m in MODES" :key="m.id" type="button" :aria-pressed="mode === m.id" :title="m.help" :data-testid="`omx-ask-${m.id}`" @click="setMode(m.id)">{{ m.label }}</button>
                    </div>
                    <input ref="box" v-model="f.q" class="omx-input omx-grow" style="flex-basis: 260px; height: 36px; font-size: 13.5px" :placeholder="placeholder" aria-label="What to look for" data-testid="omx-ask-input" />
                    <button class="omx-btn primary" type="submit" style="height: 36px" :disabled="loading" data-testid="omx-ask-run">{{ loading ? 'Looking…' : mode === 'ask' ? 'Ask' : 'Search' }}</button>
                </form>
                <div v-if="mode === 'scope'" class="omx-toolbar" data-testid="omx-scope-filters">
                    <div style="flex: 1 1 200px; max-width: 260px"><OmnisciencePersonPick v-model="f.personId" v-model:label="personName" placeholder="Written by anyone" /></div>
                    <input v-model="f.conversationId" class="omx-input omx-mono" style="flex: 0 1 190px" placeholder="conversation id" aria-label="Conversation id" />
                    <label class="omx-rowflex omx-dim" style="font-size: 12px">From <input v-model="f.fromDate" class="omx-input" type="date" /></label>
                    <label class="omx-rowflex omx-dim" style="font-size: 12px">To <input v-model="f.toDate" class="omx-input" type="date" /></label>
                    <select v-model="f.contextKind" class="omx-select" aria-label="Where"><option value="all">Anywhere</option><option value="dm">Direct messages</option><option value="group_dm">Group chats</option><option value="guild_channel">Servers</option></select>
                    <select v-model="f.platform" class="omx-select" aria-label="Platform"><option value="all">Any platform</option><option value="discord">Discord</option><option value="whatsapp">WhatsApp</option><option value="test">Imports</option></select>
                </div>
                <div class="omx-card-foot">{{ MODES.find(m => m.id === mode)?.help }}</div>
            </section>

            <div v-if="error" class="omx-error" role="alert"><span class="omx-grow">{{ error }}</span><button class="omx-btn sm" type="button" @click="run()">Try again</button></div>

            <section v-if="mode === 'ask' && answer" class="omx-card" data-testid="omx-answer">
                <div class="omx-card-head"><h2>Answer</h2><span class="omx-sub">written by a model from the messages cited below</span></div>
                <div class="omx-card-body"><OmniscienceMd :source="answer" /></div>
            </section>

            <section v-if="searched" class="omx-card" data-testid="omx-ask-results">
                <div class="omx-card-head">
                    <h2>{{ mode === 'ask' ? 'Cited messages' : 'Messages' }}</h2><span class="omx-sub">{{ results.length }}{{ hasMore ? '+' : '' }}</span>
                    <div v-if="mode === 'scope'" class="omx-acts">
                        <template v-if="saving">
                            <input v-model="saveName" class="omx-input" style="height: 26px; width: 180px" placeholder="Name it" aria-label="Name of the investigation" @keydown.enter.prevent="save()" />
                            <button class="omx-btn sm primary" type="button" :disabled="!saveName.trim()" @click="save()">Save</button>
                        </template>
                        <button v-else class="omx-btn sm" type="button" data-testid="omx-ask-save" @click="startSave()">★ Save</button>
                        <button class="omx-btn sm" type="button" :disabled="!results.length" @click="exportCsv()"><OmniscienceIcon name="download" /> CSV</button>
                        <button class="omx-btn sm icon" type="button" aria-label="Earlier messages" :disabled="offset === 0 || loading" @click="page(-1)"><OmniscienceIcon name="back" /></button>
                        <button class="omx-btn sm icon" type="button" aria-label="Later messages" :disabled="!hasMore || loading" @click="page(1)"><OmniscienceIcon name="go" /></button>
                    </div>
                </div>
                <div v-if="results.length">
                    <div v-for="(r, i) in results" :key="r.message_id ?? i" class="omx-msg">
                        <div class="omx-msg-head">
                            <span v-if="mode === 'ask'" class="omx-chip accent">{{ i + 1 }}</span>
                            <button v-if="r.author_person_id || r.person_id" class="omx-link" type="button" style="font-weight: 600" @click="omx.peekId.value = String(r.author_person_id || r.person_id)">{{ r.author_display || 'someone' }}</button>
                            <strong v-else>{{ r.author_display || 'someone' }}</strong>
                            <button v-if="r.conversation_id" class="omx-link" type="button" style="color: inherit" :title="'Open this conversation'" @click="omx.go('talk', { c: r.conversation_id })">{{ omxWhere(r) }}</button>
                            <span v-else>{{ omxWhere(r) }}</span>
                            <span>{{ omxDateTime(r.sent_at) }}</span>
                            <span v-if="mode === 'find' && r.score != null" class="omx-chip" title="How close in meaning">{{ Math.round(r.score * 100) }}%</span>
                            <span class="omx-grow"></span>
                            <button class="omx-btn quiet sm icon" type="button" :aria-label="copied === (r.message_id ?? i) ? 'Copied' : 'Copy the text'" @click="copy(r, i)"><OmniscienceIcon :name="copied === (r.message_id ?? i) ? 'check' : 'copy'" /></button>
                        </div>
                        <div class="omx-msg-text">{{ r.content }}</div>
                    </div>
                </div>
                <div v-else class="omx-empty"><strong>Nothing found</strong>{{ mode === 'scope' ? 'Loosen the dates or the place, or drop the words.' : 'Try other words: this search goes by meaning, not spelling.' }}</div>
            </section>
            <div v-else-if="!loading && !error" class="omx-card"><div class="omx-empty"><strong>{{ MODES.find(m => m.id === mode)?.label }}</strong>{{ MODES.find(m => m.id === mode)?.help }}</div></div>
        </div>

        <div class="omx-stack">
            <section class="omx-card" data-testid="omx-saved">
                <div class="omx-card-head"><h2>Saved investigations</h2><span class="omx-sub">{{ omx.queries.value.length }}</span></div>
                <ul v-if="omx.queries.value.length" class="omx-rows">
                    <li v-for="s in omx.queries.value" :key="s.query_id" style="padding: 0">
                        <button class="omx-rowbtn" type="button" style="border-bottom: 0" @click="applySaved(s)"><span class="omx-star on">★</span><span class="omx-row-main"><strong>{{ s.name }}</strong><small>used {{ s.use_count || 0 }} times</small></span></button>
                        <button class="omx-btn quiet sm icon" type="button" style="margin-right: 8px" :aria-label="`Delete ${s.name}`" @click="removeSaved(s)"><OmniscienceIcon name="trash" /></button>
                    </li>
                </ul>
                <div v-else class="omx-empty">Run an exact search and save it to keep it here.</div>
            </section>
            <section class="omx-card">
                <div class="omx-card-head"><h2>Recent</h2><div class="omx-acts"><button v-if="omx.history.value.length" class="omx-btn quiet sm" type="button" @click="clearHistory()">Clear</button></div></div>
                <div v-if="omx.history.value.length">
                    <button v-for="h in omx.history.value.slice(0, 10)" :key="h.history_id" class="omx-rowbtn" type="button" @click="applyScope(h.scope || { q: h.query_text })">
                        <OmniscienceIcon name="clock" /><span class="omx-row-main"><strong>{{ h.query_text }}</strong><small>{{ omxAgo(h.created_at, omx.now.value) }}</small></span>
                    </button>
                </div>
                <div v-else class="omx-empty">Exact searches you run are remembered here.</div>
            </section>
        </div>
    </div>
</template>

<script setup lang="ts">
import { omxAgo, omxDateTime, omxDayToMs, omxErrorText, omxWhere } from '~/scripts/omniscienceConsole';

/**
 * Three ways into the messages from one box: by meaning, as a question answered with citations, and
 * as an exact search (who, where, when) that can be saved, paged and exported.
 */
type Mode = 'find' | 'ask' | 'scope';
const MODES: { id: Mode; label: string; help: string }[] = [
    { id: 'find', label: 'By meaning', help: 'Finds messages that mean what you typed, whatever words they used.' },
    { id: 'ask', label: 'Ask', help: 'Answers a question from the messages and shows the ones it relied on.' },
    { id: 'scope', label: 'Exact', help: 'Every message that fits: a person, a conversation or dates, with optional words. Needs at least one of the three.' },
];
const LIMIT = 50;

const omx = useOmx();
const route = useRoute();
const box = ref<HTMLInputElement | null>(null);
const asMode = (v: unknown): Mode => (v === 'ask' || v === 'scope' ? v : 'find');
const mode = ref<Mode>(asMode(route.query.mode));
const f = reactive({ q: String(route.query.q ?? ''), personId: String(route.query.person ?? ''), conversationId: String(route.query.c ?? ''), fromDate: '', toDate: '', contextKind: 'all', platform: 'all' });
const personName = ref('');
const results = ref<any[]>([]);
const answer = ref('');
const loading = ref(false);
const searched = ref(false);
const hasMore = ref(false);
const offset = ref(0);
const error = ref('');
const saving = ref(false);
const saveName = ref('');
const copied = ref<string | number>('');

const placeholder = computed(() => (mode.value === 'ask' ? 'A question, e.g. has anyone mentioned a birthday in March?' : mode.value === 'scope' ? 'Words to look for (optional)' : 'What the messages should be about'));
const scope = () => ({ q: f.q.trim(), personId: f.personId, conversationId: f.conversationId.trim(), from: omxDayToMs(f.fromDate), to: omxDayToMs(f.toDate, true), contextKind: f.contextKind, platform: f.platform });

function setMode(next: Mode) { mode.value = next; searched.value = false; results.value = []; answer.value = ''; error.value = ''; omx.patchQuery({ mode: next === 'find' ? undefined : next }); }

async function run(keepOffset = false) {
    error.value = '';
    const q = f.q.trim();
    if (mode.value !== 'scope' && !q) { box.value?.focus(); return; }
    const current = scope();
    if (mode.value === 'scope' && !current.personId && !current.conversationId && !current.from && !current.to) { error.value = 'Name a person, a conversation or a date first: an exact search over every message would never finish.'; return; }
    if (!keepOffset) offset.value = 0;
    loading.value = true;
    omx.patchQuery({ q: q || undefined, person: f.personId || undefined, c: f.conversationId.trim() || undefined, saved: undefined });
    try {
        if (mode.value === 'ask') {
            const data = await omx.api.post('/omniscience/persons/ask', { question: q });
            answer.value = String(data?.answer ?? ''); results.value = data?.citations ?? []; hasMore.value = false;
        } else if (mode.value === 'find') {
            const data = await omx.api.get('/omniscience/search/semantic?q=' + encodeURIComponent(q) + '&limit=30');
            results.value = data?.results ?? []; hasMore.value = false;
        } else {
            const data = await omx.api.post(`/omniscience/workspace/search?limit=${LIMIT}&offset=${offset.value}`, current);
            results.value = data?.items ?? []; hasMore.value = !!data?.has_more;
            if (!keepOffset) void omx.api.post('/omniscience/workspace/history', { queryText: current.q || personName.value || 'Exact search', scope: current }).then(d => { if (Array.isArray(d?.history)) omx.history.value = d.history; }).catch(() => null);
        }
        searched.value = true;
    } catch (cause) { error.value = omxErrorText(cause, 'That search did not finish.'); }
    finally { loading.value = false; }
}
function page(step: number) { offset.value = Math.max(0, offset.value + step * LIMIT); void run(true); }

function applyScope(value: any) {
    const s = value || {};
    mode.value = 'scope';
    Object.assign(f, {
        q: s.q || '', personId: s.personId || '', conversationId: s.conversationId || '', contextKind: s.contextKind || 'all', platform: s.platform || 'all',
        fromDate: s.from ? new Date(s.from).toISOString().slice(0, 10) : '', toDate: s.to ? new Date(s.to).toISOString().slice(0, 10) : '',
    });
    personName.value = '';
    void run();
}
async function applySaved(saved: any) {
    void omx.api.post('/omniscience/workspace/queries/use', { queryId: saved.query_id, queryText: saved.name, query: saved.query }).catch(() => null);
    applyScope(saved.query);
}
function startSave() { saving.value = true; if (!saveName.value) saveName.value = f.q.trim() || personName.value || 'Investigation'; }
async function save() {
    const data = await omx.act('save-query', () => omx.api.post('/omniscience/workspace/queries/save', { name: saveName.value.trim(), query: scope() }), 'Saved');
    if (data) { omx.queries.value = data.queries ?? omx.queries.value; saving.value = false; }
}
async function removeSaved(saved: any) {
    if (!await omx.confirm({ title: `Delete “${saved.name}”?`, text: 'Only the saved search goes; no message is touched.', yes: 'Delete', danger: true })) return;
    const data = await omx.act('delete-query', () => omx.api.post('/omniscience/workspace/queries/delete', { queryId: saved.query_id }));
    if (data) omx.queries.value = data.queries ?? omx.queries.value.filter(q => q.query_id !== saved.query_id);
}
async function clearHistory() { if (await omx.act('clear-history', () => omx.api.post('/omniscience/workspace/history/clear', {}))) omx.history.value = []; }
async function exportCsv() {
    const data = await omx.act('export', () => omx.api.post('/omniscience/workspace/search/export', scope()));
    if (data?.content) omx.api.download(data.filename || 'messages.csv', data.mime || 'text/csv', data.content);
}
async function copy(r: any, i: number) {
    try { await navigator.clipboard.writeText(String(r.content ?? '')); copied.value = r.message_id ?? i; setTimeout(() => { copied.value = ''; }, 1200); }
    catch { omx.toast('The browser would not allow copying.', 'bad'); }
}

onMounted(() => {
    const saved = String(route.query.saved ?? '');
    const match = saved ? omx.queries.value.find(q => String(q.query_id) === saved) : null;
    if (match) { void applySaved(match); return; }
    if (saved) { // the list of saved searches arrives with the first sync
        const stop = watch(() => omx.queries.value, list => { const hit = list.find(q => String(q.query_id) === saved); if (hit) { stop(); void applySaved(hit); } });
    }
    if (f.q || (mode.value === 'scope' && (f.personId || f.conversationId))) void run();
    else void nextTick(() => box.value?.focus());
});
</script>
