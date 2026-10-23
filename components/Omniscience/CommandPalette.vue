<template>
    <Teleport to="body">
        <div v-if="visible" class="os-palette-backdrop" @mousedown.self="close">
            <section class="os-palette" role="dialog" aria-modal="true" aria-label="Omniscience command palette">
                <div class="os-palette-input">
                    <span>⌕</span>
                    <input
                        ref="inputEl"
                        v-model="query"
                        aria-label="Search people, facts, notes and investigations"
                        placeholder="Search people, facts, notes… or type a command"
                        @keydown.down.prevent="move(1)"
                        @keydown.up.prevent="move(-1)"
                        @keydown.enter.prevent="executeHighlighted"
                        @keydown.esc="close"
                    />
                    <kbd>ESC</kbd>
                </div>
                <div class="os-palette-context">
                    <span>{{ query ? 'Unified intelligence search' : 'Quick actions & recent investigations' }}</span>
                    <span v-if="loading">Searching…</span>
                </div>
                <div v-if="error" class="os-palette-error">{{ error }}</div>
                <div class="os-palette-results" role="listbox">
                    <button
                        v-for="(item, index) in items"
                        :key="item.key"
                        type="button"
                        :class="['os-palette-item', { active: index === highlighted }]"
                        @mouseenter="highlighted = index"
                        @click="execute(item)"
                    >
                        <span class="os-palette-icon" :class="item.kind">{{ icon(item.kind) }}</span>
                        <span class="os-palette-copy">
                            <strong>{{ item.title }}</strong>
                            <small>{{ item.subtitle }}</small>
                        </span>
                        <span class="os-palette-kind">{{ label(item.kind) }}</span>
                        <span class="os-palette-enter">↵</span>
                    </button>
                    <div v-if="!items.length && !loading" class="os-empty">No matching intelligence. Try a name, handle, fact or saved query.</div>
                </div>
                <footer class="os-palette-footer">
                    <span><kbd>↑↓</kbd> navigate</span><span><kbd>↵</kbd> open</span>
                    <NuxtLink to="/omniscience-explore" @click="close">Advanced explorer →</NuxtLink>
                </footer>
            </section>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import { omniscienceError, useOmniscienceApi } from '~/composables/useOmniscienceApi';

const api = useOmniscienceApi();
const visible = ref(false);
const query = ref('');
const results = ref<any[]>([]);
const bootstrap = ref<any>(null);
const loading = ref(false);
const error = ref('');
const highlighted = ref(0);
const inputEl = ref<HTMLInputElement | null>(null);
let timer: ReturnType<typeof setTimeout> | null = null;
let sequence = 0;

const actions = [
    { key: 'explore', kind: 'action', title: 'Open investigation explorer', subtitle: 'Structured message search, timelines, comparisons and graphs', url: '/omniscience-explore' },
    { key: 'ask', kind: 'action', title: 'Ask the evidence base', subtitle: 'Natural-language answer with message citations', url: '/omniscience-search?mode=ask' },
    { key: 'review', kind: 'action', title: 'Open review queue', subtitle: 'Resolve identities, merges, watchlists and tracking suggestions', url: '/omniscience-review' },
    { key: 'health', kind: 'action', title: 'Inspect data health', subtitle: 'Coverage, source status, embedding progress and pipeline warnings', url: '/omniscience-explore?tab=Health' },
];
const items = computed(() => {
    if (query.value.trim()) return results.value;
    const saved = (bootstrap.value?.queries || []).slice(0, 4).map((saved: any) => ({
        key: 'saved-' + saved.query_id, kind: 'saved_query', title: saved.name,
        subtitle: `Saved investigation · used ${saved.use_count || 0}×`, url: '/omniscience-explore?saved=' + encodeURIComponent(saved.query_id), query: saved.query,
    }));
    const recent = (bootstrap.value?.history || []).slice(0, 3).map((entry: any) => ({
        key: 'recent-' + entry.history_id, kind: 'history', title: entry.query_text,
        subtitle: 'Recent query · ' + new Date(entry.created_at).toLocaleDateString(),
        url: '/omniscience-explore?scope=' + encodeURIComponent(JSON.stringify(entry.scope || { q: entry.query_text })),
    }));
    return [...actions, ...saved, ...recent];
});

function icon(kind: string) { return ({ person: 'P', fact: 'F', note: 'N', saved_query: 'S', history: 'H', action: '→' } as any)[kind] || '⌕'; }
function label(kind: string) { return ({ person: 'Person', fact: 'Evidence', note: 'Note', saved_query: 'Saved', history: 'Recent', action: 'Go to' } as any)[kind] || kind; }
function move(delta: number) { if (items.value.length) highlighted.value = (highlighted.value + delta + items.value.length) % items.value.length; }
function executeHighlighted() { if (items.value[highlighted.value]) execute(items.value[highlighted.value]); }
async function execute(item: any) {
    if (item.kind === 'saved_query' && item.query) {
        const queryId = item.item_id || item.key.replace(/^saved(?:_query)?-/, '');
        await api.post('/omniscience/workspace/queries/use', { queryId, queryText: item.title, query: item.query }).catch(() => null);
    }
    close();
    if (item.url) await navigateTo(item.url);
}
function open() {
    visible.value = true;
    error.value = '';
    highlighted.value = 0;
    if (!bootstrap.value) void loadBootstrap();
    nextTick(() => inputEl.value?.focus());
}
function close() { visible.value = false; query.value = ''; results.value = []; error.value = ''; }
async function loadBootstrap() {
    try { bootstrap.value = await api.get('/omniscience/workspace/bootstrap'); } catch { bootstrap.value = {}; }
}
async function search(value: string) {
    const current = ++sequence;
    loading.value = true;
    error.value = '';
    try {
        const data = await api.get('/omniscience/workspace/search?limit=40&q=' + encodeURIComponent(value));
        if (current !== sequence) return;
        results.value = (data.results || []).map((result: any) => ({
            ...result, key: `${result.kind}-${result.item_id}`, query: result.query,
        }));
        highlighted.value = 0;
    } catch (cause) {
        if (current === sequence) { error.value = omniscienceError(cause, 'Search failed.'); results.value = []; }
    } finally {
        if (current === sequence) loading.value = false;
    }
}
function onKeydown(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        visible.value ? close() : open();
        return;
    }
    if (event.key === 'Escape' && visible.value) close();
}
watch(query, value => {
    if (timer) clearTimeout(timer);
    const trimmed = value.trim();
    if (!trimmed) { results.value = []; error.value = ''; loading.value = false; return; }
    if (trimmed.length < 2) return;
    timer = setTimeout(() => search(trimmed), 240);
});
watch(visible, value => { if (import.meta.client) document.body.style.overflow = value ? 'hidden' : ''; });
onMounted(() => {
    window.addEventListener('keydown', onKeydown);
    window.addEventListener('omniscience:command', open);
});
onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown);
    window.removeEventListener('omniscience:command', open);
    if (timer) clearTimeout(timer);
    if (import.meta.client) document.body.style.overflow = '';
});
</script>

<style scoped>
.os-palette-backdrop { position: fixed; inset: 0; z-index: 10000; display: flex; justify-content: center; align-items: flex-start; padding: 11vh 18px 24px; background: rgba(2,5,10,.72); backdrop-filter: blur(9px); }
.os-palette { width: min(720px, 100%); overflow: hidden; border: 1px solid rgba(95,211,255,.3); border-radius: 16px; background: #0d1420; box-shadow: 0 30px 100px rgba(0,0,0,.65), 0 0 0 1px rgba(255,255,255,.02) inset; }
.os-palette-input { display: flex; align-items: center; gap: 11px; padding: 15px 17px; border-bottom: 1px solid var(--os-line); }
.os-palette-input > span { color: var(--os-cyan); font-size: 23px; }
.os-palette-input input { flex: 1; border: 0; outline: 0; background: transparent; color: var(--os-ink); font: 500 16px inherit; }
.os-palette-input input::placeholder { color: var(--os-faint); }
.os-palette-context { display: flex; justify-content: space-between; padding: 9px 16px 6px; color: var(--os-faint); font: 700 9px var(--os-mono); letter-spacing: .08em; text-transform: uppercase; }
.os-palette-results { max-height: 430px; overflow-y: auto; padding: 6px; }
.os-palette-item { display: flex; align-items: center; gap: 11px; width: 100%; padding: 10px; border: 0; border-radius: 9px; background: transparent; color: inherit; cursor: pointer; text-align: left; }
.os-palette-item.active { background: rgba(95,211,255,.09); }
.os-palette-icon { display: grid; place-items: center; width: 30px; height: 30px; flex: 0 0 30px; border: 1px solid var(--os-line); border-radius: 8px; color: var(--os-cyan); background: rgba(95,211,255,.06); font: 800 11px var(--os-mono); }
.os-palette-icon.fact { color: var(--os-violet); }
.os-palette-icon.note { color: var(--os-amber); }
.os-palette-copy { flex: 1; min-width: 0; }
.os-palette-copy strong, .os-palette-copy small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.os-palette-copy strong { color: var(--os-ink); font-size: 12px; }
.os-palette-copy small { margin-top: 2px; color: var(--os-muted); font-size: 10px; }
.os-palette-kind { color: var(--os-faint); font: 700 9px var(--os-mono); text-transform: uppercase; }
.os-palette-enter { color: var(--os-cyan); opacity: 0; }
.os-palette-item.active .os-palette-enter { opacity: 1; }
.os-palette-footer { display: flex; align-items: center; gap: 13px; padding: 10px 16px; border-top: 1px solid var(--os-line); color: var(--os-faint); font-size: 10px; }
.os-palette-footer a { margin-left: auto; color: var(--os-cyan); text-decoration: none; }
.os-palette-error { margin: 5px 12px; padding: 8px; border-radius: 6px; background: rgba(255,90,120,.09); color: var(--os-red); font-size: 11px; }
kbd { padding: 2px 4px; border: 1px solid var(--os-line); border-radius: 4px; font: 700 9px var(--os-mono); }
@media (max-width: 600px) { .os-palette-backdrop { padding: 5vh 8px 12px; } .os-palette-kind { display: none; } }
</style>
