<template>
    <div></div>
</template>

<script setup lang="ts">
// Old room links (/klivechat/<id>) open the room at its current address.
definePageMeta({ layout: false });

const route = useRoute();
await navigateTo(`/shared/klivechat/${encodeURIComponent(String(route.params.id ?? ''))}`, { replace: true, redirectCode: 301 });
</script>
