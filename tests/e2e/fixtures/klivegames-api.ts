import type { Page, Route, WebSocketRoute } from '@playwright/test';
import { catalogPayload, mePayload } from './permissions';

/**
 * A stateful stand-in for the routes behind /klivegames. Payloads have the shapes the server writes
 * (KliveGames.Insights.cs ServerView for the overview, GameServerInstance for the legacy list, the route
 * handlers in KliveGamesRoutes.cs for the rest); every name, address and date is invented. Actions change
 * the state, so a test can start, back up or rename and watch the page agree with what the server holds.
 *
 * Scenarios:
 *  - 'normal': Klives (every permission).
 *  - 'viewer': a profile with klivegames.servers.read only, like the one whose Start click 403'd on 24 Oct.
 *  - 'legacy': a server from before the overview route ("Route not found"); only /klivegames/servers.
 */

export type GamesScenario = 'normal' | 'viewer' | 'legacy' | 'empty';

export interface GamesMockOptions { scenario?: GamesScenario }

export interface FakeServer {
  id: string; name: string; gameType: string; flavor: string; version: string; port: number; ramMb: number;
  status: string; isPublic: boolean; players: string[]; maxPlayers: number; cpu: number; ramUsed: number;
  lastStartedUtc: string | null; lastStoppedUtc: string | null; runningSinceUtc: string | null; createdUtc: string;
  lastError: string | null; lastErrorAt: string | null; lastErrorApprox: boolean;
  backups: { Id: string; SizeBytes: number; CreatedUtc: string; Kind: string }[];
  everyHours: number; keep: number;
  storage: { serverBytes: number; files: number; backupBytes: number } | null;
  forward: 'forwarded' | 'missing';
  config: Record<string, string>;
  job: any;
}

export interface GamesApiMock {
  servers: FakeServer[];
  requested: string[];
  posts: Array<{ path: string; body: any }>;
  wsSent: string[];
  activity: any[];
}

export const gamesTestOrigin = new URL(
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? '4173'}`,
).origin;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
  'access-control-allow-headers': 'Authorization, Content-Type, X-Klive-Client, X-Klive-Page',
  'access-control-expose-headers': '*',
};

async function fulfil(route: Route, payload: unknown, status = 200, type = 'application/json; charset=utf-8') {
  await route.fulfill({ status, headers: { ...CORS, 'content-type': type }, body: status === 204 ? '' : typeof payload === 'string' ? payload : JSON.stringify(payload) });
}

const SCHEMA_MC = [
  ['motd', 'MOTD', 'Text', 'General'], ['gamemode', 'Game Mode', 'Dropdown', 'Gameplay', ['survival', 'creative', 'adventure', 'spectator']],
  ['difficulty', 'Difficulty', 'Dropdown', 'Gameplay', ['peaceful', 'easy', 'normal', 'hard']], ['pvp', 'PvP', 'Boolean', 'Gameplay'],
  ['max-players', 'Max Players', 'Number', 'Players'], ['white-list', 'Whitelist', 'Boolean', 'Players'],
  ['view-distance', 'View Distance', 'Number', 'World'], ['server-port', 'Server Port', 'Number', 'Network'],
] as const;

export async function installGamesApiMock(page: Page, options: GamesMockOptions = {}): Promise<GamesApiMock> {
  const scenario = options.scenario ?? 'normal';
  const legacy = scenario === 'legacy';
  const t0 = Date.now();
  const iso = (msAgo: number) => new Date(t0 - msAgo).toISOString();
  const M = 60_000, H = 3_600_000, D = 24 * H;

  const mk = (s: Partial<FakeServer> & Pick<FakeServer, 'id' | 'name' | 'gameType' | 'flavor' | 'version' | 'port'>): FakeServer => ({
    ramMb: 2048, status: 'Stopped', isPublic: true, players: [], maxPlayers: 20, cpu: 0, ramUsed: 0,
    lastStartedUtc: iso(140 * D), lastStoppedUtc: iso(140 * D - 3 * H), runningSinceUtc: null, createdUtc: iso(150 * D),
    lastError: null, lastErrorAt: null, lastErrorApprox: false, backups: [], everyHours: 0, keep: 7,
    storage: { serverBytes: 380_000_000, files: 412, backupBytes: 0 }, forward: 'forwarded',
    config: { motd: `${s.name} — fixture`, gamemode: 'survival', difficulty: 'easy', pvp: 'true', 'max-players': '20', 'white-list': 'false', 'view-distance': '10', 'server-port': String(s.port) },
    job: null, ...s,
  });

  const servers: FakeServer[] = scenario === 'empty' ? [] : [
    mk({ id: 'mc-over', name: 'Overworld', gameType: 'Minecraft', flavor: 'Paper', version: '1.21.11', port: 25568, ramMb: 4096, status: 'Running', players: ['Alex', 'Sam', 'Robin'], cpu: 23.5, ramUsed: 3_100_000_000, runningSinceUtc: iso(2 * H + 14 * M), lastStartedUtc: iso(2 * H + 15 * M), forward: 'missing', storage: { serverBytes: 1_240_000_000, files: 3_812, backupBytes: 0 } }),
    mk({ id: 'mc-mod', name: 'Modpack', gameType: 'Minecraft', flavor: 'Forge', version: '26.2', port: 25567, status: 'Crashed', lastError: 'Process exited unexpectedly with code 1.', lastErrorAt: iso(143 * D), lastErrorApprox: true, storage: { serverBytes: 92_000_000, files: 188, backupBytes: 0 } }),
    mk({ id: 'mc-sky', name: 'Skyblock', gameType: 'Minecraft', flavor: 'Fabric', version: '26.2', port: 25566, ramMb: 6144 }),
    mk({ id: 'mc-isl', name: 'Islands', gameType: 'Minecraft', flavor: 'Vanilla', version: '26.2', port: 25565, ramMb: 8192 }),
    mk({ id: 'tr-isl', name: 'Islands', gameType: 'Terraria', flavor: 'Vanilla', version: '1.4.4.9', port: 7777, maxPlayers: 8, config: { worldname: 'Isles', maxplayers: '8', difficulty: '0', port: '7777' } }),
    mk({ id: 'rs-waste', name: 'Wasteland', gameType: 'Rust', flavor: 'Vanilla', version: 'Latest', port: 28015, maxPlayers: 420, lastStartedUtc: iso(102 * D), lastStoppedUtc: iso(102 * D - H),
      backups: [{ Id: 'backup-20260803-174533.zip', SizeBytes: 2_002_642_523, CreatedUtc: iso(102 * D), Kind: 'manual' }], storage: { serverBytes: 5_600_000_000, files: 9_104, backupBytes: 2_002_642_523 },
      config: { 'server.hostname': 'Wasteland', 'server.maxplayers': '420', 'server.port': '28015' } }),
  ];

  const activity: any[] = [
    { atUtc: iso(2 * H + 14 * M), serverId: 'mc-over', kind: 'running', text: 'Ready for players after 41 s.', seconds: 41 },
    { atUtc: iso(2 * H + 15 * M), serverId: 'mc-over', kind: 'starting', text: 'Started by Klives Fixture.', actor: 'Klives Fixture' },
    { atUtc: iso(H + 2 * M), serverId: 'mc-over', kind: 'player-join', text: 'Alex joined.', player: 'Alex' },
    { atUtc: iso(40 * M), serverId: 'mc-over', kind: 'player-join', text: 'Sam joined.', player: 'Sam' },
    { atUtc: iso(12 * M), serverId: 'mc-over', kind: 'player-join', text: 'Robin joined.', player: 'Robin' },
    { atUtc: iso(102 * D), serverId: 'rs-waste', kind: 'backup-created', text: 'Backup: 1.9 GB in 4 min 2 s.', bytes: 2_002_642_523, seconds: 242 },
  ].sort((a, b) => Date.parse(b.atUtc) - Date.parse(a.atUtc));

  const state: GamesApiMock = { servers, requested: [], posts: [], wsSent: [], activity };
  const find = (id: string | null | undefined) => servers.find(s => s.id === id);
  const record = (serverId: string, kind: string, text: string, extra: Record<string, unknown> = {}) => {
    activity.unshift({ atUtc: new Date().toISOString(), serverId, kind, text, actor: 'Klives Fixture', ...extra });
  };

  const portsOf = (s: FakeServer) => (s.gameType === 'Rust'
    ? [{ port: s.port, protocol: 'UDP', purpose: 'Game' }, { port: s.port + 1, protocol: 'UDP', purpose: 'Server browser' }]
    : [{ port: s.port, protocol: 'TCP', purpose: 'Game' }]);
  const live = (s: FakeServer) => ['Running', 'Starting', 'Stalled', 'Stopping'].includes(s.status);

  const overviewRow = (s: FakeServer) => ({
    id: s.id, name: s.name, gameType: s.gameType, flavor: s.flavor, version: s.version,
    flavorBuild: s.flavor === 'Paper' ? 132 : null, loaderVersion: s.flavor === 'Fabric' ? '0.19.3' : s.flavor === 'Forge' ? '65.0.0' : null,
    javaMajor: s.gameType === 'Minecraft' ? 21 : null, port: s.port, protocol: s.gameType === 'Rust' ? 'UDP' : 'TCP', ramMb: s.ramMb,
    usesMemoryLimit: s.gameType === 'Minecraft', useAikarFlags: true, autoStart: false, autoRestart: true, isPublic: s.isPublic,
    status: s.status, adopted: false, consoleAttached: live(s), onlinePlayers: s.players, maxPlayers: s.maxPlayers,
    cpuPercent: s.cpu, ramUsedBytes: s.ramUsed, createdUtc: s.createdUtc, runningSinceUtc: s.runningSinceUtc,
    lastStartedUtc: s.lastStartedUtc, lastStoppedUtc: s.lastStoppedUtc, lastExitCode: s.status === 'Crashed' ? 1 : 0, lastStartupSeconds: s.status === 'Running' ? 41 : null,
    lastError: s.lastError, lastErrorAt: s.lastErrorAt, lastErrorApprox: s.lastErrorApprox, lastCrashUtc: null, crashes7d: 0,
    supportedPlayerActions: s.gameType === 'Minecraft' ? ['op', 'deop', 'kick', 'ban', 'pardon', 'whitelist-add', 'whitelist-remove'] : s.gameType === 'Terraria' ? ['kick', 'ban'] : ['kick'],
    backups: {
      count: s.backups.length, bytes: s.backups.reduce((n, b) => n + b.SizeBytes, 0), lastUtc: s.backups[0]?.CreatedUtc ?? null, lastKind: s.backups[0]?.Kind ?? null,
      everyHours: s.everyHours, keep: s.keep, nextDueUtc: s.everyHours ? (s.backups.length ? new Date(Date.parse(s.backups[0].CreatedUtc) + s.everyHours * H).toISOString() : new Date().toISOString()) : null,
      job: s.job,
    },
    storage: s.storage ? { ...s.storage, measuredUtc: iso(5 * M) } : null,
    network: {
      joinAddress: s.isPublic ? `klive.dev:${s.port}` : null, lanAddress: `10.0.0.5:${s.port}`,
      ports: portsOf(s).map(p => ({ ...p, state: s.isPublic ? (live(s) ? s.forward : 'missing') : 'local' })),
    },
    players: { online: s.players.length, max: s.maxPlayers, known: s.id === 'mc-over' ? 4 : 0, lastSeenUtc: s.id === 'mc-over' ? new Date().toISOString() : null, peak24h: s.id === 'mc-over' ? 3 : 0 },
    spark: live(s) ? { t0: t0 - 40 * 15_000, stepSeconds: 15, cpu: Array.from({ length: 40 }, (_, i) => 15 + 10 * Math.sin(i / 4)), ramMb: Array.from({ length: 40 }, (_, i) => 2800 + i * 8), players: Array.from({ length: 40 }, (_, i) => (i > 30 ? 3 : 2)) } : null,
    lastActivity: activity.find(a => a.serverId === s.id) ?? null,
  });

  const legacyRow = (s: FakeServer) => ({
    Id: s.id, Name: s.name, GameType: s.gameType, Flavor: s.flavor, Version: s.version, FlavorBuild: null, LoaderVersion: null, JavaMajor: 21,
    Port: s.port, RamMb: s.ramMb, JvmArgs: '', UseAikarFlags: true, AutoStart: false, AutoRestart: true, Public: s.isPublic, Status: s.status,
    ChildPid: null, ChildStartedUtc: null, Adopted: false, ServerDirectory: 'D:\\fixture', LaunchTarget: '', DeployOptions: {}, CreatedUtc: s.createdUtc,
    LastStartedUtc: s.lastStartedUtc, OnlinePlayers: s.players, MaxPlayers: s.maxPlayers, CpuPercent: s.cpu, RamUsedBytes: s.ramUsed,
    RunningSinceUtc: s.runningSinceUtc, LastError: s.lastError, PublicJoinAddress: s.isPublic ? `klive.dev:${s.port}` : null,
  });

  const schemaOf = (s: FakeServer) => (s.gameType === 'Minecraft'
    ? SCHEMA_MC.map(([Key, Label, Type, Category, Options]) => ({ Key, Label, Type, Category, Options: Options ? [...Options] : [], Description: null, Value: s.config[Key] ?? '' }))
    : Object.keys(s.config).map(Key => ({ Key, Label: Key, Type: /port|max/.test(Key) ? 'Number' : 'Text', Category: 'General', Options: [], Description: null, Value: s.config[Key] })));

  const perms = scenario === 'viewer' ? ['klivegames.servers.read'] : null;

  const getResponse = (url: URL): { status: number; body: unknown; text?: boolean } => {
    const q = url.searchParams;
    const s = find(q.get('id'));
    switch (url.pathname) {
      case '/KMProfiles/me': return { status: 200, body: perms ? mePayload({ rank: 2, userId: 'e2e-viewer', name: 'Viewer Fixture', permissions: perms }) : mePayload({ rank: 5, userId: 'e2e-klives', name: 'Klives Fixture' }) };
      case '/KMProfiles/permissions/catalog': return { status: 200, body: catalogPayload(true) };
      case '/klivegames/overview':
        if (legacy) return { status: 404, body: 'Route not found', text: true };
        return {
          status: 200, body: {
            success: true,
            host: { cores: 4, cpuPercent: 31, ramTotalMb: 16_648, ramUsedMb: 10_772, gamesRamUsedMb: 2956, gamesRamReservedMb: 4096, drive: { name: 'D:\\', totalBytes: 2_000_398_934_016, freeBytes: 1_320_133_668_864 } },
            upnp: { available: true, error: null, asOfUtc: iso(M), localIp: '10.0.0.5' },
            servers: servers.map(overviewRow),
            activity: activity.slice(0, 30),
          },
        };
      case '/klivegames/servers': return { status: 200, body: { success: true, servers: servers.map(legacyRow) } };
      case '/klivegames/servers/get': return s ? { status: 200, body: { success: true, server: legacyRow(s) } } : { status: 404, body: { success: false, error: 'Server not found.' } };
      case '/klivegames/activity': {
        if (legacy) return { status: 404, body: 'Route not found', text: true };
        const list = s ? activity.filter(a => a.serverId === s.id) : activity;
        return { status: 200, body: { success: true, entries: list.slice(0, Number(q.get('limit') ?? 100)), hasMore: false } };
      }
      case '/klivegames/vitals': {
        if (legacy) return { status: 404, body: 'Route not found', text: true };
        if (!s) return { status: 404, body: { success: false, error: 'Server not found.' } };
        const n = q.get('window') === '24h' ? 288 : 240;
        const on = live(s);
        return { status: 200, body: { success: true, window: q.get('window') ?? '1h', ramLimitMb: s.gameType === 'Minecraft' ? s.ramMb : null, t0: t0 - n * 15_000, stepSeconds: q.get('window') === '24h' ? 300 : 15,
          cpu: Array.from({ length: n }, (_, i) => (on && i > n - 60 ? 20 + 8 * Math.sin(i / 6) : null)),
          ramMb: Array.from({ length: n }, (_, i) => (on && i > n - 60 ? 2700 + (i % 30) * 10 : null)),
          players: Array.from({ length: n }, (_, i) => (on && i > n - 60 ? (i > n - 20 ? 3 : 2) : null)) } };
      }
      case '/klivegames/players/list':
        if (!s) return { status: 404, body: { success: false, error: 'Server not found.' } };
        return { status: 200, body: { success: true, players: s.players, max: s.maxPlayers, count: s.players.length, supportedActions: overviewRow(s).supportedPlayerActions,
          known: legacy ? undefined : (s.id === 'mc-over' ? [
            { name: 'Alex', online: true, firstSeenUtc: iso(30 * D), lastSeenUtc: new Date().toISOString(), joins: 14, playedSeconds: 52_000 },
            { name: 'Sam', online: true, firstSeenUtc: iso(9 * D), lastSeenUtc: new Date().toISOString(), joins: 3, playedSeconds: 9_400 },
            { name: 'Robin', online: true, firstSeenUtc: iso(12 * M), lastSeenUtc: new Date().toISOString(), joins: 1, playedSeconds: 720 },
            { name: 'Jordan', online: false, firstSeenUtc: iso(20 * D), lastSeenUtc: iso(3 * D), joins: 6, playedSeconds: 21_000 },
          ] : []) } };
      case '/klivegames/backups/list':
        if (!s) return { status: 404, body: { success: false, error: 'Server not found.' } };
        return { status: 200, body: { success: true, backups: s.backups, job: s.job, schedule: { everyHours: s.everyHours, keep: s.keep, lastUtc: s.backups[0]?.CreatedUtc ?? null } } };
      case '/klivegames/config/get':
        if (!s) return { status: 404, body: { success: false, error: 'Server not found.' } };
        return { status: 200, body: { success: true, schema: schemaOf(s), usesMemoryLimit: s.gameType === 'Minecraft', ram: s.ramMb, jvmArgs: '', useAikarFlags: true, autoRestart: true, autoStart: false, backupEveryHours: s.everyHours, backupKeep: s.keep } };
      case '/klivegames/files/list': {
        const path = q.get('path') ?? '';
        const entries = path === '' ? [
          { Name: 'world', Path: 'world', IsDirectory: true, Size: 0, ModifiedUtc: iso(20 * M) },
          { Name: 'plugins', Path: 'plugins', IsDirectory: true, Size: 0, ModifiedUtc: iso(9 * D) },
          { Name: 'server.properties', Path: 'server.properties', IsDirectory: false, Size: 1854, ModifiedUtc: iso(3 * D) },
          { Name: 'server.jar', Path: 'server.jar', IsDirectory: false, Size: 54_846_016, ModifiedUtc: iso(140 * D) },
          { Name: 'ops.json', Path: 'ops.json', IsDirectory: false, Size: 135, ModifiedUtc: iso(9 * D) },
        ] : [{ Name: 'level.dat', Path: `${path}/level.dat`, IsDirectory: false, Size: 2_400, ModifiedUtc: iso(20 * M) }];
        return { status: 200, body: { success: true, path, entries } };
      }
      case '/klivegames/games': return { status: 200, body: { success: true, games: [
        { gameType: 'Minecraft', displayName: 'Minecraft (Java Edition)', implemented: true, protocol: 'TCP', defaultPort: 25565, flavors: ['Vanilla', 'Paper', 'Fabric', 'Forge'], requiresEula: true, usesMemoryLimit: true, supportedPlayerActions: ['op'], deployOptions: [] },
        { gameType: 'Terraria', displayName: 'Terraria', implemented: true, protocol: 'TCP', defaultPort: 7777, flavors: ['Vanilla', 'TModLoader'], requiresEula: false, usesMemoryLimit: false, supportedPlayerActions: ['kick', 'ban'],
          deployOptions: [{ Key: 'worldSize', Label: 'World Size', Type: 'Dropdown', Options: ['Small', 'Medium', 'Large'], Category: 'World', Value: 'Medium', Description: null },
            { Key: 'maxPlayers', Label: 'Max Players', Type: 'Number', Options: [], Category: 'World', Value: '8', Description: '1–255.' }] },
        { gameType: 'Rust', displayName: 'Rust', implemented: true, protocol: 'UDP', defaultPort: 28015, flavors: ['Vanilla'], requiresEula: false, usesMemoryLimit: false, supportedPlayerActions: ['kick'], deployOptions: [] },
      ] } };
      case '/klivegames/versions': {
        const game = q.get('game');
        const versions = game === 'Terraria' ? ['1.4.4.9', '1.4.4', '1.4.3.6'] : game === 'Rust' ? ['Latest'] : ['1.21.11', '1.21.10', '1.21.9'];
        return { status: 200, body: { success: true, versions: versions.map(Version => ({ Version, Type: 'release' })) } };
      }
      default: return { status: 404, body: 'Route not found', text: true };
    }
  };

  // Every other socket goes nowhere. Registered first: Playwright tries the newest route first.
  await page.routeWebSocket('wss://klive.dev/**', () => {});
  // The live console: a replay, then each command echoed the way GameConsoleHub does.
  await page.routeWebSocket(/wss:\/\/klive\.dev\/klivegames\/servers\/console.*/, (ws: WebSocketRoute) => {
    const url = new URL(ws.url());
    const s = find(url.searchParams.get('id'));
    if (scenario === 'viewer' || !s) { ws.close({ code: 1008, reason: 'Unauthorized' }); return; }
    const replay = live(s) ? [
      '[10:00:01] [Server thread/INFO]: Starting minecraft server version 1.21.11',
      '[10:00:02] [Server thread/WARN]: Using an unsupported plugin API version',
      '[10:00:41] [Server thread/INFO]: Done (40.8s)! For help, type "help"',
      '[11:14:10] [Server thread/INFO]: Alex joined the game',
      '[11:52:44] [Server thread/ERROR]: Could not pass event PlayerMoveEvent to FixturePlugin',
    ] : ['[KliveGames] Re-attached to this server.'];
    ws.send(JSON.stringify({ type: 'replay', lines: replay }));
    ws.onMessage(message => {
      const text = String(message);
      state.wsSent.push(text);
      ws.send(JSON.stringify({ type: 'line', data: `> ${text}` }));
      if (text === 'list') ws.send(JSON.stringify({ type: 'line', data: `[12:00:00] [Server thread/INFO]: There are ${s.players.length} of a max of ${s.maxPlayers} players online: ${s.players.join(', ')}` }));
    });
  });

  await page.route('https://klive.dev/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'OPTIONS') { await fulfil(route, null, 204); return; }
    if (url.pathname === '/batch' && request.method() === 'POST') {
      const entries: Array<{ path?: string }> = JSON.parse(request.postData() ?? '[]');
      await fulfil(route, entries.map(e => {
        const answer = getResponse(new URL(e.path ?? '/', 'https://klive.dev'));
        return { path: e.path, status: answer.status, ok: answer.status < 300, contentType: 'application/json', body: answer.body };
      }));
      return;
    }
    state.requested.push(`${request.method()} ${url.pathname}${url.search}`);

    if (request.method() === 'GET') {
      if (url.pathname === '/KMProfiles/LoginStatus') { await route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/plain' }, body: 'SessionActive' }); return; }
      if (url.pathname === '/klivegames/files/download') {
        const path = url.searchParams.get('path') ?? '';
        const body = path.endsWith('.properties') ? 'motd=Overworld\nmax-players=20\npvp=true\n' : 'fixture bytes';
        await route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/octet-stream', 'content-length': String(Buffer.byteLength(body)) }, body });
        return;
      }
      const answer = getResponse(url);
      if (answer.text) { await route.fulfill({ status: answer.status, headers: { ...CORS, 'content-type': 'text/plain' }, body: String(answer.body) }); return; }
      await fulfil(route, answer.body, answer.status);
      return;
    }

    let body: any = null;
    try { body = JSON.parse(request.postData() ?? 'null'); } catch { body = request.postData(); }
    state.posts.push({ path: url.pathname, body });

    const deny = async () => { await fulfil(route, { error: 'Forbidden', message: 'Your profile does not have klivegames.servers.operate.' }, 403); };
    const s = find(body?.id ?? url.searchParams.get('id'));

    switch (url.pathname) {
      case '/KMProfiles/Login':
        await fulfil(route, { token: 'kms_e2e', sessionId: 'session-e2e', expiresUtc: '2027-01-01T00:00:00Z', me: mePayload({ rank: 5, name: 'Klives Fixture' }) });
        return;
      case '/klivegames/servers/start': case '/klivegames/servers/stop': case '/klivegames/servers/restart': case '/klivegames/servers/kill': {
        if (scenario === 'viewer') { await deny(); return; }
        if (!s) { await fulfil(route, { success: false, error: 'Server not found.' }, 404); return; }
        const op = url.pathname.split('/').pop();
        // KliveGames.EnsurePortsAvailableAsync's refusal, as KliveGamesRoutes.StatusFor answers it (409).
        if (op === 'start' && s.id === 'mc-mod') { await fulfil(route, { success: false, error: "Port 25567/TCP is already in use, so 'Modpack' was not started." }, 409); return; }
        if (op === 'start' || op === 'restart') { s.status = 'Running'; s.runningSinceUtc = new Date().toISOString(); s.lastStartedUtc = s.runningSinceUtc; s.lastError = null; record(s.id, 'starting', 'Started by Klives Fixture.'); }
        else { s.status = 'Stopped'; s.players = []; s.runningSinceUtc = null; s.lastStoppedUtc = new Date().toISOString(); record(s.id, op === 'kill' ? 'killed' : 'stopped', op === 'kill' ? 'Force-killed by Klives Fixture.' : 'Stopped by Klives Fixture: shut down in 4 s.'); }
        await fulfil(route, { success: true });
        return;
      }
      case '/klivegames/servers/delete': {
        const at = servers.findIndex(x => x.id === body?.id);
        if (at >= 0) servers.splice(at, 1);
        await fulfil(route, { success: true });
        return;
      }
      case '/klivegames/servers/command':
        await fulfil(route, { success: true });
        return;
      case '/klivegames/players/action':
        await fulfil(route, { success: true, command: `${body.action === 'whitelist-add' ? 'whitelist add' : body.action} ${body.player}` });
        return;
      case '/klivegames/backups/create': {
        if (!s) { await fulfil(route, { success: false, error: 'Server not found.' }, 404); return; }
        const job = { operation: 'backup', reason: 'manual', actor: 'Klives Fixture', restoreFrom: null, startedUtc: new Date().toISOString(), finishedUtc: null, stage: 'zipping', filesTotal: 3812, filesDone: 1400, filesSkipped: 0, bytesTotal: 1_240_000_000, bytesDone: 460_000_000, error: null, note: null, backupId: null, sizeBytes: null, safetyId: null };
        s.job = job;
        // It finishes a moment later, as the real one does in the background.
        setTimeout(() => {
          const id = `backup-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}.zip`;
          s.backups.unshift({ Id: id, SizeBytes: 1_100_000_000, CreatedUtc: new Date().toISOString(), Kind: 'manual' });
          s.job = { ...job, stage: 'done', finishedUtc: new Date().toISOString(), filesDone: 3812, bytesDone: 1_240_000_000, backupId: id, sizeBytes: 1_100_000_000 };
          record(s.id, 'backup-created', 'Backup: 1.0 GB in 41 s.', { bytes: 1_100_000_000 });
        }, 2500);
        await fulfil(route, body?.background ? { success: true, started: true, job } : { success: true, backup: { Id: 'x', SizeBytes: 1, CreatedUtc: new Date().toISOString() } });
        return;
      }
      case '/klivegames/backups/restore':
        if (s && live(s)) { await fulfil(route, { success: false, error: 'Stop the server before restoring a backup.' }, 409); return; }
        if (s) { record(s.id, 'backup-restored', `Restored ${body.backupId}.`); if (body.safety) s.backups.unshift({ Id: 'before-restore-20261113-120000.zip', SizeBytes: 900_000, CreatedUtc: new Date().toISOString(), Kind: 'safety' }); }
        await fulfil(route, { success: true, started: true, job: { operation: 'restore', stage: 'safety', startedUtc: new Date().toISOString(), finishedUtc: null, filesTotal: 1, filesDone: 0, bytesTotal: 0, bytesDone: 0, restoreFrom: body.backupId } });
        return;
      case '/klivegames/backups/delete':
        if (s) s.backups = s.backups.filter(b => b.Id !== body.backupId);
        await fulfil(route, { success: true });
        return;
      case '/klivegames/config/set': {
        if (!s) { await fulfil(route, { success: false, error: 'Server not found.' }, 404); return; }
        const changed: string[] = [];
        Object.keys(body.values ?? {}).forEach(k => { if (s.config[k] !== body.values[k]) { s.config[k] = body.values[k]; changed.push(k); } });
        if (typeof body.backupEveryHours === 'number') { if (s.everyHours !== body.backupEveryHours) changed.push('backup schedule'); s.everyHours = body.backupEveryHours; }
        if (typeof body.backupKeep === 'number') s.keep = body.backupKeep;
        if (typeof body.ram === 'number' && body.ram !== s.ramMb) { s.ramMb = body.ram; changed.push('memory'); }
        if (typeof body.name === 'string' && body.name.trim()) s.name = body.name.trim();
        await fulfil(route, { success: true, changed });
        return;
      }
      case '/klivegames/network/setpublic':
        if (s) s.isPublic = !!body.public;
        await fulfil(route, { success: true, message: body.public ? `Server is public at klive.dev:${s?.port}.` : 'This server is now local-only.', joinAddress: body.public ? `klive.dev:${s?.port}` : null });
        return;
      case '/klivegames/servers/create': {
        const id = `new${servers.length}`;
        const made = mk({ id, name: body.name, gameType: body.gameType, flavor: body.flavor, version: body.version, port: body.port || 7778, status: 'Provisioning', lastStartedUtc: null, lastStoppedUtc: null, everyHours: body.backupEveryHours ?? 0, createdUtc: new Date().toISOString(), storage: null });
        servers.push(made);
        record(id, 'created', `Deployed ${body.gameType} ${body.flavor} ${body.version}.`);
        await fulfil(route, { success: true, server: { Id: id, Name: body.name } });
        return;
      }
      default:
        await fulfil(route, { success: true });
    }
  });

  return state;
}

export async function openGames(page: Page, options: GamesMockOptions & { path?: string } = {}): Promise<GamesApiMock> {
  const api = await installGamesApiMock(page, options);
  await page.context().addCookies([{ name: 'password', value: 'e2e-klives', url: gamesTestOrigin }]);
  await page.addInitScript(() => { window.localStorage.setItem('vnavCollapsed', '0'); });
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(options.path ?? '/klivegames', { waitUntil: 'domcontentloaded', timeout: 20_000 });
      await page.getByTestId('kgx-root').waitFor({ state: 'visible', timeout: 20_000 });
      break;
    } catch (error) {
      if (attempt >= 2) throw error;
      await page.waitForTimeout(3_000 * (attempt + 1));
    }
  }
  return api;
}
