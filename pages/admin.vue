<template>
  <div class="adm" data-testid="adm-root">
    <!-- ── command bar ── -->
    <header class="adm-bar">
      <div class="adm-bar__id">
        <h1 class="adm-bar__title">Admin</h1>
        <span v-if="stats?.MachineName" class="adm-bar__host">{{ stats.MachineName }}</span>
      </div>

      <button class="adm-search" aria-label="Search and run" aria-keyshortcuts="Control+K" data-testid="adm-search" @click="paletteOpen = true">
        <AdminIcon name="search" />
        <span class="adm-search__text">Go to a tool, restart a service…</span>
        <span class="adm-kbd">Ctrl</span><span class="adm-kbd">K</span>
      </button>

      <span class="adm-bar__spacer"></span>

      <div class="adm-bar__actions">
        <button
          class="adm-live"
          :data-state="linkState"
          :data-tone="linkTone"
          :title="linkTitle"
          :aria-label="linkTitle"
          data-testid="adm-live"
          @click="admin.setLive(!prefs.live)"
        >
          <span class="adm-live__dot"></span>
          <span class="adm-live__word">{{ linkWord }}</span>
          <span v-if="linkState === 'live'" :key="sweepKey" class="adm-live__sweep"></span>
        </button>
        <button class="adm-btn adm-btn--ghost" title="Refresh now (R)" aria-label="Refresh now" aria-keyshortcuts="R" data-testid="adm-refresh" @click="admin.refreshAll()">
          <AdminIcon name="refresh" :class="{ 'adm-spin': fastBusy || slowBusy }" />
        </button>
        <button v-if="can('system.update.deploy')" class="adm-btn" :disabled="deployBusy" data-testid="adm-deploy" @click="deployOpen = true">
          <AdminIcon name="deploy" />Update
          <span v-if="stats?.Build?.CommitShort" class="adm-chip adm-chip--mono">{{ stats.Build.CommitShort }}</span>
        </button>
      </div>
    </header>

    <!-- The layout already provides the page's <main>. -->
    <div class="adm-main">
      <!-- ── tools ── -->
      <nav v-if="launch.length" class="adm-launch" aria-label="Admin tools">
        <NuxtLink v-for="item in launch" :key="item.to" class="adm-launch__item" :to="item.to" :title="item.about" :data-testid="`launch-${item.id}`">
          <AdminIcon :name="item.icon" />{{ item.label }}
        </NuxtLink>
      </nav>

      <!-- ── update in progress ── -->
      <div v-if="deploy.phase !== 'idle'" class="adm-banner" :data-tone="deployTone" role="status" data-testid="adm-deploy-banner">
        <AdminIcon class="adm-banner__mark" :name="deploy.phase === 'back' ? 'check-circle' : deploy.phase === 'refused' ? 'octagon-x' : 'deploy'" />
        <div class="adm-banner__text">
          <div class="adm-banner__title">{{ deployTitle }}</div>
          <div class="adm-banner__detail">{{ deployDetail }}</div>
          <div v-if="deployBusy" class="adm-progress" :class="{ 'adm-progress--unknown': typicalRestart == null }">
            <span class="adm-progress__fill" :style="typicalRestart != null ? { transform: `scaleX(${deployProgress})` } : {}"></span>
          </div>
        </div>
        <span v-if="deployBusy" class="adm-banner__clock">{{ fmtDuration(deployElapsed) }}</span>
        <button v-else class="adm-btn adm-btn--sm adm-btn--ghost" @click="admin.dismissDeploy()">Dismiss</button>
      </div>

      <div v-if="!can('system.status.view')" class="adm-banner" data-tone="info">
        <AdminIcon class="adm-banner__mark" name="info" />
        <div class="adm-banner__text">
          <div class="adm-banner__title">Server status is not part of your access</div>
          <div class="adm-banner__detail">The tools above and the panels below are the parts of Admin you can open.</div>
        </div>
      </div>

      <div class="adm-grid" :class="{ 'adm-enter': firstPaint }" :data-stale="linkState === 'offline'">
        <template v-if="can('system.status.view')">
          <!-- ── verdict ── -->
          <AdminHero
            :verdict="verdict"
            :issues="activeIssues"
            :muted="mutedIssues"
            :pending="serviceAction"
            :busy="deployBusy"
            :process-uptime="processUptimeSeconds"
            :week-availability="can('system.uptime.view') ? weekView.availability : null"
            :errors-last-hour="errorsLastHour"
            :next-task="nextTask"
            :machine="stats?.MachineName ?? ''"
            :commit="stats?.Build?.CommitShort ?? ''"
            :built-label="builtLabel"
            @restart="name => admin.controlService(name, 'restart')"
            @deploy="deployOpen = true"
            @jump="jumpTo"
            @mute="admin.setMuted"
          />

          <!-- ── vitals ── -->
          <div id="adm-vitals" class="adm-vitals">
            <AdminVitalTile label="CPU" :value="stats ? stats.CpuUsagePercentage.toFixed(0) : null" unit="%" :tone="cpuTone" :state="cpuTone === 'crit' ? 'Saturated' : cpuTone === 'warn' ? 'High' : ''" testid="vital-cpu">
              <template #sub>
                <template v-if="stats">{{ stats.ProcessorCount }} cores<template v-if="rates.cpuAvg != null && historyMinutes >= 5"> · <b>{{ rates.cpuAvg.toFixed(0) }}%</b> mean over {{ historyLabel }}</template></template>
              </template>
              <AdminSpark :points="series.cpu" :min="0" :max="100" :tone="cpuTone" label="CPU" :format="v => `${v.toFixed(0)}%`" :empty-text="sparkEmpty" />
            </AdminVitalTile>

            <AdminVitalTile label="Memory" :value="stats ? stats.RamUsedGB.toFixed(1) : null" :unit="stats ? `/ ${stats.RamTotalGB.toFixed(0)} GB` : ''" :tone="ramTone" :state="ramTone === 'crit' ? 'Nearly full' : ramTone === 'warn' ? 'High' : ''" testid="vital-ram">
              <template #sub>
                <template v-if="stats"><b>{{ stats.RamUsagePercentage.toFixed(0) }}%</b> in use · {{ fmtGB(stats.RamTotalGB - stats.RamUsedGB) }} free</template>
              </template>
              <AdminSpark :points="series.ram" :min="0" :max="100" :tone="ramTone" label="Memory in use" :format="v => `${v.toFixed(0)}%`" :empty-text="sparkEmpty" />
            </AdminVitalTile>

            <AdminVitalTile label="Omnipotent" :value="processParts[0]" :unit="processParts[1]" tone="data" testid="vital-process">
              <template #sub>
                <template v-if="stats">heap <b>{{ fmtMB(stats.GCTotalMemoryMB) }}</b> · {{ fmtInt(stats.ProcessThreadCount) }} threads</template>
              </template>
              <AdminSpark :points="series.process" tone="data" label="Memory held by Omnipotent" :format="fmtMB" :empty-text="sparkEmpty" />
            </AdminVitalTile>

            <AdminVitalTile label="API" :value="apiTile.value" :unit="apiTile.unit" :tone="apiTile.tone" :state="apiTile.state" :to="can('system.api.telemetry.read') ? '/administration/api-telemetry' : ''" testid="vital-api">
              <template #sub>{{ apiTile.sub }}</template>
              <AdminSpark :points="series.requests" :tone="apiTile.tone" label="API requests a minute" :format="v => `${fmtInt(v)} / min`" :empty-text="sparkEmpty" />
            </AdminVitalTile>

            <AdminVitalTile label="Errors" :value="errorsLastHour != null ? fmtInt(errorsLastHour) : null" unit="last hour" :tone="errorTone" :state="errorTone === 'crit' ? 'Flood' : errorTone === 'warn' ? 'Elevated' : ''" :to="canOpen('/administration/botlogs') ? '/administration/botlogs?type=error' : ''" testid="vital-errors">
              <template #sub>{{ errorSub }}</template>
              <AdminSpark :points="series.errors" :tone="errorTone === 'ok' ? 'neutral' : errorTone" bars label="Errors logged a minute" :format="v => `${v.toFixed(v >= 10 ? 0 : 1)} / min`" :empty-text="sparkEmpty" />
            </AdminVitalTile>

            <AdminVitalTile label="Uptime" :value="processUptimeSeconds != null ? fmtDuration(processUptimeSeconds) : (stats?.BotUptimeHumanized ?? null)" tone="ok" strip testid="vital-uptime">
              <template #sub>
                <template v-if="can('system.uptime.view') && weekView.availability != null">
                  7 days: <b>{{ pct2(weekView.availability) }}</b> · {{ weekView.restarts }} restart{{ weekView.restarts === 1 ? '' : 's' }}
                </template>
                <template v-else>since the last restart</template>
              </template>
              <AdminUptimeStrip v-if="can('system.uptime.view')" :view="weekView" :height="26" />
            </AdminVitalTile>
          </div>

          <!-- ── services ── -->
          <AdminServiceGrid
            ref="serviceGrid"
            class="adm-col-12"
            :services="services"
            :pending="serviceAction"
            :can-control="can('system.services.control')"
            :can-logs="canOpen('/administration/botlogs')"
            :process-uptime="processUptimeSeconds"
            :now="now"
            :disabled="deployBusy"
            :loading="!ready"
            :flash="flashing === 'services'"
            @control="admin.controlService"
          />

          <!-- However many of the three this profile may see, they share the row. -->
          <div class="adm-trio">
            <!-- ── uptime ── -->
            <section v-if="can('system.uptime.view')" id="adm-uptime" class="adm-panel" :class="{ 'adm-stale': failed('Uptime history') }" aria-label="Uptime" :data-flash="flashing === 'uptime'">
              <header class="adm-panel__head">
                <h2 class="adm-panel__title"><AdminIcon name="clock" />Uptime</h2>
                <div class="adm-panel__tools">
                  <div class="adm-seg" role="group" aria-label="Uptime window">
                    <button v-for="range in UPTIME_RANGES" :key="range.value" class="adm-seg__opt" :aria-pressed="prefs.uptimeRange === range.value" :data-testid="`uptime-${range.value}`" @click="prefs.uptimeRange = range.value">{{ range.label }}</button>
                  </div>
                </div>
              </header>
              <div class="adm-panel__body">
                <template v-if="uptimeView.availability != null">
                  <div class="adm-facts">
                    <div><div class="adm-fact__label">Available</div><div class="adm-fact__value" data-testid="uptime-availability">{{ pct2(uptimeView.availability) }}</div></div>
                    <div :title="restartsTitle"><div class="adm-fact__label">{{ uptimeView.deploys ? `Restarts, ${uptimeView.deploys} deploys` : 'Restarts' }}</div><div class="adm-fact__value">{{ uptimeView.restarts }}</div></div>
                    <div><div class="adm-fact__label">Down</div><div class="adm-fact__value">{{ fmtDuration(uptimeView.downMs / 1000) }}</div></div>
                    <div><div class="adm-fact__label">Longest</div><div class="adm-fact__value">{{ uptimeView.longestOutageMs ? fmtDuration(uptimeView.longestOutageMs / 1000) : '—' }}</div></div>
                  </div>
                  <AdminUptimeStrip :view="uptimeView" :height="20" axis />
                  <p v-if="typicalRestart != null" class="adm-dim" style="margin-top: 8px; font-size: 11.5px">A restart usually takes the API down for {{ fmtDuration(typicalRestart) }}.</p>
                </template>
                <div v-else class="adm-empty">{{ uptime ? 'No uptime history yet.' : 'Reading uptime history…' }}</div>
              </div>
            </section>

            <!-- ── storage ── -->
            <section id="adm-storage" class="adm-panel" aria-label="Storage" :data-flash="flashing === 'storage'">
              <header class="adm-panel__head">
                <h2 class="adm-panel__title"><AdminIcon name="drive" />Storage</h2>
                <span v-if="stats?.DiskStatistics?.length" class="adm-panel__meta adm-num">{{ fmtGB(totalFreeGB, 0) }} free in all</span>
              </header>
              <div class="adm-panel__body">
                <template v-if="stats?.DiskStatistics?.length">
                  <div v-for="disk in stats.DiskStatistics" :key="disk.DriveName" class="adm-meter" :data-tone="diskTone(disk)" :data-testid="`disk-${disk.DriveName}`">
                    <div class="adm-meter__head">
                      <span class="adm-meter__name adm-mono">{{ disk.DriveName }}</span>
                      <span v-if="disk.VolumeLabel" class="adm-dim adm-truncate">{{ disk.VolumeLabel }}</span>
                      <span v-if="diskTone(disk) !== 'ok'" class="adm-state" :data-tone="diskTone(disk)"><AdminIcon :name="diskTone(disk) === 'crit' ? 'octagon-x' : 'alert'" />{{ diskTone(disk) === 'crit' ? 'Nearly full' : 'Filling up' }}</span>
                      <span class="adm-meter__figure">{{ disk.UsagePercentage.toFixed(0) }}%</span>
                    </div>
                    <div class="adm-meter__track" role="meter" :aria-valuenow="Math.round(disk.UsagePercentage)" aria-valuemin="0" aria-valuemax="100" :aria-label="`${disk.DriveName} space used`">
                      <div class="adm-meter__fill" :style="{ width: `${Math.min(100, disk.UsagePercentage)}%` }"></div>
                    </div>
                    <div class="adm-meter__foot">
                      <span>{{ fmtGB(disk.UsedSpaceGB) }} of {{ fmtGB(disk.TotalSizeGB, 0) }}</span>
                      <span>{{ fmtGB(disk.FreeSpaceGB) }} free</span>
                    </div>
                  </div>
                </template>
                <div v-else class="adm-empty">{{ stats ? 'No disks reported.' : 'Reading disks…' }}</div>
              </div>
            </section>

            <!-- ── schedule ── -->
            <AdminSchedulePanel
              :tasks="can('system.scheduler.read') ? tasks : null"
              :total="stats?.TotalScheduledTasks ?? null"
              :fallback="!can('system.scheduler.read') ? (stats?.NextTaskScheduledSummary || '') : ''"
              :now="now"
              :can-open="canOpen('/botSchedule')"
              :loading="!ready"
              :flash="flashing === 'schedule'"
            />
          </div>

          <!-- ── API ── -->
          <AdminApiPanel
            :class="[can('system.logs.read') ? 'adm-col-8' : 'adm-col-12', { 'adm-stale': failed('API statistics') }]"
            :stats="apiStats"
            :recent="apiWindow"
            :days="prefs.apiDays"
            :now="now"
            :can-telemetry="can('system.api.telemetry.read')"
            :loading="!ready || slowBusy"
            :flash="flashing === 'api'"
            @update:days="days => (prefs.apiDays = days)"
          />

          <AdminLogsPanel v-if="can('system.logs.read')" class="adm-col-4" :class="{ 'adm-stale': failed('Log summary') }" :summary="logSummary" :now="now" :loading="!ready || slowBusy" :flash="flashing === 'logs'" />

          <!-- ── network ── -->
          <AdminNetworkPanel
            ref="networkPanel"
            class="adm-col-7"
            :physical="physicalNics"
            :virtual="virtualNics"
            :rates="nicRates"
            :up-rate="rates.netUp"
            :down-rate="rates.netDown"
            :ports="ports"
            :can-read-ports="can('system.portforwarding.read')"
            :can-manage-ports="can('system.portforwarding.manage')"
            :busy="portsBusy"
            :now="now"
            :save-port="admin.savePortMapping"
            :delete-port="admin.deletePortMapping"
            :flash="flashing === 'network'"
          />

          <AdminHostPanel
            class="adm-col-5"
            :stats="stats"
            :browsers="can('system.resources.read') ? browsers : null"
            :gen2-per-min="rates.gen2PerMin"
            :now="now"
            :flash="flashing === 'host'"
          />
        </template>

        <template v-else>
          <div v-if="can('system.uptime.view')" class="adm-col-12 adm-panel">
            <header class="adm-panel__head"><h2 class="adm-panel__title"><AdminIcon name="clock" />Uptime</h2></header>
            <div class="adm-panel__body"><AdminUptimeStrip :view="uptimeView" :height="20" axis /></div>
          </div>
          <AdminSchedulePanel v-if="can('system.scheduler.read')" class="adm-col-12" :tasks="tasks" :total="tasks?.length ?? null" :now="now" :can-open="canOpen('/botSchedule')" />
          <AdminLogsPanel v-if="can('system.logs.read')" class="adm-col-12" :summary="logSummary" :now="now" />
        </template>
      </div>
    </div>

    <AdminTerminalDock v-if="can('system.terminal.use')" ref="dock" />

    <AdminCommandPalette :open="paletteOpen" :commands="commands" @close="paletteOpen = false" />

    <!-- ── update: what it does, before it does it ── -->
    <AdminDialog
      :open="deployOpen"
      title="Update Omnipotent"
      sub="Stops the process, pulls master, rebuilds and starts it again."
      icon="deploy"
      tone="warn"
      testid="deploy-dialog"
      @close="deployOpen = false"
    >
      <ul class="adm-dialog__list">
        <li v-if="stats?.Build?.CommitShort">
          <AdminIcon name="commit" />
          <span>Running <b class="adm-mono">{{ stats.Build.CommitShort }}</b>, built {{ fmtRelative(stats.Build.BuiltUtc, now) }}.
            <template v-if="stats.Updater?.LastSeenSha">
              {{ deployAhead ? `GitHub is at ${stats.Updater.LastSeenSha.slice(0, 7)}: this will bring it in.` : 'GitHub has nothing newer, so this rebuilds the same commit.' }}
            </template>
          </span>
        </li>
        <li>
          <AdminIcon name="clock" />
          <span>The API is offline while it builds{{ typicalRestart != null ? `: recent restarts took about ${fmtDuration(typicalRestart)}` : ', usually for a few minutes' }}. This page waits and tells you when it is back.</span>
        </li>
        <li>
          <AdminIcon name="layers" />
          <span>Every service restarts. Work in flight (agent runs, uploads, scheduled jobs mid-run) is cut off.</span>
        </li>
        <li v-if="stats?.Updater?.AutoDeploy">
          <AdminIcon name="info" />
          <span>New commits already deploy by themselves within {{ stats.Updater.PollIntervalSeconds }} s of a push. This is for retrying a build that did not take.</span>
        </li>
      </ul>
      <template #actions>
        <button class="adm-btn adm-btn--ghost" data-autofocus @click="deployOpen = false">Cancel</button>
        <button class="adm-btn adm-btn--danger" data-testid="deploy-confirm" @click="confirmDeploy"><AdminIcon name="deploy" />Update now</button>
      </template>
    </AdminDialog>

    <Teleport to="body">
      <div v-if="toasts.length" class="adm-layer">
        <div class="adm-toasts" role="status" aria-live="polite">
          <button v-for="toast in toasts" :key="toast.id" class="adm-toast" :data-tone="toast.tone" title="Dismiss" @click="admin.dismissToast(toast.id)">
            <AdminIcon :name="toast.tone === 'crit' ? 'octagon-x' : toast.tone === 'warn' ? 'alert' : toast.tone === 'info' ? 'info' : 'check-circle'" />
            <span>{{ toast.text }}</span>
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { UPTIME_RANGES, useAdminConsole } from '~/composables/useAdminConsole';
import {
  diskTone, fmtDuration, fmtGB, fmtInt, fmtMB, fmtMs, fmtCompact, fmtRelative, logsLink, sameCommit, toMs, usageTone,
  type AdminCommand, type Tone,
} from '~/scripts/adminConsole';

definePageMeta({ layout: 'navbar' });

const admin = useAdminConsole();
const {
  can, canOpen, stats, uptime, apiStats, apiWindow, logSummary, tasks, ports, browsers, services, physicalNics, virtualNics, nicRates,
  now, ready, linkState, sinceFastOk, unreachableFor, fastBusy, slowBusy, historyMinutes, historySupported,
  series, rates, uptimeView, weekView, typicalRestart, processUptimeSeconds,
  activeIssues, mutedIssues, verdict, prefs, serviceAction, deploy, deployBusy, deployElapsed, portsBusy, toasts,
} = admin;

/** A slow-tier panel whose last read failed keeps its figures, dimmed. */
const failed = (label: string) => admin.failedSections.value.includes(label);

const paletteOpen = ref(false);
const deployOpen = ref(false);
const firstPaint = ref(true);
const flashing = ref<string | null>(null);
const serviceGrid = ref<{ focusFilter: () => void; showIssues: () => void } | null>(null);
const networkPanel = ref<{ openEditor: (mapping: null) => void } | null>(null);
const dock = ref<{ toggle: () => void } | null>(null);

// ───────────────────────────── tools ─────────────────────────────

const TOOLS = [
  { id: 'logs', to: '/administration/botlogs', label: 'Logs', icon: 'logs', about: 'Service log: errors, status and who said what' },
  { id: 'settings', to: '/administration/omnisettings', label: 'Settings', icon: 'settings', about: 'OmniSettings: configuration, secrets and provider routing' },
  { id: 'telemetry', to: '/administration/api-telemetry', label: 'API telemetry', icon: 'activity', about: 'Latency, traffic and traces for every route' },
  { id: 'desktop', to: '/administration/remotedesktop', label: 'Remote desktop', icon: 'monitor', about: 'See and drive the server desktop' },
  { id: 'profiles', to: '/administration/profiles', label: 'Profiles', icon: 'users', about: 'Who can sign in and what each profile may do' },
  { id: 'defence', to: '/omnidefence', label: 'OmniDefence', icon: 'shield', about: 'Requests, tracked addresses and blocks' },
  { id: 'schedule', to: '/botSchedule', label: 'Schedule', icon: 'calendar', about: 'Every scheduled task and when it fires' },
  { id: 'klivelink', to: '/klivelink', label: 'KliveLink', icon: 'link', about: 'Connected machines' },
];
const launch = computed(() => TOOLS.filter(tool => canOpen(tool.to)));

// ───────────────────────────── bar ─────────────────────────────

const linkTone = computed<Tone>(() => ({ live: 'ok', paused: 'neutral', stale: 'warn', offline: 'crit', connecting: 'neutral' } as Record<string, Tone>)[linkState.value]);
const linkWord = computed(() => {
  if (linkState.value === 'live') return 'Live';
  if (linkState.value === 'paused') return 'Paused';
  if (linkState.value === 'connecting') return 'Connecting';
  const seconds = unreachableFor.value ?? sinceFastOk.value ?? 0;
  return `${linkState.value === 'offline' ? 'Offline' : 'Stale'} ${fmtDuration(seconds)}`;
});
const linkTitle = computed(() => {
  if (linkState.value === 'live') return 'Live: vitals every 5 seconds, the rest every 45. Click to pause.';
  if (linkState.value === 'paused') return 'Paused. Click to resume live updates.';
  if (linkState.value === 'connecting') return 'Connecting to the server';
  return `No answer from the API for ${fmtDuration(unreachableFor.value ?? 0)}. Still trying.`;
});
/** Restarts the countdown hairline each time a fresh snapshot lands. */
const sweepKey = computed(() => stats.value?.TimeStatisticsGenerated ?? 'none');

// ───────────────────────────── vitals ─────────────────────────────

const cpuTone = computed<Tone>(() => usageTone(stats.value?.CpuUsagePercentage, 85, 97));
const ramTone = computed<Tone>(() => usageTone(stats.value?.RamUsagePercentage, 88, 95));
const pct2 = (value: number) => (value >= 99.995 ? '100%' : `${value.toFixed(2)}%`);

const historyLabel = computed(() => (historyMinutes.value >= 55 ? 'the hour' : `${Math.max(1, Math.round(historyMinutes.value))} min`));
const sparkEmpty = computed(() => (historySupported.value ? 'Collecting…' : 'Builds up while open'));

/** "2.82 GB" as a number and its unit, so the unit can be set smaller. */
const processParts = computed<[string | null, string]>(() => {
  if (!stats.value) return [null, ''];
  const [value, unit] = fmtMB(stats.value.ProcessMemoryMB).split(' ');
  return [value, unit ?? ''];
});

const apiTile = computed(() => {
  const perMin = rates.value.requestsPerMin;
  const failing = rates.value.serverErrorsPerMin;
  const day = apiWindow.value?.kpi ?? null;
  // Failing right now if the live counters say so; otherwise the day's share, where telemetry is readable.
  const share = perMin && failing != null ? (failing / perMin) * 100 : (day?.errorPct ?? 0);
  const tone: Tone | 'data' = share >= 25 ? 'crit' : share >= 5 ? 'warn' : 'data';
  const state = tone === 'crit' ? 'Failing' : tone === 'warn' ? 'Errors' : '';
  const speed = day ? `95% under ${fmtMs(day.p95)}` : '';
  if (perMin != null) {
    const errors = failing != null && failing >= 0.05 ? `${failing.toFixed(failing >= 10 ? 0 : 1)} failing a minute` : 'none failing';
    return { value: fmtInt(perMin), unit: 'req / min', tone, state, sub: [speed, errors].filter(Boolean).join(' · ') };
  }
  // A server that does not report running totals: the day from telemetry, or failing that the lifetime count.
  if (day) return { value: fmtCompact(day.count), unit: 'requests today', tone, state, sub: [speed, `${day.errorPct.toFixed(1)}% failed`].join(' · ') };
  if (apiStats.value) return { value: fmtCompact(apiStats.value.lifetime.totalRequests), unit: 'requests', tone, state, sub: 'all time' };
  return { value: null, unit: '', tone, state, sub: '' };
});

const restartsTitle = computed(() => {
  const view = uptimeView.value;
  if (!view.deploys && !view.sameBuildRestarts) return 'Process starts in this window';
  const other = view.restarts - view.deploys - view.sameBuildRestarts;
  return [
    `${view.deploys} started a new build (deploys)`,
    `${view.sameBuildRestarts} restarted the same build (a crash, or by hand)`,
    other > 0 ? `${other} from before builds were recorded` : '',
  ].filter(Boolean).join(' · ');
});

const errorsLastHour = computed<number | null>(() => stats.value?.ErrorsLastHour ?? logSummary.value?.ErrorsLastHour ?? null);
const errorTone = computed<Tone>(() => {
  const count = errorsLastHour.value;
  if (count == null) return 'neutral';
  return count >= 200 ? 'crit' : count >= 30 ? 'warn' : 'ok';
});
const errorSub = computed(() => {
  const count = errorsLastHour.value;
  if (count == null) return '';
  if (count === 0) return 'Nothing logged an error';
  const loudest = [...services.value].sort((a, b) => (b.ErrorsLastHour ?? 0) - (a.ErrorsLastHour ?? 0))[0];
  if (loudest && (loudest.ErrorsLastHour ?? 0) > 0) return `${loudest.ErrorsLastHour} from ${loudest.Name}`;
  const top = logSummary.value?.TopServices?.filter(service => service.ErrorCount > 0).sort((a, b) => b.ErrorCount - a.ErrorCount)[0];
  return top ? `mostly ${top.ServiceName}` : `${fmtInt(stats.value?.TotalErrorLogs ?? 0)} in the log buffer`;
});

const nextTask = computed(() => {
  const upcoming = (tasks.value ?? [])
    .map(task => ({ name: task.taskName, due: toMs(task.dateTimeDue) ?? 0 }))
    .filter(task => task.due > now.value)
    .sort((a, b) => a.due - b.due)[0];
  return upcoming ? { name: upcoming.name, inLabel: `in ${fmtDuration((upcoming.due - now.value) / 1000)}` } : null;
});

const totalFreeGB = computed(() => (stats.value?.DiskStatistics ?? []).reduce((sum, disk) => sum + disk.FreeSpaceGB, 0));
const builtLabel = computed(() => {
  const build = stats.value?.Build;
  if (build?.BuiltUtc) return `built ${fmtRelative(build.BuiltUtc, now.value)}`;
  return stats.value?.lastOmnipotentUpdateHumanized ? `built ${stats.value.lastOmnipotentUpdateHumanized}` : '';
});

// ───────────────────────────── update ─────────────────────────────

const deployAhead = computed(() => {
  const build = stats.value?.Build;
  const updater = stats.value?.Updater;
  return !!(build?.Commit && updater?.LastSeenSha && !sameCommit(updater.LastSeenSha, build.Commit));
});
/** Long past the usual restart time: say so instead of spinning quietly. */
const deployOverdue = computed(() => deployBusy.value && deployElapsed.value > Math.max(600, (typicalRestart.value ?? 300) * 2.5));
const deployTone = computed<Tone>(() => {
  if (deploy.value.phase === 'back') return 'ok';
  if (deploy.value.phase === 'refused') return 'crit';
  return deployOverdue.value ? 'warn' : 'info';
});
const deployTitle = computed(() => {
  if (deploy.value.phase === 'back') return 'Omnipotent is back';
  if (deploy.value.phase === 'refused') return 'The update did not start';
  return deployOverdue.value ? 'The update is taking longer than usual' : 'Updating Omnipotent';
});
const deployDetail = computed(() => {
  if (!deployBusy.value) return deploy.value.message;
  if (deployOverdue.value) return 'Still waiting for the API. If it does not return, look at the server console: the build may have failed.';
  return typicalRestart.value != null ? `${deploy.value.message} Recent restarts took about ${fmtDuration(typicalRestart.value)}.` : deploy.value.message;
});
const deployProgress = computed(() => Math.min(0.96, deployElapsed.value / Math.max(30, typicalRestart.value ?? 300)));

function confirmDeploy() {
  deployOpen.value = false;
  void admin.startDeploy();
}

// ───────────────────────────── moving around ─────────────────────────────

async function jumpTo(section: string) {
  if (section === 'services') serviceGrid.value?.showIssues();
  await nextTick();
  const target = document.getElementById(`adm-${section}`);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  flashing.value = section;
  window.setTimeout(() => { if (flashing.value === section) flashing.value = null; }, 1_500);
}

const commands = computed<AdminCommand[]>(() => {
  const list: AdminCommand[] = [];
  const go = (to: string) => () => navigateTo(to);

  for (const tool of launch.value) list.push({ id: `go-${tool.id}`, group: 'Go to', title: tool.label, icon: tool.icon, keywords: tool.about, run: go(tool.to) });
  list.push({ id: 'go-home', group: 'Go to', title: 'Home', icon: 'home', keywords: 'dashboard', run: go('/dashboard') });
  if (canOpen('/administration/profiles/new')) list.push({ id: 'go-new-profile', group: 'Go to', title: 'New profile', icon: 'users', keywords: 'create account user', run: go('/administration/profiles/new') });

  list.push({ id: 'refresh', group: 'Actions', title: 'Refresh now', icon: 'refresh', hint: 'R', run: () => admin.refreshAll() });
  list.push({ id: 'live', group: 'Actions', title: prefs.value.live ? 'Pause live updates' : 'Resume live updates', icon: prefs.value.live ? 'pause' : 'play', run: () => admin.setLive(!prefs.value.live) });
  if (can('system.status.view')) list.push({ id: 'filter', group: 'Actions', title: 'Filter services', icon: 'search', hint: '/', run: () => { void jumpTo('services'); serviceGrid.value?.focusFilter(); } });
  if (can('system.terminal.use')) list.push({ id: 'terminal', group: 'Actions', title: 'Open or close the terminal', icon: 'terminal', hint: 'Ctrl `', keywords: 'powershell shell console', run: () => dock.value?.toggle() });
  if (can('system.portforwarding.manage') && ports.value?.success) list.push({ id: 'port-add', group: 'Actions', title: 'Forward a port…', icon: 'globe', keywords: 'upnp router mapping', run: () => networkPanel.value?.openEditor(null) });
  if (can('system.update.deploy')) list.push({ id: 'deploy', group: 'Actions', title: 'Update Omnipotent…', icon: 'deploy', keywords: 'deploy pull rebuild restart bot', run: () => { deployOpen.value = true; } });

  const control = can('system.services.control');
  const logs = canOpen('/administration/botlogs');
  for (const service of services.value) {
    if (control) {
      list.push({ id: `restart-${service.Name}`, group: 'Services', title: `Restart ${service.Name}`, icon: 'restart', danger: true, hint: service.IsActive ? 'restart' : 'start', run: () => admin.controlService(service.Name, 'restart') });
      if (service.IsActive) list.push({ id: `stop-${service.Name}`, group: 'Services', title: `Stop ${service.Name}`, icon: 'stop', danger: true, hint: 'stop', keywords: 'quit kill', run: () => admin.controlService(service.Name, 'quit') });
    }
    if (logs) list.push({ id: `logs-${service.Name}`, group: 'Services', title: `Logs: ${service.Name}`, icon: 'logs', hint: 'logs', run: go(logsLink(service.Name)) });
  }
  return list;
});

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element?.tagName) return false;
  return element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName);
}

function onKeydown(event: KeyboardEvent) {
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    paletteOpen.value = !paletteOpen.value;
    return;
  }
  if (event.ctrlKey && event.key === '`' && can('system.terminal.use')) {
    event.preventDefault();
    dock.value?.toggle();
    return;
  }
  if (mod || event.altKey || paletteOpen.value || deployOpen.value || isTyping(event.target)) return;
  if (event.key === '/' && can('system.status.view')) {
    event.preventDefault();
    serviceGrid.value?.focusFilter();
  } else if (event.key.toLowerCase() === 'r') {
    void admin.refreshAll();
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  window.setTimeout(() => { firstPaint.value = false; }, 900);
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<style lang="scss" src="~/assets/scss/admin-console.scss"></style>
