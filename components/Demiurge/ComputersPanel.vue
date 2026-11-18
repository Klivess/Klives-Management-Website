<template>
  <div class="dmx-stack">
    <div v-if="hostProblem" class="dmx-banner" data-tone="fault" role="status">
      <DemiurgeIcon name="octagon-x" />
      <div class="dmx-banner__body">
        <b>Steward computers are unavailable</b>{{ hostProblem }}
        <details v-if="health?.recoveryStatus" class="dmx-cpanel__details"><summary>Recovery details</summary>{{ health.recoveryStatus }}</details>
      </div>
      <div class="dmx-banner__actions"><NuxtLink to="/demiurge/computers" class="dmx-btn dmx-btn--sm">Host status</NuxtLink></div>
    </div>

    <DemiurgeCard title="Computers" icon="monitor" :meta="meta" flush>
      <template #tools><NuxtLink to="/demiurge/computers" class="dmx-btn dmx-btn--ghost dmx-btn--sm">Every Steward's computers<DemiurgeIcon name="arrow-right" /></NuxtLink></template>
      <p class="dmx-dim dmx-cpanel__hint">Each agent's computer, live. Take control to clear a login or a CAPTCHA by hand; the agent is told when you are done.</p>
      <div v-if="loading" class="dmx-computers"><div v-for="n in 2" :key="n" class="dmx-skel" style="height: 120px"></div></div>
      <div v-else-if="!computers.length" class="dmx-empty">
        <DemiurgeIcon name="monitor" /><b>No computers yet</b>
        <span>An agent's computer appears the first time it uses a desktop, browser or terminal tool.</span>
      </div>
      <div v-else class="dmx-computers" :data-single="computers.length === 1 || undefined">
        <DemiurgeComputerCard
          v-for="c in computers" :key="c.containerID"
          :computer="c" :label="labelFor(c)" show-live :host-down="!!hostProblem"
          :busy="busy === c.containerID"
          @control="control = c" @inspect="inspecting = c" @resume="resume(c)" @repair="action => repair(c, action)"
        />
      </div>
    </DemiurgeCard>

    <Teleport to="body">
      <template v-if="control">
        <div class="dmx-layer dmx-scrim" @click="control = null"></div>
        <section class="dmx-layer dmx-dialog dmx-control" role="dialog" aria-modal="true" :aria-label="`Control ${labelFor(control)}`" @keydown.esc="control = null">
          <header class="dmx-sheet__head">
            <div class="dmx-sheet__titles"><div class="dmx-sheet__title">{{ labelFor(control) }}</div><div class="dmx-sheet__sub">Remote control · your input goes straight to this computer</div></div>
            <button class="dmx-iconbtn" aria-label="Close" @click="control = null"><DemiurgeIcon name="x" /></button>
          </header>
          <div class="dmx-control__body ot-os dmx-embed">
            <DemiurgeContainerRemoteDesktop :container-id="control.containerID" :label="labelFor(control)" :fps="12" />
          </div>
        </section>
      </template>
    </Teleport>

    <DemiurgeComputerDrawer ref="drawer" :open="!!inspecting" :container-id="inspecting?.containerID ?? null"
      :label="inspecting ? labelFor(inspecting) : ''" :busy="!!busy"
      @close="inspecting = null" @repair="action => inspecting && repair(inspecting, action)" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import DemiurgeCard from '~/components/Demiurge/Card.vue';
import DemiurgeIcon from '~/components/Demiurge/Icon.vue';
import DemiurgeComputerCard from '~/components/Demiurge/ComputerCard.vue';
import DemiurgeComputerDrawer from '~/components/Demiurge/ComputerDrawer.vue';
import DemiurgeContainerRemoteDesktop from '~/components/Demiurge/ContainerRemoteDesktop.vue';
import { useDmxToasts } from '~/composables/useDemiurgeConsole';
import { dmGet, dmPost, type DemiurgeComputer, type DemiurgeHostHealth } from '~/composables/useDemiurgeUi';

const props = defineProps<{ stewardId: string }>();

const computers = ref<DemiurgeComputer[]>([]);
const agents = ref<any[]>([]);
const health = ref<DemiurgeHostHealth | null>(null);
const loading = ref(true);
const busy = ref('');
const control = ref<DemiurgeComputer | null>(null);
const inspecting = ref<DemiurgeComputer | null>(null);
const drawer = ref<{ reload: () => void } | null>(null);
const { toast } = useDmxToasts();
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

function labelFor(c: DemiurgeComputer) {
  if (!c.agentID || c.agentID === 'shared') return 'Shared desktop';
  if (c.agentID === 'commander') return 'Commander';
  const agent = agents.value.find((a: any) => a.agentID === c.agentID);
  return agent ? `${agent.role} · ${c.agentID}` : c.agentID;
}

/** Older servers have no /computers/list: fall back to the bare inventory. */
async function loadComputers(): Promise<DemiurgeComputer[] | null> {
  const listed = await dmGet<DemiurgeComputer[]>(`/demiurge/computers/list?stewardID=${encodeURIComponent(props.stewardId)}`);
  if (Array.isArray(listed)) return listed;
  const bare = await dmGet<any[]>(`/demiurge/containers?stewardID=${encodeURIComponent(props.stewardId)}`);
  if (!Array.isArray(bare)) return null;
  return bare.map((c: any) => ({
    containerID: c.containerID, stewardID: props.stewardId, agentID: c.agentID ?? 'shared', width: c.width, height: c.height,
    createdAt: '', lastUsedAt: '', state: c.lost ? 'missing' : c.suspended ? 'asleep' : 'running',
    vncConnected: false, actionInFlight: false, controlledBy: null, daemon: null,
  }));
}

async function load() {
  const [list, roster, host] = await Promise.all([
    loadComputers(),
    dmGet<any[]>(`/demiurge/agents?stewardID=${encodeURIComponent(props.stewardId)}`),
    dmGet<DemiurgeHostHealth>('/demiurge/computers/health'),
  ]);
  if (list) computers.value = list;
  if (Array.isArray(roster)) agents.value = roster;
  if (host) health.value = host;
  loading.value = false;
}

async function resume(c: DemiurgeComputer) {
  busy.value = c.containerID;
  try {
    await dmPost(`/demiurge/computers/resume?stewardID=${encodeURIComponent(props.stewardId)}`, { containerID: c.containerID });
    toast(`${labelFor(c)} is awake again.`, 'work');
    await load();
  } catch (e: any) { toast(e?.message || 'The computer could not resume.', 'fault', 6000); }
  finally { busy.value = ''; }
}

async function repair(c: DemiurgeComputer, action: string) {
  busy.value = c.containerID;
  try {
    const result = await dmPost<{ outcome: string }>('/demiurge/computers/repair', { containerID: c.containerID, action });
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
