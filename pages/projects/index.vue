<template>
  <ProjectsShell :status="shellStatus" :status-tone="shellTone" :working="working > 0" :commands="paletteCommands">
    <!-- ── verdict: the one sentence to read first ── -->
    <section class="pjx-card pjx-verdict" :data-tone="verdict.tone" aria-label="Fleet status" data-testid="fleet-verdict">
      <span class="pjx-verdict__glyph"><ProjectsIcon :name="verdict.icon" /></span>
      <div class="pjx-verdict__text">
        <h1 class="pjx-verdict__headline">{{ verdict.headline }}</h1>
        <p class="pjx-verdict__sub">{{ verdict.sub }}</p>
      </div>
      <div class="pjx-verdict__actions">
        <template v-if="cacheHalt?.engaged && can.fleet">
          <button class="pjx-btn pjx-btn--go" :disabled="busy" @click="clearCacheHalt(true)"><ProjectsIcon name="play" />Clear halt &amp; resume</button>
          <button class="pjx-btn" :disabled="busy" title="Open the latch but leave every project halted, so nothing restarts while you check the cause" @click="clearCacheHalt(false)">Clear latch only</button>
        </template>
        <template v-else-if="can.fleet && live.length">
          <button v-if="haltedCount" class="pjx-btn pjx-btn--go" :disabled="busy" data-testid="fleet-unhalt" @click="confirm = 'unhalt'"><ProjectsIcon name="play" />Unhalt all <span class="pjx-num">{{ haltedCount }}</span></button>
          <button v-if="haltable" class="pjx-btn pjx-btn--stop" :disabled="busy" data-testid="fleet-halt" @click="confirm = 'halt'"><ProjectsIcon name="pause" />Halt all</button>
        </template>
        <button v-if="can.message && live.length" class="pjx-btn" :disabled="busy" @click="openBroadcast"><ProjectsIcon name="broadcast" />Broadcast</button>
        <button v-if="can.fleet" class="pjx-iconbtn" title="Defaults every new project inherits" aria-label="Project defaults" @click="defaultsOpen = true"><ProjectsIcon name="settings" /></button>
      </div>
    </section>

    <div v-if="loading" class="pjx-banner" role="status"><ProjectsIcon name="refresh" class="pjx-spin" /><div class="pjx-banner__body"><b>{{ loadingMessage }}</b>The board opens as soon as this step finishes.</div></div>
    <div v-else-if="error" class="pjx-banner" data-tone="need" role="status">
      <ProjectsIcon name="alert" />
      <div class="pjx-banner__body"><b>{{ data ? 'Showing the last good snapshot' : 'Operations are unavailable' }}</b>{{ error }}<template v-if="data"> · from {{ new Date(data.liveAt).toLocaleTimeString() }}</template></div>
      <div class="pjx-banner__actions"><button class="pjx-btn pjx-btn--sm" @click="refresh">Retry</button></div>
    </div>
    <div v-if="data?.degraded && data.warnings?.length" class="pjx-banner" data-tone="need" role="status"><ProjectsIcon name="alert" /><div class="pjx-banner__body"><b>Some project data is partial</b>{{ data.warnings.join(' · ') }}</div></div>
    <div v-if="data?.historicalLoading" class="pjx-banner" role="status"><ProjectsIcon name="refresh" class="pjx-spin" /><div class="pjx-banner__body"><b>{{ data.historicalLoadingMessage || 'Building historical activity' }}…</b>Live state is ready; charts, spend and outcomes fill in by themselves.</div></div>

    <template v-if="data">
      <!-- ── figures ── -->
      <div class="pjx-board__tools" style="border: 0; padding: 0">
        <span class="pjx-dim" style="font-size: 12px"><ProjectsIcon name="clock" /> {{ data.range.label }} · live {{ ageShort(data.liveAt, now) === 'now' ? 'just now' : `${ageShort(data.liveAt, now)} ago` }}<template v-if="!connected"> · polling</template></span>
        <span class="pjx-grow"></span>
        <div class="pjx-seg" role="group" aria-label="Time range">
          <button v-for="r in RANGES" :key="r" class="pjx-seg__opt" :aria-pressed="range === r" @click="range = r">{{ r.toUpperCase() }}</button>
        </div>
        <button class="pjx-iconbtn" title="Refresh now (R)" aria-label="Refresh now" @click="refresh"><ProjectsIcon name="refresh" :class="{ 'pjx-spin': refreshing }" /></button>
      </div>

      <section class="pjx-kpis" aria-label="Fleet summary">
        <div class="pjx-card pjx-kpi" :data-tone="working ? 'work' : undefined">
          <span class="pjx-kpi__label"><ProjectsIcon name="zap" />Working now</span>
          <span class="pjx-kpi__value">{{ working }}<small>of {{ live.length }}</small></span>
          <span class="pjx-kpi__sub"><b>{{ agentsBusy }}</b> {{ agentsBusy === 1 ? 'agent' : 'agents' }} mid-turn<template v-if="haltedCount"> · {{ haltedCount }} halted</template></span>
          <div class="pjx-kpi__spark"><ProjectsSpark :values="fleetSeries.wakes" bars tone="work" :label="`Wakes per ${data.range.bucket}`" /></div>
        </div>
        <div class="pjx-card pjx-kpi">
          <span class="pjx-kpi__label"><ProjectsIcon name="check-circle" />Steps delivered</span>
          <span class="pjx-kpi__value">{{ data.historicalLoading ? '…' : fmtInt(data.completedSteps) }}<small>{{ rangeKey }}</small></span>
          <span class="pjx-kpi__sub">closed with evidence</span>
          <div class="pjx-kpi__spark"><ProjectsSpark :values="fleetSeries.steps" bars tone="accent" :label="`Steps per ${data.range.bucket}`" /></div>
        </div>
        <div class="pjx-card pjx-kpi" :data-tone="productiveTone">
          <span class="pjx-kpi__label"><ProjectsIcon name="gauge" />Productive wakes</span>
          <span class="pjx-kpi__value">{{ data.historicalLoading || data.execution.productiveRate == null ? '—' : `${data.execution.productiveRate.toFixed(0)}%` }}<small>{{ rangeKey }}</small></span>
          <span class="pjx-kpi__sub"><b>{{ fmtInt(data.execution.observedWakes) }}</b> measured · {{ Math.round(data.execution.coveragePct) }}% coverage</span>
          <div class="pjx-kpi__spark"><ProjectsOutcomes :series="data.series" :max-bins="32" label="Fleet wake outcomes" /></div>
        </div>
        <div class="pjx-card pjx-kpi">
          <span class="pjx-kpi__label"><ProjectsIcon name="coins" />Spend</span>
          <span class="pjx-kpi__value">{{ data.historicalLoading ? '…' : pjUsd(data.modelSpendUsd + data.externalSpendUsd) }}<small>{{ rangeKey }}</small></span>
          <span class="pjx-kpi__sub">model <b>{{ pjUsd(data.modelSpendUsd) }}</b> · external <b>{{ pjUsd(data.externalSpendUsd) }}</b></span>
          <div class="pjx-kpi__spark"><ProjectsSpark :values="fleetSeries.spend" tone="info" :label="`Spend per ${data.range.bucket}`" /></div>
        </div>
        <button class="pjx-card pjx-kpi" :data-tone="needs.length ? 'need' : undefined" data-testid="kpi-needs" @click="scrollToNeeds">
          <span class="pjx-kpi__label"><ProjectsIcon name="inbox" />Needs you</span>
          <span class="pjx-kpi__value">{{ data.attention.length }}</span>
          <span class="pjx-kpi__sub">{{ oldestNeed ? `oldest waiting ${ageWords(oldestNeed, now)}` : data.attention.length ? 'approvals, blocks, budgets' : 'nothing waiting on you' }}</span>
        </button>
      </section>

      <!-- ── needs you ── -->
      <section v-if="needs.length" id="pjx-needs" class="pjx-card" aria-label="Needs you">
        <header class="pjx-card__head">
          <h2 class="pjx-card__title"><ProjectsIcon name="inbox" />Needs you</h2>
          <span class="pjx-card__meta">{{ needs.length }} {{ needs.length === 1 ? 'item' : 'items' }} · decide here or open the project</span>
        </header>
        <div class="pjx-needs">
          <ProjectsNeedCard v-for="n in needs" :key="n.key" :need="n" :now="now" :busy="busy" :can-resolve="can.gates" :can-control="can.manage" @resolve="resolveGate" @resume="id => act('resume', id)" />
        </div>
      </section>

      <!-- ── the board ── -->
      <section class="pjx-card" aria-label="Projects">
        <header class="pjx-card__head">
          <h2 class="pjx-card__title"><ProjectsIcon name="layers" />Projects</h2>
          <span class="pjx-card__meta pjx-num">{{ shown.length }} shown</span>
          <div class="pjx-card__tools">
            <div class="pjx-seg" role="group" aria-label="Show">
              <button v-for="f in PJ_FILTERS" :key="f.id" class="pjx-seg__opt" :aria-pressed="filter === f.id" :data-tone="f.tone" @click="filter = f.id">{{ f.label }} <span class="pjx-seg__count">{{ counts[f.id] }}</span></button>
            </div>
            <label class="pjx-find"><ProjectsIcon name="search" /><input ref="searchInput" v-model="search" type="search" placeholder="Find a project…" aria-label="Find a project" /><span class="pjx-kbd">/</span></label>
            <select v-model="sort" class="pjx-select" aria-label="Sort projects">
              <option value="attention">What needs me first</option>
              <option value="activity">Most recent activity</option>
              <option value="spend">Highest spend</option>
              <option value="name">Name</option>
            </select>
          </div>
        </header>

        <div class="pjx-fleet">
          <div v-if="shown.length" class="pjx-fleet__head" aria-hidden="true">
            <span>Project</span><span>Working on</span><span>Main result</span><span>Wakes · {{ rangeKey }}</span><span class="r">Spend · {{ rangeKey }}</span><span></span>
          </div>
          <ul v-if="shown.length" class="pjx-fleet" aria-label="Project list" data-testid="project-board">
            <ProjectsFleetRow
              v-for="p in shown"
              :key="p.projectID"
              :p="p"
              :now="now"
              :active="activeID === p.projectID"
              :busy="busy"
              :can-manage="can.manage"
              @peek="peek"
              @go="go"
              @pause="id => act('pause', id)"
              @resume="id => act('resume', id)"
              @unshelve="id => act('unarchive', id)"
            />
          </ul>
          <div v-else class="pjx-empty">
            <ProjectsIcon :name="search ? 'search' : 'rocket'" />
            <b>{{ search ? 'No project matches' : filter === 'shelved' ? 'Nothing on the shelf' : filter === 'all' ? 'No projects yet' : 'Nothing here right now' }}</b>
            <span v-if="!search && filter === 'all'">Projects are autonomous task forces: a Commander plus agents with their own computers.</span>
            <NuxtLink v-if="!search && filter === 'all'" to="/projects/new" class="pjx-btn pjx-btn--primary pjx-btn--sm"><ProjectsIcon name="plus" />New project</NuxtLink>
          </div>
        </div>

        <footer class="pjx-card__foot">
          <span class="pjx-legend">
            <span data-tone="work"><i></i>completed</span><span data-tone="fault"><i></i>failed</span><span data-tone="need"><i></i>deferred</span><span data-tone="plan"><i></i>cancelled</span>
          </span>
          <span class="pjx-grow" style="flex: 1"></span>
          <span><span class="pjx-kbd">↑</span><span class="pjx-kbd">↓</span> move · <span class="pjx-kbd">Space</span> peek · <span class="pjx-kbd">Enter</span> open · <span class="pjx-kbd">/</span> find</span>
        </footer>
      </section>
    </template>

    <ProjectsProjectSheet
      :p="sheetProject"
      :now="now"
      :range-label="data?.range.label.toLowerCase() ?? 'this window'"
      :busy="busy"
      :can-manage="can.manage"
      :can-pin="can.plan"
      @close="sheetID = ''"
      @pause="id => act('pause', id)"
      @resume="id => act('resume', id)"
      @pin="savePin"
    />

    <ProjectsDialog :open="confirm === 'halt'" title="Halt every project?" :subtitle="`Stops ${haltable} ${haltable === 1 ? 'project' : 'projects'} and their in-flight wakes. Each one remembers where it was; Unhalt all puts it back.`" @close="confirm = ''">
      <template #foot>
        <button class="pjx-btn pjx-btn--ghost" @click="confirm = ''">Cancel</button>
        <button class="pjx-btn pjx-btn--stop" :disabled="busy" @click="fleet('halt')"><ProjectsIcon name="pause" />Halt all</button>
      </template>
    </ProjectsDialog>
    <ProjectsDialog :open="confirm === 'unhalt'" title="Unhalt every project?" :subtitle="`Restores ${haltedCount} ${haltedCount === 1 ? 'project' : 'projects'} to the status each held before the halt. Active ones wake within the warm-up ramp and start spending again.`" @close="confirm = ''">
      <template #foot>
        <button class="pjx-btn pjx-btn--ghost" @click="confirm = ''">Cancel</button>
        <button class="pjx-btn pjx-btn--go" :disabled="busy" @click="fleet('unhalt')"><ProjectsIcon name="play" />Unhalt all</button>
      </template>
    </ProjectsDialog>
    <ProjectsDialog :open="broadcastOpen" title="Broadcast to every project" subtitle="Sent to each live project's Commander as a task. Shelved and completed projects are skipped; paused ones read it when they next wake." @close="broadcastOpen = false">
      <div class="pjx-field">
        <label for="pjx-broadcast">Message</label>
        <textarea id="pjx-broadcast" v-model="broadcastText" class="pjx-textarea" rows="5" :disabled="busy" @keydown.ctrl.enter="sendBroadcast"></textarea>
      </div>
      <template #foot>
        <span class="pjx-dim" style="margin-right: auto; font-size: 11.5px; align-self: center"><span class="pjx-kbd">Ctrl</span> <span class="pjx-kbd">Enter</span> sends</span>
        <button class="pjx-btn pjx-btn--ghost" @click="broadcastOpen = false">Cancel</button>
        <button class="pjx-btn pjx-btn--primary" :disabled="busy || !broadcastText.trim()" @click="sendBroadcast"><ProjectsIcon name="broadcast" />Send to all</button>
      </template>
    </ProjectsDialog>

    <Teleport to="body">
      <template v-if="defaultsOpen">
        <div class="pjx-layer pjx-scrim" @click="defaultsOpen = false"></div>
        <aside class="pjx-layer pjx-sheet" data-wide role="dialog" aria-modal="true" aria-label="Project defaults" @keydown.esc="defaultsOpen = false">
          <header class="pjx-sheet__head">
            <div class="pjx-sheet__titles"><div class="pjx-sheet__title">Project defaults</div><div class="pjx-sheet__sub">What every new project inherits; existing projects keep their own settings.</div></div>
            <button class="pjx-iconbtn" aria-label="Close" @click="defaultsOpen = false"><ProjectsIcon name="x" /></button>
          </header>
          <div class="pjx-sheet__body"><ProjectsSettingsPanel system /></div>
        </aside>
      </template>
    </Teleport>
  </ProjectsShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useProjectsOverview } from '~/composables/useProjectsOverview';
import { useAccess } from '~/composables/useAccess';
import { pjxGet, pjxPost, usePjxPoll, usePjxToasts } from '~/composables/useProjectsConsole';
import { fmtInt } from '~/scripts/adminConsole';
import {
  PJ_FILTERS, ageShort, ageWords, filterCounts, fleetVerdict, matchesFilter, matchesSearch, pjUsd, sortProjects,
  type PjCacheHalt, type PjCommand, type PjFilter, type PjNeed, type PjNeedGate, type PjSort,
} from '~/scripts/projectsConsole';
import ProjectsShell from '~/components/Projects/Shell.vue';
import ProjectsSettingsPanel from '~/components/Projects/SettingsPanel.vue';
import ProjectsIcon from '~/components/Projects/Icon.vue';
import ProjectsSpark from '~/components/Projects/Spark.vue';
import ProjectsOutcomes from '~/components/Projects/Outcomes.vue';
import ProjectsNeedCard from '~/components/Projects/NeedCard.vue';
import ProjectsFleetRow from '~/components/Projects/FleetRow.vue';
import ProjectsProjectSheet from '~/components/Projects/ProjectSheet.vue';
import ProjectsDialog from '~/components/Projects/Dialog.vue';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Projects · Operations' });

const RANGES = ['1h', '24h', '7d'] as const;
const router = useRouter();
const access = useAccess();
const { toast } = usePjxToasts();
const can = computed(() => ({
  manage: access.can('projects.lifecycle.manage'),
  fleet: access.can('projects.fleet.control'),
  message: access.can('projects.agents.message'),
  gates: access.can('projects.gates.resolve'),
  plan: access.can('projects.plan.edit'),
  details: access.can('projects.details.read'),
}));

const { range, data, loading, loadingMessage, refreshing, error, now, connected, refresh } = useProjectsOverview();
const rangeKey = computed(() => (data.value?.range.key ?? range.value).toUpperCase());
const live = computed(() => data.value?.projects.filter(p => p.status !== 'Archived') ?? []);
const working = computed(() => live.value.filter(p => (p.workingAgents ?? 0) > 0).length);
const agentsBusy = computed(() => live.value.reduce((n, p) => n + (p.workingAgents ?? 0), 0));
const haltedCount = computed(() => live.value.filter(p => p.halted).length);
/** Projects a halt-all would actually stop (the server skips halted, completed and shelved ones). */
const haltable = computed(() => live.value.filter(p => !p.halted && p.status !== 'Completed').length);
const productiveTone = computed(() => {
  const r = data.value?.execution.productiveRate;
  return r == null ? undefined : r >= 70 ? 'work' : r >= 40 ? 'need' : 'fault';
});
const fleetSeries = computed(() => {
  const s = data.value?.series ?? [];
  return {
    wakes: s.map(p => (p.completed ?? 0) + (p.failed ?? 0) + (p.deferred ?? 0) + (p.cancelled ?? 0)),
    steps: s.map(p => p.completedSteps ?? 0),
    spend: s.map(p => (p.spendUsd ?? 0) + (p.moneySpendUsd ?? 0)),
  };
});

// ── cache halt (a separate latch from the manual fleet halt) ──
const cacheHalt = ref<PjCacheHalt | null>(null);
async function loadCacheHealth() {
  const r = await pjxGet<{ halt: PjCacheHalt }>('/projects/cache-health');
  if (r.ok) cacheHalt.value = r.body?.halt ?? null;
}
usePjxPoll(loadCacheHealth, 60_000);

// ── approvals: fetched only for projects that have some, so they can be decided right here ──
const gates = ref<Record<string, PjNeedGate[]>>({});
const gateKey = computed(() => (data.value?.attention ?? []).filter(a => a.kind === 'approval').map(a => a.projectID).sort().join(','));
async function loadGates() {
  if (!can.value.details) return;
  const ids = gateKey.value ? gateKey.value.split(',') : [];
  const next: Record<string, PjNeedGate[]> = {};
  await Promise.all(ids.map(async id => {
    const r = await pjxGet<PjNeedGate[]>(`/projects/gates?projectID=${encodeURIComponent(id)}`);
    if (r.ok && Array.isArray(r.body)) next[id] = [...r.body].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }));
  gates.value = next;
}
watch(gateKey, loadGates);

const needs = computed<PjNeed[]>(() => {
  const out: PjNeed[] = [];
  for (const a of data.value?.attention ?? []) {
    const project = data.value?.projects.find(p => p.projectID === a.projectID);
    if (a.kind === 'approval') {
      const pending = gates.value[a.projectID] ?? [];
      if (pending.length) {
        out.push({ key: `${a.projectID}:${pending[0].gateID}`, kind: 'approval', projectID: a.projectID, projectName: a.name, label: a.label, since: pending[0].createdAt, gate: pending[0], more: pending.length - 1 });
        continue;
      }
    }
    out.push({ key: `${a.projectID}:${a.kind}`, kind: a.kind, projectID: a.projectID, projectName: a.name, label: a.label, since: a.kind === 'approval' ? null : project?.currentWorkAt ?? null });
  }
  return out.sort((x, y) => (x.since ? Date.parse(x.since) : Infinity) - (y.since ? Date.parse(y.since) : Infinity));
});
const oldestNeed = computed(() => needs.value.find(n => n.since)?.since ?? null);
const verdict = computed(() => fleetVerdict(data.value, cacheHalt.value, oldestNeed.value, now.value));

const shellStatus = computed(() => !data.value ? '' : `${working.value} working · ${live.value.length} live${data.value.attention.length ? ` · ${data.value.attention.length} need you` : ''}`);
const shellTone = computed(() => cacheHalt.value?.engaged ? 'bad' : (data.value?.attention.length ?? 0) > 0 ? 'warn' : 'ok');

// ── board ──
const filter = ref<PjFilter>('all');
const search = ref('');
const sort = ref<PjSort>('attention');
const searchInput = ref<HTMLInputElement | null>(null);
const counts = computed(() => filterCounts(data.value?.projects ?? []));
// The order is fixed when the sort or filter changes, not on every live refresh, so rows never jump under the cursor.
const order = ref<string[]>([]);
function resetOrder() { order.value = sortProjects(data.value?.projects ?? [], sort.value).map(p => p.projectID); }
watch([sort, filter], resetOrder);
watch(data, value => {
  if (!value) return;
  if (!order.value.length) { resetOrder(); return; }
  const ids = new Set(value.projects.map(p => p.projectID));
  const kept = order.value.filter(id => ids.has(id));
  for (const p of sortProjects(value.projects, sort.value)) if (!kept.includes(p.projectID)) kept.push(p.projectID);
  order.value = kept;
});
const shown = computed(() => {
  const pos = new Map(order.value.map((id, i) => [id, i]));
  return (data.value?.projects ?? [])
    .filter(p => matchesFilter(p, filter.value) && matchesSearch(p, search.value))
    .sort((a, b) => (pos.get(a.projectID) ?? 1e9) - (pos.get(b.projectID) ?? 1e9));
});

const activeID = ref('');
const sheetID = ref('');
const sheetProject = computed(() => data.value?.projects.find(p => p.projectID === sheetID.value) ?? null);
function peek(id: string) { activeID.value = id; sheetID.value = id; }
function go(id: string) { router.push(`/projects/${id}`); }
function scrollToNeeds() { document.getElementById('pjx-needs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

// ── actions ──
const busy = ref(false);
const confirm = ref<'' | 'halt' | 'unhalt'>('');
const broadcastOpen = ref(false);
const broadcastText = ref('');
const defaultsOpen = ref(false);

function nameOf(id: string) { return data.value?.projects.find(p => p.projectID === id)?.name || 'the project'; }

async function act(kind: 'pause' | 'resume' | 'unarchive', projectID: string) {
  if (busy.value) return;
  busy.value = true;
  const verb = kind === 'pause' ? 'Paused' : kind === 'resume' ? 'Resumed' : 'Unshelved';
  const r = await pjxPost(`/projects/${kind}`, { projectID });
  busy.value = false;
  if (!r.ok) { toast(r.error, 'fault', 6000); return; }
  toast(r.pending ? `${verb.replace(/ed$/, 'ing')} ${nameOf(projectID)}: still settling, the board updates when it lands.` : `${verb} ${nameOf(projectID)}.`, r.pending ? 'need' : 'work');
  await refresh();
}

async function fleet(kind: 'halt' | 'unhalt') {
  confirm.value = '';
  if (busy.value) return;
  busy.value = true;
  const r = await pjxPost(kind === 'halt' ? '/projects/halt-all' : '/projects/unhalt-all');
  busy.value = false;
  if (!r.ok) { toast(r.error, 'fault', 6000); return; }
  const n = kind === 'halt' ? r.body?.halted : r.body?.restored;
  if (r.pending) toast(`${kind === 'halt' ? 'Halting' : 'Unhalting'} the fleet: ${n ?? 0} done so far, the rest finish by themselves${r.body?.step ? ` (now: ${r.body.step})` : ''}.`, 'need', 8000);
  else toast(kind === 'halt' ? `Halted ${n ?? 0} ${n === 1 ? 'project' : 'projects'}.` : `Restored ${n ?? 0} ${n === 1 ? 'project' : 'projects'}.${r.body?.warning ? ` ${r.body.warning}` : ''}`, 'work', 6000);
  await refresh();
}

async function clearCacheHalt(unhalt: boolean) {
  if (busy.value) return;
  busy.value = true;
  const r = await pjxPost('/projects/cache-health/clear', { unhalt });
  busy.value = false;
  if (!r.ok) { toast(r.error, 'fault', 6000); return; }
  cacheHalt.value = r.body?.halt ?? cacheHalt.value;
  toast(r.pending ? 'Clearing the prompt-cache halt: still settling.' : unhalt ? `Halt cleared; ${r.body?.restored ?? 0} project(s) restored.` : 'Latch cleared. Projects stay halted until you unhalt them.', r.pending ? 'need' : 'work', 6000);
  await Promise.all([refresh(), loadCacheHealth()]);
}

function openBroadcast() { broadcastText.value = ''; broadcastOpen.value = true; }
async function sendBroadcast() {
  const text = broadcastText.value.trim();
  if (busy.value || !text) return;
  busy.value = true;
  const r = await pjxPost('/projects/broadcast', { text });
  busy.value = false;
  if (!r.ok) { toast(r.error, 'fault', 6000); return; }
  broadcastOpen.value = false;
  const b = r.body ?? {};
  toast(`Broadcast accepted by ${b.accepted ?? 0}: ${b.delivered ?? 0} delivered now, ${b.deferred ?? 0} on next wake${b.rejected ? `, ${b.rejected} refused` : ''}.`, b.rejected ? 'need' : 'work', 7000);
}

async function resolveGate(projectID: string, gateID: string, decision: string, comment: string) {
  if (busy.value) return;
  busy.value = true;
  const r = await pjxPost('/projects/gates/resolve', { projectID, gateID, decision, comment });
  busy.value = false;
  if (!r.ok) { toast(r.error, 'fault', 6000); return; }
  toast(decision === 'Discuss' ? `Opened a discussion with ${nameOf(projectID)}'s Commander.` : `${decision === 'Approve' ? 'Approved' : 'Denied'} for ${nameOf(projectID)}.`, decision === 'Deny' ? 'need' : 'work');
  await Promise.all([refresh(), loadGates()]);
}

async function savePin(projectID: string, observableID: string | null, direction: string) {
  if (busy.value) return;
  busy.value = true;
  const r = await pjxPost('/projects/result-pin', { projectID, observableID, direction });
  busy.value = false;
  if (!r.ok) { toast(r.error, 'fault', 6000); return; }
  toast(observableID ? 'Main result pinned.' : 'The Commander picks the main result again.', 'work');
  await refresh();
}

// ── palette + keyboard ──
const paletteCommands = computed<PjCommand[]>(() => {
  const list: PjCommand[] = [];
  if (can.value.fleet && live.value.length) {
    if (haltedCount.value) list.push({ id: 'unhalt-all', title: `Unhalt all (${haltedCount.value})`, group: 'Actions', icon: 'play', keywords: 'resume fleet restart', run: () => { confirm.value = 'unhalt'; } });
    if (haltable.value) list.push({ id: 'halt-all', title: 'Halt all projects', group: 'Actions', icon: 'pause', keywords: 'stop fleet pause', run: () => { confirm.value = 'halt'; } });
  }
  if (can.value.message && live.value.length) list.push({ id: 'broadcast', title: 'Broadcast to every project', group: 'Actions', icon: 'broadcast', keywords: 'message all tell', run: openBroadcast });
  if (needs.value.length) list.push({ id: 'needs', title: `Review what needs you (${needs.value.length})`, group: 'Actions', icon: 'inbox', keywords: 'approvals blocked attention', run: scrollToNeeds });
  if (can.value.fleet) list.push({ id: 'defaults', title: 'Project defaults', group: 'Actions', icon: 'settings', keywords: 'system settings models', run: () => { defaultsOpen.value = true; } });
  return list;
});

function onKey(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  const typing = !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
  if (e.key === 'Escape' && sheetID.value) { sheetID.value = ''; return; }
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.querySelector('.pjx-layer.pjx-dialog, .pjx-layer.pjx-palette, .pjx-layer.pjx-sheet')) return;
  if (e.key === '/') { e.preventDefault(); searchInput.value?.focus(); return; }
  if (e.key === 'r' || e.key === 'R') { refresh(); return; }
  const ids = shown.value.map(p => p.projectID);
  if (!ids.length) return;
  if (e.key === 'ArrowDown' || e.key === 'j' || e.key === 'ArrowUp' || e.key === 'k') {
    e.preventDefault();
    const at = ids.indexOf(activeID.value);
    const next = e.key === 'ArrowDown' || e.key === 'j' ? Math.min(ids.length - 1, at + 1) : Math.max(0, at < 0 ? 0 : at - 1);
    activeID.value = ids[next];
    document.querySelector<HTMLElement>(`.pjx-row[data-project-id="${ids[next]}"]`)?.focus();
  }
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>
