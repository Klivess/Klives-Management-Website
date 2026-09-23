<!--
  Kept traces (every slow request, every 5xx / disconnect, plus a small sample per
  route per minute) and a single request's full waterfall: browser phases around
  the server's own stages, with custom spans overlaid.
-->
<template>
  <div class="tel-tr">
    <div class="list">
      <div class="filters">
        <input v-model="q" type="search" placeholder="Filter by route…" aria-label="Filter traces by route" />
        <label>≥ <input v-model.number="minMs" type="number" min="0" step="50" aria-label="Minimum duration in ms" /> ms</label>
        <label><input v-model="errorsOnly" type="checkbox" /> errors</label>
      </div>
      <ul role="listbox" aria-label="Kept traces">
        <li v-for="t in shown" :key="t.id" role="option" :aria-selected="t.id === selectedId" tabindex="0"
            @click="$emit('select', t.id)" @keydown.enter="$emit('select', t.id)">
          <span class="ms" :class="tone(t)">{{ fmtMs(t.ms) }}</span>
          <span class="r"><b>{{ t.method }}</b> {{ t.route }}</span>
          <span class="meta">{{ t.status }} · {{ t.cache }} · {{ time(t.ts) }}<template v-if="flags(t)"> · {{ flags(t) }}</template></span>
          <span class="mini" aria-hidden="true">
            <i v-for="(ms, k) in t.stages" :key="k" :style="{ flexGrow: ms, background: `var(${colorOf(k)})` }"></i>
          </span>
        </li>
        <li v-if="!shown.length" class="empty">No kept traces match. Slow (≥ the slow-trace threshold), failed and sampled requests are kept for a week.</li>
      </ul>
    </div>

    <div class="detail">
      <template v-if="trace">
        <header>
          <h3><span class="m">{{ trace.method }}</span>{{ trace.route }}</h3>
          <span class="big">{{ fmtMs(trace.ms) }}</span>
        </header>
        <dl class="facts">
          <div><dt>Status</dt><dd>{{ trace.status }}</dd></div>
          <div><dt>When</dt><dd>{{ new Date(trace.ts).toLocaleString() }}</dd></div>
          <div><dt>Cache</dt><dd>{{ trace.cache }}</dd></div>
          <div><dt>Caller</dt><dd>{{ trace.profile || trace.origin || '—' }}</dd></div>
          <div><dt>Bytes in / out</dt><dd>{{ fmtBytes(trace.bytesIn) }} / {{ fmtBytes(trace.bytesOut) }}<template v-if="trace.bytesRaw > trace.bytesOut"> ({{ fmtBytes(trace.bytesRaw) }} raw, {{ trace.encoding }})</template></dd></div>
          <div><dt>In flight at start</dt><dd>{{ trace.inFlight }} · {{ trace.pendingWork }} queued work items</dd></div>
          <div v-if="trace.reason"><dt>Deny reason</dt><dd>{{ trace.reason }}</dd></div>
          <div><dt>Trace id</dt><dd class="mono">{{ trace.id }}</dd></div>
        </dl>
        <TelWaterfall :rows="rows" mode="trace" hide-zero label="Single request lifecycle" />
        <p v-if="!trace.client" class="note">No browser timing joined for this request (it didn't come from a page with client telemetry on, or its beacon hasn't arrived).</p>
      </template>
      <p v-else class="empty">Select a trace to see its full lifecycle.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import TelWaterfall from './TelWaterfall.vue';
import { STAGE_KEYS, STAGE_HELP, stageGroupOf, fmtBytes, fmtMs, type WaterfallRow } from '~/scripts/apiTelemetryShared';

const props = defineProps<{ list: any; trace: any; selectedId?: string }>();
defineEmits<{ select: [id: string] }>();

const q = ref('');
const minMs = ref<number | null>(null);
const errorsOnly = ref(false);

const shown = computed(() => ((props.list?.traces ?? []) as any[]).filter(t =>
  (!q.value || t.route.toLowerCase().includes(q.value.toLowerCase()))
  && (!minMs.value || t.ms >= minMs.value)
  && (!errorsOnly.value || t.status >= 500 || (t.flags & 4))));

const colorOf = (k: number) => stageGroupOf(STAGE_KEYS[k])?.color ?? '--tel-track';
const tone = (t: any) => t.status >= 500 ? 'bad' : t.ms >= 1000 ? 'warn' : '';
const time = (ts: number) => new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
function flags(t: any) {
  const out: string[] = [];
  if (t.flags & 4) out.push('client hung up');
  if (t.flags & 16) out.push('batch item');
  if (t.flags & 32) out.push('exception');
  if (t.flags & 64) out.push('304');
  if (t.client) out.push('+client');
  return out.join(' · ');
}

// Browser phases before and after the server's stages, so the whole round trip reads left to right.
const rows = computed<WaterfallRow[]>(() => {
  const t = props.trace;
  if (!t) return [];
  const out: WaterfallRow[] = [];
  const c = t.client;
  let offset = 0;
  if (c) {
    for (const [key, label] of [['blocked', 'Browser queue + preflight'], ['dns', 'DNS'], ['tcp', 'TCP connect'], ['tls', 'TLS']] as const) {
      out.push({ key: `c-${key}`, label, ms: c[key], start: offset, color: '--tel-s8', side: 'client', latency: true });
      offset += c[key];
    }
    // Half the network wait is attributed before the server and half after: the split
    // is unknowable from the client, the total is exact.
    out.push({ key: 'c-up', label: 'Network (to server)', ms: c.network / 2, start: offset, color: '--tel-s8', side: 'client', latency: true, help: 'Half of TTFB minus server time — the split is an estimate, the total is exact.' });
    offset += c.network / 2;
  }
  const serverStart = offset;
  for (const s of t.stages as any[]) {
    out.push({ key: s.key, label: s.label, ms: s.ms, start: serverStart + s.startMs, latency: s.latency, help: STAGE_HELP[s.key], color: stageGroupOf(s.key)?.color ?? '--tel-track', side: 'server' });
  }
  for (const sp of t.spans as any[]) {
    out.push({ key: `span-${sp.name}`, label: `↳ ${sp.name}`, ms: sp.ms, start: serverStart + sp.startMs, color: '--tel-s6', side: 'server', latency: true, help: 'Custom span (overlaps the stages above)' });
  }
  if (c) {
    const serverEnd = serverStart + (t.stages as any[]).filter(s => s.latency).reduce((a: number, s: any) => a + s.ms, 0);
    out.push({ key: 'c-down', label: 'Network (to browser)', ms: c.network / 2, start: serverEnd, color: '--tel-s8', side: 'client', latency: true });
    out.push({ key: 'c-dl', label: 'Download', ms: c.download, start: serverEnd + c.network / 2, color: '--tel-s8', side: 'client', latency: true });
  }
  return out;
});
</script>

<style scoped>
.tel-tr { display: grid; grid-template-columns: minmax(300px, 1fr) minmax(320px, 1.2fr); gap: 8px; }
@media (max-width: 900px) { .tel-tr { grid-template-columns: 1fr; } }
.list, .detail { background: var(--tel-surface); border: 1px solid var(--tel-line); border-radius: 8px; padding: 8px; min-width: 0; }
.filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 11px; color: var(--tel-text-2); margin-bottom: 6px; }
.filters input[type='search'], .filters input[type='number'] { background: var(--tel-inset); border: 1px solid var(--tel-line); border-radius: 5px; padding: 3px 6px; color: var(--tel-text); }
.filters input[type='search'] { flex: 1; min-width: 140px; }
.filters input[type='number'] { width: 70px; }
ul { max-height: 560px; overflow: auto; display: grid; gap: 1px; }
li[role='option'] { display: grid; grid-template-columns: 64px 1fr; grid-template-rows: auto auto auto; column-gap: 8px; padding: 4px 6px; border-radius: 5px; cursor: pointer; font-size: 11px; }
li[role='option']:hover, li[role='option']:focus-visible { background: var(--tel-hover); outline: none; }
li[aria-selected='true'] { background: var(--tel-selected); }
.ms { grid-row: span 3; font-weight: 600; color: var(--tel-text); align-self: center; text-align: right; }
.ms.bad { color: var(--tel-crit-text); }
.ms.warn { color: var(--tel-warn); }
.r { color: var(--tel-text); font-family: var(--kt-mono); font-size: 10.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.r b { color: var(--tel-muted); font-weight: 600; }
.meta { color: var(--tel-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mini { display: flex; gap: 1px; height: 4px; border-radius: 2px; overflow: hidden; margin-top: 2px; }
.mini i { min-width: 0; }
header { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; }
h3 { font-size: 13px; font-family: var(--kt-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.m { font-size: 10px; margin-right: 6px; color: var(--tel-muted); }
.big { font-size: 20px; font-weight: 600; }
.facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 4px 12px; margin-bottom: 10px !important; font-size: 11px; }
dt { color: var(--tel-muted); }
dd { color: var(--tel-text); overflow-wrap: anywhere; }
.mono { font-family: var(--kt-mono); font-size: 10.5px; }
.note, .empty { color: var(--tel-muted); font-size: 11px; margin-top: 8px !important; }
li.empty { padding: 10px; }
</style>
