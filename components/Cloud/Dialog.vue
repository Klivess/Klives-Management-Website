<template>
    <Teleport to="body">
        <div v-if="open" class="kcl-layer">
            <div class="kcl-scrim" @mousedown.self="close">
                <div ref="box" class="kcl-dialog" :class="{ 'kcl-dialog--wide': wide }" role="dialog" aria-modal="true" :aria-label="title"
                     :data-tone="tone" :data-testid="testid" @keydown="onKey">
                    <header class="kcl-dialog__head">
                        <span v-if="icon" class="kcl-dialog__mark"><KliveCloudIcon :name="icon" :size="17" /></span>
                        <div class="kcl-dialog__titles">
                            <div class="kcl-dialog__title">{{ title }}</div>
                            <div v-if="sub" class="kcl-dialog__sub">{{ sub }}</div>
                        </div>
                        <button class="kcl-iconbtn" aria-label="Close" @click="close"><KliveCloudIcon name="close" :size="15" /></button>
                    </header>
                    <div class="kcl-dialog__body"><slot /></div>
                    <footer v-if="$slots.actions" class="kcl-dialog__actions"><slot name="actions" /></footer>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

/* A dialog teleported to <body>. Focus goes to [data-autofocus], else the first field, else the
   first button that isn't destructive (Enter must never delete by accident). Esc closes; Tab stays
   inside. */
const props = withDefaults(defineProps<{
    open: boolean;
    title: string;
    sub?: string;
    icon?: string;
    tone?: 'info' | 'warn' | 'crit' | 'link' | 'people' | 'ok';
    wide?: boolean;
    testid?: string;
}>(), { sub: '', icon: '', tone: 'info', wide: false, testid: undefined });

const emit = defineEmits<{ close: [] }>();
const box = ref<HTMLElement | null>(null);
let returnTo: HTMLElement | null = null;

function close() {
    emit('close');
}

function focusables() {
    return [...(box.value?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])]
        .filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);
}

function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
    }
    if (event.key !== 'Tab') return;
    const list = focusables();
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

watch(() => props.open, async open => {
    if (!open) {
        returnTo?.focus?.();
        returnTo = null;
        return;
    }
    returnTo = document.activeElement as HTMLElement | null;
    await nextTick();
    const root = box.value;
    if (!root) return;
    const target = root.querySelector<HTMLElement>('[data-autofocus]')
        ?? root.querySelector<HTMLElement>('.kcl-dialog__body input, .kcl-dialog__body textarea, .kcl-dialog__body select')
        ?? [...root.querySelectorAll<HTMLElement>('.kcl-dialog__actions button')].find(b => !/danger/.test(b.className))
        ?? root.querySelector<HTMLElement>('button');
    target?.focus();
    if (target instanceof HTMLInputElement && target.dataset.select !== undefined) {
        const stop = target.dataset.select ? Number(target.dataset.select) : target.value.length;
        target.setSelectionRange(0, stop);
    }
}, { immediate: true });
</script>
