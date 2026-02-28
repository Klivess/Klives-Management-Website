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
                    <div class="metric-sub">Heartbeat {{ stats.lastOmnipotentUpdateHumanized }}</div>
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
                        <span class="svc-dot" :class="svc.IsActive ? 'dot-on' : 'dot-off'"></span>
                        <span class="svc-name">{{ svc.Name }}</span>
                        <span class="svc-uptime">{{ svc.UptimeHumanized }}</span>
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

        <!-- Management -->
        <KMInfoGrid columns="2" rows="1" rowHeight="460">
            <KMInfoBox caption="Bot Utilities">
                <NuxtLink to="/administration/botlogs">
                    <KMButton message="Bot Logs" style="height: 100px; width: 100%; margin-top: 30px;" />
                </NuxtLink>
                <div class="update-bot-area">
                    <KMButton
                        :message="botUpdating ? 'Updating...' : 'Update Bot'"
                        :textColor="botUpdating ? '#969696' : '#ef4444'"
                        style="height: 100px; width: 100%; margin-top: 15px;"
                        :onclick="updateBot"
                    />
                    <div v-if="botUpdating" class="update-status">
                        <div class="update-spinner"></div>
                        <span>Bot is updating and restarting. The API will be temporarily unavailable...</span>
                    </div>
                </div>
            </KMInfoBox>
            <KMInfoBox caption="Manage Profiles">
                <AdminKMProfileList style="height: 280px;" />
                <KMButton style="height: 100px; margin-top: 30px;" message="Create New Profile" :onclick="goToCreateProfile" />
            </KMInfoBox>
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
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import Swal from 'sweetalert2';

export default {
    components: { KMInfoGrid, KMInfoBox, KMButton },
    data() {
        return {
            statsLoading: false,
            statsError: false,
            botUpdating: false,
            refreshInterval: null,
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
        filteredNetwork() {
            if (!this.stats.NetworkInterfaces) return [];
            return this.stats.NetworkInterfaces.filter(ni => {
                const hasTraffic = ni.BytesSent > 0 || ni.BytesReceived > 0;
                const isFilter = ni.Name.includes('Filter') || ni.Name.includes('QoS') || ni.Name.includes('WFP');
                return hasTraffic && !isFilter;
            });
        }
    },
    methods: {
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
                this.refreshInterval = setInterval(() => this.loadStats(), 10000);
            }
        },
        formatBytes(bytes) {
            if (!bytes || bytes === 0) return '0 B';
            const units = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(1024));
            return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
        }
    },
    mounted() {
        this.loadStats();
        this.refreshInterval = setInterval(() => this.loadStats(), 10000);
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
    gap: 10px;
    padding: 6px 8px;
    border-radius: 4px;
}

.service-row:hover {
    background: rgba(77, 158, 57, 0.06);
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

.svc-name {
    color: #ffffff;
    font-size: 0.82rem;
    flex: 1;
}

.svc-uptime {
    color: #969696;
    font-size: 0.75rem;
    white-space: nowrap;
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