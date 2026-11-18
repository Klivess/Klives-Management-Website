<template>
  <div class="llx-page">
    <!-- KliveLLM is polled, teleports its sheets and keeps per-browser preferences: it renders in the browser only. -->
    <ClientOnly>
      <LlmConsole />
      <template #fallback>
        <div class="llx">
          <div class="llx-main">
            <div class="llx-card"><div class="llx-empty">Loading KliveLLM…</div></div>
          </div>
        </div>
      </template>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'navbar' });
useHead({ title: 'KliveLLM' });
</script>

<style lang="scss" src="~/assets/scss/klivellm.scss"></style>
