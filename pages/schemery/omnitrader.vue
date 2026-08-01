<template>
    <div class="redirect-shell">
        <p>Opening the OmniTrader trading OS…</p>
    </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';

// The single-page OmniTrader dashboard was replaced by the ten-page operating system at
// /omnitrader. This route stays so existing links, bookmarks and the scheme cards keep working.
definePageMeta({ layout: 'empty' });

const router = useRouter();
onMounted(() => router.replace('/omnitrader'));
</script>

<style scoped>
.redirect-shell {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #8fa389;
    background: #0c0e0b;
    font-size: 14px;
}
</style>
