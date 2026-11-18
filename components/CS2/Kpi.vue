<template>
  <component :is="clickable ? 'button' : 'div'" class="cs2x-card cs2x-kpi" :class="{ 'cs2x-kpi--button': clickable }" :data-testid="testid" @click="clickable && emit('open')">
    <div class="cs2x-kpi__label">
      <CS2Icon v-if="icon" :name="icon" />{{ label }}
      <span v-if="state" :data-tone="stateTone ?? tone">{{ state }}</span>
    </div>
    <div class="cs2x-kpi__value" :data-tone="valueTone">
      <template v-if="value != null">{{ value }}<span v-if="unit" class="cs2x-kpi__unit">{{ unit }}</span></template>
      <span v-else class="cs2x-faint">—</span>
    </div>
    <div class="cs2x-kpi__sub"><slot name="sub" /></div>
    <div v-if="$slots.default" class="cs2x-kpi__viz"><slot /></div>
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import CS2Icon from '~/components/CS2/Icon.vue';

/** One figure that matters, what it is against, and a small picture of how it got there. */
const props = defineProps<{
  label: string;
  icon?: string;
  value: string | null;
  unit?: string;
  tone?: string;
  state?: string;
  stateTone?: string;
  clickable?: boolean;
  testid?: string;
}>();
const emit = defineEmits<{ open: [] }>();
/** Only a figure in trouble (or money) is coloured. */
const valueTone = computed(() => (props.tone && props.tone !== 'neutral' ? props.tone : undefined));
</script>
