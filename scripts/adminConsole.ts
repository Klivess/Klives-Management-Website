/**
 * The Admin console's types and pure logic: formatting, the uptime timeline, rates from running
 * totals, the "what needs attention" rules and command search. No Vue and no requests in here, so
 * every rule can be read (and reasoned about) on its own. State and polling live in
 * composables/useAdminConsole.ts.
 */

// ───────────────────────────── payloads ─────────────────────────────

export interface AdminService {
  Name: string;
  ServiceID?: string;
  IsActive: boolean;
  /** .NET TimeSpan text ("2.03:11:00.1234567"). */
  Uptime?: string;
  UptimeHumanized?: string;
  // From here on: newer servers only.
  UptimeSeconds?: number;
  Anteriority?: 'Low' | 'Standard' | 'High' | 'Critical' | string;
  /** Does its work at startup and stops by design. */
  RunsOnce?: boolean;
  ErrorsLastHour?: number;
  ErrorsRetained?: number;
  LastErrorAt?: string | null;
}

export interface AdminDisk {
  DriveName: string;
  VolumeLabel?: string;
  TotalSizeGB: number;
  FreeSpaceGB: number;
  UsedSpaceGB: number;
  UsagePercentage: number;
  DriveFormat?: string;
}

export interface AdminNetInterface {
  Name: string;
  Description?: string;
  SpeedMbps: number;
  BytesSent: number;
  BytesReceived: number;
  IsVirtual?: boolean;
}

export interface AdminBuild {
  Commit: string;
  CommitShort: string;
  Version: string;
  BuiltUtc: string;
  ProcessStartedUtc: string;
  Runtime: string;
}

export interface AdminUpdater {
  Branch: string;
  LastSeenSha: string;
  LastCheckUtc: string | null;
  LastCheckOk: boolean;
  LastError: string | null;
  PollIntervalSeconds: number;
  AutoDeploy: boolean;
  LastNewCommitUtc: string | null;
}

export interface AdminStats {
  TimeStatisticsGenerated: string;
  lastOmnipotentUpdate?: string;
  lastOmnipotentUpdateHumanized?: string;
  BotUptime?: string;
  BotUptimeHumanized?: string;
  TotalStatusLogs: number;
  TotalErrorLogs: number;
  TotalLogs: number;
  RamTotalGB: number;
  RamUsedGB: number;
  RamUsagePercentage: number;
  CpuUsagePercentage: number;
  OSVersion: string;
  MachineName: string;
  ProcessorCount: number;
  ProcessorName: string;
  ProcessMemoryMB: number;
  ProcessThreadCount: number;
  GCTotalMemoryMB: number;
  GCGen0Collections: number;
  GCGen1Collections: number;
  GCGen2Collections: number;
  DiskStatistics: AdminDisk[];
  NetworkInterfaces: AdminNetInterface[];
  TotalServicesRegistered: number;
  TotalServicesActive: number;
  Services: AdminService[];
  TotalScheduledTasks: number;
  NextTaskScheduledSummary?: string;
  // Newer servers only.
  Build?: AdminBuild | null;
  Updater?: AdminUpdater | null;
  ErrorsLastHour?: number;
  ErrorsLoggedTotal?: number;
  ApiRequestsTotal?: number;
  ApiServerErrorsTotal?: number;
}

export interface AdminUptimePeriod {
  StartTime: string;
  LastKnownUpTime: string;
  /** Short hash of the commit that ran. Newer servers, and only for periods since they began recording it. */
  Commit?: string | null;
}
export interface AdminUptime {
  TotalUptimeSeconds: number;
  AverageUptimeHours: number;
  CurrentUptimeSeconds: number;
  TotalOutageSeconds: number;
  TotalPeriods: number;
  AsOfUtc?: string;
  WindowDays?: number | null;
  Periods?: AdminUptimePeriod[] | null;
}

export interface AdminApiDay {
  date: string;
  requests: number;
  successes?: number;
  clientErrors?: number;
  serverErrors?: number;
  avgResponseMs: number;
  maxResponseMs: number;
}
export interface AdminApiRoute {
  route: string;
  method: string;
  requests: number;
  successes?: number;
  clientErrors?: number;
  serverErrors?: number;
  avgResponseMs: number;
  maxResponseMs: number;
  lastRequestAt?: string | null;
}
export interface AdminApiStats {
  lifetime: {
    totalRequests: number;
    successfulRequests: number;
    clientErrorRequests: number;
    serverErrorRequests: number;
    notFoundRequests?: number;
    unauthorizedRequests?: number;
    avgResponseMs: number;
    maxResponseMs: number;
    availabilityPct: number;
    lastRequestAt: string | null;
  };
  historyWindow?: { firstDay: string | null; lastDay: string | null; totalDays: number; recordedDays?: number };
  dailyHistory: AdminApiDay[];
  topRoutes: AdminApiRoute[];
  slowestRoutes: AdminApiRoute[];
}

/** The figures the Admin page takes from /KliveAPI/telemetry/overview: one window and the one before it. */
export interface AdminTelemetryKpi {
  count: number;
  p50: number;
  p95: number;
  p99: number;
  /** Share of requests answered 5xx, in percent. */
  errorPct: number;
  /** Share answered 4xx, in percent. */
  clientErrorPct: number;
  apdex: number;
}
export interface AdminApiWindow { kpi: AdminTelemetryKpi; prev: AdminTelemetryKpi | null }

export interface AdminLogSummary {
  GeneratedAt: string;
  WindowHours: number;
  TotalLogs: number;
  StatusCount: number;
  ErrorCount: number;
  ErrorRate: number;
  ErrorsLastHour: number;
  ErrorsLast24Hours: number;
  LatestLogAt: string | null;
  LatestErrorAt: string | null;
  /** Newer servers only: how far back the capped in-memory log actually reaches. */
  OldestLogAt?: string | null;
  Timeline: { Start: string; TotalCount: number; ErrorCount: number }[];
  TopServices: { ServiceName: string; TotalCount: number; ErrorCount: number; LastActivityAt: string }[];
  ErrorFamilies: { Label: string; Count: number; LastSeenAt: string }[];
}

export interface AdminTask {
  taskName: string;
  dateTimeDue: string;
  dateTimeSet?: string;
  agentName?: string;
  topic?: string;
  reason?: string;
  isImportant?: boolean;
}

export interface AdminPortMapping {
  Protocol: string;
  PublicPort: number;
  PrivatePort: number;
  PrivateIp: string;
  Description: string;
  LifetimeSeconds: number;
  ExpirationDate: string;
}
export interface AdminPorts {
  success: boolean;
  error?: string;
  localIp?: string;
  externalIp?: string;
  mappings: AdminPortMapping[];
  asOfUtc?: string;
}

export interface AdminBrowser { objectID: string | number; name: string; createdAt: string }

/** /GeneralBotStatistics/History: one column per metric, oldest first. Counters are running totals. */
export interface AdminHistoryPayload {
  StepSeconds: number;
  Count: number;
  T: number[];
  Cpu: number[];
  RamPct: number[];
  ProcessMB: number[];
  HeapMB: number[];
  Threads: number[];
  Gen2: number[];
  NetSent: number[];
  NetReceived: number[];
  Errors: number[];
  Requests: number[];
  ServerErrors: number[];
}

/** One reading of the vitals, from the server's history or from a live poll. */
export interface VitalSample {
  /** Unix ms. */
  t: number;
  cpu: number;
  ram: number;
  procMB: number;
  heapMB: number;
  threads: number;
  gen2: number;
  netSent: number;
  netRecv: number;
  /** Running totals; null when the server does not report them. */
  errors: number | null;
  requests: number | null;
  serverErrors: number | null;
}

// ───────────────────────────── formatting ─────────────────────────────

const DASH = '—';

export function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function fmtInt(value: unknown): string {
  return isNum(value) ? Math.round(value).toLocaleString('en-GB') : DASH;
}

/** 1,284 · 12.9K · 4.2M · 1.3B: for counts where the magnitude is the message. */
export function fmtCompact(value: unknown): string {
  if (!isNum(value)) return DASH;
  const abs = Math.abs(value);
  if (abs < 10_000) return Math.round(value).toLocaleString('en-GB');
  const units: [number, string][] = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [size, suffix] of units) {
    if (abs >= size) {
      const scaled = value / size;
      return `${scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1)}${suffix}`;
    }
  }
  return String(Math.round(value));
}

export function fmtPct(value: unknown, digits = 0): string {
  return isNum(value) ? `${value.toFixed(digits)}%` : DASH;
}

export function fmtBytes(bytes: unknown, digits = 1): string {
  if (!isNum(bytes) || bytes < 0) return DASH;
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(digits)} ${units[unit]}`;
}

/** Bytes per second as a network rate: bits, the unit link speeds are quoted in. */
export function fmtBitRate(bytesPerSecond: unknown): string {
  if (!isNum(bytesPerSecond) || bytesPerSecond < 0) return DASH;
  const bits = bytesPerSecond * 8;
  if (bits < 1000) return `${Math.round(bits)} b/s`;
  const units = ['kb/s', 'Mb/s', 'Gb/s'];
  let value = bits / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) { value /= 1000; unit++; }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

export function fmtGB(gigabytes: unknown, digits = 1): string {
  if (!isNum(gigabytes)) return DASH;
  return gigabytes >= 1000 ? `${(gigabytes / 1024).toFixed(2)} TB` : `${gigabytes.toFixed(digits)} GB`;
}

export function fmtMB(megabytes: unknown): string {
  if (!isNum(megabytes)) return DASH;
  return megabytes >= 1024 ? `${(megabytes / 1024).toFixed(2)} GB` : `${Math.round(megabytes)} MB`;
}

/** 0.84 ms · 96 ms · 2.71 s · 4m 31s: a latency at whatever scale it turned out to be. */
export function fmtMs(value: unknown): string {
  if (!isNum(value)) return DASH;
  if (value >= 60_000) return fmtDuration(value / 1000);
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
  if (value >= 100) return `${value.toFixed(0)} ms`;
  if (value >= 10) return `${value.toFixed(1)} ms`;
  return `${value.toFixed(2)} ms`;
}

/** Two units at most: 3d 4h · 4h 12m · 12m 5s · 42s. */
export function fmtDuration(seconds: unknown): string {
  if (!isNum(seconds) || seconds < 0) return DASH;
  const s = Math.floor(seconds);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return m < 10 && s % 60 > 0 ? `${m}m ${s % 60}s` : `${m}m`;
  return `${s}s`;
}

export function toMs(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (isNum(value)) return value;
  const ms = new Date(String(value)).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** "just now" · "4m ago" · "in 2h 5m". */
export function fmtRelative(value: unknown, now: number): string {
  const at = toMs(value);
  if (at == null) return DASH;
  const delta = (now - at) / 1000;
  if (Math.abs(delta) < 10) return 'just now';
  return delta > 0 ? `${fmtDuration(delta)} ago` : `in ${fmtDuration(-delta)}`;
}

/** "+01:00" from "2026-11-10T15:42:11.5+01:00", or null when the stamp carries no zone. */
export function zoneOf(stamp: string | null | undefined): string | null {
  return /(Z|[+-]\d{2}:\d{2})$/.exec(stamp ?? '')?.[1] ?? null;
}

/**
 * A server timestamp written without a zone is in the server's local time. Read as-is the browser
 * would take it for its own, which is only right while the two share a time zone.
 */
export function inServerZone<T extends string | null | undefined>(stamp: T, serverZone: string | null): T | string {
  if (!stamp || !serverZone || zoneOf(stamp)) return stamp;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(stamp) ? `${stamp}${serverZone}` : stamp;
}

export function fmtClock(value: unknown): string {
  const at = toMs(value);
  if (at == null) return DASH;
  return new Date(at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function fmtDateTime(value: unknown): string {
  const at = toMs(value);
  return at == null ? DASH : new Date(at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

/** A .NET TimeSpan ("2.03:11:00.1234567", "03:11:00") in seconds. */
export function parseTimeSpan(text: unknown): number | null {
  if (typeof text !== 'string') return null;
  const match = /^(-)?(?:(\d+)\.)?(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(text.trim());
  if (!match) return null;
  const [, sign, days, hours, minutes, seconds] = match;
  const total = Number(days ?? 0) * 86_400 + Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  return sign ? -total : total;
}

/**
 * A service that did its job and stopped, as designed. On a server that does not say which those are,
 * the one known case is recognised by name, so it is not reported as down in the meantime.
 */
export function isFinishedService(service: AdminService): boolean {
  if (service.IsActive) return false;
  return service.RunsOnce ?? service.Name === 'Omnipotent Startup Manager';
}

export function serviceUptimeSeconds(service: AdminService): number | null {
  if (!service.IsActive) return null;
  if (isNum(service.UptimeSeconds)) return service.UptimeSeconds;
  return parseTimeSpan(service.Uptime);
}

/** "Intel(R) Core(TM) i5-3570 CPU @ 3.40GHz" → "Core i5-3570 · 3.40GHz". */
export function shortCpuName(name: string | undefined): string {
  if (!name) return '';
  const speed = /@\s*([\d.]+\s*GHz)/i.exec(name)?.[1]?.replace(/\s+/g, '') ?? '';
  const model = name
    .replace(/\((R|TM|C)\)/gi, '')
    .replace(/\bCPU\b/gi, '')
    .replace(/@.*$/, '')
    .replace(/\b(Intel|AMD)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return speed ? `${model} · ${speed}` : model;
}

/** "Microsoft Windows NT 10.0.26100.0" → "Windows 11 (26100)". Anything else passes through. */
export function shortOsName(os: string | undefined): string {
  if (!os) return '';
  const match = /Windows NT (\d+)\.(\d+)\.(\d+)/.exec(os);
  if (!match) return os;
  const build = Number(match[3]);
  if (match[1] !== '10') return `Windows NT ${match[1]}.${match[2]} (${build})`;
  return `${build >= 22_000 ? 'Windows 11' : 'Windows 10'} (${build})`;
}

// ───────────────────────────── severity ─────────────────────────────

export type Tone = 'ok' | 'warn' | 'crit' | 'neutral' | 'info';

export function usageTone(pct: unknown, warnAt: number, critAt: number): Tone {
  if (!isNum(pct)) return 'neutral';
  if (pct >= critAt) return 'crit';
  if (pct >= warnAt) return 'warn';
  return 'ok';
}

/** A disk is judged on both: 93% of a 2 TB volume still has room, 93% of 60 GB does not. */
export function diskTone(disk: AdminDisk): Tone {
  if (disk.UsagePercentage >= 97 || disk.FreeSpaceGB < 5) return 'crit';
  if (disk.UsagePercentage >= 90 || disk.FreeSpaceGB < 20) return 'warn';
  return 'ok';
}

const TONE_RANK: Record<Tone, number> = { crit: 3, warn: 2, info: 1, ok: 0, neutral: 0 };
export function worstTone(tones: Tone[]): Tone {
  return tones.reduce<Tone>((worst, tone) => (TONE_RANK[tone] > TONE_RANK[worst] ? tone : worst), 'ok');
}

// ───────────────────────────── vitals history ─────────────────────────────

export const HISTORY_WINDOW_MS = 60 * 60_000;

export function samplesFromHistory(payload: AdminHistoryPayload | null | undefined): VitalSample[] {
  if (!payload || !Array.isArray(payload.T)) return [];
  const n = Math.min(payload.T.length, payload.Cpu?.length ?? 0);
  const out: VitalSample[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      t: payload.T[i] * 1000,
      cpu: payload.Cpu[i],
      ram: payload.RamPct?.[i] ?? 0,
      procMB: payload.ProcessMB?.[i] ?? 0,
      heapMB: payload.HeapMB?.[i] ?? 0,
      threads: payload.Threads?.[i] ?? 0,
      gen2: payload.Gen2?.[i] ?? 0,
      netSent: payload.NetSent?.[i] ?? 0,
      netRecv: payload.NetReceived?.[i] ?? 0,
      errors: payload.Errors?.[i] ?? null,
      requests: payload.Requests?.[i] ?? null,
      serverErrors: payload.ServerErrors?.[i] ?? null,
    });
  }
  return out;
}

export function sampleFromStats(stats: AdminStats, receivedAt: number): VitalSample {
  let netSent = 0;
  let netRecv = 0;
  for (const nic of realAdapters(stats.NetworkInterfaces)) {
    // The same rule the server's history uses, so the two sources line up.
    if (isVirtualAdapter(nic)) continue;
    netSent += nic.BytesSent || 0;
    netRecv += nic.BytesReceived || 0;
  }
  return {
    t: toMs(stats.TimeStatisticsGenerated) ?? receivedAt,
    cpu: stats.CpuUsagePercentage,
    ram: stats.RamUsagePercentage,
    procMB: stats.ProcessMemoryMB,
    heapMB: stats.GCTotalMemoryMB,
    threads: stats.ProcessThreadCount,
    gen2: stats.GCGen2Collections,
    netSent,
    netRecv,
    errors: isNum(stats.ErrorsLoggedTotal) ? stats.ErrorsLoggedTotal : null,
    requests: isNum(stats.ApiRequestsTotal) ? stats.ApiRequestsTotal : null,
    serverErrors: isNum(stats.ApiServerErrorsTotal) ? stats.ApiServerErrorsTotal : null,
  };
}

const VIRTUAL_MARKERS = ['vethernet', 'vswitch', 'hyper-v', 'virtual', 'wsl', 'docker', 'vmware', 'virtualbox', 'tap-', 'wireguard', 'tailscale', 'loopback', 'pseudo', 'teredo', 'isatap', 'miniport'];

/**
 * Windows lists every filter driver bound to an adapter as an interface of its own, named
 * "adapter-driver-0000" ("Ethernet-QoS Packet Scheduler-0000"): the live server reports 52 interfaces
 * for one network card. They repeat the adapter's own counters.
 */
export function isFilterLayer(name: string | undefined): boolean {
  return /-[^-]+-\d{4}$/.test(name ?? '');
}

/** The adapters worth listing: no filter layers, nothing that has never carried a byte. */
export function realAdapters(nics: AdminNetInterface[] | null | undefined): AdminNetInterface[] {
  return (nics ?? []).filter(nic => !isFilterLayer(nic.Name) && (nic.BytesSent > 0 || nic.BytesReceived > 0));
}
export function isVirtualAdapter(nic: Pick<AdminNetInterface, 'Name' | 'Description' | 'IsVirtual'>): boolean {
  if (typeof nic.IsVirtual === 'boolean') return nic.IsVirtual;
  const text = `${nic.Name} ${nic.Description ?? ''}`.toLowerCase();
  return VIRTUAL_MARKERS.some(marker => text.includes(marker));
}

/** Appends a live sample, keeping the last hour and ignoring a snapshot already seen. */
export function appendSample(samples: VitalSample[], next: VitalSample): VitalSample[] {
  const last = samples[samples.length - 1];
  if (last && next.t <= last.t) return samples;
  const cutoff = next.t - HISTORY_WINDOW_MS;
  let start = 0;
  while (start < samples.length && samples[start].t < cutoff) start++;
  const kept = start > 0 ? samples.slice(start) : samples.slice();
  kept.push(next);
  return kept;
}

export interface SeriesPoint { t: number; v: number }

export function gaugeSeries(samples: VitalSample[], pick: (sample: VitalSample) => number): SeriesPoint[] {
  return samples.map(sample => ({ t: sample.t, v: pick(sample) }));
}

/**
 * A rate from a running total, scaled to `perMs`, taken over evenly-timed buckets instead of between
 * neighbouring samples: a counter that ticks once a minute would otherwise draw as a comb of spikes.
 * A total that goes down (the process restarted, an adapter reset) starts a fresh run rather than a
 * negative spike.
 */
export function bucketRateSeries(samples: VitalSample[], pick: (sample: VitalSample) => number | null, buckets: number, perMs: number): SeriesPoint[] {
  if (samples.length < 2) return [];
  const start = samples[0].t;
  const span = samples[samples.length - 1].t - start;
  // Never finer than 15 s: below that a bucket holds too few samples to mean anything.
  const count = Math.max(1, Math.min(buckets, Math.floor(span / 15_000)));
  if (span <= 0) return [];
  const width = span / count;
  const out: SeriesPoint[] = [];
  let index = 0;
  let previous = pick(samples[0]);
  for (let bucket = 1; bucket <= count; bucket++) {
    const edge = start + bucket * width;
    while (index + 1 < samples.length && samples[index + 1].t <= edge + 0.5) index++;
    const total = pick(samples[index]);
    if (previous != null && total != null && total >= previous) {
      out.push({ t: edge - width / 2, v: ((total - previous) / width) * perMs });
    }
    previous = total;
  }
  return out;
}

/** The rate over the trailing window, from its first and last usable totals. */
export function trailingRate(samples: VitalSample[], pick: (sample: VitalSample) => number | null, windowMs: number, perMs: number): number | null {
  if (samples.length < 2) return null;
  const last = samples[samples.length - 1];
  const end = pick(last);
  if (end == null) return null;
  let first: VitalSample | null = null;
  for (let i = samples.length - 2; i >= 0; i--) {
    const value = pick(samples[i]);
    if (value == null || value > end || last.t - samples[i].t > windowMs) break;
    first = samples[i];
  }
  if (!first) return null;
  const start = pick(first) as number;
  const dt = last.t - first.t;
  return dt > 0 ? ((end - start) / dt) * perMs : null;
}

export function trailingAverage(points: SeriesPoint[], windowMs: number): number | null {
  if (!points.length) return null;
  const cutoff = points[points.length - 1].t - windowMs;
  let sum = 0;
  let count = 0;
  for (let i = points.length - 1; i >= 0 && points[i].t >= cutoff; i--) { sum += points[i].v; count++; }
  return count ? sum / count : null;
}

/** Averages a series into at most `max` evenly-timed buckets: a sparkline has no use for 720 points. */
export function downsample(points: SeriesPoint[], max: number): SeriesPoint[] {
  if (points.length <= max) return points;
  const first = points[0].t;
  const span = Math.max(1, points[points.length - 1].t - first);
  const sums = new Array<number>(max).fill(0);
  const counts = new Array<number>(max).fill(0);
  for (const point of points) {
    const bucket = Math.min(max - 1, Math.floor(((point.t - first) / span) * max));
    sums[bucket] += point.v;
    counts[bucket]++;
  }
  const out: SeriesPoint[] = [];
  for (let i = 0; i < max; i++) {
    if (counts[i]) out.push({ t: first + ((i + 0.5) / max) * span, v: sums[i] / counts[i] });
  }
  return out;
}

// ───────────────────────────── uptime timeline ─────────────────────────────

export interface UptimeBlock {
  up: boolean;
  start: number;
  end: number;
  /** Share of the window, 0–100. */
  pct: number;
}

export interface UptimeView {
  blocks: UptimeBlock[];
  windowStart: number;
  windowEnd: number;
  upMs: number;
  downMs: number;
  /** null when there is no history inside the window. */
  availability: number | null;
  /** Process starts inside the window, not counting one the window opened in the middle of. */
  restarts: number;
  /** Of those, starts on a different commit from the run before: deploys. Counted only where both commits are known. */
  deploys: number;
  /** Starts on the same commit as the run before: a crash, or a manual restart. */
  sameBuildRestarts: number;
  longestOutageMs: number;
  outages: UptimeBlock[];
}

/**
 * Turns recorded up-periods into alternating up/down blocks across a window ending now. The window
 * never starts before the first record: time before monitoring began is unknown, not an outage.
 */
export function buildUptimeView(periods: AdminUptimePeriod[] | null | undefined, rangeMs: number | null, now: number): UptimeView {
  const empty: UptimeView = { blocks: [], windowStart: now, windowEnd: now, upMs: 0, downMs: 0, availability: null, restarts: 0, deploys: 0, sameBuildRestarts: 0, longestOutageMs: 0, outages: [] };
  const spans = (periods ?? [])
    .map(period => ({ start: toMs(period.StartTime), end: toMs(period.LastKnownUpTime), commit: period.Commit || null }))
    .filter((span): span is { start: number; end: number; commit: string | null } => span.start != null)
    .map(span => ({ start: span.start, end: Math.max(span.end ?? span.start, span.start), commit: span.commit }))
    .sort((a, b) => a.start - b.start);
  if (!spans.length) return empty;

  // The newest period is the process that answered: it is up until now, whatever was last saved.
  spans[spans.length - 1].end = Math.max(spans[spans.length - 1].end, now);

  const windowStart = Math.max(spans[0].start, rangeMs ? now - rangeMs : spans[0].start);
  const total = Math.max(1, now - windowStart);
  const blocks: UptimeBlock[] = [];
  let cursor = windowStart;
  let restarts = 0;
  let deploys = 0;
  let sameBuildRestarts = 0;

  for (let index = 0; index < spans.length; index++) {
    const span = spans[index];
    const start = Math.max(span.start, windowStart);
    const end = Math.min(span.end, now);
    if (end <= start) continue;
    if (span.start > windowStart) {
      restarts++;
      const before = spans[index - 1]?.commit;
      if (before && span.commit) {
        if (before === span.commit) sameBuildRestarts++;
        else deploys++;
      }
    }
    if (start > cursor) blocks.push({ up: false, start: cursor, end: start, pct: ((start - cursor) / total) * 100 });
    const from = Math.max(start, cursor);
    if (end > from) blocks.push({ up: true, start: from, end, pct: ((end - from) / total) * 100 });
    cursor = Math.max(cursor, end);
  }
  if (cursor < now) blocks.push({ up: false, start: cursor, end: now, pct: ((now - cursor) / total) * 100 });

  const outages = blocks.filter(block => !block.up);
  const upMs = blocks.filter(block => block.up).reduce((sum, block) => sum + (block.end - block.start), 0);
  const downMs = outages.reduce((sum, block) => sum + (block.end - block.start), 0);
  return {
    blocks,
    windowStart,
    windowEnd: now,
    upMs,
    downMs,
    availability: upMs + downMs > 0 ? (upMs / (upMs + downMs)) * 100 : null,
    restarts,
    deploys,
    sameBuildRestarts,
    longestOutageMs: outages.reduce((longest, block) => Math.max(longest, block.end - block.start), 0),
    outages,
  };
}

/**
 * How long the API has typically stayed down across a restart: the median of the recent gaps that
 * look like a redeploy (30 s to 30 min). Longer gaps are power cuts and crashes left overnight.
 */
export function typicalRestartSeconds(periods: AdminUptimePeriod[] | null | undefined, take = 12): number | null {
  const spans = (periods ?? [])
    .map(period => ({ start: toMs(period.StartTime), end: toMs(period.LastKnownUpTime) }))
    .filter((span): span is { start: number; end: number } => span.start != null && span.end != null)
    .sort((a, b) => a.start - b.start);
  const gaps: number[] = [];
  for (let i = 1; i < spans.length; i++) {
    const gap = (spans[i].start - spans[i - 1].end) / 1000;
    if (gap >= 30 && gap <= 1800) gaps.push(gap);
  }
  const recent = gaps.slice(-take).sort((a, b) => a - b);
  if (recent.length < 3) return null;
  const mid = Math.floor(recent.length / 2);
  return recent.length % 2 ? recent[mid] : (recent[mid - 1] + recent[mid]) / 2;
}

// ───────────────────────────── attention ─────────────────────────────

export type IssueSeverity = 'crit' | 'warn' | 'info';

export interface Issue {
  /** Stable while the condition holds at this severity: what a mute is remembered by. */
  id: string;
  severity: IssueSeverity;
  title: string;
  detail?: string;
  /** Section of the page that explains it. */
  section?: string;
  /** An action the page can offer next to it. */
  action?: { kind: 'restart-service'; service: string } | { kind: 'open'; to: string; label: string } | { kind: 'deploy' };
}

export interface IssueInput {
  stats: AdminStats | null;
  /** The fast poll has been failing: seconds since the last good answer, or null when healthy. */
  unreachableForSeconds: number | null;
  uptime: AdminUptimePeriod[] | null;
  /** The last 24 hours of API telemetry against the 24 before, when the profile may read it. */
  apiWindow: AdminApiWindow | null;
  tasks: AdminTask[] | null;
  samples: VitalSample[];
  now: number;
  canControlServices: boolean;
  canDeploy: boolean;
  /** Sections that failed to load this round, by label. */
  failedSections: string[];
}

const SEVERITY_ORDER: Record<IssueSeverity, number> = { crit: 0, warn: 1, info: 2 };

/** Everything on the page that deserves a second look, worst first. */
export function computeIssues(input: IssueInput): Issue[] {
  const issues: Issue[] = [];
  const { stats, now, samples } = input;

  if (input.unreachableForSeconds != null && input.unreachableForSeconds >= 20) {
    issues.push({
      id: 'unreachable',
      severity: 'crit',
      title: 'The API is not answering',
      detail: `Last answer ${fmtDuration(input.unreachableForSeconds)} ago. Figures below are from then.`,
    });
  }

  if (stats) {
    // Services that are down.
    for (const service of stats.Services ?? []) {
      if (service.IsActive || isFinishedService(service)) continue;
      const critical = service.Anteriority === 'Critical' || service.Name === 'KliveAPI';
      issues.push({
        id: `service-down:${service.Name}`,
        severity: critical ? 'crit' : 'warn',
        title: `${service.Name} is not running`,
        detail: critical ? 'A critical service: other parts of the platform depend on it.' : undefined,
        section: 'services',
        action: input.canControlServices ? { kind: 'restart-service', service: service.Name } : undefined,
      });
    }

    // Services that are up but logging errors steadily.
    const noisy = (stats.Services ?? [])
      .filter(service => service.IsActive && (service.ErrorsLastHour ?? 0) >= 20)
      .sort((a, b) => (b.ErrorsLastHour ?? 0) - (a.ErrorsLastHour ?? 0));
    for (const service of noisy.slice(0, 3)) {
      const count = service.ErrorsLastHour ?? 0;
      issues.push({
        id: `service-errors:${service.Name}:${count >= 200 ? 'crit' : 'warn'}`,
        severity: count >= 200 ? 'crit' : 'warn',
        title: `${service.Name} logged ${fmtInt(count)} errors in the last hour`,
        detail: service.LastErrorAt ? `Most recent ${fmtRelative(service.LastErrorAt, now)}.` : undefined,
        section: 'services',
        action: { kind: 'open', to: logsLink(service.Name), label: 'Open logs' },
      });
    }

    for (const disk of stats.DiskStatistics ?? []) {
      const tone = diskTone(disk);
      if (tone !== 'crit' && tone !== 'warn') continue;
      issues.push({
        id: `disk:${disk.DriveName}:${tone}`,
        severity: tone,
        title: `${disk.DriveName} is ${disk.UsagePercentage.toFixed(0)}% full`,
        detail: `${fmtGB(disk.FreeSpaceGB)} free of ${fmtGB(disk.TotalSizeGB, 0)}.`,
        section: 'storage',
      });
    }

    const ramTone = usageTone(stats.RamUsagePercentage, 88, 95);
    if (ramTone === 'crit' || ramTone === 'warn') {
      issues.push({
        id: `ram:${ramTone}`,
        severity: ramTone,
        title: `Memory is ${stats.RamUsagePercentage.toFixed(0)}% used`,
        detail: `${fmtGB(stats.RamTotalGB - stats.RamUsedGB)} free. Omnipotent holds ${fmtMB(stats.ProcessMemoryMB)}.`,
        section: 'vitals',
      });
    }

    // One busy sample is normal on four cores; five minutes of it is not.
    const cpuAvg = trailingAverage(gaugeSeries(samples, sample => sample.cpu), 5 * 60_000);
    const cpuSpan = samples.length ? samples[samples.length - 1].t - samples[0].t : 0;
    if (cpuAvg != null && cpuSpan >= 4 * 60_000 && cpuAvg >= 90) {
      issues.push({
        id: 'cpu:sustained',
        severity: 'warn',
        title: `CPU has averaged ${cpuAvg.toFixed(0)}% for five minutes`,
        detail: 'Requests queue behind this: expect slow pages.',
        section: 'vitals',
      });
    }

    const gen2PerMin = trailingRate(samples, sample => sample.gen2, 5 * 60_000, 60_000);
    if (gen2PerMin != null && cpuSpan >= 4 * 60_000 && gen2PerMin >= 40) {
      issues.push({
        id: 'gc:pressure',
        severity: 'warn',
        title: `Garbage collector under pressure: ${gen2PerMin.toFixed(0)} full collections a minute`,
        detail: 'Every full collection pauses request handling. Something is allocating heavily.',
        section: 'vitals',
      });
    }

    const requestRate = trailingRate(samples, sample => sample.requests, 10 * 60_000, 60_000);
    const serverErrorRate = trailingRate(samples, sample => sample.serverErrors, 10 * 60_000, 60_000);
    let failingNow = false;
    if (requestRate != null && serverErrorRate != null && requestRate >= 10) {
      const share = (serverErrorRate / requestRate) * 100;
      if (share >= 5) {
        failingNow = true;
        issues.push({
          id: `api-5xx:${share >= 25 ? 'crit' : 'warn'}`,
          severity: share >= 25 ? 'crit' : 'warn',
          title: `${share.toFixed(0)}% of API requests are failing`,
          detail: `${serverErrorRate.toFixed(0)} server errors a minute over the last ten minutes.`,
          section: 'api',
          action: { kind: 'open', to: '/administration/api-telemetry', label: 'Open telemetry' },
        });
      }
    }

    // The day as a whole, when nothing is failing this minute: one route answering 5xx to every
    // request can run for days without ever being a large share of a busy ten minutes.
    const day = input.apiWindow?.kpi;
    if (!failingNow && day && day.count >= 200 && day.errorPct >= 5) {
      const before = input.apiWindow?.prev;
      issues.push({
        id: `api-5xx-day:${day.errorPct >= 25 ? 'crit' : 'warn'}`,
        severity: day.errorPct >= 25 ? 'crit' : 'warn',
        title: `${day.errorPct.toFixed(day.errorPct >= 10 ? 0 : 1)}% of API requests failed in the last 24 hours`,
        detail: `About ${fmtInt((day.count * day.errorPct) / 100)} of ${fmtInt(day.count)}.${before && before.count >= 50 ? ` The 24 hours before: ${before.errorPct.toFixed(1)}%.` : ''} Telemetry shows which routes.`,
        section: 'api',
        action: { kind: 'open', to: '/administration/api-telemetry', label: 'Open telemetry' },
      });
    }

    // A deploy that did not take: the updater saw a commit, started the update, and the process that
    // came back is still the old build (the publish failed and the previous binaries were started).
    const build = stats.Build;
    const updater = stats.Updater;
    if (build?.Commit && updater) {
      const settled = (now - (toMs(updater.LastNewCommitUtc) ?? toMs(build.ProcessStartedUtc) ?? now)) > 10 * 60_000;
      if (updater.AutoDeploy && updater.LastSeenSha && !sameCommit(updater.LastSeenSha, build.Commit) && settled) {
        issues.push({
          id: `deploy-mismatch:${updater.LastSeenSha.slice(0, 7)}`,
          severity: 'warn',
          title: `Running ${build.CommitShort}, but ${updater.Branch || 'master'} is at ${updater.LastSeenSha.slice(0, 7)}`,
          detail: 'The last update did not produce a new build. The build may have failed on the server.',
          section: 'host',
          action: input.canDeploy ? { kind: 'deploy' } : undefined,
        });
      }
      if (!updater.LastCheckOk && updater.LastError) {
        issues.push({
          id: 'updater:error',
          severity: 'info',
          title: 'The updater could not check GitHub',
          detail: updater.LastError,
          section: 'host',
        });
      }
    }

    const startedAt = toMs(build?.ProcessStartedUtc);
    if (startedAt != null && now - startedAt < 3 * 60_000) {
      issues.push({
        id: 'just-started',
        severity: 'info',
        title: `Omnipotent started ${fmtDuration((now - startedAt) / 1000)} ago`,
        detail: 'Services are still coming up; some panels fill in over the next minute.',
      });
    }
  }

  // Restart loop: several process starts within the last hour that were not deploys. Pushing six
  // commits in an hour restarts it six times and is not a fault; the same build starting three times is.
  if (input.uptime?.length) {
    const hour = buildUptimeView(input.uptime, 3_600_000, now);
    const unexplained = hour.restarts - hour.deploys;
    if (unexplained >= 3) {
      const known = hour.sameBuildRestarts >= 3;
      issues.push({
        id: 'restart-loop',
        severity: 'crit',
        title: `Omnipotent has restarted ${unexplained} times in the last hour${known ? ' on the same build' : ''}`,
        detail: known ? 'Nothing was deployed in between: it is crashing, or being restarted by hand.' : 'That is a crash or restart loop unless you have been deploying.',
        section: 'uptime',
        action: { kind: 'open', to: '/administration/botlogs', label: 'Open logs' },
      });
    }
  }

  // Scheduled tasks that should have fired and are still waiting.
  if (input.tasks?.length) {
    const overdue = input.tasks.filter(task => {
      const due = toMs(task.dateTimeDue);
      return due != null && now - due > 2 * 60_000;
    });
    if (overdue.length) {
      const oldest = overdue.reduce((a, b) => ((toMs(a.dateTimeDue) ?? 0) < (toMs(b.dateTimeDue) ?? 0) ? a : b));
      issues.push({
        id: 'tasks-overdue',
        severity: 'warn',
        title: overdue.length === 1 ? `Scheduled task “${oldest.taskName}” is overdue` : `${overdue.length} scheduled tasks are overdue`,
        detail: `${overdue.length === 1 ? 'Due' : 'Oldest due'} ${fmtRelative(oldest.dateTimeDue, now)}.`,
        section: 'schedule',
        action: { kind: 'open', to: '/botSchedule', label: 'Open schedule' },
      });
    }
  }

  for (const label of input.failedSections) {
    issues.push({ id: `load:${label}`, severity: 'info', title: `${label} did not load`, detail: 'Showing the last figures received.' });
  }

  return issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

export function sameCommit(a: string, b: string): boolean {
  if (!a || !b) return false;
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x.startsWith(y) || y.startsWith(x);
}

export function logsLink(service?: string): string {
  return service ? `/administration/botlogs?service=${encodeURIComponent(service)}` : '/administration/botlogs';
}

export function telemetryRouteLink(route: AdminApiRoute): { path: string; query: Record<string, string> } {
  return { path: '/administration/api-telemetry', query: { tab: 'routes', route: route.route, method: route.method } };
}

// ───────────────────────────── command search ─────────────────────────────

/** Something the palette can do: go somewhere, or run an action. */
export interface AdminCommand {
  id: string;
  group: 'Go to' | 'Actions' | 'Services';
  title: string;
  icon: string;
  /** Extra words to match on, never shown. */
  keywords?: string;
  hint?: string;
  /** Needs a second Enter: it restarts, stops or redeploys something. */
  danger?: boolean;
  run: () => unknown;
}

/** How well one typed word matches `text`: 0 for no match, highest at the start of a word. */
function wordScore(word: string, text: string): number {
  const at = text.indexOf(word);
  if (at >= 0) {
    const wordStart = at === 0 || /[\s/·:._-]/.test(text[at - 1]);
    return 100 + (wordStart ? 60 : 0) + (at === 0 ? 30 : 0) - Math.min(at, 30) + word.length * 2;
  }
  // Letters in order ("klvapi" → KliveAPI): a weaker match.
  let position = 0;
  let gaps = 0;
  for (const letter of word) {
    const found = text.indexOf(letter, position);
    if (found < 0) return 0;
    gaps += found - position;
    position = found + 1;
  }
  return Math.max(5, 40 - gaps);
}

/**
 * Scores a command against what was typed. Every word must be found, in the title or failing that
 * in the keywords (worth less). Destinations and page actions edge out the per-service entries, and
 * between equal matches the shorter title wins, so "logs" finds the Logs page before
 * "Logs: Stratum", and "res klivea" finds "Restart KliveAPI" before "Restart KliveAgent".
 * Returns 0 for no match.
 */
export function commandScore(query: string, command: Pick<AdminCommand, 'title' | 'keywords' | 'group'>): number {
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
  return Math.max(1, score + (command.group === 'Services' ? 0 : 12) - title.length * 0.2);
}

// ───────────────────────────── port mappings ─────────────────────────────

export interface PortDraft {
  Description: string;
  PublicPort: string;
  PrivatePort: string;
  Protocol: 'TCP' | 'UDP';
  PrivateIp: string;
  LifetimeSeconds: number;
}

export function blankPortDraft(localIp: string): PortDraft {
  return { Description: '', PublicPort: '', PrivatePort: '', Protocol: 'TCP', PrivateIp: localIp, LifetimeSeconds: 0 };
}

export function draftFromMapping(mapping: AdminPortMapping): PortDraft {
  return {
    Description: mapping.Description ?? '',
    PublicPort: String(mapping.PublicPort),
    PrivatePort: String(mapping.PrivatePort),
    Protocol: mapping.Protocol?.toUpperCase() === 'UDP' ? 'UDP' : 'TCP',
    PrivateIp: mapping.PrivateIp ?? '',
    LifetimeSeconds: Number(mapping.LifetimeSeconds) || 0,
  };
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

/** The first thing wrong with a draft, or null when it can be sent. */
export function validatePortDraft(draft: PortDraft, existing: AdminPortMapping[], editing: AdminPortMapping | null): string | null {
  const publicPort = Number(draft.PublicPort);
  const privatePort = Number(draft.PrivatePort);
  if (!Number.isInteger(publicPort) || publicPort < 1 || publicPort > 65_535) return 'Public port must be between 1 and 65535.';
  if (!Number.isInteger(privatePort) || privatePort < 1 || privatePort > 65_535) return 'Private port must be between 1 and 65535.';
  if (!IPV4.test(draft.PrivateIp.trim())) return 'Target must be an IPv4 address on your network.';
  const clash = existing.find(mapping =>
    mapping.PublicPort === publicPort
    && mapping.Protocol.toUpperCase() === draft.Protocol
    && !(editing && mapping.PublicPort === editing.PublicPort && mapping.Protocol === editing.Protocol));
  if (clash) return `${draft.Protocol} port ${publicPort} is already forwarded${clash.Description ? ` (${clash.Description})` : ''}.`;
  return null;
}

export function mappingPayload(draft: PortDraft): AdminPortMapping {
  return {
    Description: draft.Description.trim(),
    PublicPort: Number(draft.PublicPort),
    PrivatePort: Number(draft.PrivatePort),
    Protocol: draft.Protocol,
    PrivateIp: draft.PrivateIp.trim(),
    LifetimeSeconds: draft.LifetimeSeconds,
    ExpirationDate: '',
  };
}

export function portLifetimeLabel(mapping: AdminPortMapping, now: number): string {
  if (!mapping.LifetimeSeconds || /permanent/i.test(mapping.ExpirationDate ?? '')) return 'Permanent';
  const expires = toMs((mapping.ExpirationDate ?? '').replace(' UTC', 'Z').replace(' ', 'T'));
  if (expires == null) return mapping.ExpirationDate || 'Timed';
  return expires > now ? `${fmtDuration((expires - now) / 1000)} left` : 'Expired';
}
