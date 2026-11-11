<template>
  <Teleport to="body">
    <div v-if="open" class="odx-layer">
      <div class="odx-scrim" @pointerdown.self="emit('close')">
        <div ref="box" class="odx-dialog" :class="{ 'odx-dialog--wide': wide }" role="dialog" aria-modal="true" :aria-label="title" :data-testid="testid" @keydown="onKey">
          <header class="odx-dialog__head">
            <span v-if="icon" class="odx-dialog__glyph" :data-tone="tone"><DefenceIcon :name="icon" /></span>
            <div style="flex: 1; min-width: 0">
              <h2 class="odx-dialog__title">{{ title }}</h2>
              <p v-if="sub" class="odx-dialog__sub">{{ sub }}</p>
            </div>
            <button class="odx-iconbtn" aria-label="Close" @click="emit('close')"><DefenceIcon name="x" /></button>
          </header>
          <div class="odx-dialog__body"><slot /></div>
          <footer v-if="$slots.actions" class="odx-dialog__actions"><slot name="actions" /></footer>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

/** A modal for the few things that should be read before they happen. Esc closes; focus starts inside. */
const props = defineProps<{ open: boolean; title: string; sub?: string; icon?: string; tone?: string; wide?: boolean; testid?: string }>();
const emit = defineEmits<{ close: [] }>();
const box = ref<HTMLElement | null>(null);

watch(() => props.open, async open => {
  if (!open) return;
  await nextTick();
  const target = box.value?.querySelector<HTMLElement>('[data-autofocus]') ?? box.value?.querySelector<HTMLElement>('input, textarea, button');
  target?.focus();
});

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); emit('close'); }
}
</script>
