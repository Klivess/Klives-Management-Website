<template>
  <!-- Tags as chips: Enter or comma adds, Backspace on an empty input takes the last one off, pasting a
       comma- or line-separated list adds them all. -->
  <div class="tmb-tagbox" :data-disabled="disabled || undefined" @click="input?.focus()">
    <span v-for="(tag, i) in modelValue" :key="tag + i" class="tmb-tagbox__tag" :data-tone="tones?.[tag.toLowerCase()]" :title="titles?.[tag.toLowerCase()]">
      {{ prefix }}{{ tag }}
      <button v-if="!disabled" type="button" :aria-label="`Remove ${tag}`" @click.stop="remove(i)"><TumblrIcon name="x" /></button>
    </span>
    <input :id="inputId" ref="input" v-model="draft" :placeholder="modelValue.length ? '' : placeholder" :disabled="disabled" :aria-label="label"
           @keydown.enter.prevent="commit" @keydown="onKey" @blur="commit" @paste="onPaste" />
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
  inputId?: string;
  /** Tag (lower case) → tone, e.g. what Tumblr's listing says about it. */
  tones?: Record<string, string> | null;
  titles?: Record<string, string> | null;
}>(), { placeholder: 'Add a tag…', label: 'Tags', prefix: '#', max: 200 });

const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>();
const draft = ref('');
const input = ref<HTMLInputElement | null>(null);

function add(raw: string) {
  const parts = raw.split(',').map(p => p.trim().replace(/^[#@]+/, '').replace(/\s+/g, ' ')).filter(Boolean);
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

function onKey(event: KeyboardEvent) {
  if (event.key === ',') { event.preventDefault(); commit(); }
  else if (event.key === 'Backspace' && !draft.value && props.modelValue.length) remove(props.modelValue.length - 1);
}

function onPaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text') ?? '';
  if (text.includes(',') || text.includes('\n')) {
    event.preventDefault();
    add(text.replace(/\n/g, ','));
  }
}

function remove(index: number) {
  const next = [...props.modelValue];
  next.splice(index, 1);
  emit('update:modelValue', next);
}
</script>
