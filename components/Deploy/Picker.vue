<template>
  <div class="dpl-picker" data-testid="dpl-picker">
    <div class="dpl-picker__tools">
      <label class="dpl-field dpl-field--search">
        <DeployIcon name="search" />
        <input ref="input" v-model="filter.query" type="search" placeholder="Strategy, symbol, paper…" aria-label="Filter strategies" data-testid="dpl-picker-search" @keydown="onKey" />
      </label>
      <div class="dpl-seg" role="group" aria-label="Show">
        <button v-for="v in VIEWS" :key="v.id" class="dpl-seg__opt" :aria-pressed="filter.view === v.id" :data-testid="`dpl-view-${v.id}`" @click="filter.view = v.id">
          {{ v.label }}<span class="dpl-seg__count">{{ countFor(v.id) }}</span>
        </button>
      </div>
      <div class="dpl-seg" role="group" aria-label="Markets">
        <button v-for="a in ASSETS" :key="a.id" class="dpl-seg__opt" :aria-pressed="filter.asset === a.id" @click="filter.asset = a.id">{{ a.label }}</button>
      </div>
      <label class="dpl-select dpl-select--sm">
        <span class="dpl-sr">Sort by</span>
        <select v-model="filter.sort" aria-label="Sort by">
          <option value="rank">Best evidence</option>
          <option value="sharpe">Sharpe</option>
          <option value="return">Return</option>
          <option value="newest">Newest</option>
        </select>
      </label>
    </div>

    <div v-if="error" class="dpl-note" data-tone="warn"><DeployIcon name="alert" />{{ error }}</div>
    <div v-else-if="!catalog" class="dpl-skeleton" aria-busy="true"><span v-for="i in 6" :key="i"></span></div>

    <div v-else ref="list" class="dpl-picker__list" role="listbox" aria-label="Strategies">
      <button
        v-for="(row, index) in shown"
        :key="row.Key"
        :id="`dpl-pick-${index}`"
        class="dpl-pick"
        role="option"
        :aria-selected="index === cursor"
        :data-testid="`dpl-pick-${row.Key}`"
        @click="emit('choose', row)"
        @pointermove="cursor = index"
      >
        <span class="dpl-pick__score" :data-tone="row.Status ? statusTone(row.Status) : 'neutral'" :title="row.Status ?? sourceLabel(row.Source)">
          <b>{{ row.Score != null ? Math.round(row.Score) : '—' }}</b>
          <small>{{ row.Status ?? sourceLabel(row.Source) }}</small>
        </span>
        <span class="dpl-pick__main">
          <span class="dpl-pick__name">
            {{ row.Name }}
            <span v-if="row.Running" class="dpl-chip" data-tone="ok">running</span>
            <span v-if="row.Synthesis" class="dpl-chip">synthesis</span>
          </span>
          <span class="dpl-pick__sub">
            <b>{{ row.Shape === 'basket' ? `${row.BasketSize} symbols` : row.Shape === 'universe' ? 'coin universe' : row.Symbol }}</b>
            · {{ intervalLabel(row.Interval) }} · {{ assetLabel(row.AssetClass) }}
            <template v-if="row.Shape === 'single' && row.Symbols.length > 1"> · tested on {{ row.Symbols.length }}</template>
            <template v-if="row.CurrentVersion"> · <span class="dpl-dim">edited since (v{{ row.CurrentVersion }})</span></template>
          </span>
        </span>
        <span class="dpl-pick__metrics">
          <span title="Sharpe ratio of its main backtest"><small>Sharpe</small><b>{{ numText(row.Sharpe, 2) }}</b></span>
          <span title="Total return of its main backtest"><small>Return</small><b :data-tone="signTone(row.ReturnPct)">{{ signedPctText(row.ReturnPct, 0) }}</b></span>
          <span title="Worst fall from a peak in its main backtest"><small>Max DD</small><b>{{ pctText(row.MaxDrawdownPct, 0) }}</b></span>
          <span title="Trades in its main backtest"><small>Trades</small><b>{{ row.Trades ?? '—' }}</b></span>
        </span>
        <DeployIcon name="chevron-right" class="dpl-pick__go" />
      </button>
      <div v-if="!shown.length" class="dpl-empty">
        <DeployIcon name="search" />
        Nothing matches.
        <button v-if="filter.view !== 'all'" class="dpl-btn dpl-btn--sm" @click="filter.view = 'all'">Show everything</button>
      </div>
      <div v-if="more > 0" class="dpl-picker__more">
        <button class="dpl-btn dpl-btn--sm dpl-btn--ghost" @click="limit += 60">{{ more }} more</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import {
  assetLabel, filterCatalog, intervalLabel, numText, pctText, signTone, signedPctText, sourceLabel, statusTone,
  type Catalog, type CatalogFilter, type CatalogRow, type CatalogView,
} from '~/scripts/deployConsole';

/** The strategies one can deploy, strongest evidence first. Arrow keys move, Enter chooses. */
const props = defineProps<{ catalog: Catalog | null; error?: string }>();
const emit = defineEmits<{ choose: [row: CatalogRow] }>();

const VIEWS: { id: CatalogView; label: string }[] = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'alpha', label: 'Alpha Lab' },
  { id: 'all', label: 'All' },
];
const ASSETS = [
  { id: 'all', label: 'All' }, { id: 'crypto', label: 'Crypto' }, { id: 'equity', label: 'Shares' }, { id: 'other', label: 'FX & more' },
] as const;

const filter = reactive<CatalogFilter>({ view: 'recommended', asset: 'all', sort: 'rank', query: '' });
const cursor = ref(0);
const limit = ref(60);
const input = ref<HTMLInputElement | null>(null);
const list = ref<HTMLElement | null>(null);

const filtered = computed(() => filterCatalog(props.catalog?.Rows ?? [], filter));
const shown = computed(() => filtered.value.slice(0, limit.value));
const more = computed(() => filtered.value.length - shown.value.length);

function countFor(view: CatalogView) {
  const c = props.catalog?.Counts;
  if (!c) return '';
  return view === 'recommended' ? c.Recommended : view === 'alpha' ? c.Alpha : c.Total;
}

// Nothing recommended yet: open on everything rather than an empty list.
watch(() => props.catalog, c => { if (c && !c.Counts.Recommended && filter.view === 'recommended') filter.view = 'all'; }, { immediate: true });
watch(filter, () => { cursor.value = 0; limit.value = 60; });

async function onKey(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (!shown.value.length) return;
    cursor.value = (cursor.value + (event.key === 'ArrowDown' ? 1 : -1) + shown.value.length) % shown.value.length;
    await nextTick();
    list.value?.querySelector(`#dpl-pick-${cursor.value}`)?.scrollIntoView({ block: 'nearest' });
  } else if (event.key === 'Enter' && shown.value[cursor.value]) {
    event.preventDefault();
    emit('choose', shown.value[cursor.value]);
  }
}

defineExpose({ focus: () => input.value?.focus() });
</script>
