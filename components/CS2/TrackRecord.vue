<template>
  <section id="cs2x-record" class="cs2x-card" aria-label="Track record" data-testid="cs2x-record">
    <header class="cs2x-card__head">
      <h2 class="cs2x-card__title"><CS2Icon name="trophy" />Track record</h2>
      <span class="cs2x-card__meta">closed positions bought by the engine since Oct 2026</span>
    </header>
    <div class="cs2x-card__body">
      <div class="cs2x-totals">
        <div class="cs2x-total"><b :class="record.profitGbp >= 0 ? 'cs2x-up' : 'cs2x-down'">{{ fmtSignedGbp(record.profitGbp) }}</b><span>made on {{ record.completed }} sale{{ record.completed === 1 ? '' : 's' }}</span></div>
        <div class="cs2x-total"><b>{{ record.roi == null ? '—' : fmtRoi(record.roi) }}</b><span>on {{ fmtGbp(record.costGbp) }} spent</span></div>
        <div class="cs2x-total"><b>{{ record.completed ? `${record.wins}/${record.completed}` : '—' }}</b><span>sold at a profit</span></div>
        <div class="cs2x-total"><b>{{ record.medianDaysToCash == null ? '—' : fmtDays(record.medianDaysToCash) }}</b><span>median buy → cash</span></div>
        <div v-if="record.cancelled || record.closedNoResult" class="cs2x-total"><b>{{ record.cancelled }} · {{ record.closedNoResult }}</b><span>refunded · left the bot</span></div>
      </div>
      <div v-if="record.rows.length" class="cs2x-scroll cs2x-scroll--short">
        <table class="cs2x-table">
          <thead><tr><th>Item</th><th class="cs2x-hide-sm">Exit</th><th class="num cs2x-hide-sm">Bought</th><th class="num">Held</th><th class="num">Cost</th><th class="num">Result</th><th class="num">Return</th><th>How it's known</th></tr></thead>
          <tbody>
            <tr v-for="r in record.rows" :key="r.id" data-clickable @click="emit('open', r.id)">
              <td style="max-width: 280px"><span class="cs2x-truncate" style="display: block" :title="r.name">{{ r.name }}</span></td>
              <td class="cs2x-hide-sm"><span class="cs2x-route" :data-route="r.route === 'Steam' ? 'steam' : r.route === 'CSFloat relist' ? 'relist' : ''">{{ r.route }}</span></td>
              <td class="num cs2x-dim cs2x-hide-sm">{{ fmtDateTime(r.boughtUtc) }}</td>
              <td class="num">{{ r.days == null ? '—' : fmtDays(r.days) }}</td>
              <td class="num">{{ fmtGbp(r.costGbp) }}</td>
              <td class="num" :class="r.resultGbp == null ? 'cs2x-dim' : r.resultGbp >= 0 ? 'cs2x-up' : 'cs2x-down'">{{ r.resultGbp == null ? '—' : fmtSignedGbp(r.resultGbp) }}</td>
              <td class="num">{{ r.roi == null ? '—' : fmtRoi(r.roi) }}</td>
              <td><span class="cs2x-pill" :data-tone="howTone[r.how]">{{ howLabel[r.how] }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="cs2x-empty">Nothing has been sold yet.</div>
    </div>
  </section>
</template>

<script setup lang="ts">
import CS2Icon from '~/components/CS2/Icon.vue';
import { fmtDateTime, fmtDays, fmtGbp, fmtRoi, fmtSignedGbp, type Cs2TrackRecord } from '~/scripts/cs2Arbitrage';

defineProps<{ record: Cs2TrackRecord }>();
const emit = defineEmits<{ open: [id: string] }>();
const howLabel: Record<string, string> = { trade: 'CSFloat trade', inferred: 'inferred from listing', 'by hand': 'closed by hand', 'no result': 'left the bot', refunded: 'refunded' };
const howTone: Record<string, string> = { trade: 'ok', inferred: 'info', 'by hand': 'accent', 'no result': 'neutral', refunded: 'neutral' };
</script>
