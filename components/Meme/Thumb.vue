<template>
  <span ref="root" class="msx-thumb-host">
    <img v-if="url" class="msx-thumb msx-fade" :src="url" alt="" draggable="false" />
    <span v-else class="msx-thumb msx-thumb--ph" :class="{ 'msx-skel': state === 'loading' }" :style="{ '--hue': hue }">
      <MemeIcon v-if="state === 'none'" name="film" />
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useMemeConsole } from '~/composables/useMemeConsole';
import { msAvatarHue } from '~/scripts/memeConsole';

/**
 * A reel's thumbnail, fetched (with the Authorization header) only once it is near the screen.
 * The console queues these: at most four in flight, the most recently wanted first.
 */
const props = defineProps<{ postId: string }>();
const c = useMemeConsole();
const root = ref<HTMLElement | null>(null);
const url = ref<string | null>(null);
const state = ref<'waiting' | 'loading' | 'none'>('waiting');
const hue = computed(() => msAvatarHue(props.postId));
let cancel: (() => void) | null = null;
let observer: IntersectionObserver | null = null;

function want() {
  if (cancel || url.value) return;
  state.value = 'loading';
  const id = props.postId;
  cancel = c.thumbs.request(id, got => {
    if (id !== props.postId) return;
    cancel = null;
    url.value = got;
    state.value = got ? 'waiting' : 'none';
  });
}

function stop() {
  cancel?.();
  cancel = null;
  if (!url.value) state.value = 'waiting';
}

onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') { want(); return; }
  observer = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (e.isIntersecting) want();
      else if (!url.value) stop();
    }
  }, { rootMargin: '240px 240px' });
  if (root.value) observer.observe(root.value);
});

watch(() => props.postId, () => {
  stop();
  url.value = null;
  state.value = 'waiting';
  if (root.value && observer) { observer.unobserve(root.value); observer.observe(root.value); }
});

onBeforeUnmount(() => {
  observer?.disconnect();
  stop();
});
</script>

<style scoped>
.msx-thumb-host { position: absolute; inset: 0; display: block; }
</style>
