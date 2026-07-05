<template>
  <div class="rd-page">
    <div class="rd-page-header">
      <NuxtLink to="/admin" class="back-button">
        <KMButton message="← BACK TO ADMIN" style="width: 250px;" textColor="#4d9e39" />
      </NuxtLink>
      <div class="rd-page-title">
        <h1>Remote Desktop</h1>
        <p class="subtitle">Live video + full mouse/keyboard control of the machine Omnipotent runs on.</p>
      </div>
      <div class="rd-page-spacer"></div>
    </div>

    <div class="rd-page-body">
      <RemoteDesktop auth-mode="password" :fps="18" :quality="60" />
    </div>
  </div>
</template>

<script setup>
import RemoteDesktop from '~/components/RemoteDesktop/RemoteDesktop.vue';
definePageMeta({ layout: 'navbar' });
</script>

<style scoped lang="scss">
.rd-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 18px 22px 22px;
  box-sizing: border-box;
  gap: 14px;
}
.rd-page-header {
  display: flex;
  align-items: center;
  gap: 18px;
  flex: 0 0 auto;
}
.rd-page-title { flex: 1; text-align: center; }
.rd-page-title h1 { margin: 0; font-size: 24px; }
.subtitle { margin: 2px 0 0; font-size: 13px; color: #8a8a8a; }
.rd-page-spacer { width: 250px; } /* balance the back button so the title centers */
.back-button { text-decoration: none; }
.rd-page-body {
  flex: 1 1 0;
  min-height: 0;
}
</style>
