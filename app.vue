
<script setup lang="ts">
import { KliveAPIUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

</script>

<template>
  <NuxtLoadingIndicator />
    <NuxtLayout>
      <keep-alive>
        <AuthenticationManager/>
      </keep-alive>
      <NuxtPage/>
    </NuxtLayout>
</template>

<style>
.page-enter-active,
.page-leave-active {
  transition: all 0.1s;
}

.page-enter-from,
.page-leave-to {
  opacity: 0;
  filter: blur(1rem);
}

.layout-enter-active,
.layout-leave-active {
  transition: all 0.1s;
}
.layout-enter-from,
.layout-leave-to {
  filter: grayscale(1);
  opacity: 0;
  filter: blur(1rem);
}
</style>