<template>
  <ProjectsShell :status="shellStatus" :status-tone="shellTone">
    <div class="ot-pagehead">
      <div>
        <h1>Computers</h1>
        <p class="subtitle">Every agent's desktop across all projects, as its own control daemon reports it. Repairs are gentlest first and never touch an agent's files or sign-ins.</p>
      </div>
      <div class="ot-actions">
        <label class="ot-check"><input v-model="livePreviews" type="checkbox" /> Live previews</label>
        <button class="ot-btn ghost" :disabled="refreshing" @click="load">{{ refreshing ? 'Refreshing…' : 'Refresh' }}</button>
      </div>
    </div>

    <div v-if="hostProblem" class="ot-banner" role="alert">
      <span class="glyph" aria-hidden="true">⚠</span>
      <div>
        <strong>The computer host is unavailable</strong>
        {{ hostProblem }}
        <ul v-if="health?.recoveryStatus"><li>{{ health.recoveryStatus }}</li></ul>
      </div>
    </div>
    <div v-else-if="health?.recoveryInProgress" class="ot-banner warn" role="status">
      <span class="glyph" aria-hidden="true">↻</span>
      <div><strong>Recovering the computer host</strong>{{ health.recoveryStatus }}</div>
    </div>
    <div v-if="notice" class="ot-banner" :class="notice.tone" role="status">
      <span class="glyph" aria-hidden="true">{{ notice.tone === 'ok' ? '✓' : '⚠' }}</span>
      <div>{{ notice.text }}</div>
      <div class="actions"><button class="ot-btn ghost sm" @click="notice = null">Dismiss</button></div>
    </div>

    <section class="ot-kpis" aria-label="Computer host summary">
      <OmniTraderKpi label="Running" :value="`${counts.running} / ${health?.capacity?.maxRunningDesktops ?? '?'}`" :loading="loading"
        :foot="`slots on a ${health?.capacity?.daemonMemoryGB ?? '?'} GB Docker VM · ${health?.capacity?.desktopMemoryLimitGB ?? '?'} GB each`"
        :tone="counts.running >= (health?.capacity?.maxRunningDesktops ?? Infinity) ? 'warn' : ''"
        help="Desktops beyond the slot count are not started; the least recently used idle one is put to sleep to make room." />
      <OmniTraderKpi label="Asleep" :value="String(counts.asleep)" :loading="loading"
        :foot="`stopped after ${health?.capacity?.idleSuspendMinutes ?? '?'} idle min · resume on next use`" />
      <OmniTraderKpi label="Need attention" :value="String(counts.problems)" :loading="loading"
        :tone="counts.problems ? 'bad' : 'good'" :attention="counts.problems > 0"
        foot="missing, unreachable or degraded" />
      <OmniTraderKpi label="Daemon coverage" :value="`${counts.daemon} / ${counts.running}`" :loading="loading"
        :tone="counts.running && counts.daemon < counts.running ? 'warn' : ''"
        foot="running computers with the in-computer control plane"
        help="Computers without it still work, through docker exec and VNC; the next helper refresh installs it." />
      <OmniTraderKpi label="OOM kills" :value="String(counts.oom)" :loading="loading" :tone="counts.oom ? 'warn' : ''"
        foot="processes killed for memory, all computers" />
      <OmniTraderKpi label="Host checked" :value="pjAgo(health?.lastSupervisionUtc ?? null, now)" small :loading="loading"
        :foot="health?.endpoint ? `Docker at ${health.endpoint}` : 'supervision runs every minute'" />
    </section>

    <div class="ot-filterbar">
      <div class="ot-segment sm" role="group" aria-label="Filter computers">
        <button v-for="f in filters" :key="f.key" type="button" :aria-pressed="filter === f.key" @click="filter = f.key">
          {{ f.label }} <span class="pj-muted">{{ f.count }}</span>
        </button>
      </div>
      <select v-model="projectFilter" class="ot-select auto" aria-label="Project">
        <option value="">All projects</option>
        <option v-for="p in projectOptions" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
      <span class="grow"></span>
      <span class="summary">Showing <b>{{ visible.length }}</b> of {{ computers.length }}</span>
    </div>

    <div v-if="loading" class="ot-skelrows"><div v-for="n in 4" :key="n" class="ot-skel" style="height:90px"></div></div>
    <OmniTraderStateBlock v-else-if="!computers.length" kind="empty" title="No computers on this host"
      detail="Agents get a computer the first time they use a desktop, browser or terminal tool." />
    <OmniTraderStateBlock v-else-if="!visible.length" kind="filtered" />
    <div v-else class="pcf-grid">
      <ProjectsComputerCard
        v-for="c in visible" :key="c.containerID"
        :computer="c" :label="labelFor(c)" :project-name="projectName(c.projectID)"
        :show-live="livePreviews" compact :host-down="!!hostProblem" :busy="busy === c.containerID"
        @control="control = c" @inspect="inspecting = c" @resume="resume(c)" @repair="action => repair(c, action)"
      />
    </div>

    <div v-if="control" class="ot-modal-backdrop" @click.self="control = null">
      <section class="ot-modal pcf-control" role="dialog" aria-modal="true" :aria-label="`Control ${labelFor(control)}`">
        <header>
          <h3>{{ labelFor(control) }} <span class="ot-chip">{{ projectName(control.projectID) }}</span></h3>
          <button class="ot-btn ghost sm" @click="control = null">Close ✕</button>
        </header>
        <div class="body pcf-control-body">
          <ProjectsContainerRemoteDesktop :container-id="control.containerID" :label="labelFor(control)" :fps="12" />
        </div>
      </section>
    </div>

    <ProjectsComputerDrawer ref="drawer" :open="!!inspecting" :container-id="inspecting?.containerID ?? null"
      :label="inspecting ? `${labelFor(inspecting)} · ${projectName(inspecting.projectID)}` : ''" :busy="!!busy"
      @close="inspecting = null" @repair="action => inspecting && repair(inspecting, action)" />
  </ProjectsShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import ProjectsShell from '~/components/Projects/Shell.vue';
import ProjectsComputerCard from '~/components/Projects/ComputerCard.vue';
import ProjectsComputerDrawer from '~/components/Projects/ComputerDrawer.vue';
import ProjectsContainerRemoteDesktop from '~/components/Projects/ContainerRemoteDesktop.vue';
import { pjAgo, pjGet, pjPost, type ProjectsComputer, type ProjectsHostHealth } from '~/composables/useProjectsUi';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Computers · Projects' });

const computers = ref<ProjectsComputer[]>([]);
const projects = ref<{ projectID: string; name: string }[]>([]);
const health = ref<ProjectsHostHealth | null>(null);
const loading = ref(true);
const refreshing = ref(false);
const busy = ref('');
const notice = ref<{ text: string; tone: string } | null>(null);
const control = ref<ProjectsComputer | null>(null);
const inspecting = ref<ProjectsComputer | null>(null);
const drawer = ref<{ reload: () => void } | null>(null);
const livePreviews = ref(false);
const filter = ref<'all' | 'running' | 'asleep' | 'problems'>('all');
const projectFilter = ref('');
const now = ref(Date.now());
let poll: ReturnType<typeof setInterval> | null = null;

const hostProblem = computed(() => health.value?.daemonProblem
  || (health.value?.available === false ? health.value.reason : '')
  || (health.value?.restartRequired ? 'Windows needs one restart to bring the computer host (WSL) back. Omnipotent never restarts the host itself.' : ''));

const isProblem = (c: ProjectsComputer) => c.state === 'missing' || c.state === 'unreachable' || c.state === 'degraded';
const counts = computed(() => ({
  running: computers.value.filter(c => c.state === 'running' || c.state === 'degraded').length,
  asleep: computers.value.filter(c => c.state === 'asleep').length,
  problems: computers.value.filter(isProblem).length,
  daemon: computers.value.filter(c => c.daemon && c.daemon.protocol >= 2).length,
  oom: computers.value.reduce((n, c) => n + (c.daemon?.memory?.oomKills ?? 0), 0),
}));
const filters = computed(() => [
  { key: 'all' as const, label: 'All', count: computers.value.length },
  { key: 'running' as const, label: 'Running', count: counts.value.running },
  { key: 'asleep' as const, label: 'Asleep', count: counts.value.asleep },
  { key: 'problems' as const, label: 'Problems', count: counts.value.problems },
]);
const projectOptions = computed(() => [...new Set(computers.value.map(c => c.projectID))]
  .map(id => ({ id, name: projectName(id) })).sort((a, b) => a.name.localeCompare(b.name)));
const visible = computed(() => computers.value
  .filter(c => !projectFilter.value || c.projectID === projectFilter.value)
  .filter(c => filter.value === 'all' ? true
    : filter.value === 'running' ? (c.state === 'running' || c.state === 'degraded')
    : filter.value === 'asleep' ? c.state === 'asleep' : isProblem(c))
  .sort((a, b) => Number(isProblem(b)) - Number(isProblem(a)) || projectName(a.projectID).localeCompare(projectName(b.projectID))));

const shellStatus = computed(() => hostProblem.value ? 'Computer host unavailable'
  : `${counts.value.running} running · ${counts.value.asleep} asleep${counts.value.problems ? ` · ${counts.value.problems} need attention` : ''}`);
const shellTone = computed(() => hostProblem.value ? 'bad' : counts.value.problems ? 'warn' : 'ok');

function projectName(id: string) { return projects.value.find(p => p.projectID === id)?.name || id.slice(0, 8); }
function labelFor(c: ProjectsComputer) {
  if (!c.agentID || c.agentID === 'shared') return 'Shared desktop';
  return c.agentID === 'commander' ? 'Commander' : c.agentID;
}

async function load() {
  refreshing.value = true;
  const [list, host, projectList] = await Promise.all([
    pjGet<ProjectsComputer[]>('/projects/computers/list'),
    pjGet<ProjectsHostHealth>('/projects/computers/health'),
    projects.value.length ? Promise.resolve(null) : pjGet<any[]>('/projects/list'),
  ]);
  if (Array.isArray(list)) computers.value = list;
  if (host) health.value = host;
  if (Array.isArray(projectList)) projects.value = projectList.map((p: any) => ({ projectID: p.projectID, name: p.name }));
  loading.value = false;
  refreshing.value = false;
  now.value = Date.now();
}

async function resume(c: ProjectsComputer) {
  busy.value = c.containerID;
  try {
    await pjPost(`/projects/computers/resume?projectID=${encodeURIComponent(c.projectID)}`, { projectID: c.projectID, containerID: c.containerID });
    notice.value = { text: `${labelFor(c)} (${projectName(c.projectID)}) is awake again.`, tone: 'ok' };
    await load();
  } catch (e: any) { notice.value = { text: e?.message || 'Computer could not resume.', tone: 'warn' }; }
  finally { busy.value = ''; }
}

async function repair(c: ProjectsComputer, action: string) {
  busy.value = c.containerID;
  try {
    const result = await pjPost<{ outcome: string }>('/projects/computers/repair', { containerID: c.containerID, action });
    notice.value = { text: `${labelFor(c)} (${projectName(c.projectID)}): ${result.outcome || 'done.'}`, tone: 'ok' };
    await load();
    drawer.value?.reload();
  } catch (e: any) { notice.value = { text: e?.message || 'Repair failed.', tone: 'warn' }; }
  finally { busy.value = ''; }
}

function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !e.defaultPrevented) control.value = null; }
onMounted(() => { load(); poll = setInterval(load, 10000); window.addEventListener('keydown', onKey); });
onBeforeUnmount(() => { if (poll) clearInterval(poll); window.removeEventListener('keydown', onKey); });
</script>

<style scoped>
.pcf-grid { display: grid; gap: var(--ot-gutter); grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); }
.pcf-control { width: min(1440px, 96vw); max-height: 95vh; }
.pcf-control-body { padding: 0; display: flex; min-height: 0; }
.pcf-control-body :deep(.crd) { flex: 1; min-height: 0; border: none; border-radius: 0; }
.pcf-control-body :deep(.crd-stage) { min-height: 64vh; }
</style>
