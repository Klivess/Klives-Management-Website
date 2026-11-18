import type { CatalogService, PermissionCatalogPayload, ProfileRow } from '~/scripts/profilesApi';
import { durationShort, relTime, toMs } from '~/scripts/profileFormat';

/*
 * The profile console's rules, kept free of Vue so they can be read and tested on their own:
 * what /KMProfiles/insights says, how a directory row is put together, what the review flags,
 * the services × profiles access matrix, and how the command palette scores a query.
 *
 * Every insight field is optional: the site and the server deploy separately, and a viewer only
 * gets the parts their permissions allow.
 */

// ───────────────────────────── insights ─────────────────────────────

export interface InsightAuth {
  session7d: number;
  password7d: number;
  lastPasswordUtc: string | null;
  lastSessionUtc: string | null;
  passwordApiAllowed: boolean;
}

export interface InsightUsage { windowDays: number; held: number; used: number; unused: string[] }

export interface InsightSessions { active: number; idle: number; idleDays: number; oldestIdleSeenUtc: string | null }

export interface ProfileInsight {
  userId: string;
  hourly24?: number[];
  auth?: InsightAuth;
  loginRefused30d?: number;
  usage?: InsightUsage;
  sessions?: InsightSessions;
  /** Every key held (permissions viewers only); null for the owner, who holds everything. */
  effective?: string[] | null;
}

export interface PasswordBearerState {
  accepted: boolean;
  windowDays: number;
  coveredSinceUtc: string | null;
  blockers: { userId: string; name: string; password7d: number; lastPasswordUtc: string | null }[];
  safeToSwitchOff: boolean;
}

export interface InsightsPayload {
  builtUtc: string;
  buildMs?: number;
  trackingSinceUtc: string | null;
  rollups?: { ready: boolean; through: number; upto: number };
  passwordBearer: PasswordBearerState | null;
  profiles: ProfileInsight[];
}

// ───────────────────────────── rows ─────────────────────────────

export interface PersonRow extends ProfileRow {
  insight: ProfileInsight | null;
  hourly: number[];
  idleDevices: number;
  /** Permission keys this profile holds directly and has not used in the usage window. */
  unused: string[];
  used: number | null;
  held: number;
  password7d: number | null;
  session7d: number | null;
  /** Short reasons this row is worth a look (drives the "Needs a look" filter). */
  attention: string[];
}

const DAY = 86_400_000;

export function buildRows(list: ProfileRow[], insights: InsightsPayload | null, now: number): PersonRow[] {
  const byId = new Map((insights?.profiles ?? []).map(i => [i.userId, i]));
  return list.map(p => {
    const i = byId.get(p.userId) ?? null;
    const usage = i?.usage;
    const row: PersonRow = {
      ...p,
      insight: i,
      hourly: i?.hourly24 ?? [],
      idleDevices: i?.sessions?.idle ?? 0,
      unused: usage?.unused ?? [],
      used: usage ? usage.used : null,
      held: usage?.held ?? p.grantCount,
      password7d: i?.auth ? i.auth.password7d : null,
      session7d: i?.auth ? i.auth.session7d : null,
      attention: [],
    };
    row.attention = attentionFor(row, insights, now);
    return row;
  });
}

function attentionFor(row: PersonRow, insights: InsightsPayload | null, now: number): string[] {
  const out: string[] = [];
  if (row.suspended) out.push('suspended');
  if (row.denied24h > 0) out.push('refused');
  if (row.idleDevices > 0) out.push('idle-devices');
  if (!row.isOwner && row.unused.length > 0) out.push('unused');
  if (isDormant(row, insights, now)) out.push('dormant');
  if (insights?.passwordBearer?.blockers.some(b => b.userId === row.userId)) out.push('password');
  return out;
}

/** Can sign in, holds permissions, and has not been seen for 30 days (or ever, since tracking began). */
export function isDormant(row: Pick<ProfileRow, 'isOwner' | 'canLogin' | 'grantCount' | 'lastSeenUtc' | 'presence'>, insights: InsightsPayload | null, now: number): boolean {
  if (row.isOwner || !row.canLogin || row.grantCount === 0 || row.presence.state !== 'offline') return false;
  const seen = toMs(row.lastSeenUtc);
  if (seen != null) return now - seen > 30 * DAY;
  const tracking = toMs(insights?.trackingSinceUtc ?? null);
  return tracking == null || now - tracking > 30 * DAY;
}

/** "Last seen 3d ago", or — for a profile with no activity on record — since when nothing was seen. */
export function lastSeenText(row: Pick<ProfileRow, 'lastSeenUtc'>, insights: InsightsPayload | null, now: number): string {
  if (row.lastSeenUtc) return `Last seen ${relTime(row.lastSeenUtc, now)}`;
  const tracking = toMs(insights?.trackingSinceUtc ?? null);
  if (tracking == null) return 'Not seen yet';
  return `Not seen since ${new Date(tracking).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

export type DirectoryFilter = 'all' | 'online' | 'attention' | 'off' | 'suspended';

export const FILTERS: { id: DirectoryFilter; label: string }[] = [
  { id: 'all', label: 'Everyone' },
  { id: 'online', label: 'Online' },
  { id: 'attention', label: 'Needs a look' },
  { id: 'off', label: 'Sign-in off' },
  { id: 'suspended', label: 'Suspended' },
];

export function matchesFilter(row: PersonRow, filter: DirectoryFilter): boolean {
  switch (filter) {
    case 'online': return row.presence.state !== 'offline';
    case 'attention': return row.attention.length > 0;
    case 'off': return !row.canLogin;
    case 'suspended': return row.suspended;
    default: return true;
  }
}

export type DirectorySort = 'rank' | 'seen' | 'activity' | 'access' | 'name';

export const SORTS: { id: DirectorySort; label: string }[] = [
  { id: 'rank', label: 'Rank' },
  { id: 'seen', label: 'Last seen' },
  { id: 'activity', label: 'Activity' },
  { id: 'access', label: 'Permissions' },
  { id: 'name', label: 'Name' },
];

export function sortRows(rows: PersonRow[], sort: DirectorySort): PersonRow[] {
  const seen = (r: PersonRow) => (r.presence.state !== 'offline' ? Number.MAX_SAFE_INTEGER : toMs(r.lastSeenUtc) ?? 0);
  return [...rows].sort((a, b) => {
    switch (sort) {
      case 'seen': return seen(b) - seen(a) || a.name.localeCompare(b.name);
      case 'activity': return b.requests24h - a.requests24h || a.name.localeCompare(b.name);
      case 'access': return b.held - a.held || a.name.localeCompare(b.name);
      case 'name': return a.name.localeCompare(b.name);
      default: return Number(b.isOwner) - Number(a.isOwner) || b.rankValue - a.rankValue || a.name.localeCompare(b.name);
    }
  });
}

export function matchesText(row: ProfileRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return row.name.toLowerCase().includes(q) || row.rank.toLowerCase().includes(q) || (row.isOwner && 'owner'.includes(q))
    || (row.presence.currentTitle ?? '').toLowerCase().includes(q) || (row.presence.currentPath ?? '').toLowerCase().includes(q);
}

// ───────────────────────────── the review ─────────────────────────────

export type Tone = 'ok' | 'warn' | 'crit' | 'info';

export type ReviewAction =
  | { kind: 'filter'; filter: DirectoryFilter }
  | { kind: 'profile'; userId: string; tab?: string }
  | { kind: 'sheet'; userId: string }
  | { kind: 'idle' }
  | { kind: 'settings' };

export interface ReviewIssue {
  id: string;
  tone: Tone;
  icon: string;
  title: string;
  detail: string;
  action?: ReviewAction;
}

export interface Review { tone: Tone; title: string; detail: string; issues: ReviewIssue[] }

const TONE_ORDER: Record<Tone, number> = { crit: 0, warn: 1, info: 2, ok: 3 };

function names(rows: { name: string }[], max = 3): string {
  const list = rows.slice(0, max).map(r => r.name);
  if (rows.length > max) list.push(`${rows.length - max} more`);
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * What in the directory deserves a look, worst first. Each issue says what it is in a line and
 * what clicking it does; nothing here acts on its own.
 */
export function computeReview(rows: PersonRow[], insights: InsightsPayload | null, now: number): Review {
  const issues: ReviewIssue[] = [];

  const refused = rows.filter(r => r.denied24h > 0).sort((a, b) => b.denied24h - a.denied24h);
  if (refused.length) {
    const total = refused.reduce((n, r) => n + r.denied24h, 0);
    issues.push({
      id: 'refused', tone: total >= 20 ? 'warn' : 'info', icon: 'ban',
      title: `${plural(total, 'request')} refused today`,
      detail: `${names(refused.map(r => ({ name: `${r.name} ${r.denied24h}` })))} — a page asking for what they don't hold, or someone probing.`,
      action: refused.length === 1 ? { kind: 'profile', userId: refused[0].userId, tab: 'activity' } : { kind: 'filter', filter: 'attention' },
    });
  }

  const bearer = insights?.passwordBearer;
  if (bearer?.accepted) {
    if (bearer.blockers.length) {
      issues.push({
        id: 'password-blockers', tone: 'warn', icon: 'key',
        title: `Passwords still work as API keys, and ${names(bearer.blockers)} ${bearer.blockers.length === 1 ? 'relies' : 'rely'} on it`,
        detail: `${plural(bearer.blockers.reduce((n, b) => n + b.password7d, 0), 'request')} in ${bearer.windowDays} days were signed with a password by a profile without password access. Give it password access or move it to a session before switching off.`,
        action: { kind: 'profile', userId: bearer.blockers[0].userId, tab: 'security' },
      });
    } else {
      const users = rows.filter(r => (r.password7d ?? 0) > 0);
      issues.push({
        id: 'password-safe', tone: 'info', icon: 'key',
        title: 'Passwords still work as API keys — safe to switch off',
        detail: users.length
          ? `In ${bearer.windowDays} days only ${names(users)} used a password, and ${users.length === 1 ? 'it is' : 'they are'} allowed to. Turn off KMProfiles_AcceptPasswordAsBearer in OmniSettings.`
          : `Nobody signed a request with a password in ${bearer.windowDays} days. Turn off KMProfiles_AcceptPasswordAsBearer in OmniSettings.`,
        action: { kind: 'settings' },
      });
    }
  }

  const idle = rows.filter(r => r.idleDevices > 0).sort((a, b) => b.idleDevices - a.idleDevices);
  if (idle.length) {
    const total = idle.reduce((n, r) => n + r.idleDevices, 0);
    const days = idle[0].insight?.sessions?.idleDays ?? 7;
    const oldest = idle.map(r => toMs(r.insight?.sessions?.oldestIdleSeenUtc ?? null)).filter((v): v is number => v != null).sort((a, b) => a - b)[0];
    issues.push({
      id: 'idle', tone: total >= 5 ? 'warn' : 'info', icon: 'device',
      title: `${plural(total, 'signed-in device')} unused for ${days}+ days`,
      detail: `${names(idle.map(r => ({ name: `${r.name} ${r.idleDevices}` })))}${oldest ? ` · the oldest last used ${relTime(oldest, now)}` : ''}. Each stays signed in for 30 days after its last use.`,
      action: { kind: 'idle' },
    });
  }

  const dormant = rows.filter(r => isDormant(r, insights, now));
  if (dormant.length) {
    issues.push({
      id: 'dormant', tone: 'warn', icon: 'user-x',
      title: `${plural(dormant.length, 'profile')} can sign in but ${dormant.length === 1 ? "hasn't" : "haven't"} in 30+ days`,
      detail: `${names(dormant)} — ${plural(dormant.reduce((n, r) => n + r.grantCount, 0), 'permission')} held. Turn sign-in off if ${dormant.length === 1 ? "it isn't" : "they aren't"} needed.`,
      action: dormant.length === 1 ? { kind: 'sheet', userId: dormant[0].userId } : { kind: 'filter', filter: 'attention' },
    });
  }

  const overGranted = rows.filter(r => !r.isOwner && r.canLogin && r.unused.length >= 5).sort((a, b) => b.unused.length - a.unused.length);
  if (overGranted.length) {
    const top = overGranted[0];
    issues.push({
      id: 'unused', tone: 'info', icon: 'scissors',
      title: overGranted.length === 1
        ? `${top.name} hasn't used ${top.unused.length} of ${top.held} permissions in ${top.insight?.usage?.windowDays ?? 30} days`
        : `${plural(overGranted.length, 'profile')} hold permissions they don't use`,
      detail: overGranted.length === 1
        ? 'Review them on the Access tab: "Remove unused" drafts the change, nothing is saved until you do.'
        : `${names(overGranted.map(r => ({ name: `${r.name} ${r.unused.length}` })))} unused in 30 days.`,
      action: { kind: 'profile', userId: top.userId, tab: 'access' },
    });
  }

  const off = rows.filter(r => !r.canLogin && !r.isOwner && r.grantCount > 0);
  if (off.length) {
    const tried = off.filter(r => (r.insight?.loginRefused30d ?? 0) > 0);
    issues.push({
      id: 'off', tone: 'info', icon: 'power',
      title: `${plural(off.length, 'profile')} with sign-in off still ${off.length === 1 ? 'holds' : 'hold'} ${plural(off.reduce((n, r) => n + r.grantCount, 0), 'permission')}`,
      detail: tried.length
        ? `${names(tried.map(r => ({ name: `${r.name} tried ${r.insight!.loginRefused30d}×` })))} to sign in anyway in 30 days.`
        : 'Harmless while sign-in stays off; they come back the moment it is turned on.',
      action: { kind: 'filter', filter: 'off' },
    });
  }

  for (const r of rows.filter(row => row.suspended)) {
    issues.push({
      id: `suspended-${r.userId}`, tone: 'info', icon: 'pause',
      title: `${r.name} is suspended${r.suspendedUntilUtc ? ` · lifts ${relTime(r.suspendedUntilUtc, now)}` : ''}`,
      detail: r.suspensionReason ? `“${r.suspensionReason}”` : 'No reason given.',
      action: { kind: 'sheet', userId: r.userId },
    });
  }

  const temporary = rows.filter(r => r.temporaryGrantCount > 0);
  if (temporary.length) {
    issues.push({
      id: 'temporary', tone: 'info', icon: 'clock',
      title: `${plural(temporary.reduce((n, r) => n + r.temporaryGrantCount, 0), 'temporary permission')} in force`,
      detail: `${names(temporary)} — each ends on its own.`,
      action: temporary.length === 1 ? { kind: 'profile', userId: temporary[0].userId, tab: 'access' } : { kind: 'filter', filter: 'all' },
    });
  }

  if (insights?.rollups && !insights.rollups.ready) {
    const pct = insights.rollups.upto ? Math.floor((insights.rollups.through / insights.rollups.upto) * 100) : 0;
    issues.push({
      id: 'rollups', tone: 'info', icon: 'refresh',
      title: `Activity summaries are being prepared · ${pct}%`,
      detail: 'Older requests are being rolled up once after the update; until then summaries read every row and are slower.',
    });
  }

  issues.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
  const counted = issues.filter(i => i.tone === 'warn' || i.tone === 'crit');
  if (!rows.length) return { tone: 'info', title: 'Loading the directory…', detail: '', issues };
  if (!counted.length) {
    return {
      tone: 'ok',
      title: 'Access is tidy',
      detail: issues.length ? `${plural(issues.length, 'note')} below, nothing pressing.` : 'Nobody refused, no idle devices, no dormant profiles.',
      issues,
    };
  }
  return {
    tone: counted.some(i => i.tone === 'crit') ? 'crit' : 'warn',
    title: counted.length === 1 ? 'One thing to tidy' : `${counted.length} things to tidy`,
    detail: issues.length > counted.length ? `and ${plural(issues.length - counted.length, 'note')} below` : '',
    issues,
  };
}

// ───────────────────────────── access matrix ─────────────────────────────

export interface MatrixCell { held: number; total: number; topTier: number; all: boolean }

/** Per service and profile: how many keys are held and the highest tier among them. */
export function accessMatrix(services: CatalogService[], people: { userId: string; isOwner: boolean; effective: string[] | null | undefined }[]) {
  return services.map(service => ({
    key: service.key,
    name: service.name,
    total: service.permissions.length,
    cells: people.map(person => {
      if (person.isOwner) return { held: service.permissions.length, total: service.permissions.length, topTier: 5, all: true } as MatrixCell;
      const set = new Set(person.effective ?? []);
      const held = service.permissions.filter(p => set.has(p.key));
      return { held: held.length, total: service.permissions.length, topTier: held.reduce((m, p) => Math.max(m, p.tierValue), 0), all: false } as MatrixCell;
    }),
  }));
}

// ───────────────────────────── devices ─────────────────────────────

export const IDLE_DAYS = 7;

export function isIdleSession(session: { active: boolean; lastSeenUtc: string }, now: number, days = IDLE_DAYS): boolean {
  const seen = toMs(session.lastSeenUtc);
  return session.active && seen != null && now - seen > days * DAY;
}

export function idleText(session: { lastSeenUtc: string }, now: number): string {
  const seen = toMs(session.lastSeenUtc);
  return seen == null ? '' : `unused ${durationShort(now - seen)}`;
}

// ───────────────────────────── palette ─────────────────────────────

export interface ConsoleCommand {
  id: string;
  group: string;
  title: string;
  icon: string;
  hint?: string;
  keywords?: string;
  danger?: boolean;
  run: () => unknown;
}

function wordScore(word: string, text: string): number {
  if (!text) return 0;
  if (text.startsWith(word)) return 30;
  if (text.includes(` ${word}`)) return 22;
  if (text.includes(word)) return 12;
  // initials: "kb" finds "KliveBot", "so ev" finds "Sign out everywhere"
  let at = 0;
  for (const ch of word) {
    at = text.indexOf(ch, at);
    if (at < 0) return 0;
    at++;
  }
  return 4;
}

/** Every word must be found in the title (or, worth less, the keywords). 0 = no match. */
export function scoreCommand(query: string, command: Pick<ConsoleCommand, 'title' | 'keywords' | 'group'>): number {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  const title = command.title.toLowerCase();
  const keywords = (command.keywords ?? '').toLowerCase();
  let score = 0;
  for (const word of words) {
    const inTitle = wordScore(word, title);
    const inKeywords = keywords ? wordScore(word, keywords) * 0.4 : 0;
    if (inTitle <= 0 && inKeywords <= 0) return 0;
    score += Math.max(inTitle, inKeywords);
  }
  return Math.max(1, score + (command.group === 'Profiles' ? 10 : 0) - title.length * 0.15);
}

// ───────────────────────────── misc ─────────────────────────────

export const TIER_NAMES = ['', 'Glance', 'Read', 'Act', 'Manage', 'Critical'];

/** Colours for a stacked chart's series, in order (a stable palette, not tied to service names). */
export const SERIES_COLOURS = ['#a78bfa', '#7dd3fc', '#4ade80', '#fbbf24', '#fb7185', '#f0abfc', '#5eead4', '#64748b'];

export function catalogTotal(catalog: PermissionCatalogPayload | null): number {
  return (catalog?.services ?? []).reduce((n, s) => n + s.permissions.length, 0);
}

export function sum(values: number[] | undefined | null): number {
  return (values ?? []).reduce((n, v) => n + (Number.isFinite(v) ? v : 0), 0);
}

/** Hour-by-hour totals of several profiles' 24 h series (oldest first). */
export function addSeries(series: number[][]): number[] {
  const length = Math.max(0, ...series.map(s => s.length));
  return Array.from({ length }, (_, i) => series.reduce((n, s) => n + (s[i] ?? 0), 0));
}
