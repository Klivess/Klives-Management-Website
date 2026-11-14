<template>
  <div class="pfx-seg" role="group" aria-label="Show permissions">
    <button type="button" class="pfx-seg__opt" :aria-pressed="modelValue === 'all'" @click="emit('update:modelValue', 'all')">All</button>
    <button type="button" class="pfx-seg__opt" :aria-pressed="modelValue === 'held'" @click="emit('update:modelValue', 'held')">Held</button>
    <button type="button" class="pfx-seg__opt" :aria-pressed="modelValue === 'off'" @click="emit('update:modelValue', 'off')">Not held</button>
    <button v-if="unusedCount != null" type="button" class="pfx-seg__opt" :aria-pressed="modelValue === 'unused'" :data-tone="unusedCount ? 'warn' : undefined" data-testid="show-unused" @click="emit('update:modelValue', 'unused')">
      Unused<span v-if="unusedCount" class="pfx-seg__count">{{ unusedCount }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
/** The permission editor's "show" filter. Unused appears once the review has said what was used. */
defineProps<{ modelValue: 'all' | 'held' | 'off' | 'unused'; unusedCount: number | null }>();
const emit = defineEmits<{ 'update:modelValue': [value: 'all' | 'held' | 'off' | 'unused'] }>();
</script>
