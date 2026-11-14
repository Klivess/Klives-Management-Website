import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { RequestBatchFromKliveAPI, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import { useCurrentProfile } from '~/composables/useCurrentProfile';
import type {
  Catalog, CatalogRow, DeployPlan, Deployment, DeploymentDetail, EquityPoint, PlanOverrides, PlanRequestBody,
} from '~/scripts/deployConsole';

/**
 * State and polling for the Deploy console. Tiers: the deployment list (and engine status) in one /batch
 * every 15 s; the catalog when the page opens and when asked (the server keeps it warm); a plan whenever
 * the choice or an override changes; an open deployment's sheet every 30 s. Nothing while the tab is
 * hidden, nothing the profile's permissions would refuse.
 */

const ENGINE = '/api/omnitrader';

export interface Toast { id: number; tone: 'ok' | 'warn' | 'crit' | 'info'; text: string }

function parseBody<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value !== 'string') return value as T;
  const trimmed = value.trim();
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return null;
  try { return JSON.parse(trimmed) as T; } catch { return null; }
}

function qs(params?: Record<string, string | number | boolean | null | undefined>): string {
  if (!params) return '';
  const pairs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return pairs.length ? `?${pairs.join('&')}` : '';
}

async function getJson<T>(path: string, params?: Record<string, string | number | boolean | null | undefined>): Promise<T> {
  const res = await RequestGETFromKliveAPI(`${ENGINE}${path}${qs(params)}`, false, false);
  const text = res ? await res.text() : '';
  if (!res || !res.ok) {
    let message = !res ? 'The API could not be reached' : res.status === 403 || res.status === 401 ? 'Your profile does not have permission for this' : `HTTP ${res.status}`;
    try { message = JSON.parse(text).Error ?? message; } catch { /* keep it */ }
    throw Object.assign(new Error(message), { status: res?.status ?? 0 });
  }
  return JSON.parse(text) as T;
}

async function postJson<T>(path: string, params?: Record<string, string | number | boolean | null | undefined>, body?: unknown): Promise<T> {
  const res = await RequestPOSTFromKliveAPI(`${ENGINE}${path}${qs(params)}`, body === undefined ? '' : JSON.stringify(body), false, false);
  const text = res ? await res.text() : '';
  if (!res || !res.ok) {
    let message = !res ? 'The API could not be reached' : res.status === 403 || res.status === 401 ? 'Your profile does not have permission for this' : `HTTP ${res.status}`;
    try { message = JSON.parse(text).Error ?? message; } catch { if (text && text.length < 200) message = text; }
    throw new Error(message);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export function useDeployConsole() {
  const profile = useCurrentProfile();
  const can = (key: string) => profile.can(key);
  const allowed = computed(() => ({
    read: can('omnitrader.deployments.read'),
    manage: can('omnitrader.deployments.manage'),
    control: can('omnitrader.deployments.control'),
    goLive: can('omnitrader.deployments.go-live'),
    alpha: can('omnitrader.alpha.read'),
    versions: can('omnitrader.strategies.read'),
    experiments: can('omnitrader.experiments.manage'),
  }));

  // ── what the server said ──
  const deployments = shallowRef<Deployment[]>([]);
  const status = shallowRef<{ DeployedCount: number; KrakenConfigured: boolean; Uptime?: string } | null>(null);
  const catalog = shallowRef<Catalog | null>(null);
  const catalogError = ref('');
  const catalogBusy = ref(false);
  const versions = shallowRef<any[]>([]);
  const lastSync = ref<number | null>(null);
  const linkError = ref('');
  const loaded = ref(false);
  const now = ref(Date.now());

  // ── plan ──
  const choice = shallowRef<{ candidate?: string | null; strategy?: string | null; name?: string } | null>(null);
  const overrides = ref<PlanOverrides>({});
  const plan = shallowRef<DeployPlan | null>(null);
  const planBusy = ref(false);
  const planError = ref('');
  let planSeq = 0;

  // ── sheet ──
  const sheetId = ref<string | null>(null);
  const sheet = shallowRef<DeploymentDetail | null>(null);
  const sheetEquity = shallowRef<EquityPoint[] | null>(null);
  const sheetError = ref('');

  const busy = ref<string | null>(null);
  const toasts = ref<Toast[]>([]);
  const hidden = ref(false);
  let toastSeq = 0;

  function toast(text: string, tone: Toast['tone'] = 'ok') {
    const id = ++toastSeq;
    toasts.value = [...toasts.value, { id, tone, text }];
    window.setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, tone === 'crit' ? 9000 : 5000);
  }

  // ── fast tier ──
  async function refreshFast() {
    if (!allowed.value.read) { loaded.value = true; return; }
    const paths = [`${ENGINE}/deployments`, `${ENGINE}/status`];
    try {
      const results = await RequestBatchFromKliveAPI(paths);
      if (!results.size) throw new Error('The API could not be reached');
      const list = results.get(paths[0]);
      if (list?.ok) {
        const rows = parseBody<Deployment[]>(list.body);
        if (Array.isArray(rows)) deployments.value = rows;
        linkError.value = '';
      } else if (list) {
        linkError.value = list.status === 503 ? 'The deployment list is warming up' : `Deployments: HTTP ${list.status}`;
      }
      const st = results.get(paths[1]);
      if (st?.ok) status.value = parseBody(st.body);
      lastSync.value = Date.now();
    } catch (e: any) {
      linkError.value = e?.message ?? 'The API could not be reached';
    } finally { loaded.value = true; }
  }

  async function loadCatalog(fresh = false) {
    if (!allowed.value.read) return;
    catalogBusy.value = true;
    try {
      catalog.value = await getJson<Catalog>('/deploy/catalog', fresh ? { fresh: 1 } : undefined);
      catalogError.value = '';
    } catch (e: any) {
      catalogError.value = e?.status === 404
        ? 'This server does not have the deploy catalog yet (it arrives with the next OmniTrader deploy).'
        : e?.message ?? 'The catalog could not be read';
    } finally { catalogBusy.value = false; }
  }

  async function loadVersions() {
    if (!allowed.value.versions) return;
    try { versions.value = await getJson<any[]>('/firm/strategy-versions'); } catch { /* the card says nothing is registered */ }
  }

  // ── plan ──
  function choose(row: CatalogRow | { candidate?: string | null; strategy?: string | null; name?: string }) {
    const next = 'Key' in row
      ? { candidate: row.CandidateId ?? null, strategy: row.CandidateId ? null : row.StrategyClass, name: row.Name }
      : row;
    choice.value = next;
    overrides.value = {};
    plan.value = null;
    void loadPlan();
  }

  function clearChoice() {
    choice.value = null;
    plan.value = null;
    planError.value = '';
    overrides.value = {};
  }

  async function loadPlan() {
    const c = choice.value;
    if (!c) return;
    const seq = ++planSeq;
    planBusy.value = true;
    try {
      const p = await getJson<DeployPlan>('/deploy/plan', {
        candidate: c.candidate ?? undefined,
        strategy: c.candidate ? undefined : c.strategy ?? undefined,
        symbol: overrides.value.symbol, interval: overrides.value.interval,
        mode: overrides.value.mode, capital: overrides.value.capital,
      });
      if (seq !== planSeq) return;
      plan.value = p;
      planError.value = '';
    } catch (e: any) {
      if (seq !== planSeq) return;
      // The server's own 404s name the candidate or strategy; any other 404 is a server without the route.
      planError.value = e?.status === 404 && !/candidate|strategy/i.test(e?.message ?? '')
        ? 'This server does not build deploy plans yet (they arrive with the next OmniTrader deploy).'
        : e?.message ?? 'The plan could not be built';
    } finally { if (seq === planSeq) planBusy.value = false; }
  }

  function override(next: PlanOverrides) {
    overrides.value = { ...overrides.value, ...next };
    void loadPlan();
  }

  async function deploy(body: PlanRequestBody): Promise<string | null> {
    busy.value = 'deploy';
    try {
      const res = await postJson<{ Id: string; Mode: string }>('/deployment/create', undefined, body);
      toast(body.Mode === 'Live' ? 'Deployed live, disarmed: nothing reaches Kraken until you arm it.' : 'Deployed on paper. It starts on the next bar.');
      clearChoice();
      await refreshFast();
      void loadCatalog();
      return res.Id;
    } catch (e: any) {
      toast(`Deploy failed: ${e?.message ?? 'unknown error'}`, 'crit');
      return null;
    } finally { busy.value = null; }
  }

  // ── lifecycle ──
  async function act(id: string, action: 'pause' | 'resume' | 'kill' | 'delete', label: string) {
    busy.value = `${action}:${id}`;
    try {
      await postJson(`/deployment/${action}`, { id });
      toast(label);
      if (action === 'delete' && sheetId.value === id) closeSheet();
      await refreshFast();
      if (sheetId.value === id) void loadSheet();
    } catch (e: any) {
      toast(`${action === 'kill' ? 'Stop' : action[0].toUpperCase() + action.slice(1)} failed: ${e?.message ?? 'unknown error'}`, 'crit');
    } finally { busy.value = null; }
  }

  async function arm(id: string) {
    busy.value = `arm:${id}`;
    try {
      await postJson('/deployment/arm-live', { id, confirm: id });
      toast('Armed: it can now place real orders on Kraken.', 'warn');
      await refreshFast();
      if (sheetId.value === id) void loadSheet();
    } catch (e: any) {
      toast(`Arm failed: ${e?.message ?? 'unknown error'}`, 'crit');
    } finally { busy.value = null; }
  }

  // ── sheet ──
  async function openSheet(id: string) {
    sheetId.value = id;
    sheet.value = null;
    sheetEquity.value = null;
    sheetError.value = '';
    await loadSheet();
  }

  function closeSheet() {
    sheetId.value = null;
    sheet.value = null;
    sheetEquity.value = null;
  }

  async function loadSheet() {
    const id = sheetId.value;
    if (!id) return;
    const [detail, equity] = await Promise.allSettled([
      getJson<DeploymentDetail>('/deployment', { id }),
      getJson<EquityPoint[]>('/deployment/equity', { id, points: 600 }),
    ]);
    if (sheetId.value !== id) return;
    if (detail.status === 'fulfilled') { sheet.value = detail.value; sheetError.value = ''; }
    else sheetError.value = detail.reason?.message ?? 'The deployment could not be read';
    if (equity.status === 'fulfilled') sheetEquity.value = Array.isArray(equity.value) ? equity.value : [];
    else if (!sheetEquity.value) sheetEquity.value = [];
  }

  async function promote(strategy: string, version: number, authority: string) {
    return postJson<any>('/firm/promotion/promote', { strategy, version, authority });
  }

  async function assess(strategy: string, version: number, authority: string) {
    return getJson<any>('/firm/promotion/assess', { strategy, version, authority });
  }

  // ── timers ──
  let fastTimer: number | undefined;
  let sheetTimer: number | undefined;
  let clockTimer: number | undefined;

  function onVisibility() {
    const was = hidden.value;
    hidden.value = document.visibilityState === 'hidden';
    if (was && !hidden.value) { void refreshFast(); if (sheetId.value) void loadSheet(); }
  }

  onMounted(() => {
    hidden.value = document.visibilityState === 'hidden';
    document.addEventListener('visibilitychange', onVisibility);
    void refreshFast();
    void loadCatalog();
    void loadVersions();
    fastTimer = window.setInterval(() => { if (!hidden.value) void refreshFast(); }, 15_000);
    sheetTimer = window.setInterval(() => { if (!hidden.value && sheetId.value) void loadSheet(); }, 30_000);
    clockTimer = window.setInterval(() => { now.value = Date.now(); }, 30_000);
  });

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.clearInterval(fastTimer);
    window.clearInterval(sheetTimer);
    window.clearInterval(clockTimer);
  });

  watch(sheetId, id => { if (!id) sheetError.value = ''; });

  return {
    allowed, deployments, status, catalog, catalogError, catalogBusy, versions, lastSync, linkError, loaded, now,
    choice, overrides, plan, planBusy, planError, sheetId, sheet, sheetEquity, sheetError, busy, toasts, hidden,
    refreshFast, loadCatalog, loadVersions, choose, clearChoice, loadPlan, override, deploy, act, arm,
    openSheet, closeSheet, loadSheet, promote, assess, toast,
  };
}
