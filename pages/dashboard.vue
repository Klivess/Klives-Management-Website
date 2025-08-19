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
        <KMInfoGrid columns="4" rows="1" rowHeight="180" style="padding-bottom: 30px;">
            <QuickActionCard
                title="Bot Logs"
                description="Monitor system events and bot activities"
                icon="📋"
                actionText="View Logs"
                variant="info"
                to="/administration/botlogs"
            />
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
            <QuickActionCard
                title="User Profiles"
                description="Manage user accounts and permissions"
                icon="👥"
                :value="adminStats.hasAccess ? adminStats.totalProfiles : (adminStats.totalProfiles === 'Restricted' ? null : adminStats.totalProfiles)"
                format="count"
                :actionText="adminStats.hasAccess ? 'Manage Users' : (adminStats.totalProfiles === 'Restricted' ? 'Access Restricted' : 'Manage Users')"
                :variant="adminStats.hasAccess ? 'warning' : (adminStats.totalProfiles === 'Restricted' ? 'danger' : 'warning')"
                :to="adminStats.hasAccess ? '/admin' : (adminStats.totalProfiles === 'Restricted' ? null : '/admin')"
                :onClick="adminStats.hasAccess ? null : (adminStats.totalProfiles === 'Restricted' ? showAccessDeniedMessage : null)"
            />
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
                <div class="schemes-overview">
                    <div class="scheme-cards">
                        <div class="scheme-card cs2-card" @click="navigateToScheme('/schemery/cs2arbitragebot')">
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
                        
                        <div class="scheme-card memescraper-card" @click="navigateToScheme('/schemery/memescraper')">
                            <div class="scheme-header">
                                <h3>Meme Scraper</h3>
                                <div class="scheme-status active">Active</div>
                            </div>
                            <div class="scheme-metrics">
                                <div class="metric">
                                    <span class="metric-label">Instagram Sources</span>
                                    <span class="metric-value">{{ memescraperStats.totalSources }}</span>
                                </div>
                                <div class="metric">
                                    <span class="metric-label">Memes Collected</span>
                                    <span class="metric-value">{{ memescraperStats.totalMemes }}</span>
                                </div>
                                <div class="metric">
                                    <span class="metric-label">Active Niches</span>
                                    <span class="metric-value">{{ memescraperStats.activeNiches }}</span>
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

        <!-- Bot Operations and KliveTech Status -->
        <KMInfoGrid columns="2" rows="1" rowHeight="420">
            <KMInfoBox caption="Bot Operations">
                <div class="bot-operations">
                    <div class="bot-stats">
                        <h4>Bot Statistics</h4>
                        <div class="bot-metrics">
                            <CS2MetricCard
                                :value="botStats.activeBots === 'Restricted' ? 'Restricted' : botStats.activeBots"
                                label="Active Bots"
                                format="count"
                                :variant="botStats.activeBots === 'Restricted' ? 'danger' : 'success'"
                            />
                            <CS2MetricCard
                                :value="botStats.totalOperations === 'Restricted' ? 'Restricted' : botStats.totalOperations"
                                label="Total Operations"
                                format="count"
                                :variant="botStats.totalOperations === 'Restricted' ? 'danger' : 'info'"
                            />
                            <CS2MetricCard
                                :value="botStats.completedTasks === 'Restricted' ? 'Restricted' : botStats.completedTasks"
                                label="Completed Tasks"
                                format="count"
                                :variant="botStats.completedTasks === 'Restricted' ? 'danger' : 'success'"
                            />
                            <CS2MetricCard
                                :value="botStats.successfulOperations === 'Restricted' ? 'Restricted' : `${Math.round(botStats.successfulOperations / Math.max(botStats.totalOperations, 1) * 100)}%`"
                                label="Success Rate"
                                format="text"
                                :variant="botStats.successfulOperations === 'Restricted' ? 'danger' : 
                                    (botStats.successfulOperations / Math.max(botStats.totalOperations, 1) > 0.8 ? 'success' : 
                                     botStats.successfulOperations / Math.max(botStats.totalOperations, 1) > 0.5 ? 'warning' : 'danger')"
                            />
                        </div>
                    </div>
                    <div class="recent-activity">
                        <h4>Recent Activity</h4>
                        <div class="activity-list" v-if="recentActivities.length > 0">
                            <div v-for="activity in recentActivities" :key="activity.id" 
                                 :class="['activity-item', { 'restricted': systemStats.totalLogs === 'Restricted' && activity.id === 1 }]">
                                <span class="activity-time">{{ formatTime(activity.time) }}</span>
                                <span class="activity-text">{{ activity.description }}</span>
                            </div>
                        </div>
                        <div v-else class="no-activity">
                            <span class="no-data-text">No recent activity data available</span>
                        </div>
                    </div>
                </div>
            </KMInfoBox>
            
            <KMInfoBox caption="KliveTech Network">
                <div class="klivetech-overview">
                    <div class="device-stats">
                        <CS2MetricCard
                            :value="kliveTechStats.connectedDevices === 'Restricted' ? 'Restricted' : kliveTechStats.connectedDevices"
                            label="Connected Devices"
                            format="count"
                            :variant="kliveTechStats.connectedDevices === 'Restricted' ? 'danger' : 'success'"
                        />
                        <CS2MetricCard
                            :value="kliveTechStats.onlineDevices === 'Restricted' ? 'Restricted' : kliveTechStats.onlineDevices"
                            label="Online Devices"
                            format="count"
                            :variant="kliveTechStats.onlineDevices === 'Restricted' ? 'danger' : (kliveTechStats.onlineDevices === kliveTechStats.connectedDevices ? 'success' : 'warning')"
                        />
                    </div>
                    <div class="device-actions">
                        <KMButton 
                            :message="kliveTechStats.connectedDevices === 'Restricted' ? 'Access Restricted' : 'Refresh All Devices'"
                            :textColor="kliveTechStats.connectedDevices === 'Restricted' ? '#ef4444' : '#4d9e39'"
                            @click="kliveTechStats.connectedDevices === 'Restricted' ? showAccessDeniedMessage : refreshKliveTechDevices"
                            style="width: 100%; height: 50px; margin-bottom: 15px;"
                        />
                        <KMButton 
                            :message="kliveTechStats.connectedDevices === 'Restricted' ? 'Access Restricted' : 'View Device Dashboard'"
                            :textColor="kliveTechStats.connectedDevices === 'Restricted' ? '#ef4444' : '#4d9e39'"
                            @click="kliveTechStats.connectedDevices === 'Restricted' ? showAccessDeniedMessage : navigateToScheme('/klivetech')"
                            style="width: 100%; height: 50px;"
                        />
                    </div>
                </div>
            </KMInfoBox>
        </KMInfoGrid>

        <!-- System Administration -->
        <KMInfoGrid columns="3" rows="1" rowHeight="300">
            <KMInfoBox caption="Administration">
                <div class="admin-section">                <CS2MetricCard
                    :value="adminStats.totalProfiles === 'Restricted' ? 'Restricted' : adminStats.totalProfiles"
                    label="User Profiles"
                    format="count"
                    :variant="adminStats.totalProfiles === 'Restricted' ? 'danger' : 'info'"
                />                <div class="admin-actions">
                    <KMButton 
                        :message="adminStats.totalProfiles === 'Restricted' ? 'Access Restricted' : 'Manage Profiles'"
                        :textColor="adminStats.totalProfiles === 'Restricted' ? '#ef4444' : '#4d9e39'"
                        @click="adminStats.totalProfiles === 'Restricted' ? showAccessDeniedMessage() : navigateToScheme('/admin')"
                        style="width: 100%; height: 40px; margin-top: 10px;"
                    />
                </div>
                </div>
            </KMInfoBox>
            
            <KMInfoBox caption="Log Analytics">
                <div class="log-section">
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
                bestFind: 0
            },
            memescraperStats: {
                totalSources: 0,
                totalMemes: 0,
                activeNiches: 0
            },
            botStats: {
                activeBots: 0,
                scheduledTasks: 0,
                completedTasks: 0,
                totalOperations: 0,
                successfulOperations: 0,
                hasAccess: true
            },
            kliveTechStats: {
                connectedDevices: 0,
                onlineDevices: 0,
                hasAccess: true
            },
            adminStats: {
                totalProfiles: 0,
                hasAccess: true
            },
            recentActivities: []
        }
    },
    methods: {
        async loadDashboardData() {
            this.loading = true;
            this.error = null;
            
            try {
                // Load general bot statistics
                await this.loadGeneralStats();
                
                // Load CS2 analytics
                await this.loadCS2Stats();
                
                // Load Meme Scraper stats
                await this.loadMemescraperStats();
                
                // Load KliveTech device data
                await this.loadKliveTechStats();
                
                // Load bot logs for activity feed
                await this.loadRecentActivity();
                
                // Load admin stats
                await this.loadAdminStats();
                
                this.lastUpdate = new Date().toLocaleString();
            } catch (err) {
                console.error('Dashboard data loading error:', err);
                this.error = err;
                this.lastUpdate = 'Error loading data';
            } finally {
                this.loading = false;
            }
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
                    // No fallback data - use zeros
                    this.cs2Stats = {
                        successRate: 0,
                        itemsScanned: 0,
                        bestFind: 0
                    };
                }
            } catch (error) {
                console.log('CS2 stats API unavailable');
                this.cs2Stats = {
                    successRate: 0,
                    itemsScanned: 0,
                    bestFind: 0
                };
            }
        },
        
        async loadMemescraperStats() {
            try {
                const response = await RequestGETFromKliveAPI('/memescraper/getAllInstagramSources', false, false);
                if (response.ok) {
                    const sources = await response.json();
                    
                    // Calculate stats from the sources data
                    const totalMemes = sources.reduce((total, source) => total + (source.MemesCollectedTotal || 0), 0);
                    const uniqueNiches = new Set();
                    sources.forEach(source => {
                        if (source.Niches) {
                            source.Niches.forEach(niche => {
                                uniqueNiches.add(niche.NicheTagName);
                            });
                        }
                    });
                    
                    this.memescraperStats = {
                        totalSources: sources.length,
                        totalMemes: totalMemes,
                        activeNiches: uniqueNiches.size
                    };
                } else {
                    // API not available or no permission
                    this.memescraperStats = {
                        totalSources: 0,
                        totalMemes: 0,
                        activeNiches: 0
                    };
                }
            } catch (error) {
                console.log('Meme Scraper stats API unavailable');
                this.memescraperStats = {
                    totalSources: 0,
                    totalMemes: 0,
                    activeNiches: 0
                };
            }
        },
        
        async loadKliveTechStats() {
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
                    this.kliveTechStats = {
                        connectedDevices: 0,
                        onlineDevices: 0,
                        hasAccess: true
                    };
                }
            } catch (error) {
                console.log('KliveTech API unavailable');
                this.kliveTechStats = {
                    connectedDevices: 0,
                    onlineDevices: 0,
                    hasAccess: true
                };
            }
        },
        
        async loadRecentActivity() {
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
                    
                    // Calculate bot operation statistics from logs
                    this.calculateBotStats(logs);
                } else if (response.status === 401) {
                    // User doesn't have permission to view logs
                    this.recentActivities = [
                        { id: 1, time: new Date(), description: 'Access to detailed logs restricted for your permission level' }
                    ];
                    this.systemStats.totalLogs = 'Restricted';
                    this.systemStats.totalErrors = 'Restricted';
                    this.systemStats.logsAccessible = false;
                    this.botStats = {
                        activeBots: 'Restricted',
                        scheduledTasks: 'Restricted',
                        completedTasks: 'Restricted',
                        totalOperations: 'Restricted',
                        successfulOperations: 'Restricted',
                        hasAccess: false
                    };
                    console.log('Logs access denied - insufficient permissions');
                } else {
                    // No real logs available
                    this.recentActivities = [];
                    this.systemStats.totalLogs = 0;
                    this.systemStats.totalErrors = 0;
                    this.systemStats.logsAccessible = true;
                    this.botStats = {
                        activeBots: 0,
                        scheduledTasks: 0,
                        completedTasks: 0,
                        totalOperations: 0,
                        successfulOperations: 0,
                        hasAccess: true
                    };
                }
            } catch (error) {
                console.log('Logs API unavailable');
                this.recentActivities = [];
                this.systemStats.totalLogs = 0;
                this.systemStats.totalErrors = 0;
                this.systemStats.logsAccessible = true;
                this.botStats = {
                    activeBots: 0,
                    scheduledTasks: 0,
                    completedTasks: 0,
                    totalOperations: 0,
                    successfulOperations: 0,
                    hasAccess: true
                };
            }
        },
        
        calculateBotStats(logs) {
            // Extract unique bot services from logs
            const botServices = [...new Set(logs.map(log => log.serviceName))].filter(name => 
                name && (name.toLowerCase().includes('bot') || 
                        name.toLowerCase().includes('agent') ||
                        name.toLowerCase().includes('scheduler') ||
                        name.toLowerCase().includes('arbitrage'))
            );
            
            // Count operations by looking for operation-type messages
            const operationLogs = logs.filter(log => 
                log.message && (
                    log.message.toLowerCase().includes('completed') ||
                    log.message.toLowerCase().includes('executed') ||
                    log.message.toLowerCase().includes('processed') ||
                    log.message.toLowerCase().includes('finished') ||
                    log.message.toLowerCase().includes('started') ||
                    log.message.toLowerCase().includes('scanning') ||
                    log.message.toLowerCase().includes('searching')
                )
            );
            
            // Count successful operations (non-error logs with completion keywords)
            const successfulOps = operationLogs.filter(log => 
                log.type !== 1 && (
                    log.message.toLowerCase().includes('completed') ||
                    log.message.toLowerCase().includes('finished') ||
                    log.message.toLowerCase().includes('success')
                )
            );
            
            // Count scheduled/task-related logs
            const scheduledLogs = logs.filter(log => 
                log.message && (
                    log.message.toLowerCase().includes('scheduled') ||
                    log.message.toLowerCase().includes('task') ||
                    log.message.toLowerCase().includes('queue')
                )
            );
            
            this.botStats = {
                activeBots: botServices.length,
                scheduledTasks: scheduledLogs.length,
                completedTasks: successfulOps.length,
                totalOperations: operationLogs.length,
                successfulOperations: successfulOps.length,
                hasAccess: true
            };
        },
        
        async loadAdminStats() {
            try {
                const response = await RequestGETFromKliveAPI('/KMProfiles/GetAllProfiles', false, false);
                if (response.ok) {
                    const profiles = await response.json();
                    this.adminStats.totalProfiles = profiles.length;
                    this.adminStats.hasAccess = true;
                } else if (response.status === 401) {
                    // User doesn't have permission to view profiles
                    this.adminStats.totalProfiles = 'Restricted';
                    this.adminStats.hasAccess = false;
                    console.log('Admin stats access denied - insufficient permissions');
                } else {
                    // Other error, no data available
                    this.adminStats.totalProfiles = 'Unavailable';
                    this.adminStats.hasAccess = false;
                }
                
                // Bot stats are now calculated from real log data in loadRecentActivity()
            } catch (error) {
                console.log('Admin stats loading failed:', error);
                this.adminStats.totalProfiles = 'Error';
                this.adminStats.hasAccess = false;
                // Bot stats are now calculated from real log data in loadRecentActivity()
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

/* Bot Operations */
.bot-operations {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.bot-stats {
    background: rgba(77, 158, 57, 0.05);
    border-radius: 8px;
    padding: 15px;
    border: 1px solid rgba(77, 158, 57, 0.2);
}

.bot-stats h4 {
    color: #4d9e39;
    font-size: 1.1rem;
    margin: 0 0 12px 0;
}

.bot-metrics {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
    margin-bottom: 15px;
}

.operation-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
}

.recent-activity {
    flex: 1;
}

.recent-activity h4 {
    color: #4d9e39;
    font-size: 1.1rem;
    margin: 0 0 12px 0;
}

.activity-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 150px;
    overflow-y: auto;
}

.activity-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 12px;
    background: rgba(77, 158, 57, 0.05);
    border-radius: 8px;
    border-left: 3px solid #4d9e39;
}

.activity-time {
    color: #969696;
    font-size: 0.75rem;
}

.activity-text {
    color: #ffffff;
    font-size: 0.85rem;
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

/* Admin Sections */
.admin-section,
.log-section,
.quick-actions {
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
}

.admin-actions,
.log-actions {
    margin-top: auto;
}

.log-metrics {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15px;
    margin-bottom: 15px;
}

.action-buttons {
    display: flex;
    flex-direction: column;
    gap: 10px;
    height: 100%;
    justify-content: center;
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
    
    .operation-stats,
    .device-stats,
    .bot-metrics {
        grid-template-columns: 1fr;
    }
    
    .bot-stats {
        margin-bottom: 15px;
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

/* Activity item styling for restricted access */
.activity-item.restricted {
    border-left-color: #ef4444;
    background: rgba(239, 68, 68, 0.05);
}

.activity-item.restricted .activity-text {
    color: #ef4444;
    font-style: italic;
}
</style>