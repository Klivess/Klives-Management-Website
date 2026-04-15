<template>
    <div class="og-container">
        <!-- Header -->
        <div class="og-header">
            <div class="og-header-left">
                <KMButton style="width: 260px;" message="Back To Schemes" @click="$router.push('/schemes')" />
            </div>
            <div class="og-header-center">
                <h1 class="og-title">OmniGram Command Center</h1>
                <p class="og-subtitle">Fleet management &bull; {{ stats?.TotalAccounts || 0 }} accounts &bull; {{ stats?.TotalFollowers ? formatNumber(stats.TotalFollowers) : '0' }} total followers</p>
            </div>
            <div class="og-header-right">
                <KMButton message="➕ Add Account" @click="showAddAccount" style="width: 180px;" />
                <KMButton message="🔄 Refresh" @click="refreshAll" style="width: 140px;" />
            </div>
        </div>

        <!-- Tab Navigation -->
        <div class="og-tabs">
            <button v-for="tab in tabs" :key="tab.id" class="og-tab" :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id">
                <span class="tab-icon">{{ tab.icon }}</span>
                <span class="tab-label">{{ tab.label }}</span>
                <span v-if="tab.badge" class="tab-badge">{{ tab.badge }}</span>
            </button>
        </div>

        <!-- Loading -->
        <div v-if="isLoading && !statsLoaded" class="og-loading">
            <div class="og-spinner"></div>
            <h3>Loading OmniGram</h3>
            <p>Fetching fleet data...</p>
        </div>

        <!-- ═══════════════ TAB: Fleet Overview ═══════════════ -->
        <div v-show="statsLoaded && activeTab === 'overview'" class="og-panel fade-in">
            <!-- KPI Row -->
            <div class="og-kpi-grid">
                <div class="og-kpi">
                    <div class="kpi-icon">📡</div>
                    <div class="kpi-data">
                        <span class="kpi-value">{{ stats?.ActiveAccounts || 0 }}<small>/{{ stats?.TotalAccounts || 0 }}</small></span>
                        <span class="kpi-label">Active Accounts</span>
                    </div>
                </div>
                <div class="og-kpi">
                    <div class="kpi-icon">👥</div>
                    <div class="kpi-data">
                        <span class="kpi-value">{{ formatNumber(stats?.TotalFollowers || 0) }}</span>
                        <span class="kpi-label">Total Followers</span>
                        <span class="kpi-trend" :class="(stats?.FollowerGainToday || 0) >= 0 ? 'trend-up' : 'trend-down'">
                            {{ (stats?.FollowerGainToday || 0) >= 0 ? '+' : '' }}{{ stats?.FollowerGainToday || 0 }} today
                        </span>
                    </div>
                </div>
                <div class="og-kpi">
                    <div class="kpi-icon">📈</div>
                    <div class="kpi-data">
                        <span class="kpi-value">{{ stats?.AvgEngagementRate || 0 }}%</span>
                        <span class="kpi-label">Avg Engagement</span>
                    </div>
                </div>
                <div class="og-kpi">
                    <div class="kpi-icon">📤</div>
                    <div class="kpi-data">
                        <span class="kpi-value">{{ stats?.PostsToday || 0 }}</span>
                        <span class="kpi-label">Posts Today</span>
                        <span class="kpi-sub">{{ stats?.PostsThisWeek || 0 }} this week</span>
                    </div>
                </div>
                <div class="og-kpi">
                    <div class="kpi-icon">✅</div>
                    <div class="kpi-data">
                        <span class="kpi-value">{{ stats?.SuccessRate || 0 }}%</span>
                        <span class="kpi-label">Success Rate</span>
                        <span class="kpi-sub">{{ stats?.FailedCount || 0 }} failed</span>
                    </div>
                </div>
                <div class="og-kpi">
                    <div class="kpi-icon">⏳</div>
                    <div class="kpi-data">
                        <span class="kpi-value">{{ stats?.PendingCount || 0 }}</span>
                        <span class="kpi-label">Queued Posts</span>
                    </div>
                </div>
            </div>

            <!-- Fleet Table -->
            <div class="og-section">
                <div class="og-section-header">
                    <h2>Fleet Status</h2>
                    <div class="og-section-actions">
                        <button class="og-btn-sm" @click="triggerContentPull">⚡ Queue Content from Sources</button>
                    </div>
                </div>
                <div class="og-table-wrap">
                    <table class="og-table">
                        <thead>
                            <tr>
                                <th>Account</th>
                                <th>Status</th>
                                <th>Followers</th>
                                <th>Engagement</th>
                                <th>Source</th>
                                <th>Posts/Day</th>
                                <th>Last Post</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="acc in accounts" :key="acc.AccountId" :class="{ 'row-paused': acc.IsPaused, 'row-error': isErrorStatus(acc.LoginStatus) }">
                                <td class="td-account">
                                    <span class="account-name">@{{ acc.Username }}</span>
                                    <span v-if="acc.Tags?.length" class="account-tags">
                                        <span v-for="tag in acc.Tags.slice(0, 3)" :key="tag" class="tag-pill">{{ tag }}</span>
                                    </span>
                                </td>
                                <td><span class="status-pill" :class="getStatusClass(acc.LoginStatus)">{{ acc.LoginStatus }}</span></td>
                                <td>{{ formatNumber(acc.FollowerCount) }}</td>
                                <td>{{ getAccountEngagement(acc.AccountId) }}%</td>
                                <td><span class="source-badge">{{ acc.ContentSource }}</span></td>
                                <td>{{ acc.PostsPerDay }}</td>
                                <td>{{ timeAgo(acc.LastPostTime) }}</td>
                                <td class="td-actions">
                                    <button class="og-btn-icon" title="Configure" @click="openAccountConfig(acc.AccountId)">⚙️</button>
                                    <button v-if="!acc.IsPaused" class="og-btn-icon" title="Pause" @click="pauseAccount(acc.AccountId)">⏸️</button>
                                    <button v-else class="og-btn-icon" title="Resume" @click="resumeAccount(acc.AccountId)">▶️</button>
                                    <button class="og-btn-icon" title="Analytics" @click="openAccountAnalytics(acc.AccountId)">📊</button>
                                    <button class="og-btn-icon danger" title="Remove" @click="removeAccount(acc.AccountId, acc.Username)">🗑️</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    <div v-if="accounts.length === 0" class="og-empty">No accounts added yet. Click "Add Account" to get started.</div>
                </div>
            </div>

            <!-- Recent Events -->
            <div class="og-section">
                <div class="og-section-header">
                    <h2>Recent Activity</h2>
                </div>
                <div class="og-events-list">
                    <div v-for="(evt, i) in events.slice(0, 15)" :key="i" class="og-event" :class="'evt-' + evt.Severity?.toLowerCase()">
                        <span class="evt-time">{{ formatTime(evt.Timestamp) }}</span>
                        <span class="evt-type">{{ evt.EventType }}</span>
                        <span class="evt-msg">{{ evt.Message }}</span>
                    </div>
                    <div v-if="events.length === 0" class="og-empty-sm">No recent events.</div>
                </div>
            </div>
        </div>

        <!-- ═══════════════ TAB: Accounts ═══════════════ -->
        <div v-show="statsLoaded && activeTab === 'accounts'" class="og-panel fade-in">
            <div class="og-accounts-detail-grid">
                <div v-for="acc in accounts" :key="acc.AccountId" class="og-account-detail-card"
                    :class="{ 'card-paused': acc.IsPaused, 'card-error': isErrorStatus(acc.LoginStatus) }">
                    <div class="adc-header">
                        <div class="adc-identity">
                            <span class="adc-username">@{{ acc.Username }}</span>
                            <span class="status-pill sm" :class="getStatusClass(acc.LoginStatus)">{{ acc.LoginStatus }}</span>
                        </div>
                        <div class="adc-actions">
                            <button class="og-btn-icon" @click="openAccountConfig(acc.AccountId)" title="Configure">⚙️</button>
                            <button v-if="!acc.IsPaused" class="og-btn-icon" @click="pauseAccount(acc.AccountId)" title="Pause">⏸️</button>
                            <button v-else class="og-btn-icon" @click="resumeAccount(acc.AccountId)" title="Resume">▶️</button>
                        </div>
                    </div>
                    <div class="adc-stats-row">
                        <div class="adc-stat"><span class="adc-stat-val">{{ formatNumber(acc.FollowerCount) }}</span><span class="adc-stat-lbl">Followers</span></div>
                        <div class="adc-stat"><span class="adc-stat-val">{{ formatNumber(acc.FollowingCount) }}</span><span class="adc-stat-lbl">Following</span></div>
                        <div class="adc-stat"><span class="adc-stat-val">{{ acc.MediaCount }}</span><span class="adc-stat-lbl">Posts</span></div>
                        <div class="adc-stat"><span class="adc-stat-val">{{ getAccountEngagement(acc.AccountId) }}%</span><span class="adc-stat-lbl">Engage</span></div>
                    </div>
                    <div class="adc-config-summary">
                        <span><b>Source:</b> {{ acc.ContentSource }}</span>
                        <span><b>Captions:</b> {{ acc.CaptionMode }}</span>
                        <span><b>Rate:</b> {{ acc.PostsPerDay }}/day</span>
                    </div>
                    <div v-if="acc.LoginErrorMessage" class="adc-error">{{ acc.LoginErrorMessage }}</div>
                    <div v-if="acc.Notes" class="adc-notes">{{ acc.Notes }}</div>
                    <div class="adc-footer">
                        <span>Added {{ formatDate(acc.AddedDate) }}</span>
                        <span>Last post {{ timeAgo(acc.LastPostTime) }}</span>
                    </div>
                </div>
                <div v-if="accounts.length === 0" class="og-empty">No accounts.</div>
            </div>
        </div>

        <!-- ═══════════════ TAB: Post Queue ═══════════════ -->
        <div v-show="statsLoaded && activeTab === 'queue'" class="og-panel fade-in">
            <div class="og-section">
                <div class="og-section-header">
                    <h2>Post Queue ({{ queue.length }})</h2>
                    <div class="og-section-actions">
                        <button class="og-btn-sm" @click="triggerContentPull">⚡ Queue Content from Sources Now</button>
                    </div>
                </div>
                <div class="og-table-wrap">
                    <table v-if="queue.length > 0" class="og-table">
                        <thead>
                            <tr>
                                <th>Account</th>
                                <th>Type</th>
                                <th>Caption</th>
                                <th>Scheduled</th>
                                <th>Source</th>
                                <th>Media</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="post in queue" :key="post.PostId">
                                <td>@{{ post.Username || getAccountUsername(post.AccountId) }}</td>
                                <td><span class="type-pill">{{ post.ContentType }}</span></td>
                                <td class="td-caption">{{ truncate(post.Caption, 60) }}</td>
                                <td>{{ formatDate(post.ScheduledTime) }}</td>
                                <td><span class="source-badge">{{ post.SourceType }}</span></td>
                                <td>{{ post.MediaCount }}</td>
                                <td><button class="og-btn-cancel" @click="cancelPost(post.PostId)">Cancel</button></td>
                            </tr>
                        </tbody>
                    </table>
                    <div v-else class="og-empty">Queue empty. Content will be pulled automatically based on account configurations.</div>
                </div>
            </div>

            <!-- Post History -->
            <div class="og-section">
                <div class="og-section-header">
                    <h2>Post History</h2>
                    <div class="og-section-actions">
                        <select v-model="postHistoryFilter" class="og-select">
                            <option value="">All</option>
                            <option value="Posted">Posted</option>
                            <option value="Failed">Failed</option>
                        </select>
                    </div>
                </div>
                <div class="og-table-wrap">
                    <table v-if="filteredPosts.length > 0" class="og-table">
                        <thead>
                            <tr>
                                <th>Account</th>
                                <th>Type</th>
                                <th>Caption</th>
                                <th>Status</th>
                                <th>Posted</th>
                                <th>Source</th>
                                <th>Error</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="post in filteredPosts.slice(0, 50)" :key="post.PostId" :class="{ 'row-error': post.Status === 'Failed' }">
                                <td>@{{ post.Username || getAccountUsername(post.AccountId) }}</td>
                                <td><span class="type-pill">{{ post.ContentType }}</span></td>
                                <td class="td-caption">{{ truncate(post.Caption, 50) }}</td>
                                <td><span class="status-pill sm" :class="post.Status === 'Posted' ? 'status-ok' : 'status-error'">{{ post.Status }}</span></td>
                                <td>{{ post.PostedTime ? formatDate(post.PostedTime) : '-' }}</td>
                                <td><span class="source-badge">{{ post.SourceType }}</span></td>
                                <td class="td-error">{{ truncate(post.ErrorMessage, 40) }}</td>
                            </tr>
                        </tbody>
                    </table>
                    <div v-else class="og-empty">No post history.</div>
                </div>
            </div>
        </div>

        <!-- ═══════════════ TAB: Analytics ═══════════════ -->
        <div v-show="statsLoaded && activeTab === 'analytics'" class="og-panel fade-in">
            <!-- Account Selector -->
            <div class="og-analytics-header">
                <select v-model="selectedAnalyticsAccount" class="og-select wide" @change="loadAccountAnalytics">
                    <option value="">Fleet Overview</option>
                    <option v-for="acc in accounts" :key="acc.AccountId" :value="acc.AccountId">@{{ acc.Username }}</option>
                </select>
                <div class="og-range-pills">
                    <button v-for="r in ['7d','30d','90d']" :key="r" class="range-pill" :class="{ active: analyticsRange === r }" @click="analyticsRange = r; loadAccountAnalytics()">{{ r }}</button>
                </div>
            </div>

            <!-- Fleet Summary Cards -->
            <div v-if="!selectedAnalyticsAccount" class="og-analytics-fleet">
                <div v-for="summary in analytics" :key="summary.AccountId" class="og-analytics-card">
                    <div class="anc-header">
                        <span class="anc-username">@{{ summary.Username }}</span>
                        <span class="anc-engagement">{{ summary.LatestEngagementRate }}%</span>
                    </div>
                    <div class="anc-metrics">
                        <div class="anc-metric">
                            <span class="anc-val">{{ formatNumber(summary.CurrentFollowers) }}</span>
                            <span class="anc-lbl">Followers</span>
                        </div>
                        <div class="anc-metric">
                            <span class="anc-val" :class="summary.FollowerChange7d >= 0 ? 'trend-up' : 'trend-down'">
                                {{ summary.FollowerChange7d >= 0 ? '+' : '' }}{{ summary.FollowerChange7d }}
                            </span>
                            <span class="anc-lbl">7d Change</span>
                        </div>
                        <div class="anc-metric">
                            <span class="anc-val" :class="summary.FollowerChange30d >= 0 ? 'trend-up' : 'trend-down'">
                                {{ summary.FollowerChange30d >= 0 ? '+' : '' }}{{ summary.FollowerChange30d }}
                            </span>
                            <span class="anc-lbl">30d Change</span>
                        </div>
                        <div class="anc-metric">
                            <span class="anc-val">{{ summary.AvgEngagement7d }}%</span>
                            <span class="anc-lbl">Avg 7d Eng</span>
                        </div>
                    </div>
                    <div class="anc-posts-row">
                        <span>{{ summary.TotalPostsLast7d }} posts (7d)</span>
                        <span>{{ summary.TotalPostsLast30d }} posts (30d)</span>
                        <span>Peak: {{ formatNumber(summary.PeakFollowerCount) }}</span>
                    </div>
                    <button class="og-btn-sm full" @click="selectedAnalyticsAccount = summary.AccountId; loadAccountAnalytics()">View Detailed Analytics</button>
                </div>
                <div v-if="analytics.length === 0" class="og-empty">No analytics data yet. Snapshots are taken daily.</div>
            </div>

            <!-- Single Account Deep Analytics -->
            <div v-else class="og-analytics-detail">
                <div v-if="selectedAccountAnalytics" class="analytics-detail-content">
                    <!-- Summary row -->
                    <div class="og-kpi-grid small">
                        <div class="og-kpi sm">
                            <span class="kpi-value sm">{{ formatNumber(selectedAccountAnalytics.CurrentFollowers) }}</span>
                            <span class="kpi-label">Followers</span>
                        </div>
                        <div class="og-kpi sm">
                            <span class="kpi-value sm" :class="selectedAccountAnalytics.FollowerChange1d >= 0 ? 'trend-up' : 'trend-down'">
                                {{ selectedAccountAnalytics.FollowerChange1d >= 0 ? '+' : '' }}{{ selectedAccountAnalytics.FollowerChange1d }}
                            </span>
                            <span class="kpi-label">Today</span>
                        </div>
                        <div class="og-kpi sm">
                            <span class="kpi-value sm" :class="selectedAccountAnalytics.FollowerChange7d >= 0 ? 'trend-up' : 'trend-down'">
                                {{ selectedAccountAnalytics.FollowerChange7d >= 0 ? '+' : '' }}{{ selectedAccountAnalytics.FollowerChange7d }}
                            </span>
                            <span class="kpi-label">7 Days</span>
                        </div>
                        <div class="og-kpi sm">
                            <span class="kpi-value sm" :class="selectedAccountAnalytics.FollowerChange30d >= 0 ? 'trend-up' : 'trend-down'">
                                {{ selectedAccountAnalytics.FollowerChange30d >= 0 ? '+' : '' }}{{ selectedAccountAnalytics.FollowerChange30d }}
                            </span>
                            <span class="kpi-label">30 Days</span>
                        </div>
                        <div class="og-kpi sm">
                            <span class="kpi-value sm">{{ selectedAccountAnalytics.LatestEngagementRate }}%</span>
                            <span class="kpi-label">Engagement</span>
                        </div>
                        <div class="og-kpi sm">
                            <span class="kpi-value sm">{{ selectedAccountAnalytics.BestEngagementRate }}%</span>
                            <span class="kpi-label">Best Eng</span>
                        </div>
                    </div>

                    <!-- Charts -->
                    <div class="og-charts-grid">
                        <div class="og-chart-container">
                            <h3>Follower Growth</h3>
                            <canvas ref="followerChartRef"></canvas>
                        </div>
                        <div class="og-chart-container">
                            <h3>Engagement Rate</h3>
                            <canvas ref="engagementChartRef"></canvas>
                        </div>
                    </div>
                </div>
                <div v-else class="og-empty">Loading analytics...</div>
            </div>
        </div>

        <!-- ═══════════════ TAB: Content Config ═══════════════ -->
        <div v-show="statsLoaded && activeTab === 'config'" class="og-panel fade-in">
            <div class="og-config-account-select">
                <select v-model="configAccountId" class="og-select wide" @change="loadAccountConfig">
                    <option value="">Select an account to configure...</option>
                    <option v-for="acc in accounts" :key="acc.AccountId" :value="acc.AccountId">@{{ acc.Username }}</option>
                </select>
            </div>

            <div v-if="configAccountId && editConfig" class="og-config-panel">
                <div class="og-config-grid">
                    <!-- Content Source -->
                    <div class="config-section">
                        <h3>Content Source</h3>
                        <div class="config-row">
                            <label>Source Type</label>
                            <select v-model="editConfig.ContentSource" class="og-select">
                                <option value="MemeScraper">MemeScraper (Auto-pull reels)</option>
                                <option value="ManualUpload">Manual Upload</option>
                                <option value="ContentFolder">Content Folder</option>
                            </select>
                        </div>
                        <div v-if="editConfig.ContentSource === 'ContentFolder'" class="config-row">
                            <label>Folder Path</label>
                            <input v-model="editConfig.ContentFolderPath" class="og-input" placeholder="C:\path\to\content\folder" />
                        </div>
                        <div v-if="editConfig.ContentSource === 'MemeScraper'" class="config-row">
                            <label>Niche Filter (comma-separated)</label>
                            <input v-model="editConfig.MemeScraperNicheFilter" class="og-input" placeholder="e.g. memes,funny,relatable" />
                        </div>
                        <div class="config-row">
                            <label>Selection Mode</label>
                            <select v-model="editConfig.SelectionMode" class="og-select">
                                <option value="Random">Random</option>
                                <option value="Sequential">Sequential</option>
                            </select>
                        </div>
                    </div>

                    <!-- Content Types -->
                    <div class="config-section">
                        <h3>Content Types</h3>
                        <div class="config-checkboxes">
                            <label class="og-checkbox" v-for="ct in ['Photo','Reel','Story','Carousel']" :key="ct">
                                <input type="checkbox" :value="ct" v-model="editConfig.AllowedContentTypes" />
                                <span>{{ ct }}</span>
                            </label>
                        </div>
                    </div>

                    <!-- Captions -->
                    <div class="config-section">
                        <h3>Caption Configuration</h3>
                        <div class="config-row">
                            <label>Caption Mode</label>
                            <select v-model="editConfig.CaptionMode" class="og-select">
                                <option value="Static">Static (same caption every post)</option>
                                <option value="RandomFromList">Random from list</option>
                                <option value="AIGenerated">AI Generated</option>
                            </select>
                        </div>
                        <div v-if="editConfig.CaptionMode === 'Static'" class="config-row">
                            <label>Static Caption</label>
                            <textarea v-model="editConfig.StaticCaption" class="og-textarea" rows="3" placeholder="Enter your caption..."></textarea>
                        </div>
                        <div v-if="editConfig.CaptionMode === 'RandomFromList'" class="config-row">
                            <label>Candidate Captions (one per line)</label>
                            <textarea v-model="candidateCaptionsText" class="og-textarea" rows="6" placeholder="Caption option 1&#10;Caption option 2&#10;Caption option 3"></textarea>
                        </div>
                        <div v-if="editConfig.CaptionMode === 'AIGenerated'" class="config-row">
                            <label>AI Caption Prompt</label>
                            <textarea v-model="editConfig.AICaptionPrompt" class="og-textarea" rows="3" placeholder="Write a short engaging Instagram caption..."></textarea>
                        </div>
                        <div v-if="editConfig.ContentSource === 'MemeScraper'" class="config-row">
                            <label class="og-checkbox">
                                <input type="checkbox" v-model="editConfig.UseAICaptionsForMemeScraper" />
                                <span>Use AI captions for MemeScraper content</span>
                            </label>
                        </div>
                    </div>

                    <!-- Hashtags -->
                    <div class="config-section">
                        <h3>Hashtags</h3>
                        <div class="config-row">
                            <label>Hashtags (comma-separated)</label>
                            <textarea v-model="hashtagsText" class="og-textarea" rows="3" placeholder="#instagram, #viral, #trending"></textarea>
                        </div>
                        <div class="config-row inline">
                            <label class="og-checkbox">
                                <input type="checkbox" v-model="editConfig.RotateHashtags" />
                                <span>Rotate hashtags (random subset each post)</span>
                            </label>
                            <div class="config-row-sm">
                                <label>Max per post:</label>
                                <input type="number" v-model.number="editConfig.MaxHashtagsPerPost" class="og-input sm" min="1" max="30" />
                            </div>
                        </div>
                    </div>

                    <!-- Scheduling -->
                    <div class="config-section">
                        <h3>Scheduling</h3>
                        <div class="config-row inline">
                            <div class="config-row-sm">
                                <label>Posts per day:</label>
                                <input type="number" v-model.number="editConfig.PostsPerDay" class="og-input sm" min="1" max="20" />
                            </div>
                            <div class="config-row-sm">
                                <label>Min interval (min):</label>
                                <input type="number" v-model.number="editConfig.MinIntervalMinutes" class="og-input sm" min="30" max="1440" />
                            </div>
                        </div>
                        <div class="config-row">
                            <label>Preferred Post Hours (UTC)</label>
                            <input v-model="preferredHoursText" class="og-input" placeholder="9, 13, 18" />
                        </div>
                        <div class="config-row">
                            <label>Active Days</label>
                            <div class="config-checkboxes">
                                <label class="og-checkbox" v-for="(day, idx) in ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']" :key="idx">
                                    <input type="checkbox" :value="idx" v-model="editConfig.ActiveDaysOfWeek" />
                                    <span>{{ day }}</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="og-config-actions">
                    <KMButton message="💾 Save Configuration" @click="saveAccountConfig" style="width: 280px;" />
                    <button class="og-btn-sm danger-btn" @click="resetUsedContent">Reset Used Content Tracking</button>
                </div>
            </div>
            <div v-else-if="!configAccountId" class="og-empty">Select an account above to configure its content settings.</div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import KMButton from '~/components/KMButton.vue';
import Swal from 'sweetalert2';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

definePageMeta({ layout: 'navbar' });

const isLoading = ref(false);
const statsLoaded = ref(false);
const activeTab = ref('overview');

const stats = ref<any>(null);
const accounts = ref<any[]>([]);
const queue = ref<any[]>([]);
const posts = ref<any[]>([]);
const analytics = ref<any[]>([]);
const events = ref<any[]>([]);
const postHistoryFilter = ref('');

// Analytics
const selectedAnalyticsAccount = ref('');
const analyticsRange = ref('30d');
const selectedAccountAnalytics = ref<any>(null);
const followerChartRef = ref<HTMLCanvasElement | null>(null);
const engagementChartRef = ref<HTMLCanvasElement | null>(null);
let followerChart: Chart | null = null;
let engagementChart: Chart | null = null;

// Config
const configAccountId = ref('');
const editConfig = ref<any>(null);
const candidateCaptionsText = ref('');
const hashtagsText = ref('');
const preferredHoursText = ref('');

const tabs = computed(() => [
    { id: 'overview', icon: '🏠', label: 'Fleet Overview', badge: null },
    { id: 'accounts', icon: '👥', label: 'Accounts', badge: accounts.value.length || null },
    { id: 'queue', icon: '📋', label: 'Post Queue', badge: queue.value.length || null },
    { id: 'analytics', icon: '📊', label: 'Analytics', badge: null },
    { id: 'config', icon: '⚙️', label: 'Content Config', badge: null },
]);

const filteredPosts = computed(() => {
    let result = posts.value.filter(p => p.Status !== 'Queued');
    if (postHistoryFilter.value)
        result = result.filter(p => p.Status === postHistoryFilter.value);
    return result;
});

// ── Data Loading ──

async function refreshAll() {
    isLoading.value = true;
    try {
        await Promise.all([loadStats(), loadAccounts(), loadQueue(), loadPosts(), loadAnalytics(), loadEvents()]);
    } finally {
        isLoading.value = false;
        statsLoaded.value = true;
    }
}

async function loadStats() {
    try {
        const r = await RequestGETFromKliveAPI('/omnigram/dashboard-stats');
        if (r) stats.value = JSON.parse(r);
    } catch (e) { console.error('Stats:', e); }
}

async function loadAccounts() {
    try {
        const r = await RequestGETFromKliveAPI('/omnigram/accounts');
        if (r) accounts.value = JSON.parse(r);
    } catch (e) { console.error('Accounts:', e); }
}

async function loadQueue() {
    try {
        const r = await RequestGETFromKliveAPI('/omnigram/queue');
        if (r) queue.value = JSON.parse(r);
    } catch (e) { console.error('Queue:', e); }
}

async function loadPosts() {
    try {
        const r = await RequestGETFromKliveAPI('/omnigram/posts');
        if (r) posts.value = JSON.parse(r);
    } catch (e) { console.error('Posts:', e); }
}

async function loadAnalytics() {
    try {
        const r = await RequestGETFromKliveAPI('/omnigram/analytics');
        if (r) analytics.value = JSON.parse(r);
    } catch (e) { console.error('Analytics:', e); }
}

async function loadEvents() {
    try {
        const r = await RequestGETFromKliveAPI('/omnigram/events');
        if (r) events.value = JSON.parse(r);
    } catch (e) { console.error('Events:', e); }
}

// ── Account Actions ──

async function showAddAccount() {
    const { value } = await Swal.fire({
        title: 'Add Instagram Account',
        html: '<input id="swal-username" class="swal2-input" placeholder="Instagram username">' +
              '<input id="swal-password" class="swal2-input" type="password" placeholder="Password">',
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Add Account',
        confirmButtonColor: '#4d9e39',
        background: '#161516',
        color: '#ffffff',
        preConfirm: () => {
            const username = (document.getElementById('swal-username') as HTMLInputElement)?.value;
            const password = (document.getElementById('swal-password') as HTMLInputElement)?.value;
            if (!username || !password) { Swal.showValidationMessage('Both fields are required'); return false; }
            return { username, password };
        }
    });
    if (value) {
        try {
            isLoading.value = true;
            await RequestPOSTFromKliveAPI('/omnigram/accounts/add', JSON.stringify(value));
            await Swal.fire({ title: 'Success', text: `Account @${value.username} added. Check login status.`, icon: 'success', background: '#161516', color: '#fff', confirmButtonColor: '#4d9e39' });
            await refreshAll();
        } catch (e) {
            await Swal.fire({ title: 'Error', text: 'Failed to add account.', icon: 'error', background: '#161516', color: '#fff' });
        } finally { isLoading.value = false; }
    }
}

async function pauseAccount(id: string) {
    await RequestPOSTFromKliveAPI('/omnigram/accounts/pause', JSON.stringify({ accountId: id }));
    await loadAccounts();
}

async function resumeAccount(id: string) {
    await RequestPOSTFromKliveAPI('/omnigram/accounts/resume', JSON.stringify({ accountId: id }));
    await loadAccounts();
}

async function removeAccount(id: string, username: string) {
    const result = await Swal.fire({
        title: `Remove @${username}?`,
        text: 'This permanently removes the account, session, and all configuration.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Remove',
        confirmButtonColor: '#ef4444',
        background: '#161516',
        color: '#ffffff'
    });
    if (result.isConfirmed) {
        await RequestPOSTFromKliveAPI('/omnigram/accounts/remove', JSON.stringify({ accountId: id }));
        await refreshAll();
    }
}

async function cancelPost(postId: string) {
    await RequestPOSTFromKliveAPI('/omnigram/posts/cancel', JSON.stringify({ postId }));
    await loadQueue();
}

async function triggerContentPull() {
    await RequestPOSTFromKliveAPI('/omnigram/posts/trigger-pull', '{}');
    await Swal.fire({ title: 'Content Queued', text: 'Posts have been pulled from MemeScraper and configured content folders and added to the queue.', icon: 'success', timer: 2000, showConfirmButton: false, background: '#161516', color: '#fff' });
    await refreshAll();
}

// ── Account Config ──

function openAccountConfig(id: string) {
    activeTab.value = 'config';
    configAccountId.value = id;
    loadAccountConfig();
}

function openAccountAnalytics(id: string) {
    activeTab.value = 'analytics';
    selectedAnalyticsAccount.value = id;
    loadAccountAnalytics();
}

async function loadAccountConfig() {
    if (!configAccountId.value) { editConfig.value = null; return; }
    try {
        const r = await RequestGETFromKliveAPI(`/omnigram/accounts/config?accountId=${configAccountId.value}`);
        if (r) {
            editConfig.value = JSON.parse(r);
            candidateCaptionsText.value = (editConfig.value.CandidateCaptions || []).join('\n');
            hashtagsText.value = (editConfig.value.Hashtags || []).join(', ');
            preferredHoursText.value = (editConfig.value.PreferredPostHoursUTC || []).join(', ');
        }
    } catch (e) { console.error('Config:', e); }
}

async function saveAccountConfig() {
    if (!configAccountId.value || !editConfig.value) return;

    editConfig.value.CandidateCaptions = candidateCaptionsText.value.split('\n').map((s: string) => s.trim()).filter((s: string) => s);
    editConfig.value.Hashtags = hashtagsText.value.split(',').map((s: string) => s.trim()).filter((s: string) => s);
    editConfig.value.PreferredPostHoursUTC = preferredHoursText.value.split(',').map((s: string) => parseInt(s.trim())).filter((n: number) => !isNaN(n));

    await RequestPOSTFromKliveAPI('/omnigram/accounts/config/update', JSON.stringify({
        accountId: configAccountId.value,
        config: editConfig.value
    }));
    await Swal.fire({ title: 'Configuration Saved', icon: 'success', timer: 1500, showConfirmButton: false, background: '#161516', color: '#fff' });
    await loadAccounts();
}

async function resetUsedContent() {
    if (!configAccountId.value) return;
    await RequestPOSTFromKliveAPI('/omnigram/content-folder/reset-used', JSON.stringify({ accountId: configAccountId.value }));
    await Swal.fire({ title: 'Used Content Tracking Reset', icon: 'success', timer: 1500, showConfirmButton: false, background: '#161516', color: '#fff' });
}

// ── Analytics Charts ──

async function loadAccountAnalytics() {
    if (!selectedAnalyticsAccount.value) {
        selectedAccountAnalytics.value = null;
        destroyCharts();
        return;
    }
    try {
        const r = await RequestGETFromKliveAPI(`/omnigram/analytics?accountId=${selectedAnalyticsAccount.value}`);
        if (r) {
            selectedAccountAnalytics.value = JSON.parse(r);
            await nextTick();
            renderCharts();
        }
    } catch (e) { console.error('Account analytics:', e); }
}

function destroyCharts() {
    if (followerChart) { followerChart.destroy(); followerChart = null; }
    if (engagementChart) { engagementChart.destroy(); engagementChart = null; }
}

function renderCharts() {
    destroyCharts();
    const data = selectedAccountAnalytics.value;
    if (!data) return;

    const days = analyticsRange.value === '7d' ? 7 : analyticsRange.value === '90d' ? 90 : 30;
    const cutoff = new Date(Date.now() - days * 86400000);

    const fHistory = (data.FollowerHistory || []).filter((p: any) => new Date(p.Timestamp) >= cutoff);
    const eHistory = (data.EngagementHistory || []).filter((p: any) => new Date(p.Timestamp) >= cutoff);

    const chartOpts = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: { backgroundColor: 'rgba(22,22,22,0.9)', borderColor: '#4d9e39', borderWidth: 1 }
        },
        scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#969696', maxTicksLimit: 8 } },
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#969696' } }
        }
    };

    if (followerChartRef.value && fHistory.length > 0) {
        followerChart = new Chart(followerChartRef.value, {
            type: 'line',
            data: {
                labels: fHistory.map((p: any) => new Date(p.Timestamp).toLocaleDateString()),
                datasets: [{
                    data: fHistory.map((p: any) => p.Value),
                    borderColor: '#4d9e39',
                    backgroundColor: 'rgba(77,158,57,0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 2
                }]
            },
            options: chartOpts as any
        });
    }

    if (engagementChartRef.value && eHistory.length > 0) {
        engagementChart = new Chart(engagementChartRef.value, {
            type: 'line',
            data: {
                labels: eHistory.map((p: any) => new Date(p.Timestamp).toLocaleDateString()),
                datasets: [{
                    data: eHistory.map((p: any) => p.Value),
                    borderColor: '#f97316',
                    backgroundColor: 'rgba(249,115,22,0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 2
                }]
            },
            options: chartOpts as any
        });
    }
}

// ── Helpers ──

function getAccountUsername(id: string): string {
    return accounts.value.find((a: any) => a.AccountId === id)?.Username || id;
}

function getAccountEngagement(id: string): number {
    const s = analytics.value.find((a: any) => a.AccountId === id);
    return s?.LatestEngagementRate || 0;
}

function getStatusClass(status: string): string {
    switch (status) {
        case 'LoggedIn': return 'status-ok';
        case 'LoggedOut': return 'status-warn';
        case 'Awaiting2FA': case 'AwaitingChallenge': return 'status-pending';
        case 'RateLimited': case 'ChallengeTimedOut': return 'status-warn';
        default: return 'status-error';
    }
}

function isErrorStatus(status: string): boolean {
    return ['Error', 'CredentialsInvalid', 'AccountDisabled'].includes(status);
}

function formatNumber(n: number): string {
    if (!n) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
}

function formatDate(d: string): string {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatTime(d: string): string {
    if (!d) return '';
    return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function timeAgo(d: string): string {
    if (!d) return 'never';
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function truncate(str: string, max: number): string {
    if (!str) return '';
    return str.length > max ? str.substring(0, max) + '...' : str;
}

onMounted(() => { refreshAll(); });
</script>

<style scoped>
.og-container { padding: 24px 30px; max-width: 1600px; margin: 0 auto; color: #e0e0e0; }

/* Header */
.og-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.og-header-left { flex-shrink: 0; }
.og-header-center { text-align: center; flex: 1; }
.og-header-right { display: flex; gap: 8px; flex-shrink: 0; }
.og-title { font-size: 1.6rem; font-weight: 700; margin: 0; background: linear-gradient(135deg, #4d9e39, #62ce47); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.og-subtitle { font-size: 0.85rem; color: #888; margin: 2px 0 0; }

/* Tabs */
.og-tabs { display: flex; gap: 4px; margin-bottom: 20px; background: rgba(255,255,255,0.03); border-radius: 12px; padding: 4px; border: 1px solid rgba(255,255,255,0.06); }
.og-tab { display: flex; align-items: center; gap: 6px; padding: 8px 16px; border: none; background: transparent; color: #888; border-radius: 8px; cursor: pointer; font-size: 0.85rem; transition: all 0.2s; }
.og-tab:hover { color: #ccc; background: rgba(255,255,255,0.04); }
.og-tab.active { background: rgba(77,158,57,0.15); color: #d7ffd0; border: 1px solid rgba(77,158,57,0.3); }
.tab-icon { font-size: 1rem; }
.tab-badge { background: rgba(77,158,57,0.3); color: #62ce47; padding: 1px 7px; border-radius: 10px; font-size: 0.7rem; font-weight: 600; }

/* Loading */
.og-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 300px; }
.og-loading h3 { color: #fff; margin: 12px 0 4px; }
.og-loading p { color: #888; margin: 0; }
.og-spinner { width: 36px; height: 36px; border: 3px solid rgba(77,158,57,0.3); border-top: 3px solid #4d9e39; border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.og-panel { animation: fadeIn 0.2s ease-in; }
.fade-in { animation: fadeIn 0.2s ease-in; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

/* KPI Grid */
.og-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
.og-kpi-grid.small { grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; }
.og-kpi { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding: 14px 16px; display: flex; align-items: center; gap: 12px; }
.og-kpi.sm { padding: 10px 12px; }
.kpi-icon { font-size: 1.6rem; }
.kpi-data { display: flex; flex-direction: column; }
.kpi-value { font-size: 1.4rem; font-weight: 700; line-height: 1.2; }
.kpi-value.sm { font-size: 1.1rem; }
.kpi-value small { font-size: 0.7em; color: #888; font-weight: 400; }
.kpi-label { font-size: 0.72rem; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
.kpi-trend { font-size: 0.75rem; font-weight: 600; }
.kpi-sub { font-size: 0.72rem; color: #666; }
.trend-up { color: #4caf50; }
.trend-down { color: #ef4444; }

/* Sections */
.og-section { margin-bottom: 24px; }
.og-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.og-section-header h2 { margin: 0; font-size: 1.05rem; font-weight: 600; color: #ccc; }
.og-section-actions { display: flex; gap: 8px; }

/* Table */
.og-table-wrap { overflow-x: auto; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; }
.og-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.og-table th { text-align: left; padding: 10px 14px; color: #888; font-weight: 500; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(255,255,255,0.06); }
.og-table td { padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.03); }
.og-table tr:hover { background: rgba(255,255,255,0.02); }
.og-table tr.row-paused { opacity: 0.6; }
.og-table tr.row-error td { color: #ef4444; }
.td-account { min-width: 160px; }
.account-name { font-weight: 600; }
.account-tags { display: flex; gap: 4px; margin-top: 2px; }
.tag-pill { font-size: 0.65rem; padding: 1px 6px; background: rgba(77,158,57,0.15); color: #62ce47; border-radius: 8px; }
.td-caption { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #aaa; }
.td-error { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #888; font-size: 0.8rem; }
.td-actions { display: flex; gap: 4px; }

/* Buttons */
.og-btn-sm { padding: 5px 12px; border: 1px solid rgba(77,158,57,0.3); border-radius: 6px; background: rgba(77,158,57,0.1); color: #62ce47; cursor: pointer; font-size: 0.78rem; transition: all 0.2s; }
.og-btn-sm:hover { background: rgba(77,158,57,0.2); border-color: rgba(77,158,57,0.5); }
.og-btn-sm.full { width: 100%; margin-top: 8px; }
.og-btn-sm.danger-btn { border-color: rgba(239,68,68,0.3); background: rgba(239,68,68,0.1); color: #ef4444; }
.og-btn-sm.danger-btn:hover { background: rgba(239,68,68,0.2); }
.og-btn-icon { width: 28px; height: 28px; border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; background: transparent; cursor: pointer; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
.og-btn-icon:hover { background: rgba(255,255,255,0.06); }
.og-btn-icon.danger:hover { border-color: rgba(239,68,68,0.4); }
.og-btn-cancel { padding: 3px 10px; border: 1px solid rgba(239,68,68,0.3); border-radius: 5px; background: transparent; color: #ef4444; cursor: pointer; font-size: 0.78rem; }
.og-btn-cancel:hover { background: rgba(239,68,68,0.1); }

/* Status & Type pills */
.status-pill { font-size: 0.7rem; padding: 3px 8px; border-radius: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }
.status-pill.sm { font-size: 0.65rem; padding: 2px 6px; }
.status-ok { background: rgba(76,175,80,0.2); color: #4caf50; }
.status-warn { background: rgba(255,193,7,0.2); color: #ffc107; }
.status-pending { background: rgba(33,150,243,0.2); color: #2196f3; }
.status-error { background: rgba(244,67,54,0.2); color: #f44336; }
.type-pill { font-size: 0.72rem; padding: 2px 8px; border-radius: 10px; background: rgba(249,115,22,0.15); color: #f97316; }
.source-badge { font-size: 0.72rem; padding: 2px 8px; border-radius: 10px; background: rgba(139,92,246,0.12); color: rgba(167,139,250,0.9); }

/* Empty state */
.og-empty { text-align: center; padding: 40px; color: #555; font-size: 0.9rem; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.07); border-radius: 10px; }
.og-empty-sm { text-align: center; padding: 16px; color: #555; font-size: 0.85rem; }

/* Events */
.og-events-list { max-height: 320px; overflow-y: auto; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; }
.og-event { display: flex; gap: 12px; padding: 8px 14px; border-bottom: 1px solid rgba(255,255,255,0.03); font-size: 0.82rem; align-items: center; }
.og-event.evt-error { border-left: 3px solid #ef4444; }
.og-event.evt-warning { border-left: 3px solid #fbbf24; }
.evt-time { color: #666; min-width: 60px; font-size: 0.75rem; }
.evt-type { color: #4d9e39; min-width: 120px; font-weight: 600; font-size: 0.78rem; }
.evt-msg { color: #aaa; flex: 1; }

/* Accounts Detail Grid */
.og-accounts-detail-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; }
.og-account-detail-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 16px; transition: all 0.2s; }
.og-account-detail-card:hover { border-color: rgba(77,158,57,0.3); }
.og-account-detail-card.card-paused { opacity: 0.65; border-color: rgba(255,193,7,0.2); }
.og-account-detail-card.card-error { border-color: rgba(239,68,68,0.3); }
.adc-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.adc-identity { display: flex; align-items: center; gap: 8px; }
.adc-username { font-weight: 600; font-size: 1.05rem; }
.adc-actions { display: flex; gap: 4px; }
.adc-stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 10px; }
.adc-stat { text-align: center; }
.adc-stat-val { display: block; font-weight: 700; font-size: 1rem; }
.adc-stat-lbl { font-size: 0.68rem; color: #888; text-transform: uppercase; }
.adc-config-summary { display: flex; gap: 12px; font-size: 0.78rem; color: #999; margin-bottom: 6px; flex-wrap: wrap; }
.adc-config-summary b { color: #bbb; }
.adc-error { font-size: 0.78rem; color: #ef4444; padding: 5px 8px; background: rgba(239,68,68,0.08); border-radius: 6px; margin-bottom: 6px; }
.adc-notes { font-size: 0.78rem; color: #999; font-style: italic; margin-bottom: 6px; }
.adc-footer { display: flex; justify-content: space-between; font-size: 0.72rem; color: #666; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.04); }

/* Select */
.og-select { background: #1a1a1a; border: 1px solid rgba(255,255,255,0.1); color: #e0e0e0; padding: 6px 10px; border-radius: 6px; font-size: 0.82rem; }
.og-select.wide { min-width: 280px; }

/* Analytics */
.og-analytics-header { display: flex; gap: 12px; align-items: center; margin-bottom: 20px; }
.og-range-pills { display: flex; gap: 4px; }
.range-pill { padding: 5px 12px; border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; background: transparent; color: #888; cursor: pointer; font-size: 0.78rem; }
.range-pill.active { background: rgba(77,158,57,0.2); border-color: rgba(77,158,57,0.5); color: #d7ffd0; }

.og-analytics-fleet { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }
.og-analytics-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 16px; }
.og-analytics-card:hover { border-color: rgba(77,158,57,0.25); }
.anc-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.anc-username { font-weight: 600; font-size: 1rem; }
.anc-engagement { font-size: 0.85rem; color: #4d9e39; font-weight: 600; }
.anc-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 10px; }
.anc-metric { text-align: center; }
.anc-val { display: block; font-weight: 700; font-size: 0.95rem; }
.anc-lbl { font-size: 0.65rem; color: #888; text-transform: uppercase; }
.anc-posts-row { display: flex; gap: 12px; font-size: 0.75rem; color: #888; margin-bottom: 8px; }

/* Charts */
.og-charts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 16px; margin-top: 16px; }
.og-chart-container { background: rgba(23,23,23,0.5); border: 1px solid rgba(77,158,57,0.2); border-radius: 12px; padding: 16px; height: 300px; }
.og-chart-container h3 { margin: 0 0 10px; font-size: 0.9rem; color: #ccc; }
.og-chart-container canvas { max-height: 250px; }

/* Config Panel */
.og-config-account-select { margin-bottom: 16px; }
.og-config-panel { animation: fadeIn 0.2s ease-in; }
.og-config-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 16px; }
.config-section { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 16px; }
.config-section h3 { margin: 0 0 12px; font-size: 0.95rem; color: #ccc; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px; }
.config-row { margin-bottom: 10px; }
.config-row label { display: block; font-size: 0.78rem; color: #888; margin-bottom: 4px; }
.config-row.inline { display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap; }
.config-row-sm { display: flex; align-items: center; gap: 6px; }
.config-row-sm label { margin-bottom: 0; }
.config-checkboxes { display: flex; gap: 12px; flex-wrap: wrap; }
.og-checkbox { display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 0.82rem; color: #ccc; }
.og-checkbox input[type="checkbox"] { accent-color: #4d9e39; }
.og-input { width: 100%; background: #1a1a1a; border: 1px solid rgba(255,255,255,0.1); color: #e0e0e0; padding: 7px 10px; border-radius: 6px; font-size: 0.82rem; box-sizing: border-box; }
.og-input.sm { width: 70px; }
.og-input:focus { outline: none; border-color: rgba(77,158,57,0.5); }
.og-textarea { width: 100%; background: #1a1a1a; border: 1px solid rgba(255,255,255,0.1); color: #e0e0e0; padding: 7px 10px; border-radius: 6px; font-size: 0.82rem; resize: vertical; font-family: inherit; box-sizing: border-box; }
.og-textarea:focus { outline: none; border-color: rgba(77,158,57,0.5); }
.og-config-actions { display: flex; gap: 12px; align-items: center; margin-top: 20px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.06); }

/* Scrollbar */
.og-events-list::-webkit-scrollbar { width: 8px; }
.og-events-list::-webkit-scrollbar-track { background: transparent; }
.og-events-list::-webkit-scrollbar-thumb { background: rgba(77,158,57,0.2); border-radius: 4px; }
.og-events-list::-webkit-scrollbar-thumb:hover { background: rgba(77,158,57,0.4); }
</style>
