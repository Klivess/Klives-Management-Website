<template>
  <component :is="to ? NuxtLink : 'div'" class="adm-tile" :data-tone="tone" v-bind="to ? { to } : {}">
    <div class="adm-tile__head">
      <span class="adm-tile__label">{{ label }}</span>
      <span v-if="state" class="adm-state" :data-tone="tone"><AdminIcon :name="tone === 'crit' ? 'octagon-x' : tone === 'warn' ? 'alert' : 'check'" />{{ state }}</span>
    </div>
    <div class="adm-tile__figure">
      <div class="adm-tile__value" :data-testid="testid">
        <template v-if="value != null">{{ value }}<span v-if="unit" class="adm-tile__unit">{{ unit }}</span></template>
        <span v-else class="adm-dim">—</span>
      </div>
    </div>
    <div class="adm-tile__viz" :class="{ 'adm-tile__viz--strip': strip }">
      <slot />
    </div>
    <div class="adm-tile__sub"><slot name="sub" /></div>
  </component>
</template>

<script setup lang="ts">
import { resolveComponent } from 'vue';

/*
 * One vital: its name, the reading in ink, a line of context, and its last hour beside it.
 * Colour belongs to the trend and the state word, never to the number itself.
 */
withDefaults(defineProps<{
  label: string;
  value: string | null;
  unit?: string;
  /** ok, warn, crit for a metric with thresholds; data for one that is neither good nor bad. */
  tone?: string;
  /** A word for the state when it is not ok ("High", "Critical"). */
  state?: string;
  to?: string;
  strip?: boolean;
  testid?: string;
}>(), { tone: 'ok', unit: '', state: '', to: '', strip: false, testid: undefined });

const NuxtLink = resolveComponent('NuxtLink');
</script>
