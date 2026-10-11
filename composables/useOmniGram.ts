import { useState } from '#imports';
import { KliveAPIUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI, AuthorizationHeaderValue, ReportXhrAccess } from '~/scripts/APIInterface';

// Formatting, polling and dialogs are shared with OmniTumblr (one implementation, one look).
export {
    DAY_LONG, DAY_SHORT, WEEK_ORDER, browserTimeZone, cloneDeep, confirmAction, fmtBytes, fmtClipLength, fmtCount, fmtDate, fmtRelative,
    fmtSignedCount, fmtWhen, forgetMedia, fromLocalInput, hhmmToMinute, levelTone, loadMediaUrl, minuteToHHMM, notify, q, timeZoneOptions,
    toLocalInput, useNow, usePoll,
} from '~/composables/useOmniTumblr';
import { q } from '~/composables/useOmniTumblr';

// ─────────────────────────────── API types (mirror the C# DTOs) ───────────────────────────────

export type PostStatus = 'Draft' | 'Planned' | 'Ready' | 'AwaitingApproval' | 'Publishing' | 'Published' | 'Failed' | 'Cancelled' | 'Skipped' | 'Removed';
export type PostFormat = 'Reel' | 'Photo' | 'Carousel' | 'Story';
export type CaptionMode = 'None' | 'Fixed' | 'Rotate' | 'AI' | 'Original' | 'Manual';
export type ContentSourceKind = 'None' | 'MemeScraper' | 'Folder' | 'Library';
export type ContentPick = 'Best' | 'Newest' | 'Random' | 'Oldest';
export type HashtagPlacement = 'Caption' | 'FirstComment' | 'None';
export type TrialReelMode = 'Off' | 'Manual' | 'Auto';
export type ImageFit = 'BlurPad' | 'Pad' | 'Crop';
export type ConnectionState = 'AwaitingConnection' | 'Healthy' | 'NeedsReauth' | 'Restricted' | 'Error';

export interface PostSummary {
    PostId: string;
    AccountId: string;
    Username: string | null;
    Status: PostStatus;
    Origin: 'Autopilot' | 'Manual' | 'Imported';
    Format: PostFormat;
    ScheduledUtc: string;
    SlotUtc: string | null;
    PublishedUtc: string | null;
    NextAttemptUtc: string | null;
    Caption: string | null;
    Hashtags: string[];
    HashtagPlacement: HashtagPlacement;
    FirstComment: string | null;
    Credit: string | null;
    Footer: string | null;
    ComposedCaption: string;
    AltText: string | null;
    CaptionPending: boolean;
    CaptionMode: CaptionMode;
    CaptionError: string | null;
    CaptionEdited: boolean;
    UsedVision: boolean;
    CaptionModel: string | null;
    Approved: boolean;
    HasThumbnail: boolean;
    MediaCount: number;
    IsVideo: boolean;
    DurationSeconds: number | null;
    Width: number | null;
    Height: number | null;
    Bytes: number | null;
    Prepared: boolean;
    PrepareNotes: string | null;
    PrepareError: string | null;
    BlockedReason: string | null;
    LastError: string | null;
    LastErrorCode: string | null;
    Attempts: number;
    Stage: 'None' | 'Processing' | 'PublishRequested' | 'Published';
    ContainerStatus: string | null;
    Permalink: string | null;
    IgMediaId: string | null;
    FirstCommentError: string | null;
    FirstCommentPending: boolean;
    Trial: TrialReelMode;
    ShareToFeed: boolean;
    CompanionPostId: string | null;
    Views: number | null;
    Reach: number | null;
    Likes: number | null;
    Comments: number | null;
    Shares: number | null;
    Saves: number | null;
    Interactions: number;
    AvgWatchTimeMs: number | null;
    SkipRate: number | null;
    ViewsAt24h: number | null;
    ViewsAt7d: number | null;
    MetricsSyncedUtc: string | null;
    ContentSource: ContentSourceKind | null;
    ContentOrigin: string | null;
    ContentUrl: string | null;
    OriginalCaption: string | null;
    ContentViews: number | null;
}

export interface AccountSummary {
    AccountId: string;
    Username: string;
    Name: string | null;
    ProfilePictureUrl: string | null;
    ProfileUrl: string;
    AccountType: string | null;
    Autopilot: boolean;
    Paused: boolean;
    RequireApproval: boolean;
    Connection: ConnectionState;
    ConnectionDetail: string | null;
    TokenExpiresUtc: string | null;
    Followers: number | null;
    FollowersDelta7d: number | null;
    FollowersSpark: number[];
    MediaCount: number | null;
    LastPublishedUtc: string | null;
    NextPost: PostSummary | null;
    LastPost: PostSummary | null;
    Pending: number;
    AwaitingApproval: number;
    Published7d: number;
    Failed7d: number;
    AvgViews30d: number | null;
    AvgInteractions30d: number | null;
    Reach7d: number | null;
    SlotsPerWeek: number;
    Source: ContentSourceKind;
    CaptionMode: CaptionMode;
    TimeZone: string;
    LastError: string | null;
    LastErrorUtc: string | null;
    ConsecutiveFailures: number;
    ContentWarning: string | null;
    NewComments: number;
    Imported: boolean;
    State: 'ok' | 'attention' | 'error' | 'paused' | 'idle' | 'connect';
    StateReason: string;
}

export interface AttentionItem {
    Level: 'error' | 'warning' | 'info';
    Title: string;
    Detail: string;
    AccountId: string | null;
    Action: 'settings' | 'reconnect' | 'connect' | 'strategy' | 'queue' | 'public-url' | 'v1-passwords' | null;
}

export interface SeriesPoint { T: string; V: number }

export interface FleetKpis {
    Followers: number;
    FollowersDelta7d: number | null;
    FollowersDelta30d: number | null;
    FollowersSeries: SeriesPoint[];
    Published7d: number;
    PublishedPrev7d: number;
    Views30d: number;
    AvgViews30d: number | null;
    AvgInteractions30d: number | null;
    Reach7d: number | null;
    Pending: number;
    AwaitingApproval: number;
    Failed7d: number;
    SuccessRate30d: number | null;
    NextPostUtc: string | null;
    NextPostAccount: string | null;
    AutopilotAccounts: number;
    Accounts: number;
    ConnectedAccounts: number;
}

export interface EngineLoop {
    Name: string;
    State: string;
    LastTickUtc: string | null;
    LastActivityUtc: string | null;
    LastActivity: string | null;
    LastError: string | null;
    LastErrorUtc: string | null;
    Ticks: number;
}

export interface PublicUrlCheck { Utc: string; Ok: boolean; BaseUrl: string; Status: number | null; LatencyMs: number | null; Detail: string | null }

export interface EngineStatus {
    Enabled: boolean;
    Running: boolean;
    PublishingEnabled: boolean;
    StartupState: string;
    StartedUtc: string;
    Loops: EngineLoop[];
    Api: {
        Version: string | null;
        CallsThisHour: number;
        CallsToday: number;
        AppUsagePercent: number | null;
        AccountUsagePercent: number | null;
        RegainAccessMinutes: number | null;
        UsageObservedUtc: string | null;
        ByEndpointToday: Record<string, number>;
        ProxyActive: boolean;
    };
    PublicMedia: { BaseUrl: string | null; Check: PublicUrlCheck | null; LastExternalMediaFetchUtc: string | null; LastExternalMediaFetchAgent: string | null };
    MemeScraperReady: boolean;
    AiAvailable: boolean;
    /** Available is null until the first check (shortly after startup). */
    Ffmpeg: { Available: boolean | null; Status: string | null };
    Migration: string | null;
    V1PasswordFilesPresent: boolean;
    UnsupportedMetrics: Record<string, string[]>;
    SyncErrors: { Job: string; Error: string }[] | null;
}

export interface AppConfig {
    Configured: boolean;
    AppId: string | null;
    RedirectUrl: string;
    VerifiedUtc: string | null;
    LastVerifyError: string | null;
    UpdatedUtc: string | null;
}

export interface ConnectionInfo {
    AccountId: string;
    Username: string;
    Name: string | null;
    ProfilePictureUrl: string | null;
    AccountType: string | null;
    IgUserId: string | null;
    Connected: boolean;
    Connection: ConnectionState;
    ConnectionDetail: string | null;
    ConnectionChangedUtc: string | null;
    ConnectedVia: string | null;
    ConnectedUtc: string | null;
    TokenIssuedUtc: string | null;
    TokenRefreshedUtc: string | null;
    TokenExpiresUtc: string | null;
    Scopes: string[];
    Quota: { QuotaUsage: number | null; QuotaTotal: number | null; FetchedUtc: string | null };
    Imported: boolean;
}

export interface OmniEvent {
    Utc: string;
    Level: 'Info' | 'Success' | 'Warning' | 'Error';
    Kind: string;
    Message: string;
    AccountId: string | null;
    PostId: string | null;
    Username: string | null;
}

export interface Overview {
    NowUtc: string;
    Engine: EngineStatus;
    App: AppConfig;
    Kpis: FleetKpis;
    Accounts: AccountSummary[];
    Upcoming: PostSummary[];
    RecentlyPublished: PostSummary[];
    Attention: AttentionItem[];
    Events: OmniEvent[];
}

export interface WeeklySlot { Day: number; Minute: number }

export interface AiCaptionSettings {
    Persona: string;
    Instructions: string;
    Examples: string[];
    MaxLength: number;
    UseVision: boolean;
    UseSourceCaption: boolean;
    SuggestHashtags: boolean;
    MaxSuggestedHashtags: number;
    AllowEmoji: boolean;
    Language: string;
    Fallback: 'Empty' | 'Fixed' | 'Hold';
    Model: string | null;
}

export interface ReelSettings {
    ShareToFeed: boolean;
    CoverFrameSeconds: number | null;
    Trial: TrialReelMode;
    Collaborators: string[];
    AlsoPostStory: boolean;
}

export interface Strategy {
    TimeZone: string;
    Slots: WeeklySlot[];
    JitterMinutes: number;
    PlanAheadDays: number;
    MaxPostsPerDay: number;
    MinGapMinutes: number;
    MissedSlots: 'PublishLate' | 'Skip';
    MissedSlotGraceHours: number;
    Source: ContentSourceKind;
    MemeScraper: {
        Niches: string[];
        Sources: string[];
        MaxAgeDays: number;
        MinViews: number;
        MaxDurationSeconds: number;
        Pick: ContentPick;
        AllowReuseAcrossAccounts: boolean;
    };
    Folder: { Path: string; IncludeSubfolders: boolean; Images: boolean; Videos: boolean; Pick: ContentPick };
    ImageFormat: PostFormat;
    VideoFormat: PostFormat;
    ImageFit: ImageFit;
    Reels: ReelSettings;
    CaptionMode: CaptionMode;
    FixedCaption: string;
    CaptionPool: string[];
    Ai: AiCaptionSettings;
    CaptionFooter: string;
    CreditTemplate: string;
    FixedHashtags: string[];
    RotatingHashtags: string[];
    RotatingHashtagsPerPost: number;
    MaxHashtags: number;
    HashtagPlacement: HashtagPlacement;
    LabelAsAiGenerated: boolean;
}

export interface ContentPreview {
    Key: string;
    Source: ContentSourceKind;
    Kind: 'Video' | 'Photo';
    Origin: string | null;
    OriginalUrl: string | null;
    Views: number | null;
    Likes: number | null;
    CreatedUtc: string | null;
    OriginalCaption: string | null;
    DurationSeconds: number | null;
    FileName: string;
}

export interface CommentItem {
    Id: string;
    MediaId: string;
    OmniPostId: string | null;
    ParentId: string | null;
    Username: string | null;
    Text: string | null;
    Utc: string;
    LikeCount: number | null;
    Hidden: boolean;
    Own: boolean;
    Replied: boolean;
}

export interface CommentThread extends Omit<CommentItem, 'ParentId'> {
    Replies: CommentItem[];
    Media: { Permalink: string | null; Caption: string | null; ThumbnailUrl: string | null; ProductType: string | null } | null;
}

export interface AccountDetail {
    NowUtc: string;
    Summary: AccountSummary;
    Account: {
        AccountId: string;
        Username: string;
        Name: string | null;
        AccountType: string | null;
        ProfilePictureUrl: string | null;
        ProfileUrl: string;
        Biography: string | null;
        Website: string | null;
        Autopilot: boolean;
        Paused: boolean;
        RequireApproval: boolean;
        Notes: string | null;
        Tags: string[];
        AddedUtc: string;
        Stats: {
            Followers: number | null; Follows: number | null; MediaCount: number | null; ProfileSyncedUtc: string | null; MediaIndexSyncedUtc: string | null;
            PostInsightsSyncedUtc: string | null; AccountInsightsSyncedUtc: string | null; DemographicsSyncedUtc: string | null; CommentsSyncedUtc: string | null; LastPublishedUtc: string | null;
        };
        Health: { LastError: string | null; LastErrorUtc: string | null; ConsecutiveFailures: number; LastSuccessUtc: string | null; ContentWarning: string | null; ContentWarningUtc: string | null; CooldownUntilUtc: string | null; CooldownReason: string | null };
        Quota: { QuotaTotal: number | null; QuotaUsage: number | null; QuotaDurationSeconds: number; FetchedUtc: string | null };
        Strategy: Strategy;
        UsedContentCount: number;
        RejectedContentCount: number;
        Legacy: { V1AccountId: string | null; ImportedUtc: string; V1LoginStatus: string | null; V1PostedCount: number } | null;
    };
    Connection: ConnectionInfo;
    Pending: PostSummary[];
    History: PostSummary[];
    Events: OmniEvent[];
    Comments: CommentItem[];
    Validation: string[];
    Runway: { Eligible?: number; SlotsPerWeek?: number; WeeksOfContent?: number | null; Next?: ContentPreview[]; Source?: ContentSourceKind; Error?: string };
}

export interface Ranked { Key: string; Posts: number; AvgViews: number; AvgInteractions: number }

export interface Analytics {
    AccountId: string | null;
    Days: number;
    FromUtc: string;
    ToUtc: string;
    TimeZone: string;
    Followers: number | null;
    FollowersDelta: number | null;
    FollowersGrowthPerWeek: number | null;
    NewFollows: number | null;
    Unfollows: number | null;
    PostsPublished: number;
    PostsPublishedPrev: number;
    Views: number;
    ViewsPrev: number;
    AvgViews: number | null;
    MedianViews: number | null;
    Interactions: number;
    InteractionsPrev: number;
    AvgInteractions: number | null;
    EngagementRate: number | null;
    EngagementPerFollower: number | null;
    AccountReach: number | null;
    AccountViews: number | null;
    Likes: number | null;
    Comments: number | null;
    Shares: number | null;
    Saves: number | null;
    AvgWatchSeconds: number | null;
    FollowersSeries: SeriesPoint[];
    Account: { Day: string; Reach: number | null; Views: number | null; Interactions: number | null; Follows: number | null; Unfollows: number | null; ProfileLinksTaps: number | null }[];
    Posting: { Day: string; Ours: number; Others: number; Views: number }[];
    Heatmap: { Dow: number; Hour: number; Posts: number; AvgViews: number }[];
    BestSlotLabel: string | null;
    OnlineByHour: number[];
    OnlinePeakLabel: string | null;
    TopPosts: {
        Id: string; AccountId: string | null; Username: string | null; OmniPostId: string | null; Permalink: string | null; Caption: string | null;
        ProductType: string | null; ThumbnailUrl: string | null; Views: number | null; Likes: number | null; Comments: number | null; Interactions: number | null;
        PublishedUtc: string; Ours: boolean; HasThumbnail: boolean;
    }[];
    Hashtags: Ranked[];
    Sources: Ranked[];
    CaptionModes: Ranked[];
    Formats: Ranked[];
    Demographics: Record<string, Ranked[]>;
    DemographicsNote: string | null;
    SampleSize: number;
}

export interface PostDetail {
    Post: PostSummary;
    Media: {
        Index: number; MimeType: string; Bytes: number; Width: number | null; Height: number | null; DurationSeconds: number | null; HasThumbnail: boolean; Exists: boolean;
        FileName: string; Prepared: boolean; PreparedBytes: number | null; PreparedFor: PostFormat | null; PrepareNotes: string | null; PrepareError: string | null;
    }[];
    AttemptLog: { Utc: string; Ok: boolean; Step: string | null; Code: string | null; Message: string | null; DurationMs: number }[];
    MetricsHistory: { Utc: string; Views: number | null; Reach: number | null; Likes: number | null; Comments: number | null; Interactions: number | null }[];
    Metrics: { Views: number | null; Reach: number | null; Likes: number | null; Comments: number | null; Shares: number | null; Saves: number | null; Reposts: number | null; TotalInteractions: number | null; Follows: number | null; ProfileVisits: number | null; Replies: number | null; AvgWatchTimeMs: number | null; TotalWatchTimeMs: number | null; SkipRate: number | null; InsightsSyncedUtc: string | null; CountsSyncedUtc: string | null; InsightsError: string | null; ViewsAt24h: number | null; ViewsAt7d: number | null };
    CaptionInfo: { Mode: CaptionMode; Model: string | null; UsedVision: boolean; GeneratedUtc: string | null; Edited: boolean; Error: string | null; Failures: number; Direction: string | null; SuggestedHashtags: string[] };
    Content: { Kind: ContentSourceKind; Key: string; Origin: string | null; OriginalCaption: string | null; OriginalUrl: string | null; Views: number | null; Likes: number | null; CreatedUtc: string | null } | null;
    Reel: ReelSettings;
    Publish: { Stage: string; ContainerStatus: string | null; ContainerStatusDetail: string | null; ContainerCreatedUtc: string | null; NextCheckUtc: string | null; StatusChecks: number; MediaFetches: number; LastMediaFetchUtc: string | null; LastMediaFetchAgent: string | null };
    Comments: CommentItem[];
    Deferrals: number;
    ManualOverride: boolean;
    CreatedUtc: string;
    UpdatedUtc: string;
}

export interface CatalogOptions {
    Ready: boolean;
    TotalReels: number;
    DownloadedReels: number;
    Niches: { Name: string; Sources: number; Reels: number }[];
    Sources: { Username: string; Niches: string[]; Reels: number; NewestUtc: string | null }[];
}

export interface SettingsDto {
    App: AppConfig;
    Accounts: ConnectionInfo[];
    Engine: EngineStatus;
    Presets: string[];
    DefaultStrategy: Strategy;
    Scopes: string[];
    PublicMediaRoute: string;
}

export interface CaptionPreview {
    Caption: string;
    Hashtags: string[];
    SuggestedHashtags: string[];
    ComposedCaption: string;
    FirstComment: string | null;
    AltText: string | null;
    Model: string | null;
    UsedVision: boolean;
    FramesSent: number;
    Content: ContentPreview;
}

// ─────────────────────────────── API access ───────────────────────────────

export interface ApiResult<T> {
    ok: boolean;
    status: number;
    data: T | null;
    error: string | null;
}

async function readResult<T>(response: Response): Promise<ApiResult<T>> {
    let text = '';
    try { text = await response.text(); } catch { /* body unavailable */ }
    let body: any = null;
    if (text) {
        try { body = JSON.parse(text); } catch { body = text; }
    }
    if (response.ok) return { ok: true, status: response.status, data: body as T, error: null };
    const message = typeof body === 'object' && body && typeof body.error === 'string'
        ? body.error
        : typeof body === 'string' && body.trim() ? body.trim() : `Request failed (${response.status})`;
    return { ok: false, status: response.status, data: null, error: message };
}

export async function igGet<T>(path: string, signal?: AbortSignal): Promise<ApiResult<T>> {
    const response = await RequestGETFromKliveAPI(path, false, false, {}, signal);
    return readResult<T>(response);
}

/** POSTs a JSON body (always stringified: v1 of this page reported "Success" on 500s and never read errors). */
export async function igPost<T>(path: string, body: unknown = {}, signal?: AbortSignal): Promise<ApiResult<T>> {
    const response = await RequestPOSTFromKliveAPI(path, JSON.stringify(body ?? {}), false, true, signal);
    return readResult<T>(response);
}

export const postThumbPath = (postId: string, index = 0) => `/omnigram/media${q({ postId, index, variant: 'thumb' })}`;
export const postMediaPath = (postId: string, index = 0) => `/omnigram/media${q({ postId, index, variant: 'full' })}`;
export const contentThumbPath = (accountId: string, key: string) => `/omnigram/content/thumb${q({ accountId, key })}`;

export interface UploadResult {
    MediaId: string | null;
    FileName: string;
    OriginalName: string;
    Kind: 'Video' | 'Photo';
    MimeType: string;
    Bytes: number;
    Width: number | null;
    Height: number | null;
    DurationSeconds: number | null;
    Purpose: 'compose' | 'library';
    AccountId: string | null;
}

/** Streams a file to OmniGram with progress (XHR: fetch has no upload progress). */
export function uploadMedia(file: File, purpose: 'compose' | 'library', accountId: string | null, onProgress?: (percent: number) => void): { promise: Promise<UploadResult>; abort: () => void } {
    const xhr = new XMLHttpRequest();
    const promise = new Promise<UploadResult>((resolve, reject) => {
        const authorization = AuthorizationHeaderValue();
        xhr.open('POST', `${KliveAPIUrl}/omnigram/media/upload${q({ fileName: file.name, purpose, accountId })}`, true);
        if (authorization) xhr.setRequestHeader('Authorization', authorization);
        xhr.setRequestHeader('X-Klive-Client', 'website');
        xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
        xhr.onload = () => {
            let body: any = null;
            try { body = JSON.parse(xhr.responseText); } catch { body = xhr.responseText; }
            if (xhr.status >= 200 && xhr.status < 300) return resolve(body as UploadResult);
            ReportXhrAccess(xhr, '/omnigram/media/upload');
            reject(new Error(typeof body === 'object' && body?.error ? body.error : (xhr.responseText || `Upload failed (${xhr.status})`)));
        };
        xhr.onerror = () => reject(new Error('Network error while uploading.'));
        xhr.onabort = () => reject(new Error('Upload cancelled.'));
        xhr.send(file);
    });
    return { promise, abort: () => xhr.abort() };
}

// ─────────────────────────────── Shared overview state ───────────────────────────────

/** One overview fetch shared by the shell (nav, engine status) and the overview page, so pages never double-poll. */
export function useGramOverview() {
    const overview = useState<Overview | null>('omnigram:overview', () => null);
    const error = useState<string | null>('omnigram:overview-error', () => null);
    const loading = useState<boolean>('omnigram:overview-loading', () => false);
    const loadedAt = useState<number | null>('omnigram:overview-at', () => null);

    async function refresh() {
        if (loading.value) return;
        loading.value = true;
        try {
            const result = await igGet<Overview>('/omnigram/overview');
            if (result.ok && result.data) {
                overview.value = result.data;
                error.value = null;
                loadedAt.value = Date.now();
            } else {
                error.value = result.error;
            }
        } finally {
            loading.value = false;
        }
    }

    return { overview, error, loading, loadedAt, refresh };
}

// ─────────────────────────────── Labels ───────────────────────────────

export const STATUS_LABEL: Record<PostStatus, string> = {
    Draft: 'Draft',
    Planned: 'Preparing',
    Ready: 'Scheduled',
    AwaitingApproval: 'Needs approval',
    Publishing: 'Publishing…',
    Published: 'Published',
    Failed: 'Failed',
    Cancelled: 'Cancelled',
    Skipped: 'Skipped',
    Removed: 'Removed',
};

export const FORMAT_LABEL: Record<PostFormat, string> = { Reel: 'Reel', Photo: 'Photo', Carousel: 'Carousel', Story: 'Story' };
export const FORMAT_GLYPH: Record<PostFormat, string> = { Reel: '▶', Photo: '◩', Carousel: '❐', Story: '◔' };

export const CONNECTION_LABEL: Record<ConnectionState, string> = {
    AwaitingConnection: 'Not connected',
    Healthy: 'Connected',
    NeedsReauth: 'Reconnect needed',
    Restricted: 'Restricted by Instagram',
    Error: 'Error',
};

export function statusTone(status: PostStatus): string {
    switch (status) {
        case 'Published': return 'ok';
        case 'Failed': return 'bad';
        case 'AwaitingApproval': return 'warn';
        case 'Publishing': case 'Ready': return 'info';
        case 'Planned': return 'violet';
        default: return '';
    }
}

export function accountStateTone(state: AccountSummary['State']): string {
    return state === 'ok' ? 'ok' : state === 'error' ? 'bad' : state === 'attention' || state === 'connect' ? 'warn' : state === 'paused' ? 'violet' : '';
}

export function connectionTone(state: ConnectionState): string {
    return state === 'Healthy' ? 'ok' : state === 'AwaitingConnection' ? 'warn' : 'bad';
}

export function fmtPercent(value: number | null | undefined, digits = 1): string {
    return value === null || value === undefined || Number.isNaN(value) ? '—' : `${value.toFixed(digits)}%`;
}

export function fmtSeconds(ms: number | null | undefined): string {
    if (ms === null || ms === undefined) return '—';
    const s = ms / 1000;
    return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
}

/** The kind (Video/Photo) a thumbnail placeholder should show for a post. */
export const thumbKind = (p: { IsVideo: boolean; Format: PostFormat }) => (p.Format === 'Carousel' ? 'Photo' : p.IsVideo ? 'Video' : 'Photo');
