<template>
  <svg class="adm-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path :d="path" /></svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/* The console's own icon set: one stroked path each on a 24px grid, so they share a weight. */
const ICONS = {
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14z M21 21l-4.8-4.8',
  refresh: 'M20 11a8 8 0 0 0-14.9-3 M4 4v4h4 M4 13a8 8 0 0 0 14.9 3 M20 20v-4h-4',
  restart: 'M21 12a9 9 0 1 1-3-6.7 M21 4v5h-5',
  stop: 'M7.5 6h9a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 16.500v-9A1.5 1.5 0 0 1 7.5 6z',
  logs: 'M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01',
  settings: 'M4 6h9 M17 6h3 M13 4v4 M4 12h3 M11 12h9 M7 10v4 M4 18h11 M19 18h1 M15 16v4',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  monitor: 'M4 5h16v11H4z M9 20h6 M12 16v4',
  users: 'M9 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7z M2.5 20a6.5 6.5 0 0 1 13 0 M16 4.300a3.5 3.5 0 0 1 0 6.400 M18 14.500a6.5 6.5 0 0 1 3.5 5.500',
  shield: 'M12 3l8 3v6c0 4.500-3.200 8-8 9c-4.800-1-8-4.500-8-9V6z',
  calendar: 'M5 6h14v14H5z M5 10h14 M9 3v4 M15 3v4',
  clock: 'M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16z M12 8v4l3 2',
  link: 'M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1 M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1',
  terminal: 'M5 7l5 5-5 5 M12 18h7',
  'chevron-up': 'M6 15l6-6 6 6',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-right': 'M9 6l6 6-6 6',
  x: 'M6 6l12 12 M18 6L6 18',
  check: 'M5 12.500l4.500 4.500L19 7.500',
  'check-circle': 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M8 12.300l2.700 2.700L16 9.500',
  alert: 'M12 4L2.800 19.500h18.400z M12 10v4.500 M12 17.200h.01',
  'octagon-x': 'M8.200 3h7.600L21 8.200v7.600L15.800 21H8.200L3 15.800V8.200z M9.500 9.500l5 5 M14.500 9.500l-5 5',
  info: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M12 11v5.500 M12 7.800h.01',
  cpu: 'M7 7h10v10H7z M10 10h4v4h-4z M9 3v4 M15 3v4 M9 17v4 M15 17v4 M3 9h4 M3 15h4 M17 9h4 M17 15h4',
  memory: 'M4 8h16v8H4z M8 8v8 M12 8v8 M16 8v8 M6 16v3 M10 16v3 M14 16v3 M18 16v3',
  server: 'M4 5h16v6H4z M4 13h16v6H4z M7.500 8h.01 M7.500 16h.01',
  globe: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M3 12h18 M12 3c2.500 2.600 3.800 5.600 3.800 9s-1.300 6.400-3.800 9c-2.500-2.600-3.800-5.600-3.800-9s1.300-6.400 3.800-9z',
  drive: 'M4 14h16v5H4z M4 14l2.500-9h11L20 14 M7.500 16.500h.01 M11 16.500h.01',
  'arrow-up': 'M12 19V5 M6 11l6-6 6 6',
  'arrow-down': 'M12 5v14 M6 13l6 6 6-6',
  'arrow-right': 'M5 12h14 M13 6l6 6-6 6',
  plus: 'M12 5v14 M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16z M13.500 6.500l4 4',
  trash: 'M5 7h14 M10 4h4 M7 7l1 13h8l1-13 M10 11v6 M14 11v6',
  mute: 'M6.500 6.500A6 6 0 0 0 6 9c0 4-2 6.500-2 6.500h11.500 M9 4a6 6 0 0 1 9 5c0 2.300.400 3.900.900 5 M10 19a2 2 0 0 0 4 0 M3 3l18 18',
  bell: 'M6 9a6 6 0 0 1 12 0c0 5 2 6.500 2 6.500H4S6 14 6 9 M10 19a2 2 0 0 0 4 0',
  deploy: 'M12 15V4 M7 9l5-5 5 5 M5 20h14',
  commit: 'M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8z M3 12h5 M16 12h5',
  pause: 'M9 5v14 M15 5v14',
  play: 'M7 5l12 7-12 7z',
  external: 'M14 5h5v5 M19 5l-8 8 M17 13v6H5V7h6',
  layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5',
  window: 'M4 5h16v14H4z M4 9h16 M7 7h.01',
  zap: 'M13 3L5 13h6l-1 8 8-10h-6z',
  home: 'M4 11l8-7 8 7 M6 10v10h12V10',
  dot: 'M12 11.990v.020',
} as const;

const props = defineProps<{ name: keyof typeof ICONS | string }>();
const path = computed(() => (ICONS as Record<string, string>)[props.name] ?? ICONS.dot);
</script>
