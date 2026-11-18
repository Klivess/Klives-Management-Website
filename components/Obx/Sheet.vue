<template>
  <Teleport to="body">
    <div v-if="open" class="obx-layer">
      <div class="obx-sheet-scrim" @pointerdown="emit('close')"></div>
      <aside ref="box" class="obx-sheet" :class="{ 'obx-sheet--wide': wide }" role="dialog" aria-modal="true" :aria-label="title" :data-testid="testid" tabindex="-1" @keydown="onKey">
        <header class="obx-sheet__head">
          <slot name="lead" />
          <div style="flex: 1; min-width: 0">
            <h2 class="obx-sheet__title">{{ title }}</h2>
            <p v-if="sub" class="obx-sheet__sub">{{ sub }}</p>
          </div>
          <slot name="tools" />
          <button class="obx-iconbtn" aria-label="Close" @click="emit('close')"><ObxIcon name="x" /></button>
        </header>
        <div class="obx-sheet__body"><slot /></div>
      </aside>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';

/** A panel from the right that keeps the page behind it: playing a game, a model's details. Esc closes. */
const props = defineProps<{ open: boolean; title: string; sub?: string; wide?: boolean; testid?: string }>();
const emit = defineEmits<{ close: [] }>();
const box = ref<HTMLElement | null>(null);

// Esc closes the sheet wherever focus is (a download or a new tab leaves it on <body>), unless a dialog is above it.
function onDocKey(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  if (document.querySelector('.obx-layer .obx-dialog, .obx-layer .obx-palette')) return;
  event.preventDefault();
  emit('close');
}
watch(() => props.open, async open => {
  if (typeof document === 'undefined') return;
  document.removeEventListener('keydown', onDocKey);
  if (!open) return;
  document.addEventListener('keydown', onDocKey);
  await nextTick();
  box.value?.focus({ preventScroll: true });
}, { immediate: true });
onBeforeUnmount(() => { if (typeof document !== 'undefined') document.removeEventListener('keydown', onDocKey); });

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); emit('close'); }
}
</script>
