<template>
  <div class="dpl-plan" data-testid="dpl-plan" :aria-busy="loading || undefined">
    <header class="dpl-plan__head">
      <button class="dpl-iconbtn" aria-label="Back to the list" title="Back (Esc)" data-testid="dpl-plan-back" @click="emit('back')"><DeployIcon name="chevron-left" /></button>
      <div class="dpl-plan__title">
        <h3 class="dpl-truncate" :title="plan?.StrategyName ?? name">{{ plan?.StrategyName ?? name ?? 'Strategy' }}</h3>
        <div v-if="plan" class="dpl-plan__tags">
          <span class="dpl-chip" :data-tone="plan.Candidate ? statusTone(plan.Candidate.Status) : 'neutral'">
            {{ sourceLabel(plan.Source) }}{{ plan.Candidate ? ` · ${plan.Candidate.Status}${plan.Candidate.Score != null ? ` ${Math.round(plan.Candidate.Score)}` : ''}` : '' }}
          </span>
          <span class="dpl-chip">{{ shapeLabel(plan.Shape, plan.Basket.length) }}</span>
          <span v-if="plan.StrategyVersion" class="dpl-chip" :title="plan.Candidate ? 'The version the Alpha Lab tested; later edits will not change it' : ''">v{{ plan.StrategyVersion }}{{ plan.Candidate ? ' pinned' : '' }}</span>
          <NuxtLink v-if="plan.Candidate" class="dpl-link" :to="`/omnitrader/research?tab=candidates&candidate=${plan.Candidate.Id}`">Evidence <DeployIcon name="external" /></NuxtLink>
          <NuxtLink v-else-if="studioId" class="dpl-link" :to="`/omnitrader/studio?id=${studioId}`">Studio <DeployIcon name="external" /></NuxtLink>
        </div>
      </div>
    </header>

    <div v-if="error" class="dpl-note" data-tone="crit"><DeployIcon name="octagon-x" />{{ error }}</div>
    <div v-if="!plan && !error" class="dpl-skeleton" aria-busy="true"><span v-for="i in 5" :key="i"></span></div>

    <template v-if="plan">
      <p v-if="plan.Candidate?.Hypothesis || plan.Description" class="dpl-plan__hyp">{{ plan.Candidate?.Hypothesis || plan.Description }}</p>

      <div class="dpl-verdict-line" :data-tone="verdictTone" data-testid="dpl-plan-verdict">
        <DeployIcon :name="plan.Verdict === 'blocked' ? 'octagon-x' : plan.Verdict === 'caution' ? 'alert' : 'check-circle'" />
        <b>{{ plan.VerdictTitle }}</b>
      </div>

      <!-- what it runs on: filled in, every choice explained -->
      <section class="dpl-runs" aria-label="Runs on">
        <div class="dpl-runs__cell">
          <span class="dpl-label">Market</span>
          <template v-if="plan.Shape === 'single'">
            <label class="dpl-select">
              <span class="dpl-sr">Symbol</span>
              <select :value="plan.Symbol" aria-label="Symbol" data-testid="dpl-plan-symbol" @change="emit('override', { symbol: ($event.target as HTMLSelectElement).value })">
                <option v-for="c in plan.SymbolChoices" :key="c.Symbol" :value="c.Symbol">
                  {{ c.Symbol }}{{ c.Tested ? (c.Sharpe != null ? ` · Sharpe ${numText(c.Sharpe, 2)}` : ' · tested') : ' · untested' }}{{ c.Primary ? ' · main' : '' }}
                </option>
              </select>
            </label>
            <button v-if="!customSymbol" class="dpl-linkbtn" type="button" @click="customSymbol = true">Another symbol…</button>
            <form v-else class="dpl-inline" @submit.prevent="applySymbol">
              <input v-model="symbolDraft" class="dpl-input dpl-input--sm dpl-mono" placeholder="e.g. SOLUSDT, AAPL" aria-label="Another symbol" />
              <button class="dpl-btn dpl-btn--xs" type="submit">Use</button>
            </form>
          </template>
          <template v-else>
            <b class="dpl-mono">{{ plan.Shape === 'basket' ? `${plan.Basket.length} symbols` : 'Top coins by volume' }}</b>
            <span class="dpl-hint dpl-mono">{{ plan.Shape === 'basket' ? plan.Basket.join(' · ') : `regime: ${plan.Symbol}` }}</span>
          </template>
          <span class="dpl-hint">{{ assetLabel(plan.AssetClass) }} · {{ plan.Feed }}</span>
        </div>

        <div class="dpl-runs__cell">
          <span class="dpl-label">Bars</span>
          <div class="dpl-seg" role="group" aria-label="Bar interval">
            <button v-for="i in plan.IntervalChoices" :key="i" class="dpl-seg__opt" :aria-pressed="plan.Interval === i" :data-testid="`dpl-interval-${i}`" @click="emit('override', { interval: i })">
              {{ intervalLabel(i) }}<DeployIcon v-if="i === plan.EvaluatedInterval" name="check" class="dpl-seg__tick" />
            </button>
          </div>
          <span class="dpl-hint">{{ plan.EvaluatedInterval ? `Tested on ${intervalLabel(plan.EvaluatedInterval)} bars (ticked)` : 'No tested interval on record' }}</span>
        </div>

        <div class="dpl-runs__cell">
          <span class="dpl-label">Money</span>
          <div class="dpl-seg" role="group" aria-label="Mode">
            <button
              v-for="m in plan.Modes"
              :key="m.Mode"
              class="dpl-seg__opt"
              :aria-pressed="plan.Mode === m.Mode"
              :disabled="(!m.Allowed && plan.Mode !== m.Mode) || (m.Mode === 'Live' && !canLive)"
              :title="!m.Allowed ? m.Reason ?? '' : m.Mode === 'Live' && !canLive ? 'Your profile cannot deploy live' : m.Mode === 'Paper' ? 'Simulated money against live prices' : 'Real money on Kraken (starts disarmed)'"
              :data-testid="`dpl-mode-${m.Mode}`"
              @click="emit('override', { mode: m.Mode })"
            >{{ m.Mode === 'Paper' ? 'Paper' : 'Live' }}<DeployIcon v-if="!m.Allowed" name="lock" class="dpl-seg__tick" /></button>
          </div>
          <span class="dpl-hint">{{ liveReason ?? (plan.Mode === 'Paper' ? 'Simulated money, real prices' : 'Real money; starts disarmed') }}</span>
        </div>

        <div class="dpl-runs__cell">
          <span class="dpl-label">Capital</span>
          <div class="dpl-seg" role="group" aria-label="Capital">
            <button v-for="c in plan.CapitalChoices" :key="c" class="dpl-seg__opt" :aria-pressed="plan.Capital === c" @click="emit('override', { capital: c })">{{ compactMoney(c) }}</button>
          </div>
          <form class="dpl-inline" @submit.prevent="applyCapital">
            <input v-model.number="capitalDraft" class="dpl-input dpl-input--sm dpl-mono" type="number" min="10" step="10" aria-label="Capital" data-testid="dpl-plan-capital" />
            <button class="dpl-btn dpl-btn--xs" type="submit" :disabled="!capitalDraft || capitalDraft === plan.Capital">Set</button>
          </form>
        </div>
      </section>

      <!-- the evidence it is deployed on -->
      <section v-if="plan.Evaluated" class="dpl-evidence" aria-label="Backtest evidence">
        <div class="dpl-stat"><small>Return</small><b :data-tone="signTone(plan.Evaluated.ReturnPct)">{{ signedPctText(plan.Evaluated.ReturnPct, 1) }}</b><span>{{ plan.Evaluated.CagrPct != null ? `${signedPctText(plan.Evaluated.CagrPct, 1)} a year` : '' }}</span></div>
        <div class="dpl-stat"><small>Sharpe</small><b>{{ numText(plan.Evaluated.Sharpe, 2) }}</b><span v-if="plan.Evaluated.OosSharpe != null">out of sample {{ numText(plan.Evaluated.OosSharpe, 2) }}</span></div>
        <div class="dpl-stat"><small>Worst fall</small><b>{{ pctText(plan.Evaluated.MaxDrawdownPct, 1) }}</b><span>from a peak</span></div>
        <div class="dpl-stat"><small>Trades</small><b>{{ plan.Evaluated.Trades ?? '—' }}</b><span v-if="plan.Evaluated.Bars">in {{ plan.Evaluated.Bars }} bars</span></div>
        <div class="dpl-stat"><small>2× costs</small><b :data-tone="signTone(plan.Evaluated.StressedReturnPct)">{{ signedPctText(plan.Evaluated.StressedReturnPct, 1) }}</b><span>if fees doubled</span></div>
      </section>

      <section v-if="plan.Expect.Lines.length" class="dpl-expect" aria-label="What to expect">
        <h4 class="dpl-label">What to expect</h4>
        <ul><li v-for="line in plan.Expect.Lines" :key="line">{{ line }}</li></ul>
      </section>

      <section class="dpl-checks" aria-label="Checks" data-testid="dpl-plan-checks">
        <div v-for="c in plan.Checks" :key="c.Id" class="dpl-check" :data-level="c.Level" :data-testid="`dpl-check-${c.Id}`">
          <DeployIcon :name="c.Level === 'block' ? 'octagon-x' : c.Level === 'warn' ? 'alert' : c.Level === 'pass' ? 'check' : 'info'" />
          <span class="dpl-check__text"><b>{{ c.Title }}</b><span v-if="c.Detail">{{ c.Detail }}</span></span>
        </div>
      </section>

      <details class="dpl-advanced" :open="advancedOpen" @toggle="advancedOpen = ($event.target as HTMLDetailsElement).open">
        <summary><DeployIcon name="sliders" />Advanced <span class="dpl-dim">· costs, inputs{{ plan.Risk ? ', live caps' : '' }}; already set as tested</span></summary>
        <div class="dpl-advanced__body">
          <div class="dpl-formgrid">
            <label class="dpl-fieldset">
              <span class="dpl-label">Fee per trade</span>
              <input v-model.number="draft.FeePct" class="dpl-input dpl-input--sm dpl-mono" type="number" step="0.01" min="0" max="5" />
              <span class="dpl-hint">% · {{ plan.Costs.Name }}<template v-if="plan.Costs.EvaluatedFee != null">; tested at {{ numText(plan.Costs.EvaluatedFee * 100, 2) }} %</template></span>
            </label>
            <label class="dpl-fieldset">
              <span class="dpl-label">Slippage</span>
              <input v-model.number="draft.SlipPct" class="dpl-input dpl-input--sm dpl-mono" type="number" step="0.01" min="0" max="5" />
              <span class="dpl-hint">% of price per fill</span>
            </label>
            <label class="dpl-fieldset">
              <span class="dpl-label">History at start</span>
              <input v-model.number="draft.HistoryBars" class="dpl-input dpl-input--sm dpl-mono" type="number" step="50" min="50" max="3000" />
              <span class="dpl-hint">bars{{ plan.Expect.WarmupBars ? `; inputs look back ~${plan.Expect.WarmupBars}` : '' }}</span>
            </label>
            <div class="dpl-fieldset">
              <span class="dpl-label">Fills</span>
              <b class="dpl-mono">{{ plan.Execution === 'NextOpen' ? 'next bar open' : 'signal bar close' }}</b>
              <span class="dpl-hint">{{ plan.Execution === 'NextOpen' ? 'as the lab tested' : 'live orders go out as each bar closes' }}</span>
            </div>
          </div>

          <template v-if="plan.Risk">
            <h4 class="dpl-label" style="margin-top: 12px">Live caps (enforced on every order)</h4>
            <div class="dpl-formgrid">
              <label class="dpl-fieldset"><span class="dpl-label">Max per order</span><input v-model.number="draft.MaxPosition" class="dpl-input dpl-input--sm dpl-mono" type="number" min="1" /><span class="dpl-hint">USD; set to the capital</span></label>
              <label class="dpl-fieldset"><span class="dpl-label">Max daily loss</span><input v-model.number="draft.MaxDailyLoss" class="dpl-input dpl-input--sm dpl-mono" type="number" min="1" /><span class="dpl-hint">USD, then it stops</span></label>
              <label class="dpl-fieldset"><span class="dpl-label">Orders an hour</span><input v-model.number="draft.MaxOrders" class="dpl-input dpl-input--sm dpl-mono" type="number" min="1" max="500" /></label>
            </div>
          </template>

          <template v-if="specs.length">
            <h4 class="dpl-label" style="margin-top: 12px">Strategy inputs <span class="dpl-dim">({{ changedParams ? `${changedParams} changed from tested` : 'as tested' }})</span></h4>
            <div class="dpl-formgrid">
              <label v-for="p in specs" :key="p.Name" class="dpl-fieldset" :title="p.Help ?? ''">
                <span class="dpl-label">{{ p.Label }}</span>
                <select v-if="p.Options?.length" v-model="params[p.Name]" class="dpl-input dpl-input--sm"><option v-for="o in p.Options" :key="o" :value="o">{{ o }}</option></select>
                <input v-else-if="p.Type === 'bool'" v-model="params[p.Name]" type="checkbox" />
                <input v-else-if="p.Type === 'int' || p.Type === 'double' || p.Type === 'decimal'" v-model.number="params[p.Name]" class="dpl-input dpl-input--sm dpl-mono" type="number" :step="p.Step ?? 'any'" :min="p.Min ?? undefined" :max="p.Max ?? undefined" />
                <input v-else v-model="params[p.Name]" class="dpl-input dpl-input--sm dpl-mono" />
                <span v-if="isChanged(p)" class="dpl-hint" data-tone="warn">tested at {{ String(p.Default) }}</span>
              </label>
            </div>
            <button v-if="changedParams" class="dpl-linkbtn" type="button" @click="resetParams">Back to the tested inputs</button>
          </template>
        </div>
      </details>

      <footer class="dpl-plan__foot">
        <span class="dpl-dim dpl-plan__label dpl-truncate" :title="plan.Label">{{ plan.Label }}</span>
        <button
          class="dpl-btn"
          :class="plan.Mode === 'Live' ? 'dpl-btn--danger' : 'dpl-btn--primary'"
          :disabled="!canDeploy || plan.Verdict === 'blocked' || busy || loading"
          :title="!canDeploy ? 'Your profile cannot create deployments' : plan.Verdict === 'blocked' ? plan.VerdictTitle : ''"
          data-testid="dpl-plan-deploy"
          @click="emit('deploy', body())"
        >
          <DeployIcon :name="plan.Mode === 'Live' ? 'bolt' : 'rocket'" />{{ busy ? 'Deploying…' : plan.Mode === 'Live' ? 'Deploy live (disarmed)…' : 'Deploy on paper…' }}
        </button>
      </footer>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  assetLabel, compactMoney, intervalLabel, numText, pctText, shapeLabel, signTone, signedPctText, sourceLabel, statusTone,
  type DeployPlan, type ParamSpec, type PlanOverrides, type PlanRequestBody,
} from '~/scripts/deployConsole';

/**
 * A deployment, filled in from the evidence it carries. The server builds and checks it; this shows it,
 * lets the few decisions that matter (market, bars, money, capital) be changed (each change re-plans on
 * the server), and keeps everything else under Advanced, already set to what was tested.
 */
const props = defineProps<{ plan: DeployPlan | null; name?: string; loading?: boolean; busy?: boolean; error?: string; canDeploy: boolean; canLive: boolean }>();
const emit = defineEmits<{ override: [o: PlanOverrides]; deploy: [body: PlanRequestBody]; back: [] }>();

const customSymbol = ref(false);
const symbolDraft = ref('');
const capitalDraft = ref<number | null>(null);
const advancedOpen = ref(false);
const params = reactive<Record<string, any>>({});
const draft = reactive({ FeePct: 0, SlipPct: 0, HistoryBars: 500, MaxPosition: 100, MaxDailyLoss: 50, MaxOrders: 30 });

const specs = computed<ParamSpec[]>(() => props.plan?.ParameterSpecs ?? []);
const studioId = computed(() => {
  const m = /^studio:([^@]+)/.exec(props.plan?.StrategyClass ?? '');
  return m ? m[1] : null;
});
const verdictTone = computed(() => (props.plan?.Verdict === 'blocked' ? 'crit' : props.plan?.Verdict === 'caution' ? 'warn' : 'ok'));
const liveReason = computed(() => {
  const live = props.plan?.Modes.find(m => m.Mode === 'Live');
  return live && !live.Allowed ? live.Reason ?? null : null;
});

watch(() => props.plan, p => {
  if (!p) return;
  capitalDraft.value = p.Capital;
  draft.FeePct = round(p.Request.FeeFraction * 100, 4);
  draft.SlipPct = round(p.Request.SlippageFraction * 100, 4);
  draft.HistoryBars = p.Request.HistoryBars ?? p.Expect.HistoryBars;
  draft.MaxPosition = p.Request.MaxPositionQuoteUsd ?? p.Risk?.MaxPositionQuoteUsd ?? 100;
  draft.MaxDailyLoss = p.Request.MaxDailyLossUsd ?? p.Risk?.MaxDailyLossUsd ?? 50;
  draft.MaxOrders = p.Request.MaxOrdersPerHour ?? p.Risk?.MaxOrdersPerHour ?? 30;
  // Keep edited inputs across a re-plan of the same strategy; reset them for a different one.
  const keep = Object.keys(params).length && specs.value.every(s => s.Name in params);
  if (!keep) {
    for (const key of Object.keys(params)) delete params[key];
    for (const s of p.ParameterSpecs) params[s.Name] = p.Request.Parameters[s.Name] ?? s.Default;
  }
}, { immediate: true });

function round(v: number, d: number) { const f = 10 ** d; return Math.round(v * f) / f; }

function isChanged(p: ParamSpec) {
  const v = params[p.Name];
  return v !== undefined && v !== '' && String(v) !== String(p.Default);
}
const changedParams = computed(() => specs.value.filter(isChanged).length);
function resetParams() { for (const s of specs.value) params[s.Name] = s.Default; }

function applySymbol() {
  const s = symbolDraft.value.trim().toUpperCase();
  if (!s) return;
  customSymbol.value = false;
  symbolDraft.value = '';
  emit('override', { symbol: s });
}

function applyCapital() {
  if (capitalDraft.value && capitalDraft.value > 0) emit('override', { capital: capitalDraft.value });
}

/** The server's request with the Advanced edits applied. */
function body(): PlanRequestBody {
  const p = props.plan!;
  const req: PlanRequestBody = JSON.parse(JSON.stringify(p.Request));
  req.FeeFraction = Math.max(0, Number(draft.FeePct) || 0) / 100;
  req.SlippageFraction = Math.max(0, Number(draft.SlipPct) || 0) / 100;
  req.HistoryBars = Math.min(3000, Math.max(50, Math.round(Number(draft.HistoryBars) || p.Expect.HistoryBars)));
  for (const s of specs.value) if (params[s.Name] !== undefined && params[s.Name] !== '') req.Parameters[s.Name] = params[s.Name];
  if (req.Mode === 'Live') {
    req.MaxPositionQuoteUsd = Number(draft.MaxPosition) || p.Risk?.MaxPositionQuoteUsd;
    req.MaxDailyLossUsd = Number(draft.MaxDailyLoss) || p.Risk?.MaxDailyLossUsd;
    req.MaxOrdersPerHour = Number(draft.MaxOrders) || p.Risk?.MaxOrdersPerHour;
  }
  const changed = specs.value.filter(isChanged).map(s => s.Name);
  if (changed.length) req.Origin = { ...req.Origin, ChangedInputs: changed };
  return req;
}
</script>
