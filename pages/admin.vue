<template>
    <div class="admin-container">
        <!-- Header -->
        <div class="admin-header">
            <h1 class="admin-title">Administration</h1>
            <p class="admin-subtitle">System monitoring, server statistics, and management</p>
            <div class="admin-badge">
                <span v-if="statsLoading">Loading statistics...</span>
                <span v-else-if="statsError">Failed to load statistics · <a class="retry-link" @click="loadStats">Retry</a></span>
                <span v-else>Updated {{ stats.lastOmnipotentUpdateHumanized }} · {{ stats.MachineName }}</span>
            </div>
        </div>

        <!-- Key Metrics -->
        <KMInfoGrid columns="4" rows="1" rowHeight="110">
            <KMInfoBox caption="Bot Uptime">
                <div class="admin-metric">
                    <div class="metric-big clr-success">{{ stats.BotUptimeHumanized }}</div>
                    <div class="metric-sub">Last updated from Github {{ stats.lastOmnipotentUpdateHumanized }}</div>
                </div>
            </KMInfoBox>
            <KMInfoBox caption="CPU Usage">
                <div class="admin-metric">
                    <div class="metric-big" :class="cpuColor">{{ stats.CpuUsagePercentage.toFixed(1) }}%</div>
                    <div class="usage-bar-track"><div class="usage-bar-fill" :class="cpuColor + '-bg'" :style="{ width: Math.min(stats.CpuUsagePercentage, 100) + '%' }"></div></div>
                    <div class="metric-sub">{{ stats.ProcessorCount }} cores</div>
                </div>
            </KMInfoBox>
            <KMInfoBox caption="RAM Usage">
                <div class="admin-metric">
                    <div class="metric-big" :class="ramColor">{{ stats.RamUsedGB.toFixed(1) }} / {{ stats.RamTotalGB.toFixed(1) }} GB</div>
                    <div class="usage-bar-track"><div class="usage-bar-fill" :class="ramColor + '-bg'" :style="{ width: Math.min(stats.RamUsagePercentage, 100) + '%' }"></div></div>
                    <div class="metric-sub">{{ stats.RamUsagePercentage.toFixed(1) }}% utilized</div>
                </div>
            </KMInfoBox>
            <KMInfoBox caption="Active Services">
                <div class="admin-metric">
                    <div class="metric-big clr-success">{{ stats.TotalServicesActive }}/{{ stats.TotalServicesRegistered }}</div>
                    <div class="metric-sub">{{ stats.TotalServicesRegistered - stats.TotalServicesActive }} inactive</div>
                </div>
            </KMInfoBox>
        </KMInfoGrid>

        <!-- System & Process | Logs & Tasks -->
        <KMInfoGrid columns="2" rows="1" rowHeight="260">
            <KMInfoBox caption="System & Process Details">
                <div class="detail-list">
                    <div class="detail-row"><span class="dl">Machine</span><span class="dv">{{ stats.MachineName }}</span></div>
                    <div class="detail-row"><span class="dl">Operating System</span><span class="dv">{{ stats.OSVersion }}</span></div>
                    <div class="detail-row"><span class="dl">Processor</span><span class="dv">{{ stats.ProcessorName }}</span></div>
                    <div class="detail-row"><span class="dl">Process Memory</span><span class="dv">{{ stats.ProcessMemoryMB.toFixed(1) }} MB</span></div>
                    <div class="detail-row"><span class="dl">Process Threads</span><span class="dv">{{ stats.ProcessThreadCount }}</span></div>
                    <div class="detail-row"><span class="dl">GC Heap</span><span class="dv">{{ stats.GCTotalMemoryMB.toFixed(1) }} MB</span></div>
                    <div class="detail-row"><span class="dl">GC Collections</span><span class="dv">Gen0: {{ stats.GCGen0Collections }} · Gen1: {{ stats.GCGen1Collections }} · Gen2: {{ stats.GCGen2Collections }}</span></div>
                </div>
            </KMInfoBox>
            <KMInfoBox caption="Logs, Tasks & Omniscience">
                <div class="detail-list">
                    <div class="detail-row"><span class="dl">Total Logs</span><span class="dv">{{ stats.TotalLogs.toLocaleString() }}</span></div>
                    <div class="detail-row"><span class="dl">Status Logs</span><span class="dv clr-success">{{ stats.TotalStatusLogs.toLocaleString() }}</span></div>
                    <div class="detail-row"><span class="dl">Error Logs</span><span class="dv" :class="stats.TotalErrorLogs > 0 ? 'clr-danger' : 'clr-success'">{{ stats.TotalErrorLogs }}</span></div>
                    <div class="detail-sep"></div>
                    <div class="detail-row"><span class="dl">Scheduled Tasks</span><span class="dv">{{ stats.TotalScheduledTasks }}</span></div>
                    <div class="detail-row" v-if="stats.NextTaskScheduledSummary"><span class="dl">Next Task</span><span class="dv clr-accent">{{ stats.NextTaskScheduledSummary }}</span></div>
                    <div class="detail-sep"></div>
                    <div class="detail-row"><span class="dl">Omni Messages</span><span class="dv">{{ stats.TotalOmniDiscordMessagesLogged.toLocaleString() }}</span></div>
                    <div class="detail-row"><span class="dl">Omni Media</span><span class="dv">{{ (stats.TotalOmniDiscordImagesLogged + stats.TotalOmniDiscordVideosLogged + stats.TotalOmniDiscordFilesLogged).toLocaleString() }} files</span></div>
                </div>
            </KMInfoBox>
        </KMInfoGrid>

        <!-- Uptime Statistics -->
        <KMInfoGrid columns="1" rows="1" rowHeight="260">
            <KMInfoBox caption="System Uptime Statistics">
                <div class="uptime-container" v-if="!uptimeStats.loading && !uptimeStats.error">
                    <div class="uptime-controls">
                        <div class="uptime-range-buttons">
                            <button
                                v-for="option in uptimeRangeOptions"
                                :key="option.value"
                                class="uptime-range-btn"
                                :class="{ active: selectedUptimeRange === option.value }"
                                @click="setUptimeRange(option.value)"
                                :title="option.description"
                            >
                                {{ option.label }}
                            </button>
                        </div>
                        <div class="uptime-window-label">
                            {{ uptimeRangeSummary.windowLabel }}
                        </div>
                    </div>

                    <div class="uptime-stats-row">
                        <div class="u-stat">
                            <span class="u-val clr-success">{{ formatUptimeDuration(uptimeRangeSummary.upMs / 1000) }}</span>
                            <span class="u-lbl">Range Uptime</span>
                        </div>
                        <div class="u-stat">
                            <span class="u-val clr-danger">{{ formatUptimeDuration(uptimeRangeSummary.downMs / 1000) }}</span>
                            <span class="u-lbl">Range Outage</span>
                        </div>
                        <div class="u-stat">
                            <span class="u-val clr-accent">{{ uptimeRangeSummary.availabilityText }}</span>
                            <span class="u-lbl">Availability</span>
                        </div>
                        <div class="u-stat">
                            <span class="u-val">{{ uptimeRangeSummary.visiblePeriods }}</span>
                            <span class="u-lbl">Visible Periods</span>
                        </div>
                    </div>

                    <div class="uptime-chart-wrapper">
                        <div class="uptime-timeline" @mouseleave="clearHoveredUptimeBlock">
                            <div
                                v-for="block in computedUptimeTimeline"
                                :key="block.id"
                                class="uptime-block"
                                :class="block.status"
                                :style="block.style"
                                :title="block.tooltip"
                                @mouseenter="setHoveredUptimeBlock(block)"
                            >
                            </div>
                        </div>
                        <div class="uptime-legend">
                            <span>{{ uptimeRangeSummary.startLabel }}</span>
                            <span class="uptime-availability">Window {{ uptimeRangeSummary.totalLabel }}</span>
                            <span>{{ uptimeRangeSummary.endLabel }}</span>
                        </div>
                    </div>

                    <div class="uptime-hover-panel" v-if="hoveredUptimeBlock">
                        <span class="hover-pill" :class="hoveredUptimeBlock.status === 'up' ? 'hover-pill-up' : 'hover-pill-down'">
                            {{ hoveredUptimeBlock.statusLabel }}
                        </span>
                        <span class="hover-detail">Start: {{ formatDateTime(hoveredUptimeBlock.start) }}</span>
                        <span class="hover-detail">End: {{ formatDateTime(hoveredUptimeBlock.end) }}</span>
                        <span class="hover-detail">Duration: {{ hoveredUptimeBlock.durationText }}</span>
                        <span class="hover-detail">Window Share: {{ hoveredUptimeBlock.percentageText }}</span>
                    </div>
                    <div class="uptime-hover-empty" v-else>
                        Hover a timeline segment for exact start/end, duration, and window share.
                    </div>
                </div>
                <div v-else-if="uptimeStats.loading" class="no-data">Loading uptime statistics...</div>
                <div v-else class="no-data clr-danger">Failed to load uptime statistics</div>
            </KMInfoBox>
        </KMInfoGrid>

        <KMInfoGrid columns="1" rows="1" rowHeight="390">
            <KMInfoBox caption="KliveAPI Statistics">
                <div v-if="!apiStats.loading && !apiStats.error" class="api-stats-container">
                    <div class="api-stats-row">
                        <div class="u-stat">
                            <span class="u-val clr-success">{{ apiStats.lifetime.totalRequests.toLocaleString() }}</span>
                            <span class="u-lbl">Total Requests</span>
                        </div>
                        <div class="u-stat">
                            <span class="u-val clr-accent">{{ apiStats.lifetime.availabilityPct.toFixed(2) }}%</span>
                            <span class="u-lbl">Success Rate</span>
                        </div>
                        <div class="u-stat">
                            <span class="u-val">{{ formatMilliseconds(apiStats.lifetime.avgResponseMs) }}</span>
                            <span class="u-lbl">Avg Response</span>
                        </div>
                        <div class="u-stat">
                            <span class="u-val" :class="apiStats.lifetime.maxResponseMs > 1000 ? 'clr-danger' : apiStats.lifetime.maxResponseMs > 350 ? 'clr-warning' : 'clr-success'">{{ formatMilliseconds(apiStats.lifetime.maxResponseMs) }}</span>
                            <span class="u-lbl">Max Response</span>
                        </div>
                    </div>

                    <div class="api-chart-grid">
                        <div class="api-chart-card">
                            <div class="api-chart-title">Requests Per Day ({{ apiStats.historyWindow.totalDays || apiDailyHistory.length }} days)</div>
                            <svg viewBox="0 0 560 150" class="api-chart-svg" preserveAspectRatio="none">
                                <line v-for="y in [0.25, 0.5, 0.75, 1]" :key="`api-req-grid-${y}`"
                                    :x1="22" :y1="22 + (1 - y) * (150 - 44)"
                                    :x2="538" :y2="22 + (1 - y) * (150 - 44)"
                                    stroke="#2a2a2a" stroke-width="1" />
                                <rect v-for="(day, index) in apiDailyHistory" :key="`api-req-${day.date}`"
                                    :x="getApiChartX(index) - 6"
                                    :y="getApiRequestY(day.requests)"
                                    :width="12"
                                    :height="Math.max(3, 128 - getApiRequestY(day.requests))"
                                    fill="#4d9e39"
                                    rx="2" />
                                <text v-for="label in apiHistoryLabels" :key="`api-req-label-${label.idx}`"
                                    :x="getApiChartX(label.idx)" y="146" fill="#666666" font-size="9" text-anchor="middle">{{ label.label }}</text>
                            </svg>
                        </div>

                        <div class="api-chart-card">
                            <div class="api-chart-title">Daily Response Speed</div>
                            <svg viewBox="0 0 560 150" class="api-chart-svg" preserveAspectRatio="none">
                                <line v-for="y in [0.25, 0.5, 0.75, 1]" :key="`api-lat-grid-${y}`"
                                    :x1="22" :y1="22 + (1 - y) * (150 - 44)"
                                    :x2="538" :y2="22 + (1 - y) * (150 - 44)"
                                    stroke="#2a2a2a" stroke-width="1" />
                                <polyline :points="buildApiLatencyPoints('avgResponseMs')" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linejoin="round" />
                                <polyline :points="buildApiLatencyPoints('maxResponseMs')" fill="none" stroke="#ef4444" stroke-width="2" stroke-linejoin="round" />
                                <circle v-for="(day, index) in apiDailyHistory" :key="`api-avg-${day.date}`" :cx="getApiChartX(index)" :cy="getApiLatencyY(day.avgResponseMs)" r="3" fill="#3b82f6" />
                                <circle v-for="(day, index) in apiDailyHistory" :key="`api-max-${day.date}`" :cx="getApiChartX(index)" :cy="getApiLatencyY(day.maxResponseMs)" r="3" fill="#ef4444" />
                                <text v-for="label in apiHistoryLabels" :key="`api-lat-label-${label.idx}`"
                                    :x="getApiChartX(label.idx)" y="146" fill="#666666" font-size="9" text-anchor="middle">{{ label.label }}</text>
                            </svg>
                            <div class="chart-legend api-legend">
                                <span class="legend-dot" style="background:#3b82f6"></span>Average latency
                                <span class="legend-dot" style="background:#ef4444;margin-left:12px"></span>Peak latency
                            </div>
                        </div>
                    </div>
                </div>
                <div v-else-if="apiStats.loading" class="no-data">Loading KliveAPI statistics...</div>
                <div v-else class="no-data clr-danger">Failed to load KliveAPI statistics</div>
            </KMInfoBox>
        </KMInfoGrid>

        <KMInfoGrid columns="2" rows="1" rowHeight="300">
            <KMInfoBox caption="Busiest API Routes">
                <div class="api-route-list">
                    <div v-for="route in apiStats.topRoutes" :key="`top-${route.method}-${route.route}`" class="api-route-row">
                        <div class="api-route-copy">
                            <span class="api-route-name">{{ route.method }} {{ route.route }}</span>
                            <span class="api-route-meta">{{ route.requests.toLocaleString() }} requests · Avg {{ formatMilliseconds(route.avgResponseMs) }}</span>
                        </div>
                        <span class="api-route-chip">{{ route.successes.toLocaleString() }} ok</span>
                    </div>
                    <div v-if="!apiStats.topRoutes.length" class="no-data">No route history recorded yet</div>
                </div>
            </KMInfoBox>

            <KMInfoBox caption="Slowest API Routes">
                <div class="api-route-list">
                    <div v-for="route in apiStats.slowestRoutes" :key="`slow-${route.method}-${route.route}`" class="api-route-row">
                        <div class="api-route-copy">
                            <span class="api-route-name">{{ route.method }} {{ route.route }}</span>
                            <span class="api-route-meta">Avg {{ formatMilliseconds(route.avgResponseMs) }} · Peak {{ formatMilliseconds(route.maxResponseMs) }}</span>
                        </div>
                        <span class="api-route-chip api-route-chip-danger">{{ route.requests.toLocaleString() }} hits</span>
                    </div>
                    <div v-if="!apiStats.slowestRoutes.length" class="no-data">No slow-route data recorded yet</div>
                </div>
            </KMInfoBox>
        </KMInfoGrid>

        <!-- Disk Statistics -->
        <KMInfoGrid columns="1" rows="1" rowHeight="220">
            <KMInfoBox caption="Disk Statistics">
                <div class="disk-grid">
                    <div class="disk-item" v-for="disk in stats.DiskStatistics" :key="disk.DriveName">
                        <div class="disk-header">
                            <span class="disk-name">{{ disk.DriveName }}{{ disk.VolumeLabel ? ' (' + disk.VolumeLabel + ')' : '' }}</span>
                            <span class="disk-pct" :class="disk.UsagePercentage > 85 ? 'clr-danger' : disk.UsagePercentage > 60 ? 'clr-warning' : 'clr-success'">{{ disk.UsagePercentage.toFixed(1) }}%</span>
                        </div>
                        <div class="usage-bar-track"><div class="usage-bar-fill" :class="disk.UsagePercentage > 85 ? 'clr-danger-bg' : disk.UsagePercentage > 60 ? 'clr-warning-bg' : 'clr-success-bg'" :style="{ width: Math.min(disk.UsagePercentage, 100) + '%' }"></div></div>
                        <div class="disk-detail">{{ disk.UsedSpaceGB.toFixed(1) }} / {{ disk.TotalSizeGB.toFixed(1) }} GB · {{ disk.FreeSpaceGB.toFixed(1) }} GB free · {{ disk.DriveFormat }}</div>
                    </div>
                    <div v-if="stats.DiskStatistics.length === 0" class="no-data">No disk data available</div>
                </div>
            </KMInfoBox>
        </KMInfoGrid>

        <!-- Services & Network -->
        <KMInfoGrid columns="2" rows="1" rowHeight="340">
            <KMInfoBox caption="All Services">
                <div class="services-scroll">
                    <div class="service-row" v-for="svc in stats.Services" :key="svc.Name">
                        <div class="service-info">
                            <span class="svc-dot" :class="svc.IsActive ? 'dot-on' : 'dot-off'"></span>
                            <div class="svc-copy">
                                <span class="svc-name">{{ svc.Name }}</span>
                                <span class="svc-state" :class="svc.IsActive ? 'clr-success' : 'clr-danger'">{{ svc.IsActive ? 'Active' : 'Inactive' }}</span>
                            </div>
                        </div>
                        <div class="service-actions">
                            <span class="svc-uptime">{{ svc.UptimeHumanized }}</span>
                            <button
                                class="service-action-btn restart"
                                :disabled="botUpdating || isServiceActionPending(svc.Name)"
                                @click="manageService(svc, 'restart')"
                            >
                                {{ getServiceActionLabel(svc.Name, 'restart') }}
                            </button>
                            <button
                                class="service-action-btn quit"
                                :disabled="botUpdating || isServiceActionPending(svc.Name)"
                                @click="manageService(svc, 'quit')"
                            >
                                {{ getServiceActionLabel(svc.Name, 'quit') }}
                            </button>
                        </div>
                    </div>
                    <div v-if="stats.Services.length === 0" class="no-data">No service data available</div>
                </div>
            </KMInfoBox>
            <KMInfoBox caption="Network Interfaces">
                <div class="network-scroll">
                    <div class="net-item" v-for="ni in filteredNetwork" :key="ni.Name">
                        <div class="net-top">
                            <span class="net-name">{{ ni.Name }}</span>
                            <span class="net-speed" v-if="ni.SpeedMbps > 0">{{ ni.SpeedMbps.toLocaleString() }} Mbps</span>
                        </div>
                        <div class="net-desc">{{ ni.Description }}</div>
                        <div class="net-traffic">
                            <span class="net-up">↑ {{ formatBytes(ni.BytesSent) }}</span>
                            <span class="net-down">↓ {{ formatBytes(ni.BytesReceived) }}</span>
                        </div>
                    </div>
                    <div v-if="filteredNetwork.length === 0" class="no-data">No active network interfaces</div>
                </div>
            </KMInfoBox>
        </KMInfoGrid>

        <!-- Selenium Instances -->
        <KMInfoGrid columns="1" rows="1" rowHeight="260">
            <KMInfoBox caption="Selenium Instances">
                <div class="selenium-header">
                    <span class="selenium-count" v-if="seleniumInstances.length > 0">{{ seleniumInstances.length }} active instance{{ seleniumInstances.length !== 1 ? 's' : '' }}</span>
                    <span class="selenium-count no-data" v-else>No active instances</span>
                </div>
                <div class="selenium-scroll">
                    <div class="selenium-row" v-for="inst in seleniumInstances" :key="inst.objectID">
                        <span class="svc-dot dot-on"></span>
                        <div class="selenium-info">
                            <span class="selenium-name">{{ inst.name }}</span>
                            <span class="selenium-id">ID: {{ inst.objectID }}</span>
                        </div>
                        <span class="selenium-time">{{ humanizeSeleniumTime(inst.createdAt) }}</span>
                    </div>
                    <div v-if="seleniumInstances.length === 0" class="no-data">No Selenium browser instances are currently running</div>
                </div>
            </KMInfoBox>
        </KMInfoGrid>

        <!-- Management -->
        <KMInfoGrid columns="2" rows="1" rowHeight="520">
            <KMInfoBox caption="Bot Utilities">
                <div class="utility-panel">
                    <p class="utility-intro">Open the main operator tools, inspect runtime activity, and push configuration or deployment changes from one control surface.</p>

                    <div class="utility-grid">
                        <NuxtLink to="/administration/botlogs" class="utility-card">
                            <span class="utility-label">Diagnostics</span>
                            <h3>Bot Logs</h3>
                            <p>Inspect runtime output, failures, and service chatter without leaving Admin.</p>
                            <KMButton message="OPEN BOT LOGS" style="height: 72px; width: 100%; margin-top: 18px;" />
                        </NuxtLink>

                        <NuxtLink to="/klivelink" class="utility-card">
                            <span class="utility-label">Remote Control</span>
                            <h3>KliveLink</h3>
                            <p>Jump into remote administration tools and connected machine capabilities.</p>
                            <KMButton message="OPEN KLIVELINK" style="height: 72px; width: 100%; margin-top: 18px;" />
                        </NuxtLink>

                        <NuxtLink to="/administration/omnisettings" class="utility-card">
                            <span class="utility-label">Configuration</span>
                            <h3>OmniSettings</h3>
                            <p>Audit service configuration, secrets, and provider routing from the settings dashboard.</p>
                            <KMButton message="OPEN OMNISETTINGS" style="height: 72px; width: 100%; margin-top: 18px;" />
                        </NuxtLink>

                        <div class="utility-card utility-card-danger update-bot-area">
                            <span class="utility-label">Deployment</span>
                            <h3>Update Bot</h3>
                            <p>Pull latest code, rebuild, and restart the stack. This temporarily interrupts the API.</p>
                            <KMButton
                                :message="botUpdating ? 'UPDATING...' : 'RUN UPDATE'"
                                :textColor="botUpdating ? '#969696' : '#ef4444'"
                                style="height: 72px; width: 100%; margin-top: 18px;"
                                :onclick="updateBot"
                            />
                            <div v-if="botUpdating" class="update-status">
                                <div class="update-spinner"></div>
                                <span>Bot is updating and restarting. The API will be temporarily unavailable...</span>
                            </div>
                        </div>
                    </div>
                </div>
            </KMInfoBox>
            <KMInfoBox caption="Manage Profiles">
                <div class="profiles-panel">
                    <div class="profiles-panel-header">
                        <div>
                            <span class="utility-label">Access Control</span>
                            <h3>Profile Directory</h3>
                            <p>Review clearance, login eligibility, and create new operator accounts from a cleaner profile desk.</p>
                        </div>
                        <KMButton style="height: 72px; width: 240px;" message="CREATE NEW PROFILE" :onclick="goToCreateProfile" />
                    </div>

                    <div class="profiles-list-shell">
                        <AdminKMProfileList style="height: 350px;" />
                    </div>
                </div>
            </KMInfoBox>
        </KMInfoGrid>

        <!-- Terminal CLI -->
        <KMInfoGrid columns="1" rows="1" rowHeight="550">
            <div style="height: 100%; width: 100%;">
                <TerminalUI />
            </div>
        </KMInfoGrid>
    </div>
</template>

<script setup>
definePageMeta({ layout: 'navbar' });
</script>

<script>
import KMInfoGrid from '~/components/KMInfoGrid.vue';
import KMInfoBox from '~/components/KMInfoBox.vue';
import KMButton from '~/components/KMButton.vue';
import TerminalUI from '~/components/Admin/TerminalUI.vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import Swal from 'sweetalert2';

export default {
    components: { KMInfoGrid, KMInfoBox, KMButton, TerminalUI },
    data() {
        return {
            statsLoading: false,
            statsError: false,
            uptimeStats: {
                TotalUptimeSeconds: 0,
                AverageUptimeHours: 0,
                CurrentUptimeSeconds: 0,
                TotalOutageSeconds: 0,
                TotalPeriods: 0,
                Periods: [],
                loading: true,
                error: false
            },
            apiStats: {
                lifetime: {
                    totalRequests: 0,
                    successfulRequests: 0,
                    clientErrorRequests: 0,
                    serverErrorRequests: 0,
                    notFoundRequests: 0,
                    unauthorizedRequests: 0,
                    avgResponseMs: 0,
                    maxResponseMs: 0,
                    availabilityPct: 100,
                    lastRequestAt: null
                },
                historyWindow: {
                    firstDay: null,
                    lastDay: null,
                    totalDays: 0
                },
                dailyHistory: [],
                topRoutes: [],
                slowestRoutes: [],
                loading: true,
                error: false
            },
            uptimeRangeOptions: [
                { label: '1D', value: '1d', ms: 24 * 60 * 60 * 1000, description: 'Last 24 hours' },
                { label: '3D', value: '3d', ms: 3 * 24 * 60 * 60 * 1000, description: 'Last 3 days' },
                { label: '7D', value: '7d', ms: 7 * 24 * 60 * 60 * 1000, description: 'Last 7 days' },
                { label: '30D', value: '30d', ms: 30 * 24 * 60 * 60 * 1000, description: 'Last 30 days' },
                { label: 'ALL', value: 'all', ms: null, description: 'All time history' }
            ],
            selectedUptimeRange: '7d',
            hoveredUptimeBlock: null,
            botUpdating: false,
            serviceActionState: {},
            refreshInterval: null,
            seleniumInstances: [],
            stats: {
                TimeStatisticsGenerated: '',
                lastOmnipotentUpdate: '',
                lastOmnipotentUpdateHumanized: 'N/A',
                BotUptime: '',
                BotUptimeHumanized: 'N/A',
                TotalStatusLogs: 0,
                TotalErrorLogs: 0,
                TotalLogs: 0,
                RamTotalGB: 0,
                RamUsedGB: 0,
                RamUsagePercentage: 0,
                CpuUsagePercentage: 0,
                OSVersion: 'N/A',
                MachineName: 'N/A',
                ProcessorCount: 0,
                ProcessorName: 'N/A',
                ProcessMemoryMB: 0,
                ProcessThreadCount: 0,
                GCTotalMemoryMB: 0,
                GCGen0Collections: 0,
                GCGen1Collections: 0,
                GCGen2Collections: 0,
                DiskStatistics: [],
                NetworkInterfaces: [],
                TotalServicesRegistered: 0,
                TotalServicesActive: 0,
                Services: [],
                TotalOmniDiscordMessagesLogged: 0,
                TotalOmniDiscordImagesLogged: 0,
                TotalOmniDiscordVideosLogged: 0,
                TotalOmniDiscordFilesLogged: 0,
                OmniDiscordMessagesLoggedToday: 0,
                TotalScheduledTasks: 0,
                NextTaskScheduledSummary: ''
            }
        };
    },
    computed: {
        cpuColor() {
            if (this.stats.CpuUsagePercentage > 85) return 'clr-danger';
            if (this.stats.CpuUsagePercentage > 60) return 'clr-warning';
            return 'clr-success';
        },
        ramColor() {
            if (this.stats.RamUsagePercentage > 85) return 'clr-danger';
            if (this.stats.RamUsagePercentage > 60) return 'clr-warning';
            return 'clr-success';
        },
        apiDailyHistory() {
            return Array.isArray(this.apiStats.dailyHistory) ? this.apiStats.dailyHistory : [];
        },
        apiHistoryLabels() {
            const days = this.apiDailyHistory;
            if (!days.length) return [];
            const step = Math.max(1, Math.floor(days.length / 6));
            return days
                .map((day, index) => ({ idx: index, label: day.date?.slice(5) || '' }))
                .filter((_, index) => index % step === 0 || index === days.length - 1);
        },
        apiMaxDailyRequests() {
            if (!this.apiDailyHistory.length) return 1;
            return Math.max(1, ...this.apiDailyHistory.map(day => day.requests || 0));
        },
        apiMaxLatencyMs() {
            if (!this.apiDailyHistory.length) return 1;
            return Math.max(1, ...this.apiDailyHistory.map(day => Math.max(day.avgResponseMs || 0, day.maxResponseMs || 0)));
        },
        filteredNetwork() {
            if (!this.stats.NetworkInterfaces) return [];
            return this.stats.NetworkInterfaces.filter(ni => {
                const hasTraffic = ni.BytesSent > 0 || ni.BytesReceived > 0;
                const isFilter = ni.Name.includes('Filter') || ni.Name.includes('QoS') || ni.Name.includes('WFP');
                return hasTraffic && !isFilter;
            });
        },
        computedUptimeTimeline() {
            if (!Array.isArray(this.uptimeStats.Periods) || this.uptimeStats.Periods.length === 0) return [];

            const now = Date.now();
            const normalizedPeriods = this.uptimeStats.Periods
                .map((period, index) => {
                    const start = new Date(period.StartTime).getTime();
                    if (!Number.isFinite(start)) {
                        return null;
                    }

                    let end = new Date(period.LastKnownUpTime).getTime();
                    if (!Number.isFinite(end) || end < start) {
                        end = index === this.uptimeStats.Periods.length - 1 ? now : start;
                    }

                    return {
                        start,
                        end: Math.max(end, start)
                    };
                })
                .filter(Boolean)
                .sort((a, b) => a.start - b.start);

            if (normalizedPeriods.length === 0) return [];

            const firstPeriodStart = normalizedPeriods[0].start;
            const selectedRange = this.uptimeRangeOptions.find(option => option.value === this.selectedUptimeRange);
            const requestedWindowStart = selectedRange && selectedRange.ms ? now - selectedRange.ms : firstPeriodStart;
            const windowStart = Math.max(firstPeriodStart, requestedWindowStart);
            const windowEnd = now;
            const windowDuration = Math.max(windowEnd - windowStart, 1);

            const clippedUpPeriods = normalizedPeriods
                .map(period => ({
                    start: Math.max(period.start, windowStart),
                    end: Math.min(period.end, windowEnd)
                }))
                .filter(period => period.end > period.start);

            const timelineBlocks = [];
            let cursor = windowStart;

            for (const period of clippedUpPeriods) {
                if (period.start > cursor) {
                    timelineBlocks.push({
                        status: 'down',
                        start: cursor,
                        end: period.start
                    });
                }

                timelineBlocks.push({
                    status: 'up',
                    start: period.start,
                    end: period.end
                });

                cursor = Math.max(cursor, period.end);
            }

            if (cursor < windowEnd) {
                timelineBlocks.push({
                    status: 'down',
                    start: cursor,
                    end: windowEnd
                });
            }

            return timelineBlocks
                .map((block, index) => {
                    const durationMs = block.end - block.start;
                    if (durationMs <= 0) {
                        return null;
                    }

                    const statusLabel = block.status === 'up' ? 'Online' : 'Outage';
                    const percentageOfWindow = (durationMs / windowDuration) * 100;
                    const durationText = this.formatUptimeDuration(durationMs / 1000);

                    return {
                        id: `${block.status}-${index}-${block.start}`,
                        status: block.status,
                        statusLabel,
                        start: block.start,
                        end: block.end,
                        durationMs,
                        durationText,
                        percentageText: percentageOfWindow.toFixed(2) + '%',
                        style: {
                            flexGrow: Math.max(Math.round(durationMs / 1000), 1),
                            flexBasis: '0'
                        },
                        tooltip: `${statusLabel}\nStart: ${this.formatDateTime(block.start)}\nEnd: ${this.formatDateTime(block.end)}\nDuration: ${durationText}\nWindow Share: ${percentageOfWindow.toFixed(2)}%`
                    };
                })
                .filter(Boolean);
        },
        uptimeRangeSummary() {
            const blocks = this.computedUptimeTimeline;
            if (blocks.length === 0) {
                return {
                    upMs: 0,
                    downMs: 0,
                    totalMs: 0,
                    availabilityText: '0.00%',
                    visiblePeriods: 0,
                    startLabel: 'No data',
                    endLabel: 'No data',
                    totalLabel: '0s',
                    windowLabel: 'No uptime history available'
                };
            }

            const upMs = blocks
                .filter(block => block.status === 'up')
                .reduce((sum, block) => sum + block.durationMs, 0);
            const downMs = blocks
                .filter(block => block.status === 'down')
                .reduce((sum, block) => sum + block.durationMs, 0);
            const totalMs = upMs + downMs;
            const availabilityPct = totalMs > 0 ? (upMs / totalMs) * 100 : 0;
            const selectedRange = this.uptimeRangeOptions.find(option => option.value === this.selectedUptimeRange);

            return {
                upMs,
                downMs,
                totalMs,
                availabilityText: availabilityPct.toFixed(2) + '%',
                visiblePeriods: blocks.filter(block => block.status === 'up').length,
                startLabel: this.formatTimelineTick(blocks[0].start),
                endLabel: this.formatTimelineTick(blocks[blocks.length - 1].end),
                totalLabel: this.formatUptimeDuration(totalMs / 1000),
                windowLabel: (selectedRange ? selectedRange.description : 'Custom range') + ' view'
            };
        }
    },
    methods: {
        isServiceActionPending(serviceName) {
            return Boolean(this.serviceActionState[serviceName]);
        },
        getServiceActionLabel(serviceName, action) {
            const pendingAction = this.serviceActionState[serviceName];
            if (pendingAction === action) {
                return action === 'restart' ? 'RESTARTING...' : 'QUITTING...';
            }

            return action === 'restart' ? 'RESTART' : 'QUIT';
        },
        setUptimeRange(rangeValue) {
            if (this.selectedUptimeRange === rangeValue) return;
            this.selectedUptimeRange = rangeValue;
            this.hoveredUptimeBlock = null;
        },
        setHoveredUptimeBlock(block) {
            this.hoveredUptimeBlock = block;
        },
        clearHoveredUptimeBlock() {
            this.hoveredUptimeBlock = null;
        },
        getApiChartX(index) {
            const totalDays = this.apiDailyHistory.length;
            if (totalDays <= 1) return 22;
            return 22 + index * ((560 - 44) / (totalDays - 1));
        },
        getApiRequestY(value) {
            const ratio = Math.min(1, (value || 0) / this.apiMaxDailyRequests);
            return 22 + (1 - ratio) * (150 - 44);
        },
        getApiLatencyY(value) {
            const ratio = Math.min(1, (value || 0) / this.apiMaxLatencyMs);
            return 22 + (1 - ratio) * (150 - 44);
        },
        buildApiLatencyPoints(metricKey) {
            return this.apiDailyHistory
                .map((day, index) => `${this.getApiChartX(index)},${this.getApiLatencyY(day[metricKey] || 0)}`)
                .join(' ');
        },
        formatDateTime(value) {
            if (value === undefined || value === null) return 'N/A';
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return 'N/A';
            return date.toLocaleString();
        },
        formatTimelineTick(value) {
            if (value === undefined || value === null) return 'N/A';
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return 'N/A';
            return date.toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        },
        async loadStats() {
            this.statsLoading = true;
            this.statsError = false;
            try {
                const response = await RequestGETFromKliveAPI('/GeneralBotStatistics/GetFrontpageStats', false, false);
                if (response.ok) {
                    const data = await response.json();
                    this.stats = { ...this.stats, ...data };
                } else {
                    this.statsError = true;
                }
            } catch (e) {
                console.error('Failed to load admin stats:', e);
                this.statsError = true;
            } finally {
                this.statsLoading = false;
            }
        },
        async loadUptimeStats() {
            this.uptimeStats.loading = true;
            this.uptimeStats.error = false;
            try {
                const response = await RequestGETFromKliveAPI('/System/UptimeStatistics', false, false);
                if (response.ok) {
                    const data = await response.json();
                    this.uptimeStats = { ...this.uptimeStats, ...data, loading: false };
                } else {
                    this.uptimeStats.error = true;
                    this.uptimeStats.loading = false;
                }
            } catch (e) {
                console.error('Failed to load uptime stats:', e);
                this.uptimeStats.error = true;
                this.uptimeStats.loading = false;
            }
        },
        async loadApiStats() {
            this.apiStats.loading = true;
            this.apiStats.error = false;
            try {
                const response = await RequestGETFromKliveAPI('/KliveAPI/Statistics', false, false);
                if (response.ok) {
                    const data = await response.json();
                    this.apiStats = { ...this.apiStats, ...data, loading: false, error: false };
                } else {
                    this.apiStats.error = true;
                    this.apiStats.loading = false;
                }
            } catch (e) {
                console.error('Failed to load KliveAPI stats:', e);
                this.apiStats.error = true;
                this.apiStats.loading = false;
            }
        },
        async loadSeleniumInstances() {
            try {
                const response = await RequestGETFromKliveAPI('/seleniumManager/getAllSeleniumInstances', false, false);
                if (response.ok) {
                    this.seleniumInstances = await response.json();
                }
            } catch (e) {
                console.error('Failed to load Selenium instances:', e);
            }
        },
        humanizeSeleniumTime(dateStr) {
            if (!dateStr) return '';
            const created = new Date(dateStr);
            const now = new Date();
            const diffMs = now - created;
            const diffSec = Math.floor(diffMs / 1000);
            if (diffSec < 60) return diffSec + 's ago';
            const diffMin = Math.floor(diffSec / 60);
            if (diffMin < 60) return diffMin + 'm ago';
            const diffHr = Math.floor(diffMin / 60);
            if (diffHr < 24) return diffHr + 'h ' + (diffMin % 60) + 'm ago';
            return Math.floor(diffHr / 24) + 'd ' + (diffHr % 24) + 'h ago';
        },
        async manageService(service, action) {
            const serviceName = service?.Name;
            if (!serviceName || this.isServiceActionPending(serviceName) || this.botUpdating) return;

            const isRestart = action === 'restart';
            const apiWarning = serviceName.toLowerCase() === 'kliveapi'
                ? '<br><br><b>Note:</b> Managing KliveAPI will temporarily interrupt this page connection.'
                : '';

            const result = await Swal.fire({
                icon: 'warning',
                title: isRestart ? 'Restart Service?' : 'Quit Service?',
                html: isRestart
                    ? `This will restart <b>${serviceName}</b>.<br><br>Short interruptions are expected while it comes back online.${apiWarning}`
                    : `This will stop <b>${serviceName}</b> until it is restarted again.<br><br>This only affects the selected service.${apiWarning}`,
                showCancelButton: true,
                confirmButtonText: isRestart ? 'Restart Service' : 'Quit Service',
                cancelButtonText: 'Cancel',
                confirmButtonColor: isRestart ? '#4d9e39' : '#ef4444',
                cancelButtonColor: '#5f5f5f',
                background: '#161516',
                color: '#ffffff',
                customClass: { popup: 'swal-dark-theme' }
            });

            if (!result.isConfirmed) return;

            this.serviceActionState = { ...this.serviceActionState, [serviceName]: action };

            try {
                const response = await RequestPOSTFromKliveAPI(
                    isRestart ? '/GeneralBotStatistics/RestartService' : '/GeneralBotStatistics/QuitService',
                    JSON.stringify({ serviceName }),
                    false,
                    true
                );

                let payload = null;
                try {
                    payload = await response.json();
                } catch {
                    payload = null;
                }

                if (!response.ok || !payload?.Success) {
                    throw new Error(payload?.Message || payload?.Error || `Request failed with HTTP ${response.status}`);
                }

                await Swal.fire({
                    icon: 'success',
                    title: isRestart ? 'Restart Scheduled' : 'Quit Scheduled',
                    text: payload.Message || `${serviceName} ${isRestart ? 'restart' : 'shutdown'} requested.`,
                    confirmButtonColor: '#4d9e39',
                    background: '#161516',
                    color: '#ffffff',
                    customClass: { popup: 'swal-dark-theme' }
                });

                if (serviceName.toLowerCase() !== 'kliveapi') {
                    await new Promise(resolve => setTimeout(resolve, 900));
                    await this.loadStats();
                }
            } catch (error) {
                console.error(`Failed to ${action} service:`, error);
                await Swal.fire({
                    icon: 'error',
                    title: isRestart ? 'Restart Failed' : 'Quit Failed',
                    text: error?.message || `Unable to ${action} ${serviceName}.`,
                    confirmButtonColor: '#4d9e39',
                    background: '#161516',
                    color: '#ffffff',
                    customClass: { popup: 'swal-dark-theme' }
                });
            } finally {
                const nextState = { ...this.serviceActionState };
                delete nextState[serviceName];
                this.serviceActionState = nextState;
            }
        },
        goToCreateProfile() {
            window.location.replace('/createprofile');
        },
        async updateBot() {
            if (this.botUpdating) return;

            const result = await Swal.fire({
                icon: 'warning',
                title: 'Update Bot?',
                html: 'This will <b>pull the latest code, rebuild, and restart</b> the bot process.<br><br>The API will go offline temporarily and all services will restart.',
                showCancelButton: true,
                confirmButtonText: 'Update Now',
                cancelButtonText: 'Cancel',
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#4d9e39',
                background: '#161516',
                color: '#ffffff',
                customClass: { popup: 'swal-dark-theme' }
            });

            if (!result.isConfirmed) return;

            this.botUpdating = true;
            // Stop auto-refresh since the API will go down
            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
                this.refreshInterval = null;
            }

            try {
                const response = await RequestPOSTFromKliveAPI('/GeneralBotStatistics/UpdateBot', null, false);
                // If we get a response at all, the request was accepted before shutdown
                if (response.ok) {
                    Swal.fire({
                        icon: 'success',
                        title: 'Update Initiated',
                        text: 'The bot is updating. Waiting for it to come back online...',
                        confirmButtonColor: '#4d9e39',
                        background: '#161516',
                        color: '#ffffff',
                        customClass: { popup: 'swal-dark-theme' },
                        allowOutsideClick: false,
                        didOpen: () => { Swal.showLoading(); }
                    });
                    this.waitForBotRestart();
                } else {
                    this.botUpdating = false;
                    this.restartAutoRefresh();
                    Swal.fire({
                        icon: 'error',
                        title: 'Update Failed',
                        text: 'The server rejected the update request (HTTP ' + response.status + ').',
                        confirmButtonColor: '#4d9e39',
                        background: '#161516',
                        color: '#ffffff',
                        customClass: { popup: 'swal-dark-theme' }
                    });
                }
            } catch (error) {
                // A network error likely means the API shut down mid-request — this is expected
                console.log('Update request error (expected if API shut down):', error);
                Swal.fire({
                    icon: 'info',
                    title: 'Bot Shutting Down',
                    text: 'The API went offline — the update is in progress. Waiting for restart...',
                    confirmButtonColor: '#4d9e39',
                    background: '#161516',
                    color: '#ffffff',
                    customClass: { popup: 'swal-dark-theme' },
                    allowOutsideClick: false,
                    didOpen: () => { Swal.showLoading(); }
                });
                this.waitForBotRestart();
            }
        },
        async waitForBotRestart(attempts = 0) {
            const maxAttempts = 60; // ~5 minutes at 5s intervals
            const delay = 5000;

            if (attempts >= maxAttempts) {
                this.botUpdating = false;
                Swal.fire({
                    icon: 'error',
                    title: 'Restart Timeout',
                    text: 'The bot did not come back online within 5 minutes. Check the server manually.',
                    confirmButtonColor: '#4d9e39',
                    background: '#161516',
                    color: '#ffffff',
                    customClass: { popup: 'swal-dark-theme' }
                });
                this.restartAutoRefresh();
                return;
            }

            await new Promise(r => setTimeout(r, delay));

            try {
                // Ping the stats endpoint to check if the API is back
                const res = await RequestGETFromKliveAPI('/GeneralBotStatistics/GetFrontpageStats', false, false);
                if (res.ok) {
                    this.botUpdating = false;
                    Swal.fire({
                        icon: 'success',
                        title: 'Bot Updated Successfully',
                        text: 'The bot is back online and all services are running.',
                        confirmButtonColor: '#4d9e39',
                        background: '#161516',
                        color: '#ffffff',
                        customClass: { popup: 'swal-dark-theme' }
                    });
                    this.loadStats();
                    this.restartAutoRefresh();
                    return;
                }
            } catch (e) {
                // Still down, keep waiting
            }

            this.waitForBotRestart(attempts + 1);
        },
        restartAutoRefresh() {
            if (!this.refreshInterval) {
                this.refreshInterval = setInterval(() => { this.loadStats(); this.loadSeleniumInstances(); this.loadUptimeStats(); this.loadApiStats(); }, 10000);
            }
        },
        formatBytes(bytes) {
            if (!bytes || bytes === 0) return '0 B';
            const units = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(1024));
            return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
        },
        formatUptimeDuration(seconds) {
            if (seconds === undefined || seconds === null) return '0s';
            const d = Math.floor(seconds / 86400);
            const h = Math.floor((seconds % 86400) / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            if (d > 0) return `${d}d ${h}h`;
            if (h > 0) return `${h}h ${m}m`;
            if (m > 0) return `${m}m`;
            return `${Math.floor(seconds)}s`;
        },
        formatMilliseconds(value) {
            if (value === undefined || value === null) return '0 ms';
            const ms = Number(value);
            if (!Number.isFinite(ms)) return '0 ms';
            if (ms >= 1000) return (ms / 1000).toFixed(2) + ' s';
            if (ms >= 100) return ms.toFixed(0) + ' ms';
            if (ms >= 10) return ms.toFixed(1) + ' ms';
            return ms.toFixed(2) + ' ms';
        }
    },
    mounted() {
        this.loadStats();
        this.loadSeleniumInstances();
        this.loadUptimeStats();
        this.loadApiStats();
        this.refreshInterval = setInterval(() => { this.loadStats(); this.loadSeleniumInstances(); this.loadUptimeStats(); this.loadApiStats(); }, 10000);
    },
    beforeUnmount() {
        if (this.refreshInterval) clearInterval(this.refreshInterval);
    }
};
</script>

<style scoped>
.admin-container {
    padding: 20px 0;
    background-color: #201f20;
    min-height: 100vh;
}

.admin-header {
    text-align: center;
    margin-bottom: 30px;
    padding: 0 20px;
}

.admin-title {
    font-size: 2.5rem;
    font-weight: bold;
    margin: 0 0 10px 0;
    background: linear-gradient(135deg, #4d9e39, #62ce47);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.admin-subtitle {
    color: #969696;
    font-size: 1.1rem;
    margin: 0 0 15px 0;
}

.admin-badge {
    color: #4d9e39;
    font-size: 0.95rem;
    font-weight: 500;
    padding: 8px 16px;
    background: rgba(77, 158, 57, 0.1);
    border-radius: 20px;
    display: inline-block;
    border: 1px solid rgba(77, 158, 57, 0.2);
}

.retry-link {
    color: #ef4444;
    cursor: pointer;
    text-decoration: underline;
}

/* Metric Cards */
.admin-metric {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 100%;
    padding: 0 10px;
}

.metric-big {
    font-size: 1.5rem;
    font-weight: 700;
    color: #ffffff;
    text-align: center;
}

.metric-sub {
    font-size: 0.75rem;
    color: #969696;
    text-align: center;
}

/* Usage Bars */
.usage-bar-track {
    width: 100%;
    height: 6px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    overflow: hidden;
}

.usage-bar-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.5s ease;
}

/* Detail Lists */
.detail-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 0 5px;
}

.detail-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 4px 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.02);
}

.detail-row:hover {
    background: rgba(77, 158, 57, 0.06);
}

.dl {
    color: #969696;
    font-size: 0.82rem;
    flex-shrink: 0;
    margin-right: 12px;
}

.dv {
    color: #ffffff;
    font-size: 0.82rem;
    text-align: right;
    word-break: break-word;
}

.detail-sep {
    height: 1px;
    background: rgba(77, 158, 57, 0.15);
    margin: 2px 0;
}

/* Uptime Statistics */
.uptime-container {
    display: flex;
    flex-direction: column;
    gap: 10px;
    height: 100%;
    min-height: 0;
    padding: 0 4px;
}

.uptime-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
}

.uptime-range-buttons {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
}

.uptime-range-btn {
    border: 1px solid rgba(77, 158, 57, 0.25);
    background: rgba(255, 255, 255, 0.03);
    color: #b5b5b5;
    font-size: 0.72rem;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 999px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.uptime-range-btn:hover {
    border-color: rgba(77, 158, 57, 0.55);
    color: #ffffff;
}

.uptime-range-btn.active {
    background: rgba(77, 158, 57, 0.2);
    border-color: rgba(77, 158, 57, 0.75);
    color: #d7ffd0;
    box-shadow: 0 0 10px rgba(77, 158, 57, 0.25);
}

.uptime-window-label {
    color: #969696;
    font-size: 0.74rem;
    text-align: right;
}

.uptime-stats-row {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
}

.u-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 6px 4px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(77, 158, 57, 0.1);
}

.u-val {
    font-size: 1rem;
    font-weight: 700;
    margin-bottom: 2px;
    line-height: 1.2;
    text-align: center;
}

.u-lbl {
    font-size: 0.68rem;
    color: #969696;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    text-align: center;
}

.uptime-chart-wrapper {
    width: 100%;
    min-width: 0;
}

.uptime-timeline {
    display: flex;
    align-items: stretch;
    height: 18px;
    background: rgba(0, 0, 0, 0.25);
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: 6px;
    border: 1px solid rgba(255, 255, 255, 0.06);
}

.uptime-block {
    height: 100%;
    cursor: crosshair;
    transition: filter 0.15s ease;
    min-width: 1px;
}

.uptime-block:hover {
    filter: brightness(1.15);
}

.uptime-block.up {
    background-color: rgba(77, 158, 57, 0.9);
}

.uptime-block.down {
    background-color: rgba(239, 68, 68, 0.85);
}

.uptime-legend {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 8px;
    font-size: 0.72rem;
    color: #777777;
}

.uptime-legend span:last-child {
    text-align: right;
}

.uptime-availability {
    color: #4d9e39;
    font-weight: 600;
}

.uptime-hover-panel,
.uptime-hover-empty {
    min-height: 30px;
    border-radius: 8px;
    border: 1px solid rgba(77, 158, 57, 0.18);
    background: rgba(77, 158, 57, 0.06);
    padding: 6px 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}

.uptime-hover-empty {
    color: #8a8a8a;
    font-size: 0.75rem;
    font-style: italic;
}

.hover-pill {
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.hover-pill-up {
    color: #22c55e;
    background: rgba(34, 197, 94, 0.15);
    border: 1px solid rgba(34, 197, 94, 0.3);
}

.hover-pill-down {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.3);
}

.hover-detail {
    color: #d5d5d5;
    font-size: 0.74rem;
}

/* KliveAPI Statistics */
.api-stats-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
    min-height: 0;
}

.api-stats-row {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
}

.api-chart-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    min-height: 0;
}

.api-chart-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(77, 158, 57, 0.12);
    min-width: 0;
}

.api-chart-title {
    color: #f2f2f2;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.25px;
}

.api-chart-svg {
    width: 100%;
    height: 170px;
    overflow: visible;
}

.api-legend {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    color: #a3a3a3;
    font-size: 0.72rem;
}

.api-route-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    height: 100%;
    overflow-y: auto;
    padding: 2px 4px;
}

.api-route-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(255, 255, 255, 0.06);
}

.api-route-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}

.api-route-name {
    color: #ffffff;
    font-size: 0.8rem;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.api-route-meta {
    color: #9f9f9f;
    font-size: 0.72rem;
}

.api-route-chip {
    border-radius: 999px;
    padding: 4px 10px;
    background: rgba(77, 158, 57, 0.12);
    border: 1px solid rgba(77, 158, 57, 0.35);
    color: #d7ffd0;
    font-size: 0.68rem;
    font-weight: 700;
    white-space: nowrap;
}

.api-route-chip-danger {
    background: rgba(239, 68, 68, 0.12);
    border-color: rgba(239, 68, 68, 0.35);
    color: #ffc7c7;
}

/* Disk Statistics */
.disk-grid {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 0 5px;
}

.disk-item {
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.disk-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.disk-name {
    color: #ffffff;
    font-size: 0.85rem;
    font-weight: 600;
}

.disk-pct {
    font-size: 0.85rem;
    font-weight: 700;
}

.disk-detail {
    color: #969696;
    font-size: 0.75rem;
}

/* Services */
.services-scroll {
    overflow-y: auto;
    max-height: 280px;
    padding: 0 5px;
}

.service-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    padding: 6px 8px;
    border-radius: 4px;
}

.service-row:hover {
    background: rgba(77, 158, 57, 0.06);
}

.service-info {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: 1 1 180px;
}

.svc-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
}

.dot-on {
    background: #22c55e;
    box-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
}

.dot-off {
    background: #ef4444;
    box-shadow: 0 0 6px rgba(239, 68, 68, 0.5);
}

.svc-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.svc-name {
    color: #ffffff;
    font-size: 0.82rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.svc-state {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.3px;
    text-transform: uppercase;
}

.service-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.svc-uptime {
    color: #969696;
    font-size: 0.75rem;
    white-space: nowrap;
}

.service-action-btn {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.03);
    border-radius: 999px;
    padding: 5px 10px;
    font-size: 0.68rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
}

.service-action-btn.restart {
    border-color: rgba(77, 158, 57, 0.4);
    color: #d7ffd0;
}

.service-action-btn.restart:hover:not(:disabled) {
    background: rgba(77, 158, 57, 0.18);
    border-color: rgba(77, 158, 57, 0.7);
}

.service-action-btn.quit {
    border-color: rgba(239, 68, 68, 0.4);
    color: #ffc7c7;
}

.service-action-btn.quit:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.14);
    border-color: rgba(239, 68, 68, 0.7);
}

.service-action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

/* Network */
.network-scroll {
    overflow-y: auto;
    max-height: 280px;
    padding: 0 5px;
}

.net-item {
    padding: 8px;
    border-radius: 6px;
    border: 1px solid rgba(77, 158, 57, 0.15);
    margin-bottom: 8px;
}

.net-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2px;
}

.net-name {
    color: #ffffff;
    font-size: 0.85rem;
    font-weight: 600;
}

.net-speed {
    color: #4d9e39;
    font-size: 0.75rem;
}

.net-desc {
    color: #969696;
    font-size: 0.72rem;
    margin-bottom: 4px;
}

.net-traffic {
    display: flex;
    gap: 16px;
    font-size: 0.78rem;
}

.net-up {
    color: #fbbf24;
}

.net-down {
    color: #22c55e;
}

.no-data {
    color: #969696;
    font-style: italic;
    text-align: center;
    padding: 20px;
    font-size: 0.85rem;
}

/* Color utilities */
.clr-success { color: #22c55e !important; }
.clr-warning { color: #fbbf24 !important; }
.clr-danger { color: #ef4444 !important; }
.clr-accent { color: #4d9e39 !important; }

.clr-success-bg { background-color: #22c55e; }
.clr-warning-bg { background-color: #fbbf24; }
.clr-danger-bg { background-color: #ef4444; }

/* Selenium Instances */
.selenium-header {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 8px;
    padding: 0 5px;
}

.selenium-count {
    font-size: 0.8rem;
    color: #4d9e39;
    font-weight: 600;
}

.selenium-scroll {
    overflow-y: auto;
    max-height: 190px;
    padding: 0 5px;
}

.selenium-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 6px;
    border: 1px solid rgba(77, 158, 57, 0.12);
    margin-bottom: 6px;
    transition: background 0.15s ease;
}

.selenium-row:hover {
    background: rgba(77, 158, 57, 0.06);
}

.selenium-info {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
}

.selenium-name {
    color: #ffffff;
    font-size: 0.85rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.selenium-id {
    color: #969696;
    font-size: 0.7rem;
    font-family: monospace;
}

.selenium-time {
    color: #969696;
    font-size: 0.78rem;
    white-space: nowrap;
    flex-shrink: 0;
}

.selenium-scroll::-webkit-scrollbar {
    width: 4px;
}

.selenium-scroll::-webkit-scrollbar-track {
    background: rgba(77, 158, 57, 0.1);
    border-radius: 2px;
}

.selenium-scroll::-webkit-scrollbar-thumb {
    background: rgba(77, 158, 57, 0.3);
    border-radius: 2px;
}

/* Management */
.utility-panel,
.profiles-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: 100%;
}

.utility-intro,
.profiles-panel-header p {
    margin: 0;
    color: #9a9a9a;
    font-size: 0.84rem;
    line-height: 1.6;
}

.utility-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    min-height: 0;
}

.utility-card {
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 18px;
    border-radius: 18px;
    border: 1px solid rgba(77, 158, 57, 0.14);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.015));
    text-decoration: none;
    color: inherit;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.utility-card h3,
.profiles-panel-header h3 {
    margin: 0;
    color: #f5fff2;
    font-size: 1.15rem;
}

.utility-card p {
    margin: 10px 0 0;
    color: #9a9a9a;
    font-size: 0.8rem;
    line-height: 1.55;
}

.utility-label {
    color: #86c96d;
    font-size: 0.7rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    margin-bottom: 10px;
    display: inline-block;
}

.utility-card-danger {
    border-color: rgba(239, 68, 68, 0.18);
    background: linear-gradient(180deg, rgba(239, 68, 68, 0.05), rgba(255, 255, 255, 0.015));
}

.profiles-panel-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
}

.profiles-list-shell {
    flex: 1;
    min-height: 0;
    padding: 14px;
    border-radius: 20px;
    border: 1px solid rgba(77, 158, 57, 0.14);
    background: rgba(255, 255, 255, 0.02);
}

/* Scrollbar */
.services-scroll::-webkit-scrollbar,
.network-scroll::-webkit-scrollbar {
    width: 4px;
}

.services-scroll::-webkit-scrollbar-track,
.network-scroll::-webkit-scrollbar-track {
    background: rgba(77, 158, 57, 0.1);
    border-radius: 2px;
}

.services-scroll::-webkit-scrollbar-thumb,
.network-scroll::-webkit-scrollbar-thumb {
    background: rgba(77, 158, 57, 0.3);
    border-radius: 2px;
}

/* Responsive */
@media (max-width: 768px) {
    .admin-container {
        padding: 15px 0;
    }

    .admin-title {
        font-size: 2rem;
    }

    .uptime-stats-row {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .uptime-window-label {
        width: 100%;
        text-align: left;
    }

    .uptime-legend {
        grid-template-columns: 1fr;
        gap: 4px;
    }

    .uptime-legend span:last-child {
        text-align: left;
    }

    .api-stats-row,
    .api-chart-grid {
        grid-template-columns: 1fr;
    }

    .api-route-row {
        flex-direction: column;
        align-items: flex-start;
    }

    .api-route-chip {
        align-self: flex-start;
    }

    .utility-grid {
        grid-template-columns: 1fr;
    }

    .profiles-panel-header {
        flex-direction: column;
    }
}

/* Update Bot */
.update-bot-area {
    position: relative;
}

.update-status {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 10px;
    padding: 10px 14px;
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.25);
    border-radius: 8px;
    color: #969696;
    font-size: 0.82rem;
}

.update-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(239, 68, 68, 0.3);
    border-top: 2px solid #ef4444;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    flex-shrink: 0;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}
</style>