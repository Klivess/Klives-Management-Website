<template>
  <div class="pjx-stack">
    <div v-if="hostProblem" class="pjx-banner" data-tone="fault" role="status">
      <ProjectsIcon name="octagon-x" />
      <div class="pjx-banner__body">
        <b>Project computers are unavailable</b>{{ hostProblem }}
        <details v-if="health?.recoveryStatus" class="pjx-cpanel__details"><summary>Recovery details</summary>{{ health.recoveryStatus }}</details>
      </div>
      <div class="pjx-banner__actions"><NuxtLink to="/projects/computers" class="pjx-btn pjx-btn--sm">Host status</NuxtLink></div>
    </div>

    <ProjectsCard title="Computers" icon="monitor" :meta="meta" flush>
      <template #tools><NuxtLink to="/projects/computers" class="pjx-btn pjx-btn--ghost pjx-btn--sm">Every project's computers<ProjectsIcon name="arrow-right" /></NuxtLink></template>
      <p class="pjx-dim pjx-cpanel__hint">Each agent's computer, live. Take control to clear a login or a CAPTCHA by hand; the agent is told when you are done.</p>
      <div v-if="loading" class="pjx-computers"><div v-for="n in 2" :key="n" class="pjx-skel" style="height: 120px"></div></div>
      <div v-else-if="!computers.length" class="pjx-empty">
        <ProjectsIcon name="monitor" /><b>No computers yet</b>
        <span>An agent's computer appears the first time it uses a desktop, browser or terminal tool.</span>
      </div>
      <div v-else class="pjx-computers" :data-single="computers.length === 1 || undefined">
        <ProjectsComputerCard
          v-for="c in computers" :key="c.containerID"
          :computer="c" :label="labelFor(c)" show-live :host-down="!!hostProblem"
          :busy="busy === c.containerID"
          @control="control = c" @inspect="inspecting = c" @resume="resume(c)" @repair="action => repair(c, action)"
        />
      </div>
    </ProjectsCard>

    <Teleport to="body">
      <template v-if="control">
        <div class="pjx-layer pjx-scrim" @click="control = null"></div>
        <section class="pjx-layer pjx-dialog pjx-control" role="dialog" aria-modal="true" :aria-label="`Control ${labelFor(control)}`" @keydown.esc="control = null">
          <header class="pjx-sheet__head">
            <div class="pjx-sheet__titles"><div class="pjx-sheet__title">{{ labelFor(control) }}</div><div class="pjx-sheet__sub">Remote control · your input goes straight to this computer</div></div>
            <button class="pjx-iconbtn" aria-label="Close" @click="control = null"><ProjectsIcon name="x" /></button>
          </header>
          <div class="pjx-control__body ot-os pjx-embed">
            <ProjectsContainerRemoteDesktop :container-id="control.containerID" :label="labelFor(control)" :fps="12" />
          </div>
        </section>
      </template>
    </Teleport>

    <ProjectsComputerDrawer ref="drawer" :open="!!inspecting" :container-id="inspecting?.containerID ?? null"
      :label="inspecting ? labelFor(inspecting) : ''" :busy="!!busy"
      @close="inspecting = null" @repair="action => inspecting && repair(inspecting, action)" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import ProjectsCard from '~/components/Projects/Card.vue';
import ProjectsIcon from '~/components/Projects/Icon.vue';
import ProjectsComputerCard from '~/components/Projects/ComputerCard.vue';
import ProjectsComputerDrawer from '~/components/Projects/ComputerDrawer.vue';
import ProjectsContainerRemoteDesktop from '~/components/Projects/ContainerRemoteDesktop.vue';
import { usePjxToasts } from '~/composables/useProjectsConsole';
import { pjGet, pjPost, type ProjectsComputer, type ProjectsHostHealth } from '~/composables/useProjectsUi';

const props = defineProps<{ projectId: string }>();

const computers = ref<ProjectsComputer[]>([]);
const agents = ref<any[]>([]);
const health = ref<ProjectsHostHealth | null>(null);
const loading = ref(true);
const busy = ref('');
const control = ref<ProjectsComputer | null>(null);
const inspecting = ref<ProjectsComputer | null>(null);
const drawer = ref<{ reload: () => void } | null>(null);
const { toast } = usePjxToasts();
let poll: ReturnType<typeof setInterval> | null = null;

const hostProblem = computed(() => health.value?.daemonProblem
  || (health.value?.available === false ? health.value.reason : '')
  || (health.value?.restartRequired ? 'Windows needs one restart to bring the computer host (WSL) back.' : ''));
const meta = computed(() => {
  if (loading.value || !computers.value.length) return '';
  const running = computers.value.filter(c => c.state === 'running' || c.state === 'degraded').length;
  const asleep = computers.value.filter(c => c.state === 'asleep').length;
  const other = computers.value.length - running - asleep;
  return [`${running} running`, asleep ? `${asleep} asleep` : '', other ? `${other} need a look` : ''].filter(Boolean).join(' · ');
});

function labelFor(c: ProjectsComputer) {
  if (!c.agentID || c.agentID === 'shared') return 'Shared desktop';
  if (c.agentID === 'commander') return 'Commander';
  const agent = agents.value.find((a: any) => a.agentID === c.agentID);
  return agent ? `${agent.role} · ${c.agentID}` : c.agentID;
}

/** Older servers have no /computers/list: fall back to the bare inventory. */
async function loadComputers(): Promise<ProjectsComputer[] | null> {
  const listed = await pjGet<ProjectsComputer[]>(`/projects/computers/list?projectID=${encodeURIComponent(props.projectId)}`);
  if (Array.isArray(listed)) return listed;
  const bare = await pjGet<any[]>(`/projects/containers?projectID=${encodeURIComponent(props.projectId)}`);
  if (!Array.isArray(bare)) return null;
  return bare.map((c: any) => ({
    containerID: c.containerID, projectID: props.projectId, agentID: c.agentID ?? 'shared', width: c.width, height: c.height,
    createdAt: '', lastUsedAt: '', state: c.lost ? 'missing' : c.suspended ? 'asleep' : 'running',
    vncConnected: false, actionInFlight: false, controlledBy: null, daemon: null,
  }));
}

async function load() {
  const [list, roster, host] = await Promise.all([
    loadComputers(),
    pjGet<any[]>(`/projects/agents?projectID=${encodeURIComponent(props.projectId)}`),
    pjGet<ProjectsHostHealth>('/projects/computers/health'),
  ]);
  if (list) computers.value = list;
  if (Array.isArray(roster)) agents.value = roster;
  if (host) health.value = host;
  loading.value = false;
}

async function resume(c: ProjectsComputer) {
  busy.value = c.containerID;
  try {
    await pjPost(`/projects/computers/resume?projectID=${encodeURIComponent(props.projectId)}`, { containerID: c.containerID });
    toast(`${labelFor(c)} is awake again.`, 'work');
    await load();
  } catch (e: any) { toast(e?.message || 'The computer could not resume.', 'fault', 6000); }
  finally { busy.value = ''; }
}

async function repair(c: ProjectsComputer, action: string) {
  busy.value = c.containerID;
  try {
    const result = await pjPost<{ outcome: string }>('/projects/computers/repair', { containerID: c.containerID, action });
    toast(`${labelFor(c)}: ${result.outcome || 'done.'}`, 'work', 6000);
    await load();
    drawer.value?.reload();
  } catch (e: any) { toast(e?.message || 'The repair failed.', 'fault', 6000); }
  finally { busy.value = ''; }
}

function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !e.defaultPrevented) control.value = null; }

onMounted(() => {
  load();
  poll = setInterval(() => { if (!document.hidden) load(); }, 8000);
  window.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  if (poll) clearInterval(poll);
  window.removeEventListener('keydown', onKey);
});
</script>
