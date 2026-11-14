<template>
  <Teleport to="body">
    <div v-if="toasts.length" class="pfx-layer">
      <div class="pfx-toasts" role="status" aria-live="polite">
        <div v-for="toast in toasts" :key="toast.id" class="pfx-toast" :data-tone="toast.tone" data-testid="pfx-toast">
          <PeopleIcon :name="toast.tone === 'crit' ? 'octagon-x' : toast.tone === 'warn' ? 'alert' : toast.tone === 'info' ? 'info' : 'check-circle'" />
          <span class="pfx-toast__text">{{ toast.text }}<small v-if="toast.detail">{{ toast.detail }}</small></span>
          <button v-if="toast.action" class="pfx-btn pfx-btn--xs" @click="runAction(toast)">{{ toast.action.label }}</button>
          <button class="pfx-iconbtn pfx-iconbtn--sm" aria-label="Dismiss" @click="emit('dismiss', toast.id)"><PeopleIcon name="x" /></button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { PeopleToast } from '~/composables/useProfilesConsole';

defineProps<{ toasts: PeopleToast[] }>();
const emit = defineEmits<{ dismiss: [id: number] }>();

function runAction(toast: PeopleToast) {
  emit('dismiss', toast.id);
  void toast.action?.run();
}
</script>
