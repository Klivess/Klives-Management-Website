<template>
    <span ref="root" class="omni-pop" :class="{ block }">
        <slot name="trigger" :open="open" :toggle="toggle" />
        <div v-if="open" ref="panel" class="omni-pop-panel" :class="{ end: alignEnd, up: openUp }" :style="{ '--omni-pop-width': width }" role="dialog" :aria-label="label"
             @keydown.esc.stop.prevent="close(true)">
            <slot :close="() => close(true)" />
        </div>
    </span>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';

/**
 * A small panel that drops from whatever opened it (a filter's dropdown, a menu). It closes when something else
 * is clicked or Escape is pressed, hands the keyboard back to what opened it, and opens towards the side of the
 * frame that has room. On a narrow frame it becomes a sheet along the bottom of the window.
 */
const props = withDefaults(defineProps<{
    open: boolean;
    label: string;
    /** The panel's width (it never grows past the window). */
    width?: string;
    /** Fills its line, for a picker used as a form field. */
    block?: boolean;
}>(), { width: '340px', block: false });
const emit = defineEmits<{ 'update:open': [open: boolean] }>();

const root = ref<HTMLElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const alignEnd = ref(false);
const openUp = ref(false);

function toggle() { emit('update:open', !props.open); }

function close(refocus: boolean) {
    if (!props.open) return;
    emit('update:open', false);
    // The keyboard goes back to the control that opened the panel, so tabbing carries on from there.
    if (refocus) void nextTick(() => root.value?.querySelector<HTMLElement>('button, [tabindex]')?.focus());
}

function onPointerDown(event: Event) {
    if (root.value && !root.value.contains(event.target as Node)) close(false);
}
/** Tabbing out of the panel puts it away, the same as clicking elsewhere. */
function onFocusIn(event: FocusEvent) {
    if (root.value && !root.value.contains(event.target as Node)) close(false);
}

function place() {
    const box = panel.value, anchor = root.value;
    if (!box || !anchor) return;
    const frame = (anchor.closest('.omni-v3, .omni-drawer') as HTMLElement | null)?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    const at = anchor.getBoundingClientRect();
    const size = box.getBoundingClientRect();
    // Towards the start by default; from the end when that would run past the frame and the end has the room.
    alignEnd.value = at.left + size.width > Math.min(frame.right, window.innerWidth) - 8 && at.right - size.width >= Math.max(frame.left, 0);
    openUp.value = at.bottom + size.height > window.innerHeight - 8 && at.top - size.height > 60;
}

watch(() => props.open, async open => {
    if (typeof document === 'undefined') return;
    if (open) {
        alignEnd.value = false;
        openUp.value = false;
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('focusin', onFocusIn);
        await nextTick();
        place();
    } else {
        document.removeEventListener('pointerdown', onPointerDown, true);
        document.removeEventListener('focusin', onFocusIn);
    }
}, { immediate: true });

onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('focusin', onFocusIn);
});

defineExpose({ place });
</script>
