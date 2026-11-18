<template>
    <aside class="kcl-card kcl-sheet" aria-label="Details" data-testid="kcl-sheet">
        <header class="kcl-sheet__head">
            <h3>{{ item ? (item.type === 'Folder' ? 'Folder' : 'File') : selection.length ? 'Selection' : 'Details' }}</h3>
            <button class="kcl-iconbtn" title="Hide details (I)" aria-label="Hide details" @click="$emit('close')"><KliveCloudIcon name="close" :size="15" /></button>
        </header>

        <div class="kcl-sheet__scroll">
            <!-- ── one item ── -->
            <template v-if="item">
                <div class="kcl-sheet__pic" :title="item.type === 'File' ? 'Open (Space)' : 'Open folder'" data-testid="sheet-pic" @click="$emit('open', item)">
                    <CloudThumb :key="item.key" :item="item" fill :glyph="64" :resolution="800" />
                </div>
                <div class="kcl-sheet__name" data-testid="sheet-name">{{ item.name }}</div>
                <div class="kcl-sheet__kind">{{ item.type === 'Folder' ? folderSummary(item) : `${describeItem(item)} · ${formatBytes(item.bytes)}` }}</div>

                <div class="kcl-sheet__actions">
                    <button class="kcl-btn kcl-btn--sm kcl-btn--primary" data-testid="sheet-open" @click="$emit('open', item)">
                        <KliveCloudIcon :name="item.type === 'Folder' ? 'folder' : 'eye'" :size="14" />{{ item.type === 'Folder' ? 'Open' : 'Preview' }}
                    </button>
                    <button v-if="allowed.download" class="kcl-btn kcl-btn--sm" @click="$emit('download', item)"><KliveCloudIcon name="download" :size="14" />{{ item.type === 'Folder' ? 'ZIP' : 'Download' }}</button>
                    <button v-if="editable && allowed.organize" class="kcl-btn kcl-btn--sm" title="Rename (F2)" @click="$emit('rename', item)"><KliveCloudIcon name="pencil" :size="14" />Rename</button>
                    <button v-if="editable && allowed.organize" class="kcl-btn kcl-btn--sm" @click="$emit('move', [item])"><KliveCloudIcon name="folder-move" :size="14" />Move</button>
                    <button v-if="editable && allowed.remove" class="kcl-btn kcl-btn--sm kcl-btn--danger" title="Delete (Del)" @click="$emit('remove', [item])"><KliveCloudIcon name="trash" :size="14" /></button>
                </div>

                <!-- links -->
                <section v-if="allowed.share" class="kcl-sheet__section" data-testid="sheet-links">
                    <header>
                        <h4>Share links</h4>
                        <button v-if="editable" class="kcl-btn kcl-btn--xs" data-testid="sheet-new-link" @click="$emit('link', item)"><KliveCloudIcon name="plus" :size="12" />New link</button>
                    </header>
                    <p v-if="!itemLinks.length" class="kcl-hint">{{ editable ? 'No public link. Anyone with a link can open it without signing in.' : 'No public link.' }}</p>
                    <div v-for="link in itemLinks" :key="link.code" class="kcl-linkcard" :data-state="linkState(link, now)">
                        <div class="kcl-linkcard__row">
                            <span class="kcl-linkcard__url" :title="url(link)">{{ url(link).replace(/^https?:\/\//, '') }}</span>
                            <button class="kcl-iconbtn kcl-iconbtn--sm" title="Copy link" :aria-label="`Copy link ${link.code}`" @click="$emit('copyLink', link)"><KliveCloudIcon name="copy" :size="13" /></button>
                            <button class="kcl-iconbtn kcl-iconbtn--sm" title="Change" :aria-label="`Change link ${link.code}`" @click="$emit('editLink', link)"><KliveCloudIcon name="pencil" :size="13" /></button>
                        </div>
                        <div v-if="link.problem" class="kcl-problem"><KliveCloudIcon name="alert" :size="12" />{{ link.problemText }}</div>
                        <div class="kcl-linkcard__meta">
                            {{ item.type === 'Folder' ? MODE_LABEL[link.mode] : 'View' }} · {{ link.expires ? expiryText(link) : 'never expires' }}<template v-if="link.counted"> · {{ usageText(link) }}</template>
                        </div>
                    </div>
                </section>

                <!-- who -->
                <section class="kcl-sheet__section" data-testid="sheet-access">
                    <header>
                        <h4>Who can use it</h4>
                        <button v-if="editable && allowed.share" class="kcl-btn kcl-btn--xs" data-testid="sheet-people" @click="$emit('people', item)"><KliveCloudIcon name="users" :size="12" />Manage</button>
                    </header>
                    <div class="kcl-access" style="color: var(--kcl-ink-2)">
                        <KliveCloudIcon :name="item.access === 'Everyone' ? 'globe' : /person|people/i.test(item.access) ? 'users' : 'lock'" :size="13" />
                        {{ item.level === 'Viewer' ? 'You can view it' : accessLine }}
                    </div>
                </section>

                <!-- facts -->
                <section class="kcl-sheet__section">
                    <header><h4>About</h4></header>
                    <dl class="kcl-facts">
                        <dt>Where</dt>
                        <dd><button :title="`Open ${item.path || 'My drive'}`" @click="$emit('go', item.parentKey)">{{ item.path || 'My drive' }}</button></dd>
                        <template v-if="item.type === 'Folder'">
                            <dt>Inside</dt><dd>{{ folderSummary(item) }}</dd>
                            <dt>Last change</dt><dd>{{ formatFull(item.newest, now) }}</dd>
                        </template>
                        <template v-else>
                            <dt>Size</dt><dd>{{ formatBytes(item.bytes) }} <span class="kcl-dim">({{ item.bytes.toLocaleString('en-GB') }} bytes)</span></dd>
                            <dt>Kind</dt><dd>{{ describeItem(item) }}</dd>
                        </template>
                        <dt>Modified</dt><dd>{{ formatFull(item.modified, now) }}</dd>
                        <dt>Added</dt><dd>{{ formatFull(item.created, now) }}<template v-if="item.createdBy"> by {{ item.createdBy }}</template></dd>
                        <dt>Your access</dt><dd>{{ item.level === 'Editor' ? 'Can edit' : 'Can view' }}</dd>
                    </dl>
                </section>
            </template>

            <!-- ── several ── -->
            <template v-else-if="selection.length">
                <div class="kcl-sheet__name">{{ plural(selection.length, 'item') }}</div>
                <div class="kcl-sheet__kind">{{ selectionSummary }}</div>
                <div class="kcl-sheet__actions">
                    <button v-if="allowed.download" class="kcl-btn kcl-btn--sm kcl-btn--primary" @click="$emit('downloadMany', selection)"><KliveCloudIcon name="download" :size="14" />Download</button>
                    <button v-if="allEditable && allowed.organize" class="kcl-btn kcl-btn--sm" @click="$emit('move', selection)"><KliveCloudIcon name="folder-move" :size="14" />Move</button>
                    <button v-if="allEditable && allowed.remove" class="kcl-btn kcl-btn--sm kcl-btn--danger" @click="$emit('remove', selection)"><KliveCloudIcon name="trash" :size="14" />Delete</button>
                </div>
                <section class="kcl-sheet__section">
                    <header><h4>By kind</h4></header>
                    <dl class="kcl-facts">
                        <template v-for="row in selectionKinds" :key="row.kind"><dt>{{ KIND_LABEL[row.kind] }}</dt><dd>{{ row.count }} · {{ formatBytes(row.bytes) }}</dd></template>
                    </dl>
                </section>
            </template>

            <!-- ── nothing picked: where you are ── -->
            <template v-else-if="place">
                <div class="kcl-sheet__name" style="display: flex; align-items: center; gap: 10px">
                    <CloudGlyph kind="folder" :size="30" />{{ place.title }}
                </div>
                <div class="kcl-sheet__kind">{{ place.sub }}</div>
                <section v-if="place.kinds.length" class="kcl-sheet__section">
                    <header><h4>What it holds</h4></header>
                    <div class="kcl-mix"><span v-for="k in place.kinds" :key="k.kind" :data-kind="k.kind" :style="{ flex: Math.max(k.bytes, place.bytes * 0.01) }"></span></div>
                    <dl class="kcl-facts">
                        <template v-for="k in place.kinds.slice(0, 5)" :key="k.kind"><dt>{{ KIND_LABEL[k.kind] }}</dt><dd>{{ k.files }} · {{ formatBytes(k.bytes) }}</dd></template>
                    </dl>
                </section>
                <section v-if="place.recent.length" class="kcl-sheet__section" data-testid="sheet-recent">
                    <header><h4>Changed lately</h4></header>
                    <button v-for="file in place.recent" :key="file.key" class="kcl-place" style="height: 34px" :title="file.path ? `${file.path} / ${file.name}` : file.name" @click="$emit('reveal', file)">
                        <CloudThumb :item="file" :size="22" />
                        <span class="kcl-place__label">{{ file.name }}</span>
                        <span class="kcl-place__count">{{ formatWhen(file.modified, now) }}</span>
                    </button>
                </section>
                <section v-if="place.biggest.length" class="kcl-sheet__section">
                    <header><h4>Largest</h4></header>
                    <button v-for="file in place.biggest" :key="file.key" class="kcl-place" style="height: 34px" :title="file.path ? `${file.path} / ${file.name}` : file.name" @click="$emit('reveal', file)">
                        <CloudThumb :item="file" :size="22" />
                        <span class="kcl-place__label">{{ file.name }}</span>
                        <span class="kcl-place__count">{{ formatBytes(file.bytes) }}</span>
                    </button>
                </section>
                <p class="kcl-hint" style="padding: 10px 14px 14px">Pick something to see its details: Space opens it, F2 renames it, Delete removes it.</p>
            </template>
            <div v-else class="kcl-empty">
                <span class="kcl-empty__icon"><KliveCloudIcon name="info" :size="18" /></span>
                Pick a file or folder to see its details.
            </div>
        </div>
    </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
    KIND_LABEL, MODE_LABEL, describeItem, folderSummary, formatBytes, linkState, plural, shareUrl,
    type DriveItem, type DriveLink, type KindTotal,
} from '~/scripts/klivecloud/drive';
import { describeExpiry, formatFull, formatWhen, type FileKind } from '~/scripts/klivecloud/shared';

const props = defineProps<{
    item: DriveItem | null;
    selection: DriveItem[];
    folder: DriveItem | null;
    /** What to show with nothing picked: the folder you are in (or the drive), in brief. */
    place: { title: string; sub: string; bytes: number; recent: DriveItem[]; biggest: DriveItem[]; kinds: KindTotal[] } | null;
    linkMap: Map<string, DriveLink[]>;
    now: number;
    origin: string;
    allowed: { download: boolean; organize: boolean; remove: boolean; share: boolean };
}>();

defineEmits<{
    close: []; open: [item: DriveItem]; download: [item: DriveItem]; downloadMany: [items: DriveItem[]];
    rename: [item: DriveItem]; move: [items: DriveItem[]]; remove: [items: DriveItem[]];
    link: [item: DriveItem]; editLink: [link: DriveLink]; copyLink: [link: DriveLink]; people: [item: DriveItem]; go: [folderKey: string];
    reveal: [item: DriveItem];
}>();

const editable = computed(() => props.item?.level === 'Editor');
const allEditable = computed(() => props.selection.every(item => item.level === 'Editor'));
const itemLinks = computed(() => (props.item ? props.linkMap.get(props.item.key) ?? [] : []));

const url = (link: DriveLink) => shareUrl(props.origin, link.code);
const expiryText = (link: DriveLink) => describeExpiry(link.expires ?? NaN, props.now).text.replace(/^Expires/, 'expires');

function usageText(link: DriveLink) {
    if (!link.opens && !link.downloads) return 'not opened yet';
    const parts = [`opened ${link.opens}×`];
    if (link.downloads) parts.push(`${link.downloads} download${link.downloads === 1 ? '' : 's'}`);
    return parts.join(', ');
}

const accessLine = computed(() => {
    const a = props.item?.access ?? '';
    if (a === 'Everyone') return 'Every profile that can use KliveCloud';
    if (a === 'Inherited') return 'Whoever can use the folder above';
    if (/^only/i.test(a)) return `${a.replace(/^Only /i, 'Only ')}`;
    return a || 'Only you';
});

const selectionSummary = computed(() => {
    const files = props.selection.filter(i => i.type === 'File').length;
    const folders = props.selection.length - files;
    const bytes = props.selection.reduce((sum, i) => sum + i.bytes, 0);
    return [folders ? plural(folders, 'folder') : '', files ? plural(files, 'file') : '', formatBytes(bytes)].filter(Boolean).join(' · ');
});

const selectionKinds = computed(() => {
    const map = new Map<FileKind, { kind: FileKind; count: number; bytes: number }>();
    for (const item of props.selection) {
        const row = map.get(item.kind) ?? { kind: item.kind, count: 0, bytes: 0 };
        row.count++;
        row.bytes += item.bytes;
        map.set(item.kind, row);
    }
    return [...map.values()].sort((a, b) => b.bytes - a.bytes);
});
</script>
