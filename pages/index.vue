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

<script setup>
definePageMeta({layout: 'none'});
</script>

<script>
import KMButton from '~/components/KMButton.vue';
import KMInputBox from '~/components/KMInputBox.vue';
import { KliveAPIUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
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
      if(cook.value!=""&&cook.value!=null&&cook.value!=undefined&&cook.value!="undefined"){
        console.log("Attempting login with cookie.");
        this.password=cook.value;
        this.onLoginSubmit();
      }
      else{
        console.log("No cookie found.");
      }
    },
    async onLoginSubmit() {
      try{
              this.buttonText = "Logging in";
        const successOrNot = await (await RequestPOSTFromKliveAPI('/KMProfiles/AttemptLogin', JSON.stringify(this.password), false)).json();
        console.log("Login: "+successOrNot);
        if(successOrNot=='true'){
          const passwordCookie = useCookie('password');
          passwordCookie.value = this.password;
          this.buttonText = "Logged in";
          // Open Dashboard
          this.$router.push('/dashboard');
        }
        else if(successOrNot=='LoginDisabled'){
          this.buttonText = "Login Disabled";
        }
        else{
          this.buttonText = "Failed";
        }
      }
      catch(e){
        console.error("Error during login: ", e);
        this.buttonText = "Error";
        return;
      }
    },
  },
  async mounted(){
      this.AttemptLoginWithCookie();
    },
}
</script>