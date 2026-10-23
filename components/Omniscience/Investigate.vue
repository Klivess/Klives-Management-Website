<template>
    <div class="os-investigate-layout">
        <section class="os-panel os-investigate-main">
            <div class="os-panel-head">
                <div><h2><span class="os-panel-code">SQL</span> Evidence explorer</h2><p class="os-panel-subtitle">Precise, scoped message search with reusable investigations and CSV export</p></div>
                <div class="os-field-row">
                    <NuxtLink class="os-btn sm ghost" :to="semanticLink('search')">Semantic</NuxtLink>
                    <NuxtLink class="os-btn sm ghost" :to="semanticLink('ask')">Ask with citations</NuxtLink>
                </div>
            </div>
            <div class="os-panel-body">
                <div class="os-investigate-query">
                    <input v-model="filters.q" class="os-input os-investigate-query-input" placeholder="Exact words or phrase in message content…" @keyup.enter="run()" />
                    <button class="os-btn cyan" :disabled="loading" @click="run()">{{ loading ? 'Searching…' : 'Run query' }}</button>
                    <button class="os-btn ghost" title="Save this investigation" @click="showSave = !showSave">Save</button>
                    <button class="os-btn ghost" title="Export current query as CSV" :disabled="!hasSearched" @click="exportCsv">Export CSV</button>
                </div>
                <div class="os-investigate-filters">
                    <OmnisciencePersonPicker v-model="filters.personId" label="Person (optional)" />
                    <label><span>Conversation ID</span><input v-model="filters.conversationId" class="os-input" placeholder="discord:channel…" /></label>
                    <label><span>From</span><input v-model="filters.fromDate" type="date" class="os-input" /></label>
                    <label><span>To</span><input v-model="filters.toDate" type="date" class="os-input" /></label>
                    <label><span>Context</span><select v-model="filters.contextKind" class="os-select"><option value="all">All contexts</option><option value="dm">Direct messages</option><option value="group_dm">Group DMs</option><option value="guild_channel">Servers</option></select></label>
                    <label><span>Platform</span><select v-model="filters.platform" class="os-select"><option value="all">All platforms</option><option value="discord">Discord</option><option value="whatsapp">WhatsApp</option><option value="test">Test/import</option></select></label>
                </div>
                <p class="os-query-hint">Global text scans require a person, conversation or date boundary. For unbounded meaning-based search, use <NuxtLink :to="semanticLink('search')">Semantic</NuxtLink>.</p>
                <form v-if="showSave" class="os-save-query" @submit.prevent="saveQuery">
                    <input v-model="queryName" class="os-input" maxlength="120" placeholder="Investigation name" />
                    <button class="os-btn cyan" type="submit">Save investigation</button>
                    <button class="os-btn ghost" type="button" @click="showSave = false">Cancel</button>
                </form>
                <div v-if="error" class="os-error-state"><span>{{ error }}</span><button class="os-btn sm" @click="run()">Retry</button></div>
                <div v-else-if="loading && !results.length" class="os-skeleton-stack"><i /><i /><i /><i /></div>
                <template v-else-if="hasSearched">
                    <div class="os-result-summary"><span><strong>{{ results.length }}</strong> messages on this page</span><span v-if="hasMore">More results available</span></div>
                    <div class="os-message-results">
                        <article v-for="message in results" :key="message.message_id" class="os-message-result">
                            <header>
                                <NuxtLink :to="`/omniscience-person?personId=${message.person_id}`">{{ message.author_display }}</NuxtLink>
                                <span>{{ message.platform }} · {{ message.context_kind }}</span>
                                <time>{{ formatDate(message.sent_at, true) }}</time>
                                <button title="Copy message text" @click="copy(message)">{{ copied === message.message_id ? 'Copied' : 'Copy' }}</button>
                            </header>
                            <p>{{ message.content }}</p>
                            <footer><span>{{ message.guild_name || message.conversation_title || message.conversation_id }}</span><code>{{ message.message_id }}</code></footer>
                        </article>
                    </div>
                    <div v-if="!results.length" class="os-empty">No messages match this scoped query.</div>
                    <div class="os-pagination">
                        <button class="os-btn sm ghost" :disabled="offset === 0 || loading" @click="page(-1)">← Previous</button>
                        <span>Page {{ Math.floor(offset / limit) + 1 }}</span>
                        <button class="os-btn sm ghost" :disabled="!hasMore || loading" @click="page(1)">Next →</button>
                    </div>
                </template>
                <div v-else class="os-investigate-empty">
                    <span>⌕</span><h3>Build a precise evidence query</h3><p>Filter by person, conversation, time, context or platform. Save the query for later, rerun it, or export the evidence.</p>
                </div>
            </div>
        </section>
        <aside class="os-investigate-side">
            <section class="os-panel">
                <div class="os-panel-head"><h2><span class="os-panel-code">SAVE</span> Saved investigations</h2></div>
                <div class="os-panel-body">
                    <button v-for="saved in savedQueries" :key="saved.query_id" class="os-saved-query" @click="applySaved(saved)">
                        <span><strong>{{ saved.name }}</strong><small>{{ saved.use_count }} runs · {{ formatDate(saved.updated_at) }}</small></span>
                        <i title="Delete saved investigation" @click.stop="deleteSaved(saved)">×</i>
                    </button>
                    <div v-if="!savedQueries.length" class="os-empty">No saved investigations.</div>
                </div>
            </section>
            <section class="os-panel">
                <div class="os-panel-head"><h2><span class="os-panel-code">HIST</span> Recent queries</h2><button class="os-btn sm ghost" @click="clearHistory">Clear</button></div>
                <div class="os-panel-body">
                    <button v-for="entry in history" :key="entry.history_id" class="os-history-query" @click="applyScope(entry.scope)">
                        <strong>{{ entry.query_text }}</strong><small>{{ formatDate(entry.created_at, true) }}</small>
                    </button>
                    <div v-if="!history.length" class="os-empty">Your recent queries will appear here.</div>
                </div>
            </section>
        </aside>
    </div>
</template>

<script setup lang="ts">
import { formatDate, omniscienceError, toUnixMs, useOmniscienceApi } from '~/composables/useOmniscienceApi';

const api = useOmniscienceApi();
const route = useRoute();
const filters = reactive({ q: '', personId: '', conversationId: '', fromDate: '', toDate: '', contextKind: 'all', platform: 'all' });
const results = ref<any[]>([]);
const savedQueries = ref<any[]>([]);
const history = ref<any[]>([]);
const loading = ref(false);
const hasSearched = ref(false);
const hasMore = ref(false);
const error = ref('');
const showSave = ref(false);
const queryName = ref('');
const copied = ref('');
const limit = 50;
const offset = ref(0);

function scope() {
    return {
        q: filters.q.trim(), personId: filters.personId, conversationId: filters.conversationId.trim(),
        from: toUnixMs(filters.fromDate), to: toUnixMs(filters.toDate, true),
        contextKind: filters.contextKind, platform: filters.platform,
    };
}
function semanticLink(mode: string) { return `/omniscience-search?mode=${mode}&q=${encodeURIComponent(filters.q)}`; }
async function run(append = false) {
    const current = scope();
    if (!current.personId && !current.conversationId && !current.from && !current.to) {
        error.value = 'Add a person, conversation or date boundary before running a message query.';
        return;
    }
    if (!append) offset.value = 0;
    loading.value = true; error.value = '';
    try {
        const data = await api.post(`/omniscience/workspace/search?limit=${limit}&offset=${offset.value}`, current);
        results.value = data.items || [];
        hasMore.value = !!data.has_more;
        hasSearched.value = true;
        queryName.value ||= current.q || 'Scoped investigation';
        if (!append) void recordHistory(current);
    } catch (cause) { error.value = omniscienceError(cause, 'Query failed.'); }
    finally { loading.value = false; }
}
function page(direction: number) { offset.value = Math.max(0, offset.value + direction * limit); void run(true); }
async function recordHistory(current: any) {
    try {
        const data = await api.post('/omniscience/workspace/history', { queryText: current.q || 'Scoped investigation', scope: current });
        history.value = data.history || [];
    } catch { /* history is best-effort */ }
}
async function loadWorkspace() {
    try {
        const data = await api.get('/omniscience/workspace/bootstrap');
        savedQueries.value = data.queries || [];
        history.value = data.history || [];
        return data;
    } catch { return null; }
}
async function saveQuery() {
    if (!queryName.value.trim()) return;
    try {
        const data = await api.post('/omniscience/workspace/queries/save', { name: queryName.value, query: scope() });
        savedQueries.value = data.queries || [];
        showSave.value = false;
    } catch (cause) { error.value = omniscienceError(cause, 'Could not save query.'); }
}
async function deleteSaved(saved: any) {
    if (!confirm(`Delete “${saved.name}”?`)) return;
    const data = await api.post('/omniscience/workspace/queries/delete', { queryId: saved.query_id });
    savedQueries.value = data.queries || [];
}
async function applySaved(saved: any) {
    applyScope(saved.query, false);
    await api.post('/omniscience/workspace/queries/use', { queryId: saved.query_id, queryText: saved.name, query: saved.query }).catch(() => null);
    void run();
}
function applyScope(value: any, autorun = true) {
    const scope = value || {};
    Object.assign(filters, {
        q: scope.q || '', personId: scope.personId || '', conversationId: scope.conversationId || '',
        fromDate: scope.from ? new Date(scope.from).toISOString().slice(0, 10) : '',
        toDate: scope.to ? new Date(scope.to).toISOString().slice(0, 10) : '',
        contextKind: scope.contextKind || 'all', platform: scope.platform || 'all',
    });
    if (autorun) void run();
}
async function exportCsv() {
    try {
        const data = await api.post('/omniscience/workspace/search/export', scope());
        api.download(data.filename, data.mime, data.content);
    } catch (cause) { error.value = omniscienceError(cause, 'Export failed.'); }
}
async function copy(message: any) {
    try { await navigator.clipboard.writeText(message.content || ''); copied.value = message.message_id; setTimeout(() => copied.value = '', 1200); } catch { /* clipboard denied */ }
}
async function clearHistory() { await api.post('/omniscience/workspace/history/clear', {}); history.value = []; }
onMounted(async () => {
    const workspace = await loadWorkspace();
    if (route.query.scope) {
        try { applyScope(JSON.parse(String(route.query.scope)), true); } catch { /* malformed shared scope */ }
    } else if (route.query.saved) {
        const saved = (workspace?.queries || []).find((item: any) => item.query_id === route.query.saved);
        if (saved) await applySaved(saved);
    }
});
</script>

<style scoped>
.os-investigate-layout { display: grid; grid-template-columns: minmax(0,1fr) 270px; gap: 12px; }
.os-investigate-query { display: flex; gap: 7px; }
.os-investigate-query-input { flex: 1; }
.os-investigate-filters { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 9px; margin-top: 12px; }
.os-investigate-filters label > span { display: block; margin-bottom: 5px; color: var(--os-muted); font: 700 9px var(--os-mono); text-transform: uppercase; }
.os-query-hint { margin: 9px 0 0; color: var(--os-faint); font-size: 10px; }
.os-query-hint a { color: var(--os-cyan); }
.os-save-query { display: flex; gap: 7px; margin-top: 10px; padding: 10px; border: 1px solid var(--os-line); border-radius: 8px; }
.os-save-query input { flex: 1; }
.os-result-summary { display: flex; justify-content: space-between; margin: 16px 0 8px; color: var(--os-muted); font-size: 10px; }
.os-result-summary strong { color: var(--os-cyan); }
.os-message-results { display: grid; gap: 7px; }
.os-message-result { padding: 10px 12px; border: 1px solid var(--os-line); border-radius: 9px; background: rgba(255,255,255,.016); }
.os-message-result header { display: flex; align-items: center; gap: 8px; }
.os-message-result header a { color: var(--os-cyan); font-size: 11px; font-weight: 750; text-decoration: none; }
.os-message-result header span, .os-message-result header time { color: var(--os-faint); font-size: 9px; }
.os-message-result header time { margin-left: auto; }
.os-message-result header button { border: 0; background: transparent; color: var(--os-muted); cursor: pointer; font-size: 9px; }
.os-message-result p { margin: 7px 0; color: var(--os-ink-dim); font-size: 12px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
.os-message-result footer { display: flex; justify-content: space-between; gap: 8px; color: var(--os-faint); font-size: 9px; }
.os-message-result footer code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.os-pagination { display: flex; justify-content: center; align-items: center; gap: 12px; margin-top: 13px; color: var(--os-muted); font-size: 10px; }
.os-investigate-empty { padding: 55px 20px; text-align: center; }
.os-investigate-empty > span { color: var(--os-cyan); font-size: 35px; }
.os-investigate-empty h3 { margin: 10px 0 5px; color: var(--os-ink); }
.os-investigate-empty p { max-width: 460px; margin: auto; color: var(--os-muted); font-size: 11px; line-height: 1.6; }
.os-saved-query, .os-history-query { display: flex; align-items: center; gap: 6px; width: 100%; padding: 8px; margin-bottom: 5px; border: 1px solid var(--os-line); border-radius: 7px; background: rgba(255,255,255,.015); color: inherit; cursor: pointer; text-align: left; }
.os-saved-query > span { flex: 1; min-width: 0; }
.os-saved-query strong, .os-saved-query small, .os-history-query strong, .os-history-query small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.os-saved-query strong, .os-history-query strong { color: var(--os-ink-dim); font-size: 10px; }
.os-saved-query small, .os-history-query small { margin-top: 2px; color: var(--os-faint); font-size: 9px; }
.os-saved-query i { color: var(--os-muted); font-style: normal; font-size: 16px; }
.os-saved-query i:hover { color: var(--os-red); }
@media (max-width: 1050px) { .os-investigate-layout { grid-template-columns: 1fr; } .os-investigate-side { display: grid; grid-template-columns: repeat(2,1fr); gap: 12px; } }
@media (max-width: 720px) { .os-investigate-filters { grid-template-columns: repeat(2,1fr); } .os-investigate-query { flex-wrap: wrap; } .os-investigate-query-input { flex-basis: 100%; } .os-investigate-side { grid-template-columns: 1fr; } }
</style>
