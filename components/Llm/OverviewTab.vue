<template>
  <div class="llx-stack" data-testid="llx-overview">
    <!-- verdict + headline figures -->
    <div class="llx-top">
      <section class="llx-verdict" :data-tone="c.verdict.value.tone" data-testid="llx-verdict">
        <div class="llx-verdict__head">
          <span class="llx-verdict__mark"><LlmIcon :name="c.verdict.value.tone === 'ok' ? 'check-circle' : c.verdict.value.tone === 'crit' ? 'octagon-x' : c.verdict.value.tone === 'warn' ? 'alert' : 'info'" /></span>
          <div>
            <h2 class="llx-verdict__title">{{ c.verdict.value.title }}</h2>
            <p class="llx-dim">{{ c.verdict.value.detail }}</p>
          </div>
        </div>
        <ul v-if="c.issues.value.length" class="llx-issues">
          <li v-for="issue in c.issues.value.slice(0, 6)" :key="issue.id">
            <button class="llx-issue" :data-tone="issue.tone" @click="issue.jump && ui.goTab(issue.jump.tab as any, issue.jump.target)">
              <span class="llx-issue__dot"></span>
              <span class="llx-truncate"><b>{{ issue.title }}</b><span class="llx-dim"> · {{ issue.detail }}</span></span>
              <LlmIcon v-if="issue.jump" name="chevron-right" />
            </button>
          </li>
          <li v-if="c.issues.value.length > 6" class="llx-dim llx-issues__more">and {{ c.issues.value.length - 6 }} more</li>
        </ul>
        <div class="llx-verdict__facts">
          <span><b>{{ defaultRouterName }}</b> default router{{ followsSetting ? ' (RemoteLLMProvider)' : '' }}</span>
          <span>routing revision <b class="llx-num">{{ c.routing.value?.revision ?? '—' }}</b></span>
          <span><b class="llx-num">{{ llmInt(c.live.value?.inFlight?.length ?? 0) }}</b> in flight</span>
          <span v-if="air">AIRouter <b class="llx-num">{{ air.inFlight }}/{{ air.maxParallel }}</b> slots<template v-if="air.waiting">, <b class="llx-num">{{ air.waiting }}</b> queued</template></span>
        </div>
      </section>

      <div class="llx-kpis">
        <LlmKpi label="Calls" icon="activity" :value="has ? llmCompact(total.calls) : null" :delta="llmDelta(total.calls, prev.calls)" :good="0" testid="kpi-calls">
          <template #sub><span v-if="has"><b>{{ llmPct(total.errorPct) }}</b> failed · {{ llmInt(total.retries) }} retries</span></template>
          <LlmSpark :points="series.calls ?? []" bars tone="info" label="Calls" />
        </LlmKpi>
        <LlmKpi label="Tokens" icon="layers" :value="has ? llmCompact(total.totalTokens) : null" :delta="llmDelta(total.totalTokens, prev.totalTokens)" :good="0" testid="kpi-tokens">
          <template #sub><span v-if="has">{{ llmCompact(total.promptTokens) }} in · {{ llmCompact(total.completionTokens) }} out</span></template>
          <LlmSpark :points="series.totalTokens ?? []" tone="info" label="Tokens" :format="llmCompact" />
        </LlmKpi>
        <LlmKpi label="Cost" icon="coins" :value="has ? llmUsd(total.estCostUsd) : null" :delta="llmDelta(total.estCostUsd, prev.estCostUsd)" :good="-1" clickable testid="kpi-cost" @open="ui.goTab('costs')"
                help="Reported by the routers, or the price book where they report nothing. Flat-fee and free routers cost nothing per token.">
          <template #sub><span v-if="has">list price <b>{{ llmUsd(total.listCostUsd) }}</b></span></template>
          <LlmSpark :points="series.estCostUsd ?? []" bars tone="warn" label="Cost" :format="v => llmUsd(v)" />
        </LlmKpi>
        <LlmKpi label="Cache hit" icon="bolt" :value="has && total.cacheHitPct != null ? llmPct(total.cacheHitPct) : has ? '—' : null" :delta="llmDelta(total.cacheHitPct, prev.cacheHitPct)" :good="1" testid="kpi-cache"
                help="Prompt tokens served from the provider's cache, where the router reports it.">
          <template #sub><span v-if="has">prefix reuse <b>{{ llmPct(total.prefixReusePct) }}</b></span></template>
          <LlmSpark :points="series.cacheHitPct ?? []" tone="ok" label="Cache hit" :format="v => llmPct(v)" />
        </LlmKpi>
        <LlmKpi label="Latency p95" icon="clock" :value="has ? llmMs(total.p95TotalMs) : null" :delta="llmDelta(total.p95TotalMs, prev.p95TotalMs)" :good="-1" testid="kpi-latency">
          <template #sub><span v-if="has">first token p50 <b>{{ llmMs(total.p50TtftMs) }}</b> · queue {{ llmMs(total.meanQueueMs) }}</span></template>
          <LlmSpark :points="series.p95TotalMs ?? []" tone="neutral" label="p95 latency" :format="llmMs" />
        </LlmKpi>
      </div>
    </div>

    <!-- routing map + live -->
    <div class="llx-mid">
      <section class="llx-card" aria-label="Routing map">
        <header class="llx-card__head">
          <h2 class="llx-card__title"><LlmIcon name="route" />Where every call went</h2>
          <span class="llx-card__meta">{{ (c.overview.value?.data?.flows ?? []).length }} paths</span>
          <div class="llx-card__tools">
            <div class="llx-seg" role="group" aria-label="Ribbon width">
              <button v-for="m in measures" :key="m.id" class="llx-seg__opt" :aria-pressed="c.prefs.value.flowMeasure === m.id" @click="c.prefs.value = { ...c.prefs.value, flowMeasure: m.id }">{{ m.label }}</button>
            </div>
          </div>
        </header>
        <LlmFlowMap :flows="c.overview.value?.data?.flows ?? []" :measure="c.prefs.value.flowMeasure" :height="flowHeight"
                    :empty-text="c.overview.value ? 'No calls in this window.' : 'Reading the ledger…'" @select="onFlowSelect" />
      </section>

      <section class="llx-card llx-live-card" aria-label="In flight">
        <header class="llx-card__head">
          <h2 class="llx-card__title"><LlmIcon name="activity" />In flight</h2>
          <span class="llx-card__meta llx-num">{{ inFlight.length }}</span>
        </header>
        <ul class="llx-flights" data-testid="llx-inflight">
          <li v-for="f in inFlight" :key="f.id" class="llx-flight" :data-state="f.state">
            <span class="llx-flight__state" :title="f.state"></span>
            <span class="llx-truncate"><b>{{ f.service }}</b> › {{ laneLabelOf(f) }}<span v-if="f.subject" class="llx-dim"> · {{ f.subject }}</span></span>
            <span class="llx-dim llx-truncate">{{ f.routerName || f.router || '…' }}<template v-if="f.model"> · {{ f.model }}</template></span>
            <span class="llx-num llx-flight__time">{{ llmMs(f.elapsedMs) }}</span>
            <span class="llx-chip" :data-tone="stateTone(f.state)">{{ stateLabel(f.state) }}{{ f.attempts > 1 ? ` · try ${f.attempts}` : '' }}</span>
          </li>
          <li v-if="!inFlight.length" class="llx-empty">Nothing is waiting on a model right now.</li>
        </ul>
        <header class="llx-card__head llx-card__head--sub">
          <h3 class="llx-card__title"><LlmIcon name="list" />Latest calls</h3>
          <button v-if="c.allowed.value.calls" class="llx-btn llx-btn--xs llx-btn--ghost" @click="ui.goTab('calls')">All calls</button>
        </header>
        <ul class="llx-recent">
          <li v-for="r in recent" :key="r.id">
            <button class="llx-recent__row" @click="ui.openCall(r.id)">
              <span class="llx-chip llx-chip--dot" :data-tone="outcomeInfo(r.outcome).tone">{{ outcomeInfo(r.outcome).label }}</span>
              <span class="llx-truncate"><b>{{ r.service }}</b> › {{ r.laneLabel }}</span>
              <span class="llx-dim llx-truncate">{{ r.model }}</span>
              <span class="llx-num llx-dim">{{ llmCompact((r.promptTokens ?? 0) + (r.completionTokens ?? 0)) }} tok</span>
              <span class="llx-num">{{ llmMs(r.totalMs) }}</span>
            </button>
          </li>
          <li v-if="!recent.length" class="llx-empty">No calls since the server started.</li>
        </ul>
      </section>
    </div>

    <!-- charts -->
    <section class="llx-card" aria-label="Over time">
      <header class="llx-card__head">
        <h2 class="llx-card__title"><LlmIcon name="chart" />Over time</h2>
        <span class="llx-card__meta">{{ c.overview.value?.data?.bucket ? `${c.overview.value.data.bucket} buckets` : '' }} · drag across a chart to zoom in</span>
      </header>
      <div class="llx-charts">
        <div v-for="chart in charts" :key="chart.title" class="llx-chartcell">
          <h3>{{ chart.title }}</h3>
          <TelChart v-if="t0 != null" :t0="t0" :step="step" :series="chart.series" :unit="chart.unit" :label="chart.title" :stacked="chart.stacked" :height="120"
                    :marks="marks" @zoom="(from, to) => c.zoomTo(from, to)" />
        </div>
      </div>
      <p v-if="marks.length" class="llx-note">Dashed lines: {{ marksText }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue';
import TelChart from '~/components/ApiTelemetry/TelChart.vue';
import type { KliveLlmConsole } from '~/composables/useKliveLlm';
import { llmCompact, llmDelta, llmInt, llmMs, llmPct, llmUsd, outcomeInfo } from '~/scripts/kliveLlm';

const c = inject<KliveLlmConsole>('llx')!;
const ui = inject<any>('llxUi')!;

const data = computed(() => c.overview.value?.data);
const has = computed(() => data.value != null);
const total = computed<any>(() => data.value?.total ?? {});
const prev = computed<any>(() => data.value?.previous ?? {});
const series = computed<any>(() => data.value?.series ?? {});
const t0 = computed(() => data.value?.from ?? null);
const step = computed(() => data.value?.step ?? 60_000);
const air = computed(() => c.live.value?.airouter);
const defaultRouterName = computed(() => c.overview.value?.routing?.defaultRouterName ?? c.live.value?.routing?.defaultRouterName ?? '—');
const followsSetting = computed(() => c.overview.value?.routing?.followsSetting ?? true);
const laneLabels = computed(() => new Map<string, string>((c.routing.value?.lanes ?? []).map((l: any) => [l.key, l.label])));
/** The server names the lane (newer builds); otherwise the routing catalogue does; otherwise its id. */
const laneLabelOf = (f: any) => f.laneLabel ?? laneLabels.value.get(f.laneKey ?? `${f.service}/${f.lane}`) ?? f.lane;
const inFlight = computed<any[]>(() => (c.live.value?.inFlight ?? []).slice().sort((a: any, b: any) => b.elapsedMs - a.elapsedMs).slice(0, 14));
const recent = computed<any[]>(() => (c.live.value?.recent ?? []).slice(0, 12));
const marks = computed(() => (c.overview.value?.marks ?? []).map((m: any) => ({ t: m.ts, label: m.title })));
const marksText = computed(() => (c.overview.value?.marks ?? []).slice(0, 4).map((m: any) => `${new Date(m.ts).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} ${m.title}`).join(' · '));
// Tall enough that the busiest column's labels (one a node) never touch: about 30 px a node.
const flowHeight = computed(() => {
  const flows: any[] = c.overview.value?.data?.flows ?? [];
  const most = Math.max(1, new Set(flows.map(f => f.lane)).size, new Set(flows.map(f => f.model)).size);
  return Math.min(560, Math.max(240, most * 30));
});

const measures = [{ id: 'tokens', label: 'Tokens' }, { id: 'calls', label: 'Calls' }, { id: 'costUsd', label: 'Cost' }] as const;

const charts = computed(() => {
  const s = series.value;
  const failed = (s.failed ?? []).map((v: number | null) => v ?? 0);
  const ok = (s.calls ?? []).map((v: number | null, i: number) => v == null ? null : v - (failed[i] ?? 0));
  return [
    { title: 'Calls', unit: 'count' as const, stacked: true, series: [
      { key: 'ok', label: 'Answered', values: ok, color: '--tel-s1', kind: 'bar' as const },
      { key: 'failed', label: 'Failed', values: failed, color: '--tel-s8', kind: 'bar' as const }] },
    { title: 'Tokens', unit: 'count' as const, stacked: true, series: [
      { key: 'prompt', label: 'Prompt', values: s.promptTokens ?? [], color: '--tel-s1', kind: 'area' as const },
      { key: 'completion', label: 'Completion', values: s.completionTokens ?? [], color: '--tel-s3', kind: 'area' as const }] },
    { title: 'Cost', unit: 'num' as const, stacked: false, series: [
      { key: 'cost', label: 'Cost (USD)', values: s.estCostUsd ?? [], color: '--tel-s4', kind: 'bar' as const },
      { key: 'list', label: 'List-price equivalent', values: s.listCostUsd ?? [], color: '--tel-s7', dash: true }] },
    { title: 'Latency', unit: 'ms' as const, stacked: false, series: [
      { key: 'p95', label: 'p95 total', values: s.p95TotalMs ?? [], color: '--tel-s2' },
      { key: 'ttft', label: 'First token p50', values: s.p50TtftMs ?? [], color: '--tel-s5' },
      { key: 'queue', label: 'Queue wait (mean)', values: s.meanQueueMs ?? [], color: '--tel-s6', dash: true }] },
    { title: 'Cache hit', unit: 'pct' as const, stacked: false, series: [{ key: 'hit', label: 'Cache hit %', values: s.cacheHitPct ?? [], color: '--tel-s3' }] },
    { title: 'Errors & fallbacks', unit: 'count' as const, stacked: false, series: [
      { key: 'err', label: 'Error rate %', values: s.errorPct ?? [], color: '--tel-s8' },
      { key: 'fb', label: 'Fallbacks', values: s.fallbacks ?? [], color: '--tel-s4', kind: 'bar' as const }] },
  ];
});

const STATE_LABELS: Record<string, string> = { Starting: 'starting', Queued: 'queued', AwaitingProvider: 'waiting for reply', Reasoning: 'reasoning', Streaming: 'streaming', Retrying: 'retrying' };
const stateLabel = (s: string) => STATE_LABELS[s] ?? s;
const stateTone = (s: string) => (s === 'Retrying' ? 'warn' : s === 'Queued' ? 'info' : s === 'Streaming' || s === 'Reasoning' ? 'ok' : 'neutral');

function onFlowSelect(kind: 'lane' | 'router' | 'model', key: string) {
  if (kind === 'lane') ui.openLane(key);
  else if (kind === 'router') ui.openRouter(key);
  else ui.filterAnalytics({ model: [key] });
}
</script>
