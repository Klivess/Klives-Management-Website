import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { RequestBatchFromKliveAPI, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import { useAccess } from '~/composables/useAccess';
import type { Cs2AnalyticsV3, Cs2Balance, Cs2Cycle, Cs2Evaluation, Cs2Plan, Cs2Status } from '~/scripts/cs2Arbitrage';

/**
 * State and polling for the CS2 Arbitrage console (pages/schemery/cs2arbitragebot.vue).
 *
 * Three tiers, never while the tab is hidden or live updates are paused:
 *  - status + the deal flow in one /batch every 15 s;
 *  - while the bot is starting, status alone every 5 s (the other routes answer 503 until it is ready);
 *  - analytics (compact: no order books), scan cycles, the conversion plan and balances in one /batch every 60 s.
 * The old page pulled the full 526 KB analytics every minute. Every route and field added for this page is optional:
 * a 404 from an older bot build turns that feature off with a note instead of an error.
 */

const PATHS = {
  status: '/cs2arbitragebot/status',
  deals: '/cs2arbitragebot/opportunities?limit=150',
  analytics: '/cs2arbitragebot/getscanalytics?compact=1',
  cycles: '/cs2arbitragebot/scanresults',
  plan: '/cs2arbitragebot/latestliquidityplan',
  balances: '/cs2arbitragebot/balanceHistory',
} as const;

const FAST_MS = 15_000;
const STARTING_MS = 5_000;
const SLOW_MS = 60_000;
const PREFS_KEY = 'cs2x.prefs';

export interface Cs2Toast { id: number; tone: 'ok' | 'warn' | 'crit' | 'info'; text: string }

type Zone = { loadedAt: number | null; error: string | null };

export function useCs2Console() {
  const access = useAccess();
  const allowed = computed(() => ({
    status: access.can('cs2.status.view'),
    read: access.can('cs2.scans.read'),
    scan: access.can('cs2.scans.run'),
    manage: access.can('cs2.positions.manage'),
    settings: access.can('system.settings.write'),
  }));

  const status = ref<Cs2Status | null>(null);
  const deals = ref<Cs2Evaluation[]>([]);
  const analytics = ref<Cs2AnalyticsV3 | null>(null);
  const cycles = ref<Cs2Cycle[]>([]);
  const plan = ref<Cs2Plan | null>(null);
  const balances = ref<Cs2Balance[]>([]);
  const zones = reactive<Record<string, Zone>>({});
  const busy = reactive({ fast: false, slow: false });
  const pending = reactive<Record<string, boolean>>({});
  const toasts = ref<Cs2Toast[]>([]);
  const now = ref(Date.now());
  const prefs = reactive({ live: true, dealGroup: 'all' as 'all' | 'buy' | 'model' | 'screen', positions: 'open' as 'open' | 'needs' | 'all', balanceDays: 90 as number | null, funnelDays: 30 });

  let fastTimer: ReturnType<typeof setTimeout> | null = null;
  let slowTimer: ReturnType<typeof setInterval> | null = null;
  let clock: ReturnType<typeof setInterval> | null = null;
  let toastSeq = 0;
  let disposed = false;

  const parse = (body: unknown) => {
    if (typeof body !== 'string') return body;
    try { return JSON.parse(body); } catch { return body; }
  };

  const describe = (code: number, body: any) => {
    const parsed = parse(body);
    if (parsed && typeof parsed === 'object' && typeof (parsed as any).error === 'string') return (parsed as any).error as string;
    if (code === 404) return 'Not on this server build yet.';
    if (code === 403) return 'Not part of your access.';
    if (code === 503) return 'The bot is starting up.';
    if (code === 0) return 'Network error.';
    return `HTTP ${code}`;
  };

  /** Batched GET with a per-route fallback (an older server may not answer every path inside /batch). */
  async function fetchMany(paths: string[]) {
    const out = new Map<string, { ok: boolean; status: number; body: any }>();
    try {
      const batch = await RequestBatchFromKliveAPI(paths);
      for (const [path, item] of batch) out.set(path, { ok: item.ok, status: item.status, body: parse(item.body) });
    } catch { /* fall back below */ }
    await Promise.all(paths.filter((p) => !out.has(p)).map(async (path) => {
      try {
        const response = await RequestGETFromKliveAPI(path, false, false);
        let body: any = null;
        try { body = await response.json(); } catch { body = null; }
        out.set(path, { ok: response.ok, status: response.status, body });
      } catch {
        out.set(path, { ok: false, status: 0, body: null });
      }
    }));
    return out;
  }

  function apply(path: string, result: { ok: boolean; status: number; body: any } | undefined, assign: (body: any) => void) {
    const zone = (zones[path] ??= { loadedAt: null, error: null });
    if (!result) { zone.error = 'No response.'; return; }
    if (result.ok && result.body != null && typeof result.body === 'object') {
      assign(result.body);
      zone.loadedAt = Date.now();
      zone.error = null;
    } else if (result.status === 503 && (result.body as any)?.pending) {
      // The bot is still starting: "not yet", not an error (the status line says what it is doing).
      zone.error = null;
    } else {
      zone.error = describe(result.status, result.body);
    }
  }

  const starting = computed(() => {
    const state = String(status.value?.startupState ?? '');
    return Boolean(status.value) && state !== 'running' && !state.startsWith('ready') && !state.startsWith('failed');
  });

  async function refreshFast() {
    if (busy.fast || !allowed.value.status) return;
    busy.fast = true;
    try {
      const paths: string[] = [PATHS.status];
      if (allowed.value.read && !starting.value) paths.push(PATHS.deals);
      const r = await fetchMany(paths);
      apply(PATHS.status, r.get(PATHS.status), (b) => { status.value = b; });
      if (paths.includes(PATHS.deals)) apply(PATHS.deals, r.get(PATHS.deals), (b) => { deals.value = Array.isArray(b) ? b : []; });
    } finally {
      busy.fast = false;
    }
  }

  async function refreshSlow() {
    if (busy.slow || !allowed.value.read || starting.value) return;
    busy.slow = true;
    try {
      const paths = [PATHS.analytics, PATHS.cycles, PATHS.plan, PATHS.balances];
      const r = await fetchMany(paths);
      apply(PATHS.analytics, r.get(PATHS.analytics), (b) => { analytics.value = b; });
      apply(PATHS.cycles, r.get(PATHS.cycles), (b) => { cycles.value = Array.isArray(b) ? b : []; });
      // The plan answers 503 until the conversion model has run once: that is "not yet", not an error.
      const planResult = r.get(PATHS.plan);
      if (planResult?.status === 503) (zones[PATHS.plan] ??= { loadedAt: null, error: null }).error = null;
      else apply(PATHS.plan, planResult, (b) => { plan.value = b; });
      apply(PATHS.balances, r.get(PATHS.balances), (b) => { balances.value = Array.isArray(b) ? b : []; });
    } finally {
      busy.slow = false;
    }
  }

  const refreshAll = async () => { await refreshFast(); await refreshSlow(); };

  /** The fast tier reschedules itself: 5 s while the bot starts, 15 s after. */
  function scheduleFast() {
    if (fastTimer) clearTimeout(fastTimer);
    if (disposed) return;
    fastTimer = setTimeout(async () => {
      if (prefs.live && !document.hidden) {
        const wasStarting = starting.value;
        await refreshFast();
        if (wasStarting && !starting.value) refreshSlow();
      }
      scheduleFast();
    }, starting.value ? STARTING_MS : FAST_MS);
  }

  function notify(tone: Cs2Toast['tone'], text: string) {
    const id = ++toastSeq;
    toasts.value = [...toasts.value.slice(-3), { id, tone, text }];
    setTimeout(() => dismiss(id), tone === 'crit' ? 9000 : 5500);
  }
  const dismiss = (id: number) => { toasts.value = toasts.value.filter((t) => t.id !== id); };

  /** POST an action; returns the parsed body on success, null (after a toast) on failure. */
  async function act(key: string, path: string, body: object | null): Promise<any | null> {
    if (pending[key]) return null;
    pending[key] = true;
    try {
      const response = await RequestPOSTFromKliveAPI(path, body == null ? '' : JSON.stringify(body), false, body != null);
      let parsed: any = null;
      try { parsed = await response.json(); } catch { parsed = null; }
      if (!response.ok) {
        notify(response.status === 404 && !parsed?.error ? 'warn' : 'crit',
          response.status === 404 && !parsed?.error ? 'This server build does not have that yet — it arrives with the next backend deploy.' : describe(response.status, parsed));
        return null;
      }
      return parsed ?? {};
    } catch {
      notify('crit', 'Network error.');
      return null;
    } finally {
      pending[key] = false;
    }
  }

  async function scanNow() {
    const r = await act('scan', '/cs2arbitragebot/scanNow', null);
    if (!r) return;
    notify('ok', 'Sweep and whole-market scan queued.');
    setTimeout(refreshAll, 8000);
  }

  async function requestSteamLogin() {
    const r = await act('steam-login', '/cs2arbitragebot/steam/login', {});
    if (!r) return;
    notify(r.open ? 'info' : 'ok', r.message ?? 'Approve the sign-in request in the Steam app.');
    setTimeout(refreshFast, 3000);
  }

  async function recheck(id: string) {
    const r = await act(`recheck:${id}`, '/cs2arbitragebot/positions/recheck', { id });
    if (!r) return;
    notify(r.outcome && r.outcome !== 'unchanged' ? 'ok' : 'info', r.message ?? 'Checked.');
    await refreshAll();
  }

  async function closePosition(id: string, soldForCents: number | null, note: string) {
    const body: Record<string, unknown> = { id, note };
    if (soldForCents != null) body.soldForCents = soldForCents;
    const r = await act(`close:${id}`, '/cs2arbitragebot/positions/close', body);
    if (!r) return false;
    notify('ok', `Closed: ${r.message ?? 'done'}.`);
    await refreshAll();
    return true;
  }

  function loadPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null');
      if (saved && typeof saved === 'object') Object.assign(prefs, saved);
    } catch { /* private window: defaults */ }
  }
  watch(prefs, (value) => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(value)); } catch { /* ignore */ }
  }, { deep: true });

  const onVisibility = () => { if (!document.hidden && prefs.live) refreshAll(); };

  watch(() => prefs.live, (live) => { if (live) refreshAll(); });

  onMounted(async () => {
    loadPrefs();
    await access.ensureLoaded?.();
    await refreshAll();
    scheduleFast();
    slowTimer = setInterval(() => { if (prefs.live && !document.hidden) refreshSlow(); }, SLOW_MS);
    clock = setInterval(() => { now.value = Date.now(); }, 1000);
    document.addEventListener('visibilitychange', onVisibility);
  });

  onBeforeUnmount(() => {
    disposed = true;
    if (fastTimer) clearTimeout(fastTimer);
    if (slowTimer) clearInterval(slowTimer);
    if (clock) clearInterval(clock);
    document.removeEventListener('visibilitychange', onVisibility);
  });

  const lastLoadedAt = computed(() => {
    const times = Object.values(zones).map((z) => z.loadedAt).filter((t): t is number => t != null);
    return times.length ? Math.max(...times) : null;
  });
  const zoneError = (key: keyof typeof PATHS) => zones[PATHS[key]]?.error ?? null;
  const loaded = (key: keyof typeof PATHS) => zones[PATHS[key]]?.loadedAt != null;

  /** Until the profile has loaded every permission reads false; the page must not call that "no access". */
  const accessReady = computed(() => Boolean(access.ready?.value ?? true) && Boolean(access.profile.value));

  return {
    allowed, accessReady, status, deals, analytics, cycles, plan, balances, busy, pending, toasts, now, prefs, starting, lastLoadedAt,
    refreshAll, refreshFast, refreshSlow, scanNow, requestSteamLogin, recheck, closePosition, notify, dismiss, zoneError, loaded,
  };
}
