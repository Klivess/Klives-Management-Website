<template>
    <svg :width="size" :height="size" viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="ax-icon">
        <path v-for="(d, i) in paths" :key="i" :d="d" fill="currentColor" />
    </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/* A handful of 24px glyphs for the access UI and the profile console (filled, single colour). */
const ICONS: Record<string, string[]> = {
    lock: ['M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Zm3 4a2 2 0 0 1 1 3.73V19h-2v-1.27A2 2 0 0 1 12 14Z'],
    pause: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-2 6h1.5v8H10V8Zm2.5 0H14v8h-1.5V8Z'],
    eye: ['M12 5C6.5 5 2.7 9.2 1.5 12c1.2 2.8 5 7 10.5 7s9.3-4.2 10.5-7C21.3 9.2 17.5 5 12 5Zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z'],
    shield: ['M12 2 4 5v6c0 5 3.4 9.6 8 11 4.6-1.4 8-6 8-11V5l-8-3Zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 4.6-4.6 1.4 1.4-6 6Z'],
    clock: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 10.6 3.5 2-1 1.7L11 13.5V7h2v5.6Z'],
    close: ['M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6 6.4 5Z'],
    back: ['M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20v-2Z'],
    user: ['M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5Z'],
    users: ['M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7.5 0a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM9 13c-4 0-7 2-7 4.5V20h14v-2.5C16 15 13 13 9 13Zm7.5 0c-.6 0-1.2.1-1.8.2 1.4 1 2.3 2.4 2.3 4.3V20h5v-2.5c0-2.5-2.5-4.5-5.5-4.5Z'],
    key: ['M14 2a8 8 0 0 0-7.6 10.4L2 16.8V22h5.2v-2.4h2.4v-2.4H12l1.6-1.6A8 8 0 1 0 14 2Zm2.5 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z'],
    bolt: ['M13 2 4 14h6l-1 8 9-12h-6l1-8Z'],
    plus: ['M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7V4Z'],
    copy: ['M8 3h11a2 2 0 0 1 2 2v11h-2V5H8V3Zm-3 4h10a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm0 2v11h10V9H5Z'],
    check: ['M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7 9.5 16.2Z'],
    warning: ['M12 2 1 21h22L12 2Zm1 15h-2v-2h2v2Zm0-4h-2V9h2v4Z'],
    power: ['M11 2h2v10h-2V2Zm6.4 3.2-1.4 1.4A7 7 0 1 1 8 6.6L6.6 5.2A9 9 0 1 0 17.4 5.2Z'],
    device: ['M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6v2h3v2H7v-2h3v-2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v9h16V6H4Z'],
    pulse: ['M3 12h4l2.5-6 4 12 2.5-6H21v2h-3.7L14 22 10 9.8 8.3 14H3v-2Z'],
    search: ['M10 3a7 7 0 1 0 4.2 12.6l5.1 5.1 1.4-1.4-5.1-5.1A7 7 0 0 0 10 3Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z'],
    more: ['M5 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z'],
    chevron: ['M9.4 6 8 7.4l4.6 4.6L8 16.6 9.4 18l6-6-6-6Z'],
    route: ['M6 3a3 3 0 0 0-1 5.8V21h2V8.8A3 3 0 0 0 6 3Zm12 0a3 3 0 0 0-1 5.8V12a2 2 0 0 1-2 2h-4v2h4a4 4 0 0 0 4-4V8.8A3 3 0 0 0 18 3Z'],
    trash: ['M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Z'],
    signout: ['M10 3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6v-2H4V5h6V3Zm6.6 4.4L15.2 8.8 17.4 11H8v2h9.4l-2.2 2.2 1.4 1.4L21.2 12l-4.6-4.6Z'],
};

const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 18 });
const paths = computed(() => ICONS[props.name] ?? ICONS.lock);
</script>

<style scoped>
.ax-icon { display: inline-block; flex: 0 0 auto; vertical-align: middle; }
</style>
