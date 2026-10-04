<template>
  <ol class="cs2-track" :class="{ 'cs2-track--cancelled': cancelled, 'cs2-track--compact': compact }" :aria-label="label">
    <li
      v-for="(step, index) in steps"
      :key="step"
      class="cs2-track__step"
      :class="{
        'is-done': !cancelled && index < current,
        'is-current': !cancelled && index === current,
        'is-action': !cancelled && index === current && needsAction,
      }"
      :title="step"
    >
      <span class="cs2-track__dot" aria-hidden="true" />
      <span v-if="!compact" class="cs2-track__label">{{ step }}</span>
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

/** Server stage → position on the purchase journey. */
const STEP_OF_STAGE: Record<number, number> = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 4, 6: 4, 9: 4, 7: 5 };

const steps = computed(() => [
  'Bought',
  'Seller accepted',
  'Trade received',
  'Trade protection',
  props.plannedExit === 'CSFloatRelist' || props.stage === 9 ? 'Relisted' : 'Selling',
  'Done',
]);
const cancelled = computed(() => props.stage === 8);
const current = computed(() => STEP_OF_STAGE[props.stage] ?? 0);
const needsAction = computed(() => props.stage === 2);
const label = computed(() => `Progress: ${stageMeta(props.stage).label}`);
</script>

<style scoped>
.cs2-track {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.cs2-track__step {
  position: relative;
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

/* Connector to the previous step. */
.cs2-track__step + .cs2-track__step::before {
  position: absolute;
  top: 4px;
  right: 50%;
  left: -50%;
  height: 1px;
  background: rgba(255, 255, 255, 0.12);
  content: '';
}

.cs2-track__step.is-done::before,
.cs2-track__step.is-current::before { background: #4d9e39; }

.cs2-track__dot {
  position: relative;
  z-index: 1;
  width: 9px;
  height: 9px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 50%;
  background: #161616;
}

.cs2-track__step.is-done .cs2-track__dot { border-color: #4d9e39; background: #4d9e39; }
.cs2-track__step.is-current .cs2-track__dot { border-color: #8de279; background: #161616; box-shadow: 0 0 0 3px rgba(98, 206, 71, 0.18); }
.cs2-track__step.is-action .cs2-track__dot { border-color: #f0c35b; box-shadow: 0 0 0 3px rgba(240, 195, 91, 0.2); }

.cs2-track__label {
  overflow: hidden;
  max-width: 100%;
  color: #707070;
  font-size: 9.5px;
  line-height: 1.15;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cs2-track__step.is-done .cs2-track__label { color: #a8a8a8; }
.cs2-track__step.is-current .cs2-track__label { color: #f4f4f4; font-weight: 600; }
.cs2-track__step.is-action .cs2-track__label { color: #f0c35b; }

.cs2-track--cancelled .cs2-track__dot { border-color: rgba(239, 100, 100, 0.45); }
.cs2-track--cancelled .cs2-track__step::before { background: rgba(239, 100, 100, 0.25); }

.cs2-track--compact .cs2-track__dot { width: 7px; height: 7px; }
.cs2-track--compact .cs2-track__step + .cs2-track__step::before { top: 3px; }
</style>
