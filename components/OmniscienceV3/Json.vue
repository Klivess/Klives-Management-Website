<template>
    <span v-if="empty" class="omni-muted">—</span>
    <p v-else-if="typeof parsed === 'string'" class="omni-data text" :style="{ maxHeight }">{{ parsed }}</p>
    <div v-else class="omni-data" :style="{ maxHeight }" data-testid="omni-data">
        <div v-for="(row, i) in rows" :key="i" class="row" :class="row.type" :style="{ paddingLeft: `${row.depth * 14}px` }">
            <span v-if="row.label" class="key">{{ row.label }}</span>
            <template v-if="row.type === 'person'"><NuxtLink :to="omniPersonLink(row.id)">{{ name(row.id) }}</NuxtLink></template>
            <template v-else-if="row.type === 'people'">
                <span class="list"><template v-for="(id, j) in row.ids" :key="id"><template v-if="j">, </template><NuxtLink :to="omniPersonLink(id)">{{ name(id) }}</NuxtLink></template>
                    <template v-if="row.more"> and {{ row.more }} more</template></span>
            </template>
            <template v-else-if="row.type === 'place'"><NuxtLink :to="omniPlaceLink(row.kind, row.id)!">{{ placeName(row.kind, row.id) }}</NuxtLink></template>
            <template v-else-if="row.type === 'member'"><OmniscienceV3SelectionItem :kind="row.kind" :item="row.item" /><span v-if="row.item.score != null" class="omni-muted"> · {{ row.item.score }}</span></template>
            <template v-else-if="row.type === 'job'"><NuxtLink :to="`${OMNI_BASE}/jobs?job=${row.id}`">job #{{ row.id }}</NuxtLink></template>
            <template v-else-if="row.type === 'run'"><NuxtLink :to="`${OMNI_BASE}/tactics?run=${encodeURIComponent(row.id)}`">open the run</NuxtLink></template>
            <template v-else-if="row.type === 'time'"><OmniscienceV3Time :ms="row.ms" mode="absolute" /></template>
            <span v-else-if="row.type === 'text'" class="value">{{ row.text }}</span>
        </div>
        <p v-if="cut" class="omni-muted more">… and more, left out to keep this readable.</p>
    </div>
</template>

<script setup lang="ts">
import { computed, watchEffect } from 'vue';
import { OMNI_BASE } from '~/scripts/omniscience/api';
import { OMNI_HOLDS_ID, OMNI_ID, OMNI_PERSON_ID } from '~/scripts/omniscience/ids';
import type { SelectionItem } from '~/scripts/omniscience/contracts';
import { OMNI_NAMING, omniPersonLink, omniPlaceLink, useOmniNames } from '~/composables/useOmniscienceV3';
import { useOmniPickLabels } from '~/composables/useOmniFilters';

/**
 * Structured data (a job's payload and result, a run's input, progress and output, an event) as people read it: keys
 * in words, nesting as indentation, people and places by name as links to their pages, jobs and runs as links, instants
 * as dates. An id on its own means nothing to anyone, so an id that cannot be named (a message's, an alias's, a key
 * made of ids) is left out rather than shown.
 */
const props = withDefaults(defineProps<{
    /** An object, or a JSON string to be parsed. */
    value: unknown;
    maxHeight?: string;
}>(), { maxHeight: '320px' });

type Row =
    | { depth: number; label: string | null; type: 'group' }
    | { depth: number; label: string | null; type: 'text'; text: string }
    | { depth: number; label: string | null; type: 'time'; ms: number }
    | { depth: number; label: string | null; type: 'person'; id: string }
    | { depth: number; label: string | null; type: 'people'; ids: string[]; more: number }
    | { depth: number; label: string | null; type: 'place'; kind: 'guild' | 'conversation'; id: string }
    | { depth: number; label: string | null; type: 'job'; id: number }
    | { depth: number; label: string | null; type: 'run'; id: string }
    | { depth: number; label: string | null; type: 'member'; kind: string; item: SelectionItem };
/** What a value reads as, before it is placed (its depth and label). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Value = DistributiveOmit<Row, 'depth' | 'label'>;
type TextValue = Extract<Value, { type: 'text' }>;

const MAX_ROWS = 400;
const MAX_ITEMS = 50;
const PERSON = OMNI_PERSON_ID;
const ID = OMNI_ID;
const HOLDS_ID = OMNI_HOLDS_ID;
const PERSON_KEY = /(person|people|persons|author|owner|counterparty|survivor|absorbed|subject|speaker|member|who|^a$|^b$)/i;
const GUILD_KEY = /(guild|server)/i;
const CHAT_KEY = /(conversation|channel|chat|place)/i;

const parsed = computed<unknown>(() => {
    if (typeof props.value !== 'string') return props.value;
    try { return JSON.parse(props.value); } catch { return HOLDS_ID.test(props.value) ? null : props.value; }
});
const empty = computed(() => parsed.value === null || parsed.value === undefined || parsed.value === '' || (typeof parsed.value === 'object' && !rows.value.length));

function isMember(v: unknown): v is SelectionItem {
    return !!v && typeof v === 'object' && typeof (v as SelectionItem).id === 'string';
}

function humanKey(key: string): string {
    const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_.-]+/g, ' ').trim().toLowerCase().split(/\s+/).filter(Boolean);
    while (words.length > 1 && ['id', 'ids', 'ms', 'json'].includes(words[words.length - 1]!)) words.pop();
    if (words.length > 1 && words[words.length - 1] === 'at' && /Ms$/.test(key)) words.pop();
    const text = words.join(' ');
    return text ? text[0]!.toUpperCase() + text.slice(1) : key;
}

/** What one value is, read with the key it sits under. Null: an id that cannot be named, left out. */
function classify(key: string | null, value: unknown): Value | null {
    const k = key ?? '';
    if (typeof value === 'boolean') return { type: 'text', text: value ? 'yes' : 'no' };
    if (typeof value === 'number') {
        if (/^(job|parentJob|childJob)Id$/i.test(k) && Number.isInteger(value)) return { type: 'job', id: value };
        if (/(Ms|At|Time)$/.test(k) && !/(duration|took|elapsed|budget|interval|window|wait|timeout)/i.test(k) && value > 946_684_800_000 && value < 4_102_444_800_000) return { type: 'time', ms: value };
        if (/(probability|confidence|strength|share|ratio|rate)$/i.test(k) && value >= 0 && value <= 1) return { type: 'text', text: `${Math.round(value * 1000) / 10}%` };
        return { type: 'text', text: value.toLocaleString('en-GB') };
    }
    if (typeof value !== 'string') return { type: 'text', text: String(value) };
    const text = value.trim();
    if (!text) return null;
    if (/^(run|parentRun|playbookRun)(Id)?$/i.test(k) && ID.test(text)) return { type: 'run', id: text };
    if (PERSON.test(text) || (PERSON_KEY.test(k) && ID.test(text) && !text.includes(':'))) return { type: 'person', id: text };
    if (ID.test(text) && text.includes(':')) {
        if (GUILD_KEY.test(k)) return { type: 'place', kind: 'guild', id: text };
        if (CHAT_KEY.test(k)) return { type: 'place', kind: 'conversation', id: text };
    }
    if (ID.test(text) || /key$|cursor$/i.test(k) || HOLDS_ID.test(text)) return null;
    return { type: 'text', text: text.length > 600 ? `${text.slice(0, 600)}…` : text };
}

const built = computed(() => {
    const rows: Row[] = [];
    let cut = false;
    const push = (row: Row) => { if (rows.length >= MAX_ROWS) { cut = true; return; } rows.push(row); };

    function walk(value: unknown, key: string | null, depth: number) {
        if (rows.length >= MAX_ROWS) { cut = true; return; }
        const label = key === null ? null : humanKey(key);
        if (value === null || value === undefined) return;
        if (Array.isArray(value)) {
            if (!value.length) return;
            if (value.every(v => v === null || typeof v !== 'object')) {
                const read = value.map(v => classify(key, v));
                const people = read.filter((r): r is { type: 'person'; id: string } => r?.type === 'person').map(r => r.id);
                if (people.length === read.length) { push({ depth, label, type: 'people', ids: people.slice(0, 20), more: Math.max(0, people.length - 20) }); return; }
                const shown = read.filter((r): r is TextValue => r?.type === 'text').map(r => r.text);
                if (shown.length) push({ depth, label, type: 'text', text: shown.slice(0, MAX_ITEMS).join(', ') + (shown.length > MAX_ITEMS ? ` and ${shown.length - MAX_ITEMS} more` : '') });
                else if (read.every(r => r === null)) push({ depth, label, type: 'text', text: `${value.length} item${value.length === 1 ? '' : 's'}` });
                else for (const r of read) if (r) push({ depth, label, ...r } as Row);
                return;
            }
            if (label) push({ depth, label, type: 'group' });
            value.slice(0, MAX_ITEMS).forEach((v, i) => {
                if (i) push({ depth: depth + 1, label: null, type: 'group' });
                walk(v, null, depth + (label ? 1 : 0));
            });
            if (value.length > MAX_ITEMS) push({ depth: depth + 1, label: null, type: 'text', text: `and ${value.length - MAX_ITEMS} more` });
            return;
        }
        if (typeof value === 'object') {
            const obj = value as Record<string, unknown>;
            const entries = Object.entries(obj);
            if (!entries.length) return;
            if (label) push({ depth, label, type: 'group' });
            const inner = depth + (label ? 1 : 0);
            // A set (a tactic's input or output): its members by name, as links where they have a page.
            if (typeof obj.kind === 'string' && Array.isArray(obj.items) && obj.items.every(isMember)) {
                for (const [k, v] of entries) {
                    if (k === 'items') {
                        const items = v as SelectionItem[];
                        push({ depth: inner, label: humanKey('items'), type: 'group' });
                        for (const item of items.slice(0, MAX_ITEMS)) push({ depth: inner + 1, label: null, type: 'member', kind: obj.kind as string, item });
                        if (items.length > MAX_ITEMS) push({ depth: inner + 1, label: null, type: 'text', text: `and ${items.length - MAX_ITEMS} more` });
                    } else walk(v, k, inner);
                }
                return;
            }
            // Whatever carries a name of its own is known by it: its id beside it adds nothing anyone can read.
            const named = ['label', 'name', 'title', 'displayName'].some(n => typeof obj[n] === 'string' && (obj[n] as string).trim());
            for (const [k, v] of entries) if (!(named && k === 'id')) walk(v, k, inner);
            return;
        }
        const read = classify(key, value);
        if (!read) return;
        // An item's own id, once named, needs no label of its own.
        push({ depth, label: key === 'id' && read.type !== 'text' ? null : label, ...read } as Row);
    }

    walk(parsed.value, null, 0);
    // A heading with nothing under it (all it held were ids) says nothing, and a gap between items is needed only between two of them.
    const kept: Row[] = [];
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i]!;
        const next = rows[i + 1];
        if (r.type === 'group') {
            if (r.label !== null && (!next || next.depth <= r.depth)) continue;
            if (r.label === null && (!next || !kept.length || kept[kept.length - 1]!.type === 'group')) continue;
        }
        kept.push(r);
    }
    return { rows: kept, cut };
});
const rows = computed(() => built.value.rows);
const cut = computed(() => built.value.cut);

// ── names for the people and places found ────────────────────────────────
const { name, want } = useOmniNames();
const { labels, want: wantPlace } = useOmniPickLabels();
watchEffect(() => {
    const people: string[] = [];
    const guilds: string[] = [];
    const chats: string[] = [];
    for (const r of rows.value) {
        if (r.type === 'person') people.push(r.id);
        else if (r.type === 'people') people.push(...r.ids);
        else if (r.type === 'place') (r.kind === 'guild' ? guilds : chats).push(r.id);
    }
    if (people.length) want(people);
    if (guilds.length) wantPlace('guild', guilds);
    if (chats.length) wantPlace('conversation', chats);
});
function placeName(kind: 'guild' | 'conversation', id: string): string {
    return labels.value[`${kind}:${id}`] ?? (kind === 'guild' ? `a server ${OMNI_NAMING}` : `a chat ${OMNI_NAMING}`);
}
</script>

<style scoped>
.omni-data {
    margin: 0;
    padding: 8px 12px;
    overflow: auto;
    font-size: 12.5px;
    line-height: 19px;
    background: var(--omni-surface-1, rgba(0, 0, 0, 0.25));
    border: 1px solid var(--omni-line);
    border-radius: var(--omni-radius-sm);
}
.omni-data.text { white-space: pre-wrap; overflow-wrap: anywhere; }
.row { display: flex; gap: 8px; align-items: baseline; min-width: 0; }
.row.group:not(:has(.key)) { height: 6px; }
.row.group .key { color: var(--omni-text-2); font-weight: 600; }
.key { color: var(--omni-muted); flex: 0 0 auto; }
.key::after { content: ''; }
.row:not(.group) .key::after { content: ':'; }
.value, .list { overflow-wrap: anywhere; min-width: 0; }
.omni-data :deep(a) { text-decoration: underline dotted; text-decoration-color: var(--omni-line-strong); text-underline-offset: 3px; }
.omni-data :deep(a:hover) { color: var(--omni-accent); text-decoration-color: currentColor; }
.more { margin: 6px 0 0; font-size: 12px; }
</style>
