<template>
  <div class="llx-stack" data-testid="llx-analytics">
    <!-- explorer -->
    <section class="llx-card" data-testid="analytics-explorer">
      <header class="llx-card__head">
        <h2 class="llx-card__title"><LlmIcon name="chart" />Explorer</h2>
        <span class="llx-card__meta">{{ explorer.value.value?.bucket ? `${explorer.value.value.bucket} buckets · ${explorer.value.value.tier} tier` : '' }} · drag across the chart to zoom in, click a bucket for its calls</span>
        <div class="llx-card__tools">
          <button v-if="c.allowed.value.export" class="llx-btn llx-btn--sm llx-btn--ghost" title="Download this series as CSV" @click="exportCsv"><LlmIcon name="download" />CSV</button>
        </div>
      </header>

      <div class="llx-explorer__controls">
        <label class="llx-field llx-field--inline"><span>Metric</span>
          <select v-model="metric" class="llx-select" data-testid="analytics-metric">
            <optgroup v-for="g in metricGroups" :key="g.name" :label="g.name">
              <option v-for="m in g.metrics" :key="m.key" :value="m.key">{{ m.label }}</option>
            </optgroup>
          </select>
        </label>
        <label class="llx-field llx-field--inline"><span>Split by</span>
          <select v-model="groupBy" class="llx-select" data-testid="analytics-groupby">
            <option v-for="d in DIMENSIONS" :key="d.id" :value="d.id">{{ d.label }}</option>
          </select>
        </label>
        <label v-if="groupBy !== 'none'" class="llx-field llx-field--inline"><span>Top</span>
          <select v-model.number="top" class="llx-select"><option v-for="n in [5, 8, 12, 20]" :key="n" :value="n">{{ n }}</option></select>
        </label>
        <div class="llx-seg" role="group" aria-label="Chart style">
          <button class="llx-seg__opt" :aria-pressed="mode === 'lines'" @click="mode = 'lines'">Lines</button>
          <button class="llx-seg__opt" :aria-pressed="mode === 'stacked'" :disabled="!additive || groupBy === 'none'" @click="mode = 'stacked'">Stacked</button>
          <button class="llx-seg__opt" :aria-pressed="mode === 'share'" :disabled="!additive || groupBy === 'none'" @click="mode = 'share'">100%</button>
        </div>
        <label class="llx-check"><input v-model="log" type="checkbox" :disabled="mode === 'share'" />Log scale</label>
        <label class="llx-check"><input v-model="comparePrev" type="checkbox" data-testid="analytics-compare" />Window before</label>
        <div class="llx-seg" role="group" aria-label="View">
          <button class="llx-seg__opt" :aria-pressed="view === 'chart'" @click="view = 'chart'">Chart</button>
          <button class="llx-seg__opt" :aria-pressed="view === 'table'" @click="view = 'table'">Table</button>
        </div>
      </div>

      <div class="llx-filters" data-testid="analytics-filters">
        <span class="llx-dim">Filters</span>
        <span v-for="chip in chips" :key="`${chip.dim}:${chip.value}`" class="llx-filter">
          <span class="llx-dim">{{ dimLabel(chip.dim) }}</span> {{ chip.label }}
          <button class="llx-iconbtn llx-iconbtn--sm" :aria-label="`Remove ${chip.label}`" @click="removeFilter(chip.dim, chip.value)"><LlmIcon name="x" /></button>
        </span>
        <select v-model="addDim" class="llx-select llx-select--sm" aria-label="Filter by">
          <option value="">Add a filter…</option>
          <option v-for="d in FILTER_DIMS" :key="d" :value="d">{{ dimLabel(d) }}</option>
        </select>
        <select v-if="addDim" class="llx-select llx-select--sm" aria-label="Filter value" data-testid="analytics-filter-value" @change="addFilter(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''">
          <option value="">Pick one…</option>
          <option v-for="o in options[addDim] ?? []" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <button v-if="chips.length" class="llx-btn llx-btn--xs llx-btn--ghost" @click="clearFilters">Clear</button>
      </div>

      <div v-if="!explorer.value.value" class="llx-empty">{{ explorer.error.value ?? 'Reading…' }}</div>
      <template v-else>
        <div class="llx-explorer__summary">
          <span><b class="llx-num">{{ llmFormatMetric(explorer.value.value.total?.[metric], metric) }}</b> {{ info.label.toLowerCase() }} in the window</span>
          <span v-if="comparePrev && previousTotal != null" class="llx-dim">· <b class="llx-num">{{ llmFormatMetric(previousTotal, metric) }}</b> the window before
            <b v-if="change != null" :data-tone="changeTone">({{ change > 0 ? '+' : '' }}{{ (change * 100).toFixed(1) }}%)</b></span>
          <span v-if="info.help" class="llx-dim">· {{ info.help }}</span>
        </div>
        <div v-if="view === 'chart'" :class="{ 'llx-stale': explorer.stale.value }">
          <TelChart :t0="explorer.value.value.from" :step="explorer.value.value.step" :series="chartSeries" :unit="mode === 'share' ? 'pct' : llmTelUnit(metric)"
                    :stacked="mode !== 'lines'" :log="log && mode !== 'share'" :y-max="mode === 'share' ? 100 : undefined" :height="280" :label="info.label" :marks="marks"
                    @zoom="(f, t) => c.zoomTo(f, t)" @pick="pickBucket" />
        </div>
        <div v-else class="llx-tablewrap">
          <table class="llx-table">
            <thead><tr><th class="l">{{ groupBy === 'none' ? 'Total' : dimLabel(groupBy) }}</th><th>{{ info.label }}</th><th v-if="additive">Share</th></tr></thead>
            <tbody>
              <tr v-for="g in tableRows" :key="g.key" :class="{ 'llx-row': groupBy !== 'none' && !g.other }" @click="groupBy !== 'none' && !g.other && drill(g.key)">
                <td class="l"><span class="llx-swatch" :style="{ background: `var(${g.color})` }"></span>{{ g.label }}</td>
                <td class="llx-num">{{ llmFormatMetric(g.value, metric) }}</td>
                <td v-if="additive" class="llx-num">{{ llmPct(g.share * 100) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </section>

    <!-- small multiples -->
    <section class="llx-card">
      <header class="llx-card__head">
        <h2 class="llx-card__title"><LlmIcon name="grid" />At a glance</h2>
        <span class="llx-card__meta">{{ chips.length ? 'with the filters above' : 'every call in the window' }}</span>
      </header>
      <div v-if="grid.value.value" class="llx-charts llx-charts--4" :class="{ 'llx-stale': grid.stale.value }">
        <div v-for="chart in gridCharts" :key="chart.title" class="llx-chartcell">
          <h3>{{ chart.title }}</h3>
          <TelChart :t0="grid.value.value.from" :step="grid.value.value.step" :series="chart.series" :unit="chart.unit" :stacked="chart.stacked" :label="chart.title" :height="110"
                    :marks="marks" @zoom="(f, t) => c.zoomTo(f, t)" @pick="pickBucket" />
        </div>
      </div>
      <div v-else class="llx-empty">{{ grid.error.value ?? 'Reading…' }}</div>
    </section>

    <!-- distributions -->
    <section class="llx-card">
      <header class="llx-card__head">
        <h2 class="llx-card__title"><LlmIcon name="layers" />Distributions</h2>
        <span class="llx-card__meta">every call in the window, log-spaced buckets; percentiles are marked</span>
      </header>
      <div v-if="dist.value.value" class="llx-hists">
        <LlmHistogram :data="dist.value.value.total" label="Total time" />
        <LlmHistogram :data="dist.value.value.provider" label="Time at the router" />
        <LlmHistogram :data="dist.value.value.ttft" label="First token" />
        <LlmHistogram :data="dist.value.value.queue" label="Queue wait" />
        <LlmHistogram :data="dist.value.value.prompt" label="Prompt size" unit="tokens" />
        <LlmHistogram :data="dist.value.value.completion" label="Completion size" unit="tokens" />
      </div>
      <div v-else class="llx-empty">{{ dist.error.value ?? 'Reading…' }}</div>
      <div v-if="dist.value.value?.outcomes?.length" class="llx-outcomes">
        <span v-for="o in dist.value.value.outcomes" :key="o.outcome" class="llx-outcome" :data-tone="outcomeInfo(o.outcome).tone">
          <b class="llx-num">{{ llmInt(o.calls) }}</b> {{ outcomeInfo(o.outcome).label }}<span class="llx-dim"> · {{ llmInt(o.attempts) }} attempts</span>
        </span>
      </div>
    </section>

    <!-- weekday × hour -->
    <section class="llx-card">
      <header class="llx-card__head">
        <h2 class="llx-card__title"><LlmIcon name="calendar" />When it happens</h2>
        <span class="llx-card__meta">weekday × hour, your time zone · {{ heatWindowText }}</span>
        <div class="llx-card__tools">
          <select v-model="heatMetric" class="llx-select llx-select--sm" aria-label="Heatmap metric">
            <option v-for="m in HEAT_METRICS" :key="m" :value="m">{{ llmMetric(m).label }}</option>
          </select>
        </div>
      </header>
      <LlmWeekGrid v-if="heat.value.value?.values" :values="heat.value.value.values" :days="heat.value.value.days" :format="v => llmFormatMetric(v, heatMetric)"
                   :label="llmMetric(heatMetric).label" :note="isAverage(heatMetric) ? 'each cell is that hour across the window' : 'each cell sums that hour across the window'" />
      <div v-else class="llx-empty">{{ heat.error.value ?? 'Reading…' }}</div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue';
import TelChart from '~/components/ApiTelemetry/TelChart.vue';
import { useLlmRead, type KliveLlmConsole, type LlmUi } from '~/composables/useKliveLlm';
import {
  LLM_METRICS, LLM_SERIES_COLORS, llmDelta, llmFormatMetric, llmInt, llmMetric, llmPct, llmTelUnit, outcomeInfo, presetMs, qs, windowBounds,
} from '~/scripts/kliveLlm';

const c = inject<KliveLlmConsole>('llx')!;
const ui = inject<LlmUi>('llxUi')!;

const DIMENSIONS = [
  { id: 'none', label: 'Nothing (total)' }, { id: 'service', label: 'Service' }, { id: 'lane', label: 'Lane' }, { id: 'subject', label: 'Subject (by day)' },
  { id: 'router', label: 'Router' }, { id: 'provider', label: 'Upstream provider' }, { id: 'model', label: 'Model' }, { id: 'kind', label: 'Kind of call' },
] as const;
const FILTER_DIMS = ['service', 'lane', 'router', 'provider', 'model', 'kind'] as const;
type FilterDim = (typeof FILTER_DIMS)[number];
const dimLabel = (d: string) => DIMENSIONS.find(x => x.id === d)?.label ?? d;

const metric = ref('calls');
const groupBy = ref<string>('service');
const top = ref(8);
const mode = ref<'lines' | 'stacked' | 'share'>('lines');
const log = ref(false);
const comparePrev = ref(false);
const view = ref<'chart' | 'table'>('chart');
const filters = ref<Record<string, string[]>>({});
const addDim = ref<'' | FilterDim>('');

const info = computed(() => llmMetric(metric.value));
const additive = computed(() => ['count', 'tokens', 'usd', 'bytes'].includes(info.value.unit) && !/^(mean|p\d)/.test(metric.value));
watch(additive, ok => { if (!ok && mode.value !== 'lines') mode.value = 'lines'; });
watch(groupBy, g => { if (g === 'none' && mode.value !== 'lines') mode.value = 'lines'; });
const metricGroups = computed(() => {
  const groups = new Map<string, typeof LLM_METRICS>();
  for (const m of LLM_METRICS) { if (!groups.has(m.group)) groups.set(m.group, []); groups.get(m.group)!.push(m); }
  return [...groups.entries()].map(([name, metrics]) => ({ name, metrics }));
});

// ── filter choices, from what the window saw ──
const KINDS = [{ value: 'chat', label: 'Chat' }, { value: 'tool', label: 'Tool session' }, { value: 'warm', label: 'Prefix warm-up' }, { value: 'stt', label: 'Speech to text' }, { value: 'tts', label: 'Text to speech' }, { value: 'local', label: 'Local model' }];
const options = computed<Record<string, { value: string; label: string }[]>>(() => {
  const flows: any[] = c.overview.value?.data?.flows ?? [];
  const lanes: any[] = c.routing.value?.lanes ?? [];
  const uniq = (list: { value: string; label: string }[]) => [...new Map(list.filter(x => x.value).map(x => [x.value, x])).values()].sort((a, b) => a.label.localeCompare(b.label));
  return {
    service: uniq(lanes.map(l => ({ value: l.service, label: l.service }))),
    lane: uniq([...lanes.map(l => ({ value: l.key, label: `${l.service} › ${l.label}` })), ...flows.map(f => ({ value: f.lane, label: f.laneLabel ?? f.lane }))]),
    router: uniq([...(c.routers.value?.routers ?? []).map((r: any) => ({ value: r.id, label: r.name })), ...flows.map(f => ({ value: f.router, label: f.routerLabel ?? f.router }))]),
    provider: uniq(flows.map(f => ({ value: f.provider, label: f.provider }))),
    model: uniq(flows.map(f => ({ value: f.model, label: f.model }))),
    kind: KINDS,
  };
});
const labelOf = (dim: string, value: string) => options.value[dim]?.find(o => o.value === value)?.label ?? value;
const chips = computed(() => Object.entries(filters.value).flatMap(([dim, values]) => values.map(value => ({ dim, value, label: labelOf(dim, value) }))));
function addFilter(value: string) {
  if (!addDim.value || !value) return;
  const list = filters.value[addDim.value] ?? [];
  if (!list.includes(value)) filters.value = { ...filters.value, [addDim.value]: [...list, value] };
  addDim.value = '';
}
function removeFilter(dim: string, value: string) {
  const list = (filters.value[dim] ?? []).filter(v => v !== value);
  const next = { ...filters.value };
  if (list.length) next[dim] = list; else delete next[dim];
  filters.value = next;
}
const clearFilters = () => { filters.value = {}; };
function drill(key: string) {
  if (!(FILTER_DIMS as readonly string[]).includes(groupBy.value)) return;
  const dim = groupBy.value;
  filters.value = { ...filters.value, [dim]: [key] };
  groupBy.value = dim === 'service' ? 'lane' : dim === 'router' ? 'model' : dim === 'lane' ? 'model' : 'none';
}

// ── reads ──
const filterParams = computed(() => Object.fromEntries(Object.entries(filters.value).map(([k, v]) => [k, v])));
const explorerParams = computed(() => ({
  ...c.params.value, ...filterParams.value, metrics: metric.value,
  groupBy: groupBy.value === 'none' ? undefined : groupBy.value, top: groupBy.value === 'none' ? undefined : top.value, compare: comparePrev.value || undefined,
}));
const explorer = useLlmRead(c, () => `/klivellm/series${qs(explorerParams.value)}`);
const grid = useLlmRead(c, () => `/klivellm/series${qs({ ...c.params.value, ...filterParams.value, points: 120,
  metrics: 'calls,failed,promptTokens,completionTokens,estCostUsd,p50TotalMs,p95TotalMs,p95TtftMs,cacheHitPct,errorPct,meanQueueMs,tokensPerSec' })}`);
const dist = useLlmRead(c, () => `/klivellm/distribution${qs({ ...c.params.value, ...filterParams.value })}`);

const HEAT_METRICS = ['calls', 'totalTokens', 'estCostUsd', 'p95TotalMs', 'errorPct', 'cacheHitPct', 'meanQueueMs'];
const heatMetric = ref('calls');
const isAverage = (m: string) => !additiveKey(m);
const additiveKey = (m: string) => ['count', 'tokens', 'usd'].includes(llmMetric(m).unit) && !/^(mean|p\d)/.test(m);
const heatWide = computed(() => { const b = windowBounds(c.window.value, c.now.value); return b.to - b.from >= presetMs('7d'); });
const heatWindowText = computed(() => (heatWide.value ? 'the page’s window' : 'the last 30 days (the window is under a week)'));
const heat = useLlmRead(c, () => `/klivellm/heatmap${qs({ ...(heatWide.value ? c.params.value : { range: '30d' }), ...filterParams.value, metric: heatMetric.value, tz: -new Date().getTimezoneOffset() })}`);

// ── the explorer chart ──
const marks = computed(() => (c.overview.value?.marks ?? []).map((m: any) => ({ t: m.ts, label: m.title })));
const groups = computed<any[]>(() => explorer.value.value?.groups ?? []);
const chartSeries = computed(() => {
  const s = explorer.value.value;
  if (!s) return [];
  const m = metric.value;
  if (groupBy.value === 'none' || !groups.value.length) {
    const out: any[] = [{ key: 'total', label: info.value.label, values: s.totalSeries?.[m] ?? [], color: '--tel-s1', kind: additive.value ? 'bar' : 'line' }];
    if (comparePrev.value && s.previous?.series?.[m]) out.push({ key: 'prev', label: 'The window before', values: s.previous.series[m], color: '--tel-s7', dash: true });
    return out;
  }
  let series = groups.value.map((g: any, i: number) => ({
    key: g.key, label: g.label, values: (g.series?.[m] ?? []) as (number | null)[], color: g.other ? '--tel-muted' : LLM_SERIES_COLORS[i % LLM_SERIES_COLORS.length],
    kind: mode.value === 'lines' ? 'line' : 'area',
  }));
  if (mode.value === 'share') {
    const n = Math.max(0, ...series.map(x => x.values.length));
    const sums = new Array(n).fill(0).map((_, i) => series.reduce((acc, x) => acc + (x.values[i] ?? 0), 0));
    series = series.map(x => ({ ...x, values: x.values.map((v, i) => (sums[i] > 0 ? ((v ?? 0) / sums[i]) * 100 : null)) }));
  }
  if (comparePrev.value && mode.value === 'lines' && s.previous?.series?.[m]) series.push({ key: 'prev', label: 'All, the window before', values: s.previous.series[m], color: '--tel-s7', kind: 'line', dash: true } as any);
  return series;
});
const previousTotal = computed(() => explorer.value.value?.previous?.total?.[metric.value] ?? null);
const change = computed(() => llmDelta(explorer.value.value?.total?.[metric.value], previousTotal.value));
const changeTone = computed(() => (change.value == null || !info.value.good || Math.abs(change.value) < 0.02 ? 'neutral' : Math.sign(change.value) === info.value.good ? 'ok' : 'warn'));
const tableRows = computed(() => {
  const s = explorer.value.value;
  if (!s) return [];
  const m = metric.value;
  if (groupBy.value === 'none' || !groups.value.length) return [{ key: 'total', label: 'Every call', value: s.total?.[m], share: 1, color: '--tel-s1', other: false }];
  const total = groups.value.reduce((acc, g) => acc + Number(g.total?.[m] ?? 0), 0);
  return groups.value.map((g: any, i: number) => ({ key: g.key, label: g.label, value: g.total?.[m], share: total > 0 ? Number(g.total?.[m] ?? 0) / total : 0, color: g.other ? '--tel-muted' : LLM_SERIES_COLORS[i % LLM_SERIES_COLORS.length], other: !!g.other }));
});

// ── the grid ──
const gridCharts = computed(() => {
  const s = grid.value.value?.totalSeries ?? {};
  const failed = (s.failed ?? []).map((x: number | null) => x ?? 0);
  return [
    { title: 'Calls', unit: 'count' as const, stacked: true, series: [
      { key: 'ok', label: 'Answered', values: (s.calls ?? []).map((x: number | null, i: number) => x == null ? null : x - (failed[i] ?? 0)), color: '--tel-s1', kind: 'bar' as const },
      { key: 'f', label: 'Failed', values: failed, color: '--tel-s8', kind: 'bar' as const }] },
    { title: 'Tokens', unit: 'count' as const, stacked: true, series: [
      { key: 'p', label: 'Prompt', values: s.promptTokens ?? [], color: '--tel-s1', kind: 'area' as const },
      { key: 'c', label: 'Completion', values: s.completionTokens ?? [], color: '--tel-s3', kind: 'area' as const }] },
    { title: 'Cost (USD)', unit: 'num' as const, stacked: false, series: [{ key: 'cost', label: 'Cost', values: s.estCostUsd ?? [], color: '--tel-s4', kind: 'bar' as const }] },
    { title: 'Latency', unit: 'ms' as const, stacked: false, series: [
      { key: 'p50', label: 'p50', values: s.p50TotalMs ?? [], color: '--tel-s1' }, { key: 'p95', label: 'p95', values: s.p95TotalMs ?? [], color: '--tel-s2' }] },
    { title: 'First token and queue', unit: 'ms' as const, stacked: false, series: [
      { key: 'ttft', label: 'First token p95', values: s.p95TtftMs ?? [], color: '--tel-s5' }, { key: 'q', label: 'Queue wait (mean)', values: s.meanQueueMs ?? [], color: '--tel-s6', dash: true }] },
    { title: 'Cache hit', unit: 'pct' as const, stacked: false, series: [{ key: 'hit', label: 'Cache hit %', values: s.cacheHitPct ?? [], color: '--tel-s3' }] },
    { title: 'Error rate', unit: 'pct' as const, stacked: false, series: [{ key: 'err', label: 'Error rate %', values: s.errorPct ?? [], color: '--tel-s8' }] },
    { title: 'Output speed', unit: 'num' as const, stacked: false, series: [{ key: 'tps', label: 'Tokens a second', values: s.tokensPerSec ?? [], color: '--tel-s7' }] },
  ];
});

function pickBucket(t: number) {
  const step = explorer.value.value?.step ?? grid.value.value?.step ?? 60_000;
  ui.openCalls({ from: t, to: t + step, ...filters.value });
}

async function exportCsv() {
  await ui.download(`/klivellm/export${qs({ ...explorerParams.value, kind: 'series' })}`, `klivellm-${metric.value}.csv`);
}

// A preset from another tab (a router, a model, a lane) replaces the filters once.
function applyPreset() {
  const p = ui.analyticsPreset.value;
  if (!p) return;
  filters.value = { ...p.filters };
  if (p.metric) metric.value = p.metric;
  if (p.groupBy) groupBy.value = p.groupBy;
  else if (p.filters.lane) groupBy.value = 'model';
  else if (p.filters.router) groupBy.value = 'lane';
  else if (p.filters.model) groupBy.value = 'lane';
  ui.analyticsPreset.value = null;
}
onMounted(() => {
  applyPreset();
  const t = ui.target.value;
  if (t && LLM_METRICS.some(m => m.key === t)) metric.value = t;
});
watch(() => ui.analyticsPreset.value, applyPreset);
</script>
