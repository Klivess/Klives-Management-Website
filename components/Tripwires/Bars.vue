<template>
  <div class="twx-bars" :class="{ 'twx-bars--mini': mini }" role="img" :aria-label="label">
    <div
      v-for="(bin, i) in bins"
      :key="bin.key"
      class="twx-bars__slot"
      :class="{ 'twx-bars__slot--today': i === bins.length - 1 }"
      :title="`${bin.label}: ${bin.count} ${bin.count === 1 ? 'trip' : 'trips'}`"
    >
      <span v-if="!mini && bin.count" class="twx-bars__value">{{ bin.count }}</span>
      <i :style="{ height: `${height(bin.count)}%` }" :data-empty="bin.count ? undefined : ''"></i>
      <small v-if="!mini && showLabel(i)">{{ shortLabel(bin) }}</small>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { DayBin } from '~/scripts/tripwires';

/** Trips per day as bars, today last. Mini: a sparkline for the rail, no labels. */
const props = defineProps<{ bins: DayBin[]; mini?: boolean; label?: string }>();
const max = computed(() => Math.max(1, ...props.bins.map(b => b.count)));
const height = (count: number) => (count ? Math.max(props.mini ? 18 : 6, (count / max.value) * 100) : props.mini ? 8 : 2);
const every = computed(() => (props.bins.length > 20 ? 7 : props.bins.length > 10 ? 2 : 1));
const showLabel = (i: number) => (props.bins.length - 1 - i) % every.value === 0;
const shortLabel = (bin: DayBin) => (props.bins.length > 20
  ? bin.date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  : bin.date.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2));
</script>
