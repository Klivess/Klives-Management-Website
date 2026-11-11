import { computed, ref, shallowRef, watch } from 'vue';
import { RequestBatchFromKliveAPI, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI, type KliveBatchItem } from '~/scripts/APIInterface';
import { useCurrentProfile } from '~/composables/useCurrentProfile';
import { readAgentApiResponse } from '~/composables/useAgentChat';
import {
  computeVerdict, readSchedule, readStats as parseStats, toMs,
  type AgentComputer, type AgentJob, type AgentNote, type BackgroundTask, type ConversationSummary, type FlatSummary,
  type ScheduleState, type UsageStats,
} from '~/scripts/agentConsole';

/**
 * Everything around the conversation: is the agent up, what is running, what finished while Klives was
 * away, what it will do on its own later, and what it has cost.
 *
 * Request tiers. The old page asked five routes every 10 s and the start-up status every 10 s, hidden
 * tab or not: 25,797 status reads and ~5,100 each of tasks, jobs, notifications, computer and
 * conversations in 30 days. Now:
 *  - one /batch every 15 s while the tab is visible: status, running runs, latest results, unread
 *    results, computer, schedule;
 *  - the conversation list (93 KB) every 60 s as a plain GET, so the server's ETag answers 304;
 *  - usage summary, jobs and background tasks every 2 minutes;
 *  - the full usage history (/kliveagent/stats) once on load and every 10 minutes;
 *  - while KliveAgent is starting, the status alone every 1.5 s;
 *  - nothing at all while the tab is hidden; everything at once when it comes back.
 */

const FAST_MS = 15_000;
const LIST_MS = 60_000;
const SLOW_MS = 120_000;
const STATS_MS = 10 * 60_000;
const STARTING_MS = 1_500;

const P = {
  status: '/kliveagent/status',
  runs: '/kliveagent/chat/runs?includeCompleted=false',
  notes: '/kliveagent/notifications?limit=25',
  unread: '/kliveagent/notifications?unreadOnly=true&limit=50',
  computer: '/kliveagent/computer',
  schedule: '/kliveagent/schedule',
  summary: '/kliveagent/stats/summary',
  jobs: '/kliveagent/jobs',
  tasks: '/kliveagent/tasks',
} as const;

export interface AgentToast { id: number; tone: 'ok' | 'warn' | 'crit' | 'info'; text: string; action?: { label: string; run: () => unknown } }

function body<T>(item: KliveBatchItem | undefined): T | null {
  if (!item || item.status < 200 || item.status >= 300) return null;
  const value = item.body;
  if (typeof value !== 'string') return value as T;
  try { return JSON.parse(value) as T; } catch { return null; }
}

export function useAgentConsole() {
  const profile = useCurrentProfile();
  const can = (key: string) => profile.can(key);
  const allowed = computed(() => ({
    status: can('kliveagent.status.view'),
    history: can('kliveagent.history.read'),
    chat: can('kliveagent.chat.use'),
    jobs: can('kliveagent.jobs.manage'),
    memories: can('kliveagent.memories.read'),
    memoriesManage: can('kliveagent.memories.manage'),
    reindex: can('kliveagent.index.rebuild'),
  }));

  // ── what the server said ──
  const status = ref<{ ready: boolean; state: string; progress: number; message: string; codebase?: any } | null>(null);
  const reachable = ref(true);
  const runningRuns = shallowRef<any[]>([]);
  const notes = shallowRef<AgentNote[]>([]);
  const unreadNotes = shallowRef<AgentNote[]>([]);
  const computerEnabled = ref<boolean | undefined>(undefined);
  const computer = shallowRef<AgentComputer | null>(null);
  const schedule = shallowRef<ScheduleState | null>(null);
  /** False on a server from before /kliveagent/schedule (404): the panel says so instead of "none". */
  const scheduleSupported = ref(true);
  const summary = shallowRef<FlatSummary | null>(null);
  const jobs = shallowRef<AgentJob[]>([]);
  const tasks = shallowRef<BackgroundTask[]>([]);
  const conversations = shallowRef<ConversationSummary[]>([]);
  const conversationsLoaded = ref(false);
  const stats = shallowRef<UsageStats | null>(null);
  const statsLoading = ref(false);

  // ── freshness ──
  const now = ref(Date.now());
  const lastOkAt = ref<number | null>(null);
  const hidden = ref(false);
  const busy = ref(false);
  const toasts = ref<AgentToast[]>([]);
  let toastId = 0;
  let timers: number[] = [];
  let fastTimer: number | null = null;
  let listAt = 0;
  let slowAt = 0;
  let statsAt = 0;
  let started = false;
  let onRuns: ((runs: any[]) => void) | null = null;

  function notify(tone: AgentToast['tone'], text: string, action?: AgentToast['action'], ms = 5_000) {
    const id = ++toastId;
    toasts.value = [...toasts.value, { id, tone, text, action }];
    window.setTimeout(() => dismissToast(id), ms);
  }
  function dismissToast(id: number) { toasts.value = toasts.value.filter(toast => toast.id !== id); }

  const ready = computed(() => !!status.value?.ready);
  const unreadCount = computed(() => unreadNotes.value.length);
  const takeovers = computed(() => computer.value?.pendingTakeovers?.length ?? 0);
  const overdueTasks = computed(() => (schedule.value?.active ?? []).filter(task => (toMs(task.dueAtUtc) ?? Infinity) < now.value - 120_000 && !task.firing).length);
  const attentionJobs = computed(() => jobs.value.filter(job => job.attentionRequired).length);
  const linkState = computed<'live' | 'stale' | 'offline' | 'paused' | 'connecting'>(() => {
    if (hidden.value) return 'paused';
    if (!lastOkAt.value) return reachable.value ? 'connecting' : 'offline';
    if (!reachable.value) return 'offline';
    return now.value - lastOkAt.value > FAST_MS * 3 ? 'stale' : 'live';
  });

  function verdictFor(approvals: number) {
    return computeVerdict({
      ready: ready.value,
      state: String(status.value?.state ?? 'starting').toLowerCase(),
      progress: Number(status.value?.progress ?? 0),
      statusMessage: status.value?.message ?? '',
      reachable: reachable.value || !!status.value,
      runningRuns: runningRuns.value.length,
      unread: unreadCount.value,
      takeovers: takeovers.value,
      approvals,
      overdueTasks: overdueTasks.value,
      attentionJobs: attentionJobs.value,
    });
  }

  // ── reads ──
  async function readStatus() {
    try {
      const res = await RequestGETFromKliveAPI(P.status, false, false);
      const { data } = await readAgentApiResponse(res);
      if (res.ok && data) { status.value = data; reachable.value = true; lastOkAt.value = Date.now(); }
      else reachable.value = res.status < 500 && res.status !== 0;
    } catch { reachable.value = false; }
  }

  async function readFast() {
    if (busy.value) return;
    busy.value = true;
    try {
      const paths: string[] = [];
      if (allowed.value.status) paths.push(P.status, P.computer);
      if (allowed.value.history) paths.push(P.runs, P.notes, P.unread);
      if (allowed.value.history && scheduleSupported.value) paths.push(P.schedule);
      if (!paths.length) return;
      const results = await RequestBatchFromKliveAPI(paths);
      if (!results.size) { reachable.value = false; return; }
      reachable.value = true;
      lastOkAt.value = Date.now();

      const st = body<any>(results.get(P.status));
      if (st) status.value = st;
      const runs = body<any[]>(results.get(P.runs));
      if (Array.isArray(runs)) {
        runningRuns.value = runs.filter(run => run?.status === 'Running');
        onRuns?.(runningRuns.value);
      }
      const latest = body<AgentNote[]>(results.get(P.notes));
      if (Array.isArray(latest)) notes.value = latest;
      const unread = body<AgentNote[]>(results.get(P.unread));
      if (Array.isArray(unread)) { announce(unread); unreadNotes.value = unread; }
      const comp = body<{ enabled?: boolean; computer?: AgentComputer | null }>(results.get(P.computer));
      if (comp) { computerEnabled.value = comp.enabled; computer.value = comp.computer ?? null; }
      const sched = results.get(P.schedule);
      if (sched?.status === 404) scheduleSupported.value = false;
      else { const parsed = readSchedule(body(sched)); if (parsed) schedule.value = parsed; }
    } catch {
      reachable.value = false;
    } finally {
      busy.value = false;
    }
  }

  /** A result that arrives while the tab is in the background gets a desktop notification, once. */
  const announced = new Set<string>();
  let announcedOnce = false;
  function announce(unread: AgentNote[]) {
    const canNotify = typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted';
    unread.forEach(note => {
      if (announcedOnce && canNotify && document.hidden && !announced.has(note.notificationId)) {
        try { new Notification(note.title || 'KliveAgent finished work', { body: (note.body || '').slice(0, 200) }); } catch { /* blocked */ }
      }
      announced.add(note.notificationId);
    });
    announcedOnce = true;
  }

  async function readConversations() {
    if (!allowed.value.history) return;
    try {
      const res = await RequestGETFromKliveAPI('/kliveagent/conversations', false, false);
      const { data } = await readAgentApiResponse(res);
      if (res.ok && Array.isArray(data)) { conversations.value = data; conversationsLoaded.value = true; }
    } catch { /* next tick */ }
  }

  async function readSlow() {
    const paths: string[] = [];
    if (allowed.value.status) paths.push(P.summary);
    if (allowed.value.history) paths.push(P.jobs, P.tasks);
    if (!paths.length) return;
    try {
      const results = await RequestBatchFromKliveAPI(paths);
      const sum = body<FlatSummary>(results.get(P.summary));
      if (sum && typeof sum === 'object') summary.value = sum;
      const jobList = body<AgentJob[]>(results.get(P.jobs));
      if (Array.isArray(jobList)) jobs.value = jobList;
      const taskList = body<BackgroundTask[]>(results.get(P.tasks));
      if (Array.isArray(taskList)) tasks.value = taskList;
    } catch { /* next tick */ }
  }

  /** The full usage history (~35 KB on the wire): on load, every 10 minutes, and when Insights asks. */
  async function loadStats(force = false) {
    if (!allowed.value.history || statsLoading.value) return;
    if (!force && stats.value && Date.now() - statsAt < STATS_MS) return;
    statsLoading.value = true;
    try {
      const res = await RequestGETFromKliveAPI('/kliveagent/stats', false, false);
      const { data } = await readAgentApiResponse(res);
      if (res.ok) { stats.value = parseStats(data); statsAt = Date.now(); }
    } catch { /* keep the last */ }
    finally { statsLoading.value = false; }
  }

  async function tick() {
    now.value = Date.now();
    if (hidden.value) return;
    // While starting, the status alone is read quickly; the batch below repeats it once it is ready.
    if (!ready.value && allowed.value.status) await readStatus();
    const due = Date.now();
    const work: Promise<unknown>[] = [readFast()];
    if (due - listAt >= LIST_MS) { listAt = due; work.push(readConversations()); }
    if (due - slowAt >= SLOW_MS) { slowAt = due; work.push(readSlow()); }
    if (due - statsAt >= STATS_MS) work.push(loadStats(false));
    await Promise.allSettled(work);
  }

  function schedule_() {
    if (fastTimer != null) window.clearTimeout(fastTimer);
    const delay = ready.value || !allowed.value.status ? FAST_MS : STARTING_MS;
    fastTimer = window.setTimeout(async () => { await tick(); if (started) schedule_(); }, delay);
  }

  function onVisibility() {
    hidden.value = document.visibilityState === 'hidden';
    if (!hidden.value) { listAt = 0; void tick(); }
  }

  async function refreshAll() {
    listAt = 0; slowAt = 0;
    await Promise.allSettled([tick(), loadStats(true)]);
  }

  function start(onRunningRuns?: (runs: any[]) => void) {
    started = true;
    onRuns = onRunningRuns ?? null;
    hidden.value = document.visibilityState === 'hidden';
    document.addEventListener('visibilitychange', onVisibility);
    timers.push(window.setInterval(() => { now.value = Date.now(); }, 30_000));
    void tick().then(() => { if (started) schedule_(); });
    // The profile can arrive after the page: read at once rather than at the next 15 s tick.
    stopAccessWatch = watch(() => allowed.value.status || allowed.value.history, (canRead, could) => {
      if (canRead && !could && started) { listAt = 0; slowAt = 0; void tick(); }
    });
  }
  let stopAccessWatch: (() => void) | null = null;
  function stop() {
    started = false;
    stopAccessWatch?.();
    stopAccessWatch = null;
    document.removeEventListener('visibilitychange', onVisibility);
    timers.forEach(id => window.clearInterval(id));
    timers = [];
    if (fastTimer != null) window.clearTimeout(fastTimer);
    fastTimer = null;
  }

  // ── actions ──
  async function post(path: string, payload: unknown): Promise<{ ok: boolean; status: number; data: any }> {
    try {
      const res = await RequestPOSTFromKliveAPI(path, JSON.stringify(payload ?? {}), true, true);
      const { data } = await readAgentApiResponse(res);
      return { ok: res.ok, status: res.status, data };
    } catch (error: any) {
      return { ok: false, status: 0, data: { error: error?.message ?? String(error) } };
    }
  }

  async function markRead(note: AgentNote) {
    if (note.readAt) return;
    unreadNotes.value = unreadNotes.value.filter(n => n.notificationId !== note.notificationId);
    notes.value = notes.value.map(n => (n.notificationId === note.notificationId ? { ...n, readAt: new Date().toISOString() } : n));
    await post('/kliveagent/notifications/read', { notificationId: note.notificationId });
  }

  async function markAllRead() {
    const before = unreadNotes.value;
    if (!before.length) return;
    const stamp = new Date().toISOString();
    unreadNotes.value = [];
    notes.value = notes.value.map(n => (n.readAt ? n : { ...n, readAt: stamp }));
    const result = await post('/kliveagent/notifications/read-all', {});
    if (!result.ok) { unreadNotes.value = before; notify('crit', 'Could not mark the results read.'); }
    else notify('ok', `${result.data?.marked ?? before.length} result${before.length === 1 ? '' : 's'} marked read`);
  }

  async function cancelScheduled(id: string) {
    const result = await post('/kliveagent/schedule/cancel', { id });
    if (result.ok) {
      notify('ok', 'Scheduled task cancelled');
      if (schedule.value) schedule.value = { ...schedule.value, active: schedule.value.active.filter(task => task.id !== id) };
    } else notify('crit', result.status === 409 ? 'That task is no longer active.' : 'Could not cancel the task.');
    void readFast();
  }

  async function jobAction(kind: 'stop' | 'resume', jobId: string) {
    const result = await post(`/kliveagent/jobs/${kind}`, { jobId });
    notify(result.ok ? 'ok' : 'crit', result.ok ? (kind === 'stop' ? 'Job stopped' : 'Job resumed') : (result.data?.error || `Could not ${kind} the job.`));
    void readSlow();
  }

  async function steerJob(jobId: string, message: string) {
    const result = await post('/kliveagent/jobs/steer', { jobId, message, senderName: 'Website' });
    notify(result.ok ? 'ok' : 'crit', result.ok ? 'Guidance sent to the job' : (result.data?.reason || result.data?.error || 'Could not steer the job.'));
    void readSlow();
    return result.ok;
  }

  async function createJob(input: { name: string; goal: string; tokenBudgetUsd: number; conversationId: string | null; clientJobId: string }) {
    try { if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission(); } catch { /* unsupported */ }
    const result = await post('/kliveagent/jobs/create', {
      clientJobId: input.clientJobId, name: input.name.trim() || null, goal: input.goal.trim(),
      conversationId: input.conversationId, tokenBudgetUsd: Math.max(0.1, Number(input.tokenBudgetUsd) || 10), subAgentCap: 3,
    });
    await readSlow();
    // A lost reply is ambiguous: the creation id says whether the job exists anyway.
    const created = result.ok || jobs.value.some(job => job.clientJobId === input.clientJobId);
    notify(created ? 'ok' : 'crit', created ? 'Job started in parallel' : `Could not start the job: ${result.data?.error || result.data?.errorMessage || `HTTP ${result.status}`}`);
    return created;
  }

  async function cancelTask(taskId: string) {
    const result = await post('/kliveagent/tasks/cancel', { taskId });
    notify(result.ok ? 'ok' : 'crit', result.ok ? 'Background task cancelled' : 'Could not cancel the task.');
    void readSlow();
  }

  async function reindex() {
    const result = await post('/kliveagent/reindex', {});
    notify(result.ok ? 'info' : 'crit', result.ok ? 'Codebase re-index started in the background' : (result.data?.error || 'Could not start the re-index.'));
  }

  return {
    allowed, status, reachable, ready, runningRuns, notes, unreadNotes, unreadCount, computerEnabled, computer, schedule, scheduleSupported,
    summary, jobs, tasks, conversations, conversationsLoaded, stats, statsLoading, now, hidden, linkState, toasts, takeovers,
    overdueTasks, attentionJobs, verdictFor, notify, dismissToast, start, stop, refreshAll, readConversations, readFast, readSlow,
    loadStats, markRead, markAllRead, cancelScheduled, jobAction, steerJob, createJob, cancelTask, reindex,
  };
}
