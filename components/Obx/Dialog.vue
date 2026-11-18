<template>
  <Teleport to="body">
    <div v-if="open" class="obx-layer">
      <div class="obx-scrim" @pointerdown.self="emit('close')">
        <div ref="box" class="obx-dialog" :class="{ 'obx-dialog--wide': wide }" role="dialog" aria-modal="true" :aria-label="title" :data-testid="testid" @keydown="onKey">
          <header class="obx-dialog__head">
            <span v-if="icon" class="obx-dialog__glyph" :data-tone="tone"><ObxIcon :name="icon" /></span>
            <div style="flex: 1; min-width: 0">
              <h2 class="obx-dialog__title">{{ title }}</h2>
              <p v-if="sub" class="obx-dialog__sub">{{ sub }}</p>
            </div>
            <button class="obx-iconbtn" aria-label="Close" @click="emit('close')"><ObxIcon name="x" /></button>
          </header>
          <div class="obx-dialog__body"><slot /></div>
          <footer v-if="$slots.actions" class="obx-dialog__actions"><slot name="actions" /></footer>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

/** A modal for what should be read before it happens. Esc closes; focus starts on [data-autofocus] or the first field. */
const props = defineProps<{ open: boolean; title: string; sub?: string; icon?: string; tone?: string; wide?: boolean; testid?: string }>();
const emit = defineEmits<{ close: [] }>();
const box = ref<HTMLElement | null>(null);

watch(() => props.open, async open => {
  if (!open) return;
  await nextTick();
  const target = box.value?.querySelector<HTMLElement>('[data-autofocus]') ?? box.value?.querySelector<HTMLElement>('input, textarea, select');
  target?.focus();
}, { immediate: true });

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); emit('close'); }
}
</script>
