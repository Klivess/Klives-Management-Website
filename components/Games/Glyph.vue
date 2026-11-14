<template>
  <span class="kgx-glyph" :data-size="size ?? 'md'" :style="{ '--g': meta.accent }" :title="meta.label" :aria-label="meta.label" role="img">
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <!-- A block, seen from a corner. -->
      <template v-if="meta.glyph === 'cube'">
        <path class="kgx-glyph__top" d="M16 5l10 5.5-10 5.5-10-5.5z" />
        <path class="kgx-glyph__left" d="M6 10.5l10 5.5v11L6 21.5z" />
        <path class="kgx-glyph__right" d="M26 10.5l-10 5.5v11l10-5.5z" />
      </template>
      <!-- A tree: three tiers and a trunk. -->
      <template v-else-if="meta.glyph === 'tree'">
        <path class="kgx-glyph__top" d="M16 4l6 7h-12z" />
        <path class="kgx-glyph__left" d="M16 9l8 9H8z" />
        <path class="kgx-glyph__right" d="M14.5 18h3v8h-3z" />
      </template>
      <!-- A hex nut. -->
      <template v-else>
        <path class="kgx-glyph__left" d="M16 4l10.4 6v12L16 28 5.6 22V10z" />
        <circle class="kgx-glyph__hole" cx="16" cy="16" r="4.6" />
      </template>
    </svg>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { kgGame } from '~/scripts/kliveGames';

/** Which game a server runs, as a small drawn mark in that game's colour (no logos). */
const props = defineProps<{ game: string; size?: 'sm' | 'md' | 'lg' }>();
const meta = computed(() => kgGame(props.game));
</script>
