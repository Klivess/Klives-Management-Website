<template>
  <div class="pj-computers">
    <div v-if="hostProblem" class="ot-banner" role="status">
      <span class="glyph" aria-hidden="true">⚠</span>
      <div>
        <strong>Project computers are unavailable</strong>
        {{ hostProblem }}
        <details v-if="health?.recoveryStatus" class="pcs-details"><summary>Recovery details</summary>{{ health.recoveryStatus }}</details>
      </div>
      <div class="actions"><NuxtLink to="/projects/computers" class="ot-btn sm">Host status</NuxtLink></div>
    </div>
    <div v-if="notice" class="ot-banner" :class="notice.tone" role="status">
      <span class="glyph" aria-hidden="true">{{ notice.tone === 'ok' ? '✓' : '⚠' }}</span>
      <div>{{ notice.text }}</div>
      <div class="actions"><button class="ot-btn ghost sm" @click="notice = null">Dismiss</button></div>
    </div>

    <div class="pcs-head">
      <p class="pj-muted">Each agent's computer, live. Take control to clear a login or CAPTCHA by hand — the agent is told when you are done.</p>
      <span v-if="computers.length" class="ot-chip">{{ computers.length }} computer{{ computers.length === 1 ? '' : 's' }}</span>
    </div>

    <div v-if="loading" class="ot-skelrows"><div v-for="n in 3" :key="n" class="ot-skel" style="height:120px"></div></div>
    <OmniTraderStateBlock v-else-if="!computers.length" kind="empty" title="No computers yet"
      detail="An agent's computer appears the first time it uses a desktop, browser or terminal tool." />
    <div v-else class="pcs-grid" :class="{ single: computers.length === 1 }">
      <ProjectsComputerCard
        v-for="c in computers" :key="c.containerID"
        :computer="c" :label="labelFor(c)" show-live :host-down="!!hostProblem"
        :busy="busy === c.containerID"
        @control="control = c" @inspect="inspecting = c" @resume="resume(c)" @repair="action => repair(c, action)"
      />
    </div>

    <div v-if="control" class="ot-modal-backdrop" @click.self="control = null">
      <section class="ot-modal pcs-control" role="dialog" aria-modal="true" :aria-label="`Control ${labelFor(control)}`">
        <header>
          <h3>{{ labelFor(control) }} <span class="ot-chip info">remote control</span></h3>
          <button class="ot-btn ghost sm" @click="control = null">Close ✕</button>
        </header>
        <div class="body pcs-control-body">
          <ProjectsContainerRemoteDesktop :container-id="control.containerID" :label="labelFor(control)" :fps="12" />
        </div>
      </section>
    </div>

    <ProjectsComputerDrawer ref="drawer" :open="!!inspecting" :container-id="inspecting?.containerID ?? null"
      :label="inspecting ? labelFor(inspecting) : ''" :busy="!!busy"
      @close="inspecting = null" @repair="action => inspecting && repair(inspecting, action)" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import ProjectsComputerCard from '~/components/Projects/ComputerCard.vue';
import ProjectsComputerDrawer from '~/components/Projects/ComputerDrawer.vue';
import ProjectsContainerRemoteDesktop from '~/components/Projects/ContainerRemoteDesktop.vue';
import { pjGet, pjPost, type ProjectsComputer, type ProjectsHostHealth } from '~/composables/useProjectsUi';

const props = defineProps<{ projectId: string }>();

const computers = ref<ProjectsComputer[]>([]);
const agents = ref<any[]>([]);
const health = ref<ProjectsHostHealth | null>(null);
const loading = ref(true);
const busy = ref('');
const control = ref<ProjectsComputer | null>(null);
const inspecting = ref<ProjectsComputer | null>(null);
const notice = ref<{ text: string; tone: string } | null>(null);
const drawer = ref<{ reload: () => void } | null>(null);
let poll: ReturnType<typeof setInterval> | null = null;

const hostProblem = computed(() => health.value?.daemonProblem
  || (health.value?.available === false ? health.value.reason : '')
  || (health.value?.restartRequired ? 'Windows needs one restart to bring the computer host (WSL) back.' : ''));

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
    notice.value = { text: `${labelFor(c)} is awake again.`, tone: 'ok' };
    await load();
  } catch (e: any) { notice.value = { text: e?.message || 'Computer could not resume.', tone: 'warn' }; }
  finally { busy.value = ''; }
}

async function repair(c: ProjectsComputer, action: string) {
  busy.value = c.containerID;
  try {
    const result = await pjPost<{ outcome: string }>('/projects/computers/repair', { containerID: c.containerID, action });
    notice.value = { text: `${labelFor(c)}: ${result.outcome || 'done.'}`, tone: 'ok' };
    await load();
    drawer.value?.reload();
  } catch (e: any) { notice.value = { text: e?.message || 'Repair failed.', tone: 'warn' }; }
  finally { busy.value = ''; }
}

function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !e.defaultPrevented) control.value = null; }

onMounted(() => {
  load();
  poll = setInterval(load, 8000);
  window.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  if (poll) clearInterval(poll);
  window.removeEventListener('keydown', onKey);
});
</script>

<style scoped>
.pcs-head { display: flex; align-items: center; justify-content: space-between; gap: var(--ot-space-3); margin-bottom: var(--ot-space-3); }
.pcs-head p { margin: 0; font-size: 12.5px; }
.pcs-grid { display: grid; gap: var(--ot-gutter); grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr)); }
.pcs-grid.single { grid-template-columns: minmax(0, min(900px, 100%)); }
.pcs-details { margin-top: var(--ot-space-1); font-size: 12px; color: var(--ot-text-2); }
.pcs-control { width: min(1440px, 96vw); max-height: 95vh; }
.pcs-control-body { padding: 0; display: flex; min-height: 0; }
.pcs-control-body :deep(.crd) { flex: 1; min-height: 0; border: none; border-radius: 0; }
.pcs-control-body :deep(.crd-stage) { min-height: 64vh; }
</style>
