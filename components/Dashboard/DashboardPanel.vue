<template>
  <section
    class="dashboard-panel"
    :class="{ 'dashboard-panel--loading': loading, 'dashboard-panel--error': Boolean(error) }"
    :aria-busy="loading"
  >
    <header class="dashboard-panel__header">
      <div class="dashboard-panel__heading">
        <div class="dashboard-panel__title-line">
          <h2 class="dashboard-panel__title">{{ title }}</h2>
          <span v-if="status" class="dashboard-panel__status">{{ status }}</span>
        </div>
        <p v-if="subtitle" class="dashboard-panel__subtitle">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.actions" class="dashboard-panel__actions">
        <slot name="actions" />
      </div>
    </header>

    <div v-if="loading" class="dashboard-panel__progress" aria-hidden="true" />
    <p v-if="error" class="dashboard-panel__error" role="status">
      {{ typeof error === 'string' ? error : 'Unable to load this data.' }}
    </p>

    <div class="dashboard-panel__body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title: string;
  subtitle?: string;
  status?: string;
  loading?: boolean;
  error?: string | boolean | null;
}>(), {
  subtitle: '',
  status: '',
  loading: false,
  error: null,
});
</script>

<style scoped>
.dashboard-panel {
  --dash-panel-bg: #161616;
  --dash-border: rgba(255, 255, 255, 0.08);
  --dash-muted: #969696;
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--dash-border);
  border-radius: 6px;
  background: var(--dash-panel-bg);
}

.dashboard-panel__header {
  display: flex;
  min-height: 38px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.055);
}

.dashboard-panel__heading,
.dashboard-panel__title-line {
  min-width: 0;
}

.dashboard-panel__title-line {
  display: flex;
  align-items: center;
  gap: 7px;
}

.dashboard-panel__title {
  overflow: hidden;
  color: #f4f4f4;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.025em;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-panel__subtitle {
  overflow: hidden;
  margin-top: 2px;
  color: var(--dash-muted);
  font-size: 11px;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-panel__status {
  flex: 0 0 auto;
  border: 1px solid rgba(98, 206, 71, 0.22);
  border-radius: 999px;
  padding: 1px 5px;
  background: rgba(77, 158, 57, 0.1);
  color: #8de279;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1.3;
  text-transform: uppercase;
}

.dashboard-panel__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
}

.dashboard-panel__body {
  min-height: 0;
  flex: 1 1 auto;
  padding: 7px 8px;
}

.dashboard-panel__progress {
  position: absolute;
  z-index: 1;
  top: 37px;
  left: 0;
  width: 35%;
  height: 1px;
  background: #62ce47;
  animation: dashboard-panel-progress 1.1s ease-in-out infinite alternate;
}

.dashboard-panel__error {
  flex: 0 0 auto;
  margin: 5px 8px 0;
  overflow: hidden;
  border-left: 2px solid #ef6464;
  padding: 3px 6px;
  background: rgba(239, 68, 68, 0.08);
  color: #ff9a9a;
  font-size: 10px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-panel--error {
  border-color: rgba(239, 68, 68, 0.23);
}

@keyframes dashboard-panel-progress {
  from { transform: translateX(-25%); }
  to { transform: translateX(210%); }
}

@media (prefers-reduced-motion: reduce) {
  .dashboard-panel__progress { animation: none; width: 100%; opacity: 0.55; }
}
</style>
