import type { Page, Route } from '@playwright/test';
import { catalogPayload, mePayload } from './permissions';

/**
 * A stateful stand-in for /omnitumblr/* behind the console. Shapes follow the C# DTOs (OmniTumblrViews,
 * OmniTumblrFleetPulse); the November 2026 fields (EdgeHistory, Week, Engine.Store, MediaVersion) can be
 * left out to play a server from before them. No real people, blogs or tokens: every name is made up.
 */

export const tumblrTestOrigin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '4173'}`).origin;

export interface TumblrMockOptions {
  /** A server from before EdgeHistory / Week / MediaVersion. */
  legacy?: boolean;
  /** Tumblr's edge is refusing the server right now. */
  blocked?: boolean;
}

export interface TumblrApiMock {
  posts: { path: string; body: any }[];
  batchCalls: string[][];
  directGets: string[];
  state: ReturnType<typeof buildState>;
}

const NOW = Date.now();
const iso = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

function thumbSvg(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = h % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="270" height="480"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${a},55%,40%)"/><stop offset="1" stop-color="hsl(${(a + 70) % 360},60%,18%)"/></linearGradient></defs><rect width="270" height="480" fill="url(#g)"/><circle cx="135" cy="210" r="58" fill="rgba(255,255,255,0.18)"/></svg>`;
}

function post(id: string, blog: { BlogId: string; Name: string }, over: Record<string, unknown> = {}) {
  return {
    PostId: id, BlogId: blog.BlogId, BlogName: blog.Name, Status: 'Ready', Origin: 'Autopilot', Kind: 'Video',
    ScheduledUtc: iso(60 * 5), SlotUtc: iso(60 * 5), PublishedUtc: null, NextAttemptUtc: null,
    Caption: 'me at 3am realising the dishwasher has been my therapist all along', Title: null, LinkUrl: null,
    Tags: ['memes', 'relatable', 'cats'], CaptionPending: false, CaptionMode: 'AI', CaptionError: null, CaptionEdited: false,
    UsedVision: true, CaptionModel: 'vision-model', Approved: true, HasThumbnail: true, MediaCount: 1, IsVideo: true, DurationSeconds: 14.2,
    Width: 720, Height: 1280, Bytes: 3_400_000, BlockedReason: null, LastError: null, LastErrorCode: null, Attempts: 0, TumblrUrl: null,
    TumblrPostId: null, Notes: 0, Likes: null, Reblogs: null, Replies: null, NotesAt24h: null, NotesAt7d: null, MetricsSyncedUtc: null,
    ContentSource: 'MemeScraper', ContentOrigin: 'catclips.example', ContentUrl: 'https://www.instagram.com/reel/abc/',
    OriginalCaption: 'when the cat knows #fyp', ContentViews: 812000, TumblrState: 'Published', MediaVersion: `v-${id}`,
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
    Ai: { Persona: 'A deadpan meme blog. Dry, short and funny.', Instructions: 'lowercase only', Examples: ['cat.exe has stopped working'], MaxLength: 120, UseVision: true, UseSourceCaption: true, SuggestTags: true, MaxSuggestedTags: 5, AllowEmoji: true, Language: 'English', Fallback: 'Empty', Model: null },
    FixedTags: ['memes', 'funny'], RotatingTags: ['relatable', 'lol'], RotatingTagsPerPost: 2, MaxTags: 12, ResearchTags: true, PostState: 'Published', CreditSource: false,
    Reblogs: { Enabled: false, PerDay: 3, Tags: [], MinNotes: 50, MaxAgeHours: 72, Images: true, Videos: false, Text: true, RequireApproval: true, StartHour: 9, EndHour: 23, Guidance: '' },
    ...over,
  };
}

function tagHealth(tag: string, source: string, verdict: string, over: Record<string, unknown> = {}) {
  const summary: Record<string, string> = {
    Crowded: 'Flooded: about 119 posts an hour, so a new post leaves the first page within 10 minutes.',
    Active: 'Active: about 14 posts a day; a typical post there ends up with 6 notes.',
    Dead: 'Nobody else has ever posted under this tag.',
    Unknown: 'Not checked yet.',
  };
  return {
    Tag: tag, Source: source, Verdict: verdict, Score: verdict === 'Active' ? 77.7 : 0, PostsPerDay: verdict === 'Crowded' ? 2856 : verdict === 'Active' ? 14 : null,
    TypicalNotes: verdict === 'Active' ? 6 : verdict === 'Crowded' ? 0 : null, ShareWithNotes: 0.5, Settled: 20, CheckedUtc: verdict === 'Unknown' ? null : iso(-90),
    OurPosts: 0, OurAvgNotes: null, Summary: summary[verdict], Related: [], ...over,
  };
}

export function buildState() {
  const meme = { BlogId: 'b-meme', Name: 'memeblog' };
  const side = { BlogId: 'b-side', Name: 'sideblog' };
  const posts = [
    post('p-next', meme, { ScheduledUtc: iso(150), SlotUtc: iso(150) }),
    post('p-approval', meme, { Status: 'AwaitingApproval', Approved: false, ScheduledUtc: iso(60 * 20), SlotUtc: iso(60 * 20), Caption: 'my last brain cell watching me try to adult' }),
    post('p-pending', meme, { Status: 'Planned', CaptionPending: true, Caption: null, ScheduledUtc: iso(60 * 30), SlotUtc: iso(60 * 30), HasThumbnail: false }),
    post('p-held', side, { Status: 'Ready', ScheduledUtc: iso(-25), BlockedReason: 'Waiting for Tumblr to answer this server; next try 14:28 UTC.', Caption: 'the audacity of this goose' }),
    post('p-pub1', meme, { Status: 'Published', ScheduledUtc: iso(-60 * 10), PublishedUtc: iso(-60 * 10), TumblrPostId: '7700001', TumblrUrl: 'https://www.tumblr.com/memeblog/7700001', Notes: 412, Likes: 280, Reblogs: 119, Replies: 13, NotesAt24h: 301, MetricsSyncedUtc: iso(-20), Caption: 'nobody: my cat at 3am: parkour' }),
    post('p-pub2', side, { Status: 'Published', ScheduledUtc: iso(-60 * 4), PublishedUtc: iso(-60 * 4), TumblrPostId: '7700002', TumblrUrl: 'https://www.tumblr.com/sideblog/7700002', Notes: 3, Likes: 2, Reblogs: 1, Replies: 0, MetricsSyncedUtc: iso(-40), Caption: 'the dog has opinions' }),
    post('p-failed', meme, { Status: 'Failed', ScheduledUtc: iso(-60 * 30), LastError: 'Tumblr rejected the post (400.8005): The uploaded media is an invalid format', LastErrorCode: '400.8005', Attempts: 1 }),
    post('p-text', side, { Origin: 'Manual', Kind: 'Text', IsVideo: false, HasThumbnail: false, Caption: 'reminder: drink water', Title: 'PSA', ScheduledUtc: iso(60 * 8), ContentSource: null, ContentOrigin: null }),
  ];
  const blogs = [
    { ...meme, Title: 'Cat clips, daily-ish', Url: 'https://memeblog.tumblr.com/', AvatarUrl: '', Autopilot: true, Paused: false, RequireApproval: false, ConnectionId: 'c-1', ConnectionUser: 'klives', ConnectionHealth: 'Healthy', Followers: 128, FollowersDelta7d: 9, FollowersSpark: [110, 114, 118, 120, 124, 128], Posts: 64, LastPublishedUtc: iso(-600), Pending: 3, AwaitingApproval: 1, Published7d: 6, Failed7d: 1, Notes30d: 1820, AvgNotes30d: 151.7, SlotsPerWeek: 8, Source: 'MemeScraper', CaptionMode: 'AI', TimeZone: 'Europe/London', LastError: null, LastErrorUtc: null, ConsecutiveFailures: 0, ContentWarning: null, State: 'attention', StateReason: 'Posts are waiting for approval' },
    { ...side, Title: 'Side blog', Url: 'https://sideblog.tumblr.com/', AvatarUrl: '', Autopilot: true, Paused: false, RequireApproval: false, ConnectionId: 'c-1', ConnectionUser: 'klives', ConnectionHealth: 'Healthy', Followers: 4, FollowersDelta7d: 0, FollowersSpark: [4, 4, 4], Posts: 31, LastPublishedUtc: iso(-240), Pending: 2, AwaitingApproval: 0, Published7d: 5, Failed7d: 0, Notes30d: 4, AvgNotes30d: 0.4, SlotsPerWeek: 7, Source: 'MemeScraper', CaptionMode: 'AI', TimeZone: 'Europe/London', LastError: null, LastErrorUtc: null, ConsecutiveFailures: 0, ContentWarning: null, State: 'ok', StateReason: 'On autopilot' },
  ];
  return {
    blogs,
    posts,
    strategies: { 'b-meme': strategy(), 'b-side': strategy({ FixedTags: ['memes'] }) } as Record<string, any>,
    events: [
      { Utc: iso(-600), Level: 'Success', Kind: 'publish.ok', Message: '@memeblog: published video', BlogId: 'b-meme', PostId: 'p-pub1', BlogName: 'memeblog' },
      { Utc: iso(-120), Level: 'Warning', Kind: 'tumblr.edge-blocked', Message: 'Tumblr\'s edge is refusing this server\'s requests. First refused: tagged at 12:00:00 UTC (x-rid -).', BlogId: null, PostId: null, BlogName: null },
      { Utc: iso(-30), Level: 'Error', Kind: 'publish.failed', Message: '@memeblog: Tumblr rejected the post (400.8005)', BlogId: 'b-meme', PostId: 'p-failed', BlogName: 'memeblog' },
      { Utc: iso(-10), Level: 'Info', Kind: 'plan', Message: '@memeblog: planned 2 post(s) for upcoming slots.', BlogId: 'b-meme', PostId: null, BlogName: 'memeblog' },
    ],
    flowPolls: 0,
  };
}

type State = ReturnType<typeof buildState>;

const connection = (state: State) => ({
  ConnectionId: 'c-1', UserName: 'klives', AuthMode: 'OAuth1', Health: 'Healthy', HealthDetail: null, HealthChangedUtc: null,
  LastVerifiedUtc: iso(-25), CreatedUtc: iso(-60 * 24 * 30), AccessTokenExpiresUtc: null, LimitsFetchedUtc: iso(-15),
  Limits: [{ Key: 'posts', Description: 'Posts per day', Limit: 250, Remaining: 246, ResetUtc: iso(60 * 9) }],
  Blogs: [
    { Name: 'memeblog', Uuid: 't:meme', Title: 'Cat clips', Url: 'https://memeblog.tumblr.com/', Followers: 128, Primary: true, Type: 'public', AvatarUrl: '', Managed: true, ManagedBlogId: 'b-meme' },
    { Name: 'sideblog', Uuid: 't:side', Title: 'Side blog', Url: 'https://sideblog.tumblr.com/', Followers: 4, Primary: false, Type: 'public', AvatarUrl: '', Managed: true, ManagedBlogId: 'b-side' },
    { Name: 'artdump', Uuid: 't:art', Title: 'Art dump', Url: 'https://artdump.tumblr.com/', Followers: 2, Primary: false, Type: 'public', AvatarUrl: '', Managed: state.blogs.some(b => b.Name === 'artdump'), ManagedBlogId: null },
  ],
  ManagedBlogs: state.blogs.length,
});

/** Fourteen days, the last seven refused about 16 hours a day (as the live server in Nov 2026). */
function edgeHistory(blocked: boolean) {
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(NOW - (13 - i) * 86_400_000);
    return { Day: d.toISOString().slice(0, 10), BlockedMinutes: i < 2 ? 0 : 900 + (i % 3) * 60, Blocks: i < 2 ? 0 : 21, Covered: i >= 2 };
  });
  return {
    CoverageStartUtc: iso(-60 * 24 * 12), AnsweredPct24h: 33.1, AnsweredPct7d: 31.2, BlockedHours24h: 16.1, BlockedHours7d: 115.6, Blocks24h: 21, Blocks7d: 148,
    MedianBlockMinutes: 38, LongestBlockMinutes: 901, MedianOpenMinutes: 30.1, Days: days,
    Spans: [
      { FromUtc: iso(-60 * 9), ToUtc: iso(-60 * 8), Trigger: 'blog/notifications' },
      { FromUtc: iso(-60 * 3), ToUtc: iso(-60 * 2.4), Trigger: 'tagged' },
      ...(blocked ? [{ FromUtc: iso(-20), ToUtc: null, Trigger: 'tagged' }] : []),
    ],
    Triggers: [{ Key: 'tagged', Count: 96 }, { Key: 'blog/notifications', Count: 41 }],
  };
}

function engine(blocked: boolean) {
  return {
    Enabled: true, Running: true, PublishingEnabled: true, StartupState: 'running', StartedUtc: iso(-60 * 5),
    Loops: [
      { Name: 'publish', State: 'idle', LastTickUtc: iso(-0.2), LastActivityUtc: iso(-50), LastActivity: 'published 1 post(s)', LastError: null, LastErrorUtc: null, Ticks: 840 },
      { Name: 'plan', State: 'idle', LastTickUtc: iso(-0.5), LastActivityUtc: iso(-10), LastActivity: 'planned 2, prepared 2', LastError: null, LastErrorUtc: null, Ticks: 400 },
      { Name: 'sync', State: 'idle', LastTickUtc: iso(-0.7), LastActivityUtc: iso(-3), LastActivity: 'ran 3 sync job(s)', LastError: null, LastErrorUtc: null, Ticks: 300 },
    ],
    Api: { CallsThisHour: 46, CallsToday: 396, HourlyLimit: 1000, DailyLimit: 5000, PerHourRemaining: 954, PerDayRemaining: 4604, HeadersObservedUtc: iso(-2), ByEndpointToday: { 'blog/posts': 123, tagged: 38 } },
    MemeScraperReady: true, AiAvailable: true, Migration: null, SyncErrors: [],
    EdgeGate: blocked
      ? { Blocked: true, BlockedSinceUtc: iso(-20), NextCheckUtc: iso(8), FailedChecks: 2, LastRefusedUtc: iso(-4), LastDetail: 'tagged at 14:16:35 UTC (x-rid -)', LastClearedUtc: iso(-58), LastBlockMinutes: 38 }
      : { Blocked: false, BlockedSinceUtc: null, NextCheckUtc: null, FailedChecks: 0, LastRefusedUtc: iso(-150), LastDetail: 'tagged', LastClearedUtc: iso(-144), LastBlockMinutes: 36 },
    ProxyConfigured: false, Reblogs: { Enabled: true }, TagResearch: { Enabled: true, Available: !blocked, TagsKnown: 18 },
    Store: { SinceUtc: iso(-300), Waits: 4, MaxWaitMs: 312, MaxWaitUtc: iso(-200), WaitsLastHour: 1, MaxWaitLastHourMs: 12.5, Saves: 911, LastSaveUtc: iso(-1), LastSaveMs: 14.2, LastSaveLockMs: 0.4, MaxSaveLockMs: 3.1, LastSaveBytes: 81_000, Fingerprints: 2210, FingerprintBytes: 22_400_000, FingerprintSerialiseMs: 140, FingerprintsSavedUtc: iso(-1) },
  };
}

const app = () => ({ Configured: true, KeyHint: 'Qx9a', CallbackUrl: 'https://klive.dev/omnitumblr/oauth/callback', AuthMode: 'OAuth1', VerifiedUtc: iso(-60 * 48), LastVerifyError: null, UpdatedUtc: iso(-60 * 48) });

function analytics(blogId: string | null, days: number) {
  const n = Math.min(days, 30);
  const dayKey = (i: number) => new Date(NOW - i * 86_400_000).toISOString().slice(0, 10);
  const posting = Array.from({ length: n + 1 }, (_, i) => ({ Day: dayKey(n - i), Ours: i % 2 ? 1 : 0, Others: i % 9 === 0 ? 1 : 0, Notes: i % 2 ? 20 + (i * 37) % 300 : 0 }));
  const heat: { Dow: number; Hour: number; Posts: number; AvgNotes: number }[] = [];
  for (const dow of [1, 2, 4, 5]) for (const hour of [9, 18, 21]) heat.push({ Dow: dow, Hour: hour, Posts: 3, AvgNotes: 30 + ((dow * 37 + hour * 11) % 260) });
  return {
    BlogId: blogId, Days: days, FromUtc: iso(-60 * 24 * days), ToUtc: iso(0), TimeZone: 'Europe/London', Followers: blogId === 'b-side' ? 4 : 132, FollowersDelta: 12, FollowersGrowthPerWeek: 3,
    PostsPublished: 11, PostsPublishedPrev: 9, Notes: 1824, NotesPrev: 1410, AvgNotes: 165.8, MedianNotes: 41, EngagementRate: 1.256, Likes: 1210, Reblogs: 512, Replies: 98,
    FollowersSeries: Array.from({ length: n }, (_, i) => ({ T: iso(-60 * 24 * (n - i)), V: 110 + i })), Posting: posting, Activity: [], Heatmap: heat,
    BestSlotLabel: 'Friday 18:00–19:00 (290 notes on average over 4 posts)',
    TopPosts: [{ Id: '7700001', BlogId: 'b-meme', BlogName: 'memeblog', OmniPostId: 'p-pub1', Url: 'https://www.tumblr.com/memeblog/7700001', Summary: 'nobody: my cat at 3am: parkour', Type: 'video', Notes: 412, PublishedUtc: iso(-600), Ours: true, HasThumbnail: true }],
    Tags: [{ Key: 'cats', Posts: 6, AvgNotes: 241, TotalNotes: 1446 }, { Key: 'memes', Posts: 11, AvgNotes: 12, TotalNotes: 132 }],
    Sources: [{ Key: 'catclips.example', Posts: 6, AvgNotes: 241, TotalNotes: 1446 }], CaptionModes: [{ Key: 'AI (vision)', Posts: 11, AvgNotes: 165, TotalNotes: 1824 }],
    Kinds: [{ Key: 'Video', Posts: 11, AvgNotes: 165, TotalNotes: 1824 }], SampleSize: 34,
  };
}

function reach(blogId: string) {
  return {
    BlogId: blogId, Posts30d: 17, WithNotes30d: 3, Notes30d: 7, AvgNotes30d: 0.4, Followers: 4, FollowersDelta30d: 3, PostsPerDay: 1, TagResearchOn: true,
    Search: { CheckedUtc: iso(-300), Listed: true, Tag: 'cats', PostId: '7700002', LastListedUtc: iso(-300), Misses: 0 },
    Findings: [
      { Level: 'problem', Title: '14 of the last 17 posts got no notes at all', Detail: 'A blog with few followers is found through its tags.', Action: 'strategy' },
      { Level: 'problem', Title: '#memes, #funny are flooded', Detail: '#funny: about 119 posts an hour.', Action: 'strategy' },
      { Level: 'good', Title: 'Tumblr lists this blog’s posts under their tags', Detail: 'Found in #cats.', Action: null },
    ],
    Tags: [tagHealth('memes', 'fixed', 'Crowded', { OurPosts: 17, OurAvgNotes: 0.4 }), tagHealth('cats', 'ai', 'Active', { OurPosts: 4, OurAvgNotes: 5 }), tagHealth('the shirt is the alibi', 'ai', 'Dead')],
    RelatedTags: ['shitpost', 'humor'],
  };
}

export async function installTumblrApiMock(page: Page, options: TumblrMockOptions = {}): Promise<TumblrApiMock> {
  const state = buildState();
  const mock: TumblrApiMock = { posts: [], batchCalls: [], directGets: [], state };
  const legacy = !!options.legacy;
  const blocked = options.blocked ?? true;
  const strip = (p: any) => (legacy ? (({ MediaVersion: _mv, ...rest }) => rest)(p) : p);
  const pendingStatuses = ['Draft', 'Planned', 'Ready', 'AwaitingApproval', 'Publishing'];

  const respond = (pathWithQuery: string): { status: number; body: unknown; svg?: string } => {
    const url = new URL(pathWithQuery, 'https://klive.dev');
    const qp = (k: string) => url.searchParams.get(k);
    const blogById = (id: string | null) => state.blogs.find(b => b.BlogId === id);
    const pending = () => state.posts.filter(p => pendingStatuses.includes(p.Status as string)).sort((a, b) => a.ScheduledUtc.localeCompare(b.ScheduledUtc));
    switch (url.pathname) {
      case '/KMProfiles/me': return { status: 200, body: mePayload({ rank: 5, userId: 'e2e-klives', name: 'Klives Fixture' }) };
      case '/KMProfiles/permissions/catalog': return { status: 200, body: catalogPayload(true) };
      case '/omnitumblr/overview': {
        const up = pending();
        const body: any = {
          NowUtc: iso(0), Engine: engine(blocked), App: app(), Connections: [connection(state)],
          Kpis: { Followers: 132, FollowersDelta7d: 9, FollowersDelta30d: 41, FollowersSeries: Array.from({ length: 30 }, (_, i) => ({ T: iso(-60 * 24 * (30 - i)), V: 91 + i })), Published7d: 11, PublishedPrev7d: 9, Notes30d: 1824, AvgNotes30d: 85.2, Pending: up.length, AwaitingApproval: up.filter(p => p.Status === 'AwaitingApproval').length, Failed7d: 1, SuccessRate30d: 92.3, NextPostUtc: up.find(p => p.Status !== 'AwaitingApproval')?.ScheduledUtc ?? null, NextPostBlog: up.find(p => p.Status !== 'AwaitingApproval')?.BlogName ?? null, AutopilotBlogs: state.blogs.filter(b => b.Autopilot).length, Blogs: state.blogs.length },
          Blogs: state.blogs.map(b => ({ ...b, AwaitingApproval: up.filter(p => p.BlogId === b.BlogId && p.Status === 'AwaitingApproval').length, Pending: up.filter(p => p.BlogId === b.BlogId).length, NextPost: up.find(p => p.BlogId === b.BlogId) ?? null, LastPost: null })),
          Upcoming: up.slice(0, 16).map(strip), RecentlyPublished: state.posts.filter(p => p.Status === 'Published').map(strip),
          Attention: [
            ...(blocked ? [{ Level: 'error', Title: 'Tumblr is refusing this server\'s requests', Detail: 'Since 14:16 UTC every call gets an HTML 403 from Tumblr\'s edge. Over the last 7 days it refused the server 69% of the time (148 blocks).', BlogId: null, ConnectionId: null, Action: 'settings' }] : []),
            ...(up.some(p => p.Status === 'AwaitingApproval') ? [{ Level: 'info', Title: '1 post(s) on @memeblog need approval', Detail: 'Approve them in the queue.', BlogId: 'b-meme', ConnectionId: null, Action: 'queue' }] : []),
          ],
          Events: [...state.events].reverse(),
        };
        if (!legacy) {
          body.EdgeHistory = edgeHistory(blocked);
          body.Week = [
            { BlogId: 'b-meme', Published: 6, Failed: 1, Missed: 0, EdgeWaits: 4, ReblogsPicked: 1, ReblogsEmpty: 6, TagsDropped: 2 },
            { BlogId: 'b-side', Published: 5, Failed: 0, Missed: 1, EdgeWaits: 2, ReblogsPicked: 0, ReblogsEmpty: 0, TagsDropped: 0 },
          ];
        } else {
          delete body.Engine.EdgeGate; delete body.Engine.Store;
        }
        return { status: 200, body };
      }
      case '/omnitumblr/posts': {
        const status = qp('status') ?? '';
        const blogId = qp('blogId');
        let rows = state.posts.filter(p => !blogId || p.BlogId === blogId);
        if (status === 'pending') rows = rows.filter(p => pendingStatuses.includes(p.Status as string));
        else if (status) { const wanted = status.split(','); rows = rows.filter(p => wanted.includes(p.Status as string)); }
        rows = [...rows].sort((a, b) => ((b.PublishedUtc as string | null) ?? b.ScheduledUtc).localeCompare((a.PublishedUtc as string | null) ?? a.ScheduledUtc));
        return { status: 200, body: { Total: state.posts.length, Filtered: rows.length, Offset: 0, Rows: rows.map(strip) } };
      }
      case '/omnitumblr/blog': {
        const b = blogById(qp('blogId'));
        if (!b) return { status: 404, body: { error: 'No such blog.' } };
        const mine = state.posts.filter(p => p.BlogId === b.BlogId);
        return {
          status: 200, body: {
            NowUtc: iso(0), Summary: b,
            Blog: {
              BlogId: b.BlogId, Name: b.Name, Uuid: 't:x', Title: b.Title, Description: 'Cats. Mostly.', Url: b.Url, ConnectionId: 'c-1', Autopilot: b.Autopilot, Paused: b.Paused, RequireApproval: b.RequireApproval, Notes: '', AddedUtc: iso(-60 * 24 * 40),
              Stats: { Followers: b.Followers, Posts: b.Posts, Likes: null, InfoSyncedUtc: iso(-60), FollowersSyncedUtc: iso(-60), PostsIndexSyncedUtc: iso(-20), ActivitySyncedUtc: iso(-12), LastPublishedUtc: b.LastPublishedUtc },
              Health: { LastError: null, LastErrorUtc: null, ConsecutiveFailures: 0, LastSuccessUtc: iso(-50), ContentWarning: null, ContentWarningUtc: null },
              Strategy: state.strategies[b.BlogId], UsedContentCount: 41, RejectedContentCount: 1,
            },
            Connection: connection(state),
            Pending: mine.filter(p => pendingStatuses.includes(p.Status as string)),
            History: mine.filter(p => !pendingStatuses.includes(p.Status as string)),
            Events: state.events.filter(e => e.BlogId === b.BlogId).reverse(),
            Activity: [
              { Id: 'a1', Type: 'follow', Utc: iso(-14), FromBlog: 'sleepy-reader', TargetPostId: null, Text: null },
              { Id: 'a2', Type: 'reblog_with_content', Utc: iso(-33), FromBlog: 'meme-fan-2', TargetPostId: '7700001', Text: 'the jump' },
            ],
            Runway: { Eligible: 20234, SlotsPerWeek: 8, WeeksOfContent: 2529.3, Source: 'MemeScraper', CheckedUtc: iso(0), Next: Array.from({ length: 6 }, (_, i) => ({ Key: `ig:${900 + i}`, Source: 'MemeScraper', Kind: 'Video', Origin: 'catclips.example', OriginalUrl: null, Views: 400000 - i * 30000, Likes: 20000, CreatedUtc: iso(-60 * 24 * (i + 1)), OriginalCaption: 'cat compilation', DurationSeconds: 9 + i, FileName: `${900 + i}.mp4` })) },
          },
        };
      }
      case '/omnitumblr/analytics': return { status: 200, body: analytics(qp('blogId'), Number(qp('days') ?? 30)) };
      case '/omnitumblr/reach': return blogById(qp('blogId')) ? { status: 200, body: reach(qp('blogId')!) } : { status: 404, body: { error: 'No such blog.' } };
      case '/omnitumblr/post': {
        const p = state.posts.find(x => x.PostId === qp('postId'));
        if (!p) return { status: 404, body: { error: 'No such post.' } };
        return {
          status: 200, body: {
            Post: strip(p),
            Media: p.IsVideo ? [{ Index: 0, MimeType: 'video/mp4', Bytes: p.Bytes, Width: p.Width, Height: p.Height, DurationSeconds: p.DurationSeconds, HasThumbnail: p.HasThumbnail, Exists: true, FileName: 'reel.mp4' }] : [],
            AttemptLog: p.Status === 'Failed' ? [{ Utc: iso(-30), Ok: false, Code: '400.8005', Message: p.LastError, DurationMs: 4200 }] : [],
            MetricsHistory: p.Status === 'Published' ? [{ Utc: p.PublishedUtc, Notes: 0 }, { Utc: iso(-300), Notes: 120 }, { Utc: iso(-20), Notes: p.Notes }] : [],
            TagHealth: (p.Tags as string[]).map(t => tagHealth(t, 'post', t === 'memes' ? 'Crowded' : t === 'cats' ? 'Active' : 'Unknown')),
            CaptionInfo: { Mode: 'AI', Model: 'vision-model', UsedVision: true, GeneratedUtc: iso(-90), Edited: p.CaptionEdited, Error: null, Failures: 0, AltText: 'A cat leaps across a counter at night.', SuggestedTags: ['cats', 'parkour'], DroppedTags: ['counter at night'], TagsResearched: true, Direction: null },
            Reblog: null,
            Content: p.ContentSource ? { Kind: 'MemeScraper', Key: 'ig:123', Origin: 'catclips.example', OriginalCaption: p.OriginalCaption, OriginalUrl: 'https://www.instagram.com/reel/abc/', Views: 812000, Likes: 40000, CreatedUtc: iso(-60 * 72) } : null,
            Slug: 'slug-1a2b', Deferrals: 0, NeedsReconcile: false, ManualOverride: false, CreatedUtc: iso(-60 * 24), UpdatedUtc: iso(-90),
          },
        };
      }
      case '/omnitumblr/media':
      case '/omnitumblr/content/thumb':
        return { status: 200, body: null, svg: thumbSvg(qp('postId') ?? qp('key') ?? 'x') };
      case '/omnitumblr/memescraper/options':
        return { status: 200, body: { Ready: true, TotalReels: 20234, DownloadedReels: 20234, Niches: [{ Name: 'cats', Sources: 3, Reels: 620 }, { Name: 'gaming', Sources: 4, Reels: 790 }], Sources: [{ Username: 'catclips.example', Niches: ['cats'], Reels: 300, NewestUtc: iso(-60) }] } };
      case '/omnitumblr/library': return { status: 200, body: { BlogId: qp('blogId'), Files: [] } };
      case '/omnitumblr/settings': {
        const ov = respond('/omnitumblr/overview').body as any;
        return { status: 200, body: { App: app(), Connections: [connection(state)], Engine: ov.Engine, Presets: ['weekly-memes', 'daily-memes', 'manual'] } };
      }
      case '/omnitumblr/events': return { status: 200, body: [...state.events].reverse() };
      case '/omnitumblr/connect/status':
        state.flowPolls++;
        return { status: 200, body: state.flowPolls < 2 ? { FlowId: 'flow-1', State: 'pending', Error: null, Connection: null } : { FlowId: 'flow-1', State: 'completed', Error: null, ConnectionId: 'c-1', Connection: connection(state) } };
      default:
        return { status: 404, body: { error: 'Route not found.' } };
    }
  };

  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type, X-Klive-Client, X-Klive-Page, Cache-Control, If-None-Match' };
  const fulfil = (route: Route, body: unknown, status = 200) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });

  await page.routeWebSocket('wss://klive.dev/**', () => {});
  await page.route('https://klive.dev/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const pathWithQuery = `${url.pathname}${url.search}`;
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });

    if (url.pathname === '/batch' && request.method() === 'POST') {
      const paths = (JSON.parse(request.postData() ?? '[]') as { path?: string }[]).map(e => e.path).filter((p): p is string => typeof p === 'string');
      mock.batchCalls.push(paths);
      return fulfil(route, paths.map(path => {
        const answer = respond(path);
        return { path, status: answer.status, ok: answer.status < 300, contentType: 'application/json', body: answer.body };
      }));
    }

    if (request.method() === 'GET') {
      mock.directGets.push(pathWithQuery);
      if (url.pathname === '/KMProfiles/LoginStatus') return route.fulfill({ status: 200, headers: cors, contentType: 'text/plain', body: 'SessionActive' });
      const answer = respond(pathWithQuery);
      if (answer.svg) return route.fulfill({ status: 200, headers: cors, contentType: 'image/svg+xml', body: answer.svg });
      return fulfil(route, answer.body, answer.status);
    }

    // ── writes ──
    let body: any = null;
    try { body = JSON.parse(request.postData() ?? 'null'); } catch { body = request.postData(); }
    mock.posts.push({ path: url.pathname, body });
    const find = (id: string) => state.posts.find(p => p.PostId === id) as any;
    switch (url.pathname) {
      case '/omnitumblr/posts/approve': {
        let approved = 0;
        for (const p of state.posts as any[]) if (p.Status === 'AwaitingApproval' && (p.PostId === body.postId || p.BlogId === body.blogId)) { p.Status = 'Ready'; p.Approved = true; approved++; }
        return fulfil(route, { approved });
      }
      case '/omnitumblr/posts/update': {
        const p = find(body.postId);
        if (typeof body.caption === 'string') { p.Caption = body.caption; p.CaptionEdited = true; }
        if (Array.isArray(body.tags)) p.Tags = body.tags;
        p.MediaVersion = `v-${Date.now()}`;
        return fulfil(route, p);
      }
      case '/omnitumblr/posts/skip': find(body.postId).Status = 'Skipped'; return fulfil(route, { ok: true });
      case '/omnitumblr/posts/cancel': find(body.postId).Status = 'Cancelled'; return fulfil(route, { ok: true });
      case '/omnitumblr/posts/publish-now': find(body.postId).Status = 'Publishing'; return fulfil(route, { ok: true });
      case '/omnitumblr/posts/retry': find(body.postId).Status = 'Ready'; return fulfil(route, { ok: true });
      case '/omnitumblr/posts/create': {
        const created = (body.blogIds as string[]).map((id, i) => post(`p-new-${i}`, state.blogs.find(b => b.BlogId === id)!, { Origin: 'Manual', Kind: body.kind, Caption: body.caption, Title: body.title, IsVideo: body.kind === 'Video', HasThumbnail: false, CaptionPending: body.captionMode === 'ai', ScheduledUtc: body.scheduledUtc ?? iso(0) }));
        state.posts.push(...(created as any[]));
        return fulfil(route, { Created: created });
      }
      case '/omnitumblr/blogs/update': {
        const b = state.blogs.find(x => x.BlogId === body.blogId) as any;
        if (b && typeof body.autopilot === 'boolean') b.Autopilot = body.autopilot;
        if (b && typeof body.paused === 'boolean') { b.Paused = body.paused; b.State = body.paused ? 'paused' : 'ok'; }
        if (body.strategy) { state.strategies[body.blogId] = body.strategy; b.SlotsPerWeek = body.strategy.Slots.length; }
        return fulfil(route, { Summary: b, Notes: body.strategy ? ['Upcoming captions will be rewritten in the new style.'] : [] });
      }
      case '/omnitumblr/blogs/plan-now': return fulfil(route, { Planned: 2, FreeSlots: 2, Warning: null });
      case '/omnitumblr/blogs/refresh': return fulfil(route, { Errors: [] });
      case '/omnitumblr/blogs/add': {
        const added = (body.blogs as string[]).map(name => ({ ...state.blogs[1], BlogId: `b-${name}`, Name: name, Title: 'Art dump', Autopilot: !!body.autopilot }));
        state.blogs.push(...(added as any[]));
        for (const a of added) state.strategies[a.BlogId] = strategy();
        return fulfil(route, { Added: added, Skipped: [] });
      }
      case '/omnitumblr/tags/research':
        return fulfil(route, { Tags: (body.tags as string[]).map(t => tagHealth(t.toLowerCase(), 'checked', t === 'shitpost' ? 'Crowded' : 'Active')) });
      case '/omnitumblr/connect/begin':
        return fulfil(route, { flowId: 'flow-1', authorizationUrl: 'about:blank#authorize', mode: 'OAuth1', callbackUrl: app().CallbackUrl });
      case '/omnitumblr/captions/preview':
        return fulfil(route, { Caption: 'he has seen things. he will not elaborate.', Tags: ['memes', 'cats'], SuggestedTags: ['cats'], DroppedTags: ['thousand yard stare'], TagsResearched: true, AltText: null, Model: 'vision-model', UsedVision: true, FramesSent: 4, Content: { Key: 'ig:900', Source: 'MemeScraper', Kind: 'Video', Origin: 'catclips.example', OriginalUrl: null, Views: 400000, Likes: 20000, CreatedUtc: iso(-1440), OriginalCaption: 'the stare', DurationSeconds: 9, FileName: '900.mp4' } });
      default:
        return fulfil(route, { ok: true });
    }
  });
  return mock;
}

export async function openTumblr(page: Page, options: TumblrMockOptions & { path?: string } = {}): Promise<TumblrApiMock> {
  const api = await installTumblrApiMock(page, options);
  await page.context().addCookies([{ name: 'password', value: 'e2e-klives', url: tumblrTestOrigin }]);
  await page.addInitScript(() => { window.localStorage.setItem('vnavCollapsed', '0'); });
  // Windows dev-server runs sometimes stall a navigation (ERR_NO_BUFFER_SPACE): load again.
  for (let attempt = 0; ; attempt++) {
    try {
      // The first page a cold dev server serves compiles the whole app: give it time.
      await page.goto(options.path ?? '/schemery/omnitumblr', { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await page.getByTestId('tmb-root').waitFor({ state: 'visible', timeout: 45_000 });
      break;
    } catch (error) {
      if (attempt >= 2) throw error;
      await page.waitForTimeout(3_000 * (attempt + 1));
    }
  }
  return api;
}
