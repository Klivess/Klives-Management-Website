<!--
  Small multiples for one series (the whole API, or one route): throughput,
  latency percentiles, errors, Apdex, cache, bandwidth, stage breakdown,
  concurrency, heatmap, lifecycle waterfall, distributions and mixes. Every time
  chart shares one crosshair and supports drag-to-zoom (which re-scopes the page).
-->
<template>
  <div v-if="d && d.ts" class="tel-grid">
    <TelCard title="Throughput" :sub="`requests per ${d.bucket} by status class`">
      <TelChart :t0="ts.t0" :step="ts.step" unit="count" stacked label="Throughput by status" :dim="dim"
                :series="[
                  { key: 's2xx', label: '2xx', values: ts.s2xx, color: '--tel-good', kind: 'bar' },
                  { key: 's3xx', label: '3xx / 304', values: ts.s3xx, color: '--tel-s1', kind: 'bar' },
                  { key: 's4xx', label: '4xx', values: ts.s4xx, color: '--tel-warn', kind: 'bar' },
                  { key: 's5xx', label: '5xx', values: ts.s5xx, color: '--tel-crit', kind: 'bar' },
                ]" @zoom="z" @pick="p" />
    </TelCard>

    <TelCard title="Latency" sub="client-visible, server side" help="Accept → last byte handed to http.sys, excluding deliberate OmniDefence delays.">
      <TelChart :t0="ts.t0" :step="ts.step" unit="ms" :log="logLatency" label="Latency percentiles" :dim="dim"
                :series="[
                  { key: 'p50', label: 'p50', values: ts.p50, color: '--tel-s1' },
                  { key: 'p90', label: 'p90', values: ts.p90, color: '--tel-s2' },
                  { key: 'p95', label: 'p95', values: ts.p95, color: '--tel-s3' },
                  { key: 'p99', label: 'p99', values: ts.p99, color: '--tel-s4' },
                  { key: 'max', label: 'max', values: ts.max, color: '--tel-s5', dash: true, hidden: true },
                ]" @zoom="z" @pick="p">
        <template #aside><button type="button" class="mini" :aria-pressed="logLatency" @click="logLatency = !logLatency">log</button></template>
      </TelChart>
    </TelCard>

    <TelCard title="Error rate" sub="share of requests">
      <TelChart :t0="ts.t0" :step="ts.step" unit="pct" label="Error rate" :dim="dim"
                :series="[
                  { key: 'err', label: '5xx', values: ts.errPct, color: '--tel-crit' },
                  { key: 'cli', label: '4xx', values: ts.cliErrPct, color: '--tel-warn' },
                ]" @zoom="z" @pick="p" />
    </TelCard>

    <TelCard title="Apdex" :sub="`T = ${d.apdexTargetMs} ms`" help="(satisfied + tolerating/2) / total; satisfied ≤ T, tolerating ≤ 4T. 1.0 = everyone happy.">
      <TelChart :t0="ts.t0" :step="ts.step" unit="num" :y-max="1" label="Apdex" :dim="dim"
                :series="[{ key: 'apdex', label: 'Apdex', values: ts.apdex, color: '--tel-s1', kind: 'area' }]" @zoom="z" @pick="p" />
    </TelCard>

    <TelCard title="Response cache" sub="GET lookups per bucket">
      <TelChart :t0="ts.t0" :step="ts.step" unit="count" stacked label="Response cache" :dim="dim"
                :series="[
                  { key: 'hit', label: 'Hit', values: ts.hit, color: '--tel-s3', kind: 'bar' },
                  { key: 'miss', label: 'Miss', values: ts.miss, color: '--tel-s2', kind: 'bar' },
                  { key: 'bypass', label: 'Bypass', values: ts.bypass, color: '--tel-s7', kind: 'bar' },
                ]" @zoom="z" @pick="p" />
    </TelCard>

    <TelCard title="Bandwidth" sub="bytes per bucket (on the wire)">
      <TelChart :t0="ts.t0" :step="ts.step" unit="bytes" label="Bandwidth" :dim="dim"
                :series="[
                  { key: 'out', label: 'Out', values: ts.bytesOut, color: '--tel-s1', kind: 'area' },
                  { key: 'in', label: 'In', values: ts.bytesIn, color: '--tel-s2' },
                ]" @zoom="z" @pick="p" />
    </TelCard>

    <TelCard title="Where the time goes" sub="mean ms per request, by stage group" help="Stacked means add up to the mean request time. See the Stages tab for each stage separately.">
      <TelChart :t0="ts.t0" :step="ts.step" unit="ms" stacked label="Stage breakdown" :dim="dim" :series="stageSeries" @zoom="z" @pick="p" />
    </TelCard>

    <TelCard title="Concurrency" sub="requests in flight when each started">
      <TelChart :t0="ts.t0" :step="ts.step" unit="num" label="Concurrency" :dim="dim"
                :series="[
                  { key: 'max', label: 'Peak', values: ts.inFlightMax, color: '--tel-s1' },
                  { key: 'avg', label: 'Average', values: ts.inFlightAvg, color: '--tel-s2', dash: true },
                ]" @zoom="z" @pick="p" />
    </TelCard>

    <TelCard title="Latency heatmap" sub="request count by time × latency" wide>
      <TelHeatmap :t0="d.heatmap.t0" :step="d.heatmap.step" :lo="d.heatmap.lo" :hi="d.heatmap.hi || []" :rows="d.heatmap.rows" />
    </TelCard>

    <TelCard title="Dispatch queue p95" help="Accept → pool thread start. A rising line with flat handler time means thread-pool starvation, not slow code.">
      <TelChart :t0="ts.t0" :step="ts.step" unit="ms" label="Dispatch queue p95" :dim="dim"
                :series="[{ key: 'q', label: 'Queue p95', values: ts.stageP95?.queue ?? [], color: '--tel-s1', kind: 'area' }]" @zoom="z" @pick="p" />
    </TelCard>

    <TelCard title="Compression" sub="uncompressed ÷ wire bytes">
      <TelChart :t0="ts.t0" :step="ts.step" unit="ratio" label="Compression ratio" :dim="dim"
                :series="[{ key: 'c', label: 'Ratio', values: compression, color: '--tel-s3' }]" @zoom="z" @pick="p" />
    </TelCard>

    <TelCard title="Request lifecycle" :sub="`${mode === 'p95' ? 'p95' : 'mean'} per stage`" wide>
      <template #actions>
        <div class="seg" role="group" aria-label="Waterfall statistic">
          <button type="button" :aria-pressed="mode === 'mean'" @click="mode = 'mean'">Mean</button>
          <button type="button" :aria-pressed="mode === 'p95'" @click="mode = 'p95'">p95</button>
        </div>
      </template>
      <TelWaterfall :rows="waterfall" :mode="mode" label="Request lifecycle by stage" />
    </TelCard>

    <TelCard title="Latency distribution">
      <TelHistogram unit="ms" :lo="d.latencyHist.lo" :hi="d.latencyHist.hi" :count="d.latencyHist.count"
                    :p50="d.latencyHist.p50" :p95="d.latencyHist.p95" :p99="d.latencyHist.p99" />
    </TelCard>

    <TelCard title="Response size" sub="bytes on the wire">
      <TelHistogram unit="bytes" :lo="d.sizeHist.lo" :hi="d.sizeHist.hi" :count="d.sizeHist.count"
                    :p50="d.sizeHist.p50" :p95="d.sizeHist.p95" :p99="d.sizeHist.p99" />
    </TelCard>

    <TelCard title="Status codes">
      <TelMix label="Status codes" :items="statusItems" />
    </TelCard>

    <TelCard title="Caller & transport">
      <TelMix label="Request origin" :items="originItems" />
      <div class="gap"></div>
      <TelMix label="Content encoding" :items="encodingItems" />
    </TelCard>

    <TelCard v-if="d.topCost" title="Most expensive routes" sub="share of total server time — click to drill in" wide>
      <TelBarList label="Most expensive routes" :items="costItems" :format="v => `${v.toFixed(0)}%`" empty-text="No route traffic in this window"
                  @select="i => $emit('openRoute', d.topCost[i].s)" />
    </TelCard>

    <TelCard v-if="d.exemplars" title="Exemplar requests" sub="slowest kept traces in this window — click to open" wide>
      <TelBarList label="Exemplar requests" color="--tel-s5" :items="exemplarItems" :format="v => fmtMs(v)" empty-text="No kept traces for this route in this window"
                  @select="i => $emit('openTrace', d.exemplars[i].id, d.exemplars[i].route, d.exemplars[i].method)" />
    </TelCard>

    <TelCard v-if="weekly" title="Weekly pattern" wide>
      <TelWeekGrid :avg-count="weekly.avgCount" :p95="weekly.p95" :err-pct="weekly.errPct" />
    </TelCard>

    <TelCard title="Custom spans & callers" :wide="!weekly">
      <table class="mini-table">
        <thead><tr><th>Span</th><th>Count</th><th>Mean</th><th>Max</th></tr></thead>
        <tbody>
          <tr v-for="s in d.spans" :key="s.name"><td>{{ s.name }}</td><td>{{ fmtCount(s.count) }}</td><td>{{ fmtMs(s.mean) }}</td><td>{{ fmtMs(s.max) }}</td></tr>
          <tr v-if="!d.spans.length"><td colspan="4" class="empty">No custom spans recorded</td></tr>
        </tbody>
      </table>
      <table class="mini-table">
        <thead><tr><th>Top callers</th><th>Requests</th></tr></thead>
        <tbody>
          <tr v-for="u in d.users" :key="u.name"><td>{{ u.name }}</td><td>{{ fmtCount(u.count) }}</td></tr>
          <tr v-if="!d.users.length"><td colspan="2" class="empty">Anonymous traffic only</td></tr>
        </tbody>
      </table>
    </TelCard>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import TelCard from './TelCard.vue';
import TelChart from './TelChart.vue';
import TelHeatmap from './TelHeatmap.vue';
import TelHistogram from './TelHistogram.vue';
import TelWaterfall from './TelWaterfall.vue';
import TelWeekGrid from './TelWeekGrid.vue';
import TelMix from './TelMix.vue';
import TelBarList from './TelBarList.vue';
import { STAGE_GROUPS, STAGE_HELP, stageGroupOf, fmtCount, fmtMs, fmtBytes, type WaterfallRow } from '~/scripts/apiTelemetryShared';

const props = defineProps<{ d: any; weekly?: any; dim?: boolean }>();
const emit = defineEmits<{ zoom: [from: number, to: number]; pick: [t: number]; openRoute: [series: string]; openTrace: [id: string, route: string, method: string] }>();

const logLatency = ref(false);
const mode = ref<'mean' | 'p95'>('mean');
const ts = computed(() => props.d.ts);
const z = (from: number, to: number) => emit('zoom', from, to);
const p = (t: number) => emit('pick', t);

const stageSeries = computed(() => STAGE_GROUPS.map(g => ({
  key: g.key, label: g.label, color: g.color, kind: 'area' as const,
  values: (ts.value.stageMean?.[g.stages[0]] ?? []).map((_: any, i: number) => {
    let sum: number | null = null;
    for (const s of g.stages) {
      const v = ts.value.stageMean?.[s]?.[i];
      if (v != null) sum = (sum ?? 0) + v;
    }
    return sum;
  }),
})));

const compression = computed(() => (ts.value.bytesOut as number[]).map((out, i) => out > 0 ? ts.value.bytesOutRaw[i] / out : null));

const waterfall = computed<WaterfallRow[]>(() => (props.d.stages as any[]).map(s => ({
  key: s.key,
  label: s.label,
  help: STAGE_HELP[s.key],
  ms: mode.value === 'p95' ? s.p95 : s.mean,
  latency: s.latency,
  share: mode.value === 'mean' && s.latency ? s.share : null,
  color: stageGroupOf(s.key)?.color ?? '--tel-s8',
})));

const statusItems = computed(() => {
  const st = props.d.status ?? {};
  return [
    { label: '2xx', value: st['2xx'] ?? 0, color: '--tel-good' },
    { label: '304 Not Modified', value: st['304'] ?? 0, color: '--tel-s1' },
    { label: 'Other 3xx', value: st['3xx'] ?? 0, color: '--tel-s7' },
    { label: '401', value: st['401'] ?? 0, color: '--tel-s5' },
    { label: '403', value: st['403'] ?? 0, color: '--tel-s2' },
    { label: '404', value: st['404'] ?? 0, color: '--tel-s4' },
    { label: '429', value: st['429'] ?? 0, color: '--tel-s6' },
    { label: 'Other 4xx', value: st['4xx'] ?? 0, color: '--tel-warn' },
    { label: '5xx', value: st['5xx'] ?? 0, color: '--tel-crit' },
  ];
});
const ORIGIN_COLORS = ['--tel-s1', '--tel-s2', '--tel-s3', '--tel-s4', '--tel-s5', '--tel-s6', '--tel-s7', '--tel-s8'];
const originItems = computed(() => {
  const entries = Object.entries(props.d.origins ?? {}) as [string, number][];
  const top = entries.slice(0, 7).map(([label, value], i) => ({ label, value, color: ORIGIN_COLORS[i] }));
  const rest = entries.slice(7).reduce((s, [, v]) => s + v, 0);
  return rest > 0 ? [...top, { label: 'Other', value: rest, color: '--tel-s8' }] : top;
});
const encodingItems = computed(() => [
  { label: 'Brotli', value: props.d.encodings?.br ?? 0, color: '--tel-s1' },
  { label: 'Gzip', value: props.d.encodings?.gzip ?? 0, color: '--tel-s2' },
  { label: 'Uncompressed', value: props.d.encodings?.identity ?? 0, color: '--tel-s3' },
]);
const costItems = computed(() => ((props.d.topCost ?? []) as any[]).map(r => ({
  key: r.s, label: r.s, value: r.share * 100,
  valueText: `${(r.share * 100).toFixed(1)}% of server time`,
  detail: `${fmtCount(r.count)} requests · p95 ${fmtMs(r.p95)} · ${fmtMs(r.costMs)} total`,
})));
const exemplarItems = computed(() => ((props.d.exemplars ?? []) as any[]).map(t => ({
  key: t.id, label: new Date(t.ts).toLocaleString(), value: t.ms,
  valueText: fmtMs(t.ms),
  detail: `${t.status} · ${t.cache} · ${fmtBytes(t.bytesOut)}${t.client ? ' · browser timing joined' : ''}`,
})));
</script>

<style scoped>
.tel-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 8px; }
.mini { font-size: 10px; color: var(--tel-muted); padding: 1px 5px; border: 1px solid var(--tel-line); border-radius: 4px; }
.mini[aria-pressed='true'] { color: var(--tel-text); background: var(--tel-hover); }
.seg { display: inline-flex; border: 1px solid var(--tel-line); border-radius: 5px; overflow: hidden; }
.seg button { font-size: 10.5px; padding: 1px 7px; color: var(--tel-text-2); }
.seg button[aria-pressed='true'] { background: var(--tel-hover); color: var(--tel-text); }
.gap { height: 8px; }
.empty { color: var(--tel-muted); font-size: 11px; padding: 4px; }
.mini-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 6px; }
.mini-table th { text-align: left; color: var(--tel-muted); font-weight: 500; padding: 2px 4px; border-bottom: 1px solid var(--tel-line); }
.mini-table td { padding: 2px 4px; color: var(--tel-text-2); border-bottom: 1px solid var(--tel-grid); }
.mini-table td:not(:first-child), .mini-table th:not(:first-child) { text-align: right; }
</style>
