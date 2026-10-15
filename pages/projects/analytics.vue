<template>
  <ProjectsShell>
    <div class="ot-pagehead">
      <div>
        <h1>Analytics</h1>
        <p class="subtitle">Spend, token usage, activity and delivery performance across every project.</p>
      </div>
      <div class="ot-actions">
        <NuxtLink to="/projects/cost-simulator" class="ot-btn ghost">Re-price usage in the cost simulator →</NuxtLink>
      </div>
    </div>

    <ProjectsAnalyticsDashboard all-projects />
  </ProjectsShell>
</template>

<script setup lang="ts">
import ProjectsShell from '~/components/Projects/Shell.vue';
import ProjectsAnalyticsDashboard from '~/components/Projects/AnalyticsDashboard.vue';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Projects · Analytics' });
</script>
