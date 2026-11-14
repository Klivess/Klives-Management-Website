<template>
  <div class="kgx-redirect" aria-busy="true"></div>
</template>

<script setup lang="ts">
/* Old links (/klivegames/<id>) open the server on the one KliveGames page. */
const route = useRoute();
await navigateTo({ path: '/klivegames', query: { s: String(route.params.id ?? '') } }, { replace: true });
</script>
