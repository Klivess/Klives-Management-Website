<template>
  <div class="llx-stack" data-testid="llx-calls">
    <section class="llx-card">
      <header class="llx-card__head">
        <h2 class="llx-card__title"><LlmIcon name="list" />Calls</h2>
        <span class="llx-card__meta">{{ metaText }}</span>
        <div class="llx-card__tools">
          <label class="llx-field llx-field--inline"><span>Sort</span>
            <select v-model="sort" class="llx-select" data-testid="calls-sort">
              <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="slowest">Slowest</option>
              <option value="largest">Largest</option><option value="costliest">Costliest</option><option value="ttft">Slowest first token</option>
            </select>
          </label>
          <button v-if="c.allowed.value.export" class="llx-btn llx-btn--sm llx-btn--ghost" title="Download these calls as CSV (up to 50,000)" @click="exportCsv"><LlmIcon name="download" />CSV</button>
        </div>
      </header>

      <div class="llx-callfilters" data-testid="calls-filters">
        <select v-for="f in SELECTS" :key="f.key" :value="filters[f.key][0] ?? ''" class="llx-select llx-select--sm" :aria-label="f.label" :data-testid="`calls-filter-${f.key}`"
                @change="setList(f.key, ($event.target as HTMLSelectElement).value)">
          <option value="">{{ f.all }}</option>
          <option v-for="o in options[f.key] ?? []" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <input v-model.trim="subject" class="llx-input llx-input--sm" placeholder="Subject" aria-label="Subject" />
        <input v-model.trim="session" class="llx-input llx-input--sm llx-mono" placeholder="Session id" aria-label="Session" />
        <input v-model.number="minMs" class="llx-input llx-input--sm" type="number" min="0" step="1000" placeholder="Slower than (ms)" aria-label="Slower than, in milliseconds" />
        <label class="llx-check"><input v-model="failed" type="checkbox" data-testid="calls-failed" />Failed</label>
        <label class="llx-check"><input v-model="fallback" type="checkbox" />Fell back</label>
        <label class="llx-check"><input v-model="content" type="checkbox" />Text kept</label>
        <span v-if="bucket" class="llx-filter">{{ bucketText }}<button class="llx-iconbtn llx-iconbtn--sm" aria-label="Back to the page’s window" @click="bucket = null"><LlmIcon name="x" /></button></span>
        <button v-if="anyFilter" class="llx-btn llx-btn--xs llx-btn--ghost" @click="reset">Clear</button>
      </div>

      <div class="llx-tablewrap">
        <table class="llx-table llx-calls" data-testid="calls-table">
          <thead>
            <tr>
              <th class="l">Ended</th><th class="l">Service › lane</th><th class="l">Router · model</th><th class="l">Outcome</th>
              <th>Prompt</th><th>Cached</th><th>Output</th><th>Cost</th><th>Total</th><th>First token</th><th class="l"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id" class="llx-row" tabindex="0" :data-testid="`calls-row-${r.id}`" @click="ui.openCall(r.id)" @keydown.enter="ui.openCall(r.id)">
              <td class="l llx-num llx-nowrap" :title="new Date(r.endedMs).toLocaleString()">{{ llmTime(r.endedMs, true) }}<span v-if="!sameDay(r.endedMs)" class="llx-dim"> {{ new Date(r.endedMs).toLocaleDateString([], { day: 'numeric', month: 'short' }) }}</span></td>
              <td class="l"><span class="llx-truncate"><b>{{ r.service }}</b> › {{ r.laneLabel }}<span v-if="r.subject" class="llx-dim"> · {{ r.subject }}</span></span></td>
              <td class="l"><span class="llx-truncate">{{ r.routerName ?? r.router }} <span class="llx-mono llx-dim">{{ r.model }}</span></span></td>
              <td class="l"><span class="llx-chip llx-chip--dot" :data-tone="outcomeInfo(r.outcome).tone" :title="r.error ?? ''">{{ outcomeInfo(r.outcome).label }}</span><span v-if="r.attempts > 1" class="llx-dim llx-small"> ×{{ r.attempts }}</span></td>
              <td class="llx-num">{{ llmCompact(r.promptTokens) }}</td>
              <td class="llx-num">{{ r.cacheMetrics === false ? '—' : llmCompact(r.cachedTokens) }}</td>
              <td class="llx-num">{{ llmCompact(r.completionTokens) }}</td>
              <td class="llx-num">{{ r.estCostUsd ? llmUsd(r.estCostUsd) : r.billing === 'PerToken' ? '$0' : '—' }}</td>
              <td class="llx-num">{{ llmMs(r.totalMs) }}</td>
              <td class="llx-num">{{ r.ttftMs ? llmMs(r.ttftMs) : '—' }}</td>
              <td class="l"><span class="llx-flags"><span v-for="f in flagsOf(r)" :key="f.id" class="llx-flag" :title="f.title"><LlmIcon :name="f.icon" /></span></span></td>
            </tr>
            <tr v-if="!rows.length"><td colspan="11" class="llx-empty">{{ read.value.value ? 'No call matches.' : read.error.value ?? 'Reading the ledger…' }}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="llx-form__actions">
        <span class="llx-dim">{{ rows.length }} shown{{ read.value.value?.capped ? ' · the search stopped early: narrow the window or filters' : '' }}</span>
        <button v-if="next" class="llx-btn llx-btn--sm" :disabled="loadingMore" data-testid="calls-more" @click="more">{{ loadingMore ? 'Reading…' : 'Show more' }}</button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, reactive, ref, watch } from 'vue';
import { useLlmRead, type KliveLlmConsole, type LlmUi } from '~/composables/useKliveLlm';
import { OUTCOME_LABELS, llmCompact, llmMs, llmTime, llmUsd, outcomeInfo, qs } from '~/scripts/kliveLlm';

const c = inject<KliveLlmConsole>('llx')!;
const ui = inject<LlmUi>('llxUi')!;

type ListKey = 'service' | 'lane' | 'router' | 'model' | 'outcome' | 'kind';
const SELECTS: { key: ListKey; label: string; all: string }[] = [
  { key: 'service', label: 'Service', all: 'Every service' }, { key: 'lane', label: 'Lane', all: 'Every lane' }, { key: 'router', label: 'Router', all: 'Every router' },
  { key: 'model', label: 'Model', all: 'Every model' }, { key: 'outcome', label: 'Outcome', all: 'Any outcome' }, { key: 'kind', label: 'Kind', all: 'Any kind' },
];
const filters = reactive<Record<ListKey, string[]>>({ service: [], lane: [], router: [], model: [], outcome: [], kind: [] });
const subject = ref('');
const session = ref('');
const minMs = ref<number | ''>('');
const failed = ref(false);
const fallback = ref(false);
const content = ref(false);
const sort = ref('newest');
const bucket = ref<{ from: number; to: number } | null>(null);

const setList = (key: ListKey, value: string) => { filters[key] = value ? [value] : []; };
const anyFilter = computed(() => Object.values(filters).some(v => v.length) || subject.value || session.value || minMs.value || failed.value || fallback.value || content.value || bucket.value);
function reset() {
  for (const k of Object.keys(filters) as ListKey[]) filters[k] = [];
  subject.value = ''; session.value = ''; minMs.value = ''; failed.value = false; fallback.value = false; content.value = false; bucket.value = null;
}

const options = computed<Record<string, { value: string; label: string }[]>>(() => {
  const flows: any[] = c.overview.value?.data?.flows ?? [];
  const lanes: any[] = c.routing.value?.lanes ?? [];
  const uniq = (list: { value: string; label: string }[]) => [...new Map(list.filter(x => x.value).map(x => [x.value, x])).values()].sort((a, b) => a.label.localeCompare(b.label));
  const svc = filters.service[0];
  return {
    service: uniq(lanes.map(l => ({ value: l.service, label: l.service }))),
    lane: uniq(lanes.filter(l => !svc || l.service === svc).map(l => ({ value: l.key, label: `${l.service} › ${l.label}` }))),
    router: uniq((c.routers.value?.routers ?? []).map((r: any) => ({ value: r.id, label: r.name }))),
    model: uniq(flows.map(f => ({ value: f.model, label: f.model }))),
    outcome: Object.entries(OUTCOME_LABELS).map(([value, o]) => ({ value, label: o.label })),
    kind: [{ value: 'chat', label: 'Chat' }, { value: 'tool', label: 'Tool session' }, { value: 'warm', label: 'Prefix warm-up' }, { value: 'stt', label: 'Speech to text' }, { value: 'tts', label: 'Text to speech' }, { value: 'local', label: 'Local model' }],
  };
});

const query = computed(() => ({
  ...(bucket.value ? { from: bucket.value.from, to: bucket.value.to } : c.params.value),
  bucket: undefined,
  service: filters.service, lane: filters.lane, router: filters.router, model: filters.model, outcome: filters.outcome, kind: filters.kind,
  subject: subject.value || undefined, session: session.value || undefined, minMs: typeof minMs.value === 'number' && minMs.value > 0 ? minMs.value : undefined,
  failed: failed.value || undefined, fallback: fallback.value || undefined, content: content.value || undefined, sort: sort.value,
}));
const path = computed(() => `/klivellm/calls${qs({ ...query.value, limit: 50 })}`);
const read = useLlmRead(c, () => path.value);

// "Show more" pages are kept until the filters change.
const extra = ref<any[]>([]);
const nextCursor = ref<string | null>(null);
const loadingMore = ref(false);
watch(path, () => { extra.value = []; nextCursor.value = null; });
const next = computed(() => (extra.value.length ? nextCursor.value : read.value.value?.next ?? null));
async function more() {
  if (!next.value) return;
  loadingMore.value = true;
  try {
    const page = await c.get(`/klivellm/calls${qs({ ...query.value, limit: 100, next: next.value })}`);
    extra.value = [...extra.value, ...(page?.calls ?? [])];
    nextCursor.value = page?.next ?? null;
  } catch (e: any) {
    c.notify('crit', e?.message ?? 'The next page did not come back.');
  } finally { loadingMore.value = false; }
}
const rows = computed(() => {
  const seen = new Set<number>();
  const out: any[] = [];
  for (const r of [...(read.value.value?.calls ?? []), ...extra.value]) if (!seen.has(r.id)) { seen.add(r.id); out.push(r); }
  return out;
});

const bucketText = computed(() => (bucket.value ? `${llmTime(bucket.value.from)} – ${llmTime(bucket.value.to)} ${new Date(bucket.value.from).toLocaleDateString([], { day: 'numeric', month: 'short' })}` : ''));
const metaText = computed(() => (bucket.value ? `one bucket: ${bucketText.value}` : 'in the page’s window') + ' · click a call for its attempts, tokens and cost');
const sameDay = (ms: number) => new Date(ms).toDateString() === new Date(c.now.value).toDateString();

const FLAG_INFO: Record<string, { icon: string; title: string }> = {
  Fallback: { icon: 'route', title: 'Served by a fallback router' },
  Redirected: { icon: 'arrow-right', title: 'The router does not serve the model asked for: the route’s model was sent' },
  Truncated: { icon: 'minus', title: 'Cut off at the output cap' },
  Compacted: { icon: 'layers', title: 'The conversation was compacted before this call' },
  ColdStart: { icon: 'flame', title: 'Cold start: no cached prefix to reuse' },
  Pinned: { icon: 'pin', title: 'The route’s pinned model replaced the service’s own' },
  ContentKept: { icon: 'text', title: 'Prompt and reply text were kept' },
  Stalled: { icon: 'clock', title: 'The stream stalled' },
  Imported: { icon: 'download', title: 'Imported from the Projects journal' },
  Estimated: { icon: 'info', title: 'Tokens estimated: the router reported none' },
};
const flagsOf = (r: any) => (r.flags ?? []).filter((f: string) => FLAG_INFO[f]).map((f: string) => ({ id: f, ...FLAG_INFO[f] }));

async function exportCsv() {
  await ui.download(`/klivellm/export${qs({ ...query.value, kind: 'calls' })}`, 'klivellm-calls.csv');
}

// A preset from another tab: filters, a bucket, or a session.
function applyPreset() {
  const p = ui.callsPreset.value;
  if (!p) return;
  reset();
  for (const k of ['service', 'lane', 'router', 'model', 'outcome', 'kind'] as ListKey[]) if (p[k]) filters[k] = ([] as string[]).concat(p[k]).slice(0, 1);
  if (p.subject) subject.value = p.subject;
  if (p.session) session.value = p.session;
  if (p.failed) failed.value = true;
  if (p.fallback) fallback.value = true;
  if (typeof p.from === 'number' && typeof p.to === 'number') bucket.value = { from: p.from, to: p.to };
  ui.callsPreset.value = null;
}
onMounted(() => {
  applyPreset();
  if (ui.target.value === 'failed') failed.value = true;
  if (ui.target.value === 'truncated') sort.value = 'largest';
});
watch(() => ui.callsPreset.value, applyPreset);
</script>
