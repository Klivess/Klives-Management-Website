/*
 * KliveGames page rules: the shape of a server as the page uses it, game and status metadata, formatting,
 * and what needs attention. Pure functions only (no Vue, no fetch), so they read the same in the page,
 * the composable and the e2e fixture.
 *
 * Two server generations feed the same model:
 *  - /klivegames/overview (Nov 2026): camelCase, with backups, storage, network, players, sparkline, history.
 *  - /klivegames/servers (before): the PascalCase instance record only. `fromLegacy` fills what it can and
 *    leaves the rest null, and the page hides what it cannot know rather than showing zeros.
 *
 * Names are prefixed `kg` on purpose: Nuxt auto-imports every composable export (fmtBytes, tone,
 * statusTone, toast, …) into every file, and a local of the same name can collide with that.
 */

import { commandScore, fmtDuration, fmtInt, isNum, toMs } from '~/scripts/adminConsole';

export { commandScore, fmtInt, isNum, toMs };

// ───────────────────────────── types ─────────────────────────────

export type KgTone = 'ok' | 'warn' | 'crit' | 'info' | 'neutral';
export type KgStatus = 'Stopped' | 'Provisioning' | 'Starting' | 'Running' | 'Stopping' | 'Crashed' | 'Stalled' | string;
export type KgPortState = 'forwarded' | 'missing' | 'elsewhere' | 'no-upnp' | 'unknown' | 'local';

export interface KgSpark { t0: number; stepSeconds: number; cpu: (number | null)[]; ramMb: (number | null)[]; players: (number | null)[] }

export interface KgJob {
  operation: 'backup' | 'restore' | string;
  reason: string;
  actor: string | null;
  restoreFrom: string | null;
  startedUtc: string;
  finishedUtc: string | null;
  stage: string;
  filesTotal: number;
  filesDone: number;
  filesSkipped: number;
  bytesTotal: number;
  bytesDone: number;
  error: string | null;
  note: string | null;
  backupId: string | null;
  sizeBytes: number | null;
  safetyId: string | null;
}

export interface KgActivity {
  atUtc: string;
  serverId: string;
  kind: string;
  text: string;
  actor?: string | null;
  player?: string | null;
  exitCode?: number | null;
  seconds?: number | null;
  bytes?: number | null;
}

export interface KgPort { port: number; protocol: string; purpose: string; state: KgPortState }

export interface KgServer {
  id: string;
  name: string;
  gameType: string;
  flavor: string;
  version: string;
  flavorBuild: number | null;
  loaderVersion: string | null;
  javaMajor: number | null;
  port: number;
  protocol: string;
  ramMb: number;
  usesMemoryLimit: boolean;
  useAikarFlags: boolean;
  autoStart: boolean;
  autoRestart: boolean;
  isPublic: boolean;
  status: KgStatus;
  adopted: boolean;
  consoleAttached: boolean | null;
  onlinePlayers: string[];
  maxPlayers: number;
  cpuPercent: number;
  ramUsedBytes: number;
  createdUtc: string | null;
  runningSinceUtc: string | null;
  lastStartedUtc: string | null;
  lastStoppedUtc: string | null;
  lastExitCode: number | null;
  lastStartupSeconds: number | null;
  lastError: string | null;
  lastErrorAt: string | null;
  lastErrorApprox: boolean;
  lastCrashUtc: string | null;
  crashes7d: number | null;
  supportedPlayerActions: string[];
  backups: {
    count: number | null;
    bytes: number | null;
    lastUtc: string | null;
    lastKind: string | null;
    everyHours: number | null;
    keep: number | null;
    nextDueUtc: string | null;
    job: KgJob | null;
  };
  storage: { serverBytes: number; files: number; backupBytes: number; measuredUtc: string } | null;
  network: { joinAddress: string | null; lanAddress: string | null; ports: KgPort[] };
  players: { online: number; max: number; known: number | null; lastSeenUtc: string | null; peak24h: number | null };
  spark: KgSpark | null;
  lastActivity: KgActivity | null;
  /** True when this came from the pre-overview server (fields above that it can't know are null). */
  legacy: boolean;
}

export interface KgHost {
  cores: number | null;
  cpuPercent: number | null;
  ramTotalMb: number | null;
  ramUsedMb: number | null;
  gamesRamUsedMb: number | null;
  gamesRamReservedMb: number | null;
  drive: { name: string; totalBytes: number; freeBytes: number } | null;
}

export interface KgUpnp { available: boolean; error: string | null; asOfUtc: string | null; localIp: string | null }

export interface KgOverview { servers: KgServer[]; host: KgHost | null; upnp: KgUpnp | null; activity: KgActivity[]; legacy: boolean }

export interface KgKnownPlayer { name: string; online: boolean; firstSeenUtc: string | null; lastSeenUtc: string | null; joins: number; playedSeconds: number }

export interface KgBackup { Id: string; SizeBytes: number; CreatedUtc: string; Kind?: string }

export interface KgConfigField { Key: string; Label: string; Type: 'Text' | 'Number' | 'Boolean' | 'Dropdown' | string; Description?: string | null; Options?: string[]; Category?: string; Value?: string | null }

export interface KgFileEntry { Name: string; Path: string; IsDirectory: boolean; Size: number; ModifiedUtc: string }

export interface KgGameInfo {
  gameType: string;
  displayName: string;
  implemented: boolean;
  protocol: string;
  defaultPort: number;
  flavors: string[];
  requiresEula: boolean;
  usesMemoryLimit: boolean;
  supportedPlayerActions: string[];
  deployOptions: KgConfigField[];
}

export type KgRailFilter = 'all' | 'live' | 'attention';

export interface KgCommand { id: string; group: string; title: string; keywords?: string; icon: string; hint?: string; disabled?: boolean; run: () => void }

export interface KgChartRow { label: string; values: (number | null)[]; tone: string; format: (v: number | null | undefined) => string; max?: number; limit?: number | null }

export interface KgVersion { Version: string; Type?: string; LatestBuild?: number | null; LatestLoaderVersion?: string | null; RecommendedJavaMajor?: number | null }

// ───────────────────────────── normalising ─────────────────────────────

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number | null => (isNum(v) ? v : null);

function portsFor(gameType: string, port: number, isPublic: boolean): KgPort[] {
  const state: KgPortState = isPublic ? 'unknown' : 'local';
  if (gameType === 'Rust') {
    return [
      { port, protocol: 'UDP', purpose: 'Game', state },
      { port: port + 1, protocol: 'UDP', purpose: 'Server browser', state },
    ];
  }
  return [{ port, protocol: 'TCP', purpose: 'Game', state }];
}

/** A row of /klivegames/overview. */
export function fromOverview(raw: any): KgServer {
  const gameType = String(raw?.gameType ?? 'Minecraft');
  const port = Number(raw?.port ?? 0);
  const isPublic = !!raw?.isPublic;
  const b = raw?.backups ?? {};
  const n = raw?.network ?? {};
  const p = raw?.players ?? {};
  return {
    id: String(raw?.id ?? ''),
    name: String(raw?.name ?? ''),
    gameType,
    flavor: String(raw?.flavor ?? ''),
    version: String(raw?.version ?? ''),
    flavorBuild: num(raw?.flavorBuild),
    loaderVersion: str(raw?.loaderVersion),
    javaMajor: num(raw?.javaMajor),
    port,
    protocol: String(raw?.protocol ?? (gameType === 'Rust' ? 'UDP' : 'TCP')),
    ramMb: Number(raw?.ramMb ?? 0),
    usesMemoryLimit: raw?.usesMemoryLimit !== false,
    useAikarFlags: !!raw?.useAikarFlags,
    autoStart: !!raw?.autoStart,
    autoRestart: raw?.autoRestart !== false,
    isPublic,
    status: String(raw?.status ?? 'Stopped'),
    adopted: !!raw?.adopted,
    consoleAttached: typeof raw?.consoleAttached === 'boolean' ? raw.consoleAttached : null,
    onlinePlayers: Array.isArray(raw?.onlinePlayers) ? raw.onlinePlayers.map(String) : [],
    maxPlayers: Number(raw?.maxPlayers ?? 0),
    cpuPercent: Number(raw?.cpuPercent ?? 0),
    ramUsedBytes: Number(raw?.ramUsedBytes ?? 0),
    createdUtc: str(raw?.createdUtc),
    runningSinceUtc: str(raw?.runningSinceUtc),
    lastStartedUtc: str(raw?.lastStartedUtc),
    lastStoppedUtc: str(raw?.lastStoppedUtc),
    lastExitCode: num(raw?.lastExitCode),
    lastStartupSeconds: num(raw?.lastStartupSeconds),
    lastError: str(raw?.lastError),
    lastErrorAt: str(raw?.lastErrorAt),
    lastErrorApprox: !!raw?.lastErrorApprox,
    lastCrashUtc: str(raw?.lastCrashUtc),
    crashes7d: num(raw?.crashes7d),
    supportedPlayerActions: Array.isArray(raw?.supportedPlayerActions) ? raw.supportedPlayerActions.map(String) : [],
    backups: {
      count: num(b.count),
      bytes: num(b.bytes),
      lastUtc: str(b.lastUtc),
      lastKind: str(b.lastKind),
      everyHours: num(b.everyHours),
      keep: num(b.keep),
      nextDueUtc: str(b.nextDueUtc),
      job: b.job ?? null,
    },
    storage: raw?.storage ?? null,
    network: {
      joinAddress: str(n.joinAddress),
      lanAddress: str(n.lanAddress),
      ports: Array.isArray(n.ports) && n.ports.length ? n.ports : portsFor(gameType, port, isPublic),
    },
    players: {
      online: Number(p.online ?? (raw?.onlinePlayers?.length ?? 0)),
      max: Number(p.max ?? raw?.maxPlayers ?? 0),
      known: num(p.known),
      lastSeenUtc: str(p.lastSeenUtc),
      peak24h: num(p.peak24h),
    },
    spark: raw?.spark ?? null,
    lastActivity: raw?.lastActivity ?? null,
    legacy: false,
  };
}

/** A GameServerInstance from /klivegames/servers (servers older than the overview route). */
export function fromLegacy(raw: any): KgServer {
  const gameType = String(raw?.GameType ?? 'Minecraft');
  const port = Number(raw?.Port ?? 0);
  const isPublic = !!raw?.Public;
  const players: string[] = Array.isArray(raw?.OnlinePlayers) ? raw.OnlinePlayers.map(String) : [];
  return {
    id: String(raw?.Id ?? ''),
    name: String(raw?.Name ?? ''),
    gameType,
    flavor: String(raw?.Flavor ?? ''),
    version: String(raw?.Version ?? ''),
    flavorBuild: num(raw?.FlavorBuild),
    loaderVersion: str(raw?.LoaderVersion),
    javaMajor: gameType === 'Minecraft' ? num(raw?.JavaMajor) : null,
    port,
    protocol: gameType === 'Rust' ? 'UDP' : 'TCP',
    ramMb: Number(raw?.RamMb ?? 0),
    usesMemoryLimit: gameType === 'Minecraft',
    useAikarFlags: !!raw?.UseAikarFlags,
    autoStart: !!raw?.AutoStart,
    autoRestart: raw?.AutoRestart !== false,
    isPublic,
    status: String(raw?.Status ?? 'Stopped'),
    adopted: !!raw?.Adopted,
    consoleAttached: null,
    onlinePlayers: players,
    maxPlayers: Number(raw?.MaxPlayers ?? 0),
    cpuPercent: Number(raw?.CpuPercent ?? 0),
    ramUsedBytes: Number(raw?.RamUsedBytes ?? 0),
    createdUtc: str(raw?.CreatedUtc),
    runningSinceUtc: str(raw?.RunningSinceUtc),
    lastStartedUtc: str(raw?.LastStartedUtc),
    lastStoppedUtc: null,
    lastExitCode: null,
    lastStartupSeconds: null,
    lastError: str(raw?.LastError),
    lastErrorAt: str(raw?.LastError) ? str(raw?.LastStartedUtc) ?? str(raw?.CreatedUtc) : null,
    lastErrorApprox: !!str(raw?.LastError),
    lastCrashUtc: null,
    crashes7d: null,
    supportedPlayerActions: [],
    backups: { count: null, bytes: null, lastUtc: null, lastKind: null, everyHours: null, keep: null, nextDueUtc: null, job: null },
    storage: null,
    network: { joinAddress: isPublic ? (str(raw?.PublicJoinAddress) ?? `klive.dev:${port}`) : null, lanAddress: null, ports: portsFor(gameType, port, isPublic) },
    players: { online: players.length, max: Number(raw?.MaxPlayers ?? 0), known: null, lastSeenUtc: null, peak24h: null },
    spark: null,
    lastActivity: null,
    legacy: true,
  };
}

// ───────────────────────────── games ─────────────────────────────

export interface KgGameMeta {
  label: string;
  short: string;
  glyph: 'cube' | 'tree' | 'hex';
  accent: string;
  /** Console shortcuts, in the order they are most often wanted. */
  quick: { label: string; command: string; hint: string; danger?: boolean }[];
  /** What to type to see who is on, shown when the roster cannot be read. */
  listCommand: string | null;
}

export const KG_GAMES: Record<string, KgGameMeta> = {
  Minecraft: {
    label: 'Minecraft',
    short: 'MC',
    glyph: 'cube',
    accent: '#7fc75a',
    listCommand: 'list',
    quick: [
      { label: 'list', command: 'list', hint: 'Who is online' },
      { label: 'save-all', command: 'save-all flush', hint: 'Write the world to disk now' },
      { label: 'say', command: 'say ', hint: 'Broadcast a message' },
      { label: 'day', command: 'time set day', hint: 'Set the time to morning' },
      { label: 'clear weather', command: 'weather clear', hint: 'Stop rain and thunder' },
      { label: 'tps', command: 'tps', hint: 'Ticks per second (Paper)' },
      { label: 'whitelist', command: 'whitelist list', hint: 'Who may join' },
    ],
  },
  Terraria: {
    label: 'Terraria',
    short: 'TR',
    glyph: 'tree',
    accent: '#5fb8ea',
    listCommand: 'playing',
    quick: [
      { label: 'playing', command: 'playing', hint: 'Who is online' },
      { label: 'save', command: 'save', hint: 'Save the world' },
      { label: 'say', command: 'say ', hint: 'Broadcast a message' },
      { label: 'dawn', command: 'dawn', hint: 'Set the time to dawn' },
      { label: 'time', command: 'time', hint: 'Current in-game time' },
      { label: 'settle', command: 'settle', hint: 'Settle all water' },
    ],
  },
  Rust: {
    label: 'Rust',
    short: 'RS',
    glyph: 'hex',
    accent: '#e68a4f',
    listCommand: 'status',
    quick: [
      { label: 'status', command: 'status', hint: 'Players and server state' },
      { label: 'save', command: 'server.save', hint: 'Save the world now' },
      { label: 'say', command: 'say ', hint: 'Broadcast a message' },
      { label: 'fps', command: 'fps', hint: 'Server frame rate' },
      { label: 'ent count', command: 'entity.count', hint: 'How many entities exist' },
    ],
  },
};

export function kgGame(gameType: string): KgGameMeta {
  return KG_GAMES[gameType] ?? { label: gameType, short: gameType.slice(0, 2).toUpperCase(), glyph: 'cube', accent: '#9aa6b2', quick: [], listCommand: null };
}

/** "Paper 1.21.11" · "Fabric 26.2 (loader 0.19.3)" · "Rust" (Rust's version is always "Latest"). */
export function kgBuildLine(s: Pick<KgServer, 'gameType' | 'flavor' | 'version' | 'loaderVersion' | 'flavorBuild'>): string {
  if (s.gameType === 'Rust') return s.version && s.version !== 'Latest' ? `Build ${s.version}` : 'Latest build';
  const flavor = s.flavor === 'TModLoader' ? 'tModLoader' : s.flavor;
  const base = `${flavor} ${s.version}`.trim();
  if (s.flavor === 'Paper' && s.flavorBuild) return `${base} · build ${s.flavorBuild}`;
  if ((s.flavor === 'Fabric' || s.flavor === 'Forge') && s.loaderVersion) return `${base} · loader ${s.loaderVersion}`;
  return base;
}

// ───────────────────────────── status ─────────────────────────────

export interface KgStatusMeta { label: string; tone: KgTone; busy: boolean; live: boolean }

export function kgStatus(status: KgStatus): KgStatusMeta {
  switch (status) {
    case 'Running': return { label: 'Running', tone: 'ok', busy: false, live: true };
    case 'Starting': return { label: 'Starting', tone: 'info', busy: true, live: true };
    case 'Provisioning': return { label: 'Installing', tone: 'info', busy: true, live: false };
    case 'Stopping': return { label: 'Stopping', tone: 'warn', busy: true, live: true };
    case 'Stalled': return { label: 'Stalled', tone: 'warn', busy: false, live: true };
    case 'Crashed': return { label: 'Crashed', tone: 'crit', busy: false, live: false };
    case 'Stopped': return { label: 'Stopped', tone: 'neutral', busy: false, live: false };
    default: return { label: status, tone: 'neutral', busy: false, live: false };
  }
}

/** What the lifecycle buttons may do in this state. */
export function kgCan(s: Pick<KgServer, 'status'>) {
  const st = s.status;
  const live = ['Running', 'Starting', 'Stalled', 'Stopping'].includes(st);
  return {
    start: st === 'Stopped' || st === 'Crashed',
    stop: st === 'Running' || st === 'Starting' || st === 'Stalled',
    restart: st === 'Running' || st === 'Stalled',
    kill: live,
    restore: st === 'Stopped' || st === 'Crashed',
    live,
  };
}

/** Order in the server list: what needs a look first, then what is running, then the rest by name. */
export function kgRank(s: KgServer): number {
  if (s.status === 'Crashed' || s.status === 'Stalled') return 0;
  if (kgStatus(s.status).busy) return 1;
  if (s.status === 'Running') return 2;
  return 3;
}

export function kgSortServers(list: KgServer[]): KgServer[] {
  return [...list].sort((a, b) => kgRank(a) - kgRank(b) || a.name.localeCompare(b.name) || a.gameType.localeCompare(b.gameType));
}

// ───────────────────────────── formatting ─────────────────────────────

export const KG_NONE = '—';

export function kgBytes(bytes: unknown, digits = 1): string {
  if (!isNum(bytes) || bytes < 0) return KG_NONE;
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(digits)} ${units[unit]}`;
}

export function kgMb(mb: unknown): string {
  if (!isNum(mb)) return KG_NONE;
  return mb >= 1024 ? `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB` : `${Math.round(mb)} MB`;
}

export function kgDuration(seconds: unknown): string {
  return fmtDuration(seconds);
}

/** "just now" · "12m ago" · "3d ago" · "4 months ago" · "in 2h". */
export function kgAgo(value: unknown, now: number): string {
  const at = toMs(value);
  if (at == null) return KG_NONE;
  const delta = (now - at) / 1000;
  if (Math.abs(delta) < 45) return 'just now';
  if (delta < 0) return `in ${fmtDuration(-delta)}`;
  const days = delta / 86_400;
  if (days >= 60) return `${Math.round(days / 30.4)} months ago`;
  if (days >= 14) return `${Math.round(days / 7)} weeks ago`;
  return `${fmtDuration(delta)} ago`;
}

export function kgWhen(value: unknown): string {
  const at = toMs(value);
  if (at == null) return KG_NONE;
  const d = new Date(at);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString([], { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function kgPct(value: unknown, digits = 0): string {
  return isNum(value) ? `${value.toFixed(digits)}%` : KG_NONE;
}

export function kgEvery(hours: number | null | undefined): string {
  if (!hours) return 'Off';
  if (hours % 168 === 0) return hours === 168 ? 'Weekly' : `Every ${hours / 168} weeks`;
  if (hours % 24 === 0) return hours === 24 ? 'Daily' : `Every ${hours / 24} days`;
  return `Every ${hours} h`;
}

export const KG_BACKUP_EVERY = [0, 6, 12, 24, 48, 168];

// ───────────────────────────── activity ─────────────────────────────

export type KgActivityGroup = 'lifecycle' | 'players' | 'backups' | 'changes';

export const KG_ACTIVITY: Record<string, { label: string; tone: KgTone; group: KgActivityGroup; icon: string }> = {
  created: { label: 'Deployed', tone: 'info', group: 'changes', icon: 'plus' },
  provisioned: { label: 'Installed', tone: 'info', group: 'lifecycle', icon: 'check' },
  'provision-failed': { label: 'Install failed', tone: 'crit', group: 'lifecycle', icon: 'alert' },
  starting: { label: 'Starting', tone: 'info', group: 'lifecycle', icon: 'play' },
  running: { label: 'Ready', tone: 'ok', group: 'lifecycle', icon: 'check' },
  stalled: { label: 'Stalled', tone: 'warn', group: 'lifecycle', icon: 'hourglass' },
  stopped: { label: 'Stopped', tone: 'neutral', group: 'lifecycle', icon: 'stop' },
  crashed: { label: 'Crashed', tone: 'crit', group: 'lifecycle', icon: 'alert' },
  'auto-restart': { label: 'Auto-restart', tone: 'warn', group: 'lifecycle', icon: 'refresh' },
  killed: { label: 'Killed', tone: 'warn', group: 'lifecycle', icon: 'x' },
  'start-failed': { label: 'Did not start', tone: 'crit', group: 'lifecycle', icon: 'alert' },
  adopted: { label: 'Re-attached', tone: 'info', group: 'lifecycle', icon: 'link' },
  'player-join': { label: 'Joined', tone: 'ok', group: 'players', icon: 'user' },
  'player-leave': { label: 'Left', tone: 'neutral', group: 'players', icon: 'user' },
  'player-action': { label: 'Player action', tone: 'info', group: 'players', icon: 'user' },
  'backup-created': { label: 'Backed up', tone: 'ok', group: 'backups', icon: 'archive' },
  'backup-failed': { label: 'Backup failed', tone: 'crit', group: 'backups', icon: 'alert' },
  'backup-restored': { label: 'Restored', tone: 'warn', group: 'backups', icon: 'history' },
  'backup-deleted': { label: 'Backup deleted', tone: 'neutral', group: 'backups', icon: 'trash' },
  'backup-pruned': { label: 'Old backups removed', tone: 'neutral', group: 'backups', icon: 'trash' },
  'config-changed': { label: 'Settings changed', tone: 'info', group: 'changes', icon: 'sliders' },
  'public-changed': { label: 'Network', tone: 'info', group: 'changes', icon: 'globe' },
  'forward-restored': { label: 'Forward restored', tone: 'warn', group: 'changes', icon: 'globe' },
  renamed: { label: 'Renamed', tone: 'info', group: 'changes', icon: 'pen' },
};

export function kgActivityMeta(kind: string) {
  return KG_ACTIVITY[kind] ?? { label: kind, tone: 'neutral' as KgTone, group: 'changes' as KgActivityGroup, icon: 'dot' };
}

// ───────────────────────────── console ─────────────────────────────

export type KgLineKind = 'err' | 'warn' | 'cmd' | 'sys' | 'join' | 'plain';

export function kgLineKind(line: string): KgLineKind {
  if (line.startsWith('> ')) return 'cmd';
  if (line.startsWith('[KliveGames]') || line.startsWith('[provision]') || line.startsWith('[RCON]')) return 'sys';
  if (/\b(ERROR|SEVERE|FATAL)\b|Exception|\bfailed\b|\bcrash/i.test(line)) return 'err';
  if (/\bWARN(ING)?\b/i.test(line)) return 'warn';
  if (/ joined the game| has joined| left the game| has left|logged in with entity/i.test(line)) return 'join';
  return 'plain';
}

/** Splits "[12:01:44] [Server thread/INFO]: Done (4.1s)!" into its stamp and the rest, for dimming. */
export function kgSplitStamp(line: string): { stamp: string; rest: string } {
  const m = /^(\[\d{1,2}:\d{2}:\d{2}[^\]]*\]\s*(?:\[[^\]]{1,40}\]:?\s*)?)/.exec(line);
  return m ? { stamp: m[1], rest: line.slice(m[1].length) } : { stamp: '', rest: line };
}

// ───────────────────────────── files ─────────────────────────────

const KG_TEXT_EXT = ['.txt', '.properties', '.json', '.json5', '.yml', '.yaml', '.conf', '.cfg', '.log', '.toml', '.sh', '.bat', '.cmd', '.mcmeta', '.md', '.ini', '.xml', '.csv', '.lua', '.js', '.ts', '.cs', '.secret', '.env'];

export function kgIsText(name: string): boolean {
  const lower = name.toLowerCase();
  return KG_TEXT_EXT.some(ext => lower.endsWith(ext)) || lower === 'eula.txt' || !lower.includes('.');
}

export function kgFileIcon(entry: Pick<KgFileEntry, 'Name' | 'IsDirectory'>): string {
  if (entry.IsDirectory) return 'folder';
  const lower = entry.Name.toLowerCase();
  if (/\.(jar|exe|dll|so)$/.test(lower)) return 'cpu';
  if (/\.(zip|gz|tar|7z|rar|mca|dat|wld|map|sav)$/.test(lower)) return 'archive';
  if (/\.(png|jpe?g|gif|webp)$/.test(lower)) return 'image';
  return 'file';
}

// ───────────────────────────── attention ─────────────────────────────

export interface KgIssue {
  id: string;
  serverId: string | null;
  tone: KgTone;
  title: string;
  detail: string;
  /** What the page offers to do about it. */
  fix?: { label: string; action: 'open' | 'start' | 'console' | 'backups' | 'settings' | 'network' | 'schedule-all' };
}

const DAY_MS = 86_400_000;

/**
 * What needs a look, worst first. Each rule traces to something seen live on 13 Nov 2026: 6 of 7 servers never
 * backed up; 7 public servers with no forward on the router; a crash from June shown with no date.
 */
export function kgIssues(servers: KgServer[], host: KgHost | null, upnp: KgUpnp | null, now: number): KgIssue[] {
  const issues: KgIssue[] = [];
  const nameOf = (s: KgServer) => (servers.filter(o => o.name === s.name).length > 1 ? `${s.name} (${kgGame(s.gameType).label})` : s.name);

  for (const s of servers) {
    const name = nameOf(s);
    if (s.status === 'Crashed') {
      const when = s.lastErrorAt ? `${s.lastErrorApprox ? 'around ' : ''}${kgAgo(s.lastErrorAt, now)}` : null;
      issues.push({
        id: `crashed:${s.id}`, serverId: s.id, tone: 'crit', title: `${name} crashed`,
        detail: [s.lastError ?? 'It stopped unexpectedly.', when].filter(Boolean).join(' · '),
        fix: { label: 'Open console', action: 'console' },
      });
    }
    if (s.status === 'Stalled') {
      issues.push({ id: `stalled:${s.id}`, serverId: s.id, tone: 'warn', title: `${name} has stalled while starting`, detail: 'No console output for a few minutes. It may still finish loading.', fix: { label: 'Open console', action: 'console' } });
    }
    if ((s.crashes7d ?? 0) >= 3) {
      issues.push({ id: `crashloop:${s.id}`, serverId: s.id, tone: 'crit', title: `${name} crashed ${s.crashes7d} times this week`, detail: 'Check its console and recent activity for the cause.', fix: { label: 'Open', action: 'open' } });
    }
    if (s.isPublic && kgCan(s).live) {
      const missing = s.network.ports.filter(p => p.state === 'missing');
      const elsewhere = s.network.ports.filter(p => p.state === 'elsewhere');
      if (missing.length) {
        issues.push({ id: `fwd:${s.id}`, serverId: s.id, tone: 'crit', title: `${name} is public but the router isn't forwarding it`, detail: `${missing.map(p => `${p.protocol} ${p.port}`).join(', ')} has no forward, so players outside the house can't join.`, fix: { label: 'Network', action: 'network' } });
      }
      if (elsewhere.length) {
        issues.push({ id: `fwd-else:${s.id}`, serverId: s.id, tone: 'crit', title: `${name}'s port is forwarded to another machine`, detail: `${elsewhere.map(p => `${p.protocol} ${p.port}`).join(', ')} points somewhere else on the network.`, fix: { label: 'Network', action: 'network' } });
      }
    }
    if (s.adopted && s.consoleAttached === false) {
      issues.push({ id: `adopted:${s.id}`, serverId: s.id, tone: 'warn', title: `${name} has no console`, detail: 'Re-attached after an Omnipotent restart: it keeps running, but commands and the player list need a restart.' });
    }
    const job = s.backups.job;
    if (job && job.stage === 'failed' && job.finishedUtc && now - (toMs(job.finishedUtc) ?? 0) < 10 * 60_000) {
      issues.push({ id: `jobfail:${s.id}`, serverId: s.id, tone: 'crit', title: `${job.operation === 'restore' ? 'Restore' : 'Backup'} of ${name} failed`, detail: job.error ?? 'See its activity.', fix: { label: 'Backups', action: 'backups' } });
    }
    if (s.status === 'Running' && s.usesMemoryLimit && s.ramMb > 0 && s.ramUsedBytes > s.ramMb * 1048576 * 1.12) {
      issues.push({ id: `ram:${s.id}`, serverId: s.id, tone: 'warn', title: `${name} is using more memory than it was given`, detail: `${kgBytes(s.ramUsedBytes)} against a ${kgMb(s.ramMb)} heap: the JVM's own overhead, or a leak.`, fix: { label: 'Settings', action: 'settings' } });
    }
  }

  // Backups: knowable only from a server that reports them.
  const known = servers.filter(s => s.backups.count != null && s.status !== 'Provisioning');
  const never = known.filter(s => s.backups.count === 0 && !s.backups.everyHours);
  if (never.length) {
    issues.push({
      id: 'never-backed-up', serverId: never.length === 1 ? never[0].id : null, tone: 'warn',
      title: never.length === 1 ? `${nameOf(never[0])} has never been backed up` : `${never.length} servers have never been backed up`,
      detail: never.length === 1 ? 'Turn on scheduled backups, or take one now.' : never.map(nameOf).join(', '),
      fix: never.length === 1 ? { label: 'Backups', action: 'backups' } : { label: 'Back up daily', action: 'schedule-all' },
    });
  }
  for (const s of known) {
    if (!s.backups.lastUtc || !s.backups.count) continue;
    const age = now - (toMs(s.backups.lastUtc) ?? now);
    const playedSince = (toMs(s.lastStoppedUtc) ?? toMs(s.lastStartedUtc) ?? 0) > (toMs(s.backups.lastUtc) ?? 0) || s.status === 'Running';
    if (!s.backups.everyHours && playedSince && age > 7 * DAY_MS) {
      issues.push({ id: `stale-backup:${s.id}`, serverId: s.id, tone: 'warn', title: `${nameOf(s)} has changed since its last backup ${kgAgo(s.backups.lastUtc, now)}`, detail: 'No schedule is set for it.', fix: { label: 'Backups', action: 'backups' } });
    }
  }

  if (host?.drive && host.drive.totalBytes > 0 && host.drive.freeBytes / host.drive.totalBytes < 0.08) {
    issues.push({ id: 'disk', serverId: null, tone: 'crit', title: `The game drive (${host.drive.name}) is nearly full`, detail: `${kgBytes(host.drive.freeBytes)} free of ${kgBytes(host.drive.totalBytes)}. Worlds and backups will fail to save.` });
  }
  if (upnp && !upnp.available && servers.some(s => s.isPublic && kgCan(s).live)) {
    issues.push({ id: 'upnp', serverId: null, tone: 'warn', title: 'No UPnP router found', detail: upnp.error ?? 'Public servers need their ports forwarded on the router by hand.' });
  }

  const order: Record<KgTone, number> = { crit: 0, warn: 1, info: 2, ok: 3, neutral: 4 };
  return issues.sort((a, b) => order[a.tone] - order[b.tone]);
}

// ───────────────────────────── memory headroom ─────────────────────────────

/** What a new or bigger heap leaves the host: used RAM now plus the extra this asks for. */
export function kgHeadroom(host: KgHost | null, extraMb: number): { freeAfterMb: number | null; tone: KgTone; text: string } {
  if (!host || !isNum(host.ramTotalMb) || !isNum(host.ramUsedMb)) return { freeAfterMb: null, tone: 'neutral', text: '' };
  const freeAfter = host.ramTotalMb - host.ramUsedMb - extraMb;
  const tone: KgTone = freeAfter < 1024 ? 'crit' : freeAfter < 2048 ? 'warn' : 'ok';
  const text = freeAfter < 0
    ? `${kgMb(-freeAfter)} more than the server has free`
    : `leaves ${kgMb(freeAfter)} of ${kgMb(host.ramTotalMb)} free`;
  return { freeAfterMb: freeAfter, tone, text };
}

// ───────────────────────────── sparkline ─────────────────────────────

/** Points 0..1 for an SVG polyline; nulls break the line. */
export function kgSparkPath(values: (number | null)[], width: number, height: number, max?: number): string {
  if (!values.length) return '';
  const top = max ?? Math.max(1, ...values.filter((v): v is number => isNum(v)));
  const step = values.length > 1 ? width / (values.length - 1) : width;
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (!isNum(v)) { pen = false; return; }
    const x = (i * step).toFixed(1);
    const y = (height - Math.min(1, v / top) * height).toFixed(1);
    d += `${pen ? 'L' : 'M'}${x} ${y} `;
    pen = true;
  });
  return d.trim();
}

/** The newest real value of a series, or null. */
export function kgLast(values: (number | null)[] | undefined): number | null {
  if (!values) return null;
  for (let i = values.length - 1; i >= 0; i--) if (isNum(values[i])) return values[i] as number;
  return null;
}

// ───────────────────────────── errors ─────────────────────────────

/** A route's answer as a sentence: the server's own `error` when it gave one. */
export function kgErrorText(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.error === 'string' && parsed.error) return parsed.error;
    if (parsed && typeof parsed.message === 'string' && parsed.message) return parsed.message;
  } catch { /* not JSON */ }
  if (status === 401) return 'Your session has ended. Sign in again.';
  if (status === 403) return 'Your profile does not have permission for this.';
  if (status === 404) return body.trim() === 'Route not found' ? 'The server does not have this feature yet.' : 'Not found.';
  if (status === 0) return 'Could not reach the server.';
  return body && body.length < 200 ? body : `The server answered ${status}.`;
}
