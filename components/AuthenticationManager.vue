<template>
    <div aria-hidden="true" style="display: none;"></div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from '#imports';
import { StartAuthSessionWatch, StopAuthSessionWatch, VerifyLogin } from '~/scripts/APIInterface';

const route = useRoute();

async function syncAuthSession(path: string) {
    if (!process.client) {
        return;
    }

    if (path === '/' || path.includes('/shared/')) {
        StopAuthSessionWatch();
        return;
    }

    await VerifyLogin();
    StartAuthSessionWatch(path);
}

watch(() => route.path, (path) => {
    syncAuthSession(path);
}, { immediate: true });

onMounted(() => {
    syncAuthSession(route.path);
});

onUnmounted(() => {
    StopAuthSessionWatch();
});
</script>