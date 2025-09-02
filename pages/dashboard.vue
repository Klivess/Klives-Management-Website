<template>
    <div class="dashboard-container">
        <!-- Welcome Header -->
        <div class="dashboard-header">
            <h1 class="dashboard-title">Dashboard</h1>
            <p class="dashboard-subtitle">Monitor all systems, schemes, and operations</p>
            <div class="last-update">
                <span v-if="loading">Refreshing data...</span>
                <span v-else-if="error">Last Update: Error</span>
                <span v-else>Last Update: {{ lastUpdate }}</span>
            </div>
        </div>

        <!-- Quick Actions Grid -->
        <KMInfoGrid columns="3" rows="1" rowHeight="180" style="padding-bottom: 30px;">
            <QuickActionCard
                title="Bot Logs"
                description="Monitor system events and bot activities"
                icon="📋"
                actionText="View Logs"
                variant="info"
                to="/administration/botlogs"
            />
            <div class="data-zone" :class="{ 'zone-loading': loadingStates.kliveTech, 'zone-error': errorStates.kliveTech }">
                <div v-if="loadingStates.kliveTech" class="loading-overlay">
                    <div class="loading-spinner"></div>
                    <span>Loading KliveTech...</span>
                </div>
                <div v-if="errorStates.kliveTech" class="error-overlay">
                    <span>ERROR</span>
                    <button @click="retryKliveTechStats" class="retry-btn">Retry</button>
                </div>
                <QuickActionCard
                    title="KliveTech Devices"
                    description="Control connected gadgets and IoT devices"
                    icon="🔧"
                    :value="kliveTechStats.hasAccess ? kliveTechStats.connectedDevices : (kliveTechStats.connectedDevices === 'Restricted' ? null : kliveTechStats.connectedDevices)"
                    format="count"
                    :actionText="kliveTechStats.hasAccess ? 'Manage Devices' : (kliveTechStats.connectedDevices === 'Restricted' ? 'Access Restricted' : 'Manage Devices')"
                    :variant="kliveTechStats.hasAccess ? 'success' : (kliveTechStats.connectedDevices === 'Restricted' ? 'danger' : 'success')"
                    :to="kliveTechStats.hasAccess ? '/klivetech' : (kliveTechStats.connectedDevices === 'Restricted' ? null : '/klivetech')"
                    :onClick="kliveTechStats.hasAccess ? null : (kliveTechStats.connectedDevices === 'Restricted' ? showAccessDeniedMessage : null)"
                />
            </div>
            <QuickActionCard
                title="Scheduled Tasks"
                description="View and manage bot task schedules"
                icon="⏰"
                actionText="View Schedule"
                variant="info"
                to="/botSchedule"
            />
        </KMInfoGrid>

        <!-- Schemes Performance Overview -->
        <KMInfoGrid columns="1" rows="1" rowHeight="210">
            <KMInfoBox caption="Active Schemes Performance">
                <div class="data-zone schemes-overview" :class="{ 'zone-loading': loadingStates.cs2 || loadingStates.memescraper, 'zone-error': errorStates.cs2 && errorStates.memescraper }">
                    <div v-if="loadingStates.cs2 || loadingStates.memescraper" class="loading-overlay">
                        <div class="loading-spinner"></div>
                        <span>Loading Schemes...</span>
                    </div>
                    <div v-if="errorStates.cs2 && errorStates.memescraper" class="error-overlay">
                        <span>ERROR</span>
                        <button @click="retryCS2Stats(); retryMemescraperStats()" class="retry-btn">Retry</button>
                    </div>
                    <div class="scheme-cards">
                        <div class="scheme-card cs2-card" @click="navigateToScheme('/schemery/cs2arbitragebot')"
                             :class="{ 'card-loading': loadingStates.cs2, 'card-error': errorStates.cs2 }">
                            <div v-if="loadingStates.cs2" class="card-loading-overlay">
                                <div class="loading-spinner-small"></div>
                            </div>
                            <div v-if="errorStates.cs2" class="card-error-overlay">
                                <span>ERROR</span>
                                <button @click.stop="retryCS2Stats" class="retry-btn-small">↻</button>
                            </div>
                            <div class="scheme-header">
                                <h3>CS2 Arbitrage Bot</h3>
                                <div class="scheme-status active">Active</div>
                            </div>
                            <div class="scheme-metrics">
                                <div class="metric">
                                    <span class="metric-label">Success Rate</span>
                                    <span class="metric-value success">{{ cs2Stats.successRate.toFixed(1) }}%</span>
                                </div>
                                <div class="metric">
                                    <span class="metric-label">Items Scanned</span>
                                    <span class="metric-value">{{ cs2Stats.itemsScanned.toLocaleString() }}</span>
                                </div>
                                <div class="metric">
                                    <span class="metric-label">Best Find</span>
                                    <span class="metric-value profit">+{{ cs2Stats.bestFind.toFixed(1) }}%</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="scheme-card memescraper-card" @click="memescraperStats.hasAccess ? navigateToScheme('/schemery/memescraper') : showAccessDeniedMessage()"
                             :class="{ 'card-loading': loadingStates.memescraper, 'card-error': errorStates.memescraper }">
                            <div v-if="loadingStates.memescraper" class="card-loading-overlay">
                                <div class="loading-spinner-small"></div>
                            </div>
                            <div v-if="errorStates.memescraper" class="card-error-overlay">
                                <span>ERROR</span>
                                <button @click.stop="retryMemescraperStats" class="retry-btn-small">↻</button>
                            </div>
                            <div class="scheme-header">
                                <h3>Meme Scraper</h3>
                                <div :class="['scheme-status', memescraperStats.hasAccess ? 'active' : 'restricted']">
                                    {{ memescraperStats.hasAccess ? 'Active' : 'Restricted' }}
                                </div>
                            </div>
                            <div class="scheme-metrics">
                                <div class="metric">
                                    <span class="metric-label">Total Memes</span>
                                    <span class="metric-value">{{ memescraperStats.totalMemes === 'Restricted' ? 'Restricted' : memescraperStats.totalMemes.toLocaleString() }}</span>
                                </div>
                                <div class="metric">
                                    <span class="metric-label">Today's Downloads</span>
                                    <span class="metric-value success">{{ memescraperStats.todayDownloads === 'Restricted' ? 'Restricted' : '+' + memescraperStats.todayDownloads }}</span>
                                </div>
                                <div class="metric">
                                    <span class="metric-label">Top Source</span>
                                    <span class="metric-value profit">{{ memescraperStats.topPerformingSource }}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="scheme-card inactive-card">
                            <div class="scheme-header">
                                <h3>OmniTrader</h3>
                                <div class="scheme-status inactive">Development</div>
                            </div>
                            <div class="scheme-metrics">
                                <div class="metric">
                                    <span class="metric-label">Status</span>
                                    <span class="metric-value">In Development</span>
                                </div>
                            </div>
                        </div>

                        <div class="scheme-card inactive-card">
                            <div class="scheme-header">
                                <h3>OmniTube Bot</h3>
                                <div class="scheme-status inactive">Development</div>
                            </div>
                            <div class="scheme-metrics">
                                <div class="metric">
                                    <span class="metric-label">Status</span>
                                    <span class="metric-value">Planned</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </KMInfoBox>
        </KMInfoGrid>

        <!-- System Administration -->
        <KMInfoGrid columns="1" rows="1" rowHeight="300">
            <KMInfoBox caption="Log Analytics">
                <div class="data-zone log-section" :class="{ 'zone-loading': loadingStates.logs, 'zone-error': errorStates.logs }">
                    <div v-if="loadingStates.logs" class="loading-overlay">
                        <div class="loading-spinner"></div>
                        <span>Loading Logs...</span>
                    </div>
                    <div v-if="errorStates.logs" class="error-overlay">
                        <span>ERROR</span>
                        <button @click="retryLogs" class="retry-btn">Retry</button>
                    </div>
                    <div class="log-metrics">
                        <CS2MetricCard
                            :value="systemStats.totalLogs === 'Restricted' ? 'Restricted' : systemStats.totalLogs"
                            label="Total Logs"
                            format="count"
                            :variant="systemStats.totalLogs === 'Restricted' ? 'danger' : 'info'"
                        />
                        <CS2MetricCard
                            :value="systemStats.totalErrors === 'Restricted' ? 'Restricted' : systemStats.totalErrors"
                            label="Error Logs"
                            format="count"
                            :variant="systemStats.totalErrors === 'Restricted' ? 'danger' : (typeof systemStats.totalErrors === 'number' && systemStats.totalErrors > 0 ? 'danger' : 'success')"
                        />
                    </div>
                    <div class="log-actions">
                        <KMButton 
                            :message="systemStats.totalLogs === 'Restricted' ? 'Access Restricted' : 'View Logs'"
                            :textColor="systemStats.totalLogs === 'Restricted' ? '#ef4444' : '#4d9e39'"
                            @click="systemStats.totalLogs === 'Restricted' ? showAccessDeniedMessage() : navigateToScheme('/administration/botlogs')"
                            style="width: 100%; height: 40px; margin-top: 10px;"
                        />
                    </div>
                </div>
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
import CS2MetricCard from '~/components/CS2MetricCard.vue';
import GradientProgress from '~/components/GradientProgress.vue';
import QuickActionCard from '~/components/QuickActionCard.vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import Swal from 'sweetalert2';

export default {
    components: {
        KMInfoGrid,
        KMInfoBox,
        KMButton,
        CS2MetricCard,
        GradientProgress,
        QuickActionCard
    },
    data() {
        return {
            loading: false,
            error: null,
            lastUpdate: 'Never',
            loadInterval: null,
            completedLoads: 0,
            totalLoads: 3, // CS2, Memescraper, KliveTech (removed BotStats and Admin)
            loadingStates: {
                cs2: false,
                memescraper: false,
                kliveTech: false,
                logs: false
            },
            errorStates: {
                cs2: false,
                memescraper: false,
                kliveTech: false,
                logs: false
            },
            systemStats: {
                totalUptime: 'Loading...',
                totalLogs: 0,
                totalErrors: 0,
                totalServices: 0,
                cpuUsage: 0,
                ramUsage: 0,
                logsAccessible: true
            },
            cs2Stats: {
                successRate: 0,
                itemsScanned: 0,
                bestFind: 0,
                hasAccess: true
            },
            memescraperStats: {
                totalSources: 0,
                totalMemes: 0,
                activeNiches: 0,
                todayDownloads: 0,
                avgDownloadsPerDay: 0,
                topPerformingSource: 'N/A',
                hasAccess: true
            },
            kliveTechStats: {
                connectedDevices: 0,
                onlineDevices: 0,
                hasAccess: true
            },
            recentActivities: []
        }
    },
    methods: {
        async loadDashboardData() {
            this.loading = true;
            this.error = null;
            this.completedLoads = 0;
            
            try {
                // Load general bot statistics (minimal required data)
                this.loadGeneralStats();
                
                // Start all data zone loading immediately and asynchronously
                // Don't wait for any of them - let each zone update independently
                this.loadCS2Stats();
                this.loadMemescraperStats(); 
                this.loadKliveTechStats();
                this.loadRecentActivity(); // Only for logs now
                
            } catch (err) {
                console.error('Dashboard data loading error:', err);
                this.error = err;
                this.lastUpdate = 'Error loading data';
            } finally {
                this.loading = false;
            }
        },
        
        trackLoadCompletion() {
            this.completedLoads++;
            if (this.completedLoads >= this.totalLoads) {
                this.lastUpdate = new Date().toLocaleString();
            }
        },
        
        // Individual retry methods that can be called from error overlays
        retryCS2Stats() {
            this.loadCS2Stats();
        },
        
        retryMemescraperStats() {
            this.loadMemescraperStats();
        },
        
        retryKliveTechStats() {
            this.loadKliveTechStats();
        },
        
        retryLogs() {
            this.loadRecentActivity();
        },
        
        async loadGeneralStats() {
            // No real API endpoint available for general stats
            // Keep minimal required data for UI functionality
            this.systemStats = {
                totalUptime: 'N/A',
                totalLogs: 0,
                totalErrors: 0,
                totalServices: 0,
                cpuUsage: 0,
                ramUsage: 0,
                logsAccessible: true
            };
        },
        
        async loadCS2Stats() {
            this.loadingStates.cs2 = true;
            this.errorStates.cs2 = false;
            
            try {
                const response = await RequestGETFromKliveAPI('/cs2arbitragebot/getscanalytics', false, false);
                if (response.ok) {
                    const data = await response.json();
                    this.cs2Stats = {
                        successRate: Math.round((data.PercentageChanceOfFindingPositiveGainListing || 0) * 100) / 100,
                        itemsScanned: data.TotalListingsScanned || 0,
                        bestFind: Math.round(((data.HighestPredictedGainFoundSoFar - 1) * 100 || 0) * 100) / 100
                    };
                } else {
                    // API returned an error status (404, 500, etc.)
                    console.log('CS2 stats API returned error status:', response.status);
                    this.errorStates.cs2 = true;
                    this.cs2Stats = {
                        successRate: 0,
                        itemsScanned: 0,
                        bestFind: 0
                    };
                }
            } catch (error) {
                console.log('CS2 stats API unavailable:', error);
                this.errorStates.cs2 = true;
                this.cs2Stats = {
                    successRate: 0,
                    itemsScanned: 0,
                    bestFind: 0
                };
            } finally {
                this.loadingStates.cs2 = false;
                this.trackLoadCompletion();
            }
        },
        
        async loadMemescraperStats() {
            this.loadingStates.memescraper = true;
            this.errorStates.memescraper = false;
            
            try {
                const response = await RequestGETFromKliveAPI('/memescraper/memeScraperAnalytics', false, false);
                if (response.ok) {
                    const analytics = await response.json();
                    
                    // Calculate today's downloads with multiple date format attempts
                    let todayDownloads = 0;
                    if (analytics.MemesDownloadedPerDay) {
                        const today = new Date();
                        const dateFormats = [
                            // Try different date formats
                            today.toISOString().split('T')[0], // YYYY-MM-DD
                            today.toLocaleDateString('en-US'), // M/D/YYYY
                            today.toLocaleDateString('en-GB'), // DD/MM/YYYY
                            `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`, // M/D/YYYY
                            `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`, // D/M/YYYY
                            today.toDateString(), // Full date string
                        ];
                        
                        // Try to find today's data with any of these formats
                        for (const dateFormat of dateFormats) {
                            if (analytics.MemesDownloadedPerDay[dateFormat]) {
                                todayDownloads = analytics.MemesDownloadedPerDay[dateFormat];
                                break;
                            }
                        }
                        
                        // If still not found, check if any key contains today's date
                        if (todayDownloads === 0) {
                            const todayStr = today.toISOString().split('T')[0];
                            const keys = Object.keys(analytics.MemesDownloadedPerDay);
                            for (const key of keys) {
                                if (key.includes(todayStr) || new Date(key).toDateString() === today.toDateString()) {
                                    todayDownloads = analytics.MemesDownloadedPerDay[key];
                                    break;
                                }
                            }
                        }
                        
                        // Debug logging
                        console.log('Available date keys:', Object.keys(analytics.MemesDownloadedPerDay));
                        console.log('Today download count found:', todayDownloads);
                    }
                    
                    // Calculate average downloads per day
                    const downloadEntries = Object.entries(analytics.MemesDownloadedPerDay || {});
                    const totalDownloads = downloadEntries.reduce((sum, [, count]) => sum + (count || 0), 0);
                    const totalDays = downloadEntries.length || 1;
                    const avgDownloadsPerDay = Math.round(totalDownloads / totalDays);
                    
                    // Find top performing source from ReelsDownloadedPerSource
                    let topSource = 'N/A';
                    if (analytics.ReelsDownloadedPerSource) {
                        const sortedSources = Object.entries(analytics.ReelsDownloadedPerSource)
                            .sort(([,a], [,b]) => b - a);
                        if (sortedSources.length > 0) {
                            topSource = sortedSources[0][0] || 'N/A';
                            if (topSource.length > 15) {
                                topSource = topSource.substring(0, 12) + '...';
                            }
                        }
                    }
                    
                    this.memescraperStats = {
                        totalSources: analytics.InstagramSources?.length || 0,
                        totalMemes: analytics.InstagramReelsDownloaded?.length || 0,
                        activeNiches: Object.keys(analytics.TopNichesByDownload || {}).length,
                        todayDownloads: todayDownloads,
                        avgDownloadsPerDay: avgDownloadsPerDay,
                        topPerformingSource: topSource,
                        hasAccess: true
                    };
                } else if (response.status === 401) {
                    // User doesn't have permission to view meme scraper analytics
                    this.memescraperStats = {
                        totalSources: 'Restricted',
                        totalMemes: 'Restricted',
                        activeNiches: 'Restricted',
                        todayDownloads: 'Restricted',
                        avgDownloadsPerDay: 'Restricted',
                        topPerformingSource: 'Restricted',
                        hasAccess: false
                    };
                    console.log('Meme Scraper analytics access denied - insufficient permissions');
                } else {
                    // API not available or other error
                    console.log('Meme Scraper analytics API returned status:', response.status);
                    this.errorStates.memescraper = true;
                    this.memescraperStats = {
                        totalSources: 0,
                        totalMemes: 0,
                        activeNiches: 0,
                        todayDownloads: 0,
                        avgDownloadsPerDay: 0,
                        topPerformingSource: 'N/A',
                        hasAccess: true
                    };
                }
            } catch (error) {
                console.log('Meme Scraper analytics API unavailable:', error);
                this.errorStates.memescraper = true;
                this.memescraperStats = {
                    totalSources: 0,
                    totalMemes: 0,
                    activeNiches: 0,
                    todayDownloads: 0,
                    avgDownloadsPerDay: 0,
                    topPerformingSource: 'N/A',
                    hasAccess: true
                };
            } finally {
                this.loadingStates.memescraper = false;
                this.trackLoadCompletion();
            }
        },
        
        async loadKliveTechStats() {
            this.loadingStates.kliveTech = true;
            this.errorStates.kliveTech = false;
            
            try {
                const response = await RequestGETFromKliveAPI('/klivetech/GetAllGadgets', false, false);
                if (response.ok) {
                    const gadgets = await response.json();
                    this.kliveTechStats = {
                        connectedDevices: gadgets.length,
                        onlineDevices: gadgets.filter(g => g.isOnline).length,
                        hasAccess: true
                    };
                } else if (response.status === 401) {
                    // User doesn't have permission to view KliveTech devices
                    this.kliveTechStats = {
                        connectedDevices: 'Restricted',
                        onlineDevices: 'Restricted',
                        hasAccess: false
                    };
                    console.log('KliveTech access denied - insufficient permissions');
                } else {
                    // No fallback data
                    this.errorStates.kliveTech = true;
                    this.kliveTechStats = {
                        connectedDevices: 0,
                        onlineDevices: 0,
                        hasAccess: true
                    };
                }
            } catch (error) {
                console.log('KliveTech API unavailable:', error);
                this.errorStates.kliveTech = true;
                this.kliveTechStats = {
                    connectedDevices: 0,
                    onlineDevices: 0,
                    hasAccess: true
                };
            } finally {
                this.loadingStates.kliveTech = false;
                this.trackLoadCompletion();
            }
        },
        
        async loadRecentActivity() {
            this.loadingStates.logs = true;
            this.errorStates.logs = false;
            
            try {
                const response = await RequestGETFromKliveAPI('/api/logs', false, false);
                if (response.ok) {
                    const logs = await response.json();
                    // Get the 5 most recent activities
                    this.recentActivities = logs.slice(0, 5).map((log, index) => ({
                        id: index,
                        time: log.timestamp || new Date(),
                        description: log.message || `${log.serviceName}: ${log.logType}`
                    }));
                    
                    // Calculate log analytics
                    this.systemStats.totalLogs = logs.length;
                    this.systemStats.totalErrors = logs.filter(log => log.type === 1).length;
                    this.systemStats.logsAccessible = true;
                } else if (response.status === 401) {
                    // User doesn't have permission to view logs
                    this.recentActivities = [
                        { id: 1, time: new Date(), description: 'Access to detailed logs restricted for your permission level' }
                    ];
                    this.systemStats.totalLogs = 'Restricted';
                    this.systemStats.totalErrors = 'Restricted';
                    this.systemStats.logsAccessible = false;
                    console.log('Logs access denied - insufficient permissions');
                } else {
                    // No real logs available
                    this.errorStates.logs = true;
                    this.recentActivities = [];
                    this.systemStats.totalLogs = 0;
                    this.systemStats.totalErrors = 0;
                    this.systemStats.logsAccessible = true;
                }
            } catch (error) {
                console.log('Logs API unavailable:', error);
                this.errorStates.logs = true;
                this.recentActivities = [];
                this.systemStats.totalLogs = 0;
                this.systemStats.totalErrors = 0;
                this.systemStats.logsAccessible = true;
            } finally {
                this.loadingStates.logs = false;
                this.trackLoadCompletion();
            }
        },
        
        refreshDashboard() {
            this.loadDashboardData();
        },
        
        async refreshKliveTechDevices() {
            if (!this.kliveTechStats.hasAccess) {
                this.showAccessDeniedMessage();
                return;
            }
            
            try {
                await RequestPOSTFromKliveAPI('/klivetech/RefreshAllDevices', '', false);
                await this.loadKliveTechStats();
            } catch (error) {
                console.error('Failed to refresh KliveTech devices:', error);
                if (error.status === 401) {
                    this.showAccessDeniedMessage();
                }
            }
        },
        
        navigateToScheme(path) {
            this.$router.push(path);
        },
        
        showAccessDeniedMessage() {
            Swal.fire({
                icon: 'warning',
                title: 'Access Restricted',
                text: 'You do not have sufficient permissions to access this feature.',
                confirmButtonColor: '#4d9e39',
                background: '#161516',
                color: '#ffffff',
                customClass: {
                    popup: 'swal-dark-theme'
                }
            });
        },
        
        formatTime(time) {
            const now = new Date();
            const diff = now - new Date(time);
            const minutes = Math.floor(diff / 60000);
            const hours = Math.floor(minutes / 60);
            
            if (hours > 0) {
                return `${hours}h ${minutes % 60}m ago`;
            } else if (minutes > 0) {
                return `${minutes}m ago`;
            } else {
                return 'Just now';
            }
        }
    },
    mounted() {
        this.loadDashboardData();
        
        // Set up auto-refresh every 30 seconds
        this.loadInterval = setInterval(() => {
            this.loadDashboardData();
        }, 30000);
    },
    beforeUnmount() {
        if (this.loadInterval) {
            clearInterval(this.loadInterval);
        }
    }
}
</script>

<style scoped>
.dashboard-container {
    padding: 20px 0;
    background-color: #201f20;
    min-height: 100vh;
}

.dashboard-header {
    text-align: center;
    margin-bottom: 30px;
    padding: 0 20px;
}

.dashboard-title {
    font-size: 2.5rem;
    font-weight: bold;
    color: #4d9e39;
    margin: 0 0 10px 0;
    background: linear-gradient(135deg, #4d9e39, #62ce47);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.dashboard-subtitle {
    color: #969696;
    font-size: 1.2rem;
    margin: 0 0 15px 0;
    line-height: 1.4;
}

.last-update {
    color: #4d9e39;
    font-size: 1rem;
    font-weight: 500;
    padding: 8px 16px;
    background: rgba(77, 158, 57, 0.1);
    border-radius: 20px;
    display: inline-block;
    border: 1px solid rgba(77, 158, 57, 0.2);
}

/* System Health Overview */
.system-health-grid {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 20px;
    height: 100%;
    align-items: center;
}

.health-metrics {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 15px;
}

.resource-usage {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
    height: 120px;
}

/* Schemes Overview */
.schemes-overview {
    height: 100%;
}

.scheme-cards {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 15px;
    height: 100%;
}

.scheme-card {
    background: linear-gradient(135deg, #161616 0%, #201f20 100%);
    border: 1px solid rgba(77, 158, 57, 0.3);
    border-radius: 12px;
    padding: 16px;
    cursor: pointer;
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
}

.scheme-card:hover {
    transform: translateY(-2px);
    border-color: rgba(77, 158, 57, 0.6);
    box-shadow: 0 8px 25px rgba(77, 158, 57, 0.2);
}

.scheme-card.cs2-card {
    border-color: rgba(34, 197, 94, 0.4);
}

.scheme-card.cs2-card:hover {
    border-color: rgba(34, 197, 94, 0.7);
    box-shadow: 0 8px 25px rgba(34, 197, 94, 0.2);
}

.scheme-card.memescraper-card {
    border-color: rgba(139, 92, 246, 0.4);
}

.scheme-card.memescraper-card:hover {
    border-color: rgba(139, 92, 246, 0.7);
    box-shadow: 0 8px 25px rgba(139, 92, 246, 0.2);
}

.scheme-card.inactive-card {
    border-color: rgba(156, 163, 175, 0.3);
    opacity: 0.7;
}

.scheme-card.inactive-card:hover {
    border-color: rgba(156, 163, 175, 0.5);
    box-shadow: 0 8px 25px rgba(156, 163, 175, 0.1);
    opacity: 0.85;
}

.scheme-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
}

.scheme-header h3 {
    color: #ffffff;
    font-size: 1rem;
    font-weight: 600;
    margin: 0;
    line-height: 1.2;
}

.scheme-status {
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.scheme-status.active {
    background: rgba(34, 197, 94, 0.2);
    color: #22c55e;
    border: 1px solid rgba(34, 197, 94, 0.3);
}

.scheme-status.inactive {
    background: rgba(156, 163, 175, 0.2);
    color: #9ca3af;
    border: 1px solid rgba(156, 163, 175, 0.3);
}

.scheme-status.restricted {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.3);
}

.scheme-metrics {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.metric {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.metric-label {
    color: #969696;
    font-size: 0.8rem;
}

.metric-value {
    color: #ffffff;
    font-size: 0.85rem;
    font-weight: 600;
}

.metric-value.success {
    color: #22c55e;
}

.metric-value.profit {
    color: #fbbf24;
}

/* KliveTech Overview */
.klivetech-overview {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.device-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
}

.device-actions {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
}

/* Log Section */
.log-section {
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
}

.log-actions {
    margin-top: auto;
}

.log-metrics {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
    margin-bottom: 15px;
}

.no-activity,
.no-data-section {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100px;
    background: rgba(77, 158, 57, 0.05);
    border-radius: 8px;
    border: 1px solid rgba(77, 158, 57, 0.2);
}

.no-data-text {
    color: #969696;
    font-style: italic;
    font-size: 0.9rem;
}

/* Custom scrollbar for activity list */
.activity-list::-webkit-scrollbar {
    width: 4px;
}

.activity-list::-webkit-scrollbar-track {
    background: rgba(77, 158, 57, 0.1);
    border-radius: 2px;
}

.activity-list::-webkit-scrollbar-thumb {
    background: rgba(77, 158, 57, 0.3);
    border-radius: 2px;
}

.activity-list::-webkit-scrollbar-thumb:hover {
    background: rgba(77, 158, 57, 0.5);
}

/* Responsive Design */
@media (max-width: 1400px) {
    .scheme-cards {
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
    }
    
    .system-health-grid {
        grid-template-columns: 1fr;
        gap: 15px;
    }
    
    .health-metrics {
        grid-template-columns: repeat(3, 1fr);
    }
}

@media (max-width: 768px) {
    .dashboard-container {
        padding: 15px 0;
    }
    
    .dashboard-title {
        font-size: 2rem;
    }
    
    .dashboard-subtitle {
        font-size: 1rem;
    }
    
    .scheme-cards {
        grid-template-columns: 1fr;
    }
    
    .health-metrics {
        grid-template-columns: 1fr;
        gap: 10px;
    }
    
    .resource-usage {
        grid-template-columns: 1fr;
    }
    
    .device-stats {
        grid-template-columns: 1fr;
    }
    
    .system-health-grid {
        gap: 10px;
    }
}

@media (max-width: 480px) {
    .dashboard-header {
        padding: 0 15px;
    }
    
    .dashboard-title {
        font-size: 1.8rem;
    }
    
    .last-update {
        font-size: 0.9rem;
        padding: 6px 12px;
    }
}

/* Loading states */
.loading {
    opacity: 0.7;
    pointer-events: none;
}

.error {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.3);
}

/* Smooth transitions */
* {
    transition: all 0.3s ease;
}

/* Focus states for accessibility */
.scheme-card:focus,
button:focus {
    outline: 2px solid #4d9e39;
    outline-offset: 2px;
}

/* Restricted access states */
.restricted-access {
    opacity: 0.6;
    position: relative;
}

.restricted-access::after {
    content: '🔒';
    position: absolute;
    top: 10px;
    right: 10px;
    font-size: 1.2rem;
    opacity: 0.7;
}

.access-denied-message {
    color: #ef4444;
    font-style: italic;
    font-size: 0.9rem;
    margin-top: 8px;
}

/* Data Zone Loading and Error States */
.data-zone {
    position: relative;
    height: 100%;
}

.zone-loading .loading-overlay,
.zone-error .error-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(32, 31, 32, 0.95);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 10;
    border-radius: 12px;
}

.loading-overlay {
    color: #4d9e39;
}

.error-overlay {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.15);
    border: 2px solid rgba(239, 68, 68, 0.4);
}

.loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(77, 158, 57, 0.3);
    border-top: 3px solid #4d9e39;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 10px;
}

.loading-spinner-small {
    width: 20px;
    height: 20px;
    border: 2px solid rgba(77, 158, 57, 0.3);
    border-top: 2px solid #4d9e39;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

.retry-btn {
    margin-top: 10px;
    padding: 8px 16px;
    background: #ef4444;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: background-color 0.3s ease;
}

.retry-btn:hover {
    background: #dc2626;
}

.retry-btn-small {
    position: absolute;
    top: 5px;
    right: 5px;
    width: 20px;
    height: 20px;
    background: #ef4444;
    color: white;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.3s ease;
}

.retry-btn-small:hover {
    background: #dc2626;
}

/* Card-level loading and error states */
.card-loading {
    opacity: 0.7;
    position: relative;
}

.card-error {
    opacity: 0.6;
    position: relative;
    border-color: rgba(239, 68, 68, 0.6) !important;
}

.card-loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(32, 31, 32, 0.9);
    display: flex;
    justify-content: center;
    align-items: center;
    border-radius: 12px;
    z-index: 5;
}

.card-error-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(239, 68, 68, 0.2);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    border-radius: 12px;
    z-index: 5;
    color: #ef4444;
    font-weight: bold;
}
</style>