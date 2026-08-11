<template>
  <div class="dashboard-kpi" :class="`dashboard-kpi--${tone}`">
    <span class="dashboard-kpi__label">{{ label }}</span>
    <strong class="dashboard-kpi__value" :title="String(value)">{{ value }}</strong>
    <span v-if="detail" class="dashboard-kpi__detail" :title="detail">{{ detail }}</span>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  label: string;
  value: string | number;
  tone?: 'neutral' | 'good' | 'success' | 'warning' | 'danger' | 'info' | 'paper' | 'live';
  detail?: string;
}>(), {
  tone: 'neutral',
  detail: '',
});
</script>

<style scoped>
.dashboard-kpi {
  display: grid;
  min-width: 0;
  min-height: 32px;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: auto auto;
  align-content: center;
  column-gap: 7px;
  padding: 3px 6px;
  border: 1px solid rgba(255, 255, 255, 0.055);
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.018);
}

.dashboard-kpi__label,
.dashboard-kpi__detail {
  overflow: hidden;
  color: #969696;
  font-size: 11px;
  letter-spacing: 0.045em;
  line-height: 1.15;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.dashboard-kpi__value {
  grid-row: 1 / span 2;
  grid-column: 2;
  align-self: center;
  overflow: hidden;
  color: #f1f1f1;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-kpi__detail {
  color: #6f6f6f;
  font-size: 10px;
  letter-spacing: 0;
  text-transform: none;
}

.dashboard-kpi--good .dashboard-kpi__value { color: #7dda67; }
.dashboard-kpi--success .dashboard-kpi__value { color: #7dda67; }
.dashboard-kpi--warning .dashboard-kpi__value { color: #f0c35b; }
.dashboard-kpi--danger .dashboard-kpi__value { color: #ff8282; }
.dashboard-kpi--info .dashboard-kpi__value { color: #7dd3fc; }
.dashboard-kpi--paper .dashboard-kpi__value { color: #7ad4f7; }
.dashboard-kpi--live .dashboard-kpi__value { color: #fbbf24; }
</style>
