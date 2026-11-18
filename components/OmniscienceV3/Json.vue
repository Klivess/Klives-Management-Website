<template>
    <span v-if="empty" class="omni-muted">—</span>
    <pre v-else class="omni-json" :style="{ maxHeight }">{{ text }}</pre>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/** Structured data (a job payload, run progress, an output) shown as it is, indented. */
const props = withDefaults(defineProps<{
    /** An object, or a JSON string to be parsed. */
    value: unknown;
    maxHeight?: string;
}>(), { maxHeight: '320px' });

const parsed = computed(() => {
    if (typeof props.value !== 'string') return props.value;
    try { return JSON.parse(props.value); } catch { return props.value; }
});
const empty = computed(() => parsed.value === null || parsed.value === undefined || parsed.value === '');
const text = computed(() => (typeof parsed.value === 'string' ? parsed.value : JSON.stringify(parsed.value, null, 2)));
</script>

<style scoped>
.omni-json {
    margin: 0;
    padding: 10px 12px;
    overflow: auto;
    font-family: var(--omni-mono);
    font-size: 12px;
    line-height: 17px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    background: var(--omni-surface-1, rgba(0, 0, 0, 0.25));
    border: 1px solid var(--omni-line);
    border-radius: var(--omni-radius-sm);
}
</style>
