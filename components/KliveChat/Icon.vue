<template>
    <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" :stroke-width="stroke"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" class="kc-icon">
        <path v-for="(d, i) in shape" :key="i" :d="d" />
    </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/* Line icons for the call surface (24px grid, 2px stroke). */
const ICONS: Record<string, string[]> = {
    mic: ['M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z', 'M19 10v2a7 7 0 0 1-14 0v-2', 'M12 19v3', 'M8 22h8'],
    'mic-off': ['M2 2l20 20', 'M9 9v3a3 3 0 0 0 5.12 2.12', 'M15 9.34V5a3 3 0 0 0-5.94-.6', 'M17 16.95A7 7 0 0 1 5 12v-2', 'M19 10v2a7 7 0 0 1-.11 1.23', 'M12 19v3', 'M8 22h8'],
    video: ['M23 7l-7 5 7 5V7z', 'M3 5h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z'],
    'video-off': ['M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10', 'M1 1l22 22'],
    screen: ['M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M8 21h8', 'M12 17v4'],
    'screen-off': ['M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M8 21h8', 'M12 17v4', 'M9 7l6 6', 'M15 7l-6 6'],
    'phone-off': ['M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91', 'M23 1L1 23'],
    chat: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
    users: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M23 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
    settings: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'],
    link: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
    copy: ['M11 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z', 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'],
    check: ['M20 6L9 17l-5-5'],
    lock: ['M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z', 'M7 11V7a5 5 0 0 1 10 0v4'],
    unlock: ['M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z', 'M7 11V7a5 5 0 0 1 9.9-1'],
    pin: ['M12 17v5', 'M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z'],
    maximize: ['M8 3H5a2 2 0 0 0-2 2v3', 'M21 8V5a2 2 0 0 0-2-2h-3', 'M16 21h3a2 2 0 0 0 2-2v-3', 'M3 16v3a2 2 0 0 0 2 2h3'],
    pip: ['M21 9V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4', 'M14 13h6a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2z'],
    close: ['M18 6L6 18', 'M6 6l12 12'],
    plus: ['M12 5v14', 'M5 12h14'],
    'chevron-up': ['M18 15l-6-6-6 6'],
    'chevron-down': ['M6 9l6 6 6-6'],
    'arrow-left': ['M19 12H5', 'M12 19l-7-7 7-7'],
    'volume': ['M11 5L6 9H2v6h4l5 4V5z', 'M19.07 4.93a10 10 0 0 1 0 14.14', 'M15.54 8.46a5 5 0 0 1 0 7.07'],
    'volume-off': ['M11 5L6 9H2v6h4l5 4V5z', 'M23 9l-6 6', 'M17 9l6 6'],
    send: ['M22 2L11 13', 'M22 2l-7 20-4-9-9-4 20-7z'],
    keyboard: ['M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z', 'M6 10h.01', 'M10 10h.01', 'M14 10h.01', 'M18 10h.01', 'M8 14h8'],
    trash: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
    'user-x': ['M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M8.5 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M18 8l5 5', 'M23 8l-5 5'],
    ban: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M4.93 4.93l14.14 14.14'],
    more: ['M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z', 'M12 4a1 1 0 1 0 0 2 1 1 0 0 0 0-2z', 'M12 18a1 1 0 1 0 0 2 1 1 0 0 0 0-2z'],
    'switch-camera': ['M23 4v6h-6', 'M1 20v-6h6', 'M3.51 9a9 9 0 0 1 14.85-3.36L23 10', 'M1 14l4.64 4.36A9 9 0 0 0 20.49 15'],
    grid: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'],
    edit: ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z'],
    'log-in': ['M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4', 'M10 17l5-5-5-5', 'M15 12H3'],
    wifi: ['M5 12.55a11 11 0 0 1 14.08 0', 'M1.42 9a16 16 0 0 1 21.16 0', 'M8.53 16.11a6 6 0 0 1 6.95 0', 'M12 20h.01'],
    alert: ['M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01'],
};

const props = withDefaults(defineProps<{ name: string; size?: number; stroke?: number }>(), { size: 20, stroke: 2 });
const shape = computed(() => ICONS[props.name] ?? ICONS.alert);
</script>

<style scoped>
.kc-icon { display: inline-block; flex: 0 0 auto; vertical-align: middle; }
</style>
