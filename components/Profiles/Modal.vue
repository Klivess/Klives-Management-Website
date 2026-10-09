<template>
    <!-- For decisions that must block (suspend, reset a password, delete). Teleported, so it
         carries its own scope reset (.km-ax). -->
    <Teleport to="body">
        <Transition name="pc-modal">
            <div v-if="open" class="ot-modal-backdrop km-ax pc-modal-backdrop" @mousedown.self="dismissable && $emit('close')">
                <div ref="panel" class="ot-modal pc-modal" :class="[tone, { wide }]" role="dialog" aria-modal="true" :aria-labelledby="titleId">
                    <header>
                        <h3 :id="titleId">
                            <span v-if="tone === 'danger'" class="pc-modal-glyph danger"><AccessIcon name="warning" :size="16" /></span>
                            <span v-else-if="tone === 'warn'" class="pc-modal-glyph warn"><AccessIcon name="warning" :size="16" /></span>
                            {{ title }}
                        </h3>
                        <button v-if="dismissable" type="button" class="ot-btn ghost sm" aria-label="Close" @click="$emit('close')">
                            <AccessIcon name="close" :size="14" />
                        </button>
                    </header>
                    <div class="body"><slot /></div>
                    <footer v-if="$slots.footer"><slot name="footer" /></footer>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';

const props = withDefaults(defineProps<{
    open: boolean;
    title: string;
    tone?: '' | 'warn' | 'danger';
    wide?: boolean;
    dismissable?: boolean;
}>(), { tone: '', wide: false, dismissable: true });

const emit = defineEmits<{ close: [] }>();
const titleId = `pc-modal-${useId()}`;
const panel = ref<HTMLElement | null>(null);

function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && props.open && props.dismissable) emit('close');
}

watch(() => props.open, async open => {
    if (!open) return;
    await nextTick();
    panel.value?.querySelector<HTMLElement>('[autofocus], input, select, textarea, button.primary, button')?.focus();
});

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<style scoped>
.pc-modal-backdrop { z-index: 3500; }
.pc-modal { width: min(480px, calc(100vw - 32px)); max-height: calc(100vh - 48px); display: flex; flex-direction: column; }
.pc-modal.wide { width: min(720px, calc(100vw - 32px)); }
.pc-modal.danger { border-color: rgba(255, 123, 123, 0.45); }
.pc-modal.warn { border-color: rgba(240, 180, 41, 0.45); }
.pc-modal > .body { flex: 1 1 auto; }
.pc-modal-glyph { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 8px; }
.pc-modal-glyph.danger { color: var(--ot-negative); background: var(--ot-negative-soft); }
.pc-modal-glyph.warn { color: var(--ot-warning); background: var(--ot-warning-soft); }

.pc-modal-enter-active, .pc-modal-leave-active { transition: opacity 160ms ease; }
.pc-modal-enter-active .pc-modal, .pc-modal-leave-active .pc-modal { transition: transform 160ms ease; }
.pc-modal-enter-from, .pc-modal-leave-to { opacity: 0; }
.pc-modal-enter-from .pc-modal, .pc-modal-leave-to .pc-modal { transform: translateY(8px) scale(0.98); }
</style>
