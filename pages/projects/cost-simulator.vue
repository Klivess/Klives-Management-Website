<template>
  <div class="cost-simulator-page">
    <div class="page-header">
      <div>
        <NuxtLink to="/projects" class="back-link">Back to projects</NuxtLink>
        <h1>Cost simulator</h1>
        <p>
          Re-price the fleet's recorded token usage at any input, output and cache-read rate, over any
          timeframe — broken down per project, and per agent inside each one.
        </p>
      </div>
      <NuxtLink to="/projects/analytics" class="side-link">Analytics ↗</NuxtLink>
    </div>

    <ProjectsCostSimulator />
  </div>
</template>

<script setup lang="ts">
import ProjectsCostSimulator from '~/components/Projects/CostSimulator.vue';

definePageMeta({ layout: 'navbar' });
</script>

<style scoped>
.cost-simulator-page {
  min-height: 100vh;
  padding: 24px;
  color: #e6e6e6;
}

.page-header {
  align-items: flex-start;
  display: flex;
  gap: 20px;
  justify-content: space-between;
  margin-bottom: 22px;
}

.back-link {
  color: #7fb0d9;
  display: inline-block;
  font-size: 12px;
  margin-bottom: 7px;
  text-decoration: none;
}

.back-link:hover { color: #a8ccec; }

.side-link {
  background: #26262b;
  border-radius: 6px;
  color: #c7c7cc;
  flex-shrink: 0;
  font-size: 12px;
  padding: 9px 14px;
  text-decoration: none;
}

.side-link:hover { background: #303036; color: #e6e6eb; }

h1 {
  color: #e6e6e6;
  font-size: 28px;
  line-height: 1.2;
  margin: 0;
}

p {
  color: #888;
  font-size: 14px;
  line-height: 1.5;
  margin: 5px 0 0;
  max-width: 720px;
}

@media (max-width: 680px) {
  .cost-simulator-page {
    padding: 16px 16px 16px 72px;
  }
}
</style>
