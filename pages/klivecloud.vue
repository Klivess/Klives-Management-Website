<template>
  <div ref="root" class="kcl" :data-size="size" data-testid="kcl-root" @dragenter="onDragEnter" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
    <!-- ── bar ── -->
    <header class="kcl-bar">
      <button class="kcl-iconbtn kcl-only-narrow" aria-label="Places and folders" @click="railOpen = !railOpen"><KliveCloudIcon name="menu" :size="17" /></button>
      <div class="kcl-bar__id">
        <span class="kcl-bar__mark"><KliveCloudIcon name="cloud" :size="17" /></span>
        <h1 class="kcl-bar__title">KliveCloud</h1>
        <span class="kcl-bar__sub" data-testid="kcl-subline">{{ subline }}</span>
      </div>

      <label class="kcl-search" data-testid="kcl-search">
        <KliveCloudIcon name="search" :size="15" />
        <input ref="searchInput" v-model="query" type="search" placeholder="Search every file and folder" aria-label="Search KliveCloud"
               autocomplete="off" spellcheck="false" data-testid="kcl-search-input" @keydown.esc.prevent="clearSearch" @keydown.down.prevent="focusFirstRow" />
        <span v-if="!query" class="kcl-kbd" aria-hidden="true">/</span>
        <button v-else class="kcl-iconbtn kcl-iconbtn--sm" aria-label="Clear search" @click="clearSearch"><KliveCloudIcon name="close" :size="13" /></button>
        <button class="kcl-btn kcl-btn--xs kcl-btn--ghost kcl-only-wide" title="Go to anything, run anything (Ctrl K)" aria-label="Open the command palette" data-testid="kcl-palette-open" @click="paletteOpen = true">
          <span class="kcl-kbd">Ctrl</span><span class="kcl-kbd">K</span>
        </button>
      </label>

      <span class="kcl-bar__spacer"></span>

      <div class="kcl-bar__actions">
        <div v-if="canAddHere" class="kcl-split kcl-pop">
          <button class="kcl-btn kcl-btn--primary" title="Upload files (U)" data-testid="kcl-upload" @click="pickFiles"><KliveCloudIcon name="upload" :size="15" /><span class="kcl-only-wide">Upload</span></button>
          <button class="kcl-btn kcl-btn--primary" aria-label="More ways to add" :aria-expanded="menu?.kind === 'add'" data-testid="kcl-add-menu" @click.stop="openAddMenu($event)"><KliveCloudIcon name="chevron-down" :size="14" /></button>
        </div>
        <button class="kcl-iconbtn" :title="`${reloading ? 'Refreshing…' : `Up to date${loadedAt ? ` (${fmtAgo(loadedAt)})` : ''}`} — refresh (R)`" aria-label="Refresh" data-testid="kcl-refresh" @click="refresh">
          <KliveCloudIcon name="refresh" :size="16" :class="{ 'kcl-spin': reloading }" />
        </button>
        <button class="kcl-iconbtn kcl-only-wide" :aria-pressed="prefs.sheet" title="Details (I)" aria-label="Show details" data-testid="kcl-details-toggle" @click="prefs.sheet = !prefs.sheet">
          <KliveCloudIcon name="panel-right" :size="16" />
        </button>
      </div>
      <input ref="fileInput" type="file" multiple hidden @change="onPicked($event, false)" />
      <input ref="folderInput" type="file" multiple webkitdirectory hidden @change="onPicked($event, true)" />
    </header>

    <div class="kcl-body" :data-sheet="sheetShown">
      <CloudRail :index="index" :view="view" :folder-key="folderKey" :can-links="allowed.share" :link-counts="linkCounts" :drive="drive" :drop-key="dropKey"
                 :now="now" :open="railOpen" @go="(v, key) => { railOpen = false; go(v, key ?? ROOT); }" />

      <main class="kcl-main" @click.self="clearPick">
        <div v-if="!allowed.browse" class="kcl-card">
          <div class="kcl-empty"><span class="kcl-empty__icon"><KliveCloudIcon name="lock" :size="18" /></span><strong>KliveCloud isn't part of your access</strong></div>
        </div>

        <div v-else-if="state === 'error'" class="kcl-card" role="alert">
          <div class="kcl-empty">
            <span class="kcl-empty__icon"><KliveCloudIcon name="alert" :size="18" /></span>
            <strong>Couldn't open your drive</strong>
            <span>{{ loadError }}</span>
            <button class="kcl-btn" @click="refresh"><KliveCloudIcon name="refresh" :size="14" />Try again</button>
          </div>
        </div>

        <!-- ── share links ── -->
        <CloudLinksView v-else-if="view === 'links'" :links="links" :index="index" :now="now" :origin="origin" :can-adopt="allowed.shareAny"
                        :supports-update="supports.updateLink" @copy="copyLink" @edit="link => (linkDialog = { item: null, link })"
                        @adopt="askAdopt" @remove="askRemoveLinks" @reveal="revealLink" />

        <!-- ── a folder, or a view across the drive ── -->
        <section v-else class="kcl-card" :aria-label="heading" data-testid="kcl-main-card" @click.self="clearPick">
          <header class="kcl-head" @click.self="clearPick">
            <nav v-if="view === 'folder'" class="kcl-crumbs" aria-label="Folder path" data-testid="kcl-crumbs">
              <button class="kcl-crumb" :aria-current="!folderKey ? 'page' : undefined" :data-drop="dropKey === ROOT || undefined" data-drop-key="" @click="go('folder', ROOT)">
                <KliveCloudIcon name="home" :size="13" />My drive
              </button>
              <template v-for="(step, i) in crumbs" :key="step.key">
                <KliveCloudIcon name="chevron-right" :size="12" class="kcl-crumb__sep" />
                <button class="kcl-crumb kcl-truncate" :aria-current="i === crumbs.length - 1 ? 'page' : undefined" :data-drop="dropKey === step.key || undefined"
                        :data-drop-key="step.key" :title="step.name" @click="go('folder', step.key)">{{ step.name }}</button>
              </template>
            </nav>

            <div class="kcl-head__row">
              <div class="kcl-head__title">
                <CloudGlyph v-if="view === 'folder'" kind="folder" :size="30" />
                <span v-else class="kcl-glyph" data-kind="other" style="--s: 30px; --kind: var(--kcl-accent)"><KliveCloudIcon :name="VIEW_ICON[view]" :size="16" /></span>
                <h2 data-testid="kcl-heading">{{ heading }}</h2>
                <span v-if="folderLinks.length" class="kcl-chip" data-tone="link" :title="`${folderLinks.length} share link${folderLinks.length === 1 ? '' : 's'} to this folder`"><KliveCloudIcon name="link" :size="10" />Shared by link</span>
                <span v-if="currentFolder && currentFolder.level === 'Viewer'" class="kcl-chip" title="You can open and download here, not change anything">View only</span>
              </div>
              <div class="kcl-head__tools">
                <div class="kcl-seg" role="group" aria-label="Layout">
                  <button class="kcl-seg__opt" :aria-pressed="prefs.layout === 'list'" title="List" aria-label="List" data-testid="layout-list" @click="prefs.layout = 'list'"><KliveCloudIcon name="list" :size="13" /></button>
                  <button class="kcl-seg__opt" :aria-pressed="prefs.layout === 'grid'" title="Grid" aria-label="Grid" data-testid="layout-grid" @click="prefs.layout = 'grid'"><KliveCloudIcon name="grid" :size="13" /></button>
                </div>
                <select v-if="prefs.layout === 'grid' && sortable" v-model="sortChoice" class="kcl-select" aria-label="Sort" style="height: 28px">
                  <option value="name:1">Name</option>
                  <option value="modified:-1">Newest first</option>
                  <option value="modified:1">Oldest first</option>
                  <option value="size:-1">Largest first</option>
                  <option value="kind:1">Kind</option>
                </select>
                <button v-if="view === 'folder' && canAddHere" class="kcl-btn kcl-btn--sm" title="New folder (N)" data-testid="kcl-new-folder" @click="askNewFolder"><KliveCloudIcon name="folder-plus" :size="14" /><span class="kcl-only-wide">New folder</span></button>
                <button v-if="view === 'folder' && currentFolder && allowed.share && currentFolder.level === 'Editor'" class="kcl-btn kcl-btn--sm" @click="shareLink(currentFolder)"><KliveCloudIcon name="link" :size="14" /><span class="kcl-only-wide">Share folder</span></button>
              </div>
            </div>

            <div v-if="picked.size" class="kcl-bulk" data-testid="kcl-bulk">
              <button class="kcl-iconbtn kcl-iconbtn--sm" title="Clear selection (Esc)" aria-label="Clear selection" @click="clearPick"><KliveCloudIcon name="close" :size="14" /></button>
              <span class="kcl-bulk__count">{{ picked.size }} selected</span>
              <span class="kcl-bulk__meta">{{ pickedSummary }}</span>
              <button v-if="picked.size < shown.length" class="kcl-btn kcl-btn--xs kcl-btn--ghost" @click="pickAll">Select all {{ shown.length }}</button>
              <span style="flex: 1"></span>
              <button v-if="allowed.download" class="kcl-btn kcl-btn--sm" data-testid="bulk-download" @click="downloadPicked"><KliveCloudIcon name="download" :size="14" /><span class="kcl-only-wide">{{ picked.size > 1 && view === 'folder' && folderKey ? 'ZIP' : 'Download' }}</span></button>
              <button v-if="pickedItems.length === 1 && allowed.share && pickedItems[0].level === 'Editor'" class="kcl-btn kcl-btn--sm" @click="shareLink(pickedItems[0])"><KliveCloudIcon name="link" :size="14" /><span class="kcl-only-wide">Link</span></button>
              <button v-if="canEditPicked && allowed.organize" class="kcl-btn kcl-btn--sm" data-testid="bulk-move" @click="moveItems = pickedItems"><KliveCloudIcon name="folder-move" :size="14" /><span class="kcl-only-wide">Move</span></button>
              <button v-if="canEditPicked && allowed.remove" class="kcl-btn kcl-btn--sm kcl-btn--danger" data-testid="bulk-delete" @click="askDelete(pickedItems)"><KliveCloudIcon name="trash" :size="14" /><span class="kcl-only-wide">Delete</span></button>
            </div>
            <div v-else class="kcl-head__facts" data-testid="kcl-facts">
              <template v-if="view === 'folder' && folderStats">
                <span v-if="folderStats.folders"><b>{{ folderStats.folders.toLocaleString('en-GB') }}</b> folder{{ folderStats.folders === 1 ? '' : 's' }}</span>
                <span><b>{{ folderStats.files.toLocaleString('en-GB') }}</b> file{{ folderStats.files === 1 ? '' : 's' }}</span>
                <span><b>{{ formatBytes(folderStats.bytes) }}</b></span>
                <span v-if="folderStats.newest">changed <b>{{ formatWhen(folderStats.newest, now) }}</b></span>
                <span v-if="currentFolder">access: <b>{{ currentFolder.access || '—' }}</b></span>
                <span v-if="hereDirect !== folderStats.files + folderStats.folders" class="kcl-faint">{{ hereDirect }} here, the rest in folders below</span>
              </template>
              <template v-else-if="view === 'search'"><span><b>{{ shown.length }}</b> match{{ shown.length === 1 ? '' : 'es' }} across the drive</span><span class="kcl-faint">Esc clears</span></template>
              <template v-else-if="view === 'recent'"><span>The newest {{ shown.length }} files anywhere on the drive</span></template>
              <template v-else-if="view === 'large'"><span><b>{{ formatBytes(shown.reduce((s, i) => s + i.bytes, 0)) }}</b> in these {{ shown.length }}</span><span v-if="index">of {{ formatBytes(index.bytes) }} in all</span></template>
              <template v-else-if="view === 'shared'"><span>Shared with you in folders you can't open</span></template>
            </div>
          </header>

          <div style="position: relative">
            <CloudListing :items="shown" :layout="prefs.layout" :sort="prefs.sort" :sortable="sortable" :picked="picked" :focus-key="focusKey" :now="now"
                          :link-map="linkMap" :show-path="view !== 'folder'" :drop-key="dropKey" :draggable="allowed.organize" :can-download="allowed.download"
                          :can-share="allowed.share" :loading="state === 'loading'" :fresh="fresh" :group-by="view === 'recent' ? groupRecent : null"
                          @open="(item) => openItem(item)" @pick="onPick" @check="onCheck" @check-all="all => (all ? pickAll() : clearPick())" @sort="sortBy"
                          @act="onAct" @focus="item => (focusKey = item.key)" @dragstart="onItemDragStart" @dragend="onItemDragEnd">
              <template #empty>
                <div class="kcl-empty" style="min-height: 260px">
                  <template v-if="view === 'search'">
                    <span class="kcl-empty__icon"><KliveCloudIcon name="search" :size="18" /></span>
                    <strong>Nothing called “{{ query.trim() }}”</strong>
                    <span>Names are searched across the whole drive. Words like “photos” or “pdf” match kinds too.</span>
                    <button class="kcl-btn kcl-btn--sm kcl-btn--ghost" @click="clearSearch">Clear search</button>
                  </template>
                  <template v-else-if="view === 'folder'">
                    <span class="kcl-empty__icon"><KliveCloudIcon :name="canAddHere ? 'upload' : 'folder'" :size="18" /></span>
                    <strong>{{ folderKey ? 'This folder is empty' : 'Your drive is empty' }}</strong>
                    <template v-if="canAddHere">
                      <span>Drop files or folders anywhere on this page, paste a screenshot, or</span>
                      <div style="display: flex; gap: 8px">
                        <button class="kcl-btn kcl-btn--primary" @click="pickFiles"><KliveCloudIcon name="upload" :size="14" />Upload files</button>
                        <button class="kcl-btn" @click="askNewFolder"><KliveCloudIcon name="folder-plus" :size="14" />New folder</button>
                      </div>
                    </template>
                  </template>
                  <template v-else>
                    <span class="kcl-empty__icon"><KliveCloudIcon name="info" :size="18" /></span>
                    <strong>Nothing here yet</strong>
                  </template>
                </div>
              </template>
            </CloudListing>

            <div v-if="fileDrag && canDropFiles" class="kcl-drop" data-testid="kcl-drop">
              <div class="kcl-drop__msg">
                <KliveCloudIcon name="upload" :size="28" />
                Drop to upload to {{ dropTargetName }}
                <span>Folders keep their structure. Drop onto a folder to put it there.</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <CloudSheet v-if="sheetShown" :item="sheetItem" :selection="pickedItems.length > 1 ? pickedItems : []" :folder="view === 'folder' ? currentFolder : null" :place="place"
                  :link-map="linkMap" :now="now" :origin="origin" :allowed="allowed"
                  @close="closeSheet" @open="openItem" @download="item => download([item])" @download-many="items => download(items, zipFolderFor(items))"
                  @rename="askRename" @move="items => (moveItems = items)" @remove="askDelete" @link="shareLink" @edit-link="link => (linkDialog = { item: null, link })"
                  @copy-link="copyLink" @people="item => (accessItem = item)" @go="key => go('folder', key)" @reveal="reveal" />
    </div>

    <!-- ── menus ── -->
    <Teleport to="body">
      <div v-if="menu" class="kcl-layer">
        <div class="kcl-menu" role="menu" :style="{ position: 'fixed', top: `${menu.y}px`, left: `${menu.x}px`, right: 'auto' }" data-testid="kcl-menu" @click.stop>
          <template v-if="menu.kind === 'add'">
            <button class="kcl-menu__item" role="menuitem" @click="closeMenu(); pickFiles()"><KliveCloudIcon name="upload" :size="14" />Upload files<span class="kcl-kbd">U</span></button>
            <button class="kcl-menu__item" role="menuitem" @click="closeMenu(); pickFolder()"><KliveCloudIcon name="folder" :size="14" />Upload a folder</button>
            <button class="kcl-menu__item" role="menuitem" data-testid="menu-new-folder" @click="closeMenu(); askNewFolder()"><KliveCloudIcon name="folder-plus" :size="14" />New folder<span class="kcl-kbd">N</span></button>
          </template>
          <template v-else-if="menu.item">
            <button class="kcl-menu__item" role="menuitem" @click="withMenu(it => openItem(it))"><KliveCloudIcon :name="menu.item.type === 'Folder' ? 'folder' : 'eye'" :size="14" />{{ menu.item.type === 'Folder' ? 'Open' : 'Preview' }}<span class="kcl-kbd">{{ menu.item.type === 'Folder' ? 'Enter' : 'Space' }}</span></button>
            <button v-if="allowed.download" class="kcl-menu__item" role="menuitem" @click="withMenu(it => download([it]))"><KliveCloudIcon name="download" :size="14" />{{ menu.item.type === 'Folder' ? 'Download as ZIP' : 'Download' }}</button>
            <button v-if="view !== 'folder'" class="kcl-menu__item" role="menuitem" @click="withMenu(it => reveal(it))"><KliveCloudIcon name="folder" :size="14" />Show in its folder</button>
            <button v-if="isNarrow" class="kcl-menu__item" role="menuitem" @click="closeMenu(); sheetPinned = true"><KliveCloudIcon name="info" :size="14" />Details</button>
            <template v-if="menu.item.level === 'Editor'">
              <div class="kcl-menu__sep"></div>
              <button v-if="allowed.share" class="kcl-menu__item" role="menuitem" data-testid="menu-link" @click="withMenu(it => shareLink(it))"><KliveCloudIcon name="link" :size="14" />Share link…</button>
              <button v-if="allowed.share && (linkMap.get(menu.item.key)?.length ?? 0) > 0" class="kcl-menu__item" role="menuitem" @click="withMenu(it => copyLink(linkMap.get(it.key)![0]))"><KliveCloudIcon name="copy" :size="14" />Copy link</button>
              <button v-if="allowed.share" class="kcl-menu__item" role="menuitem" data-testid="menu-people" @click="withMenu(it => accessItem = it)"><KliveCloudIcon name="users" :size="14" />Who can use it…</button>
              <div class="kcl-menu__sep"></div>
              <button v-if="allowed.organize" class="kcl-menu__item" role="menuitem" data-testid="menu-rename" @click="withMenu(it => askRename(it))"><KliveCloudIcon name="pencil" :size="14" />Rename<span class="kcl-kbd">F2</span></button>
              <button v-if="allowed.organize" class="kcl-menu__item" role="menuitem" data-testid="menu-move" @click="withMenu(it => moveItems = targetsFor(it))"><KliveCloudIcon name="folder-move" :size="14" />Move to…</button>
              <button v-if="allowed.remove" class="kcl-menu__item" role="menuitem" data-tone="crit" data-testid="menu-delete" @click="withMenu(it => askDelete(targetsFor(it)))"><KliveCloudIcon name="trash" :size="14" />Delete<span class="kcl-kbd">Del</span></button>
            </template>
          </template>
        </div>
      </div>
    </Teleport>

    <!-- ── dialogs ── -->
    <CloudDialog :open="nameDialog !== null" :title="nameDialog?.mode === 'rename' ? `Rename “${nameDialog.item?.name}”` : `New folder${currentFolder ? ` in ${currentFolder.name}` : ''}`"
                 :icon="nameDialog?.mode === 'rename' ? 'pencil' : 'folder-plus'" testid="kcl-name-dialog" @close="nameDialog = null">
      <form @submit.prevent="submitName">
        <input v-model="nameValue" class="kcl-input kcl-input--wide" :aria-label="nameDialog?.mode === 'rename' ? 'New name' : 'Folder name'" data-autofocus :data-select="nameSelect"
               data-testid="kcl-name-input" maxlength="200" />
        <p v-if="nameProblem" class="kcl-error" style="margin-top: 8px">{{ nameProblem }}</p>
      </form>
      <template #actions>
        <button class="kcl-btn kcl-btn--ghost" @click="nameDialog = null">Cancel</button>
        <button class="kcl-btn kcl-btn--primary" :disabled="!!nameProblem || !nameValue.trim() || busy" data-testid="kcl-name-save" @click="submitName">{{ nameDialog?.mode === 'rename' ? 'Rename' : 'Create' }}</button>
      </template>
    </CloudDialog>

    <CloudDialog :open="deleteItems.length > 0" :title="deleteItems.length === 1 ? `Delete “${deleteItems[0].name}”?` : `Delete ${deleteItems.length} items?`"
                 :sub="deleteSummary" icon="trash" tone="crit" testid="kcl-delete-dialog" @close="deleteItems = []">
      <p class="kcl-hint">This can't be undone: the files are removed from the server's disk, and any share link to them stops working.</p>
      <template #actions>
        <button class="kcl-btn kcl-btn--ghost" @click="deleteItems = []">Cancel</button>
        <button class="kcl-btn kcl-btn--solid-danger" :disabled="busy" data-testid="kcl-delete-confirm" @click="confirmDelete"><KliveCloudIcon name="trash" :size="14" />Delete</button>
      </template>
    </CloudDialog>

    <CloudDialog :open="linkConfirm !== null" :title="linkConfirm?.kind === 'adopt' ? `Take over ${linkConfirm.links.length} link${linkConfirm.links.length === 1 ? '' : 's'}?` : `Remove ${linkConfirm?.links.length} link${linkConfirm?.links.length === 1 ? '' : 's'}?`"
                 :icon="linkConfirm?.kind === 'adopt' ? 'user-check' : 'link-off'" :tone="linkConfirm?.kind === 'adopt' ? 'link' : 'crit'" testid="kcl-link-confirm" @close="linkConfirm = null">
      <p v-if="linkConfirm?.kind === 'adopt'" class="kcl-hint">They open again at the same addresses, and show what you can see. Anyone who still has one of them can use it.</p>
      <p v-else class="kcl-hint">Anyone who has {{ linkConfirm?.links.length === 1 ? 'it' : 'them' }} gets “This link no longer works” from now on. The files themselves stay.</p>
      <ul class="kcl-hint" style="display: flex; flex-direction: column; gap: 2px; max-height: 160px; overflow-y: auto">
        <li v-for="link in linkConfirm?.links ?? []" :key="link.code">· {{ link.name }} <span class="kcl-faint">{{ link.problemText }}</span></li>
      </ul>
      <template #actions>
        <button class="kcl-btn kcl-btn--ghost" @click="linkConfirm = null">Cancel</button>
        <button v-if="linkConfirm?.kind === 'adopt'" class="kcl-btn kcl-btn--primary" :disabled="busy" data-testid="kcl-adopt-confirm" @click="confirmLinks"><KliveCloudIcon name="user-check" :size="14" />Take over</button>
        <button v-else class="kcl-btn kcl-btn--solid-danger" :disabled="busy" data-testid="kcl-remove-links-confirm" @click="confirmLinks"><KliveCloudIcon name="trash" :size="14" />Remove</button>
      </template>
    </CloudDialog>

    <CloudDialog :open="shortcutsOpen" title="Keyboard" icon="command" testid="kcl-shortcuts" @close="shortcutsOpen = false">
      <dl class="kcl-facts" style="grid-template-columns: 110px 1fr">
        <template v-for="row in SHORTCUTS" :key="row[0]"><dt><span class="kcl-kbd">{{ row[0] }}</span></dt><dd>{{ row[1] }}</dd></template>
      </dl>
    </CloudDialog>

    <CloudMoveDialog :items="moveItems" :index="index" :busy="busy" @close="moveItems = []" @move="confirmMove" />
    <CloudLinkDialog :item="linkDialog?.item ?? null" :link="linkDialog?.link ?? null" :origin="origin" :now="now" :busy="busy" :copied="copiedCode === (linkDialog?.link?.code ?? '')"
                     :supports-update="supports.updateLink" @close="linkDialog = null" @create="createLinkFromDialog" @update="updateLinkFromDialog" @copy="copyLink" />
    <CloudAccessDialog :item="accessItem" @close="accessItem = null" @saved="onAccessSaved" />
    <CloudViewer :item="viewerItem" :list="viewerList" :now="now" :can-download="allowed.download" :can-share="allowed.share && viewerItem?.level === 'Editor'"
                 :prepare="cloud.ensureTickets" :source-for="item => cloud.previewSource(item, key => readyThumb(index?.byKey.get(key)?.id ?? key))"
                 @close="closeViewer" @go="item => openViewer(item, true)" @download="item => download([item])" @link="item => { closeViewer(); shareLink(item); }" />
    <CloudPalette :open="paletteOpen" :commands="commands" :find="findCommands" @close="paletteOpen = false" />
    <CloudUploadTray :jobs="uploads.jobs" :now="now" @cancel="id => uploads.cancel(id)" @retry="id => uploads.retry(id)" @cancel-all="uploads.cancelAll()" @clear="uploads.clearFinished()" />

    <Teleport to="body">
      <div v-if="toasts.length" class="kcl-layer">
        <div class="kcl-toasts" role="status" aria-live="polite">
          <div v-for="toast in toasts" :key="toast.id" class="kcl-toast" :data-tone="toast.tone" data-testid="kcl-toast">
            <KliveCloudIcon :name="toast.tone === 'crit' ? 'octagon-x' : toast.tone === 'warn' ? 'alert' : toast.tone === 'info' ? 'info' : 'check-circle'" :size="15" />
            <span class="kcl-toast__text">{{ toast.text }}</span>
            <button v-if="toast.action" class="kcl-btn kcl-btn--xs" @click="toast.action.run(); cloud.dismiss(toast.id)">{{ toast.action.label }}</button>
            <button class="kcl-iconbtn kcl-iconbtn--sm" aria-label="Dismiss" @click="cloud.dismiss(toast.id)"><KliveCloudIcon name="close" :size="12" /></button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useKliveCloud } from '~/composables/useKliveCloud';
import {
  ROOT, SHARED, childrenIn, dayGroup, folderSummary, formatBytes, keyOf, largestFiles, linkState, pathTo, plural, rangeKeys, recentFiles, searchDrive, shareUrl, sortDrive,
  type CloudCommand, type DriveItem, type DriveLink, type DriveSort, type DriveView, type KindTotal,
} from '~/scripts/klivecloud/drive';
import { copyText, formatWhen, type ShareMode } from '~/scripts/klivecloud/shared';
import { pastedName, takeDrop, takeInput } from '~/scripts/klivecloud/uploads';
import { forgetThumbs, readyThumb } from '~/scripts/klivecloud/ownerThumbs';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'KliveCloud' });

const route = useRoute();
const router = useRouter();
const cloud = useKliveCloud();
const { allowed, index, links, linkMap, drive, state, loadError, loadedAt, now, reloading, supports, toasts, uploads } = cloud;

const VIEW_ICON: Record<DriveView, string> = { folder: 'folder', recent: 'clock', large: 'weight', links: 'link', shared: 'users', search: 'search' };
const SHORTCUTS: [string, string][] = [
  ['/', 'Search the whole drive'], ['Ctrl K', 'Go to anything, run anything'], ['↑ ↓', 'Move through the list (Shift to select)'],
  ['Enter', 'Open'], ['Space', 'Preview'], ['Backspace', 'Up a folder'], ['X', 'Select or unselect'], ['Ctrl A', 'Select everything here'],
  ['F2', 'Rename'], ['Del', 'Delete'], ['U', 'Upload files'], ['N', 'New folder'], ['I', 'Details panel'], ['R', 'Refresh'], ['Esc', 'Clear, close'],
];

// ── preferences (this browser only) ──
const PREFS_KEY = 'kcl:prefs';
const prefs = reactive<{ layout: 'list' | 'grid'; sheet: boolean; sort: { key: DriveSort; dir: 1 | -1 } }>({ layout: 'list', sheet: true, sort: { key: 'name', dir: 1 } });
try {
  const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null');
  if (saved?.layout === 'grid' || saved?.layout === 'list') prefs.layout = saved.layout;
  if (typeof saved?.sheet === 'boolean') prefs.sheet = saved.sheet;
  if (saved?.sort?.key) prefs.sort = { key: saved.sort.key, dir: saved.sort.dir === -1 ? -1 : 1 };
} catch { /* defaults */ }
watch(prefs, value => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(value)); } catch { /* private mode */ } }, { deep: true });

// ── where we are ──
const view = ref<DriveView>('folder');
const folderKey = ref<string>(ROOT);
const query = ref('');
const railOpen = ref(false);
const origin = import.meta.client ? window.location.origin : '';

const currentFolder = computed(() => (view.value === 'folder' && folderKey.value ? index.value?.byKey.get(folderKey.value) ?? null : null));
const crumbs = computed(() => (index.value && folderKey.value ? pathTo(index.value, folderKey.value) : []));
const folderLevel = computed(() => (folderKey.value ? currentFolder.value?.level ?? 'None' : 'Editor'));
const canAddHere = computed(() => allowed.value.upload && (view.value !== 'folder' || folderLevel.value === 'Editor'));
const uploadTarget = computed(() => (view.value === 'folder' ? folderKey.value : ROOT));
const folderLinks = computed(() => (currentFolder.value ? linkMap.value.get(currentFolder.value.key) ?? [] : []));

const heading = computed(() => {
  switch (view.value) {
    case 'search': return `Results for “${query.value.trim()}”`;
    case 'recent': return 'Recent';
    case 'large': return 'Largest files';
    case 'links': return 'Share links';
    case 'shared': return 'Shared with me';
    default: return currentFolder.value?.name ?? 'My drive';
  }
});

const sortable = computed(() => view.value === 'folder' || view.value === 'search' || view.value === 'shared');
const groupRecent = (item: DriveItem) => dayGroup(item.modified, now.value);

const shown = computed<DriveItem[]>(() => {
  const all = index.value;
  if (!all) return [];
  switch (view.value) {
    case 'search': return prefs.sort.key === 'name' && prefs.sort.dir === 1 ? searchDrive(all, query.value) : sortDrive(searchDrive(all, query.value), prefs.sort.key, prefs.sort.dir);
    case 'recent': return recentFiles(all, 80);
    case 'large': return largestFiles(all, 60);
    case 'shared': return sortDrive(childrenIn(all, SHARED), prefs.sort.key, prefs.sort.dir);
    case 'links': return [];
    default: return sortDrive(childrenIn(all, folderKey.value), prefs.sort.key, prefs.sort.dir);
  }
});

const folderStats = computed(() => {
  if (view.value !== 'folder') return null;
  if (currentFolder.value) return currentFolder.value;
  const all = index.value;
  if (!all) return null;
  return { files: all.files, folders: all.folders, bytes: all.bytes, newest: all.newest };
});
/** The folder you are in (or the whole drive), in brief, for the details panel with nothing picked. */
const place = computed(() => {
  const all = index.value;
  if (!all || view.value !== 'folder') return null;
  const folder = currentFolder.value;
  const inside = (item: DriveItem) => {
    if (!folder) return item.parentKey !== SHARED;
    let cursor = all.byKey.get(item.parentKey);
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor.key)) {
      if (cursor.key === folder.key) return true;
      seen.add(cursor.key);
      cursor = all.byKey.get(cursor.parentKey);
    }
    return false;
  };
  const files: DriveItem[] = [];
  for (const item of all.byKey.values()) if (item.type === 'File' && inside(item)) files.push(item);
  const kinds = new Map<string, KindTotal>();
  for (const file of files) {
    const total = kinds.get(file.kind) ?? { kind: file.kind, files: 0, bytes: 0 };
    total.files++;
    total.bytes += file.bytes;
    kinds.set(file.kind, total);
  }
  const bytes = folder ? folder.bytes : all.bytes;
  return {
    title: folder?.name ?? 'My drive',
    sub: folder ? folderSummary(folder) : `${plural(all.folders, 'folder')} · ${plural(all.files, 'file')} · ${formatBytes(all.bytes)}`,
    bytes,
    recent: [...files].sort((a, b) => (b.modified || 0) - (a.modified || 0)).slice(0, 5),
    biggest: [...files].sort((a, b) => b.bytes - a.bytes).slice(0, 4),
    kinds: [...kinds.values()].sort((a, b) => b.bytes - a.bytes),
  };
});

const hereDirect = computed(() => (index.value && view.value === 'folder' ? childrenIn(index.value, folderKey.value).length : 0));

const linkCounts = computed(() => ({ total: links.value.length, broken: links.value.filter(link => linkState(link, now.value) === 'broken').length }));

const subline = computed(() => {
  const all = index.value;
  if (!all) return state.value === 'loading' ? 'Opening your drive…' : '';
  const parts = [`${plural(all.files, 'file')} · ${formatBytes(all.bytes)}`];
  if (drive.value) parts.push(`${formatBytes(drive.value.free)} free on ${drive.value.name}`);
  if (linkCounts.value.total) parts.push(`${linkCounts.value.total} link${linkCounts.value.total === 1 ? '' : 's'}${linkCounts.value.broken ? `, ${linkCounts.value.broken} can't open` : ''}`);
  return parts.join(' · ');
});

function fmtAgo(ms: number) {
  const s = Math.round((now.value - ms) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

// ── selection ──
const picked = ref<Set<string>>(new Set());
const anchor = ref<string | null>(null);
const focusKey = ref<string | null>(null);
const pickedItems = computed(() => shown.value.filter(item => picked.value.has(item.key)));
const canEditPicked = computed(() => pickedItems.value.length > 0 && pickedItems.value.every(item => item.level === 'Editor'));
const pickedSummary = computed(() => {
  const files = pickedItems.value.filter(i => i.type === 'File').length;
  const folders = pickedItems.value.length - files;
  const bytes = pickedItems.value.reduce((sum, i) => sum + i.bytes, 0);
  return [folders ? plural(folders, 'folder') : '', files ? plural(files, 'file') : '', formatBytes(bytes)].filter(Boolean).join(' · ');
});

const sheetItem = computed<DriveItem | null>(() => (pickedItems.value.length === 1 ? pickedItems.value[0] : null));
const isNarrow = ref(false);
/** On narrow screens the sheet is an overlay: it opens on request (I, or Details in a row's menu). */
const sheetPinned = ref(false);
const sheetShown = computed(() => view.value !== 'links' && allowed.value.browse && state.value !== 'error'
  && (isNarrow.value ? sheetPinned.value && (!!sheetItem.value || pickedItems.value.length > 1) : prefs.sheet));
function closeSheet() {
  if (isNarrow.value) sheetPinned.value = false;
  else prefs.sheet = false;
}

function setPick(keys: Iterable<string>) {
  picked.value = new Set(keys);
}
function clearPick() {
  if (picked.value.size) setPick([]);
}
function pickAll() {
  setPick(shown.value.map(item => item.key));
}

const coarse = ref(false);

function onPick(item: DriveItem, event: MouseEvent) {
  closeMenu();
  focusKey.value = item.key;
  if (coarse.value && !event.ctrlKey && !event.shiftKey && !picked.value.size) { openItem(item); return; }
  if (event.shiftKey && anchor.value) {
    const order = shown.value.map(i => i.key);
    const range = rangeKeys(order, anchor.value, item.key);
    setPick(event.ctrlKey || event.metaKey ? [...picked.value, ...range] : range);
    return;
  }
  if (event.ctrlKey || event.metaKey) {
    const next = new Set(picked.value);
    if (next.has(item.key)) next.delete(item.key); else next.add(item.key);
    picked.value = next;
  } else {
    setPick([item.key]);
  }
  anchor.value = item.key;
}

function onCheck(item: DriveItem, event: MouseEvent) {
  focusKey.value = item.key;
  if (event.shiftKey && anchor.value) {
    setPick([...picked.value, ...rangeKeys(shown.value.map(i => i.key), anchor.value, item.key)]);
    return;
  }
  const next = new Set(picked.value);
  if (next.has(item.key)) next.delete(item.key); else next.add(item.key);
  picked.value = next;
  anchor.value = item.key;
}

/** What a menu on one row acts on: the whole selection when the row is part of it. */
function targetsFor(item: DriveItem) {
  return picked.value.has(item.key) && picked.value.size > 1 ? pickedItems.value : [item];
}

// ── navigation ──
let syncing = false;

function go(next: DriveView, key = ROOT, options: { keepSearch?: boolean } = {}) {
  if (next === 'folder' && key && index.value && !index.value.byKey.has(key)) key = ROOT;
  view.value = next;
  folderKey.value = next === 'folder' ? key : folderKey.value;
  if (!options.keepSearch && next !== 'search') query.value = '';
  setPick([]);
  anchor.value = null;
  focusKey.value = null;
  pushUrl();
}

function openItem(item: DriveItem) {
  closeMenu();
  if (item.type === 'Folder') { go('folder', item.key); return; }
  openViewer(item);
}

function reveal(item: DriveItem) {
  if (item.parentKey === SHARED) go('shared');
  else go('folder', item.parentKey);
  void nextTick(() => {
    setPick([item.key]);
    anchor.value = item.key;
    focusKey.value = item.key;
    void nextTick(() => document.querySelector(`[data-key="${CSS.escape(item.key)}"]`)?.scrollIntoView({ block: 'center' }));
  });
}

function revealLink(link: DriveLink) {
  const item = index.value?.byKey.get(link.itemKey);
  if (item) reveal(item);
}

function goUp() {
  if (view.value !== 'folder') { go('folder', ROOT); return; }
  const folder = currentFolder.value;
  if (!folder) return;
  const childKey = folder.key;
  if (folder.parentKey === SHARED) go('shared');
  else go('folder', folder.parentKey);
  void nextTick(() => { focusKey.value = childKey; setPick([childKey]); anchor.value = childKey; });
}

function clearSearch() {
  query.value = '';
  searchInput.value?.blur();
}

let searchFrom: { view: DriveView; key: string } | null = null;
watch(query, (text, old) => {
  if (syncing) return;
  if (text.trim() && !old.trim()) searchFrom = { view: view.value === 'search' ? 'folder' : view.value, key: folderKey.value };
  if (text.trim()) {
    if (view.value !== 'search') { view.value = 'search'; setPick([]); }
    focusKey.value = null;
  } else if (view.value === 'search') {
    view.value = searchFrom?.view ?? 'folder';
    folderKey.value = searchFrom?.key ?? folderKey.value;
    searchFrom = null;
  }
  replaceUrl();
});

// ?f= a folder, ?v= a view, ?q= a search, ?open= a file in the viewer: shareable, and Back works.
function urlQuery() {
  const q: Record<string, string> = {};
  if (view.value === 'folder' && folderKey.value) q.f = index.value?.byKey.get(folderKey.value)?.id ?? folderKey.value;
  if (view.value !== 'folder' && view.value !== 'search') q.v = view.value;
  if (view.value === 'search' && query.value.trim()) q.q = query.value.trim();
  if (viewerItem.value) q.open = viewerItem.value.id;
  return q;
}
function sameQuery(a: Record<string, any>, b: Record<string, any>) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if (String(a[key] ?? '') !== String(b[key] ?? '')) return false;
  return true;
}
function pushUrl() {
  if (syncing) return;
  const q = urlQuery();
  if (!sameQuery(q, route.query)) void router.push({ query: q });
}
function replaceUrl() {
  if (syncing) return;
  const q = urlQuery();
  if (!sameQuery(q, route.query)) void router.replace({ query: q });
}

function applyUrl() {
  syncing = true;
  const before = `${view.value}|${folderKey.value}|${query.value}`;
  try {
    const q = route.query;
    const v = String(q.v ?? '');
    const text = String(q.q ?? '');
    if (text) { query.value = text; view.value = 'search'; }
    else {
      query.value = '';
      if (['recent', 'large', 'links', 'shared'].includes(v)) view.value = v as DriveView;
      else { view.value = 'folder'; folderKey.value = keyOf(q.f); }
    }
    const open = keyOf(q.open);
    if (!open) viewerPushed = false;
    viewerKey.value = open || null;
    // Back and Forward land somewhere new: what was picked there doesn't come along.
    if (`${view.value}|${folderKey.value}|${query.value}` !== before) { picked.value = new Set(); anchor.value = null; }
  } finally {
    void nextTick(() => { syncing = false; });
  }
}
watch(() => route.query, () => applyUrl());

// A folder that went away (deleted elsewhere) sends you to the top.
watch(index, all => {
  if (!all) return;
  if (view.value === 'folder' && folderKey.value && !all.byKey.has(folderKey.value)) go('folder', ROOT);
  if (picked.value.size) {
    const keep = [...picked.value].filter(key => all.byKey.has(key));
    if (keep.length !== picked.value.size) setPick(keep);
  }
});

// ── sorting ──
const DEFAULT_DIR: Record<DriveSort, 1 | -1> = { name: 1, kind: 1, size: -1, modified: -1, access: 1 };
function sortBy(key: DriveSort) {
  prefs.sort = prefs.sort.key === key ? { key, dir: prefs.sort.dir === 1 ? -1 : 1 } : { key, dir: DEFAULT_DIR[key] };
}
const sortChoice = computed({
  get: () => `${prefs.sort.key}:${prefs.sort.dir}`,
  set: (value: string) => {
    const [key, dir] = value.split(':');
    prefs.sort = { key: key as DriveSort, dir: dir === '-1' ? -1 : 1 };
  },
});

// ── viewer ──
const viewerKey = ref<string | null>(null);
const viewerItem = computed(() => (viewerKey.value ? index.value?.byKey.get(viewerKey.value) ?? null : null));
const viewerList = computed(() => {
  const list = shown.value.filter(item => item.type === 'File');
  return viewerItem.value && !list.some(item => item.key === viewerItem.value!.key) ? [viewerItem.value] : list;
});
let viewerPushed = false;
function openViewer(item: DriveItem, replace = false) {
  const wasOpen = !!viewerKey.value;
  viewerKey.value = item.key;
  focusKey.value = item.key;
  if (replace || wasOpen) replaceUrl();
  else { viewerPushed = true; pushUrl(); }
}
function closeViewer() {
  if (!viewerKey.value) return;
  const key = viewerKey.value;
  viewerKey.value = null;
  if (viewerPushed && route.query.open) router.back(); else replaceUrl();
  viewerPushed = false;
  void nextTick(() => {
    focusKey.value = key;
    (document.querySelector(`[data-focus-key="${CSS.escape(key)}"]`) as HTMLElement | null)?.focus();
  });
}

// ── menus ──
const menu = ref<{ kind: 'item' | 'add'; item?: DriveItem; x: number; y: number } | null>(null);
function placeMenu(event: Event, width = 220, height = 320) {
  const mouse = event as MouseEvent;
  const target = (event.currentTarget ?? event.target) as HTMLElement | null;
  const rect = target?.getBoundingClientRect?.();
  let x = mouse.clientX || (rect ? rect.right - width : 0);
  let y = mouse.clientY || (rect ? rect.bottom + 4 : 0);
  if (mouse.type === 'click' && rect) { x = rect.right - width; y = rect.bottom + 4; }
  x = Math.max(8, Math.min(x, window.innerWidth - width - 8));
  y = Math.max(8, Math.min(y, window.innerHeight - height - 8));
  return { x, y };
}
function openAddMenu(event: Event) {
  menu.value = menu.value?.kind === 'add' ? null : { kind: 'add', ...placeMenu(event, 210, 120) };
}
function closeMenu() {
  menu.value = null;
}
/** Runs a menu entry on the item the menu was opened for (the menu closes first). */
function withMenu(run: (item: DriveItem) => void) {
  const item = menu.value?.item;
  closeMenu();
  if (item) run(item);
}

function onAct(kind: 'download' | 'link' | 'menu' | 'reveal', item: DriveItem, event: Event) {
  if (kind === 'menu') {
    if (!picked.value.has(item.key)) { setPick([item.key]); anchor.value = item.key; }
    focusKey.value = item.key;
    menu.value = { kind: 'item', item, ...placeMenu(event) };
  } else if (kind === 'download') download(targetsFor(item), zipFolderFor(targetsFor(item)));
  else if (kind === 'link') shareLink(item);
  else if (kind === 'reveal') reveal(item);
}

// ── downloads ──
/** Several things in one folder go out as one ZIP of that folder's selection. */
function zipFolderFor(items: DriveItem[]): DriveItem | null {
  if (items.length < 2) return null;
  const parent = items[0].parentKey;
  if (!parent || parent === SHARED || !items.every(item => item.parentKey === parent)) return null;
  return index.value?.byKey.get(parent) ?? null;
}
function download(items: DriveItem[], zipFolder: DriveItem | null = null) {
  void cloud.download(items, zipFolder);
}
function downloadPicked() {
  download(pickedItems.value, zipFolderFor(pickedItems.value));
}

// ── new folder / rename ──
const nameDialog = ref<{ mode: 'new' | 'rename'; item?: DriveItem } | null>(null);
const nameValue = ref('');
const busy = ref(false);
const nameSelect = computed(() => {
  const item = nameDialog.value?.item;
  if (!item || item.type === 'Folder') return '';
  const dot = nameValue.value.lastIndexOf('.');
  return dot > 0 ? String(dot) : '';
});
const BAD_NAME = /[\\/:*?"<>|]/;
const nameProblem = computed(() => {
  const value = nameValue.value.trim();
  if (!value) return '';
  if (BAD_NAME.test(value)) return 'Names can’t contain \\ / : * ? " < > |';
  if (value === '.' || value.includes('..')) return 'Names can’t contain “..”';
  const parent = nameDialog.value?.mode === 'rename' ? nameDialog.value.item!.parentKey : uploadTarget.value;
  const siblings = index.value ? childrenIn(index.value, parent || ROOT) : [];
  const clash = siblings.find(s => s.name.toLowerCase() === value.toLowerCase() && s.key !== nameDialog.value?.item?.key);
  return clash ? `Something called “${clash.name}” is already here.` : '';
});

function askNewFolder() {
  if (!canAddHere.value) return;
  if (view.value !== 'folder') go('folder', ROOT);
  nameValue.value = 'New folder';
  nameDialog.value = { mode: 'new' };
}
function askRename(item: DriveItem) {
  if (item.level !== 'Editor' || !allowed.value.organize) return;
  nameValue.value = item.name;
  nameDialog.value = { mode: 'rename', item };
}
async function submitName() {
  const dialog = nameDialog.value;
  if (!dialog || nameProblem.value || !nameValue.value.trim() || busy.value) return;
  busy.value = true;
  try {
    if (dialog.mode === 'rename' && dialog.item) {
      if (await cloud.rename(dialog.item, nameValue.value)) nameDialog.value = null;
    } else {
      const made = await cloud.createFolder(nameValue.value, uploadTarget.value);
      if (made) {
        nameDialog.value = null;
        markFresh(made.key);
        setPick([made.key]);
        focusKey.value = made.key;
      }
    }
  } finally {
    busy.value = false;
  }
}

// ── delete / move ──
const deleteItems = ref<DriveItem[]>([]);
const deleteSummary = computed(() => {
  const items = deleteItems.value;
  if (!items.length) return '';
  const files = items.reduce((sum, i) => sum + (i.type === 'File' ? 1 : i.files), 0);
  const bytes = items.reduce((sum, i) => sum + i.bytes, 0);
  const withLinks = items.filter(i => linkMap.value.has(i.key)).length;
  return `${plural(files, 'file')} · ${formatBytes(bytes)}${withLinks ? ` · ${plural(withLinks, 'item')} shared by link` : ''}`;
});
function askDelete(items: DriveItem[]) {
  const editable = items.filter(item => item.level === 'Editor');
  if (!editable.length || !allowed.value.remove) return;
  deleteItems.value = editable;
}
async function confirmDelete() {
  busy.value = true;
  try {
    await cloud.remove(deleteItems.value);
    deleteItems.value = [];
    setPick([]);
  } finally {
    busy.value = false;
  }
}

const moveItems = ref<DriveItem[]>([]);
async function confirmMove(targetKey: string) {
  busy.value = true;
  try {
    const moving = moveItems.value;
    const count = await cloud.move(moving, targetKey);
    moveItems.value = [];
    if (count) setPick([]);
  } finally {
    busy.value = false;
  }
}

// ── links ──
const linkDialog = ref<{ item: DriveItem | null; link: DriveLink | null } | null>(null);
const linkConfirm = ref<{ kind: 'adopt' | 'remove'; links: DriveLink[] } | null>(null);
const copiedCode = ref('');
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

function shareLink(item: DriveItem) {
  if (!allowed.value.share || item.level !== 'Editor') return;
  const existing = (linkMap.value.get(item.key) ?? []).filter(link => linkState(link, now.value) !== 'broken');
  linkDialog.value = existing.length ? { item: null, link: existing[0] } : { item, link: null };
}

async function copyLink(link: DriveLink) {
  const ok = await copyText(shareUrl(origin, link.code));
  copiedCode.value = ok ? link.code : '';
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => { copiedCode.value = ''; }, 1800);
  cloud.toast(ok ? 'ok' : 'warn', ok ? `Link to “${link.name}” copied` : "Couldn't copy: select the link and copy it yourself");
}

async function createLinkFromDialog(choice: { mode: ShareMode; hours: number }) {
  const item = linkDialog.value?.item;
  if (!item) return;
  busy.value = true;
  try {
    const made = await cloud.createLink(item, choice.mode, choice.hours);
    if (made) {
      linkDialog.value = { item: null, link: made };
      await copyLink(made);
    }
  } finally {
    busy.value = false;
  }
}

async function updateLinkFromDialog(link: DriveLink, change: { mode?: ShareMode; hours?: number }) {
  busy.value = true;
  try {
    if (await cloud.updateLink(link, change)) {
      const fresh = links.value.find(l => l.code === link.code);
      linkDialog.value = fresh ? { item: null, link: fresh } : null;
      cloud.toast('ok', 'Link updated: same address');
    }
  } finally {
    busy.value = false;
  }
}

function askAdopt(list: DriveLink[]) {
  if (list.length) linkConfirm.value = { kind: 'adopt', links: list };
}
function askRemoveLinks(list: DriveLink[]) {
  if (list.length) linkConfirm.value = { kind: 'remove', links: list };
}
async function confirmLinks() {
  const pending = linkConfirm.value;
  if (!pending) return;
  busy.value = true;
  try {
    if (pending.kind === 'remove') await cloud.deleteLinks(pending.links);
    else {
      let done = 0;
      for (const link of pending.links) if (await cloud.updateLink(link, { adopt: true })) done++;
      if (done) cloud.toast('ok', done === 1 ? 'Link taken over: it opens again' : `${done} links taken over: they open again`);
    }
    linkConfirm.value = null;
  } finally {
    busy.value = false;
  }
}

// ── access ──
const accessItem = ref<DriveItem | null>(null);
function onAccessSaved(updated: any) {
  accessItem.value = null;
  cloud.accessSaved(updated);
}

// ── uploads ──
const fileInput = ref<HTMLInputElement | null>(null);
const folderInput = ref<HTMLInputElement | null>(null);
const searchInput = ref<HTMLInputElement | null>(null);
const fresh = ref<Set<string>>(new Set());

function markFresh(key: string) {
  fresh.value = new Set([...fresh.value, key]);
  setTimeout(() => { const next = new Set(fresh.value); next.delete(key); fresh.value = next; }, 2_000);
}

function pickFiles() {
  if (canAddHere.value) fileInput.value?.click();
}
function pickFolder() {
  if (canAddHere.value) folderInput.value?.click();
}
function onPicked(event: Event, folder: boolean) {
  const input = event.target as HTMLInputElement;
  const picks = takeInput(input.files);
  input.value = '';
  if (!picks.files.length) return;
  void cloud.upload(picks, uploadTarget.value);
  if (folder && picks.dirs.length) cloud.toast('info', `Uploading ${plural(picks.files.length, 'file')} in ${plural(picks.dirs.length, 'folder')}`);
}

// New uploads light up as they land.
const seenUploads = new Set<number>();
watch(() => uploads.jobs.map(job => `${job.id}:${job.status}:${job.itemId}`).join(','), () => {
  for (const job of uploads.jobs) if (job.status === 'done' && job.itemId && !seenUploads.has(job.id)) { seenUploads.add(job.id); markFresh(keyOf(job.itemId)); }
});

function onPaste(event: ClipboardEvent) {
  if (isTyping(event.target) || !canAddHere.value || anyLayerOpen()) return;
  const files = [...(event.clipboardData?.files ?? [])];
  if (!files.length) return;
  event.preventDefault();
  const renamed = files.map(file => new File([file], pastedName(file), { type: file.type, lastModified: file.lastModified }));
  void cloud.upload({ files: renamed.map(file => ({ file, dir: '' })), dirs: [] }, uploadTarget.value);
}

// ── dragging: files from the desktop upload, items dragged here move ──
const fileDrag = ref(false);
const dropKey = ref<string | null>(null);
let dragDepth = 0;
let dragging: DriveItem[] = [];
const canDropFiles = computed(() => canAddHere.value && view.value !== 'links');
const dropTargetName = computed(() => {
  const key = dropKey.value ?? uploadTarget.value;
  return key ? `“${index.value?.byKey.get(key)?.name ?? 'this folder'}”` : 'My drive';
});

const hasFiles = (event: DragEvent) => [...(event.dataTransfer?.types ?? [])].includes('Files');

function dropKeyAt(event: DragEvent): string | null {
  const el = (event.target as HTMLElement | null)?.closest?.('[data-drop-key]') as HTMLElement | null;
  if (!el) return null;
  const key = el.getAttribute('data-drop-key') ?? '';
  if (key && index.value?.byKey.get(key)?.level !== 'Editor') return null;
  return key;
}

function canMoveInto(key: string | null) {
  if (key === null || !dragging.length || !index.value) return false;
  if (dragging.some(item => item.key === key)) return false;
  if (dragging.every(item => item.parentKey === key)) return false;
  // A folder can't go inside itself.
  return !dragging.some(item => item.type === 'Folder' && key && pathTo(index.value!, key).some(step => step.key === item.key));
}

function onItemDragStart(item: DriveItem, event: DragEvent) {
  dragging = picked.value.has(item.key) ? pickedItems.value.filter(i => i.level === 'Editor') : [item];
  if (!dragging.length || !event.dataTransfer) return;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('application/x-klivecloud', dragging.map(i => i.id).join(','));
  event.dataTransfer.setData('text/plain', dragging.map(i => i.name).join('\n'));
}
function onItemDragEnd() {
  dragging = [];
  dropKey.value = null;
}

function onDragEnter(event: DragEvent) {
  if (hasFiles(event) && canDropFiles.value) { dragDepth++; fileDrag.value = true; }
}
function onDragOver(event: DragEvent) {
  if (hasFiles(event)) {
    if (!canDropFiles.value) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    const key = dropKeyAt(event);
    dropKey.value = key !== null && key !== uploadTarget.value ? key : null;
    return;
  }
  if (!dragging.length) return;
  const key = dropKeyAt(event);
  if (canMoveInto(key)) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    dropKey.value = key;
  } else {
    dropKey.value = null;
  }
}
function onDragLeave(event: DragEvent) {
  if (!hasFiles(event)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) { fileDrag.value = false; dropKey.value = null; }
}
function onDrop(event: DragEvent) {
  const key = dropKey.value;
  dragDepth = 0;
  fileDrag.value = false;
  dropKey.value = null;
  if (event.dataTransfer && hasFiles(event)) {
    if (!canDropFiles.value) return;
    event.preventDefault();
    const read = takeDrop(event.dataTransfer);
    void read().then(picks => cloud.upload(picks, key ?? uploadTarget.value));
    return;
  }
  if (dragging.length && key !== null && canMoveInto(key)) {
    event.preventDefault();
    const moving = dragging;
    dragging = [];
    void cloud.move(moving, key).then(count => { if (count) setPick([]); });
  }
}

// ── palette ──
const paletteOpen = ref(false);
const shortcutsOpen = ref(false);

const commands = computed<CloudCommand[]>(() => {
  const list: CloudCommand[] = [];
  if (canAddHere.value) {
    list.push({ id: 'upload', group: 'Actions', title: 'Upload files', icon: 'upload', keys: 'U', run: pickFiles });
    list.push({ id: 'upload-folder', group: 'Actions', title: 'Upload a folder', icon: 'folder', run: pickFolder });
    list.push({ id: 'new-folder', group: 'Actions', title: 'New folder', icon: 'folder-plus', keys: 'N', run: askNewFolder });
  }
  list.push({ id: 'go-drive', group: 'Go to', title: 'My drive', icon: 'home', run: () => go('folder', ROOT) });
  list.push({ id: 'go-recent', group: 'Go to', title: 'Recent files', icon: 'clock', run: () => go('recent') });
  list.push({ id: 'go-large', group: 'Go to', title: 'Largest files', icon: 'weight', keywords: 'big space size', run: () => go('large') });
  if (allowed.value.share) list.push({ id: 'go-links', group: 'Go to', title: `Share links${linkCounts.value.broken ? ` (${linkCounts.value.broken} can't open)` : ''}`, icon: 'link', keywords: 'public broken expiry', run: () => go('links') });
  if (index.value?.sharedCount) list.push({ id: 'go-shared', group: 'Go to', title: 'Shared with me', icon: 'users', run: () => go('shared') });
  list.push({ id: 'layout', group: 'View', title: prefs.layout === 'list' ? 'Show as a grid' : 'Show as a list', icon: prefs.layout === 'list' ? 'grid' : 'list', run: () => { prefs.layout = prefs.layout === 'list' ? 'grid' : 'list'; } });
  list.push({ id: 'details', group: 'View', title: prefs.sheet ? 'Hide details' : 'Show details', icon: 'panel-right', keys: 'I', run: () => { prefs.sheet = !prefs.sheet; } });
  list.push({ id: 'refresh', group: 'View', title: 'Refresh', icon: 'refresh', keys: 'R', run: refresh });
  list.push({ id: 'keys', group: 'View', title: 'Keyboard shortcuts', icon: 'command', keys: '?', run: () => { shortcutsOpen.value = true; } });
  return list;
});

function findCommands(text: string): CloudCommand[] {
  const all = index.value;
  if (!all || !text.trim()) return [];
  return searchDrive(all, text, 40).map(item => ({
    id: `item-${item.key}`,
    group: item.type === 'Folder' ? 'Folders' : 'Files',
    title: item.name,
    kind: item.kind,
    hint: item.path || 'My drive',
    run: () => (item.type === 'Folder' ? go('folder', item.key) : reveal(item)),
  })).sort((a, b) => (a.group === b.group ? 0 : a.group === 'Folders' ? -1 : 1));
}

// ── keyboard ──
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}
function anyLayerOpen() {
  return !!(paletteOpen.value || nameDialog.value || deleteItems.value.length || moveItems.value.length || linkDialog.value || linkConfirm.value
    || accessItem.value || viewerItem.value || shortcutsOpen.value);
}

function focusRow(key: string | null) {
  if (!key) return;
  focusKey.value = key;
  void nextTick(() => {
    const el = document.querySelector(`[data-focus-key="${CSS.escape(key)}"]`) as HTMLElement | null;
    el?.focus({ preventScroll: true });
    el?.closest('tr, .kcl-tile')?.scrollIntoView({ block: 'nearest' });
  });
}
function focusFirstRow() {
  const first = shown.value[0];
  if (first) { focusRow(first.key); setPick([first.key]); anchor.value = first.key; }
}

function columns() {
  if (prefs.layout !== 'grid') return 1;
  const tiles = document.querySelectorAll('.kcl-tile');
  if (tiles.length < 2) return 1;
  const top = (tiles[0] as HTMLElement).offsetTop;
  let n = 0;
  for (const tile of tiles) { if ((tile as HTMLElement).offsetTop !== top) break; n++; }
  return Math.max(1, n);
}

function moveFocus(delta: number, extend: boolean, keep: boolean) {
  const list = shown.value;
  if (!list.length) return;
  const at = list.findIndex(item => item.key === focusKey.value);
  const nextIndex = at < 0 ? (delta > 0 ? 0 : list.length - 1) : Math.max(0, Math.min(list.length - 1, at + delta));
  const next = list[nextIndex];
  focusRow(next.key);
  if (keep) return;
  if (extend && anchor.value) setPick(rangeKeys(list.map(i => i.key), anchor.value, next.key));
  else { setPick([next.key]); anchor.value = next.key; }
}

function onKeydown(event: KeyboardEvent) {
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key;
  if (mod && key.toLowerCase() === 'k') {
    event.preventDefault();
    paletteOpen.value = !paletteOpen.value;
    return;
  }
  if (anyLayerOpen()) return;
  if (key === 'Escape') {
    if (menu.value) { closeMenu(); return; }
    if (railOpen.value) { railOpen.value = false; return; }
    if (picked.value.size) { clearPick(); return; }
    if (query.value) { clearSearch(); return; }
    return;
  }
  if (isTyping(event.target)) return;
  if (mod && key.toLowerCase() === 'a' && shown.value.length) { event.preventDefault(); pickAll(); return; }
  if (mod || event.altKey && key !== 'ArrowUp') return;

  const focused = shown.value.find(item => item.key === focusKey.value) ?? null;
  const cols = columns();
  switch (key) {
    case '/': event.preventDefault(); searchInput.value?.focus(); searchInput.value?.select(); break;
    case '?': shortcutsOpen.value = true; break;
    case 'ArrowDown': event.preventDefault(); moveFocus(cols, event.shiftKey, false); break;
    case 'ArrowUp':
      event.preventDefault();
      if (event.altKey) goUp(); else moveFocus(-cols, event.shiftKey, false);
      break;
    case 'ArrowRight': if (prefs.layout === 'grid') { event.preventDefault(); moveFocus(1, event.shiftKey, false); } break;
    case 'ArrowLeft': if (prefs.layout === 'grid') { event.preventDefault(); moveFocus(-1, event.shiftKey, false); } break;
    case 'Home': event.preventDefault(); moveFocus(-shown.value.length, event.shiftKey, false); break;
    case 'End': event.preventDefault(); moveFocus(shown.value.length, event.shiftKey, false); break;
    case 'Enter': if (focused) { event.preventDefault(); openItem(focused); } break;
    case ' ':
      if (focused) { event.preventDefault(); if (focused.type === 'File') openViewer(focused); else openItem(focused); }
      break;
    case 'Backspace': event.preventDefault(); goUp(); break;
    case 'Delete': {
      const targets = picked.value.size ? pickedItems.value : focused ? [focused] : [];
      if (targets.length) { event.preventDefault(); askDelete(targets); }
      break;
    }
    case 'F2': {
      const target = pickedItems.value.length === 1 ? pickedItems.value[0] : focused;
      if (target) { event.preventDefault(); askRename(target); }
      break;
    }
    default: {
      const lower = key.toLowerCase();
      if (lower === 'x' && focused) {
        const next = new Set(picked.value);
        if (next.has(focused.key)) next.delete(focused.key); else next.add(focused.key);
        picked.value = next;
        anchor.value = focused.key;
      } else if (lower === 'u') pickFiles();
      else if (lower === 'n') askNewFolder();
      else if (lower === 'i') { if (isNarrow.value) sheetPinned.value = !sheetPinned.value; else prefs.sheet = !prefs.sheet; }
      else if (lower === 'r') refresh();
    }
  }
}

function refresh() {
  void cloud.load();
}

// ── life ──
/** The page's own width decides its layout (the site's nav takes part of the window). */
const root = ref<HTMLElement | null>(null);
const size = ref<'xl' | 'lg' | 'md' | 'sm'>('xl');
let resize: ResizeObserver | null = null;
function measure(width: number) {
  size.value = width >= 1380 ? 'xl' : width >= 1120 ? 'lg' : width >= 860 ? 'md' : 'sm';
  isNarrow.value = size.value === 'md' || size.value === 'sm';
  const left = root.value?.getBoundingClientRect().left ?? 0;
  root.value?.style.setProperty('--kcl-left', `${Math.max(0, Math.round(left))}px`);
}
let mediaCoarse: MediaQueryList | null = null;
const onCoarse = () => { coarse.value = !!mediaCoarse?.matches; };
const onWindowClick = () => closeMenu();
function onBeforeUnload(event: BeforeUnloadEvent) {
  if (cloud.uploading.value > 0) {
    event.preventDefault();
    event.returnValue = 'Uploads are still running.';
  }
}

onMounted(() => {
  applyUrl();
  if (root.value) {
    measure(root.value.clientWidth);
    resize = new ResizeObserver(entries => { const box = entries[0]?.contentRect; if (box) measure(box.width); });
    resize.observe(root.value);
  }
  mediaCoarse = window.matchMedia('(pointer: coarse)');
  onCoarse();
  mediaCoarse.addEventListener('change', onCoarse);
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('paste', onPaste);
  window.addEventListener('click', onWindowClick);
  window.addEventListener('beforeunload', onBeforeUnload);
  cloud.start();
});

onBeforeUnmount(() => {
  cloud.stop();
  forgetThumbs();
  resize?.disconnect();
  mediaCoarse?.removeEventListener('change', onCoarse);
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('paste', onPaste);
  window.removeEventListener('click', onWindowClick);
  window.removeEventListener('beforeunload', onBeforeUnload);
  clearTimeout(copiedTimer);
});
</script>

<style lang="scss" src="~/assets/scss/klivecloud.scss"></style>
