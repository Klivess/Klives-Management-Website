<template>
    <!-- OmniBlox images sit behind auth, which an <img src> cannot send: they load as blobs. -->
    <div class="bx-img" :class="[state, { contain }]" :style="ratio ? { aspectRatio: ratio } : undefined">
        <img v-if="url" :src="url" :alt="alt" draggable="false" @error="onError" />
        <span v-else-if="state === 'missing'" class="ph">{{ fallback }}</span>
    </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { loadMediaUrl } from '~/composables/useOmniTumblr';

const props = withDefaults(defineProps<{
    path: string | null;
    alt?: string;
    /** CSS aspect-ratio, e.g. "16 / 9"; reserves the space before the image arrives. */
    ratio?: string;
    fallback?: string;
    contain?: boolean;
}>(), { alt: '', fallback: 'No image yet', contain: false });

const url = ref<string | null>(null);
const state = ref<'loading' | 'ready' | 'missing'>('loading');
let request = 0;

async function load() {
    const mine = ++request;
    if (!props.path) {
        url.value = null;
        state.value = 'missing';
        return;
    }
    // Keep the previous picture up while the next one loads (switching render views).
    if (!url.value) state.value = 'loading';
    const next = await loadMediaUrl(props.path);
    if (mine !== request) return;
    url.value = next;
    state.value = next ? 'ready' : 'missing';
}

function onError() {
    url.value = null;
    state.value = 'missing';
}

watch(() => props.path, load);
onMounted(load);
</script>

<style scoped>
.bx-img {
    position: relative;
    overflow: hidden;
    border-radius: var(--ot-radius-sm);
    background: var(--ot-surface-2);
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
}
.bx-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.bx-img.contain img { object-fit: contain; }
.bx-img.loading::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.05), transparent);
    animation: bx-shimmer 1.2s infinite;
}
.ph { font-size: 11.5px; color: var(--ot-muted); padding: var(--ot-space-2); text-align: center; }
@keyframes bx-shimmer { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
</style>
