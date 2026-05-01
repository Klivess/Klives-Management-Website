<template>
    <div class="ot-container">
        <!-- Header -->
        <div class="ot-header">
            <div class="ot-header-left">
                <KMButton style="width: 360px;" message="Back To Schemes" @click="$router.push('/schemes')" />
            </div>
            <div class="ot-header-center">
                <h1 class="ot-title">OmniTumblr Command Center</h1>
                <p class="ot-subtitle">Fleet management &bull; {{ stats?.TotalAccounts || 0 }} blogs &bull; {{ stats?.TotalFollowers ? formatNumber(stats.TotalFollowers) : '0' }} total followers</p>
            </div>
            <div class="ot-header-right">
                <KMButton message="➕ Add Blog" @click="showAddAccount" style="width: 280px;" />
                <KMButton message="🔄 Refresh" @click="refreshAll" style="width: 240px;" />
            </div>
        </div>

        <!-- Tab Navigation -->
        <div class="ot-tabs">
            <button v-for="tab in tabs" :key="tab.id" class="ot-tab" :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id">
                <span class="tab-icon">{{ tab.icon }}</span>
                <span class="tab-label">{{ tab.label }}</span>
                <span v-if="tab.badge" class="tab-badge">{{ tab.badge }}</span>
            </button>
        </div>

        <!-- Loading -->
        <div v-if="isLoading && !statsLoaded" class="ot-loading">
            <div class="ot-spinner"></div>
            <h3>Loading OmniTumblr</h3>
            <p>Fetching fleet data...</p>
        </div>

        <!-- ═══════════════ TAB: Fleet Overview ═══════════════ -->
        <div v-show="statsLoaded && activeTab === 'overview'" class="ot-panel fade-in">
            <!-- KPI Row -->
            <div class="ot-kpi-grid">
                <div class="ot-kpi">
                    <div class="kpi-icon">📡</div>
                    <div class="kpi-data">
                        <span class="kpi-value">{{ stats?.ActiveAccounts || 0 }}<small>/{{ stats?.TotalAccounts || 0 }}</small></span>
                        <span class="kpi-label">Active Blogs</span>
                    </div>
                </div>
                <div class="ot-kpi">
                    <div class="kpi-icon">👥</div>
                    <div class="kpi-data">
                        <span class="kpi-value">{{ formatNumber(stats?.TotalFollowers || 0) }}</span>
                        <span class="kpi-label">Total Followers</span>
                        <span class="kpi-trend" :class="(stats?.FollowerGainToday || 0) >= 0 ? 'trend-up' : 'trend-down'">
                            {{ (stats?.FollowerGainToday || 0) >= 0 ? '+' : '' }}{{ stats?.FollowerGainToday || 0 }} today
                        </span>
                    </div>
                </div>
                <div class="ot-kpi">
                    <div class="kpi-icon">📈</div>
                    <div class="kpi-data">
                        <span class="kpi-value">{{ stats?.AvgEngagementRate || 0 }}%</span>
                        <span class="kpi-label">Avg Engagement</span>
                    </div>
                </div>
                <div class="ot-kpi">
                    <div class="kpi-icon">📤</div>
                    <div class="kpi-data">
                        <span class="kpi-value">{{ stats?.PostsToday || 0 }}</span>
                        <span class="kpi-label">Posts Today</span>
                        <span class="kpi-sub">{{ stats?.PostsThisWeek || 0 }} this week</span>
                    </div>
                </div>
                <div class="ot-kpi">
                    <div class="kpi-icon">✅</div>
                    <div class="kpi-data">
                        <span class="kpi-value">{{ stats?.SuccessRate || 0 }}%</span>
                        <span class="kpi-label">Success Rate</span>
                        <span class="kpi-sub">{{ stats?.FailedCount || 0 }} failed</span>
                    </div>
                </div>
                <div class="ot-kpi">
                    <div class="kpi-icon">⏳</div>
                    <div class="kpi-data">
                        <span class="kpi-value">{{ stats?.PendingCount || 0 }}</span>
                        <span class="kpi-label">Queued Posts</span>
                    </div>
                </div>
            </div>

            <!-- Fleet Table -->
            <div class="ot-section">
                <div class="ot-section-header">
                    <h2>Fleet Status</h2>
                    <div class="ot-section-actions">
                        <button class="ot-btn-sm" @click="triggerContentPull">⚡ Queue Content from Folders</button>
                    </div>
                </div>
                <div class="ot-table-wrap">
                    <table class="ot-table">
                        <thead>
                            <tr>
                                <th>Blog</th>
                                <th>Status</th>
                                <th>Followers</th>
                                <th>Posts</th>
                                <th>Engagement</th>
                                <th>Source</th>
                                <th>Posts/Day</th>
                                <th>Last Post</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="acc in accounts" :key="acc.AccountId" :class="{ 'row-paused': acc.IsPaused, 'row-error': isErrorStatus(acc.ConnectionStatus) }">
                                <td class="td-account">
                                    <span class="account-name">{{ acc.BlogName }}</span>
                                    <span v-if="acc.Tags?.length" class="account-tags">
                                        <span v-for="tag in acc.Tags.slice(0, 3)" :key="tag" class="tag-pill">{{ tag }}</span>
                                    </span>
                                </td>
                                <td><span class="status-pill" :class="getStatusClass(acc.ConnectionStatus)">{{ acc.ConnectionStatus }}</span></td>
                                <td>{{ formatNumber(acc.FollowerCount) }}</td>
                                <td>{{ acc.PostCount }}</td>
                                <td>{{ getAccountEngagement(acc.AccountId) }}%</td>
                                <td><span class="source-badge">{{ acc.ContentSource }}</span></td>
                                <td>{{ acc.PostsPerDay }}</td>
                                <td>{{ timeAgo(acc.LastPostTime) }}</td>
                                <td class="td-actions">
                                    <button class="ot-btn-icon" title="Configure" @click="openAccountConfig(acc.AccountId)">⚙️</button>
                                    <button v-if="!acc.IsPaused" class="ot-btn-icon" title="Pause" @click="pauseAccount(acc.AccountId)">⏸️</button>
                                    <button v-else class="ot-btn-icon" title="Resume" @click="resumeAccount(acc.AccountId)">▶️</button>
                                    <button class="ot-btn-icon" title="Refresh blog info" @click="refreshAccount(acc.AccountId, acc.BlogName)">🔄</button>
                                    <button class="ot-btn-icon" title="Analytics" @click="openAccountAnalytics(acc.AccountId)">📊</button>
                                    <button class="ot-btn-icon danger" title="Remove" @click="removeAccount(acc.AccountId, acc.BlogName)">🗑️</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    <div v-if="accounts.length === 0" class="ot-empty">No blogs added yet. Click "Add Blog" to get started.</div>
                </div>
            </div>

            <!-- Recent Events -->
            <div class="ot-section">
                <div class="ot-section-header">
                    <h2>Recent Activity</h2>
                </div>
                <div class="ot-events-list">
                    <div v-for="(evt, i) in events.slice(0, 15)" :key="i" class="ot-event" :class="'evt-' + evt.Severity?.toLowerCase()">
                        <span class="evt-time">{{ formatTime(evt.Timestamp) }}</span>
                        <span class="evt-type">{{ evt.EventType }}</span>
                        <span class="evt-msg">{{ evt.Message }}</span>
                    </div>
                    <div v-if="events.length === 0" class="ot-empty-sm">No recent events.</div>
                </div>
            </div>
        </div>

        <!-- ═══════════════ TAB: Accounts ═══════════════ -->
        <div v-show="statsLoaded && activeTab === 'accounts'" class="ot-panel fade-in">
            <div class="ot-accounts-detail-grid">
                <div v-for="acc in accounts" :key="acc.AccountId" class="ot-account-detail-card"
                    :class="{ 'card-paused': acc.IsPaused, 'card-error': isErrorStatus(acc.ConnectionStatus) }">
                    <div class="adc-header">
                        <div class="adc-identity">
                            <span class="adc-blogname">{{ acc.BlogName }}</span>
                            <span class="status-pill sm" :class="getStatusClass(acc.ConnectionStatus)">{{ acc.ConnectionStatus }}</span>
                        </div>
                        <div class="adc-actions">
                            <button class="ot-btn-icon" @click="openAccountConfig(acc.AccountId)" title="Configure">⚙️</button>
                            <button v-if="!acc.IsPaused" class="ot-btn-icon" @click="pauseAccount(acc.AccountId)" title="Pause">⏸️</button>
                            <button v-else class="ot-btn-icon" @click="resumeAccount(acc.AccountId)" title="Resume">▶️</button>
                            <button class="ot-btn-icon" @click="refreshAccount(acc.AccountId, acc.BlogName)" title="Refresh blog info">🔄</button>
                        </div>
                    </div>
                    <div class="adc-stats-row">
                        <div class="adc-stat"><span class="adc-stat-val">{{ formatNumber(acc.FollowerCount) }}</span><span class="adc-stat-lbl">Followers</span></div>
                        <div class="adc-stat"><span class="adc-stat-val">{{ acc.PostCount }}</span><span class="adc-stat-lbl">Posts</span></div>
                        <div class="adc-stat"><span class="adc-stat-val">{{ getAccountEngagement(acc.AccountId) }}%</span><span class="adc-stat-lbl">Engage</span></div>
                    </div>
                    <div class="adc-config-summary">
                        <span><b>Source:</b> {{ acc.ContentSource }}</span>
                        <span><b>Captions:</b> {{ acc.CaptionMode }}</span>
                        <span><b>Rate:</b> {{ acc.PostsPerDay }}/day</span>
                    </div>
                    <div v-if="acc.ConnectionErrorMessage" class="adc-error">{{ acc.ConnectionErrorMessage }}</div>
                    <div v-if="acc.Description" class="adc-notes">{{ acc.Description }}</div>
                    <div v-if="acc.Notes" class="adc-notes">{{ acc.Notes }}</div>
                    <div class="adc-footer">
                        <span>Added {{ formatDate(acc.AddedDate) }}</span>
                        <span>Last post {{ timeAgo(acc.LastPostTime) }}</span>
                    </div>
                </div>
                <div v-if="accounts.length === 0" class="ot-empty">No blogs added yet.</div>
            </div>
        </div>

        <!-- ═══════════════ TAB: Post Queue ═══════════════ -->
        <div v-show="statsLoaded && activeTab === 'queue'" class="ot-panel fade-in">
            <div class="ot-section">
                <div class="ot-section-header">
                    <h2>Post Queue ({{ queue.length }})</h2>
                    <div class="ot-section-actions">
                        <button class="ot-btn-sm" @click="triggerContentPull">⚡ Queue Content from Folders Now</button>
                    </div>
                </div>
                <div class="ot-table-wrap">
                    <table v-if="queue.length > 0" class="ot-table">
                        <thead>
                            <tr>
                                <th>Blog</th>
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
                                <td>{{ getBlogName(post.AccountId) }}</td>
                                <td><span class="type-pill">{{ post.PostType }}</span></td>
                                <td class="td-caption">{{ truncate(post.Caption, 60) }}</td>
                                <td>{{ formatDate(post.ScheduledTime) }}</td>
                                <td><span class="source-badge">{{ post.SourceType }}</span></td>
                                <td>{{ post.MediaCount }}</td>
                                <td><button class="ot-btn-cancel" @click="cancelPost(post.PostId)">Cancel</button></td>
                            </tr>
                        </tbody>
                    </table>
                    <div v-else class="ot-empty">Queue empty. Content will be pulled automatically based on account configurations.</div>
                </div>
            </div>

            <!-- Post History -->
            <div class="ot-section">
                <div class="ot-section-header">
                    <h2>Post History</h2>
                    <div class="ot-section-actions">
                        <select v-model="postHistoryFilter" class="ot-select">
                            <option value="">All</option>
                            <option value="Posted">Posted</option>
                            <option value="Failed">Failed</option>
                        </select>
                    </div>
                </div>
                <div class="ot-table-wrap">
                    <table v-if="filteredPosts.length > 0" class="ot-table">
                        <thead>
                            <tr>
                                <th>Blog</th>
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
                                <td>{{ getBlogName(post.AccountId) }}</td>
                                <td><span class="type-pill">{{ post.PostType }}</span></td>
                                <td class="td-caption">{{ truncate(post.Caption, 50) }}</td>
                                <td><span class="status-pill sm" :class="post.Status === 'Posted' ? 'status-ok' : 'status-error'">{{ post.Status }}</span></td>
                                <td>{{ post.PostedTime ? formatDate(post.PostedTime) : '-' }}</td>
                                <td><span class="source-badge">{{ post.SourceType }}</span></td>
                                <td class="td-error">{{ truncate(post.ErrorMessage, 40) }}</td>
                            </tr>
                        </tbody>
                    </table>
                    <div v-else class="ot-empty">No post history.</div>
                </div>
            </div>
        </div>

        <!-- ═══════════════ TAB: Analytics ═══════════════ -->
        <div v-show="statsLoaded && activeTab === 'analytics'" class="ot-panel fade-in">
            <!-- Account Selector -->
            <div class="ot-analytics-header">
                <select v-model="selectedAnalyticsAccount" class="ot-select wide" @change="loadAccountAnalytics">
                    <option value="">Fleet Overview</option>
                    <option v-for="acc in accounts" :key="acc.AccountId" :value="acc.AccountId">{{ acc.BlogName }}</option>
                </select>
                <div class="ot-range-pills">
                    <button v-for="r in ['7d','30d','90d']" :key="r" class="range-pill" :class="{ active: analyticsRange === r }" @click="analyticsRange = r; loadAccountAnalytics()">{{ r }}</button>
                </div>
            </div>

            <!-- Fleet Summary Cards -->
            <div v-if="!selectedAnalyticsAccount" class="ot-analytics-fleet">
                <div v-for="summary in analytics" :key="summary.AccountId" class="ot-analytics-card">
                    <div class="anc-header">
                        <span class="anc-blogname">{{ summary.BlogName }}</span>
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
                    <button class="ot-btn-sm full" @click="selectedAnalyticsAccount = summary.AccountId; loadAccountAnalytics()">View Detailed Analytics</button>
                </div>
                <div v-if="analytics.length === 0" class="ot-empty">No analytics data yet. Snapshots are taken daily.</div>
            </div>

            <!-- Single Account Deep Analytics -->
            <div v-else class="ot-analytics-detail">
                <div v-if="selectedAccountAnalytics" class="analytics-detail-content">
                    <div class="ot-kpi-grid small">
                        <div class="ot-kpi sm">
                            <span class="kpi-value sm">{{ formatNumber(selectedAccountAnalytics.CurrentFollowers) }}</span>
                            <span class="kpi-label">Followers</span>
                        </div>
                        <div class="ot-kpi sm">
                            <span class="kpi-value sm">{{ selectedAccountAnalytics.CurrentPostCount }}</span>
                            <span class="kpi-label">Posts</span>
                        </div>
                        <div class="ot-kpi sm">
                            <span class="kpi-value sm" :class="selectedAccountAnalytics.FollowerChange1d >= 0 ? 'trend-up' : 'trend-down'">
                                {{ selectedAccountAnalytics.FollowerChange1d >= 0 ? '+' : '' }}{{ selectedAccountAnalytics.FollowerChange1d }}
                            </span>
                            <span class="kpi-label">Today</span>
                        </div>
                        <div class="ot-kpi sm">
                            <span class="kpi-value sm" :class="selectedAccountAnalytics.FollowerChange7d >= 0 ? 'trend-up' : 'trend-down'">
                                {{ selectedAccountAnalytics.FollowerChange7d >= 0 ? '+' : '' }}{{ selectedAccountAnalytics.FollowerChange7d }}
                            </span>
                            <span class="kpi-label">7 Days</span>
                        </div>
                        <div class="ot-kpi sm">
                            <span class="kpi-value sm">{{ selectedAccountAnalytics.LatestEngagementRate }}%</span>
                            <span class="kpi-label">Engagement</span>
                        </div>
                        <div class="ot-kpi sm">
                            <span class="kpi-value sm">{{ selectedAccountAnalytics.BestEngagementRate }}%</span>
                            <span class="kpi-label">Best Eng</span>
                        </div>
                    </div>

                    <div class="ot-charts-grid">
                        <div class="ot-chart-container">
                            <h3>Follower Growth</h3>
                            <canvas ref="followerChartRef"></canvas>
                        </div>
                        <div class="ot-chart-container">
                            <h3>Engagement Rate</h3>
                            <canvas ref="engagementChartRef"></canvas>
                        </div>
                    </div>
                </div>
                <div v-else class="ot-empty">Loading analytics...</div>
            </div>
        </div>

        <!-- ═══════════════ TAB: Content Config ═══════════════ -->
        <div v-show="statsLoaded && activeTab === 'config'" class="ot-panel fade-in">
            <div class="ot-config-account-select">
                <select v-model="configAccountId" class="ot-select wide" @change="loadAccountConfig">
                    <option value="">Select a blog to configure...</option>
                    <option v-for="acc in accounts" :key="acc.AccountId" :value="acc.AccountId">{{ acc.BlogName }}</option>
                </select>
            </div>

            <div v-if="configAccountId && editConfig" class="ot-config-panel">
                <div class="ot-config-grid">
                    <!-- Content Source -->
                    <div class="config-section">
                        <h3>Content Source</h3>
                        <div class="config-row">
                            <label>Source Type</label>
                            <select v-model="editConfig.ContentSource" class="ot-select">
                                <option value="ManualUpload">Manual Upload</option>
                                <option value="ContentFolder">Content Folder</option>
                            </select>
                        </div>
                        <div v-if="editConfig.ContentSource === 'ContentFolder'" class="config-row">
                            <label>Folder Path</label>
                            <input v-model="editConfig.ContentFolderPath" class="ot-input" placeholder="C:\path\to\content\folder" />
                        </div>
                        <div class="config-row">
                            <label>Selection Mode</label>
                            <select v-model="editConfig.SelectionMode" class="ot-select">
                                <option value="Random">Random</option>
                                <option value="Sequential">Sequential</option>
                            </select>
                        </div>
                    </div>

                    <!-- Post Types -->
                    <div class="config-section">
                        <h3>Allowed Post Types</h3>
                        <div class="config-checkboxes">
                            <label class="ot-checkbox" v-for="ct in ['Photo','PhotoSet','Video','Text','Quote','Link']" :key="ct">
                                <input type="checkbox" :value="ct" v-model="editConfig.AllowedPostTypes" />
                                <span>{{ ct }}</span>
                            </label>
                        </div>
                    </div>

                    <!-- Captions -->
                    <div class="config-section">
                        <h3>Caption / Body Configuration</h3>
                        <div class="config-row">
                            <label>Caption Mode</label>
                            <select v-model="editConfig.CaptionMode" class="ot-select">
                                <option value="Static">Static (same caption every post)</option>
                                <option value="RandomFromList">Random from list</option>
                                <option value="AIGenerated">AI Generated</option>
                            </select>
                        </div>
                        <div v-if="editConfig.CaptionMode === 'Static'" class="config-row">
                            <label>Static Caption</label>
                            <textarea v-model="editConfig.StaticCaption" class="ot-textarea" rows="3" placeholder="Enter your caption..."></textarea>
                        </div>
                        <div v-if="editConfig.CaptionMode === 'RandomFromList'" class="config-row">
                            <label>Candidate Captions (one per line)</label>
                            <textarea v-model="candidateCaptionsText" class="ot-textarea" rows="6" placeholder="Caption option 1&#10;Caption option 2&#10;Caption option 3"></textarea>
                        </div>
                        <div v-if="editConfig.CaptionMode === 'AIGenerated'" class="config-row">
                            <label>AI Caption Prompt</label>
                            <textarea v-model="editConfig.AICaptionPrompt" class="ot-textarea" rows="3" placeholder="Write a short engaging Tumblr caption..."></textarea>
                        </div>
                    </div>

                    <!-- Tags -->
                    <div class="config-section">
                        <h3>Tags</h3>
                        <div class="config-row">
                            <label>Tags (comma-separated, no # needed)</label>
                            <textarea v-model="tagsText" class="ot-textarea" rows="3" placeholder="photography, art, aesthetic, blog"></textarea>
                        </div>
                        <div class="config-row inline">
                            <label class="ot-checkbox">
                                <input type="checkbox" v-model="editConfig.RotateTags" />
                                <span>Rotate tags (random subset each post)</span>
                            </label>
                            <div class="config-row-sm">
                                <label>Max per post:</label>
                                <input type="number" v-model.number="editConfig.MaxTagsPerPost" class="ot-input sm" min="1" max="30" />
                            </div>
                        </div>
                    </div>

                    <!-- Scheduling -->
                    <div class="config-section">
                        <h3>Scheduling</h3>
                        <div class="config-row inline">
                            <div class="config-row-sm">
                                <label>Posts per day:</label>
                                <input type="number" v-model.number="editConfig.PostsPerDay" class="ot-input sm" min="1" max="20" />
                            </div>
                            <div class="config-row-sm">
                                <label>Min interval (min):</label>
                                <input type="number" v-model.number="editConfig.MinIntervalMinutes" class="ot-input sm" min="30" max="1440" />
                            </div>
                            <div class="config-row-sm">
                                <label>Random offset (±min):</label>
                                <input type="number" v-model.number="editConfig.ScheduleRandomOffsetMinutes" class="ot-input sm" min="0" max="120" />
                            </div>
                        </div>
                        <div class="config-row">
                            <label>Preferred Post Hours (UTC)</label>
                            <input v-model="preferredHoursText" class="ot-input" placeholder="9, 13, 18" />
                        </div>
                        <div class="config-row">
                            <label>Active Days</label>
                            <div class="config-checkboxes">
                                <label class="ot-checkbox" v-for="(day, idx) in ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']" :key="idx">
                                    <input type="checkbox" :value="idx" v-model="editConfig.ActiveDaysOfWeek" />
                                    <span>{{ day }}</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="ot-config-actions">
                    <KMButton message="💾 Save Configuration" @click="saveAccountConfig" style="width: 380px;" />
                    <button class="ot-btn-sm danger-btn" @click="resetUsedContent">Reset Used Content Tracking</button>
                </div>
            </div>
            <div v-else-if="!configAccountId" class="ot-empty">Select a blog above to configure its content settings.</div>
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
const tagsText = ref('');
const preferredHoursText = ref('');

const tabs = computed(() => [
    { id: 'overview', icon: '🏠', label: 'Fleet Overview', badge: null },
    { id: 'accounts', icon: '📝', label: 'Blogs', badge: accounts.value.length || null },
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

onMounted(() => refreshAll());

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
        const r = await RequestGETFromKliveAPI('/omnitumblr/dashboard-stats');
        if (r?.ok) stats.value = await r.json();
    } catch (e) { console.error('Stats:', e); }
}

async function loadAccounts() {
    try {
        const r = await RequestGETFromKliveAPI('/omnitumblr/accounts');
        if (r?.ok) accounts.value = await r.json();
    } catch (e) { console.error('Accounts:', e); }
}

async function loadQueue() {
    try {
        const r = await RequestGETFromKliveAPI('/omnitumblr/queue');
        if (r?.ok) queue.value = await r.json();
    } catch (e) { console.error('Queue:', e); }
}

async function loadPosts() {
    try {
        const r = await RequestGETFromKliveAPI('/omnitumblr/posts');
        if (r?.ok) posts.value = await r.json();
    } catch (e) { console.error('Posts:', e); }
}

async function loadAnalytics() {
    try {
        const results: any[] = [];
        for (const acc of accounts.value) {
            try {
                const r = await RequestGETFromKliveAPI(`/omnitumblr/analytics?accountId=${acc.AccountId}`);
                if (r?.ok) {
                    const data = await r.json();
                    results.push(data);
                }
            } catch { /* skip failed accounts */ }
        }
        analytics.value = results;
    } catch (e) { console.error('Analytics:', e); }
}

async function loadEvents() {
    try {
        const r = await RequestGETFromKliveAPI('/omnitumblr/events');
        if (r?.ok) events.value = await r.json();
    } catch (e) { console.error('Events:', e); }
}

// ── Account Actions ──

async function showAddAccount() {
    const { value } = await Swal.fire({
        title: 'Add Tumblr Blog',
        html: `
            <p style="color:#ccc;font-size:13px;margin-bottom:12px;">Get your OAuth credentials from <a href="https://www.tumblr.com/oauth/apps" target="_blank" style="color:#35465c;">tumblr.com/oauth/apps</a></p>
            <input id="swal-blogname" class="swal2-input" placeholder="Blog name (e.g. myblog)">
            <input id="swal-consumerkey" class="swal2-input" placeholder="Consumer Key">
            <input id="swal-consumersecret" class="swal2-input" type="password" placeholder="Consumer Secret">
            <input id="swal-oauthtoken" class="swal2-input" placeholder="OAuth Token">
            <input id="swal-oauthtokensecret" class="swal2-input" type="password" placeholder="OAuth Token Secret">
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Add Blog',
        confirmButtonColor: '#35465c',
        background: '#161516',
        color: '#ffffff',
        preConfirm: () => {
            const blogName = (document.getElementById('swal-blogname') as HTMLInputElement)?.value?.trim();
            const consumerKey = (document.getElementById('swal-consumerkey') as HTMLInputElement)?.value?.trim();
            const consumerSecret = (document.getElementById('swal-consumersecret') as HTMLInputElement)?.value?.trim();
            const oauthToken = (document.getElementById('swal-oauthtoken') as HTMLInputElement)?.value?.trim();
            const oauthTokenSecret = (document.getElementById('swal-oauthtokensecret') as HTMLInputElement)?.value?.trim();
            if (!blogName || !consumerKey || !consumerSecret || !oauthToken || !oauthTokenSecret) {
                Swal.showValidationMessage('All fields are required');
                return false;
            }
            return { blogName, consumerKey, consumerSecret, oauthToken, oauthTokenSecret };
        }
    });
    if (value) {
        try {
            isLoading.value = true;
            const r = await RequestPOSTFromKliveAPI('/omnitumblr/accounts/add', JSON.stringify(value));
            if (r?.ok) {
                const result = await r.json();
                await Swal.fire({
                    title: 'Blog Added',
                    text: `"${value.blogName}" added successfully. Status: ${result.ConnectionStatus}`,
                    icon: 'success',
                    background: '#161516',
                    color: '#fff',
                    confirmButtonColor: '#35465c'
                });
            } else {
                const err = await r?.text();
                await Swal.fire({ title: 'Error', text: err || 'Failed to add blog.', icon: 'error', background: '#161516', color: '#fff' });
            }
            await refreshAll();
        } catch (e) {
            await Swal.fire({ title: 'Error', text: 'Failed to add blog.', icon: 'error', background: '#161516', color: '#fff' });
        } finally { isLoading.value = false; }
    }
}

async function pauseAccount(id: string) {
    await RequestPOSTFromKliveAPI('/omnitumblr/accounts/pause', JSON.stringify({ accountId: id }));
    await loadAccounts();
}

async function resumeAccount(id: string) {
    await RequestPOSTFromKliveAPI('/omnitumblr/accounts/resume', JSON.stringify({ accountId: id }));
    await loadAccounts();
}

async function removeAccount(id: string, blogName: string) {
    const result = await Swal.fire({
        title: `Remove "${blogName}"?`,
        text: 'This permanently removes the blog and all its configuration.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Remove',
        confirmButtonColor: '#ef4444',
        background: '#161516',
        color: '#ffffff'
    });
    if (result.isConfirmed) {
        await RequestPOSTFromKliveAPI('/omnitumblr/accounts/remove', JSON.stringify({ accountId: id }));
        await refreshAll();
    }
}

async function refreshAccount(id: string, blogName: string) {
    try {
        const r = await RequestPOSTFromKliveAPI('/omnitumblr/accounts/refresh', JSON.stringify({ accountId: id }));
        if (r?.ok) {
            await Swal.fire({
                title: `"${blogName}" refreshed`,
                icon: 'success',
                timer: 1500,
                showConfirmButton: false,
                background: '#161516',
                color: '#fff'
            });
        } else {
            await Swal.fire({ title: 'Refresh Failed', text: await r?.text(), icon: 'error', background: '#161516', color: '#fff' });
        }
        await loadAccounts();
    } catch (e) { console.error('Refresh:', e); }
}

async function cancelPost(postId: string) {
    await RequestPOSTFromKliveAPI('/omnitumblr/posts/cancel', JSON.stringify({ postId }));
    await loadQueue();
}

async function triggerContentPull() {
    await RequestPOSTFromKliveAPI('/omnitumblr/posts/trigger-pull', '{}');
    await Swal.fire({
        title: 'Content Queued',
        text: 'Posts have been pulled from configured content folders and added to the queue.',
        icon: 'success',
        timer: 2000,
        showConfirmButton: false,
        background: '#161516',
        color: '#fff'
    });
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
        const r = await RequestGETFromKliveAPI(`/omnitumblr/accounts/config?accountId=${configAccountId.value}`);
        if (r?.ok) {
            editConfig.value = await r.json();
            candidateCaptionsText.value = (editConfig.value.CandidateCaptions || []).join('\n');
            tagsText.value = (editConfig.value.Tags || []).join(', ');
            preferredHoursText.value = (editConfig.value.PreferredPostHoursUTC || []).join(', ');
        }
    } catch (e) { console.error('Config:', e); }
}

async function saveAccountConfig() {
    if (!configAccountId.value || !editConfig.value) return;

    editConfig.value.CandidateCaptions = candidateCaptionsText.value.split('\n').map((s: string) => s.trim()).filter((s: string) => s);
    editConfig.value.Tags = tagsText.value.split(',').map((s: string) => s.trim().replace(/^#/, '')).filter((s: string) => s);
    editConfig.value.PreferredPostHoursUTC = preferredHoursText.value.split(',').map((s: string) => parseInt(s.trim())).filter((n: number) => !isNaN(n));

    await RequestPOSTFromKliveAPI('/omnitumblr/accounts/config/update', JSON.stringify({
        accountId: configAccountId.value,
        config: editConfig.value
    }));
    await Swal.fire({ title: 'Configuration Saved', icon: 'success', timer: 1500, showConfirmButton: false, background: '#161516', color: '#fff' });
    await loadAccounts();
}

async function resetUsedContent() {
    if (!configAccountId.value) return;
    await RequestPOSTFromKliveAPI('/omnitumblr/content-folder/reset-used', JSON.stringify({ accountId: configAccountId.value }));
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
        const r = await RequestGETFromKliveAPI(`/omnitumblr/analytics?accountId=${selectedAnalyticsAccount.value}`);
        if (r?.ok) {
            selectedAccountAnalytics.value = await r.json();
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
            tooltip: { backgroundColor: 'rgba(22,22,22,0.9)', borderColor: '#35465c', borderWidth: 1 }
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
                    borderColor: '#35465c',
                    backgroundColor: 'rgba(53,70,92,0.2)',
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
                    borderColor: '#001935',
                    backgroundColor: 'rgba(0,25,53,0.2)',
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

function getBlogName(id: string): string {
    return accounts.value.find((a: any) => a.AccountId === id)?.BlogName || id;
}

function getAccountEngagement(id: string): number {
    const s = analytics.value.find((a: any) => a.AccountId === id);
    return s?.LatestEngagementRate || 0;
}

function getStatusClass(status: string): string {
    switch (status) {
        case 'Connected': return 'status-ok';
        case 'Disconnected': return 'status-warn';
        case 'RateLimited': return 'status-warn';
        case 'Error': return 'status-error';
        default: return 'status-error';
    }
}

function isErrorStatus(status: string): boolean {
    return status === 'Error';
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
</script>

<style scoped>
/* ─── Layout ─── */
.ot-container { padding: 24px; max-width: 1600px; margin: 0 auto; color: #e0e0e0; }

.ot-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
    gap: 16px;
    flex-wrap: wrap;
}
.ot-header-center { text-align: center; flex: 1; }
.ot-header-right { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.ot-title { font-size: 28px; font-weight: 700; color: #ffffff; margin: 0; letter-spacing: -0.5px; }
.ot-subtitle { color: #969696; font-size: 14px; margin: 4px 0 0; }

/* ─── Tabs ─── */
.ot-tabs {
    display: flex;
    gap: 6px;
    border-bottom: 1px solid #2a2a2a;
    margin-bottom: 24px;
    overflow-x: auto;
    padding-bottom: 0;
}
.ot-tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 18px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: #969696;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;
    white-space: nowrap;
}
.ot-tab:hover { color: #ffffff; background: rgba(255,255,255,0.04); }
.ot-tab.active { color: #35465c; border-bottom-color: #35465c; font-weight: 600; }
.tab-badge {
    background: #35465c;
    color: white;
    border-radius: 10px;
    padding: 2px 7px;
    font-size: 11px;
    font-weight: 700;
}

/* ─── Loading ─── */
.ot-loading { text-align: center; padding: 80px 0; }
.ot-spinner {
    width: 40px; height: 40px;
    border: 3px solid rgba(53,70,92,0.2);
    border-top-color: #35465c;
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
    margin: 0 auto 16px;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ─── Panel / Section ─── */
.ot-panel { animation: fadeIn 0.25s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.fade-in { animation: fadeIn 0.25s ease; }

.ot-section { background: #1a1a1a; border: 1px solid #262626; border-radius: 10px; padding: 20px; margin-bottom: 20px; }
.ot-section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; flex-wrap: wrap; gap: 8px; }
.ot-section-header h2 { font-size: 16px; font-weight: 600; color: #ffffff; margin: 0; }
.ot-section-actions { display: flex; gap: 8px; flex-wrap: wrap; }

/* ─── KPI Grid ─── */
.ot-kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 14px;
    margin-bottom: 24px;
}
.ot-kpi-grid.small .ot-kpi { padding: 12px 14px; }
.ot-kpi {
    background: #1a1a1a;
    border: 1px solid #262626;
    border-radius: 10px;
    padding: 16px;
    display: flex;
    align-items: center;
    gap: 12px;
}
.kpi-icon { font-size: 22px; }
.kpi-data { display: flex; flex-direction: column; gap: 2px; }
.kpi-value { font-size: 22px; font-weight: 700; color: #ffffff; line-height: 1; }
.kpi-value small { font-size: 14px; color: #969696; font-weight: 400; }
.kpi-value.sm { font-size: 18px; }
.kpi-label { font-size: 12px; color: #969696; }
.kpi-sub { font-size: 11px; color: #666; }
.kpi-trend { font-size: 11px; }
.trend-up { color: #4ade80; }
.trend-down { color: #f87171; }

/* ─── Tables ─── */
.ot-table-wrap { overflow-x: auto; }
.ot-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.ot-table th { text-align: left; padding: 8px 10px; color: #777; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #262626; }
.ot-table td { padding: 10px; border-bottom: 1px solid #1e1e1e; vertical-align: middle; }
.ot-table tr:hover td { background: rgba(53,70,92,0.06); }
.row-paused td { opacity: 0.55; }
.row-error td { background: rgba(239, 68, 68, 0.04) !important; }

/* ─── Status Pills ─── */
.status-pill {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
}
.status-pill.sm { font-size: 11px; padding: 2px 8px; }
.status-ok { background: rgba(74,222,128,0.1); color: #4ade80; border: 1px solid rgba(74,222,128,0.2); }
.status-warn { background: rgba(251,191,36,0.1); color: #fbbf24; border: 1px solid rgba(251,191,36,0.2); }
.status-error { background: rgba(248,113,113,0.1); color: #f87171; border: 1px solid rgba(248,113,113,0.2); }
.status-pending { background: rgba(129,140,248,0.1); color: #818cf8; border: 1px solid rgba(129,140,248,0.2); }

/* ─── Source / Type Badges ─── */
.source-badge, .type-pill {
    display: inline-block;
    padding: 2px 8px;
    background: rgba(53,70,92,0.15);
    border: 1px solid rgba(53,70,92,0.3);
    border-radius: 6px;
    font-size: 11px;
    color: #9eb5d4;
}

/* ─── Account Cards ─── */
.ot-accounts-detail-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 16px;
}
.ot-account-detail-card {
    background: #1a1a1a;
    border: 1px solid #262626;
    border-radius: 10px;
    padding: 16px;
    transition: border-color 0.2s;
}
.ot-account-detail-card:hover { border-color: #35465c; }
.card-paused { opacity: 0.6; }
.card-error { border-color: rgba(248,113,113,0.3) !important; }

.adc-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.adc-identity { display: flex; flex-direction: column; gap: 4px; }
.adc-blogname { font-size: 15px; font-weight: 600; color: #ffffff; }
.adc-actions { display: flex; gap: 4px; }
.adc-stats-row { display: flex; gap: 12px; margin-bottom: 10px; }
.adc-stat { display: flex; flex-direction: column; align-items: center; }
.adc-stat-val { font-size: 16px; font-weight: 700; color: #ffffff; }
.adc-stat-lbl { font-size: 10px; color: #666; text-transform: uppercase; }
.adc-config-summary { font-size: 12px; color: #777; margin-bottom: 8px; display: flex; gap: 10px; flex-wrap: wrap; }
.adc-error { font-size: 12px; color: #f87171; background: rgba(248,113,113,0.08); border-radius: 6px; padding: 6px 8px; margin-bottom: 6px; }
.adc-notes { font-size: 12px; color: #777; font-style: italic; margin-bottom: 6px; }
.adc-footer { font-size: 11px; color: #555; display: flex; justify-content: space-between; margin-top: 10px; border-top: 1px solid #222; padding-top: 8px; }

/* ─── Account Tags ─── */
.account-name { font-weight: 600; display: block; }
.account-tags { display: flex; gap: 4px; margin-top: 3px; flex-wrap: wrap; }
.tag-pill { background: rgba(53,70,92,0.15); border: 1px solid rgba(53,70,92,0.25); border-radius: 4px; padding: 1px 6px; font-size: 10px; color: #9eb5d4; }

/* ─── Table cells ─── */
.td-caption { max-width: 200px; color: #c0c0c0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.td-error { max-width: 140px; color: #f87171; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.td-actions { white-space: nowrap; }

/* ─── Buttons ─── */
.ot-btn-sm {
    padding: 6px 14px;
    background: rgba(53,70,92,0.15);
    border: 1px solid rgba(53,70,92,0.3);
    border-radius: 6px;
    color: #9eb5d4;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
}
.ot-btn-sm:hover { background: rgba(53,70,92,0.3); color: #ffffff; }
.ot-btn-sm.full { width: 100%; margin-top: 10px; }
.ot-btn-sm.danger-btn { border-color: rgba(248,113,113,0.3); color: #f87171; background: rgba(248,113,113,0.06); }
.ot-btn-sm.danger-btn:hover { background: rgba(248,113,113,0.15); }

.ot-btn-icon {
    width: 30px; height: 30px;
    border: none;
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
    font-size: 14px;
    transition: background 0.15s;
    color: #e0e0e0;
}
.ot-btn-icon:hover { background: rgba(255,255,255,0.08); }
.ot-btn-icon.warn { color: #fbbf24; }
.ot-btn-icon.danger { color: #f87171; }
.ot-btn-cancel { padding: 4px 10px; background: rgba(248,113,113,0.08); border: 1px solid rgba(248,113,113,0.2); border-radius: 5px; color: #f87171; font-size: 12px; cursor: pointer; }
.ot-btn-cancel:hover { background: rgba(248,113,113,0.18); }

/* ─── Events ─── */
.ot-events-list { display: flex; flex-direction: column; gap: 4px; }
.ot-event { display: flex; gap: 10px; padding: 7px 10px; border-radius: 6px; font-size: 12px; align-items: center; background: rgba(255,255,255,0.02); }
.ot-event.evt-error { background: rgba(248,113,113,0.06); }
.ot-event.evt-warn { background: rgba(251,191,36,0.05); }
.ot-event.evt-info { background: rgba(129,140,248,0.04); }
.evt-time { color: #555; min-width: 55px; white-space: nowrap; }
.evt-type { color: #35465c; font-weight: 600; min-width: 120px; white-space: nowrap; }
.evt-msg { color: #c0c0c0; }

/* ─── Empties ─── */
.ot-empty { padding: 40px; text-align: center; color: #555; font-size: 14px; }
.ot-empty-sm { padding: 12px; text-align: center; color: #555; font-size: 13px; }

/* ─── Selects ─── */
.ot-select {
    background: #1e1e1e;
    border: 1px solid #333;
    border-radius: 6px;
    color: #e0e0e0;
    padding: 7px 10px;
    font-size: 13px;
    cursor: pointer;
}
.ot-select.wide { min-width: 260px; }
.ot-select:focus { outline: none; border-color: #35465c; }

/* ─── Analytics ─── */
.ot-analytics-header { display: flex; gap: 12px; align-items: center; margin-bottom: 20px; flex-wrap: wrap; }
.ot-range-pills { display: flex; gap: 6px; }
.range-pill { padding: 5px 14px; background: #1e1e1e; border: 1px solid #333; border-radius: 20px; color: #777; font-size: 12px; cursor: pointer; }
.range-pill.active { background: rgba(53,70,92,0.2); border-color: #35465c; color: #9eb5d4; }
.ot-analytics-fleet { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
.ot-analytics-card { background: #1a1a1a; border: 1px solid #262626; border-radius: 10px; padding: 16px; }
.ot-analytics-detail .analytics-detail-content { display: flex; flex-direction: column; gap: 20px; }
.anc-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.anc-blogname { font-size: 15px; font-weight: 600; color: #ffffff; }
.anc-engagement { font-size: 16px; font-weight: 700; color: #35465c; }
.anc-metrics { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 10px; }
.anc-metric { display: flex; flex-direction: column; }
.anc-val { font-size: 16px; font-weight: 700; color: #ffffff; }
.anc-lbl { font-size: 11px; color: #666; }
.anc-posts-row { font-size: 12px; color: #666; display: flex; gap: 14px; flex-wrap: wrap; }
.ot-charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 768px) { .ot-charts-grid { grid-template-columns: 1fr; } }
.ot-chart-container { background: #1a1a1a; border: 1px solid #262626; border-radius: 10px; padding: 16px; height: 220px; }
.ot-chart-container h3 { font-size: 13px; color: #969696; margin: 0 0 10px; }
.ot-chart-container canvas { width: 100% !important; height: 160px !important; }

/* ─── Config ─── */
.ot-config-account-select { margin-bottom: 20px; }
.ot-config-panel { }
.ot-config-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; margin-bottom: 20px; }
.config-section { background: #1a1a1a; border: 1px solid #262626; border-radius: 10px; padding: 16px; }
.config-section h3 { font-size: 13px; font-weight: 600; color: #35465c; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.5px; }
.config-row { display: flex; flex-direction: column; gap: 5px; margin-bottom: 12px; }
.config-row label { font-size: 12px; color: #969696; }
.config-row.inline { flex-direction: row; align-items: center; flex-wrap: wrap; gap: 12px; }
.config-row-sm { display: flex; flex-direction: column; gap: 4px; min-width: 120px; }
.config-row-sm label { font-size: 12px; color: #969696; }
.config-checkboxes { display: flex; flex-wrap: wrap; gap: 8px; }
.ot-checkbox { display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; color: #c0c0c0; }
.ot-checkbox input { cursor: pointer; accent-color: #35465c; }
.ot-config-actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding: 16px 0; }

/* ─── Inputs ─── */
.ot-input {
    background: #1e1e1e;
    border: 1px solid #333;
    border-radius: 6px;
    color: #e0e0e0;
    padding: 7px 10px;
    font-size: 13px;
    width: 100%;
    box-sizing: border-box;
}
.ot-input.sm { width: 80px; }
.ot-input:focus { outline: none; border-color: #35465c; }
.ot-textarea {
    background: #1e1e1e;
    border: 1px solid #333;
    border-radius: 6px;
    color: #e0e0e0;
    padding: 8px 10px;
    font-size: 13px;
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    font-family: inherit;
}
.ot-textarea:focus { outline: none; border-color: #35465c; }
</style>
