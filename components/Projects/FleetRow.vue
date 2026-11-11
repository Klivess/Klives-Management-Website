<template>
  <li
    class="pjx-row"
    tabindex="0"
    :data-project-id="p.projectID"
    :data-active="active || undefined"
    :data-attention="attention || undefined"
    :aria-label="`${p.name || 'Untitled project'}: ${state.label}`"
    @click="$emit('peek', p.projectID)"
    @keydown.enter.prevent="$emit('go', p.projectID)"
    @keydown.space.prevent="$emit('peek', p.projectID)"
  >
    <div class="pjx-row__name">
      <NuxtLink class="pjx-row__title" :to="`/projects/${p.projectID}`" :title="p.name" @click.stop>{{ p.name || '(untitled)' }}</NuxtLink>
      <div class="pjx-row__state">
        <span class="pjx-chip" :data-tone="state.tone" :data-live="state.live || undefined"><span class="pjx-chip__dot"></span>{{ state.label }}</span>
        <span v-if="p.pendingApprovals" class="pjx-chip" data-tone="need" :title="`${p.pendingApprovals} approval(s) waiting for you`"><ProjectsIcon name="inbox" />{{ p.pendingApprovals }}</span>
        <span v-if="p.blocker && p.status !== 'Blocked'" class="pjx-chip" data-tone="fault" :title="p.blocker"><ProjectsIcon name="alert" />Blocker</span>
      </div>
    </div>

    <div class="pjx-row__work">
      <span class="pjx-row__work-text" :title="p.currentWork">{{ shelved ? 'Shelved' : p.currentWork || 'No current step' }}</span>
      <span class="pjx-row__work-meta">
        <template v-if="p.workingAgents"><span data-tone="work">● {{ p.workingAgents }} {{ p.workingAgents === 1 ? 'agent' : 'agents' }} · {{ p.activityPhase || 'working' }}</span></template>
        <template v-else-if="p.nextRetryAt">retries {{ retryText }}</template>
        <template v-else>{{ p.currentWorkSource || 'Step' }}<template v-if="p.currentWorkAt"> · {{ ageShort(p.currentWorkAt, now) }} ago</template></template>
      </span>
    </div>

    <div class="pjx-row__result" :title="p.result?.rationale || ''">
      <div class="pjx-row__result-copy">
        <span class="pjx-row__result-name">{{ resultName }}</span>
        <span class="pjx-row__result-value">
          {{ loadingHistory ? '…' : resultValue(p.result) }}<small v-if="p.result?.delta != null && p.result.delta !== 0" :style="{ color: `var(--pjx-${deltaToneVar})` }">{{ p.result.delta > 0 ? '+' : '' }}{{ Number(p.result.delta).toLocaleString(undefined, { maximumFractionDigits: 2 }) }}</small>
        </span>
      </div>
      <ProjectsSpark v-if="resultSeries.length > 1" :values="resultSeries" :tone="resultTone(p.result) === 'rest' ? 'accent' : resultTone(p.result)" :label="`${resultName} trend`" />
    </div>

    <div class="pjx-row__strip">
      <template v-if="!loadingHistory">
        <ProjectsOutcomes :series="p.series" :max-bins="24" :label="`${p.name} wake outcomes`" />
        <small>{{ wakes }} {{ wakes === 1 ? 'wake' : 'wakes' }}</small>
      </template>
      <small v-else>building…</small>
    </div>

    <div class="pjx-row__spend r">
      <b>{{ loadingHistory ? '…' : pjUsd(spendInRange(p)) }}</b>
      <div v-if="pct != null" class="pjx-meter" :data-tone="pct >= 100 ? 'fault' : pct >= 80 ? 'need' : undefined" style="width: 84px" :title="`Model budget ${pjUsd(p.tokenSpendUsd)} of ${pjUsd(p.tokenBudgetUsd)}`">
        <span class="pjx-meter__fill" :style="{ width: `${pct}%` }"></span>
      </div>
      <small>{{ pjUsd(p.tokenSpendUsd) }} {{ isUnlimited(p.tokenBudgetUsd) ? 'lifetime · no cap' : `of ${pjUsd(p.tokenBudgetUsd)}` }}</small>
    </div>

    <div class="pjx-row__acts r" @click.stop>
      <button v-if="shelved" class="pjx-btn pjx-btn--xs" :disabled="busy || !canManage" @click="$emit('unshelve', p.projectID)"><ProjectsIcon name="unarchive" />Unshelve</button>
      <template v-else-if="canManage">
        <button v-if="runnable" class="pjx-iconbtn pjx-iconbtn--sm" :disabled="busy" :title="`Pause ${p.name}`" :aria-label="`Pause ${p.name}`" @click="$emit('pause', p.projectID)"><ProjectsIcon name="pause" /></button>
        <button v-else-if="resumable" class="pjx-iconbtn pjx-iconbtn--sm" :disabled="busy" :title="p.status === 'Blocked' ? `Unblock ${p.name}` : `Resume ${p.name}`" :aria-label="`Resume ${p.name}`" @click="$emit('resume', p.projectID)"><ProjectsIcon name="play" /></button>
      </template>
      <NuxtLink class="pjx-iconbtn pjx-iconbtn--sm" :to="`/projects/${p.projectID}?tab=conversation`" :title="`Chat with ${p.name}`" :aria-label="`Chat with ${p.name}`"><ProjectsIcon name="message" /></NuxtLink>
      <NuxtLink class="pjx-iconbtn pjx-iconbtn--sm" :to="`/projects/${p.projectID}`" :title="`Open ${p.name}`" :aria-label="`Open ${p.name}`"><ProjectsIcon name="arrow-right" /></NuxtLink>
    </div>
  </li>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { OverviewProject } from '~/composables/useProjectsOverview';
import { ageShort, budgetPct, isRunnable, isUnlimited, needsYou, outcomeTotals, pjUsd, projectState, resultTone, resultValue, spendInRange } from '~/scripts/projectsConsole';
import ProjectsIcon from '~/components/Projects/Icon.vue';
import ProjectsSpark from '~/components/Projects/Spark.vue';
import ProjectsOutcomes from '~/components/Projects/Outcomes.vue';

const props = defineProps<{ p: OverviewProject; now: number; active?: boolean; busy?: boolean; canManage?: boolean }>();
defineEmits<{
  (e: 'peek', id: string): void; (e: 'go', id: string): void;
  (e: 'pause', id: string): void; (e: 'resume', id: string): void; (e: 'unshelve', id: string): void;
}>();

const state = computed(() => projectState(props.p));
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
