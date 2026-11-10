<template>
  <section id="adm-logs" class="adm-panel" aria-label="Errors" :data-flash="flash">
    <header class="adm-panel__head">
      <h2 class="adm-panel__title"><AdminIcon name="logs" />Errors</h2>
      <span v-if="summary" class="adm-panel__meta" :title="coverageTitle">{{ coverage }}</span>
      <div class="adm-panel__tools">
        <NuxtLink class="adm-panel__link" to="/administration/botlogs?type=error">Logs <AdminIcon name="arrow-right" /></NuxtLink>
      </div>
    </header>

    <div v-if="summary" class="adm-panel__body">
      <div class="adm-facts" style="grid-template-columns: repeat(3, minmax(0, 1fr))">
        <div>
          <div class="adm-fact__label">Last hour</div>
          <div class="adm-fact__value" data-testid="logs-last-hour">{{ fmtInt(summary.ErrorsLastHour) }}</div>
        </div>
        <div>
          <div class="adm-fact__label">{{ windowLabel }}</div>
          <div class="adm-fact__value">{{ fmtInt(summary.ErrorsLast24Hours) }}</div>
        </div>
        <div>
          <div class="adm-fact__label">Most recent</div>
          <div class="adm-fact__value">{{ summary.LatestErrorAt ? fmtRelative(summary.LatestErrorAt, now).replace(' ago', '') : 'none' }}</div>
        </div>
      </div>

      <div class="adm-hours" role="img" :aria-label="`Errors per hour over the last ${summary.Timeline.length} hours`">
        <div
          v-for="bucket in summary.Timeline"
          :key="bucket.Start"
          class="adm-hours__col"
          :title="`${hourLabel(bucket.Start)}: ${bucket.ErrorCount} error${bucket.ErrorCount === 1 ? '' : 's'} in ${bucket.TotalCount} log entries`"
        >
          <span class="adm-hours__bar" :data-err="bucket.ErrorCount > 0" :style="{ height: `${barHeight(bucket.ErrorCount)}%` }"></span>
        </div>
      </div>
      <div class="adm-chart__axis">
        <span>{{ summary.Timeline.length ? hourLabel(summary.Timeline[0].Start) : '' }}</span>
        <span>errors per hour</span>
        <span>now</span>
      </div>

      <template v-if="summary.ErrorFamilies.length">
        <div class="adm-subhead">Most frequent</div>
        <ul class="adm-rows">
          <li v-for="family in summary.ErrorFamilies" :key="family.Label">
            <NuxtLink class="adm-row adm-row--link" :to="`/administration/botlogs?type=error`" :title="family.Label">
              <span class="adm-row__main">
                <span class="adm-row__title adm-mono">{{ shortFamily(family.Label) }}</span>
                <span class="adm-row__sub">last {{ fmtRelative(family.LastSeenAt, now) }}</span>
              </span>
              <span class="adm-row__end">{{ fmtInt(family.Count) }}</span>
            </NuxtLink>
          </li>
        </ul>
      </template>
      <div v-else class="adm-empty">No errors in the log buffer.</div>
    </div>
    <div v-else class="adm-panel__body"><div class="adm-empty">{{ loading ? 'Reading the log…' : 'The log summary is unavailable.' }}</div></div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { fmtDuration, fmtInt, fmtRelative, toMs, type AdminLogSummary } from '~/scripts/adminConsole';

const props = withDefaults(defineProps<{ summary: AdminLogSummary | null; now: number; loading?: boolean; flash?: boolean }>(), { loading: false, flash: false });

/*
 * The log lives in memory and keeps a fixed number of entries, so on a busy day it reaches back
 * hours, not a day. Counts here say what they were counted over instead of promising "24 hours".
 */
const coveredHours = computed(() => {
  const oldest = toMs(props.summary?.OldestLogAt);
  return oldest == null ? null : Math.max(0, (props.now - oldest) / 3_600_000);
});
const windowLabel = computed(() => {
  const hours = coveredHours.value;
  if (hours == null || hours >= 24) return 'Last 24 hours';
  return `Last ${fmtDuration(hours * 3600)} (all retained)`;
});
const coverage = computed(() => {
  const hours = coveredHours.value;
  if (hours == null) return '';
  return hours >= 24 ? '' : `log reaches back ${fmtDuration(hours * 3600)}`;
});
const coverageTitle = computed(() => (props.summary
  ? `The in-memory log holds ${fmtInt(props.summary.TotalLogs)} entries; older ones have been dropped.`
  : ''));

const peak = computed(() => Math.max(1, ...(props.summary?.Timeline ?? []).map(bucket => bucket.ErrorCount)));
function barHeight(count: number): number {
  return count ? Math.max(8, (count / peak.value) * 100) : 4;
}
function hourLabel(start: string): string {
  const at = toMs(start);
  return at == null ? '' : new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
/** "System.Net.Http.HttpRequestException" reads better as its last two parts. */
function shortFamily(label: string): string {
  if (/^[\w.]+Exception$/.test(label)) return label.split('.').slice(-2).join('.');
  return label;
}
</script>
