<template>
  <div class="analytics-dashboard" :aria-busy="loading">
    <header class="analytics-header">
      <div>
        <div class="eyebrow">{{ isAllProjects ? 'Fleet intelligence' : 'Project intelligence' }}</div>
        <h2>{{ isAllProjects ? 'All-project analytics' : 'Analytics' }}</h2>
        <p class="analytics-subtitle">
          {{ scopeSubtitle }}
          <span v-if="analytics?.generatedAt" class="generated-at">
            Updated {{ formatDateTime(analytics.generatedAt) }}
          </span>
        </p>
      </div>

      <div class="analytics-actions">
        <div class="range-control" role="group" aria-label="Analytics date range">
          <button
            v-for="option in rangeOptions"
            :key="option.key"
            type="button"
            class="range-button"
            :class="{ active: selectedRange === option.key }"
            :aria-pressed="selectedRange === option.key"
            :disabled="loading"
            @click="selectRange(option.key)"
          >
            {{ option.shortLabel }}
          </button>
        </div>
        <button type="button" class="refresh-button" :disabled="loading" @click="loadAnalytics">
          {{ loading ? 'Refreshing...' : 'Refresh' }}
        </button>
      </div>
    </header>

    <div v-if="loading && !analytics" class="state-card loading-state" role="status">
      <span class="loading-spinner" aria-hidden="true"></span>
      <div>
        <strong>Building the analytics view</strong>
        <p>Aggregating spend, token usage, wakes, agents, and project activity.</p>
      </div>
    </div>

    <div v-else-if="error && !analytics" class="state-card error-state" role="alert">
      <div>
        <strong>Analytics could not be loaded</strong>
        <p>{{ error }}</p>
      </div>
      <button type="button" class="retry-button" @click="loadAnalytics">Try again</button>
    </div>

    <template v-else-if="analytics">
      <div v-if="error" class="inline-error" role="alert">
        {{ error }} The last successful result is still shown.
      </div>
      <div v-if="loading" class="refresh-progress" role="status">Refreshing analytics...</div>

      <section class="metrics-section" aria-labelledby="analytics-summary-heading">
        <div class="section-heading">
          <div>
            <h3 id="analytics-summary-heading">Performance summary</h3>
            <p>{{ analytics.range.label || activeRangeLabel }}</p>
          </div>
          <div v-if="coverageNote || coverageStats.length" class="coverage-summary">
            <p v-if="coverageNote" class="coverage-note">{{ coverageNote }}</p>
            <div v-if="coverageStats.length" class="coverage-badges">
              <span v-for="item in coverageStats" :key="item" class="coverage-badge">{{ item }}</span>
            </div>
          </div>
        </div>

        <div class="metric-grid">
          <article
            v-for="metric in metricCards"
            :key="metric.label"
            class="metric-card"
            :class="metric.tone ? `tone-${metric.tone}` : ''"
          >
            <div class="metric-label">{{ metric.label }}</div>
            <div class="metric-value">{{ metric.value }}</div>
            <div v-if="metric.detail" class="metric-detail">{{ metric.detail }}</div>
          </article>
        </div>
      </section>

      <div v-if="!hasRangeActivity" class="state-card empty-state" role="status">
        <div>
          <strong>No activity in this view yet</strong>
          <p>{{ emptyStateMessage }}</p>
        </div>
      </div>

      <template v-else>
        <section class="chart-grid chart-grid-primary" aria-label="Spend and token charts">
          <article class="chart-card chart-card-wide">
            <div class="card-heading">
              <div>
                <h3>Spend over time</h3>
                <p>Token/model and real-money cost across the selected time buckets</p>
              </div>
              <span class="card-total">
                {{ formatMoney(summary.rangeSpendUsd) }} model
                <template v-if="summary.rangeMoneySpendUsd"> · {{ formatMoney(summary.rangeMoneySpendUsd) }} money</template>
              </span>
            </div>
            <div class="chart-frame chart-frame-tall">
              <canvas
                ref="spendCanvas"
                role="img"
                :aria-label="`Spend over time for ${analytics.range.label || activeRangeLabel}`"
              >
                Spend over time chart.
              </canvas>
            </div>
          </article>

          <article class="chart-card">
            <div class="card-heading">
              <div>
                <h3>Token mix</h3>
                <p>Prompt, completion, and unclassified tokens</p>
              </div>
            </div>
            <div v-if="summary.rangeTokens > 0" class="chart-frame">
              <canvas
                ref="tokenMixCanvas"
                role="img"
                :aria-label="`Token mix for ${analytics.range.label || activeRangeLabel}`"
              >
                Token mix chart.
              </canvas>
            </div>
            <div v-else class="chart-empty">No token usage was attributed in this range.</div>
          </article>
        </section>

        <section class="chart-grid" aria-label="Activity and outcome charts">
          <article class="chart-card chart-card-wide">
            <div class="card-heading">
              <div>
                <h3>Activity and wakes</h3>
                <p>Events and agent wake cycles across the selected time buckets</p>
              </div>
              <span class="card-total">{{ formatCount(summary.wakes) }} wakes</span>
            </div>
            <div class="chart-frame chart-frame-tall">
              <canvas
                ref="activityCanvas"
                role="img"
                :aria-label="`Events and wake trend for ${analytics.range.label || activeRangeLabel}`"
              >
                Activity and wakes chart.
              </canvas>
            </div>
          </article>

          <article class="chart-card">
            <div class="card-heading">
              <div>
                <h3>Wake outcomes</h3>
                <p>How recorded wake cycles finished</p>
              </div>
            </div>
            <div v-if="analytics.outcomes.length" class="chart-frame">
              <canvas ref="outcomesCanvas" role="img" aria-label="Wake outcomes breakdown">
                Wake outcomes chart.
              </canvas>
            </div>
            <div v-else class="chart-empty">No outcome records in this range.</div>
          </article>
        </section>

        <section class="chart-grid chart-grid-even" aria-label="Model and event charts">
          <article class="chart-card">
            <div class="card-heading">
              <div>
                <h3>Model spend</h3>
                <p>Cost by model, with wake and token context</p>
              </div>
            </div>
            <div v-if="analytics.models.length" class="chart-frame chart-frame-tall">
              <canvas ref="modelsCanvas" role="img" aria-label="Model cost comparison">
                Model cost chart.
              </canvas>
            </div>
            <div v-else class="chart-empty">No model usage was attributed in this range.</div>
          </article>

          <article class="chart-card">
            <div class="card-heading">
              <div>
                <h3>Event types</h3>
                <p>The most frequent events emitted by the fleet</p>
              </div>
            </div>
            <div v-if="analytics.eventTypes.length" class="chart-frame chart-frame-tall">
              <canvas ref="eventTypesCanvas" role="img" aria-label="Project event type frequency">
                Event type chart.
              </canvas>
            </div>
            <div v-else class="chart-empty">No event type data is available in this range.</div>
          </article>
        </section>

        <section class="heatmap-card" aria-labelledby="activity-heatmap-heading">
          <div class="card-heading">
            <div>
              <h3 id="activity-heatmap-heading">Activity rhythm</h3>
              <p>Events by weekday and hour in UTC</p>
            </div>
            <div class="heat-legend" aria-label="Heatmap intensity legend">
              <span>Less</span>
              <i v-for="level in 5" :key="level" :style="heatLegendStyle(level)"></i>
              <span>More</span>
            </div>
          </div>
          <div class="heatmap-scroll" role="grid" aria-label="Activity by weekday and hour">
            <div class="heatmap-head" aria-hidden="true">
              <span></span>
              <span v-for="hour in hours" :key="hour">{{ hour % 3 === 0 ? padHour(hour) : '' }}</span>
            </div>
            <div
              v-for="row in heatmapRows"
              :key="row.day"
              class="heatmap-row"
              role="row"
              :aria-label="`${row.label} activity`"
            >
              <span class="heat-day" role="rowheader">{{ row.label }}</span>
              <span
                v-for="cell in row.cells"
                :key="cell.hour"
                class="heat-cell"
                role="gridcell"
                :style="heatCellStyle(cell.count)"
                :aria-label="`${row.fullLabel} at ${padHour(cell.hour)}:00: ${formatCount(cell.count)} events`"
                :title="`${row.fullLabel} ${padHour(cell.hour)}:00 - ${formatCount(cell.count)} events`"
              ></span>
            </div>
          </div>
        </section>
      </template>

        <section
          v-if="hasPauseAccounting"
          class="chart-grid availability-grid"
          aria-label="Operating and paused time"
        >
          <article class="chart-card chart-card-wide">
            <div class="card-heading">
              <div>
                <h3>Operating time by period</h3>
                <p>
                  {{ isAllProjects
                    ? 'Active, paused, and inactive project-time in each selected bucket'
                    : 'When this project was operating, paused, or otherwise inactive' }}
                </p>
              </div>
              <span class="card-total">{{ formatPct(summary.rangeAvailabilityPct) }} available</span>
            </div>
            <div class="chart-frame chart-frame-tall">
              <canvas
                ref="availabilityTimelineCanvas"
                role="img"
                :aria-label="`Operating, paused, and inactive time for ${analytics.range.label || activeRangeLabel}`"
              >
                Operating and paused time by period chart.
              </canvas>
            </div>
          </article>

          <article class="chart-card">
            <div class="card-heading">
              <div>
                <h3>Range availability</h3>
                <p>{{ pauseSummaryDetail }}</p>
              </div>
            </div>
            <div v-if="summary.rangeTrackedDurationMs > 0" class="chart-frame">
              <canvas
                ref="availabilityMixCanvas"
                role="img"
                aria-label="Range operating, paused, and inactive time breakdown"
              >
                Range availability breakdown chart.
              </canvas>
            </div>
            <div v-else class="chart-empty">No lifecycle time was tracked in this range.</div>
          </article>
        </section>

        <template v-if="isAllProjects">
          <section class="scope-section" aria-labelledby="fleet-breakdown-heading">
            <div class="section-heading">
              <div>
                <h3 id="fleet-breakdown-heading">Fleet allocation</h3>
                <p>Budget posture, status mix, and the projects driving spend</p>
              </div>
            </div>

            <div class="chart-grid chart-grid-three">
              <article class="chart-card">
                <div class="card-heading">
                  <div>
                    <h3>Budget used</h3>
                    <p>Lifetime spend against the fleet token budget</p>
                  </div>
                </div>
                <div v-if="hasBudgetData" class="chart-frame">
                  <canvas ref="budgetCanvas" role="img" aria-label="Fleet budget used and remaining">
                    Fleet budget chart.
                  </canvas>
                </div>
                <div v-else class="chart-empty">No fleet budget has been configured.</div>
              </article>

              <article class="chart-card chart-card-wide">
                <div class="card-heading">
                  <div>
                    <h3>Project spend vs budget</h3>
                    <p>Range model spend compared with each lifetime token budget</p>
                  </div>
                </div>
                <div v-if="analytics.projects.length" class="chart-frame chart-frame-tall">
                  <canvas ref="projectSpendCanvas" role="img" aria-label="Project spend compared with project budget">
                    Project spend and budget chart.
                  </canvas>
                </div>
                <div v-else class="chart-empty">No project spend is available.</div>
              </article>

              <article class="chart-card">
                <div class="card-heading">
                  <div>
                    <h3>Status breakdown</h3>
                    <p>Current project states across the fleet</p>
                  </div>
                </div>
                <div v-if="analytics.statuses.length" class="chart-frame">
                  <canvas ref="statusesCanvas" role="img" aria-label="Current project status breakdown">
                    Project status chart.
                  </canvas>
                </div>
                <div v-else class="chart-empty">No project status data is available.</div>
              </article>
            </div>
          </section>

          <section class="table-card" aria-labelledby="project-performance-heading">
            <div class="card-heading">
              <div>
                <h3 id="project-performance-heading">Project performance</h3>
                <p>Compare every project; select a column heading to sort</p>
              </div>
              <span class="table-count">{{ analytics.projects.length }} projects</span>
            </div>
            <div v-if="analytics.projects.length" class="table-scroll">
              <table>
                <caption class="sr-only">Sortable performance statistics for all KliveAgent projects</caption>
                <thead>
                  <tr>
                    <th
                      v-for="column in projectColumns"
                      :key="column.key"
                      scope="col"
                      :class="{ numeric: column.numeric }"
                      :aria-sort="projectAriaSort(column.key)"
                    >
                      <button type="button" class="sort-button" @click="sortProjects(column.key)">
                        {{ column.label }}
                        <span class="sort-indicator" aria-hidden="true">{{ projectSortIndicator(column.key) }}</span>
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="projectRow in sortedProjects" :key="projectRow.projectID">
                    <td>
                      <NuxtLink :to="`/projects/${projectRow.projectID}`" class="project-link">
                        {{ projectRow.name || '(untitled)' }}
                      </NuxtLink>
                      <span class="project-date">Started {{ formatDate(projectRow.createdAt) }}</span>
                    </td>
                    <td><span class="status-chip" :class="statusClass(projectRow.status)">{{ projectRow.status || 'Unknown' }}</span></td>
                    <td class="numeric">
                      {{ formatMoney(projectRow.rangeSpendUsd) }}
                      <span v-if="projectRowsHavePauseAccounting" class="cell-sub">
                        {{ formatMoney(projectRow.averageDailySpendUsd) }} / active day
                      </span>
                    </td>
                    <td class="numeric">
                      {{ formatMoney(projectRow.tokenSpendUsd) }}
                      <span class="cell-sub">{{ formatPct(projectRow.budgetUsedPct) }} used</span>
                    </td>
                    <td class="numeric">
                      {{ formatMoney(projectRow.moneySpendUsd) }}
                      <span class="cell-sub">{{ formatPct(projectRow.moneyBudgetUsedPct) }} of {{ formatMoney(projectRow.moneyBudgetUsd) }}</span>
                    </td>
                    <td class="numeric">{{ formatCount(projectRow.rangeTokens) }}</td>
                    <td class="numeric">{{ formatCount(projectRow.wakes) }}</td>
                    <td class="numeric">{{ formatPct(projectRow.successRate) }}</td>
                    <td v-if="projectRowsHavePauseAccounting" class="numeric">
                      {{ formatPct(projectRow.rangeAvailabilityPct) }}
                      <span class="cell-sub">{{ formatLongDuration(projectRow.rangePausedDurationMs) }} paused</span>
                    </td>
                    <td class="numeric">
                      {{ formatCount(projectRow.activeAgents) }}
                      <span class="cell-sub">{{ formatCount(projectRow.rosterAgents) }} assigned</span>
                    </td>
                    <td class="numeric">{{ formatDateTime(projectRow.lastActivityAt) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="chart-empty">No projects were returned for this range.</div>
          </section>
        </template>

        <section v-else class="table-card" aria-labelledby="agent-performance-heading">
          <div class="card-heading">
            <div>
              <h3 id="agent-performance-heading">Agent performance</h3>
              <p>Work, reliability, and spend attributed to each project agent</p>
            </div>
            <span class="table-count">{{ analytics.agents.length }} agents</span>
          </div>
          <div v-if="analytics.agents.length" class="table-scroll">
            <table>
              <caption class="sr-only">Agent performance for this project</caption>
              <thead>
                <tr>
                  <th scope="col">Agent</th>
                  <th scope="col" class="numeric">Wakes</th>
                  <th scope="col" class="numeric">Success</th>
                  <th scope="col" class="numeric">Tokens</th>
                  <th scope="col" class="numeric">Spend</th>
                  <th scope="col" class="numeric">Tools</th>
                  <th scope="col" class="numeric">Productive actions</th>
                  <th scope="col" class="numeric">Avg duration</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="agent in sortedAgents" :key="agent.agentID">
                  <td>
                    <span class="agent-name">{{ agent.label || agent.agentID }}</span>
                    <span class="agent-id">{{ agent.agentID }}</span>
                  </td>
                  <td class="numeric">{{ formatCount(agent.wakes) }}</td>
                  <td class="numeric">{{ formatPct(agent.successRate) }}</td>
                  <td class="numeric">{{ formatCount(agent.tokens) }}</td>
                  <td class="numeric">{{ formatMoney(agent.costUsd) }}</td>
                  <td class="numeric">{{ formatCount(agent.toolCalls) }}</td>
                  <td class="numeric">{{ formatCount(agent.productiveActions) }}</td>
                  <td class="numeric">{{ formatDuration(agent.avgDurationMs) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="chart-empty">No agent-level activity was attributed in this range.</div>
        </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Chart from 'chart.js/auto';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';

type RangeKey = '7d' | '30d' | '90d' | '365d' | 'all';
type SortDirection = 'asc' | 'desc';
type ProjectSortKey =
  | 'name'
  | 'status'
  | 'rangeSpendUsd'
  | 'tokenSpendUsd'
  | 'moneySpendUsd'
  | 'rangeTokens'
  | 'wakes'
  | 'successRate'
  | 'rangeAvailabilityPct'
  | 'activeAgents'
  | 'lastActivityAt';

interface AnalyticsSummary {
  lifetimeSpendUsd: number;
  rangeSpendUsd: number;
  lifetimeMoneySpendUsd: number;
  rangeMoneySpendUsd: number;
  tokenBudgetUsd?: number;
  totalBudgetUsd?: number;
  remainingBudgetUsd?: number;
  budgetUsedPct: number;
  moneyBudgetUsd: number;
  remainingMoneyBudgetUsd: number;
  moneyBudgetUsedPct: number;
  lifetimeTokens: number;
  promptTokens: number;
  completionTokens: number;
  rangePromptTokens: number;
  rangeCompletionTokens: number;
  rangeUnclassifiedTokens: number;
  rangeTokens: number;
  events: number;
  wakes: number;
  successRate: number;
  activeDays: number;
  avgWakeDurationMs: number;
  avgCostPerWake: number;
  tools: number;
  productiveActions: number;
  artifacts: number;
  councils: number;
  councilSpendUsd: number;
  activeAgents: number;
  rosterAgents?: number;
  projectCount?: number;
  activeProjects?: number;
  pausedProjects?: number;
  rangeTrackedDurationMs?: number;
  rangeActiveDurationMs?: number;
  rangePausedDurationMs?: number;
  rangeInactiveDurationMs?: number;
  rangeAvailabilityPct?: number;
  pauseCount?: number;
  currentPauseStartedAt?: string | null;
}

interface AnalyticsSeriesPoint {
  date: string;
  spendUsd: number;
  moneySpendUsd: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  unclassifiedTokens: number;
  events: number;
  wakes: number;
  successfulWakes: number;
  failedWakes: number;
  toolCalls: number;
  productiveActions: number;
  activeDurationMs?: number;
  pausedDurationMs?: number;
  inactiveDurationMs?: number;
  availabilityPct?: number;
}

interface AnalyticsOutcome {
  key: string;
  label: string;
  count: number;
}

interface AnalyticsModel {
  key: string;
  label: string;
  wakes: number;
  calls: number;
  tokens: number;
  costUsd: number;
}

interface AnalyticsAgent {
  agentID: string;
  label: string;
  wakes: number;
  successRate: number;
  tokens: number;
  costUsd: number;
  toolCalls: number;
  productiveActions: number;
  avgDurationMs: number;
}

interface AnalyticsEventType {
  key: string;
  label: string;
  count: number;
}

interface AnalyticsHeatPoint {
  day: string | number;
  hour: number;
  count: number;
}

interface AnalyticsProject {
  projectID: string;
  name: string;
  status: string;
  createdAt: string;
  tokenSpendUsd: number;
  budgetUsd: number;
  budgetUsedPct: number;
  moneySpendUsd: number;
  moneyBudgetUsd: number;
  moneyBudgetUsedPct: number;
  rangeSpendUsd: number;
  lifetimeTokens: number;
  rangeTokens: number;
  events: number;
  wakes: number;
  successRate: number;
  activeAgents: number;
  rosterAgents?: number;
  lastActivityAt: string;
  rangeTrackedDurationMs?: number;
  rangeActiveDurationMs?: number;
  rangePausedDurationMs?: number;
  rangeInactiveDurationMs?: number;
  rangeAvailabilityPct?: number;
  pauseCount?: number;
  currentPauseStartedAt?: string | null;
  averageDailySpendUsd?: number;
  estimatedDaysRemaining?: number | null;
  estimatedExhaustionAt?: string | null;
}

interface AnalyticsStatus {
  key: string;
  label: string;
  count: number;
}

interface AnalyticsBudgetForecast {
  spentUsd: number;
  budgetUsd: number;
  remainingUsd: number;
  usedPct: number;
  averageDailySpendUsd: number;
  calendarAverageDailySpendUsd?: number;
  currentActiveDailySpendUsd?: number;
  currentlyPaused?: boolean;
  currentlyActive?: boolean;
  estimatedDaysRemaining?: number | null;
  estimatedExhaustionAt?: string | null;
}

interface AnalyticsPayload {
  scope: string;
  generatedAt: string;
  range: { key: string; label: string; bucket?: string; fromUtc?: string | null; toUtc?: string | null };
  project?: { projectID?: string; name?: string } | null;
  summary: AnalyticsSummary;
  series: AnalyticsSeriesPoint[];
  outcomes: AnalyticsOutcome[];
  models: AnalyticsModel[];
  agents: AnalyticsAgent[];
  eventTypes: AnalyticsEventType[];
  heatmap: AnalyticsHeatPoint[];
  budget?: AnalyticsBudgetForecast;
  projects: AnalyticsProject[];
  statuses: AnalyticsStatus[];
  coverage?: unknown;
}

interface MetricCard {
  label: string;
  value: string;
  detail?: string;
  tone?: 'green' | 'blue' | 'amber' | 'purple';
}

const props = withDefaults(defineProps<{
  projectId?: string;
  allProjects?: boolean;
}>(), {
  projectId: '',
  allProjects: false,
});

const rangeOptions: Array<{ key: RangeKey; label: string; shortLabel: string }> = [
  { key: '7d', label: 'Last 7 days', shortLabel: '7D' },
  { key: '30d', label: 'Last 30 days', shortLabel: '30D' },
  { key: '90d', label: 'Last 90 days', shortLabel: '90D' },
  { key: '365d', label: 'Last year', shortLabel: '1Y' },
  { key: 'all', label: 'All time', shortLabel: 'All' },
];

const isAllProjects = computed(() => props.allProjects);
const selectedRange = ref<RangeKey>('30d');
const analytics = ref<AnalyticsPayload | null>(null);
const loading = ref(false);
const error = ref('');
let requestGeneration = 0;

const spendCanvas = ref<HTMLCanvasElement | null>(null);
const tokenMixCanvas = ref<HTMLCanvasElement | null>(null);
const activityCanvas = ref<HTMLCanvasElement | null>(null);
const availabilityTimelineCanvas = ref<HTMLCanvasElement | null>(null);
const availabilityMixCanvas = ref<HTMLCanvasElement | null>(null);
const outcomesCanvas = ref<HTMLCanvasElement | null>(null);
const modelsCanvas = ref<HTMLCanvasElement | null>(null);
const eventTypesCanvas = ref<HTMLCanvasElement | null>(null);
const budgetCanvas = ref<HTMLCanvasElement | null>(null);
const projectSpendCanvas = ref<HTMLCanvasElement | null>(null);
const statusesCanvas = ref<HTMLCanvasElement | null>(null);
let charts: Chart[] = [];

const EMPTY_SUMMARY: AnalyticsSummary = {
  lifetimeSpendUsd: 0,
  rangeSpendUsd: 0,
  lifetimeMoneySpendUsd: 0,
  rangeMoneySpendUsd: 0,
  budgetUsedPct: 0,
  moneyBudgetUsd: 0,
  remainingMoneyBudgetUsd: 0,
  moneyBudgetUsedPct: 0,
  lifetimeTokens: 0,
  promptTokens: 0,
  completionTokens: 0,
  rangePromptTokens: 0,
  rangeCompletionTokens: 0,
  rangeUnclassifiedTokens: 0,
  rangeTokens: 0,
  events: 0,
  wakes: 0,
  successRate: 0,
  activeDays: 0,
  avgWakeDurationMs: 0,
  avgCostPerWake: 0,
  tools: 0,
  productiveActions: 0,
  artifacts: 0,
  councils: 0,
  councilSpendUsd: 0,
  activeAgents: 0,
};

const summary = computed<AnalyticsSummary>(() => analytics.value?.summary ?? EMPTY_SUMMARY);
const activeRangeLabel = computed(() =>
  rangeOptions.find(option => option.key === selectedRange.value)?.label ?? 'Selected range');

const hasPauseAccounting = computed(() => {
  const value = analytics.value?.summary;
  if (!value) return false;
  return [
    'rangeTrackedDurationMs',
    'rangeActiveDurationMs',
    'rangePausedDurationMs',
    'rangeInactiveDurationMs',
    'rangeAvailabilityPct',
  ].some(key => Object.prototype.hasOwnProperty.call(value, key));
});

const pauseSummaryDetail = computed(() => {
  const value = summary.value;
  const pauses = numeric(value.pauseCount);
  return [
    `${formatLongDuration(value.rangeActiveDurationMs)} operating`,
    `${formatLongDuration(value.rangePausedDurationMs)} paused`,
    numeric(value.rangeInactiveDurationMs) > 0
      ? `${formatLongDuration(value.rangeInactiveDurationMs)} inactive`
      : '',
    `${formatCount(pauses)} ${pauses === 1 ? 'pause' : 'pauses'}`,
    value.currentPauseStartedAt
      ? isAllProjects.value
        ? `earliest current pause ${formatDateTime(value.currentPauseStartedAt)}`
        : `paused since ${formatDateTime(value.currentPauseStartedAt)}`
      : '',
  ].filter(Boolean).join(' · ');
});

const emptyStateMessage = computed(() => {
  const rangeLabel = analytics.value?.range.label || activeRangeLabel.value;
  if (hasPauseAccounting.value && numeric(summary.value.rangePausedDurationMs) > 0) {
    const entirelyPaused = numeric(summary.value.rangeActiveDurationMs) <= 0
      && numeric(summary.value.rangeInactiveDurationMs) <= 0;
    if (isAllProjects.value) {
      return `There is no recorded execution activity for ${rangeLabel}. The fleet availability view below includes ${formatLongDuration(summary.value.rangePausedDurationMs)} of paused project-time.`;
    }
    return entirelyPaused
      ? `${rangeLabel} contains no execution activity because the project was paused for the tracked range. Its paused time is shown below.`
      : `There is no recorded execution activity for ${rangeLabel}. This view includes ${formatLongDuration(summary.value.rangePausedDurationMs)} of paused time.`;
  }
  return `There is not enough recorded activity to draw activity charts for ${rangeLabel}. Try a longer range or return after the project has completed a wake.`;
});

const scopeSubtitle = computed(() => {
  if (isAllProjects.value) return 'A single view of spend, throughput, reliability, and budget health across every project.';
  const name = analytics.value?.project?.name;
  return name
    ? `Spend, token usage, activity, and agent performance for ${name}.`
    : 'Spend, token usage, activity, and agent performance for this project.';
});

const metricCards = computed<MetricCard[]>(() => {
  const value = summary.value;
  const forecast = analytics.value?.budget;
  const rate = isAllProjects.value
    ? forecast?.currentActiveDailySpendUsd ?? forecast?.averageDailySpendUsd
    : forecast?.averageDailySpendUsd;
  const calendarRate = forecast?.calendarAverageDailySpendUsd;
  let runwayDetail = `${formatMoney(rate)} average / active day`;
  if (isAllProjects.value && forecast?.currentlyActive === false) {
    runwayDetail = forecast.currentlyPaused
      ? 'Fleet burn paused · no projects currently running'
      : 'No projects currently running';
  } else if (!isAllProjects.value && forecast?.currentlyPaused) {
    runwayDetail = `Calendar forecast on hold · ${formatMoney(rate)} / active day`;
  } else if (!isAllProjects.value && forecast?.currentlyActive === false) {
    runwayDetail = `Calendar forecast unavailable while inactive · ${formatMoney(rate)} / active day`;
  } else if (forecast?.estimatedExhaustionAt) {
    runwayDetail = `At active-time pace · ${formatDate(forecast.estimatedExhaustionAt)}`;
  } else if (hasPauseAccounting.value && numeric(calendarRate) !== numeric(rate)) {
    runwayDetail = `${formatMoney(rate)} / active day · ${formatMoney(calendarRate)} / calendar day`;
  }

  const shared: MetricCard[] = [
    {
      label: 'Token spend in range',
      value: formatMoney(value.rangeSpendUsd),
      detail: `${formatMoney(value.lifetimeSpendUsd)} lifetime token spend`,
      tone: 'green',
    },
    {
      label: 'Real-money spend',
      value: formatMoney(value.lifetimeMoneySpendUsd),
      detail: `${formatMoney(value.rangeMoneySpendUsd)} in range · ${formatMoney(value.remainingMoneyBudgetUsd)} remaining`,
      tone: 'amber',
    },
    {
      label: 'Tokens in range',
      value: formatCount(value.rangeTokens),
      detail: `${formatCount(value.lifetimeTokens)} lifetime`,
      tone: 'blue',
    },
    {
      label: 'Wake cycles',
      value: formatCount(value.wakes),
      detail: `${formatPct(value.successRate)} successful`,
    },
    {
      label: 'Average cost / wake',
      value: formatMoney(value.avgCostPerWake),
      detail: formatDuration(value.avgWakeDurationMs),
    },
    {
      label: 'Events',
      value: formatCount(value.events),
      detail: `${formatCount(value.activeDays)} event days`,
    },
    {
      label: 'Tool calls',
      value: formatCount(value.tools),
      detail: `${formatCount(value.productiveActions)} productive actions`,
      tone: 'purple',
    },
    {
      label: 'Estimated active runway',
      value: formatRunway(forecast?.estimatedDaysRemaining),
      detail: runwayDetail,
      tone: 'amber',
    },
  ];

  if (hasPauseAccounting.value) {
    shared.splice(6, 0, {
      label: isAllProjects.value ? 'Fleet availability' : 'Range availability',
      value: formatPct(value.rangeAvailabilityPct),
      detail: `${formatLongDuration(value.rangePausedDurationMs)} paused · ${formatCount(value.pauseCount)} pauses`,
      tone: numeric(value.rangeAvailabilityPct) < 100 || numeric(value.rangeInactiveDurationMs) > 0
        ? 'amber'
        : 'green',
    });
  }

  if (isAllProjects.value) {
    return [
      ...shared,
      {
        label: 'Fleet budget',
        value: formatMoney(value.totalBudgetUsd),
        detail: `${formatPct(value.budgetUsedPct)} used`,
        tone: 'amber',
      },
      {
        label: 'Budget remaining',
        value: formatMoney(value.remainingBudgetUsd),
        detail: `${formatMoney(value.lifetimeSpendUsd)} spent`,
      },
      {
        label: 'Projects',
        value: formatCount(value.projectCount),
        detail: `${formatCount(value.activeProjects)} running · ${formatCount(value.pausedProjects)} paused`,
        tone: 'green',
      },
      {
        label: 'Running agents',
        value: formatCount(value.activeAgents),
        detail: `${formatCount(value.rosterAgents)} assigned across the fleet`,
      },
      {
        label: 'Artifacts',
        value: formatCount(value.artifacts),
        detail: `${formatCount(value.councils)} councils`,
      },
      {
        label: 'Council spend in range',
        value: formatMoney(value.councilSpendUsd),
        detail: 'Included in attributed range spend',
      },
    ];
  }

  return [
    ...shared,
    {
      label: 'Token budget',
      value: formatMoney(value.tokenBudgetUsd),
      detail: `${formatPct(value.budgetUsedPct)} used`,
      tone: 'amber',
    },
    {
      label: 'Budget remaining',
      value: formatMoney(value.remainingBudgetUsd),
      detail: `${formatMoney(value.lifetimeSpendUsd)} spent`,
    },
    {
      label: 'Running agents',
      value: formatCount(value.activeAgents),
      detail: `${formatCount(value.rosterAgents)} assigned · ${analytics.value?.agents.length ?? 0} attributed`,
      tone: 'green',
    },
    {
      label: 'Artifacts',
      value: formatCount(value.artifacts),
      detail: 'Recorded outputs',
    },
    {
      label: 'Councils in range',
      value: formatCount(value.councils),
      detail: `${formatMoney(value.councilSpendUsd)} attributed spend`,
    },
    {
      label: 'Completion tokens',
      value: formatCount(value.rangeCompletionTokens),
      detail: `${formatCount(value.rangePromptTokens)} prompt in range`,
      tone: 'blue',
    },
  ];
});

const hasRangeActivity = computed(() => {
  if (!analytics.value) return false;
  const value = analytics.value.summary;
  return Boolean(
    numeric(value.rangeSpendUsd)
    || numeric(value.rangeMoneySpendUsd)
    || numeric(value.rangeTokens)
    || numeric(value.events)
    || numeric(value.wakes)
    || analytics.value.series.some(point =>
      numeric(point.spendUsd)
      || numeric(point.moneySpendUsd)
      || numeric(point.totalTokens)
      || numeric(point.events)
      || numeric(point.wakes))
    || analytics.value.outcomes.some(item => numeric(item.count))
    || analytics.value.models.some(item => numeric(item.tokens) || numeric(item.costUsd))
    || analytics.value.eventTypes.some(item => numeric(item.count))
    || analytics.value.heatmap.some(item => numeric(item.count)));
});

const hasBudgetData = computed(() => numeric(summary.value.totalBudgetUsd) > 0);

const coverageNote = computed(() => {
  const coverage = analytics.value?.coverage;
  if (typeof coverage === 'string') return coverage;
  if (!coverage || typeof coverage !== 'object') return '';
  const record = coverage as Record<string, unknown>;
  if (typeof record.note === 'string' && record.note.trim()) return record.note.trim();
  if (typeof record.label === 'string') return record.label;
  return '';
});

const coverageStats = computed(() => {
  const coverage = analytics.value?.coverage;
  if (typeof coverage === 'number' && Number.isFinite(coverage)) return [`${formatPct(coverage)} coverage`];
  if (!coverage || typeof coverage !== 'object') return [] as string[];
  const record = coverage as Record<string, unknown>;
  const stats: string[] = [];
  if (typeof record.structuredUsageCutoverAt === 'string' && record.structuredUsageCutoverAt) {
    stats.push(isAllProjects.value
      ? `First project journal began ${formatDate(record.structuredUsageCutoverAt)}`
      : `Usage journal since ${formatDate(record.structuredUsageCutoverAt)}`);
  }
  if (isAllProjects.value && numeric(record.journalledProjectCount) > 0) {
    stats.push(`${formatCount(record.journalledProjectCount)} journalled projects`);
  }
  if (
    isAllProjects.value
    && typeof record.latestStructuredUsageCutoverAt === 'string'
    && record.latestStructuredUsageCutoverAt
    && record.latestStructuredUsageCutoverAt !== record.structuredUsageCutoverAt
  ) {
    stats.push(`Latest project cutover ${formatDate(record.latestStructuredUsageCutoverAt)}`);
  }
  if (numeric(record.structuredUsageRecords) > 0) {
    stats.push(`${formatCount(record.structuredUsageRecords)} journalled model turns`);
  }
  if (numeric(record.utilityUsageRecords) > 0) {
    stats.push(`${formatCount(record.utilityUsageRecords)} utility turns`);
  }
  if (numeric(record.reconciliationRecords) > 0) {
    stats.push(`${formatCount(record.reconciliationRecords)} cost reconciliations`);
  }
  if (numeric(record.postCutoverUsageGaps) > 0) {
    stats.push(`${formatCount(record.postCutoverUsageGaps)} wake attribution gaps`);
  }
  if (numeric(record.postCutoverCouncilUsageGaps) > 0) {
    stats.push(`${formatCount(record.postCutoverCouncilUsageGaps)} council attribution gaps`);
  }
  if (numeric(record.lifetimeUnattributedSpendUsd) > 0) {
    stats.push(`${formatMoney(record.lifetimeUnattributedSpendUsd)} lifetime spend unattributed`);
  }
  if (numeric(record.lifetimeUnattributedTokens) > 0) {
    stats.push(`${formatCount(record.lifetimeUnattributedTokens)} lifetime tokens unattributed`);
  }
  if (hasNumericField(record, 'structuredWakeRecords')) {
    stats.push(`${formatCount(record.structuredWakeRecords)} structured wakes`);
  }
  if (hasNumericField(record, 'legacyWakeRecords')) {
    stats.push(`${formatCount(record.legacyWakeRecords)} legacy wakes`);
  }
  if (hasNumericField(record, 'provisionalCostRecords')) {
    stats.push(`${formatCount(record.provisionalCostRecords)} provisional cost records`);
  }
  if (hasNumericField(record, 'detailedTokenPct')) {
    stats.push(`${formatPct(record.detailedTokenPct)} detailed tokens`);
  }
  if (!stats.length && hasNumericField(record, 'days')) {
    stats.push(`${formatCount(record.days)} days covered`);
  }
  return stats;
});

const sortedAgents = computed(() =>
  [...(analytics.value?.agents ?? [])].sort((a, b) => numeric(b.costUsd) - numeric(a.costUsd)));

const projectSortKey = ref<ProjectSortKey>('rangeSpendUsd');
const projectSortDirection = ref<SortDirection>('desc');
const projectRowsHavePauseAccounting = computed(() =>
  (analytics.value?.projects ?? []).some(row =>
    Object.prototype.hasOwnProperty.call(row, 'rangeAvailabilityPct')));
const projectColumns = computed<Array<{ key: ProjectSortKey; label: string; numeric?: boolean }>>(() => {
  const columns: Array<{ key: ProjectSortKey; label: string; numeric?: boolean }> = [
    { key: 'name', label: 'Project' },
    { key: 'status', label: 'Status' },
    { key: 'rangeSpendUsd', label: 'Range spend', numeric: true },
    { key: 'tokenSpendUsd', label: 'Lifetime spend', numeric: true },
    { key: 'moneySpendUsd', label: 'Money spend', numeric: true },
    { key: 'rangeTokens', label: 'Range tokens', numeric: true },
    { key: 'wakes', label: 'Wakes', numeric: true },
    { key: 'successRate', label: 'Success', numeric: true },
    { key: 'activeAgents', label: 'Running agents', numeric: true },
    { key: 'lastActivityAt', label: 'Last activity', numeric: true },
  ];
  if (projectRowsHavePauseAccounting.value) {
    columns.splice(columns.length - 2, 0, {
      key: 'rangeAvailabilityPct',
      label: 'Availability',
      numeric: true,
    });
  }
  return columns;
});

const sortedProjects = computed(() => {
  const rows = [...(analytics.value?.projects ?? [])];
  const direction = projectSortDirection.value === 'asc' ? 1 : -1;
  const key = projectSortKey.value;
  return rows.sort((a, b) => {
    const left = a[key];
    const right = b[key];
    if (key === 'lastActivityAt') {
      return (dateValue(left) - dateValue(right)) * direction;
    }
    if (typeof left === 'number' || typeof right === 'number') {
      return (numeric(left) - numeric(right)) * direction;
    }
    return String(left ?? '').localeCompare(String(right ?? ''), undefined, { sensitivity: 'base' }) * direction;
  });
});

function sortProjects(key: ProjectSortKey) {
  if (projectSortKey.value === key) {
    projectSortDirection.value = projectSortDirection.value === 'asc' ? 'desc' : 'asc';
    return;
  }
  projectSortKey.value = key;
  projectSortDirection.value = key === 'name' || key === 'status' ? 'asc' : 'desc';
}

function projectSortIndicator(key: ProjectSortKey) {
  if (projectSortKey.value !== key) return '';
  return projectSortDirection.value === 'asc' ? '↑' : '↓';
}

function projectAriaSort(key: ProjectSortKey): 'ascending' | 'descending' | 'none' {
  if (projectSortKey.value !== key) return 'none';
  return projectSortDirection.value === 'asc' ? 'ascending' : 'descending';
}

const hours = Array.from({ length: 24 }, (_, index) => index);
const DAYS = [
  { day: 0, label: 'Mon', fullLabel: 'Monday' },
  { day: 1, label: 'Tue', fullLabel: 'Tuesday' },
  { day: 2, label: 'Wed', fullLabel: 'Wednesday' },
  { day: 3, label: 'Thu', fullLabel: 'Thursday' },
  { day: 4, label: 'Fri', fullLabel: 'Friday' },
  { day: 5, label: 'Sat', fullLabel: 'Saturday' },
  { day: 6, label: 'Sun', fullLabel: 'Sunday' },
];

const heatmapRows = computed(() => {
  const counts = new Map<string, number>();
  for (const item of analytics.value?.heatmap ?? []) {
    const day = normalizeDay(item.day);
    const hour = Math.max(0, Math.min(23, Math.trunc(numeric(item.hour))));
    counts.set(`${day}:${hour}`, numeric(item.count));
  }
  return DAYS.map(day => ({
    ...day,
    cells: hours.map(hour => ({ hour, count: counts.get(`${day.day}:${hour}`) ?? 0 })),
  }));
});

const heatmapMax = computed(() =>
  Math.max(0, ...(analytics.value?.heatmap ?? []).map(item => numeric(item.count))));

function heatCellStyle(count: number) {
  if (!count || heatmapMax.value <= 0) return { backgroundColor: 'rgba(255,255,255,0.035)' };
  const intensity = 0.16 + (count / heatmapMax.value) * 0.84;
  return { backgroundColor: `rgba(77, 158, 57, ${intensity.toFixed(3)})` };
}

function heatLegendStyle(level: number) {
  return { backgroundColor: `rgba(77, 158, 57, ${(0.08 + level * 0.18).toFixed(2)})` };
}

function normalizeDay(value: string | number): number {
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    const day = Math.trunc(Number(value));
    return Math.max(0, Math.min(6, day));
  }
  const normalized = String(value).trim().toLowerCase();
  const names = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const match = names.findIndex(name => normalized.startsWith(name));
  return match >= 0 ? match : 0;
}

function normalizePayload(raw: any): AnalyticsPayload {
  return {
    scope: String(raw?.scope ?? (isAllProjects.value ? 'all' : 'project')),
    generatedAt: String(raw?.generatedAt ?? ''),
    range: {
      key: String(raw?.range?.key ?? selectedRange.value),
      label: String(raw?.range?.label ?? activeRangeLabel.value),
      bucket: String(raw?.range?.bucket ?? 'day'),
      fromUtc: raw?.range?.fromUtc ?? null,
      toUtc: raw?.range?.toUtc ?? null,
    },
    project: raw?.project && typeof raw.project === 'object' ? raw.project : null,
    summary: { ...EMPTY_SUMMARY, ...(raw?.summary && typeof raw.summary === 'object' ? raw.summary : {}) },
    series: arrayOrEmpty<AnalyticsSeriesPoint>(raw?.series),
    outcomes: arrayOrEmpty<AnalyticsOutcome>(raw?.outcomes),
    models: arrayOrEmpty<AnalyticsModel>(raw?.models),
    agents: arrayOrEmpty<AnalyticsAgent>(raw?.agents),
    eventTypes: arrayOrEmpty<AnalyticsEventType>(raw?.eventTypes),
    heatmap: arrayOrEmpty<AnalyticsHeatPoint>(raw?.heatmap),
    budget: raw?.budget && typeof raw.budget === 'object' ? raw.budget : undefined,
    projects: arrayOrEmpty<AnalyticsProject>(raw?.projects),
    statuses: arrayOrEmpty<AnalyticsStatus>(raw?.statuses),
    coverage: raw?.coverage,
  };
}

function arrayOrEmpty<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function selectRange(range: RangeKey) {
  if (range === selectedRange.value || loading.value) return;
  selectedRange.value = range;
  loadAnalytics();
}

async function loadAnalytics() {
  if (!isAllProjects.value && !props.projectId) {
    error.value = 'A project identifier is required for project analytics.';
    return;
  }

  const generation = ++requestGeneration;
  loading.value = true;
  error.value = '';
  const endpoint = isAllProjects.value
    ? `/projects/analytics/all?range=${selectedRange.value}`
    : `/projects/analytics?projectID=${encodeURIComponent(props.projectId)}&range=${selectedRange.value}`;

  try {
    const response = await RequestGETFromKliveAPI(
      endpoint,
      false,
      false,
      { 'Cache-Control': 'no-cache' },
    );
    if (generation !== requestGeneration) return;
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).trim();
      throw new Error(detail || `Request failed with HTTP ${response.status}.`);
    }
    const payload = normalizePayload(await response.json());
    if (generation !== requestGeneration) return;
    analytics.value = payload;
    await nextTick();
    renderCharts();
  } catch (cause: any) {
    if (generation !== requestGeneration) return;
    error.value = cause?.message ? String(cause.message) : 'The analytics service did not return a result.';
  } finally {
    if (generation === requestGeneration) loading.value = false;
  }
}

function destroyCharts() {
  for (const chart of charts) chart.destroy();
  charts = [];
}

function addChart(canvas: HTMLCanvasElement | null, config: any) {
  if (!canvas) return;
  charts.push(new Chart(canvas, config));
}

function renderCharts() {
  destroyCharts();
  if (!analytics.value) return;

  const series = analytics.value.series;
  const labels = series.map(point => formatSeriesDate(point.date));
  const gridColor = 'rgba(255,255,255,0.055)';
  const tickColor = '#777780';
  const legendColor = '#a7a7af';

  addChart(spendCanvas.value, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Model spend',
          data: series.map(point => numeric(point.spendUsd)),
          borderColor: '#62ce47',
          backgroundColor: 'rgba(77,158,57,0.16)',
          pointBackgroundColor: '#62ce47',
          pointBorderWidth: 0,
          pointRadius: series.length > 45 ? 0 : 2.5,
          pointHoverRadius: 4,
          borderWidth: 2,
          tension: 0.28,
          fill: true,
        },
        {
          label: 'Real-money spend',
          data: series.map(point => numeric(point.moneySpendUsd)),
          borderColor: '#e7a543',
          backgroundColor: 'rgba(231,165,67,0.08)',
          pointBackgroundColor: '#e7a543',
          pointBorderWidth: 0,
          pointRadius: series.length > 45 ? 0 : 2.5,
          pointHoverRadius: 4,
          borderWidth: 2,
          tension: 0.28,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: legendColor, usePointStyle: true, boxWidth: 8 } },
        tooltip: {
          callbacks: {
            label: (context: any) => ` ${context.dataset.label}: ${formatMoney(context.parsed.y)}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: tickColor, maxTicksLimit: 9 } },
        y: {
          beginAtZero: true,
          grid: { color: gridColor },
          ticks: { color: tickColor, callback: (value: any) => formatMoney(value) },
        },
      },
    },
  });

  addChart(tokenMixCanvas.value, {
    type: 'doughnut',
    data: {
      labels: ['Prompt', 'Completion', 'Unclassified'],
      datasets: [{
        data: [
          numeric(summary.value.rangePromptTokens),
          numeric(summary.value.rangeCompletionTokens),
          numeric(summary.value.rangeUnclassifiedTokens),
        ],
        backgroundColor: ['#4d9e39', '#3b82f6', '#55555f'],
        borderColor: '#1a1a1e',
        borderWidth: 3,
        hoverOffset: 5,
      }],
    },
    options: doughnutOptions(legendColor, (value: number) => formatCount(value)),
  });

  addChart(activityCanvas.value, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Events',
          data: series.map(point => numeric(point.events)),
          backgroundColor: 'rgba(77,158,57,0.55)',
          borderColor: '#4d9e39',
          borderWidth: 1,
          borderRadius: 3,
          yAxisID: 'y',
        },
        {
          type: 'line',
          label: 'Wakes',
          data: series.map(point => numeric(point.wakes)),
          borderColor: '#7fb0d9',
          backgroundColor: '#7fb0d9',
          pointRadius: series.length > 45 ? 0 : 2.5,
          pointHoverRadius: 4,
          borderWidth: 2,
          tension: 0.25,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: legendColor, usePointStyle: true, boxWidth: 8 } },
      },
      scales: {
        x: { stacked: false, grid: { display: false }, ticks: { color: tickColor, maxTicksLimit: 9 } },
        y: {
          beginAtZero: true,
          grid: { color: gridColor },
          ticks: { color: tickColor, precision: 0 },
          title: { display: true, text: 'Events', color: tickColor },
        },
        y1: {
          beginAtZero: true,
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { color: tickColor, precision: 0 },
          title: { display: true, text: 'Wakes', color: tickColor },
        },
      },
    },
  });

  if (hasPauseAccounting.value) {
    addChart(availabilityTimelineCanvas.value, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            type: 'bar',
            label: 'Operating',
            data: series.map(point => numeric(point.activeDurationMs)),
            backgroundColor: 'rgba(77,158,57,0.72)',
            borderColor: '#62ce47',
            borderWidth: 1,
            borderRadius: 2,
            stack: 'lifecycle',
            yAxisID: 'y',
          },
          {
            type: 'bar',
            label: 'Paused',
            data: series.map(point => numeric(point.pausedDurationMs)),
            backgroundColor: 'rgba(217,184,114,0.76)',
            borderColor: '#d9b872',
            borderWidth: 1,
            borderRadius: 2,
            stack: 'lifecycle',
            yAxisID: 'y',
          },
          {
            type: 'bar',
            label: 'Inactive',
            data: series.map(point => numeric(point.inactiveDurationMs)),
            backgroundColor: 'rgba(85,85,95,0.68)',
            borderColor: '#74747d',
            borderWidth: 1,
            borderRadius: 2,
            stack: 'lifecycle',
            yAxisID: 'y',
          },
          {
            type: 'line',
            label: 'Availability',
            data: series.map(point => numeric(point.availabilityPct)),
            borderColor: '#7fb0d9',
            backgroundColor: '#7fb0d9',
            pointRadius: series.length > 45 ? 0 : 2,
            pointHoverRadius: 4,
            borderWidth: 2,
            tension: 0.24,
            fill: false,
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: legendColor, usePointStyle: true, boxWidth: 8 } },
          tooltip: {
            callbacks: {
              label: (context: any) => context.dataset.yAxisID === 'y1'
                ? ` Availability: ${formatPct(context.parsed.y)}`
                : ` ${context.dataset.label}: ${formatLongDuration(context.parsed.y)}`,
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { color: tickColor, maxTicksLimit: 9 },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            grid: { color: gridColor },
            ticks: { color: tickColor, callback: (value: any) => formatDurationAxis(value) },
            title: {
              display: true,
              text: isAllProjects.value ? 'Project-time' : 'Tracked time',
              color: tickColor,
            },
          },
          y1: {
            beginAtZero: true,
            max: 100,
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { color: tickColor, callback: (value: any) => `${numeric(value)}%` },
            title: { display: true, text: 'Availability', color: tickColor },
          },
        },
      },
    });

    if (numeric(summary.value.rangeTrackedDurationMs) > 0) {
      addChart(availabilityMixCanvas.value, {
        type: 'doughnut',
        data: {
          labels: ['Operating', 'Paused', 'Inactive'],
          datasets: [{
            data: [
              numeric(summary.value.rangeActiveDurationMs),
              numeric(summary.value.rangePausedDurationMs),
              numeric(summary.value.rangeInactiveDurationMs),
            ],
            backgroundColor: ['#4d9e39', '#d9b872', '#55555f'],
            borderColor: '#1a1a1e',
            borderWidth: 3,
            hoverOffset: 5,
          }],
        },
        options: doughnutOptions(legendColor, (value: number) => formatLongDuration(value)),
      });
    }
  }

  if (analytics.value.outcomes.length) {
    addChart(outcomesCanvas.value, {
      type: 'doughnut',
      data: {
        labels: analytics.value.outcomes.map(item => item.label || item.key),
        datasets: [{
          data: analytics.value.outcomes.map(item => numeric(item.count)),
          backgroundColor: palette(analytics.value.outcomes.length),
          borderColor: '#1a1a1e',
          borderWidth: 3,
          hoverOffset: 5,
        }],
      },
      options: doughnutOptions(legendColor, (value: number) => formatCount(value)),
    });
  }

  if (analytics.value.models.length) {
    const modelRows = [...analytics.value.models]
      .sort((a, b) => numeric(b.costUsd) - numeric(a.costUsd))
      .slice(0, 10);
    addChart(modelsCanvas.value, {
      type: 'bar',
      data: {
        labels: modelRows.map(item => item.label || item.key),
        datasets: [{
          label: 'Spend',
          data: modelRows.map(item => numeric(item.costUsd)),
          backgroundColor: modelRows.map((_, index) => palette(modelRows.length)[index]),
          borderRadius: 4,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context: any) => {
                const model = modelRows[context.dataIndex];
                const attribution = [
                  numeric(model.calls) > 0 ? `${formatCount(model.calls)} turns` : '',
                  numeric(model.wakes) > 0 ? `${formatCount(model.wakes)} historical wakes` : '',
                ].filter(Boolean).join(' · ');
                return ` ${formatMoney(model.costUsd)} · ${formatCount(model.tokens)} tokens${attribution ? ` · ${attribution}` : ''}`;
              },
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: gridColor },
            ticks: { color: tickColor, callback: (value: any) => formatMoney(value) },
          },
          y: { grid: { display: false }, ticks: { color: tickColor } },
        },
      },
    });
  }

  if (analytics.value.eventTypes.length) {
    const eventRows = [...analytics.value.eventTypes]
      .sort((a, b) => numeric(b.count) - numeric(a.count))
      .slice(0, 12);
    addChart(eventTypesCanvas.value, {
      type: 'bar',
      data: {
        labels: eventRows.map(item => item.label || item.key),
        datasets: [{
          label: 'Events',
          data: eventRows.map(item => numeric(item.count)),
          backgroundColor: 'rgba(127,176,217,0.68)',
          borderColor: '#7fb0d9',
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor, precision: 0 } },
          y: { grid: { display: false }, ticks: { color: tickColor } },
        },
      },
    });
  }

  if (!isAllProjects.value) return;

  if (hasBudgetData.value) {
    const budget = numeric(summary.value.totalBudgetUsd);
    const spent = Math.min(budget, numeric(summary.value.lifetimeSpendUsd));
    const overBudget = Math.max(0, numeric(summary.value.lifetimeSpendUsd) - budget);
    const budgetLabels = overBudget > 0 ? ['Budget consumed', 'Over budget'] : ['Spent', 'Remaining'];
    const budgetValues = overBudget > 0 ? [budget, overBudget] : [spent, Math.max(0, budget - spent)];
    addChart(budgetCanvas.value, {
      type: 'doughnut',
      data: {
        labels: budgetLabels,
        datasets: [{
          data: budgetValues,
          backgroundColor: overBudget > 0 ? ['#d98c2b', '#e0584b'] : ['#4d9e39', '#303038'],
          borderColor: '#1a1a1e',
          borderWidth: 3,
          hoverOffset: 5,
        }],
      },
      options: doughnutOptions(legendColor, (value: number) => formatMoney(value)),
    });
  }

  if (analytics.value.projects.length) {
    const projectRows = [...analytics.value.projects]
      .sort((a, b) => numeric(b.rangeSpendUsd) - numeric(a.rangeSpendUsd))
      .slice(0, 12)
      .reverse();
    addChart(projectSpendCanvas.value, {
      type: 'bar',
      data: {
        labels: projectRows.map(item => item.name || item.projectID),
        datasets: [
          {
            label: 'Range spend',
            data: projectRows.map(item => numeric(item.rangeSpendUsd)),
            backgroundColor: 'rgba(77,158,57,0.72)',
            borderColor: '#4d9e39',
            borderWidth: 1,
            borderRadius: 3,
          },
          {
            label: 'Budget',
            data: projectRows.map(item => numeric(item.budgetUsd)),
            backgroundColor: 'rgba(127,176,217,0.24)',
            borderColor: '#7fb0d9',
            borderWidth: 1,
            borderRadius: 3,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: legendColor, usePointStyle: true, boxWidth: 8 } },
          tooltip: {
            callbacks: { label: (context: any) => ` ${context.dataset.label}: ${formatMoney(context.parsed.x)}` },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: gridColor },
            ticks: { color: tickColor, callback: (value: any) => formatMoney(value) },
          },
          y: { grid: { display: false }, ticks: { color: tickColor } },
        },
      },
    });
  }

  if (analytics.value.statuses.length) {
    addChart(statusesCanvas.value, {
      type: 'doughnut',
      data: {
        labels: analytics.value.statuses.map(item => item.label || item.key),
        datasets: [{
          data: analytics.value.statuses.map(item => numeric(item.count)),
          backgroundColor: statusPalette(analytics.value.statuses),
          borderColor: '#1a1a1e',
          borderWidth: 3,
          hoverOffset: 5,
        }],
      },
      options: doughnutOptions(legendColor, (value: number) => formatCount(value)),
    });
  }
}

function doughnutOptions(legendColor: string, formatter: (value: number) => string) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: legendColor, usePointStyle: true, boxWidth: 8, padding: 14 },
      },
      tooltip: {
        callbacks: {
          label: (context: any) => ` ${context.label}: ${formatter(numeric(context.raw))}`,
        },
      },
    },
  };
}

function palette(count: number) {
  const colors = ['#4d9e39', '#3b82f6', '#f59e0b', '#a855f7', '#e0584b', '#14b8a6', '#7fb0d9', '#d9b872'];
  return Array.from({ length: count }, (_, index) => colors[index % colors.length]);
}

function statusPalette(statuses: AnalyticsStatus[]) {
  const colors: Record<string, string> = {
    active: '#4d9e39',
    planning: '#7fb0d9',
    paused: '#d9b872',
    budgetpaused: '#d98c2b',
    blocked: '#e0584b',
    completed: '#3b82f6',
    archived: '#55555f',
  };
  return statuses.map((status, index) => colors[String(status.key || status.label).toLowerCase()] ?? palette(statuses.length)[index]);
}

function statusClass(status: string) {
  return `status-${String(status || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '')}`;
}

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasNumericField(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key) && Number.isFinite(Number(record[key]));
}

function dateValue(value: unknown) {
  const parsed = new Date(String(value ?? '')).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: unknown) {
  const amount = numeric(value);
  const maximumFractionDigits = Math.abs(amount) > 0 && Math.abs(amount) < 1 ? 4 : 2;
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }).format(amount);
}

function formatCount(value: unknown) {
  const amount = numeric(value);
  if (Math.abs(amount) >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(amount) >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (Math.abs(amount) >= 10_000) return `${(amount / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(amount);
}

function formatPct(value: unknown) {
  return `${numeric(value).toFixed(1)}%`;
}

function formatDuration(value: unknown) {
  const milliseconds = numeric(value);
  if (milliseconds <= 0) return '0 ms average';
  if (milliseconds < 1000) return `${Math.round(milliseconds)} ms average`;
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(milliseconds < 10_000 ? 1 : 0)} s average`;
  return `${(milliseconds / 60_000).toFixed(1)} min average`;
}

function formatLongDuration(value: unknown) {
  const milliseconds = Math.max(0, numeric(value));
  if (milliseconds <= 0) return '0 hours';
  const minutes = milliseconds / 60_000;
  if (minutes < 1) return '<1 minute';
  if (minutes < 60) return `${minutes.toFixed(minutes < 10 ? 1 : 0)} min`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(hours < 10 ? 1 : 0)} hr`;
  const days = hours / 24;
  if (days < 60) return `${days.toFixed(days < 10 ? 1 : 0)} days`;
  if (days < 730) return `${(days / 30.44).toFixed(1)} months`;
  return `${(days / 365.25).toFixed(1)} years`;
}

function formatDurationAxis(value: unknown) {
  const milliseconds = Math.max(0, numeric(value));
  const hours = milliseconds / 3_600_000;
  if (hours < 24) return `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
  const days = hours / 24;
  if (days < 60) return `${days.toFixed(days < 10 ? 1 : 0)}d`;
  return `${(days / 30.44).toFixed(1)}mo`;
}

function formatRunway(value: unknown) {
  const forecast = analytics.value?.budget;
  if (forecast && numeric(forecast.budgetUsd) > 0 && numeric(forecast.remainingUsd) <= 0) {
    return 'Budget exhausted';
  }
  const days = numeric(value);
  if (days <= 0) return 'No forecast';
  if (days < 1) return '<1 day';
  if (days < 30) return `${days.toFixed(days < 10 ? 1 : 0)} days`;
  if (days < 365) return `${(days / 30.44).toFixed(1)} months`;
  return `${(days / 365.25).toFixed(1)} years`;
}

function formatDate(value: unknown) {
  const date = new Date(String(value ?? ''));
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(value: unknown) {
  const date = new Date(String(value ?? ''));
  if (Number.isNaN(date.getTime())) return 'No activity';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSeriesDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const bucket = analytics.value?.range.bucket ?? 'day';
  if (bucket === 'month') {
    return date.toLocaleDateString(undefined, {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  const includeYear = selectedRange.value === '365d' || selectedRange.value === 'all';
  const formatted = date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: includeYear ? '2-digit' : undefined,
    timeZone: 'UTC',
  });
  return bucket === 'week' ? `Week of ${formatted}` : formatted;
}

function padHour(hour: number) {
  return String(hour).padStart(2, '0');
}

watch(
  [() => props.projectId, () => props.allProjects],
  () => {
    analytics.value = null;
    destroyCharts();
    loadAnalytics();
  },
);

onMounted(loadAnalytics);
onBeforeUnmount(() => {
  requestGeneration += 1;
  destroyCharts();
});
</script>

<style scoped>
.analytics-dashboard {
  --surface: #161519;
  --surface-raised: #1a1a1e;
  --surface-soft: #1f1f23;
  --border: #2a2a30;
  --muted: #85858f;
  --text: #e6e6eb;
  --green: #4d9e39;
  --green-bright: #62ce47;
  color: var(--text);
  min-width: 0;
}

.analytics-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 20px;
}

.eyebrow {
  color: var(--green-bright);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-bottom: 5px;
}

.analytics-header h2 {
  color: var(--text);
  font-size: 22px;
  line-height: 1.2;
  margin: 0;
}

.analytics-subtitle {
  color: #8f8f98;
  font-size: 12px;
  line-height: 1.5;
  margin: 5px 0 0;
  max-width: 760px;
}

.generated-at {
  color: #65656d;
  white-space: nowrap;
}

.generated-at::before {
  content: " · ";
}

.analytics-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.range-control {
  display: flex;
  align-items: center;
  gap: 2px;
  background: #111114;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 3px;
}

.range-button,
.refresh-button,
.retry-button {
  border: 0;
  border-radius: 5px;
  cursor: pointer;
  font-family: inherit;
  line-height: 1;
}

.range-button {
  background: transparent;
  color: #777780;
  font-size: 11px;
  font-weight: 700;
  min-width: 38px;
  padding: 8px 9px;
}

.range-button:hover:not(:disabled) {
  color: #d8d8dc;
  background: #222228;
}

.range-button.active {
  color: #fff;
  background: var(--green);
}

.range-button:focus-visible,
.refresh-button:focus-visible,
.retry-button:focus-visible,
.sort-button:focus-visible,
.project-link:focus-visible {
  outline: 2px solid var(--green-bright);
  outline-offset: 2px;
}

.range-button:disabled,
.refresh-button:disabled {
  cursor: default;
  opacity: 0.65;
}

.refresh-button,
.retry-button {
  background: #26262b;
  color: #c7c7cc;
  font-size: 12px;
  padding: 10px 13px;
}

.refresh-button:hover:not(:disabled),
.retry-button:hover {
  background: #303036;
  color: #fff;
}

.state-card {
  min-height: 150px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: #b7b7bf;
  padding: 24px;
  text-align: left;
}

.state-card strong {
  color: var(--text);
  display: block;
  font-size: 14px;
  margin-bottom: 4px;
}

.state-card p {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
  margin: 0;
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #303036;
  border-top-color: var(--green-bright);
  border-radius: 50%;
  animation: analytics-spin 0.8s linear infinite;
  flex-shrink: 0;
}

@keyframes analytics-spin {
  to { transform: rotate(360deg); }
}

.error-state {
  justify-content: space-between;
  border-color: #5a2b2b;
  background: #261718;
}

.empty-state {
  min-height: 120px;
  justify-content: flex-start;
  margin-top: 16px;
}

.inline-error,
.refresh-progress {
  border-radius: 7px;
  font-size: 12px;
  margin-bottom: 12px;
  padding: 9px 12px;
}

.inline-error {
  color: #e8a0a0;
  background: #2a1818;
  border: 1px solid #4d2525;
}

.refresh-progress {
  color: #a9cfa1;
  background: #182417;
  border: 1px solid #2a4426;
}

.metrics-section,
.scope-section {
  margin-bottom: 16px;
}

.section-heading,
.card-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.section-heading {
  margin-bottom: 11px;
}

.section-heading h3,
.card-heading h3 {
  color: #d9d9de;
  font-size: 13px;
  margin: 0;
}

.section-heading p,
.card-heading p {
  color: #686871;
  font-size: 11px;
  line-height: 1.4;
  margin: 3px 0 0;
}

.coverage-summary {
  max-width: 58%;
  text-align: right;
}

.coverage-note {
  color: #8b8b94 !important;
  font-size: 10px !important;
  line-height: 1.4;
  margin: 0 0 5px !important;
}

.coverage-badges {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 4px;
}

.coverage-badge,
.table-count {
  color: #8ca884;
  background: #1b2819;
  border: 1px solid #2d4428;
  border-radius: 999px;
  font-size: 10px;
  padding: 4px 9px;
  white-space: nowrap;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(115px, 1fr));
  gap: 9px;
}

.metric-card {
  min-width: 0;
  background: var(--surface-raised);
  border: 1px solid rgba(255, 255, 255, 0.055);
  border-radius: 9px;
  padding: 12px;
  box-shadow: inset 0 2px 0 transparent;
}

.metric-card.tone-green { box-shadow: inset 0 2px 0 rgba(98, 206, 71, 0.72); }
.metric-card.tone-blue { box-shadow: inset 0 2px 0 rgba(127, 176, 217, 0.72); }
.metric-card.tone-amber { box-shadow: inset 0 2px 0 rgba(217, 184, 114, 0.72); }
.metric-card.tone-purple { box-shadow: inset 0 2px 0 rgba(168, 85, 247, 0.58); }

.metric-label {
  color: #73737c;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.055em;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.metric-value {
  color: #e9e9ed;
  font-size: clamp(17px, 1.45vw, 23px);
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  line-height: 1.2;
  margin-top: 7px;
}

.metric-detail {
  color: #696972;
  font-size: 10px;
  line-height: 1.35;
  margin-top: 4px;
}

.chart-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(260px, 0.9fr);
  gap: 12px;
  margin-bottom: 12px;
}

.chart-grid-even {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.chart-grid-three {
  grid-template-columns: minmax(230px, 0.8fr) minmax(360px, 1.5fr) minmax(230px, 0.8fr);
}

.chart-card,
.heatmap-card,
.table-card {
  min-width: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
}

.card-total {
  color: var(--green-bright);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  white-space: nowrap;
}

.chart-frame {
  height: 230px;
  margin-top: 10px;
  min-width: 0;
  position: relative;
}

.chart-frame-tall {
  height: 260px;
}

.chart-empty {
  min-height: 130px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #65656d;
  font-size: 12px;
  text-align: center;
}

.heatmap-card {
  margin-bottom: 16px;
}

.heat-legend {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #65656d;
  font-size: 9px;
  white-space: nowrap;
}

.heat-legend i {
  display: block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.heatmap-scroll {
  min-width: 0;
  overflow-x: auto;
  padding: 12px 0 3px;
}

.heatmap-head,
.heatmap-row {
  min-width: 680px;
  display: grid;
  grid-template-columns: 42px repeat(24, minmax(17px, 1fr));
  gap: 4px;
}

.heatmap-head {
  margin-bottom: 4px;
}

.heatmap-head span {
  color: #5f5f67;
  font-size: 8px;
  text-align: center;
}

.heatmap-row + .heatmap-row {
  margin-top: 4px;
}

.heat-day {
  align-self: center;
  color: #777780;
  font-size: 9px;
  text-align: left;
}

.heat-cell {
  aspect-ratio: 1.35;
  border: 1px solid rgba(255, 255, 255, 0.025);
  border-radius: 2px;
  min-height: 12px;
}

.heat-cell:focus-visible {
  outline: 1px solid #fff;
}

.scope-section {
  margin-top: 2px;
}

.table-card {
  margin-bottom: 12px;
}

.table-scroll {
  overflow: auto;
  margin: 12px -14px -14px;
  border-top: 1px solid var(--border);
}

table {
  width: 100%;
  min-width: 940px;
  border-collapse: collapse;
  color: #c5c5cb;
  font-size: 11px;
}

th,
td {
  border-bottom: 1px solid rgba(255, 255, 255, 0.045);
  padding: 10px 12px;
  text-align: left;
  vertical-align: middle;
}

th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #18181c;
  color: #74747d;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.045em;
  text-transform: uppercase;
  white-space: nowrap;
}

tbody tr:hover {
  background: rgba(255, 255, 255, 0.018);
}

tbody tr:last-child td {
  border-bottom: 0;
}

.numeric {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.sort-button {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  letter-spacing: inherit;
  padding: 0;
  text-transform: inherit;
}

th:first-child .sort-button,
th:nth-child(2) .sort-button {
  justify-content: flex-start;
}

.sort-button:hover {
  color: #bdbdc4;
}

.sort-indicator {
  width: 8px;
  color: var(--green-bright);
}

.project-link {
  display: block;
  width: fit-content;
  color: #dcdce1;
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
}

.project-link:hover {
  color: var(--green-bright);
}

.project-date,
.cell-sub,
.agent-id {
  display: block;
  color: #606069;
  font-size: 9px;
  margin-top: 3px;
}

.agent-name {
  color: #dcdce1;
  font-size: 12px;
  font-weight: 600;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: #2a2a2e;
  color: #aaa;
  font-size: 10px;
  padding: 3px 8px;
  text-transform: capitalize;
}

.status-active { background: #1d3a1d; color: #7fd97f; }
.status-planning { background: #1d2a3a; color: #7fb0d9; }
.status-paused,
.status-budgetpaused { background: #3a331d; color: #d9c47f; }
.status-blocked { background: #3a1f1d; color: #e08a8a; }
.status-completed { background: #1d2a3a; color: #7fb0d9; }
.status-archived { background: #2a2a2e; color: #999; }

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 1250px) {
  .metric-grid {
    grid-template-columns: repeat(4, minmax(120px, 1fr));
  }

  .chart-grid-three {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .chart-grid-three .chart-card-wide {
    grid-column: 1 / -1;
    grid-row: 1;
  }
}

@media (max-width: 880px) {
  .analytics-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .analytics-actions {
    width: 100%;
    justify-content: space-between;
  }

  .range-control {
    overflow-x: auto;
  }

  .metric-grid {
    grid-template-columns: repeat(3, minmax(110px, 1fr));
  }

  .chart-grid,
  .chart-grid-even,
  .chart-grid-three {
    grid-template-columns: 1fr;
  }

  .chart-grid-three .chart-card-wide {
    grid-column: auto;
    grid-row: auto;
  }
}

@media (max-width: 560px) {
  .analytics-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .range-control {
    justify-content: space-between;
  }

  .range-button {
    flex: 1;
    min-width: 34px;
    padding-inline: 6px;
  }

  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .chart-card,
  .heatmap-card,
  .table-card {
    padding: 12px;
  }

  .chart-frame,
  .chart-frame-tall {
    height: 220px;
  }

  .section-heading,
  .card-heading {
    gap: 8px;
  }

  .section-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .coverage-summary {
    max-width: none;
    text-align: left;
  }

  .coverage-badges {
    justify-content: flex-start;
  }

  .generated-at {
    display: block;
  }

  .generated-at::before {
    content: "";
  }
}

@media (prefers-reduced-motion: reduce) {
  .loading-spinner {
    animation-duration: 1.8s;
  }
}
</style>
