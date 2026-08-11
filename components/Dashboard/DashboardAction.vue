<template>
  <NuxtLink
    v-if="to && !disabled"
    v-bind="attrs"
    :to="to"
    class="dashboard-action"
    :class="`dashboard-action--${tone}`"
    @click="emit('click', $event)"
  >
    <slot name="icon"><span v-if="icon" class="dashboard-action__icon" aria-hidden="true">{{ icon }}</span></slot>
    <span class="dashboard-action__label">{{ label }}</span>
    <span v-if="badge !== undefined && badge !== null && badge !== ''" class="dashboard-action__badge">{{ badge }}</span>
  </NuxtLink>
  <button
    v-else
    v-bind="attrs"
    type="button"
    class="dashboard-action"
    :class="`dashboard-action--${tone}`"
    :disabled="disabled"
    @click="emit('click', $event)"
  >
    <slot name="icon"><span v-if="icon" class="dashboard-action__icon" aria-hidden="true">{{ icon }}</span></slot>
    <span class="dashboard-action__label">{{ label }}</span>
    <span v-if="badge !== undefined && badge !== null && badge !== ''" class="dashboard-action__badge">{{ badge }}</span>
  </button>
</template>

<script setup lang="ts">
import { useAttrs } from 'vue';

defineOptions({ inheritAttrs: false });

withDefaults(defineProps<{
  label: string;
  icon?: string;
  to?: string;
  disabled?: boolean;
  tone?: 'neutral' | 'primary' | 'protect' | 'danger';
  badge?: string | number | null;
}>(), {
  icon: '',
  to: '',
  disabled: false,
  tone: 'neutral',
  badge: null,
});

const attrs = useAttrs();
const emit = defineEmits<{ click: [event: MouseEvent] }>();
</script>

<style scoped>
.dashboard-action {
  display: inline-flex;
  min-width: 0;
  height: 34px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 5px;
  padding: 0 9px;
  background: #1b1b1b;
  color: #c9c9c9;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  font-weight: 650;
  line-height: 1;
  text-decoration: none;
  white-space: nowrap;
}

.dashboard-action:hover:not(:disabled) {
  border-color: rgba(98, 206, 71, 0.35);
  background: #20251f;
  color: #f0f0f0;
}

.dashboard-action:focus-visible {
  outline: 2px solid #62ce47;
  outline-offset: 2px;
}

.dashboard-action:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.dashboard-action--primary {
  border-color: rgba(98, 206, 71, 0.35);
  background: rgba(77, 158, 57, 0.14);
  color: #94e381;
}

.dashboard-action--protect {
  border-color: rgba(227, 179, 65, 0.3);
  background: rgba(227, 179, 65, 0.08);
  color: #f0c35b;
}

.dashboard-action--danger {
  border-color: rgba(239, 100, 100, 0.32);
  background: rgba(239, 68, 68, 0.09);
  color: #ff9a9a;
}

.dashboard-action__icon { color: currentColor; font-size: 12px; }

.dashboard-action__label {
  overflow: hidden;
  color: currentColor;
  text-overflow: ellipsis;
}

.dashboard-action__badge {
  min-width: 16px;
  border-radius: 999px;
  padding: 2px 5px;
  background: rgba(255, 255, 255, 0.1);
  color: currentColor;
  font-size: 9px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}
</style>
