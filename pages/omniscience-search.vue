<template>
    <div></div>
</template>

<script setup lang="ts">
// Search and Q&A are the Ask view of the Omniscience console now; links to the old page keep working.
const route = useRoute();
const q = String(route.query.q ?? '');
await navigateTo({ path: '/omniscience', query: { view: 'ask', ...(route.query.mode === 'ask' ? { mode: 'ask' } : {}), ...(q ? { q } : {}) } }, { replace: true });
</script>
