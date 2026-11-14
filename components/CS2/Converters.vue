<template>
  <section id="cs2x-conversion" class="cs2x-card" aria-label="Conversion" data-testid="cs2x-conversion">
    <header class="cs2x-card__head">
      <h2 class="cs2x-card__title"><CS2Icon name="swap" />Steam → CSFloat</h2>
      <span class="cs2x-card__meta">{{ status?.conversion?.computedAtUtc ? `model ${fmtAgo(status.conversion.computedAtUtc, now)}` : 'default (no model yet)' }}</span>
    </header>
    <div class="cs2x-card__body">
      <div class="cs2x-k">
        <b :data-tone="kTone" :style="{ color: `var(--tone)` }">{{ fmtNumber(k, 3) }}</b>
        <span>CSFloat £ back per Steam £. The Steam exit pays only when Steam's bid beats CSFloat by {{ breakEven }}× after fees.</span>
      </div>
      <p class="cs2x-note" style="margin-bottom: 8px">{{ status?.conversion?.basis || plan?.ConversionBasis || '' }}</p>
      <table v-if="rows.length" class="cs2x-table">
        <thead><tr><th>Converter</th><th class="num" title="Buy on Steam at most">Buy ≤</th><th class="num" title="CSFloat £ back per Steam £">Back</th><th class="num" title="CSFloat sales in 7 days">7 d</th></tr></thead>
        <tbody>
          <tr v-for="c in rows" :key="c.name" :title="`${c.name}: buy on Steam at ${fmtGbp(c.buyAt)}, sells on CSFloat for ${fmtGbp(c.sellsFor)}`">
            <td style="max-width: 150px"><a class="cs2x-truncate" style="display: block" :href="steamListingUrl(c.name)" target="_blank" rel="noopener">{{ c.name }}</a></td>
            <td class="num">{{ fmtGbp(c.buyAt) }}</td>
            <td class="num" :class="(c.k ?? 0) >= 0.85 ? 'cs2x-up' : ''">{{ c.k != null ? `${Math.round(c.k * 100)}%` : '—' }}</td>
            <td class="num cs2x-dim">{{ c.sales ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else class="cs2x-empty" style="min-height: 60px">The conversion model has not produced a plan yet (it runs every 3 hours).</div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import CS2Icon from '~/components/CS2/Icon.vue';
import { fmtAgo, fmtGbp, fmtNumber, steamListingUrl, type Cs2Plan, type Cs2Status } from '~/scripts/cs2Arbitrage';

const props = defineProps<{ status: Cs2Status | null; plan: Cs2Plan | null; now: number }>();
const k = computed(() => props.status?.conversion?.coefficient ?? props.plan?.ConversionCoefficientUsed ?? null);
const kTone = computed(() => (k.value == null ? 'neutral' : k.value >= 0.85 ? 'ok' : k.value >= 0.7 ? 'neutral' : 'warn'));
/** Steam bid ÷ CSFloat price needed to break even on the Steam exit: Steam's ~15% fee ÷ k. */
const breakEven = computed(() => (k.value && k.value > 0 ? (1.15 / k.value).toFixed(2) : '—'));
const rows = computed(() => {
  const verified = new Map<string, any>((props.status?.conversion?.topConverters ?? []).map((c: any) => [c.MarketHashName, c]));
  return (props.plan?.Top10Gaps ?? [])
    .map((g) => {
      const name = g.csfloatContainer?.MarketHashName ?? g.steamListing?.Name ?? '';
      const v = verified.get(name);
      return { name, buyAt: g.IdealPriceToPurchaseOnSteamInPounds ?? g.steamListing?.CheapestSellOrderPriceInPounds, sellsFor: g.csfloatContainer?.PriceInPounds, k: v?.Coefficient ?? g.ReturnCoefficientFromSteamToCSFloatTaxIncluded ?? null, sales: v?.CSFloatSales7d ?? null };
    })
    .filter((r) => r.name)
    .sort((a, b) => (b.k ?? 0) - (a.k ?? 0))
    .slice(0, 6);
});
</script>
