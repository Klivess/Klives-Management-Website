<template>
    <ProfilesModal :open="open" :title="title" @close="emit('close')">
        <ul class="kcf-tree" role="listbox" :aria-label="title">
            <li v-for="row in rows" :key="row.folder.key">
                <button type="button" role="option" class="km-plain-btn kcf-row" :class="{ picked: picked === row.folder.key }"
                        :aria-selected="picked === row.folder.key" :disabled="row.blocked" :style="{ paddingLeft: `${10 + row.depth * 20}px` }"
                        @click="picked = row.folder.key" @dblclick="choose(row.folder.key)">
                    <KliveCloudIcon name="folder" :size="16" :tint="0.22" class="kcf-glyph" />
                    <span class="kcf-name">{{ row.folder.name }}</span>
                    <small v-if="row.here">Current folder</small>
                </button>
            </li>
        </ul>
        <template #footer>
            <button type="button" class="ot-btn ghost" @click="emit('close')">Cancel</button>
            <button type="button" class="ot-btn primary" :disabled="!canMove || busy" @click="choose(picked)">{{ busy ? 'Moving…' : 'Move here' }}</button>
        </template>
    </ProfilesModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { sortItems, type ShareIndex, type ShareItem } from '~/scripts/klivecloud/shared';

/* Where to move a selection: every folder in the share, minus the ones it can't go into. */
const props = defineProps<{
    open: boolean;
    index: ShareIndex;
    /** What is being moved. */
    keys: string[];
    busy?: boolean;
}>();

const emit = defineEmits<{ close: []; pick: [folderKey: string] }>();

const picked = ref('');
watch(() => props.open, open => { if (open) picked.value = ''; });

const moving = computed(() => props.keys.map(key => props.index.byKey.get(key)).filter((item): item is ShareItem => !!item));
const title = computed(() => (moving.value.length === 1 ? `Move “${moving.value[0].name}”` : `Move ${moving.value.length} items`));

/** A folder can't go inside itself, so neither it nor anything below it is offered. */
const blockedKeys = computed(() => {
    const blocked = new Set<string>();
    const stack = moving.value.filter(item => item.type === 'Folder').map(item => item.key);
    while (stack.length) {
        const key = stack.pop()!;
        if (blocked.has(key)) continue;
        blocked.add(key);
        for (const child of props.index.childrenOf.get(key) ?? []) if (child.type === 'Folder') stack.push(child.key);
    }
    return blocked;
});

/** Where everything being moved already is, if that's one place. */
const currentKey = computed(() => {
    const parents = new Set(moving.value.map(item => item.parentKey));
    return parents.size === 1 ? [...parents][0] : '';
});

const rows = computed(() => {
    const list: { folder: ShareItem; depth: number; blocked: boolean; here: boolean }[] = [];
    const visit = (folder: ShareItem, depth: number) => {
        list.push({
            folder,
            depth,
            blocked: blockedKeys.value.has(folder.key) || folder.key === currentKey.value,
            here: folder.key === currentKey.value,
        });
        if (blockedKeys.value.has(folder.key)) return;
        const subfolders = (props.index.childrenOf.get(folder.key) ?? []).filter(child => child.type === 'Folder');
        for (const child of sortItems(subfolders, 'name', 1)) visit(child, depth + 1);
    };
    visit(props.index.root, 0);
    return list;
});

const canMove = computed(() => !!picked.value && !rows.value.find(row => row.folder.key === picked.value)?.blocked);

function choose(key: string) {
    const row = rows.value.find(r => r.folder.key === key);
    if (!row || row.blocked || props.busy) return;
    emit('pick', key);
}
</script>

<style scoped>
.kcf-tree {
    list-style: none;
    margin: 0;
    padding: 4px;
    max-height: min(420px, 55vh);
    overflow-y: auto;
    border: 1px solid var(--ot-line);
    border-radius: var(--ot-radius);
    background: rgba(0, 0, 0, 0.18);
}
.kcf-row {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    height: 34px;
    padding-right: 10px;
    border-radius: var(--ot-radius-sm);
    font-size: 13.5px;
    text-align: left;
}
.kcf-row:hover:not(:disabled), .kcf-row:active:not(:disabled) { background: var(--ot-surface-3); }
.kcf-row.picked { background: var(--ot-accent-soft); box-shadow: inset 0 0 0 1px var(--ot-line-strong); }
.kcf-row:disabled { cursor: default; opacity: 0.45; background: none; }
.kcf-glyph { color: #e0a93a; }
.kcf-name { min-width: 0; flex: 1 1 auto; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.kcf-row small { font-size: 11.5px; color: var(--ot-muted); white-space: nowrap; }
</style>
