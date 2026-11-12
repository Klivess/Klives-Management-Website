<template>
  <LlmSheet :open="!!laneKey" :title="title" :sub="lane?.description ?? ''" icon="grid" :tone="state.tone" wide testid="llx-lane-sheet" @close="$emit('close')">
    <template #tools>
      <button v-if="c.allowed.value.routing && lane" class="llx-btn llx-btn--sm" data-testid="lane-edit-route" @click="ui.editRoute(laneKey!)"><LlmIcon name="route" />Change route</button>
      <button v-if="c.allowed.value.routing && lane" class="llx-btn llx-btn--sm" :class="{ 'llx-btn--danger': !paused }" :disabled="c.busy.value[`pause:${parts.service}/${parts.lane}`]"
              data-testid="lane-pause" @click="togglePause">
        <LlmIcon :name="paused ? 'play' : 'pause'" />{{ paused ? 'Resume' : 'Pause' }}
      </button>
      <button v-if="c.allowed.value.analytics" class="llx-btn llx-btn--sm llx-btn--ghost" title="Explore this lane on the Analytics tab" @click="ui.filterAnalytics({ lane: [laneKey!] })"><LlmIcon name="chart" /></button>
    </template>

    <div v-if="laneKey" class="llx-stack">
      <div class="llx-chips">
        <span class="llx-chip llx-chip--dot" :data-tone="state.tone">{{ state.label }}</span>
        <span v-if="eff?.billing" class="llx-chip" :data-tone="eff.billing === 'PerToken' ? 'warn' : eff.billing === 'Flat' ? 'info' : 'ok'">{{ BILLING_LABELS[eff.billing] ?? eff.billing }}</span>
        <span v-if="eff?.spending" class="llx-chip" :title="SPENDING_LABELS[eff.spending]?.help">{{ SPENDING_LABELS[eff.spending]?.label ?? eff.spending }}</span>
        <span v-if="lane?.workClass" class="llx-chip" title="How AIRouter's scheduler treats this lane's calls">{{ lane.workClass }}</span>
        <span v-if="lane?.needsToolCalling" class="llx-chip" title="This lane calls tools, so it cannot be routed to the local model">tool calling</span>
        <span v-if="eff?.capture" class="llx-chip" data-tone="info">keeping prompt text</span>
      </div>

      <!-- the route in force -->
      <section class="llx-card llx-card--flat">
        <header class="llx-card__head"><h3 class="llx-card__title"><LlmIcon name="route" />Route in force</h3>
          <span class="llx-card__meta">routing revision {{ c.routing.value?.revision ?? '—' }}</span></header>
        <dl v-if="eff" class="llx-dl">
          <dt>Router</dt><dd><b>{{ eff.routerName ?? eff.router ?? '—' }}</b> <span class="llx-dim">· {{ sourceText }}</span></dd>
          <dt>Model</dt>
          <dd>
            <span class="llx-mono">{{ eff.model || '—' }}</span>
            <span v-if="eff.pin" class="llx-chip llx-chip--xs" data-tone="info">pinned</span>
            <span v-else-if="lane?.modelSource" class="llx-dim"> · the service picks its own model ({{ lane.modelSource }}) when the router serves it</span>
          </dd>
          <dt>Fallbacks</dt>
          <dd>
            <template v-if="eff.fallbacks?.length">
              <span v-for="(f, i) in eff.fallbacks" :key="i" class="llx-fallback">{{ i + 1 }}. {{ f.name }}<span v-if="f.model" class="llx-mono llx-dim"> {{ f.model }}</span><span class="llx-chip llx-chip--xs" :data-tone="f.billing === 'PerToken' ? 'warn' : 'ok'">{{ BILLING_LABELS[f.billing] ?? f.billing }}</span></span>
            </template>
            <span v-else class="llx-dim">none: a router failure fails the call after its own retries</span>
          </dd>
          <dt>Spending</dt><dd>{{ SPENDING_LABELS[eff.spending]?.label ?? eff.spending }} <span class="llx-dim">· {{ SPENDING_LABELS[eff.spending]?.help }}</span></dd>
          <template v-if="eff.thinking"><dt>Thinking</dt><dd>{{ eff.thinking }}</dd></template>
          <template v-if="eff.serviceTier"><dt>Service tier</dt><dd>{{ eff.serviceTier }}</dd></template>
          <template v-if="eff.maxParallel"><dt>Max parallel</dt><dd>{{ eff.maxParallel }} calls at a time</dd></template>
          <dt>Sessions</dt><dd>{{ lane?.sessions ? `${lane.sessions} held, ${lane.warmSessions} warm (prefix still cached)` : 'none held' }}</dd>
          <template v-if="eff.blocked"><dt>Refused</dt><dd class="llx-text-warn">{{ eff.blockReason ?? eff.blocked }}</dd></template>
        </dl>
        <div v-else class="llx-empty">This lane is not in the routing yet.</div>
        <template v-if="eff?.chain?.length">
          <h4 class="llx-subhead">How this route was chosen</h4>
          <ol class="llx-chain" data-testid="lane-chain"><li v-for="(step, i) in eff.chain" :key="i">{{ step }}</li></ol>
        </template>
        <ul v-if="eff?.warnings?.length" class="llx-warnings"><li v-for="(w, i) in eff.warnings" :key="i"><LlmIcon name="alert" />{{ w }}</li></ul>
      </section>

      <!-- this window -->
      <section class="llx-card llx-card--flat">
        <header class="llx-card__head"><h3 class="llx-card__title"><LlmIcon name="activity" />This window</h3><span class="llx-card__meta">{{ windowText }}</span></header>
        <div v-if="v" class="llx-minis">
          <div v-for="m in minis" :key="m.key" class="llx-mini">
            <span class="llx-mini__label">{{ m.label }}</span>
            <span class="llx-mini__value llx-num">{{ m.value }}</span>
            <span v-if="m.delta != null" class="llx-mini__delta" :data-tone="m.tone">{{ m.delta > 0 ? '▲' : '▼' }} {{ Math.abs(Math.round(m.delta * 100)) }}%</span>
          </div>
        </div>
        <div v-else class="llx-empty">No calls from this lane in the window.</div>
      </section>

      <section v-if="c.allowed.value.analytics" class="llx-card llx-card--flat">
        <header class="llx-card__head"><h3 class="llx-card__title"><LlmIcon name="chart" />Over time</h3>
          <span class="llx-card__meta">{{ series.value.value?.bucket ? `${series.value.value.bucket} buckets` : '' }}</span></header>
        <div v-if="series.value.value" class="llx-charts llx-charts--2" :class="{ 'llx-stale': series.stale.value }">
          <div v-for="chart in charts" :key="chart.title" class="llx-chartcell">
            <h3>{{ chart.title }}</h3>
            <TelChart :t0="series.value.value.from" :step="series.value.value.step" :series="chart.series" :unit="chart.unit" :label="chart.title" :stacked="chart.stacked" :height="100"
                      :marks="marks" @zoom="(f, t) => c.zoomTo(f, t)" />
          </div>
        </div>
        <div v-else class="llx-empty">{{ series.error.value ?? 'Reading…' }}</div>
      </section>

      <div v-if="c.allowed.value.analytics" class="llx-grid-2">
        <section class="llx-card llx-card--flat">
          <header class="llx-card__head"><h3 class="llx-card__title"><LlmIcon name="layers" />Models that answered</h3></header>
          <LlmBreakdownTable :groups="models.value.value?.groups ?? []" :loading="!models.value.value" empty-text="No calls in the window." mono />
        </section>
        <section class="llx-card llx-card--flat">
          <header class="llx-card__head"><h3 class="llx-card__title"><LlmIcon name="server" />Routers used</h3></header>
          <LlmBreakdownTable :groups="routersUsed.value.value?.groups ?? []" :loading="!routersUsed.value.value" empty-text="No calls in the window." />
        </section>
      </div>

      <section v-if="c.allowed.value.analytics && subjects.length" class="llx-card llx-card--flat">
        <header class="llx-card__head"><h3 class="llx-card__title"><LlmIcon name="list" />Top subjects</h3>
          <span class="llx-card__meta">by day, as the service named them (a project, a game…)</span></header>
        <table class="llx-table">
          <thead><tr><th class="l">Subject</th><th>Calls</th><th>Tokens</th><th>Cost</th><th>Cache hit</th><th>Errors</th></tr></thead>
          <tbody>
            <tr v-for="s in subjects" :key="s.key" class="llx-row" @click="ui.openCalls({ lane: [laneKey!], subject: s.subject })">
              <td class="l llx-mono llx-truncate">{{ s.subject }}</td>
              <td class="llx-num">{{ llmCompact(s.values?.calls) }}</td>
              <td class="llx-num">{{ llmCompact(s.values?.totalTokens) }}</td>
              <td class="llx-num">{{ llmUsd(s.values?.estCostUsd) }}</td>
              <td class="llx-num">{{ llmPct(s.values?.cacheHitPct) }}</td>
              <td class="llx-num">{{ llmPct(s.values?.errorPct) }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <div v-if="c.allowed.value.calls" class="llx-grid-2">
        <section class="llx-card llx-card--flat">
          <header class="llx-card__head"><h3 class="llx-card__title"><LlmIcon name="list" />Latest calls</h3>
            <button class="llx-btn llx-btn--xs llx-btn--ghost" @click="ui.openCalls({ lane: [laneKey!] })">All of them</button></header>
          <LlmCallList :calls="recent.value.value?.calls ?? []" :loading="!recent.value.value" empty-text="No calls in the window." />
        </section>
        <section class="llx-card llx-card--flat">
          <header class="llx-card__head"><h3 class="llx-card__title"><LlmIcon name="alert" />Latest failures</h3>
            <button class="llx-btn llx-btn--xs llx-btn--ghost" @click="ui.openCalls({ lane: [laneKey!], failed: true })">All of them</button></header>
          <LlmCallList :calls="failures.value.value?.calls ?? []" :loading="!failures.value.value" empty-text="Nothing failed in the window." />
        </section>
      </div>

      <!-- budget -->
      <section class="llx-card llx-card--flat">
        <header class="llx-card__head"><h3 class="llx-card__title"><LlmIcon name="coins" />Budget</h3>
          <div class="llx-card__tools">
            <div class="llx-seg" role="group" aria-label="Budget for">
              <button class="llx-seg__opt" :aria-pressed="budgetScope === 'lane'" @click="budgetScope = 'lane'">This lane</button>
              <button class="llx-seg__opt" :aria-pressed="budgetScope === 'service'" @click="budgetScope = 'service'">All of {{ parts.service }}</button>
            </div>
          </div>
        </header>
        <LlmBudgetEditor :budget="budget" :status="budgetScopeMatches ? eff?.budgetStatus : null" :can-edit="c.allowed.value.routing"
                         :busy="c.busy.value[`budget:${budgetKey}`]" testid="lane-budget" @save="b => c.saveBudget(budgetKey, b)" />
        <p v-if="eff?.budget && !budgetScopeMatches" class="llx-note">The budget in force here is the {{ eff.budgetScope }}’s.</p>
      </section>

      <!-- kept text -->
      <section v-if="c.allowed.value.content" class="llx-card llx-card--flat">
        <header class="llx-card__head"><h3 class="llx-card__title"><LlmIcon name="text" />Keep prompt and reply text</h3></header>
        <p class="llx-dim">
          Normally only numbers are kept. Switched on, this lane’s prompts and replies are kept too (images and audio replaced by their size),
          for {{ textDays }} days, readable only with the kept-text permission. It switches itself off.
        </p>
        <div v-if="captureUntil" class="llx-banner" data-tone="info"><LlmIcon name="eye" />Keeping text until {{ llmClock(captureUntil) }}.</div>
        <div v-if="c.allowed.value.routing" class="llx-form__actions">
          <button v-for="o in CAPTURE" :key="o.minutes" class="llx-btn llx-btn--sm" :disabled="c.busy.value[`capture:${laneKey}`]" @click="c.setCapture(laneKey!, o.minutes)">{{ o.label }}</button>
          <button v-if="captureUntil" class="llx-btn llx-btn--sm llx-btn--danger" @click="c.setCapture(laneKey!, 0)">Stop now</button>
        </div>
      </section>
    </div>
  </LlmSheet>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import TelChart from '~/components/ApiTelemetry/TelChart.vue';
import { useLlmRead, type KliveLlmConsole, type LlmUi } from '~/composables/useKliveLlm';
import { BILLING_LABELS, SPENDING_LABELS, describeWindow, laneParts, llmClock, llmCompact, llmDelta, llmMs, llmPct, llmUsd, qs } from '~/scripts/kliveLlm';

const props = defineProps<{ laneKey: string | null }>();
defineEmits<{ close: [] }>();
const c = inject<KliveLlmConsole>('llx')!;
const ui = inject<LlmUi>('llxUi')!;

const parts = computed(() => laneParts(props.laneKey ?? ''));
const lane = computed(() => (c.routing.value?.lanes ?? []).find((l: any) => l.key === props.laneKey) ?? null);
const eff = computed(() => lane.value?.effective ?? null);
const ov = computed(() => (c.overview.value?.data?.lanes ?? []).find((l: any) => l.key === props.laneKey) ?? null);
const v = computed(() => ov.value?.values ?? null);
const title = computed(() => lane.value ? `${lane.value.service} › ${lane.value.label}` : (props.laneKey ?? '').replace('/', ' › '));
const paused = computed(() => eff.value?.blocked === 'Paused');
const windowText = computed(() => describeWindow(c.window.value, c.now.value));
const marks = computed(() => (c.overview.value?.marks ?? []).map((m: any) => ({ t: m.ts, label: m.title })));

const SOURCES: Record<string, string> = {
  fixed: 'fixed for this lane', override: 'the emergency override', lane: 'set on this lane',
  'free-model': 'free-model calls use OpenRouter’s free model', default: 'the default route', setting: 'the RemoteLLMProvider setting',
};
const sourceText = computed(() => eff.value?.source === 'service' ? `set on ${parts.value.service}` : SOURCES[eff.value?.source] ?? eff.value?.source ?? '');

const state = computed(() => {
  if (paused.value) return { label: 'Paused', tone: 'info' };
  if (eff.value?.blocked) return { label: 'Refused', tone: 'warn' };
  const calls = Number(v.value?.calls ?? 0), err = Number(v.value?.errorPct ?? 0);
  if (calls >= 10 && err >= 10) return { label: 'Failing', tone: 'crit' };
  if (calls >= 10 && err >= 3) return { label: 'Errors', tone: 'warn' };
  return calls > 0 ? { label: 'Active', tone: 'ok' } : { label: 'Idle', tone: 'neutral' };
});

const minis = computed(() => {
  const x = v.value ?? {}, p = ov.value?.previous ?? {};
  const item = (key: string, label: string, value: string, delta: number | null = null, good = 0) =>
    ({ key, label, value, delta, tone: delta == null || !good || Math.abs(delta) < 0.02 ? 'neutral' : Math.sign(delta) === good ? 'ok' : 'warn' });
  return [
    item('calls', 'Calls', llmCompact(x.calls), llmDelta(x.calls, p.calls)),
    item('tokens', 'Tokens', llmCompact(x.totalTokens), llmDelta(x.totalTokens, p.totalTokens)),
    item('cost', 'Cost', llmUsd(x.estCostUsd), llmDelta(x.estCostUsd, p.estCostUsd), -1),
    item('list', 'List-price equivalent', llmUsd(x.listCostUsd)),
    item('cache', 'Cache hit', llmPct(x.cacheHitPct), null, 1),
    item('p50', 'Latency p50', llmMs(x.p50TotalMs)),
    item('p95', 'Latency p95', llmMs(x.p95TotalMs), llmDelta(x.p95TotalMs, p.p95TotalMs), -1),
    item('ttft', 'First token p95', llmMs(x.p95TtftMs)),
    item('err', 'Error rate', llmPct(x.errorPct), llmDelta(x.errorPct, p.errorPct), -1),
    item('retries', 'Retries', llmCompact(x.retries)),
    item('fallbacks', 'Fallbacks', llmCompact(x.fallbacks)),
    item('redirected', 'Model redirected', llmCompact(x.redirected)),
    item('truncated', 'Cut off at the cap', llmCompact(x.truncated)),
  ];
});

// ── reads (only while open) ──
const open = computed(() => !!props.laneKey);
const base = computed(() => ({ ...c.params.value, lane: props.laneKey ?? undefined }));
const series = useLlmRead(c, () => open.value && c.allowed.value.analytics
  ? `/klivellm/series${qs({ ...base.value, points: 60, metrics: 'calls,failed,promptTokens,completionTokens,estCostUsd,p95TotalMs,p50TtftMs,cacheHitPct,errorPct,retries' })}` : null);
const models = useLlmRead(c, () => open.value && c.allowed.value.analytics ? `/klivellm/breakdown${qs({ ...base.value, groupBy: 'model' })}` : null);
const routersUsed = useLlmRead(c, () => open.value && c.allowed.value.analytics ? `/klivellm/breakdown${qs({ ...base.value, groupBy: 'router' })}` : null);
const subjectRead = useLlmRead(c, () => open.value && c.allowed.value.analytics ? `/klivellm/breakdown${qs({ ...c.params.value, groupBy: 'subject', service: parts.value.service })}` : null);
const recent = useLlmRead(c, () => open.value && c.allowed.value.calls ? `/klivellm/calls${qs({ ...base.value, limit: 12 })}` : null);
const failures = useLlmRead(c, () => open.value && c.allowed.value.calls ? `/klivellm/calls${qs({ ...base.value, failed: true, limit: 8 })}` : null);

const subjects = computed(() => (subjectRead.value.value?.groups ?? [])
  .filter((g: any) => g.service === parts.value.service && (g.lanes ?? []).includes(parts.value.lane)).slice(0, 12));

const charts = computed(() => {
  const s = series.value.value?.totalSeries ?? {};
  const failed = (s.failed ?? []).map((x: number | null) => x ?? 0);
  return [
    { title: 'Calls', unit: 'count' as const, stacked: true, series: [
      { key: 'ok', label: 'Answered', values: (s.calls ?? []).map((x: number | null, i: number) => x == null ? null : x - (failed[i] ?? 0)), color: '--tel-s1', kind: 'bar' as const },
      { key: 'failed', label: 'Failed', values: failed, color: '--tel-s8', kind: 'bar' as const }] },
    { title: 'Tokens', unit: 'count' as const, stacked: true, series: [
      { key: 'p', label: 'Prompt', values: s.promptTokens ?? [], color: '--tel-s1', kind: 'area' as const },
      { key: 'c', label: 'Completion', values: s.completionTokens ?? [], color: '--tel-s3', kind: 'area' as const }] },
    { title: 'Latency', unit: 'ms' as const, stacked: false, series: [
      { key: 'p95', label: 'p95 total', values: s.p95TotalMs ?? [], color: '--tel-s2' },
      { key: 'ttft', label: 'First token p50', values: s.p50TtftMs ?? [], color: '--tel-s5' }] },
    { title: 'Cache hit and errors', unit: 'pct' as const, stacked: false, series: [
      { key: 'hit', label: 'Cache hit %', values: s.cacheHitPct ?? [], color: '--tel-s3' },
      { key: 'err', label: 'Error rate %', values: s.errorPct ?? [], color: '--tel-s8' }] },
    { title: 'Cost', unit: 'num' as const, stacked: false, series: [{ key: 'cost', label: 'Cost (USD)', values: s.estCostUsd ?? [], color: '--tel-s4', kind: 'bar' as const }] },
    { title: 'Retries', unit: 'count' as const, stacked: false, series: [{ key: 'r', label: 'Retries', values: s.retries ?? [], color: '--tel-s6', kind: 'bar' as const }] },
  ];
});

// ── budget ──
const budgetScope = ref<'lane' | 'service'>('lane');
watch(() => props.laneKey, () => { budgetScope.value = eff.value?.budgetScope === 'service' ? 'service' : 'lane'; });
const budgetKey = computed(() => (budgetScope.value === 'lane' ? props.laneKey ?? '' : parts.value.service));
const budget = computed(() => budgetScope.value === 'lane'
  ? c.routing.value?.document?.lanes?.[props.laneKey ?? '']?.budget ?? null
  : c.routing.value?.document?.services?.[parts.value.service]?.budget ?? null);
const budgetScopeMatches = computed(() => !eff.value?.budget || eff.value.budgetScope === budgetScope.value);

// ── kept text ──
const CAPTURE = [{ minutes: 60, label: 'For 1 hour' }, { minutes: 24 * 60, label: 'For 24 hours' }, { minutes: 3 * 24 * 60, label: 'For 3 days' }];
const textDays = 3;
const captureUntil = computed(() => {
  const w = c.routing.value?.document?.capture?.[props.laneKey ?? ''];
  return w && new Date(w.untilUtc).getTime() > c.now.value ? w.untilUtc : null;
});

async function togglePause() {
  if (!lane.value) return;
  if (!paused.value && !(await ui.confirm({
    title: `Pause ${title.value}?`,
    body: 'Its model calls are refused straight away, before anything is sent, until you resume it. Calls already running finish.',
    confirm: 'Pause', danger: true,
  }))) return;
  await c.setPaused(lane.value.service, lane.value.lane, !paused.value, paused.value ? undefined : 'Paused from the KliveLLM page');
}
</script>
