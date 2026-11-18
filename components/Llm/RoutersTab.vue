<template>
  <div class="llx-stack" data-testid="llx-routers">
    <!-- AIRouter's shared envelope -->
    <section v-if="air" class="llx-card" data-testid="airouter-envelope">
      <header class="llx-card__head">
        <h2 class="llx-card__title"><LlmIcon name="gauge" />AIRouter envelope</h2>
        <span class="llx-card__meta">One key, shared by every service on AIRouter: its slots, windows and cache, right now</span>
      </header>
      <div class="llx-gauges">
        <div class="llx-gauge"><span class="llx-gauge__label">Slots busy</span><span class="llx-gauge__value llx-num">{{ air.inFlight }}/{{ air.maxParallel }}</span>
          <span class="llx-meter" :data-tone="air.inFlight >= air.maxParallel ? 'warn' : 'ok'"><span :style="{ width: pct(air.inFlight, air.maxParallel) }"></span></span></div>
        <div class="llx-gauge"><span class="llx-gauge__label">Waiting for a slot</span><span class="llx-gauge__value llx-num">{{ air.waiting }}</span>
          <span class="llx-dim">longest wait {{ llmMs(air.maxWaitedMs) }}</span></div>
        <div class="llx-gauge"><span class="llx-gauge__label">Requests in window</span><span class="llx-gauge__value llx-num">{{ llmInt(air.requestsInWindow) }}<small v-if="air.requestCeiling"> / {{ llmInt(air.requestCeiling) }}</small></span>
          <span v-if="air.requestCeiling" class="llx-meter" :data-tone="air.requestsInWindow / air.requestCeiling > 0.85 ? 'warn' : 'ok'"><span :style="{ width: pct(air.requestsInWindow, air.requestCeiling) }"></span></span></div>
        <div class="llx-gauge"><span class="llx-gauge__label">Tokens in window</span><span class="llx-gauge__value llx-num">{{ llmCompact(air.tokensInWindow) }}<small v-if="air.tokenCeiling"> / {{ llmCompact(air.tokenCeiling) }}</small></span>
          <span v-if="air.tokenCeiling" class="llx-meter" :data-tone="air.tokensInWindow / air.tokenCeiling > 0.85 ? 'warn' : 'ok'"><span :style="{ width: pct(air.tokensInWindow, air.tokenCeiling) }"></span></span></div>
        <div class="llx-gauge"><span class="llx-gauge__label">Cool-off</span><span class="llx-gauge__value llx-num" :data-tone="air.coolOffSeconds > 0 ? 'warn' : undefined">{{ air.coolOffSeconds > 0 ? `${Math.round(air.coolOffSeconds)} s` : 'none' }}</span>
          <span class="llx-dim">{{ llmInt(air.totalPenalties) }} since start</span></div>
        <div class="llx-gauge"><span class="llx-gauge__label">Cache hit, last hour</span><span class="llx-gauge__value llx-num">{{ llmPct(air.cacheHitPct1h) }}</span>
          <span class="llx-dim">{{ llmInt(air.cacheRequests1h) }} requests</span></div>
        <div class="llx-gauge"><span class="llx-gauge__label">Warm cohort</span><span class="llx-gauge__value llx-num">{{ air.warmCohort }}</span>
          <span class="llx-dim">{{ air.residents }} resident · {{ air.trackedConversations }} tracked</span></div>
        <div class="llx-gauge"><span class="llx-gauge__label">Prefix lifetime</span><span class="llx-gauge__value llx-num">{{ air.prefixLifetimeSeconds ? llmDuration(air.prefixLifetimeSeconds) : '—' }}</span>
          <span class="llx-dim">measured; budget {{ air.conversationBudget || '—' }} conversations</span></div>
      </div>
    </section>

    <section class="llx-card">
      <header class="llx-card__head">
        <h2 class="llx-card__title"><LlmIcon name="server" />Routers</h2>
        <span class="llx-card__meta">{{ list.length }} known · default route {{ defaultName }}</span>
        <div class="llx-card__tools">
          <button v-if="c.allowed.value.routers" class="llx-btn llx-btn--sm llx-btn--primary" data-testid="router-add" @click="edit(null)"><LlmIcon name="plus" />Add a router</button>
        </div>
      </header>

      <div class="llx-routers">
        <article v-for="r in list" :key="r.id" class="llx-router" :data-state="r.enabled ? r.live?.state ?? 'nodata' : 'off'" :data-flash="ui.target.value === r.id || undefined" :data-testid="`router-${r.id}`">
          <header class="llx-router__head">
            <span class="llx-router__state" :data-tone="stateTone(r)" :title="stateText(r)"></span>
            <button class="llx-router__name llx-truncate" @click="ui.openRouter(r.id)">{{ r.name }}</button>
            <span class="llx-chip llx-chip--xs" :data-tone="r.billing === 'PerToken' ? 'warn' : r.billing === 'Flat' ? 'info' : 'ok'">{{ BILLING_LABELS[r.billing] ?? r.billing }}<template v-if="r.billing === 'Flat' && r.monthlyFeeUsd"> · {{ llmUsd(r.monthlyFeeUsd) }}/mo</template></span>
            <span v-if="!r.enabled" class="llx-chip llx-chip--xs" data-tone="neutral">off</span>
            <span v-else-if="!r.keySet" class="llx-chip llx-chip--xs" data-tone="crit">no key</span>
            <span v-if="r.id === defaultId" class="llx-chip llx-chip--xs" data-tone="info">default</span>
          </header>
          <div class="llx-router__sub llx-mono llx-truncate" :title="r.endpoint ?? r.baseUrl">{{ r.endpoint ?? r.baseUrl ?? (r.id === 'local' ? 'in-process model' : '—') }}</div>
          <div class="llx-router__sub llx-dim llx-truncate">default model <span class="llx-mono">{{ r.defaultModel ?? '—' }}</span></div>
          <p v-if="r.configError" class="llx-router__error"><LlmIcon name="alert" />{{ r.configError }}</p>

          <LlmUptimeStrip v-if="r.live?.recentStates?.length" :states="r.live.recentStates" :height="14" />
          <div v-else class="llx-strip llx-strip--empty llx-dim">no minutes recorded yet</div>

          <dl class="llx-router__facts">
            <div><dt>Availability</dt><dd class="llx-num">{{ llmPct(r.uptime?.h24?.availabilityPct, 2) }} <span class="llx-dim">24 h</span> · {{ llmPct(r.uptime?.d7?.availabilityPct, 2) }} <span class="llx-dim">7 d</span></dd></div>
            <div><dt>Latency 24 h</dt><dd class="llx-num">{{ llmMs(r.latency24h?.p50) }} <span class="llx-dim">p50</span> · {{ llmMs(r.latency24h?.p95) }} <span class="llx-dim">p95</span> · {{ llmMs(r.latency24h?.p99) }} <span class="llx-dim">p99</span></dd></div>
            <div><dt>Traffic 24 h</dt><dd class="llx-num">{{ llmCompact(r.traffic24h?.calls) }} calls · {{ llmCompact(r.traffic24h?.tokens) }} tokens · {{ llmPct((r.traffic24h?.share ?? 0) * 100, 0) }} of calls</dd></div>
            <div v-if="gauge(r, 'creditRemainingUsd') != null"><dt>Credit</dt><dd class="llx-num" :data-tone="gauge(r, 'creditRemainingUsd')! < 5 ? 'warn' : undefined">{{ llmUsd(gauge(r, 'creditRemainingUsd')) }} left<template v-if="gauge(r, 'creditUsedUsd') != null"> · {{ llmUsd(gauge(r, 'creditUsedUsd')) }} used</template></dd></div>
            <div v-if="gauge(r, 'inFlight') != null"><dt>Now</dt><dd class="llx-num">{{ gauge(r, 'inFlight') }} in flight<template v-if="gauge(r, 'queued')"> · {{ gauge(r, 'queued') }} queued</template></dd></div>
            <div><dt>Last probe</dt><dd>{{ probeText(r) }}</dd></div>
            <div v-if="r.live?.lastFailure"><dt>Last failure</dt><dd class="llx-truncate" :title="r.live.lastFailure">{{ llmAgo(r.live.lastFailureUtc, c.now.value) }} · {{ r.live.lastFailure }}</dd></div>
            <div v-if="r.circuits?.length"><dt>Skipped by</dt><dd>{{ r.circuits.map((x: any) => x.lane.replace('/', ' › ')).join(', ') }}</dd></div>
          </dl>

          <div v-if="tests[r.id]" class="llx-router__test" :data-tone="tests[r.id].ok ? 'ok' : 'crit'" data-testid="router-test-result">
            <LlmIcon :name="tests[r.id].ok ? 'check-circle' : 'octagon-x'" />
            <span v-if="tests[r.id].ok">{{ tests[r.id].stage === 'completion' ? `Answered “${tests[r.id].reply?.content ?? ''}” with ${tests[r.id].reply?.model ?? 'its model'}` : `Reachable${tests[r.id].reply?.models ? `, ${tests[r.id].reply.models} models` : ''}` }} in {{ llmMs(tests[r.id].ms) }}</span>
            <span v-else>{{ tests[r.id].stage }} failed{{ tests[r.id].status ? ` (HTTP ${tests[r.id].status})` : '' }}: {{ tests[r.id].error }}</span>
          </div>

          <footer class="llx-router__tools">
            <button class="llx-btn llx-btn--xs" @click="ui.openRouter(r.id)"><LlmIcon name="eye" />Details</button>
            <template v-if="c.allowed.value.routers">
              <button class="llx-btn llx-btn--xs" :disabled="c.busy.value['router-test'] || r.id === 'local'" :data-testid="`router-test-${r.id}`" @click="test(r, false)"><LlmIcon name="flask" />Test</button>
              <button class="llx-btn llx-btn--xs" :disabled="c.busy.value['router-test'] || r.id === 'local' || !r.keySet" title="One real request with a one-token answer" @click="test(r, true)">Test a reply</button>
              <button class="llx-btn llx-btn--xs" @click="edit(r)"><LlmIcon name="edit" />Edit</button>
              <button v-if="r.id !== 'local'" class="llx-btn llx-btn--xs" :data-testid="`router-key-${r.id}`" @click="keyFor = r"><LlmIcon name="key" />{{ r.keySet ? 'Replace key' : 'Set key' }}</button>
              <button class="llx-btn llx-btn--xs llx-btn--ghost" @click="toggleEnabled(r)">{{ r.enabled ? 'Switch off' : 'Switch on' }}</button>
              <button v-if="!r.builtIn" class="llx-btn llx-btn--xs llx-btn--danger" @click="remove(r)"><LlmIcon name="trash" />Remove</button>
            </template>
          </footer>
        </article>
        <div v-if="!list.length" class="llx-empty">{{ c.errors.value.routers ?? 'Reading the routers…' }}</div>
      </div>
      <p class="llx-note">
        Availability counts every attempt any service makes, plus a light probe a minute (no tokens spent). A minute is down when half its attempts failed on the router’s side,
        degraded when any did or it refused (rate limit, key, credit); a bad request of our own never counts against a router.
      </p>
    </section>

    <LlmRouterDialog :open="editing !== undefined" :router="editing ?? null" @close="editing = undefined" @saved="id => (ui.target.value = id)" />

    <LlmDialog :open="!!keyFor" :title="`Key for ${keyFor?.name ?? ''}`" sub="Stored as a sensitive OmniSetting. It is never shown or sent back; the page only learns whether one is set." icon="key" testid="llx-key-dialog" @close="keyFor = null">
      <label class="llx-field llx-field--wide"><span>New key</span>
        <input v-model="keyText" class="llx-input llx-mono" type="password" autocomplete="new-password" spellcheck="false" placeholder="paste the key" data-autofocus data-testid="key-input" @keydown.enter.prevent="saveKey" /></label>
      <p v-if="keyFor?.keySetting" class="llx-note">Setting: <span class="llx-mono">{{ keyFor.keySetting }}</span></p>
      <template #actions>
        <button class="llx-btn" @click="keyFor = null">Cancel</button>
        <button v-if="keyFor?.keySet" class="llx-btn llx-btn--danger" @click="clearKey">Remove the key</button>
        <button class="llx-btn llx-btn--primary" :disabled="!keyText.trim() || c.busy.value['router-key']" data-testid="key-save" @click="saveKey">Save key</button>
      </template>
    </LlmDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, reactive, ref, watch } from 'vue';
import type { KliveLlmConsole, LlmUi } from '~/composables/useKliveLlm';
import { BILLING_LABELS, STATE_TONES, llmAgo, llmCompact, llmDuration, llmInt, llmMs, llmPct, llmUsd } from '~/scripts/kliveLlm';

const c = inject<KliveLlmConsole>('llx')!;
const ui = inject<LlmUi>('llxUi')!;

const list = computed<any[]>(() => c.routers.value?.routers ?? []);
const defaultId = computed(() => c.routers.value?.defaultRouter);
const defaultName = computed(() => list.value.find(r => r.id === defaultId.value)?.name ?? defaultId.value ?? '—');
const air = computed(() => (list.value.some(r => r.id === 'airouter') ? c.live.value?.airouter ?? null : null));
const pct = (a: number, b: number) => `${Math.min(100, b > 0 ? (a / b) * 100 : 0)}%`;
const gauge = (r: any, name: string): number | null => {
  const v = r.live?.gauges?.[name];
  return typeof v === 'number' ? v : null;
};

const stateTone = (r: any) => (!r.enabled ? 'neutral' : STATE_TONES[r.live?.state ?? 'nodata'] ?? 'neutral');
const stateText = (r: any) => (!r.enabled ? 'Switched off' : ({ up: 'Up', degraded: 'Degraded', down: 'Down', nodata: 'No data this minute' } as Record<string, string>)[r.live?.state ?? 'nodata']);
function probeText(r: any) {
  const l = r.live;
  if (!l?.lastProbeUtc) return r.id === 'local' ? 'not probed (in-process)' : 'not probed yet';
  return `${l.lastProbeOk ? 'ok' : 'failed'} ${llmAgo(l.lastProbeUtc, c.now.value)}${l.lastProbeMs != null ? ` · ${llmMs(l.lastProbeMs)}` : ''}${!l.lastProbeOk && l.lastProbeError ? ` · ${l.lastProbeError}` : ''}`;
}

// ── editing ──
const editing = ref<any | null | undefined>(undefined);
const edit = (r: any | null) => { editing.value = r; };

const tests = reactive<Record<string, any>>({});
async function test(r: any, completion: boolean) {
  if (completion && r.billing === 'PerToken' && !(await ui.confirm({
    title: `Send a real request to ${r.name}?`, body: 'One request with a one-word prompt and a one-token answer: it costs a fraction of a cent, and is recorded in the ledger as KliveLLM › router-test.', confirm: 'Send it',
  }))) return;
  const result = await c.testRouter(r.id, completion);
  if (result) tests[r.id] = result;
}

async function toggleEnabled(r: any) {
  if (r.enabled) {
    const users = (c.routing.value?.lanes ?? []).filter((l: any) => l.effective?.router === r.id).map((l: any) => `${l.service} › ${l.label}`);
    if (!(await ui.confirm({
      title: `Switch ${r.name} off?`,
      body: users.length ? `${users.length} lane${users.length === 1 ? '' : 's'} route to it now (${users.slice(0, 4).join(', ')}${users.length > 4 ? '…' : ''}); their calls fall to their fallbacks, or are refused.` : 'No lane routes to it now.',
      confirm: 'Switch off', danger: users.length > 0,
    }))) return;
  }
  await c.saveRouter({ ...r, enabled: !r.enabled });
}

async function remove(r: any) {
  if (!(await ui.confirm({ title: `Remove ${r.name}?`, body: 'Its definition and its key are deleted. A router that any route or fallback still names cannot be removed: route those elsewhere first.', confirm: 'Remove', danger: true }))) return;
  await c.deleteRouter(r.id);
}

// ── keys ──
const keyFor = ref<any | null>(null);
const keyText = ref('');
watch(keyFor, () => { keyText.value = ''; });
async function saveKey() {
  if (!keyFor.value || !keyText.value.trim()) return;
  const id = keyFor.value.id;
  const result = await c.setRouterKey(id, keyText.value.trim());
  keyText.value = '';
  if (result) keyFor.value = null;
}
async function clearKey() {
  if (!keyFor.value) return;
  if (!(await ui.confirm({ title: `Remove ${keyFor.value.name}'s key?`, body: 'Calls routed to it fail before they are sent until a key is set again.', confirm: 'Remove key', danger: true }))) return;
  const result = await c.setRouterKey(keyFor.value.id, '');
  if (result) keyFor.value = null;
}
</script>
