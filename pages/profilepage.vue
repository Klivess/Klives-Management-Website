<!-- Retired: profiles are managed in the profile console; your own lives at /account. -->
<template>
    <div></div>
</template>

<script setup lang="ts">
definePageMeta({
    redirect: to => (typeof to.query.userID === 'string' && to.query.userID
        ? `/administration/profiles/${encodeURIComponent(to.query.userID)}`
        : '/account'),
});
</script>
