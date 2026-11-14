<template>
  <Teleport to="body">
    <div v-if="open" class="ktx-layer">
      <div class="ktx-scrim" @pointerdown.self="emit('close')">
        <div ref="box" class="ktx-dialog" role="dialog" aria-modal="true" :aria-label="title" :data-tone="tone" :data-testid="testid" @keydown="onKey">
          <header class="ktx-dialog__head">
            <span v-if="icon" class="ktx-dialog__glyph"><TechIcon :name="icon" /></span>
            <div style="min-width: 0">
              <h2 class="ktx-dialog__title">{{ title }}</h2>
              <p v-if="sub" class="ktx-dialog__sub">{{ sub }}</p>
            </div>
          </header>
          <div class="ktx-dialog__body"><slot /></div>
          <footer class="ktx-dialog__actions"><slot name="actions" /></footer>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

/** A confirmation. Destructive buttons never take the first focus: Enter must not destroy. */
const props = defineProps<{ open: boolean; title: string; sub?: string; icon?: string; tone?: string; testid?: string }>();
const emit = defineEmits<{ close: [] }>();
const box = ref<HTMLElement | null>(null);

watch(() => props.open, async open => {
  if (!open) return;
  await nextTick();
  const target = box.value?.querySelector<HTMLElement>('[data-autofocus]')
    ?? box.value?.querySelector<HTMLElement>('.ktx-btn--ghost')
    ?? box.value?.querySelector<HTMLElement>('button');
  target?.focus();
});

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); emit('close'); }
}
</script>
