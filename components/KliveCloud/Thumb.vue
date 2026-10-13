<template>
    <span ref="root" class="kct" :class="{ ready, cover: fill }">
        <KliveCloudFileGlyph v-if="!ready" :kind="kind" :size="glyph" />
        <img v-if="src" :src="src" alt="" draggable="false" decoding="async" @load="settle(true)" @error="settle(false)" />
        <span v-if="ready && kind === 'video'" class="kct-play"><KliveCloudIcon name="play" :size="fill ? 16 : 7" /></span>
    </span>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { FileKind } from '~/scripts/klivecloud/shared';
import { requestThumbSlot } from '~/scripts/klivecloud/thumbs';

/* A thumbnail that loads once it is near the screen, a few at a time; until then (or if there
   isn't one) the file's glyph. */
const props = withDefaults(defineProps<{
    kind: FileKind;
    /** Null when the file has no thumbnail. */
    url: string | null;
    glyph?: number;
    /** Fill the box (grid tiles) rather than sit in it. */
    fill?: boolean;
}>(), { glyph: 28, fill: false });

const root = ref<HTMLElement | null>(null);
const src = ref('');
const ready = ref(false);
let observer: IntersectionObserver | null = null;
let cancel: (() => void) | null = null;

function settle(ok: boolean) {
    ready.value = ok;
    cancel?.();
    cancel = null;
}

onMounted(() => {
    if (!props.url || !root.value) return;
    const url = props.url;
    observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer?.disconnect();
        observer = null;
        cancel = requestThumbSlot(() => { src.value = url; });
    }, { rootMargin: '300px' });
    observer.observe(root.value);
});

onBeforeUnmount(() => {
    observer?.disconnect();
    cancel?.();
});
</script>

<style scoped>
.kct {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    overflow: hidden;
}
.kct img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0;
    transition: opacity var(--ot-normal);
}
.kct.ready img { opacity: 1; }
/* Small: a corner badge on a list thumbnail. Over a grid tile: centred. */
.kct-play {
    position: absolute;
    right: 2px;
    bottom: 2px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 13px;
    height: 13px;
    padding-left: 1px;
    border-radius: 50%;
    background: rgba(8, 10, 7, 0.72);
    color: #fff;
}
.kct.cover .kct-play {
    right: auto;
    bottom: auto;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 38px;
    height: 38px;
    padding-left: 3px;
    background: rgba(8, 10, 7, 0.58);
    backdrop-filter: blur(4px);
}
</style>
