<template>
    <div>
    <ol class="bx-entries" :aria-label="label">
        <li v-for="(e, i) in shown" :key="`${e.Utc}-${i}`" :class="[e.Kind, { error: e.Error }]">
            <span class="glyph" aria-hidden="true">{{ glyph(e) }}</span>
            <div class="body">
                <div class="head">
                    <strong v-if="e.Kind === 'call'" class="tool">{{ e.Tool }}</strong>
                    <strong v-else-if="e.Kind === 'result'" class="tool">{{ e.Tool }} {{ e.Error ? 'failed' : '→' }}</strong>
                    <span v-else-if="e.Kind === 'text'" class="who">The agent</span>
                    <time class="when" :datetime="e.Utc" :title="new Date(e.Utc).toString()">{{ clock(e.Utc) }}</time>
                </div>
                <p v-if="e.Kind === 'call'" class="args">{{ args(e.Text) }}</p>
                <p v-else class="text" :class="{ clamp: !open.has(i) && long(e.Text) }">{{ e.Text }}</p>
                <button v-if="e.Kind !== 'call' && long(e.Text)" type="button" class="more" @click="toggle(i)">{{ open.has(i) ? 'Less' : 'More' }}</button>
                <div v-if="e.Images.length" class="pics">
                    <button v-for="file in e.Images" :key="file" type="button" class="pic" :class="{ big: zoomed === `${i}/${file}` }"
                            :aria-label="zoomed === `${i}/${file}` ? 'Shrink picture' : 'Enlarge picture'" @click="zoom(`${i}/${file}`)">
                        <OmniBloxImg :path="bloxCycleImagePath(gameId, cycleId, file)" ratio="1280 / 760" contain :alt="`${e.Tool ?? 'picture'} ${file}`" fallback="Picture gone" />
                    </button>
                </div>
            </div>
        </li>
    </ol>
    <button v-if="entries.length > limitNow" type="button" class="ot-btn ghost sm bx-all" @click="limitNow = entries.length">
        Show all {{ entries.length }} steps
    </button>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { bloxCycleImagePath, type BloxLiveEntry } from '~/composables/useOmniBlox';

const props = withDefaults(defineProps<{
    gameId: string;
    cycleId: string;
    entries: BloxLiveEntry[];
    /** Newest first (a live view) or oldest first (reading a whole log). */
    newestFirst?: boolean;
    limit?: number;
    label?: string;
}>(), { newestFirst: false, limit: 40, label: 'Cycle steps' });

const limitNow = ref(props.limit);
watch(() => props.cycleId, () => { limitNow.value = props.limit; open.value = new Set(); zoomed.value = null; });

const ordered = computed(() => props.newestFirst ? props.entries.slice().reverse() : props.entries);
const shown = computed(() => ordered.value.slice(0, limitNow.value));

const open = ref(new Set<number>());
function toggle(i: number) {
    const next = new Set(open.value);
    if (next.has(i)) next.delete(i); else next.add(i);
    open.value = next;
}
const zoomed = ref<string | null>(null);
const zoom = (key: string) => { zoomed.value = zoomed.value === key ? null : key; };

const long = (text: string) => text.length > 320 || text.split('\n').length > 5;

function glyph(e: BloxLiveEntry): string {
    switch (e.Kind) {
        case 'text': return '💬';
        case 'call': return '▸';
        case 'result': return e.Error ? '✗' : '✓';
        default: return '•';
    }
}

function clock(utc: string): string {
    const d = new Date(utc);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** A tool call's arguments as short "key: value" pairs (long values clipped). */
function args(json: string): string {
    try {
        const value = JSON.parse(json);
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            const parts = Object.entries(value).map(([k, v]) => {
                const text = typeof v === 'string' ? v : JSON.stringify(v);
                return `${k}: ${text.length > 90 ? `${text.slice(0, 90)}…` : text}`;
            });
            return parts.length ? parts.join(' · ') : '(no arguments)';
        }
    } catch { /* not JSON: show it as it came */ }
    return json.length > 400 ? `${json.slice(0, 400)}…` : json;
}
</script>

<style scoped>
.bx-entries { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.bx-entries > li { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: var(--ot-space-2); padding: 8px 0; }
.bx-entries > li + li { border-top: 1px solid var(--ot-line); }
.glyph { font-size: 13px; line-height: 18px; text-align: center; color: var(--ot-muted); }
.result .glyph { color: var(--ot-positive); }
.error .glyph { color: var(--ot-negative); }
.body { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.head { display: flex; gap: var(--ot-space-2); align-items: baseline; font-size: 12px; }
.tool { font-family: var(--ot-mono); font-size: 12px; }
.who { font-size: 11.5px; color: var(--ot-text-2); font-weight: 600; }
.when { margin-left: auto; font-size: 10.5px; color: var(--ot-muted); font-family: var(--ot-mono); }
.args { margin: 0; font-family: var(--ot-mono); font-size: 11.5px; line-height: 16px; color: var(--ot-text-2); overflow-wrap: anywhere; }
.text { margin: 0; font-size: 12.5px; line-height: 18px; white-space: pre-wrap; overflow-wrap: anywhere; }
.result .text, .note .text { font-family: var(--ot-mono); font-size: 11.5px; line-height: 16px; color: var(--ot-text-2); }
.note .text { font-style: italic; font-family: inherit; color: var(--ot-muted); }
.error .text { color: #ffc9c9; }
.clamp { display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }
.more { align-self: flex-start; background: none; border: 0; padding: 0; color: var(--ot-accent); font-size: 11.5px; cursor: pointer; }
.pics { display: flex; flex-wrap: wrap; gap: var(--ot-space-2); margin-top: 4px; }
.pic { width: 180px; padding: 0; border: 1px solid var(--ot-line); border-radius: var(--ot-radius-sm); background: none; cursor: zoom-in; overflow: hidden; }
.pic.big { width: 100%; max-width: 860px; cursor: zoom-out; }
.bx-all { margin-top: var(--ot-space-2); }
@media (max-width: 640px) { .pic { width: calc(50% - 4px); } }
</style>
