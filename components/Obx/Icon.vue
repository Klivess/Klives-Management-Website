<template>
  <svg class="obx-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path :d="path" /></svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/* OmniBlox's own icons: one stroked path each on a 24px grid, so they share a weight. */
const ICONS: Record<string, string> = {
  blocks: 'M4 8l8-4 8 4-8 4z M4 8v8l8 4 M20 8v8l-8 4 M12 12v8',
  cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z M12 12l8-4.5 M12 12L4 7.5 M12 12v9',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14z M21 21l-4.8-4.8',
  refresh: 'M20 11a8 8 0 0 0-14.9-3 M4 4v4h4 M4 13a8 8 0 0 0 14.9 3 M20 20v-4h-4',
  play: 'M7 5l12 7-12 7z',
  pause: 'M9 5v14 M15 5v14',
  power: 'M12 3v8 M7.5 6.2a7.5 7.5 0 1 0 9 0',
  x: 'M6 6l12 12 M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  'check-circle': 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M8 12.3l2.7 2.7L16 9.5',
  alert: 'M12 4L2.8 19.5h18.4z M12 10v4.5 M12 17.2h.01',
  octagon: 'M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2z M12 8v5 M12 16h.01',
  info: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M12 11v5.5 M12 7.8h.01',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  key: 'M14.5 4a5.5 5.5 0 1 0 0 11a5.5 5.5 0 0 0 0-11z M10.6 13.4L3 21 M5.5 18.5L8 21 M8 16l2.2 2.2',
  user: 'M12 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
  users: 'M9 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M2 21a7 7 0 0 1 14 0 M16 3.5a4 4 0 0 1 0 7.5 M18 14.5a6.5 6.5 0 0 1 4 6.5',
  box: 'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5',
  rocket: 'M12 3c3.5 2 5.5 6 5 11l-2.5 2.5h-5L7 14c-.5-5 1.5-9 5-11z M12 9.5h.01 M9.5 16.5L7 21l3.5-1.5 M14.5 16.5L17 21l-3.5-1.5',
  upload: 'M12 20V9 M7 14l5-5 5 5 M5 4h14',
  download: 'M12 4v11 M7 10l5 5 5-5 M5 20h14',
  note: 'M5 4h14v11l-5 5H5z M14 20v-5h5 M8 9h8 M8 12.5h5',
  inbox: 'M4 13l2.5-8h11l2.5 8v6H4z M4 13h5l1 2h4l1-2h5',
  coins: 'M12 4c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3z M4 7v5c0 1.7 3.6 3 8 3s8-1.3 8-3V7 M4 12v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5',
  chip: 'M8 8h8v8H8z M5 9.5h3 M5 14.5h3 M16 9.5h3 M16 14.5h3 M9.5 5v3 M14.5 5v3 M9.5 16v3 M14.5 16v3',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M19 16l.8 2.2 2.2.8-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  leaf: 'M5 19c0-8 5-14 15-14 0 10-6 15-14 15 M5 19l7-7',
  book: 'M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z M5 17a3 3 0 0 1 3-3h10',
  map: 'M9 4L3 6.5v14L9 18l6 2.5 6-2.5v-14L15 6.5 9 4z M9 4v14 M15 6.5v14',
  flask: 'M9 3h6 M10 3v6l-5.5 9.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3 M7.5 15h9',
  store: 'M4 9l1.5-5h13L20 9 M4 9v11h16V9 M4 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3 M9 20v-5h6v5',
  chart: 'M4 20V4 M4 20h16 M8 16v-4 M12 16V8 M16 16v-6',
  brain: 'M9 4a3 3 0 0 0-3 3v.5A3 3 0 0 0 4 10.3a3 3 0 0 0 1 5.2V16a3 3 0 0 0 4 2.8A3 3 0 0 0 12 20V5.5A3 3 0 0 0 9 4z M15 4a3 3 0 0 1 3 3v.5a3 3 0 0 1 2 2.8 3 3 0 0 1-1 5.2V16a3 3 0 0 1-4 2.8A3 3 0 0 1 12 20',
  file: 'M6 3h8l4 4v14H6z M14 3v4h4',
  code: 'M9 7l-5 5 5 5 M15 7l5 5-5 5',
  history: 'M3 12a9 9 0 1 0 3-6.7 M3 4v4h4 M12 8v4l3 2',
  clock: 'M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16z M12 8v4l3 2',
  external: 'M14 5h5v5 M19 5l-8 8 M17 13v6H5V7h6',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-up': 'M6 15l6-6 6 6',
  'chevron-right': 'M9 6l6 6-6 6',
  'chevron-left': 'M15 6l-6 6 6 6',
  plus: 'M12 5v14 M5 12h14',
  send: 'M4 12l16-8-6 16-2.5-6.5z M11.5 13.5L20 4',
  steer: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z M12 3v6 M4.2 16.5L9.4 13.5 M19.8 16.5l-5.2-3',
  wrench: 'M14.5 4.5a4.5 4.5 0 0 0-5.8 5.8L4 15l1.5 3.5L9 20l4.7-4.7a4.5 4.5 0 0 0 5.8-5.8l-2.8 2.8-2.7-.6-.6-2.7z',
  trash: 'M5 7h14 M10 4h4 M7 7l1 13h8l1-13 M10 11v6 M14 11v6',
  revive: 'M4 12a8 8 0 1 0 2.3-5.6 M4 4v4h4 M12 8v8 M8 12h8',
  eye: 'M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  grid: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  rows: 'M4 6h16 M4 12h16 M4 18h16',
  dot: 'M12 11.99v.02',
  lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
  globe: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M3 12h18 M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9z',
  swap: 'M7 7h13 M16 3l4 4-4 4 M17 17H4 M8 13l-4 4 4 4',
  harvest: 'M12 21V10 M12 10c0-4 3-6 7-6 0 4-3 6-7 6z M12 13c0-3-2.5-5-6-5 0 3 2.5 5 6 5z M5 21h14',
  bolt: 'M13 3L5 13h6l-1 8 8-10h-6z',
  route: 'M6 19a2 2 0 1 0 0-4a2 2 0 0 0 0 4z M18 9a2 2 0 1 0 0-4a2 2 0 0 0 0 4z M6 15V10a4 4 0 0 1 4-4h6 M8 18h5a5 5 0 0 0 5-5V9',
};

const props = defineProps<{ name: string }>();
const path = computed(() => ICONS[props.name] ?? ICONS.dot);
</script>
