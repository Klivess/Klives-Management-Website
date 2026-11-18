<template>
  <!-- OmniBlox pictures sit behind auth, which an <img src> cannot send: they load as blobs. -->
  <div ref="root" class="obx-img" :data-state="state" :data-contain="contain || undefined" :style="ratio ? { aspectRatio: ratio } : undefined">
    <img v-if="url" :src="url" :alt="alt" draggable="false" @error="onError" />
    <span v-else-if="state === 'missing'" class="obx-img__ph">{{ fallback }}</span>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { loadMediaUrl } from '~/composables/useOmniTumblr';

/**
 * An authenticated picture, loaded when it scrolls into view and through a small queue. The Assets page
 * used to start 60 fetches at once (asset/image peaked at 106 in flight): each took 1.6 s to arrive while
 * they shared the line, so the first rows came last. Six at a time, nearest first, the top row lands at once.
 */
const props = withDefaults(defineProps<{
  path: string | null;
  alt?: string;
  ratio?: string;
  fallback?: string;
  contain?: boolean;
  /** Load at once (a hero picture) rather than when it scrolls into view. */
  eager?: boolean;
}>(), { alt: '', fallback: 'No picture yet', contain: false, eager: false });

const root = ref<HTMLElement | null>(null);
const url = ref<string | null>(null);
const state = ref<'loading' | 'ready' | 'missing'>('loading');
let request = 0;
let observer: IntersectionObserver | null = null;
let visible = false;

async function load() {
  const mine = ++request;
  if (!props.path) { url.value = null; state.value = 'missing'; return; }
  if (!url.value) state.value = 'loading';
  const next = await queued(props.path);
  if (mine !== request) return;
  url.value = next;
  state.value = next ? 'ready' : 'missing';
}

function onError() { url.value = null; state.value = 'missing'; }

watch(() => props.path, () => { if (visible || props.eager) void load(); });

onMounted(() => {
  if (props.eager || typeof IntersectionObserver === 'undefined') { visible = true; void load(); return; }
  observer = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting) && !visible) {
      visible = true;
      observer?.disconnect();
      void load();
    }
  }, { rootMargin: '240px' });
  if (root.value) observer.observe(root.value);
});
onBeforeUnmount(() => { observer?.disconnect(); request++; });
</script>

<script lang="ts">
const LIMIT = 6;
let active = 0;
const waiting: (() => void)[] = [];

/** loadMediaUrl, at most LIMIT at a time (cached results come straight back). */
function queued(path: string): Promise<string | null> {
  return new Promise(resolve => {
    const start = () => {
      active++;
      loadMediaUrl(path).then(resolve, () => resolve(null)).finally(() => {
        active--;
        waiting.shift()?.();
      });
    };
    if (active < LIMIT) start(); else waiting.push(start);
  });
}
</script>
