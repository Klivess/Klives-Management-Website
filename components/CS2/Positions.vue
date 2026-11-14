<template>
  <section id="cs2x-positions" class="cs2x-card" aria-label="Positions" :data-flash="flash || undefined" data-testid="cs2x-positions">
    <header class="cs2x-card__head">
      <h2 class="cs2x-card__title"><CS2Icon name="box" />Positions</h2>
      <span class="cs2x-card__meta cs2x-num">{{ book.count }} open · {{ fmtGbp(book.costGbp) }} at cost</span>
      <div class="cs2x-card__tools">
        <div class="cs2x-seg" role="group" aria-label="Show positions">
          <button class="cs2x-seg__opt" :aria-pressed="filter === 'open'" data-testid="positions-open" @click="emit('update:filter', 'open')">Open <b>{{ open.length }}</b></button>
          <button class="cs2x-seg__opt" :aria-pressed="filter === 'needs'" data-testid="positions-needs" @click="emit('update:filter', 'needs')">Needs you <b>{{ needs.length }}</b></button>
          <button class="cs2x-seg__opt" :aria-pressed="filter === 'all'" data-testid="positions-all" @click="emit('update:filter', 'all')">All <b>{{ purchases.length }}</b></button>
        </div>
      </div>
    </header>
    <div v-if="error && !purchases.length" class="cs2x-error"><CS2Icon name="alert" />{{ error }}</div>
    <div v-if="visible.length" class="cs2x-positions cs2x-scroll cs2x-scroll--short">
      <button
        v-for="p in visible"
        :key="p.CSFloatListingID"
        class="cs2x-pos"
        :aria-current="selectedId === p.CSFloatListingID"
        :data-testid="`pos-${p.CSFloatListingID}`"
        @click="emit('open', p.CSFloatListingID)"
      >
        <img v-if="p.comparison?.CSFloatListing?.ImageURL" :src="p.comparison.CSFloatListing.ImageURL" alt="" class="cs2x-pos__img" loading="lazy">
        <span v-else class="cs2x-pos__img cs2x-pos__img--empty"><CS2Icon name="box" /></span>
        <span class="cs2x-pos__main">
          <span class="cs2x-pos__name" :title="p.ItemMarketHashName">{{ p.ItemMarketHashName }}</span>
          <span class="cs2x-pos__line">
            <span class="cs2x-pill" :data-tone="needOf(p) ? 'warn' : toneOf(p)">{{ needOf(p) ? needLabel[needOf(p)!] : stageMeta(p.CurrentStrategicStage).short }}</span>
            <span>{{ positionLine(p, now) }}</span>
          </span>
        </span>
        <span class="cs2x-pos__money">
          <strong>{{ fmtGbp(positionCostGbp(p)) }}</strong>
          <span :class="resultClass(p)">{{ resultText(p) }}</span>
        </span>
      </button>
    </div>
    <div v-else-if="!error || purchases.length" class="cs2x-empty">
      {{ filter === 'needs' ? 'Nothing needs you.' : filter === 'open' ? (purchases.length ? 'No open positions. Everything bought has been sold or closed.' : 'Nothing bought yet.') : loading ? 'Reading positions…' : 'Nothing bought yet.' }}
    </div>
    <footer v-if="book.legacyOpen" class="cs2x-card__foot">{{ book.legacyOpen }} record(s) from the 2025 scanner have no cost and are left out of the totals.</footer>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import CS2Icon from '~/components/CS2/Icon.vue';
import {
  fmtGbp, fmtSignedGbp, isOpenPurchase, needsYou, openBook, positionCostGbp, positionLine, stageMeta,
  type Cs2Purchase, type Cs2StatusPosition,
} from '~/scripts/cs2Arbitrage';

const props = defineProps<{
  purchases: Cs2Purchase[];
  live: Map<string, Cs2StatusPosition>;
  filter: 'open' | 'needs' | 'all';
  selectedId: string | null;
  now: number;
  loading: boolean;
  error: string | null;
  flash?: boolean;
}>();
const emit = defineEmits<{ open: [id: string]; 'update:filter': [f: 'open' | 'needs' | 'all'] }>();

const needLabel: Record<string, string> = { accept: 'Accept', send: 'Send', stuck: 'Stuck', manual: 'Manual' };
const needOf = (p: Cs2Purchase) => needsYou(p, props.live.get(p.CSFloatListingID));
const open = computed(() => props.purchases.filter(isOpenPurchase));
const needs = computed(() => props.purchases.filter((p) => needOf(p)));
const visible = computed(() => (props.filter === 'open' ? open.value : props.filter === 'needs' ? needs.value : props.purchases));
const book = computed(() => openBook(props.purchases));

const toneOf = (p: Cs2Purchase) => ({ good: 'ok', danger: 'crit', warning: 'warn', info: 'info', neutral: 'neutral' } as Record<string, string>)[stageMeta(p.CurrentStrategicStage).tone];
function resultText(p: Cs2Purchase) {
  if (p.CurrentStrategicStage === 7) return `${fmtSignedGbp(p.ActualAbsoluteProfitInPounds)} made`;
  if (p.CurrentStrategicStage === 8) return 'refunded';
  if (p.CurrentStrategicStage === 10) return 'no result';
  return `${fmtSignedGbp(p.ExpectedAbsoluteProfitInPounds)} expected`;
}
function resultClass(p: Cs2Purchase) {
  if (p.CurrentStrategicStage === 8 || p.CurrentStrategicStage === 10) return 'cs2x-dim';
  const v = p.CurrentStrategicStage === 7 ? p.ActualAbsoluteProfitInPounds : p.ExpectedAbsoluteProfitInPounds;
  return (v ?? 0) >= 0 ? 'cs2x-up' : 'cs2x-down';
}
</script>
