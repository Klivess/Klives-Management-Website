<template>
  <section class="hom-pages" aria-label="Every page" data-testid="home-pages">
    <button class="hom-pages__toggle" :aria-expanded="open" data-testid="pages-toggle" @click="emit('toggle')">
      <HomeIcon :name="open ? 'chevron-down' : 'chevron-right'" />
      Every page
      <span class="hom-dim">{{ total }}</span>
    </button>
    <div v-if="open" class="hom-pages__groups">
      <div v-for="group in groups" :key="group.name" class="hom-pages__group">
        <h3 class="hom-pages__title">{{ group.name }}</h3>
        <NuxtLink v-for="page in group.pages" :key="page.path" class="hom-pages__item" :to="page.path">
          <HomeIcon :name="page.icon" />
          <span class="hom-pages__name">{{ page.label }}</span>
          <span class="hom-pages__about">{{ page.about }}</span>
        </NuxtLink>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { PAGE_GROUPS, type HomePage } from '~/scripts/home';

const props = defineProps<{ pages: HomePage[]; open: boolean }>();
const emit = defineEmits<{ toggle: [] }>();

const groups = computed(() => PAGE_GROUPS
  .map(name => ({ name, pages: props.pages.filter(page => page.group === name) }))
  .filter(group => group.pages.length));
const total = computed(() => props.pages.length);
</script>
