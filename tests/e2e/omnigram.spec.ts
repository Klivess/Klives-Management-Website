import { expect, test, type Page } from '@playwright/test';

/**
 * OmniGram pages against a stateful mock of the /omnigram API. Besides the assertions, each step saves a
 * screenshot under test-results/omnigram/ for visual review. Every POST body must be real JSON: v1 of this
 * page sent "[object Object]" and reported success on 500s.
 */

const apiOrigin = 'https://klive.dev';
const NOW = Date.now();
const iso = (offsetMinutes: number) => new Date(NOW + offsetMinutes * 60_000).toISOString();
const SHOTS = 'test-results/omnigram';
/** The first page a cold dev server serves compiles the whole app. */
const BOOT = { timeout: 45_000 };

test.describe.configure({ timeout: 120_000 });

function thumbSvg(seed: string) {
    let h = 0;
    for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const a = h % 360;
    const b = (a + 70) % 360;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="270" height="480" viewBox="0 0 270 480">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${a},60%,42%)"/><stop offset="1" stop-color="hsl(${b},65%,20%)"/></linearGradient></defs>
<rect width="270" height="480" fill="url(#g)"/><circle cx="135" cy="200" r="58" fill="rgba(255,255,255,0.18)"/>
<text x="135" y="360" text-anchor="middle" font-family="sans-serif" font-size="30" fill="rgba(255,255,255,0.85)">reel ${seed.slice(-3)}</text></svg>`;
}

type Account = { AccountId: string; Username: string };

function post(id: string, account: Account, over: Record<string, unknown> = {}) {
    const base = {
        PostId: id, AccountId: account.AccountId, Username: account.Username, Status: 'Ready', Origin: 'Autopilot', Format: 'Reel',
        ScheduledUtc: iso(60 * 26), SlotUtc: iso(60 * 26), PublishedUtc: null, NextAttemptUtc: null,
        Caption: 'me explaining to my manager why the bug is actually a feature', Hashtags: ['memes', 'programming', 'devlife'], HashtagPlacement: 'Caption',
        FirstComment: null, Credit: '🎥 @codememes', Footer: 'follow for daily dev memes', ComposedCaption: '', AltText: null,
        CaptionPending: false, CaptionMode: 'AI', CaptionError: null, CaptionEdited: false, UsedVision: true, CaptionModel: 'qwen3-vl', Approved: true,
        HasThumbnail: true, MediaCount: 1, IsVideo: true, DurationSeconds: 14.2, Width: 1080, Height: 1920, Bytes: 6_400_000, Prepared: true,
        PrepareNotes: 'remuxed (faststart)', PrepareError: null, BlockedReason: null, LastError: null, LastErrorCode: null, Attempts: 0, Stage: 'None',
        ContainerStatus: null, Permalink: null, IgMediaId: null, FirstCommentError: null, FirstCommentPending: false, Trial: 'Off', ShareToFeed: true,
        CompanionPostId: null, Views: null, Reach: null, Likes: null, Comments: null, Shares: null, Saves: null, Interactions: 0, AvgWatchTimeMs: null,
        SkipRate: null, ViewsAt24h: null, ViewsAt7d: null, MetricsSyncedUtc: null, ContentSource: 'MemeScraper', ContentOrigin: 'codememes',
        ContentUrl: 'https://www.instagram.com/reel/abc/', OriginalCaption: 'when prod goes down on friday #devlife follow @codememes', ContentViews: 912000,
        ...over,
    } as Record<string, any>;
    if (!('ComposedCaption' in over)) base.ComposedCaption = [base.Caption, base.Credit, base.Footer, base.Hashtags.map((t: string) => '#' + t).join(' ')].filter(Boolean).join('\n\n');
    return base;
}

function strategy(over: Record<string, unknown> = {}) {
    return {
        TimeZone: 'Europe/London', Slots: [{ Day: 5, Minute: 1080 }], JitterMinutes: 9, PlanAheadDays: 7, MaxPostsPerDay: 3, MinGapMinutes: 90,
        MissedSlots: 'PublishLate', MissedSlotGraceHours: 6, Source: 'MemeScraper',
        MemeScraper: { Niches: ['programming'], Sources: [], MaxAgeDays: 120, MinViews: 0, MaxDurationSeconds: 90, Pick: 'Best', AllowReuseAcrossAccounts: false },
        Folder: { Path: '', IncludeSubfolders: false, Images: true, Videos: true, Pick: 'Random' },
        ImageFormat: 'Photo', VideoFormat: 'Reel', ImageFit: 'BlurPad',
        Reels: { ShareToFeed: true, CoverFrameSeconds: null, Trial: 'Off', Collaborators: [], AlsoPostStory: false },
        CaptionMode: 'AI', FixedCaption: '', CaptionPool: [],
        Ai: { Persona: 'A deadpan, terminally online meme page. Dry, short and funny; never cringe, never salesy.', Instructions: '', Examples: ['git push --force and pray'], MaxLength: 150, UseVision: true, UseSourceCaption: true, SuggestHashtags: true, MaxSuggestedHashtags: 4, AllowEmoji: true, Language: 'English', Fallback: 'Empty', Model: null },
        CaptionFooter: 'follow for daily dev memes', CreditTemplate: '🎥 @{origin}',
        FixedHashtags: ['memes', 'programming'], RotatingHashtags: ['devlife', 'coding', 'relatable'], RotatingHashtagsPerPost: 2, MaxHashtags: 8,
        HashtagPlacement: 'Caption', LabelAsAiGenerated: false,
        ...over,
    };
}

function buildState() {
    const dank: Account = { AccountId: 'a-memes', Username: 'dankpage' };
    const old: Account = { AccountId: 'a-old', Username: 'oldpage' };
    const posts = [
        post('p-next', dank, { ScheduledUtc: iso(150), SlotUtc: iso(150) }),
        post('p-approval', dank, { Status: 'AwaitingApproval', Approved: false, ScheduledUtc: iso(60 * 24 * 3), SlotUtc: iso(60 * 24 * 3), Caption: 'when the code works on the first try' }),
        post('p-pending', dank, { Status: 'Planned', CaptionPending: true, Caption: null, ScheduledUtc: iso(60 * 24 * 6), SlotUtc: iso(60 * 24 * 6), HasThumbnail: false, Prepared: false }),
        post('p-carousel', dank, { Origin: 'Manual', Format: 'Carousel', MediaCount: 3, IsVideo: false, DurationSeconds: null, Width: 1080, Height: 1350, Caption: 'rate my desk setup 1-10', ScheduledUtc: iso(60 * 30), SlotUtc: null, ContentSource: null, ContentOrigin: null, Credit: null, CaptionMode: 'Manual', CaptionEdited: true }),
        post('p-pub1', dank, { Status: 'Published', Stage: 'Published', ScheduledUtc: iso(-60 * 50), PublishedUtc: iso(-60 * 50), IgMediaId: 'ig-1', Permalink: 'https://www.instagram.com/reel/C1/', Caption: 'nobody: my code at 3am: segfault', Views: 48_200, Reach: 31_000, Likes: 2100, Comments: 64, Shares: 310, Saves: 220, Interactions: 2694, AvgWatchTimeMs: 6400, SkipRate: 31.5, ViewsAt24h: 30_100, MetricsSyncedUtc: iso(-20) }),
        post('p-pub2', dank, { Status: 'Published', Stage: 'Published', Format: 'Photo', IsVideo: false, DurationSeconds: null, Width: 1080, Height: 1080, ScheduledUtc: iso(-60 * 24 * 4), PublishedUtc: iso(-60 * 24 * 4), IgMediaId: 'ig-2', Permalink: 'https://www.instagram.com/p/C2/', Caption: 'the audacity of this linter', Views: 7300, Reach: 6100, Likes: 410, Comments: 12, Shares: 20, Saves: 31, Interactions: 473, MetricsSyncedUtc: iso(-40) }),
        post('p-failed', dank, { Status: 'Failed', ScheduledUtc: iso(-60 * 30), LastError: 'Instagram could not download the media (2207052): Media download has failed.', LastErrorCode: '9004.2207052', Attempts: 3 }),
    ];
    const accounts = [
        {
            ...dank, Name: 'Dank Page', ProfilePictureUrl: null, ProfileUrl: 'https://www.instagram.com/dankpage/', AccountType: 'MEDIA_CREATOR', Autopilot: true, Paused: false, RequireApproval: true,
            Connection: 'Healthy', ConnectionDetail: null, TokenExpiresUtc: iso(60 * 24 * 52), Followers: 18_400, FollowersDelta7d: 220,
            FollowersSpark: [18050, 18090, 18110, 18160, 18200, 18240, 18300, 18350, 18400], MediaCount: 312, LastPublishedUtc: iso(-60 * 50),
            Pending: 4, AwaitingApproval: 1, Published7d: 2, Failed7d: 1, AvgViews30d: 27_750, AvgInteractions30d: 1583, Reach7d: 41_000, SlotsPerWeek: 1,
            Source: 'MemeScraper', CaptionMode: 'AI', TimeZone: 'Europe/London', LastError: null, LastErrorUtc: null, ConsecutiveFailures: 0, ContentWarning: null,
            NewComments: 2, Imported: false, State: 'attention', StateReason: 'Posts are waiting for approval',
        },
        {
            ...old, Name: null, ProfilePictureUrl: null, ProfileUrl: 'https://www.instagram.com/oldpage/', AccountType: null, Autopilot: false, Paused: false, RequireApproval: false,
            Connection: 'AwaitingConnection', ConnectionDetail: null, TokenExpiresUtc: null, Followers: null, FollowersDelta7d: null, FollowersSpark: [], MediaCount: null,
            LastPublishedUtc: null, Pending: 0, AwaitingApproval: 0, Published7d: 0, Failed7d: 0, AvgViews30d: null, AvgInteractions30d: null, Reach7d: null, SlotsPerWeek: 3,
            Source: 'MemeScraper', CaptionMode: 'AI', TimeZone: 'Europe/London', LastError: null, LastErrorUtc: null, ConsecutiveFailures: 0, ContentWarning: null,
            NewComments: 0, Imported: true, State: 'connect', StateReason: 'Imported from v1 — connect it with Instagram',
        },
    ];
    return {
        accounts,
        posts,
        strategies: { 'a-memes': strategy(), 'a-old': strategy({ Slots: [{ Day: 1, Minute: 1080 }, { Day: 3, Minute: 1080 }, { Day: 5, Minute: 1080 }] }) } as Record<string, any>,
        comments: [
            { Id: 'c1', MediaId: 'ig-1', OmniPostId: 'p-pub1', Username: 'senior_dev_42', Text: 'this is me fr', Utc: iso(-120), LikeCount: 14, Hidden: false, Own: false, Replied: false, Replies: [] as any[], Media: { Permalink: 'https://www.instagram.com/reel/C1/', Caption: 'nobody: my code at 3am: segfault', ThumbnailUrl: null, ProductType: 'REELS' } },
            { Id: 'c2', MediaId: 'ig-1', OmniPostId: 'p-pub1', Username: 'pm_karen', Text: 'who approved this', Utc: iso(-300), LikeCount: 2, Hidden: false, Own: false, Replied: true, Replies: [{ Id: 'c2r', MediaId: 'ig-1', OmniPostId: 'p-pub1', ParentId: 'c2', Username: 'dankpage', Text: 'the build server did', Utc: iso(-280), LikeCount: 5, Hidden: false, Own: true, Replied: false }], Media: { Permalink: 'https://www.instagram.com/reel/C1/', Caption: 'nobody: my code at 3am: segfault', ThumbnailUrl: null, ProductType: 'REELS' } },
        ],
        events: [
            { Utc: iso(-60 * 50), Level: 'Success', Kind: 'publish.ok', Message: '@dankpage: published a reel — https://www.instagram.com/reel/C1/', AccountId: 'a-memes', PostId: 'p-pub1', Username: 'dankpage' },
            { Utc: iso(-30), Level: 'Error', Kind: 'publish.failed', Message: '@dankpage: Instagram could not download the media (9004.2207052).', AccountId: 'a-memes', PostId: 'p-failed', Username: 'dankpage' },
            { Utc: iso(-10), Level: 'Info', Kind: 'plan', Message: '@dankpage: planned 1 post(s) for upcoming slots.', AccountId: 'a-memes', PostId: null, Username: 'dankpage' },
        ],
        v1Passwords: true,
        mutations: [] as { path: string; body: any }[],
        flowPolls: 0,
    };
}

type MockState = ReturnType<typeof buildState>;
const pendingStatuses = ['Draft', 'Planned', 'Ready', 'AwaitingApproval', 'Publishing'];

function connection(a: any) {
    const connected = a.Connection !== 'AwaitingConnection';
    return {
        AccountId: a.AccountId, Username: a.Username, Name: a.Name, ProfilePictureUrl: a.ProfilePictureUrl, AccountType: a.AccountType,
        IgUserId: connected ? '17841400000000001' : null, Connected: connected, Connection: a.Connection, ConnectionDetail: a.ConnectionDetail,
        ConnectionChangedUtc: connected ? iso(-60 * 24 * 8) : null, ConnectedVia: connected ? 'oauth' : null, ConnectedUtc: connected ? iso(-60 * 24 * 8) : null,
        TokenIssuedUtc: connected ? iso(-60 * 24 * 8) : null, TokenRefreshedUtc: connected ? iso(-60 * 24 * 2) : null, TokenExpiresUtc: a.TokenExpiresUtc,
        Scopes: connected ? ['instagram_business_basic', 'instagram_business_content_publish', 'instagram_business_manage_comments', 'instagram_business_manage_insights'] : [],
        Quota: { QuotaUsage: connected ? 2 : null, QuotaTotal: connected ? 100 : null, FetchedUtc: connected ? iso(-15) : null },
        Imported: !!a.Imported,
    };
}

function engine(state: MockState) {
    return {
        Enabled: true, Running: true, PublishingEnabled: true, StartupState: 'running', StartedUtc: iso(-60 * 5),
        Loops: [
            { Name: 'publish', State: 'idle', LastTickUtc: iso(-0.2), LastActivityUtc: iso(-60 * 50), LastActivity: 'published 1 post(s)', LastError: null, LastErrorUtc: null, Ticks: 840 },
            { Name: 'plan', State: 'idle', LastTickUtc: iso(-0.5), LastActivityUtc: iso(-10), LastActivity: 'planned 1, prepared 1', LastError: null, LastErrorUtc: null, Ticks: 400 },
            { Name: 'sync', State: 'idle', LastTickUtc: iso(-0.7), LastActivityUtc: iso(-3), LastActivity: 'ran 4 sync job(s)', LastError: null, LastErrorUtc: null, Ticks: 300 },
        ],
        Api: { Version: 'v25.0', CallsThisHour: 37, CallsToday: 412, AppUsagePercent: 4, AccountUsagePercent: 11, RegainAccessMinutes: null, UsageObservedUtc: iso(-2), ByEndpointToday: { media: 120, insights: 210, comments: 48 }, ProxyActive: false },
        PublicMedia: { BaseUrl: 'https://klive.dev', Check: { Utc: iso(-60), Ok: true, BaseUrl: 'https://klive.dev', Status: 200, LatencyMs: 84, Detail: null }, LastExternalMediaFetchUtc: iso(-60 * 50), LastExternalMediaFetchAgent: 'facebookexternalhit/1.1' },
        MemeScraperReady: true, AiAvailable: true, Ffmpeg: { Available: true, Status: 'ffmpeg version 7.1-full_build-www.gyan.dev (FFmpeg/ffmpeg.exe)' }, Migration: 'Imported 1 v1 account(s) (connect them with Instagram); passwords were not copied.',
        V1PasswordFilesPresent: state.v1Passwords, UnsupportedMetrics: { STORY: ['saved'] }, SyncErrors: [],
    };
}

const app = () => ({ Configured: true, AppId: '1234567890123456', RedirectUrl: 'https://klive.dev/omnigram/oauth/callback', VerifiedUtc: iso(-60 * 24 * 8), LastVerifyError: null, UpdatedUtc: iso(-60 * 24 * 9) });

function analytics(accountId: string | null, days: number) {
    const n = Math.min(days, 30);
    const series = Array.from({ length: n }, (_, i) => ({ T: iso(-60 * 24 * (n - i)), V: 17_600 + i * 27 + (i % 4) * 11 }));
    const dayKey = (i: number) => new Date(NOW - i * 86_400_000).toISOString().slice(0, 10);
    const posting = Array.from({ length: n + 1 }, (_, i) => ({ Day: dayKey(n - i), Ours: i % 7 === 0 ? 1 : 0, Others: i % 11 === 0 ? 1 : 0, Views: i % 7 === 0 ? 9000 + (i * 1337) % 40_000 : 0 }));
    const account = posting.map((p, i) => ({ Day: p.Day, Reach: 3000 + (i * 431) % 4000, Views: 5000 + (i * 977) % 9000, Interactions: 200 + (i * 37) % 300, Follows: 20 + (i * 3) % 30, Unfollows: 4 + i % 9, ProfileLinksTaps: i % 6 }));
    const heat: { Dow: number; Hour: number; Posts: number; AvgViews: number }[] = [];
    for (const dow of [1, 3, 5, 6]) for (const hour of [12, 18, 21]) heat.push({ Dow: dow, Hour: hour, Posts: 2 + (dow + hour) % 3, AvgViews: 4000 + ((dow * 3701 + hour * 911) % 30_000) });
    const online = Array.from({ length: 24 }, (_, h) => Math.round(400 + 900 * Math.max(0, Math.sin(((h - 7) / 24) * Math.PI * 2)) + (h > 17 && h < 23 ? 600 : 0)));
    return {
        AccountId: accountId, Days: days, FromUtc: iso(-60 * 24 * days), ToUtc: iso(0), TimeZone: 'Europe/London', Followers: 18_400, FollowersDelta: 640, FollowersGrowthPerWeek: 149.3,
        NewFollows: 820, Unfollows: 180, PostsPublished: 6, PostsPublishedPrev: 4, Views: 166_500, ViewsPrev: 98_000, AvgViews: 27_750, MedianViews: 18_200,
        Interactions: 9500, InteractionsPrev: 6100, AvgInteractions: 1583.3, EngagementRate: 5.41, EngagementPerFollower: 8.6, AccountReach: 121_000, AccountViews: 240_000,
        Likes: 7800, Comments: 310, Shares: 820, Saves: 570, AvgWatchSeconds: 6.4,
        FollowersSeries: series, Account: account, Posting: posting, Heatmap: heat, BestSlotLabel: 'Friday 18:00–19:00 (31200 views avg over 3 posts)',
        OnlineByHour: online, OnlinePeakLabel: 'Most followers are online around 20:00 (1900 on average)',
        TopPosts: [
            { Id: 'ig-1', AccountId: 'a-memes', Username: 'dankpage', OmniPostId: 'p-pub1', Permalink: 'https://www.instagram.com/reel/C1/', Caption: 'nobody: my code at 3am: segfault', ProductType: 'REELS', ThumbnailUrl: null, Views: 48_200, Likes: 2100, Comments: 64, Interactions: 2694, PublishedUtc: iso(-60 * 50), Ours: true, HasThumbnail: true },
            { Id: 'ig-9', AccountId: 'a-memes', Username: 'dankpage', OmniPostId: null, Permalink: 'https://www.instagram.com/reel/C9/', Caption: 'posted from the app', ProductType: 'REELS', ThumbnailUrl: null, Views: 21_000, Likes: 900, Comments: 18, Interactions: 1000, PublishedUtc: iso(-60 * 24 * 9), Ours: false, HasThumbnail: false },
            { Id: 'ig-2', AccountId: 'a-memes', Username: 'dankpage', OmniPostId: 'p-pub2', Permalink: 'https://www.instagram.com/p/C2/', Caption: 'the audacity of this linter', ProductType: 'FEED', ThumbnailUrl: null, Views: 7300, Likes: 410, Comments: 12, Interactions: 473, PublishedUtc: iso(-60 * 24 * 4), Ours: true, HasThumbnail: true },
        ],
        Hashtags: [{ Key: 'programming', Posts: 6, AvgViews: 27_750, AvgInteractions: 1583 }, { Key: 'devlife', Posts: 3, AvgViews: 31_000, AvgInteractions: 1800 }, { Key: 'memes', Posts: 6, AvgViews: 27_750, AvgInteractions: 1583 }],
        Sources: [{ Key: 'codememes', Posts: 4, AvgViews: 33_000, AvgInteractions: 1900 }, { Key: 'stackoverflowed', Posts: 2, AvgViews: 17_000, AvgInteractions: 900 }],
        CaptionModes: [{ Key: 'AI (vision)', Posts: 5, AvgViews: 30_000, AvgInteractions: 1700 }, { Key: 'Manual', Posts: 1, AvgViews: 7300, AvgInteractions: 473 }],
        Formats: [{ Key: 'Reel', Posts: 5, AvgViews: 31_800, AvgInteractions: 1800 }, { Key: 'Photo', Posts: 1, AvgViews: 7300, AvgInteractions: 473 }],
        Demographics: accountId ? {
            age: [{ Key: '18-24', Posts: 7800, AvgViews: 42.4 }, { Key: '25-34', Posts: 6900, AvgViews: 37.5 }, { Key: '35-44', Posts: 2400, AvgViews: 13 }],
            gender: [{ Key: 'M', Posts: 11_900, AvgViews: 64.7 }, { Key: 'F', Posts: 6100, AvgViews: 33.2 }, { Key: 'U', Posts: 400, AvgViews: 2.1 }],
            country: [{ Key: 'US', Posts: 6200, AvgViews: 33.7 }, { Key: 'GB', Posts: 3100, AvgViews: 16.8 }, { Key: 'IN', Posts: 2900, AvgViews: 15.8 }],
        } : {},
        DemographicsNote: null, SampleSize: 34,
    };
}

function summaries(state: MockState) {
    return state.accounts.map(a => {
        const mine = state.posts.filter(p => p.AccountId === a.AccountId);
        const pending = mine.filter(p => pendingStatuses.includes(p.Status)).sort((x, y) => x.ScheduledUtc.localeCompare(y.ScheduledUtc));
        return { ...a, NextPost: pending[0] ?? null, LastPost: mine.find(p => p.Status === 'Published') ?? null, Pending: pending.length, AwaitingApproval: pending.filter(p => p.Status === 'AwaitingApproval').length };
    });
}

async function mockApi(page: Page, state: MockState) {
    await page.routeWebSocket('wss://klive.dev/**', () => {});
    await page.route(`${apiOrigin}/**`, async route => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname;
        const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type, X-Klive-Client, X-Klive-Page, Cache-Control' };
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
        const json = (body: unknown, status = 200) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
        const qp = (k: string) => url.searchParams.get(k);
        const accountById = (id: string | null) => state.accounts.find(a => a.AccountId === id);

        if (path === '/KMProfiles/LoginStatus') return route.fulfill({ status: 200, headers: cors, body: 'SessionActive' });
        if (path === '/KMProfiles/GetCurrentProfile') return json({ Name: 'Klives', KlivesManagementRank: 5 });

        let body: any = null;
        if (request.method() === 'POST' && path !== '/omnigram/media/upload') {
            const raw = request.postData();
            if (raw && (request.headers()['content-type'] ?? '').includes('json')) body = JSON.parse(raw); // throws on "[object Object]" — the v1 bug
            state.mutations.push({ path, body });
        }

        switch (path) {
            case '/omnigram/overview': {
                const all = summaries(state);
                const upcoming = state.posts.filter(p => pendingStatuses.includes(p.Status)).sort((a, b) => a.ScheduledUtc.localeCompare(b.ScheduledUtc));
                return json({
                    NowUtc: iso(0), Engine: engine(state), App: app(),
                    Kpis: {
                        Followers: 18_400, FollowersDelta7d: 220, FollowersDelta30d: 640, FollowersSeries: analytics(null, 30).FollowersSeries, Published7d: 2, PublishedPrev7d: 1,
                        Views30d: 55_500, AvgViews30d: 27_750, AvgInteractions30d: 1583.5, Reach7d: 41_000, Pending: upcoming.length,
                        AwaitingApproval: upcoming.filter(p => p.Status === 'AwaitingApproval').length, Failed7d: 1, SuccessRate30d: 85.7,
                        NextPostUtc: upcoming[0]?.ScheduledUtc ?? null, NextPostAccount: upcoming[0]?.Username ?? null,
                        AutopilotAccounts: state.accounts.filter(a => a.Autopilot && a.Connection === 'Healthy').length, Accounts: state.accounts.length,
                        ConnectedAccounts: state.accounts.filter(a => a.Connection !== 'AwaitingConnection').length,
                    },
                    Accounts: all,
                    Upcoming: upcoming,
                    RecentlyPublished: state.posts.filter(p => p.Status === 'Published'),
                    Attention: [
                        ...state.accounts.filter(a => a.Connection === 'AwaitingConnection').map(a => ({ Level: 'warning', Title: `Connect @${a.Username}`, Detail: 'Imported from OmniGram v1, which logged in with passwords and stopped working. Connect it through Instagram\'s official login.', AccountId: a.AccountId, Action: 'connect' })),
                        ...(state.posts.some(p => p.Status === 'AwaitingApproval') ? [{ Level: 'info', Title: '1 post(s) on @dankpage need approval', Detail: 'Approve them in the queue or turn off approval in the account\'s strategy.', AccountId: 'a-memes', Action: 'queue' }] : []),
                        ...(state.v1Passwords ? [{ Level: 'warning', Title: 'Old Instagram passwords are stored in plain text', Detail: 'OmniGram v1 kept account passwords unencrypted.', AccountId: null, Action: 'v1-passwords' }] : []),
                    ],
                    Events: [...state.events].reverse(),
                });
            }
            case '/omnigram/dashboard-stats':
                return json({ TotalAccounts: state.accounts.length, ActiveAccounts: 1, AutopilotAccounts: 1, PendingCount: 4, SuccessRate: 86, TotalFollowers: 18_400, PostsThisWeek: 2, AttentionCount: 2 });
            case '/omnigram/account': {
                const a = accountById(qp('accountId'));
                if (!a) return json({ error: 'No such account.' }, 404);
                const summary = summaries(state).find(s => s.AccountId === a.AccountId)!;
                const mine = state.posts.filter(p => p.AccountId === a.AccountId);
                const pending = mine.filter(p => pendingStatuses.includes(p.Status)).sort((x, y) => x.ScheduledUtc.localeCompare(y.ScheduledUtc));
                const connected = a.Connection !== 'AwaitingConnection';
                return json({
                    NowUtc: iso(0),
                    Summary: summary,
                    Account: {
                        AccountId: a.AccountId, Username: a.Username, Name: a.Name, AccountType: a.AccountType, ProfilePictureUrl: a.ProfilePictureUrl, ProfileUrl: a.ProfileUrl,
                        Biography: 'dev memes, daily-ish', Website: null, Autopilot: a.Autopilot, Paused: a.Paused, RequireApproval: a.RequireApproval, Notes: '', Tags: [], AddedUtc: iso(-60 * 24 * 40),
                        Stats: { Followers: a.Followers, Follows: 120, MediaCount: a.MediaCount, ProfileSyncedUtc: iso(-60), MediaIndexSyncedUtc: iso(-20), PostInsightsSyncedUtc: iso(-25), AccountInsightsSyncedUtc: iso(-90), DemographicsSyncedUtc: iso(-60 * 24 * 2), CommentsSyncedUtc: iso(-12), LastPublishedUtc: a.LastPublishedUtc },
                        Health: { LastError: connected ? 'Instagram could not download the media (9004.2207052)' : null, LastErrorUtc: iso(-30), ConsecutiveFailures: 0, LastSuccessUtc: connected ? iso(-60 * 50) : null, ContentWarning: null, ContentWarningUtc: null, CooldownUntilUtc: null, CooldownReason: null },
                        Quota: { QuotaTotal: connected ? 100 : null, QuotaUsage: connected ? 2 : null, QuotaDurationSeconds: 86_400, FetchedUtc: connected ? iso(-15) : null },
                        Strategy: state.strategies[a.AccountId], UsedContentCount: 41, RejectedContentCount: 1,
                        Legacy: a.Imported ? { V1AccountId: 'v1-123', ImportedUtc: iso(-60 * 24), V1LoginStatus: 'Error', V1PostedCount: 87 } : null,
                    },
                    Connection: connection(a),
                    Pending: pending,
                    History: mine.filter(p => !pendingStatuses.includes(p.Status)),
                    Events: state.events.filter(e => e.AccountId === a.AccountId).reverse(),
                    Comments: state.comments.filter(c => a.AccountId === 'a-memes').map(({ Replies, Media, ...c }) => ({ ...c, ParentId: null })),
                    Validation: [],
                    Runway: a.Autopilot
                        ? { Eligible: 37, SlotsPerWeek: 1, WeeksOfContent: 37, Source: 'MemeScraper', Next: Array.from({ length: 8 }, (_, i) => ({ Key: `ig:${900 + i}`, Source: 'MemeScraper', Kind: 'Video', Origin: 'codememes', OriginalUrl: null, Views: 400_000 - i * 30_000, Likes: 20_000, CreatedUtc: iso(-60 * 24 * (i + 1)), OriginalCaption: 'dev meme compilation', DurationSeconds: 9 + i, FileName: `${900 + i}.mp4` })) }
                        : { Eligible: 120, SlotsPerWeek: 3, WeeksOfContent: 40, Source: 'MemeScraper', Next: [] },
                });
            }
            case '/omnigram/analytics':
                return json(analytics(qp('accountId'), Number(qp('days') ?? 30)));
            case '/omnigram/post': {
                const p = state.posts.find(x => x.PostId === qp('postId'));
                if (!p) return json({ error: 'No such post.' }, 404);
                const published = p.Status === 'Published';
                return json({
                    Post: p,
                    Media: Array.from({ length: p.MediaCount }, (_, i) => ({ Index: i, MimeType: p.IsVideo ? 'video/mp4' : 'image/jpeg', Bytes: p.Bytes, Width: p.Width, Height: p.Height, DurationSeconds: p.DurationSeconds, HasThumbnail: p.HasThumbnail, Exists: true, FileName: `media${i}.${p.IsVideo ? 'mp4' : 'jpg'}`, Prepared: p.Prepared, PreparedBytes: p.Bytes, PreparedFor: p.Format, PrepareNotes: p.PrepareNotes, PrepareError: null })),
                    AttemptLog: p.Status === 'Failed'
                        ? [{ Utc: iso(-35), Ok: true, Step: 'container', Code: null, Message: 'created container 1789', DurationMs: 900 }, { Utc: iso(-30), Ok: false, Step: 'status', Code: '9004.2207052', Message: p.LastError, DurationMs: 300 }]
                        : published ? [{ Utc: p.PublishedUtc, Ok: true, Step: 'publish', Code: null, Message: 'published as ig-1', DurationMs: 1800 }] : [],
                    MetricsHistory: published ? [{ Utc: p.PublishedUtc, Views: 0, Reach: 0, Likes: 0, Comments: 0, Interactions: 0 }, { Utc: iso(-60 * 40), Views: 12_000, Reach: 9000, Likes: 600, Comments: 20, Interactions: 700 }, { Utc: iso(-60 * 26), Views: 30_100, Reach: 21_000, Likes: 1500, Comments: 44, Interactions: 1900 }, { Utc: iso(-20), Views: p.Views, Reach: p.Reach, Likes: p.Likes, Comments: p.Comments, Interactions: p.Interactions }] : [],
                    Metrics: { Views: p.Views, Reach: p.Reach, Likes: p.Likes, Comments: p.Comments, Shares: p.Shares, Saves: p.Saves, Reposts: null, TotalInteractions: p.Interactions, Follows: published ? 48 : null, ProfileVisits: published ? 310 : null, Replies: null, AvgWatchTimeMs: p.AvgWatchTimeMs, TotalWatchTimeMs: null, SkipRate: p.SkipRate, InsightsSyncedUtc: published ? iso(-20) : null, CountsSyncedUtc: published ? iso(-20) : null, InsightsError: null, ViewsAt24h: p.ViewsAt24h, ViewsAt7d: p.ViewsAt7d },
                    CaptionInfo: { Mode: p.CaptionMode, Model: 'qwen3-vl', UsedVision: true, GeneratedUtc: iso(-90), Edited: p.CaptionEdited, Error: null, Failures: 0, Direction: null, SuggestedHashtags: ['devlife'] },
                    Content: p.ContentSource ? { Kind: 'MemeScraper', Key: 'ig:123', Origin: 'codememes', OriginalCaption: p.OriginalCaption, OriginalUrl: 'https://www.instagram.com/reel/abc/', Views: 912_000, Likes: 40_000, CreatedUtc: iso(-60 * 24 * 3) } : null,
                    Reel: { ShareToFeed: p.ShareToFeed, CoverFrameSeconds: null, Trial: p.Trial, Collaborators: [], AlsoPostStory: false },
                    Publish: { Stage: p.Stage, ContainerStatus: published ? 'PUBLISHED' : p.Status === 'Failed' ? 'ERROR' : null, ContainerStatusDetail: null, ContainerCreatedUtc: published ? p.PublishedUtc : null, NextCheckUtc: null, StatusChecks: published ? 3 : 0, MediaFetches: published ? 2 : 0, LastMediaFetchUtc: published ? p.PublishedUtc : null, LastMediaFetchAgent: published ? 'facebookexternalhit/1.1' : null },
                    Comments: state.comments.filter(c => c.OmniPostId === p.PostId).flatMap(({ Replies, Media, ...c }) => [{ ...c, ParentId: null }, ...Replies]),
                    Deferrals: 0, ManualOverride: false, CreatedUtc: iso(-60 * 24), UpdatedUtc: iso(-90),
                });
            }
            case '/omnigram/media':
            case '/omnigram/content/thumb':
                return route.fulfill({ status: 200, headers: cors, contentType: 'image/svg+xml', body: thumbSvg(`${qp('postId') ?? qp('key') ?? 'x'}${qp('index') ?? ''}`) });
            case '/omnigram/memescraper/options':
                return json({ Ready: true, TotalReels: 1840, DownloadedReels: 1780, Niches: [{ Name: 'programming', Sources: 3, Reels: 620 }, { Name: 'gaming', Sources: 4, Reels: 790 }], Sources: [{ Username: 'codememes', Niches: ['programming'], Reels: 300, NewestUtc: iso(-60) }, { Username: 'stackoverflowed', Niches: ['programming'], Reels: 220, NewestUtc: iso(-120) }] });
            case '/omnigram/library':
                return json({ AccountId: qp('accountId'), Files: [] });
            case '/omnigram/comments':
                return json(state.comments);
            case '/omnigram/settings':
                return json({ App: app(), Accounts: state.accounts.map(connection), Engine: engine(state), Presets: ['weekly-reels', 'three-a-week', 'daily-reels', 'manual'], DefaultStrategy: strategy(), Scopes: ['instagram_business_basic', 'instagram_business_content_publish', 'instagram_business_manage_comments', 'instagram_business_manage_insights'], PublicMediaRoute: '/omnigram/public/media' });
            case '/omnigram/events':
                return json([...state.events].reverse());
            case '/omnigram/settings/check-public-url':
                return json({ Utc: iso(0), Ok: true, BaseUrl: 'https://klive.dev', Status: 200, LatencyMs: 91, Detail: null });
            case '/omnigram/settings/remove-v1-passwords':
                state.v1Passwords = false;
                return json({ files: 1, sessions: 1, remaining: false });
            case '/omnigram/connect/begin':
                return json({ flowId: 'flow-1', authorizationUrl: 'https://www.instagram.com/oauth/authorize?client_id=1234567890123456', redirectUrl: app().RedirectUrl });
            case '/omnigram/connect/status':
                state.flowPolls++;
                return json(state.flowPolls < 2
                    ? { FlowId: 'flow-1', State: 'pending', Error: null, AccountId: null, CreatedUtc: iso(-1), CompletedUtc: null, Account: null }
                    : { FlowId: 'flow-1', State: 'completed', Error: null, AccountId: 'a-new', CreatedUtc: iso(-1), CompletedUtc: iso(0), Account: { ...connection(state.accounts[0]), AccountId: 'a-new', Username: 'freshpage' } });
            case '/omnigram/connect/token': {
                const target = body.reconnectAccountId ? accountById(body.reconnectAccountId) : null;
                if (target) { target.Connection = 'Healthy'; target.State = 'ok'; target.AccountType = 'MEDIA_CREATOR'; target.TokenExpiresUtc = iso(60 * 24 * 60); }
                return json({ Ok: true, Message: 'Connected.', AccountId: target?.AccountId ?? 'a-new', Username: target?.Username ?? 'freshpage', IsNew: !target, AttachedToImported: !!target?.Imported });
            }
            case '/omnigram/media/upload':
                return json({ MediaId: '0123456789ab', FileName: '0123456789ab.mp4', OriginalName: qp('fileName'), Kind: 'Video', MimeType: 'video/mp4', Bytes: 4, Width: 1080, Height: 1920, DurationSeconds: 12.5, Purpose: 'compose', AccountId: null });
            case '/omnigram/accounts/update': {
                const a = accountById(body.accountId);
                if (a && typeof body.autopilot === 'boolean') a.Autopilot = body.autopilot;
                if (a && typeof body.paused === 'boolean') a.Paused = body.paused;
                if (a && typeof body.requireApproval === 'boolean') a.RequireApproval = body.requireApproval;
                if (body.strategy) state.strategies[body.accountId] = body.strategy;
                return json({ updated: true, Notes: [] });
            }
            case '/omnigram/posts/update': {
                const p = state.posts.find(x => x.PostId === body.postId)!;
                if (typeof body.caption === 'string') { p.Caption = body.caption; p.CaptionEdited = true; }
                if (Array.isArray(body.hashtags)) p.Hashtags = body.hashtags;
                return json(p);
            }
            case '/omnigram/posts/approve': {
                let approved = 0;
                for (const p of state.posts) {
                    if (p.Status === 'AwaitingApproval' && (p.PostId === body.postId || p.AccountId === body.accountId)) { p.Status = 'Ready'; p.Approved = true; approved++; }
                }
                return json({ approved });
            }
            case '/omnigram/posts/create': {
                const created = (body.accountIds as string[]).map((id, i) => {
                    const p = post(`p-new-${i}`, accountById(id)!, { Origin: 'Manual', Format: body.format, Caption: body.caption, CaptionPending: body.captionMode === 'AI', ScheduledUtc: body.scheduledUtc ?? iso(0), SlotUtc: null, Status: 'Planned' });
                    state.posts.push(p);
                    return { AccountId: id, PostId: p.PostId };
                });
                return json({ created });
            }
            case '/omnigram/captions/preview':
                return json({ Caption: 'pov: the senior dev reviews your first PR', Hashtags: ['memes', 'programming', 'codereview'], SuggestedHashtags: ['codereview'], ComposedCaption: 'pov: the senior dev reviews your first PR\n\n🎥 @codememes\n\nfollow for daily dev memes\n\n#memes #programming #codereview', FirstComment: null, AltText: 'A man squinting at a laptop.', Model: 'qwen3-vl', UsedVision: true, FramesSent: 4, Content: { Key: 'ig:900', Source: 'MemeScraper', Kind: 'Video', Origin: 'codememes', OriginalUrl: null, Views: 400_000, Likes: 20_000, CreatedUtc: iso(-60 * 24), OriginalCaption: 'the review', DurationSeconds: 9, FileName: '900.mp4' } });
            case '/omnigram/comments/reply': {
                const c = state.comments.find(x => x.Id === body.commentId);
                if (c) { c.Replied = true; c.Replies.push({ Id: 'r-new', MediaId: c.MediaId, OmniPostId: c.OmniPostId, ParentId: c.Id, Username: 'dankpage', Text: body.message, Utc: iso(0), LikeCount: 0, Hidden: false, Own: true, Replied: false }); }
                return json({ replied: true, replyId: 'r-new' });
            }
            default:
                return json({});
        }
    });
}

test.beforeEach(async ({ context }) => {
    const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '4173'}`).origin;
    await context.addCookies([{ name: 'password', value: 'test-password', url: origin }]);
});

test('overview: fleet, attention, accounts, queue and a published reel', async ({ page }) => {
    const state = buildState();
    await mockApi(page, state);
    await page.setViewportSize({ width: 1500, height: 1100 });
    await page.goto('/schemery/omnigram');

    await expect(page.getByRole('heading', { name: 'Instagram accounts' })).toBeVisible(BOOT);
    await expect(page.getByText('Connect @oldpage')).toBeVisible();
    await expect(page.getByText('1 post(s) on @dankpage need approval')).toBeVisible();
    await expect(page.getByRole('link', { name: '@dankpage' }).first()).toBeVisible();
    await expect(page.getByText('18.4k').first()).toBeVisible();
    await expect(page.getByText(/Autopilot running/)).toBeVisible();
    await expect(page.getByText('nobody: my code at 3am: segfault').first()).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/overview.png`, fullPage: true });

    // A published reel: performance, comments and the publish log.
    await page.getByText('nobody: my code at 3am: segfault').first().click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByText('Performance')).toBeVisible();
    await expect(drawer.getByText('48.2k').first()).toBeVisible();
    await expect(drawer.getByText('this is me fr')).toBeVisible();
    await expect(drawer.getByText('Publish log')).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/post-drawer-published.png` });
    await page.getByRole('button', { name: 'Close panel' }).click();

    // Connecting the imported v1 account attaches the token to it (by id) and lands on its strategy.
    await page.getByRole('button', { name: 'Connect', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Connect @oldpage' })).toBeVisible();
    await page.getByRole('button', { name: /Paste an access token/ }).click();
    await page.getByLabel('Access token').fill('IGAAT-a-long-pasted-token-value');
    await page.screenshot({ path: `${SHOTS}/wizard-token.png` });
    await page.getByRole('button', { name: 'Connect', exact: true }).last().click();
    await expect(page.getByText('connected with its v1 settings')).toBeVisible();
    const token = state.mutations.find(m => m.path === '/omnigram/connect/token')!.body;
    expect(token).toMatchObject({ token: 'IGAAT-a-long-pasted-token-value', reconnectAccountId: 'a-old', preset: null, autopilot: false });
    await page.getByRole('button', { name: 'Review the strategy' }).click();
    await expect(page).toHaveURL(/\/schemery\/omnigram\/account\/a-old\?tab=strategy/);
});

test('account: queue editing and approval send JSON bodies', async ({ page }) => {
    const state = buildState();
    await mockApi(page, state);
    await page.setViewportSize({ width: 1500, height: 1100 });
    await page.goto('/schemery/omnigram/account/a-memes');

    await expect(page.getByRole('heading', { name: '@dankpage' })).toBeVisible(BOOT);
    await expect(page.getByText('Content runway')).toBeVisible();
    await expect(page.getByText('37', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Instagram API posts, last 24 h')).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/account-overview.png`, fullPage: true });

    await page.getByRole('tab', { name: /Queue/ }).click();
    await expect(page.getByText('post(s) are waiting for approval')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/account-queue.png`, fullPage: true });

    await page.getByText('when the code works on the first try').click();
    const caption = page.locator('#ig-caption');
    await expect(caption).toHaveValue('when the code works on the first try');
    await caption.fill('when the code works on the first try (it does not)');
    await expect(page.getByText('#memes').first()).toBeVisible();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omnigram/posts/update')?.body?.caption).toBe('when the code works on the first try (it does not)');
    await page.screenshot({ path: `${SHOTS}/post-drawer-edit.png` });
    await page.getByRole('button', { name: 'Close panel' }).click();

    await page.getByRole('button', { name: 'Approve all' }).click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omnigram/posts/approve')?.body).toEqual({ accountId: 'a-memes' });

    // A carousel shows its items.
    await page.getByText('rate my desk setup 1-10').click();
    await expect(page.getByRole('group', { name: 'Carousel items' })).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/post-drawer-carousel.png` });
});

test('account: analytics, strategy edits, caption preview and comment replies', async ({ page }) => {
    const state = buildState();
    await mockApi(page, state);
    await page.setViewportSize({ width: 1500, height: 1100 });
    await page.goto('/schemery/omnigram/account/a-memes?tab=analytics');

    await expect(page.getByText('Best times to post')).toBeVisible(BOOT);
    await expect(page.getByText('When followers are online')).toBeVisible();
    await expect(page.getByText('Hashtags that work')).toBeVisible();
    await expect(page.getByText('#devlife').first()).toBeVisible();
    await expect(page.getByText('Men', { exact: true })).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}/account-analytics.png`, fullPage: true });

    await page.getByRole('tab', { name: 'Strategy' }).click();
    await expect(page.getByText('When to post')).toBeVisible();
    await expect(page.getByText('1 post a week.')).toBeVisible();
    await page.getByRole('button', { name: 'Daily 18:00' }).click();
    await expect(page.getByText('7 posts a week.')).toBeVisible();
    await page.getByRole('button', { name: /Try it on the next item/ }).click();
    await expect(page.getByText('pov: the senior dev reviews your first PR', { exact: false }).first()).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/account-strategy.png`, fullPage: true });

    await page.getByRole('button', { name: 'Save strategy' }).first().click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omnigram/accounts/update')?.body?.strategy?.Slots?.length).toBe(7);
    const saved = state.mutations.find(m => m.path === '/omnigram/accounts/update')!.body;
    expect(saved.strategy.Slots.every((s: any) => typeof s.Day === 'number')).toBe(true);
    expect(saved.requireApproval).toBe(true);
    const preview = state.mutations.find(m => m.path === '/omnigram/captions/preview')!.body;
    expect(preview.accountId).toBe('a-memes');
    expect(preview.strategy.Ai.Persona).toContain('deadpan');

    await page.getByRole('tab', { name: /Comments/ }).click();
    await expect(page.getByText('this is me fr')).toBeVisible();
    await expect(page.getByText('the build server did')).toBeVisible();
    await page.getByRole('button', { name: 'Reply', exact: true }).first().click();
    await page.getByPlaceholder('Reply to @senior_dev_42…').fill('same tbh');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omnigram/comments/reply')?.body).toEqual({ accountId: 'a-memes', commentId: 'c1', message: 'same tbh' });
    await page.screenshot({ path: `${SHOTS}/account-comments.png`, fullPage: true });
});

test('compose: uploads a reel and creates the post with a JSON body', async ({ page }) => {
    const state = buildState();
    await mockApi(page, state);
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto('/schemery/omnigram/compose?account=a-memes');

    await expect(page.getByRole('heading', { name: 'Compose a post' })).toBeVisible(BOOT);
    await page.locator('input[type=file]').setInputFiles({ name: 'clip.mp4', mimeType: 'video/mp4', buffer: Buffer.from('fake') });
    await expect(page.getByText('uploaded', { exact: true })).toBeVisible();
    await page.locator('#ig-c-caption').fill('ship it on a friday');
    await page.getByRole('button', { name: /Draft a caption/ }).click();
    await expect(page.getByText('pov: the senior dev reviews your first PR')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/compose.png`, fullPage: true });
    await page.getByRole('button', { name: /Publish to 1 account/ }).click();

    await expect(page.getByText('Created 1 post')).toBeVisible();
    const body = state.mutations.find(m => m.path === '/omnigram/posts/create')!.body;
    expect(body).toMatchObject({ accountIds: ['a-memes'], format: 'Reel', media: [{ mediaId: '0123456789ab' }], captionMode: 'Manual', caption: 'ship it on a friday', scheduledUtc: null, useAccountExtras: true });
    const previewBody = state.mutations.find(m => m.path === '/omnigram/captions/preview')!.body;
    expect(previewBody).toMatchObject({ accountId: 'a-memes', mediaId: '0123456789ab' });
});

test('settings: app, public media link, v1 passwords and Instagram login', async ({ page }) => {
    const state = buildState();
    await mockApi(page, state);
    await page.setViewportSize({ width: 1500, height: 1100 });
    await page.goto('/schemery/omnigram/settings');

    await expect(page.getByText('Instagram app', { exact: true })).toBeVisible(BOOT);
    await expect(page.getByText('https://klive.dev/omnigram/oauth/callback').first()).toBeVisible();
    await expect(page.getByText('Instagram fetches media')).toBeVisible();
    await expect(page.getByText(/ffmpeg version 7\.1/)).toBeVisible();
    await expect(page.getByText('OmniGram v1 left Instagram passwords on the server in plain text.')).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/settings.png`, fullPage: true });

    await page.getByRole('button', { name: 'Check now' }).click();
    await expect.poll(() => state.mutations.some(m => m.path === '/omnigram/settings/check-public-url')).toBe(true);

    await page.getByRole('button', { name: 'Remove v1 passwords' }).click();
    await page.getByRole('button', { name: 'Remove passwords' }).click();
    await expect.poll(() => state.mutations.some(m => m.path === '/omnigram/settings/remove-v1-passwords')).toBe(true);
    await expect(page.getByText('OmniGram v1 left Instagram passwords on the server in plain text.')).toHaveCount(0);

    // Instagram login: a popup, polling until the flow completes.
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Connect an account' }).first().click();
    await page.getByRole('button', { name: /Log in with Instagram/ }).first().click();
    await page.getByRole('button', { name: 'Log in with Instagram', exact: true }).click();
    const popup = await popupPromise;
    await popup.close();
    await expect(page.getByText('@freshpage is connected')).toBeVisible({ timeout: 15_000 });
    const begin = state.mutations.find(m => m.path === '/omnigram/connect/begin')!.body;
    expect(begin).toMatchObject({ reconnectAccountId: null, preset: 'weekly-reels', autopilot: false });
    await page.screenshot({ path: `${SHOTS}/wizard-done.png` });
});

test('pages hold together at phone width', async ({ page }) => {
    const state = buildState();
    await mockApi(page, state);
    await page.setViewportSize({ width: 390, height: 844 });
    const horizontalOverflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

    await page.goto('/schemery/omnigram');
    await expect(page.getByRole('heading', { name: 'Instagram accounts' })).toBeVisible(BOOT);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/mobile-overview.png`, fullPage: true });
    expect(await horizontalOverflow()).toBeLessThanOrEqual(1);

    // In-app navigation after the first load, as a person moves around. (A full dev-server load per page also
    // fetches hundreds of unbundled modules; on Windows a long run can exhaust sockets: net::ERR_NO_BUFFER_SPACE.)
    const nav = page.getByRole('navigation', { name: 'OmniGram sections' });
    const check = async (marker: string, shot: string) => {
        await expect(page.getByText(marker).first()).toBeVisible();
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${SHOTS}/${shot}.png`, fullPage: true });
        expect(await horizontalOverflow(), shot).toBeLessThanOrEqual(1);
    };

    await nav.getByRole('link', { name: /@dankpage/ }).click();
    await expect(page.getByRole('heading', { name: '@dankpage' })).toBeVisible();
    for (const [tab, marker, shot] of [
        ['Analytics', 'Best times to post', 'mobile-analytics'],
        ['Strategy', 'When to post', 'mobile-strategy'],
        ['Published', 'Post history', 'mobile-published'],
    ] as const) {
        await page.getByRole('tab', { name: tab }).click();
        await check(marker, shot);
    }

    await nav.getByRole('link', { name: 'Compose' }).click();
    await check('Compose a post', 'mobile-compose');
    await nav.getByRole('link', { name: /Settings/ }).click();
    await check('Public media link', 'mobile-settings');
});
