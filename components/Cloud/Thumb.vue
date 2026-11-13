<template>
    <span ref="root" class="kcl-thumb" :class="{ 'kcl-thumb--fill': fill }" :data-ready="!!src" :style="fill ? undefined : { '--s': `${size}px` }">
        <CloudGlyph :kind="item.kind" :size="fill ? glyph : size" />
        <img v-if="src" :src="src" alt="" draggable="false" decoding="async" />
        <span v-if="src && item.kind === 'video'" class="kcl-thumb__play"><KliveCloudIcon name="play" :size="fill ? 16 : 7" /></span>
    </span>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { hasThumbnail, type FileKind, type ItemType } from '~/scripts/klivecloud/shared';
import { loadThumb, readyThumb } from '~/scripts/klivecloud/ownerThumbs';

/* A file's thumbnail once it is near the screen (a few load at a time); until then, or if it has
   none, its kind's glyph. */
const props = withDefaults(defineProps<{
    item: { id: string; kind: FileKind; type: ItemType; ext: string };
    size?: number;
    /** Fill the box (grid tiles, the details sheet) rather than sit in it. */
    fill?: boolean;
    glyph?: number;
    /** Bigger pictures for big boxes. */
    resolution?: number;
}>(), { size: 28, fill: false, glyph: 48, resolution: 300 });

const root = ref<HTMLElement | null>(null);
const src = ref<string | null>(null);
let observer: IntersectionObserver | null = null;

function begin() {
    observer?.disconnect();
    observer = null;
    src.value = null;
    if (!hasThumbnail(props.item)) return;
    const have = readyThumb(props.item.id, props.resolution);
    if (have) { src.value = have; return; }
    if (!root.value) return;
    const id = props.item.id;
    observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer?.disconnect();
        observer = null;
        void loadThumb(id, props.resolution).then(url => { if (url && props.item.id === id) src.value = url; });
    }, { rootMargin: '400px' });
    observer.observe(root.value);
}

onMounted(begin);
watch(() => props.item.id, begin);
onBeforeUnmount(() => observer?.disconnect());
</script>
