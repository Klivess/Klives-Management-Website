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
                    @click="refreshAll"
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
        <!-- Scraper Health: live scheduler/provider status, manual scrapes and provider checks -->
        <MemescraperOverviewSection
            title="Scraper Health"
            subtitle="Is the scraper actually working? Live status of the scheduler, providers and recent runs"
        >
            <div class="health-panel">
                <div class="health-top">
                    <div class="health-overall" :class="overallHealth.level">
                        <span class="health-dot" :class="{ pulsing: isScraperBusy }"></span>
                        <div>
                            <div class="health-overall-title">{{ overallHealth.label }}</div>
                            <div class="health-overall-detail">{{ overallHealth.detail }}</div>
                        </div>
                    </div>
                    <div class="health-actions">
                        <KMButton
                            :message="scrapeAllLabel"
                            @click="scrapeAllSources"
                            :disabled="isRequestingScrape || !health"
                        />
                        <KMButton
                            :message="isProviderCheckRunning ? '🩺 Checking…' : '🩺 Check Providers'"
                            @click="startProviderCheck"
                            :disabled="isProviderCheckRunning || isRequestingScrape || !health"
                        />
                    </div>
                </div>

                <div v-if="healthError && !health" class="health-unavailable">
                    ⚠ Couldn't load scraper health: {{ healthError }}
                </div>

                <template v-if="health">
                    <div class="health-facts">
                        <div class="health-fact">
                            <span class="fact-label">Scheduler</span>
                            <span class="fact-value">{{ schedulerText }}</span>
                        </div>
                        <div class="health-fact">
                            <span class="fact-label">Running now</span>
                            <span class="fact-value">{{ health.CurrentScrape || 'Nothing' }}<template v-if="health.ScrapeQueued > 1"> · {{ health.ScrapeQueued - 1 }} more queued</template></span>
                        </div>
                        <div class="health-fact">
                            <span class="fact-label">Interval</span>
                            <span class="fact-value">Every {{ health.ScrapeIntervalHours || 24 }}h per source</span>
                        </div>
                        <div class="health-fact">
                            <span class="fact-label">Scheduler tick</span>
                            <span class="fact-value">{{ relativeTime(health.LastSchedulerTickUtc) }}</span>
                        </div>
                        <div class="health-fact">
                            <span class="fact-label">Reels on disk</span>
                            <span class="fact-value">{{ formatNumber(health.ReelsOnDisk || 0) }}</span>
                        </div>
                        <div class="health-fact">
                            <span class="fact-label">Failing sources</span>
                            <span class="fact-value" :class="{ 'text-bad': health.FailingSources > 0 }">{{ health.FailingSources }} / {{ health.Sources?.length || 0 }}</span>
                        </div>
                    </div>

                    <div class="providers-grid">
                        <div
                            v-for="provider in health.Providers"
                            :key="provider.Name"
                            class="provider-card"
                            :class="providerLevel(provider)"
                        >
                            <div class="provider-header">
                                <div>
                                    <h4 class="provider-name">{{ providerTitle(provider.Name) }}</h4>
                                    <p class="provider-role">{{ providerRole(provider.Name) }}</p>
                                </div>
                                <span class="provider-badge" :class="providerLevel(provider)">{{ providerStatusText(provider) }}</span>
                            </div>
                            <div class="provider-stats">
                                <div><span class="fact-label">Last success</span><span class="fact-value">{{ relativeTime(provider.LastSuccess) }}</span></div>
                                <div><span class="fact-label">Last failure</span><span class="fact-value">{{ relativeTime(provider.LastFailure) }}</span></div>
                                <div><span class="fact-label">Runs ok / failed</span><span class="fact-value">{{ provider.TotalSuccesses }} / {{ provider.TotalFailures }}</span></div>
                            </div>
                            <div v-if="isBenched(provider)" class="provider-note warn">
                                Skipped until {{ relativeTime(provider.BenchedUntil) }} after {{ provider.ConsecutiveFailures }} failures in a row. A passing provider check re-enables it immediately.
                            </div>
                            <div v-if="provider.ConsecutiveFailures > 0 && provider.LastError" class="provider-note bad">
                                {{ provider.LastError }}
                            </div>
                        </div>
                    </div>

                    <div v-if="health.ProviderCheck" class="provider-check">
                        <div class="provider-check-header">
                            <h4>
                                Provider check on @{{ health.ProviderCheck.Username }}
                                <span v-if="health.ProviderCheck.State !== 'complete'" class="inline-spinner"></span>
                            </h4>
                            <span class="provider-check-meta">
                                {{ providerCheckStateText }} · by {{ health.ProviderCheck.RequestedBy }}
                            </span>
                        </div>
                        <div v-if="!health.ProviderCheck.Results?.length" class="provider-check-empty">
                            {{ health.ProviderCheck.State === 'queued' ? 'Waiting for the current scrape to finish…' : 'Testing inflact first, then Instagram (about a minute)…' }}
                        </div>
                        <div v-for="result in health.ProviderCheck.Results" :key="result.Provider" class="check-row" :class="result.Ok ? 'good' : 'bad'">
                            <span class="check-icon">{{ result.Ok ? '✓' : '✗' }}</span>
                            <div class="check-body">
                                <div class="check-title">
                                    {{ providerTitle(result.Provider) }}
                                    <span class="check-detail">
                                        {{ result.Listed }} listed · {{ result.Reels }} usable · {{ result.Pages }} page(s) · {{ (result.DurationMs / 1000).toFixed(1) }}s
                                    </span>
                                </div>
                                <div v-if="result.DownloadOk !== null && result.DownloadOk !== undefined" class="check-detail">
                                    Test download:
                                    <template v-if="result.DownloadOk">{{ formatBytes(result.DownloadBytes) }} from {{ result.DownloadHost }}</template>
                                    <template v-else>failed — {{ result.DownloadError }}</template>
                                </div>
                                <div v-if="result.Note" class="check-detail">{{ result.Note }}</div>
                                <div v-if="result.Error" class="check-error">{{ result.Error }}</div>
                            </div>
                        </div>
                    </div>

                    <div class="recent-scrapes">
                        <h4>Recent scrapes</h4>
                        <div v-if="!health.RecentScrapes?.length" class="no-content">
                            <p>No scrapes since the server last started.</p>
                        </div>
                        <div v-else class="scrape-table">
                            <div class="scrape-row scrape-head">
                                <span>When</span><span>Source</span><span>Trigger</span><span>Seen</span><span>New</span><span>Saved</span><span>Result</span>
                            </div>
                            <div
                                v-for="report in health.RecentScrapes.slice(0, 12)"
                                :key="report.Username + report.StartedUtc"
                                class="scrape-row"
                                :class="report.Error ? 'bad' : (report.DownloadFailures > 0 ? 'warn' : 'good')"
                                :title="report.ProviderSummary || ''"
                            >
                                <span>{{ relativeTime(report.FinishedUtc || report.StartedUtc) }}</span>
                                <span>@{{ report.Username }}</span>
                                <span>{{ formatTrigger(report.Trigger) }}</span>
                                <span>{{ report.ReelsFound }}</span>
                                <span>{{ report.NewReels }}</span>
                                <span>{{ report.Downloaded }}<template v-if="report.DownloadFailures"> ({{ report.DownloadFailures }} failed)</template></span>
                                <span class="scrape-result">{{ report.Error ? '✗ ' + report.Error : '✓ ' + (report.ProviderSummary || 'ok') }}</span>
                            </div>
                        </div>
                    </div>
                </template>
            </div>
        </MemescraperOverviewSection>

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
                        <p class="metric-value">{{ analytics?.TotalInstagramSources || 0 }}</p>
                        <span class="metric-label">Instagram accounts monitored</span>
                    </div>
                </div>
                <div class="metric-card success">
                    <div class="metric-icon">🎬</div>
                    <div class="metric-info">
                        <h3>Reels Downloaded</h3>
                        <p class="metric-value">{{ formatNumber(analytics?.TotalReelsDownloaded || 0) }}</p>
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
            subtitle="Daily and cumulative meme download trends over time"
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
                                    class="scrape-button"
                                    :class="{ busy: isSourceScraping(source) }"
                                    @click="scrapeSource(source)"
                                    :disabled="isSourceScraping(source) || isRequestingScrape"
                                    :title="isSourceScraping(source) ? 'Scraping now…' : 'Scrape this source now'"
                                >
                                    {{ isSourceScraping(source) ? '⏳' : '▶' }}
                                </button>
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

                        <div class="source-health" :class="sourceLevel(liveSource(source))">
                            <div class="source-health-grid">
                                <div class="date-item">
                                    <span class="date-label">Next Scrape</span>
                                    <span class="date-value">{{ isSourceScraping(source) ? 'Running now' : relativeTime(liveSource(source).NextScrapeDueUtc) }}</span>
                                </div>
                                <div class="date-item">
                                    <span class="date-label">Last Run</span>
                                    <span class="date-value">
                                        <template v-if="liveSource(source).LastScrapeAttemptUtc">
                                            {{ liveSource(source).LastScrapeReelsDownloaded ?? 0 }} new of {{ liveSource(source).LastScrapeReelsFound ?? 0 }} seen
                                        </template>
                                        <template v-else>Not yet</template>
                                    </span>
                                </div>
                            </div>
                            <div v-if="(liveSource(source).ConsecutiveScrapeFailures ?? 0) > 0" class="source-health-msg bad">
                                ✗ {{ liveSource(source).ConsecutiveScrapeFailures }} failed scrape{{ liveSource(source).ConsecutiveScrapeFailures === 1 ? '' : 's' }} in a row — {{ liveSource(source).LastScrapeError }}
                            </div>
                            <div v-else-if="liveSource(source).LastScrapeError" class="source-health-msg warn">
                                ⚠ {{ liveSource(source).LastScrapeError }}
                            </div>
                            <div v-if="liveSource(source).LastScrapeSummary" class="source-health-summary">
                                {{ liveSource(source).LastScrapeSummary }}
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
                    <div class="form-container">
                        <!-- Left side: Form -->
                        <div class="form-section">
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
                                <label>Content Types</label>
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

                        <!-- Right side: Existing Niches -->
                        <div class="existing-niches-section">
                            <h4>Existing Niches</h4>
                            <div class="existing-niches-container">
                                <div v-if="existingNiches.length > 0" class="existing-niches-list">
                                    <div 
                                        v-for="niche in existingNiches" 
                                        :key="niche.name"
                                        class="existing-niche-item"
                                        @click="addExistingNiche(niche.name)"
                                        :class="{ 'disabled': newSourceData.niches.includes(niche.name) }"
                                    >
                                        <span class="niche-name">{{ niche.name }}</span>
                                        <span class="niche-count">{{ niche.count }}</span>
                                    </div>
                                </div>
                                <div v-else class="no-niches-message">
                                    <p>No existing niches found. Create your first niche using the form!</p>
                                </div>
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
import { ref, onMounted, onBeforeUnmount, computed, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
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
    // Scrape health (UTC), written by the scraper after every run
    NextScrapeDueUtc?: string | null;
    LastScrapeAttemptUtc?: string | null;
    LastSuccessfulScrapeUtc?: string | null;
    ConsecutiveScrapeFailures?: number;
    LastScrapeError?: string | null;
    LastScrapeSummary?: string | null;
    LastScrapeReelsFound?: number;
    LastScrapeReelsDownloaded?: number;
    LastScrapeDownloadFailures?: number;
    TotalReelsDownloaded?: number;
}

interface ProviderHealth {
    Name: string;
    ConsecutiveFailures: number;
    TotalSuccesses: number;
    TotalFailures: number;
    LastSuccess: string | null;
    LastFailure: string | null;
    LastError: string | null;
    BenchedUntil: string | null;
}

interface ScrapeReport {
    Username: string;
    Trigger: string;
    StartedUtc: string;
    FinishedUtc: string | null;
    ProviderSummary: string | null;
    ReelsFound: number;
    NewReels: number;
    Downloaded: number;
    DownloadFailures: number;
    Error: string | null;
    Notes: string[];
}

interface ProviderCheckResult {
    Provider: string;
    Ok: boolean;
    Listed: number;
    Reels: number;
    Pages: number;
    DurationMs: number;
    Error: string | null;
    Note: string | null;
    DownloadOk: boolean | null;
    DownloadBytes: number;
    DownloadHost: string | null;
    DownloadError: string | null;
}

interface ProviderCheckRun {
    Username: string;
    RequestedBy: string;
    State: 'queued' | 'running' | 'complete';
    QueuedUtc: string;
    StartedUtc: string | null;
    FinishedUtc: string | null;
    Results: ProviderCheckResult[];
}

interface ScraperHealth {
    GeneratedUtc: string;
    OnServer: boolean;
    SchedulerState: string;
    LastSchedulerTickUtc: string | null;
    NextScrapeDueUtc: string | null;
    CurrentScrape: string | null;
    ReelsOnDisk: number;
    Providers: ProviderHealth[];
    FailingSources: number;
    Sources: (Partial<InstagramSource> & { AccountID: string; Username: string })[];
    RecentScrapes: ScrapeReport[];
    ProviderCheck: ProviderCheckRun | null;
    ScrapeIntervalHours: number;
    ScrapeQueued: number;
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
    TotalInstagramSources: number;
    TotalReelsDownloaded: number;
    TotalViewCount: number;
    AverageViewCountPerReel: number;
    MemesDownloadedPerDay: Record<string, number>;
    CumulativeDownloadedMemesPerDay: Record<string, number>;
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

const existingNiches = computed((): { name: string; count: number }[] => {
    if (!analytics.value?.InstagramSources) return [];
    
    const nicheCount: { [key: string]: number } = {};
    
    // Go through all Instagram sources and collect their niches
    analytics.value.InstagramSources.forEach(source => {
        if (source.Niches) {
            source.Niches.forEach(niche => {
                const nicheName = niche.NicheTagName;
                if (nicheName) {
                    nicheCount[nicheName] = (nicheCount[nicheName] || 0) + 1;
                }
            });
        }
    });
    
    // Convert to array and sort by count (descending)
    return Object.entries(nicheCount)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
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

const addExistingNiche = (niche: string): void => {
    if (!newSourceData.value.niches.includes(niche) && !isSubmittingSource.value) {
        newSourceData.value.niches.push(niche);
    }
};

const submitNewSource = async (): Promise<void> => {
    if (!isFormValid.value) return;
    
    isSubmittingSource.value = true;
    
    try {
        // Prepare the data in the exact format required
        const requestData = {
            username: newSourceData.value.username.trim(),
            downloadReels: newSourceData.value.downloadReels,
            downloadPosts: newSourceData.value.downloadPosts,
            niches: newSourceData.value.niches
        };
        
        const response = await RequestPOSTFromKliveAPI(
            '/memescraper/addInstagramSource', 
            JSON.stringify(requestData)
        );
        
        if (response.ok) {
            await Swal.fire({
                icon: 'success',
                title: 'Success!',
                text: `Instagram source @${newSourceData.value.username} has been added successfully. Refreshing analytics...`,
                confirmButtonColor: '#4d9e39',
                background: '#161516',
                color: '#ffffff',
                timer: 2000,
                timerProgressBar: true,
                showConfirmButton: false
            });
            
            closeAddSourceModal();
            
            // Small delay to ensure backend has processed the new source
            setTimeout(async () => {
                await fetchAnalytics();
            }, 500);
            // The lookup runs in the background on the server; health shows the new source once it lands.
            wasBusy = true;
            scheduleHealthPoll();
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

// ───────────── Scraper health, manual scrapes, provider checks ─────────────

const swalTheme = { confirmButtonColor: '#4d9e39', background: '#161516', color: '#ffffff' };

const health = ref<ScraperHealth | null>(null);
const healthError = ref<string>('');
const isRequestingScrape = ref<boolean>(false);
const now = ref<number>(Date.now());
let healthTimer: ReturnType<typeof setTimeout> | null = null;
let clockTimer: ReturnType<typeof setInterval> | null = null;
let wasBusy = false;
let unmounted = false;

const isProviderCheckRunning = computed((): boolean =>
    !!health.value?.ProviderCheck && health.value.ProviderCheck.State !== 'complete');

const isScraperBusy = computed((): boolean =>
    !!health.value && (!!health.value.CurrentScrape || (health.value.ScrapeQueued || 0) > 0 || isProviderCheckRunning.value));

const fetchHealth = async (): Promise<void> => {
    try {
        const response = await RequestGETFromKliveAPI('/memescraper/scraperHealth', false, false);
        if (response.ok) {
            health.value = await response.json();
            healthError.value = '';
            now.value = Date.now(); // keep relative times consistent with the snapshot just received
        } else {
            healthError.value = response.status === 404
                ? 'the server is running a MemeScraper build without health reporting'
                : `HTTP ${response.status}`;
        }
    } catch (error) {
        healthError.value = error instanceof Error ? error.message : String(error);
    }
};

// Poll fast while something is running (so results appear live), slowly otherwise.
const scheduleHealthPoll = (): void => {
    if (unmounted) return;
    if (healthTimer) clearTimeout(healthTimer);
    healthTimer = setTimeout(async () => {
        await fetchHealth();
        const busy = isScraperBusy.value;
        if (wasBusy && !busy) {
            // A scrape just finished: pull in the reels it downloaded.
            fetchAnalytics(true);
        }
        wasBusy = busy;
        scheduleHealthPoll();
    }, isScraperBusy.value ? 4000 : 30000);
};

const refreshAll = (): void => {
    fetchAnalytics();
    fetchHealth();
};

// Health's per-source records are fresher than analytics' (they change every run); overlay them.
const healthByAccount = computed(() => {
    const map = new Map<string, Partial<InstagramSource>>();
    health.value?.Sources?.forEach(s => map.set(s.AccountID, s));
    return map;
});

const liveSource = (source: InstagramSource): InstagramSource =>
    ({ ...source, ...(healthByAccount.value.get(source.AccountID) || {}) }) as InstagramSource;

const isSourceScraping = (source: InstagramSource): boolean =>
    !!health.value?.CurrentScrape?.startsWith(`@${source.Username} (`);

const scrapeAllLabel = computed((): string => {
    if (isRequestingScrape.value) return 'Queuing…';
    const queued = health.value?.ScrapeQueued || 0;
    return queued > 0 ? `▶ Scrape All (${queued} pending)` : '▶ Scrape All Now';
});

const requestScrape = async (query: string, successText: string): Promise<void> => {
    isRequestingScrape.value = true;
    try {
        const response = await RequestPOSTFromKliveAPI(query, '', false);
        if (response.status === 202) {
            Swal.fire({ ...swalTheme, toast: true, position: 'top-end', icon: 'success', title: successText, showConfirmButton: false, timer: 2500 });
            wasBusy = true;
            await fetchHealth();
            scheduleHealthPoll();
        } else if (response.status !== 401 && response.status !== 403) { // auth failures are already reported by APIInterface
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || `Request failed (HTTP ${response.status})`);
        }
    } catch (error) {
        Swal.fire({ ...swalTheme, icon: 'error', title: 'Scrape not started', text: error instanceof Error ? error.message : String(error) });
    } finally {
        isRequestingScrape.value = false;
    }
};

const scrapeAllSources = async (): Promise<void> => {
    const count = analytics.value?.InstagramSources?.filter(s => s.DownloadReels).length || 0;
    const confirmation = await Swal.fire({
        ...swalTheme,
        icon: 'question',
        title: 'Scrape every source now?',
        text: `Queues ${count} reel source${count === 1 ? '' : 's'}. They run one at a time, so this can take a while; progress shows in Scraper Health.`,
        showCancelButton: true,
        confirmButtonText: 'Scrape all',
        cancelButtonColor: '#3a3a3a'
    });
    if (!confirmation.isConfirmed) return;
    await requestScrape('/memescraper/scrapeNow', `Queued ${count} source${count === 1 ? '' : 's'} for scraping`);
};

const scrapeSource = async (source: InstagramSource): Promise<void> => {
    await requestScrape(`/memescraper/scrapeNow?sourceAccountID=${encodeURIComponent(source.AccountID)}`, `Scraping @${source.Username}…`);
};

const defaultCheckUsername = computed((): string => {
    const sources = (analytics.value?.InstagramSources || []).map(liveSource).filter(s => s.DownloadReels);
    sources.sort((a, b) => (parseUtc(b.LastSuccessfulScrapeUtc)?.getTime() || 0) - (parseUtc(a.LastSuccessfulScrapeUtc)?.getTime() || 0));
    return sources[0]?.Username || '';
});

const startProviderCheck = async (): Promise<void> => {
    const input = await Swal.fire({
        ...swalTheme,
        title: 'Check providers',
        text: 'Runs inflact and Instagram separately against one account and test-downloads a reel from each, so you can see exactly which one is broken. Takes about a minute.',
        input: 'text',
        inputValue: defaultCheckUsername.value,
        inputPlaceholder: 'Instagram username with reels',
        showCancelButton: true,
        confirmButtonText: 'Run check',
        cancelButtonColor: '#3a3a3a',
        inputValidator: (value: string) => (!value || !value.trim() ? 'Enter a username' : undefined)
    });
    if (!input.isConfirmed) return;
    const username = String(input.value).trim().replace(/^@/, '');
    isRequestingScrape.value = true;
    try {
        const response = await RequestPOSTFromKliveAPI(`/memescraper/diagnoseProviders?username=${encodeURIComponent(username)}`, '', false);
        if (response.status === 202 || response.status === 409) {
            if (response.status === 409) {
                Swal.fire({ ...swalTheme, toast: true, position: 'top-end', icon: 'info', title: 'A provider check is already running', showConfirmButton: false, timer: 2500 });
            }
            await fetchHealth();
            scheduleHealthPoll();
        } else if (response.status !== 401 && response.status !== 403) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || `Request failed (HTTP ${response.status})`);
        }
    } catch (error) {
        Swal.fire({ ...swalTheme, icon: 'error', title: 'Check not started', text: error instanceof Error ? error.message : String(error) });
    } finally {
        isRequestingScrape.value = false;
    }
};

const overallHealth = computed((): { level: string; label: string; detail: string } => {
    const h = health.value;
    if (!h) {
        return { level: 'unknown', label: healthError.value ? 'Health unavailable' : 'Loading health…', detail: healthError.value };
    }
    const providers = h.Providers || [];
    const failingProviders = providers.filter(p => p.ConsecutiveFailures > 0);
    const totalSources = h.Sources?.length || 0;
    if (h.SchedulerState?.startsWith('failed') || h.SchedulerState?.startsWith('tick failed')) {
        return { level: 'bad', label: 'Scheduler broken', detail: h.SchedulerState };
    }
    if (providers.length > 0 && failingProviders.length === providers.length) {
        return { level: 'bad', label: 'Scraping is failing', detail: `Every provider is failing: ${failingProviders[0].LastError || 'see below'}` };
    }
    if (h.FailingSources > 0) {
        const all = h.FailingSources >= totalSources;
        return {
            level: all ? 'bad' : 'warn',
            label: all ? 'Scraping is failing' : 'Degraded',
            detail: `${h.FailingSources} of ${totalSources} source${totalSources === 1 ? '' : 's'} failed their last scrape`
        };
    }
    if (failingProviders.length > 0) {
        return { level: 'warn', label: 'Degraded', detail: `${failingProviders.map(p => providerTitle(p.Name)).join(', ')} failing; scrapes are using the other provider` };
    }
    if (h.CurrentScrape) {
        return { level: 'good', label: 'Scraping', detail: h.CurrentScrape };
    }
    if (h.SchedulerState?.startsWith('paused')) {
        return { level: 'warn', label: 'Paused', detail: h.SchedulerState };
    }
    if (!h.OnServer) {
        return { level: 'idle', label: 'Not scheduling here', detail: 'Scheduled scrapes only run on the server. Manual scrapes and provider checks still work.' };
    }
    const lastOk = providers.map(p => parseUtc(p.LastSuccess)).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime()).pop();
    return { level: 'good', label: 'Healthy', detail: lastOk ? `Last successful scrape ${relativeTime(lastOk.toISOString())}` : 'No scrapes yet since the server started' };
});

const schedulerText = computed((): string => {
    const state = health.value?.SchedulerState || '';
    if (!state) return '—';
    if (state === 'idle' || state.startsWith('idle,')) {
        return health.value?.NextScrapeDueUtc ? `Idle · next scrape ${relativeTime(health.value.NextScrapeDueUtc)}` : 'Idle';
    }
    return state.charAt(0).toUpperCase() + state.slice(1);
});

const providerTitle = (name: string): string =>
    ({ inflact: 'inflact.com', instagram: 'Instagram (direct)' } as Record<string, string>)[name] || name;

const providerRole = (name: string): string =>
    ({
        inflact: 'Primary · full reel history through inflact’s API',
        instagram: 'Fallback · newest ~12 reels straight from Instagram; also refreshes expired video links'
    } as Record<string, string>)[name] || '';

const isBenched = (provider: ProviderHealth): boolean => {
    const until = parseUtc(provider.BenchedUntil);
    return !!until && until.getTime() > now.value;
};

const providerLevel = (provider: ProviderHealth): string => {
    if (isBenched(provider)) return 'bad';
    if (provider.ConsecutiveFailures > 0) return 'warn';
    if (provider.TotalSuccesses > 0) return 'good';
    return 'idle';
};

const providerStatusText = (provider: ProviderHealth): string => {
    if (isBenched(provider)) return 'Benched';
    if (provider.ConsecutiveFailures > 0) return `Failing ×${provider.ConsecutiveFailures}`;
    if (provider.TotalSuccesses > 0) return 'Working';
    return 'Not used yet';
};

const sourceLevel = (source: InstagramSource): string => {
    const failures = source.ConsecutiveScrapeFailures || 0;
    if (failures >= 3) return 'bad';
    if (failures > 0 || source.LastScrapeError) return 'warn';
    if (source.LastSuccessfulScrapeUtc) return 'good';
    return 'idle';
};

const providerCheckStateText = computed((): string => {
    const check = health.value?.ProviderCheck;
    if (!check) return '';
    if (check.State === 'queued') return 'Queued';
    if (check.State === 'running') return 'Running';
    return `Finished ${relativeTime(check.FinishedUtc)}`;
});

// The server stamps these in UTC; tolerate a missing zone suffix and .NET's DateTime.MinValue.
const parseUtc = (value?: string | null): Date | null => {
    if (!value || value.startsWith('0001-01-01')) return null;
    const date = new Date(/([zZ]|[+-]\d\d:\d\d)$/.test(value) ? value : value + 'Z');
    return isNaN(date.getTime()) ? null : date;
};

const relativeTime = (value?: string | null): string => {
    const date = parseUtc(value);
    if (!date) return 'Never';
    const diff = date.getTime() - now.value;
    const abs = Math.abs(diff);
    if (abs < 45_000) return diff > 0 ? 'any moment' : 'just now';
    const minutes = Math.round(abs / 60_000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const text = days > 0 ? `${days}d ${hours % 24}h` : hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
    return diff > 0 ? `in ${text}` : `${text} ago`;
};

const formatBytes = (bytes: number): string => {
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB';
    return bytes + ' B';
};

const formatTrigger = (trigger: string): string => {
    if (trigger === 'schedule') return 'Scheduled';
    if (trigger?.startsWith('manual:')) return `Manual (${trigger.substring(7)})`;
    if (trigger === 'legacy-call') return 'Legacy call';
    return trigger || '—';
};

// API functions
const fetchAnalytics = async (quiet: boolean = false): Promise<void> => {
    // quiet: background refresh after a scrape finishes — no overlay, no error popups.
    if (!quiet) isLoading.value = true;

    // Ensure minimum loading time for better UX
    const startTime = Date.now();
    const minLoadingTime = quiet ? 0 : 800; // 800ms minimum

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
        if (!quiet) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Failed to fetch analytics data. Please try again.',
                confirmButtonColor: '#4d9e39',
                background: '#161516',
                color: '#ffffff'
            });
        }
    } finally {
        // Ensure minimum loading time has passed
        const elapsedTime = Date.now() - startTime;
        const remainingTime = Math.max(0, minLoadingTime - elapsedTime);

        if (quiet) {
            // never touched the overlay
        } else if (remainingTime > 0) {
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
    const dailyCounts = dates.map(date => analytics.value!.MemesDownloadedPerDay[date]);
    const cumulativeCounts = dates.map(date => analytics.value!.CumulativeDownloadedMemesPerDay?.[date] || 0);

    const datasets = [{
        label: 'Daily Downloads',
        data: dailyCounts,
        borderColor: '#4d9e39',
        backgroundColor: 'rgba(77, 158, 57, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        yAxisID: 'y'
    }];

    // Only add cumulative data if it exists
    if (analytics.value.CumulativeDownloadedMemesPerDay) {
        datasets.push({
            label: 'Cumulative Downloads',
            data: cumulativeCounts,
            borderColor: '#ff6b35',
            backgroundColor: 'rgba(255, 107, 53, 0.1)',
            borderWidth: 2,
            fill: false,
            tension: 0.4,
            yAxisID: 'y1'
        });
    }

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates.map(date => new Date(date).toLocaleDateString()),
            datasets: datasets
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
                    type: 'linear',
                    display: true,
                    position: 'left',
                    ticks: {
                        color: '#ffffff'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    title: {
                        display: true,
                        text: 'Daily Downloads',
                        color: '#4d9e39'
                    }
                },
                y1: {
                    type: 'linear',
                    display: analytics.value.CumulativeDownloadedMemesPerDay ? true : false,
                    position: 'right',
                    ticks: {
                        color: '#ffffff'
                    },
                    grid: {
                        drawOnChartArea: false,
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    title: {
                        display: true,
                        text: 'Cumulative Downloads',
                        color: '#ff6b35'
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
            fetchHealth();
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
    fetchHealth().then(scheduleHealthPoll);
    clockTimer = setInterval(() => { now.value = Date.now(); }, 30_000);
});

onBeforeUnmount(() => {
    unmounted = true;
    if (healthTimer) clearTimeout(healthTimer);
    if (clockTimer) clearInterval(clockTimer);
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
    flex-shrink: 0;
}

.source-info {
    flex: 1;
    min-width: 0; /* let long usernames wrap instead of pushing the action buttons off the card */
    overflow-wrap: anywhere;
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
    flex-shrink: 0;
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
    max-width: 800px;
    width: 95%;
}

.form-container {
    display: grid;
    grid-template-columns: 1fr 300px;
    gap: 30px;
    align-items: start;
}

.form-section {
    flex: 1;
}

.existing-niches-section {
    border-left: 1px solid rgba(77, 158, 57, 0.3);
    padding-left: 20px;
}

.existing-niches-section h4 {
    color: #4d9e39;
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0 0 15px 0;
}

.existing-niches-container {
    max-height: 300px;
    overflow-y: auto;
}

.existing-niches-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.existing-niche-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: rgba(77, 158, 57, 0.1);
    border: 1px solid rgba(77, 158, 57, 0.3);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.existing-niche-item:hover:not(.disabled) {
    background: rgba(77, 158, 57, 0.2);
    border-color: rgba(77, 158, 57, 0.5);
    transform: translateX(2px);
}

.existing-niche-item.disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: rgba(156, 163, 175, 0.1);
    border-color: rgba(156, 163, 175, 0.3);
}

.niche-name {
    color: #ffffff;
    font-weight: 500;
    font-size: 0.9rem;
}

.niche-count {
    background: rgba(77, 158, 57, 0.3);
    color: #4d9e39;
    padding: 2px 6px;
    border-radius: 12px;
    font-size: 0.8rem;
    font-weight: 600;
    min-width: 20px;
    text-align: center;
}

.no-niches-message {
    text-align: center;
    padding: 20px;
    color: rgba(255, 255, 255, 0.6);
    font-style: italic;
}

.no-niches-message p {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.4;
}

/* Custom scrollbar for existing niches */
.existing-niches-container::-webkit-scrollbar {
    width: 4px;
}

.existing-niches-container::-webkit-scrollbar-track {
    background: rgba(77, 158, 57, 0.1);
    border-radius: 2px;
}

.existing-niches-container::-webkit-scrollbar-thumb {
    background: rgba(77, 158, 57, 0.3);
    border-radius: 2px;
}

.existing-niches-container::-webkit-scrollbar-thumb:hover {
    background: rgba(77, 158, 57, 0.5);
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

/* ───────────── Scraper Health ───────────── */
.health-panel {
    display: flex;
    flex-direction: column;
    gap: 20px;
    --good: #28a745;
    --warn: #f0ad4e;
    --bad: #dc3545;
    --idle: #8a8f98;
}

.health-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    flex-wrap: wrap;
}

.health-overall {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 18px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    flex: 1;
    min-width: 260px;
}

.health-overall.good { border-color: rgba(40, 167, 69, 0.45); }
.health-overall.warn { border-color: rgba(240, 173, 78, 0.5); }
.health-overall.bad { border-color: rgba(220, 53, 69, 0.55); background: rgba(220, 53, 69, 0.08); }

.health-dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    flex-shrink: 0;
    background: var(--idle);
}

.health-overall.good .health-dot { background: var(--good); box-shadow: 0 0 10px rgba(40, 167, 69, 0.6); }
.health-overall.warn .health-dot { background: var(--warn); box-shadow: 0 0 10px rgba(240, 173, 78, 0.6); }
.health-overall.bad .health-dot { background: var(--bad); box-shadow: 0 0 10px rgba(220, 53, 69, 0.6); }
.health-dot.pulsing { animation: health-pulse 1.4s ease-in-out infinite; }

@keyframes health-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.45; transform: scale(0.8); }
}

.health-overall-title {
    font-size: 1.15rem;
    font-weight: 700;
}

.health-overall-detail {
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.7);
    margin-top: 2px;
}

.health-actions {
    display: flex;
    gap: 10px;
    height: 46px;
    width: 520px;
    max-width: 100%;
}

.health-actions > * {
    flex: 1;
}

.health-unavailable {
    padding: 12px 16px;
    border-radius: 10px;
    background: rgba(240, 173, 78, 0.12);
    border: 1px solid rgba(240, 173, 78, 0.35);
    color: #f0ad4e;
    font-size: 0.9rem;
}

.health-facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
}

.health-fact,
.provider-stats > div {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}

.health-fact {
    padding: 12px 14px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.05);
}

.fact-label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.55);
}

.fact-value {
    font-size: 0.92rem;
    font-weight: 600;
    word-break: break-word;
}

.text-bad { color: var(--bad); }

.providers-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 16px;
}

.provider-card {
    padding: 18px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-left: 4px solid var(--idle);
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.provider-card.good { border-left-color: var(--good); }
.provider-card.warn { border-left-color: var(--warn); }
.provider-card.bad { border-left-color: var(--bad); }

.provider-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
}

.provider-name {
    margin: 0;
    font-size: 1.05rem;
}

.provider-role {
    margin: 4px 0 0;
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.6);
}

.provider-badge {
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 0.78rem;
    font-weight: 600;
    white-space: nowrap;
    background: rgba(138, 143, 152, 0.2);
    color: var(--idle);
}

.provider-badge.good { background: rgba(40, 167, 69, 0.2); color: var(--good); }
.provider-badge.warn { background: rgba(240, 173, 78, 0.2); color: var(--warn); }
.provider-badge.bad { background: rgba(220, 53, 69, 0.2); color: var(--bad); }

.provider-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
}

.provider-note {
    font-size: 0.82rem;
    padding: 8px 10px;
    border-radius: 8px;
    word-break: break-word;
}

.provider-note.warn { background: rgba(240, 173, 78, 0.1); color: #f5c27a; }
.provider-note.bad { background: rgba(220, 53, 69, 0.1); color: #f08a94; }

.provider-check {
    padding: 18px;
    border-radius: 14px;
    background: rgba(77, 158, 57, 0.06);
    border: 1px solid rgba(77, 158, 57, 0.3);
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.provider-check-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}

.provider-check-header h4 {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 10px;
}

.provider-check-meta,
.provider-check-empty {
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.65);
}

.inline-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(77, 158, 57, 0.3);
    border-top-color: #4d9e39;
    border-radius: 50%;
    animation: health-spin 0.9s linear infinite;
    display: inline-block;
}

@keyframes health-spin {
    to { transform: rotate(360deg); }
}

.check-row {
    display: flex;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.04);
}

.check-icon {
    font-size: 1.2rem;
    font-weight: 700;
    line-height: 1.3;
}

.check-row.good .check-icon { color: var(--good); }
.check-row.bad .check-icon { color: var(--bad); }

.check-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}

.check-title {
    font-weight: 600;
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: baseline;
}

.check-detail {
    font-size: 0.82rem;
    font-weight: 400;
    color: rgba(255, 255, 255, 0.65);
    word-break: break-word;
}

.check-error {
    font-size: 0.82rem;
    color: #f08a94;
    word-break: break-word;
}

.recent-scrapes h4 {
    margin: 0 0 10px;
}

.scrape-table {
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-x: auto;
}

.scrape-row {
    display: grid;
    grid-template-columns: 90px 150px 130px 55px 50px 110px minmax(220px, 1fr);
    gap: 10px;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 0.84rem;
    background: rgba(255, 255, 255, 0.04);
    border-left: 3px solid transparent;
    align-items: center;
    min-width: 860px;
}

.scrape-row > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.scrape-row.scrape-head {
    background: none;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.5);
}

.scrape-row.good { border-left-color: var(--good); }
.scrape-row.warn { border-left-color: var(--warn); }
.scrape-row.bad { border-left-color: var(--bad); }
.scrape-row.bad .scrape-result { color: #f08a94; }

/* Per-source health on source cards */
.scrape-button {
    background: rgba(77, 158, 57, 0.2);
    border: 1px solid rgba(77, 158, 57, 0.4);
    color: #4d9e39;
    padding: 8px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 1rem;
    transition: all 0.3s ease;
}

.scrape-button:hover:not(:disabled) {
    background: rgba(77, 158, 57, 0.3);
    transform: scale(1.05);
}

.scrape-button:disabled {
    cursor: default;
    opacity: 0.6;
}

.scrape-button.busy {
    opacity: 1;
    animation: health-pulse 1.4s ease-in-out infinite;
}

.source-health {
    margin: 16px 0;
    padding: 12px 14px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.04);
    border-left: 3px solid #8a8f98;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.source-health.good { border-left-color: #28a745; }
.source-health.warn { border-left-color: #f0ad4e; }
.source-health.bad { border-left-color: #dc3545; background: rgba(220, 53, 69, 0.06); }

.source-health-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
}

.source-health-msg {
    font-size: 0.82rem;
    word-break: break-word;
}

.source-health-msg.bad { color: #f08a94; }
.source-health-msg.warn { color: #f5c27a; }

.source-health-summary {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.5);
    word-break: break-word;
}

@media (max-width: 768px) {
    .page-header {
        flex-direction: column;
        gap: 16px;
        text-align: center;
    }

    .health-actions {
        width: 100%;
        flex-direction: column;
        height: auto;
    }

    .health-actions > * {
        min-height: 44px;
    }

    .provider-stats {
        grid-template-columns: 1fr 1fr;
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
    
    .form-container {
        grid-template-columns: 1fr;
        gap: 20px;
    }
    
    .existing-niches-section {
        border-left: none;
        border-top: 1px solid rgba(77, 158, 57, 0.3);
        padding-left: 0;
        padding-top: 20px;
    }
    
    .add-source-modal {
        max-width: 95%;
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
