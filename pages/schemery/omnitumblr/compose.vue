<template>
  <div></div>
</template>

<script setup lang="ts">
// Composing is a sheet inside the console now; old links open it there.
definePageMeta({ layout: 'navbar' });

const route = useRoute();
await navigateTo({ path: '/schemery/omnitumblr', query: { compose: '1', ...(route.query.blog ? { blog: String(route.query.blog) } : {}) } }, { replace: true });
</script>
