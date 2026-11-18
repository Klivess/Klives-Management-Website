<template>
    <OmniscienceV3Shell>
        <div class="omni-pagehead">
            <div>
                <h1>Explore</h1>
                <p class="subtitle">Ask any dataset a question: pick what to measure, how to split it and what to keep. Every number opens the records behind it.</p>
            </div>
            <div class="omni-actions">
                <button class="omni-btn ghost" type="button" :disabled="!canQuery || result.refreshing.value" @click="result.refresh()">Run again</button>
                <button v-if="canExport" class="omni-btn" type="button" :disabled="!rows.length" @click="exportCsv">Export CSV</button>
            </div>
        </div>

        <OmniscienceV3Panel v-if="!datasets.length" title="Datasets" :loading="catalog.loading.value" :error="catalog.error.value" :has-data="!!catalog.data.value"
                            empty empty-title="No datasets you can read"
                            empty-text="Modules declare their datasets as they are installed; none is available to you yet." @retry="catalog.refresh()" />

        <template v-else>
            <div class="omni-filterbar">
                <select v-model="state.dataset" class="omni-select auto" aria-label="Dataset">
                    <option v-for="d in datasets" :key="d.id" :value="d.id">{{ d.title }}</option>
                </select>
                <details class="omni-pick">
                    <summary class="omni-btn sm">Measure: {{ measureSummary }}</summary>
                    <div class="menu" role="group" aria-label="Measures">
                        <label v-for="m in dataset?.measures ?? []" :key="m.id" class="omni-check">
                            <input type="checkbox" :checked="measures.includes(m.id)" @change="toggle('measures', m.id)" /> {{ m.title }}
                            <span class="omni-muted">{{ m.aggregate }}{{ m.unit ? ` · ${m.unit}` : '' }}</span>
                        </label>
                    </div>
                </details>
                <details class="omni-pick">
                    <summary class="omni-btn sm">Split by: {{ groupSummary }}</summary>
                    <div class="menu" role="group" aria-label="Split by">
                        <template v-for="g in dimensionGroups" :key="g.group">
                            <span class="grp">{{ g.group }}</span>
                            <label v-for="d in g.items" :key="d.id" class="omni-check">
                                <input type="checkbox" :checked="groupBy.includes(d.id)" @change="toggle('groupBy', d.id)" /> {{ d.title }}
                            </label>
                        </template>
                    </div>
                </details>
                <template v-if="timeDimensions.length">
                    <select v-model="state.bucket" class="omni-select auto" aria-label="Time bucket">
                        <option v-for="b in BUCKETS" :key="b.value" :value="b.value">{{ b.label }}</option>
                    </select>
                    <select v-if="state.bucket !== 'None' && timeDimensions.length > 1" v-model="state.timeDim" class="omni-select auto" aria-label="Time dimension">
                        <option value="">{{ timeDimensions[0]!.title }} (default)</option>
                        <option v-for="d in timeDimensions.slice(1)" :key="d.id" :value="d.id">{{ d.title }}</option>
                    </select>
                    <select v-if="state.bucket !== 'None'" v-model="state.lens" class="omni-select auto" aria-label="Whose clock buckets use"
                            title="Whose clock hours and days are read on">
                        <option value="Klives">Klives's clock</option>
                        <option value="Subject">Each person's own clock</option>
                        <option value="Utc">UTC</option>
                    </select>
                </template>
                <button class="omni-btn sm" type="button" @click="addFilter">Add filter</button>
                <button v-if="filterRows.length || groupBy.length || state.bucket !== 'None' || state.asOf" class="omni-filterchip" type="button" @click="clearAll">
                    Reset <span class="x" aria-hidden="true">✕</span>
                </button>
                <div class="grow"></div>
            </div>

            <div v-if="filterRows.length || state.asOf || showAsOf" class="omni-filters">
                <div v-for="(f, i) in filterRows" :key="i" class="omni-row frow">
                    <select class="omni-select auto" :value="f.d" :aria-label="`Filter ${i + 1} dimension`" @change="patchFilter(i, { d: ($event.target as HTMLSelectElement).value, v: '' })">
                        <option v-for="d in dimensions" :key="d.id" :value="d.id">{{ d.title }}</option>
                    </select>
                    <select class="omni-select auto" :value="f.o" :aria-label="`Filter ${i + 1} operator`" @change="patchFilter(i, { o: ($event.target as HTMLSelectElement).value as FilterOp })">
                        <option v-for="o in OPS" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                    <template v-if="f.o !== 'IsNull' && f.o !== 'IsNotNull'">
                        <template v-if="kindOf(f.d) === 'Time'">
                            <input class="omni-input" type="datetime-local" :value="f.v.split(',')[0] ?? ''" :aria-label="`Filter ${i + 1} from (${boundsZone})`"
                                   @change="setTimeValue(i, 0, ($event.target as HTMLInputElement).value)" />
                            <input v-if="f.o === 'Between'" class="omni-input" type="datetime-local" :value="f.v.split(',')[1] ?? ''" :aria-label="`Filter ${i + 1} until (${boundsZone})`"
                                   @change="setTimeValue(i, 1, ($event.target as HTMLInputElement).value)" />
                            <span class="omni-muted">{{ boundsZone }}</span>
                        </template>
                        <select v-else-if="kindOf(f.d) === 'Flag'" class="omni-select auto" :value="f.v" :aria-label="`Filter ${i + 1} value`"
                                @change="patchFilter(i, { v: ($event.target as HTMLSelectElement).value })">
                            <option value="">Choose…</option><option value="true">yes</option><option value="false">no</option>
                        </select>
                        <input v-else class="omni-input" type="text" :value="f.v" :aria-label="`Filter ${i + 1} value`"
                               :placeholder="f.o === 'In' || f.o === 'NotIn' ? 'values, separated by commas' : f.o === 'Between' ? 'low, high' : 'value'"
                               @change="patchFilter(i, { v: ($event.target as HTMLInputElement).value })" />
                    </template>
                    <button class="omni-btn ghost sm" type="button" :aria-label="`Remove filter ${i + 1}`" @click="removeFilter(i)">✕</button>
                    <span v-if="filterProblem(f)" class="neg">{{ filterProblem(f) }}</span>
                </div>
                <div class="omni-row frow">
                    <label class="omni-muted" for="explore-asof">As of</label>
                    <input id="explore-asof" v-model="state.asOf" class="omni-input" type="datetime-local" />
                    <span class="omni-muted">{{ state.asOf ? `${klivesZone}: only what was known then` : 'now' }}</span>
                </div>
            </div>
            <button v-else class="omni-btn ghost sm" type="button" style="margin-bottom:12px" @click="showAsOf = true">Time travel (as of)…</button>

            <div class="omni-grid" :class="chartItems.length ? 'sidebar' : ''">
                <OmniscienceV3Panel :title="dataset?.title ?? 'Result'" :subtitle="resultSubtitle" flush
                                    :loading="result.loading.value || (result.refreshing.value && !result.data.value)" :error="queryError" :has-data="!!result.data.value"
                                    :empty="!rows.length" :empty-kind="filterRows.length ? 'filtered' : 'empty'"
                                    :empty-title="!canQuery ? 'Choose at least one measure' : 'No data for these filters'"
                                    :empty-text="!canQuery ? undefined : coverageText" what="This query" @retry="result.refresh()">
                    <OmniscienceV3DataTable :rows="tableRows" :columns="tableColumns" :row-key="r => String(r.__i)" label="rows" pinned selectable max-height="62vh"
                                         :selected-key="drill ? String(drill.index) : null" search-placeholder="Filter loaded rows…" @select="openDrill($event.__i)">
                        <template v-for="(col, c) in columns" :key="col.id" #[`cell-c${c}`]="{ row }">
                            <span :class="{ 'omni-muted': row[`c${c}`] === null }">{{ cell(col, row[`c${c}`]) }}</span>
                        </template>
                    </OmniscienceV3DataTable>
                    <template #footer>
                        <span data-testid="omni-coverage">{{ coverageText }}</span>
                        <button v-if="result.data.value?.drillToken" class="omni-btn ghost sm" type="button" style="margin-left:12px" @click="openDrill(-1)">Show all records</button>
                        <button v-if="result.data.value?.drillToken && canRunTactics" class="omni-btn ghost sm" type="button" @click="useInTactic">Use these records in a tactic</button>
                    </template>
                </OmniscienceV3Panel>

                <OmniscienceV3Panel v-if="chartItems.length" :title="chartTitle" subtitle="Click a bar to open its records.">
                    <OmniscienceV3BarList :items="chartItems" :limit="24" :signed="false" :on-select="key => openDrill(Number(key))" />
                </OmniscienceV3Panel>
            </div>

            <details v-if="result.data.value" class="omni-explain">
                <summary>Explain this result</summary>
                <dl class="omni-kv">
                    <dt>As of</dt><dd><OmniscienceV3Time :ms="result.data.value.asOfMs" seconds /></dd>
                    <dt>Coverage</dt><dd>{{ coverageText }}</dd>
                    <dt>Sources</dt><dd>{{ result.data.value.coverage.sources.length ? result.data.value.coverage.sources.join(', ') : 'none named' }}</dd>
                    <dt>Query</dt><dd><OmniscienceV3Json :value="lastQuery" max-height="240px" /></dd>
                    <dt>Plan</dt><dd><OmniscienceV3Json :value="result.data.value.explain" max-height="240px" /></dd>
                </dl>
            </details>
        </template>

        <OmniscienceV3Drawer :open="!!drill" :title="drill?.title ?? ''" :subtitle="drillSubtitle" wide @close="drill = null">
            <OmniscienceV3ErrorBlock v-if="records.error.value && !records.items.value.length" :error="records.error.value" what="These records" @retry="records.reload()" />
            <div v-else-if="records.loading.value" class="omni-skelrows" aria-busy="true"><div v-for="n in 8" :key="n" class="omni-skel"></div></div>
            <OmniscienceV3StateBlock v-else-if="!records.items.value.length" kind="empty" title="No records behind this" />
            <template v-else>
                <div class="omni-tablewrap" style="max-height: 70vh">
                    <table class="omni-table pinned" data-testid="omni-records">
                        <thead><tr><th v-for="k in recordKeys" :key="k">{{ k }}</th></tr></thead>
                        <tbody>
                            <tr v-for="(rec, i) in records.items.value" :key="i">
                                <td v-for="k in recordKeys" :key="k" class="omni-wrap">{{ recordCell(k, (rec as any)?.[k]) }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div class="omni-row omni-section">
                    <button v-if="records.hasMore.value" class="omni-btn sm" type="button" :disabled="records.loadingMore.value" @click="records.loadMore()">Load more</button>
                    <span class="omni-muted">{{ omniCount(records.items.value.length) }} of {{ omniCount(recordTotal) }} records</span>
                </div>
            </template>
        </OmniscienceV3Drawer>
    </OmniscienceV3Shell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { OMNI_BASE, OmniApiError, omniGet, omniPost } from '~/scripts/omniscience/api';
import type {
    DatasetCatalogDto, DimensionDefinition, DimensionKind, ExploreColumn, ExploreFilter, ExploreQuery, ExploreRecordsPage, ExploreResult,
    FilterOp, TimeBucket, TimeLens,
} from '~/scripts/omniscience/contracts';
import { omniCount, omniCsv, omniDownload, omniZonedToMs } from '~/scripts/omniscience/format';
import { useOmniCarry, useOmniDebounced, useOmniEngine, useOmniPaged, useOmniResource, useOmniTime } from '~/composables/useOmniscienceV3';
import { useOmniUrlState } from '~/composables/useOmniscienceV3';
import { useAccess } from '~/composables/useAccess';
import type { TableColumn } from '~/components/OmniscienceV3/DataTable.vue';
import type { BarItem } from '~/components/OmniscienceV3/BarList.vue';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Omniscience v3 · Explore' });

const BUCKETS: { value: TimeBucket; label: string }[] = [
    { value: 'None', label: 'No time split' }, { value: 'Hour', label: 'By hour' }, { value: 'Day', label: 'By day' },
    { value: 'Week', label: 'By week' }, { value: 'Month', label: 'By month' }, { value: 'Quarter', label: 'By quarter' },
    { value: 'Year', label: 'By year' }, { value: 'HourOfDay', label: 'By hour of day' }, { value: 'DayOfWeek', label: 'By weekday' },
];
const OPS: { value: FilterOp; label: string }[] = [
    { value: 'Eq', label: 'is' }, { value: 'NotEq', label: 'is not' }, { value: 'In', label: 'is one of' }, { value: 'NotIn', label: 'is none of' },
    { value: 'Contains', label: 'contains' }, { value: 'Gte', label: 'at least' }, { value: 'Lte', label: 'at most' }, { value: 'Between', label: 'between' },
    { value: 'IsNull', label: 'is unknown' }, { value: 'IsNotNull', label: 'is known' },
];

interface FilterRow { d: string; o: FilterOp; v: string }

const router = useRouter();
const { can } = useAccess();
const canExport = computed(() => can('omniscience.data.export'));
const canRunTactics = computed(() => can('omniscience.tactics.run'));
const { klivesZone } = useOmniEngine();
const { at } = useOmniTime();
const carry = useOmniCarry();
// Everything that defines the view lives in the URL, so a view can be linked and returned to.
const { state } = useOmniUrlState({ dataset: '', measures: '', groupBy: '', bucket: 'None', timeDim: '', lens: 'Klives', filters: '', asOf: '' });
const showAsOf = ref(false);

const catalog = useOmniResource(signal => omniGet<DatasetCatalogDto>('explore/datasets', {}, signal));
const datasets = computed(() => catalog.data.value?.datasets ?? []);
const dataset = computed(() => datasets.value.find(d => d.id === state.dataset) ?? null);
const dimensionById = computed(() => new Map((catalog.data.value?.dimensions ?? []).map(d => [d.id, d])));
const dimensions = computed<DimensionDefinition[]>(() => (dataset.value?.dimensions ?? [])
    .map(b => dimensionById.value.get(b.dimensionId)).filter((d): d is DimensionDefinition => !!d));
const timeDimensions = computed(() => dimensions.value.filter(d => d.kind === 'Time'));
const dimensionGroups = computed(() => {
    const groups = new Map<string, DimensionDefinition[]>();
    for (const d of dimensions.value) {
        const list = groups.get(d.group);
        if (list) list.push(d); else groups.set(d.group, [d]);
    }
    return [...groups.entries()].map(([group, items]) => ({ group, items }));
});
const kindOf = (id: string): DimensionKind => dimensionById.value.get(id)?.kind ?? 'Category';

const list = (text: string) => (text ? text.split(',').filter(Boolean) : []);
const measures = computed(() => list(state.measures).filter(id => dataset.value?.measures.some(m => m.id === id)));
const groupBy = computed(() => list(state.groupBy).filter(id => dimensions.value.some(d => d.id === id)));
function toggle(key: 'measures' | 'groupBy', id: string) {
    const current = list(state[key]);
    state[key] = (current.includes(id) ? current.filter(x => x !== id) : [...current, id]).join(',');
}
const measureSummary = computed(() => measures.value.map(id => dataset.value?.measures.find(m => m.id === id)?.title ?? id).join(', ') || 'choose…');
const groupSummary = computed(() => groupBy.value.map(id => dimensionById.value.get(id)?.title ?? id).join(', ') || 'nothing');

// A dataset is chosen as soon as the catalogue lands; switching datasets drops what cannot carry over.
watch([datasets, () => state.dataset], () => {
    if (!datasets.value.length) return;
    if (!dataset.value) { state.dataset = datasets.value[0]!.id; return; }
    if (!measures.value.length && dataset.value.measures.length) state.measures = dataset.value.measures[0]!.id;
    if (state.bucket !== 'None' && !timeDimensions.value.length) state.bucket = 'None';
}, { immediate: true });

// A picker is a menu: clicking anywhere else puts it away.
function closePickers(event: MouseEvent) {
    for (const open of document.querySelectorAll<HTMLDetailsElement>('details.omni-pick[open]')) {
        if (!open.contains(event.target as Node)) open.open = false;
    }
}
onMounted(() => document.addEventListener('click', closePickers));
onBeforeUnmount(() => document.removeEventListener('click', closePickers));

// ── filters ──────────────────────────────────────────────────────────────────

const filterRows = computed<FilterRow[]>(() => {
    if (!state.filters) return [];
    try {
        const parsed = JSON.parse(state.filters);
        return Array.isArray(parsed) ? parsed.filter(f => f && typeof f.d === 'string' && typeof f.o === 'string').map(f => ({ d: f.d, o: f.o, v: String(f.v ?? '') })) : [];
    } catch { return []; }
});
function writeFilters(rows: FilterRow[]) { state.filters = rows.length ? JSON.stringify(rows) : ''; }
function addFilter() { const first = dimensions.value[0]; if (first) writeFilters([...filterRows.value, { d: first.id, o: 'Eq', v: '' }]); }
function removeFilter(i: number) { writeFilters(filterRows.value.filter((_, n) => n !== i)); }
function patchFilter(i: number, patch: Partial<FilterRow>) { writeFilters(filterRows.value.map((f, n) => (n === i ? { ...f, ...patch } : f))); }
function setTimeValue(i: number, end: 0 | 1, local: string) {
    const parts = (filterRows.value[i]?.v ?? '').split(',');
    parts[end] = local;
    patchFilter(i, { v: parts.join(',') });
}
function clearAll() { state.groupBy = ''; state.bucket = 'None'; state.timeDim = ''; state.filters = ''; state.asOf = ''; showAsOf.value = false; }

/** Time bounds are typed on Klives's clock unless the lens is UTC; "each person's clock" has no single zone to type in. */
const boundsZone = computed(() => (state.lens === 'Utc' ? 'UTC' : klivesZone.value));

function filterValues(f: FilterRow): unknown[] | string {
    if (f.o === 'IsNull' || f.o === 'IsNotNull') return [];
    const kind = kindOf(f.d);
    const raw = (f.o === 'In' || f.o === 'NotIn' || f.o === 'Between' || kind === 'Time' ? f.v.split(',') : [f.v]).map(x => x.trim()).filter(Boolean);
    const need = f.o === 'Between' ? 2 : 1;
    if (f.o === 'Between' ? raw.length !== 2 : raw.length < need) return f.o === 'Between' ? 'needs two values' : 'needs a value';
    if (kind === 'Time') {
        const ms = raw.map(x => omniZonedToMs(x, boundsZone.value));
        return ms.some(x => x === null) ? 'not a date and time' : ms;
    }
    if (kind === 'Number') {
        const n = raw.map(Number);
        return n.some(x => !Number.isFinite(x)) ? 'not a number' : n;
    }
    if (kind === 'Flag') return raw.map(x => x === 'true');
    return raw;
}
const filterProblem = (f: FilterRow) => { const v = filterValues(f); return typeof v === 'string' ? v : ''; };

// ── the query ────────────────────────────────────────────────────────────────

const query = computed<ExploreQuery | null>(() => {
    if (!dataset.value || !measures.value.length) return null;
    const filters: ExploreFilter[] = [];
    for (const f of filterRows.value) {
        if (!dimensions.value.some(d => d.id === f.d)) continue;
        const values = filterValues(f);
        if (typeof values === 'string') return null; // an unfinished filter must not silently widen the result
        filters.push({ dimension: f.d, op: f.o, values });
    }
    const asOfMs = state.asOf ? omniZonedToMs(state.asOf, klivesZone.value) : null;
    return {
        dataset: dataset.value.id, filters, groupBy: groupBy.value, measures: measures.value,
        bucket: state.bucket as TimeBucket, timeDimension: state.bucket !== 'None' && state.timeDim ? state.timeDim : null,
        lens: state.lens as TimeLens, zone: null, asOfMs, limit: 1000, cursor: null,
    };
});
const canQuery = computed(() => query.value !== null);
const lastQuery = ref<ExploreQuery | null>(null);

const result = useOmniResource<ExploreResult | null>(async signal => {
    const q = query.value;
    if (!q) return null;
    lastQuery.value = q;
    return omniPost<ExploreResult>('explore/query', q, signal);
}, { immediate: false });
useOmniDebounced(() => JSON.stringify(query.value), () => { drill.value = null; void result.refresh(); }, 250);

const queryError = computed<OmniApiError | null>(() => result.error.value);
const columns = computed<ExploreColumn[]>(() => result.data.value?.columns ?? []);
const rows = computed<unknown[][]>(() => result.data.value?.rows ?? []);
const isMeasure = (col: ExploreColumn) => measures.value.includes(col.id) || col.kind.toLowerCase() === 'measure';

function cell(col: ExploreColumn, value: unknown): string {
    if (value === null || value === undefined) return 'unknown';
    if (typeof value === 'number') {
        // A time column holds an instant unless the bucket is a cycle (hour of day, weekday), which is a small number.
        if (col.kind.toLowerCase() === 'time' && Math.abs(value) > 1e10) return at(value);
        return Number.isInteger(value) ? value.toLocaleString('en-GB') : value.toLocaleString('en-GB', { maximumFractionDigits: 3 });
    }
    if (typeof value === 'boolean') return value ? 'yes' : 'no';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

const tableColumns = computed<TableColumn[]>(() => columns.value.map((col, c) => ({
    key: `c${c}`, label: col.title, num: isMeasure(col), searchValue: (row: any) => cell(col, row[`c${c}`]),
})));
const tableRows = computed(() => rows.value.map((row, i) => {
    const record: Record<string, unknown> = { __i: i };
    row.forEach((value, c) => { record[`c${c}`] = value; });
    return record;
}));

const coverageText = computed(() => {
    const c = result.data.value?.coverage;
    if (!c) return '';
    const span = c.fromMs != null && c.toMs != null ? `, ${at(c.fromMs)} to ${at(c.toMs)}` : '';
    return `${omniCount(c.records)} records${c.sampled ? ' (sampled)' : ''} from ${c.sources.length} source${c.sources.length === 1 ? '' : 's'}${span}`;
});
const resultSubtitle = computed(() => {
    if (!result.data.value) return undefined;
    const more = result.data.value.nextCursor ? ' · more rows exist than are shown; narrow the filters' : '';
    return `${omniCount(rows.value.length)} row${rows.value.length === 1 ? '' : 's'} · as of ${at(result.data.value.asOfMs)}${more}`;
});

// One label column and a measure make a ranking; anything wider stays a table.
const labelColumns = computed(() => columns.value.map((col, c) => ({ col, c })).filter(x => !isMeasure(x.col)));
const firstMeasure = computed(() => columns.value.map((col, c) => ({ col, c })).find(x => isMeasure(x.col)) ?? null);
const chartItems = computed<BarItem[]>(() => {
    if (labelColumns.value.length !== 1 || !firstMeasure.value || rows.value.length < 2) return [];
    const label = labelColumns.value[0]!, measure = firstMeasure.value;
    return rows.value.map((row, i) => ({ key: String(i), label: cell(label.col, row[label.c]), value: Number(row[measure.c]) }))
        .filter(item => Number.isFinite(item.value));
});
const chartTitle = computed(() => (firstMeasure.value && labelColumns.value[0] ? `${firstMeasure.value.col.title} by ${labelColumns.value[0].col.title}` : ''));

function exportCsv() {
    omniDownload(`${dataset.value?.id ?? 'explore'}.csv`, omniCsv(columns.value.map(c => c.title), rows.value));
}

function useInTactic() {
    const token = result.data.value?.drillToken;
    if (!token) return;
    carry.value = { kind: 'ExploreDrill', items: [{ id: token, label: `${dataset.value?.title ?? 'Explore'} result` }], origin: 'Explore', sampled: false };
    void router.push(`${OMNI_BASE}/tactics`);
}

// ── drill-down ───────────────────────────────────────────────────────────────

const drill = ref<{ index: number; title: string; narrow: ExploreFilter[] } | null>(null);
const recordTotal = ref(0);

function openDrill(index: number) {
    const narrow: ExploreFilter[] = [];
    const labels: string[] = [];
    if (index >= 0) {
        const row = rows.value[index];
        if (!row) return;
        columns.value.forEach((col, c) => {
            // Only dimension columns narrow; a time-bucket column is not a dimension id and is left to the token.
            if (!groupBy.value.includes(col.id)) return;
            const value = row[c];
            narrow.push(value === null || value === undefined ? { dimension: col.id, op: 'IsNull', values: [] } : { dimension: col.id, op: 'Eq', values: [value] });
            labels.push(`${col.title}: ${cell(col, value)}`);
        });
    }
    drill.value = { index, title: labels.length ? labels.join(' · ') : 'All records behind this result', narrow };
    void records.reload();
}
const drillSubtitle = computed(() => {
    if (!drill.value) return '';
    const bucketed = state.bucket !== 'None' && drill.value.index >= 0;
    return bucketed ? 'Narrowed by this row\'s split values; the time bucket itself is not narrowed.' : dataset.value?.title ?? '';
});

const records = useOmniPaged<unknown, string>(async (cursor, signal) => {
    const token = result.data.value?.drillToken;
    if (!drill.value || !token) return { items: [], nextCursor: null };
    const page = await omniPost<ExploreRecordsPage>('explore/records', { drillToken: token, narrow: drill.value.narrow.length ? drill.value.narrow : null, limit: 100, cursor }, signal);
    recordTotal.value = page.total;
    return { items: page.records, nextCursor: page.nextCursor };
});

const recordKeys = computed(() => {
    const keys: string[] = [];
    for (const rec of records.items.value.slice(0, 50)) {
        if (rec && typeof rec === 'object') for (const k of Object.keys(rec)) if (!keys.includes(k)) keys.push(k);
    }
    return keys;
});
function recordCell(key: string, value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'number' && /(At|Ms)$/.test(key) && value > 1e10) return at(value, true);
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
</script>

<style scoped>
.omni-pick { position: relative; }
.omni-pick > summary { list-style: none; cursor: pointer; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.omni-pick > summary::-webkit-details-marker { display: none; }
.omni-pick .menu {
    position: absolute; top: calc(100% + 4px); left: 0; z-index: 30; min-width: 260px; max-height: 50vh; overflow-y: auto;
    display: flex; flex-direction: column; gap: 6px; padding: 10px 12px;
    background: var(--omni-surface-2); border: 1px solid var(--omni-line-strong); border-radius: var(--omni-radius-sm); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
}
.omni-pick .grp { font-size: 9.5px; letter-spacing: 1px; text-transform: uppercase; color: var(--omni-muted); font-weight: 700; margin-top: 4px; }
.omni-filters { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; padding: 10px 12px; border: 1px solid var(--omni-line); border-radius: var(--omni-radius-sm); }
.frow .omni-input { width: auto; min-width: 180px; }
.omni-explain { margin-top: 16px; font-size: 12.5px; }
.omni-explain > summary { cursor: pointer; color: var(--omni-text-2); margin-bottom: 8px; }
</style>
