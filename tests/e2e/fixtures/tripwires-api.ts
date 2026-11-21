import type { Page, Route } from '@playwright/test';
import { catalogPayload, mePayload } from './permissions';

/**
 * A stateful stand-in for the routes behind the Tripwires console. Payloads have the shapes the server
 * writes (TripwireRoutes.PresentOverview / PresentEvent, camelCase); the values are invented and the
 * addresses are documentation ranges. The scenario mirrors what the live server held on 21 Nov 2026:
 * a capped link that turned visitors away, trips from addresses that signed in to KM, a VPN exit, and
 * trips that kept only the time because Do Not Track was honoured.
 */

export interface TripwiresApiMock {
  requestedPaths: string[];
  batchCalls: string[][];
  directGets: string[];
  posts: Array<{ path: string; body: any }>;
  tripwires: any[];
  events: Map<string, any[]>;
}

export interface TripwiresMockOptions {
  /** A server from before /tripwires/overview: the page reads the list and a summary per tripwire. */
  legacy?: boolean;
  /** The profile cannot see OmniDefence, so trips carry no network block. */
  noIntel?: boolean;
  discordDown?: boolean;
}

export const tripwiresTestOrigin = new URL(
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '4173'}`,
).origin;

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function settings(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true, captureIpAddress: true, captureLocation: true, captureUserAgent: true, captureDeviceDetails: true,
    captureReferrer: true, captureLanguage: true, captureQueryParameters: true, honourDoNotTrack: true, ignoreBots: true,
    discordNotifications: true, discordIncludeSensitiveDetails: true, notificationCooldownSeconds: 0, deduplicateWindowMinutes: 60,
    retentionDays: 90, expiresUtc: null, maxTrips: null, redirectStatusCode: 302, closedBehaviour: 'refuse', discordSkipKnownProfiles: false,
    ...overrides,
  };
}

function trip(tripwireId: string, tripwireName: string, msAgo: number, extra: Record<string, unknown> = {}) {
  return {
    id: `ev-${tripwireId}-${msAgo}`, tripwireId, tripwireName, targetId: `${tripwireId}-t0`, targetLabel: 'Main link', destinationUrl: 'https://example.com/landing',
    trippedUtc: iso(msAgo), ipAddress: '198.51.100.40', visitorHash: `v${tripwireId.slice(-1)}${msAgo}`.padEnd(24, '0').slice(0, 24),
    countryCode: 'GB', country: 'United Kingdom', region: 'England', city: 'London', latitude: 51.5, longitude: -0.12, timezone: 'Europe/London',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/158.0', browser: 'Chrome 158', operatingSystem: 'Windows', deviceType: 'Desktop',
    referrer: null, language: 'en-GB', queryParametersJson: null, doNotTrack: false, isBot: false, isUnique: true, discordNotified: true, notificationError: null,
    network: { isp: 'Example Broadband', org: '', asn: 'EXAMPLE-AS', proxy: false, hosting: false, mobile: false, classification: 'Human', tags: 'Residential', profile: null, profileRank: null, profileSeenUtc: null, defenceStatus: 'Normal' },
    ...extra,
  };
}

function hourly(events: any[]) {
  const counts = new Map<string, number>();
  for (const e of events) {
    const h = e.trippedUtc.slice(0, 13);
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([h, n]) => ({ h, n }));
}

async function fulfilJson(route: Route, payload: unknown, status = 200) {
  await route.fulfill({
    status,
    headers: {
      'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'Authorization, Content-Type, X-Klive-Client, X-Klive-Page', 'content-type': 'application/json; charset=utf-8',
    },
    body: status === 204 ? '' : typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}

export async function installTripwiresMock(page: Page, options: TripwiresMockOptions = {}): Promise<TripwiresApiMock> {
  const intel = !options.noIntel;
  const target = (id: string, label: string, url: string, trips: number, enabled = true) => ({
    id: `${id}-t0`, label, destinationUrl: url, enabled, sortOrder: 0, tripCount: trips, createdUtc: iso(30 * DAY), trackingUrl: `https://klive.dev/t?key=token-${id}-0000000000`,
  });

  const tripwires: any[] = [
    {
      id: 'tw1scammer', name: 'Scammer', createdBy: 'Klives', createdUtc: iso(50 * DAY), updatedUtc: iso(10 * HOUR), lastTrippedUtc: iso(9 * HOUR),
      totalTrips: 5, settings: settings({ honourDoNotTrack: false, ignoreBots: false }), status: 'Active', closedReason: null,
      closedVisits: 0, lastClosedUtc: null, previewVisits: 2, lastPreviewUtc: iso(11 * HOUR), lastPreviewAgent: 'Discord',
      targets: [target('tw1scammer', 'Main link', 'https://example.com/landing', 5)],
    },
    {
      id: 'tw2capped', name: 'Forum post', createdBy: 'Klives', createdUtc: iso(13 * DAY), updatedUtc: iso(13 * DAY), lastTrippedUtc: iso(13 * DAY),
      totalTrips: 10, settings: settings({ maxTrips: 10, retentionDays: 3650, honourDoNotTrack: false }), status: 'Limit reached', closedReason: 'limit',
      closedVisits: 53, lastClosedUtc: iso(12 * DAY), previewVisits: 1, lastPreviewUtc: iso(13 * DAY), lastPreviewAgent: 'Reddit',
      targets: [target('tw2capped', 'Paste', 'https://paste.example/p/abc', 10)],
    },
    {
      id: 'tw3quiet', name: 'Two links', createdBy: 'Klives', createdUtc: iso(40 * DAY), updatedUtc: iso(40 * DAY), lastTrippedUtc: null,
      totalTrips: 0, settings: settings(), status: 'Active', closedReason: null, closedVisits: 0, lastClosedUtc: null, previewVisits: 0,
      lastPreviewUtc: null, lastPreviewAgent: null,
      targets: [target('tw3quiet', 'Video', 'https://video.example/watch', 0), { ...target('tw3quiet', 'Careers', 'https://jobs.example/apply', 0), id: 'tw3quiet-t1', trackingUrl: 'https://klive.dev/t?key=token-tw3quiet-1111111111' }],
    },
  ];

  const known = (profile: string) => ({ isp: 'Example Fibre', org: '', asn: 'EXAMPLE-FIBRE', proxy: false, hosting: false, mobile: false, classification: 'Owner', tags: 'Residential,Authenticated', profile, profileRank: 5, profileSeenUtc: iso(5 * MIN), defenceStatus: 'Normal' });
  const events = new Map<string, any[]>([
    ['tw1scammer', [
      trip('tw1scammer', 'Scammer', 9 * HOUR, { ipAddress: '203.0.113.77', visitorHash: 'aa11bb22cc33dd44ee55ff66', network: { isp: 'Example VPN Ltd', org: 'EXAMPLE-EXIT-LONDON', asn: 'EXAMPLE-VPN', proxy: true, hosting: false, mobile: false, classification: 'Unknown', tags: 'VPN/Proxy', profile: null, profileRank: null, profileSeenUtc: null, defenceStatus: 'Normal' } }),
      trip('tw1scammer', 'Scammer', 10 * HOUR, { ipAddress: '198.51.100.5', visitorHash: 'kk11bb22cc33dd44ee55ff66', doNotTrack: true, network: known('Klives') }),
      trip('tw1scammer', 'Scammer', 10 * HOUR + MIN, { ipAddress: null, visitorHash: null, userAgent: null, browser: null, operatingSystem: null, deviceType: null, city: null, region: null, country: null, countryCode: null, latitude: null, longitude: null, timezone: null, language: null, doNotTrack: true, network: null }),
      trip('tw1scammer', 'Scammer', 56 * DAY, { ipAddress: '198.51.100.6', visitorHash: 'kk99bb22cc33dd44ee55ff66', isUnique: false, deviceType: 'Mobile', operatingSystem: 'iOS', browser: 'Safari 27', network: known('Klives') }),
      trip('tw1scammer', 'Scammer', 56 * DAY + MIN, { ipAddress: '198.51.100.6', visitorHash: 'kk99bb22cc33dd44ee55ff66', deviceType: 'Mobile', operatingSystem: 'iOS', browser: 'Safari 27', network: known('Klives') }),
    ]],
    ['tw2capped', Array.from({ length: 10 }, (_, i) => trip('tw2capped', 'Forum post', 13 * DAY + i * 4 * MIN, {
      ipAddress: `198.51.100.${100 + i}`, visitorHash: `ff${String(i).padStart(2, '0')}bb22cc33dd44ee55ff66`, referrer: 'https://www.reddit.com/',
      deviceType: i % 2 ? 'Desktop' : 'Mobile', operatingSystem: i % 2 ? 'Windows' : 'iOS', browser: i % 2 ? 'Chrome 156' : 'Safari 27',
      network: { ...trip('x', 'x', 0).network, mobile: i % 2 === 0, isp: i % 2 ? 'Example Broadband' : 'Example Mobile' },
    }))],
    ['tw3quiet', []],
  ]);

  const strip = (e: any) => (intel ? e : { ...e, network: undefined });
  const summary = (id: string) => {
    const list = events.get(id) ?? [];
    const t = tripwires.find(x => x.id === id);
    const within = (ms: number) => list.filter(e => Date.now() - Date.parse(e.trippedUtc) < ms).length;
    const countries = new Map<string, number>();
    for (const e of list) countries.set(e.country ?? 'Unknown', (countries.get(e.country ?? 'Unknown') ?? 0) + 1);
    const devices = new Map<string, number>();
    for (const e of list) devices.set(e.deviceType ?? 'Unknown', (devices.get(e.deviceType ?? 'Unknown') ?? 0) + 1);
    return {
      totalTrips: t?.totalTrips ?? list.length, uniqueTrips: list.filter(e => e.isUnique).length, tripsLast24Hours: within(DAY), tripsLast7Days: within(7 * DAY),
      lastTrippedUtc: t?.lastTrippedUtc ?? null, retainedTrips: list.length, visitors: new Set(list.map(e => e.visitorHash).filter(Boolean)).size,
      privacySignalTrips: list.filter(e => e.doNotTrack).length, botTrips: 0,
      daily: [], hourly: hourly(list.filter(e => Date.now() - Date.parse(e.trippedUtc) < 30 * DAY)),
      countries: [...countries.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count),
      devices: [...devices.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count),
    };
  };

  const overview = () => {
    const all = [...events.values()].flat().sort((a, b) => Date.parse(b.trippedUtc) - Date.parse(a.trippedUtc));
    const tw = tripwires.map(t => {
      const list = events.get(t.id) ?? [];
      return {
        ...t, summary: summary(t.id),
        knownTrips: intel ? list.filter(e => e.network?.profile).length : null,
        proxyTrips: intel ? list.filter(e => e.network?.proxy).length : null,
      };
    });
    return {
      generatedUtc: iso(2_000), tripwires: tw, recent: all.slice(0, 60).map(strip),
      totals: {
        tripwires: tw.length, active: tw.filter(t => t.status === 'Active').length, links: tw.reduce((n, t) => n + t.targets.filter((x: any) => x.enabled).length, 0),
        trips24h: tw.reduce((n, t) => n + t.summary.tripsLast24Hours, 0), trips7d: tw.reduce((n, t) => n + t.summary.tripsLast7Days, 0),
        retained: all.length, closedVisits: tw.reduce((n, t) => n + (t.closedVisits ?? 0), 0), previews: tw.reduce((n, t) => n + (t.previewVisits ?? 0), 0),
        knownTrips: intel ? all.filter(e => e.network?.profile).length : null, lastTrippedUtc: iso(9 * HOUR),
      },
      health: {
        startedUtc: iso(17 * HOUR), answers: 3, lastAnswerUtc: iso(9 * HOUR), answerP50Ms: 0.6, answerP95Ms: 1.2, answerMaxMs: 1.4,
        notFound: 2, recorded: 3, recordFailures: 0, lastRecordError: null, lastRecordErrorUtc: null, dropped: 0, queued: 0,
        closedVisits: 0, previews: 0, geoOk: 2, geoFailed: 0, lastGeoError: null, lastGeoErrorUtc: null,
        discordSent: 3, discordFailed: 0, discordSkipped: 0, lastDiscordSentUtc: iso(9 * HOUR), lastDiscordError: null, lastDiscordErrorUtc: null,
        discordAvailable: !options.discordDown, networkIntel: intel, links: 4, linksLoadedUtc: iso(20_000),
      },
      intel, asOfUtc: iso(0),
    };
  };

  const present = (t: any) => {
    const { summary: _s, knownTrips: _k, proxyTrips: _p, ...rest } = t;
    return rest;
  };

  const getResponse = (pathWithQuery: string): { status: number; body: unknown } => {
    const url = new URL(pathWithQuery, 'https://klive.dev');
    const path = url.pathname;
    const id = url.searchParams.get('id') ?? '';
    if (path === '/KMProfiles/me') return { status: 200, body: mePayload({ rank: 5, userId: 'e2e-klives', name: 'Klives Fixture' }) };
    if (path === '/KMProfiles/permissions/catalog') return { status: 200, body: catalogPayload(true) };
    switch (path) {
      case '/tripwires/overview':
        return options.legacy ? { status: 404, body: 'Route not found' } : { status: 200, body: overview() };
      case '/tripwires/list': return { status: 200, body: tripwires.map(present) };
      case '/tripwires/summary': return { status: 200, body: summary(id) };
      case '/tripwires/events': {
        let list = (events.get(id) ?? []).slice().sort((a, b) => Date.parse(b.trippedUtc) - Date.parse(a.trippedUtc));
        const visitor = url.searchParams.get('visitor');
        if (visitor) list = list.filter(e => e.visitorHash === visitor);
        return { status: 200, body: { items: list.map(e => ({ ...strip(e), tripwireName: undefined })), total: list.length, limit: 200, offset: 0 } };
      }
      case '/tripwires/visitors': {
        if (options.legacy) return { status: 404, body: 'Route not found' };
        const list = events.get(id) ?? [];
        const byHash = new Map<string, any[]>();
        for (const e of list) if (e.visitorHash) byHash.set(e.visitorHash, [...(byHash.get(e.visitorHash) ?? []), e]);
        const items = [...byHash.entries()].map(([hash, trips]) => {
          const sorted = trips.sort((a, b) => Date.parse(b.trippedUtc) - Date.parse(a.trippedUtc));
          return { visitorHash: hash, trips: trips.length, firstUtc: sorted[sorted.length - 1].trippedUtc, lastUtc: sorted[0].trippedUtc, also: [], latest: strip(sorted[0]) };
        });
        return { status: 200, body: { items, total: items.length } };
      }
      default: return { status: 404, body: 'Route not found' };
    }
  };

  const state: TripwiresApiMock = { requestedPaths: [], batchCalls: [], directGets: [], posts: [], tripwires, events };
  await page.routeWebSocket('wss://klive.dev/**', () => {});
  await page.route('https://klive.dev/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const pathWithQuery = `${url.pathname}${url.search}`;
    if (request.method() === 'OPTIONS') { await fulfilJson(route, null, 204); return; }

    if (url.pathname === '/batch' && request.method() === 'POST') {
      const entries: Array<{ path?: string }> = JSON.parse(request.postData() ?? '[]');
      const paths = entries.map(e => e.path).filter((p): p is string => typeof p === 'string');
      state.batchCalls.push(paths);
      state.requestedPaths.push(...paths);
      await fulfilJson(route, paths.map(path => {
        const answer = getResponse(path);
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
      const answer = getResponse(pathWithQuery);
      await fulfilJson(route, answer.body, answer.status);
      return;
    }

    let body: any = null;
    try { body = JSON.parse(request.postData() ?? 'null'); } catch { body = request.postData(); }
    state.posts.push({ path: url.pathname, body });
    const existing = body?.id ? tripwires.find(t => t.id === body.id) : null;

    switch (url.pathname) {
      case '/KMProfiles/Login':
        await fulfilJson(route, { token: 'kms_e2e-klives', sessionId: 'session-e2e', expiresUtc: '2027-01-01T00:00:00Z', me: mePayload({ rank: 5, name: 'Klives Fixture' }) });
        return;
      case '/tripwires/create': {
        const id = `tw${tripwires.length + 1}new${Date.now() % 10000}`;
        const created = {
          id, name: body.name, createdBy: 'Klives', createdUtc: iso(0), updatedUtc: iso(0), lastTrippedUtc: null, totalTrips: 0,
          settings: settings(body.settings), status: 'Active', closedReason: null, closedVisits: 0, lastClosedUtc: null, previewVisits: 0, lastPreviewUtc: null, lastPreviewAgent: null,
          targets: body.targets.map((t: any, i: number) => ({ id: `${id}-t${i}`, label: t.label || new URL(t.destinationUrl).hostname, destinationUrl: t.destinationUrl, enabled: true, sortOrder: i, tripCount: 0, createdUtc: iso(0), trackingUrl: `https://klive.dev/t?key=new-${id}-${i}` })),
        };
        tripwires.unshift(created);
        events.set(id, []);
        await fulfilJson(route, created, 201);
        return;
      }
      case '/tripwires/update': {
        if (!existing) { await fulfilJson(route, 'Tripwire not found.', 404); return; }
        if (body.name) existing.name = body.name;
        if (body.settings) existing.settings = settings({ ...existing.settings, ...body.settings });
        if (Array.isArray(body.targets)) {
          existing.targets = body.targets.map((t: any, i: number) => {
            const old = existing.targets.find((x: any) => x.id === t.id);
            return old ? { ...old, ...t, sortOrder: i } : { id: `${existing.id}-n${i}`, label: t.label || new URL(t.destinationUrl).hostname, destinationUrl: t.destinationUrl, enabled: t.enabled !== false, sortOrder: i, tripCount: 0, createdUtc: iso(0), trackingUrl: `https://klive.dev/t?key=new-${existing.id}-${i}` };
          });
        }
        const max = existing.settings.maxTrips;
        existing.status = !existing.settings.enabled ? 'Disabled' : max && existing.totalTrips >= max ? 'Limit reached' : 'Active';
        existing.closedReason = existing.status === 'Disabled' ? 'disabled' : existing.status === 'Limit reached' ? 'limit' : null;
        existing.updatedUtc = iso(0);
        await fulfilJson(route, existing);
        return;
      }
      case '/tripwires/delete': {
        const at = tripwires.findIndex(t => t.id === body.id);
        if (at >= 0) tripwires.splice(at, 1);
        await fulfilJson(route, { deleted: at >= 0 }, at >= 0 ? 200 : 404);
        return;
      }
      case '/tripwires/events/clear':
        if (existing) { events.set(existing.id, []); existing.totalTrips = 0; existing.closedVisits = 0; existing.previewVisits = 0; existing.lastTrippedUtc = null; }
        await fulfilJson(route, { cleared: Boolean(existing) });
        return;
      case '/tripwires/notification/test':
        await fulfilJson(route, options.discordDown ? 'KliveBot Discord is not running.' : { sent: true }, options.discordDown ? 503 : 200);
        return;
      default:
        await fulfilJson(route, { ok: true });
    }
  });
  return state;
}

export async function openTripwires(page: Page, options: TripwiresMockOptions & { path?: string } = {}): Promise<TripwiresApiMock> {
  const api = await installTripwiresMock(page, options);
  await page.context().addCookies([{ name: 'password', value: 'e2e-klives', url: tripwiresTestOrigin }]);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: tripwiresTestOrigin });
  await page.addInitScript(() => { window.localStorage.setItem('vnavCollapsed', '0'); });
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(options.path ?? '/tripwires', { waitUntil: 'domcontentloaded', timeout: 20_000 });
      await page.getByTestId('twx-root').waitFor({ state: 'visible', timeout: 20_000 });
      break;
    } catch (error) {
      if (attempt >= 2) throw error;
      await page.waitForTimeout(3_000 * (attempt + 1));
    }
  }
  return api;
}
