<template>
    <section class="os-panel">
        <div class="os-panel-head">
            <div>
                <h2><span class="os-panel-code">TIME</span> Evidence timeline</h2>
                <p class="os-panel-subtitle">Messages, deductions, identity changes, profiles and operator annotations</p>
            </div>
            <button class="os-btn sm ghost" :disabled="loading || !personId" @click="load">Refresh</button>
        </div>
        <div class="os-panel-body">
            <div class="os-timeline-filters">
                <label><span>From</span><input v-model="fromDate" type="date" class="os-input" /></label>
                <label><span>To</span><input v-model="toDate" type="date" class="os-input" /></label>
                <div class="os-timeline-types">
                    <button v-for="type in availableTypes" :key="type.id" :class="{ active: selectedTypes.includes(type.id) }" @click="toggleType(type.id)">{{ type.label }}</button>
                </div>
                <button class="os-btn cyan" :disabled="!personId || loading" @click="load">Apply</button>
            </div>
            <div v-if="error" class="os-error-state"><span>{{ error }}</span><button class="os-btn sm" @click="load">Retry</button></div>
            <div v-else-if="!personId" class="os-empty">Select a person to reconstruct their timeline.</div>
            <div v-else-if="loading && !events.length" class="os-skeleton-stack"><i /><i /><i /><i /></div>
            <div v-else class="os-timeline">
                <article v-for="event in events" :key="event.type + '-' + event.event_id" class="os-timeline-event" :class="event.type">
                    <div class="os-timeline-marker"><span>{{ icon(event.type) }}</span></div>
                    <div class="os-timeline-card">
                        <header>
                            <div><span class="os-timeline-type">{{ event.type }}</span><strong>{{ event.title }}</strong></div>
                            <time>{{ formatDate(event.at, true) }}</time>
                        </header>
                        <p>{{ event.content }}</p>
                        <footer>
                            <span v-if="event.source">{{ event.source }}</span>
                            <NuxtLink v-if="event.metadata?.conversation_id" :to="conversationLink(event.metadata.conversation_id)">Open conversation →</NuxtLink>
                            <details v-if="(event.evidence || []).length">
                                <summary>{{ event.evidence.length }} evidence message{{ event.evidence.length === 1 ? '' : 's' }}</summary>
                                <div class="os-evidence-ids"><code v-for="id in event.evidence" :key="id">{{ id }}</code></div>
                            </details>
                        </footer>
                    </div>
                </article>
                <div v-if="!events.length && !loading" class="os-empty">No events match this time window and filter.</div>
            </div>
        </div>
    </section>
</template>

<script setup lang="ts">
import { formatDate, omniscienceError, toUnixMs, useOmniscienceApi } from '~/composables/useOmniscienceApi';

const props = defineProps<{ personId: string }>();
const api = useOmniscienceApi();
const availableTypes = [
    { id: 'message', label: 'Messages', icon: 'M' }, { id: 'fact', label: 'Facts', icon: 'F' },
    { id: 'identity', label: 'Identity', icon: 'I' }, { id: 'profile', label: 'Profiles', icon: 'P' },
    { id: 'change', label: 'Changes', icon: 'Δ' }, { id: 'note', label: 'Notes', icon: 'N' },
];
const selectedTypes = ref(availableTypes.map(type => type.id));
const fromDate = ref('');
const toDate = ref('');
const events = ref<any[]>([]);
const loading = ref(false);
const error = ref('');
function icon(type: string) { return availableTypes.find(item => item.id === type)?.icon || '•'; }
function toggleType(type: string) {
    selectedTypes.value = selectedTypes.value.includes(type)
        ? selectedTypes.value.filter(item => item !== type)
        : [...selectedTypes.value, type];
}
function conversationLink(id: string) { return '/omniscience-explore?scope=' + encodeURIComponent(JSON.stringify({ conversationId: id })); }
async function load() {
    if (!props.personId) { events.value = []; return; }
    if (!selectedTypes.value.length) { events.value = []; return; }
    loading.value = true;
    error.value = '';
    try {
        const params = new URLSearchParams({ personId: props.personId, limit: '100', types: selectedTypes.value.join(',') });
        const from = toUnixMs(fromDate.value);
        const to = toUnixMs(toDate.value, true);
        if (from) params.set('from', String(from));
        if (to) params.set('to', String(to));
        const data = await api.get('/omniscience/workspace/timeline?' + params);
        events.value = data.events || [];
    } catch (cause) { error.value = omniscienceError(cause, 'Could not load timeline.'); }
    finally { loading.value = false; }
}
watch(() => props.personId, load, { immediate: true });
</script>

<style scoped>
.os-timeline-filters { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
.os-timeline-filters label > span { display: block; margin-bottom: 4px; color: var(--os-muted); font: 700 9px var(--os-mono); text-transform: uppercase; }
.os-timeline-filters label .os-input { width: 145px; }
.os-timeline-types { display: flex; flex: 1; flex-wrap: wrap; gap: 4px; }
.os-timeline-types button { padding: 6px 8px; border: 1px solid var(--os-line); border-radius: 6px; background: transparent; color: var(--os-muted); cursor: pointer; font-size: 10px; }
.os-timeline-types button.active { border-color: rgba(95,211,255,.45); background: rgba(95,211,255,.09); color: var(--os-cyan); }
.os-timeline { position: relative; margin-left: 7px; }
.os-timeline::before { content: ''; position: absolute; left: 14px; top: 8px; bottom: 8px; width: 1px; background: var(--os-line); }
.os-timeline-event { position: relative; display: grid; grid-template-columns: 30px minmax(0,1fr); gap: 13px; margin-bottom: 13px; }
.os-timeline-marker { z-index: 1; display: grid; place-items: center; width: 29px; height: 29px; border: 1px solid var(--os-line-strong); border-radius: 50%; background: var(--os-bg-2); color: var(--os-cyan); font: 800 10px var(--os-mono); }
.os-timeline-event.fact .os-timeline-marker { color: var(--os-violet); }
.os-timeline-event.note .os-timeline-marker { color: var(--os-amber); }
.os-timeline-card { min-width: 0; padding: 11px 13px; border: 1px solid var(--os-line); border-radius: 10px; background: rgba(255,255,255,.018); }
.os-timeline-card > header { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
.os-timeline-card > header > div { display: flex; align-items: center; gap: 8px; min-width: 0; }
.os-timeline-card strong { color: var(--os-ink); font-size: 11px; }
.os-timeline-card time { flex-shrink: 0; color: var(--os-faint); font: 500 9px var(--os-mono); }
.os-timeline-type { color: var(--os-cyan); font: 750 8px var(--os-mono); letter-spacing: .08em; text-transform: uppercase; }
.os-timeline-card p { margin: 8px 0 0; color: var(--os-ink-dim); font-size: 12px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
.os-timeline-card footer { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 8px; color: var(--os-faint); font-size: 9px; }
.os-timeline-card footer a, .os-timeline-card summary { color: var(--os-cyan); cursor: pointer; text-decoration: none; }
.os-evidence-ids { display: flex; flex-direction: column; gap: 3px; margin-top: 6px; }
.os-evidence-ids code { color: var(--os-muted); font-size: 9px; overflow-wrap: anywhere; }
@media (max-width: 650px) { .os-timeline-card > header { flex-direction: column; } .os-timeline-filters label .os-input { width: 135px; } }
</style>
