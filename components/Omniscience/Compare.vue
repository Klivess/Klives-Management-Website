<template>
    <section class="os-panel">
        <div class="os-panel-head">
            <div><h2><span class="os-panel-code">CMP</span> Person comparison</h2><p class="os-panel-subtitle">Compare coverage, activity and the evidence connecting two people</p></div>
            <button class="os-btn sm ghost" title="Swap people" @click="swap">⇄ Swap</button>
        </div>
        <div class="os-panel-body">
            <div class="os-compare-selectors">
                <OmnisciencePersonPicker v-model="left" label="Left person" />
                <span>versus</span>
                <OmnisciencePersonPicker v-model="right" label="Right person" />
                <button class="os-btn cyan" :disabled="!left || !right || left === right || loading" @click="load">Compare</button>
            </div>
            <div v-if="left === right && left" class="os-field-error">Choose two different people.</div>
            <div v-if="error" class="os-error-state"><span>{{ error }}</span><button class="os-btn sm" @click="load">Retry</button></div>
            <div v-else-if="loading" class="os-skeleton-stack"><i /><i /><i /></div>
            <template v-else-if="data">
                <div class="os-compare-grid">
                    <article v-for="side in ['left','right']" :key="side" class="os-compare-person" :class="side">
                        <div class="os-compare-person-head"><span class="os-compare-avatar">{{ initials(data[side].display_name) }}</span><div><h3>{{ data[side].display_name }}</h3><span class="os-badge" :class="data[side].tier">{{ data[side].tier }}</span></div></div>
                        <div class="os-compare-metrics">
                            <div><span>Messages</span><strong>{{ formatCompact(data[side].message_count) }}</strong></div>
                            <div><span>Active facts</span><strong>{{ formatCompact(data[side].facts) }}</strong></div>
                            <div><span>Relationships</span><strong>{{ formatCompact(data[side].relationships) }}</strong></div>
                            <div><span>Replica eras</span><strong>{{ formatCompact(data[side].eras) }}</strong></div>
                        </div>
                        <p>First seen {{ formatDate(data[side].first_message_at) }} · latest {{ formatDate(data[side].last_message_at) }}</p>
                        <NuxtLink :to="`/omniscience-person?personId=${data[side].person_id}`">Open dossier →</NuxtLink>
                    </article>
                </div>
                <div class="os-compare-overlap">
                    <div><span>Message ratio</span><strong>{{ data.message_ratio || '—' }}</strong><small>left / right</small></div>
                    <div><span>Shared conversations</span><strong>{{ data.shared_conversation_count }}</strong><small>known shared spaces</small></div>
                    <div><span>Direct links</span><strong>{{ (data.relationship_links || []).length }}</strong><small>typed relationship edges</small></div>
                </div>
                <div class="os-cols two">
                    <section>
                        <div class="os-chart-heading"><span>Shared conversations</span></div>
                        <NuxtLink v-for="conversation in data.shared_conversations" :key="conversation.conversation_id" class="os-row click" :to="conversationLink(conversation.conversation_id)">
                            <div class="os-row-main"><strong>{{ conversation.title }}</strong><small>{{ conversation.context_kind }}</small></div><span>→</span>
                        </NuxtLink>
                        <div v-if="!data.shared_conversations?.length" class="os-empty">No shared conversations recorded.</div>
                    </section>
                    <section>
                        <div class="os-chart-heading"><span>Relationship evidence</span></div>
                        <div v-for="link in data.relationship_links" :key="link.rel_id" class="os-fact">
                            <span class="os-fact-cat">{{ Math.round(link.confidence * 100) }}%</span>
                            <div class="os-fact-body"><div class="os-fact-text">{{ direction(link) }}</div><div class="os-fact-meta">{{ link.rel_type }} · {{ formatDate(link.valid_from) }}–{{ link.valid_to ? formatDate(link.valid_to) : 'present' }}</div></div>
                        </div>
                        <div v-if="!data.relationship_links?.length" class="os-empty">No direct typed edges.</div>
                    </section>
                </div>
            </template>
            <div v-else class="os-empty">Choose two people to compare their intelligence profiles.</div>
        </div>
    </section>
</template>

<script setup lang="ts">
import { formatCompact, formatDate, omniscienceError, useOmniscienceApi } from '~/composables/useOmniscienceApi';

const props = withDefaults(defineProps<{ initialLeft?: string; initialRight?: string }>(), { initialLeft: '', initialRight: '' });
const api = useOmniscienceApi();
const left = ref(props.initialLeft);
const right = ref(props.initialRight);
const data = ref<any>(null);
const loading = ref(false);
const error = ref('');
function initials(name: string) { return (name || '?').slice(0, 2).toUpperCase(); }
function swap() { [left.value, right.value] = [right.value, left.value]; data.value = null; }
function conversationLink(id: string) { return '/omniscience-explore?scope=' + encodeURIComponent(JSON.stringify({ conversationId: id })); }
function direction(link: any) { return `${name(link.owner_person_id)} → ${name(link.related_person_id)}`; }
function name(id: string) { return id === data.value.left.person_id ? data.value.left.display_name : id === data.value.right.person_id ? data.value.right.display_name : id; }
async function load() {
    if (!left.value || !right.value || left.value === right.value) return;
    loading.value = true; error.value = '';
    try { data.value = await api.get(`/omniscience/workspace/compare?left=${encodeURIComponent(left.value)}&right=${encodeURIComponent(right.value)}`); }
    catch (cause) { error.value = omniscienceError(cause, 'Comparison failed.'); }
    finally { loading.value = false; }
}
onMounted(() => { if (left.value && right.value) void load(); });
</script>

<style scoped>
.os-compare-selectors { display: grid; grid-template-columns: minmax(0,1fr) auto minmax(0,1fr) auto; align-items: end; gap: 10px; margin-bottom: 18px; }
.os-compare-selectors > span { padding-bottom: 10px; color: var(--os-faint); font: 700 10px var(--os-mono); text-transform: uppercase; }
.os-compare-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }
.os-compare-person { padding: 15px; border: 1px solid var(--os-line); border-radius: 11px; background: rgba(255,255,255,.018); }
.os-compare-person.left { border-top: 2px solid var(--os-cyan); }
.os-compare-person.right { border-top: 2px solid var(--os-violet); }
.os-compare-person-head { display: flex; align-items: center; gap: 10px; }
.os-compare-avatar { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 10px; background: rgba(95,211,255,.1); color: var(--os-cyan); font: 800 13px var(--os-mono); }
.os-compare-person h3 { display: inline; margin: 0 8px 0 0; color: var(--os-ink); font-size: 15px; }
.os-compare-metrics { display: grid; grid-template-columns: repeat(2,1fr); gap: 7px; margin: 14px 0 10px; }
.os-compare-metrics > div { padding: 8px; border-radius: 7px; background: rgba(255,255,255,.025); }
.os-compare-metrics span { display: block; color: var(--os-muted); font-size: 9px; }
.os-compare-metrics strong { display: block; margin-top: 3px; color: var(--os-ink); font: 750 17px var(--os-mono); }
.os-compare-person p { color: var(--os-faint); font-size: 9px; }
.os-compare-person > a { color: var(--os-cyan); font-size: 10px; text-decoration: none; }
.os-compare-overlap { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin: 12px 0 18px; }
.os-compare-overlap > div { padding: 10px; border: 1px solid var(--os-line); border-radius: 8px; text-align: center; }
.os-compare-overlap span, .os-compare-overlap small { display: block; color: var(--os-muted); font-size: 9px; }
.os-compare-overlap strong { display: block; margin: 3px 0; color: var(--os-cyan); font: 750 19px var(--os-mono); }
.os-field-error { color: var(--os-red); font-size: 11px; }
@media (max-width: 760px) { .os-compare-selectors { grid-template-columns: 1fr; } .os-compare-selectors > span { padding: 0; text-align: center; } .os-compare-grid { grid-template-columns: 1fr; } }
</style>
