<template>
  <div class="shared-file-page">
    <div v-if="loading" class="loading-state">
      <div class="loading-spinner"></div>
      <p>Loading file information...</p>
    </div>

    <div v-else-if="error" class="error-state">
      <h1>⚠️</h1>
      <h3>{{ error }}</h3>
      <p>The link might be invalid or expired.</p>
    </div>

    <div v-else-if="fileInfo" class="file-card">
      <div class="file-icon">
        <template v-if="fileInfo.IsImage">
            <img :src="downloadUrl" class="preview-img" alt="Preview"/>
        </template>
        <template v-else-if="fileInfo.IsVideo">
             <video controls :src="downloadUrl" class="preview-video"></video>
        </template>
        <template v-else>
            {{ getIcon(fileInfo.Name) }}
        </template>
      </div>
      
      <div class="file-details">
        <h2 class="file-name">{{ fileInfo.Name }}</h2>
        <div class="meta-info">
            <span class="file-size">{{ formatSize(fileInfo.FileSizeBytes) }}</span>
            <span class="separator">•</span>
            <span class="file-date">Created: {{ formatDate(fileInfo.CreatedDate) }}</span>
            <template v-if="fileInfo.ExpirationDate">
                <span class="separator">•</span> 
                <span class="expiry">Expires: {{ formatDate(fileInfo.ExpirationDate) }}</span>
            </template>
        </div>
        
        <a :href="downloadUrl" class="download-btn">
            Download File
        </a>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import Swal from 'sweetalert2';
import { KliveAPIUrl, RequestGETFromKliveAPI } from '~/scripts/APIInterface';

definePageMeta({
    layout: 'empty' // minimal layout
});

interface SharedFileInfo {
    ItemID: string;
    Name: string;
    ItemType: 'File' | 'Folder';
    FileSizeBytes: number;
    CreatedDate: string;
    ModifiedDate: string;
    IsImage: boolean;
    IsVideo: boolean;
    ShareCode: string;
    ExpirationDate?: string | null;
}

const route = useRoute();
const code = route.params.code as string;

const getIcon = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'pdf': return '📕';
    case 'jpg':
    case 'jpeg':
    case 'png': return '🖼️';
    case 'txt':
    case 'md': return '📝';
    case 'zip':
    case 'rar': return '📦';
    case 'mp3': return '🎵';
    case 'mp4': return '🎬';
    case 'exe': return '⚙️';
    default: return '📄';
  }
};

const formatSize = (bytes: number) => {
  if (bytes === 0) return 'Unknown Size';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
};

const downloadUrl = computed(() => {
    return `${KliveAPIUrl}/KliveCloud/DownloadShared?code=${code}`;
});

// Use SSR-compatible fetch
const { data: fileInfo, pending: loading, error: fetchError } = await useFetch<SharedFileInfo>(
    `${KliveAPIUrl}/KliveCloud/GetSharedItemInfo?code=${code}`,
    {
        key: `shared-file-${code}`,
        onResponseError({ response }) {
             // We can map status here if needed, but error object handles it
        }
    }
);

const error = computed(() => {
    if (!fetchError.value) return '';
    if (fetchError.value.statusCode === 404) return 'File not found or link deleted.';
    if (fetchError.value.statusCode === 410) return 'Link expired.';
    return 'Failed to retrieve file info.';
});

const fileName = computed(() => fileInfo.value?.Name || 'Shared File');
const isImage = computed(() => fileInfo.value?.IsImage || false);
const isVideo = computed(() => fileInfo.value?.IsVideo || false);

// Inject Meta Tags for Discord/Social Embeds
if (fileInfo.value) {
    const rawUrl = downloadUrl.value;
    const item = fileInfo.value;
    
    const baseMeta = {
        title: item.Name,
        description: `Shared via KliveCloud • ${formatSize(item.FileSizeBytes)}`,
        ogTitle: item.Name,
        ogDescription: `Download or view ${item.Name} on KliveCloud`,
        ogSiteName: 'KliveCloud',
        themeColor: '#4CAF50',
    };

    if (isImage.value) {
        useServerSeoMeta({
            ...baseMeta,
            ogType: 'website',
            ogImage: rawUrl,
            twitterCard: 'summary_large_image',
            twitterImage: rawUrl
        });
    } else if (isVideo.value) {
        useServerSeoMeta({
            ...baseMeta,
            ogType: 'video.other',
            ogVideo: rawUrl,
            ogVideoType: 'video/mp4',
            ogVideoWidth: 1280,
            ogVideoHeight: 720,
            twitterCard: 'player',
            twitterPlayer: rawUrl,
            twitterPlayerWidth: 1280,
            twitterPlayerHeight: 720
        });
    } else {
        useServerSeoMeta(baseMeta);
    }
}


</script>

<style scoped>
.shared-file-page {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    background-color: #1a1a1a;
    color: #fff;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.file-card {
    background: #2d2d2d;
    padding: 40px;
    border-radius: 12px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    text-align: center;
    max-width: 400px;
    width: 90%;
}

.file-icon {
    font-size: 80px;
    margin-bottom: 20px;
    height: 150px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.preview-img, .preview-video {
    max-width: 100%;
    max-height: 100%;
    border-radius: 8px;
    box-shadow: 0 4px 10px rgba(0,0,0,0.3);
}

.preview-video {
    width: 100%;
    background: #000;
}

.file-name {
    margin: 10px 0;
    font-size: 1.5rem;
    word-break: break-all;
}

.meta-info {
    color: #888;
    font-size: 0.9rem;
    margin-bottom: 30px;
}

.download-btn {
    display: inline-block;
    background: #4CAF50;
    color: white;
    text-decoration: none;
    padding: 12px 24px;
    font-size: 1.1rem;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.2s, transform 0.1s;
    width: 100%;
    font-weight: bold;
    box-sizing: border-box;
}

.download-btn:hover {
    background: #45a049;
    transform: translateY(-2px);
}

.download-btn:active {
    transform: translateY(0);
}

.error-state {
    text-align: center;
}

.loading-spinner {
  width: 50px;
  height: 50px;
  border: 5px solid #333;
  border-top: 5px solid #4CAF50;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 20px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>