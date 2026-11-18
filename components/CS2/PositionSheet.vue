<template>
  <Teleport to="body">
    <div v-if="position" class="cs2x-layer">
      <div class="cs2x-scrim cs2x-scrim--side" @pointerdown.self="emit('close')">
        <aside ref="sheet" class="cs2x-sheet" role="dialog" aria-modal="true" :aria-label="position.ItemMarketHashName" data-testid="cs2x-sheet" tabindex="-1" @keydown="onKey">
          <header class="cs2x-sheet__head">
            <img v-if="image" :src="image" alt="" class="cs2x-sheet__img">
            <span v-else class="cs2x-sheet__img" style="display: grid; place-items: center; color: var(--x-ink-4)"><CS2Icon name="box" /></span>
            <div style="min-width: 0">
              <h2 class="cs2x-sheet__title">{{ position.ItemMarketHashName }}</h2>
              <div class="cs2x-sheet__sub">
                <span class="cs2x-pill" :data-tone="tone">{{ stageMeta(position.CurrentStrategicStage).label }}</span>
                <span class="cs2x-route" :data-route="route === 'CSFloatRelist' ? 'relist' : 'steam'">{{ route === 'CSFloatRelist' ? 'CSFloat relist' : 'Steam' }}</span>
                <span v-if="index >= 0" class="cs2x-faint">{{ index + 1 }} / {{ total }}</span>
              </div>
            </div>
            <div style="display: flex; gap: 2px">
              <button class="cs2x-iconbtn" aria-label="Previous position ([)" :disabled="index <= 0" @click="emit('step', -1)"><CS2Icon name="chevron-left" /></button>
              <button class="cs2x-iconbtn" aria-label="Next position (])" :disabled="index >= total - 1" @click="emit('step', 1)"><CS2Icon name="chevron-right" /></button>
              <button class="cs2x-iconbtn" aria-label="Close (Esc)" @click="emit('close')"><CS2Icon name="x" /></button>
            </div>
          </header>

          <div class="cs2x-sheet__body">
            <CS2StageTrack :stage="position.CurrentStrategicStage" :planned-exit="position.PlannedExit" />

            <a v-if="position.CurrentStrategicStage === 2 && position.CSFloatToSteamTradeOfferLink" :href="position.CSFloatToSteamTradeOfferLink" target="_blank" rel="noopener" class="cs2x-btn cs2x-btn--primary" style="align-self: flex-start">
              Accept the trade offer in Steam<CS2Icon name="external" />
            </a>

            <p v-if="lock" class="cs2x-callout" :data-tone="lock.tone" data-testid="cs2-lock-note"><strong>{{ lock.title }}</strong> {{ lock.detail }}</p>
            <p v-if="liveRow?.lastSaleFailure" class="cs2x-callout" data-tone="warn"><strong>Last sale attempt:</strong> {{ liveRow.lastSaleFailure }}</p>
            <p v-if="liveRow?.waitingForSteamLoginSinceUtc" class="cs2x-callout" data-tone="warn"><strong>Waiting for the Steam login</strong> since {{ fmtDateTime(liveRow.waitingForSteamLoginSinceUtc) }}.</p>

            <dl class="cs2x-facts">
              <div><dt>Paid</dt><dd>{{ fmtGbp(positionCostGbp(position)) }}<span v-if="position.PurchasePriceCents" class="cs2x-dim"> · {{ fmtCents(position.PurchasePriceCents) }}</span></dd></div>
              <div><dt>Expected back</dt><dd>{{ position.ExpectedNetCashPence ? fmtPence(position.ExpectedNetCashPence) : '—' }}</dd></div>
              <div><dt>Expected profit</dt><dd :class="(position.ExpectedAbsoluteProfitInPounds ?? 0) >= 0 ? 'cs2x-up' : 'cs2x-down'">{{ fmtSignedGbp(position.ExpectedAbsoluteProfitInPounds) }} <span class="cs2x-dim">{{ fmtNumber(position.ExpectedProfitPercentage, 1) }}%</span></dd></div>
              <div v-if="position.CurrentStrategicStage === 7"><dt>Made</dt><dd :class="(position.ActualAbsoluteProfitInPounds ?? 0) >= 0 ? 'cs2x-up' : 'cs2x-down'">{{ fmtSignedGbp(position.ActualAbsoluteProfitInPounds) }} <span class="cs2x-dim">{{ fmtNumber(position.ActualProfitPercentage, 1) }}%</span></dd></div>
              <div v-if="position.CSFloatResalePriceCents"><dt>{{ position.CurrentStrategicStage === 7 ? 'Sold for' : 'Relisted at' }}</dt><dd>{{ fmtCents(position.CSFloatResalePriceCents) }}</dd></div>
              <div v-if="position.ActualSalePriceOnSteam"><dt>Steam sale</dt><dd>{{ fmtGbp(position.ActualSalePriceOnSteam) }}</dd></div>
              <div v-if="position.ItemFloatValue"><dt>Float</dt><dd class="cs2x-mono">{{ fmtNumber(position.ItemFloatValue, 6) }}</dd></div>
              <div v-if="position.ConversionCoefficientAtPurchase"><dt>k at purchase</dt><dd>{{ fmtNumber(position.ConversionCoefficientAtPurchase, 3) }}</dd></div>
              <div v-if="position.LastTradeState"><dt>CSFloat trade</dt><dd class="cs2x-mono" style="font-size: 12px">{{ position.LastTradeState }}</dd></div>
              <div v-if="position.PurchaseSource"><dt>Found by</dt><dd>{{ position.PurchaseSource }}</dd></div>
            </dl>

            <template v-if="position.CurrentStrategicStage === 9">
              <h3 class="cs2x-sub">Relist</h3>
              <dl class="cs2x-facts" data-testid="cs2-relist-state">
                <div><dt>Up for</dt><dd>{{ isRealDate(position.ListedOnCSFloatAtUtc) ? fmtCountdown(position.ListedOnCSFloatAtUtc, now) : '—' }}</dd></div>
                <div><dt>Re-priced</dt><dd>{{ position.RelistRepriceCount ?? 0 }}×</dd></div>
                <div><dt>Expected to sell in</dt><dd>{{ fmtDays(position.RelistBaseDaysToSell) }}</dd></div>
                <div><dt>Unsold evidence</dt><dd :class="(position.RelistTotalExposure ?? 0) >= RELIST_OVERDUE_EXPECTED_SALES ? 'cs2x-down' : ''">{{ fmtNumber(position.RelistTotalExposure, 1) }} expected sales passed</dd></div>
                <div v-if="isRealDate(position.NextExitReviewUtc)"><dt>Next review</dt><dd>{{ fmtAgo(position.NextExitReviewUtc, now) }}</dd></div>
              </dl>
            </template>

            <template v-if="decision">
              <h3 class="cs2x-sub">Exit decision <span class="cs2x-faint" style="text-transform: none; letter-spacing: 0">· {{ decisionLabel(decision) }} · {{ fmtAgo(decision.AtUtc, now) }}</span></h3>
              <div class="cs2x-decision" data-testid="cs2-exit-decision">
                <div class="cs2x-decision__route">
                  <span class="cs2x-route" :data-route="decision.Route === 'CSFloatRelist' ? 'relist' : 'steam'">{{ routeName(decision.Route) }}</span>
                  <strong>{{ fmtDecisionPrice(decision) }}</strong>
                  <span v-if="decision.Route === 'CSFloatRelist'" class="cs2x-dim">~{{ fmtDays(decision.ExpectedDaysToSell) }} to sell · {{ fmtProbability(decision.SellProbability) }} within the horizon</span>
                </div>
                <div class="cs2x-kv"><span>Worth now</span><strong>{{ fmtPence(decision.CertaintyEquivalentPence) }}</strong></div>
                <div class="cs2x-kv"><span>Steam exit</span><strong>{{ decision.SteamCertaintyEquivalentPence ? fmtPence(decision.SteamCertaintyEquivalentPence) : 'n/a' }}</strong></div>
                <div class="cs2x-kv"><span>Relist exit</span><strong>{{ decision.RelistCertaintyEquivalentPence ? fmtPence(decision.RelistCertaintyEquivalentPence) : 'n/a' }}</strong></div>
                <div v-if="decision.SalesPerDay" class="cs2x-kv"><span>CSFloat demand</span><strong :title="decision.SalesRateBasis">{{ fmtNumber(decision.SalesPerDay, 2) }} sales/day</strong></div>
                <div v-if="decision.MedianValueRatio" class="cs2x-kv"><span>Buyers pay</span><strong>~{{ Math.round(decision.MedianValueRatio * 100) }}% of value</strong></div>
                <div v-if="decision.DemandMultiplier < 0.95" class="cs2x-kv"><span>Demand marked down to</span><strong class="cs2x-down">{{ Math.round(decision.DemandMultiplier * 100) }}%</strong></div>
                <p class="cs2x-decision__why">{{ decision.Rationale }}</p>
              </div>
            </template>

            <template v-if="events.length">
              <h3 class="cs2x-sub">Timeline</h3>
              <ul class="cs2x-timeline">
                <li v-for="e in events" :key="e.label" :class="{ 'is-future': e.future }"><span>{{ e.label }}</span><span>{{ fmtDateTime(e.at) }}</span></li>
              </ul>
            </template>

            <template v-if="position.Notes">
              <h3 class="cs2x-sub">Notes</h3>
              <p class="cs2x-notes">{{ position.Notes }}</p>
            </template>

            <div class="cs2x-links">
              <a class="cs2x-link" :href="position.comparison?.CSFloatURL || csfloatListingUrl(position.CSFloatListingID)" target="_blank" rel="noopener">Bought from (CSFloat)</a>
              <a v-if="position.CSFloatResaleListingID" class="cs2x-link" :href="csfloatListingUrl(position.CSFloatResaleListingID)" target="_blank" rel="noopener">Our relist</a>
              <a class="cs2x-link" :href="steamListingUrl(position.ItemMarketHashName)" target="_blank" rel="noopener">Steam market</a>
            </div>
          </div>

          <footer v-if="canManage && isOpenPurchase(position)" class="cs2x-sheet__actions">
            <button v-if="position.CurrentStrategicStage === 9 && position.CSFloatResaleListingID" class="cs2x-btn cs2x-btn--sm" :disabled="checking" data-testid="sheet-recheck" @click="emit('recheck', position.CSFloatListingID)">
              <CS2Icon :name="checking ? 'refresh' : 'search'" :class="{ 'cs2x-spin': checking }" />Check on CSFloat
            </button>
            <button class="cs2x-btn cs2x-btn--sm" data-testid="sheet-close" @click="emit('close-position', position.CSFloatListingID)"><CS2Icon name="check" />Close by hand…</button>
            <span class="cs2x-note" style="align-self: center; margin-left: auto">Only for positions settled outside the bot.</span>
          </footer>
        </aside>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import CS2Icon from '~/components/CS2/Icon.vue';
import CS2StageTrack from '~/components/CS2/StageTrack.vue';
import {
  RELIST_OVERDUE_EXPECTED_SALES, csfloatListingUrl, currentRoute, decisionLabel, fmtAgo, fmtCents, fmtCountdown, fmtDateTime, fmtDays,
  fmtDecisionPrice, fmtGbp, fmtNumber, fmtPence, fmtProbability, fmtSignedGbp, isOpenPurchase, isRealDate, latestDecision, lockNote,
  positionCostGbp, positionTimeline, routeName, stageMeta, steamListingUrl, type Cs2Purchase, type Cs2StatusPosition,
} from '~/scripts/cs2Arbitrage';

const props = defineProps<{
  position: Cs2Purchase | null;
  liveRow: Cs2StatusPosition | null;
  index: number;
  total: number;
  now: number;
  canManage: boolean;
  checking: boolean;
}>();
const emit = defineEmits<{ close: []; step: [delta: number]; recheck: [id: string]; 'close-position': [id: string] }>();
const sheet = ref<HTMLElement | null>(null);

const image = computed(() => props.position?.comparison?.CSFloatListing?.ImageURL);
const route = computed(() => (props.position ? currentRoute(props.position) : 'SteamMarket'));
const tone = computed(() => ({ good: 'ok', danger: 'crit', warning: 'warn', info: 'info', neutral: 'neutral' } as Record<string, string>)[stageMeta(props.position?.CurrentStrategicStage ?? 0).tone]);
const lock = computed(() => (props.position ? lockNote(props.position, props.now) : null));
const decision = computed(() => (props.position ? latestDecision(props.position) : null));
const events = computed(() => (props.position ? positionTimeline(props.position, props.now) : []));

watch(() => props.position?.CSFloatListingID, async (id) => {
  if (!id) return;
  await nextTick();
  sheet.value?.focus();
});

function onKey(event: KeyboardEvent) {
  if ((event.target as HTMLElement)?.closest('input, textarea')) return;
  if (event.key === 'Escape') { event.preventDefault(); emit('close'); }
  else if (event.key === '[' || event.key === 'ArrowUp') { event.preventDefault(); emit('step', -1); }
  else if (event.key === ']' || event.key === 'ArrowDown') { event.preventDefault(); emit('step', 1); }
}
</script>
