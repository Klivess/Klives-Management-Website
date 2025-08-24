<template>
    <div class="meme-scraper-container">
        <!-- Modern Header -->
        <div class="page-header">
            <div class="header-left">
                <KMButton style="width: 200px;"
                    message="Back To Schemes"
                    @click="navigateBack"
                />
            </div>
            <div class="header-center">
                <h1 class="page-title">Meme Scraper Analytics</h1>
                <p class="page-subtitle">Instagram content analytics and performance insights</p>
            </div>
            <div class="header-right">
                <KMButton 
                    message="🔄 Refresh"
                    @click="fetchAnalytics"
                    :class="{ 'spinning': isLoading }"
                />
            </div>
        </div>

        <!-- Key Metrics Overview -->
        <MemescraperOverviewSection 
            title="Key Metrics"
            subtitle="High-level performance indicators and statistics"
        >
            <div class="metrics-grid">
                <div class="metric-card primary">
                    <div class="metric-icon">📱</div>
                    <div class="metric-info">
                        <h3>Total Sources</h3>
                        <p class="metric-value">{{ analytics?.InstagramSources?.length || 0 }}</p>
                        <span class="metric-label">Instagram accounts monitored</span>
                    </div>
                </div>
                <div class="metric-card success">
                    <div class="metric-icon">🎬</div>
                    <div class="metric-info">
                        <h3>Reels Downloaded</h3>
                        <p class="metric-value">{{ analytics?.InstagramReelsDownloaded?.length || 0 }}</p>
                        <span class="metric-label">Content pieces collected</span>
                    </div>
                </div>
                <div class="metric-card info">
                    <div class="metric-icon">👁️</div>
                    <div class="metric-info">
                        <h3>Total Views</h3>
                        <p class="metric-value">{{ formatNumber(analytics?.TotalViewCount || 0) }}</p>
                        <span class="metric-label">Across all content</span>
                    </div>
                </div>
                <div class="metric-card warning">
                    <div class="metric-icon">📊</div>
                    <div class="metric-info">
                        <h3>Avg Views/Reel</h3>
                        <p class="metric-value">{{ formatNumber(Math.round(analytics?.AverageViewCountPerReel || 0)) }}</p>
                        <span class="metric-label">Performance average</span>
                    </div>
                </div>
            </div>
        </MemescraperOverviewSection>

        <!-- Download Activity Chart -->
        <MemescraperOverviewSection 
            title="Download Activity"
            subtitle="Daily meme download trends over time"
        >
            <div class="chart-container">
                <canvas ref="downloadChart" class="download-chart"></canvas>
            </div>
        </MemescraperOverviewSection>

        <!-- Source Performance Analysis -->
        <MemescraperOverviewSection 
            title="Source Performance"
            subtitle="Downloads per source and source diversity metrics"
        >
            <div class="performance-grid">
                <div class="performance-card">
                    <h4>Downloads by Source</h4>
                    <div class="source-downloads">
                        <div 
                            v-for="(count, source) in analytics?.ReelsDownloadedPerSource" 
                            :key="source"
                            class="source-download-item"
                        >
                            <span class="source-name">@{{ source }}</span>
                            <span class="download-count">{{ count }}</span>
                        </div>
                    </div>
                </div>
                <div class="performance-card">
                    <h4>Source Diversity</h4>
                    <div class="diversity-stats">
                        <div class="stat-item">
                            <span class="stat-label">Diversity Index</span>
                            <span class="stat-value">{{ (analytics?.SourceDiversityIndex * 100).toFixed(1) }}%</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Active Sources</span>
                            <span class="stat-value">{{ analytics?.PercentageOfSourcesWithRecentActivity.toFixed(1) }}%</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Most Active Day</span>
                            <span class="stat-value">{{ formatDate(analytics?.MostActiveDownloadDay) }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </MemescraperOverviewSection>

        <!-- Top Content Niches -->
        <MemescraperOverviewSection 
            title="Content Categories"
            subtitle="Most popular niches and content distribution"
        >
            <div class="niches-container">
                <div class="niche-stats">
                    <div 
                        v-for="(count, niche) in analytics?.TopNichesByDownload" 
                        :key="niche"
                        class="niche-item"
                    >
                        <span class="niche-name">{{ niche }}</span>
                        <div class="niche-bar">
                            <div 
                                class="niche-progress" 
                                :style="{ width: getNichePercentage(count) + '%' }"
                            ></div>
                        </div>
                        <span class="niche-count">{{ count }}</span>
                    </div>
                </div>
            </div>
        </MemescraperOverviewSection>

        <!-- Instagram Sources Grid -->
        <MemescraperOverviewSection 
            title="Instagram Sources"
            subtitle="Detailed view of all monitored Instagram accounts"
        >
            <div class="sources-container">
                <div v-if="!analytics?.InstagramSources?.length" class="no-sources">
                    <div class="no-sources-icon">📭</div>
                    <p>No Instagram sources found.</p>
                </div>
                <div v-else class="sources-grid">
                    <div 
                        v-for="source in analytics.InstagramSources" 
                        :key="source.SourceID"
                        class="source-card"
                        :class="{ 'inactive': isInactiveSource(source) }"
                    >
                        <div class="source-header">
                            <img 
                                :src="source.ProfilePictureUrl" 
                                :alt="`${source.Username} profile picture`"
                                class="profile-image"
                                @error="handleImageError"
                            />
                            <div class="source-info">
                                <h3 class="username">@{{ source.Username }}</h3>
                                <p class="full-name">{{ source.FullName }}</p>
                                <p class="followers">{{ formatNumber(source.Followers) }} followers</p>
                            </div>
                            <div class="source-status">
                                <span 
                                    class="status-badge" 
                                    :class="{ 
                                        'active': !isInactiveSource(source), 
                                        'inactive': isInactiveSource(source) 
                                    }"
                                >
                                    {{ isInactiveSource(source) ? 'Inactive' : 'Active' }}
                                </span>
                            </div>
                        </div>
                        
                        <div class="source-engagement">
                            <div class="engagement-item">
                                <span class="engagement-label">Avg. Likes</span>
                                <span class="engagement-value">{{ formatNumber(source.AverageLikes) }}</span>
                            </div>
                            <div class="engagement-item">
                                <span class="engagement-label">Avg. Comments</span>
                                <span class="engagement-value">{{ formatNumber(source.AverageComments) }}</span>
                            </div>
                        </div>

                        <div class="source-config">
                            <div class="config-item">
                                <span class="config-label">Download Reels</span>
                                <span :class="['config-value', source.DownloadReels ? 'enabled' : 'disabled']">
                                    {{ source.DownloadReels ? '✓ Enabled' : '✗ Disabled' }}
                                </span>
                            </div>
                            <div class="config-item">
                                <span class="config-label">Download Posts</span>
                                <span :class="['config-value', source.DownloadPosts ? 'enabled' : 'disabled']">
                                    {{ source.DownloadPosts ? '✓ Enabled' : '✗ Disabled' }}
                                </span>
                            </div>
                        </div>

                        <div class="source-niches">
                            <div class="niches-header">
                                <span class="niches-label">Niches</span>
                            </div>
                            <div class="niches-tags">
                                <span 
                                    v-for="niche in source.Niches" 
                                    :key="niche.NicheTagName"
                                    class="niche-tag"
                                >
                                    {{ niche.NicheTagName }}
                                </span>
                            </div>
                        </div>

                        <div class="source-dates">
                            <div class="date-item">
                                <span class="date-label">Added</span>
                                <span class="date-value">{{ formatDate(source.DateTimeAdded) }}</span>
                            </div>
                            <div class="date-item">
                                <span class="date-label">Last Scraped</span>
                                <span class="date-value">{{ formatDate(source.LastScraped) }}</span>
                            </div>
                        </div>

                        <div v-if="source.AccountTopHashtags?.length > 0" class="source-hashtags">
                            <div class="hashtags-header">
                                <span class="hashtags-label">Top Hashtags</span>
                            </div>
                            <div class="hashtags-list">
                                <span 
                                    v-for="hashtag in source.AccountTopHashtags.slice(0, 5)" 
                                    :key="hashtag.Hashtag"
                                    class="hashtag-tag"
                                >
                                    #{{ hashtag.Hashtag }} ({{ hashtag.Count }})
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </MemescraperOverviewSection>

        <!-- High Engagement Content -->
        <MemescraperOverviewSection 
            title="High Engagement Content"
            subtitle="Top performing reels with highest view counts"
        >
            <div class="high-engagement-content">
                <div v-if="!analytics?.ReelsWithHighEngagement?.length" class="no-content">
                    <p>No high engagement content found.</p>
                </div>
                <div v-else class="reels-grid">
                    <div 
                        v-for="reel in analytics.ReelsWithHighEngagement.slice(0, 6)" 
                        :key="reel.PostID"
                        class="reel-card"
                    >
                        <div class="reel-header">
                            <span class="reel-owner">@{{ reel.OwnerUsername }}</span>
                            <a :href="reel.ShortURL" target="_blank" class="reel-link">
                                View on Instagram
                            </a>
                        </div>
                        <div class="reel-stats">
                            <div class="stat">
                                <span class="stat-icon">👁️</span>
                                <span class="stat-text">{{ formatNumber(reel.ViewCount) }}</span>
                            </div>
                            <div class="stat">
                                <span class="stat-icon">💬</span>
                                <span class="stat-text">{{ reel.CommentCount }}</span>
                            </div>
                        </div>
                        <div class="reel-date">
                            {{ formatDate(reel.CreatedAt) }}
                        </div>
                        <div v-if="reel.Description" class="reel-description">
                            {{ reel.Description }}
                        </div>
                    </div>
                </div>
            </div>
        </MemescraperOverviewSection>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';
import KMButton from '~/components/KMButton.vue';
import MemescraperOverviewSection from '~/components/MemescraperOverviewSection.vue';
import Swal from 'sweetalert2';
import Chart from 'chart.js/auto';

definePageMeta({ layout: 'navbar' });

// Define TypeScript interfaces for the new analytics data structure
interface Hashtag {
    Hashtag: string;
    Count: number;
    InflactHashtagUrl: string | null;
}

interface Niche {
    NicheTagName: string;
    CreatedAt: string;
    LastUpdated: string;
}

interface InstagramSource {
    Username: string;
    Followers: number;
    AccountID: string;
    FullName: string;
    ProfilePictureUrl: string;
    Bio: string;
    DownloadReels: boolean;
    DownloadPosts: boolean;
    AverageLikes: number;
    AverageComments: number;
    AccountTopHashtags: Hashtag[];
    SourceID: string;
    DateTimeAdded: string;
    LastScraped: string;
    LastUpdated: string;
    Niches: Niche[];
}

interface InstagramReel {
    PostID: string;
    OwnerUsername: string;
    OwnerID: string;
    ViewCount: number;
    CreatedAt: string;
    ShortURL: string;
    VideoDownloadURL: string;
    CommentCount: number;
    Description: string | null;
    ShortCode: string;
    InstagramReelInfoFilePath: string;
    InstagramReelVideoFilePath: string;
    DateTimeReelDownloaded: string;
}

interface MemeScraperAnalytics {
    InstagramSources: InstagramSource[];
    InstagramReelsDownloaded: InstagramReel[];
    TotalViewCount: number;
    AverageViewCountPerReel: number;
    MemesDownloadedPerDay: Record<string, number>;
    ReelsDownloadedPerSource: Record<string, number>;
    MostActiveDownloadDay: string;
    InactiveSources: InstagramSource[];
    GrowthRateOfDownloads: number;
    SourceDiversityIndex: number;
    TopNichesByDownload: Record<string, number>;
    ReelsWithHighEngagement: InstagramReel[];
    DownloadGaps: number;
    ReelsPerSourceStdDev: number;
    PercentageOfSourcesWithRecentActivity: number;
    ReelsWithMissingMetadata: InstagramReel[];
    MostCommonDownloadDayOfWeek: number;
    ReelsWithNoViews: InstagramReel[];
}

// Router for navigation
const router = useRouter();

// Reactive data
const analytics = ref<MemeScraperAnalytics | null>(null);
const isLoading = ref<boolean>(false);
const downloadChart = ref<HTMLCanvasElement | null>(null);
let chartInstance: Chart | null = null;

// Navigation functions
const navigateBack = (): void => {
    router.push('/schemes');
};

// API functions
const fetchAnalytics = async (): Promise<void> => {
    isLoading.value = true;
    
    try {
        const response = await RequestGETFromKliveAPI('/memescraper/memeScraperAnalytics');
        if (response.ok) {
            const data: MemeScraperAnalytics = await response.json();
            analytics.value = data;
            
            // Update chart after data is loaded
            await nextTick();
            updateDownloadChart();
        } else {
            throw new Error('Failed to fetch analytics');
        }
    } catch (error) {
        console.error('Error fetching analytics:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Failed to fetch analytics data. Please try again.',
            confirmButtonColor: '#4d9e39',
            background: '#161516',
            color: '#ffffff'
        });
    } finally {
        isLoading.value = false;
    }
};

// Chart functions
const updateDownloadChart = (): void => {
    if (!downloadChart.value || !analytics.value?.MemesDownloadedPerDay) return;

    const ctx = downloadChart.value.getContext('2d');
    if (!ctx) return;

    // Destroy existing chart if it exists
    if (chartInstance) {
        chartInstance.destroy();
    }

    // Prepare chart data
    const dates = Object.keys(analytics.value.MemesDownloadedPerDay).sort();
    const counts = dates.map(date => analytics.value!.MemesDownloadedPerDay[date]);

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates.map(date => new Date(date).toLocaleDateString()),
            datasets: [{
                label: 'Memes Downloaded',
                data: counts,
                borderColor: '#4d9e39',
                backgroundColor: 'rgba(77, 158, 57, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#ffffff'
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#ffffff'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                },
                y: {
                    ticks: {
                        color: '#ffffff'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                }
            }
        }
    });
};

// Utility functions
const formatNumber = (num: number): string => {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
};

const formatDate = (dateString: string): string => {
    if (!dateString || dateString === '0001-01-01T00:00:00') {
        return 'Never';
    }
    return new Date(dateString).toLocaleDateString();
};

const handleImageError = (event: Event): void => {
    const target = event.target as HTMLImageElement;
    target.src = '/klivebot.png'; // Fallback image
};

const isInactiveSource = (source: InstagramSource): boolean => {
    return analytics.value?.InactiveSources?.some(inactive => inactive.SourceID === source.SourceID) || false;
};

const getNichePercentage = (count: number): number => {
    if (!analytics.value?.TopNichesByDownload) return 0;
    const maxCount = Math.max(...Object.values(analytics.value.TopNichesByDownload));
    return maxCount > 0 ? (count / maxCount) * 100 : 0;
};

// Lifecycle hooks
onMounted(() => {
    fetchAnalytics();
});
</script>

<style scoped>
.meme-scraper-container {
    padding: 24px;
    background: linear-gradient(135deg, #0a0a0a 0%, #161516 100%);
    min-height: 100vh;
    color: #ffffff;
}

.page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 32px;
    padding: 24px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 16px;
    backdrop-filter: blur(10px);
}

.header-center {
    text-align: center;
}

.page-title {
    font-size: 2.5rem;
    font-weight: 700;
    color: #4d9e39;
    margin: 0;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.page-subtitle {
    font-size: 1.1rem;
    color: #cccccc;
    margin: 8px 0 0 0;
}

.metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 24px;
    margin-bottom: 24px;
}

.metric-card {
    background: rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 24px;
    display: flex;
    align-items: center;
    gap: 16px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    transition: all 0.3s ease;
}

.metric-card:hover {
    transform: translateY(-2px);
    background: rgba(255, 255, 255, 0.12);
}

.metric-card.primary { border-left: 4px solid #4d9e39; }
.metric-card.success { border-left: 4px solid #28a745; }
.metric-card.info { border-left: 4px solid #17a2b8; }
.metric-card.warning { border-left: 4px solid #ffc107; }

.metric-icon {
    font-size: 2.5rem;
    opacity: 0.8;
}

.metric-info h3 {
    color: #ffffff;
    margin: 0 0 8px 0;
    font-size: 1.1rem;
    font-weight: 600;
}

.metric-value {
    font-size: 2.2rem;
    font-weight: 700;
    color: #4d9e39;
    margin: 0;
    line-height: 1;
}

.metric-label {
    font-size: 0.9rem;
    color: #cccccc;
}

.chart-container {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 16px;
    padding: 24px;
    height: 400px;
}

.download-chart {
    width: 100% !important;
    height: 100% !important;
}

.performance-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
}

.performance-card {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 16px;
    padding: 24px;
}

.performance-card h4 {
    color: #4d9e39;
    margin: 0 0 16px 0;
    font-size: 1.3rem;
}

.source-downloads {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.source-download-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
}

.source-name {
    color: #ffffff;
    font-weight: 500;
}

.download-count {
    color: #4d9e39;
    font-weight: 600;
}

.diversity-stats {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.stat-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.stat-label {
    color: #cccccc;
}

.stat-value {
    color: #4d9e39;
    font-weight: 600;
}

.niches-container {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 16px;
    padding: 24px;
}

.niche-stats {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.niche-item {
    display: grid;
    grid-template-columns: 150px 1fr 80px;
    gap: 16px;
    align-items: center;
}

.niche-name {
    color: #ffffff;
    font-weight: 500;
    text-transform: capitalize;
}

.niche-bar {
    height: 8px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    overflow: hidden;
}

.niche-progress {
    height: 100%;
    background: linear-gradient(90deg, #4d9e39, #28a745);
    transition: width 0.5s ease;
}

.niche-count {
    color: #4d9e39;
    font-weight: 600;
    text-align: right;
}

.sources-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    gap: 24px;
}

.source-card {
    background: rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 24px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    transition: all 0.3s ease;
}

.source-card:hover {
    transform: translateY(-2px);
    background: rgba(255, 255, 255, 0.12);
}

.source-card.inactive {
    opacity: 0.6;
    border-left: 4px solid #dc3545;
}

.source-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 16px;
}

.profile-image {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid #4d9e39;
}

.source-info {
    flex: 1;
}

.username {
    color: #4d9e39;
    margin: 0 0 4px 0;
    font-size: 1.1rem;
    font-weight: 600;
}

.full-name {
    color: #ffffff;
    margin: 0 0 4px 0;
    font-size: 0.9rem;
}

.followers {
    color: #cccccc;
    margin: 0;
    font-size: 0.85rem;
}

.source-status {
    display: flex;
    align-items: center;
}

.status-badge {
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 0.8rem;
    font-weight: 600;
}

.status-badge.active {
    background: rgba(40, 167, 69, 0.2);
    color: #28a745;
}

.status-badge.inactive {
    background: rgba(220, 53, 69, 0.2);
    color: #dc3545;
}

.source-engagement, .source-config, .source-dates {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin: 16px 0;
}

.engagement-item, .config-item, .date-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.engagement-label, .config-label, .date-label {
    color: #cccccc;
    font-size: 0.85rem;
}

.engagement-value, .date-value {
    color: #ffffff;
    font-weight: 500;
}

.config-value.enabled {
    color: #28a745;
}

.config-value.disabled {
    color: #dc3545;
}

.source-niches, .source-hashtags {
    margin-top: 16px;
}

.niches-header, .hashtags-header {
    margin-bottom: 8px;
}

.niches-label, .hashtags-label {
    color: #cccccc;
    font-size: 0.9rem;
    font-weight: 500;
}

.niches-tags, .hashtags-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.niche-tag, .hashtag-tag {
    background: rgba(77, 158, 57, 0.2);
    color: #4d9e39;
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 0.8rem;
}

.reels-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 20px;
}

.reel-card {
    background: rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 16px;
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.reel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
}

.reel-owner {
    color: #4d9e39;
    font-weight: 600;
}

.reel-link {
    color: #17a2b8;
    text-decoration: none;
    font-size: 0.9rem;
}

.reel-link:hover {
    text-decoration: underline;
}

.reel-stats {
    display: flex;
    gap: 16px;
    margin-bottom: 8px;
}

.stat {
    display: flex;
    align-items: center;
    gap: 4px;
}

.stat-icon {
    font-size: 1.1rem;
}

.stat-text {
    color: #ffffff;
    font-weight: 500;
}

.reel-date {
    color: #cccccc;
    font-size: 0.85rem;
    margin-bottom: 8px;
}

.reel-description {
    color: #ffffff;
    font-size: 0.9rem;
    line-height: 1.4;
}

.no-sources, .no-content {
    text-align: center;
    padding: 40px;
    color: #cccccc;
}

.no-sources-icon {
    font-size: 4rem;
    margin-bottom: 16px;
}

.spinning {
    animation: spin 1s linear infinite;
}

@keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}

@media (max-width: 768px) {
    .page-header {
        flex-direction: column;
        gap: 16px;
        text-align: center;
    }
    
    .performance-grid {
        grid-template-columns: 1fr;
    }
    
    .sources-grid {
        grid-template-columns: 1fr;
    }
    
    .niche-item {
        grid-template-columns: 1fr;
        gap: 8px;
    }
}
</style>
