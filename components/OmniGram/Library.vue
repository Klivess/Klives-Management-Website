<template>
    <div class="ig-library">
        <div class="drop" :class="{ over: dragging }" @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="onDrop">
            <p>Drop videos or images here, or <button type="button" class="linkish" :disabled="!canUpload" :title="canUpload ? '' : 'Needs “Publish content”'" @click="picker?.click()">choose files</button>.
                Autopilot posts them oldest first, each once. Videos become reels, images become photo posts (or stories, per the strategy).</p>
            <input ref="picker" type="file" multiple accept="video/mp4,video/quicktime,.m4v,.mov,image/jpeg,image/png,image/gif,image/webp" hidden @change="onPick" />
        </div>

        <ul v-if="uploads.length" class="uploads">
            <li v-for="u in uploads" :key="u.id">
                <span class="name">{{ u.name }}</span>
                <span v-if="u.error" class="neg">{{ u.error }}</span>
                <span v-else-if="u.done" class="pos">uploaded</span>
                <OmniTraderMeter v-else :label="''" :value="`${u.percent}%`" :limit="fmtBytes(u.size)" :percent="u.percent" :warn-at="101" />
            </li>
        </ul>

        <div v-if="loading && !files.length" class="ot-skelrows"><div class="ot-skel"></div></div>
        <div v-else-if="files.length" class="ot-tablewrap">
            <table class="ot-table">
                <thead><tr><th>File</th><th>Kind</th><th class="num">Size</th><th>Added</th><th>Status</th><th></th></tr></thead>
                <tbody>
                    <tr v-for="f in files" :key="f.FileName">
                        <td class="mono filecell">{{ f.FileName }}</td>
                        <td>{{ f.Kind }}</td>
                        <td class="num">{{ fmtBytes(f.Bytes) }}</td>
                        <td class="nowrap">{{ fmtDate(f.AddedUtc) }}</td>
                        <td><span class="ot-chip" :class="f.Used ? '' : 'ok'">{{ f.Used ? 'used' : 'waiting' }}</span></td>
                        <td><button v-if="canUpload" class="ot-btn sm ghost" @click="remove(f.FileName)">Delete</button></td>
                    </tr>
                </tbody>
            </table>
        </div>
        <p v-else class="muted">The library is empty.</p>
        <p v-if="files.length" class="muted small">{{ files.filter(f => !f.Used).length }} waiting to be posted.</p>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useAccess } from '~/composables/useAccess';
import { confirmAction, fmtBytes, fmtDate, igGet, igPost, notify, q, uploadMedia } from '~/composables/useOmniGram';

interface LibraryFile { FileName: string; Key: string; Kind: string; Bytes: number; AddedUtc: string; Used: boolean }

const props = defineProps<{ accountId: string }>();
const emit = defineEmits<{ changed: [] }>();
const { can } = useAccess();
const canUpload = computed(() => can('omnigram.content.publish'));

const files = ref<LibraryFile[]>([]);
const loading = ref(false);
const dragging = ref(false);
const picker = ref<HTMLInputElement | null>(null);
const uploads = ref<{ id: number; name: string; size: number; percent: number; done: boolean; error: string | null }[]>([]);
let uploadId = 0;

onMounted(load);

async function load() {
    loading.value = true;
    const result = await igGet<{ Files: LibraryFile[] }>(`/omnigram/library${q({ accountId: props.accountId })}`);
    loading.value = false;
    if (result.ok && result.data) files.value = result.data.Files;
}

function onPick(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) void uploadAll(Array.from(input.files));
    input.value = '';
}

function onDrop(event: DragEvent) {
    dragging.value = false;
    if (!canUpload.value) return;
    if (event.dataTransfer?.files) void uploadAll(Array.from(event.dataTransfer.files));
}

async function uploadAll(list: File[]) {
    for (const file of list) {
        uploads.value.push({ id: ++uploadId, name: file.name, size: file.size, percent: 0, done: false, error: null });
        const tracked = uploads.value[uploads.value.length - 1];
        try {
            await uploadMedia(file, 'library', props.accountId, pct => { tracked.percent = pct; }).promise;
            tracked.done = true;
        } catch (e: any) {
            tracked.error = e?.message ?? 'Upload failed';
        }
    }
    await load();
    emit('changed');
    setTimeout(() => { uploads.value = uploads.value.filter(u => !u.done); }, 4000);
}

async function remove(fileName: string) {
    if (!(await confirmAction('Delete this file?', `${fileName} is removed from the library.`, 'Delete', true))) return;
    const result = await igPost('/omnigram/library/delete', { accountId: props.accountId, fileName });
    if (!result.ok) notify('Could not delete it', result.error ?? '', 'error');
    await load();
    emit('changed');
}
</script>

<style scoped>
.ig-library { display: flex; flex-direction: column; gap: var(--ot-space-3); min-width: 0; }
.drop { border: 1px dashed var(--ot-line-strong); border-radius: var(--ot-radius); padding: var(--ot-space-4); text-align: center; color: var(--ot-text-2); font-size: 13px; }
.drop.over { border-color: var(--ot-accent); background: var(--ot-accent-soft); }
.drop p { margin: 0; }
.uploads { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ot-space-2); font-size: 12px; }
.uploads li { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: var(--ot-space-3); align-items: center; }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.filecell { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nowrap { white-space: nowrap; }
.linkish { border: 0; background: none; padding: 0; color: var(--ot-info); cursor: pointer; font-size: inherit; }
.small { font-size: 11.5px; margin: 0; }
</style>
