<template>
  <Teleport to="body">
    <div v-if="open" class="dpl-layer">
      <div class="dpl-scrim dpl-scrim--sheet" @pointerdown.self="emit('close')">
        <aside class="dpl-sheet" role="dialog" aria-modal="true" :aria-label="title" data-testid="dpl-sheet" @keydown.esc.stop.prevent="emit('close')">
          <header class="dpl-sheet__head">
            <div style="flex: 1; min-width: 0">
              <h2 class="dpl-sheet__title dpl-truncate" :title="title">{{ title }}</h2>
              <p class="dpl-sheet__sub">
                <span class="dpl-mode" :data-mode="row?.Mode" :data-armed="row?.Armed || undefined">{{ row?.Mode === 'Live' ? (row?.Armed ? 'LIVE' : 'live') : 'paper' }}</span>
                {{ market }} · {{ intervalLabel(row?.Interval) }} · {{ row?.Status }}
                <span class="dpl-dim dpl-mono">{{ row?.Id.slice(0, 8) }}</span>
              </p>
            </div>
            <button ref="closeBtn" class="dpl-iconbtn" aria-label="Close" @click="emit('close')"><DeployIcon name="x" /></button>
          </header>

          <div class="dpl-sheet__body">
            <div v-if="row?.Mode === 'Live' && row?.Armed" class="dpl-note" data-tone="crit"><DeployIcon name="bolt" /><span><b>Armed.</b> It can place real orders on Kraken now.</span></div>
            <div v-if="error" class="dpl-note" data-tone="warn"><DeployIcon name="alert" />{{ error }}</div>

            <div class="dpl-verdict-line" :data-tone="health.Tone" data-testid="dpl-sheet-health">
              <DeployIcon :name="health.Tone === 'crit' ? 'octagon-x' : health.Tone === 'warn' ? 'alert' : health.Tone === 'ok' ? 'check-circle' : 'info'" />
              <b>{{ health.Title }}</b><span v-if="health.Detail" class="dpl-dim">{{ health.Detail }}</span>
            </div>

            <section class="dpl-evidence">
              <div class="dpl-stat"><small>Equity</small><b>{{ moneyText(row?.EquityCurrent) }}</b><span>from {{ moneyText(row?.EquityInitial) }}</span></div>
              <div class="dpl-stat"><small>Return</small><b :data-tone="signTone(row?.PnLPercent)">{{ signedPctText(row?.PnLPercent, 2) }}</b><span>{{ row ? spanText(now - (toMillis(row.CreatedUtc) ?? now)) : '' }} live</span></div>
              <div class="dpl-stat"><small>Backtest pace</small><b>{{ expected == null ? '—' : signedPctText(expected, 2) }}</b><span>{{ expected == null ? 'no evidence on record' : `vs ${signedPctText(row?.PnLPercent, 2)} live` }}</span></div>
              <div class="dpl-stat"><small>Bars seen</small><b>{{ health.BarsTotal ?? '—' }}</b><span>{{ health.LastBarUtc ? `newest ${agoText(health.LastBarUtc, now)}` : 'none yet' }}</span></div>
              <div class="dpl-stat"><small>Orders</small><b>{{ health.Orders ?? trades.length }}</b><span>{{ health.Filled ?? 0 }} filled<template v-if="health.Rejected"> · {{ health.Rejected }} refused</template></span></div>
            </section>

            <section class="dpl-sheet__chart" aria-label="Equity">
              <div class="dpl-sheet__charthead">
                <h3 class="dpl-label">Equity</h3>
                <span class="dpl-legend"><i data-k="live"></i>live<template v-if="pace.length"> <i data-k="pace"></i>backtest pace</template></span>
              </div>
              <DeployCurve v-if="curve.length > 1" :live="curve" :pace="pace" :base="row?.EquityInitial ?? null" :height="150" :tone="signTone(row?.PnLPercent)" readout :format="v => moneyText(v)" />
              <div v-else class="dpl-empty dpl-empty--short">{{ equity == null ? 'Reading its equity…' : 'No bars recorded yet.' }}</div>
            </section>

            <section v-if="holdings.length || detail?.Book" aria-label="Holdings">
              <h3 class="dpl-label">Holding now <span class="dpl-dim">{{ detail?.Book ? `· cash ${moneyText(detail.Book.Quote)} · fees ${moneyText(detail.Book.Fees)}` : '' }}</span></h3>
              <div v-if="!holdings.length" class="dpl-dim dpl-small">Nothing: all in cash.</div>
              <div v-else class="dpl-minitable">
                <div class="dpl-mt-row dpl-mt-row--head"><span>Symbol</span><span class="dpl-num">Quantity</span><span class="dpl-num">Avg price</span><span class="dpl-num">Since</span></div>
                <div v-for="h in holdings" :key="h.Symbol" class="dpl-mt-row">
                  <span class="dpl-mono">{{ h.Symbol }}</span>
                  <span class="dpl-num dpl-mono" :data-tone="h.Qty < 0 ? 'crit' : undefined">{{ numText(h.Qty, 6) }}</span>
                  <span class="dpl-num dpl-mono">{{ h.AveragePrice ? numText(h.AveragePrice, 4) : '—' }}</span>
                  <span class="dpl-num dpl-dim">{{ h.OpenedUtc && !h.OpenedUtc.startsWith('0001') ? agoText(h.OpenedUtc, now) : '—' }}</span>
                </div>
              </div>
            </section>

            <section aria-label="Orders">
              <h3 class="dpl-label">Orders <span class="dpl-dim">· newest first{{ trades.length >= 100 ? ', last 100' : '' }}</span></h3>
              <div v-if="!trades.length" class="dpl-dim dpl-small">{{ detail ? 'No orders yet.' : 'Reading…' }}</div>
              <div v-else class="dpl-minitable" data-testid="dpl-sheet-trades">
                <div class="dpl-mt-row dpl-mt-row--head dpl-mt-row--trades"><span>Side</span><span>Symbol</span><span class="dpl-num">Qty</span><span class="dpl-num">Fill price</span><span class="dpl-num">Fee</span><span class="dpl-num">When</span></div>
                <div v-for="t in trades.slice(0, 40)" :key="t.Id" class="dpl-mt-row dpl-mt-row--trades" :title="t.Error ?? t.Status">
                  <span><b :data-tone="t.Side === 'buy' ? 'ok' : 'crit'">{{ t.Side }}</b><span v-if="t.Status === 'Rejected'" class="dpl-chip" data-tone="warn">refused</span></span>
                  <span class="dpl-mono">{{ t.Symbol }}</span>
                  <span class="dpl-num dpl-mono">{{ numText(t.FilledQty || t.Qty, 6) }}</span>
                  <span class="dpl-num dpl-mono">{{ t.Price != null ? numText(t.Price, 4) : t.Status === 'Filled' ? 'not recorded' : '—' }}</span>
                  <span class="dpl-num dpl-mono">{{ t.Fee ? numText(t.Fee, 4) : '—' }}</span>
                  <span class="dpl-num dpl-dim" :title="dateText(t.PlacedUtc)">{{ agoText(t.PlacedUtc, now) }}</span>
                </div>
              </div>
            </section>

            <section aria-label="Configuration">
              <h3 class="dpl-label">Runs with</h3>
              <dl class="dpl-kv">
                <dt>Strategy</dt><dd class="dpl-mono">{{ detail?.Deployment.StrategyClass ?? row?.StrategyClass }}</dd>
                <dt>Market</dt><dd>{{ market }}</dd>
                <dt>Costs</dt><dd>{{ config ? `${numText((config.FeeFraction ?? 0) * 100, 2)} % fee · ${numText((config.SlippageFraction ?? 0) * 100, 2)} % slippage` : '—' }}</dd>
                <dt>Fills</dt><dd>{{ detail?.Execution === 'NextOpen' ? 'next bar open' : 'signal bar close' }}</dd>
                <dt>Leverage</dt><dd>{{ config?.Margin?.Leverage ?? 1 }}×</dd>
                <template v-if="config?.HistoryBars"><dt>History</dt><dd>{{ config.HistoryBars }} bars at start</dd></template>
                <template v-if="config?.Caps"><dt>Live caps</dt><dd>{{ config.Caps.MaxPositionQuoteUsd }} per order · {{ config.Caps.MaxDailyLossUsd }} daily loss · {{ config.Caps.MaxOrdersPerHour }}/h</dd></template>
                <template v-if="paramText"><dt>Inputs</dt><dd class="dpl-mono dpl-small">{{ paramText }}</dd></template>
                <template v-if="origin"><dt>From</dt><dd>
                  {{ sourceLabel(origin.Source) }}<template v-if="origin.CandidateId">
                    · <NuxtLink class="dpl-link" :to="`/omnitrader/research?tab=candidates&candidate=${origin.CandidateId}`">{{ origin.CandidateId }} ({{ origin.CandidateStatus }}{{ origin.Score != null ? ` ${Math.round(origin.Score)}` : '' }})</NuxtLink>
                  </template><template v-if="origin.StrategyVersion"> · v{{ origin.StrategyVersion }}</template>
                </dd></template>
                <template v-if="origin?.Evaluated"><dt>Tested</dt><dd>{{ intervalLabel(origin.Evaluated.Interval) }} · {{ signedPctText(origin.Evaluated.ReturnPct, 1) }} · Sharpe {{ numText(origin.Evaluated.Sharpe, 2) }} · max DD {{ pctText(origin.Evaluated.MaxDrawdownPct, 1) }} · {{ origin.Evaluated.Trades }} trades</dd></template>
                <dt>Created</dt><dd>{{ dateText(row?.CreatedUtc) }}</dd>
                <template v-if="health.LastError"><dt>Last error</dt><dd class="dpl-small" data-tone="crit">{{ health.LastError }}</dd></template>
              </dl>
            </section>
          </div>

          <footer class="dpl-sheet__foot">
            <button v-if="row?.Mode === 'Live' && !row.Armed && row.Status !== 'Stopped' && canGoLive" class="dpl-btn dpl-btn--danger" :disabled="!!busy" @click="emit('arm')"><DeployIcon name="bolt" />Arm…</button>
            <button v-if="row?.Status === 'Running' && canControl" class="dpl-btn" :disabled="!!busy" @click="emit('act', 'pause')"><DeployIcon name="pause" />Pause</button>
            <button v-else-if="row?.Mode === 'Paper' && row?.Status !== 'Running' && canControl" class="dpl-btn" :disabled="!!busy" @click="emit('act', 'resume')"><DeployIcon name="play" />{{ row?.Status === 'Paused' ? 'Resume' : 'Start again' }}</button>
            <span style="flex: 1"></span>
            <button v-if="row && row.Status !== 'Stopped' && canManage" class="dpl-btn dpl-btn--danger" :disabled="!!busy" @click="emit('act', 'kill')"><DeployIcon name="stop" />Stop</button>
            <button v-else-if="row && canManage" class="dpl-btn dpl-btn--ghost" :disabled="!!busy" @click="emit('act', 'delete')"><DeployIcon name="trash" />Remove…</button>
          </footer>
        </aside>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  agoText, dateText, equityWithPace, expectedReturnPct, healthOf, intervalLabel, moneyText, numText, pctText, signTone, signedPctText, sourceLabel, spanText, toMillis,
  type Deployment, type DeploymentDetail, type EquityPoint,
} from '~/scripts/deployConsole';

/** One deployment in full: how it is doing against its backtest, what it holds, what it has done. */
const props = defineProps<{
  open: boolean; row: Deployment | null; detail: DeploymentDetail | null; equity: EquityPoint[] | null; error?: string; now: number; busy?: string | null;
  canControl: boolean; canManage: boolean; canGoLive: boolean;
}>();
const emit = defineEmits<{ close: []; act: [action: 'pause' | 'resume' | 'kill' | 'delete']; arm: [] }>();
const closeBtn = ref<HTMLElement | null>(null);

watch(() => props.open, async open => { if (open) { await nextTick(); closeBtn.value?.focus(); } });

const title = computed(() => props.detail?.StrategyName ?? props.row?.StrategyName ?? props.row?.StrategyClass ?? 'Deployment');
const health = computed(() => props.detail?.Health ?? (props.row ? healthOf(props.row) : { State: '', Tone: 'neutral', Title: '' } as any));
const config = computed(() => props.detail?.Deployment.Config ?? null);
const origin = computed<any>(() => config.value?.Origin ?? props.row?.Origin ?? null);
const market = computed(() => {
  const o = origin.value;
  if (o?.Shape === 'basket' || props.row?.Shape === 'basket') return `basket led by ${props.row?.Symbol}`;
  if (o?.Shape === 'universe') return `coin universe (${props.row?.Symbol} regime)`;
  return props.row?.Symbol ?? '';
});
const trades = computed(() => props.detail?.Trades ?? []);
const holdings = computed(() => props.detail?.Book?.Holdings ?? []);
const expected = computed(() => (props.row ? expectedReturnPct(props.row, props.now) : null));
const series = computed(() => equityWithPace(props.equity ?? [], props.row?.EquityInitial ?? 0, origin.value?.Evaluated?.CagrPct));
const curve = computed(() => series.value.live);
const pace = computed(() => series.value.pace);
const paramText = computed(() => {
  const p = config.value?.Parameters;
  if (!p) return '';
  return Object.entries(p).filter(([k]) => k !== 'TradeSymbol').map(([k, v]) => `${k} ${v}`).join(' · ');
});
</script>
