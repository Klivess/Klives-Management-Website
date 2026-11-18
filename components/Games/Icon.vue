<template>
  <svg class="kgx-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path :d="path" /></svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/* KliveGames' icons: one stroked path each on a 24 px grid, so they share a weight. */
const ICONS: Record<string, string> = {
  play: 'M7 5l12 7-12 7z',
  stop: 'M6 6h12v12H6z',
  refresh: 'M20 11a8 8 0 0 0-14.9-3 M4 4v4h4 M4 13a8 8 0 0 0 14.9 3 M20 20v-4h-4',
  restart: 'M4 12a8 8 0 1 0 2.4-5.7 M4 4v4h4',
  x: 'M6 6l12 12 M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M12 4L2.8 19.5h18.4z M12 10v4.5 M12 17.2h.01',
  info: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M12 11v5.5 M12 7.8h.01',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14z M21 21l-4.8-4.8',
  plus: 'M12 5v14 M5 12h14',
  minus: 'M5 12h14',
  terminal: 'M4 5h16v14H4z M7.5 9.5l3 2.5-3 2.5 M12.5 15h4',
  user: 'M12 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
  users: 'M9 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7z M2.5 20a6.5 6.5 0 0 1 13 0 M16 4.3a3.5 3.5 0 0 1 0 6.4 M18.5 14.2A6.5 6.5 0 0 1 21.5 20',
  folder: 'M3 6.5h6l2 2h10V19H3z',
  file: 'M6 3h8l4 4v14H6z M14 3v4h4',
  archive: 'M3 4h18v4H3z M5 8v12h14V8 M10 12h4',
  image: 'M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4 M15.5 9h.01',
  cpu: 'M7 7h10v10H7z M10 3v4 M14 3v4 M10 17v4 M14 17v4 M3 10h4 M3 14h4 M17 10h4 M17 14h4',
  memory: 'M3 8h18v8H3z M7 8v8 M11 8v8 M15 8v8 M5 16v3 M19 16v3',
  disk: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6 M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  globe: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M3 12h18 M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9z',
  home: 'M4 11l8-7 8 7 M6 9.5V20h12V9.5',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  download: 'M12 4v11 M7 10l5 5 5-5 M5 20h14',
  upload: 'M12 20V9 M7 14l5-5 5 5 M5 4h14',
  trash: 'M5 7h14 M10 4h4 M7 7l1 13h8l1-13 M10 11v6 M14 11v6',
  pen: 'M4 20l1-4L16 5l3 3L8 19z M14 7l3 3',
  history: 'M4 12a8 8 0 1 0 2.4-5.7 M4 4v4h4 M12 8v4l3 2',
  clock: 'M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16z M12 8v4l3 2',
  hourglass: 'M6 3h12 M6 21h12 M7 3v2.5c0 2.5 5 4 5 6.5s-5 4-5 6.5V21 M17 3v2.5c0 2.5-5 4-5 6.5s5 4 5 6.5V21',
  shield: 'M12 3l8 3v6c0 4.5-3.2 8-8 9c-4.8-1-8-4.5-8-9V6z',
  'shield-check': 'M12 3l8 3v6c0 4.5-3.2 8-8 9c-4.8-1-8-4.5-8-9V6z M8.5 12l2.5 2.5 4.5-4.8',
  lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
  bolt: 'M13 3L5 13h6l-1 8 8-10h-6z',
  sliders: 'M4 7h10 M18 7h2 M16 5v4 M4 17h4 M12 17h8 M10 15v4 M4 12h16',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-up': 'M6 15l6-6 6 6',
  'chevron-right': 'M9 6l6 6-6 6',
  'chevron-left': 'M15 6l-6 6 6 6',
  'arrow-down': 'M12 5v14 M6 13l6 6 6-6',
  'arrow-left': 'M19 12H5 M11 6l-6 6 6 6',
  filter: 'M4 5h16l-6 7.5V19l-4 1.5v-8z',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  gamepad: 'M7 8h10a5 5 0 0 1 4.6 7l-.7 1.7a2.5 2.5 0 0 1-4.3.6L15 15H9l-1.6 2.3a2.5 2.5 0 0 1-4.3-.6L2.4 15A5 5 0 0 1 7 8z M7 11v3 M5.5 12.5h3 M15.5 11.5h.01 M17.5 13.5h.01',
  server: 'M4 5h16v6H4z M4 13h16v6H4z M7.5 8h.01 M7.5 16h.01',
  wifi: 'M2.5 9a14 14 0 0 1 19 0 M5.5 12.5a9.5 9.5 0 0 1 13 0 M8.8 16a5 5 0 0 1 6.4 0 M12 19.5h.01',
  'wifi-off': 'M3 3l18 18 M8.8 16a5 5 0 0 1 6.4 0 M5.5 12.5a9.5 9.5 0 0 1 4.2-2.3 M2.5 9A14 14 0 0 1 8 5.7 M14.3 10.2a9.5 9.5 0 0 1 4.2 2.3 M12 19.5h.01',
  pause: 'M9 5v14 M15 5v14',
  external: 'M14 5h5v5 M19 5l-8 8 M17 13v6H5V7h6',
  keyboard: 'M3 6h18v12H3z M7 10h.01 M11 10h.01 M15 10h.01 M7 14h10',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  dot: 'M12 11.99v.02',
  ban: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M5.6 5.6l12.8 12.8',
  crown: 'M4 18h16 M4 18L3 7l5 4 4-7 4 7 5-4-1 11',
  kick: 'M15 4h4v16h-4 M10 16l-4-4 4-4 M6 12h11',
};

const props = defineProps<{ name: string }>();
const path = computed(() => ICONS[props.name] ?? ICONS.dot);
</script>
