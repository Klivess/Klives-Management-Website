import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';
import { useEventStream } from '~/composables/useEventStream';

export interface OverviewPoint {
  date: string; spendUsd: number; moneySpendUsd: number; completedSteps: number;
  completed: number; failed: number; deferred: number; cancelled: number;
}
export interface OverviewResult {
  observableID: string | null; name: string; selection: string; direction: string; rationale: string;
  value: number | null; format: string; unit: string | null; delta: number | null;
  observedAt: string | null; stale: boolean; validity: string; source: string;
  evidenceEventSequence: number | null; evidenceArtifactIDs: string[];
  history: { timestamp: string; value: number }[];
}
export interface OverviewProject {
  projectID: string; name: string; status: string; halted: boolean; executionDisposition: string;
  executionHealth: string; blocker: string | null; nextRetryAt: string | null; pendingApprovals: number;
  currentWork: string; currentWorkSource: string; currentWorkAt: string | null;
  workingAgents: number; activityPhase: string | null; subAgentCap: number;
  tokenSpendUsd: number; moneySpendUsd: number; tokenBudgetUsd: number; moneyBudgetUsd: number;
  rangeSpendUsd: number; rangeMoneySpendUsd: number; completedSteps: number; historicalReady?: boolean; historicalAt: string | null;
  result: OverviewResult; resultOptions: { observableID: string; name: string }[]; series: OverviewPoint[];
}
export interface OverviewSnapshot {
  liveAt: string; historicalAt: string | null; range: { key: string; fromUtc: string; toUtc: string; label: string; bucket: string };
  scope: string; workingProjects: number; completedSteps: number; modelSpendUsd: number; externalSpendUsd: number;
  execution: { productiveRate: number | null; coveragePct: number; observedWakes: number; outcomes: number };
  series: OverviewPoint[]; projects: OverviewProject[];
  attention: { projectID: string; name: string; kind: string; label: string }[];
  historicalLoading?: boolean; historicalLoadingMessage?: string | null;
}

export function useProjectsOverview() {
  const range = ref('24h');
  const data = ref<OverviewSnapshot | null>(null);
  const loading = ref(true);
  const loadingMessage = ref('Connecting to Omnipotent…');
  const refreshing = ref(false);
  const error = ref('');
  const now = ref(Date.now());
  let controller: AbortController | null = null;
  let revision = 0;
  let stopped = false;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;
  let clock: ReturnType<typeof setInterval> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;

  function retrySoon(delay = 1000) {
    clearTimeout(retry);
    retry = setTimeout(() => { retry = undefined; if (!stopped) refresh(); }, delay);
  }

  async function startupState(res: Response) {
    try {
      const body = await res.clone().json();
      if (body?.ready === false && body?.failed === true) return {
        failure: `${body?.stage || 'Projects startup failed'}${body?.error ? `: ${body.error}` : ''}`,
      };
      if (body?.ready === false && body?.stage) return { loading: `${body.stage}…` };
    } catch { /* a route-level 404 is plain text on older servers */ }
    return null;
  }

  async function refresh() {
    controller?.abort();
    controller = new AbortController();
    const current = ++revision;
    const requestedRange = range.value;
    refreshing.value = true;
    if (!data.value) loadingMessage.value = 'Loading live project status…';
    const timeout = setTimeout(() => controller && current === revision && controller.abort(), 30000);
    try {
      const res = await RequestGETFromKliveAPI(`/projects/overview?range=${requestedRange}`, false, false, {}, controller.signal);
      const routeMissing = res.status === 404 && (await res.clone().text()).includes('Route not found');
      const state = res.status >= 500 ? await startupState(res) : null;
      if (state?.failure) throw new Error(state.failure);
      const starting = state?.loading ?? (routeMissing ? 'Waiting for the Projects API to finish starting…' : null);
      if (starting) {
        if (current !== revision || stopped) return;
        loading.value = true;
        refreshing.value = false;
        error.value = '';
        loadingMessage.value = starting;
        retrySoon(Number(res.headers.get('Retry-After') || 1) * 1000);
        return;
      }
      if (!res.ok) throw new Error(`Overview refresh failed (HTTP ${res.status}).`);
      const body = await res.json();
      if (!body || !Array.isArray(body.projects) || !Array.isArray(body.series) || !body.range || !body.execution)
        throw new Error('The server returned an incomplete overview.');
      if (current !== revision || stopped) return;
      data.value = body;
      error.value = '';
      now.value = Date.now();
      if (body.historicalLoading) retrySoon(1000);
    } catch (e: any) {
      if (current === revision && !stopped) error.value = e?.message || 'Overview unavailable.';
    } finally {
      clearTimeout(timeout);
      if (current === revision && !stopped && !retry) { loading.value = false; refreshing.value = false; }
      else if (current === revision && !stopped && data.value) { loading.value = false; refreshing.value = false; }
    }
  }
  function scheduleRefresh() {
    if (debounce || stopped) return;
    debounce = setTimeout(() => {
      debounce = undefined;
      if (refreshing.value) { scheduleRefresh(); return; }
      refresh();
    }, 1200);
  }
  const stream = useEventStream({ onFleet: scheduleRefresh });
  watch(stream.connected, connected => { if (connected) scheduleRefresh(); });
  watch(range, refresh);
  onMounted(() => {
    refresh(); stream.connect();
    poll = setInterval(() => { if (!refreshing.value) refresh(); }, 30000);
    clock = setInterval(() => { now.value = Date.now(); }, 15000);
  });
  onBeforeUnmount(() => {
    stopped = true; revision++; controller?.abort();
    clearTimeout(debounce); clearTimeout(retry); clearInterval(poll); clearInterval(clock); stream.disconnect();
  });
  return { range, data, loading, loadingMessage, refreshing, error, now, connected: stream.connected, refresh };
}
