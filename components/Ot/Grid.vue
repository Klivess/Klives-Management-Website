<template>
    <div class="otg">
        <div v-if="!bare" class="ot-tabletools">
            <label v-if="searchable" class="ot-search">
                <span class="glyph" aria-hidden="true">⌕</span>
                <input v-model="search" class="ot-input sm" type="search" :placeholder="searchPlaceholder" :aria-label="`Filter ${label}`" />
            </label>
            <slot name="tools" />
            <span class="count">{{ countText }}</span>
            <details class="ot-menu" @toggle="onMenu">
                <summary class="ot-btn ghost sm" title="Columns">Cols</summary>
                <div class="pop">
                    <span class="grp">Columns</span>
                    <label v-for="c in columns" :key="c.key" class="item">
                        <input type="checkbox" :checked="isVisible(c)" @change="toggleColumn(c.key)" />
                        <span>{{ c.label || c.key }}</span>
                    </label>
                    <button class="item" type="button" @click="resetColumns">Reset</button>
                </div>
            </details>
            <button v-if="exportName" class="ot-btn ghost sm" type="button" title="Export CSV" @click="exportCsv">CSV</button>
        </div>

        <div class="ot-tablewrap" :style="{ maxHeight: maxHeight === 'none' ? undefined : (maxHeight ?? '560px') }">
            <table class="ot-table" :class="{ pinned, zebra }">
                <thead>
                    <tr>
                        <th v-for="c in visible" :key="c.key" :class="[{ num: isNum(c), sortable: c.sortable !== false }, c.headClass]"
                            :style="c.width ? { width: c.width, minWidth: c.width } : undefined" :title="c.hint"
                            :aria-sort="sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'"
                            @click="c.sortable !== false && sortBy(c.key)">
                            {{ c.label }}<span v-if="sort.key === c.key" class="sort">{{ sort.dir === 'asc' ? '▲' : '▼' }}</span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="row in paged" :key="keyOf(row)" :class="[{ clickable: selectable, selected: selectedKey != null && selectedKey === keyOf(row) }, rowClass?.(row)]"
                        :tabindex="selectable ? 0 : undefined" @click="selectable && $emit('select', row)" @keydown.enter="selectable && $emit('select', row)">
                        <td v-for="c in visible" :key="c.key" :class="cellClass(c, row)" :style="cellStyle(c, row)" :title="c.title?.(row) ?? (c.clip ? display(c, row) : undefined)">
                            <slot :name="`cell-${c.key}`" :row="row" :value="valueOf(c, row)">
                                <svg v-if="c.format === 'spark'" class="spark" viewBox="0 0 60 16" preserveAspectRatio="none">
                                    <polyline :points="sparkPoints(valueOf(c, row))" fill="none" :stroke="sparkColour(valueOf(c, row))" stroke-width="1.2" vector-effect="non-scaling-stroke" />
                                </svg>
                                <span v-else-if="c.clip" class="clip" :style="{ maxWidth: `${c.clip}px` }">{{ display(c, row) }}</span>
                                <template v-else>{{ display(c, row) }}</template>
                            </slot>
                        </td>
                    </tr>
                    <tr v-if="!paged.length">
                        <td :colspan="visible.length" class="emptycell">{{ search ? `No match for “${search}”` : emptyText }}</td>
                    </tr>
                </tbody>
                <tfoot v-if="$slots.foot"><slot name="foot" :columns="visible" /></tfoot>
            </table>
        </div>

        <div v-if="!bare && sorted.length > pageSize" class="pager">
            <button class="ot-btn ghost xs" :disabled="page === 0" @click="page = 0">«</button>
            <button class="ot-btn ghost xs" :disabled="page === 0" @click="page--">‹</button>
            <span class="mono">{{ page + 1 }} / {{ pageCount }}</span>
            <button class="ot-btn ghost xs" :disabled="page >= pageCount - 1" @click="page++">›</button>
            <button class="ot-btn ghost xs" :disabled="page >= pageCount - 1" @click="page = pageCount - 1">»</button>
            <select v-model.number="pageSize" class="ot-select sm auto" aria-label="Rows per page">
                <option v-for="n in [50, 100, 250, 1000]" :key="n" :value="n">{{ n }}</option>
            </select>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
    DASH, downloadCsv, fmtAge, fmtBig, fmtChg, fmtDateTime, fmtDay10, fmtInt, fmtN, fmtPctPlain, fmtPrice, fmtSignedN,
    heat, heatSeq, usePersisted,
} from '~/composables/useTerminal';

export type GridFormat = 'text' | 'sym' | 'price' | 'num' | 'int' | 'pct' | 'chg' | 'signed' | 'big' | 'date' | 'datetime' | 'age' | 'spark' | 'bool';

export interface GridColumn {
    key: string;
    label: string;
    format?: GridFormat;
    decimals?: number;
    /** Diverging heat scale (value that saturates), or 'seq' for 0..1 sequential. */
    heat?: number | 'seq';
    /** Value the heat colour is computed from, when it differs from the displayed value. */
    heatValue?: (row: any) => number | null | undefined;
    /** Colour the text by sign. */
    signed?: boolean;
    value?: (row: any) => any;
    sortValue?: (row: any) => number | string | null | undefined;
    title?: (row: any) => string | undefined;
    class?: (row: any) => string | undefined;
    hint?: string;
    width?: string;
    /** Let the cell wrap instead of staying on one line. */
    wrap?: boolean;
    /** Truncate the text at this many pixels (full text on hover). */
    clip?: number;
    hidden?: boolean;
    sortable?: boolean;
    headClass?: string;
}

const props = withDefaults(defineProps<{
    rows: any[];
    columns: GridColumn[];
    rowKey?: (row: any) => string;
    gridKey?: string;
    label?: string;
    searchable?: boolean;
    searchPlaceholder?: string;
    selectable?: boolean;
    selectedKey?: string | null;
    rowClass?: (row: any) => string | undefined;
    pinned?: boolean;
    zebra?: boolean;
    maxHeight?: string;
    defaultSort?: string;
    defaultDir?: 'asc' | 'desc';
    emptyText?: string;
    exportName?: string;
    bare?: boolean;
    total?: number;
}>(), { label: 'rows', searchable: true, searchPlaceholder: 'Filter…', defaultDir: 'desc', emptyText: 'No rows', pinned: true });

defineEmits<{ select: [row: any] }>();

const persistKey = props.gridKey ? `grid.${props.gridKey}` : null;
const columnState = persistKey
    ? usePersisted<Record<string, boolean>>(`${persistKey}.cols`, {})
    : ref<Record<string, boolean>>({});
const sort = persistKey
    ? usePersisted<{ key: string; dir: 'asc' | 'desc' }>(`${persistKey}.sort`, { key: props.defaultSort ?? '', dir: props.defaultDir })
    : ref<{ key: string; dir: 'asc' | 'desc' }>({ key: props.defaultSort ?? '', dir: props.defaultDir });
const pageSize = persistKey ? usePersisted<number>(`${persistKey}.page`, 100) : ref(100);
const search = ref('');
const page = ref(0);

function isVisible(c: GridColumn) { return columnState.value[c.key] ?? !c.hidden; }
function toggleColumn(key: string) {
    const c = props.columns.find(x => x.key === key);
    if (!c) return;
    columnState.value = { ...columnState.value, [key]: !isVisible(c) };
}
function resetColumns() { columnState.value = {}; }
function onMenu() { /* native details handles open/close */ }

const visible = computed(() => props.columns.filter(isVisible));

function keyOf(row: any): string {
    return props.rowKey ? props.rowKey(row) : String(row.Id ?? row.Symbol ?? row.Key ?? JSON.stringify(row).slice(0, 80));
}
function valueOf(c: GridColumn, row: any) { return c.value ? c.value(row) : row?.[c.key]; }
function isNum(c: GridColumn) { return !!c.format && !['text', 'sym', 'spark', 'bool'].includes(c.format); }

function display(c: GridColumn, row: any): string {
    const v = valueOf(c, row);
    if (v === null || v === undefined || v === '') return DASH;
    switch (c.format) {
        case 'price': return fmtPrice(v, c.decimals);
        case 'num': return fmtN(v, c.decimals ?? 2);
        case 'int': return fmtInt(v);
        case 'pct': return fmtPctPlain(v, c.decimals ?? 1);
        case 'chg': return fmtChg(v, c.decimals ?? 2);
        case 'signed': return fmtSignedN(v, c.decimals ?? 2);
        case 'big': return fmtBig(v, c.decimals ?? 2);
        case 'date': return fmtDay10(v);
        case 'datetime': return fmtDateTime(v);
        case 'age': return fmtAge(v);
        case 'bool': return v ? '✓' : '·';
        default: return String(v);
    }
}

function cellClass(c: GridColumn, row: any) {
    const v = valueOf(c, row);
    const cls: (string | undefined)[] = [c.class?.(row)];
    if (isNum(c)) cls.push('num');
    if (c.format === 'sym') cls.push('sym');
    if (c.wrap) cls.push('wrap');
    if ((c.signed || c.format === 'chg' || c.format === 'signed') && typeof v === 'number' && Number.isFinite(v) && v !== 0) cls.push(v > 0 ? 'pos' : 'neg');
    return cls;
}

function cellStyle(c: GridColumn, row: any) {
    if (c.heat === undefined) return undefined;
    const v = c.heatValue ? c.heatValue(row) : valueOf(c, row);
    if (typeof v !== 'number') return undefined;
    const bg = c.heat === 'seq' ? heatSeq(v) : heat(v, c.heat);
    return bg ? { background: bg } : undefined;
}

function sortKeyOf(c: GridColumn | undefined, row: any) {
    if (!c) return undefined;
    if (c.sortValue) return c.sortValue(row);
    const v = valueOf(c, row);
    if (Array.isArray(v)) return v.length ? v[v.length - 1] / (v[0] || 1) : null;
    return v;
}

const filtered = computed(() => {
    const q = search.value.trim().toLowerCase();
    if (!q) return props.rows;
    return props.rows.filter(row => props.columns.some(c => {
        const v = valueOf(c, row);
        return v !== null && v !== undefined && !Array.isArray(v) && String(v).toLowerCase().includes(q);
    }));
});

const sorted = computed(() => {
    const { key, dir } = sort.value;
    if (!key) return filtered.value;
    const c = props.columns.find(x => x.key === key);
    if (!c) return filtered.value;
    const f = dir === 'asc' ? 1 : -1;
    return [...filtered.value].sort((a, b) => {
        const av = sortKeyOf(c, a), bv = sortKeyOf(c, b);
        const an = av === null || av === undefined || (typeof av === 'number' && !Number.isFinite(av));
        const bn = bv === null || bv === undefined || (typeof bv === 'number' && !Number.isFinite(bv));
        if (an && bn) return 0;
        if (an) return 1;
        if (bn) return -1;
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * f;
        return String(av).localeCompare(String(bv)) * f;
    });
});

const pageCount = computed(() => Math.max(1, Math.ceil(sorted.value.length / pageSize.value)));
const paged = computed(() => props.bare ? sorted.value : sorted.value.slice(page.value * pageSize.value, (page.value + 1) * pageSize.value));
const countText = computed(() => {
    const n = sorted.value.length;
    const of = props.total ?? props.rows.length;
    return search.value || of !== n ? `${n} / ${of}` : `${n}`;
});

function sortBy(key: string) {
    if (sort.value.key !== key) sort.value = { key, dir: 'desc' };
    else if (sort.value.dir === 'desc') sort.value = { key, dir: 'asc' };
    else sort.value = { key: '', dir: 'desc' };
}

function sparkPoints(values: any): string {
    if (!Array.isArray(values) || values.length < 2) return '';
    const v = values.filter((x: any) => typeof x === 'number' && Number.isFinite(x));
    if (v.length < 2) return '';
    const min = Math.min(...v), max = Math.max(...v);
    const span = max - min || 1;
    return v.map((x: number, i: number) => `${(i / (v.length - 1)) * 60},${16 - ((x - min) / span) * 14 - 1}`).join(' ');
}
function sparkColour(values: any): string {
    if (!Array.isArray(values) || values.length < 2) return 'var(--ot-muted)';
    return values[values.length - 1] >= values[0] ? 'var(--ot-positive)' : 'var(--ot-negative)';
}

function exportCsv() {
    const cols = visible.value.filter(c => c.format !== 'spark');
    downloadCsv(props.exportName ?? 'export', cols.map(c => c.label || c.key), sorted.value.map(r => cols.map(c => {
        const v = valueOf(c, r);
        return Array.isArray(v) ? null : v;
    })));
}

watch([filtered, pageSize], () => { page.value = 0; });
</script>

<style scoped>
.otg { display: flex; flex-direction: column; min-height: 0; }
.pager { display: flex; align-items: center; gap: 4px; padding: 3px var(--ot-card-pad); border-top: 1px solid var(--ot-line); font-size: 11px; color: var(--ot-text-2); }
.pager select { margin-left: auto; }
.spark { width: 60px; height: 16px; display: block; }
.emptycell { text-align: center; color: var(--ot-muted); height: 48px !important; }
.ot-menu .pop label.item { cursor: pointer; }
</style>
