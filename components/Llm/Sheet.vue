<!-- A side sheet over the page (teleported, so the page's grid and scroll are untouched). Esc closes it. -->
<template>
  <Teleport to="body">
    <div v-if="open" class="llx-layer">
      <div class="llx-scrim" @click="$emit('close')"></div>
      <aside class="llx-sheet" :class="{ 'llx-sheet--wide': wide }" role="dialog" aria-modal="true" :aria-label="title" :data-testid="testid" @keydown.esc.stop="$emit('close')">
        <header class="llx-sheet__head">
          <div class="llx-sheet__title">
            <span v-if="icon" class="llx-sheet__mark" :data-tone="tone || undefined"><LlmIcon :name="icon" /></span>
            <div class="llx-truncate">
              <h2 class="llx-truncate">{{ title }}</h2>
              <p v-if="sub" class="llx-dim llx-truncate">{{ sub }}</p>
            </div>
          </div>
          <div class="llx-sheet__tools"><slot name="tools" /></div>
          <button ref="closer" class="llx-iconbtn" aria-label="Close" @click="$emit('close')"><LlmIcon name="x" /></button>
        </header>
        <div class="llx-sheet__body"><slot /></div>
      </aside>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

const props = defineProps<{ open: boolean; title: string; sub?: string; icon?: string; tone?: string; wide?: boolean; testid?: string }>();
defineEmits<{ close: [] }>();
const closer = ref<HTMLElement | null>(null);
watch(() => props.open, async open => { if (open) { await nextTick(); closer.value?.focus(); } });
</script>
