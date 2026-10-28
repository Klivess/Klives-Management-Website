<template>
    <div>
        <div class="ot-kpis bx-kpis6">
            <OmniTraderKpi label="Players per day" :value="last ? fmtCount(last.DailyActiveUsers) : '—'" :spark="spark('DailyActiveUsers')"
                           :compare="weekCompare('DailyActiveUsers')" baseline="vs a week before" :compare-format="countChange"
                           :foot="last ? `on ${fmtDayLabel(last.Date)}` : 'no analytics yet'" />
            <OmniTraderKpi label="Revenue, 7 days" :value="bloxRobux(sum('RevenueRobux', 0, 7))"
                           :compare="windowCompare('RevenueRobux')" baseline="vs the 7 days before" :compare-format="countChange"
                           :foot="`≈ $${(sum('RevenueRobux', 0, 7) * devEx).toFixed(2)} at DevEx`" />
            <OmniTraderKpi label="Day-1 retention" :value="bloxPct(last?.D1Retention)"
                           :foot="lastD7 != null ? `day 7: ${bloxPct(lastD7)}` : 'day 7 shows after a week'" />
            <OmniTraderKpi label="Session length" :value="last?.AvgSessionMinutes != null ? `${last.AvgSessionMinutes.toFixed(1)} min` : '—'"
                           :foot="telemetry?.Sessions ? `median ${bloxSeconds(telemetry.MedianSessionSeconds)} in telemetry` : 'Roblox average'" />
            <OmniTraderKpi label="Click-through" :value="bloxPct(last?.ClickThrough, 1)" :spark="spark('Impressions')"
                           :foot="last?.Impressions != null ? `${fmtCount(last.Clicks ?? 0)} of ${fmtCount(last.Impressions)} shown the game clicked it` : 'people shown the game who clicked it'" />
            <OmniTraderKpi label="Rated Great" :value="ratings.total ? bloxPct(ratings.great / ratings.total) : '—'"
                           :foot="`${ratings.total} rating${ratings.total === 1 ? '' : 's'} in ${days} days`" />
        </div>

        <div class="ot-grid two bx-section">
            <OmniTraderCard title="Daily" subtitle="Roblox analytics, one point per day" :empty="daily.length < 2" empty-title="Not enough days yet"
                            empty-text="Roblox reports a day's numbers the day after.">
                <template #controls>
                    <div class="ot-segment sm" role="group" aria-label="Measure">
                        <button v-for="m in MEASURES" :key="m.id" type="button" :aria-pressed="measure === m.id" @click="measure = m.id">{{ m.label }}</button>
                    </div>
                </template>
                <OmniTraderLineChart :series="series" :height="240" zero-based x-label="Day" :format="formatMeasure" />
            </OmniTraderCard>

            <OmniTraderCard title="Sessions" :subtitle="`Gameplay telemetry, last ${days} days`" :loading="telemetry === null && !telemetryError" :error="telemetryError ?? undefined">
                <template #controls>
                    <div class="ot-segment sm" role="group" aria-label="Window">
                        <button type="button" :aria-pressed="days === 7" @click="days = 7">7 days</button>
                        <button type="button" :aria-pressed="days === 30" @click="days = 30">30 days</button>
                    </div>
                </template>
                <template v-if="telemetry">
                    <dl class="ot-kv">
                        <dt>Sessions</dt><dd>{{ fmtCount(telemetry.Sessions) }}</dd>
                        <dt>Length</dt><dd>average {{ bloxSeconds(telemetry.AvgSessionSeconds) }} · median {{ bloxSeconds(telemetry.MedianSessionSeconds) }}</dd>
                        <dt>Deaths</dt><dd>{{ telemetry.DeathsPerSession }} per session</dd>
                        <dt>Busiest server</dt><dd>{{ telemetry.PeakPlayersPerServer }} players</dd>
                        <dt>Purchases</dt><dd>{{ fmtCount(telemetry.Purchases) }} · {{ bloxRobux(telemetry.PurchaseRobux) }}</dd>
                        <dt>Last event</dt><dd>{{ telemetry.LastEventUtc ? fmtRelative(telemetry.LastEventUtc, now) : 'none yet' }}</dd>
                    </dl>
                    <template v-if="funnel.length">
                        <h3 class="ot-sectionhead bx-sub">How far players get</h3>
                        <OmniTraderBarList :items="funnel" :signed="false" :limit="12" :format="(v: number) => `${fmtCount(v)} sessions`" />
                    </template>
                </template>
            </OmniTraderCard>
        </div>

        <div class="ot-grid three bx-section">
            <OmniTraderCard title="Feedback" :subtitle="`In-game button, last ${days} days`" :empty="!ratings.total" empty-title="No ratings yet">
                <OmniTraderBarList :items="ratingBars" :signed="false" :format="(v: number) => fmtCount(v)" />
                <h3 v-if="reasonBars.length" class="ot-sectionhead bx-sub">Why</h3>
                <OmniTraderBarList v-if="reasonBars.length" :items="reasonBars" :signed="false" :format="(v: number) => fmtCount(v)" />
            </OmniTraderCard>
            <OmniTraderCard title="Purchases" :subtitle="`By product, last ${days} days`" :empty="!purchaseBars.length" empty-title="No purchases yet">
                <OmniTraderBarList :items="purchaseBars" :signed="false" :format="(v: number) => fmtCount(v)" />
            </OmniTraderCard>
            <OmniTraderCard title="Script errors" :subtitle="`Reported by servers, last ${days} days`" :empty="!telemetry?.TopErrors.length"
                            empty-kind="ok" empty-title="No errors reported" flush>
                <ul class="errors">
                    <li v-for="e in telemetry?.TopErrors ?? []" :key="e.Message">
                        <span class="count">{{ fmtCount(e.Count) }}×</span>
                        <code>{{ e.Message }}</code>
                    </li>
                </ul>
            </OmniTraderCard>
        </div>

        <div class="ot-grid two bx-section">
            <OmniTraderCard title="Maintenance" :subtitle="game.NextMaintenanceUtc ? `Next ${fmtRelative(game.NextMaintenanceUtc, now)}` : 'Not scheduled'"
                            :empty="!game.Maintenance.length" empty-title="No maintenance yet">
                <ol class="ot-timeline">
                    <li v-for="(m, i) in maintenance" :key="i">
                        <span>{{ m.Summary }}</span>
                        <span v-if="m.Actions.length" class="sub">{{ m.Actions.join(' · ') }}</span>
                        <span class="sub">
                            {{ fmtWhen(m.Utc) }}
                            <template v-if="m.ShippedUpdate"> · shipped an update</template>
                            <template v-if="m.Urgent"> · urgent</template>
                        </span>
                    </li>
                </ol>
            </OmniTraderCard>
            <OmniTraderCard title="Post-mortems" subtitle="At 7 and 30 days live; lessons go to the Playbook" :empty="!game.PostMortems.length" empty-title="None yet"
                            empty-text="The first one runs a week after launch.">
                <div v-for="(pm, i) in game.PostMortems" :key="i" class="pm">
                    <h3 class="ot-sectionhead">Day {{ pm.DaysSinceLaunch }}</h3>
                    <dl class="ot-kv">
                        <dt>Worked</dt><dd class="prose">{{ pm.WorkedWell || '—' }}</dd>
                        <dt>Did not</dt><dd class="prose">{{ pm.DidNotWork || '—' }}</dd>
                    </dl>
                    <ul v-if="pm.Lessons.length" class="bx-list lessons"><li v-for="(l, j) in pm.Lessons" :key="j">{{ l }}</li></ul>
                </div>
            </OmniTraderCard>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { fmtCount, fmtRelative, fmtSignedCount, fmtWhen, useNow } from '~/composables/useOmniTumblr';
import {
    BLOX_RATING_LABEL, BLOX_REASON_LABEL, bloxGet, bloxPct, bloxRobux, bloxSeconds, useBloxOverview,
    type BloxDailyMetrics, type BloxDossier, type BloxTelemetry,
} from '~/composables/useOmniBlox';

const props = defineProps<{ game: BloxDossier }>();
const now = useNow();
const { overview } = useBloxOverview();
const devEx = computed(() => overview.value?.Money.DevExRate ?? 0.0038);

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

function spark(metric: Metric) {
    return daily.value.slice(-14).map(d => d[metric] ?? 0);
}

/** Sum of a metric over [from, to) days back from the newest day. */
function sum(metric: Metric, from: number, to: number) {
    const n = daily.value.length;
    return daily.value.slice(Math.max(0, n - to), n - from).reduce((s, d) => s + (d[metric] ?? 0), 0);
}

function compare(current: number, previous: number | null) {
    if (previous == null) return null;
    const absolute = current - previous;
    return { absolute, percent: previous > 0 ? (absolute / previous) * 100 : null, direction: Math.sign(absolute) };
}
function weekCompare(metric: Metric) {
    const n = daily.value.length;
    if (n < 8) return null;
    return compare(daily.value[n - 1]![metric] ?? 0, daily.value[n - 8]![metric] ?? null);
}
function windowCompare(metric: Metric) {
    return daily.value.length >= 14 ? compare(sum(metric, 0, 7), sum(metric, 7, 14)) : null;
}
const countChange = (v: { absolute: number; percent: number | null }) =>
    `${fmtSignedCount(Math.round(v.absolute))}${v.percent != null ? ` (${v.percent >= 0 ? '+' : ''}${v.percent.toFixed(0)}%)` : ''}`;

const series = computed(() => {
    const m = MEASURES.find(x => x.id === measure.value)!;
    return [{
        name: m.label,
        colour: measure.value === 'RevenueRobux' ? 'var(--ot-cat-4)' : measure.value === 'D1Retention' ? 'var(--ot-cat-3)' : 'var(--ot-cat-1)',
        points: daily.value.filter(d => d[measure.value] != null).map(d => ({ x: new Date(d.Date).getTime(), y: d[measure.value] as number })),
    }];
});
function formatMeasure(v: number) {
    if (measure.value === 'RevenueRobux') return bloxRobux(v);
    if (measure.value === 'D1Retention') return bloxPct(v);
    return fmtCount(v);
}

function fmtDayLabel(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// ── telemetry ──
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

const funnel = computed(() => Object.entries(telemetry.value?.Funnel ?? {})
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([step, n]) => ({ key: step, label: `Stage ${step}`, value: n })));

const ratings = computed(() => {
    const r = telemetry.value?.FeedbackByRating ?? {};
    const total = Object.values(r).reduce((s, n) => s + n, 0);
    return { total, great: r['3'] ?? 0 };
});
const ratingBars = computed(() => ['3', '2', '1']
    .map(k => ({ key: k, label: BLOX_RATING_LABEL[k]!, value: telemetry.value?.FeedbackByRating[k] ?? 0 }))
    .filter(b => b.value > 0));
const reasonBars = computed(() => Object.entries(telemetry.value?.FeedbackByReason ?? {})
    .map(([k, n]) => ({ key: k, label: BLOX_REASON_LABEL[k] ?? k, value: n })));
const purchaseBars = computed(() => Object.entries(telemetry.value?.PurchasesByKey ?? {})
    .map(([k, n]) => ({ key: k, label: props.game.Products.find(p => p.Key === k)?.Name ?? k, value: n })));

const maintenance = computed(() => props.game.Maintenance.slice().reverse());
</script>

<style scoped>
.ot-kpis { margin-bottom: var(--ot-space-6); }
.bx-sub { margin-top: var(--ot-space-4); }
.errors { list-style: none; margin: 0; padding: 0; }
.errors li { display: flex; gap: var(--ot-space-2); padding: var(--ot-space-2) var(--ot-card-pad); font-size: 12px; align-items: baseline; }
.errors li + li { border-top: 1px solid var(--ot-line); }
.errors .count { font-family: var(--ot-mono); color: var(--ot-negative); flex: 0 0 auto; }
.errors code { font-family: var(--ot-mono); font-size: 11.5px; overflow-wrap: anywhere; color: var(--ot-text-2); }
.pm + .pm { margin-top: var(--ot-space-4); padding-top: var(--ot-space-3); border-top: 1px solid var(--ot-line); }
.prose { font-family: inherit; }
.lessons { margin-top: var(--ot-space-2); }
</style>
