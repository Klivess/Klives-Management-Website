<template>

</template>

<script>

import { KliveAPIUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI, VerifyLogin } from '~/scripts/APIInterface';

export default{
    name: "AuthenticationManager",
    async mounted (){
        console.log("AuthenticationManager");
        while(true){
            if(this.$route.path != "/" && !this.$route.path.toString().includes("/shared/")){
                await VerifyLogin();
                await new Promise(r => setTimeout(r, 2000));
            }
            else{
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    }
}
</script>