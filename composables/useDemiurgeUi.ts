import { ref, onMounted, onBeforeUnmount } from 'vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

/*
 * Shared helpers for the Demiurge pages (ot-os). Names carry a `pj` prefix because Nuxt auto-imports
 * every export from composables/, and a bare `fmtAgo` or `money` collides with other sections'.
 */

export function dmMoney(value: number | null | undefined, digits = 2): string {
  const n = Number(value) || 0;
  return '$' + n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function dmNumber(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
}

/** "just now", "4m ago", "3h ago", "2d ago" — or "in 5m" for future instants. */
export function dmAgo(iso: string | null | undefined, now = Date.now()): string {
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

export function dmTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function dmClock(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function dmDuration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

export function dmShortId(id: string | null | undefined, n = 12): string {
  return (id || '').slice(0, n);
}

export interface DemiurgeScheduleEntry {
  agentID: string; label: string;
  /** working · waiting (for LLM capacity) · held (provider backoff) · sleeping · done */
  state: 'working' | 'waiting' | 'held' | 'sleeping' | 'done';
  detail: string; nextWakeAt: string | null;
}
export interface DemiurgeSchedule {
  now: string; agents: DemiurgeScheduleEntry[];
  router: { inFlight: number; slots: number; waiting: number; reservedSlots: number; mode: string };
  liveConversations: number; conversationBudget: number; budgetSource: string; deferredWakes: number;
}

export const DM_SCHEDULE_STATE: Record<string, { label: string; tone: string }> = {
  working: { label: 'Working', tone: 'ok' },
  waiting: { label: 'Waiting for LLM', tone: 'warn' },
  held: { label: 'Held', tone: 'bad' },
  sleeping: { label: 'Asleep', tone: '' },
  done: { label: 'Idle', tone: '' },
};

/** "in 9m", or "any moment" when the next run is due within half a minute. */
export function dmNextRun(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  return t - now <= 30_000 ? 'any moment' : dmAgo(iso, now);
}

/** Why each agent of a Steward is or is not working, and when it next runs. Polled. */
export function useStewardSchedule(stewardId: () => string, intervalMs = 15000) {
  const schedule = ref<DemiurgeSchedule | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;
  async function load() {
    const id = stewardId();
    if (!id) return;
    const body = await dmGet<DemiurgeSchedule>(`/demiurge/schedule?stewardID=${encodeURIComponent(id)}`);
    // An older server answers an unknown route with something else entirely; keep the last good copy.
    if (body && Array.isArray(body.agents) && body.router) schedule.value = body;
  }
  onMounted(() => { load(); timer = setInterval(load, intervalMs); });
  onBeforeUnmount(() => { if (timer) clearInterval(timer); });
  return { schedule, reload: load };
}

/** An ot-os design token's value, for canvas painters (Chart.js cannot read var()). */
export function dmToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Status → chip tone used across Demiurge pages. */
export function dmStatusTone(status: string | null | undefined): string {
  switch ((status || '').toLowerCase()) {
    case 'active': return 'ok';
    case 'planning': return 'violet';
    case 'paused': case 'budgetpaused': return 'warn';
    case 'blocked': return 'bad';
    case 'completed': return 'info';
    default: return '';
  }
}

export function dmStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Unknown';
  if (status === 'BudgetPaused') return 'Budget paused';
  return status;
}

/** POST helper that throws a readable error on failure. */
export async function dmPost<T = any>(path: string, body: unknown = {}): Promise<T> {
  const res = await RequestPOSTFromKliveAPI(path, JSON.stringify(body), false, true);
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).trim(); } catch { /* ignore */ }
    throw new Error(detail && !/^<!doctype/i.test(detail) ? detail : `Request failed (HTTP ${res.status}).`);
  }
  try { return await res.json() as T; } catch { return {} as T; }
}

export async function dmGet<T = any>(path: string): Promise<T | null> {
  try {
    const res = await RequestGETFromKliveAPI(path, false, false);
    if (!res.ok) return null;
    return await res.json() as T;
  } catch { return null; }
}

/** Host-level computer health (Docker daemon, capacity), polled for the shell and computer pages. */
export interface DemiurgeHostHealth {
  available?: boolean; reason?: string;
  endpoint?: string; daemonProblem?: string | null; recoveryInProgress?: boolean; recoveryStatus?: string;
  restartRequired?: boolean; lastAttemptUtc?: string | null; lastSupervisionUtc?: string | null;
  capacity?: { daemonMemoryGB: number; desktopMemoryLimitGB: number; maxRunningDesktops: number; running: number; stopped: number; idleSuspendMinutes: number };
}

export interface DemiurgeComputer {
  containerID: string; stewardID: string; agentID: string; width: number; height: number;
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

export function useDemiurgeHostHealth(intervalMs = 20000) {
  const health = ref<DemiurgeHostHealth | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;
  async function load() { health.value = await dmGet<DemiurgeHostHealth>('/demiurge/computers/health') ?? health.value; }
  onMounted(() => { load(); timer = setInterval(load, intervalMs); });
  onBeforeUnmount(() => { if (timer) clearInterval(timer); });
  return { health, reload: load };
}

/** A computer's state in one word and a chip tone. */
export function dmComputerState(c: DemiurgeComputer): { label: string; tone: string } {
  if (c.state === 'missing') return { label: 'Missing', tone: 'bad' };
  if (c.state === 'asleep') return { label: 'Asleep', tone: '' };
  if (c.state === 'unreachable') return { label: 'Unreachable', tone: 'bad' };
  if (c.state === 'degraded') return { label: 'Degraded', tone: 'warn' };
  if (c.daemon && c.daemon.memory?.oomKills) return { label: 'Running', tone: 'warn' };
  return { label: 'Running', tone: 'ok' };
}

export const DM_REPAIRS: { action: string; label: string; detail: string; tone?: string }[] = [
  { action: 'restart-browser', label: 'Restart browser', detail: 'Closes open pages; sign-ins are kept.' },
  { action: 'restart-components', label: 'Restart desktop', detail: 'Window manager, panel and desktop only; apps keep running.' },
  { action: 'restart-computer', label: 'Restart computer', detail: 'Ends every running app; files, installs and sign-ins are kept.', tone: 'warn' },
  { action: 'refresh-helpers', label: 'Refresh helpers', detail: 'Installs this build’s in-computer tooling and its access token.' },
];
