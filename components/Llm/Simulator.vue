<template>
  <section class="llx-card" data-testid="llx-simulator">
    <header class="llx-card__head">
      <h2 class="llx-card__title"><LlmIcon name="flask" />Cost simulator</h2>
      <span class="llx-card__meta">What the recorded tokens would have cost at other prices. Counts come from the ledger; the prices are yours to try.</span>
    </header>

    <div class="llx-sim__scope">
      <label class="llx-field llx-field--inline"><span>Window</span>
        <select v-model="range" class="llx-select" data-testid="sim-range">
          <option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option><option value="page">The page’s window</option>
        </select>
      </label>
      <label class="llx-field llx-field--inline"><span>Split by</span>
        <select v-model="groupBy" class="llx-select">
          <option value="lane">Lane</option><option value="service">Service</option><option value="router">Router</option><option value="model">Model</option>
        </select>
      </label>
      <div class="llx-filters">
        <span class="llx-dim">Traffic</span>
        <span v-if="!picked.length" class="llx-filter">every service</span>
        <span v-for="p in picked" :key="p" class="llx-filter">{{ pickLabel(p) }}
          <button class="llx-iconbtn llx-iconbtn--sm" :aria-label="`Remove ${pickLabel(p)}`" @click="picked = picked.filter(x => x !== p)"><LlmIcon name="x" /></button></span>
        <select class="llx-select llx-select--sm" aria-label="Add a service or lane" data-testid="sim-pick" @change="pick(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''">
          <option value="">Add a service or lane…</option>
          <optgroup label="Services"><option v-for="s in services" :key="`s:${s}`" :value="`s:${s}`">{{ s }} (all lanes)</option></optgroup>
          <optgroup label="Lanes"><option v-for="l in lanes" :key="`l:${l.key}`" :value="`l:${l.key}`">{{ l.service }} › {{ l.label }}</option></optgroup>
        </select>
      </div>
    </div>

    <div v-if="!data" class="llx-empty">{{ read.error.value ?? 'Reading the token counts…' }}</div>
    <template v-else>
      <div class="llx-sim__recorded" data-testid="sim-recorded">
        <span><b class="llx-num">{{ llmInt(totals.calls) }}</b> calls over {{ days.toFixed(days < 2 ? 1 : 0) }} days</span>
        <span><b class="llx-num">{{ llmCompact(totals.inputTokens) }}</b> fresh input<span class="llx-dim"> (of which {{ llmCompact(totals.cacheWriteTokens) }} cache writes)</span></span>
        <span><b class="llx-num">{{ llmCompact(totals.cacheReadTokens) }}</b> cached input</span>
        <span><b class="llx-num">{{ llmCompact(totals.outputTokens) }}</b> output<span v-if="totals.reasoningTokens" class="llx-dim"> ({{ llmCompact(totals.reasoningTokens) }} reasoning)</span></span>
        <span>actually cost <b class="llx-num">{{ llmUsd(totals.actualCostUsd) }}</b><span class="llx-dim"> · list price {{ llmUsd(totals.listCostUsd) }}</span></span>
      </div>
      <p v-if="totals.unmeasuredPromptTokens > 0" class="llx-banner" data-tone="info">
        <LlmIcon name="info" />{{ llmCompact(totals.unmeasuredPromptTokens) }} prompt tokens came from routers that report no cache split; they are priced wholly as input, so “as recorded” cache savings are understated for them.
      </p>

      <div class="llx-sim__scenarios">
        <article v-for="(s, i) in scenarios" :key="s.id" class="llx-scenario" :style="{ '--scenario': `var(${COLORS[i]})` }" :data-testid="`scenario-${i}`">
          <header class="llx-scenario__head">
            <span class="llx-swatch" :style="{ background: `var(${COLORS[i]})` }"></span>
            <input v-model="s.name" class="llx-input llx-input--bare" aria-label="Scenario name" />
            <button v-if="scenarios.length > 1" class="llx-iconbtn llx-iconbtn--sm" :aria-label="`Remove ${s.name}`" @click="scenarios.splice(i, 1)"><LlmIcon name="x" /></button>
          </header>
          <label class="llx-field"><span>Load prices from</span>
            <select class="llx-select llx-select--sm" :data-testid="`scenario-${i}-load`" @change="load(s, ($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''">
              <option value="">a model in the price book…</option>
              <option v-for="p in priced" :key="`${p.router}|${p.model}`" :value="`${p.router}|${p.model}`">{{ p.model }}{{ p.router !== '*' ? ` (${p.router})` : '' }} · ${{ fmtPrice(p.inputPerMTok) }} / ${{ fmtPrice(p.outputPerMTok) }}</option>
            </select>
          </label>
          <div class="llx-scenario__prices">
            <label class="llx-field"><span>Input $/MTok</span><input v-model.number="s.input" class="llx-input" type="number" min="0" step="0.01" :data-testid="`scenario-${i}-input`" /></label>
            <label class="llx-field"><span>Output $/MTok</span><input v-model.number="s.output" class="llx-input" type="number" min="0" step="0.01" :data-testid="`scenario-${i}-output`" /></label>
            <label class="llx-field"><span>Cached input</span><input v-model.number="s.cachedInput" class="llx-input" type="number" min="0" step="0.01" placeholder="= input" /></label>
            <label class="llx-field"><span>Cache write</span><input v-model.number="s.cacheWrite" class="llx-input" type="number" min="0" step="0.01" placeholder="= input" /></label>
            <label class="llx-field"><span>Monthly fee</span><input v-model.number="s.monthlyFee" class="llx-input" type="number" min="0" step="1" placeholder="none" /></label>
            <label class="llx-field"><span>Cache</span>
              <select v-model="s.cache" class="llx-select">
                <option value="asRecorded">as recorded</option><option value="none">no cache at all</option><option value="percent">a share of prompts</option>
              </select>
            </label>
            <label v-if="s.cache === 'percent'" class="llx-field"><span>Cached share %</span><input v-model.number="s.cachePercent" class="llx-input" type="number" min="0" max="100" step="1" /></label>
          </div>
          <div class="llx-scenario__result">
            <span class="llx-scenario__cost llx-num" :data-testid="`scenario-${i}-cost`">{{ hasPrices(s) ? llmUsd(results[i].costUsd) : '—' }}</span>
            <span v-if="hasPrices(s)" class="llx-dim llx-num">
              <template v-if="totals.actualCostUsd > 0">{{ ratioText(results[i].costUsd) }} · </template>{{ llmUsd(results[i].costUsd / Math.max(1e-9, results[i].tokens / 1e6)) }}/MTok blended
              <template v-if="results[i].fee"> · fee {{ llmUsd(results[i].fee) }}</template>
            </span>
            <span v-else class="llx-dim">Enter an input and an output price.</span>
            <span v-if="hasPrices(s) && days > 0" class="llx-dim llx-num">≈ {{ llmUsd(results[i].costUsd / days * 30.4375) }} a month at this pace</span>
          </div>
        </article>
        <button v-if="scenarios.length < 4" class="llx-scenario llx-scenario--add" data-testid="scenario-add" @click="addScenario"><LlmIcon name="plus" />Another scenario</button>
      </div>

      <div class="llx-sim__breakeven">
        <label class="llx-field llx-field--inline"><span>Compare with a flat fee of</span>
          <input v-model.number="flatFee" class="llx-input llx-input--sm" type="number" min="0" step="1" :placeholder="airFee ? String(airFee) : '0'" aria-label="Flat monthly fee" /><span>USD a month</span></label>
        <span v-for="(s, i) in scenarios" :key="s.id" class="llx-dim">
          <template v-if="hasPrices(s) && breakEven[i] != null"><b :style="{ color: `var(${COLORS[i]})` }">{{ s.name }}</b>: the fee wins above {{ llmCompact(breakEven[i]) }} tokens a month; this traffic is {{ llmCompact(monthlyTokens) }}.</template>
        </span>
      </div>

      <div v-if="anyPriced" class="llx-chartcell">
        <h3>Per day: what it cost, and what it would have</h3>
        <TelChart :t0="data.days?.[0]?.day ?? data.from" :step="86_400_000" :series="daySeries" unit="num" label="Cost per day" :height="160" />
      </div>

      <div class="llx-tablewrap">
        <table class="llx-table" data-testid="sim-groups">
          <thead>
            <tr>
              <th class="l">{{ GROUP_LABELS[groupBy] }}</th><th>Calls</th><th>Fresh input</th><th>Cached</th><th>Output</th><th>Actual</th>
              <th v-for="(s, i) in scenarios" :key="s.id" :style="{ color: `var(${COLORS[i]})` }">{{ s.name }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="g in (data.groups ?? []).slice(0, 30)" :key="g.key">
              <td class="l llx-truncate" :class="{ 'llx-mono': groupBy === 'model' }">{{ g.label }}</td>
              <td class="llx-num">{{ llmCompact(g.buckets.calls) }}</td>
              <td class="llx-num">{{ llmCompact(g.buckets.inputTokens) }}</td>
              <td class="llx-num">{{ llmCompact(g.buckets.cacheReadTokens) }}</td>
              <td class="llx-num">{{ llmCompact(g.buckets.outputTokens) }}</td>
              <td class="llx-num">{{ llmUsd(g.buckets.actualCostUsd) }}</td>
              <td v-for="s in scenarios" :key="s.id" class="llx-num">{{ hasPrices(s) ? llmUsd(simulateCost(g.buckets, { ...s, monthlyFee: null }).costUsd) : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="llx-note">{{ data.note }} A monthly fee is spread over the window’s days. Per-group figures leave the fee out.</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, inject, reactive, ref } from 'vue';
import TelChart from '~/components/ApiTelemetry/TelChart.vue';
import { useLlmRead, type KliveLlmConsole } from '~/composables/useKliveLlm';
import { blankScenario, breakEvenTokens, llmCompact, llmInt, llmUsd, qs, simulateCost, type SimBuckets, type SimScenario } from '~/scripts/kliveLlm';

const props = defineProps<{ prices: any[] }>();
const c = inject<KliveLlmConsole>('llx')!;

const COLORS = ['--tel-s2', '--tel-s3', '--tel-s5', '--tel-s7'];
const GROUP_LABELS: Record<string, string> = { lane: 'Lane', service: 'Service', router: 'Router', model: 'Model' };
const range = ref<'7d' | '30d' | '90d' | 'page'>('30d');
const groupBy = ref<'lane' | 'service' | 'router' | 'model'>('lane');
const picked = ref<string[]>([]);

const lanes = computed<any[]>(() => c.routing.value?.lanes ?? []);
const services = computed<string[]>(() => c.routing.value?.services ?? []);
const pickLabel = (p: string) => {
  if (p.startsWith('s:')) return `${p.slice(2)} (all lanes)`;
  const l = lanes.value.find(x => x.key === p.slice(2));
  return l ? `${l.service} › ${l.label}` : p.slice(2);
};
function pick(value: string) { if (value && !picked.value.includes(value)) picked.value = [...picked.value, value]; }
/** Services become their lanes, so a service and another service's lane can be picked together. */
const laneFilter = computed(() => {
  const keys = new Set<string>();
  for (const p of picked.value) {
    if (p.startsWith('l:')) keys.add(p.slice(2));
    else for (const l of lanes.value.filter(x => x.service === p.slice(2))) keys.add(l.key);
  }
  return [...keys];
});

const read = useLlmRead(c, () => `/klivellm/simulator${qs({ ...(range.value === 'page' ? c.params.value : { range: range.value }), groupBy: groupBy.value, lane: laneFilter.value })}`);
const data = computed<any>(() => read.value.value);
const totals = computed<SimBuckets & { reasoningTokens?: number }>(() => data.value?.totals ?? { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, calls: 0, unmeasuredPromptTokens: 0, actualCostUsd: 0 });
const days = computed(() => (data.value ? Math.max(1 / 24, (Math.min(data.value.to, Date.now()) - data.value.from) / 86_400_000) : 0));

// ── scenarios ──
let nextId = 1;
const scenarios = reactive<SimScenario[]>([blankScenario('s0', 'Scenario A')]);
function addScenario() { scenarios.push(blankScenario(`s${nextId++}`, `Scenario ${String.fromCharCode(65 + scenarios.length)}`)); }
const hasPrices = (s: SimScenario) => typeof s.input === 'number' && typeof s.output === 'number';
const anyPriced = computed(() => scenarios.some(hasPrices));
const results = computed(() => scenarios.map(s => simulateCost(totals.value, s, days.value)));
const ratioText = (cost: number) => {
  const actual = totals.value.actualCostUsd;
  if (!actual) return '';
  const r = cost / actual;
  return r >= 1 ? `${r.toFixed(r >= 10 ? 0 : 1)}× the actual` : `${Math.round((1 - r) * 100)}% less than the actual`;
};
const priced = computed(() => props.prices.filter(p => typeof p.inputPerMTok === 'number' && typeof p.outputPerMTok === 'number').slice(0, 400));
const fmtPrice = (v: number) => (v < 1 ? v.toFixed(3) : v.toFixed(2));
function load(s: SimScenario, key: string) {
  const p = priced.value.find(x => `${x.router}|${x.model}` === key);
  if (!p) return;
  s.input = p.inputPerMTok;
  s.output = p.outputPerMTok;
  s.cachedInput = p.cachedInputPerMTok ?? null;
  s.cacheWrite = p.cacheWritePerMTok ?? null;
  if (/^Scenario [A-D]$/.test(s.name)) s.name = p.model.split('/').pop() ?? p.model;
}

// ── break-even and the day chart ──
const airFee = computed(() => (c.routers.value?.routers ?? []).find((r: any) => r.id === 'airouter')?.monthlyFeeUsd ?? null);
const flatFee = ref<number | null>(null);
const fee = computed(() => (typeof flatFee.value === 'number' && Number.isFinite(flatFee.value) ? flatFee.value : Number(airFee.value ?? 0)));
const monthlyTokens = computed(() => days.value > 0 ? ((totals.value.inputTokens + totals.value.cacheReadTokens + totals.value.outputTokens) / days.value) * 30.4375 : 0);
const breakEven = computed(() => scenarios.map(s => (hasPrices(s) && fee.value > 0 ? breakEvenTokens(s, fee.value, totals.value) : null)));
const daySeries = computed(() => {
  const list: any[] = data.value?.days ?? [];
  const out: any[] = [{ key: 'actual', label: 'Actual', values: list.map(d => d.buckets.actualCostUsd), color: '--tel-s1', kind: 'bar' }];
  scenarios.forEach((s, i) => {
    if (!hasPrices(s)) return;
    out.push({ key: s.id, label: s.name, values: list.map(d => simulateCost(d.buckets, s, 1).costUsd), color: COLORS[i] });
  });
  return out;
});
</script>
