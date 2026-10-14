<template>
    <div class="ot-cmd">
        <span class="prompt">›</span>
        <input ref="input" v-model="text" spellcheck="false" autocomplete="off" aria-label="Command"
               placeholder="Ticker or function  —  AAPL DES · BTCUSDT 4h · SCRN · ALPHA · CORR SPY TLT GLD"
               @keydown="onKey" @focus="open = true" @blur="onBlur" @input="onInput" />
        <span class="hint"><span class="ot-kbd">/</span><span class="ot-kbd">GO ↵</span></span>
        <div v-if="open && options.length" class="menu" role="listbox">
            <template v-for="(group, gi) in grouped" :key="group.name">
                <div class="grp">{{ group.name }}</div>
                <div v-for="opt in group.items" :key="opt.id" class="opt" :class="{ active: opt.index === index }" role="option"
                     :aria-selected="opt.index === index" @mousedown.prevent="choose(opt)" @mouseenter="index = opt.index">
                    <span class="code">{{ opt.code }}</span>
                    <span class="desc">{{ opt.desc }}</span>
                    <span class="tag">{{ opt.tag }}</span>
                </div>
                <span v-if="gi === grouped.length - 1 && searching" class="grp">Searching…</span>
            </template>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { FUNCTIONS, findFunction, parseCommand, searchSymbols, useRecentSymbols } from '~/composables/useTerminal';

const router = useRouter();
const { recent, push } = useRecentSymbols();
const input = ref<HTMLInputElement | null>(null);
const text = ref('');
const open = ref(false);
const index = ref(0);
const searching = ref(false);
const matches = ref<{ Symbol: string; DisplayName?: string; AssetClass?: string; Exchange?: string }[]>([]);

interface Opt { id: string; code: string; desc: string; tag: string; group: string; run: () => void; index: number }

const options = computed<Opt[]>(() => {
    const raw = text.value.trim();
    const upper = raw.toUpperCase();
    const tokens = upper.split(/\s+/).filter(Boolean);
    const list: Omit<Opt, 'index'>[] = [];
    const go = (to: string) => () => { void router.push(to); };

    if (!raw) {
        for (const s of recent.value.slice(0, 8)) list.push({ id: `r:${s}`, code: s, desc: 'Chart', tag: 'recent', group: 'Recent', run: () => run(`${s}`) });
        for (const f of FUNCTIONS.filter(f => !f.security).slice(0, 14)) list.push({ id: `f:${f.code}`, code: f.code, desc: f.label, tag: f.group, group: 'Functions', run: go(f.route()) });
    } else {
        const parsed = parseCommand(raw);
        if (parsed.kind === 'route') list.push({ id: 'exec', code: upper.slice(0, 24), desc: parsed.label, tag: 'GO', group: 'Run', run: () => run(raw) });
        const first = tokens[0] ?? '';
        if (tokens.length === 1) {
            for (const f of FUNCTIONS.filter(f => !f.security && (f.code.startsWith(first) || f.label.toUpperCase().includes(first))).slice(0, 6))
                list.push({ id: `f:${f.code}`, code: f.code, desc: f.label, tag: f.group, group: 'Functions', run: go(f.route()) });
            for (const m of matches.value.slice(0, 8))
                list.push({ id: `m:${m.Symbol}`, code: m.Symbol, desc: m.DisplayName ?? '', tag: [m.AssetClass, m.Exchange].filter(Boolean).join(' · '), group: 'Securities', run: () => run(m.Symbol) });
        }
        if (tokens.length >= 1 && !findFunction(first)) {
            const sym = first;
            const partial = tokens[1] ?? '';
            for (const f of FUNCTIONS.filter(f => f.security && (!partial || f.code.startsWith(partial))).slice(0, 12))
                list.push({ id: `s:${f.code}`, code: `${sym} ${f.code}`, desc: f.label, tag: 'security', group: sym, run: () => run(`${sym} ${f.code}`) });
        }
    }
    return list.map((o, i) => ({ ...o, index: i }));
});

const grouped = computed(() => {
    const out: { name: string; items: Opt[] }[] = [];
    for (const o of options.value) {
        let g = out.find(x => x.name === o.group);
        if (!g) { g = { name: o.group, items: [] }; out.push(g); }
        g.items.push(o);
    }
    return out;
});

function run(raw: string) {
    const parsed = parseCommand(raw);
    if (parsed.kind !== 'route') return;
    const first = raw.trim().split(/\s+/)[0]?.toUpperCase();
    if (first && !findFunction(first)) push(first);
    text.value = '';
    open.value = false;
    input.value?.blur();
    void router.push(parsed.to);
}

function choose(opt: Opt) { opt.run(); text.value = ''; open.value = false; input.value?.blur(); }

function onKey(e: KeyboardEvent) {
    const n = options.value.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); if (n) index.value = (index.value + 1) % n; }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (n) index.value = (index.value - 1 + n) % n; }
    else if (e.key === 'Enter') {
        e.preventDefault();
        const opt = options.value[index.value];
        if (opt && (index.value > 0 || opt.id !== 'exec')) choose(opt);
        else run(text.value);
    } else if (e.key === 'Escape') { text.value = ''; open.value = false; input.value?.blur(); }
    else if (e.key === 'Tab' && options.value[index.value]) {
        e.preventDefault();
        text.value = options.value[index.value].code + ' ';
    }
}

let timer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;
function onInput() {
    open.value = true;
    index.value = 0;
    const q = text.value.trim();
    if (timer) clearTimeout(timer);
    if (q.length < 1 || q.includes(' ')) { matches.value = []; return; }
    timer = setTimeout(async () => {
        const mine = ++seq;
        searching.value = true;
        try {
            const r = await searchSymbols(q);
            if (mine === seq) matches.value = r;
        } catch { if (mine === seq) matches.value = []; }
        finally { if (mine === seq) searching.value = false; }
    }, 180);
}

function onBlur() { setTimeout(() => { open.value = false; }, 150); }

function onGlobalKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        input.value?.focus();
        input.value?.select();
    }
}
onMounted(() => window.addEventListener('keydown', onGlobalKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKey));
defineExpose({ focus: () => input.value?.focus() });
</script>
