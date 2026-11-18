<template>
  <svg class="hom-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path :d="path" /></svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/* Home's own icon set: one stroked path each on a 24px grid, so they share a weight. */
const ICONS: Record<string, string> = {
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14z M21 21l-4.8-4.8',
  refresh: 'M20 11a8 8 0 0 0-14.9-3 M4 4v4h4 M4 13a8 8 0 0 0 14.9 3 M20 20v-4h-4',
  restart: 'M21 12a9 9 0 1 1-3-6.7 M21 4v5h-5',
  pause: 'M9 5v14 M15 5v14',
  play: 'M7 5l12 7-12 7z',
  upload: 'M12 16V4 M7 9l5-5 5 5 M5 20h14',
  plus: 'M12 5v14 M5 12h14',
  send: 'M4 12l16-8-6 16-2.5-6.5z M11.5 13.5L20 4',
  copy: 'M9 9h10.5v10.5H9z M15 9V4.5H4.5V15H9',
  key: 'M14.5 4a5.5 5.5 0 1 0 0 11a5.5 5.5 0 0 0 0-11z M10.5 12.5L3 20 M5 18l2 2 M7.5 15.5l2 2',
  command: 'M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z',
  power: 'M12 3v9 M6.3 6.3a8 8 0 1 0 11.4 0',
  shield: 'M12 3l8 3v6c0 4.5-3.2 8-8 9c-4.8-1-8-4.5-8-9V6z',
  'shield-alert': 'M12 3l8 3v6c0 4.5-3.2 8-8 9c-4.8-1-8-4.5-8-9V6z M12 8v5 M12 16h.01',
  'chevron-up': 'M6 15l6-6 6 6',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-right': 'M9 6l6 6-6 6',
  'arrow-right': 'M5 12h14 M13 6l6 6-6 6',
  'arrow-up-right': 'M7 17L17 7 M8 7h9v9',
  x: 'M6 6l12 12 M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  'check-circle': 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M8 12.3l2.7 2.7L16 9.5',
  alert: 'M12 4L2.8 19.5h18.4z M12 10v4.5 M12 17.2h.01',
  'octagon-x': 'M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2z M9.5 9.5l5 5 M14.5 9.5l-5 5',
  info: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M12 11v5.5 M12 7.8h.01',
  mute: 'M6.5 6.5A6 6 0 0 0 6 9c0 4-2 6.5-2 6.5h11.5 M9 4a6 6 0 0 1 9 5c0 2.3.4 3.9.9 5 M10 19a2 2 0 0 0 4 0 M3 3l18 18',
  bell: 'M6 9a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9 M10 19a2 2 0 0 0 4 0',
  clock: 'M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16z M12 8v4l3 2',
  home: 'M4 11l8-7 8 7 M6 10v10h12V10',
  external: 'M14 5h5v5 M19 5l-8 8 M17 13v6H5V7h6',
  // systems
  agent: 'M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
  stewards: 'M5 5h5v5H5z M14 5h5v5h-5z M14 14h5v5h-5z M10 7.5h4 M16.5 10v4 M5 14h5v5H5z M7.5 10v4',
  cloud: 'M7 18.5h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.1 9.6 4.5 4.5 0 0 0 7 18.5z',
  mail: 'M4 6h16v12H4z M4.5 7l7.5 6 7.5-6',
  trader: 'M3 17l6-6 4 4 8-8 M15 7h6v6',
  blox: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z M4.5 7.7L12 12l7.5-4.3 M12 12v9',
  tumblr: 'M5 19.5h.01 M5 12a7.5 7.5 0 0 1 7.5 7.5 M5 5a14.5 14.5 0 0 1 14.5 14.5',
  memes: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M8.5 14c1.8 2.2 5.2 2.2 7 0 M9 9.5h.01 M15 9.5h.01',
  cs2: 'M12 4.5a7.5 7.5 0 1 0 0 15a7.5 7.5 0 0 0 0-15z M12 2v5 M12 17v5 M2 12h5 M17 12h5',
  gram: 'M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7z M17 7h.01',
  defence: 'M12 3l8 3v6c0 4.5-3.2 8-8 9c-4.8-1-8-4.5-8-9V6z M9 12l2 2 4-4',
  intel: 'M12 3a9 9 0 1 0 9 9 M12 7a5 5 0 1 0 5 5 M12 12l6.5-6.5 M12 11.2a.8.8 0 1 0 0 1.6',
  games: 'M7.5 8h9a4.5 4.5 0 0 1 4.5 4.5v.5a3 3 0 0 1-5.3 1.9L14 13h-4l-1.7 1.9A3 3 0 0 1 3 13v-.5A4.5 4.5 0 0 1 7.5 8z M8 10v3 M6.5 11.5h3 M15.5 11h.01 M17.5 12.5h.01',
  tech: 'M7 7h10v10H7z M10 10h4v4h-4z M9 3v4 M15 3v4 M9 17v4 M15 17v4 M3 9h4 M3 15h4 M17 9h4 M17 15h4',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  tools: 'M15 4a5 5 0 0 0-4.6 7l-6.9 6.9a1.5 1.5 0 0 0 2.1 2.1l6.9-6.9A5 5 0 0 0 20 9l-3 1-2-2 1-3z',
  stratum: 'M12 4l9 15H3z M7.4 12h9.2',
  tube: 'M4 6h16v12H4z M10 9.5v5l4.5-2.5z',
  schemes: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  zap: 'M13 3L5 13h6l-1 8 8-10h-6z',
  server: 'M4 5h16v6H4z M4 13h16v6H4z M7.5 8h.01 M7.5 16h.01',
  llm: 'M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z M9 12h6 M12 9v6',
  calendar: 'M5 6h14v14H5z M5 10h14 M9 3v4 M15 3v4',
  logs: 'M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01',
  settings: 'M4 6h9 M17 6h3 M13 4v4 M4 12h3 M11 12h9 M7 10v4 M4 18h11 M19 18h1 M15 16v4',
  users: 'M9 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7z M2.5 20a6.5 6.5 0 0 1 13 0 M16 4.3a3.5 3.5 0 0 1 0 6.4 M18 14.5a6.5 6.5 0 0 1 3.5 5.5',
  user: 'M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M4.5 20a7.5 7.5 0 0 1 15 0',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  chat: 'M4 5h16v11H9l-5 4z',
  cpu: 'M7 7h10v10H7z M10 10h4v4h-4z M9 3v4 M15 3v4 M9 17v4 M15 17v4 M3 9h4 M3 15h4 M17 9h4 M17 15h4',
  memory: 'M4 8h16v8H4z M8 8v8 M12 8v8 M16 8v8 M6 16v3 M10 16v3 M14 16v3 M18 16v3',
  drive: 'M4 14h16v5H4z M4 14l2.5-9h11L20 14 M7.5 16.5h.01 M11 16.5h.01',
  globe: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M3 12h18 M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9z',
  dot: 'M12 11.99v.02',
};

const props = defineProps<{ name: string }>();
const path = computed(() => ICONS[props.name] ?? ICONS.dot);
</script>
