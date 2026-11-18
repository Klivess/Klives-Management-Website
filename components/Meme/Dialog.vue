<template>
  <Teleport to="body">
    <div v-if="open" class="msx-layer">
      <div class="msx-scrim" @click="$emit('close')"></div>
      <div ref="box" class="msx-dialog" role="dialog" aria-modal="true" :aria-labelledby="titleId" :data-testid="testid" @keydown.esc.stop.prevent="$emit('close')">
        <div class="msx-dialog__head">
          <span class="msx-dialog__glyph" :data-tone="tone"><MemeIcon :name="icon" /></span>
          <div style="min-width: 0">
            <h2 :id="titleId" class="msx-dialog__title">{{ title }}</h2>
            <p v-if="sub" class="msx-dialog__sub">{{ sub }}</p>
          </div>
        </div>
        <div v-if="$slots.default" class="msx-dialog__body"><slot /></div>
        <div class="msx-dialog__actions"><slot name="actions" /></div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

const props = withDefaults(defineProps<{ open: boolean; title: string; sub?: string; icon?: string; tone?: string; testid?: string }>(), {
  sub: '', icon: 'info', tone: 'info', testid: undefined,
});
defineEmits<{ close: [] }>();
const box = ref<HTMLElement | null>(null);
const titleId = `msx-dialog-${Math.random().toString(36).slice(2, 8)}`;

// Focus the field marked data-autofocus, else the last action that is not destructive.
watch(() => props.open, async open => {
  if (!open) return;
  await nextTick();
  const el = box.value?.querySelector<HTMLElement>('[data-autofocus]')
    ?? [...(box.value?.querySelectorAll<HTMLElement>('.msx-dialog__actions button') ?? [])].reverse().find(b => !b.className.includes('danger'));
  el?.focus();
});
</script>
