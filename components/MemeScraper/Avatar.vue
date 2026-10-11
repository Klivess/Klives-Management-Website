<template>
    <!-- Instagram's CDN links expire, so a broken picture falls back to the account's initial. -->
    <span class="ms-avatar" :style="size ? { width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.42)}px` } : undefined" aria-hidden="true">
        <img v-if="src && !failed" :src="src" alt="" referrerpolicy="no-referrer" loading="lazy" @error="failed = true" />
        <template v-else>{{ initial }}</template>
    </span>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

const props = defineProps<{ src?: string | null; name: string; size?: number }>();
const failed = ref(false);
watch(() => props.src, () => { failed.value = false; });
const initial = computed(() => (props.name.replace(/^@/, '')[0] ?? '?').toUpperCase());
</script>

<style scoped>
.ms-avatar {
    width: 28px; height: 28px; border-radius: 50%; flex: 0 0 auto; display: grid; place-items: center;
    background: var(--ot-surface-3); color: var(--ot-text-2); font-size: 12px; font-weight: 700; overflow: hidden;
    border: 1px solid var(--ot-line);
}
.ms-avatar img { width: 100%; height: 100%; object-fit: cover; }
</style>
