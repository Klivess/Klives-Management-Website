<template>
    <aside class="kcl-rail" :data-open="open || undefined" aria-label="KliveCloud places" data-testid="kcl-rail">
        <div class="kcl-rail__scroll">
            <nav class="kcl-card kcl-rail__group" aria-label="Places">
                <button class="kcl-place" :aria-current="view === 'folder' && folderKey === ROOT" :data-drop="dropKey === ROOT || undefined" data-drop-key=""
                        data-testid="place-drive" @click="$emit('go', 'folder', ROOT)">
                    <span class="kcl-place__icon"><KliveCloudIcon name="home" :size="15" /></span>
                    <span class="kcl-place__label">My drive</span>
                    <span v-if="index" class="kcl-place__count">{{ formatBytes(index.bytes) }}</span>
                </button>
                <button class="kcl-place" :aria-current="view === 'recent'" data-testid="place-recent" @click="$emit('go', 'recent')">
                    <span class="kcl-place__icon"><KliveCloudIcon name="clock" :size="15" /></span>
                    <span class="kcl-place__label">Recent</span>
                    <span v-if="recentToday" class="kcl-place__count" title="Changed today">{{ recentToday }} today</span>
                </button>
                <button class="kcl-place" :aria-current="view === 'large'" data-testid="place-large" @click="$emit('go', 'large')">
                    <span class="kcl-place__icon"><KliveCloudIcon name="weight" :size="15" /></span>
                    <span class="kcl-place__label">Largest files</span>
                </button>
                <button v-if="canLinks" class="kcl-place" :aria-current="view === 'links'" data-testid="place-links" @click="$emit('go', 'links')">
                    <span class="kcl-place__icon"><KliveCloudIcon name="link" :size="15" /></span>
                    <span class="kcl-place__label">Share links</span>
                    <span v-if="linkCounts.broken" class="kcl-place__count" data-tone="warn" :title="`${linkCounts.broken} can't open`">{{ linkCounts.broken }} ⚠</span>
                    <span v-else-if="linkCounts.total" class="kcl-place__count">{{ linkCounts.total }}</span>
                </button>
                <button v-if="index?.sharedCount" class="kcl-place" :aria-current="view === 'shared'" data-testid="place-shared" @click="$emit('go', 'shared')">
                    <span class="kcl-place__icon"><KliveCloudIcon name="users" :size="15" /></span>
                    <span class="kcl-place__label">Shared with me</span>
                    <span class="kcl-place__count">{{ index.sharedCount }}</span>
                </button>
            </nav>

            <nav v-if="index && rootFolders.length" class="kcl-card kcl-rail__group" aria-label="Folders" data-testid="kcl-tree">
                <div class="kcl-rail__label">Folders</div>
                <div class="kcl-tree" role="tree">
                    <div v-for="node in nodes" :key="node.item.key" role="treeitem" :aria-expanded="node.kids ? node.open : undefined" :aria-level="node.depth + 1">
                        <button class="kcl-node" :aria-current="view === 'folder' && folderKey === node.item.key" :data-drop="dropKey === node.item.key || undefined"
                                :data-drop-key="node.item.key" :style="{ paddingLeft: `${4 + node.depth * 14}px` }" :title="node.item.path ? `${node.item.path} / ${node.item.name}` : node.item.name"
                                @click="$emit('go', 'folder', node.item.key)">
                            <span v-if="node.kids" class="kcl-node__twist" :data-open="node.open" role="button" :aria-label="node.open ? 'Collapse' : 'Expand'" @click.stop="toggle(node.item.key)">
                                <KliveCloudIcon name="chevron-right" :size="12" />
                            </span>
                            <span v-else class="kcl-node__twist" aria-hidden="true"></span>
                            <span class="kcl-node__folder"><KliveCloudIcon name="folder" :size="14" :tint="0.22" /></span>
                            <span class="kcl-node__name">{{ node.item.name }}</span>
                            <span v-if="node.item.bytes" class="kcl-node__size">{{ formatBytes(node.item.bytes) }}</span>
                        </button>
                    </div>
                </div>
            </nav>

            <section v-if="index" class="kcl-card kcl-store" aria-label="Storage" data-testid="kcl-storage">
                <div class="kcl-rail__label" style="padding: 0">Storage</div>
                <div class="kcl-store__head">
                    <span class="kcl-store__big">{{ bigBytes[0] }}</span><span class="kcl-store__unit">{{ bigBytes[1] }} in {{ plural(index.files, 'file') }}</span>
                </div>
                <div v-if="kinds.length" class="kcl-mix" :title="kinds.map(k => `${KIND_LABEL[k.kind]}: ${formatBytes(k.bytes)}`).join('\n')">
                    <span v-for="k in kinds" :key="k.kind" :data-kind="k.kind" :style="{ flex: Math.max(k.bytes, index.bytes * 0.006) }"></span>
                </div>
                <div class="kcl-mixlist">
                    <span v-for="k in kinds.slice(0, 6)" :key="k.kind" :data-kind="k.kind">
                        <b><i></i>{{ KIND_LABEL[k.kind] }}</b><em>{{ k.files }}</em><em>{{ formatBytes(k.bytes) }}</em>
                    </span>
                </div>
                <div v-if="index.viaLinks.files" class="kcl-hint" style="font-size: 11.5px">{{ plural(index.viaLinks.files, 'file') }} ({{ formatBytes(index.viaLinks.bytes) }}) came in through share links.</div>
                <div v-if="drive" class="kcl-meter" :data-tone="drive.pct >= 92 ? 'crit' : drive.pct >= 80 ? 'warn' : 'ok'">
                    <div class="kcl-meter__row">
                        <span>Disk {{ drive.name }}</span>
                        <span class="kcl-num">{{ formatBytes(drive.free) }} free</span>
                    </div>
                    <div class="kcl-meter__track" role="meter" :aria-valuenow="Math.round(drive.pct)" aria-valuemin="0" aria-valuemax="100" aria-label="Disk space used">
                        <div class="kcl-meter__fill" :style="{ width: `${Math.min(100, drive.pct)}%` }"></div>
                        <div class="kcl-meter__mine" :style="{ width: `${Math.min(100, (index.bytes / drive.total) * 100)}%` }" title="KliveCloud's share of the disk"></div>
                    </div>
                    <div class="kcl-hint" style="font-size: 11px">{{ Math.round(drive.pct) }}% of {{ formatBytes(drive.total) }} used · KliveCloud is {{ pctOfDisk }}</div>
                </div>
            </section>
        </div>
    </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { KIND_LABEL, ROOT, childrenIn, formatBytes, pathTo, plural, sortDrive, type DriveIndex, type DriveItem, type DriveSpace, type DriveView } from '~/scripts/klivecloud/drive';

/* Places, the folder tree and what the drive holds. Folders in the tree are drop targets for
   moving (the page reads data-drop-key). */
const props = defineProps<{
    index: DriveIndex | null;
    view: DriveView;
    folderKey: string;
    canLinks: boolean;
    linkCounts: { total: number; broken: number };
    drive: DriveSpace | null;
    dropKey: string | null;
    now: number;
    open?: boolean;
}>();
defineEmits<{ go: [view: DriveView, key?: string] }>();

const STORE_KEY = 'kcl:tree-open';
const opened = ref<Set<string>>(new Set());
try { opened.value = new Set(JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]')); } catch { /* fresh */ }
const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify([...opened.value])); } catch { /* private mode */ } };

function toggle(key: string) {
    const next = new Set(opened.value);
    if (next.has(key)) next.delete(key); else next.add(key);
    opened.value = next;
    save();
}

// The folder you are in is always visible in the tree.
watch(() => [props.folderKey, props.index] as const, () => {
    if (!props.index || !props.folderKey) return;
    const chain = pathTo(props.index, props.folderKey).slice(0, -1);
    if (chain.every(step => opened.value.has(step.key))) return;
    const next = new Set(opened.value);
    for (const step of chain) next.add(step.key);
    opened.value = next;
    save();
}, { immediate: true });

const foldersIn = (key: string) => (props.index ? sortDrive(childrenIn(props.index, key).filter(item => item.type === 'Folder'), 'name', 1) : []);
const rootFolders = computed(() => foldersIn(ROOT));

interface Node { item: DriveItem; depth: number; open: boolean; kids: boolean }
const nodes = computed<Node[]>(() => {
    const out: Node[] = [];
    const walk = (list: DriveItem[], depth: number) => {
        for (const item of list) {
            const kids = foldersIn(item.key);
            const open = opened.value.has(item.key);
            out.push({ item, depth, open, kids: kids.length > 0 });
            if (open && kids.length && depth < 12) walk(kids, depth + 1);
        }
    };
    walk(rootFolders.value, 0);
    return out;
});

const kinds = computed(() => props.index?.kinds ?? []);
const bigBytes = computed(() => {
    const text = formatBytes(props.index?.bytes ?? 0);
    const space = text.indexOf(' ');
    return space > 0 ? [text.slice(0, space), text.slice(space + 1)] : [text, ''];
});
const pctOfDisk = computed(() => {
    if (!props.drive || !props.index) return '';
    const pct = (props.index.bytes / props.drive.total) * 100;
    return pct < 0.1 ? 'under 0.1% of it' : `${pct.toFixed(pct < 10 ? 1 : 0)}% of it`;
});

const recentToday = computed(() => {
    if (!props.index) return 0;
    const start = new Date(props.now); start.setHours(0, 0, 0, 0);
    let count = 0;
    for (const item of props.index.byKey.values()) if (item.type === 'File' && item.modified >= start.getTime()) count++;
    return count;
});
</script>
