<template>
    <div class="otf" :class="{ invalid: !!error, ok: valid && !!modelValue }">
        <div class="wrap">
            <span v-if="prefix" class="prefix">{{ prefix }}</span>
            <input ref="input" class="ot-input sm mono" :value="modelValue" :placeholder="placeholder" spellcheck="false" autocomplete="off"
                   @input="onInput" @keydown="onKey" @blur="onBlur" @focus="onFocus" />
            <span v-if="checking" class="ot-spin state"></span>
            <span v-else-if="error" class="state bad" :title="error">✕</span>
            <span v-else-if="valid && modelValue" class="state good" :title="summary">✓</span>
        </div>
        <ul v-if="open && suggestions.length" class="sugg">
            <li v-for="(s, i) in suggestions" :key="s.label" :class="{ active: i === index }" @mousedown.prevent="apply(s)">
                <b>{{ s.label }}</b><span>{{ s.detail }}</span>
            </li>
        </ul>
        <div v-if="error && inlineErrors" class="err mono">{{ error }}</div>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { loadFormulaReference, tPost } from '~/composables/useTerminal';

const props = withDefaults(defineProps<{
    modelValue: string;
    placeholder?: string;
    prefix?: string;
    /** Evaluate against this symbol to report the latest value / true count. */
    symbol?: string;
    interval?: string;
    /** Extra names the formula may use (blueprint inputs, variables). */
    inputs?: string[];
    variables?: string[];
    requireBoolean?: boolean;
    inlineErrors?: boolean;
}>(), { placeholder: 'close > sma(close, 200)', inlineErrors: true });

const emit = defineEmits<{ 'update:modelValue': [value: string]; validity: [ok: boolean, info: any]; submit: [] }>();

const input = ref<HTMLInputElement | null>(null);
const error = ref('');
const valid = ref(false);
const checking = ref(false);
const summary = ref('');
const open = ref(false);
const index = ref(0);
const word = ref('');

interface Sugg { label: string; detail: string; insert: string }
const vocabulary = ref<Sugg[]>([]);

onMounted(async () => {
    try {
        const ref_ = await loadFormulaReference();
        const list: Sugg[] = [];
        for (const s of ref_.Series ?? []) list.push({ label: s, detail: 'series', insert: s });
        for (const f of ref_.Functions ?? []) list.push({ label: f.Key, detail: f.Signature, insert: `${f.Key}(` });
        for (const i of ref_.Indicators ?? []) list.push({ label: i.Id, detail: `${i.Name} ${i.Signature}`, insert: `${i.Id}(` });
        vocabulary.value = list;
    } catch { /* autocomplete is optional */ }
    if (props.modelValue) void check(props.modelValue);
});

const suggestions = computed(() => {
    const w = word.value.toLowerCase();
    if (w.length < 1) return [];
    const extra: Sugg[] = [...(props.inputs ?? []).map(i => ({ label: i, detail: 'input', insert: i })), ...(props.variables ?? []).map(v => ({ label: v, detail: 'variable', insert: v }))];
    return [...extra, ...vocabulary.value].filter(s => s.label.toLowerCase().startsWith(w)).slice(0, 12);
});

let timer: ReturnType<typeof setTimeout> | null = null;
function onInput(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    emit('update:modelValue', v);
    updateWord();
    open.value = true;
    index.value = 0;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void check(v), 350);
}

function updateWord() {
    const el = input.value;
    if (!el) return;
    const pos = el.selectionStart ?? el.value.length;
    const m = /[A-Za-z_][A-Za-z0-9_]*$/.exec(el.value.slice(0, pos));
    word.value = m ? m[0] : '';
}

function apply(s: Sugg) {
    const el = input.value;
    if (!el) return;
    const pos = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, pos - word.value.length);
    const after = el.value.slice(pos);
    const next = before + s.insert + after;
    emit('update:modelValue', next);
    open.value = false;
    requestAnimationFrame(() => {
        const caret = (before + s.insert).length;
        el.focus();
        el.setSelectionRange(caret, caret);
    });
    void check(next);
}

function onKey(e: KeyboardEvent) {
    if (open.value && suggestions.value.length) {
        if (e.key === 'ArrowDown') { e.preventDefault(); index.value = (index.value + 1) % suggestions.value.length; return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); index.value = (index.value - 1 + suggestions.value.length) % suggestions.value.length; return; }
        if (e.key === 'Tab' || (e.key === 'Enter' && word.value)) { e.preventDefault(); apply(suggestions.value[index.value]); return; }
        if (e.key === 'Escape') { open.value = false; return; }
    }
    if (e.key === 'Enter') emit('submit');
}

function onBlur() { setTimeout(() => { open.value = false; }, 120); }
function onFocus() { updateWord(); }

async function check(text: string) {
    if (!text.trim()) { error.value = ''; valid.value = false; emit('validity', false, null); return; }
    checking.value = true;
    try {
        const res = await tPost<any>('/terminal/formula/check', {
            Formula: text, Symbol: props.symbol, Interval: props.interval,
            Inputs: Object.fromEntries((props.inputs ?? []).map(i => [i, 1])), Variables: props.variables,
        });
        if (!res.Ok) {
            const d = res.Errors?.[0];
            error.value = d ? `${d.Message}${typeof d.Position === 'number' ? ` @${d.Position}` : ''}` : 'Invalid formula';
            valid.value = false;
        } else if (props.requireBoolean && res.IsBoolean === false) {
            error.value = 'Must be a condition (true/false)';
            valid.value = false;
        } else {
            error.value = '';
            valid.value = true;
            summary.value = res.IsBoolean
                ? `condition · true on ${res.TrueCount ?? '?'} of ${res.Bars ?? '?'} bars`
                : `value ${res.Last ?? '—'} · lookback ${res.Lookback}`;
        }
        emit('validity', valid.value, res);
    } catch (e: any) {
        error.value = e?.message ?? 'Check failed';
        valid.value = false;
    } finally { checking.value = false; }
}

watch(() => props.symbol, () => { if (props.modelValue) void check(props.modelValue); });
defineExpose({ check, focus: () => input.value?.focus() });
</script>

<style scoped>
.otf { position: relative; min-width: 0; flex: 1 1 auto; }
.wrap { position: relative; display: flex; align-items: center; }
.prefix { position: absolute; left: 6px; font-family: var(--ot-mono); font-size: 10.5px; color: var(--ot-accent); pointer-events: none; }
.wrap input { padding-right: 22px; }
.prefix + input { padding-left: 28px; }
.state { position: absolute; right: 6px; font-size: 11px; }
.state.good { color: var(--ot-positive); }
.state.bad { color: var(--ot-negative); cursor: help; }
.invalid input { border-color: rgba(242, 84, 91, 0.7); }
.err { font-size: 10.5px; color: var(--ot-negative); margin-top: 2px; }
.sugg {
    position: absolute; top: calc(100% + 2px); left: 0; z-index: var(--ot-z-popover); list-style: none; margin: 0; padding: 3px;
    min-width: 280px; max-width: 520px; max-height: 260px; overflow-y: auto; background: var(--ot-surface-2);
    border: 1px solid var(--ot-line-strong); border-radius: var(--ot-radius); box-shadow: 0 12px 30px rgba(0, 0, 0, 0.6);
}
.sugg li { display: flex; gap: 8px; padding: 3px 6px; border-radius: 3px; cursor: pointer; font-size: 11.5px; align-items: baseline; }
.sugg li b { font-family: var(--ot-mono); color: var(--ot-accent); font-weight: 600; }
.sugg li span { color: var(--ot-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: var(--ot-mono); font-size: 10.5px; }
.sugg li.active, .sugg li:hover { background: var(--ot-accent-soft); }
</style>
