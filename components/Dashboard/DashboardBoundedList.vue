<template>
  <div class="dashboard-bounded-list" role="list" :aria-label="ariaLabel">
    <template v-if="visibleItems.length">
      <div
        v-for="(item, index) in visibleItems"
        :key="itemKey(item, index)"
        class="dashboard-bounded-list__item"
        role="listitem"
      >
        <slot name="item" :item="item" :index="index" />
      </div>
      <slot v-if="overflowCount" name="overflow" :count="overflowCount">
        <button class="dashboard-bounded-list__overflow" type="button" @click="emit('overflow')">
          +{{ overflowCount }} more
        </button>
      </slot>
    </template>
    <slot v-else name="empty">
      <p class="dashboard-bounded-list__empty">{{ emptyText }}</p>
    </slot>
  </div>
</template>

<script setup lang="ts" generic="T extends Record<string, any>">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  items: T[];
  limit?: number;
  emptyText?: string;
  ariaLabel?: string;
}>(), {
  limit: 5,
  emptyText: 'Nothing to show',
  ariaLabel: 'Items',
});

const emit = defineEmits<{ overflow: [] }>();
const normalizedLimit = computed(() => Math.max(0, Math.floor(props.limit)));
const visibleItems = computed(() => props.items.slice(0, normalizedLimit.value));
const overflowCount = computed(() => Math.max(0, props.items.length - visibleItems.value.length));
const itemKey = (item: T, index: number) => item.id ?? item.key ?? item.objectId ?? index;
</script>

<style scoped>
.dashboard-bounded-list {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.dashboard-bounded-list__item { min-width: 0; }

.dashboard-bounded-list__overflow {
  width: 100%;
  height: 24px;
  border: 1px dashed rgba(255, 255, 255, 0.1);
  border-radius: 5px;
  background: transparent;
  color: #969696;
  cursor: pointer;
  font: inherit;
  font-size: 10px;
}

.dashboard-bounded-list__overflow:hover {
  border-color: rgba(98, 206, 71, 0.35);
  color: #8de279;
}

.dashboard-bounded-list__overflow:focus-visible {
  outline: 2px solid #62ce47;
  outline-offset: 1px;
}

.dashboard-bounded-list__empty {
  display: grid;
  min-height: 32px;
  place-items: center;
  color: #737373;
  font-size: 10px;
}
</style>
