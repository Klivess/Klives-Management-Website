/*
 * OmniTumblr console: the pure rules behind pages/schemery/omnitumblr (types the newer server adds, the
 * verdict and its issues, the schedule's layout, the command list's scoring). No Vue, no fetching, so
 * every rule can be read and tested on its own. State and polling live in composables/useTumblrConsole.ts.
 *
 * Every field the November 2026 server added (EdgeHistory, Week, Engine.Store, MediaVersion) is optional:
 * the site and the server deploy separately.
 */
import {
    STATUS_LABEL, fmtCount, postThumbPath,
    type AttentionItem, type BlogSummary, type EngineStatus, type Overview, type PostStatus, type PostSummary,
} from '~/composables/useOmniTumblr';

// ───────────────────────────── server shapes the console adds ─────────────────────────────

export interface TmbEdgeDay { Day: string; BlockedMinutes: number; Blocks: number; Covered: boolean }
export interface TmbEdgeSpan { FromUtc: string; ToUtc: string | null; Trigger: string | null }

/** How often Tumblr's edge refused the server (from the event log). */
export interface TmbEdgeHistory {
    CoverageStartUtc: string | null;
    AnsweredPct24h: number | null;
    AnsweredPct7d: number | null;
    BlockedHours24h: number;
    BlockedHours7d: number;
    Blocks24h: number;
    Blocks7d: number;
    MedianBlockMinutes: number | null;
    LongestBlockMinutes: number | null;
    MedianOpenMinutes: number | null;
    Days: TmbEdgeDay[];
    Spans: TmbEdgeSpan[];
    Triggers: { Key: string; Count: number }[];
}

export interface TmbBlogWeek {
    BlogId: string;
    Published: number;
    Failed: number;
    Missed: number;
    EdgeWaits: number;
    ReblogsPicked: number;
    ReblogsEmpty: number;
    TagsDropped: number;
}

export interface TmbStoreStats {
    SinceUtc: string;
    Waits: number;
    MaxWaitMs: number;
    MaxWaitUtc: string | null;
    WaitsLastHour: number;
    MaxWaitLastHourMs: number;
    Saves: number;
    LastSaveUtc: string | null;
    LastSaveMs: number;
    LastSaveLockMs: number;
    MaxSaveLockMs: number;
    LastSaveBytes: number;
    Fingerprints: number | null;
    FingerprintBytes: number | null;
    FingerprintSerialiseMs: number | null;
    FingerprintsSavedUtc: string | null;
}

export interface TmbEdgeGate {
    Blocked: boolean;
    BlockedSinceUtc: string | null;
    NextCheckUtc: string | null;
    FailedChecks: number;
    LastRefusedUtc: string | null;
    LastDetail: string | null;
    LastClearedUtc: string | null;
    LastBlockMinutes: number | null;
}

export type TmbEngine = EngineStatus & {
    EdgeGate?: TmbEdgeGate | null;
    ProxyConfigured?: boolean;
    Reblogs?: { Enabled: boolean };
    TagResearch?: { Enabled: boolean; Available: boolean; TagsKnown: number };
    Store?: TmbStoreStats;
};

export type TmbOverview = Omit<Overview, 'Engine'> & {
    Engine: TmbEngine;
    EdgeHistory?: TmbEdgeHistory;
    Week?: TmbBlogWeek[];
};

export type TmbPost = PostSummary & { MediaVersion?: string };

// ───────────────────────────── small formatting ─────────────────────────────

export type TmbTone = 'ok' | 'warn' | 'crit' | 'info' | 'violet' | 'neutral' | 'accent';

export function tmbMinutes(minutes: number | null | undefined): string {
    if (minutes == null || Number.isNaN(minutes)) return '—';
    const m = Math.round(minutes);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const rest = m % 60;
    if (h < 48) return rest ? `${h} h ${rest} min` : `${h} h`;
    return `${Math.round(h / 24)} d`;
}

export function tmbPct(value: number | null | undefined, digits = 0): string {
    return value == null || Number.isNaN(value) ? '—' : `${value.toFixed(digits)}%`;
}

export function tmbPlural(n: number, one: string, many = `${one}s`): string {
    return `${fmtCount(n)} ${n === 1 ? one : many}`;
}

/** A thumbnail path the browser may keep: the post's version is part of it. */
export function tmbThumb(post: Pick<TmbPost, 'PostId' | 'HasThumbnail' | 'MediaVersion'> | null | undefined): string | null {
    if (!post?.HasThumbnail) return null;
    return postThumbPath(post.PostId) + (post.MediaVersion ? `&v=${encodeURIComponent(post.MediaVersion)}` : '');
}

export const TMB_PENDING: PostStatus[] = ['Draft', 'Planned', 'Ready', 'AwaitingApproval', 'Publishing'];
export const TMB_EDITABLE: PostStatus[] = ['Draft', 'Planned', 'Ready', 'AwaitingApproval'];

export function tmbStatusTone(status: PostStatus): TmbTone {
    switch (status) {
        case 'Published': return 'ok';
        case 'Failed': return 'crit';
        case 'AwaitingApproval': return 'warn';
        case 'Publishing': case 'Ready': return 'info';
        case 'Planned': case 'Draft': return 'violet';
        default: return 'neutral';
    }
}

export function tmbStatusLabel(status: PostStatus): string {
    return STATUS_LABEL[status] ?? status;
}

export function tmbBlogTone(state: BlogSummary['State']): TmbTone {
    return state === 'ok' ? 'ok' : state === 'error' ? 'crit' : state === 'attention' ? 'warn' : state === 'paused' ? 'violet' : 'neutral';
}

export function tmbBlogStateLabel(blog: Pick<BlogSummary, 'State' | 'Autopilot'>): string {
    return ({ ok: blog.Autopilot ? 'Autopilot' : 'Manual', attention: 'Needs you', error: 'Problem', paused: 'Paused', idle: 'Idle' } as const)[blog.State] ?? blog.State;
}

/** What a row shows where a post's caption goes. */
export function tmbCaption(post: TmbPost): string {
    if (post.Kind === 'Reblog') return `⟳ @${post.ReblogOf ?? 'someone'}: ${post.ReblogSummary?.trim() || '(no text)'}${post.Caption?.trim() ? ` — “${post.Caption.trim()}”` : ''}`;
    if (post.CaptionPending) return post.CaptionError ? `Caption pending — the AI failed: ${post.CaptionError}` : 'Writing the caption…';
    if (post.Kind === 'Text' && post.Title) return post.Title + (post.Caption ? ` — ${post.Caption}` : '');
    return post.Caption?.trim() || '(no caption)';
}

/** When a pending post will really go: a later retry time wins over the slot. */
export function tmbDueUtc(post: TmbPost): string {
    if (post.PublishedUtc && post.Status === 'Published') return post.PublishedUtc;
    if (post.NextAttemptUtc && post.NextAttemptUtc > post.ScheduledUtc) return post.NextAttemptUtc;
    return post.ScheduledUtc;
}

export function tmbDayLabel(iso: string, now = Date.now()): string {
    const d = new Date(iso);
    const day = new Date(d); day.setHours(0, 0, 0, 0);
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    if (diff < 0 && diff > -7) return d.toLocaleDateString(undefined, { weekday: 'long' });
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function tmbClock(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Items grouped by local day, in the order given. With <paramref name="overdue"/>, anything already past
 * is one "Due now" group (a queue's waiting posts), not yesterday's date.
 */
export function tmbGroupByDay<T>(items: T[], at: (item: T) => string, now = Date.now(), overdue = false): { label: string; items: T[] }[] {
    const groups: { label: string; items: T[] }[] = [];
    for (const item of items) {
        const label = overdue && new Date(at(item)).getTime() < now - 60_000 ? 'Due now' : tmbDayLabel(at(item), now);
        const last = groups[groups.length - 1];
        if (last && last.label === label) last.items.push(item);
        else groups.push({ label, items: [item] });
    }
    return groups;
}

// ───────────────────────────── verdict ─────────────────────────────

export type TmbAction = 'settings' | 'reconnect' | 'strategy' | 'queue' | 'add-blog' | 'reach' | 'published';

export interface TmbIssue {
    id: string;
    tone: TmbTone;
    title: string;
    detail: string;
    action?: TmbAction | null;
    blogId?: string | null;
    connectionId?: string | null;
}

export interface TmbVerdict {
    tone: TmbTone;
    title: string;
    detail: string;
    issues: TmbIssue[];
}

function issueTone(level: AttentionItem['Level']): TmbTone {
    return level === 'error' ? 'crit' : level === 'warning' ? 'warn' : 'info';
}

/**
 * One sentence for the whole fleet, then what to do about it, worst first. The server's attention items
 * come first (it knows about connections, the edge and the engine); the console adds what only shows
 * when the blogs are looked at side by side.
 */
export function tumblrVerdict(o: TmbOverview | null, nowMs = Date.now()): TmbVerdict {
    if (!o) return { tone: 'neutral', title: 'Connecting…', detail: '', issues: [] };
    const issues: TmbIssue[] = o.Attention.map((a, i) => ({
        id: `att-${i}-${a.Title}`, tone: issueTone(a.Level), title: a.Title, detail: a.Detail,
        action: a.Action, blogId: a.BlogId, connectionId: a.ConnectionId,
    }));

    const failing = o.Blogs.filter(b => b.Failed7d > 0 && !issues.some(i => i.blogId === b.BlogId && i.tone === 'crit'));
    if (failing.length) {
        const n = failing.reduce((s, b) => s + b.Failed7d, 0);
        issues.push({ id: 'failed', tone: 'warn', title: `${tmbPlural(n, 'post')} failed this week`, detail: failing.map(b => `@${b.Name} ${b.Failed7d}`).join(' · '), action: 'published', blogId: failing.length === 1 ? failing[0].BlogId : null });
    }

    const week = o.Week ?? [];
    const missed = week.reduce((s, w) => s + w.Missed, 0);
    if (missed > 0) issues.push({ id: 'missed', tone: 'warn', title: `${tmbPlural(missed, 'slot')} missed in 7 days`, detail: 'A post waited past its grace period and was skipped.', action: 'queue' });

    const autopilot = o.Blogs.filter(b => b.Autopilot && !b.Paused);
    const quiet = autopilot.filter(b => (b.AvgNotes30d ?? 0) < 1 && b.Published7d >= 3);
    if (quiet.length) {
        issues.push({
            id: 'reach', tone: 'info', title: `${quiet.length === 1 ? `@${quiet[0].Name} gets` : `${quiet.length} blogs get`} under one note a post`,
            detail: 'Posts are going out but almost nobody sees them. The Reach tab says which tags are flooded or empty.', action: 'reach', blogId: quiet[0].BlogId,
        });
    }

    const reblogEmpty = week.reduce((s, w) => s + w.ReblogsEmpty, 0);
    const reblogPicked = week.reduce((s, w) => s + w.ReblogsPicked, 0);
    if (reblogEmpty >= 5 && reblogEmpty > reblogPicked * 2) {
        issues.push({ id: 'reblogs', tone: 'info', title: `Reblogs found nothing ${reblogEmpty} times this week`, detail: `${reblogPicked} picked. Tags like #memes move too fast for a 50-note post to be on the page the curator reads; give reblogs their own, slower tags.`, action: 'strategy' });
    }

    const order: Record<TmbTone, number> = { crit: 0, warn: 1, accent: 2, info: 3, violet: 4, ok: 5, neutral: 6 };
    issues.sort((a, b) => order[a.tone] - order[b.tone]);

    const k = o.Kpis;
    const next = k.NextPostUtc ? new Date(k.NextPostUtc).getTime() - nowMs : null;
    const nextText = k.NextPostUtc && k.NextPostBlog ? `next post ${next != null && next < 0 ? 'due now' : `in ${tmbMinutes((next ?? 0) / 60_000)}`} on @${k.NextPostBlog}` : 'nothing scheduled';
    const blocked = o.Engine.EdgeGate?.Blocked;
    if (!o.Engine.Enabled) return { tone: 'crit', title: 'OmniTumblr is switched off', detail: 'OmniSetting OmniTumblr_Enabled', issues };
    if (!o.App.Configured) return { tone: 'crit', title: 'Set up the Tumblr app', detail: 'Nothing can post until the app keys are in.', issues };
    if (blocked) return { tone: 'crit', title: 'Tumblr is refusing the server', detail: `Posts wait and go out once it answers · ${nextText}`, issues };
    if (!o.Engine.PublishingEnabled) return { tone: 'warn', title: 'Publishing is switched off', detail: 'OmniSetting OmniTumblrV2_PublishingEnabled', issues };
    const bad = issues.filter(i => i.tone === 'crit').length;
    const warn = issues.filter(i => i.tone === 'warn').length;
    if (bad) return { tone: 'crit', title: `${tmbPlural(bad, 'problem')} to fix`, detail: nextText, issues };
    if (warn) return { tone: 'warn', title: `${tmbPlural(warn, 'thing')} need${warn === 1 ? 's' : ''} a look`, detail: nextText, issues };
    if (!autopilot.length) return { tone: 'neutral', title: 'No blog is on autopilot', detail: nextText, issues };
    return { tone: 'ok', title: `${tmbPlural(autopilot.length, 'blog')} on autopilot`, detail: nextText, issues };
}

// ───────────────────────────── the schedule ─────────────────────────────

export interface TmbMarker {
    post: TmbPost;
    /** 0–1 across the window. */
    x: number;
    kind: 'published' | 'pending' | 'failed' | 'reblog';
    /** Marker diameter in px. */
    size: number;
    tone: TmbTone;
}

export interface TmbLane { blog: BlogSummary; markers: TmbMarker[] }
export interface TmbBand { x0: number; x1: number; fromUtc: string; toUtc: string | null; trigger: string | null; ongoing: boolean }
export interface TmbTick { x: number; label: string; major: boolean }

export interface TmbSchedule {
    fromMs: number;
    toMs: number;
    nowX: number;
    lanes: TmbLane[];
    bands: TmbBand[];
    ticks: TmbTick[];
}

/**
 * Lays the fleet out on one time axis: what went out in the last <pastHours> (sized by notes), what is
 * queued for the next <futureHours>, and every stretch when Tumblr refused the server, across all lanes.
 */
export function tumblrSchedule(blogs: BlogSummary[], posts: TmbPost[], spans: TmbEdgeSpan[], nowMs: number, pastHours = 24, futureHours = 48): TmbSchedule {
    const fromMs = nowMs - pastHours * 3_600_000;
    const toMs = nowMs + futureHours * 3_600_000;
    const span = toMs - fromMs;
    const xOf = (ms: number) => Math.min(1, Math.max(0, (ms - fromMs) / span));
    const maxNotes = Math.max(1, ...posts.filter(p => p.Status === 'Published' && p.Kind !== 'Reblog').map(p => p.Notes));

    const seen = new Set<string>();
    const lanes: TmbLane[] = blogs.map(blog => ({ blog, markers: [] }));
    const laneOf = new Map(lanes.map(l => [l.blog.BlogId, l]));
    for (const post of posts) {
        if (seen.has(post.PostId)) continue;
        seen.add(post.PostId);
        const lane = laneOf.get(post.BlogId);
        if (!lane) continue;
        const at = new Date(tmbDueUtc(post)).getTime();
        const pending = TMB_PENDING.includes(post.Status);
        if (Number.isNaN(at) || at < fromMs || at > toMs) {
            if (!(pending && at < fromMs)) continue; // an overdue pending post sits at the left edge
        }
        if (!pending && post.Status !== 'Published' && post.Status !== 'Failed') continue;
        let kind: TmbMarker['kind'] = pending ? 'pending' : post.Status === 'Failed' ? 'failed' : 'published';
        if (post.Kind === 'Reblog' && !pending) kind = 'reblog';
        const size = kind === 'published' ? Math.round(10 + 14 * Math.sqrt(post.Notes / maxNotes)) : kind === 'pending' ? 14 : 10;
        const tone: TmbTone = kind === 'published' ? 'accent' : kind === 'reblog' ? 'violet' : kind === 'failed' ? 'crit'
            : post.Status === 'AwaitingApproval' ? 'warn' : post.BlockedReason ? 'warn' : post.Status === 'Planned' ? 'violet' : 'info';
        lane.markers.push({ post, x: xOf(at), kind, size, tone });
    }
    for (const lane of lanes) lane.markers.sort((a, b) => a.x - b.x);

    const bands: TmbBand[] = spans
        .map(s => {
            const a = new Date(s.FromUtc).getTime();
            const b = s.ToUtc ? new Date(s.ToUtc).getTime() : nowMs;
            return { a, b, s };
        })
        .filter(v => v.b > fromMs && v.a < nowMs + 1)
        .map(v => ({ x0: xOf(v.a), x1: xOf(v.b), fromUtc: v.s.FromUtc, toUtc: v.s.ToUtc, trigger: v.s.Trigger, ongoing: !v.s.ToUtc }));

    const ticks: TmbTick[] = [];
    const first = new Date(fromMs); first.setMinutes(0, 0, 0);
    for (let t = first.getTime(); t <= toMs; t += 3_600_000) {
        const d = new Date(t);
        if (d.getHours() % 6 !== 0 || t < fromMs) continue;
        const major = d.getHours() === 0;
        ticks.push({ x: xOf(t), major, label: major ? d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }) : `${String(d.getHours()).padStart(2, '0')}:00` });
    }
    return { fromMs, toMs, nowX: xOf(nowMs), lanes, bands, ticks };
}

// ───────────────────────────── commands ─────────────────────────────

export interface TmbCommand {
    id: string;
    group: 'Blogs' | 'Posts' | 'Go to' | 'Actions';
    title: string;
    icon: string;
    hint?: string;
    keywords?: string;
    danger?: boolean;
    run: () => unknown;
}

/** Word-start matches beat inside-a-word ones; every typed word must match somewhere. */
export function tmbScore(query: string, command: Pick<TmbCommand, 'title' | 'keywords' | 'group'>): number {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return 1;
    const title = command.title.toLowerCase();
    const keywords = (command.keywords ?? '').toLowerCase();
    let score = 0;
    for (const word of words) {
        const at = title.indexOf(word);
        const inTitle = at < 0 ? 0 : at === 0 ? 30 : /[\s@#·._-]/.test(title[at - 1]) ? 20 : 8;
        const inKeywords = keywords.includes(word) ? 6 : 0;
        if (!inTitle && !inKeywords) return 0;
        score += Math.max(inTitle, inKeywords);
    }
    return score + (command.group === 'Actions' || command.group === 'Go to' ? 4 : 0) - title.length * 0.05;
}

// ───────────────────────────── tabs ─────────────────────────────

export type TmbTab = 'queue' | 'published' | 'analytics' | 'reach' | 'strategy' | 'activity' | 'settings';

export const TMB_TABS: { id: TmbTab; label: string; icon: string; needsBlog?: boolean; key: string }[] = [
    { id: 'queue', label: 'Queue', icon: 'clock', key: '1' },
    { id: 'published', label: 'Published', icon: 'send', key: '2' },
    { id: 'analytics', label: 'Analytics', icon: 'chart', key: '3' },
    { id: 'reach', label: 'Reach', icon: 'radar', needsBlog: true, key: '4' },
    { id: 'strategy', label: 'Strategy', icon: 'sliders', needsBlog: true, key: '5' },
    { id: 'activity', label: 'Activity', icon: 'activity', key: '6' },
    { id: 'settings', label: 'Settings', icon: 'gear', key: '7' },
];

export function tmbIsTab(value: unknown): value is TmbTab {
    return typeof value === 'string' && TMB_TABS.some(t => t.id === value);
}
