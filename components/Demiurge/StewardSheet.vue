<template>
  <Teleport to="body">
    <template v-if="p">
      <div class="dmx-layer dmx-scrim" @click="$emit('close')"></div>
      <aside class="dmx-layer dmx-sheet" role="dialog" aria-modal="true" :aria-label="`${p.name} at a glance`" data-testid="steward-sheet" @keydown.esc="$emit('close')">
        <header class="dmx-sheet__head">
          <div class="dmx-sheet__titles">
            <div class="dmx-sheet__title">{{ p.name || '(untitled)' }}</div>
            <div class="dmx-sheet__sub">
              <span class="dmx-chip" :data-tone="state.tone" :data-live="state.live || undefined"><span class="dmx-chip__dot"></span>{{ state.label }}</span>
              <span v-if="p.executionHealth && p.executionHealth !== 'Healthy'" class="dmx-dim"> · health {{ p.executionHealth.toLowerCase() }}</span>
            </div>
          </div>
          <button ref="closeBtn" class="dmx-iconbtn" aria-label="Close" @click="$emit('close')"><DemiurgeIcon name="x" /></button>
        </header>

        <div class="dmx-sheet__body">
          <section aria-label="Main result">
            <div class="dmx-bigvalue">
              <div>
                <div class="dmx-dim" style="font-size: 11.5px">{{ p.result?.name || 'Result' }}<template v-if="p.result?.selection === 'pinned'"> · your pick</template></div>
                <strong :style="{ color: tone === 'rest' ? undefined : `var(--dmx-${tone})` }">{{ resultValue(p.result) }}</strong>
                <div class="dmx-dim" style="font-size: 11.5px">{{ resultMeta }}</div>
              </div>
              <DemiurgeSpark v-if="history.length > 1" :values="history" :tone="tone === 'rest' ? 'accent' : tone" :label="`${p.result?.name} history`" />
            </div>
            <p v-if="p.result?.rationale" class="dmx-prose" style="margin-top: 8px">{{ p.result.rationale }}</p>
          </section>

          <section aria-label="Current work">
            <div class="dmx-rail__label">Working on</div>
            <p class="dmx-prose">{{ p.currentWork || 'No current step' }}</p>
            <p class="dmx-dim" style="font-size: 11.5px; margin-top: 4px">{{ p.currentWorkSource }}<template v-if="p.currentWorkAt"> · {{ new Date(p.currentWorkAt).toLocaleString() }}</template></p>
            <p v-if="p.blocker" class="dmx-banner" data-tone="fault" style="margin-top: 8px"><DemiurgeIcon name="alert" /><span class="dmx-banner__body">{{ p.blocker }}</span></p>
          </section>

          <dl class="dmx-kv">
            <dt>Execution</dt><dd>{{ p.executionDisposition || '—' }} · {{ p.executionHealth || '—' }}</dd>
            <dt>Agents</dt><dd>{{ p.workingAgents }} working · cap {{ p.subAgentCap }}</dd>
            <dt>Spend · {{ rangeLabel }}</dt><dd>{{ dmUsd(p.rangeSpendUsd) }} model + {{ dmUsd(p.rangeMoneySpendUsd) }} external</dd>
            <dt>Model budget</dt><dd>{{ dmUsd(p.tokenSpendUsd) }} {{ isUnlimited(p.tokenBudgetUsd) ? '· no cap' : `of ${dmUsd(p.tokenBudgetUsd)}` }}</dd>
            <dt>External budget</dt><dd>{{ dmUsd(p.moneySpendUsd) }} of {{ dmUsd(p.moneyBudgetUsd) }}</dd>
            <dt>Evidence</dt><dd>{{ p.result?.evidenceEventSequence ? `event #${p.result.evidenceEventSequence}` : 'no event reference' }}<template v-if="p.result?.evidenceArtifactIDs?.length"> · {{ p.result.evidenceArtifactIDs.length }} artifact(s)</template></dd>
          </dl>

          <section v-if="canPin && p.resultOptions?.length" aria-label="Main result selection">
            <div class="dmx-rail__label">Which number is this Steward's result?</div>
            <div style="display: grid; grid-template-columns: 1fr auto; gap: 8px">
              <select v-model="pinID" class="dmx-select" style="width: 100%" aria-label="Primary result">
                <option value="">Let the Commander choose</option>
                <option v-for="o in p.resultOptions" :key="o.observableID" :value="o.observableID">{{ o.name }}</option>
              </select>
              <select v-model="pinDirection" class="dmx-select" :disabled="!pinID" aria-label="Favourable direction">
                <option value="higher">Higher is better</option>
                <option value="lower">Lower is better</option>
                <option value="neutral">Neither</option>
              </select>
            </div>
            <div style="display: flex; justify-content: flex-end; margin-top: 8px">
              <button class="dmx-btn dmx-btn--sm" :disabled="busy || !pinChanged" @click="$emit('pin', p.stewardID, pinID || null, pinDirection)">{{ busy ? 'Saving…' : 'Save selection' }}</button>
            </div>
          </section>
        </div>

        <footer class="dmx-sheet__foot">
          <template v-if="canManage && p.status !== 'Archived'">
            <button v-if="runnable" class="dmx-btn dmx-btn--stop" :disabled="busy" @click="$emit('pause', p.stewardID)"><DemiurgeIcon name="pause" />Pause</button>
            <button v-else-if="resumable" class="dmx-btn dmx-btn--go" :disabled="busy" @click="$emit('resume', p.stewardID)"><DemiurgeIcon name="play" />{{ p.status === 'Blocked' ? 'Unblock' : 'Resume' }}</button>
          </template>
          <NuxtLink class="dmx-btn" :to="`/demiurge/${p.stewardID}?tab=conversation`"><DemiurgeIcon name="message" />Chat</NuxtLink>
          <NuxtLink class="dmx-btn dmx-btn--primary" :to="`/demiurge/${p.stewardID}`">Open workspace<DemiurgeIcon name="arrow-right" /></NuxtLink>
        </footer>
      </aside>
    </template>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { OverviewSteward } from '~/composables/useDemiurgeOverview';
import { ageWords, isRunnable, isUnlimited, dmUsd, stewardState, resultTone, resultValue } from '~/scripts/demiurgeConsole';
import DemiurgeIcon from '~/components/Demiurge/Icon.vue';
import DemiurgeSpark from '~/components/Demiurge/Spark.vue';

const props = defineProps<{ p: OverviewSteward | null; now: number; rangeLabel: string; busy?: boolean; canManage?: boolean; canPin?: boolean }>();
defineEmits<{
  (e: 'close'): void; (e: 'pause', id: string): void; (e: 'resume', id: string): void;
  (e: 'pin', id: string, observableID: string | null, direction: string): void;
}>();

const state = computed(() => props.p ? stewardState(props.p) : stewardState({ status: 'Paused', halted: false, workingAgents: 0, executionDisposition: '' }));
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
watch(() => props.p?.stewardID, async id => {
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
