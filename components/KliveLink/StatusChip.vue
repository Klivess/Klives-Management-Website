<template>
  <span class="ot-chip kl-status" :class="tone">
    <span class="dot" aria-hidden="true"></span>
    {{ label }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  online?: boolean | null;
  stale?: boolean;
  state?: string;
}>();

const label = computed(() => {
  if (props.state) return props.state;
  if (props.stale) return 'Stale';
  if (props.online === true) return 'Online';
  if (props.online === false) return 'Offline';
  return 'Unknown';
});

const tone = computed(() => {
  if (props.state?.toLowerCase().includes('fail')) return 'bad';
  if (props.stale) return 'warn';
  if (props.online === true) return 'ok';
  if (props.online === false) return 'muted';
  return '';
});
</script>

<style scoped>
.kl-status { text-transform: none; letter-spacing: normal; gap: 6px; }
.dot { width: 6px; height: 6px; border-radius: 999px; background: currentColor; box-shadow: 0 0 6px currentColor; }
.ok { color: var(--ot-accent); }
.warn { color: var(--ot-warning); }
.bad { color: var(--ot-negative); }
.muted { color: var(--ot-muted); }
</style>
