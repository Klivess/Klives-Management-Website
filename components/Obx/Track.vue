<template>
  <ol class="obx-track" :class="{ 'obx-track--compact': compact }" :aria-label="`Stage: ${stage}`">
    <li v-for="(s, i) in OBX_LINE" :key="s" class="obx-track__step" :data-stage="s" :data-state="stateOf(i)" :aria-current="i === current ? 'step' : undefined" :title="s">
      <span class="obx-track__bar"></span>
      <span class="obx-track__name">{{ s }}</span>
    </li>
  </ol>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { BloxStage } from '~/composables/useOmniBlox';
import { OBX_LINE } from '~/scripts/omniblox/console';

/** The production line as five segments: done, where it is now, and where an abandoned game stopped. */
const props = withDefaults(defineProps<{ stage: BloxStage; reached?: BloxStage | null; compact?: boolean }>(), { reached: null, compact: false });

const current = computed(() => {
  if (props.stage === 'Sunset') return OBX_LINE.length;
  if (props.stage === 'Abandoned') return Math.max(0, OBX_LINE.indexOf(props.reached ?? 'Research'));
  return OBX_LINE.indexOf(props.stage);
});

function stateOf(i: number) {
  if (i < current.value) return 'done';
  if (i === current.value) return props.stage === 'Abandoned' ? 'halt' : 'now';
  return '';
}
</script>
