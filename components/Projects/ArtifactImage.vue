<template>
  <div class="artifact">
    <!-- The skeleton reserves the thumbnail's footprint: a placeholder that grew from one line to
         180px on load is what shoved the conversation out from under the reader. -->
    <div v-if="loading" class="art-skeleton" :class="{ 'art-skeleton-thumb': thumb }">loading…</div>
    <div v-else-if="degraded" class="art-degraded">
      <span class="art-icon">🗄️</span>
      <div>
        <div class="art-deg-title">Raw image expired (48h retention)</div>
        <div class="art-deg-desc">{{ description || 'The capture-time description is the permanent record.' }}</div>
      </div>
    </div>
    <div v-else-if="error" class="art-error">Could not load artifact.</div>
    <a v-else-if="src" :href="src" target="_blank" class="art-link" :title="description || 'Open full size'">
      <img :src="src" :alt="description" class="art-img" :class="{ 'art-thumb': thumb }" />
      <span v-if="thumb" class="art-expand">⤢ full size</span>
    </a>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';

// `thumb` caps the render height: a desktop screenshot is 1080px tall and would otherwise push a
// whole screen of conversation out of view for one tool result. The link still opens full size.
const props = withDefaults(
  defineProps<{ projectId: string; artifactId: string; thumb?: boolean }>(),
  { thumb: false });

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
/* Screenshots are landscape and tall; cap the height and letterbox rather than scaling the width
   down to a stamp, so the thumbnail is still readable at a glance. */
.art-thumb { max-height: 180px; width: auto; object-fit: contain; object-position: left top; }
.art-link { display: inline-block; position: relative; max-width: 100%; }
.art-expand { position: absolute; right: 6px; bottom: 6px; font-size: 10px; color: #ddd; background: rgba(0, 0, 0, 0.6); border-radius: 4px; padding: 2px 6px; opacity: 0; transition: opacity 0.12s; }
.art-link:hover .art-expand { opacity: 1; }
.art-skeleton { padding: 24px; text-align: center; color: #666; background: #16161a; border-radius: 6px; font-size: 12px; }
/* 16:9 of the 180px cap — the size a desktop screenshot resolves to, so the row barely moves. */
.art-skeleton-thumb { display: flex; align-items: center; justify-content: center; width: 320px; max-width: 100%; height: 180px; padding: 0; }
.art-error { padding: 12px; color: #ff8484; font-size: 12px; }
.art-degraded { display: flex; gap: 10px; align-items: flex-start; padding: 12px; background: #16161a; border: 1px dashed #333; border-radius: 6px; }
.art-icon { font-size: 20px; }
.art-deg-title { font-size: 12px; color: #b7a98a; font-weight: 600; }
.art-deg-desc { font-size: 12px; color: #999; margin-top: 2px; }
</style>
