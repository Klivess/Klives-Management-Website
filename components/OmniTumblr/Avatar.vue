<template>
    <!-- Decorative: the blog's name is always printed next to it. A deleted or renamed blog
         serves no avatar, so a monogram stands in rather than a broken-image icon. -->
    <span class="tb-avatar" :style="frame" aria-hidden="true">
        <img v-if="src && !failed" :src="src" alt="" loading="lazy" referrerpolicy="no-referrer" @error="failed = true" />
        <span v-else class="letter" :style="{ fontSize: `${Math.round(size * 0.45)}px` }">{{ initial }}</span>
    </span>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

const props = withDefaults(defineProps<{ src?: string | null; name: string; size?: number; round?: boolean }>(), { size: 40, round: false });

const failed = ref(false);
watch(() => props.src, () => { failed.value = false; });

const initial = computed(() => (props.name.replace(/^@/, '').charAt(0) || '?').toUpperCase());
const frame = computed(() => {
    let hash = 0;
    for (const c of props.name) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
    return {
        width: `${props.size}px`,
        height: `${props.size}px`,
        borderRadius: props.round ? '50%' : `${Math.max(4, Math.round(props.size / 5))}px`,
        background: !props.src || failed.value ? `hsl(${hash % 360} 38% 30%)` : 'var(--ot-surface-3)',
    };
});
</script>

<style scoped>
.tb-avatar { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; overflow: hidden; }
.tb-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.letter { color: rgba(255, 255, 255, 0.88); font-weight: 700; line-height: 1; }
</style>
