<template>
  <div class="stat-card">
    <div class="stat-val">
      {{ value }}<span v-if="sub" class="stat-sub"> {{ sub }}</span>
    </div>
    <div class="stat-label">{{ label }}</div>
  </div>
</template>

<script setup>
defineProps({
  value: { type: [String, Number], default: '—' },
  label: { type: String, default: '' },
  sub: { type: [String, Number], default: '' },
});
</script>

<style scoped lang="scss">
.stat-card {
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  padding: 14px 12px;
  text-align: center;
  transition: border-color 140ms ease;
}
.stat-card:hover {
  border-color: rgba($secondary, 0.35);
}

.stat-val {
  font-size: 22px;
  font-weight: 700;
  color: $teritary;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.stat-sub {
  font-size: 14px;
  font-weight: 600;
  color: #5a8a4a;
}

.stat-label {
  font-size: 11px;
  color: #6a6a6a;
  margin-top: 5px;
}
</style>
