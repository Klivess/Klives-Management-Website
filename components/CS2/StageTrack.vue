<template>
  <ol class="cs2x-track" :class="{ 'cs2x-track--cancelled': cancelled }" :aria-label="label">
    <li
      v-for="(step, index) in steps"
      :key="step"
      class="cs2x-track__step"
      :class="{
        'is-done': !cancelled && index < current,
        'is-current': !cancelled && index === current,
        'is-action': !cancelled && index === current && needsAction,
      }"
      :title="step"
    >
      <span class="cs2x-track__dot" aria-hidden="true" />
      <span v-if="!compact" class="cs2x-track__label">{{ step }}</span>
    </li>
  </ol>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { stageMeta } from '~/scripts/cs2Arbitrage';

const props = withDefaults(defineProps<{ stage: number; plannedExit?: string; compact?: boolean }>(), {
  plannedExit: 'SteamMarket',
  compact: false,
});

/** Server stage → position on the purchase journey (LeftInventory and Completed end it). */
const STEP_OF_STAGE: Record<number, number> = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 4, 6: 4, 9: 4, 7: 5, 10: 5 };

const steps = computed(() => [
  'Bought',
  'Seller accepted',
  'Trade received',
  'Trade protection',
  props.plannedExit === 'CSFloatRelist' || props.stage === 9 ? 'Relisted' : 'Selling',
  props.stage === 10 ? 'Left the bot' : 'Done',
]);
const cancelled = computed(() => props.stage === 8);
const current = computed(() => STEP_OF_STAGE[props.stage] ?? 0);
const needsAction = computed(() => props.stage === 2);
const label = computed(() => `Progress: ${stageMeta(props.stage).label}`);
</script>
