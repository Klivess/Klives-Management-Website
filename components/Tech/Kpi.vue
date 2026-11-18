<template>
  <component :is="clickable ? 'button' : 'div'" class="ktx-kpi" :class="{ 'ktx-kpi--button': clickable }" :data-testid="testid" @click="clickable && emit('open')">
    <div class="ktx-kpi__label">
      <TechIcon v-if="icon" :name="icon" />{{ label }}
      <span v-if="state" class="ktx-kpi__state" :data-tone="tone">{{ state }}</span>
    </div>
    <div class="ktx-kpi__value" :data-tone="valueTone">
      <template v-if="value != null">{{ value }}<span v-if="unit" class="ktx-kpi__unit">{{ unit }}</span></template>
      <span v-else class="ktx-faint">—</span>
    </div>
    <div class="ktx-kpi__sub"><slot name="sub" /></div>
    <div v-if="$slots.default" class="ktx-kpi__viz"><slot /></div>
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/** One figure that matters and what it is against. Only a figure in trouble is coloured. */
const props = defineProps<{
  label: string;
  icon?: string;
  value: string | null;
  unit?: string;
  tone?: string;
  state?: string;
  clickable?: boolean;
  testid?: string;
}>();
const emit = defineEmits<{ open: [] }>();
const valueTone = computed(() => (props.tone === 'crit' || props.tone === 'warn' ? props.tone : undefined));
</script>
