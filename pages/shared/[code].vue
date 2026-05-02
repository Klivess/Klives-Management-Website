<template>
  <div class="shared-shell" @dragover.prevent="onDragOver" @dragleave="onDragLeave" @drop.prevent="onFileDrop">
    <div class="shared-background"></div>

    <section v-if="loading" class="state-panel">
      <div class="loading-mark"></div>
      <h2>Loading shared item</h2>
      <p>Fetching the latest details from KliveCloud.</p>
    </section>

    <section v-else-if="error" class="state-panel">
      <div class="state-icon">!</div>
      <h2>{{ error }}</h2>
      <p>The share link may be invalid, expired, or no longer attached to an item.</p>
    </section>

    <section v-else-if="sharedItem && rootItem" class="share-console">
      <header class="topbar">
        <div class="topbar-left">
          <p class="eyebrow">KliveCloud / Shared {{ isFolder ? 'folder' : 'file' }}</p>

          <nav v-if="isFolder" class="breadcrumbs" aria-label="Folder breadcrumbs">
            <template v-for="(crumb, index) in folderPath" :key="crumb.ItemID">
              <button class="crumb" :class="{ active: index === folderPath.length - 1 }" @click="openFolder(crumb.ItemID)">{{ crumb.Name }}</button>
              <span v-if="index < folderPath.length - 1" class="crumb-sep">/</span>
            </template>
          </nav>
          <h1 v-else class="file-title">{{ rootItem.Name }}</h1>

          <div class="topbar-meta">
            <span class="badge" :class="`badge-${sharePermissionMode.toLowerCase()}`">{{ permissionLabel }}</span>
            <span v-if="isFolder">{{ countNestedItems(activeFolderId || rootFolderId) }}</span>
            <span v-if="!isFolder">{{ formatSize(rootItem.FileSizeBytes) }}</span>
            <span v-if="sharedItem.ExpirationDate" class="badge badge-warn">Expires {{ formatDate(sharedItem.ExpirationDate) }}</span>
          </div>
        </div>

        <div class="topbar-right">
          <button class="btn btn-ghost" @click="copyCurrentLink">Copy link</button>
          <button v-if="canWrite && isFolder" class="btn btn-ghost" @click="createSharedFolder" :disabled="isMutating">New folder</button>
          <button v-if="canWrite && isFolder" class="btn btn-primary" @click="triggerSharedUpload" :disabled="isMutating">Upload</button>
          <a v-if="!isFolder" class="btn btn-primary" :href="getSharedDownloadUrl()">Download</a>
        </div>
      </header>

      <div v-if="mutationError" class="inline-error">{{ mutationError }}</div>

      <input ref="uploadInput" class="hidden-input" type="file" multiple @change="handleSharedUpload" />

      <div v-if="!isFolder" class="single-file-layout">
        <div class="viewer-panel">
          <img v-if="rootItem.IsImage" class="media-preview" :src="getSharedDownloadUrl()" :alt="rootItem.Name" />
          <video v-else-if="rootItem.IsVideo" controls class="media-preview" :src="getSharedStreamUrl()"></video>
          <div v-else class="document-preview">
            <div class="doc-glyph">{{ getIcon(rootItem.Name) }}</div>
            <p>Preview not available. Download to open this file.</p>
          </div>
        </div>

        <aside class="details-panel">
          <h2>{{ rootItem.Name }}</h2>
          <div class="detail-stack">
            <div><span>Size</span><strong>{{ formatSize(rootItem.FileSizeBytes) }}</strong></div>
            <div><span>Created</span><strong>{{ formatDateTime(rootItem.CreatedDate) }}</strong></div>
            <div><span>Modified</span><strong>{{ formatDateTime(rootItem.ModifiedDate) }}</strong></div>
          </div>
        </aside>
      </div>

      <div v-else class="folder-workspace">
        <div
          ref="gridContainer"
          class="file-grid-area"
          :class="{ 'drop-active': isDropActive, 'marquee-active': isMarqueeing }"
          @mousedown="onGridMouseDown"
        >
          <div v-if="visibleItems.length === 0 && !sameId(activeFolderId, rootFolderId)" class="empty-state">
            <div class="empty-glyph">[ ]</div>
            <p>This folder is empty.</p>
          </div>
          <div v-else-if="visibleItems.length === 0" class="empty-state">
            <div class="empty-glyph">[ ]</div>
            <p>{{ canWrite ? 'Drop files here or use Upload to add content.' : 'This shared folder is empty.' }}</p>
          </div>

          <div v-else class="file-grid">
            <button
              v-if="!sameId(activeFolderId, rootFolderId)"
              class="tile tile-back"
              @click="openFolder(parentFolderId)"
            >
              <div class="tile-thumb thumb-folder"><div class="thumb-glyph">..</div></div>
              <div class="tile-body">
                <div class="tile-name">Up one level</div>
                <div class="tile-meta">Back</div>
              </div>
            </button>

            <button
              v-for="item in visibleItems"
              :key="item.ItemID"
              :data-item-id="item.ItemID"
              class="tile"
              :class="{
                'tile-folder': item.ItemType === 'Folder',
                'tile-file': item.ItemType === 'File',
                selected: isSelected(item.ItemID),
                primary: sameId(primarySelectedId, item.ItemID)
              }"
              @click="onTileClick($event, item)"
              @dblclick="onTileDoubleClick(item)"
            >
              <div class="tile-thumb" :class="item.ItemType === 'Folder' ? 'thumb-folder' : `thumb-file thumb-kind-${getCloudItemIcon(item).toLowerCase()}`">
                <img
                  v-if="hasThumbnail(item)"
                  :src="getSharedPreviewUrl(item.ItemID)"
                  loading="lazy"
                  :alt="item.Name"
                  @error="markThumbnailFailed(item.ItemID)"
                />
                <div v-else class="thumb-glyph">{{ getCloudItemIcon(item) }}</div>
                <span v-if="item.ItemType === 'File' && item.IsVideo" class="thumb-tag">VIDEO</span>
                <span v-else-if="item.ItemType === 'File' && item.IsImage" class="thumb-tag">IMAGE</span>
              </div>
              <div class="tile-body">
                <div class="tile-name">{{ item.Name }}</div>
                <div class="tile-meta">
                  <span v-if="item.ItemType === 'File'">{{ formatSize(item.FileSizeBytes) }}</span>
                  <span v-else>Folder</span>
                  <span class="meta-sep">·</span>
                  <span>{{ formatDate(item.ModifiedDate) }}</span>
                </div>
              </div>

              <div class="tile-actions" @click.stop>
                <a
                  v-if="item.ItemType === 'File'"
                  class="icon-btn"
                  :href="getSharedDownloadUrl(item.ItemID)"
                  :download="item.Name"
                  title="Download"
                >DL</a>
                <button
                  v-if="canDelete"
                  class="icon-btn icon-btn-danger"
                  @click.stop="deleteSharedItem(item)"
                  :disabled="isMutating"
                  title="Delete"
                >X</button>
              </div>
            </button>
          </div>

          <div v-if="isDropActive" class="drop-overlay">
            <div class="drop-card">
              <div class="drop-icon">+</div>
              <h3>Drop to upload</h3>
              <p>Files will be added to this folder.</p>
            </div>
          </div>

          <div v-if="marqueeRect" class="marquee" :style="{ left: marqueeRect.left + 'px', top: marqueeRect.top + 'px', width: marqueeRect.width + 'px', height: marqueeRect.height + 'px' }"></div>
        </div>

        <aside class="preview-panel">
          <div v-if="selectionCount === 0" class="preview-empty">
            <p class="preview-help">Select a file to preview it.</p>
          </div>

          <div v-else-if="selectionCount > 1" class="preview-multi">
            <h2>{{ selectionCount }} items selected</h2>
            <div class="detail-stack compact">
              <div><span>Total file size</span><strong>{{ formatSize(selectedSizeBytes) }}</strong></div>
            </div>
            <div class="preview-actions">
              <button class="btn btn-ghost" @click="downloadSelected">Download files</button>
              <button v-if="canDelete" class="btn btn-danger" @click="deleteSelected" :disabled="isMutating">Delete selected</button>
              <button class="btn btn-ghost" @click="clearSelection">Clear selection</button>
            </div>
          </div>

          <div v-else-if="primarySelected" class="preview-single">
            <h2>{{ primarySelected.Name }}</h2>
            <div class="preview-media">
              <img v-if="primarySelected.ItemType === 'File' && primarySelected.IsImage" :src="getSharedDownloadUrl(primarySelected.ItemID)" :alt="primarySelected.Name" />
              <video v-else-if="primarySelected.ItemType === 'File' && primarySelected.IsVideo" controls :src="getSharedStreamUrl(primarySelected.ItemID)"></video>
              <div v-else class="preview-doc">
                <div class="doc-glyph">{{ getCloudItemIcon(primarySelected) }}</div>
                <p>{{ primarySelected.ItemType === 'Folder' ? 'Double-click to open this folder.' : 'No inline preview for this file type.' }}</p>
              </div>
            </div>
            <div class="detail-stack compact">
              <div v-if="primarySelected.ItemType === 'File'"><span>Size</span><strong>{{ formatSize(primarySelected.FileSizeBytes) }}</strong></div>
              <div><span>Modified</span><strong>{{ formatDateTime(primarySelected.ModifiedDate) }}</strong></div>
            </div>
            <div class="preview-actions">
              <a v-if="primarySelected.ItemType === 'File'" class="btn btn-primary" :href="getSharedDownloadUrl(primarySelected.ItemID)" :download="primarySelected.Name">Download</a>
              <button v-if="primarySelected.ItemType === 'Folder'" class="btn btn-primary" @click="openFolder(primarySelected.ItemID)">Open folder</button>
              <button v-if="canDelete" class="btn btn-danger" @click="deleteSharedItem(primarySelected)" :disabled="isMutating">Delete</button>
            </div>
          </div>
        </aside>
      </div>
    </section>

    <div v-if="activeUploads.length > 0" class="upload-panel" :class="{ minimized: !isUploadPanelOpen }">
      <div class="upload-header" @click="isUploadPanelOpen = !isUploadPanelOpen">
        <span>{{ activeUploadCount }} uploading / {{ activeUploads.length }} total</span>
        <div class="upload-controls" @click.stop>
          <button @click="clearCompletedUploads">Clear done</button>
          <button @click="isUploadPanelOpen = !isUploadPanelOpen">{{ isUploadPanelOpen ? '_' : '^' }}</button>
        </div>
      </div>
      <div v-if="isUploadPanelOpen" class="upload-list">
        <div v-for="task in activeUploads" :key="task.id" class="upload-item">
          <div class="upload-info">
            <span class="upload-name">{{ task.fileName }}</span>
            <span class="upload-status" :style="{ color: getStatusColor(task.status) }">{{ task.status }} {{ task.progress }}%</span>
          </div>
          <div class="upload-progress-bar"><div class="progress-fill" :style="{ width: task.progress + '%', background: getStatusColor(task.status) }"></div></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import Swal from 'sweetalert2';
import { KliveAPIUrl } from '~/scripts/APIInterface';

definePageMeta({ layout: 'empty' });

type CloudItemType = 'File' | 'Folder';
type RawCloudItemType = CloudItemType | number | string | null | undefined;

interface SharedChildItem {
  ItemID: string;
  Name: string;
  RelativePath: string;
  ParentFolderID: string;
  CreatedDate: string;
  ModifiedDate: string;
  CreatedByUserID: string;
  ItemType: RawCloudItemType;
  MinimumPermissionLevel: string;
  FileSizeBytes: number;
  IsImage?: boolean;
  IsVideo?: boolean;
  VideoMimeType?: string | null;
}

interface NormalizedSharedChildItem extends Omit<SharedChildItem, 'ItemType'> {
  ItemType: CloudItemType;
}

interface UploadTask {
  id: string;
  fileName: string;
  progress: number;
  status: 'uploading' | 'finalizing' | 'completed' | 'error';
}

interface SharedItemInfo extends SharedChildItem {
  IsImage: boolean;
  IsVideo: boolean;
  ShareCode: string;
  SharePermissionMode?: string;
  PermissionMode?: string | number | null;
  CanWrite?: boolean;
  CanDelete?: boolean;
  ExpirationDate?: string | null;
  Children: SharedChildItem[];
}

interface MarqueeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const route = useRoute();
const requestUrl = useRequestURL();
const code = computed(() => String(route.params.code || ''));

const activeFolderId = ref('');
const selectedIds = ref<Set<string>>(new Set());
const primarySelectedId = ref('');
const mutationError = ref('');
const isMutating = ref(false);
const isDropActive = ref(false);
const activeUploads = ref<UploadTask[]>([]);
const isUploadPanelOpen = ref(false);
const uploadInput = ref<HTMLInputElement | null>(null);
const gridContainer = ref<HTMLElement | null>(null);
const failedThumbnails = ref<Set<string>>(new Set());

const isMarqueeing = ref(false);
const marqueeRect = ref<MarqueeRect | null>(null);
let marqueeOriginX = 0;
let marqueeOriginY = 0;
let marqueeBaseSelection = new Set<string>();
let marqueeAdditive = false;

const { data: sharedItem, pending: loading, error: fetchError, refresh } = await useFetch<SharedItemInfo>(
  () => `${KliveAPIUrl}/KliveCloud/GetSharedItemInfo?code=${encodeURIComponent(code.value)}`,
  { key: `shared-item-${code.value}` }
);

function normalizeItemType(itemType: unknown): CloudItemType {
  const value = String(itemType ?? '').trim().toLowerCase();
  if (value === 'folder' || value === '1') return 'Folder';
  return 'File';
}

function normalizeSharePermissionMode(mode: unknown): 'ReadOnly' | 'Write' | 'WriteDelete' {
  const value = String(mode ?? '').trim().replace(/[-_\s]/g, '').toLowerCase();
  if (value === '2' || value === 'writedelete' || value === 'delete') return 'WriteDelete';
  if (value === '1' || value === 'write') return 'Write';
  return 'ReadOnly';
}

function normalizeBoolean(value: unknown) {
  if (value === true || value === 1) return true;
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function normalizeSharedChild<T extends SharedChildItem>(item: T): NormalizedSharedChildItem {
  return {
    ...item,
    ParentFolderID: item.ParentFolderID || '',
    RelativePath: item.RelativePath || item.Name || '',
    ItemType: normalizeItemType(item.ItemType)
  };
}

function sameId(left?: string | null, right?: string | null) {
  return String(left || '').toLowerCase() === String(right || '').toLowerCase();
}

function sortSharedItems(left: NormalizedSharedChildItem, right: NormalizedSharedChildItem) {
  if (left.ItemType !== right.ItemType) return left.ItemType === 'Folder' ? -1 : 1;
  return left.Name.localeCompare(right.Name);
}

const rootItem = computed<NormalizedSharedChildItem | null>(() => sharedItem.value ? normalizeSharedChild(sharedItem.value) : null);
const isFolder = computed(() => rootItem.value?.ItemType === 'Folder');
const rootFolderId = computed(() => isFolder.value ? rootItem.value?.ItemID || '' : '');
const sharePermissionMode = computed(() => normalizeSharePermissionMode(sharedItem.value?.SharePermissionMode ?? sharedItem.value?.PermissionMode));
const canWrite = computed(() => normalizeBoolean(sharedItem.value?.CanWrite) || sharePermissionMode.value === 'Write' || sharePermissionMode.value === 'WriteDelete');
const canDelete = computed(() => normalizeBoolean(sharedItem.value?.CanDelete) || sharePermissionMode.value === 'WriteDelete');
const children = computed<NormalizedSharedChildItem[]>(() => Array.isArray(sharedItem.value?.Children) ? sharedItem.value!.Children.map(normalizeSharedChild) : []);

function getDirectChildren(folderId: string) {
  return children.value
    .filter((entry) => sameId(entry.ParentFolderID, folderId))
    .sort(sortSharedItems);
}

const activeFolder = computed<NormalizedSharedChildItem | null>(() => {
  if (!isFolder.value) return null;
  if (sameId(activeFolderId.value, rootFolderId.value)) return rootItem.value;
  return children.value.find((entry) => sameId(entry.ItemID, activeFolderId.value) && entry.ItemType === 'Folder') || rootItem.value;
});
const visibleItems = computed<NormalizedSharedChildItem[]>(() => {
  const folderId = activeFolderId.value || rootFolderId.value;
  return getDirectChildren(folderId);
});
const parentFolderId = computed(() => {
  if (!activeFolder.value || sameId(activeFolderId.value, rootFolderId.value)) return rootFolderId.value;
  return activeFolder.value.ParentFolderID || rootFolderId.value;
});
const folderPath = computed(() => {
  if (!sharedItem.value || !isFolder.value || !rootItem.value) return [];

  const path: NormalizedSharedChildItem[] = [rootItem.value];
  const folderMap = new Map(children.value.filter((entry) => entry.ItemType === 'Folder').map((entry) => [entry.ItemID, entry]));
  let cursor = activeFolderId.value;
  const nestedPath: NormalizedSharedChildItem[] = [];
  const seen = new Set<string>();

  while (cursor && !sameId(cursor, rootFolderId.value) && !seen.has(cursor)) {
    seen.add(cursor);
    const folder = folderMap.get(cursor);
    if (!folder) break;
    nestedPath.unshift(folder);
    cursor = folder.ParentFolderID;
  }

  return path.concat(nestedPath);
});
const permissionLabel = computed(() => {
  if (sharePermissionMode.value === 'WriteDelete') return 'Write & delete';
  if (sharePermissionMode.value === 'Write') return 'Write';
  return 'Read only';
});
const error = computed(() => {
  if (!fetchError.value) return '';
  if (fetchError.value.statusCode === 404) return 'Shared item not found';
  if (fetchError.value.statusCode === 410) return 'This share link expired';
  return 'Failed to load the shared item';
});
const selectionCount = computed(() => selectedIds.value.size);
const primarySelected = computed<NormalizedSharedChildItem | null>(() => {
  if (!primarySelectedId.value) return null;
  return children.value.find((entry) => sameId(entry.ItemID, primarySelectedId.value)) || null;
});
const selectedSizeBytes = computed(() => {
  let total = 0;
  for (const id of selectedIds.value) {
    const item = children.value.find((entry) => sameId(entry.ItemID, id));
    if (item?.ItemType === 'File') total += item.FileSizeBytes;
  }
  return total;
});
const activeUploadCount = computed(() => activeUploads.value.filter((task) => task.status === 'uploading' || task.status === 'finalizing').length);

const sharedPageUrl = computed(() => new URL(route.fullPath || `/shared/${encodeURIComponent(code.value)}`, requestUrl.origin).toString());
const embedTitle = computed(() => rootItem.value?.Name || 'KliveCloud shared item');
const embedDescription = computed(() => {
  const item = rootItem.value;
  if (!item) return 'Shared via KliveCloud';
  if (item.ItemType === 'File') return `Shared via KliveCloud - ${formatSize(item.FileSizeBytes)}`;
  return `Shared via KliveCloud - ${countNestedItems(item.ItemID)} items`;
});

useHead(() => {
  const item = rootItem.value;
  const title = embedTitle.value;
  const description = embedDescription.value;
  const meta: Array<Record<string, string>> = [
    { key: 'description', name: 'description', content: description },
    { key: 'og-site-name', property: 'og:site_name', content: 'KliveCloud' },
    { key: 'og-title', property: 'og:title', content: title },
    { key: 'og-description', property: 'og:description', content: description },
    { key: 'og-url', property: 'og:url', content: sharedPageUrl.value },
    { key: 'twitter-title', name: 'twitter:title', content: title },
    { key: 'twitter-description', name: 'twitter:description', content: description },
    { key: 'theme-color', name: 'theme-color', content: '#4d9e39' }
  ];

  if (item?.ItemType === 'File' && (item.IsImage || item.IsVideo)) {
    const previewUrl = getSharedPreviewUrl(item.ItemID, 1280, 720);
    meta.push(
      { key: 'og-image', property: 'og:image', content: previewUrl },
      { key: 'og-image-secure', property: 'og:image:secure_url', content: previewUrl },
      { key: 'og-image-type', property: 'og:image:type', content: 'image/jpeg' },
      { key: 'og-image-width', property: 'og:image:width', content: '1280' },
      { key: 'og-image-height', property: 'og:image:height', content: '720' },
      { key: 'twitter-image', name: 'twitter:image', content: previewUrl }
    );
  }

  if (item?.ItemType === 'File' && item.IsVideo) {
    const videoUrl = getSharedEmbedVideoUrl(item.ItemID);
    const videoType = 'video/mp4';
    meta.push(
      { key: 'og-type', property: 'og:type', content: 'video.other' },
      { key: 'og-video', property: 'og:video', content: videoUrl },
      { key: 'og-video-url', property: 'og:video:url', content: videoUrl },
      { key: 'og-video-secure', property: 'og:video:secure_url', content: videoUrl },
      { key: 'og-video-type', property: 'og:video:type', content: videoType },
      { key: 'og-video-width', property: 'og:video:width', content: '1280' },
      { key: 'og-video-height', property: 'og:video:height', content: '720' },
      { key: 'twitter-card', name: 'twitter:card', content: 'player' },
      { key: 'twitter-player', name: 'twitter:player', content: videoUrl },
      { key: 'twitter-player-stream', name: 'twitter:player:stream', content: videoUrl },
      { key: 'twitter-player-stream-type', name: 'twitter:player:stream:content_type', content: videoType },
      { key: 'twitter-player-width', name: 'twitter:player:width', content: '1280' },
      { key: 'twitter-player-height', name: 'twitter:player:height', content: '720' }
    );
  } else {
    meta.push(
      { key: 'og-type', property: 'og:type', content: 'website' },
      { key: 'twitter-card', name: 'twitter:card', content: 'summary_large_image' }
    );
  }

  return {
    title: `${title} | KliveCloud`,
    link: [{ key: 'canonical', rel: 'canonical', href: sharedPageUrl.value }],
    meta
  };
});

watch(sharedItem, (item) => {
  const normalizedRoot = item ? normalizeSharedChild(item) : null;
  if (normalizedRoot?.ItemType === 'Folder') {
    const activeFolderStillExists = sameId(activeFolderId.value, normalizedRoot.ItemID)
      || children.value.some((entry) => sameId(entry.ItemID, activeFolderId.value) && entry.ItemType === 'Folder');
    if (!activeFolderStillExists) {
      activeFolderId.value = normalizedRoot.ItemID;
    }

    const survivingIds = new Set<string>();
    for (const id of selectedIds.value) {
      if (children.value.some((entry) => sameId(entry.ItemID, id))) survivingIds.add(id);
    }
    selectedIds.value = survivingIds;
    if (primarySelectedId.value && !survivingIds.has(primarySelectedId.value)) {
      primarySelectedId.value = '';
    }
  }
}, { immediate: true });

function getIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext || '')) return 'IMG';
  if (['mp4', 'mov', 'mkv', 'webm', 'm4v', 'avi'].includes(ext || '')) return 'VID';
  if (['mp3', 'wav', 'flac', 'aac'].includes(ext || '')) return 'AUD';
  if (['zip', 'rar', '7z', 'tar'].includes(ext || '')) return 'ZIP';
  if (ext === 'pdf') return 'PDF';
  if (['txt', 'md', 'json', 'csv'].includes(ext || '')) return 'TXT';
  return 'FILE';
}

function getCloudItemIcon(item: NormalizedSharedChildItem) {
  if (item.ItemType === 'Folder') return 'DIR';
  return getIcon(item.Name);
}

function hasThumbnail(item: NormalizedSharedChildItem) {
  if (item.ItemType !== 'File') return false;
  if (failedThumbnails.value.has(item.ItemID)) return false;
  return !!(item.IsImage || item.IsVideo);
}

function markThumbnailFailed(itemId: string) {
  const next = new Set(failedThumbnails.value);
  next.add(itemId);
  failedThumbnails.value = next;
}

function formatSize(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${parseFloat((bytes / Math.pow(1024, index)).toFixed(2))} ${units[index]}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString();
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString();
}

function getSharedDownloadUrl(itemId?: string) {
  const params = new URLSearchParams({ code: code.value });
  if (itemId) params.set('itemID', itemId);
  return `${KliveAPIUrl}/KliveCloud/DownloadShared?${params.toString()}`;
}

function getSharedStreamUrl(itemId?: string) {
  const params = new URLSearchParams({ code: code.value });
  if (itemId) params.set('itemID', itemId);
  return `${KliveAPIUrl}/KliveCloud/StreamSharedVideo?${params.toString()}`;
}

function getSharedEmbedVideoUrl(itemId?: string) {
  const params = new URLSearchParams({ code: code.value });
  if (itemId) params.set('itemID', itemId);
  return `${KliveAPIUrl}/KliveCloud/StreamSharedVideoEmbed?${params.toString()}`;
}

function getSharedPreviewUrl(itemId?: string, maxWidth = 320, maxHeight = 320) {
  const params = new URLSearchParams({ code: code.value, maxWidth: String(maxWidth), maxHeight: String(maxHeight) });
  if (itemId) params.set('itemID', itemId);
  return `${KliveAPIUrl}/KliveCloud/GetSharedPreview?${params.toString()}`;
}

function openFolder(folderId: string) {
  activeFolderId.value = folderId || rootFolderId.value;
  clearSelection();
}

function isSelected(itemId: string) {
  return selectedIds.value.has(itemId);
}

function setSingleSelection(itemId: string) {
  selectedIds.value = new Set([itemId]);
  primarySelectedId.value = itemId;
}

function toggleSelection(itemId: string) {
  const next = new Set(selectedIds.value);
  if (next.has(itemId)) {
    next.delete(itemId);
    if (sameId(primarySelectedId.value, itemId)) {
      primarySelectedId.value = next.size > 0 ? Array.from(next).pop() || '' : '';
    }
  } else {
    next.add(itemId);
    primarySelectedId.value = itemId;
  }
  selectedIds.value = next;
}

function addToSelection(itemId: string) {
  const next = new Set(selectedIds.value);
  next.add(itemId);
  selectedIds.value = next;
  primarySelectedId.value = itemId;
}

function clearSelection() {
  selectedIds.value = new Set();
  primarySelectedId.value = '';
}

function onTileClick(event: MouseEvent, item: NormalizedSharedChildItem) {
  event.stopPropagation();
  if (event.shiftKey) {
    addToSelection(item.ItemID);
    return;
  }
  if (event.ctrlKey || event.metaKey) {
    toggleSelection(item.ItemID);
    return;
  }
  setSingleSelection(item.ItemID);
}

function onTileDoubleClick(item: NormalizedSharedChildItem) {
  if (item.ItemType === 'Folder') {
    openFolder(item.ItemID);
    return;
  }
  if (item.ItemType === 'File' && (item.IsImage || item.IsVideo)) {
    setSingleSelection(item.ItemID);
    return;
  }
  if (process.client) window.location.assign(getSharedDownloadUrl(item.ItemID));
}

function countNestedItems(folderId: string) {
  const total = children.value.filter((entry) => sameId(entry.ParentFolderID, folderId)).length;
  return `${total} item${total === 1 ? '' : 's'}`;
}

async function copyCurrentLink() {
  if (!process.client) return;
  await navigator.clipboard.writeText(window.location.href);
  await Swal.fire({ title: 'Copied', text: 'Share link copied to clipboard.', icon: 'success', timer: 1300, showConfirmButton: false, background: '#161516', color: '#fff' });
}

function triggerSharedUpload() {
  if (!canWrite.value || isMutating.value) return;
  uploadInput.value?.click();
}

async function createSharedFolder() {
  if (!canWrite.value || isMutating.value) return;
  const result = await Swal.fire({
    title: 'Create folder',
    input: 'text',
    inputPlaceholder: 'Folder name',
    showCancelButton: true,
    confirmButtonText: 'Create',
    confirmButtonColor: '#4d9e39',
    background: '#161516',
    color: '#ffffff'
  });

  const folderName = result.value?.trim();
  if (!result.isConfirmed || !folderName) return;

  await mutateSharedFolder(`/KliveCloud/CreateSharedFolder?code=${encodeURIComponent(code.value)}&parentFolderID=${encodeURIComponent(activeFolderId.value || rootFolderId.value)}&name=${encodeURIComponent(folderName)}`);
}

async function handleSharedUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = '';
  await uploadSharedFiles(files);
}

async function uploadSharedFiles(files: File[]) {
  if (!files.length || !canWrite.value || isMutating.value) return;

  isMutating.value = true;
  mutationError.value = '';
  isUploadPanelOpen.value = true;
  try {
    for (const file of files) {
      await uploadSharedFile(file);
    }
    await refresh();
  } catch (err) {
    mutationError.value = err instanceof Error ? err.message : 'Upload failed.';
  } finally {
    isMutating.value = false;
  }
}

function uploadSharedFile(file: File) {
  return new Promise<void>((resolve, reject) => {
    const task: UploadTask = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      fileName: file.name,
      progress: 0,
      status: 'uploading'
    };
    activeUploads.value.push(task);

    const params = new URLSearchParams({
      code: code.value,
      parentFolderID: activeFolderId.value || rootFolderId.value,
      fileName: file.name
    });

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${KliveAPIUrl}/KliveCloud/UploadShared?${params.toString()}`, true);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      task.progress = Math.round((event.loaded / event.total) * 100);
      if (task.progress === 100) task.status = 'finalizing';
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        task.status = 'completed';
        task.progress = 100;
        resolve();
        return;
      }

      task.status = 'error';
      reject(new Error(xhr.responseText || 'Upload failed.'));
    };

    xhr.onerror = () => {
      task.status = 'error';
      reject(new Error('Network error while uploading.'));
    };

    xhr.send(file);
  });
}

function onDragOver(event: DragEvent) {
  if (!canWrite.value || isMutating.value) return;
  if (!event.dataTransfer || !Array.from(event.dataTransfer.types || []).includes('Files')) return;
  isDropActive.value = true;
}

function onDragLeave(event: DragEvent) {
  const related = event.relatedTarget as Node | null;
  if (related && (event.currentTarget as HTMLElement).contains(related)) return;
  isDropActive.value = false;
}

async function onFileDrop(event: DragEvent) {
  isDropActive.value = false;
  const files = Array.from(event.dataTransfer?.files || []);
  if (!files.length) return;
  await uploadSharedFiles(files);
}

function onGridMouseDown(event: MouseEvent) {
  if (event.button !== 0) return;
  const target = event.target as HTMLElement;
  if (target.closest('.tile') || target.closest('.tile-actions') || target.closest('button') || target.closest('a')) return;
  if (!gridContainer.value) return;

  const containerRect = gridContainer.value.getBoundingClientRect();
  marqueeOriginX = event.clientX - containerRect.left + gridContainer.value.scrollLeft;
  marqueeOriginY = event.clientY - containerRect.top + gridContainer.value.scrollTop;
  marqueeAdditive = event.ctrlKey || event.metaKey || event.shiftKey;
  marqueeBaseSelection = marqueeAdditive ? new Set(selectedIds.value) : new Set<string>();

  if (!marqueeAdditive) clearSelection();

  isMarqueeing.value = true;
  marqueeRect.value = { left: marqueeOriginX, top: marqueeOriginY, width: 0, height: 0 };

  window.addEventListener('mousemove', onMarqueeMove);
  window.addEventListener('mouseup', onMarqueeUp, { once: true });
  event.preventDefault();
}

function onMarqueeMove(event: MouseEvent) {
  if (!gridContainer.value || !isMarqueeing.value) return;
  const containerRect = gridContainer.value.getBoundingClientRect();
  const x = event.clientX - containerRect.left + gridContainer.value.scrollLeft;
  const y = event.clientY - containerRect.top + gridContainer.value.scrollTop;

  const left = Math.min(marqueeOriginX, x);
  const top = Math.min(marqueeOriginY, y);
  const width = Math.abs(x - marqueeOriginX);
  const height = Math.abs(y - marqueeOriginY);
  marqueeRect.value = { left, top, width, height };

  updateMarqueeSelection(left, top, width, height);
}

function updateMarqueeSelection(left: number, top: number, width: number, height: number) {
  if (!gridContainer.value) return;
  const containerRect = gridContainer.value.getBoundingClientRect();
  const tiles = gridContainer.value.querySelectorAll<HTMLElement>('.tile[data-item-id]');
  const next = new Set<string>(marqueeBaseSelection);
  let lastHit = '';

  const right = left + width;
  const bottom = top + height;

  tiles.forEach((tile) => {
    const itemId = tile.dataset.itemId;
    if (!itemId) return;
    const tileRect = tile.getBoundingClientRect();
    const tileLeft = tileRect.left - containerRect.left + (gridContainer.value?.scrollLeft || 0);
    const tileTop = tileRect.top - containerRect.top + (gridContainer.value?.scrollTop || 0);
    const tileRight = tileLeft + tileRect.width;
    const tileBottom = tileTop + tileRect.height;

    const intersects = tileLeft < right && tileRight > left && tileTop < bottom && tileBottom > top;
    if (intersects) {
      next.add(itemId);
      lastHit = itemId;
    } else if (!marqueeAdditive) {
      next.delete(itemId);
    }
  });

  selectedIds.value = next;
  if (lastHit) {
    primarySelectedId.value = lastHit;
  } else if (!next.has(primarySelectedId.value)) {
    primarySelectedId.value = next.size > 0 ? Array.from(next).pop() || '' : '';
  }
}

function onMarqueeUp() {
  isMarqueeing.value = false;
  marqueeRect.value = null;
  window.removeEventListener('mousemove', onMarqueeMove);
}

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMarqueeMove);
});

function clearCompletedUploads() {
  activeUploads.value = activeUploads.value.filter((task) => task.status === 'uploading' || task.status === 'finalizing');
  if (activeUploads.value.length === 0) isUploadPanelOpen.value = false;
}

function getStatusColor(status: UploadTask['status']) {
  if (status === 'completed') return '#81c784';
  if (status === 'error') return '#e57373';
  if (status === 'finalizing') return '#88c0d0';
  return '#4CAF50';
}

async function deleteSharedItem(item: NormalizedSharedChildItem) {
  if (!canDelete.value || isMutating.value) return;
  const result = await Swal.fire({
    title: `Delete ${item.Name}?`,
    text: item.ItemType === 'Folder' ? 'This will delete the folder and its contents.' : 'This file will be removed from the shared folder.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Delete',
    confirmButtonColor: '#ef4444',
    background: '#161516',
    color: '#ffffff'
  });

  if (!result.isConfirmed) return;
  await mutateSharedFolder(`/KliveCloud/DeleteSharedItem?code=${encodeURIComponent(code.value)}&itemID=${encodeURIComponent(item.ItemID)}`);
}

async function deleteSelected() {
  if (!canDelete.value || isMutating.value || selectedIds.value.size === 0) return;
  const ids = Array.from(selectedIds.value);
  const result = await Swal.fire({
    title: `Delete ${ids.length} items?`,
    text: 'Selected files and folders will be permanently removed.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Delete all',
    confirmButtonColor: '#ef4444',
    background: '#161516',
    color: '#ffffff'
  });
  if (!result.isConfirmed) return;

  isMutating.value = true;
  mutationError.value = '';
  try {
    for (const id of ids) {
      const response = await fetch(`${KliveAPIUrl}/KliveCloud/DeleteSharedItem?code=${encodeURIComponent(code.value)}&itemID=${encodeURIComponent(id)}`, { method: 'POST', mode: 'cors' });
      if (!response.ok) throw new Error(await response.text());
    }
    clearSelection();
    await refresh();
  } catch (err) {
    mutationError.value = err instanceof Error ? err.message : 'Bulk delete failed.';
  } finally {
    isMutating.value = false;
  }
}

function downloadSelected() {
  if (!process.client) return;
  for (const id of selectedIds.value) {
    const item = children.value.find((entry) => sameId(entry.ItemID, id));
    if (!item || item.ItemType !== 'File') continue;
    const link = document.createElement('a');
    link.href = getSharedDownloadUrl(item.ItemID);
    link.download = item.Name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
}

async function mutateSharedFolder(url: string) {
  isMutating.value = true;
  mutationError.value = '';
  try {
    const response = await fetch(`${KliveAPIUrl}${url}`, { method: 'POST', mode: 'cors' });
    if (!response.ok) throw new Error(await response.text());
    await refresh();
  } catch (err) {
    mutationError.value = err instanceof Error ? err.message : 'Shared folder update failed.';
  } finally {
    isMutating.value = false;
  }
}

if (sharedItem.value) {
  const item = sharedItem.value;
  const description = normalizeItemType(item.ItemType) === 'Folder'
    ? `Shared KliveCloud folder with ${item.Children?.length || 0} entries.`
    : `Shared via KliveCloud - ${formatSize(item.FileSizeBytes)}`;

  useServerSeoMeta({
    title: item.Name,
    description,
    ogTitle: item.Name,
    ogDescription: description,
    ogSiteName: 'KliveCloud',
    themeColor: '#4d9e39'
  });
}
</script>

<style scoped>
.shared-shell {
  min-height: 100vh;
  position: relative;
  padding: 28px 22px;
  background: #050805;
  color: #f6fff2;
}

.shared-background {
  position: fixed;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at 20% 0%, rgba(83, 192, 58, 0.16), rgba(0, 0, 0, 0) 38%),
    linear-gradient(rgba(120, 214, 92, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(120, 214, 92, 0.04) 1px, transparent 1px);
  background-size: auto, 48px 48px, 48px 48px;
  mask-image: linear-gradient(to bottom, #000 0%, transparent 90%);
}

.state-panel,
.share-console {
  position: relative;
  z-index: 1;
  width: min(1500px, 100%);
  margin: 0 auto;
}

.state-panel {
  max-width: 540px;
  padding: 44px 34px;
  text-align: center;
  border-radius: 14px;
  background: rgba(11, 18, 12, 0.92);
  border: 1px solid rgba(125, 219, 94, 0.18);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.42);
}

.loading-mark,
.state-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 18px;
  border-radius: 12px;
}

.loading-mark {
  border: 4px solid rgba(125, 219, 94, 0.18);
  border-top-color: #76d85a;
  animation: spin 0.9s linear infinite;
}

.state-icon {
  display: grid;
  place-items: center;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.28);
  color: #ffc6c6;
  font-size: 1.6rem;
  font-weight: 800;
}

.share-console {
  display: grid;
  gap: 16px;
}

.topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 22px;
  padding: 18px 22px;
  border-radius: 14px;
  border: 1px solid rgba(125, 219, 94, 0.16);
  background: linear-gradient(135deg, rgba(15, 24, 16, 0.95), rgba(7, 11, 8, 0.95));
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.42);
}

.topbar-left { min-width: 0; flex: 1; }

.eyebrow {
  margin: 0;
  color: #8dd574;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.7rem;
  font-weight: 800;
}

.file-title {
  margin: 6px 0 8px;
  font-size: clamp(1.6rem, 3vw, 2.4rem);
  font-weight: 800;
  line-height: 1.05;
  word-break: break-word;
}

.breadcrumbs {
  margin: 8px 0 6px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

.crumb {
  border: 0;
  background: transparent;
  color: #cdeac1;
  padding: 4px 6px;
  font: inherit;
  font-size: 1.4rem;
  font-weight: 800;
  cursor: pointer;
  border-radius: 6px;
  letter-spacing: -0.01em;
}

.crumb:hover { background: rgba(125, 219, 94, 0.1); color: #f6fff2; }

.crumb.active { color: #ffffff; cursor: default; }
.crumb.active:hover { background: transparent; }

.crumb-sep { color: #4b6745; margin: 0 4px; font-size: 1.3rem; }

.topbar-meta {
  margin: 4px 0 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  color: #9fb69a;
  font-size: 0.88rem;
}

.badge {
  padding: 4px 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #dfffd8;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
}

.badge-readonly { background: rgba(125, 219, 94, 0.08); border-color: rgba(125, 219, 94, 0.18); color: #c8ffb6; }
.badge-write { background: rgba(94, 129, 172, 0.18); border-color: rgba(94, 129, 172, 0.38); color: #d6e6ff; }
.badge-writedelete { background: rgba(245, 158, 11, 0.18); border-color: rgba(245, 158, 11, 0.4); color: #ffe2a4; }
.badge-warn { background: rgba(239, 68, 68, 0.16); border-color: rgba(239, 68, 68, 0.32); color: #ffc6c6; }

.topbar-right {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.btn {
  border: 0;
  cursor: pointer;
  text-decoration: none;
  font: inherit;
  font-weight: 700;
  letter-spacing: 0.02em;
  padding: 10px 16px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  white-space: nowrap;
  transition: transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}

.btn:hover { transform: translateY(-1px); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

.btn-primary {
  color: #061006;
  background: linear-gradient(180deg, #a2ff87, #55c83c);
  box-shadow: 0 12px 28px rgba(77, 158, 57, 0.22);
}

.btn-ghost {
  color: #dfffd8;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.btn-ghost:hover { background: rgba(255, 255, 255, 0.08); }

.btn-danger {
  color: #fff;
  background: linear-gradient(180deg, #ef4444, #b32424);
  box-shadow: 0 12px 28px rgba(239, 68, 68, 0.18);
}

.full-width { width: 100%; margin-top: 8px; }

.inline-error {
  padding: 12px 16px;
  border-radius: 10px;
  border: 1px solid rgba(239, 68, 68, 0.34);
  background: rgba(239, 68, 68, 0.08);
  color: #ffc6c6;
  font-weight: 600;
}

.single-file-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(310px, 0.36fr);
  gap: 16px;
}

.viewer-panel,
.details-panel,
.preview-panel {
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(15, 24, 16, 0.92), rgba(7, 11, 8, 0.92));
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.42);
}

.viewer-panel {
  min-height: 520px;
  display: grid;
  place-items: center;
  padding: 18px;
}

.details-panel { padding: 20px; }

.media-preview,
.preview-media img,
.preview-media video {
  width: 100%;
  max-height: 70vh;
  object-fit: contain;
  border-radius: 10px;
  background: #000;
}

.document-preview,
.preview-doc {
  display: grid;
  place-items: center;
  padding: 24px;
  text-align: center;
  min-height: 280px;
  width: 100%;
}

.doc-glyph {
  font-size: clamp(3rem, 12vw, 7rem);
  font-weight: 900;
  color: rgba(217, 255, 208, 0.78);
  letter-spacing: 0.12em;
}

.detail-stack {
  display: grid;
  gap: 8px;
  margin: 14px 0;
}

.detail-stack.compact { margin: 12px 0; }

.detail-stack > div {
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.detail-stack span {
  display: block;
  color: #8dd574;
  font-size: 0.7rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  font-weight: 800;
  margin-bottom: 4px;
}

.detail-stack strong {
  display: block;
  color: #fff;
  word-break: break-word;
  font-size: 0.94rem;
}

.folder-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 320px);
  gap: 16px;
  align-items: start;
}

.file-grid-area {
  position: relative;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: linear-gradient(135deg, rgba(15, 24, 16, 0.92), rgba(7, 11, 8, 0.92));
  padding: 18px;
  min-height: 480px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.42);
  user-select: none;
}

.file-grid-area.drop-active {
  outline: 2px dashed rgba(125, 219, 94, 0.6);
  outline-offset: -10px;
}

.file-grid-area.marquee-active { cursor: crosshair; }

.file-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 14px;
  position: relative;
  z-index: 1;
}

.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  background: rgba(255, 255, 255, 0.025);
  color: #f6fff2;
  padding: 0;
  text-align: left;
  cursor: pointer;
  transition: transform 0.12s ease, border-color 0.12s ease, background 0.12s ease, box-shadow 0.12s ease;
  overflow: hidden;
  font: inherit;
  outline: none;
}

button.tile { width: 100%; }

.tile:hover {
  transform: translateY(-1px);
  border-color: rgba(125, 219, 94, 0.32);
  background: rgba(125, 219, 94, 0.06);
}

.tile.selected {
  border-color: rgba(125, 219, 94, 0.55);
  background: rgba(125, 219, 94, 0.12);
  box-shadow: 0 0 0 1px rgba(125, 219, 94, 0.35), 0 14px 32px rgba(0, 0, 0, 0.45);
}

.tile.primary {
  border-color: #76d85a;
  box-shadow: 0 0 0 2px rgba(125, 219, 94, 0.55), 0 16px 36px rgba(0, 0, 0, 0.5);
}

.tile-thumb {
  position: relative;
  height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0a0e0a;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  overflow: hidden;
}

.tile-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.thumb-glyph {
  font-size: 2rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  color: #cdeac1;
}

.thumb-folder {
  background: linear-gradient(135deg, rgba(245, 205, 92, 0.12), rgba(245, 205, 92, 0.04));
}

.thumb-folder .thumb-glyph,
.tile-folder .thumb-glyph {
  color: #ffe9a6;
}

.thumb-kind-img,
.thumb-kind-vid { background: linear-gradient(135deg, rgba(94, 129, 172, 0.18), rgba(94, 129, 172, 0.04)); }
.thumb-kind-aud { background: linear-gradient(135deg, rgba(180, 142, 173, 0.18), rgba(180, 142, 173, 0.04)); }
.thumb-kind-zip { background: linear-gradient(135deg, rgba(208, 135, 112, 0.18), rgba(208, 135, 112, 0.04)); }
.thumb-kind-pdf { background: linear-gradient(135deg, rgba(191, 97, 106, 0.18), rgba(191, 97, 106, 0.04)); }
.thumb-kind-txt { background: linear-gradient(135deg, rgba(143, 188, 187, 0.18), rgba(143, 188, 187, 0.04)); }

.thumb-tag {
  position: absolute;
  bottom: 8px;
  left: 8px;
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.6);
  color: #f6fff2;
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.1em;
}

.tile-body {
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tile-name {
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tile-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #91a78d;
  font-size: 0.78rem;
}

.meta-sep { color: #4b6745; }

.tile-back {
  border-style: dashed;
  background: rgba(255, 255, 255, 0.02);
}

.tile-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.tile:hover .tile-actions,
.tile.selected .tile-actions,
.tile:focus-visible .tile-actions {
  opacity: 1;
}

.icon-btn {
  min-width: 28px;
  height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.55);
  color: #f6fff2;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.icon-btn:hover { background: rgba(94, 129, 172, 0.85); }
.icon-btn-danger:hover { background: rgba(191, 97, 106, 0.95); }

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  min-height: 480px;
  color: #9fb69a;
  gap: 8px;
}

.empty-glyph {
  font-size: 4rem;
  font-weight: 900;
  color: rgba(125, 219, 94, 0.45);
}

.drop-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 30;
  pointer-events: none;
  border-radius: 14px;
}

.drop-card {
  text-align: center;
  padding: 24px 32px;
  border-radius: 14px;
  background: rgba(15, 24, 16, 0.95);
  border: 1px solid rgba(125, 219, 94, 0.35);
  color: #dfffd8;
}

.drop-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 12px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: rgba(125, 219, 94, 0.18);
  border: 1px solid rgba(125, 219, 94, 0.36);
  font-size: 2rem;
  font-weight: 900;
  color: #c8ffb6;
}

.marquee {
  position: absolute;
  background: rgba(125, 219, 94, 0.16);
  border: 1px solid rgba(125, 219, 94, 0.7);
  border-radius: 4px;
  pointer-events: none;
  z-index: 5;
}

.preview-panel {
  padding: 18px;
  display: flex;
  flex-direction: column;
  align-self: start;
  position: sticky;
  top: 18px;
  max-height: calc(100vh - 36px);
  overflow: auto;
}

.preview-panel h2 {
  margin: 4px 0 10px;
  color: #f6fff2;
  font-size: 1.15rem;
  word-break: break-word;
}

.preview-media {
  min-height: 180px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.3);
}

.preview-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.preview-actions .btn { flex: 0 0 auto; }

.preview-empty {
  padding: 18px 4px;
  color: #91a78d;
  text-align: center;
}

.preview-help { color: #91a78d; margin: 0; }

.hidden-input { display: none; }

.upload-panel {
  position: fixed;
  right: 20px;
  bottom: 20px;
  width: min(360px, calc(100vw - 32px));
  max-height: 400px;
  background: rgba(15, 24, 16, 0.97);
  border: 1px solid rgba(125, 219, 94, 0.22);
  border-radius: 12px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.55);
  z-index: 10000;
  overflow: hidden;
}

.upload-panel.minimized { max-height: 44px; }

.upload-header {
  min-height: 44px;
  background: rgba(0, 0, 0, 0.35);
  padding: 10px 15px;
  color: #fff;
  font-weight: 700;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
}

.upload-header:hover { background: rgba(0, 0, 0, 0.5); }

.upload-controls { display: flex; gap: 6px; }

.upload-controls button {
  background: none;
  border: none;
  color: #cdeac1;
  cursor: pointer;
  padding: 2px 6px;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 700;
}

.upload-controls button:hover { color: #fff; }

.upload-list {
  overflow-y: auto;
  max-height: 340px;
  padding: 10px;
}

.upload-item {
  background: rgba(0, 0, 0, 0.25);
  padding: 8px 10px;
  margin-bottom: 6px;
  border-radius: 6px;
}

.upload-info {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 0.88rem;
  margin-bottom: 4px;
}

.upload-name {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.upload-status { color: #91a78d; font-size: 0.78rem; }

.upload-progress-bar {
  height: 4px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  transition: width 0.2s;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 1024px) {
  .folder-workspace,
  .single-file-layout {
    grid-template-columns: 1fr;
  }

  .preview-panel {
    position: static;
    max-height: none;
  }
}

@media (max-width: 720px) {
  .shared-shell { padding: 18px 12px; }
  .topbar { flex-direction: column; align-items: stretch; }
  .topbar-right { justify-content: flex-start; }
  .file-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
  .tile-thumb { height: 110px; }
}
</style>
