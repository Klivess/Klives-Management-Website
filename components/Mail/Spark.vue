<template>
  <div class="kml-spark" role="img" :aria-label="label">
    <span
      v-for="(d, i) in days"
      :key="d.day"
      class="kml-spark__bar"
      :data-today="i === days.length - 1 || undefined"
      :data-empty="!d.n || undefined"
      :style="{ height: `${d.n ? Math.max(14, (d.n / max) * 100) : 6}%` }"
      :title="`${dayLabel(d.day)}: ${d.n} message${d.n === 1 ? '' : 's'}`"
    ></span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/* Arrivals per day as thin bars; a day with none keeps a stub so the gap reads as a gap. */
const props = defineProps<{ days: { day: string; n: number }[] }>();
const max = computed(() => Math.max(1, ...props.days.map(d => d.n)));
const label = computed(() => `Mail per day over ${props.days.length} days, ${props.days.reduce((s, d) => s + d.n, 0)} in all`);
function dayLabel(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
</script>
