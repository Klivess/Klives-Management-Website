<template>
    <!-- Tags as chips: Enter or comma adds, Backspace on an empty input removes the last. -->
    <div class="tb-tags ot-input" :class="{ disabled }" @click="input?.focus()">
        <span v-for="(tag, i) in modelValue" :key="tag + i" class="tb-tag">
            {{ prefix }}{{ tag }}
            <button v-if="!disabled" type="button" class="x" :aria-label="`Remove ${tag}`" @click.stop="remove(i)">×</button>
        </span>
        <input :id="inputId" ref="input" v-model="draft" :placeholder="modelValue.length ? '' : placeholder" :disabled="disabled"
               :aria-label="label" @keydown.enter.prevent="commit" @keydown="onKey" @blur="commit" @paste="onPaste" />
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = withDefaults(defineProps<{
    modelValue: string[];
    placeholder?: string;
    label?: string;
    prefix?: string;
    max?: number;
    disabled?: boolean;
    /** Lets a visible `<label for>` target the text input. */
    inputId?: string;
}>(), { placeholder: 'Add a tag…', label: 'Tags', prefix: '#', max: 200 });

const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>();
const draft = ref('');
const input = ref<HTMLInputElement | null>(null);

function add(raw: string) {
    const parts = raw.split(',').map(p => p.trim().replace(/^#+/, '').replace(/\s+/g, ' ')).filter(Boolean);
    if (!parts.length) return;
    const next = [...props.modelValue];
    for (const part of parts) {
        if (next.length >= props.max) break;
        if (!next.some(t => t.toLowerCase() === part.toLowerCase())) next.push(part);
    }
    emit('update:modelValue', next);
}

function commit() {
    if (draft.value.trim()) add(draft.value);
    draft.value = '';
}

function onKey(e: KeyboardEvent) {
    if (e.key === ',') {
        e.preventDefault();
        commit();
    } else if (e.key === 'Backspace' && !draft.value && props.modelValue.length) {
        remove(props.modelValue.length - 1);
    }
}

function onPaste(e: ClipboardEvent) {
    const text = e.clipboardData?.getData('text') ?? '';
    if (text.includes(',') || text.includes('\n')) {
        e.preventDefault();
        add(text.replace(/\n/g, ','));
    }
}

function remove(index: number) {
    const next = [...props.modelValue];
    next.splice(index, 1);
    emit('update:modelValue', next);
}
</script>

<style scoped>
.tb-tags {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    height: auto !important;
    min-height: var(--ot-control);
    padding: 3px 6px;
    cursor: text;
}
.tb-tags.disabled { opacity: 0.6; cursor: default; }
.tb-tags input {
    flex: 1 1 120px;
    min-width: 80px;
    border: 0;
    outline: 0;
    background: transparent;
    font: inherit;
    height: 24px;
}
.tb-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--ot-info-soft);
    color: var(--ot-info);
    font-size: 12px;
    line-height: 22px;
    white-space: nowrap;
}
.tb-tag .x {
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    padding: 0;
    font-size: 13px;
    line-height: 1;
    opacity: 0.7;
}
.tb-tag .x:hover { opacity: 1; }
</style>
