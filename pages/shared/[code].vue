<template>
  <div class="shared-shell">
    <div class="shared-backdrop"></div>

    <section v-if="loading" class="shared-card state-card">
      <div class="loading-spinner"></div>
      <h2>Loading shared item</h2>
      <p>Fetching the latest folder or file details from KliveCloud.</p>
    </section>

    <section v-else-if="error" class="shared-card state-card error-card">
      <div class="state-icon">!</div>
      <h2>{{ error }}</h2>
      <p>The share link may be invalid, expired, or no longer attached to an item.</p>
    </section>

    <section v-else-if="sharedItem" class="shared-card content-card">
      <div class="hero-row">
        <div>
          <div class="eyebrow">KLIVECLOUD / SHARED {{ isFolder ? 'FOLDER' : 'FILE' }}</div>
          <h1>{{ sharedItem.Name }}</h1>
          <p class="hero-copy">{{ descriptionText }}</p>
        </div>

        <div class="hero-metrics">
          <div class="metric-chip">{{ sharedItem.ItemType }}</div>
          <div class="metric-chip">{{ metricText }}</div>
          <div v-if="sharedItem.ExpirationDate" class="metric-chip metric-chip-warning">Expires {{ formatDate(sharedItem.ExpirationDate) }}</div>
        </div>
      </div>

      <div v-if="!isFolder" class="file-layout">
        <div class="preview-panel">
          <template v-if="sharedItem.IsImage">
            <img :src="downloadUrl" class="preview-img" :alt="sharedItem.Name" />
          </template>
          <template v-else-if="sharedItem.IsVideo">
            <video controls :src="downloadUrl" class="preview-video"></video>
          </template>
          <template v-else>
            <div class="file-glyph">{{ getIcon(sharedItem.Name) }}</div>
          </template>
        </div>

        <div class="details-panel">
          <div class="detail-grid">
            <div class="detail-card">
              <span>Created</span>
              <strong>{{ formatDateTime(sharedItem.CreatedDate) }}</strong>
            </div>
            <div class="detail-card">
              <span>Modified</span>
              <strong>{{ formatDateTime(sharedItem.ModifiedDate) }}</strong>
            </div>
            <div class="detail-card">
              <span>Size</span>
              <strong>{{ formatSize(sharedItem.FileSizeBytes) }}</strong>
            </div>
          </div>

          <a :href="downloadUrl" class="download-btn">
            Download File
          </a>
        </div>
      </div>

      <div v-else class="folder-layout">
        <div class="folder-summary">
          <div class="detail-card">
            <span>Created</span>
            <strong>{{ formatDateTime(sharedItem.CreatedDate) }}</strong>
          </div>
          <div class="detail-card">
            <span>Updated</span>
            <strong>{{ formatDateTime(sharedItem.ModifiedDate) }}</strong>
          </div>
          <div class="detail-card">
            <span>Contents</span>
            <strong>{{ sharedEntries.length }} entries</strong>
          </div>
        </div>

        <div class="folder-list">
          <article v-for="entry in sharedEntries" :key="entry.ItemID" :class="['folder-entry', { folder: entry.ItemType === 'Folder' }]">
            <div class="entry-copy">
              <div class="entry-name-row">
                <div class="entry-name">{{ entry.Name }}</div>
                <span class="entry-type-chip">{{ entry.ItemType }}</span>
              </div>
              <div class="entry-path">{{ formatRelativePath(entry.RelativePath) }}</div>
              <div class="entry-meta">
                <span>{{ entry.ItemType === 'File' ? formatSize(entry.FileSizeBytes) : 'Folder container' }}</span>
                <span class="separator">•</span>
                <span>Updated {{ formatDateTime(entry.ModifiedDate) }}</span>
              </div>
            </div>

            <a v-if="entry.ItemType === 'File'" :href="getSharedDownloadUrl(entry.ItemID)" class="download-btn compact-download">
              Download
            </a>
            <span v-else class="folder-pill">Browse Contents</span>
          </article>

          <div v-if="sharedEntries.length === 0" class="empty-folder-state">
            This shared folder is currently empty.
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { KliveAPIUrl } from '~/scripts/APIInterface';

definePageMeta({ layout: 'empty' });

interface SharedChildItem {
  ItemID: string;
  Name: string;
  RelativePath: string;
  ParentFolderID: string;
  CreatedDate: string;
  ModifiedDate: string;
  CreatedByUserID: string;
  ItemType: 'File' | 'Folder';
  MinimumPermissionLevel: string;
  FileSizeBytes: number;
}

interface SharedItemInfo extends SharedChildItem {
  IsImage: boolean;
  IsVideo: boolean;
  ShareCode: string;
  ExpirationDate?: string | null;
  Children: SharedChildItem[];
}

const route = useRoute();
const code = route.params.code as string;

const getIcon = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'pdf': return 'PDF';
    case 'jpg':
    case 'jpeg':
    case 'png': return 'IMG';
    case 'txt':
    case 'md': return 'TXT';
    case 'zip':
    case 'rar': return 'ZIP';
    case 'mp3': return 'AUD';
    case 'mp4': return 'VID';
    case 'exe': return 'APP';
    default: return 'FILE';
  }
};

const formatSize = (bytes: number) => {
  if (!bytes) return 'Unknown size';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${parseFloat((bytes / Math.pow(1024, index)).toFixed(2))} ${units[index]}`;
};

const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString();
const formatDateTime = (dateStr: string) => new Date(dateStr).toLocaleString();
const formatRelativePath = (relativePath: string) => relativePath.replace(/\\/g, '/');

const getSharedDownloadUrl = (itemId?: string) => {
  const params = new URLSearchParams({ code });
  if (itemId) {
    params.set('itemID', itemId);
  }
  return `${KliveAPIUrl}/KliveCloud/DownloadShared?${params.toString()}`;
};

const downloadUrl = computed(() => getSharedDownloadUrl());

const { data: sharedItem, pending: loading, error: fetchError } = await useFetch<SharedItemInfo>(
  `${KliveAPIUrl}/KliveCloud/GetSharedItemInfo?code=${code}`,
  {
    key: `shared-item-${code}`
  }
);

const error = computed(() => {
  if (!fetchError.value) return '';
  if (fetchError.value.statusCode === 404) return 'Shared item not found';
  if (fetchError.value.statusCode === 410) return 'This share link expired';
  return 'Failed to load the shared item';
});

const isFolder = computed(() => sharedItem.value?.ItemType === 'Folder');
const sharedEntries = computed(() => Array.isArray(sharedItem.value?.Children) ? sharedItem.value.Children : []);
const sharedFiles = computed(() => sharedEntries.value.filter((entry) => entry.ItemType === 'File'));
const sharedFolders = computed(() => sharedEntries.value.filter((entry) => entry.ItemType === 'Folder'));
const descriptionText = computed(() => {
  if (!sharedItem.value) {
    return '';
  }

  if (isFolder.value) {
    const folderCount = sharedFolders.value.length;
    return `This link exposes ${sharedFiles.value.length} files${folderCount ? ` across ${folderCount} nested folders` : ''}.`;
  }

  return 'This file was shared directly from KliveCloud and can be downloaded without signing in.';
});
const metricText = computed(() => isFolder.value ? `${sharedFiles.value.length} files` : formatSize(sharedItem.value?.FileSizeBytes ?? 0));

if (sharedItem.value) {
  const item = sharedItem.value;
  const description = item.ItemType === 'Folder'
    ? `Shared KliveCloud folder with ${item.Children?.length || 0} entries.`
    : `Shared via KliveCloud • ${formatSize(item.FileSizeBytes)}`;

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
  overflow: hidden;
  padding: 32px 18px;
  background: linear-gradient(180deg, #09110a 0%, #030503 100%);
  color: #f4fff0;
}

.shared-backdrop {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at top left, rgba(77, 158, 57, 0.18), transparent 32%),
    radial-gradient(circle at bottom right, rgba(255, 255, 255, 0.06), transparent 28%),
    linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
  background-size: auto, auto, 48px 48px, 48px 48px;
  opacity: 0.8;
  pointer-events: none;
}

.shared-card {
  position: relative;
  z-index: 1;
  width: min(1080px, 100%);
  margin: 0 auto;
  border-radius: 28px;
  border: 1px solid rgba(77, 158, 57, 0.14);
  background: rgba(8, 12, 9, 0.92);
  box-shadow: 0 28px 72px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(18px);
}

.state-card {
  max-width: 520px;
  padding: 40px 32px;
  text-align: center;
}

.content-card {
  padding: 28px;
  display: grid;
  gap: 24px;
}

.error-card {
  border-color: rgba(239, 68, 68, 0.22);
}

.state-icon {
  width: 72px;
  height: 72px;
  margin: 0 auto 18px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.28);
  color: #ffc6c6;
  font-size: 2rem;
  font-weight: 700;
}

.loading-spinner {
  width: 54px;
  height: 54px;
  margin: 0 auto 18px;
  border-radius: 50%;
  border: 4px solid rgba(77, 158, 57, 0.18);
  border-top-color: #4d9e39;
  animation: spin 0.9s linear infinite;
}

.eyebrow {
  color: #86c96d;
  font-size: 0.74rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  margin-bottom: 10px;
}

.hero-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.hero-row h1 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 3.4rem);
  line-height: 1.02;
}

.hero-copy {
  margin: 12px 0 0;
  max-width: 48rem;
  color: #a8b7a3;
  line-height: 1.6;
}

.hero-metrics {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.metric-chip,
.folder-pill,
.entry-type-chip {
  display: inline-flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid rgba(77, 158, 57, 0.22);
  background: rgba(77, 158, 57, 0.1);
  color: #d7ffd0;
  font-size: 0.76rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.metric-chip-warning {
  border-color: rgba(217, 119, 6, 0.26);
  background: rgba(217, 119, 6, 0.12);
  color: #ffd8a8;
}

.file-layout,
.folder-layout {
  display: grid;
  gap: 22px;
}

.file-layout {
  grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
  align-items: stretch;
}

.preview-panel,
.details-panel,
.folder-summary,
.folder-list {
  border-radius: 22px;
  border: 1px solid rgba(77, 158, 57, 0.12);
  background: rgba(255, 255, 255, 0.028);
}

.preview-panel {
  min-height: 340px;
  display: grid;
  place-items: center;
  padding: 18px;
}

.preview-img,
.preview-video {
  width: 100%;
  max-height: 520px;
  object-fit: contain;
  border-radius: 16px;
  background: #000;
}

.file-glyph {
  width: 160px;
  height: 160px;
  border-radius: 28px;
  display: grid;
  place-items: center;
  background: rgba(77, 158, 57, 0.1);
  border: 1px solid rgba(77, 158, 57, 0.2);
  color: #d7ffd0;
  font-size: 2rem;
  letter-spacing: 0.22em;
}

.details-panel,
.folder-list {
  padding: 18px;
}

.detail-grid,
.folder-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.detail-card {
  padding: 14px;
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.detail-card span {
  display: block;
  color: #86c96d;
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.detail-card strong {
  color: #f4fff0;
  font-size: 0.95rem;
  line-height: 1.4;
}

.download-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 46px;
  border-radius: 16px;
  text-decoration: none;
  background: linear-gradient(180deg, #4d9e39 0%, #2d6f20 100%);
  border: 1px solid rgba(133, 222, 110, 0.42);
  color: #f3fff0;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  margin-top: 16px;
}

.download-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 28px rgba(26, 74, 17, 0.24);
}

.compact-download {
  min-width: 132px;
  min-height: 40px;
  margin-top: 0;
}

.folder-list {
  display: grid;
  gap: 12px;
}

.folder-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  border-radius: 18px;
  background: rgba(0, 0, 0, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.folder-entry.folder {
  border-color: rgba(77, 158, 57, 0.16);
  background: rgba(77, 158, 57, 0.06);
}

.entry-copy {
  min-width: 0;
}

.entry-name-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.entry-name {
  color: #ffffff;
  font-size: 1rem;
  font-weight: 700;
  word-break: break-word;
}

.entry-path,
.entry-meta,
.state-card p,
.state-card h2 + p {
  color: #9ead98;
}

.entry-path {
  margin-top: 6px;
  font-size: 0.84rem;
  word-break: break-all;
}

.entry-meta {
  margin-top: 8px;
  font-size: 0.8rem;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.separator {
  color: #5b6758;
}

.empty-folder-state {
  padding: 18px;
  border-radius: 18px;
  border: 1px dashed rgba(77, 158, 57, 0.2);
  text-align: center;
  color: #9ead98;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 860px) {
  .content-card {
    padding: 20px;
  }

  .hero-row,
  .folder-entry {
    flex-direction: column;
    align-items: flex-start;
  }

  .file-layout {
    grid-template-columns: 1fr;
  }

  .detail-grid,
  .folder-summary {
    grid-template-columns: 1fr;
  }

  .hero-metrics {
    justify-content: flex-start;
  }

  .compact-download {
    width: 100%;
  }
}
</style>