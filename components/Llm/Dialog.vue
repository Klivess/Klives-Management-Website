<!-- A modal question. The first [data-autofocus] inside takes focus; Esc and the scrim cancel. -->
<template>
  <Teleport to="body">
    <div v-if="open" class="llx-layer">
      <div class="llx-scrim" @click="$emit('close')"></div>
      <div ref="box" class="llx-dialog" :class="{ 'llx-dialog--wide': wide }" role="dialog" aria-modal="true" :aria-label="title" :data-testid="testid" @keydown.esc.stop="$emit('close')">
        <header class="llx-dialog__head">
          <span v-if="icon" class="llx-dialog__mark" :data-tone="tone || undefined"><LlmIcon :name="icon" /></span>
          <div>
            <h2>{{ title }}</h2>
            <p v-if="sub" class="llx-dim">{{ sub }}</p>
          </div>
        </header>
        <div class="llx-dialog__body"><slot /></div>
        <footer class="llx-dialog__foot"><slot name="actions" /></footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

const props = defineProps<{ open: boolean; title: string; sub?: string; icon?: string; tone?: string; wide?: boolean; testid?: string }>();
defineEmits<{ close: [] }>();
const box = ref<HTMLElement | null>(null);
watch(() => props.open, async open => {
  if (!open) return;
  await nextTick();
  (box.value?.querySelector('[data-autofocus]') as HTMLElement | null ?? box.value?.querySelector('button, input, select, textarea') as HTMLElement | null)?.focus();
});
</script>
