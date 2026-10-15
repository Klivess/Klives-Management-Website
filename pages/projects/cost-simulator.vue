<template>
  <ProjectsShell>
    <div class="ot-pagehead">
      <div>
        <h1>Cost simulator</h1>
        <p class="subtitle">
          Re-price the fleet's recorded token usage at any input, output and cache-read rate, over any
          timeframe — broken down per project, and per agent inside each one.
        </p>
      </div>
      <div class="ot-actions">
        <NuxtLink to="/projects/analytics" class="ot-btn ghost">Fleet analytics →</NuxtLink>
      </div>
    </div>

    <ProjectsCostSimulator />
  </ProjectsShell>
</template>

<script setup lang="ts">
import ProjectsShell from '~/components/Projects/Shell.vue';
import ProjectsCostSimulator from '~/components/Projects/CostSimulator.vue';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Projects · Costs' });
</script>
