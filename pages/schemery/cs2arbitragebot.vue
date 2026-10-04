<template>
  <div class="cs2-shell">
    <!-- Command bar -->
    <header class="cs2-commandbar">
      <div class="cs2-identity">
        <NuxtLink to="/schemes" class="cs2-back" aria-label="Back to schemes">←</NuxtLink>
        <span class="cs2-wordmark">CS2 Arbitrage</span>
        <span class="cs2-health" :class="`is-${health.tone}`">
          <span class="cs2-health__dot" aria-hidden="true" />
          {{ health.label }}
        </span>
        <span v-if="status?.settings" class="cs2-chip" :class="status.settings.PurchasingEnabled ? 'is-good' : 'is-muted'">
          {{ status.settings.PurchasingEnabled ? 'Auto-buy on' : 'Alerts only' }}
        </span>
        <span class="cs2-freshness" aria-live="polite">{{ freshness }}</span>
      </div>
      <div class="cs2-actions">
        <DashboardAction v-if="isKlives" label="Settings" icon="⚙" @click="settingsOpen = true" />
        <DashboardAction label="Scan now" icon="⌕" :disabled="scanPending" tone="primary" @click="runScan" />
        <DashboardAction :label="loadingFast || loadingSlow ? 'Refreshing' : 'Refresh'" icon="↻" :disabled="loadingFast || loadingSlow" @click="refreshAll" />
      </div>
    </header>

    <!-- Attention -->
    <section class="cs2-attention" aria-labelledby="cs2-attention-title">
      <div class="cs2-attention__label">
        <span id="cs2-attention-title">Attention</span>
        <strong v-if="attention.length">{{ attention.length }}</strong>
      </div>
      <div v-if="attention.length" class="cs2-attention__items">
        <component
          :is="item.href ? 'a' : 'div'"
          v-for="item in attention"
          :key="item.key"
          class="cs2-attention__item"
          :class="`is-${item.tone}`"
          :href="item.href"
          :target="item.href ? '_blank' : undefined"
          :rel="item.href ? 'noopener' : undefined"
        >
          <strong>{{ item.title }}</strong>
          <span>{{ item.detail }}</span>
        </component>
      </div>
      <div v-else class="cs2-attention__clear">Nothing needs you right now.</div>
    </section>

    <!-- KPIs -->
    <section class="cs2-kpis" aria-label="Key figures">
      <DashboardKpi label="CSFloat balance" :value="fmtCents(csfloatUsdCents)" :detail="fmtGbp(status?.balances?.csfloatGbp)" tone="info" />
      <DashboardKpi label="Steam wallet" :value="fmtGbp(status?.balances?.steamGbp ?? latestBalance?.SteamUsableBalanceInPounds)" detail="converts back via plan" />
      <DashboardKpi label="Conversion k" :value="fmtNumber(status?.conversion?.coefficient, 3)" :detail="conversionAge" :tone="kTone" />
      <DashboardKpi label="Listings seen" :value="fmtCount(engine?.ListingsSeen)" :detail="engine ? `${fmtNumber(engine.ObservedListingsPerMinute, 0)}/min in window` : ''" />
      <DashboardKpi label="Valued" :value="fmtCount(engine?.Evaluated)" :detail="prefilterShare" />
      <DashboardKpi label="Opportunities" :value="fmtCount(engine?.Opportunities)" :detail="`${fmtCount(analytics?.QualifiedOpportunities)} all-time`" :tone="(engine?.Opportunities ?? 0) > 0 ? 'good' : 'neutral'" />
      <DashboardKpi label="Purchases" :value="fmtCount(analytics?.Purchases ?? purchases.length)" :detail="`${fmtCount(analytics?.PurchaseAttempts)} attempts`" />
      <DashboardKpi label="Open positions" :value="fmtCount(openPurchases.length)" :detail="actionCount ? `${actionCount} need you` : 'none waiting on you'" :tone="actionCount ? 'warning' : 'neutral'" />
    </section>

    <div class="cs2-grid">
      <!-- Pipeline -->
      <DashboardPanel
        class="span-4"
        title="Live pipeline"
        :subtitle="engine?.State ? `Engine ${engine.State}` : 'Engine status'"
        :status="engine?.State === 'running' ? 'live' : ''"
        :loading="loadingFast && !status"
        :error="zoneError(paths.status)"
      >
        <div v-if="engine" class="cs2-pipeline">
          <div class="cs2-stage-row">
            <span class="cs2-stage-row__name">Listing feed</span>
            <span class="cs2-stage-row__value">{{ fmtAgo(engine.LastFeedPollUtc, now) }}</span>
            <span class="cs2-stage-row__detail">every {{ fmtNumber(engine.CurrentFeedIntervalSeconds, 0) }}s · {{ fmtCount(engine.FeedPolls) }} polls · {{ engine.FeedCoverageGaps }} gaps</span>
          </div>
          <div class="cs2-stage-row">
            <span class="cs2-stage-row__name">Discount sweeps</span>
            <span class="cs2-stage-row__value">{{ fmtAgo(engine.LastSweepUtc, now) }}</span>
            <span class="cs2-stage-row__detail">price cuts on older listings</span>
          </div>
          <div class="cs2-stage-row">
            <span class="cs2-stage-row__name">Whole-market scan</span>
            <span class="cs2-stage-row__value">{{ fmtAgo(engine.LastStructuralScanUtc, now) }}</span>
            <span class="cs2-stage-row__detail" :title="engine.LastStructuralSummary">{{ engine.LastStructuralSummary || 'hourly' }}</span>
          </div>
          <div class="cs2-stage-row">
            <span class="cs2-stage-row__name">Conversion model</span>
            <span class="cs2-stage-row__value">{{ fmtAgo(engine.LastConversionModelUtc ?? status?.conversion?.computedAtUtc, now) }}</span>
            <span class="cs2-stage-row__detail">every 3h</span>
          </div>

          <h3 class="cs2-subhead">Request budgets</h3>
          <div v-for="bucket in budgets" :key="bucket.Name" class="cs2-meter">
            <span class="cs2-meter__name">CSFloat {{ bucket.Name }}</span>
            <span class="cs2-meter__bar"><span :style="{ width: `${bucket.pct}%` }" :class="bucket.tone" /></span>
            <span class="cs2-meter__value">{{ bucket.Remaining }}/{{ bucket.Limit }}</span>
          </div>
          <div v-if="status?.steam" class="cs2-meter">
            <span class="cs2-meter__name">Steam order books</span>
            <span class="cs2-meter__bar"><span :style="{ width: `${steamHealthPct}%` }" :class="steamHealthPct > 90 ? 'good' : steamHealthPct > 60 ? 'warning' : 'danger'" /></span>
            <span class="cs2-meter__value">{{ fmtCount(status.steam.Successes) }} ok</span>
          </div>
          <p class="cs2-footnote">
            {{ fmtCount(status?.steam?.cachedBooks) }} Steam books cached · {{ fmtNumber(status?.steam?.pacerIntervalMs, 0) }}ms spacing ·
            {{ fmtCount(status?.bulkSteamPrices?.Count) }} bulk prices
          </p>
        </div>
        <div v-else class="cs2-empty">{{ status?.startupState ? `Bot is ${status.startupState}.` : 'No engine data yet.' }}</div>
      </DashboardPanel>

      <!-- Opportunities -->
      <DashboardPanel
        class="span-8"
        title="Opportunities"
        subtitle="Listings within 10 points of a buy bar, newest first"
        :loading="loadingFast && !opportunities.length"
        :error="zoneError(paths.opportunities)"
      >
        <template #actions>
          <div class="cs2-segment" role="tablist" aria-label="Filter opportunities">
            <button v-for="f in oppFilters" :key="f.id" type="button" role="tab" :aria-selected="oppFilter === f.id" :class="{ active: oppFilter === f.id }" @click="oppFilter = f.id">
              {{ f.label }} <span>{{ f.count }}</span>
            </button>
          </div>
        </template>
        <div v-if="filteredOpportunities.length" class="cs2-table-wrap">
          <table class="cs2-table">
            <thead>
              <tr>
                <th>Seen</th>
                <th>Item</th>
                <th class="num">Price</th>
                <th class="num">Steam bid / ask</th>
                <th>Best exit</th>
                <th class="num">Return</th>
                <th class="num">Profit</th>
                <th>Verdict</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="o in filteredOpportunities" :key="o.ListingId + o.EvaluatedAtUtc" :class="{ 'is-buy': o.ShouldBuy }">
                <td class="muted">{{ fmtAgo(o.EvaluatedAtUtc, now) }}</td>
                <td class="item">
                  <a :href="csfloatListingUrl(o.ListingId)" target="_blank" rel="noopener">{{ o.MarketHashName }}</a>
                  <span v-if="o.FloatValue != null" class="muted"> · {{ fmtNumber(o.FloatValue, 4) }}</span>
                  <span class="muted"> · {{ o.Source }}</span>
                </td>
                <td class="num">{{ fmtCents(o.PriceCents) }}</td>
                <td class="num muted">
                  <a v-if="o.SteamHighestBuyOrderPence" :href="steamListingUrl(o.MarketHashName)" target="_blank" rel="noopener">{{ fmtPence(o.SteamHighestBuyOrderPence) }} / {{ fmtPence(o.SteamLowestSellOrderPence) }}</a>
                  <span v-else>—</span>
                </td>
                <td>{{ routeName(o.BestRoute) }}</td>
                <td class="num" :class="`tone-${roiTone(o.BestRoi)}`">{{ fmtRoi(o.BestRoi) }}</td>
                <td class="num">{{ fmtPence(o.BestProfitPence) }}</td>
                <td class="verdict" :title="o.Reason">
                  <span class="cs2-pill" :class="o.ShouldBuy ? 'is-good' : 'is-muted'">{{ o.ShouldBuy ? 'Buy' : 'Skip' }}</span>
                  {{ shortReason(o) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="cs2-empty">
          {{ opportunities.length ? 'Nothing in this filter.' : 'No near-misses yet. Real deals are rare and short-lived — the feed is watching every new listing.' }}
        </div>
      </DashboardPanel>

      <!-- Positions -->
      <DashboardPanel
        class="span-7"
        title="Positions"
        :subtitle="`${openPurchases.length} open · ${purchases.length} total`"
        :loading="loadingSlow && !analytics"
        :error="zoneError(paths.analytics)"
      >
        <template #actions>
          <div class="cs2-segment" role="tablist" aria-label="Filter positions">
            <button type="button" role="tab" :aria-selected="showAllPositions === false" :class="{ active: !showAllPositions }" @click="showAllPositions = false">Open <span>{{ openPurchases.length }}</span></button>
            <button type="button" role="tab" :aria-selected="showAllPositions" :class="{ active: showAllPositions }" @click="showAllPositions = true">All <span>{{ purchases.length }}</span></button>
          </div>
        </template>
        <div v-if="visiblePurchases.length" class="cs2-positions">
          <button
            v-for="p in visiblePurchases"
            :key="p.CSFloatListingID"
            type="button"
            class="cs2-position"
            :class="{ active: selected?.CSFloatListingID === p.CSFloatListingID }"
            @click="selectedId = p.CSFloatListingID"
          >
            <img v-if="p.comparison?.CSFloatListing?.ImageURL" :src="p.comparison.CSFloatListing.ImageURL" alt="" class="cs2-position__img" loading="lazy">
            <span v-else class="cs2-position__img cs2-position__img--empty" aria-hidden="true" />
            <span class="cs2-position__main">
              <span class="cs2-position__name">{{ p.ItemMarketHashName }}</span>
              <span class="cs2-position__meta">
                <span class="cs2-pill" :class="`is-${stageMeta(p.CurrentStrategicStage).tone}`">{{ stageMeta(p.CurrentStrategicStage).short }}</span>
                {{ exitLabel(p) }} · bought {{ fmtAgo(p.TimeOfPurchase, now) }}
              </span>
            </span>
            <span class="cs2-position__track"><CS2StageTrack :stage="p.CurrentStrategicStage" :planned-exit="p.PlannedExit" compact /></span>
            <span class="cs2-position__money">
              <strong>{{ positionCost(p) }}</strong>
              <span :class="`tone-${profitTone(p)}`">{{ positionProfit(p) }}</span>
            </span>
          </button>
        </div>
        <div v-else class="cs2-empty">{{ purchases.length ? 'No open positions.' : 'No purchases yet.' }}</div>
      </DashboardPanel>

      <!-- Position detail -->
      <DashboardPanel class="span-5" title="Position detail" :subtitle="selected ? selected.CSFloatListingID : 'Select a position'">
        <div v-if="selected" class="cs2-detail">
          <div class="cs2-detail__head">
            <img v-if="selected.comparison?.CSFloatListing?.ImageURL" :src="selected.comparison.CSFloatListing.ImageURL" alt="" class="cs2-detail__img">
            <div class="cs2-detail__title">
              <strong>{{ selected.ItemMarketHashName }}</strong>
              <span :class="`tone-${stageMeta(selected.CurrentStrategicStage).tone}`">{{ stageMeta(selected.CurrentStrategicStage).label }}</span>
            </div>
          </div>
          <CS2StageTrack :stage="selected.CurrentStrategicStage" :planned-exit="selected.PlannedExit" />

          <a v-if="selected.CurrentStrategicStage === 2 && selected.CSFloatToSteamTradeOfferLink" :href="selected.CSFloatToSteamTradeOfferLink" target="_blank" rel="noopener" class="cs2-cta">
            Accept the trade offer in Steam →
          </a>

          <dl class="cs2-facts">
            <div><dt>Paid</dt><dd>{{ positionCost(selected) }}<span v-if="selected.PurchasePriceCents" class="muted"> ({{ fmtCents(selected.PurchasePriceCents) }})</span></dd></div>
            <div><dt>Planned exit</dt><dd>{{ exitLabel(selected) }}</dd></div>
            <div><dt>Expected cash back</dt><dd>{{ selected.ExpectedNetCashPence ? fmtPence(selected.ExpectedNetCashPence) : '—' }}</dd></div>
            <div><dt>Expected profit</dt><dd class="tone-good">{{ fmtGbp(selected.ExpectedAbsoluteProfitInPounds) }} <span class="muted">({{ fmtNumber(selected.ExpectedProfitPercentage, 1) }}%)</span></dd></div>
            <div v-if="selected.CurrentStrategicStage === 7"><dt>Actual profit</dt><dd :class="(selected.ActualAbsoluteProfitInPounds ?? 0) >= 0 ? 'tone-good' : 'tone-danger'">{{ fmtGbp(selected.ActualAbsoluteProfitInPounds) }} <span class="muted">({{ fmtNumber(selected.ActualProfitPercentage, 1) }}%)</span></dd></div>
            <div v-if="selected.CSFloatResalePriceCents"><dt>Relisted at</dt><dd>{{ fmtCents(selected.CSFloatResalePriceCents) }}</dd></div>
            <div v-if="selected.ActualSalePriceOnSteam"><dt>Steam sale</dt><dd>{{ fmtGbp(selected.ActualSalePriceOnSteam) }}</dd></div>
            <div><dt>Float</dt><dd>{{ fmtNumber(selected.ItemFloatValue, 6) }}</dd></div>
            <div v-if="selected.ConversionCoefficientAtPurchase"><dt>k at purchase</dt><dd>{{ fmtNumber(selected.ConversionCoefficientAtPurchase, 3) }}</dd></div>
            <div v-if="selected.LastTradeState"><dt>CSFloat trade</dt><dd>{{ selected.LastTradeState }}</dd></div>
          </dl>

          <h3 class="cs2-subhead">Timeline</h3>
          <ul class="cs2-timeline">
            <li v-for="event in timeline(selected)" :key="event.label" :class="{ future: event.future }">
              <span>{{ event.label }}</span><span>{{ fmtDateTime(event.at) }}</span>
            </li>
          </ul>

          <p v-if="selected.Notes" class="cs2-notes">{{ selected.Notes }}</p>

          <div class="cs2-links">
            <a :href="selected.comparison?.CSFloatURL || csfloatListingUrl(selected.CSFloatListingID)" target="_blank" rel="noopener">CSFloat listing</a>
            <a :href="steamListingUrl(selected.ItemMarketHashName)" target="_blank" rel="noopener">Steam market</a>
            <a v-if="selected.CSFloatResaleListingID" :href="csfloatListingUrl(selected.CSFloatResaleListingID)" target="_blank" rel="noopener">Resale listing</a>
          </div>
        </div>
        <div v-else class="cs2-empty">Pick a position to see its exits, timeline and links.</div>
      </DashboardPanel>

      <!-- Market read -->
      <DashboardPanel
        class="span-6"
        title="What the market offers"
        :subtitle="analytics ? `${fmtCount(analytics.TotalListingsScanned)} listings valued since ${fmtDateTime(analytics.FirstListingDateRecorded)}` : 'Valuation history'"
        :loading="loadingSlow && !analytics"
        :error="zoneError(paths.analytics)"
      >
        <div v-if="analytics" class="cs2-market">
          <div class="cs2-dist">
            <div v-for="b in roiBuckets" :key="b.label" class="cs2-dist__row">
              <span class="cs2-dist__label">{{ b.label }}</span>
              <span class="cs2-dist__bar"><span :style="{ width: `${b.pct}%` }" :class="b.tone" /></span>
              <span class="cs2-dist__value">{{ fmtCount(b.count) }} <span class="muted">{{ b.pct.toFixed(b.pct < 1 ? 2 : 1) }}%</span></span>
            </div>
          </div>
          <div class="cs2-best">
            <span class="muted">Best ever</span>
            <strong>{{ analytics.NameOfItemWithHighestPredictedGain || '—' }}</strong>
            <span class="tone-good">{{ analytics.HighestPredictedGainFoundSoFar ? fmtRoi(analytics.HighestPredictedGainFoundSoFar - 1) : '—' }}</span>
          </div>
          <h3 class="cs2-subhead">Last 14 days</h3>
          <div class="cs2-days" role="img" :aria-label="dailySummary">
            <div v-for="d in daily" :key="d.day" class="cs2-days__col" :title="`${d.day}: ${d.evaluated} valued, ${d.qualified} qualified, ${d.purchased} bought`">
              <span class="cs2-days__bar" :style="{ height: `${d.height}%` }">
                <span v-if="d.qualified" class="cs2-days__mark" />
              </span>
              <span class="cs2-days__label">{{ d.label }}</span>
            </div>
          </div>
          <p class="cs2-footnote">Bar height = listings valued that day; green marker = a qualifying opportunity.</p>
        </div>
        <div v-else class="cs2-empty">No valuation history yet.</div>
      </DashboardPanel>

      <!-- Balances -->
      <DashboardPanel
        class="span-6"
        title="Balances"
        :subtitle="latestBalance ? `Recorded ${fmtDateTime(latestBalance.DateTimeOfBalanceRecord)}` : 'Daily balance record'"
        :loading="loadingSlow && !balances.length"
        :error="zoneError(paths.balances)"
      >
        <div v-if="latestBalance" class="cs2-balances">
          <div class="cs2-balances__kpis">
            <DashboardKpi label="Total" :value="fmtGbp(latestBalance.CSFloatTotalBalanceInPounds + latestBalance.SteamTotalBalanceInPounds)" :detail="balanceChange" />
            <DashboardKpi label="CSFloat" :value="fmtGbp(latestBalance.CSFloatTotalBalanceInPounds)" :detail="`${fmtGbp(latestBalance.CSFloatPendingBalanceInPounds)} pending`" tone="info" />
            <DashboardKpi label="Steam" :value="fmtGbp(latestBalance.SteamTotalBalanceInPounds)" :detail="latestBalance.SteamBalanceCarriedForward ? 'carried forward' : `${fmtGbp(latestBalance.SteamPendingBalanceInPounds)} pending`" />
          </div>
          <div class="cs2-chart"><canvas ref="balanceCanvas" aria-label="Balance history chart" role="img" /></div>
        </div>
        <div v-else class="cs2-empty">No balance records yet — the bot records balances daily at noon.</div>
      </DashboardPanel>

      <!-- Conversion -->
      <DashboardPanel
        class="span-7"
        title="Converting Steam wallet back to CSFloat"
        :subtitle="status?.conversion?.basis || plan?.ConversionBasis || 'Conversion plan'"
        :loading="loadingSlow && !plan"
        :error="zoneError(paths.plan)"
      >
        <div class="cs2-conversion">
          <div class="cs2-conversion__k">
            <strong :class="`tone-${kTone}`">{{ fmtNumber(status?.conversion?.coefficient ?? plan?.ConversionCoefficientUsed, 3) }}</strong>
            <span>CSFloat £ recovered per Steam £ — the Steam exit only pays when the Steam bid beats CSFloat by
              {{ breakEvenPremium }}× after fees.</span>
          </div>
          <div v-if="converters.length" class="cs2-table-wrap">
            <table class="cs2-table">
              <thead>
                <tr>
                  <th>Buy on Steam</th>
                  <th class="num">At most</th>
                  <th class="num">Sells on CSFloat</th>
                  <th class="num">Return</th>
                  <th class="num">Sales / wk</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="c in converters" :key="c.name">
                  <td class="item"><a :href="steamListingUrl(c.name)" target="_blank" rel="noopener">{{ c.name }}</a></td>
                  <td class="num">{{ fmtGbp(c.buyAt) }}</td>
                  <td class="num">{{ fmtGbp(c.sellsFor) }}</td>
                  <td class="num" :class="`tone-${(c.k ?? 0) >= 0.85 ? 'good' : 'neutral'}`">{{ c.k != null ? `${(c.k * 100).toFixed(0)}%` : '—' }}</td>
                  <td class="num muted">{{ c.sales != null ? fmtCount(c.sales) : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="cs2-empty">The conversion model hasn't produced a plan yet (runs every 3 hours).</div>
        </div>
      </DashboardPanel>

      <!-- Scan cycles -->
      <DashboardPanel
        class="span-5"
        title="Recent scans"
        :subtitle="`${cycles.length} cycles · ${coverageGaps} with coverage gaps`"
        :loading="loadingSlow && !cycles.length"
        :error="zoneError(paths.cycles)"
      >
        <div v-if="recentCycles.length" class="cs2-table-wrap cs2-table-wrap--tall">
          <table class="cs2-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Scan</th>
                <th class="num">New</th>
                <th class="num">Valued</th>
                <th class="num">Steam</th>
                <th class="num">Best</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in recentCycles" :key="c.StartedUtc + c.Strategy" :class="{ 'is-buy': c.Opportunities > 0 }">
                <td class="muted">{{ fmtAgo(c.StartedUtc, now) }}</td>
                <td :title="c.Note || ''">{{ scanName(c.Strategy) }}<span v-if="c.CoverageGap" class="tone-warning" title="More listings arrived than one page holds"> ⚠</span></td>
                <td class="num">{{ c.NewListings }}</td>
                <td class="num">{{ c.Evaluated }}</td>
                <td class="num muted">{{ c.SteamLookups }}</td>
                <td class="num" :class="`tone-${roiTone(c.BestRoi)}`" :title="c.BestItem || ''">{{ c.Evaluated ? fmtRoi(c.BestRoi) : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="cs2-empty">No scan cycles recorded yet.</div>
      </DashboardPanel>

      <!-- Issues -->
      <DashboardPanel v-if="issues.length" class="span-12" title="Recent issues" :subtitle="`${issues.length} from the engine, Steam and CSFloat`">
        <ul class="cs2-issues">
          <li v-for="(issue, i) in issues" :key="i">{{ issue }}</li>
        </ul>
        <p v-if="status?.legacyFilesOnDisk > 0" class="cs2-footnote">
          {{ fmtCount(status.legacyFilesOnDisk) }} legacy per-listing files from the old scanner are still on disk (no longer read; safe to archive).
        </p>
      </DashboardPanel>
    </div>

    <CS2SettingsDrawer :open="settingsOpen" @close="settingsOpen = false" @saved="refreshFast" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Chart, registerables } from 'chart.js';
import Swal from 'sweetalert2';
import DashboardPanel from '~/components/Dashboard/DashboardPanel.vue';
import DashboardKpi from '~/components/Dashboard/DashboardKpi.vue';
import DashboardAction from '~/components/Dashboard/DashboardAction.vue';
import CS2StageTrack from '~/components/CS2/StageTrack.vue';
import CS2SettingsDrawer from '~/components/CS2/SettingsDrawer.vue';
import { useCurrentProfile } from '~/composables/useCurrentProfile';
import { useCs2Arbitrage } from '~/composables/useCs2Arbitrage';
import {
  stageMeta, isOpenPurchase, routeName, roiTone,
  fmtGbp, fmtPence, fmtCents, fmtRoi, fmtCount, fmtNumber, fmtAgo, fmtDateTime, isRealDate,
  steamListingUrl, csfloatListingUrl,
  type Cs2Evaluation, type Cs2Purchase, type Cs2Tone,
} from '~/scripts/cs2Arbitrage';

Chart.register(...registerables);
definePageMeta({ layout: 'navbar' });
useHead({ title: 'KM: CS2 Arbitrage' });

const {
  status, opportunities, analytics, cycles, plan, balances,
  loadingFast, loadingSlow, now, lastLoadedAt,
  refreshAll, refreshFast, scanNow, zoneError, paths,
} = useCs2Arbitrage();

const profile = useCurrentProfile();
const isKlives = computed(() => profile.isKlives.value);
const settingsOpen = ref(false);
const scanPending = ref(false);

const engine = computed(() => status.value?.engine ?? null);

// ── Header ──────────────────────────────────────────────────────────────────

const health = computed<{ label: string; tone: 'good' | 'warning' | 'critical' | 'muted' }>(() => {
  const s = status.value;
  if (!s) return zoneError(paths.status) ? { label: 'Unreachable', tone: 'critical' } : { label: 'Connecting', tone: 'muted' };
  if (!s.automationEnabled) return { label: 'Automation off', tone: 'muted' };
  const state = String(s.engine?.State ?? s.startupState ?? '').toLowerCase();
  if (state.includes('fail')) return { label: 'Failed', tone: 'critical' };
  if (state.startsWith('running')) return { label: 'Running', tone: 'good' };
  if (state.includes('paused')) return { label: 'Paused', tone: 'warning' };
  if (state.includes('waiting')) return { label: 'Waiting', tone: 'warning' };
  return { label: state ? state[0].toUpperCase() + state.slice(1) : 'Starting', tone: 'warning' };
});

const freshness = computed(() => (lastLoadedAt.value ? `Updated ${fmtAgo(new Date(lastLoadedAt.value).toISOString(), now.value)}` : 'Loading…'));

const runScan = async () => {
  scanPending.value = true;
  try {
    const message = await scanNow();
    Swal.fire({ toast: true, position: 'top-end', timer: 3500, showConfirmButton: false, icon: message.includes('queued') ? 'success' : 'warning', title: message, background: '#161616', color: '#ededed' });
  } finally {
    scanPending.value = false;
  }
};

// ── Purchases ───────────────────────────────────────────────────────────────

const purchases = computed<Cs2Purchase[]>(() =>
  [...(analytics.value?.AllPurchasedItems ?? [])].sort((a, b) => new Date(b.TimeOfPurchase ?? 0).getTime() - new Date(a.TimeOfPurchase ?? 0).getTime()));
const openPurchases = computed(() => purchases.value.filter(isOpenPurchase));
const actionCount = computed(() => purchases.value.filter((p) => p.CurrentStrategicStage === 2 || String(p.LastTradeState ?? '').startsWith('resale:pending') || String(p.LastTradeState ?? '').startsWith('resale:queued')).length);
const showAllPositions = ref(false);
const visiblePurchases = computed(() => (showAllPositions.value ? purchases.value : openPurchases.value));
const selectedId = ref<string | null>(null);
const selected = computed(() => purchases.value.find((p) => p.CSFloatListingID === selectedId.value) ?? visiblePurchases.value[0] ?? null);

const exitLabel = (p: Cs2Purchase) => (p.PlannedExit === 'CSFloatRelist' ? 'Relist on CSFloat' : 'Sell on Steam');
const positionCost = (p: Cs2Purchase) => (p.PurchaseCostPence ? fmtPence(p.PurchaseCostPence) : p.comparison?.CSFloatListing?.PriceText ?? '—');
const positionProfit = (p: Cs2Purchase) => {
  if (p.CurrentStrategicStage === 7) return `${fmtGbp(p.ActualAbsoluteProfitInPounds)} realised`;
  if (p.CurrentStrategicStage === 8) return 'refunded';
  return `${fmtGbp(p.ExpectedAbsoluteProfitInPounds)} expected`;
};
const profitTone = (p: Cs2Purchase): Cs2Tone => {
  if (p.CurrentStrategicStage === 8) return 'neutral';
  const value = p.CurrentStrategicStage === 7 ? p.ActualAbsoluteProfitInPounds : p.ExpectedAbsoluteProfitInPounds;
  return (value ?? 0) >= 0 ? 'good' : 'danger';
};

const timeline = (p: Cs2Purchase) => {
  const events: { label: string; at?: string; future?: boolean }[] = [
    { label: 'Bought', at: p.TimeOfPurchase },
    { label: 'Seller accepted', at: p.TimeOfSellerToAcceptSale },
    { label: 'Trade offer sent', at: p.TimeOfSellerToSendTradeOffer },
    { label: 'Item received', at: p.TimeOfItemRetrieval },
    { label: p.PlannedExit === 'CSFloatRelist' ? 'Relist due' : 'Steam sale due', at: p.PredictedTimeToBeResoldOnSteam, future: true },
    { label: 'Sold on Steam', at: p.ActualTimeResoldOnSteam },
    { label: 'Revenue collected', at: p.TimeOfCollectedRevenue },
  ];
  return events
    .filter((e) => isRealDate(e.at))
    .map((e) => ({ ...e, future: e.future && new Date(e.at as string).getTime() > now.value }));
};

// ── Opportunities ───────────────────────────────────────────────────────────

type OppFilter = 'all' | 'buy' | 'near';
const oppFilter = ref<OppFilter>('all');
const oppFilters = computed(() => [
  { id: 'all' as const, label: 'All', count: opportunities.value.length },
  { id: 'buy' as const, label: 'Qualified', count: opportunities.value.filter((o) => o.ShouldBuy).length },
  { id: 'near' as const, label: 'Near misses', count: opportunities.value.filter((o) => !o.ShouldBuy).length },
]);
const filteredOpportunities = computed(() => opportunities.value.filter((o) =>
  oppFilter.value === 'all' || (oppFilter.value === 'buy' ? o.ShouldBuy : !o.ShouldBuy)));

/** The server's reason, trimmed to the part that explains the verdict. */
const shortReason = (o: Cs2Evaluation) => {
  const reason = o.Reason ?? '';
  if (o.ShouldBuy) return reason;
  const rejected = reason.match(/rejected: (.*)$/);
  if (rejected) return rejected[1];
  const bar = reason.match(/below the bar \((.*)\)$/);
  if (bar) return `under bar (${bar[1]})`;
  return reason;
};

// ── Market read ─────────────────────────────────────────────────────────────

const roiBuckets = computed(() => {
  const a = analytics.value;
  if (!a) return [];
  const total = Math.max(1, a.TotalListingsScanned);
  const rows = [
    { label: '< 0%', count: a.NumberOfListingsBelow0PercentGain, tone: 'muted' },
    { label: '0–5%', count: a.NumberOfListingsBetween0And5PercentGain, tone: 'muted' },
    { label: '5–10%', count: a.NumberOfListingsBetween5And10PercentGain, tone: 'warning' },
    { label: '10–20%', count: a.NumberOfListingsBetween10And20PercentGain, tone: 'good' },
    { label: '> 20%', count: a.NumberOfListingsAbove20PercentGain, tone: 'good' },
  ];
  return rows.map((r) => ({ ...r, pct: (r.count / total) * 100 }));
});

const daily = computed(() => {
  const map = analytics.value?.Daily ?? {};
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now.value - (13 - i) * 86_400_000);
    return d.toISOString().slice(0, 10);
  });
  const rows = days.map((day) => ({
    day,
    label: day.slice(8, 10),
    evaluated: map[day]?.Evaluated ?? 0,
    qualified: map[day]?.Qualified ?? 0,
    purchased: map[day]?.Purchased ?? 0,
  }));
  const max = Math.max(1, ...rows.map((r) => r.evaluated));
  return rows.map((r) => ({ ...r, height: r.evaluated ? Math.max(4, (r.evaluated / max) * 100) : 0 }));
});
const dailySummary = computed(() => `${daily.value.reduce((s, d) => s + d.evaluated, 0)} listings valued and ${daily.value.reduce((s, d) => s + d.qualified, 0)} qualifying opportunities in the last 14 days`);

// ── Pipeline ────────────────────────────────────────────────────────────────

const budgets = computed(() => (status.value?.csfloatRateLimits ?? [])
  .filter((b: any) => b.Limit > 0 && ['listings', 'trades', 'history', 'inventory'].includes(b.Name))
  .map((b: any) => {
    const pct = Math.max(0, Math.min(100, (b.Remaining / b.Limit) * 100));
    return { ...b, pct, tone: pct > 40 ? 'good' : pct > 10 ? 'warning' : 'danger' };
  }));

const steamHealthPct = computed(() => {
  const s = status.value?.steam;
  if (!s) return 0;
  const total = (s.Successes ?? 0) + (s.Failures ?? 0);
  return total ? (s.Successes / total) * 100 : 100;
});

const prefilterShare = computed(() => {
  const e = engine.value;
  if (!e?.Evaluated) return 'no Steam call needed for —';
  return `${Math.round((e.Prefiltered / e.Evaluated) * 100)}% without a Steam call`;
});

const csfloatUsdCents = computed(() => {
  const usd = status.value?.balances?.csfloatUsd;
  return typeof usd === 'number' ? Math.round(usd * 100) : null;
});

// ── Conversion ──────────────────────────────────────────────────────────────

const kTone = computed<Cs2Tone>(() => {
  const k = status.value?.conversion?.coefficient;
  if (typeof k !== 'number') return 'neutral';
  return k >= 0.85 ? 'good' : k >= 0.7 ? 'neutral' : 'warning';
});
const conversionAge = computed(() => {
  const at = status.value?.conversion?.computedAtUtc;
  return at ? `model ${fmtAgo(at, now.value)}` : 'default (no model yet)';
});
/** Steam bid / CSFloat price needed to break even on the Steam exit: 1.15 fee ÷ k. */
const breakEvenPremium = computed(() => {
  const k = status.value?.conversion?.coefficient ?? plan.value?.ConversionCoefficientUsed;
  return typeof k === 'number' && k > 0 ? (1.15 / k).toFixed(2) : '—';
});

const converters = computed(() => {
  const verified = new Map<string, any>((status.value?.conversion?.topConverters ?? []).map((c: any) => [c.MarketHashName, c]));
  const rows = (plan.value?.Top10Gaps ?? []).map((g) => {
    const name = g.csfloatContainer?.MarketHashName ?? g.steamListing?.Name ?? '';
    const v = verified.get(name);
    return {
      name,
      buyAt: g.IdealPriceToPurchaseOnSteamInPounds ?? g.steamListing?.CheapestSellOrderPriceInPounds,
      sellsFor: g.csfloatContainer?.PriceInPounds,
      k: v?.Coefficient ?? g.ReturnCoefficientFromSteamToCSFloatTaxIncluded ?? null,
      sales: v?.CSFloatSales7d ?? null,
    };
  });
  return rows.filter((r) => r.name).sort((a, b) => (b.k ?? 0) - (a.k ?? 0)).slice(0, 8);
});

// ── Scan cycles & issues ────────────────────────────────────────────────────

const recentCycles = computed(() => [...cycles.value].reverse().slice(0, 30));
const coverageGaps = computed(() => cycles.value.filter((c) => c.CoverageGap).length);
const scanName = (strategy: string) => ({
  feed: 'Feed',
  structural: 'Whole market',
  'sweep:highest_discount': 'Sweep · discount',
  'sweep:best_deal': 'Sweep · best deal',
} as Record<string, string>)[strategy] ?? strategy;

const issues = computed(() => {
  const list: string[] = [...(engine.value?.RecentErrors ?? [])];
  if (status.value?.steam?.LastError) list.push(`Steam: ${status.value.steam.LastError}`);
  if (status.value?.trades?.lastError) list.push(`CSFloat trades: ${status.value.trades.lastError}`);
  if (status.value?.bulkSteamPrices?.LastError) list.push(`Bulk Steam prices: ${status.value.bulkSteamPrices.LastError}`);
  return list.slice(0, 12);
});

// ── Attention ───────────────────────────────────────────────────────────────

const attention = computed(() => {
  const items: { key: string; title: string; detail: string; tone: 'warning' | 'danger' | 'info'; href?: string }[] = [];
  const statusError = zoneError(paths.status);
  if (statusError && !status.value) items.push({ key: 'status', title: 'Bot unreachable', detail: statusError, tone: 'danger' });

  for (const p of purchases.value.filter((x) => x.CurrentStrategicStage === 2)) {
    items.push({ key: `accept-${p.CSFloatListingID}`, title: 'Accept trade offer', detail: p.ItemMarketHashName, tone: 'warning', href: p.CSFloatToSteamTradeOfferLink || undefined });
  }
  for (const p of purchases.value.filter((x) => /^resale:(pending|queued)/.test(x.LastTradeState ?? ''))) {
    items.push({ key: `send-${p.CSFloatListingID}`, title: 'Send CSFloat trade', detail: `${p.ItemMarketHashName} sold — send it from CSFloat's Trades page`, tone: 'warning' });
  }

  const s = status.value;
  const e = engine.value;
  if (s?.steam && s.steam.ConsecutiveFailures >= 10) items.push({ key: 'steam', title: 'Steam prices failing', detail: s.steam.LastError || `${s.steam.ConsecutiveFailures} failures in a row`, tone: 'danger' });
  if (e?.CSFloatPausedUntilUtc) items.push({ key: 'csfloat-pause', title: 'CSFloat rate-limited', detail: `Paused until ${fmtDateTime(e.CSFloatPausedUntilUtc)}`, tone: 'warning' });
  if (e?.State === 'running' && isRealDate(e.LastFeedPollUtc) && now.value - new Date(e.LastFeedPollUtc).getTime() > 5 * 60_000) {
    items.push({ key: 'feed', title: 'Feed stalled', detail: `Last poll ${fmtAgo(e.LastFeedPollUtc, now.value)}`, tone: 'danger' });
  }
  if (s && !s.automationEnabled) items.push({ key: 'automation', title: 'Automation off', detail: 'This instance is not the server', tone: 'info' });
  if (s?.settings && !s.settings.ScanningEnabled) items.push({ key: 'scanning', title: 'Scanning is off', detail: 'Enable "Scan the market" in settings', tone: 'warning' });
  if (s?.settings && !s.settings.PurchasingEnabled) items.push({ key: 'buying', title: 'Auto-buy is off', detail: 'Qualifying deals are alerted, not bought', tone: 'info' });
  return items;
});

// ── Balance chart ───────────────────────────────────────────────────────────

const sortedBalances = computed(() => [...balances.value].sort((a, b) => new Date(a.DateTimeOfBalanceRecord).getTime() - new Date(b.DateTimeOfBalanceRecord).getTime()));
const latestBalance = computed(() => sortedBalances.value[sortedBalances.value.length - 1] ?? null);
const balanceChange = computed(() => {
  const list = sortedBalances.value;
  if (list.length < 2) return 'first record';
  const total = (b: typeof list[number]) => b.CSFloatTotalBalanceInPounds + b.SteamTotalBalanceInPounds;
  const weekAgo = Date.now() - 7 * 86_400_000;
  const baseline = [...list].reverse().find((b) => new Date(b.DateTimeOfBalanceRecord).getTime() <= weekAgo) ?? list[0];
  const delta = total(list[list.length - 1]) - total(baseline);
  return `${delta >= 0 ? '+' : '−'}£${Math.abs(delta).toFixed(2)} vs ${fmtDateTime(baseline.DateTimeOfBalanceRecord)}`;
});

const balanceCanvas = ref<HTMLCanvasElement | null>(null);
let balanceChart: Chart | null = null;

const renderBalanceChart = async () => {
  await nextTick();
  if (!balanceCanvas.value || !sortedBalances.value.length) return;
  const labels = sortedBalances.value.map((b) => new Date(b.DateTimeOfBalanceRecord).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }));
  const csfloat = sortedBalances.value.map((b) => b.CSFloatTotalBalanceInPounds);
  const steam = sortedBalances.value.map((b) => b.SteamTotalBalanceInPounds);
  if (balanceChart) {
    balanceChart.data.labels = labels;
    balanceChart.data.datasets[0].data = csfloat;
    balanceChart.data.datasets[1].data = steam;
    balanceChart.update('none');
    return;
  }
  balanceChart = new Chart(balanceCanvas.value, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'CSFloat', data: csfloat, borderColor: '#62ce47', backgroundColor: 'rgba(98, 206, 71, 0.18)', fill: 'origin', tension: 0.25, pointRadius: 0, borderWidth: 1.5, stack: 'total' },
        { label: 'Steam', data: steam, borderColor: '#6aa9ff', backgroundColor: 'rgba(106, 169, 255, 0.15)', fill: '-1', tension: 0.25, pointRadius: 0, borderWidth: 1.5, stack: 'total' },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#a8a8a8', boxWidth: 10, font: { size: 11 } } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: £${Number(ctx.parsed.y).toFixed(2)}` } },
      },
      scales: {
        x: { ticks: { color: '#707070', maxTicksLimit: 8, font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { stacked: true, ticks: { color: '#707070', font: { size: 10 }, callback: (v) => `£${v}` }, grid: { color: 'rgba(255,255,255,0.05)' } },
      },
    },
  });
};

watch(sortedBalances, renderBalanceChart);
onMounted(() => { profile.ensureLoaded?.(); renderBalanceChart(); });
onBeforeUnmount(() => { balanceChart?.destroy(); balanceChart = null; });
</script>

<style scoped>
.cs2-shell,
.cs2-shell * { color: inherit; font-family: inherit; }

.cs2-shell {
  display: grid;
  min-width: 0;
  min-height: 100vh;
  align-content: start;
  gap: 8px;
  padding: 10px;
  background: #201f20;
  color: #ededed;
  font-family: 'Roboto', sans-serif;
}

/* On narrow screens the navbar layout overlays its 56px rail on the page; keep clear of it. */
.vnav-root.is-overlay .cs2-shell { padding-left: 66px; }

.cs2-shell a { color: #8de279; text-decoration: none; }
.cs2-shell a:hover { text-decoration: underline; }
.muted { color: #858585; }
.tone-good { color: #8de279; }
.tone-warning { color: #f0c35b; }
.tone-danger { color: #ff8f8f; }
.tone-info { color: #8fbfff; }
.tone-neutral { color: inherit; }

/* Command bar */
.cs2-commandbar {
  display: flex;
  min-height: 42px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 8px;
  border: 1px solid rgba(255, 255, 255, 0.075);
  border-radius: 6px;
  background: #161616;
}

.cs2-identity { display: flex; min-width: 0; flex-wrap: wrap; align-items: center; gap: 10px; }
.cs2-back {
  display: inline-flex;
  width: 26px;
  height: 26px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 5px;
  color: #bdbdbd !important;
  text-decoration: none !important;
}
.cs2-back:hover { border-color: rgba(98, 206, 71, 0.4); color: #8de279 !important; }
.cs2-wordmark { color: #f4f4f4; font-size: 15px; font-weight: 750; letter-spacing: 0.02em; }

.cs2-health { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; }
.cs2-health__dot { width: 7px; height: 7px; border-radius: 50%; background: #707070; }
.cs2-health.is-good { color: #8de279; }
.cs2-health.is-good .cs2-health__dot { background: #62ce47; box-shadow: 0 0 0 3px rgba(98, 206, 71, 0.12); }
.cs2-health.is-warning { color: #f0c35b; }
.cs2-health.is-warning .cs2-health__dot { background: #e3b341; box-shadow: 0 0 0 3px rgba(227, 179, 65, 0.12); }
.cs2-health.is-critical { color: #ff8f8f; }
.cs2-health.is-critical .cs2-health__dot { background: #ef6464; box-shadow: 0 0 0 3px rgba(239, 100, 100, 0.12); }
.cs2-health.is-muted { color: #969696; }

.cs2-chip,
.cs2-pill {
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  padding: 1px 7px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
}
.cs2-pill { padding: 0 6px; font-size: 9.5px; }
.is-good.cs2-chip, .is-good.cs2-pill { border-color: rgba(98, 206, 71, 0.3); background: rgba(77, 158, 57, 0.12); color: #8de279; }
.is-warning.cs2-pill { border-color: rgba(240, 195, 91, 0.35); background: rgba(240, 195, 91, 0.1); color: #f0c35b; }
.is-danger.cs2-pill { border-color: rgba(239, 100, 100, 0.35); background: rgba(239, 100, 100, 0.1); color: #ff8f8f; }
.is-info.cs2-pill { border-color: rgba(106, 169, 255, 0.3); background: rgba(106, 169, 255, 0.08); color: #8fbfff; }
.is-muted.cs2-chip, .is-muted.cs2-pill, .is-neutral.cs2-pill { color: #a8a8a8; }

.cs2-freshness { color: #707070; font-size: 10px; }
.cs2-actions { display: flex; flex-wrap: wrap; gap: 5px; }

/* Attention */
.cs2-attention {
  display: flex;
  min-height: 48px;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border: 1px solid rgba(255, 255, 255, 0.075);
  border-radius: 6px;
  background: #161616;
}
.cs2-attention__label { display: flex; width: 92px; flex: 0 0 auto; align-items: center; gap: 6px; color: #969696; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
.cs2-attention__label strong { border-radius: 999px; padding: 0 6px; background: rgba(240, 195, 91, 0.15); color: #f0c35b; font-size: 10px; }
.cs2-attention__items { display: grid; min-width: 0; flex: 1; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 5px; }
.cs2-attention__item {
  display: flex;
  min-width: 0;
  flex-direction: column;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-left-width: 2px;
  border-radius: 5px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.02);
  text-decoration: none !important;
}
.cs2-attention__item strong { font-size: 12px; }
.cs2-attention__item span { overflow: hidden; color: #969696; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.cs2-attention__item.is-warning { border-left-color: #e3b341; }
.cs2-attention__item.is-warning strong { color: #f0c35b; }
.cs2-attention__item.is-danger { border-left-color: #ef6464; }
.cs2-attention__item.is-danger strong { color: #ff8f8f; }
.cs2-attention__item.is-info { border-left-color: #6aa9ff; }
.cs2-attention__item.is-info strong { color: #8fbfff; }
a.cs2-attention__item:hover { background: rgba(255, 255, 255, 0.045); }
.cs2-attention__clear { color: #707070; font-size: 12px; }

/* KPIs */
.cs2-kpis { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 5px; }

/* Grid */
.cs2-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 8px; align-items: stretch; }
.span-4 { grid-column: span 4; }
.span-5 { grid-column: span 5; }
.span-6 { grid-column: span 6; }
.span-7 { grid-column: span 7; }
.span-8 { grid-column: span 8; }
.span-12 { grid-column: 1 / -1; }

.cs2-empty { padding: 14px 4px; color: #707070; font-size: 12px; line-height: 1.4; }
.cs2-footnote { margin-top: 6px; color: #6f6f6f; font-size: 10.5px; line-height: 1.35; }
.cs2-subhead { margin: 10px 0 5px; color: #8de279; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }

/* Pipeline */
.cs2-stage-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 1px 8px; padding: 5px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.045); }
.cs2-stage-row__name { font-size: 12px; font-weight: 600; }
.cs2-stage-row__value { color: #f4f4f4; font-size: 12px; text-align: right; }
.cs2-stage-row__detail { grid-column: 1 / -1; overflow: hidden; color: #858585; font-size: 10.5px; text-overflow: ellipsis; white-space: nowrap; }

.cs2-meter { display: grid; grid-template-columns: 110px minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 3px 0; font-size: 11px; }
.cs2-meter__name { overflow: hidden; color: #a8a8a8; text-overflow: ellipsis; white-space: nowrap; }
.cs2-meter__bar { height: 5px; overflow: hidden; border-radius: 3px; background: rgba(255, 255, 255, 0.06); }
.cs2-meter__bar span { display: block; height: 100%; border-radius: 3px; }
.cs2-meter__bar .good { background: #4d9e39; }
.cs2-meter__bar .warning { background: #e3b341; }
.cs2-meter__bar .danger { background: #ef6464; }
.cs2-meter__value { color: #d0d0d0; font-variant-numeric: tabular-nums; }

/* Segmented filter */
.cs2-segment { display: inline-flex; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 5px; }
.cs2-segment button {
  height: 24px;
  padding: 0 8px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #969696;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
}
.cs2-segment button span { margin-left: 3px; color: #6f6f6f; }
.cs2-segment button.active { background: rgba(77, 158, 57, 0.15); color: #8de279; }

/* Tables */
.cs2-table-wrap { max-height: 360px; overflow: auto; }
.cs2-table-wrap--tall { max-height: 420px; }
.cs2-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.cs2-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 5px 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: #161616;
  color: #858585;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-align: left;
  text-transform: uppercase;
  white-space: nowrap;
}
.cs2-table td { padding: 5px 6px; border-bottom: 1px solid rgba(255, 255, 255, 0.04); vertical-align: middle; white-space: nowrap; }
.cs2-table .num { font-variant-numeric: tabular-nums; text-align: right; }
.cs2-table .item { max-width: 280px; overflow: hidden; text-overflow: ellipsis; }
.cs2-table .verdict { max-width: 260px; overflow: hidden; color: #969696; text-overflow: ellipsis; }
.cs2-table tbody tr:hover { background: rgba(255, 255, 255, 0.025); }
.cs2-table tr.is-buy { background: rgba(77, 158, 57, 0.08); }

/* Positions */
.cs2-positions { display: flex; max-height: 420px; flex-direction: column; gap: 4px; overflow-y: auto; }
.cs2-position {
  display: grid;
  width: 100%;
  min-height: 52px;
  grid-template-columns: 44px minmax(0, 1fr) minmax(110px, 160px) auto;
  align-items: center;
  gap: 10px;
  padding: 4px 8px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.018);
  letter-spacing: 0;
  text-align: left;
  text-transform: none;
}
.cs2-position:hover { border-color: rgba(255, 255, 255, 0.12); }
.cs2-position.active { border-color: rgba(98, 206, 71, 0.45); background: rgba(77, 158, 57, 0.07); }
.cs2-position__img { width: 44px; height: 33px; object-fit: contain; }
.cs2-position__img--empty { border-radius: 4px; background: rgba(255, 255, 255, 0.04); }
.cs2-position__main { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
.cs2-position__name { overflow: hidden; color: #f4f4f4; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.cs2-position__meta { display: flex; align-items: center; gap: 6px; overflow: hidden; color: #858585; font-size: 10.5px; white-space: nowrap; }
.cs2-position__money { display: flex; flex-direction: column; align-items: flex-end; font-size: 11px; white-space: nowrap; }
.cs2-position__money strong { color: #f4f4f4; font-size: 12px; }

/* Detail */
.cs2-detail { display: flex; flex-direction: column; gap: 8px; }
.cs2-detail__head { display: flex; align-items: center; gap: 10px; }
.cs2-detail__img { width: 72px; height: 54px; object-fit: contain; }
.cs2-detail__title { display: flex; min-width: 0; flex-direction: column; gap: 2px; }
.cs2-detail__title strong { color: #f4f4f4; font-size: 13px; }
.cs2-detail__title span { font-size: 11.5px; }
.cs2-cta {
  display: block;
  border: 1px solid rgba(240, 195, 91, 0.45);
  border-radius: 5px;
  padding: 6px 10px;
  background: rgba(240, 195, 91, 0.1);
  color: #f0c35b !important;
  font-size: 12px;
  font-weight: 700;
}
.cs2-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 10px; margin: 0; }
.cs2-facts div { display: flex; min-width: 0; flex-direction: column; padding: 3px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.04); }
.cs2-facts dt { color: #858585; font-size: 10px; letter-spacing: 0.05em; text-transform: uppercase; }
.cs2-facts dd { margin: 0; overflow: hidden; color: #f4f4f4; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.cs2-timeline { margin: 0; padding: 0; list-style: none; }
.cs2-timeline li { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px dashed rgba(255, 255, 255, 0.05); font-size: 11.5px; }
.cs2-timeline li span:last-child { color: #a8a8a8; }
.cs2-timeline li.future span { color: #8fbfff; }
.cs2-notes { border-left: 2px solid rgba(255, 255, 255, 0.15); padding: 4px 8px; color: #a8a8a8; font-size: 11px; white-space: pre-line; }
.cs2-links { display: flex; flex-wrap: wrap; gap: 10px; font-size: 11.5px; }

/* Market read */
.cs2-dist__row { display: grid; grid-template-columns: 52px minmax(0, 1fr) 110px; align-items: center; gap: 8px; padding: 4px 0; font-size: 11.5px; }
.cs2-dist__label { color: #a8a8a8; }
.cs2-dist__bar { height: 8px; overflow: hidden; border-radius: 3px; background: rgba(255, 255, 255, 0.05); }
.cs2-dist__bar span { display: block; height: 100%; min-width: 1px; border-radius: 3px; background: #4a4a4a; }
.cs2-dist__bar .warning { background: #e3b341; }
.cs2-dist__bar .good { background: #4d9e39; }
.cs2-dist__value { font-variant-numeric: tabular-nums; text-align: right; }
.cs2-best { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: baseline; gap: 8px; margin-top: 8px; padding: 6px 8px; border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 5px; font-size: 12px; }
.cs2-best strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cs2-days { display: grid; height: 90px; grid-template-columns: repeat(14, minmax(0, 1fr)); align-items: end; gap: 3px; }
.cs2-days__col { display: flex; height: 100%; flex-direction: column; justify-content: flex-end; align-items: center; gap: 3px; }
.cs2-days__bar { position: relative; width: 100%; border-radius: 2px 2px 0 0; background: rgba(106, 169, 255, 0.45); }
.cs2-days__mark { position: absolute; top: -6px; left: 50%; width: 6px; height: 6px; border-radius: 50%; background: #62ce47; transform: translateX(-50%); }
.cs2-days__label { color: #6f6f6f; font-size: 9px; }

/* Balances */
.cs2-balances__kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; }
.cs2-chart { position: relative; height: 230px; margin-top: 8px; }

/* Conversion */
.cs2-conversion__k { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.cs2-conversion__k strong { font-size: 26px; font-weight: 750; font-variant-numeric: tabular-nums; }
.cs2-conversion__k span { color: #969696; font-size: 11.5px; line-height: 1.35; }

/* Issues */
.cs2-issues { margin: 0; padding: 0; list-style: none; }
.cs2-issues li { padding: 4px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.04); color: #e0a0a0; font-family: ui-monospace, Consolas, monospace !important; font-size: 11px; word-break: break-word; }

@media (max-width: 1400px) {
  .cs2-kpis { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .span-4, .span-8 { grid-column: span 6; }
  .span-5, .span-7 { grid-column: span 6; }
}

@media (max-width: 1000px) {
  .cs2-grid > * { grid-column: 1 / -1; }
  .cs2-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cs2-attention { flex-direction: column; align-items: stretch; }
  .cs2-position { grid-template-columns: 40px minmax(0, 1fr) auto; }
  .cs2-position__track { display: none; }
  .cs2-facts { grid-template-columns: minmax(0, 1fr); }
}
</style>
