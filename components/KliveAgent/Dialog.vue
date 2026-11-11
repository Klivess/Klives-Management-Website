<template>
  <Teleport to="body">
    <div v-if="open" class="kax-layer">
      <div class="kax-scrim" @pointerdown.self="emit('close')" @keydown.esc.stop="emit('close')">
        <div ref="box" class="kax-dialog" role="dialog" aria-modal="true" :aria-label="title" :data-testid="testid" tabindex="-1">
          <div class="kax-dialog__head">
            <span class="kax-dialog__icon" :data-tone="tone"><KliveAgentIcon :name="icon" /></span>
            <div>
              <h2 class="kax-dialog__title">{{ title }}</h2>
              <p v-if="sub" class="kax-dialog__sub">{{ sub }}</p>
            </div>
          </div>
          <div v-if="$slots.default" class="kax-dialog__body"><slot /></div>
          <div class="kax-dialog__actions"><slot name="actions" /></div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import KliveAgentIcon from '~/components/KliveAgent/Icon.vue';

/**
 * A confirmation. Focus goes to the first field marked data-autofocus, else to the dialog itself:
 * never to a destructive button, so Enter from the keyboard cannot cancel something by accident.
 */
const props = withDefaults(defineProps<{ open: boolean; title: string; sub?: string; icon?: string; tone?: string; testid?: string }>(), {
  sub: '', icon: 'info', tone: 'neutral', testid: 'kax-dialog',
});
const emit = defineEmits<{ close: [] }>();
const box = ref<HTMLElement | null>(null);

watch(() => props.open, async open => {
  if (!open) return;
  await nextTick();
  const field = box.value?.querySelector<HTMLElement>('[data-autofocus]');
  (field ?? box.value)?.focus();
});
</script>
