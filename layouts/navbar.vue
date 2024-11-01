<template>
    <div>
      <nav>
        <img src="~/public/klivebot.png" style="position: absolute; width: 90px;">
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(50px, 200px)); grid-template-rows: 1fr; gap: 10px; height: 65px; padding: 10px;">
      <NuxtLink to="/dashboard"><KMButton style="width: 148px; margin-left: 80px" message="Home"></KMButton></NuxtLink>
      <NuxtLink to="/omniscience"><KMButton style="width: 180px; margin-left: 27px;" message="Omniscience"></KMButton></NuxtLink>
      <NuxtLink to="/socials"><KMButton message="Socials"></KMButton></NuxtLink>
      <NuxtLink to="/botnets"><KMButton message="Botnets"></KMButton></NuxtLink>
      <NuxtLink to="/storage"><KMButton message="Storage"></KMButton></NuxtLink>
      <NuxtLink to="/klivetech"><KMButton message="KliveTech"></KMButton></NuxtLink>
      <NuxtLink to="/botSchedule"><KMButton message="Bot Schedule"></KMButton></NuxtLink>
      <NuxtLink to="/admin"><KMButton message="Admin"></KMButton></NuxtLink>
      <KMButton @click="logOut" message="Log Out"></KMButton>
      </div>
      </nav>
      <div style="padding: 10px;">
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