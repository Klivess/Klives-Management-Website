<template>
    <!-- Stored attachments sit behind auth, which an <img src> cannot send: they load as blobs. -->
    <span class="omni-media" :class="[state, { contain }]" :style="ratio ? { aspectRatio: ratio } : undefined">
        <img v-if="url" :src="url" :alt="alt" draggable="false" @error="onError" />
        <span v-else class="ph">{{ state === 'loading' ? '…' : fallback }}</span>
    </span>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { loadMediaUrl } from '~/composables/useOmniTumblr';
import { omniMediaPath } from '~/scripts/omniscience/api';

/**
 * One stored attachment, as its thumbnail or the file itself. A file that is not stored (not
 * downloaded yet, expired at the source, not an image) says so instead of showing a broken image.
 */
const props = withDefaults(defineProps<{
    attachmentId: string | null;
    /** The stored file rather than its thumbnail. */
    full?: boolean;
    alt?: string;
    /** CSS aspect-ratio, e.g. "1 / 1"; reserves the space before the image arrives. */
    ratio?: string;
    fallback?: string;
    contain?: boolean;
}>(), { full: false, alt: '', fallback: 'No image stored', contain: false });

const url = ref<string | null>(null);
const state = ref<'loading' | 'ready' | 'missing'>('loading');
let request = 0;

async function load() {
    const mine = ++request;
    if (!props.attachmentId) {
        url.value = null;
        state.value = 'missing';
        return;
    }
    if (!url.value) state.value = 'loading';
    const next = await loadMediaUrl(omniMediaPath(props.attachmentId, !props.full));
    if (mine !== request) return;
    url.value = next;
    state.value = next ? 'ready' : 'missing';
}

function onError() {
    url.value = null;
    state.value = 'missing';
}

watch(() => [props.attachmentId, props.full], load);
onMounted(load);
</script>

<style scoped>
.omni-media {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    min-height: 0;
    border-radius: var(--omni-radius-sm);
    background: var(--omni-surface-2);
}
.omni-media img { width: 100%; height: 100%; object-fit: cover; display: block; }
.omni-media.contain img { object-fit: contain; }
.omni-media .ph { padding: 8px; font-size: 11.5px; color: var(--omni-muted); text-align: center; }
</style>
