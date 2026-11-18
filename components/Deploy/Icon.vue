<template>
  <svg class="dpl-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path :d="path" /></svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/* The Deploy console's icons: one stroked path each on a 24px grid. */
const ICONS = {
  rocket: 'M12 3c3.5 1.6 5.5 5 5.5 9l-2 3h-7l-2-3c0-4 2-7.4 5.5-9z M12 9.5h.01 M9 15l-2.5 4 3-1 M15 15l2.5 4-3-1 M10.5 18l1.5 3 1.5-3',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14z M21 21l-4.8-4.8',
  refresh: 'M20 11a8 8 0 0 0-14.9-3 M4 4v4h4 M4 13a8 8 0 0 0 14.9 3 M20 20v-4h-4',
  play: 'M7 5l12 7-12 7z',
  pause: 'M9 5v14 M15 5v14',
  stop: 'M6 6h12v12H6z',
  x: 'M6 6l12 12 M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  'check-circle': 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M8 12.3l2.7 2.7L16 9.5',
  alert: 'M12 4L2.8 19.5h18.4z M12 10v4.5 M12 17.2h.01',
  'octagon-x': 'M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2z M9.5 9.5l5 5 M14.5 9.5l-5 5',
  info: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M12 11v5.5 M12 7.8h.01',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  bolt: 'M13 3L5 13h6l-1 8 8-10h-6z',
  flask: 'M9 3h6 M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3 M7.5 14h9',
  layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5',
  coins: 'M9 4a6 3 0 1 0 0 6a6 3 0 0 0 0-6z M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7 M3 11v4c0 1.7 2.7 3 6 3 M15 12a6 3 0 1 0 0 6a6 3 0 0 0 0-6z M9 15v2c0 1.7 2.7 3 6 3s6-1.3 6-3v-2',
  wallet: 'M4 7h15a1 1 0 0 1 1 1v11H5a1 1 0 0 1-1-1z M4 7V6a2 2 0 0 1 2-2h11 M16 13h.01',
  shield: 'M12 3l8 3v6c0 4.5-3.2 8-8 9c-4.8-1-8-4.5-8-9V6z',
  clock: 'M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16z M12 8v4l3 2',
  hourglass: 'M6 3h12 M6 21h12 M7 3v2.5c0 2.5 5 4 5 6.5s-5 4-5 6.5V21 M17 3v2.5c0 2.5-5 4-5 6.5s5 4 5 6.5V21',
  trash: 'M5 7h14 M10 4h4 M7 7l1 13h8l1-13 M10 11v6 M14 11v6',
  external: 'M14 5h5v5 M19 5l-8 8 M17 13v6H5V7h6',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-up': 'M6 15l6-6 6 6',
  'chevron-right': 'M9 6l6 6-6 6',
  'chevron-left': 'M15 6l-6 6 6 6',
  plus: 'M12 5v14 M5 12h14',
  sliders: 'M4 6h10 M18 6h2 M16 4v4 M4 12h3 M11 12h9 M9 10v4 M4 18h12 M20 18h0 M18 16v4',
  target: 'M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16z M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8z M12 12h.01',
  chart: 'M4 20V4 M4 20h16 M7 15l4-5 3 3 5-7',
  list: 'M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01',
  lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
  unlock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 7.8-1.3',
  dot: 'M12 11.99v.02',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
} as const;

const props = defineProps<{ name: string }>();
const path = computed(() => (ICONS as Record<string, string>)[props.name] ?? ICONS.dot);
</script>
