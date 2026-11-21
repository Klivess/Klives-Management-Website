/**
 * Tripwires console: the shapes the server answers with and the rules the page applies to them.
 * Kept free of Vue so the rules can be read (and tested) on their own. Every field the server
 * added in Nov 2026 is optional: the site and the server deploy separately.
 *
 * What the live data said (21 Nov 2026), and so what this page puts first:
 *  - Half of all recorded trips came from addresses that had signed in to KM: Klives testing his own
 *    links. A trip from a known account is labelled and, by default, left out of the figures.
 *  - A third of the visitor addresses were VPN or proxy exits, so a city is shown as the exit's.
 *  - Half the trips carried Do Not Track or GPC; with "honour" on, those keep only time and link.
 *  - A capped link turned 53 people away without counting them: closed visits are counted now.
 */
import { fmtInt, fmtRelative, isNum, toMs } from '~/scripts/adminConsole';

export type Tone = 'ok' | 'warn' | 'crit' | 'info' | 'neutral';

export interface TwSettings {
  enabled: boolean;
  captureIpAddress: boolean;
  captureLocation: boolean;
  captureUserAgent: boolean;
  captureDeviceDetails: boolean;
  captureReferrer: boolean;
  captureLanguage: boolean;
  captureQueryParameters: boolean;
  honourDoNotTrack: boolean;
  ignoreBots: boolean;
  discordNotifications: boolean;
  discordIncludeSensitiveDetails: boolean;
  notificationCooldownSeconds: number;
  deduplicateWindowMinutes: number;
  retentionDays: number;
  expiresUtc: string | null;
  maxTrips: number | null;
  redirectStatusCode: number;
  /** "refuse" (the link stops working) or "redirect" (keeps forwarding, records nothing). */
  closedBehaviour: 'refuse' | 'redirect';
  discordSkipKnownProfiles: boolean;
}

export interface TwTarget {
  id: string;
  label: string;
  destinationUrl: string;
  enabled: boolean;
  sortOrder?: number;
  tripCount: number;
  createdUtc?: string;
  trackingUrl: string;
}

/** What OmniDefence knows about the address a trip came from. */
export interface TwNetwork {
  isp?: string | null;
  org?: string | null;
  asn?: string | null;
  proxy?: boolean | null;
  hosting?: boolean | null;
  mobile?: boolean | null;
  classification?: string | null;
  tags?: string | null;
  profile?: string | null;
  profileRank?: number | null;
  profileSeenUtc?: string | null;
  defenceStatus?: string | null;
}

export interface TwHour { h: string; n: number }

export interface TwSummary {
  totalTrips: number;
  uniqueTrips: number;
  tripsLast24Hours: number;
  tripsLast7Days: number;
  lastTrippedUtc: string | null;
  retainedTrips?: number;
  visitors?: number;
  privacySignalTrips?: number;
  botTrips?: number;
  daily: { date: string; count: number }[];
  hourly?: TwHour[];
  countries: { value: string; count: number }[];
  devices?: { value: string; count: number }[];
}

export interface TwTripwire {
  id: string;
  name: string;
  createdBy: string;
  createdUtc: string;
  updatedUtc: string;
  lastTrippedUtc: string | null;
  totalTrips: number;
  status: string;
  closedReason?: string | null;
  closedVisits?: number;
  lastClosedUtc?: string | null;
  previewVisits?: number;
  lastPreviewUtc?: string | null;
  lastPreviewAgent?: string | null;
  settings: TwSettings;
  targets: TwTarget[];
  summary?: TwSummary | null;
  /** Trips from addresses that signed in to KM (null: this profile may not see OmniDefence). */
  knownTrips?: number | null;
  proxyTrips?: number | null;
}

export interface TwEvent {
  id: string;
  tripwireId?: string;
  tripwireName?: string | null;
  targetId?: string;
  targetLabel: string;
  destinationUrl: string;
  trippedUtc: string;
  ipAddress: string | null;
  visitorHash: string | null;
  countryCode: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  userAgent: string | null;
  browser: string | null;
  operatingSystem: string | null;
  deviceType: string | null;
  referrer: string | null;
  language: string | null;
  queryParametersJson: string | null;
  doNotTrack: boolean;
  isBot: boolean;
  isUnique: boolean;
  discordNotified: boolean;
  notificationError: string | null;
  network?: TwNetwork | null;
}

export interface TwVisitor {
  visitorHash: string;
  trips: number;
  firstUtc: string;
  lastUtc: string;
  also: { tripwireId: string; name: string; trips: number; match: 'visitor' | 'address' }[];
  latest: TwEvent;
}

export interface TwHealth {
  startedUtc?: string;
  answers?: number;
  lastAnswerUtc?: string | null;
  answerP50Ms?: number | null;
  answerP95Ms?: number | null;
  answerMaxMs?: number | null;
  notFound?: number;
  recorded?: number;
  recordFailures?: number;
  lastRecordError?: string | null;
  lastRecordErrorUtc?: string | null;
  dropped?: number;
  queued?: number;
  closedVisits?: number;
  previews?: number;
  geoOk?: number;
  geoFailed?: number;
  lastGeoError?: string | null;
  lastGeoErrorUtc?: string | null;
  discordSent?: number;
  discordFailed?: number;
  discordSkipped?: number;
  lastDiscordSentUtc?: string | null;
  lastDiscordError?: string | null;
  lastDiscordErrorUtc?: string | null;
  discordAvailable?: boolean;
  networkIntel?: boolean;
  links?: number;
  linksLoadedUtc?: string | null;
}

export interface TwTotals {
  tripwires: number;
  active: number;
  links: number;
  trips24h: number;
  trips7d: number;
  retained?: number;
  closedVisits?: number;
  previews?: number;
  knownTrips?: number | null;
  lastTrippedUtc?: string | null;
}

export interface TwOverview {
  generatedUtc: string | null;
  tripwires: TwTripwire[];
  recent: TwEvent[];
  totals: TwTotals;
  health: TwHealth | null;
  intel: boolean;
  /** False when the server predates /tripwires/overview and the page assembled this itself. */
  native: boolean;
}

export const DEFAULT_SETTINGS = (): TwSettings => ({
  enabled: true, captureIpAddress: true, captureLocation: true, captureUserAgent: true, captureDeviceDetails: true,
  captureReferrer: true, captureLanguage: true, captureQueryParameters: true, honourDoNotTrack: true, ignoreBots: true,
  discordNotifications: false, discordIncludeSensitiveDetails: true, notificationCooldownSeconds: 0, deduplicateWindowMinutes: 60,
  retentionDays: 90, expiresUtc: null, maxTrips: null, redirectStatusCode: 302, closedBehaviour: 'refuse', discordSkipKnownProfiles: false,
});

const num = (value: unknown, fallback = 0) => (isNum(value) ? value : fallback);

export function normalizeSettings(raw: Partial<TwSettings> | null | undefined): TwSettings {
  const base = DEFAULT_SETTINGS();
  const merged = { ...base, ...(raw ?? {}) } as TwSettings;
  merged.closedBehaviour = merged.closedBehaviour === 'redirect' ? 'redirect' : 'refuse';
  merged.maxTrips = isNum(merged.maxTrips) && merged.maxTrips > 0 ? merged.maxTrips : null;
  return merged;
}

export function normalizeTripwire(raw: any): TwTripwire {
  const targets: TwTarget[] = Array.isArray(raw?.targets) ? raw.targets.map((t: any) => ({
    id: String(t.id ?? ''), label: String(t.label ?? ''), destinationUrl: String(t.destinationUrl ?? ''), enabled: t.enabled !== false,
    sortOrder: num(t.sortOrder), tripCount: num(t.tripCount), createdUtc: t.createdUtc, trackingUrl: String(t.trackingUrl ?? ''),
  })) : [];
  return {
    id: String(raw?.id ?? ''), name: String(raw?.name ?? ''), createdBy: String(raw?.createdBy ?? ''),
    createdUtc: raw?.createdUtc ?? '', updatedUtc: raw?.updatedUtc ?? '', lastTrippedUtc: raw?.lastTrippedUtc ?? null,
    totalTrips: num(raw?.totalTrips), status: String(raw?.status ?? 'Active'), closedReason: raw?.closedReason ?? null,
    closedVisits: isNum(raw?.closedVisits) ? raw.closedVisits : undefined, lastClosedUtc: raw?.lastClosedUtc ?? null,
    previewVisits: isNum(raw?.previewVisits) ? raw.previewVisits : undefined, lastPreviewUtc: raw?.lastPreviewUtc ?? null,
    lastPreviewAgent: raw?.lastPreviewAgent ?? null,
    settings: normalizeSettings(raw?.settings), targets,
    summary: raw?.summary ?? null,
    knownTrips: isNum(raw?.knownTrips) ? raw.knownTrips : null,
    proxyTrips: isNum(raw?.proxyTrips) ? raw.proxyTrips : null,
  };
}

export function normalizeOverview(raw: any): TwOverview {
  const tripwires = Array.isArray(raw?.tripwires) ? raw.tripwires.map(normalizeTripwire) : [];
  const totals = raw?.totals ?? {};
  return {
    generatedUtc: raw?.generatedUtc ?? null,
    tripwires,
    recent: Array.isArray(raw?.recent) ? raw.recent : [],
    totals: {
      tripwires: num(totals.tripwires, tripwires.length), active: num(totals.active), links: num(totals.links),
      trips24h: num(totals.trips24h), trips7d: num(totals.trips7d), retained: totals.retained, closedVisits: totals.closedVisits,
      previews: totals.previews, knownTrips: isNum(totals.knownTrips) ? totals.knownTrips : null, lastTrippedUtc: totals.lastTrippedUtc ?? null,
    },
    health: raw?.health ?? null,
    intel: raw?.intel === true,
    native: true,
  };
}

/** For a server without /tripwires/overview: the same shape from the list and a summary per tripwire. */
export function legacyOverview(list: any[], summaries: Map<string, TwSummary | null>): TwOverview {
  const tripwires = list.map(raw => ({ ...normalizeTripwire(raw), summary: summaries.get(String(raw?.id)) ?? null }));
  const sum = (pick: (s: TwSummary) => number) => tripwires.reduce((acc, t) => acc + (t.summary ? pick(t.summary) : 0), 0);
  const last = tripwires.map(t => toMs(t.lastTrippedUtc)).filter((v): v is number => v != null).sort((a, b) => b - a)[0];
  return {
    generatedUtc: null, tripwires, recent: [], health: null, intel: false, native: false,
    totals: {
      tripwires: tripwires.length, active: tripwires.filter(t => t.status === 'Active').length,
      links: tripwires.reduce((acc, t) => acc + t.targets.filter(x => x.enabled).length, 0),
      trips24h: sum(s => s.tripsLast24Hours), trips7d: sum(s => s.tripsLast7Days),
      lastTrippedUtc: last ? new Date(last).toISOString() : null,
    },
  };
}

// ───────────────────────────── time ─────────────────────────────

/** "2026-11-21" in the viewer's own time zone. */
export function localDayKey(at: number | Date): string {
  const d = typeof at === 'number' ? new Date(at) : at;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A UTC hour key "2026-11-21T04" as epoch ms. */
export function hourKeyMs(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/.exec(key);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4]) : null;
}

export interface DayBin { key: string; count: number; label: string; date: Date }

/**
 * Trips per local day for the last `days` days, newest last. The server's hourly buckets are UTC, so a
 * trip at 00:30 BST lands on the viewer's day, not the UTC one (the old chart keyed UTC days locally).
 * Falls back to the UTC daily list from an older server.
 */
export function dayBins(summary: TwSummary | null | undefined, days: number, now: number): DayBin[] {
  const counts = new Map<string, number>();
  if (summary?.hourly?.length) {
    for (const bucket of summary.hourly) {
      const at = hourKeyMs(bucket.h);
      if (at == null) continue;
      const key = localDayKey(at);
      counts.set(key, (counts.get(key) ?? 0) + num(bucket.n));
    }
  } else {
    for (const day of summary?.daily ?? []) counts.set(day.date, (counts.get(day.date) ?? 0) + num(day.count));
  }
  const bins: DayBin[] = [];
  const today = new Date(now);
  today.setHours(12, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = localDayKey(d);
    bins.push({ key, count: counts.get(key) ?? 0, date: d, label: d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) });
  }
  return bins;
}

/** Trips per hour of the viewer's day (0-23) over the summary's hourly window. */
export function hourOfDay(summary: TwSummary | null | undefined): number[] {
  const hours = new Array(24).fill(0);
  for (const bucket of summary?.hourly ?? []) {
    const at = hourKeyMs(bucket.h);
    if (at != null) hours[new Date(at).getHours()] += num(bucket.n);
  }
  return hours;
}

export function ago(value: unknown, now: number): string {
  const at = toMs(value);
  if (at == null) return 'never';
  return fmtRelative(at, now);
}

export function clock(value: unknown): string {
  const at = toMs(value);
  if (at == null) return '—';
  const d = new Date(at);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }), hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ───────────────────────────── status ─────────────────────────────

export function statusTone(status: string): Tone {
  switch (status) {
    case 'Active': return 'ok';
    case 'Limit reached': case 'Expired': case 'No active links': return 'warn';
    case 'Disabled': return 'neutral';
    default: return 'neutral';
  }
}

export function closedWords(reason: string | null | undefined): string {
  switch (reason) {
    case 'disabled': return 'paused';
    case 'link-off': return 'every link is off';
    case 'expired': return 'expired';
    case 'limit': return 'reached its trip limit';
    default: return 'closed';
  }
}

/** One line on what a closed tripwire does with a visitor now. */
export function closedOutcome(tripwire: TwTripwire): string {
  return tripwire.settings.closedBehaviour === 'redirect'
    ? 'Visitors still reach the destination; nothing about them is kept.'
    : 'Visitors see "This link is no longer available".';
}

// ───────────────────────────── trips ─────────────────────────────

export type NetworkKind = 'vpn' | 'datacenter' | 'mobile' | 'home';

export function networkKind(network: TwNetwork | null | undefined): NetworkKind | null {
  if (!network) return null;
  if (network.proxy) return 'vpn';
  if (network.hosting) return 'datacenter';
  if (network.mobile) return 'mobile';
  if (network.hosting === false) return 'home';
  return null;
}

export const NETWORK_LABEL: Record<NetworkKind, string> = { vpn: 'VPN / proxy', datacenter: 'Datacenter', mobile: 'Mobile network', home: 'Home / office' };
export const NETWORK_TONE: Record<NetworkKind, Tone> = { vpn: 'warn', datacenter: 'warn', mobile: 'info', home: 'neutral' };

export function knownProfile(event: Pick<TwEvent, 'network'>): string | null {
  return event.network?.profile?.trim() || null;
}

export function carrier(network: TwNetwork | null | undefined): string | null {
  const isp = network?.isp?.trim();
  const org = network?.org?.trim();
  if (isp && org && org.toLowerCase() !== isp.toLowerCase() && org.length < 32) return `${isp} · ${org}`;
  return isp || org || null;
}

export function place(event: Pick<TwEvent, 'city' | 'region' | 'country' | 'countryCode'>): string | null {
  const parts = [event.city, event.countryCode || event.country].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

export function fullPlace(event: Pick<TwEvent, 'city' | 'region' | 'country' | 'countryCode'>): string | null {
  const parts = [event.city, event.region, event.country || event.countryCode].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

export function device(event: Pick<TwEvent, 'deviceType' | 'operatingSystem' | 'browser' | 'userAgent'>): string | null {
  const parts = [event.operatingSystem, event.browser].filter(Boolean);
  if (parts.length) return parts.join(' · ');
  return event.deviceType || null;
}

const APP_REFERRERS: Record<string, string> = {
  'com.reddit.frontpage': 'Reddit app', 'com.discord': 'Discord app', 'org.telegram.messenger': 'Telegram app',
  'com.whatsapp': 'WhatsApp', 'com.instagram.android': 'Instagram app', 'com.twitter.android': 'X app', 'com.google.android.gm': 'Gmail app',
};

/** "reddit.com", "Reddit app", or null for a direct visit. */
export function referrerHost(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  const app = /^android-app:\/\/([^/]+)/i.exec(referrer);
  if (app) return APP_REFERRERS[app[1].toLowerCase()] ?? app[1];
  try { return new URL(referrer).hostname.replace(/^www\./, ''); } catch { return referrer.slice(0, 40); }
}

export function hostOf(url: string | null | undefined): string {
  if (!url) return '';
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

/** A short, stable label for a visitor id, and a hue for its dot. */
export function visitorShort(hash: string | null | undefined): string {
  return hash ? hash.slice(0, 4) : '';
}

export function visitorHue(hash: string | null | undefined): number {
  if (!hash) return 0;
  let h = 0;
  for (let i = 0; i < hash.length; i++) h = (h * 31 + hash.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Nothing optional was kept: Do Not Track or GPC was honoured. */
export function isBare(event: TwEvent): boolean {
  return event.doNotTrack && !event.ipAddress && !event.userAgent && !event.visitorHash;
}

export function prettyQuery(value: string | null | undefined): string | null {
  if (!value) return null;
  try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
}

export function matchesEvent(event: TwEvent, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    event.tripwireName, event.targetLabel, event.ipAddress, event.city, event.region, event.country, event.countryCode,
    event.browser, event.operatingSystem, event.deviceType, event.referrer, event.language, event.visitorHash,
    event.network?.isp, event.network?.org, event.network?.profile,
  ].filter(Boolean).join(' ').toLowerCase();
  return q.split(/\s+/).every(word => hay.includes(word));
}

/** CSV of the trips on screen; opens in a spreadsheet with no further work. */
export function eventsCsv(events: TwEvent[]): string {
  const headers = ['Time (UTC)', 'Tripwire', 'Link', 'Destination', 'IP', 'Network', 'VPN/proxy', 'KM account', 'City', 'Region', 'Country',
    'Device', 'OS', 'Browser', 'Referrer', 'Language', 'Visitor', 'Unique', 'Do Not Track', 'Bot', 'Discord'];
  const cell = (value: unknown) => {
    let text = String(value ?? '');
    // A leading = + - @ would be read as a formula by a spreadsheet.
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const rows = events.map(e => [
    e.trippedUtc, e.tripwireName ?? '', e.targetLabel, e.destinationUrl, e.ipAddress, carrier(e.network), e.network?.proxy ? 'yes' : '',
    knownProfile(e) ?? '', e.city, e.region, e.country ?? e.countryCode, e.deviceType, e.operatingSystem, e.browser, e.referrer, e.language,
    e.visitorHash, e.isUnique ? 'yes' : 'no', e.doNotTrack ? 'yes' : 'no', e.isBot ? 'yes' : 'no', e.discordNotified ? 'sent' : (e.notificationError ? 'failed' : ''),
  ].map(cell).join(','));
  return [headers.map(cell).join(','), ...rows].join('\r\n');
}

// ───────────────────────────── create ─────────────────────────────

/** A name for a tripwire made from a pasted link: the site, and the page if it says something. */
export function nameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const last = u.pathname.split('/').filter(Boolean).pop();
    const readable = last && /[a-z]{3,}/i.test(last) && last.length <= 32 ? decodeURIComponent(last).replace(/[-_]+/g, ' ') : '';
    return (readable ? `${host} ${readable}` : host).slice(0, 120);
  } catch { return 'New tripwire'; }
}

/** An absolute http(s) URL from what was pasted ("example.com/x" becomes "https://example.com/x"), or null. */
export function cleanUrl(text: string): string | null {
  let value = text.trim();
  if (!value) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    if (!/^[^\s/]+\.[^\s/]+/.test(value)) return null;
    value = `https://${value}`;
  }
  try {
    const u = new URL(value);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.username || u.password || !u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    return u.toString();
  } catch { return null; }
}

/** Settings a new tripwire starts from: another tripwire's (without its expiry and limit), or the defaults. */
export function settingsFrom(source: TwTripwire | null | undefined): TwSettings {
  const base = source ? normalizeSettings(JSON.parse(JSON.stringify(source.settings))) : DEFAULT_SETTINGS();
  return { ...base, enabled: true, expiresUtc: null, maxTrips: null };
}

/** The tripwire whose settings Klives most recently chose, to start the next one from. */
export function lastEdited(tripwires: TwTripwire[]): TwTripwire | null {
  return [...tripwires].sort((a, b) => (toMs(b.updatedUtc) ?? 0) - (toMs(a.updatedUtc) ?? 0))[0] ?? null;
}

// ───────────────────────────── attention ─────────────────────────────

export interface TwIssue {
  id: string;
  tone: Tone;
  title: string;
  detail?: string;
  tripwireId?: string;
  action?: 'settings' | 'open' | 'test';
}

/**
 * What needs Klives's eye, worst first. Every rule cites a figure the server reported; nothing is
 * inferred from a missing field (an older server simply produces fewer issues).
 */
export function computeIssues(overview: TwOverview | null, now: number): TwIssue[] {
  if (!overview) return [];
  const issues: TwIssue[] = [];
  const h = overview.health;
  const alerting = overview.tripwires.filter(t => t.settings.discordNotifications && t.status === 'Active');
  if (h) {
    if (h.discordAvailable === false && alerting.length)
      issues.push({ id: 'discord-down', tone: 'crit', title: 'KliveBot is not running', detail: `${alerting.length} tripwire${alerting.length === 1 ? '' : 's'} cannot send Discord alerts.` });
    if (num(h.recordFailures) > 0)
      issues.push({ id: 'record-failed', tone: 'crit', title: `${fmtInt(h.recordFailures)} trip${h.recordFailures === 1 ? '' : 's'} could not be saved`, detail: h.lastRecordError ?? undefined });
    if (num(h.dropped) > 0)
      issues.push({ id: 'dropped', tone: 'crit', title: `${fmtInt(h.dropped)} visit${h.dropped === 1 ? ' was' : 's were'} not recorded: the write queue was full` });
    const discordRecent = toMs(h.lastDiscordErrorUtc);
    if (num(h.discordFailed) > 0 && discordRecent && (!toMs(h.lastDiscordSentUtc) || discordRecent > (toMs(h.lastDiscordSentUtc) ?? 0)))
      issues.push({ id: 'discord-failed', tone: 'warn', title: 'The last Discord alert failed', detail: `${h.lastDiscordError ?? 'No reason given'} · ${ago(discordRecent, now)}` });
    if (num(h.geoFailed) >= 3 && num(h.geoFailed) > num(h.geoOk))
      issues.push({ id: 'geo-failed', tone: 'warn', title: 'Locations are not being looked up', detail: `${fmtInt(h.geoFailed)} of ${fmtInt(num(h.geoFailed) + num(h.geoOk))} lookups failed: ${h.lastGeoError ?? 'no reason given'}` });
    if (isNum(h.answerP95Ms) && h.answerP95Ms > 1000)
      issues.push({ id: 'slow', tone: 'warn', title: 'Visitors wait for the redirect', detail: `95% answered within ${Math.round(h.answerP95Ms)} ms (slowest ${Math.round(num(h.answerMaxMs))} ms).` });
    if (num(h.queued) > 50)
      issues.push({ id: 'queued', tone: 'warn', title: `${fmtInt(h.queued)} visits waiting to be written` });
  }
  for (const t of overview.tripwires) {
    const closedAt = toMs(t.lastClosedUtc);
    if (t.status !== 'Active' && num(t.closedVisits) > 0 && t.status !== 'Disabled')
      issues.push({
        id: `closed-${t.id}`, tone: 'warn', tripwireId: t.id, action: 'settings',
        title: `${t.name} turned away ${fmtInt(t.closedVisits)} visit${t.closedVisits === 1 ? '' : 's'}`,
        detail: `It ${closedWords(t.closedReason ?? (t.status === 'Limit reached' ? 'limit' : t.status === 'Expired' ? 'expired' : null))}${closedAt ? `; the last came ${ago(closedAt, now)}` : ''}. ${closedOutcome(t)}`,
      });
    const expires = toMs(t.settings.expiresUtc);
    if (t.status === 'Active' && expires && expires > now && expires - now < 24 * 3600_000)
      issues.push({ id: `expiring-${t.id}`, tone: 'info', tripwireId: t.id, action: 'settings', title: `${t.name} expires ${ago(expires, now)}` });
    const s = t.summary;
    const retained = num(s?.retainedTrips);
    const signalled = num(s?.privacySignalTrips);
    if (t.settings.honourDoNotTrack && retained >= 2 && signalled / retained >= 0.3)
      issues.push({
        id: `dnt-${t.id}`, tone: 'info', tripwireId: t.id, action: 'settings',
        title: `${fmtInt(signalled)} of ${fmtInt(retained)} trips on ${t.name} kept only the time`,
        detail: 'Those visitors sent Do Not Track or Global Privacy Control, which this tripwire honours.',
      });
  }
  const order: Record<Tone, number> = { crit: 0, warn: 1, info: 2, ok: 3, neutral: 4 };
  return issues.sort((a, b) => order[a.tone] - order[b.tone]);
}

export interface ConfirmRequest { title: string; text: string; confirm: string; resolve: (yes: boolean) => void }

// ───────────────────────────── palette ─────────────────────────────

export interface TwCommand {
  id: string;
  title: string;
  group: 'Tripwires' | 'Actions' | 'Links';
  hint?: string;
  keywords?: string;
  run: () => unknown;
}

/** Every word must appear somewhere; earlier and whole-word hits rank higher. */
export function commandScore(query: string, command: Pick<TwCommand, 'title' | 'keywords' | 'group'>): number {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  const title = command.title.toLowerCase();
  const keywords = (command.keywords ?? '').toLowerCase();
  let score = 0;
  for (const word of words) {
    const at = title.indexOf(word);
    const inKeywords = keywords.includes(word);
    if (at < 0 && !inKeywords) return 0;
    score += at === 0 ? 30 : at > 0 ? (title[at - 1] === ' ' ? 20 : 10) : 4;
  }
  return score + (command.group === 'Actions' ? 2 : 0) - title.length * 0.05;
}
