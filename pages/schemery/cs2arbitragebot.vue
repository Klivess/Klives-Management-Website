<template>
  <div class="cs2x" data-testid="cs2x-root">
    <!-- ── bar ── -->
    <header class="cs2x-bar">
      <div class="cs2x-bar__id">
        <NuxtLink to="/schemes" class="cs2x-back" aria-label="Back to schemes"><CS2Icon name="arrow-left" /></NuxtLink>
        <span class="cs2x-bar__mark" :data-tone="verdict.tone"><CS2Icon name="crosshair" /></span>
        <h1 class="cs2x-bar__title">CS2 Arbitrage</h1>
        <span class="cs2x-bar__sub cs2x-num">{{ subline }}</span>
      </div>
      <button class="cs2x-search" aria-label="Search positions and actions" aria-keyshortcuts="Control+K" data-testid="cs2x-search" @click="paletteOpen = true">
        <CS2Icon name="search" />
        <span class="cs2x-search__text">Find a position, scan, settings…</span>
        <span class="cs2x-kbd">Ctrl</span><span class="cs2x-kbd">K</span>
      </button>
      <span class="cs2x-bar__spacer"></span>
      <div class="cs2x-bar__actions">
        <button class="cs2x-live" :data-state="liveState" :data-tone="liveTone" :title="liveTitle" :aria-label="liveTitle" data-testid="cs2x-live" @click="prefs.live = !prefs.live">
          <span class="cs2x-live__dot"></span><span>{{ liveWord }}</span>
        </button>
        <button class="cs2x-iconbtn" title="Refresh now (R)" aria-label="Refresh now" data-testid="cs2x-refresh" @click="refreshAll()">
          <CS2Icon name="refresh" :class="{ 'cs2x-spin': busy.fast || busy.slow }" />
        </button>
        <button v-if="allowed.settings" class="cs2x-iconbtn" title="Bot settings" aria-label="Bot settings" data-testid="cs2x-settings-open" @click="settingsOpen = true"><CS2Icon name="settings" /></button>
        <button v-if="allowed.scan" class="cs2x-btn cs2x-btn--primary" :disabled="pending.scan || starting" data-testid="cs2x-scan" @click="scanNow()">
          <CS2Icon :name="pending.scan ? 'refresh' : 'radar'" :class="{ 'cs2x-spin': pending.scan }" />Scan now
        </button>
      </div>
    </header>

    <!-- The layout already provides the page's <main>. -->
    <div class="cs2x-main" :class="{ 'cs2x-enter': firstPaint }">
      <div v-if="accessReady && !allowed.status" class="cs2x-card"><div class="cs2x-empty"><CS2Icon name="lock" />CS2 Arbitrage is not part of your access.</div></div>

      <template v-else>
        <!-- ── verdict + figures ── -->
        <div class="cs2x-top">
          <CS2Verdict :verdict="verdict" :chips="chips" :items="attention" :pending="pending" :can-manage="allowed.manage" :ready="Boolean(status)" @action="runAttention" />

          <div class="cs2x-kpis">
            <CS2Kpi label="Bankroll" icon="wallet" :value="bankroll.total != null ? fmtGbp(bankroll.total) : null" :state="bankroll.steamStale ? 'Steam stale' : ''" state-tone="warn" testid="kpi-bankroll">
              <template #sub>CSFloat <b>{{ fmtCents(bankroll.csfloatCents) }}</b> · Steam <b>{{ fmtGbp(bankroll.steam) }}</b></template>
              <div v-if="bankroll.total" class="cs2x-meter__bar" style="display: flex; height: 7px" :title="`CSFloat ${fmtGbp(bankroll.csfloatGbp)} · Steam ${fmtGbp(bankroll.steam)}`">
                <span :style="{ flex: bankroll.csfloatGbp ?? 0, background: 'var(--x-float)', borderRadius: '3px 0 0 3px' }"></span>
                <span :style="{ flex: bankroll.steam ?? 0, background: bankroll.steamStale ? 'repeating-linear-gradient(45deg, var(--x-steam) 0 3px, transparent 3px 6px)' : 'var(--x-steam)', borderRadius: '0 3px 3px 0' }"></span>
              </div>
            </CS2Kpi>

            <CS2Kpi label="Today" icon="funnel" :value="today ? String(today.confirmed ?? today.screen) : null" :unit="today?.confirmed != null ? 'worth buying' : 'screen passes'" :tone="(today?.bought ?? 0) > 0 ? 'ok' : undefined" :state="today && today.bought ? `${today.bought} bought` : ''" state-tone="ok" clickable testid="kpi-today" @open="jump('funnel')">
              <template #sub><template v-if="today"><b>{{ fmtCompactCount(today.valued) }}</b> valued · <b>{{ today.screen }}</b> passed the screen<template v-if="today.modelChecked != null"> · <b>{{ today.modelChecked - (today.confirmed ?? 0) }}</b> rejected</template></template></template>
              <div v-if="today" class="cs2x-steps" :aria-label="`Today: ${today.valued} valued, ${today.screen} screen passes, ${today.confirmed ?? 'unknown'} confirmed, ${today.bought} bought`">
                <div v-for="step in todaySteps" :key="step.label" class="cs2x-steps__step" :title="`${step.label}: ${step.value ?? '—'}`">
                  <div class="cs2x-steps__bar" :data-tone="step.tone" :style="{ height: `${step.h}px` }"></div>
                  <div class="cs2x-steps__lbl">{{ step.short }}</div>
                </div>
              </div>
            </CS2Kpi>

            <CS2Kpi label="Open" icon="box" :value="analytics ? String(book.count) : null" unit="positions" :state="needCount ? `${needCount} need you` : ''" state-tone="warn" clickable testid="kpi-open" @open="prefs.positions = needCount ? 'needs' : 'open'; jump('positions')">
              <template #sub><b>{{ fmtGbp(book.costGbp) }}</b> at cost · <span :class="book.expectedGbp >= 0 ? 'cs2x-up' : 'cs2x-down'">{{ fmtSignedGbp(book.expectedGbp) }}</span> expected</template>
            </CS2Kpi>

            <CS2Kpi label="Made" icon="trophy" :value="analytics ? fmtSignedGbp(record.profitGbp) : null" :tone="record.completed ? (record.profitGbp >= 0 ? 'ok' : 'crit') : undefined" clickable testid="kpi-made" @open="jump('record')">
              <template #sub><template v-if="record.completed"><b>{{ record.completed }}</b> sold · {{ record.wins }}/{{ record.completed }} at a profit<template v-if="record.roi != null"> · {{ fmtRoi(record.roi) }}</template></template><template v-else>nothing sold yet</template></template>
              <CS2Spark v-if="profitCurve.length > 1" :points="profitCurve" :tone="record.profitGbp >= 0 ? 'ok' : 'crit'" label="Cumulative profit over completed sales" />
            </CS2Kpi>

            <CS2Kpi label="Conversion" icon="swap" :value="status?.conversion?.coefficient != null ? fmtNumber(status.conversion.coefficient, 3) : null" unit="k" :state="steamOff ? 'Steam exit off' : ''" state-tone="warn" clickable testid="kpi-k" @open="jump('conversion')">
              <template #sub>{{ status?.conversion?.computedAtUtc ? `model ${fmtAgo(status.conversion.computedAtUtc, slowNow)}` : 'default (no model yet)' }} · Steam pays above <b>{{ breakEven }}×</b></template>
            </CS2Kpi>
          </div>
        </div>

        <div v-if="starting" class="cs2x-card"><div class="cs2x-empty" data-testid="cs2x-starting"><CS2Icon name="hourglass" />The bot is starting ({{ status?.startupState }}). Scans, positions and history appear as soon as it is ready.</div></div>

        <div class="cs2x-grid">
          <div class="cs2x-span-8 cs2x-col">
            <CS2DealFlow ref="dealFlow" :deals="deals" :group="prefs.dealGroup" :now="slowNow" :loading="busy.fast && !loaded('deals')" :error="allowed.read ? zoneError('deals') : 'Scans are not part of your access.'" :flash="flashing === 'deals'" @update:group="(g) => (prefs.dealGroup = g)" />

            <section id="cs2x-funnel" class="cs2x-card" aria-label="Funnel" :data-flash="flashing === 'funnel' || undefined" data-testid="cs2x-funnel">
              <header class="cs2x-card__head">
                <h2 class="cs2x-card__title"><CS2Icon name="chart" />From listing to purchase</h2>
                <span class="cs2x-card__meta">per day, UTC</span>
                <div class="cs2x-card__tools">
                  <div class="cs2x-seg" role="group" aria-label="Days">
                    <button v-for="d in [14, 30, 90]" :key="d" class="cs2x-seg__opt" :aria-pressed="prefs.funnelDays === d" @click="prefs.funnelDays = d">{{ d }} d</button>
                  </div>
                </div>
              </header>
              <div class="cs2x-card__body">
                <div class="cs2x-totals" data-testid="funnel-totals">
                  <div class="cs2x-total"><b>{{ fmtCompactCount(funnel.totals.valued) }}</b><span>listings valued</span></div>
                  <CS2Icon name="chevron-right" class="cs2x-total__arrow" />
                  <div class="cs2x-total"><b>{{ fmtCount(funnel.totals.screen) }}</b><span>passed the quick screen</span></div>
                  <CS2Icon name="chevron-right" class="cs2x-total__arrow" />
                  <div class="cs2x-total"><b>{{ funnel.totals.modelChecked == null ? '—' : fmtCount(funnel.totals.confirmed) }}</b><span>{{ funnel.totals.modelChecked == null ? 'model not counted yet' : `of ${fmtCount(funnel.totals.modelChecked)} confirmed by the model` }}</span></div>
                  <CS2Icon name="chevron-right" class="cs2x-total__arrow" />
                  <div class="cs2x-total"><b :class="funnel.totals.bought ? 'cs2x-up' : ''">{{ funnel.totals.bought }}</b><span>bought</span></div>
                </div>
                <CS2FunnelChart v-if="analytics" :rows="funnel.rows" />
                <div v-else class="cs2x-empty">{{ zoneError('analytics') ?? 'Reading the valuation history…' }}</div>
                <p class="cs2x-note" style="margin-top: 8px" data-testid="funnel-note">{{ funnelNote }}</p>
                <div v-if="blockers.length" class="cs2x-verdict__chips" style="margin-top: 8px">
                  <span class="cs2x-dim" style="font-size: 11.5px; align-self: center">Confirmed but not bought:</span>
                  <span v-for="b in blockers" :key="b.key" class="cs2x-pill" data-tone="warn">{{ b.key }} × {{ b.count }}</span>
                </div>
              </div>
            </section>
          </div>

          <div class="cs2x-span-4 cs2x-col">
            <CS2Positions :purchases="purchases" :live="liveRows" :filter="prefs.positions" :selected-id="selectedId" :now="slowNow" :loading="busy.slow && !analytics" :error="allowed.read ? zoneError('analytics') : 'Positions are not part of your access.'" :flash="flashing === 'positions'" @open="openPosition" @update:filter="(f) => (prefs.positions = f)" />

            <section id="cs2x-balances" class="cs2x-card" aria-label="Balances" :data-flash="flashing === 'balances' || undefined" data-testid="cs2x-balances">
              <header class="cs2x-card__head">
                <h2 class="cs2x-card__title"><CS2Icon name="wallet" />Balances</h2>
                <span class="cs2x-card__meta">{{ balanceSum ? `${fmtSignedGbp(balanceSum.change)} over the range` : 'daily at noon' }}</span>
                <div class="cs2x-card__tools">
                  <div class="cs2x-seg" role="group" aria-label="Range">
                    <button v-for="r in balanceRanges" :key="String(r.days)" class="cs2x-seg__opt" :aria-pressed="prefs.balanceDays === r.days" @click="prefs.balanceDays = r.days">{{ r.label }}</button>
                  </div>
                </div>
              </header>
              <div class="cs2x-card__body">
                <CS2BalanceChart v-if="balancePoints.length > 1" :points="balancePoints" />
                <div v-else class="cs2x-empty">{{ zoneError('balances') ?? (balances.length ? 'Not enough records in this range.' : 'No balance records yet; the bot records balances daily at noon.') }}</div>
                <p v-if="balanceSum?.carriedSince" class="cs2x-note" style="margin-top: 6px" data-testid="balance-carried">
                  The Steam wallet has not been read since {{ fmtDateTime(new Date(balanceSum.carriedSince).toISOString()) }}: every record after that carries the last known £{{ balanceSum.last.steam.toFixed(2) }} forward.
                </p>
              </div>
            </section>
          </div>

          <div class="cs2x-span-4"><CS2EnginePanel :status="status" :now="slowNow" :can-manage="allowed.manage" :login-pending="Boolean(pending['steam-login'])" :flash="flashing === 'engine'" @steam-login="requestSteamLogin()" /></div>
          <div class="cs2x-span-5"><CS2ExitModel :model="status?.exitModel ?? null" :settings="status?.settings" :now="slowNow" /></div>
          <div class="cs2x-span-3"><CS2Converters :status="status" :plan="plan" :now="slowNow" /></div>

          <div class="cs2x-span-12"><CS2TrackRecord :record="record" @open="openPosition" /></div>
        </div>

        <p class="cs2x-note" style="text-align: center">
          {{ lastLoadedAt ? `Updated ${fmtAgo(new Date(lastLoadedAt).toISOString(), now)}` : 'Loading…' }} ·
          <span class="cs2x-kbd">Ctrl</span> <span class="cs2x-kbd">K</span> commands · <span class="cs2x-kbd">/</span> filter deals · <span class="cs2x-kbd">R</span> refresh
          <template v-if="(status?.legacyFilesOnDisk ?? 0) > 0"> · {{ fmtCount(status?.legacyFilesOnDisk) }} legacy scan files on disk (no longer read)</template>
        </p>
      </template>
    </div>

    <CS2PositionSheet
      :position="selected"
      :live-row="selected ? liveRows.get(selected.CSFloatListingID) ?? null : null"
      :index="selectedIndex"
      :total="sheetList.length"
      :now="now"
      :can-manage="allowed.manage"
      :checking="selected ? Boolean(pending[`recheck:${selected.CSFloatListingID}`]) : false"
      @close="closeSheet"
      @step="stepSheet"
      @recheck="(id) => recheck(id)"
      @close-position="askClose"
    />

    <CS2Dialog :open="!!closeFor" :title="`Close ${closeTarget?.ItemMarketHashName ?? 'position'} by hand`" sub="For a position you settled outside the bot. The bot stops following it; this can't be undone from the page." icon="check" tone="warn" testid="cs2x-close-dialog" @close="closeFor = null">
      <div class="cs2x-choice" role="group" aria-label="Outcome">
        <button :aria-pressed="closeMode === 'sold'" data-testid="close-sold" @click="closeMode = 'sold'"><b>Sold</b><span>record the sale price and profit</span></button>
        <button :aria-pressed="closeMode === 'gone'" data-testid="close-gone" @click="closeMode = 'gone'"><b>Gone</b><span>no result (moved, kept, lost)</span></button>
      </div>
      <label v-if="closeMode === 'sold'" class="cs2x-field">Sold on CSFloat for (US $)
        <input v-model="closePrice" class="cs2x-input" inputmode="decimal" placeholder="2.94" data-autofocus data-testid="close-price" @keydown.enter.prevent="confirmClose" />
      </label>
      <label class="cs2x-field">Note (kept with the position)
        <input v-model="closeNote" class="cs2x-input" maxlength="300" placeholder="e.g. sold it on CSFloat myself" data-testid="close-note" @keydown.enter.prevent="confirmClose" />
      </label>
      <p v-if="closeTarget?.CurrentStrategicStage === 9" class="cs2x-note">If the relist is still up on CSFloat, take it down there too: closing here doesn't touch CSFloat.</p>
      <p v-if="closeError" class="cs2x-note" style="color: var(--x-crit)">{{ closeError }}</p>
      <template #actions>
        <button class="cs2x-btn cs2x-btn--ghost" @click="closeFor = null">Cancel</button>
        <button class="cs2x-btn cs2x-btn--primary" :disabled="closeFor ? Boolean(pending[`close:${closeFor}`]) : true" data-testid="close-confirm" @click="confirmClose"><CS2Icon name="check" />Close position</button>
      </template>
    </CS2Dialog>

    <CS2Palette :open="paletteOpen" :commands="commands" @close="paletteOpen = false" />
    <CS2SettingsDrawer :open="settingsOpen" @close="settingsOpen = false" @saved="refreshFast()" />

    <Teleport to="body">
      <div v-if="toasts.length" class="cs2x-layer">
        <div class="cs2x-toasts" role="status" aria-live="polite">
          <div v-for="toast in toasts" :key="toast.id" class="cs2x-toast" :data-tone="toast.tone" data-testid="cs2x-toast">
            <CS2Icon :name="toast.tone === 'crit' ? 'octagon-x' : toast.tone === 'warn' ? 'alert' : toast.tone === 'info' ? 'info' : 'check-circle'" />
            <span class="cs2x-toast__text">{{ toast.text }}</span>
            <button class="cs2x-iconbtn" style="width: 22px; height: 22px" aria-label="Dismiss" @click="dismiss(toast.id)"><CS2Icon name="x" /></button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import CS2Icon from '~/components/CS2/Icon.vue';
import CS2Kpi from '~/components/CS2/Kpi.vue';
import CS2Spark from '~/components/CS2/Spark.vue';
import CS2Verdict from '~/components/CS2/Verdict.vue';
import CS2DealFlow from '~/components/CS2/DealFlow.vue';
import CS2Positions from '~/components/CS2/Positions.vue';
import CS2PositionSheet from '~/components/CS2/PositionSheet.vue';
import CS2FunnelChart from '~/components/CS2/FunnelChart.vue';
import CS2BalanceChart from '~/components/CS2/BalanceChart.vue';
import CS2EnginePanel from '~/components/CS2/EnginePanel.vue';
import CS2ExitModel from '~/components/CS2/ExitModel.vue';
import CS2Converters from '~/components/CS2/Converters.vue';
import CS2TrackRecord from '~/components/CS2/TrackRecord.vue';
import CS2Palette from '~/components/CS2/Palette.vue';
import CS2Dialog from '~/components/CS2/Dialog.vue';
import CS2SettingsDrawer from '~/components/CS2/SettingsDrawer.vue';
import { useCs2Console } from '~/composables/useCs2Console';
import {
  balanceSeries, balanceSummary, cs2Attention, cs2Verdict, fmtAgo, fmtCents, fmtCompactCount, fmtCount, fmtDateTime, fmtGbp, fmtNumber,
  fmtRoi, fmtSignedGbp, funnelDays, funnelTotals, isOpenPurchase, lastPurchaseAt, needsYou, openBook, stageMeta, steamExitOff, trackRecord,
  type Cs2Attention, type Cs2Command, type Cs2Purchase, type Cs2StatusPosition,
} from '~/scripts/cs2Arbitrage';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'KM: CS2 Arbitrage' });

const route = useRoute();
const router = useRouter();
const cs2 = useCs2Console();
const {
  allowed, accessReady, status, deals, analytics, plan, balances, busy, pending, toasts, now, prefs, starting, lastLoadedAt,
  refreshAll, refreshFast, scanNow, requestSteamLogin, recheck, closePosition, dismiss, zoneError, loaded,
} = cs2;

const paletteOpen = ref(false);
const settingsOpen = ref(false);
const firstPaint = ref(true);
const flashing = ref<string | null>(null);
const dealFlow = ref<{ focus: () => void } | null>(null);
const selectedId = ref<string | null>(null);

/** Lists and charts move on a 15-second clock, so 150 relative times are not redrawn every second. */
const slowNow = computed(() => Math.floor(now.value / 15_000) * 15_000);

// ── purchases ──
const purchases = computed<Cs2Purchase[]>(() => {
  const all = [...(analytics.value?.AllPurchasedItems ?? [])];
  const time = (p: Cs2Purchase) => Date.parse(p.TimeOfPurchase ?? '') || 0;
  return all.sort((a, b) => Number(isOpenPurchase(b)) - Number(isOpenPurchase(a)) || time(b) - time(a));
});
const liveRows = computed(() => new Map<string, Cs2StatusPosition>((status.value?.positions ?? []).map((p) => [p.CSFloatListingID, p])));
const book = computed(() => openBook(purchases.value));
const record = computed(() => trackRecord(purchases.value));
const needCount = computed(() => purchases.value.filter((p) => needsYou(p, liveRows.value.get(p.CSFloatListingID))).length);
const profitCurve = computed(() => {
  const done = [...record.value.rows].filter((r) => r.resultGbp != null).reverse();
  let sum = 0;
  return done.length > 1 ? [0, ...done.map((r) => (sum += r.resultGbp ?? 0))] : [];
});

// ── verdict ──
const context = computed(() => ({ status: status.value, statusError: zoneError('status'), analytics: analytics.value, purchases: purchases.value, nowMs: slowNow.value }));
const verdict = computed(() => cs2Verdict(context.value));
const attention = computed(() => cs2Attention(context.value));
const steamOff = computed(() => steamExitOff(status.value?.settings));
const chips = computed(() => {
  const s = status.value?.settings;
  if (!s) return [];
  const e = s.Evaluation ?? {};
  const list: { label: string; tone: string; title?: string }[] = [
    s.PurchasingEnabled ? { label: 'Auto-buy on', tone: 'ok' } : { label: 'Auto-buy off', tone: 'warn', title: 'PurchaseCSFloatArbitrageOpportunities is off: deals are found and logged, never bought' },
    { label: `Relist bar ${e.MinimumRelistRoiPercent ?? '—'}%`, tone: 'neutral', title: 'Minimum risk-adjusted return for the CSFloat relist exit' },
    steamOff.value ? { label: `Steam exit off (bar ${e.MinimumSteamRoiPercent}%)`, tone: 'warn', title: 'The Steam exit bar is so high it never qualifies' } : { label: `Steam bar ${e.MinimumSteamRoiPercent ?? '—'}%`, tone: 'neutral' },
    { label: s.AutoManageRelists === false ? 'Relists: advice only' : 'Relists managed', tone: 'neutral' },
  ];
  // Only said when it is off: the check is on by default, and off is the state worth noticing.
  if (e.RejectHighFailureSellers === false) list.push({ label: 'Seller failure check off', tone: 'warn', title: "Listings are not refused for their seller's failure rate; the exit model still prices the chance the trade falls through" });
  if (!s.ScanningEnabled) list.unshift({ label: 'Scanning off', tone: 'crit' });
  return list;
});
const subline = computed(() => {
  const e = status.value?.engine;
  if (!status.value) return '';
  if (starting.value) return `starting: ${status.value.startupState}`;
  const parts = [];
  if (typeof e?.ObservedListingsPerMinute === 'number') parts.push(`${e.ObservedListingsPerMinute.toFixed(1)} listings/min`);
  if (typeof e?.Evaluated === 'number') parts.push(`${fmtCompactCount(e.Evaluated)} valued since start`);
  const last = lastPurchaseAt(purchases.value);
  if (last) parts.push(`last buy ${fmtAgo(last, slowNow.value)}`);
  return parts.join(' · ');
});

// ── live link ──
const liveState = computed(() => (!prefs.live ? 'paused' : zoneError('status') && !status.value ? 'down' : 'live'));
const liveTone = computed(() => ({ paused: 'neutral', down: 'crit', live: 'ok' })[liveState.value]);
const liveWord = computed(() => ({ paused: 'Paused', down: 'Offline', live: 'Live' })[liveState.value]);
const liveTitle = computed(() => (prefs.live ? 'Live: status every 15 s, history every minute. Click to pause.' : 'Paused: click to resume live updates.'));

// ── figures ──
const latestBalance = computed(() => [...balances.value].sort((a, b) => Date.parse(a.DateTimeOfBalanceRecord) - Date.parse(b.DateTimeOfBalanceRecord)).pop() ?? null);
const bankroll = computed(() => {
  const b = status.value?.balances;
  const csfloatGbp = b?.csfloatGbp ?? latestBalance.value?.CSFloatTotalBalanceInPounds ?? null;
  const liveSteam = b?.steamGbp;
  const steam = liveSteam ?? latestBalance.value?.SteamTotalBalanceInPounds ?? null;
  return {
    csfloatCents: typeof b?.csfloatUsd === 'number' ? Math.round(b.csfloatUsd * 100) : null,
    csfloatGbp,
    steam,
    steamStale: liveSteam == null && steam != null,
    total: csfloatGbp != null || steam != null ? (csfloatGbp ?? 0) + (steam ?? 0) : null,
  };
});
const breakEven = computed(() => {
  const k = status.value?.conversion?.coefficient;
  return typeof k === 'number' && k > 0 ? (1.15 / k).toFixed(2) : '—';
});

// ── funnel ──
const funnel = computed(() => {
  const rows = funnelDays(analytics.value, prefs.funnelDays, slowNow.value);
  return { rows, totals: funnelTotals(rows) };
});
const today = computed(() => (analytics.value ? funnel.value.rows[funnel.value.rows.length - 1] : null));
const todaySteps = computed(() => {
  const t = today.value;
  if (!t) return [];
  const steps = [
    { label: 'Listings valued', short: 'valued', value: t.valued, tone: 'neutral' },
    { label: 'Passed the quick screen', short: 'screen', value: t.screen, tone: 'accent' },
    { label: 'Checked by the exit model', short: 'model', value: t.modelChecked, tone: 'info' },
    { label: 'Confirmed by the exit model', short: 'worth it', value: t.confirmed, tone: 'info' },
    { label: 'Bought', short: 'bought', value: t.bought, tone: 'ok' },
  ];
  const max = Math.log10(Math.max(10, t.valued) + 1);
  return steps.map((s) => ({ ...s, h: s.value ? Math.max(3, (Math.log10(s.value + 1) / max) * 30) : 1 }));
});
const funnelNote = computed(() => {
  const a = analytics.value;
  if (!a) return '';
  const since = a.FunnelSinceUtc ? `The exit model's own counts start ${fmtDateTime(a.FunnelSinceUtc)}; before that only the quick screen was counted, and the model turned most of those down.` : "This bot build counts only the quick screen's passes; the exit model turned most of those down before anything was bought.";
  const last = lastPurchaseAt(purchases.value);
  return `${since}${last ? ` Last purchase ${fmtDateTime(last)}.` : ''}`;
});
const blockers = computed(() => Object.entries(analytics.value?.BlockReasons ?? {}).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count));

// ── balances ──
const balanceRanges = [{ days: 30, label: '30 d' }, { days: 90, label: '90 d' }, { days: null, label: 'All' }] as const;
const balancePoints = computed(() => balanceSeries(balances.value, prefs.balanceDays, slowNow.value));
const balanceSum = computed(() => balanceSummary(balancePoints.value));

// ── sheet ──
const sheetList = computed(() => {
  const f = prefs.positions;
  return f === 'open' ? purchases.value.filter(isOpenPurchase) : f === 'needs' ? purchases.value.filter((p) => needsYou(p, liveRows.value.get(p.CSFloatListingID))) : purchases.value;
});
const selected = computed(() => (selectedId.value ? purchases.value.find((p) => p.CSFloatListingID === selectedId.value) ?? null : null));
const selectedIndex = computed(() => (selected.value ? sheetList.value.findIndex((p) => p.CSFloatListingID === selected.value!.CSFloatListingID) : -1));

function openPosition(id: string) {
  selectedId.value = id;
  if (route.query.pos !== id) router.replace({ query: { ...route.query, pos: id } });
}
function closeSheet() {
  selectedId.value = null;
  if (route.query.pos) {
    const rest = { ...route.query };
    delete rest.pos;
    router.replace({ query: rest });
  }
}
function stepSheet(delta: number) {
  const list = sheetList.value.length ? sheetList.value : purchases.value;
  const i = list.findIndex((p) => p.CSFloatListingID === selectedId.value);
  const next = list[Math.min(list.length - 1, Math.max(0, i + delta))];
  if (next) openPosition(next.CSFloatListingID);
}

// ── close by hand ──
const closeFor = ref<string | null>(null);
const closeMode = ref<'sold' | 'gone'>('sold');
const closePrice = ref('');
const closeNote = ref('');
const closeError = ref('');
const closeTarget = computed(() => purchases.value.find((p) => p.CSFloatListingID === closeFor.value) ?? null);
function askClose(id: string) {
  const p = purchases.value.find((x) => x.CSFloatListingID === id);
  closeFor.value = id;
  closeMode.value = 'sold';
  closePrice.value = p?.CSFloatResalePriceCents ? (p.CSFloatResalePriceCents / 100).toFixed(2) : '';
  closeNote.value = '';
  closeError.value = '';
}
async function confirmClose() {
  if (!closeFor.value) return;
  let cents: number | null = null;
  if (closeMode.value === 'sold') {
    const dollars = Number(closePrice.value.replace(/[$,\s]/g, ''));
    if (!Number.isFinite(dollars) || dollars <= 0) { closeError.value = 'Enter the price it sold for in US dollars, e.g. 2.94.'; return; }
    cents = Math.round(dollars * 100);
  }
  const ok = await closePosition(closeFor.value, cents, closeNote.value.trim());
  if (ok) closeFor.value = null;
}

// ── attention actions ──
function runAttention(item: Cs2Attention) {
  const a = item.action;
  if (!a) return;
  if (a.kind === 'steam-login') requestSteamLogin();
  else if (a.kind === 'recheck' && a.id) recheck(a.id);
  else if (a.kind === 'open-position' && a.id) openPosition(a.id);
  else if (a.kind === 'settings') settingsOpen.value = true;
}

// ── jumping ──
const SECTIONS: Record<string, string> = {
  deals: 'cs2x-deals', positions: 'cs2x-positions', funnel: 'cs2x-funnel', balances: 'cs2x-balances', engine: 'cs2x-engine', model: 'cs2x-model', conversion: 'cs2x-conversion', record: 'cs2x-record',
};
async function jump(section: string) {
  await nextTick();
  document.getElementById(SECTIONS[section])?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  flashing.value = section;
  setTimeout(() => { if (flashing.value === section) flashing.value = null; }, 1200);
}

// ── palette ──
const commands = computed<Cs2Command[]>(() => {
  const list: Cs2Command[] = [];
  if (allowed.value.scan) list.push({ id: 'scan', group: 'Actions', icon: 'radar', title: 'Scan the market now', keywords: 'sweep structural', run: () => scanNow() });
  if (allowed.value.manage && status.value?.steamSession?.problem) list.push({ id: 'steam-login', group: 'Actions', icon: 'key', title: 'Ask me to approve a Steam login', keywords: 'steam login session', run: () => requestSteamLogin() });
  if (allowed.value.settings) list.push({ id: 'settings', group: 'Actions', icon: 'settings', title: 'Bot settings', keywords: 'buy threshold relist steam bar', run: () => { settingsOpen.value = true; } });
  list.push({ id: 'refresh', group: 'Actions', icon: 'refresh', title: 'Refresh now', hint: 'R', run: () => refreshAll() });
  list.push({ id: 'live', group: 'Actions', icon: prefs.live ? 'pause' : 'play', title: prefs.live ? 'Pause live updates' : 'Resume live updates', run: () => { prefs.live = !prefs.live; } });
  const go = (id: string, title: string, icon: string) => list.push({ id: `go-${id}`, group: 'Go to', icon, title, run: () => jump(id) });
  go('deals', 'Deal flow', 'radar'); go('positions', 'Positions', 'box'); go('funnel', 'From listing to purchase', 'chart'); go('balances', 'Balances', 'wallet');
  go('engine', 'Engine', 'gauge'); go('model', 'Exit model & trade locks', 'lock'); go('conversion', 'Conversion', 'swap'); go('record', 'Track record', 'trophy');
  const deal = (id: 'buy' | 'model' | 'screen' | 'all', title: string) => list.push({ id: `deals-${id}`, group: 'Deal flow', icon: 'list', title, run: () => { prefs.dealGroup = id; jump('deals'); } });
  deal('buy', 'Show deals the model would buy'); deal('model', 'Show deals the model turned down'); deal('screen', 'Show near misses'); deal('all', 'Show all deals');
  for (const p of purchases.value.slice(0, 80)) {
    list.push({ id: `pos-${p.CSFloatListingID}`, group: isOpenPurchase(p) ? 'Open positions' : 'Closed positions', icon: 'box', title: p.ItemMarketHashName, hint: stageMeta(p.CurrentStrategicStage).short, keywords: p.CSFloatListingID, run: () => openPosition(p.CSFloatListingID) });
  }
  return list;
});

// ── keyboard ──
function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  const typing = target?.closest('input, textarea, select, [contenteditable="true"]');
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); paletteOpen.value = !paletteOpen.value; return; }
  if (typing || paletteOpen.value || settingsOpen.value || closeFor.value || selected.value) return;
  if (event.key === '/') { event.preventDefault(); dealFlow.value?.focus(); }
  else if (event.key === 'r' || event.key === 'R') { if (!event.ctrlKey && !event.metaKey) refreshAll(); }
}

// A shared link opens its position once the analytics have it.
watch([() => route.query.pos, purchases], ([pos]) => {
  if (typeof pos === 'string' && pos && pos !== selectedId.value && purchases.value.some((p) => p.CSFloatListingID === pos)) selectedId.value = pos;
}, { immediate: true });

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  setTimeout(() => { firstPaint.value = false; }, 600);
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<style lang="scss" src="~/assets/scss/cs2-console.scss"></style>
