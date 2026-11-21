<template>
  <label class="twx-switch" :class="{ 'twx-switch--off': disabled }" :data-testid="testid">
    <span class="twx-switch__copy">
      <b>{{ title }}</b>
      <small v-if="text">{{ text }}</small>
    </span>
    <input type="checkbox" role="switch" :checked="modelValue" :disabled="disabled" @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)" />
    <i class="twx-switch__ui" aria-hidden="true"></i>
  </label>
</template>

<script setup lang="ts">
defineProps<{ modelValue: boolean; title: string; text?: string; disabled?: boolean; testid?: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
</script>
