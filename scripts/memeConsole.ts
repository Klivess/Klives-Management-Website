/*
 * MemeScraper console: pure rules (no Vue, no fetch). Types mirror MemeScraperInsights.cs and
 * MemeScraper.BuildHealthSnapshot; every field added after Oct 2026 is optional, because the site and
 * the server deploy separately. Top-level names carry an `ms` / `MS_` prefix: Nuxt auto-imports every
 * composable export, and a clash silently swaps one function for another.
 */

// ───────────────────────────── API shapes ─────────────────────────────

export type MsView = 'overview' | 'sources' | 'library' | 'activity';
export type MsGranularity = 'day' | 'week' | 'month';
export type MsSourceState = 'ok' | 'quiet' | 'empty' | 'idle' | 'warn' | 'bad' | 'paused' | 'removed';
export type MsTone = 'ok' | 'warn' | 'crit' | 'info' | 'neutral' | 'violet';

export interface MsRange {
  From: string; To: string; Days: number; FromUtc: string; ToUtc: string; AllTime: boolean; HasBaseline: boolean;
  PrevFrom: string | null; PrevTo: string | null; Granularity: MsGranularity; TimeZone: string; Today: string;
}

export interface MsBucket {
  Key: string; From: string; To: string; Days: number; Incomplete: boolean; Downloads: number; Views: number;
  Cumulative: number; Previous: number | null; Stack: number[]; Scrapes: number; ScrapeFailures: number; NewReelsSeen: number;
}

export interface MsKpis {
  Downloaded: number; DownloadedPrev: number | null; PerDay: number; PerDayPrev: number | null;
  ActiveSources: number; ActiveSourcesPrev: number | null; SourcesInScope: number; ReelSources: number;
  TotalViews: number; AvgViews: number | null; MedianViews: number | null; MedianViewsPrev: number | null;
  AvgLikes: number | null; AvgComments: number | null; MedianEngagementPct: number | null; MedianEngagementPctPrev: number | null;
  MedianAgeHours: number | null; MedianAgeHoursPrev: number | null; ViralReels: number;
  Scrapes: number; ScrapesPrev: number | null; ScrapeFailures: number; SuccessRate: number | null; SuccessRatePrev: number | null;
  MedianScrapeSeconds: number | null; DownloadFailures: number; LibraryAtStart: number; LibraryAtEnd: number;
  ZeroDays: number; LongestGapDays: number; LongestGapFrom: string | null; LongestGapTo: string | null; BestDay: string | null; BestDayCount: number;
}

export interface MsSource {
  Username: string; AccountID: string | null; FullName: string | null; ProfilePictureUrl: string | null; Bio: string | null;
  Followers: number | null; Registered: boolean; DownloadReels: boolean; DownloadPosts: boolean; Niches: string[];
  TopHashtags: { Hashtag: string; Count: number }[]; AddedUtc: string | null; ProfileUpdatedUtc: string | null;
  Downloaded: number; DownloadedPrev: number | null; Share: number; TotalReels: number;
  AvgViews: number | null; MedianViews: number | null; TopViews: number | null; MedianAgeHours: number | null; MedianEngagementPct: number | null;
  FirstDownloadUtc: string | null; LastDownloadUtc: string | null;
  /** Newest post date among the account's reels (Nov 2026; older servers omit it). */
  LastPostedUtc?: string | null;
  Spark: number[]; Scrapes: number; ScrapeFailures: number; AvgNewPerScrape: number | null;
  NextScrapeDueUtc: string | null; LastScrapeAttemptUtc: string | null; LastSuccessfulScrapeUtc: string | null;
  ConsecutiveScrapeFailures: number; LastScrapeError: string | null; LastScrapeSummary: string | null;
  LastScrapeReelsFound: number; LastScrapeReelsDownloaded: number; LastScrapeDownloadFailures: number;
  State: MsSourceState; StateReason: string;
}

export interface MsNiche { Name: string; Sources: number; Downloaded: number; DownloadedPrev: number | null; Share: number; AvgViews: number | null; MedianViews: number | null }
export interface MsDistribution { Label: string; Count: number; Share: number; AvgViews: number | null }
export interface MsHeatCell { Dow: number; Hour: number; Reels: number; AvgViews: number }
export interface MsNamedCount { Name: string; Count: number }
export interface MsInsight { Level: 'bad' | 'warn' | 'good' | 'info'; Title: string; Detail: string; Sources: string[] }

export interface MsReel {
  PostID: string; ShortCode: string | null; Owner: string; Registered: boolean; Niches: string[];
  Views: number; Likes: number; Comments: number; EngagementPct: number | null;
  PostedUtc: string | null; DownloadedUtc: string | null; AgeHours: number | null;
  Description: string | null; Url: string | null; Via: string | null; VideoExists: boolean | null; Bytes: number | null;
}

export interface MsLibrary {
  TotalReels: number; MatchingReels: number; Sources: number; ReelSources: number; PausedSources: number; FailingSources: number;
  EmptySources?: number; Niches: number; FirstDownloadUtc: string | null; LastDownloadUtc: string | null;
}

export interface MsDashboard {
  GeneratedUtc: string; Range: MsRange; FilterSources: string[]; FilterNiche: string | null;
  Options: { Sources: string[]; Niches: string[] }; Library: MsLibrary; Kpis: MsKpis; StackKeys: string[]; Series: MsBucket[];
  Sources: MsSource[]; Niches: MsNiche[]; ViewsDistribution: MsDistribution[]; AgeDistribution: MsDistribution[];
  Heatmap: MsHeatCell[]; BusiestSlot: string | null; BestViewsSlot: string | null;
  DiscoveredVia: MsNamedCount[]; ScrapeProviders: MsNamedCount[]; TopReels: MsReel[]; Insights: MsInsight[];
}

export interface MsReelPage {
  Total: number; Filtered: number; Offset: number; Limit: number; Sort: string; Descending: boolean;
  Range: MsRange; Options: { Sources: string[]; Niches: string[] }; Rows: MsReel[];
}

export interface MsReelDetail { Reel: MsReel; OwnerReels: number; OwnerRank: number; OwnerMedianViews: number | null; Thumbnail: boolean }

export interface MsScrape {
  Username: string; AccountID: string | null; Trigger: string; StartedUtc: string; FinishedUtc: string | null; DurationMs: number | null;
  ReelsFound: number; NewReels: number; Downloaded: number; DownloadFailures: number; Error: string | null;
  ProviderSummary: string | null; SucceededVia: string | null; Notes: string[]; Status: 'ok' | 'partial' | 'failed';
}

export interface MsScrapePage {
  Total: number; Filtered: number; Offset: number; Limit: number; Range: MsRange; Options: { Sources: string[]; Niches: string[] };
  Stats: { Scrapes: number; Failed: number; Partial: number; SuccessRate: number | null; MedianSeconds: number | null; ReelsSeen: number; NewReels: number; Downloaded: number; DownloadFailures: number };
  Rows: MsScrape[];
}

export interface MsProvider {
  Name: string; ConsecutiveFailures: number; TotalSuccesses: number; TotalFailures: number;
  LastSuccess: string | null; LastFailure: string | null; LastError: string | null; BenchedUntil: string | null;
}

export interface MsProviderCheck {
  Username: string; RequestedBy: string; State: 'queued' | 'running' | 'complete'; QueuedUtc: string; StartedUtc: string | null; FinishedUtc: string | null;
  Results: { Provider: string; Ok: boolean; Listed: number; Reels: number; Pages: number; DurationMs: number; Error: string | null; Note: string | null; DownloadOk: boolean | null; DownloadBytes: number; DownloadHost: string | null; DownloadError: string | null }[];
}

export interface MsProfileRefresh {
  Username: string; AccountID: string; RequestedBy: string; State: 'queued' | 'running' | 'complete' | 'failed';
  QueuedUtc: string; FinishedUtc: string | null; Error: string | null; FollowersBefore: number | null; FollowersAfter: number | null;
}

export interface MsStartup {
  StartedUtc: string; DataReadyUtc: string | null; DataLoadMs: number | null; Steps: Record<string, number>;
  Progress: { Done: number; Total: number } | null;
  Reels: { Via: 'index' | 'files'; Ms: number; IndexMs: number; IndexBytes: number; IndexWrittenUtc: string | null; IndexProblem: string | null; ListMs: number; FilesRead: number; Failures: number; FirstError: string | null; Reels: number } | null;
  Reconcile: { Ms: number; ListMs: number; Listed: number; Added: number; Changed: number; Removed: number; FilesRead: number; Failures: number; FinishedUtc: string } | null;
  IndexWrite: { WrittenUtc: string; Reels: number; Bytes: number; Ms: number } | null;
  IndexWriteError: string | null;
}

export interface MsHealthSource {
  Username: string; AccountID: string; DownloadReels: boolean; NextScrapeDueUtc: string | null; LastScrapeAttemptUtc: string | null;
  LastSuccessfulScrapeUtc: string | null; ConsecutiveScrapeFailures: number; LastScrapeError: string | null; LastScrapeSummary: string | null;
  LastScrapeReelsFound: number; LastScrapeReelsDownloaded: number; LastScrapeDownloadFailures: number; TotalReelsDownloaded: number;
}

export interface MsHealth {
  GeneratedUtc: string; DataLoaded: boolean; OnServer: boolean; SchedulerState: string; LastSchedulerTickUtc: string | null;
  NextScrapeDueUtc: string | null; CurrentScrape: string | null; ReelsOnDisk: number; Providers: MsProvider[]; FailingSources: number;
  Sources: MsHealthSource[]; RecentScrapes: (Omit<MsScrape, 'Status' | 'DurationMs'> & { Status?: string })[];
  ScrapeHistoryCount?: number; ProviderCheck: MsProviderCheck | null; ProfileRefresh?: MsProfileRefresh | null;
  ScrapeIntervalHours: number; Settings?: { Paused: boolean; IntervalHours: number; MaxPagesPerScrape: number; ReadUtc?: string | null } | null;
  ScrapeQueued: number;
  Disk?: { Bytes: number; Files: number; MissingVideos: number; OrphanFiles: number; ThumbnailBytes: number; MeasuredUtc: string; DurationMs: number } | null;
  Startup?: MsStartup | null;
  /** Background thumbnail making for reels that have none (Nov 2026). */
  ThumbnailBackfill?: { State: 'waiting' | 'running' | 'paused' | 'off' | 'done'; Made: number; Failed: number; Remaining: number; LastMadeUtc: string | null; CountedUtc: string | null } | null;
}

// ───────────────────────────── numbers and time ─────────────────────────────

const LOCALE = 'en-GB';

export function msInt(value: number | null | undefined): string {
  return value === null || value === undefined || Number.isNaN(value) ? '—' : Math.round(value).toLocaleString(LOCALE);
}

/** 980 · 12.4k · 85k · 1.2M · 71.8M */
export function msCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  if (abs < 1_000) return String(Math.round(value));
  if (abs < 10_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  if (abs < 1_000_000) return `${Math.round(value / 1_000)}k`;
  if (abs < 10_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs < 1_000_000_000) return `${Math.round(value / 1_000_000)}M`;
  return `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
}

export function msPct(value: number | null | undefined, digits = 0): string {
  return value === null || value === undefined || Number.isNaN(value) ? '—' : `${value.toFixed(digits)}%`;
}

export function msBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** 340 ms · 53 s · 2.1 min · 19.5 min · 1.4 h */
export function msDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '—';
  if (ms < 1_000) return `${Math.round(ms)} ms`;
  const s = ms / 1_000;
  if (s < 90) return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`;
  const m = s / 60;
  if (m < 90) return `${m < 10 ? m.toFixed(1) : Math.round(m)} min`;
  return `${(m / 60).toFixed(1)} h`;
}

/** 40 min · 9.7 h · 4.2 days */
export function msHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || Number.isNaN(hours)) return '—';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)} h`;
  return `${(hours / 24).toFixed(hours < 240 ? 1 : 0)} days`;
}

/** The server stamps UTC; tolerate a missing zone suffix and .NET's DateTime.MinValue. */
export function msParse(value: string | null | undefined): Date | null {
  if (!value || value.startsWith('0001-01-01')) return null;
  const date = new Date(/([zZ]|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function spanText(abs: number): string {
  const minutes = Math.round(abs / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h`;
  return `${Math.round(minutes / 1440)} d`;
}

/** "just now" · "12 min ago" · "3 h ago" · "in 4 h" */
export function msAgo(value: string | null | undefined, now: number, never = 'never'): string {
  const date = msParse(value);
  if (!date) return never;
  const diff = date.getTime() - now;
  if (Math.abs(diff) < 45_000) return diff > 0 ? 'any moment' : 'just now';
  return diff > 0 ? `in ${spanText(diff)}` : `${spanText(-diff)} ago`;
}

/** A due time: "in 3 h", "due now" just past, "overdue 21 h" once the 5-minute scheduler should have run it. */
export function msDue(value: string | null | undefined, now: number, never = '—'): string {
  const date = msParse(value);
  if (!date) return never;
  const late = now - date.getTime();
  if (late <= 0) return msAgo(value, now, never);
  if (late < 15 * 60_000) return 'due now';
  return `overdue ${spanText(late)}`;
}

export function msDaysSince(value: string | null | undefined, now: number): number | null {
  const date = msParse(value);
  return date ? Math.floor((now - date.getTime()) / 86_400_000) : null;
}

/** yyyy-MM-dd → "5 Oct" (or "5 Oct 2025"). */
export function msDay(key: string | null | undefined, withYear = false): string {
  if (!key) return '—';
  const d = new Date(`${key.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString(LOCALE, withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
}

export function msDayRange(from: string, to: string): string {
  if (from === to) return msDay(from, true);
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${msDay(from, !sameYear)} – ${msDay(to, true)}`;
}

export function msStamp(value: string | null | undefined): string {
  const d = msParse(value);
  return d ? d.toLocaleString(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
}

export function msTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

export interface MsChange { pct: number | null; abs: number; dir: -1 | 0 | 1 }

export function msCompare(current: number | null | undefined, previous: number | null | undefined): MsChange | null {
  if (current === null || current === undefined || previous === null || previous === undefined) return null;
  const abs = current - previous;
  const pct = previous !== 0 ? (abs / Math.abs(previous)) * 100 : null;
  const dir = (pct !== null && Math.abs(pct) < 0.5) || abs === 0 ? 0 : (abs > 0 ? 1 : -1);
  return { pct, abs, dir };
}

/** "+12%" · "−3%" · "new" · "±0%" */
export function msChangeText(change: MsChange | null, mode: 'pct' | 'points' | 'count' = 'pct'): string {
  if (!change) return '';
  if (mode === 'points') return `${change.abs >= 0 ? '+' : '−'}${Math.abs(change.abs).toFixed(1)} pts`;
  if (mode === 'count') return `${change.abs > 0 ? '+' : change.abs < 0 ? '−' : '±'}${msInt(Math.abs(change.abs))}`;
  if (change.pct === null) return change.abs > 0 ? 'new' : '±0%';
  if (change.dir === 0) return '±0%';
  return `${change.pct > 0 ? '+' : '−'}${Math.abs(change.pct).toFixed(0)}%`;
}

// ───────────────────────────── labels ─────────────────────────────

export const MS_STATES: Record<MsSourceState, { label: string; tone: MsTone; order: number; hint: string }> = {
  bad: { label: 'Failing', tone: 'crit', order: 0, hint: 'Three or more failed scrapes in a row' },
  warn: { label: 'Needs a look', tone: 'warn', order: 1, hint: 'The last scrape failed or some downloads did' },
  empty: { label: 'Never had a reel', tone: 'violet', order: 2, hint: 'Scrapes work but have never found a reel' },
  quiet: { label: 'Quiet', tone: 'info', order: 3, hint: 'Scrapes work; nothing new for a while' },
  idle: { label: 'Not scraped yet', tone: 'neutral', order: 4, hint: 'Waiting for its first scrape' },
  ok: { label: 'Healthy', tone: 'ok', order: 5, hint: 'Scraping and finding reels' },
  paused: { label: 'Paused', tone: 'neutral', order: 6, hint: 'Reel downloads switched off' },
  removed: { label: 'Removed', tone: 'neutral', order: 7, hint: 'No longer a source; its reels are kept' },
};

export function msStateOf(state: string | null | undefined) {
  return MS_STATES[(state as MsSourceState) in MS_STATES ? (state as MsSourceState) : 'ok'];
}

export const MS_PROVIDERS: Record<string, { label: string; role: string }> = {
  inflact: { label: 'inflact.com', role: 'Primary: full reel history through inflact’s API' },
  instagram: { label: 'Instagram', role: 'Fallback: the newest ~12 reels from Instagram itself; also refreshes expired video links' },
  'inflact+instagram': { label: 'Both', role: '' },
  unknown: { label: 'Unknown', role: '' },
};

export const msProviderLabel = (name: string | null | undefined) => (name ? MS_PROVIDERS[name]?.label ?? name : '—');

export function msTriggerLabel(trigger: string | null | undefined): string {
  if (!trigger) return '—';
  if (trigger === 'schedule') return 'Scheduled';
  if (trigger.startsWith('manual:')) return `By ${trigger.substring(7)}`;
  if (trigger === 'legacy-call') return 'Script';
  return trigger;
}

/** "@user (manual:klives) since 2026-…" → "@user". */
export function msCurrentSubject(current: string | null | undefined): string | null {
  if (!current) return null;
  const m = /(@[^\s]+)/.exec(current);
  return m ? m[1] : current;
}

export const MS_RANGES = [
  { key: '7d', label: '7D', title: 'Last 7 days' },
  { key: '30d', label: '30D', title: 'Last 30 days' },
  { key: '90d', label: '90D', title: 'Last 90 days' },
  { key: '180d', label: '6M', title: 'Last 6 months' },
  { key: '1y', label: '1Y', title: 'Last year' },
  { key: 'all', label: 'All', title: 'Everything ever downloaded' },
] as const;
export const MS_DEFAULT_RANGE = '30d';

/** Series colours: warm to cool, readable on the dark surface. The last is "Other". */
export const MS_SERIES = ['#ff6b9a', '#ffb454', '#57d3c8', '#7aa7ff', '#c08bff', '#a3e36b', '#f2d35b'];
export const MS_OTHER = '#4b4959';

/**
 * Colours that stay with a source: slots follow all-time volume (`ranking`), so the biggest accounts keep
 * theirs when the window changes; anything else takes the next free slot.
 */
export function msSourceColours(keys: string[], ranking: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const used = new Set<number>();
  const rank = new Map(ranking.slice(0, MS_SERIES.length).map((name, i) => [name.toLowerCase(), i]));
  for (const key of keys) {
    const slot = rank.get(key.toLowerCase());
    if (key !== 'Other' && slot !== undefined && !used.has(slot)) { out[key] = MS_SERIES[slot]; used.add(slot); }
  }
  let next = 0;
  for (const key of keys) {
    if (key === 'Other' || out[key]) continue;
    while (used.has(next) && next < MS_SERIES.length) next++;
    out[key] = next < MS_SERIES.length ? MS_SERIES[next] : MS_OTHER;
    used.add(next);
  }
  out.Other = MS_OTHER;
  return out;
}

/** A stable tint for a source's avatar, from its name. */
export function msAvatarHue(name: string): number {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
}

// ───────────────────────────── what needs attention ─────────────────────────────

export type MsIssueAction =
  | { kind: 'pause-sources'; label: string; sources: string[] }
  | { kind: 'show-state'; label: string; state: MsSourceState }
  | { kind: 'open-source'; label: string; source: string }
  | { kind: 'check-providers'; label: string }
  | { kind: 'resume-schedule'; label: string }
  | { kind: 'view'; label: string; view: MsView };

export interface MsIssue { id: string; tone: MsTone; title: string; detail: string; action?: MsIssueAction }

export interface MsVerdict { tone: MsTone; title: string; detail: string; issues: MsIssue[] }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const names = (list: string[], max = 3) => list.slice(0, max).map(n => `@${n}`).join(', ') + (list.length > max ? ` and ${list.length - max} more` : '');

/**
 * Everything worth a person's attention, worst first. Built from the dashboard (source states) and the
 * health snapshot (scheduler, providers, start-up), so it works while either is missing.
 */
export function msIssues(d: MsDashboard | null, h: MsHealth | null, now: number): MsIssue[] {
  const list: MsIssue[] = [];
  if (h && !h.DataLoaded) {
    const p = h.Startup?.Progress;
    list.push({
      id: 'starting', tone: 'info', title: 'MemeScraper is starting',
      detail: p && p.Total ? `Reading reels: ${msInt(p.Done)} of ${msInt(p.Total)}.` : 'Loading sources and reels. This page fills in when it is ready.',
    });
    return list;
  }
  if (h?.SchedulerState?.startsWith('failed') || h?.SchedulerState?.startsWith('tick failed')) {
    list.push({ id: 'scheduler', tone: 'crit', title: 'The scheduler is broken', detail: h.SchedulerState, action: { kind: 'view', label: 'Open activity', view: 'activity' } });
  }
  const providers = h?.Providers ?? [];
  const failingProviders = providers.filter(p => p.ConsecutiveFailures > 0 || (p.BenchedUntil && (msParse(p.BenchedUntil)?.getTime() ?? 0) > now));
  if (providers.length && failingProviders.length === providers.length) {
    list.push({ id: 'providers', tone: 'crit', title: 'Every provider is failing', detail: failingProviders[0].LastError ?? 'No provider can list reels.', action: { kind: 'check-providers', label: 'Check providers' } });
  } else if (failingProviders.length) {
    list.push({
      id: 'providers', tone: 'warn', title: `${failingProviders.map(p => msProviderLabel(p.Name)).join(' and ')} ${failingProviders.length === 1 ? 'is' : 'are'} failing`,
      detail: `${failingProviders[0].LastError ?? ''} Scrapes fall back to the other provider.`.trim(),
      action: { kind: 'check-providers', label: 'Check providers' },
    });
  }

  const sources = (d?.Sources ?? []).filter(s => s.Registered);
  const bad = sources.filter(s => s.State === 'bad');
  if (bad.length) {
    list.push({
      id: 'bad', tone: 'crit', title: bad.length === 1 ? `@${bad[0].Username} keeps failing` : `${bad.length} sources keep failing`,
      detail: bad.length === 1 ? `${bad[0].ConsecutiveScrapeFailures} scrapes in a row. ${bad[0].LastScrapeError ?? ''}`.trim() : `${names(bad.map(s => s.Username))} have failed 3+ scrapes in a row.`,
      action: bad.length === 1 ? { kind: 'open-source', label: 'Open', source: bad[0].Username } : { kind: 'show-state', label: 'Show them', state: 'bad' },
    });
  }
  const warn = sources.filter(s => s.State === 'warn');
  if (warn.length) {
    list.push({
      id: 'warn', tone: 'warn', title: warn.length === 1 ? `@${warn[0].Username} needs a look` : `${warn.length} sources need a look`,
      detail: warn.length === 1 ? warn[0].StateReason : `${names(warn.map(s => s.Username))}: the last scrape or some downloads failed.`,
      action: warn.length === 1 ? { kind: 'open-source', label: 'Open', source: warn[0].Username } : { kind: 'show-state', label: 'Show them', state: 'warn' },
    });
  }
  const empty = sources.filter(s => s.State === 'empty' && s.DownloadReels);
  if (empty.length) {
    list.push({
      id: 'empty', tone: 'violet', title: `${plural(empty.length, 'source')} ${empty.length === 1 ? 'has' : 'have'} never had a reel`,
      detail: `${names(empty.map(s => s.Username))}. Every scrape finds nothing, and each still costs a browser run a day.`,
      action: { kind: 'pause-sources', label: empty.length === 1 ? 'Pause it' : `Pause all ${empty.length}`, sources: empty.map(s => s.Username) },
    });
  }
  if (h?.Settings?.Paused || h?.SchedulerState?.startsWith('paused')) {
    list.push({ id: 'paused', tone: 'warn', title: 'Scheduled scrapes are paused', detail: 'Nothing is scraped until they are resumed. Manual scrapes still work.', action: { kind: 'resume-schedule', label: 'Resume' } });
  }
  const quiet = sources.filter(s => s.State === 'quiet' && s.DownloadReels);
  if (quiet.length) {
    const dormant = quiet.filter(s => s.LastPostedUtc && (msDaysSince(s.LastPostedUtc, now) ?? 0) >= 30);
    list.push({
      id: 'quiet', tone: 'info', title: `${plural(quiet.length, 'source')} ${quiet.length === 1 ? 'has' : 'have'} gone quiet`,
      detail: dormant.length
        ? `${plural(dormant.length, 'account')} ${dormant.length === 1 ? 'has' : 'have'} not posted for a month or more (${names(dormant.map(s => s.Username), 2)}). The scraper is fine; the accounts stopped.`
        : `${names(quiet.map(s => s.Username))}: scrapes succeed but nothing new has been posted.`,
      action: { kind: 'show-state', label: 'Show them', state: 'quiet' },
    });
  }
  if (h?.Disk && h.Disk.MissingVideos > 0) {
    list.push({ id: 'missing', tone: 'info', title: `${plural(h.Disk.MissingVideos, 'reel')} lost ${h.Disk.MissingVideos === 1 ? 'its' : 'their'} video`, detail: 'The record is kept but the video file is gone from disk.', action: { kind: 'view', label: 'Disk', view: 'activity' } });
  }
  if (h?.Startup?.IndexWriteError) {
    list.push({ id: 'index', tone: 'warn', title: 'The reel index could not be saved', detail: `${h.Startup.IndexWriteError} The next start reads every reel file instead (slow).`, action: { kind: 'view', label: 'Start-up', view: 'activity' } });
  }
  const order: Record<MsTone, number> = { crit: 0, warn: 1, violet: 2, info: 3, neutral: 4, ok: 5 };
  return list.sort((a, b) => order[a.tone] - order[b.tone]);
}

export function msVerdict(d: MsDashboard | null, h: MsHealth | null, now: number): MsVerdict {
  const issues = msIssues(d, h, now);
  if (!h && !d) return { tone: 'neutral', title: 'Connecting…', detail: '', issues };
  if (h && !h.DataLoaded) return { tone: 'info', title: 'Starting up', detail: issues[0]?.detail ?? '', issues };
  if (h?.CurrentScrape) {
    const subject = msCurrentSubject(h.CurrentScrape);
    const what = h.CurrentScrape.startsWith('provider check') ? `Checking providers on ${subject}` : h.CurrentScrape.startsWith('profile refresh') ? `Refreshing ${subject}` : `Scraping ${subject}`;
    return { tone: 'ok', title: what, detail: (h.ScrapeQueued ?? 0) > 1 ? `${h.ScrapeQueued - 1} more queued` : 'Runs one at a time', issues };
  }
  // The headline counts; the list below it names each one (so the first issue is never said twice).
  const crit = issues.filter(i => i.tone === 'crit').length;
  const warn = issues.filter(i => i.tone === 'warn').length;
  const notes = issues.length - crit - warn;
  const counts = [crit ? plural(crit, 'problem') : '', warn ? plural(warn, 'warning') : '', notes ? plural(notes, 'note') : ''].filter(Boolean).join(' · ');
  if (crit) return { tone: 'crit', title: crit === 1 ? '1 problem needs you' : `${crit} problems need you`, detail: counts, issues };
  if (warn) return { tone: 'warn', title: 'Collecting, with problems', detail: counts, issues };
  const next = h?.NextScrapeDueUtc ? `Next scrape ${msDue(h.NextScrapeDueUtc, now)}` : '';
  return { tone: 'ok', title: 'Collecting normally', detail: [next, notes ? plural(notes, 'note') : ''].filter(Boolean).join(' · '), issues };
}

// ───────────────────────────── sources ─────────────────────────────

export type MsSourceSort = 'state' | 'reels' | 'total' | 'name' | 'last' | 'posted' | 'next' | 'followers' | 'views';

export function msSortSources(rows: MsSource[], sort: MsSourceSort, desc: boolean): MsSource[] {
  const t = (v: string | null | undefined) => msParse(v)?.getTime() ?? -Infinity;
  const key: (s: MsSource) => number | string = {
    state: (s: MsSource) => msStateOf(s.State).order * 1e9 - s.Downloaded,
    reels: (s: MsSource) => s.Downloaded,
    total: (s: MsSource) => s.TotalReels,
    name: (s: MsSource) => s.Username.toLowerCase(),
    last: (s: MsSource) => t(s.LastDownloadUtc),
    posted: (s: MsSource) => t(s.LastPostedUtc),
    next: (s: MsSource) => (s.NextScrapeDueUtc ? t(s.NextScrapeDueUtc) : Infinity),
    followers: (s: MsSource) => s.Followers ?? -1,
    views: (s: MsSource) => s.MedianViews ?? -1,
  }[sort];
  // Text and "state" read naturally ascending; numbers biggest first. `desc` flips the natural order.
  const natural = sort === 'name' || sort === 'state' || sort === 'next' ? 1 : -1;
  const dir = desc ? -natural : natural;
  return [...rows].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka < kb) return -dir;
    if (ka > kb) return dir;
    return a.Username.localeCompare(b.Username);
  });
}

export function msMatchesSource(s: MsSource, text: string): boolean {
  const q = text.trim().toLowerCase().replace(/^@/, '');
  if (!q) return true;
  return s.Username.toLowerCase().includes(q) || (s.FullName ?? '').toLowerCase().includes(q) || s.Niches.some(n => n.toLowerCase().includes(q));
}

// ───────────────────────────── command palette ─────────────────────────────

export interface MsCommand {
  id: string; group: string; title: string; hint?: string; icon?: string; keywords?: string; danger?: boolean; run: () => void;
}

/** Subsequence match with bonuses for word starts and runs; 0 means no match. */
export function msScore(text: string, query: string): number {
  const t = text.toLowerCase();
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  if (t.includes(q)) return 1000 - t.indexOf(q) + (t.startsWith(q) ? 500 : 0);
  let score = 0;
  let ti = 0;
  let run = 0;
  for (const ch of q) {
    const at = t.indexOf(ch, ti);
    if (at < 0) return 0;
    run = at === ti ? run + 1 : 0;
    score += 10 + run * 5 + (at === 0 || /[\s@._-]/.test(t[at - 1]) ? 15 : 0);
    ti = at + 1;
  }
  return score;
}

export function msRankCommands(commands: MsCommand[], query: string, limit = 40): MsCommand[] {
  if (!query.trim()) return commands.slice(0, limit);
  return commands
    .map(c => ({ c, s: Math.max(msScore(c.title, query), msScore(`${c.keywords ?? ''}`, query) * 0.6) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(x => x.c);
}
