<template>
  <nav class="hom-jump" aria-label="Jump back in" data-testid="home-jump">
    <span class="hom-jump__label">{{ fromHistory ? 'Jump back in' : 'Go to' }}</span>
    <NuxtLink
      v-for="(page, index) in pages"
      :key="page.path"
      class="hom-jump__item"
      :to="page.path"
      :title="page.about"
      :aria-keyshortcuts="index < 9 ? String(index + 1) : undefined"
      :data-testid="`jump-${page.path}`"
    >
      <HomeIcon :name="page.icon" />
      <span>{{ page.label }}</span>
      <span v-if="index < 9" class="hom-jump__key" aria-hidden="true">{{ index + 1 }}</span>
    </NuxtLink>
  </nav>
</template>

<script setup lang="ts">
import type { HomePage } from '~/scripts/home';

/* The pages this browser opens most, newest habits first; number keys open the first nine. */
defineProps<{ pages: HomePage[]; fromHistory: boolean }>();
</script>
