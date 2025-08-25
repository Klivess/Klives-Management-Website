<template>
    <div class="meme-scraper-container">
        <!-- Modern Header -->
        <div class="page-header">
            <div class="header-left">
                <KMButton style="width: 300px;"
                    message="Back To Schemes"
                    @click="navigateBack"
                />
            </div>
            <div class="header-center">
                <h1 class="page-title">Meme Scraper Analytics</h1>
                <p class="page-subtitle">Instagram content analytics and performance insights</p>
            </div>
            <div class="header-right" style="width: 600px; display: flex; gap: 10px;">
                <KMButton 
                    message="➕ Add Source"
                    @click="showAddSourceModal = true"
                    style="flex: 1;"
                />
                <KMButton 
                    message="🔄 Refresh"
                    @click="fetchAnalytics"
                    :class="{ 'spinning': isLoading }"
                    style="flex: 1;"
                />
            </div>
        </div>

        <!-- Loading Screen (Initial Load) -->
        <div v-show="isLoading && analytics === null" class="loading-overlay">
            <div class="loading-content">
                <div class="loading-spinner"></div>
                <h3 class="loading-title">Loading Analytics</h3>
                <p class="loading-subtitle">Please wait while analytics are produced...</p>
            </div>
        </div>

        <!-- Refresh Loading Overlay (when data already exists) -->
        <div v-if="isLoading && analytics" class="refresh-loading-overlay">
            <div class="refresh-loading-content">
                <div class="refresh-spinner"></div>
                <span class="refresh-text">Refreshing data...</span>
            </div>
        </div>

        <!-- Main Content (hidden when loading initially) -->
        <div v-show="analytics !== null" class="main-content fade-in">
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
                            <span class="stat-value">{{ ((analytics?.SourceDiversityIndex || 0) * 100).toFixed(1) }}%</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Active Sources</span>
                            <span class="stat-value">{{ (analytics?.PercentageOfSourcesWithRecentActivity || 0).toFixed(1) }}%</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Most Active Day</span>
                            <span class="stat-value">{{ formatDate(analytics?.MostActiveDownloadDay || '') }}</span>
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
                            <div class="source-actions">
                                <button 
                                    class="delete-button"
                                    @click="showDeleteConfirmation(source)"
                                    title="Delete source"
                                >
                                    🗑️
                                </button>
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

        <!-- Delete Confirmation Modal -->
        <div v-if="showDeleteModal" class="modal-overlay" @click="closeDeleteModal">
            <div class="modal-content" @click.stop>
                <div class="modal-header">
                    <h3>Confirm Deletion</h3>
                    <button class="modal-close" @click="closeDeleteModal">×</button>
                </div>
                <div class="modal-body">
                    <p>Are you sure you want to delete <strong>@{{ selectedSource?.Username }}</strong>?</p>
                    <div class="delete-options">
                        <KMCheckBox 
                            message="Also delete all associated memes"
                            v-model:boxChecked="deleteAssociatedMemes"
                        />
                    </div>
                </div>
                <div class="modal-actions">
                    <KMButton 
                        message="Cancel"
                        @click="closeDeleteModal"
                        class="cancel-button"
                    />
                    <KMButton 
                        message="Delete"
                        @click="confirmDeleteSource"
                        class="delete-confirm-button"
                        :disabled="isLoading"
                    />
                </div>
            </div>
        </div>

        <!-- Add Instagram Source Modal -->
        <div v-if="showAddSourceModal" class="modal-overlay" @click="closeAddSourceModal">
            <div class="modal-content add-source-modal" @click.stop>
                <div class="modal-header">
                    <h3>Add New Instagram Source</h3>
                    <button class="modal-close" @click="closeAddSourceModal">×</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="username">Instagram Username</label>
                        <input 
                            id="username"
                            type="text" 
                            v-model="newSourceData.username"
                            placeholder="Enter username (without @)"
                            class="form-input"
                            :disabled="isSubmittingSource"
                        />
                    </div>

                    <div class="form-group">
                        <div class="checkbox-group">
                            <KMCheckBox 
                                message="Download Reels"
                                v-model:boxChecked="newSourceData.downloadReels"
                                :disabled="isSubmittingSource"
                            />
                            <KMCheckBox 
                                message="Download Posts"
                                v-model:boxChecked="newSourceData.downloadPosts"
                                :disabled="isSubmittingSource"
                            />
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="niches">Niches</label>
                        <div class="niches-input">
                            <input 
                                id="niches"
                                type="text" 
                                v-model="newNicheInput"
                                placeholder="Enter a niche and press Enter"
                                class="form-input"
                                @keydown.enter.prevent="addNiche"
                                :disabled="isSubmittingSource"
                            />
                        </div>
                        <div class="niches-list" v-if="newSourceData.niches.length > 0">
                            <div 
                                v-for="(niche, index) in newSourceData.niches" 
                                :key="index"
                                class="niche-tag"
                            >
                                <span>{{ niche }}</span>
                                <button 
                                    @click="removeNiche(index)"
                                    class="niche-remove"
                                    :disabled="isSubmittingSource"
                                >×</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-actions">
                    <KMButton 
                        message="Cancel"
                        @click="closeAddSourceModal"
                        class="cancel-button"
                        :disabled="isSubmittingSource"
                    />
                    <KMButton
                        :message="isSubmittingSource ? 'Adding...' : 'Add Source'"
                        @click="submitNewSource"
                        class="submit-button"
                        :disabled="!isFormValid || isSubmittingSource"
                    />
                </div>
            </div>
        </div>
        </div> <!-- End main-content -->
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';
import KMButton from '~/components/KMButton.vue';
import KMCheckBox from '~/components/KMCheckBox.vue';
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
const isLoading = ref<boolean>(true);
const downloadChart = ref<HTMLCanvasElement | null>(null);
let chartInstance: Chart | null = null;

// Delete modal state
const showDeleteModal = ref<boolean>(false);
const selectedSource = ref<InstagramSource | null>(null);
const deleteAssociatedMemes = ref<boolean>(false);

// Add source modal state
const showAddSourceModal = ref<boolean>(false);
const newSourceData = ref({
    username: '',
    downloadReels: true,
    downloadPosts: false,
    niches: [] as string[]
});
const newNicheInput = ref<string>('');
const isSubmittingSource = ref<boolean>(false);

// Navigation functions
const navigateBack = (): void => {
    router.push('/schemes');
};

// Computed properties
const isFormValid = computed((): boolean => {
    return newSourceData.value.username.trim() !== '' && 
           (newSourceData.value.downloadReels || newSourceData.value.downloadPosts);
});

// Add source modal functions
const closeAddSourceModal = (): void => {
    showAddSourceModal.value = false;
    // Reset form data
    newSourceData.value = {
        username: '',
        downloadReels: true,
        downloadPosts: false,
        niches: []
    };
    newNicheInput.value = '';
};

const addNiche = (): void => {
    const niche = newNicheInput.value.trim();
    if (niche && !newSourceData.value.niches.includes(niche)) {
        newSourceData.value.niches.push(niche);
        newNicheInput.value = '';
    }
};

const removeNiche = (index: number): void => {
    newSourceData.value.niches.splice(index, 1);
};

const submitNewSource = async (): Promise<void> => {
    if (!isFormValid.value) return;
    
    isSubmittingSource.value = true;
    
    try {
        const response = await fetch('/api/kliveapi', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                endpoint: '/memescraper/addInstagramSource',
                method: 'POST',
                data: {
                    username: newSourceData.value.username.trim(),
                    downloadReels: newSourceData.value.downloadReels,
                    downloadPosts: newSourceData.value.downloadPosts,
                    niches: newSourceData.value.niches
                }
            })
        });
        
        if (response.ok) {
            await Swal.fire({
                icon: 'success',
                title: 'Success!',
                text: `Instagram source @${newSourceData.value.username} has been added successfully.`,
                confirmButtonColor: '#4d9e39',
                background: '#161516',
                color: '#ffffff'
            });
            
            closeAddSourceModal();
            // Refresh analytics to show new source
            await fetchAnalytics();
        } else {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || 'Failed to add Instagram source');
        }
    } catch (error) {
        console.error('Error adding Instagram source:', error);
        await Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error instanceof Error ? error.message : 'Failed to add Instagram source. Please try again.',
            confirmButtonColor: '#4d9e39',
            background: '#161516',
            color: '#ffffff'
        });
    } finally {
        isSubmittingSource.value = false;
    }
};

// API functions
const fetchAnalytics = async (): Promise<void> => {
    isLoading.value = true;
    
    // Ensure minimum loading time for better UX
    const startTime = Date.now();
    const minLoadingTime = 800; // 800ms minimum
    
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
        // Ensure minimum loading time has passed
        const elapsedTime = Date.now() - startTime;
        const remainingTime = Math.max(0, minLoadingTime - elapsedTime);
        
        if (remainingTime > 0) {
            setTimeout(() => {
                isLoading.value = false;
            }, remainingTime);
        } else {
            isLoading.value = false;
        }
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

// Delete functionality
const showDeleteConfirmation = (source: InstagramSource): void => {
    selectedSource.value = source;
    deleteAssociatedMemes.value = false;
    showDeleteModal.value = true;
};

const closeDeleteModal = (): void => {
    showDeleteModal.value = false;
    selectedSource.value = null;
    deleteAssociatedMemes.value = false;
};

const confirmDeleteSource = async (): Promise<void> => {
    if (!selectedSource.value) return;

    isLoading.value = true;
    
    try {
        const response = await RequestGETFromKliveAPI(
            `/memescraper/deleteInstagramSource?sourceAccountID=${selectedSource.value.AccountID}&deleteAssociatedMemes=${deleteAssociatedMemes.value ? 'true' : 'false'}`
        );
        
        if (response.ok) {
            Swal.fire({
                icon: 'success',
                title: 'Success',
                text: `@${selectedSource.value.Username} has been deleted successfully.`,
                confirmButtonColor: '#4d9e39',
                background: '#161516',
                color: '#ffffff'
            });
            
            // Close modal
            closeDeleteModal();
            
            // Refresh analytics data
            await fetchAnalytics();
        } else {
            throw new Error('Failed to delete source');
        }
    } catch (error) {
        console.error('Error deleting source:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Failed to delete the Instagram source. Please try again.',
            confirmButtonColor: '#4d9e39',
            background: '#161516',
            color: '#ffffff'
        });
    } finally {
        isLoading.value = false;
    }
};

// Lifecycle hooks
onMounted(() => {
    fetchAnalytics();
});
</script>

<style scoped>
.meme-scraper-container {
    padding: 24px;
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

.source-actions {
    display: flex;
    align-items: center;
    gap: 8px;
}

.delete-button {
    background: rgba(220, 53, 69, 0.2);
    border: 1px solid rgba(220, 53, 69, 0.3);
    color: #dc3545;
    padding: 8px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 1rem;
    transition: all 0.3s ease;
}

.delete-button:hover {
    background: rgba(220, 53, 69, 0.3);
    transform: scale(1.05);
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

@keyframes fadeIn {
    from { 
        opacity: 0; 
        transform: translateY(20px); 
    }
    to { 
        opacity: 1; 
        transform: translateY(0); 
    }
}

.fade-in {
    animation: fadeIn 0.6s ease-out;
}

/* Loading Screen Styles */
.loading-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
    backdrop-filter: blur(10px);
    overflow: hidden;
}

.loading-content {
    text-align: center;
    padding: 30px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 20px;
    border: 1px solid rgba(77, 158, 57, 0.3);
    backdrop-filter: blur(10px);
    max-width: 350px;
    width: 85%;
    max-height: 80vh;
    overflow: hidden;
}

.loading-spinner {
    width: 50px;
    height: 50px;
    border: 3px solid rgba(77, 158, 57, 0.2);
    border-top: 3px solid #4d9e39;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 16px auto;
}

.loading-title {
    color: #4d9e39;
    font-size: 1.3rem;
    font-weight: 600;
    margin: 0 0 8px 0;
}

.loading-subtitle {
    color: #cccccc;
    font-size: 0.9rem;
    margin: 0;
    opacity: 0.8;
}

.loading-tips {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 24px;
}

.loading-tip {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    background: rgba(77, 158, 57, 0.1);
    border-radius: 8px;
    border: 1px solid rgba(77, 158, 57, 0.2);
}

.tip-icon {
    font-size: 1.2rem;
}

.tip-text {
    color: #cccccc;
    font-size: 0.9rem;
    flex: 1;
}

/* Pulse animation for loading text */
@keyframes pulse {
    0%, 100% { opacity: 0.8; }
    50% { opacity: 1; }
}

.loading-subtitle {
    animation: pulse 2s infinite;
}

/* Staggered animation for loading tips */
.loading-tip:nth-child(1) { animation: pulse 2s infinite 0s; }
.loading-tip:nth-child(2) { animation: pulse 2s infinite 0.5s; }
.loading-tip:nth-child(3) { animation: pulse 2s infinite 1s; }

/* Refresh Loading Styles */
.refresh-loading-overlay {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 998;
    background: rgba(77, 158, 57, 0.9);
    border-radius: 12px;
    padding: 16px 20px;
    border: 1px solid rgba(77, 158, 57, 0.3);
    backdrop-filter: blur(10px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.refresh-loading-content {
    display: flex;
    align-items: center;
    gap: 12px;
}

.refresh-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top: 2px solid #ffffff;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

.refresh-text {
    color: #ffffff;
    font-size: 0.9rem;
    font-weight: 500;
}

/* Modal Styles */
.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    backdrop-filter: blur(5px);
}

.modal-content {
    background: #161516;
    border-radius: 16px;
    padding: 0;
    max-width: 500px;
    width: 90%;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 24px 24px 0 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding-bottom: 16px;
    margin-bottom: 24px;
}

.modal-header h3 {
    color: #dc3545;
    margin: 0;
    font-size: 1.3rem;
    font-weight: 600;
}

.modal-close {
    background: none;
    border: none;
    color: #cccccc;
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.3s ease;
}

.modal-close:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
}

.modal-body {
    padding: 0 24px 24px 24px;
}

.modal-body p {
    color: #ffffff;
    margin: 0 0 16px 0;
    font-size: 1rem;
}

.delete-options {
    margin: 16px 0;
}

.modal-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    padding: 16px 24px 24px 24px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.cancel-button {
    background: rgba(255, 255, 255, 0.1) !important;
    color: #cccccc !important;
}

.cancel-button:hover {
    background: rgba(255, 255, 255, 0.2) !important;
}

.delete-confirm-button {
    background: #dc3545 !important;
    color: #ffffff !important;
}

.delete-confirm-button:hover {
    background: #c82333 !important;
}

.delete-confirm-button:disabled {
    background: rgba(220, 53, 69, 0.5) !important;
    cursor: not-allowed;
}

/* Add Source Modal Styles */
.add-source-modal {
    max-width: 500px;
    width: 90%;
}

.form-group {
    margin-bottom: 20px;
}

.form-group label {
    display: block;
    color: #4d9e39;
    font-weight: 600;
    margin-bottom: 8px;
    font-size: 0.95rem;
}

.form-input {
    width: 100%;
    padding: 12px 16px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(77, 158, 57, 0.3);
    border-radius: 8px;
    color: #ffffff;
    font-size: 1rem;
    transition: all 0.3s ease;
    box-sizing: border-box;
}

.form-input:focus {
    outline: none;
    border-color: #4d9e39;
    background: rgba(255, 255, 255, 0.08);
    box-shadow: 0 0 0 2px rgba(77, 158, 57, 0.2);
}

.form-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.form-input::placeholder {
    color: rgba(255, 255, 255, 0.5);
}

.checkbox-group {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.niches-input {
    position: relative;
}

.niches-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
}

.niche-tag {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: rgba(77, 158, 57, 0.2);
    border: 1px solid rgba(77, 158, 57, 0.4);
    border-radius: 20px;
    color: #ffffff;
    font-size: 0.9rem;
}

.niche-remove {
    background: none;
    border: none;
    color: #ffffff;
    cursor: pointer;
    font-size: 1.2rem;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.2s ease;
}

.niche-remove:hover {
    background: rgba(255, 255, 255, 0.2);
    color: #ff4444;
}

.niche-remove:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.submit-button {
    background: #4d9e39 !important;
    color: #ffffff !important;
}

.submit-button:hover:not(:disabled) {
    background: #3a7a2b !important;
}

.submit-button:disabled {
    background: rgba(77, 158, 57, 0.5) !important;
    cursor: not-allowed;
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
    
    .modal-content {
        margin: 20px;
        width: calc(100% - 40px);
    }
    
    .modal-actions {
        flex-direction: column;
    }
    
    .loading-content {
        margin: 20px;
        width: calc(100% - 40px);
        padding: 30px 20px;
    }
    
    .loading-tips {
        gap: 8px;
    }
    
    .loading-tip {
        padding: 6px 12px;
    }
    
    .refresh-loading-overlay {
        top: 10px;
        right: 10px;
        padding: 12px 16px;
    }
    
    .refresh-text {
        font-size: 0.8rem;
    }
}
</style>
