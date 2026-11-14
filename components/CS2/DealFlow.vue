<template>
  <section id="cs2x-deals" class="cs2x-card" aria-label="Deal flow" :data-flash="flash || undefined" data-testid="cs2x-deals">
    <header class="cs2x-card__head">
      <h2 class="cs2x-card__title"><CS2Icon name="radar" />Deal flow</h2>
      <span class="cs2x-card__meta cs2x-num">{{ rows.length }} of {{ deals.length }} recent listings near a buy bar</span>
      <div class="cs2x-card__tools">
        <div class="cs2x-seg" role="group" aria-label="Show">
          <button v-for="g in groups" :key="g.id" class="cs2x-seg__opt" :aria-pressed="group === g.id" :title="g.title" :data-testid="`deals-${g.id}`" @click="emit('update:group', g.id)">
            {{ g.label }} <b>{{ g.count }}</b>
          </button>
        </div>
        <input ref="search" v-model="query" class="cs2x-input" style="width: 190px" placeholder="Filter items…  /" aria-label="Filter deal flow" data-testid="deals-search" @keydown.esc="query = ''" />
      </div>
    </header>

    <div v-if="error && !deals.length" class="cs2x-error"><CS2Icon name="alert" />{{ error }}</div>
    <div v-if="rows.length" class="cs2x-scroll">
      <table class="cs2x-table">
        <thead>
          <tr>
            <th :aria-sort="ariaSort('seen')" @click="sortBy('seen')">Seen</th>
            <th>Item</th>
            <th class="num" :aria-sort="ariaSort('price')" @click="sortBy('price')">Price</th>
            <th class="num cs2x-hide-md">Steam bid / ask</th>
            <th class="num" :aria-sort="ariaSort('value')" @click="sortBy('value')" title="The quick screen's estimate, struck through, then the exit model's value with live evidence">Value</th>
            <th class="cs2x-hide-sm">Best exit</th>
            <th>Verdict</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="o in rows" :key="key(o)">
            <tr data-clickable :data-group="dealGroup(o)" :aria-expanded="open === key(o)" :data-testid="`deal-${o.ListingId}`" tabindex="0" @click="toggle(o)" @keydown.enter.prevent="toggle(o)">
              <td class="cs2x-dim cs2x-num" style="white-space: nowrap">{{ fmtAgo(o.EvaluatedAtUtc, now) }}</td>
              <td style="max-width: 260px">
                <div class="cs2x-item">
                  <span class="cs2x-item__name" :title="o.MarketHashName">{{ o.MarketHashName }}</span>
                  <span class="cs2x-item__meta">{{ o.FloatValue != null ? fmtNumber(o.FloatValue, 4) + ' · ' : '' }}{{ o.Source }}</span>
                </div>
              </td>
              <td class="num">{{ fmtCents(o.PriceCents) }}</td>
              <td class="num cs2x-dim cs2x-hide-md">{{ o.SteamHighestBuyOrderPence ? `${fmtPence(o.SteamHighestBuyOrderPence)} / ${fmtPence(o.SteamLowestSellOrderPence)}` : '—' }}</td>
              <td class="num">
                <span class="cs2x-roi" :data-tone="roiTone(o.BestRoi)">
                  <span v-if="o.ExitModelChecked && o.ScreenBestRoi != null" class="cs2x-roi__screen" :title="`Quick screen: ${fmtRoi(o.ScreenBestRoi)}`">{{ fmtRoi(o.ScreenBestRoi) }}</span>
                  <span class="cs2x-roi__value">{{ fmtRoi(o.BestRoi) }}</span>
                  <span class="cs2x-tag">{{ o.ExitModelChecked ? 'model' : 'screen' }}</span>
                </span>
              </td>
              <td class="cs2x-hide-sm">
                <span class="cs2x-route" :data-route="routeKey(o.BestRoute)">{{ routeName(o.BestRoute) }}</span>
                <span v-if="o.ExitModelChecked && o.ExpectedDaysToSell" class="cs2x-dim"> · ~{{ fmtDays(o.ExpectedDaysToSell) }}</span>
              </td>
              <td style="max-width: 230px">
                <div class="cs2x-item">
                  <span class="cs2x-pill" :data-tone="o.ShouldBuy ? 'ok' : o.ExitModelChecked ? 'crit' : 'neutral'">{{ o.ShouldBuy ? 'Buy' : o.ExitModelChecked ? 'Rejected' : 'Near miss' }}</span>
                  <span class="cs2x-truncate cs2x-dim" style="font-size: 11.5px" :title="o.Reason">{{ shortReason(o) }}</span>
                </div>
              </td>
            </tr>
            <tr v-if="open === key(o)" class="cs2x-detail-row">
              <td colspan="7" style="padding: 0">
                <div class="cs2x-detail" :data-testid="`deal-detail-${o.ListingId}`">
                  <div class="cs2x-detail__grid">
                    <div v-for="exit in exitsOf(o)" :key="exit.label" class="cs2x-exit">
                      <div class="cs2x-exit__head">
                        <span class="cs2x-route" :data-route="exit.route">{{ exit.label }}</span>
                        <span v-if="exit.available" class="cs2x-roi" :data-tone="roiTone(exit.roi)"><span class="cs2x-roi__value">{{ fmtRoi(exit.roi) }}</span></span>
                        <span v-else class="cs2x-dim" style="font-size: 11.5px">{{ exit.unavailable }}</span>
                      </div>
                      <template v-if="exit.available">
                        <div class="cs2x-exit__row"><span>Sells for</span><b>{{ exit.sale }}</b></div>
                        <div class="cs2x-exit__row"><span>Cash back after fees</span><b>{{ fmtPence(exit.net) }}</b></div>
                        <div class="cs2x-exit__row"><span>Profit (screen)</span><b :class="exit.profit >= 0 ? 'cs2x-up' : 'cs2x-down'">{{ fmtPence(exit.profit) }}</b></div>
                      </template>
                    </div>
                    <div v-if="o.ExitModelChecked" class="cs2x-exit">
                      <div class="cs2x-exit__head"><span class="cs2x-route">Exit model</span><span class="cs2x-tag">live evidence</span></div>
                      <div class="cs2x-exit__row"><span>Worth now (risk-adjusted)</span><b>{{ fmtRoi(o.BestRoi) }} · {{ fmtPence(o.BestProfitPence) }}</b></div>
                      <div v-if="o.ExpectedDaysToSell" class="cs2x-exit__row"><span>Time to sell</span><b>~{{ fmtDays(o.ExpectedDaysToSell) }} · {{ fmtProbability(o.SellProbability) }} in the horizon</b></div>
                      <div v-if="o.CSFloatSalesPerDay" class="cs2x-exit__row"><span>CSFloat demand</span><b>{{ fmtNumber(o.CSFloatSalesPerDay, 2) }} sales/day</b></div>
                      <div v-if="o.MissingSignals?.length" class="cs2x-exit__row"><span>Missing evidence</span><b class="cs2x-dim">{{ o.MissingSignals.join('; ') }}</b></div>
                    </div>
                  </div>
                  <ul class="cs2x-reason">
                    <li>{{ reasonParts(o.Reason).head }}</li>
                    <li v-for="(part, i) in reasonParts(o.Reason).exits" :key="i">{{ part }}</li>
                  </ul>
                  <div class="cs2x-links" style="margin-top: 10px">
                    <a class="cs2x-link" :href="csfloatListingUrl(o.ListingId)" target="_blank" rel="noopener">CSFloat listing</a>
                    <a class="cs2x-link" :href="steamListingUrl(o.MarketHashName)" target="_blank" rel="noopener">Steam market</a>
                    <span class="cs2x-dim">listed {{ fmtAgo(o.ListingCreatedUtc, now) }} · valued {{ fmtDateTime(o.EvaluatedAtUtc) }} · k {{ fmtNumber(o.ConversionCoefficient, 3) }}</span>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
    <div v-else-if="!error || deals.length" class="cs2x-empty">
      {{ deals.length ? 'Nothing matches this filter.' : loading ? 'Reading the deal flow…' : 'No listing has come near a buy bar yet. Real deals are rare and short-lived; the feed watches every new listing.' }}
    </div>
    <footer class="cs2x-card__foot">
      Value is risk-adjusted: after fees, Valve's 7-day lock, how long it takes to sell, the conversion and risk. The quick screen runs on every listing; the exit model checks the ones it passes with live CSFloat and Steam evidence.
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import CS2Icon from '~/components/CS2/Icon.vue';
import {
  csfloatListingUrl, dealGroup, fmtAgo, fmtCents, fmtDateTime, fmtDays, fmtNumber, fmtPence, fmtProbability, fmtRoi, matchesDeal,
  reasonParts, routeName, shortReason, steamListingUrl, type Cs2DealGroup, type Cs2Evaluation,
} from '~/scripts/cs2Arbitrage';

const props = defineProps<{ deals: Cs2Evaluation[]; group: 'all' | Cs2DealGroup; now: number; loading: boolean; error: string | null; flash?: boolean }>();
const emit = defineEmits<{ 'update:group': [group: 'all' | Cs2DealGroup] }>();

const query = ref('');
const open = ref<string | null>(null);
const sort = ref<{ key: 'seen' | 'price' | 'value'; dir: 1 | -1 }>({ key: 'seen', dir: -1 });
const search = ref<HTMLInputElement | null>(null);

const key = (o: Cs2Evaluation) => `${o.ListingId}:${o.EvaluatedAtUtc}`;
const count = (g: Cs2DealGroup) => props.deals.filter((o) => dealGroup(o) === g).length;
const groups = computed(() => [
  { id: 'all' as const, label: 'All', count: props.deals.length, title: 'Every recent listing within 10 points of a buy bar' },
  { id: 'buy' as const, label: 'Would buy', count: count('buy'), title: 'The exit model confirmed it' },
  { id: 'model' as const, label: 'Model said no', count: count('model'), title: 'Passed the quick screen; the exit model turned it down with live evidence' },
  { id: 'screen' as const, label: 'Near misses', count: count('screen'), title: 'Close to the bar on the quick screen' },
]);

const rows = computed(() => {
  const filtered = props.deals.filter((o) => (props.group === 'all' || dealGroup(o) === props.group) && matchesDeal(o, query.value));
  const s = sort.value;
  const value = (o: Cs2Evaluation) => (s.key === 'price' ? o.PriceCents : s.key === 'value' ? o.BestRoi : Date.parse(o.EvaluatedAtUtc));
  return [...filtered].sort((a, b) => (value(a) - value(b)) * s.dir);
});

function sortBy(k: 'seen' | 'price' | 'value') {
  sort.value = sort.value.key === k ? { key: k, dir: (sort.value.dir * -1) as 1 | -1 } : { key: k, dir: -1 };
}
const ariaSort = (k: string) => (sort.value.key === k ? (sort.value.dir === 1 ? 'ascending' : 'descending') : 'none');
const toggle = (o: Cs2Evaluation) => { open.value = open.value === key(o) ? null : key(o); };
const routeKey = (r: number | string) => (routeName(r) === 'Steam' ? 'steam' : routeName(r) === 'CSFloat relist' ? 'relist' : '');
const roiTone = (roi?: number | null) => (roi == null ? undefined : roi >= 0.09 ? 'ok' : roi >= 0 ? 'warn' : 'crit');

function exitsOf(o: Cs2Evaluation) {
  const one = (label: string, route: string, e: Cs2Evaluation['Steam'], currency: 'gbp' | 'usd') => ({
    label, route, available: e.Available, unavailable: e.UnavailableReason ?? 'unavailable', roi: e.Roi, net: e.NetCashPence, profit: e.ProfitPence,
    sale: currency === 'gbp' ? fmtPence(e.ExpectedSalePrice) : fmtCents(e.ExpectedSalePrice),
  });
  return [one('Sell on Steam', 'steam', o.Steam, 'gbp'), one('Relist on CSFloat', 'relist', o.Relist, 'usd')];
}

defineExpose({ focus: () => search.value?.focus() });
</script>
