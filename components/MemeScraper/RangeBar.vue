<template>
    <!-- The window and filters every chart and table on the page answers to. They live in the URL. -->
    <div class="ms-rangebar-wrap">
        <div class="ot-filterbar ms-rangebar" :class="{ busy: loading }" role="group" aria-label="Date range and filters">
            <div class="ot-segment sm" role="group" aria-label="Date range">
                <button v-for="p in RANGE_PRESETS" :key="p.key" type="button" :aria-pressed="range.preset.value === p.key"
                        :title="p.title" @click="range.setPreset(p.key)">{{ p.label }}</button>
            </div>

            <div class="ms-dates" :class="{ custom: range.custom.value }">
                <label class="ms-vh" for="ms-range-from">From</label>
                <input id="ms-range-from" type="date" class="ot-input" :value="fromValue" :max="toValue || today"
                       :title="range.custom.value ? 'Custom start' : 'Start of the window (edit to set your own)'" @change="onFrom" />
                <span class="dash" aria-hidden="true">–</span>
                <label class="ms-vh" for="ms-range-to">To</label>
                <input id="ms-range-to" type="date" class="ot-input" :value="toValue" :min="fromValue || undefined" :max="today"
                       :title="range.custom.value ? 'Custom end' : 'End of the window (edit to set your own)'" @change="onTo" />
            </div>

            <div v-if="showGranularity" class="ot-segment sm" role="group" aria-label="Group by">
                <button type="button" :aria-pressed="!range.granularity.value" :title="`Picked from the window's length${effective ? ` (${effective})` : ''}`"
                        @click="range.setGranularity(null)">Auto</button>
                <button v-for="g in GRANULARITIES" :key="g.key" type="button" :aria-pressed="range.granularity.value === g.key"
                        :disabled="g.key === 'day' && (rangeView?.Days ?? 0) > 1100" @click="range.setGranularity(g.key)">{{ g.label }}</button>
            </div>

            <details v-if="options" ref="picker" class="ms-pick">
                <summary class="ot-btn ghost sm" :class="{ active: range.sources.value.length > 0 }">
                    {{ range.sources.value.length ? `${range.sources.value.length} source${range.sources.value.length === 1 ? '' : 's'}` : 'All sources' }}
                    <span aria-hidden="true">▾</span>
                </summary>
                <div class="menu" role="group" aria-label="Sources">
                    <input v-model="sourceSearch" type="search" class="ot-input" placeholder="Find a source…" aria-label="Find a source" />
                    <div class="list">
                        <label v-for="name in filteredSourceOptions" :key="name" class="ot-check">
                            <input type="checkbox" :checked="isPicked(name)" @change="range.toggleSource(name)" />
                            @{{ name }}
                        </label>
                        <span v-if="!filteredSourceOptions.length" class="muted">No source matches.</span>
                    </div>
                    <button v-if="range.sources.value.length" type="button" class="ot-btn ghost sm" @click="range.setSources([])">Show all sources</button>
                </div>
            </details>

            <select v-if="options && options.Niches.length" class="ot-select auto ms-niche" :value="range.niche.value ?? ''" aria-label="Niche"
                    @change="range.setNiche(($event.target as HTMLSelectElement).value || null)">
                <option value="">All niches</option>
                <option v-for="n in options.Niches" :key="n" :value="n">{{ n }}</option>
                <option value="(no niche)">(no niche)</option>
            </select>

            <span class="grow"></span>
            <span class="summary" aria-live="polite">
                <span v-if="loading" class="ms-spinner" aria-hidden="true"></span>
                <template v-if="rangeView">
                    <b>{{ fmtDayRange(rangeView.From, rangeView.To) }}</b>
                    <span class="ms-wide-only">· {{ rangeView.Days.toLocaleString() }} day{{ rangeView.Days === 1 ? '' : 's' }}</span>
                    <span v-if="rangeView.HasBaseline && rangeView.PrevFrom && showBaseline" class="ms-wide-only base">· vs {{ fmtDayRange(rangeView.PrevFrom, rangeView.PrevTo!) }}</span>
                </template>
            </span>
        </div>

        <div v-if="range.hasFilters.value" class="ms-chips" aria-label="Active filters">
            <span class="muted">Showing only</span>
            <button v-for="s in range.sources.value" :key="s" type="button" class="ot-filterchip" :aria-label="`Stop filtering to @${s}`" :title="`Stop filtering to @${s}`" @click="range.toggleSource(s)">
                @{{ s }} <span class="x" aria-hidden="true">×</span>
            </button>
            <button v-if="range.niche.value" type="button" class="ot-filterchip" :aria-label="`Stop filtering to niche ${range.niche.value}`" title="Show every niche" @click="range.setNiche(null)">
                niche: {{ range.niche.value }} <span class="x" aria-hidden="true">×</span>
            </button>
            <button type="button" class="ot-btn ghost sm" @click="range.clearFilters()">Clear filters</button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RANGE_PRESETS, fmtDayRange, todayKey, useMemeRange, type FilterOptions, type Granularity, type RangeView } from '~/composables/useMemeScraper';

const props = withDefaults(defineProps<{
    /** The window the data on screen actually covers (what the server resolved). */
    rangeView?: RangeView | null;
    options?: FilterOptions | null;
    loading?: boolean;
    showGranularity?: boolean;
    showBaseline?: boolean;
}>(), { showGranularity: true, showBaseline: true });

const GRANULARITIES: { key: Granularity; label: string }[] = [
    { key: 'day', label: 'Day' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
];

const range = useMemeRange();
const today = todayKey();
const sourceSearch = ref('');
const picker = ref<HTMLDetailsElement | null>(null);

// Presets still show their real dates, so the inputs double as a readout.
const fromValue = computed(() => range.from.value ?? props.rangeView?.From ?? '');
const toValue = computed(() => (range.custom.value ? range.to.value ?? today : props.rangeView?.To ?? today));
const effective = computed(() => props.rangeView?.Granularity ?? null);

function onFrom(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    if (value) range.setCustom(value, toValue.value || today);
}

function onTo(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    if (value) range.setCustom(fromValue.value || value, value);
}

const filteredSourceOptions = computed(() => {
    const term = sourceSearch.value.trim().toLowerCase().replace(/^@/, '');
    const all = props.options?.Sources ?? [];
    // Picked ones first, so they are easy to untick.
    const picked = all.filter(isPicked);
    const rest = all.filter(n => !isPicked(n));
    return [...picked, ...rest].filter(n => !term || n.toLowerCase().includes(term));
});

function isPicked(name: string) {
    return range.sources.value.some(s => s.toLowerCase() === name.toLowerCase());
}

function onDocumentClick(event: MouseEvent) {
    const el = picker.value;
    if (el?.open && !el.contains(event.target as Node)) el.open = false;
}

onMounted(() => document.addEventListener('click', onDocumentClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick));
</script>

<style scoped>
.ms-rangebar-wrap { margin-bottom: var(--ot-space-4); }
.ms-rangebar { margin-bottom: 0; gap: var(--ot-space-2) var(--ot-space-3); }
.ms-rangebar.busy { border-color: var(--ot-line-strong); }
.ms-dates { display: inline-flex; align-items: center; gap: var(--ot-space-1); }
.ms-dates .ot-input { width: 138px; height: var(--ot-control-sm); font-size: 12px; font-family: var(--ot-mono); color-scheme: dark; padding: 0 var(--ot-space-2); }
.ms-dates.custom .ot-input { border-color: var(--ot-accent); background: var(--ot-accent-soft); }
.ms-dates .dash { color: var(--ot-muted); }
.ms-niche { height: var(--ot-control-sm); font-size: 12px; max-width: 180px; }
.summary .base { color: var(--ot-muted); }
.ms-pick { position: relative; }
.ms-pick summary { list-style: none; cursor: pointer; }
.ms-pick summary::-webkit-details-marker { display: none; }
.ms-pick .menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: var(--ot-z-popover);
    width: 260px;
    padding: var(--ot-space-2);
    display: flex;
    flex-direction: column;
    gap: var(--ot-space-2);
    border: 1px solid var(--ot-line-strong);
    border-radius: var(--ot-radius-sm);
    background: var(--ot-surface-2);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
}
.ms-pick .list { max-height: 280px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
.ms-pick .ot-check { padding: 3px var(--ot-space-1); border-radius: 4px; font-size: 12.5px; }
.ms-pick .ot-check:hover { background: var(--ot-surface-3); }
.ms-chips { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ot-space-2); margin-top: var(--ot-space-2); font-size: 12px; }
.ms-spinner {
    width: 12px; height: 12px; border-radius: 50%; display: inline-block;
    border: 2px solid var(--ot-line-strong); border-top-color: var(--ot-accent);
    animation: ms-spin 0.8s linear infinite;
}
@keyframes ms-spin { to { transform: rotate(360deg); } }
.ms-vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
@media (max-width: 720px) {
    .ms-dates .ot-input { width: 124px; }
}
</style>
