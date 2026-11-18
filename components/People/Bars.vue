<template>
  <div class="pfx-bars">
    <div v-for="item in shown" :key="item.key" class="pfx-barrow" :title="item.title ?? item.label">
      <span class="pfx-barrow__label">{{ item.label }}</span>
      <span class="pfx-barrow__value">{{ format(item.value) }}<small v-if="item.secondary">{{ item.secondary }}</small></span>
      <span class="pfx-barrow__track" :data-tone="item.tone ?? tone"><span :style="{ width: `${Math.max(2, (item.value / peak) * 100)}%` }"></span></span>
    </div>
    <div v-if="!items.length" class="pfx-empty" style="min-height: 60px">{{ empty }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/** A ranked list with a bar under each line: the busiest permissions, routes or pages. */
const props = withDefaults(defineProps<{
  items: { key: string; label: string; value: number; secondary?: string; title?: string; tone?: string }[];
  limit?: number;
  tone?: string;
  empty?: string;
  format?: (v: number) => string;
}>(), { limit: 8, tone: 'violet', empty: 'Nothing yet.', format: (v: number) => v.toLocaleString() });
const shown = computed(() => props.items.slice(0, props.limit));
const peak = computed(() => Math.max(1, ...shown.value.map(i => i.value)));
</script>
