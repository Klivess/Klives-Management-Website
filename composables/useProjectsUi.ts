import { ref, onMounted, onBeforeUnmount } from 'vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

/*
 * Shared helpers for the Projects pages (ot-os). Names carry a `pj` prefix because Nuxt auto-imports
 * every export from composables/, and a bare `fmtAgo` or `money` collides with other sections'.
 */

export function pjMoney(value: number | null | undefined, digits = 2): string {
  const n = Number(value) || 0;
  return '$' + n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function pjNumber(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
}

/** "just now", "4m ago", "3h ago", "2d ago" — or "in 5m" for future instants. */
export function pjAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'unknown';
  const minutes = Math.round((now - t) / 60000);
  if (minutes < 0) return -minutes < 60 ? `in ${-minutes}m` : `in ${Math.round(-minutes / 60)}h`;
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

export function pjTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function pjClock(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function pjDuration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

export function pjShortId(id: string | null | undefined, n = 12): string {
  return (id || '').slice(0, n);
}

/** An ot-os design token's value, for canvas painters (Chart.js cannot read var()). */
export function pjToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Status → chip tone used across Projects pages. */
export function pjStatusTone(status: string | null | undefined): string {
  switch ((status || '').toLowerCase()) {
    case 'active': return 'ok';
    case 'planning': return 'violet';
    case 'paused': case 'budgetpaused': return 'warn';
    case 'blocked': return 'bad';
    case 'completed': return 'info';
    default: return '';
  }
}

export function pjStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Unknown';
  if (status === 'BudgetPaused') return 'Budget paused';
  return status;
}

/** POST helper that throws a readable error on failure. */
export async function pjPost<T = any>(path: string, body: unknown = {}): Promise<T> {
  const res = await RequestPOSTFromKliveAPI(path, JSON.stringify(body), false, true);
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).trim(); } catch { /* ignore */ }
    throw new Error(detail && !/^<!doctype/i.test(detail) ? detail : `Request failed (HTTP ${res.status}).`);
  }
  try { return await res.json() as T; } catch { return {} as T; }
}

export async function pjGet<T = any>(path: string): Promise<T | null> {
  try {
    const res = await RequestGETFromKliveAPI(path, false, false);
    if (!res.ok) return null;
    return await res.json() as T;
  } catch { return null; }
}

/** Host-level computer health (Docker daemon, capacity), polled for the shell and computer pages. */
export interface ProjectsHostHealth {
  available?: boolean; reason?: string;
  endpoint?: string; daemonProblem?: string | null; recoveryInProgress?: boolean; recoveryStatus?: string;
  restartRequired?: boolean; lastAttemptUtc?: string | null; lastSupervisionUtc?: string | null;
  capacity?: { daemonMemoryGB: number; desktopMemoryLimitGB: number; maxRunningDesktops: number; running: number; stopped: number; idleSuspendMinutes: number };
}

export interface ProjectsComputer {
  containerID: string; projectID: string; agentID: string; width: number; height: number;
  createdAt: string; lastUsedAt: string; state: 'running' | 'asleep' | 'missing' | 'unreachable' | 'degraded';
  vncConnected: boolean; actionInFlight: boolean; controlledBy: string | null;
  daemon: null | {
    protocol: number; uptimeSeconds: number; authConfigured: boolean; imageVersion: string | null;
    components: Record<string, boolean>;
    browser: { up: boolean; process: boolean; tabs: number | null; processes: number };
    memory: null | { usedMB: number | null; limitMB: number | null; availableMB: number | null; oomKills: number | null };
    load: number | null; cpus: number | null; diskFreeMB: number | null;
    events: { seq: number; at: string; kind: string; message: string }[];
  };
}

export function useProjectsHostHealth(intervalMs = 20000) {
  const health = ref<ProjectsHostHealth | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;
  async function load() { health.value = await pjGet<ProjectsHostHealth>('/projects/computers/health') ?? health.value; }
  onMounted(() => { load(); timer = setInterval(load, intervalMs); });
  onBeforeUnmount(() => { if (timer) clearInterval(timer); });
  return { health, reload: load };
}

/** A computer's state in one word and a chip tone. */
export function pjComputerState(c: ProjectsComputer): { label: string; tone: string } {
  if (c.state === 'missing') return { label: 'Missing', tone: 'bad' };
  if (c.state === 'asleep') return { label: 'Asleep', tone: '' };
  if (c.state === 'unreachable') return { label: 'Unreachable', tone: 'bad' };
  if (c.state === 'degraded') return { label: 'Degraded', tone: 'warn' };
  if (c.daemon && c.daemon.memory?.oomKills) return { label: 'Running', tone: 'warn' };
  return { label: 'Running', tone: 'ok' };
}

export const PJ_REPAIRS: { action: string; label: string; detail: string; tone?: string }[] = [
  { action: 'restart-browser', label: 'Restart browser', detail: 'Closes open pages; sign-ins are kept.' },
  { action: 'restart-components', label: 'Restart desktop', detail: 'Window manager, panel and desktop only; apps keep running.' },
  { action: 'restart-computer', label: 'Restart computer', detail: 'Ends every running app; files, installs and sign-ins are kept.', tone: 'warn' },
  { action: 'refresh-helpers', label: 'Refresh helpers', detail: 'Installs this build’s in-computer tooling and its access token.' },
];
