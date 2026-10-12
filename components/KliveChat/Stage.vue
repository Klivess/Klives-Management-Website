<template>
    <div ref="stage" class="kc-stage" :class="{ presenting: !!focus, narrow }">
        <template v-if="focus">
            <div class="kc-focus">
                <KliveChatTile :tile="focus" pinned :show-stats="showStats" @pin="$emit('pin', null)" />
            </div>
            <div v-if="others.length" class="kc-strip">
                <KliveChatTile v-for="tile in others" :key="tile.key" :tile="tile" compact :show-stats="showStats" class="kc-strip-tile" @pin="$emit('pin', tile.key)" />
            </div>
        </template>
        <div v-else class="kc-grid" :style="{ gap: `${GAP}px` }">
            <KliveChatTile v-for="tile in tiles" :key="tile.key" :tile="tile" :show-stats="showStats"
                           :style="{ width: `${layout.width}px`, height: `${layout.height}px` }" @pin="$emit('pin', tile.key)" />
        </div>
        <slot />
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { TileModel } from './Tile.vue';

const props = withDefaults(defineProps<{ tiles: TileModel[]; focusKey?: string | null; showStats?: boolean }>(), {
    focusKey: null,
    showStats: false,
});
defineEmits<{ pin: [key: string | null] }>();

const GAP = 10;
const ASPECT = 16 / 9;

const stage = ref<HTMLElement | null>(null);
const size = ref({ width: 960, height: 540 });
const narrow = computed(() => size.value.width < 720);

const focus = computed(() => (props.focusKey ? props.tiles.find(t => t.key === props.focusKey) ?? null : null));
const others = computed(() => props.tiles.filter(t => t.key !== props.focusKey));

/** The column count that gives the biggest 16:9 tiles without scrolling. */
const layout = computed(() => {
    const n = Math.max(1, props.tiles.length);
    const width = Math.max(0, size.value.width);
    const height = Math.max(0, size.value.height);
    let best = { width: 0, height: 0 };
    for (let cols = 1; cols <= n; cols++) {
        const rows = Math.ceil(n / cols);
        const maxWidth = (width - GAP * (cols - 1)) / cols;
        const maxHeight = (height - GAP * (rows - 1)) / rows;
        const tileWidth = Math.floor(Math.min(maxWidth, maxHeight * ASPECT));
        if (tileWidth > best.width) best = { width: tileWidth, height: Math.floor(tileWidth / ASPECT) };
    }
    return best;
});

let observer: ResizeObserver | null = null;
onMounted(() => {
    if (!stage.value) return;
    const measure = () => {
        const rect = stage.value!.getBoundingClientRect();
        size.value = { width: rect.width, height: rect.height };
    };
    measure();
    observer = new ResizeObserver(measure);
    observer.observe(stage.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<style scoped>
.kc-stage { position: relative; width: 100%; height: 100%; min-height: 0; }
.kc-grid {
    width: 100%;
    height: 100%;
    display: flex;
    flex-wrap: wrap;
    align-content: center;
    justify-content: center;
}
.kc-stage.presenting { display: grid; grid-template-columns: minmax(0, 1fr) 232px; gap: 10px; }
.kc-focus { min-width: 0; min-height: 0; display: flex; }
.kc-focus > * { flex: 1 1 auto; }
.kc-strip { display: flex; flex-direction: column; gap: 10px; overflow-y: auto; min-height: 0; scrollbar-width: thin; }
.kc-strip-tile { flex: 0 0 auto; aspect-ratio: 16 / 9; width: 100%; }
.kc-stage.presenting.narrow { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) 96px; }
.kc-stage.presenting.narrow .kc-strip { flex-direction: row; overflow-x: auto; overflow-y: hidden; }
.kc-stage.presenting.narrow .kc-strip-tile { height: 100%; width: auto; }
</style>
