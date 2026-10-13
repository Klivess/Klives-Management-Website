<template>
    <div class="ot-os ks" :class="{ solo: index && !isFolderShare }" :style="{ '--ks-head': `${headHeight}px` }">
        <header ref="head" class="ks-head" :inert="!!viewer">
            <div class="ks-top ks-frame">
                <span class="ks-brand"><KliveCloudIcon name="cloud" :size="19" /><b>KliveCloud</b></span>
                <template v-if="root">
                    <span class="ks-divider" aria-hidden="true"></span>
                    <div class="ks-title">
                        <KliveCloudFileGlyph :kind="root.kind" :size="30" />
                        <div class="ks-title-text">
                            <h1>{{ root.name }}</h1>
                            <div class="ks-meta">
                                <span class="ks-summary">{{ summary }}</span>
                                <span v-if="isFolderShare" class="ot-chip ks-mode" :class="{ info: mode !== 'ReadOnly' }">{{ modeLabel }}</span>
                                <span v-if="expiry" class="ot-chip" :class="{ warn: expiry.soon }"><KliveCloudIcon name="clock" :size="11" />{{ expiry.text }}</span>
                            </div>
                        </div>
                    </div>
                    <div class="ks-actions">
                        <button type="button" class="ot-btn ghost" :aria-label="copied === 'page' ? 'Link copied' : 'Copy link'" @click="copyLink(pageLink, 'page')">
                            <KliveCloudIcon :name="copied === 'page' ? 'check' : 'link'" :size="16" />
                            <span class="ks-wide">{{ copied === 'page' ? 'Copied' : 'Copy link' }}</span>
                        </button>
                        <a v-if="downloadAllUrl" class="ot-btn primary" :href="downloadAllUrl" :aria-label="isFolderShare ? 'Download all' : 'Download'">
                            <KliveCloudIcon name="download" :size="16" />
                            <span class="ks-wide">{{ isFolderShare ? 'Download all' : 'Download' }}</span>
                        </a>
                    </div>
                </template>
            </div>

            <div v-if="index && isFolderShare" class="ks-tools ks-frame" :class="{ selecting: selectedCount > 0 }">
                <template v-if="selectedCount">
                    <button type="button" class="ks-icon" title="Clear selection" aria-label="Clear selection" @click="clearSelection">
                        <KliveCloudIcon name="close" :size="17" />
                    </button>
                    <span class="ks-selected"><b>{{ selectedCount.toLocaleString('en-GB') }} selected</b><span> · {{ formatBytes(selectedBytes) }}</span></span>
                    <button v-if="!allSelected" type="button" class="ks-textbtn" @click="selectAll">Select all {{ listing.length.toLocaleString('en-GB') }}</button>
                    <div class="ks-spacer"></div>
                    <button v-if="canDownloadSelection" type="button" class="ot-btn sm" @click="downloadSelection">
                        <KliveCloudIcon name="download" :size="15" /><span class="ks-wide">Download</span>
                    </button>
                    <button v-if="canWrite" type="button" class="ot-btn sm" @click="askMove(selectedKeys)">
                        <KliveCloudIcon name="folder-move" :size="15" /><span class="ks-wide">Move</span>
                    </button>
                    <button v-if="canDelete" type="button" class="ot-btn sm danger" @click="askRemove(selectedKeys)">
                        <KliveCloudIcon name="trash" :size="15" /><span class="ks-wide">Delete</span>
                    </button>
                </template>

                <template v-else>
                    <nav class="ks-crumbs" aria-label="Folder path">
                        <span v-if="searching" class="ks-crumb current">{{ plural(listing.length, 'result') }} for “{{ query.trim() }}”</span>
                        <template v-else>
                            <template v-for="(crumb, i) in crumbs" :key="crumb.key">
                                <KliveCloudIcon v-if="i > 0" name="chevron-right" :size="14" class="ks-crumb-sep" />
                                <span v-if="i === crumbs.length - 1" class="ks-crumb current" aria-current="page">{{ crumb.name }}</span>
                                <button v-else type="button" class="ks-crumb" :class="{ target: dropKey === crumb.key }" :data-drop-key="crumb.key" @click="openFolder(crumb.key)">
                                    {{ crumb.name }}
                                </button>
                            </template>
                        </template>
                    </nav>

                    <label class="ks-search">
                        <KliveCloudIcon name="search" :size="15" />
                        <input ref="searchInput" v-model="query" type="search" :placeholder="`Search ${root?.name ?? ''}`" aria-label="Search everything in this share"
                               autocomplete="off" spellcheck="false" @keydown.esc.prevent="clearSearch" />
                        <kbd v-if="!query" class="ks-kbd" aria-hidden="true">/</kbd>
                        <button v-else type="button" class="ks-search-clear" aria-label="Clear search" @click="clearSearch">
                            <KliveCloudIcon name="close" :size="14" />
                        </button>
                    </label>

                    <select v-if="view === 'grid'" v-model="sortChoice" class="ot-select auto ks-sortpick" aria-label="Sort">
                        <option value="name:1">Name</option>
                        <option value="modified:-1">Newest first</option>
                        <option value="modified:1">Oldest first</option>
                        <option value="size:-1">Largest first</option>
                        <option value="size:1">Smallest first</option>
                        <option value="kind:1">Kind</option>
                    </select>

                    <div class="ot-segment ks-views" role="group" aria-label="View">
                        <button type="button" title="List" aria-label="List" :aria-pressed="view === 'list'" @click="setView('list')"><KliveCloudIcon name="list" :size="16" /></button>
                        <button type="button" title="Grid" aria-label="Grid" :aria-pressed="view === 'grid'" @click="setView('grid')"><KliveCloudIcon name="grid" :size="16" /></button>
                    </div>

                    <template v-if="canWrite">
                        <button type="button" class="ot-btn ghost ks-newfolder" @click="askNewFolder">
                            <KliveCloudIcon name="folder-plus" :size="16" /><span>New folder</span>
                        </button>
                        <div class="ks-split ks-pop">
                            <button type="button" class="ot-btn" @click="pickFiles"><KliveCloudIcon name="upload" :size="16" /><span class="ks-wide">Upload</span></button>
                            <button type="button" class="ot-btn ks-split-more" aria-label="More ways to add" :aria-expanded="menu === 'upload'" @click="toggleMenu('upload')">
                                <KliveCloudIcon name="chevron-down" :size="15" />
                            </button>
                            <div v-if="menu === 'upload'" class="ks-menu" role="menu">
                                <button type="button" role="menuitem" @click="pickFiles"><KliveCloudIcon name="upload" :size="15" />Upload files</button>
                                <button type="button" role="menuitem" @click="pickFolder"><KliveCloudIcon name="folder" :size="15" />Upload a folder</button>
                                <button type="button" role="menuitem" @click="askNewFolder"><KliveCloudIcon name="folder-plus" :size="15" />New folder</button>
                            </div>
                        </div>
                    </template>
                </template>
            </div>
        </header>

        <main class="ks-main ks-frame" :class="{ solo: index && !isFolderShare }" :inert="!!viewer">
            <div v-if="!index && pending" class="ks-loading" aria-label="Loading">
                <div v-for="n in 6" :key="n" class="ks-skel"><span class="ot-skel"></span><span class="ot-skel"></span></div>
            </div>

            <section v-else-if="!index" class="ks-state" role="alert">
                <span class="ks-state-icon" :class="{ bad: failure.retry }"><KliveCloudIcon :name="failure.icon" :size="22" /></span>
                <h2>{{ failure.title }}</h2>
                <p>{{ failure.detail }}</p>
                <button v-if="failure.retry" type="button" class="ot-btn" @click="retryLoad"><KliveCloudIcon name="refresh" :size="15" /> Try again</button>
            </section>

            <section v-else-if="!isFolderShare && root" class="ks-single">
                <KliveCloudPreview :item="root" :code="code" single variant="page" />
            </section>

            <section v-else class="ks-folder">
                <div v-if="!listing.length" class="ks-empty" :class="{ droppable: canWrite && !searching }">
                    <template v-if="searching">
                        <span class="ks-empty-icon"><KliveCloudIcon name="search" :size="22" /></span>
                        <strong>No matches for “{{ query.trim() }}”</strong>
                        <button type="button" class="ot-btn sm ghost" @click="clearSearch">Clear search</button>
                    </template>
                    <template v-else>
                        <span class="ks-empty-icon"><KliveCloudIcon :name="canWrite ? 'upload' : 'folder'" :size="22" /></span>
                        <strong>This folder is empty</strong>
                        <template v-if="canWrite">
                            <span>Drop files here, or</span>
                            <div class="ks-empty-actions">
                                <button type="button" class="ot-btn primary" @click="pickFiles"><KliveCloudIcon name="upload" :size="15" /> Upload files</button>
                                <button type="button" class="ot-btn ghost" @click="askNewFolder"><KliveCloudIcon name="folder-plus" :size="15" /> New folder</button>
                            </div>
                        </template>
                    </template>
                </div>

                <table v-else-if="view === 'list'" class="ks-list" :class="{ selecting: selectedCount > 0, searching }">
                    <thead>
                        <tr>
                            <th class="ks-c-check">
                                <input type="checkbox" class="ks-check" :checked="allSelected" :indeterminate="someSelected" aria-label="Select all" @change="toggleAll" />
                            </th>
                            <th v-for="column in COLUMNS" :key="column.key" :class="column.cls" :aria-sort="sort.key === column.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined">
                                <button type="button" class="ks-sort" :class="{ on: sort.key === column.key }" @click="sortBy(column.key)">
                                    {{ column.label }}
                                    <KliveCloudIcon v-if="sort.key === column.key" :name="sort.dir === 1 ? 'arrow-up' : 'arrow-down'" :size="12" />
                                </button>
                            </th>
                            <th class="ks-c-act"><span class="ks-sr">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="item in visible" :key="item.key" class="ks-row" :class="itemClass(item)" :data-drop-key="item.type === 'Folder' ? item.key : undefined"
                            :draggable="canWrite" @click="onItemClick($event, item)" @dragstart="onDragStart($event, item)" @dragend="onDragEnd">
                            <td class="ks-c-check">
                                <input type="checkbox" class="ks-check" :checked="selected.has(item.key)" :aria-label="`Select ${item.name}`" @click.stop="onCheck($event, item)" />
                            </td>
                            <td class="ks-c-name">
                                <div class="ks-name">
                                    <KliveCloudThumb :kind="item.kind" :url="thumbUrl(item)" :glyph="30" class="ks-thumb" />
                                    <div class="ks-name-text">
                                        <button type="button" class="ks-open" :class="{ folder: item.type === 'Folder' }" :tabindex="item.key === tabStop ? 0 : -1"
                                                :data-focus-key="item.key" @keydown="onItemKey($event, item)" @focus="focusKey = item.key">{{ item.name }}</button>
                                        <span class="ks-sub">
                                            <button v-if="searching" type="button" class="ks-where" @click.stop="openFolder(item.parentKey)">{{ locationOf(item) }}</button>
                                            <span class="ks-sub-meta">{{ subMeta(item) }}</span>
                                        </span>
                                    </div>
                                </div>
                            </td>
                            <td class="ks-c-kind">{{ describeItem(item) }}</td>
                            <td class="ks-c-size">{{ sizeText(item) }}</td>
                            <td class="ks-c-date">{{ formatWhen(item.modified, now) }}</td>
                            <td class="ks-c-act" @click.stop>
                                <div class="ks-acts">
                                    <a v-if="downloadUrlFor(item)" class="ks-icon ks-quick" :href="downloadUrlFor(item)" :title="item.type === 'Folder' ? 'Download as ZIP' : 'Download'"
                                       :aria-label="`Download ${item.name}`"><KliveCloudIcon name="download" :size="16" /></a>
                                    <button type="button" class="ks-icon ks-quick" :title="copied === item.key ? 'Copied' : 'Copy link'" :aria-label="`Copy link to ${item.name}`"
                                            @click="copyLink(linkFor(item), item.key)"><KliveCloudIcon :name="copied === item.key ? 'check' : 'link'" :size="16" /></button>
                                    <div class="ks-pop">
                                        <button type="button" class="ks-icon" title="More" :aria-label="`More for ${item.name}`" :aria-expanded="menu === item.key" @click="toggleMenu(item.key)">
                                            <KliveCloudIcon name="more" :size="16" />
                                        </button>
                                        <div v-if="menu === item.key" class="ks-menu" role="menu">
                                            <button type="button" role="menuitem" @click="open(item)"><KliveCloudIcon :name="item.type === 'Folder' ? 'folder' : 'eye'" :size="15" />{{ item.type === 'Folder' ? 'Open' : 'Preview' }}</button>
                                            <a v-if="downloadUrlFor(item)" role="menuitem" :href="downloadUrlFor(item)" @click="menu = null"><KliveCloudIcon name="download" :size="15" />{{ item.type === 'Folder' ? 'Download as ZIP' : 'Download' }}</a>
                                            <button type="button" role="menuitem" @click="copyLink(linkFor(item), item.key, true)"><KliveCloudIcon name="link" :size="15" />Copy link</button>
                                            <button v-if="canWrite" type="button" role="menuitem" @click="askMove([item.key])"><KliveCloudIcon name="folder-move" :size="15" />Move to…</button>
                                            <button v-if="canDelete" type="button" role="menuitem" class="danger" @click="askRemove([item.key])"><KliveCloudIcon name="trash" :size="15" />Delete</button>
                                        </div>
                                    </div>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <div v-else ref="gridEl" class="ks-grid" :class="{ selecting: selectedCount > 0 }">
                    <div v-for="item in visible" :key="item.key" class="ks-tile" :class="itemClass(item)" :data-drop-key="item.type === 'Folder' ? item.key : undefined"
                         :draggable="canWrite" @click="onItemClick($event, item)" @dragstart="onDragStart($event, item)" @dragend="onDragEnd">
                        <div class="ks-tile-media">
                            <KliveCloudThumb v-if="item.type === 'File'" :kind="item.kind" :url="thumbUrl(item)" :glyph="52" fill class="ks-tile-thumb" />
                            <KliveCloudFileGlyph v-else kind="folder" :size="58" />
                        </div>
                        <input type="checkbox" class="ks-check ks-tile-check" :checked="selected.has(item.key)" :aria-label="`Select ${item.name}`" @click.stop="onCheck($event, item)" />
                        <div class="ks-tile-info">
                            <button type="button" class="ks-open" :class="{ folder: item.type === 'Folder' }" :title="item.name" :tabindex="item.key === tabStop ? 0 : -1"
                                    :data-focus-key="item.key" @keydown="onItemKey($event, item)" @focus="focusKey = item.key">{{ item.name }}</button>
                            <span class="ks-tile-meta">{{ item.type === 'Folder' ? describeItem(item) : sizeText(item) }}</span>
                        </div>
                        <div class="ks-pop ks-tile-more" @click.stop>
                            <button type="button" class="ks-icon" title="More" :aria-label="`More for ${item.name}`" :aria-expanded="menu === item.key" @click="toggleMenu(item.key)">
                                <KliveCloudIcon name="more" :size="16" />
                            </button>
                            <div v-if="menu === item.key" class="ks-menu" role="menu">
                                <button type="button" role="menuitem" @click="open(item)"><KliveCloudIcon :name="item.type === 'Folder' ? 'folder' : 'eye'" :size="15" />{{ item.type === 'Folder' ? 'Open' : 'Preview' }}</button>
                                <a v-if="downloadUrlFor(item)" role="menuitem" :href="downloadUrlFor(item)" @click="menu = null"><KliveCloudIcon name="download" :size="15" />{{ item.type === 'Folder' ? 'Download as ZIP' : 'Download' }}</a>
                                <button type="button" role="menuitem" @click="copyLink(linkFor(item), item.key, true)"><KliveCloudIcon name="link" :size="15" />Copy link</button>
                                <button v-if="canWrite" type="button" role="menuitem" @click="askMove([item.key])"><KliveCloudIcon name="folder-move" :size="15" />Move to…</button>
                                <button v-if="canDelete" type="button" role="menuitem" class="danger" @click="askRemove([item.key])"><KliveCloudIcon name="trash" :size="15" />Delete</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div v-if="listing.length > limit" ref="moreEl" class="ks-more-rows"><span class="ot-skel"></span></div>
                <p v-if="listing.length" class="ks-foot">{{ footNote }}</p>
            </section>
        </main>

        <div v-if="dropping" class="ks-drop" aria-hidden="true">
            <div class="ks-drop-card"><KliveCloudIcon name="upload" :size="18" /><span>Drop to upload to <b>{{ dropFolderName }}</b></span></div>
        </div>

        <KliveCloudViewer v-if="viewer" :items="viewer.items" :index="viewer.index" :code="code" :link="linkFor(viewer.items[viewer.index])" :now="now"
                          @go="stepViewer" @close="closeViewer" />

        <KliveCloudUploadTray v-if="uploads.jobs.length || preparing" :jobs="uploads.jobs" :preparing="preparing"
                              @cancel="uploads.cancel" @retry="uploads.retry" @cancel-all="uploads.cancelAll" @clear="uploads.clearFinished" />

        <TransitionGroup name="ks-toast" tag="div" class="ks-toasts" :class="{ raised: uploads.jobs.length > 0 }" aria-live="polite">
            <div v-for="note in toasts" :key="note.id" class="ks-toast" :class="note.tone">
                <KliveCloudIcon :name="note.tone === 'bad' ? 'alert' : 'check'" :size="15" />
                <span>{{ note.text }}</span>
            </div>
        </TransitionGroup>

        <div v-if="menu" class="ks-backdrop" @click="menu = null" @contextmenu.prevent="menu = null"></div>

        <input ref="filePicker" class="ks-hidden" type="file" multiple tabindex="-1" aria-hidden="true" @change="onPicked" />
        <input ref="folderPicker" class="ks-hidden" type="file" webkitdirectory multiple tabindex="-1" aria-hidden="true" @change="onPicked" />

        <ProfilesModal :open="newFolder.open" title="New folder" @close="newFolder.open = false">
            <form class="ks-form" @submit.prevent="createFolder">
                <input v-model="newFolder.name" class="ot-input" maxlength="120" placeholder="Folder name" aria-label="Folder name" autofocus />
                <p v-if="newFolder.error" class="ks-form-error" role="alert">{{ newFolder.error }}</p>
            </form>
            <template #footer>
                <button type="button" class="ot-btn ghost" @click="newFolder.open = false">Cancel</button>
                <button type="button" class="ot-btn primary" :disabled="newFolder.busy || !newFolder.name.trim()" @click="createFolder">{{ newFolder.busy ? 'Creating…' : 'Create' }}</button>
            </template>
        </ProfilesModal>

        <ProfilesModal :open="!!removal" :title="removalTitle" tone="danger" @close="removal = null">
            <p class="ks-confirm">{{ removalDetail }}</p>
            <ul v-if="removalItems.length > 1" class="ks-confirm-list">
                <li v-for="item in removalItems.slice(0, 5)" :key="item.key"><KliveCloudFileGlyph :kind="item.kind" :size="22" /><span>{{ item.name }}</span></li>
                <li v-if="removalItems.length > 5" class="more">and {{ removalItems.length - 5 }} more</li>
            </ul>
            <template #footer>
                <button type="button" class="ot-btn ghost" @click="removal = null">Cancel</button>
                <button type="button" class="ot-btn danger" :disabled="removal?.busy" @click="confirmRemoval">{{ removal?.busy ? 'Deleting…' : 'Delete' }}</button>
            </template>
        </ProfilesModal>

        <KliveCloudFolderPicker v-if="index" :open="!!moving" :index="index" :keys="moving?.keys ?? []" :busy="moving?.busy" @close="moving = null" @pick="moveTo" />
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
    buildShareIndex, copyText, describeExpiry, describeItem, formatBytes, formatWhen, hasThumbnail, isWithin, keyOf, normalizeMode,
    pathTo, plural, postShare, searchShare, shareApi, sortItems, truthy,
    type RawShareInfo, type ShareItem, type SortKey,
} from '~/scripts/klivecloud/shared';
import { createUploadQueue, pastedName, takeDrop, takeInput, type Picked } from '~/scripts/klivecloud/uploads';

definePageMeta({ layout: 'empty' });

/* What someone sees when they open a KliveCloud share link: one file with its preview, or a
   folder to browse, preview, search and download, and (when the link allows) add to and tidy. */

const COLUMNS: { key: SortKey; label: string; cls: string }[] = [
    { key: 'name', label: 'Name', cls: 'ks-c-name' },
    { key: 'kind', label: 'Kind', cls: 'ks-c-kind' },
    { key: 'size', label: 'Size', cls: 'ks-c-size' },
    { key: 'modified', label: 'Modified', cls: 'ks-c-date' },
];
const PAGE_SIZE = 240;
const ZIP_PICK_LIMIT = 300;

const route = useRoute();
const router = useRouter();
const requestUrl = useRequestURL();
const code = computed(() => String(route.params.code || ''));

const { data, pending, error: fetchError, refresh } = await useFetch<RawShareInfo>(
    () => shareApi(code.value, false).info(),
    { key: `shared-item-${code.value}` },
);

// ── the share ──────────────────────────────────────────────────────────────

// A failed refresh empties `data`. Unless the link itself is gone, the page keeps showing the
// last listing it had rather than blanking over a dropped connection.
const lastGood = shallowRef<RawShareInfo | null>(data.value ?? null);
watch(data, value => { if (value) lastGood.value = value; });
const gone = computed(() => [404, 410].includes(Number(fetchError.value?.statusCode)));
const share = computed(() => (gone.value ? null : data.value ?? lastGood.value));

const index = computed(() => (share.value ? buildShareIndex(share.value) : null));
const root = computed(() => index.value?.root ?? null);
const isFolderShare = computed(() => root.value?.type === 'Folder');
const api = computed(() => shareApi(code.value, !isFolderShare.value));
const mode = computed(() => normalizeMode(share.value?.SharePermissionMode ?? share.value?.PermissionMode));
const canWrite = computed(() => isFolderShare.value && (truthy(share.value?.CanWrite) || mode.value !== 'ReadOnly'));
const canDelete = computed(() => isFolderShare.value && (truthy(share.value?.CanDelete) || mode.value === 'WriteDelete'));
const canZip = computed(() => truthy(share.value?.CanDownloadZip));
const modeLabel = computed(() => ({ ReadOnly: 'View only', Write: 'Can add files', WriteDelete: 'Can add & delete' }[mode.value]));

const now = ref<number | null>(null);
const expiry = computed(() => {
    const at = Date.parse(share.value?.ExpirationDate ?? '');
    return Number.isFinite(at) ? describeExpiry(at, now.value) : null;
});

const summary = computed(() => {
    const idx = index.value;
    if (!idx) return '';
    const r = idx.root;
    if (r.type === 'File') return `${describeItem(r)} · ${formatBytes(r.bytes)} · ${formatWhen(r.modified, now.value)}`;
    if (!idx.totalFiles && !idx.totalFolders) return 'Empty folder';
    const parts = [plural(idx.totalFiles, 'file')];
    if (idx.totalFolders) parts.push(plural(idx.totalFolders, 'folder'));
    parts.push(formatBytes(r.bytes));
    return parts.join(' · ');
});

const failure = computed(() => {
    const status = Number(fetchError.value?.statusCode);
    if (status === 404) return { icon: 'link', title: "This link doesn't work", detail: 'It may have been removed, or the address is incomplete.', retry: false };
    if (status === 410) return { icon: 'clock', title: 'This link has expired', detail: 'Ask whoever sent it for a new one.', retry: false };
    return { icon: 'alert', title: "Couldn't open this share", detail: "KliveCloud didn't respond.", retry: true };
});

function retryLoad() {
    void refresh();
}

watch(fetchError, error => {
    if (error && !gone.value && lastGood.value) toast("Couldn't refresh the folder.", 'bad');
});

// ── where we are: ?f=<folder>, ?file=<file being viewed> ──────────────────

const folderParam = computed(() => keyOf(route.query.f));
const fileParam = computed(() => keyOf(route.query.file));

const folderKey = computed(() => {
    const idx = index.value;
    if (!idx) return '';
    const asked = idx.byKey.get(folderParam.value);
    if (asked?.type === 'Folder') return asked.key;
    const file = idx.byKey.get(fileParam.value);
    if (file && file !== idx.root && file.type === 'File') return file.parentKey;
    return idx.root.key;
});
const folder = computed(() => index.value?.byKey.get(folderKey.value) ?? null);
const crumbs = computed(() => (index.value ? pathTo(index.value, folderKey.value) : []));

function otherParams() {
    const { f: _f, file: _file, ...rest } = route.query;
    return rest;
}

function folderParamFor(key: string) {
    const item = index.value?.byKey.get(key);
    return item && item !== index.value?.root ? item.id : undefined;
}

function openFolder(key: string) {
    const target = index.value?.byKey.get(key);
    if (!target || target.type !== 'Folder') return;
    query.value = '';
    menu.value = null;
    clearSelection();
    if (target.key !== folderKey.value || fileParam.value) void router.push({ query: { ...otherParams(), f: folderParamFor(target.key) } });
    if (import.meta.client) window.scrollTo({ top: 0 });
}

// ── listing ────────────────────────────────────────────────────────────────

const query = ref('');
const searching = computed(() => query.value.trim().length > 0);
const sort = reactive<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });

const listing = computed<ShareItem[]>(() => {
    const idx = index.value;
    if (!idx || !isFolderShare.value) return [];
    const base = searching.value ? searchShare(idx, query.value) : (idx.childrenOf.get(folderKey.value) ?? []);
    return sortItems(base, sort.key, sort.dir);
});

const limit = ref(PAGE_SIZE);
const visible = computed(() => listing.value.slice(0, limit.value));
watch([folderKey, query], () => { limit.value = PAGE_SIZE; });

const footNote = computed(() => {
    if (searching.value) return plural(listing.value.length, 'result');
    const bytes = listing.value.reduce((sum, item) => sum + item.bytes, 0);
    return `${plural(listing.value.length, 'item')} · ${formatBytes(bytes)}`;
});

function sortBy(key: SortKey) {
    if (sort.key === key) sort.dir = sort.dir === 1 ? -1 : 1;
    else {
        sort.key = key;
        sort.dir = key === 'name' || key === 'kind' ? 1 : -1;
    }
    savePrefs();
}

const sortChoice = computed({
    get: () => `${sort.key}:${sort.dir}`,
    set: (value: string) => {
        const [key, dir] = value.split(':');
        sort.key = key as SortKey;
        sort.dir = dir === '-1' ? -1 : 1;
        savePrefs();
    },
});

function thumbUrl(item: ShareItem) {
    return hasThumbnail(item) ? api.value.preview(item) : null;
}

function sizeText(item: ShareItem) {
    if (item.type === 'Folder') return item.files ? formatBytes(item.bytes) : '—';
    return formatBytes(item.bytes);
}

/** The line under a name on a phone, where the columns don't fit. */
function subMeta(item: ShareItem) {
    if (item.type === 'Folder') return item.files ? `${describeItem(item)} · ${formatBytes(item.bytes)}` : describeItem(item);
    return `${formatBytes(item.bytes)} · ${formatWhen(item.modified, now.value)}`;
}

function locationOf(item: ShareItem) {
    const idx = index.value;
    if (!idx) return '';
    const path = pathTo(idx, item.parentKey);
    return path.length > 1 ? path.slice(1).map(step => step.name).join(' / ') : idx.root.name;
}

// A folder mostly of photos and videos opens as a grid, until the visitor picks for themselves.
const autoView = computed<'list' | 'grid'>(() => {
    const files = (index.value?.childrenOf.get(folderKey.value) ?? []).filter(item => item.type === 'File');
    if (files.length < 4) return 'list';
    return files.filter(item => thumbUrl(item)).length / files.length >= 0.6 ? 'grid' : 'list';
});
const chosenView = ref<'list' | 'grid' | null>(null);
const view = computed(() => chosenView.value ?? autoView.value);

function setView(next: 'list' | 'grid') {
    chosenView.value = next;
    savePrefs();
}

const PREFS_KEY = 'klivecloud.share';
function savePrefs() {
    try {
        const stored = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
        stored.sort = { key: sort.key, dir: sort.dir };
        stored.views = { ...(stored.views ?? {}), ...(chosenView.value ? { [code.value]: chosenView.value } : {}) };
        localStorage.setItem(PREFS_KEY, JSON.stringify(stored));
    } catch { /* private window: just don't remember */ }
}

function loadPrefs() {
    try {
        const stored = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
        if (stored.sort?.key && COLUMNS.some(column => column.key === stored.sort.key)) {
            sort.key = stored.sort.key;
            sort.dir = stored.sort.dir === -1 ? -1 : 1;
        }
        const chosen = stored.views?.[code.value];
        if (chosen === 'list' || chosen === 'grid') chosenView.value = chosen;
    } catch { /* nothing remembered */ }
}

// ── selection ──────────────────────────────────────────────────────────────

const selected = ref(new Set<string>());
const anchorKey = ref('');
const selectedKeys = computed(() => [...selected.value]);
const selectedItems = computed(() => selectedKeys.value.map(key => index.value?.byKey.get(key)).filter((item): item is ShareItem => !!item));
const selectedCount = computed(() => selectedItems.value.length);
const selectedBytes = computed(() => outermost(selectedItems.value).reduce((sum, item) => sum + item.bytes, 0));
const allSelected = computed(() => listing.value.length > 0 && listing.value.every(item => selected.value.has(item.key)));
const someSelected = computed(() => selectedCount.value > 0 && !allSelected.value);
const canDownloadSelection = computed(() => canZip.value || selectedItems.value.some(item => item.type === 'File'));

/** Drops anything that sits inside another of the items (search results can hold both). */
function outermost(items: ShareItem[]) {
    const idx = index.value;
    if (!idx) return items;
    const keys = new Set(items.map(item => item.key));
    return items.filter(item => !pathTo(idx, item.parentKey).some(step => keys.has(step.key)));
}

function toggle(item: ShareItem) {
    const next = new Set(selected.value);
    if (next.has(item.key)) next.delete(item.key);
    else next.add(item.key);
    selected.value = next;
    anchorKey.value = item.key;
}

function selectRange(item: ShareItem) {
    const order = listing.value.map(entry => entry.key);
    const from = order.indexOf(anchorKey.value);
    const to = order.indexOf(item.key);
    if (from < 0 || to < 0) {
        toggle(item);
        return;
    }
    const next = new Set(selected.value);
    for (let i = Math.min(from, to); i <= Math.max(from, to); i++) next.add(order[i]);
    selected.value = next;
}

function selectAll() {
    selected.value = new Set(listing.value.map(item => item.key));
}

function clearSelection() {
    if (selected.value.size) selected.value = new Set();
    anchorKey.value = '';
}

function toggleAll() {
    if (allSelected.value) clearSelection();
    else selectAll();
}

function onCheck(event: MouseEvent, item: ShareItem) {
    if (event.shiftKey && anchorKey.value) selectRange(item);
    else toggle(item);
}

// Whatever no longer exists after a refresh drops out of the selection.
watch(index, idx => {
    if (!idx || !selected.value.size) return;
    const kept = new Set([...selected.value].filter(key => idx.byKey.has(key)));
    if (kept.size !== selected.value.size) selected.value = kept;
});
watch([folderKey, query], clearSelection);

// ── opening things ─────────────────────────────────────────────────────────

const focusKey = ref('');
const tabStop = computed(() => (visible.value.some(item => item.key === focusKey.value) ? focusKey.value : visible.value[0]?.key ?? ''));

function open(item: ShareItem) {
    menu.value = null;
    if (item.type === 'Folder') openFolder(item.key);
    else openFile(item);
}

function onItemClick(event: MouseEvent, item: ShareItem) {
    // One click opens. The second click of a double-click would land on whatever the first one
    // brought up under the pointer (the first row of the folder it opened, say).
    if (event.detail > 1) return;
    const target = event.target as HTMLElement;
    if (target.closest('.ks-c-act, .ks-pop, .ks-check, .ks-where, a')) return;
    focusKey.value = item.key;
    if (event.shiftKey && anchorKey.value) selectRange(item);
    else if (event.ctrlKey || event.metaKey || selectedCount.value > 0) toggle(item);
    else open(item);
}

const gridEl = ref<HTMLElement | null>(null);

function focusItem(key: string) {
    focusKey.value = key;
    void nextTick(() => {
        const el = document.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(key)}"]`);
        el?.focus({ preventScroll: true });
        el?.closest('.ks-row, .ks-tile')?.scrollIntoView({ block: 'nearest' });
    });
}

function onItemKey(event: KeyboardEvent, item: ShareItem) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const list = listing.value;
    const at = list.findIndex(entry => entry.key === item.key);
    const columns = view.value === 'grid' && gridEl.value ? getComputedStyle(gridEl.value).gridTemplateColumns.split(' ').filter(Boolean).length || 1 : 1;
    let next = -1;
    switch (event.key) {
        case 'ArrowDown': next = at + columns; break;
        case 'ArrowUp': next = at - columns; break;
        case 'ArrowRight': if (view.value === 'grid') next = at + 1; break;
        case 'ArrowLeft': if (view.value === 'grid') next = at - 1; break;
        case 'Home': next = 0; break;
        case 'End': next = list.length - 1; break;
        case ' ':
            event.preventDefault();
            toggle(item);
            return;
        default: return;
    }
    event.preventDefault();
    if (next < 0 || next >= list.length) return;
    if (next >= limit.value) limit.value = Math.ceil((next + 1) / PAGE_SIZE) * PAGE_SIZE;
    if (event.shiftKey) {
        if (!anchorKey.value) anchorKey.value = item.key;
        selectRange(list[next]);
    }
    focusItem(list[next].key);
}

// ── the viewer ─────────────────────────────────────────────────────────────

const viewer = computed(() => {
    const idx = index.value;
    const file = idx?.byKey.get(fileParam.value);
    if (!idx || !file || file === idx.root || file.type !== 'File') return null;
    let items = listing.value.filter(item => item.type === 'File');
    if (!items.some(item => item.key === file.key)) {
        items = sortItems((idx.childrenOf.get(file.parentKey) ?? []).filter(item => item.type === 'File'), sort.key, sort.dir);
    }
    return { items, index: Math.max(0, items.findIndex(item => item.key === file.key)) };
});

// Opening pushes a history entry, so Back closes the viewer rather than leaving the page.
const viewerPushed = ref(false);
watch(fileParam, (key, previous) => {
    if (key) return;
    viewerPushed.value = false;
    // However it closed (Escape, the button, Back), the last file looked at is where focus goes.
    if (previous && import.meta.client) focusItem(previous);
});

function openFile(item: ShareItem) {
    viewerPushed.value = true;
    void router.push({ query: { ...otherParams(), f: folderParamFor(folderKey.value), file: item.id } });
}

function stepViewer(at: number) {
    const item = viewer.value?.items[at];
    if (item) void router.replace({ query: { ...route.query, file: item.id } });
}

function closeViewer() {
    if (viewerPushed.value && window.history.state?.back) {
        viewerPushed.value = false;
        router.back();
    } else {
        void router.replace({ query: { ...otherParams(), f: folderParamFor(folderKey.value) } });
    }
}

// ── links & downloads ──────────────────────────────────────────────────────

const shareBase = computed(() => `${requestUrl.origin}/shared/${encodeURIComponent(code.value)}`);

function linkFor(item?: ShareItem | null) {
    const idx = index.value;
    if (!item || !idx || item === idx.root) return shareBase.value;
    return `${shareBase.value}?${item.type === 'Folder' ? 'f' : 'file'}=${encodeURIComponent(item.id)}`;
}

const pageLink = computed(() => linkFor(folder.value));

const copied = ref('');
let copiedTimer: ReturnType<typeof setTimeout> | undefined;
async function copyLink(url: string, tag: string, announce = false) {
    menu.value = null;
    if (!(await copyText(url))) {
        toast("Couldn't copy the link.", 'bad');
        return;
    }
    copied.value = tag;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => { copied.value = ''; }, 1600);
    if (announce) toast('Link copied');
}

const downloadAllUrl = computed(() => {
    const idx = index.value;
    if (!idx) return '';
    if (!isFolderShare.value) return api.value.download();
    return canZip.value && idx.root.files > 0 ? api.value.zip() : '';
});

function downloadUrlFor(item: ShareItem) {
    if (item.type === 'File') return api.value.download(item);
    return canZip.value && item.files > 0 ? api.value.zip(item.id) : '';
}

function startDownload(url: string) {
    const link = document.createElement('a');
    link.href = url;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
}

function downloadSelection() {
    const items = outermost(selectedItems.value);
    if (!items.length) return;
    if (items.length === 1) {
        const url = downloadUrlFor(items[0]);
        if (url) startDownload(url);
        return;
    }
    if (canZip.value) {
        const here = searching.value ? undefined : folderParamFor(folderKey.value);
        if (!searching.value && allSelected.value) startDownload(api.value.zip(here));
        else if (items.length > ZIP_PICK_LIMIT) toast(`Pick up to ${ZIP_PICK_LIMIT} items, or download the whole folder.`, 'bad');
        else startDownload(api.value.zip(here, items.map(item => item.id)));
        return;
    }
    // A server without ZIP downloads: one download per file.
    items.filter(item => item.type === 'File').forEach((item, i) => setTimeout(() => startDownload(api.value.download(item)), i * 350));
}

// ── menus & toasts ─────────────────────────────────────────────────────────

const menu = ref<string | null>(null);
function toggleMenu(name: string) {
    menu.value = menu.value === name ? null : name;
}

const toasts = ref<{ id: number; text: string; tone: 'ok' | 'bad' }[]>([]);
let toastId = 0;
function toast(text: string, tone: 'ok' | 'bad' = 'ok') {
    const id = ++toastId;
    toasts.value = [...toasts.value.slice(-2), { id, text, tone }];
    setTimeout(() => { toasts.value = toasts.value.filter(note => note.id !== id); }, tone === 'bad' ? 6000 : 3200);
}

// What's new since the last look: briefly highlighted when it arrives.
const fresh = ref(new Set<string>());
function flash(key: string) {
    if (!key) return;
    fresh.value = new Set(fresh.value).add(key);
    setTimeout(() => {
        const next = new Set(fresh.value);
        next.delete(key);
        fresh.value = next;
    }, 4000);
}

function itemClass(item: ShareItem) {
    return {
        selected: selected.value.has(item.key),
        target: dropKey.value === item.key,
        fresh: fresh.value.has(item.key),
        dragged: dragKeys.value.includes(item.key),
        folder: item.type === 'Folder',
    };
}

// ── keeping the listing current ────────────────────────────────────────────

let refreshTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleRefresh(delay = 700) {
    if (refreshTimer) return;
    refreshTimer = setTimeout(async () => {
        refreshTimer = undefined;
        await refresh();
    }, delay);
}

let fetchedAt = Date.now();
watch(data, () => { fetchedAt = Date.now(); });
function onVisibility() {
    // Someone else may have added files while this tab sat in the background.
    if (document.visibilityState === 'visible' && Date.now() - fetchedAt > 30_000 && isFolderShare.value) void refresh();
}

// ── uploads ────────────────────────────────────────────────────────────────

const uploads = createUploadQueue({
    url: (folderId, fileName) => api.value.upload(folderId, fileName),
    onUploaded: job => {
        if (job.folderId === folder.value?.id) flash(keyOf(job.itemId));
        scheduleRefresh();
    },
});
const preparing = ref('');
const filePicker = ref<HTMLInputElement | null>(null);
const folderPicker = ref<HTMLInputElement | null>(null);

function pickFiles() {
    menu.value = null;
    filePicker.value?.click();
}

function pickFolder() {
    menu.value = null;
    folderPicker.value?.click();
}

function onPicked(event: Event) {
    const input = event.target as HTMLInputElement;
    const picked = takeInput(input.files);
    input.value = '';
    void upload(picked, folderKey.value);
}

async function upload(picked: Picked, targetKey: string, rename?: (file: File) => string) {
    const target = index.value?.byKey.get(targetKey);
    if (!target || target.type !== 'Folder' || (!picked.files.length && !picked.dirs.length)) return;
    if (!canWrite.value) {
        toast("This link doesn't allow uploads.", 'bad');
        return;
    }
    const folderIds = new Map<string, string>([['', target.id]]);
    if (picked.dirs.length) {
        preparing.value = `Creating ${plural(picked.dirs.length, 'folder')}…`;
        for (const dir of picked.dirs) {
            const cut = dir.lastIndexOf('/');
            const parentId = folderIds.get(cut < 0 ? '' : dir.slice(0, cut));
            if (!parentId) continue;
            const result = await postShare(api.value.createFolder(parentId, dir.slice(cut + 1)));
            if (!result.ok) {
                toast(`${dir}: ${result.error}`, 'bad');
                continue;
            }
            try {
                const created = JSON.parse(result.body);
                folderIds.set(dir, String(created.ItemID));
                if (cut < 0 && targetKey === folderKey.value) flash(keyOf(created.ItemID));
            } catch { /* its files are skipped below */ }
        }
        preparing.value = '';
        scheduleRefresh(0);
    }
    uploads.add(picked.files.filter(entry => folderIds.has(entry.dir)).map(entry => {
        const fileName = rename ? rename(entry.file) : entry.file.name;
        return { file: entry.file, folderId: folderIds.get(entry.dir)!, fileName, label: entry.dir ? `${entry.dir}/${fileName}` : fileName };
    }));
}

function onPaste(event: ClipboardEvent) {
    if (!canWrite.value || viewer.value || dialogOpen.value || isTyping(event.target)) return;
    const files = Array.from(event.clipboardData?.files ?? []);
    if (!files.length) return;
    event.preventDefault();
    const at = new Date();
    void upload({ files: files.map(file => ({ file, dir: '' })), dirs: [] }, folderKey.value, file => pastedName(file, at));
}

// ── dragging: files in from the desktop, or items onto a folder ────────────

const dropping = ref(false);
const dropKey = ref<string | null>(null);
const dragKeys = ref<string[]>([]);
let dragDepth = 0;

const dropFolderName = computed(() => index.value?.byKey.get(dropKey.value ?? folderKey.value)?.name ?? '');
const carriesFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files');

function folderUnder(event: DragEvent) {
    const key = (event.target as HTMLElement | null)?.closest?.('[data-drop-key]')?.getAttribute('data-drop-key') ?? '';
    return index.value?.byKey.get(key)?.type === 'Folder' ? key : null;
}

function canMoveInto(targetKey: string, keys: string[]) {
    const idx = index.value;
    if (!idx || !idx.byKey.has(targetKey)) return false;
    return keys.some(key => {
        const item = idx.byKey.get(key);
        return !!item && item.key !== targetKey && item.parentKey !== targetKey && !isWithin(idx, targetKey, item.key);
    });
}

function onDragStart(event: DragEvent, item: ShareItem) {
    if (!canWrite.value || !event.dataTransfer) {
        event.preventDefault();
        return;
    }
    const keys = selected.value.has(item.key) ? [...selected.value] : [item.key];
    dragKeys.value = keys;
    menu.value = null;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-klivecloud', keys.join(','));
    if (keys.length > 1) {
        const ghost = document.createElement('div');
        ghost.className = 'ks-drag-ghost';
        ghost.textContent = `${keys.length} items`;
        document.body.appendChild(ghost);
        event.dataTransfer.setDragImage(ghost, 16, 16);
        setTimeout(() => ghost.remove());
    }
}

function onDragEnd() {
    dragKeys.value = [];
    dropKey.value = null;
}

function onWindowDragEnter(event: DragEvent) {
    if (!carriesFiles(event) || dragKeys.value.length) return;
    dragDepth++;
    if (canWrite.value && !viewer.value && !dialogOpen.value) dropping.value = true;
}

function onWindowDragOver(event: DragEvent) {
    const internal = dragKeys.value.length > 0;
    if (!internal && !carriesFiles(event)) return;
    // Always claim the drop, so a file let go over the page never replaces it.
    event.preventDefault();
    const target = folderUnder(event);
    if (internal) {
        const ok = !!target && canMoveInto(target, dragKeys.value);
        dropKey.value = ok ? target : null;
        if (event.dataTransfer) event.dataTransfer.dropEffect = ok ? 'move' : 'none';
        return;
    }
    if (event.dataTransfer) event.dataTransfer.dropEffect = dropping.value ? 'copy' : 'none';
    if (dropping.value) dropKey.value = target;
}

function onWindowDragLeave(event: DragEvent) {
    if (!carriesFiles(event) || dragKeys.value.length) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) {
        dropping.value = false;
        dropKey.value = null;
    }
}

function onWindowDrop(event: DragEvent) {
    const target = folderUnder(event);
    if (dragKeys.value.length) {
        event.preventDefault();
        const keys = dragKeys.value;
        onDragEnd();
        if (target && canMoveInto(target, keys)) void moveItems(keys, target);
        return;
    }
    if (!carriesFiles(event) || !event.dataTransfer) return;
    event.preventDefault();
    const wasDropping = dropping.value;
    dragDepth = 0;
    dropping.value = false;
    dropKey.value = null;
    if (!isFolderShare.value || viewer.value || dialogOpen.value) return;
    if (!wasDropping || !canWrite.value) {
        toast("This link doesn't allow uploads.", 'bad');
        return;
    }
    const read = takeDrop(event.dataTransfer);
    const into = target ?? folderKey.value;
    void read().then(picked => upload(picked, into));
}

// ── new folder, delete, move ───────────────────────────────────────────────

const newFolder = reactive({ open: false, name: '', error: '', busy: false });
const INVALID_NAME = /[\\/:*?"<>|\u0000-\u001f]/;

function askNewFolder() {
    menu.value = null;
    Object.assign(newFolder, { open: true, name: '', error: '', busy: false });
}

async function createFolder() {
    const name = newFolder.name.trim();
    const parent = folder.value;
    if (!name || !parent || newFolder.busy) return;
    if (INVALID_NAME.test(name) || name.includes('..')) {
        newFolder.error = 'A name can\'t contain \\ / : * ? " < > | or "..".';
        return;
    }
    newFolder.busy = true;
    newFolder.error = '';
    const result = await postShare(api.value.createFolder(parent.id, name));
    newFolder.busy = false;
    if (!result.ok) {
        newFolder.error = result.error;
        return;
    }
    newFolder.open = false;
    try { flash(keyOf(JSON.parse(result.body).ItemID)); } catch { /* it still appears */ }
    await refresh();
}

const removal = ref<{ keys: string[]; busy: boolean } | null>(null);
const removalItems = computed(() => (removal.value?.keys ?? []).map(key => index.value?.byKey.get(key)).filter((item): item is ShareItem => !!item));
const removalTitle = computed(() => (removalItems.value.length === 1 ? `Delete “${removalItems.value[0].name}”?` : `Delete ${removalItems.value.length} items?`));
const removalDetail = computed(() => (removalItems.value.some(item => item.type === 'Folder')
    ? 'Folders are deleted with everything in them. This can\'t be undone.'
    : 'This can\'t be undone.'));

function askRemove(keys: string[]) {
    menu.value = null;
    if (canDelete.value && keys.length) removal.value = { keys, busy: false };
}

async function confirmRemoval() {
    const job = removal.value;
    if (!job || job.busy) return;
    job.busy = true;
    const items = outermost(removalItems.value);
    let done = 0;
    let error = '';
    for (const item of items) {
        const result = await postShare(api.value.remove(item.id));
        if (result.ok) done++;
        else error ||= result.error;
    }
    removal.value = null;
    clearSelection();
    await refresh();
    if (error) toast(done ? `Deleted ${done} of ${items.length}. ${error}` : error, 'bad');
    else toast(done === 1 ? `Deleted “${items[0].name}”` : `Deleted ${plural(done, 'item')}`);
}

const moving = ref<{ keys: string[]; busy: boolean } | null>(null);

function askMove(keys: string[]) {
    menu.value = null;
    if (canWrite.value && keys.length) moving.value = { keys, busy: false };
}

async function moveTo(targetKey: string) {
    const job = moving.value;
    if (!job || job.busy) return;
    job.busy = true;
    await moveItems(job.keys, targetKey);
    moving.value = null;
}

async function moveItems(keys: string[], targetKey: string) {
    const idx = index.value;
    const target = idx?.byKey.get(targetKey);
    if (!idx || !target) return;
    const items = outermost(keys.map(key => idx.byKey.get(key)).filter((item): item is ShareItem => !!item))
        .filter(item => item.key !== targetKey && item.parentKey !== targetKey && !isWithin(idx, targetKey, item.key));
    if (!items.length) return;
    let done = 0;
    let error = '';
    for (const item of items) {
        const result = await postShare(api.value.move(item.id, target.id));
        if (result.ok) done++;
        else error ||= result.error;
    }
    clearSelection();
    await refresh();
    if (error) toast(done ? `Moved ${done} of ${items.length}. ${error}` : error, 'bad');
    else toast(done === 1 ? `Moved “${items[0].name}” to ${target.name}` : `Moved ${plural(done, 'item')} to ${target.name}`);
}

// ── keyboard ───────────────────────────────────────────────────────────────

const searchInput = ref<HTMLInputElement | null>(null);
const dialogOpen = computed(() => newFolder.open || !!removal.value || !!moving.value);

function isTyping(target: EventTarget | null) {
    const el = target as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

function clearSearch() {
    query.value = '';
    searchInput.value?.blur();
}

function onKey(event: KeyboardEvent) {
    if (viewer.value || dialogOpen.value || event.defaultPrevented || !isFolderShare.value) return;
    const typing = isTyping(event.target) && (event.target as HTMLInputElement).type !== 'checkbox';
    if (event.key === 'Escape') {
        if (menu.value) menu.value = null;
        else if (!typing && selectedCount.value) clearSelection();
        return;
    }
    if (typing) return;
    const mod = event.ctrlKey || event.metaKey;
    if (event.key === '/' && !mod) {
        event.preventDefault();
        searchInput.value?.focus();
    } else if (mod && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        selectAll();
    } else if (event.key === 'Delete' && canDelete.value && selectedCount.value) {
        event.preventDefault();
        askRemove(selectedKeys.value);
    } else if ((event.key === 'Backspace' || (event.altKey && event.key === 'ArrowUp')) && !searching.value && folder.value && folder.value !== root.value) {
        event.preventDefault();
        openFolder(folder.value.parentKey);
    }
}

// ── page furniture ─────────────────────────────────────────────────────────

const head = ref<HTMLElement | null>(null);
// Measured once mounted; this is the desktop header, so the server render rarely shifts.
const headHeight = ref(117);
const moreEl = ref<HTMLElement | null>(null);
let headObserver: ResizeObserver | null = null;
let moreObserver: IntersectionObserver | null = null;
let clock: ReturnType<typeof setInterval> | undefined;

watch(moreEl, el => {
    moreObserver?.disconnect();
    if (!el) return;
    moreObserver = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) limit.value += PAGE_SIZE;
    }, { rootMargin: '600px' });
    moreObserver.observe(el);
});

onMounted(() => {
    now.value = Date.now();
    clock = setInterval(() => { now.value = Date.now(); }, 30_000);
    loadPrefs();
    if (head.value) {
        headObserver = new ResizeObserver(() => { headHeight.value = head.value?.offsetHeight ?? headHeight.value; });
        headObserver.observe(head.value);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    window.addEventListener('dragenter', onWindowDragEnter);
    window.addEventListener('dragover', onWindowDragOver);
    window.addEventListener('dragleave', onWindowDragLeave);
    window.addEventListener('drop', onWindowDrop);
    document.addEventListener('visibilitychange', onVisibility);
});

onBeforeUnmount(() => {
    clearInterval(clock);
    clearTimeout(refreshTimer);
    clearTimeout(copiedTimer);
    headObserver?.disconnect();
    moreObserver?.disconnect();
    uploads.cancelAll();
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('paste', onPaste);
    window.removeEventListener('dragenter', onWindowDragEnter);
    window.removeEventListener('dragover', onWindowDragOver);
    window.removeEventListener('dragleave', onWindowDragLeave);
    window.removeEventListener('drop', onWindowDrop);
    document.removeEventListener('visibilitychange', onVisibility);
});

// ── link previews (Discord, iMessage, …) ───────────────────────────────────

/** A photo to stand for a folder: the first one at the top, or failing that anywhere inside. */
const cover = computed(() => {
    const idx = index.value;
    if (!idx || idx.root.type !== 'Folder') return null;
    const usable = (item: ShareItem) => item.kind === 'image' && hasThumbnail(item);
    const top = sortItems(idx.childrenOf.get(idx.root.key) ?? [], 'name', 1).find(usable);
    if (top) return top;
    for (const item of idx.byKey.values()) if (usable(item)) return item;
    return null;
});

useHead(() => {
    const idx = index.value;
    const deep = idx?.byKey.get(fileParam.value) ?? idx?.byKey.get(folderParam.value);
    const item = deep ?? idx?.root ?? null;
    const title = item?.name ?? 'Shared link';
    let description = 'Shared with KliveCloud';
    if (item?.type === 'File') description = `${describeItem(item)} · ${formatBytes(item.bytes)}`;
    else if (item) description = `Folder · ${plural(item.files, 'file')} · ${formatBytes(item.bytes)}`;

    const meta: Record<string, string>[] = [
        { key: 'description', name: 'description', content: description },
        { key: 'og-site-name', property: 'og:site_name', content: 'KliveCloud' },
        { key: 'og-title', property: 'og:title', content: title },
        { key: 'og-description', property: 'og:description', content: description },
        { key: 'og-url', property: 'og:url', content: linkFor(item) },
        { key: 'twitter-title', name: 'twitter:title', content: title },
        { key: 'twitter-description', name: 'twitter:description', content: description },
        { key: 'theme-color', name: 'theme-color', content: '#6ddc4f' },
    ];

    const visual = item?.type === 'File' && (item.kind === 'image' || item.kind === 'video') ? item : cover.value;
    if (visual) {
        const image = api.value.preview(visual, 1280, 720);
        meta.push(
            { key: 'og-image', property: 'og:image', content: image },
            { key: 'og-image-secure', property: 'og:image:secure_url', content: image },
            { key: 'og-image-type', property: 'og:image:type', content: 'image/jpeg' },
            { key: 'twitter-image', name: 'twitter:image', content: image },
        );
    }

    // Only a video shared on its own: its playable copy is prepared as soon as the link is
    // opened, so a link preview can play it. A video inside a folder gets its picture.
    if (item?.type === 'File' && item.kind === 'video' && item === idx?.root) {
        const video = api.value.playable(item);
        meta.push(
            { key: 'og-type', property: 'og:type', content: 'video.other' },
            { key: 'og-video', property: 'og:video', content: video },
            { key: 'og-video-url', property: 'og:video:url', content: video },
            { key: 'og-video-secure', property: 'og:video:secure_url', content: video },
            { key: 'og-video-type', property: 'og:video:type', content: 'video/mp4' },
            { key: 'og-video-width', property: 'og:video:width', content: '1280' },
            { key: 'og-video-height', property: 'og:video:height', content: '720' },
            { key: 'twitter-card', name: 'twitter:card', content: 'player' },
            { key: 'twitter-player', name: 'twitter:player', content: video },
            { key: 'twitter-player-stream', name: 'twitter:player:stream', content: video },
            { key: 'twitter-player-stream-type', name: 'twitter:player:stream:content_type', content: 'video/mp4' },
            { key: 'twitter-player-width', name: 'twitter:player:width', content: '1280' },
            { key: 'twitter-player-height', name: 'twitter:player:height', content: '720' },
        );
    } else {
        meta.push(
            { key: 'og-type', property: 'og:type', content: 'website' },
            { key: 'twitter-card', name: 'twitter:card', content: visual ? 'summary_large_image' : 'summary' },
        );
    }

    return {
        title: `${title} · KliveCloud`,
        link: [
            { key: 'canonical', rel: 'canonical', href: linkFor(item) },
            // The OS type ramp is set in Inter; the rest of the site only loads Roboto.
            { key: 'gfonts-pre', rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
            { key: 'inter', rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap' },
        ],
        bodyAttrs: { class: 'ks-body' },
        meta,
    };
});
</script>

<style>
/* The site gives every <button> padding, a 2px border, a white glow on hover and a white fill
   while pressed. Buttons here carry their own chrome. `html :where(.ks)` puts these resets one
   element above the global rules, whatever order the stylesheets load in, and still below any
   class, so every styled button keeps its own look. */
html :where(.ks) button {
    padding: 0;
    border: 0;
    background: none;
    justify-content: center;
    user-select: none;
    transition: background-color var(--ot-fast), color var(--ot-fast), border-color var(--ot-fast), opacity var(--ot-fast);
}
html :where(.ks) button:hover { box-shadow: none; background-color: transparent; }
html :where(.ks) button:active { background-color: transparent; }

body.ks-body { background: var(--ot-bg); }

.ks-drag-ghost {
    position: fixed;
    top: -100px;
    left: -100px;
    padding: 6px 12px;
    border-radius: 999px;
    background: #6ddc4f;
    color: #08140b;
    font: 600 13px/18px Inter, Roboto, sans-serif;
}
</style>

<style scoped>
.ks {
    --ks-pad: 20px;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--ot-bg);
    color-scheme: dark;
}
.ks-frame { width: 100%; max-width: 1320px; margin: 0 auto; padding-left: var(--ks-pad); padding-right: var(--ks-pad); }
.ks-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.ks-hidden { display: none; }
.ks-spacer { flex: 1 1 auto; }

/* ── header ── */
.ks-head {
    position: sticky;
    top: 0;
    z-index: 40;
    background: rgba(11, 13, 10, 0.9);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--ot-line);
}
.ks-top { display: flex; align-items: center; gap: 14px; min-height: 64px; }
.ks-brand { display: inline-flex; align-items: center; gap: 7px; flex: 0 0 auto; font-size: 14px; }
.ks-brand :deep(svg) { color: var(--ot-accent); }
.ks-brand b { font-weight: 680; letter-spacing: 0.1px; }
.ks-divider { width: 1px; height: 26px; background: var(--ot-line-strong); flex: 0 0 auto; }
.ks-title { display: flex; align-items: center; gap: 11px; min-width: 0; flex: 1 1 auto; }
.ks-title-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.ks-title h1 { margin: 0; font-size: 15.5px; line-height: 20px; font-weight: 640; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ks-meta { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 12.5px; color: var(--ot-muted); white-space: nowrap; }
.ks-summary { overflow: hidden; text-overflow: ellipsis; }
.ks-meta .ot-chip { flex: 0 0 auto; padding: 0 7px; height: 20px; font-size: 11px; }
.ks-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
.ks-actions .ot-btn { height: 34px; }

.ks-tools { display: flex; align-items: center; gap: 8px; min-height: 52px; padding-bottom: 2px; }
.ks-tools.selecting { gap: 10px; }

/* The site styles every <nav> as its top bar. */
.ks-crumbs { display: flex; align-items: center; gap: 2px; min-width: 0; flex: 1 1 auto; overflow-x: auto; scrollbar-width: none; background: none; border: 0; }
.ks-crumbs::-webkit-scrollbar { display: none; }
.ks-crumb {
    flex: 0 0 auto;
    max-width: 220px;
    height: 30px;
    padding: 0 8px;
    border-radius: var(--ot-radius-sm);
    font-size: 13.5px;
    font-weight: 560;
    color: var(--ot-text-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    line-height: 30px;
}
button.ks-crumb:hover, button.ks-crumb:active { color: var(--ot-text); background: var(--ot-surface-3); }
.ks-crumb.current { color: var(--ot-text); font-weight: 620; cursor: default; max-width: none; flex: 0 1 auto; }
.ks-crumb.target { color: var(--ot-text); background: var(--ot-accent-soft); box-shadow: inset 0 0 0 1px var(--ot-accent); }
.ks-crumb-sep { color: var(--ot-disabled); flex: 0 0 auto; }

.ks-search {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    width: 260px;
    height: 34px;
    padding: 0 8px 0 10px;
    border-radius: var(--ot-radius-sm);
    border: 1px solid var(--ot-line);
    background: rgba(0, 0, 0, 0.28);
    color: var(--ot-muted);
    transition: border-color var(--ot-fast), background var(--ot-fast);
}
.ks-search:hover { border-color: var(--ot-line-strong); }
.ks-search:focus-within { border-color: var(--ot-accent); background: rgba(0, 0, 0, 0.4); }
.ks-search input {
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
    border: 0;
    outline: none;
    background: none;
    color: var(--ot-text);
    font-size: 13px;
}
.ks-search input::placeholder { color: var(--ot-muted); }
.ks-search input::-webkit-search-cancel-button { display: none; }
.ks-kbd {
    flex: 0 0 auto;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 4px;
    border: 1px solid var(--ot-line-strong);
    font-family: var(--ot-mono);
    font-size: 11px;
    line-height: 16px;
    text-align: center;
    color: var(--ot-muted);
}
.ks-search-clear { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 4px; color: var(--ot-muted); cursor: pointer; }
.ks-search-clear:hover { color: var(--ot-text); background: var(--ot-surface-3); }

.ks-sortpick { height: 34px; font-size: 12.5px; }
.ks-views button { height: 32px; width: 36px; padding: 0; justify-content: center; }
.ks-tools .ot-btn { height: 34px; }
.ks-tools .ot-btn.sm { height: 30px; }

.ks-split { display: inline-flex; }
.ks-split > .ot-btn:first-child { border-top-right-radius: 0; border-bottom-right-radius: 0; }
.ks-split-more { width: 30px; padding: 0; border-top-left-radius: 0; border-bottom-left-radius: 0; border-left-width: 0; }

.ks-selected { font-size: 13px; color: var(--ot-text-2); white-space: nowrap; }
.ks-selected b { color: var(--ot-text); font-weight: 620; }
.ks-textbtn {
    height: 28px;
    padding: 0 8px;
    border-radius: var(--ot-radius-sm);
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ot-accent);
    cursor: pointer;
    white-space: nowrap;
}
.ks-textbtn:hover, .ks-textbtn:active { background: var(--ot-accent-soft); }

/* ── shared bits ── */
.ks-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    flex: 0 0 auto;
    border-radius: var(--ot-radius-sm);
    color: var(--ot-text-2);
    cursor: pointer;
}
.ks-icon:hover, .ks-icon:active, .ks-icon[aria-expanded='true'] { color: var(--ot-text); background: var(--ot-surface-3); }

.ks-pop { position: relative; display: inline-flex; }
.ks-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 60;
    min-width: 196px;
    padding: 4px;
    display: flex;
    flex-direction: column;
    border-radius: var(--ot-radius);
    border: 1px solid var(--ot-line-strong);
    background: var(--ot-surface-2);
    box-shadow: 0 16px 44px rgba(0, 0, 0, 0.55);
    animation: ks-pop var(--ot-fast) ease-out;
}
@keyframes ks-pop { from { opacity: 0; transform: translateY(-3px); } }
.ks-menu > button, .ks-menu > a {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    width: 100%;
    height: 32px;
    padding: 0 10px;
    border-radius: var(--ot-radius-sm);
    font-size: 13px;
    color: var(--ot-text);
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
}
.ks-menu > button :deep(svg), .ks-menu > a :deep(svg) { color: var(--ot-text-2); }
.ks-menu > button:hover, .ks-menu > a:hover, .ks-menu > button:active { background: var(--ot-surface-3); }
.ks-menu > .danger, .ks-menu > .danger :deep(svg) { color: var(--ot-negative); }
.ks-menu > .danger:hover { background: var(--ot-negative-soft); }
.ks-backdrop { position: fixed; inset: 0; z-index: 50; }

.ks-check {
    appearance: none;
    flex: 0 0 auto;
    display: inline-grid;
    place-content: center;
    width: 17px;
    height: 17px;
    margin: 0;
    border-radius: 5px;
    border: 1.5px solid var(--ot-disabled);
    background: transparent;
    cursor: pointer;
    transition: background var(--ot-fast), border-color var(--ot-fast), opacity var(--ot-fast);
}
.ks-check:hover { border-color: var(--ot-text-2); }
.ks-check:checked, .ks-check:indeterminate { background: var(--ot-accent); border-color: var(--ot-accent); }
.ks-check:checked::after {
    content: '';
    width: 9px;
    height: 5px;
    border-left: 2px solid var(--ot-on-accent);
    border-bottom: 2px solid var(--ot-on-accent);
    transform: translateY(-1px) rotate(-45deg);
}
.ks-check:indeterminate::after { content: ''; width: 8px; height: 2px; border-radius: 1px; background: var(--ot-on-accent); }

/* ── main ── */
.ks-main { flex: 1 1 auto; padding-top: 14px; padding-bottom: 72px; }
/* One file: the page is exactly the screen and the preview takes what the header leaves. */
.ks.solo { height: 100vh; height: 100dvh; }
.ks-main.solo { display: flex; flex-direction: column; min-height: 0; padding-bottom: 12px; }
.ks-folder { position: relative; }

.ks-loading { display: flex; flex-direction: column; gap: 4px; padding-top: 8px; }
.ks-skel { display: flex; align-items: center; gap: 14px; height: 46px; padding: 0 12px; }
.ks-skel .ot-skel:first-child { width: 30px; height: 30px; border-radius: 7px; flex: 0 0 auto; }
.ks-skel .ot-skel:last-child { width: min(340px, 60%); }

.ks-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    max-width: 420px;
    margin: 12vh auto 0;
    text-align: center;
}
.ks-state-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    height: 52px;
    margin-bottom: 6px;
    border-radius: 16px;
    color: var(--ot-text-2);
    background: var(--ot-surface-2);
    border: 1px solid var(--ot-line);
}
.ks-state-icon.bad { color: var(--ot-warning); }
.ks-state h2 { margin: 0; font-size: 19px; font-weight: 640; }
.ks-state p { margin: 0 0 8px; font-size: 13.5px; color: var(--ot-text-2); }

.ks-single { flex: 1 1 auto; min-height: 320px; display: flex; }

/* ── list ── */
.ks-list { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; font-size: 13.5px; }
.ks-list th.ks-c-check { width: 42px; }
.ks-list th.ks-c-kind { width: 168px; }
.ks-list th.ks-c-size { width: 96px; }
.ks-list th.ks-c-date { width: 168px; }
.ks-list th.ks-c-act { width: 112px; }
.ks-list th {
    position: sticky;
    top: var(--ks-head);
    z-index: 5;
    height: 38px;
    padding: 0 10px;
    background: var(--ot-bg);
    border-bottom: 1px solid var(--ot-line);
    text-align: left;
    font-weight: 600;
}
.ks-list th.ks-c-check, .ks-list td.ks-c-check { padding: 0 0 0 12px; }
.ks-sort {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 26px;
    margin-left: -6px;
    padding: 0 6px;
    border-radius: var(--ot-radius-sm);
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ot-muted);
    cursor: pointer;
    white-space: nowrap;
}
.ks-sort:hover, .ks-sort:active { color: var(--ot-text); background: var(--ot-surface-3); }
.ks-sort.on { color: var(--ot-text); }
.ks-sort.on :deep(svg) { color: var(--ot-accent); }
th.ks-c-size .ks-sort { margin-left: 0; margin-right: -6px; }
.ks-list .ks-c-size { text-align: right; }

.ks-row { cursor: pointer; }
.ks-row td {
    height: 50px;
    padding: 0 10px;
    border-bottom: 1px solid rgba(146, 196, 130, 0.07);
    vertical-align: middle;
    color: var(--ot-text-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.ks-row td.ks-c-name, .ks-row td.ks-c-act { overflow: visible; }
.ks-row:hover td { background: rgba(255, 255, 255, 0.025); }
.ks-row.selected td { background: var(--ot-accent-soft); }
.ks-row.selected td:first-child { box-shadow: inset 2px 0 0 var(--ot-accent); }
.ks-row.target td { background: var(--ot-accent-soft); box-shadow: inset 0 1px 0 var(--ot-accent), inset 0 -1px 0 var(--ot-accent); }
.ks-row.dragged { opacity: 0.45; }
.ks-row.fresh td { animation: ks-fresh 1.8s ease-out; }
@keyframes ks-fresh { 0%, 25% { background: rgba(109, 220, 79, 0.09); } }
.ks-c-size, .ks-c-date { font-variant-numeric: tabular-nums; }

.ks-name { display: flex; align-items: center; gap: 12px; min-width: 0; }
.ks-thumb { width: 30px; height: 30px; border-radius: 7px; }
.ks-name-text { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
.ks-open {
    display: block;
    max-width: 100%;
    padding: 0;
    font-size: 13.5px;
    font-weight: 520;
    color: var(--ot-text);
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    border-radius: 3px;
}
.ks-open.folder { font-weight: 600; }
/* Under the name: where a search result lives; on a phone, also its size and date. */
.ks-sub { display: none; gap: 8px; min-width: 0; font-size: 12px; color: var(--ot-muted); white-space: nowrap; }
.ks-sub-meta { display: none; overflow: hidden; text-overflow: ellipsis; }
.ks-list.searching .ks-sub { display: flex; }
.ks-where { padding: 0; font-size: 12px; color: var(--ot-text-2); cursor: pointer; max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ks-where:hover { color: var(--ot-accent); text-decoration: underline; }

.ks-acts { display: flex; align-items: center; justify-content: flex-end; gap: 2px; }
@media (hover: hover) {
    .ks-row .ks-acts { opacity: 0; }
    .ks-row:hover .ks-acts, .ks-row:focus-within .ks-acts, .ks-acts:has([aria-expanded='true']) { opacity: 1; }
    .ks-list:not(.selecting) .ks-row:not(:hover):not(.selected) .ks-check:not(:focus-visible) { opacity: 0.55; }
}

/* ── grid ── */
.ks-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(176px, 1fr)); gap: 14px; padding-top: 4px; }
.ks-tile {
    position: relative;
    display: flex;
    flex-direction: column;
    border-radius: var(--ot-radius);
    border: 1px solid var(--ot-line);
    background: var(--ot-surface);
    cursor: pointer;
    transition: border-color var(--ot-fast), background var(--ot-fast), opacity var(--ot-fast);
}
.ks-tile:hover { border-color: var(--ot-line-strong); background: var(--ot-surface-2); }
.ks-tile.selected { border-color: var(--ot-accent); background: var(--ot-accent-soft); box-shadow: 0 0 0 1px var(--ot-accent); }
.ks-tile.target { border-color: var(--ot-accent); box-shadow: 0 0 0 2px var(--ot-accent); }
.ks-tile.dragged { opacity: 0.45; }
.ks-tile.fresh { animation: ks-tile-fresh 2.6s ease-out; }
@keyframes ks-tile-fresh { 0%, 30% { box-shadow: 0 0 0 2px rgba(109, 220, 79, 0.6); } }
.ks-tile-media {
    aspect-ratio: 4 / 3;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: calc(var(--ot-radius) - 1px) calc(var(--ot-radius) - 1px) 0 0;
    background: rgba(0, 0, 0, 0.24);
    overflow: hidden;
}
.ks-tile-thumb { width: 100%; height: 100%; }
.ks-tile-info { display: flex; flex-direction: column; gap: 1px; padding: 8px 10px 10px; min-width: 0; }
.ks-tile .ks-open { font-size: 13px; }
.ks-tile-meta { font-size: 11.5px; color: var(--ot-muted); font-variant-numeric: tabular-nums; }
.ks-tile-check { position: absolute; top: 8px; left: 8px; background: rgba(8, 10, 7, 0.6); border-color: rgba(233, 241, 229, 0.7); }
.ks-tile-more { position: absolute; top: 6px; right: 6px; }
.ks-tile-more > .ks-icon { background: rgba(8, 10, 7, 0.6); color: var(--ot-text); }
.ks-tile-more > .ks-icon:hover { background: rgba(8, 10, 7, 0.85); }
@media (hover: hover) {
    .ks-tile .ks-tile-check, .ks-tile .ks-tile-more { opacity: 0; transition: opacity var(--ot-fast); }
    .ks-tile:hover .ks-tile-check, .ks-tile:hover .ks-tile-more, .ks-tile:focus-within .ks-tile-check, .ks-tile:focus-within .ks-tile-more,
    .ks-tile.selected .ks-tile-check, .ks-grid.selecting .ks-tile-check, .ks-tile-more:has([aria-expanded='true']) { opacity: 1; }
}

.ks-more-rows { padding: 16px 12px; }
.ks-more-rows .ot-skel { display: block; width: 200px; }
.ks-foot { margin: 14px 0 0; padding: 0 12px; font-size: 12px; color: var(--ot-muted); font-variant-numeric: tabular-nums; }

/* ── empty ── */
.ks-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    margin-top: 12px;
    padding: 56px 24px;
    border-radius: var(--ot-radius-lg);
    text-align: center;
    font-size: 13.5px;
    color: var(--ot-text-2);
}
.ks-empty.droppable { border: 1.5px dashed var(--ot-line-strong); background: rgba(109, 220, 79, 0.025); }
.ks-empty strong { font-size: 15px; font-weight: 620; color: var(--ot-text); }
.ks-empty-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    margin-bottom: 6px;
    border-radius: 14px;
    color: var(--ot-text-2);
    background: var(--ot-surface-2);
    border: 1px solid var(--ot-line);
}
.ks-empty .ot-btn.sm { margin-top: 6px; }
.ks-empty-actions { display: flex; gap: 8px; margin-top: 8px; }

/* ── drop target, toasts, dialogs ── */
.ks-drop {
    position: fixed;
    inset: var(--ks-head) 0 0 0;
    z-index: 30;
    pointer-events: none;
    border: 2px dashed var(--ot-accent);
    border-radius: var(--ot-radius-lg);
    margin: 10px;
    background: rgba(109, 220, 79, 0.05);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: 28px;
    animation: ks-pop var(--ot-fast) ease-out;
}
.ks-drop-card {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-radius: 999px;
    background: var(--ot-accent);
    color: var(--ot-on-accent);
    font-size: 13.5px;
    font-weight: 560;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
}
.ks-drop-card b { font-weight: 700; }

.ks-toasts {
    position: fixed;
    left: 50%;
    bottom: 24px;
    z-index: 300;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    pointer-events: none;
}
/* Clear of the upload tray in the bottom-right corner. */
.ks-toasts.raised { left: 24px; transform: none; align-items: flex-start; }
.ks-toast {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    max-width: min(520px, calc(100vw - 32px));
    padding: 9px 14px;
    border-radius: 999px;
    border: 1px solid var(--ot-line-strong);
    background: var(--ot-surface-2);
    box-shadow: 0 12px 34px rgba(0, 0, 0, 0.5);
    font-size: 13px;
}
.ks-toast :deep(svg) { color: var(--ot-positive); }
.ks-toast.bad { border-color: rgba(255, 123, 123, 0.5); }
.ks-toast.bad :deep(svg) { color: var(--ot-negative); }
.ks-toast-enter-active, .ks-toast-leave-active { transition: opacity var(--ot-normal), transform var(--ot-normal); }
.ks-toast-enter-from, .ks-toast-leave-to { opacity: 0; transform: translateY(8px); }

.ks-form { display: flex; flex-direction: column; gap: 8px; }
.ks-form .ot-input { height: 38px; font-size: 14px; }
.ks-form-error { margin: 0; font-size: 12.5px; color: var(--ot-negative); }
.ks-confirm { margin: 0; font-size: 13.5px; color: var(--ot-text-2); }
.ks-confirm-list { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.ks-confirm-list li { display: flex; align-items: center; gap: 10px; font-size: 13px; min-width: 0; }
.ks-confirm-list li span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ks-confirm-list li.more { padding-left: 32px; color: var(--ot-muted); }

/* ── smaller screens ── */
@media (max-width: 1080px) {
    .ks-c-kind { display: none; }
    .ks-search { width: 210px; }
}
@media (max-width: 860px) {
    .ks-newfolder { display: none; }
}
@media (max-width: 720px) {
    .ks { --ks-pad: 12px; }
    .ks-brand, .ks-divider, .ks-wide { display: none; }
    .ks-top { min-height: 58px; gap: 10px; }
    .ks-actions { gap: 6px; }
    .ks-actions .ot-btn { width: 36px; padding: 0; }
    .ks-tools { flex-wrap: wrap; row-gap: 0; column-gap: 6px; padding-bottom: 8px; }
    .ks-tools:not(.selecting) .ks-crumbs { flex: 1 1 100%; height: 40px; }
    .ks-search { flex: 1 1 120px; width: auto; min-width: 0; }
    .ks-search input { width: 100%; }
    .ks-kbd { display: none; }
    /* The summary matters more than the chips: let them drop to a second line. */
    .ks-meta { flex-wrap: wrap; row-gap: 3px; }
    .ks-mode { display: none; }
    .ks-tools .ot-btn.sm { width: 34px; padding: 0; }
    .ks-split > .ot-btn:first-child { width: 36px; padding: 0; }
    .ks-c-date, .ks-c-size { display: none; }
    .ks-list th.ks-c-act { width: 44px; }
    .ks-list .ks-quick { display: none; }
    .ks-sub { display: flex; }
    .ks-sub-meta { display: block; }
    .ks-row td { height: 58px; }
    .ks-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
    .ks-toasts, .ks-toasts.raised { left: 50%; transform: translateX(-50%); align-items: center; bottom: auto; top: calc(var(--ks-head) + 10px); }
}
@media (max-width: 420px) {
    .ks-sortpick { display: none; }
}
</style>
