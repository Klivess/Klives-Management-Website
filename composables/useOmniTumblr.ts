import { computed, onBeforeUnmount, onMounted } from 'vue';
import Swal from 'sweetalert2';
import { useCookie, useState } from '#imports';
import { KliveAPIUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

// ─────────────────────────────── Dialogs ───────────────────────────────

const SWAL_BASE = { background: '#191d16', color: '#e9f1e5', confirmButtonColor: '#4c9e38', cancelButtonColor: '#3a4136' } as const;

export async function confirmAction(title: string, text: string, confirmText = 'Confirm', danger = false): Promise<boolean> {
    const result = await Swal.fire({
        ...SWAL_BASE,
        title,
        text,
        icon: danger ? 'warning' : 'question',
        showCancelButton: true,
        confirmButtonText: confirmText,
        confirmButtonColor: danger ? '#c94b4b' : SWAL_BASE.confirmButtonColor,
        focusCancel: danger,
    });
    return result.isConfirmed;
}

export function notify(title: string, text = '', icon: 'success' | 'error' | 'info' | 'warning' = 'success') {
    void Swal.fire({ ...SWAL_BASE, title, text, icon, timer: icon === 'success' ? 2200 : undefined, showConfirmButton: icon !== 'success' });
}

// ─────────────────────────────── API types (mirror the C# DTOs) ───────────────────────────────

export type PostStatus = 'Draft' | 'Planned' | 'Ready' | 'AwaitingApproval' | 'Publishing' | 'Published' | 'Failed' | 'Cancelled' | 'Skipped' | 'Removed';
export type PostKind = 'Video' | 'Photo' | 'Text' | 'Link';
export type CaptionMode = 'None' | 'Fixed' | 'Rotate' | 'AI' | 'Original';
export type ContentSourceKind = 'None' | 'MemeScraper' | 'Folder' | 'Library';
export type ContentPick = 'Best' | 'Newest' | 'Random' | 'Oldest';
export type AuthMode = 'OAuth1' | 'OAuth2';
export type TumblrPostState = 'Published' | 'Draft' | 'Private';

export interface PostSummary {
    PostId: string;
    BlogId: string;
    BlogName: string | null;
    Status: PostStatus;
    Origin: 'Autopilot' | 'Manual' | 'Imported';
    Kind: PostKind;
    ScheduledUtc: string;
    SlotUtc: string | null;
    PublishedUtc: string | null;
    NextAttemptUtc: string | null;
    Caption: string | null;
    Title: string | null;
    LinkUrl: string | null;
    Tags: string[];
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
    BlockedReason: string | null;
    LastError: string | null;
    LastErrorCode: string | null;
    Attempts: number;
    TumblrUrl: string | null;
    TumblrPostId: string | null;
    Notes: number;
    Likes: number | null;
    Reblogs: number | null;
    Replies: number | null;
    NotesAt24h: number | null;
    NotesAt7d: number | null;
    MetricsSyncedUtc: string | null;
    ContentSource: ContentSourceKind | null;
    ContentOrigin: string | null;
    ContentUrl: string | null;
    OriginalCaption: string | null;
    ContentViews: number | null;
    TumblrState: TumblrPostState;
}

export interface BlogSummary {
    BlogId: string;
    Name: string;
    Title: string | null;
    Url: string | null;
    AvatarUrl: string;
    Autopilot: boolean;
    Paused: boolean;
    RequireApproval: boolean;
    ConnectionId: string;
    ConnectionUser: string | null;
    ConnectionHealth: string;
    Followers: number | null;
    FollowersDelta7d: number | null;
    FollowersSpark: number[];
    Posts: number | null;
    LastPublishedUtc: string | null;
    NextPost: PostSummary | null;
    LastPost: PostSummary | null;
    Pending: number;
    AwaitingApproval: number;
    Published7d: number;
    Failed7d: number;
    Notes30d: number;
    AvgNotes30d: number | null;
    SlotsPerWeek: number;
    Source: ContentSourceKind;
    CaptionMode: CaptionMode;
    TimeZone: string;
    LastError: string | null;
    LastErrorUtc: string | null;
    ConsecutiveFailures: number;
    ContentWarning: string | null;
    State: 'ok' | 'attention' | 'error' | 'paused' | 'idle';
    StateReason: string;
}

export interface AttentionItem {
    Level: 'error' | 'warning' | 'info';
    Title: string;
    Detail: string;
    BlogId: string | null;
    ConnectionId: string | null;
    Action: 'settings' | 'reconnect' | 'strategy' | 'queue' | 'add-blog' | null;
}

export interface SeriesPoint { T: string; V: number }

export interface FleetKpis {
    Followers: number;
    FollowersDelta7d: number | null;
    FollowersDelta30d: number | null;
    FollowersSeries: SeriesPoint[];
    Published7d: number;
    PublishedPrev7d: number;
    Notes30d: number;
    AvgNotes30d: number | null;
    Pending: number;
    AwaitingApproval: number;
    Failed7d: number;
    SuccessRate30d: number | null;
    NextPostUtc: string | null;
    NextPostBlog: string | null;
    AutopilotBlogs: number;
    Blogs: number;
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

export interface EngineStatus {
    Enabled: boolean;
    Running: boolean;
    PublishingEnabled: boolean;
    StartupState: string;
    StartedUtc: string;
    Loops: EngineLoop[];
    Api: {
        CallsThisHour: number;
        CallsToday: number;
        HourlyLimit: number;
        DailyLimit: number;
        PerHourRemaining: number | null;
        PerDayRemaining: number | null;
        HeadersObservedUtc: string | null;
        ByEndpointToday: Record<string, number>;
    };
    MemeScraperReady: boolean;
    AiAvailable: boolean;
    Migration: string | null;
    SyncErrors: { Job: string; Error: string }[] | null;
}

export interface AppConfig {
    Configured: boolean;
    KeyHint: string | null;
    CallbackUrl: string;
    AuthMode: AuthMode;
    VerifiedUtc: string | null;
    LastVerifyError: string | null;
    UpdatedUtc: string | null;
}

export interface ConnectionBlog {
    Name: string;
    Uuid: string | null;
    Title: string | null;
    Url: string | null;
    Followers: number | null;
    Primary: boolean;
    Type: string | null;
    AvatarUrl: string;
    Managed: boolean;
    ManagedBlogId: string | null;
}

export interface Connection {
    ConnectionId: string;
    UserName: string | null;
    AuthMode: AuthMode;
    Health: 'Unknown' | 'Healthy' | 'NeedsReauth' | 'Error';
    HealthDetail: string | null;
    HealthChangedUtc: string | null;
    LastVerifiedUtc: string | null;
    CreatedUtc: string;
    AccessTokenExpiresUtc: string | null;
    LimitsFetchedUtc: string | null;
    Limits: { Key: string; Description: string | null; Limit: number; Remaining: number; ResetUtc: string | null }[];
    Blogs: ConnectionBlog[];
    ManagedBlogs: number;
}

export interface OmniEvent {
    Utc: string;
    Level: 'Info' | 'Success' | 'Warning' | 'Error';
    Kind: string;
    Message: string;
    BlogId: string | null;
    PostId: string | null;
    BlogName: string | null;
}

export interface Overview {
    NowUtc: string;
    Engine: EngineStatus;
    App: AppConfig;
    Connections: Connection[];
    Kpis: FleetKpis;
    Blogs: BlogSummary[];
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
    SuggestTags: boolean;
    MaxSuggestedTags: number;
    AllowEmoji: boolean;
    Language: string;
    Fallback: 'Empty' | 'Fixed' | 'Hold';
    Model: string | null;
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
        AllowReuseAcrossBlogs: boolean;
    };
    Folder: { Path: string; IncludeSubfolders: boolean; Images: boolean; Videos: boolean; Pick: ContentPick };
    CaptionMode: CaptionMode;
    FixedCaption: string;
    CaptionPool: string[];
    Ai: AiCaptionSettings;
    FixedTags: string[];
    RotatingTags: string[];
    RotatingTagsPerPost: number;
    MaxTags: number;
    PostState: TumblrPostState;
    CreditSource: boolean;
}

export interface ContentPreview {
    Key: string;
    Source: ContentSourceKind;
    Kind: PostKind;
    Origin: string | null;
    OriginalUrl: string | null;
    Views: number | null;
    Likes: number | null;
    CreatedUtc: string | null;
    OriginalCaption: string | null;
    DurationSeconds: number | null;
    FileName: string;
}

export interface ActivityItem {
    Id: string;
    Type: string;
    Utc: string;
    FromBlog: string | null;
    TargetPostId: string | null;
    Text: string | null;
}

export interface BlogDetail {
    NowUtc: string;
    Summary: BlogSummary;
    Blog: {
        BlogId: string;
        Name: string;
        Uuid: string | null;
        Title: string | null;
        Description: string | null;
        Url: string | null;
        ConnectionId: string;
        Autopilot: boolean;
        Paused: boolean;
        RequireApproval: boolean;
        Notes: string | null;
        AddedUtc: string;
        Stats: { Followers: number | null; Posts: number | null; Likes: number | null; InfoSyncedUtc: string | null; FollowersSyncedUtc: string | null; PostsIndexSyncedUtc: string | null; ActivitySyncedUtc: string | null; LastPublishedUtc: string | null };
        Health: { LastError: string | null; LastErrorUtc: string | null; ConsecutiveFailures: number; LastSuccessUtc: string | null; ContentWarning: string | null; ContentWarningUtc: string | null };
        Strategy: Strategy;
        UsedContentCount: number;
        RejectedContentCount: number;
    };
    Connection: Connection | null;
    Pending: PostSummary[];
    History: PostSummary[];
    Events: OmniEvent[];
    Activity: ActivityItem[];
    Runway: { Eligible?: number; SlotsPerWeek?: number; WeeksOfContent?: number | null; Next?: ContentPreview[]; Source?: ContentSourceKind; Error?: string };
}

export interface Analytics {
    BlogId: string | null;
    Days: number;
    FromUtc: string;
    ToUtc: string;
    TimeZone: string;
    Followers: number | null;
    FollowersDelta: number | null;
    FollowersGrowthPerWeek: number | null;
    PostsPublished: number;
    PostsPublishedPrev: number;
    Notes: number;
    NotesPrev: number;
    AvgNotes: number | null;
    MedianNotes: number | null;
    EngagementRate: number | null;
    Likes: number | null;
    Reblogs: number | null;
    Replies: number | null;
    FollowersSeries: SeriesPoint[];
    Posting: { Day: string; Ours: number; Others: number; Notes: number }[];
    Activity: { Day: string; Likes: number; Reblogs: number; Replies: number; Follows: number; Other: number }[];
    Heatmap: { Dow: number; Hour: number; Posts: number; AvgNotes: number }[];
    BestSlotLabel: string | null;
    TopPosts: { Id: string; BlogId: string | null; BlogName: string | null; OmniPostId: string | null; Url: string | null; Summary: string | null; Type: string | null; Notes: number; PublishedUtc: string; Ours: boolean; HasThumbnail: boolean }[];
    Tags: Ranked[];
    Sources: Ranked[];
    CaptionModes: Ranked[];
    Kinds: Ranked[];
    SampleSize: number;
}

export interface Ranked { Key: string; Posts: number; AvgNotes: number; TotalNotes: number }

export interface PostDetail {
    Post: PostSummary;
    Media: { Index: number; MimeType: string; Bytes: number; Width: number | null; Height: number | null; DurationSeconds: number | null; HasThumbnail: boolean; Exists: boolean; FileName: string }[];
    AttemptLog: { Utc: string; Ok: boolean; Code: string | null; Message: string | null; DurationMs: number }[];
    MetricsHistory: { Utc: string; Notes: number; Likes: number | null; Reblogs: number | null }[];
    CaptionInfo: { Mode: CaptionMode; Model: string | null; UsedVision: boolean; GeneratedUtc: string | null; Edited: boolean; Error: string | null; Failures: number; AltText: string | null; SuggestedTags: string[]; Direction: string | null };
    Content: { Kind: ContentSourceKind; Key: string; Origin: string | null; OriginalCaption: string | null; OriginalUrl: string | null; Views: number | null; Likes: number | null; CreatedUtc: string | null } | null;
    Slug: string | null;
    Deferrals: number;
    NeedsReconcile: boolean;
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

export async function tumblrGet<T>(path: string, signal?: AbortSignal): Promise<ApiResult<T>> {
    const response = await RequestGETFromKliveAPI(path, false, false, {}, signal);
    return readResult<T>(response);
}

/** POSTs a JSON body (stringified — passing a plain object to fetch sends "[object Object]"). */
export async function tumblrPost<T>(path: string, body: unknown = {}, signal?: AbortSignal): Promise<ApiResult<T>> {
    const response = await RequestPOSTFromKliveAPI(path, JSON.stringify(body ?? {}), false, true, signal);
    return readResult<T>(response);
}

export function q(params: Record<string, string | number | null | undefined>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== null && value !== undefined && value !== '') search.set(key, String(value));
    }
    const s = search.toString();
    return s ? `?${s}` : '';
}

// ─────────────────────────────── Media (authenticated blobs) ───────────────────────────────

const mediaCache = new Map<string, Promise<string | null>>();
const MEDIA_CACHE_LIMIT = 240;

/**
 * Media routes need the Authorization header, which an <img src> cannot send, so previews are
 * fetched as blobs and shown through object URLs (cached, oldest revoked past the limit).
 */
export function loadMediaUrl(path: string): Promise<string | null> {
    const cached = mediaCache.get(path);
    if (cached) return cached;
    const promise = (async () => {
        try {
            const response = await RequestGETFromKliveAPI(path, false, false);
            if (!response.ok) return null;
            const blob = await response.blob();
            return URL.createObjectURL(blob);
        } catch {
            return null;
        }
    })();
    mediaCache.set(path, promise);
    promise.then(url => { if (!url) mediaCache.delete(path); });
    if (mediaCache.size > MEDIA_CACHE_LIMIT) {
        const oldest = mediaCache.keys().next().value as string;
        const stale = mediaCache.get(oldest);
        mediaCache.delete(oldest);
        stale?.then(url => { if (url) URL.revokeObjectURL(url); });
    }
    return promise;
}

export function forgetMedia(prefix: string) {
    for (const key of [...mediaCache.keys()]) {
        if (key.includes(prefix)) {
            const stale = mediaCache.get(key);
            mediaCache.delete(key);
            stale?.then(url => { if (url) URL.revokeObjectURL(url); });
        }
    }
}

export const postThumbPath = (postId: string, index = 0) => `/omnitumblr/media${q({ postId, index, variant: 'thumb' })}`;
export const postMediaPath = (postId: string, index = 0) => `/omnitumblr/media${q({ postId, index, variant: 'full' })}`;
export const contentThumbPath = (blogId: string, key: string) => `/omnitumblr/content/thumb${q({ blogId, key })}`;

export interface UploadResult {
    MediaId: string | null;
    FileName: string;
    OriginalName: string;
    Kind: 'Video' | 'Photo';
    MimeType: string;
    Bytes: number;
    Purpose: 'compose' | 'library';
    BlogId: string | null;
}

/** The login cookie, read directly (event handlers run outside the Nuxt context useCookie needs). */
function readPasswordCookie(): string {
    try {
        const match = document.cookie.match(/(?:^|; )password=([^;]*)/);
        if (match) return decodeURIComponent(match[1]);
    } catch { /* not in a browser */ }
    try { return useCookie<string | null>('password').value || ''; } catch { return ''; }
}

/** Streams a file to OmniTumblr with progress (XHR: fetch has no upload progress). */
export function uploadMedia(file: File, purpose: 'compose' | 'library', blogId: string | null, onProgress?: (percent: number) => void): { promise: Promise<UploadResult>; abort: () => void } {
    const xhr = new XMLHttpRequest();
    const promise = new Promise<UploadResult>((resolve, reject) => {
        const password = readPasswordCookie();
        xhr.open('POST', `${KliveAPIUrl}/omnitumblr/media/upload${q({ fileName: file.name, purpose, blogId })}`, true);
        xhr.setRequestHeader('Authorization', password);
        xhr.setRequestHeader('X-Klive-Client', 'website');
        xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
        xhr.onload = () => {
            let body: any = null;
            try { body = JSON.parse(xhr.responseText); } catch { body = xhr.responseText; }
            if (xhr.status >= 200 && xhr.status < 300) resolve(body as UploadResult);
            else reject(new Error(typeof body === 'object' && body?.error ? body.error : (xhr.responseText || `Upload failed (${xhr.status})`)));
        };
        xhr.onerror = () => reject(new Error('Network error while uploading.'));
        xhr.onabort = () => reject(new Error('Upload cancelled.'));
        xhr.send(file);
    });
    return { promise, abort: () => xhr.abort() };
}

// ─────────────────────────────── Shared overview state ───────────────────────────────

/**
 * One overview fetch shared by the shell (nav, engine status) and the overview page, so pages
 * never double-poll the same route.
 */
export function useTumblrOverview() {
    const overview = useState<Overview | null>('omnitumblr:overview', () => null);
    const error = useState<string | null>('omnitumblr:overview-error', () => null);
    const loading = useState<boolean>('omnitumblr:overview-loading', () => false);
    const loadedAt = useState<number | null>('omnitumblr:overview-at', () => null);

    async function refresh() {
        if (loading.value) return;
        loading.value = true;
        try {
            const result = await tumblrGet<Overview>('/omnitumblr/overview');
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

/** Runs fn now and every intervalMs while the tab is visible. */
export function usePoll(fn: () => unknown | Promise<unknown>, intervalMs: number) {
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = () => { if (typeof document === 'undefined' || document.visibilityState === 'visible') void fn(); };
    const onVisible = () => { if (document.visibilityState === 'visible') void fn(); };
    onMounted(() => {
        void fn();
        timer = setInterval(tick, intervalMs);
        document.addEventListener('visibilitychange', onVisible);
    });
    onBeforeUnmount(() => {
        if (timer) clearInterval(timer);
        document.removeEventListener('visibilitychange', onVisible);
    });
}

// ─────────────────────────────── Formatting ───────────────────────────────

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Monday-first display order of .NET DayOfWeek values. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const compactCount = new Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 3 });

/** 151.7, 1.25k, 12.8k, 128k, 1.28M: three significant digits once compacted. */
export function fmtCount(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    if (Math.abs(value) < 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
    return compactCount.format(value).replace('K', 'k');
}

export function fmtSignedCount(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    return `${value > 0 ? '+' : value < 0 ? '−' : '±'}${fmtCount(Math.abs(value))}`;
}

export function fmtRelative(iso: string | null | undefined, now = Date.now()): string {
    if (!iso) return '—';
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return '—';
    const diff = t - now;
    const abs = Math.abs(diff);
    const unit = abs < 45_000 ? null
        : abs < 3_600_000 ? `${Math.round(abs / 60_000)} min`
        : abs < 48 * 3_600_000 ? `${Math.round(abs / 3_600_000)} h`
        : `${Math.round(abs / 86_400_000)} d`;
    if (!unit) return diff >= 0 ? 'now' : 'just now';
    return diff >= 0 ? `in ${unit}` : `${unit} ago`;
}

export function fmtWhen(iso: string | null | undefined, timeZone?: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    try {
        return d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone });
    } catch {
        return d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
}

export function fmtDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtClipLength(seconds: number | null | undefined): string {
    if (seconds === null || seconds === undefined) return '';
    const s = Math.round(seconds);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtBytes(bytes: number | null | undefined): string {
    if (!bytes) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let v = bytes;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function minuteToHHMM(minute: number): string {
    const m = Math.max(0, Math.min(1439, Math.round(minute)));
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function hhmmToMinute(value: string): number | null {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!match) return null;
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (h > 23 || m > 59) return null;
    return h * 60 + m;
}

/** ISO (UTC) → value for <input type="datetime-local"> in the browser's zone. */
export function toLocalInput(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

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

export function statusTone(status: PostStatus): string {
    switch (status) {
        case 'Published': return 'ok';
        case 'Failed': return 'bad';
        case 'AwaitingApproval': return 'warn';
        case 'Publishing': return 'info';
        case 'Ready': return 'info';
        case 'Planned': return 'violet';
        default: return '';
    }
}

export function blogStateTone(state: BlogSummary['State']): string {
    return state === 'ok' ? 'ok' : state === 'error' ? 'bad' : state === 'attention' ? 'warn' : state === 'paused' ? 'violet' : '';
}

export function levelTone(level: OmniEvent['Level'] | AttentionItem['Level']): string {
    switch (level) {
        case 'Success': return 'ok';
        case 'Error': case 'error': return 'bad';
        case 'Warning': case 'warning': return 'warn';
        default: return 'info';
    }
}

export const ACTIVITY_LABEL: Record<string, string> = {
    like: 'liked',
    reblog_naked: 'reblogged',
    reblog_with_content: 'reblogged with a comment',
    reply: 'replied',
    conversational_note: 'commented',
    follow: 'followed the blog',
    mention_in_reply: 'mentioned the blog in a reply',
    mention_in_post: 'mentioned the blog in a post',
    ask: 'sent an ask',
    answered_ask: 'answered an ask',
    post_attribution: 'used a post',
    post_flagged: 'flagged a post',
};

export function activityGlyph(type: string): string {
    if (type === 'like') return '♥';
    if (type.startsWith('reblog')) return '⟳';
    if (type === 'follow') return '+';
    if (type === 'reply' || type === 'conversational_note') return '✎';
    if (type === 'post_flagged') return '⚑';
    return '•';
}

export function useNow(intervalMs = 30_000) {
    const now = useState<number>('omnitumblr:now', () => Date.now());
    let timer: ReturnType<typeof setInterval> | null = null;
    onMounted(() => { now.value = Date.now(); timer = setInterval(() => { now.value = Date.now(); }, intervalMs); });
    onBeforeUnmount(() => { if (timer) clearInterval(timer); });
    return computed(() => now.value);
}

export function browserTimeZone(): string {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

export function timeZoneOptions(): string[] {
    try {
        const list = (Intl as any).supportedValuesOf?.('timeZone') as string[] | undefined;
        if (list?.length) return ['UTC', ...list.filter(z => z !== 'UTC')];
    } catch { /* older browsers */ }
    return ['UTC', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Asia/Tokyo', 'Australia/Sydney'];
}

export function cloneDeep<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}
