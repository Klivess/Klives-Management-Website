import { expect, test, type Page } from '@playwright/test';

/**
 * OmniTumblr pages against a stateful mock of the /omnitumblr API. Besides the assertions, each step
 * saves a screenshot under test-results/omnitumblr/ for visual review.
 */

const apiOrigin = 'https://klive.dev';
const NOW = Date.now();
const iso = (offsetMinutes: number) => new Date(NOW + offsetMinutes * 60_000).toISOString();
const SHOTS = 'test-results/omnitumblr';
/** The first page a cold dev server serves compiles the whole app. */
const BOOT = { timeout: 45_000 };

test.describe.configure({ timeout: 120_000 });

function thumbSvg(seed: string) {
    let h = 0;
    for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const a = h % 360;
    const b = (a + 60) % 360;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="270" height="480" viewBox="0 0 270 480">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${a},55%,38%)"/><stop offset="1" stop-color="hsl(${b},60%,18%)"/></linearGradient></defs>
<rect width="270" height="480" fill="url(#g)"/><circle cx="135" cy="200" r="58" fill="rgba(255,255,255,0.18)"/>
<text x="135" y="360" text-anchor="middle" font-family="sans-serif" font-size="30" fill="rgba(255,255,255,0.85)">meme ${seed.slice(-3)}</text></svg>`;
}

function post(id: string, blog: { BlogId: string; Name: string }, over: Record<string, unknown> = {}) {
    return {
        PostId: id, BlogId: blog.BlogId, BlogName: blog.Name, Status: 'Ready', Origin: 'Autopilot', Kind: 'Video',
        ScheduledUtc: iso(60 * 26), SlotUtc: iso(60 * 26), PublishedUtc: null, NextAttemptUtc: null,
        Caption: 'me at 3am realising the dishwasher has been my therapist all along', Title: null, LinkUrl: null,
        Tags: ['memes', 'relatable', 'cats', 'late night'], CaptionPending: false, CaptionMode: 'AI', CaptionError: null, CaptionEdited: false,
        UsedVision: true, CaptionModel: 'qwen3-vl', Approved: true, HasThumbnail: true, MediaCount: 1, IsVideo: true, DurationSeconds: 14.2,
        Width: 720, Height: 1280, Bytes: 3_400_000, BlockedReason: null, LastError: null, LastErrorCode: null, Attempts: 0, TumblrUrl: null,
        TumblrPostId: null, Notes: 0, Likes: null, Reblogs: null, Replies: null, NotesAt24h: null, NotesAt7d: null, MetricsSyncedUtc: null,
        ContentSource: 'MemeScraper', ContentOrigin: 'catmemes.daily', ContentUrl: 'https://www.instagram.com/reel/abc/',
        OriginalCaption: 'when the cat knows #catsofinstagram follow @catmemes.daily', ContentViews: 812000, TumblrState: 'Published',
        ...over,
    };
}

function strategy(over: Record<string, unknown> = {}) {
    return {
        TimeZone: 'Europe/London', Slots: [{ Day: 5, Minute: 1080 }, { Day: 2, Minute: 1080 }], JitterMinutes: 7, PlanAheadDays: 7, MaxPostsPerDay: 8,
        MinGapMinutes: 30, MissedSlots: 'PublishLate', MissedSlotGraceHours: 6, Source: 'MemeScraper',
        MemeScraper: { Niches: ['cats'], Sources: [], MaxAgeDays: 120, MinViews: 0, MaxDurationSeconds: 180, Pick: 'Best', AllowReuseAcrossBlogs: false },
        Folder: { Path: '', IncludeSubfolders: false, Images: true, Videos: true, Pick: 'Random' },
        CaptionMode: 'AI', FixedCaption: '', CaptionPool: [],
        Ai: { Persona: 'A deadpan, terminally online meme blog. Dry, short and funny.', Instructions: 'lowercase only', Examples: ['cat.exe has stopped working'], MaxLength: 120, UseVision: true, UseSourceCaption: true, SuggestTags: true, MaxSuggestedTags: 5, AllowEmoji: true, Language: 'English', Fallback: 'Empty', Model: null },
        FixedTags: ['memes', 'funny'], RotatingTags: ['relatable', 'lol', 'mood'], RotatingTagsPerPost: 2, MaxTags: 12, PostState: 'Published', CreditSource: false,
        ...over,
    };
}

function buildState() {
    const meme = { BlogId: 'b-meme', Name: 'memeblog' };
    const side = { BlogId: 'b-side', Name: 'sideblog' };
    const posts = [
        post('p-next', meme, { ScheduledUtc: iso(150), SlotUtc: iso(150) }),
        post('p-approval', meme, { Status: 'AwaitingApproval', Approved: false, ScheduledUtc: iso(60 * 24 * 3), SlotUtc: iso(60 * 24 * 3), Caption: 'my last brain cell watching me try to adult' }),
        post('p-pending', meme, { Status: 'Planned', CaptionPending: true, Caption: null, ScheduledUtc: iso(60 * 24 * 6), SlotUtc: iso(60 * 24 * 6), HasThumbnail: false }),
        post('p-pub1', meme, { Status: 'Published', ScheduledUtc: iso(-60 * 50), PublishedUtc: iso(-60 * 50), TumblrPostId: '7700001', TumblrUrl: 'https://www.tumblr.com/memeblog/7700001', Notes: 412, Likes: 280, Reblogs: 119, Replies: 13, NotesAt24h: 301, MetricsSyncedUtc: iso(-20), Caption: 'nobody: my cat at 3am: parkour' }),
        post('p-pub2', meme, { Status: 'Published', ScheduledUtc: iso(-60 * 24 * 4), PublishedUtc: iso(-60 * 24 * 4), TumblrPostId: '7700002', TumblrUrl: 'https://www.tumblr.com/memeblog/7700002', Notes: 96, Likes: 70, Reblogs: 22, Replies: 4, NotesAt24h: 80, NotesAt7d: null, MetricsSyncedUtc: iso(-40), Caption: 'the audacity of this dog' }),
        post('p-failed', meme, { Status: 'Failed', ScheduledUtc: iso(-60 * 30), LastError: 'Tumblr rejected the post (400.8005): The uploaded media is an invalid format', LastErrorCode: '400.8005', Attempts: 1 }),
        post('p-side', side, { Origin: 'Manual', Kind: 'Text', IsVideo: false, HasThumbnail: false, Caption: 'reminder: drink water', Title: 'PSA', ScheduledUtc: iso(60 * 5), ContentSource: null, ContentOrigin: null }),
    ];
    const blogs = [
        { ...meme, Title: 'Cat memes, daily-ish', Url: 'https://memeblog.tumblr.com/', Autopilot: true, Paused: false, RequireApproval: false, ConnectionId: 'c-1', ConnectionUser: 'klives', ConnectionHealth: 'Healthy', Followers: 12840, FollowersDelta7d: 312, FollowersSpark: [12400, 12430, 12470, 12520, 12580, 12610, 12690, 12740, 12800, 12840], Posts: 642, LastPublishedUtc: iso(-60 * 50), Pending: 3, AwaitingApproval: 1, Published7d: 2, Failed7d: 1, Notes30d: 1820, AvgNotes30d: 151.7, SlotsPerWeek: 2, Source: 'MemeScraper', CaptionMode: 'AI', TimeZone: 'Europe/London', LastError: null, LastErrorUtc: null, ConsecutiveFailures: 0, ContentWarning: null, State: 'attention', StateReason: 'Posts are waiting for approval' },
        { ...side, Title: 'Side blog', Url: 'https://sideblog.tumblr.com/', Autopilot: false, Paused: false, RequireApproval: false, ConnectionId: 'c-1', ConnectionUser: 'klives', ConnectionHealth: 'Healthy', Followers: 87, FollowersDelta7d: -2, FollowersSpark: [90, 89, 89, 88, 87], Posts: 31, LastPublishedUtc: null, Pending: 1, AwaitingApproval: 0, Published7d: 0, Failed7d: 0, Notes30d: 0, AvgNotes30d: null, SlotsPerWeek: 0, Source: 'None', CaptionMode: 'None', TimeZone: 'Europe/London', LastError: null, LastErrorUtc: null, ConsecutiveFailures: 0, ContentWarning: null, State: 'ok', StateReason: 'Manual posting' },
    ];
    return {
        blogs,
        posts,
        strategies: { 'b-meme': strategy(), 'b-side': strategy({ Source: 'None', CaptionMode: 'None', Slots: [], FixedTags: [] }) } as Record<string, any>,
        events: [
            { Utc: iso(-50), Level: 'Success', Kind: 'publish.ok', Message: '@memeblog: published video — https://www.tumblr.com/memeblog/7700001', BlogId: 'b-meme', PostId: 'p-pub1', BlogName: 'memeblog' },
            { Utc: iso(-30), Level: 'Error', Kind: 'publish.failed', Message: '@memeblog: Tumblr rejected the post (400.8005): The uploaded media is an invalid format', BlogId: 'b-meme', PostId: 'p-failed', BlogName: 'memeblog' },
            { Utc: iso(-10), Level: 'Info', Kind: 'plan', Message: '@memeblog: planned 2 post(s) for upcoming slots.', BlogId: 'b-meme', PostId: null, BlogName: 'memeblog' },
        ],
        mutations: [] as { path: string; body: any }[],
        flowPolls: 0,
    };
}

type MockState = ReturnType<typeof buildState>;

const connection = (state: MockState) => ({
    ConnectionId: 'c-1', UserName: 'klives', AuthMode: 'OAuth1', Health: 'Healthy', HealthDetail: null, HealthChangedUtc: null,
    LastVerifiedUtc: iso(-25), CreatedUtc: iso(-60 * 24 * 30), AccessTokenExpiresUtc: null, LimitsFetchedUtc: iso(-15),
    Limits: [
        { Key: 'posts', Description: 'Posts per day', Limit: 250, Remaining: 246, ResetUtc: iso(60 * 9) },
        { Key: 'videos', Description: 'Videos per day', Limit: 20, Remaining: 18, ResetUtc: iso(60 * 9) },
    ],
    Blogs: [
        { Name: 'memeblog', Uuid: 't:meme', Title: 'Cat memes, daily-ish', Url: 'https://memeblog.tumblr.com/', Followers: 12840, Primary: true, Type: 'public', AvatarUrl: '', Managed: true, ManagedBlogId: 'b-meme' },
        { Name: 'sideblog', Uuid: 't:side', Title: 'Side blog', Url: 'https://sideblog.tumblr.com/', Followers: 87, Primary: false, Type: 'public', AvatarUrl: '', Managed: true, ManagedBlogId: 'b-side' },
        { Name: 'artdump', Uuid: 't:art', Title: 'Art dump', Url: 'https://artdump.tumblr.com/', Followers: 4, Primary: false, Type: 'public', AvatarUrl: '', Managed: state.blogs.some(b => b.Name === 'artdump'), ManagedBlogId: null },
    ],
    ManagedBlogs: state.blogs.length,
});

function engine() {
    return {
        Enabled: true, Running: true, PublishingEnabled: true, StartupState: 'running', StartedUtc: iso(-60 * 5),
        Loops: [
            { Name: 'publish', State: 'idle', LastTickUtc: iso(-0.2), LastActivityUtc: iso(-50), LastActivity: 'published 1 post(s)', LastError: null, LastErrorUtc: null, Ticks: 840 },
            { Name: 'plan', State: 'idle', LastTickUtc: iso(-0.5), LastActivityUtc: iso(-10), LastActivity: 'planned 2, prepared 2', LastError: null, LastErrorUtc: null, Ticks: 400 },
            { Name: 'sync', State: 'idle', LastTickUtc: iso(-0.7), LastActivityUtc: iso(-3), LastActivity: 'ran 3 sync job(s)', LastError: null, LastErrorUtc: null, Ticks: 300 },
        ],
        Api: { CallsThisHour: 37, CallsToday: 412, HourlyLimit: 1000, DailyLimit: 5000, PerHourRemaining: 963, PerDayRemaining: 4588, HeadersObservedUtc: iso(-2), ByEndpointToday: { 'blog/posts': 120 } },
        MemeScraperReady: true, AiAvailable: true, Migration: 'No v1 data to import.', SyncErrors: [],
    };
}

const app = () => ({ Configured: true, KeyHint: 'Qx9a', CallbackUrl: 'https://klive.dev/omnitumblr/oauth/callback', AuthMode: 'OAuth1', VerifiedUtc: iso(-60 * 24 * 2), LastVerifyError: null, UpdatedUtc: iso(-60 * 24 * 2) });

function analytics(blogId: string | null, days: number) {
    const series = Array.from({ length: Math.min(days, 30) }, (_, i) => ({ T: iso(-60 * 24 * (Math.min(days, 30) - i)), V: 12000 + i * 28 + (i % 4) * 9 }));
    const dayKey = (i: number) => new Date(NOW - i * 86_400_000).toISOString().slice(0, 10);
    const posting = Array.from({ length: Math.min(days, 30) + 1 }, (_, i) => ({ Day: dayKey(Math.min(days, 30) - i), Ours: i % 3 === 0 ? 1 : 0, Others: i % 11 === 0 ? 1 : 0, Notes: i % 3 === 0 ? 60 + (i * 37) % 400 : 0 }));
    const activity = posting.map((p, i) => ({ Day: p.Day, Likes: 20 + (i * 13) % 70, Reblogs: 5 + (i * 7) % 25, Replies: i % 5, Follows: 3 + (i * 3) % 12, Other: 0 }));
    const heat: { Dow: number; Hour: number; Posts: number; AvgNotes: number }[] = [];
    for (const dow of [1, 2, 4, 5, 6]) for (const hour of [9, 13, 18, 21]) heat.push({ Dow: dow, Hour: hour, Posts: 2 + (dow + hour) % 4, AvgNotes: 30 + ((dow * 37 + hour * 11) % 260) });
    return {
        BlogId: blogId, Days: days, FromUtc: iso(-60 * 24 * days), ToUtc: iso(0), TimeZone: 'Europe/London', Followers: 12927, FollowersDelta: 840, FollowersGrowthPerWeek: 196,
        PostsPublished: 9, PostsPublishedPrev: 7, Notes: 1820, NotesPrev: 1410, AvgNotes: 202.2, MedianNotes: 151, EngagementRate: 1.574, Likes: 1210, Reblogs: 512, Replies: 98,
        FollowersSeries: series, Posting: posting, Activity: activity, Heatmap: heat, BestSlotLabel: 'Friday 18:00–19:00 (290 notes avg over 4 posts)',
        TopPosts: [
            { Id: '7700001', BlogId: 'b-meme', BlogName: 'memeblog', OmniPostId: 'p-pub1', Url: 'https://www.tumblr.com/memeblog/7700001', Summary: 'nobody: my cat at 3am: parkour', Type: 'video', Notes: 412, PublishedUtc: iso(-60 * 50), Ours: true, HasThumbnail: true },
            { Id: '7600009', BlogId: 'b-meme', BlogName: 'memeblog', OmniPostId: null, Url: 'https://www.tumblr.com/memeblog/7600009', Summary: 'reblog of a classic', Type: 'photo', Notes: 233, PublishedUtc: iso(-60 * 24 * 9), Ours: false, HasThumbnail: false },
            { Id: '7700002', BlogId: 'b-meme', BlogName: 'memeblog', OmniPostId: 'p-pub2', Url: 'https://www.tumblr.com/memeblog/7700002', Summary: 'the audacity of this dog', Type: 'video', Notes: 96, PublishedUtc: iso(-60 * 24 * 4), Ours: true, HasThumbnail: true },
        ],
        Tags: [{ Key: 'cats', Posts: 6, AvgNotes: 241, TotalNotes: 1446 }, { Key: 'relatable', Posts: 4, AvgNotes: 180, TotalNotes: 720 }, { Key: 'dogs', Posts: 3, AvgNotes: 71, TotalNotes: 213 }],
        Sources: [{ Key: 'catmemes.daily', Posts: 6, AvgNotes: 241, TotalNotes: 1446 }, { Key: 'doggo.memes', Posts: 3, AvgNotes: 71, TotalNotes: 213 }],
        CaptionModes: [{ Key: 'AI (vision)', Posts: 8, AvgNotes: 214, TotalNotes: 1712 }, { Key: 'AI', Posts: 1, AvgNotes: 108, TotalNotes: 108 }],
        Kinds: [{ Key: 'Video', Posts: 9, AvgNotes: 202, TotalNotes: 1820 }], SampleSize: 34,
    };
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
        const blogById = (id: string | null) => state.blogs.find(b => b.BlogId === id);

        if (path === '/KMProfiles/LoginStatus') return route.fulfill({ status: 200, headers: cors, body: 'SessionActive' });
        if (path === '/KMProfiles/GetCurrentProfile') return json({ Name: 'Klives', KlivesManagementRank: 5 });

        if (request.method() === 'POST') {
            let body: any = null;
            const raw = request.postData();
            if (raw && (request.headers()['content-type'] ?? '').includes('json')) body = JSON.parse(raw); // throws on "[object Object]" — the v1 bug
            state.mutations.push({ path, body });
        }

        switch (path) {
            case '/omnitumblr/overview': {
                const upcoming = state.posts.filter(p => ['Planned', 'Ready', 'AwaitingApproval'].includes(p.Status)).sort((a, b) => a.ScheduledUtc.localeCompare(b.ScheduledUtc));
                return json({
                    NowUtc: iso(0), Engine: engine(), App: app(), Connections: [connection(state)],
                    Kpis: { Followers: 12927, FollowersDelta7d: 310, FollowersDelta30d: 840, FollowersSeries: analytics(null, 30).FollowersSeries, Published7d: 2, PublishedPrev7d: 3, Notes30d: 1820, AvgNotes30d: 151.7, Pending: upcoming.length, AwaitingApproval: upcoming.filter(p => p.Status === 'AwaitingApproval').length, Failed7d: 1, SuccessRate30d: 92.3, NextPostUtc: upcoming[0]?.ScheduledUtc ?? null, NextPostBlog: upcoming[0]?.BlogName ?? null, AutopilotBlogs: state.blogs.filter(b => b.Autopilot).length, Blogs: state.blogs.length },
                    Blogs: state.blogs.map(b => ({ ...b, NextPost: upcoming.find(p => p.BlogId === b.BlogId) ?? null, LastPost: state.posts.find(p => p.BlogId === b.BlogId && p.Status === 'Published') ?? null })),
                    Upcoming: upcoming, RecentlyPublished: state.posts.filter(p => p.Status === 'Published'),
                    Attention: state.posts.some(p => p.Status === 'AwaitingApproval')
                        ? [{ Level: 'info', Title: '1 post(s) on @memeblog need approval', Detail: 'Approve them in the queue or turn off approval in the blog\'s strategy.', BlogId: 'b-meme', ConnectionId: null, Action: 'queue' }]
                        : [],
                    Events: [...state.events].reverse(),
                });
            }
            case '/omnitumblr/dashboard-stats':
                return json({ TotalAccounts: 2, ActiveAccounts: 2, AutopilotBlogs: 1, PendingCount: 4, SuccessRate: 92, TotalFollowers: 12927, PostsThisWeek: 2, AttentionCount: 0 });
            case '/omnitumblr/blog': {
                const b = blogById(qp('blogId'));
                if (!b) return json({ error: 'No such blog.' }, 404);
                const mine = state.posts.filter(p => p.BlogId === b.BlogId);
                const pending = mine.filter(p => ['Planned', 'Ready', 'AwaitingApproval', 'Draft'].includes(p.Status)).sort((x, y) => x.ScheduledUtc.localeCompare(y.ScheduledUtc));
                return json({
                    NowUtc: iso(0),
                    Summary: { ...b, NextPost: pending[0] ?? null, LastPost: null, Pending: pending.length, AwaitingApproval: pending.filter(p => p.Status === 'AwaitingApproval').length },
                    Blog: {
                        BlogId: b.BlogId, Name: b.Name, Uuid: 't:x', Title: b.Title, Description: 'Cats. Mostly.', Url: b.Url, ConnectionId: 'c-1', Autopilot: b.Autopilot, Paused: b.Paused,
                        RequireApproval: b.RequireApproval, Notes: '', AddedUtc: iso(-60 * 24 * 40),
                        Stats: { Followers: b.Followers, Posts: b.Posts, Likes: null, InfoSyncedUtc: iso(-60), FollowersSyncedUtc: iso(-60), PostsIndexSyncedUtc: iso(-20), ActivitySyncedUtc: iso(-12), LastPublishedUtc: b.LastPublishedUtc },
                        Health: { LastError: b.BlogId === 'b-meme' ? 'Tumblr rejected the post (400.8005)' : null, LastErrorUtc: iso(-30), ConsecutiveFailures: 0, LastSuccessUtc: iso(-50), ContentWarning: null, ContentWarningUtc: null },
                        Strategy: state.strategies[b.BlogId], UsedContentCount: 41, RejectedContentCount: 1,
                    },
                    Connection: connection(state),
                    Pending: pending,
                    History: mine.filter(p => ['Published', 'Failed', 'Skipped', 'Cancelled', 'Removed'].includes(p.Status)),
                    Events: state.events.filter(e => e.BlogId === b.BlogId).reverse(),
                    Activity: [
                        { Id: 'a1', Type: 'follow', Utc: iso(-14), FromBlog: 'sleepycatgirl', TargetPostId: null, Text: null },
                        { Id: 'a2', Type: 'reblog_with_content', Utc: iso(-33), FromBlog: 'memeconnoisseur', TargetPostId: '7700001', Text: 'LMAO the jump' },
                        { Id: 'a3', Type: 'like', Utc: iso(-35), FromBlog: 'night-owl-99', TargetPostId: '7700001', Text: null },
                    ],
                    Runway: b.Autopilot
                        ? { Eligible: 37, SlotsPerWeek: 2, WeeksOfContent: 18.5, Source: 'MemeScraper', Next: Array.from({ length: 8 }, (_, i) => ({ Key: `ig:${900 + i}`, Source: 'MemeScraper', Kind: 'Video', Origin: 'catmemes.daily', OriginalUrl: null, Views: 400000 - i * 30000, Likes: 20000, CreatedUtc: iso(-60 * 24 * (i + 1)), OriginalCaption: 'cat compilation', DurationSeconds: 9 + i, FileName: `${900 + i}.mp4` })) }
                        : { Eligible: 0, SlotsPerWeek: 0, WeeksOfContent: null, Source: 'None', Next: [] },
                });
            }
            case '/omnitumblr/analytics':
                return json(analytics(qp('blogId'), Number(qp('days') ?? 30)));
            case '/omnitumblr/post': {
                const p = state.posts.find(x => x.PostId === qp('postId'));
                if (!p) return json({ error: 'No such post.' }, 404);
                return json({
                    Post: p,
                    Media: p.IsVideo ? [{ Index: 0, MimeType: 'video/mp4', Bytes: p.Bytes, Width: p.Width, Height: p.Height, DurationSeconds: p.DurationSeconds, HasThumbnail: p.HasThumbnail, Exists: true, FileName: 'reel.mp4' }] : [],
                    AttemptLog: p.Status === 'Failed' ? [{ Utc: iso(-30), Ok: false, Code: '400.8005', Message: p.LastError, DurationMs: 4200 }] : p.Status === 'Published' ? [{ Utc: p.PublishedUtc, Ok: true, Code: '201', Message: null, DurationMs: 8800 }] : [],
                    MetricsHistory: p.Status === 'Published' ? [{ Utc: p.PublishedUtc, Notes: 0 }, { Utc: iso(-60 * 40), Notes: 120 }, { Utc: iso(-60 * 20), Notes: 301 }, { Utc: iso(-20), Notes: p.Notes }] : [],
                    CaptionInfo: { Mode: 'AI', Model: 'qwen3-vl', UsedVision: true, GeneratedUtc: iso(-90), Edited: p.CaptionEdited, Error: null, Failures: 0, AltText: 'A cat leaps across a kitchen counter at night.', SuggestedTags: ['cats', 'parkour'], Direction: null },
                    Content: p.ContentSource ? { Kind: 'MemeScraper', Key: 'ig:123', Origin: 'catmemes.daily', OriginalCaption: p.OriginalCaption, OriginalUrl: 'https://www.instagram.com/reel/abc/', Views: 812000, Likes: 40000, CreatedUtc: iso(-60 * 24 * 3) } : null,
                    Slug: 'nobody-my-cat-at-3am-parkour-1a2b3c4d', Deferrals: 0, NeedsReconcile: false, ManualOverride: false, CreatedUtc: iso(-60 * 24), UpdatedUtc: iso(-90),
                });
            }
            case '/omnitumblr/media':
            case '/omnitumblr/content/thumb':
                return route.fulfill({ status: 200, headers: cors, contentType: 'image/svg+xml', body: thumbSvg(qp('postId') ?? qp('key') ?? 'x') });
            case '/omnitumblr/memescraper/options':
                return json({ Ready: true, TotalReels: 1840, DownloadedReels: 1780, Niches: [{ Name: 'cats', Sources: 3, Reels: 620 }, { Name: 'dogs', Sources: 2, Reels: 410 }, { Name: 'gaming', Sources: 4, Reels: 790 }], Sources: [{ Username: 'catmemes.daily', Niches: ['cats'], Reels: 300, NewestUtc: iso(-60) }, { Username: 'doggo.memes', Niches: ['dogs'], Reels: 220, NewestUtc: iso(-120) }] });
            case '/omnitumblr/library':
                return json({ BlogId: qp('blogId'), Files: [] });
            case '/omnitumblr/settings':
                return json({ App: app(), Connections: [connection(state)], Engine: engine(), Presets: ['weekly-memes', 'daily-memes', 'manual'], DefaultStrategy: strategy() });
            case '/omnitumblr/events':
                return json([...state.events].reverse());
            case '/omnitumblr/connect/begin':
                return json({ flowId: 'flow-1', authorizationUrl: 'https://www.tumblr.com/oauth/authorize?oauth_token=abc', mode: 'OAuth1', callbackUrl: app().CallbackUrl });
            case '/omnitumblr/connect/status':
                state.flowPolls++;
                return json(state.flowPolls < 2
                    ? { FlowId: 'flow-1', State: 'pending', Error: null, Mode: 'OAuth1', ConnectionId: null, Connection: null }
                    : { FlowId: 'flow-1', State: 'completed', Error: null, Mode: 'OAuth1', ConnectionId: 'c-1', Connection: connection(state) });
            case '/omnitumblr/blogs/add': {
                const body = state.mutations[state.mutations.length - 1].body;
                const added = (body.blogs as string[]).map(name => ({ ...state.blogs[1], BlogId: `b-${name}`, Name: name, Title: 'Art dump', Autopilot: !!body.autopilot }));
                state.blogs.push(...added);
                state.strategies[added[0].BlogId] = strategy();
                return json({ Added: added, Skipped: [] });
            }
            case '/omnitumblr/blogs/update': {
                const body = state.mutations[state.mutations.length - 1].body;
                const b = blogById(body.blogId);
                if (b && typeof body.autopilot === 'boolean') b.Autopilot = body.autopilot;
                if (b && typeof body.paused === 'boolean') b.Paused = body.paused;
                if (body.strategy) state.strategies[body.blogId] = body.strategy;
                return json({ Summary: b, Notes: body.strategy ? ['Upcoming captions will be rewritten in the new style.'] : [] });
            }
            case '/omnitumblr/posts/update': {
                const body = state.mutations[state.mutations.length - 1].body;
                const p = state.posts.find(x => x.PostId === body.postId)!;
                if (typeof body.caption === 'string') { p.Caption = body.caption; p.CaptionEdited = true; }
                if (Array.isArray(body.tags)) p.Tags = body.tags;
                return json(p);
            }
            case '/omnitumblr/posts/approve': {
                const body = state.mutations[state.mutations.length - 1].body;
                let approved = 0;
                for (const p of state.posts) {
                    if (p.Status === 'AwaitingApproval' && (p.PostId === body.postId || p.BlogId === body.blogId)) { p.Status = 'Ready'; p.Approved = true; approved++; }
                }
                return json({ approved });
            }
            case '/omnitumblr/posts/create': {
                const body = state.mutations[state.mutations.length - 1].body;
                const created = (body.blogIds as string[]).map((id, i) => post(`p-new-${i}`, blogById(id)!, { Origin: 'Manual', Kind: body.kind, Caption: body.caption, CaptionPending: body.captionMode === 'ai', ScheduledUtc: body.scheduledUtc ?? iso(0) }));
                state.posts.push(...created);
                return json({ Created: created });
            }
            case '/omnitumblr/captions/preview':
                return json({ Caption: 'he has seen things. he will not elaborate.', Tags: ['memes', 'funny', 'cats', 'unhinged'], SuggestedTags: ['cats', 'unhinged'], AltText: 'A cat staring into the distance.', Model: 'qwen3-vl', UsedVision: true, FramesSent: 4, Content: { Key: 'ig:900', Source: 'MemeScraper', Kind: 'Video', Origin: 'catmemes.daily', OriginalUrl: null, Views: 400000, Likes: 20000, CreatedUtc: iso(-60 * 24), OriginalCaption: 'the stare', DurationSeconds: 9, FileName: '900.mp4' } });
            default:
                return json({});
        }
    });
}

test.beforeEach(async ({ context }) => {
    const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '4173'}`).origin;
    await context.addCookies([{ name: 'password', value: 'test-password', url: origin }]);
});

test('overview shows the fleet, attention items, blogs, queue and activity', async ({ page }) => {
    const state = buildState();
    await mockApi(page, state);
    await page.setViewportSize({ width: 1500, height: 1100 });
    await page.goto('/schemery/omnitumblr');

    await expect(page.getByRole('heading', { name: 'Tumblr blogs' })).toBeVisible(BOOT);
    await expect(page.getByText('1 post(s) on @memeblog need approval')).toBeVisible();
    await expect(page.getByRole('link', { name: '@memeblog' }).first()).toBeVisible();
    await expect(page.getByText('12.8k').first()).toBeVisible();
    await expect(page.getByText('Coming up')).toBeVisible();
    await expect(page.getByText('nobody: my cat at 3am: parkour').first()).toBeVisible();
    await expect(page.getByText(/Autopilot running/)).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/overview.png`, fullPage: true });

    // Opening a post shows the drawer with its caption and details.
    await page.getByText('nobody: my cat at 3am: parkour').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Performance')).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/post-drawer-published.png` });
});

test('blog page: queue editing and approval send JSON bodies', async ({ page }) => {
    const state = buildState();
    await mockApi(page, state);
    await page.setViewportSize({ width: 1500, height: 1100 });
    await page.goto('/schemery/omnitumblr/blog/b-meme');

    await expect(page.getByRole('heading', { name: '@memeblog' })).toBeVisible(BOOT);
    await expect(page.getByText('Content runway')).toBeVisible();
    await expect(page.getByText('37', { exact: true })).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/blog-overview.png`, fullPage: true });

    await page.getByRole('tab', { name: /Queue/ }).click();
    await expect(page.getByText('post(s) are waiting for approval')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/blog-queue.png`, fullPage: true });

    // Edit a caption in the drawer.
    await page.getByText('my last brain cell watching me try to adult').click();
    const caption = page.locator('#tb-caption');
    await expect(caption).toHaveValue('my last brain cell watching me try to adult');
    await caption.fill('my last brain cell, unionising');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omnitumblr/posts/update')?.body?.caption).toBe('my last brain cell, unionising');
    await page.screenshot({ path: `${SHOTS}/post-drawer-edit.png` });
    await page.getByRole('button', { name: 'Close panel' }).click();

    await page.getByRole('button', { name: 'Approve all' }).click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omnitumblr/posts/approve')?.body).toEqual({ blogId: 'b-meme' });
});

test('blog page: analytics, strategy edits and caption preview', async ({ page }) => {
    const state = buildState();
    await mockApi(page, state);
    await page.setViewportSize({ width: 1500, height: 1100 });
    await page.goto('/schemery/omnitumblr/blog/b-meme?tab=analytics');

    await expect(page.getByText('Best times to post')).toBeVisible(BOOT);
    await expect(page.getByText('Tags that work')).toBeVisible();
    await expect(page.getByText('#cats').first()).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}/blog-analytics.png`, fullPage: true });

    await page.getByRole('tab', { name: 'Strategy' }).click();
    await expect(page.getByText('When to post')).toBeVisible();
    await page.getByRole('button', { name: 'Daily 18:00' }).click();
    await expect(page.getByText('7 posts a week.')).toBeVisible();
    await page.getByRole('button', { name: /Try it on the next video/ }).click();
    await expect(page.getByText('he has seen things. he will not elaborate.')).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/blog-strategy.png`, fullPage: true });

    await page.getByRole('button', { name: 'Save strategy' }).first().click();
    await expect.poll(() => state.mutations.find(m => m.path === '/omnitumblr/blogs/update')?.body?.strategy?.Slots?.length).toBe(7);
    const preview = state.mutations.find(m => m.path === '/omnitumblr/captions/preview')!.body;
    expect(preview.blogId).toBe('b-meme');
    expect(preview.strategy.Ai.Persona).toContain('deadpan');

    await page.getByRole('tab', { name: 'Activity' }).click();
    await expect(page.getByText('@sleepycatgirl')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/blog-activity.png`, fullPage: true });
});

test('compose creates posts with a JSON body', async ({ page }) => {
    const state = buildState();
    await mockApi(page, state);
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto('/schemery/omnitumblr/compose?blog=b-side');

    await expect(page.getByRole('heading', { name: 'Compose a post' })).toBeVisible(BOOT);
    await page.getByRole('button', { name: 'Text' }).click();
    await page.getByLabel('Title').fill('Weekly reminder');
    await page.locator('textarea').first().fill('drink water, touch grass');
    await page.screenshot({ path: `${SHOTS}/compose.png`, fullPage: true });
    await page.getByRole('button', { name: /Publish to 1 blog/ }).click();

    await expect(page.getByText('Created 1 post')).toBeVisible();
    const body = state.mutations.find(m => m.path === '/omnitumblr/posts/create')!.body;
    expect(body).toMatchObject({ blogIds: ['b-side'], kind: 'Text', captionMode: 'manual', caption: 'drink water, touch grass', title: 'Weekly reminder' });
});

test('settings and the add-blogs wizard', async ({ page }) => {
    const state = buildState();
    await mockApi(page, state);
    await page.setViewportSize({ width: 1500, height: 1100 });
    await page.goto('/schemery/omnitumblr/settings');

    await expect(page.getByText('Tumblr app', { exact: true })).toBeVisible(BOOT);
    await expect(page.getByText('https://klive.dev/omnitumblr/oauth/callback').first()).toBeVisible();
    await expect(page.getByText('Tumblr API calls today')).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/settings.png`, fullPage: true });

    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Connect a Tumblr account' }).first().click();
    await page.getByRole('button', { name: 'Authorize on Tumblr' }).click();
    const popup = await popupPromise;
    await popup.close();
    await expect(page.getByText('@artdump')).toBeVisible({ timeout: 15_000 });
    await page.getByLabel(/@artdump/).check();
    await page.screenshot({ path: `${SHOTS}/wizard-pick.png` });
    await page.getByRole('button', { name: /Manage 1 blog/ }).click();
    await expect(page.getByText('Now managing @artdump')).toBeVisible();
    const add = state.mutations.find(m => m.path === '/omnitumblr/blogs/add')!.body;
    expect(add).toMatchObject({ connectionId: 'c-1', blogs: ['artdump'], preset: 'weekly-memes' });
});

test('pages hold together at phone width', async ({ page }) => {
    const state = buildState();
    await mockApi(page, state);
    await page.setViewportSize({ width: 390, height: 844 });
    const horizontalOverflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

    await page.goto('/schemery/omnitumblr');
    await expect(page.getByRole('heading', { name: 'Tumblr blogs' })).toBeVisible(BOOT);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/mobile-overview.png`, fullPage: true });
    expect(await horizontalOverflow()).toBeLessThanOrEqual(1);

    await page.goto('/schemery/omnitumblr/blog/b-meme?tab=analytics');
    await expect(page.getByText('Best times to post')).toBeVisible(BOOT);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/mobile-analytics.png`, fullPage: true });
    expect(await horizontalOverflow()).toBeLessThanOrEqual(1);
});
