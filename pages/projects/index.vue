<template>
  <div class="projects-list-page">
    <div class="page-header">
      <div>
        <h1 class="page-title">Projects</h1>
        <p class="page-subtitle">Autonomous 24/7 agent task force</p>
      </div>
      <button class="primary-btn" @click="openCreateDialog">+ New project</button>
    </div>

    <div v-if="loading" class="info-banner">Loading projects…</div>
    <div v-else-if="loadError" class="error-banner">{{ loadError }}</div>
    <div v-else-if="!projects.length" class="empty-banner">
      No projects yet. Create one with a goal and a budget to set the fleet to work.
    </div>

    <div v-else class="project-grid">
      <NuxtLink
        v-for="p in projects"
        :key="p.projectID"
        :to="`/projects/${p.projectID}`"
        class="project-card"
      >
        <div class="card-head">
          <div class="card-title">{{ p.name || '(untitled)' }}</div>
          <span class="status-pill" :class="statusClass(p.status)">
            <span v-if="p.status === 'Active'" class="live-dot"></span>{{ p.status }}
          </span>
        </div>
        <div class="card-goal">{{ p.goal || 'No goal' }}</div>

        <div class="card-spend">
          <div class="spend-row">
            <span>Tokens ${{ fmt(p.tokenSpendUsd) }} / ${{ fmt(p.tokenBudgetUsd) }}</span>
            <span v-if="p.pendingApprovals" class="pending">{{ p.pendingApprovals }} pending</span>
          </div>
          <div class="spend-bar"><div class="spend-fill" :class="{ danger: frac(p.tokenSpendUsd, p.tokenBudgetUsd) >= 0.8 }" :style="{ width: pct(p.tokenSpendUsd, p.tokenBudgetUsd) }"></div></div>
        </div>

        <div class="card-meta">
          <span>money ${{ fmt(p.moneySpendUsd) }} / ${{ fmt(p.moneyBudgetUsd) }}</span>
          <span>cap {{ p.subAgentCap }}</span>
        </div>
        <div class="card-time">Started {{ formatTime(p.createdAt) }}</div>
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
  goal: string;
  status: string;
  createdAt: string;
  tokenBudgetUsd: number;
  moneyBudgetUsd: number;
  subAgentCap: number;
  tokenSpendUsd: number;
  moneySpendUsd: number;
  pendingApprovals: number;
}

const projects = ref<ProjectSummary[]>([]);
const loading = ref(true);
const loadError = ref('');

function normalise(raw: unknown): ProjectSummary[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p): p is Record<string, any> => p && typeof p === 'object')
    .map(p => ({
      projectID: String(p.projectID ?? ''),
      name: String(p.name ?? ''),
      goal: String(p.goal ?? ''),
      status: String(p.status ?? 'Active'),
      createdAt: String(p.createdAt ?? ''),
      tokenBudgetUsd: Number(p.tokenBudgetUsd ?? 0),
      moneyBudgetUsd: Number(p.moneyBudgetUsd ?? 0),
      subAgentCap: Number(p.subAgentCap ?? 0),
      tokenSpendUsd: Number(p.tokenSpendUsd ?? 0),
      moneySpendUsd: Number(p.moneySpendUsd ?? 0),
      pendingApprovals: Number(p.pendingApprovals ?? 0),
    }))
    .filter(p => p.projectID);
}

async function loadProjects() {
  loading.value = true;
  loadError.value = '';
  try {
    const res = await RequestGETFromKliveAPI('/projects/list', false, false);
    if (!res.ok) {
      loadError.value = `Failed to load projects (HTTP ${res.status}).`;
      projects.value = [];
      return;
    }
    projects.value = normalise(await res.json());
  } catch (err: any) {
    loadError.value = err?.message ?? String(err);
    projects.value = [];
  } finally {
    loading.value = false;
  }
}

async function openCreateDialog() {
  const result = await Swal.fire({
    title: 'New Project',
    html:
      '<input id="p-name" class="swal2-input" placeholder="Project name">' +
      '<textarea id="p-goal" class="swal2-textarea" placeholder="The goal (e.g. run a successful dropshipping store)"></textarea>' +
      '<input id="p-token" class="swal2-input" type="number" placeholder="Token budget (USD)">' +
      '<input id="p-money" class="swal2-input" type="number" placeholder="Money budget (USD)">' +
      '<input id="p-threshold" class="swal2-input" type="number" placeholder="Autonomous money / action (USD)">' +
      '<input id="p-cap" class="swal2-input" type="number" placeholder="Agent cap (e.g. 5)">',
    background: '#161516',
    color: '#ffffff',
    confirmButtonColor: '#4d9e39',
    showCancelButton: true,
    preConfirm: () => {
      const val = (id: string) => (document.getElementById(id) as HTMLInputElement)?.value?.trim();
      const name = val('p-name');
      const goal = val('p-goal');
      const tokenBudgetUsd = Number(val('p-token'));
      if (!name || !goal) { Swal.showValidationMessage('Name and goal are required'); return false; }
      if (!(tokenBudgetUsd > 0)) { Swal.showValidationMessage('Token budget must be > 0'); return false; }
      return {
        name, goal, tokenBudgetUsd,
        moneyBudgetUsd: Number(val('p-money')) || 0,
        moneyAutonomousThresholdUsd: Number(val('p-threshold')) || 0,
        subAgentCap: Number(val('p-cap')) || 5,
      };
    },
  });
  if (!result.isConfirmed || !result.value) return;
  const res = await RequestPOSTFromKliveAPI('/projects/create', JSON.stringify(result.value), false, true);
  if (!res.ok) {
    Swal.fire({ icon: 'error', title: 'Create failed', text: `HTTP ${res.status}`, background: '#161516', color: '#ffffff' });
    return;
  }
  await loadProjects();
}

function statusClass(s: string) { return 's-' + (s || '').toLowerCase(); }
function fmt(n: number) { return (Number(n) || 0).toFixed(2); }
function frac(a: number, b: number) { return b > 0 ? Math.min(1, (Number(a) || 0) / b) : 0; }
function pct(a: number, b: number) { return (frac(a, b) * 100).toFixed(1) + '%'; }
function formatTime(iso: string): string {
  if (!iso) return '?';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '?' : d.toLocaleString();
}

onMounted(loadProjects);
</script>

<style scoped>
.projects-list-page { padding: 24px; color: #e6e6e6; }
.page-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 24px; }
.page-title { margin: 0; font-size: 28px; }
.page-subtitle { margin: 4px 0 0; color: #888; font-size: 14px; }
.primary-btn { background: #4d9e39; color: #fff; border: none; padding: 10px 18px; border-radius: 6px; cursor: pointer; font-weight: 600; }
.primary-btn:hover { background: #5cb947; }
.info-banner, .error-banner, .empty-banner { padding: 16px; border-radius: 6px; background: #1f1f23; margin-bottom: 12px; }
.error-banner { color: #ff8484; background: #2a1818; }
.project-grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
.project-card { display: block; padding: 16px; background: #1f1f23; border-radius: 8px; text-decoration: none; color: inherit; border: 1px solid #2a2a2e; transition: transform 0.1s, border-color 0.1s; }
.project-card:hover { transform: translateY(-2px); border-color: #4d9e39; }
.card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.card-title { font-size: 18px; font-weight: 600; }
.card-goal { font-size: 13px; color: #aaa; margin-bottom: 12px; min-height: 34px; }
.card-spend { margin-bottom: 10px; }
.spend-row { display: flex; justify-content: space-between; font-size: 11px; color: #888; margin-bottom: 4px; }
.pending { color: #d9b872; font-weight: 600; }
.spend-bar { height: 6px; background: #26262b; border-radius: 3px; overflow: hidden; }
.spend-fill { height: 100%; background: #4d9e39; border-radius: 3px; transition: width 0.3s; }
.spend-fill.danger { background: #d98c2b; }
.card-meta { display: flex; gap: 12px; font-size: 12px; color: #888; margin-bottom: 6px; }
.card-time { font-size: 11px; color: #666; }
.status-pill { font-size: 11px; padding: 2px 8px; border-radius: 10px; text-transform: capitalize; display: inline-flex; align-items: center; gap: 5px; }
.live-dot { width: 6px; height: 6px; border-radius: 50%; background: #7fd97f; animation: blink 1.6s ease-in-out infinite; }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
.s-active { background: #1d3a1d; color: #7fd97f; }
.s-paused, .s-budgetpaused { background: #3a331d; color: #d9c47f; }
.s-completed { background: #1d2a3a; color: #7fb0d9; }
.s-archived { background: #2a2a2e; color: #999; }
</style>
