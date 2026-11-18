<template>
  <Teleport to="body">
    <div v-if="open" class="kgx-layer kgx-scrim" @mousedown.self="emit('close')">
      <div ref="panel" class="kgx-dialog" :data-wide="wide || undefined" :data-tone="tone" role="dialog" aria-modal="true" :aria-labelledby="titleId" @keydown.esc.stop="emit('close')" @keydown.ctrl.enter="canConfirm && emit('confirm')">
        <header class="kgx-dialog__head">
          <h2 :id="titleId" class="kgx-dialog__title"><GamesIcon v-if="icon" :name="icon" />{{ title }}</h2>
          <button class="kgx-iconbtn" aria-label="Close" @click="emit('close')"><GamesIcon name="x" /></button>
        </header>
        <div class="kgx-dialog__body"><slot /></div>
        <label v-if="typeToConfirm" class="kgx-field kgx-dialog__type">
          <span>Type <b class="kgx-mono">{{ typeToConfirm }}</b> to confirm</span>
          <input v-model="typed" autocomplete="off" spellcheck="false" data-testid="dialog-type" />
        </label>
        <footer v-if="confirmLabel" class="kgx-dialog__foot">
          <slot name="foot-left" />
          <span class="kgx-dialog__spacer"></span>
          <button class="kgx-btn kgx-btn--ghost" @click="emit('close')">Cancel</button>
          <button class="kgx-btn" :class="tone === 'crit' ? 'kgx-btn--danger' : 'kgx-btn--go'" :disabled="!canConfirm" data-testid="dialog-confirm" @click="emit('confirm')">
            <GamesIcon v-if="busy" name="refresh" class="kgx-spin" />{{ confirmLabel }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';

const props = defineProps<{
  open: boolean;
  title: string;
  icon?: string;
  tone?: 'crit' | 'warn' | 'info';
  confirmLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  wide?: boolean;
  typeToConfirm?: string;
}>();
const emit = defineEmits<{ close: []; confirm: [] }>();

let seq = 0;
const titleId = `kgx-dlg-${++seq}-${Math.random().toString(36).slice(2, 7)}`;
const typed = ref('');
const panel = ref<HTMLElement | null>(null);
const canConfirm = computed(() => !props.busy && !props.disabled && (!props.typeToConfirm || typed.value.trim() === props.typeToConfirm));

watch(() => props.open, open => {
  typed.value = '';
  if (open) nextTick(() => {
    const first = panel.value?.querySelector<HTMLElement>('input, textarea, select, [data-autofocus]');
    (first ?? panel.value?.querySelector<HTMLElement>('button'))?.focus();
  });
});
</script>
