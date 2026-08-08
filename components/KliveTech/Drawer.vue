<template>
    <!--
      Teleported to <body>, which puts it outside .kt-os — klivetech-os.scss lists
      .kt-drawer and .kt-scrim in its reset for exactly this reason, or the site's
      global button chrome reappears in here.
    -->
    <Teleport to="body">
        <div v-if="open" class="kt-scrim" @click="$emit('close')"></div>
        <aside v-if="open" ref="panel" class="kt-drawer" role="dialog" aria-modal="true"
               :aria-label="title" tabindex="-1" @keydown.esc.stop="$emit('close')">
            <header>
                <div style="min-width:0">
                    <slot name="title"><h2>{{ title }}</h2></slot>
                    <p v-if="subtitle" class="sub">{{ subtitle }}</p>
                </div>
                <button class="kt-btn ghost sm" aria-label="Close" @click="$emit('close')">✕</button>
            </header>
            <div class="dbody"><slot /></div>
            <footer v-if="$slots.footer"><slot name="footer" /></footer>
        </aside>
    </Teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

const props = defineProps<{
    open: boolean;
    title?: string;
    subtitle?: string;
}>();

defineEmits<{ close: [] }>();

const panel = ref<HTMLElement | null>(null);

// Moving focus into the drawer is what makes Esc work and what stops a keyboard user
// being stranded behind it on the page they just left.
watch(() => props.open, async (isOpen) => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = isOpen ? 'hidden' : '';
    if (isOpen) {
        await nextTick();
        panel.value?.focus();
    }
});
</script>
