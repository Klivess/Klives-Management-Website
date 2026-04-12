<template>
    <div class="omnigram-page">
        <div class="page-header panel-shell">
            <div class="header-left">
                <KMButton class="back-nav-btn" style="width: 320px;" message="Back To Schemes" @click="navigateBack" />
            </div>

            <div class="header-center">
                <h1 class="page-title">OmniGram Command Panel</h1>
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
                <span class="metric-label">OmniGram Uptime</span>
                <strong class="metric-value">{{ health?.Uptime || 'N/A' }}</strong>
                <span class="metric-sub">Manager: {{ health?.ManagerUptime || 'N/A' }}</span>
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
                    <h3>Onboard New Managed Account</h3>
                    <form class="command-form" @submit.prevent="submitOnboardAccount">
                        <label>
                            <span>Instagram Username</span>
                            <input v-model.trim="onboardForm.username" type="text" placeholder="my_instagram_account" autocomplete="off" required />
                        </label>

                        <label>
                            <span>Password</span>
                            <input v-model="onboardForm.password" type="password" placeholder="Instagram password" autocomplete="new-password" required />
                        </label>

                        <label class="toggle-row">
                            <input v-model="onboardForm.includeLiveVerification" type="checkbox" />
                            <span>Run live verification immediately after save</span>
                        </label>

                        <small class="field-helper">
                            Uses /omnigram/accounts/add. Keep live verification off for faster onboarding, then use Retry Verification when ready.
                        </small>

                        <div class="form-actions">
                            <button type="submit" class="command-btn" :disabled="commandBusy">
                                {{ commandBusy ? 'Onboarding...' : 'Onboard Account' }}
                            </button>
                            <button type="button" class="command-btn ghost" :disabled="commandBusy" @click="resetOnboardForm">
                                Clear
                            </button>
                        </div>
                    </form>
                </div>

                <div class="form-card" v-if="activePageView === 'update-managed-account-settings'">
                    <h3>Account Runtime Settings</h3>
                    <form class="command-form" @submit.prevent="submitAccountSettings">
                        <label>
                            <span>Managed Account</span>
                            <select v-model="settingsForm.accountId" @change="hydrateSettingsFromAccount(settingsForm.accountId)">
                                <option value="">Select account</option>
                                <option v-for="account in accounts" :key="account.AccountId" :value="account.AccountId">
                                    {{ account.Username }}
                                </option>
                            </select>
                        </label>

                        <label class="toggle-row">
                            <input v-model="settingsForm.useMemeScraperSource" type="checkbox" />
                            <span>Use MemeScraper as media source</span>
                        </label>

                        <div class="niche-selector" v-if="settingsForm.useMemeScraperSource">
                            <div class="niche-selector-header">
                                <span>Preferred Meme Niches</span>
                                <button type="button" class="inline-link-btn" @click="clearSelectedNiches" :disabled="settingsForm.memeNiches.length === 0">Clear</button>
                            </div>

                            <div class="niche-menu" v-if="allMemeNiches.length > 0">
                                <button
                                    type="button"
                                    class="niche-menu-item"
                                    :class="{ active: isNicheSelected(niche.NicheTagName) }"
                                    v-for="niche in allMemeNiches"
                                    :key="niche.NicheTagName"
                                    @click="toggleMemeNiche(niche.NicheTagName)"
                                >
                                    {{ niche.NicheTagName }}
                                </button>
                            </div>
                            <div class="niche-menu-empty" v-else-if="nichesLoading">Loading saved MemeScraper niches...</div>
                            <div class="niche-menu-empty" v-else>No saved niches were returned from MemeScraper.</div>

                            <small class="field-helper">Click niches to add or remove them from account media mapping.</small>
                        </div>

                        <div class="niche-preview" v-if="settingsForm.memeNiches.length > 0">
                            <span class="niche-chip" v-for="niche in settingsForm.memeNiches" :key="niche">{{ niche }}</span>
                        </div>

                        <label class="toggle-row">
                            <input v-model="settingsForm.autonomousPostingEnabled" type="checkbox" />
                            <span>Enable autonomous posting lifecycle</span>
                        </label>

                        <div class="input-row split autonomous-input-row" v-if="settingsForm.autonomousPostingEnabled">
                            <label>
                                <span>Autonomous Interval (minutes)</span>
                                <input v-model.number="settingsForm.autonomousPostingIntervalMinutes" type="number" min="1" step="1" />
                            </label>
                            <label>
                                <span>Autonomous Random Offset (+/- minutes)</span>
                                <input v-model.number="settingsForm.autonomousPostingRandomOffsetMinutes" type="number" min="0" step="1" />
                            </label>
                        </div>

                        <label v-if="settingsForm.autonomousPostingEnabled">
                            <span>Autonomous Caption Prompt</span>
                            <input v-model.trim="settingsForm.autonomousCaptionPrompt" type="text" placeholder="Write a short meme-style influencer caption" />
                        </label>

                        <div class="form-actions">
                            <button type="submit" class="command-btn" :disabled="commandBusy">
                                {{ commandBusy ? 'Saving Settings...' : 'Save Runtime Settings' }}
                            </button>
                            <button type="button" class="command-btn ghost" :disabled="commandBusy" @click="hydrateSettingsFromAccount(settingsForm.accountId)">
                                Reload From Account
                            </button>
                        </div>
                    </form>
                </div>

                <div class="form-card compact-grid" v-if="activePageView === 'profile-and-media-actions'">
                    <div>
                        <h3>Update Instagram Profile</h3>
                        <form class="command-form" @submit.prevent="submitProfileUpdate">
                            <label>
                                <span>Managed Account</span>
                                <select v-model="profileForm.accountId">
                                    <option value="">Select account</option>
                                    <option v-for="account in accounts" :key="`profile-${account.AccountId}`" :value="account.AccountId">
                                        {{ account.Username }}
                                    </option>
                                </select>
                            </label>

                            <label>
                                <span>Display Name</span>
                                <input v-model.trim="profileForm.displayName" type="text" placeholder="Optional" />
                            </label>

                            <label>
                                <span>Bio</span>
                                <textarea v-model.trim="profileForm.bio" rows="3" placeholder="Optional"></textarea>
                            </label>

                            <label>
                                <span>Website</span>
                                <input v-model.trim="profileForm.website" type="text" placeholder="https://example.com (optional)" />
                            </label>

                            <div class="form-actions">
                                <button type="submit" class="command-btn" :disabled="commandBusy">
                                    {{ commandBusy ? 'Updating...' : 'Update Profile' }}
                                </button>
                                <button type="button" class="command-btn ghost" :disabled="commandBusy" @click="resetProfileForm">
                                    Reset
                                </button>
                            </div>
                        </form>
                    </div>

                    <div>
                        <h3>Delete Instagram Media</h3>
                        <form class="command-form" @submit.prevent="deleteInstagramMedia">
                            <label>
                                <span>Managed Account</span>
                                <select v-model="deleteMediaForm.accountId">
                                    <option value="">Select account</option>
                                    <option v-for="account in accounts" :key="`delete-${account.AccountId}`" :value="account.AccountId">
                                        {{ account.Username }}
                                    </option>
                                </select>
                            </label>

                            <label>
                                <span>Instagram Media ID</span>
                                <input v-model.trim="deleteMediaForm.instagramMediaId" type="text" placeholder="17900000000000000" required />
                            </label>

                            <small class="field-helper">
                                Calls /omnigram/posts/deleteFromInstagram and removes a media object from the linked account.
                            </small>

                            <div class="form-actions">
                                <button type="submit" class="command-btn danger" :disabled="commandBusy">
                                    {{ commandBusy ? 'Deleting...' : 'Delete Media' }}
                                </button>
                                <button type="button" class="command-btn ghost" :disabled="commandBusy" @click="resetDeleteMediaForm">
                                    Reset
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
                                <span>Target</span>
                                <select v-model="scheduleForm.target">
                                    <option value="Feed">Feed</option>
                                    <option value="Reel">Reel</option>
                                    <option value="Story">Story</option>
                                </select>
                            </label>
                        </div>

                        <label v-if="scheduleForm.dispatchMode === 'SingleAccount'">
                            <span>Target Managed Account</span>
                            <select v-model="scheduleForm.accountId">
                                <option value="">Select account</option>
                                <option v-for="account in activeAccounts" :key="account.AccountId" :value="account.AccountId">
                                    {{ account.Username }}
                                </option>
                            </select>
                        </label>

                        <div class="input-row split">
                            <label>
                                <span>Caption Mode</span>
                                <select v-model="scheduleForm.captionMode">
                                    <option value="AI">AI generated</option>
                                    <option value="User">User provided</option>
                                </select>
                            </label>

                            <label>
                                <span>Schedule (UTC, optional)</span>
                                <input v-model="scheduleForm.scheduledForUtcLocal" type="datetime-local" />
                            </label>
                        </div>

                        <label v-if="scheduleForm.captionMode === 'User'">
                            <span>User Caption</span>
                            <textarea v-model.trim="scheduleForm.userCaption" rows="3" placeholder="New update just dropped"></textarea>
                        </label>

                        <label v-else>
                            <span>AI Caption Prompt</span>
                            <textarea v-model.trim="scheduleForm.aiCaptionPrompt" rows="3" placeholder="Write a punchy meme caption with hashtags"></textarea>
                        </label>

                        <label class="toggle-row">
                            <input v-model="scheduleForm.useDirectUpload" type="checkbox" />
                            <span>Upload media bytes directly (stored in OmniGramUploadsDirectory)</span>
                        </label>

                        <label v-if="scheduleForm.useDirectUpload">
                            <span>Upload Media File</span>
                            <input type="file" accept="image/*,video/*" @change="onUploadFileChanged" />
                            <small class="field-helper" v-if="scheduleUploadFile">{{ scheduleUploadFile.name }} · {{ formatBytes(scheduleUploadFile.size) }}</small>
                            <small class="field-helper" v-else>No media file selected.</small>
                        </label>

                        <label v-else>
                            <span>Manual Media Path (optional)</span>
                            <input v-model.trim="scheduleForm.mediaPath" type="text" placeholder="C:/Media/launch.jpg" />
                            <small class="field-helper">Leave empty to let OmniGram resolve media from mapped MemeScraper niches.</small>
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

                <div v-if="accounts.length === 0" class="empty-state">No managed accounts returned yet.</div>
                <div v-else class="accounts-list">
                    <article v-for="account in accounts" :key="account.AccountId" class="account-row">
                        <div class="account-main">
                            <div>
                                <h3>{{ account.Username }}</h3>
                                <p>ID {{ account.AccountId }}</p>
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
                            <button
                                type="button"
                                class="inline-link-btn danger-link"
                                :disabled="commandBusy"
                                @click="deleteManagedAccount(account.AccountId, account.Username)"
                            >
                                {{ commandBusy ? 'Deleting...' : 'Delete Managed Account' }}
                            </button>
                        </div>

                        <div
                            class="account-auth-debug"
                            v-if="accountNeedsVerificationDetails(account)"
                        >
                            <p>
                                Verification state: {{ accountVerificationStateLabel(account) }}
                            </p>
                            <p v-if="account.LastAuthenticationError">
                                Auth error: {{ account.LastAuthenticationError }}
                            </p>
                            <p v-if="accountVerificationGuidance(account)">
                                Guidance: {{ accountVerificationGuidance(account) }}
                            </p>

                            <button
                                v-if="canRetryVerification(account.Status) || account.CheckpointRequired"
                                type="button"
                                class="inline-link-btn"
                                :disabled="liveBusy"
                                @click="retryVerificationForAccount(account.AccountId, account.Username)"
                            >
                                {{ liveBusy ? 'Retrying...' : 'Retry Verification' }}
                            </button>
                        </div>
                    </article>
                </div>

                <div class="mini-grid" v-if="byAccountRows.length > 0">
                    <div class="mini-item" v-for="row in byAccountRows" :key="row.AccountId">
                        <span class="mini-name">{{ row.Username || row.AccountId }}</span>
                        <span class="mini-val">{{ row.Posted }}/{{ row.Total }} posted</span>
                    </div>
                </div>
            </section>
        </div>

        <div class="panel-grid secondary" v-if="isAnalyticsPage">
            <section class="panel-shell">
                <div class="panel-head">
                    <h2>Live Account Snapshot</h2>
                    <span>GET /omnigram/accounts/live</span>
                </div>

                <form class="command-form inline-form" @submit.prevent="requestLiveAccountSnapshot">
                    <label>
                        <span>Managed Account</span>
                        <select v-model="liveAccountForm.accountId">
                            <option value="">Select account</option>
                            <option v-for="account in accounts" :key="`live-${account.AccountId}`" :value="account.AccountId">
                                {{ account.Username }}
                            </option>
                        </select>
                    </label>

                    <button type="submit" class="command-btn" :disabled="liveBusy || !liveAccountForm.accountId">
                        {{ liveBusy ? 'Loading Live...' : 'Load Live Snapshot' }}
                    </button>
                </form>

                <div v-if="!liveAccountData" class="empty-state">No live account payload loaded yet.</div>
                <pre v-else class="json-view">{{ liveAccountDataText }}</pre>
            </section>

            <section class="panel-shell">
                <div class="panel-head">
                    <h2>Fleet Live Analytics</h2>
                    <span>GET /omnigram/accounts/liveAnalytics</span>
                </div>

                <div class="form-actions single-row">
                    <button class="command-btn" :disabled="liveAnalyticsBusy" @click="refreshLiveAnalytics">
                        {{ liveAnalyticsBusy ? 'Refreshing...' : 'Refresh Fleet Analytics' }}
                    </button>
                </div>

                <div v-if="!liveAnalyticsData" class="empty-state">No fleet live analytics payload loaded yet.</div>
                <pre v-else class="json-view">{{ liveAnalyticsDataText }}</pre>
            </section>

            <section class="panel-shell">
                <div class="panel-head">
                    <h2>Recent Post Queue</h2>
                    <span>{{ posts.length }} loaded</span>
                </div>

                <div v-if="posts.length === 0" class="empty-state">No OmniGram posts found.</div>
                <div v-else class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Status</th>
                                <th>Account</th>
                                <th>Target</th>
                                <th>Scheduled</th>
                                <th>Error</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="post in posts" :key="post.PostId">
                                <td>
                                    <span class="status-pill" :class="postStatusClass(post.Status)">
                                        {{ postStatusLabel(post.Status) }}
                                    </span>
                                </td>
                                <td class="mono">{{ shortId(post.AccountId) }}</td>
                                <td>{{ targetLabel(post.Target) }}</td>
                                <td>{{ formatDateTime(post.ScheduledForUtc) }}</td>
                                <td>{{ post.LastError || '-' }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <section class="panel-shell">
                <div class="panel-head">
                    <h2>Event Stream</h2>
                    <span>{{ events.length }} latest events</span>
                </div>

                <div v-if="events.length === 0" class="empty-state">No OmniGram events found.</div>
                <div v-else class="event-list">
                    <article class="event-row" v-for="eventItem in events" :key="eventItem.EventId">
                        <div class="event-top">
                            <span class="status-pill" :class="eventLevelClass(eventItem.Level)">{{ eventItem.Level }}</span>
                            <span>{{ formatDateTime(eventItem.EventTimeUtc) }}</span>
                        </div>
                        <p>{{ eventItem.Message }}</p>
                        <div class="event-links">
                            <span v-if="eventItem.AccountId">A: {{ shortId(eventItem.AccountId) }}</span>
                            <span v-if="eventItem.PostId">P: {{ shortId(eventItem.PostId) }}</span>
                            <span v-if="eventItem.CampaignId">C: {{ shortId(eventItem.CampaignId) }}</span>
                        </div>
                    </article>
                </div>
            </section>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import KMButton from '~/components/KMButton.vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import Swal from 'sweetalert2';

definePageMeta({
    layout: 'navbar',
    alias: [
        '/schemery/omnigram/add-managed-account',
        '/schemery/omnigram/update-managed-account-settings',
        '/schemery/omnigram/profile-and-media-actions',
        '/schemery/omnigram/schedule-post-campaign'
    ]
});

interface OmniGramAccount {
    AccountId: string;
    Username: string;
    Status: number | string;
    UseMemeScraperSource?: boolean;
    PreferredMemeNiches?: string[] | null;
    AutonomousPostingEnabled?: boolean;
    AutonomousPostingIntervalMinutes?: number | null;
    AutonomousPostingRandomOffsetMinutes?: number | null;
    AutonomousCaptionPrompt?: string | null;
    LastAuthenticatedUtc?: string | null;
    LastAuthenticationError?: string | null;
    LastAuthenticationGuidance?: string | null;
    CheckpointRequired?: boolean | null;
}

interface OmniGramPost {
    PostId: string;
    AccountId: string;
    Target: number;
    Status: number | string;
    ScheduledForUtc?: string;
    LastError?: string | null;
}

interface OmniGramEvent {
    EventId: string;
    EventTimeUtc?: string;
    Level: string;
    Message: string;
    AccountId?: string | null;
    PostId?: string | null;
    CampaignId?: string | null;
}

interface OmniGramOverview {
    TotalPosts?: number;
    Posted?: number;
    Failed?: number;
    SuccessRate?: number;
    ByAccount?: Array<{
        AccountId: string;
        Username?: string;
        Total: number;
        Posted: number;
    }>;
}

interface OmniGramHealth {
    Service?: string;
    Uptime?: string;
    ManagerUptime?: string;
}

interface MemeScraperNiche {
    NicheTagName: string;
    CreatedAt?: string;
    LastUpdated?: string;
}

interface OmniGramOnboardForm {
    username: string;
    password: string;
    includeLiveVerification: boolean;
}

interface OmniGramSettingsForm {
    accountId: string;
    useMemeScraperSource: boolean;
    memeNiches: string[];
    autonomousPostingEnabled: boolean;
    autonomousPostingIntervalMinutes: number;
    autonomousPostingRandomOffsetMinutes: number;
    autonomousCaptionPrompt: string;
}

interface OmniGramProfileForm {
    accountId: string;
    displayName: string;
    bio: string;
    website: string;
}

interface OmniGramDeleteMediaForm {
    accountId: string;
    instagramMediaId: string;
}

interface OmniGramLiveAccountForm {
    accountId: string;
}

interface OmniGramScheduleForm {
    dispatchMode: 'SingleAccount' | 'AllManagedAccounts';
    accountId: string;
    target: 'Feed' | 'Reel' | 'Story';
    captionMode: 'User' | 'AI';
    userCaption: string;
    aiCaptionPrompt: string;
    useDirectUpload: boolean;
    mediaPath: string;
    scheduledForUtcLocal: string;
}

interface OmniGramAddAccountResponse {
    AccountId?: string | null;
    Username?: string | null;
    CheckpointRequired?: boolean | null;
    LastAuthenticationError?: string | null;
    LastAuthenticationGuidance?: string | null;
    VerificationState?: string | null;
    VerificationGuidance?: string | null;
    LiveVerificationRequested?: boolean | null;
    LiveVerification?: unknown | null;
}

interface OmniGramDeleteAccountResponse {
    Success?: boolean;
    success?: boolean;
}

type OmniGramPageView =
    | 'analytics'
    | 'add-managed-account'
    | 'update-managed-account-settings'
    | 'profile-and-media-actions'
    | 'schedule-post-campaign';

interface OmniGramSubPageLink {
    view: OmniGramPageView;
    label: string;
    hint: string;
}

const router = useRouter();
const route = useRoute();

const subPageLinks: ReadonlyArray<OmniGramSubPageLink> = [
    {
        view: 'analytics',
        label: 'Analytics',
        hint: 'Live telemetry and queue health'
    },
    {
        view: 'add-managed-account',
        label: 'Add Account',
        hint: 'Onboard and verify Instagram account'
    },
    {
        view: 'update-managed-account-settings',
        label: 'Update Settings',
        hint: 'Manage runtime posting configuration'
    },
    {
        view: 'profile-and-media-actions',
        label: 'Profile & Media',
        hint: 'Update profile and remove media'
    },
    {
        view: 'schedule-post-campaign',
        label: 'Schedule Campaign',
        hint: 'Queue dispatch plans and uploads'
    }
];

const isLoading = ref(false);
const commandBusy = ref(false);
const liveBusy = ref(false);
const liveAnalyticsBusy = ref(false);
const panelError = ref('');
const lastRefresh = ref('never');

const accounts = ref<OmniGramAccount[]>([]);
const posts = ref<OmniGramPost[]>([]);
const events = ref<OmniGramEvent[]>([]);
const overview = ref<OmniGramOverview | null>(null);
const health = ref<OmniGramHealth | null>(null);
const allMemeNiches = ref<MemeScraperNiche[]>([]);
const liveAccountData = ref<unknown | null>(null);
const liveAnalyticsData = ref<unknown | null>(null);
const nichesLoading = ref(false);

let refreshInterval: ReturnType<typeof setInterval> | null = null;

function createDefaultOnboardForm(): OmniGramOnboardForm {
    return {
        username: '',
        password: '',
        includeLiveVerification: false
    };
}

function createDefaultSettingsForm(): OmniGramSettingsForm {
    return {
        accountId: '',
        useMemeScraperSource: true,
        memeNiches: [],
        autonomousPostingEnabled: true,
        autonomousPostingIntervalMinutes: 240,
        autonomousPostingRandomOffsetMinutes: 45,
        autonomousCaptionPrompt: 'Write a short meme-style influencer caption with CTA and hashtags'
    };
}

function createDefaultProfileForm(): OmniGramProfileForm {
    return {
        accountId: '',
        displayName: '',
        bio: '',
        website: ''
    };
}

function createDefaultDeleteMediaForm(): OmniGramDeleteMediaForm {
    return {
        accountId: '',
        instagramMediaId: ''
    };
}

function createDefaultLiveAccountForm(): OmniGramLiveAccountForm {
    return {
        accountId: ''
    };
}

function createDefaultScheduleForm(): OmniGramScheduleForm {
    return {
        dispatchMode: 'AllManagedAccounts',
        accountId: '',
        target: 'Feed',
        captionMode: 'AI',
        userCaption: '',
        aiCaptionPrompt: 'Write a punchy meme caption with 3 hashtags',
        useDirectUpload: false,
        mediaPath: '',
        scheduledForUtcLocal: ''
    };
}

const onboardForm = ref<OmniGramOnboardForm>(createDefaultOnboardForm());
const settingsForm = ref<OmniGramSettingsForm>(createDefaultSettingsForm());
const profileForm = ref<OmniGramProfileForm>(createDefaultProfileForm());
const deleteMediaForm = ref<OmniGramDeleteMediaForm>(createDefaultDeleteMediaForm());
const liveAccountForm = ref<OmniGramLiveAccountForm>(createDefaultLiveAccountForm());
const scheduleForm = ref<OmniGramScheduleForm>(createDefaultScheduleForm());
const scheduleUploadFile = ref<File | null>(null);

function parsePageView(value: unknown): OmniGramPageView | null {
    if (typeof value !== 'string') return null;

    const normalized = value.trim().toLowerCase();
    if (normalized === 'analytics') return 'analytics';
    if (normalized === 'add-managed-account') return 'add-managed-account';
    if (normalized === 'update-managed-account-settings') return 'update-managed-account-settings';
    if (normalized === 'profile-and-media-actions') return 'profile-and-media-actions';
    if (normalized === 'schedule-post-campaign') return 'schedule-post-campaign';

    return null;
}

const activePageView = computed<OmniGramPageView>(() => {
    const queryView = parsePageView(route.query.view);
    if (queryView) {
        return queryView;
    }

    const normalizedPath = route.path.replace(/\/+$/, '').toLowerCase();

    if (normalizedPath.endsWith('/add-managed-account')) return 'add-managed-account';
    if (normalizedPath.endsWith('/update-managed-account-settings')) return 'update-managed-account-settings';
    if (normalizedPath.endsWith('/profile-and-media-actions')) return 'profile-and-media-actions';
    if (normalizedPath.endsWith('/schedule-post-campaign')) return 'schedule-post-campaign';

    return 'analytics';
});

function navigateToSubPage(view: OmniGramPageView) {
    if (view === 'analytics') {
        router.push({ path: '/schemery/omnigram', query: {} });
        return;
    }

    router.push({ path: '/schemery/omnigram', query: { view } });
}

const isAnalyticsPage = computed(() => activePageView.value === 'analytics');
const isCommandPage = computed(() => !isAnalyticsPage.value);

const pageSubtitleText = computed(() => {
    if (isAnalyticsPage.value) {
        return 'Managed Instagram analytics workspace with queue health, event stream, and live account telemetry';
    }

    return 'Managed Instagram command workspace with focused controls on dedicated sub pages';
});

const commandPanelHeading = computed(() => {
    if (activePageView.value === 'add-managed-account') return 'Onboard New Managed Account';
    if (activePageView.value === 'update-managed-account-settings') return 'Account Runtime Settings';
    if (activePageView.value === 'profile-and-media-actions') return 'Profile & Media Actions';
    if (activePageView.value === 'schedule-post-campaign') return 'Schedule Post Campaign';
    return 'Command Center';
});

const commandPanelHint = computed(() => {
    if (activePageView.value === 'add-managed-account') return 'Credential onboarding and account verification';
    if (activePageView.value === 'update-managed-account-settings') return 'Automation and source configuration';
    if (activePageView.value === 'profile-and-media-actions') return 'Profile updates and media cleanup';
    if (activePageView.value === 'schedule-post-campaign') return 'Dispatch, captioning, and upload controls';
    return 'Commander controls';
});

const serviceOnline = computed(() => Boolean(health.value?.Service));
const activeAccounts = computed(() => accounts.value.filter(account => accountStatusLabel(account.Status) === 'Active'));
const postedCount = computed(() => Number(overview.value?.Posted || 0));
const failedCount = computed(() => Number(overview.value?.Failed || 0));
const totalPostsText = computed(() => Number(overview.value?.TotalPosts || 0).toLocaleString());
const successRateText = computed(() => `${Number(overview.value?.SuccessRate || 0).toFixed(2)}%`);
const byAccountRows = computed(() => (Array.isArray(overview.value?.ByAccount) ? overview.value?.ByAccount || [] : []).slice(0, 6));
const liveAccountDataText = computed(() => JSON.stringify(liveAccountData.value, null, 2));
const liveAnalyticsDataText = computed(() => JSON.stringify(liveAnalyticsData.value, null, 2));

function navigateBack() {
    router.push('/schemes');
}

function normalizeNicheName(value: string) {
    return value.trim().toLowerCase();
}

function asNonEmptyText(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function isCheckpointRequiredError(value: unknown): boolean {
    const text = asNonEmptyText(value);
    if (!text) return false;
    return text.toLowerCase().includes('checkpoint_required');
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

function findAccountByUsername(username: string) {
    const normalized = username.trim().toLowerCase();
    if (!normalized) return undefined;

    return accounts.value.find(account => account.Username.trim().toLowerCase() === normalized);
}

function getAccountById(accountId: string) {
    return accounts.value.find(account => account.AccountId === accountId);
}

function isNicheSelected(nicheName: string) {
    const normalized = normalizeNicheName(nicheName);
    return settingsForm.value.memeNiches.some(existing => normalizeNicheName(existing) === normalized);
}

function toggleMemeNiche(nicheName: string) {
    const normalized = normalizeNicheName(nicheName);
    const index = settingsForm.value.memeNiches.findIndex(existing => normalizeNicheName(existing) === normalized);

    if (index >= 0) {
        settingsForm.value.memeNiches.splice(index, 1);
        return;
    }

    settingsForm.value.memeNiches.push(nicheName.trim());
}

function clearSelectedNiches() {
    settingsForm.value.memeNiches = [];
}

function hydrateSettingsFromAccount(accountId: string) {
    const account = getAccountById(accountId);
    if (!account) {
        return;
    }

    settingsForm.value.accountId = account.AccountId;
    settingsForm.value.useMemeScraperSource = Boolean(account.UseMemeScraperSource);
    settingsForm.value.memeNiches = Array.isArray(account.PreferredMemeNiches)
        ? account.PreferredMemeNiches.filter((value): value is string => Boolean(value && value.trim().length > 0))
        : [];
    settingsForm.value.autonomousPostingEnabled = Boolean(account.AutonomousPostingEnabled);
    settingsForm.value.autonomousPostingIntervalMinutes = Math.max(1, Number(account.AutonomousPostingIntervalMinutes || 240));
    settingsForm.value.autonomousPostingRandomOffsetMinutes = Math.max(0, Number(account.AutonomousPostingRandomOffsetMinutes || 0));
    settingsForm.value.autonomousCaptionPrompt = account.AutonomousCaptionPrompt || createDefaultSettingsForm().autonomousCaptionPrompt;
}

function syncAccountSelectors() {
    const validIds = new Set(accounts.value.map(account => account.AccountId));
    const fallbackId = accounts.value.length > 0 ? accounts.value[0].AccountId : '';

    const normalizeSelector = (value: string) => (validIds.has(value) ? value : fallbackId);

    const nextSettingsId = normalizeSelector(settingsForm.value.accountId);
    if (nextSettingsId !== settingsForm.value.accountId) {
        settingsForm.value.accountId = nextSettingsId;
        if (nextSettingsId) {
            hydrateSettingsFromAccount(nextSettingsId);
        }
    }

    profileForm.value.accountId = normalizeSelector(profileForm.value.accountId);
    deleteMediaForm.value.accountId = normalizeSelector(deleteMediaForm.value.accountId);
    liveAccountForm.value.accountId = normalizeSelector(liveAccountForm.value.accountId);

    if (scheduleForm.value.dispatchMode === 'SingleAccount') {
        scheduleForm.value.accountId = normalizeSelector(scheduleForm.value.accountId);
    }
}

function accountNicheSummary(account: OmniGramAccount): string {
    const niches = Array.isArray(account.PreferredMemeNiches)
        ? account.PreferredMemeNiches.filter(Boolean)
        : [];

    if (niches.length === 0) {
        return 'No niches mapped';
    }

    return niches.length > 3
        ? `${niches.slice(0, 3).join(', ')} +${niches.length - 3}`
        : niches.join(', ');
}

function shortId(value?: string | null) {
    if (!value) return 'N/A';
    if (value.length <= 12) return value;
    return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function onUploadFileChanged(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target?.files && target.files.length > 0 ? target.files[0] : null;
    scheduleUploadFile.value = file;
}

function formatBytes(bytes: number) {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, index);
    return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDateTime(value?: string | null) {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString();
}

function accountStatusLabel(status: unknown): string {
    const normalized = `${status ?? ''}`.replace(/[\s_-]+/g, '').toLowerCase();

    if (status === 0 || normalized === 'active') return 'Active';
    if (status === 1 || normalized === 'disabled') return 'Disabled';
    if (status === 2 || normalized === 'authfailed') return 'Auth Failed';
    if (status === 3 || normalized === 'needsverification') return 'Needs Verification';
    return 'Unknown';
}

function accountStatusClass(status: unknown) {
    const label = accountStatusLabel(status);
    if (label === 'Active') return 'status-ok';
    if (label === 'Auth Failed') return 'status-danger';
    if (label === 'Disabled' || label === 'Needs Verification') return 'status-warn';
    return 'status-muted';
}

function canRetryVerification(status: unknown): boolean {
    const label = accountStatusLabel(status);
    return label === 'Needs Verification' || label === 'Auth Failed';
}

function accountVerificationStateLabel(account: OmniGramAccount): string {
    if (Boolean(account.CheckpointRequired)) return 'CheckpointRequired';

    const label = accountStatusLabel(account.Status);
    if (label === 'Active') return 'Verified';
    if (label === 'Needs Verification') return 'NeedsVerification';
    if (label === 'Auth Failed') return 'AuthFailed';
    return label.replace(/\s+/g, '');
}

function accountVerificationGuidance(account: OmniGramAccount): string | null {
    const stored = asNonEmptyText(account.LastAuthenticationGuidance);
    if (stored) return stored;

    if (Boolean(account.CheckpointRequired)) {
        return 'Approve the Instagram challenge in the app, then retry verification.';
    }

    const label = accountStatusLabel(account.Status);
    if (label === 'Needs Verification') {
        return 'Run Retry Verification to perform a live check when the account is ready.';
    }

    if (label === 'Auth Failed') {
        return 'Update credentials and retry onboarding or live verification.';
    }

    return null;
}

function accountNeedsVerificationDetails(account: OmniGramAccount): boolean {
    return Boolean(account.LastAuthenticationError)
        || Boolean(accountVerificationGuidance(account))
        || accountVerificationStateLabel(account) !== 'Verified';
}

function postStatusLabel(status: unknown): string {
    if (status === 0 || `${status}`.toLowerCase() === 'scheduled') return 'Scheduled';
    if (status === 1 || `${status}`.toLowerCase() === 'processing') return 'Processing';
    if (status === 2 || `${status}`.toLowerCase() === 'posted') return 'Posted';
    if (status === 3 || `${status}`.toLowerCase() === 'failed') return 'Failed';
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
    if (normalized === 'information') return 'status-ok';
    return 'status-muted';
}

function targetLabel(target: unknown) {
    if (target === 0 || `${target}`.toLowerCase() === 'feed') return 'Feed';
    if (target === 1 || `${target}`.toLowerCase() === 'reel') return 'Reel';
    if (target === 2 || `${target}`.toLowerCase() === 'story') return 'Story';
    return 'Unknown';
}

function toLocalDateTimeInput(date: Date) {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function seedDefaultScheduleTime() {
    const nextWindow = new Date(Date.now() + 20 * 60 * 1000);
    scheduleForm.value.scheduledForUtcLocal = toLocalDateTimeInput(nextWindow);
}

function resetOnboardForm() {
    onboardForm.value = createDefaultOnboardForm();
}

function resetProfileForm() {
    profileForm.value = createDefaultProfileForm();
    if (accounts.value.length > 0) {
        profileForm.value.accountId = accounts.value[0].AccountId;
    }
}

function resetDeleteMediaForm() {
    deleteMediaForm.value = createDefaultDeleteMediaForm();
    if (accounts.value.length > 0) {
        deleteMediaForm.value.accountId = accounts.value[0].AccountId;
    }
}

async function readApiError(response: Response): Promise<string> {
    const raw = await response.text();
    if (!raw) return `Request failed with status ${response.status}.`;

    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && 'error' in parsed) {
            return String((parsed as { error: string }).error);
        }
        return raw;
    } catch {
        return raw;
    }
}

async function fetchLiveAccountPayload(accountId: string) {
    const response = await RequestGETFromKliveAPI(`/omnigram/accounts/live?accountId=${encodeURIComponent(accountId)}`, false, false);
    if (!response.ok) throw new Error(await readApiError(response));
    const payload = await response.json();
    liveAccountData.value = payload || null;
}

async function fetchLiveAnalyticsPayload() {
    const response = await RequestGETFromKliveAPI('/omnigram/accounts/liveAnalytics', false, false);
    if (!response.ok) throw new Error(await readApiError(response));
    const payload = await response.json();
    liveAnalyticsData.value = payload || null;
}

async function loadAccounts() {
    const response = await RequestGETFromKliveAPI('/omnigram/accounts/list', false, false);
    if (!response.ok) throw new Error(await readApiError(response));
    const payload = await response.json();
    accounts.value = Array.isArray(payload) ? payload : [];
    syncAccountSelectors();
}

async function loadPosts() {
    const response = await RequestGETFromKliveAPI('/omnigram/posts/list?take=25', false, false);
    if (!response.ok) throw new Error(await readApiError(response));
    const payload = await response.json();
    posts.value = Array.isArray(payload) ? payload : [];
}

async function loadEvents() {
    const response = await RequestGETFromKliveAPI('/omnigram/logs/events?take=25', false, false);
    if (!response.ok) throw new Error(await readApiError(response));
    const payload = await response.json();
    events.value = Array.isArray(payload) ? payload : [];
}

async function loadOverview() {
    const response = await RequestGETFromKliveAPI('/omnigram/analytics/overview', false, false);
    if (!response.ok) throw new Error(await readApiError(response));
    const payload = await response.json();
    overview.value = payload || null;
}

async function loadHealth() {
    const response = await RequestGETFromKliveAPI('/omnigram/health', false, false);
    if (!response.ok) throw new Error(await readApiError(response));
    const payload = await response.json();
    health.value = payload || null;
}

async function loadSavedNiches() {
    nichesLoading.value = true;

    try {
        const response = await RequestGETFromKliveAPI('/memescraper/getAllSavedNiches', false, false);
        if (!response.ok) throw new Error(await readApiError(response));

        const payload = await response.json();
        const raw = Array.isArray(payload) ? payload : [];

        allMemeNiches.value = raw
            .filter((item: unknown): item is MemeScraperNiche => Boolean(item && typeof item === 'object' && 'NicheTagName' in item))
            .filter(item => Boolean(item.NicheTagName && item.NicheTagName.trim().length > 0))
            .sort((a, b) => a.NicheTagName.localeCompare(b.NicheTagName));
    } finally {
        nichesLoading.value = false;
    }
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

    if (showSpinner) {
        isLoading.value = false;
    }
}

async function submitOnboardAccount() {
    if (!onboardForm.value.username || !onboardForm.value.password) {
        Swal.fire({
            icon: 'warning',
            title: 'Missing credentials',
            text: 'Username and password are required to onboard an account.',
            confirmButtonColor: '#f97316',
            background: '#15171d',
            color: '#ffffff'
        });
        return;
    }

    commandBusy.value = true;

    try {
        const requestedUsername = onboardForm.value.username.trim();
        const includeLiveVerification = onboardForm.value.includeLiveVerification;
        const payload = {
            username: requestedUsername,
            password: onboardForm.value.password
        };

        const response = await RequestPOSTFromKliveAPI(
            `/omnigram/accounts/add?includeLiveVerification=${includeLiveVerification ? 'true' : 'false'}`,
            JSON.stringify(payload),
            false,
            true
        );

        if (!response.ok) {
            throw new Error(await readApiError(response));
        }

        const rawData = await response.json().catch(() => ({}));
        const data = (rawData && typeof rawData === 'object' ? rawData : {}) as OmniGramAddAccountResponse;
        const liveVerificationRequested = Boolean(data.LiveVerificationRequested ?? includeLiveVerification);
        const hasLiveVerification = data.LiveVerification !== null && data.LiveVerification !== undefined;
        const liveVerificationError = extractLiveVerificationError(data.LiveVerification);
        const checkpointRequired = Boolean(data.CheckpointRequired)
            || isCheckpointRequiredError(data.LastAuthenticationError)
            || isCheckpointRequiredError(liveVerificationError);

        resetOnboardForm();
        await loadAllPanels(false);

        const accountFromResponse = asNonEmptyText(data.AccountId);
        const accountFromList = accountFromResponse ? getAccountById(accountFromResponse) : findAccountByUsername(requestedUsername);
        const onboardedAccountId = accountFromList?.AccountId || accountFromResponse;
        const onboardingGuidance = asNonEmptyText(data.LastAuthenticationGuidance)
            || asNonEmptyText(accountFromList?.LastAuthenticationGuidance)
            || 'Open Instagram app, approve the login challenge, and confirm "This was me".';
        const verificationState = asNonEmptyText(data.VerificationState)
            || (accountFromList && accountStatusLabel(accountFromList.Status) === 'Active' && !accountFromList.CheckpointRequired
                ? 'Verified'
                : checkpointRequired
                    ? 'CheckpointRequired'
                    : 'NeedsVerification');
        const verificationGuidance = asNonEmptyText(data.VerificationGuidance)
            || extractLiveVerificationGuidance(data.LiveVerification)
            || onboardingGuidance;
        const onboardingAuthError = asNonEmptyText(data.LastAuthenticationError)
            || asNonEmptyText(liveVerificationError)
            || asNonEmptyText(accountFromList?.LastAuthenticationError);

        if (checkpointRequired) {
            const checkpointMessage = [
                `State: ${verificationState}`,
                verificationGuidance,
                'Open Instagram app and confirm "This was me", then retry live verification.',
                onboardingAuthError ? `Instagram error: ${onboardingAuthError}` : ''
            ].filter(Boolean).join('\n\n');

            const action = await Swal.fire({
                icon: 'warning',
                title: 'Verification required',
                text: checkpointMessage,
                confirmButtonText: 'Retry',
                showCancelButton: true,
                cancelButtonText: 'Later',
                confirmButtonColor: '#f97316',
                cancelButtonColor: '#334155',
                background: '#15171d',
                color: '#ffffff'
            });

            if (action.isConfirmed) {
                if (!onboardedAccountId) {
                    Swal.fire({
                        icon: 'warning',
                        title: 'Account saved, retry unavailable',
                        text: 'Managed account was saved but account id could not be resolved. Refresh and retry from Managed Accounts.',
                        confirmButtonColor: '#f97316',
                        background: '#15171d',
                        color: '#ffffff'
                    });
                } else {
                    await retryVerificationForAccount(onboardedAccountId, accountFromList?.Username || requestedUsername);
                }
            }

            return;
        }

        if (verificationState !== 'Verified') {
            const pendingMessage = [
                `State: ${verificationState}`,
                verificationGuidance,
                onboardingAuthError ? `Instagram error: ${onboardingAuthError}` : '',
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
                confirmButtonColor: '#f97316',
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
                        confirmButtonColor: '#f97316',
                        background: '#15171d',
                        color: '#ffffff'
                    });
                } else {
                    await retryVerificationForAccount(onboardedAccountId, accountFromList?.Username || requestedUsername);
                }
            }

            return;
        }

        Swal.fire({
            icon: 'success',
            title: 'Account onboarded',
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
            text: error instanceof Error ? error.message : 'Unable to onboard managed account.',
            confirmButtonColor: '#ef4444',
            background: '#15171d',
            color: '#ffffff'
        });
    } finally {
        commandBusy.value = false;
    }
}

async function retryVerificationForAccount(accountId: string, username?: string) {
    liveBusy.value = true;
    liveAccountForm.value.accountId = accountId;

    try {
        await fetchLiveAccountPayload(accountId);
        await loadAllPanels(false);

        const refreshedAccount = getAccountById(accountId);
        const status = refreshedAccount ? accountStatusLabel(refreshedAccount.Status) : 'Unknown';
        const liveVerificationError = extractLiveVerificationError(liveAccountData.value);
        const verified = status === 'Active' && !isCheckpointRequiredError(liveVerificationError);

        Swal.fire({
            icon: verified ? 'success' : 'info',
            title: verified ? 'Verification complete' : 'Verification still pending',
            text: verified
                ? `${username || refreshedAccount?.Username || 'Managed account'} is now authenticated and live data was refreshed.`
                : [
                    'Live verification check ran. If challenge is still pending, confirm "This was me" in Instagram and retry.',
                    liveVerificationError ? `Live error: ${liveVerificationError}` : ''
                ].filter(Boolean).join('\n\n'),
            confirmButtonColor: verified ? '#22c55e' : '#f97316',
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

async function deleteManagedAccount(accountId: string, username?: string) {
    const confirmation = await Swal.fire({
        icon: 'warning',
        title: `Delete ${username || 'managed account'}?`,
        text: 'This will remove the account from OmniGram management and stop autonomous scheduling for it.',
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
        const response = await RequestPOSTFromKliveAPI(
            '/omnigram/accounts/delete',
            JSON.stringify({ accountId }),
            false,
            true
        );

        if (!response.ok) {
            throw new Error(await readApiError(response));
        }

        const raw = await response.json().catch(() => null);
        const payload = (raw && typeof raw === 'object' ? raw : {}) as OmniGramDeleteAccountResponse;
        const success = Boolean(payload.Success ?? payload.success);

        if (!success) {
            Swal.fire({
                icon: 'warning',
                title: 'Delete not confirmed',
                text: 'OmniGram responded, but did not confirm deletion success.',
                confirmButtonColor: '#f97316',
                background: '#15171d',
                color: '#ffffff'
            });
            return;
        }

        if (liveAccountForm.value.accountId === accountId) {
            liveAccountForm.value.accountId = '';
            liveAccountData.value = null;
        }

        await loadAllPanels(false);

        Swal.fire({
            icon: 'success',
            title: 'Managed account deleted',
            text: `${username || 'Account'} was removed from OmniGram successfully.`,
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

async function submitAccountSettings() {
    if (!settingsForm.value.accountId) {
        Swal.fire({
            icon: 'warning',
            title: 'Select account',
            text: 'Choose a managed account to update settings.',
            confirmButtonColor: '#f97316',
            background: '#15171d',
            color: '#ffffff'
        });
        return;
    }

    if (settingsForm.value.useMemeScraperSource && settingsForm.value.memeNiches.length === 0) {
        Swal.fire({
            icon: 'warning',
            title: 'Niches required',
            text: 'At least one MemeScraper niche is required when source mode is enabled.',
            confirmButtonColor: '#f97316',
            background: '#15171d',
            color: '#ffffff'
        });
        return;
    }

    if (settingsForm.value.autonomousPostingEnabled && settingsForm.value.autonomousPostingIntervalMinutes <= 0) {
        Swal.fire({
            icon: 'warning',
            title: 'Invalid interval',
            text: 'Autonomous interval must be greater than 0 minutes.',
            confirmButtonColor: '#f97316',
            background: '#15171d',
            color: '#ffffff'
        });
        return;
    }

    if (settingsForm.value.autonomousPostingEnabled && settingsForm.value.autonomousPostingRandomOffsetMinutes < 0) {
        Swal.fire({
            icon: 'warning',
            title: 'Invalid random offset',
            text: 'Autonomous random offset must be zero or greater.',
            confirmButtonColor: '#f97316',
            background: '#15171d',
            color: '#ffffff'
        });
        return;
    }

    commandBusy.value = true;

    try {
        const payload = {
            accountId: settingsForm.value.accountId,
            useMemeScraperSource: settingsForm.value.useMemeScraperSource,
            memeNiches: settingsForm.value.useMemeScraperSource ? settingsForm.value.memeNiches : [],
            autonomousPostingEnabled: settingsForm.value.autonomousPostingEnabled,
            autonomousPostingIntervalMinutes: settingsForm.value.autonomousPostingEnabled
                ? settingsForm.value.autonomousPostingIntervalMinutes
                : null,
            autonomousPostingRandomOffsetMinutes: settingsForm.value.autonomousPostingEnabled
                ? settingsForm.value.autonomousPostingRandomOffsetMinutes
                : null,
            autonomousCaptionPrompt: settingsForm.value.autonomousPostingEnabled
                ? settingsForm.value.autonomousCaptionPrompt
                : null
        };

        const response = await RequestPOSTFromKliveAPI('/omnigram/accounts/updateSettings', JSON.stringify(payload), false, true);

        if (!response.ok) {
            throw new Error(await readApiError(response));
        }

        Swal.fire({
            icon: 'success',
            title: 'Settings updated',
            text: 'Runtime settings were updated successfully for selected account.',
            confirmButtonColor: '#22c55e',
            background: '#15171d',
            color: '#ffffff'
        });

        await loadAllPanels(false);
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'Settings update failed',
            text: error instanceof Error ? error.message : 'Unable to update account settings.',
            confirmButtonColor: '#ef4444',
            background: '#15171d',
            color: '#ffffff'
        });
    } finally {
        commandBusy.value = false;
    }
}

async function submitProfileUpdate() {
    if (!profileForm.value.accountId) {
        Swal.fire({
            icon: 'warning',
            title: 'Select account',
            text: 'Choose a managed account before updating profile.',
            confirmButtonColor: '#f97316',
            background: '#15171d',
            color: '#ffffff'
        });
        return;
    }

    if (!profileForm.value.displayName && !profileForm.value.bio && !profileForm.value.website) {
        Swal.fire({
            icon: 'warning',
            title: 'No profile fields set',
            text: 'Provide at least one field (display name, bio, website) to update profile.',
            confirmButtonColor: '#f97316',
            background: '#15171d',
            color: '#ffffff'
        });
        return;
    }

    commandBusy.value = true;

    try {
        const payload = {
            accountId: profileForm.value.accountId,
            displayName: profileForm.value.displayName || null,
            bio: profileForm.value.bio || null,
            website: profileForm.value.website || null
        };

        const response = await RequestPOSTFromKliveAPI('/omnigram/accounts/updateProfile', JSON.stringify(payload), false, true);

        if (!response.ok) {
            throw new Error(await readApiError(response));
        }

        Swal.fire({
            icon: 'success',
            title: 'Profile update queued',
            text: 'OmniGram accepted the profile update request.',
            confirmButtonColor: '#22c55e',
            background: '#15171d',
            color: '#ffffff'
        });

        await loadAllPanels(false);
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'Profile update failed',
            text: error instanceof Error ? error.message : 'Unable to update Instagram profile.',
            confirmButtonColor: '#ef4444',
            background: '#15171d',
            color: '#ffffff'
        });
    } finally {
        commandBusy.value = false;
    }
}

async function deleteInstagramMedia() {
    if (!deleteMediaForm.value.accountId || !deleteMediaForm.value.instagramMediaId) {
        Swal.fire({
            icon: 'warning',
            title: 'Missing input',
            text: 'Managed account and Instagram media id are required.',
            confirmButtonColor: '#f97316',
            background: '#15171d',
            color: '#ffffff'
        });
        return;
    }

    const confirmation = await Swal.fire({
        icon: 'warning',
        title: 'Delete media from Instagram?',
        text: 'This will call OmniGram deleteFromInstagram for the provided media id.',
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#334155',
        showCancelButton: true,
        background: '#15171d',
        color: '#ffffff'
    });

    if (!confirmation.isConfirmed) {
        return;
    }

    commandBusy.value = true;

    try {
        const payload = {
            accountId: deleteMediaForm.value.accountId,
            instagramMediaId: deleteMediaForm.value.instagramMediaId
        };

        const response = await RequestPOSTFromKliveAPI('/omnigram/posts/deleteFromInstagram', JSON.stringify(payload), false, true);

        if (!response.ok) {
            throw new Error(await readApiError(response));
        }

        Swal.fire({
            icon: 'success',
            title: 'Media delete accepted',
            text: 'OmniGram accepted delete request for the Instagram media id.',
            confirmButtonColor: '#22c55e',
            background: '#15171d',
            color: '#ffffff'
        });

        resetDeleteMediaForm();
        await loadAllPanels(false);
    } catch (error) {
        Swal.fire({
            icon: 'error',
            title: 'Media delete failed',
            text: error instanceof Error ? error.message : 'Unable to delete Instagram media.',
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

async function scheduleCampaign() {
    if (scheduleForm.value.dispatchMode === 'SingleAccount' && !scheduleForm.value.accountId) {
        Swal.fire({
            icon: 'warning',
            title: 'Pick account',
            text: 'Select an account for single-account dispatch.',
            confirmButtonColor: '#f97316',
            background: '#15171d',
            color: '#ffffff'
        });
        return;
    }

    if (scheduleForm.value.captionMode === 'User' && !scheduleForm.value.userCaption) {
        Swal.fire({
            icon: 'warning',
            title: 'Caption missing',
            text: 'User caption mode requires a caption.',
            confirmButtonColor: '#f97316',
            background: '#15171d',
            color: '#ffffff'
        });
        return;
    }

    if (scheduleForm.value.captionMode === 'AI' && !scheduleForm.value.aiCaptionPrompt) {
        Swal.fire({
            icon: 'warning',
            title: 'Prompt missing',
            text: 'AI caption mode requires a prompt.',
            confirmButtonColor: '#f97316',
            background: '#15171d',
            color: '#ffffff'
        });
        return;
    }

    if (scheduleForm.value.useDirectUpload && !scheduleUploadFile.value) {
        Swal.fire({
            icon: 'warning',
            title: 'Upload required',
            text: 'Select a media file for direct upload scheduling mode.',
            confirmButtonColor: '#f97316',
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
                confirmButtonColor: '#f97316',
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
        const captionMode = scheduleForm.value.captionMode === 'User' ? 0 : 1;
        const target = scheduleForm.value.target === 'Feed' ? 0 : scheduleForm.value.target === 'Reel' ? 1 : 2;

        if (scheduleForm.value.useDirectUpload) {
            const params = new URLSearchParams();
            params.set('fileName', scheduleUploadFile.value!.name);
            params.set('dispatchMode', String(dispatchMode));
            params.set('target', String(target));
            params.set('captionMode', String(captionMode));

            if (dispatchMode === 0) {
                params.set('accountId', scheduleForm.value.accountId);
            }

            if (captionMode === 0 && scheduleForm.value.userCaption) {
                params.set('userCaption', scheduleForm.value.userCaption);
            }

            if (captionMode === 1 && scheduleForm.value.aiCaptionPrompt) {
                params.set('aiCaptionPrompt', scheduleForm.value.aiCaptionPrompt);
            }

            if (scheduledForUtc) {
                params.set('scheduledForUtc', scheduledForUtc);
            }

            const response = await RequestPOSTFromKliveAPI(
                `/omnigram/posts/schedule?${params.toString()}`,
                scheduleUploadFile.value,
                false,
                false
            );

            if (!response.ok) {
                throw new Error(await readApiError(response));
            }

            Swal.fire({
                icon: 'success',
                title: 'Campaign scheduled with upload',
                text: 'Media bytes were accepted and will be persisted in OmniGram uploads storage.',
                confirmButtonColor: '#22c55e',
                background: '#15171d',
                color: '#ffffff'
            });

            scheduleUploadFile.value = null;
        } else {
            const payload: Record<string, unknown> = {
                dispatchMode,
                target,
                captionMode,
                accountId: dispatchMode === 0 ? scheduleForm.value.accountId : null,
                userCaption: captionMode === 0 ? scheduleForm.value.userCaption : null,
                aiCaptionPrompt: captionMode === 1 ? scheduleForm.value.aiCaptionPrompt : null,
                mediaPath: scheduleForm.value.mediaPath || null
            };

            if (scheduledForUtc) {
                payload.scheduledForUtc = scheduledForUtc;
            }

            const response = await RequestPOSTFromKliveAPI('/omnigram/posts/schedule', JSON.stringify(payload), false, true);

            if (!response.ok) {
                throw new Error(await readApiError(response));
            }

            Swal.fire({
                icon: 'success',
                title: 'Campaign scheduled',
                text: 'OmniGram accepted the scheduling request.',
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
            text: error instanceof Error ? error.message : 'Unable to schedule campaign.',
            confirmButtonColor: '#ef4444',
            background: '#15171d',
            color: '#ffffff'
        });
    } finally {
        commandBusy.value = false;
    }
}

onMounted(async () => {
    seedDefaultScheduleTime();
    await loadAllPanels(true);

    refreshInterval = setInterval(() => {
        loadAllPanels(false);
    }, 15000);
});

onBeforeUnmount(() => {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
});
</script>

<style scoped>
.omnigram-page {
    --bg-1: #0d1117;
    --bg-2: #161b22;
    --panel: rgba(22, 27, 34, 0.86);
    --panel-border: rgba(251, 113, 133, 0.22);
    --panel-border-soft: rgba(148, 163, 184, 0.18);
    --accent: #f97316;
    --accent-2: #fb7185;
    --success: #22c55e;
    --warn: #f59e0b;
    --danger: #ef4444;
    --text: #f8fafc;
    --text-muted: #94a3b8;

    min-height: 100vh;
    padding: 20px 0 32px;
    background:
        radial-gradient(circle at 12% 8%, rgba(249, 115, 22, 0.24), transparent 34%),
        radial-gradient(circle at 90% 4%, rgba(251, 113, 133, 0.2), transparent 30%),
        linear-gradient(155deg, var(--bg-1), var(--bg-2));
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
    text-shadow: 0 0 18px rgba(251, 113, 133, 0.35);
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
    background: rgba(249, 115, 22, 0.18);
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

.form-card.compact-grid > div {
    min-width: 0;
}

.form-card h3 {
    margin: 0 0 10px;
    color: #fcd5ce;
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

.inline-form .command-btn {
    max-width: 230px;
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
    color: #94a3b8;
    font-size: 0.72rem;
    line-height: 1.35;
}

.niche-selector {
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.24);
    background: rgba(2, 6, 23, 0.42);
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.niche-selector-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
}

.niche-selector-header > span {
    color: var(--text-muted);
    font-size: 0.74rem;
    text-transform: uppercase;
    letter-spacing: 0.45px;
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

.inline-link-btn:hover:not(:disabled) {
    border-color: rgba(148, 163, 184, 0.42);
    background: rgba(148, 163, 184, 0.2);
}

.inline-link-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

.niche-menu {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    max-height: 120px;
    overflow-y: auto;
}

.niche-menu-item {
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.28);
    background: rgba(148, 163, 184, 0.12);
    color: #dbeafe;
    padding: 5px 10px;
    font-size: 0.72rem;
    line-height: 1;
    cursor: pointer;
    transition: border-color 0.2s ease, background 0.2s ease;
}

.niche-menu-item:hover {
    border-color: rgba(98, 206, 71, 0.45);
    background: rgba(77, 158, 57, 0.2);
}

.niche-menu-item.active {
    border-color: rgba(98, 206, 71, 0.62);
    background: rgba(77, 158, 57, 0.32);
    color: #d8f7d0;
}

.niche-menu-empty {
    border-radius: 8px;
    border: 1px dashed rgba(148, 163, 184, 0.32);
    padding: 10px;
    color: #94a3b8;
    font-size: 0.75rem;
    text-align: center;
}

.niche-preview {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: -2px;
}

.niche-chip {
    border-radius: 999px;
    border: 1px solid rgba(251, 146, 60, 0.42);
    background: rgba(249, 115, 22, 0.16);
    color: #fdba74;
    padding: 3px 8px;
    font-size: 0.7rem;
    line-height: 1;
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
    border-color: rgba(251, 146, 60, 0.72);
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
    color: #fcd5ce !important;
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

.autonomous-input-row {
    column-gap: 14px;
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
    max-height: 300px;
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
}

.inline-link-btn.danger-link {
    border-color: rgba(239, 68, 68, 0.42);
    background: rgba(239, 68, 68, 0.16);
    color: #fecaca;
}

.inline-link-btn.danger-link:hover:not(:disabled) {
    border-color: rgba(248, 113, 113, 0.6);
    background: rgba(239, 68, 68, 0.24);
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

.account-auth-debug .inline-link-btn {
    align-self: flex-start;
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
    position: sticky;
    top: 0;
    background: rgba(15, 23, 42, 0.95);
    color: #f8fafc;
    font-size: 0.7rem;
    letter-spacing: 0.45px;
    text-transform: uppercase;
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
    border: 1px solid rgba(148, 163, 184, 0.24);
    background: rgba(15, 23, 42, 0.42);
    padding: 10px;
}

.event-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    color: var(--text-muted);
    font-size: 0.72rem;
}

.event-row p {
    margin: 8px 0;
    color: #f1f5f9;
    font-size: 0.8rem;
    line-height: 1.45;
}

.event-links {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    color: #cbd5e1;
    font-size: 0.7rem;
}

.status-pill {
    border-radius: 999px;
    border: 1px solid transparent;
    padding: 2px 8px;
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
}

.status-ok {
    color: #86efac;
    background: rgba(34, 197, 94, 0.2);
    border-color: rgba(74, 222, 128, 0.38);
}

.status-warn {
    color: #fcd34d;
    background: rgba(245, 158, 11, 0.22);
    border-color: rgba(251, 191, 36, 0.4);
}

.status-danger {
    color: #fca5a5;
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(248, 113, 113, 0.4);
}

.status-muted {
    color: #cbd5e1;
    background: rgba(148, 163, 184, 0.2);
    border-color: rgba(148, 163, 184, 0.34);
}

.mono {
    font-family: Consolas, Monaco, monospace;
}

@media (max-width: 1280px) {
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

    .account-meta {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 860px) {
    .page-header {
        grid-template-columns: 1fr;
        text-align: center;
    }

    .header-left,
    .header-right {
        display: flex;
        justify-content: center;
    }

    .page-title {
        font-size: 1.66rem;
    }

    .metric-strip {
        grid-template-columns: 1fr;
    }

    .subpage-nav {
        grid-template-columns: 1fr;
    }

    .input-row.split,
    .mini-grid {
        grid-template-columns: 1fr;
    }

    .inline-form .command-btn,
    .form-actions.single-row .command-btn {
        max-width: none;
    }
}
</style>
