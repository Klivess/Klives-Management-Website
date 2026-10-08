<template>
    <!-- Previews come from authenticated routes, so they are fetched as blobs rather than via src. -->
    <div class="tb-thumb" :class="[size, { loaded: !!url }]" :title="title">
        <img v-if="url" :src="url" :alt="alt" draggable="false" />
        <span v-else class="ph" aria-hidden="true">{{ glyph }}</span>
        <span v-if="badge" class="badge">{{ badge }}</span>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { loadMediaUrl, type PostKind } from '~/composables/useOmniTumblr';

const props = withDefaults(defineProps<{
    /** A media route path (postThumbPath / contentThumbPath), or null for a placeholder. */
    path?: string | null;
    kind?: PostKind | string | null;
    badge?: string | null;
    size?: 'xs' | 'sm' | 'md' | 'lg';
    alt?: string;
    title?: string;
}>(), { size: 'sm', alt: '' });

const url = ref<string | null>(null);

watch(() => props.path, async path => {
    url.value = null;
    if (!path) return;
    const loaded = await loadMediaUrl(path);
    if (props.path === path) url.value = loaded;
}, { immediate: true });

const glyph = computed(() => {
    switch (props.kind) {
        case 'Video': return '▶';
        case 'Photo': return '◩';
        case 'Link': return '⌁';
        case 'Text': return '¶';
        default: return '○';
    }
});
</script>

<style scoped>
.tb-thumb {
    position: relative;
    flex: 0 0 auto;
    overflow: hidden;
    border-radius: var(--ot-radius-sm);
    background: var(--ot-surface-3);
    border: 1px solid var(--ot-line);
    display: grid;
    place-items: center;
}
.tb-thumb.xs { width: 36px; height: 36px; }
.tb-thumb.sm { width: 56px; height: 56px; }
.tb-thumb.md { width: 96px; height: 96px; }
.tb-thumb.lg { width: 100%; aspect-ratio: 9 / 12; max-height: 420px; }
/* Absolutely placed: the lg box's height comes from aspect-ratio + max-height, which a
   percentage height on an in-flow child cannot resolve against (the image overflowed). */
.tb-thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.tb-thumb.lg img { object-fit: contain; background: #000; }
.ph { color: var(--ot-muted); font-size: 18px; }
.lg .ph { font-size: 34px; }
.badge {
    position: absolute;
    right: 3px;
    bottom: 3px;
    padding: 0 4px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.72);
    color: #fff;
    font-size: 10px;
    line-height: 15px;
    font-family: var(--ot-mono);
}
</style>
