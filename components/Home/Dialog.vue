<template>
  <Teleport to="body">
    <div v-if="open" class="hom-layer">
      <div class="hom-scrim hom-scrim--center" @pointerdown.self="emit('close')">
        <div
          ref="panel"
          class="hom-dialog"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
          :data-tone="tone"
          :data-testid="testid"
          @keydown.esc.stop.prevent="emit('close')"
          @keydown.tab="trapTab"
        >
          <header class="hom-dialog__head">
            <span class="hom-dialog__mark"><HomeIcon :name="icon" /></span>
            <div>
              <h2 class="hom-dialog__title">{{ title }}</h2>
              <p v-if="sub" class="hom-dialog__sub">{{ sub }}</p>
            </div>
          </header>
          <div class="hom-dialog__body"><slot /></div>
          <footer class="hom-dialog__foot">
            <button class="hom-btn hom-btn--ghost" data-autofocus @click="emit('close')">Cancel</button>
            <button class="hom-btn" :data-variant="tone === 'crit' ? 'danger' : 'primary'" :data-testid="`${testid}-confirm`" @click="emit('confirm')">{{ confirmLabel }}</button>
          </footer>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

/* Asks before anything that stops or starts work. Cancel has the focus, so Enter by reflex costs nothing. */
const props = withDefaults(defineProps<{ open: boolean; title: string; sub?: string; icon?: string; tone?: string; confirmLabel?: string; testid?: string }>(), {
  sub: '', icon: 'alert', tone: 'warn', confirmLabel: 'Confirm', testid: 'home-dialog',
});
const emit = defineEmits<{ close: []; confirm: [] }>();
const panel = ref<HTMLElement | null>(null);
let returnFocusTo: HTMLElement | null = null;

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])';
const focusables = () => (panel.value ? Array.from(panel.value.querySelectorAll<HTMLElement>(FOCUSABLE)) : []);

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
    (panel.value?.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0])?.focus();
  } else {
    returnFocusTo?.focus?.();
    returnFocusTo = null;
  }
});
</script>
