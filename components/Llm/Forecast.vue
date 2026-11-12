<template>
  <section class="llx-card" data-testid="llx-forecast">
    <header class="llx-card__head">
      <h2 class="llx-card__title"><LlmIcon name="spark" />Forecast</h2>
      <span class="llx-card__meta">{{ tokens ? `${tokens.method}; the band holds about 80% of days like the ones seen` : 'needs three full days of history' }}</span>
      <div class="llx-card__tools">
        <select v-model="service" class="llx-select llx-select--sm" aria-label="Forecast for">
          <option value="">Every service</option>
          <option v-for="s in services" :key="s" :value="s">{{ s }}</option>
        </select>
        <div class="llx-seg" role="group" aria-label="Forecast measure">
          <button class="llx-seg__opt" :aria-pressed="measure === 'cost'" @click="measure = 'cost'">Cost</button>
          <button class="llx-seg__opt" :aria-pressed="measure === 'list'" @click="measure = 'list'">List price</button>
          <button class="llx-seg__opt" :aria-pressed="measure === 'tokens'" @click="measure = 'tokens'">Tokens</button>
        </div>
      </div>
    </header>

    <div v-if="!read.value.value" class="llx-empty">{{ read.error.value ?? 'Reading 90 days of history…' }}</div>
    <div v-else-if="!active" class="llx-empty">Not enough history yet: a forecast needs three complete days.</div>
    <template v-else>
      <div class="llx-forecast__tiles">
        <div class="llx-mini">
          <span class="llx-mini__label">Next 30 days</span>
          <span class="llx-mini__value llx-num" data-testid="forecast-30d">{{ fmt(active.total.mean) }}</span>
          <span class="llx-dim llx-num">{{ fmt(active.total.low) }} – {{ fmt(active.total.high) }}</span>
        </div>
        <div v-if="active.monthEnd" class="llx-mini">
          <span class="llx-mini__label">This month, by its end</span>
          <span class="llx-mini__value llx-num">{{ fmt(active.monthEnd.mean) }}</span>
          <span class="llx-dim llx-num">{{ fmt(active.monthEnd.soFar) }} so far · {{ fmt(active.monthEnd.low) }} – {{ fmt(active.monthEnd.high) }}</span>
        </div>
        <div class="llx-mini">
          <span class="llx-mini__label">A day, on average</span>
          <span class="llx-mini__value llx-num">{{ fmt(active.total.mean / 30) }}</span>
          <span class="llx-dim">{{ active.sampleDays }} days of history used</span>
        </div>
        <div v-if="runway" class="llx-mini" data-testid="forecast-runway">
          <span class="llx-mini__label">OpenRouter credit</span>
          <span class="llx-mini__value llx-num" :data-tone="runway.days != null && runway.days < 7 ? 'warn' : undefined">{{ runway.days == null ? 'no spend' : `${Math.floor(runway.days)} days` }}</span>
          <span class="llx-dim llx-num">{{ llmUsd(runway.credit) }} left · {{ llmUsd(runway.perDay) }} a day over the last week</span>
        </div>
        <div v-if="air" class="llx-mini">
          <span class="llx-mini__label">AIRouter envelope</span>
          <span class="llx-mini__value llx-num">{{ air.tokenCeiling ? llmPct((air.tokensInWindow / air.tokenCeiling) * 100, 0) : '—' }}</span>
          <span class="llx-dim llx-num">of its token window in use · {{ air.requestCeiling ? llmPct((air.requestsInWindow / air.requestCeiling) * 100, 0) : '—' }} of requests</span>
        </div>
      </div>
      <div class="llx-chartcell">
        <h3>The last {{ historyDays }} days and the next 30</h3>
        <TelChart :t0="chart.t0" :step="86_400_000" :series="chart.series" :unit="measure === 'tokens' ? 'count' : 'num'" label="Forecast" :height="180" />
      </div>
      <p class="llx-note">The current day is partial and is left out of the fit. Cost is what the routers reported, or the price book where they report nothing; flat-fee routers add nothing per token, so “List price” shows what the same tokens would cost on per-token routers.</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import TelChart from '~/components/ApiTelemetry/TelChart.vue';
import { useLlmRead, type KliveLlmConsole } from '~/composables/useKliveLlm';
import { forecastDaily, llmCompact, llmPct, llmUsd, qs } from '~/scripts/kliveLlm';

const c = inject<KliveLlmConsole>('llx')!;
const service = ref('');
const measure = ref<'cost' | 'list' | 'tokens'>('cost');
const services = computed<string[]>(() => c.routing.value?.services ?? []);

const read = useLlmRead(c, () => `/klivellm/series${qs({ range: '90d', bucket: '1d', metrics: 'totalTokens,estCostUsd,listCostUsd', service: service.value || undefined })}`);
const days = computed(() => {
  const s = read.value.value;
  if (!s) return [];
  return (s.totalSeries?.totalTokens ?? []).map((_: unknown, i: number) => ({
    day: s.from + i * s.step,
    tokens: s.totalSeries.totalTokens[i] ?? 0,
    cost: s.totalSeries.estCostUsd?.[i] ?? 0,
    list: s.totalSeries.listCostUsd?.[i] ?? 0,
  }));
});
// Days before the first recorded one are not history, just empty: start the fit at the first busy day.
const firstBusy = computed(() => days.value.findIndex((d: any) => d.tokens > 0));
const history = computed(() => (firstBusy.value < 0 ? [] : days.value.slice(firstBusy.value)));
const tokens = computed(() => forecastDaily(history.value.map((d: any) => ({ day: d.day, value: d.tokens })), 30, c.now.value));
const cost = computed(() => forecastDaily(history.value.map((d: any) => ({ day: d.day, value: d.cost })), 30, c.now.value));
const list = computed(() => forecastDaily(history.value.map((d: any) => ({ day: d.day, value: d.list })), 30, c.now.value));
const active = computed(() => (measure.value === 'tokens' ? tokens.value : measure.value === 'list' ? list.value : cost.value));
const fmt = (v: number) => (measure.value === 'tokens' ? llmCompact(v) : llmUsd(v));

const historyDays = computed(() => Math.min(60, history.value.length));
const chart = computed(() => {
  const past = history.value.slice(-historyDays.value);
  const f = active.value;
  const key = measure.value;
  const t0 = past[0]?.day ?? c.now.value;
  const n = past.length + (f?.days.length ?? 0);
  const actual: (number | null)[] = new Array(n).fill(null);
  const mean: (number | null)[] = new Array(n).fill(null);
  const low: (number | null)[] = new Array(n).fill(null);
  const high: (number | null)[] = new Array(n).fill(null);
  past.forEach((d: any, i: number) => { actual[i] = d[key]; });
  for (const d of f?.days ?? []) {
    const i = Math.round((d.day - t0) / 86_400_000);
    if (i < 0 || i >= n) continue;
    mean[i] = d.mean; low[i] = d.low; high[i] = d.high;
  }
  return {
    t0,
    series: [
      { key: 'actual', label: 'Recorded', values: actual, color: '--tel-s1', kind: 'bar' as const },
      { key: 'mean', label: 'Forecast', values: mean, color: '--tel-s4' },
      { key: 'high', label: 'High end', values: high, color: '--tel-s7', dash: true },
      { key: 'low', label: 'Low end', values: low, color: '--tel-s7', dash: true },
    ],
  };
});

// ── OpenRouter credit runway and AIRouter envelope ──
const week = useLlmRead(c, () => `/klivellm/breakdown${qs({ range: '7d', groupBy: 'router' })}`);
const runway = computed(() => {
  const r = (c.routers.value?.routers ?? []).find((x: any) => typeof x.live?.gauges?.creditRemainingUsd === 'number');
  if (!r) return null;
  const credit = r.live.gauges.creditRemainingUsd as number;
  const spend = (week.value.value?.groups ?? []).filter((g: any) => String(g.key).startsWith('openrouter')).reduce((s: number, g: any) => s + Number(g.values?.estCostUsd ?? 0), 0);
  const perDay = spend / 7;
  return { credit, perDay, days: perDay > 0 ? credit / perDay : null };
});
const air = computed(() => ((c.routers.value?.routers ?? []).some((r: any) => r.id === 'airouter') ? c.live.value?.airouter ?? null : null));
</script>
