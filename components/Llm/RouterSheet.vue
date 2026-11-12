<template>
  <LlmSheet :open="!!routerId" :title="r?.name ?? routerId ?? ''" :sub="sub" icon="server" :tone="tone" wide testid="llx-router-sheet" @close="$emit('close')">
    <template #tools>
      <button v-if="c.allowed.value.analytics && routerId" class="llx-btn llx-btn--sm llx-btn--ghost" title="Explore this router on the Analytics tab" @click="ui.filterAnalytics({ router: [routerId] })"><LlmIcon name="chart" /></button>
    </template>

    <div v-if="routerId" class="llx-stack">
      <div v-if="!c.allowed.value.analytics" class="llx-banner" data-tone="info"><LlmIcon name="lock" />The router’s history needs the analytics permission.</div>
      <div v-else-if="!data" class="llx-empty">{{ read.error.value ?? 'Reading the router…' }}</div>

      <template v-else>
        <div class="llx-chips">
          <span class="llx-chip llx-chip--dot" :data-tone="tone">{{ stateLabel }}</span>
          <span class="llx-chip" :data-tone="r?.billing === 'PerToken' ? 'warn' : r?.billing === 'Flat' ? 'info' : 'ok'">{{ BILLING_LABELS[r?.billing] ?? r?.billing }}</span>
          <span v-if="r && !r.enabled" class="llx-chip" data-tone="neutral">switched off</span>
          <span v-if="live?.modelCount" class="llx-chip">{{ live.modelCount }} models listed</span>
        </div>

        <!-- availability -->
        <section class="llx-card llx-card--flat">
          <header class="llx-card__head">
            <h3 class="llx-card__title"><LlmIcon name="activity" />Availability</h3>
            <span class="llx-card__meta">{{ availabilityText }}</span>
            <div class="llx-card__tools">
              <div class="llx-seg" role="group" aria-label="Availability window">
                <button v-for="m in STRIPS" :key="m.id" class="llx-seg__opt" :aria-pressed="strip === m.id" @click="strip = m.id">{{ m.label }}</button>
              </div>
            </div>
          </header>
          <LlmUptimeStrip v-if="strip === '6h'" :states="minuteStates" :height="22" />
          <LlmUptimeStrip v-else :periods="periods" :period-label="periodLabel" :height="22" />
          <div class="llx-legend"><span data-state="up">up</span><span data-state="degraded">degraded</span><span data-state="down">down</span><span data-state="nodata">no data</span></div>
        </section>

        <!-- live -->
        <section class="llx-card llx-card--flat">
          <header class="llx-card__head"><h3 class="llx-card__title"><LlmIcon name="gauge" />Right now</h3></header>
          <dl class="llx-dl">
            <dt>Last probe</dt><dd>{{ live?.lastProbeUtc ? `${live.lastProbeOk ? 'ok' : 'failed'} ${llmAgo(live.lastProbeUtc, c.now.value)}${live.lastProbeMs != null ? ` in ${llmMs(live.lastProbeMs)}` : ''}` : 'none yet' }}
              <span v-if="live?.lastProbeError && !live.lastProbeOk" class="llx-text-warn"> · {{ live.lastProbeError }}</span></dd>
            <dt>Last success</dt><dd>{{ live?.lastSuccessUtc ? llmAgo(live.lastSuccessUtc, c.now.value) : '—' }}</dd>
            <dt>Last failure</dt><dd>{{ live?.lastFailureUtc ? `${llmAgo(live.lastFailureUtc, c.now.value)} · ${live.lastFailure ?? ''}` : '—' }}</dd>
            <dt>Model list</dt><dd>{{ live?.modelCount ? `${live.modelCount} models, read ${llmAgo(live.modelsFetchedUtc, c.now.value)}` : 'not read' }}</dd>
            <template v-for="(value, key) in live?.gauges ?? {}" :key="key"><dt>{{ GAUGE_LABELS[String(key)] ?? key }}</dt><dd class="llx-num">{{ gaugeText(String(key), value as number) }}</dd></template>
          </dl>
          <ul v-if="data.circuits?.length" class="llx-warnings">
            <li v-for="cc in data.circuits" :key="cc.lane"><LlmIcon name="power" />{{ cc.lane.replace('/', ' › ') }} skips it until {{ llmTime(new Date(cc.openUntilUtc).getTime(), true) }} ({{ cc.failures }} failures: {{ cc.lastError }})</li>
          </ul>
        </section>

        <!-- over time -->
        <section class="llx-card llx-card--flat">
          <header class="llx-card__head"><h3 class="llx-card__title"><LlmIcon name="chart" />Over time</h3>
            <span class="llx-card__meta">{{ data.series?.bucket ? `${data.series.bucket} buckets · ` : '' }}every attempt, retries included</span></header>
          <div class="llx-charts llx-charts--2" :class="{ 'llx-stale': read.stale.value }">
            <div v-for="chart in charts" :key="chart.title" class="llx-chartcell">
              <h3>{{ chart.title }}</h3>
              <TelChart :t0="data.series.from" :step="data.series.step" :series="chart.series" :unit="chart.unit" :label="chart.title" :height="100" @zoom="(f, t) => c.zoomTo(f, t)" />
            </div>
            <div v-for="g in gaugeCharts" :key="g.key" class="llx-chartcell">
              <h3>{{ GAUGE_LABELS[g.key] ?? g.key }} <span class="llx-dim">(last 6 h, per minute)</span></h3>
              <TelChart :t0="g.t0" :step="60_000" :series="[{ key: g.key, label: GAUGE_LABELS[g.key] ?? g.key, values: g.values, color: '--tel-s7' }]" unit="num" :label="g.key" :height="80" />
            </div>
          </div>
        </section>

        <div class="llx-grid-2">
          <section class="llx-card llx-card--flat">
            <header class="llx-card__head"><h3 class="llx-card__title"><LlmIcon name="clock" />Provider time</h3></header>
            <LlmHistogram :data="data.distribution?.provider" label="Time at the router (successful calls)" />
            <LlmHistogram :data="data.distribution?.ttft" label="First token (streamed calls)" />
          </section>
          <section class="llx-card llx-card--flat">
            <header class="llx-card__head"><h3 class="llx-card__title"><LlmIcon name="list" />How attempts ended</h3></header>
            <table class="llx-table">
              <thead><tr><th class="l">Outcome</th><th>Calls</th><th>Attempts</th></tr></thead>
              <tbody>
                <tr v-for="o in data.distribution?.outcomes ?? []" :key="o.outcome">
                  <td class="l"><span class="llx-chip llx-chip--dot" :data-tone="outcomeInfo(o.outcome).tone">{{ outcomeInfo(o.outcome).label }}</span></td>
                  <td class="llx-num">{{ llmInt(o.calls) }}</td>
                  <td class="llx-num">{{ llmInt(o.attempts) }}</td>
                </tr>
                <tr v-if="!(data.distribution?.outcomes ?? []).length"><td colspan="3" class="llx-empty">No attempts in this window.</td></tr>
              </tbody>
            </table>
          </section>
        </div>

        <div class="llx-grid-2">
          <section class="llx-card llx-card--flat">
            <header class="llx-card__head"><h3 class="llx-card__title"><LlmIcon name="globe" />Upstream providers</h3>
              <span class="llx-card__meta">who actually ran the model (OpenRouter reports it)</span></header>
            <LlmBreakdownTable :groups="data.providers?.groups ?? []" head="Provider" />
          </section>
          <section class="llx-card llx-card--flat">
            <header class="llx-card__head"><h3 class="llx-card__title"><LlmIcon name="grid" />Lanes using it</h3></header>
            <LlmBreakdownTable :groups="data.lanes?.groups ?? []" head="Lane" clickable @select="g => ui.openLane(g.key)" />
          </section>
        </div>

        <section class="llx-card llx-card--flat">
          <header class="llx-card__head"><h3 class="llx-card__title"><LlmIcon name="layers" />Models it answered with</h3></header>
          <LlmBreakdownTable :groups="data.models?.groups ?? []" head="Model" mono />
        </section>

        <section v-if="(data.catalogue ?? []).length || (data.prices ?? []).length" class="llx-card llx-card--flat">
          <header class="llx-card__head">
            <h3 class="llx-card__title"><LlmIcon name="list" />Catalogue</h3>
            <span class="llx-card__meta">{{ (data.catalogue ?? []).length }} models listed · {{ (data.prices ?? []).length }} priced</span>
            <div class="llx-card__tools"><label class="llx-field llx-field--inline llx-field--search"><LlmIcon name="search" /><input v-model="catalogueQuery" class="llx-input" placeholder="Find a model" aria-label="Find a model" /></label></div>
          </header>
          <div class="llx-tablewrap llx-tablewrap--scroll">
            <table class="llx-table">
              <thead><tr><th class="l">Model</th><th>Input $/MTok</th><th>Cached</th><th>Output $/MTok</th></tr></thead>
              <tbody>
                <tr v-for="m in catalogue" :key="m.model">
                  <td class="l llx-mono llx-truncate">{{ m.model }}</td>
                  <td class="llx-num">{{ priceText(m.price?.inputPerMTok) }}</td>
                  <td class="llx-num">{{ priceText(m.price?.cachedInputPerMTok) }}</td>
                  <td class="llx-num">{{ priceText(m.price?.outputPerMTok) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </div>
  </LlmSheet>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import TelChart from '~/components/ApiTelemetry/TelChart.vue';
import { useLlmRead, type KliveLlmConsole, type LlmUi } from '~/composables/useKliveLlm';
import { BILLING_LABELS, STATE_TONES, llmAgo, llmDuration, llmInt, llmMs, llmPct, llmTime, llmUsd, outcomeInfo, qs } from '~/scripts/kliveLlm';

const props = defineProps<{ routerId: string | null }>();
defineEmits<{ close: [] }>();
const c = inject<KliveLlmConsole>('llx')!;
const ui = inject<LlmUi>('llxUi')!;

const read = useLlmRead(c, () => (props.routerId && c.allowed.value.analytics ? `/klivellm/router${qs({ ...c.params.value, id: props.routerId })}` : null));
const data = computed<any>(() => (read.value.value && read.value.value.router?.id?.toLowerCase() === props.routerId?.toLowerCase() ? read.value.value : null));
const card = computed(() => (c.routers.value?.routers ?? []).find((x: any) => x.id === props.routerId) ?? null);
const r = computed(() => card.value ?? data.value?.router ?? null);
const live = computed(() => data.value?.live ?? card.value?.live ?? null);
const tone = computed(() => (r.value && !r.value.enabled ? 'neutral' : STATE_TONES[live.value?.state ?? 'nodata'] ?? 'neutral'));
const stateLabel = computed(() => (r.value && !r.value.enabled ? 'Off' : ({ up: 'Up', degraded: 'Degraded', down: 'Down', nodata: 'No data' } as Record<string, string>)[live.value?.state ?? 'nodata']));
const sub = computed(() => [r.value?.id, card.value?.endpoint ?? r.value?.baseUrl, r.value?.defaultModel ? `default ${r.value.defaultModel}` : null].filter(Boolean).join(' · '));

// ── availability strips ──
const STRIPS = [{ id: '6h', label: '6 h' }, { id: '24h', label: '24 h' }, { id: '7d', label: '7 d' }, { id: '30d', label: '30 d' }, { id: '90d', label: '90 d' }] as const;
const strip = ref<(typeof STRIPS)[number]['id']>('24h');
const minuteStates = computed<string[]>(() => (data.value?.minutes ?? []).map((m: any) => m.state ?? 'nodata'));
const hours = computed<any[]>(() => data.value?.hours ?? []);
const periods = computed(() => {
  const now = c.now.value;
  if (strip.value === '24h' || strip.value === '7d') {
    const since = now - (strip.value === '24h' ? 24 : 168) * 3_600_000;
    return hours.value.filter(h => h.ts >= since);
  }
  const since = now - (strip.value === '30d' ? 30 : 90) * 86_400_000;
  const days = new Map<number, { ts: number; up: number; degraded: number; down: number; noData: number }>();
  for (const h of hours.value) {
    if (h.ts < since) continue;
    const day = Math.floor(h.ts / 86_400_000) * 86_400_000;
    const d = days.get(day) ?? { ts: day, up: 0, degraded: 0, down: 0, noData: 0 };
    d.up += h.up; d.degraded += h.degraded; d.down += h.down; d.noData += h.noData;
    days.set(day, d);
  }
  return [...days.values()].sort((a, b) => a.ts - b.ts);
});
const periodLabel = (ts: number) => new Date(ts).toLocaleString([], strip.value === '30d' || strip.value === '90d' ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const availabilityText = computed(() => {
  const list = strip.value === '6h'
    ? minuteStates.value.reduce((acc, s) => { acc[s] = (acc[s] ?? 0) + 1; return acc; }, {} as Record<string, number>)
    : periods.value.reduce((acc, p) => ({ up: acc.up + p.up, degraded: acc.degraded + p.degraded, down: acc.down + p.down, nodata: acc.nodata + p.noData }), { up: 0, degraded: 0, down: 0, nodata: 0 } as Record<string, number>);
  const measured = (list.up ?? 0) + (list.degraded ?? 0) + (list.down ?? 0);
  if (!measured) return 'no measured minutes';
  return `${llmPct(((list.up ?? 0) + (list.degraded ?? 0)) / measured * 100, 2)} available · ${llmPct((list.up ?? 0) / measured * 100, 2)} clean · ${llmInt(list.down ?? 0)} minutes down`;
});

// ── charts ──
const charts = computed(() => {
  const s = data.value?.series?.totalSeries ?? {};
  return [
    { title: 'Calls and attempts', unit: 'count' as const, series: [
      { key: 'calls', label: 'Calls', values: s.calls ?? [], color: '--tel-s1', kind: 'bar' as const },
      { key: 'attempts', label: 'HTTP attempts', values: s.attempts ?? [], color: '--tel-s7' }] },
    { title: 'Time at the router', unit: 'ms' as const, series: [
      { key: 'p50', label: 'p50', values: s.p50ProviderMs ?? [], color: '--tel-s1' },
      { key: 'p95', label: 'p95', values: s.p95ProviderMs ?? [], color: '--tel-s2' },
      { key: 'p99', label: 'p99', values: s.p99ProviderMs ?? [], color: '--tel-s8', dash: true },
      { key: 'ttft', label: 'First token p95', values: s.p95TtftMs ?? [], color: '--tel-s5' }] },
    { title: 'Failed attempts', unit: 'pct' as const, series: [{ key: 'f', label: 'Attempt failure %', values: s.attemptFailurePct ?? [], color: '--tel-s8' }] },
    { title: 'Rate limited attempts', unit: 'count' as const, series: [{ key: 'rl', label: 'Rate limited', values: s.attemptRateLimited ?? [], color: '--tel-s4', kind: 'bar' as const }] },
    { title: 'Output speed', unit: 'num' as const, series: [{ key: 'tps', label: 'Tokens a second', values: s.tokensPerSec ?? [], color: '--tel-s3' }] },
    { title: 'Cache hit', unit: 'pct' as const, series: [{ key: 'hit', label: 'Cache hit %', values: s.cacheHitPct ?? [], color: '--tel-s6' }] },
  ];
});

const GAUGE_LABELS: Record<string, string> = {
  inFlight: 'In flight', queued: 'Queued', slotsBusy: 'Slots busy', waiting: 'Waiting for a slot', requestsInWindow: 'Requests in window', tokensInWindow: 'Tokens in window',
  coolOffSeconds: 'Cool-off', warmCohort: 'Warm cohort', residents: 'Residents', prefixLifetimeSeconds: 'Prefix lifetime', cacheHitPct1h: 'Cache hit (1 h)',
  creditRemainingUsd: 'Credit left', creditUsedUsd: 'Credit used', creditLimitUsd: 'Credit limit',
};
function gaugeText(key: string, value: number) {
  if (key.endsWith('Usd')) return llmUsd(value);
  if (key.endsWith('Seconds')) return llmDuration(value);
  if (key.endsWith('Pct1h')) return llmPct(value);
  return llmInt(value);
}
const gaugeCharts = computed(() => {
  const minutes: any[] = data.value?.minutes ?? [];
  if (minutes.length < 2) return [];
  const t0 = minutes[0].ts;
  const n = Math.round((minutes[minutes.length - 1].ts - t0) / 60_000) + 1;
  const keys = new Set<string>();
  for (const m of minutes) for (const k of Object.keys(m.gauges ?? {})) keys.add(k);
  const wanted = ['slotsBusy', 'waiting', 'inFlight', 'queued', 'creditRemainingUsd', 'cacheHitPct1h'].filter(k => keys.has(k));
  return wanted.map(key => {
    const values: (number | null)[] = new Array(n).fill(null);
    for (const m of minutes) {
      const i = Math.round((m.ts - t0) / 60_000);
      const v = m.gauges?.[key];
      if (i >= 0 && i < n && typeof v === 'number') values[i] = v;
    }
    return { key, t0, values };
  });
});

// ── catalogue ──
const catalogueQuery = ref('');
const catalogue = computed(() => {
  const prices = new Map<string, any>((data.value?.prices ?? []).map((p: any) => [String(p.model).toLowerCase(), p]));
  const names = new Set<string>([...(data.value?.catalogue ?? []), ...(data.value?.prices ?? []).map((p: any) => p.model)]);
  const words = catalogueQuery.value.toLowerCase().split(/\s+/).filter(Boolean);
  return [...names].filter(m => words.every(w => m.toLowerCase().includes(w))).sort().slice(0, 300)
    .map(model => ({ model, price: prices.get(model.toLowerCase()) }));
});
const priceText = (v: unknown) => (typeof v === 'number' ? `$${v < 1 ? v.toFixed(3) : v.toFixed(2)}` : '—');
</script>
