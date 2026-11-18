<template>
  <!-- Previews come from authenticated routes, so they are fetched as blobs (the URL carries the post's
       version, so the browser may keep them) and shown through object URLs. -->
  <span class="tmb-thumb" :data-size="size" :title="title">
    <img v-if="url" :src="url" :alt="alt" draggable="false" />
    <TumblrIcon v-else :name="glyph" :style="{ fontSize: size === 'xs' ? '14px' : size === 'sm' ? '17px' : '26px' }" />
    <span v-if="badge" class="tmb-thumb__badge">{{ badge }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { loadMediaUrl } from '~/composables/useOmniTumblr';

const props = withDefaults(defineProps<{
  path?: string | null;
  kind?: string | null;
  badge?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'fill';
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

const glyph = computed(() => ({ Video: 'video', Photo: 'image', Link: 'link', Text: 'text', Reblog: 'reblog' } as Record<string, string>)[props.kind ?? ''] ?? 'image');
</script>
