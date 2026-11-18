/*
 * OmniDefence console: the pure rules behind pages/omnidefence.vue.
 *
 * Nothing in here touches the network or the DOM, so every rule (what a record means, how loud a
 * figure is, what needs Klives's attention) can be read and tested on its own. The server's field
 * names are left as the server writes them (IP records in PascalCase, SQL rows in snake_case, the
 * overview in camelCase) and turned into one shape here, so components never guess.
 */

import { commandScore, fmtCompact, fmtDuration, fmtInt, fmtMs, isNum } from '~/scripts/adminConsole';

export { fmtCompact, fmtDuration, fmtInt, fmtMs, isNum };

export type Tone = 'ok' | 'warn' | 'crit' | 'info' | 'neutral';
export type ClassGroup = 'human' | 'bot' | 'hostile' | 'unknown';
export type IpStatus = 'Normal' | 'Watch' | 'Blocked' | 'Tarpit' | 'Honeypot';

export const STATUSES: IpStatus[] = ['Normal', 'Watch', 'Tarpit', 'Honeypot', 'Blocked'];
/** Statuses that stop or deceive a caller. Release (untrap) returns any of these to Normal. */
export const HOSTILE_STATUSES: IpStatus[] = ['Blocked', 'Tarpit', 'Honeypot'];

// ───────────────────────────── classes ─────────────────────────────

export interface ClassInfo {
  id: string;
  label: string;
  color: string;
  malicious: boolean;
  group: ClassGroup;
  description: string;
}

/** Mirrors /omnidefence/classes, so the map colours correctly before that call returns. */
export const DEFAULT_CLASSES: readonly ClassInfo[] = Object.freeze([
  { id: 'Owner', label: 'Owner', color: '#5fd3ff', malicious: false, group: 'human', description: 'Linked to a Klives-rank profile.' },
  { id: 'Human', label: 'Human', color: '#52ffb9', malicious: false, group: 'human', description: 'Real person in a real browser: trusted input events from the browser beacon.' },
  { id: 'LikelyHuman', label: 'Likely human', color: '#a6f5a0', malicious: false, group: 'human', description: 'Browser-consistent headers and behaviour, no beacon proof yet.' },
  { id: 'ApiClient', label: 'API client', color: '#7aa7ff', malicious: false, group: 'bot', description: 'Authenticated non-browser tool or integration.' },
  { id: 'VerifiedCrawler', label: 'Verified crawler', color: '#4f8dff', malicious: false, group: 'bot', description: 'Search/AI crawler proven by forward-confirmed rDNS or published ranges.' },
  { id: 'DeclaredBot', label: 'Declared bot', color: '#c79cff', malicious: false, group: 'bot', description: 'Self-identifying bot: link previews, uptime monitors, SEO crawlers.' },
  { id: 'ResearchScanner', label: 'Research scanner', color: '#9aa7b0', malicious: false, group: 'bot', description: 'Internet-wide survey scanner (Censys, Shodan, Shadowserver…).' },
  { id: 'Scraper', label: 'Scraper', color: '#ffc247', malicious: true, group: 'hostile', description: 'Automated harvesting: script clients, datacenter origin, machine timing.' },
  { id: 'HeadlessAutomation', label: 'Headless automation', color: '#ff8a3d', malicious: true, group: 'hostile', description: 'Browser automation posing as a human (webdriver, spoofed UA, no real input).' },
  { id: 'VulnScanner', label: 'Vuln scanner', color: '#ff6071', malicious: true, group: 'hostile', description: 'Exploit/probe traffic: sensitive paths, honeypots, 404 storms.' },
  { id: 'CredentialAttacker', label: 'Credential attacker', color: '#ff4fd8', malicious: true, group: 'hostile', description: 'Brute-force or credential-stuffing login attempts.' },
  { id: 'Unknown', label: 'Unknown', color: '#56636b', malicious: false, group: 'unknown', description: 'Not enough evidence yet.' },
]);

const DEFAULT_GROUP: Record<string, ClassGroup> = Object.fromEntries(DEFAULT_CLASSES.map(c => [c.id, c.group]));

export const GROUPS: { id: ClassGroup; label: string }[] = [
  { id: 'hostile', label: 'Hostile' },
  { id: 'human', label: 'People' },
  { id: 'bot', label: 'Bots' },
  { id: 'unknown', label: 'Unknown' },
];

/** The server's class list, keeping the page's grouping (the server does not send one). */
export function mergeClasses(server: unknown): ClassInfo[] {
  if (!Array.isArray(server) || !server.length) return DEFAULT_CLASSES.map(c => ({ ...c }));
  return server
    .filter(c => c && typeof c.id === 'string')
    .map(c => ({
      id: c.id,
      label: String(c.label ?? c.id),
      color: String(c.color ?? '#56636b'),
      malicious: !!c.malicious,
      description: String(c.description ?? ''),
      group: DEFAULT_GROUP[c.id] ?? (c.malicious ? 'hostile' : 'unknown'),
    }));
}

export function classGroup(id: string | null | undefined, classes: readonly ClassInfo[] = DEFAULT_CLASSES): ClassGroup {
  const key = id || 'Unknown';
  return classes.find(c => c.id === key)?.group ?? DEFAULT_GROUP[key] ?? 'unknown';
}

// ───────────────────────────── records ─────────────────────────────

export interface DefenceIp {
  ip: string;
  firstSeen: number;
  lastSeen: number;
  total: number;
  successful: number;
  unauth: number;
  deny: number;
  score: number;
  status: string;
  country: string | null;
  city: string | null;
  region: string | null;
  asn: string | null;
  isp: string | null;
  org: string | null;
  asName: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  profileId: string | null;
  profileName: string | null;
  profileRank: number | null;
  /** Linked to a Klives-rank profile: the server refuses to block or trap it. */
  isKlives: boolean;
  classification: string;
  classConfidence: number | null;
  classTags: string[];
  classUpdated: number | null;
  isHosting: boolean | null;
  isProxy: boolean | null;
  isMobile: boolean | null;
  reverseDns: string | null;
  timezone: string | null;
  lastBlockReason: string | null;
  escalationLevel: number;
  lastScanned: number | null;
}

function pick(row: any, ...keys: string[]): any {
  if (!row) return undefined;
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function strOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function boolOrNull(value: unknown): boolean | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = String(value).toLowerCase();
  if (text === 'true' || text === '1') return true;
  if (text === 'false' || text === '0') return false;
  return null;
}

/** One IP record from /omnidefence/ip-map, /ips or /ip (PascalCase fields), or a snake_case export row. */
export function normalizeIp(row: any): DefenceIp {
  const rank = numOrNull(pick(row, 'AssociatedProfileRank', 'associated_profile_rank', 'profileRank'));
  const tags = pick(row, 'ClassTags', 'class_tags', 'classTags');
  return {
    ip: String(pick(row, 'Ip', 'ip') ?? ''),
    firstSeen: Number(pick(row, 'FirstSeen', 'first_seen', 'firstSeen') ?? 0) || 0,
    lastSeen: Number(pick(row, 'LastSeen', 'last_seen', 'lastSeen') ?? 0) || 0,
    total: Number(pick(row, 'TotalRequests', 'total_requests', 'total') ?? 0) || 0,
    successful: Number(pick(row, 'SuccessfulRequests', 'successful_requests', 'successful') ?? 0) || 0,
    unauth: Number(pick(row, 'UnauthAttempts', 'unauth_attempts', 'unauth') ?? 0) || 0,
    deny: Number(pick(row, 'DenyCount', 'deny_count', 'deny') ?? 0) || 0,
    score: Number(pick(row, 'ThreatScore', 'threat_score', 'score') ?? 0) || 0,
    status: String(pick(row, 'Status', 'status') ?? 'Normal'),
    country: strOrNull(pick(row, 'Country', 'country')),
    city: strOrNull(pick(row, 'City', 'city')),
    region: strOrNull(pick(row, 'Region', 'region', 'RegionName', 'regionName')),
    asn: strOrNull(pick(row, 'Asn', 'asn')),
    isp: strOrNull(pick(row, 'Isp', 'isp')),
    org: strOrNull(pick(row, 'Org', 'org')),
    asName: strOrNull(pick(row, 'AsName', 'as_name', 'asName')),
    latitude: numOrNull(pick(row, 'Latitude', 'latitude', 'lat')),
    longitude: numOrNull(pick(row, 'Longitude', 'longitude', 'lon')),
    notes: strOrNull(pick(row, 'Notes', 'notes')),
    profileId: strOrNull(pick(row, 'AssociatedProfileId', 'associated_profile_id', 'profileId')),
    profileName: strOrNull(pick(row, 'AssociatedProfileName', 'associated_profile_name', 'profileName')),
    profileRank: rank,
    isKlives: (rank ?? 0) >= 5,
    classification: String(pick(row, 'Classification', 'classification', 'cls') ?? 'Unknown') || 'Unknown',
    classConfidence: numOrNull(pick(row, 'ClassConfidence', 'class_confidence', 'classConfidence', 'conf')),
    classTags: Array.isArray(tags) ? tags.map(String) : String(tags ?? '').split(',').map(t => t.trim()).filter(Boolean),
    classUpdated: numOrNull(pick(row, 'ClassUpdatedUtc', 'class_updated_utc', 'classUpdated')),
    isHosting: boolOrNull(pick(row, 'IsHosting', 'is_hosting', 'isHosting')),
    isProxy: boolOrNull(pick(row, 'IsProxy', 'is_proxy', 'isProxy')),
    isMobile: boolOrNull(pick(row, 'IsMobile', 'is_mobile', 'isMobile')),
    reverseDns: strOrNull(pick(row, 'ReverseDns', 'reverse_dns', 'reverseDns')),
    timezone: strOrNull(pick(row, 'Timezone', 'timezone')),
    lastBlockReason: strOrNull(pick(row, 'LastBlockReason', 'last_block_reason', 'lastBlockReason')),
    escalationLevel: Number(pick(row, 'EscalationLevel', 'escalation_level') ?? 0) || 0,
    lastScanned: numOrNull(pick(row, 'LastScannedUtc', 'last_scanned_utc')),
  };
}

/**
 * The compact map payload (`/omnidefence/ip-map?compact=1`): one array of field names and one row
 * per IP, instead of every IP record with every field named. A server without it answers the plain
 * array of records, which is read the old way.
 */
export function decodeIpMap(payload: unknown): { ips: DefenceIp[]; compact: boolean; asOf: number | null; full: boolean } {
  if (Array.isArray(payload)) return { ips: payload.map(normalizeIp).filter(ip => ip.ip), compact: false, asOf: null, full: true };
  const body = payload as { fields?: string[]; rows?: unknown[][]; asOf?: number; full?: boolean } | null;
  if (!body || !Array.isArray(body.fields) || !Array.isArray(body.rows)) return { ips: [], compact: false, asOf: null, full: true };
  const fields = body.fields;
  const ips = body.rows.map(row => {
    const record: Record<string, unknown> = {};
    for (let i = 0; i < fields.length; i++) record[fields[i]] = (row as unknown[])[i];
    return normalizeIp(record);
  }).filter(ip => ip.ip);
  return { ips, compact: true, asOf: numOrNull(body.asOf), full: body.full !== false };
}

export interface DefenceRequest {
  id: number | string;
  ts: number;
  ip: string;
  method: string;
  route: string;
  query: string | null;
  status: number;
  duration: number;
  profile: string | null;
  profileRank: number | null;
  reason: string | null;
  origin: string | null;
  clientPage: string | null;
  userAgent: string | null;
  matched: boolean | null;
}

export function normalizeRequest(row: any): DefenceRequest {
  return {
    id: pick(row, 'id', 'Id') ?? `${pick(row, 'utc_ts')}-${pick(row, 'ip')}-${pick(row, 'route')}`,
    ts: Number(pick(row, 'utc_ts', 'UtcTimestamp') ?? 0) || 0,
    ip: String(pick(row, 'ip', 'Ip') ?? ''),
    method: String(pick(row, 'method', 'Method') ?? ''),
    route: String(pick(row, 'route', 'Route') ?? ''),
    query: strOrNull(pick(row, 'query', 'Query')),
    status: Number(pick(row, 'status_code', 'StatusCode') ?? 0) || 0,
    duration: Number(pick(row, 'duration_ms', 'DurationMs') ?? 0) || 0,
    profile: strOrNull(pick(row, 'profile_name', 'ProfileName')) ?? strOrNull(pick(row, 'profile_id', 'ProfileId')),
    profileRank: numOrNull(pick(row, 'profile_rank', 'ProfileRank')),
    reason: strOrNull(pick(row, 'deny_reason', 'DenyReason')),
    origin: strOrNull(pick(row, 'request_origin', 'RequestOrigin')),
    clientPage: strOrNull(pick(row, 'client_page', 'ClientPage')),
    userAgent: strOrNull(pick(row, 'user_agent', 'UserAgent')),
    matched: boolOrNull(pick(row, 'matched_route', 'MatchedRoute')),
  };
}

export interface DefenceAuthEvent {
  id: number | string;
  ts: number;
  ip: string | null;
  type: string;
  profile: string | null;
  profileId: string | null;
  route: string | null;
  userAgent: string | null;
  detail: string | null;
}

export function normalizeAuth(row: any): DefenceAuthEvent {
  return {
    id: pick(row, 'id') ?? `${pick(row, 'utc_ts')}-${pick(row, 'ip')}`,
    ts: Number(pick(row, 'utc_ts') ?? 0) || 0,
    ip: strOrNull(pick(row, 'ip')),
    type: String(pick(row, 'type') ?? ''),
    profile: strOrNull(pick(row, 'profile_name')),
    profileId: strOrNull(pick(row, 'profile_id')),
    route: strOrNull(pick(row, 'route')),
    userAgent: strOrNull(pick(row, 'user_agent')),
    detail: strOrNull(pick(row, 'detail')),
  };
}

export interface DefenceProfileAction {
  id: number | string;
  ts: number;
  profile: string | null;
  category: string;
  action: string;
  ip: string | null;
  detail: string | null;
}

export function normalizeProfileAction(row: any): DefenceProfileAction {
  return {
    id: pick(row, 'id') ?? `${pick(row, 'utc_ts')}-${pick(row, 'action')}`,
    ts: Number(pick(row, 'utc_ts') ?? 0) || 0,
    profile: strOrNull(pick(row, 'profile_name')) ?? strOrNull(pick(row, 'profile_id')),
    category: String(pick(row, 'category') ?? ''),
    action: String(pick(row, 'action') ?? ''),
    ip: strOrNull(pick(row, 'ip')),
    detail: strOrNull(pick(row, 'detail_json')),
  };
}

export interface DefenceEvent {
  id: number | string;
  ts: number;
  ip: string;
  kind: string;
  actor: string | null;
  detail: string | null;
}

export function normalizeEvent(row: any): DefenceEvent {
  return {
    id: pick(row, 'id', 'Id') ?? `${pick(row, 'utc_ts', 'ts')}-${pick(row, 'ip')}-${pick(row, 'kind')}`,
    ts: Number(pick(row, 'utc_ts', 'ts', 'UtcTimestamp') ?? 0) || 0,
    ip: String(pick(row, 'ip', 'Ip') ?? ''),
    kind: String(pick(row, 'kind', 'Kind') ?? ''),
    actor: strOrNull(pick(row, 'actor_profile_name', 'actor', 'ActorProfileName')),
    detail: strOrNull(pick(row, 'detail', 'Detail')),
  };
}

/** What an ip_events kind means, in words, and how loud it is. */
export function describeEvent(event: Pick<DefenceEvent, 'kind' | 'detail' | 'actor'>): { label: string; tone: Tone; icon: string } {
  const kind = event.kind;
  if (kind === 'AutoBlocked') return { label: 'Blocked automatically', tone: 'crit', icon: 'block' };
  if (kind === 'AutoWatch') return { label: 'Put on watch automatically', tone: 'warn', icon: 'eye' };
  if (kind === 'Block') return { label: event.actor ? `Blocked by ${event.actor}` : 'Blocked', tone: 'crit', icon: 'block' };
  if (kind === 'Unblock' || kind === 'Untrap') return { label: event.actor ? `Released by ${event.actor}` : 'Released', tone: 'ok', icon: 'release' };
  if (kind === 'RegionBlock') return { label: 'Blocked by a region rule', tone: 'crit', icon: 'globe' };
  if (kind === 'RegionUnblock') return { label: 'Region rule removed', tone: 'ok', icon: 'globe' };
  if (kind === 'Scan') return { label: event.actor ? `Port scan by ${event.actor}` : 'Port scan', tone: 'info', icon: 'radar' };
  if (kind === 'GeoIP') return { label: 'Located', tone: 'neutral', icon: 'pin' };
  if (kind.startsWith('StatusChange:')) {
    const status = kind.slice('StatusChange:'.length);
    const tone: Tone = status === 'Blocked' ? 'crit' : status === 'Normal' ? 'ok' : 'warn';
    return { label: `Set to ${status}${event.actor ? ` by ${event.actor}` : ''}`, tone, icon: statusIcon(status) };
  }
  if (kind.startsWith('ClassOverride:')) return { label: `Labelled ${kind.slice('ClassOverride:'.length)}${event.actor ? ` by ${event.actor}` : ''}`, tone: 'info', icon: 'tag' };
  if (kind === 'ClassOverrideCleared') return { label: 'Back to automatic class', tone: 'info', icon: 'tag' };
  if (kind.startsWith('Classified:')) {
    const cls = kind.slice('Classified:'.length);
    const info = DEFAULT_CLASSES.find(c => c.id === cls);
    return { label: `Now ${info?.label.toLowerCase() ?? cls}`, tone: info?.malicious ? 'warn' : 'info', icon: 'fingerprint' };
  }
  if (kind.startsWith('AutoAction:')) {
    const status = kind.slice('AutoAction:'.length);
    return { label: `${statusVerb(status)} by a class rule`, tone: status === 'Blocked' ? 'crit' : 'warn', icon: 'bolt' };
  }
  return { label: kind.replace(/([a-z])([A-Z])/g, '$1 $2'), tone: 'neutral', icon: 'dot' };
}

export interface DefenceHoneypot {
  route: string;
  createdUtc: number;
  responseKind: string;
  note: string | null;
  hits: number;
  lastHit: number;
}

export function normalizeHoneypot(row: any): DefenceHoneypot {
  return {
    route: String(pick(row, 'route', 'Route') ?? ''),
    createdUtc: Number(pick(row, 'createdUtc', 'CreatedUtc') ?? 0) || 0,
    responseKind: String(pick(row, 'responseKind', 'ResponseKind') ?? 'JunkJson'),
    note: strOrNull(pick(row, 'note', 'Note')),
    hits: Number(pick(row, 'hits') ?? 0) || 0,
    lastHit: Number(pick(row, 'lastHit') ?? 0) || 0,
  };
}

export interface DefenceRegion {
  id: number;
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
  reason: string;
  createdUtc: number;
  createdBy: string | null;
}

export function normalizeRegion(row: any): DefenceRegion {
  return {
    id: Number(pick(row, 'id', 'Id') ?? 0) || 0,
    latMin: Number(pick(row, 'latMin', 'LatMin') ?? 0),
    latMax: Number(pick(row, 'latMax', 'LatMax') ?? 0),
    lonMin: Number(pick(row, 'lonMin', 'LonMin') ?? 0),
    lonMax: Number(pick(row, 'lonMax', 'LonMax') ?? 0),
    reason: String(pick(row, 'reason', 'Reason') ?? 'Region block'),
    createdUtc: Number(pick(row, 'createdUtc', 'CreatedUtc') ?? 0) || 0,
    createdBy: strOrNull(pick(row, 'createdBy', 'CreatedBy')),
  };
}

/** A port scan's result. The server writes it in PascalCase with plain port numbers. */
export function normalizeScan(row: any): { ip: string; open: number[]; probed: number[]; ms: number | null; error: string | null } {
  const open = pick(row, 'OpenPorts', 'openPorts') ?? [];
  const probed = pick(row, 'ProbedPorts', 'probedPorts') ?? [];
  const asPort = (p: any) => (typeof p === 'object' && p ? Number(p.port ?? p.Port) : Number(p));
  const duration = pick(row, 'Duration', 'duration');
  return {
    ip: String(pick(row, 'Ip', 'ip') ?? ''),
    open: Array.isArray(open) ? open.map(asPort).filter(Number.isFinite) : [],
    probed: Array.isArray(probed) ? probed.map(asPort).filter(Number.isFinite) : [],
    ms: typeof duration === 'string' ? timeSpanMs(duration) : numOrNull(duration),
    error: strOrNull(pick(row, 'Error', 'error')),
  };
}

function timeSpanMs(text: string): number | null {
  const match = /^(?:(\d+)\.)?(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(text.trim());
  if (!match) return null;
  const [, days, h, m, s, frac] = match;
  const seconds = Number(days ?? 0) * 86_400 + Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(`0.${frac ?? '0'}`);
  return seconds * 1000;
}

// ───────────────────────────── overview ─────────────────────────────

export interface ReviewItem {
  ip: string;
  classification: string | null;
  confidence: number | null;
  status: string | null;
  score: number;
  requests: number;
  unauth: number;
  lastSeen: number;
  country: string | null;
  network: string | null;
  reason: string | null;
  tags: string | null;
}

export interface HourBucket { t: number; requests: number; denied: number }

export interface DefenceOverview {
  asOfUtc?: string;
  stale?: boolean;
  ageSeconds?: number;
  requests24h?: number;
  totalRequests?: number;
  requests7d?: number;
  denied24h?: number;
  totalDenied?: number;
  authFailures24h?: number;
  unauth24h?: number;
  totalAuthEvents?: number;
  blockedIps?: number;
  watchedIps?: number;
  honeypotIps?: number;
  tarpitIps?: number;
  totalIps?: number;
  knownIps?: number;
  topAttackers?: Array<{ ip: string; score: number; status: string; unauth: number; country?: string | null }>;
  topRoutes?: Array<{ route: string; hits: number }>;
  originBreakdown?: Array<{ origin: string; hits: number }>;
  classBreakdown?: Record<string, number>;
  tagBreakdown?: Record<string, number>;
  review?: {
    hostileAnsweredCount: number;
    hostileAnswered: ReviewItem[];
    benignPenalisedCount: number;
    benignPenalised: ReviewItem[];
  };
  health?: {
    overviewBuildMs?: number;
    buildSteps?: Record<string, number>;
    auditQueue?: number;
    auditRowsDropped?: number;
    readPoolTimeouts?: number;
    fingerprintBacklog?: number;
  };
  /** Newer servers: the last week by hour, from the scan the overview already makes. */
  hourly?: unknown;
  /** Newer servers: what OmniDefence and Klives did lately (blocks, releases, overrides). */
  recentEvents?: unknown[];
  events24h?: Record<string, number>;
}

/**
 * The overview's hourly series in either of the shapes a server may send: a list of
 * `{h|t, requests, denied}` (h in hours since the epoch, t in seconds or ms) or columns
 * `{t0, step, requests[], denied[]}`. Sorted oldest first; null when absent.
 */
export function readHourly(raw: unknown): HourBucket[] | null {
  if (!raw) return null;
  const toMsStamp = (value: number) => (value < 1e6 ? value * 3_600_000 : value < 1e11 ? value * 1000 : value);
  if (Array.isArray(raw)) {
    const rows = raw
      .map((row: any) => {
        const stamp = numOrNull(row?.h ?? row?.H ?? row?.t ?? row?.hour ?? row?.ts);
        if (stamp == null) return null;
        return {
          t: toMsStamp(stamp),
          requests: Number(row.requests ?? row.Requests ?? row.n ?? 0) || 0,
          denied: Number(row.denied ?? row.Denied ?? 0) || 0,
        };
      })
      .filter((row): row is HourBucket => !!row)
      .sort((a, b) => a.t - b.t);
    return rows.length ? rows : null;
  }
  const columns = raw as { t0?: number; step?: number; requests?: number[]; denied?: number[] };
  if (Array.isArray(columns.requests) && isNum(columns.t0)) {
    const step = isNum(columns.step) ? columns.step : 3_600_000;
    const t0 = toMsStamp(columns.t0);
    const stepMs = step < 1e5 ? step * 1000 : step;
    return columns.requests.map((requests, i) => ({ t: t0 + i * stepMs, requests: Number(requests) || 0, denied: Number(columns.denied?.[i] ?? 0) || 0 }));
  }
  return null;
}

export function normalizeReviewItem(row: any): ReviewItem {
  return {
    ip: String(row?.ip ?? ''),
    classification: strOrNull(row?.classification),
    confidence: numOrNull(row?.confidence),
    status: strOrNull(row?.status),
    score: Number(row?.score ?? 0) || 0,
    requests: Number(row?.requests ?? 0) || 0,
    unauth: Number(row?.unauth ?? 0) || 0,
    lastSeen: Number(row?.lastSeen ?? 0) || 0,
    country: strOrNull(row?.country),
    network: strOrNull(row?.network),
    reason: strOrNull(row?.reason),
    tags: strOrNull(row?.tags),
  };
}

/** /omnidefence/overview/status: how the overview build (and, on newer servers, startup) is going. */
export interface DefenceStatus {
  overview?: {
    hasSnapshot?: boolean;
    generatedUtc?: string | null;
    ageSeconds?: number | null;
    stale?: boolean;
    building?: boolean;
    buildRunningSeconds?: number | null;
    step?: string | null;
    lastBuildMs?: number;
    lastError?: string | null;
  } | null;
  auditQueue?: number;
  auditRowsDropped?: number;
  readPoolTimeouts?: number;
  startup?: StartupState | null;
}

export interface StartupState {
  ready?: boolean;
  failed?: boolean;
  step?: string | null;
  startedUtc?: string | null;
  readyUtc?: string | null;
  seconds?: number | null;
  steps?: Record<string, number>;
  error?: string | null;
}

/** A 503 from a route that exists but whose service is still starting. */
export function readStarting(body: unknown): StartupState | null {
  const value = body as any;
  if (!value || typeof value !== 'object') return null;
  if (value.starting === true || value.ready === false) {
    return { ready: false, step: strOrNull(value.step ?? value.stage), seconds: numOrNull(value.seconds), failed: value.failed === true, error: strOrNull(value.error) };
  }
  return null;
}

/**
 * The step start-up is still on although the routes answer. Newer servers register the routes first
 * and load the fingerprint engine afterwards (194 s of a 318 s start on 11 Nov 2026), so `ready` is
 * true while `step` names what is still loading.
 */
export function finishingStep(startup: StartupState | null | undefined): string | null {
  return startup?.ready === true && startup.step ? startup.step : null;
}

/** The fingerprint engine is loading after the routes came up, which is not the same as stopped. */
export function engineLoading(startup: StartupState | null | undefined): boolean {
  return finishingStep(startup) === 'fingerprinting';
}

/**
 * The start's steps in the order they ran, split where the routes came up: the ones before are how
 * long OmniDefence was missing, the ones after ran while it already answered.
 */
export function startupBreakdown(startup: StartupState | null | undefined): { before: Array<[string, number]>; after: Array<[string, number]> } | null {
  const steps = startup?.steps;
  if (!steps || typeof steps !== 'object') return null;
  const before: Array<[string, number]> = [];
  const after: Array<[string, number]> = [];
  let answering = false;
  // Keys, not destructured entries: Nuxt's auto-import scanner reads a destructured for-of as one
  // declaration running on to a later closing bracket, misses the DASH constant below, and imports
  // useTerminal's DASH over it, which fails the whole page with a 500.
  for (const name of Object.keys(steps)) {
    const ms = steps[name];
    if (!isNum(ms)) continue;
    (answering ? after : before).push([name, ms]);
    if (name === 'routes') answering = true;
  }
  return { before, after };
}

// ───────────────────────────── formatting ─────────────────────────────

const DASH = '—';

/** Unix seconds → "4m ago", "3h ago", "2d ago". */
export function fmtAgo(unixSeconds: number | null | undefined, nowMs: number): string {
  if (!unixSeconds) return DASH;
  const delta = nowMs / 1000 - unixSeconds;
  if (delta < 45) return 'just now';
  return `${fmtDuration(delta)} ago`;
}

/** Unix seconds → "14:02:11" today, "Mon 14:02" this week, "3 Nov 14:02" before. */
export function fmtStamp(unixSeconds: number | null | undefined, nowMs: number): string {
  if (!unixSeconds) return DASH;
  const at = new Date(unixSeconds * 1000);
  if (Number.isNaN(at.getTime())) return DASH;
  const now = new Date(nowMs);
  const sameDay = at.toDateString() === now.toDateString();
  if (sameDay) return at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (nowMs - at.getTime() < 6 * 86_400_000) return at.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  return at.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function fmtFull(unixSeconds: number | null | undefined): string {
  if (!unixSeconds) return DASH;
  const at = new Date(unixSeconds * 1000);
  return Number.isNaN(at.getTime()) ? DASH : at.toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' });
}

export function fmtGeo(ip: Pick<DefenceIp, 'city' | 'region' | 'country'> | null | undefined): string {
  if (!ip) return DASH;
  const parts = [ip.city, ip.region && ip.region !== ip.city ? ip.region : null, ip.country].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Unlocated';
}

export function fmtNetwork(ip: Pick<DefenceIp, 'asName' | 'isp' | 'org' | 'asn'> | null | undefined): string {
  if (!ip) return DASH;
  return ip.asName || ip.org || ip.isp || ip.asn || 'Unknown network';
}

export function fmtPct(fraction: number | null | undefined): string {
  return isNum(fraction) ? `${Math.round(fraction * 100)}%` : DASH;
}

/** Country code → flag emoji, so a column of countries reads at a glance. */
export function flagOf(country: string | null | undefined): string {
  const code = String(country ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code].map(c => 0x1f1e6 + c.charCodeAt(0) - 65));
}

// ───────────────────────────── tones ─────────────────────────────

export function statusTone(status: string | null | undefined): Tone {
  switch (status) {
    case 'Blocked': return 'crit';
    case 'Tarpit': case 'Honeypot': return 'warn';
    case 'Watch': return 'info';
    default: return 'neutral';
  }
}

export function statusIcon(status: string | null | undefined): string {
  switch (status) {
    case 'Blocked': return 'block';
    case 'Tarpit': return 'hourglass';
    case 'Honeypot': return 'trap';
    case 'Watch': return 'eye';
    default: return 'check';
  }
}

export function statusVerb(status: string): string {
  switch (status) {
    case 'Blocked': return 'Block';
    case 'Tarpit': return 'Tarpit';
    case 'Honeypot': return 'Trap';
    case 'Watch': return 'Watch';
    default: return 'Release';
  }
}

export function statusAbout(status: string): string {
  switch (status) {
    case 'Blocked': return 'Refuse every request';
    case 'Tarpit': return 'Answer slowly, wasting its time';
    case 'Honeypot': return 'Serve convincing junk instead of data';
    case 'Watch': return 'Answer normally, flag it for review';
    default: return 'Treat it like anyone else';
  }
}

export function httpTone(code: number): Tone {
  if (code >= 500) return 'crit';
  if (code >= 400) return 'warn';
  if (code >= 300) return 'info';
  return 'ok';
}

/** Where a request came from: the website with a profile, the website without one, or the API directly. */
export function originLabel(origin: string | null | undefined): { label: string; tone: Tone } {
  switch (origin) {
    case 'WebsiteProfile': return { label: 'Site', tone: 'ok' };
    case 'WebsitePublicNoProfile': return { label: 'Site, public', tone: 'neutral' };
    case 'WebsiteNoProfile': return { label: 'Site, signed out', tone: 'warn' };
    case 'WebsiteInvalidProfile': return { label: 'Site, bad session', tone: 'crit' };
    case 'DirectApiProfile': return { label: 'API', tone: 'info' };
    case 'DirectApi': return { label: 'API, anonymous', tone: 'warn' };
    default: return { label: origin || 'Unknown', tone: 'neutral' };
  }
}

export const ORIGINS = ['WebsiteProfile', 'WebsitePublicNoProfile', 'WebsiteNoProfile', 'WebsiteInvalidProfile', 'DirectApiProfile', 'DirectApi'];

/** Every auth_events type seen on the live server (10 Nov 2026), most useful first. */
export const AUTH_TYPES = ['Login', 'LoginFailed', 'InvalidPassword', 'InsufficientClearance', 'UnauthRoute', 'WebsiteNoProfile', 'WebsiteInvalidProfile', 'LoginDisabled', 'Suspended'];

export function authTone(type: string): Tone {
  if (type === 'InvalidPassword' || type === 'LoginFailed' || type === 'WebsiteInvalidProfile') return 'crit';
  if (type === 'UnauthRoute' || type === 'InsufficientClearance' || type === 'LoginDisabled' || type === 'Suspended') return 'warn';
  if (type === 'Login') return 'ok';
  return 'neutral';
}

/** Threat score against the thresholds that put an IP on Watch and then block it. */
export function scoreTone(score: number, watchAt = 50, blockAt = 200): Tone {
  if (score >= blockAt) return 'crit';
  if (score >= watchAt) return 'warn';
  if (score > 0) return 'info';
  return 'neutral';
}

/** 0–1: how far the score has climbed towards the block threshold, for a bar. */
export function scoreFill(score: number, blockAt = 200): number {
  if (!isNum(score) || score <= 0) return 0;
  return Math.min(1, score / Math.max(1, blockAt));
}

// ───────────────────────────── what needs Klives ─────────────────────────────

export interface DefenceIssue {
  id: string;
  tone: Tone;
  title: string;
  detail: string;
  /** Where the page should take Klives to act on it. */
  action?: { label: string; target: 'review' | 'traffic' | 'fingerprint' | 'traps' | 'map' };
}

export interface VerdictInput {
  overview: DefenceOverview | null;
  status: DefenceStatus | null;
  startup: StartupState | null;
  /** The routes do not exist yet: the server answers "Route not found". */
  routesMissing: boolean;
  /** Seconds since this page first saw that. */
  missingForSeconds: number | null;
  fingerprint: { running?: boolean; backlog?: number; settings?: any } | null;
  hourly: HourBucket[] | null;
  nowMs: number;
}

export interface Verdict {
  tone: Tone;
  headline: string;
  detail: string;
  issues: DefenceIssue[];
}

/**
 * The one sentence at the top of the page, and the list behind it. A rule earns a place here only
 * if it names something Klives can do: look at someone, release someone, wait for a build.
 */
export function computeVerdict(input: VerdictInput): Verdict {
  const issues: DefenceIssue[] = [];
  const ov = input.overview;

  if (input.routesMissing) {
    issues.push({
      id: 'routes-missing',
      tone: 'warn',
      title: 'OmniDefence has not registered its routes yet',
      detail: `The server answers "Route not found" for every OmniDefence route${input.missingForSeconds ? `, and has for ${fmtDuration(input.missingForSeconds)}` : ''}. They appear once it has finished starting; this page keeps checking.`,
    });
  }
  const startup = input.startup;
  const startFailed = !!startup && startup.ready === false && (!!startup.failed || !!startup.error);
  if (startup && startup.ready === false) {
    issues.push({
      id: startFailed ? 'startup-failed' : 'starting',
      tone: startFailed ? 'crit' : 'info',
      title: startFailed ? 'OmniDefence failed to start' : 'OmniDefence is starting',
      detail: startFailed
        ? (startup.error || 'Its routes answer, but the store did not open.')
        : `${startup.step ? `Now: ${startup.step}` : 'Loading'}${isNum(startup.seconds) ? `, ${fmtDuration(startup.seconds)} in` : ''}. Requests are still gated; the figures appear when it is ready.`,
    });
  }
  // Answering, but start-up has not finished: on newer servers the fingerprint engine loads after
  // the routes, and the classifier reads "not running" until it has.
  const finishing = finishingStep(startup);
  const loadingEngine = finishing === 'fingerprinting';
  if (finishing) {
    const since = startup?.readyUtc ? Date.parse(startup.readyUtc) : NaN;
    const answering = Number.isFinite(since) ? Math.max(0, (input.nowMs - since) / 1000) : null;
    issues.push({
      id: 'finishing',
      tone: 'info',
      title: loadingEngine ? 'Loading the fingerprint engine' : `Finishing start-up: ${finishing}`,
      detail: `${answering != null ? `Answering for ${fmtDuration(answering)}` : 'Answering'}${loadingEngine ? '. New visitors are classified once the engine has loaded.' : '.'}`,
      action: loadingEngine ? { label: 'Fingerprinting', target: 'fingerprint' } : undefined,
    });
  }

  const review = ov?.review;
  if (review && review.hostileAnsweredCount > 0) {
    issues.push({
      id: 'hostile-answered',
      tone: 'warn',
      title: `${fmtInt(review.hostileAnsweredCount)} attacker${review.hostileAnsweredCount === 1 ? '' : 's'} still answered`,
      detail: 'Classified hostile with high confidence this week, and still getting real responses.',
      action: { label: 'Review', target: 'review' },
    });
  }
  if (review && review.benignPenalisedCount > 0) {
    issues.push({
      id: 'people-penalised',
      tone: 'warn',
      title: `${fmtInt(review.benignPenalisedCount)} ${review.benignPenalisedCount === 1 ? 'person' : 'people'} on Watch or turned away`,
      detail: 'The classifier calls them people or verified crawlers, but their status says otherwise.',
      action: { label: 'Review', target: 'review' },
    });
  }

  const health = ov?.health;
  if (health && (health.auditRowsDropped ?? 0) > 0) {
    issues.push({
      id: 'audit-dropped',
      tone: 'crit',
      title: `${fmtInt(health.auditRowsDropped)} audit rows dropped`,
      detail: 'The request log fell behind and discarded rows. The writer is stalled or the disk is slow.',
    });
  }
  const age = ov?.stale ? ov.ageSeconds ?? input.status?.overview?.ageSeconds ?? null : null;
  if (isNum(age) && age >= 600) {
    const building = input.status?.overview;
    issues.push({
      id: 'overview-stale',
      tone: age >= 3600 ? 'warn' : 'info',
      title: `Figures are ${fmtDuration(age)} old`,
      detail: building?.building
        ? `A new overview has been building for ${fmtDuration(building.buildRunningSeconds ?? 0)}${building.step ? `, now on "${building.step}"` : ''}.`
        : 'The overview has not been rebuilt since.',
    });
  }

  const fp = input.fingerprint;
  if (fp && fp.running === false && fp.settings?.enabled !== false && !loadingEngine) {
    issues.push({ id: 'fp-stopped', tone: 'warn', title: 'Fingerprinting is not running', detail: 'New visitors are not being classified.', action: { label: 'Fingerprinting', target: 'fingerprint' } });
  } else if (fp && (fp.backlog ?? 0) > 5000) {
    issues.push({ id: 'fp-backlog', tone: 'info', title: `${fmtInt(fp.backlog)} signals waiting to be classified`, detail: 'The classifier is behind live traffic.', action: { label: 'Fingerprinting', target: 'fingerprint' } });
  }

  const surge = deniedSurge(input.hourly, input.nowMs);
  if (surge) {
    issues.push({
      id: 'denied-surge',
      tone: surge.ratio >= 8 ? 'crit' : 'warn',
      title: `${fmtInt(surge.lastHour)} denied in the last hour`,
      detail: `About ${surge.ratio >= 10 ? Math.round(surge.ratio) : surge.ratio.toFixed(1)}× the usual ${fmtInt(surge.typical)} an hour this week.`,
      action: { label: 'Denied traffic', target: 'traffic' },
    });
  }

  const order: Record<Tone, number> = { crit: 0, warn: 1, info: 2, neutral: 3, ok: 4 };
  issues.sort((a, b) => order[a.tone] - order[b.tone]);

  if (input.routesMissing) return { tone: 'warn', headline: 'Waiting for OmniDefence', detail: issues[0].detail, issues };
  if (startup && startup.ready === false) return { tone: startFailed ? 'crit' : 'info', headline: startFailed ? 'OmniDefence failed to start' : 'OmniDefence is starting', detail: issues[0].detail, issues };
  if (!ov) return { tone: 'neutral', headline: 'Reading the defence overview…', detail: '', issues };

  const worst = issues[0]?.tone;
  const blocked = ov.blockedIps ?? 0;
  const denied = ov.denied24h ?? 0;
  const tail = `${fmtCompact(ov.requests24h ?? 0)} requests in 24 h, ${fmtCompact(denied)} denied, ${fmtInt(blocked)} address${blocked === 1 ? '' : 'es'} blocked.`;
  if (!issues.length) return { tone: 'ok', headline: 'Holding. Nothing needs you', detail: tail, issues };
  if (worst === 'crit') return { tone: 'crit', headline: issues[0].title, detail: tail, issues };
  if (worst === 'warn') return { tone: 'warn', headline: issues.length === 1 ? issues[0].title : `${issues.length} things to look at`, detail: tail, issues };
  if (finishing) return { tone: 'info', headline: issues.find(issue => issue.id === 'finishing')!.title, detail: tail, issues };
  return { tone: 'ok', headline: 'Holding', detail: tail, issues };
}

/** The last full hour of denials against the week's typical hour, when it is well above it. */
export function deniedSurge(hourly: HourBucket[] | null, nowMs: number): { lastHour: number; typical: number; ratio: number } | null {
  if (!hourly || hourly.length < 24) return null;
  const hourMs = 3_600_000;
  const current = Math.floor(nowMs / hourMs) * hourMs;
  // The hour in progress is partial: judge the last complete one, unless the partial one is already loud.
  const last = hourly.find(b => b.t === current - hourMs) ?? hourly[hourly.length - 1];
  const partial = hourly.find(b => b.t === current);
  const lastHour = Math.max(last?.denied ?? 0, partial?.denied ?? 0);
  const history = hourly.filter(b => b.t < current - hourMs).map(b => b.denied).sort((a, b) => a - b);
  if (history.length < 12) return null;
  const typical = history[Math.floor(history.length / 2)];
  const floor = Math.max(typical, 10);
  if (lastHour < 50 || lastHour < floor * 3) return null;
  return { lastHour, typical, ratio: lastHour / Math.max(1, typical) };
}

// ───────────────────────────── addresses ─────────────────────────────

export type AddressSort = 'recent' | 'score' | 'requests' | 'denied' | 'first';

export interface AddressFilter {
  text: string;
  groups: ClassGroup[];
  statuses: string[];
  /** Seen within this many hours; 0 for any time. */
  seenWithinHours: number;
  profiled: 'any' | 'yes' | 'no';
  tag: string;
}

export const EMPTY_FILTER: AddressFilter = { text: '', groups: [], statuses: [], seenWithinHours: 0, profiled: 'any', tag: '' };

/** Free text matches the address, place, network, profile, note or a tag, case-insensitively. */
export function matchesText(ip: DefenceIp, text: string): boolean {
  const needle = text.trim().toLowerCase();
  if (!needle) return true;
  const fields = [ip.ip, ip.country, ip.city, ip.region, ip.asName, ip.org, ip.isp, ip.asn, ip.profileName, ip.notes, ip.reverseDns, ip.classification, ...ip.classTags];
  return needle.split(/\s+/).every(word => fields.some(field => field && field.toLowerCase().includes(word)));
}

export function filterAddresses(ips: DefenceIp[], filter: AddressFilter, classes: readonly ClassInfo[], nowMs: number): DefenceIp[] {
  const since = filter.seenWithinHours > 0 ? nowMs / 1000 - filter.seenWithinHours * 3600 : 0;
  const groups = new Set(filter.groups);
  const statuses = new Set(filter.statuses);
  const tag = filter.tag;
  return ips.filter(ip => {
    if (since && ip.lastSeen < since) return false;
    if (groups.size && !groups.has(classGroup(ip.classification, classes))) return false;
    if (statuses.size && !statuses.has(ip.status)) return false;
    if (filter.profiled === 'yes' && !ip.profileName && !ip.profileId) return false;
    if (filter.profiled === 'no' && (ip.profileName || ip.profileId)) return false;
    if (tag && !ip.classTags.some(t => t === tag || t.startsWith(`${tag}:`))) return false;
    return matchesText(ip, filter.text);
  });
}

export function sortAddresses(ips: DefenceIp[], sort: AddressSort): DefenceIp[] {
  const by: Record<AddressSort, (a: DefenceIp, b: DefenceIp) => number> = {
    recent: (a, b) => b.lastSeen - a.lastSeen,
    score: (a, b) => b.score - a.score || b.lastSeen - a.lastSeen,
    requests: (a, b) => b.total - a.total,
    denied: (a, b) => b.deny - a.deny || b.unauth - a.unauth,
    first: (a, b) => b.firstSeen - a.firstSeen,
  };
  return [...ips].sort(by[sort]);
}

/** Tags across all addresses, grouped by their prefix ("Datacenter:AWS" counts as Datacenter). */
export function tagCounts(ips: DefenceIp[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const ip of ips) {
    const seen = new Set<string>();
    for (const tag of ip.classTags) {
      const key = tag.split(':')[0];
      if (seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }));
}

export interface GroupCounts { hostile: number; human: number; bot: number; unknown: number }

export function groupCounts(ips: DefenceIp[], classes: readonly ClassInfo[]): GroupCounts {
  const counts: GroupCounts = { hostile: 0, human: 0, bot: 0, unknown: 0 };
  for (const ip of ips) counts[classGroup(ip.classification, classes)]++;
  return counts;
}

/** What the last day looked like from the IP records alone: who came, who was new, who was hostile. */
export function dayActivity(ips: DefenceIp[], classes: readonly ClassInfo[], nowMs: number) {
  const since = nowMs / 1000 - 86_400;
  let seen = 0, fresh = 0, hostile = 0, hostileFresh = 0;
  for (const ip of ips) {
    if (ip.lastSeen < since) continue;
    seen++;
    const isNew = ip.firstSeen >= since;
    if (isNew) fresh++;
    if (classGroup(ip.classification, classes) === 'hostile') {
      hostile++;
      if (isNew) hostileFresh++;
    }
  }
  return { seen, fresh, hostile, hostileFresh };
}

export function looksLikeIp(text: string): boolean {
  const value = text.trim();
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(value) || (/^[0-9a-f:]+$/i.test(value) && value.includes(':') && value.length >= 3);
}

// ───────────────────────────── the map ─────────────────────────────

const COUNTRY_CENTERS: Record<string, [number, number]> = {
  AF: [33.94, 67.71], AL: [41.15, 20.17], DZ: [28.03, 1.66], AR: [-38.42, -63.62], AM: [40.07, 45.04], AU: [-25.27, 133.78], AT: [47.52, 14.55], AZ: [40.14, 47.58],
  BD: [23.68, 90.36], BY: [53.71, 27.95], BE: [50.5, 4.47], BO: [-16.29, -63.59], BA: [43.92, 17.68], BR: [-14.23, -51.93], BG: [42.73, 25.49], KH: [12.57, 104.99],
  CA: [56.13, -106.35], CL: [-35.68, -71.54], CN: [35.86, 104.2], CO: [4.57, -74.3], CR: [9.75, -83.75], HR: [45.1, 15.2], CY: [35.13, 33.43], CZ: [49.82, 15.47],
  DK: [56.26, 9.5], DO: [18.74, -70.16], EC: [-1.83, -78.18], EG: [26.82, 30.8], EE: [58.6, 25.01], FI: [61.92, 25.75], FR: [46.23, 2.21], GE: [42.32, 43.36],
  DE: [51.17, 10.45], GH: [7.95, -1.02], GR: [39.07, 21.82], GT: [15.78, -90.23], HK: [22.32, 114.17], HU: [47.16, 19.5], IS: [64.96, -19.02], IN: [20.59, 78.96],
  ID: [-0.79, 113.92], IR: [32.43, 53.69], IQ: [33.22, 43.68], IE: [53.41, -8.24], IL: [31.05, 34.85], IT: [41.87, 12.57], JP: [36.2, 138.25], JO: [30.59, 36.24],
  KZ: [48.02, 66.92], KE: [-0.02, 37.91], KR: [35.91, 127.77], KW: [29.31, 47.48], LV: [56.88, 24.6], LB: [33.85, 35.86], LT: [55.17, 23.88], LU: [49.82, 6.13],
  MY: [4.21, 101.98], MX: [23.63, -102.55], MD: [47.41, 28.37], MA: [31.79, -7.09], NL: [52.13, 5.29], NZ: [-40.9, 174.89], NG: [9.08, 8.68], NO: [60.47, 8.47],
  PK: [30.38, 69.35], PA: [8.54, -80.78], PE: [-9.19, -75.02], PH: [12.88, 121.77], PL: [51.92, 19.15], PT: [39.4, -8.22], QA: [25.35, 51.18], RO: [45.94, 24.97],
  RU: [61.52, 105.32], SA: [23.89, 45.08], RS: [44.02, 21.01], SG: [1.35, 103.82], SK: [48.67, 19.7], SI: [46.15, 14.99], ZA: [-30.56, 22.94], ES: [40.46, -3.75],
  LK: [7.87, 80.77], SE: [60.13, 18.64], CH: [46.82, 8.23], TW: [23.7, 120.96], TH: [15.87, 100.99], TN: [33.89, 9.54], TR: [38.96, 35.24], UA: [48.38, 31.17],
  AE: [23.42, 53.85], GB: [55.38, -3.44], US: [39.83, -98.58], UY: [-32.52, -55.77], UZ: [41.38, 64.59], VE: [6.42, -66.59], VN: [14.06, 108.28],
};

const COUNTRY_ALIASES: Record<string, string> = {
  'UNITED STATES': 'US', 'UNITED STATES OF AMERICA': 'US', 'UNITED KINGDOM': 'GB', 'GREAT BRITAIN': 'GB', 'ENGLAND': 'GB',
  'RUSSIA': 'RU', 'SOUTH KOREA': 'KR', 'KOREA': 'KR', 'VIETNAM': 'VN', 'IRAN': 'IR', 'UNITED ARAB EMIRATES': 'AE', 'UAE': 'AE',
  'NETHERLANDS': 'NL', 'CZECHIA': 'CZ', 'TAIWAN': 'TW', 'HONG KONG': 'HK',
};

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Where to draw an IP: its own coordinates; failing that its country's centre, spread a little so a
 * country's IPs do not stack on one pixel (approximate); failing that, nowhere.
 */
export function mapCoordinates(ip: Pick<DefenceIp, 'ip' | 'latitude' | 'longitude' | 'country'>): { lat: number; lon: number; approximate: boolean } | null {
  if (ip.latitude !== null && ip.longitude !== null && (ip.latitude !== 0 || ip.longitude !== 0)) {
    return { lat: ip.latitude, lon: ip.longitude, approximate: false };
  }
  const raw = String(ip.country ?? '').trim().toUpperCase();
  const code = raw.length === 2 && COUNTRY_CENTERS[raw] ? raw : COUNTRY_ALIASES[raw];
  const center = code ? COUNTRY_CENTERS[code] : null;
  if (!center) return null;
  const hash = hashString(`${ip.ip}:jitter`);
  const angle = ((hash % 360) * Math.PI) / 180;
  const radius = (((hash >>> 8) % 100) / 100) * 2.8;
  return {
    lat: Math.max(-85, Math.min(85, center[0] + Math.sin(angle) * radius * 0.7)),
    lon: Math.max(-180, Math.min(180, center[1] + Math.cos(angle) * radius)),
    approximate: true,
  };
}

export const STATUS_COLORS: Record<string, string> = {
  Blocked: '#ff5d6c',
  Tarpit: '#f0a23a',
  Honeypot: '#c79cff',
  Watch: '#ffd166',
  Normal: '#5fd3ff',
};

// ───────────────────────────── commands ─────────────────────────────

export interface DefenceCommand {
  id: string;
  group: string;
  title: string;
  icon: string;
  keywords?: string;
  hint?: string;
  danger?: boolean;
  run: () => unknown;
}

/** Destinations and actions rank above individual addresses on an equal match. */
export function scoreCommand(query: string, command: DefenceCommand): number {
  return commandScore(query, { title: command.title, keywords: command.keywords, group: command.group === 'Addresses' ? 'Services' : 'Actions' });
}

/** Block reasons offered as one-click chips. The last free-text one is remembered by the page. */
export const BLOCK_REASONS = ['Exploit probes', 'Credential stuffing', 'Scraping', 'Headless automation', 'Abuse'];

/** The query string for a list route: empty and false values are left out. */
export function buildQuery(values: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === '' || value === null || value === undefined || value === false) continue;
    params.append(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** Pretty-prints a body that is JSON; anything else comes back as it was. */
export function prettyBody(body: string | null | undefined): string {
  if (body == null) return '';
  const text = String(body);
  const trimmed = text.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try { return JSON.stringify(JSON.parse(trimmed), null, 2); } catch { /* not JSON after all */ }
  }
  return text;
}

/** Sparkline points from hourly buckets: the last `hours`, oldest first, padded with zeros. */
export function hourlySeries(hourly: HourBucket[] | null, pickValue: (b: HourBucket) => number, hours: number, nowMs: number): { t: number; v: number }[] {
  if (!hourly?.length) return [];
  const hourMs = 3_600_000;
  const end = Math.floor(nowMs / hourMs) * hourMs;
  const byHour = new Map(hourly.map(b => [b.t, b]));
  const out: { t: number; v: number }[] = [];
  for (let t = end - (hours - 1) * hourMs; t <= end; t += hourMs) {
    const bucket = byHour.get(t);
    out.push({ t, v: bucket ? pickValue(bucket) : 0 });
  }
  return out;
}
