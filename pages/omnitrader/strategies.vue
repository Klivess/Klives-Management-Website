<template>
  <OmniTraderShell>
    <div class="dpl" data-testid="dpl-root">
      <!-- ── bar ── -->
      <header class="dpl-bar">
        <div class="dpl-bar__id">
          <span class="dpl-bar__mark" :data-tone="verdict.tone"><DeployIcon name="rocket" /></span>
          <h1 class="dpl-bar__title">Deploy</h1>
          <span class="dpl-bar__sub">{{ subline }}</span>
        </div>
        <button class="dpl-search" aria-label="Search strategies, deployments and actions" aria-keyshortcuts="Control+K" data-testid="dpl-search" @click="paletteOpen = true">
          <DeployIcon name="search" />
          <span class="dpl-search__text">Find a strategy to deploy, a deployment, an action…</span>
          <span class="dpl-kbd">Ctrl</span><span class="dpl-kbd">K</span>
        </button>
        <span class="dpl-bar__spacer"></span>
        <span class="dpl-live" :data-tone="dc.linkError.value ? 'warn' : dc.hidden.value ? 'neutral' : 'ok'" :title="liveTitle">
          <span class="dpl-live__dot"></span>{{ dc.linkError.value ? 'Retrying' : dc.hidden.value ? 'Paused' : 'Live' }}
        </span>
        <button class="dpl-btn dpl-btn--ghost" title="Refresh now (R)" aria-label="Refresh now" data-testid="dpl-refresh" @click="refreshAll">
          <DeployIcon name="refresh" :class="{ 'dpl-spin': dc.catalogBusy.value }" />
        </button>
      </header>

      <div class="dpl-main">
        <div v-if="!allowed.read" class="dpl-card"><div class="dpl-empty"><DeployIcon name="lock" />Deployments are not part of your access.</div></div>

        <template v-else>
          <!-- ── verdict + figures ── -->
          <div class="dpl-top">
            <section class="dpl-verdict" :data-tone="verdict.tone" data-testid="dpl-verdict">
              <span class="dpl-verdict__glyph"><DeployIcon :name="verdict.tone === 'crit' ? 'octagon-x' : verdict.tone === 'warn' ? 'alert' : verdict.tone === 'ok' ? 'check-circle' : 'rocket'" /></span>
              <div class="dpl-verdict__text">
                <h2>{{ verdict.title }}</h2>
                <p v-if="verdict.detail">{{ verdict.detail }}</p>
                <div class="dpl-verdict__actions">
                  <button v-if="verdict.focusId" class="dpl-btn dpl-btn--sm" data-testid="dpl-verdict-open" @click="openSheet(verdict.focusId!)">Open it</button>
                  <button v-if="allowed.manage" class="dpl-btn dpl-btn--sm" :class="{ 'dpl-btn--primary': !activeCount }" @click="startNew">
                    <DeployIcon name="plus" />New deployment
                  </button>
                </div>
              </div>
            </section>

            <div class="dpl-kpis">
              <div class="dpl-kpi" data-testid="kpi-running">
                <span class="dpl-kpi__label"><DeployIcon name="activity" />Running</span>
                <b class="dpl-kpi__value">{{ activeCount }}</b>
                <span class="dpl-kpi__sub">{{ paperCount }} paper · {{ liveCount }} live<template v-if="stoppedCount"> · {{ stoppedCount }} stopped</template></span>
              </div>
              <div class="dpl-kpi" data-testid="kpi-paper">
                <span class="dpl-kpi__label"><DeployIcon name="wallet" />Paper equity</span>
                <b class="dpl-kpi__value">{{ paperCount ? compactMoney(paperEquity) : '—' }}</b>
                <span class="dpl-kpi__sub" :data-tone="signTone(paperPnl)">{{ paperCount ? `${signedPctText(paperPnl, 2)} on ${compactMoney(paperStart)}` : 'nothing on paper' }}</span>
              </div>
              <div class="dpl-kpi" :data-tone="armedCount ? 'crit' : undefined" data-testid="kpi-live">
                <span class="dpl-kpi__label"><DeployIcon name="bolt" />Live</span>
                <b class="dpl-kpi__value">{{ armedCount }}<small> armed</small></b>
                <span class="dpl-kpi__sub">{{ liveCount ? `${liveCount - armedCount} disarmed` : dc.status.value?.KrakenConfigured === false ? 'Kraken not configured' : 'Kraken spot ready' }}</span>
              </div>
              <button class="dpl-kpi dpl-kpi--btn" :data-tone="issueCount ? 'warn' : undefined" :disabled="!issueCount" data-testid="kpi-health" @click="verdict.focusId && openSheet(verdict.focusId)">
                <span class="dpl-kpi__label"><DeployIcon name="shield" />Need a look</span>
                <b class="dpl-kpi__value">{{ issueCount }}</b>
                <span class="dpl-kpi__sub">{{ issueCount ? 'stalled, quiet or erroring' : 'every deployment healthy' }}</span>
              </button>
              <button class="dpl-kpi dpl-kpi--btn" data-testid="kpi-ready" :disabled="!allowed.manage" @click="startNew">
                <span class="dpl-kpi__label"><DeployIcon name="flask" />Ready in the lab</span>
                <b class="dpl-kpi__value">{{ dc.catalog.value ? dc.catalog.value.Counts.Recommended : '—' }}</b>
                <span class="dpl-kpi__sub">{{ dc.catalog.value ? `rated Promising or better · ${dc.catalog.value.Counts.Deployed} deployed` : 'reading the Alpha Lab…' }}</span>
              </button>
            </div>
          </div>

          <!-- ── deployments + new ── -->
          <div class="dpl-mid">
            <DeployFleet
              :deployments="dc.deployments.value"
              :loaded="dc.loaded.value"
              :now="dc.now.value"
              :selected="dc.sheetId.value"
              :focus="verdict.focusId"
              :busy="dc.busy.value"
              :can-control="allowed.control"
              :can-manage="allowed.manage"
              :can-go-live="allowed.goLive"
              @open="openSheet"
              @act="(d, a) => askAct(d, a)"
              @arm="askArm"
            />

            <section v-if="allowed.manage" id="dpl-new" class="dpl-card dpl-new" aria-label="New deployment" data-testid="dpl-new">
              <header v-if="!dc.choice.value" class="dpl-card__head">
                <h2 class="dpl-card__title"><DeployIcon name="plus" />New deployment</h2>
                <span class="dpl-card__meta">{{ dc.catalog.value ? `${dc.catalog.value.Counts.Total} strategies` : '' }}</span>
                <div class="dpl-card__tools">
                  <span class="dpl-dim dpl-small">pick one; everything else is filled in</span>
                </div>
              </header>
              <DeployPicker v-if="!dc.choice.value" ref="picker" :catalog="dc.catalog.value" :error="dc.catalogError.value" @choose="choose" />
              <DeployPlan
                v-else
                :plan="dc.plan.value"
                :name="dc.choice.value.name"
                :loading="dc.planBusy.value"
                :busy="dc.busy.value === 'deploy'"
                :error="dc.planError.value"
                :can-deploy="allowed.manage"
                :can-live="allowed.goLive"
                @override="o => dc.override(o)"
                @deploy="askDeploy"
                @back="backToList"
              />
            </section>
          </div>

          <DeployVersions
            v-if="allowed.versions"
            :versions="dc.versions.value"
            :name-of="nameOf"
            :can-promote="allowed.experiments"
            :assess="dc.assess"
            :promote="dc.promote"
            @changed="dc.loadVersions()"
            @notify="(t, tone) => dc.toast(t, tone)"
          />
        </template>
      </div>

      <!-- ── layers ── -->
      <DeploySheet
        :open="!!dc.sheetId.value"
        :row="sheetRow"
        :detail="dc.sheet.value"
        :equity="dc.sheetEquity.value"
        :error="dc.sheetError.value"
        :now="dc.now.value"
        :busy="dc.busy.value"
        :can-control="allowed.control"
        :can-manage="allowed.manage"
        :can-go-live="allowed.goLive"
        @close="closeSheet"
        @act="a => sheetRow && askAct(sheetRow, a)"
        @arm="() => sheetRow && askArm(sheetRow)"
      />

      <DeployPalette :open="paletteOpen" :commands="commands" @close="paletteOpen = false" />

      <DeployDialog :open="!!confirmDeploy" title="Start this deployment?" :sub="confirmDeploy?.Mode === 'Live' ? 'Live, disarmed: nothing reaches Kraken until you arm it.' : 'Paper: simulated money against live prices.'" :icon="confirmDeploy?.Mode === 'Live' ? 'bolt' : 'rocket'" :tone="confirmDeploy?.Mode === 'Live' ? 'crit' : 'ok'" testid="dpl-confirm-deploy" @close="confirmDeploy = null">
        <dl v-if="confirmDeploy && dc.plan.value" class="dpl-kv">
          <dt>Strategy</dt><dd>{{ dc.plan.value.StrategyName }} <span class="dpl-dim dpl-mono">{{ confirmDeploy.StrategyClass }}</span></dd>
          <dt>Market</dt><dd>{{ dc.plan.value.Shape === 'basket' ? dc.plan.value.Basket.join(' · ') : confirmDeploy.Symbol }} · {{ intervalLabel(confirmDeploy.Interval) }} bars</dd>
          <dt>Capital</dt><dd>{{ moneyText(confirmDeploy.InitialQuoteBalance) }} {{ confirmDeploy.Mode === 'Live' ? '(real money)' : '(paper)' }}</dd>
          <dt>Costs</dt><dd>{{ numText(confirmDeploy.FeeFraction * 100, 2) }} % fee · {{ numText(confirmDeploy.SlippageFraction * 100, 2) }} % slippage</dd>
          <template v-if="confirmDeploy.Mode === 'Live'"><dt>Caps</dt><dd>{{ confirmDeploy.MaxPositionQuoteUsd }} per order · {{ confirmDeploy.MaxDailyLossUsd }} daily loss · {{ confirmDeploy.MaxOrdersPerHour }} orders an hour</dd></template>
        </dl>
        <div v-if="warnings.length" class="dpl-checks" style="margin-top: 10px">
          <div v-for="w in warnings" :key="w.Id" class="dpl-check" data-level="warn"><DeployIcon name="alert" /><span class="dpl-check__text"><b>{{ w.Title }}</b></span></div>
        </div>
        <template #actions>
          <button class="dpl-btn dpl-btn--ghost" @click="confirmDeploy = null">Cancel</button>
          <button class="dpl-btn" :class="confirmDeploy?.Mode === 'Live' ? 'dpl-btn--solid-danger' : 'dpl-btn--primary'" :disabled="dc.busy.value === 'deploy'" data-autofocus data-testid="dpl-confirm-deploy-go" @click="doDeploy">
            {{ warnings.length ? `Deploy anyway (${warnings.length} warning${warnings.length === 1 ? '' : 's'})` : 'Deploy' }}
          </button>
        </template>
      </DeployDialog>

      <DeployDialog :open="!!armTarget" title="Arm live trading?" :sub="armTarget ? `${armTarget.StrategyName ?? armTarget.StrategyClass} will be able to place real orders on Kraken.` : ''" icon="bolt" tone="crit" testid="dpl-confirm-arm" @close="armTarget = null">
        <p class="dpl-small" style="margin-bottom: 10px">Caps still apply to every order. Pausing disarms it and closes its positions. Type <b class="dpl-mono">{{ armTarget?.Symbol }}</b> to confirm.</p>
        <input v-model="armText" class="dpl-input dpl-mono" :placeholder="armTarget?.Symbol" aria-label="Type the symbol to confirm" data-autofocus data-testid="dpl-arm-text" @keydown.enter="armText.trim().toUpperCase() === armTarget?.Symbol.toUpperCase() && doArm()" />
        <template #actions>
          <button class="dpl-btn dpl-btn--ghost" @click="armTarget = null">Cancel</button>
          <button class="dpl-btn dpl-btn--solid-danger" :disabled="armText.trim().toUpperCase() !== armTarget?.Symbol.toUpperCase() || !!dc.busy.value" data-testid="dpl-arm-go" @click="doArm">Arm live</button>
        </template>
      </DeployDialog>

      <DeployDialog :open="!!actTarget" :title="actTitle" :sub="actSub" :icon="actTarget?.action === 'delete' ? 'trash' : actTarget?.action === 'kill' ? 'stop' : 'pause'" :tone="actTarget?.action === 'pause' || actTarget?.action === 'resume' ? 'warn' : 'crit'" testid="dpl-confirm-act" @close="actTarget = null">
        <template #actions>
          <button class="dpl-btn dpl-btn--ghost" @click="actTarget = null">Cancel</button>
          <button class="dpl-btn" :class="actTarget?.action === 'kill' || actTarget?.action === 'delete' ? 'dpl-btn--solid-danger' : 'dpl-btn--primary'" data-autofocus data-testid="dpl-confirm-act-go" @click="doAct">{{ actButton }}</button>
        </template>
      </DeployDialog>

      <Teleport to="body">
        <div class="dpl-layer dpl-toasts" aria-live="polite">
          <div v-for="t in dc.toasts.value" :key="t.id" class="dpl-toast" :data-tone="t.tone" data-testid="dpl-toast">{{ t.text }}</div>
        </div>
      </Teleport>
    </div>
  </OmniTraderShell>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDeployConsole } from '~/composables/useDeployConsole';
import {
  compactMoney, computeVerdict, healthOf, intervalLabel, isActive, moneyText, numText, signTone, signedPctText,
  type CatalogRow, type DeployCommand, type Deployment, type PlanRequestBody,
} from '~/scripts/deployConsole';

definePageMeta({ layout: 'navbar' });

const route = useRoute();
const router = useRouter();
const dc = useDeployConsole();
const allowed = dc.allowed;

const paletteOpen = ref(false);
const picker = ref<{ focus: () => void } | null>(null);
const confirmDeploy = ref<PlanRequestBody | null>(null);
const armTarget = ref<Deployment | null>(null);
const armText = ref('');
const actTarget = ref<{ d: Deployment; action: 'pause' | 'resume' | 'kill' | 'delete' } | null>(null);

// ── figures ──
const all = computed(() => dc.deployments.value);
const active = computed(() => all.value.filter(isActive));
const activeCount = computed(() => active.value.length);
const stoppedCount = computed(() => all.value.length - active.value.length);
const paper = computed(() => active.value.filter(d => d.Mode !== 'Live'));
const paperCount = computed(() => paper.value.length);
const liveCount = computed(() => active.value.filter(d => d.Mode === 'Live').length);
const armedCount = computed(() => active.value.filter(d => d.Mode === 'Live' && d.Armed).length);
const paperEquity = computed(() => paper.value.reduce((s, d) => s + (d.EquityCurrent ?? 0), 0));
const paperStart = computed(() => paper.value.reduce((s, d) => s + (d.EquityInitial ?? 0), 0));
const paperPnl = computed(() => (paperStart.value ? ((paperEquity.value - paperStart.value) / paperStart.value) * 100 : null));
const issueCount = computed(() => active.value.filter(d => ['crit', 'warn'].includes(healthOf(d).Tone)).length);
const verdict = computed(() => computeVerdict(all.value, dc.catalog.value));
const sheetRow = computed(() => all.value.find(d => d.Id === dc.sheetId.value) ?? null);
const warnings = computed(() => (dc.plan.value?.Checks ?? []).filter(c => c.Level === 'warn'));

const subline = computed(() => {
  if (!dc.loaded.value) return 'Reading deployments…';
  const parts = [`${activeCount.value} running`];
  if (armedCount.value) parts.push(`${armedCount.value} armed`);
  if (dc.lastSync.value) parts.push(`updated ${Math.max(0, Math.round((dc.now.value - dc.lastSync.value) / 60_000)) || 'under a'} min ago`);
  return parts.join(' · ');
});
const liveTitle = computed(() => dc.linkError.value || (dc.hidden.value ? 'Paused while this tab is hidden' : 'Deployments refresh every 15 s'));

function nameOf(cls: string) {
  const base = cls.split('@')[0];
  return dc.catalog.value?.Rows.find(r => r.StrategyClass.split('@')[0] === base)?.Name ?? all.value.find(d => d.StrategyClass === cls)?.StrategyName ?? cls;
}

// ── composer ──
function choose(row: CatalogRow) {
  dc.choose(row);
  void router.replace({ query: { ...route.query, candidate: row.CandidateId ?? undefined, strategy: row.CandidateId ? undefined : row.StrategyClass } });
}

function backToList() {
  dc.clearChoice();
  const { candidate, strategy, ...rest } = route.query;
  void router.replace({ query: rest });
  void nextTick(() => picker.value?.focus());
}

async function startNew() {
  if (dc.choice.value) backToList();
  await nextTick();
  document.getElementById('dpl-new')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  picker.value?.focus();
}

function askDeploy(body: PlanRequestBody) { confirmDeploy.value = body; }

async function doDeploy() {
  const body = confirmDeploy.value;
  if (!body) return;
  const id = await dc.deploy(body);
  confirmDeploy.value = null;
  if (id) {
    const { candidate, strategy, ...rest } = route.query;
    await router.replace({ query: rest });
    void openSheet(id);
  }
}

// ── lifecycle ──
function askAct(d: Deployment, action: 'pause' | 'resume' | 'kill' | 'delete') {
  if (action === 'resume') { void dc.act(d.Id, 'resume', d.Status === 'Paused' ? 'Resumed.' : 'Started again.'); return; }
  actTarget.value = { d, action };
}
const actTitle = computed(() => {
  const a = actTarget.value;
  if (!a) return '';
  const name = a.d.StrategyName ?? a.d.StrategyClass;
  return a.action === 'pause' ? `Pause ${name}?` : a.action === 'kill' ? `Stop ${name}?` : `Remove ${name}?`;
});
const actSub = computed(() => {
  const a = actTarget.value;
  if (!a) return '';
  if (a.action === 'pause') return a.d.Mode === 'Live' ? 'It is disarmed and its positions on Kraken are closed.' : 'It stops acting on new bars. Its paper positions are kept and carry on when you resume.';
  if (a.action === 'kill') return a.d.Mode === 'Live' ? 'Its positions on Kraken are closed and it is disarmed for good.' : 'It stops for good. Its record stays; you can start it again from where it stopped.';
  return 'Its orders, fills and equity history are deleted with it. This cannot be undone.';
});
const actButton = computed(() => ({ pause: 'Pause', kill: 'Stop', delete: 'Remove for good', resume: 'Resume' } as Record<string, string>)[actTarget.value?.action ?? 'pause']);

async function doAct() {
  const a = actTarget.value;
  if (!a) return;
  actTarget.value = null;
  await dc.act(a.d.Id, a.action, a.action === 'pause' ? 'Paused.' : a.action === 'kill' ? 'Stopped.' : 'Removed.');
}

function askArm(d: Deployment) { armText.value = ''; armTarget.value = d; }
async function doArm() {
  const d = armTarget.value;
  if (!d || armText.value.trim().toUpperCase() !== d.Symbol.toUpperCase()) return;
  armTarget.value = null;
  await dc.arm(d.Id);
}

// ── sheet ──
async function openSheet(id: string) {
  void router.replace({ query: { ...route.query, d: id } });
  await dc.openSheet(id);
}
function closeSheet() {
  dc.closeSheet();
  const { d, ...rest } = route.query;
  void router.replace({ query: rest });
}

function refreshAll() {
  void dc.refreshFast();
  void dc.loadCatalog(true);
  if (dc.sheetId.value) void dc.loadSheet();
  if (dc.choice.value) void dc.loadPlan();
}

// ── commands ──
const commands = computed<DeployCommand[]>(() => {
  const list: DeployCommand[] = [];
  if (allowed.value.manage) list.push({ id: 'new', group: 'Actions', title: 'New deployment', hint: 'N', keywords: 'deploy start add', icon: 'plus', run: startNew });
  list.push({ id: 'refresh', group: 'Actions', title: 'Refresh everything', hint: 'R', keywords: 'reload', icon: 'refresh', run: refreshAll });
  list.push({ id: 'lab', group: 'Actions', title: 'Open the Alpha Lab', keywords: 'research candidates papers', icon: 'flask', run: () => { void router.push('/omnitrader/research?tab=candidates'); } });
  for (const d of all.value) {
    list.push({
      id: `d-${d.Id}`, group: 'Deployments', title: d.StrategyName ?? d.StrategyClass, icon: d.Mode === 'Live' ? 'bolt' : 'activity',
      hint: `${d.Symbol} · ${intervalLabel(d.Interval)} · ${healthOf(d).Title}`, keywords: `${d.Symbol} ${d.Id} ${d.Status} ${d.Mode}`,
      run: () => openSheet(d.Id),
    });
  }
  if (allowed.value.manage) {
    for (const r of dc.catalog.value?.Rows ?? []) {
      list.push({
        id: `s-${r.Key}`, group: 'Strategies', title: `Deploy ${r.Name}`, icon: 'rocket',
        hint: `${r.Status ?? r.Source}${r.Score != null ? ` ${Math.round(r.Score)}` : ''} · ${r.Shape === 'basket' ? `${r.BasketSize} symbols` : r.Symbol} · ${intervalLabel(r.Interval)}`,
        keywords: `${r.Symbol} ${r.Symbols.join(' ')} ${r.CandidateId ?? ''} ${r.Paper ?? ''}`,
        run: () => { choose(r); void nextTick(() => document.getElementById('dpl-new')?.scrollIntoView({ block: 'nearest' })); },
      });
    }
  }
  return list;
});

// ── keyboard ──
function typing(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}
function onGlobalKey(event: KeyboardEvent) {
  // Ctrl+K is this page's palette; the shell's command line keeps "/". Registered in the capture phase so
  // the shell's own Ctrl+K listener (also on window) never opens its menu underneath.
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); event.stopImmediatePropagation(); paletteOpen.value = true; return; }
  if (paletteOpen.value || confirmDeploy.value || armTarget.value || actTarget.value) return;
  // Esc closes the sheet wherever focus went (a confirm dialog that just closed leaves it on <body>).
  if (dc.sheetId.value) { if (event.key === 'Escape') { event.preventDefault(); closeSheet(); } return; }
  if (typing(event.target)) return;
  if (event.key === 'r' || event.key === 'R') { event.preventDefault(); refreshAll(); }
  else if ((event.key === 'n' || event.key === 'N') && allowed.value.manage) { event.preventDefault(); void startNew(); }
  else if (event.key === 'Escape' && dc.choice.value) { event.preventDefault(); backToList(); }
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKey, true);
  // Deep links: ?candidate= (from the Alpha Lab), ?strategy=, ?d= (a deployment's sheet).
  const q = route.query;
  if (typeof q.candidate === 'string' && q.candidate) dc.choose({ candidate: q.candidate, name: undefined });
  else if (typeof q.strategy === 'string' && q.strategy) dc.choose({ strategy: q.strategy, name: undefined });
  if (typeof q.d === 'string' && q.d) void dc.openSheet(q.d);
});
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKey, true));

watch(() => route.query.candidate, c => {
  if (typeof c === 'string' && c && dc.choice.value?.candidate !== c) dc.choose({ candidate: c });
});
</script>

<style lang="scss" src="~/assets/scss/deploy-console.scss"></style>
