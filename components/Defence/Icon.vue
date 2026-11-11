<template>
  <svg class="odx-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path :d="path" /></svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/* OmniDefence's own icons: one stroked path each on a 24px grid, so they share a weight. */
const ICONS = {
  shield: 'M12 3l8 3v6c0 4.5-3.2 8-8 9c-4.8-1-8-4.5-8-9V6z',
  'shield-check': 'M12 3l8 3v6c0 4.5-3.2 8-8 9c-4.8-1-8-4.5-8-9V6z M8.5 12l2.5 2.5 4.5-4.8',
  'shield-alert': 'M12 3l8 3v6c0 4.5-3.2 8-8 9c-4.8-1-8-4.5-8-9V6z M12 8v5 M12 16h.01',
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
  globe: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M3 12h18 M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9z',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  flag: 'M5 21V4 M5 4h11l-2 4 2 4H5',
  key: 'M14.5 4a5.5 5.5 0 1 0 0 11a5.5 5.5 0 0 0 0-11z M10.6 13.4L3 21 M5.5 18.5L8 21 M8 16l2.2 2.2',
  user: 'M12 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
  'user-check': 'M10 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M3 21a7 7 0 0 1 11-5.7 M15.5 18.5l2 2 4-4',
  bolt: 'M13 3L5 13h6l-1 8 8-10h-6z',
  trap: 'M12 3.5l7.5 4.3v8.4L12 20.5l-7.5-4.3V7.8z M12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5z',
  fingerprint: 'M7.5 4.8A8 8 0 0 1 20 11.5 M4 9a8 8 0 0 1 1.3-2.6 M4.3 15.5a18 18 0 0 0 .7-4 7 7 0 0 1 14 0v1 M9 21a14 14 0 0 0 1.5-6.5 1.5 1.5 0 0 1 3 0 M17.5 19.5a20 20 0 0 0 1.3-4.2 M12 11.5c0 4-1 7-2.5 9.5',
  block: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M5.6 5.6l12.8 12.8',
  release: 'M8 11V7a4 4 0 0 1 7.8-1.3 M5 11h14v10H5z M12 15v2',
  lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
  eye: 'M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z',
  hourglass: 'M6 3h12 M6 21h12 M7 3v2.5c0 2.5 5 4 5 6.5s-5 4-5 6.5V21 M17 3v2.5c0 2.5-5 4-5 6.5s5 4 5 6.5V21',
  radar: 'M12 3a9 9 0 1 0 9 9 M12 7a5 5 0 1 0 5 5 M12 12l6.4-6.4 M12 12h.01',
  pin: 'M12 21s-6.5-5.8-6.5-11a6.5 6.5 0 0 1 13 0c0 5.2-6.5 11-6.5 11z M12 7.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5z',
  tag: 'M3 12V4h8l10 10-8 8z M7.5 7.5h.01',
  dot: 'M12 11.99v.02',
  map: 'M9 4L3 6.5v14L9 18l6 2.5 6-2.5v-14L15 6.5 9 4z M9 4v14 M15 6.5v14',
  download: 'M12 4v11 M7 10l5 5 5-5 M5 20h14',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  note: 'M5 4h14v11l-5 5H5z M14 20v-5h5 M8 9h8 M8 12.5h5',
  external: 'M14 5h5v5 M19 5l-8 8 M17 13v6H5V7h6',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-up': 'M6 15l6-6 6 6',
  'chevron-right': 'M9 6l6 6-6 6',
  'chevron-left': 'M15 6l-6 6 6 6',
  plus: 'M12 5v14 M5 12h14',
  minus: 'M5 12h14',
  trash: 'M5 7h14 M10 4h4 M7 7l1 13h8l1-13 M10 11v6 M14 11v6',
  filter: 'M4 5h16l-6 7.5V19l-4 1.5v-8z',
  clock: 'M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16z M12 8v4l3 2',
  crosshair: 'M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16z M12 1.5v5 M12 17.5v5 M1.5 12h5 M17.5 12h5',
  box: 'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5',
  'arrow-right': 'M5 12h14 M13 6l6 6-6 6',
  route: 'M6 19a2 2 0 1 0 0-4a2 2 0 0 0 0 4z M18 9a2 2 0 1 0 0-4a2 2 0 0 0 0 4z M6 15V10a4 4 0 0 1 4-4h6 M8 18h5a5 5 0 0 0 5-5V9',
  server: 'M4 5h16v6H4z M4 13h16v6H4z M7.5 8h.01 M7.5 16h.01',
  layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5',
  history: 'M3 12a9 9 0 1 0 3-6.7 M3 4v4h4 M12 8v4l3 2',
  sliders: 'M4 6h9 M17 6h3 M13 4v4 M4 12h3 M11 12h9 M7 10v4 M4 18h11 M19 18h1 M15 16v4',
  pointer: 'M5 3l14 7-6.5 2-2 6.5z',
  expand: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
  zap: 'M13 3L5 13h6l-1 8 8-10h-6z',
  inbox: 'M4 13l2.5-8h11l2.5 8v6H4z M4 13h5l1 2h4l1-2h5',
} as const;

const props = defineProps<{ name: keyof typeof ICONS | string }>();
const path = computed(() => (ICONS as Record<string, string>)[props.name] ?? ICONS.dot);
</script>
