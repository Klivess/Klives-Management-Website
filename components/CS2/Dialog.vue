<template>
  <Teleport to="body">
    <div v-if="open" class="cs2x-layer">
      <div class="cs2x-scrim" @pointerdown.self="emit('close')">
        <div ref="box" class="cs2x-dialog" role="dialog" aria-modal="true" :aria-label="title" :data-testid="testid" @keydown="onKey">
          <header class="cs2x-dialog__head">
            <span v-if="icon" class="cs2x-dialog__glyph" :data-tone="tone"><CS2Icon :name="icon" /></span>
            <div style="flex: 1; min-width: 0">
              <h2 class="cs2x-dialog__title">{{ title }}</h2>
              <p v-if="sub" class="cs2x-dialog__sub">{{ sub }}</p>
            </div>
            <button class="cs2x-iconbtn" aria-label="Close" @click="emit('close')"><CS2Icon name="x" /></button>
          </header>
          <div class="cs2x-dialog__body"><slot /></div>
          <footer v-if="$slots.actions" class="cs2x-dialog__actions"><slot name="actions" /></footer>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import CS2Icon from '~/components/CS2/Icon.vue';

/** A modal for the few things that should be read before they happen. Esc closes; focus starts inside. */
const props = defineProps<{ open: boolean; title: string; sub?: string; icon?: string; tone?: string; testid?: string }>();
const emit = defineEmits<{ close: [] }>();
const box = ref<HTMLElement | null>(null);

watch(() => props.open, async (open) => {
  if (!open) return;
  await nextTick();
  const target = box.value?.querySelector<HTMLElement>('[data-autofocus]') ?? box.value?.querySelector<HTMLElement>('input, textarea, button');
  target?.focus();
});

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); emit('close'); }
}
</script>
