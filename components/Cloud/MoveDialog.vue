<template>
    <CloudDialog :open="items.length > 0" :title="items.length === 1 ? `Move “${items[0].name}”` : `Move ${items.length} items`" sub="Pick the folder to move into."
                 icon="folder-move" testid="kcl-move-dialog" @close="$emit('close')">
        <input v-model="query" class="kcl-input kcl-input--wide" type="search" placeholder="Find a folder" aria-label="Find a folder" data-autofocus @keydown.enter.prevent="pickFirst" />
        <div class="kcl-picker" role="listbox" aria-label="Folders" data-testid="move-folders">
            <button v-if="!query" class="kcl-picker__row" role="option" :aria-pressed="target === ROOT" :disabled="allAtTop" @click="target = ROOT">
                <KliveCloudIcon name="home" :size="14" />My drive<span class="kcl-picker__path">top level</span>
            </button>
            <button v-for="row in rows" :key="row.item.key" class="kcl-picker__row" role="option" :aria-pressed="target === row.item.key" :disabled="row.blocked"
                    :title="row.blocked ? row.why : row.item.path ? `${row.item.path} / ${row.item.name}` : row.item.name" :style="{ paddingLeft: query ? '8px' : `${8 + row.depth * 14}px` }"
                    @click="target = row.item.key" @dblclick="!row.blocked && confirm(row.item.key)">
                <span style="color: var(--kcl-k-folder); display: grid"><KliveCloudIcon name="folder" :size="14" :tint="0.22" /></span>
                <span class="kcl-truncate">{{ row.item.name }}</span>
                <span v-if="query && row.item.path" class="kcl-picker__path">{{ row.item.path }}</span>
            </button>
            <div v-if="!rows.length && query" class="kcl-empty" style="min-height: 80px">No folder matches “{{ query }}”.</div>
        </div>
        <template #actions>
            <span class="kcl-dialog__note">{{ targetName ? `Into ${targetName}` : '' }}</span>
            <button class="kcl-btn kcl-btn--ghost" @click="$emit('close')">Cancel</button>
            <button class="kcl-btn kcl-btn--primary" :disabled="target === null || busy" data-testid="move-confirm" @click="confirm(target!)">Move here</button>
        </template>
    </CloudDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ROOT, childrenIn, isWithin, sortDrive, type DriveIndex, type DriveItem } from '~/scripts/klivecloud/drive';

const props = defineProps<{ items: DriveItem[]; index: DriveIndex | null; busy: boolean }>();
const emit = defineEmits<{ close: []; move: [targetKey: string] }>();

const query = ref('');
const target = ref<string | null>(null);

watch(() => props.items, () => { query.value = ''; target.value = null; });

const movingFolders = computed(() => props.items.filter(item => item.type === 'Folder'));
const allAtTop = computed(() => props.items.every(item => !item.parentKey));

/** A folder can't go into itself or anything inside it; nothing can go where it already is. */
function blockedReason(folder: DriveItem): string {
    if (!props.index) return '';
    if (folder.level !== 'Editor') return "You can't add to this folder";
    if (movingFolders.value.some(moving => isWithin(props.index!, folder.key, moving.key))) return "A folder can't go inside itself";
    if (props.items.every(item => item.parentKey === folder.key)) return 'Already here';
    return '';
}

const rows = computed(() => {
    const index = props.index;
    if (!index) return [];
    const q = query.value.trim().toLowerCase();
    const out: { item: DriveItem; depth: number; blocked: boolean; why: string }[] = [];
    if (q) {
        for (const item of index.byKey.values()) {
            if (item.type !== 'Folder' || !item.name.toLowerCase().includes(q)) continue;
            const why = blockedReason(item);
            out.push({ item, depth: 0, blocked: !!why, why });
        }
        return sortDrive(out.map(row => row.item), 'name', 1).map(item => out.find(row => row.item === item)!).slice(0, 200);
    }
    const walk = (key: string, depth: number) => {
        for (const item of sortDrive(childrenIn(index, key).filter(child => child.type === 'Folder'), 'name', 1)) {
            const why = blockedReason(item);
            out.push({ item, depth, blocked: !!why, why });
            if (depth < 10) walk(item.key, depth + 1);
        }
    };
    walk(ROOT, 0);
    return out;
});

const targetName = computed(() => (target.value === null ? '' : target.value === ROOT ? 'My drive' : props.index?.byKey.get(target.value)?.name ?? ''));

function pickFirst() {
    const first = rows.value.find(row => !row.blocked);
    if (first) target.value = first.item.key;
}
function confirm(key: string) {
    emit('move', key);
}
</script>
