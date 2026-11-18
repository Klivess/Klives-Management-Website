<template>
  <div class="llx-week" role="img" :aria-label="aria">
    <div class="llx-week__row llx-week__hours">
      <span></span>
      <span v-for="h in 24" :key="h" class="llx-num">{{ (h - 1) % 3 === 0 ? String(h - 1).padStart(2, '0') : '' }}</span>
    </div>
    <div v-for="row in rows" :key="row.day" class="llx-week__row">
      <span class="llx-week__day">{{ row.day }}</span>
      <span v-for="(cell, h) in row.cells" :key="h" class="llx-week__cell" :data-level="cell.level" :title="`${row.day} ${String(h).padStart(2, '0')}:00 – ${String(h + 1).padStart(2, '0')}:00: ${cell.text}`"></span>
    </div>
    <div class="llx-week__scale"><span>less</span><i v-for="l in 7" :key="l" :data-level="l"></i><span>more</span><span class="llx-dim">· {{ note }}</span></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/** Weekday × hour of day, Monday first. `values` is the server's Sunday-first [7][24]. */
const props = withDefaults(defineProps<{ values: (number | null)[][]; days?: string[]; format: (v: number | null) => string; label: string; note?: string }>(),
  { days: () => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], note: '' });

const order = [1, 2, 3, 4, 5, 6, 0];
const max = computed(() => Math.max(0, ...props.values.flat().filter((v): v is number => typeof v === 'number')));
const rows = computed(() => order.map(d => ({
  day: props.days[d] ?? String(d),
  cells: (props.values[d] ?? new Array(24).fill(null)).map(v => ({
    level: typeof v !== 'number' || v <= 0 || max.value <= 0 ? 0 : Math.max(1, Math.ceil((v / max.value) * 7)),
    text: props.format(typeof v === 'number' ? v : null),
  })),
})));
const aria = computed(() => {
  let best = { d: 0, h: 0, v: -1 };
  props.values.forEach((row, d) => row.forEach((v, h) => { if (typeof v === 'number' && v > best.v) best = { d, h, v }; }));
  return best.v < 0 ? `${props.label}: no data` : `${props.label}: busiest ${props.days[best.d]} ${String(best.h).padStart(2, '0')}:00 (${props.format(best.v)})`;
});
</script>
