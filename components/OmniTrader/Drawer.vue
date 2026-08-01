<template>
    <!--
      Inspecting a record should not cost you the table you were reading. A drawer
      keeps scroll position, filters and selection intact; a full page is for detail
      with its own navigation or a URL worth sharing.
    -->
    <Teleport to="body">
        <Transition name="fade">
            <div v-if="open" class="ot-scrim" @click="$emit('close')"></div>
        </Transition>
        <Transition name="drawer">
            <aside v-if="open" class="ot-drawer" role="dialog" aria-modal="true" :aria-label="title" ref="panel">
                <header>
                    <div>
                        <h3><slot name="title">{{ title }}</slot></h3>
                        <div v-if="subtitle || $slots.subtitle" class="sub">
                            <slot name="subtitle">{{ subtitle }}</slot>
                        </div>
                    </div>
                    <button class="ot-btn ghost sm" @click="$emit('close')" aria-label="Close panel">Close ✕</button>
                </header>
                <div class="body"><slot /></div>
                <footer v-if="$slots.footer"><slot name="footer" /></footer>
            </aside>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{ open: boolean; title?: string; subtitle?: string }>();
const emit = defineEmits<{ close: [] }>();

const panel = ref<HTMLElement | null>(null);

function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && props.open) emit('close');
}

// Move focus into the panel so keyboard users are not left behind on the table.
watch(() => props.open, async open => {
    if (!open) return;
    await nextTick();
    panel.value?.querySelector<HTMLElement>('button, [href], input, select, textarea')?.focus();
});

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>
