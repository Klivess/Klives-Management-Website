<!-- A headline figure: label, value, change against the window before, and a trend. -->
<template>
  <component :is="clickable ? 'button' : 'div'" class="llx-kpi" :data-tone="tone || undefined" :data-testid="testid" @click="clickable && $emit('open')">
    <span class="llx-kpi__label"><LlmIcon v-if="icon" :name="icon" />{{ label }}<abbr v-if="help" :title="help">?</abbr></span>
    <span class="llx-kpi__value llx-num">
      <template v-if="value != null">{{ value }}<small v-if="unit">{{ unit }}</small></template>
      <span v-else class="llx-skel" style="width: 64px"></span>
    </span>
    <span class="llx-kpi__sub">
      <template v-if="delta != null">
        <b :data-tone="deltaTone">{{ delta > 0 ? '▲' : delta < 0 ? '▼' : '■' }} {{ Math.abs(delta * 100) >= 100 ? Math.round(Math.abs(delta * 100)) : Math.abs(delta * 100).toFixed(1) }}%</b>
        <span class="llx-dim">vs the window before</span>
      </template>
      <slot name="sub" />
    </span>
    <div class="llx-kpi__trend"><slot /></div>
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  label: string;
  value: string | null;
  unit?: string;
  icon?: string;
  help?: string;
  tone?: string;
  delta?: number | null;
  /** 1: up is good, −1: down is good, 0: neither. */
  good?: number;
  clickable?: boolean;
  testid?: string;
}>();
defineEmits<{ open: [] }>();

const deltaTone = computed(() => {
  if (props.delta == null || !props.good || Math.abs(props.delta) < 0.02) return 'neutral';
  return Math.sign(props.delta) === props.good ? 'ok' : 'warn';
});
</script>
