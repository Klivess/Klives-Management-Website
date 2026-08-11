<template>
  <div
    class="dashboard-shell"
    data-testid="dashboard-shell"
    :data-fast-stale="fastStale"
    :data-slow-stale="slowStale"
  >
    <header class="dashboard-commandbar">
      <div class="dashboard-identity">
        <span class="dashboard-wordmark">Dashboard</span>
        <span class="dashboard-health" :class="overallHealthTone">
          <span class="dashboard-health__dot" aria-hidden="true" />
          {{ overallHealthLabel }}
        </span>
        <span class="dashboard-freshness" aria-live="polite">
          {{ freshnessLabel }}
        </span>
      </div>

      <div class="dashboard-actions" aria-label="Dashboard quick actions">
        <DashboardAction
          v-if="isKlives"
          data-testid="action-ask-agent"
          label="Ask Agent"
          icon="AI"
          to="/kliveagent"
          tone="primary"
        />
        <DashboardAction
          v-if="isKlives"
          data-testid="action-new-project"
          label="New Project"
          icon="+"
          to="/projects/new"
          tone="primary"
        />
        <DashboardAction
          data-testid="action-upload"
          label="Upload"
          icon="↑"
          :badge="upload.active ? `${upload.percent}%` : null"
          :disabled="actionPending.upload"
          @click="openUploadPicker"
        />
        <input
          ref="uploadInput"
          data-testid="upload-input"
          class="dashboard-file-input"
          type="file"
          multiple
          tabindex="-1"
          aria-hidden="true"
          @change="handleFilesSelected"
        >
        <DashboardAction
          v-if="isKlives"
          data-testid="action-mail"
          label="Mail"
          icon="@"
          to="/klivemail"
          :badge="mailUnread || null"
        />
        <DashboardAction v-else label="Cloud" icon="C" to="/klivecloud" />
        <DashboardAction v-if="!isKlives" label="Chat" icon="#" to="/klivechat" />
        <DashboardAction v-if="!isKlives" label="Schemes" icon="S" to="/schemes" />

        <details v-if="isKlives" ref="protectMenu" class="dashboard-protect">
          <summary
            data-testid="protective-menu"
            class="dashboard-protect__summary"
            aria-label="Open protective controls"
          >
            <span aria-hidden="true">!</span>
            Protect
          </summary>
          <div class="dashboard-protect__menu" role="menu">
            <button
              type="button"
              role="menuitem"
              :disabled="!offlineServices.length || actionPending.restart"
              @click="confirmRestartService()"
            >
              <strong>Restart failed service</strong>
              <span>{{ offlineServices.length ? `${offlineServices.length} offline` : 'All services online' }}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              :disabled="!activeProjectCount || actionPending.halt"
              @click="confirmHaltProjects"
            >
              <strong>Halt projects</strong>
              <span>{{ activeProjectCount }} available to halt</span>
            </button>
            <button
              type="button"
              role="menuitem"
              :disabled="firmSafeMode || actionPending.safeMode"
              @click="confirmFirmSafeMode"
            >
              <strong>Enter Firm safe mode</strong>
              <span>{{ firmSafeMode ? 'Already active' : 'Blocks new Firm orders' }}</span>
            </button>
          </div>
        </details>

        <DashboardAction
          data-testid="dashboard-refresh"
          :label="inFlight.fast || inFlight.slow ? 'Refreshing' : 'Refresh'"
          icon="↻"
          :disabled="inFlight.fast || inFlight.slow"
          @click="refreshDashboard"
        />
      </div>
    </header>

    <section class="dashboard-attention-strip" aria-labelledby="attention-title">
      <div class="dashboard-attention-strip__label">
        <span id="attention-title">Attention</span>
        <strong v-if="attentionItems.length">{{ attentionItems.length }}</strong>
      </div>
      <div v-if="attentionItems.length" class="dashboard-attention-strip__items">
        <DashboardAttentionItem
          v-for="item in attentionPreview"
          :key="item.id"
          :item="attentionView(item)"
        />
      </div>
      <div v-else class="dashboard-all-clear" role="status">
        <span aria-hidden="true">✓</span>
        No operational attention required
      </div>
      <button
        v-if="attentionOverflow"
        class="dashboard-attention-strip__more"
        type="button"
        @click="attentionDialogOpen = true"
      >
        +{{ attentionOverflow }} more
      </button>
    </section>

    <main
      class="dashboard-workspace"
      :class="workspaceClass"
      data-testid="dashboard-workspace"
    >
      <section class="dashboard-column dashboard-column--system" data-testid="panel-system">
        <DashboardPanel
          title="Host health"
          :status="fastStale ? 'Stale' : 'Live'"
          :loading="initialLoading.fast && !data.frontpage"
        >
          <template v-if="data.frontpage">
            <div class="dashboard-kpi-grid dashboard-kpi-grid--two">
              <DashboardKpi label="CPU" :value="percent(cpuUsage)" :tone="resourceTone(cpuUsage)" detail="current host load" />
              <DashboardKpi label="RAM" :value="percent(ramUsage)" :tone="resourceTone(ramUsage)" :detail="`${fixed(data.frontpage?.RamUsedGB, 1)} / ${fixed(data.frontpage?.RamTotalGB, 0)} GB`" />
              <DashboardKpi label="Primary disk" :value="percent(diskUsage)" :tone="resourceTone(diskUsage)" :detail="diskDetail" />
              <DashboardKpi label="Process" :value="`${fixed(data.frontpage?.ProcessMemoryMB, 0)} MB`" detail="Omnipotent working set" />
              <DashboardKpi label="Services" :value="`${serviceOnline}/${serviceTotal}`" :tone="offlineServices.length ? 'danger' : 'good'" detail="online" />
              <DashboardKpi label="Uptime" :value="data.frontpage?.BotUptimeHumanized || '—'" tone="good" detail="current process" />
            </div>
            <div class="dashboard-resource-trends">
              <div>
                <span>CPU · session</span>
                <DashboardSparkline :values="cpuSamples" label="CPU session trend" :tone="resourceTone(cpuUsage)" />
              </div>
              <div>
                <span>RAM · session</span>
                <DashboardSparkline :values="ramSamples" label="RAM session trend" :tone="resourceTone(ramUsage)" />
              </div>
            </div>
          </template>
          <div v-else class="dashboard-empty">Host telemetry unavailable</div>
        </DashboardPanel>

        <DashboardPanel
          title="Reliability"
          :subtitle="data.frontpage ? (data.frontpage.NextTaskScheduledSummary || 'No upcoming task reported') : 'Schedule unavailable'"
          :status="isAdmin ? (errors24h == null ? 'Errors unavailable' : `${errors24h} errors / 24h`) : 'Core telemetry'"
          :loading="initialLoading.fast && !data.api"
        >
          <div class="dashboard-kpi-grid dashboard-kpi-grid--two dashboard-kpi-grid--compact">
            <DashboardKpi label="API availability" :value="data.api ? percent(apiAvailability, 2) : '—'" :tone="!data.api ? 'neutral' : apiAvailability < 99 ? 'warning' : 'good'" detail="lifetime" />
            <DashboardKpi label="API latency" :value="data.api ? duration(apiLatency) : '—'" :tone="!data.api ? 'neutral' : apiLatency > 350 ? 'warning' : 'good'" detail="average response" />
            <DashboardKpi label="Requests" :value="data.api ? compact(apiLifetime.totalRequests) : '—'" detail="lifetime" />
            <DashboardKpi label="Scheduled" :value="data.frontpage ? compact(data.frontpage.TotalScheduledTasks) : '—'" detail="tasks registered" />
          </div>

          <div v-if="data.frontpage" class="dashboard-service-state">
            <div class="dashboard-section-label">
              <span>Service state</span>
              <button type="button" @click="servicesDialogOpen = true">View all</button>
            </div>
            <div v-if="offlineServices.length" class="dashboard-offline-list">
              <button
                v-for="service in offlineServices.slice(0, 3)"
                :key="service.Name"
                type="button"
                :disabled="actionPending.restart"
                :title="`${service.Name} is offline`"
                @click="isKlives ? confirmRestartService(service.Name) : servicesDialogOpen = true"
              >
                <span aria-hidden="true" />{{ service.Name }}
              </button>
              <button v-if="offlineServices.length > 3" type="button" @click="servicesDialogOpen = true">
                +{{ offlineServices.length - 3 }} more
              </button>
            </div>
            <div v-else class="dashboard-service-ok"><span aria-hidden="true">✓</span> All registered services are online</div>
          </div>
          <div v-else class="dashboard-empty">Service telemetry unavailable</div>
        </DashboardPanel>

        <DashboardPanel title="Estate" :status="slowStale ? 'Stale' : 'Current'" :loading="initialLoading.slow">
          <div v-if="estateChips.length" class="dashboard-estate-grid">
            <DashboardEstateChip
              v-for="chip in estateChips"
              :key="chip.id"
              :label="chip.label"
              :value="chip.value"
              :tone="componentTone(chip.tone)"
              :to="chip.href"
            />
          </div>
          <div v-else class="dashboard-empty">Estate telemetry unavailable</div>
        </DashboardPanel>
      </section>

      <section v-if="isAdmin" class="dashboard-column dashboard-column--work" data-testid="panel-work">
        <template v-if="isKlives">
          <DashboardPanel
            title="Active work"
            :subtitle="activeWorkSubtitle"
            :status="agentStatusLabel"
            :loading="initialLoading.fast && !data.agentStatus"
          >
            <div class="dashboard-agent-strip">
              <DashboardKpi label="Agent" :value="data.agentStatus ? (data.agentStatus.ready ? 'Ready' : (data.agentStatus.state || 'Starting')) : '—'" :tone="!data.agentStatus ? 'neutral' : data.agentStatus.ready ? 'good' : 'warning'" :detail="data.agentStatus?.message || 'Durable agent runtime'" />
              <DashboardKpi label="Jobs" :value="routeHasData('/kliveagent/jobs?activeOnly=true') ? data.agentJobs.length : '—'" :tone="!routeHasData('/kliveagent/jobs?activeOnly=true') ? 'neutral' : data.agentJobs.some((job: any) => job.attentionRequired) ? 'warning' : 'good'" detail="active long-term" />
              <DashboardKpi label="Unread" :value="routeHasData('/kliveagent/notifications?unreadOnly=true') ? data.agentNotifications.length : '—'" :tone="!routeHasData('/kliveagent/notifications?unreadOnly=true') ? 'neutral' : data.agentNotifications.length ? 'warning' : 'good'" detail="Agent notifications" />
              <DashboardKpi label="Today" :value="data.agentStats ? `${compact(data.agentStats.TodayMessages)} msgs` : '—'" :detail="data.agentStats ? `${compact(data.agentStats.TodayTotalTokens)} tokens` : 'summary unavailable'" />
              <DashboardKpi label="Agent cost" :value="data.agentStats ? money(data.agentStats.TodayEstimatedCostUsd, 'USD') : '—'" :tone="data.agentStats ? 'info' : 'neutral'" detail="today estimate" />
              <DashboardKpi label="Scripts" :value="data.agentStats ? percent(data.agentStats.LifetimeScriptSuccessRatePct, 1) : '—'" :tone="!data.agentStats ? 'neutral' : number(data.agentStats.LifetimeScriptSuccessRatePct) >= 90 ? 'good' : 'warning'" :detail="data.agentStats ? `${compact(data.agentStats.TodayScriptsRun)} today` : 'summary unavailable'" />
            </div>

            <div class="dashboard-section-label dashboard-section-label--projects">
              <span>Priority projects</span>
              <NuxtLink to="/projects">View fleet</NuxtLink>
            </div>
            <div v-if="projectRows.length" class="dashboard-project-list">
              <NuxtLink
                v-for="project in projectRows.slice(0, 4)"
                :key="project.id"
                :to="`/projects/${project.id}`"
                class="dashboard-project-row"
                :title="project.blocker || project.name"
              >
                <span class="dashboard-project-row__state" :class="projectTone(project.status)" aria-hidden="true" />
                <span class="dashboard-project-row__copy">
                  <strong>{{ project.name }}</strong>
                  <small>{{ project.status }} · {{ project.activeAgents == null ? 'agents unavailable' : `${project.activeAgents} active agents` }} · {{ project.lastActivityAt ? age(project.lastActivityAt) : 'activity unavailable' }}{{ project.blocker ? ` · ${project.blocker}` : '' }}</small>
                </span>
                <span class="dashboard-project-row__metrics">
                  <strong>{{ fixed(project.budgetUsedPct, 0) }}%</strong>
                  <small>{{ project.pendingApprovals ? `${project.pendingApprovals} approvals` : 'budget' }}</small>
                </span>
              </NuxtLink>
            </div>
            <div v-else class="dashboard-empty">{{ routeHasData('/projects/list') ? 'No active project work' : 'Project list unavailable' }}</div>
          </DashboardPanel>

          <DashboardPanel title="Recent operational signals" :status="`${recentSignals.length} total`">
            <DashboardBoundedList
              :items="recentSignals"
              :limit="5"
              aria-label="Recent operational signals"
              empty-text="No recent operational signals"
              @overflow="signalsDialogOpen = true"
            >
              <template #item="{ item }">
                <DashboardAttentionItem :item="attentionView(item)" />
              </template>
            </DashboardBoundedList>
          </DashboardPanel>
        </template>

        <template v-else>
          <DashboardPanel title="Recent errors" :status="routeHasData('/api/logs?type=1&limit=5&sort=desc') ? `${data.errors.length} shown` : 'Unavailable'" :loading="initialLoading.fast">
            <DashboardBoundedList :items="adminErrorItems" :limit="5" :empty-text="routeHasData('/api/logs?type=1&limit=5&sort=desc') ? 'No recent errors' : 'Error feed unavailable'" aria-label="Recent errors">
              <template #item="{ item }">
                <DashboardAttentionItem :item="item" />
              </template>
            </DashboardBoundedList>
          </DashboardPanel>
          <DashboardPanel title="Uptime" subtitle="Historical process availability" :status="!data.uptime ? 'Unavailable' : fastStale ? 'Stale' : 'Current'">
            <div v-if="data.uptime" class="dashboard-kpi-grid dashboard-kpi-grid--two">
              <DashboardKpi label="Current" :value="secondsDuration(data.uptime?.CurrentUptimeSeconds)" tone="good" detail="current period" />
              <DashboardKpi label="Total" :value="secondsDuration(data.uptime?.TotalUptimeSeconds)" detail="recorded uptime" />
              <DashboardKpi label="Average" :value="`${fixed(data.uptime?.AverageUptimeHours, 1)}h`" detail="per period" />
              <DashboardKpi label="Outage" :value="secondsDuration(data.uptime?.TotalOutageSeconds)" :tone="number(data.uptime?.TotalOutageSeconds) ? 'warning' : 'good'" detail="recorded downtime" />
            </div>
            <div v-else class="dashboard-empty">Uptime telemetry unavailable</div>
          </DashboardPanel>
        </template>
      </section>

      <section class="dashboard-column dashboard-column--analytics" data-testid="panel-analytics">
        <DashboardPanel
          title="OmniTrader"
          :subtitle="traderHealthSummary"
          :status="firmSafeMode ? 'Safe mode' : traderPermissionLabel"
          :loading="initialLoading.fast && !data.trader"
        >
          <template v-if="data.trader">
            <div class="dashboard-kpi-grid dashboard-kpi-grid--two dashboard-kpi-grid--compact">
              <DashboardKpi label="Real value" :value="money(data.trader?.Portfolio?.TotalValue, traderCurrency)" :tone="data.trader?.Portfolio?.HasRealAccounts ? 'live' : 'neutral'" detail="never includes simulation" />
              <DashboardKpi label="Simulated" :value="money(data.trader?.Simulated?.TotalValue, traderCurrency)" tone="paper" detail="paper and demo" />
              <DashboardKpi label="Realized today" :value="money(data.trader?.Portfolio?.RealizedPnLToday, traderCurrency, true)" :tone="signedTone(data.trader?.Portfolio?.RealizedPnLToday)" detail="real accounts" />
              <DashboardKpi label="Gross exposure" :value="money(data.trader?.Portfolio?.GrossExposure, traderCurrency)" detail="real accounts" />
              <DashboardKpi label="Exceptions" :value="tradingExceptions" :tone="tradingExceptions ? 'danger' : 'good'" detail="orders, breaks, alerts" />
              <DashboardKpi label="Strategies" :value="data.trader?.Strategies?.Running ?? 0" detail="running deployments" />
            </div>
            <div class="dashboard-chart-row">
              <span>Firm value · 30 days</span>
              <strong :class="signedToneClass(data.trader?.Trend?.ChangePercent24h)">{{ signedPercent(data.trader?.Trend?.ChangePercent24h) }} / 24h</strong>
              <DashboardSparkline :values="traderTrend" label="Firm value over 30 days" :tone="signedSparkTone(data.trader?.Trend?.Change24h)" />
            </div>
          </template>
          <div v-else class="dashboard-empty">Trading telemetry unavailable</div>
        </DashboardPanel>

        <DashboardPanel
          v-if="isKlives"
          title="Projects analytics"
          subtitle="Seven-day autonomous work"
          :status="data.projectAnalytics ? `${data.projectAnalytics.Summary?.ActiveAgents ?? 0} agents active` : 'Unavailable'"
          :loading="initialLoading.slow && !data.projectAnalytics"
        >
          <template v-if="data.projectAnalytics">
            <div class="dashboard-kpi-grid dashboard-kpi-grid--two dashboard-kpi-grid--compact">
              <DashboardKpi label="Projects" :value="data.projectAnalytics?.Summary?.ActiveProjects ?? 0" detail="active or planning" />
              <DashboardKpi label="Spend · 7d" :value="money(data.projectAnalytics?.Summary?.RangeSpendUsd, 'USD')" tone="info" detail="model tokens" />
              <DashboardKpi label="Wakes" :value="compact(data.projectAnalytics?.Summary?.Wakes)" detail="execution cycles" />
              <DashboardKpi label="Success" :value="percent(data.projectAnalytics?.Summary?.SuccessRate, 1)" :tone="number(data.projectAnalytics?.Summary?.SuccessRate) >= 80 ? 'good' : 'warning'" detail="terminal wake outcomes" />
            </div>
            <div class="dashboard-chart-row">
              <span>Daily spend · 7 days</span>
              <strong>{{ compact(data.projectAnalytics?.Summary?.RangeTokens) }} tokens</strong>
              <DashboardSparkline :values="projectTrend" label="Project spend over seven days" tone="info" />
            </div>
          </template>
          <div v-else class="dashboard-empty">Project analytics unavailable</div>
        </DashboardPanel>

        <DashboardPanel
          title="Schemes"
          subtitle="Compact production outcomes"
          :status="slowStale ? 'Stale' : 'Current'"
          :loading="initialLoading.slow && !data.cs2"
        >
          <div v-if="schemeRows.length" class="dashboard-scheme-list">
            <NuxtLink
              v-for="scheme in schemeRows"
              :key="scheme.id"
              :to="scheme.href"
              class="dashboard-scheme-row"
            >
              <span class="dashboard-scheme-row__name">{{ scheme.label }}</span>
              <strong :class="`tone-${componentTone(scheme.tone)}`">{{ scheme.primary }}</strong>
              <span>{{ scheme.secondary }}</span>
              <span>{{ scheme.tertiary }}</span>
            </NuxtLink>
          </div>
          <div v-else class="dashboard-empty">Scheme telemetry unavailable</div>
        </DashboardPanel>
      </section>
    </main>

    <div class="dashboard-announcer" aria-live="polite" role="status">{{ actionMessage }}</div>

    <DashboardDetailDialog v-model:open="attentionDialogOpen" title="All attention items">
      <div class="dashboard-dialog-list">
        <DashboardAttentionItem v-for="item in attentionItems" :key="item.id" :item="attentionView(item)" />
      </div>
    </DashboardDetailDialog>

    <DashboardDetailDialog v-model:open="signalsDialogOpen" title="Operational signals">
      <div class="dashboard-dialog-list">
        <DashboardAttentionItem v-for="item in recentSignals" :key="item.id" :item="attentionView(item)" />
      </div>
    </DashboardDetailDialog>

    <DashboardDetailDialog v-model:open="servicesDialogOpen" title="Service state">
      <div class="dashboard-service-dialog">
        <div v-for="service in services" :key="service.Name" class="dashboard-service-dialog__row">
          <span class="dashboard-service-dialog__state" :class="service.IsActive ? 'is-online' : 'is-offline'" aria-hidden="true" />
          <span><strong>{{ service.Name }}</strong><small>{{ service.IsActive ? service.UptimeHumanized : 'Inactive' }}</small></span>
          <button v-if="isKlives && !service.IsActive" type="button" :disabled="actionPending.restart" @click="confirmRestartService(service.Name)">Restart</button>
        </div>
      </div>
    </DashboardDetailDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import Swal from 'sweetalert2';
import DashboardAction from '~/components/Dashboard/DashboardAction.vue';
import DashboardAttentionItem from '~/components/Dashboard/DashboardAttentionItem.vue';
import DashboardBoundedList from '~/components/Dashboard/DashboardBoundedList.vue';
import DashboardDetailDialog from '~/components/Dashboard/DashboardDetailDialog.vue';
import DashboardEstateChip from '~/components/Dashboard/DashboardEstateChip.vue';
import DashboardKpi from '~/components/Dashboard/DashboardKpi.vue';
import DashboardPanel from '~/components/Dashboard/DashboardPanel.vue';
import DashboardSparkline from '~/components/Dashboard/DashboardSparkline.vue';
import {
  useDashboardOverview,
  type DashboardAttentionItem as AttentionModel,
  type DashboardTone,
} from '~/composables/useDashboardOverview';

definePageMeta({ layout: 'navbar' });

const dashboard = useDashboardOverview();
const {
  currentProfile,
  data,
  isAdmin,
  isKlives,
  initialLoading,
  inFlight,
  fastStale,
  slowStale,
  freshness,
  routeFreshness,
  lastUpdatedAt,
  cpuSamples,
  ramSamples,
  offlineServices,
  primaryDisk,
  apiLifetime,
  projectRows,
  activeProjectCount,
  attentionItems,
  recentSignals,
  schemeRows,
  estateChips,
  projectTrend,
  traderTrend,
  actionPending,
  actionMessage,
  safeModeAcknowledged,
  upload,
} = dashboard;

const uploadInput = ref<HTMLInputElement | null>(null);
const protectMenu = ref<HTMLDetailsElement | null>(null);
const attentionDialogOpen = ref(false);
const signalsDialogOpen = ref(false);
const servicesDialogOpen = ref(false);

const number = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const fixed = (value: unknown, digits = 0) => number(value).toFixed(digits);
const percent = (value: unknown, digits = 0) => `${fixed(value, digits)}%`;
const compactFormatter = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 });
const compact = (value: unknown) => compactFormatter.format(number(value));
const duration = (value: unknown) => {
  const ms = number(value);
  return ms >= 1_000 ? `${(ms / 1_000).toFixed(1)}s` : `${ms.toFixed(0)}ms`;
};
const secondsDuration = (value: unknown) => {
  const seconds = number(value);
  if (seconds >= 86_400) return `${(seconds / 86_400).toFixed(1)}d`;
  if (seconds >= 3_600) return `${(seconds / 3_600).toFixed(1)}h`;
  if (seconds >= 60) return `${(seconds / 60).toFixed(0)}m`;
  return `${seconds.toFixed(0)}s`;
};
const money = (value: unknown, currency = 'GBP', signed = false) => {
  const amount = number(value);
  try {
    const formatted = new Intl.NumberFormat('en-GB', {
      style: 'currency', currency: /^[A-Z]{3}$/.test(currency) ? currency : 'GBP',
      maximumFractionDigits: Math.abs(amount) < 100 ? 2 : 0,
    }).format(Math.abs(amount));
    return signed && amount !== 0 ? `${amount > 0 ? '+' : '-'}${formatted}` : amount < 0 ? `-${formatted}` : formatted;
  } catch { return `${amount.toFixed(2)} ${currency}`; }
};
const age = (value: unknown) => {
  if (!value) return 'no activity yet';
  const timestamp = typeof value === 'number' ? value : new Date(String(value)).getTime();
  const elapsed = Date.now() - timestamp;
  if (!Number.isFinite(elapsed) || elapsed < 0) return 'just now';
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const services = computed<any[]>(() => Array.isArray(data.frontpage?.Services) ? data.frontpage.Services : []);
const cpuUsage = computed(() => number(data.frontpage?.CpuUsagePercentage));
const ramUsage = computed(() => number(data.frontpage?.RamUsagePercentage));
const diskUsage = computed(() => number(primaryDisk.value?.UsagePercentage ?? data.cloud?.UsagePercentage));
const diskDetail = computed(() => primaryDisk.value
  ? `${fixed(primaryDisk.value.FreeSpaceGB, 1)} GB free on ${primaryDisk.value.DriveName || 'primary'}`
  : `${fixed(data.cloud?.FreeCapacityGB, 1)} GB free`);
const serviceOnline = computed(() => number(data.frontpage?.TotalServicesActive));
const serviceTotal = computed(() => number(data.frontpage?.TotalServicesRegistered));
const apiAvailability = computed(() => number(apiLifetime.value?.availabilityPct, 100));
const apiLatency = computed(() => number(apiLifetime.value?.avgResponseMs));
const errors24h = computed<number | null>(() => {
  if (!isAdmin.value) return null;
  const value = data.logs?.ErrorsLast24Hours ?? data.logs?.errorsLast24Hours;
  return value == null ? null : number(value);
});
const mailUnread = computed(() => number(data.mail?.unread));
const traderCurrency = computed(() => String(data.trader?.Portfolio?.ReportingCurrency || 'GBP'));
const firmSafeMode = computed(() => !!data.trader?.Controls?.SafeModeActive || safeModeAcknowledged.value);
const tradingExceptions = computed(() => {
  const exceptions = data.trader?.Exceptions || {};
  const criticalAlerts = Math.max(number(exceptions.CriticalAlerts), number(exceptions.UnacknowledgedCritical));
  return number(exceptions.UnknownOrders) + number(exceptions.MaterialBreaks) + criticalAlerts;
});
const traderHealthSummary = computed(() => data.trader?.Health?.Summary || 'Trading health unavailable');
const traderPermissionLabel = computed(() => !data.trader ? 'Unavailable' : data.trader.Health?.TradingPermitted ? 'Permitted' : 'Trading paused');
const agentStatusLabel = computed(() => !data.agentStatus ? 'Unavailable' : data.agentStatus.ready ? 'Agent ready' : `${fixed(number(data.agentStatus.progress) * (number(data.agentStatus.progress) <= 1 ? 100 : 1), 0)}% ready`);
const activeWorkSubtitle = computed(() => {
  const projects = routeHasData('/projects/list') ? `${projectRows.value.length} non-terminal projects` : 'Projects unavailable';
  const jobs = routeHasData('/kliveagent/jobs?activeOnly=true') ? `${data.agentJobs.length} Agent jobs` : 'Agent jobs unavailable';
  return `${projects} · ${jobs}`;
});

const attentionPreview = computed(() => attentionItems.value.slice(0, 4));
const attentionOverflow = computed(() => Math.max(0, attentionItems.value.length - 4));
const freshnessLabel = computed(() => {
  if (currentProfile.error.value && !lastUpdatedAt.value) return 'Profile unavailable · retrying';
  if (!lastUpdatedAt.value) return initialLoading.fast || initialLoading.slow ? 'Loading live data…' : 'Waiting for data';
  if (fastStale.value || slowStale.value) {
    const staleTimes = [fastStale.value ? freshness.fast : null, slowStale.value ? freshness.slow : null]
      .filter((value): value is number => typeof value === 'number' && value > 0);
    return staleTimes.length ? `Data stale · last complete ${age(Math.min(...staleTimes))}` : 'Data incomplete · retrying';
  }
  return `Updated ${age(lastUpdatedAt.value)}`;
});
const overallHealthTone = computed(() => attentionItems.value.some(item => item.severity === 'critical') ? 'is-critical'
  : attentionItems.value.some(item => item.severity === 'warning')
    || initialLoading.fast || initialLoading.slow || fastStale.value || slowStale.value || !!currentProfile.error.value
    ? 'is-warning' : 'is-good');
const overallHealthLabel = computed(() => {
  if (overallHealthTone.value === 'is-critical') return 'Action needed';
  if (currentProfile.error.value) return 'Profile retrying';
  if (initialLoading.fast || initialLoading.slow) return 'Loading';
  if (fastStale.value || slowStale.value) return 'Data stale';
  return overallHealthTone.value === 'is-warning' ? 'Watch' : 'Healthy';
});
const workspaceClass = computed(() => ({
  'dashboard-workspace--klives': isKlives.value,
  'dashboard-workspace--admin': isAdmin.value && !isKlives.value,
  'dashboard-workspace--public': !isAdmin.value,
}));

const componentTone = (tone: DashboardTone) => tone === 'success' ? 'good' : tone;
const routeHasData = (path: string) => Boolean(routeFreshness[path]);
const resourceTone = (value: unknown) => number(value) > 85 ? 'danger' : number(value) > 60 ? 'warning' : 'good';
const signedTone = (value: unknown) => number(value) < 0 ? 'danger' : number(value) > 0 ? 'good' : 'neutral';
const signedToneClass = (value: unknown) => `tone-${signedTone(value)}`;
const signedSparkTone = (value: unknown) => number(value) < 0 ? 'danger' : number(value) > 0 ? 'good' : 'neutral';
const signedPercent = (value: unknown) => {
  if (value == null) return '—';
  const amount = number(value);
  return `${amount > 0 ? '+' : ''}${amount.toFixed(2)}%`;
};
const projectTone = (status: string) => {
  const state = status.toLowerCase();
  if (state === 'blocked') return 'is-danger';
  if (state === 'budgetpaused' || state === 'paused') return 'is-warning';
  return 'is-good';
};

function attentionView(item: AttentionModel) {
  return { ...item, to: item.href, timeAgo: item.timestamp ? age(item.timestamp) : '' };
}

const adminErrorItems = computed(() => (Array.isArray(data.errors) ? data.errors : []).map((error: any, index: number) => ({
  id: String(error.id ?? error.Id ?? index),
  source: error.serviceName || error.ServiceName || 'Logs',
  severity: 'critical' as const,
  title: error.message || error.Message || 'Recent error',
  detail: error.fullMessage || error.FullMessage || '',
  timeAgo: age(error.timestamp || error.Timestamp),
  to: '/admin',
})));

const swalTheme = {
  background: '#161616',
  color: '#f4f4f4',
  confirmButtonColor: '#4d9e39',
  cancelButtonColor: '#555',
};

function closeProtectMenu() {
  if (protectMenu.value) protectMenu.value.open = false;
}

async function showResult(message: string, icon: 'success' | 'warning' | 'error' = 'success') {
  await Swal.fire({ ...swalTheme, icon, text: message, timer: icon === 'success' ? 1800 : undefined, showConfirmButton: icon !== 'success' });
}

async function confirmRestartService(preselected = '') {
  closeProtectMenu();
  const options = Object.fromEntries(offlineServices.value.map((service: any) => [service.Name, service.Name]));
  if (!Object.keys(options).length) return;
  const selection = await Swal.fire({
    ...swalTheme,
    icon: 'warning',
    title: 'Restart failed service',
    text: 'The restart is queued in the background and then verified for up to 30 seconds.',
    input: 'select',
    inputOptions: options,
    inputValue: preselected || offlineServices.value[0]?.Name,
    showCancelButton: true,
    confirmButtonText: 'Queue restart',
    inputValidator: value => value ? undefined : 'Select a service.',
  });
  if (!selection.isConfirmed || !selection.value) return;
  try {
    const result = await dashboard.restartService(String(selection.value));
    await showResult(result.message, result.verified ? 'success' : 'warning');
  } catch (error: any) { await showResult(error?.message || 'Restart failed.', 'error'); }
}

async function confirmHaltProjects() {
  closeProtectMenu();
  const result = await Swal.fire({
    ...swalTheme,
    icon: 'warning',
    title: `Halt ${activeProjectCount.value} projects?`,
    text: 'Each available non-terminal project will remember its prior state. Resuming remains on the Projects page.',
    showCancelButton: true,
    confirmButtonText: 'Halt projects',
  });
  if (!result.isConfirmed) return;
  try {
    const response = await dashboard.haltProjects();
    await showResult(`${number(response?.halted)} project${number(response?.halted) === 1 ? '' : 's'} halted.`);
  } catch (error: any) { await showResult(error?.message || 'Project halt failed.', 'error'); }
}

async function confirmFirmSafeMode() {
  closeProtectMenu();
  if (firmSafeMode.value) return;
  const result = await Swal.fire({
    ...swalTheme,
    icon: 'warning',
    title: 'Enter Firm safe mode?',
    text: 'This blocks new Firm orders. It does not stop legacy deployment sessions, and it cannot be cleared from this dashboard.',
    showCancelButton: true,
    confirmButtonText: 'Enter safe mode',
  });
  if (!result.isConfirmed) return;
  try {
    await dashboard.enterFirmSafeMode();
    await showResult('Firm safe mode is active.');
  } catch (error: any) { await showResult(error?.message || 'Safe mode request failed.', 'error'); }
}

function openUploadPicker() {
  if (!actionPending.upload) uploadInput.value?.click();
}

async function handleFilesSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = '';
  if (!files.length) return;
  try {
    await dashboard.uploadFiles(files);
    await showResult(`${files.length} file${files.length === 1 ? '' : 's'} uploaded to KliveCloud root.`);
  } catch (error: any) { await showResult(error?.message || 'Upload failed.', 'error'); }
}

async function refreshDashboard() {
  await dashboard.refreshAll();
}
</script>

<style scoped>
.dashboard-shell {
  --dash-bg: #201f20;
  --dash-card: #161616;
  --dash-border: rgba(255, 255, 255, 0.075);
  --dash-text: #ededed;
  --dash-muted: #858585;
  display: grid;
  min-width: 0;
  min-height: 100vh;
  grid-template-rows: 42px auto auto;
  gap: 8px;
  padding: 10px;
  overflow-x: hidden;
  background: var(--dash-bg);
  color: var(--dash-text);
}

.dashboard-commandbar,
.dashboard-attention-strip {
  min-width: 0;
  border: 1px solid var(--dash-border);
  border-radius: 6px;
  background: var(--dash-card);
}

.dashboard-commandbar {
  display: flex;
  height: 42px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 4px 6px 4px 10px;
}

.dashboard-identity,
.dashboard-actions {
  display: flex;
  min-width: 0;
  align-items: center;
}

.dashboard-identity { gap: 9px; }
.dashboard-actions { flex: 0 0 auto; gap: 5px; }
.dashboard-wordmark { color: #f4f4f4; font-size: 15px; font-weight: 750; letter-spacing: .02em; }

.dashboard-health {
  display: inline-flex;
  height: 22px;
  align-items: center;
  gap: 5px;
  border-radius: 999px;
  padding: 0 7px;
  background: rgba(255, 255, 255, .035);
  color: #aaa;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}

.dashboard-health__dot { width: 7px; height: 7px; border-radius: 50%; background: #62ce47; box-shadow: 0 0 0 3px rgba(98, 206, 71, .1); }
.dashboard-health.is-warning { color: #f0c35b; }
.dashboard-health.is-warning .dashboard-health__dot { background: #e3b341; box-shadow: 0 0 0 3px rgba(227, 179, 65, .1); }
.dashboard-health.is-critical { color: #ff8f8f; }
.dashboard-health.is-critical .dashboard-health__dot { background: #ef6464; box-shadow: 0 0 0 3px rgba(239, 100, 100, .1); }
.dashboard-freshness { overflow: hidden; color: #707070; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.dashboard-file-input { position: fixed; width: 1px; height: 1px; opacity: 0; pointer-events: none; }

.dashboard-protect { position: relative; height: 34px; }
.dashboard-protect__summary {
  display: inline-flex;
  height: 34px;
  align-items: center;
  gap: 5px;
  border: 1px solid rgba(227, 179, 65, .3);
  border-radius: 5px;
  padding: 0 9px;
  background: rgba(227, 179, 65, .08);
  color: #f0c35b;
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
  list-style: none;
}
.dashboard-protect__summary::-webkit-details-marker { display: none; }
.dashboard-protect__summary:focus-visible { outline: 2px solid #62ce47; outline-offset: 2px; }
.dashboard-protect__menu {
  position: absolute;
  z-index: 1200;
  top: 38px;
  right: 0;
  display: grid;
  width: 260px;
  gap: 4px;
  border: 1px solid rgba(227, 179, 65, .26);
  border-radius: 6px;
  padding: 5px;
  background: #131313;
  box-shadow: 0 14px 38px rgba(0, 0, 0, .55);
}
.dashboard-protect__menu button {
  display: flex;
  min-height: 45px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 5px;
  padding: 5px 8px;
  background: transparent;
  color: #d4d4d4;
  cursor: pointer;
  text-align: left;
}
.dashboard-protect__menu button:hover:not(:disabled), .dashboard-protect__menu button:focus-visible { border-color: rgba(227, 179, 65, .25); background: rgba(227, 179, 65, .07); outline: none; }
.dashboard-protect__menu button:disabled { opacity: .45; cursor: not-allowed; }
.dashboard-protect__menu strong { color: inherit; font-size: 11px; }
.dashboard-protect__menu span { color: #777; font-size: 9px; }

.dashboard-attention-strip {
  display: flex;
  min-height: 58px;
  align-items: center;
  gap: 7px;
  padding: 7px;
}
.dashboard-attention-strip__label { display: flex; width: 70px; flex: 0 0 auto; align-items: center; gap: 5px; color: #888; font-size: 9px; font-weight: 750; letter-spacing: .06em; text-transform: uppercase; }
.dashboard-attention-strip__label strong { display: grid; min-width: 17px; height: 17px; place-items: center; border-radius: 999px; background: rgba(239, 100, 100, .12); color: #ff8f8f; font-size: 9px; }
.dashboard-attention-strip__items { display: grid; min-width: 0; flex: 1; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 5px; }
.dashboard-all-clear { display: flex; min-width: 0; flex: 1; align-items: center; gap: 7px; color: #7dda67; font-size: 11px; }
.dashboard-all-clear span { display: grid; width: 22px; height: 22px; place-items: center; border-radius: 50%; background: rgba(98, 206, 71, .09); color: #7dda67; }
.dashboard-attention-strip__more { height: 28px; flex: 0 0 auto; border: 1px dashed rgba(255, 255, 255, .12); border-radius: 5px; padding: 0 8px; background: transparent; color: #999; cursor: pointer; font-size: 9px; }
.dashboard-attention-strip__more:hover, .dashboard-attention-strip__more:focus-visible { border-color: rgba(98, 206, 71, .35); color: #8de279; outline: none; }

.dashboard-workspace {
  display: grid;
  min-width: 0;
  min-height: 0;
  gap: 8px;
}
.dashboard-workspace--klives { grid-template-columns: minmax(250px, 3fr) minmax(390px, 5fr) minmax(320px, 4fr); }
.dashboard-workspace--admin { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.dashboard-workspace--public { grid-template-columns: minmax(300px, 4fr) minmax(500px, 8fr); }
.dashboard-column { display: grid; min-width: 0; min-height: 0; gap: 8px; }
.dashboard-column--system { grid-template-rows: minmax(0, 1.05fr) minmax(0, 1fr) minmax(0, .7fr); }
.dashboard-column--work { grid-template-rows: minmax(0, 1.2fr) minmax(0, .8fr); }
.dashboard-column--analytics { grid-template-rows: repeat(3, minmax(0, 1fr)); }

.dashboard-shell :deep(.dashboard-panel__body) { overflow: hidden; }
.dashboard-kpi-grid { display: grid; min-width: 0; gap: 4px; }
.dashboard-kpi-grid--two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.dashboard-kpi-grid--compact :deep(.dashboard-kpi) { min-height: 29px; }
.dashboard-resource-trends { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; margin-top: 7px; }
.dashboard-resource-trends > div { min-width: 0; border-top: 1px solid rgba(255, 255, 255, .055); padding-top: 4px; }
.dashboard-resource-trends span, .dashboard-chart-row > span { color: #777; font-size: 10px; letter-spacing: .04em; text-transform: uppercase; }

.dashboard-service-state { margin-top: 7px; }
.dashboard-section-label { display: flex; height: 22px; align-items: center; justify-content: space-between; color: #777; font-size: 10px; letter-spacing: .04em; text-transform: uppercase; }
.dashboard-section-label button, .dashboard-section-label a { border: 0; padding: 0; background: transparent; color: #71bd60; cursor: pointer; font-size: 10px; text-decoration: none; text-transform: none; }
.dashboard-offline-list { display: flex; min-width: 0; flex-wrap: wrap; gap: 4px; }
.dashboard-offline-list button { display: inline-flex; height: 25px; min-width: 0; align-items: center; gap: 5px; border: 1px solid rgba(239, 100, 100, .18); border-radius: 4px; padding: 0 6px; overflow: hidden; background: rgba(239, 68, 68, .05); color: #e6a0a0; cursor: pointer; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.dashboard-offline-list button span { width: 6px; height: 6px; flex: 0 0 auto; border-radius: 50%; background: #ef6464; }
.dashboard-service-ok { display: flex; height: 27px; align-items: center; gap: 6px; color: #7dda67; font-size: 10px; }
.dashboard-service-ok span { color: inherit; }
.dashboard-estate-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; }

.dashboard-agent-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; }
.dashboard-section-label--projects { margin-top: 6px; }
.dashboard-project-list { display: grid; gap: 4px; }
.dashboard-project-row { display: grid; min-width: 0; height: 47px; grid-template-columns: 7px minmax(0, 1fr) auto; align-items: center; gap: 7px; border: 1px solid rgba(255, 255, 255, .06); border-radius: 5px; padding: 4px 7px; background: rgba(255, 255, 255, .018); color: inherit; text-decoration: none; }
.dashboard-project-row:hover, .dashboard-project-row:focus-visible { border-color: rgba(98, 206, 71, .3); background: rgba(77, 158, 57, .055); outline: none; }
.dashboard-project-row__state { width: 7px; height: 7px; border-radius: 50%; background: #62ce47; }
.dashboard-project-row__state.is-warning { background: #e3b341; }
.dashboard-project-row__state.is-danger { background: #ef6464; }
.dashboard-project-row__copy, .dashboard-project-row__metrics { display: flex; min-width: 0; flex-direction: column; }
.dashboard-project-row__copy strong, .dashboard-project-row__copy small, .dashboard-project-row__metrics strong, .dashboard-project-row__metrics small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dashboard-project-row__copy strong { color: #e7e7e7; font-size: 11px; }
.dashboard-project-row__copy small, .dashboard-project-row__metrics small { color: #777; font-size: 10px; }
.dashboard-project-row__metrics { align-items: flex-end; }
.dashboard-project-row__metrics strong { color: #a8d69e; font-size: 11px; font-variant-numeric: tabular-nums; }
.dashboard-empty { display: grid; height: 54px; place-items: center; color: #707070; font-size: 10px; }

.dashboard-chart-row { display: grid; min-width: 0; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 2px 8px; margin-top: 5px; border-top: 1px solid rgba(255, 255, 255, .055); padding-top: 4px; }
.dashboard-chart-row strong { color: #9c9c9c; font-size: 9px; font-variant-numeric: tabular-nums; }
.dashboard-chart-row :deep(.dashboard-sparkline) { grid-column: 1 / -1; height: 25px; }
.dashboard-scheme-list { display: grid; gap: 4px; }
.dashboard-scheme-row { display: grid; min-width: 0; height: 32px; grid-template-columns: minmax(90px, 1.25fr) repeat(3, minmax(62px, 1fr)); align-items: center; gap: 6px; border: 1px solid rgba(255, 255, 255, .055); border-radius: 5px; padding: 0 7px; color: inherit; text-decoration: none; }
.dashboard-scheme-row:hover, .dashboard-scheme-row:focus-visible { border-color: rgba(98, 206, 71, .3); background: rgba(77, 158, 57, .05); outline: none; }
.dashboard-scheme-row > * { overflow: hidden; color: #888; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.dashboard-scheme-row__name { color: #dedede; font-size: 11px; font-weight: 650; }
.dashboard-scheme-row strong { color: #d8d8d8; font-variant-numeric: tabular-nums; }
.tone-good { color: #7dda67 !important; }
.tone-warning { color: #f0c35b !important; }
.tone-danger { color: #ff8282 !important; }
.tone-info { color: #7dd3fc !important; }

.dashboard-announcer { position: fixed; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.dashboard-dialog-list { display: grid; gap: 5px; }
.dashboard-service-dialog { display: grid; gap: 4px; }
.dashboard-service-dialog__row { display: grid; min-height: 42px; grid-template-columns: 8px minmax(0, 1fr) auto; align-items: center; gap: 8px; border: 1px solid rgba(255, 255, 255, .06); border-radius: 5px; padding: 5px 7px; }
.dashboard-service-dialog__state { width: 8px; height: 8px; border-radius: 50%; background: #ef6464; }
.dashboard-service-dialog__state.is-online { background: #62ce47; }
.dashboard-service-dialog__row > span:nth-child(2) { display: flex; min-width: 0; flex-direction: column; }
.dashboard-service-dialog__row strong { color: #eee; font-size: 11px; }
.dashboard-service-dialog__row small { color: #777; font-size: 9px; }
.dashboard-service-dialog__row button { height: 27px; border: 1px solid rgba(98, 206, 71, .25); border-radius: 4px; padding: 0 8px; background: rgba(77, 158, 57, .08); color: #8de279; cursor: pointer; font-size: 9px; }
.dashboard-offline-list button:disabled, .dashboard-service-dialog__row button:disabled { cursor: not-allowed; opacity: .45; }

@media (min-width: 1440px) and (min-height: 900px) {
  .dashboard-shell { height: 100dvh; min-height: 0; grid-template-rows: 42px 58px minmax(0, 1fr); overflow: hidden; }
  .dashboard-workspace--admin .dashboard-column--analytics { grid-template-rows: repeat(2, minmax(0, 1fr)); }
  .dashboard-workspace--public .dashboard-column--analytics { grid-template-rows: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 1439px), (max-height: 899px) {
  .dashboard-shell { height: auto; min-height: 100vh; overflow: visible; }
  .dashboard-workspace { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dashboard-column { min-height: 650px; }
  .dashboard-column--analytics { grid-column: 1 / -1; min-height: 700px; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: auto; }
  .dashboard-column--analytics > :last-child { grid-column: 1 / -1; }
  .dashboard-attention-strip__items { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dashboard-attention-strip { align-items: flex-start; }
}

@media (max-width: 980px) {
  .dashboard-commandbar { height: auto; min-height: 42px; flex-wrap: wrap; }
  .dashboard-actions { flex-wrap: wrap; }
  .dashboard-attention-strip { flex-wrap: wrap; }
  .dashboard-attention-strip__label { width: auto; }
  .dashboard-attention-strip__items { flex-basis: calc(100% - 90px); }
}

@media (max-width: 899px) {
  .dashboard-workspace, .dashboard-column--analytics { grid-template-columns: 1fr; }
  .dashboard-column, .dashboard-column--analytics { min-height: auto; grid-column: auto; grid-template-rows: auto; }
  .dashboard-column > :deep(.dashboard-panel) { min-height: 230px; }
  .dashboard-column--analytics > :last-child { grid-column: auto; }
}

@media (max-width: 767px) {
  .dashboard-shell { padding: 8px 8px 8px 62px; }
  .dashboard-freshness, .dashboard-health { display: none; }
  .dashboard-actions :deep(.dashboard-action__label), .dashboard-protect__summary { font-size: 0; }
  .dashboard-actions :deep(.dashboard-action__icon), .dashboard-protect__summary span { font-size: 11px; }
  .dashboard-attention-strip__items { grid-template-columns: 1fr; flex-basis: 100%; }
  .dashboard-agent-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dashboard-scheme-row { height: auto; min-height: 42px; grid-template-columns: minmax(100px, 1.5fr) minmax(80px, 1fr); }
}

@media (prefers-reduced-motion: reduce) {
  .dashboard-shell *, .dashboard-shell *::before, .dashboard-shell *::after { scroll-behavior: auto !important; transition-duration: .001ms !important; animation-duration: .001ms !important; animation-iteration-count: 1 !important; }
}
</style>
