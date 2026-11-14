<template>
  <div class="pfx-spark" :class="{ 'pfx-spark--sm': small }" :data-tone="tone" role="img" :aria-label="ariaLabel">
    <span
      v-for="(value, i) in values"
      :key="i"
      class="pfx-spark__bar"
      :data-zero="!value || undefined"
      :style="{ height: value ? `${Math.max(8, (value / peak) * 100)}%` : undefined }"
      :title="titleFor(i, value)"
    ></span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/**
 * Bars for a short series (24 hours, oldest first). Every bar carries its own title, so a hover
 * reads "3 h ago · 142 requests" without a chart library.
 */
const props = withDefaults(defineProps<{ values: number[]; tone?: string; small?: boolean; unit?: string; label?: string; stepLabel?: (indexFromEnd: number) => string }>(), {
  tone: 'violet', small: false, unit: 'requests', label: 'Requests an hour, last 24 hours', stepLabel: undefined,
});
const peak = computed(() => Math.max(1, ...props.values));
const ariaLabel = computed(() => `${props.label}: ${props.values.reduce((n, v) => n + v, 0)} in total`);

function titleFor(index: number, value: number) {
  const back = props.values.length - 1 - index;
  const when = props.stepLabel ? props.stepLabel(back) : back === 0 ? 'this hour' : `${back} h ago`;
  return `${when} · ${value.toLocaleString()} ${props.unit}`;
}
</script>
