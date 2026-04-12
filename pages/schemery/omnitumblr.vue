<template>
    <div class="omnitumblr-page">
        <div class="page-header panel-shell">
            <div class="header-left">
                <KMButton class="back-nav-btn" style="width: 320px;" message="Back To Schemes" @click="navigateBack" />
            </div>

            <div class="header-center">
                <h1 class="page-title">OmniTumblr Command Panel</h1>
                <p class="page-subtitle">{{ pageSubtitleText }}</p>
                <div class="header-status-row">
                    <span class="header-pill" :class="serviceOnline ? 'ok' : 'warn'">
                        {{ serviceOnline ? 'Service Online' : 'Service Unreachable' }}
                    </span>
                    <span class="header-pill muted">Last refresh {{ lastRefresh }}</span>
                </div>
            </div>

            <div class="header-right">
                <button class="primary-btn" :disabled="isLoading || commandBusy" @click="loadAllPanels(true)">
                    {{ isLoading ? 'Refreshing...' : 'Refresh Telemetry' }}
                </button>
            </div>
        </div>

        <div v-if="panelError" class="panel-notice">
            {{ panelError }}
        </div>

        <div class="metric-strip">
            <article class="metric-tile">
                <span class="metric-label">Managed Accounts</span>
                <strong class="metric-value">{{ accounts.length }}</strong>
                <span class="metric-sub">{{ activeAccounts.length }} active</span>
            </article>

            <article class="metric-tile">
                <span class="metric-label">Success Rate</span>
                <strong class="metric-value success">{{ successRateText }}</strong>
                <span class="metric-sub">{{ totalPostsText }} total posts</span>
            </article>

            <article class="metric-tile">
                <span class="metric-label">Posted / Failed</span>
                <strong class="metric-value">{{ postedCount }} / {{ failedCount }}</strong>
                <span class="metric-sub">From selected analytics range</span>
            </article>

            <article class="metric-tile">
                <span class="metric-label">Manager Uptime</span>
                <strong class="metric-value">{{ health?.ManagerUptime || health?.Uptime || 'N/A' }}</strong>
                <span class="metric-sub">Service: {{ health?.Service || 'N/A' }}</span>
            </article>
        </div>

        <div class="subpage-nav panel-shell">
            <button
                type="button"
                v-for="link in subPageLinks"
                :key="link.view"
                class="subpage-link"
                :class="{ active: activePageView === link.view }"
                @click="navigateToSubPage(link.view)"
            >
                <span class="subpage-link-title">{{ link.label }}</span>
                <small class="subpage-link-hint">{{ link.hint }}</small>
            </button>
        </div>

        <div class="panel-grid" v-if="isCommandPage">
            <section class="panel-shell command-panel">
                <div class="panel-head">
                    <h2>{{ commandPanelHeading }}</h2>
                    <span>{{ commandPanelHint }}</span>
                </div>

                <div class="form-card" v-if="activePageView === 'add-managed-account'">
                    <h3>Add Managed Tumblr Account</h3>
                    <form class="command-form" @submit.prevent="submitOnboardAccount">
                        <div class="input-row split">
                            <label>
                                <span>Email</span>
                                <input v-model.trim="onboardForm.email" type="email" placeholder="owner@example.com" autocomplete="off" required />
                            </label>

                            <label>
                                <span>Password</span>
                                <input v-model="onboardForm.password" type="password" placeholder="Tumblr account password" autocomplete="new-password" required />
                            </label>
                        </div>

                        <label>
                            <span>Blog Name</span>
                            <input v-model.trim="onboardForm.blogName" type="text" placeholder="myblog.tumblr.com" required />
                        </label>

                        <div class="input-row split">
                            <label>
                                <span>OAuth Token Key</span>
                                <input v-model.trim="onboardForm.oauthTokenKey" type="text" placeholder="oauth-token-key" required />
                            </label>

                            <label>
                                <span>OAuth Token Secret</span>
                                <input v-model.trim="onboardForm.oauthTokenSecret" type="text" placeholder="oauth-token-secret" required />
                            </label>
                        </div>

                        <label class="toggle-row">
                            <input v-model="onboardForm.useMemeScraperSource" type="checkbox" />
                            <span>Use MemeScraper as media source</span>
                        </label>

                        <label>
                            <span>Meme Niches (comma separated)</span>
                            <input v-model.trim="onboardForm.memeNichesCsv" type="text" placeholder="fitness, motivation" />
                            <small class="field-helper">Optional. These map source niches when MemeScraper source mode is enabled.</small>
                        </label>

                        <div class="niche-preview" v-if="allMemeNiches.length > 0">
                            <button
                                type="button"
                                class="niche-chip-btn"
                                v-for="niche in allMemeNiches"
                                :key="`onboard-${niche.NicheTagName}`"
                                @click="toggleCsvNiche('onboard', niche.NicheTagName)"
                            >
                                {{ niche.NicheTagName }}
                            </button>
                        </div>

                        <label class="toggle-row">
                            <input v-model="onboardForm.autonomousPostingEnabled" type="checkbox" />
                            <span>Enable autonomous posting lifecycle</span>
                        </label>

                        <div class="input-row split" v-if="onboardForm.autonomousPostingEnabled">
                            <label>
                                <span>Autonomous Interval (minutes)</span>
                                <input v-model.number="onboardForm.autonomousPostingIntervalMinutes" type="number" min="1" step="1" />
                            </label>

                            <label>
                                <span>Autonomous Random Offset (+/- minutes)</span>
                                <input v-model.number="onboardForm.autonomousPostingRandomOffsetMinutes" type="number" min="0" step="1" />
                            </label>
                        </div>

                        <label v-if="onboardForm.autonomousPostingEnabled">
                            <span>Autonomous Caption Prompt</span>
                            <input v-model.trim="onboardForm.autonomousCaptionPrompt" type="text" placeholder="Write a short tumblr caption with hashtags" />
                        </label>

                        <label class="toggle-row">
                            <input v-model="onboardForm.includeLiveVerification" type="checkbox" />
                            <span>Run live verification immediately after save</span>
                        </label>

                        <small class="field-helper">
                            Uses POST /omnitumblr/accounts/add. Keep live verification off for faster onboarding, then retry verification when ready.
                        </small>

                        <div class="form-actions">
                            <button type="submit" class="command-btn" :disabled="commandBusy">
                                {{ commandBusy ? 'Onboarding...' : 'Add Managed Account' }}
                            </button>
                            <button type="button" class="command-btn ghost" :disabled="commandBusy" @click="resetOnboardForm">
                                Clear
                            </button>
                        </div>
                    </form>
                </div>

                <div class="form-card" v-if="activePageView === 'update-managed-account-settings'">
                    <h3>Update Managed Account Settings</h3>
                    <form class="command-form" @submit.prevent="submitAccountSettings">
                        <label>
                            <span>Managed Account</span>
                            <select v-model="settingsForm.accountId" @change="hydrateSettingsFromAccount(settingsForm.accountId)">
                                <option value="">Select account</option>
                                <option v-for="account in accounts" :key="account.AccountId" :value="account.AccountId">
                                    {{ account.Email }} · {{ account.BlogName }}
                                </option>
                            </select>
                        </label>

                        <label>
                            <span>Blog Name</span>
                            <input v-model.trim="settingsForm.blogName" type="text" placeholder="myblog.tumblr.com" required />
                        </label>

                        <div class="input-row split">
                            <label>
                                <span>OAuth Token Key</span>
                                <input v-model.trim="settingsForm.oauthTokenKey" type="text" required />
                            </label>

                            <label>
                                <span>OAuth Token Secret</span>
                                <input v-model.trim="settingsForm.oauthTokenSecret" type="text" required />
                            </label>
                        </div>

                        <label class="toggle-row">
                            <input v-model="settingsForm.useMemeScraperSource" type="checkbox" />
                            <span>Use MemeScraper source</span>
                        </label>

                        <label>
                            <span>Meme Niches (comma separated)</span>
                            <input v-model.trim="settingsForm.memeNichesCsv" type="text" placeholder="memes, gaming" />
                        </label>

                        <div class="niche-preview" v-if="allMemeNiches.length > 0">
                            <button
                                type="button"
                                class="niche-chip-btn"
                                v-for="niche in allMemeNiches"
                                :key="`settings-${niche.NicheTagName}`"
                                @click="toggleCsvNiche('settings', niche.NicheTagName)"
                            >
                                {{ niche.NicheTagName }}
                            </button>
                        </div>

                        <label class="toggle-row">
                            <input v-model="settingsForm.autonomousPostingEnabled" type="checkbox" />
                            <span>Enable autonomous posting</span>
                        </label>

                        <div class="input-row split" v-if="settingsForm.autonomousPostingEnabled">
                            <label>
                                <span>Interval (minutes)</span>
                                <input v-model.number="settingsForm.autonomousPostingIntervalMinutes" type="number" min="1" step="1" />
                            </label>
                            <label>
                                <span>Random Offset (minutes)</span>
                                <input v-model.number="settingsForm.autonomousPostingRandomOffsetMinutes" type="number" min="0" step="1" />
                            </label>
                        </div>

                        <label v-if="settingsForm.autonomousPostingEnabled">
                            <span>Autonomous Caption Prompt</span>
                            <input v-model.trim="settingsForm.autonomousCaptionPrompt" type="text" placeholder="Short funny meme post text" />
                        </label>

                        <div class="form-actions">
                            <button type="submit" class="command-btn" :disabled="commandBusy">
                                {{ commandBusy ? 'Saving...' : 'Save Settings' }}
                            </button>
                            <button type="button" class="command-btn ghost" :disabled="commandBusy" @click="hydrateSettingsFromAccount(settingsForm.accountId)">
                                Reload From Account
                            </button>
                        </div>
                    </form>
                </div>

                <div class="form-card compact-grid" v-if="activePageView === 'delete-managed-account'">
                    <div>
                        <h3>Delete Managed Account</h3>
                        <form class="command-form" @submit.prevent="deleteManagedAccount">
                            <label>
                                <span>Managed Account</span>
                                <select v-model="deleteAccountForm.accountId">
                                    <option value="">Select account</option>
                                    <option v-for="account in accounts" :key="`delete-account-${account.AccountId}`" :value="account.AccountId">
                                        {{ account.Email }} · {{ account.BlogName }}
                                    </option>
                                </select>
                            </label>

                            <label class="toggle-row">
                                <input v-model="deleteAccountForm.deleteAssociatedPosts" type="checkbox" />
                                <span>Also delete associated local posts/campaigns</span>
                            </label>

                            <div class="form-actions">
                                <button type="submit" class="command-btn danger" :disabled="commandBusy">
                                    {{ commandBusy ? 'Deleting...' : 'Delete Account' }}
                                </button>
                            </div>
                        </form>
                    </div>

                    <div>
                        <h3>Delete Tumblr Post</h3>
                        <form class="command-form" @submit.prevent="deleteTumblrPost">
                            <label>
                                <span>Managed Account</span>
                                <select v-model="deletePostForm.accountId">
                                    <option value="">Select account</option>
                                    <option v-for="account in accounts" :key="`delete-post-${account.AccountId}`" :value="account.AccountId">
                                        {{ account.Email }} · {{ account.BlogName }}
                                    </option>
                                </select>
                            </label>

                            <label>
                                <span>Tumblr Post ID</span>
                                <input v-model.trim="deletePostForm.postId" type="text" placeholder="761234567890123456" />
                            </label>

                            <small class="field-helper">Calls POST /omnitumblr/posts/deleteFromTumblr for the given account and Tumblr post id.</small>

                            <div class="form-actions">
                                <button type="submit" class="command-btn danger" :disabled="commandBusy">
                                    {{ commandBusy ? 'Deleting...' : 'Delete Tumblr Post' }}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                <div class="form-card" v-if="activePageView === 'schedule-post-campaign'">
                    <h3>Schedule Post Campaign</h3>
                    <form class="command-form" @submit.prevent="scheduleCampaign">
                        <div class="input-row split">
                            <label>
                                <span>Dispatch Mode</span>
                                <select v-model="scheduleForm.dispatchMode">
                                    <option value="AllManagedAccounts">All managed accounts</option>
                                    <option value="SingleAccount">Single account</option>
                                </select>
                            </label>

                            <label>
                                <span>Caption Mode</span>
                                <select v-model="scheduleForm.captionMode">
                                    <option value="AI">AI generated</option>
                                    <option value="User">User provided</option>
                                </select>
                            </label>
                        </div>

                        <label v-if="scheduleForm.dispatchMode === 'SingleAccount'">
                            <span>Target Managed Account</span>
                            <select v-model="scheduleForm.accountId">
                                <option value="">Select account</option>
                                <option v-for="account in activeAccounts" :key="`schedule-${account.AccountId}`" :value="account.AccountId">
                                    {{ account.Email }} · {{ account.BlogName }}
                                </option>
                            </select>
                        </label>

                        <label v-if="scheduleForm.captionMode === 'User'">
                            <span>User Caption</span>
                            <textarea v-model.trim="scheduleForm.userCaption" rows="3" placeholder="New post!"></textarea>
                        </label>

                        <label v-else>
                            <span>AI Caption Prompt</span>
                            <textarea v-model.trim="scheduleForm.aiCaptionPrompt" rows="3" placeholder="Write a short tumblr caption with hashtags"></textarea>
                        </label>

                        <div class="input-row split">
                            <label>
                                <span>Schedule (UTC, optional)</span>
                                <input v-model="scheduleForm.scheduledForUtcLocal" type="datetime-local" />
                            </label>

                            <label>
                                <span>Media Path (JSON mode)</span>
                                <input v-model.trim="scheduleForm.mediaPath" type="text" placeholder="C:/Media/video.mp4" :disabled="scheduleForm.useDirectUpload" />
                            </label>
                        </div>

                        <label class="toggle-row">
                            <input v-model="scheduleForm.useDirectUpload" type="checkbox" />
                            <span>Upload media bytes directly (file-upload mode)</span>
                        </label>

                        <label v-if="scheduleForm.useDirectUpload">
                            <span>Upload Media File</span>
                            <input type="file" accept="image/*,video/*" @change="onUploadFileChanged" />
                            <small class="field-helper" v-if="scheduleUploadFile">{{ scheduleUploadFile.name }} · {{ formatBytes(scheduleUploadFile.size) }}</small>
                            <small class="field-helper" v-else>No media file selected.</small>
                        </label>

                        <div class="form-actions">
                            <button type="submit" class="command-btn" :disabled="commandBusy">
                                {{ commandBusy ? 'Scheduling...' : 'Schedule Campaign' }}
                            </button>
                            <button type="button" class="command-btn ghost" :disabled="commandBusy" @click="seedDefaultScheduleTime">
                                +20m Preset
                            </button>
                        </div>
                    </form>
                </div>
            </section>

            <section class="panel-shell">
                <div class="panel-head">
                    <h2>Managed Accounts</h2>
                    <span>{{ accounts.length }} tracked</span>
                </div>

                <div v-if="accounts.length === 0" class="empty-state">No managed Tumblr accounts returned yet.</div>
                <div v-else class="accounts-list">
                    <article v-for="account in accounts" :key="account.AccountId" class="account-row">
                        <div class="account-main">
                            <div>
                                <h3>{{ account.Email }}</h3>
                                <p>{{ account.BlogName }} · ID {{ account.AccountId }}</p>
                            </div>
                            <span class="status-pill" :class="accountStatusClass(account.Status)">
                                {{ accountStatusLabel(account.Status) }}
                            </span>
                        </div>

                        <div class="account-meta">
                            <span>
                                Source:
                                {{ account.UseMemeScraperSource ? accountNicheSummary(account) : 'Manual' }}
                            </span>
                            <span>
                                Auto:
                                {{ account.AutonomousPostingEnabled ? ((account.AutonomousPostingIntervalMinutes || 0) + 'm ± ' + (account.AutonomousPostingRandomOffsetMinutes || 0) + 'm') : 'Off' }}
                            </span>
                            <span>
                                Auth:
                                {{ formatDateTime(account.LastAuthenticatedUtc) }}
                            </span>
                        </div>

                        <div class="account-action-row">
                            <button type="button" class="inline-link-btn" @click="hydrateSettingsFromAccount(account.AccountId)">Load Into Settings</button>
                            <button type="button" class="inline-link-btn" @click="setLiveAccount(account.AccountId)">Set Live Target</button>
                        </div>

                        <div class="account-auth-debug" v-if="accountNeedsVerificationDetails(account)">
                            <p>Verification state: {{ accountVerificationStateLabel(account) }}</p>
                            <p v-if="account.LastAuthenticationError">Auth error: {{ account.LastAuthenticationError }}</p>
                            <p v-if="accountVerificationGuidance(account)">Guidance: {{ accountVerificationGuidance(account) }}</p>

                            <button
                                v-if="canRetryVerification(account.Status)"
                                type="button"
                                class="inline-link-btn"
                                :disabled="liveBusy"
                                @click="retryVerificationForAccount(account.AccountId, account.Email)"
                            >
                                {{ liveBusy ? 'Retrying...' : 'Retry Verification' }}
                            </button>
                        </div>
                    </article>
                </div>

                <div class="mini-grid" v-if="byAccountRows.length > 0">
                    <div class="mini-item" v-for="row in byAccountRows" :key="row.AccountId">
                        <span class="mini-name">{{ row.Email || row.AccountId }}</span>
                        <span class="mini-val">{{ row.Posted }}/{{ row.Total }} posted</span>
                    </div>
                </div>

                <div class="top-failure-list" v-if="topFailures.length > 0">
                    <h3>Top Failure Reasons</h3>
                    <div class="failure-row" v-for="(failure, index) in topFailures" :key="`failure-${index}`">
                        <span class="failure-msg">{{ failure.error || 'Unknown error' }}</span>
                        <span class="failure-count">{{ failure.count }}</span>
                    </div>
                </div>
            </section>
        </div>

        <div class="panel-grid secondary visual-grid" v-if="isAnalyticsPage">
            <section class="panel-shell visual-panel">
                <div class="panel-head">
                    <h2>Live Account Snapshot</h2>
                    <span>GET /omnitumblr/accounts/live</span>
                </div>

                <form class="command-form inline-form" @submit.prevent="requestLiveAccountSnapshot">
                    <label>
                        <span>Managed Account</span>
                        <select v-model="liveAccountForm.accountId">
                            <option value="">Select account</option>
                            <option v-for="account in accounts" :key="`live-${account.AccountId}`" :value="account.AccountId">
                                {{ account.Email }} · {{ account.BlogName }}
                            </option>
                        </select>
                    </label>

                    <button type="submit" class="command-btn" :disabled="liveBusy || !liveAccountForm.accountId">
                        {{ liveBusy ? 'Loading Live...' : 'Load Live Snapshot' }}
                    </button>
                </form>

                <div v-if="!hasLiveSnapshot" class="empty-state">No live account payload loaded yet.</div>
                <div v-else class="viz-stack">
                    <div class="viz-kpi-grid compact">
                        <article class="viz-kpi">
                            <span>Blog</span>
                            <strong>{{ liveSnapshotBlogTitle }}</strong>
                            <small>{{ liveSnapshotBlogName }}</small>
                        </article>
                        <article class="viz-kpi">
                            <span>User</span>
                            <strong>{{ liveSnapshotUserName }}</strong>
                            <small>Fetched {{ liveSnapshotFetchedAtText }}</small>
                        </article>
                    </div>

                    <div class="chart-shell">
                        <canvas ref="liveSnapshotChartCanvas" class="viz-canvas"></canvas>
                    </div>
                </div>
            </section>

            <section class="panel-shell visual-panel">
                <div class="panel-head">
                    <h2>Fleet Live Analytics</h2>
                    <span>GET /omnitumblr/accounts/liveAnalytics</span>
                </div>

                <div class="viz-toolbar">
                    <button class="command-btn" :disabled="liveAnalyticsBusy" @click="refreshLiveAnalytics">
                        {{ liveAnalyticsBusy ? 'Refreshing...' : 'Refresh Fleet Analytics' }}
                    </button>
                    <label class="viz-selector">
                        <span>Metric</span>
                        <select v-model="fleetMetric">
                            <option v-for="option in fleetMetricOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                        </select>
                    </label>
                </div>

                <div v-if="!hasFleetAnalytics" class="empty-state">No fleet live analytics payload loaded yet.</div>
                <div v-else class="viz-stack">
                    <div class="chart-shell">
                        <canvas ref="fleetAnalyticsChartCanvas" class="viz-canvas"></canvas>
                    </div>

                    <div class="rank-list">
                        <article class="rank-row" v-for="row in sortedFleetResults.slice(0, 6)" :key="`fleet-rank-${row.AccountId}`">
                            <div class="rank-head">
                                <span>{{ row.Email || row.BlogName || shortId(row.AccountId) }}</span>
                                <strong>{{ formatFleetMetricValue(row) }}</strong>
                            </div>
                            <div class="rank-bar-track">
                                <div class="rank-bar-fill" :style="{ width: `${fleetMetricPercent(row)}%` }"></div>
                            </div>
                        </article>
                    </div>
                </div>
            </section>

            <section class="panel-shell visual-panel">
                <div class="panel-head">
                    <h2>Local Analytics Overview</h2>
                    <span>GET /omnitumblr/analytics/overview</span>
                </div>

                <form class="command-form inline-form" @submit.prevent="refreshOverviewRange">
                    <div class="input-row split">
                        <label>
                            <span>From UTC (optional)</span>
                            <input v-model="overviewFilter.fromUtcLocal" type="datetime-local" />
                        </label>
                        <label>
                            <span>To UTC (optional)</span>
                            <input v-model="overviewFilter.toUtcLocal" type="datetime-local" />
                        </label>
                    </div>

                    <div class="form-actions">
                        <button type="submit" class="command-btn" :disabled="overviewBusy">
                            {{ overviewBusy ? 'Loading...' : 'Apply Range' }}
                        </button>
                        <button type="button" class="command-btn ghost" :disabled="overviewBusy" @click="clearOverviewRange">
                            Clear Range
                        </button>
                    </div>
                </form>

                <div v-if="!hasOverviewRows" class="empty-state">No analytics overview payload loaded yet.</div>
                <div v-else class="viz-stack">
                    <div class="chart-shell">
                        <canvas ref="overviewChartCanvas" class="viz-canvas"></canvas>
                    </div>

                    <div class="viz-kpi-grid">
                        <article class="viz-kpi">
                            <span>Total Posts</span>
                            <strong>{{ totalPostsText }}</strong>
                        </article>
                        <article class="viz-kpi">
                            <span>Posted</span>
                            <strong>{{ postedCount }}</strong>
                        </article>
                        <article class="viz-kpi">
                            <span>Failed</span>
                            <strong>{{ failedCount }}</strong>
                        </article>
                        <article class="viz-kpi">
                            <span>Success Rate</span>
                            <strong>{{ successRateText }}</strong>
                        </article>
                    </div>
                </div>
            </section>

            <section class="panel-shell visual-panel">
                <div class="panel-head">
                    <h2>Recent Post Queue</h2>
                    <span>{{ posts.length }} loaded</span>
                </div>

                <div v-if="!hasPosts" class="empty-state">No OmniTumblr posts found.</div>
                <div v-else class="viz-stack">
                    <div class="chip-row">
                        <button
                            v-for="filter in postStatusFilters"
                            :key="`post-filter-${filter}`"
                            class="chip-btn"
                            :class="{ active: postStatusFilter === filter }"
                            @click="selectPostStatus(filter)"
                        >
                            {{ filter }} ({{ postStatusCount(filter) }})
                        </button>
                    </div>

                    <div class="chart-shell">
                        <canvas ref="postsChartCanvas" class="viz-canvas"></canvas>
                    </div>

                    <div class="timeline-scroll">
                        <article class="timeline-entry" v-for="(post, index) in filteredPosts.slice(0, 10)" :key="`post-card-${postKey(post, index)}`">
                            <div class="timeline-head">
                                <span class="status-pill" :class="postStatusClass(post.Status)">{{ postStatusLabel(post.Status) }}</span>
                                <span>{{ formatDateTime(post.ScheduledForUtc) }}</span>
                            </div>
                            <p class="timeline-message">{{ resolveAccountLabel(post.AccountId) }}</p>
                            <div class="timeline-meta">
                                <span>Tumblr Post: {{ post.TumblrPostId || 'Pending' }}</span>
                                <span v-if="post.LastError">Error: {{ post.LastError }}</span>
                            </div>
                        </article>
                    </div>
                </div>
            </section>

            <section class="panel-shell visual-panel">
                <div class="panel-head">
                    <h2>Event Stream</h2>
                    <span>{{ events.length }} latest events</span>
                </div>

                <div v-if="!hasEvents" class="empty-state">No OmniTumblr events found.</div>
                <div v-else class="viz-stack">
                    <div class="chip-row">
                        <button
                            v-for="filter in eventLevelFilters"
                            :key="`event-filter-${filter}`"
                            class="chip-btn"
                            :class="{ active: eventLevelFilter === filter }"
                            @click="selectEventLevel(filter)"
                        >
                            {{ filter }} ({{ eventLevelCount(filter) }})
                        </button>
                    </div>

                    <div class="chart-shell">
                        <canvas ref="eventsChartCanvas" class="viz-canvas"></canvas>
                    </div>

                    <div class="timeline-scroll">
                        <article class="timeline-entry" v-for="(eventItem, index) in filteredEvents.slice(0, 12)" :key="`event-card-${eventKey(eventItem, index)}`">
                            <div class="timeline-head">
                                <span class="status-pill" :class="eventLevelClass(eventItem.Level)">{{ normalizedEventLevel(eventItem.Level) }}</span>
                                <span>{{ formatDateTime(eventItem.EventTimeUtc || eventItem.TimestampUtc) }}</span>
                            </div>
                            <p class="timeline-message">{{ eventItem.Message || eventItem.message || 'No message' }}</p>
                            <div class="timeline-meta">
                                <span v-if="eventItem.AccountId">A: {{ shortId(eventItem.AccountId) }}</span>
                                <span v-if="eventItem.PostId">P: {{ shortId(eventItem.PostId) }}</span>
                                <span v-if="eventItem.CampaignId">C: {{ shortId(eventItem.CampaignId) }}</span>
                            </div>
                        </article>
                    </div>
                </div>
            </section>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import KMButton from '~/components/KMButton.vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import Swal from 'sweetalert2';
import Chart from 'chart.js/auto';

definePageMeta({
    layout: 'navbar',
    alias: [
        '/schemery/omnitumblr/add-managed-account',
        '/schemery/omnitumblr/update-managed-account-settings',
        '/schemery/omnitumblr/delete-managed-account',
        '/schemery/omnitumblr/schedule-post-campaign'
    ]
});

interface MemeScraperNiche {
    NicheTagName: string;
}

interface OmniTumblrAccount {
    AccountId: string;
    Email: string;
    BlogName: string;
    Status: number | string;
    LastAuthenticatedUtc?: string | null;
    LastAuthenticationError?: string | null;
    LastAuthenticationGuidance?: string | null;
    UseMemeScraperSource?: boolean;
    PreferredMemeNiches?: string[] | null;
    AutonomousPostingEnabled?: boolean;
    AutonomousPostingIntervalMinutes?: number | null;
    AutonomousPostingRandomOffsetMinutes?: number | null;
    AutonomousCaptionPrompt?: string | null;
    oauthTokenKey?: string | null;
    oauthTokenSecret?: string | null;
    OAuthTokenKey?: string | null;
    OAuthTokenSecret?: string | null;
}

interface OmniTumblrPost {
    PostId?: string;
    PlannedPostId?: string;
    AccountId: string;
    Status: number | string;
    ScheduledForUtc?: string | null;
    TumblrPostId?: number | string | null;
    LastError?: string | null;
}

interface OmniTumblrEvent {
    EventId?: string;
    EventTimeUtc?: string | null;
    TimestampUtc?: string | null;
    Level?: string;
    Message?: string;
    message?: string;
    AccountId?: string | null;
    PostId?: string | null;
    CampaignId?: string | null;
}

interface OmniTumblrLiveAnalyticsTag {
    tag?: string;
    count?: number;
}

interface OmniTumblrLiveAnalyticsResult {
    AccountId: string;
    Email?: string;
    BlogName?: string;
    BlogTitle?: string;
    Success?: boolean;
    BlogPostCount?: number;
    LikesCount?: number;
    AvgNotes?: number;
    SamplePosts?: number;
    TopTags?: OmniTumblrLiveAnalyticsTag[];
}

type FleetMetric = 'AvgNotes' | 'BlogPostCount' | 'LikesCount';
type PostStatusFilter = 'All' | 'Scheduled' | 'Processing' | 'Posted' | 'Failed';
type EventLevelFilter = 'All' | 'Information' | 'Warning' | 'Error';
type OmniTumblrPageView =
    | 'analytics'
    | 'add-managed-account'
    | 'update-managed-account-settings'
    | 'delete-managed-account'
    | 'schedule-post-campaign';

interface OmniTumblrSubPageLink {
    view: OmniTumblrPageView;
    label: string;
    hint: string;
}

interface OmniTumblrOverviewByAccount {
    AccountId: string;
    Email?: string;
    BlogName?: string;
    Total: number;
    Posted: number;
    Failed: number;
    AvgRetries?: number;
}

interface OmniTumblrOverview {
    TotalPosts?: number;
    Posted?: number;
    Failed?: number;
    SuccessRate?: number;
    ByAccount?: OmniTumblrOverviewByAccount[];
    TopFailureReasons?: Array<{ error?: string; count?: number }>;
}

interface OmniTumblrHealth {
    Service?: string;
    Uptime?: string;
    ManagerUptime?: string;
    [key: string]: unknown;
}

interface OmniTumblrOnboardForm {
    email: string;
    password: string;
    blogName: string;
    oauthTokenKey: string;
    oauthTokenSecret: string;
    useMemeScraperSource: boolean;
    memeNichesCsv: string;
    autonomousPostingEnabled: boolean;
    autonomousPostingIntervalMinutes: number;
    autonomousPostingRandomOffsetMinutes: number;
    autonomousCaptionPrompt: string;
    includeLiveVerification: boolean;
}

interface OmniTumblrSettingsForm {
    accountId: string;
    blogName: string;
    oauthTokenKey: string;
    oauthTokenSecret: string;
    useMemeScraperSource: boolean;
    memeNichesCsv: string;
    autonomousPostingEnabled: boolean;
    autonomousPostingIntervalMinutes: number;
    autonomousPostingRandomOffsetMinutes: number;
    autonomousCaptionPrompt: string;
}

interface OmniTumblrDeleteAccountForm {
    accountId: string;
    deleteAssociatedPosts: boolean;
}

interface OmniTumblrDeletePostForm {
    accountId: string;
    postId: string;
}

interface OmniTumblrLiveAccountForm {
    accountId: string;
}

interface OmniTumblrScheduleForm {
    dispatchMode: 'SingleAccount' | 'AllManagedAccounts';
    accountId: string;
    captionMode: 'User' | 'AI';
    userCaption: string;
    aiCaptionPrompt: string;
    useDirectUpload: boolean;
    mediaPath: string;
    scheduledForUtcLocal: string;
}

interface OmniTumblrOverviewFilter {
    fromUtcLocal: string;
    toUtcLocal: string;
}

interface DeleteResponse {
    Success?: boolean;
    success?: boolean;
}

interface OmniTumblrAddAccountResponse {
    AccountId?: string | null;
    Email?: string | null;
    BlogName?: string | null;
    LastAuthenticationError?: string | null;
    LastAuthenticationGuidance?: string | null;
    VerificationState?: string | null;
    VerificationGuidance?: string | null;
    LiveVerificationRequested?: boolean | null;
    LiveVerification?: unknown | null;
}

const router = useRouter();
const route = useRoute();

const subPageLinks: ReadonlyArray<OmniTumblrSubPageLink> = [
    {
        view: 'analytics',
        label: 'Analytics',
        hint: 'Live telemetry and interactive charts'
    },
    {
        view: 'add-managed-account',
        label: 'Add Account',
        hint: 'Onboard and verify Tumblr credentials'
    },
    {
        view: 'update-managed-account-settings',
        label: 'Update Settings',
        hint: 'Modify runtime account configuration'
    },
    {
        view: 'delete-managed-account',
        label: 'Delete Account',
        hint: 'Remove managed accounts or posts'
    },
    {
        view: 'schedule-post-campaign',
        label: 'Schedule Campaign',
        hint: 'Queue Tumblr posting workflows'
    }
];

const isLoading = ref(false);
const commandBusy = ref(false);
const liveBusy = ref(false);
const liveAnalyticsBusy = ref(false);
const overviewBusy = ref(false);
const panelError = ref('');
const lastRefresh = ref('never');

const accounts = ref<OmniTumblrAccount[]>([]);
const posts = ref<OmniTumblrPost[]>([]);
const events = ref<OmniTumblrEvent[]>([]);
const overview = ref<OmniTumblrOverview | null>(null);
const health = ref<OmniTumblrHealth | null>(null);
const allMemeNiches = ref<MemeScraperNiche[]>([]);
const liveAccountData = ref<unknown | null>(null);
const liveAnalyticsData = ref<unknown | null>(null);

const liveSnapshotChartCanvas = ref<HTMLCanvasElement | null>(null);
const fleetAnalyticsChartCanvas = ref<HTMLCanvasElement | null>(null);
const overviewChartCanvas = ref<HTMLCanvasElement | null>(null);
const postsChartCanvas = ref<HTMLCanvasElement | null>(null);
const eventsChartCanvas = ref<HTMLCanvasElement | null>(null);

const fleetMetric = ref<FleetMetric>('AvgNotes');
const postStatusFilter = ref<PostStatusFilter>('All');
const eventLevelFilter = ref<EventLevelFilter>('All');

let liveSnapshotChart: Chart | null = null;
let fleetAnalyticsChart: Chart | null = null;
let overviewChart: Chart | null = null;
let postsChart: Chart | null = null;
let eventsChart: Chart | null = null;

let refreshInterval: ReturnType<typeof setInterval> | null = null;

function createDefaultOnboardForm(): OmniTumblrOnboardForm {
    return {
        email: '',
        password: '',
        blogName: '',
        oauthTokenKey: '',
        oauthTokenSecret: '',
        useMemeScraperSource: true,
        memeNichesCsv: '',
        autonomousPostingEnabled: true,
        autonomousPostingIntervalMinutes: 240,
        autonomousPostingRandomOffsetMinutes: 30,
        autonomousCaptionPrompt: 'Write a short tumblr caption with hashtags',
        includeLiveVerification: false
    };
}

function createDefaultSettingsForm(): OmniTumblrSettingsForm {
    return {
        accountId: '',
        blogName: '',
        oauthTokenKey: '',
        oauthTokenSecret: '',
        useMemeScraperSource: true,
        memeNichesCsv: '',
        autonomousPostingEnabled: true,
        autonomousPostingIntervalMinutes: 240,
        autonomousPostingRandomOffsetMinutes: 30,
        autonomousCaptionPrompt: 'Short funny meme post text'
    };
}

function createDefaultDeleteAccountForm(): OmniTumblrDeleteAccountForm {
    return {
        accountId: '',
        deleteAssociatedPosts: true
    };
}

function createDefaultDeletePostForm(): OmniTumblrDeletePostForm {
    return {
        accountId: '',
        postId: ''
    };
}

function createDefaultLiveAccountForm(): OmniTumblrLiveAccountForm {
    return {
        accountId: ''
    };
}

function createDefaultScheduleForm(): OmniTumblrScheduleForm {
    return {
        dispatchMode: 'AllManagedAccounts',
        accountId: '',
        captionMode: 'AI',
        userCaption: '',
        aiCaptionPrompt: 'Write a short tumblr caption with hashtags',
        useDirectUpload: false,
        mediaPath: '',
        scheduledForUtcLocal: ''
    };
}

function createDefaultOverviewFilter(): OmniTumblrOverviewFilter {
    return {
        fromUtcLocal: '',
        toUtcLocal: ''
    };
}

const onboardForm = ref<OmniTumblrOnboardForm>(createDefaultOnboardForm());
const settingsForm = ref<OmniTumblrSettingsForm>(createDefaultSettingsForm());
const deleteAccountForm = ref<OmniTumblrDeleteAccountForm>(createDefaultDeleteAccountForm());
const deletePostForm = ref<OmniTumblrDeletePostForm>(createDefaultDeletePostForm());
const liveAccountForm = ref<OmniTumblrLiveAccountForm>(createDefaultLiveAccountForm());
const scheduleForm = ref<OmniTumblrScheduleForm>(createDefaultScheduleForm());
const overviewFilter = ref<OmniTumblrOverviewFilter>(createDefaultOverviewFilter());
const scheduleUploadFile = ref<File | null>(null);

const serviceOnline = computed(() => Boolean(health.value));
function parsePageView(value: unknown): OmniTumblrPageView | null {
    if (typeof value !== 'string') return null;

    const normalized = value.trim().toLowerCase();
    if (normalized === 'analytics') return 'analytics';
    if (normalized === 'add-managed-account') return 'add-managed-account';
    if (normalized === 'update-managed-account-settings') return 'update-managed-account-settings';
    if (normalized === 'delete-managed-account') return 'delete-managed-account';
    if (normalized === 'schedule-post-campaign') return 'schedule-post-campaign';

    return null;
}

const activePageView = computed<OmniTumblrPageView>(() => {
    const queryView = parsePageView(route.query.view);
    if (queryView) {
        return queryView;
    }

    const normalizedPath = route.path.replace(/\/+$/, '').toLowerCase();

    if (normalizedPath.endsWith('/add-managed-account')) return 'add-managed-account';
    if (normalizedPath.endsWith('/update-managed-account-settings')) return 'update-managed-account-settings';
    if (normalizedPath.endsWith('/delete-managed-account')) return 'delete-managed-account';
    if (normalizedPath.endsWith('/schedule-post-campaign')) return 'schedule-post-campaign';

    return 'analytics';
});

function navigateToSubPage(view: OmniTumblrPageView) {
    if (view === 'analytics') {
        router.push({ path: '/schemery/omnitumblr', query: {} });
        return;
    }

    router.push({ path: '/schemery/omnitumblr', query: { view } });
}

const isAnalyticsPage = computed(() => activePageView.value === 'analytics');
const isCommandPage = computed(() => !isAnalyticsPage.value);

const pageSubtitleText = computed(() => {
    if (isAnalyticsPage.value) {
        return 'Managed Tumblr analytics workspace with interactive telemetry, queue behavior, and event stream insight';
    }

    return 'Managed Tumblr command workspace with focused execution controls on dedicated sub pages';
});

const commandPanelHeading = computed(() => {
    if (activePageView.value === 'add-managed-account') return 'Add Managed Tumblr Account';
    if (activePageView.value === 'update-managed-account-settings') return 'Update Managed Account Settings';
    if (activePageView.value === 'delete-managed-account') return 'Delete Managed Account';
    if (activePageView.value === 'schedule-post-campaign') return 'Schedule Post Campaign';
    return 'Command Center';
});

const commandPanelHint = computed(() => {
    if (activePageView.value === 'add-managed-account') return 'Onboarding and live verification';
    if (activePageView.value === 'update-managed-account-settings') return 'Runtime configuration management';
    if (activePageView.value === 'delete-managed-account') return 'Destructive account and post operations';
    if (activePageView.value === 'schedule-post-campaign') return 'Campaign dispatch and media upload';
    return 'Commander controls';
});

const activeAccounts = computed(() => accounts.value.filter(account => accountStatusLabel(account.Status) === 'Active'));
const postedCount = computed(() => Number(overview.value?.Posted || 0));
const failedCount = computed(() => Number(overview.value?.Failed || 0));
const totalPostsText = computed(() => Number(overview.value?.TotalPosts || 0).toLocaleString());
const successRateText = computed(() => `${Number(overview.value?.SuccessRate || 0).toFixed(2)}%`);
const byAccountRows = computed(() => (Array.isArray(overview.value?.ByAccount) ? overview.value?.ByAccount || [] : []).slice(0, 8));
const topFailures = computed(() => (Array.isArray(overview.value?.TopFailureReasons) ? overview.value?.TopFailureReasons || [] : []).slice(0, 4));

const postStatusFilters: PostStatusFilter[] = ['All', 'Scheduled', 'Processing', 'Posted', 'Failed'];
const eventLevelFilters: EventLevelFilter[] = ['All', 'Information', 'Warning', 'Error'];
const fleetMetricOptions: Array<{ value: FleetMetric; label: string }> = [
    { value: 'AvgNotes', label: 'Avg Notes' },
    { value: 'BlogPostCount', label: 'Blog Posts' },
    { value: 'LikesCount', label: 'Likes' }
];

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object'
        ? value as Record<string, unknown>
        : {};
}

function asNumber(value: unknown): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
}

function asText(value: unknown, fallback = 'N/A'): string {
    if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }

    return fallback;
}

function asNonEmptyText(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function extractLiveVerificationError(liveVerification: unknown): string | null {
    if (!liveVerification || typeof liveVerification !== 'object') {
        return null;
    }

    const payload = liveVerification as Record<string, unknown>;
    return asNonEmptyText(payload.error) || asNonEmptyText(payload.Error);
}

function extractLiveVerificationGuidance(liveVerification: unknown): string | null {
    if (!liveVerification || typeof liveVerification !== 'object') {
        return null;
    }

    const payload = liveVerification as Record<string, unknown>;
    return asNonEmptyText(payload.guidance) || asNonEmptyText(payload.Guidance);
}

const hasLiveSnapshot = computed(() => Boolean(liveAccountData.value));

const liveSnapshotPayload = computed(() => asRecord(liveAccountData.value));
const liveSnapshotAccount = computed(() => asRecord(liveSnapshotPayload.value.Account));
const liveSnapshotTumblr = computed(() => asRecord(liveSnapshotPayload.value.Tumblr));
const liveSnapshotBlogInfo = computed(() => asRecord(liveSnapshotTumblr.value.BlogInfo));
const liveSnapshotLikes = computed(() => asRecord(liveSnapshotTumblr.value.Likes));
const liveSnapshotUserInfo = computed(() => asRecord(liveSnapshotTumblr.value.UserInfo));

const liveSnapshotBlogTitle = computed(() => asText(
    liveSnapshotBlogInfo.value.Title,
    asText(liveSnapshotBlogInfo.value.Name, 'Tumblr Blog')
));
const liveSnapshotBlogName = computed(() => asText(
    liveSnapshotBlogInfo.value.Name,
    asText(liveSnapshotAccount.value.BlogName, 'N/A')
));
const liveSnapshotUserName = computed(() => asText(
    liveSnapshotUserInfo.value.Name,
    asText(liveSnapshotAccount.value.Email, 'Unknown')
));
const liveSnapshotFetchedAtText = computed(() => formatDateTime(asText(liveSnapshotPayload.value.FetchTimestampUtc, '')));

const liveSnapshotMetrics = computed(() => [
    {
        label: 'Posts',
        value: asNumber(liveSnapshotBlogInfo.value.PostsCount)
    },
    {
        label: 'Likes',
        value: asNumber(liveSnapshotBlogInfo.value.LikesCount)
    },
    {
        label: 'Liked',
        value: asNumber(liveSnapshotLikes.value.LikedCount)
    }
]);

const fleetResults = computed<OmniTumblrLiveAnalyticsResult[]>(() => {
    const payload = asRecord(liveAnalyticsData.value);
    const rawResults = Array.isArray(payload.Results) ? payload.Results : [];

    return rawResults
        .map(item => {
            const row = asRecord(item);

            return {
                AccountId: asText(row.AccountId, ''),
                Email: asText(row.Email, ''),
                BlogName: asText(row.BlogName, ''),
                BlogTitle: asText(row.BlogTitle, ''),
                Success: Boolean(row.Success),
                BlogPostCount: asNumber(row.BlogPostCount),
                LikesCount: asNumber(row.LikesCount),
                AvgNotes: asNumber(row.AvgNotes),
                SamplePosts: asNumber(row.SamplePosts),
                TopTags: Array.isArray(row.TopTags)
                    ? row.TopTags.map(tagItem => {
                        const tag = asRecord(tagItem);
                        return {
                            tag: asText(tag.tag, ''),
                            count: asNumber(tag.count)
                        };
                    })
                    : []
            };
        })
        .filter(row => row.AccountId.length > 0);
});

const hasFleetAnalytics = computed(() => fleetResults.value.length > 0);

const sortedFleetResults = computed(() => {
    const metric = fleetMetric.value;
    return [...fleetResults.value]
        .sort((a, b) => asNumber(b[metric]) - asNumber(a[metric]))
        .slice(0, 10);
});

const fleetMetricMax = computed(() => {
    const maxValue = sortedFleetResults.value.reduce((highest, row) => {
        const metricValue = asNumber(row[fleetMetric.value]);
        return Math.max(highest, metricValue);
    }, 0);

    return maxValue > 0 ? maxValue : 1;
});

const hasOverviewRows = computed(() => byAccountRows.value.length > 0);

const hasPosts = computed(() => posts.value.length > 0);

const postStatusTotals = computed(() => {
    const totals: Record<PostStatusFilter, number> = {
        All: posts.value.length,
        Scheduled: 0,
        Processing: 0,
        Posted: 0,
        Failed: 0
    };

    for (const post of posts.value) {
        const label = postStatusLabel(post.Status) as PostStatusFilter;
        if (label in totals) {
            totals[label] += 1;
        }
    }

    return totals;
});

const filteredPosts = computed(() => {
    if (postStatusFilter.value === 'All') {
        return posts.value;
    }

    return posts.value.filter(post => postStatusLabel(post.Status) === postStatusFilter.value);
});

const hasEvents = computed(() => events.value.length > 0);

function normalizedEventLevel(level?: string) {
    const normalized = `${level || ''}`.trim().toLowerCase();
    if (normalized === 'warning') return 'Warning';
    if (normalized === 'error') return 'Error';
    return 'Information';
}

const eventLevelTotals = computed(() => {
    const totals: Record<EventLevelFilter, number> = {
        All: events.value.length,
        Information: 0,
        Warning: 0,
        Error: 0
    };

    for (const eventItem of events.value) {
        const level = normalizedEventLevel(eventItem.Level) as EventLevelFilter;
        if (level in totals) {
            totals[level] += 1;
        }
    }

    return totals;
});

const filteredEvents = computed(() => {
    if (eventLevelFilter.value === 'All') {
        return events.value;
    }

    return events.value.filter(eventItem => normalizedEventLevel(eventItem.Level) === eventLevelFilter.value);
});

function navigateBack() {
    router.push('/schemes');
}

function shortId(value?: string | null) {
    if (!value) return 'N/A';
    if (value.length <= 12) return value;
    return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function currentFleetMetricLabel() {
    return fleetMetricOptions.find(option => option.value === fleetMetric.value)?.label || 'Metric';
}

function formatFleetMetricValue(row: OmniTumblrLiveAnalyticsResult) {
    const metricValue = asNumber(row[fleetMetric.value]);
    if (fleetMetric.value === 'AvgNotes') {
        return `${metricValue.toFixed(2)} notes`;
    }

    return metricValue.toLocaleString();
}

function fleetMetricPercent(row: OmniTumblrLiveAnalyticsResult) {
    const metricValue = asNumber(row[fleetMetric.value]);
    return Math.max(8, Math.min(100, (metricValue / fleetMetricMax.value) * 100));
}

function resolveAccountLabel(accountId: string) {
    const account = getAccountById(accountId);
    if (!account) {
        return shortId(accountId);
    }

    return `${account.Email} · ${account.BlogName}`;
}

function postStatusCount(filter: PostStatusFilter) {
    return postStatusTotals.value[filter] || 0;
}

function selectPostStatus(filter: PostStatusFilter) {
    postStatusFilter.value = filter;
}

function eventLevelCount(filter: EventLevelFilter) {
    return eventLevelTotals.value[filter] || 0;
}

function selectEventLevel(filter: EventLevelFilter) {
    eventLevelFilter.value = filter;
}

function postKey(post: OmniTumblrPost, index: number) {
    return post.PostId || post.PlannedPostId || `${post.AccountId}-${post.ScheduledForUtc || 'n/a'}-${index}`;
}

function eventKey(eventItem: OmniTumblrEvent, index: number) {
    return eventItem.EventId || `${eventItem.EventTimeUtc || eventItem.TimestampUtc || 'n/a'}-${index}`;
}

function formatDateTime(value?: string | null) {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString();
}

function formatBytes(bytes: number) {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, index);
    return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function toLocalDateTimeInput(date: Date) {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function seedDefaultScheduleTime() {
    const nextWindow = new Date(Date.now() + 20 * 60 * 1000);
    scheduleForm.value.scheduledForUtcLocal = toLocalDateTimeInput(nextWindow);
}

function parseMemeNichesCsv(csv: string): string[] {
    if (!csv || !csv.trim()) return [];

    const seen = new Set<string>();
    const result: string[] = [];

    for (const part of csv.split(',')) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(trimmed);
    }

    return result;
}

function toNicheCsv(values?: string[] | null): string {
    if (!Array.isArray(values) || values.length === 0) return '';
    return values.filter(Boolean).join(', ');
}

function parseOptionalLocalDate(value: string): string | null {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        throw new Error('Provided date range includes an invalid datetime value.');
    }
    return parsed.toISOString();
}

function accountStatusLabel(status: unknown): string {
    const normalized = `${status ?? ''}`.replace(/[\s_-]+/g, '').toLowerCase();

    if (status === 0 || normalized === 'active') return 'Active';
    if (status === 1 || normalized === 'needsverification') return 'Needs Verification';
    if (status === 2 || normalized === 'disabled') return 'Disabled';
    if (status === 3 || normalized === 'authfailed') return 'Auth Failed';
    return 'Unknown';
}

function accountStatusClass(status: unknown) {
    const label = accountStatusLabel(status);
    if (label === 'Active') return 'status-ok';
    if (label === 'Needs Verification') return 'status-warn';
    if (label === 'Auth Failed') return 'status-danger';
    if (label === 'Disabled') return 'status-muted';
    return 'status-muted';
}

function canRetryVerification(status: unknown): boolean {
    const label = accountStatusLabel(status);
    return label === 'Needs Verification' || label === 'Auth Failed';
}

function accountVerificationStateLabel(account: OmniTumblrAccount): string {
    const label = accountStatusLabel(account.Status);
    if (label === 'Active') return 'Verified';
    if (label === 'Needs Verification') return 'NeedsVerification';
    if (label === 'Auth Failed') return 'AuthFailed';
    return label.replace(/\s+/g, '');
}

function accountVerificationGuidance(account: OmniTumblrAccount): string | null {
    const stored = asNonEmptyText(account.LastAuthenticationGuidance);
    if (stored) return stored;

    const label = accountStatusLabel(account.Status);
    if (label === 'Needs Verification') {
        return 'Retry live verification, then confirm account access in Tumblr if prompted.';
    }

    if (label === 'Auth Failed') {
        return 'Recheck email/password and OAuth token credentials, then retry verification.';
    }

    return null;
}

function accountNeedsVerificationDetails(account: OmniTumblrAccount): boolean {
    return accountStatusLabel(account.Status) !== 'Active'
        || Boolean(account.LastAuthenticationError)
        || Boolean(accountVerificationGuidance(account));
}

function postStatusLabel(status: unknown): string {
    const normalized = `${status ?? ''}`.replace(/[\s_-]+/g, '').toLowerCase();
    if (status === 0 || normalized === 'scheduled') return 'Scheduled';
    if (status === 1 || normalized === 'processing') return 'Processing';
    if (status === 2 || normalized === 'posted') return 'Posted';
    if (status === 3 || normalized === 'failed') return 'Failed';
    return 'Unknown';
}

function postStatusClass(status: unknown) {
    const label = postStatusLabel(status);
    if (label === 'Posted') return 'status-ok';
    if (label === 'Failed') return 'status-danger';
    if (label === 'Processing') return 'status-warn';
    return 'status-muted';
}

function eventLevelClass(level?: string) {
    const normalized = `${level || ''}`.toLowerCase();
    if (normalized === 'error') return 'status-danger';
    if (normalized === 'warning') return 'status-warn';
    if (normalized === 'information' || normalized === 'info') return 'status-ok';
    return 'status-muted';
}

function accountNicheSummary(account: OmniTumblrAccount): string {
    const niches = parseMemeNichesCsv(toNicheCsv(account.PreferredMemeNiches));
    if (niches.length === 0) return 'No niches mapped';
    if (niches.length > 3) return `${niches.slice(0, 3).join(', ')} +${niches.length - 3}`;
    return niches.join(', ');
}

function readAccountTokenKey(account: OmniTumblrAccount): string {
    return account.oauthTokenKey || account.OAuthTokenKey || '';
}

function readAccountTokenSecret(account: OmniTumblrAccount): string {
    return account.oauthTokenSecret || account.OAuthTokenSecret || '';
}

function getAccountById(accountId: string) {
    return accounts.value.find(account => account.AccountId === accountId);
}

function findAccountByIdentity(email: string, blogName: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedBlogName = blogName.trim().toLowerCase();

    return accounts.value.find(account => {
        const accountEmail = account.Email.trim().toLowerCase();
        const accountBlogName = account.BlogName.trim().toLowerCase();
        return accountEmail === normalizedEmail && accountBlogName === normalizedBlogName;
    }) || accounts.value.find(account => account.Email.trim().toLowerCase() === normalizedEmail);
}

function setLiveAccount(accountId: string) {
    liveAccountForm.value.accountId = accountId;
}

function hydrateSettingsFromAccount(accountId: string) {
    const account = getAccountById(accountId);
    if (!account) return;

    settingsForm.value.accountId = account.AccountId;
    settingsForm.value.blogName = account.BlogName || '';
    settingsForm.value.oauthTokenKey = readAccountTokenKey(account);
    settingsForm.value.oauthTokenSecret = readAccountTokenSecret(account);
    settingsForm.value.useMemeScraperSource = Boolean(account.UseMemeScraperSource);
    settingsForm.value.memeNichesCsv = toNicheCsv(account.PreferredMemeNiches);
    settingsForm.value.autonomousPostingEnabled = Boolean(account.AutonomousPostingEnabled);
    settingsForm.value.autonomousPostingIntervalMinutes = Math.max(1, Number(account.AutonomousPostingIntervalMinutes || 240));
    settingsForm.value.autonomousPostingRandomOffsetMinutes = Math.max(0, Number(account.AutonomousPostingRandomOffsetMinutes || 0));
    settingsForm.value.autonomousCaptionPrompt = account.AutonomousCaptionPrompt || createDefaultSettingsForm().autonomousCaptionPrompt;
}

function syncAccountSelectors() {
    const validIds = new Set(accounts.value.map(account => account.AccountId));
    const fallbackId = accounts.value.length > 0 ? accounts.value[0].AccountId : '';

    const normalizeSelector = (value: string) => (validIds.has(value) ? value : fallbackId);

    if (settingsForm.value.accountId && !validIds.has(settingsForm.value.accountId)) {
        settingsForm.value = createDefaultSettingsForm();
    }

    deleteAccountForm.value.accountId = normalizeSelector(deleteAccountForm.value.accountId);
    deletePostForm.value.accountId = normalizeSelector(deletePostForm.value.accountId);
    liveAccountForm.value.accountId = normalizeSelector(liveAccountForm.value.accountId);

    if (scheduleForm.value.dispatchMode === 'SingleAccount') {
        scheduleForm.value.accountId = normalizeSelector(scheduleForm.value.accountId);
    }

    if (!settingsForm.value.accountId && fallbackId) {
        hydrateSettingsFromAccount(fallbackId);
    }
}

function resetOnboardForm() {
    onboardForm.value = createDefaultOnboardForm();
}

function resetDeleteForms() {
    deleteAccountForm.value = createDefaultDeleteAccountForm();
    deletePostForm.value = createDefaultDeletePostForm();

    if (accounts.value.length > 0) {
        deleteAccountForm.value.accountId = accounts.value[0].AccountId;
        deletePostForm.value.accountId = accounts.value[0].AccountId;
    }
}

function ensureAutonomousValues(enabled: boolean, interval: number, randomOffset: number) {
    if (!enabled) return;

    if (!Number.isFinite(interval) || interval <= 0) {
        throw new Error('Autonomous interval must be greater than 0 minutes.');
    }

    if (!Number.isFinite(randomOffset) || randomOffset < 0) {
        throw new Error('Autonomous random offset must be zero or greater.');
    }
}

function toggleCsvNiche(target: 'onboard' | 'settings', nicheName: string) {
    const current = target === 'onboard' ? onboardForm.value.memeNichesCsv : settingsForm.value.memeNichesCsv;
    const values = parseMemeNichesCsv(current);
    const normalized = nicheName.trim().toLowerCase();

    const exists = values.some(item => item.trim().toLowerCase() === normalized);
    const next = exists
        ? values.filter(item => item.trim().toLowerCase() !== normalized)
        : [...values, nicheName.trim()];

    if (target === 'onboard') {
        onboardForm.value.memeNichesCsv = next.join(', ');
    } else {
        settingsForm.value.memeNichesCsv = next.join(', ');
    }
}

function onUploadFileChanged(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target?.files && target.files.length > 0 ? target.files[0] : null;
    scheduleUploadFile.value = file;
}

async function readApiError(response: Response): Promise<string> {
    const raw = await response.text();
    if (!raw) return `Request failed with status ${response.status}.`;

    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            const payload = parsed as Record<string, unknown>;
            if (typeof payload.error === 'string') return payload.error;
            if (typeof payload.message === 'string') return payload.message;
            if (typeof payload.Message === 'string') return payload.Message;
        }
        return raw;
    } catch {
        return raw;
    }
}

async function fetchLiveAccountPayload(accountId: string) {
    const response = await RequestGETFromKliveAPI(`/omnitumblr/accounts/live?accountId=${encodeURIComponent(accountId)}`, false, false);
    if (!response.ok) throw new Error(await readApiError(response));
    const payload = await response.json();
    liveAccountData.value = payload || null;
}

async function fetchLiveAnalyticsPayload() {
    const response = await RequestGETFromKliveAPI('/omnitumblr/accounts/liveAnalytics', false, false);
    if (!response.ok) throw new Error(await readApiError(response));
    const payload = await response.json();
    liveAnalyticsData.value = payload || null;
}

async function loadAccounts() {
    const response = await RequestGETFromKliveAPI('/omnitumblr/accounts/list', false, false);
    if (!response.ok) throw new Error(await readApiError(response));
    const payload = await response.json();
    accounts.value = Array.isArray(payload) ? payload : [];
    syncAccountSelectors();
}

async function loadPosts() {
    const response = await RequestGETFromKliveAPI('/omnitumblr/posts/list?take=25', false, false);
    if (!response.ok) throw new Error(await readApiError(response));
    const payload = await response.json();
    posts.value = Array.isArray(payload) ? payload : [];
}

async function loadEvents() {
    const response = await RequestGETFromKliveAPI('/omnitumblr/logs/events?take=25', false, false);
    if (!response.ok) throw new Error(await readApiError(response));
    const payload = await response.json();
    events.value = Array.isArray(payload) ? payload : [];
}

async function loadOverview() {
    const params = new URLSearchParams();

    const fromUtc = parseOptionalLocalDate(overviewFilter.value.fromUtcLocal);
    const toUtc = parseOptionalLocalDate(overviewFilter.value.toUtcLocal);

    if (fromUtc) params.set('fromUtc', fromUtc);
    if (toUtc) params.set('toUtc', toUtc);

    const suffix = params.toString() ? `?${params.toString()}` : '';
    const response = await RequestGETFromKliveAPI(`/omnitumblr/analytics/overview${suffix}`, false, false);
    if (!response.ok) throw new Error(await readApiError(response));

    const payload = await response.json();
    overview.value = payload || null;
}

async function loadHealth() {
    const response = await RequestGETFromKliveAPI('/omnitumblr/health', false, false);
    if (!response.ok) throw new Error(await readApiError(response));
    const payload = await response.json();
    health.value = payload || null;
}

async function loadSavedNiches() {
    const response = await RequestGETFromKliveAPI('/memescraper/getAllSavedNiches', false, false);
    if (!response.ok) {
        allMemeNiches.value = [];
        return;
    }

    const payload = await response.json();
    const raw = Array.isArray(payload) ? payload : [];

    allMemeNiches.value = raw
        .filter((item: unknown): item is MemeScraperNiche => Boolean(item && typeof item === 'object' && 'NicheTagName' in item))
        .filter(item => Boolean(item.NicheTagName && item.NicheTagName.trim().length > 0))
        .sort((a, b) => a.NicheTagName.localeCompare(b.NicheTagName));
}

async function loadAllPanels(showSpinner = false) {
    if (showSpinner) {
        isLoading.value = true;
    }

    const results = await Promise.allSettled([
        loadAccounts(),
        loadPosts(),
        loadEvents(),
        loadOverview(),
        loadHealth(),
        loadSavedNiches(),
        fetchLiveAnalyticsPayload()
    ]);

    let failureCount = results.filter(result => result.status === 'rejected').length;

    if (liveAccountForm.value.accountId) {
        const liveResult = await Promise.allSettled([fetchLiveAccountPayload(liveAccountForm.value.accountId)]);
        failureCount += liveResult.filter(result => result.status === 'rejected').length;
    }

    panelError.value = failureCount > 0
        ? `Partial telemetry loaded. ${failureCount} request${failureCount > 1 ? 's' : ''} failed.`
        : '';

    lastRefresh.value = new Date().toLocaleTimeString();
    await renderAllVisualCharts();

    if (showSpinner) {
        isLoading.value = false;
    }
}

async function submitOnboardAccount() {
    if (!onboardForm.value.email || !onboardForm.value.password || !onboardForm.value.blogName || !onboardForm.value.oauthTokenKey || !onboardForm.value.oauthTokenSecret) {
        Swal.fire({
            icon: 'warning',
            title: 'Missing fields',
            text: 'Email, password, blog name, oauth token key, and oauth token secret are required.',
            confirmButtonColor: '#1d9bf0',
            background: '#15171d',
            color: '#ffffff'
        });
        return;
    }

    try {
        ensureAutonomousValues(
            onboardForm.value.autonomousPostingEnabled,
            onboardForm.value.autonomousPostingIntervalMinutes,
            onboardForm.value.autonomousPostingRandomOffsetMinutes
        );
    } catch (error) {
        Swal.fire({
            icon: 'warning',
            title: 'Invalid autonomous settings',
            text: error instanceof Error ? error.message : 'Autonomous settings are invalid.',
            confirmButtonColor: '#1d9bf0',
            background: '#15171d',
            color: '#ffffff'
        });
        return;
    }

    commandBusy.value = true;

    try {
        const requestedEmail = onboardForm.value.email.trim();
        const requestedBlogName = onboardForm.value.blogName.trim();
        const includeLiveVerification = onboardForm.value.includeLiveVerification;
        const payload = {
            email: requestedEmail,
            password: onboardForm.value.password,
            blogName: requestedBlogName,
            oauthTokenKey: onboardForm.value.oauthTokenKey.trim(),
            oauthTokenSecret: onboardForm.value.oauthTokenSecret.trim(),
            useMemeScraperSource: onboardForm.value.useMemeScraperSource,
            memeNiches: onboardForm.value.useMemeScraperSource ? parseMemeNichesCsv(onboardForm.value.memeNichesCsv) : [],
            autonomousPostingEnabled: onboardForm.value.autonomousPostingEnabled,
            autonomousPostingIntervalMinutes: onboardForm.value.autonomousPostingEnabled ? onboardForm.value.autonomousPostingIntervalMinutes : null,
            autonomousPostingRandomOffsetMinutes: onboardForm.value.autonomousPostingEnabled ? onboardForm.value.autonomousPostingRandomOffsetMinutes : null,
            autonomousCaptionPrompt: onboardForm.value.autonomousPostingEnabled ? onboardForm.value.autonomousCaptionPrompt : null
        };

        const response = await RequestPOSTFromKliveAPI(
            `/omnitumblr/accounts/add?includeLiveVerification=${includeLiveVerification ? 'true' : 'false'}`,
            JSON.stringify(payload),
            false,
            true
        );

        if (!response.ok) {
            throw new Error(await readApiError(response));
        }

        const rawData = await response.json().catch(() => ({}));
        const data = (rawData && typeof rawData === 'object' ? rawData : {}) as OmniTumblrAddAccountResponse;
        const liveVerificationRequested = Boolean(data.LiveVerificationRequested ?? includeLiveVerification);
        const hasLiveVerification = data.LiveVerification !== null && data.LiveVerification !== undefined;
        const liveVerificationError = extractLiveVerificationError(data.LiveVerification);

        resetOnboardForm();
        await loadAllPanels(false);

        const accountFromResponse = asNonEmptyText(data.AccountId);
        const accountFromList = accountFromResponse
            ? getAccountById(accountFromResponse)
            : findAccountByIdentity(requestedEmail, requestedBlogName);
        const onboardedAccountId = accountFromList?.AccountId || accountFromResponse;
        const verificationState = asNonEmptyText(data.VerificationState)
            || (accountFromList && accountStatusLabel(accountFromList.Status) === 'Active' ? 'Verified' : 'NeedsVerification');
        const verificationGuidance = asNonEmptyText(data.VerificationGuidance)
            || extractLiveVerificationGuidance(data.LiveVerification)
            || asNonEmptyText(data.LastAuthenticationGuidance)
            || (accountFromList ? accountVerificationGuidance(accountFromList) : null)
            || 'Retry live verification once Tumblr credentials are confirmed.';
        const onboardingAuthError = asNonEmptyText(data.LastAuthenticationError)
            || asNonEmptyText(liveVerificationError)
            || asNonEmptyText(accountFromList?.LastAuthenticationError);

        if (verificationState !== 'Verified') {
            const pendingMessage = [
                `State: ${verificationState}`,
                verificationGuidance,
                onboardingAuthError ? `Tumblr error: ${onboardingAuthError}` : '',
                liveVerificationRequested
                    ? 'Live verification ran but the account still needs follow-up.'
                    : 'Live verification was skipped during onboarding. Use Retry Verification when ready.'
            ].filter(Boolean).join('\n\n');

            const action = await Swal.fire({
                icon: 'info',
                title: 'Account saved, verification pending',
                text: pendingMessage,
                confirmButtonText: 'Retry',
                showCancelButton: true,
                cancelButtonText: 'Later',
                confirmButtonColor: '#1d9bf0',
                cancelButtonColor: '#334155',
                background: '#15171d',
                color: '#ffffff'
            });

            if (action.isConfirmed) {
                if (!onboardedAccountId) {
                    Swal.fire({
                        icon: 'warning',
                        title: 'Retry unavailable',
                        text: 'Managed account was saved but account id could not be resolved. Refresh and retry from Managed Accounts.',
                        confirmButtonColor: '#1d9bf0',
                        background: '#15171d',
                        color: '#ffffff'
                    });
                } else {
                    await retryVerificationForAccount(onboardedAccountId, accountFromList?.Email || requestedEmail);
                }
            }

            return;
        }

        Swal.fire({
            icon: 'success',
            title: 'Managed account onboarded',
            text: liveVerificationRequested
                ? (hasLiveVerification
                    ? 'Managed account onboarded and live verification payload was captured.'
                    : 'Managed account onboarded and live verification was requested.')
                : 'Managed account onboarded. Live verification was skipped for reliability; run Retry Verification when ready.',
            confirmButtonColor: '#22c55e',
            background: '#15171d',
            color: '#ffffff'
        });
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'Onboarding failed',
            text: error instanceof Error ? error.message : 'Unable to add managed Tumblr account.',
            confirmButtonColor: '#ef4444',
            background: '#15171d',
            color: '#ffffff'
        });
    } finally {
        commandBusy.value = false;
    }
}

async function retryVerificationForAccount(accountId: string, email?: string) {
    liveBusy.value = true;
    liveAccountForm.value.accountId = accountId;

    try {
        await fetchLiveAccountPayload(accountId);
        await loadAllPanels(false);

        const refreshedAccount = getAccountById(accountId);
        const status = refreshedAccount ? accountStatusLabel(refreshedAccount.Status) : 'Unknown';
        const liveVerificationError = extractLiveVerificationError(liveAccountData.value);
        const liveVerificationGuidance = extractLiveVerificationGuidance(liveAccountData.value)
            || (refreshedAccount ? accountVerificationGuidance(refreshedAccount) : null)
            || 'Retry in a moment. If this persists, re-check Tumblr credentials and blog mapping.';
        const verified = status === 'Active' && !liveVerificationError;
        const verificationState = refreshedAccount
            ? accountVerificationStateLabel(refreshedAccount)
            : 'NeedsVerification';

        Swal.fire({
            icon: verified ? 'success' : 'info',
            title: verified ? 'Verification complete' : 'Verification still pending',
            text: verified
                ? `${email || refreshedAccount?.Email || 'Managed account'} is now authenticated and live data was refreshed.`
                : [
                    `State: ${status === 'Unknown' ? 'NeedsVerification' : verificationState}`,
                    liveVerificationGuidance,
                    liveVerificationError ? `Live error: ${liveVerificationError}` : ''
                ].filter(Boolean).join('\n\n'),
            confirmButtonColor: verified ? '#22c55e' : '#1d9bf0',
            background: '#15171d',
            color: '#ffffff'
        });
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'Retry failed',
            text: error instanceof Error ? error.message : 'Unable to complete live verification retry.',
            confirmButtonColor: '#ef4444',
            background: '#15171d',
            color: '#ffffff'
        });
    } finally {
        liveBusy.value = false;
    }
}

async function submitAccountSettings() {
    if (!settingsForm.value.accountId) {
        Swal.fire({
            icon: 'warning',
            title: 'Select account',
            text: 'Choose a managed account before updating settings.',
            confirmButtonColor: '#1d9bf0',
            background: '#15171d',
            color: '#ffffff'
        });
        return;
    }

    if (!settingsForm.value.blogName || !settingsForm.value.oauthTokenKey || !settingsForm.value.oauthTokenSecret) {
        Swal.fire({
            icon: 'warning',
            title: 'Missing fields',
            text: 'Blog name and oauth token credentials are required for settings update.',
            confirmButtonColor: '#1d9bf0',
            background: '#15171d',
            color: '#ffffff'
        });
        return;
    }

    try {
        ensureAutonomousValues(
            settingsForm.value.autonomousPostingEnabled,
            settingsForm.value.autonomousPostingIntervalMinutes,
            settingsForm.value.autonomousPostingRandomOffsetMinutes
        );
    } catch (error) {
        Swal.fire({
            icon: 'warning',
            title: 'Invalid autonomous settings',
            text: error instanceof Error ? error.message : 'Autonomous settings are invalid.',
            confirmButtonColor: '#1d9bf0',
            background: '#15171d',
            color: '#ffffff'
        });
        return;
    }

    commandBusy.value = true;

    try {
        const payload = {
            accountId: settingsForm.value.accountId,
            blogName: settingsForm.value.blogName.trim(),
            oauthTokenKey: settingsForm.value.oauthTokenKey.trim(),
            oauthTokenSecret: settingsForm.value.oauthTokenSecret.trim(),
            useMemeScraperSource: settingsForm.value.useMemeScraperSource,
            memeNiches: settingsForm.value.useMemeScraperSource ? parseMemeNichesCsv(settingsForm.value.memeNichesCsv) : [],
            autonomousPostingEnabled: settingsForm.value.autonomousPostingEnabled,
            autonomousPostingIntervalMinutes: settingsForm.value.autonomousPostingEnabled ? settingsForm.value.autonomousPostingIntervalMinutes : null,
            autonomousPostingRandomOffsetMinutes: settingsForm.value.autonomousPostingEnabled ? settingsForm.value.autonomousPostingRandomOffsetMinutes : null,
            autonomousCaptionPrompt: settingsForm.value.autonomousPostingEnabled ? settingsForm.value.autonomousCaptionPrompt : null
        };

        const response = await RequestPOSTFromKliveAPI('/omnitumblr/accounts/updateSettings', JSON.stringify(payload), false, true);

        if (!response.ok) {
            throw new Error(await readApiError(response));
        }

        Swal.fire({
            icon: 'success',
            title: 'Settings updated',
            text: 'Managed Tumblr account settings were updated successfully.',
            confirmButtonColor: '#22c55e',
            background: '#15171d',
            color: '#ffffff'
        });

        await loadAllPanels(false);
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'Update failed',
            text: error instanceof Error ? error.message : 'Unable to update managed account settings.',
            confirmButtonColor: '#ef4444',
            background: '#15171d',
            color: '#ffffff'
        });
    } finally {
        commandBusy.value = false;
    }
}

async function deleteManagedAccount() {
    if (!deleteAccountForm.value.accountId) {
        Swal.fire({
            icon: 'warning',
            title: 'Select account',
            text: 'Choose a managed account to delete.',
            confirmButtonColor: '#1d9bf0',
            background: '#15171d',
            color: '#ffffff'
        });
        return;
    }

    const account = getAccountById(deleteAccountForm.value.accountId);

    const confirmation = await Swal.fire({
        icon: 'warning',
        title: `Delete ${account?.Email || 'managed account'}?`,
        text: 'This removes the account from OmniTumblr persistence and can optionally remove associated local post records.',
        confirmButtonText: 'Delete Account',
        cancelButtonText: 'Cancel',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#334155',
        background: '#15171d',
        color: '#ffffff'
    });

    if (!confirmation.isConfirmed) {
        return;
    }

    commandBusy.value = true;

    try {
        const payload = {
            accountId: deleteAccountForm.value.accountId,
            deleteAssociatedPosts: deleteAccountForm.value.deleteAssociatedPosts
        };

        const response = await RequestPOSTFromKliveAPI('/omnitumblr/accounts/delete', JSON.stringify(payload), false, true);
        if (!response.ok) throw new Error(await readApiError(response));

        const raw = await response.json().catch(() => null);
        const parsed = (raw && typeof raw === 'object' ? raw : {}) as DeleteResponse;
        const success = Boolean(parsed.Success ?? parsed.success);

        if (!success) {
            Swal.fire({
                icon: 'warning',
                title: 'Delete not confirmed',
                text: 'OmniTumblr responded, but did not confirm deletion success.',
                confirmButtonColor: '#1d9bf0',
                background: '#15171d',
                color: '#ffffff'
            });
            return;
        }

        if (liveAccountForm.value.accountId === deleteAccountForm.value.accountId) {
            liveAccountForm.value.accountId = '';
            liveAccountData.value = null;
        }

        resetDeleteForms();
        await loadAllPanels(false);

        Swal.fire({
            icon: 'success',
            title: 'Managed account deleted',
            text: `${account?.Email || 'Managed account'} was removed from OmniTumblr.`,
            confirmButtonColor: '#22c55e',
            background: '#15171d',
            color: '#ffffff'
        });
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'Delete failed',
            text: error instanceof Error ? error.message : 'Unable to delete managed account.',
            confirmButtonColor: '#ef4444',
            background: '#15171d',
            color: '#ffffff'
        });
    } finally {
        commandBusy.value = false;
    }
}

async function deleteTumblrPost() {
    if (!deletePostForm.value.accountId || !deletePostForm.value.postId) {
        Swal.fire({
            icon: 'warning',
            title: 'Missing input',
            text: 'Managed account and Tumblr post id are required.',
            confirmButtonColor: '#1d9bf0',
            background: '#15171d',
            color: '#ffffff'
        });
        return;
    }

    const parsedPostId = Number(deletePostForm.value.postId);
    if (!Number.isFinite(parsedPostId) || parsedPostId <= 0) {
        Swal.fire({
            icon: 'warning',
            title: 'Invalid post id',
            text: 'Tumblr post id must be a positive number.',
            confirmButtonColor: '#1d9bf0',
            background: '#15171d',
            color: '#ffffff'
        });
        return;
    }

    const confirmation = await Swal.fire({
        icon: 'warning',
        title: 'Delete Tumblr post?',
        text: 'This will call /omnitumblr/posts/deleteFromTumblr for the selected account/post id.',
        confirmButtonText: 'Delete Post',
        cancelButtonText: 'Cancel',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#334155',
        background: '#15171d',
        color: '#ffffff'
    });

    if (!confirmation.isConfirmed) {
        return;
    }

    commandBusy.value = true;

    try {
        const payload = {
            accountId: deletePostForm.value.accountId,
            postId: parsedPostId
        };

        const response = await RequestPOSTFromKliveAPI('/omnitumblr/posts/deleteFromTumblr', JSON.stringify(payload), false, true);
        if (!response.ok) throw new Error(await readApiError(response));

        const raw = await response.json().catch(() => null);
        const parsed = (raw && typeof raw === 'object' ? raw : {}) as DeleteResponse;
        const success = Boolean(parsed.Success ?? parsed.success);

        if (!success) {
            Swal.fire({
                icon: 'warning',
                title: 'Delete not confirmed',
                text: 'OmniTumblr accepted the request but did not confirm success.',
                confirmButtonColor: '#1d9bf0',
                background: '#15171d',
                color: '#ffffff'
            });
            return;
        }

        deletePostForm.value.postId = '';
        await loadAllPanels(false);

        Swal.fire({
            icon: 'success',
            title: 'Tumblr post deleted',
            text: 'OmniTumblr confirmed post deletion request.',
            confirmButtonColor: '#22c55e',
            background: '#15171d',
            color: '#ffffff'
        });
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'Delete failed',
            text: error instanceof Error ? error.message : 'Unable to delete Tumblr post.',
            confirmButtonColor: '#ef4444',
            background: '#15171d',
            color: '#ffffff'
        });
    } finally {
        commandBusy.value = false;
    }
}

async function requestLiveAccountSnapshot() {
    if (!liveAccountForm.value.accountId) {
        return;
    }

    liveBusy.value = true;

    try {
        await fetchLiveAccountPayload(liveAccountForm.value.accountId);
        await nextTick();
        renderLiveSnapshotChart();
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'Live snapshot failed',
            text: error instanceof Error ? error.message : 'Unable to load account live payload.',
            confirmButtonColor: '#ef4444',
            background: '#15171d',
            color: '#ffffff'
        });
    } finally {
        liveBusy.value = false;
    }
}

async function refreshLiveAnalytics() {
    liveAnalyticsBusy.value = true;

    try {
        await fetchLiveAnalyticsPayload();
        await nextTick();
        renderFleetAnalyticsChart();
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'Live analytics failed',
            text: error instanceof Error ? error.message : 'Unable to load fleet live analytics.',
            confirmButtonColor: '#ef4444',
            background: '#15171d',
            color: '#ffffff'
        });
    } finally {
        liveAnalyticsBusy.value = false;
    }
}

async function refreshOverviewRange() {
    overviewBusy.value = true;

    try {
        await loadOverview();
        await nextTick();
        renderOverviewChart();
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'Overview refresh failed',
            text: error instanceof Error ? error.message : 'Unable to refresh analytics overview.',
            confirmButtonColor: '#ef4444',
            background: '#15171d',
            color: '#ffffff'
        });
    } finally {
        overviewBusy.value = false;
    }
}

async function clearOverviewRange() {
    overviewFilter.value = createDefaultOverviewFilter();
    await refreshOverviewRange();
}

async function scheduleCampaign() {
    if (scheduleForm.value.dispatchMode === 'SingleAccount' && !scheduleForm.value.accountId) {
        Swal.fire({
            icon: 'warning',
            title: 'Pick account',
            text: 'Select an account for single-account dispatch mode.',
            confirmButtonColor: '#1d9bf0',
            background: '#15171d',
            color: '#ffffff'
        });
        return;
    }

    if (scheduleForm.value.captionMode === 'User' && !scheduleForm.value.userCaption.trim()) {
        Swal.fire({
            icon: 'warning',
            title: 'Caption missing',
            text: 'User caption mode requires a caption.',
            confirmButtonColor: '#1d9bf0',
            background: '#15171d',
            color: '#ffffff'
        });
        return;
    }

    if (scheduleForm.value.captionMode === 'AI' && !scheduleForm.value.aiCaptionPrompt.trim()) {
        Swal.fire({
            icon: 'warning',
            title: 'Prompt missing',
            text: 'AI caption mode requires a prompt.',
            confirmButtonColor: '#1d9bf0',
            background: '#15171d',
            color: '#ffffff'
        });
        return;
    }

    if (scheduleForm.value.useDirectUpload && !scheduleUploadFile.value) {
        Swal.fire({
            icon: 'warning',
            title: 'Upload required',
            text: 'Choose a media file when using file-upload mode.',
            confirmButtonColor: '#1d9bf0',
            background: '#15171d',
            color: '#ffffff'
        });
        return;
    }

    if (!scheduleForm.value.useDirectUpload && !scheduleForm.value.mediaPath.trim()) {
        Swal.fire({
            icon: 'warning',
            title: 'Media path required',
            text: 'Provide a media path for JSON scheduling mode.',
            confirmButtonColor: '#1d9bf0',
            background: '#15171d',
            color: '#ffffff'
        });
        return;
    }

    let scheduledForUtc: string | null = null;
    if (scheduleForm.value.scheduledForUtcLocal) {
        const scheduledDate = new Date(scheduleForm.value.scheduledForUtcLocal);
        if (Number.isNaN(scheduledDate.getTime())) {
            Swal.fire({
                icon: 'warning',
                title: 'Invalid datetime',
                text: 'Provided schedule datetime is not valid.',
                confirmButtonColor: '#1d9bf0',
                background: '#15171d',
                color: '#ffffff'
            });
            return;
        }

        scheduledForUtc = scheduledDate.toISOString();
    }

    commandBusy.value = true;

    try {
        const dispatchMode = scheduleForm.value.dispatchMode === 'SingleAccount' ? 0 : 1;

        if (scheduleForm.value.useDirectUpload && scheduleUploadFile.value) {
            const params = new URLSearchParams();
            params.set('fileName', scheduleUploadFile.value.name);
            params.set('dispatchMode', String(dispatchMode));

            if (dispatchMode === 0) {
                params.set('accountId', scheduleForm.value.accountId);
            }

            if (scheduleForm.value.captionMode === 'User' && scheduleForm.value.userCaption.trim()) {
                params.set('userCaption', scheduleForm.value.userCaption.trim());
            }

            if (scheduleForm.value.captionMode === 'AI' && scheduleForm.value.aiCaptionPrompt.trim()) {
                params.set('aiCaptionPrompt', scheduleForm.value.aiCaptionPrompt.trim());
            }

            if (scheduledForUtc) {
                params.set('scheduledForUtc', scheduledForUtc);
            }

            const response = await RequestPOSTFromKliveAPI(
                `/omnitumblr/posts/schedule?${params.toString()}`,
                scheduleUploadFile.value,
                false,
                false
            );

            if (!response.ok) {
                throw new Error(await readApiError(response));
            }

            scheduleUploadFile.value = null;

            Swal.fire({
                icon: 'success',
                title: 'Campaign scheduled (upload mode)',
                text: 'OmniTumblr accepted uploaded media bytes and scheduled dispatch.',
                confirmButtonColor: '#22c55e',
                background: '#15171d',
                color: '#ffffff'
            });
        } else {
            const payload: Record<string, unknown> = {
                dispatchMode,
                accountId: dispatchMode === 0 ? scheduleForm.value.accountId : null,
                userCaption: scheduleForm.value.captionMode === 'User' ? scheduleForm.value.userCaption.trim() : null,
                aiCaptionPrompt: scheduleForm.value.captionMode === 'AI' ? scheduleForm.value.aiCaptionPrompt.trim() : null,
                mediaPath: scheduleForm.value.mediaPath.trim(),
                scheduledForUtc
            };

            const response = await RequestPOSTFromKliveAPI('/omnitumblr/posts/schedule', JSON.stringify(payload), false, true);
            if (!response.ok) throw new Error(await readApiError(response));

            Swal.fire({
                icon: 'success',
                title: 'Campaign scheduled',
                text: 'OmniTumblr accepted the scheduling payload.',
                confirmButtonColor: '#22c55e',
                background: '#15171d',
                color: '#ffffff'
            });
        }

        await loadAllPanels(false);
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'Scheduling failed',
            text: error instanceof Error ? error.message : 'Unable to schedule Tumblr campaign.',
            confirmButtonColor: '#ef4444',
            background: '#15171d',
            color: '#ffffff'
        });
    } finally {
        commandBusy.value = false;
    }
}

function destroyChart(instance: Chart | null) {
    if (instance) {
        instance.destroy();
    }
    return null;
}

function renderLiveSnapshotChart() {
    const canvas = liveSnapshotChartCanvas.value;
    if (!canvas || !hasLiveSnapshot.value) {
        liveSnapshotChart = destroyChart(liveSnapshotChart);
        return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
        return;
    }

    liveSnapshotChart = destroyChart(liveSnapshotChart);

    const values = liveSnapshotMetrics.value.map(metric => metric.value);
    const gradient = context.createLinearGradient(0, 0, 0, 260);
    gradient.addColorStop(0, 'rgba(249, 115, 22, 0.85)');
    gradient.addColorStop(1, 'rgba(251, 113, 133, 0.25)');

    liveSnapshotChart = new Chart(context, {
        type: 'bar',
        data: {
            labels: liveSnapshotMetrics.value.map(metric => metric.label),
            datasets: [
                {
                    label: 'Live Snapshot Metrics',
                    data: values,
                    borderRadius: 12,
                    backgroundColor: gradient,
                    borderColor: '#f97316',
                    borderWidth: 1.2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(2, 6, 23, 0.96)',
                    borderColor: 'rgba(249, 115, 22, 0.58)',
                    borderWidth: 1,
                    titleColor: '#f8fafc',
                    bodyColor: '#ffe4d6'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#9fb4c9' },
                    grid: { color: 'rgba(159, 180, 201, 0.16)' }
                },
                x: {
                    ticks: { color: '#9fb4c9' },
                    grid: { display: false }
                }
            }
        }
    });
}

function renderFleetAnalyticsChart() {
    const canvas = fleetAnalyticsChartCanvas.value;
    if (!canvas || !hasFleetAnalytics.value) {
        fleetAnalyticsChart = destroyChart(fleetAnalyticsChart);
        return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
        return;
    }

    fleetAnalyticsChart = destroyChart(fleetAnalyticsChart);

    const rows = sortedFleetResults.value;
    const labels = rows.map(row => row.Email || row.BlogName || shortId(row.AccountId));
    const values = rows.map(row => asNumber(row[fleetMetric.value]));

    const lineGradient = context.createLinearGradient(0, 0, 0, 280);
    lineGradient.addColorStop(0, 'rgba(249, 115, 22, 0.45)');
    lineGradient.addColorStop(1, 'rgba(249, 115, 22, 0.03)');

    fleetAnalyticsChart = new Chart(context, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: currentFleetMetricLabel(),
                    data: values,
                    borderColor: '#f97316',
                    backgroundColor: lineGradient,
                    fill: true,
                    borderWidth: 2.2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#fb7185',
                    tension: 0.33
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    labels: { color: '#ffe1d0' }
                },
                tooltip: {
                    backgroundColor: 'rgba(2, 6, 23, 0.96)',
                    borderColor: 'rgba(249, 115, 22, 0.58)',
                    borderWidth: 1,
                    titleColor: '#f8fafc',
                    bodyColor: '#ffe4d6'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#9fb4c9' },
                    grid: { color: 'rgba(159, 180, 201, 0.16)' }
                },
                x: {
                    ticks: { color: '#9fb4c9' },
                    grid: { display: false }
                }
            }
        }
    });
}

function renderOverviewChart() {
    const canvas = overviewChartCanvas.value;
    if (!canvas || !hasOverviewRows.value) {
        overviewChart = destroyChart(overviewChart);
        return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
        return;
    }

    overviewChart = destroyChart(overviewChart);

    const rows = byAccountRows.value;
    const labels = rows.map(row => row.Email || row.BlogName || shortId(row.AccountId));

    overviewChart = new Chart(context, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Posted',
                    data: rows.map(row => asNumber(row.Posted)),
                    backgroundColor: 'rgba(74, 222, 128, 0.72)',
                    borderColor: 'rgba(74, 222, 128, 0.95)',
                    borderWidth: 1,
                    borderRadius: 8,
                    stack: 'overview'
                },
                {
                    label: 'Failed',
                    data: rows.map(row => asNumber(row.Failed)),
                    backgroundColor: 'rgba(255, 107, 107, 0.72)',
                    borderColor: 'rgba(255, 107, 107, 0.95)',
                    borderWidth: 1,
                    borderRadius: 8,
                    stack: 'overview'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#ffe1d0' }
                },
                tooltip: {
                    backgroundColor: 'rgba(2, 6, 23, 0.96)',
                    borderColor: 'rgba(249, 115, 22, 0.58)',
                    borderWidth: 1,
                    titleColor: '#f8fafc',
                    bodyColor: '#ffe4d6'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    stacked: true,
                    ticks: { color: '#9fb4c9' },
                    grid: { color: 'rgba(159, 180, 201, 0.16)' }
                },
                x: {
                    stacked: true,
                    ticks: { color: '#9fb4c9' },
                    grid: { display: false }
                }
            }
        }
    });
}

function renderPostsChart() {
    const canvas = postsChartCanvas.value;
    if (!canvas || !hasPosts.value) {
        postsChart = destroyChart(postsChart);
        return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
        return;
    }

    postsChart = destroyChart(postsChart);

    postsChart = new Chart(context, {
        type: 'doughnut',
        data: {
            labels: ['Scheduled', 'Processing', 'Posted', 'Failed'],
            datasets: [
                {
                    data: [
                        postStatusTotals.value.Scheduled,
                        postStatusTotals.value.Processing,
                        postStatusTotals.value.Posted,
                        postStatusTotals.value.Failed
                    ],
                    backgroundColor: [
                        'rgba(249, 115, 22, 0.78)',
                        'rgba(251, 191, 36, 0.78)',
                        'rgba(74, 222, 128, 0.78)',
                        'rgba(255, 107, 107, 0.78)'
                    ],
                    borderColor: [
                        'rgba(249, 115, 22, 1)',
                        'rgba(251, 191, 36, 1)',
                        'rgba(74, 222, 128, 1)',
                        'rgba(255, 107, 107, 1)'
                    ],
                    borderWidth: 1.5,
                    hoverOffset: 10
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#ffe1d0' }
                },
                tooltip: {
                    backgroundColor: 'rgba(2, 6, 23, 0.96)',
                    borderColor: 'rgba(249, 115, 22, 0.58)',
                    borderWidth: 1,
                    titleColor: '#f8fafc',
                    bodyColor: '#ffe4d6'
                }
            }
        }
    });
}

function renderEventsChart() {
    const canvas = eventsChartCanvas.value;
    if (!canvas || !hasEvents.value) {
        eventsChart = destroyChart(eventsChart);
        return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
        return;
    }

    eventsChart = destroyChart(eventsChart);

    eventsChart = new Chart(context, {
        type: 'bar',
        data: {
            labels: ['Information', 'Warning', 'Error'],
            datasets: [
                {
                    label: 'Events',
                    data: [
                        eventLevelTotals.value.Information,
                        eventLevelTotals.value.Warning,
                        eventLevelTotals.value.Error
                    ],
                    backgroundColor: [
                        'rgba(245, 158, 11, 0.76)',
                        'rgba(251, 146, 60, 0.76)',
                        'rgba(239, 68, 68, 0.76)'
                    ],
                    borderColor: [
                        'rgba(245, 158, 11, 1)',
                        'rgba(251, 146, 60, 1)',
                        'rgba(239, 68, 68, 1)'
                    ],
                    borderWidth: 1.2,
                    borderRadius: 10
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(2, 6, 23, 0.96)',
                    borderColor: 'rgba(249, 115, 22, 0.58)',
                    borderWidth: 1,
                    titleColor: '#f8fafc',
                    bodyColor: '#ffe4d6'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#9fb4c9' },
                    grid: { color: 'rgba(159, 180, 201, 0.16)' }
                },
                x: {
                    ticks: { color: '#9fb4c9' },
                    grid: { display: false }
                }
            }
        }
    });
}

async function renderAllVisualCharts() {
    await nextTick();
    renderLiveSnapshotChart();
    renderFleetAnalyticsChart();
    renderOverviewChart();
    renderPostsChart();
    renderEventsChart();
}

function destroyAllCharts() {
    liveSnapshotChart = destroyChart(liveSnapshotChart);
    fleetAnalyticsChart = destroyChart(fleetAnalyticsChart);
    overviewChart = destroyChart(overviewChart);
    postsChart = destroyChart(postsChart);
    eventsChart = destroyChart(eventsChart);
}

watch(fleetMetric, async () => {
    await nextTick();
    renderFleetAnalyticsChart();
});

watch(isAnalyticsPage, async (isAnalytics) => {
    if (isAnalytics) {
        await renderAllVisualCharts();
        return;
    }

    destroyAllCharts();
});

onMounted(async () => {
    seedDefaultScheduleTime();
    await loadAllPanels(true);

    refreshInterval = setInterval(() => {
        loadAllPanels(false);
    }, 15000);
});

onBeforeUnmount(() => {
    destroyAllCharts();
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
});
</script>

<style scoped>
.omnitumblr-page {
    --bg-1: #120d0c;
    --bg-2: #211616;
    --panel: rgba(27, 22, 23, 0.86);
    --panel-border: rgba(251, 113, 133, 0.22);
    --panel-border-soft: rgba(148, 163, 184, 0.18);
    --accent: #f97316;
    --accent-2: #fb7185;
    --success: #22c55e;
    --warn: #f59e0b;
    --danger: #ef4444;
    --text: #f8fafc;
    --text-muted: #9fb4c9;

    min-height: 100vh;
    padding: 20px 0 32px;
    background:
        radial-gradient(circle at 12% 8%, rgba(249, 115, 22, 0.22), transparent 34%),
        radial-gradient(circle at 90% 4%, rgba(251, 113, 133, 0.16), transparent 30%),
        linear-gradient(160deg, var(--bg-1), var(--bg-2));
}

.panel-shell {
    border-radius: 16px;
    border: 1px solid var(--panel-border);
    background: var(--panel);
    box-shadow: 0 18px 30px rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(12px);
}

.page-header {
    margin: 0 12px 14px;
    padding: 16px;
    display: grid;
    grid-template-columns: 220px 1fr 220px;
    align-items: center;
    gap: 10px;
}

.header-center {
    text-align: center;
}

.page-title {
    margin: 0;
    font-size: 2.1rem;
    font-weight: 800;
    letter-spacing: 0.2px;
    color: var(--text);
    text-shadow: 0 0 18px rgba(249, 115, 22, 0.26);
}

.page-subtitle {
    margin: 8px 0 10px;
    color: var(--text-muted);
    font-size: 0.92rem;
}

.header-status-row {
    display: flex;
    justify-content: center;
    gap: 8px;
    flex-wrap: wrap;
}

.header-pill {
    border-radius: 999px;
    font-size: 0.76rem;
    font-weight: 700;
    padding: 4px 10px;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    border: 1px solid transparent;
}

.header-pill.ok {
    color: #fdba74;
    background: rgba(249, 115, 22, 0.16);
    border-color: rgba(251, 146, 60, 0.45);
}

.header-pill.warn {
    color: #fca5a5;
    background: rgba(239, 68, 68, 0.18);
    border-color: rgba(239, 68, 68, 0.42);
}

.header-pill.muted {
    color: var(--text-muted);
    background: rgba(148, 163, 184, 0.12);
    border-color: rgba(148, 163, 184, 0.28);
}

.header-left {
    display: flex;
    align-items: center;
}

.back-nav-btn {
    width: 420px;
    height: 46px;
}

.back-nav-btn :deep(button) {
    letter-spacing: 0.08rem;
    padding: 0 12px;
}

.back-nav-btn :deep(button a) {
    font-size: 0.8rem;
}

.header-right {
    display: flex;
    justify-content: flex-end;
}

.primary-btn,
.command-btn {
    border: 1px solid rgba(77, 158, 57, 0.36);
    border-radius: 10px;
    padding: 10px 14px;
    font-size: 0.85rem;
    font-weight: 700;
    color: #d8f7d0;
    background: linear-gradient(180deg, rgba(77, 158, 57, 0.28), rgba(77, 158, 57, 0.16));
    cursor: pointer;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
    transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
}

.primary-btn:disabled,
.command-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.primary-btn:hover:not(:disabled),
.command-btn:hover:not(:disabled) {
    border-color: rgba(98, 206, 71, 0.55);
    background: linear-gradient(180deg, rgba(77, 158, 57, 0.38), rgba(77, 158, 57, 0.22));
    transform: translateY(-1px);
}

.panel-notice {
    margin: 0 12px 14px;
    border-radius: 10px;
    padding: 10px 14px;
    border: 1px solid rgba(245, 158, 11, 0.38);
    background: rgba(245, 158, 11, 0.12);
    color: #fcd34d;
    font-size: 0.84rem;
}

.metric-strip {
    margin: 0 12px 14px;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
}

.metric-tile {
    border-radius: 14px;
    padding: 12px;
    background: rgba(15, 23, 42, 0.52);
    border: 1px solid var(--panel-border-soft);
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.metric-label {
    color: var(--text-muted);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.55px;
}

.metric-value {
    color: var(--text);
    font-size: 1.24rem;
    line-height: 1.1;
}

.metric-value.success {
    color: #86efac;
}

.metric-sub {
    color: var(--text-muted);
    font-size: 0.72rem;
}

.subpage-nav {
    margin: 0 12px 14px;
    padding: 10px;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
    border: 1px solid var(--panel-border-soft);
}

.subpage-link {
    appearance: none;
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.3);
    background: rgba(15, 23, 42, 0.45);
    padding: 10px;
    text-decoration: none;
    text-align: left;
    width: 100%;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 4px;
    transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
}

.subpage-link:hover {
    border-color: rgba(249, 115, 22, 0.56);
    background: rgba(249, 115, 22, 0.14);
    transform: translateY(-1px);
}

.subpage-link.active {
    border-color: rgba(251, 146, 60, 0.7);
    background: linear-gradient(180deg, rgba(249, 115, 22, 0.3), rgba(249, 115, 22, 0.12));
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
}

.subpage-link-title {
    color: #ffedd5;
    font-size: 0.78rem;
    font-weight: 700;
}

.subpage-link-hint {
    color: var(--text-muted);
    font-size: 0.68rem;
    line-height: 1.3;
}

.panel-grid {
    margin: 0 12px 14px;
    display: grid;
    grid-template-columns: 1.1fr 0.9fr;
    gap: 12px;
}

.panel-grid.secondary {
    grid-template-columns: 1.2fr 0.8fr;
}

.panel-shell > .panel-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 12px;
}

.panel-head h2 {
    margin: 0;
    color: var(--text);
    font-size: 1rem;
}

.panel-head span {
    color: var(--text-muted);
    font-size: 0.75rem;
}

.command-panel,
.panel-grid > .panel-shell {
    padding: 14px;
}

.form-card {
    border-radius: 12px;
    border: 1px solid var(--panel-border-soft);
    background: rgba(15, 23, 42, 0.48);
    padding: 12px;
}

.form-card + .form-card {
    margin-top: 10px;
}

.form-card.compact-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
}

.form-card h3,
.top-failure-list h3 {
    margin: 0 0 10px;
    color: #cdeefd;
    font-size: 0.92rem;
}

.command-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.inline-form {
    margin-bottom: 10px;
}

.command-form label {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
}

.command-form label > span {
    color: var(--text-muted);
    font-size: 0.74rem;
    text-transform: uppercase;
    letter-spacing: 0.45px;
}

.field-helper {
    color: #9fb4c9;
    font-size: 0.72rem;
    line-height: 1.35;
}

.command-form input,
.command-form select,
.command-form textarea {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    border-radius: 8px;
    border: 1px solid rgba(148, 163, 184, 0.3);
    background: rgba(2, 6, 23, 0.72);
    color: #e2e8f0;
    padding: 9px 10px;
    font-size: 0.84rem;
    outline: none;
}

.command-form input:focus,
.command-form select:focus,
.command-form textarea:focus {
    border-color: rgba(249, 115, 22, 0.7);
    box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.18);
}

.toggle-row {
    display: flex !important;
    flex-direction: row !important;
    align-items: center;
    gap: 8px !important;
}

.toggle-row input {
    width: 16px;
    height: 16px;
}

.toggle-row span {
    color: #dce9f5 !important;
    font-size: 0.8rem !important;
    letter-spacing: 0;
    text-transform: none !important;
    line-height: 1.35;
}

.input-row {
    display: grid;
    gap: 10px;
}

.input-row.split {
    grid-template-columns: repeat(2, minmax(0, 1fr));
}

.form-actions {
    display: flex;
    gap: 8px;
}

.command-btn {
    flex: 1;
    padding: 9px 10px;
}

.command-btn.ghost {
    border: 1px solid rgba(148, 163, 184, 0.35);
    color: #cbd5e1;
    background: rgba(148, 163, 184, 0.12);
}

.command-btn.danger {
    border-color: rgba(239, 68, 68, 0.5);
    color: #fecaca;
    background: linear-gradient(180deg, rgba(239, 68, 68, 0.28), rgba(239, 68, 68, 0.15));
}

.command-btn.danger:hover:not(:disabled) {
    border-color: rgba(248, 113, 113, 0.64);
    background: linear-gradient(180deg, rgba(239, 68, 68, 0.38), rgba(239, 68, 68, 0.2));
}

.form-actions.single-row .command-btn {
    max-width: 240px;
}

.niche-preview {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.niche-chip-btn {
    border-radius: 999px;
    border: 1px solid rgba(249, 115, 22, 0.42);
    background: rgba(249, 115, 22, 0.14);
    color: #fed7aa;
    padding: 4px 10px;
    font-size: 0.7rem;
    line-height: 1;
    cursor: pointer;
}

.niche-chip-btn:hover {
    border-color: rgba(251, 146, 60, 0.6);
    background: rgba(249, 115, 22, 0.24);
}

.visual-grid {
    align-items: start;
}

.visual-panel {
    min-height: 460px;
}

.viz-stack {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.viz-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 220px;
    gap: 10px;
    margin-bottom: 10px;
    align-items: end;
}

.viz-selector {
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.viz-selector span {
    color: var(--text-muted);
    font-size: 0.74rem;
    text-transform: uppercase;
    letter-spacing: 0.4px;
}

.viz-selector select {
    width: 100%;
    border-radius: 8px;
    border: 1px solid rgba(148, 163, 184, 0.3);
    background: rgba(2, 6, 23, 0.72);
    color: #e2e8f0;
    padding: 9px 10px;
    font-size: 0.84rem;
}

.chart-shell {
    height: 250px;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.24);
    background: linear-gradient(180deg, rgba(24, 12, 10, 0.92), rgba(31, 17, 15, 0.78));
    padding: 10px;
    position: relative;
}

.viz-canvas {
    width: 100% !important;
    height: 100% !important;
}

.viz-kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
}

.viz-kpi-grid.compact {
    grid-template-columns: repeat(2, minmax(0, 1fr));
}

.viz-kpi {
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.22);
    padding: 8px;
    background: rgba(15, 23, 42, 0.44);
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.viz-kpi span {
    color: #9fb4c9;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.35px;
}

.viz-kpi strong {
    color: #f8fafc;
    font-size: 0.9rem;
    line-height: 1.25;
    word-break: break-word;
}

.viz-kpi small {
    color: #9fb4c9;
    font-size: 0.67rem;
}

.rank-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.rank-row {
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.2);
    background: rgba(15, 23, 42, 0.38);
    padding: 8px;
}

.rank-head {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    align-items: center;
    margin-bottom: 6px;
}

.rank-head span {
    color: #ffe4d6;
    font-size: 0.78rem;
}

.rank-head strong {
    color: #fdba74;
    font-size: 0.76rem;
    white-space: nowrap;
}

.rank-bar-track {
    height: 7px;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.2);
    overflow: hidden;
}

.rank-bar-fill {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, rgba(249, 115, 22, 0.88), rgba(251, 113, 133, 0.86));
}

.chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.chip-btn {
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.32);
    background: rgba(15, 23, 42, 0.46);
    color: #cbd5e1;
    font-size: 0.72rem;
    padding: 5px 10px;
    cursor: pointer;
}

.chip-btn.active {
    border-color: rgba(251, 146, 60, 0.66);
    color: #ffedd5;
    background: rgba(249, 115, 22, 0.22);
}

.timeline-scroll {
    max-height: 290px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.timeline-entry {
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.24);
    background: rgba(15, 23, 42, 0.4);
    padding: 9px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.timeline-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    font-size: 0.7rem;
    color: #9fb4c9;
}

.timeline-message {
    margin: 0;
    color: #e2e8f0;
    font-size: 0.79rem;
    line-height: 1.3;
}

.timeline-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    color: #9fb4c9;
    font-size: 0.7rem;
}

.json-view {
    margin: 0;
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.22);
    background: rgba(2, 6, 23, 0.6);
    color: #cbd5e1;
    font-family: Consolas, Monaco, monospace;
    font-size: 0.72rem;
    line-height: 1.5;
    padding: 10px;
    max-height: 320px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
}

.empty-state {
    border-radius: 10px;
    border: 1px dashed rgba(148, 163, 184, 0.36);
    padding: 20px;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.84rem;
}

.accounts-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 420px;
    overflow-y: auto;
}

.account-row {
    border-radius: 10px;
    border: 1px solid var(--panel-border-soft);
    padding: 10px;
    background: rgba(15, 23, 42, 0.42);
}

.account-main {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
}

.account-main h3 {
    margin: 0;
    font-size: 0.9rem;
    color: #f8fafc;
}

.account-main p {
    margin: 2px 0 0;
    font-size: 0.7rem;
    color: var(--text-muted);
}

.account-meta {
    margin-top: 8px;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
}

.account-meta span {
    font-size: 0.72rem;
    color: #cbd5e1;
}

.account-action-row {
    margin-top: 8px;
    display: flex;
    justify-content: flex-end;
    gap: 6px;
}

.inline-link-btn {
    border: 1px solid rgba(148, 163, 184, 0.28);
    background: rgba(148, 163, 184, 0.12);
    color: #cbd5e1;
    border-radius: 8px;
    padding: 4px 8px;
    font-size: 0.7rem;
    font-weight: 600;
    cursor: pointer;
}

.inline-link-btn:hover {
    border-color: rgba(148, 163, 184, 0.42);
    background: rgba(148, 163, 184, 0.2);
}

.account-auth-debug {
    margin-top: 8px;
    border-radius: 8px;
    border: 1px dashed rgba(251, 191, 36, 0.38);
    background: rgba(245, 158, 11, 0.1);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.account-auth-debug p {
    margin: 0;
    color: #fde68a;
    font-size: 0.72rem;
    line-height: 1.35;
}

.mini-grid {
    margin-top: 10px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
}

.mini-item {
    border-radius: 9px;
    border: 1px solid rgba(148, 163, 184, 0.24);
    padding: 8px;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    background: rgba(15, 23, 42, 0.36);
}

.mini-name {
    font-size: 0.72rem;
    color: #e2e8f0;
}

.mini-val {
    font-size: 0.7rem;
    color: #86efac;
}

.top-failure-list {
    margin-top: 10px;
}

.failure-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
    border-top: 1px solid rgba(148, 163, 184, 0.18);
    padding: 8px 0;
}

.failure-msg {
    color: #cbd5e1;
    font-size: 0.74rem;
}

.failure-count {
    color: #fca5a5;
    font-size: 0.74rem;
    font-weight: 700;
}

.table-wrap {
    max-height: 420px;
    overflow: auto;
}

table {
    width: 100%;
    border-collapse: collapse;
}

th,
td {
    text-align: left;
    padding: 8px 9px;
    font-size: 0.75rem;
    border-bottom: 1px solid rgba(148, 163, 184, 0.18);
    color: #e2e8f0;
    vertical-align: top;
}

th {
    text-transform: uppercase;
    letter-spacing: 0.45px;
    font-size: 0.68rem;
    color: #9fb4c9;
    position: sticky;
    top: 0;
    background: rgba(15, 23, 42, 0.95);
}

.status-pill {
    border-radius: 999px;
    padding: 3px 9px;
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    border: 1px solid transparent;
}

.status-pill.status-ok {
    color: #86efac;
    background: rgba(34, 197, 94, 0.15);
    border-color: rgba(34, 197, 94, 0.36);
}

.status-pill.status-warn {
    color: #fcd34d;
    background: rgba(245, 158, 11, 0.16);
    border-color: rgba(245, 158, 11, 0.38);
}

.status-pill.status-danger {
    color: #fca5a5;
    background: rgba(239, 68, 68, 0.15);
    border-color: rgba(239, 68, 68, 0.4);
}

.status-pill.status-muted {
    color: #cbd5e1;
    background: rgba(148, 163, 184, 0.14);
    border-color: rgba(148, 163, 184, 0.3);
}

.event-list {
    max-height: 420px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.event-row {
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.26);
    padding: 9px;
    background: rgba(15, 23, 42, 0.4);
}

.event-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    font-size: 0.7rem;
    color: #9fb4c9;
}

.event-row p {
    margin: 8px 0 0;
    font-size: 0.78rem;
    color: #e2e8f0;
    line-height: 1.35;
}

.event-links {
    margin-top: 6px;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    color: #9fb4c9;
    font-size: 0.7rem;
}

.mono {
    font-family: Consolas, Monaco, monospace;
}

@media (max-width: 1400px) {
    .page-header {
        grid-template-columns: 1fr;
        text-align: center;
    }

    .header-left,
    .header-right {
        justify-content: center;
    }

    .metric-strip {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .subpage-nav {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .panel-grid,
    .panel-grid.secondary {
        grid-template-columns: 1fr;
    }

    .form-card.compact-grid {
        grid-template-columns: 1fr;
    }

    .viz-kpi-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

@media (max-width: 780px) {
    .omnitumblr-page {
        padding-top: 14px;
    }

    .page-title {
        font-size: 1.65rem;
    }

    .metric-strip {
        grid-template-columns: 1fr;
    }

    .subpage-nav {
        grid-template-columns: 1fr;
    }

    .input-row.split,
    .account-meta,
    .mini-grid {
        grid-template-columns: 1fr;
    }

    .form-actions {
        flex-direction: column;
    }

    .viz-toolbar {
        grid-template-columns: 1fr;
    }

    .viz-kpi-grid,
    .viz-kpi-grid.compact {
        grid-template-columns: 1fr;
    }

    th,
    td {
        font-size: 0.72rem;
    }
}
</style>
