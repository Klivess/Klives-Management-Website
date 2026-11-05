<template>
  <div class="ot-os kl-workspace">
    <div class="ot-pagehead">
      <div>
        <div class="crumbs">
          <NuxtLink to="/klivelink">Fleet</NuxtLink><span>/</span><span class="mono">{{ agentId }}</span>
        </div>
        <h1>
          {{ detail?.MachineName || agentId }}
          <StatusChip :online="detail?.IsConnected" :stale="detail?.IsConnected && isStale" />
        </h1>
        <p class="subtitle">
          <span class="mono">{{ agentId }}</span>
          <span v-if="detail?.OsVersion"> · {{ detail.OsVersion }}</span>
          <span v-if="detail?.AgentVersion"> · v{{ detail.AgentVersion }}</span>
          <span v-if="detail?.LastSeen"> · last seen {{ relative(detail.LastSeen) }}</span>
        </p>
      </div>
      <div class="ot-actions">
        <button class="ot-btn ghost" :disabled="busy" @click="refreshAll">{{ busy ? 'Working…' : 'Refresh' }}</button>
        <button v-if="canControl" class="ot-btn ghost" :disabled="!detail?.IsConnected" @click="collectNow('T0')">Collect T0</button>
        <NuxtLink to="/klivelink" class="ot-btn ghost">Fleet</NuxtLink>
      </div>
    </div>

    <div v-if="error" class="ot-banner bad" role="alert">
      <span class="glyph">⚠</span><div><strong>Command failed</strong>{{ error }}</div>
      <div class="actions"><button class="ot-btn ghost sm" @click="error = ''">Dismiss</button></div>
    </div>
    <div v-if="notice" class="ot-banner ok" role="status">
      <span class="glyph">✓</span><div>{{ notice }}</div>
      <div class="actions"><button class="ot-btn ghost sm" @click="notice = ''">Dismiss</button></div>
    </div>

    <nav class="ot-tabs" role="tablist" aria-label="Agent sections">
      <button v-for="t in tabs" :key="t.id" role="tab" :aria-selected="tab === t.id"
        class="ot-tab" :class="{ active: tab === t.id }" @click="go(t.id)">
        <span class="tab-code">{{ t.code }}</span>{{ t.label }}
      </button>
    </nav>

    <!-- OVERVIEW -->
    <div v-if="tab === 'overview'" class="tab-body">
      <section class="ot-kpis" aria-label="Agent vitals">
        <div class="ot-kpi good"><span class="k">Status</span><span class="v sm">{{ detail?.IsConnected ? (isStale ? 'Stale' : 'Online') : 'Offline' }}</span><span class="foot">{{ relative(detail?.LastSeen) }}</span></div>
        <div class="ot-kpi"><span class="k">Agent version</span><span class="v sm">{{ info?.agentVersion || detail?.AgentVersion || '—' }}</span><span class="foot">{{ detail?.OsVersion || 'Unknown OS' }}</span></div>
        <div class="ot-kpi"><span class="k">Collection</span><span class="v sm">{{ collectionState }}</span><span class="foot">{{ detail?.Summary?.Records ?? 0 }} records · {{ detail?.Summary?.Snapshots ?? 0 }} snapshots</span></div>
        <div class="ot-kpi"><span class="k">Commands</span><span class="v sm">{{ detail?.Summary?.Commands ?? 0 }}</span><span class="foot">{{ detail?.Summary?.AuditEntries ?? 0 }} audit entries</span></div>
        <div class="ot-kpi"><span class="k">Pending</span><span class="v sm">{{ busy ? '1' : '0' }}</span><span class="foot">operator actions in flight</span></div>
        <div class="ot-kpi" :class="{ bad: isStale }"><span class="k">Last seen</span><span class="v sm">{{ relative(detail?.LastSeen) }}</span><span class="foot">{{ absolute(detail?.LastSeen) }}</span></div>
      </section>

      <div class="ot-grid two">
        <section class="ot-card">
          <header><div class="titles"><h2>System</h2><p class="subtitle">Live from the agent</p></div></header>
          <div class="body">
            <div v-if="!info" class="ot-skelrows"><div v-for="n in 5" :key="n" class="ot-skel"></div></div>
            <div v-else class="kv">
              <div><span>Machine</span><b>{{ info.machineName }}</b></div>
              <div><span>User</span><b>{{ info.userName }}<template v-if="info.domain"> @ {{ info.domain }}</template></b></div>
              <div><span>OS</span><b>{{ info.osVersion }}</b></div>
              <div><span>CPU</span><b>{{ info.processorCount }} cores</b></div>
              <div><span>Memory</span><b>{{ (Number(info.totalMemoryMB || 0) / 1024).toFixed(1) }} GB</b></div>
              <div><span>Free disk</span><b>{{ (Number(info.freeDiskMB || 0) / 1024).toFixed(1) }} GB</b></div>
              <div><span>Agent started</span><b>{{ absolute(info.agentStartTime) }}</b></div>
              <div><span>Capabilities</span><b class="mono small">{{ (info.capabilities || []).join(' · ') }}</b></div>
            </div>
          </div>
        </section>
        <section class="ot-card">
          <header><div class="titles"><h2>Operations</h2><p class="subtitle">Shortest path to the next action</p></div></header>
          <div class="body quick-grid">
            <button class="ot-btn" :disabled="!canControl || !detail?.IsConnected" @click="go('terminal')">Terminal</button>
            <button class="ot-btn" :disabled="!canFiles || !detail?.IsConnected" @click="go('files')">Files</button>
            <button class="ot-btn" :disabled="!canControl || !detail?.IsConnected" @click="go('processes')">Processes</button>
            <button class="ot-btn" :disabled="!canControl || !detail?.IsConnected" @click="go('screen')">Screen</button>
            <button class="ot-btn" :disabled="!canCollection || !detail?.IsConnected" @click="collectNow('T0')">Collect T0</button>
            <button class="ot-btn ghost" @click="go('collection')">Collection</button>
            <button class="ot-btn ghost" @click="go('audit')">Audit</button>
            <button class="ot-btn ghost danger" :disabled="!canDestroy" @click="selfDestruct">Self-destruct</button>
          </div>
          <div class="body">
            <div class="kv compact">
              <div><span>Group</span><b>{{ detail?.GroupName || '—' }}</b></div>
              <div><span>Tags</span><b>{{ tagsText }}</b></div>
              <div><span>First seen</span><b>{{ absolute(detail?.FirstSeen) }}</b></div>
              <div><span>Data</span><b>{{ detail?.Summary?.Bytes ?? 0 }} bytes</b></div>
            </div>
          </div>
        </section>
      </div>

      <section class="ot-card" style="margin-top: var(--ot-gutter)">
        <header>
          <div class="titles"><h2>Recent operations</h2><p class="subtitle">Last command audit for this agent</p></div>
          <div class="controls"><button class="ot-btn ghost sm" @click="go('audit')">Open audit</button></div>
        </header>
        <div class="body flush">
          <table class="ot-table">
            <thead><tr><th>Time</th><th>Action</th><th>Status</th><th>Actor</th></tr></thead>
            <tbody>
              <tr v-for="row in (audit || []).slice(0, 8)" :key="row.Id">
                <td :title="row.Timestamp">{{ relative(row.Timestamp) }}</td>
                <td class="mono">{{ row.Action }}</td>
                <td><span class="ot-chip" :class="row.Action?.includes('failed') ? 'bad' : 'ok'">{{ row.Action?.includes('failed') ? 'failed' : 'ok' }}</span></td>
                <td>{{ row.Actor || '—' }}</td>
              </tr>
              <tr v-if="!audit?.length"><td colspan="4" class="muted">No audit entries yet.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- COLLECTION -->
    <div v-else-if="tab === 'collection'" class="tab-body">
      <div class="collection-head">
        <div class="ot-segment sm" role="group" aria-label="Collection tier">
          <button :aria-pressed="collectionTier === 'T0'" @click="collectNow('T0')">T0 fast</button>
          <button :aria-pressed="collectionTier === 'T1'" @click="collectNow('T1')">T1 full</button>
          <button :aria-pressed="collectionTier === 'T2'" @click="collectNow('T2')">T2 deep</button>
        </div>
        <input v-model="collectionQuery" class="ot-input auto" type="search" placeholder="Search name, source, user, URL…" />
        <button class="ot-btn" :disabled="!canCollection || !detail?.IsConnected" @click="collectNow('T0')">Collect T0</button>
      </div>

      <div class="ot-grid two">
        <section class="ot-card">
          <header><div class="titles"><h2>Snapshots</h2><p class="subtitle">Tiered collection runs</p></div></header>
          <div class="body flush">
            <table class="ot-table">
              <thead><tr><th>Tier</th><th>Status</th><th>Started</th><th>Bytes</th><th></th></tr></thead>
              <tbody>
                <tr v-for="s in snapshots" :key="s.SnapshotId">
                  <td><span class="ot-chip" :class="s.Tier === 'T0' ? 'ok' : s.Tier === 'T1' ? 'warn' : 'info'">{{ s.Tier }}</span></td>
                  <td>{{ s.Status }}</td>
                  <td :title="s.StartedAt">{{ relative(s.StartedAt) }}</td>
                  <td>{{ formatBytes(s.Bytes) }}</td>
                  <td class="right"><button class="ot-btn ghost sm" :disabled="!canDownload" @click="downloadBundle(s)">Bundle</button></td>
                </tr>
                <tr v-if="!snapshots.length"><td colspan="5" class="muted">No snapshots yet.</td></tr>
              </tbody>
            </table>
          </div>
        </section>
        <section class="ot-card">
          <header><div class="titles"><h2>Coverage</h2><p class="subtitle">Records by category</p></div></header>
          <div class="body coverage">
            <div v-for="c in collectionCategories" :key="c" class="coverage-row">
              <span>{{ c }}</span><b>{{ countCategory(c) }}</b><i :style="{ width: `${coveragePercent(c)}%` }"></i>
            </div>
            <div v-if="!records.length" class="muted">Run a collection to populate coverage.</div>
          </div>
        </section>
      </div>

      <section class="ot-card" style="margin-top: var(--ot-gutter)">
        <header>
          <div class="titles"><h2>Records</h2><p class="subtitle">{{ records.length }} matching records · reveal and download are audited</p></div>
          <div class="controls"><button class="ot-btn ghost sm" :disabled="loadingCollection" @click="loadCollection">Refresh</button></div>
        </header>
        <div class="body flush">
          <table class="ot-table">
            <thead><tr><th>Category</th><th>Name</th><th>User</th><th>Source</th><th>Expiry</th><th>Secret</th></tr></thead>
            <tbody>
              <tr v-for="r in filteredRecords" :key="r.RecordId">
                <td><span class="ot-chip">{{ r.Category }}</span></td>
                <td class="mono">{{ r.Name }}</td>
                <td>{{ r.Username || '—' }}</td>
                <td class="truncate" :title="r.SourcePath">{{ r.SourcePath }}</td>
                <td :title="r.ExpiresAt">{{ r.ExpiresAt ? relative(r.ExpiresAt) : '—' }}</td>
                <td>
                  <button class="ot-btn ghost sm" :disabled="!canDownload" @click="reveal(r)">{{ revealed[r.RecordId] ? 'Hide' : 'Reveal' }}</button>
                  <code v-if="revealed[r.RecordId]" class="secret">{{ revealed[r.RecordId] }}</code>
                </td>
              </tr>
              <tr v-if="!filteredRecords.length"><td colspan="6" class="muted">No matching records.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- PROCESSES -->
    <div v-else-if="tab === 'processes'" class="tab-body">
      <div class="collection-head">
        <input v-model="processQuery" class="ot-input auto" type="search" placeholder="Filter processes by name, PID, path…" />
        <button class="ot-btn" :disabled="!canControl || !detail?.IsConnected" @click="loadProcesses">Refresh</button>
      </div>
      <section class="ot-card">
        <div class="body flush">
          <table class="ot-table">
            <thead><tr><th>PID</th><th>Process</th><th>Memory</th><th>Path</th><th></th></tr></thead>
            <tbody>
              <tr v-for="p in filteredProcesses" :key="p.processId">
                <td class="mono">{{ p.processId }}</td>
                <td>{{ p.processName }}</td>
                <td>{{ Number(p.memoryMB || 0).toFixed(1) }} MB</td>
                <td class="truncate" :title="p.path">{{ p.path || '—' }}</td>
                <td class="right"><button class="ot-btn ghost sm danger" :disabled="!canControl" @click="killProcess(p)">Kill</button></td>
              </tr>
              <tr v-if="!filteredProcesses.length"><td colspan="5" class="muted">No processes loaded.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- TERMINAL -->
    <div v-else-if="tab === 'terminal'" class="tab-body">
      <section class="ot-card terminal-card">
        <header><div class="titles"><h2>Terminal</h2><p class="subtitle">{{ liveShell ? 'Live cmd.exe session' : 'cmd.exe · request/response' }}</p></div>
          <div class="controls"><button class="ot-btn ghost sm" @click="liveShell ? stopLiveShell() : startLiveShell()">{{ liveShell ? 'Stop live' : 'Start live' }}</button></div>
        </header>
        <div class="body terminal">
          <div ref="terminalEl" class="terminal-history">
            <div v-for="(entry, i) in terminalHistory" :key="i" class="term-entry">
              <div class="term-cmd">> {{ entry.command }}</div>
              <pre v-if="entry.output" class="term-out">{{ entry.output }}</pre>
              <pre v-if="entry.error" class="term-err">{{ entry.error }}</pre>
              <div v-if="entry.running" class="muted">Executing…</div>
            </div>
            <div v-if="!terminalHistory.length" class="muted">Type a command below.</div>
          </div>
          <div class="terminal-input">
            <input v-model="terminalCommand" class="ot-input mono" placeholder="whoami" @keydown.enter="runTerminal" />
            <button class="ot-btn" :disabled="terminalRunning || !canControl" @click="runTerminal">Run</button>
          </div>
        </div>
      </section>
    </div>

    <!-- FILES -->
    <div v-else-if="tab === 'files'" class="tab-body">
      <div class="collection-head">
        <button class="ot-btn ghost sm" :disabled="atRoot" @click="up">Up</button>
        <input v-model="filePath" class="ot-input mono auto" @keydown.enter="listFiles" />
        <button class="ot-btn" :disabled="!canFiles" @click="listFiles">Open</button>
      </div>
      <section class="ot-card">
        <div class="body flush">
          <table class="ot-table">
            <thead><tr><th>Name</th><th>Size</th><th>Modified</th><th></th></tr></thead>
            <tbody>
              <tr v-for="entry in dirEntries" :key="entry.fullPath">
                <td><button class="link" @click="entry.isDirectory ? openDir(entry.fullPath) : null">{{ entry.isDirectory ? '📁' : '📄' }} {{ entry.name }}</button></td>
                <td>{{ entry.isDirectory ? '—' : formatBytes(entry.sizeBytes) }}</td>
                <td :title="entry.lastModified">{{ relative(entry.lastModified) }}</td>
                <td class="right"><button v-if="!entry.isDirectory" class="ot-btn ghost sm" :disabled="!canFiles" @click="download(entry)">Download</button></td>
              </tr>
              <tr v-if="!dirEntries.length"><td colspan="4" class="muted">Directory is empty or not loaded.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
      <section class="ot-card" style="margin-top: var(--ot-gutter)">
        <header><div class="titles"><h2>Upload</h2><p class="subtitle">Base64 over the command channel</p></div></header>
        <div class="body upload-row">
          <input v-model="uploadPath" class="ot-input mono" placeholder="C:\temp\file.txt" />
          <input ref="fileInput" type="file" class="ot-input" @change="onFile" />
          <button class="ot-btn" :disabled="!canFiles || !uploadBase64 || !uploadPath" @click="upload">Upload</button>
        </div>
      </section>
    </div>

    <!-- SCREEN -->
    <div v-else-if="tab === 'screen'" class="tab-body">
      <section class="ot-card">
        <header>
          <div class="titles"><h2>Screen</h2><p class="subtitle">{{ screenActive ? 'Live frames' : 'Capture inactive' }}</p></div>
          <div class="controls">
            <select v-model.number="screenMonitor" class="ot-select sm"><option v-for="n in 4" :key="n-1" :value="n-1">Monitor {{ n-1 }}</option></select>
            <button class="ot-btn" :disabled="!canControl" @click="startScreen">{{ screenActive ? 'Restart' : 'Start' }}</button>
            <button class="ot-btn ghost" :disabled="!screenActive" @click="stopScreen">Stop</button>
          </div>
        </header>
        <div class="body">
          <div class="screen-frame">
            <img v-if="screenFrame" :src="'data:image/jpeg;base64,' + screenFrame" alt="Remote screen" />
            <div v-else class="muted">{{ screenActive ? 'Waiting for frames…' : 'Start capture to view the desktop.' }}</div>
          </div>
          <div v-if="screenMeta" class="muted small">{{ screenMeta.width }}×{{ screenMeta.height }} · monitor {{ screenMeta.monitor }} · {{ relative(screenMeta.at) }}</div>
        </div>
      </section>
    </div>

    <!-- AUDIT -->
    <div v-else-if="tab === 'audit'" class="tab-body">
      <section class="ot-card">
        <header><div class="titles"><h2>Audit</h2><p class="subtitle">Immutable command and purge trail</p></div><div class="controls"><button class="ot-btn ghost sm" @click="loadAudit">Refresh</button></div></header>
        <div class="body flush">
          <table class="ot-table">
            <thead><tr><th>Time</th><th>Action</th><th>Actor</th><th>Detail</th></tr></thead>
            <tbody>
              <tr v-for="row in audit" :key="row.Id">
                <td :title="row.Timestamp">{{ relative(row.Timestamp) }}</td>
                <td class="mono">{{ row.Action }}</td>
                <td>{{ row.Actor || '—' }}</td>
                <td class="truncate mono small">{{ JSON.stringify(row.Detail) }}</td>
              </tr>
              <tr v-if="!audit.length"><td colspan="4" class="muted">No audit entries.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- SETTINGS -->
    <div v-else-if="tab === 'settings'" class="tab-body">
      <div class="ot-grid two">
        <section class="ot-card">
          <header><div class="titles"><h2>Identity</h2><p class="subtitle">Read-only view of the enrolled agent</p></div></header>
          <div class="body kv">
            <div><span>Agent id</span><b class="mono">{{ agentId }}</b></div>
            <div><span>Machine</span><b>{{ detail?.MachineName || '—' }}</b></div>
            <div><span>OS</span><b>{{ detail?.OsVersion || '—' }}</b></div>
            <div><span>Version</span><b>{{ detail?.AgentVersion || '—' }}</b></div>
            <div><span>Group</span><b>{{ detail?.GroupName || '—' }}</b></div>
            <div><span>Tags</span><b>{{ tagsText }}</b></div>
            <div><span>Collection</span><b>{{ collectionState }}</b></div>
          </div>
        </section>
        <section class="ot-card danger-zone">
          <header><div class="titles"><h2>Danger zone</h2><p class="subtitle">Host and server are separate operations</p></div></header>
          <div class="body">
            <p><b>Self-destruct</b> runs the host cleanup sequence. It requires the agent to be online.</p>
            <button class="ot-btn danger" :disabled="!canDestroy || !detail?.IsConnected" @click="selfDestruct">Self-destruct host</button>
            <hr />
            <p><b>Remove from Omnipotent</b> deletes the server record and all command/collection data. It works offline.</p>
            <button class="ot-btn danger" :disabled="!canPurge" @click="purgeAgent">Remove from Omnipotent</button>
            <div v-if="purgeJob" class="purge-state">
              <span class="ot-chip" :class="purgeJob.State === 'done' ? 'ok' : purgeJob.State === 'failed' ? 'bad' : 'warn'">{{ purgeJob.State }}</span>
              <span class="muted">{{ purgeJob.JobId }}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from '#imports';
import { BuildKliveWsUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import { useAccess } from '~/composables/useAccess';
import StatusChip from '~/components/KliveLink/StatusChip.vue';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'KliveLink · Agent' });

const route = useRoute();
const router = useRouter();
const access = useAccess();
const agentId = computed(() => String(route.params.agentId || ''));
const tab = computed(() => String(route.params.tab || 'overview'));
const tabs = [
  { id: 'overview', code: 'OVR', label: 'Overview' },
  { id: 'collection', code: 'COL', label: 'Collection' },
  { id: 'processes', code: 'PRC', label: 'Processes' },
  { id: 'terminal', code: 'TRM', label: 'Terminal' },
  { id: 'files', code: 'FS', label: 'Files' },
  { id: 'screen', code: 'SCR', label: 'Screen' },
  { id: 'audit', code: 'AUD', label: 'Audit' },
  { id: 'settings', code: 'SET', label: 'Settings' },
];

const detail = ref<any>(null);
const info = ref<any>(null);
const audit = ref<any[]>([]);
const error = ref('');
const notice = ref('');
const busy = ref(false);

const canControl = computed(() => access.can('klivelink.agents.control'));
const canFiles = computed(() => access.can('klivelink.agents.files'));
const canDestroy = computed(() => access.can('klivelink.agents.destroy'));
const canPurge = computed(() => access.can('klivelink.agents.purge'));
const canCollection = computed(() => access.can('klivelink.collection.manage'));
const canDownload = computed(() => access.can('klivelink.collection.download'));
const isStale = computed(() => detail.value?.LastSeen && Date.now() - new Date(detail.value.LastSeen).getTime() > 3 * 60_000);
const tagsText = computed(() => {
  try { const t = JSON.parse(detail.value?.TagsJson || '[]'); return Array.isArray(t) && t.length ? t.join(', ') : '—'; }
  catch { return '—'; }
});
const collectionState = computed(() => String(detail.value?.CollectionStatus || 'none').toUpperCase());
const collectionCategories = ['browser', 'browser.cookie', 'browser.password', 'token', 'secret', 'wallet', 'credential', 'vault', 'wifi', 'password', 'email', 'game', 'messaging', 'files', 'system'];

function go(id: string) { router.push(`/klivelink/${agentId.value}/${id}`); }

async function command(operation: string, payload: any = {}, timeoutMs = 30000): Promise<any> {
  const res = await RequestPOSTFromKliveAPI('/klivelink/v2/agents/command', JSON.stringify({
    agentId: agentId.value, operation, payload, timeoutMs,
  }), true, true);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  if (data.Status !== 0 && data.Status !== 'Ok') throw new Error(data.Error || 'Command failed');
  return data.Payload ? JSON.parse(data.Payload) : null;
}

async function loadDetail() {
  const res = await RequestGETFromKliveAPI(`/klivelink/v2/agents/detail?agentId=${encodeURIComponent(agentId.value)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  detail.value = await res.json();
}
async function loadInfo() {
  try { info.value = await command('GetSystemInfo', {}); } catch (e: any) { error.value = e?.message; }
}
async function refreshAll() {
  busy.value = true; error.value = '';
  try { await Promise.all([loadDetail(), loadInfo(), loadAudit()]); }
  catch (e: any) { error.value = e?.message; }
  finally { busy.value = false; }
}

async function collectNow(tier: 'T0' | 'T1' | 'T2' = 'T0') {
  collectionTier.value = tier;
  busy.value = true; error.value = '';
  try {
    const res = await RequestPOSTFromKliveAPI('/klivelink/v2/collection/start', JSON.stringify({
      agentId: agentId.value,
      tier,
      profile: tier === 'T0' ? 't0-fast' : tier === 'T1' ? 'full' : 'deep',
      maxBytes: tier === 'T0' ? 50 * 1024 * 1024 : tier === 'T1' ? 500 * 1024 * 1024 : 2 * 1024 * 1024 * 1024,
    }), true, true);
    if (!res.ok) { const detail = await res.json().catch(() => null); throw new Error(detail?.error || `HTTP ${res.status}`); }
    notice.value = `Collection ${tier} started.`;
    await Promise.all([loadDetail(), loadCollection()]);
  } catch (e: any) { error.value = e?.message; }
  finally { busy.value = false; }
}

const processes = ref<any[]>([]);
const processQuery = ref('');
const filteredProcesses = computed(() => {
  const q = processQuery.value.toLowerCase().trim();
  return processes.value.filter(p => !q || [p.processName, p.processId, p.path].some(v => String(v || '').toLowerCase().includes(q)));
});
async function loadProcesses() {
  try { processes.value = (await command('ListProcesses', {})) || []; } catch (e: any) { error.value = e?.message; }
}
async function killProcess(p: any) {
  if (!window.confirm(`Kill ${p.processName} (PID ${p.processId})?`)) return;
  try { await command('KillProcess', { processId: Number(p.processId), tree: true }); await loadProcesses(); }
  catch (e: any) { error.value = e?.message; }
}

const terminalCommand = ref('');
const terminalRunning = ref(false);
const terminalHistory = reactive<any[]>([]);
const terminalEl = ref<HTMLElement | null>(null);
const liveShell = ref(false);
let shellSocket: WebSocket | null = null;
function startLiveShell() {
  try { shellSocket?.close(); } catch {}
  shellSocket = new WebSocket(BuildKliveWsUrl('/klivelink/v2/agents/shell/stream', { agentId: agentId.value }));
  shellSocket.onopen = () => { liveShell.value = true; terminalHistory.push({ command: '', output: '[live shell connected]', error: '', running: false }); };
  shellSocket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'output') terminalHistory.push({ command: '', output: msg.text, error: '', running: false });
    } catch {}
  };
  shellSocket.onclose = () => { liveShell.value = false; shellSocket = null; };
  shellSocket.onerror = () => { try { shellSocket?.close(); } catch {} };
}
function stopLiveShell() {
  liveShell.value = false;
  try { shellSocket?.close(); } catch {}
  shellSocket = null;
}
async function runTerminal() {
  const cmd = terminalCommand.value.trim();
  if (!cmd || terminalRunning.value) return;
  terminalCommand.value = '';
  if (liveShell.value && shellSocket?.readyState === WebSocket.OPEN) {
    terminalHistory.push({ command: cmd, output: '', error: '', running: false });
    shellSocket.send(JSON.stringify({ text: cmd + '\r\n' }));
    await nextTick(); scrollTerminal();
    return;
  }
  const entry: any = { command: cmd, output: '', error: '', running: true };
  terminalHistory.push(entry);
  terminalRunning.value = true;
  await nextTick(); scrollTerminal();
  try {
    const result = await command('RunTerminalCommand', { command: cmd, timeoutSeconds: 30 }, 45000);
    entry.output = result?.output || '';
    entry.error = result?.error || '';
    if (result?.timedOut) entry.error += '\n[command timed out]';
  } catch (e: any) { entry.error = e?.message; }
  finally { entry.running = false; terminalRunning.value = false; await nextTick(); scrollTerminal(); }
}
function scrollTerminal() { if (terminalEl.value) terminalEl.value.scrollTop = terminalEl.value.scrollHeight; }

const filePath = ref('C:\\');
const dirEntries = ref<any[]>([]);
const atRoot = computed(() => /^[A-Za-z]:\\?$/.test(filePath.value));
async function listFiles() {
  try {
    const result = await command('ListDirectory', { path: filePath.value || 'C:\\' });
    if (result?.error) throw new Error(result.error);
    dirEntries.value = result?.entries || [];
    filePath.value = result?.path || filePath.value;
  } catch (e: any) { error.value = e?.message; }
}
function openDir(path: string) { filePath.value = path; listFiles(); }
function up() {
  const clean = filePath.value.replace(/\\$/, '');
  const parts = clean.split('\\'); parts.pop();
  filePath.value = parts.length === 1 ? parts[0] + '\\' : parts.join('\\');
  listFiles();
}
async function download(entry: any) {
  try {
    const result = await command('DownloadFile', { filePath: entry.fullPath }, 60000);
    if (result?.error) throw new Error(result.error);
    const blob = base64Blob(result.base64Data);
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = entry.name; a.click(); URL.revokeObjectURL(url);
  } catch (e: any) { error.value = e?.message; }
}
const uploadPath = ref('');
const uploadBase64 = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) { uploadBase64.value = ''; return; }
  const reader = new FileReader();
  reader.onload = () => { uploadBase64.value = String(reader.result).split(',')[1] || ''; };
  reader.readAsDataURL(file);
  if (!uploadPath.value) uploadPath.value = `C:\\temp\\${file.name}`;
}
async function upload() {
  try {
    const result = await command('UploadFile', { destinationPath: uploadPath.value, base64Data: uploadBase64.value }, 60000);
    if (!result?.success) throw new Error(result?.message || 'Upload failed');
    notice.value = result.message; await listFiles();
  } catch (e: any) { error.value = e?.message; }
}

const screenActive = ref(false);
const screenMonitor = ref(0);
const screenFrame = ref('');
const screenMeta = ref<any>(null);
let screenSocket: WebSocket | null = null;
async function startScreen() {
  try {
    await command('ScreenStart', { monitorIndex: screenMonitor.value, quality: 50, intervalMs: 700 });
    screenActive.value = true;
    connectScreen();
  } catch (e: any) { error.value = e?.message; }
}
function connectScreen() {
  try { screenSocket?.close(); } catch {}
  screenSocket = new WebSocket(BuildKliveWsUrl('/klivelink/v2/agents/screen/stream', { agentId: agentId.value }));
  screenSocket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'frame') { screenFrame.value = msg.base64; screenMeta.value = msg.metadata; }
    } catch {}
  };
  screenSocket.onclose = () => { if (screenActive.value) setTimeout(connectScreen, 1500); };
}
async function stopScreen() {
  screenActive.value = false;
  try { screenSocket?.close(); } catch {}
  try { await command('ScreenStop', {}); } catch {}
}

const snapshots = ref<any[]>([]);
const records = ref<any[]>([]);
const collectionTier = ref<'T0' | 'T1' | 'T2'>('T0');
const collectionQuery = ref('');
const collectionCategory = ref('');
const loadingCollection = ref(false);
const revealed = reactive<Record<string, string>>({});
const filteredRecords = computed(() => {
  const q = collectionQuery.value.toLowerCase().trim();
  return records.value.filter(r => {
    if (collectionCategory.value && r.Category !== collectionCategory.value) return false;
    if (!q) return true;
    return [r.Name, r.Username, r.SourcePath, r.Url, r.Category].some(v => String(v || '').toLowerCase().includes(q));
  });
});
async function loadCollection() {
  loadingCollection.value = true;
  try {
    const [sRes, rRes] = await Promise.all([
      RequestGETFromKliveAPI(`/klivelink/v2/collection/snapshots?agentId=${encodeURIComponent(agentId.value)}&limit=50`),
      RequestGETFromKliveAPI(`/klivelink/v2/collection/records?agentId=${encodeURIComponent(agentId.value)}&limit=1000`),
    ]);
    snapshots.value = sRes.ok ? await sRes.json() : [];
    records.value = rRes.ok ? await rRes.json() : [];
  } catch (e: any) { error.value = e?.message; }
  finally { loadingCollection.value = false; }
}
async function reveal(record: any) {
  if (revealed[record.RecordId]) { delete revealed[record.RecordId]; return; }
  try {
    const res = await RequestGETFromKliveAPI(`/klivelink/v2/collection/record?recordId=${encodeURIComponent(record.RecordId)}&reveal=true`);
    const data = await res.json();
    revealed[record.RecordId] = data.Secret || '(empty or locked)';
  } catch (e: any) { error.value = e?.message; }
}
async function downloadBundle(snapshot: any) {
  try {
    const res = await RequestGETFromKliveAPI(`/klivelink/v2/collection/download?snapshotId=${encodeURIComponent(snapshot.SnapshotId)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${snapshot.SnapshotId}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e: any) { error.value = e?.message; }
}
function countCategory(category: string) { return records.value.filter(r => r.Category === category).length; }
function coveragePercent(category: string) {
  const max = Math.max(1, ...collectionCategories.map(countCategory));
  return Math.round((countCategory(category) / max) * 100);
}

async function loadAudit() {
  try {
    const res = await RequestGETFromKliveAPI(`/klivelink/v2/audit?agentId=${encodeURIComponent(agentId.value)}&limit=200`);
    audit.value = res.ok ? await res.json() : [];
  } catch { audit.value = []; }
}

async function updateAgent() {
  try {
    const res = await RequestPOSTFromKliveAPI(`/klivelink/v2/agents/update?agentId=${encodeURIComponent(agentId.value)}`, '', true, false);
    const data = await res.json();
    notice.value = data.Status === 0 || data.Status === 'Ok'
      ? 'Update accepted; the agent will restart.'
      : (data.Error || 'Update failed.');
  } catch (e: any) { error.value = e?.message; }
}

async function selfDestruct() {  const typed = window.prompt(`Type the agent id to self-destruct the host:\n${agentId.value}`);
  if (typed !== agentId.value) return;
  try {
    const res = await RequestPOSTFromKliveAPI(`/klivelink/v2/agents/selfdestruct?agentId=${encodeURIComponent(agentId.value)}`, '', true, false);
    const data = await res.json();
    notice.value = data.Status === 0 || data.Status === 'Ok' ? 'Self-destruct accepted.' : (data.Error || 'Self-destruct failed.');
    await loadDetail();
  } catch (e: any) { error.value = e?.message; }
}

const purgeJob = ref<any>(null);
let purgePoll: ReturnType<typeof setInterval> | null = null;
async function purgeAgent() {
  const typed = window.prompt(`Type the agent id to delete all its data from Omnipotent:\n${agentId.value}`);
  if (typed !== agentId.value) return;
  try {
    const res = await RequestPOSTFromKliveAPI('/klivelink/v2/agents/purge', JSON.stringify({
      agentId: agentId.value, keepAudit: false, deleteRemote: false, deleteCollection: true,
    }), true, true);
    purgeJob.value = await res.json();
    if (purgeJob.value?.JobId) {
      purgePoll = setInterval(async () => {
        const r = await RequestGETFromKliveAPI(`/klivelink/v2/agents/purge/status?jobId=${encodeURIComponent(purgeJob.value.JobId)}`);
        if (r.ok) {
          purgeJob.value = await r.json();
          if (['done', 'failed', 'partial'].includes(purgeJob.value.State)) { clearInterval(purgePoll!); purgePoll = null; await loadDetail(); }
        }
      }, 1000);
    }
  } catch (e: any) { error.value = e?.message; }
}

function formatBytes(bytes: number) {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
function relative(value: string) {
  if (!value) return '—';
  const ms = Date.now() - new Date(value).getTime();
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}
function absolute(value: string) { return value ? new Date(value).toLocaleString() : '—'; }
function base64Blob(base64: string) {
  const chars = atob(base64);
  const bytes = new Uint8Array(chars.length);
  for (let i = 0; i < chars.length; i++) bytes[i] = chars.charCodeAt(i);
  return new Blob([bytes]);
}

watch(tab, (value) => {
  if (value === 'processes') loadProcesses();
  if (value === 'files') listFiles();
  if (value === 'collection') loadCollection();
  if (value === 'audit') loadAudit();
  if (value === 'screen') { /* start is explicit */ }
});
watch(agentId, () => { refreshAll(); if (tab.value === 'collection') loadCollection(); }, { immediate: true });

onMounted(() => { refreshAll(); });
onBeforeUnmount(() => { try { screenSocket?.close(); } catch {} try { shellSocket?.close(); } catch {} if (purgePoll) clearInterval(purgePoll); });
</script>

<style scoped>
.kl-workspace { padding: var(--ot-space-4) var(--ot-space-6) 64px; }
.crumbs { display: flex; gap: 6px; color: var(--ot-muted); font-size: 11px; margin-bottom: 4px; }
.crumbs a { color: var(--ot-accent); }
.ot-pagehead h1 { display: flex; align-items: center; gap: 10px; }
.tab-body { padding-top: var(--ot-space-4); }
.tab-code { font-family: var(--ot-mono); font-size: 9px; color: var(--ot-muted); letter-spacing: 1px; margin-right: 6px; }
.ot-tabs { margin-top: var(--ot-space-4); }
.kv { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 18px; }
.kv.compact { grid-template-columns: 1fr; }
.kv > div { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--ot-line); padding: 7px 0; }
.kv span { color: var(--ot-muted); font-size: 11.5px; }
.kv b { font-size: 12.5px; font-weight: 600; text-align: right; overflow-wrap: anywhere; }
.quick-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.quick-grid .ot-btn { width: 100%; justify-content: center; }
.collection-head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: var(--ot-gutter); }
.collection-head .auto { flex: 1 1 320px; }
.coverage { display: flex; flex-direction: column; gap: 8px; }
.coverage-row { display: grid; grid-template-columns: 120px 38px 1fr; align-items: center; gap: 8px; font-size: 12px; }
.coverage-row span { color: var(--ot-text-2); }
.coverage-row b { font-family: var(--ot-mono); text-align: right; }
.coverage-row i { height: 5px; border-radius: 999px; background: var(--ot-accent); display: block; min-width: 2px; }
.terminal-card .terminal { display: flex; flex-direction: column; gap: 8px; }
.terminal-history { min-height: 320px; max-height: 55vh; overflow: auto; background: #0c0d0c; border: 1px solid var(--ot-line); border-radius: var(--ot-radius-sm); padding: 10px; font-family: var(--ot-mono); font-size: 12px; }
.term-entry { margin-bottom: 10px; }
.term-cmd { color: var(--ot-accent); }
.term-out { white-space: pre-wrap; color: var(--ot-text); margin: 4px 0 0; }
.term-err { white-space: pre-wrap; color: var(--ot-negative); margin: 4px 0 0; }
.terminal-input { display: flex; gap: 8px; }
.terminal-input .ot-input { flex: 1; }
.upload-row { display: flex; gap: 8px; flex-wrap: wrap; }
.upload-row .ot-input { flex: 1 1 240px; }
.screen-frame { min-height: 360px; max-height: 68vh; display: flex; align-items: center; justify-content: center; background: #0b0c0b; border: 1px solid var(--ot-line); border-radius: var(--ot-radius-sm); overflow: auto; }
.screen-frame img { max-width: 100%; max-height: 68vh; object-fit: contain; }
.secret { display: block; margin-top: 4px; padding: 4px 6px; background: var(--ot-surface-2); border-radius: 4px; font-size: 10.5px; overflow-wrap: anywhere; }
.truncate { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.danger { color: var(--ot-negative); }
.danger-zone { border-color: rgba(255, 123, 123, .35); }
.danger-zone hr { border: 0; border-top: 1px solid var(--ot-line); margin: 14px 0; }
.danger-zone p { color: var(--ot-text-2); font-size: 12px; margin: 0 0 8px; }
.purge-state { display: flex; gap: 8px; align-items: center; margin-top: 10px; font-size: 11px; }
.link { background: none; border: 0; padding: 0; color: var(--ot-text); cursor: pointer; text-align: left; }
.link:hover { color: var(--ot-accent); }
.small { font-size: 10.5px; }
@media (max-width: 900px) {
  .kl-workspace { padding: var(--ot-space-3) var(--ot-space-4) 48px; }
  .kv { grid-template-columns: 1fr; }
  .ot-tabs { overflow-x: auto; white-space: nowrap; }
  .quick-grid { grid-template-columns: 1fr; }
  .collection-head .auto { flex-basis: 100%; }
}
</style>
