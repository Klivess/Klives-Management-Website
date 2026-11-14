<template>
  <div class="ktx-panel ktx-fw" data-testid="ktx-firmware">
    <!-- can this server build at all? -->
    <ul class="ktx-ready" aria-label="Firmware readiness">
      <li :data-tone="toolchain ? (toolchain.found ? 'ok' : 'crit') : 'neutral'" data-testid="ready-toolchain">
        <TechIcon :name="toolchain?.found ? 'check-circle' : toolchain ? 'octagon-x' : 'clock'" />
        <span><b>Toolchain</b>{{ toolchain ? (toolchain.found ? toolchain.version || toolchain.command : toolchain.error) : statusSupported ? 'checking…' : 'not reported by this server' }}</span>
      </li>
      <li :data-tone="status ? (status.firmware.libraryConfigured ? 'ok' : 'warn') : 'neutral'">
        <TechIcon :name="status?.firmware.libraryConfigured ? 'check-circle' : 'alert'" />
        <span><b>KliveTech library</b>{{ status ? (status.firmware.libraryConfigured ? 'path set (KliveTechLibraryPath)' : 'KliveTechLibraryPath is empty: arduino-cli uses its own library folder') : '—' }}</span>
      </li>
      <li :data-tone="validProjects.length ? 'ok' : 'warn'">
        <TechIcon :name="validProjects.length ? 'check-circle' : 'inbox'" />
        <span><b>Inbox</b>{{ validProjects.length ? `${validProjects.length} project${validProjects.length === 1 ? '' : 's'} ready` : 'empty' }}<template v-if="config"> · <span class="ktx-mono" :title="config.inboxDirectory">{{ shortPath(config.inboxDirectory) }}</span></template></span>
        <button class="ktx-btn ktx-btn--xs ktx-btn--ghost" :disabled="busy" data-testid="fw-rescan" @click="emit('rescan')"><TechIcon name="refresh" :class="{ 'ktx-spin': busy }" />Rescan</button>
      </li>
    </ul>
    <p v-if="error" class="ktx-callout" data-tone="crit" style="margin: 0 14px 12px"><TechIcon name="octagon-x" /><span>{{ error }}</span></p>

    <div class="ktx-fw__grid">
      <!-- build & flash -->
      <form class="ktx-fw__form" aria-label="Build and flash" @submit.prevent="submit">
        <h3 class="ktx-sec-title"><TechIcon name="upload" />Build &amp; flash</h3>
        <label class="ktx-label" for="ktx-fw-project">Project</label>
        <select id="ktx-fw-project" v-model="form.project" class="ktx-select ktx-select--block" data-testid="fw-project">
          <option value="">Choose a project…</option>
          <option v-for="p in projects" :key="p.name" :value="p.name" :disabled="!p.valid">{{ p.name }}{{ p.valid ? '' : ' — unusable' }}</option>
        </select>
        <p v-if="chosen && !chosen.valid" class="ktx-err">{{ chosen.error }}</p>
        <p v-else-if="chosen?.sketches.length" class="ktx-hint ktx-mono">{{ chosen.sketches.join(', ') }}</p>
        <p v-else-if="!projects.length" class="ktx-hint">Put an Arduino sketch folder in the inbox, then Rescan.</p>

        <label class="ktx-label" for="ktx-fw-target">Target</label>
        <select id="ktx-fw-target" v-model="form.gadgetID" class="ktx-select ktx-select--block" data-testid="fw-target">
          <option value="">Compile only (no gadget)</option>
          <option v-for="g in targets" :key="g.gadgetID" :value="g.gadgetID">{{ g.name }}</option>
        </select>

        <details class="ktx-fw__board">
          <summary>Board · <span class="ktx-mono">{{ form.fqbn || config?.defaultFqbn || 'esp32:esp32:esp32' }}</span> · <span class="ktx-mono">{{ form.partitionScheme || config?.defaultPartitionScheme || 'min_spiffs' }}</span></summary>
          <label class="ktx-label" for="ktx-fw-fqbn">Board (FQBN)</label>
          <input id="ktx-fw-fqbn" v-model="form.fqbn" class="ktx-input ktx-input--block ktx-mono" :placeholder="config?.defaultFqbn || 'esp32:esp32:esp32'" @keydown.stop />
          <label class="ktx-label" for="ktx-fw-part">Partition scheme</label>
          <input id="ktx-fw-part" v-model="form.partitionScheme" class="ktx-input ktx-input--block ktx-mono" :placeholder="config?.defaultPartitionScheme || 'min_spiffs'" @keydown.stop />
          <p class="ktx-hint">Left empty, the server's defaults apply. Streamables and the relay need Minimal SPIFFS.</p>
        </details>

        <div class="ktx-row" style="margin-top: 12px">
          <button class="ktx-btn ktx-btn--primary" type="submit" :disabled="!canDeploy || !chosen?.valid || busy" data-testid="fw-submit">
            <TechIcon :name="form.gadgetID ? 'upload' : 'chip'" />{{ form.gadgetID ? 'Compile & flash' : 'Compile' }}
          </button>
          <span v-if="!canDeploy" class="ktx-dim">Your profile can't build or flash.</span>
          <span v-else-if="config" class="ktx-faint">{{ fmtBytes(config.chunkSize) }} chunks · up to {{ fmtBytes(config.maximumFirmwareBytes) }}</span>
        </div>
      </form>

      <!-- jobs -->
      <div class="ktx-fw__jobs">
        <h3 class="ktx-sec-title"><TechIcon name="history" />Jobs<span class="ktx-sec-title__meta">{{ jobs.length ? `${jobs.length} this run of the server` : 'none yet' }}</span></h3>
        <ol v-if="jobs.length" class="ktx-jobs">
          <li v-for="job in jobs" :key="job.jobID" class="ktx-job" :data-state="job.state" :aria-expanded="open === job.jobID" :data-testid="`job-${job.jobID}`">
            <button class="ktx-job__row" @click="toggle(job.jobID)">
              <span class="ktx-chip" :data-tone="jobTone(job.state)">{{ job.state }}</span>
              <span class="ktx-job__what">
                <b class="ktx-truncate">{{ job.project }}</b>
                <span class="ktx-faint ktx-truncate">{{ job.kind === 'Update' ? `→ ${job.gadgetName || 'gadget'}` : 'compile only' }}</span>
              </span>
              <span v-if="!isTerminalJob(job.state)" class="ktx-meter" :data-indeterminate="job.state === 'Compiling' || undefined">
                <span class="ktx-meter__fill" :style="{ width: `${job.progressPercent}%` }"></span>
              </span>
              <span class="ktx-faint ktx-num ktx-job__when">{{ isTerminalJob(job.state) ? jobDuration(job) : progress(job) }}</span>
              <span class="ktx-faint ktx-job__when">{{ fmtClock(job.createdUtc, now) }}</span>
            </button>
            <div v-if="open === job.jobID" class="ktx-job__detail">
              <p v-if="job.error" class="ktx-callout" data-tone="crit"><TechIcon name="octagon-x" /><span>{{ job.error }}</span></p>
              <dl class="ktx-kv">
                <dt>Board</dt><dd class="ktx-mono">{{ job.fqbn }} · {{ job.partitionScheme }}</dd>
                <dt>Image</dt><dd>{{ job.firmwareFileName || '—' }}<template v-if="job.totalBytes"> · {{ fmtBytes(job.totalBytes) }}</template></dd>
                <dt>SHA-256</dt><dd class="ktx-mono">{{ job.firmwareSha256 ? `${job.firmwareSha256.slice(0, 24)}…` : '—' }}</dd>
                <dt>Times</dt><dd>{{ fmtTime(job.startedUtc) }} → {{ fmtTime(job.completedUtc) }}</dd>
              </dl>
              <div class="ktx-log">
                <div class="ktx-log__bar">
                  <span class="ktx-faint">{{ job.compilerOutput ? `${job.compilerOutput.split('\n').length} lines` : 'no output yet' }}</span>
                  <span class="ktx-grow"></span>
                  <label class="ktx-check"><input v-model="errorsOnly" type="checkbox" />Errors only</label>
                  <button class="ktx-btn ktx-btn--xs ktx-btn--ghost" :disabled="!job.compilerOutput" @click="copyLog(job)"><TechIcon name="copy" />Copy</button>
                </div>
                <pre class="ktx-log__body ktx-mono"><template v-for="(line, i) in logLines(job)" :key="i"><span :data-tone="lineTone(line)">{{ line }}</span>
</template></pre>
              </div>
              <div class="ktx-row" style="margin-top: 8px">
                <button v-if="!isTerminalJob(job.state) && canDeploy" class="ktx-btn ktx-btn--sm ktx-btn--danger" @click="emit('cancel', job)"><TechIcon name="x" />Cancel job</button>
              </div>
            </div>
          </li>
        </ol>
        <div v-else class="ktx-empty"><TechIcon name="chip" /><span>No firmware job yet. Compiling needs no gadget: it is the quickest check that the toolchain works.</span></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  fmtBytes, fmtClock, fmtTime, isTerminalJob, jobDuration, jobTone, ktCopy,
  type FirmwareConfig, type FirmwareJob, type FirmwareProject, type FleetItem, type HubStatus,
} from '~/scripts/kliveTech';

/** Whether the server can build, what is in the inbox, a build or flash form, and every job's log. */
const props = defineProps<{
  status: HubStatus | null;
  statusSupported: boolean;
  config: FirmwareConfig | null;
  projects: FirmwareProject[];
  jobs: FirmwareJob[];
  targets: FleetItem[];
  error: string;
  busy: boolean;
  canDeploy: boolean;
  now: number;
  preset: string;
}>();
const emit = defineEmits<{
  start: [form: { project: string; fqbn: string; partitionScheme: string; gadgetID: string }];
  cancel: [job: FirmwareJob];
  rescan: [];
  copied: [];
}>();

const form = reactive({ project: '', fqbn: '', partitionScheme: '', gadgetID: '' });
const open = ref('');
const errorsOnly = ref(false);

const toolchain = computed(() => props.status?.firmware?.toolchain ?? null);
const validProjects = computed(() => props.projects.filter(p => p.valid));
const chosen = computed(() => props.projects.find(p => p.name === form.project) ?? null);

watch(() => props.preset, id => { if (id) form.gadgetID = id; }, { immediate: true });
watch(validProjects, list => { if (!form.project && list.length === 1) form.project = list[0].name; }, { immediate: true });
// A job that was just started opens itself, so its log is in view.
watch(() => props.jobs[0]?.jobID, (id, previous) => { if (id && previous !== undefined && id !== previous) open.value = id; });

function submit() {
  if (!chosen.value?.valid) return;
  emit('start', { ...form });
}
function toggle(id: string) {
  open.value = open.value === id ? '' : id;
}
function progress(job: FirmwareJob) {
  if (job.state === 'Compiling') return 'compiling';
  if (!job.totalBytes) return `${job.progressPercent}%`;
  return `${fmtBytes(job.bytesTransferred)} / ${fmtBytes(job.totalBytes)}`;
}
function logLines(job: FirmwareJob) {
  const lines = (job.compilerOutput || '').split(/\r?\n/);
  const shown = errorsOnly.value ? lines.filter(line => lineTone(line)) : lines;
  return shown.length > 2000 ? shown.slice(-2000) : shown;
}
function lineTone(line: string) {
  if (/\berror\b|fatal|undefined reference/i.test(line)) return 'crit';
  if (/\bwarning\b/i.test(line)) return 'warn';
  return undefined;
}
async function copyLog(job: FirmwareJob) {
  if (await ktCopy(job.compilerOutput)) emit('copied');
}
/** The inbox folder's own name; the full path is in the tooltip. */
function shortPath(path: string) {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}
</script>
