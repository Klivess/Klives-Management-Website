<template>
  <li
    class="dmx-row"
    tabindex="0"
    :data-steward-id="p.stewardID"
    :data-active="active || undefined"
    :data-attention="attention || undefined"
    :aria-label="`${p.name || 'Untitled Steward'}: ${state.label}`"
    @click="$emit('peek', p.stewardID)"
    @keydown.enter.prevent="$emit('go', p.stewardID)"
    @keydown.space.prevent="$emit('peek', p.stewardID)"
  >
    <div class="dmx-row__name">
      <NuxtLink class="dmx-row__title" :to="`/demiurge/${p.stewardID}`" :title="p.name" @click.stop>{{ p.name || '(untitled)' }}</NuxtLink>
      <div class="dmx-row__state">
        <span class="dmx-chip" :data-tone="state.tone" :data-live="state.live || undefined"><span class="dmx-chip__dot"></span>{{ state.label }}</span>
        <span v-if="p.pendingApprovals" class="dmx-chip" data-tone="need" :title="`${p.pendingApprovals} approval(s) waiting for you`"><DemiurgeIcon name="inbox" />{{ p.pendingApprovals }}</span>
        <span v-if="p.blocker && p.status !== 'Blocked'" class="dmx-chip" data-tone="fault" :title="p.blocker"><DemiurgeIcon name="alert" />Blocker</span>
      </div>
    </div>

    <div class="dmx-row__work">
      <span class="dmx-row__work-text" :title="p.currentWork">{{ shelved ? 'Shelved' : p.currentWork || 'No current step' }}</span>
      <span class="dmx-row__work-meta">
        <template v-if="p.workingAgents"><span data-tone="work">● {{ p.workingAgents }} {{ p.workingAgents === 1 ? 'agent' : 'agents' }} · {{ p.activityPhase || 'working' }}</span></template>
        <template v-else-if="p.nextRetryAt">retries {{ retryText }}</template>
        <template v-else>{{ p.currentWorkSource || 'Step' }}<template v-if="p.currentWorkAt"> · {{ ageShort(p.currentWorkAt, now) }} ago</template></template>
      </span>
    </div>

    <div class="dmx-row__result" :title="p.result?.rationale || ''">
      <div class="dmx-row__result-copy">
        <span class="dmx-row__result-name">{{ resultName }}</span>
        <span class="dmx-row__result-value">
          {{ loadingHistory ? '…' : resultValue(p.result) }}<small v-if="p.result?.delta != null && p.result.delta !== 0" :style="{ color: `var(--dmx-${deltaToneVar})` }">{{ p.result.delta > 0 ? '+' : '' }}{{ Number(p.result.delta).toLocaleString(undefined, { maximumFractionDigits: 2 }) }}</small>
        </span>
      </div>
      <DemiurgeSpark v-if="resultSeries.length > 1" :values="resultSeries" :tone="resultTone(p.result) === 'rest' ? 'accent' : resultTone(p.result)" :label="`${resultName} trend`" />
    </div>

    <div class="dmx-row__strip">
      <template v-if="!loadingHistory">
        <DemiurgeOutcomes :series="p.series" :max-bins="24" :label="`${p.name} wake outcomes`" />
        <small>{{ wakes }} {{ wakes === 1 ? 'wake' : 'wakes' }}</small>
      </template>
      <small v-else>building…</small>
    </div>

    <div class="dmx-row__spend r">
      <b>{{ loadingHistory ? '…' : dmUsd(spendInRange(p)) }}</b>
      <div v-if="pct != null" class="dmx-meter" :data-tone="pct >= 100 ? 'fault' : pct >= 80 ? 'need' : undefined" style="width: 84px" :title="`Model budget ${dmUsd(p.tokenSpendUsd)} of ${dmUsd(p.tokenBudgetUsd)}`">
        <span class="dmx-meter__fill" :style="{ width: `${pct}%` }"></span>
      </div>
      <small>{{ dmUsd(p.tokenSpendUsd) }} {{ isUnlimited(p.tokenBudgetUsd) ? 'lifetime · no cap' : `of ${dmUsd(p.tokenBudgetUsd)}` }}</small>
    </div>

    <div class="dmx-row__acts r" @click.stop>
      <button v-if="shelved" class="dmx-btn dmx-btn--xs" :disabled="busy || !canManage" @click="$emit('unshelve', p.stewardID)"><DemiurgeIcon name="unarchive" />Unshelve</button>
      <template v-else-if="canManage">
        <button v-if="runnable" class="dmx-iconbtn dmx-iconbtn--sm" :disabled="busy" :title="`Pause ${p.name}`" :aria-label="`Pause ${p.name}`" @click="$emit('pause', p.stewardID)"><DemiurgeIcon name="pause" /></button>
        <button v-else-if="resumable" class="dmx-iconbtn dmx-iconbtn--sm" :disabled="busy" :title="p.status === 'Blocked' ? `Unblock ${p.name}` : `Resume ${p.name}`" :aria-label="`Resume ${p.name}`" @click="$emit('resume', p.stewardID)"><DemiurgeIcon name="play" /></button>
      </template>
      <NuxtLink class="dmx-iconbtn dmx-iconbtn--sm" :to="`/demiurge/${p.stewardID}?tab=conversation`" :title="`Chat with ${p.name}`" :aria-label="`Chat with ${p.name}`"><DemiurgeIcon name="message" /></NuxtLink>
      <NuxtLink class="dmx-iconbtn dmx-iconbtn--sm" :to="`/demiurge/${p.stewardID}`" :title="`Open ${p.name}`" :aria-label="`Open ${p.name}`"><DemiurgeIcon name="arrow-right" /></NuxtLink>
    </div>
  </li>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { OverviewSteward } from '~/composables/useDemiurgeOverview';
import { ageShort, budgetPct, isRunnable, isUnlimited, needsYou, outcomeTotals, dmUsd, stewardState, resultTone, resultValue, spendInRange } from '~/scripts/demiurgeConsole';
import DemiurgeIcon from '~/components/Demiurge/Icon.vue';
import DemiurgeSpark from '~/components/Demiurge/Spark.vue';
import DemiurgeOutcomes from '~/components/Demiurge/Outcomes.vue';

const props = defineProps<{ p: OverviewSteward; now: number; active?: boolean; busy?: boolean; canManage?: boolean }>();
defineEmits<{
  (e: 'peek', id: string): void; (e: 'go', id: string): void;
  (e: 'pause', id: string): void; (e: 'resume', id: string): void; (e: 'unshelve', id: string): void;
}>();

const state = computed(() => stewardState(props.p));
const shelved = computed(() => props.p.status === 'Archived');
const attention = computed(() => !shelved.value && needsYou(props.p));
const runnable = computed(() => isRunnable(props.p) && !props.p.halted);
const resumable = computed(() => ['Paused', 'Blocked'].includes(props.p.status) || props.p.halted);
const loadingHistory = computed(() => props.p.historicalReady === false);
const pct = computed(() => budgetPct(props.p.tokenSpendUsd, props.p.tokenBudgetUsd));
const wakes = computed(() => { const t = outcomeTotals(props.p.series); return t.completed + t.failed + t.deferred + t.cancelled; });
const resultName = computed(() => {
  const r = props.p.result;
  if (!r) return 'Result';
  if (r.value == null) return `${r.name || 'Result'} · no reading`;
  return r.stale ? `${r.name} · stale` : r.name;
});
const resultSeries = computed(() => (props.p.result?.history ?? []).map(h => Number(h.value)).filter(Number.isFinite));
const deltaToneVar = computed(() => ({ work: 'work', fault: 'fault' } as Record<string, string>)[resultTone(props.p.result)] ?? 'ink-3');
const retryText = computed(() => {
  const t = props.p.nextRetryAt ? Date.parse(props.p.nextRetryAt) : NaN;
  if (Number.isNaN(t)) return 'soon';
  const m = Math.round((t - props.now) / 60000);
  return m <= 0 ? 'any moment' : m < 60 ? `in ${m}m` : `in ${Math.round(m / 60)}h`;
});
</script>
