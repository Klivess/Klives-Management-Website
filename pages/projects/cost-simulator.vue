<template>
  <ProjectsShell>
    <section class="pjx-card pjx-verdict" data-tone="info" aria-label="Cost simulator">
      <span class="pjx-verdict__glyph"><ProjectsIcon name="coins" /></span>
      <div class="pjx-verdict__text">
        <h1 class="pjx-verdict__headline">What would the fleet have cost?</h1>
        <p class="pjx-verdict__sub">Re-price every recorded token at any input, output and cache-read rate, over any window, per project and per agent inside each one. Nothing is charged: this reads usage the fleet already logged.</p>
      </div>
      <div class="pjx-verdict__actions">
        <NuxtLink to="/projects/analytics" class="pjx-btn"><ProjectsIcon name="chart" />Fleet analytics</NuxtLink>
      </div>
    </section>

    <ProjectsCostSimulator />
  </ProjectsShell>
</template>

<script setup lang="ts">
import ProjectsShell from '~/components/Projects/Shell.vue';
import ProjectsIcon from '~/components/Projects/Icon.vue';
import ProjectsCostSimulator from '~/components/Projects/CostSimulator.vue';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Projects · Costs' });
</script>
