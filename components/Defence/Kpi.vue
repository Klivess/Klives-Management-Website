<template>
  <component :is="clickable ? 'button' : 'div'" class="odx-kpi" :class="{ 'odx-kpi--button': clickable }" :data-testid="testid" @click="clickable && emit('open')">
    <div class="odx-kpi__label">
      <DefenceIcon v-if="icon" :name="icon" />{{ label }}
      <span v-if="state" :data-tone="tone">{{ state }}</span>
    </div>
    <div class="odx-kpi__value" :data-tone="valueTone">
      <template v-if="value != null">{{ value }}<span v-if="unit" class="odx-kpi__unit">{{ unit }}</span></template>
      <span v-else class="odx-faint">—</span>
    </div>
    <div class="odx-kpi__sub"><slot name="sub" /></div>
    <div v-if="$slots.default" class="odx-kpi__viz"><slot /></div>
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/** One figure that matters, what it is against, and how it has moved. */
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
/** Only a figure in trouble is coloured. */
const valueTone = computed(() => (props.tone === 'crit' || props.tone === 'warn' ? props.tone : undefined));
</script>
