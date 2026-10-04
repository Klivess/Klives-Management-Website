import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { RequestBatchFromKliveAPI, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import type { Cs2Analytics, Cs2Balance, Cs2Cycle, Cs2Evaluation, Cs2Plan } from '~/scripts/cs2Arbitrage';

/**
 * Live data for the CS2 Arbitrage page, from the bot's own routes (`/cs2arbitragebot/*`).
 * Two cadences: the engine view (status + opportunities) every 15 s, everything that only moves
 * on purchases or model runs every 60 s. Polling pauses while the tab is hidden.
 */

// ── Data loading ────────────────────────────────────────────────────────────

const FAST = ['/cs2arbitragebot/status', '/cs2arbitragebot/opportunities?limit=60'] as const;
const SLOW = ['/cs2arbitragebot/getscanalytics', '/cs2arbitragebot/scanresults', '/cs2arbitragebot/latestliquidityplan', '/cs2arbitragebot/balanceHistory'] as const;

type ZoneState = { loadedAt: number | null; error: string | null };

export function useCs2Arbitrage() {
  const status = ref<any>(null);
  const opportunities = ref<Cs2Evaluation[]>([]);
  const analytics = ref<Cs2Analytics | null>(null);
  const cycles = ref<Cs2Cycle[]>([]);
  const plan = ref<Cs2Plan | null>(null);
  const balances = ref<Cs2Balance[]>([]);
  const zones = reactive<Record<string, ZoneState>>({});
  const loadingFast = ref(false);
  const loadingSlow = ref(false);
  const now = ref(Date.now());
  let fastTimer: ReturnType<typeof setInterval> | null = null;
  let slowTimer: ReturnType<typeof setInterval> | null = null;
  let clockTimer: ReturnType<typeof setInterval> | null = null;

  const parse = (body: any) => {
    if (typeof body !== 'string') return body;
    try { return JSON.parse(body); } catch { return body; }
  };

  const describeFailure = (statusCode: number, body: any) => {
    const parsed = parse(body);
    if (parsed && typeof parsed === 'object' && typeof parsed.error === 'string') return parsed.error;
    if (statusCode === 404) return 'Route not found — the server is running an older build of the bot.';
    if (statusCode === 503) return 'The bot is starting up.';
    return `HTTP ${statusCode}`;
  };

  /** Batched GET with a per-route fallback (an older server may not support every path in /batch). */
  const fetchMany = async (paths: readonly string[]) => {
    const results = new Map<string, { ok: boolean; status: number; body: any }>();
    try {
      const batch = await RequestBatchFromKliveAPI([...paths]);
      for (const [path, item] of batch) results.set(path, { ok: item.ok, status: item.status, body: parse(item.body) });
    } catch { /* fall through to individual requests */ }
    await Promise.all(paths.filter((p) => !results.has(p)).map(async (path) => {
      try {
        const response = await RequestGETFromKliveAPI(path, false, false);
        let body: any = null;
        try { body = await response.json(); } catch { body = null; }
        results.set(path, { ok: response.ok, status: response.status, body });
      } catch (error) {
        results.set(path, { ok: false, status: 0, body: { error: 'Network error' } });
      }
    }));
    return results;
  };

  const apply = (path: string, result: { ok: boolean; status: number; body: any } | undefined, assign: (body: any) => void) => {
    const zone = (zones[path] ??= { loadedAt: null, error: null });
    if (!result) { zone.error = 'No response'; return; }
    if (result.ok && result.body != null) {
      assign(result.body);
      zone.loadedAt = Date.now();
      zone.error = null;
    } else {
      zone.error = describeFailure(result.status, result.body);
    }
  };

  const refreshFast = async () => {
    if (loadingFast.value) return;
    loadingFast.value = true;
    try {
      const r = await fetchMany(FAST);
      apply(FAST[0], r.get(FAST[0]), (b) => { status.value = b; });
      apply(FAST[1], r.get(FAST[1]), (b) => { opportunities.value = Array.isArray(b) ? b : []; });
    } finally {
      loadingFast.value = false;
    }
  };

  const refreshSlow = async () => {
    if (loadingSlow.value) return;
    loadingSlow.value = true;
    try {
      const r = await fetchMany(SLOW);
      apply(SLOW[0], r.get(SLOW[0]), (b) => { analytics.value = b; });
      apply(SLOW[1], r.get(SLOW[1]), (b) => { cycles.value = Array.isArray(b) ? b : []; });
      apply(SLOW[2], r.get(SLOW[2]), (b) => { plan.value = b; });
      apply(SLOW[3], r.get(SLOW[3]), (b) => { balances.value = Array.isArray(b) ? b : []; });
    } finally {
      loadingSlow.value = false;
    }
  };

  const refreshAll = () => Promise.all([refreshFast(), refreshSlow()]);

  const scanNow = async (): Promise<string> => {
    const response = await RequestPOSTFromKliveAPI('/cs2arbitragebot/scanNow', '', false);
    if (response.status === 202) {
      setTimeout(refreshAll, 8000);
      return 'Sweep and structural scan queued.';
    }
    let message = `Scan request failed (HTTP ${response.status}).`;
    try { const body = await response.json(); if (body?.error) message = body.error; } catch { /* keep default */ }
    return message;
  };

  const onVisibility = () => {
    if (!document.hidden) refreshAll();
  };

  onMounted(() => {
    refreshAll();
    fastTimer = setInterval(() => { if (!document.hidden) refreshFast(); }, 15_000);
    slowTimer = setInterval(() => { if (!document.hidden) refreshSlow(); }, 60_000);
    clockTimer = setInterval(() => { now.value = Date.now(); }, 5_000);
    document.addEventListener('visibilitychange', onVisibility);
  });

  onBeforeUnmount(() => {
    if (fastTimer) clearInterval(fastTimer);
    if (slowTimer) clearInterval(slowTimer);
    if (clockTimer) clearInterval(clockTimer);
    document.removeEventListener('visibilitychange', onVisibility);
  });

  const lastLoadedAt = computed(() => {
    const times = Object.values(zones).map((z) => z.loadedAt).filter((t): t is number => t != null);
    return times.length ? Math.max(...times) : null;
  });

  const zoneError = (path: string) => zones[path]?.error ?? null;

  return {
    status, opportunities, analytics, cycles, plan, balances,
    loadingFast, loadingSlow, now, lastLoadedAt,
    refreshAll, refreshFast, refreshSlow, scanNow, zoneError,
    paths: { status: FAST[0], opportunities: FAST[1], analytics: SLOW[0], cycles: SLOW[1], plan: SLOW[2], balances: SLOW[3] },
  };
}
