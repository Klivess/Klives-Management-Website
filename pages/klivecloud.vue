<template>
  <div class="klive-cloud-page">
    <!-- Header Section -->
    <div class="page-header">
      <div class="header-content">
        <div>
          <h1 class="page-title">KliveCloud</h1>
          <p class="page-subtitle">File Storage & Management</p>
        </div>
        
        <!-- Drive Capacity Widget -->
        <div v-if="driveInfo" class="drive-capacity">
            <div class="capacity-labels">
                <span>{{ driveInfo.DriveName }} ({{ driveInfo.DriveFormat }})</span>
                <span>{{ driveInfo.UsedCapacityGB.toFixed(2) }} GB / {{ driveInfo.TotalCapacityGB.toFixed(2) }} GB</span>
            </div>
            <div class="progress-bar-container">
                <div 
                    class="progress-bar-fill" 
                    :style="{ width: driveInfo.UsagePercentage + '%' }"
                    :class="{ 'high-usage': driveInfo.UsagePercentage > 80, 'critical-usage': driveInfo.UsagePercentage > 90 }"
                ></div>
            </div>
        </div>
        <div v-else class="drive-capacity loading-capacity">
            <span>Loading Storage Info...</span>
        </div>
      </div>
    </div>

    <!-- Navigation / Breadcrumbs & Actions -->
    <div class="cloud-controls">
      <div class="breadcrumbs">
        <span
          class="breadcrumb-item"
          @click="navigateToRoot"
          :class="{ active: currentPath.length === 0 }"
        >
          Root
        </span>
        <span v-for="(folder, index) in currentPath" :key="folder.ItemID">
          <span class="breadcrumb-separator">/</span>
          <span
            class="breadcrumb-item"
            @click="navigateToFolder(folder, index)"
            :class="{ active: index === currentPath.length - 1 }"
          >
            {{ folder.Name }}
          </span>
        </span>
      </div>

      <div class="actions">
        <!-- New Bulk Actions -->
        <template v-if="selectedItems.size > 0">
            <button class="action-btn delete-btn" @click="deleteSelectedItems">
                🗑️ Delete ({{ selectedItems.size }})
            </button>
            <button class="action-btn download-btn" @click="downloadSelectedItems">
                ⬇️ Download ({{ selectedItems.size }})
            </button>
            <div class="separator">|</div>
        </template>

        <select v-model="selectedPermission" class="permission-select" title="Set permission for new uploads/folders">
            <option :value="0">Anybody (0)</option>
            <option :value="1">Guest (1)</option>
            <option :value="2">Manager (2)</option>
            <option :value="3">Associate (3)</option>
            <option :value="4">Admin (4)</option>
            <option :value="5">Klives (5)</option>
        </select>

        <button class="action-btn upload-btn" @click="triggerFileUpload">
          📄 Upload File
        </button>
        <button class="action-btn folder-btn" @click="promptCreateFolder">
          📁 New Folder
        </button>
        <input
          type="file"
          ref="fileInput"
          style="display: none"
          multiple
          @change="handleFileUpload"
        />
        <button class="action-btn refresh-btn" @click="refreshCurrentFolder">
          🔄 Refresh
        </button>
      </div>
    </div>

    <!-- Content Area -->
    <div 
      class="cloud-content"
      ref="cloudContentRef"
      @mousedown="startSelection"
      @dragover.prevent="onDragOver"
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
      :class="{ 'drag-active': isDragging }"
    >
      <!-- Selection Box -->
      <div 
        v-if="selectionBox.active" 
        class="selection-box"
        :style="{
          left: selectionBox.x + 'px',
          top: selectionBox.y + 'px',
          width: selectionBox.width + 'px',
          height: selectionBox.height + 'px'
        }"
      ></div>

      <!-- Drag Overlay -->
      <div v-if="isDragging" class="drag-overlay">
        <div class="drag-message">
          <div class="drag-icon">📂</div>
          <h3>Drop files to upload</h3>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="loading-state">
        <div class="loading-spinner"></div>
        <p>Loading files...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="error-state">
        <p>⚠️ {{ error }}</p>
        <button @click="refreshCurrentFolder">Try Again</button>
      </div>

      <!-- Empty State -->
      <div v-else-if="items.length === 0" class="empty-state">
        <p>This folder is empty.</p>
      </div>

      <!-- File List -->
      <div v-else class="file-grid">
        <!-- Back Button (if not root) -->
        <div
          v-if="currentPath.length > 0"
          class="file-item folder-item back-item"
          @click="navigateUp"
        >
          <div class="item-icon">⤴️</div>
          <div class="item-name">..</div>
        </div>

        <!-- Items -->
        <div
          v-for="item in items"
          :key="item.ItemID"
          class="file-item"
          :class="{
            'folder-item': item.ItemType === 'Folder', 
            'file-card': item.ItemType !== 'Folder',
            'selected': selectedItems.has(item.ItemID)
          }"
          :ref="(el) => setItemRef(el, item.ItemID)"
          @click.stop="handleItemClick(item, $event)"
          @contextmenu.prevent="showContextMenu($event, item)"
        >
          <div class="item-icon">
            {{ getItemIcon(item) }}
          </div>
          <div class="item-details">
            <div class="item-name" :title="item.Name">{{ item.Name }}</div>
            <div class="item-meta">
              <span v-if="item.ItemType === 'File'">{{ formatSize(item.FileSizeBytes) }}</span>
              <span v-else>{{ item.ItemType }}</span>
              <span class="separator">•</span>
              <span>{{ formatDate(item.ModifiedDate) }}</span>
            </div>
            <div class="item-perm" @click.stop="promptChangePermission(item)" title="Click to change permission" style="cursor: pointer;">
                🔒 {{ item.MinimumPermissionLevel }}
            </div>
          </div>
          <div class="item-actions-hover">
            <button
                v-if="item.ItemType === 'File'"
                @click.stop="downloadFile(item)"
                title="Download"
            >
                ⬇️
            </button>
            <button @click.stop="deleteItem(item)" title="Delete" class="delete-btn">
                🗑️
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import Swal from 'sweetalert2';
import {
  RequestGETFromKliveAPI,
  RequestPOSTFromKliveAPI,
  KliveAPIUrl,
  KMPermissions
} from '~/scripts/APIInterface';

definePageMeta({ layout: 'navbar' });

// Types
interface CloudItem {
  ItemID: string;
  Name: string;
  RelativePath: string;
  ParentFolderID: string;
  CreatedDate: string;
  ModifiedDate: string;
  CreatedByUserID: string;
  ItemType: 'Folder' | 'File';
  MinimumPermissionLevel: string;
  FileSizeBytes: number;
}

interface DriveInfo {
    DriveName: string;
    TotalCapacityBytes: number;
    UsedCapacityBytes: number;
    FreeCapacityBytes: number;
    TotalCapacityGB: number;
    UsedCapacityGB: number;
    FreeCapacityGB: number;
    UsagePercentage: number;
    DriveFormat: string;
}

// State
const items = ref<CloudItem[]>([]);
const currentPath = ref<CloudItem[]>([]); // Breadcrumb trail (folders)
const loading = ref(false);
const error = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
const passwordCookie = useCookie('password');
const isDragging = ref(false);
const selectedPermission = ref(1);
const driveInfo = ref<DriveInfo | null>(null);

// Selection State
const selectedItems = ref(new Set<string>());
const selectionBox = ref({ x: 0, y: 0, width: 0, height: 0, active: false });
const dragStart = { x: 0, y: 0 };
// Store initial selection state when drag starts to support correct toggling/restoring
const initialSelection = new Set<string>();
const itemRefs = new Map<string, HTMLElement>();
const cloudContentRef = ref<HTMLElement | null>(null);

// Methods

const startSelection = (event: MouseEvent) => {
    // Ignore if clicking on an interactive element (button, input, item)
    if ((event.target as HTMLElement).closest('.file-item') || 
        (event.target as HTMLElement).closest('button') || 
        (event.target as HTMLElement).closest('input') ||
        (event.target as HTMLElement).closest('select')) {
        return;
    }
    
    // Only left click
    if (event.button !== 0) return;

    // Store initial state for correct toggling/restoring
    initialSelection.clear();
    selectedItems.value.forEach(id => initialSelection.add(id));

    // Clear previous selection if not holding Ctrl/Shift
    if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
        selectedItems.value.clear();
        // Since we cleared, initial effective selection for this drag is empty
        // Wait, standard behavior:
        // No modifier: Start fresh.
        // Ctrl: Add/Toggle.
        // Shift: Add/Range.
        // So for no modifier, initialSelection (context for this drag) is EMPTY.
        initialSelection.clear();
    }

    selectionBox.value.active = true;
    dragStart.x = event.clientX; // Use clientX/Y for relative calculations
    dragStart.y = event.clientY;
    
    // Set initial box (width/height 0)
    updateSelectionBoxDisplay(event.clientX, event.clientY);

    document.addEventListener('mousemove', updateSelection);
    document.addEventListener('mouseup', endSelection);
};

const updateSelection = (event: MouseEvent) => {
    if (!selectionBox.value.active) return;
    updateSelectionBoxDisplay(event.clientX, event.clientY);
};

const updateSelectionBoxDisplay = (clientX: number, clientY: number) => {
    if (!cloudContentRef.value) return;
    
    const rect = cloudContentRef.value.getBoundingClientRect();
    
    // Calculate relative coordinates within the container
    const relativeStartX = dragStart.x - rect.left;
    const relativeStartY = dragStart.y - rect.top;
    const relativeCurrentX = clientX - rect.left;
    const relativeCurrentY = clientY - rect.top;

    // Determine top-left and width/height
    const x = Math.min(relativeStartX, relativeCurrentX);
    const y = Math.min(relativeStartY, relativeCurrentY);
    const width = Math.abs(relativeCurrentX - relativeStartX);
    const height = Math.abs(relativeCurrentY - relativeStartY);

    selectionBox.value = {
        x, y, width, height, active: true
    };
    
    // Check intersection (we can use client coordinates directly for this separately)
    checkIntersections(clientX, clientY);
};

const endSelection = (event: MouseEvent) => {
    selectionBox.value.active = false;
    document.removeEventListener('mousemove', updateSelection);
    document.removeEventListener('mouseup', endSelection);
};

const checkIntersections = (currentClientX: number, currentClientY: number) => {
    // Current selection rect in Client coordinates (viewport)
    const boxRect = {
        left: Math.min(dragStart.x, currentClientX),
        top: Math.min(dragStart.y, currentClientY),
        right: Math.max(dragStart.x, currentClientX),
        bottom: Math.max(dragStart.y, currentClientY)
    };

    items.value.forEach(item => {
        const el = itemRefs.get(item.ItemID);
        if (el) {
            const itemRect = el.getBoundingClientRect();
            // Use Client coordinates (viewport) consistently
            const intersects = !(
                boxRect.right < itemRect.left ||
                boxRect.left > itemRect.right ||
                boxRect.bottom < itemRect.top ||
                boxRect.top > itemRect.bottom
            );

            if (intersects) {
                selectedItems.value.add(item.ItemID);
            } else {
                // If not intersecting, revert to initial state
                if (initialSelection.has(item.ItemID)) {
                    selectedItems.value.add(item.ItemID);
                } else {
                    selectedItems.value.delete(item.ItemID);
                }
            }
        }
    });
};

const setItemRef = (el: Element | ComponentPublicInstance | null, id: string) => {
    if (el) {
        itemRefs.set(id, el as HTMLElement);
    } else {
        itemRefs.delete(id);
    }
};

const getCurrentFolderID = () => {
  return currentPath.value.length > 0
    ? currentPath.value[currentPath.value.length - 1].ItemID
    : '';
};

// --- API Calls ---

const fetchDriveInfo = async () => {
    try {
        const response = await RequestGETFromKliveAPI('/KliveCloud/GetDriveInfo');
        if (response.ok) {
            driveInfo.value = await response.json();
        } else {
             console.error('Failed to fetch drive info:', await response.text());
        }
    } catch (e) { console.error(e); }
};

const fetchItems = async (folderID: string = '') => {
  loading.value = true;
  error.value = '';
  try {
    const url = folderID
      ? `/KliveCloud/ListItems?folderID=${folderID}`
      : '/KliveCloud/ListItems';
    
    // Using the existing API interface
    const response = await RequestGETFromKliveAPI(url);
    
    if (response.ok) {
      const data = await response.json();
      items.value = data;
    } else {
      const text = await response.text();
      error.value = `Failed to load items: ${text}`;
      console.error('Fetch items failed:', text);
    }
  } catch (e: any) {
    error.value = `Error: ${e.message}`;
    console.error(e);
  } finally {
    loading.value = false;
  }
};

const createFolder = async (name: string) => {
  const parentID = getCurrentFolderID();
  const params = new URLSearchParams({
    name: name,
    permissionLevel: selectedPermission.value.toString()
  });
  if (parentID) {
    params.append('parentFolderID', parentID);
  }

  const query = `/KliveCloud/CreateFolder?${params.toString()}`;
  
  try {
    const response = await RequestPOSTFromKliveAPI(query);
    if (response.ok) {
      Swal.fire({
          icon: 'success',
          title: 'Folder Created',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
      });
      refreshCurrentFolder();
    } else {
      const text = await response.text();
      Swal.fire('Error', `Failed to create folder: ${text}`, 'error');
    }
  } catch (e: any) {
    Swal.fire('Error', e.message, 'error');
  }
};

const deleteItemAPI = async (itemID: string) => {
    try {
        const response = await RequestPOSTFromKliveAPI(`/KliveCloud/DeleteItem?itemID=${itemID}`);
        if(response.ok) {
            Swal.fire({
                icon: 'success',
                title: 'Item Deleted',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000
            });
            refreshCurrentFolder();
        } else {
            const text = await response.text();
             Swal.fire('Error', `Failed to delete: ${text}`, 'error');
        }
    } catch (e: any) {
        Swal.fire('Error', e.message, 'error');
    }
}

// We need a custom upload function because RequestPOSTFromKliveAPI assumes string body usually (based on my read, but let's see if we can reuse or need raw fetch)
// The docs says "The raw file bytes must be sent as the request body."
// RequestPOSTFromKliveAPI takes `content` which is passed to body. If I pass a Blob/File, fetch handles it.
const uploadFileAPI = async (file: File) => {
    const parentID = getCurrentFolderID();
    const params = new URLSearchParams({
        fileName: file.name,
        permissionLevel: selectedPermission.value.toString()
    });
    if (parentID) params.append('parentFolderID', parentID);

    // Use manual fetch for file upload
    const password = passwordCookie.value || '';

    const query = `/KliveCloud/UploadFile?${params.toString()}`;
    
    // Show uploading swal
    Swal.fire({
        title: 'Uploading...',
        text: 'Please wait while your file is being uploaded',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    try {
        // Prepare array buffer from file to ensure raw bytes are sent
        // const buffer = await file.arrayBuffer(); // No longer needed
        
        // Use RequestPOSTFromKliveAPI which handles authorization and error checking.
        // We pass the File object directly as body. Fetch API handles File objects by streaming them.
        // We do NOT set/override Content-Type here, letting the browser set it based on the file.
        // This avoids issues where manual Content-Type might conflict with browser's handling of File body.
        
        const response = await RequestPOSTFromKliveAPI(query, file);
        
        if (response.ok) {
            Swal.close();
            Swal.fire({
                icon: 'success',
                title: 'File Uploaded',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000
            });
            refreshCurrentFolder();
        } else {
            const text = await response.text();
            Swal.close();
            Swal.fire('Error', `Upload failed: ${text}`, 'error');
        }
    } catch (e: any) {
        Swal.close();
        Swal.fire('Error', e.message, 'error');
    }
};

const downloadFileAPI = async (item: CloudItem) => {
    try {
         // Using RequestGETFromKliveAPI
        const response = await RequestGETFromKliveAPI(`/KliveCloud/DownloadFile?itemID=${item.ItemID}`, false, true);
        
        if (!response.ok) {
             const text = await response.text();
             Swal.fire('Download Error', text, 'error');
             return;
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = item.Name;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

    } catch (e: any) {
        Swal.fire('Error', e.message, 'error');
    }
}


// --- Navigation Actions ---

const refreshCurrentFolder = () => {
  fetchItems(getCurrentFolderID());
};

const navigateToRoot = () => {
  currentPath.value = [];
  fetchItems();
};

const navigateToFolder = (folder: CloudItem, index: number) => {
  // Slice the path up to this folder
  currentPath.value = currentPath.value.slice(0, index + 1);
  fetchItems(folder.ItemID);
};

const navigateUp = () => {
    if (currentPath.value.length > 0) {
        currentPath.value.pop();
        fetchItems(getCurrentFolderID());
    }
}

const handleItemClick = (item: CloudItem, event?: MouseEvent) => {
  // Check for selection modifiers if event is present
  if (event && (event.ctrlKey || event.metaKey || event.shiftKey)) {
      if (event.ctrlKey || event.metaKey) {
          // Toggle selection
          if (selectedItems.value.has(item.ItemID)) {
              selectedItems.value.delete(item.ItemID);
          } else {
              selectedItems.value.add(item.ItemID);
          }
      } else if (event.shiftKey) {
          // Range selection (simplified: select all between last selected and this one)
          // Find index of current item
          const currentIndex = items.value.findIndex(i => i.ItemID === item.ItemID);
          // Find index of last selected (approximation: first found)
          let lastIndex = -1;
          // Ideally we track last clicked item
          // For now, let's just find the first selected item in the list
          const firstSelected = items.value.findIndex(i => selectedItems.value.has(i.ItemID));
          
          if (firstSelected !== -1 && currentIndex !== -1) {
              const start = Math.min(firstSelected, currentIndex);
              const end = Math.max(firstSelected, currentIndex);
              for (let i = start; i <= end; i++) {
                  selectedItems.value.add(items.value[i].ItemID);
              }
          } else {
              selectedItems.value.add(item.ItemID);
          }
      }
      return; // Stop further action (don't open folder/preview)
  }

  // Normal click
  // If we have a selection active, maybe clear it?
  // Standard explorer behavior: clicking an item selects it and clears others
  if (selectedItems.value.size > 0 && !selectedItems.value.has(item.ItemID)) {
      selectedItems.value.clear();
      selectedItems.value.add(item.ItemID);
      // Wait, if it's a folder, we might want to open it on double click?
      // Single click usually just selects.
      // But the current implementation is "Click to open".
      // Let's keep "Click to open" behavior for folders, but maybe add a "selection mode" toggle?
      // Or: Click selects. Double Click opens.
      // Modifying interaction model is risky without user consent.
      // Current behavior: Click -> Navigate/Action.
      // Proposed: Click -> Select. Double Click -> Navigate.
      // Or: Checkbox / Box select -> Selection Mode.
      
      // Let's implement: Click = Navigate (original behavior). 
      // Selection is done via Drag or Ctrl/Shift+Click.
      // If user clicks normally without modifier, we do the original action AND clear selection?
      selectedItems.value.clear();
  } else if (selectedItems.value.has(item.ItemID) && selectedItems.value.size > 1) {
       // Clicking one of many selected items -> Select just this one
       selectedItems.value.clear();
       selectedItems.value.add(item.ItemID);
       // And process action...
  }

  if (item.ItemType === 'Folder') {
    // Navigate into folder
    currentPath.value.push(item);
    fetchItems(item.ItemID);
    selectedItems.value.clear(); // Clear selection on navigation
  } else {
    // Maybe preview or details? For now ask if download
    Swal.fire({
        title: item.Name,
        html: `
            <p>Size: ${formatSize(item.FileSizeBytes)}</p>
            <p>Created: ${formatDate(item.CreatedDate)}</p>
            <p>Type: ${item.ItemType}</p>
        `,
        showCancelButton: true,
        confirmButtonText: 'Download',
        cancelButtonText: 'Close'
    }).then((result) => {
        if(result.isConfirmed) {
            downloadFileAPI(item);
        }
    });

  }
};

const downloadFile = (item: CloudItem) => {
    downloadFileAPI(item);
};

const deleteItem = (item: CloudItem) => {
    Swal.fire({
        title: 'Are you sure?',
        text: `Do you really want to delete "${item.Name}"? This cannot be undone.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
        if (result.isConfirmed) {
            deleteItemAPI(item.ItemID);
        }
    })
};

const deleteSelectedItems = async () => {
    const list = Array.from(selectedItems.value);
    if (list.length === 0) return;

    Swal.fire({
        title: 'Delete Selected?',
        text: `Are you sure you want to delete ${list.length} item(s)? This cannot be undone.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Yes, delete all!'
    }).then(async (result) => {
        if (result.isConfirmed) {
            let successCount = 0;
            // Maybe show progress?
            for (const id of list) {
                try {
                    const response = await RequestPOSTFromKliveAPI(`/KliveCloud/DeleteItem?itemID=${id}`);
                    if (response.ok) successCount++;
                } catch (e) { console.error(e); }
            }
            Swal.fire('Deleted!', `${successCount} items deleted.`, 'success');
            selectedItems.value.clear();
            refreshCurrentFolder();
        }
    });
};

const downloadSelectedItems = async () => {
    const list = Array.from(selectedItems.value);
    if (list.length === 0) return;

    // Filter only files (cannot download folder as blob directly unless API supports zip)
    const filesToDownload = items.value.filter(i => list.includes(i.ItemID) && i.ItemType === 'File');
    
    if (filesToDownload.length === 0) {
        Swal.fire('Info', 'Selected items contain no downloadable files.', 'info');
        return;
    }

    if (filesToDownload.length > 5) {
        const confirm = await Swal.fire({
            title: 'Download Limit',
            text: `You are about to download ${filesToDownload.length} files. Browser might block multiple popups. Continue?`,
            showCancelButton: true
        });
        if (!confirm.isConfirmed) return;
    }

    // Trigger downloads with slight delay
    filesToDownload.forEach((item, index) => {
        setTimeout(() => {
            downloadFileAPI(item);
        }, index * 500);
    });
};

// --- UI Helpers ---

const getItemIcon = (item: CloudItem) => {
  if (item.ItemType === 'Folder') return '📁';
  const ext = item.Name.split('.').pop()?.toLowerCase();
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
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString() + ' ' + new Date(dateStr).toLocaleTimeString();
};

const triggerFileUpload = () => {
    fileInput.value?.click();
};

const handleFileUpload = (event: Event) => {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
        // Handle multiple files if multiple attribute is set, or just one
        // The input currently doesn't have 'multiple', but we should support it in general logic
        Array.from(input.files).forEach(file => uploadFileAPI(file));
    }
    // reset input
    if(input) input.value = '';
};

// Drag and Drop
const onDragOver = (e: DragEvent) => {
    isDragging.value = true;
};

const onDragLeave = (e: DragEvent) => {
    // Only set to false if we're leaving the main container
    // This can be tricky with child elements, but a simple toggle often works for simple UIs
    // or checking relatedTarget
    if (e.relatedTarget && (e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
        return;
    }
    isDragging.value = false;
};

const onDrop = async (e: DragEvent) => {
    isDragging.value = false;
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
        // Upload all files
        for (let i = 0; i < files.length; i++) {
            await uploadFileAPI(files[i]);
        }
    }
};

const promptCreateFolder = async () => {
    const { value: folderName } = await Swal.fire({
        title: 'New Folder',
        input: 'text',
        inputLabel: 'Folder Name',
        showCancelButton: true,
        inputValidator: (value) => {
            if (!value) {
                return 'You need to write something!'
            }
        }
    });

    if (folderName) {
        createFolder(folderName);
    }
};

const promptChangePermission = async (item: CloudItem) => {
    const { value: permissionLevel } = await Swal.fire({
        title: 'Change Permission',
        input: 'select',
        inputOptions: {
            '0': 'Anybody (0)',
            '1': 'Guest (1)',
            '2': 'Manager (2)',
            '3': 'Associate (3)',
            '4': 'Admin (4)',
            '5': 'Klives (5)'
        },
        inputLabel: `Select new permission level for "${item.Name}"`,
        inputValue: getPermissionLevelValue(item.MinimumPermissionLevel),
        showCancelButton: true,
    });

    if (permissionLevel) {
        changePermissionAPI(item, parseInt(permissionLevel));
    }
};

const getPermissionLevelValue = (levelName: string): string => {
    const map: Record<string, string> = {
        'Anybody': '0',
        'Guest': '1',
        'Manager': '2',
        'Associate': '3',
        'Admin': '4',
        'Klives': '5'
    };
    return map[levelName] || '1';
};

const changePermissionAPI = async (item: CloudItem, newLevel: number) => {
    try {
        const query = `/KliveCloud/ChangeItemPermission?itemID=${item.ItemID}&permissionLevel=${newLevel}`;
        const response = await RequestPOSTFromKliveAPI(query);
        
        if (response.ok) {
            Swal.fire({
                icon: 'success',
                title: 'Permission Updated',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000
            });
            refreshCurrentFolder();
        } else {
             const text = await response.text();
             Swal.fire('Error', `Failed to update permission: ${text}`, 'error');
        }
    } catch (e: any) {
        Swal.fire('Error', e.message, 'error');
    }
}

const showContextMenu = (event: MouseEvent, item: CloudItem) => {
    // Implement custom context menu if desired, for now just log
    console.log('Context menu for', item.Name);
};

// Lifecycle
onMounted(() => {
  fetchItems();
  fetchDriveInfo();
});
</script>

<style scoped lang="scss">
.klive-cloud-page {
  padding: 20px;
  color: #fff;
  min-height: 80vh;
}

.page-header {
  margin-bottom: 20px;
  border-bottom: 1px solid #444;
  padding-bottom: 15px;

  .header-content {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 20px;
  }

  .drive-capacity {
    flex: 1;
    max-width: 400px;
    background: #2a2a2a;
    padding: 10px;
    border-radius: 6px;
    
    .capacity-labels {
      display: flex;
      justify-content: space-between;
      font-size: 0.8rem;
      color: #aaa;
      margin-bottom: 5px;
    }
    
    .progress-bar-container {
      background: #444;
      height: 8px;
      border-radius: 4px;
      overflow: hidden;
      
      .progress-bar-fill {
        background: #4CAF50;
        height: 100%;
        transition: width 0.5s ease;
        
        &.high-usage {
            background: #ebcb8b;
        }

        &.critical-usage {
            background: #bf616a;
        }
      }
    }
  }

  .page-title {
    font-size: 2rem;
    margin: 0;
    color: #4CAF50;
  }
  
  .page-subtitle {
    color: #aaa;
    margin: 5px 0 0;
  }
}

.cloud-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #2a2a2a;
  padding: 10px 15px;
  border-radius: 8px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 10px;
}

.breadcrumbs {
  flex: 1;
  font-size: 1.1rem;
  display: flex;
  align-items: center;
  flex-wrap: wrap;

  .breadcrumb-item {
    cursor: pointer;
    color: #88c0d0;
    &:hover {
      text-decoration: underline;
    }
    &.active {
      color: #eceff4;
      font-weight: bold;
      cursor: default;
      &:hover { text-decoration: none; }
    }
  }

  .breadcrumb-separator {
    margin: 0 8px;
    color: #666;
  }
}

.actions {
  display: flex;
  gap: 10px;

  .action-btn {
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    transition: background 0.2s;
    color: white;

    &.upload-btn {
      background-color: #5e81ac;
      &:hover { background-color: #81a1c1; }
    }

    &.folder-btn {
      background-color: #ebcb8b;
      color: #2e3440;
      &:hover { background-color: #f0dcaf; }
    }
    
    &.refresh-btn {
        background-color: #434c5e;
        &:hover { background-color: #4c566a; }
    }
  }
}

.permission-select {
    padding: 8px 12px;
    border-radius: 4px;
    background-color: #2e3440;
    color: #eceff4;
    border: 1px solid #4c566a;
    cursor: pointer;
    font-weight: bold;
    outline: none;

    &:hover {
        background-color: #3b4252;
    }
}

.cloud-content {
  background: #111; /* Very dark background for high contrast */
  border: 1px solid #333;
  border-left: 4px solid #4CAF50; /* Distinctive left border */
  border-radius: 8px;
  padding: 20px;
  min-height: 400px; /* Ensure height for dropping */
  position: relative; 
  box-shadow: inset 0 0 20px rgba(0,0,0,0.8);
  
  /* Prevent text selection during drag operations */
  user-select: none;
}

.loading-capacity {
    display: flex;
    align-items: center;
    justify-content: center;
    font-style: italic;
    color: #666;
    height: 38px; /* Match height of loaded widget approx */
}

/* Drag and Drop Styles */
.cloud-content.drag-active {
  background: #252525;
  outline: 2px dashed #4CAF50;
  outline-offset: -10px;
}

.drag-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100;
  border-radius: 8px;
  pointer-events: none; /* Let events fall through to container drop handler */
}

.drag-message {
  text-align: center;
  color: #4CAF50;
}

.drag-icon {
  font-size: 4rem;
  margin-bottom: 20px;
  min-height: 400px;
}

.file-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 15px;
}

.file-item {
  background: #2e2e2e;
  border: 1px solid #3e3e3e;
  border-radius: 6px;
  padding: 15px;
  cursor: pointer;
  transition: transform 0.1s, background 0.2s;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  position: relative;

  &:hover {
    background: #3a3a3a;
    transform: translateY(-2px);
    border-color: #4c566a;
    
    .item-actions-hover {
        opacity: 1;
    }
  }

  &.back-item {
    background: #252525;
    border-style: dashed;
    justify-content: center;
  }

  .item-icon {
    font-size: 3rem;
    margin-bottom: 10px;
  }

  .item-details {
    width: 100%;
    
    .item-name {
      font-weight: bold;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 5px;
    }
    
    .item-meta {
      font-size: 0.8rem;
      color: #888;
    }

    .item-perm {
        font-size: 0.7rem;
        color: #aaa;
        margin-top: 4px;
        background: #222;
        padding: 2px 6px;
        border-radius: 4px;
        display: inline-block;
    }

    .separator {
      margin: 0 4px;
    }
  }
  
  .item-actions-hover {
      position: absolute;
      top: 5px;
      right: 5px;
      opacity: 0;
      transition: opacity 0.2s;
      
      button {
          background: #444;
          border: none;
          color: white;
          padding: 5px;
          border-radius: 3px;
          cursor: pointer;
          margin-left: 2px;
          
          &:hover {
              background: #666;
          }

          &.delete-btn:hover {
              background: #bf616a;
          }
      }
  }
}

.loading-state, .error-state, .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  
  p { font-size: 1.2rem; color: #888; }
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #3b4252;
  border-top: 4px solid #88c0d0;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 15px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.selection-box {
  position: absolute;
  background: rgba(76, 175, 80, 0.2);
  border: 1px solid #4CAF50;
  pointer-events: none;
  z-index: 9999; /* Higher than file items */
}

.file-item.selected {
  border-color: #4CAF50;
  background-color: #3b4252;
  box-shadow: 0 0 8px rgba(76, 175, 80, 0.4);
}
</style>
