<template>
  <div class="obx-split obx-split--files">
    <section class="obx-card" aria-label="Workspace">
      <header class="obx-card__head"><h2 class="obx-card__title"><ObxIcon name="file" />Workspace</h2><span class="obx-card__meta">{{ files ? `${files.length} files · r${revision}` : '' }}</span></header>
      <div class="obx-card__body obx-stack" style="gap: 6px">
        <label class="obx-field"><ObxIcon name="search" /><input v-model="filter" placeholder="Filter files" aria-label="Filter files" /></label>
        <div v-if="error" class="obx-banner" data-tone="crit"><span class="obx-banner__text"><span>{{ error }}</span></span></div>
        <div v-else-if="!files" class="obx-skel" style="height: 200px"></div>
        <ul v-else role="listbox" aria-label="Files" style="max-height: 560px; overflow-y: auto">
          <li v-for="f in shownFiles" :key="f.Path">
            <button class="obx-rail__link" style="width: 100%" role="option" :aria-selected="selected === f.Path" :aria-current="selected === f.Path ? 'page' : undefined" @click="open(f.Path)">
              <span class="obx-mono obx-truncate" style="flex: 1" :title="f.Path">{{ f.Path }}</span>
              <span class="obx-faint" style="font-size: 10.5px">{{ bloxBytes(f.Bytes) }}</span>
            </button>
          </li>
          <li v-if="!shownFiles.length" class="obx-empty">No file matches.</li>
        </ul>
      </div>
    </section>
    <section class="obx-card" aria-label="File">
      <header class="obx-card__head">
        <h2 class="obx-card__title obx-mono" style="font-weight: 500">{{ selected ?? 'File' }}</h2>
        <span v-if="content != null" class="obx-card__meta">{{ lineCount }} lines</span>
        <div v-if="content != null" class="obx-card__tools"><button class="obx-btn obx-btn--xs obx-btn--ghost" @click="copy"><ObxIcon name="copy" />{{ copied ? 'Copied' : 'Copy' }}</button></div>
      </header>
      <div class="obx-card__body">
        <div v-if="!selected" class="obx-empty">Pick a file.</div>
        <div v-else-if="loadingFile && content == null" class="obx-skel" style="height: 300px"></div>
        <div v-else-if="fileError" class="obx-banner" data-tone="crit"><span class="obx-banner__text"><span>{{ fileError }}</span></span></div>
        <pre v-else class="obx-code obx-code--file"><code>{{ content }}</code></pre>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { bloxBytes, bloxGet, type BloxFile } from '~/composables/useOmniBlox';

const props = defineProps<{ gameId: string; revision: number }>();

const files = ref<BloxFile[] | null>(null);
const error = ref<string | null>(null);
const selected = ref<string | null>(null);
const content = ref<string | null>(null);
const fileError = ref<string | null>(null);
const loadingFile = ref(false);
const filter = ref('');
const copied = ref(false);
const lineCount = computed(() => (content.value ?? '').split('\n').length);
const shownFiles = computed(() => {
  const needle = filter.value.trim().toLowerCase();
  return (files.value ?? []).filter(f => !needle || f.Path.toLowerCase().includes(needle));
});

async function loadFiles() {
  const result = await bloxGet<{ Files: BloxFile[] }>(`/omniblox/game/files?id=${encodeURIComponent(props.gameId)}`);
  files.value = result.ok && result.data ? result.data.Files.slice().sort((a, b) => a.Path.localeCompare(b.Path)) : [];
  error.value = result.ok ? null : result.error;
  if (!selected.value && files.value.length) void open((files.value.find(f => f.Path.endsWith('.luau')) ?? files.value[0]!).Path);
  else if (selected.value) void open(selected.value);
}

async function open(path: string) {
  selected.value = path;
  loadingFile.value = true;
  copied.value = false;
  try {
    const result = await bloxGet<{ Path: string; Content: string }>(`/omniblox/game/file?id=${encodeURIComponent(props.gameId)}&path=${encodeURIComponent(path)}`);
    if (selected.value !== path) return;
    content.value = result.ok && result.data ? result.data.Content : null;
    fileError.value = result.ok ? null : result.error;
  } finally {
    loadingFile.value = false;
  }
}

async function copy() {
  try { await navigator.clipboard.writeText(content.value ?? ''); copied.value = true; } catch { /* nothing to do */ }
}

// A new build can add, change or remove files.
watch(() => [props.gameId, props.revision], loadFiles, { immediate: true });
</script>
