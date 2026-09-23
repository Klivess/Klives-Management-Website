<!--
  Every route, sortable. "Cost" = count × mean = the route's share of total server
  time — the column that says what to optimise first. Trend compares p95 with the
  previous equal-length window. Sparklines show volume and p95 across the range.
-->
<template>
  <div class="tel-rt">
    <div class="tel-rt__bar">
      <input v-model="filter" type="search" placeholder="Filter routes…" aria-label="Filter routes" />
      <label><input v-model="showPseudo" type="checkbox" /> Unmatched / denied / preflight</label>
      <span class="count">{{ rows.length }} of {{ (data?.routes ?? []).length }} routes · {{ fmtCount(data?.totalCount) }} requests</span>
    </div>
    <div class="tel-rt__scroll">
      <table>
        <thead>
          <tr>
            <th v-for="c in columns" :key="c.key" :class="c.cls" :aria-sort="sortKey === c.key ? (desc ? 'descending' : 'ascending') : 'none'">
              <button type="button" :title="c.help" @click="sortBy(c.key)">{{ c.label }}<span v-if="sortKey === c.key" aria-hidden="true">{{ desc ? ' ▾' : ' ▴' }}</span></button>
            </th>
            <th class="spark-col">Volume</th>
            <th class="spark-col">p95</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.s" :class="{ sel: r.s === selected }" tabindex="0" @click="$emit('select', r.s)" @keydown.enter="$emit('select', r.s)">
            <td class="route"><span v-if="r.method" class="m" :class="r.method.toLowerCase()">{{ r.method }}</span>{{ r.route }}</td>
            <td>{{ fmtCount(r.count) }}</td>
            <td>{{ fmtRps(r.rps) }}</td>
            <td>{{ fmtMs(r.p50) }}</td>
            <td :class="latTone(r.p95)">{{ fmtMs(r.p95) }}</td>
            <td :class="latTone(r.p99)">{{ fmtMs(r.p99) }}</td>
            <td>{{ fmtMs(r.max) }}</td>
            <td :class="{ bad: r.errPct >= 1, warn: r.errPct > 0 && r.errPct < 1 }">{{ fmtPct(r.errPct) }}</td>
            <td>{{ r.hitPct == null ? '—' : fmtPct(r.hitPct, 0) }}</td>
            <td>{{ fmtBytes(r.avgOut) }}</td>
            <td class="cost"><span class="track"><i :style="{ width: `${Math.max(1, r.share * 100)}%` }"></i></span>{{ (r.share * 100).toFixed(1) }}%</td>
            <td :class="trendTone(r.trend)">{{ trendText(r.trend) }}</td>
            <td class="dom" :title="STAGE_LABELS[r.dom]">{{ STAGE_LABELS[r.dom] ?? r.dom }}</td>
            <td class="spark-col"><DashboardSparkline :values="r.spark.count.map((v: number | null) => v ?? 0)" :label="`${r.s} volume`" tone="info" /></td>
            <td class="spark-col"><DashboardSparkline :values="r.spark.p95.filter((v: number | null) => v != null)" :label="`${r.s} p95`" tone="warning" /></td>
          </tr>
          <tr v-if="!rows.length"><td :colspan="columns.length + 2" class="empty">No routes match</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import DashboardSparkline from '~/components/Dashboard/DashboardSparkline.vue';
import { STAGE_LABELS, fmtBytes, fmtCount, fmtMs, fmtPct, fmtRps } from '~/scripts/apiTelemetryShared';

const props = defineProps<{ data: any; selected?: string }>();
defineEmits<{ select: [series: string] }>();

const filter = ref('');
const showPseudo = ref(false);
const sortKey = ref('share');
const desc = ref(true);

const columns = [
  { key: 'route', label: 'Route', cls: 'route' },
  { key: 'count', label: 'Requests' },
  { key: 'rps', label: 'Rate' },
  { key: 'p50', label: 'p50' },
  { key: 'p95', label: 'p95' },
  { key: 'p99', label: 'p99' },
  { key: 'max', label: 'Max' },
  { key: 'errPct', label: '5xx', help: 'Server error rate' },
  { key: 'hitPct', label: 'Cache', help: 'Response-cache hit rate (GET)' },
  { key: 'avgOut', label: 'Avg size', help: 'Mean response bytes on the wire' },
  { key: 'share', label: 'Cost', help: 'Share of total server time (count × mean latency)', cls: 'cost' },
  { key: 'trend', label: 'Trend', help: 'p95 vs the previous equal-length window' },
  { key: 'dom', label: 'Dominant stage', help: 'The stage with the largest mean time' },
];

function sortBy(key: string) {
  if (sortKey.value === key) desc.value = !desc.value;
  else { sortKey.value = key; desc.value = key !== 'route' && key !== 'dom'; }
}

const rows = computed(() => {
  const q = filter.value.trim().toLowerCase();
  const list = ((props.data?.routes ?? []) as any[])
    .filter(r => showPseudo.value || !r.pseudo)
    .filter(r => !q || r.s.toLowerCase().includes(q));
  const k = sortKey.value;
  const dir = desc.value ? -1 : 1;
  return [...list].sort((a, b) => {
    const av = a[k === 'route' ? 's' : k], bv = b[k === 'route' ? 's' : k];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (typeof av === 'string' ? av.localeCompare(bv) : av - bv) * dir;
  });
});

const latTone = (ms: number) => ms >= 1000 ? 'bad' : ms >= 250 ? 'warn' : '';
const trendTone = (t: number | null) => t == null ? 'muted' : t >= 1.25 ? 'bad' : t <= 0.8 ? 'good' : 'muted';
const trendText = (t: number | null) => t == null ? 'new' : `${t >= 1 ? '▲' : '▼'} ${Math.abs((t - 1) * 100).toFixed(0)}%`;
</script>

<style scoped>
.tel-rt__bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 6px; font-size: 11px; color: var(--tel-text-2); }
.tel-rt__bar input[type='search'] { background: var(--tel-inset); border: 1px solid var(--tel-line); border-radius: 5px; padding: 3px 8px; min-width: 220px; color: var(--tel-text); }
.tel-rt__bar label { display: inline-flex; gap: 5px; align-items: center; }
.count { margin-left: auto; color: var(--tel-muted); }
.tel-rt__scroll { overflow: auto; max-height: 520px; border: 1px solid var(--tel-line); border-radius: 8px; }
table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
th { position: sticky; top: 0; z-index: 1; background: var(--tel-surface-2); font-weight: 500; color: var(--tel-muted); text-align: right; padding: 0; border-bottom: 1px solid var(--tel-line); white-space: nowrap; }
th button { padding: 5px 8px; width: 100%; justify-content: flex-end; color: inherit; }
th.route button { justify-content: flex-start; }
th[aria-sort='ascending'] button, th[aria-sort='descending'] button { color: var(--tel-text); }
td { padding: 3px 8px; text-align: right; border-bottom: 1px solid var(--tel-grid); white-space: nowrap; color: var(--tel-text-2); }
tr { content-visibility: auto; contain-intrinsic-size: auto 26px; cursor: pointer; }
tbody tr:hover, tbody tr:focus-visible { background: var(--tel-hover); outline: none; }
tr.sel { background: var(--tel-selected); }
td.route { text-align: left; color: var(--tel-text); font-family: var(--kt-mono); font-size: 11px; max-width: 360px; overflow: hidden; text-overflow: ellipsis; }
.m { display: inline-block; font-size: 9px; font-weight: 700; padding: 0 4px; border-radius: 3px; margin-right: 6px; background: var(--tel-track); color: var(--tel-text-2); font-family: inherit; }
.m.post { color: var(--tel-warn); }
.m.delete { color: var(--tel-crit-text); }
td.cost { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
td.cost .track { width: 54px; height: 6px; background: var(--tel-track); border-radius: 2px; overflow: hidden; }
td.cost .track i { display: block; height: 100%; background: var(--tel-s1); }
td.dom { color: var(--tel-muted); text-align: left; max-width: 110px; overflow: hidden; text-overflow: ellipsis; }
.spark-col { width: 84px; }
td.spark-col :deep(svg), td.spark-col :deep(span) { width: 76px; height: 18px; }
.bad { color: var(--tel-crit-text); }
.warn { color: var(--tel-warn); }
.good { color: var(--tel-good-text); }
.muted { color: var(--tel-muted); }
.empty { text-align: center; color: var(--tel-muted); padding: 14px; }
</style>
