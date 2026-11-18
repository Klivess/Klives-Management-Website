<template>
  <Teleport to="body">
    <div v-if="open" class="pfx-layer">
      <div class="pfx-scrim" @pointerdown.self="emit('close')">
        <div ref="box" class="pfx-dialog" :class="{ 'pfx-dialog--wide': wide }" role="dialog" aria-modal="true" :aria-label="title" :data-testid="testid" @keydown="onKey">
          <header class="pfx-dialog__head">
            <span v-if="icon" class="pfx-dialog__glyph" :data-tone="tone"><PeopleIcon :name="icon" /></span>
            <div style="flex: 1; min-width: 0">
              <h2 class="pfx-dialog__title">{{ title }}</h2>
              <p v-if="sub" class="pfx-dialog__sub">{{ sub }}</p>
            </div>
            <button class="pfx-iconbtn" aria-label="Close" @click="emit('close')"><PeopleIcon name="x" /></button>
          </header>
          <div class="pfx-dialog__body"><slot /></div>
          <footer v-if="$slots.actions" class="pfx-dialog__actions"><slot name="actions" /></footer>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

/**
 * A modal for the few things that should be read before they happen. Esc closes; focus starts on
 * [data-autofocus], else the first field. Destructive buttons never take the first focus, so a
 * stray Enter can't confirm them.
 */
const props = defineProps<{ open: boolean; title: string; sub?: string; icon?: string; tone?: string; wide?: boolean; testid?: string }>();
const emit = defineEmits<{ close: [] }>();
const box = ref<HTMLElement | null>(null);

watch(() => props.open, async open => {
  if (!open) return;
  await nextTick();
  const target = box.value?.querySelector<HTMLElement>('[data-autofocus]')
    ?? box.value?.querySelector<HTMLElement>('input, textarea, select')
    ?? box.value?.querySelector<HTMLElement>('.pfx-dialog__actions .pfx-btn--ghost');
  target?.focus();
});

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); emit('close'); }
}
</script>
