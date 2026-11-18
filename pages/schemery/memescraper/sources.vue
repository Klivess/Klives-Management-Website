<template>
  <div></div>
</template>

<script setup lang="ts">
// The MemeScraper pages are one console now; old links and bookmarks land on its Sources view.
const route = useRoute();
await navigateTo({ path: '/schemery/memescraper', query: { ...route.query, view: 'sources' } }, { replace: true });
</script>
