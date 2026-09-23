<!--
  Headline tile: label, value, change vs the previous equal-length window (coloured
  only when we know which direction is good), and a sparkline of the current window.
-->
<template>
  <div class="tel-kpi" :class="tone">
    <span class="k">{{ label }}<abbr v-if="help" :title="help" aria-label="definition">ⓘ</abbr></span>
    <span class="v">{{ value }}</span>
    <span class="d">
      <template v-if="delta != null">
        <span :class="deltaTone"><span aria-hidden="true">{{ delta > 0 ? '▲' : delta < 0 ? '▼' : '■' }}</span> {{ deltaText }}</span>
        <span class="base">vs prev</span>
      </template>
      <span v-else class="base">{{ foot || ' ' }}</span>
    </span>
    <DashboardSparkline v-if="spark && spark.length > 1" class="spark" :values="spark" :label="`${label} trend`" :tone="sparkTone" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import DashboardSparkline from '~/components/Dashboard/DashboardSparkline.vue';

const props = withDefaults(defineProps<{
  label: string;
  value: string;
  current?: number | null;
  previous?: number | null;
  /** 1 = higher is better, -1 = lower is better, 0 = neutral. */
  goodDirection?: number;
  spark?: number[];
  foot?: string;
  help?: string;
  tone?: '' | 'warn' | 'bad' | 'good';
}>(), { goodDirection: 0, tone: '' });

const delta = computed(() => {
  if (props.current == null || props.previous == null || !Number.isFinite(props.current) || !Number.isFinite(props.previous)) return null;
  if (props.previous === 0) return props.current === 0 ? 0 : null;
  return (props.current - props.previous) / Math.abs(props.previous) * 100;
});
const deltaText = computed(() => {
  const d = delta.value!;
  const a = Math.abs(d);
  return `${a >= 100 ? a.toFixed(0) : a.toFixed(1)}%`;
});
const deltaTone = computed(() => {
  const d = delta.value ?? 0;
  if (props.goodDirection === 0 || Math.abs(d) < 2) return 'flat';
  return Math.sign(d) === props.goodDirection ? 'up-good' : 'up-bad';
});
const sparkTone = computed(() => props.tone === 'bad' ? 'danger' : props.tone === 'warn' ? 'warning' : 'info');
</script>

<style scoped>
.tel-kpi {
  position: relative; display: grid; grid-template-rows: auto auto auto; gap: 1px;
  background: var(--tel-surface); border: 1px solid var(--tel-line); border-radius: 8px;
  padding: 7px 10px 6px; min-width: 0; overflow: hidden;
}
.k { font-size: 11px; color: var(--tel-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.k abbr { margin-left: 4px; text-decoration: none; cursor: help; }
.v { font-size: 19px; line-height: 24px; font-weight: 600; color: var(--tel-text); white-space: nowrap; }
.tel-kpi.warn .v { color: var(--tel-warn); }
.tel-kpi.bad .v { color: var(--tel-crit-text); }
.d { font-size: 10.5px; display: flex; gap: 5px; white-space: nowrap; color: var(--tel-muted); }
.up-good { color: var(--tel-good-text); }
.up-bad { color: var(--tel-crit-text); }
.flat { color: var(--tel-text-2); }
.spark { position: absolute; right: 8px; top: 9px; width: 42%; max-width: 110px; height: 22px; opacity: .9; }
</style>
