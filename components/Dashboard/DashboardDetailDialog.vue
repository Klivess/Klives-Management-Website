<template>
  <Teleport to="body">
    <Transition name="dashboard-dialog">
      <div
        v-if="open"
        class="dashboard-dialog__backdrop"
        @mousedown.self="close"
        @keydown="handleKeydown"
      >
        <section
          v-bind="attrs"
          ref="dialog"
          class="dashboard-dialog"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          tabindex="-1"
        >
          <header class="dashboard-dialog__header">
            <h2 :id="titleId" class="dashboard-dialog__title">{{ title }}</h2>
            <button class="dashboard-dialog__close" type="button" aria-label="Close dialog" @click="close">×</button>
          </header>
          <div class="dashboard-dialog__body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="dashboard-dialog__footer">
            <slot name="footer" />
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { getCurrentInstance, nextTick, onBeforeUnmount, ref, useAttrs, watch } from 'vue';

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  open: boolean;
  title: string;
}>();

const emit = defineEmits<{ 'update:open': [value: boolean] }>();
const attrs = useAttrs();
const dialog = ref<HTMLElement | null>(null);
const titleId = `dashboard-detail-title-${getCurrentInstance()?.uid ?? 'dialog'}`;
let returnFocus: HTMLElement | null = null;
let previousBodyOverflow = '';
let bodyLocked = false;

const close = () => emit('update:open', false);

const focusableElements = () => Array.from(dialog.value?.querySelectorAll<HTMLElement>(
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
) ?? []).filter(element => element.offsetParent !== null);

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
    return;
  }

  if (event.key !== 'Tab') return;
  const elements = focusableElements();
  if (!elements.length) {
    event.preventDefault();
    dialog.value?.focus();
    return;
  }

  const first = elements[0];
  const last = elements.at(-1)!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};

watch(() => props.open, async (isOpen) => {
  if (!import.meta.client) return;
  if (isOpen) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    bodyLocked = true;
    await nextTick();
    (focusableElements()[0] ?? dialog.value)?.focus();
  } else {
    if (bodyLocked) document.body.style.overflow = previousBodyOverflow;
    bodyLocked = false;
    returnFocus?.focus();
    returnFocus = null;
  }
}, { immediate: true });

onBeforeUnmount(() => {
  if (!import.meta.client) return;
  if (bodyLocked) document.body.style.overflow = previousBodyOverflow;
  returnFocus?.focus();
});
</script>

<style scoped>
.dashboard-dialog__backdrop {
  position: fixed;
  z-index: 5000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(3px);
}

.dashboard-dialog {
  display: flex;
  width: min(720px, 100%);
  max-height: min(78dvh, 760px);
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(98, 206, 71, 0.25);
  border-radius: 7px;
  background: #161616;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
}

.dashboard-dialog:focus { outline: none; }

.dashboard-dialog__header,
.dashboard-dialog__footer {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  padding: 9px 11px;
}

.dashboard-dialog__header {
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

.dashboard-dialog__title {
  color: #f4f4f4;
  font-size: 14px;
  line-height: 1.2;
}

.dashboard-dialog__close {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 5px;
  background: transparent;
  color: #b9b9b9;
  cursor: pointer;
  font: inherit;
  font-size: 18px;
  line-height: 1;
}

.dashboard-dialog__close:hover { border-color: rgba(239, 100, 100, 0.4); color: #ff9a9a; }
.dashboard-dialog__close:focus-visible { outline: 2px solid #62ce47; outline-offset: 2px; }

.dashboard-dialog__body {
  min-height: 0;
  flex: 1 1 auto;
  overflow: auto;
  padding: 10px 11px;
  overscroll-behavior: contain;
}

.dashboard-dialog__footer {
  justify-content: flex-end;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}

.dashboard-dialog-enter-active,
.dashboard-dialog-leave-active { transition: opacity 120ms ease; }
.dashboard-dialog-enter-active .dashboard-dialog,
.dashboard-dialog-leave-active .dashboard-dialog { transition: transform 120ms ease; }
.dashboard-dialog-enter-from,
.dashboard-dialog-leave-to { opacity: 0; }
.dashboard-dialog-enter-from .dashboard-dialog,
.dashboard-dialog-leave-to .dashboard-dialog { transform: translateY(5px) scale(0.99); }

@media (prefers-reduced-motion: reduce) {
  .dashboard-dialog-enter-active,
  .dashboard-dialog-leave-active,
  .dashboard-dialog-enter-active .dashboard-dialog,
  .dashboard-dialog-leave-active .dashboard-dialog { transition: none; }
}
</style>
