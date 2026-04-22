
<script setup lang="ts">
import { KliveAPIUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

const route = useRoute();

const pageTitle = computed(() => {
  if (route.path === '/') {
    return 'Klives Management';
  }

  const normalizedName = String(route.name ?? '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const fallbackPath = route.path
    .replace(/^\/+|\/+$/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const source = normalizedName || fallbackPath || 'Dashboard';
  const formattedPageName = source
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return `KM: ${formattedPageName}`;
});

useHead(() => ({
  title: pageTitle.value,
}));

</script>

<template>
  <NuxtLoadingIndicator />
    <NuxtLayout>
      <AuthenticationManager />
      <NuxtPage/>
    </NuxtLayout>
</template>

<style>
.page-enter-active,
.page-leave-active {
  transition: all 0.1s;
}

.page-enter-from,
.page-leave-to {
  opacity: 0;
  filter: blur(1rem);
}

.layout-enter-active,
.layout-leave-active {
  transition: all 0.1s;
}
.layout-enter-from,
.layout-leave-to {
  filter: grayscale(1);
  opacity: 0;
  filter: blur(1rem);
}
</style>