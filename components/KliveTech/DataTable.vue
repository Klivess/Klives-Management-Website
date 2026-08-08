<template>
    <div>
        <div v-if="searchable || $slots.tools" class="kt-tabletools">
            <input v-if="searchable" v-model="query" class="kt-input" type="search"
                   :placeholder="searchPlaceholder" :aria-label="`Search ${label}`"
                   style="min-width:180px" />
            <slot name="tools" />
            <span class="grow"></span>
            <span class="count">
                {{ sorted.length === rows.length
                    ? `${rows.length} ${label}`
                    : `${sorted.length} of ${rows.length} ${label}` }}
            </span>
        </div>

        <KliveTechStateBlock v-if="!sorted.length" compact
            :kind="query ? 'filtered' : emptyKind"
            :title="query ? undefined : emptyTitle"
            :detail="query ? 'No row matches this search.' : emptyText" />

        <template v-else>
            <div class="kt-tablewrap" :style="{ maxHeight: maxHeight === 'none' ? undefined : maxHeight }">
                <table class="kt-table">
                    <thead>
                        <tr>
                            <th v-for="column in columns" :key="column.key"
                                :class="{ num: column.num, sortable: column.sortable !== false }"
                                :style="column.width ? { width: column.width } : undefined"
                                :aria-sort="ariaSort(column)"
                                @click="column.sortable !== false && toggleSort(column.key)">
                                {{ column.label }}
                                <span v-if="sortKey === column.key" class="dir" aria-hidden="true">
                                    {{ ascending ? '▲' : '▼' }}
                                </span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="row in paged" :key="rowKey(row)"
                            :class="[rowClass?.(row), {
                                clickable: selectable,
                                selected: selectable && selectedKey === rowKey(row),
                            }]"
                            @click="selectable && $emit('select', row)">
                            <td v-for="column in columns" :key="column.key" :class="{ num: column.num }">
                                <slot :name="`cell-${column.key}`" :row="row">{{ cellText(row, column) }}</slot>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div v-if="pageCount > 1" class="kt-pager">
                <button class="kt-btn ghost sm" :disabled="page === 0" @click="page--">Previous</button>
                <span>Page {{ page + 1 }} of {{ pageCount }}</span>
                <button class="kt-btn ghost sm" :disabled="page >= pageCount - 1" @click="page++">Next</button>
            </div>
        </template>
    </div>
</template>

<script setup lang="ts" generic="T extends Record<string, any>">
import { computed, ref, watch } from 'vue';
import type { StateKind } from './StateBlock.vue';

export interface TableColumn<Row = any> {
    key: string;
    label: string;
    width?: string;
    num?: boolean;
    sortable?: boolean;
    /** Sorting a rendered string sorts it alphabetically; supply the real value. */
    sortValue?: (row: Row) => string | number;
    /** Search has to see what a slot renders, which the raw field may not contain. */
    searchValue?: (row: Row) => string;
}

const props = withDefaults(defineProps<{
    rows: T[];
    columns: TableColumn<T>[];
    rowKey: (row: T) => string;
    label?: string;
    searchable?: boolean;
    searchPlaceholder?: string;
    selectable?: boolean;
    selectedKey?: string;
    rowClass?: (row: T) => string;
    maxHeight?: string;
    defaultSort?: string;
    defaultDirection?: 'asc' | 'desc';
    pageSize?: number;
    emptyKind?: StateKind;
    emptyTitle?: string;
    emptyText?: string;
}>(), {
    label: 'rows',
    searchPlaceholder: 'Search…',
    maxHeight: '520px',
    pageSize: 50,
    emptyKind: 'empty',
    defaultDirection: 'asc',
});

defineEmits<{ select: [row: T] }>();

const query = ref('');
const sortKey = ref(props.defaultSort ?? '');
const ascending = ref(props.defaultDirection !== 'desc');
const page = ref(0);

function column(key: string) {
    return props.columns.find(c => c.key === key);
}

function cellText(row: T, col: TableColumn<T>): string {
    const value = row[col.key];
    return value === null || value === undefined ? '' : String(value);
}

function searchText(row: T): string {
    return props.columns
        .map(col => (col.searchValue ? col.searchValue(row) : cellText(row, col)))
        .join(' ')
        .toLowerCase();
}

const filtered = computed(() => {
    const needle = query.value.trim().toLowerCase();
    if (!needle) return props.rows;
    return props.rows.filter(row => searchText(row).includes(needle));
});

const sorted = computed(() => {
    const col = column(sortKey.value);
    if (!col) return filtered.value;
    const direction = ascending.value ? 1 : -1;
    return [...filtered.value].sort((a, b) => {
        const left = col.sortValue ? col.sortValue(a) : a[col.key];
        const right = col.sortValue ? col.sortValue(b) : b[col.key];
        if (left === right) return 0;
        if (left === null || left === undefined) return 1;   // absent sorts last either way
        if (right === null || right === undefined) return -1;
        if (typeof left === 'number' && typeof right === 'number') return (left - right) * direction;
        return String(left).localeCompare(String(right), undefined, { numeric: true }) * direction;
    });
});

const pageCount = computed(() => Math.max(1, Math.ceil(sorted.value.length / props.pageSize)));
const paged = computed(() => {
    const start = page.value * props.pageSize;
    return sorted.value.slice(start, start + props.pageSize);
});

// A filter that shrinks the list can leave the viewer on a page that no longer exists.
watch([() => sorted.value.length, pageCount], () => {
    if (page.value >= pageCount.value) page.value = pageCount.value - 1;
});

function toggleSort(key: string) {
    if (sortKey.value === key) ascending.value = !ascending.value;
    else { sortKey.value = key; ascending.value = true; }
}

function ariaSort(col: TableColumn<T>): 'ascending' | 'descending' | 'none' | undefined {
    if (col.sortable === false) return undefined;
    if (sortKey.value !== col.key) return 'none';
    return ascending.value ? 'ascending' : 'descending';
}
</script>
