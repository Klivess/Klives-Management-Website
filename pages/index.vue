<!--Login page-->
<template>
    <div style="height: 100%; width: 100%;" v-on:keyup.enter="onLoginSubmit" v-on:load="AttemptLoginWithCookie">
        <div style="display: grid; justify-content: center; grid-template-rows: 2fr 5fr 5fr; margin-top: 17.5%;">
            <span style="text-align: center;">Klives Management</span>
            <KMInputBox v-model:value="password" style="width: 300px; height: 50px; text-align: center;" type="password" placeholder="Password" />
            <div style="justify-content: center; display: flex;">
                <KMButton ref="LoginButton" @click="onLoginSubmit" style="width: 250px; height:70px;" v-model:message="buttonText"></KMButton>
            </div>
        </div>
    </div>
</template>

<script>
import KMButton from '~/components/KMButton.vue';
import KMInputBox from '~/components/KMInputBox.vue';
import { KliveAPIUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

definePageMeta({layout: 'none'});
export default {
  components: {
    KMButton,
    KMInputBox,
  },
  data(){
    return {
        password: '',
        buttonText: 'Login'
    }
  },
  methods: {
    AttemptLoginWithCookie() {
      const cook = useCookie('password');
      if(cook.value!=""){
        console.log("Attempting login with cookie.");
        this.password=cook.value;
        this.onLoginSubmit();
      }
      else{
        console.log("No cookie found.");
      }
    },
    async onLoginSubmit() {
      this.buttonText = "Logging in";
        const successOrNot = await (await RequestPOSTFromKliveAPI('/KMProfiles/AttemptLogin', JSON.stringify(this.password))).json();
        console.log("Login: "+successOrNot);
        if(successOrNot=="true"){
          const passwordCookie = useCookie('password');
          passwordCookie.value = this.password;
          this.buttonText = "Logged in";
          // Open Dashboard
          this.$router.push('/dashboard');
        }
        else{
          this.buttonText = "Failed";
        }
    },
    async checkIfAPIAccessible(){
      const isAccessible = (await RequestGETFromKliveAPI('/ping')).status;
      if(isAccessible==200){
        console.log("API is accessible.");
      }
      else{
        console.log("API is not accessible.");
        window.location.replace(KliveAPIUrl+"/redirect?redirectURL="+window.location.href);
      }

    }
  },
  async mounted(){
      await this.checkIfAPIAccessible();
      this.AttemptLoginWithCookie();
    },
}
</script>