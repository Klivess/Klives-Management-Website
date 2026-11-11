<template>
  <div class="pjx-fs">
    <div class="pjx-fs__bar">
      <div class="pjx-seg" role="group" aria-label="Files view">
        <button type="button" class="pjx-seg__opt" :aria-pressed="view === 'files'" @click="view = 'files'"><ProjectsIcon name="folder" />Files</button>
        <button type="button" class="pjx-seg__opt" :aria-pressed="view === 'history'" @click="openHistory"><ProjectsIcon name="clock" />History</button>
      </div>
      <template v-if="view === 'files'">
        <nav class="pjx-fs__crumbs" aria-label="Current directory">
          <button type="button" @click="goTo('')">project</button>
          <template v-for="crumb in crumbs" :key="crumb.path"><span>/</span><button type="button" @click="goTo(crumb.path)">{{ crumb.name }}</button></template>
        </nav>
        <div class="pjx-fs__tools">
          <label class="pjx-find"><ProjectsIcon name="search" /><input v-model.trim="search" placeholder="Search this folder" aria-label="Search this folder" @keyup.enter="searchFiles" /></label>
          <button v-if="!readOnly" class="pjx-btn pjx-btn--sm" :aria-expanded="uploading" @click="uploading = !uploading"><ProjectsIcon :name="uploading ? 'x' : 'arrow-up'" />{{ uploading ? 'Close upload' : 'Upload' }}</button>
          <button v-if="!readOnly" class="pjx-btn pjx-btn--sm" @click="openDialog('folder')"><ProjectsIcon name="plus" />Folder</button>
          <button class="pjx-iconbtn pjx-iconbtn--sm" :disabled="loading" title="Refresh" aria-label="Refresh the file list" @click="load"><ProjectsIcon name="refresh" :class="{ 'pjx-spin': loading }" /></button>
        </div>
      </template>
    </div>

    <div v-if="error" class="pjx-banner" data-tone="fault" role="alert"><ProjectsIcon name="alert" /><div class="pjx-banner__body">{{ error }}</div>
      <div class="pjx-banner__actions"><button class="pjx-btn pjx-btn--ghost pjx-btn--sm" @click="error = ''">Dismiss</button></div></div>

    <template v-if="view === 'files'">
      <div v-if="readOnly" class="pjx-banner" data-tone="need"><ProjectsIcon name="lock" /><div class="pjx-banner__body">This project is {{ status.toLowerCase() }}. Its files stay available to browse and download, but cannot be changed.</div></div>
      <div v-else-if="uploading" class="ot-os pjx-embed pjx-fs__upload">
        <ProjectsFileUploader
          purpose="existingProject"
          :project-id="projectId"
          :destination-prefix="currentPath"
          :title="`Upload to /${currentPath || 'project'}`"
          hint="Files and folders keep their relative paths. Three files upload at once, and an interrupted file can be retried."
          @committed="afterMutation"
        />
      </div>

      <div v-if="loading && !entries.length" class="pjx-dim" style="font-size: 12px"><ProjectsIcon name="refresh" class="pjx-spin" /> Loading shared files…</div>
      <div v-else-if="!entries.length" class="pjx-empty">
        <ProjectsIcon name="folder" /><b>{{ search ? 'No matching files' : 'This folder is empty' }}</b>
        <span>{{ search ? 'Search looks inside this folder and below.' : 'One filesystem for you, the Commander and every agent; every change records who made it.' }}</span>
      </div>
      <div v-else class="pjx-fs__table">
        <table>
          <thead><tr><th>Name</th><th class="pjx-fs__num">Size</th><th>Added by</th><th>Modified</th><th>Notes</th><th aria-label="Actions"></th></tr></thead>
          <tbody>
            <tr v-for="entry in entries" :key="entry.fileID" @dblclick="openEntry(entry)">
              <td>
                <button type="button" class="pjx-fs__name" :title="entry.path" @click="openEntry(entry)">
                  <ProjectsIcon :name="entry.kind === 'Directory' ? 'folder' : 'copy'" :data-dir="entry.kind === 'Directory' || undefined" />
                  <span class="pjx-truncate">{{ baseName(entry.path) }}</span>
                  <span v-if="entry.important" class="pjx-fs__star" title="Important to the agents">★</span>
                </button>
                <span class="pjx-fs__origin">{{ originLabel(entry.origin) }}</span>
              </td>
              <td class="pjx-fs__num pjx-dim">{{ entry.kind === 'Directory' ? '—' : formatBytes(entry.size) }}</td>
              <td class="pjx-dim"><span :title="`${entry.createdBy?.type || 'Unknown'} · ${entry.createdBy?.id || ''}`">{{ entry.createdBy?.displayName || 'Unknown' }}</span></td>
              <td class="pjx-dim" :title="formatDate(entry.modifiedUtc)">{{ relativeDate(entry.modifiedUtc) }}</td>
              <td class="pjx-fs__note" :title="entry.description || ''">{{ entry.description || '—' }}</td>
              <td class="pjx-fs__actions">
                <button v-if="entry.kind !== 'Directory'" class="pjx-iconbtn pjx-iconbtn--sm" title="Download" :aria-label="`Download ${baseName(entry.path)}`" @click="download(entry)"><ProjectsIcon name="download" /></button>
                <template v-if="!readOnly">
                  <button class="pjx-iconbtn pjx-iconbtn--sm" title="Notes and importance" :aria-label="`Edit notes for ${baseName(entry.path)}`" @click="openDialog('metadata', entry)"><ProjectsIcon name="edit" /></button>
                  <button class="pjx-iconbtn pjx-iconbtn--sm" title="Move or rename" :aria-label="`Move or rename ${baseName(entry.path)}`" @click="openDialog('move', entry)"><ProjectsIcon name="arrow-right" /></button>
                  <button class="pjx-iconbtn pjx-iconbtn--sm" title="Copy" :aria-label="`Copy ${baseName(entry.path)}`" @click="openDialog('copy', entry)"><ProjectsIcon name="copy" /></button>
                  <button class="pjx-iconbtn pjx-iconbtn--sm" data-tone="fault" title="Delete" :aria-label="`Delete ${baseName(entry.path)}`" @click="openDialog('delete', entry)"><ProjectsIcon name="trash" /></button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="total > entries.length || cursorStack.length" class="pjx-fs__pages">
        <span class="pjx-dim">{{ total }} {{ total === 1 ? 'item' : 'items' }}</span>
        <button class="pjx-btn pjx-btn--ghost pjx-btn--sm" :disabled="!cursorStack.length" @click="previousPage"><ProjectsIcon name="chevron-left" />Previous</button>
        <button class="pjx-btn pjx-btn--ghost pjx-btn--sm" :disabled="!nextCursor" @click="nextPage">Next<ProjectsIcon name="chevron-right" /></button>
      </div>
    </template>

    <template v-else>
      <div v-if="historyLoading" class="pjx-dim" style="font-size: 12px"><ProjectsIcon name="refresh" class="pjx-spin" /> Loading file history…</div>
      <div v-else-if="!events.length" class="pjx-empty"><ProjectsIcon name="clock" /><b>No file activity yet</b></div>
      <ol v-else class="pjx-fs__history">
        <li v-for="event in events" :key="event.eventID">
          <span class="pjx-chip" :data-tone="opTone(event.operation)">{{ String(event.operation || '').toLowerCase() }}</span>
          <div class="pjx-fs__history-path"><b>{{ event.path }}</b><span v-if="event.previousPath" class="pjx-dim"> from {{ event.previousPath }}</span></div>
          <span class="pjx-dim pjx-fs__history-meta">{{ event.actor?.displayName || 'Unknown' }} · {{ formatDate(event.timestampUtc) }}<template v-if="event.size != null"> · {{ formatBytes(event.size) }}</template></span>
        </li>
      </ol>
      <button v-if="historyCursor" class="pjx-btn pjx-btn--ghost pjx-btn--sm" style="align-self: flex-start" @click="loadMoreHistory">Load older activity</button>
    </template>

    <!-- One dialog for every file action, in the console's own chrome. -->
    <ProjectsDialog :open="!!dialog" :title="dialogTitle" :subtitle="dialog?.entry?.path" @close="dialog = null">
      <template v-if="dialog">
        <div v-if="dialog.kind === 'delete'" class="pjx-note" data-tone="fault">
          {{ dialog.entry?.kind === 'Directory' ? 'The folder and everything inside it will be deleted.' : 'The file will be removed from the shared project filesystem.' }}
        </div>
        <template v-else-if="dialog.kind === 'metadata'">
          <div class="pjx-field">
            <label class="pjx-field__label" for="pjx-fs-notes">Notes for the agents</label>
            <textarea id="pjx-fs-notes" v-model="dialog.description" class="pjx-textarea" maxlength="500" rows="3" placeholder="How should agents use this file?"></textarea>
          </div>
          <label class="pjx-toggle">
            <span class="pjx-toggle__copy"><b>Important</b><span>Flagged files are pointed out to every project worker.</span></span>
            <span class="pjx-switchbox"><input v-model="dialog.important" type="checkbox" class="pjx-switchbox__input" aria-label="Important" /><span class="pjx-switch" :data-on="dialog.important || undefined" aria-hidden="true"></span></span>
          </label>
        </template>
        <div v-else class="pjx-field">
          <label class="pjx-field__label" for="pjx-fs-path">{{ dialog.kind === 'folder' ? 'Folder name or path' : 'Destination path' }}</label>
          <input id="pjx-fs-path" v-model.trim="dialog.value" class="pjx-input pjx-mono" @keyup.enter="confirmDialog" />
        </div>
        <p v-if="dialogError" class="pjx-note" data-tone="fault" role="alert" style="margin-top: 8px">{{ dialogError }}</p>
      </template>
      <template #foot>
        <button class="pjx-btn" @click="dialog = null">Cancel</button>
        <button class="pjx-btn" :class="dialog?.kind === 'delete' ? 'pjx-btn--danger' : 'pjx-btn--primary'" :disabled="working" @click="confirmDialog">
          {{ working ? 'Working…' : dialogAction }}
        </button>
      </template>
    </ProjectsDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import ProjectsDialog from '~/components/Projects/Dialog.vue';
import ProjectsFileUploader from '~/components/Projects/FileUploader.vue';
import ProjectsIcon from '~/components/Projects/Icon.vue';
import { useProjectFiles, type ProjectFileEntry } from '~/composables/useProjectFiles';
import type { PjTone } from '~/scripts/projectsConsole';

const props = defineProps<{ projectId: string; status: string }>();
const api = useProjectFiles();
const currentPath = ref('');
const entries = ref<ProjectFileEntry[]>([]);
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
interface FileDialog { kind: DialogKind; entry?: ProjectFileEntry; value: string; description: string; important: boolean }
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
    const result = await api.list(props.projectId, currentPath.value, search.value, cursor.value);
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
function openEntry(entry: ProjectFileEntry) { entry.kind === 'Directory' ? goTo(entry.path) : download(entry); }
async function download(entry: ProjectFileEntry) {
  error.value = '';
  try { await api.download(props.projectId, entry.path); } catch (e: any) { error.value = e?.message || 'The download failed.'; }
}

function openDialog(kind: DialogKind, entry?: ProjectFileEntry) {
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
  const body: Record<string, unknown> = { projectID: props.projectId };
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
    const result = await api.audit(props.projectId, append ? historyCursor.value : '');
    events.value = append ? [...events.value, ...(result.events || [])] : (result.events || []);
    historyCursor.value = result.nextCursor || '';
  } catch (e: any) { error.value = e?.message || 'Could not load the history.'; }
  finally { historyLoading.value = false; }
}
function loadMoreHistory() { loadHistory(true); }

function baseName(path: string) { return path.split('/').pop() || path; }
function originLabel(origin: string) { return ({ InitialUpload: 'project setup', UserUpload: 'your upload', AgentTool: 'agent-created', Filesystem: 'workspace' } as Record<string, string>)[origin] || origin; }
function opTone(op: string): PjTone {
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

watch(() => props.projectId, () => { currentPath.value = ''; resetPages(); load(); });
onMounted(load);
</script>
