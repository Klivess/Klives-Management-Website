<template>
  <!-- A console card with a titled head. Unnamed on purpose: the workspace's main section already names the
       tab as a region, and a second region of the same name would only add noise for screen readers. -->
  <section class="pjx-card">
    <header class="pjx-card__head">
      <h2 class="pjx-card__title"><ProjectsIcon v-if="icon" :name="icon" />{{ title }}</h2>
      <span v-if="meta" class="pjx-card__meta">{{ meta }}</span>
      <div v-if="$slots.tools" class="pjx-card__tools"><slot name="tools" /></div>
    </header>
    <div v-if="empty" class="pjx-empty"><ProjectsIcon :name="icon || 'info'" /><b>{{ emptyTitle }}</b><span v-if="emptyText">{{ emptyText }}</span></div>
    <div v-else :class="flush ? 'pjx-card__flush' : 'pjx-card__body'"><slot /></div>
  </section>
</template>

<script setup lang="ts">
import ProjectsIcon from '~/components/Projects/Icon.vue';

defineProps<{ title: string; icon?: string; meta?: string; flush?: boolean; empty?: boolean; emptyTitle?: string; emptyText?: string }>();
</script>
