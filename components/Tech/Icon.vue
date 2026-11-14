<template>
  <svg class="ktx-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path :d="path" /></svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/* KliveTech's own icons: one stroked path each on a 24px grid, so they share a weight. */
const ICONS = {
  chip: 'M8 7h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z M10 10h4v4h-4z M9.5 4v3 M14.5 4v3 M9.5 17v3 M14.5 17v3 M4 9.5h3 M4 14.5h3 M17 9.5h3 M17 14.5h3',
  bluetooth: 'M7 7.5l10 9-5 4.5V3l5 4.5-10 9',
  hub: 'M4 14h16v5H4z M7.5 16.5h.01 M11 16.5h.01 M8.5 11a5 5 0 0 1 7 0 M6 8.5a8.5 8.5 0 0 1 12 0',
  relay: 'M5 12h4 M15 6h4 M15 18h4 M9 12c3 0 3-6 6-6 M9 12c3 0 3 6 6 6',
  server: 'M4 5h16v6H4z M4 13h16v6H4z M7.5 8h.01 M7.5 16h.01 M11 8h6 M11 16h6',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  unlink: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1 M4 4l16 16',
  radar: 'M12 3a9 9 0 1 0 9 9 M12 7a5 5 0 1 0 5 5 M12 12l6.4-6.4 M12 12h.01',
  signal: 'M12 20v-6 M9 11a4.2 4.2 0 0 1 6 0 M6.3 8.3a8 8 0 0 1 11.4 0 M12 14h.01',
  bolt: 'M13 3L5 13h6l-1 8 8-10h-6z',
  power: 'M12 3v8 M7.5 6.3a7 7 0 1 0 9 0',
  toggle: 'M8 7h8a5 5 0 0 1 0 10H8A5 5 0 0 1 8 7z M16 10a2 2 0 1 0 0 4a2 2 0 0 0 0-4z',
  wave: 'M3 12h3l2-6 4 12 3-9 2 3h4',
  gauge: 'M4.5 17a8.5 8.5 0 1 1 15 0 M12 13l3.5-4.5 M12 13h.01',
  firmware: 'M8 7h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z M12 9.5v5 M10 12.5l2 2 2-2 M9.5 4v3 M14.5 4v3 M9.5 17v3 M14.5 17v3',
  upload: 'M12 16V4 M7 9l5-5 5 5 M5 20h14',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14z M21 21l-4.8-4.8',
  refresh: 'M20 11a8 8 0 0 0-14.9-3 M4 4v4h4 M4 13a8 8 0 0 0 14.9 3 M20 20v-4h-4',
  play: 'M7 5l12 7-12 7z',
  pause: 'M9 5v14 M15 5v14',
  x: 'M6 6l12 12 M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  'check-circle': 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M8 12.3l2.7 2.7L16 9.5',
  alert: 'M12 4L2.8 19.5h18.4z M12 10v4.5 M12 17.2h.01',
  'octagon-x': 'M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2z M9.5 9.5l5 5 M14.5 9.5l-5 5',
  info: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M12 11v5.5 M12 7.8h.01',
  shield: 'M12 3l8 3v6c0 4.5-3.2 8-8 9c-4.8-1-8-4.5-8-9V6z',
  clock: 'M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16z M12 8v4l3 2',
  history: 'M3 12a9 9 0 1 0 3-6.7 M3 4v4h4 M12 8v4l3 2',
  plus: 'M12 5v14 M5 12h14',
  minus: 'M5 12h14',
  trash: 'M5 7h14 M10 4h4 M7 7l1 13h8l1-13 M10 11v6 M14 11v6',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  terminal: 'M4 5h16v14H4z M7.5 9.5l3 2.5-3 2.5 M12.5 15h4',
  image: 'M4 5h16v14H4z M4 16l4.5-4.5 4 4 2.5-2.5 5 5 M15.5 9.5h.01',
  sliders: 'M4 6h9 M17 6h3 M13 4v4 M4 12h3 M11 12h9 M7 10v4 M4 18h11 M19 18h1 M15 16v4',
  eye: 'M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z',
  lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
  external: 'M14 5h5v5 M19 5l-8 8 M17 13v6H5V7h6',
  inbox: 'M4 13l2.5-8h11l2.5 8v6H4z M4 13h5l1 2h4l1-2h5',
  layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5',
  grid: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  list: 'M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-up': 'M6 15l6-6 6 6',
  'chevron-right': 'M9 6l6 6-6 6',
  'chevron-left': 'M15 6l-6 6 6 6',
  'arrow-right': 'M5 12h14 M13 6l6 6-6 6',
  send: 'M4 12l16-8-6 16-2.5-6.5z M11.5 13.5L20 4',
  dot: 'M12 11.99v.02',
} as const;

const props = defineProps<{ name: keyof typeof ICONS | string }>();
const path = computed(() => (ICONS as Record<string, string>)[props.name] ?? ICONS.dot);
</script>
