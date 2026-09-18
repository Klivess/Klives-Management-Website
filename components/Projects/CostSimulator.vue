<template>
  <div class="cost-simulator" :aria-busy="loading">
    <form class="price-panel" aria-label="Simulated prices" @submit.prevent="load()">
      <div class="price-grid">
        <label>
          Input <span>$ / MTok</span>
          <input v-model="inputPrice" type="number" min="0" step="0.01" inputmode="decimal" placeholder="e.g. 3.00" />
        </label>
        <label>
          Output <span>$ / MTok</span>
          <input v-model="outputPrice" type="number" min="0" step="0.01" inputmode="decimal" placeholder="e.g. 15.00" />
        </label>
        <label>
          Cache read <span>$ / MTok</span>
          <input v-model="cacheReadPrice" type="number" min="0" step="0.01" inputmode="decimal" placeholder="e.g. 0.30" />
        </label>
        <label class="optional">
          Cache write <span>$ / MTok · optional</span>
          <input
            v-model="cacheWritePrice"
            type="number"
            min="0"
            step="0.01"
            inputmode="decimal"
            placeholder="blank = input rate"
          />
        </label>
      </div>

      <div class="timeframe">
        <div class="range-control" role="group" aria-label="Simulated timeframe">
          <button
            v-for="option in rangeOptions"
            :key="option.key"
            type="button"
            class="range-button"
            :class="{ active: selectedRange === option.key }"
            :aria-pressed="selectedRange === option.key"
            :disabled="loading"
            @click="selectRange(option.key)"
          >
            {{ option.shortLabel }}
          </button>
        </div>
        <template v-if="selectedRange === 'custom'">
          <label class="stacked">From <span>{{ localTimezone }}</span>
            <input v-model="customFrom" type="datetime-local" required :disabled="loading" />
          </label>
          <label class="stacked">To <span>{{ localTimezone }}</span>
            <input v-model="customTo" type="datetime-local" required :disabled="loading" />
          </label>
          <button type="submit" class="refresh-button" :disabled="loading">Apply range</button>
        </template>
        <label class="checkbox">
          <input v-model="includeArchived" type="checkbox" :disabled="loading" />
          Include shelved projects
        </label>
        <button type="button" class="refresh-button" :disabled="loading" @click="load(true)">
          {{ loading ? 'Loading…' : 'Refresh usage' }}
        </button>
      </div>
      <p v-if="rangeError" class="inline-error" role="alert">{{ rangeError }}</p>
    </form>

    <div v-if="loading && !snapshot" class="state-card" role="status">
      <span class="loading-spinner" aria-hidden="true"></span>
      <div>
        <strong>Reading the usage journals</strong>
        <p>Collecting recorded input, cache-read and output tokens for every project in the window.</p>
      </div>
    </div>

    <div v-else-if="error && !snapshot" class="state-card error-state" role="alert">
      <div>
        <strong>Recorded usage could not be loaded</strong>
        <p>{{ error }}</p>
      </div>
      <button type="button" class="refresh-button" @click="load()">Try again</button>
    </div>

    <template v-else-if="snapshot">
      <p v-if="error" class="inline-error" role="alert">{{ error }} The last successful result is still shown.</p>

      <section class="headline" aria-label="Simulated total">
        <article class="headline-card">
          <div class="metric-label">Simulated cost · {{ snapshot.range.label }}</div>
          <div class="headline-value">{{ pricesSet ? money(totals.cost) : '—' }}</div>
          <div class="metric-detail">
            <template v-if="pricesSet">
              {{ tokens(fleet.totalTokens) }} tokens over {{ count(fleet.requests) }} model turns
            </template>
            <template v-else>Enter at least one price above to simulate this window.</template>
          </div>
        </article>
        <article class="headline-card">
          <div class="metric-label">Actually booked</div>
          <div class="headline-value muted-value">{{ money(fleet.actualCostUsd) }}</div>
          <div class="metric-detail">
            What these turns really cost, from the Projects ledger.
          </div>
        </article>
        <article class="headline-card" :class="deltaTone">
          <div class="metric-label">Difference</div>
          <div class="headline-value">{{ pricesSet ? signedMoney(totals.cost - fleet.actualCostUsd) : '—' }}</div>
          <div class="metric-detail">
            {{ deltaDetail }}
          </div>
        </article>
      </section>

      <section class="mix" aria-label="Token mix">
        <article v-for="item in mixCards" :key="item.label" class="mix-card">
          <div class="metric-label">{{ item.label }}</div>
          <div class="metric-value">{{ item.value }}</div>
          <div class="metric-detail">{{ item.detail }}</div>
        </article>
      </section>

      <p class="coverage">
        <span>{{ snapshot.note }}</span>
        <span v-if="fleet.unmeasuredCacheRequests">
          {{ count(fleet.unmeasuredCacheRequests) }} turn(s) carrying
          {{ tokens(fleet.unmeasuredCachePromptTokens) }} prompt tokens reported no cache metrics; those
          are priced entirely as input.
        </span>
        <span v-if="snapshot.models.length">
          Window ran on {{ snapshot.models.length }} model(s):
          {{ snapshot.models.slice(0, 4).map(m => `${m.key} (${share(m.totalTokens)})`).join(', ')
          }}{{ snapshot.models.length > 4 ? ' and others' : '' }} — one price applies to all of them here.
        </span>
        <span v-if="snapshot.silentProjects">{{ snapshot.silentProjects }} project(s) booked nothing in this window.</span>
      </p>

      <section class="breakdown" aria-labelledby="cost-breakdown-heading">
        <div class="section-heading">
          <h3 id="cost-breakdown-heading">Cost per project</h3>
          <p>Open a row to see the same breakdown per agent.</p>
        </div>

        <div v-if="!rows.length" class="state-card empty-state">
          <div>
            <strong>No recorded usage in this window</strong>
            <p>Widen the timeframe, or include shelved projects, to see spend that has already happened.</p>
          </div>
        </div>

        <div v-else class="table-scroll">
          <table class="cost-table">
            <thead>
              <tr>
                <th scope="col" class="name-column">Project</th>
                <th scope="col">Turns</th>
                <th scope="col">Input</th>
                <th scope="col">Cache read</th>
                <th scope="col">Output</th>
                <th scope="col">Simulated</th>
                <th scope="col">Share</th>
                <th scope="col">Booked</th>
              </tr>
            </thead>
            <tbody v-for="row in rows" :key="row.projectID">
              <tr class="project-row" :class="{ open: expanded.has(row.projectID) }">
                <th scope="row" class="name-column">
                  <button
                    type="button"
                    class="disclosure"
                    :aria-expanded="expanded.has(row.projectID)"
                    :aria-label="`${expanded.has(row.projectID) ? 'Hide' : 'Show'} agents for ${row.name}`"
                    @click="toggle(row.projectID)"
                  >
                    <span class="chevron" aria-hidden="true">{{ expanded.has(row.projectID) ? '▾' : '▸' }}</span>
                    <span class="row-name">{{ row.name || '(untitled)' }}</span>
                    <span class="row-status">{{ row.status }}</span>
                  </button>
                </th>
                <td>{{ count(row.requests) }}</td>
                <td>{{ tokens(row.inputTokens) }}</td>
                <td>{{ tokens(row.cacheReadTokens) }}</td>
                <td>{{ tokens(row.outputTokens) }}</td>
                <td class="cost">{{ pricesSet ? money(row.cost) : '—' }}</td>
                <td class="share">
                  <span class="share-bar" aria-hidden="true"><i :style="{ width: sharePct(row) + '%' }"></i></span>
                  {{ sharePct(row).toFixed(1) }}%
                </td>
                <td class="booked">{{ money(row.actualCostUsd) }}</td>
              </tr>
              <tr v-if="expanded.has(row.projectID)" class="agent-header-row">
                <td colspan="8">
                  {{ row.agents.length }} agent(s) booked model turns for {{ row.name }} in this window
                </td>
              </tr>
              <tr v-for="agent in row.agents" v-show="expanded.has(row.projectID)" :key="row.projectID + agent.agentID" class="agent-row">
                <th scope="row" class="name-column">
                  <span class="agent-name">
                    {{ agent.label }}
                    <em v-if="agent.isCommander">commander</em>
                    <em v-else-if="!agent.onRoster" class="retired">retired</em>
                  </span>
                  <small>{{ agent.agentID }}</small>
                </th>
                <td>{{ count(agent.requests) }}</td>
                <td>{{ tokens(agent.inputTokens) }}</td>
                <td>{{ tokens(agent.cacheReadTokens) }}</td>
                <td>{{ tokens(agent.outputTokens) }}</td>
                <td class="cost">{{ pricesSet ? money(agent.cost) : '—' }}</td>
                <td class="share">{{ row.cost > 0 ? (100 * agent.cost / row.cost).toFixed(1) + '%' : '—' }}</td>
                <td class="booked">{{ money(agent.actualCostUsd) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" class="name-column">All projects</th>
                <td>{{ count(fleet.requests) }}</td>
                <td>{{ tokens(fleet.inputTokens) }}</td>
                <td>{{ tokens(fleet.cacheReadTokens) }}</td>
                <td>{{ tokens(fleet.outputTokens) }}</td>
                <td class="cost">{{ pricesSet ? money(totals.cost) : '—' }}</td>
                <td class="share">100%</td>
                <td class="booked">{{ money(fleet.actualCostUsd) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <footer class="freshness">
        Usage read {{ formatDateTime(snapshot.generatedAt) }}
        <span v-if="snapshot.buildDurationMs"> · scan {{ snapshot.buildDurationMs }}ms</span>
        · prices are applied in your browser, so changing one re-costs instantly.
      </footer>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';

type RangeKey = '1h' | '6h' | '24h' | '7d' | '30d' | '90d' | '365d' | 'all' | 'custom';

interface Buckets {
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  totalTokens: number;
  requests: number;
  actualCostUsd: number;
  unmeasuredCachePromptTokens: number;
  unmeasuredCacheRequests: number;
}

interface AgentBuckets extends Buckets {
  agentID: string;
  label: string;
  role: string;
  onRoster: boolean;
  isCommander: boolean;
}

interface ProjectBuckets extends Buckets {
  projectID: string;
  name: string;
  status: string;
  agents: AgentBuckets[];
}

interface Snapshot {
  generatedAt: string;
  buildDurationMs: number;
  range: { key: string; label: string; fromUtc: string; toUtc: string };
  totals: Buckets;
  projects: ProjectBuckets[];
  models: Array<{ key: string; totalTokens: number; requests: number }>;
  silentProjects: number;
  note: string;
}

const rangeOptions: Array<{ key: RangeKey; shortLabel: string }> = [
  { key: '24h', shortLabel: '24H' },
  { key: '7d', shortLabel: '7D' },
  { key: '30d', shortLabel: '30D' },
  { key: '90d', shortLabel: '90D' },
  { key: '365d', shortLabel: '1Y' },
  { key: 'all', shortLabel: 'All' },
  { key: 'custom', shortLabel: 'Custom' },
];

const PRICE_STORAGE_KEY = 'projects-cost-simulator-prices';
const inputPrice = ref('0');
const outputPrice = ref('0');
const cacheReadPrice = ref('0');
const cacheWritePrice = ref('');

const selectedRange = ref<RangeKey>('30d');
const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
function localInputValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
const customFrom = ref(localInputValue(new Date(Date.now() - 7 * 86_400_000)));
const customTo = ref(localInputValue(new Date()));
const includeArchived = ref(true);

const snapshot = ref<Snapshot | null>(null);
const loading = ref(false);
const error = ref('');
const rangeError = ref('');
const expanded = ref(new Set<string>());
let requestGeneration = 0;
let requestController: AbortController | null = null;

// Prices are a per-viewer convenience, not shared state: a blocked or cleared store must leave the
// simulator working with its zero defaults rather than throwing on load.
onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem(PRICE_STORAGE_KEY) ?? 'null');
    if (saved && typeof saved === 'object') {
      inputPrice.value = String(saved.input ?? '0');
      outputPrice.value = String(saved.output ?? '0');
      cacheReadPrice.value = String(saved.cacheRead ?? '0');
      cacheWritePrice.value = saved.cacheWrite == null ? '' : String(saved.cacheWrite);
    }
  } catch { /* fall back to the defaults above */ }
  load();
});

watch([inputPrice, outputPrice, cacheReadPrice, cacheWritePrice], () => {
  try {
    localStorage.setItem(PRICE_STORAGE_KEY, JSON.stringify({
      input: inputPrice.value,
      output: outputPrice.value,
      cacheRead: cacheReadPrice.value,
      cacheWrite: cacheWritePrice.value,
    }));
  } catch { /* the simulator does not depend on the value surviving a reload */ }
});

watch(includeArchived, () => load());

const price = (raw: string) => {
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};
const prices = computed(() => ({
  input: price(inputPrice.value),
  output: price(outputPrice.value),
  cacheRead: price(cacheReadPrice.value),
  // Blank means a cache write is just an input token, which is what it costs on providers that do
  // not surcharge one. Only pull those tokens into their own rate when a price is actually given.
  cacheWrite: cacheWritePrice.value.trim() === '' ? null : price(cacheWritePrice.value),
}));
const pricesSet = computed(() =>
  prices.value.input > 0 || prices.value.output > 0 || prices.value.cacheRead > 0);

function costOf(bucket: Buckets): number {
  const { input, output, cacheRead, cacheWrite } = prices.value;
  const writeTokens = cacheWrite == null ? 0 : Math.min(bucket.cacheWriteTokens, bucket.inputTokens);
  const plainInput = bucket.inputTokens - writeTokens;
  return (
    plainInput * input +
    writeTokens * (cacheWrite ?? input) +
    bucket.cacheReadTokens * cacheRead +
    bucket.outputTokens * output
  ) / 1_000_000;
}

const emptyBuckets: Buckets = {
  inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0,
  totalTokens: 0, requests: 0, actualCostUsd: 0,
  unmeasuredCachePromptTokens: 0, unmeasuredCacheRequests: 0,
};
const fleet = computed<Buckets>(() => snapshot.value?.totals ?? emptyBuckets);
const totals = computed(() => ({ cost: costOf(fleet.value) }));

const rows = computed(() =>
  (snapshot.value?.projects ?? [])
    .map(project => ({
      ...project,
      cost: costOf(project),
      agents: project.agents
        .map(agent => ({ ...agent, cost: costOf(agent) }))
        .sort((a, b) => b.cost - a.cost || b.totalTokens - a.totalTokens),
    }))
    .sort((a, b) => b.cost - a.cost || b.totalTokens - a.totalTokens));

const hasBookedCost = computed(() => Math.abs(fleet.value.actualCostUsd) > 0.000001);
const deltaTone = computed(() => {
  if (!pricesSet.value || !hasBookedCost.value) return 'tone-neutral';
  return totals.value.cost > fleet.value.actualCostUsd ? 'tone-amber' : 'tone-green';
});
const deltaDetail = computed(() => {
  if (!pricesSet.value || !hasBookedCost.value) return 'No booked cost to compare against.';
  const pct = 100 * (totals.value.cost - fleet.value.actualCostUsd) / Math.abs(fleet.value.actualCostUsd);
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% against what was actually booked.`;
});

const mixCards = computed(() => {
  const bucket = fleet.value;
  const promptTokens = bucket.inputTokens + bucket.cacheReadTokens;
  const hitRate = promptTokens > 0 ? (100 * bucket.cacheReadTokens / promptTokens) : 0;
  return [
    {
      label: 'Input tokens',
      value: tokens(bucket.inputTokens),
      detail: pricesSet.value
        ? money(bucket.inputTokens * prices.value.input / 1_000_000) + ' at the input rate'
        : 'Prompt tokens the provider processed fresh',
    },
    {
      label: 'Cache-read tokens',
      value: tokens(bucket.cacheReadTokens),
      detail: `${hitRate.toFixed(1)}% of all prompt tokens` + (pricesSet.value
        ? ` · ${money(bucket.cacheReadTokens * prices.value.cacheRead / 1_000_000)}`
        : ''),
    },
    {
      label: 'Output tokens',
      value: tokens(bucket.outputTokens),
      detail: pricesSet.value
        ? money(bucket.outputTokens * prices.value.output / 1_000_000) + ' at the output rate'
        : 'Tokens the models generated',
    },
    {
      label: 'Cache writes',
      value: tokens(bucket.cacheWriteTokens),
      detail: prices.value.cacheWrite == null
        ? 'Counted inside input — set a cache-write price to split them out'
        : money(bucket.cacheWriteTokens * prices.value.cacheWrite / 1_000_000) + ' at the write rate',
    },
  ];
});

function sharePct(row: { cost: number; totalTokens: number }) {
  if (pricesSet.value && totals.value.cost > 0) return 100 * row.cost / totals.value.cost;
  if (fleet.value.totalTokens > 0) return 100 * row.totalTokens / fleet.value.totalTokens;
  return 0;
}
const share = (value: number) =>
  fleet.value.totalTokens > 0 ? (100 * value / fleet.value.totalTokens).toFixed(0) + '%' : '0%';

function toggle(projectID: string) {
  const next = new Set(expanded.value);
  if (!next.delete(projectID)) next.add(projectID);
  expanded.value = next;
}

const count = (n: number) => (Number(n) || 0).toLocaleString();
function tokens(n: number) {
  const value = Number(n) || 0;
  if (Math.abs(value) >= 1_000_000_000) return (value / 1_000_000_000).toFixed(2) + 'B';
  if (Math.abs(value) >= 1_000_000) return (value / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(value) >= 1_000) return (value / 1_000).toFixed(1) + 'K';
  return value.toLocaleString();
}
function money(n: number) {
  const value = Number(n) || 0;
  // Sub-cent agent rows are the normal case; rounding them all to $0.00 would hide the breakdown.
  const digits = value !== 0 && Math.abs(value) < 0.01 ? 4 : 2;
  return '$' + value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
const signedMoney = (n: number) => (n > 0 ? '+' : '') + money(n);
const formatDateTime = (iso: string) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

function selectRange(key: RangeKey) {
  if (key === selectedRange.value || loading.value) return;
  selectedRange.value = key;
  rangeError.value = '';
  if (key !== 'custom') load();
}

async function load(forceRefresh = false) {
  rangeError.value = '';
  const query = new URLSearchParams({ range: selectedRange.value });
  if (!includeArchived.value) query.set('includeArchived', '0');
  if (selectedRange.value === 'custom') {
    const from = new Date(customFrom.value);
    const to = new Date(customTo.value);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) {
      rangeError.value = 'Choose a valid start time before the end time.';
      return;
    }
    if (to.getTime() > Date.now() + 60_000) {
      rangeError.value = 'The end time cannot be in the future.';
      return;
    }
    query.set('from', from.toISOString());
    query.set('to', to.toISOString());
  }
  if (forceRefresh) query.set('fresh', '1');

  const generation = ++requestGeneration;
  requestController?.abort();
  const controller = new AbortController();
  requestController = controller;
  loading.value = true;
  error.value = '';
  try {
    const response = await RequestGETFromKliveAPI(
      `/projects/cost-simulator?${query}`,
      false,
      false,
      forceRefresh ? { 'Cache-Control': 'no-cache' } : {},
      controller.signal,
    );
    if (generation !== requestGeneration) return;
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).trim();
      throw new Error(detail || `Request failed with HTTP ${response.status}.`);
    }
    const payload = await response.json() as Snapshot;
    if (generation !== requestGeneration) return;
    payload.projects = Array.isArray(payload.projects) ? payload.projects : [];
    payload.models = Array.isArray(payload.models) ? payload.models : [];
    for (const project of payload.projects)
      project.agents = Array.isArray(project.agents) ? project.agents : [];
    snapshot.value = payload;
  } catch (cause: any) {
    if (generation !== requestGeneration) return;
    error.value = cause?.message ? String(cause.message) : 'The cost simulator did not return a result.';
  } finally {
    if (generation === requestGeneration) {
      loading.value = false;
      if (requestController === controller) requestController = null;
    }
  }
}
</script>

<style scoped>
.cost-simulator {
  --surface: #161519;
  --surface-raised: #1a1a1e;
  --border: #2a2a30;
  --muted: #85858f;
  --text: #e6e6eb;
  --green: #4d9e39;
  --green-bright: #62ce47;
  --amber: #d9b872;
  color: var(--text);
  min-width: 0;
}

.price-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 18px;
}

.price-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}

.price-panel label {
  color: #c7c7cc;
  display: flex;
  flex-direction: column;
  font-size: 12px;
  font-weight: 600;
  gap: 5px;
}

.price-panel label span {
  color: var(--muted);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.price-panel input[type="number"],
.price-panel input[type="datetime-local"] {
  background: #111114;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-family: inherit;
  font-size: 14px;
  padding: 8px 10px;
  width: 100%;
}

.price-panel input:focus-visible {
  border-color: var(--green);
  outline: 2px solid rgba(98, 206, 71, 0.35);
  outline-offset: 1px;
}

.optional input::placeholder { color: #55555d; }

.timeframe {
  align-items: flex-end;
  border-top: 1px solid var(--border);
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
  padding-top: 14px;
}

.timeframe .stacked { min-width: 190px; }

.range-control {
  background: #111114;
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  gap: 2px;
  padding: 3px;
}

.range-button {
  background: transparent;
  border: 0;
  border-radius: 5px;
  color: #777780;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  min-width: 38px;
  padding: 8px 9px;
}

.range-button:hover:not(:disabled) { background: #222228; color: #d8d8dc; }
.range-button.active { background: var(--green); color: #fff; }
.range-button:disabled, .refresh-button:disabled { cursor: default; opacity: 0.65; }

.refresh-button {
  background: #26262b;
  border: 0;
  border-radius: 5px;
  color: #c7c7cc;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  padding: 9px 14px;
}

.refresh-button:hover:not(:disabled) { background: #303036; color: var(--text); }

.range-button:focus-visible,
.refresh-button:focus-visible,
.disclosure:focus-visible {
  outline: 2px solid var(--green-bright);
  outline-offset: 2px;
}

.checkbox {
  align-items: center;
  flex-direction: row !important;
  font-weight: 500 !important;
  gap: 7px !important;
  padding-bottom: 9px;
}

.checkbox input { accent-color: var(--green); }

.state-card {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: #b7b7bf;
  display: flex;
  gap: 14px;
  justify-content: space-between;
  min-height: 130px;
  padding: 24px;
}

.state-card strong { color: var(--text); display: block; font-size: 14px; margin-bottom: 4px; }
.state-card p { color: var(--muted); font-size: 12px; line-height: 1.5; margin: 0; }
.error-state { background: #261718; border-color: #5a2b2b; }
.empty-state { justify-content: flex-start; min-height: 110px; }

.loading-spinner {
  animation: cost-spin 0.8s linear infinite;
  border: 2px solid #303036;
  border-radius: 50%;
  border-top-color: var(--green-bright);
  flex-shrink: 0;
  height: 20px;
  width: 20px;
}

@keyframes cost-spin { to { transform: rotate(360deg); } }

.inline-error {
  background: #2a1b1c;
  border: 1px solid #5a2b2b;
  border-radius: 7px;
  color: #e0a9a9;
  font-size: 12px;
  margin: 12px 0 0;
  padding: 9px 12px;
}

.headline {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  margin-bottom: 12px;
}

.headline-card, .mix-card {
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 16px;
}

.headline-card:first-child { box-shadow: inset 0 2px 0 rgba(98, 206, 71, 0.72); }
.headline-card.tone-amber { box-shadow: inset 0 2px 0 rgba(217, 184, 114, 0.72); }
.headline-card.tone-green { box-shadow: inset 0 2px 0 rgba(98, 206, 71, 0.72); }
.headline-card.tone-neutral { box-shadow: inset 0 2px 0 #35353c; }

.metric-label {
  color: var(--muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  margin-bottom: 7px;
  text-transform: uppercase;
}

.headline-value { color: var(--text); font-size: 28px; font-weight: 700; line-height: 1.1; }
.headline-value.muted-value { color: #b7b7bf; }
.metric-value { color: var(--text); font-size: 20px; font-weight: 700; line-height: 1.2; }
.metric-detail { color: #7c7c85; font-size: 11px; line-height: 1.45; margin-top: 6px; }

.mix {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  margin-bottom: 12px;
}

.coverage {
  color: #75757e;
  font-size: 11px;
  line-height: 1.6;
  margin: 0 0 20px;
}

.coverage span + span::before { content: " · "; }

.section-heading { margin-bottom: 10px; }
.section-heading h3 { color: var(--text); font-size: 15px; margin: 0; }
.section-heading p { color: var(--muted); font-size: 12px; margin: 3px 0 0; }

.table-scroll {
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow-x: auto;
}

.cost-table {
  border-collapse: collapse;
  font-size: 12px;
  min-width: 760px;
  width: 100%;
}

.cost-table th, .cost-table td {
  padding: 9px 12px;
  text-align: right;
  white-space: nowrap;
}

.cost-table thead th {
  background: #111114;
  color: var(--muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.name-column { text-align: left !important; width: 34%; }

.cost-table tbody tr { border-top: 1px solid var(--border); }
.project-row { background: var(--surface); }
.project-row.open { background: #1c1c21; }
.project-row th, .project-row td { color: #d2d2d8; font-weight: 600; }

.disclosure {
  align-items: center;
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  display: flex;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  gap: 8px;
  padding: 0;
  text-align: left;
  width: 100%;
}

.chevron { color: var(--green-bright); font-size: 10px; width: 10px; }
.row-name { overflow: hidden; text-overflow: ellipsis; }

.row-status {
  background: #232329;
  border-radius: 20px;
  color: #8f8f98;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  padding: 2px 7px;
  text-transform: uppercase;
}

.agent-header-row td {
  background: #121215;
  color: var(--muted);
  font-size: 10px;
  letter-spacing: 0.06em;
  text-align: left;
  text-transform: uppercase;
}

.agent-row { background: #141418; }
.agent-row th, .agent-row td { color: #a9a9b2; font-weight: 500; }
.agent-row .name-column { padding-left: 32px; }
.agent-name { color: #d2d2d8; }

.agent-name em {
  background: rgba(98, 206, 71, 0.14);
  border-radius: 20px;
  color: var(--green-bright);
  font-size: 9px;
  font-style: normal;
  font-weight: 700;
  letter-spacing: 0.06em;
  margin-left: 6px;
  padding: 2px 6px;
  text-transform: uppercase;
}

.agent-name em.retired { background: #232329; color: #85858f; }
.agent-row small { color: #5f5f68; display: block; font-size: 10px; margin-top: 2px; }

.cost { color: var(--green-bright) !important; }
.booked { color: #8f8f98 !important; }

.share { color: #a9a9b2; }

.share-bar {
  background: #232329;
  border-radius: 2px;
  display: inline-block;
  height: 4px;
  margin-right: 7px;
  overflow: hidden;
  vertical-align: middle;
  width: 46px;
}

.share-bar i { background: var(--green); display: block; height: 100%; }

.cost-table tfoot th, .cost-table tfoot td {
  background: #111114;
  border-top: 2px solid var(--border);
  color: var(--text);
  font-weight: 700;
}

.freshness { color: #5f5f68; font-size: 11px; margin-top: 12px; }

@media (max-width: 680px) {
  .headline-value { font-size: 22px; }
  .timeframe .stacked { min-width: 100%; }
}
</style>
