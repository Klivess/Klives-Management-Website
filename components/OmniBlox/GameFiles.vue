<template>
    <div class="ot-grid sidebar-left">
        <OmniTraderCard title="Workspace" :subtitle="files ? `${files.length} files · revision ${revision}` : 'Loading…'" :loading="files === null && !error"
                        :error="error ?? undefined" :empty="!!files && !files.length" empty-title="No files yet" flush>
            <ul class="files" role="listbox" aria-label="Files">
                <li v-for="f in files ?? []" :key="f.Path">
                    <button type="button" role="option" :aria-selected="selected === f.Path" :class="{ active: selected === f.Path }" @click="open(f.Path)">
                        <span class="path">{{ f.Path }}</span>
                        <span class="size">{{ bloxBytes(f.Bytes) }}</span>
                    </button>
                </li>
            </ul>
        </OmniTraderCard>

        <OmniTraderCard :title="selected ?? 'File'" :subtitle="content != null ? `${lineCount} lines` : undefined" :loading="loadingFile" :empty="!selected"
                        empty-title="Pick a file" :error="fileError ?? undefined" flush>
            <pre v-if="content != null" class="code"><code>{{ content }}</code></pre>
        </OmniTraderCard>
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
const lineCount = computed(() => (content.value ?? '').split('\n').length);

async function loadFiles() {
    const result = await bloxGet<{ Files: BloxFile[] }>(`/omniblox/game/files?id=${encodeURIComponent(props.gameId)}`);
    files.value = result.ok && result.data ? result.data.Files.slice().sort((a, b) => a.Path.localeCompare(b.Path)) : [];
    error.value = result.ok ? null : result.error;
    if (!selected.value && files.value.length) {
        // Start on the game's own code rather than the generated JSON.
        void open((files.value.find(f => f.Path.endsWith('.luau')) ?? files.value[0]!).Path);
    } else if (selected.value) {
        void open(selected.value);
    }
}

async function open(path: string) {
    selected.value = path;
    loadingFile.value = true;
    try {
        const result = await bloxGet<{ Path: string; Content: string }>(`/omniblox/game/file?id=${encodeURIComponent(props.gameId)}&path=${encodeURIComponent(path)}`);
        if (selected.value !== path) return;
        content.value = result.ok && result.data ? result.data.Content : null;
        fileError.value = result.ok ? null : result.error;
    } finally {
        loadingFile.value = false;
    }
}

// A new build can add, change or remove files.
watch(() => [props.gameId, props.revision], loadFiles, { immediate: true });
</script>

<style scoped>
.files { list-style: none; margin: 0; padding: var(--ot-space-1); max-height: 560px; overflow-y: auto; }
.files button {
    width: 100%; display: flex; justify-content: space-between; gap: var(--ot-space-2);
    align-items: center; padding: 6px var(--ot-space-2); border: 0; border-radius: var(--ot-radius-sm);
    background: transparent; cursor: pointer; text-align: left; font-size: 12px;
}
.files button:hover { background: var(--ot-surface-3); }
.files button.active { background: var(--ot-accent-soft); color: var(--ot-accent); }
.path { font-family: var(--ot-mono); overflow-wrap: anywhere; }
.size { flex: 0 0 auto; font-size: 11px; color: var(--ot-muted); }
.code { margin: 0; padding: var(--ot-card-pad); max-height: 640px; overflow: auto; font-family: var(--ot-mono); font-size: 12px; line-height: 18px; tab-size: 4; white-space: pre; }
</style>
