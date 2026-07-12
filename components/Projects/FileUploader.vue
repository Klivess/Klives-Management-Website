<template>
  <div class="fu-wrap">
    <div class="fu-picker" :class="{ disabled }">
      <div>
        <strong>{{ title }}</strong>
        <p>{{ hint }}</p>
      </div>
      <div class="fu-buttons">
        <label class="fu-button">
          Add files
          <input type="file" multiple :disabled="disabled || busy" @change="pickFiles" />
        </label>
        <label class="fu-button">
          Add folder
          <input type="file" multiple webkitdirectory :disabled="disabled || busy" @change="pickFiles" />
        </label>
      </div>
    </div>

    <div v-if="items.length" class="fu-list">
      <div v-for="item in items" :key="item.path" class="fu-item">
        <div class="fu-file">
          <span class="fu-path" :title="item.path">{{ item.path }}</span>
          <span class="fu-size">{{ formatBytes(item.file.size) }}</span>
        </div>
        <div class="fu-progress"><span :style="{ width: `${item.progress}%` }"></span></div>
        <span class="fu-status" :class="item.status">{{ statusLabel(item) }}</span>
      </div>
    </div>

    <div v-if="error" class="fu-error">{{ error }}</div>
    <div v-if="items.length" class="fu-footer">
      <span>{{ completedCount }}/{{ items.length }} uploaded · {{ formatBytes(totalBytes) }}</span>
      <div class="fu-actions">
        <button v-if="failedCount" class="fu-secondary" :disabled="busy" @click="retryFailed">Retry failed</button>
        <button v-if="purpose === 'existingProject' && ready && !committed" class="fu-primary" :disabled="committing || disabled" @click="commit">
          {{ committing ? 'Adding…' : 'Add to shared files' }}
        </button>
        <select v-if="purpose === 'existingProject' && ready && !committed" v-model="policy" class="fu-select" title="What to do when a path already exists">
          <option value="Fail">Stop on conflicts</option>
          <option value="KeepBoth">Keep both</option>
          <option value="Replace">Replace existing</option>
          <option value="Skip">Skip existing</option>
        </select>
        <button class="fu-danger" :disabled="cancelling" @click="clear">{{ cancelling ? 'Cancelling…' : 'Clear' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ConflictPolicy } from '~/composables/useProjectFiles';
import { useProjectFiles } from '~/composables/useProjectFiles';

type UploadStatus = 'queued' | 'uploading' | 'done' | 'failed';
interface UploadItem { file: File; path: string; offset: number; progress: number; status: UploadStatus; error?: string }

const props = withDefaults(defineProps<{
  purpose: 'initial' | 'existingProject';
  projectId?: string;
  destinationPrefix?: string;
  title?: string;
  hint?: string;
  disabled?: boolean;
}>(), {
  destinationPrefix: '',
  title: 'Shared project files',
  hint: 'Files are available to the Commander and every project worker, with uploader and timestamp recorded.',
  disabled: false,
});

const emit = defineEmits<{
  state: [value: { sessionID: string | null; selected: number; ready: boolean; busy: boolean }];
  committed: [];
}>();

const api = useProjectFiles();
const items = ref<UploadItem[]>([]);
const sessionID = ref<string | null>(null);
const chunkSize = ref(8 * 1024 * 1024);
const maxFileBytes = ref(10 * 1024 * 1024 * 1024);
const busy = ref(false);
const committing = ref(false);
const cancelling = ref(false);
const committed = ref(false);
const error = ref('');
const policy = ref<ConflictPolicy>('Fail');
let generation = 0;

const completedCount = computed(() => items.value.filter(x => x.status === 'done').length);
const failedCount = computed(() => items.value.filter(x => x.status === 'failed').length);
const ready = computed(() => items.value.length > 0 && completedCount.value === items.value.length && !!sessionID.value);
const totalBytes = computed(() => items.value.reduce((sum, x) => sum + x.file.size, 0));

function notify() {
  emit('state', { sessionID: sessionID.value, selected: items.value.length, ready: items.value.length === 0 || ready.value, busy: busy.value || committing.value });
}

function normalPath(file: File) {
  const relative = file.webkitRelativePath || file.name;
  const prefix = props.destinationPrefix.replace(/^\/+|\/+$/g, '');
  return [prefix, relative.replace(/\\/g, '/').replace(/^\/+/, '')].filter(Boolean).join('/');
}

async function pickFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const incoming = Array.from(input.files || []);
  input.value = '';
  if (!incoming.length) return;
  committed.value = false;
  error.value = '';
  const existing = new Set(items.value.map(x => x.path.toLocaleLowerCase()));
  for (const file of incoming) {
    const path = normalPath(file);
    if (existing.has(path.toLocaleLowerCase())) continue;
    items.value.push({ file, path, offset: 0, progress: 0, status: 'queued' });
    existing.add(path.toLocaleLowerCase());
  }
  notify();
  await uploadQueued();
}

async function ensureSession() {
  if (sessionID.value) return;
  const started = await api.startUpload(props.purpose, props.projectId);
  sessionID.value = started.session.sessionID;
  chunkSize.value = started.maxChunkBytes;
  maxFileBytes.value = started.maxFileBytes;
}

async function uploadOne(item: UploadItem, runGeneration: number) {
  if (item.file.size > maxFileBytes.value) {
    item.status = 'failed';
    item.error = `File exceeds ${formatBytes(maxFileBytes.value)} limit`;
    return;
  }
  item.status = 'uploading';
  try {
    do {
      if (generation !== runGeneration || !sessionID.value) return;
      item.offset = await api.uploadChunk(sessionID.value, item.path, item.file, item.offset, chunkSize.value);
      item.progress = item.file.size ? Math.min(100, Math.round(item.offset / item.file.size * 100)) : 100;
      notify();
    } while (item.offset < item.file.size);
    item.status = 'done';
  } catch (e: any) {
    item.status = 'failed';
    item.error = e?.message || 'Upload failed';
    error.value = `${item.path}: ${item.error}`;
  }
}

async function uploadQueued() {
  if (busy.value) return;
  busy.value = true;
  const runGeneration = generation;
  try {
    await ensureSession();
    const queue = items.value.filter(x => x.status === 'queued');
    let index = 0;
    const worker = async () => {
      while (index < queue.length && generation === runGeneration) {
        const item = queue[index++];
        await uploadOne(item, runGeneration);
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker));
  } catch (e: any) {
    error.value = e?.message || 'Could not start upload';
    for (const item of items.value.filter(x => x.status === 'queued')) item.status = 'failed';
  } finally {
    busy.value = false;
    notify();
  }
}

async function retryFailed() {
  error.value = '';
  if (sessionID.value) {
    try {
      const remote = await api.getUpload(sessionID.value);
      for (const item of items.value) {
        const saved = remote.items.find(x => x.path.toLocaleLowerCase() === item.path.toLocaleLowerCase());
        if (saved) {
          item.offset = saved.receivedSize;
          item.progress = item.file.size ? Math.min(100, Math.round(item.offset / item.file.size * 100)) : 100;
        }
      }
    } catch (e: any) {
      error.value = e?.message || 'Could not recover upload progress.';
      return;
    }
  }
  for (const item of items.value.filter(x => x.status === 'failed')) item.status = 'queued';
  await uploadQueued();
}

async function commit() {
  if (!sessionID.value || !ready.value) return;
  committing.value = true;
  error.value = '';
  notify();
  try {
    await api.commitUpload(sessionID.value, policy.value);
    emit('committed');
    sessionID.value = null;
    items.value = [];
    committed.value = false;
  } catch (e: any) {
    error.value = e?.message || 'Could not add files. Choose a conflict action and try again.';
  } finally {
    committing.value = false;
    notify();
  }
}

async function clear() {
  generation++;
  cancelling.value = true;
  const current = sessionID.value;
  sessionID.value = null;
  try { if (current) await api.cancelUpload(current); } catch { /* expired/already committed */ }
  items.value = [];
  error.value = '';
  busy.value = false;
  committed.value = false;
  cancelling.value = false;
  notify();
}

function statusLabel(item: UploadItem) {
  if (item.status === 'uploading') return `${item.progress}%`;
  if (item.status === 'failed') return item.error || 'Failed';
  return item.status === 'done' ? 'Ready' : 'Waiting';
}

function formatBytes(value: number) {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

defineExpose({ clear });
notify();
</script>

<style scoped>
.fu-wrap { display: flex; flex-direction: column; gap: 12px; }
.fu-picker { display: flex; justify-content: space-between; gap: 16px; align-items: center; border: 1px dashed #3a3a42; border-radius: 8px; padding: 14px; background: #121217; }
.fu-picker.disabled { opacity: .55; }
.fu-picker strong { color: #e8e8e8; font-size: 13px; }
.fu-picker p { color: #777; font-size: 11px; margin: 4px 0 0; line-height: 1.4; max-width: 560px; }
.fu-buttons, .fu-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.fu-button { border: 1px solid #3a3a42; background: #222228; color: #ccc; padding: 7px 10px; border-radius: 6px; cursor: pointer; font-size: 12px; }
.fu-button:hover { border-color: #4d9e39; color: #fff; }
.fu-button input { display: none; }
.fu-list { border: 1px solid #29292f; border-radius: 7px; overflow: hidden; max-height: 230px; overflow-y: auto; }
.fu-item { display: grid; grid-template-columns: minmax(180px, 1fr) 100px minmax(72px, auto); gap: 10px; align-items: center; padding: 8px 10px; border-bottom: 1px solid #24242a; font-size: 11px; }
.fu-item:last-child { border-bottom: none; }
.fu-file { min-width: 0; display: flex; gap: 8px; }
.fu-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #ccc; }
.fu-size { color: #666; flex-shrink: 0; }
.fu-progress { height: 4px; border-radius: 4px; background: #2d2d33; overflow: hidden; }
.fu-progress span { display: block; height: 100%; background: #4d9e39; transition: width .15s; }
.fu-status { color: #777; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }
.fu-status.done { color: #7fd97f; }
.fu-status.failed { color: #ff8484; }
.fu-error { color: #ff9a9a; font-size: 11px; background: #2a1818; padding: 8px 10px; border-radius: 6px; overflow-wrap: anywhere; }
.fu-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: #777; font-size: 11px; }
.fu-primary, .fu-secondary, .fu-danger, .fu-select { border-radius: 6px; padding: 7px 10px; font-size: 11px; }
.fu-primary { border: 0; background: #4d9e39; color: #fff; cursor: pointer; }
.fu-secondary, .fu-danger { border: 1px solid #383840; background: #222228; color: #bbb; cursor: pointer; }
.fu-danger { color: #c98989; }
.fu-select { background: #1b1b20; border: 1px solid #383840; color: #ccc; }
button:disabled { opacity: .45; cursor: default; }
@media (max-width: 700px) { .fu-picker, .fu-footer { align-items: stretch; flex-direction: column; } .fu-buttons, .fu-actions { flex-wrap: wrap; } .fu-item { grid-template-columns: 1fr 70px; } .fu-status { grid-column: 1 / -1; text-align: left; } }
</style>
