<script setup>
// Default layout = the navbar shell.
//
// Some pages (e.g. kliveagent, dashboard, omnidefence) intermittently fail to
// surface their `definePageMeta({ layout: 'navbar' })` to Nuxt's SSR layout
// selection, so `<NuxtLayout>` falls back to the default layout. Without a default
// layout that meant *no* layout at all — the navbar vanished. Making the default
// layout render the same navbar shell guarantees the nav is always present, while
// pages that opt out explicitly (`layout: 'empty'` / `layout: false`) still do.
//
// Reuses navbar.vue directly (no duplication); it renders <slot/>, so page content
// passes straight through.
import NavbarLayout from './navbar.vue';
</script>

<template>
  <NavbarLayout>
    <slot />
  </NavbarLayout>
</template>
