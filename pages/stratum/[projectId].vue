<template>
  <div class="stratum-project-page">
    <div v-if="loading" class="info-banner">Loading project…</div>
    <div v-else-if="loadError" class="error-banner">{{ loadError }}</div>
    <template v-else-if="project">
      <div class="page-header">
        <div>
          <NuxtLink to="/stratum" class="back-link">← All projects</NuxtLink>
          <h1 class="page-title">{{ project.name }}</h1>
          <p class="page-subtitle">{{ project.description || 'No description' }}</p>
        </div>
        <div class="header-actions">
          <button class="secondary-btn" @click="downloadBundle('printables')" :disabled="downloading !== null">{{ downloading === 'printables' ? '…' : 'Download printables' }}</button>
          <button class="secondary-btn" @click="downloadBundle('current')" :disabled="downloading !== null">{{ downloading === 'current' ? '…' : 'Download bundle' }}</button>
          <button class="secondary-btn" @click="downloadBundle('all')" :disabled="downloading !== null" title="Includes superseded iterations and all CadQuery scripts">{{ downloading === 'all' ? '…' : 'With history' }}</button>
          <button class="secondary-btn" @click="renameProject">Rename</button>
          <button class="danger-btn" @click="confirmDelete">Delete</button>
        </div>
      </div>

      <div class="workbench">
        <!-- The viewport IS the page — everything else floats above it. -->
        <StratumViewport :model-url="viewerUrl" :model-type="viewerType" :highlight-subtask="highlightedSubtask" />

        <!-- Left overlay: project (revisions / artifacts / attachments) -->
        <button v-if="!showProjectPanel" class="overlay-toggle toggle-left" @click="showProjectPanel = true">☰ Project</button>
        <aside v-else class="overlay overlay-left">
          <div class="overlay-head">
            <span>Project</span>
            <button class="overlay-close" title="Collapse" @click="showProjectPanel = false">✕</button>
          </div>
          <div class="overlay-scroll">
            <section class="panel">
              <h3>Revisions</h3>
              <ul class="rev-list">
                <li
                  v-for="rev in revisionsDesc"
                  :key="rev.RevisionID"
                  :class="{ active: rev.RevisionID === selectedRevisionID }"
                  @click="selectRevision(rev.RevisionID)"
                >
                  <span class="rev-index">#{{ rev.Index }}</span>
                  <span class="rev-title">{{ rev.Title || '(no title)' }}</span>
                  <span class="rev-time">{{ formatTime(rev.CreatedAt) }}</span>
                </li>
              </ul>
            </section>

            <section class="panel">
              <h3>Artifacts</h3>
              <div v-if="!selectedRevision" class="muted">Select a revision.</div>
              <ArtifactTreePanel
                v-else
                :artifacts="selectedRevision.Artifacts"
                :active-artifact-i-d="selectedArtifactID"
                @select="onUserSelectArtifact"
              />
            </section>

            <section class="panel">
              <h3>Attachments</h3>
              <div class="upload-row">
                <input ref="attachmentInput" type="file" multiple @change="onAttachmentPicked" />
              </div>
              <ul v-if="project.attachments?.length" class="attachment-list">
                <li v-for="att in project.attachments" :key="att.AttachmentID">
                  <span class="art-name">{{ att.FileName }}</span>
                  <span class="art-size">{{ formatBytes(att.SizeBytes) }}</span>
                  <button class="link-btn" @click="deleteAttachment(att.AttachmentID)">remove</button>
                </li>
              </ul>
              <div v-else class="muted">No reference attachments yet.</div>
            </section>
          </div>
        </aside>

        <!-- Right overlay: the Engineer conversation -->
        <button v-if="!showChatPanel" class="overlay-toggle toggle-right" @click="showChatPanel = true">💬 Engineer</button>
        <div v-else class="overlay overlay-right">
          <button class="overlay-close floating" title="Collapse" @click="showChatPanel = false">✕</button>
          <ConversationPanel
            :project-id="projectId"
            @select-artifact="onConversationArtifact"
            @project-changed="loadProject"
          />
        </div>

        <!-- Bottom overlay: inspector for the current selection -->
        <div
          v-if="hasInspectorContent"
          class="overlay overlay-bottom"
          :class="{ 'with-left': showProjectPanel, 'with-chat': showChatPanel, expanded: inspectorExpanded }"
        >
          <div class="viewer-meta">
            <strong>{{ selectedArtifact?.FileName }}</strong>
            <span v-if="selectedArtifact">{{ selectedArtifact.ContentType }}</span>
            <span v-if="selectedArtifact">{{ formatBytes(selectedArtifact.SizeBytes) }}</span>
            <button v-if="!showingAssembly" class="link-btn" @click="() => loadAssemblyIntoViewer()">← back to assembly</button>
            <span class="meta-spacer" />
            <button v-if="hasInspectorDetail" class="overlay-close" :title="inspectorExpanded ? 'Collapse details' : 'Expand details'" @click="inspectorExpanded = !inspectorExpanded">
              {{ inspectorExpanded ? '▾' : '▴' }}
            </button>
          </div>
          <div v-if="inspectorExpanded && hasInspectorDetail" class="inspector-detail">
            <WiringDiagram v-if="wiringGraph" :graph="wiringGraph" />
            <section v-if="firmwareSource" class="firmware-panel">
              <h4>Firmware source — {{ firmwareSource.fileName }}</h4>
              <pre class="firmware-code"><code>{{ firmwareSource.code }}</code></pre>
            </section>
            <section v-if="bom" class="bom-panel">
              <h4>Bill of materials</h4>
              <p v-if="bom.Notes" class="muted">{{ bom.Notes }}</p>
              <table class="bom-table">
                <thead><tr><th>Module</th><th>Role</th><th>Qty</th><th>Top distributor candidate</th></tr></thead>
                <tbody>
                  <tr v-for="line in bom.Lines" :key="line.ModuleId">
                    <td>{{ line.ModuleId }}</td>
                    <td>{{ line.Role }}</td>
                    <td>{{ line.Quantity }}</td>
                    <td>
                      <template v-if="line.DistributorCandidates && line.DistributorCandidates.length">
                        <a :href="line.DistributorCandidates[0].ProductDetailUrl" target="_blank" rel="noopener">
                          {{ line.DistributorCandidates[0].Manufacturer }} {{ line.DistributorCandidates[0].ManufacturerPartNumber }}
                        </a>
                        <span class="muted"> — {{ line.DistributorCandidates[0].PriceQty1 }} @ {{ line.DistributorCandidates[0].Distributor }}</span>
                      </template>
                      <span v-else class="muted">no distributor data</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Swal from 'sweetalert2';
import { KliveAPIUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import StratumViewport from '~/components/Stratum/StratumViewport.vue';
import WiringDiagram from '~/components/Stratum/WiringDiagram.vue';
import ArtifactTreePanel from '~/components/Stratum/ArtifactTreePanel.vue';
import ConversationPanel from '~/components/Stratum/ConversationPanel.vue';

definePageMeta({ layout: 'navbar' });

interface ArtifactDto {
  ArtifactID: string;
  Kind: string;
  FileName: string;
  ContentType: string;
  SizeBytes: number;
  ContentHash: string;
  CreatedAt: string;
  Metadata: Record<string, string>;
  Role?: string | null;
  SubtaskTitle?: string | null;
  SupersededByArtifactID?: string | null;
}
interface RevisionDto {
  RevisionID: string;
  Index: number;
  Title: string;
  Notes: string;
  CreatedAt: string;
  CreatedByUserID: string;
  ProducedByAgentRunID: string | null;
  Artifacts: ArtifactDto[];
}
interface AttachmentDto {
  AttachmentID: string;
  FileName: string;
  ContentType: string;
  SizeBytes: number;
  UploadedAt: string;
}
interface ProjectDetail {
  projectID: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  revisions: RevisionDto[];
  attachments: AttachmentDto[];
}

const route = useRoute();
const router = useRouter();
const projectId = String(route.params.projectId || '');

const project = ref<ProjectDetail | null>(null);
const loading = ref(true);
const loadError = ref('');
const selectedRevisionID = ref<string | null>(null);
const selectedArtifactID = ref<string | null>(null);
const viewerUrl = ref<string | null>(null);
const viewerType = ref<'glb' | 'stl' | null>(null);
const attachmentInput = ref<HTMLInputElement | null>(null);
const downloading = ref<'printables' | 'current' | 'all' | null>(null);
const highlightedSubtask = ref<string | null>(null);
const showingAssembly = ref(false);
// When true, the viewport live-follows the engineer's freshest output (latest assembly
// snapshot, or the newest part mesh before one is composed). Turned off the moment the
// user explicitly pins an artifact; re-enabled by "← back to assembly".
const autoFollow = ref(true);
// Overlay visibility — the viewport owns the page; these float above it.
const showProjectPanel = ref(true);
const showChatPanel = ref(true);
const inspectorExpanded = ref(false);
// ArtifactID of the assembly GLB currently auto-loaded in the viewport — used to
// resync after a refresh without flicker.
const activeAssemblyArtifactID = ref<string | null>(null);

const revisionsDesc = computed(() => [...(project.value?.revisions ?? [])].sort((a, b) => b.Index - a.Index));
const selectedRevision = computed(() => project.value?.revisions.find(r => r.RevisionID === selectedRevisionID.value) ?? null);
const selectedArtifact = computed(() => selectedRevision.value?.Artifacts.find(a => a.ArtifactID === selectedArtifactID.value) ?? null);

function normaliseProject(raw: any): ProjectDetail | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: ProjectDetail = {
    projectID: String(raw.projectID ?? ''),
    name: String(raw.name ?? ''),
    description: String(raw.description ?? ''),
    createdAt: String(raw.createdAt ?? ''),
    updatedAt: String(raw.updatedAt ?? ''),
    revisions: Array.isArray(raw.revisions) ? raw.revisions.map((r: any) => ({
      RevisionID: String(r.RevisionID ?? ''),
      Index: Number(r.Index) || 0,
      Title: String(r.Title ?? ''),
      Notes: String(r.Notes ?? ''),
      CreatedAt: String(r.CreatedAt ?? ''),
      CreatedByUserID: String(r.CreatedByUserID ?? ''),
      ProducedByAgentRunID: r.ProducedByAgentRunID ?? null,
      Artifacts: Array.isArray(r.Artifacts) ? r.Artifacts.map((a: any) => ({
        ArtifactID: String(a.ArtifactID ?? ''),
        Kind: String(a.Kind ?? 'Unknown'),
        FileName: String(a.FileName ?? ''),
        ContentType: String(a.ContentType ?? 'application/octet-stream'),
        SizeBytes: Number(a.SizeBytes) || 0,
        ContentHash: String(a.ContentHash ?? ''),
        CreatedAt: String(a.CreatedAt ?? ''),
        Metadata: a.Metadata && typeof a.Metadata === 'object' ? a.Metadata : {},
        Role: a.Role ?? null,
        SubtaskTitle: a.SubtaskTitle ?? null,
        SupersededByArtifactID: a.SupersededByArtifactID ?? null,
      })) : [],
    })) : [],
    attachments: Array.isArray(raw.attachments) ? raw.attachments.map((a: any) => ({
      AttachmentID: String(a.AttachmentID ?? ''),
      FileName: String(a.FileName ?? ''),
      ContentType: String(a.ContentType ?? 'application/octet-stream'),
      SizeBytes: Number(a.SizeBytes) || 0,
      UploadedAt: String(a.UploadedAt ?? ''),
    })) : [],
  };
  return out.projectID ? out : null;
}

async function loadProject() {
  // Only show the full-page loading banner on the first load. Subsequent refreshes
  // (e.g. when an agent opens a new gate) must NOT unmount the workbench, otherwise
  // the ConversationPanel loses its timeline cursor and the user perceives it as a reload.
  const isInitial = project.value === null;
  if (isInitial) loading.value = true;
  loadError.value = '';
  try {
    const res = await RequestGETFromKliveAPI(`/stratum/projects/get?projectID=${encodeURIComponent(projectId)}`, false, false);
    if (!res.ok) {
      loadError.value = `Failed to load project (HTTP ${res.status}).`;
      if (isInitial) project.value = null;
      return;
    }
    const data = normaliseProject(await res.json());
    project.value = data;
    if (isInitial && data && data.revisions.length) {
      selectedRevisionID.value = data.revisions[data.revisions.length - 1].RevisionID;
      // Auto-load the freshest viewable output (assembly preferred, else newest part mesh).
      const latest = pickLatestViewable(data);
      if (latest) await followViewable(latest);
    } else if (data && autoFollow.value) {
      // Live refresh (driven by the conversation's artifact-added events): keep the viewport
      // on the engineer's newest output so the model updates as parts/assemblies are produced,
      // without clobbering an explicit user selection (autoFollow is off once the user pins one).
      const latest = pickLatestViewable(data);
      if (latest && latest.ArtifactID !== selectedArtifactID.value) await followViewable(latest);
    }
  } catch (err: any) {
    loadError.value = err?.message ?? String(err);
    if (isInitial) project.value = null;
  } finally {
    if (isInitial) loading.value = false;
  }
}

function isViewable(art: ArtifactDto): boolean {
  return art.Kind === 'MeshGlb' || art.Kind === 'MeshStl';
}

function pickLatestAssemblyGlb(data: ProjectDetail): ArtifactDto | null {
  let best: ArtifactDto | null = null;
  for (const rev of data.revisions) {
    for (const a of rev.Artifacts) {
      if (a.Role !== 'assembly-snapshot') continue;
      if (a.Kind !== 'MeshGlb') continue;
      if (a.SupersededByArtifactID) continue;
      if (!best || a.CreatedAt > best.CreatedAt) best = a;
    }
  }
  return best;
}

// The artifact the viewport should show when following the engineer: the freshest assembly
// snapshot if one exists, otherwise the newest individual part mesh (so the user watches parts
// appear before they're composed).
function pickLatestViewable(data: ProjectDetail): ArtifactDto | null {
  const assembly = pickLatestAssemblyGlb(data);
  if (assembly) return assembly;
  let best: ArtifactDto | null = null;
  for (const rev of data.revisions) {
    for (const a of rev.Artifacts) {
      if (!isViewable(a)) continue;
      if (a.SupersededByArtifactID) continue;
      if (!best || a.CreatedAt > best.CreatedAt) best = a;
    }
  }
  return best;
}

// Load a viewable artifact into the viewport for the auto-follow path (does NOT disable
// following). Assembly snapshots go through the assembly loader so highlighting/electronics
// toggles work; anything else loads as a single mesh.
async function followViewable(art: ArtifactDto) {
  if (art.Role === 'assembly-snapshot' && art.Kind === 'MeshGlb') await loadAssemblyIntoViewer(art);
  else await selectArtifact(art);
}

async function loadAssemblyIntoViewer(art?: ArtifactDto) {
  if (!project.value) return;
  const assembly = art ?? pickLatestAssemblyGlb(project.value);
  if (!assembly) return;
  // Find the revision that owns the assembly artifact and select it so the artifact panel
  // reflects what's in the viewer.
  for (const rev of project.value.revisions) {
    if (rev.Artifacts.some(a => a.ArtifactID === assembly.ArtifactID)) {
      selectedRevisionID.value = rev.RevisionID;
      break;
    }
  }
  selectedArtifactID.value = assembly.ArtifactID;
  releaseViewerUrl();
  wiringGraph.value = null;
  bom.value = null;
  firmwareSource.value = null;
  const res = await RequestGETFromKliveAPI(
    `/stratum/artifacts/download?projectID=${encodeURIComponent(projectId)}&artifactID=${encodeURIComponent(assembly.ArtifactID)}`,
    false, false,
  );
  if (!res.ok) return;
  const blob = await res.blob();
  activeBlobUrl = URL.createObjectURL(blob);
  viewerUrl.value = activeBlobUrl;
  viewerType.value = 'glb';
  showingAssembly.value = true;
  activeAssemblyArtifactID.value = assembly.ArtifactID;
  highlightedSubtask.value = null;
  // Viewing the assembly means "follow the latest" — this also powers the ← back-to-assembly button.
  autoFollow.value = true;
}

// User explicitly picked an artifact from the tree: stop live-following so their selection sticks.
function onUserSelectArtifact(art: ArtifactDto) {
  autoFollow.value = false;
  selectArtifact(art);
}

async function downloadBundle(scope: 'printables' | 'current' | 'all') {
  if (downloading.value) return;
  downloading.value = scope;
  try {
    const res = await RequestGETFromKliveAPI(
      `/stratum/projects/download-bundle?projectID=${encodeURIComponent(projectId)}&include=${scope}`,
      false, false,
    );
    if (!res.ok) {
      console.error('bundle download failed', await res.text());
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (project.value?.name || 'project').replace(/[^A-Za-z0-9_-]/g, '_');
    a.href = url;
    a.download = `${safeName}_${scope}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } finally {
    downloading.value = null;
  }
}

async function onConversationArtifact(artifactID: string) {
  // The conversation referenced an artifact (gate chip / render). If it's a current part,
  // highlight it inside the assembly; otherwise load it into the viewer / inspector.
  if (!project.value) await loadProject();
  if (!project.value) return;
  for (const rev of project.value.revisions) {
    const art = rev.Artifacts.find(a => a.ArtifactID === artifactID);
    if (!art) continue;
    if (art.Role === 'part' && art.SubtaskTitle && showingAssembly.value) {
      highlightedSubtask.value = art.SubtaskTitle;
      return;
    }
    // Clicking a conversation reference pins that artifact (stops live-following).
    autoFollow.value = false;
    selectedRevisionID.value = rev.RevisionID;
    await selectArtifact(art);
    return;
  }
}

function isWiring(art: ArtifactDto): boolean { return art.Kind === 'WiringDiagram'; }
function isBom(art: ArtifactDto): boolean { return art.Kind === 'Bom'; }
function isFirmwareDoc(art: ArtifactDto): boolean {
  if (art.Kind !== 'Document') return false;
  const f = (art.FileName || '').toLowerCase();
  return f.endsWith('.cpp') || f.endsWith('.ino') || f.endsWith('.h') || f.endsWith('.hpp') || f.endsWith('.c');
}

const wiringGraph = ref<any | null>(null);
const bom = ref<any | null>(null);
const firmwareSource = ref<{ fileName: string; code: string } | null>(null);

const hasInspectorDetail = computed(() => !!(wiringGraph.value || firmwareSource.value || bom.value));
const hasInspectorContent = computed(() => !!selectedArtifact.value || hasInspectorDetail.value);

// Auto-expand the inspector when rich detail (wiring / firmware / BOM) arrives.
watch(hasInspectorDetail, has => { if (has) inspectorExpanded.value = true; });

function selectRevision(id: string) {
  selectedRevisionID.value = id;
  selectedArtifactID.value = null;
  releaseViewerUrl();
}

let activeBlobUrl: string | null = null;
function releaseViewerUrl() {
  if (activeBlobUrl) {
    URL.revokeObjectURL(activeBlobUrl);
    activeBlobUrl = null;
  }
  viewerUrl.value = null;
  viewerType.value = null;
}

async function selectArtifact(art: ArtifactDto) {
  selectedArtifactID.value = art.ArtifactID;
  releaseViewerUrl();
  wiringGraph.value = null;
  bom.value = null;
  firmwareSource.value = null;
  // If the user picked an assembly GLB, keep the persistent-assembly flag on so a later
  // gate-resolution refresh can swap to a newer snapshot automatically. Otherwise pin to
  // the explicit selection.
  showingAssembly.value = (art.Role === 'assembly-snapshot' && art.Kind === 'MeshGlb' && !art.SupersededByArtifactID);
  if (!showingAssembly.value) activeAssemblyArtifactID.value = null;
  highlightedSubtask.value = null;
  if (isWiring(art) || isBom(art)) {
    const res = await RequestGETFromKliveAPI(
      `/stratum/artifacts/download?projectID=${encodeURIComponent(projectId)}&artifactID=${encodeURIComponent(art.ArtifactID)}`,
      false, false,
    );
    if (!res.ok) return;
    try {
      const data = await res.json();
      if (isWiring(art)) wiringGraph.value = data;
      else bom.value = data;
    } catch { /* not JSON, ignore */ }
    return;
  }
  if (isFirmwareDoc(art)) {
    const res = await RequestGETFromKliveAPI(
      `/stratum/artifacts/download?projectID=${encodeURIComponent(projectId)}&artifactID=${encodeURIComponent(art.ArtifactID)}`,
      false, false,
    );
    if (!res.ok) return;
    try { firmwareSource.value = { fileName: art.FileName, code: await res.text() }; } catch { /* ignore */ }
    return;
  }
  if (!isViewable(art)) return;

  // Fetch as blob through the auth-aware fetch wrapper so the viewport
  // doesn't need to handle Authorization headers itself.
  const res = await RequestGETFromKliveAPI(
    `/stratum/artifacts/download?projectID=${encodeURIComponent(projectId)}&artifactID=${encodeURIComponent(art.ArtifactID)}`,
    false,
    false,
  );
  if (!res.ok) return;
  const blob = await res.blob();
  activeBlobUrl = URL.createObjectURL(blob);
  viewerUrl.value = activeBlobUrl;
  viewerType.value = art.Kind === 'MeshGlb' ? 'glb' : 'stl';
}

async function renameProject() {
  if (!project.value) return;
  const result = await Swal.fire({
    title: 'Rename project',
    html:
      `<input id="swal-name" class="swal2-input" value="${escapeAttr(project.value.name)}">` +
      `<textarea id="swal-desc" class="swal2-textarea">${escapeText(project.value.description)}</textarea>`,
    background: '#161516', color: '#ffffff', confirmButtonColor: '#4d9e39',
    showCancelButton: true,
    preConfirm: () => ({
      name: (document.getElementById('swal-name') as HTMLInputElement)?.value?.trim(),
      description: (document.getElementById('swal-desc') as HTMLTextAreaElement)?.value ?? '',
    }),
  });
  if (!result.isConfirmed || !result.value) return;
  const res = await RequestPOSTFromKliveAPI(
    `/stratum/projects/rename?projectID=${encodeURIComponent(projectId)}`,
    JSON.stringify(result.value), false, true,
  );
  if (res.ok) await loadProject();
}

async function confirmDelete() {
  const result = await Swal.fire({
    title: 'Delete this project?',
    text: 'This permanently removes all revisions and artifacts metadata. Blob storage is content-addressed and may be retained.',
    icon: 'warning', showCancelButton: true,
    confirmButtonColor: '#c0392b', confirmButtonText: 'Delete',
    background: '#161516', color: '#ffffff',
  });
  if (!result.isConfirmed) return;
  const res = await RequestPOSTFromKliveAPI(
    `/stratum/projects/delete?projectID=${encodeURIComponent(projectId)}`,
    '', false, false,
  );
  if (res.ok) router.push('/stratum');
}

async function onAttachmentPicked(ev: Event) {
  const input = ev.target as HTMLInputElement;
  if (!input.files?.length) return;
  for (const f of Array.from(input.files)) await uploadAttachment(f);
  input.value = '';
  await loadProject();
}

async function uploadAttachment(file: File) {
  const params = new URLSearchParams({
    projectID: projectId,
    fileName: file.name,
    contentType: file.type || 'application/octet-stream',
  });
  const buf = await file.arrayBuffer();
  await RequestPOSTFromKliveAPI(`/stratum/attachments/upload?${params.toString()}`, buf, false, false);
}

async function deleteAttachment(attachmentID: string) {
  const params = new URLSearchParams({ projectID: projectId, attachmentID });
  const res = await RequestPOSTFromKliveAPI(`/stratum/attachments/delete?${params.toString()}`, '', false, false);
  if (res.ok) await loadProject();
}

function formatTime(iso: string) {
  if (!iso) return '?';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '?' : d.toLocaleString();
}
function formatBytes(n: number) {
  if (!Number.isFinite(n)) return '?';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
function escapeAttr(s: string) { return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function escapeText(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

onMounted(loadProject);
onBeforeUnmount(releaseViewerUrl);
watch(() => route.params.projectId, () => loadProject());
</script>

<style scoped>
.stratum-project-page { padding: 12px 16px; color: #e6e6e6; height: 100vh; display: flex; flex-direction: column; box-sizing: border-box; }
.page-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 10px; flex: 0 0 auto; }
.page-title { margin: 0; font-size: 20px; }
.page-subtitle { margin: 2px 0 0; color: #888; font-size: 12px; }
.back-link { color: #4d9e39; text-decoration: none; font-size: 13px; }
.back-link:hover { text-decoration: underline; }
.header-actions { display: flex; gap: 8px; }
.secondary-btn, .danger-btn {
  padding: 8px 14px; border-radius: 6px; border: none; cursor: pointer;
  font-weight: 600; font-size: 13px;
}
.secondary-btn { background: #2a2a2e; color: #eee; }
.secondary-btn:hover { background: #3a3a3e; }
.danger-btn { background: #c0392b; color: #fff; }
.danger-btn:hover { background: #d85447; }

.info-banner, .error-banner {
  padding: 16px; border-radius: 6px; background: #1f1f23; margin-bottom: 12px;
}
.error-banner { color: #ff8484; background: #2a1818; }

/* ── The viewport owns the workbench; panels float above it ── */
.workbench { position: relative; flex: 1; min-height: 0; border-radius: 10px; overflow: hidden; }
.workbench :deep(.stratum-viewport-root) {
  position: absolute; inset: 0; height: 100%; min-height: 0; border-radius: 10px;
}
/* The viewport's own toolbar + status pills default to the corners — the corners now belong
   to the floating panels, so park them in the free top-centre strip instead. */
.workbench :deep(.viewport-toolbar) { top: 12px; left: 50%; right: auto; transform: translateX(-50%); }
.workbench :deep(.viewport-status),
.workbench :deep(.viewport-empty) { top: 52px; left: 50%; transform: translateX(-50%); white-space: nowrap; }

.overlay {
  position: absolute; z-index: 5;
  background: rgba(26, 26, 30, 0.88); backdrop-filter: blur(8px);
  border: 1px solid #2f2f34; border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
  display: flex; flex-direction: column; min-height: 0;
}
.overlay-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 12px; border-bottom: 1px solid #2a2a2e; flex: 0 0 auto;
  font-size: 12px; color: #aaa; text-transform: uppercase; letter-spacing: 0.05em;
}
.overlay-close {
  background: none; border: none; color: #888; cursor: pointer; font-size: 12px;
  padding: 2px 6px; border-radius: 4px;
}
.overlay-close:hover { color: #fff; background: #2a2a2e; }
.overlay-close.floating { position: absolute; top: 10px; right: 10px; z-index: 6; }
.overlay-scroll { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 10px; min-height: 0; }

.overlay-left { top: 12px; left: 12px; bottom: 12px; width: 304px; max-width: 28vw; }
.overlay-right { top: 12px; right: 12px; bottom: 12px; width: 460px; max-width: 42vw; }
.overlay-right :deep(.conversation-panel) {
  flex: 1; min-height: 0; border: none; background: transparent;
}
/* Keep the panel's status/cancel clear of the floating collapse button. */
.overlay-right :deep(.conv-header) { padding-right: 30px; }

.overlay-toggle {
  position: absolute; z-index: 5;
  background: rgba(26, 26, 30, 0.88); backdrop-filter: blur(8px);
  border: 1px solid #2f2f34; color: #cfcfcf; border-radius: 18px;
  padding: 7px 14px; font-size: 12px; font-weight: 600; cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}
.overlay-toggle:hover { color: #fff; border-color: #4d9e39; }
.toggle-left { top: 12px; left: 12px; }
.toggle-right { top: 12px; right: 12px; }

/* Bottom inspector: stays clear of whichever side overlays are open. */
.overlay-bottom { bottom: 12px; left: 12px; right: 12px; max-height: 44px; overflow: hidden; }
.overlay-bottom.expanded { max-height: 46vh; overflow-y: auto; }
.overlay-bottom.with-left { left: 328px; }
.overlay-bottom.with-chat { right: 484px; }

.panel { background: rgba(31, 31, 35, 0.6); border-radius: 8px; padding: 12px; border: 1px solid #2a2a2e; }
.panel h3 { margin: 0 0 10px; font-size: 13px; color: #aaa; text-transform: uppercase; letter-spacing: 0.05em; }
.rev-list, .artifact-list, .attachment-list { list-style: none; margin: 0; padding: 0; }
.rev-list li, .artifact-list li, .attachment-list li {
  display: flex; gap: 8px; align-items: center; padding: 8px;
  border-radius: 4px; cursor: pointer; font-size: 13px;
}
.rev-list li:hover, .artifact-list li:hover { background: #2a2a2e; }
.rev-list li.active, .artifact-list li.active { background: #2d4030; color: #b9e8b4; }
.rev-index { font-family: monospace; color: #888; min-width: 32px; }
.rev-title { flex: 1; }
.rev-time { font-size: 11px; color: #666; }
.art-kind { font-size: 10px; padding: 2px 6px; background: #2a2a2e; border-radius: 3px; color: #aaa; }
.art-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.art-size { font-size: 11px; color: #666; }
.attachment-list li { background: rgba(22, 22, 24, 0.7); }
.upload-row { margin-bottom: 10px; }
.upload-row input[type=file] { font-size: 12px; color: #aaa; width: 100%; }
.link-btn { background: none; border: none; color: #ff8484; cursor: pointer; font-size: 11px; }
.muted { color: #666; font-size: 12px; }

.viewer-meta {
  display: flex; gap: 16px; align-items: center; padding: 10px 12px;
  font-size: 12px; color: #aaa; flex: 0 0 auto;
}
.meta-spacer { flex: 1; }
.inspector-detail { padding: 0 12px 12px; display: flex; flex-direction: column; gap: 10px; }
.firmware-panel {
  background: rgba(31, 31, 35, 0.6); border: 1px solid #2a2a2e; border-radius: 8px; padding: 12px;
}
.firmware-panel h4 { margin: 0 0 8px; font-size: 13px; color: #aaa; text-transform: uppercase; letter-spacing: 0.05em; }
.firmware-code {
  background: #0e0e10; color: #d8d8d8; padding: 12px; border-radius: 6px;
  font-family: 'Consolas', 'Courier New', monospace; font-size: 12px;
  max-height: 380px; overflow: auto; margin: 0;
  white-space: pre-wrap; word-break: break-word;
}
.bom-panel { background: rgba(31, 31, 35, 0.6); border: 1px solid #2a2a2e; border-radius: 8px; padding: 12px; }
</style>
