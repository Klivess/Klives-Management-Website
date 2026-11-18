<template>
  <svg class="kml-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path :d="path" /></svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/* KliveMail's icons: one stroked path each on a 24px grid, the weight the Admin and OmniDefence icons use. */
const ICONS = {
  mail: 'M3.5 6h17v12h-17z M3.8 6.5L12 13l8.2-6.5',
  'mail-open': 'M3.5 10L12 4l8.5 6v9h-17z M3.8 10.2L12 15.5l8.2-5.3',
  inbox: 'M3.5 13.5L6 5h12l2.5 8.5V19h-17z M3.5 13.5H9l1 2.5h4l1-2.5h5.5',
  dot: 'M12 9.2a2.8 2.8 0 1 0 0 5.6a2.8 2.8 0 0 0 0-5.6z',
  key: 'M14.5 4a5.5 5.5 0 1 0 0 11a5.5 5.5 0 0 0 0-11z M10.6 13.4L3 21 M5.5 18.5L8 21 M8 16l2.2 2.2',
  clip: 'M20 11.5l-7.8 7.8a5 5 0 0 1-7.1-7.1l8.2-8.2a3.4 3.4 0 0 1 4.8 4.8l-8.1 8.1a1.7 1.7 0 0 1-2.4-2.4l7.4-7.4',
  trash: 'M4.5 7h15 M9.5 7V4.5h5V7 M6.5 7l1 13h9l1-13 M10 11v5.5 M14 11v5.5',
  restore: 'M4 12a8 8 0 1 0 2.4-5.7 M4 4.5v4h4',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14z M21 21l-4.8-4.8',
  refresh: 'M20 11a8 8 0 0 0-14.9-3 M4 4v4h4 M4 13a8 8 0 0 0 14.9 3 M20 20v-4h-4',
  x: 'M6 6l12 12 M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  'check-all': 'M2.5 12.5l4.5 4.5 9-9.5 M11 16.5l1 1 9.5-10',
  copy: 'M8 8h12v12H8z M16 8V4H4v12h4',
  plus: 'M12 5v14 M5 12h14',
  at: 'M16 12a4 4 0 1 1-8 0a4 4 0 0 1 8 0z M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.6 7.2',
  pin: 'M9 4h6 M10 4v5.5L7 13h10l-3-3.5V4 M12 13v7',
  'pin-off': 'M9 4h6 M10 4v5.5L7 13h10l-3-3.5V4 M12 13v7 M4 4l16 16',
  'chevron-down': 'M6 9.5l6 6 6-6',
  'chevron-right': 'M9.5 6l6 6-6 6',
  'chevron-up': 'M6 14.5l6-6 6 6',
  'arrow-left': 'M19 12H5 M11 6l-6 6 6 6',
  'arrow-up': 'M12 19V5 M6 11l6-6 6 6',
  'arrow-down': 'M12 5v14 M6 13l6 6 6-6',
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6',
  image: 'M4 5h16v14H4z M4 16l4.5-4.5 4 4 2.5-2.5L20 18 M15.5 9.5h.01',
  sun: 'M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8z M12 2.5v2 M12 19.5v2 M4.2 4.2l1.4 1.4 M18.4 18.4l1.4 1.4 M2.5 12h2 M19.5 12h2 M4.2 19.8l1.4-1.4 M18.4 5.6l1.4-1.4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  download: 'M12 4v11 M7 10.5l5 5 5-5 M5 20h14',
  user: 'M12 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
  antenna: 'M12 12v9 M8.5 21h7 M12 12a1.6 1.6 0 1 0 0-.01 M8 8a5.5 5.5 0 0 0 0 8 M16 8a5.5 5.5 0 0 1 0 8 M5.2 5.2a9.5 9.5 0 0 0 0 13.6 M18.8 5.2a9.5 9.5 0 0 1 0 13.6',
  alert: 'M12 4L2.8 19.5h18.4z M12 10v4.5 M12 17.2h.01',
  lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
  shield: 'M12 3l8 3v6c0 4.5-3.2 8-8 9c-4.8-1-8-4.5-8-9V6z',
  keyboard: 'M3 6.5h18v11H3z M6.5 10h.01 M10 10h.01 M13.5 10h.01 M17 10h.01 M7.5 14h9',
  thread: 'M4 5h16v10H9l-5 4z',
  filter: 'M4 5h16l-6.5 8v6l-3-1.5V13z',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z',
} as const;

export type MailIconName = keyof typeof ICONS;

const props = defineProps<{ name: MailIconName | string }>();
const path = computed(() => (ICONS as Record<string, string>)[props.name] ?? ICONS.dot);
</script>
