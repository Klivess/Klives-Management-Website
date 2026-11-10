<template>
  <Teleport to="body">
    <div v-if="open" class="adm-layer">
      <div class="adm-scrim adm-scrim--center" @pointerdown.self="emit('close')">
        <div
          ref="panel"
          class="adm-dialog"
          :class="{ 'adm-dialog--wide': wide }"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
          :data-tone="tone"
          :data-testid="testid"
          @keydown.esc.stop.prevent="emit('close')"
          @keydown.tab="trapTab"
        >
          <header class="adm-dialog__head">
            <span class="adm-dialog__mark"><AdminIcon :name="icon" /></span>
            <div>
              <h2 class="adm-dialog__title">{{ title }}</h2>
              <p v-if="sub" class="adm-dialog__sub">{{ sub }}</p>
            </div>
          </header>
          <div class="adm-dialog__body"><slot /></div>
          <footer class="adm-dialog__foot"><slot name="actions" /></footer>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

const props = withDefaults(defineProps<{
  open: boolean;
  title: string;
  sub?: string;
  icon?: string;
  tone?: string;
  wide?: boolean;
  testid?: string;
}>(), { sub: '', icon: 'info', tone: 'ok', wide: false, testid: undefined });

const emit = defineEmits<{ close: [] }>();
const panel = ref<HTMLElement | null>(null);
let returnFocusTo: HTMLElement | null = null;

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

function focusables(): HTMLElement[] {
  return panel.value ? Array.from(panel.value.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
}

// Focus stays inside while open, and goes back to whatever opened it.
function trapTab(event: KeyboardEvent) {
  const items = focusables();
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

watch(() => props.open, async open => {
  if (open) {
    returnFocusTo = document.activeElement as HTMLElement | null;
    await nextTick();
    const preferred = panel.value?.querySelector<HTMLElement>('[data-autofocus]');
    (preferred ?? focusables()[0])?.focus();
  } else {
    returnFocusTo?.focus?.();
    returnFocusTo = null;
  }
});
</script>
