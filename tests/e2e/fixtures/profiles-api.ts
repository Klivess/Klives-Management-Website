import type { BrowserContext, Page, Route, WebSocketRoute } from '@playwright/test';
import { catalogPayload, mePayload, permissionsForRank, PERMISSIONS, type FixtureMeOptions } from './permissions';

/*
 * A small stand-in for the profile/access API (and the KliveCloud sharing routes) so the access
 * layer and the profile console can be exercised without a server. Anything not handled here
 * answers 404, which the site treats as "not available".
 */

export const testOrigin = new URL(
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '4173'}`,
).origin;

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
  'access-control-allow-headers': 'Authorization, Content-Type, X-Klive-Client, X-Klive-Page',
  'access-control-expose-headers': '*',
};

const NOW = Date.parse('2026-10-09T12:00:00Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
/** Relative to the real clock: presence, last seen and devices are judged against "now". */
const ago = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export interface FixtureProfile {
  userId: string;
  name: string;
  rankValue: number;
  isOwner?: boolean;
  canLogin?: boolean;
  readOnly?: boolean;
  suspended?: boolean;
  suspensionReason?: string | null;
  presence?: 'online' | 'idle' | 'offline';
  currentTitle?: string;
  currentPath?: string;
  grants?: string[];
  temporary?: string[];
  sessions?: number;
  requests24h?: number;
  denied24h?: number;
  /** How many of their devices have been unused for 7+ days. */
  idleSessions?: number;
  /** Requests signed with the password (no session) in 7 days. */
  password7d?: number;
  allowPasswordApiAccess?: boolean;
  /** Direct grants unused for 30 days (the review's list). */
  unused?: string[];
  /** Days since last seen, when offline (default 1); null = never seen. */
  seenDaysAgo?: number | null;
}

export const DEFAULT_PROFILES: FixtureProfile[] = [
  { userId: 'klives', name: 'Klives', rankValue: 5, isOwner: true, presence: 'online', currentTitle: 'KM: Profiles', currentPath: '/administration/profiles', sessions: 2, requests24h: 1840 },
  { userId: 'sam', name: 'Sam Carter', rankValue: 4, presence: 'online', currentTitle: 'KM: Klivecloud', currentPath: '/klivecloud', grants: permissionsForRank(4).filter(k => !k.startsWith('profiles.')), temporary: ['omnitrader.backtests.run'], sessions: 2, requests24h: 412, denied24h: 3 },
  { userId: 'alex', name: 'Alex Moreno', rankValue: 3, presence: 'idle', currentTitle: 'KM: Omnitrader', currentPath: '/omnitrader', grants: permissionsForRank(3).filter(k => !k.startsWith('profiles.')), sessions: 3, idleSessions: 2, requests24h: 96, password7d: 14, allowPasswordApiAccess: true },
  { userId: 'jo', name: 'Jo Lindqvist', rankValue: 1, presence: 'offline', suspended: true, suspensionReason: 'Pausing access while we review the shared folders', grants: permissionsForRank(1), sessions: 1, requests24h: 12, denied24h: 7 },
  { userId: 'max', name: 'Max Byrne', rankValue: 2, presence: 'offline', readOnly: true, canLogin: false, grants: permissionsForRank(2).slice(0, 9), sessions: 0, requests24h: 0, seenDaysAgo: null },
  { userId: 'riv', name: 'Riv Okafor', rankValue: 1, presence: 'offline', grants: permissionsForRank(1).slice(0, 6), sessions: 0, requests24h: 0, seenDaysAgo: 45 },
];

function grantRows(p: FixtureProfile) {
  return (p.grants ?? []).map(key => {
    const def = PERMISSIONS.find(d => d.key === key);
    return {
      key,
      title: def?.title ?? key,
      service: def?.service ?? null,
      tier: def?.tier ?? null,
      known: !!def,
      active: true,
      grantedUtc: iso(30 * DAY),
      grantedById: 'migration',
      grantedByName: 'Rank conversion',
      expiresUtc: p.temporary?.includes(key) ? ago(-2 * DAY) : null,
      note: null,
    };
  });
}

const RANKS = ['None', 'Guest', 'Manager', 'Associate', 'Admin', 'Klives'];

export function profileRow(p: FixtureProfile, viewerId: string, detailed: boolean) {
  const state = p.presence ?? 'offline';
  const row: Record<string, unknown> = {
    userId: p.userId,
    name: p.name,
    rank: RANKS[p.rankValue],
    rankValue: p.rankValue,
    isOwner: !!p.isOwner,
    canLogin: p.canLogin ?? true,
    readOnly: !!p.readOnly,
    suspended: !!p.suspended,
    suspendedUntilUtc: p.suspended ? new Date(Date.now() + 3 * HOUR + 12 * MIN).toISOString() : null,
    suspensionReason: p.suspended ? p.suspensionReason ?? null : null,
    discordId: null,
    createdUtc: iso(120 * DAY),
    createdById: 'klives',
    lastLoginUtc: ago(5 * HOUR),
    lastSeenUtc: state !== 'offline' ? new Date().toISOString() : p.seenDaysAgo === null ? null : ago((p.seenDaysAgo ?? 1) * DAY + 2 * HOUR),
    allowPasswordApiAccess: !!p.allowPasswordApiAccess,
    accessVersion: 4,
    grantCount: p.isOwner ? PERMISSIONS.length : (p.grants ?? []).length,
    temporaryGrantCount: p.temporary?.length ?? 0,
    sessions: p.sessions ?? 0,
    requests24h: p.requests24h ?? 0,
    denied24h: p.denied24h ?? 0,
    presence: {
      state,
      connections: state === 'offline' ? 0 : 1,
      currentPath: state === 'offline' ? null : p.currentPath ?? '/dashboard',
      currentTitle: state === 'offline' ? null : p.currentTitle ?? 'KM: Dashboard',
      onPageSinceUtc: state === 'offline' ? null : new Date(Date.now() - 4 * MIN).toISOString(),
      lastHeartbeatUtc: state === 'offline' ? null : new Date().toISOString(),
      ...(detailed ? {
        tabs: state === 'offline' ? [] : [{
          connectionId: 'c1', sessionId: 's1', path: p.currentPath ?? '/dashboard', title: p.currentTitle ?? 'KM: Dashboard',
          visible: state === 'online', ip: '81.2.69.160', device: 'Chrome on Windows', connectedUtc: iso(40 * MIN), lastHeartbeatUtc: new Date().toISOString(),
        }],
      } : {}),
    },
    manageable: viewerId !== p.userId && !p.isOwner,
    isYou: viewerId === p.userId,
  };
  if (detailed) {
    row.grants = grantRows(p);
    row.effective = p.isOwner ? PERMISSIONS.map(d => d.key) : p.grants ?? [];
  }
  return row;
}

function summary(range: string) {
  const bucketMs = range === '30d' ? DAY : HOUR;
  const count = range === '30d' ? 30 : range === '7d' ? 7 * 24 : 24;
  const services = ['KliveCloud', 'OmniTrader', 'System', 'Stratum'];
  const end = Math.floor(Date.now() / bucketMs) * bucketMs;
  const buckets = Array.from({ length: count }, (_, i) => {
    const t = end - (count - 1 - i) * bucketMs;
    const wave = Math.max(0, Math.round(18 * Math.sin(i / 3) + 14));
    return { t, byService: { KliveCloud: wave, OmniTrader: Math.round(wave * 0.6), System: 4 + (i % 3), Stratum: i % 5 === 0 ? 6 : 0 }, denied: i % 7 === 0 ? 1 : 0 };
  });
  const requests = buckets.reduce((n, b) => n + Object.values(b.byService).reduce((a, v) => a + v, 0), 0);
  return {
    fromMs: buckets[0].t, toMs: Date.now(), bucketMs, services, buckets, requests, denied: 4, errors: 1, distinctRoutes: 23,
    pageViews: 41, activeDays: range === '24h' ? 1 : 6, source: 'rollup', passwordRequests: 3,
    topRoutes: [{ key: 'GET /KliveCloud/Browse', count: 180, denied: 0, lastMs: 0 }, { key: 'GET /api/omnitrader/status', count: 140, denied: 0, lastMs: 0 }, { key: 'POST /api/omnitrader/orders/place', count: 3, denied: 0, lastMs: 0 }],
    topPermissions: [
      { key: 'klivecloud.files.browse', count: 220, denied: 0, lastMs: Date.now() - 5 * MIN },
      { key: 'omnitrader.status.view', count: 140, denied: 0, lastMs: Date.now() - 30 * MIN },
      { key: 'klivecloud.files.download', count: 61, denied: 0, lastMs: Date.now() - 2 * HOUR },
      { key: 'omnitrader.orders.place', count: 0, denied: 3, lastMs: Date.now() - 3 * HOUR },
    ],
    topPages: [
      { key: '/klivecloud', count: 12, denied: 38 * MIN, lastMs: Date.now() - 5 * MIN },
      { key: '/omnitrader', count: 9, denied: 22 * MIN, lastMs: Date.now() - HOUR },
      { key: '/dashboard', count: 14, denied: 9 * MIN, lastMs: Date.now() - 2 * HOUR },
    ],
    ips: [{ ip: '81.2.69.160', count: 380, firstMs: Date.now() - 6 * DAY, lastMs: Date.now() - 5 * MIN }, { ip: '86.12.4.201', count: 32, firstMs: Date.now() - 2 * DAY, lastMs: Date.now() - 20 * HOUR }],
    recentDenials: [],
    logins: [],
  };
}

function timeline() {
  const t = Date.now();
  return [
    { type: 'request', tsMs: t - 2 * MIN, method: 'GET', route: '/KliveCloud/Browse', permKey: 'klivecloud.files.browse', service: 'KliveCloud', status: 200, durationMs: 41, ip: '81.2.69.160', page: '/klivecloud', viaBatch: false },
    { type: 'request', tsMs: t - 3 * MIN, method: 'POST', route: '/api/omnitrader/orders/place', permKey: 'omnitrader.orders.place', service: 'OmniTrader', status: 403, durationMs: 3, ip: '81.2.69.160', page: '/omnitrader/execution', denyReason: 'MissingPermission', viaBatch: false },
    { type: 'page', tsMs: t - 5 * MIN, page: '/klivecloud', title: 'KM: Klivecloud', dwellMs: 4 * MIN },
    { type: 'event', tsMs: t - 3 * HOUR, kind: 'access.permissions', actorId: 'klives', actorName: 'Klives', detailJson: JSON.stringify({ added: ['omnitrader.backtests.run'], removed: [], changed: [] }) },
    { type: 'event', tsMs: t - 5 * HOUR, kind: 'login', actorId: null, actorName: null, ip: '81.2.69.160', detailJson: JSON.stringify({ device: 'Chrome on Windows' }) },
  ];
}

function sessions(p: FixtureProfile) {
  if (!p.sessions) return [];
  return Array.from({ length: p.sessions }, (_, i) => ({
    sessionId: `session-${p.userId}-${i}`, kind: 'Browser', label: i === 0 ? 'Chrome on Windows' : 'Safari on iPhone',
    userAgent: i === 0 ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0' : 'Mozilla/5.0 (iPhone) Safari/18.1',
    ip: i === 0 ? '81.2.69.160' : '86.12.4.201', createdUtc: ago((i + 1) * 3 * DAY),
    // The last idleSessions devices have gone unused for 12+ days.
    lastSeenUtc: i >= (p.sessions ?? 0) - (p.idleSessions ?? 0) ? ago((12 + i) * DAY) : ago(i * 7 * HOUR + MIN),
    expiresUtc: ago(-27 * DAY), active: true, revokedUtc: null, revokeReason: null, current: false,
    online: i === 0 && p.presence !== 'offline',
    tabs: i === 0 && p.presence !== 'offline' ? [{ path: p.currentPath ?? '/dashboard', title: p.currentTitle ?? 'KM: Dashboard', visible: true, lastHeartbeatUtc: new Date().toISOString() }] : [],
  }));
}

export interface ProfilesMockState {
  me: ReturnType<typeof mePayload>;
  profiles: FixtureProfile[];
  requested: string[];
  mutations: { method: string; path: string; body: any }[];
  /** Answers by path (exact) that win over the built-in ones: { status, body }. */
  overrides: Record<string, { status: number; body: unknown; headers?: Record<string, string> }>;
  sessionWatch: WebSocketRoute | null;
}

export async function installProfilesApiMock(page: Page, options: { me?: FixtureMeOptions; profiles?: FixtureProfile[] } = {}): Promise<ProfilesMockState> {
  const state: ProfilesMockState = {
    me: mePayload(options.me ?? { isOwner: true, userId: 'klives', name: 'Klives' }),
    profiles: structuredClone(options.profiles ?? DEFAULT_PROFILES),
    requested: [],
    mutations: [],
    overrides: {},
    sessionWatch: null,
  };

  const json = (route: Route, body: unknown, status = 200, headers: Record<string, string> = {}) =>
    route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8', ...headers }, body: JSON.stringify(body) });

  // Later registrations win: the catch-all first, the specific channels after it.
  await page.routeWebSocket(/klive\.dev/, ws => { ws.close({ code: 1000 }); });
  await page.routeWebSocket(/\/KMProfiles\/SessionWatch/, ws => {
    state.sessionWatch = ws;
    ws.send(JSON.stringify({ type: 'session-state', state: 'SessionActive' }));
    ws.send(JSON.stringify({ type: 'hello', accessVersion: state.me.accessVersion, connectionId: 'conn-e2e' }));
    ws.onMessage(() => { /* presence frames */ });
  });
  await page.routeWebSocket(/\/KMProfiles\/admin\/live/, ws => {
    const url = new URL(ws.url());
    const p = state.profiles.find(x => x.userId === url.searchParams.get('profileId'));
    if (!p) return;
    ws.send(JSON.stringify({ type: 'snapshot', presence: (profileRow(p, state.me.userId, true) as any).presence, sessions: sessions(p) }));
  });

  await page.route('https://klive.dev/**', async route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const url = new URL(request.url());
    let body: any = null;
    if (request.method() !== 'GET') {
      try { body = JSON.parse(request.postData() ?? 'null'); } catch { body = request.postData(); }
    }
    if (url.pathname === '/batch' && Array.isArray(body)) {
      // The site's /batch: each item answered as its own GET would be.
      const items = [];
      for (const item of body as { path: string }[]) {
        const inner = new URL(item.path, 'https://klive.dev');
        state.requested.push(inner.pathname + inner.search);
        const answer = respond(inner, null);
        items.push({ path: item.path, status: answer.status, ok: answer.status < 400, contentType: 'application/json', body: answer.body });
      }
      return json(route, items);
    }
    state.requested.push(url.pathname + url.search);
    if (request.method() !== 'GET') state.mutations.push({ method: request.method(), path: url.pathname + url.search, body });
    const override = state.overrides[url.pathname];
    if (override) return json(route, override.body, override.status, override.headers);
    if (url.pathname === '/ping') return route.fulfill({ status: 200, headers: cors, body: 'pong' });
    const answer = respond(url, body);
    return json(route, answer.body, answer.status);
  });

  /** One route's answer, for a direct request or an item of /batch. */
  function respond(url: URL, body: any): { status: number; body: unknown } {
    const path = url.pathname;
    const override = state.overrides[path];
    if (override) return { status: override.status, body: override.body };
    const answer = (value: unknown, status = 200) => ({ status, body: value });
    const id = url.searchParams.get('id') ?? body?.id;
    const target = state.profiles.find(p => p.userId === id);

    switch (path) {
      case '/KMProfiles/Login': return answer({ token: 'kms_e2e', sessionId: 'session-e2e', expiresUtc: '2026-11-08T00:00:00Z', me: state.me });
      case '/KMProfiles/Logout': return answer({ signedOut: true });
      case '/KMProfiles/me': return answer(state.me);
      case '/KMProfiles/permissions/catalog': return answer(catalogPayload(state.me.isOwner));
      case '/KMProfiles/permissions/audit': return answer({ permissions: PERMISSIONS.length, routes: 520, permissionsWithoutRoutes: [], grantsForUnknownPermissions: [] });
      case '/KMProfiles/list':
        return answer({
          profiles: state.profiles.map(p => profileRow(p, state.me.userId, false)),
          assignableRanks: state.me.assignableRanks,
          acceptPasswordAsBearer: true,
        });
      case '/KMProfiles/get':
        return target ? answer(profileRow(target, state.me.userId, true)) : answer({ error: 'Profile not found.' }, 404);
      case '/KMProfiles/sessions': return answer(target ? sessions(target) : []);
      case '/KMProfiles/sessions/mine': return answer(sessions({ userId: state.me.userId, name: state.me.name, rankValue: state.me.rankValue, sessions: 2, presence: 'online', currentPath: '/account', currentTitle: 'KM: Account' }).map((s, i) => ({ ...s, current: i === 0 })));
      case '/KMProfiles/activity/summary': return answer(summary(url.searchParams.get('range') ?? '24h'));
      case '/KMProfiles/activity': return answer({ items: timeline(), next: null });
      case '/KMProfiles/activity/usage':
        return answer({
          permissions: (target?.grants ?? []).map((key, i) => ({ key, title: key, service: '', tier: 'Read', held: true, count: i % 3 === 0 ? 0 : 10 * i, denied: 0, lastUsedMs: i % 3 === 0 ? null : Date.now() - i * HOUR })),
          unusedFor30Days: (target?.grants ?? []).filter((_, i) => i % 3 === 0),
        });
      case '/KMProfiles/permissions/set': {
        if (target) target.grants = (body?.grants ?? []).map((g: any) => g.key);
        return answer({ added: [], removed: [], changed: [], profile: target ? profileRow(target, state.me.userId, true) : null });
      }
      case '/KMProfiles/access/suspend':
        if (target) { target.suspended = true; target.suspensionReason = body?.reason ?? null; }
        return answer(target ? profileRow(target, state.me.userId, false) : {});
      case '/KMProfiles/access/unsuspend':
        if (target) target.suspended = false;
        return answer(target ? profileRow(target, state.me.userId, false) : {});
      case '/KMProfiles/access/read-only':
        if (target) target.readOnly = !!body?.enabled;
        return answer(target ? profileRow(target, state.me.userId, false) : {});
      case '/KMProfiles/access/login':
        if (target) target.canLogin = !!body?.enabled;
        return answer(target ? profileRow(target, state.me.userId, false) : {});
      case '/KMProfiles/sessions/revoke': {
        if (body?.idleDays && target) {
          const revoked = target.idleSessions ?? 0;
          target.sessions = (target.sessions ?? 0) - revoked;
          target.idleSessions = 0;
          return answer({ revoked });
        }
        return answer({ revoked: body?.sessionId ? 1 : target?.sessions ?? 0 });
      }
      case '/KMProfiles/sessions/mine/revoke': return answer({ revoked: 1 });
      case '/KMProfiles/insights': return answer(insights(state));
      case '/KMProfiles/create': {
        const created: FixtureProfile = { userId: `new-${state.profiles.length}`, name: body?.name ?? 'New', rankValue: RANKS.indexOf(body?.rank ?? 'Guest'), grants: (body?.grants ?? []).map((g: any) => g.key) };
        state.profiles.push(created);
        return answer({ profile: profileRow(created, state.me.userId, true), password: body?.generatePassword ? 'Vb7-qL2m-Tx9r-Hd4w-Kp' : null }, 201);
      }

      // KliveCloud sharing
      case '/KliveCloud/GetDriveInfo':
        return answer({ DriveName: 'D:\\', DriveFormat: 'NTFS', TotalCapacityGB: 1863, UsedCapacityGB: 1022.4, FreeCapacityGB: 840.6, UsagePercentage: 54.9 });
      case '/KliveCloud/GetFolderTree':
        return answer([
          { ItemID: 'f-designs', Name: 'Designs', RelativePath: 'Designs', ParentFolderID: '', CreatedDate: iso(20 * DAY), ModifiedDate: iso(DAY), CreatedByUserID: 'klives', CreatedByName: 'Klives', ItemType: 'Folder', FileSizeBytes: 0, MyLevel: 'Editor', MinimumPermissionLevel: '2 people', Access: null },
          { ItemID: 'f-public', Name: 'Shared drive', RelativePath: 'Shared drive', ParentFolderID: '', CreatedDate: iso(80 * DAY), ModifiedDate: iso(3 * DAY), CreatedByUserID: 'klives', CreatedByName: 'Klives', ItemType: 'Folder', FileSizeBytes: 0, MyLevel: 'Editor', MinimumPermissionLevel: 'Everyone', Access: null },
          { ItemID: 'file-report', Name: 'Quarterly report.pdf', RelativePath: 'Quarterly report.pdf', ParentFolderID: '', CreatedDate: iso(4 * DAY), ModifiedDate: iso(4 * DAY), CreatedByUserID: 'sam', CreatedByName: 'Sam Carter', ItemType: 'File', FileSizeBytes: 2_431_000, MyLevel: 'Viewer', MinimumPermissionLevel: '1 person', Access: null },
        ]);
      case '/KliveCloud/Browse':
        return answer({
          Folder: null, Virtual: null, Path: [], MyLevel: 'Editor', SharedWithMeCount: 2,
          Items: [
            { ItemID: 'f-designs', Name: 'Designs', RelativePath: 'Designs', ParentFolderID: '', CreatedDate: iso(20 * DAY), ModifiedDate: iso(DAY), CreatedByUserID: 'klives', CreatedByName: 'Klives', ItemType: 'Folder', FileSizeBytes: 0, MyLevel: 'Editor', MinimumPermissionLevel: '2 people', Access: { Everyone: null, Inherit: true, People: [{ ProfileId: 'sam', Name: 'Sam Carter', Level: 'Editor' }, { ProfileId: 'alex', Name: 'Alex Moreno', Level: 'Viewer' }], Summary: '2 people' } },
            { ItemID: 'f-public', Name: 'Shared drive', RelativePath: 'Shared drive', ParentFolderID: '', CreatedDate: iso(80 * DAY), ModifiedDate: iso(3 * DAY), CreatedByUserID: 'klives', CreatedByName: 'Klives', ItemType: 'Folder', FileSizeBytes: 0, MyLevel: 'Editor', MinimumPermissionLevel: 'Everyone', Access: { Everyone: 'Editor', Inherit: true, People: [], Summary: 'Everyone' } },
            { ItemID: 'file-report', Name: 'Quarterly report.pdf', RelativePath: 'Quarterly report.pdf', ParentFolderID: '', CreatedDate: iso(4 * DAY), ModifiedDate: iso(4 * DAY), CreatedByUserID: 'sam', CreatedByName: 'Sam Carter', ItemType: 'File', FileSizeBytes: 2_431_000, MyLevel: 'Viewer', MinimumPermissionLevel: '1 person', Access: null },
          ],
        });
      case '/KliveCloud/ListShareLinks': return answer([]);
      case '/KliveCloud/GetItemAccess':
        return answer({
          ItemID: url.searchParams.get('itemID'), Name: 'Designs', ItemType: 'Folder', MyLevel: 'Editor', CanManage: true, HasParent: true, Inherit: true,
          Everyone: null,
          Entries: [{ ProfileId: 'sam', Name: 'Sam Carter', Level: 'Editor', AddedById: 'klives', AddedByName: 'Klives', AddedUtc: iso(10 * DAY) }],
          Inherited: [{ FromItemID: 'root-team', FromName: 'Team', ProfileId: 'alex', Name: 'Alex Moreno', Level: 'Viewer' }],
          OwnerAlwaysHasAccess: true,
        });
      case '/KliveCloud/People':
        return answer(state.profiles.map(p => ({ userId: p.userId, name: p.name, rank: RANKS[p.rankValue], isOwner: !!p.isOwner, isYou: p.userId === state.me.userId })));
      case '/KliveCloud/SetItemAccess':
        return answer({
          ItemID: body?.itemID, Name: 'Designs', RelativePath: 'Designs', ParentFolderID: '', CreatedDate: iso(20 * DAY), ModifiedDate: iso(DAY), CreatedByUserID: 'klives', ItemType: 'Folder', FileSizeBytes: 0, MyLevel: 'Editor',
          MinimumPermissionLevel: `${body?.entries?.length ?? 0} people`, Access: { Everyone: body?.everyone ?? null, Inherit: body?.inherit ?? true, People: (body?.entries ?? []).map((e: any) => ({ ProfileId: e.profileId, Name: e.profileId, Level: e.level })), Summary: `${body?.entries?.length ?? 0} people` },
        });
      default:
        return answer({ error: 'NotFound' }, 404);
    }
  }

  return state;
}

/** /KMProfiles/insights for the fixture's profiles (as the owner sees it). */
function insights(state: ProfilesMockState) {
  const blockers = state.profiles.filter(p => (p.password7d ?? 0) > 0 && !p.allowPasswordApiAccess)
    .map(p => ({ userId: p.userId, name: p.name, password7d: p.password7d, lastPasswordUtc: ago(HOUR) }));
  return {
    builtUtc: new Date().toISOString(),
    buildMs: 4,
    trackingSinceUtc: ago(40 * DAY),
    rollups: { ready: true, through: 1000, upto: 1000 },
    passwordBearer: { accepted: true, windowDays: 7, coveredSinceUtc: ago(7 * DAY), blockers, safeToSwitchOff: blockers.length === 0 },
    profiles: state.profiles.map(p => {
      const held = p.isOwner ? PERMISSIONS.length : (p.grants ?? []).length;
      const unused = p.isOwner ? [] : p.unused ?? (p.grants ?? []).filter((_, i) => i % 3 === 0);
      const total = p.requests24h ?? 0;
      return {
        userId: p.userId,
        hourly24: Array.from({ length: 24 }, (_, i) => Math.round((total / 24) * (0.4 + ((i * 7) % 11) / 9))),
        auth: { session7d: total * 5, password7d: p.password7d ?? 0, lastPasswordUtc: p.password7d ? ago(HOUR) : null, lastSessionUtc: ago(MIN), passwordApiAllowed: !!p.allowPasswordApiAccess },
        loginRefused30d: p.canLogin === false ? 4 : 0,
        usage: { windowDays: 30, held, used: held - unused.length, unused },
        sessions: { active: p.sessions ?? 0, idle: p.idleSessions ?? 0, idleDays: 7, oldestIdleSeenUtc: p.idleSessions ? ago(13 * DAY) : null },
        effective: p.isOwner ? null : p.grants ?? [],
      };
    }),
  };
}

/** Signed in with a session token (as the new site does after sign-in). */
export async function signIn(context: BrowserContext) {
  await context.addCookies([{ name: 'km_session', value: 'kms_e2e', url: testOrigin }]);
}

/** The 403 body the API gate answers when a permission is missing. */
export function denial(key: string, route: string) {
  const def = PERMISSIONS.find(p => p.key === key)!;
  return {
    status: 403,
    headers: { RequestDeniedCode: '2', RequestDeniedReason: 'TooLowClearance' },
    body: {
      error: 'AccessDenied', reason: 'MissingPermission', code: 2, route,
      permission: { key, title: def.title, description: def.description, service: def.service, area: def.area, tier: def.tier, tierValue: def.tierValue },
      message: `You need the “${def.title}” permission (${def.service}).`,
    },
  };
}
