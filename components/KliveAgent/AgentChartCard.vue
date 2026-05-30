<template>
  <div class="chart-card" :class="variant">
    <div class="chart-title">{{ title }}</div>
    <div class="chart-body">
      <slot />
    </div>
    <div v-if="$slots.legend" class="chart-legend">
      <slot name="legend" />
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, default: '' },
  // 'default' | 'wide' | 'donut' | 'list'
  variant: { type: String, default: 'default' },
});
</script>

<style scoped lang="scss">
.chart-card {
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 16px;
  flex: 1 1 240px;
  min-width: 240px;
  display: flex;
  flex-direction: column;
}

.chart-card.wide {
  flex: 2 1 400px;
  min-width: 360px;
}
.chart-card.donut {
  flex: 0 1 220px;
  min-width: 200px;
}
.chart-card.list {
  flex: 2 1 360px;
  min-width: 320px;
  max-height: 300px;
  overflow-y: auto;
}

.chart-title {
  font-size: 11px;
  font-weight: 700;
  color: #8a8a8a;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  margin-bottom: 10px;
}

.chart-body {
  flex: 1;
}

.chart-legend {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 11px;
  color: #6a6a6a;
  margin-top: 8px;
}

.chart-card.list::-webkit-scrollbar {
  width: 6px;
}
.chart-card.list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}
</style>
