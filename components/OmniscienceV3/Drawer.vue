<template>
    <!-- Inspecting one thing should not cost the list it came from: a drawer keeps the scroll position, filters and selection. -->
    <Teleport to="body">
        <div v-if="open" class="omni-layer omni-drawer-layer">
            <!-- A modeless drawer (a quick look) leaves the page behind it readable and clickable. -->
            <div v-if="!modeless" class="omni-scrim" @click="$emit('close')"></div>
            <aside ref="panel" class="omni-drawer" :class="{ wide, modeless }" role="dialog" :aria-modal="!modeless" :aria-label="title">
                <header>
                    <div class="titles">
                        <h3><slot name="title">{{ title }}</slot></h3>
                        <div v-if="subtitle || $slots.subtitle" class="sub"><slot name="subtitle">{{ subtitle }}</slot></div>
                    </div>
                    <button class="omni-btn ghost sm" type="button" aria-label="Close panel" @click="$emit('close')">Close ✕</button>
                </header>
                <div class="body"><slot /></div>
                <footer v-if="$slots.footer"><slot name="footer" /></footer>
            </aside>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{ open: boolean; title?: string; subtitle?: string; wide?: boolean; modeless?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const panel = ref<HTMLElement | null>(null);

function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && props.open) emit('close');
}

watch(() => props.open, async open => {
    // A quick look does not take the keyboard away from the list it was opened from.
    if (!open || props.modeless) return;
    await nextTick();
    panel.value?.querySelector<HTMLElement>('button, [href], input, select, textarea')?.focus();
});

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>
