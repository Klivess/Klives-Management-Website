<template>
  <div class="kgx-files" :data-drop="dropping || undefined" @dragover.prevent="onDragOver" @dragleave="dropping = false" @drop.prevent="onDrop">
    <div class="kgx-files__bar">
      <nav class="kgx-crumbs" aria-label="Folder">
        <button class="kgx-crumb" :aria-current="!path ? 'page' : undefined" @click="go('')"><GamesIcon name="server" />server</button>
        <template v-for="(c, i) in crumbs" :key="i">
          <GamesIcon name="chevron-right" class="kgx-crumbs__sep" />
          <button class="kgx-crumb" :aria-current="i === crumbs.length - 1 ? 'page' : undefined" @click="go(crumbs.slice(0, i + 1).join('/'))">{{ c }}</button>
        </template>
      </nav>
      <label class="kgx-files__find">
        <GamesIcon name="search" />
        <input v-model="find" type="search" placeholder="Filter this folder" aria-label="Filter this folder" />
      </label>
      <button class="kgx-iconbtn" title="Reload" aria-label="Reload" @click="load(path)"><GamesIcon name="refresh" :class="{ 'kgx-spin': busy }" /></button>
      <label class="kgx-btn kgx-btn--sm" :data-disabled="!canWrite || undefined" :title="canWrite ? 'Upload into this folder (or drop files here)' : needs.filesWrite">
        <GamesIcon name="upload" />Upload
        <input type="file" multiple hidden :disabled="!canWrite" data-testid="files-upload" @change="onPick" />
      </label>
    </div>

    <p v-if="live && editableHere" class="kgx-note"><GamesIcon name="info" />The server is running: most games read their settings only at start, so restart it after editing.</p>
    <p v-if="error" class="kgx-note" data-tone="crit"><GamesIcon name="alert" />{{ error }}</p>

    <div class="kgx-scroll-x">
      <table class="kgx-table kgx-table--files">
        <thead><tr><th>Name</th><th class="kgx-r">Size</th><th>Modified</th><th class="kgx-r"><span class="kgx-sr">Actions</span></th></tr></thead>
        <tbody>
          <tr v-if="path" class="kgx-files__up" @click="goUp"><td colspan="4"><GamesIcon name="arrow-left" />Up one folder</td></tr>
          <tr v-for="e in shown" :key="e.Path" :data-testid="`file-${e.Name}`" @dblclick="open(e)">
            <td>
              <button class="kgx-files__name" @click="open(e)">
                <GamesIcon :name="kgFileIcon(e)" :class="{ 'kgx-files__dir': e.IsDirectory }" /><span class="kgx-truncate">{{ e.Name }}</span>
              </button>
            </td>
            <td class="kgx-r kgx-num kgx-dim">{{ e.IsDirectory ? '' : kgBytes(e.Size) }}</td>
            <td class="kgx-dim" :title="kgWhen(e.ModifiedUtc)">{{ kgAgo(e.ModifiedUtc, now) }}</td>
            <td class="kgx-r kgx-files__ops">
              <button v-if="!e.IsDirectory && kgIsText(e.Name)" class="kgx-iconbtn" :disabled="!canRead" :title="canRead ? (canWrite ? 'Edit' : 'View') : needs.filesRead" :aria-label="`Edit ${e.Name}`" @click="edit(e)"><GamesIcon name="pen" /></button>
              <button v-if="!e.IsDirectory" class="kgx-iconbtn" :disabled="!canRead" :title="canRead ? 'Download' : needs.filesRead" :aria-label="`Download ${e.Name}`" @click="api.download(`/klivegames/files/download?id=${encodeURIComponent(server.id)}&path=${encodeURIComponent(e.Path)}`, e.Name, e.Size)"><GamesIcon name="download" /></button>
              <button class="kgx-iconbtn" data-tone="crit" :disabled="!canWrite" :title="canWrite ? 'Delete' : needs.filesWrite" :aria-label="`Delete ${e.Name}`" @click="toDelete = e"><GamesIcon name="trash" /></button>
            </td>
          </tr>
          <tr v-if="!shown.length && !busy"><td colspan="4" class="kgx-empty">{{ find ? 'Nothing here matches.' : 'This folder is empty.' }}</td></tr>
        </tbody>
      </table>
    </div>
    <div v-if="dropping" class="kgx-files__drop"><GamesIcon name="upload" />Drop to upload into /{{ path }}</div>

    <GamesDialog :open="!!editing" :title="editing?.Name ?? ''" icon="file" wide :confirm-label="canWrite ? (saving ? 'Saving…' : 'Save') : undefined" :busy="saving" :disabled="!dirty" @close="closeEditor" @confirm="save">
      <p class="kgx-dialog__path kgx-mono">/{{ editing?.Path }}<span v-if="dirty" class="kgx-tag" data-tone="warn">unsaved</span></p>
      <p v-if="discardArmed" class="kgx-note" data-tone="warn"><GamesIcon name="alert" />You have unsaved changes. Close again to discard them, or save.</p>
      <textarea ref="editorBox" v-model="draft" class="kgx-editor" spellcheck="false" :readonly="!canWrite" data-testid="file-editor" @keydown.ctrl.s.prevent="save" @keydown.tab.prevent="indent"></textarea>
      <template #foot-left><span class="kgx-dim kgx-num">{{ lineCount }} lines · Ctrl+S saves</span></template>
    </GamesDialog>

    <GamesDialog :open="!!toDelete" :title="`Delete ${toDelete?.Name}?`" icon="trash" tone="crit" confirm-label="Delete" @close="toDelete = null" @confirm="remove">
      <p>{{ toDelete?.IsDirectory ? 'The folder and everything in it are deleted from the server.' : 'The file is deleted from the server.' }} A backup is the only way back.</p>
    </GamesDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import type { KliveGamesApi } from '~/composables/useKliveGames';
import { kgAgo, kgBytes, kgFileIcon, kgIsText, kgStatus, kgWhen, type KgFileEntry, type KgServer } from '~/scripts/kliveGames';

const props = defineProps<{ server: KgServer; api: KliveGamesApi; now: number; canRead: boolean; canWrite: boolean; needs: { filesRead: string; filesWrite: string } }>();

const path = ref('');
const entries = ref<KgFileEntry[]>([]);
const busy = ref(false);
const error = ref<string | null>(null);
const find = ref('');
const dropping = ref(false);
const live = computed(() => kgStatus(props.server.status).live);
const crumbs = computed(() => path.value.split('/').filter(Boolean));
const editableHere = computed(() => entries.value.some(e => !e.IsDirectory && /\.(properties|cfg|txt|yml|yaml|json|toml)$/i.test(e.Name)));

const shown = computed(() => {
  const words = find.value.toLowerCase();
  return [...entries.value]
    .filter(e => !words || e.Name.toLowerCase().includes(words))
    .sort((a, b) => (a.IsDirectory === b.IsDirectory ? a.Name.localeCompare(b.Name) : a.IsDirectory ? -1 : 1));
});

async function load(p: string) {
  busy.value = true;
  const r = await props.api.listFiles(props.server.id, p);
  busy.value = false;
  if (r.ok) { entries.value = r.data.entries ?? []; path.value = p; error.value = null; find.value = ''; }
  else error.value = r.error;
}
function go(p: string) { load(p); }
function goUp() { load(crumbs.value.slice(0, -1).join('/')); }
function open(e: KgFileEntry) {
  if (e.IsDirectory) go(e.Path);
  else if (kgIsText(e.Name) && props.canRead) edit(e);
}

// ── editor ──
const editing = ref<KgFileEntry | null>(null);
const original = ref('');
const draft = ref('');
const saving = ref(false);
const editorBox = ref<HTMLTextAreaElement | null>(null);
const dirty = computed(() => draft.value !== original.value);
const lineCount = computed(() => draft.value.split('\n').length);

async function edit(e: KgFileEntry) {
  if (e.Size > 4 * 1048576) { props.api.say('warn', `${e.Name} is ${kgBytes(e.Size)}`, 'Too big to edit here; download it instead.'); return; }
  const r = await props.api.readText(props.server.id, e.Path);
  if (!r.ok) { props.api.say('crit', `Couldn't open ${e.Name}`, r.error); return; }
  original.value = r.data;
  draft.value = r.data;
  editing.value = e;
  nextTick(() => editorBox.value?.focus());
}
/** Closing with unsaved changes asks once, inline: close again within 4 s to discard them. */
const discardArmed = ref(false);
let disarm: ReturnType<typeof setTimeout> | null = null;
function closeEditor() {
  if (dirty.value && props.canWrite && !discardArmed.value) {
    discardArmed.value = true;
    if (disarm) clearTimeout(disarm);
    disarm = setTimeout(() => { discardArmed.value = false; }, 4000);
    return;
  }
  discardArmed.value = false;
  editing.value = null;
}
async function save() {
  if (!editing.value || !dirty.value || !props.canWrite) return;
  saving.value = true;
  const r = await props.api.writeText(props.server.id, editing.value.Path, draft.value);
  saving.value = false;
  if (r.ok) { original.value = draft.value; editing.value = null; load(path.value); }
}
function indent(e: KeyboardEvent) {
  const box = e.target as HTMLTextAreaElement;
  const start = box.selectionStart;
  draft.value = `${draft.value.slice(0, start)}  ${draft.value.slice(box.selectionEnd)}`;
  nextTick(() => { box.selectionStart = box.selectionEnd = start + 2; });
}

// ── delete / upload ──
const toDelete = ref<KgFileEntry | null>(null);
async function remove() {
  const e = toDelete.value;
  toDelete.value = null;
  if (!e) return;
  const r = await props.api.deleteFile(props.server.id, e.Path);
  if (r.ok) load(path.value);
}

async function uploadAll(files: File[]) {
  if (!props.canWrite || !files.length) return;
  for (const f of files) await props.api.upload(props.server.id, path.value, f);
  load(path.value);
}
function onPick(e: Event) {
  const input = e.target as HTMLInputElement;
  uploadAll([...(input.files ?? [])]);
  input.value = '';
}
function onDragOver(e: DragEvent) { if (props.canWrite && e.dataTransfer?.types.includes('Files')) dropping.value = true; }
function onDrop(e: DragEvent) {
  dropping.value = false;
  uploadAll([...(e.dataTransfer?.files ?? [])]);
}

onMounted(() => load(''));
watch(() => props.server.id, () => load(''));
</script>
