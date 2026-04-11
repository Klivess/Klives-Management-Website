<template>
    <div class="legacy-shell">
        <section class="legacy-card panel">
            <div class="eyebrow">KLIVECHAT / LEGACY ROUTE</div>
            <h1>Redirecting to the shared room deck</h1>
            <p>This older entry point now forwards to the modern room UI so guest identity stays safe and the page can load reliably.</p>

            <button class="primary-button" type="button" @click="goToSharedRoom">OPEN ROOM</button>
        </section>
    </div>
</template>

<script setup>
definePageMeta({ layout: false });

import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

function goToSharedRoom() {
    router.replace(`/shared/klivechat/${route.params.id}`);
}

onMounted(() => {
    goToSharedRoom();
});
</script>

<style scoped>
.legacy-shell {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
    background:
        radial-gradient(circle at top left, rgba(77, 158, 57, 0.2), transparent 30%),
        linear-gradient(180deg, #08110b 0%, #040604 100%);
}

.legacy-card {
    width: min(640px, 100%);
    padding: 26px;
}

.legacy-card h1 {
    margin: 0;
    color: #f1fff0;
    font-size: clamp(1.8rem, 4vw, 3rem);
}

.legacy-card p {
    margin: 12px 0 18px;
    color: #9eb59b;
    line-height: 1.6;
}

.panel {
    background: rgba(7, 12, 9, 0.92);
    border: 1px solid rgba(77, 158, 57, 0.16);
    border-radius: 24px;
    box-shadow: 0 26px 64px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.04);
    backdrop-filter: blur(16px);
}

.eyebrow {
    color: #86c96d;
    font-size: 0.74rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    margin-bottom: 10px;
}

.primary-button {
    border: 1px solid transparent;
    border-radius: 16px;
    min-height: 44px;
    padding: 0 18px;
    font: inherit;
    cursor: pointer;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    background: linear-gradient(180deg, #4d9e39 0%, #2d6f20 100%);
    border-color: rgba(133, 222, 110, 0.42);
    color: #f3fff0;
    box-shadow: 0 12px 28px rgba(26, 74, 17, 0.28);
}

.primary-button:hover {
    transform: translateY(-1px);
}
</style>

