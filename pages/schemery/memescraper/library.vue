<template>
  <div></div>
</template>

<script setup lang="ts">
// The MemeScraper pages are one console now; old links and bookmarks land on its Library view.
const route = useRoute();
await navigateTo({ path: '/schemery/memescraper', query: { ...route.query, view: 'library' } }, { replace: true });
</script>
