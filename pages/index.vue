<!--Login page-->
<template>
    <div style="height: 100%; width: 100%;">
        <div style="display: grid; justify-content: center; grid-template-rows: 2fr 5fr 5fr; margin-top: 17%;">
            <span style="text-align: center;">Login</span>
            <KMInputBox v-model:value="password" style="width: 300px; height: 50px; text-align: center;" type="password" placeholder="Password" />
            <div style="justify-content: center; display: flex;">
                <KMButton @click="onLoginSubmit" style="width: 250px; height:70px;" message="Login"></KMButton>
            </div>
            <input type="text" v-model="testInput" name="" id="">
        </div>
    </div>
</template>

<script>
import KMButton from '~/components/KMButton.vue';
import KMInputBox from '~/components/KMInputBox.vue';
import { KliveAPIUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

export default {
  layout: 'none',  
  components: {
    KMButton,
    KMInputBox,
  },
  data(){
    return {
        password: '',
    }
  },
  methods: {
    async onLoginSubmit() {
      const successOrNot = await RequestPOSTFromKliveAPI('/KMProfiles/AttemptLogin', JSON.stringify(this.password));
      console.log("Login: "+successOrNot);
      if(successOrNot=="true"){
        const passwordCookie = useCookie('password');
        passwordCookie.value = this.password;
      }
    },
  }
}
</script>