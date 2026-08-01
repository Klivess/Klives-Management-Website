<template>
    <div>
        <!--
          A table here is an analytical tool, not a dump: find a record, compare
          records, inspect one, act on it. Search, sort, column choice, counts and
          paging are one workflow rather than four features bolted together.
        -->
        <div v-if="!bare" class="ot-tabletools">
            <label v-if="searchable" class="ot-search">
                <span class="glyph" aria-hidden="true">⌕</span>
                <span class="visually-hidden">Search {{ label }}</span>
                <input class="ot-input" type="search" v-model="search" :placeholder="searchPlaceholder" />
            </label>

            <slot name="tools" />

            <details v-if="optionalColumns.length" class="colmenu">
                <summary class="ot-btn ghost sm">Columns</summary>
                <div class="menu">
                    <label v-for="col in optionalColumns" :key="col.key" class="ot-check">
                        <input type="checkbox" :checked="!hidden.has(col.key)" @change="toggleColumn(col.key)" />
                        {{ col.label }}
                    </label>
                </div>
            </details>

            <span class="count">{{ countText }}</span>
        </div>

        <div class="ot-tablewrap" :style="maxHeight ? { maxHeight } : undefined">
            <table class="ot-table" :class="{ pinned }">
                <thead>
                    <tr>
                        <th v-for="col in visibleColumns" :key="col.key"
                            :class="[{ num: col.num, sortable: col.sortable !== false }]"
                            :style="col.width ? { width: col.width } : undefined"
                            :aria-sort="ariaSort(col.key)"
                            @click="col.sortable !== false && sortBy(col.key)">
                            {{ col.label }}
                            <span v-if="sort.key === col.key" class="sort" aria-hidden="true">
                                {{ sort.direction === 'asc' ? '▲' : '▼' }}
                            </span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="row in paged" :key="keyOf(row)"
                        :class="[{ clickable: selectable, selected: selectedKey === keyOf(row) }, rowClass?.(row) ?? '']"
                        :tabindex="selectable ? 0 : undefined"
                        @click="selectable && $emit('select', row)"
                        @keydown.enter="selectable && $emit('select', row)">
                        <td v-for="col in visibleColumns" :key="col.key" :class="{ num: col.num }">
                            <slot :name="`cell-${col.key}`" :row="row" :value="(row as any)[col.key]">
                                {{ display((row as any)[col.key]) }}
                            </slot>
                        </td>
                    </tr>
                    <tr v-if="!paged.length">
                        <td :colspan="visibleColumns.length">
                            <OmniTraderStateBlock :kind="search ? 'filtered' : 'empty'" compact
                                                  :title="search ? 'No rows match your search' : emptyTitle"
                                                  :detail="search ? `Nothing in ${label} contains “${search}”.` : emptyText">
                                <button v-if="search" class="ot-btn sm ghost" @click="search = ''">Clear search</button>
                            </OmniTraderStateBlock>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- Paging, not infinite scroll: an analytical table needs a stable position. -->
        <div v-if="!bare && filtered.length > pageSize" class="pager">
            <button class="ot-btn ghost sm" :disabled="page === 0" @click="page--">Previous</button>
            <span>Page {{ page + 1 }} of {{ pageCount }}</span>
            <button class="ot-btn ghost sm" :disabled="page >= pageCount - 1" @click="page++">Next</button>
            <select class="ot-select auto sm" v-model.number="pageSize" aria-label="Rows per page">
                <option :value="25">25 rows</option>
                <option :value="50">50 rows</option>
                <option :value="100">100 rows</option>
                <option :value="100000">All rows</option>
            </select>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

export interface TableColumn {
    key: string;
    label: string;
    num?: boolean;
    sortable?: boolean;
    width?: string;
    /** Hidden by default but offered in the column menu. */
    optional?: boolean;
    /** Value used for sorting when the cell renders something other than the raw field. */
    sortValue?: (row: any) => number | string | null | undefined;
    /** Text this column contributes to search. */
    searchValue?: (row: any) => string | null | undefined;
}

const props = withDefaults(defineProps<{
    rows: any[];
    columns: TableColumn[];
    rowKey?: (row: any) => string;
    label?: string;
    searchable?: boolean;
    searchPlaceholder?: string;
    selectable?: boolean;
    selectedKey?: string | null;
    rowClass?: (row: any) => string;
    pinned?: boolean;
    maxHeight?: string;
    /** Rows the server matched, when the caller already filtered. Shown alongside the total. */
    serverFiltered?: number;
    serverTotal?: number;
    defaultSort?: string;
    defaultDirection?: 'asc' | 'desc';
    emptyTitle?: string;
    emptyText?: string;
    /** Strip the toolbar and pager for small embedded tables. */
    bare?: boolean;
}>(), {
    label: 'rows',
    searchable: true,
    searchPlaceholder: 'Search…',
    selectable: false,
    defaultDirection: 'desc',
    emptyTitle: 'Nothing here yet',
});

defineEmits<{ select: [row: any] }>();

const search = ref('');
const page = ref(0);
const pageSize = ref(50);
const hidden = ref(new Set(props.columns.filter(c => c.optional).map(c => c.key)));
const sort = ref<{ key: string; direction: 'asc' | 'desc' }>({
    key: props.defaultSort ?? '',
    direction: props.defaultDirection,
});

const optionalColumns = computed(() => props.columns.filter(c => c.optional));
const visibleColumns = computed(() => props.columns.filter(c => !hidden.value.has(c.key)));

function toggleColumn(key: string) {
    const next = new Set(hidden.value);
    if (next.has(key)) next.delete(key); else next.add(key);
    hidden.value = next;
}

function keyOf(row: any): string {
    return props.rowKey ? props.rowKey(row) : String(row.Id ?? row.id ?? JSON.stringify(row));
}

function display(value: any): string {
    if (value === null || value === undefined || value === '') return '—';
    return String(value);
}

function searchText(row: any): string {
    return props.columns
        .map(col => (col.searchValue ? col.searchValue(row) : row[col.key]))
        .filter(v => v !== null && v !== undefined)
        .join(' ')
        .toLowerCase();
}

const filtered = computed(() => {
    const q = search.value.trim().toLowerCase();
    if (!q) return props.rows;
    return props.rows.filter(row => searchText(row).includes(q));
});

const sorted = computed(() => {
    const { key, direction } = sort.value;
    if (!key) return filtered.value;
    const column = props.columns.find(c => c.key === key);
    const factor = direction === 'asc' ? 1 : -1;
    return [...filtered.value].sort((a, b) => {
        const av = column?.sortValue ? column.sortValue(a) : a[key];
        const bv = column?.sortValue ? column.sortValue(b) : b[key];
        // Unknown values sort last in both directions — a missing number is not a small one.
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
        return String(av).localeCompare(String(bv)) * factor;
    });
});

const pageCount = computed(() => Math.max(1, Math.ceil(sorted.value.length / pageSize.value)));
const paged = computed(() => sorted.value.slice(page.value * pageSize.value, (page.value + 1) * pageSize.value));

const countText = computed(() => {
    const shown = sorted.value.length;
    if (props.serverTotal !== undefined) {
        const matched = props.serverFiltered ?? shown;
        return search.value
            ? `${shown} shown · ${matched} matched · ${props.serverTotal} total`
            : `${matched} of ${props.serverTotal} ${props.label}`;
    }
    return search.value ? `${shown} of ${props.rows.length} ${props.label}` : `${shown} ${props.label}`;
});

function sortBy(key: string) {
    sort.value = sort.value.key === key
        ? { key, direction: sort.value.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'desc' };
}

function ariaSort(key: string): 'ascending' | 'descending' | 'none' {
    if (sort.value.key !== key) return 'none';
    return sort.value.direction === 'asc' ? 'ascending' : 'descending';
}

// A filter change that leaves you on page 7 of 2 is a bug, not a preference.
watch([filtered, pageSize], () => { page.value = 0; });
</script>

<style scoped>
.pager {
    display: flex;
    align-items: center;
    gap: var(--ot-space-2);
    padding: var(--ot-space-2) var(--ot-card-pad);
    border-top: 1px solid var(--ot-line);
    font-size: 12px;
    color: var(--ot-text-2);
}
.pager select { margin-left: auto; }
.colmenu { position: relative; }
.colmenu summary { list-style: none; cursor: pointer; }
.colmenu summary::-webkit-details-marker { display: none; }
.colmenu .menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: var(--ot-z-popover);
    min-width: 180px;
    padding: var(--ot-space-2);
    display: flex;
    flex-direction: column;
    gap: var(--ot-space-1);
    border: 1px solid var(--ot-line-strong);
    border-radius: var(--ot-radius-sm);
    background: var(--ot-surface-2);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
}
.visually-hidden {
    position: absolute; width: 1px; height: 1px; overflow: hidden;
    clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap;
}
</style>
