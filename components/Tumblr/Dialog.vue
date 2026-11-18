<template>
  <Teleport to="body">
    <div v-if="open" class="tmb-layer">
      <div class="tmb-scrim" @pointerdown.self="emit('close')">
        <div ref="box" class="tmb-dialog" :class="{ 'tmb-dialog--wide': wide }" role="dialog" aria-modal="true" :aria-label="title" :data-testid="testid" @keydown="onKey">
          <header class="tmb-dialog__head">
            <span v-if="icon" class="tmb-dialog__glyph" :data-tone="tone"><TumblrIcon :name="icon" /></span>
            <div style="flex: 1; min-width: 0">
              <h2 class="tmb-dialog__title">{{ title }}</h2>
              <p v-if="sub" class="tmb-dialog__sub">{{ sub }}</p>
            </div>
            <button class="tmb-iconbtn" aria-label="Close" @click="emit('close')"><TumblrIcon name="x" /></button>
          </header>
          <div class="tmb-dialog__body"><slot /></div>
          <footer v-if="$slots.actions" class="tmb-dialog__actions"><slot name="actions" /></footer>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

/** A modal for what should be read before it happens. Esc closes; focus starts inside, never on a destructive button. */
const props = defineProps<{ open: boolean; title: string; sub?: string; icon?: string; tone?: string; wide?: boolean; testid?: string }>();
const emit = defineEmits<{ close: [] }>();
const box = ref<HTMLElement | null>(null);

watch(() => props.open, async open => {
  if (!open) return;
  await nextTick();
  const target = box.value?.querySelector<HTMLElement>('[data-autofocus]')
    ?? box.value?.querySelector<HTMLElement>('input, textarea, select')
    ?? box.value?.querySelector<HTMLElement>('.tmb-dialog__actions button:not(.tmb-btn--solid-danger):not(.tmb-btn--danger)');
  target?.focus();
});

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); emit('close'); }
}
</script>
