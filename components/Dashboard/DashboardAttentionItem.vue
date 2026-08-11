<template>
  <component
    v-bind="attrs"
    :is="link ? 'NuxtLink' : 'div'"
    class="dashboard-attention"
    :class="`dashboard-attention--${severity}`"
    :to="link || undefined"
    :title="fullText"
  >
    <span class="dashboard-attention__dot" aria-hidden="true" />
    <span class="dashboard-attention__copy">
      <strong class="dashboard-attention__title">{{ title }}</strong>
      <span v-if="detail" class="dashboard-attention__detail">{{ detail }}</span>
    </span>
    <span v-if="meta" class="dashboard-attention__meta">{{ meta }}</span>
  </component>
</template>

<script lang="ts">
export interface DashboardAttention {
  id?: string;
  source?: string;
  objectId?: string;
  severity?: 'critical' | 'warning' | 'info';
  tone?: 'critical' | 'warning' | 'info';
  title?: string;
  label?: string;
  message?: string;
  detail?: string;
  timeAgo?: string;
  timestamp?: string | null;
  to?: string;
  href?: string;
}
</script>

<script setup lang="ts">
import { computed, useAttrs } from 'vue';

defineOptions({ inheritAttrs: false });

const props = defineProps<{ item: DashboardAttention }>();
const attrs = useAttrs();

const severity = computed(() => props.item.severity ?? props.item.tone ?? 'info');
const link = computed(() => props.item.to ?? props.item.href ?? '');
const title = computed(() => props.item.title ?? props.item.label ?? props.item.message ?? 'Attention required');
const detail = computed(() => props.item.detail ?? (props.item.title || props.item.label ? props.item.message : '') ?? '');
const meta = computed(() => [props.item.source, props.item.timeAgo ?? props.item.timestamp].filter(Boolean).join(' · '));
const fullText = computed(() => [title.value, detail.value, meta.value].filter(Boolean).join(' — '));
</script>

<style scoped>
.dashboard-attention {
  display: flex;
  min-width: 0;
  height: 36px;
  align-items: center;
  gap: 7px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 5px;
  padding: 4px 7px;
  background: rgba(255, 255, 255, 0.018);
  color: inherit;
  text-decoration: none;
}

a.dashboard-attention:hover {
  border-color: rgba(98, 206, 71, 0.32);
  background: rgba(77, 158, 57, 0.07);
}

a.dashboard-attention:focus-visible {
  outline: 2px solid #62ce47;
  outline-offset: 1px;
}

.dashboard-attention__dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #38bdf8;
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.1);
}

.dashboard-attention__copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  justify-content: center;
}

.dashboard-attention__title,
.dashboard-attention__detail {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-attention__title {
  color: #ededed;
  font-size: 11px;
  font-weight: 650;
  line-height: 1.15;
}

.dashboard-attention__detail,
.dashboard-attention__meta {
  color: #8a8a8a;
  font-size: 10px;
  line-height: 1.15;
}

.dashboard-attention__meta {
  flex: 0 0 auto;
  max-width: 78px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-attention--warning .dashboard-attention__dot {
  background: #e3b341;
  box-shadow: 0 0 0 3px rgba(227, 179, 65, 0.11);
}

.dashboard-attention--critical .dashboard-attention__dot {
  background: #ef6464;
  box-shadow: 0 0 0 3px rgba(239, 100, 100, 0.11);
}
</style>
