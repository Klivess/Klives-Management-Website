<template>
    <section class="os-panel">
        <div class="os-panel-head"><h2><span class="os-panel-code">NTF</span> Notifications</h2><button v-if="items.length" class="os-btn sm ghost" @click="dismissAll">Dismiss all</button></div>
        <div class="os-panel-body">
            <div v-if="error" class="os-error-state"><span>{{ error }}</span><button class="os-btn sm" @click="load">Retry</button></div>
            <article v-for="item in items" :key="item.notif_id" class="os-notification">
                <span class="os-notification-icon" :class="{ failed: item.kind.includes('failed') }">{{ item.kind.includes('failed') ? '!' : '✓' }}</span>
                <div><strong>{{ title(item) }}</strong><p>{{ detail(item) }}</p><time>{{ formatDate(item.created_at, true) }}</time></div>
                <button title="Dismiss" @click="dismiss(item)">×</button>
            </article>
            <div v-if="!items.length && !error" class="os-empty">You're all caught up.</div>
        </div>
    </section>
</template>

<script setup lang="ts">
import { formatDate, omniscienceError, useOmniscienceApi } from '~/composables/useOmniscienceApi';

const emit = defineEmits<{ changed: [count: number] }>();
const api = useOmniscienceApi();
const items = ref<any[]>([]);
const error = ref('');
function title(item: any) { return item.kind === 'replica_failed' ? 'Replica training failed' : item.kind === 'replica_ready' ? 'Replica is ready' : item.kind.replaceAll('_', ' '); }
function detail(item: any) { return item.payload?.display_name || item.payload?.error || (item.person_id ? `Person ${item.person_id}` : 'Omniscience notification'); }
async function load() {
    error.value = '';
    try {
        const data = await api.get('/omniscience/notifications');
        items.value = Array.isArray(data) ? data : data.notifications || [];
        emit('changed', items.value.length);
    } catch (cause) { error.value = omniscienceError(cause, 'Could not load notifications.'); }
}
async function dismiss(item: any) {
    await api.post('/omniscience/notifications/dismiss', { notifId: item.notif_id });
    items.value = items.value.filter(entry => entry.notif_id !== item.notif_id);
    emit('changed', items.value.length);
}
async function dismissAll() { for (const item of [...items.value]) await dismiss(item); }
onMounted(() => {
    void load();
    const timer = setInterval(load, 60_000);
    onBeforeUnmount(() => clearInterval(timer));
});
</script>

<style scoped>
.os-notification { display: flex; align-items: flex-start; gap: 9px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,.045); }
.os-notification:last-child { border-bottom: 0; }
.os-notification-icon { display: grid; place-items: center; width: 24px; height: 24px; flex: 0 0 24px; border-radius: 50%; background: rgba(107,255,159,.1); color: var(--os-green); font: 800 11px var(--os-mono); }
.os-notification-icon.failed { background: rgba(255,90,120,.1); color: var(--os-red); }
.os-notification > div { flex: 1; min-width: 0; }
.os-notification strong { color: var(--os-ink-dim); font-size: 11px; text-transform: capitalize; }
.os-notification p { margin: 2px 0; color: var(--os-muted); font-size: 10px; overflow-wrap: anywhere; }
.os-notification time { color: var(--os-faint); font-size: 9px; }
.os-notification > button { border: 0; background: transparent; color: var(--os-muted); cursor: pointer; font-size: 16px; }
</style>
