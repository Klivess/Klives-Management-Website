<template>
    <svg class="omx-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path v-for="(d, i) in shape" :key="i" :d="d" />
    </svg>
</template>

<script setup lang="ts">
/** The console's own small icon set: line drawings, one weight, drawn here so nothing is fetched. */
const props = defineProps<{ name: string }>();

const SHAPES: Record<string, string[]> = {
    eye: ['M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z', 'M12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6Z'],
    brief: ['M4 5.5h16', 'M4 10.5h10', 'M4 15.5h16', 'M4 20h7'],
    people: ['M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z', 'M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5', 'M16 4.3a3.5 3.5 0 0 1 0 6.4', 'M18.2 14.8c1.7.8 2.9 2.5 3.3 5.2'],
    ask: ['M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z', 'M20.5 20.5 15.4 15.4'],
    review: ['M4 6h10', 'M4 12h7', 'M4 18h5', 'm14 16 3 3 5-6'],
    talk: ['M4 5h16v11H9l-5 4V5Z'],
    engine: ['M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z', 'M12 2.5v3', 'M12 18.5v3', 'M2.5 12h3', 'M18.5 12h3', 'm5.3 5.3 2.1 2.1', 'm16.6 16.6 2.1 2.1', 'm5.3 18.7 2.1-2.1', 'm16.6 7.4 2.1-2.1'],
    search: ['M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z', 'M20.5 20.5 15.4 15.4'],
    bell: ['M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15l1.5-2Z', 'M10 21h4'],
    refresh: ['M20 11a8 8 0 0 0-14.3-4.3L4 8.5', 'M4 4v4.5h4.5', 'M4 13a8 8 0 0 0 14.3 4.3L20 15.5', 'M20 20v-4.5h-4.5'],
    close: ['M6 6l12 12', 'M18 6 6 18'],
    check: ['m5 12.5 4.5 4.5L19 7.5'],
    back: ['M19 12H5', 'm11 6-6 6 6 6'],
    go: ['M5 12h14', 'm13 6 6 6-6 6'],
    plus: ['M12 5v14', 'M5 12h14'],
    trash: ['M4 7h16', 'M9 7V4.5h6V7', 'M6.5 7l1 13h9l1-13'],
    download: ['M12 4v11', 'm7 11 5 5 5-5', 'M5 20h14'],
    merge: ['M6 4v5a6 6 0 0 0 6 6h6', 'M6 20v-5', 'm15 12 3 3-3 3'],
    compare: ['M8 4v16', 'M16 4v16', 'M3 8h5', 'M16 16h5'],
    clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 7v5l3 2'],
    play: ['M7 4.5v15l12-7.5-12-7.5Z'],
    send: ['M4 12 20 4l-5 16-3.5-6.5L4 12Z'],
    person: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M4.5 20.5c.8-3.7 3.7-6 7.5-6s6.700 2.3 7.5 6'],
    place: ['M12 21s6.500-6 6.500-11a6.500 6.500 0 1 0-13 0c0 5 6.500 11 6.500 11Z', 'M12 12.200a2.200 2.200 0 1 0 0-4.400 2.200 2.200 0 0 0 0 4.400Z'],
    org: ['M4 20V6l8-3 8 3v14', 'M9 20v-5h6v5', 'M9 9h.01', 'M15 9h.01'],
    dot: ['M12 13.500a1.500 1.500 0 1 0 0-3 1.500 1.500 0 0 0 0 3Z'],
    spark: ['M12 3v5', 'M12 16v5', 'M3 12h5', 'M16 12h5', 'm6 6 3 3', 'm15 15 3 3', 'm6 18 3-3', 'm15 9 3-3'],
    note: ['M5 4h10l4 4v12H5V4Z', 'M8.500 10h7', 'M8.500 14h7'],
    link: ['M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1', 'M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1'],
    filter: ['M4 5h16l-6 7.500V19l-4-2v-4.500L4 5Z'],
    copy: ['M8 8h11v12H8V8Z', 'M5 16V4h11'],
};

const shape = computed(() => SHAPES[props.name] ?? SHAPES.dot!);
</script>
