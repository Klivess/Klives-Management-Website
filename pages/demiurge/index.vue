<template>
  <DemiurgeShell :status="shellStatus" :status-tone="shellTone" :working="working > 0" :commands="paletteCommands">
    <!-- ── verdict: the one sentence to read first ── -->
    <section class="dmx-card dmx-verdict" :data-tone="verdict.tone" aria-label="Fleet status" data-testid="fleet-verdict">
      <span class="dmx-verdict__glyph"><DemiurgeIcon :name="verdict.icon" /></span>
      <div class="dmx-verdict__text">
        <h1 class="dmx-verdict__headline">{{ verdict.headline }}</h1>
        <p class="dmx-verdict__sub">{{ verdict.sub }}</p>
      </div>
      <div class="dmx-verdict__actions">
        <template v-if="cacheHalt?.engaged && can.fleet">
          <button class="dmx-btn dmx-btn--go" :disabled="busy" @click="clearCacheHalt(true)"><DemiurgeIcon name="play" />Clear halt &amp; resume</button>
          <button class="dmx-btn" :disabled="busy" title="Open the latch but leave every Steward halted, so nothing restarts while you check the cause" @click="clearCacheHalt(false)">Clear latch only</button>
        </template>
        <template v-else-if="can.fleet && live.length">
          <button v-if="haltedCount" class="dmx-btn dmx-btn--go" :disabled="busy" data-testid="fleet-unhalt" @click="confirm = 'unhalt'"><DemiurgeIcon name="play" />Unhalt all <span class="dmx-num">{{ haltedCount }}</span></button>
          <button v-if="haltable" class="dmx-btn dmx-btn--stop" :disabled="busy" data-testid="fleet-halt" @click="confirm = 'halt'"><DemiurgeIcon name="pause" />Halt all</button>
        </template>
        <button v-if="can.message && live.length" class="dmx-btn" :disabled="busy" @click="openBroadcast"><DemiurgeIcon name="broadcast" />Broadcast</button>
        <button v-if="can.fleet" class="dmx-iconbtn" title="Defaults every new Steward inherits" aria-label="Steward defaults" @click="defaultsOpen = true"><DemiurgeIcon name="settings" /></button>
      </div>
    </section>

    <div v-if="loading" class="dmx-banner" role="status"><DemiurgeIcon name="refresh" class="dmx-spin" /><div class="dmx-banner__body"><b>{{ loadingMessage }}</b>The board opens as soon as this step finishes.</div></div>
    <div v-else-if="error" class="dmx-banner" data-tone="need" role="status">
      <DemiurgeIcon name="alert" />
      <div class="dmx-banner__body"><b>{{ data ? 'Showing the last good snapshot' : 'Operations are unavailable' }}</b>{{ error }}<template v-if="data"> · from {{ new Date(data.liveAt).toLocaleTimeString() }}</template></div>
      <div class="dmx-banner__actions"><button class="dmx-btn dmx-btn--sm" @click="refresh">Retry</button></div>
    </div>
    <div v-if="data?.degraded && data.warnings?.length" class="dmx-banner" data-tone="need" role="status"><DemiurgeIcon name="alert" /><div class="dmx-banner__body"><b>Some Steward data is partial</b>{{ data.warnings.join(' · ') }}</div></div>
    <div v-if="data?.historicalLoading" class="dmx-banner" role="status"><DemiurgeIcon name="refresh" class="dmx-spin" /><div class="dmx-banner__body"><b>{{ data.historicalLoadingMessage || 'Building historical activity' }}…</b>Live state is ready; charts, spend and outcomes fill in by themselves.</div></div>

    <template v-if="data">
      <!-- ── figures ── -->
      <div class="dmx-board__tools" style="border: 0; padding: 0">
        <span class="dmx-dim" style="font-size: 12px"><DemiurgeIcon name="clock" /> {{ data.range.label }} · live {{ ageShort(data.liveAt, now) === 'now' ? 'just now' : `${ageShort(data.liveAt, now)} ago` }}<template v-if="!connected"> · polling</template></span>
        <span class="dmx-grow"></span>
        <div class="dmx-seg" role="group" aria-label="Time range">
          <button v-for="r in RANGES" :key="r" class="dmx-seg__opt" :aria-pressed="range === r" @click="range = r">{{ r.toUpperCase() }}</button>
        </div>
        <button class="dmx-iconbtn" title="Refresh now (R)" aria-label="Refresh now" @click="refresh"><DemiurgeIcon name="refresh" :class="{ 'dmx-spin': refreshing }" /></button>
      </div>

      <section class="dmx-kpis" aria-label="Fleet summary">
        <div class="dmx-card dmx-kpi" :data-tone="working ? 'work' : undefined">
          <span class="dmx-kpi__label"><DemiurgeIcon name="zap" />Working now</span>
          <span class="dmx-kpi__value">{{ working }}<small>of {{ live.length }}</small></span>
          <span class="dmx-kpi__sub"><b>{{ agentsBusy }}</b> {{ agentsBusy === 1 ? 'agent' : 'agents' }} mid-turn<template v-if="haltedCount"> · {{ haltedCount }} halted</template></span>
          <div class="dmx-kpi__spark"><DemiurgeSpark :values="fleetSeries.wakes" bars tone="work" :label="`Wakes per ${data.range.bucket}`" /></div>
        </div>
        <div class="dmx-card dmx-kpi">
          <span class="dmx-kpi__label"><DemiurgeIcon name="check-circle" />Steps delivered</span>
          <span class="dmx-kpi__value">{{ data.historicalLoading ? '…' : fmtInt(data.completedSteps) }}<small>{{ rangeKey }}</small></span>
          <span class="dmx-kpi__sub">closed with evidence</span>
          <div class="dmx-kpi__spark"><DemiurgeSpark :values="fleetSeries.steps" bars tone="accent" :label="`Steps per ${data.range.bucket}`" /></div>
        </div>
        <div class="dmx-card dmx-kpi" :data-tone="productiveTone">
          <span class="dmx-kpi__label"><DemiurgeIcon name="gauge" />Productive wakes</span>
          <span class="dmx-kpi__value">{{ data.historicalLoading || data.execution.productiveRate == null ? '—' : `${data.execution.productiveRate.toFixed(0)}%` }}<small>{{ rangeKey }}</small></span>
          <span class="dmx-kpi__sub"><b>{{ fmtInt(data.execution.observedWakes) }}</b> measured · {{ Math.round(data.execution.coveragePct) }}% coverage</span>
          <div class="dmx-kpi__spark"><DemiurgeOutcomes :series="data.series" :max-bins="32" label="Fleet wake outcomes" /></div>
        </div>
        <div class="dmx-card dmx-kpi">
          <span class="dmx-kpi__label"><DemiurgeIcon name="coins" />Spend</span>
          <span class="dmx-kpi__value">{{ data.historicalLoading ? '…' : dmUsd(data.modelSpendUsd + data.externalSpendUsd) }}<small>{{ rangeKey }}</small></span>
          <span class="dmx-kpi__sub">model <b>{{ dmUsd(data.modelSpendUsd) }}</b> · external <b>{{ dmUsd(data.externalSpendUsd) }}</b></span>
          <div class="dmx-kpi__spark"><DemiurgeSpark :values="fleetSeries.spend" tone="info" :label="`Spend per ${data.range.bucket}`" /></div>
        </div>
        <button class="dmx-card dmx-kpi" :data-tone="needs.length ? 'need' : undefined" data-testid="kpi-needs" @click="scrollToNeeds">
          <span class="dmx-kpi__label"><DemiurgeIcon name="inbox" />Needs you</span>
          <span class="dmx-kpi__value">{{ data.attention.length }}</span>
          <span class="dmx-kpi__sub">{{ oldestNeed ? `oldest waiting ${ageWords(oldestNeed, now)}` : data.attention.length ? 'approvals, blocks, budgets' : 'nothing waiting on you' }}</span>
        </button>
      </section>

      <!-- ── needs you ── -->
      <section v-if="needs.length" id="dmx-needs" class="dmx-card" aria-label="Needs you">
        <header class="dmx-card__head">
          <h2 class="dmx-card__title"><DemiurgeIcon name="inbox" />Needs you</h2>
          <span class="dmx-card__meta">{{ needs.length }} {{ needs.length === 1 ? 'item' : 'items' }} · decide here or open the Steward</span>
        </header>
        <div class="dmx-needs">
          <DemiurgeNeedCard v-for="n in needs" :key="n.key" :need="n" :now="now" :busy="busy" :can-resolve="can.gates" :can-control="can.manage" @resolve="resolveGate" @resume="id => act('resume', id)" />
        </div>
      </section>

      <!-- ── the board ── -->
      <section class="dmx-card" aria-label="Demiurge">
        <header class="dmx-card__head">
          <h2 class="dmx-card__title"><DemiurgeIcon name="layers" />Demiurge</h2>
          <span class="dmx-card__meta dmx-num">{{ shown.length }} shown</span>
          <div class="dmx-card__tools">
            <div class="dmx-seg" role="group" aria-label="Show">
              <button v-for="f in DM_FILTERS" :key="f.id" class="dmx-seg__opt" :aria-pressed="filter === f.id" :data-tone="f.tone" @click="filter = f.id">{{ f.label }} <span class="dmx-seg__count">{{ counts[f.id] }}</span></button>
            </div>
            <label class="dmx-find"><DemiurgeIcon name="search" /><input ref="searchInput" v-model="search" type="search" placeholder="Find a Steward…" aria-label="Find a Steward" /><span class="dmx-kbd">/</span></label>
            <select v-model="sort" class="dmx-select" aria-label="Sort Stewards">
              <option value="attention">What needs me first</option>
              <option value="activity">Most recent activity</option>
              <option value="spend">Highest spend</option>
              <option value="name">Name</option>
            </select>
          </div>
        </header>

        <div class="dmx-fleet">
          <div v-if="shown.length" class="dmx-fleet__head" aria-hidden="true">
            <span>Steward</span><span>Working on</span><span>Main result</span><span>Wakes · {{ rangeKey }}</span><span class="r">Spend · {{ rangeKey }}</span><span></span>
          </div>
          <ul v-if="shown.length" class="dmx-fleet" aria-label="Steward list" data-testid="steward-board">
            <DemiurgeFleetRow
              v-for="p in shown"
              :key="p.stewardID"
              :p="p"
              :now="now"
              :active="activeID === p.stewardID"
              :busy="busy"
              :can-manage="can.manage"
              @peek="peek"
              @go="go"
              @pause="id => act('pause', id)"
              @resume="id => act('resume', id)"
              @unshelve="id => act('unarchive', id)"
            />
          </ul>
          <div v-else class="dmx-empty">
            <DemiurgeIcon :name="search ? 'search' : 'rocket'" />
            <b>{{ search ? 'No Steward matches' : filter === 'shelved' ? 'Nothing on the shelf' : filter === 'all' ? 'No Stewards yet' : 'Nothing here right now' }}</b>
            <span v-if="!search && filter === 'all'">Stewards are autonomous task forces: a Commander plus agents with their own computers.</span>
            <NuxtLink v-if="!search && filter === 'all'" to="/demiurge/new" class="dmx-btn dmx-btn--primary dmx-btn--sm"><DemiurgeIcon name="plus" />New Steward</NuxtLink>
          </div>
        </div>

        <footer class="dmx-card__foot">
          <span class="dmx-legend">
            <span data-tone="work"><i></i>completed</span><span data-tone="fault"><i></i>failed</span><span data-tone="need"><i></i>deferred</span><span data-tone="plan"><i></i>cancelled</span>
          </span>
          <span class="dmx-grow" style="flex: 1"></span>
          <span><span class="dmx-kbd">↑</span><span class="dmx-kbd">↓</span> move · <span class="dmx-kbd">Space</span> peek · <span class="dmx-kbd">Enter</span> open · <span class="dmx-kbd">/</span> find</span>
        </footer>
      </section>
    </template>

    <DemiurgeStewardSheet
      :p="sheetSteward"
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

    <DemiurgeDialog :open="confirm === 'halt'" title="Halt every Steward?" :subtitle="`Stops ${haltable} ${haltable === 1 ? 'Steward' : 'Stewards'} and their in-flight wakes. Each one remembers where it was; Unhalt all puts it back.`" @close="confirm = ''">
      <template #foot>
        <button class="dmx-btn dmx-btn--ghost" @click="confirm = ''">Cancel</button>
        <button class="dmx-btn dmx-btn--stop" :disabled="busy" @click="fleet('halt')"><DemiurgeIcon name="pause" />Halt all</button>
      </template>
    </DemiurgeDialog>
    <DemiurgeDialog :open="confirm === 'unhalt'" title="Unhalt every Steward?" :subtitle="`Restores ${haltedCount} ${haltedCount === 1 ? 'Steward' : 'Stewards'} to the status each held before the halt. Active ones wake within the warm-up ramp and start spending again.`" @close="confirm = ''">
      <template #foot>
        <button class="dmx-btn dmx-btn--ghost" @click="confirm = ''">Cancel</button>
        <button class="dmx-btn dmx-btn--go" :disabled="busy" @click="fleet('unhalt')"><DemiurgeIcon name="play" />Unhalt all</button>
      </template>
    </DemiurgeDialog>
    <DemiurgeDialog :open="broadcastOpen" title="Broadcast to every Steward" subtitle="Sent to each live Steward's Commander as a task. Shelved and completed Stewards are skipped; paused ones read it when they next wake." @close="broadcastOpen = false">
      <div class="dmx-field">
        <label for="dmx-broadcast">Message</label>
        <textarea id="dmx-broadcast" v-model="broadcastText" class="dmx-textarea" rows="5" :disabled="busy" @keydown.ctrl.enter="sendBroadcast"></textarea>
      </div>
      <template #foot>
        <span class="dmx-dim" style="margin-right: auto; font-size: 11.5px; align-self: center"><span class="dmx-kbd">Ctrl</span> <span class="dmx-kbd">Enter</span> sends</span>
        <button class="dmx-btn dmx-btn--ghost" @click="broadcastOpen = false">Cancel</button>
        <button class="dmx-btn dmx-btn--primary" :disabled="busy || !broadcastText.trim()" @click="sendBroadcast"><DemiurgeIcon name="broadcast" />Send to all</button>
      </template>
    </DemiurgeDialog>

    <Teleport to="body">
      <template v-if="defaultsOpen">
        <div class="dmx-layer dmx-scrim" @click="defaultsOpen = false"></div>
        <aside class="dmx-layer dmx-sheet" data-wide role="dialog" aria-modal="true" aria-label="Steward defaults" @keydown.esc="defaultsOpen = false">
          <header class="dmx-sheet__head">
            <div class="dmx-sheet__titles"><div class="dmx-sheet__title">Steward defaults</div><div class="dmx-sheet__sub">What every new Steward inherits; existing Stewards keep their own settings.</div></div>
            <button class="dmx-iconbtn" aria-label="Close" @click="defaultsOpen = false"><DemiurgeIcon name="x" /></button>
          </header>
          <div class="dmx-sheet__body"><DemiurgeSettingsPanel system /></div>
        </aside>
      </template>
    </Teleport>
  </DemiurgeShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useDemiurgeOverview } from '~/composables/useDemiurgeOverview';
import { useAccess } from '~/composables/useAccess';
import { dmxGet, dmxPost, useDmxPoll, useDmxToasts } from '~/composables/useDemiurgeConsole';
import { fmtInt } from '~/scripts/adminConsole';
import {
  DM_FILTERS, ageShort, ageWords, filterCounts, fleetVerdict, matchesFilter, matchesSearch, dmUsd, sortStewards,
  type DmCacheHalt, type DmCommand, type DmFilter, type DmNeed, type DmNeedGate, type DmSort,
} from '~/scripts/demiurgeConsole';
import DemiurgeShell from '~/components/Demiurge/Shell.vue';
import DemiurgeSettingsPanel from '~/components/Demiurge/SettingsPanel.vue';
import DemiurgeIcon from '~/components/Demiurge/Icon.vue';
import DemiurgeSpark from '~/components/Demiurge/Spark.vue';
import DemiurgeOutcomes from '~/components/Demiurge/Outcomes.vue';
import DemiurgeNeedCard from '~/components/Demiurge/NeedCard.vue';
import DemiurgeFleetRow from '~/components/Demiurge/FleetRow.vue';
import DemiurgeStewardSheet from '~/components/Demiurge/StewardSheet.vue';
import DemiurgeDialog from '~/components/Demiurge/Dialog.vue';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Demiurge · Operations' });

const RANGES = ['1h', '24h', '7d'] as const;
const router = useRouter();
const access = useAccess();
const { toast } = useDmxToasts();
const can = computed(() => ({
  manage: access.can('demiurge.lifecycle.manage'),
  fleet: access.can('demiurge.fleet.control'),
  message: access.can('demiurge.agents.message'),
  gates: access.can('demiurge.gates.resolve'),
  plan: access.can('demiurge.plan.edit'),
  details: access.can('demiurge.details.read'),
}));

const { range, data, loading, loadingMessage, refreshing, error, now, connected, refresh } = useDemiurgeOverview();
const rangeKey = computed(() => (data.value?.range.key ?? range.value).toUpperCase());
const live = computed(() => data.value?.stewards.filter(p => p.status !== 'Archived') ?? []);
const working = computed(() => live.value.filter(p => (p.workingAgents ?? 0) > 0).length);
const agentsBusy = computed(() => live.value.reduce((n, p) => n + (p.workingAgents ?? 0), 0));
const haltedCount = computed(() => live.value.filter(p => p.halted).length);
/** Stewards a halt-all would actually stop (the server skips halted, completed and shelved ones). */
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
const cacheHalt = ref<DmCacheHalt | null>(null);
async function loadCacheHealth() {
  const r = await dmxGet<{ halt: DmCacheHalt }>('/demiurge/cache-health');
  if (r.ok) cacheHalt.value = r.body?.halt ?? null;
}
useDmxPoll(loadCacheHealth, 60_000);

// ── approvals: fetched only for Stewards that have some, so they can be decided right here ──
const gates = ref<Record<string, DmNeedGate[]>>({});
const gateKey = computed(() => (data.value?.attention ?? []).filter(a => a.kind === 'approval').map(a => a.stewardID).sort().join(','));
async function loadGates() {
  if (!can.value.details) return;
  const ids = gateKey.value ? gateKey.value.split(',') : [];
  const next: Record<string, DmNeedGate[]> = {};
  await Promise.all(ids.map(async id => {
    const r = await dmxGet<DmNeedGate[]>(`/demiurge/gates?stewardID=${encodeURIComponent(id)}`);
    if (r.ok && Array.isArray(r.body)) next[id] = [...r.body].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }));
  gates.value = next;
}
watch(gateKey, loadGates);

const needs = computed<DmNeed[]>(() => {
  const out: DmNeed[] = [];
  for (const a of data.value?.attention ?? []) {
    const steward = data.value?.stewards.find(p => p.stewardID === a.stewardID);
    if (a.kind === 'approval') {
      const pending = gates.value[a.stewardID] ?? [];
      if (pending.length) {
        out.push({ key: `${a.stewardID}:${pending[0].gateID}`, kind: 'approval', stewardID: a.stewardID, stewardName: a.name, label: a.label, since: pending[0].createdAt, gate: pending[0], more: pending.length - 1 });
        continue;
      }
    }
    out.push({ key: `${a.stewardID}:${a.kind}`, kind: a.kind, stewardID: a.stewardID, stewardName: a.name, label: a.label, since: a.kind === 'approval' ? null : steward?.currentWorkAt ?? null });
  }
  return out.sort((x, y) => (x.since ? Date.parse(x.since) : Infinity) - (y.since ? Date.parse(y.since) : Infinity));
});
const oldestNeed = computed(() => needs.value.find(n => n.since)?.since ?? null);
const verdict = computed(() => fleetVerdict(data.value, cacheHalt.value, oldestNeed.value, now.value));

const shellStatus = computed(() => !data.value ? '' : `${working.value} working · ${live.value.length} live${data.value.attention.length ? ` · ${data.value.attention.length} need you` : ''}`);
const shellTone = computed(() => cacheHalt.value?.engaged ? 'bad' : (data.value?.attention.length ?? 0) > 0 ? 'warn' : 'ok');

// ── board ──
const filter = ref<DmFilter>('all');
const search = ref('');
const sort = ref<DmSort>('attention');
const searchInput = ref<HTMLInputElement | null>(null);
const counts = computed(() => filterCounts(data.value?.stewards ?? []));
// The order is fixed when the sort or filter changes, not on every live refresh, so rows never jump under the cursor.
const order = ref<string[]>([]);
function resetOrder() { order.value = sortStewards(data.value?.stewards ?? [], sort.value).map(p => p.stewardID); }
watch([sort, filter], resetOrder);
watch(data, value => {
  if (!value) return;
  if (!order.value.length) { resetOrder(); return; }
  const ids = new Set(value.stewards.map(p => p.stewardID));
  const kept = order.value.filter(id => ids.has(id));
  for (const p of sortStewards(value.stewards, sort.value)) if (!kept.includes(p.stewardID)) kept.push(p.stewardID);
  order.value = kept;
});
const shown = computed(() => {
  const pos = new Map(order.value.map((id, i) => [id, i]));
  return (data.value?.stewards ?? [])
    .filter(p => matchesFilter(p, filter.value) && matchesSearch(p, search.value))
    .sort((a, b) => (pos.get(a.stewardID) ?? 1e9) - (pos.get(b.stewardID) ?? 1e9));
});

const activeID = ref('');
const sheetID = ref('');
const sheetSteward = computed(() => data.value?.stewards.find(p => p.stewardID === sheetID.value) ?? null);
function peek(id: string) { activeID.value = id; sheetID.value = id; }
function go(id: string) { router.push(`/demiurge/${id}`); }
function scrollToNeeds() { document.getElementById('dmx-needs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

// ── actions ──
const busy = ref(false);
const confirm = ref<'' | 'halt' | 'unhalt'>('');
const broadcastOpen = ref(false);
const broadcastText = ref('');
const defaultsOpen = ref(false);

function nameOf(id: string) { return data.value?.stewards.find(p => p.stewardID === id)?.name || 'the Steward'; }

async function act(kind: 'pause' | 'resume' | 'unarchive', stewardID: string) {
  if (busy.value) return;
  busy.value = true;
  const verb = kind === 'pause' ? 'Paused' : kind === 'resume' ? 'Resumed' : 'Unshelved';
  const r = await dmxPost(`/demiurge/${kind}`, { stewardID });
  busy.value = false;
  if (!r.ok) { toast(r.error, 'fault', 6000); return; }
  toast(r.pending ? `${verb.replace(/ed$/, 'ing')} ${nameOf(stewardID)}: still settling, the board updates when it lands.` : `${verb} ${nameOf(stewardID)}.`, r.pending ? 'need' : 'work');
  await refresh();
}

async function fleet(kind: 'halt' | 'unhalt') {
  confirm.value = '';
  if (busy.value) return;
  busy.value = true;
  const r = await dmxPost(kind === 'halt' ? '/demiurge/halt-all' : '/demiurge/unhalt-all');
  busy.value = false;
  if (!r.ok) { toast(r.error, 'fault', 6000); return; }
  const n = kind === 'halt' ? r.body?.halted : r.body?.restored;
  if (r.pending) toast(`${kind === 'halt' ? 'Halting' : 'Unhalting'} the fleet: ${n ?? 0} done so far, the rest finish by themselves${r.body?.step ? ` (now: ${r.body.step})` : ''}.`, 'need', 8000);
  else toast(kind === 'halt' ? `Halted ${n ?? 0} ${n === 1 ? 'Steward' : 'Stewards'}.` : `Restored ${n ?? 0} ${n === 1 ? 'Steward' : 'Stewards'}.${r.body?.warning ? ` ${r.body.warning}` : ''}`, 'work', 6000);
  await refresh();
}

async function clearCacheHalt(unhalt: boolean) {
  if (busy.value) return;
  busy.value = true;
  const r = await dmxPost('/demiurge/cache-health/clear', { unhalt });
  busy.value = false;
  if (!r.ok) { toast(r.error, 'fault', 6000); return; }
  cacheHalt.value = r.body?.halt ?? cacheHalt.value;
  toast(r.pending ? 'Clearing the prompt-cache halt: still settling.' : unhalt ? `Halt cleared; ${r.body?.restored ?? 0} Steward(s) restored.` : 'Latch cleared. Stewards stay halted until you unhalt them.', r.pending ? 'need' : 'work', 6000);
  await Promise.all([refresh(), loadCacheHealth()]);
}

function openBroadcast() { broadcastText.value = ''; broadcastOpen.value = true; }
async function sendBroadcast() {
  const text = broadcastText.value.trim();
  if (busy.value || !text) return;
  busy.value = true;
  const r = await dmxPost('/demiurge/broadcast', { text });
  busy.value = false;
  if (!r.ok) { toast(r.error, 'fault', 6000); return; }
  broadcastOpen.value = false;
  const b = r.body ?? {};
  toast(`Broadcast accepted by ${b.accepted ?? 0}: ${b.delivered ?? 0} delivered now, ${b.deferred ?? 0} on next wake${b.rejected ? `, ${b.rejected} refused` : ''}.`, b.rejected ? 'need' : 'work', 7000);
}

async function resolveGate(stewardID: string, gateID: string, decision: string, comment: string) {
  if (busy.value) return;
  busy.value = true;
  const r = await dmxPost('/demiurge/gates/resolve', { stewardID, gateID, decision, comment });
  busy.value = false;
  if (!r.ok) { toast(r.error, 'fault', 6000); return; }
  toast(decision === 'Discuss' ? `Opened a discussion with ${nameOf(stewardID)}'s Commander.` : `${decision === 'Approve' ? 'Approved' : 'Denied'} for ${nameOf(stewardID)}.`, decision === 'Deny' ? 'need' : 'work');
  await Promise.all([refresh(), loadGates()]);
}

async function savePin(stewardID: string, observableID: string | null, direction: string) {
  if (busy.value) return;
  busy.value = true;
  const r = await dmxPost('/demiurge/result-pin', { stewardID, observableID, direction });
  busy.value = false;
  if (!r.ok) { toast(r.error, 'fault', 6000); return; }
  toast(observableID ? 'Main result pinned.' : 'The Commander picks the main result again.', 'work');
  await refresh();
}

// ── palette + keyboard ──
const paletteCommands = computed<DmCommand[]>(() => {
  const list: DmCommand[] = [];
  if (can.value.fleet && live.value.length) {
    if (haltedCount.value) list.push({ id: 'unhalt-all', title: `Unhalt all (${haltedCount.value})`, group: 'Actions', icon: 'play', keywords: 'resume fleet restart', run: () => { confirm.value = 'unhalt'; } });
    if (haltable.value) list.push({ id: 'halt-all', title: 'Halt all Stewards', group: 'Actions', icon: 'pause', keywords: 'stop fleet pause', run: () => { confirm.value = 'halt'; } });
  }
  if (can.value.message && live.value.length) list.push({ id: 'broadcast', title: 'Broadcast to every Steward', group: 'Actions', icon: 'broadcast', keywords: 'message all tell', run: openBroadcast });
  if (needs.value.length) list.push({ id: 'needs', title: `Review what needs you (${needs.value.length})`, group: 'Actions', icon: 'inbox', keywords: 'approvals blocked attention', run: scrollToNeeds });
  if (can.value.fleet) list.push({ id: 'defaults', title: 'Steward defaults', group: 'Actions', icon: 'settings', keywords: 'system settings models', run: () => { defaultsOpen.value = true; } });
  return list;
});

function onKey(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  const typing = !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
  if (e.key === 'Escape' && sheetID.value) { sheetID.value = ''; return; }
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.querySelector('.dmx-layer.dmx-dialog, .dmx-layer.dmx-palette, .dmx-layer.dmx-sheet')) return;
  if (e.key === '/') { e.preventDefault(); searchInput.value?.focus(); return; }
  if (e.key === 'r' || e.key === 'R') { refresh(); return; }
  const ids = shown.value.map(p => p.stewardID);
  if (!ids.length) return;
  if (e.key === 'ArrowDown' || e.key === 'j' || e.key === 'ArrowUp' || e.key === 'k') {
    e.preventDefault();
    const at = ids.indexOf(activeID.value);
    const next = e.key === 'ArrowDown' || e.key === 'j' ? Math.min(ids.length - 1, at + 1) : Math.max(0, at < 0 ? 0 : at - 1);
    activeID.value = ids[next];
    document.querySelector<HTMLElement>(`.dmx-row[data-steward-id="${ids[next]}"]`)?.focus();
  }
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>
