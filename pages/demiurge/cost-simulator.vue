<template>
  <DemiurgeShell>
    <section class="dmx-card dmx-verdict" data-tone="info" aria-label="Cost simulator">
      <span class="dmx-verdict__glyph"><DemiurgeIcon name="coins" /></span>
      <div class="dmx-verdict__text">
        <h1 class="dmx-verdict__headline">What would the fleet have cost?</h1>
        <p class="dmx-verdict__sub">Re-price every recorded token at any input, output and cache-read rate, over any window, per Steward and per agent inside each one. Nothing is charged: this reads usage the fleet already logged.</p>
      </div>
      <div class="dmx-verdict__actions">
        <NuxtLink to="/demiurge/analytics" class="dmx-btn"><DemiurgeIcon name="chart" />Fleet analytics</NuxtLink>
      </div>
    </section>

    <DemiurgeCostSimulator />
  </DemiurgeShell>
</template>

<script setup lang="ts">
import DemiurgeShell from '~/components/Demiurge/Shell.vue';
import DemiurgeIcon from '~/components/Demiurge/Icon.vue';
import DemiurgeCostSimulator from '~/components/Demiurge/CostSimulator.vue';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Demiurge · Costs' });
</script>
