<template>
  <div></div>
</template>

<script setup lang="ts">
// Settings are a tab of the console now; old links open it there. The tab itself checks omnitumblr.settings.view.
definePageMeta({ layout: 'navbar' });

await navigateTo({ path: '/schemery/omnitumblr', query: { tab: 'settings' } }, { replace: true });
</script>
