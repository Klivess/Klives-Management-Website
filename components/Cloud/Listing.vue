<template>
    <div ref="box" class="kcl-listing" :data-fit="fit" data-testid="kcl-listing">
        <!-- ── loading ── -->
        <table v-if="loading && !items.length" class="kcl-list" aria-hidden="true">
            <tbody>
                <tr v-for="n in 8" :key="n" class="kcl-row">
                    <td class="kcl-c-check"></td>
                    <td><div style="display: flex; gap: 10px; align-items: center"><span class="kcl-skel" style="width: 28px; height: 28px; border-radius: 8px"></span><span class="kcl-skel" :style="{ width: `${30 + (n * 37) % 45}%` }"></span></div></td>
                    <td class="kcl-c-kind"><span class="kcl-skel" style="width: 70%"></span></td>
                    <td class="kcl-c-size"><span class="kcl-skel" style="width: 60%; margin-left: auto"></span></td>
                    <td class="kcl-c-date"><span class="kcl-skel" style="width: 70%"></span></td>
                    <td class="kcl-c-access"><span class="kcl-skel" style="width: 60%"></span></td>
                    <td class="kcl-c-act"></td>
                </tr>
            </tbody>
        </table>

        <div v-else-if="!items.length" class="kcl-listing__empty"><slot name="empty" /></div>

        <!-- ── list ── -->
        <table v-else-if="layout === 'list'" class="kcl-list" data-testid="kcl-list">
            <thead>
                <tr>
                    <th class="kcl-c-check">
                        <input type="checkbox" class="kcl-box" :checked="allPicked" :indeterminate.prop="somePicked" aria-label="Select all" @change="$emit('checkAll', !allPicked)" />
                    </th>
                    <th v-for="col in COLUMNS" :key="col.key" :class="col.cls" :aria-sort="sortable && sort.key === col.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined">
                        <button v-if="sortable" class="kcl-sort" :data-on="sort.key === col.key" @click="$emit('sort', col.key)">
                            {{ col.label }}<KliveCloudIcon v-if="sort.key === col.key" :name="sort.dir === 1 ? 'arrow-up' : 'arrow-down'" :size="11" />
                        </button>
                        <span v-else>{{ col.label }}</span>
                    </th>
                    <th class="kcl-c-act"><span class="kcl-sr">Actions</span></th>
                </tr>
            </thead>
            <tbody>
                <template v-for="(item, i) in items" :key="item.key">
                    <!-- One cell per column (no colspan): a span over hidden columns squeezes the name to nothing. -->
                    <tr v-if="groupBy && (i === 0 || groupBy(items[i - 1]) !== groupBy(item))" class="kcl-group">
                        <td class="kcl-c-check"></td><td>{{ groupBy(item) }}</td><td class="kcl-c-kind"></td><td class="kcl-c-size"></td>
                        <td class="kcl-c-date"></td><td class="kcl-c-access"></td><td class="kcl-c-act"></td>
                    </tr>
                    <tr class="kcl-row" :data-picked="picked.has(item.key) || undefined" :data-focus="focusKey === item.key || undefined"
                        :data-drop="dropKey === item.key || undefined" :data-new="fresh.has(item.key) || undefined"
                        :data-drop-key="item.type === 'Folder' ? item.key : undefined" :data-key="item.key" :data-testid="`row-${item.name}`"
                        :draggable="draggable && item.level === 'Editor'" @click="$emit('pick', item, $event)" @dblclick="$emit('open', item, $event)"
                        @contextmenu.prevent="$emit('act', 'menu', item, $event)" @dragstart="$emit('dragstart', item, $event)" @dragend="$emit('dragend', $event)">
                        <td class="kcl-c-check" @click.stop>
                            <input type="checkbox" class="kcl-box" :checked="picked.has(item.key)" :aria-label="`Select ${item.name}`" @click="$emit('check', item, $event)" />
                        </td>
                        <td>
                            <div class="kcl-name">
                                <CloudThumb :item="item" :size="28" />
                                <div class="kcl-name__text">
                                    <span style="display: flex; align-items: center; min-width: 0">
                                        <button class="kcl-open" :tabindex="focusKey === item.key || (!focusKey && i === 0) ? 0 : -1" :data-focus-key="item.key"
                                                @click.stop="$emit('open', item, $event)" @focus="$emit('focus', item)">{{ item.name }}</button>
                                        <span v-if="badges(item).length" class="kcl-name__badges">
                                            <span v-for="badge in badges(item)" :key="badge.text" class="kcl-chip" :data-tone="badge.tone" :title="badge.title">
                                                <KliveCloudIcon :name="badge.icon" :size="10" />{{ badge.text }}
                                            </span>
                                        </span>
                                    </span>
                                    <button v-if="showPath" class="kcl-where" :title="`Open ${item.path || 'My drive'}`" @click.stop="$emit('act', 'reveal', item, $event)">
                                        {{ item.path || 'My drive' }}
                                    </button>
                                    <span v-else-if="item.type === 'Folder'" class="kcl-name__sub">{{ folderSummary(item) }}</span>
                                    <span v-else-if="fit !== 'full' && fit !== 'noaccess'" class="kcl-name__sub">{{ fileLine(item) }}</span>
                                </div>
                            </div>
                        </td>
                        <td class="kcl-c-kind">{{ describeItem(item) }}</td>
                        <td class="kcl-c-size">{{ item.type === 'Folder' ? (item.bytes ? formatBytes(item.bytes) : '—') : formatBytes(item.bytes) }}</td>
                        <td class="kcl-c-date" :title="Number.isFinite(item.newest) ? new Date(item.newest).toLocaleString() : ''">{{ formatWhen(item.newest, now) }}</td>
                        <td class="kcl-c-access">
                            <span class="kcl-access" :title="accessTitle(item)">
                                <KliveCloudIcon :name="accessIcon(item)" :size="12" />
                                <span class="kcl-access__text">{{ accessText(item) }}</span>
                            </span>
                        </td>
                        <td class="kcl-c-act" @click.stop>
                            <div class="kcl-acts">
                                <button v-if="canDownload" class="kcl-iconbtn kcl-iconbtn--sm" :title="item.type === 'Folder' ? 'Download as ZIP' : 'Download'" :aria-label="`Download ${item.name}`" @click="$emit('act', 'download', item, $event)">
                                    <KliveCloudIcon name="download" :size="14" />
                                </button>
                                <button v-if="canShare && item.level === 'Editor'" class="kcl-iconbtn kcl-iconbtn--sm" title="Share link" :aria-label="`Share link for ${item.name}`" @click="$emit('act', 'link', item, $event)">
                                    <KliveCloudIcon name="link" :size="14" />
                                </button>
                                <button class="kcl-iconbtn kcl-iconbtn--sm kcl-acts__more" title="More" :aria-label="`More for ${item.name}`" data-testid="row-more" @click="$emit('act', 'menu', item, $event)">
                                    <KliveCloudIcon name="more" :size="14" />
                                </button>
                            </div>
                        </td>
                    </tr>
                </template>
            </tbody>
        </table>

        <!-- ── grid ── -->
        <div v-else class="kcl-grid" :data-picking="picked.size > 0 || undefined" data-testid="kcl-grid">
            <div v-for="item in items" :key="item.key" class="kcl-tile" role="button" :tabindex="focusKey === item.key ? 0 : -1" :data-focus-key="item.key"
                 :data-picked="picked.has(item.key) || undefined" :data-focus="focusKey === item.key || undefined" :data-drop="dropKey === item.key || undefined"
                 :data-drop-key="item.type === 'Folder' ? item.key : undefined" :data-key="item.key" :data-testid="`tile-${item.name}`"
                 :draggable="draggable && item.level === 'Editor'" @click="$emit('pick', item, $event)" @dblclick="$emit('open', item, $event)"
                 @keydown.enter.prevent="$emit('open', item, $event)" @focus="$emit('focus', item)"
                 @contextmenu.prevent="$emit('act', 'menu', item, $event)" @dragstart="$emit('dragstart', item, $event)" @dragend="$emit('dragend', $event)">
                <input type="checkbox" class="kcl-box kcl-tile__check" :checked="picked.has(item.key)" :aria-label="`Select ${item.name}`" @click.stop="$emit('check', item, $event)" />
                <span v-if="badges(item).length" class="kcl-tile__badges">
                    <span v-for="badge in badges(item)" :key="badge.text" class="kcl-chip" :data-tone="badge.tone" :title="badge.title"><KliveCloudIcon :name="badge.icon" :size="10" />{{ badge.text }}</span>
                </span>
                <div class="kcl-tile__pic">
                    <CloudThumb :item="item" fill :glyph="52" />
                </div>
                <div class="kcl-tile__body">
                    <span class="kcl-tile__name" :title="item.name">{{ item.name }}</span>
                    <span class="kcl-tile__meta">{{ item.type === 'Folder' ? folderSummary(item, false) : `${formatBytes(item.bytes)} · ${formatWhen(item.modified, now)}` }}</span>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { describeItem, folderSummary, formatBytes, linkState, type DriveItem, type DriveLink, type DriveSort } from '~/scripts/klivecloud/drive';
import { formatWhen } from '~/scripts/klivecloud/shared';

/* One folder's (or one view's) items as a dense table or a grid of tiles. It only renders and
   reports: what a click, a key or a drop means is decided by the page. */
const props = withDefaults(defineProps<{
    items: DriveItem[];
    layout: 'list' | 'grid';
    sort: { key: DriveSort; dir: 1 | -1 };
    sortable?: boolean;
    picked: Set<string>;
    focusKey: string | null;
    now: number;
    linkMap: Map<string, DriveLink[]>;
    showPath?: boolean;
    dropKey?: string | null;
    draggable?: boolean;
    canDownload?: boolean;
    canShare?: boolean;
    loading?: boolean;
    fresh?: Set<string>;
    groupBy?: ((item: DriveItem) => string) | null;
}>(), { sortable: true, showPath: false, dropKey: null, draggable: false, canDownload: true, canShare: false, loading: false, fresh: () => new Set(), groupBy: null });

defineEmits<{
    open: [item: DriveItem, event: Event];
    pick: [item: DriveItem, event: MouseEvent];
    check: [item: DriveItem, event: MouseEvent];
    checkAll: [checked: boolean];
    sort: [key: DriveSort];
    act: [kind: 'download' | 'link' | 'menu' | 'reveal', item: DriveItem, event: Event];
    focus: [item: DriveItem];
    dragstart: [item: DriveItem, event: DragEvent];
    dragend: [event: DragEvent];
}>();

const COLUMNS: { key: DriveSort; label: string; cls: string }[] = [
    { key: 'name', label: 'Name', cls: '' },
    { key: 'kind', label: 'Kind', cls: 'kcl-c-kind' },
    { key: 'size', label: 'Size', cls: 'kcl-c-size' },
    { key: 'modified', label: 'Modified', cls: 'kcl-c-date' },
    { key: 'access', label: 'Access', cls: 'kcl-c-access' },
];

/* The list fits its own width (the rail and the details sheet take their share): columns go in
   the order they matter least, access first, then kind, then the date. */
const box = ref<HTMLElement | null>(null);
const fit = ref<'full' | 'noaccess' | 'compact' | 'tight' | 'phone'>('full');
let resize: ResizeObserver | null = null;
function measure(width: number) {
    fit.value = width >= 980 ? 'full' : width >= 760 ? 'noaccess' : width >= 600 ? 'compact' : width >= 460 ? 'tight' : 'phone';
}

/** A file's second line says what the hidden columns would have. */
function fileLine(item: DriveItem) {
    if (fit.value === 'compact') return describeItem(item);
    if (fit.value === 'tight') return `${describeItem(item)} · ${formatWhen(item.newest, props.now)}`;
    return `${formatBytes(item.bytes)} · ${formatWhen(item.newest, props.now)}`;
}
onMounted(() => {
    if (!box.value) return;
    measure(box.value.clientWidth);
    resize = new ResizeObserver(entries => { const w = entries[0]?.contentRect.width; if (w) measure(w); });
    resize.observe(box.value);
});
onBeforeUnmount(() => resize?.disconnect());

const allPicked = computed(() => props.items.length > 0 && props.items.every(item => props.picked.has(item.key)));
const somePicked = computed(() => !allPicked.value && props.items.some(item => props.picked.has(item.key)));

interface Badge { text: string; tone: string; icon: string; title: string }

function badges(item: DriveItem): Badge[] {
    const list = props.linkMap.get(item.key);
    if (!list?.length) return [];
    const broken = list.filter(link => linkState(link, props.now) === 'broken').length;
    const live = list.length - broken;
    const out: Badge[] = [];
    if (live) {
        const opens = list.reduce((sum, link) => sum + link.opens, 0);
        out.push({ text: live > 1 ? `${live} links` : 'Link', tone: 'link', icon: 'link', title: `Shared by public link${opens ? ` · opened ${opens} time${opens === 1 ? '' : 's'}` : ''}` });
    }
    if (broken) out.push({ text: broken > 1 ? `${broken} broken` : 'Broken link', tone: 'warn', icon: 'link-off', title: "A share link to this can't open" });
    return out;
}

function accessText(item: DriveItem) {
    if (item.level === 'Viewer') return 'View only';
    return item.access || '—';
}
function accessIcon(item: DriveItem) {
    const a = item.access.toLowerCase();
    if (a === 'everyone') return 'globe';
    if (a.includes('person') || a.includes('people')) return 'users';
    if (a === 'inherited') return 'folder';
    return 'lock';
}
function accessTitle(item: DriveItem) {
    if (item.level === 'Viewer') return 'You can open and download this, not change it';
    const a = item.access.toLowerCase();
    if (a === 'everyone') return 'Every profile that can use KliveCloud';
    if (a === 'inherited') return 'Whoever can use the folder it is in';
    return item.access;
}
</script>
