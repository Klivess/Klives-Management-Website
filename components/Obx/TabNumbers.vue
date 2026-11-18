<template>
  <div class="obx-stack">
    <div class="obx-kpis">
      <div class="obx-kpi">
        <span class="obx-kpi__label"><ObxIcon name="users" />Players a day</span>
        <span class="obx-kpi__value">{{ last ? obxCount(last.DailyActiveUsers) : '—' }}</span>
        <span class="obx-kpi__sub">{{ weekChange('DailyActiveUsers') ?? (last ? `on ${last.Date.slice(5, 10)}` : 'no analytics yet') }}</span>
        <div v-if="spark('DailyActiveUsers').length > 1" class="obx-kpi__spark"><ObxSpark :values="spark('DailyActiveUsers')" :height="22" colour="var(--obx-st-live)" label="Players a day" /></div>
      </div>
      <div class="obx-kpi">
        <span class="obx-kpi__label"><ObxIcon name="coins" />Revenue, 7 days</span>
        <span class="obx-kpi__value">{{ obxRobux(sum('RevenueRobux', 0, 7)) }}</span>
        <span class="obx-kpi__sub">≈ ${{ (sum('RevenueRobux', 0, 7) * devEx).toFixed(2) }} at DevEx{{ windowChange('RevenueRobux') ? ` · ${windowChange('RevenueRobux')}` : '' }}</span>
      </div>
      <div class="obx-kpi">
        <span class="obx-kpi__label"><ObxIcon name="history" />Day-1 retention</span>
        <span class="obx-kpi__value">{{ obxPct(last?.D1Retention) }}</span>
        <span class="obx-kpi__sub">{{ lastD7 != null ? `day 7: ${obxPct(lastD7)}` : 'day 7 shows after a week' }}</span>
      </div>
      <div class="obx-kpi">
        <span class="obx-kpi__label"><ObxIcon name="clock" />Session length</span>
        <span class="obx-kpi__value">{{ last?.AvgSessionMinutes != null ? `${last.AvgSessionMinutes.toFixed(1)}` : '—' }}<small v-if="last?.AvgSessionMinutes != null">min</small></span>
        <span class="obx-kpi__sub">{{ telemetry?.Sessions ? `median ${bloxSeconds(telemetry.MedianSessionSeconds)} in telemetry` : 'Roblox average' }}</span>
      </div>
      <div class="obx-kpi">
        <span class="obx-kpi__label"><ObxIcon name="eye" />Click-through</span>
        <span class="obx-kpi__value">{{ obxPct(last?.ClickThrough, 1) }}</span>
        <span class="obx-kpi__sub">{{ last?.Impressions != null ? `${obxCount(last.Clicks ?? 0)} of ${obxCount(last.Impressions)} shown clicked` : 'shown the game, then clicked' }}</span>
      </div>
    </div>

    <div class="obx-split">
      <section class="obx-card" aria-label="Daily">
        <header class="obx-card__head">
          <h2 class="obx-card__title"><ObxIcon name="chart" />Daily</h2>
          <span class="obx-card__meta">Roblox analytics, a day late</span>
          <div class="obx-card__tools">
            <div class="obx-seg" role="group" aria-label="Measure">
              <button v-for="m in MEASURES" :key="m.id" class="obx-seg__opt" :aria-pressed="measure === m.id" @click="measure = m.id">{{ m.label }}</button>
            </div>
          </div>
        </header>
        <div class="obx-card__body">
          <div v-if="series.length < 2" class="obx-empty">Not enough days yet: Roblox reports a day's numbers the day after.</div>
          <ObxChart v-else :data="series" :height="150" :colour="measure === 'RevenueRobux' ? 'var(--obx-brick-2)' : measure === 'D1Retention' ? 'var(--obx-violet)' : 'var(--obx-st-live)'" :format="formatMeasure" label="Daily analytics" />
        </div>
      </section>

      <section class="obx-card" aria-label="Sessions">
        <header class="obx-card__head">
          <h2 class="obx-card__title"><ObxIcon name="activity" />Sessions</h2>
          <div class="obx-card__tools">
            <div class="obx-seg" role="group" aria-label="Window">
              <button class="obx-seg__opt" :aria-pressed="days === 7" @click="days = 7">7 d</button>
              <button class="obx-seg__opt" :aria-pressed="days === 30" @click="days = 30">30 d</button>
            </div>
          </div>
        </header>
        <div class="obx-card__body">
          <div v-if="telemetryError" class="obx-banner" data-tone="crit"><ObxIcon class="obx-banner__glyph" name="octagon" /><span class="obx-banner__text"><span>{{ telemetryError }}</span></span></div>
          <div v-else-if="!telemetry" class="obx-skel" style="height: 120px"></div>
          <template v-else>
            <dl class="obx-kv">
              <dt>Sessions</dt><dd>{{ obxCount(telemetry.Sessions) }}</dd>
              <dt>Length</dt><dd>average {{ bloxSeconds(telemetry.AvgSessionSeconds) }} · median {{ bloxSeconds(telemetry.MedianSessionSeconds) }}</dd>
              <dt>Deaths</dt><dd>{{ telemetry.DeathsPerSession }} a session</dd>
              <dt>Busiest server</dt><dd>{{ telemetry.PeakPlayersPerServer }} players</dd>
              <dt>Purchases</dt><dd>{{ obxCount(telemetry.Purchases) }} · {{ obxRobux(telemetry.PurchaseRobux) }}</dd>
              <dt>Last event</dt><dd>{{ telemetry.LastEventUtc ? obxAgo(telemetry.LastEventUtc, now) : 'none yet' }}</dd>
            </dl>
            <template v-if="funnel.length">
              <h3 class="obx-sub">How far players get</h3>
              <div class="obx-bars">
                <div v-for="f in funnel" :key="f.key" class="obx-bars__row"><span class="obx-bars__label">{{ f.label }}</span><span class="obx-meter"><span class="obx-meter__fill" :style="{ width: `${Math.round(100 * f.value / funnelMax)}%`, background: 'var(--obx-accent)' }"></span></span><span class="obx-bars__value">{{ obxCount(f.value) }}</span></div>
              </div>
            </template>
          </template>
        </div>
      </section>
    </div>

    <div class="obx-quad obx-quad--3">
      <section class="obx-card" aria-label="Feedback">
        <header class="obx-card__head"><h2 class="obx-card__title"><ObxIcon name="sparkle" />Feedback</h2><span class="obx-card__meta">{{ ratings.total }} in {{ days }} d<template v-if="ratings.total"> · {{ obxPct(ratings.great / ratings.total) }} great</template></span></header>
        <div class="obx-card__body">
          <div v-if="!ratings.total" class="obx-empty">No ratings yet.</div>
          <div v-else class="obx-bars">
            <div v-for="b in [...ratingBars, ...reasonBars]" :key="b.key" class="obx-bars__row"><span class="obx-bars__label">{{ b.label }}</span><span class="obx-meter"><span class="obx-meter__fill" :style="{ width: `${Math.round(100 * b.value / Math.max(1, ratings.total))}%`, background: 'var(--obx-violet)' }"></span></span><span class="obx-bars__value">{{ obxCount(b.value) }}</span></div>
          </div>
        </div>
      </section>
      <section class="obx-card" aria-label="Purchases">
        <header class="obx-card__head"><h2 class="obx-card__title"><ObxIcon name="coins" />Purchases</h2><span class="obx-card__meta">by product, {{ days }} d</span></header>
        <div class="obx-card__body">
          <div v-if="!purchaseBars.length" class="obx-empty">No purchases yet.</div>
          <div v-else class="obx-bars">
            <div v-for="b in purchaseBars" :key="b.key" class="obx-bars__row"><span class="obx-bars__label">{{ b.label }}</span><span class="obx-meter"><span class="obx-meter__fill" :style="{ width: `${Math.round(100 * b.value / purchaseMax)}%`, background: 'var(--obx-brick-2)' }"></span></span><span class="obx-bars__value">{{ obxCount(b.value) }}</span></div>
          </div>
        </div>
      </section>
      <section class="obx-card" aria-label="Script errors">
        <header class="obx-card__head"><h2 class="obx-card__title"><ObxIcon name="alert" />Script errors</h2><span class="obx-card__meta">reported by servers</span></header>
        <div class="obx-card__body">
          <div v-if="!telemetry?.TopErrors.length" class="obx-empty"><ObxIcon name="check-circle" />No errors reported.</div>
          <ul v-else class="obx-issues"><li v-for="e in telemetry.TopErrors" :key="e.Message"><span class="obx-mono" style="color: var(--obx-crit)">{{ obxCount(e.Count) }}×</span><code style="overflow-wrap: anywhere">{{ e.Message }}</code></li></ul>
        </div>
      </section>
    </div>

    <div class="obx-split obx-split--even">
      <section class="obx-card" aria-label="Maintenance">
        <header class="obx-card__head"><h2 class="obx-card__title"><ObxIcon name="wrench" />Maintenance</h2><span class="obx-card__meta">{{ game.NextMaintenanceUtc ? `next ${obxAgo(game.NextMaintenanceUtc, now)}` : 'not scheduled' }}</span></header>
        <div class="obx-card__body obx-card__body--flush">
          <div v-if="!game.Maintenance.length" class="obx-empty">No maintenance yet.</div>
          <ol v-else>
            <li v-for="(m, i) in maintenance" :key="i" class="obx-lesson" style="padding: 8px 14px">
              <span style="font-size: 12.5px">{{ m.Summary }}</span>
              <span v-if="m.Actions.length" class="obx-ink2" style="font-size: 12px">{{ m.Actions.join(' · ') }}</span>
              <span class="obx-faint" style="font-size: 11px">{{ obxDateTime(m.Utc) }}<template v-if="m.ShippedUpdate"> · shipped an update</template><template v-if="m.Urgent"> · urgent</template></span>
            </li>
          </ol>
        </div>
      </section>
      <section class="obx-card" aria-label="Post-mortems">
        <header class="obx-card__head"><h2 class="obx-card__title"><ObxIcon name="book" />Post-mortems</h2><span class="obx-card__meta">at 7 and 30 days live; lessons go to the Playbook</span></header>
        <div class="obx-card__body">
          <div v-if="!game.PostMortems.length" class="obx-empty">The first one runs a week after launch.</div>
          <div v-for="(pm, i) in game.PostMortems" :key="i" class="obx-stack" style="gap: 6px" :style="{ marginTop: i ? '12px' : 0 }">
            <h3 class="obx-sub" style="margin: 0">Day {{ pm.DaysSinceLaunch }}</h3>
            <dl class="obx-kv"><dt>Worked</dt><dd class="obx-prose">{{ pm.WorkedWell || '—' }}</dd><dt>Did not</dt><dd class="obx-prose">{{ pm.DidNotWork || '—' }}</dd></dl>
            <ul v-if="pm.Lessons.length" class="obx-list"><li v-for="(l, j) in pm.Lessons" :key="j">{{ l }}</li></ul>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { BLOX_RATING_LABEL, BLOX_REASON_LABEL, bloxGet, bloxSeconds, useBloxOverview, type BloxDailyMetrics, type BloxDossier, type BloxTelemetry } from '~/composables/useOmniBlox';
import { obxAgo, obxCount, obxDateTime, obxPct, obxRobux } from '~/scripts/omniblox/console';

const props = defineProps<{ game: BloxDossier; now: number }>();
const { overview } = useBloxOverview();
const devEx = computed(() => overview.value?.Money?.DevExRate ?? 0.0038);

type Metric = 'DailyActiveUsers' | 'Visits' | 'Impressions' | 'RevenueRobux' | 'D1Retention';
const MEASURES: { id: Metric; label: string }[] = [
  { id: 'DailyActiveUsers', label: 'Players' },
  { id: 'Visits', label: 'Visits' },
  { id: 'Impressions', label: 'Shown' },
  { id: 'RevenueRobux', label: 'Robux' },
  { id: 'D1Retention', label: 'Retention' },
];
const measure = ref<Metric>('DailyActiveUsers');

const daily = computed(() => props.game.Stats.Daily.slice().sort((a, b) => a.Date.localeCompare(b.Date)));
const last = computed<BloxDailyMetrics | null>(() => daily.value.at(-1) ?? null);
const lastD7 = computed(() => [...daily.value].reverse().find(d => d.D7Retention != null)?.D7Retention ?? null);
const spark = (metric: Metric) => daily.value.slice(-14).map(d => d[metric] ?? 0);
function sum(metric: Metric, from: number, to: number) {
  const n = daily.value.length;
  return daily.value.slice(Math.max(0, n - to), n - from).reduce((s, d) => s + (d[metric] ?? 0), 0);
}
function change(current: number, previous: number | null, label: string): string | null {
  if (previous == null) return null;
  const diff = current - previous;
  const pct = previous > 0 ? ` (${diff >= 0 ? '+' : ''}${((diff / previous) * 100).toFixed(0)}%)` : '';
  return `${diff >= 0 ? '+' : '−'}${obxCount(Math.abs(Math.round(diff)))}${pct} ${label}`;
}
function weekChange(metric: Metric) {
  const n = daily.value.length;
  return n < 8 ? null : change(daily.value[n - 1]![metric] ?? 0, daily.value[n - 8]![metric] ?? null, 'vs a week before');
}
function windowChange(metric: Metric) {
  return daily.value.length >= 14 ? change(sum(metric, 0, 7), sum(metric, 7, 14), 'vs the 7 before') : null;
}
const series = computed(() => daily.value.filter(d => d[measure.value] != null).map(d => ({ label: d.Date.slice(5, 10), value: d[measure.value] as number })));
function formatMeasure(v: number) {
  if (measure.value === 'RevenueRobux') return obxRobux(v);
  if (measure.value === 'D1Retention') return obxPct(v);
  return obxCount(v);
}

const days = ref<7 | 30>(7);
const telemetry = ref<BloxTelemetry | null>(null);
const telemetryError = ref<string | null>(null);
async function loadTelemetry() {
  const id = props.game.GameId;
  const span = days.value;
  const result = await bloxGet<BloxTelemetry>(`/omniblox/game/telemetry?id=${encodeURIComponent(id)}&days=${span}`);
  if (id !== props.game.GameId || span !== days.value) return;
  telemetry.value = result.ok ? result.data : null;
  telemetryError.value = result.ok ? null : result.error;
}
watch([days, () => props.game.GameId], loadTelemetry, { immediate: true });

const funnel = computed(() => Object.keys(telemetry.value?.Funnel ?? {})
  .sort((a, b) => Number(a) - Number(b))
  .map(step => ({ key: step, label: `Stage ${step}`, value: telemetry.value!.Funnel[step]! })));
const funnelMax = computed(() => Math.max(1, ...funnel.value.map(f => f.value)));
const ratings = computed(() => {
  const r = telemetry.value?.FeedbackByRating ?? {};
  const total = Object.values(r).reduce((s, n) => s + n, 0);
  return { total, great: r['3'] ?? 0 };
});
const ratingBars = computed(() => ['3', '2', '1'].map(k => ({ key: `r${k}`, label: BLOX_RATING_LABEL[k]!, value: telemetry.value?.FeedbackByRating[k] ?? 0 })).filter(b => b.value > 0));
const reasonBars = computed(() => Object.keys(telemetry.value?.FeedbackByReason ?? {}).map(k => ({ key: k, label: BLOX_REASON_LABEL[k] ?? k, value: telemetry.value!.FeedbackByReason[k]! })));
const purchaseBars = computed(() => Object.keys(telemetry.value?.PurchasesByKey ?? {}).map(k => ({ key: k, label: props.game.Products.find(p => p.Key === k)?.Name ?? k, value: telemetry.value!.PurchasesByKey[k]! })));
const purchaseMax = computed(() => Math.max(1, ...purchaseBars.value.map(b => b.value)));
const maintenance = computed(() => props.game.Maintenance.slice().reverse());
</script>
