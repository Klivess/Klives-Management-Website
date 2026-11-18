<template>
  <!-- A console card with a titled head. Unnamed on purpose: the workspace's main section already names the
       tab as a region, and a second region of the same name would only add noise for screen readers. -->
  <section class="dmx-card">
    <header class="dmx-card__head">
      <h2 class="dmx-card__title"><DemiurgeIcon v-if="icon" :name="icon" />{{ title }}</h2>
      <span v-if="meta" class="dmx-card__meta">{{ meta }}</span>
      <div v-if="$slots.tools" class="dmx-card__tools"><slot name="tools" /></div>
    </header>
    <div v-if="empty" class="dmx-empty"><DemiurgeIcon :name="icon || 'info'" /><b>{{ emptyTitle }}</b><span v-if="emptyText">{{ emptyText }}</span></div>
    <div v-else :class="flush ? 'dmx-card__flush' : 'dmx-card__body'"><slot /></div>
  </section>
</template>

<script setup lang="ts">
import DemiurgeIcon from '~/components/Demiurge/Icon.vue';

defineProps<{ title: string; icon?: string; meta?: string; flush?: boolean; empty?: boolean; emptyTitle?: string; emptyText?: string }>();
</script>
