<template>
  <component
    v-bind="attrs"
    :is="to ? 'NuxtLink' : 'div'"
    class="dashboard-estate-chip"
    :class="`dashboard-estate-chip--${tone}`"
    :to="to || undefined"
    :aria-label="`${label}: ${value}`"
  >
    <span class="dashboard-estate-chip__label">{{ label }}</span>
    <strong class="dashboard-estate-chip__value">{{ value }}</strong>
  </component>
</template>

<script setup lang="ts">
import { useAttrs } from 'vue';

defineOptions({ inheritAttrs: false });

withDefaults(defineProps<{
  label: string;
  value: string | number;
  tone?: 'neutral' | 'good' | 'success' | 'warning' | 'danger' | 'info';
  to?: string;
}>(), {
  tone: 'neutral',
  to: '',
});

const attrs = useAttrs();
</script>

<style scoped>
.dashboard-estate-chip {
  display: flex;
  min-width: 0;
  height: 28px;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 5px;
  padding: 0 7px;
  background: rgba(255, 255, 255, 0.018);
  color: inherit;
  text-decoration: none;
}

a.dashboard-estate-chip:hover {
  border-color: rgba(98, 206, 71, 0.3);
  background: rgba(77, 158, 57, 0.06);
}

a.dashboard-estate-chip:focus-visible {
  outline: 2px solid #62ce47;
  outline-offset: 1px;
}

.dashboard-estate-chip__label {
  overflow: hidden;
  color: #858585;
  font-size: 10px;
  letter-spacing: 0.035em;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.dashboard-estate-chip__value {
  overflow: hidden;
  color: #dedede;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-estate-chip--good .dashboard-estate-chip__value { color: #7dda67; }
.dashboard-estate-chip--success .dashboard-estate-chip__value { color: #7dda67; }
.dashboard-estate-chip--warning .dashboard-estate-chip__value { color: #f0c35b; }
.dashboard-estate-chip--danger .dashboard-estate-chip__value { color: #ff8282; }
.dashboard-estate-chip--info .dashboard-estate-chip__value { color: #7dd3fc; }
</style>
