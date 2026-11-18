<template>
  <svg class="tmb-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path :d="path" /></svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/* The OmniTumblr console's icons: one stroked path each on a 24px grid, so they share a weight. */
const ICONS: Record<string, string> = {
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
  plus: 'M12 5v14 M5 12h14',
  minus: 'M5 12h14',
  clock: 'M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16z M12 8v4l3 2',
  send: 'M4 12l16-8-6 16-3-6z M11 14l9-10',
  chart: 'M4 20V10 M10 20V4 M16 20v-7 M21 20H3',
  radar: 'M12 3a9 9 0 1 0 9 9 M12 7a5 5 0 1 0 5 5 M12 12l6.4-6.4 M12 12h.01',
  sliders: 'M4 6h9 M17 6h3 M13 4v4 M4 12h3 M11 12h9 M7 10v4 M4 18h11 M19 18h1 M15 16v4',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  gear: 'M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  unlink: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1 M4 4l16 16',
  calendar: 'M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4',
  edit: 'M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4',
  trash: 'M5 7h14 M10 4h4 M7 7l1 13h8l1-13 M10 11v6 M14 11v6',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  image: 'M4 5h16v14H4z M4 16l5-5 4 4 2-2 5 5 M15.5 9a1.5 1.5 0 1 0 0-.01',
  video: 'M4 6h12v12H4z M16 10l5-3v10l-5-3',
  text: 'M5 6h14 M5 10h14 M5 14h9 M5 18h6',
  reblog: 'M4 9V7a2 2 0 0 1 2-2h11 M14 2l3 3-3 3 M20 15v2a2 2 0 0 1-2 2H7 M10 22l-3-3 3-3',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  external: 'M14 5h5v5 M19 5l-8 8 M17 13v6H5V7h6',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-up': 'M6 15l6-6 6 6',
  'chevron-right': 'M9 6l6 6-6 6',
  'chevron-left': 'M15 6l-6 6 6 6',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  user: 'M12 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
  tag: 'M3 12V4h8l10 10-8 8z M7.5 7.5h.01',
  eye: 'M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z',
  upload: 'M12 20V9 M7 14l5-5 5 5 M5 4h14',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  bolt: 'M13 3L5 13h6l-1 8 8-10h-6z',
  inbox: 'M4 13l2.5-8h11l2.5 8v6H4z M4 13h5l1 2h4l1-2h5',
  globe: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M3 12h18 M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9z',
  layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5',
  skip: 'M6 5l9 7-9 7z M18 5v14',
  lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
  history: 'M3 12a9 9 0 1 0 3-6.7 M3 4v4h4 M12 8v4l3 2',
  shield: 'M12 3l8 3v6c0 4.5-3.2 8-8 9c-4.8-1-8-4.5-8-9V6z',
  swap: 'M4 8h13 M14 4l4 4-4 4 M20 16H7 M10 12l-4 4 4 4',
  list: 'M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01',
  server: 'M4 5h16v6H4z M4 13h16v6H4z M7.5 8h.01 M7.5 16h.01',
  wand: 'M4 20L15 9 M13 7l4 4 M17 3v3 M15.5 4.5h3 M20 8v2 M19 9h2',
  dot: 'M12 11.99v.02',
};

const props = defineProps<{ name: string }>();
const path = computed(() => ICONS[props.name] ?? ICONS.dot);
</script>
