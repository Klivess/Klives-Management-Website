<template>
  <section class="computer-workspace">
    <nav aria-label="Computer tools">
      <button v-for="item in ['Desktop', 'Terminal', 'Files', 'Apps']" :key="item" :aria-pressed="tab === item" @click="tab = item">{{ item }}</button>
      <span role="status">{{ status }}</span>
    </nav>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <ProjectsContainerRemoteDesktop v-if="tab === 'Desktop'" :container-id="computerId" :label="label" :fps="12" />
    <ProjectsFilesPanel v-else-if="tab === 'Files'" :project-id="projectId" status="Active" />
    <div v-else-if="tab === 'Apps'" class="tools">
      <p>Install Linux applications in Terminal with sudo, then launch them here or from the desktop.</p>
      <form @submit.prevent="launchApp">
        <label>Application <input v-model="application" placeholder="mousepad" required /></label>
        <button :disabled="sending">Launch application</button>
      </form>
      <button @click="launch('files')">Open file manager</button>
      <button @click="launch('terminal')">Open graphical terminal</button>
    </div>
    <div v-else class="terminal">
      <div class="job-picker">
        <label>Existing job <select v-model="jobId" @change="selectJob"><option value="">Select a job</option><option v-for="job in jobs" :key="job.id" :value="job.id">{{ job.id.slice(0, 12) }} · {{ job.state }}</option></select></label>
        <button @click="refreshJobs">Refresh jobs</button>
      </div>
      <pre tabindex="0" aria-label="Terminal output">{{ output || 'Output appears here. Closing this panel does not stop your jobs.' }}</pre>
      <form @submit.prevent="startJob">
        <label>Command<textarea v-model="command" placeholder="sudo apt-get update" rows="3" /></label>
        <label class="check"><input v-model="interactive" type="checkbox" />Interactive Bash session</label>
        <label class="check"><input v-model="heavy" type="checkbox" />Queue as a resource-intensive job</label>
        <button :disabled="sending || (!interactive && !command.trim())">Start new job</button>
      </form>
      <form v-if="jobId" @submit.prevent="sendInput(false)">
        <label>Input to selected job<input v-model="input" placeholder="Type a response, then Send" /></label>
        <button :disabled="sending">Send input</button>
        <button type="button" :disabled="sending" @click="sendInput(true)">Cancel selected job</button>
      </form>
      <p v-if="jobId" class="hint">Job {{ jobId }} · output cursor {{ cursor }}. A slow response does not cancel the job.</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import ProjectsContainerRemoteDesktop from './ContainerRemoteDesktop.vue';
import ProjectsFilesPanel from './FilesPanel.vue';

const props = defineProps<{ projectId: string; computerId: string; label: string }>();
const tab = ref('Desktop');
const status = ref('Persistent computer');
const error = ref('');
const jobs = ref<any[]>([]);
const jobId = ref('');
const cursor = ref(0);
const output = ref('');
const command = ref('');
const input = ref('');
const application = ref('mousepad');
const interactive = ref(false);
const heavy = ref(false);
const sending = ref(false);
let polling = false;
let timer: ReturnType<typeof setInterval> | undefined;
const storageKey = `ka-computer-job:${props.computerId}`;

async function request(target: string, method = 'GET', payload?: any, at?: number) {
  const response = await RequestPOSTFromKliveAPI(`/projects/computers/request?projectID=${encodeURIComponent(props.projectId)}`,
    JSON.stringify({ computerID: props.computerId, target, method, payload, cursor: at }), false, false);
  if (!response.ok) throw new Error('Computer request is still unavailable. Inspect the saved job or operation before trying again.');
  return response.json();
}
async function refreshJobs() {
  try { jobs.value = await request('jobs'); } catch (e: any) { error.value = e.message; }
}
async function pollJob() {
  if (!jobId.value || polling) return;
  polling = true;
  const selected = jobId.value;
  try {
    const job = await request(`jobs/${encodeURIComponent(selected)}`, 'GET', undefined, cursor.value);
    if (jobId.value !== selected) return;
    output.value = (output.value + (job.output || '')).slice(-250000);
    cursor.value = job.cursor ?? cursor.value;
    status.value = `${job.state}${job.result?.reason ? ` · ${job.result.reason}` : ''}`;
    error.value = '';
  } catch (e: any) { error.value = e.message; }
  finally { polling = false; }
}
function selectJob() { cursor.value = 0; output.value = ''; localStorage.setItem(storageKey, jobId.value); pollJob(); }
async function startJob() {
  sending.value = true; error.value = '';
  const id = crypto.randomUUID().replaceAll('-', '');
  // Save before submission so a lost response never encourages rerunning the command.
  jobId.value = id; selectJob();
  try {
    const job = await request('jobs', 'POST', { operationID: id, command: command.value, interactive: interactive.value, heavy: heavy.value });
    status.value = job.state; command.value = ''; await refreshJobs(); await pollJob();
  } catch (e: any) { error.value = `${e.message} Saved job ID: ${id}.`; }
  finally { sending.value = false; }
}
async function sendInput(cancel: boolean) {
  sending.value = true;
  try {
    const result = await request(`jobs/${encodeURIComponent(jobId.value)}/input`, 'POST',
      { operationID: crypto.randomUUID().replaceAll('-', ''), text: input.value + '\n', cancel });
    status.value = result.state; input.value = ''; await pollJob();
  } catch (e: any) { error.value = e.message; }
  finally { sending.value = false; }
}
async function launchApp() { await launch(application.value); }
async function launch(app: string) {
  sending.value = true;
  const id = crypto.randomUUID().replaceAll('-', '');
  try {
    await request('actions', 'POST', { operationID: id, actorID: 'launcher', tool: 'computer_launch_app', arguments: { app } });
    status.value = `Launch queued · ${id}`; tab.value = 'Desktop';
  } catch (e: any) { error.value = `${e.message} Operation: ${id}`; }
  finally { sending.value = false; }
}
onMounted(() => {
  jobId.value = localStorage.getItem(storageKey) || '';
  refreshJobs(); pollJob(); timer = setInterval(pollJob, 2000);
});
onBeforeUnmount(() => { if (timer) clearInterval(timer); });
</script>

<style scoped>
.computer-workspace { width: 100%; min-width: 0; color: #dedde3; }
nav, .job-picker { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px; }
nav span { margin-left: auto; font-size: 12px; color: #aaa; }
button, input, textarea, select { background: #23232a; color: inherit; border: 1px solid #494951; border-radius: 5px; padding: 8px 12px; }
button { cursor: pointer; } button[aria-pressed="true"] { border-color: #8acb7b; } button:disabled { opacity: .5; }
.terminal, .tools { padding: 12px; } label { display: flex; gap: 8px; flex-direction: column; margin-bottom: 10px; }
.check { flex-direction: row; align-items: center; } form { margin: 12px 0; }
pre { background: #111116; padding: 14px; min-height: 260px; max-height: 48vh; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font: 13px/1.5 monospace; }
.error { color: #edc995; padding: 10px; } .hint { font-size: 12px; color: #aaa; overflow-wrap: anywhere; }
</style>
