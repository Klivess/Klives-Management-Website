<template>
  <div class="pf-panel">
    <div class="pf-head">
      <div>
        <h2>Shared files</h2>
        <p>One project filesystem for you, the Commander, and every sub-agent. Changes include who made them and when.</p>
      </div>
      <div class="pf-head-actions">
        <button :class="{ active: view === 'files' }" @click="view = 'files'">Files</button>
        <button :class="{ active: view === 'history' }" @click="openHistory">History</button>
      </div>
    </div>

    <template v-if="view === 'files'">
      <ProjectsFileUploader
        v-if="!readOnly"
        purpose="existingProject"
        :project-id="projectId"
        :destination-prefix="currentPath"
        title="Upload to this folder"
        hint="Files and folders retain their relative paths. Three files upload concurrently and interrupted files can be retried."
        @committed="afterMutation"
      />
      <div v-else class="pf-readonly">This project is {{ status.toLowerCase() }}. Files remain available to browse and download, but cannot be changed.</div>

      <div class="pf-toolbar">
        <nav class="pf-crumbs" aria-label="Current directory">
          <button @click="goTo('')">Project</button>
          <template v-for="crumb in crumbs" :key="crumb.path">
            <span>/</span><button @click="goTo(crumb.path)">{{ crumb.name }}</button>
          </template>
        </nav>
        <div class="pf-tools">
          <input v-model.trim="search" placeholder="Search this folder" @keyup.enter="searchFiles" />
          <button @click="searchFiles">Search</button>
          <button v-if="!readOnly" @click="newFolder">+ Folder</button>
          <button title="Refresh" @click="load">↻</button>
        </div>
      </div>

      <div v-if="error" class="pf-error">{{ error }}</div>
      <div v-if="loading" class="pf-empty">Loading shared files…</div>
      <div v-else-if="!entries.length" class="pf-empty">{{ search ? 'No matching files.' : 'This folder is empty.' }}</div>
      <div v-else class="pf-table-wrap">
        <table class="pf-table">
          <thead><tr><th>Name</th><th>Size</th><th>Added by</th><th>Modified</th><th>Notes</th><th></th></tr></thead>
          <tbody>
            <tr v-for="entry in entries" :key="entry.fileID" :class="{ selected: selected?.fileID === entry.fileID }" @click="selected = entry" @dblclick="openEntry(entry)">
              <td>
                <button class="pf-name" @click.stop="openEntry(entry)">
                  <span class="pf-kind">{{ entry.kind === 'Directory' ? '▸' : fileIcon(entry) }}</span>
                  <span>{{ baseName(entry.path) }}</span><span v-if="entry.important" class="pf-star" title="Important">★</span>
                </button>
                <span class="pf-origin">{{ originLabel(entry.origin) }}</span>
              </td>
              <td class="pf-muted">{{ entry.kind === 'Directory' ? '—' : formatBytes(entry.size) }}</td>
              <td><span :title="`${entry.createdBy?.type || 'Unknown'} · ${entry.createdBy?.id || ''}`">{{ entry.createdBy?.displayName || 'Unknown' }}</span></td>
              <td class="pf-muted" :title="formatDate(entry.modifiedUtc)">{{ relativeDate(entry.modifiedUtc) }}</td>
              <td class="pf-note" :title="entry.description || ''">{{ entry.description || '—' }}</td>
              <td><button class="pf-more" @click.stop="showActions(entry)">•••</button></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="total > entries.length || cursorStack.length" class="pf-pages">
        <span>{{ total }} item{{ total === 1 ? '' : 's' }}</span>
        <button :disabled="!cursorStack.length" @click="previousPage">Previous</button>
        <button :disabled="!nextCursor" @click="nextPage">Next</button>
      </div>
    </template>

    <template v-else>
      <div v-if="historyLoading" class="pf-empty">Loading file history…</div>
      <div v-else-if="!events.length" class="pf-empty">No file activity yet.</div>
      <ol v-else class="pf-history">
        <li v-for="event in events" :key="event.eventID">
          <span class="pf-history-op">{{ event.operation }}</span>
          <div><strong>{{ event.path }}</strong><span v-if="event.previousPath"> from {{ event.previousPath }}</span></div>
          <small>{{ event.actor?.displayName || 'Unknown' }} · {{ formatDate(event.timestampUtc) }}<span v-if="event.size != null"> · {{ formatBytes(event.size) }}</span></small>
        </li>
      </ol>
      <button v-if="historyCursor" class="pf-load-more" @click="loadMoreHistory">Load older activity</button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import Swal from 'sweetalert2';
import ProjectsFileUploader from '~/components/Projects/FileUploader.vue';
import { useProjectFiles, type ProjectFileEntry } from '~/composables/useProjectFiles';

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
const selected = ref<ProjectFileEntry | null>(null);
const view = ref<'files' | 'history'>('files');
const events = ref<any[]>([]);
const historyCursor = ref('');
const historyLoading = ref(false);

const readOnly = computed(() => ['Completed', 'Archived'].includes(props.status));
const crumbs = computed(() => {
  let path = '';
  return currentPath.value.split('/').filter(Boolean).map(name => ({ name, path: path = path ? `${path}/${name}` : name }));
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const result = await api.list(props.projectId, currentPath.value, search.value, cursor.value);
    entries.value = result.entries || [];
    total.value = result.total || 0;
    nextCursor.value = result.nextCursor || '';
    selected.value = null;
  } catch (e: any) { error.value = e?.message || 'Could not load files.'; }
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
  try { await api.download(props.projectId, entry.path); } catch (e: any) { error.value = e?.message || 'Download failed.'; }
}

async function newFolder() {
  const result = await prompt('New folder', 'Folder name or path', currentPath.value ? `${currentPath.value}/` : '');
  if (!result) return;
  await runMutation('directory', { projectID: props.projectId, path: result });
}

async function showActions(entry: ProjectFileEntry) {
  const actions: Record<string, string> = { download: 'Download' };
  if (entry.kind === 'Directory') delete actions.download;
  if (!readOnly.value) {
    actions.metadata = entry.important ? 'Edit notes / unmark important' : 'Edit notes / mark important';
    actions.move = 'Move / rename';
    actions.copy = 'Copy';
    actions.delete = 'Delete';
  }
  const result = await Swal.fire({
    title: baseName(entry.path),
    input: 'select', inputOptions: actions, inputPlaceholder: 'Choose an action',
    showCancelButton: true, confirmButtonText: 'Continue', confirmButtonColor: '#4d9e39',
    background: '#161516', color: '#fff',
  });
  if (!result.value) return;
  if (result.value === 'download') return download(entry);
  if (result.value === 'metadata') return editMetadata(entry);
  if (result.value === 'move' || result.value === 'copy') {
    const destination = await prompt(result.value === 'move' ? 'Move or rename' : 'Copy path', 'Destination path', entry.path);
    if (destination && destination !== entry.path) await runMutation(result.value, { projectID: props.projectId, path: entry.path, destination });
    return;
  }
  if (result.value === 'delete') await remove(entry);
}

async function editMetadata(entry: ProjectFileEntry) {
  const result = await Swal.fire({
    title: 'Shared-file details',
    html: `<textarea id="pf-description" class="swal2-textarea" maxlength="500" placeholder="Describe how agents should use this file"></textarea><label style="display:flex;gap:8px;justify-content:center"><input id="pf-important" type="checkbox"> Important to project workers</label>`,
    didOpen: () => {
      const description = document.getElementById('pf-description') as HTMLTextAreaElement;
      const important = document.getElementById('pf-important') as HTMLInputElement;
      description.value = entry.description || '';
      important.checked = entry.important;
    },
    preConfirm: () => ({
      description: (document.getElementById('pf-description') as HTMLTextAreaElement).value,
      important: (document.getElementById('pf-important') as HTMLInputElement).checked,
    }),
    showCancelButton: true, confirmButtonText: 'Save', confirmButtonColor: '#4d9e39', background: '#161516', color: '#fff',
  });
  if (result.value) await runMutation('metadata', { projectID: props.projectId, path: entry.path, ...result.value });
}

async function remove(entry: ProjectFileEntry) {
  const result = await Swal.fire({
    icon: 'warning', title: `Delete ${baseName(entry.path)}?`,
    text: entry.kind === 'Directory' ? 'The folder and everything inside it will be deleted.' : 'The file will be removed from the shared project filesystem.',
    showCancelButton: true, confirmButtonText: 'Delete', confirmButtonColor: '#a33', background: '#161516', color: '#fff',
  });
  if (result.isConfirmed) await runMutation('delete', { projectID: props.projectId, path: entry.path, recursive: entry.kind === 'Directory' });
}

async function runMutation(route: string, body: Record<string, unknown>) {
  error.value = '';
  try { await api.mutate(route, body); await afterMutation(); }
  catch (e: any) { error.value = e?.message || `Could not ${route}.`; }
}
async function afterMutation() { resetPages(); await load(); }

async function prompt(title: string, label: string, value: string) {
  const result = await Swal.fire({ title, input: 'text', inputLabel: label, inputValue: value, showCancelButton: true, confirmButtonColor: '#4d9e39', background: '#161516', color: '#fff', inputValidator: v => v.trim() ? undefined : 'A path is required.' });
  return result.value?.trim() || '';
}

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
  } catch (e: any) { error.value = e?.message || 'Could not load history.'; }
  finally { historyLoading.value = false; }
}
function loadMoreHistory() { loadHistory(true); }

function baseName(path: string) { return path.split('/').pop() || path; }
function fileIcon(entry: ProjectFileEntry) { return entry.mimeType?.startsWith('image/') ? '▧' : entry.mimeType?.includes('pdf') ? 'PDF' : '·'; }
function originLabel(origin: string) { return ({ InitialUpload: 'project setup', UserUpload: 'user upload', AgentTool: 'agent-created', Filesystem: 'workspace' } as Record<string, string>)[origin] || origin; }
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

<style scoped>
.pf-panel { background: #161519; border: 1px solid #29292f; border-radius: 9px; padding: 16px; min-height: 420px; }
.pf-head { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 16px; }
.pf-head h2 { margin: 0 0 4px; font-size: 16px; }
.pf-head p { margin: 0; color: #777; font-size: 11px; line-height: 1.5; }
.pf-head-actions { display: flex; align-items: flex-start; gap: 4px; }
.pf-head-actions button, .pf-tools button, .pf-pages button, .pf-load-more { background: #24242a; border: 1px solid #35353c; color: #aaa; border-radius: 5px; padding: 6px 10px; cursor: pointer; }
.pf-head-actions button.active { color: #fff; border-color: #4d9e39; }
.pf-readonly { color: #d9c47f; background: #302d1d; border-radius: 6px; padding: 9px 11px; font-size: 11px; margin-bottom: 12px; }
.pf-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 14px 0 10px; }
.pf-crumbs { display: flex; gap: 6px; align-items: center; min-width: 0; overflow: hidden; }
.pf-crumbs span { color: #555; }
.pf-crumbs button { border: 0; background: none; color: #81b4df; cursor: pointer; padding: 2px; white-space: nowrap; }
.pf-tools { display: flex; gap: 6px; }
.pf-tools input { width: 190px; background: #121217; color: #eee; border: 1px solid #33333a; border-radius: 5px; padding: 6px 8px; }
.pf-error { color: #ff9292; background: #2a1818; padding: 8px; border-radius: 5px; font-size: 11px; margin-bottom: 8px; }
.pf-empty { color: #777; padding: 45px 12px; text-align: center; font-size: 12px; }
.pf-table-wrap { overflow-x: auto; border: 1px solid #29292f; border-radius: 7px; }
.pf-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.pf-table th { text-align: left; color: #666; font-weight: 500; padding: 8px 10px; border-bottom: 1px solid #303037; white-space: nowrap; }
.pf-table td { padding: 8px 10px; border-bottom: 1px solid #24242a; color: #bbb; }
.pf-table tr:last-child td { border-bottom: 0; }
.pf-table tbody tr:hover, .pf-table tbody tr.selected { background: #1c1c21; }
.pf-name { border: 0; padding: 0; background: none; color: #ddd; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; font-size: 12px; }
.pf-kind { color: #7fb0d9; width: 18px; text-align: center; font-size: 9px; }
.pf-star { color: #e1b94f; }
.pf-origin { display: block; color: #555; margin-left: 25px; margin-top: 2px; font-size: 9px; }
.pf-muted { color: #777 !important; white-space: nowrap; }
.pf-note { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #888 !important; }
.pf-more { border: 0; background: none; color: #777; cursor: pointer; }
.pf-pages { display: flex; justify-content: flex-end; align-items: center; gap: 7px; color: #666; font-size: 10px; margin-top: 9px; }
.pf-pages button:disabled { opacity: .35; cursor: default; }
.pf-history { list-style: none; margin: 0; padding: 0; border-top: 1px solid #29292f; }
.pf-history li { display: grid; grid-template-columns: 110px 1fr auto; gap: 12px; align-items: center; border-bottom: 1px solid #29292f; padding: 10px 5px; font-size: 11px; }
.pf-history-op { color: #86bf75; text-transform: lowercase; }
.pf-history div { color: #999; min-width: 0; overflow-wrap: anywhere; }
.pf-history strong { color: #ddd; }
.pf-history small { color: #666; white-space: nowrap; }
.pf-load-more { margin-top: 12px; }
@media (max-width: 800px) { .pf-head, .pf-toolbar { flex-direction: column; align-items: stretch; } .pf-tools { flex-wrap: wrap; } .pf-tools input { flex: 1; } .pf-history li { grid-template-columns: 80px 1fr; } .pf-history small { grid-column: 2; } }
</style>
