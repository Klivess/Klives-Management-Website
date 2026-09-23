<!--
  KliveAPI telemetry — per-stage, per-route, time-configurable.

  Component naming: every chart component is imported explicitly from
  components/ApiTelemetry/. Nuxt's path-prefixed auto-import would name them
  <ApiTelemetryTelChart>; a bare <TelChart> without the import renders NOTHING.

  Data: /KliveAPI/telemetry/* (Klives-only). Standard ranges are precomputed,
  pre-compressed views on the server; see composables/useApiTelemetry.ts for the
  client half of the "instant" contract (SWR snapshots, ETag revalidation, prefetch).
-->
<template>
  <div class="kt-os api-tel" data-density="compact">
    <header class="tel-top">
      <div class="brand"><b>API telemetry</b><span>KliveAPI · every request, stage by stage</span></div>
      <span class="fresh" :title="lastRefresh ? new Date(lastRefresh).toLocaleString() : ''">
        <i class="lamp" :class="{ on: !loading && !hasErrors, err: hasErrors }" aria-hidden="true"></i>
        {{ freshness }}
      </span>
      <span class="grow"></span>
      <div class="kt-segment sm" role="group" aria-label="Live mode">
        <button :aria-pressed="!!state.live" @click="state.live = state.live ? '' : '1'">Live</button>
      </div>
      <div class="kt-segment sm" role="group" aria-label="Report this browser's API timings">
        <button :aria-pressed="rumOn" :title="'Report this browser’s DNS/TLS/network/download timings for API calls'" @click="toggleRum">Client timing {{ rumOn ? 'on' : 'off' }}</button>
      </div>
      <button class="kt-btn ghost sm" :disabled="loading" @click="refresh">Refresh</button>
    </header>

    <div class="tel-page">
      <!-- One filter row, above everything it scopes. -->
      <div class="tel-filters">
        <div class="kt-segment sm" role="group" aria-label="Time range">
          <button v-for="p in TEL_PRESETS" :key="p" :aria-pressed="!isCustom && state.range === p" @click="setPreset(p)">{{ p === 'all' ? 'All' : p }}</button>
          <button :aria-pressed="isCustom" @click="startCustom">Custom</button>
        </div>
        <template v-if="isCustom">
          <label class="fld">From <input type="datetime-local" :value="toLocalInput(state.from)" @change="setFrom(($event.target as HTMLInputElement).value)" /></label>
          <label class="fld">To <input type="datetime-local" :value="toLocalInput(state.to)" @change="setTo(($event.target as HTMLInputElement).value)" /></label>
        </template>
        <label class="fld">Bucket
          <select v-model="state.bucket" aria-label="Bucket width">
            <option v-for="b in TEL_BUCKETS" :key="b" :value="b">{{ b === 'auto' ? `auto (${data.overview?.bucket ?? '…'})` : b }}</option>
          </select>
        </label>
        <label class="chk" title="Count each /batch sub-request in the global totals (they are always in their own route's numbers)"><input type="checkbox" :checked="!!state.batch" @change="state.batch = state.batch ? '' : '1'" /> Batch items</label>
        <label class="chk" title="Include OmniDefence-blocked, tarpitted and honeypot requests"><input type="checkbox" :checked="!!state.denied" @change="state.denied = state.denied ? '' : '1'" /> Denied</label>
        <span v-if="data.overview?.degraded" class="degraded" role="status">⚠ {{ data.overview.note }}</span>
        <span class="window">{{ windowLabel }}</span>
      </div>

      <div v-if="hasErrors && !data.overview" class="notice" role="alert">
        Couldn’t load telemetry: {{ Object.values(errors)[0] }}. This page needs the Klives rank, and the KliveAPI telemetry engine running.
      </div>

      <!-- Live strip: 1 s ticks from the 10 s tier's open bucket. -->
      <section v-if="state.live" class="tel-live" aria-label="Live">
        <div class="nums">
          <div><span>Rate</span><b>{{ fmtRps(liveNow?.rps) }}</b></div>
          <div><span>p50</span><b>{{ fmtMs(liveNow?.p50) }}</b></div>
          <div><span>p95</span><b>{{ fmtMs(liveNow?.p95) }}</b></div>
          <div><span>p99</span><b>{{ fmtMs(liveNow?.p99) }}</b></div>
          <div><span>5xx</span><b>{{ fmtPct(liveNow?.errorPct) }}</b></div>
          <div><span>In flight</span><b>{{ fmtCount(liveNow?.inFlight) }}</b></div>
          <div><span>Pool busy</span><b>{{ fmtCount(liveNow?.workerBusy) }}</b></div>
          <div><span>Queued work</span><b>{{ fmtCount(liveNow?.pendingWork) }}</b></div>
          <div><span>CPU</span><b>{{ fmtPct(liveNow?.cpuPct, 0) }}</b></div>
        </div>
        <TelChart v-if="live.length > 1" class="live-chart" :t0="live[0].t" :step="1000" unit="ms" label="Live latency (rolling 60 s)" :height="70"
                  :series="[
                    { key: 'p50', label: 'p50', values: live.map(l => l.p50), color: '--tel-s1' },
                    { key: 'p95', label: 'p95', values: live.map(l => l.p95), color: '--tel-s3' },
                  ]" />
        <span v-else class="muted">Collecting live ticks…</span>
      </section>

      <!-- Headline strip -->
      <div class="tel-kpis" :class="{ dim: loading && !!data.overview }">
        <TelKpi label="Requests" :value="fmtCount(kpi?.count)" :current="kpi?.count" :previous="prev?.count" :spark="spark('count')" :foot="fmtRps(kpi?.rps)" />
        <TelKpi label="Rate" :value="fmtRps(kpi?.rps)" :current="kpi?.rps" :previous="prev?.rps" :spark="spark('rps')" />
        <TelKpi label="p50" :value="fmtMs(kpi?.p50)" :current="kpi?.p50" :previous="prev?.p50" :good-direction="-1" :spark="spark('p50')" />
        <TelKpi label="p95" :value="fmtMs(kpi?.p95)" :current="kpi?.p95" :previous="prev?.p95" :good-direction="-1" :spark="spark('p95')" :tone="kpi?.p95 >= 1000 ? 'warn' : ''" />
        <TelKpi label="p99" :value="fmtMs(kpi?.p99)" :current="kpi?.p99" :previous="prev?.p99" :good-direction="-1" :spark="spark('p99')" />
        <TelKpi label="5xx rate" :value="fmtPct(kpi?.errorPct, 2)" :current="kpi?.errorPct" :previous="prev?.errorPct" :good-direction="-1" :spark="spark('errPct')" :tone="kpi?.errorPct >= 1 ? 'bad' : ''" />
        <TelKpi label="Apdex" :value="kpi ? kpi.apdex.toFixed(3) : '—'" :current="kpi?.apdex" :previous="prev?.apdex" :good-direction="1" :spark="spark('apdex')" :help="`T = ${data.overview?.apdexTargetMs ?? 250} ms`" />
        <TelKpi label="Cache hit" :value="fmtPct(kpi?.cacheHitPct, 0)" :current="kpi?.cacheHitPct" :previous="prev?.cacheHitPct" :good-direction="1" :spark="spark('hitPct')" />
        <TelKpi label="Data out" :value="fmtBytes(kpi?.bytesOut)" :current="kpi?.bytesOut" :previous="prev?.bytesOut" :spark="spark('bytesOut')" :foot="`${fmtRatio(kpi?.compression)} compression`" />
        <TelKpi label="Peak in flight" :value="fmtCount(kpi?.peakInFlight)" :current="kpi?.peakInFlight" :previous="prev?.peakInFlight" :good-direction="-1" :spark="spark('inFlightMax')" />
      </div>

      <nav class="tel-tabs" role="tablist" aria-label="Telemetry views">
        <button v-for="t in tabs" :key="t.key" role="tab" :aria-selected="state.tab === t.key" @click="state.tab = t.key">{{ t.label }}</button>
      </nav>

      <!-- Overview -->
      <TelSeriesGrid v-if="state.tab === 'overview'" :d="data.overview" :weekly="data.weekly" :dim="loading"
                     @zoom="zoomTo" @pick="pickTime" @open-route="openRoute" @open-trace="openTrace" />

      <!-- Routes -->
      <section v-else-if="state.tab === 'routes'" class="stack">
        <TelRouteTable :data="data.routes" :selected="selectedSeries" @select="openRoute" />
        <template v-if="state.route">
          <div class="route-head">
            <h2><span class="m">{{ state.method }}</span>{{ state.route }}</h2>
            <span v-if="data.route?.kpi" class="muted">{{ fmtCount(data.route.kpi.count) }} requests · p95 {{ fmtMs(data.route.kpi.p95) }} · {{ fmtPct(data.route.kpi.errorPct, 2) }} 5xx · {{ fmtCount(data.route.kpi.viaBatch) }} via /batch</span>
            <span class="grow"></span>
            <button class="kt-btn ghost sm" @click="openTrace('', state.route, state.method)">Traces for this route</button>
            <button class="kt-btn ghost sm" @click="state.route = ''">Close</button>
          </div>
          <TelSeriesGrid v-if="data.route?.series === selectedSeries || isPseudoRoute" :d="data.route" :dim="loading"
                         @zoom="zoomTo" @pick="pickTime" @open-trace="openTrace" />
          <p v-else class="muted">Loading {{ state.route }}…</p>
        </template>
        <p v-else class="muted">Select a route to see its own charts, waterfall, callers and exemplar traces.</p>
      </section>

      <!-- Stages -->
      <section v-else-if="state.tab === 'stages'" class="stack">
        <div class="tel-grid">
          <TelCard v-for="s in stageCards" :key="s.key" :title="s.label" :help="s.help" :sub="`mean ${fmtMs(s.mean)} · p95 ${fmtMs(s.p95)}${s.latency ? '' : ' · not in latency'}`">
            <TelChart :t0="ots.t0" :step="ots.step" unit="ms" :label="s.label" :dim="loading"
                      :series="[
                        { key: 'mean', label: 'Mean', values: ots.stageMean?.[s.key] ?? [], color: '--tel-s1' },
                        { key: 'p95', label: 'p95', values: ots.stageP95?.[s.key] ?? [], color: '--tel-s3' },
                      ]" @zoom="zoomTo" />
          </TelCard>
          <TelCard title="Thread-pool pressure" help="Queued work items vs busy workers. If the dispatch queue rises with these, requests wait for threads, not code.">
            <TelChart v-if="data.runtime" :t0="data.runtime.t0" :step="data.runtime.step" unit="num" label="Thread-pool pressure" :dim="loading"
                      :series="[
                        { key: 'pend', label: 'Queued work (max)', values: data.runtime.gauges.pendingWork.max, color: '--tel-s2' },
                        { key: 'busy', label: 'Busy workers (max)', values: data.runtime.gauges.workerBusy.max, color: '--tel-s1' },
                      ]" @zoom="zoomTo" />
          </TelCard>
        </div>
        <TelCard title="Which routes spend the most in…" wide>
          <template #actions>
            <select v-model="stageFocus" class="sel" aria-label="Stage">
              <option v-for="k in STAGE_KEYS" :key="k" :value="k">{{ STAGE_LABELS[k] }}</option>
            </select>
            <div class="seg" role="group" aria-label="Statistic">
              <button type="button" :aria-pressed="stageStat === 'stages'" @click="stageStat = 'stages'">Mean</button>
              <button type="button" :aria-pressed="stageStat === 'stagesP95'" @click="stageStat = 'stagesP95'">p95</button>
            </div>
          </template>
          <TelBarList label="Routes by stage time" color="--tel-s5" :items="stageRankingItems" :format="v => fmtMs(v)"
                      empty-text="No route traffic in this window" @select="i => openRoute(stageRanking[i].s)" />
        </TelCard>
      </section>

      <!-- Client (RUM) -->
      <section v-else-if="state.tab === 'client'" class="stack">
        <p v-if="data.rum && !data.rum.enabled" class="notice">Client timing is switched off server-side (KliveAPITelemetryRumDisabled).</p>
        <p v-else-if="data.rum && !data.rum.kpi.count" class="notice">No browser timings yet in this window. They arrive every ~15 s from any page with client timing on.</p>
        <div v-if="data.rum" class="tel-grid">
          <TelCard title="Round trip, as the browser saw it" sub="mean per phase" wide>
            <TelWaterfall :rows="rumWaterfall" mode="mean" label="Client phases" />
          </TelCard>
          <TelCard title="Client headline">
            <dl class="facts">
              <div><dt>Requests seen</dt><dd>{{ fmtCount(data.rum.kpi.count) }}</dd></div>
              <div><dt>Connection reused</dt><dd>{{ fmtPct(data.rum.kpi.reusedPct, 0) }}</dd></div>
              <div><dt>Total p50 / p95</dt><dd>{{ fmtMs(data.rum.kpi.total.p50) }} / {{ fmtMs(data.rum.kpi.total.p95) }}</dd></div>
              <div><dt>Server share (mean)</dt><dd>{{ fmtPct(serverShare, 0) }}</dd></div>
              <div><dt>Network p95</dt><dd>{{ fmtMs(data.rum.kpi.network.p95) }}</dd></div>
              <div><dt>Download p95</dt><dd>{{ fmtMs(data.rum.kpi.download.p95) }}</dd></div>
              <div><dt>TLS mean (new conns)</dt><dd>{{ fmtMs(data.rum.kpi.tls.mean) }}</dd></div>
              <div><dt>Avg transfer</dt><dd>{{ fmtBytes(data.rum.kpi.avgTransfer) }}</dd></div>
            </dl>
          </TelCard>
          <TelCard title="End-to-end latency" sub="fetch start → last byte">
            <TelChart :t0="data.rum.ts.t0" :step="data.rum.ts.step" unit="ms" label="Client total latency" :dim="loading"
                      :series="[
                        { key: 'mean', label: 'Mean', values: data.rum.ts.totalMean, color: '--tel-s1' },
                        { key: 'p95', label: 'p95', values: data.rum.ts.totalP95, color: '--tel-s3' },
                      ]" @zoom="zoomTo" />
          </TelCard>
          <TelCard title="Server vs network vs download" sub="p95 per phase">
            <TelChart :t0="data.rum.ts.t0" :step="data.rum.ts.step" unit="ms" label="Phase p95" :dim="loading"
                      :series="[
                        { key: 'srv', label: 'Server', values: data.rum.ts.serverP95, color: '--tel-s1' },
                        { key: 'net', label: 'Network', values: data.rum.ts.networkP95, color: '--tel-s2' },
                        { key: 'dl', label: 'Download', values: data.rum.ts.downloadP95, color: '--tel-s3' },
                      ]" @zoom="zoomTo" />
          </TelCard>
          <TelCard title="Connection setup" sub="mean ms, stacked">
            <TelChart :t0="data.rum.ts.t0" :step="data.rum.ts.step" unit="ms" stacked label="Connection setup" :dim="loading"
                      :series="[
                        { key: 'b', label: 'Queue + preflight', values: data.rum.ts.blockedMean, color: '--tel-s1', kind: 'area' },
                        { key: 'dns', label: 'DNS', values: data.rum.ts.dnsMean, color: '--tel-s2', kind: 'area' },
                        { key: 'tcp', label: 'TCP', values: data.rum.ts.tcpMean, color: '--tel-s3', kind: 'area' },
                        { key: 'tls', label: 'TLS', values: data.rum.ts.tlsMean, color: '--tel-s4', kind: 'area' },
                      ]" @zoom="zoomTo" />
          </TelCard>
          <TelCard title="Connection reuse" sub="share of requests on a warm connection">
            <TelChart :t0="data.rum.ts.t0" :step="data.rum.ts.step" unit="pct" :y-max="100" label="Connection reuse" :dim="loading"
                      :series="[{ key: 'r', label: 'Reused', values: data.rum.ts.reusedPct, color: '--tel-s3', kind: 'area' }]" @zoom="zoomTo" />
          </TelCard>
          <TelCard title="Browser samples" sub="per bucket">
            <TelChart :t0="data.rum.ts.t0" :step="data.rum.ts.step" unit="count" label="Browser samples" :dim="loading"
                      :series="[{ key: 'c', label: 'Samples', values: data.rum.ts.count, color: '--tel-s1', kind: 'bar' }]" @zoom="zoomTo" />
          </TelCard>
          <TelCard title="By route" sub="p95 per phase (browser view)" wide>
            <table class="mini-table">
              <thead><tr><th>Route</th><th>Samples</th><th>Total p50</th><th>Total p95</th><th>Server p95</th><th>Network p95</th><th>Download p95</th><th>Reused</th></tr></thead>
              <tbody>
                <tr v-for="r in data.rum.routes" :key="r.s" @click="openRoute(r.s)">
                  <td class="mono">{{ r.s }}</td><td>{{ fmtCount(r.count) }}</td><td>{{ fmtMs(r.totalP50) }}</td><td>{{ fmtMs(r.totalP95) }}</td>
                  <td>{{ fmtMs(r.serverP95) }}</td><td>{{ fmtMs(r.networkP95) }}</td><td>{{ fmtMs(r.downloadP95) }}</td><td>{{ fmtPct(r.reusedPct, 0) }}</td>
                </tr>
                <tr v-if="!data.rum.routes.length"><td colspan="8" class="muted">No browser samples</td></tr>
              </tbody>
            </table>
            <p class="muted small">Most dashboard data arrives through <code>/batch</code>, so per-route browser timing concentrates there; the server-side Routes tab still breaks every batch item out individually.</p>
          </TelCard>
        </div>
      </section>

      <!-- Runtime -->
      <section v-else-if="state.tab === 'runtime'" class="stack">
        <div v-if="data.runtime" class="tel-grid">
          <TelCard v-for="g in gaugeCards" :key="g.key" :title="g.label" :sub="`now ${fmtUnit(data.runtime.now?.[g.key], g.unit)}`" :help="g.help">
            <TelChart :t0="data.runtime.t0" :step="data.runtime.step" :unit="g.unit" :label="g.label" :dim="loading"
                      :series="[
                        { key: 'max', label: 'Max', values: data.runtime.gauges[g.key].max, color: '--tel-s2' },
                        { key: 'avg', label: 'Average', values: data.runtime.gauges[g.key].avg, color: '--tel-s1' },
                      ]" @zoom="zoomTo" />
          </TelCard>
        </div>
        <TelCard v-if="data.health" title="Telemetry health" sub="the instrument, measured" wide>
          <dl class="facts">
            <div><dt>Recorded / folded</dt><dd>{{ fmtCount(data.health.recorded) }} / {{ fmtCount(data.health.folded) }}</dd></div>
            <div><dt>Dropped (backlog full)</dt><dd :class="{ bad: data.health.dropped > 0 }">{{ fmtCount(data.health.dropped) }}</dd></div>
            <div><dt>Backlog</dt><dd>{{ fmtCount(data.health.backlog) }}</dd></div>
            <div><dt>Browser samples (dropped)</dt><dd>{{ fmtCount(data.health.rumReceived) }} ({{ fmtCount(data.health.rumDropped) }})</dd></div>
            <div><dt>Route series</dt><dd>{{ fmtCount(data.health.routeSeries) }}</dd></div>
            <div><dt>Views (warm route views)</dt><dd>{{ data.health.views }} ({{ data.health.warmRouteViews }})</dd></div>
            <div><dt>Database</dt><dd>{{ fmtBytes(data.health.dbBytes) }} · queue {{ data.health.dbQueue }} · errors {{ data.health.dbErrors }}</dd></div>
            <div><dt>Last flush</dt><dd>{{ fmtAgo(data.health.lastFlushUtc) }}</dd></div>
            <div><dt>Memory (10s/1m/1h/1d)</dt><dd>{{ memorySummary }}</dd></div>
            <div><dt>Slow-trace threshold</dt><dd>{{ data.health.settings.slowTraceMs }} ms · {{ data.health.settings.samplesPerRouteMinute }} samples/route/min</dd></div>
            <div><dt>Retention</dt><dd>1m {{ data.health.settings.retention1mDays }}d · 1h {{ data.health.settings.retention1hDays }}d · traces {{ data.health.settings.traceRetentionDays }}d</dd></div>
            <div><dt>Slowest view builds</dt><dd>{{ slowestBuilds }}</dd></div>
          </dl>
        </TelCard>
      </section>

      <!-- Traces -->
      <TelTraces v-else-if="state.tab === 'traces'" :list="data.traces" :trace="state.trace ? data.trace : null" :selected-id="state.trace"
                 @select="id => (state.trace = id)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import TelCard from '~/components/ApiTelemetry/TelCard.vue';
import TelChart from '~/components/ApiTelemetry/TelChart.vue';
import TelKpi from '~/components/ApiTelemetry/TelKpi.vue';
import TelSeriesGrid from '~/components/ApiTelemetry/TelSeriesGrid.vue';
import TelRouteTable from '~/components/ApiTelemetry/TelRouteTable.vue';
import TelTraces from '~/components/ApiTelemetry/TelTraces.vue';
import TelWaterfall from '~/components/ApiTelemetry/TelWaterfall.vue';
import TelBarList from '~/components/ApiTelemetry/TelBarList.vue';
import { useApiTelemetry } from '~/composables/useApiTelemetry';
import {
  TEL_PRESETS, TEL_BUCKETS, STAGE_KEYS, STAGE_LABELS, STAGE_HELP,
  fmtAgo, fmtBytes, fmtCount, fmtMs, fmtPct, fmtRatio, fmtRps, fmtTime, fmtUnit, type TelUnit, type WaterfallRow,
} from '~/scripts/apiTelemetryShared';
import { rumEnabled, setRumEnabled, startApiTelemetryRum, stopApiTelemetryRum } from '~/scripts/apiTelemetryRum';

definePageMeta({ layout: 'navbar' });

const { state, data, errors, loading, lastRefresh, live, isCustom, refresh, setPreset, zoomTo, openRoute, openTrace } = useApiTelemetry();

const tabs = [
  { key: 'overview', label: 'Overview' },
  { key: 'routes', label: 'Routes' },
  { key: 'stages', label: 'Stages' },
  { key: 'client', label: 'Client' },
  { key: 'runtime', label: 'Runtime' },
  { key: 'traces', label: 'Traces' },
];

const hasErrors = computed(() => Object.keys(errors).length > 0);
const kpi = computed(() => data.overview?.kpi);
const prev = computed(() => data.overview?.prev);
const ots = computed(() => data.overview?.ts ?? { t0: 0, step: 60_000 });
const spark = (key: string) => ((data.overview?.ts?.[key] ?? []) as (number | null)[]).filter((v): v is number => v != null);

// "as of" is the server's computation instant — honest even when the view is a few seconds old.
const nowTick = ref(Date.now());
let tickTimer: ReturnType<typeof setInterval> | null = null;
onMounted(() => { tickTimer = setInterval(() => (nowTick.value = Date.now()), 1000); });
onBeforeUnmount(() => { if (tickTimer) clearInterval(tickTimer); });
const freshness = computed(() => {
  const asOf = data.overview?.asOfUtc;
  if (!asOf) return loading.value ? 'Loading…' : 'No data';
  return `as of ${fmtAgo(asOf, nowTick.value)}${loading.value ? ' · refreshing' : ''}`;
});
const windowLabel = computed(() => {
  const o = data.overview;
  if (!o) return '';
  return `${fmtTime(o.from, o.bucketMs)} → ${fmtTime(Math.min(o.to, Date.now()), o.bucketMs)} · ${o.points} × ${o.bucket}`;
});

// Custom range inputs (datetime-local is local time; the URL holds ISO UTC).
function toLocalInput(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function startCustom() {
  const o = data.overview;
  const to = Date.now();
  const from = o ? o.from : to - 86_400_000;
  zoomTo(from, to);
}
function setFrom(v: string) { if (v) state.from = new Date(v).toISOString(); }
function setTo(v: string) { state.to = v ? new Date(v).toISOString() : ''; }

/** Clicking a point opens the traces kept around that moment. */
function pickTime(t: number) {
  const step = data.overview?.bucketMs ?? 60_000;
  state.trace = '';
  zoomTo(t, t + step);
  state.tab = 'traces';
}

// Routes
const selectedSeries = computed(() => state.route ? (state.method ? `${state.method} ${state.route}` : state.route) : '');
const isPseudoRoute = computed(() => state.route.startsWith('(') || state.route.startsWith('*'));

// Stages
const stageCards = computed(() => ((data.overview?.stages ?? []) as any[]).map(s => ({ ...s, help: STAGE_HELP[s.key] })));
const stageFocus = ref('handler');
const stageStat = ref<'stages' | 'stagesP95'>('stages');
const stageRanking = computed(() => {
  const idx = STAGE_KEYS.indexOf(stageFocus.value as any);
  return ((data.routes?.routes ?? []) as any[])
    .filter(r => !r.pseudo)
    .map(r => ({ s: r.s, v: r[stageStat.value]?.[idx] ?? 0, count: r.count, frac: r.mean > 0 ? (r.stages?.[idx] ?? 0) / r.mean : 0 }))
    .filter(r => r.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, 25);
});
const stageRankingItems = computed(() => stageRanking.value.map(r => ({
  key: r.s, label: r.s, value: r.v,
  valueText: `${fmtMs(r.v)} ${stageStat.value === 'stages' ? 'mean' : 'p95'} in ${STAGE_LABELS[stageFocus.value]}`,
  detail: `${Math.round(r.frac * 100)}% of its mean time · ${fmtCount(r.count)} requests`,
})));

// Client
const rumOn = ref(process.client ? rumEnabled() : true);
function toggleRum() {
  rumOn.value = !rumOn.value;
  setRumEnabled(rumOn.value);
  if (rumOn.value) startApiTelemetryRum(); else stopApiTelemetryRum();
}
const rumWaterfall = computed<WaterfallRow[]>(() => {
  const k = data.rum?.kpi;
  if (!k) return [];
  const row = (key: string, label: string, color: string, help?: string): WaterfallRow =>
    ({ key, label, ms: k[key]?.mean ?? 0, color, side: key === 'server' ? 'server' : 'client', latency: true, help });
  return [
    row('blocked', 'Browser queue + preflight', '--tel-s8', 'Time before the connection phase: browser queueing, CORS preflight and stalls.'),
    row('dns', 'DNS', '--tel-s8'),
    row('tcp', 'TCP connect', '--tel-s8'),
    row('tls', 'TLS handshake', '--tel-s8'),
    row('network', 'Network wait', '--tel-s2', 'Time to first byte minus the server’s own time: round trips + kernel queueing.'),
    row('server', 'Server (all stages)', '--tel-s5', 'Server-Timing “app” as delivered to the browser.'),
    row('download', 'Download', '--tel-s3', 'First byte → last byte.'),
  ];
});
const serverShare = computed(() => {
  const k = data.rum?.kpi;
  return k && k.total.mean > 0 ? (k.server.mean / k.total.mean) * 100 : null;
});

// Runtime
const gaugeCards: { key: string; label: string; unit: TelUnit; help?: string }[] = [
  { key: 'inFlight', label: 'Requests in flight', unit: 'num' },
  { key: 'acceptsPerSec', label: 'Accepts per second', unit: 'num', help: 'Connections dequeued from http.sys per second.' },
  { key: 'workerBusy', label: 'Busy pool workers', unit: 'num' },
  { key: 'pendingWork', label: 'Queued pool work items', unit: 'num', help: 'Sustained non-zero = thread-pool starvation.' },
  { key: 'poolThreads', label: 'Pool threads', unit: 'num' },
  { key: 'cpuPct', label: 'Process CPU', unit: 'pct' },
  { key: 'heapMB', label: 'Managed heap', unit: 'mb' },
  { key: 'workingSetMB', label: 'Working set', unit: 'mb' },
  { key: 'gcPauseMsPerSec', label: 'GC pause', unit: 'num', help: 'Milliseconds of GC pause per second.' },
  { key: 'allocMBPerSec', label: 'Allocation rate', unit: 'num', help: 'MB allocated per second.' },
  { key: 'gen2PerMin', label: 'Gen-2 GCs per minute', unit: 'num' },
  { key: 'lockContentionPerSec', label: 'Lock contention', unit: 'num', help: 'Monitor contentions per second.' },
  { key: 'cacheEntries', label: 'Response-cache entries', unit: 'count' },
  { key: 'cacheMB', label: 'Response-cache size', unit: 'mb' },
  { key: 'telemetryBacklog', label: 'Telemetry backlog', unit: 'count', help: 'Traces waiting to be aggregated. Should stay near zero.' },
];
const memorySummary = computed(() => {
  const m = data.health?.memoryBytes;
  return m ? ['10s', '1m', '1h', '1d'].map(k => fmtBytes(m[k])).join(' / ') : '—';
});
const slowestBuilds = computed(() => {
  const b = data.health?.buildMs ?? {};
  return Object.entries(b).sort((a: any, c: any) => c[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v} ms`).join(' · ') || '—';
});

// Live
const liveNow = computed(() => live.value[live.value.length - 1]);
</script>

<style lang="scss">
/* Tokens for this page. Categorical series use the validated dark palette (passes
   CVD + normal-vision separation and 3:1 contrast on #101319); status colours are
   reserved for status and always ship with a label. */
.api-tel {
  --tel-surface: var(--kt-surface);
  --tel-surface-2: var(--kt-surface-2);
  --tel-inset: var(--kt-inset);
  --tel-line: var(--kt-line);
  --tel-line-strong: var(--kt-line-strong);
  --tel-grid: rgba(148, 170, 205, 0.08);
  --tel-axis: rgba(148, 170, 205, 0.28);
  --tel-text: var(--kt-text);
  --tel-text-2: var(--kt-text-2);
  --tel-muted: var(--kt-muted);
  --tel-hover: var(--kt-surface-3);
  --tel-selected: rgba(57, 135, 229, 0.16);
  --tel-track: rgba(148, 170, 205, 0.10);
  --tel-crosshair: rgba(230, 236, 245, 0.5);
  --tel-select: rgba(57, 135, 229, 0.18);
  --tel-tip-bg: #171b23;
  --tel-focus: var(--kt-accent);
  --tel-s1: #3987e5; --tel-s2: #d95926; --tel-s3: #199e70; --tel-s4: #c98500;
  --tel-s5: #d55181; --tel-s6: #008300; --tel-s7: #9085e9; --tel-s8: #e66767;
  --tel-s1-hover: #5598e7;
  --tel-s3-text: var(--kt-text-2);
  --tel-good: #0ca30c; --tel-warn: #fab219; --tel-serious: #ec835a; --tel-crit: #d03b3b;
  --tel-good-text: #3fd68a; --tel-crit-text: #ff7b7b;
  --tel-seq-1: #0d366b; --tel-seq-2: #104281; --tel-seq-3: #184f95; --tel-seq-4: #1c5cab;
  --tel-seq-5: #2a78d6; --tel-seq-6: #5598e7; --tel-seq-7: #9ec5f4;
  min-height: 100vh;
}
/* On narrow screens the navbar layout overlays its 56px rail on the page; keep the
   telemetry content clear of it instead of letting the rail cover the left edge. */
.vnav-root.is-overlay .api-tel { padding-left: 56px; }
</style>

<style scoped lang="scss">
.tel-top { position: sticky; top: 0; z-index: 30; display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
  padding: 8px 16px; background: var(--kt-surface-2); border-bottom: 1px solid var(--kt-line); }
.brand { display: flex; flex-direction: column; line-height: 15px; }
.brand b { font-size: 14px; }
.brand span { font-size: 11px; color: var(--tel-muted); }
.fresh { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--tel-text-2); }
.lamp { width: 7px; height: 7px; border-radius: 50%; background: var(--kt-lamp-idle); }
.lamp.on { background: var(--kt-lamp-ok); }
.lamp.err { background: var(--kt-lamp-fault); }
.grow { flex: 1; }
.tel-page { padding: 10px 16px 32px; display: flex; flex-direction: column; gap: 10px; max-width: 1920px; margin: 0 auto; }
.tel-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; font-size: 11px; color: var(--tel-text-2); }
.tel-filters .kt-segment { max-width: 100%; overflow-x: auto; scrollbar-width: none; }
.fld { display: inline-flex; align-items: center; gap: 5px; }
.fld input, .fld select, .sel { height: 24px; background: var(--kt-inset); border: 1px solid var(--kt-line-strong); border-radius: 3px; color: var(--kt-text); padding: 0 6px; color-scheme: dark; }
.chk { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
.degraded { color: var(--tel-warn); }
.window { margin-left: auto; color: var(--tel-muted); }
.notice { background: var(--tel-surface); border: 1px solid var(--tel-line-strong); border-radius: 8px; padding: 8px 12px; font-size: 12px; color: var(--tel-text-2); }
.tel-kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(126px, 1fr)); gap: 8px; transition: opacity 120ms; }
.tel-kpis.dim { opacity: .7; }
.tel-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--tel-line); overflow-x: auto; scrollbar-width: none; }
.tel-tabs button { padding: 6px 12px; font-size: 12px; color: var(--tel-muted); border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; }
.tel-tabs button[aria-selected='true'] { color: var(--tel-text); border-bottom-color: var(--tel-s1); }
.tel-tabs button:hover { color: var(--tel-text); }
.stack { display: flex; flex-direction: column; gap: 8px; }
.tel-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 8px; }
.route-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; }
.route-head h2 { font-size: 14px; font-family: var(--kt-mono); }
.route-head .m { font-size: 10px; color: var(--tel-muted); margin-right: 6px; }
.muted { color: var(--tel-muted); font-size: 11px; }
.small { margin-top: 6px !important; }
.mono { font-family: var(--kt-mono); font-size: 10.5px; }
.tel-live { display: grid; grid-template-columns: auto 1fr; gap: 12px; align-items: center; background: var(--tel-surface);
  border: 1px solid var(--tel-line); border-radius: 8px; padding: 8px 10px; }
.tel-live .nums { display: grid; grid-template-columns: repeat(3, auto); gap: 2px 16px; }
.tel-live .nums div { display: flex; flex-direction: column; font-size: 10.5px; color: var(--tel-muted); }
.tel-live .nums b { font-size: 14px; color: var(--tel-text); }
@media (max-width: 700px) { .tel-live { grid-template-columns: 1fr; } }
.seg { display: inline-flex; border: 1px solid var(--tel-line); border-radius: 5px; overflow: hidden; }
.seg button { font-size: 10.5px; padding: 1px 7px; color: var(--tel-text-2); }
.seg button[aria-pressed='true'] { background: var(--tel-hover); color: var(--tel-text); }
.facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 6px 14px; font-size: 11px; }
.facts dt { color: var(--tel-muted); }
.facts dd { color: var(--tel-text); }
.facts dd.bad { color: var(--tel-crit-text); }
.mini-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.mini-table th { text-align: right; color: var(--tel-muted); font-weight: 500; padding: 3px 6px; border-bottom: 1px solid var(--tel-line); }
.mini-table td { text-align: right; padding: 3px 6px; color: var(--tel-text-2); border-bottom: 1px solid var(--tel-grid); }
.mini-table th:first-child, .mini-table td:first-child { text-align: left; }
.mini-table tbody tr { cursor: pointer; }
.mini-table tbody tr:hover { background: var(--tel-hover); }
@media (max-width: 520px) {
  .tel-top, .tel-page { padding-left: 16px; padding-right: 16px; }
  .window { margin-left: 0; }
}
</style>
