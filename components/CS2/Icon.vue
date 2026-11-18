<template>
  <svg class="cs2x-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path :d="path" /></svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/* The CS2 console's own icons: one stroked path each on a 24px grid, so they share a weight. */
const ICONS: Record<string, string> = {
  crosshair: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M12 2v5 M12 17v5 M2 12h5 M17 12h5 M12 11.5v1',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14z M21 21l-4.8-4.8',
  refresh: 'M20 11a8 8 0 0 0-14.9-3 M4 4v4h4 M4 13a8 8 0 0 0 14.9 3 M20 20v-4h-4',
  settings: 'M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z M19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7.5 7.5 0 0 1-2.1 1.2L14.7 21h-4l-.3-2.4a7.5 7.5 0 0 1-2.1-1.2l-1.9.7-2-3.4 1.6-1.2a7 7 0 0 1 0-2.4L4.4 9.9l2-3.4 1.9.7a7.5 7.5 0 0 1 2.1-1.2L10.7 3h4l.3 2.4a7.5 7.5 0 0 1 2.1 1.2l1.9-.7 2 3.4-1.6 1.2a7 7 0 0 1 0 2.4z',
  radar: 'M12 3a9 9 0 1 0 9 9 M12 7a5 5 0 1 0 5 5 M12 12l6.4-6.4 M12 12h.01',
  x: 'M6 6l12 12 M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  'check-circle': 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M8 12.3l2.7 2.7L16 9.5',
  alert: 'M12 4L2.8 19.5h18.4z M12 10v4.5 M12 17.2h.01',
  'octagon-x': 'M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2z M9.5 9.5l5 5 M14.5 9.5l-5 5',
  info: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M12 11v5.5 M12 7.8h.01',
  wallet: 'M4 7h15a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a2 2 0 0 1 2-2h11 M16 13.5h.01 M20 11h-4a2 2 0 0 0 0 5h4',
  funnel: 'M4 5h16l-6 7.5V19l-4 1.5v-8z',
  box: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z M4 7.5l8 4.5 8-4.5 M12 12v9',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0z M8 6H5a3 3 0 0 0 3 4 M16 6h3a3 3 0 0 1-3 4 M12 13v4 M8.5 20h7 M10 17h4',
  swap: 'M7 7h12l-3-3 M17 17H5l3 3',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M12 7.5V12l3 2',
  lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
  key: 'M14.5 4a5.5 5.5 0 1 0 0 11a5.5 5.5 0 0 0 0-11z M10.6 13.4L3 21 M5.5 18.5L8 21 M8 16l2.2 2.2',
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  play: 'M7 5l12 7-12 7z',
  pause: 'M9 5v14 M15 5v14',
  chart: 'M4 20V4 M4 20h16 M8 16v-4 M12 16V8 M16 16v-6',
  list: 'M9 6h11 M9 12h11 M9 18h11 M4.5 6h.01 M4.5 12h.01 M4.5 18h.01',
  tag: 'M3 12V4h8l10 10-8 8z M7.5 7.5h.01',
  bolt: 'M13 3L5 13h6l-1 8 8-10h-6z',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-up': 'M6 15l6-6 6 6',
  'chevron-left': 'M15 6l-6 6 6 6',
  'chevron-right': 'M9 6l6 6-6 6',
  'arrow-left': 'M19 12H5 M11 6l-6 6 6 6',
  'arrow-right': 'M5 12h14 M13 6l6 6-6 6',
  steam: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M15.5 7.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5z M3.5 14l5 2 M8.5 16a2 2 0 1 0 4 .5',
  close: 'M5 12h14',
  gauge: 'M12 21a9 9 0 1 1 9-9 M12 12l4.5-4.5 M3.5 16h3 M17.5 16h3',
  hourglass: 'M6 3h12 M6 21h12 M7 3v2.5c0 2.5 5 4 5 6.5s-5 4-5 6.5V21 M17 3v2.5c0 2.5-5 4-5 6.5s5 4 5 6.5V21',
  dot: 'M12 11.99v.02',
};

const props = defineProps<{ name: string }>();
const path = computed(() => ICONS[props.name] ?? ICONS.dot);
</script>
