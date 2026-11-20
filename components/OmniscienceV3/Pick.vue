<template>
    <OmniscienceV3Popover v-model:open="open" :label="label" :block="variant === 'field'" :data-testid="testid">
        <template #trigger="{ toggle }">
            <span class="omni-pill" :class="{ set: modelValue.length > 0, field: variant === 'field', off: disabled }">
                <button :id="inputId" class="main" type="button" aria-haspopup="listbox" :aria-expanded="open" :disabled="disabled" @click="toggle">
                    <span v-if="variant === 'pill'" class="k">{{ label }}</span>
                    <span class="v" :class="{ none: !modelValue.length }">{{ summary }}</span>
                    <span class="caret" aria-hidden="true">▾</span>
                </button>
                <button v-if="modelValue.length && !disabled" class="x" type="button" :aria-label="`Clear ${label.toLowerCase()}`" :title="`Clear ${label.toLowerCase()}`" @click="clear()">✕</button>
            </span>
        </template>

        <div class="omni-picker">
            <div v-if="negatable" class="omni-segment sm mode" role="group" :aria-label="`${label}: keep these or leave them out`">
                <button type="button" :aria-pressed="!not" @click="emit('update:not', false)">is</button>
                <button type="button" :aria-pressed="not" @click="emit('update:not', true)">is not</button>
            </div>
            <label class="omni-search find">
                <span class="glyph" aria-hidden="true">⌕</span>
                <span class="visually-hidden">Search {{ label.toLowerCase() }}</span>
                <input ref="box" v-model="text" class="omni-input" type="search" autocomplete="off" spellcheck="false" :placeholder="searchHint"
                       :aria-controls="listId" :aria-activedescendant="shown[index] ? `${listId}-${index}` : undefined"
                       @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.enter.prevent="choose(shown[index])" />
            </label>
            <ul :id="listId" class="options" role="listbox" :aria-label="label" :aria-multiselectable="multiple" :aria-busy="loading">
                <li v-for="(o, i) in shown" :id="`${listId}-${i}`" :key="o.id" role="option" :aria-selected="isOn(o.id)" :class="{ active: i === index, on: isOn(o.id) }"
                    @mouseenter="index = i" @mousedown.prevent @click="choose(o)">
                    <span class="tick" aria-hidden="true">{{ isOn(o.id) ? '✓' : '' }}</span>
                    <span class="what"><span class="name">{{ o.label }}</span><span v-if="o.detail" class="sub">{{ o.detail }}</span></span>
                    <span v-if="o.count != null" class="n">{{ omniCount(o.count) }}</span>
                </li>
                <li v-if="failed" class="note" role="presentation">The list could not be loaded. {{ allowId ? 'An id can still be added below.' : '' }}</li>
                <li v-else-if="loading && !shown.length" class="note" role="presentation">Looking…</li>
                <li v-else-if="!shown.length" class="note" role="presentation">{{ text.trim() ? `Nothing matches “${text.trim()}”.` : 'Nothing to choose from yet.' }}</li>
                <li v-if="truncated && shown.length" class="note" role="presentation">More match. Type a few letters to narrow them down.</li>
            </ul>
            <form v-if="byId" class="byid" @submit.prevent="addId()">
                <input ref="idBox" v-model="idText" class="omni-input mono" autocomplete="off" spellcheck="false" :placeholder="idHint" :aria-label="freeWord" />
                <button class="omni-btn sm" type="submit" :disabled="!idText.trim()">Add</button>
            </form>
            <p v-if="help" class="help">{{ help }}</p>
            <div class="foot">
                <span class="omni-muted">{{ modelValue.length ? `${modelValue.length} chosen` : multiple ? 'Choose any number' : 'Choose one' }}</span>
                <span class="grow"></span>
                <button v-if="allowId" class="omni-btn ghost sm" type="button" :aria-pressed="byId" @click="toggleById()">{{ byId ? 'Hide' : `${freeWord}…` }}</button>
                <button v-if="modelValue.length" class="omni-btn ghost sm" type="button" @click="clear()">Clear</button>
                <button class="omni-btn sm" type="button" @click="open = false">Done</button>
            </div>
        </div>
    </OmniscienceV3Popover>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch, watchEffect } from 'vue';
import { isOmniAbort } from '~/scripts/omniscience/api';
import { omniCount } from '~/scripts/omniscience/format';
import type { OmniOption, OmniPickKind, OmniPickScope } from '~/scripts/omniscience/filters';
import { omniPickOptions, useOmniPickLabels } from '~/composables/useOmniFilters';

/**
 * A dropdown that picks things by name: people, servers, conversations, platforms, sites, or a list the page gives it.
 * It opens on the most useful few, narrows as you type, and can be told "is not". Nobody has to know an id; one can
 * still be added by hand ("Add by id…"), and a server or conversation is also found by typing its id.
 */
const props = withDefaults(defineProps<{
    modelValue: string[];
    /** Leave the chosen out instead of keeping them. */
    not?: boolean;
    kind: OmniPickKind;
    /** What is being picked: "Server", "Posted by". */
    label: string;
    /** What it says when nothing is chosen. */
    any?: string;
    options?: readonly OmniOption[];
    load?: (query: string, signal: AbortSignal) => Promise<OmniOption[]>;
    multiple?: boolean;
    negatable?: boolean;
    /** Narrows what is offered (a conversation picker under chosen servers). */
    scope?: OmniPickScope;
    /** `pill`: a filter on a bar. `field`: a form control as wide as its line. */
    variant?: 'pill' | 'field';
    help?: string;
    disabled?: boolean;
    inputId?: string;
    testid?: string;
}>(), { not: false, any: 'any', multiple: true, negatable: false, variant: 'pill', disabled: false, testid: 'omni-pick' });
const emit = defineEmits<{ 'update:modelValue': [ids: string[]]; 'update:not': [not: boolean] }>();

const open = ref(false);
const text = ref('');
const index = ref(0);
const found = ref<OmniOption[]>([]);
const truncated = ref(false);
const loading = ref(false);
const failed = ref(false);
const byId = ref(false);
const idText = ref('');
const box = ref<HTMLInputElement | null>(null);
const idBox = ref<HTMLInputElement | null>(null);
const listId = useId();

const { want, remember, labelOf } = useOmniPickLabels();
watchEffect(() => want(props.kind, props.modelValue));
const nameOf = (id: string) => labelOf(props.kind, id, props.options);

const summary = computed(() => {
    const ids = props.modelValue;
    if (!ids.length) return props.any;
    const names = ids.slice(0, 2).map(nameOf).join(', ') + (ids.length > 2 ? ` +${ids.length - 2}` : '');
    return props.not ? `not ${names}` : names;
});

/** A list the page gives is complete, so nothing else can be added to it; everything else can take an id (or a site) by hand. */
const allowId = computed(() => props.kind !== 'options' && props.kind !== 'platform');
const freeWord = computed(() => (props.kind === 'site' ? 'Add a site' : props.kind === 'custom' ? 'Add a value' : 'Add by id'));
const idHint = computed(() => ({ person: 'A person id', guild: 'A server id, e.g. discord:1234567890', conversation: 'A conversation id, e.g. discord:1234567890', site: 'A site, e.g. youtube.com' } as Record<string, string>)[props.kind] ?? 'A value');
const searchHint = computed(() => ({
    person: 'Name or username…', guild: 'Server name…', conversation: 'Channel, group or person…', platform: 'Platform…', site: 'Site…',
} as Record<string, string>)[props.kind] ?? 'Search…');

const isOn = (id: string) => props.modelValue.includes(id);

// With nothing typed, what is already chosen leads the list, so it can be unticked without being searched for again.
const shown = computed<OmniOption[]>(() => {
    if (text.value.trim()) return found.value;
    const listed = new Set(found.value.map(o => o.id));
    const chosen = props.modelValue.filter(id => !listed.has(id)).map(id => ({ id, label: nameOf(id) }));
    return [...chosen, ...found.value];
});

let controller: AbortController | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

async function load() {
    controller?.abort();
    const mine = new AbortController();
    controller = mine;
    loading.value = true;
    try {
        const page = await omniPickOptions(props.kind, text.value, props.scope ?? {}, { options: props.options, load: props.load }, mine.signal);
        if (mine.signal.aborted) return;
        found.value = page.items;
        truncated.value = page.truncated;
        failed.value = false;
        index.value = 0;
    } catch (caught) {
        if (mine.signal.aborted || isOmniAbort(caught)) return;
        found.value = [];
        truncated.value = false;
        failed.value = true;
    } finally {
        if (controller === mine) { controller = null; loading.value = false; }
    }
}

watch(open, async isOpen => {
    if (!isOpen) { controller?.abort(); return; }
    text.value = '';
    byId.value = false;
    void load();
    await nextTick();
    box.value?.focus();
});
watch(text, () => {
    if (!open.value) return;
    if (timer) clearTimeout(timer);
    // A list the page gave is filtered at once; a search of the server waits for a pause in the typing.
    timer = setTimeout(() => { timer = null; void load(); }, props.kind === 'options' ? 0 : 180);
});
// What narrows the options changed (another server was chosen): what was listed no longer applies.
watch(() => JSON.stringify(props.scope ?? {}), () => { if (open.value) void load(); });
onBeforeUnmount(() => { controller?.abort(); if (timer) clearTimeout(timer); });

function move(step: number) {
    const n = shown.value.length;
    if (!n) return;
    index.value = (index.value + step + n) % n;
    void nextTick(() => document.getElementById(`${listId}-${index.value}`)?.scrollIntoView({ block: 'nearest' }));
}

function choose(option: OmniOption | undefined) {
    if (!option) return;
    remember(props.kind, option.id, option.label);
    if (!props.multiple) {
        emit('update:modelValue', isOn(option.id) ? [] : [option.id]);
        open.value = false;
        return;
    }
    emit('update:modelValue', isOn(option.id) ? props.modelValue.filter(id => id !== option.id) : [...props.modelValue, option.id]);
}

function clear() {
    emit('update:modelValue', []);
    if (props.not) emit('update:not', false);
}

async function toggleById() {
    byId.value = !byId.value;
    if (!byId.value) return;
    await nextTick();
    idBox.value?.focus();
}

function addId() {
    // Several can be pasted at once, separated by commas, spaces or new lines.
    const ids = idText.value.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
    if (!ids.length) return;
    emit('update:modelValue', props.multiple ? [...new Set([...props.modelValue, ...ids])] : [ids[0]!]);
    idText.value = '';
    if (!props.multiple) open.value = false;
}
</script>
