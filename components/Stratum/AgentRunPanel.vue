<template>
  <div class="agent-run-panel">
    <div class="panel-header">
      <h3>Agents</h3>
      <div class="panel-header-actions">
        <button
          v-if="runs.length"
          class="link-btn toggle-runs"
          @click="showRunList = !showRunList"
          :title="showRunList ? 'Hide run history' : 'Show run history'"
        >{{ showRunList ? 'Hide' : 'Show' }} runs ({{ runs.length }})</button>
        <button class="primary-btn small" :disabled="busy" @click="openStartDialog">+ Plan a build</button>
      </div>
    </div>

    <div v-if="loadError" class="error-line">{{ loadError }}</div>

    <div v-if="!runs.length && !activeRun" class="muted">
      No runs yet. Click "Plan a build" to invoke the Planning Agent.
    </div>

    <ul v-if="runs.length && showRunList" class="run-list">
      <li
        v-for="r in runs"
        :key="r.runID"
        :class="{ active: activeRunID === r.runID }"
        @click="selectRun(r.runID)"
      >
        <span class="run-type">{{ r.agentType }}</span>
        <span class="run-prompt" :title="r.userPrompt">{{ truncate(r.userPrompt, 60) }}</span>
        <span class="run-status" :data-status="r.status">{{ r.status }}</span>
        <span v-if="r.wallClockSeconds != null" class="run-duration">{{ formatDuration(r.wallClockSeconds) }}</span>
      </li>
    </ul>

    <div v-if="activeRun" class="active-run">
      <div class="active-run-header">
        <strong>{{ activeRun.agentType }}</strong>
        <span class="run-status" :data-status="activeRun.status">{{ activeRun.status }}</span>
        <span v-if="activeRun.wallClockSeconds != null" class="run-duration">{{ formatDuration(activeRun.wallClockSeconds) }}</span>
        <span class="spacer"></span>
        <button v-if="canCancel" class="link-btn" @click="cancelActiveRun">cancel</button>
      </div>

      <div class="event-stream" ref="eventStreamEl">
        <div
          v-for="evt in events"
          :key="evt.Sequence"
          class="event-row"
          :data-type="evt.Type"
        >
          <span class="event-time">{{ formatTime(evt.Timestamp) }}</span>
          <span class="event-type">{{ evt.Type }}</span>
          <span class="event-payload" v-html="renderPayload(evt)"></span>
        </div>
      </div>

      <div v-if="currentGate" class="gate-card">
        <div class="gate-title">⚠ Approval required: {{ currentGate.Title }}</div>
        <div class="gate-desc">{{ currentGate.Description }}</div>
        <div class="gate-rationale" v-if="currentGate.AgentRationale">
          <strong>Agent rationale:</strong> {{ currentGate.AgentRationale }}
        </div>
        <details class="gate-proposal">
          <summary>View proposal JSON</summary>
          <pre>{{ formatProposal(currentGate.ProposalJson) }}</pre>
        </details>
        <textarea
          v-model="gateComment"
          placeholder="Optional comment (used as feedback if you reject)"
          rows="2"
        ></textarea>
        <div class="gate-actions">
          <button class="primary-btn" :disabled="resolvingGate" @click="resolveGate('Approve')">Approve</button>
          <button class="danger-btn" :disabled="resolvingGate" @click="resolveGate('Reject')">Reject &amp; refine</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import Swal from 'sweetalert2';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

const props = defineProps<{ projectId: string }>();
const emit = defineEmits<{
  (e: 'project-changed'): void;
  (e: 'gate-preview', payload: { runID: string; gateID: string; artifactIDs: string[] }): void;
}>();

interface RunSummary {
  runID: string;
  agentType: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  wallClockSeconds: number | null;
  currentGateID: string | null;
  iteration: number;
  userPrompt: string;
  errorMessage: string;
}
interface AgentEvent {
  Sequence: number;
  RunID: string;
  Timestamp: string;
  Type: string;
  Payload: any;
}
interface GateRecord {
  GateID: string;
  RunID: string;
  Title: string;
  Description: string;
  AgentRationale: string;
  ProposalJson: string;
  ProposalArtifactIDs: string[];
  Status: string;
}

const runs = ref<RunSummary[]>([]);
const activeRunID = ref<string | null>(null);
const activeRun = ref<RunSummary | null>(null);
const events = ref<AgentEvent[]>([]);
const currentGate = ref<GateRecord | null>(null);
const showRunList = ref(true);
const lastSequence = ref(0);
const loadError = ref('');
const busy = ref(false);
const resolvingGate = ref(false);
const gateComment = ref('');
const eventStreamEl = ref<HTMLElement | null>(null);

let pollHandle: ReturnType<typeof setInterval> | null = null;

const canCancel = computed(() => activeRun.value && (activeRun.value.status === 'Running' || activeRun.value.status === 'AwaitingApproval'));

function truncate(s: string, n: number) {
  if (!s) return '';
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}
function formatTime(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString();
}
function formatDuration(secs: number | null | undefined): string {
  if (secs == null || !isFinite(secs)) return '';
  if (secs < 1) return '<1s';
  if (secs < 60) return `${Math.round(secs)}s`;
  const m = Math.floor(secs / 60); const s = Math.round(secs % 60);
  return s ? `${m}m ${s}s` : `${m}m`;
}
function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function renderPayload(evt: AgentEvent): string {
  const p = evt.Payload;
  if (!p) return '';
  if (typeof p === 'string') return escapeHtml(p);
  if (typeof p === 'object') {
    if (p.text) return escapeHtml(String(p.text));
    if (p.message) return escapeHtml(String(p.message));
    if (p.label) return `<em>${escapeHtml(p.label)}</em>`;
    if (p.fileName) return `<em>${escapeHtml(p.fileName)}</em> (${escapeHtml(p.kind ?? '')})`;
  }
  return '';
}
function formatProposal(json: string): string {
  try { return JSON.stringify(JSON.parse(json), null, 2); }
  catch { return json; }
}

async function loadRuns() {
  loadError.value = '';
  try {
    const res = await RequestGETFromKliveAPI(`/stratum/runs/list?projectID=${encodeURIComponent(props.projectId)}`, false, false);
    if (!res.ok) {
      loadError.value = `Failed to load runs (HTTP ${res.status}).`;
      runs.value = [];
      return;
    }
    const json = await res.json();
    runs.value = Array.isArray(json) ? json : [];
  } catch (err: any) {
    loadError.value = err?.message ?? String(err);
    runs.value = [];
  }
}

async function selectRun(runID: string) {
  if (activeRunID.value === runID) return;
  activeRunID.value = runID;
  events.value = [];
  currentGate.value = null;
  lastSequence.value = 0;
  // Auto-collapse run history once a run is selected so the event stream gets the space.
  showRunList.value = false;
  await pollOnce();
}

async function pollOnce() {
  if (!activeRunID.value) return;
  try {
    const res = await RequestGETFromKliveAPI(
      `/stratum/runs/events?projectID=${encodeURIComponent(props.projectId)}&runID=${encodeURIComponent(activeRunID.value)}&since=${lastSequence.value}`,
      false, false,
    );
    if (!res.ok) return;
    const json = await res.json();
    if (!json || typeof json !== 'object') return;

    const incoming = Array.isArray(json.events) ? json.events : [];
    if (incoming.length) {
      events.value.push(...incoming);
      lastSequence.value = Number(json.lastSequence) || lastSequence.value;
      // Trigger any artifact-added side effects (refresh project).
      if (incoming.some((e: AgentEvent) => e.Type === 'artifact-added')) {
        emit('project-changed');
      }
      // If a gate just opened with associated artifacts, ask the workbench to preview them.
      for (const e of incoming as AgentEvent[]) {
        if (e.Type === 'gate-opened' && e.Payload && Array.isArray(e.Payload.proposalArtifactIDs) && e.Payload.proposalArtifactIDs.length) {
          emit('gate-preview', {
            runID: activeRunID.value!,
            gateID: String(e.Payload.gateID || ''),
            artifactIDs: e.Payload.proposalArtifactIDs.map(String),
          });
        }
      }
      nextTick(() => {
        if (eventStreamEl.value) eventStreamEl.value.scrollTop = eventStreamEl.value.scrollHeight;
      });
    }

    currentGate.value = json.currentGate ?? null;

    // Refresh active run summary inline so status updates are visible.
    const found = runs.value.find(r => r.runID === activeRunID.value);
    if (found) {
      found.status = String(json.status ?? found.status);
      activeRun.value = { ...found };
    } else {
      // New run not yet in list — refresh.
      await loadRuns();
      activeRun.value = runs.value.find(r => r.runID === activeRunID.value) ?? null;
    }
  } catch {
    // Tolerate transient network errors during polling.
  }
}

async function openStartDialog() {
  const res = await Swal.fire({
    title: 'Start an agent',
    html:
      '<select id="swal-agent-type" class="swal2-select" style="display:block;margin-bottom:0.6rem;">'
      + '<option value="Planning">Planning Agent — design a build from a prompt</option>'
      + '<option value="Mechanical">Mechanical Agent — generate parametric CAD (requires Python+CadQuery on host)</option>'
      + '<option value="Simulation">Simulation Agent — FEA via gmsh + CalculiX (auto-installs on first use)</option>'
      + '<option value="Electronics">Electronics Agent — pick modules + wire them up + live BOM (Mouser)</option>'
      + '<option value="Firmware">Firmware Agent — author + compile a PlatformIO project (requires PlatformIO; auto-installs on first use)</option>'
      + '</select>'
      + '<textarea id="swal-prompt" class="swal2-textarea" placeholder="Describe what you want to build, or extra instructions for the selected agent…" rows="6"></textarea>',
    background: '#161516', color: '#ffffff',
    confirmButtonColor: '#4d9e39', confirmButtonText: 'Start',
    showCancelButton: true,
    preConfirm: () => {
      const agentType = (document.getElementById('swal-agent-type') as HTMLSelectElement)?.value || 'Planning';
      const prompt = (document.getElementById('swal-prompt') as HTMLTextAreaElement)?.value?.trim() || '';
      if (agentType === 'Planning' && !prompt) { Swal.showValidationMessage('Prompt required for Planning Agent'); return false; }
      return { agentType, prompt };
    },
  });
  if (!res.isConfirmed || !res.value) return;
  await startRun(res.value.agentType, res.value.prompt);
}

async function startRun(agentType: string, prompt: string) {
  busy.value = true;
  try {
    const body = { agentType, prompt, attachmentIDs: [] };
    const r = await RequestPOSTFromKliveAPI(
      `/stratum/runs/start?projectID=${encodeURIComponent(props.projectId)}`,
      JSON.stringify(body), false, true,
    );
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      let msg = text || `HTTP ${r.status}`;
      try { const j = JSON.parse(text); if (j?.error) msg = j.error; } catch { /* not JSON */ }
      Swal.fire({ icon: 'error', title: 'Failed to start run', text: msg, background: '#161516', color: '#ffffff' });
      return;
    }
    const data = await r.json();
    await loadRuns();
    if (data?.runID) await selectRun(data.runID);
  } finally {
    busy.value = false;
  }
}

async function cancelActiveRun() {
  if (!activeRunID.value) return;
  await RequestPOSTFromKliveAPI(
    `/stratum/runs/cancel?projectID=${encodeURIComponent(props.projectId)}&runID=${encodeURIComponent(activeRunID.value)}`,
    '', false, false,
  );
}

async function resolveGate(decision: 'Approve' | 'Reject') {
  if (!currentGate.value || !activeRunID.value) return;
  resolvingGate.value = true;
  try {
    const body = {
      runID: activeRunID.value,
      gateID: currentGate.value.GateID,
      decision,
      comment: gateComment.value,
    };
    const r = await RequestPOSTFromKliveAPI(
      `/stratum/gates/resolve?projectID=${encodeURIComponent(props.projectId)}`,
      JSON.stringify(body), false, true,
    );
    if (!r.ok) {
      Swal.fire({ icon: 'error', title: 'Could not resolve gate', text: `HTTP ${r.status}`, background: '#161516', color: '#ffffff' });
      return;
    }
    gateComment.value = '';
    currentGate.value = null;
  } finally {
    resolvingGate.value = false;
  }
}

watch(() => props.projectId, async () => {
  activeRunID.value = null;
  activeRun.value = null;
  events.value = [];
  currentGate.value = null;
  await loadRuns();
});

onMounted(async () => {
  await loadRuns();
  // Poll every 1.5s while there's an active run.
  pollHandle = setInterval(() => {
    if (activeRunID.value) pollOnce();
  }, 1500);
});

onBeforeUnmount(() => {
  if (pollHandle) clearInterval(pollHandle);
});
</script>

<style scoped>
.agent-run-panel {
  background: #1f1f23; border: 1px solid #2a2a2e; border-radius: 8px;
  padding: 14px; color: #e6e6e6; display: flex; flex-direction: column; gap: 12px;
  min-height: 360px; max-height: none; overflow: visible;
  flex: 1 1 auto;
}
.panel-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex: 0 0 auto; }
.panel-header-actions { display: flex; align-items: center; gap: 10px; }
.toggle-runs { color: #aaa; font-size: 11px; padding: 2px 6px; border: 1px solid #2a2a2e; border-radius: 4px; }
.toggle-runs:hover { background: #2a2a2e; color: #eee; }
.panel-header h3 { margin: 0; font-size: 14px; color: #aaa; text-transform: uppercase; letter-spacing: 0.05em; }
.primary-btn {
  background: #4d9e39; color: #fff; border: none; padding: 8px 14px; border-radius: 6px;
  cursor: pointer; font-weight: 600; font-size: 13px;
}
.primary-btn.small { padding: 6px 10px; font-size: 12px; white-space: nowrap; }
.primary-btn:hover { background: #5cb947; }
.primary-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.danger-btn {
  background: #c0392b; color: #fff; border: none; padding: 8px 14px; border-radius: 6px;
  cursor: pointer; font-weight: 600; font-size: 13px;
}
.danger-btn:hover { background: #d85447; }
.danger-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.muted { color: #666; font-size: 12px; }
.error-line { color: #ff8484; font-size: 12px; }

.run-list { list-style: none; margin: 0; padding: 0; max-height: 200px; overflow-y: auto; flex: 0 0 auto; }
.run-list li {
  display: grid; grid-template-columns: minmax(72px, 88px) minmax(0, 1fr) max-content max-content;
  gap: 8px; padding: 7px 8px; min-height: 34px;
  border-radius: 4px; cursor: pointer; font-size: 12px; align-items: center;
}
.run-list li:hover { background: #2a2a2e; }
.run-list li.active { background: #2d4030; }
.run-type { font-size: 10px; padding: 2px 6px; background: #2a2a2e; border-radius: 3px; color: #aaa; text-align: center; }
.run-prompt { color: #ccc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.run-status { font-size: 10px; padding: 2px 6px; border-radius: 3px; justify-self: end; white-space: nowrap; }
.run-duration { color: #7ee06f; font-size: 10px; font-variant-numeric: tabular-nums; justify-self: end; white-space: nowrap; }
.run-status[data-status="Running"] { background: #1f3a5a; color: #aacfff; }
.run-status[data-status="AwaitingApproval"] { background: #5a4a1f; color: #ffe699; }
.run-status[data-status="Completed"] { background: #2d4a30; color: #b9e8b4; }
.run-status[data-status="Failed"], .run-status[data-status="Rejected"], .run-status[data-status="Interrupted"] {
  background: #4a1f1f; color: #ff9090;
}

.active-run { display: flex; flex-direction: column; gap: 10px; min-height: 0; flex: 1 1 auto; }
.active-run-header { display: flex; gap: 10px; align-items: center; font-size: 13px; flex: 0 0 auto; }
.active-run-header .spacer { flex: 1 1 auto; }
.event-stream {
  background: #161618; border-radius: 6px; padding: 10px;
  overflow-y: auto; flex: 1 1 auto; min-height: 200px; font-size: 12px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
}
.event-row { display: grid; grid-template-columns: 70px 100px 1fr; gap: 8px; padding: 2px 0; }
.event-row[data-type="error"] { color: #ff8484; }
.event-row[data-type="gate-opened"] { color: #ffd966; }
.event-row[data-type="gate-resolved"] { color: #b9e8b4; }
.event-row[data-type="completed"] { color: #b9e8b4; }
.event-time { color: #666; }
.event-type { color: #888; }

.gate-card {
  background: #2a2418; border: 1px solid #5a4a1f; border-radius: 6px; padding: 12px;
  display: flex; flex-direction: column; gap: 8px; flex: 0 0 auto; max-height: 50vh; overflow-y: auto;
}
.gate-title { font-weight: 600; color: #ffe699; }
.gate-desc { font-size: 13px; color: #ddd; }
.gate-rationale { font-size: 12px; color: #ccc; }
.gate-proposal pre {
  background: #161618; padding: 10px; border-radius: 4px;
  font-size: 11px; max-height: 200px; overflow: auto; color: #b8d8ff;
}
.gate-card textarea {
  background: #161618; border: 1px solid #2a2a2e; color: #e6e6e6;
  padding: 8px; border-radius: 4px; font-family: inherit; font-size: 12px; resize: vertical;
}
.gate-actions { display: flex; gap: 8px; }
.link-btn { background: none; border: none; color: #ff8484; cursor: pointer; font-size: 11px; }
</style>
