<template>
  <div class="llx-stack" data-testid="llx-services">
    <section class="llx-card">
      <header class="llx-card__head">
        <h2 class="llx-card__title"><LlmIcon name="grid" />Every service and lane</h2>
        <span class="llx-card__meta">{{ summary }}</span>
        <div class="llx-card__tools">
          <label class="llx-field llx-field--inline llx-field--search">
            <LlmIcon name="search" />
            <input v-model="query" class="llx-input" placeholder="Filter: a service, router or model" aria-label="Filter lanes" data-testid="services-filter" />
          </label>
          <label class="llx-field llx-field--inline">
            <span>Sort</span>
            <select v-model="sort" class="llx-select" aria-label="Sort lanes">
              <option v-for="s in SORTS" :key="s.id" :value="s.id">{{ s.label }}</option>
            </select>
          </label>
          <label class="llx-check"><input v-model="hideIdle" type="checkbox" />Hide idle</label>
        </div>
      </header>

      <div class="llx-tablewrap">
        <table class="llx-table llx-table--services">
          <thead>
            <tr>
              <th class="l">Service › lane</th>
              <th class="l">Router</th>
              <th class="l">Model</th>
              <th>Calls</th>
              <th>Tokens</th>
              <th>Cost</th>
              <th>Cache hit</th>
              <th>p95</th>
              <th>Errors</th>
              <th title="Tool sessions held (warm: prefix still cached)">Sessions</th>
              <th class="l">Status</th>
            </tr>
          </thead>
          <tbody v-for="group in groups" :key="group.service">
            <tr class="llx-table__group">
              <th class="l" colspan="3">
                <span class="llx-group__name">{{ group.service }}</span>
                <span v-if="group.policy?.router" class="llx-chip" data-tone="info" title="A route set for the whole service">service → {{ routerName(group.policy.router) }}</span>
                <span v-if="group.policy?.paused" class="llx-chip" data-tone="info">service paused</span>
              </th>
              <td class="llx-num">{{ llmCompact(group.calls) }}</td>
              <td class="llx-num">{{ llmCompact(group.tokens) }}</td>
              <td class="llx-num">{{ llmUsd(group.cost) }}</td>
              <td colspan="5"></td>
            </tr>
            <tr v-for="row in group.rows" :key="row.key" class="llx-row" :data-idle="!row.values?.calls || undefined" :data-testid="`lane-${row.key}`"
                tabindex="0" @click="ui.openLane(row.key)" @keydown.enter="ui.openLane(row.key)">
              <td class="l">
                <span class="llx-lane">
                  <b class="llx-truncate">{{ row.label }}</b>
                  <span v-if="row.description" class="llx-dim llx-truncate">{{ row.description }}</span>
                </span>
              </td>
              <td class="l">
                <span v-if="row.effective" class="llx-route">
                  <span class="llx-truncate">{{ row.effective.routerName ?? row.effective.router ?? '—' }}</span>
                  <span class="llx-chip llx-chip--xs" :data-tone="billingTone(row.effective.billing)">{{ BILLING_LABELS[row.effective.billing] ?? row.effective.billing }}</span>
                  <span class="llx-dim llx-route__src" :title="row.effective.chain?.join('\n')">{{ SOURCE_LABELS[row.effective.source] ?? row.effective.source }}</span>
                </span>
                <span v-else class="llx-dim">—</span>
              </td>
              <td class="l">
                <span class="llx-model">
                  <span v-if="row.effective?.pin" title="Pinned: the service’s own model choice is overridden"><LlmIcon name="pin" /></span>
                  <span class="llx-truncate llx-mono">{{ row.effective?.model || servedModel(row) || '—' }}</span>
                </span>
                <span v-if="row.info?.modelSource && !row.effective?.pin" class="llx-dim llx-model__src llx-truncate" :title="`The service chooses its own model: ${row.info.modelSource}`">set in {{ row.info.modelSource }}</span>
              </td>
              <td class="llx-num">
                <span class="llx-cellspark">
                  <LlmSpark :points="row.spark ?? []" bars tone="info" :width="54" :height="16" :label="`${row.label} calls`" />
                  {{ llmCompact(row.values?.calls ?? 0) }}
                </span>
              </td>
              <td class="llx-num">{{ llmCompact(row.values?.totalTokens) }}</td>
              <td class="llx-num">{{ row.values ? llmUsd(row.values.estCostUsd) : '—' }}</td>
              <td class="llx-num">{{ llmPct(row.values?.cacheHitPct) }}</td>
              <td class="llx-num">{{ llmMs(row.values?.p95TotalMs) }}</td>
              <td class="llx-num" :data-tone="errTone(row)">{{ row.values?.calls ? llmPct(row.values.errorPct) : '—' }}</td>
              <td class="llx-num">{{ row.info?.sessions ? `${row.info.warmSessions}/${row.info.sessions}` : '—' }}</td>
              <td class="l"><span class="llx-chip llx-chip--dot" :data-tone="status(row).tone" :title="status(row).title">{{ status(row).label }}</span></td>
            </tr>
          </tbody>
          <tbody v-if="!groups.length">
            <tr><td colspan="11" class="llx-empty">{{ c.routing.value ? 'No lane matches this filter.' : 'Reading the services…' }}</td></tr>
          </tbody>
        </table>
      </div>
      <p class="llx-note">
        A lane is one part of a service with its own traffic. Its route comes from the lane, then its service, then the default route;
        a service that picks its own model keeps it unless the route pins one. Click a lane for its route, charts, calls and budget.
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import type { KliveLlmConsole, LlmUi } from '~/composables/useKliveLlm';
import { BILLING_LABELS, laneParts, llmCompact, llmMs, llmPct, llmUsd } from '~/scripts/kliveLlm';

const c = inject<KliveLlmConsole>('llx')!;
const ui = inject<LlmUi>('llxUi')!;

const query = ref('');
const sort = ref<'calls' | 'tokens' | 'cost' | 'errors' | 'latency' | 'name'>('calls');
const hideIdle = ref(false);
const SORTS = [
  { id: 'calls', label: 'Calls' }, { id: 'tokens', label: 'Tokens' }, { id: 'cost', label: 'Cost' },
  { id: 'errors', label: 'Error rate' }, { id: 'latency', label: 'p95 latency' }, { id: 'name', label: 'Name' },
] as const;

const SOURCE_LABELS: Record<string, string> = {
  fixed: 'fixed', override: 'override', lane: 'set on the lane', service: 'set on the service', 'free-model': 'free model', default: 'default route', setting: 'RemoteLLMProvider',
};

const routerNames = computed(() => new Map<string, string>((c.routing.value?.routers ?? []).map((r: any) => [String(r.id).toLowerCase(), r.name])));
const routerName = (id: string) => routerNames.value.get(String(id).toLowerCase()) ?? id;
const billingTone = (billing: string) => (billing === 'PerToken' ? 'warn' : billing === 'Flat' ? 'info' : 'ok');

interface Row { key: string; service: string; lane: string; label: string; description?: string; info: any; effective: any; values: any; previous: any; spark: (number | null)[] }

const rows = computed<Row[]>(() => {
  const byKey = new Map<string, Row>();
  for (const lane of c.routing.value?.lanes ?? [])
    byKey.set(lane.key, { key: lane.key, service: lane.service, lane: lane.lane, label: lane.label, description: lane.description, info: lane, effective: lane.effective, values: null, previous: null, spark: [] });
  for (const l of c.overview.value?.data?.lanes ?? []) {
    const parts = laneParts(l.key);
    const row = byKey.get(l.key) ?? { key: l.key, service: parts.service, lane: parts.lane, label: String(l.label ?? '').split(' › ')[1] ?? parts.lane, info: null, effective: null, values: null, previous: null, spark: [] };
    row.values = l.values;
    row.previous = l.previous;
    row.spark = l.spark ?? [];
    byKey.set(l.key, row);
  }
  return [...byKey.values()];
});

/** The model the flows say answered this lane, when no route names one. */
const flowModels = computed(() => {
  const map = new Map<string, { model: string; calls: number }>();
  for (const f of c.overview.value?.data?.flows ?? []) {
    const best = map.get(f.lane);
    if (!best || f.calls > best.calls) map.set(f.lane, { model: f.model, calls: f.calls });
  }
  return map;
});
const servedModel = (row: Row) => flowModels.value.get(row.key)?.model;

const overrideOn = computed(() => {
  const o = c.routing.value?.document?.override;
  return o && new Date(o.untilUtc).getTime() > c.now.value ? o : null;
});

function status(row: Row): { label: string; tone: string; title: string } {
  const e = row.effective;
  const calls = Number(row.values?.calls ?? 0);
  if (e?.blocked === 'Paused') return { label: 'Paused', tone: 'info', title: e.blockReason ?? 'Paused from KliveLLM' };
  if (e?.blocked) return { label: 'Refused', tone: 'warn', title: e.blockReason ?? e.blocked };
  if (overrideOn.value && e?.source === 'override') return { label: 'Override', tone: 'info', title: `Emergency override to ${overrideOn.value.router}` };
  const err = Number(row.values?.errorPct ?? 0);
  if (calls >= 10 && err >= 10) return { label: 'Failing', tone: 'crit', title: `${llmPct(err)} of its calls failed` };
  if (calls >= 10 && err >= 3) return { label: 'Errors', tone: 'warn', title: `${llmPct(err)} of its calls failed` };
  if (e?.budgetStatus?.exceeded) return { label: 'Over budget', tone: 'warn', title: e.budgetStatus.detail };
  if (e?.capture) return { label: 'Keeping text', tone: 'info', title: 'Prompt and reply text is being kept for this lane' };
  if (calls > 0) return { label: 'Active', tone: 'ok', title: `${calls} calls in the window` };
  return { label: 'Idle', tone: 'neutral', title: 'No calls in this window' };
}

function errTone(row: Row) {
  const calls = Number(row.values?.calls ?? 0), err = Number(row.values?.errorPct ?? 0);
  return calls >= 10 && err >= 10 ? 'crit' : calls >= 10 && err >= 3 ? 'warn' : undefined;
}

const sortValue = (row: Row): number => {
  const v = row.values ?? {};
  switch (sort.value) {
    case 'tokens': return Number(v.totalTokens ?? 0);
    case 'cost': return Number(v.estCostUsd ?? 0);
    case 'errors': return Number(v.errorPct ?? 0);
    case 'latency': return Number(v.p95TotalMs ?? 0);
    default: return Number(v.calls ?? 0);
  }
};

const groups = computed(() => {
  const words = query.value.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (row: Row) => {
    if (hideIdle.value && !row.values?.calls) return false;
    if (!words.length) return true;
    const hay = `${row.service} ${row.lane} ${row.label} ${row.effective?.routerName ?? ''} ${row.effective?.router ?? ''} ${row.effective?.model ?? ''} ${servedModel(row) ?? ''}`.toLowerCase();
    return words.every(w => hay.includes(w));
  };
  const byService = new Map<string, Row[]>();
  for (const row of rows.value.filter(matches)) {
    if (!byService.has(row.service)) byService.set(row.service, []);
    byService.get(row.service)!.push(row);
  }
  const list = [...byService.entries()].map(([service, list]) => {
    list.sort((a, b) => sort.value === 'name' ? a.label.localeCompare(b.label) : sortValue(b) - sortValue(a) || a.label.localeCompare(b.label));
    return {
      service,
      rows: list,
      policy: c.routing.value?.document?.services?.[service] ?? null,
      calls: list.reduce((s, r) => s + Number(r.values?.calls ?? 0), 0),
      tokens: list.reduce((s, r) => s + Number(r.values?.totalTokens ?? 0), 0),
      cost: list.reduce((s, r) => s + Number(r.values?.estCostUsd ?? 0), 0),
    };
  });
  return list.sort((a, b) => sort.value === 'name' ? a.service.localeCompare(b.service) : b.calls - a.calls || a.service.localeCompare(b.service));
});

const summary = computed(() => {
  const all = rows.value;
  const active = all.filter(r => Number(r.values?.calls ?? 0) > 0).length;
  const services = new Set(all.map(r => r.service)).size;
  return `${services} services · ${active} of ${all.length} lanes active in this window`;
});
</script>
