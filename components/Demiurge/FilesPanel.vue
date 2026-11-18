<template>
  <div class="dmx-fs">
    <div class="dmx-fs__bar">
      <div class="dmx-seg" role="group" aria-label="Files view">
        <button type="button" class="dmx-seg__opt" :aria-pressed="view === 'files'" @click="view = 'files'"><DemiurgeIcon name="folder" />Files</button>
        <button type="button" class="dmx-seg__opt" :aria-pressed="view === 'history'" @click="openHistory"><DemiurgeIcon name="clock" />History</button>
      </div>
      <template v-if="view === 'files'">
        <nav class="dmx-fs__crumbs" aria-label="Current directory">
          <button type="button" @click="goTo('')">steward</button>
          <template v-for="crumb in crumbs" :key="crumb.path"><span>/</span><button type="button" @click="goTo(crumb.path)">{{ crumb.name }}</button></template>
        </nav>
        <div class="dmx-fs__tools">
          <label class="dmx-find"><DemiurgeIcon name="search" /><input v-model.trim="search" placeholder="Search this folder" aria-label="Search this folder" @keyup.enter="searchFiles" /></label>
          <button v-if="!readOnly" class="dmx-btn dmx-btn--sm" :aria-expanded="uploading" @click="uploading = !uploading"><DemiurgeIcon :name="uploading ? 'x' : 'arrow-up'" />{{ uploading ? 'Close upload' : 'Upload' }}</button>
          <button v-if="!readOnly" class="dmx-btn dmx-btn--sm" @click="openDialog('folder')"><DemiurgeIcon name="plus" />Folder</button>
          <button class="dmx-iconbtn dmx-iconbtn--sm" :disabled="loading" title="Refresh" aria-label="Refresh the file list" @click="load"><DemiurgeIcon name="refresh" :class="{ 'dmx-spin': loading }" /></button>
        </div>
      </template>
    </div>

    <div v-if="error" class="dmx-banner" data-tone="fault" role="alert"><DemiurgeIcon name="alert" /><div class="dmx-banner__body">{{ error }}</div>
      <div class="dmx-banner__actions"><button class="dmx-btn dmx-btn--ghost dmx-btn--sm" @click="error = ''">Dismiss</button></div></div>

    <template v-if="view === 'files'">
      <div v-if="readOnly" class="dmx-banner" data-tone="need"><DemiurgeIcon name="lock" /><div class="dmx-banner__body">This Steward is {{ status.toLowerCase() }}. Its files stay available to browse and download, but cannot be changed.</div></div>
      <div v-else-if="uploading" class="ot-os dmx-embed dmx-fs__upload">
        <DemiurgeFileUploader
          purpose="existingSteward"
          :steward-id="stewardId"
          :destination-prefix="currentPath"
          :title="`Upload to /${currentPath || 'project'}`"
          hint="Files and folders keep their relative paths. Three files upload at once, and an interrupted file can be retried."
          @committed="afterMutation"
        />
      </div>

      <div v-if="loading && !entries.length" class="dmx-dim" style="font-size: 12px"><DemiurgeIcon name="refresh" class="dmx-spin" /> Loading shared files…</div>
      <div v-else-if="!entries.length" class="dmx-empty">
        <DemiurgeIcon name="folder" /><b>{{ search ? 'No matching files' : 'This folder is empty' }}</b>
        <span>{{ search ? 'Search looks inside this folder and below.' : 'One filesystem for you, the Commander and every agent; every change records who made it.' }}</span>
      </div>
      <div v-else class="dmx-fs__table">
        <table>
          <thead><tr><th>Name</th><th class="dmx-fs__num">Size</th><th>Added by</th><th>Modified</th><th>Notes</th><th aria-label="Actions"></th></tr></thead>
          <tbody>
            <tr v-for="entry in entries" :key="entry.fileID" @dblclick="openEntry(entry)">
              <td>
                <button type="button" class="dmx-fs__name" :title="entry.path" @click="openEntry(entry)">
                  <DemiurgeIcon :name="entry.kind === 'Directory' ? 'folder' : 'copy'" :data-dir="entry.kind === 'Directory' || undefined" />
                  <span class="dmx-truncate">{{ baseName(entry.path) }}</span>
                  <span v-if="entry.important" class="dmx-fs__star" title="Important to the agents">★</span>
                </button>
                <span class="dmx-fs__origin">{{ originLabel(entry.origin) }}</span>
              </td>
              <td class="dmx-fs__num dmx-dim">{{ entry.kind === 'Directory' ? '—' : formatBytes(entry.size) }}</td>
              <td class="dmx-dim"><span :title="`${entry.createdBy?.type || 'Unknown'} · ${entry.createdBy?.id || ''}`">{{ entry.createdBy?.displayName || 'Unknown' }}</span></td>
              <td class="dmx-dim" :title="formatDate(entry.modifiedUtc)">{{ relativeDate(entry.modifiedUtc) }}</td>
              <td class="dmx-fs__note" :title="entry.description || ''">{{ entry.description || '—' }}</td>
              <td class="dmx-fs__actions">
                <button v-if="entry.kind !== 'Directory'" class="dmx-iconbtn dmx-iconbtn--sm" title="Download" :aria-label="`Download ${baseName(entry.path)}`" @click="download(entry)"><DemiurgeIcon name="download" /></button>
                <template v-if="!readOnly">
                  <button class="dmx-iconbtn dmx-iconbtn--sm" title="Notes and importance" :aria-label="`Edit notes for ${baseName(entry.path)}`" @click="openDialog('metadata', entry)"><DemiurgeIcon name="edit" /></button>
                  <button class="dmx-iconbtn dmx-iconbtn--sm" title="Move or rename" :aria-label="`Move or rename ${baseName(entry.path)}`" @click="openDialog('move', entry)"><DemiurgeIcon name="arrow-right" /></button>
                  <button class="dmx-iconbtn dmx-iconbtn--sm" title="Copy" :aria-label="`Copy ${baseName(entry.path)}`" @click="openDialog('copy', entry)"><DemiurgeIcon name="copy" /></button>
                  <button class="dmx-iconbtn dmx-iconbtn--sm" data-tone="fault" title="Delete" :aria-label="`Delete ${baseName(entry.path)}`" @click="openDialog('delete', entry)"><DemiurgeIcon name="trash" /></button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="total > entries.length || cursorStack.length" class="dmx-fs__pages">
        <span class="dmx-dim">{{ total }} {{ total === 1 ? 'item' : 'items' }}</span>
        <button class="dmx-btn dmx-btn--ghost dmx-btn--sm" :disabled="!cursorStack.length" @click="previousPage"><DemiurgeIcon name="chevron-left" />Previous</button>
        <button class="dmx-btn dmx-btn--ghost dmx-btn--sm" :disabled="!nextCursor" @click="nextPage">Next<DemiurgeIcon name="chevron-right" /></button>
      </div>
    </template>

    <template v-else>
      <div v-if="historyLoading" class="dmx-dim" style="font-size: 12px"><DemiurgeIcon name="refresh" class="dmx-spin" /> Loading file history…</div>
      <div v-else-if="!events.length" class="dmx-empty"><DemiurgeIcon name="clock" /><b>No file activity yet</b></div>
      <ol v-else class="dmx-fs__history">
        <li v-for="event in events" :key="event.eventID">
          <span class="dmx-chip" :data-tone="opTone(event.operation)">{{ String(event.operation || '').toLowerCase() }}</span>
          <div class="dmx-fs__history-path"><b>{{ event.path }}</b><span v-if="event.previousPath" class="dmx-dim"> from {{ event.previousPath }}</span></div>
          <span class="dmx-dim dmx-fs__history-meta">{{ event.actor?.displayName || 'Unknown' }} · {{ formatDate(event.timestampUtc) }}<template v-if="event.size != null"> · {{ formatBytes(event.size) }}</template></span>
        </li>
      </ol>
      <button v-if="historyCursor" class="dmx-btn dmx-btn--ghost dmx-btn--sm" style="align-self: flex-start" @click="loadMoreHistory">Load older activity</button>
    </template>

    <!-- One dialog for every file action, in the console's own chrome. -->
    <DemiurgeDialog :open="!!dialog" :title="dialogTitle" :subtitle="dialog?.entry?.path" @close="dialog = null">
      <template v-if="dialog">
        <div v-if="dialog.kind === 'delete'" class="dmx-note" data-tone="fault">
          {{ dialog.entry?.kind === 'Directory' ? 'The folder and everything inside it will be deleted.' : 'The file will be removed from the shared Steward filesystem.' }}
        </div>
        <template v-else-if="dialog.kind === 'metadata'">
          <div class="dmx-field">
            <label class="dmx-field__label" for="dmx-fs-notes">Notes for the agents</label>
            <textarea id="dmx-fs-notes" v-model="dialog.description" class="dmx-textarea" maxlength="500" rows="3" placeholder="How should agents use this file?"></textarea>
          </div>
          <label class="dmx-toggle">
            <span class="dmx-toggle__copy"><b>Important</b><span>Flagged files are pointed out to every Steward worker.</span></span>
            <span class="dmx-switchbox"><input v-model="dialog.important" type="checkbox" class="dmx-switchbox__input" aria-label="Important" /><span class="dmx-switch" :data-on="dialog.important || undefined" aria-hidden="true"></span></span>
          </label>
        </template>
        <div v-else class="dmx-field">
          <label class="dmx-field__label" for="dmx-fs-path">{{ dialog.kind === 'folder' ? 'Folder name or path' : 'Destination path' }}</label>
          <input id="dmx-fs-path" v-model.trim="dialog.value" class="dmx-input dmx-mono" @keyup.enter="confirmDialog" />
        </div>
        <p v-if="dialogError" class="dmx-note" data-tone="fault" role="alert" style="margin-top: 8px">{{ dialogError }}</p>
      </template>
      <template #foot>
        <button class="dmx-btn" @click="dialog = null">Cancel</button>
        <button class="dmx-btn" :class="dialog?.kind === 'delete' ? 'dmx-btn--danger' : 'dmx-btn--primary'" :disabled="working" @click="confirmDialog">
          {{ working ? 'Working…' : dialogAction }}
        </button>
      </template>
    </DemiurgeDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import DemiurgeDialog from '~/components/Demiurge/Dialog.vue';
import DemiurgeFileUploader from '~/components/Demiurge/FileUploader.vue';
import DemiurgeIcon from '~/components/Demiurge/Icon.vue';
import { useStewardFiles, type StewardFileEntry } from '~/composables/useStewardFiles';
import type { DmTone } from '~/scripts/demiurgeConsole';

const props = defineProps<{ stewardId: string; status: string }>();
const api = useStewardFiles();
const currentPath = ref('');
const entries = ref<StewardFileEntry[]>([]);
const total = ref(0);
const nextCursor = ref('');
const cursor = ref('');
const cursorStack = ref<string[]>([]);
const search = ref('');
const loading = ref(false);
const error = ref('');
const uploading = ref(false);
const view = ref<'files' | 'history'>('files');
const events = ref<any[]>([]);
const historyCursor = ref('');
const historyLoading = ref(false);

type DialogKind = 'folder' | 'metadata' | 'move' | 'copy' | 'delete';
interface FileDialog { kind: DialogKind; entry?: StewardFileEntry; value: string; description: string; important: boolean }
const dialog = ref<FileDialog | null>(null);
const dialogError = ref('');
const working = ref(false);

const readOnly = computed(() => ['Completed', 'Archived'].includes(props.status));
const crumbs = computed(() => {
  let path = '';
  return currentPath.value.split('/').filter(Boolean).map(name => ({ name, path: path = path ? `${path}/${name}` : name }));
});
const dialogTitle = computed(() => {
  const d = dialog.value;
  if (!d) return '';
  const name = d.entry ? baseName(d.entry.path) : '';
  return ({ folder: 'New folder', metadata: 'Notes and importance', move: `Move or rename ${name}`, copy: `Copy ${name}`, delete: `Delete ${name}?` } as Record<DialogKind, string>)[d.kind];
});
const dialogAction = computed(() => ({ folder: 'Create folder', metadata: 'Save', move: 'Move', copy: 'Copy', delete: 'Delete' } as Record<DialogKind, string>)[dialog.value?.kind ?? 'folder']);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const result = await api.list(props.stewardId, currentPath.value, search.value, cursor.value);
    entries.value = result.entries || [];
    total.value = result.total || 0;
    nextCursor.value = result.nextCursor || '';
  } catch (e: any) { error.value = e?.message || 'Could not load the files.'; }
  finally { loading.value = false; }
}

function goTo(path: string) {
  currentPath.value = path;
  search.value = '';
  resetPages();
  load();
}
function searchFiles() { resetPages(); load(); }
function resetPages() { cursor.value = ''; cursorStack.value = []; }
function nextPage() { if (!nextCursor.value) return; cursorStack.value.push(cursor.value); cursor.value = nextCursor.value; load(); }
function previousPage() { cursor.value = cursorStack.value.pop() || ''; load(); }
function openEntry(entry: StewardFileEntry) { entry.kind === 'Directory' ? goTo(entry.path) : download(entry); }
async function download(entry: StewardFileEntry) {
  error.value = '';
  try { await api.download(props.stewardId, entry.path); } catch (e: any) { error.value = e?.message || 'The download failed.'; }
}

function openDialog(kind: DialogKind, entry?: StewardFileEntry) {
  dialogError.value = '';
  dialog.value = {
    kind, entry,
    value: kind === 'folder' ? (currentPath.value ? `${currentPath.value}/` : '') : entry?.path ?? '',
    description: entry?.description ?? '',
    important: !!entry?.important,
  };
}

async function confirmDialog() {
  const d = dialog.value;
  if (!d || working.value) return;
  const body: Record<string, unknown> = { stewardID: props.stewardId };
  let route: string = d.kind;
  if (d.kind === 'folder') {
    const path = d.value.replace(/\/+$/, '');
    if (!path) { dialogError.value = 'A folder name is required.'; return; }
    route = 'directory'; body.path = path;
  } else if (d.kind === 'move' || d.kind === 'copy') {
    if (!d.value) { dialogError.value = 'A destination path is required.'; return; }
    if (d.value === d.entry?.path) { dialog.value = null; return; }
    body.path = d.entry?.path; body.destination = d.value;
  } else if (d.kind === 'metadata') {
    body.path = d.entry?.path; body.description = d.description; body.important = d.important;
  } else {
    body.path = d.entry?.path; body.recursive = d.entry?.kind === 'Directory';
  }
  working.value = true;
  try {
    await api.mutate(route, body);
    dialog.value = null;
    await afterMutation();
  } catch (e: any) { dialogError.value = e?.message || `Could not ${dialogAction.value.toLowerCase()}.`; }
  finally { working.value = false; }
}
async function afterMutation() { resetPages(); await load(); }

async function openHistory() {
  view.value = 'history';
  if (!events.value.length) await loadHistory(false);
}
async function loadHistory(append: boolean) {
  historyLoading.value = !append;
  error.value = '';
  try {
    const result = await api.audit(props.stewardId, append ? historyCursor.value : '');
    events.value = append ? [...events.value, ...(result.events || [])] : (result.events || []);
    historyCursor.value = result.nextCursor || '';
  } catch (e: any) { error.value = e?.message || 'Could not load the history.'; }
  finally { historyLoading.value = false; }
}
function loadMoreHistory() { loadHistory(true); }

function baseName(path: string) { return path.split('/').pop() || path; }
function originLabel(origin: string) { return ({ InitialUpload: 'Steward setup', UserUpload: 'your upload', AgentTool: 'agent-created', Filesystem: 'workspace' } as Record<string, string>)[origin] || origin; }
function opTone(op: string): DmTone {
  const o = String(op || '').toLowerCase();
  return o.includes('delete') ? 'fault' : o.includes('create') || o.includes('upload') || o.includes('write') ? 'work' : o.includes('move') || o.includes('rename') ? 'plan' : 'info';
}
function formatBytes(value: number) {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}
function formatDate(value: string) { return value ? new Date(value).toLocaleString() : 'Unknown'; }
function relativeDate(value: string) {
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(value).toLocaleDateString();
}

watch(() => props.stewardId, () => { currentPath.value = ''; resetPages(); load(); });
onMounted(load);
</script>
