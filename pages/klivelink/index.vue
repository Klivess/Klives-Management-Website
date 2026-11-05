<template>
  <div class="ot-os kl-fleet">
    <div class="ot-pagehead">
      <div>
        <h1><span class="code">KLNK</span>Fleet command</h1>
        <p class="subtitle">Every enrolled computer, its last known state, and the shortest path to its terminal, files and collection.</p>
      </div>
      <div class="ot-actions">
        <span class="ot-chip" :class="eventState === 'live' ? 'ok' : 'warn'">
          <span class="pulse" aria-hidden="true"></span>{{ eventState === 'live' ? 'Live' : 'Polling' }}
        </span>
        <button class="ot-btn ghost" :disabled="loading" @click="load">{{ loading ? 'Refreshing…' : 'Refresh' }}</button>
        <NuxtLink to="/klivelink/collection" class="ot-btn ghost">Collection</NuxtLink>
        <NuxtLink to="/klivelink/audit" class="ot-btn ghost">Audit</NuxtLink>
        <NuxtLink to="/klivelink/infect" class="ot-btn ghost">Infect EXE</NuxtLink>
        <span class="ot-chip mono" title="Command palette">Ctrl K</span>
      </div>
    </div>

    <div v-if="error" class="ot-banner bad" role="alert">
      <span class="glyph" aria-hidden="true">⚠</span>
      <div><strong>Fleet unavailable</strong>{{ error }}</div>
      <div class="actions"><button class="ot-btn ghost sm" @click="load">Retry</button></div>
    </div>

    <section class="ot-kpis" aria-label="Fleet summary">
      <div class="ot-kpi good"><span class="k">Online</span><span class="v">{{ counts.online }}</span><span class="foot">heartbeat + socket open</span></div>
      <div class="ot-kpi warn" :class="{ attention: counts.stale > 0 }"><span class="k">Stale</span><span class="v">{{ counts.stale }}</span><span class="foot">commands may time out</span></div>
      <div class="ot-kpi"><span class="k">Offline</span><span class="v">{{ counts.offline }}</span><span class="foot">no live socket</span></div>
      <div class="ot-kpi" :class="{ info: counts.collected > 0 }"><span class="k">Collected</span><span class="v">{{ counts.collected }}</span><span class="foot">at least one snapshot</span></div>
      <div class="ot-kpi" :class="{ bad: counts.attention > 0 }"><span class="k">Attention</span><span class="v">{{ counts.attention }}</span><span class="foot">stale, no collection, or failed</span></div>
      <div class="ot-kpi"><span class="k">Fleet versions</span><span class="v sm">{{ versionCount }}</span><span class="foot">distinct agent builds</span></div>
    </section>

    <div class="ot-filterbar">
      <div class="ot-segment sm" role="group" aria-label="Agent state filter">
        <button v-for="f in filters" :key="f.key" type="button" :aria-pressed="filter === f.key" @click="filter = f.key">
          {{ f.label }} <span class="muted">{{ f.count }}</span>
        </button>
      </div>
      <input v-model="query" class="ot-input auto" type="search" placeholder="Search machine, agent id, OS, version, tag…" aria-label="Search fleet" />
      <span class="grow"></span>
      <span class="summary">Showing <b>{{ visible.length }}</b> of {{ agents.length }}</span>
    </div>

    <div v-if="loading && !agents.length" class="ot-skelrows">
      <div v-for="n in 6" :key="n" class="ot-skel" style="height:52px"></div>
    </div>
    <div v-else-if="!agents.length" class="ot-card kl-empty">
      <div class="glyph">⌁</div>
      <h2>No agents enrolled</h2>
      <p>Deploy the v2 agent with a valid enrollment token. It will appear here after the first handshake.</p>
    </div>
    <div v-else class="ot-card" style="overflow:hidden">
      <div class="ot-tablewrap">
        <table class="ot-table kl-table">
          <thead>
            <tr>
              <th>State</th><th>Machine</th><th>OS</th><th>Version</th><th>Collection</th><th>Last seen</th><th>Tags</th><th class="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="agent in visible" :key="agent.AgentId" @dblclick="open(agent)">
              <td><StatusChip :online="agent.IsConnected" :stale="agent.Stale" /></td>
              <td>
                <NuxtLink :to="`/klivelink/${agent.AgentId}/overview`" class="agent-name">{{ agent.MachineName || agent.AgentId }}</NuxtLink>
                <div class="agent-id mono">{{ agent.AgentId }}</div>
              </td>
              <td class="muted">{{ agent.OsVersion || 'Unknown' }}</td>
              <td class="mono">{{ agent.AgentVersion || '—' }}</td>
              <td><span class="ot-chip" :class="collectionTone(agent.CollectionStatus)">{{ collectionLabel(agent.CollectionStatus) }}</span></td>
              <td :title="absolute(agent.LastSeen)">{{ relative(agent.LastSeen) }}</td>
              <td><span v-for="tag in tags(agent)" :key="tag" class="ot-chip tag">{{ tag }}</span><span v-if="!tags(agent).length" class="muted">—</span></td>
              <td class="right actions">
                <NuxtLink :to="`/klivelink/${agent.AgentId}/overview`" class="ot-btn ghost sm">Open</NuxtLink>
                <button class="ot-btn ghost sm" :disabled="!agent.IsConnected" @click="collect(agent)">Collect</button>
                <button class="ot-btn ghost sm danger" @click="remove(agent)">Remove</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <CommandPalette :agents="agents" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from '#imports';
import { BuildKliveWsUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import StatusChip from '~/components/KliveLink/StatusChip.vue';
import CommandPalette from '~/components/KliveLink/CommandPalette.vue';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'KliveLink · Fleet command' });

const router = useRouter();
const agents = ref<any[]>([]);
const loading = ref(false);
const error = ref('');
const query = ref('');
const filter = ref('all');
const eventState = ref<'live' | 'polling'>('polling');
let poll: ReturnType<typeof setInterval> | null = null;
let socket: WebSocket | null = null;

const filters = computed(() => [
  { key: 'all', label: 'All', count: agents.value.length },
  { key: 'online', label: 'Online', count: agents.value.filter(a => a.IsConnected && !a.Stale).length },
  { key: 'stale', label: 'Stale', count: agents.value.filter(a => a.Stale).length },
  { key: 'offline', label: 'Offline', count: agents.value.filter(a => !a.IsConnected).length },
]);

const counts = computed(() => ({
  online: agents.value.filter(a => a.IsConnected && !a.Stale).length,
  stale: agents.value.filter(a => a.Stale).length,
  offline: agents.value.filter(a => !a.IsConnected).length,
  collected: agents.value.filter(a => String(a.CollectionStatus || 'none') !== 'none').length,
  attention: agents.value.filter(a => a.Stale || !a.IsConnected || String(a.CollectionStatus || 'none') === 'none').length,
}));

const versionCount = computed(() => new Set(agents.value.map(a => a.AgentVersion || 'unknown')).size);

const visible = computed(() => {
  const q = query.value.trim().toLowerCase();
  return agents.value.filter(agent => {
    if (filter.value === 'online' && (!agent.IsConnected || agent.Stale)) return false;
    if (filter.value === 'stale' && !agent.Stale) return false;
    if (filter.value === 'offline' && agent.IsConnected) return false;
    if (!q) return true;
    return [agent.MachineName, agent.AgentId, agent.OsVersion, agent.AgentVersion, agent.GroupName, ...tags(agent)]
      .filter(Boolean).some(value => String(value).toLowerCase().includes(q));
  });
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await RequestGETFromKliveAPI('/klivelink/v2/agents');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    agents.value = await res.json();
    eventState.value = socket?.readyState === WebSocket.OPEN ? 'live' : 'polling';
  } catch (e: any) {
    error.value = e?.message ?? 'Could not load the fleet.';
  } finally {
    loading.value = false;
  }
}

function open(agent: any) { router.push(`/klivelink/${agent.AgentId}/overview`); }

async function collect(agent: any) {
  try {
    const res = await RequestPOSTFromKliveAPI('/klivelink/v2/collection/start', JSON.stringify({
      agentId: agent.AgentId, tier: 'T0', profile: 't0-fast',
    }), true, true);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await load();
  } catch (e: any) {
    error.value = e?.message ?? 'Collection command failed.';
  }
}

async function remove(agent: any) {
  const typed = window.prompt(`Type the agent id to remove ${agent.MachineName || agent.AgentId} from Omnipotent:\n${agent.AgentId}`);
  if (typed !== agent.AgentId) return;
  try {
    const res = await RequestPOSTFromKliveAPI('/klivelink/v2/agents/purge', JSON.stringify({
      agentId: agent.AgentId, keepAudit: false, deleteRemote: false, deleteCollection: true,
    }), true, true);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await load();
  } catch (e: any) {
    error.value = e?.message ?? 'Purge failed.';
  }
}

function tags(agent: any): string[] {
  try {
    const value = JSON.parse(agent.TagsJson || '[]');
    return Array.isArray(value) ? value.map(String) : [];
  } catch { return []; }
}
function collectionLabel(value: string) {
  const v = String(value || 'none').toLowerCase();
  if (v === 'none') return 'None';
  return v.toUpperCase();
}
function collectionTone(value: string) {
  const v = String(value || 'none').toLowerCase();
  if (v === 't0') return 'ok';
  if (v === 't1') return 'warn';
  if (v === 't2') return 'info';
  return '';
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
function absolute(value: string) { return value ? new Date(value).toLocaleString() : ''; }

function connectEvents() {
  try {
    socket = new WebSocket(BuildKliveWsUrl('/klivelink/v2/events'));
    socket.onopen = () => { eventState.value = 'live'; };
    socket.onmessage = () => { load(); };
    socket.onclose = () => {
      eventState.value = 'polling';
      setTimeout(() => { if (document.visibilityState === 'visible') connectEvents(); }, 5000);
    };
    socket.onerror = () => { try { socket?.close(); } catch {} };
  } catch { eventState.value = 'polling'; }
}

onMounted(() => {
  load();
  connectEvents();
  poll = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 15000);
});
onBeforeUnmount(() => {
  if (poll) clearInterval(poll);
  try { socket?.close(); } catch {}
});
</script>

<style scoped>
.kl-fleet { padding: var(--ot-space-4) var(--ot-space-6) 64px; }
.ot-pagehead h1 { display: flex; align-items: baseline; gap: 10px; }
.ot-pagehead h1 .code { font-family: var(--ot-mono); font-size: 13px; color: var(--ot-accent); letter-spacing: 1px; }
.ot-filterbar .muted { color: var(--ot-muted); font-size: 11px; margin-left: 4px; }
.kl-table td { vertical-align: middle; }
.agent-name { color: var(--ot-text); font-weight: 600; font-size: 13px; }
.agent-name:hover { color: var(--ot-accent); }
.agent-id { font-size: 10.5px; color: var(--ot-muted); margin-top: 2px; }
.actions { display: flex; gap: 6px; justify-content: flex-end; }
.actions .danger { color: var(--ot-negative); }
.tag { margin: 1px 3px 1px 0; font-size: 10px; }
.kl-empty { padding: 48px; text-align: center; }
.kl-empty .glyph { font-size: 40px; color: var(--ot-accent); opacity: .7; }
.kl-empty h2 { margin: 8px 0 4px; font-size: 18px; }
.kl-empty p { margin: 0; color: var(--ot-text-2); font-size: 13px; }
.pulse { width: 6px; height: 6px; border-radius: 999px; background: currentColor; margin-right: 6px; display: inline-block; box-shadow: 0 0 8px currentColor; }
@media (max-width: 900px) {
  .kl-fleet { padding: var(--ot-space-3) var(--ot-space-4) 48px; }
  .ot-filterbar { flex-wrap: wrap; }
  .ot-filterbar .ot-input { flex: 1 1 100%; }
  .kl-table { min-width: 900px; }
}
</style>
