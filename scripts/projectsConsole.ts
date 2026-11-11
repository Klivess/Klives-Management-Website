/*
 * Pure rules for the Projects console: what a project's state is called and coloured, the one-line
 * verdict on the fleet, filters, sorting, formatting and the command palette's scoring. No Vue and
 * no fetches, so every rule is testable and the pages stay about layout.
 */
import { commandScore, fmtInt } from '~/scripts/adminConsole';
import type { OverviewPoint, OverviewProject, OverviewResult, OverviewSnapshot } from '~/composables/useProjectsOverview';

export type PjTone = 'work' | 'need' | 'fault' | 'plan' | 'info' | 'rest' | 'accent';

export interface PjState { key: string; label: string; tone: PjTone; live: boolean; icon: string }

/** What one project is doing, as one word and one of the four colours. */
export function projectState(p: Pick<OverviewProject, 'status' | 'halted' | 'workingAgents' | 'executionDisposition'>): PjState {
  if (p.status === 'Archived') return { key: 'shelved', label: 'Shelved', tone: 'rest', live: false, icon: 'archive' };
  if (p.status === 'Completed') return { key: 'done', label: 'Completed', tone: 'info', live: false, icon: 'check-circle' };
  if (p.status === 'Blocked') return { key: 'blocked', label: 'Blocked', tone: 'fault', live: false, icon: 'octagon-x' };
  if (p.status === 'BudgetPaused') return { key: 'budget', label: 'Out of budget', tone: 'fault', live: false, icon: 'coins' };
  if ((p.workingAgents ?? 0) > 0) return { key: 'working', label: 'Working', tone: 'work', live: true, icon: 'zap' };
  if (p.halted) return { key: 'halted', label: 'Halted', tone: 'rest', live: false, icon: 'pause' };
  if (p.executionDisposition === 'Pausing') return { key: 'pausing', label: 'Pausing', tone: 'rest', live: false, icon: 'pause' };
  if (p.status === 'Paused') return { key: 'paused', label: 'Paused', tone: 'rest', live: false, icon: 'pause' };
  if (p.status === 'Planning') return { key: 'planning', label: 'Planning', tone: 'plan', live: false, icon: 'plan' };
  if (p.executionDisposition === 'Waiting') return { key: 'waiting', label: 'Waiting', tone: 'info', live: false, icon: 'hourglass' };
  return { key: 'ready', label: 'Between wakes', tone: 'info', live: false, icon: 'clock' };
}

/** A pending approval, as /projects/gates lists it. */
export interface PjNeedGate { gateID: string; kind: string; title: string; description: string; rationale?: string; createdAt: string }
/** One thing waiting on Klives: an approval (with its gate when loaded), a block or a budget pause. */
export interface PjNeed { key: string; kind: string; projectID: string; projectName: string; label: string; since: string | null; gate?: PjNeedGate; more?: number }

export function needsYou(p: Pick<OverviewProject, 'pendingApprovals' | 'blocker' | 'status'>): boolean {
  return (p.pendingApprovals ?? 0) > 0 || !!p.blocker || p.status === 'Blocked' || p.status === 'BudgetPaused';
}

export function isRunnable(p: Pick<OverviewProject, 'status'>): boolean {
  return p.status === 'Active' || p.status === 'Planning';
}

// ───────────────────────────── fleet verdict ─────────────────────────────

export interface PjCacheHalt { engaged: boolean; engagedAt: string | null; reason: string; haltedProjectIDs: string[] | null }
export interface PjVerdict { tone: PjTone; icon: string; headline: string; sub: string }

/** One sentence on the whole fleet, the thing to read before anything else on the page. */
export function fleetVerdict(snapshot: OverviewSnapshot | null, cacheHalt: PjCacheHalt | null, oldestNeedAt: string | null, now: number): PjVerdict {
  if (!snapshot) return { tone: 'rest', icon: 'clock', headline: 'Reading the fleet…', sub: 'Live project state arrives in a moment.' };
  const live = snapshot.projects.filter(p => p.status !== 'Archived');
  const needs = snapshot.attention?.length ?? 0;
  const needText = needs
    ? ` · ${needs} ${needs === 1 ? 'thing needs' : 'things need'} you${oldestNeedAt ? `, the oldest for ${ageWords(oldestNeedAt, now)}` : ''}`
    : '';

  if (cacheHalt?.engaged) {
    return {
      tone: 'fault', icon: 'octagon-x',
      headline: 'The prompt-cache guard has stopped the fleet',
      sub: `${cacheHalt.engagedAt ? `Since ${ageWords(cacheHalt.engagedAt, now)} ago. ` : ''}${cacheHalt.reason || 'No agent sends a model request until it is cleared.'}`,
    };
  }
  if (!live.length) {
    return { tone: 'rest', icon: 'rocket', headline: 'No projects are running', sub: 'Start one, or bring one back from the shelf.' };
  }
  const halted = live.filter(p => p.halted).length;
  const working = live.filter(p => (p.workingAgents ?? 0) > 0);
  const agents = working.reduce((n, p) => n + (p.workingAgents ?? 0), 0);
  if (working.length) {
    return {
      tone: 'work', icon: 'zap',
      headline: `${working.length} of ${live.length} ${plural(live.length, 'project')} working`,
      sub: `${agents} ${plural(agents, 'agent')} mid-turn${halted ? ` · ${halted} halted` : ''}${needText}`,
    };
  }
  if (halted === live.length) {
    return {
      tone: needs ? 'need' : 'rest', icon: 'pause',
      headline: `Fleet halted · all ${live.length} ${plural(live.length, 'project')} stopped`,
      sub: `Nothing runs until you unhalt${needText}`,
    };
  }
  if (needs) {
    return { tone: 'need', icon: 'inbox', headline: `Nothing running · ${needs} ${needs === 1 ? 'thing needs' : 'things need'} you`, sub: oldestNeedAt ? `The oldest has waited ${ageWords(oldestNeedAt, now)}.` : 'Approvals, blocks and budget pauses.' };
  }
  const paused = live.filter(p => p.status === 'Paused' || p.status === 'BudgetPaused').length;
  return {
    tone: 'info', icon: 'clock',
    headline: 'All quiet · projects are between wakes',
    sub: `${live.length - paused} ready${paused ? ` · ${paused} paused` : ''}${halted ? ` · ${halted} halted` : ''}`,
  };
}

// ───────────────────────────── filters + sorting ─────────────────────────────

export type PjFilter = 'all' | 'working' | 'needs' | 'paused' | 'shelved';
export const PJ_FILTERS: { id: PjFilter; label: string; tone?: PjTone }[] = [
  { id: 'all', label: 'All' },
  { id: 'working', label: 'Working', tone: 'work' },
  { id: 'needs', label: 'Needs you', tone: 'need' },
  { id: 'paused', label: 'Stopped' },
  { id: 'shelved', label: 'Shelved' },
];

export function matchesFilter(p: OverviewProject, filter: PjFilter): boolean {
  if (filter === 'shelved') return p.status === 'Archived';
  if (p.status === 'Archived') return false;
  if (filter === 'working') return (p.workingAgents ?? 0) > 0;
  if (filter === 'needs') return needsYou(p);
  if (filter === 'paused') return p.halted || ['Paused', 'BudgetPaused', 'Blocked', 'Completed'].includes(p.status);
  return true;
}

export function filterCounts(projects: OverviewProject[]): Record<PjFilter, number> {
  const out = { all: 0, working: 0, needs: 0, paused: 0, shelved: 0 } as Record<PjFilter, number>;
  for (const p of projects) for (const f of PJ_FILTERS) if (matchesFilter(p, f.id)) out[f.id]++;
  return out;
}

export function matchesSearch(p: OverviewProject, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [p.name, p.currentWork, p.result?.name, p.projectID].some(v => (v ?? '').toLowerCase().includes(q));
}

export type PjSort = 'attention' | 'activity' | 'spend' | 'name';

/** Rank used by the default sort: what needs you, then what is working, then what can run. */
function urgency(p: OverviewProject): number {
  if (needsYou(p)) return 0;
  if ((p.workingAgents ?? 0) > 0) return 1;
  if (isRunnable(p) && !p.halted) return 2;
  return 3;
}

export function sortProjects(projects: OverviewProject[], sort: PjSort): OverviewProject[] {
  const byName = (a: OverviewProject, b: OverviewProject) => (a.name || '').localeCompare(b.name || '') || a.projectID.localeCompare(b.projectID);
  const at = (p: OverviewProject) => (p.currentWorkAt ? Date.parse(p.currentWorkAt) || 0 : 0);
  return [...projects].sort((a, b) => {
    if (sort === 'name') return byName(a, b);
    if (sort === 'spend') return (spendInRange(b) - spendInRange(a)) || byName(a, b);
    if (sort === 'activity') return (at(b) - at(a)) || byName(a, b);
    return (urgency(a) - urgency(b)) || (at(b) - at(a)) || byName(a, b);
  });
}

export function spendInRange(p: OverviewProject): number {
  return (p.rangeSpendUsd ?? 0) + (p.rangeMoneySpendUsd ?? 0);
}

// ───────────────────────────── formatting ─────────────────────────────

export function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}

/** $0.42 · $12.50 · $204 · $1.2k: as precise as the number deserves, no wider than a column. */
export function pjUsd(value: number | null | undefined): string {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  if (abs >= 10_000) return `${n < 0 ? '-' : ''}$${(abs / 1000).toFixed(0)}k`;
  if (abs >= 1_000) return `${n < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}k`;
  if (abs >= 100) return `${n < 0 ? '-' : ''}$${abs.toFixed(0)}`;
  return `${n < 0 ? '-' : ''}$${abs.toFixed(2)}`;
}

/** A budget of 9,999 or more is the "no limit" convention the create form and agents use. */
export function isUnlimited(budget: number | null | undefined): boolean {
  return (Number(budget) || 0) >= 9_999;
}

export function budgetPct(spent: number, budget: number): number | null {
  if (!(budget > 0) || isUnlimited(budget)) return null;
  return Math.max(0, Math.min(100, (100 * spent) / budget));
}

export function resultValue(r: OverviewResult | null | undefined): string {
  if (!r || r.value == null) return '—';
  const v = r.format === 'Currency' ? pjUsd(r.value) : Number(r.value).toLocaleString(undefined, { maximumFractionDigits: 2 });
  return v + (r.format === 'Percent' ? '%' : r.unit && r.format !== 'Currency' ? ` ${r.unit}` : '');
}

export function resultTone(r: OverviewResult | null | undefined): PjTone {
  if (!r || r.stale || r.validity !== 'Valid' || r.delta == null || r.delta === 0 || r.direction === 'neutral') return 'rest';
  return (r.delta > 0) === (r.direction === 'higher') ? 'work' : 'fault';
}

/** "4m", "3h", "23d": the age of a moment, for tight places. */
export function ageShort(iso: string | null | undefined, now: number): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const minutes = Math.max(0, Math.round((now - t) / 60_000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}

/** "4 minutes", "3 hours", "23 days": the same, in a sentence. */
export function ageWords(iso: string | null | undefined, now: number): string {
  if (!iso) return 'an unknown time';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'an unknown time';
  const minutes = Math.max(0, Math.round((now - t) / 60_000));
  if (minutes < 1) return 'moments';
  if (minutes < 60) return `${minutes} ${plural(minutes, 'minute')}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} ${plural(hours, 'hour')}`;
  const days = Math.floor(hours / 24);
  return `${days} ${plural(days, 'day')}`;
}

export function isOld(iso: string | null | undefined, now: number, hours = 24): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return !Number.isNaN(t) && now - t > hours * 3_600_000;
}

// ───────────────────────────── charts ─────────────────────────────

export interface PjBin { completed: number; failed: number; deferred: number; cancelled: number; total: number; date: string }

/** Wake outcomes folded into at most <paramref name="maxBins"/> bins, oldest first. */
export function outcomeBins(series: OverviewPoint[] | null | undefined, maxBins = 24): PjBin[] {
  const points = series ?? [];
  if (!points.length) return [];
  const size = Math.max(1, Math.ceil(points.length / maxBins));
  const bins: PjBin[] = [];
  for (let i = 0; i < points.length; i += size) {
    const slice = points.slice(i, i + size);
    const bin = slice.reduce((b, p) => ({
      completed: b.completed + (p.completed ?? 0), failed: b.failed + (p.failed ?? 0),
      deferred: b.deferred + (p.deferred ?? 0), cancelled: b.cancelled + (p.cancelled ?? 0), total: 0, date: b.date,
    }), { completed: 0, failed: 0, deferred: 0, cancelled: 0, total: 0, date: slice[0].date });
    bin.total = bin.completed + bin.failed + bin.deferred + bin.cancelled;
    bins.push(bin);
  }
  return bins;
}

export function outcomeTotals(series: OverviewPoint[] | null | undefined) {
  return (series ?? []).reduce((t, p) => ({
    completed: t.completed + (p.completed ?? 0), failed: t.failed + (p.failed ?? 0),
    deferred: t.deferred + (p.deferred ?? 0), cancelled: t.cancelled + (p.cancelled ?? 0),
  }), { completed: 0, failed: 0, deferred: 0, cancelled: 0 });
}

/**
 * A numeric observable's history as plain numbers, oldest first. Observable samples carry `numericValue`
 * (ObservableSample on the server), unlike the overview's result history, which carries `value`.
 */
export function observableSeries(o: { type?: string; history?: { numericValue?: number | null }[] | null } | null | undefined): number[] {
  if (!o || o.type !== 'Numeric') return [];
  return (o.history ?? []).filter(s => typeof s.numericValue === 'number' && Number.isFinite(s.numericValue)).map(s => s.numericValue as number);
}

/** SVG paths for a sparkline in a w×h box: the line, and the area under it. */
export function sparkPaths(values: number[], w = 100, h = 28, pad = 2): { line: string; area: string } | null {
  const pts = values.filter(v => Number.isFinite(v));
  if (pts.length < 2) return null;
  const min = Math.min(...pts), max = Math.max(...pts);
  const span = max - min || 1;
  const step = (w - pad * 2) / (pts.length - 1);
  const xy = pts.map((v, i) => [pad + i * step, h - pad - ((v - min) / span) * (h - pad * 2)] as const);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${xy[xy.length - 1][0].toFixed(1)} ${h} L${xy[0][0].toFixed(1)} ${h} Z`;
  return { line, area };
}

// ───────────────────────────── palette ─────────────────────────────

export interface PjCommand {
  id: string;
  title: string;
  group: 'Projects' | 'Actions' | 'Go to';
  icon: string;
  hint?: string;
  keywords?: string;
  run: () => void;
}

export function rankCommands(query: string, commands: PjCommand[], limit = 40): PjCommand[] {
  if (!query.trim()) return commands.slice(0, limit);
  return commands
    // The admin scorer ranks its 'Services' group lower; projects are what this palette is for, so
    // they are scored as that group and actions/places keep the bonus.
    .map(command => ({ command, score: commandScore(query, { title: command.title, keywords: command.keywords, group: command.group === 'Projects' ? 'Services' : 'Actions' }) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.command);
}

export function countText(n: number, word: string): string {
  return `${fmtInt(n)} ${plural(n, word)}`;
}
