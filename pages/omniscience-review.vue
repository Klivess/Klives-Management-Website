<template>
    <div></div>
</template>

<script setup lang="ts">
// The review queue is a view of the Omniscience console now; links to the old page keep working.
await navigateTo({ path: '/omniscience', query: { view: 'review' } }, { replace: true });
</script>
