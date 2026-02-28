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

        <!-- Service Health Dots -->
        <div class="service-health-bar">
            <span class="shb-label">Services</span>
            <div class="shb-dots">
                <div
                    v-for="svc in frontpageStats.Services"
                    :key="svc.Name"
                    class="shb-dot"
                    :class="svc.IsActive ? 'dot-on' : 'dot-off'"
                    :title="svc.Name + ' — ' + svc.UptimeHumanized"
                ></div>
            </div>
            <span class="shb-summary" v-if="frontpageStats.Services.length">
                <span class="shb-count-ok">{{ frontpageStats.Services.filter(s => s.IsActive).length }}</span>/<span>{{ frontpageStats.Services.length }}</span> online
            </span>
        </div>

        <!-- Server Status Summary -->
        <KMInfoGrid columns="1" rows="1" rowHeight="140" style="padding-bottom: 0px;">
            <KMInfoBox caption="Server Status">
                <div class="data-zone server-stats-zone" :class="{ 'zone-loading': loadingStates.frontpage, 'zone-error': errorStates.frontpage }">
                    <div v-if="loadingStates.frontpage" class="loading-overlay">
                        <div class="loading-spinner"></div>
                        <span>Loading Stats...</span>
                    </div>
                    <div v-if="errorStates.frontpage" class="error-overlay">
                        <span>ERROR</span>
                        <button @click="retryFrontpageStats" class="retry-btn">Retry</button>
                    </div>
                    <div class="server-stats-grid">
                        <div class="server-stat">
                            <span class="server-stat-value" :class="frontpageStats.BotUptimeHumanized !== 'N/A' ? 'stat-success' : ''">{{ frontpageStats.BotUptimeHumanized }}</span>
                            <span class="server-stat-label">Bot Uptime</span>
                        </div>
                        <div class="server-stat">
                            <span class="server-stat-value" :class="frontpageStats.CpuUsagePercentage > 85 ? 'stat-danger' : frontpageStats.CpuUsagePercentage > 60 ? 'stat-warning' : 'stat-success'">{{ frontpageStats.CpuUsagePercentage.toFixed(0) }}%</span>
                            <span class="server-stat-label">CPU</span>
                        </div>
                        <div class="server-stat">
                            <span class="server-stat-value" :class="frontpageStats.RamUsagePercentage > 85 ? 'stat-danger' : frontpageStats.RamUsagePercentage > 60 ? 'stat-warning' : 'stat-success'">{{ frontpageStats.RamUsedGB.toFixed(1) }}/{{ frontpageStats.RamTotalGB.toFixed(0) }}GB</span>
                            <span class="server-stat-label">RAM ({{ frontpageStats.RamUsagePercentage.toFixed(0) }}%)</span>
                        </div>
                        <div class="server-stat">
                            <span class="server-stat-value" :class="frontpageStats.TotalServicesActive === frontpageStats.TotalServicesRegistered ? 'stat-success' : 'stat-warning'">{{ frontpageStats.TotalServicesActive }}/{{ frontpageStats.TotalServicesRegistered }}</span>
                            <span class="server-stat-label">Services</span>
                        </div>
                        <div class="server-stat">
                            <span class="server-stat-value">{{ frontpageStats.TotalLogs.toLocaleString() }}</span>
                            <span class="server-stat-label">Logs</span>
                        </div>
                        <div class="server-stat">
                            <span class="server-stat-value" :class="frontpageStats.TotalErrorLogs > 0 ? 'stat-danger' : 'stat-success'">{{ frontpageStats.TotalErrorLogs }}</span>
                            <span class="server-stat-label">Errors</span>
                        </div>
                        <div class="server-stat">
                            <span class="server-stat-value">{{ frontpageStats.TotalScheduledTasks }}</span>
                            <span class="server-stat-label">Tasks</span>
                        </div>
                    </div>
                    <div class="server-stats-footer" v-if="frontpageStats.NextTaskScheduledSummary">
                        <span class="footer-label">Next:</span>
                        <span class="footer-value">{{ frontpageStats.NextTaskScheduledSummary }}</span>
                    </div>
                </div>
            </KMInfoBox>
        </KMInfoGrid>

        <!-- Recent Errors -->
        <KMInfoGrid columns="1" rows="1" :rowHeight="recentErrors.length > 0 ? 40 + recentErrors.length * 38 : 65" v-if="recentErrors.length > 0 || loadingStates.frontpage" style="padding-bottom: 0px;">
            <KMInfoBox caption="Recent Errors">
                <div class="recent-errors-zone">
                    <div v-if="recentErrors.length === 0 && !loadingStates.frontpage" class="no-errors">
                        <span class="no-errors-icon">✓</span> No errors recorded
                    </div>
                    <div v-else class="error-list">
                        <div class="error-row" v-for="(err, i) in recentErrors" :key="i">
                            <span class="err-dot"></span>
                            <span class="err-service">{{ err.serviceName }}</span>
                            <span class="err-msg">{{ err.message }}</span>
                            <span class="err-time">{{ err.timeAgo }}</span>
                        </div>
                    </div>
                </div>
            </KMInfoBox>
        </KMInfoGrid>

        <!-- Schemes Performance Overview -->
        <KMInfoGrid columns="1" rows="1" rowHeight="210">
            <KMInfoBox caption="Active Schemes Performance">
                <div class="data-zone schemes-overview">
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
            totalLoads: 3, // CS2, Memescraper, FrontpageStats
            loadingStates: {
                cs2: false,
                memescraper: false,
                kliveTech: false,
                logs: false,
                frontpage: false
            },
            errorStates: {
                cs2: false,
                memescraper: false,
                kliveTech: false,
                logs: false,
                frontpage: false
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
            recentActivities: [],
            recentErrors: [],
            frontpageStats: {
                BotUptimeHumanized: 'N/A',
                CpuUsagePercentage: 0,
                RamUsagePercentage: 0,
                RamUsedGB: 0,
                RamTotalGB: 0,
                TotalServicesActive: 0,
                TotalServicesRegistered: 0,
                TotalLogs: 0,
                TotalErrorLogs: 0,
                TotalScheduledTasks: 0,
                NextTaskScheduledSummary: '',
                lastOmnipotentUpdateHumanized: 'N/A',
                Services: []
            }
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
                this.loadFrontpageStats();
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

        async loadFrontpageStats() {
            this.loadingStates.frontpage = true;
            this.errorStates.frontpage = false;
            try {
                const response = await RequestGETFromKliveAPI('/GeneralBotStatistics/GetFrontpageStats', false, false);
                if (response.ok) {
                    const data = await response.json();
                    this.frontpageStats = {
                        BotUptimeHumanized: data.BotUptimeHumanized || 'N/A',
                        CpuUsagePercentage: data.CpuUsagePercentage || 0,
                        RamUsagePercentage: data.RamUsagePercentage || 0,
                        RamUsedGB: data.RamUsedGB || 0,
                        RamTotalGB: data.RamTotalGB || 0,
                        TotalServicesActive: data.TotalServicesActive || 0,
                        TotalServicesRegistered: data.TotalServicesRegistered || 0,
                        TotalLogs: data.TotalLogs || 0,
                        TotalErrorLogs: data.TotalErrorLogs || 0,
                        TotalScheduledTasks: data.TotalScheduledTasks || 0,
                        NextTaskScheduledSummary: data.NextTaskScheduledSummary || '',
                        lastOmnipotentUpdateHumanized: data.lastOmnipotentUpdateHumanized || 'N/A',
                        Services: data.Services || []
                    };
                    // Load recent errors from the logs API
                    this.loadRecentErrors();
                } else {
                    this.errorStates.frontpage = true;
                }
            } catch (error) {
                console.log('Frontpage stats API unavailable:', error);
                this.errorStates.frontpage = true;
            } finally {
                this.loadingStates.frontpage = false;
                this.trackLoadCompletion();
            }
        },

        retryFrontpageStats() {
            this.loadFrontpageStats();
        },

        async loadRecentErrors() {
            try {
                const response = await RequestGETFromKliveAPI('/api/logs?type=1&limit=5', false, false);
                if (response.ok) {
                    const logs = await response.json();
                    const errorLogs = (Array.isArray(logs) ? logs : [])
                        .filter(l => l.type === 1 || l.logType === 'Error' || l.LogType === 1)
                        .slice(0, 5);
                    this.recentErrors = errorLogs.map(l => ({
                        serviceName: l.serviceName || l.ServiceName || 'Unknown',
                        message: (l.message || l.Message || 'Error').substring(0, 120),
                        timeAgo: this.formatTime(l.timestamp || l.Timestamp || new Date())
                    }));
                }
            } catch (e) {
                console.log('Recent errors unavailable:', e);
            }
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
                        totalSources: analytics.TotalInstagramSources || 0,
                        totalMemes: analytics.TotalReelsDownloaded || 0,
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

/* Server Status Summary */
.server-stats-zone {
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
}

.server-stats-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 8px;
    padding: 0 5px;
}

.server-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 4px;
    background: rgba(77, 158, 57, 0.05);
    border-radius: 8px;
    border: 1px solid rgba(77, 158, 57, 0.1);
}

.server-stat-value {
    font-size: 1.25rem;
    font-weight: 700;
    color: #ffffff;
    line-height: 1.2;
}

.server-stat-value.stat-success { color: #22c55e; }
.server-stat-value.stat-warning { color: #fbbf24; }
.server-stat-value.stat-danger { color: #ef4444; }

.server-stat-label {
    font-size: 0.7rem;
    color: #969696;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    text-align: center;
}

.server-stats-footer {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    padding: 5px 12px;
    background: rgba(77, 158, 57, 0.08);
    border-radius: 6px;
    font-size: 0.8rem;
}

.footer-label {
    color: #969696;
    font-weight: 600;
    white-space: nowrap;
}

.footer-value {
    color: #4d9e39;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

@media (max-width: 768px) {
    .server-stats-grid {
        grid-template-columns: repeat(4, 1fr);
    }
}

@media (max-width: 480px) {
    .server-stats-grid {
        grid-template-columns: repeat(2, 1fr);
    }
}

/* Service Health Bar */
.service-health-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    margin: 0 5px 8px 5px;
    background: #161616;
    border-radius: 12px;
    border: 1px solid rgba(77, 158, 57, 0.15);
}

.shb-label {
    color: #969696;
    font-size: 0.78rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
}

.shb-dots {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    flex: 1;
}

.shb-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    cursor: default;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.shb-dot:hover {
    transform: scale(1.4);
}

.shb-dot.dot-on {
    background: #22c55e;
    box-shadow: 0 0 6px rgba(34, 197, 94, 0.5);
}

.shb-dot.dot-off {
    background: #ef4444;
    box-shadow: 0 0 8px rgba(239, 68, 68, 0.6);
    animation: pulse-red 1.5s infinite;
}

@keyframes pulse-red {
    0%, 100% { box-shadow: 0 0 6px rgba(239, 68, 68, 0.5); }
    50% { box-shadow: 0 0 14px rgba(239, 68, 68, 0.9); }
}

.shb-summary {
    color: #969696;
    font-size: 0.78rem;
    white-space: nowrap;
}

.shb-count-ok {
    color: #22c55e;
    font-weight: 700;
}

/* Recent Errors */
.recent-errors-zone {
    padding: 0 5px;
}

.no-errors {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #22c55e;
    font-size: 0.85rem;
    padding: 8px 12px;
    background: rgba(34, 197, 94, 0.08);
    border-radius: 6px;
}

.no-errors-icon {
    font-size: 1rem;
    font-weight: 700;
}

.error-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.error-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
    border-radius: 6px;
    background: rgba(239, 68, 68, 0.06);
    border-left: 3px solid rgba(239, 68, 68, 0.5);
}

.err-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #ef4444;
    flex-shrink: 0;
}

.err-service {
    color: #ef4444;
    font-size: 0.78rem;
    font-weight: 600;
    white-space: nowrap;
    min-width: 100px;
}

.err-msg {
    color: #cccccc;
    font-size: 0.78rem;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.err-time {
    color: #969696;
    font-size: 0.72rem;
    white-space: nowrap;
}
</style>