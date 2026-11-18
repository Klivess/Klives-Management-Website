<template>
  <div class="llx" data-testid="llx-root">
    <!-- ── bar ── -->
    <header class="llx-bar">
      <div class="llx-bar__id">
        <span class="llx-bar__mark" :data-tone="c.verdict.value.tone"><LlmIcon name="brain" /></span>
        <h1 class="llx-bar__title">KliveLLM</h1>
        <span class="llx-bar__sub">{{ subline }}</span>
      </div>

      <button class="llx-search" aria-label="Search services, routers and actions" aria-keyshortcuts="Control+K" data-testid="llx-search" @click="paletteOpen = true">
        <LlmIcon name="search" />
        <span class="llx-search__text">Find a service, a router, an action…</span>
        <span class="llx-kbd">Ctrl</span><span class="llx-kbd">K</span>
      </button>

      <span class="llx-bar__spacer"></span>

      <div class="llx-bar__actions">
        <button class="llx-live" :data-state="c.linkState.value" :data-tone="link.tone" :title="link.title" :aria-label="link.title" data-testid="llx-live" @click="c.setLive(!c.prefs.value.live)">
          <span class="llx-live__dot"></span>
          <span class="llx-live__word">{{ link.word }}</span>
          <span v-if="c.linkState.value === 'live'" :key="c.tick.value" class="llx-live__sweep"></span>
        </button>
        <button v-if="c.allowed.value.settings" class="llx-btn llx-btn--ghost" title="Ledger settings" aria-label="Ledger settings" data-testid="llx-settings" @click="settingsOpen = true">
          <LlmIcon name="gauge" />
        </button>
        <button class="llx-btn llx-btn--ghost" title="Refresh now (R)" aria-label="Refresh now" aria-keyshortcuts="R" data-testid="llx-refresh" @click="c.refreshAll()">
          <LlmIcon name="refresh" :class="{ 'llx-spin': c.busy.value.main || c.busy.value.live }" />
        </button>
      </div>
    </header>

    <!-- The layout already provides the page's <main>. -->
    <div class="llx-main">
      <div v-if="!c.allowed.value.view" class="llx-card">
        <div class="llx-empty"><LlmIcon name="lock" />KliveLLM is not part of your access.</div>
      </div>

      <template v-else>
        <div v-if="c.missing.value || c.live.value?.ledgerError" class="llx-banner" data-tone="info" data-testid="llx-waiting">
          <LlmIcon name="info" />
          <span v-if="c.live.value?.ledgerError">The call ledger did not start: {{ c.live.value.ledgerError }}</span>
          <span v-else>The server has not got the KliveLLM routes yet: this page fills in once the new build is running.</span>
        </div>

        <LlmTimeBar :window="c.window.value" :bucket="c.bucket.value" :now="c.now.value" :can-back="c.history.value.length > 0"
                    :auto-bucket="c.overview.value?.data?.bucket" :navigator="navigator.values" :navigator-from="navigator.from" :navigator-step="navigator.step"
                    @preset="c.setPreset" @custom="(f, t) => c.zoomTo(f, t)" @zoom-in="c.zoomInWindow()" @zoom-out="c.zoomOutWindow()"
                    @pan="d => c.panWindow(d)" @back="c.backWindow()" @bucket="b => (c.bucket.value = b)" />

        <div class="llx-tabs" role="tablist" aria-label="KliveLLM">
          <button v-for="(t, i) in c.tabs.value" :key="t.id" class="llx-tab" role="tab" :aria-selected="c.tab.value === t.id" :data-testid="`tab-${t.id}`"
                  :title="`${t.label} (${i + 1})`" @click="ui.goTab(t.id)">
            <LlmIcon :name="t.icon" />{{ t.label }}
            <span v-if="badge(t.id)" class="llx-tab__count" :data-tone="badge(t.id)!.tone">{{ badge(t.id)!.text }}</span>
          </button>
        </div>

        <LlmOverviewTab v-if="c.tab.value === 'overview'" />
        <LlmServicesTab v-else-if="c.tab.value === 'services'" />
        <LlmRoutingTab v-else-if="c.tab.value === 'routing'" />
        <LlmRoutersTab v-else-if="c.tab.value === 'routers'" />
        <LlmAnalyticsTab v-else-if="c.tab.value === 'analytics'" />
        <LlmCostsTab v-else-if="c.tab.value === 'costs'" />
        <LlmCallsTab v-else-if="c.tab.value === 'calls'" />
        <LlmInsightsTab v-else-if="c.tab.value === 'insights'" />
      </template>
    </div>

    <LlmLaneSheet :lane-key="laneKey" @close="laneKey = null" />
    <LlmRouterSheet :router-id="routerId" @close="routerId = null" />
    <LlmCallDialog :call-id="callId" @close="callId = null" />
    <LlmPalette :open="paletteOpen" :commands="commands" @close="paletteOpen = false" />
    <LlmSettingsDialog :open="settingsOpen" @close="settingsOpen = false" />

    <LlmDialog :open="!!asking" :title="asking?.title ?? ''" :icon="asking?.danger ? 'alert' : 'info'" :tone="asking?.danger ? 'warn' : 'info'" testid="llx-confirm" @close="answer(false)">
      <p v-if="asking?.body" class="llx-dialog__text">{{ asking.body }}</p>
      <template #actions>
        <button class="llx-btn" data-autofocus @click="answer(false)">Cancel</button>
        <button class="llx-btn" :class="asking?.danger ? 'llx-btn--danger' : 'llx-btn--primary'" data-testid="llx-confirm-yes" @click="answer(true)">{{ asking?.confirm ?? 'Go ahead' }}</button>
      </template>
    </LlmDialog>

    <Teleport to="body">
      <div class="llx-layer llx-toasts" aria-live="polite">
        <div v-for="t in c.toasts.value" :key="t.id" class="llx-toast" :data-tone="t.tone" role="status">
          <LlmIcon :name="t.tone === 'ok' ? 'check-circle' : t.tone === 'crit' ? 'octagon-x' : t.tone === 'warn' ? 'alert' : 'info'" />
          <span>{{ t.text }}</span>
          <button v-if="t.action" class="llx-btn llx-btn--xs" @click="t.action.run(); c.dismissToast(t.id)">{{ t.action.label }}</button>
          <button class="llx-iconbtn llx-iconbtn--sm" aria-label="Dismiss" @click="c.dismissToast(t.id)"><LlmIcon name="x" /></button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';
import { useKliveLlm, useLlmRead, type LlmTab, type LlmUi } from '~/composables/useKliveLlm';
import { LLM_PRESETS, routingDraftChanges, type LlmCommand } from '~/scripts/kliveLlm';

const c = useKliveLlm();
provide('llx', c);

// ── navigation between tabs, sheets and dialogs ──
const target = ref<string | null>(null);
const analyticsPreset = ref<LlmUi['analyticsPreset']['value']>(null);
const callsPreset = ref<Record<string, any> | null>(null);
const draft = ref<any | null>(null);
const draftBase = ref<number | null>(null);
const draftOrigin = ref<any | null>(null);
const laneKey = ref<string | null>(null);
const routerId = ref<string | null>(null);
const callId = ref<number | null>(null);
const paletteOpen = ref(false);
const settingsOpen = ref(false);
const asking = ref<{ title: string; body?: string; confirm?: string; danger?: boolean; resolve: (ok: boolean) => void } | null>(null);

function answer(ok: boolean) {
  const a = asking.value;
  asking.value = null;
  a?.resolve(ok);
}

const ui: LlmUi = {
  target, analyticsPreset, callsPreset, draft, draftBase, draftOrigin,
  goTab(tab: LlmTab, t: string | null = null) {
    if (!c.tabs.value.some(x => x.id === tab)) { c.notify('info', 'That part of KliveLLM is not in your access.'); return; }
    c.tab.value = tab;
    target.value = t;
  },
  openCall(id) { if (c.allowed.value.calls) callId.value = id; },
  openLane(key) { laneKey.value = key; },
  openRouter(id) { routerId.value = id; },
  filterAnalytics(filters, metric, groupBy) {
    analyticsPreset.value = { filters, metric, groupBy };
    laneKey.value = null;
    routerId.value = null;
    ui.goTab('analytics');
  },
  openCalls(filter) {
    callsPreset.value = filter;
    laneKey.value = null;
    routerId.value = null;
    ui.goTab('calls');
  },
  editRoute(key) {
    laneKey.value = null;
    ui.goTab('routing', key);
  },
  confirm(options) {
    return new Promise<boolean>(resolve => {
      asking.value?.resolve(false);
      asking.value = { ...options, resolve };
    });
  },
  async download(path, filename) {
    try {
      const response = await RequestGETFromKliveAPI(path, false, false, {});
      if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e: any) {
      c.notify('crit', `The export did not download: ${e?.message ?? e}`);
    }
  },
};
provide('llxUi', ui);

// ── bar ──
const link = computed(() => {
  switch (c.linkState.value) {
    case 'live': return { word: 'Live', tone: 'ok', title: 'Live: reading every 5 seconds. Click to pause.' };
    case 'paused': return { word: 'Paused', tone: 'neutral', title: 'Paused: nothing is read until you resume. Click to resume.' };
    case 'stale': return { word: 'Stale', tone: 'warn', title: 'The last reads did not come back. Still trying.' };
    case 'offline': return { word: 'Offline', tone: 'crit', title: 'The server is not answering.' };
    case 'starting': return { word: 'Starting', tone: 'info', title: 'KliveLLM is not ready on the server yet.' };
    default: return { word: 'Connecting', tone: 'info', title: 'Reading KliveLLM…' };
  }
});

const subline = computed(() => {
  const lanes = (c.overview.value?.data?.lanes ?? []).length;
  const routers = (c.routers.value?.routers ?? []).filter((r: any) => r.enabled).length;
  const flying = c.live.value?.inFlight?.length ?? 0;
  if (!c.overview.value && !c.routers.value) return 'Every model call: who made it, where it went, what it cost';
  return [`${lanes} active lane${lanes === 1 ? '' : 's'}`, `${routers} router${routers === 1 ? '' : 's'}`, flying ? `${flying} in flight` : null].filter(Boolean).join(' · ');
});

const pendingCount = computed(() => {
  if (!draft.value || !c.routing.value?.document) return 0;
  return routingDraftChanges(c.routing.value.document, draft.value).length;
});

function badge(tab: LlmTab): { text: string; tone: string } | null {
  if (tab === 'overview') {
    const bad = c.issues.value.filter(i => i.tone !== 'info').length;
    return bad ? { text: String(bad), tone: c.issues.value.some(i => i.tone === 'crit') ? 'crit' : 'warn' } : null;
  }
  if (tab === 'routing' && pendingCount.value) return { text: `${pendingCount.value} unsaved`, tone: 'warn' };
  if (tab === 'calls') {
    const n = c.live.value?.inFlight?.length ?? 0;
    return n ? { text: `${n} live`, tone: 'info' } : null;
  }
  return null;
}

// ── the navigator: calls a day over the kept history ──
const nav = useLlmRead(c, () => (c.allowed.value.analytics ? '/klivellm/series?range=90d&bucket=1d&metrics=calls' : null));
const navigator = computed(() => {
  const s = nav.value.value;
  const values: number[] = (s?.totalSeries?.calls ?? []).map((v: number | null) => v ?? 0);
  return { values, from: Number(s?.from ?? 0), step: Number(s?.step ?? 86_400_000) };
});

// ── command palette ──
function commands(query: string): LlmCommand[] {
  const list: LlmCommand[] = [];
  const q = query.toLowerCase();
  c.tabs.value.forEach((t, i) => list.push({ id: `tab-${t.id}`, group: 'Go to', title: t.label, icon: t.icon, hint: String(i + 1), keywords: 'tab page', run: () => ui.goTab(t.id) }));

  list.push({ id: 'live', group: 'Actions', title: c.prefs.value.live ? 'Pause live updates' : 'Resume live updates', icon: c.prefs.value.live ? 'pause' : 'play', keywords: 'live poll stop', run: () => c.setLive(!c.prefs.value.live) });
  list.push({ id: 'refresh', group: 'Actions', title: 'Refresh now', icon: 'refresh', hint: 'R', keywords: 'reload', run: () => c.refreshAll() });
  list.push({ id: 'zoom-out', group: 'Actions', title: 'Zoom out', icon: 'zoom-out', hint: '−', keywords: 'window wider', run: () => c.zoomOutWindow() });
  list.push({ id: 'zoom-in', group: 'Actions', title: 'Zoom in', icon: 'zoom-in', hint: '+', keywords: 'window narrower', run: () => c.zoomInWindow() });
  const override = c.routing.value?.document?.override;
  if (c.allowed.value.routing && override && new Date(override.untilUtc).getTime() > Date.now())
    list.push({ id: 'override-clear', group: 'Actions', title: 'Clear the emergency override', icon: 'undo', keywords: 'override cancel', run: () => c.clearOverride() });
  if (c.allowed.value.routing && (c.live.value?.circuits ?? []).length)
    list.push({ id: 'circuits', group: 'Actions', title: 'Try every skipped router again', icon: 'refresh', keywords: 'circuit reset breaker', run: () => c.resetCircuits() });
  if (c.allowed.value.prices) list.push({ id: 'prices', group: 'Actions', title: 'Read OpenRouter prices', icon: 'coins', keywords: 'price book refresh catalogue', run: () => c.refreshPrices() });
  if (c.allowed.value.export) list.push({ id: 'export', group: 'Actions', title: 'Export this window’s calls (CSV)', icon: 'download', keywords: 'csv download', run: () => ui.download(`/klivellm/export?kind=calls&from=${c.bounds.value.from}&to=${c.bounds.value.to}`, 'klivellm-calls.csv') });
  if (c.allowed.value.settings) list.push({ id: 'settings', group: 'Actions', title: 'Ledger settings', icon: 'gauge', keywords: 'retention probes', run: () => { settingsOpen.value = true; } });

  const lanes: any[] = c.routing.value?.lanes ?? [];
  for (const lane of lanes)
    list.push({ id: `lane-${lane.key}`, group: 'Services', title: `${lane.service} › ${lane.label}`, icon: 'grid', keywords: `${lane.key} ${lane.effective?.routerName ?? ''} ${lane.effective?.model ?? ''}`, run: () => ui.openLane(lane.key) });
  for (const r of c.routers.value?.routers ?? [])
    list.push({ id: `router-${r.id}`, group: 'Routers', title: r.name, icon: 'server', keywords: `${r.id} ${r.billing} ${r.defaultModel ?? ''}`, run: () => ui.openRouter(r.id) });
  for (const p of LLM_PRESETS)
    list.push({ id: `range-${p}`, group: 'Window', title: `Show the last ${p}`, icon: 'clock', keywords: 'window range time', run: () => c.setPreset(p) });

  if (c.allowed.value.routing && /pause|resume|stop|start/.test(q)) {
    for (const lane of lanes) {
      const paused = lane.effective?.blocked === 'Paused';
      list.push({ id: `pause-${lane.key}`, group: 'Pause', title: `${paused ? 'Resume' : 'Pause'} ${lane.service} › ${lane.label}`, icon: paused ? 'play' : 'pause', keywords: 'pause resume stop start', danger: !paused,
        run: () => c.setPaused(lane.service, lane.lane, !paused, paused ? undefined : 'Paused from the command palette') });
    }
  }
  if (c.allowed.value.routing && /override|everything|send|route all|emergency/.test(q)) {
    for (const r of (c.routers.value?.routers ?? []).filter((x: any) => x.enabled && x.keySet))
      list.push({ id: `override-${r.id}`, group: 'Emergency override', title: `Send every call to ${r.name} for 1 hour`, icon: 'alert', keywords: 'override everything send emergency', danger: true,
        run: async () => { if (await ui.confirm({ title: `Send every call to ${r.name} for an hour?`, body: 'Every service and lane goes there, whatever its own route says, until the hour is up or you clear it. Spending rules still apply.', confirm: 'Send everything', danger: true })) await c.setOverride({ router: r.id, minutes: 60, reason: 'Set from the command palette' }); } });
  }
  const id = Number(query.trim().replace(/^#/, ''));
  if (c.allowed.value.calls && Number.isInteger(id) && id > 1000)
    list.unshift({ id: 'open-call', group: 'Calls', title: `Open call #${id}`, icon: 'list', keywords: query, run: () => ui.openCall(id) });
  return list;
}

// ── keys ──
const layerOpen = computed(() => paletteOpen.value || settingsOpen.value || !!asking.value || laneKey.value != null || routerId.value != null || callId.value != null);

function onKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    paletteOpen.value = !paletteOpen.value;
    return;
  }
  if (event.key === 'Escape' && layerOpen.value) {
    if (paletteOpen.value) paletteOpen.value = false;
    else if (asking.value) answer(false);
    else if (settingsOpen.value) settingsOpen.value = false;
    else if (callId.value != null) callId.value = null;
    else if (routerId.value != null) routerId.value = null;
    else laneKey.value = null;
    return;
  }
  const el = event.target as HTMLElement | null;
  if (el && (el.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) || el.getAttribute('role') === 'tab' && event.key.startsWith('Arrow'))) return;
  if (event.ctrlKey || event.metaKey || event.altKey || layerOpen.value) return;
  switch (event.key) {
    case 'r': case 'R': void c.refreshAll(); break;
    case '-': case '_': c.zoomOutWindow(); break;
    case '+': case '=': c.zoomInWindow(); break;
    case 'ArrowLeft': c.panWindow(-1); break;
    case 'ArrowRight': c.panWindow(1); break;
    case 'Backspace': c.backWindow(); break;
    default: {
      if (!/^[1-8]$/.test(event.key)) return;
      const t = c.tabs.value[Number(event.key) - 1];
      if (!t) return;
      ui.goTab(t.id);
    }
  }
  event.preventDefault();
}

// Unsaved routing edits: say so before the page is left.
function onBeforeUnload(event: BeforeUnloadEvent) {
  if (!pendingCount.value) return;
  event.preventDefault();
  event.returnValue = '';
}

// A sheet or dialog named in the address bar opens with the page (links into a lane or a call).
const route = useRoute();
onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('beforeunload', onBeforeUnload);
  const q = route.query;
  if (typeof q.lane === 'string') laneKey.value = q.lane;
  if (typeof q.router === 'string') routerId.value = q.router;
  if (typeof q.call === 'string' && Number(q.call) > 0) callId.value = Number(q.call);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('beforeunload', onBeforeUnload);
});

// Keep the open sheet in the address bar so a link (or reload) comes back to it.
const router = useRouter();
watch([laneKey, routerId, callId], ([lane, rid, call]) => {
  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(route.query)) if (typeof v === 'string' && !['lane', 'router', 'call'].includes(k)) query[k] = v;
  if (lane) query.lane = lane;
  if (rid) query.router = rid;
  if (call) query.call = String(call);
  void router.replace({ query });
});

watch(() => c.tab.value, () => { if (typeof window !== 'undefined') window.scrollTo({ top: 0 }); });
</script>
