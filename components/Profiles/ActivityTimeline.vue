<template>
    <div class="tl">
        <template v-for="day in days" :key="day.label">
            <h4 class="tl-day">{{ day.label }}</h4>
            <ol class="tl-list">
                <li v-for="item in day.items" :key="itemKey(item)" class="tl-item" :class="[item.type, toneOf(item), { fresh: freshKeys?.has(itemKey(item)) }]">
                    <time class="tl-time" :datetime="new Date(item.tsMs).toISOString()" :title="new Date(item.tsMs).toLocaleString()">{{ clock(item.tsMs) }}</time>
                    <span class="tl-glyph" aria-hidden="true">{{ glyphOf(item) }}</span>

                    <div v-if="item.type === 'request'" class="tl-body">
                        <div class="tl-line">
                            <span class="tl-method">{{ item.method || 'GET' }}</span>
                            <code class="tl-route" :title="item.route ?? ''">{{ item.route }}</code>
                            <span class="tl-status" :class="statusTone(item.status)">{{ item.status }}</span>
                            <span v-if="item.viaBatch" class="tl-tag">batch</span>
                        </div>
                        <div class="tl-meta">
                            <span v-if="item.permKey" :title="item.permKey">{{ titleOf(item.permKey) }}</span>
                            <span v-if="item.denyReason" class="tl-deny">refused · {{ denyReasonText(item.denyReason) }}</span>
                            <span v-if="item.durationMs != null">{{ Math.round(item.durationMs) }} ms</span>
                            <span v-if="item.page" :title="item.page">from {{ item.page }}</span>
                            <span v-if="showIp && item.ip">{{ item.ip }}</span>
                        </div>
                    </div>

                    <div v-else-if="item.type === 'page'" class="tl-body">
                        <div class="tl-line">
                            <span>Viewed <strong>{{ item.title || item.path || item.page }}</strong></span>
                        </div>
                        <div class="tl-meta">
                            <code v-if="item.title" class="tl-route">{{ item.page ?? item.route }}</code>
                            <span v-if="item.dwellMs">for {{ durationShort(item.dwellMs) }}</span>
                        </div>
                    </div>

                    <div v-else class="tl-body">
                        <div class="tl-line">
                            <strong>{{ eventMeta(item.kind).label }}</strong>
                            <span v-if="eventDetail(item)" class="tl-detail">{{ eventDetail(item) }}</span>
                        </div>
                        <div class="tl-meta">
                            <span v-if="item.actorName && item.actorId !== profileId">by {{ item.actorName }}</span>
                            <span v-if="showIp && item.ip">{{ item.ip }}</span>
                        </div>
                    </div>
                </li>
            </ol>
        </template>

        <OmniTraderStateBlock v-if="!items.length && !loading" :kind="filtered ? 'filtered' : 'empty'"
                              :title="filtered ? 'Nothing matches these filters' : 'No activity yet'"
                              :detail="filtered ? '' : 'Requests, page views, sign-ins and access changes appear here.'" compact />
        <div v-if="loading" class="tl-loading"><span class="ot-skel"></span><span class="ot-skel"></span><span class="ot-skel"></span></div>
        <div v-if="hasMore && !loading" class="tl-more">
            <button type="button" class="ot-btn ghost sm" @click="$emit('more')">Load older</button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { TimelineItem } from '~/scripts/profilesApi';
import { denyReasonText, durationShort, eventDetail, eventMeta } from '~/scripts/profileFormat';

const props = withDefaults(defineProps<{
    items: (TimelineItem & { path?: string | null })[];
    loading?: boolean;
    hasMore?: boolean;
    filtered?: boolean;
    profileId?: string;
    showIp?: boolean;
    /** Keys of items that just arrived live (briefly highlighted). */
    freshKeys?: Set<string> | null;
    titleOf?: (key: string) => string;
}>(), { loading: false, hasMore: false, filtered: false, profileId: '', showIp: true, freshKeys: null, titleOf: (k: string) => k });

defineEmits<{ more: [] }>();

function itemKey(item: TimelineItem) {
    return `${item.type}:${item.tsMs}:${item.route ?? item.kind ?? item.page ?? ''}:${item.status ?? ''}`;
}

const days = computed(() => {
    const out: { label: string; items: typeof props.items }[] = [];
    const today = new Date();
    const yesterday = new Date(Date.now() - 86_400_000);
    for (const item of props.items) {
        const d = new Date(item.tsMs);
        const label = d.toDateString() === today.toDateString() ? 'Today'
            : d.toDateString() === yesterday.toDateString() ? 'Yesterday'
                : d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
        const last = out[out.length - 1];
        if (last && last.label === label) last.items.push(item);
        else out.push({ label, items: [item] });
    }
    return out;
});

function clock(ms: number) {
    return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
}

function statusTone(status: number | null | undefined) {
    if (!status) return '';
    if (status >= 500) return 'bad';
    if (status === 401 || status === 403) return 'warn';
    if (status >= 400) return 'warn';
    return 'ok';
}

function toneOf(item: TimelineItem) {
    if (item.type === 'request') return item.denyReason ? 'denied' : (item.status ?? 0) >= 500 ? 'error' : '';
    if (item.type === 'event') return `ev-${eventMeta(item.kind).tone}`;
    return '';
}

function glyphOf(item: TimelineItem) {
    if (item.type === 'page') return '◧';
    if (item.type === 'event') return eventMeta(item.kind).glyph;
    return item.denyReason ? '⊘' : '·';
}
</script>

<style scoped>
.tl { display: flex; flex-direction: column; gap: 6px; }
.tl-day {
    position: sticky;
    top: 0;
    z-index: 1;
    margin: 8px 0 2px;
    padding: 4px 0;
    font-size: 11px;
    letter-spacing: 1.1px;
    text-transform: uppercase;
    color: var(--ot-muted);
    background: var(--ot-surface);
}
.tl-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.tl-item {
    display: grid;
    grid-template-columns: 64px 18px minmax(0, 1fr);
    gap: 8px;
    align-items: flex-start;
    padding: 7px 8px;
    border-radius: 7px;
    border-left: 2px solid transparent;
}
.tl-item:hover { background: rgba(255, 255, 255, 0.025); }
.tl-item.fresh { animation: tl-fresh 2.4s ease; }
.tl-item.denied { border-left-color: var(--ot-warning); background: rgba(240, 180, 41, 0.04); }
.tl-item.error { border-left-color: var(--ot-negative); }
.tl-item.event { border-left-color: var(--ot-line-strong); }
.tl-item.ev-bad { border-left-color: var(--ot-negative); }
.tl-item.ev-warn { border-left-color: var(--ot-warning); }
.tl-item.ev-ok { border-left-color: var(--ot-positive); }
.tl-item.ev-violet { border-left-color: var(--ot-violet); }
.tl-item.ev-info { border-left-color: var(--ot-info); }
.tl-time { font-family: var(--ot-mono); font-size: 11px; color: var(--ot-muted); padding-top: 2px; }
.tl-glyph { text-align: center; color: var(--ot-muted); font-size: 12px; padding-top: 1px; }
.tl-item.denied .tl-glyph { color: var(--ot-warning); }
.tl-item.event .tl-glyph { color: var(--ot-text-2); }
.tl-body { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.tl-line { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; font-size: 13px; color: var(--ot-text-2); }
.tl-line strong { color: var(--ot-text); font-weight: 600; }
.tl-detail { color: var(--ot-text-2); }
.tl-method { font-family: var(--ot-mono); font-size: 10px; font-weight: 700; color: var(--ot-info); }
.tl-route { font-family: var(--ot-mono); font-size: 12px; color: var(--ot-text); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.tl-status { font-family: var(--ot-mono); font-size: 11px; padding: 0 5px; border-radius: 4px; }
.tl-status.ok { color: var(--ot-positive); background: var(--ot-positive-soft); }
.tl-status.warn { color: var(--ot-warning); background: var(--ot-warning-soft); }
.tl-status.bad { color: var(--ot-negative); background: var(--ot-negative-soft); }
.tl-tag { font-size: 10px; color: var(--ot-muted); border: 1px solid var(--ot-line-strong); border-radius: 4px; padding: 0 4px; }
.tl-meta { display: flex; gap: 10px; flex-wrap: wrap; font-size: 11.5px; color: var(--ot-muted); min-width: 0; }
.tl-meta > * { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.tl-deny { color: var(--ot-warning); }
.tl-loading { display: flex; flex-direction: column; gap: 8px; padding: 8px; }
.tl-loading .ot-skel { height: 28px; }
.tl-more { display: flex; justify-content: center; padding: 8px; }
@keyframes tl-fresh { from { background: rgba(109, 220, 79, 0.16); } to { background: transparent; } }
@media (max-width: 560px) {
    .tl-item { grid-template-columns: 52px minmax(0, 1fr); }
    .tl-glyph { display: none; }
}
</style>
