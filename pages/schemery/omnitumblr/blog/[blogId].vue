<template>
  <div></div>
</template>

<script setup lang="ts">
// A blog is now a view inside the console (/schemery/omnitumblr?blog=…); old links land there.
definePageMeta({ layout: 'navbar' });

const route = useRoute();
const OLD_TABS: Record<string, string> = { overview: 'queue', queue: 'queue', published: 'published', analytics: 'analytics', reach: 'reach', strategy: 'strategy', activity: 'activity' };
const tab = OLD_TABS[String(route.query.tab ?? 'overview')] ?? 'queue';
await navigateTo({ path: '/schemery/omnitumblr', query: { blog: String(route.params.blogId), ...(tab === 'queue' ? {} : { tab }) } }, { replace: true });
</script>
