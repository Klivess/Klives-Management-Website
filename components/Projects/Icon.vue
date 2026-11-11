<template>
  <svg class="pjx-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path :d="path" /></svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/* The Projects console's own icon set: one stroked path each on a 24px grid, so they share a weight. */
const ICONS = {
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14z M21 21l-4.8-4.8',
  refresh: 'M20 11a8 8 0 0 0-14.9-3 M4 4v4h4 M4 13a8 8 0 0 0 14.9 3 M20 20v-4h-4',
  play: 'M8 5.5v13l10-6.5z',
  pause: 'M8 5v14 M16 5v14',
  stop: 'M7.5 6h9A1.5 1.5 0 0 1 18 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 16.5v-9A1.5 1.5 0 0 1 7.5 6z',
  plus: 'M12 5v14 M5 12h14',
  x: 'M6 6l12 12 M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  'check-circle': 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M8 12.5l2.7 2.7L16.5 9.5',
  alert: 'M12 4l9 16H3z M12 10v4 M12 17.5h.01',
  'octagon-x': 'M8 3h8l5 5v8l-5 5H8l-5-5V8z M9.5 9.5l5 5 M14.5 9.5l-5 5',
  info: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M12 11v5 M12 7.5h.01',
  bot: 'M7 9h10a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3z M12 5v4 M12 4.5h.01 M9 14h.01 M15 14h.01',
  rocket: 'M12 15l-3-3c1-4 4-8 9-9c-1 5-5 8-9 9 M9 12l-3 1-2 4 4-1 M12 15l-1 3 4-2 1-3 M15 8.5h.01',
  inbox: 'M4 13l2.5-7h11L20 13 M4 13v5h16v-5 M4 13h4l1.5 2h5L16 13h4',
  message: 'M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-7l-4.5 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  timeline: 'M4 6h7 M4 12h12 M4 18h9 M15 6h5 M19 12h1 M16 18h4',
  plan: 'M9 6h11 M9 12h11 M9 18h11 M4.5 6l1 1 1.8-2 M4.5 12l1 1 1.8-2 M4.5 18h2',
  users: 'M9 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7z M2.5 20a6.5 6.5 0 0 1 13 0 M16 4.3a3.5 3.5 0 0 1 0 6.4 M18 14.5a6.5 6.5 0 0 1 3.5 5.5',
  monitor: 'M4 5h16v11H4z M9 20h6 M12 16v4',
  folder: 'M3.5 6.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z',
  gauge: 'M4.5 17a8 8 0 1 1 15 0 M12 13l3.5-4 M12 13h.01',
  chart: 'M4 20V10 M10 20V4 M16 20v-7 M21 20H3',
  settings: 'M4 6h9 M17 6h3 M13 4v4 M4 12h3 M11 12h9 M7 10v4 M4 18h11 M19 18h1 M15 16v4',
  book: 'M5 4.5h9a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z M17 20a2 2 0 0 0 2-2V6 M8.5 9h5 M8.5 12.5h5',
  key: 'M8 14a4 4 0 1 1 3.5-6l9 0 M17 8v3 M20 8v3',
  coins: 'M9 10c3.3 0 6-1.1 6-2.5S12.3 5 9 5 3 6.1 3 7.5 5.7 10 9 10z M3 7.5v4C3 12.9 5.7 14 9 14s6-1.1 6-2.5 M3 11.5v4C3 16.9 5.7 18 9 18c1.1 0 2.2-.1 3-.4 M15 11.5c3.3 0 6 1.1 6 2.5s-2.7 2.5-6 2.5-6-1.1-6-2.5 M21 14v3.5c0 1.4-2.7 2.5-6 2.5',
  broadcast: 'M12 12h.01 M8.5 8.5a5 5 0 0 0 0 7 M15.5 8.5a5 5 0 0 1 0 7 M5.6 5.6a9 9 0 0 0 0 12.8 M18.4 5.6a9 9 0 0 1 0 12.8',
  target: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M12 7a5 5 0 1 0 0 10a5 5 0 0 0 0-10z M12 11a1 1 0 1 0 0 2a1 1 0 0 0 0-2z',
  clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M12 7v5l3.5 2',
  hourglass: 'M7 3h10 M7 21h10 M8 3c0 5 8 5 8 9s-8 4-8 9 M16 3c0 5-8 5-8 9',
  zap: 'M13 3L5 14h6l-1 7 8-11h-6z',
  archive: 'M4 5h16v4H4z M5.5 9v10h13V9 M10 13h4',
  unarchive: 'M4 5h16v4H4z M5.5 9v10h13V9 M12 18v-6 M9.5 14.5L12 12l2.5 2.5',
  edit: 'M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4',
  trash: 'M5 7h14 M10 7V4.5h4V7 M7 7l1 13h8l1-13',
  copy: 'M9 9h10v10H9z M5 15V5h10',
  eye: 'M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z M12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5z',
  'eye-off': 'M4 4l16 16 M10.6 6.1A10 10 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.8 3.4 M6.4 7.5C4 9.3 2.5 12 2.5 12s3.5 6 9.5 6c1.5 0 2.9-.4 4.1-1 M9.9 10a2.5 2.5 0 0 0 3.6 3.5',
  lock: 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  mail: 'M4 6h16v12H4z M4.5 6.5L12 12l7.5-5.5',
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v5H5V6h5',
  download: 'M12 4v11 M7.5 10.5L12 15l4.5-4.5 M5 20h14',
  'chevron-right': 'M9.5 6l6 6-6 6',
  'chevron-left': 'M14.5 6l-6 6 6 6',
  'chevron-down': 'M6 9.5l6 6 6-6',
  'arrow-up': 'M12 19V5 M6 11l6-6 6 6',
  'arrow-down': 'M12 5v14 M6 13l6 6 6-6',
  'arrow-right': 'M5 12h14 M13 6l6 6-6 6',
  layers: 'M12 4l9 5-9 5-9-5z M3 14l9 5 9-5',
  sparkles: 'M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z M18.5 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z',
  dot: 'M12 11a1 1 0 1 0 0 2a1 1 0 0 0 0-2z',
} as const;

export type ProjectsIconName = keyof typeof ICONS;

const props = defineProps<{ name: ProjectsIconName | string }>();
const path = computed(() => (ICONS as Record<string, string>)[props.name] ?? ICONS.dot);
</script>
