/*
 * Home: the rules behind the page, kept free of Vue so they can be read and tested on their own.
 *
 * The page answers three questions for someone who looks for three seconds and leaves (the live median
 * on 11–13 Nov 2026): is anything wrong, how is each system doing, and where do I go next. So every
 * system is reduced to one tile (a figure, one line, a tone), every problem to one finding with a place
 * to fix it, and the pages to a list ordered by how often this browser opens them.
 *
 * Tones mean state, never decoration: ok, warn and crit only where something is healthy, drifting or
 * broken; idle for a system that is simply not in use.
 */

import {
  fmtCompact, fmtDuration, fmtGB, fmtInt, fmtRelative, isFinishedService, isNum, toMs,
  type AdminService, type SeriesPoint,
} from '~/scripts/adminConsole';

export type HomeTone = 'ok' | 'warn' | 'crit' | 'info' | 'idle' | 'neutral';
export type FindingTone = 'crit' | 'warn' | 'info';

export interface HomeFinding {
  id: string;
  system: string;
  tone: FindingTone;
  title: string;
  detail?: string;
  href?: string;
  /** Unix ms the condition began, when known. */
  since?: number | null;
  /**
   * A standing condition that is known and slow-moving (a disk filling over weeks, the fleet halted on
   * purpose): said once on the quiet line instead of turning the page amber on every visit.
   */
  chronic?: boolean;
  /** A button the finding offers besides opening its page. */
  action?: 'restart-service' | 'resume-fleet';
  service?: string;
}

export interface HomePulse {
  id: string;
  label: string;
  icon: string;
  href: string;
  tone: HomeTone;
  /** The figure, short: "264", "£10K", "0". */
  value: string;
  unit?: string;
  /** One line under it. */
  line: string;
  /** Small print: freshness or what the figure counts. */
  foot?: string;
  spark?: SeriesPoint[];
  sparkBars?: boolean;
  findings: HomeFinding[];
}

const NONE = '—';

function num(value: unknown): number | null {
  if (isNum(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}
function n0(value: unknown): number { return num(value) ?? 0; }
function arr<T = any>(value: unknown): T[] { return Array.isArray(value) ? value as T[] : []; }
function str(value: unknown): string { return typeof value === 'string' ? value : value == null ? '' : String(value); }
function plural(count: number, one: string, many = `${one}s`): string { return `${fmtInt(count)} ${count === 1 ? one : many}`; }
function clip(text: unknown, max = 110): string {
  const value = str(text).replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
function pick(source: any, ...keys: string[]): any {
  if (!source || typeof source !== 'object') return undefined;
  for (const key of keys) if (source[key] !== undefined) return source[key];
  return undefined;
}

const CURRENCY: Record<string, string> = { GBP: '£', USD: '$', EUR: '€' };
export function fmtMoney(value: unknown, currency = 'GBP'): string {
  const amount = num(value);
  if (amount == null) return NONE;
  const symbol = CURRENCY[currency] ?? '';
  const abs = Math.abs(amount);
  const body = abs >= 10_000 ? fmtCompact(abs) : abs >= 100 ? Math.round(abs).toLocaleString('en-GB') : abs.toFixed(2);
  return `${amount < 0 ? '-' : ''}${symbol}${body}${symbol ? '' : ` ${currency}`}`;
}

// ───────────────────────────── server ─────────────────────────────

export interface HomeServer {
  TimeStatisticsGenerated?: string;
  CpuUsagePercentage?: number;
  RamUsagePercentage?: number;
  RamUsedGB?: number;
  RamTotalGB?: number;
  ProcessMemoryMB?: number;
  BotUptime?: string;
  BotUptimeHumanized?: string;
  ErrorsLastHour?: number;
  TotalServicesActive?: number;
  TotalServicesRegistered?: number;
  DiskStatistics?: Array<{ DriveName: string; UsagePercentage: number; FreeSpaceGB: number; TotalSizeGB?: number }>;
  Services?: AdminService[];
  Build?: { CommitShort?: string; ProcessStartedUtc?: string } | null;
  NextTaskScheduledSummary?: string;
  MachineName?: string;
}

/** Services that are down: stopped and not one that stops by design once its job is done. */
export function downServices(server: HomeServer | null | undefined): AdminService[] {
  return arr<AdminService>(server?.Services).filter(service => !service.IsActive && !isFinishedService(service));
}

export function serverFindings(server: HomeServer | null | undefined): HomeFinding[] {
  if (!server) return [];
  const out: HomeFinding[] = [];
  for (const service of downServices(server)) {
    out.push({
      id: `service:${service.Name}`, system: 'Server', tone: service.Anteriority === 'Critical' ? 'crit' : 'warn',
      title: `${service.Name} is stopped`, detail: service.LastErrorAt ? `Last error ${fmtRelative(service.LastErrorAt, Date.now())}` : 'It is not running.',
      href: '/admin', action: 'restart-service', service: service.Name,
    });
  }
  for (const disk of arr(server.DiskStatistics)) {
    const free = n0(disk.FreeSpaceGB);
    const used = n0(disk.UsagePercentage);
    if (free < 5 || used >= 97) {
      out.push({ id: `disk:${disk.DriveName}`, system: 'Server', tone: 'crit', title: `${disk.DriveName} is nearly full`, detail: `${fmtGB(free)} free (${used.toFixed(0)}% used)`, href: '/admin' });
    } else if (used >= 90 || free < 20) {
      // Weeks in the making and days from mattering: one line on the quiet list, not an alarm every visit.
      out.push({ id: `disk:${disk.DriveName}`, system: 'Server', tone: 'warn', chronic: free >= 10, title: `${disk.DriveName} ${used.toFixed(0)}% full`, detail: `${fmtGB(free)} free`, href: '/admin' });
    }
  }
  const ram = num(server.RamUsagePercentage);
  if (ram != null && ram >= 95) out.push({ id: 'ram', system: 'Server', tone: 'crit', title: `Memory ${ram.toFixed(0)}% in use`, detail: `${fmtGB(n0(server.RamUsedGB))} of ${fmtGB(n0(server.RamTotalGB), 0)}`, href: '/admin' });
  else if (ram != null && ram >= 90) out.push({ id: 'ram', system: 'Server', tone: 'warn', title: `Memory ${ram.toFixed(0)}% in use`, href: '/admin' });
  const errors = num(server.ErrorsLastHour);
  if (errors != null && errors >= 200) out.push({ id: 'errors', system: 'Server', tone: 'warn', title: `${fmtInt(errors)} errors logged in the last hour`, detail: loudestService(server), href: '/administration/botlogs?type=error' });
  return out;
}

function loudestService(server: HomeServer): string {
  const loudest = [...arr<AdminService>(server.Services)].sort((a, b) => n0(b.ErrorsLastHour) - n0(a.ErrorsLastHour))[0];
  return loudest && n0(loudest.ErrorsLastHour) > 0 ? `Mostly ${loudest.Name} (${fmtInt(loudest.ErrorsLastHour)})` : '';
}

// ───────────────────────────── systems ─────────────────────────────

/** Everything the tiles read, by source. Any of it may be missing: not permitted, not deployed, failing. */
export interface HomeSources {
  stewards?: any[] | null;
  demiurgeOverview?: any;
  agentStatus?: any;
  agentStats?: any;
  agentNotifications?: any[] | null;
  agentJobs?: any[] | null;
  trader?: any;
  cs2?: any;
  memes?: any;
  tumblr?: any;
  gram?: any;
  defence?: any;
  defencePending?: boolean;
  mail?: any;
  mailCode?: MailCode | null;
  cloud?: any;
  omniscience?: any;
  games?: any;
  gadgets?: any[] | null;
  linkAgents?: any[] | null;
  blox?: any;
}

export interface MailCode { code: string; from: string; subject: string; at: number; id: string }

/** The newest message carrying a sign-in code, while it is still fresh enough to type in. */
export function latestMailCode(messages: unknown, now: number, maxAgeMs = 30 * 60_000): MailCode | null {
  for (const message of arr(messages)) {
    const code = str(pick(message, 'Code', 'code')).trim();
    if (!code) continue;
    const at = toMs(pick(message, 'ReceivedUtc', 'receivedUtc', 'DateUtc'));
    if (at == null || now - at > maxAgeMs || at - now > 5 * 60_000) continue;
    return {
      code,
      from: str(pick(message, 'FromName', 'fromName')) || str(pick(message, 'FromAddress', 'fromAddress')) || 'unknown sender',
      subject: str(pick(message, 'Subject', 'subject')),
      at,
      id: str(pick(message, 'Id', 'id')),
    };
  }
  return null;
}

export function demiurgePulse(list: any[] | null | undefined, overview: any, now: number): HomePulse | null {
  if (!Array.isArray(list) && !overview) return null;
  const stewards = arr(list).map(p => ({
    id: str(pick(p, 'stewardID', 'StewardID')),
    name: str(pick(p, 'name', 'Name')) || 'Unnamed Steward',
    status: str(pick(p, 'status', 'Status')),
    halted: !!pick(p, 'halted', 'Halted'),
    approvals: n0(pick(p, 'pendingApprovals', 'PendingApprovals')),
    blocker: str(pick(p, 'blocker', 'Blocker')),
  }));
  const live = stewards.filter(p => !['archived', 'completed'].includes(p.status.toLowerCase()));
  const halted = live.filter(p => p.halted);
  const paused = live.filter(p => !p.halted && /paused/i.test(p.status));
  const working = num(pick(overview, 'workingStewards', 'WorkingStewards'));
  const active = live.filter(p => !p.halted && /^(active|planning)$/i.test(p.status));
  const approvals = live.reduce((sum, p) => sum + p.approvals, 0);
  const blocked = live.filter(p => /blocked/i.test(p.status));
  const spend = num(pick(overview, 'modelSpendUsd', 'ModelSpendUsd'));

  const findings: HomeFinding[] = [];
  if (approvals) {
    const first = live.find(p => p.approvals);
    findings.push({
      id: 'demiurge:approvals', system: 'Demiurge', tone: 'warn',
      title: `${plural(approvals, 'approval')} waiting`,
      detail: live.filter(p => p.approvals).map(p => p.name).slice(0, 3).join(', '),
      href: live.filter(p => p.approvals).length === 1 && first ? `/demiurge/${encodeURIComponent(first.id)}` : '/demiurge',
    });
  }
  for (const steward of blocked.slice(0, 2)) {
    findings.push({ id: `demiurge:blocked:${steward.id}`, system: 'Demiurge', tone: 'warn', title: `${steward.name} is blocked`, detail: clip(steward.blocker, 90), href: `/demiurge/${encodeURIComponent(steward.id)}` });
  }
  if (halted.length && halted.length === live.length) {
    findings.push({ id: 'demiurge:halted', system: 'Demiurge', tone: 'info', chronic: true, title: `Fleet halted · ${plural(halted.length, 'Steward')}`, href: '/demiurge', action: 'resume-fleet' });
  }

  const workingCount = working ?? active.length;
  let line: string;
  if (!live.length) line = 'No live Stewards';
  else if (halted.length === live.length) line = `All ${fmtInt(live.length)} halted`;
  else line = [`${fmtInt(active.length)} active`, paused.length ? `${fmtInt(paused.length)} paused` : '', halted.length ? `${fmtInt(halted.length)} halted` : ''].filter(Boolean).join(' · ');

  const series = arr(pick(overview, 'series', 'Series'));
  const spark = series.map((point: any, index: number) => ({ t: toMs(pick(point, 'day', 'Day', 't', 'T')) ?? index, v: n0(pick(point, 'spendUsd', 'SpendUsd', 'events', 'Events')) }));
  return {
    id: 'stewards', label: 'Demiurge', icon: 'stewards', href: '/demiurge',
    tone: findings.some(f => f.tone === 'warn') ? 'warn' : !live.length || halted.length === live.length ? 'idle' : 'ok',
    value: fmtInt(workingCount), unit: 'working', line,
    foot: approvals ? `${plural(approvals, 'approval')} waiting` : spend != null ? `${fmtMoney(spend, 'USD')} on models, 7 d` : undefined,
    spark: spark.length > 1 ? spark : undefined, sparkBars: true,
    findings,
  };
}

export function agentPulse(status: any, stats: any, notifications: any[] | null | undefined, jobs: any[] | null | undefined): HomePulse | null {
  if (!status && !stats) return null;
  const findings: HomeFinding[] = [];
  const ready = status ? !!status.ready : null;
  if (status && !ready) findings.push({ id: 'agent:ready', system: 'KliveAgent', tone: 'warn', title: 'KliveAgent is not ready', detail: clip(status.message || status.state), href: '/kliveagent' });

  const scripts = status?.health?.scripts;
  if (scripts?.belowFloor) {
    findings.push({
      id: 'agent:scripts', system: 'KliveAgent', tone: 'warn',
      title: `Scripts failing: ${fmtInt(scripts.failed)} of the last ${fmtInt(scripts.sampled)}`,
      detail: `${n0(scripts.firstPassPct).toFixed(0)}% ran first time (floor ${n0(scripts.floorPct).toFixed(0)}%)`,
      href: '/kliveagent?view=insights',
    });
  }
  if (status?.health?.provider?.slow) {
    findings.push({ id: 'agent:provider', system: 'KliveAgent', tone: 'warn', title: 'The model provider is slow', detail: `Median wait ${fmtDuration(n0(status.health.provider.medianWaitMs) / 1000)}`, href: '/kliveagent?view=insights' });
  }
  for (const job of arr(jobs).filter(j => j?.attentionRequired).slice(0, 2)) {
    findings.push({ id: `agent:job:${job.jobId}`, system: 'KliveAgent', tone: 'warn', title: clip(job.name || 'A long-running job needs you', 70), detail: clip(job.attentionMessage || job.goal, 90), href: '/kliveagent' });
  }
  const unread = arr(notifications).length;
  const today = num(stats?.TodayMessages);
  const ran = num(stats?.TodayScriptsRun);
  const failed = num(stats?.TodayScriptFailures);
  const line = [
    ready === false ? clip(status?.state || 'starting', 24) : ready ? 'Ready' : '',
    ran ? `${fmtInt(ran - (failed ?? 0))}/${fmtInt(ran)} scripts ran today` : today != null ? `${plural(today, 'message')} today` : '',
  ].filter(Boolean).join(' · ');
  const cost = num(stats?.TodayEstimatedCostUsd);
  return {
    id: 'agent', label: 'KliveAgent', icon: 'agent', href: '/kliveagent',
    tone: findings.some(f => f.tone === 'crit') ? 'crit' : findings.length ? 'warn' : ready === false ? 'warn' : 'ok',
    value: fmtInt(unread), unit: unread === 1 ? 'unread note' : 'unread notes',
    line: line || NONE,
    foot: cost ? `${fmtMoney(cost, 'USD')} today` : today != null ? `${plural(today, 'message')} today` : undefined,
    findings,
  };
}

export function traderPulse(firm: any, now: number): HomePulse | null {
  if (!firm) return null;
  const currency = str(firm.Portfolio?.ReportingCurrency) || 'GBP';
  const real = num(firm.Portfolio?.TotalValue);
  const hasReal = !!firm.Portfolio?.HasRealAccounts;
  const simulated = num(firm.Simulated?.TotalValue);
  const exceptions = firm.Exceptions ?? {};
  const unknown = n0(exceptions.UnknownOrders);
  const breaks = n0(exceptions.MaterialBreaks);
  const critical = Math.max(n0(exceptions.CriticalAlerts), n0(exceptions.UnacknowledgedCritical));
  const findings: HomeFinding[] = [];
  if (unknown || breaks || critical) {
    findings.push({ id: 'trader:exceptions', system: 'OmniTrader', tone: 'crit', title: 'Trading exceptions', detail: [unknown ? plural(unknown, 'unknown order') : '', breaks ? plural(breaks, 'material break') : '', critical ? plural(critical, 'critical alert') : ''].filter(Boolean).join(' · '), href: '/omnitrader/desk' });
  }
  if (firm.Controls?.SafeModeActive) findings.push({ id: 'trader:safe', system: 'OmniTrader', tone: 'warn', title: 'Firm safe mode is on', detail: clip(firm.Controls?.SafeModeReason || 'New orders are blocked'), href: '/omnitrader/risk', since: toMs(firm.Controls?.SafeModeSinceUtc) });
  if (firm.Health && firm.Health.TradingPermitted === false) findings.push({ id: 'trader:blocked', system: 'OmniTrader', tone: 'warn', title: 'Trading is paused', detail: clip(arr(firm.Health.Blockers).join(' · ') || firm.Health.Summary), href: '/omnitrader/risk' });
  const loud = arr(firm.Alerts).filter((alert: any) => alert?.Open !== false && !alert?.ResolvedUtc && /^(high|critical)$/i.test(str(alert?.Severity)));
  for (const alert of loud.slice(0, 2)) {
    findings.push({ id: `trader:alert:${alert.Id}`, system: 'OmniTrader', tone: /critical/i.test(alert.Severity) ? 'crit' : 'warn', title: clip(alert.Title, 60), detail: clip(alert.Message, 90), href: '/omnitrader/desk', since: toMs(alert.RaisedUtc) });
  }
  const points = arr(firm.Trend?.Points).map((point: any) => ({ t: toMs(point.Ts ?? point.Timestamp) ?? 0, v: n0(point.Value ?? point.TotalValue) }));
  const realSpark = points.some(point => point.v !== 0) ? points : undefined;
  const running = num(firm.Strategies?.Running);
  return {
    id: 'trader', label: 'OmniTrader', icon: 'trader', href: '/omnitrader',
    tone: findings.some(f => f.tone === 'crit') ? 'crit' : findings.length ? 'warn' : hasReal && real ? 'ok' : 'idle',
    value: hasReal ? fmtMoney(real, currency) : fmtMoney(simulated, currency), unit: hasReal ? 'real' : 'paper',
    line: [hasReal && simulated ? `${fmtMoney(simulated, currency)} paper` : '', running != null ? `${plural(running, 'strategy', 'strategies')} running` : ''].filter(Boolean).join(' · ') || clip(firm.Health?.Summary, 50) || NONE,
    foot: realSpark && firm.Trend?.ChangePercent24h != null ? `${n0(firm.Trend.ChangePercent24h) >= 0 ? '+' : ''}${n0(firm.Trend.ChangePercent24h).toFixed(2)}% in 24 h` : undefined,
    spark: realSpark,
    findings,
  };
}

export function cs2Pulse(status: any, now: number): HomePulse | null {
  if (!status) return null;
  const engine = status.engine ?? {};
  const findings: HomeFinding[] = [];
  const session = status.steamSession ?? {};
  if (session.problem) {
    const since = toMs(session.problemSinceUtc);
    findings.push({ id: 'cs2:steam', system: 'CS2 Arbitrage', tone: 'warn', title: clip(session.problem, 80), detail: since ? `Since ${fmtRelative(since, now)}; Steam selling and the wallet balance wait on it` : undefined, href: '/schemery/cs2arbitragebot', since });
  }
  const lastFeed = toMs(engine.LastFeedPollUtc);
  const running = /running/i.test(str(engine.State));
  if (status.settings?.ScanningEnabled !== false && running && lastFeed != null && now - lastFeed > 15 * 60_000) {
    findings.push({ id: 'cs2:feed', system: 'CS2 Arbitrage', tone: 'warn', title: 'The CSFloat feed has gone quiet', detail: `Last poll ${fmtRelative(lastFeed, now)}`, href: '/schemery/cs2arbitragebot', since: lastFeed });
  }
  if (status.trades?.lastError) findings.push({ id: 'cs2:trades', system: 'CS2 Arbitrage', tone: 'warn', title: 'Trade checks are failing', detail: clip(status.trades.lastError, 90), href: '/schemery/cs2arbitragebot' });
  if (status.startupState && !/running/i.test(str(status.startupState))) findings.push({ id: 'cs2:start', system: 'CS2 Arbitrage', tone: 'info', title: `CS2 Arbitrage is ${clip(status.startupState, 30)}`, href: '/schemery/cs2arbitragebot' });
  const balance = num(status.balances?.csfloatGbp);
  const scanning = status.settings?.ScanningEnabled !== false;
  return {
    id: 'cs2', label: 'CS2 Arbitrage', icon: 'cs2', href: '/schemery/cs2arbitragebot',
    tone: findings.some(f => f.tone === 'warn') ? 'warn' : scanning && running ? 'ok' : 'idle',
    value: fmtInt(engine.Opportunities ?? 0), unit: n0(engine.Opportunities) === 1 ? 'opportunity' : 'opportunities',
    line: [`${fmtCompact(engine.ListingsSeen ?? 0)} listings seen`, `${plural(n0(engine.Purchases), 'buy', 'buys')}`].join(' · '),
    foot: [balance != null ? `£${balance.toFixed(2)} on CSFloat` : '', status.settings?.PurchasingEnabled === false ? 'buying off' : ''].filter(Boolean).join(' · ') || undefined,
    findings,
  };
}

export function memesPulse(summary: any, now: number): HomePulse | null {
  if (!summary) return null;
  const findings: HomeFinding[] = [];
  const failing = n0(summary.FailingSources);
  if (failing) findings.push({ id: 'memes:failing', system: 'MemeScraper', tone: 'warn', title: `${plural(failing, 'source')} failing to scrape`, href: '/schemery/memescraper' });
  const due = toMs(summary.NextScrapeDueUtc);
  const tick = toMs(summary.LastSchedulerTickUtc);
  const last = toMs(summary.LastDownloadUtc);
  const intervalH = num(summary.ScrapeIntervalHours) ?? 24;
  const paused = summary.Paused === true;
  if (!paused && tick != null && now - tick > 20 * 60_000) {
    findings.push({ id: 'memes:scheduler', system: 'MemeScraper', tone: 'warn', title: 'The scrape scheduler has stopped ticking', detail: `Last tick ${fmtRelative(tick, now)}`, href: '/schemery/memescraper', since: tick });
  } else if (!paused && due != null && now - due > 2 * 3600_000) {
    findings.push({ id: 'memes:overdue', system: 'MemeScraper', tone: 'warn', title: 'Scrapes are overdue', detail: `One was due ${fmtRelative(due, now)}`, href: '/schemery/memescraper', since: due });
  } else if (!paused && due == null && last != null && now - last > (intervalH * 2 + 6) * 3600_000) {
    // An older server without the schedule: only flag what is clearly beyond any interval.
    findings.push({ id: 'memes:quiet', system: 'MemeScraper', tone: 'warn', title: 'No new reels', detail: `Last one ${fmtRelative(last, now)}`, href: '/schemery/memescraper', since: last });
  }
  const perDay = summary.MemesDownloadedPerDay && typeof summary.MemesDownloadedPerDay === 'object'
    ? Object.keys(summary.MemesDownloadedPerDay).sort().map(day => ({ t: toMs(`${day}T12:00:00Z`) ?? 0, v: n0(summary.MemesDownloadedPerDay[day]) }))
    : [];
  const week = num(summary.Downloaded7d);
  const prev = num(summary.DownloadedPrev7d);
  return {
    id: 'memes', label: 'MemeScraper', icon: 'memes', href: '/schemery/memescraper',
    tone: findings.length ? 'warn' : paused ? 'idle' : 'ok',
    value: fmtInt(summary.DownloadedToday ?? 0), unit: 'reels today',
    line: [week != null ? `${fmtInt(week)} this week` : '', week != null && prev ? `${week >= prev ? '+' : ''}${Math.round(((week - prev) / prev) * 100)}%` : '', `${fmtCompact(summary.TotalReelsDownloaded ?? 0)} kept`].filter(Boolean).join(' · '),
    foot: paused ? 'Scheduled scrapes paused' : due != null && due > now ? `Next scrape ${fmtRelative(due, now)}` : last != null ? `Last reel ${fmtRelative(last, now)}` : undefined,
    spark: perDay.length > 1 ? perDay : undefined, sparkBars: true,
    findings,
  };
}

export function tumblrPulse(stats: any, now: number): HomePulse | null {
  if (!stats) return null;
  const total = n0(stats.TotalAccounts);
  const findings: HomeFinding[] = [];
  const attention = arr(stats.Attention);
  if (attention.length) {
    // Not a destructured for-of: Nuxt's auto-import misreads one and can shadow later top-level consts.
    attention.slice(0, 2).forEach((item: any, index: number) => {
      findings.push({ id: `tumblr:attention:${index}:${clip(item.Title, 40)}`, system: 'OmniTumblr', tone: str(item.Level) === 'error' ? 'crit' : 'warn', title: clip(item.Title, 80), href: '/schemery/omnitumblr' });
    });
  } else if (n0(stats.AttentionCount)) {
    findings.push({ id: 'tumblr:attention', system: 'OmniTumblr', tone: 'warn', title: `${plural(n0(stats.AttentionCount), 'thing')} to look at`, href: '/schemery/omnitumblr' });
  }
  const awaiting = num(stats.AwaitingApproval);
  if (awaiting) findings.push({ id: 'tumblr:approval', system: 'OmniTumblr', tone: 'info', title: `${plural(awaiting, 'post')} waiting for your approval`, href: '/schemery/omnitumblr' });
  const next = toMs(stats.NextPostUtc);
  const autopilot = n0(stats.AutopilotBlogs ?? stats.ActiveAccounts);
  return {
    id: 'tumblr', label: 'OmniTumblr', icon: 'tumblr', href: '/schemery/omnitumblr',
    tone: findings.some(f => f.tone === 'crit') ? 'crit' : findings.some(f => f.tone === 'warn') ? 'warn' : total ? 'ok' : 'idle',
    value: fmtInt(stats.PostsThisWeek ?? 0), unit: 'posts this week',
    line: total ? `${fmtInt(autopilot)}/${fmtInt(total)} blogs on autopilot · ${fmtInt(stats.PendingCount ?? 0)} queued` : 'No blogs connected',
    foot: next != null && next > now ? `Next post ${fmtRelative(next, now)}${stats.NextPostBlog ? ` on ${stats.NextPostBlog}` : ''}` : stats.TotalFollowers != null ? `${plural(n0(stats.TotalFollowers), 'follower')}` : undefined,
    findings,
  };
}

export function gramPulse(stats: any): HomePulse | null {
  if (!stats) return null;
  const total = n0(stats.TotalAccounts);
  const findings: HomeFinding[] = [];
  if (n0(stats.AttentionCount)) findings.push({ id: 'gram:attention', system: 'OmniGram', tone: 'warn', title: `${plural(n0(stats.AttentionCount), 'account')} need attention`, href: '/schemery/omnigram' });
  if (n0(stats.ErrorAccounts)) findings.push({ id: 'gram:errors', system: 'OmniGram', tone: 'warn', title: `${plural(n0(stats.ErrorAccounts), 'account')} in error`, href: '/schemery/omnigram' });
  return {
    id: 'gram', label: 'OmniGram', icon: 'gram', href: '/schemery/omnigram',
    tone: findings.length ? 'warn' : total ? 'ok' : 'idle',
    value: total ? fmtInt(stats.PostsThisWeek ?? 0) : NONE, unit: total ? 'posts this week' : '',
    line: total ? `${fmtInt(stats.AutopilotAccounts ?? stats.ActiveAccounts ?? 0)}/${fmtInt(total)} on autopilot · ${fmtInt(stats.PendingCount ?? 0)} queued` : 'No accounts connected',
    foot: total && stats.TotalFollowers != null ? plural(n0(stats.TotalFollowers), 'follower') : undefined,
    findings,
  };
}

export function defencePulse(overview: any, pending: boolean): HomePulse | null {
  if (!overview && !pending) return null;
  if (!overview) {
    return { id: 'defence', label: 'OmniDefence', icon: 'defence', href: '/omnidefence', tone: 'neutral', value: NONE, line: 'Building its overview…', findings: [] };
  }
  const findings: HomeFinding[] = [];
  const hostile = n0(overview.review?.hostileAnsweredCount);
  const benign = n0(overview.review?.benignPenalisedCount);
  if (hostile >= 10) findings.push({ id: 'defence:hostile', system: 'OmniDefence', tone: 'info', title: `${plural(hostile, 'hostile address', 'hostile addresses')} still answered`, detail: 'Review them on OmniDefence', href: '/omnidefence' });
  if (benign >= 10) findings.push({ id: 'defence:benign', system: 'OmniDefence', tone: 'info', title: `${plural(benign, 'likely person', 'likely people')} penalised`, href: '/omnidefence' });
  const requests = n0(overview.requests24h);
  const denied = n0(overview.denied24h);
  const hourly = arr(overview.hourly).slice(-24).map((bucket: any) => ({ t: n0(bucket.h) * 1000, v: n0(bucket.requests) }));
  return {
    id: 'defence', label: 'OmniDefence', icon: 'defence', href: '/omnidefence',
    tone: 'ok',
    value: fmtCompact(requests), unit: 'requests, 24 h',
    line: `${fmtCompact(denied)} denied${requests ? ` (${Math.round((denied / requests) * 100)}%)` : ''} · ${fmtInt(overview.blockedIps ?? 0)} blocked`,
    foot: `${fmtInt(overview.watchedIps ?? 0)} watched · ${fmtInt(n0(overview.tarpitIps) + n0(overview.honeypotIps))} trapped`,
    spark: hourly.length > 1 ? hourly : undefined, sparkBars: true,
    findings,
  };
}

export function mailPulse(stats: any, code: MailCode | null, now: number): HomePulse | null {
  if (!stats) return null;
  const unread = n0(stats.unread ?? stats.Unread);
  const last = toMs(stats.lastReceivedUtc);
  return {
    id: 'mail', label: 'KliveMail', icon: 'mail', href: '/klivemail',
    tone: 'ok',
    value: fmtInt(unread), unit: 'unread',
    line: `${fmtInt(stats.received24h ?? 0)} today · ${fmtInt(stats.received7d ?? 0)} this week`,
    foot: code ? `Code from ${code.from} ${fmtRelative(code.at, now)}` : last != null ? `Last mail ${fmtRelative(last, now)}` : undefined,
    findings: [],
  };
}

export function cloudPulse(drive: any): HomePulse | null {
  if (!drive) return null;
  const used = num(drive.UsedCapacityGB ?? drive.UsedSpaceGB);
  const total = num(drive.TotalCapacityGB ?? drive.TotalSpaceGB);
  const free = num(drive.FreeCapacityGB ?? drive.AvailableSpaceGB);
  const pct = num(drive.UsagePercentage);
  const findings: HomeFinding[] = [];
  if (pct != null && pct >= 92) findings.push({ id: 'cloud:full', system: 'KliveCloud', tone: pct >= 97 ? 'crit' : 'warn', title: `The cloud drive is ${pct.toFixed(0)}% full`, detail: free != null ? `${fmtGB(free)} free` : undefined, href: '/klivecloud' });
  return {
    id: 'cloud', label: 'KliveCloud', icon: 'cloud', href: '/klivecloud',
    tone: findings.length ? findings[0].tone as HomeTone : 'ok',
    value: free != null ? fmtGB(free, 0).replace(' ', ' ') : NONE, unit: 'free',
    line: used != null && total != null ? `${fmtGB(used, 0)} of ${fmtGB(total, 0)} used` : pct != null ? `${pct.toFixed(0)}% used` : NONE,
    findings,
  };
}

export function omnisciencePulse(stats: any): HomePulse | null {
  if (!stats) return null;
  const alerts = n0(stats.radar_alerts_24h ?? stats.radarAlerts);
  return {
    id: 'omniscience', label: 'Omniscience', icon: 'intel', href: '/omniscience',
    tone: alerts ? 'warn' : 'ok',
    value: fmtInt(alerts), unit: alerts === 1 ? 'radar alert, 24 h' : 'radar alerts, 24 h',
    line: `${fmtCompact(stats.messages ?? 0)} messages · ${fmtCompact(stats.persons ?? 0)} people`,
    foot: stats.tracked != null ? `${fmtInt(stats.tracked)} tracked · ${fmtInt(stats.facts_active ?? 0)} facts` : undefined,
    findings: alerts ? [{ id: 'omniscience:radar', system: 'Omniscience', tone: 'info', title: `${plural(alerts, 'radar alert')} in the last day`, href: '/omniscience?view=review&tab=mentions' }] : [],
  };
}

export function gamesPulse(payload: any): HomePulse | null {
  if (!payload) return null;
  const servers = arr(payload.servers ?? payload);
  const running = servers.filter((server: any) => /^(running|ready|started)$/i.test(str(server.Status ?? server.status)));
  const players = running.reduce((sum: number, server: any) => sum + arr(server.OnlinePlayers).length, 0);
  const failed = servers.filter((server: any) => /crash|fail|error/i.test(str(server.Status)) || (server.LastError && !/stopped/i.test(str(server.Status))));
  return {
    id: 'games', label: 'KliveGames', icon: 'games', href: '/klivegames',
    tone: failed.length ? 'warn' : running.length ? 'ok' : 'idle',
    value: `${fmtInt(running.length)}/${fmtInt(servers.length)}`, unit: 'running',
    line: running.length ? `${plural(players, 'player')} online` : servers.length ? 'All servers stopped' : 'No servers',
    findings: failed.slice(0, 1).map((server: any) => ({ id: `games:${server.Id}`, system: 'KliveGames', tone: 'warn' as const, title: `${server.Name} has a problem`, detail: clip(server.LastError || server.Status, 90), href: '/klivegames' })),
  };
}

export function techPulse(gadgets: any[] | null | undefined): HomePulse | null {
  if (!Array.isArray(gadgets)) return null;
  const online = gadgets.filter(g => g?.isOnline ?? g?.IsConnected ?? g?.connected).length;
  return {
    id: 'tech', label: 'KliveTech', icon: 'tech', href: '/klivetech',
    tone: gadgets.length && !online ? 'warn' : gadgets.length ? 'ok' : 'idle',
    value: `${fmtInt(online)}/${fmtInt(gadgets.length)}`, unit: 'online',
    line: gadgets.length ? `${plural(gadgets.length, 'gadget')} known` : 'No gadgets paired',
    findings: [],
  };
}

export function linkPulse(agents: any[] | null | undefined): HomePulse | null {
  if (!Array.isArray(agents)) return null;
  const online = agents.filter(a => (a?.online ?? a?.Online ?? a?.isConnected ?? a?.IsConnected ?? a?.connected) !== false).length;
  return {
    id: 'link', label: 'KliveLink', icon: 'link', href: '/klivelink',
    tone: online ? 'ok' : 'idle',
    value: fmtInt(online), unit: 'connected',
    line: agents.length ? `${plural(agents.length, 'machine')} known` : 'No machines connected',
    findings: [],
  };
}

export function bloxPulse(overview: any, now: number): HomePulse | null {
  if (!overview) return null;
  const tasks = arr(overview.OwnerTasks).filter((task: any) => !task.ResolvedUtc && !/resolved|done|closed/i.test(str(task.Status)));
  const findings: HomeFinding[] = [];
  if (tasks.length) {
    const oldest = Math.min(...tasks.map((task: any) => toMs(task.CreatedUtc) ?? now));
    findings.push({ id: 'blox:tasks', system: 'OmniBlox', tone: 'warn', title: `${plural(tasks.length, 'task')} for you`, detail: clip(tasks[0].Title, 90), href: '/schemery/omniblox', since: oldest });
  }
  for (const item of arr(overview.Attention).filter((a: any) => /error|warn/i.test(str(a.Level))).slice(0, 1)) {
    findings.push({ id: `blox:${clip(item.Title, 40)}`, system: 'OmniBlox', tone: /error/i.test(item.Level) ? 'crit' : 'warn', title: clip(item.Title, 80), detail: clip(item.Detail, 90), href: '/schemery/omniblox' });
  }
  const stages = overview.StageCounts ?? {};
  const inProgress = n0(stages.Research) + n0(stages.Build) + n0(stages.Test) + n0(stages.Launch);
  const live = n0(stages.Live);
  return {
    id: 'blox', label: 'OmniBlox', icon: 'blox', href: '/schemery/omniblox',
    tone: findings.some(f => f.tone === 'crit') ? 'crit' : findings.length ? 'warn' : overview.Enabled ? 'ok' : 'idle',
    value: fmtInt(live), unit: live === 1 ? 'game live' : 'games live',
    line: [`${fmtInt(inProgress)} in the works`, overview.Enabled === false ? 'studio off' : ''].filter(Boolean).join(' · '),
    foot: num(overview.Money?.Revenue7dRobux) ? `${fmtInt(overview.Money.Revenue7dRobux)} Robux in 7 d` : tasks.length ? `${plural(tasks.length, 'task')} waiting on you` : undefined,
    findings,
  };
}

/** Every tile this profile's sources allow, in a fixed order the frecency list then reorders. */
export function buildPulses(sources: HomeSources, now: number): HomePulse[] {
  return [
    demiurgePulse(sources.stewards, sources.demiurgeOverview, now),
    agentPulse(sources.agentStatus, sources.agentStats, sources.agentNotifications, sources.agentJobs),
    traderPulse(sources.trader, now),
    bloxPulse(sources.blox, now),
    tumblrPulse(sources.tumblr, now),
    memesPulse(sources.memes, now),
    cs2Pulse(sources.cs2, now),
    gramPulse(sources.gram),
    defencePulse(sources.defence, !!sources.defencePending),
    mailPulse(sources.mail, sources.mailCode ?? null, now),
    cloudPulse(sources.cloud),
    omnisciencePulse(sources.omniscience),
    gamesPulse(sources.games),
    techPulse(sources.gadgets),
    linkPulse(sources.linkAgents),
  ].filter((pulse): pulse is HomePulse => pulse != null);
}

/**
 * Tiles in the order this browser uses their pages, so the busiest ones sit first; ties keep the
 * fixed order. Idle systems (nothing set up) always go last.
 */
export function orderPulses(pulses: HomePulse[], frecency: Map<string, number>): HomePulse[] {
  return pulses
    .map((pulse, index) => ({ pulse, index, score: frecency.get(pulse.href) ?? 0 }))
    .sort((a, b) => Number(a.pulse.tone === 'idle') - Number(b.pulse.tone === 'idle') || b.score - a.score || a.index - b.index)
    .map(entry => entry.pulse);
}

// ───────────────────────────── verdict ─────────────────────────────

export interface HomeVerdict { tone: 'ok' | 'warn' | 'crit' | 'neutral'; title: string; detail: string }

const FINDING_RANK: Record<FindingTone, number> = { crit: 3, warn: 2, info: 1 };

/**
 * Worst first; within a tone, what is true right now and has no start time (a stopped service), then
 * the newest: a problem from this morning is more likely to need doing than one known for a fortnight.
 */
export function sortFindings(findings: HomeFinding[]): HomeFinding[] {
  const recency = (finding: HomeFinding) => finding.since ?? Number.MAX_SAFE_INTEGER;
  return [...findings].sort((a, b) => FINDING_RANK[b.tone] - FINDING_RANK[a.tone] || recency(b) - recency(a));
}

/** Findings that count: not chronic, not muted by the viewer. Chronic and muted ones are said quietly. */
export function splitFindings(findings: HomeFinding[], muted: Set<string>): { loud: HomeFinding[]; quiet: HomeFinding[] } {
  const loud: HomeFinding[] = [];
  const quiet: HomeFinding[] = [];
  for (const finding of sortFindings(findings)) {
    if (finding.chronic || muted.has(finding.id) || finding.tone === 'info') quiet.push(finding);
    else loud.push(finding);
  }
  return { loud, quiet };
}

export function buildVerdict(loud: HomeFinding[], opts: { loading: boolean; offline: boolean; starting: boolean; systems: number }): HomeVerdict {
  if (opts.offline) return { tone: 'crit', title: "The server isn't answering", detail: 'Showing what was last seen. This page keeps trying.' };
  if (opts.starting) return { tone: 'neutral', title: 'The server is starting', detail: 'Services come back one by one; this fills in as they do.' };
  if (opts.loading && !loud.length) return { tone: 'neutral', title: 'Checking everything…', detail: '' };
  const crit = loud.filter(f => f.tone === 'crit');
  const warn = loud.filter(f => f.tone === 'warn');
  if (crit.length) return { tone: 'crit', title: crit.length === 1 ? crit[0].title : `${crit.length} things need you now`, detail: crit.length === 1 ? `${crit[0].system}${crit[0].detail ? ` · ${crit[0].detail}` : ''}` : summarise(loud) };
  if (warn.length) return { tone: 'warn', title: warn.length === 1 ? warn[0].title : `${warn.length} things to look at`, detail: warn.length === 1 ? `${warn[0].system}${warn[0].detail ? ` · ${warn[0].detail}` : ''}` : summarise(loud) };
  return { tone: 'ok', title: 'Everything is running', detail: opts.systems ? `${opts.systems} systems checked` : '' };
}

function summarise(findings: HomeFinding[]): string {
  const systems = [...new Set(findings.map(f => f.system))];
  return systems.length <= 3 ? systems.join(', ') : `${systems.slice(0, 3).join(', ')} and ${systems.length - 3} more`;
}

// ───────────────────────────── muting ─────────────────────────────

/** A mute lasts a day, then the finding counts again if it is still true. */
export const MUTE_MS = 24 * 3600_000;

export function activeMutes(stored: Record<string, number> | null | undefined, now: number): Set<string> {
  const out = new Set<string>();
  for (const id of Object.keys(stored ?? {})) if ((stored as Record<string, number>)[id] > now) out.add(id);
  return out;
}

// ───────────────────────────── pages ─────────────────────────────

export interface HomePage { path: string; label: string; icon: string; group: string; about: string; keywords?: string }

/** Every page worth offering from Home; the access table decides which a profile sees. */
export const HOME_PAGES: HomePage[] = [
  { path: '/kliveagent', label: 'KliveAgent', icon: 'agent', group: 'Klive Suite', about: 'Talk to the agent, its jobs and notes', keywords: 'ai chat assistant' },
  { path: '/demiurge', label: 'Demiurge', icon: 'stewards', group: 'Klive Suite', about: 'Autonomous task forces', keywords: 'fleet commander agents stewards projects' },
  { path: '/klivecloud', label: 'KliveCloud', icon: 'cloud', group: 'Klive Suite', about: 'Files, folders and share links', keywords: 'drive storage upload' },
  { path: '/klivemail', label: 'KliveMail', icon: 'mail', group: 'Klive Suite', about: 'Every mailbox on klive.dev', keywords: 'email inbox codes' },
  { path: '/klivechat', label: 'KliveChat', icon: 'chat', group: 'Klive Suite', about: 'Rooms and messages', keywords: 'chat rooms' },
  { path: '/klivetech', label: 'KliveTech', icon: 'tech', group: 'Klive Suite', about: 'Gadgets and their telemetry', keywords: 'devices hardware esp' },
  { path: '/klivegames', label: 'KliveGames', icon: 'games', group: 'Klive Suite', about: 'Game servers', keywords: 'minecraft rust servers' },
  { path: '/klivelink', label: 'KliveLink', icon: 'link', group: 'Klive Suite', about: 'Connected machines', keywords: 'agents remote' },
  { path: '/klivetools', label: 'KliveTools', icon: 'tools', group: 'Klive Suite', about: 'Small utilities', keywords: 'tools' },
  { path: '/stratum', label: 'Stratum', icon: 'stratum', group: 'Klive Suite', about: 'Engineering agent and geometry', keywords: 'cad engineer' },
  { path: '/omnitrader', label: 'OmniTrader', icon: 'trader', group: 'Schemes', about: 'Firm, desk, research and terminal', keywords: 'trading stocks crypto' },
  { path: '/schemery/omniblox', label: 'OmniBlox', icon: 'blox', group: 'Schemes', about: 'The Roblox studio', keywords: 'roblox games studio' },
  { path: '/schemery/omnitumblr', label: 'OmniTumblr', icon: 'tumblr', group: 'Schemes', about: 'Tumblr autopilot', keywords: 'tumblr blogs posts' },
  { path: '/schemery/memescraper', label: 'MemeScraper', icon: 'memes', group: 'Schemes', about: 'Reels from Instagram sources', keywords: 'memes reels instagram' },
  { path: '/schemery/cs2arbitragebot', label: 'CS2 Arbitrage', icon: 'cs2', group: 'Schemes', about: 'CSFloat to Steam arbitrage', keywords: 'cs2 skins steam csfloat' },
  { path: '/schemery/omnigram', label: 'OmniGram', icon: 'gram', group: 'Schemes', about: 'Instagram autopilot', keywords: 'instagram' },
  { path: '/schemery/omnitube', label: 'OmniTube', icon: 'tube', group: 'Schemes', about: 'Not built yet', keywords: 'youtube' },
  { path: '/schemes', label: 'All schemes', icon: 'schemes', group: 'Schemes', about: 'Every scheme on one page', keywords: 'overview' },
  { path: '/omniscience', label: 'Omniscience', icon: 'intel', group: 'Intel', about: 'People, messages and the radar', keywords: 'intel radar people' },
  { path: '/omnidefence', label: 'OmniDefence', icon: 'defence', group: 'Intel', about: 'Requests, addresses and blocks', keywords: 'security firewall block ip' },
  { path: '/tripwires', label: 'Tripwires', icon: 'zap', group: 'Intel', about: 'Canary links and who touched them', keywords: 'canary trap' },
  { path: '/admin', label: 'Admin', icon: 'server', group: 'Ops', about: 'Server vitals, services and deploys', keywords: 'server services restart deploy' },
  { path: '/klivellm', label: 'KliveLLM', icon: 'llm', group: 'Ops', about: 'Models, routing and spend', keywords: 'models llm routing cost' },
  { path: '/botSchedule', label: 'Schedule', icon: 'calendar', group: 'Ops', about: 'Every scheduled task', keywords: 'tasks cron timer' },
  { path: '/administration/botlogs', label: 'Logs', icon: 'logs', group: 'Ops', about: 'Service log', keywords: 'errors logs' },
  { path: '/administration/omnisettings', label: 'Settings', icon: 'settings', group: 'Ops', about: 'OmniSettings', keywords: 'config secrets' },
  { path: '/administration/profiles', label: 'Profiles', icon: 'users', group: 'Ops', about: 'Who can sign in and what they may do', keywords: 'users permissions accounts' },
  { path: '/administration/api-telemetry', label: 'API telemetry', icon: 'activity', group: 'Ops', about: 'Latency and traffic per route', keywords: 'latency traces' },
  { path: '/account', label: 'Your account', icon: 'user', group: 'You', about: 'Sessions and permissions', keywords: 'password session' },
];

export const PAGE_GROUPS = ['Klive Suite', 'Schemes', 'Intel', 'Ops', 'You'];

// ───────────────────────────── frecency ─────────────────────────────

/** How often and how recently this browser opened a page. A visit's weight halves every three days. */
export interface VisitRecord { path: string; title?: string; score: number; at: number; count: number }

export const FRECENCY_HALF_LIFE_MS = 3 * 24 * 3600_000;
export const VISITS_KEY = 'km:home:visits:v1';
const MAX_VISIT_RECORDS = 60;

export function decayed(record: VisitRecord, now: number): number {
  return record.score * Math.pow(0.5, Math.max(0, now - record.at) / FRECENCY_HALF_LIFE_MS);
}

/** Top-level page a path counts towards: a Steward counts as Demiurge, a person as Omniscience. */
export function pageKey(path: string): string {
  const clean = (path || '').split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  const known = HOME_PAGES.map(page => page.path).sort((a, b) => b.length - a.length).find(prefix => clean === prefix || clean.startsWith(`${prefix}/`));
  if (known) return known;
  if (clean.startsWith('/omniscience')) return '/omniscience';
  if (clean.startsWith('/administration/')) return clean.split('/').slice(0, 3).join('/');
  return clean;
}

export function recordVisit(records: VisitRecord[], path: string, now: number, title?: string): VisitRecord[] {
  const key = pageKey(path);
  if (!key || key === '/' || key === '/dashboard') return records;
  const next = records.filter(record => record.path !== key);
  const existing = records.find(record => record.path === key);
  next.push({
    path: key,
    title: title || existing?.title,
    score: (existing ? decayed(existing, now) : 0) + 1,
    at: now,
    count: (existing?.count ?? 0) + 1,
  });
  return next.sort((a, b) => decayed(b, now) - decayed(a, now)).slice(0, MAX_VISIT_RECORDS);
}

export function frecencyMap(records: VisitRecord[], now: number): Map<string, number> {
  return new Map(records.map(record => [record.path, decayed(record, now)]));
}

/** Seeds an empty history from the server's page log (oldest first), so a new browser starts useful. */
export function seedVisits(items: Array<{ page?: string; tsMs?: number; title?: string }>): VisitRecord[] {
  let records: VisitRecord[] = [];
  const sorted = [...items].filter(item => item.page && item.tsMs).sort((a, b) => (a.tsMs ?? 0) - (b.tsMs ?? 0));
  for (const item of sorted) records = recordVisit(records, item.page!, item.tsMs!, item.title);
  return records;
}

// ───────────────────────────── commands ─────────────────────────────

export interface HomeCommand {
  id: string;
  /** "Stewards" and "Services" are listed only once something is typed. */
  group: 'Go to' | 'Actions' | 'Stewards' | 'Services';
  title: string;
  icon: string;
  keywords?: string;
  hint?: string;
  /** Needs a second Enter: it stops or starts work. */
  danger?: boolean;
  run: () => unknown;
}

// ───────────────────────────── greeting ─────────────────────────────

export function greeting(name: string, now: Date): string {
  const hour = now.getHours();
  const part = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const first = name.trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}
