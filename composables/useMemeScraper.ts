import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Swal from 'sweetalert2';
import { useState } from '#imports';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import { browserTimeZone, confirmAction, fmtCount, q, tumblrGet, tumblrPost, type ApiResult } from '~/composables/useOmniTumblr';

// Formatting and dialogs come from useOmniTumblr (one implementation, one look); import them from there.

/** JSON GET/POST with the server's `{ error }` envelope read into `ApiResult.error`. */
export const msGet = <T>(path: string, signal?: AbortSignal): Promise<ApiResult<T>> => tumblrGet<T>(path, signal);
export const msPost = <T>(path: string, body: unknown = {}, signal?: AbortSignal): Promise<ApiResult<T>> => tumblrPost<T>(path, body, signal);

// ─────────────────────────────── API types (mirror MemeScraperInsights.cs) ───────────────────────────────

export type Granularity = 'day' | 'week' | 'month';
export type SourceState = 'ok' | 'quiet' | 'idle' | 'warn' | 'bad' | 'paused' | 'removed';
export type InsightLevel = 'bad' | 'warn' | 'good' | 'info';

export interface RangeView {
    From: string;
    To: string;
    Days: number;
    FromUtc: string;
    ToUtc: string;
    AllTime: boolean;
    HasBaseline: boolean;
    PrevFrom: string | null;
    PrevTo: string | null;
    Granularity: Granularity;
    TimeZone: string;
    Today: string;
}

export interface BucketView {
    Key: string;
    From: string;
    To: string;
    Days: number;
    Incomplete: boolean;
    Downloads: number;
    Views: number;
    Cumulative: number;
    Previous: number | null;
    Stack: number[];
    Scrapes: number;
    ScrapeFailures: number;
    NewReelsSeen: number;
}

export interface KpiView {
    Downloaded: number;
    DownloadedPrev: number | null;
    PerDay: number;
    PerDayPrev: number | null;
    ActiveSources: number;
    ActiveSourcesPrev: number | null;
    SourcesInScope: number;
    ReelSources: number;
    TotalViews: number;
    AvgViews: number | null;
    MedianViews: number | null;
    MedianViewsPrev: number | null;
    AvgLikes: number | null;
    AvgComments: number | null;
    MedianEngagementPct: number | null;
    MedianEngagementPctPrev: number | null;
    MedianAgeHours: number | null;
    MedianAgeHoursPrev: number | null;
    ViralReels: number;
    Scrapes: number;
    ScrapesPrev: number | null;
    ScrapeFailures: number;
    SuccessRate: number | null;
    SuccessRatePrev: number | null;
    MedianScrapeSeconds: number | null;
    DownloadFailures: number;
    LibraryAtStart: number;
    LibraryAtEnd: number;
    ZeroDays: number;
    LongestGapDays: number;
    LongestGapFrom: string | null;
    LongestGapTo: string | null;
    BestDay: string | null;
    BestDayCount: number;
}

export interface SourceRow {
    Username: string;
    AccountID: string | null;
    FullName: string | null;
    ProfilePictureUrl: string | null;
    Bio: string | null;
    Followers: number | null;
    Registered: boolean;
    DownloadReels: boolean;
    DownloadPosts: boolean;
    Niches: string[];
    TopHashtags: { Hashtag: string; Count: number }[];
    AddedUtc: string | null;
    ProfileUpdatedUtc: string | null;
    Downloaded: number;
    DownloadedPrev: number | null;
    Share: number;
    TotalReels: number;
    AvgViews: number | null;
    MedianViews: number | null;
    TopViews: number | null;
    MedianAgeHours: number | null;
    MedianEngagementPct: number | null;
    FirstDownloadUtc: string | null;
    LastDownloadUtc: string | null;
    Spark: number[];
    Scrapes: number;
    ScrapeFailures: number;
    AvgNewPerScrape: number | null;
    NextScrapeDueUtc: string | null;
    LastScrapeAttemptUtc: string | null;
    LastSuccessfulScrapeUtc: string | null;
    ConsecutiveScrapeFailures: number;
    LastScrapeError: string | null;
    LastScrapeSummary: string | null;
    LastScrapeReelsFound: number;
    LastScrapeReelsDownloaded: number;
    LastScrapeDownloadFailures: number;
    State: SourceState;
    StateReason: string;
}

export interface NicheRow { Name: string; Sources: number; Downloaded: number; DownloadedPrev: number | null; Share: number; AvgViews: number | null; MedianViews: number | null }
export interface DistributionBucket { Label: string; Count: number; Share: number; AvgViews: number | null }
export interface HeatCell { Dow: number; Hour: number; Reels: number; AvgViews: number }
export interface NamedCount { Name: string; Count: number }
export interface Insight { Level: InsightLevel; Title: string; Detail: string; Sources: string[] }
export interface FilterOptions { Sources: string[]; Niches: string[] }

export interface ReelRow {
    PostID: string;
    ShortCode: string | null;
    Owner: string;
    Registered: boolean;
    Niches: string[];
    Views: number;
    Likes: number;
    Comments: number;
    EngagementPct: number | null;
    PostedUtc: string | null;
    DownloadedUtc: string | null;
    AgeHours: number | null;
    Description: string | null;
    Url: string | null;
    Via: string | null;
    VideoExists: boolean | null;
    Bytes: number | null;
}

export interface LibraryView {
    TotalReels: number;
    MatchingReels: number;
    Sources: number;
    ReelSources: number;
    PausedSources: number;
    FailingSources: number;
    Niches: number;
    FirstDownloadUtc: string | null;
    LastDownloadUtc: string | null;
}

export interface DashboardView {
    GeneratedUtc: string;
    Range: RangeView;
    FilterSources: string[];
    FilterNiche: string | null;
    Options: FilterOptions;
    Library: LibraryView;
    Kpis: KpiView;
    StackKeys: string[];
    Series: BucketView[];
    Sources: SourceRow[];
    Niches: NicheRow[];
    ViewsDistribution: DistributionBucket[];
    AgeDistribution: DistributionBucket[];
    Heatmap: HeatCell[];
    BusiestSlot: string | null;
    BestViewsSlot: string | null;
    DiscoveredVia: NamedCount[];
    ScrapeProviders: NamedCount[];
    TopReels: ReelRow[];
    Insights: Insight[];
}

export interface ReelPage {
    Total: number;
    Filtered: number;
    Offset: number;
    Limit: number;
    Sort: string;
    Descending: boolean;
    Range: RangeView;
    Options: FilterOptions;
    Rows: ReelRow[];
}

export interface ReelDetail {
    Reel: ReelRow;
    OwnerReels: number;
    OwnerRank: number;
    OwnerMedianViews: number | null;
    Thumbnail: boolean;
}

export interface ScrapeRow {
    Username: string;
    AccountID: string | null;
    Trigger: string;
    StartedUtc: string;
    FinishedUtc: string | null;
    DurationMs: number | null;
    ReelsFound: number;
    NewReels: number;
    Downloaded: number;
    DownloadFailures: number;
    Error: string | null;
    ProviderSummary: string | null;
    SucceededVia: string | null;
    Notes: string[];
    Status: 'ok' | 'partial' | 'failed';
}

export interface ScrapeStats {
    Scrapes: number;
    Failed: number;
    Partial: number;
    SuccessRate: number | null;
    MedianSeconds: number | null;
    ReelsSeen: number;
    NewReels: number;
    Downloaded: number;
    DownloadFailures: number;
}

export interface ScrapePage {
    Total: number;
    Filtered: number;
    Offset: number;
    Limit: number;
    Range: RangeView;
    Options: FilterOptions;
    Stats: ScrapeStats;
    Rows: ScrapeRow[];
}

export interface ProviderHealth {
    Name: string;
    ConsecutiveFailures: number;
    TotalSuccesses: number;
    TotalFailures: number;
    LastSuccess: string | null;
    LastFailure: string | null;
    LastError: string | null;
    BenchedUntil: string | null;
}

export interface ProviderCheckResult {
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

export interface ProviderCheckRun {
    Username: string;
    RequestedBy: string;
    State: 'queued' | 'running' | 'complete';
    QueuedUtc: string;
    StartedUtc: string | null;
    FinishedUtc: string | null;
    Results: ProviderCheckResult[];
}

export interface ProfileRefreshRun {
    Username: string;
    AccountID: string;
    RequestedBy: string;
    State: 'queued' | 'running' | 'complete' | 'failed';
    QueuedUtc: string;
    FinishedUtc: string | null;
    Error: string | null;
    FollowersBefore: number | null;
    FollowersAfter: number | null;
}

export interface DiskUsage { Bytes: number; Files: number; MissingVideos: number; OrphanFiles: number; ThumbnailBytes: number; MeasuredUtc: string; DurationMs: number }
export interface ScraperSettings { Paused: boolean; IntervalHours: number; MaxPagesPerScrape: number; ReadUtc?: string | null; OnServer?: boolean }

export interface HealthSource {
    Username: string;
    AccountID: string;
    DownloadReels: boolean;
    NextScrapeDueUtc: string | null;
    LastScrapeAttemptUtc: string | null;
    LastSuccessfulScrapeUtc: string | null;
    ConsecutiveScrapeFailures: number;
    LastScrapeError: string | null;
    LastScrapeSummary: string | null;
    LastScrapeReelsFound: number;
    LastScrapeReelsDownloaded: number;
    LastScrapeDownloadFailures: number;
    TotalReelsDownloaded: number;
}

export interface RawScrapeReport {
    Username: string;
    AccountID?: string;
    Trigger: string;
    StartedUtc: string;
    FinishedUtc: string | null;
    ProviderSummary: string | null;
    SucceededVia?: string | null;
    ReelsFound: number;
    NewReels: number;
    Downloaded: number;
    DownloadFailures: number;
    Error: string | null;
    Notes: string[];
}

export interface ScraperHealth {
    GeneratedUtc: string;
    DataLoaded: boolean;
    OnServer: boolean;
    SchedulerState: string;
    LastSchedulerTickUtc: string | null;
    NextScrapeDueUtc: string | null;
    CurrentScrape: string | null;
    ReelsOnDisk: number;
    Providers: ProviderHealth[];
    FailingSources: number;
    Sources: HealthSource[];
    RecentScrapes: RawScrapeReport[];
    ScrapeHistoryCount?: number;
    ProviderCheck: ProviderCheckRun | null;
    ProfileRefresh?: ProfileRefreshRun | null;
    ScrapeIntervalHours: number;
    Settings?: ScraperSettings | null;
    ScrapeQueued: number;
    Disk?: DiskUsage | null;
}

// ─────────────────────────────── Time ───────────────────────────────

/** The server stamps UTC; tolerate a missing zone suffix and .NET's DateTime.MinValue. */
export function parseUtc(value?: string | null): Date | null {
    if (!value || value.startsWith('0001-01-01')) return null;
    const date = new Date(/([zZ]|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`);
    return Number.isNaN(date.getTime()) ? null : date;
}

/** "in 3 h", "12 min ago", "just now", "never". */
export function fmtRel(value: string | null | undefined, now = Date.now(), never = 'never'): string {
    const date = parseUtc(value);
    if (!date) return never;
    const diff = date.getTime() - now;
    const abs = Math.abs(diff);
    if (abs < 45_000) return diff > 0 ? 'any moment' : 'just now';
    const minutes = Math.round(abs / 60_000);
    const text = minutes < 60 ? `${minutes} min`
        : minutes < 48 * 60 ? `${Math.round(minutes / 60)} h`
        : `${Math.round(minutes / 1440)} d`;
    return diff > 0 ? `in ${text}` : `${text} ago`;
}

/**
 * A due time: "in 3 h" ahead, "due now" just past, "overdue 21 h" once the scheduler (which polls
 * every 5 min) should clearly have run it.
 */
export function fmtDue(value: string | null | undefined, now = Date.now(), never = '—'): string {
    const date = parseUtc(value);
    if (!date) return never;
    const late = now - date.getTime();
    if (late <= 0) return fmtRel(value, now, never);
    if (late < 15 * 60_000) return 'due now';
    return `overdue ${fmtRel(value, now).replace(/ ago$/, '')}`;
}

/** A local calendar day key (yyyy-MM-dd) shown as "5 Oct" or "5 Oct 2025". */
export function fmtDayKey(key: string | null | undefined, withYear = false): string {
    if (!key) return '—';
    const d = new Date(`${key.slice(0, 10)}T12:00:00`);
    if (Number.isNaN(d.getTime())) return key;
    return d.toLocaleDateString(undefined, withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
}

export function fmtDayRange(from: string, to: string): string {
    if (from === to) return fmtDayKey(from, true);
    const sameYear = from.slice(0, 4) === to.slice(0, 4);
    return `${fmtDayKey(from, !sameYear)} – ${fmtDayKey(to, true)}`;
}

export function fmtStamp(value: string | null | undefined): string {
    const d = parseUtc(value);
    return d ? d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
}

/** Hours as "40 min", "5.5 h", "2.3 days". */
export function fmtHours(hours: number | null | undefined): string {
    if (hours === null || hours === undefined || Number.isNaN(hours)) return '—';
    if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
    if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)} h`;
    return `${(hours / 24).toFixed(hours < 240 ? 1 : 0)} days`;
}

export function fmtRunTime(seconds: number | null | undefined): string {
    if (seconds === null || seconds === undefined) return '—';
    if (seconds < 90) return `${Math.round(seconds)} s`;
    return `${(seconds / 60).toFixed(seconds < 600 ? 1 : 0)} min`;
}

export function fmtRate(value: number | null | undefined, digits = 0): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return `${value.toFixed(digits)}%`;
}

export function todayKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Shared clock for relative times (one interval for every component). */
export function useMemeNow(intervalMs = 30_000) {
    const now = useState<number>('memescraper:now', () => Date.now());
    let timer: ReturnType<typeof setInterval> | null = null;
    onMounted(() => { now.value = Date.now(); timer = setInterval(() => { now.value = Date.now(); }, intervalMs); });
    onBeforeUnmount(() => { if (timer) clearInterval(timer); });
    return computed(() => now.value);
}

// ─────────────────────────────── Comparisons ───────────────────────────────

export interface Comparison { absolute: number; percent: number | null; direction: number }

export function compare(current: number | null | undefined, previous: number | null | undefined): Comparison | null {
    if (current === null || current === undefined || previous === null || previous === undefined) return null;
    const absolute = current - previous;
    const percent = previous !== 0 ? (absolute / Math.abs(previous)) * 100 : null;
    // Under half a percent is no change worth an arrow or a colour.
    const direction = percent !== null && Math.abs(percent) < 0.5 ? 0 : Math.sign(absolute);
    return { absolute, percent, direction };
}

export const countChange = (v: { absolute: number; percent: number | null }) =>
    `${v.absolute > 0 ? '+' : v.absolute < 0 ? '−' : '±'}${fmtCount(Math.abs(v.absolute))}${v.percent !== null ? ` (${v.percent >= 0 ? '+' : ''}${v.percent.toFixed(0)}%)` : ''}`;

export const pctChange = (v: { percent: number | null }) =>
    v.percent === null ? 'new' : Math.abs(v.percent) < 0.5 ? '±0%' : `${v.percent > 0 ? '+' : ''}${v.percent.toFixed(0)}%`;

export const pointChange = (v: { absolute: number }) => `${v.absolute >= 0 ? '+' : ''}${v.absolute.toFixed(1)} pts`;

// ─────────────────────────────── Tones & labels ───────────────────────────────

export const STATE_LABEL: Record<SourceState, string> = {
    ok: 'Healthy', quiet: 'Quiet', idle: 'Not scraped yet', warn: 'Needs a look', bad: 'Failing', paused: 'Paused', removed: 'Removed',
};

export function stateTone(state: SourceState): string {
    switch (state) {
        case 'ok': return 'ok';
        case 'bad': return 'bad';
        case 'warn': return 'warn';
        case 'quiet': return 'info';
        case 'paused': return 'violet';
        default: return '';
    }
}

export function insightGlyph(level: InsightLevel): string {
    return level === 'bad' ? '✕' : level === 'warn' ? '!' : level === 'good' ? '↑' : 'i';
}

export const PROVIDER_LABEL: Record<string, string> = {
    inflact: 'inflact.com',
    instagram: 'Instagram (direct)',
    'inflact+instagram': 'Both',
    unknown: 'Unknown',
};
export const providerLabel = (name: string) => PROVIDER_LABEL[name] ?? name;

export const PROVIDER_ROLE: Record<string, string> = {
    inflact: 'Primary · full reel history through inflact’s API',
    instagram: 'Fallback · newest ~12 reels straight from Instagram; also refreshes expired video links',
};

export function formatTrigger(trigger: string): string {
    if (trigger === 'schedule') return 'Scheduled';
    if (trigger?.startsWith('manual:')) return `Manual · ${trigger.substring(7)}`;
    if (trigger === 'legacy-call') return 'Legacy call';
    return trigger || '—';
}

/**
 * Chart colours that stay with a source. Slots come from the order of `ranking` (all-time volume),
 * so the biggest accounts keep their colour when the window changes; anything else takes the next free slot.
 */
export function sourceColours(keys: string[], ranking: string[]): Record<string, string> {
    const slots = 7;
    const result: Record<string, string> = {};
    const used = new Set<number>();
    const rank = new Map(ranking.slice(0, slots).map((name, i) => [name.toLowerCase(), i]));
    for (const key of keys) {
        if (key === 'Other') continue;
        const slot = rank.get(key.toLowerCase());
        if (slot !== undefined && !used.has(slot)) {
            result[key] = `var(--ot-cat-${slot + 1})`;
            used.add(slot);
        }
    }
    let next = 0;
    for (const key of keys) {
        if (key === 'Other' || result[key]) continue;
        while (used.has(next) && next < slots) next++;
        result[key] = next < slots ? `var(--ot-cat-${next + 1})` : 'var(--ot-cat-8)';
        used.add(next);
    }
    result.Other = 'var(--ms-other)';
    return result;
}

// ─────────────────────────────── Media ───────────────────────────────

export const reelThumbPath = (postId: string) => `/memescraper/reelThumb${q({ postId })}`;
export const reelVideoPath = (postId: string) => `/memescraper/reelVideo${q({ postId })}`;

/** Fetches an authenticated route as a blob URL (the caller revokes it). */
export async function fetchBlobUrl(path: string, signal?: AbortSignal): Promise<string | null> {
    try {
        const response = await RequestGETFromKliveAPI(path, false, false, {}, signal);
        if (!response.ok) return null;
        return URL.createObjectURL(await response.blob());
    } catch {
        return null;
    }
}

/** Saves an authenticated route's body as a file (CSV export, video download). */
export async function downloadFile(path: string, fileName: string): Promise<boolean> {
    const url = await fetchBlobUrl(path);
    if (!url) return false;
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return true;
}

// ─────────────────────────────── Window & filters (kept in the URL) ───────────────────────────────

export const RANGE_PRESETS = [
    { key: '7d', label: '7D', title: 'Last 7 days' },
    { key: '30d', label: '30D', title: 'Last 30 days' },
    { key: '90d', label: '90D', title: 'Last 90 days' },
    { key: '180d', label: '6M', title: 'Last 6 months' },
    { key: '1y', label: '1Y', title: 'Last year' },
    { key: 'all', label: 'All', title: 'Everything ever downloaded' },
] as const;

export const DEFAULT_RANGE = '30d';
const RANGE_KEYS = ['range', 'from', 'to', 'g', 'src', 'niche'] as const;

/**
 * The date window and filters every MemeScraper page shares. They live in the URL, so a view can
 * be bookmarked or shared and survives switching tabs; nav links carry them along.
 */
export function useMemeRange() {
    const route = useRoute();
    const router = useRouter();
    const tz = browserTimeZone();

    const str = (key: string) => {
        const v = route.query[key];
        return typeof v === 'string' && v.trim() ? v.trim() : null;
    };
    const isDay = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

    const from = computed(() => (isDay(str('from')) ? str('from') : null));
    const to = computed(() => (isDay(str('to')) ? str('to') : null));
    const custom = computed(() => !!from.value);
    const preset = computed(() => (custom.value ? 'custom' : (RANGE_PRESETS.some(p => p.key === str('range')) ? str('range')! : DEFAULT_RANGE)));
    const granularity = computed<Granularity | null>(() => {
        const g = str('g');
        return g === 'day' || g === 'week' || g === 'month' ? g : null;
    });
    const sources = computed(() => (str('src') ?? '').split(',').map(s => s.trim()).filter(Boolean));
    const niche = computed(() => str('niche'));
    const hasFilters = computed(() => sources.value.length > 0 || !!niche.value);

    /** Query parameters for every analytics route. */
    const params = computed<Record<string, string | null>>(() => ({
        range: custom.value ? null : preset.value,
        from: from.value,
        to: custom.value ? to.value : null,
        granularity: granularity.value,
        sources: sources.value.length ? sources.value.join(',') : null,
        niche: niche.value,
        tz,
    }));
    const key = computed(() => JSON.stringify(params.value));

    /** The window/filter part of the current query, for links between MemeScraper pages. */
    const linkQuery = computed(() => {
        const out: Record<string, string> = {};
        for (const k of RANGE_KEYS) {
            const v = str(k);
            if (v) out[k] = v;
        }
        return out;
    });

    function update(patch: Partial<Record<(typeof RANGE_KEYS)[number], string | null>>) {
        const query: Record<string, any> = { ...route.query };
        for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === undefined || v === '') delete query[k];
            else query[k] = v;
        }
        void router.replace({ query });
    }

    return {
        tz, from, to, custom, preset, granularity, sources, niche, hasFilters, params, key, linkQuery,
        setPreset: (k: string) => update({ range: k === DEFAULT_RANGE ? null : k, from: null, to: null }),
        setCustom: (f: string, t: string) => {
            const [a, b] = f <= t ? [f, t] : [t, f];
            update({ range: null, from: a, to: b });
        },
        setGranularity: (g: Granularity | null) => update({ g }),
        setSources: (list: string[]) => update({ src: list.length ? [...new Set(list)].join(',') : null }),
        toggleSource: (name: string) => {
            const has = sources.value.some(s => s.toLowerCase() === name.toLowerCase());
            update({ src: (has ? sources.value.filter(s => s.toLowerCase() !== name.toLowerCase()) : [...sources.value, name]).join(',') || null });
        },
        setNiche: (n: string | null) => update({ niche: n }),
        clearFilters: () => update({ src: null, niche: null }),
        /** Zooming from a chart: an explicit window, keeping the filters. */
        zoom: (f: string, t: string) => update({ range: null, from: f, to: t, g: null }),
    };
}

// ─────────────────────────────── Shared stores ───────────────────────────────

/** Bumped when something changed the data (a scrape finished, a source was edited): pages reload. */
export function useMemeDataVersion() {
    const version = useState<number>('memescraper:data-version', () => 0);
    return { version, bump: () => { version.value++; } };
}

/**
 * The dashboard payload for the current window, shared by Overview, Sources and Health so switching
 * tabs with the same window does not refetch.
 */
export function useMemeDashboard() {
    const range = useMemeRange();
    const { version } = useMemeDataVersion();
    const data = useState<DashboardView | null>('memescraper:dashboard', () => null);
    const dataKey = useState<string | null>('memescraper:dashboard-key', () => null);
    const loadedAt = useState<number | null>('memescraper:dashboard-at', () => null);
    const error = useState<string | null>('memescraper:dashboard-error', () => null);
    const loading = useState<boolean>('memescraper:dashboard-loading', () => false);
    let controller: AbortController | null = null;

    async function load(force = false) {
        const key = range.key.value;
        if (!force && data.value && dataKey.value === key && loadedAt.value && Date.now() - loadedAt.value < 60_000) return;
        controller?.abort();
        const mine = new AbortController();
        controller = mine;
        loading.value = true;
        try {
            const result = await msGet<DashboardView>(`/memescraper/dashboard${q(range.params.value)}`, mine.signal);
            if (mine.signal.aborted || key !== range.key.value) return;
            if (result.ok && result.data) {
                data.value = result.data;
                dataKey.value = key;
                loadedAt.value = Date.now();
                error.value = null;
            } else {
                error.value = result.error ?? 'The dashboard could not be loaded.';
            }
        } catch (e) {
            if (!mine.signal.aborted) error.value = e instanceof Error ? e.message : String(e);
        } finally {
            if (controller === mine) loading.value = false;
        }
    }

    onMounted(() => { void load(); });
    watch(range.key, () => { void load(true); });
    watch(version, () => { void load(true); });
    onBeforeUnmount(() => controller?.abort());

    /** True while the data on screen belongs to a different window than the one selected. */
    const stale = computed(() => !!data.value && dataKey.value !== range.key.value);
    return { data, error, loading, loadedAt, stale, load, range };
}

export interface OverallHealth { level: 'good' | 'warn' | 'bad' | 'idle' | 'unknown'; label: string; detail: string }

/** Scraper health, polled by the shell: every 4 s while something runs, every 30 s otherwise. */
export function useMemeHealth() {
    const health = useState<ScraperHealth | null>('memescraper:health', () => null);
    const error = useState<string | null>('memescraper:health-error', () => null);
    const loadedAt = useState<number | null>('memescraper:health-at', () => null);

    const providerCheckRunning = computed(() => !!health.value?.ProviderCheck && health.value.ProviderCheck.State !== 'complete');
    const profileRefreshRunning = computed(() => !!health.value?.ProfileRefresh && ['queued', 'running'].includes(health.value.ProfileRefresh.State));
    const busy = computed(() => !!health.value && (!!health.value.CurrentScrape || (health.value.ScrapeQueued || 0) > 0 || providerCheckRunning.value || profileRefreshRunning.value));

    async function refresh() {
        try {
            const response = await RequestGETFromKliveAPI('/memescraper/scraperHealth', false, false);
            if (response.ok) {
                health.value = await response.json();
                error.value = null;
                loadedAt.value = Date.now();
            } else {
                error.value = response.status === 404 ? 'the server is running a MemeScraper build without health reporting' : `HTTP ${response.status}`;
            }
        } catch (e) {
            error.value = e instanceof Error ? e.message : String(e);
        }
    }

    const overall = computed<OverallHealth>(() => {
        const h = health.value;
        if (!h) return { level: 'unknown', label: error.value ? 'Health unavailable' : 'Connecting…', detail: error.value ?? '' };
        if (!h.DataLoaded) return { level: 'idle', label: 'Starting up', detail: 'MemeScraper is still loading its sources and reels.' };
        const providers = h.Providers ?? [];
        const failingProviders = providers.filter(p => p.ConsecutiveFailures > 0);
        const reelSources = (h.Sources ?? []).filter(s => s.DownloadReels).length;
        if (h.SchedulerState?.startsWith('failed') || h.SchedulerState?.startsWith('tick failed')) return { level: 'bad', label: 'Scheduler broken', detail: h.SchedulerState };
        if (providers.length > 0 && failingProviders.length === providers.length) {
            return { level: 'bad', label: 'Scraping is failing', detail: `Every provider is failing: ${failingProviders[0].LastError ?? 'see Health'}` };
        }
        if (h.FailingSources > 0) {
            const all = reelSources > 0 && h.FailingSources >= reelSources;
            return { level: all ? 'bad' : 'warn', label: all ? 'Scraping is failing' : 'Degraded', detail: `${h.FailingSources} of ${reelSources} source${reelSources === 1 ? '' : 's'} failed their last scrape` };
        }
        if (failingProviders.length > 0) {
            return { level: 'warn', label: 'Degraded', detail: `${failingProviders.map(p => providerLabel(p.Name)).join(', ')} failing; scrapes use the other provider` };
        }
        if (h.CurrentScrape) return { level: 'good', label: h.CurrentScrape.startsWith('provider check') ? 'Checking providers' : h.CurrentScrape.startsWith('profile refresh') ? 'Refreshing a profile' : 'Scraping', detail: h.CurrentScrape };
        if (h.Settings?.Paused || h.SchedulerState?.startsWith('paused')) return { level: 'warn', label: 'Paused', detail: 'Scheduled scrapes are switched off. Manual scrapes still work.' };
        if (!h.OnServer) return { level: 'idle', label: 'Not scheduling here', detail: 'Scheduled scrapes only run on the server. Manual scrapes and provider checks still work.' };
        return { level: 'good', label: 'Healthy', detail: h.NextScrapeDueUtc ? `Next scrape ${fmtRel(h.NextScrapeDueUtc)}` : 'Idle' };
    });

    return { health, error, loadedAt, busy, providerCheckRunning, profileRefreshRunning, overall, refresh };
}

/** "@user (manual:klives) since 2026-…" → "@user". */
export function currentScrapeSubject(current: string | null | undefined): string | null {
    if (!current) return null;
    const m = /^(@[^\s]+)/.exec(current) ?? /(@[^\s]+)/.exec(current);
    return m ? m[1] : current;
}

// ─────────────────────────────── Actions ───────────────────────────────

const SWAL_THEME = { background: '#191d16', color: '#e9f1e5', confirmButtonColor: '#4c9e38', cancelButtonColor: '#3a4136' } as const;

export function toast(title: string, icon: 'success' | 'error' | 'info' | 'warning' = 'success') {
    void Swal.fire({ ...SWAL_THEME, toast: true, position: 'top-end', icon, title, showConfirmButton: false, timer: 2600, timerProgressBar: true });
}

async function errorText(response: Response): Promise<string> {
    try {
        const text = await response.text();
        try {
            const body = JSON.parse(text);
            if (body && typeof body.error === 'string') return body.error;
        } catch { /* not JSON */ }
        return text.trim() || `Request failed (HTTP ${response.status})`;
    } catch {
        return `Request failed (HTTP ${response.status})`;
    }
}

/** Scrapes, checks and source edits, with the same confirmations and feedback on every page. */
export function useMemeActions() {
    const { refresh } = useMemeHealth();
    const { bump } = useMemeDataVersion();
    const requesting = useState<boolean>('memescraper:requesting', () => false);

    /** Tells the shell to poll fast now, so the run's progress shows live. */
    function workStarted() {
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('memescraper:work-started'));
    }

    async function post(path: string): Promise<Response | null> {
        requesting.value = true;
        try {
            return await RequestPOSTFromKliveAPI(path, '', false);
        } catch (e) {
            void Swal.fire({ ...SWAL_THEME, icon: 'error', title: 'Request failed', text: e instanceof Error ? e.message : String(e) });
            return null;
        } finally {
            requesting.value = false;
        }
    }

    async function startScrape(query: Record<string, string | null>, successText: string): Promise<boolean> {
        const response = await post(`/memescraper/scrapeNow${q(query)}`);
        if (!response) return false;
        if (response.status === 202) {
            toast(successText);
            workStarted();
            void refresh();
            return true;
        }
        // 401/403 are reported by APIInterface already.
        if (response.status !== 401 && response.status !== 403) {
            void Swal.fire({ ...SWAL_THEME, icon: 'error', title: 'Scrape not started', text: await errorText(response) });
        }
        return false;
    }

    async function scrapeAll(count: number) {
        const ok = await confirmAction('Scrape every source now?',
            `Queues ${count} reel source${count === 1 ? '' : 's'}. They run one at a time, so this can take a while; progress shows in the status bar.`,
            'Scrape all');
        if (ok) await startScrape({}, `Queued ${count} source${count === 1 ? '' : 's'} for scraping`);
    }

    const scrapeSource = (source: { AccountID: string | null; Username: string }) =>
        startScrape(source.AccountID ? { sourceAccountID: source.AccountID } : { username: source.Username }, `Scraping @${source.Username}…`);

    async function checkProviders(defaultUsername: string) {
        const input = await Swal.fire({
            ...SWAL_THEME,
            title: 'Check providers',
            text: 'Runs inflact and Instagram separately against one account and test-downloads a reel from each, so you can see exactly which one is broken. Takes about a minute.',
            input: 'text',
            inputValue: defaultUsername,
            inputPlaceholder: 'Instagram username with reels',
            showCancelButton: true,
            confirmButtonText: 'Run check',
            inputValidator: (value: string) => (!value || !value.trim() ? 'Enter a username' : undefined),
        });
        if (!input.isConfirmed) return;
        const username = String(input.value).trim().replace(/^@/, '');
        const response = await post(`/memescraper/diagnoseProviders${q({ username })}`);
        if (!response) return;
        if (response.status === 202 || response.status === 409) {
            toast(response.status === 409 ? 'A provider check is already running' : `Checking providers on @${username}…`, response.status === 409 ? 'info' : 'success');
            workStarted();
            void refresh();
        } else if (response.status !== 401 && response.status !== 403) {
            void Swal.fire({ ...SWAL_THEME, icon: 'error', title: 'Check not started', text: await errorText(response) });
        }
    }

    async function refreshProfile(source: { AccountID: string | null; Username: string }) {
        if (!source.AccountID) return;
        const response = await post(`/memescraper/refreshSourceProfile${q({ sourceAccountID: source.AccountID })}`);
        if (!response) return;
        if (response.status === 202) {
            toast(`Refreshing the profile of @${source.Username}…`);
            workStarted();
            void refresh();
        } else if (response.status === 409) {
            toast(await errorText(response), 'info');
        } else if (response.status !== 401 && response.status !== 403) {
            void Swal.fire({ ...SWAL_THEME, icon: 'error', title: 'Profile not refreshed', text: await errorText(response) });
        }
    }

    async function updateSource(accountId: string, patch: { downloadReels?: boolean; downloadPosts?: boolean; niches?: string[]; scrapeSoon?: boolean }) {
        requesting.value = true;
        try {
            const result = await msPost<{ Username: string; DownloadReels: boolean; Niches: string[] }>('/memescraper/updateInstagramSource', { accountId, ...patch });
            if (!result.ok) {
                if (result.status !== 401 && result.status !== 403) void Swal.fire({ ...SWAL_THEME, icon: 'error', title: 'Not saved', text: result.error ?? 'The source could not be updated.' });
                return null;
            }
            bump();
            if (patch.downloadReels === true || patch.scrapeSoon) workStarted();
            return result.data;
        } finally {
            requesting.value = false;
        }
    }

    async function removeSource(source: { AccountID: string | null; Username: string; TotalReels?: number }) {
        if (!source.AccountID) return false;
        const reels = source.TotalReels ?? 0;
        const answer = await Swal.fire({
            ...SWAL_THEME,
            icon: 'warning',
            title: `Remove @${source.Username}?`,
            text: 'It stops being scraped. Reels it already produced stay in the library unless you delete them too.',
            input: 'checkbox',
            inputValue: 0,
            inputPlaceholder: reels > 0 ? `Also delete its ${reels.toLocaleString()} downloaded reel${reels === 1 ? '' : 's'}` : 'Also delete its downloaded reels',
            showCancelButton: true,
            confirmButtonText: 'Remove',
            confirmButtonColor: '#c94b4b',
            focusCancel: true,
        });
        if (!answer.isConfirmed) return false;
        const deleteReels = answer.value === 1;
        requesting.value = true;
        try {
            const result = await msPost<{ removed: string; reelsDeleted: number }>('/memescraper/removeInstagramSource', { accountId: source.AccountID, deleteReels });
            if (!result.ok) {
                if (result.status !== 401 && result.status !== 403) void Swal.fire({ ...SWAL_THEME, icon: 'error', title: 'Not removed', text: result.error ?? 'The source could not be removed.' });
                return false;
            }
            toast(deleteReels ? `Removed @${source.Username} and ${result.data?.reelsDeleted ?? 0} reels` : `Removed @${source.Username}`);
            bump();
            void refresh();
            return true;
        } finally {
            requesting.value = false;
        }
    }

    return { requesting, workStarted, scrapeAll, scrapeSource, checkProviders, refreshProfile, updateSource, removeSource };
}
