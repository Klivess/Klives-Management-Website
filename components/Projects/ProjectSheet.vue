<template>
  <Teleport to="body">
    <template v-if="p">
      <div class="pjx-layer pjx-scrim" @click="$emit('close')"></div>
      <aside class="pjx-layer pjx-sheet" role="dialog" aria-modal="true" :aria-label="`${p.name} at a glance`" data-testid="project-sheet" @keydown.esc="$emit('close')">
        <header class="pjx-sheet__head">
          <div class="pjx-sheet__titles">
            <div class="pjx-sheet__title">{{ p.name || '(untitled)' }}</div>
            <div class="pjx-sheet__sub">
              <span class="pjx-chip" :data-tone="state.tone" :data-live="state.live || undefined"><span class="pjx-chip__dot"></span>{{ state.label }}</span>
              <span v-if="p.executionHealth && p.executionHealth !== 'Healthy'" class="pjx-dim"> · health {{ p.executionHealth.toLowerCase() }}</span>
            </div>
          </div>
          <button ref="closeBtn" class="pjx-iconbtn" aria-label="Close" @click="$emit('close')"><ProjectsIcon name="x" /></button>
        </header>

        <div class="pjx-sheet__body">
          <section aria-label="Main result">
            <div class="pjx-bigvalue">
              <div>
                <div class="pjx-dim" style="font-size: 11.5px">{{ p.result?.name || 'Result' }}<template v-if="p.result?.selection === 'pinned'"> · your pick</template></div>
                <strong :style="{ color: tone === 'rest' ? undefined : `var(--pjx-${tone})` }">{{ resultValue(p.result) }}</strong>
                <div class="pjx-dim" style="font-size: 11.5px">{{ resultMeta }}</div>
              </div>
              <ProjectsSpark v-if="history.length > 1" :values="history" :tone="tone === 'rest' ? 'accent' : tone" :label="`${p.result?.name} history`" />
            </div>
            <p v-if="p.result?.rationale" class="pjx-prose" style="margin-top: 8px">{{ p.result.rationale }}</p>
          </section>

          <section aria-label="Current work">
            <div class="pjx-rail__label">Working on</div>
            <p class="pjx-prose">{{ p.currentWork || 'No current step' }}</p>
            <p class="pjx-dim" style="font-size: 11.5px; margin-top: 4px">{{ p.currentWorkSource }}<template v-if="p.currentWorkAt"> · {{ new Date(p.currentWorkAt).toLocaleString() }}</template></p>
            <p v-if="p.blocker" class="pjx-banner" data-tone="fault" style="margin-top: 8px"><ProjectsIcon name="alert" /><span class="pjx-banner__body">{{ p.blocker }}</span></p>
          </section>

          <dl class="pjx-kv">
            <dt>Execution</dt><dd>{{ p.executionDisposition || '—' }} · {{ p.executionHealth || '—' }}</dd>
            <dt>Agents</dt><dd>{{ p.workingAgents }} working · cap {{ p.subAgentCap }}</dd>
            <dt>Spend · {{ rangeLabel }}</dt><dd>{{ pjUsd(p.rangeSpendUsd) }} model + {{ pjUsd(p.rangeMoneySpendUsd) }} external</dd>
            <dt>Model budget</dt><dd>{{ pjUsd(p.tokenSpendUsd) }} {{ isUnlimited(p.tokenBudgetUsd) ? '· no cap' : `of ${pjUsd(p.tokenBudgetUsd)}` }}</dd>
            <dt>External budget</dt><dd>{{ pjUsd(p.moneySpendUsd) }} of {{ pjUsd(p.moneyBudgetUsd) }}</dd>
            <dt>Evidence</dt><dd>{{ p.result?.evidenceEventSequence ? `event #${p.result.evidenceEventSequence}` : 'no event reference' }}<template v-if="p.result?.evidenceArtifactIDs?.length"> · {{ p.result.evidenceArtifactIDs.length }} artifact(s)</template></dd>
          </dl>

          <section v-if="canPin && p.resultOptions?.length" aria-label="Main result selection">
            <div class="pjx-rail__label">Which number is this project's result?</div>
            <div style="display: grid; grid-template-columns: 1fr auto; gap: 8px">
              <select v-model="pinID" class="pjx-select" style="width: 100%" aria-label="Primary result">
                <option value="">Let the Commander choose</option>
                <option v-for="o in p.resultOptions" :key="o.observableID" :value="o.observableID">{{ o.name }}</option>
              </select>
              <select v-model="pinDirection" class="pjx-select" :disabled="!pinID" aria-label="Favourable direction">
                <option value="higher">Higher is better</option>
                <option value="lower">Lower is better</option>
                <option value="neutral">Neither</option>
              </select>
            </div>
            <div style="display: flex; justify-content: flex-end; margin-top: 8px">
              <button class="pjx-btn pjx-btn--sm" :disabled="busy || !pinChanged" @click="$emit('pin', p.projectID, pinID || null, pinDirection)">{{ busy ? 'Saving…' : 'Save selection' }}</button>
            </div>
          </section>
        </div>

        <footer class="pjx-sheet__foot">
          <template v-if="canManage && p.status !== 'Archived'">
            <button v-if="runnable" class="pjx-btn pjx-btn--stop" :disabled="busy" @click="$emit('pause', p.projectID)"><ProjectsIcon name="pause" />Pause</button>
            <button v-else-if="resumable" class="pjx-btn pjx-btn--go" :disabled="busy" @click="$emit('resume', p.projectID)"><ProjectsIcon name="play" />{{ p.status === 'Blocked' ? 'Unblock' : 'Resume' }}</button>
          </template>
          <NuxtLink class="pjx-btn" :to="`/projects/${p.projectID}?tab=conversation`"><ProjectsIcon name="message" />Chat</NuxtLink>
          <NuxtLink class="pjx-btn pjx-btn--primary" :to="`/projects/${p.projectID}`">Open workspace<ProjectsIcon name="arrow-right" /></NuxtLink>
        </footer>
      </aside>
    </template>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { OverviewProject } from '~/composables/useProjectsOverview';
import { ageWords, isRunnable, isUnlimited, pjUsd, projectState, resultTone, resultValue } from '~/scripts/projectsConsole';
import ProjectsIcon from '~/components/Projects/Icon.vue';
import ProjectsSpark from '~/components/Projects/Spark.vue';

const props = defineProps<{ p: OverviewProject | null; now: number; rangeLabel: string; busy?: boolean; canManage?: boolean; canPin?: boolean }>();
defineEmits<{
  (e: 'close'): void; (e: 'pause', id: string): void; (e: 'resume', id: string): void;
  (e: 'pin', id: string, observableID: string | null, direction: string): void;
}>();

const state = computed(() => props.p ? projectState(props.p) : projectState({ status: 'Paused', halted: false, workingAgents: 0, executionDisposition: '' }));
const tone = computed(() => resultTone(props.p?.result));
const history = computed(() => (props.p?.result?.history ?? []).map(h => Number(h.value)).filter(Number.isFinite));
const runnable = computed(() => !!props.p && isRunnable(props.p) && !props.p.halted);
const resumable = computed(() => !!props.p && (['Paused', 'Blocked'].includes(props.p.status) || props.p.halted));
const resultMeta = computed(() => {
  const r = props.p?.result;
  if (!r || r.value == null) return 'No measurement yet';
  if (r.selection === 'fallback') return `Fallback: steps closed in ${props.rangeLabel}`;
  const parts = [r.observedAt ? `measured ${ageWords(r.observedAt, props.now)} ago` : 'no timestamp'];
  if (r.stale) parts.push('stale');
  if (r.validity !== 'Valid') parts.push(r.validity === 'Invalid' ? 'invalid' : 'unverified');
  parts.push(`by ${r.source?.toLowerCase() || 'agent'}`);
  return parts.join(' · ');
});

const pinID = ref('');
const pinDirection = ref('higher');
const closeBtn = ref<HTMLButtonElement | null>(null);
watch(() => props.p?.projectID, async id => {
  if (!id || !props.p) return;
  pinID.value = props.p.result?.selection === 'pinned' ? props.p.result.observableID ?? '' : '';
  pinDirection.value = props.p.result?.direction || 'higher';
  await nextTick();
  closeBtn.value?.focus();
}, { immediate: true });
const pinChanged = computed(() => {
  const r = props.p?.result;
  const current = r?.selection === 'pinned' ? r.observableID ?? '' : '';
  return current !== pinID.value || (!!pinID.value && pinDirection.value !== (r?.direction || 'higher'));
});
</script>
