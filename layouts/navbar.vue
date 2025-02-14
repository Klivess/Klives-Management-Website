<template>
  <div>
    <nav style="position: fixed; top: 0; left: 0; right: 0; z-index: 1000; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; padding: 5px;">
      <img src="~/public/klivebot.png" style="width: 50px;">
      <div style="flex: 1; display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 10px; align-items: center;">
        <NuxtLink to="/dashboard">
          <KMButton message="Home"></KMButton>
        </NuxtLink>
        <NuxtLink to="/omniscience">
          <KMButton message="Omniscience"></KMButton>
        </NuxtLink>
        <NuxtLink to="/socials">
          <KMButton message="Socials"></KMButton>
        </NuxtLink>
        <NuxtLink to="/botnets">
          <KMButton message="Botnets"></KMButton>
        </NuxtLink>
        <NuxtLink to="/storage">
          <KMButton message="Storage"></KMButton>
        </NuxtLink>
        <NuxtLink to="/klivetech">
          <KMButton message="KliveTech"></KMButton>
        </NuxtLink>
        <NuxtLink to="/botSchedule">
          <KMButton message="Bot Schedule"></KMButton>
        </NuxtLink>
        <NuxtLink to="/admin">
          <KMButton message="Admin"></KMButton>
        </NuxtLink>
        <KMButton @click="logOut" message="Log Out"></KMButton>
      </div>
    </nav>
    <!-- Added margin-top to push content below the fixed navbar -->
    <div style="padding: 10px; margin-top: 60px;">
      <slot/>
    </div>
  </div>
</template>

<script>


import KMButton from '~/components/KMButton.vue';
import KMInfoGrid from '~/components/KMInfoGrid.vue';

export default {
  name: 'navbarLayout',
  props: {
    
  },
  methods: {
    logOut(){
      const cook = useCookie('password');
      cook.value = "";
      this.$router.push('/');
    }
  }
}
</script>