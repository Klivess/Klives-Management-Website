<template>
    <div v-if="open" class="ot-modal-backdrop" @click.self="close">
        <div class="ot-modal ms-add" role="dialog" aria-modal="true" aria-labelledby="ms-add-title">
            <header>
                <h3 id="ms-add-title">Add an Instagram source</h3>
                <button class="ot-btn ghost sm" aria-label="Close" @click="close">✕</button>
            </header>
            <div class="body">
                <form id="ms-add-form" class="form" @submit.prevent="submit">
                    <div class="ot-field" :class="{ invalid: !!usernameProblem && touched }">
                        <label for="ms-add-username">Account</label>
                        <input id="ms-add-username" ref="usernameInput" v-model="raw" class="ot-input" type="text" autocomplete="off" spellcheck="false"
                               placeholder="@account or instagram.com/account" :disabled="submitting" @blur="touched = true" />
                        <span class="help">{{ touched && usernameProblem ? usernameProblem : username ? `Will add @${username}` : 'A username, @handle or profile link.' }}</span>
                    </div>

                    <div class="ot-field">
                        <label for="ms-add-niches">Niches</label>
                        <OmniTumblrTagInput v-model="niches" input-id="ms-add-niches" prefix="" placeholder="Add a niche and press Enter" label="Niches" :disabled="submitting" />
                        <div v-if="suggestions.length" class="suggest">
                            <span class="muted">Existing:</span>
                            <button v-for="n in suggestions" :key="n" type="button" class="ot-chip" :disabled="submitting" @click="niches = [...niches, n]">+ {{ n }}</button>
                        </div>
                        <span class="help">OmniGram and OmniTumblr pick reels by niche, so tag what this account posts.</span>
                    </div>

                    <label class="ot-check"><input v-model="downloadReels" type="checkbox" :disabled="submitting" /> Download its reels on the schedule</label>

                    <p class="note">The account is looked up on Instagram in the background (a minute or two). It appears under Sources when that finishes, and its first scrape starts right after.</p>
                </form>
            </div>
            <footer>
                <button class="ot-btn ghost" type="button" :disabled="submitting" @click="close">Cancel</button>
                <button class="ot-btn primary" type="submit" form="ms-add-form" :disabled="!!usernameProblem || submitting">{{ submitting ? 'Adding…' : 'Add source' }}</button>
            </footer>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import Swal from 'sweetalert2';
import { RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import { toast } from '~/composables/useMemeScraper';

const props = defineProps<{ open: boolean; existingNiches?: string[]; existingSources?: string[] }>();
const emit = defineEmits<{ close: []; added: [username: string] }>();

const raw = ref('');
const niches = ref<string[]>([]);
const downloadReels = ref(true);
const submitting = ref(false);
const touched = ref(false);
const usernameInput = ref<HTMLInputElement | null>(null);

/** Mirrors MemeScraperSources.NormalizeUsername on the server. */
const username = computed(() => {
    let s = raw.value.trim();
    const marker = s.toLowerCase().indexOf('instagram.com/');
    if (marker >= 0) s = s.substring(marker + 'instagram.com/'.length);
    s = s.split(/[?#]/)[0].replace(/^\/+|\/+$/g, '').split('/')[0];
    return s.replace(/^@+/, '').trim();
});

const usernameProblem = computed(() => {
    if (!username.value) return 'Enter an account.';
    if (!/^[A-Za-z0-9._]{1,30}$/.test(username.value)) return 'Instagram usernames use letters, numbers, dots and underscores (30 at most).';
    if ((props.existingSources ?? []).some(s => s.toLowerCase() === username.value.toLowerCase())) return `@${username.value} is already a source; edit it from its drawer.`;
    return null;
});

const suggestions = computed(() => (props.existingNiches ?? [])
    .filter(n => !niches.value.some(x => x.toLowerCase() === n.toLowerCase()))
    .slice(0, 14));

watch(() => props.open, async open => {
    if (!open) return;
    raw.value = '';
    niches.value = [];
    downloadReels.value = true;
    touched.value = false;
    await nextTick();
    usernameInput.value?.focus();
});

function close() {
    if (!submitting.value) emit('close');
}

async function submit() {
    touched.value = true;
    if (usernameProblem.value) return;
    submitting.value = true;
    try {
        const response = await RequestPOSTFromKliveAPI('/memescraper/addInstagramSource',
            JSON.stringify({ username: username.value, downloadReels: downloadReels.value, downloadPosts: false, niches: niches.value }), false, true);
        if (response.ok) {
            toast(`Looking up @${username.value}…`);
            emit('added', username.value);
            emit('close');
        } else if (response.status !== 401 && response.status !== 403) {
            const text = await response.text().catch(() => '');
            let message = text;
            try { message = JSON.parse(text).error ?? text; } catch { /* plain text */ }
            void Swal.fire({ background: '#191d16', color: '#e9f1e5', confirmButtonColor: '#4c9e38', icon: 'error', title: 'Not added', text: message || `HTTP ${response.status}` });
        }
    } finally {
        submitting.value = false;
    }
}
</script>

<style scoped>
.ms-add { width: min(560px, 100%); }
.form { display: flex; flex-direction: column; gap: var(--ot-space-4); }
.suggest { display: flex; flex-wrap: wrap; gap: var(--ot-space-1); align-items: center; font-size: 11.5px; margin-top: var(--ot-space-1); }
.suggest .ot-chip { cursor: pointer; background: transparent; font-family: inherit; }
.suggest .ot-chip:hover:not(:disabled) { border-color: var(--ot-accent); color: var(--ot-text); }
.note { margin: 0; font-size: 12px; color: var(--ot-muted); }
</style>
