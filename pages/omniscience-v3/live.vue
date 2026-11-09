<template>
    <OmniscienceV3Shell>
        <div class="ot-pagehead">
            <div>
                <h1>Live</h1>
                <p class="subtitle">Everything the engine announces as it happens: jobs, tactic progress, rebuilt views, alerts and incoming messages you may see.</p>
            </div>
            <div class="ot-actions">
                <span class="ot-chip" :class="connected ? 'ok' : 'warn'" data-testid="omni-live-state"><span class="ot-dot" :class="connected ? 'ok' : 'warn'"></span>{{ connected ? 'connected' : 'reconnecting…' }}</span>
                <button class="ot-btn" type="button" :aria-pressed="paused" @click="togglePause">{{ paused ? `Resume (${held.length} waiting)` : 'Pause' }}</button>
                <button class="ot-btn ghost" type="button" :disabled="!events.length" @click="events = []">Clear</button>
            </div>
        </div>

        <div class="ot-filterbar">
            <div class="ot-segment" role="group" aria-label="Topic">
                <button type="button" :aria-pressed="filters.topic === ''" @click="filters.topic = ''">All <span class="facet">{{ events.length }}</span></button>
                <button v-for="t in topicGroups" :key="t.prefix" type="button" :aria-pressed="filters.topic === t.prefix" @click="filters.topic = t.prefix">
                    {{ t.prefix }} <span class="facet">{{ t.count }}</span>
                </button>
            </div>
            <label class="ot-search">
                <span class="glyph" aria-hidden="true">⌕</span>
                <span class="visually-hidden">Search events</span>
                <input v-model="filters.q" class="ot-input" type="search" placeholder="text in the event…" />
            </label>
            <span class="summary"><b>{{ shown.length }}</b> of {{ events.length }} events kept (newest {{ KEEP }})</span>
            <div class="grow"></div>
        </div>

        <div v-if="resetReason" class="ot-banner warn" role="status">
            <span class="glyph" aria-hidden="true">⚠</span>
            <div><strong>Some events were missed</strong><span class="muted">The server no longer had everything since this page last heard from it ({{ resetReason }}). What follows is complete from here on.</span></div>
            <div class="actions"><button class="ot-btn sm ghost" type="button" @click="resetReason = null">Dismiss</button></div>
        </div>

        <OmniscienceV3Panel title="Events" subtitle="Newest first." flush :empty="!shown.length"
                            :empty-kind="events.length ? 'filtered' : 'empty'"
                            :empty-title="events.length ? 'No events match' : ready ? 'Waiting for the first event' : 'The engine is not running'"
                            :empty-text="events.length ? undefined : ready ? 'Events appear here the moment the engine publishes them.' : 'Nothing is published until Omniscience v3 is ready.'">
            <ul class="feed">
                <li v-for="ev in shown" :key="ev.id">
                    <button type="button" :aria-expanded="open === ev.id" @click="open = open === ev.id ? null : ev.id">
                        <span class="omni-mono when">{{ at(ev.at, true) }}</span>
                        <span class="ot-chip" :class="topicTone(ev.topic)">{{ ev.topic }}</span>
                        <span class="text">{{ summarise(ev) }}</span>
                        <span class="omni-mono id">#{{ ev.id }}</span>
                    </button>
                    <OmniscienceV3Json v-if="open === ev.id" :value="ev.payload" />
                </li>
            </ul>
        </OmniscienceV3Panel>
    </OmniscienceV3Shell>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';
import type { StreamEventDto } from '~/scripts/omniscience/contracts';
import { useOmniEngine, useOmniStream, useOmniTime } from '~/composables/useOmniscienceV3';
import { useUrlState } from '~/composables/useOmniTrader';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Omniscience v3 · Live' });

/** Events held in the browser. Older ones are on the server (see Jobs and Tactics for history). */
const KEEP = 500;

const { ready } = useOmniEngine();
const { at } = useOmniTime();
const { state: filters } = useUrlState({ topic: '', q: '' });

const events = shallowRef<StreamEventDto[]>([]);
const held = shallowRef<StreamEventDto[]>([]);
const paused = ref(false);
const open = ref<number | null>(null);
const resetReason = ref<string | null>(null);

// Events arrive in bursts (a replay, a busy job): collect them and paint once per frame.
let pending: StreamEventDto[] = [];
let scheduled = false;
function flush() {
    scheduled = false;
    const batch = pending;
    pending = [];
    if (paused.value) held.value = [...held.value, ...batch].slice(-KEEP);
    else events.value = [...batch.reverse(), ...events.value].slice(0, KEEP);
}

const { connected } = useOmniStream({
    onEvent: event => {
        pending.push(event);
        if (!scheduled) { scheduled = true; requestAnimationFrame(flush); }
    },
    onReset: reason => { resetReason.value = reason; },
});

function togglePause() {
    paused.value = !paused.value;
    if (!paused.value && held.value.length) {
        events.value = [...held.value.slice().reverse(), ...events.value].slice(0, KEEP);
        held.value = [];
    }
}

const prefixOf = (topic: string) => topic.split('.')[0] ?? topic;
const topicGroups = computed(() => {
    const counts = new Map<string, number>();
    for (const ev of events.value) counts.set(prefixOf(ev.topic), (counts.get(prefixOf(ev.topic)) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([prefix, count]) => ({ prefix, count }));
});

const shown = computed(() => {
    const needle = filters.q.trim().toLowerCase();
    return events.value.filter(ev =>
        (!filters.topic || prefixOf(ev.topic) === filters.topic)
        && (!needle || `${ev.topic} ${JSON.stringify(ev.payload)}`.toLowerCase().includes(needle)));
});

function topicTone(topic: string): string {
    if (topic.startsWith('alert')) return 'warn';
    if (topic.endsWith('.finished')) return 'ok';
    if (topic.startsWith('live.')) return 'violet';
    return 'info';
}

/** A one-line reading of a payload: the fields a person would look for first. */
function summarise(ev: StreamEventDto): string {
    const p = ev.payload as Record<string, any> | null;
    if (!p || typeof p !== 'object') return p === null || p === undefined ? '' : String(p);
    const parts: string[] = [];
    for (const key of ['moduleId', 'module', 'kind', 'tactic', 'model', 'key', 'jobId', 'runId', 'state', 'stage', 'message', 'title', 'error']) {
        const value = p[key] ?? p.detail?.[key];
        if (value !== undefined && value !== null && typeof value !== 'object') parts.push(`${key} ${value}`);
    }
    return parts.length ? parts.join(' · ') : JSON.stringify(p).slice(0, 160);
}
</script>

<style scoped>
.feed { list-style: none; margin: 0; padding: 0; }
.feed li { border-bottom: 1px solid var(--ot-line); }
.feed button {
    display: grid; grid-template-columns: auto auto minmax(0, 1fr) auto; gap: 10px; align-items: center; width: 100%;
    padding: 6px 12px; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer;
}
.feed button:hover { background: rgba(255, 255, 255, 0.04); }
.feed .when, .feed .id { color: var(--ot-muted); font-size: 11.5px; }
.feed .text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; }
.ot-banner .muted { display: block; color: var(--ot-text-2); }
</style>
