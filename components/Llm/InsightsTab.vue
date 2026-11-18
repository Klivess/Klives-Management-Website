<template>
  <div class="llx-stack" data-testid="llx-insights">
    <section class="llx-card">
      <header class="llx-card__head">
        <h2 class="llx-card__title"><LlmIcon name="spark" />What stands out</h2>
        <span class="llx-card__meta">{{ windowText }} against the same length of time before it · observations only, nothing here acts by itself</span>
      </header>
      <div v-if="!current.value.value" class="llx-empty">{{ current.error.value ?? 'Reading…' }}</div>
      <ul v-else class="llx-insights" data-testid="insights-list">
        <li v-for="i in insights" :key="i.id" class="llx-insight" :data-tone="i.tone === 'good' ? 'ok' : i.tone">
          <span class="llx-insight__mark"><LlmIcon :name="i.tone === 'warn' ? 'alert' : i.tone === 'good' ? 'check-circle' : 'info'" /></span>
          <div class="llx-insight__body"><b>{{ i.title }}</b><p class="llx-dim">{{ i.detail }}</p></div>
          <button v-if="i.jump" class="llx-btn llx-btn--xs llx-btn--ghost" @click="ui.goTab(i.jump.tab as any, i.jump.target ?? null)">Look<LlmIcon name="chevron-right" /></button>
        </li>
        <li v-if="!insights.length" class="llx-empty">Nothing unusual: no lane moved much, and nothing obvious is wasted.</li>
      </ul>
    </section>

    <section class="llx-card" data-testid="insights-waste">
      <header class="llx-card__head">
        <h2 class="llx-card__title"><LlmIcon name="flame" />Where tokens and time go to waste</h2>
        <span class="llx-card__meta">every lane, this window</span>
      </header>
      <div class="llx-minis">
        <div v-for="w in waste" :key="w.key" class="llx-mini" :title="w.help">
          <span class="llx-mini__label">{{ w.label }}</span>
          <span class="llx-mini__value llx-num">{{ w.value }}</span>
          <span class="llx-dim">{{ w.sub }}</span>
        </div>
      </div>
    </section>

    <section class="llx-card" data-testid="insights-movers">
      <header class="llx-card__head">
        <h2 class="llx-card__title"><LlmIcon name="activity" />Biggest movers</h2>
        <span class="llx-card__meta">lanes ranked by how much their token use changed</span>
      </header>
      <div class="llx-tablewrap">
        <table class="llx-table">
          <thead><tr><th class="l">Lane</th><th>Calls</th><th>Tokens</th><th>Change</th><th>Cost</th><th>Change</th><th>p95</th><th>Error rate</th></tr></thead>
          <tbody>
            <tr v-for="m in movers" :key="m.key" class="llx-row" @click="ui.openLane(m.key)">
              <td class="l"><b>{{ m.label }}</b></td>
              <td class="llx-num">{{ llmCompact(m.now.calls) }}</td>
              <td class="llx-num">{{ llmCompact(m.now.totalTokens) }}</td>
              <td class="llx-num" :data-tone="tone(m.tokens, 0)">{{ pctChange(m.tokens) }}</td>
              <td class="llx-num">{{ llmUsd(m.now.estCostUsd) }}</td>
              <td class="llx-num" :data-tone="tone(m.cost, -1)">{{ pctChange(m.cost) }}</td>
              <td class="llx-num">{{ llmMs(m.now.p95TotalMs) }}<span v-if="m.p95 != null" class="llx-dim" :data-tone="tone(m.p95, -1)"> {{ pctChange(m.p95) }}</span></td>
              <td class="llx-num">{{ llmPct(m.now.errorPct) }}<span v-if="m.errPts != null && Math.abs(m.errPts) >= 0.5" class="llx-dim"> {{ m.errPts > 0 ? '+' : '' }}{{ m.errPts.toFixed(1) }} pts</span></td>
            </tr>
            <tr v-if="!movers.length"><td colspan="8" class="llx-empty">{{ previous.value.value ? 'No lane was busy in both windows.' : 'Reading the window before…' }}</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue';
import { useLlmRead, type KliveLlmConsole, type LlmUi } from '~/composables/useKliveLlm';
import { computeLlmInsights, describeWindow, llmCompact, llmDelta, llmInt, llmMs, llmPct, llmUsd, qs } from '~/scripts/kliveLlm';

const c = inject<KliveLlmConsole>('llx')!;
const ui = inject<LlmUi>('llxUi')!;
const EXTRA = 'wastedPrefillTokens,coldStarts,compacted,unpricedTokens';

const current = useLlmRead(c, () => `/klivellm/breakdown${qs({ ...c.params.value, groupBy: 'lane', metrics: EXTRA })}`);
// The window before is read from the server's own aligned bounds, so it does not move every second.
const previous = useLlmRead(c, () => {
  const cur = current.value.value;
  if (!cur?.from || !cur?.to) return null;
  const span = cur.to - cur.from;
  return `/klivellm/breakdown${qs({ from: cur.from - span, to: cur.from, groupBy: 'lane', metrics: EXTRA })}`;
});
const routers30 = useLlmRead(c, () => `/klivellm/breakdown${qs({ range: '30d', groupBy: 'router' })}`);
const windowText = computed(() => describeWindow(c.window.value, c.now.value));

const insights = computed(() => {
  const list30 = new Map<string, number>((routers30.value.value?.groups ?? []).map((g: any) => [String(g.key).toLowerCase(), Number(g.values?.listCostUsd ?? 0)]));
  const routers = (c.routers.value?.routers ?? []).map((r: any) => ({ ...r, list30d: list30.has(String(r.id).toLowerCase()) ? list30.get(String(r.id).toLowerCase()) : null }));
  const order = { warn: 0, info: 1, good: 2 } as const;
  return computeLlmInsights(current.value.value, previous.value.value, routers, c.routing.value).sort((a, b) => order[a.tone] - order[b.tone]);
});

const waste = computed(() => {
  const t = current.value.value?.total ?? {};
  return [
    { key: 'retries', label: 'Retries', value: llmCompact(t.retries), sub: t.calls ? `${llmPct((Number(t.retries ?? 0) / t.calls) * 100)} of calls; each is another prefill` : '', help: 'HTTP attempts beyond the first, across every call.' },
    { key: 'prefill', label: 'Re-prefilled tokens', value: llmCompact(t.wastedPrefillTokens), sub: `prefix reuse ${llmPct(t.prefixReusePct)}`, help: 'Continuation prompt tokens the provider’s cache did not serve: paid for (or queued for) again.' },
    { key: 'cold', label: 'Cold starts', value: llmCompact(t.coldStarts), sub: 'sessions that began with no cached prefix', help: 'First turns, and turns after a router change or compaction.' },
    { key: 'compacted', label: 'Compactions', value: llmCompact(t.compacted), sub: 'conversations squeezed to fit their window', help: 'Each one restarts the cached prefix.' },
    { key: 'truncated', label: 'Cut off at the cap', value: llmCompact(t.truncated), sub: 'replies that hit their output limit', help: 'Their text, and any tool call still being written, were lost.' },
    { key: 'redirected', label: 'Model redirected', value: llmCompact(t.redirected), sub: 'asked for a model the router does not serve', help: 'They got the route’s model instead.' },
    { key: 'fallbacks', label: 'Fallbacks', value: llmCompact(t.fallbacks), sub: 'served by a router other than the first', help: 'After the primary router failed.' },
    { key: 'unpriced', label: 'Unpriced tokens', value: llmCompact(t.unpricedTokens), sub: 'per-token traffic with no price: counted as $0', help: 'Add their models to the price book on the Costs tab.' },
  ];
});

const movers = computed(() => {
  const prev = new Map<string, any>((previous.value.value?.groups ?? []).map((g: any) => [g.key, g.values ?? {}]));
  return (current.value.value?.groups ?? [])
    .map((g: any) => {
      const now = g.values ?? {}, before = prev.get(g.key) ?? {};
      return {
        key: g.key, label: g.label, now,
        tokens: llmDelta(now.totalTokens, before.totalTokens), cost: llmDelta(now.estCostUsd, before.estCostUsd), p95: llmDelta(now.p95TotalMs, before.p95TotalMs),
        errPts: typeof now.errorPct === 'number' && typeof before.errorPct === 'number' ? now.errorPct - before.errorPct : null,
        weight: Math.abs(Number(now.totalTokens ?? 0) - Number(before.totalTokens ?? 0)),
      };
    })
    .filter((m: any) => m.tokens != null || m.cost != null)
    .sort((a: any, b: any) => b.weight - a.weight)
    .slice(0, 15);
});
const pctChange = (d: number | null) => (d == null ? '—' : `${d > 0 ? '+' : ''}${Math.abs(d) >= 10 ? `${llmInt(d * 100)}` : (d * 100).toFixed(0)}%`);
const tone = (d: number | null, good: number) => (d == null || Math.abs(d) < 0.1 || !good ? 'neutral' : Math.sign(d) === good ? 'ok' : 'warn');
</script>
