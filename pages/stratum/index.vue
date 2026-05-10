<template>
  <div class="stratum-list-page">
    <div class="page-header">
      <div>
        <h1 class="page-title">Stratum</h1>
        <p class="page-subtitle">Agentic mechatronics design — projects</p>
      </div>
      <button class="primary-btn" @click="openCreateDialog">+ New project</button>
    </div>

    <div v-if="loading" class="info-banner">Loading projects…</div>
    <div v-else-if="loadError" class="error-banner">{{ loadError }}</div>
    <div v-else-if="!projects.length" class="empty-banner">
      No projects yet. Create one to start designing.
    </div>

    <div v-else class="project-grid">
      <NuxtLink
        v-for="p in projects"
        :key="p.projectID"
        :to="`/stratum/${p.projectID}`"
        class="project-card"
      >
        <div class="card-title">{{ p.name || '(untitled)' }}</div>
        <div class="card-desc">{{ p.description || 'No description' }}</div>
        <div class="card-meta">
          <span>{{ p.revisionCount }} revision{{ p.revisionCount === 1 ? '' : 's' }}</span>
          <span>{{ p.attachmentCount }} attachment{{ p.attachmentCount === 1 ? '' : 's' }}</span>
        </div>
        <div class="card-time">Updated {{ formatTime(p.updatedAt) }}</div>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import Swal from 'sweetalert2';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

definePageMeta({ layout: 'navbar' });

interface ProjectSummary {
  projectID: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  revisionCount: number;
  attachmentCount: number;
}

const projects = ref<ProjectSummary[]>([]);
const loading = ref(true);
const loadError = ref('');

function normaliseProjects(raw: unknown): ProjectSummary[] {
  // Defensive: API can return Response-like fallbacks under failure modes.
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is Record<string, any> => p && typeof p === 'object')
    .map(p => ({
      projectID: String(p.projectID ?? ''),
      name: String(p.name ?? ''),
      description: String(p.description ?? ''),
      createdAt: String(p.createdAt ?? ''),
      updatedAt: String(p.updatedAt ?? ''),
      revisionCount: Number.isFinite(Number(p.revisionCount)) ? Number(p.revisionCount) : 0,
      attachmentCount: Number.isFinite(Number(p.attachmentCount)) ? Number(p.attachmentCount) : 0,
    }))
    .filter(p => p.projectID);
}

async function loadProjects() {
  loading.value = true;
  loadError.value = '';
  try {
    const res = await RequestGETFromKliveAPI('/stratum/projects', false, false);
    if (!res.ok) {
      loadError.value = `Failed to load projects (HTTP ${res.status}).`;
      projects.value = [];
      return;
    }
    const json = await res.json();
    projects.value = normaliseProjects(json);
  } catch (err: any) {
    loadError.value = err?.message ?? String(err);
    projects.value = [];
  } finally {
    loading.value = false;
  }
}

async function openCreateDialog() {
  const result = await Swal.fire({
    title: 'New Stratum project',
    html:
      '<input id="swal-name" class="swal2-input" placeholder="Project name">' +
      '<textarea id="swal-desc" class="swal2-textarea" placeholder="Describe what you want to build (optional)"></textarea>',
    background: '#161516',
    color: '#ffffff',
    confirmButtonColor: '#4d9e39',
    showCancelButton: true,
    preConfirm: () => {
      const name = (document.getElementById('swal-name') as HTMLInputElement)?.value?.trim();
      const desc = (document.getElementById('swal-desc') as HTMLTextAreaElement)?.value?.trim() ?? '';
      if (!name) {
        Swal.showValidationMessage('Project name required');
        return false;
      }
      return { name, description: desc };
    },
  });
  if (!result.isConfirmed || !result.value) return;

  const res = await RequestPOSTFromKliveAPI(
    '/stratum/projects/create',
    JSON.stringify(result.value),
    false,
    true,
  );
  if (!res.ok) {
    Swal.fire({ icon: 'error', title: 'Create failed', text: `HTTP ${res.status}`, background: '#161516', color: '#ffffff' });
    return;
  }
  await loadProjects();
}

function formatTime(iso: string): string {
  if (!iso) return '?';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '?';
  return d.toLocaleString();
}

onMounted(loadProjects);
</script>

<style scoped>
.stratum-list-page { padding: 24px; color: #e6e6e6; }
.page-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 24px; }
.page-title { margin: 0; font-size: 28px; }
.page-subtitle { margin: 4px 0 0; color: #888; font-size: 14px; }
.primary-btn {
  background: #4d9e39; color: #fff; border: none;
  padding: 10px 18px; border-radius: 6px; cursor: pointer; font-weight: 600;
}
.primary-btn:hover { background: #5cb947; }
.info-banner, .error-banner, .empty-banner {
  padding: 16px; border-radius: 6px; background: #1f1f23; margin-bottom: 12px;
}
.error-banner { color: #ff8484; background: #2a1818; }
.project-grid {
  display: grid; gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
}
.project-card {
  display: block; padding: 16px; background: #1f1f23; border-radius: 8px;
  text-decoration: none; color: inherit; border: 1px solid #2a2a2e;
  transition: transform 0.1s, border-color 0.1s;
}
.project-card:hover { transform: translateY(-2px); border-color: #4d9e39; }
.card-title { font-size: 18px; font-weight: 600; margin-bottom: 6px; }
.card-desc { font-size: 13px; color: #aaa; margin-bottom: 12px; min-height: 32px; }
.card-meta { display: flex; gap: 12px; font-size: 12px; color: #888; margin-bottom: 6px; }
.card-time { font-size: 11px; color: #666; }
</style>
