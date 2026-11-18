<template>
  <!-- Decorative: the blog's name is always printed beside it. A blog Tumblr no longer serves an avatar
       for gets a monogram rather than a broken image. -->
  <span class="tmb-avatar" :style="frame" aria-hidden="true">
    <img v-if="src && !failed" :src="src" alt="" loading="lazy" referrerpolicy="no-referrer" @error="failed = true" />
    <span v-else :style="{ fontSize: `${Math.round(size * 0.46)}px` }">{{ initial }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

const props = withDefaults(defineProps<{ src?: string | null; name: string; size?: number }>(), { size: 28 });
const failed = ref(false);
watch(() => props.src, () => { failed.value = false; });

const initial = computed(() => (props.name.replace(/^@/, '').charAt(0) || '?').toUpperCase());
const frame = computed(() => {
  let hash = 0;
  for (const c of props.name) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return {
    width: `${props.size}px`,
    height: `${props.size}px`,
    borderRadius: `${Math.max(6, Math.round(props.size / 3.4))}px`,
    background: !props.src || failed.value ? `linear-gradient(150deg, hsl(${hash % 360} 45% 38%), hsl(${(hash + 50) % 360} 40% 22%))` : 'var(--tmb-surface-3)',
  };
});
</script>
