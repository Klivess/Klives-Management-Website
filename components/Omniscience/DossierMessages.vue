<template>
    <section class="omx-card" data-testid="omx-messages">
        <div class="omx-toolbar">
            <strong>What {{ name || 'they' }} wrote</strong><span class="omx-dim">newest first</span>
            <span class="omx-grow"></span>
            <input v-model="filter" class="omx-input" style="flex: 0 1 240px" type="search" placeholder="Filter what is loaded" aria-label="Filter loaded messages" />
            <span class="omx-stamp">{{ items.length }} loaded</span>
        </div>
        <div v-if="error" class="omx-card-body"><div class="omx-error" role="alert"><span class="omx-grow">{{ error }}</span><button class="omx-btn sm" type="button" @click="load(true)">Try again</button></div></div>
        <div v-else-if="loading && !items.length" class="omx-skels"><div v-for="n in 6" :key="n" class="omx-skel" :style="{ width: `${45 + (n * 17) % 40}%` }"></div></div>
        <div v-else-if="shown.length">
            <div v-for="m in shown" :key="m.message_id" class="omx-msg">
                <div class="omx-msg-head">
                    <button class="omx-link" type="button" :title="'Open this conversation'" @click="omx.go('talk', { c: m.conversation_id })">{{ omxWhere(m) }}</button>
                    <span :title="omxDateTime(m.sent_at)">{{ omxAgo(m.sent_at, omx.now.value) }}</span>
                </div>
                <div class="omx-msg-text">{{ m.content || '(no text: an attachment or an embed)' }}</div>
            </div>
        </div>
        <div v-else class="omx-empty"><strong>{{ items.length ? 'No loaded message matches' : 'No message from them is stored' }}</strong>{{ items.length ? 'Clear the filter, or load older ones.' : '' }}</div>
        <div v-if="more" class="omx-card-foot"><button class="omx-btn sm" type="button" :disabled="loading" data-testid="omx-messages-more" @click="load(false)">{{ loading ? 'Reading…' : 'Load older' }}</button></div>
    </section>
</template>

<script setup lang="ts">
import { omxAgo, omxDateTime, omxErrorText, omxWhere } from '~/scripts/omniscienceConsole';

/** The person's own messages, straight from the store: the raw material behind everything else in the dossier. */
const PAGE = 100;
const props = defineProps<{ personId: string; name: string }>();
const omx = useOmx();
const items = ref<any[]>([]);
const loading = ref(false);
const more = ref(false);
const error = ref('');
const filter = ref('');

const shown = computed(() => {
    const needle = filter.value.trim().toLowerCase();
    return needle ? items.value.filter(m => String(m.content ?? '').toLowerCase().includes(needle)) : items.value;
});

async function load(reset: boolean) {
    if (loading.value) return;
    loading.value = true; error.value = '';
    try {
        const offset = reset ? 0 : items.value.length;
        const page = await omx.api.get(`/omniscience/persons/messages?personId=${encodeURIComponent(props.personId)}&limit=${PAGE}&offset=${offset}`);
        const rows = Array.isArray(page) ? page : [];
        items.value = reset ? rows : [...items.value, ...rows];
        more.value = rows.length === PAGE;
    } catch (cause) { error.value = omxErrorText(cause, 'Their messages could not be read.'); }
    finally { loading.value = false; }
}
watch(() => props.personId, () => { items.value = []; void load(true); }, { immediate: true });
</script>
