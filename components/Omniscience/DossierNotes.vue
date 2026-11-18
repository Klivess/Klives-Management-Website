<template>
    <div class="omx-grid" data-testid="omx-notes">
        <section class="omx-card">
            <div class="omx-card-head"><h2>Your notes</h2><span class="omx-sub">{{ notes.length }}</span></div>
            <div v-if="error" class="omx-card-body"><div class="omx-error" role="alert"><span class="omx-grow">{{ error }}</span><button class="omx-btn sm" type="button" @click="load()">Try again</button></div></div>
            <div v-else-if="loading" class="omx-skels"><div class="omx-skel" style="width: 60%"></div><div class="omx-skel" style="width: 40%"></div></div>
            <div v-else-if="notes.length">
                <div v-for="note in notes" :key="note.note_id" class="omx-msg">
                    <div class="omx-msg-head">
                        <span>{{ omxDateTime(note.updated_at) }}</span>
                        <span v-for="tag in tagsOf(note.tags)" :key="tag" class="omx-chip">{{ tag }}</span>
                        <span class="omx-grow"></span>
                        <button class="omx-btn quiet sm icon" type="button" aria-label="Delete this note" @click="remove(note)"><OmniscienceIcon name="trash" /></button>
                    </div>
                    <div class="omx-msg-text">{{ note.content }}</div>
                </div>
            </div>
            <div v-else class="omx-empty"><strong>No notes yet</strong>Notes are yours alone: the engine never reads them as evidence.</div>
        </section>
        <form class="omx-card" @submit.prevent="save()">
            <div class="omx-card-head"><h2>Write a note</h2></div>
            <div class="omx-card-body omx-stack">
                <textarea v-model="draft.content" class="omx-textarea" rows="5" maxlength="4000" placeholder="What you want to remember about them" aria-label="Note" data-testid="omx-note-text"></textarea>
                <input v-model="draft.tags" class="omx-input" maxlength="200" placeholder="Tags, separated by commas (optional)" aria-label="Tags" />
                <button class="omx-btn primary" type="submit" :disabled="!draft.content.trim() || !!omx.busy.value">Save note</button>
            </div>
        </form>
    </div>
</template>

<script setup lang="ts">
import { omxDateTime, omxErrorText } from '~/scripts/omniscienceConsole';

/** Klives's own notes about a person. */
const props = defineProps<{ personId: string }>();
const omx = useOmx();
const notes = ref<any[]>([]);
const loading = ref(true);
const error = ref('');
const draft = reactive({ content: '', tags: '' });

const tagsOf = (tags: unknown) => String(tags ?? '').split(',').map(t => t.trim()).filter(Boolean);

async function load() {
    loading.value = true; error.value = '';
    try { notes.value = (await omx.api.get('/omniscience/workspace/notes?personId=' + encodeURIComponent(props.personId)))?.notes ?? []; }
    catch (cause) { error.value = omxErrorText(cause, 'Your notes could not be read.'); }
    finally { loading.value = false; }
}
async function save() {
    const ok = await omx.act('note', () => omx.api.post('/omniscience/workspace/notes/save', { content: draft.content.trim(), tags: draft.tags.trim(), personId: props.personId }), 'Note saved');
    if (ok) { draft.content = ''; draft.tags = ''; await load(); }
}
async function remove(note: any) {
    if (!await omx.confirm({ title: 'Delete this note?', text: String(note.content).slice(0, 160), yes: 'Delete', danger: true })) return;
    if (await omx.act('note-delete', () => omx.api.post('/omniscience/workspace/notes/delete', { noteId: note.note_id }), 'Note deleted')) notes.value = notes.value.filter(n => n.note_id !== note.note_id);
}
watch(() => props.personId, load, { immediate: true });
</script>
