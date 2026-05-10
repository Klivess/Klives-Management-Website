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
          <button class="secondary-btn" @click="renameProject">Rename</button>
          <button class="danger-btn" @click="confirmDelete">Delete</button>
        </div>
      </div>

      <div class="workbench">
        <aside class="sidebar">
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
            <div v-else-if="!selectedRevision.Artifacts.length" class="muted">No artifacts in this revision yet.</div>
            <ul v-else class="artifact-list">
              <li
                v-for="art in selectedRevision.Artifacts"
                :key="art.ArtifactID"
                :class="{ active: art.ArtifactID === selectedArtifactID }"
                @click="selectArtifact(art)"
              >
                <span class="art-kind">{{ art.Kind }}</span>
                <span class="art-name">{{ art.FileName }}</span>
                <span class="art-size">{{ formatBytes(art.SizeBytes) }}</span>
              </li>
            </ul>
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
        </aside>

        <div class="main-area">
          <StratumViewport :model-url="viewerUrl" :model-type="viewerType" />
          <div v-if="selectedArtifact" class="viewer-meta">
            <strong>{{ selectedArtifact.FileName }}</strong>
            <span>{{ selectedArtifact.ContentType }}</span>
            <span>{{ formatBytes(selectedArtifact.SizeBytes) }}</span>
          </div>
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
          <AgentRunPanel :project-id="projectId" @project-changed="loadProject" @gate-preview="onGatePreview" />
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
import AgentRunPanel from '~/components/Stratum/AgentRunPanel.vue';
import WiringDiagram from '~/components/Stratum/WiringDiagram.vue';

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
  loading.value = true;
  loadError.value = '';
  try {
    const res = await RequestGETFromKliveAPI(`/stratum/projects/get?projectID=${encodeURIComponent(projectId)}`, false, false);
    if (!res.ok) {
      loadError.value = `Failed to load project (HTTP ${res.status}).`;
      project.value = null;
      return;
    }
    const data = normaliseProject(await res.json());
    project.value = data;
    if (data && data.revisions.length) {
      const latest = data.revisions[data.revisions.length - 1];
      selectedRevisionID.value = latest.RevisionID;
      // Auto-pick a viewable artifact, if any.
      const viewable = latest.Artifacts.find(isViewable);
      if (viewable) selectArtifact(viewable);
    }
  } catch (err: any) {
    loadError.value = err?.message ?? String(err);
    project.value = null;
  } finally {
    loading.value = false;
  }
}

function isViewable(art: ArtifactDto): boolean {
  return art.Kind === 'MeshGlb' || art.Kind === 'MeshStl';
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

async function onGatePreview(payload: { runID: string; gateID: string; artifactIDs: string[] }) {
  // A new gate just opened with proposed artifacts — refresh project, switch to the
  // revision that contains them, then auto-select the most relevant one (wiring > 3D > BOM).
  await loadProject();
  if (!project.value) return;
  const ids = new Set(payload.artifactIDs);
  for (let i = project.value.revisions.length - 1; i >= 0; i--) {
    const rev = project.value.revisions[i];
    const wiring = rev.Artifacts.find(a => ids.has(a.ArtifactID) && isWiring(a));
    const viewable = rev.Artifacts.find(a => ids.has(a.ArtifactID) && isViewable(a));
    const bomArt = rev.Artifacts.find(a => ids.has(a.ArtifactID) && isBom(a));
    const firmware = rev.Artifacts.find(a => ids.has(a.ArtifactID) && isFirmwareDoc(a));
    const pick = viewable || wiring || firmware || bomArt;
    if (pick) {
      selectedRevisionID.value = rev.RevisionID;
      await selectArtifact(pick);
      // For electronics gates, also pre-load the wiring + BOM regardless of which one is
      // "viewer-selected", so the panels render below the 3D viewport.
      if (wiring && pick.ArtifactID !== wiring.ArtifactID) {
        const r = await RequestGETFromKliveAPI(`/stratum/artifacts/download?projectID=${encodeURIComponent(projectId)}&artifactID=${encodeURIComponent(wiring.ArtifactID)}`, false, false);
        if (r.ok) { try { wiringGraph.value = await r.json(); } catch { /* ignore */ } }
      }
      if (bomArt && pick.ArtifactID !== bomArt.ArtifactID) {
        const r = await RequestGETFromKliveAPI(`/stratum/artifacts/download?projectID=${encodeURIComponent(projectId)}&artifactID=${encodeURIComponent(bomArt.ArtifactID)}`, false, false);
        if (r.ok) { try { bom.value = await r.json(); } catch { /* ignore */ } }
      }
      return;
    }
  }
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
.stratum-project-page { padding: 24px; color: #e6e6e6; height: calc(100vh - 0px); display: flex; flex-direction: column; }
.page-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 16px; }
.page-title { margin: 0; font-size: 24px; }
.page-subtitle { margin: 4px 0 0; color: #888; font-size: 13px; }
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

.workbench {
  display: grid; grid-template-columns: 320px 1fr; gap: 16px; flex: 1; min-height: 0;
}
.sidebar { display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }
.panel {
  background: #1f1f23; border-radius: 8px; padding: 14px;
  border: 1px solid #2a2a2e;
}
.panel h3 { margin: 0 0 10px; font-size: 14px; color: #aaa; text-transform: uppercase; letter-spacing: 0.05em; }
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
.attachment-list li { background: #161618; }
.upload-row { margin-bottom: 10px; }
.upload-row input[type=file] { font-size: 12px; color: #aaa; width: 100%; }
.link-btn { background: none; border: none; color: #ff8484; cursor: pointer; font-size: 11px; }
.muted { color: #666; font-size: 12px; }

.main-area { display: flex; flex-direction: column; gap: 8px; min-height: 0; overflow-y: auto; }
.main-area :deep(.stratum-viewport-root) {
  flex: 0 0 clamp(220px, 38vh, 440px);
  height: auto;
}
.main-area :deep(.agent-run-panel) {
  flex: 1 1 auto;
}
.viewer-meta {
  display: flex; gap: 16px; padding: 8px 12px; background: #1f1f23;
  border-radius: 6px; font-size: 12px; color: #aaa;
}
.firmware-panel {
  background: #1f1f23; border: 1px solid #2a2a2e; border-radius: 8px; padding: 12px;
}
.firmware-panel h4 { margin: 0 0 8px; font-size: 13px; color: #aaa; text-transform: uppercase; letter-spacing: 0.05em; }
.firmware-code {
  background: #0e0e10; color: #d8d8d8; padding: 12px; border-radius: 6px;
  font-family: 'Consolas', 'Courier New', monospace; font-size: 12px;
  max-height: 480px; overflow: auto; margin: 0;
  white-space: pre-wrap; word-break: break-word;
}
</style>
