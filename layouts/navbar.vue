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
        <NuxtLink to="/schemes">
          <KMButton message="Schemes"></KMButton>
        </NuxtLink>
        <NuxtLink to="/klivecloud">
          <KMButton message="KliveCloud"></KMButton>
        </NuxtLink>
        <NuxtLink to="/klivetech">
          <KMButton message="KliveTech"></KMButton>
        </NuxtLink>
        <NuxtLink to="/klivechat">
          <KMButton message="KliveChat"></KMButton>
        </NuxtLink>
        <NuxtLink to="/kliveagent">
          <KMButton message="KliveAgent"></KMButton>
        </NuxtLink>
        <NuxtLink to="/klivetools">
          <KMButton message="KliveTools"></KMButton>
        </NuxtLink>
        <NuxtLink to="/botSchedule">
          <KMButton message="Schedule"></KMButton>
        </NuxtLink>
        <NuxtLink to="/admin">
          <KMButton message="Admin"></KMButton>
        </NuxtLink>
        <NuxtLink v-if="isKlives" to="/omnidefence">
          <KMButton message="OmniDefence"></KMButton>
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
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';

export default {
  name: 'navbarLayout',
  props: {
    
  },
  data() {
    return { isKlives: false };
  },
  async mounted() {
    try {
      const r = await RequestGETFromKliveAPI('/KMProfiles/GetCurrentProfile', false, false);
      if (!r.ok) {
        this.isKlives = false;
        return;
      }
      const profile = await r.json();
      this.isKlives = Number(profile?.KlivesManagementRank) === 5;
    } catch { this.isKlives = false; }
  },
  methods: {
    logOut(){
      console.log("Logging out...");
      const cook = useCookie('password');
      cook.value = "";
      this.$router.push('/');
    }
  }
}
</script>