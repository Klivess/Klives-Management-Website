<template>
  <div></div>
</template>

<script setup lang="ts">
// The MemeScraper pages are one console now; the old Health page is its Activity view.
const route = useRoute();
await navigateTo({ path: '/schemery/memescraper', query: { ...route.query, view: 'activity' } }, { replace: true });
</script>
