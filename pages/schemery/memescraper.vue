<template>
    <div class="meme-scraper-container">
        <!-- Modern Header -->
        <div class="page-header">
            <div class="header-left">
                <div class="refresh-button" @click="fetchSources">
                    <KMButton style="width: 400px;"
                        message="Back To Schemes"
                        @click="navigateBack"
                        :class="{ 'spinning': isLoading }"
                    />
                </div>
            </div>
            <div class="header-center">
                <h1 class="page-title">Meme Scraper Dashboard</h1>
                <p class="page-subtitle">Manage Instagram sources and monitor content collection</p>
            </div>
            <div class="header-right">
                <div class="refresh-button" @click="fetchSources">
                    <KMButton 
                        message="🔄 Refresh"
                        :class="{ 'spinning': isLoading }"
                    />
                </div>
            </div>
        </div>

        <!-- Status Overview Section -->
        <MemescraperOverviewSection 
            title="Bot Status"
            subtitle="Current operational status and key metrics"
        >
            <div class="status-grid">
                <div class="status-card active">
                    <div class="status-icon">🤖</div>
                    <div class="status-info">
                        <h3>Bot Status</h3>
                        <p>Active & Monitoring</p>
                    </div>
                </div>
                <div class="status-card">
                    <div class="status-icon">📊</div>
                    <div class="status-info">
                        <h3>Total Sources</h3>
                        <p>{{ instagramSources.length }}</p>
                    </div>
                </div>
                <div class="status-card">
                    <div class="status-icon">📸</div>
                    <div class="status-info">
                        <h3>Total Memes</h3>
                        <p>{{ totalMemes }}</p>
                    </div>
                </div>
                <div class="status-card">
                    <div class="status-icon">🎯</div>
                    <div class="status-info">
                        <h3>Active Niches</h3>
                        <p>{{ uniqueNiches.length }}</p>
                    </div>
                </div>
            </div>
        </MemescraperOverviewSection>

        <!-- Add New Source Section -->
        <MemescraperOverviewSection 
            title="Add Instagram Source"
            subtitle="Configure a new Instagram account to monitor and scrape content"
        >
            <div class="add-source-form">
                <div class="form-grid">
                    <div class="form-group">
                        <label for="username">Instagram Username</label>
                        <KMInputBox 
                            v-model:value="newSource.username"
                            placeholder="Enter username (without @)"
                            type="text"
                        />
                    </div>
                    <div class="form-group">
                        <label>Content Types</label>
                        <div class="checkbox-group">
                            <KMCheckBox 
                                message="Download Reels"
                                v-model:boxChecked="newSource.downloadReels"
                            />
                            <KMCheckBox 
                                message="Download Posts"
                                v-model:boxChecked="newSource.downloadPosts"
                            />
                        </div>
                    </div>
                    <div class="form-group full-width">
                        <label for="niches">Niches (comma-separated)</label>
                        <KMInputBox 
                            v-model:value="newSource.nichesText"
                            placeholder="e.g., relatable, funny, viral"
                            type="text"
                        />
                    </div>
                </div>
                <div class="form-actions">
                    <KMButton 
                        message="Add Source"
                        @click="addInstagramSource"
                        :disabled="!newSource.username || isLoading"
                        class="add-button"
                    />
                </div>
            </div>
        </MemescraperOverviewSection>

        <!-- Instagram Sources Management -->
        <MemescraperOverviewSection 
            title="Instagram Sources"
            subtitle="Manage existing Instagram accounts and their configuration"
        >
            <div class="sources-container">
                <div v-if="instagramSources.length === 0" class="no-sources">
                    <div class="no-sources-icon">📭</div>
                    <p>No Instagram sources configured yet.</p>
                    <p class="subtitle">Add your first source above to get started!</p>
                </div>
                <div v-else class="sources-grid">
                    <div 
                        v-for="source in instagramSources" 
                        :key="source.SourceID"
                        class="source-card"
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
                        
                        <div class="source-stats">
                            <div class="stat-item">
                                <span class="stat-label">Total Memes</span>
                                <span class="stat-value">{{ source.MemesCollectedTotal }}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Video Memes</span>
                                <span class="stat-value">{{ source.VideoMemesCollectedTotal }}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Image Memes</span>
                                <span class="stat-value">{{ source.ImageMemesCollectedTotal }}</span>
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

                        <div v-if="source.AccountTopHashtags.length > 0" class="source-hashtags">
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
                        message="Delete Source"
                        @click="confirmDelete"
                        class="delete-confirm-button"
                    />
                </div>
            </div>
        </div>

        <!-- Loading Overlay -->
        <div v-if="isLoading" class="loading-overlay">
            <div class="loading-spinner"></div>
            <p>{{ loadingMessage }}</p>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import KMButton from '~/components/KMButton.vue';
import KMInputBox from '~/components/KMInputBox.vue';
import KMCheckBox from '~/components/KMCheckBox.vue';
import MemescraperOverviewSection from '~/components/MemescraperOverviewSection.vue';
import Swal from 'sweetalert2';

definePageMeta({ layout: 'navbar' });

// Define TypeScript interfaces
interface Hashtag {
    Hashtag: string;
    Count: number;
    InflactHashtagUrl: string;
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
    MemesCollectedTotal: number;
    VideoMemesCollectedTotal: number;
    ImageMemesCollectedTotal: number;
    DateTimeAdded: string;
    LastScraped: string;
    LastUpdated: string;
    PathsOfAllMemes: string[];
    Niches: Niche[];
}

interface NewSourceForm {
    username: string;
    downloadReels: boolean;
    downloadPosts: boolean;
    nichesText: string;
}

interface AddSourceRequest {
    username: string;
    downloadReels: boolean;
    downloadPosts: boolean;
    niches: string[];
}

// Router for navigation
const router = useRouter();

// Reactive data
const instagramSources = ref<InstagramSource[]>([]);
const isLoading = ref<boolean>(false);
const loadingMessage = ref<string>('Loading...');
const showDeleteModal = ref<boolean>(false);
const selectedSource = ref<InstagramSource | null>(null);
const deleteAssociatedMemes = ref<boolean>(false);

// New source form data
const newSource = ref<NewSourceForm>({
    username: '',
    downloadReels: false,
    downloadPosts: false,
    nichesText: ''
});

// Computed properties
const totalMemes = computed<number>(() => {
    return instagramSources.value.reduce((total, source) => total + source.MemesCollectedTotal, 0);
});

const uniqueNiches = computed<string[]>(() => {
    const niches = new Set<string>();
    instagramSources.value.forEach(source => {
        source.Niches.forEach((niche: Niche) => {
            niches.add(niche.NicheTagName);
        });
    });
    return Array.from(niches);
});

// Navigation functions
const navigateBack = (): void => {
    router.push('/schemes');
};

// API functions
const fetchSources = async (): Promise<void> => {
    isLoading.value = true;
    loadingMessage.value = 'Fetching Instagram sources...';
    
    try {
        const response = await RequestGETFromKliveAPI('/memescraper/getAllInstagramSources');
        if (response.ok) {
            const data: InstagramSource[] = await response.json();
            instagramSources.value = data;
        } else {
            throw new Error('Failed to fetch sources');
        }
    } catch (error) {
        console.error('Error fetching sources:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Failed to fetch Instagram sources. Please try again.',
            confirmButtonColor: '#4d9e39',
            background: '#161516',
            color: '#ffffff'
        });
    } finally {
        isLoading.value = false;
    }
};

const addInstagramSource = async (): Promise<void> => {
    if (!newSource.value.username.trim()) {
        Swal.fire({
            icon: 'warning',
            title: 'Username Required',
            text: 'Please enter an Instagram username.',
            confirmButtonColor: '#4d9e39',
            background: '#161516',
            color: '#ffffff'
        });
        return;
    }

    isLoading.value = true;
    loadingMessage.value = 'Adding Instagram source...';

    try {
        const niches = newSource.value.nichesText
            .split(',')
            .map(niche => niche.trim())
            .filter(niche => niche.length > 0);

        const requestData: AddSourceRequest = {
            username: newSource.value.username.trim(),
            downloadReels: newSource.value.downloadReels,
            downloadPosts: newSource.value.downloadPosts,
            niches: niches
        };

        const response = await RequestPOSTFromKliveAPI(
            '/memescraper/addInstagramSource',
            JSON.stringify(requestData)
        );

        if (response.ok) {
            // Reset form
            newSource.value = {
                username: '',
                downloadReels: false,
                downloadPosts: false,
                nichesText: ''
            };

            // Refresh sources list
            await fetchSources();

            Swal.fire({
                icon: 'success',
                title: 'Source Added',
                text: 'Instagram source has been successfully queued! Will be added to Sources soon when data is fetched.',
                confirmButtonColor: '#4d9e39',
                background: '#161516',
                color: '#ffffff'
            });
        } else {
            throw new Error('Failed to add source');
        }
    } catch (error) {
        console.error('Error adding source:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Failed to add Instagram source. Please try again.',
            confirmButtonColor: '#4d9e39',
            background: '#161516',
            color: '#ffffff'
        });
    } finally {
        isLoading.value = false;
    }
};

// Delete functions
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

const confirmDelete = async (): Promise<void> => {
    if (!selectedSource.value) return;

    isLoading.value = true;
    loadingMessage.value = 'Deleting Instagram source...';
    
    try {
        const response = await RequestGETFromKliveAPI(
            `/memescraper/deleteInstagramSource?sourceAccountID=${selectedSource.value.AccountID}&deleteAssociatedMemes=${deleteAssociatedMemes.value}`
        );

        if (response.ok) {
            closeDeleteModal();
            await fetchSources();

            Swal.fire({
                icon: 'success',
                title: 'Source Deleted',
                text: 'Instagram source has been successfully deleted!',
                confirmButtonColor: '#4d9e39',
                background: '#161516',
                color: '#ffffff'
            });
        } else {
            throw new Error('Failed to delete source');
        }
    } catch (error) {
        console.error('Error deleting source:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Failed to delete Instagram source. Please try again.',
            confirmButtonColor: '#4d9e39',
            background: '#161516',
            color: '#ffffff'
        });
    } finally {
        isLoading.value = false;
    }
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
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const handleImageError = (event: Event): void => {
    const target = event.target as HTMLImageElement;
    target.src = '/klivebot.png'; // Fallback image
};

// Lifecycle
onMounted(() => {
    fetchSources();
});
</script>

<style scoped>
.meme-scraper-container {
    min-height: 100vh;
    background-color: #201f20;
    padding: 2rem 1rem;
}

/* Page Header Styling */
.page-header {
    display: grid;
    grid-template-columns: 1fr 2fr 1fr;
    align-items: center;
    background-color: #161616;
    border-radius: 20px;
    padding: 2rem;
    margin-bottom: 2rem;
    border: 1px solid rgba(77, 158, 57, 0.2);
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    transition: all 0.3s ease;
}

.page-header:hover {
    border-color: rgba(77, 158, 57, 0.4);
    transform: translateY(-2px);
}

.header-left {
    justify-self: start;
}

.header-center {
    text-align: center;
}

.header-right {
    justify-self: end;
}

.page-title {
    font-size: 2.5rem;
    font-weight: 700;
    color: #4d9e39;
    margin: 0 0 0.5rem 0;
    background: linear-gradient(135deg, #4d9e39, #62ce47);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.page-subtitle {
    font-size: 1rem;
    color: #969696;
    margin: 0;
}

.back-button,
.back-button-wrapper,
.refresh-button {
    display: inline-block;
    transition: all 0.3s ease;
    height: 60px;
    width: 180px;
}

.back-button .back-button-wrapper,
.refresh-button .back-button-wrapper {
    height: 100%;
    width: 100%;
}

.back-button:hover,
.refresh-button:hover {
    transform: translateY(-2px);
}

.spinning {
    animation: spin 1s linear infinite;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

/* Status Grid */
.status-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.5rem;
}

.status-card {
    background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
    border-radius: 15px;
    padding: 1.5rem;
    border: 1px solid rgba(77, 158, 57, 0.2);
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    gap: 1rem;
}

.status-card:hover {
    border-color: rgba(77, 158, 57, 0.5);
    transform: translateY(-3px);
    box-shadow: 0 6px 20px rgba(77, 158, 57, 0.1);
}

.status-card.active {
    border-color: #4d9e39;
    background: linear-gradient(135deg, #1a2a1a 0%, #2a3a2a 100%);
}

.status-icon {
    font-size: 2rem;
    width: 50px;
    height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(77, 158, 57, 0.2);
    border-radius: 50%;
}

.status-info h3 {
    margin: 0 0 0.25rem 0;
    color: #ffffff;
    font-size: 1rem;
    font-weight: 600;
}

.status-info p {
    margin: 0;
    color: #4d9e39;
    font-size: 1.2rem;
    font-weight: 700;
}

/* Form Styling */
.add-source-form {
    background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
    border-radius: 15px;
    padding: 2rem;
    border: 1px solid rgba(77, 158, 57, 0.1);
}

.form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
}

.form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.form-group.full-width {
    grid-column: 1 / -1;
}

.form-group label {
    color: #ffffff;
    font-weight: 600;
    font-size: 0.9rem;
    margin-bottom: 0.5rem;
}

.checkbox-group {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.5rem 0;
}

.form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
}

.add-button {
    min-width: 120px;
}

/* Sources Container */
.sources-container {
    min-height: 300px;
}

.no-sources {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem;
    text-align: center;
    color: #969696;
}

.no-sources-icon {
    font-size: 4rem;
    margin-bottom: 1rem;
    opacity: 0.5;
}

.no-sources p {
    font-size: 1.2rem;
    margin: 0.5rem 0;
}

.no-sources .subtitle {
    font-size: 1rem;
    opacity: 0.7;
}

.sources-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    gap: 2rem;
}

/* Source Card */
.source-card {
    background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
    border-radius: 20px;
    padding: 1.5rem;
    border: 1px solid rgba(77, 158, 57, 0.2);
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
}

.source-card:hover {
    border-color: rgba(77, 158, 57, 0.5);
    transform: translateY(-5px);
    box-shadow: 0 8px 25px rgba(77, 158, 57, 0.1);
}

.source-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, #4d9e39, #62ce47);
    opacity: 0;
    transition: opacity 0.3s ease;
}

.source-card:hover::before {
    opacity: 1;
}

.source-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.5rem;
    position: relative;
}

.profile-image {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid rgba(77, 158, 57, 0.3);
    transition: all 0.3s ease;
}

.profile-image:hover {
    border-color: #4d9e39;
    transform: scale(1.05);
}

.source-info {
    flex: 1;
}

.username {
    margin: 0 0 0.25rem 0;
    color: #4d9e39;
    font-size: 1.2rem;
    font-weight: 700;
}

.full-name {
    margin: 0 0 0.25rem 0;
    color: #ffffff;
    font-size: 1rem;
    font-weight: 500;
}

.followers {
    margin: 0;
    color: #969696;
    font-size: 0.9rem;
}

.source-actions {
    position: absolute;
    top: 0;
    right: 0;
}

.delete-button {
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 8px;
    padding: 0.5rem;
    cursor: pointer;
    transition: all 0.3s ease;
    font-size: 1rem;
}

.delete-button:hover {
    background: rgba(239, 68, 68, 0.3);
    border-color: #ef4444;
    transform: scale(1.1);
}

/* Stats and Config sections */
.source-stats,
.source-config,
.source-engagement,
.source-niches,
.source-dates,
.source-hashtags {
    margin-bottom: 1rem;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.05);
}

.stat-item,
.config-item,
.engagement-item,
.date-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.stat-item:last-child,
.config-item:last-child,
.engagement-item:last-child,
.date-item:last-child {
    border-bottom: none;
}

.stat-label,
.config-label,
.engagement-label,
.date-label {
    color: #969696;
    font-size: 0.9rem;
}

.stat-value,
.engagement-value,
.date-value {
    color: #ffffff;
    font-weight: 600;
    font-size: 0.9rem;
}

.config-value {
    font-size: 0.9rem;
    font-weight: 600;
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
}

.config-value.enabled {
    background: rgba(34, 197, 94, 0.2);
    color: #22c55e;
}

.config-value.disabled {
    background: rgba(156, 163, 175, 0.2);
    color: #9ca3af;
}

/* Niches and Hashtags */
.niches-header,
.hashtags-header {
    margin-bottom: 0.75rem;
}

.niches-label,
.hashtags-label {
    color: #ffffff;
    font-weight: 600;
    font-size: 0.9rem;
}

.niches-tags,
.hashtags-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
}

.niche-tag,
.hashtag-tag {
    background: linear-gradient(135deg, #4d9e39, #62ce47);
    color: white;
    padding: 0.25rem 0.75rem;
    border-radius: 15px;
    font-size: 0.8rem;
    font-weight: 500;
    transition: all 0.3s ease;
}

.hashtag-tag {
    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
}

.niche-tag:hover,
.hashtag-tag:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
}

/* Modal Styling */
.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(4px);
}

.modal-content {
    background: #161616;
    border-radius: 20px;
    border: 1px solid rgba(77, 158, 57, 0.3);
    max-width: 500px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
    animation: modalSlideIn 0.3s ease-out;
}

@keyframes modalSlideIn {
    from {
        opacity: 0;
        transform: translateY(-50px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 2rem 2rem 1rem 2rem;
    border-bottom: 1px solid rgba(77, 158, 57, 0.2);
}

.modal-header h3 {
    margin: 0;
    color: #4d9e39;
    font-size: 1.5rem;
    font-weight: 700;
}

.modal-close {
    background: none;
    border: none;
    color: #969696;
    font-size: 2rem;
    cursor: pointer;
    transition: all 0.3s ease;
}

.modal-close:hover {
    color: #ffffff;
    transform: scale(1.1);
}

.modal-body {
    padding: 2rem;
}

.modal-body p {
    color: #ffffff;
    font-size: 1.1rem;
    margin-bottom: 1.5rem;
    line-height: 1.6;
}

.delete-options {
    margin: 1.5rem 0;
}

.modal-actions {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    padding: 1rem 2rem 2rem 2rem;
    border-top: 1px solid rgba(77, 158, 57, 0.2);
}

.cancel-button,
.delete-confirm-button {
    min-width: 100px;
}

.delete-confirm-button {
    background: linear-gradient(135deg, #ef4444, #dc2626) !important;
}

.delete-confirm-button:hover {
    background: linear-gradient(135deg, #dc2626, #b91c1c) !important;
}

/* Loading Overlay */
.loading-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(32, 31, 32, 0.9);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(4px);
}

.loading-spinner {
    width: 50px;
    height: 50px;
    border: 4px solid rgba(77, 158, 57, 0.3);
    border-top: 4px solid #4d9e39;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
}

.loading-overlay p {
    color: #4d9e39;
    font-size: 1.2rem;
    font-weight: 600;
    margin: 0;
}

/* Responsive Design */
@media (max-width: 768px) {
    .meme-scraper-container {
        padding: 1rem 0.5rem;
    }
    
    .page-header {
        grid-template-columns: 1fr;
        grid-template-rows: auto auto auto;
        gap: 1rem;
        text-align: center;
        padding: 1.5rem;
    }
    
    .header-left,
    .header-right {
        justify-self: center;
    }
    
    .page-title {
        font-size: 2rem;
    }
    
    .status-grid {
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 1rem;
    }
    
    .status-card {
        padding: 1rem;
        flex-direction: column;
        text-align: center;
        gap: 0.5rem;
    }
    
    .status-icon {
        font-size: 1.5rem;
        width: 40px;
        height: 40px;
    }
    
    .form-grid {
        grid-template-columns: 1fr;
        gap: 1rem;
    }
    
    .sources-grid {
        grid-template-columns: 1fr;
        gap: 1rem;
    }
    
    .source-card {
        padding: 1rem;
    }
    
    .modal-content {
        width: 95%;
        margin: 1rem;
    }
    
    .modal-header,
    .modal-body {
        padding: 1.5rem;
    }
    
    .modal-actions {
        padding: 1rem 1.5rem 1.5rem 1.5rem;
        flex-direction: column;
    }
}

@media (max-width: 480px) {
    .page-title {
        font-size: 1.8rem;
    }
    
    .status-grid {
        grid-template-columns: 1fr;
    }
    
    .status-card {
        flex-direction: row;
        text-align: left;
    }
    
    .source-header {
        flex-direction: column;
        text-align: center;
        gap: 0.75rem;
    }
    
    .source-actions {
        position: static;
        align-self: center;
    }
    
    .profile-image {
        width: 50px;
        height: 50px;
    }
}

/* Smooth transitions for all interactive elements */
* {
    transition: all 0.3s ease;
}

/* Custom scrollbar */
::-webkit-scrollbar {
    width: 8px;
}

::-webkit-scrollbar-track {
    background: rgba(77, 158, 57, 0.1);
    border-radius: 4px;
}

::-webkit-scrollbar-thumb {
    background: linear-gradient(135deg, #4d9e39, #62ce47);
    border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(135deg, #62ce47, #4d9e39);
}

/* Button disabled state */
button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

/* Animation for new elements */
@keyframes fadeInUp {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.source-card,
.status-card {
    animation: fadeInUp 0.6s ease-out;
}

/* Hover effects for interactive elements */
.source-card:hover .profile-image {
    transform: scale(1.1);
}

.source-card:hover .username {
    color: #62ce47;
}

/* Success/Error states */
.config-value.enabled:hover {
    background: rgba(34, 197, 94, 0.3);
}

.config-value.disabled:hover {
    background: rgba(156, 163, 175, 0.3);
}
</style>