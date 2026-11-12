<template>
  <LlmDialog :open="callId != null" :title="`Call #${callId ?? ''}`" :sub="sub" icon="list" :tone="tone" wide testid="llx-call-dialog" @close="$emit('close')">
    <div v-if="loading && !call" class="llx-empty">Reading the call…</div>
    <div v-else-if="error && !call" class="llx-banner" data-tone="crit"><LlmIcon name="octagon-x" />{{ error }}</div>
    <div v-else-if="call" class="llx-call">
      <div class="llx-chips">
        <span class="llx-chip llx-chip--dot" :data-tone="outcomeInfo(call.outcome).tone" data-testid="call-outcome">{{ outcomeInfo(call.outcome).label }}</span>
        <span class="llx-chip">{{ KINDS[call.kind] ?? call.kind }}</span>
        <span v-if="call.stream" class="llx-chip">streamed</span>
        <span v-for="f in call.flags ?? []" :key="f" class="llx-chip" data-tone="info">{{ FLAG_LABELS[f] ?? f }}</span>
      </div>
      <p v-if="call.error" class="llx-banner" :data-tone="call.outcome === 'cancelled' || call.outcome === 'blocked' ? 'info' : 'crit'"><LlmIcon name="alert" /><span class="llx-mono llx-wrap">{{ call.error }}</span></p>

      <!-- timeline -->
      <div class="llx-timeline" role="img" :aria-label="timelineText">
        <div class="llx-timeline__bar">
          <span v-if="call.queueMs" class="llx-timeline__seg" data-seg="queue" :style="{ width: segment(call.queueMs) }" :title="`Waiting for a slot: ${llmMs(call.queueMs)}`"></span>
          <span class="llx-timeline__seg" data-seg="provider" :style="{ width: segment(Math.max(0, (call.totalMs ?? 0) - (call.queueMs ?? 0))) }" :title="`At the router: ${llmMs(call.providerMs)}`"></span>
          <span v-if="call.ttftMs" class="llx-timeline__mark" :style="{ left: segment((call.queueMs ?? 0) + call.ttftMs) }" :title="`First token after ${llmMs(call.ttftMs)}`"></span>
        </div>
        <div class="llx-timeline__legend llx-num">
          <span data-seg="queue">queue {{ llmMs(call.queueMs ?? 0) }}</span>
          <span data-seg="provider">router {{ llmMs(call.providerMs) }}</span>
          <span v-if="call.ttftMs" data-seg="ttft">first token {{ llmMs(call.ttftMs) }}</span>
          <span>total <b>{{ llmMs(call.totalMs) }}</b></span>
        </div>
      </div>

      <div class="llx-grid-2">
        <dl class="llx-dl">
          <dt>Service › lane</dt><dd><button class="llx-link" @click="ui.openLane(`${call.service}/${call.lane}`); $emit('close')">{{ call.service }} › {{ call.laneLabel }}</button></dd>
          <template v-if="call.subject"><dt>Subject</dt><dd class="llx-mono">{{ call.subject }}</dd></template>
          <template v-if="call.operation"><dt>Operation</dt><dd>{{ call.operation }}</dd></template>
          <template v-if="call.session"><dt>Session</dt><dd><button class="llx-link llx-mono" @click="ui.openCalls({ session: call.session }); $emit('close')">{{ call.session }}</button>
            <span v-if="call.epoch != null" class="llx-dim"> · cache epoch {{ call.epoch }}, turn {{ call.epochTurn }}</span></dd></template>
          <template v-if="call.workClass"><dt>Work class</dt><dd>{{ call.workClass }}</dd></template>
          <dt>Router</dt><dd>{{ call.routerName ?? call.router }}<span v-if="call.fallbackFrom" class="llx-dim"> (fell back from {{ call.fallbackFrom }})</span><span v-if="call.provider" class="llx-dim"> · ran on {{ call.provider }}</span></dd>
          <dt>Model</dt><dd class="llx-mono">{{ call.model ?? '—' }}<span v-if="call.modelRequested && call.modelRequested !== call.model" class="llx-dim"> (asked for {{ call.modelRequested }})</span></dd>
          <template v-if="call.finishReason"><dt>Finish</dt><dd>{{ call.finishReason }}</dd></template>
          <template v-if="call.httpStatus"><dt>HTTP status</dt><dd class="llx-num">{{ call.httpStatus }}</dd></template>
          <dt>Started</dt><dd class="llx-num">{{ new Date(call.startedMs).toLocaleString() }}</dd>
          <template v-if="call.revision"><dt>Routing</dt><dd class="llx-num">revision {{ call.revision }}</dd></template>
        </dl>
        <dl class="llx-dl">
          <dt>Prompt</dt><dd class="llx-num">{{ llmInt(call.promptTokens) }} tokens
            <span v-if="call.cacheMetrics !== false" class="llx-dim">· {{ llmInt(call.cachedTokens) }} cached ({{ llmPct(call.promptTokens ? (call.cachedTokens / call.promptTokens) * 100 : 0) }})<template v-if="call.cacheWriteTokens"> · {{ llmInt(call.cacheWriteTokens) }} written</template></span>
            <span v-else class="llx-dim">· the router reports no cache split</span></dd>
          <dt>Completion</dt><dd class="llx-num">{{ llmInt(call.completionTokens) }} tokens<span v-if="call.reasoningTokens" class="llx-dim"> · {{ llmInt(call.reasoningTokens) }} reasoning</span></dd>
          <template v-if="call.toolCalls"><dt>Tool calls</dt><dd class="llx-num">{{ call.toolCalls }}</dd></template>
          <template v-if="call.requestBytes"><dt>Request size</dt><dd class="llx-num">{{ llmBytes(call.requestBytes) }}</dd></template>
          <dt>Cost</dt><dd class="llx-num">{{ costText }}</dd>
          <template v-if="call.listCostUsd"><dt>List price</dt><dd class="llx-num">{{ llmUsd(call.listCostUsd, true) }}</dd></template>
          <dt>Billing</dt><dd>{{ BILLING_LABELS[call.billing] ?? call.billing ?? '—' }}</dd>
        </dl>
      </div>

      <template v-if="call.attemptLog?.length">
        <h4 class="llx-subhead">Attempts</h4>
        <table class="llx-table">
          <thead><tr><th class="l">#</th><th class="l">Router</th><th class="l">Outcome</th><th>Status</th><th>Queue</th><th>At the router</th><th>Retry after</th></tr></thead>
          <tbody>
            <tr v-for="(a, i) in call.attemptLog" :key="i">
              <td class="l llx-num">{{ i + 1 }}</td>
              <td class="l">{{ a.router }}</td>
              <td class="l"><span class="llx-chip llx-chip--dot" :data-tone="outcomeInfo(a.outcome).tone">{{ outcomeInfo(a.outcome).label }}</span></td>
              <td class="llx-num">{{ a.status || '—' }}</td>
              <td class="llx-num">{{ llmMs(a.queueMs) }}</td>
              <td class="llx-num">{{ llmMs(a.providerMs) }}</td>
              <td class="llx-num">{{ a.retryAfterMs ? llmMs(a.retryAfterMs) : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </template>

      <!-- kept text -->
      <template v-if="call.textKept">
        <h4 class="llx-subhead">Kept text</h4>
        <p v-if="!canReadText" class="llx-dim"><LlmIcon name="lock" /> Text was kept for this call; reading it needs the kept-text permission.</p>
        <button v-else-if="!text && !textLoading" class="llx-btn llx-btn--sm" data-testid="call-show-text" @click="loadText"><LlmIcon name="eye" />Show the prompt and reply</button>
        <div v-else-if="textLoading" class="llx-empty">Reading…</div>
        <div v-else-if="text" class="llx-kept" data-testid="call-text">
          <p class="llx-dim">Kept {{ llmClock(text.keptAt) }}. Reading it was logged.</p>
          <div v-for="(m, i) in messages" :key="i" class="llx-kept__msg" :data-role="m.role">
            <span class="llx-kept__role">{{ m.role }}</span>
            <pre class="llx-pre">{{ m.text }}</pre>
          </div>
          <template v-if="!messages.length"><h5>Request</h5><pre class="llx-pre">{{ pretty(text.request) }}</pre></template>
          <h5>Reply</h5>
          <pre class="llx-pre" data-testid="call-reply">{{ pretty(text.response) }}</pre>
          <button class="llx-btn llx-btn--xs" @click="copy(pretty(text.response))"><LlmIcon name="copy" />Copy the reply</button>
        </div>
      </template>
    </div>
    <template #actions>
      <button class="llx-btn" data-autofocus @click="$emit('close')">Close</button>
    </template>
  </LlmDialog>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import type { KliveLlmConsole, LlmUi } from '~/composables/useKliveLlm';
import { BILLING_LABELS, llmBytes, llmClock, llmInt, llmMs, llmPct, llmUsd, outcomeInfo } from '~/scripts/kliveLlm';

const props = defineProps<{ callId: number | null }>();
defineEmits<{ close: [] }>();
const c = inject<KliveLlmConsole>('llx')!;
const ui = inject<LlmUi>('llxUi')!;

const KINDS: Record<string, string> = { chat: 'Chat', tool: 'Tool session', warm: 'Prefix warm-up', stt: 'Speech to text', tts: 'Text to speech', local: 'Local model' };
const FLAG_LABELS: Record<string, string> = {
  Compacted: 'compacted', ColdStart: 'cold start', Redirected: 'model redirected', Pinned: 'pinned model', Fallback: 'fallback', Truncated: 'cut off at the cap',
  Stalled: 'stalled', ContentKept: 'text kept', Imported: 'imported from Projects', Estimated: 'tokens estimated',
};

const call = ref<any | null>(null);
const canReadText = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);
const text = ref<any | null>(null);
const textLoading = ref(false);

watch(() => props.callId, async id => {
  call.value = null; text.value = null; error.value = null;
  if (id == null) return;
  loading.value = true;
  try {
    const body = await c.get(`/klivellm/call?id=${id}`);
    if (props.callId !== id) return;
    call.value = body?.call ?? null;
    canReadText.value = !!body?.canReadText;
  } catch (e: any) {
    error.value = e?.message ?? 'The call did not come back.';
  } finally { loading.value = false; }
}, { immediate: true });

async function loadText() {
  if (props.callId == null) return;
  textLoading.value = true;
  try { text.value = await c.get(`/klivellm/call/content?id=${props.callId}`); }
  catch (e: any) { c.notify('crit', e?.message ?? 'The text did not come back.'); }
  finally { textLoading.value = false; }
}

const sub = computed(() => (call.value ? `${call.value.service} › ${call.value.laneLabel} · ${new Date(call.value.endedMs).toLocaleString()}` : ''));
const tone = computed(() => outcomeInfo(call.value?.outcome).tone);
const span = computed(() => Math.max(1, Number(call.value?.totalMs ?? 0)));
const segment = (ms: number) => `${Math.min(100, Math.max(0, (ms / span.value) * 100))}%`;
const timelineText = computed(() => (call.value ? `Queue ${llmMs(call.value.queueMs ?? 0)}, router ${llmMs(call.value.providerMs)}, total ${llmMs(call.value.totalMs)}` : ''));
const costText = computed(() => {
  const x = call.value;
  if (!x) return '—';
  // Flat-fee and free routers charge nothing per call; the list price beside says what it would have cost.
  if (x.billing && x.billing !== 'PerToken' && !x.costUsd) return `nothing per token (${(BILLING_LABELS[x.billing] ?? x.billing).toLowerCase()})`;
  const parts: string[] = [];
  if (typeof x.costUsd === 'number') parts.push(`${llmUsd(x.costUsd, true)} reported`);
  if (typeof x.upstreamCostUsd === 'number' && x.upstreamCostUsd !== x.costUsd) parts.push(`${llmUsd(x.upstreamCostUsd, true)} upstream`);
  if (typeof x.estCostUsd === 'number' && x.estCostUsd !== x.costUsd) parts.push(`${llmUsd(x.estCostUsd, true)} ${x.costUsd == null ? 'from the price book' : 'counted'}`);
  return parts.length ? parts.join(' · ') : x.billing === 'PerToken' ? 'not reported, and no price for this model' : 'nothing per token';
});

function parse(value: unknown): any {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}
const pretty = (value: unknown) => {
  const v = parse(value);
  return typeof v === 'string' ? v : JSON.stringify(v, null, 2);
};
/** The request's messages as role + text, when the kept request is a chat payload. */
const messages = computed(() => {
  const req = parse(text.value?.request);
  const list: any[] = Array.isArray(req?.messages) ? req.messages : [];
  return list.map(m => ({
    role: m.role ?? '?',
    text: typeof m.content === 'string' ? m.content
      : Array.isArray(m.content) ? m.content.map((p: any) => (p?.type === 'text' ? p.text : `[${p?.type ?? 'part'}]`)).join('\n')
      : m.tool_calls ? JSON.stringify(m.tool_calls, null, 2) : JSON.stringify(m.content ?? '', null, 2),
  }));
});
async function copy(value: string) {
  try { await navigator.clipboard.writeText(value); c.notify('ok', 'Copied.'); } catch { c.notify('warn', 'The browser would not copy it.'); }
}
</script>
