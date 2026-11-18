<template>
  <section id="cs2x-model" class="cs2x-card" aria-label="Exit model and trade locks" data-testid="cs2-exit-model">
    <header class="cs2x-card__head">
      <h2 class="cs2x-card__title"><CS2Icon name="lock" />Exit model &amp; trade locks</h2>
      <span class="cs2x-card__meta">{{ isRealDate(locks?.timeline.measuredUtc) ? `measured ${fmtAgo(locks?.timeline.measuredUtc, now)}` : '' }}</span>
      <div class="cs2x-card__tools">
        <div class="cs2x-seg" role="group" aria-label="Section">
          <button v-for="t in tabs" :key="t.id" class="cs2x-seg__opt" :aria-pressed="tab === t.id" @click="tab = t.id">{{ t.label }}</button>
        </div>
      </div>
    </header>
    <div v-if="!locks" class="cs2x-empty">{{ model ? 'This bot build does not report the exit model.' : 'No engine data yet.' }}</div>
    <div v-else class="cs2x-card__body">
      <template v-if="tab === 'locks'">
        <div class="cs2x-kv"><span>Valve trade protection</span><strong>7 days, lifts {{ pad2(locks.timeline.protectionEndsAtUtcHour) }}:00 UTC</strong></div>
        <div class="cs2x-kv"><span>A purchase now is sellable</span><strong>{{ unlock.inDays }} · {{ unlock.at }}</strong></div>
        <div class="cs2x-kv"><span>Relist sale → spendable cash</span><strong>{{ fmtDays(locks.timeline.csfloatSaleToCashDays) }}</strong></div>
        <div class="cs2x-kv"><span>Steam sale → CSFloat cash</span><strong>{{ fmtDays(locks.timeline.steamSaleToCashDays) }}</strong></div>
        <div class="cs2x-kv"><span>Converters' Steam hold</span><strong>{{ fmtDays(locks.timeline.converterHoldDays) }} · {{ fmtSignedPct(locks.converterHoldGrowth - 1) }} · σ {{ fmtPct(locks.converterHoldSigma) }}</strong></div>
        <div class="cs2x-kv"><span>CSFloat selling</span><strong :class="locks.csfloatSellingPaused ? 'cs2x-down' : 'cs2x-up'">{{ locks.csfloatSellingPaused ? 'Paused (away)' : 'Active' }}</strong></div>
        <div class="cs2x-kv"><span>Steam wallet room</span><strong>{{ locks.steamWalletHeadroomGbp != null ? fmtGbp(locks.steamWalletHeadroomGbp) : 'unknown (no Steam login)' }}</strong></div>
        <p class="cs2x-note" style="margin-top: 8px">
          Measured from this account's last {{ fmtCount(locks.timeline.purchasesObserved) }} purchases and {{ fmtCount(locks.timeline.salesObserved) }} sales:
          sellers hand over in {{ fmtHours(locks.timeline.handoverHours) }}, {{ fmtPct(locks.timeline.purchaseCancelRate) }} of purchases fell through.
        </p>
      </template>
      <template v-else-if="tab === 'economics'">
        <div class="cs2x-kv"><span>Cost of tied-up money</span><strong>{{ model?.settings ? `${(model.settings.CapitalCostPerDay * 100).toFixed(2)}% a day` : '—' }}</strong></div>
        <div class="cs2x-kv"><span>Risk aversion γ</span><strong>{{ fmtNumber(model?.settings?.RiskAversion, 1) }}</strong></div>
        <div class="cs2x-kv"><span>Relist horizon</span><strong>{{ model?.settings ? `${model.settings.RelistHorizonDays} days` : '—' }}</strong></div>
        <div class="cs2x-kv"><span>Live relists</span><strong>{{ model?.autoManageRelists === false ? 'Advice only' : 'Managed automatically' }}</strong></div>
        <div class="cs2x-kv"><span>Relist bar</span><strong>{{ bars.relist }}</strong></div>
        <div class="cs2x-kv"><span>Steam bar</span><strong :class="steamOff ? 'cs2x-down' : ''">{{ bars.steam }}</strong><em v-if="steamOff">Steam exit effectively off</em></div>
        <div class="cs2x-kv"><span>Minimum profit</span><strong>{{ bars.profit }}</strong></div>
        <h3 class="cs2x-sub" style="margin-top: 12px">Market drift <span class="cs2x-faint" style="text-transform: none; letter-spacing: 0">· per 30 days</span></h3>
        <div v-for="row in drift" :key="row.category" class="cs2x-kv">
          <span>{{ row.label }}</span><strong :class="row.down ? 'cs2x-down' : ''">{{ row.value }}</strong><em>{{ row.observations }} obs</em>
        </div>
      </template>
      <template v-else>
        <div class="cs2x-kv"><span>Relist time vs prediction</span><strong>×{{ fmtNumber(model?.calibration?.RelistTimeMultiplier, 2) }}</strong><em>{{ model?.calibration?.RelistSales ?? 0 }}/{{ model?.calibration?.RelistEpisodes ?? 0 }} sold</em></div>
        <div class="cs2x-kv"><span>Purchase forecasts vs sale</span><strong>Steam {{ fmtSignedPct(Math.exp(model?.calibration?.SteamForecastBiasLog ?? 0) - 1) }} · CSFloat {{ fmtSignedPct(Math.exp(model?.calibration?.CSFloatForecastBiasLog ?? 0) - 1) }}</strong></div>
        <div class="cs2x-kv"><span>Realised ÷ expected cash</span><strong>{{ model?.calibration?.RealisedVsExpected != null ? fmtPct(model.calibration.RealisedVsExpected) : '—' }}</strong><em>{{ model?.calibration?.CompletedPositions ?? 0 }} finished</em></div>
        <div class="cs2x-kv"><span>Forecast checks within ±1σ</span><strong>{{ model?.market?.coverageWithinOneSigma != null ? fmtPct(model.market.coverageWithinOneSigma) : '—' }}</strong><em>68% is honest · {{ fmtCount(model?.market?.forecastChecks) }} checks</em></div>
        <p class="cs2x-note" style="margin-top: 8px">Each figure starts at "the model was right" and moves as the bot's own trades come in.</p>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import CS2Icon from '~/components/CS2/Icon.vue';
import { CATEGORY_LABELS, fmtAgo, fmtCount, fmtDateTime, fmtDays, fmtGbp, fmtNumber, isRealDate, steamExitOff, type Cs2ExitModelStatus } from '~/scripts/cs2Arbitrage';

const props = defineProps<{ model: Cs2ExitModelStatus | null; settings: Record<string, any> | null | undefined; now: number }>();
const tabs = [{ id: 'locks', label: 'Locks' }, { id: 'economics', label: 'Economics' }, { id: 'record', label: 'Calibration' }] as const;
const tab = ref<(typeof tabs)[number]['id']>('locks');

const locks = computed(() => props.model?.locks ?? null);
const steamOff = computed(() => steamExitOff(props.settings));
const bars = computed(() => {
  const e = props.settings?.Evaluation ?? {};
  return {
    relist: e.MinimumRelistRoiPercent != null ? `${e.MinimumRelistRoiPercent}%` : '—',
    steam: e.MinimumSteamRoiPercent != null ? `${e.MinimumSteamRoiPercent}%` : '—',
    profit: e.MinimumProfitPence != null ? `${e.MinimumProfitPence}p` : '—',
  };
});

/** When an item bought right now could first be sold: handover, Valve's 7 days to the boundary, plus the bot's hour. */
const unlock = computed(() => {
  const t = locks.value?.timeline;
  if (!t) return { inDays: '—', at: '—' };
  const delivered = props.now + t.handoverHours * 3_600_000;
  const earliest = new Date(delivered + 7 * 86_400_000);
  const boundary = Date.UTC(earliest.getUTCFullYear(), earliest.getUTCMonth(), earliest.getUTCDate(), t.protectionEndsAtUtcHour);
  const lifts = boundary >= earliest.getTime() ? boundary : boundary + 86_400_000;
  const sellable = lifts + 3_600_000;
  return { inDays: fmtDays((sellable - props.now) / 86_400_000), at: fmtDateTime(new Date(sellable).toISOString()) };
});

const drift = computed(() => Object.entries((props.model?.market?.driftPerDay ?? {}) as Record<string, number>).map(([category, perDay]) => {
  const monthly = Math.exp(Number(perDay) * 30) - 1;
  return { category, label: CATEGORY_LABELS[category] ?? category, value: fmtSignedPct(monthly), down: monthly <= -0.03, observations: props.model?.market?.observations?.[category] ?? 0 };
}));

const pad2 = (n?: number | null) => (typeof n === 'number' ? String(n).padStart(2, '0') : '—');
const fmtPct = (f?: number | null, digits = 1) => (typeof f === 'number' && Number.isFinite(f) ? `${(f * 100).toFixed(digits)}%` : '—');
const fmtSignedPct = (f?: number | null) => (typeof f === 'number' && Number.isFinite(f) ? `${f >= 0 ? '+' : '−'}${Math.abs(f * 100).toFixed(1)}%` : '—');
const fmtHours = (h?: number | null) => (typeof h !== 'number' || !Number.isFinite(h) ? '—' : h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${h.toFixed(1)} h`);
</script>
