<template>
  <ProjectsShell :status="shellStatus" :status-tone="shellTone" :working="counts.running > 0">
    <section class="pjx-card pjx-verdict" :data-tone="verdict.tone" aria-label="Computers status" data-testid="computers-verdict">
      <span class="pjx-verdict__glyph"><ProjectsIcon :name="verdict.icon" /></span>
      <div class="pjx-verdict__text">
        <h1 class="pjx-verdict__headline">{{ verdict.headline }}</h1>
        <p class="pjx-verdict__sub">{{ verdict.sub }}</p>
      </div>
      <div class="pjx-verdict__actions">
        <button class="pjx-btn" :aria-pressed="livePreviews" :title="livePreviews ? 'Stop the live screens' : 'Show each running screen, live'" @click="livePreviews = !livePreviews">
          <ProjectsIcon :name="livePreviews ? 'eye-off' : 'eye'" />{{ livePreviews ? 'Hide screens' : 'Live screens' }}
        </button>
        <button class="pjx-iconbtn" :disabled="refreshing" title="Refresh now (R)" aria-label="Refresh now" @click="load"><ProjectsIcon name="refresh" :class="{ 'pjx-spin': refreshing }" /></button>
      </div>
    </section>

    <div v-if="hostProblem" class="pjx-banner" data-tone="fault" role="alert">
      <ProjectsIcon name="octagon-x" />
      <div class="pjx-banner__body"><b>The computer host is unavailable</b>{{ hostProblem }}<template v-if="health?.recoveryStatus"> · {{ health.recoveryStatus }}</template></div>
    </div>
    <div v-else-if="health?.recoveryInProgress" class="pjx-banner" data-tone="need" role="status">
      <ProjectsIcon name="refresh" class="pjx-spin" /><div class="pjx-banner__body"><b>Recovering the computer host</b>{{ health.recoveryStatus }}</div>
    </div>

    <section class="pjx-kpis" aria-label="Computer host summary">
      <div class="pjx-card pjx-kpi" :data-tone="full ? 'need' : counts.running ? 'work' : undefined">
        <span class="pjx-kpi__label"><ProjectsIcon name="monitor" />Running</span>
        <span class="pjx-kpi__value">{{ loading ? '…' : counts.running }}<small>of {{ slots ?? '?' }} slots</small></span>
        <div class="pjx-slots" :aria-label="`${counts.running} of ${slots ?? '?'} desktop slots in use`" role="img">
          <i v-for="n in Math.max(slots ?? 0, counts.running)" :key="n" :data-on="n <= counts.running || undefined"></i>
        </div>
        <span class="pjx-kpi__sub" :title="'Desktops beyond the slot count are not started; the least recently used idle one is put to sleep to make room.'">{{ health?.capacity?.desktopMemoryLimitGB ?? '?' }} GB each on a {{ health?.capacity?.daemonMemoryGB ?? '?' }} GB VM</span>
      </div>
      <div class="pjx-card pjx-kpi">
        <span class="pjx-kpi__label"><ProjectsIcon name="hourglass" />Asleep</span>
        <span class="pjx-kpi__value">{{ loading ? '…' : counts.asleep }}</span>
        <span class="pjx-kpi__sub">stop after {{ health?.capacity?.idleSuspendMinutes ?? '?' }} idle min · wake on next use</span>
      </div>
      <button class="pjx-card pjx-kpi" :data-tone="counts.problems ? 'fault' : 'work'" :aria-label="`${counts.problems} computers need attention: show them`" @click="filter = 'problems'">
        <span class="pjx-kpi__label"><ProjectsIcon name="alert" />Need attention</span>
        <span class="pjx-kpi__value">{{ loading ? '…' : counts.problems }}</span>
        <span class="pjx-kpi__sub">missing, unreachable or degraded</span>
      </button>
      <div class="pjx-card pjx-kpi" :data-tone="counts.running && counts.daemon < counts.running ? 'need' : undefined">
        <span class="pjx-kpi__label"><ProjectsIcon name="zap" />Control daemon</span>
        <span class="pjx-kpi__value">{{ loading ? '…' : counts.daemon }}<small>of {{ counts.running }} running</small></span>
        <span class="pjx-kpi__sub" title="Computers without it still work through docker exec and VNC; the next helper refresh installs it.">in-computer control plane</span>
      </div>
      <div class="pjx-card pjx-kpi" :data-tone="counts.oom ? 'need' : undefined">
        <span class="pjx-kpi__label"><ProjectsIcon name="gauge" />Memory kills</span>
        <span class="pjx-kpi__value">{{ loading ? '…' : counts.oom }}</span>
        <span class="pjx-kpi__sub">host checked {{ health?.lastSupervisionUtc ? `${ageShort(health.lastSupervisionUtc, now)} ago` : '—' }}</span>
      </div>
    </section>

    <section class="pjx-card" aria-label="Computers">
      <div class="pjx-board__tools">
        <div class="pjx-seg" role="group" aria-label="Filter computers">
          <button v-for="f in filters" :key="f.key" type="button" class="pjx-seg__opt" :aria-pressed="filter === f.key" :data-tone="f.tone" @click="filter = f.key">{{ f.label }} <span class="pjx-seg__count">{{ f.count }}</span></button>
        </div>
        <select v-model="projectFilter" class="pjx-select" aria-label="Project">
          <option value="">All projects</option>
          <option v-for="p in projectOptions" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <span class="pjx-grow"></span>
        <span class="pjx-dim pjx-num" style="font-size: 12px">{{ visible.length }} of {{ computers.length }}</span>
      </div>

      <div v-if="loading" class="pjx-computers"><div v-for="n in 3" :key="n" class="pjx-skel" style="height: 150px"></div></div>
      <div v-else-if="!computers.length" class="pjx-empty"><ProjectsIcon name="monitor" /><b>No computers on this host</b>Agents get one the first time they use a desktop, browser or terminal tool.</div>
      <div v-else-if="!visible.length" class="pjx-empty"><ProjectsIcon name="search" /><b>Nothing matches</b></div>
      <div v-else class="pjx-computers">
        <ProjectsComputerCard
          v-for="c in visible" :key="c.containerID"
          :computer="c" :label="labelFor(c)" :project-name="projectName(c.projectID)"
          :show-live="livePreviews" compact :host-down="!!hostProblem" :busy="busy === c.containerID"
          @control="control = c" @inspect="inspecting = c" @resume="resume(c)" @repair="action => repair(c, action)"
        />
      </div>
      <footer class="pjx-card__foot">
        <span>Repairs go gentlest first and never touch an agent's files or sign-ins.</span>
      </footer>
    </section>

    <Teleport to="body">
      <template v-if="control">
        <div class="pjx-layer pjx-scrim" @click="control = null"></div>
        <section class="pjx-layer pjx-dialog pjx-control" role="dialog" aria-modal="true" :aria-label="`Control ${labelFor(control)}`" @keydown.esc="control = null">
          <header class="pjx-sheet__head">
            <div class="pjx-sheet__titles"><div class="pjx-sheet__title">{{ labelFor(control) }}</div><div class="pjx-sheet__sub">{{ projectName(control.projectID) }} · your input goes straight to this computer</div></div>
            <button class="pjx-iconbtn" aria-label="Close" @click="control = null"><ProjectsIcon name="x" /></button>
          </header>
          <div class="pjx-control__body ot-os pjx-embed">
            <ProjectsContainerRemoteDesktop :container-id="control.containerID" :label="labelFor(control)" :fps="12" />
          </div>
        </section>
      </template>
    </Teleport>

    <ProjectsComputerDrawer ref="drawer" :open="!!inspecting" :container-id="inspecting?.containerID ?? null"
      :label="inspecting ? `${labelFor(inspecting)} · ${projectName(inspecting.projectID)}` : ''" :busy="!!busy"
      @close="inspecting = null" @repair="action => inspecting && repair(inspecting, action)" />
  </ProjectsShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import ProjectsShell from '~/components/Projects/Shell.vue';
import ProjectsIcon from '~/components/Projects/Icon.vue';
import ProjectsComputerCard from '~/components/Projects/ComputerCard.vue';
import ProjectsComputerDrawer from '~/components/Projects/ComputerDrawer.vue';
import ProjectsContainerRemoteDesktop from '~/components/Projects/ContainerRemoteDesktop.vue';
import { pjGet, pjPost, type ProjectsComputer, type ProjectsHostHealth } from '~/composables/useProjectsUi';
import { usePjxPoll, usePjxToasts } from '~/composables/useProjectsConsole';
import { ageShort, type PjTone } from '~/scripts/projectsConsole';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Computers · Projects' });

const { toast } = usePjxToasts();
const computers = ref<ProjectsComputer[]>([]);
const projects = ref<{ projectID: string; name: string }[]>([]);
const health = ref<ProjectsHostHealth | null>(null);
const loading = ref(true);
const refreshing = ref(false);
const busy = ref('');
const control = ref<ProjectsComputer | null>(null);
const inspecting = ref<ProjectsComputer | null>(null);
const drawer = ref<{ reload: () => void } | null>(null);
const livePreviews = ref(false);
const filter = ref<'all' | 'running' | 'asleep' | 'problems'>('all');
const projectFilter = ref('');
const now = ref(Date.now());

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
const slots = computed(() => health.value?.capacity?.maxRunningDesktops ?? null);
const full = computed(() => slots.value != null && counts.value.running >= slots.value);
const filters = computed(() => [
  { key: 'all' as const, label: 'All', count: computers.value.length, tone: undefined },
  { key: 'running' as const, label: 'Running', count: counts.value.running, tone: 'work' },
  { key: 'asleep' as const, label: 'Asleep', count: counts.value.asleep, tone: undefined },
  { key: 'problems' as const, label: 'Problems', count: counts.value.problems, tone: 'fault' },
]);
const projectOptions = computed(() => [...new Set(computers.value.map(c => c.projectID))]
  .map(id => ({ id, name: projectName(id) })).sort((a, b) => a.name.localeCompare(b.name)));
const visible = computed(() => computers.value
  .filter(c => !projectFilter.value || c.projectID === projectFilter.value)
  .filter(c => filter.value === 'all' ? true
    : filter.value === 'running' ? (c.state === 'running' || c.state === 'degraded')
    : filter.value === 'asleep' ? c.state === 'asleep' : isProblem(c))
  .sort((a, b) => Number(isProblem(b)) - Number(isProblem(a)) || projectName(a.projectID).localeCompare(projectName(b.projectID))));

const verdict = computed<{ tone: PjTone; icon: string; headline: string; sub: string }>(() => {
  if (loading.value) return { tone: 'rest', icon: 'monitor', headline: 'Reading the computer host…', sub: 'Every agent desktop across all projects.' };
  if (hostProblem.value) return { tone: 'fault', icon: 'octagon-x', headline: 'The computer host is down', sub: 'Agents that need a desktop wait until it recovers; nothing else stops.' };
  const total = computers.value.length;
  if (!total) return { tone: 'rest', icon: 'monitor', headline: 'No computers yet', sub: 'Agents get one the first time they use a desktop, browser or terminal tool.' };
  const base = `${counts.value.running} running${slots.value != null ? ` of ${slots.value} slots` : ''} · ${counts.value.asleep} asleep`;
  if (counts.value.problems) return { tone: 'fault', icon: 'alert', headline: `${counts.value.problems} ${counts.value.problems === 1 ? 'computer needs' : 'computers need'} attention`, sub: `${base} · Diagnose shows what is wrong; Repair goes gentlest first.` };
  if (counts.value.running) return { tone: 'work', icon: 'monitor', headline: `${counts.value.running} ${counts.value.running === 1 ? 'computer' : 'computers'} running`, sub: `${base}${full.value ? ' · every slot is in use, so the idlest one sleeps to make room' : ''}` };
  return { tone: 'rest', icon: 'hourglass', headline: `All ${total} ${total === 1 ? 'computer is' : 'computers are'} asleep`, sub: 'Installed apps, files and sign-ins are kept; each wakes on its agent\'s next use.' };
});

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
usePjxPoll(load, 10_000);

async function resume(c: ProjectsComputer) {
  busy.value = c.containerID;
  try {
    await pjPost(`/projects/computers/resume?projectID=${encodeURIComponent(c.projectID)}`, { projectID: c.projectID, containerID: c.containerID });
    toast(`${labelFor(c)} (${projectName(c.projectID)}) is awake again.`, 'work');
    await load();
  } catch (e: any) { toast(e?.message || 'Computer could not resume.', 'fault', 6000); }
  finally { busy.value = ''; }
}

async function repair(c: ProjectsComputer, action: string) {
  busy.value = c.containerID;
  try {
    const result = await pjPost<{ outcome: string }>('/projects/computers/repair', { containerID: c.containerID, action });
    toast(`${labelFor(c)} (${projectName(c.projectID)}): ${result.outcome || 'done.'}`, 'work', 6000);
    await load();
    drawer.value?.reload();
  } catch (e: any) { toast(e?.message || 'Repair failed.', 'fault', 6000); }
  finally { busy.value = ''; }
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && !e.defaultPrevented) { control.value = null; return; }
  const target = e.target as HTMLElement | null;
  if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
  if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !control.value && !inspecting.value) load();
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>
