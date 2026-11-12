<template>
  <svg class="llx-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path v-for="(d, i) in paths" :key="i" :d="d" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/** Stroke icons drawn on a 24-unit grid; one path list per name. */
const ICONS: Record<string, string[]> = {
  brain: ['M9 4a3 3 0 0 0-3 3v.2A3 3 0 0 0 4 10a3 3 0 0 0 1 2.2A3.5 3.5 0 0 0 8 18h1V4z', 'M15 4a3 3 0 0 1 3 3v.2a3 3 0 0 1 2 2.8 3 3 0 0 1-1 2.2A3.5 3.5 0 0 1 16 18h-1V4z', 'M9 18v2m6-2v2'],
  radar: ['M12 12 19 5', 'M20.4 9A9 9 0 1 1 15 3.6', 'M16.2 10.5A4.5 4.5 0 1 1 13.5 7.8', 'M12 12h.01'],
  grid: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z'],
  route: ['M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M6 15V9a3 3 0 0 1 3-3h7', 'M18 9v6a3 3 0 0 1-3 3H8'],
  server: ['M4 4h16v6H4z', 'M4 14h16v6H4z', 'M8 7h.01M8 17h.01'],
  chart: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'],
  coins: ['M9 14c3.3 0 6-1.3 6-3s-2.7-3-6-3-6 1.3-6 3 2.7 3 6 3z', 'M3 11v4c0 1.7 2.7 3 6 3s6-1.3 6-3v-4', 'M15 9.5c3 .3 6 1.5 6 3.5s-2.7 3-6 3'],
  list: ['M8 6h13M8 12h13M8 18h13', 'M3 6h.01M3 12h.01M3 18h.01'],
  spark: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', 'M19 17l.7 1.8L21.5 19.5l-1.8.7L19 22l-.7-1.8-1.8-.7 1.8-.7z'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M20 20l-4-4'],
  refresh: ['M20 11a8 8 0 0 0-14.9-3.9L4 8', 'M4 4v4h4', 'M4 13a8 8 0 0 0 14.9 3.9L20 16', 'M20 20v-4h-4'],
  pause: ['M8 5v14M16 5v14'],
  play: ['M7 4l13 8-13 8z'],
  x: ['M6 6l12 12M18 6 6 18'],
  check: ['M5 12.5l4.5 4.5L19 7'],
  'check-circle': ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M8 12.5l2.7 2.7L16 9.5'],
  alert: ['M12 4 2.5 20h19z', 'M12 10v4', 'M12 17h.01'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 11v5', 'M12 8h.01'],
  'octagon-x': ['M8 3h8l5 5v8l-5 5H8l-5-5V8z', 'M9.5 9.5l5 5m0-5-5 5'],
  'chevron-down': ['M6 9l6 6 6-6'],
  'chevron-up': ['M6 15l6-6 6 6'],
  'chevron-right': ['M9 6l6 6-6 6'],
  'chevron-left': ['M15 6l-6 6 6 6'],
  plus: ['M12 5v14M5 12h14'],
  minus: ['M5 12h14'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
  key: ['M15 9a4 4 0 1 0-3.9 4.9L9 16l-2 .5L6.5 18.5 4 21H3v-2l6.1-6.1A4 4 0 0 0 15 9z', 'M15 9h.01'],
  flask: ['M9 3h6', 'M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3', 'M7 15h10'],
  edit: ['M4 20h4L19 9l-4-4L4 16z', 'M13.5 6.5l4 4'],
  lock: ['M6 11h12v9H6z', 'M8 11V8a4 4 0 0 1 8 0v3'],
  'zoom-in': ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M20 20l-4-4', 'M8 11h6M11 8v6'],
  'zoom-out': ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M20 20l-4-4', 'M8 11h6'],
  'arrow-left': ['M19 12H5', 'M11 6l-6 6 6 6'],
  'arrow-right': ['M5 12h14', 'M13 6l6 6-6 6'],
  undo: ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
  download: ['M12 4v12', 'M7 11l5 5 5-5', 'M5 20h14'],
  eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2'],
  bolt: ['M13 2 4 14h7l-1 8 9-12h-7z'],
  shield: ['M12 3l8 3v6c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V6z'],
  layers: ['M12 3l9 5-9 5-9-5z', 'M3 13l9 5 9-5'],
  filter: ['M3 5h18l-7 8v6l-4 2v-8z'],
  copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
  pin: ['M9 4h6l-1 6 3 3H7l3-3z', 'M12 13v8'],
  activity: ['M3 12h4l3-8 4 16 3-8h4'],
  flame: ['M12 22c4 0 7-2.7 7-6.5 0-4-3.5-6-4.5-10.5C12 7 10 9 10 12c-1.5-1-2.2-2.5-2.2-4.5C5.5 9.5 5 12.6 5 15.5 5 19.3 8 22 12 22z'],
  text: ['M4 6h16M4 12h10M4 18h7'],
  gauge: ['M4.9 17a8 8 0 1 1 14.2 0', 'M12 13l3.5-4.5', 'M12 13h.01'],
  power: ['M12 3v9', 'M6.3 6.3a8 8 0 1 0 11.4 0'],
  more: ['M5 12h.01M12 12h.01M19 12h.01'],
  calendar: ['M4 6h16v15H4z', 'M4 10h16', 'M8 3v4M16 3v4'],
  globe: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M3 12h18', 'M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z'],
};

const props = defineProps<{ name: string }>();
const paths = computed(() => ICONS[props.name] ?? ICONS.info);
</script>
