<template>
  <svg class="twx-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path :d="path" /></svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/* The Tripwires console's own icons: one stroked path each on a 24px grid, so they share a weight. */
const ICONS = {
  bolt: 'M13 3L5 13h6l-1 8 8-10h-6z',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14z M21 21l-4.8-4.8',
  refresh: 'M20 11a8 8 0 0 0-14.9-3 M4 4v4h4 M4 13a8 8 0 0 0 14.9 3 M20 20v-4h-4',
  plus: 'M12 5v14 M5 12h14',
  x: 'M6 6l12 12 M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  copy: 'M9 9h10v10H9z M5 15V5h10',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6',
  pause: 'M9 5v14 M15 5v14',
  play: 'M7 5l12 7-12 7z',
  settings: 'M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z M19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4z',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  globe: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M3 12h18 M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9z',
  pin: 'M12 21s-6-5.4-6-10.5A6 6 0 0 1 18 10.5C18 15.6 12 21 12 21z M12 8a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5z',
  device: 'M7 3h10v18H7z M11 18h2',
  desktop: 'M3 4h18v12H3z M8 20h8 M12 16v4',
  user: 'M12 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
  users: 'M9 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M2 21a7 7 0 0 1 14 0 M16 3.5a4 4 0 0 1 0 7.5 M18 14a6 6 0 0 1 4 7',
  shield: 'M12 3l8 3v6c0 4.5-3.2 8-8 9c-4.8-1-8-4.5-8-9V6z',
  mask: 'M3 8c3-2 15-2 18 0c0 5-3 8-6 8c-1.4 0-2-1.5-3-1.5S10.4 16 9 16c-3 0-6-3-6-8z M8 10.5h2 M14 10.5h2',
  server: 'M4 4h16v6H4z M4 14h16v6H4z M8 7h.01 M8 17h.01',
  signal: 'M4 20v-3 M9 20v-7 M14 20V9 M19 20V4',
  home: 'M4 11l8-7 8 7 M6 9.5V20h12V9.5',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z',
  'eye-off': 'M3 3l18 18 M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 3.8 M6.6 6.6A16.6 16.6 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6 M9.9 9.9a3 3 0 0 0 4.2 4.2',
  discord: 'M8 7.5c2.6-.8 5.4-.8 8 0 M7.5 16.5c2.9 1 6.1 1 9 0 M6 7.5L4 15.5c1.3 1.3 2.8 2.1 4.5 2.5l1-2 M18 7.5l2 8c-1.3 1.3-2.8 2.1-4.5 2.5l-1-2 M9.5 12h.01 M14.5 12h.01',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4z M10 20a2 2 0 0 0 4 0',
  'bell-off': 'M3 3l18 18 M8.5 5.4A6 6 0 0 1 18 11v4 M6 11v5l-2 2h12 M10 20a2 2 0 0 0 4 0',
  clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M12 7v5l3 2',
  alert: 'M12 4L2.8 19.5h18.4z M12 10v4.5 M12 17.2h.01',
  info: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M12 11v5.5 M12 7.8h.01',
  'octagon-x': 'M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2z M9.5 9.5l5 5 M14.5 9.5l-5 5',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  list: 'M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01',
  filter: 'M3 5h18l-7 8v6l-4 2v-8z',
  download: 'M12 4v11 M7 10l5 5 5-5 M5 20h14',
  history: 'M3 12a9 9 0 1 0 3-6.7 M3 4v4h4 M12 8v4l3 2',
  lock: 'M6 11h12v10H6z M8.5 11V7.5a3.5 3.5 0 0 1 7 0V11',
  chevron: 'M9 6l6 6-6 6',
  'chevron-down': 'M6 9l6 6 6-6',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  duplicate: 'M8 8h12v12H8z M4 16V4h12 M14 11v6 M11 14h6',
  key: 'M14.5 4a5.5 5.5 0 1 0 0 11a5.5 5.5 0 0 0 0-11z M10.6 13.4L3 21 M5.5 18.5L8 21 M8 16l2.2 2.2',
  bot: 'M5 9h14v10H5z M12 4v5 M9 13h.01 M15 13h.01 M9 16.5h6 M2 13v3 M22 13v3',
  door: 'M5 21V4h11v17 M3 21h18 M12 12h.01 M16 4l3 1.5V20',
  privacy: 'M12 3l8 3v6c0 4.5-3.2 8-8 9c-4.8-1-8-4.5-8-9V6z M9 12.5l2 2 4-4.5',
  keyboard: 'M3 6h18v12H3z M7 10h.01 M11 10h.01 M15 10h.01 M7 14h10',
} as const;

const props = defineProps<{ name: keyof typeof ICONS | string }>();
const path = computed(() => (ICONS as Record<string, string>)[props.name] ?? ICONS.info);
</script>
