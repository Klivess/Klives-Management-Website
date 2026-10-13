<template>
    <svg :width="size" :height="size" viewBox="0 0 24 24" :fill="solid ? 'currentColor' : 'none'" stroke="currentColor"
         :stroke-width="stroke" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" class="kc-icon">
        <path v-for="(d, i) in shape" :key="i" :d="d" :fill="tint && i === 0 ? 'currentColor' : undefined" :fill-opacity="tint && i === 0 ? tint : undefined" />
    </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/* Line icons for KliveCloud (24px grid, round 2px strokes). */
const FOLDER = 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z';
const PAGE = 'M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z';
const LENS = 'M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z';
const TRAY = 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4';

const ICONS: Record<string, string[]> = {
    cloud: ['M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z'],
    download: [TRAY, 'M7 10l5 5 5-5', 'M12 15V3'],
    upload: [TRAY, 'M17 8l-5-5-5 5', 'M12 3v12'],
    folder: [FOLDER],
    'folder-plus': [FOLDER, 'M12 10v6', 'M9 13h6'],
    'folder-move': ['M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1', 'M2 13h10', 'M9 16l3-3-3-3'],
    file: [PAGE, 'M14 2v6h6'],
    'file-text': [PAGE, 'M14 2v6h6', 'M16 13H8', 'M16 17H8', 'M10 9H8'],
    image: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M9 7.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z', 'M21 15l-5-5L5 21'],
    video: ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M10 9l5 3-5 3V9z'],
    music: ['M9 18V5l12-2v13', 'M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', 'M18 13a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
    archive: ['M3 4h18v4H3z', 'M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8', 'M10 12h4'],
    code: ['M16 18l6-6-6-6', 'M8 6l-6 6 6 6'],
    sheet: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M3 9h18', 'M3 15h18', 'M9 3v18'],
    slides: ['M2 3h20', 'M4 3v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3', 'M12 16v5', 'M8 21h8'],
    app: ['M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z', 'M3.3 7L12 12l8.7-5', 'M12 22V12'],
    font: ['M4 7V4h16v3', 'M9 20h6', 'M12 4v16'],
    search: [LENS, 'M21 21l-4.3-4.3'],
    'zoom-in': [LENS, 'M21 21l-4.3-4.3', 'M11 8v6', 'M8 11h6'],
    'zoom-out': [LENS, 'M21 21l-4.3-4.3', 'M8 11h6'],
    grid: ['M4 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z', 'M15 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z', 'M15 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z', 'M4 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z'],
    list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
    link: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
    check: ['M20 6L9 17l-5-5'],
    close: ['M18 6L6 18', 'M6 6l12 12'],
    plus: ['M12 5v14', 'M5 12h14'],
    'chevron-left': ['M15 18l-6-6 6-6'],
    'chevron-right': ['M9 18l6-6-6-6'],
    'chevron-down': ['M6 9l6 6 6-6'],
    'chevron-up': ['M18 15l-6-6-6 6'],
    'arrow-up': ['M12 19V5', 'M5 12l7-7 7 7'],
    'arrow-down': ['M12 5v14', 'M19 12l-7 7-7-7'],
    more: ['M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z', 'M19 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z', 'M5 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z'],
    trash: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', 'M10 11v6', 'M14 11v6'],
    play: ['M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z'],
    external: ['M15 3h6v6', 'M10 14L21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'],
    refresh: ['M21 12a9 9 0 1 1-2.64-6.36L21 8', 'M21 3v5h-5'],
    alert: ['M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01'],
    clock: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M12 6v6l4 2'],
    eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
    lock: ['M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z', 'M7 11V7a5 5 0 0 1 10 0v4'],
};

const SOLID = new Set(['play']);

const props = withDefaults(defineProps<{
    name: string;
    size?: number;
    stroke?: number;
    /** Fills the first path at this opacity (a folder's body, say). */
    tint?: number;
}>(), { size: 18, stroke: 2, tint: 0 });

const shape = computed(() => ICONS[props.name] ?? ICONS.file);
const solid = computed(() => SOLID.has(props.name));
</script>

<style scoped>
.kc-icon { display: inline-block; flex: 0 0 auto; vertical-align: middle; }
</style>
