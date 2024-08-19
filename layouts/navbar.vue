<template>
    <div>
      <nav>
        <img src="~/public/klivebot.png" style="position: absolute; width: 90px;">
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(50px, 228px)); grid-template-rows: 1fr; gap: 10px; height: 65px; padding: 10px;">
      <NuxtLink to="/dashboard"><KMButton style="width: 148px; margin-left: 80px" message="Home"></KMButton></NuxtLink>
      <NuxtLink to="/omniscience"><KMButton message="Omniscience"></KMButton></NuxtLink>
      <KMButton message="Socials"></KMButton>
      <KMButton message="Botnets"></KMButton>
      <KMButton message="Storage"></KMButton>
      <KMButton message="Bot Schedule"></KMButton>
      <KMButton message="Admin"></KMButton>
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