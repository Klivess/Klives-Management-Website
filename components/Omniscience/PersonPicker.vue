<template>
    <div ref="root" class="os-person-picker">
        <label v-if="label" class="os-field-label">{{ label }}</label>
        <div class="os-picker-input-wrap">
            <span aria-hidden="true">⌕</span>
            <input
                ref="input"
                v-model="text"
                class="os-input"
                role="combobox"
                :aria-expanded="open"
                aria-autocomplete="list"
                :placeholder="placeholder"
                :disabled="disabled"
                @focus="open = results.length > 0"
                @input="onInput"
                @keydown.down.prevent="move(1)"
                @keydown.up.prevent="move(-1)"
                @keydown.enter.prevent="chooseHighlighted"
                @keydown.esc="open = false"
            />
            <button v-if="modelValue" type="button" class="os-picker-clear" aria-label="Clear person" @click="clear">×</button>
        </div>
        <div v-if="loading" class="os-picker-status">Searching…</div>
        <ul v-if="open" class="os-picker-results" role="listbox">
            <li
                v-for="(person, index) in results"
                :key="person.person_id"
                role="option"
                :aria-selected="index === highlighted"
                :class="{ highlighted: index === highlighted }"
                @mousedown.prevent="choose(person)"
                @mouseenter="highlighted = index"
            >
                <span class="os-picker-avatar">{{ initials(person.display_name) }}</span>
                <span class="os-picker-person">
                    <strong>{{ person.display_name }}</strong>
                    <small>{{ topHandle(person) }} · {{ formatCompact(person.message_count) }} messages</small>
                </span>
                <span class="os-badge" :class="person.tier">{{ person.tier }}</span>
            </li>
            <li v-if="!results.length" class="os-picker-empty">No people found.</li>
        </ul>
        <small v-if="error" class="os-field-error">{{ error }}</small>
    </div>
</template>

<script setup lang="ts">
import { nextTick } from 'vue';
import { formatCompact, omniscienceError, useOmniscienceApi } from '~/composables/useOmniscienceApi';

const props = withDefaults(defineProps<{
    modelValue: string;
    label?: string;
    placeholder?: string;
    disabled?: boolean;
}>(), { label: '', placeholder: 'Search a person…', disabled: false });
const emit = defineEmits<{
    'update:modelValue': [value: string];
    select: [person: any];
}>();

const api = useOmniscienceApi();
const root = ref<HTMLElement | null>(null);
const input = ref<HTMLInputElement | null>(null);
const text = ref('');
const results = ref<any[]>([]);
const open = ref(false);
const loading = ref(false);
const highlighted = ref(0);
const error = ref('');
let timer: ReturnType<typeof setTimeout> | null = null;
let sequence = 0;
let internalSelection = '';

function initials(name: string) { return (name || '?').trim().slice(0, 2).toUpperCase(); }
function topHandle(person: any) {
    const identity = person.identities?.[0];
    return identity ? `${identity.platform}:${identity.username || identity.display_name}` : (person.handles?.split('|')[0] || 'unknown');
}
function onInput() {
    error.value = '';
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => search(text.value), 220);
}
async function search(query: string) {
    const current = ++sequence;
    loading.value = true;
    try {
        const data = await api.get('/omniscience/workspace/directory?limit=12&search=' + encodeURIComponent(query));
        if (current !== sequence) return;
        results.value = data.items || [];
        highlighted.value = 0;
        open.value = true;
    } catch (cause) {
        if (current === sequence) error.value = omniscienceError(cause, 'Search failed.');
    } finally {
        if (current === sequence) loading.value = false;
    }
}
function choose(person: any) {
    internalSelection = person.person_id;
    emit('update:modelValue', person.person_id);
    emit('select', person);
    text.value = person.display_name;
    open.value = false;
    results.value = [];
}
function chooseHighlighted() {
    if (open.value && results.value[highlighted.value]) choose(results.value[highlighted.value]);
}
function move(delta: number) {
    if (!results.value.length) return;
    open.value = true;
    highlighted.value = (highlighted.value + delta + results.value.length) % results.value.length;
}
function clear() {
    internalSelection = '';
    emit('update:modelValue', '');
    text.value = '';
    results.value = [];
    nextTick(() => input.value?.focus());
}
function onDocumentClick(event: MouseEvent) {
    if (root.value && !root.value.contains(event.target as Node)) open.value = false;
}
async function resolveInitial() {
    if (!props.modelValue || text.value) return;
    if (props.modelValue === internalSelection) return;
    try {
        const person = await api.get('/omniscience/persons/get?personId=' + encodeURIComponent(props.modelValue));
        text.value = person.display_name || props.modelValue;
    } catch { text.value = props.modelValue; }
}
watch(() => props.modelValue, (value, previous) => {
    if (!value) text.value = '';
    else if (value !== previous) void resolveInitial();
});
onMounted(() => {
    document.addEventListener('mousedown', onDocumentClick);
    void resolveInitial();
});
onBeforeUnmount(() => {
    document.removeEventListener('mousedown', onDocumentClick);
    if (timer) clearTimeout(timer);
});
</script>

<style scoped>
.os-person-picker { position: relative; min-width: 0; }
.os-field-label { display: block; margin-bottom: 6px; color: var(--os-muted); font: 700 10px var(--os-mono); letter-spacing: .08em; text-transform: uppercase; }
.os-picker-input-wrap { position: relative; display: flex; align-items: center; }
.os-picker-input-wrap > span { position: absolute; left: 11px; color: var(--os-cyan); pointer-events: none; }
.os-picker-input-wrap .os-input { padding-left: 32px; padding-right: 32px; }
.os-picker-clear { position: absolute; right: 6px; border: 0; background: transparent; color: var(--os-muted); cursor: pointer; font-size: 20px; }
.os-picker-results { position: absolute; z-index: 50; top: calc(100% + 7px); left: 0; right: 0; max-height: 330px; overflow: auto; padding: 5px; margin: 0; list-style: none; border: 1px solid var(--os-line-strong); border-radius: 10px; background: #101824; box-shadow: 0 18px 45px rgba(0,0,0,.45); }
.os-picker-results li { display: flex; align-items: center; gap: 9px; padding: 8px; border-radius: 7px; cursor: pointer; }
.os-picker-results li.highlighted { background: rgba(95,211,255,.1); }
.os-picker-avatar { display: grid; place-items: center; width: 30px; height: 30px; flex: 0 0 30px; border-radius: 8px; background: rgba(95,211,255,.12); color: var(--os-cyan); font: 800 11px var(--os-mono); }
.os-picker-person { flex: 1; min-width: 0; }
.os-picker-person strong, .os-picker-person small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.os-picker-person strong { color: var(--os-ink); font-size: 12px; }
.os-picker-person small { color: var(--os-muted); font-size: 10px; }
.os-picker-empty { color: var(--os-muted); cursor: default !important; text-align: center; }
.os-picker-status { position: absolute; right: 10px; top: 10px; color: var(--os-faint); font-size: 10px; }
.os-field-error { display: block; margin-top: 4px; color: var(--os-red); }
</style>
