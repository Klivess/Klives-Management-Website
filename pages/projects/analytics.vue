<template>
  <div class="fleet-analytics-page">
    <div class="page-header">
      <div>
        <NuxtLink to="/projects" class="back-link">Back to projects</NuxtLink>
        <h1>Project analytics</h1>
        <p>Spend, token usage, activity, and delivery performance across the complete KliveAgent fleet.</p>
      </div>
    </div>

    <ProjectsAnalyticsDashboard all-projects />
  </div>
</template>

<script setup lang="ts">
import ProjectsAnalyticsDashboard from '~/components/Projects/AnalyticsDashboard.vue';

definePageMeta({ layout: 'navbar' });
</script>

<style scoped>
.fleet-analytics-page {
  min-height: 100vh;
  padding: 24px;
  color: #e6e6e6;
}

.page-header {
  margin-bottom: 22px;
}

.back-link {
  display: inline-block;
  color: #7fb0d9;
  font-size: 12px;
  margin-bottom: 7px;
  text-decoration: none;
}

.back-link:hover {
  color: #a8ccec;
}

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
}

@media (max-width: 680px) {
  .fleet-analytics-page {
    padding: 16px;
  }
}
</style>
