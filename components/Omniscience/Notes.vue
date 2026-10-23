<template>
    <section class="os-panel">
        <div class="os-panel-head">
            <div><h2><span class="os-panel-code">NOTE</span> Investigator notes</h2><p class="os-panel-subtitle">Private annotations stay separate from evidence, deductions and Replica training</p></div>
            <button class="os-btn sm cyan" @click="startNew">+ Add note</button>
        </div>
        <div class="os-panel-body">
            <form v-if="editing" class="os-note-editor" @submit.prevent="save">
                <textarea v-model="draft.content" class="os-input" rows="4" maxlength="12000" placeholder="Record a lead, interpretation or follow-up…" />
                <div class="os-field-row">
                    <input v-model="draft.tags" class="os-input" maxlength="300" placeholder="Tags (comma separated)" />
                    <button class="os-btn cyan" type="submit" :disabled="saving || !draft.content.trim()">{{ saving ? 'Saving…' : 'Save note' }}</button>
                    <button class="os-btn ghost" type="button" @click="editing = false">Cancel</button>
                </div>
            </form>
            <div v-if="error" class="os-error-state"><span>{{ error }}</span><button class="os-btn sm" @click="load">Retry</button></div>
            <div v-else-if="loading && !notes.length" class="os-skeleton-stack"><i /><i /></div>
            <div v-else class="os-notes-grid">
                <article v-for="note in notes" :key="note.note_id" class="os-note-card">
                    <p>{{ note.content }}</p>
                    <div class="os-note-tags"><span v-for="tag in tags(note.tags)" :key="tag">#{{ tag }}</span></div>
                    <footer><time>{{ formatDate(note.updated_at, true) }}</time><div><button @click="edit(note)">Edit</button><button class="danger" @click="remove(note)">Delete</button></div></footer>
                </article>
                <div v-if="!notes.length && !editing" class="os-empty">No investigator notes yet. Add a lead or follow-up above.</div>
            </div>
        </div>
    </section>
</template>

<script setup lang="ts">
import { formatDate, omniscienceError, useOmniscienceApi } from '~/composables/useOmniscienceApi';

const props = defineProps<{ personId: string }>();
const api = useOmniscienceApi();
const notes = ref<any[]>([]);
const loading = ref(false);
const saving = ref(false);
const editing = ref(false);
const error = ref('');
const draft = reactive({ noteId: '', content: '', tags: '' });
function tags(value: string) { return (value || '').split(',').map(tag => tag.trim()).filter(Boolean); }
function startNew() { Object.assign(draft, { noteId: '', content: '', tags: '' }); editing.value = true; }
function edit(note: any) { Object.assign(draft, { noteId: note.note_id, content: note.content, tags: note.tags || '' }); editing.value = true; }
async function load() {
    if (!props.personId) { notes.value = []; return; }
    loading.value = true; error.value = '';
    try { const data = await api.get('/omniscience/workspace/notes?personId=' + encodeURIComponent(props.personId)); notes.value = data.notes || []; }
    catch (cause) { error.value = omniscienceError(cause, 'Could not load notes.'); }
    finally { loading.value = false; }
}
async function save() {
    saving.value = true; error.value = '';
    try {
        await api.post('/omniscience/workspace/notes/save', { ...draft, personId: props.personId });
        editing.value = false;
        await load();
    } catch (cause) { error.value = omniscienceError(cause, 'Could not save note.'); }
    finally { saving.value = false; }
}
async function remove(note: any) {
    if (!confirm('Delete this investigator note?')) return;
    try { await api.post('/omniscience/workspace/notes/delete', { noteId: note.note_id }); notes.value = notes.value.filter(item => item.note_id !== note.note_id); }
    catch (cause) { error.value = omniscienceError(cause, 'Could not delete note.'); }
}
watch(() => props.personId, load, { immediate: true });
</script>

<style scoped>
.os-note-editor { padding: 12px; margin-bottom: 13px; border: 1px solid var(--os-line-strong); border-radius: 10px; background: rgba(95,211,255,.035); }
.os-note-editor textarea { margin-bottom: 8px; resize: vertical; }
.os-note-editor .os-field-row input { flex: 1; }
.os-notes-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(260px,1fr)); gap: 10px; }
.os-note-card { display: flex; flex-direction: column; min-height: 150px; padding: 13px; border: 1px solid rgba(255,194,71,.18); border-radius: 10px; background: linear-gradient(145deg,rgba(255,194,71,.045),rgba(255,255,255,.012)); }
.os-note-card p { flex: 1; margin: 0; color: var(--os-ink-dim); font-size: 12px; line-height: 1.55; white-space: pre-wrap; }
.os-note-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; color: var(--os-amber); font-size: 9px; }
.os-note-card footer { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 10px; }
.os-note-card time { color: var(--os-faint); font-size: 9px; }
.os-note-card footer button { padding: 2px 4px; border: 0; background: transparent; color: var(--os-cyan); cursor: pointer; font-size: 10px; }
.os-note-card footer button.danger { color: var(--os-red); }
</style>
