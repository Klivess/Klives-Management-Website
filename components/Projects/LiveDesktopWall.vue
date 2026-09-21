<template>
  <div class="desktop-wall">
    <div class="dw-head">
      <p class="dw-note">Every agent desktop, live. Click any screen to maximise it.</p>
      <span v-if="tiles.length" class="dw-count">{{ tiles.length }} desktop{{ tiles.length === 1 ? '' : 's' }}</span>
    </div>

    <div v-if="hostProblem" class="dw-problem" role="status">
      <strong>Project computers are unavailable</strong>
      <p>{{ hostProblem }}</p>
      <details v-if="health?.recoveryStatus"><summary>Recovery details</summary>{{ health.recoveryStatus }}</details>
    </div>
    <p v-if="error" class="dw-problem" role="alert">{{ error }}</p>

    <div v-if="loading" class="dw-info">Loading desktops…</div>
    <div v-else-if="!tiles.length" class="dw-empty">
      No computers yet. An agent’s computer appears when it first uses a desktop or terminal tool.
    </div>

    <div v-else class="dw-grid" :style="gridStyle">
      <template v-for="t in tiles" :key="t.containerId">
      <div v-if="t.suspended || t.lost || hostProblem" class="dw-sleeping">
        <strong>{{ t.label }}</strong>
        <p>{{ t.lost ? 'Computer is missing from the host.' : t.suspended ? 'Sleeping — installed apps and files are preserved.' : 'Waiting for the computer host to recover.' }}</p>
        <button v-if="t.suspended && !t.lost" :disabled="!!resuming || !!hostProblem" @click="resume(t.containerId)">
          {{ resuming === t.containerId ? 'Resuming…' : 'Resume computer' }}
        </button>
      </div>
      <ProjectsLiveDesktop v-else
        :container-id="t.containerId"
        :label="t.label"
        :fps="4"
        clickable
        @maximize="maximize(t)"
      />
      </template>
    </div>

    <!-- Maximised overlay: a higher-fps stream with full remote control (take over the desktop
         to clear human-only obstacles like captchas; the agent is nudged automatically after). -->
    <div v-if="maxTile" class="dw-overlay" @click.self="maxTile = null">
      <div class="dw-modal">
        <div class="dw-modal-head">
          <span class="dw-modal-label">{{ maxTile.label }}</span>
          <button class="dw-close" title="Close (Esc)" @click="maxTile = null">✕</button>
        </div>
        <div class="dw-modal-body">
          <ProjectsContainerRemoteDesktop :container-id="maxTile.containerId" :label="maxTile.label" :fps="12" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import ProjectsLiveDesktop from '~/components/Projects/LiveDesktop.vue';
import ProjectsContainerRemoteDesktop from '~/components/Projects/ContainerRemoteDesktop.vue';

const props = defineProps<{ projectId: string }>();

const containers = ref<any[]>([]);
const agents = ref<any[]>([]);
const loading = ref(true);
const health = ref<any>(null);
const error = ref('');
const resuming = ref('');
const hostProblem = computed(() => health.value?.daemonProblem || (health.value?.available === false ? health.value.reason : ''));
let loadingRequest = false;
const maxTile = ref<{ containerId: string; label: string } | null>(null);
let poll: ReturnType<typeof setInterval> | null = null;

// One tile per registered desktop container, labelled by the owning agent's role (or "shared").
const tiles = computed(() => {
  return containers.value.map((c: any) => {
    const agent = c.agentID ? agents.value.find((a: any) => a.agentID === c.agentID) : null;
    const label = c.agentID
      ? (agent ? `${agent.role} · ${c.agentID}` : c.agentID)
      : 'Shared desktop';
    return { containerId: c.containerID, label, suspended: !!c.suspended, lost: !!c.lost };
  });
});

// Fewer desktops → bigger tiles: column count grows with the square root of the
// tile count (1→1 col, 2→2, 3-4→2, 5-9→3, 10-16→4…) so tiles always fill the row,
// instead of a fixed-width auto-fill grid that leaves a lone desktop at ~300px.
const gridStyle = computed(() => {
  const n = tiles.value.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const style: Record<string, string> = { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` };
  if (n === 1) {
    // Keep a lone desktop watchable, not a wall-sized poster on wide monitors.
    style.maxWidth = 'min(1100px, 100%)';
    style.margin = '0 auto';
  }
  return style;
});

function maximize(t: { containerId: string; label: string }) { maxTile.value = t; }
// While the remote desktop is controlling, it consumes Escape (preventDefault) to forward it to
// the container — only an unhandled Escape closes the modal.
function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !e.defaultPrevented) maxTile.value = null; }

async function load() {
  if (loadingRequest) return;
  loadingRequest = true;
  try {
    const [cr, ar, hr] = await Promise.all([
      RequestGETFromKliveAPI(`/projects/containers?projectID=${props.projectId}`, false, false),
      RequestGETFromKliveAPI(`/projects/agents?projectID=${props.projectId}`, false, false),
      RequestGETFromKliveAPI('/projects/computers/health', false, false),
    ]);
    if (cr.ok) containers.value = await cr.json();
    if (ar.ok) agents.value = await ar.json();
    if (hr.ok) health.value = await hr.json();
    if (!cr.ok) error.value = 'Could not refresh project computers. Retrying…';
    else if (!resuming.value) error.value = '';
  } catch { /* transient */ }
  finally { loading.value = false; loadingRequest = false; }
}

async function resume(containerId: string) {
  resuming.value = containerId;
  error.value = '';
  try {
    const response = await RequestPOSTFromKliveAPI(`/projects/computers/resume?projectID=${encodeURIComponent(props.projectId)}`,
      JSON.stringify({ containerID: containerId }), false, true);
    if (!response.ok) throw new Error(await response.text());
    await load();
  } catch (e: any) { error.value = e.message || 'Computer could not resume.'; }
  finally { resuming.value = ''; }
}

onMounted(() => {
  load();
  poll = setInterval(load, 5000); // pick up new/removed desktops
  window.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  if (poll) clearInterval(poll);
  window.removeEventListener('keydown', onKey);
});
</script>

<style scoped>
.desktop-wall { padding: 4px 2px; }
.dw-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 12px; }
.dw-note { font-size: 12px; color: #888; margin: 0; }
.dw-count { font-size: 11px; color: #7fd97f; white-space: nowrap; }
.dw-info, .dw-empty { color: #777; font-size: 13px; padding: 24px; text-align: center; }
.dw-problem { padding: 14px; margin-bottom: 12px; border: 1px solid #80642f; border-radius: 8px; color: #e8cf9b; overflow-wrap: anywhere; }
.dw-problem p { margin: 6px 0; }
.dw-sleeping { padding: 24px; background: #161519; border-radius: 8px; color: #ccc; }
.dw-sleeping button { padding: 8px 14px; border-radius: 6px; cursor: pointer; }
.dw-grid { display: grid; gap: 12px; } /* columns come from gridStyle (scales with desktop count) */
.dw-grid :deep(.ld-frame) { aspect-ratio: 16 / 10; min-height: 0; }
/* Narrow screens: always stack, overriding the inline column count. */
@media (max-width: 760px) { .dw-grid { grid-template-columns: 1fr !important; max-width: none !important; } }

.dw-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 24px; }
.dw-modal { background: #0e0e11; border-radius: 10px; overflow: hidden; width: min(1400px, 96vw); max-height: 94vh; display: flex; flex-direction: column; box-shadow: 0 12px 48px rgba(0,0,0,0.6); }
.dw-modal-head { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #161519; border-bottom: 1px solid #2a2a2e; }
.dw-modal-label { font-weight: 600; color: #e6e6e6; text-transform: capitalize; }
.dw-close { background: #26262b; color: #ccc; border: none; width: 30px; height: 30px; border-radius: 6px; cursor: pointer; font-size: 15px; }
.dw-close:hover { background: #3a3a44; color: #fff; }
.dw-modal-body { flex: 1; min-height: 0; display: flex; }
/* The modal embeds ContainerRemoteDesktop (.crd) — give its stage a real height,
   otherwise the content-driven modal collapses it to 0 until fullscreen. */
.dw-modal-body :deep(.crd) { flex: 1; min-height: 0; border: none; border-radius: 0; }
.dw-modal-body :deep(.crd-stage) { min-height: 60vh; }
</style>
