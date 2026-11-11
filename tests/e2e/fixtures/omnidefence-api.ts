import type { Page, Route } from '@playwright/test';
import { catalogPayload, mePayload } from './permissions';

/**
 * A stateful stand-in for the routes behind the OmniDefence console. Payloads have the shapes the
 * server's code writes (IP records in PascalCase from IpRecord, SQL rows in snake_case, the overview
 * from OmniDefenceRoutes.BuildOverviewJsonAsync, the compact map and events feed from
 * OmniDefenceRoutes.Console.cs); the values are invented and the addresses are documentation ranges.
 * Actions change the state, so a test can block an address and watch the page agree.
 */

export type DefenceScenario = 'normal' | 'starting' | 'legacy';

export interface DefenceMockOptions {
  scenario?: DefenceScenario;
  /** For 'starting': how many overview reads answer "Route not found" before the routes appear. */
  missingReads?: number;
}

export interface DefenceApiMock {
  /** Every path asked for, directly or inside a /batch. */
  requestedPaths: string[];
  directGets: string[];
  batchCalls: string[][];
  posts: Array<{ path: string; body: any }>;
  ips: Map<string, any>;
  events: any[];
  regions: any[];
  honeypots: any[];
}

export const defenceTestOrigin = new URL(
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '4173'}`,
).origin;

const CLASSES = [
  ['Owner', 'Owner', '#5fd3ff', false], ['Human', 'Human', '#52ffb9', false], ['LikelyHuman', 'Likely human', '#a6f5a0', false],
  ['ApiClient', 'API client', '#7aa7ff', false], ['VerifiedCrawler', 'Verified crawler', '#4f8dff', false], ['DeclaredBot', 'Declared bot', '#c79cff', false],
  ['ResearchScanner', 'Research scanner', '#9aa7b0', false], ['Scraper', 'Scraper', '#ffc247', true], ['HeadlessAutomation', 'Headless automation', '#ff8a3d', true],
  ['VulnScanner', 'Vuln scanner', '#ff6071', true], ['CredentialAttacker', 'Credential attacker', '#ff4fd8', true], ['Unknown', 'Unknown', '#56636b', false],
] as const;

const PLACES = [
  { Country: 'NL', City: 'Amsterdam', Region: 'North Holland', Latitude: 52.374, Longitude: 4.89, AsName: 'EXAMPLE-HOSTING', Isp: 'Example Hosting', IsHosting: true },
  { Country: 'US', City: 'Ashburn', Region: 'Virginia', Latitude: 39.044, Longitude: -77.488, AsName: 'EXAMPLE-CLOUD', Isp: 'Example Cloud', IsHosting: true },
  { Country: 'GB', City: 'London', Region: 'England', Latitude: 51.507, Longitude: -0.128, AsName: 'EXAMPLE-BROADBAND', Isp: 'Example Broadband', IsHosting: false },
  { Country: 'DE', City: 'Frankfurt am Main', Region: 'Hesse', Latitude: 50.11, Longitude: 8.682, AsName: 'EXAMPLE-DC', Isp: 'Example DC', IsHosting: true },
  { Country: 'SG', City: 'Singapore', Region: 'Singapore', Latitude: 1.29, Longitude: 103.85, AsName: 'EXAMPLE-APAC', Isp: 'Example APAC', IsHosting: true },
  { Country: 'BR', City: null, Region: null, Latitude: null, Longitude: null, AsName: 'EXAMPLE-MOVEL', Isp: 'Example Movel', IsHosting: false },
];

async function fulfilJson(route: Route, payload: unknown, status = 200, extra: Record<string, string> = {}) {
  await route.fulfill({
    status,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
      'access-control-allow-headers': 'Authorization, Content-Type, X-Klive-Client, X-Klive-Page',
      'access-control-expose-headers': 'RequestDeniedCode',
      'content-type': 'application/json; charset=utf-8',
      ...extra,
    },
    body: status === 204 ? '' : typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}

export async function installDefenceApiMock(page: Page, options: DefenceMockOptions = {}): Promise<DefenceApiMock> {
  const scenario = options.scenario ?? 'normal';
  const legacy = scenario === 'legacy';
  let missingReads = scenario === 'starting' ? options.missingReads ?? 2 : 0;
  const now = () => Math.floor(Date.now() / 1000);
  const t0 = now();
  let eventId = 100;

  const ips = new Map<string, any>();
  const add = (ip: string, cls: string, status: string, score: number, total: number, lastSeenAgo: number, place: number, extra: Record<string, unknown> = {}) => {
    ips.set(ip, {
      Ip: ip, FirstSeen: t0 - lastSeenAgo - 86_400 * 3, LastSeen: t0 - lastSeenAgo, TotalRequests: total, SuccessfulRequests: Math.round(total * 0.4),
      UnauthAttempts: cls === 'CredentialAttacker' ? 30 : 1, DenyCount: Math.round(total * (score > 100 ? 0.6 : 0.05)), ThreatScore: score, Status: status,
      Asn: `AS6450${place} ${PLACES[place].Isp}`, Org: `${PLACES[place].Isp} Ltd`, Notes: null,
      AssociatedProfileId: null, AssociatedProfileName: null, AssociatedProfileRank: null,
      Classification: cls, ClassConfidence: cls === 'Unknown' ? 0.3 : 0.92, ClassTags: cls === 'VulnScanner' ? 'Datacenter:Example,Probe' : cls === 'Human' ? 'RealInput,Residential' : '',
      ClassUpdatedUtc: t0 - lastSeenAgo, IsProxy: false, IsMobile: place === 5, ReverseDns: null, Timezone: 'UTC', LastBlockReason: status === 'Blocked' ? 'Exploit probes' : null,
      EscalationLevel: 0, LastScannedUtc: null,
      ...PLACES[place],
      ...extra,
    });
  };
  // The owner, signed in from home: never blockable.
  add('203.0.113.5', 'Owner', 'Normal', 0, 18_400, 20, 2, { AssociatedProfileId: 'p-klives', AssociatedProfileName: 'Klives', AssociatedProfileRank: 5 });
  add('203.0.113.40', 'LikelyHuman', 'Blocked', 345, 162, 3_600, 2, { LastBlockReason: 'Auto: threat score reached 257' });
  add('198.51.100.17', 'VulnScanner', 'Watch', 189, 271, 300, 0);
  add('198.51.100.23', 'VulnScanner', 'Normal', 45, 10, 1_200, 1);
  add('198.51.100.31', 'CredentialAttacker', 'Blocked', 410, 880, 900, 3);
  add('198.51.100.44', 'Scraper', 'Tarpit', 120, 2_400, 4_000, 1);
  add('198.51.100.52', 'HeadlessAutomation', 'Honeypot', 230, 640, 7_200, 4);
  add('192.0.2.10', 'VerifiedCrawler', 'Normal', 0, 1_200, 600, 1, { ReverseDns: 'crawl.example.com' });
  add('192.0.2.11', 'DeclaredBot', 'Normal', 0, 90, 30_000, 3);
  add('192.0.2.12', 'ResearchScanner', 'Normal', 8, 44, 50_000, 0);
  add('192.0.2.20', 'Human', 'Normal', 0, 310, 1_800, 2, { AssociatedProfileId: 'p-guest', AssociatedProfileName: 'Guest Fixture', AssociatedProfileRank: 1 });
  add('192.0.2.21', 'ApiClient', 'Normal', 0, 5_100, 120, 2);
  add('192.0.2.30', 'Unknown', 'Normal', 2, 3, 200_000, 5);
  for (let i = 0; i < 24; i++) add(`198.51.100.${100 + i}`, i % 3 === 0 ? 'VulnScanner' : i % 3 === 1 ? 'Scraper' : 'Unknown', 'Normal', i * 3, 5 + i, 3_600 * (i + 1), i % PLACES.length);

  const events: any[] = [];
  const event = (ip: string, kind: string, ago: number, actor: string | null, detail: string | null) => {
    events.unshift({ id: ++eventId, utc_ts: t0 - ago, ip, kind, actor_profile_name: actor, detail });
  };
  event('198.51.100.31', 'AutoBlocked', 5_400, null, 'Auto: threat score reached 204');
  event('198.51.100.17', 'AutoWatch', 3_000, null, 'Threat score 61 (was Normal)');
  event('198.51.100.52', 'StatusChange:Honeypot', 2_000, 'Klives', null);
  event('203.0.113.40', 'Classified:LikelyHuman', 1_000, null, null);

  const regions: any[] = [{ id: 1, latMin: 55.0, latMax: 60.0, lonMin: 35.0, lonMax: 45.0, reason: 'Probe source block', createdUtc: t0 - 86_400 * 9, createdBy: 'Klives' }];
  const honeypots: any[] = [{ route: '/wp-admin', createdUtc: t0 - 86_400 * 40, responseKind: 'JunkJson', note: 'Classic', hits: 412, lastHit: t0 - 5_000 }];

  const state: DefenceApiMock = { requestedPaths: [], directGets: [], batchCalls: [], posts: [], ips, events, regions, honeypots };

  // ── payloads ──

  const reviewItem = (r: any) => ({
    ip: r.Ip, classification: r.Classification, confidence: r.ClassConfidence, status: r.Status, score: r.ThreatScore,
    requests: r.TotalRequests, unauth: r.UnauthAttempts, lastSeen: r.LastSeen, country: r.Country, network: r.AsName, reason: r.LastBlockReason, tags: r.ClassTags,
  });

  const overview = () => {
    const all = [...ips.values()];
    const hostile = all.filter(r => ['VulnScanner', 'CredentialAttacker', 'HeadlessAutomation'].includes(r.Classification)
      && !['Blocked', 'Tarpit', 'Honeypot'].includes(r.Status) && r.ClassConfidence >= 0.8 && !r.AssociatedProfileId);
    const benign = all.filter(r => ['Owner', 'Human', 'LikelyHuman', 'VerifiedCrawler'].includes(r.Classification) && r.Status !== 'Normal');
    const count = (status: string) => all.filter(r => r.Status === status).length;
    const body: Record<string, unknown> = {
      asOfUtc: new Date().toISOString(),
      requests24h: 2812, totalRequests: 1_712_404, requests7d: 25_844, denied24h: 544, totalDenied: 143_761,
      authFailures24h: 2, unauth24h: 2, totalAuthEvents: 1675,
      blockedIps: count('Blocked'), watchedIps: count('Watch'), honeypotIps: count('Honeypot'), tarpitIps: count('Tarpit'),
      totalIps: all.length, knownIps: all.length, topThreat: null, topAttackers: [],
      topRoutes: [{ route: '/omnidefence/fp/nonce', hits: 600 }, { route: '/.env', hits: 120 }],
      originBreakdown: [{ origin: 'WebsiteProfile', hits: 1900 }, { origin: 'DirectApi', hits: 600 }, { origin: 'WebsiteNoProfile', hits: 312 }],
      classBreakdown: Object.fromEntries(CLASSES.map(([id]) => [id, all.filter(r => r.Classification === id).length])),
      tagBreakdown: { Datacenter: 9, Probe: 9 },
      review: { hostileAnsweredCount: hostile.length, hostileAnswered: hostile.map(reviewItem), benignPenalisedCount: benign.length, benignPenalised: benign.map(reviewItem) },
      health: { overviewBuildMs: 23, buildSteps: { 'requests in the last 7 days': 14, 'IP records': 1 }, auditQueue: 4, auditRowsDropped: 0, readPoolTimeouts: 0, fingerprintBacklog: 0 },
    };
    if (!legacy) {
      // A week of hours as the server publishes them: oldest first, h = unix seconds the hour starts.
      const hourNow = t0 - (t0 % 3600);
      body.hourly = Array.from({ length: 168 }, (_, i) => {
        const h = hourNow - (167 - i) * 3600;
        return { h, requests: 100 + ((i * 37) % 80), denied: 18 + ((i * 11) % 9) };
      });
    }
    return body;
  };

  const compactMap = (since: number | null) => {
    const fields = ['ip', 'firstSeen', 'lastSeen', 'total', 'unauth', 'deny', 'score', 'status', 'country', 'city', 'region', 'asName', 'isp', 'org', 'asn', 'lat', 'lon', 'profileName', 'profileRank', 'cls', 'conf', 'classTags', 'classUpdated', 'notes', 'isHosting', 'isProxy', 'isMobile', 'lastBlockReason'];
    const picked = [...ips.values()].filter(r => since == null || r.LastSeen >= since || (r.ClassUpdatedUtc ?? 0) >= since).sort((a, b) => b.LastSeen - a.LastSeen);
    const rows = picked.map(r => [r.Ip, r.FirstSeen, r.LastSeen, r.TotalRequests, r.UnauthAttempts, r.DenyCount, r.ThreatScore, r.Status, r.Country, r.City, r.Region, r.AsName, r.Isp, r.Org, r.Asn,
      r.Latitude, r.Longitude, r.AssociatedProfileName, r.AssociatedProfileRank, r.Classification, r.ClassConfidence, r.ClassTags, r.ClassUpdatedUtc, r.Notes, r.IsHosting, r.IsProxy, r.IsMobile, r.LastBlockReason]);
    return { asOf: now(), full: since == null, since, count: rows.length, fields, rows };
  };

  const requests = (query: URLSearchParams) => {
    const ip = query.get('ip');
    const denyOnly = query.get('denyOnly') === '1';
    const rows = Array.from({ length: 30 }, (_, i) => {
      const record = [...ips.values()][i % ips.size];
      const denied = record.Status === 'Blocked' || i % 7 === 0;
      return {
        id: 9000 - i, utc_ts: t0 - i * 40, ip: record.Ip, method: i % 4 === 0 ? 'POST' : 'GET', route: denied ? '/.env' : '/omnidefence/overview', query: i % 5 === 0 ? '?debug=1' : null,
        status_code: denied ? 403 : 200, duration_ms: 3 + i, profile_id: record.AssociatedProfileId, profile_name: record.AssociatedProfileName, profile_rank: record.AssociatedProfileRank,
        perm_required: 0, perm_key: 'omnidefence.overview.view', matched_route: denied ? 0 : 1, body_hash: null, body_length: 0, user_agent: 'Mozilla/5.0 (fixture)',
        deny_reason: denied ? (record.Status === 'Blocked' ? 'Blocked' : 'Probe') : null, request_origin: record.AssociatedProfileId ? 'WebsiteProfile' : 'DirectApi', client_page: record.AssociatedProfileId ? '/omnidefence' : null,
      };
    });
    return rows.filter(row => (!ip || row.ip.includes(ip)) && (!denyOnly || row.deny_reason));
  };

  const ipDetail = (ip: string) => {
    const record = ips.get(ip) ?? { Ip: ip, Status: 'Normal', ThreatScore: 0, TotalRequests: 0, Classification: 'Unknown' };
    return {
      record,
      recentRequests: requests(new URLSearchParams({ ip })).slice(0, 6),
      events: events.filter(e => e.ip === ip),
      auth: [{ id: 1, utc_ts: t0 - 4000, ip, type: 'UnauthRoute', profile_id: null, profile_name: null, route: '/omnidefence/overview', user_agent: 'curl/8.0', detail: null }],
    };
  };

  const fingerprint = (ip: string) => {
    const record = ips.get(ip);
    return {
      ip, record,
      fingerprint: record ? {
        Ip: ip, Requests: record.TotalRequests, Sessions: 3, PeakPerMinute: 41, NotFound: Math.round(record.TotalRequests * 0.5), Routes: ['/.env', '/wp-login.php', '/.git/config'], RoutesCapped: false,
        WebsiteRequests: 0, AuthFailures: 2, LoginAttempts: 0, LoginFailures: 0, HoneypotHits: 1, RobotsFetches: 1, RobotsTrapHits: 0, SampleProbes: ['/.env', '/.git/config'],
        HourHistogram: Array.from({ length: 24 }, (_, h) => (h * 7) % 13), UserAgents: { 'python-requests/2.31': record.TotalRequests }, UaFamilies: { 'python-requests': 1 }, UaKinds: { Script: 1 }, Ja4h: { 'ge11nn05enus_9ed1ff1f7b03': 1 },
        GapCount: 40, GapMean: 1.2, GapM2: 2.1, BrowserClaims: 0,
        Class: record.Classification, Confidence: record.ClassConfidence, Tags: String(record.ClassTags || '').split(',').filter(Boolean),
        Evidence: [{ Class: record.Classification, Weight: 99, Reason: 'Asked for /.env and /.git/config' }, { Class: record.Classification, Weight: 2.4, Reason: 'Datacenter network' }],
        Scores: { [record.Classification]: 4.2, Scraper: 1.1 }, ManualClass: null,
      } : null,
      intel: record ? { AsName: record.AsName, IsHosting: record.IsHosting, DatacenterProvider: record.IsHosting ? 'Example Cloud' : null } : null,
      rdns: null, abuse: null, greyNoise: null, devices: [], linkedIps: [],
    };
  };

  const fpStatus = () => ({
    running: true, fingerprints: ips.size, backlog: 0, signalsFolded: 1_204_331, classifications: 54_210, backfillRunning: false, backfillRowsFolded: 0,
    classBreakdown: overview().classBreakdown, tagBreakdown: {},
    intel: { datacenterRanges: 41_220, crawlerRanges: 1_450, torExits: 1_210, feeds: { tor: new Date().toISOString(), aws: 'cached' }, usageToday: {} },
    settings: {
      enabled: true, classScoreDeltas: true, autoActions: { VulnScanner: 'None', CredentialAttacker: 'None', HeadlessAutomation: 'None', Scraper: 'None' },
      allowedActions: ['None', 'Watch', 'Tarpit', 'Honeypot', 'Blocked'], actionableClasses: ['VulnScanner', 'CredentialAttacker', 'HeadlessAutomation', 'Scraper'],
      autoActionMinConfidence: 0.9, robotsTrapEnabled: true, robotsTrapPath: '/archive/ab12cd34/export', intelReverseDns: true, intelFeeds: true,
      intelAbuseIpDb: true, intelGreyNoise: true, abuseIpDbDailyBudget: 200, greyNoiseDailyBudget: 200, beaconEnabled: true, abuseIpDbKeySet: false, greyNoiseKeySet: false,
    },
  });

  const getResponse = (pathWithQuery: string): { status: number; body: unknown } => {
    const url = new URL(pathWithQuery, 'https://klive.dev');
    const path = url.pathname;
    if (path === '/KMProfiles/me') return { status: 200, body: mePayload({ rank: 5, userId: 'e2e-klives', name: 'Klives Fixture' }) };
    if (path === '/KMProfiles/permissions/catalog') return { status: 200, body: catalogPayload(true) };
    if (path.startsWith('/omnidefence/') && missingReads > 0) {
      if (path === '/omnidefence/overview') missingReads -= 1;
      return { status: 404, body: 'Route not found' };
    }
    switch (path) {
      case '/omnidefence/overview': return { status: 200, body: overview() };
      case '/omnidefence/overview/status': return { status: 200, body: { overview: { hasSnapshot: true, ageSeconds: 4, stale: false, building: false, lastBuildMs: 23 }, auditQueue: 4, auditRowsDropped: 0, readPoolTimeouts: 0, startup: { ready: true, seconds: 6.2, steps: { 'IP records': 900 } } } };
      case '/omnidefence/regions': return { status: 200, body: regions };
      case '/omnidefence/requests': return { status: 200, body: requests(url.searchParams) };
      case '/omnidefence/auth-events': return { status: 200, body: [{ id: 5, utc_ts: t0 - 600, ip: '198.51.100.31', type: 'InvalidPassword', profile_id: null, profile_name: null, route: '/KMProfiles/Login', user_agent: 'curl/8.0', detail: 'Wrong password' }] };
      case '/omnidefence/profile-actions': return { status: 200, body: [{ id: 7, utc_ts: t0 - 800, profile_id: 'p-klives', profile_name: 'Klives', ip: '203.0.113.5', category: 'Settings', action: 'Changed', detail_json: '{"key":"Example"}' }] };
      case '/omnidefence/ip-map': return { status: 200, body: [...ips.values()].sort((a, b) => b.LastSeen - a.LastSeen) };
      case '/omnidefence/ip-map/compact': return legacy ? { status: 404, body: 'Route not found' } : { status: 200, body: compactMap(Number(url.searchParams.get('since')) || null) };
      case '/omnidefence/events': return legacy ? { status: 404, body: 'Route not found' } : { status: 200, body: { asOf: now(), events: events.filter(e => e.kind !== 'GeoIP').slice(0, 100), counts24h: { AutoBlocked: 1, AutoWatch: 1 } } };
      case '/omnidefence/ip': return { status: 200, body: ipDetail(url.searchParams.get('ip') ?? '') };
      case '/omnidefence/ip/fingerprint': return { status: 200, body: fingerprint(url.searchParams.get('ip') ?? '') };
      case '/omnidefence/classes': return { status: 200, body: CLASSES.map(([id, label, color, malicious]) => ({ id, label, color, malicious, description: `${label} (fixture)` })) };
      case '/omnidefence/fingerprint/status': return { status: 200, body: fpStatus() };
      case '/omnidefence/settings': return { status: 200, body: { autoWatchScore: 50, autoBlockScore: 200, escalation2: 50, escalation3: 200, fingerprint: fpStatus().settings } };
      case '/omnidefence/honeypot-routes': return { status: 200, body: honeypots };
      case '/omnidefence/fp/nonce': return { status: 200, body: { enabled: false, nonce: null } };
      default: return { status: 200, body: { success: true } };
    }
  };

  await page.routeWebSocket('wss://klive.dev/**', () => {});

  await page.route('https://klive.dev/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const pathWithQuery = `${url.pathname}${url.search}`;
    if (request.method() === 'OPTIONS') { await fulfilJson(route, null, 204); return; }

    if (url.pathname === '/batch' && request.method() === 'POST') {
      const entries: Array<{ path?: string }> = JSON.parse(request.postData() ?? '[]');
      const paths = entries.map(entry => entry.path).filter((p): p is string => typeof p === 'string');
      state.batchCalls.push(paths);
      state.requestedPaths.push(...paths);
      await fulfilJson(route, paths.map(path => {
        const answer = getResponse(path);
        // As KliveAPI's ExecuteBatchItem: an unknown route is a JSON error body.
        const body = answer.status === 404 && answer.body === 'Route not found' ? { error: 'Route not found.' } : answer.body;
        return { path, status: answer.status, ok: answer.status >= 200 && answer.status < 300, contentType: 'application/json', body };
      }));
      return;
    }

    state.requestedPaths.push(pathWithQuery);

    if (request.method() === 'GET') {
      state.directGets.push(pathWithQuery);
      if (url.pathname === '/KMProfiles/LoginStatus') {
        await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'text/plain' }, body: 'SessionActive' });
        return;
      }
      if (url.pathname === '/omnidefence/export') {
        await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'text/csv' }, body: 'id,ip\n1,198.51.100.17\n' });
        return;
      }
      const answer = getResponse(pathWithQuery);
      await fulfilJson(route, answer.body, answer.status);
      return;
    }

    // ── writes ──
    let body: any = null;
    try { body = JSON.parse(request.postData() ?? 'null'); } catch { body = request.postData(); }
    state.posts.push({ path: url.pathname, body });
    const record = body?.ip ? ips.get(body.ip) : null;

    switch (url.pathname) {
      case '/KMProfiles/Login':
        await fulfilJson(route, { token: 'kms_e2e-klives', sessionId: 'session-e2e', expiresUtc: '2027-01-01T00:00:00Z', me: mePayload({ rank: 5, name: 'Klives Fixture' }) });
        return;
      case '/omnidefence/ip/block':
        if (record?.AssociatedProfileRank >= 5) { await fulfilJson(route, 'Refusing to block a Klives-linked IP', 409); return; }
        if (record) { record.Status = 'Blocked'; record.LastBlockReason = body.reason; }
        event(body.ip, 'Block', 0, 'Klives', body.reason);
        await fulfilJson(route, { ok: true });
        return;
      case '/omnidefence/ip/untrap':
      case '/omnidefence/ip/unblock':
        if (record) { record.Status = 'Normal'; record.LastBlockReason = null; }
        event(body.ip, 'Untrap', 0, 'Klives', body.reason ?? null);
        await fulfilJson(route, { ok: true });
        return;
      case '/omnidefence/ip/status':
        if (record) record.Status = body.status;
        event(body.ip, `StatusChange:${body.status}`, 0, 'Klives', null);
        await fulfilJson(route, { ok: true });
        return;
      case '/omnidefence/ip/note':
        if (record) record.Notes = body.note;
        await fulfilJson(route, { ok: true });
        return;
      case '/omnidefence/ip/scan':
        await fulfilJson(route, { Ip: body.ip, StartedUtc: new Date().toISOString(), Duration: '00:00:01.2000000', OpenPorts: [22, 8080], ProbedPorts: [21, 22, 23, 80, 443, 8080], Error: null });
        return;
      case '/omnidefence/regions/add': {
        const region = { id: regions.length + 1, latMin: body.latMin, latMax: body.latMax, lonMin: body.lonMin, lonMax: body.lonMax, reason: body.reason, createdUtc: now(), createdBy: 'Klives' };
        regions.unshift(region);
        await fulfilJson(route, { ok: true, id: region.id, blockedCount: 2 });
        return;
      }
      case '/omnidefence/regions/remove':
        regions.splice(0, regions.length, ...regions.filter(r => r.id !== body.id));
        await fulfilJson(route, { ok: true, unblockedCount: body.unblockIpsInRegion ? 1 : 0 });
        return;
      case '/omnidefence/honeypot-routes/add':
        honeypots.push({ route: body.route.startsWith('/') ? body.route : `/${body.route}`, createdUtc: now(), responseKind: 'JunkJson', note: body.note, hits: 0, lastHit: 0 });
        await fulfilJson(route, { ok: true });
        return;
      case '/omnidefence/honeypot-routes/remove':
        honeypots.splice(0, honeypots.length, ...honeypots.filter(h => h.route !== body.route));
        await fulfilJson(route, { ok: true });
        return;
      default:
        await fulfilJson(route, { ok: true });
    }
  });

  return state;
}

export async function openDefence(page: Page, options: DefenceMockOptions & { path?: string } = {}): Promise<DefenceApiMock> {
  const api = await installDefenceApiMock(page, options);
  await page.context().addCookies([{ name: 'password', value: 'e2e-klives', url: defenceTestOrigin }]);
  await page.addInitScript(() => { window.localStorage.setItem('vnavCollapsed', '0'); });
  // Windows dev-server runs sometimes stall a navigation (ERR_NO_BUFFER_SPACE): load again.
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(options.path ?? '/omnidefence', { waitUntil: 'domcontentloaded', timeout: 15_000 });
      await page.getByTestId('odx-root').waitFor({ state: 'visible', timeout: 15_000 });
      break;
    } catch (error) {
      if (attempt >= 2) throw error;
      await page.waitForTimeout(3_000 * (attempt + 1));
    }
  }
  return api;
}
