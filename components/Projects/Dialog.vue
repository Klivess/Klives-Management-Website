<template>
  <Teleport to="body">
    <template v-if="open">
      <div class="pjx-layer pjx-scrim" @click="$emit('close')"></div>
      <section ref="root" class="pjx-layer pjx-dialog" role="dialog" aria-modal="true" :aria-label="title" @keydown.esc.stop="$emit('close')">
        <header class="pjx-dialog__head">
          <h2>{{ title }}</h2>
          <p v-if="subtitle">{{ subtitle }}</p>
        </header>
        <div class="pjx-dialog__body"><slot /></div>
        <footer class="pjx-dialog__foot"><slot name="foot" /></footer>
      </section>
    </template>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

const props = defineProps<{ open: boolean; title: string; subtitle?: string }>();
defineEmits<{ (e: 'close'): void }>();
const root = ref<HTMLElement | null>(null);

// Focus the first field, else the action button, so the dialog can be answered from the keyboard. A destructive
// action never takes the focus: Enter on a delete confirmation lands on the safe choice.
watch(() => props.open, async open => {
  if (!open) return;
  await nextTick();
  const buttons = Array.from(root.value?.querySelectorAll<HTMLElement>('.pjx-dialog__foot button') ?? []);
  const last = buttons[buttons.length - 1];
  const action = last && !last.classList.contains('pjx-btn--danger') ? last : buttons[0];
  const target = root.value?.querySelector<HTMLElement>('textarea, input, select') ?? action;
  target?.focus();
});
</script>
