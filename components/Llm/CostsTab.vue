<template>
  <div class="llx-stack" data-testid="llx-costs">
    <div class="llx-kpis llx-kpis--row">
      <LlmKpi label="Spent" icon="coins" :value="o ? llmUsd(total.estCostUsd) : null" :delta="llmDelta(total.estCostUsd, prev.estCostUsd)" :good="-1" testid="cost-spent"
              help="Reported by the routers, or the price book where they report nothing. Flat-fee and free routers spend nothing per token.">
        <template #sub><span v-if="o">in {{ windowText }}</span></template>
      </LlmKpi>
      <LlmKpi label="List-price equivalent" icon="layers" :value="o ? llmUsd(total.listCostUsd) : null" testid="cost-list"
              help="The same tokens at per-token prices, flat-fee and free traffic included.">
        <template #sub><span v-if="o">what this window would cost per token</span></template>
      </LlmKpi>
      <LlmKpi label="Saved" icon="check-circle" :value="o ? llmUsd(Math.max(0, (total.listCostUsd ?? 0) - (total.estCostUsd ?? 0))) : null" testid="cost-saved"
              help="List-price equivalent minus what was spent: the value of flat-fee and free routers in this window (their fees are not taken off here; see below).">
        <template #sub><span v-if="o">by flat-fee and free routers</span></template>
      </LlmKpi>
      <LlmKpi label="This month" icon="calendar" :value="month.value.value ? llmUsd(month.value.value.total?.estCostUsd) : null" testid="cost-month">
        <template #sub><span v-if="month.value.value">{{ llmCompact(month.value.value.total?.totalTokens) }} tokens since the 1st (UTC)</span></template>
      </LlmKpi>
      <LlmKpi label="Cost per million tokens" icon="gauge" :value="o ? (total.totalTokens ? llmUsd((total.estCostUsd ?? 0) / (total.totalTokens / 1e6)) : '—') : null" testid="cost-permtok">
        <template #sub><span v-if="o">blended, every router</span></template>
      </LlmKpi>
    </div>

    <!-- spend over time -->
    <section class="llx-card">
      <header class="llx-card__head">
        <h2 class="llx-card__title"><LlmIcon name="chart" />Spend over time</h2>
        <span class="llx-card__meta">{{ spend.value.value?.bucket ? `${spend.value.value.bucket} buckets` : '' }}</span>
        <div class="llx-card__tools">
          <div class="llx-seg" role="group" aria-label="Measure">
            <button v-for="m in MEASURES" :key="m.id" class="llx-seg__opt" :aria-pressed="measure === m.id" @click="measure = m.id">{{ m.label }}</button>
          </div>
          <div class="llx-seg" role="group" aria-label="Split by">
            <button v-for="g in SPLITS" :key="g" class="llx-seg__opt" :aria-pressed="split === g" @click="split = g">{{ g }}</button>
          </div>
        </div>
      </header>
      <div v-if="spend.value.value" :class="{ 'llx-stale': spend.stale.value }">
        <TelChart :t0="spend.value.value.from" :step="spend.value.value.step" :series="spendSeries" :unit="measure === 'totalTokens' ? 'count' : 'num'" stacked :height="220"
                  label="Spend" :marks="marks" @zoom="(f, t) => c.zoomTo(f, t)" />
        <div class="llx-legendtable">
          <span v-for="(g, i) in spend.value.value.groups ?? []" :key="g.key"><i :style="{ background: `var(${g.other ? '--tel-muted' : LLM_SERIES_COLORS[i % LLM_SERIES_COLORS.length]})` }"></i>{{ g.label }} <b class="llx-num">{{ measure === 'totalTokens' ? llmCompact(g.total?.[measure]) : llmUsd(g.total?.[measure]) }}</b></span>
        </div>
      </div>
      <div v-else class="llx-empty">{{ spend.error.value ?? 'Reading…' }}</div>
    </section>

    <!-- flat-fee economics -->
    <section class="llx-card" data-testid="cost-economics">
      <header class="llx-card__head">
        <h2 class="llx-card__title"><LlmIcon name="server" />What each router is worth</h2>
        <span class="llx-card__meta">last 30 days · a flat fee is worth it when the same tokens would cost more per token</span>
      </header>
      <div class="llx-tablewrap">
        <table class="llx-table">
          <thead><tr><th class="l">Router</th><th class="l">Billing</th><th>Tokens</th><th>Spent</th><th>Monthly fee</th><th>List-price equivalent</th><th>Effective $/MTok</th><th>Saving</th></tr></thead>
          <tbody>
            <tr v-for="row in economics" :key="row.id">
              <td class="l"><b>{{ row.name }}</b></td>
              <td class="l"><span class="llx-chip llx-chip--xs" :data-tone="row.billing === 'PerToken' ? 'warn' : row.billing === 'Flat' ? 'info' : 'ok'">{{ BILLING_LABELS[row.billing] ?? row.billing }}</span></td>
              <td class="llx-num">{{ llmCompact(row.tokens) }}</td>
              <td class="llx-num">{{ llmUsd(row.spent) }}</td>
              <td class="llx-num">{{ row.fee ? llmUsd(row.fee) : '—' }}</td>
              <td class="llx-num">{{ llmUsd(row.list) }}</td>
              <td class="llx-num">{{ row.perMTok != null ? llmUsd(row.perMTok) : '—' }}</td>
              <td class="llx-num" :data-tone="row.saving == null ? undefined : row.saving >= 0 ? 'ok' : 'warn'">{{ row.saving == null ? '—' : `${row.saving >= 0 ? '' : '−'}${llmUsd(Math.abs(row.saving))}` }}</td>
            </tr>
            <tr v-if="!economics.length"><td colspan="8" class="llx-empty">{{ routers30.value.value ? 'No router carried traffic in the last 30 days.' : 'Reading…' }}</td></tr>
          </tbody>
        </table>
      </div>
      <p class="llx-note">Set a flat-fee router’s monthly fee on the Routers tab (Edit) for its saving to show. Effective $/MTok is spend plus fee over tokens.</p>
    </section>

    <!-- budgets -->
    <section class="llx-card" data-testid="cost-budgets">
      <header class="llx-card__head">
        <h2 class="llx-card__title"><LlmIcon name="shield" />Budgets</h2>
        <span class="llx-card__meta">daily and monthly limits per service or lane, in dollars or tokens (UTC days and months)</span>
        <div class="llx-card__tools">
          <select v-if="c.allowed.value.routing" v-model="newScope" class="llx-select llx-select--sm" aria-label="Add a budget for" data-testid="budget-scope">
            <option value="">Add a budget for…</option>
            <optgroup label="Services"><option v-for="s in services" :key="s" :value="s">{{ s }}</option></optgroup>
            <optgroup label="Lanes"><option v-for="l in lanes" :key="l.key" :value="l.key">{{ l.service }} › {{ l.label }}</option></optgroup>
          </select>
        </div>
      </header>
      <div v-if="newScope" class="llx-budgetrow llx-budgetrow--new">
        <b>{{ scopeLabel(newScope) }}</b>
        <LlmBudgetEditor :budget="null" :can-edit="true" testid="budget-new" @save="b => saveBudget(newScope, b)" />
      </div>
      <ul class="llx-list">
        <li v-for="b in budgets" :key="b.scope" class="llx-budgetrow" :data-testid="`budget-${b.scope}`">
          <div class="llx-budgetrow__head">
            <b>{{ scopeLabel(b.scope) }}</b>
            <button v-if="b.scope.includes('/')" class="llx-btn llx-btn--xs llx-btn--ghost" @click="ui.openLane(b.scope)">Lane</button>
          </div>
          <LlmBudgetEditor :budget="b.budget" :status="b.status" :can-edit="c.allowed.value.routing" :busy="c.busy.value[`budget:${b.scope}`]" @save="x => saveBudget(b.scope, x)" />
        </li>
        <li v-if="!budgets.length && !newScope" class="llx-empty">No budgets. Nothing limits what a service spends.</li>
      </ul>
    </section>

    <LlmSimulator :prices="prices.value.value?.entries ?? []" />
    <LlmForecast />
    <LlmPriceBook :data="prices.value.value" :can-edit="c.allowed.value.prices" @changed="prices.reload()" />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import TelChart from '~/components/ApiTelemetry/TelChart.vue';
import { useLlmRead, type KliveLlmConsole, type LlmUi } from '~/composables/useKliveLlm';
import { BILLING_LABELS, LLM_SERIES_COLORS, describeWindow, llmCompact, llmDelta, llmUsd, qs } from '~/scripts/kliveLlm';

const c = inject<KliveLlmConsole>('llx')!;
const ui = inject<LlmUi>('llxUi')!;

const o = computed(() => c.overview.value?.data ?? null);
const total = computed<any>(() => o.value?.total ?? {});
const prev = computed<any>(() => o.value?.previous ?? {});
const windowText = computed(() => describeWindow(c.window.value, c.now.value).replace(/^Last/, 'the last'));
const marks = computed(() => (c.overview.value?.marks ?? []).map((m: any) => ({ t: m.ts, label: m.title })));

const monthStart = computed(() => { const d = new Date(c.now.value); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); });
const month = useLlmRead(c, () => `/klivellm/series${qs({ from: monthStart.value, bucket: '1d', metrics: 'estCostUsd,totalTokens' })}`);

// ── spend over time ──
const MEASURES = [{ id: 'estCostUsd', label: 'Spent' }, { id: 'listCostUsd', label: 'List price' }, { id: 'totalTokens', label: 'Tokens' }] as const;
const SPLITS = ['service', 'router', 'model'] as const;
const measure = ref<(typeof MEASURES)[number]['id']>('estCostUsd');
const split = ref<(typeof SPLITS)[number]>('service');
const spend = useLlmRead(c, () => `/klivellm/series${qs({ ...c.params.value, metrics: measure.value, groupBy: split.value, top: 8 })}`);
const spendSeries = computed(() => (spend.value.value?.groups ?? []).map((g: any, i: number) => ({
  key: g.key, label: g.label, values: g.series?.[measure.value] ?? [], color: g.other ? '--tel-muted' : LLM_SERIES_COLORS[i % LLM_SERIES_COLORS.length], kind: 'bar' as const,
})));

// ── router economics (30 days) ──
const routers30 = useLlmRead(c, () => `/klivellm/breakdown${qs({ range: '30d', groupBy: 'router' })}`);
const economics = computed(() => {
  const groups = new Map<string, any>((routers30.value.value?.groups ?? []).map((g: any) => [String(g.key).toLowerCase(), g]));
  return (c.routers.value?.routers ?? [])
    .map((r: any) => {
      const g = groups.get(String(r.id).toLowerCase());
      const tokens = Number(g?.values?.totalTokens ?? 0);
      const spent = Number(g?.values?.estCostUsd ?? 0);
      const list = Number(g?.values?.listCostUsd ?? 0);
      const fee = r.billing === 'Flat' ? Number(r.monthlyFeeUsd ?? 0) : 0;
      const perMTok = tokens > 0 ? (spent + fee) / (tokens / 1e6) : null;
      const saving = r.billing === 'PerToken' ? null : fee > 0 || r.billing === 'Free' ? list - fee : null;
      return { id: r.id, name: r.name, billing: r.billing, tokens, spent, list, fee, perMTok, saving };
    })
    .filter((row: any) => row.tokens > 0 || row.fee > 0)
    .sort((a: any, b: any) => b.tokens - a.tokens);
});

// ── budgets ──
const lanes = computed<any[]>(() => c.routing.value?.lanes ?? []);
const services = computed<string[]>(() => c.routing.value?.services ?? []);
const scopeLabel = (scope: string) => {
  if (!scope.includes('/')) return `${scope} (every lane)`;
  const l = lanes.value.find(x => x.key === scope);
  return l ? `${l.service} › ${l.label}` : scope.replace('/', ' › ');
};
const budgets = computed(() => {
  const doc = c.routing.value?.document;
  const out: { scope: string; budget: any; status: any }[] = [];
  for (const [scope, p] of Object.entries<any>(doc?.services ?? {})) {
    if (!p?.budget) continue;
    const lane = lanes.value.find(l => l.service === scope && l.effective?.budgetScope === 'service');
    out.push({ scope, budget: p.budget, status: lane?.effective?.budgetStatus ?? null });
  }
  for (const [scope, p] of Object.entries<any>(doc?.lanes ?? {})) {
    if (!p?.budget) continue;
    const lane = lanes.value.find(l => l.key === scope);
    out.push({ scope, budget: p.budget, status: lane?.effective?.budgetScope === 'lane' ? lane.effective.budgetStatus : null });
  }
  return out.sort((a, b) => (b.status?.fraction ?? 0) - (a.status?.fraction ?? 0));
});
const newScope = ref('');
async function saveBudget(scope: string, budget: any | null) {
  const result = await c.saveBudget(scope, budget);
  if (result && scope === newScope.value) newScope.value = '';
}

// ── prices (shared by the simulator and the price book) ──
const prices = useLlmRead(c, () => '/klivellm/prices');
</script>
