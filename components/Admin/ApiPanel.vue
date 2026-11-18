<template>
  <section id="adm-api" class="adm-panel" aria-label="API" :data-flash="flash">
    <header class="adm-panel__head">
      <h2 class="adm-panel__title"><AdminIcon name="activity" />API</h2>
      <span v-if="stats?.lifetime.lastRequestAt" class="adm-panel__meta">last request {{ fmtRelative(stats.lifetime.lastRequestAt, now) }}</span>
      <div class="adm-panel__tools">
        <div class="adm-seg" role="group" aria-label="Days of history">
          <button v-for="option in dayOptions" :key="option" class="adm-seg__opt" :aria-pressed="days === option" @click="emit('update:days', option)">{{ option }}d</button>
        </div>
        <NuxtLink v-if="canTelemetry" class="adm-panel__link" to="/administration/api-telemetry">Telemetry <AdminIcon name="arrow-right" /></NuxtLink>
      </div>
    </header>

    <div v-if="stats" class="adm-panel__body adm-api">
      <!-- The day against the day before, from telemetry, when the profile may read it. The lifetime
           mean is deliberately not shown: it averages in downloads and streams that run for hours. -->
      <div v-if="recent" class="adm-api__kpis" data-testid="api-day">
        <div class="adm-kpi">
          <div class="adm-kpi__label">Requests, 24 h</div>
          <div class="adm-kpi__value">{{ fmtCompact(recent.kpi.count) }}<small v-if="recent.prev">was {{ fmtCompact(recent.prev.count) }}</small></div>
        </div>
        <div class="adm-kpi">
          <div class="adm-kpi__label">Typical response</div>
          <div class="adm-kpi__value">{{ fmtMs(recent.kpi.p50) }}</div>
        </div>
        <div class="adm-kpi" title="95 in 100 requests were answered at least this fast">
          <div class="adm-kpi__label">Slowest 5% take over</div>
          <div class="adm-kpi__value">{{ fmtMs(recent.kpi.p95) }}<small v-if="recent.prev">was {{ fmtMs(recent.prev.p95) }}</small></div>
        </div>
        <div class="adm-kpi" :data-tone="recent.kpi.errorPct >= 25 ? 'crit' : recent.kpi.errorPct >= 5 ? 'warn' : undefined">
          <div class="adm-kpi__label">Failed (5xx)</div>
          <div class="adm-kpi__value">
            {{ fmtShare(recent.kpi.errorPct) }}<small v-if="recent.prev">was {{ fmtShare(recent.prev.errorPct) }}</small>
            <span v-if="recent.kpi.errorPct >= 5" class="adm-state" :data-tone="recent.kpi.errorPct >= 25 ? 'crit' : 'warn'" style="margin-left: 8px"><AdminIcon name="alert" />high</span>
          </div>
        </div>
        <div class="adm-kpi">
          <div class="adm-kpi__label">Refused or not found (4xx)</div>
          <div class="adm-kpi__value">{{ fmtShare(recent.kpi.clientErrorPct) }}</div>
        </div>
        <div class="adm-kpi">
          <div class="adm-kpi__label">All time</div>
          <div class="adm-kpi__value">{{ fmtCompact(stats.lifetime.totalRequests) }}</div>
        </div>
      </div>
      <div v-else class="adm-api__kpis">
        <div class="adm-kpi">
          <div class="adm-kpi__label">Requests, all time</div>
          <div class="adm-kpi__value">{{ fmtCompact(stats.lifetime.totalRequests) }}</div>
        </div>
        <div class="adm-kpi">
          <div class="adm-kpi__label">Answered without an error</div>
          <div class="adm-kpi__value">{{ fmtPct(stats.lifetime.availabilityPct, 2) }}</div>
        </div>
        <div class="adm-kpi">
          <div class="adm-kpi__label">Server errors</div>
          <div class="adm-kpi__value">{{ fmtCompact(stats.lifetime.serverErrorRequests) }}<small>{{ serverErrorShare }}</small></div>
        </div>
        <div class="adm-kpi">
          <div class="adm-kpi__label">Refused or not found</div>
          <div class="adm-kpi__value">{{ fmtCompact(stats.lifetime.clientErrorRequests) }}<small>{{ clientErrorShare }}</small></div>
        </div>
      </div>

      <!-- Two measures with two different scales: one small chart each, on a shared time axis,
           rather than one chart with scales that would have to be invented. -->
      <div v-if="history.length > 1" class="adm-chart" @pointerleave="hoverIndex = null">
        <div class="adm-chart__row">
          <div class="adm-chart__label"><b>Requests a day</b><span>{{ readout.requests }}</span></div>
          <div class="adm-chart__plot">
            <div class="adm-chart__bars">
              <span
                v-for="(day, index) in history"
                :key="day.date"
                class="adm-chart__bar"
                :data-on="hoverIndex === index"
                :style="{ height: `${Math.max(2, (day.requests / maxRequests) * 100)}%` }"
              ></span>
            </div>
          </div>
        </div>
        <div class="adm-chart__row" data-tone="crit">
          <div class="adm-chart__label"><b>Server errors, share of requests</b><span>{{ readout.errors }}</span></div>
          <div class="adm-chart__plot">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
              <path class="adm-chart__wash" :d="errorShape.area" />
              <path class="adm-chart__line" :d="errorShape.line" />
            </svg>
          </div>
        </div>
        <span v-if="hoverIndex != null" class="adm-chart__cross" :style="{ left: `${crossX}%` }"></span>
        <div ref="hit" class="adm-chart__hit" @pointermove="onMove"></div>
        <div class="adm-chart__axis">
          <span>{{ dayLabel(history[0].date) }}</span>
          <span>{{ hoverIndex != null ? dayLabel(history[hoverIndex].date) : `${history.length} days` }}</span>
          <span>{{ dayLabel(history[history.length - 1].date) }}</span>
        </div>
      </div>
      <div v-else class="adm-empty">Daily history appears after the second day of traffic.</div>

      <div class="adm-routes">
        <div class="adm-subhead">
          <div class="adm-seg" role="group" aria-label="Which routes to list">
            <button class="adm-seg__opt" :aria-pressed="tab === 'busiest'" @click="tab = 'busiest'">Busiest</button>
            <button class="adm-seg__opt" :aria-pressed="tab === 'slowest'" title="By mean time per request, over all time. Downloads and streams are long by design." @click="tab = 'slowest'">Longest</button>
          </div>
        </div>
        <component
          :is="canTelemetry ? NuxtLink : 'div'"
          v-for="route in routes"
          :key="`${route.method} ${route.route}`"
          class="adm-route"
          v-bind="canTelemetry ? { to: telemetryRouteLink(route) } : {}"
          :title="`${route.method} ${route.route}: ${fmtInt(route.requests)} requests, mean ${fmtMs(route.avgResponseMs)}, slowest ${fmtMs(route.maxResponseMs)}`"
        >
          <span class="adm-route__bar" :style="{ width: `${routeShare(route)}%` }"></span>
          <span class="adm-route__method">{{ route.method }}</span>
          <span class="adm-route__path"><bdi>{{ route.route }}</bdi></span>
          <span class="adm-route__n">{{ tab === 'busiest' ? fmtCompact(route.requests) : fmtMs(route.avgResponseMs) }}</span>
          <span class="adm-route__n adm-route__n--dim">{{ tab === 'busiest' ? fmtMs(route.avgResponseMs) : `${fmtCompact(route.requests)} hits` }}</span>
        </component>
        <div v-if="!routes.length" class="adm-empty">No route history yet.</div>
      </div>
    </div>
    <div v-else class="adm-panel__body"><div class="adm-empty">{{ loading ? 'Reading API statistics…' : 'API statistics are unavailable.' }}</div></div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, resolveComponent } from 'vue';
import { fmtCompact, fmtInt, fmtMs, fmtPct, fmtRelative, telemetryRouteLink, type AdminApiRoute, type AdminApiStats, type AdminApiWindow } from '~/scripts/adminConsole';

const props = withDefaults(defineProps<{
  stats: AdminApiStats | null;
  /** The last 24 hours of telemetry and the 24 before; null when the profile cannot read telemetry. */
  recent: AdminApiWindow | null;
  days: number;
  now: number;
  canTelemetry: boolean;
  loading?: boolean;
  flash?: boolean;
}>(), { loading: false, flash: false });

const emit = defineEmits<{ 'update:days': [days: number] }>();

const NuxtLink = resolveComponent('NuxtLink');
const dayOptions = [30, 60, 90];
const tab = ref<'busiest' | 'slowest'>('busiest');
const hoverIndex = ref<number | null>(null);
const hit = ref<HTMLElement | null>(null);

const history = computed(() => (props.stats?.dailyHistory ?? []).slice(-props.days));
const maxRequests = computed(() => Math.max(1, ...history.value.map(day => day.requests || 0)));
const errorShareOf = (day: { requests: number; serverErrors?: number }) => (day.requests > 0 ? ((day.serverErrors ?? 0) / day.requests) * 100 : 0);

function share(part: number, whole: number): string {
  if (!whole) return '';
  const pct = (part / whole) * 100;
  return pct >= 10 ? `${pct.toFixed(0)}%` : pct >= 0.1 ? `${pct.toFixed(1)}%` : '<0.1%';
}
const serverErrorShare = computed(() => (props.stats ? share(props.stats.lifetime.serverErrorRequests, props.stats.lifetime.totalRequests) : ''));
const clientErrorShare = computed(() => (props.stats ? share(props.stats.lifetime.clientErrorRequests, props.stats.lifetime.totalRequests) : ''));

/** A line across the days, positioned on bar centres so it reads against the bars above it. */
function lineShape(values: number[]) {
  const n = values.length;
  if (n < 2) return { line: '', area: '' };
  const hi = Math.max(...values) * 1.12 || 1;
  const points = values.map((value, index) => ({ x: ((index + 0.5) / n) * 100, y: 96 - (value / hi) * 88 }));
  const line = points.map((p, index) => `${index ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
  return { line, area: `${line} L${points[n - 1].x.toFixed(2)} 100 L${points[0].x.toFixed(2)} 100 Z` };
}
const errorShape = computed(() => lineShape(history.value.map(errorShareOf)));

const crossX = computed(() => (hoverIndex.value == null ? 0 : ((hoverIndex.value + 0.5) / history.value.length) * 100));

/** What the three labels say: the hovered day, or the latest full picture. */
const readout = computed(() => {
  const days = history.value;
  if (!days.length) return { requests: '', errors: '' };
  if (hoverIndex.value != null && days[hoverIndex.value]) {
    const day = days[hoverIndex.value];
    return {
      requests: fmtInt(day.requests),
      errors: `${errorShareOf(day).toFixed(2)}% · ${fmtInt(day.serverErrors ?? 0)} requests`,
    };
  }
  const today = days[days.length - 1];
  const mean = days.reduce((sum, day) => sum + (day.requests || 0), 0) / days.length;
  const worst = days.reduce((a, b) => (errorShareOf(b) > errorShareOf(a) ? b : a));
  return {
    requests: `today ${fmtCompact(today.requests)} · mean ${fmtCompact(mean)}`,
    errors: `today ${errorShareOf(today).toFixed(2)}% · worst ${errorShareOf(worst).toFixed(1)}% on ${dayLabel(worst.date)}`,
  };
});

/** A percentage that stays readable from 0.02% to 60%. */
function fmtShare(pct: number): string {
  if (!Number.isFinite(pct)) return '—';
  return `${pct >= 10 ? pct.toFixed(0) : pct >= 1 ? pct.toFixed(1) : pct.toFixed(2)}%`;
}

function onMove(event: PointerEvent) {
  if (!hit.value || !history.value.length) return;
  const bounds = hit.value.getBoundingClientRect();
  const ratio = (event.clientX - bounds.left) / Math.max(1, bounds.width);
  hoverIndex.value = Math.min(history.value.length - 1, Math.max(0, Math.floor(ratio * history.value.length)));
}

function dayLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

const routes = computed<AdminApiRoute[]>(() => (tab.value === 'busiest' ? props.stats?.topRoutes : props.stats?.slowestRoutes) ?? []);
const routeScale = computed(() => Math.max(1, ...routes.value.map(route => (tab.value === 'busiest' ? route.requests : route.avgResponseMs))));
function routeShare(route: AdminApiRoute): number {
  return Math.max(1.5, ((tab.value === 'busiest' ? route.requests : route.avgResponseMs) / routeScale.value) * 100);
}
</script>
