<template>
  <svg class="pfx-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path :d="path" /></svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/* The profile console's icons: one stroked path each on a 24px grid, so they share a weight. */
const ICONS: Record<string, string> = {
  users: 'M9 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M2 21a7 7 0 0 1 14 0 M16 3.5a4 4 0 0 1 0 7.5 M18 14.5a6 6 0 0 1 4 6.5',
  user: 'M12 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
  'user-x': 'M10 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M3 21a7 7 0 0 1 11-5.7 M16.5 15.5l5 5 M21.5 15.5l-5 5',
  'user-plus': 'M10 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M3 21a7 7 0 0 1 11-5.7 M19 14v6 M16 17h6',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14z M21 21l-4.8-4.8',
  refresh: 'M20 11a8 8 0 0 0-14.9-3 M4 4v4h4 M4 13a8 8 0 0 0 14.9 3 M20 20v-4h-4',
  plus: 'M12 5v14 M5 12h14',
  ban: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M5.6 5.6l12.8 12.8',
  key: 'M14.5 4a5.5 5.5 0 1 0 0 11a5.5 5.5 0 0 0 0-11z M10.6 13.4L3 21 M5.5 18.5L8 21 M8 16l2.2 2.2',
  device: 'M4 5h16v11H4z M9 20h6 M12 16v4',
  phone: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M11 18h2',
  terminal: 'M4 5h16v14H4z M7.5 9.5l3 2.5-3 2.5 M12.5 15h4',
  power: 'M12 3v8 M6.3 6.6a8 8 0 1 0 11.4 0',
  pause: 'M9 5v14 M15 5v14',
  play: 'M7 5l12 7-12 7z',
  clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M12 7.5V12l3 2',
  scissors: 'M6 3.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5z M6 15.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5z M8.1 7.6L20 18 M8.1 16.4L20 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  'check-circle': 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M8 12.3l2.7 2.7L16 9.5',
  alert: 'M12 4L2.8 19.5h18.4z M12 10v4.5 M12 17.2h.01',
  'octagon-x': 'M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2z M9.5 9.5l5 5 M14.5 9.5l-5 5',
  info: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M12 11v5.5 M12 7.8h.01',
  x: 'M6 6l12 12 M18 6L6 18',
  'chevron-right': 'M9.5 6l6 6-6 6',
  'chevron-down': 'M6 9.5l6 6 6-6',
  'arrow-left': 'M19 12H5 M11 6l-6 6 6 6',
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  signout: 'M9 4H5v16h4 M15 8l4 4-4 4 M19 12H9',
  eye: 'M2.5 12c2-4 5.5-6.5 9.5-6.5s7.5 2.5 9.5 6.5c-2 4-5.5 6.5-9.5 6.5S4.5 16 2.5 12z M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z',
  lock: 'M6 10.5h12V20H6z M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3',
  shield: 'M12 3l8 3v6c0 4.5-3.2 8-8 9c-4.8-1-8-4.5-8-9V6z',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  grid: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  list: 'M9 6h11 M9 12h11 M9 18h11 M4.5 6h.01 M4.5 12h.01 M4.5 18h.01',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  trash: 'M4 7h16 M9 7V4h6v3 M6.5 7l1 13h9l1-13',
  globe: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M3 12h18 M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9z',
  bolt: 'M13 3L5 13h6l-1 8 8-10h-6z',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  history: 'M3.5 12a8.5 8.5 0 1 0 2.5-6 M3 4v4h4 M12 8v4l3 2',
  edit: 'M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4',
  route: 'M6 3a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5z M6 8v13 M18 3a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5z M18 8v3a3 3 0 0 1-3 3h-5',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
  filter: 'M4 5h16l-6 7.5V19l-4 1.5v-8z',
  layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5',
  catalog: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z M5 17a3 3 0 0 1 3-3h11',
};

const props = defineProps<{ name: string }>();
const path = computed(() => ICONS[props.name] ?? ICONS.info);
</script>
