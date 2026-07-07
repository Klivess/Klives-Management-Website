<template>
  <div class="artifact">
    <div v-if="loading" class="art-skeleton">loading…</div>
    <div v-else-if="degraded" class="art-degraded">
      <span class="art-icon">🗄️</span>
      <div>
        <div class="art-deg-title">Raw image expired (48h retention)</div>
        <div class="art-deg-desc">{{ description || 'The capture-time description is the permanent record.' }}</div>
      </div>
    </div>
    <div v-else-if="error" class="art-error">Could not load artifact.</div>
    <a v-else-if="src" :href="src" target="_blank" class="art-link">
      <img :src="src" :alt="description" class="art-img" />
    </a>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';

const props = defineProps<{ projectId: string; artifactId: string }>();

const src = ref('');
const loading = ref(true);
const error = ref(false);
const degraded = ref(false);
const description = ref('');
let objectUrl = '';

async function load() {
  cleanup();
  loading.value = true;
  error.value = false;
  degraded.value = false;
  try {
    const res = await RequestGETFromKliveAPI(
      `/projects/artifacts/get?projectID=${props.projectId}&artifactID=${props.artifactId}`, false, false);
    if (res.status === 410) {
      // Past 48h raw retention — the JSON body carries the permanent description.
      try { const j = await res.json(); description.value = j.description || ''; } catch { /* ignore */ }
      degraded.value = true;
      return;
    }
    if (!res.ok) { error.value = true; return; }
    const blob = await res.blob();
    objectUrl = URL.createObjectURL(blob);
    src.value = objectUrl;
  } catch { error.value = true; }
  finally { loading.value = false; }
}

function cleanup() { if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = ''; } src.value = ''; }

watch(() => [props.projectId, props.artifactId], load, { immediate: true });
onBeforeUnmount(cleanup);
</script>

<style scoped>
.artifact { margin-top: 8px; }
.art-img { max-width: 100%; border-radius: 6px; border: 1px solid #2a2a2e; display: block; }
.art-link { display: inline-block; }
.art-skeleton { padding: 24px; text-align: center; color: #666; background: #16161a; border-radius: 6px; font-size: 12px; }
.art-error { padding: 12px; color: #ff8484; font-size: 12px; }
.art-degraded { display: flex; gap: 10px; align-items: flex-start; padding: 12px; background: #16161a; border: 1px dashed #333; border-radius: 6px; }
.art-icon { font-size: 20px; }
.art-deg-title { font-size: 12px; color: #b7a98a; font-weight: 600; }
.art-deg-desc { font-size: 12px; color: #999; margin-top: 2px; }
</style>
