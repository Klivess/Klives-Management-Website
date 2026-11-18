<template>
    <div class="omx-palette" role="dialog" aria-modal="true" aria-label="Find anything" data-testid="omx-palette">
        <div class="omx-palette-input">
            <OmniscienceIcon name="search" />
            <input ref="input" v-model="text" type="text" placeholder="A name, a handle, a fact, or what you want to do" aria-label="Find" autocomplete="off" spellcheck="false"
                   @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.enter.prevent="runAt(cursor)" />
            <span v-if="searching" class="omx-dot busy"></span>
            <span class="omx-kbd">Esc</span>
        </div>
        <div ref="listEl" class="omx-palette-list">
            <template v-for="group in groups" :key="group.title">
                <div class="omx-palette-group">{{ group.title }}</div>
                <button v-for="item in group.items" :key="item.key" class="omx-cmd" :class="{ cursor: item.index === cursor }" type="button" :data-index="item.index"
                        @mousemove="cursor = item.index" @click="runAt(item.index)">
                    <span v-if="item.person" class="omx-avatar">{{ omxInitials(item.title) }}</span>
                    <OmniscienceIcon v-else :name="item.icon" />
                    <span class="omx-cmd-main"><strong>{{ item.title }}</strong><small v-if="item.sub">{{ item.sub }}</small></span>
                    <span v-if="item.kind" class="omx-chip">{{ item.kind }}</span>
                </button>
            </template>
            <div v-if="!flat.length" class="omx-empty"><strong>Nothing matches</strong>Press Enter to search the messages for it instead.</div>
        </div>
        <div class="omx-palette-foot"><span>↑↓ to move</span><span>Enter to open</span><span>Esc to close</span></div>
    </div>
</template>

<script setup lang="ts">
import { OMX_VIEWS, omxInitials, omxScore } from '~/scripts/omniscienceConsole';

/**
 * One box for getting anywhere. With nothing typed it offers where you were and what you can do;
 * with a few letters it asks the server for people and facts while matching commands locally.
 */
interface Item { key: string; title: string; sub?: string; icon: string; kind?: string; person?: boolean; index: number; run: () => void }

const omx = useOmx();
const input = ref<HTMLInputElement | null>(null);
const listEl = ref<HTMLElement | null>(null);
const text = ref('');
const cursor = ref(0);
const searching = ref(false);
const found = ref<any[]>([]);
let timer: ReturnType<typeof setTimeout> | null = null;
let asked = 0;

const close = () => { omx.paletteOpen.value = false; };
const person = (id: string, tab?: string) => () => { close(); omx.openPerson(id, tab); };

const commands = computed(() => [
    ...OMX_VIEWS.map(v => ({ key: `go-${v.id}`, title: `Go to ${v.label}`, sub: v.hint, icon: v.icon, run: () => { close(); omx.go(v.id); } })),
    { key: 'run-deduction', title: 'Run a deduction pass', sub: 'Extract facts and relationships from new messages', icon: 'play', run: () => { close(); void omx.run('deduction'); } },
    { key: 'run-profiler', title: 'Run the profiler now', sub: 'Rebuild dossiers for the people being profiled', icon: 'play', run: () => { close(); void omx.run('profiler'); } },
    { key: 'run-briefing', title: 'Send me the briefing', sub: 'As a direct message', icon: 'send', run: () => { close(); void omx.run('briefing'); } },
    { key: 'refresh', title: 'Read everything again', icon: 'refresh', run: () => { close(); void omx.sync(true); } },
]);

const groups = computed(() => {
    const q = text.value.trim();
    const out: { title: string; items: Omit<Item, 'index'>[] }[] = [];
    if (!q) {
        const pinned = omx.pins.value.slice(0, 6).map(p => ({ key: `pin-${p.person_id}`, title: p.display_name || '(unnamed)', sub: 'pinned', icon: 'person', person: true, run: person(p.person_id) }));
        const recent = omx.recent.value.filter(r => !omx.pins.value.some(p => p.person_id === r.id)).slice(0, 5)
            .map(r => ({ key: `recent-${r.id}`, title: r.name, sub: 'opened recently', icon: 'person', person: true, run: person(r.id) }));
        if (pinned.length || recent.length) out.push({ title: 'People', items: [...pinned, ...recent] });
        const saved = omx.queries.value.slice(0, 4).map(s => ({ key: `saved-${s.query_id}`, title: s.name, sub: 'saved investigation', icon: 'ask', run: () => { close(); omx.go('ask', { saved: String(s.query_id) }); } }));
        if (saved.length) out.push({ title: 'Investigations', items: saved });
        out.push({ title: 'Commands', items: commands.value });
        return index(out);
    }
    const results = found.value.map((r, i) => ({
        key: `hit-${r.kind}-${r.item_id ?? i}`, title: String(r.title ?? ''), sub: r.subtitle ? String(r.subtitle) : undefined, kind: String(r.kind ?? ''),
        icon: r.kind === 'fact' ? 'note' : 'person', person: r.kind === 'person',
        run: r.person_id ? person(String(r.person_id), r.kind === 'fact' ? 'knowledge' : undefined) : () => { close(); omx.go('ask', { q }); },
    }));
    if (results.length) out.push({ title: 'Found', items: results });
    out.push({ title: 'Messages', items: [
        { key: 'find', title: `Search the messages for “${q}”`, sub: 'By meaning, with who said it and where', icon: 'search', run: () => { close(); omx.go('ask', { q, mode: 'find' }); } },
        { key: 'ask', title: `Ask: ${q}`, sub: 'An answer grounded in messages, with its citations', icon: 'spark', run: () => { close(); omx.go('ask', { q, mode: 'ask' }); } },
    ] });
    const matched = commands.value.map(c => ({ c, score: omxScore(q, c.title) })).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 4).map(x => x.c);
    if (matched.length) out.push({ title: 'Commands', items: matched });
    return index(out);
});

function index(list: { title: string; items: Omit<Item, 'index'>[] }[]): { title: string; items: Item[] }[] {
    let n = 0;
    return list.map(group => ({ title: group.title, items: group.items.map(item => ({ ...item, index: n++ })) }));
}
const flat = computed(() => groups.value.flatMap(g => g.items));

function move(step: number) {
    const count = flat.value.length;
    if (!count) return;
    cursor.value = (cursor.value + step + count) % count;
    void nextTick(() => listEl.value?.querySelector(`[data-index="${cursor.value}"]`)?.scrollIntoView({ block: 'nearest' }));
}
function runAt(i: number) {
    const item = flat.value[i];
    if (item) item.run();
    else if (text.value.trim()) { close(); omx.go('ask', { q: text.value.trim(), mode: 'find' }); }
}

watch(text, value => {
    cursor.value = 0;
    if (timer) clearTimeout(timer);
    const q = value.trim();
    if (q.length < 2) { found.value = []; searching.value = false; return; }
    searching.value = true;
    timer = setTimeout(async () => {
        const mine = ++asked;
        try {
            const data = await omx.api.get('/omniscience/workspace/search?limit=12&q=' + encodeURIComponent(q), { retries: 1 });
            if (mine === asked) found.value = Array.isArray(data?.results) ? data.results : [];
        } catch { if (mine === asked) found.value = []; }
        finally { if (mine === asked) searching.value = false; }
    }, 180);
});

onMounted(() => { void nextTick(() => input.value?.focus()); });
onBeforeUnmount(() => { if (timer) clearTimeout(timer); });
</script>
