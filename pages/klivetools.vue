<template>
  <div class="kmt-container">
    <!-- Left panel: tool list -->
    <div class="kmt-sidebar">
      <div class="kmt-sidebar-header">
        <h2 class="kmt-title">KliveMultiTool</h2>
        <button class="kmt-refresh-btn" @click="loadTools" title="Refresh tools">↺</button>
      </div>

      <div v-if="!tools.length" class="kmt-empty">No tools loaded.</div>
      <div
        v-for="tool in tools"
        :key="tool.name"
        class="kmt-tool-item"
        :class="{ active: selectedTool?.name === tool.name }"
        @click="selectTool(tool)"
      >
        <div class="kmt-tool-name">{{ tool.name }}</div>
        <div class="kmt-tool-desc">{{ tool.description }}</div>
        <div class="kmt-tool-badge">{{ tool.functions?.length ?? 0 }} fn</div>
      </div>
    </div>

    <!-- Right panel -->
    <div class="kmt-main">
      <div v-if="!selectedTool" class="kmt-no-selection">
        Select a tool from the left panel.
      </div>

      <template v-else>
        <div class="kmt-tool-header">
          <div>
            <h2 class="kmt-tool-title">{{ selectedTool.name }}</h2>
            <p class="kmt-tool-subtitle">{{ selectedTool.description }}</p>
          </div>
          <span class="kmt-perm-badge">{{ selectedTool.requiredPermissionName }}</span>
        </div>

        <!-- Tabs -->
        <div class="kmt-tabs">
          <button
            v-for="tab in ['Run', 'Observables', 'Jobs']"
            :key="tab"
            class="kmt-tab"
            :class="{ active: activeTab === tab }"
            @click="switchTab(tab)"
          >{{ tab }}</button>
        </div>

        <!-- ── Run tab ── -->
        <div v-if="activeTab === 'Run'" class="kmt-tab-content">
          <!-- Function selector -->
          <div class="kmt-field" v-if="selectedTool.functions?.length > 1">
            <label class="kmt-label">Function</label>
            <select class="kmt-select" v-model="selectedFunctionName" @change="onFunctionChange">
              <option v-for="fn in selectedTool.functions" :key="fn.name" :value="fn.name">
                {{ fn.name }}
              </option>
            </select>
          </div>

          <div v-if="selectedFunction" class="kmt-fn-desc">{{ selectedFunction.description }}</div>

          <!-- Auto-generated parameter form -->
          <div v-if="selectedFunction" class="kmt-form">
            <div
              v-for="param in selectedFunction.parameters"
              :key="param.name"
              class="kmt-field"
            >
              <label class="kmt-label">
                {{ param.name }}
                <span v-if="param.required" class="kmt-required">*</span>
                <span class="kmt-param-type">{{ param.type }}</span>
              </label>
              <div v-if="param.description" class="kmt-param-desc">{{ param.description }}</div>

              <!-- Bool → checkbox -->
              <div v-if="param.type === 'Bool'" class="kmt-checkbox-row">
                <input
                  type="checkbox"
                  :id="'param-' + param.name"
                  v-model="formValues[param.name]"
                  class="kmt-checkbox"
                />
                <label :for="'param-' + param.name" class="kmt-checkbox-label">Enable</label>
              </div>

              <!-- Dropdown -->
              <select v-else-if="param.type === 'Dropdown'" class="kmt-select" v-model="formValues[param.name]">
                <option v-for="opt in param.options" :key="opt" :value="opt">{{ opt }}</option>
              </select>

              <!-- MultiSelect -->
              <select v-else-if="param.type === 'MultiSelect'" class="kmt-select" multiple v-model="formValues[param.name]">
                <option v-for="opt in param.options" :key="opt" :value="opt">{{ opt }}</option>
              </select>

              <!-- Slider -->
              <div v-else-if="param.type === 'Slider'" class="kmt-slider-row">
                <input
                  type="range"
                  class="kmt-slider"
                  :min="param.min ?? 0"
                  :max="param.max ?? 100"
                  :step="param.step ?? 1"
                  v-model.number="formValues[param.name]"
                />
                <span class="kmt-slider-val">{{ formValues[param.name] }}</span>
              </div>

              <!-- Color -->
              <input
                v-else-if="param.type === 'Color'"
                type="color"
                class="kmt-color"
                v-model="formValues[param.name]"
              />

              <!-- DateTimeInput -->
              <input
                v-else-if="param.type === 'DateTimeInput'"
                type="datetime-local"
                class="kmt-input"
                v-model="formValues[param.name]"
              />

              <!-- Password -->
              <input
                v-else-if="param.type === 'Password'"
                type="password"
                class="kmt-input"
                v-model="formValues[param.name]"
                :placeholder="param.defaultValue ?? ''"
              />

              <!-- MultiLineText or Json → textarea -->
              <textarea
                v-else-if="param.type === 'MultiLineText' || param.type === 'Json'"
                class="kmt-textarea"
                :class="{ 'kmt-code': param.type === 'Json' }"
                v-model="formValues[param.name]"
                :placeholder="param.defaultValue ?? ''"
              />

              <!-- Int / Float → number -->
              <input
                v-else-if="param.type === 'Int' || param.type === 'Float'"
                type="number"
                class="kmt-input"
                v-model.number="formValues[param.name]"
                :placeholder="param.defaultValue ?? ''"
              />

              <!-- String, FilePath, fallback → text -->
              <input
                v-else
                type="text"
                class="kmt-input"
                v-model="formValues[param.name]"
                :placeholder="param.defaultValue ?? ''"
              />
            </div>

            <!-- Controls -->
            <div class="kmt-run-row">
              <button class="kmt-run-btn" :disabled="running" @click="executeFunction(false)">
                {{ running ? 'Running…' : 'Execute' }}
              </button>
              <button class="kmt-run-btn kmt-run-btn--async" :disabled="running" @click="executeFunction(true)">
                Run as Job
              </button>
            </div>
          </div>

          <!-- Result -->
          <div v-if="lastResult" class="kmt-result" :class="lastResult.success ? 'kmt-result--ok' : 'kmt-result--err'">
            <div class="kmt-result-header">
              <span>{{ lastResult.success ? '✓ Success' : '✗ Failed' }}</span>
              <span v-if="lastResult.errorMessage" class="kmt-result-err">{{ lastResult.errorMessage }}</span>
            </div>
            <pre class="kmt-result-output">{{ lastResult.output }}</pre>
          </div>
        </div>

        <!-- ── Observables tab ── -->
        <div v-if="activeTab === 'Observables'" class="kmt-tab-content">
          <div class="kmt-obs-header">
            <span class="kmt-obs-hint">Auto-refreshing every 2s</span>
            <button class="kmt-refresh-btn" @click="loadObservables">↺</button>
          </div>

          <div v-if="!observables.length" class="kmt-empty">No observable fields on this tool.</div>

          <div v-for="obs in observables" :key="obs.label" class="kmt-obs-card">
            <div class="kmt-obs-label">{{ obs.label }}</div>
            <div class="kmt-obs-value">

              <!-- Boolean -->
              <span v-if="obs.typeName === 'Boolean'" class="kmt-pill" :class="obs.value ? 'kmt-pill--on' : 'kmt-pill--off'">
                {{ obs.value ? 'true' : 'false' }}
              </span>

              <!-- Numeric types -->
              <span v-else-if="['Int32','Int64','Double','Single','Decimal'].includes(obs.typeName)" class="kmt-num-badge">
                {{ obs.value }}
              </span>

              <!-- String -->
              <span v-else-if="obs.typeName === 'String'" class="kmt-obs-string">{{ obs.value }}</span>

              <!-- List<String> or String[] -->
              <div v-else-if="obs.typeName === 'List<String>' || obs.typeName === 'String[]'" class="kmt-obs-log">
                <div v-for="(item, i) in (obs.value ?? [])" :key="i" class="kmt-obs-log-item">{{ item }}</div>
              </div>

              <!-- Dictionary -->
              <table v-else-if="obs.typeName?.startsWith('Dictionary')" class="kmt-obs-table">
                <tr v-for="(val, key) in obs.value" :key="key">
                  <td class="kmt-obs-key">{{ key }}</td>
                  <td class="kmt-obs-val">{{ val }}</td>
                </tr>
              </table>

              <!-- Fallback: JSON -->
              <pre v-else class="kmt-obs-json">{{ JSON.stringify(obs.value, null, 2) }}</pre>
            </div>
          </div>
        </div>

        <!-- ── Jobs tab ── -->
        <div v-if="activeTab === 'Jobs'" class="kmt-tab-content">
          <div class="kmt-jobs-header">
            <span class="kmt-obs-hint">Auto-refreshing every 3s</span>
            <button class="kmt-refresh-btn" @click="loadJobs">↺</button>
          </div>

          <div v-if="!jobs.length" class="kmt-empty">No recent jobs.</div>

          <div v-for="job in jobs" :key="job.jobId" class="kmt-job-card">
            <div class="kmt-job-header" @click="toggleJob(job.jobId)">
              <div class="kmt-job-meta">
                <span class="kmt-job-tool">{{ job.toolName }} / {{ job.functionName }}</span>
                <span class="kmt-job-id">{{ job.jobId }}</span>
              </div>
              <div class="kmt-job-right">
                <span class="kmt-status-badge" :class="statusClass(job.status)">{{ job.status }}</span>
                <span class="kmt-job-time">{{ formatDuration(job) }}</span>
                <span class="kmt-expand-icon">{{ expandedJobs.has(job.jobId) ? '▲' : '▼' }}</span>
              </div>
            </div>

            <div v-if="expandedJobs.has(job.jobId)" class="kmt-job-result">
              <div v-if="job.result?.errorMessage" class="kmt-result-err">{{ job.result.errorMessage }}</div>
              <pre class="kmt-result-output">{{ job.result?.output ?? 'No output yet.' }}</pre>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

definePageMeta({ layout: 'navbar' });

// ── State ──

const tools = ref<any[]>([]);
const selectedTool = ref<any>(null);
const selectedFunctionName = ref('');
const selectedFunction = ref<any>(null);
const formValues = ref<Record<string, any>>({});
const activeTab = ref('Run');

const running = ref(false);
const lastResult = ref<any>(null);

const observables = ref<any[]>([]);
const jobs = ref<any[]>([]);
const expandedJobs = ref<Set<string>>(new Set());

let obsInterval: ReturnType<typeof setInterval> | null = null;
let jobsInterval: ReturnType<typeof setInterval> | null = null;

// ── Load tools ──

async function loadTools() {
  try {
    const res = await RequestGETFromKliveAPI('/KliveMultiTool/tools');
    if (res.ok) tools.value = await res.json();
  } catch {}
}

// ── Select a tool ──

function selectTool(tool: any) {
  selectedTool.value = tool;
  activeTab.value = 'Run';
  lastResult.value = null;

  if (tool.functions?.length) {
    selectedFunctionName.value = tool.functions[0].name;
    selectedFunction.value = tool.functions[0];
    resetForm(tool.functions[0]);
  } else {
    selectedFunctionName.value = '';
    selectedFunction.value = null;
    formValues.value = {};
  }
}

function onFunctionChange() {
  const fn = selectedTool.value?.functions?.find((f: any) => f.name === selectedFunctionName.value);
  selectedFunction.value = fn ?? null;
  if (fn) resetForm(fn);
  lastResult.value = null;
}

function resetForm(fn: any) {
  const vals: Record<string, any> = {};
  for (const p of fn.parameters ?? []) {
    if (p.type === 'Bool') vals[p.name] = p.defaultValue === 'true' || p.defaultValue === true;
    else if (p.type === 'Slider') vals[p.name] = p.defaultValue != null ? Number(p.defaultValue) : (p.min ?? 0);
    else vals[p.name] = p.defaultValue ?? '';
  }
  formValues.value = vals;
}

// ── Tab switching ──

function switchTab(tab: string) {
  activeTab.value = tab;
  if (tab === 'Observables') startObsPolling();
  else stopObsPolling();
  if (tab === 'Jobs') startJobsPolling();
  else stopJobsPolling();
}

// ── Execute ──

async function executeFunction(asAsync: boolean) {
  if (!selectedTool.value || !selectedFunction.value) return;
  running.value = true;
  lastResult.value = null;

  try {
    const body: Record<string, string> = {};
    for (const [k, v] of Object.entries(formValues.value)) {
      body[k] = String(v);
    }

    const url = `/KliveMultiTool/execute?name=${encodeURIComponent(selectedTool.value.name)}&function=${encodeURIComponent(selectedFunction.value.name)}&async=${asAsync}`;
    const res = await RequestPOSTFromKliveAPI(url, JSON.stringify(body), false, true);
    const data = await res.json();

    if (asAsync) {
      lastResult.value = { success: true, output: `Job started: ${data.jobId}`, errorMessage: null };
      activeTab.value = 'Jobs';
      switchTab('Jobs');
    } else {
      lastResult.value = data;
    }
  } catch (e: any) {
    lastResult.value = { success: false, output: '', errorMessage: e?.message ?? 'Unknown error' };
  } finally {
    running.value = false;
  }
}

// ── Observables polling ──

async function loadObservables() {
  if (!selectedTool.value) return;
  try {
    const res = await RequestGETFromKliveAPI(`/KliveMultiTool/tool/observables?name=${encodeURIComponent(selectedTool.value.name)}`);
    if (res.ok) observables.value = await res.json();
  } catch {}
}

function startObsPolling() {
  loadObservables();
  stopObsPolling();
  obsInterval = setInterval(loadObservables, 2000);
}

function stopObsPolling() {
  if (obsInterval) { clearInterval(obsInterval); obsInterval = null; }
}

// ── Jobs polling ──

async function loadJobs() {
  try {
    const res = await RequestGETFromKliveAPI('/KliveMultiTool/jobs');
    if (res.ok) jobs.value = await res.json();
  } catch {}
}

function startJobsPolling() {
  loadJobs();
  stopJobsPolling();
  jobsInterval = setInterval(loadJobs, 3000);
}

function stopJobsPolling() {
  if (jobsInterval) { clearInterval(jobsInterval); jobsInterval = null; }
}

function toggleJob(id: string) {
  if (expandedJobs.value.has(id)) expandedJobs.value.delete(id);
  else expandedJobs.value.add(id);
}

// ── Formatting ──

function statusClass(status: string) {
  if (status === 'Completed') return 'status-ok';
  if (status === 'Failed') return 'status-fail';
  return 'status-running';
}

function formatDuration(job: any) {
  const start = new Date(job.startTime).getTime();
  const end = job.endTime ? new Date(job.endTime).getTime() : Date.now();
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── Lifecycle ──

onMounted(loadTools);

onUnmounted(() => {
  stopObsPolling();
  stopJobsPolling();
});

watch(activeTab, (tab) => {
  if (tab !== 'Observables') stopObsPolling();
  if (tab !== 'Jobs') stopJobsPolling();
});
</script>

<style scoped lang="scss">
@import '~/assets/scss/_colors.scss';

.kmt-container {
  display: flex;
  height: calc(100vh - 60px);
  background: $mainDarker;
  color: $white;
  font-family: inherit;
}

// ── Sidebar ──

.kmt-sidebar {
  width: 260px;
  min-width: 200px;
  background: $main;
  border-right: 1px solid #2a2a2a;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.kmt-sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 16px 10px;
  border-bottom: 1px solid #2a2a2a;
}

.kmt-title {
  font-size: 16px;
  font-weight: 600;
  color: $secondary;
  margin: 0;
}

.kmt-refresh-btn {
  background: transparent;
  border: 1px solid #333;
  color: $gray;
  border-radius: 4px;
  padding: 3px 8px;
  cursor: pointer;
  font-size: 14px;
  &:hover { color: $white; border-color: $secondary; }
}

.kmt-tool-item {
  padding: 12px 16px;
  border-bottom: 1px solid #1e1e1e;
  cursor: pointer;
  position: relative;
  transition: background 0.15s;

  &:hover { background: #282828; }
  &.active { background: #252525; border-left: 3px solid $secondary; }
}

.kmt-tool-name {
  font-size: 14px;
  font-weight: 500;
  color: $white;
}

.kmt-tool-desc {
  font-size: 12px;
  color: $gray;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kmt-tool-badge {
  position: absolute;
  top: 10px;
  right: 12px;
  background: #333;
  color: $gray;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 8px;
}

// ── Main area ──

.kmt-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 24px 28px;
}

.kmt-no-selection {
  color: $gray;
  font-size: 14px;
  margin: auto;
  text-align: center;
}

.kmt-tool-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
}

.kmt-tool-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 4px;
}

.kmt-tool-subtitle {
  font-size: 13px;
  color: $gray;
  margin: 0;
}

.kmt-perm-badge {
  background: #2a3a2a;
  color: $secondary;
  border: 1px solid #3a5a3a;
  font-size: 11px;
  padding: 2px 10px;
  border-radius: 12px;
  margin-left: 16px;
  white-space: nowrap;
}

// ── Tabs ──

.kmt-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid #2a2a2a;
  margin-bottom: 20px;
}

.kmt-tab {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: $gray;
  cursor: pointer;
  padding: 8px 16px;
  font-size: 13px;
  transition: all 0.15s;

  &:hover { color: $white; }
  &.active { color: $secondary; border-bottom-color: $secondary; }
}

.kmt-tab-content {
  flex: 1;
}

// ── Form ──

.kmt-fn-desc {
  font-size: 13px;
  color: $gray;
  margin-bottom: 16px;
}

.kmt-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.kmt-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.kmt-label {
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
}

.kmt-required { color: #e74c3c; }

.kmt-param-type {
  font-size: 10px;
  color: #555;
  background: #1e1e1e;
  padding: 1px 5px;
  border-radius: 4px;
}

.kmt-param-desc {
  font-size: 12px;
  color: $gray;
  margin-top: -2px;
}

.kmt-input, .kmt-select, .kmt-textarea {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 6px;
  color: $white;
  font-size: 13px;
  padding: 8px 10px;
  transition: border-color 0.15s;
  width: 100%;
  box-sizing: border-box;

  &:focus { outline: none; border-color: $secondary; }
}

.kmt-textarea {
  min-height: 90px;
  resize: vertical;
  font-family: inherit;
}

.kmt-textarea.kmt-code {
  font-family: 'Courier New', monospace;
  font-size: 12px;
}

.kmt-checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.kmt-checkbox { accent-color: $secondary; width: 16px; height: 16px; cursor: pointer; }
.kmt-checkbox-label { font-size: 13px; cursor: pointer; }

.kmt-slider-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.kmt-slider {
  flex: 1;
  accent-color: $secondary;
  cursor: pointer;
}

.kmt-slider-val {
  font-size: 13px;
  font-weight: 600;
  color: $secondary;
  min-width: 32px;
  text-align: right;
}

.kmt-color {
  width: 60px;
  height: 36px;
  border: 1px solid #333;
  border-radius: 6px;
  cursor: pointer;
  padding: 2px;
  background: #1a1a1a;
}

.kmt-run-row {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}

.kmt-run-btn {
  background: $secondary;
  border: none;
  border-radius: 6px;
  color: $white;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  padding: 9px 22px;
  transition: background 0.15s;

  &:hover:not(:disabled) { background: $teritary; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }

  &--async {
    background: #2a3a4a;
    border: 1px solid #3a5a7a;
    &:hover:not(:disabled) { background: #3a5a7a; }
  }
}

// ── Result ──

.kmt-result {
  margin-top: 20px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #333;

  &--ok { border-color: #2a5a2a; }
  &--err { border-color: #5a2a2a; }
}

.kmt-result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #1e1e1e;
  font-size: 12px;
  font-weight: 600;
}

.kmt-result-err { color: #e74c3c; font-size: 12px; }

.kmt-result-output {
  padding: 12px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #d4d4d4;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

// ── Observables ──

.kmt-obs-header, .kmt-jobs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.kmt-obs-hint { font-size: 12px; color: $gray; }

.kmt-obs-card {
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  padding: 12px 14px;
  margin-bottom: 10px;
}

.kmt-obs-label {
  font-size: 11px;
  font-weight: 600;
  color: $secondary;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.kmt-pill {
  display: inline-block;
  padding: 3px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;

  &--on { background: #1a3a1a; color: $secondary; border: 1px solid #2a5a2a; }
  &--off { background: #3a1a1a; color: #e74c3c; border: 1px solid #5a2a2a; }
}

.kmt-num-badge {
  font-size: 24px;
  font-weight: 700;
  color: $white;
}

.kmt-obs-string { font-size: 14px; color: $white; }

.kmt-obs-log {
  max-height: 160px;
  overflow-y: auto;
  background: #111;
  border-radius: 4px;
  padding: 6px 8px;
}

.kmt-obs-log-item {
  font-family: 'Courier New', monospace;
  font-size: 11px;
  color: #a0a0a0;
  padding: 1px 0;
  border-bottom: 1px solid #1a1a1a;
}

.kmt-obs-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;

  td { padding: 3px 8px; border-bottom: 1px solid #1e1e1e; }
}

.kmt-obs-key { color: $gray; font-weight: 500; width: 40%; }
.kmt-obs-val { color: $white; }

.kmt-obs-json {
  font-family: 'Courier New', monospace;
  font-size: 11px;
  color: #a0a0a0;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

// ── Jobs ──

.kmt-job-card {
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  margin-bottom: 8px;
  overflow: hidden;
}

.kmt-job-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.15s;
  &:hover { background: #222; }
}

.kmt-job-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.kmt-job-tool { font-size: 13px; font-weight: 500; color: $white; }
.kmt-job-id { font-size: 11px; color: $gray; font-family: monospace; }

.kmt-job-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.kmt-status-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 9px;
  border-radius: 10px;

  &.status-ok { background: #1a3a1a; color: $secondary; border: 1px solid #2a5a2a; }
  &.status-fail { background: #3a1a1a; color: #e74c3c; border: 1px solid #5a2a2a; }
  &.status-running { background: #1a2a3a; color: #3b82f6; border: 1px solid #2a4a6a; animation: pulse 1.5s infinite; }
}

@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }

.kmt-job-time { font-size: 11px; color: $gray; }
.kmt-expand-icon { font-size: 10px; color: $gray; }

.kmt-job-result {
  padding: 10px 14px;
  border-top: 1px solid #222;
}

// ── Misc ──

.kmt-empty {
  color: $gray;
  font-size: 13px;
  padding: 20px 0;
  text-align: center;
}
</style>
