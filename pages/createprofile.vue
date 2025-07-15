<template>
    <KMInfoGrid columns="1" rows="2" rowHeight="350">
        <KMInfoBox caption="Create Profile">
            <div style="display: grid; justify-content: center;">
            <p>Name</p>
            <KMInputBox v-model:value="userName" placeholder="Name" style="width: 400px; margin-top: 10px; margin-bottom: 10px;"/>
            <p>Password</p>
            <KMInputBox v-model:value="userPassword" type="password" placeholder="Password" style="width: 400px; margin-top: 10px; margin-bottom: 10px;"/>
            <p>Rank</p>
            <KMSelectBox v-model:selected="userRank" :options="rankOptions" style="margin-top: 10px; margin-bottom: 10px;" ref="rankSelectBox"/>
            </div>
        </KMInfoBox>
        <KMInfoBox caption="Execute">
            <div style="display: flex; justify-content: center;">
                <KMButton :onclick="CreateProfile" ref="createButton" :message="buttonMessage" style="width: 500px; height: 200px"/>
            </div>
        </KMInfoBox>
    </KMInfoGrid>
</template>

<script setup>
definePageMeta({ layout: 'navbar' });
</script>

<script>
import { KliveAPIUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

export default {
    name: 'CreateProfile',
    data() {
        return {
            rankOptions: [
                "Guest",
                "Manager",
                "Associate",
                "Admin",
                "Klives"
            ],
            buttonMessage: 'Create Profile',
            userName: "",
            userPassword: "",
            userRank: "Guest"
        };
    },
    methods: {
        CreateProfile() {
            // Create profile logic goes here
            this.buttonMessage = "Creating Profile....";
            //get index of userRank in rankOptions
            let rankIndex = this.rankOptions.indexOf(this.userRank)+1;
            RequestPOSTFromKliveAPI('/KMProfiles/CreateProfile?name='+this.userName+"&password="+this.userPassword+"&rank="+rankIndex).then((response) => {
                if(response.status == 200)
                {
                    this.buttonMessage = "Created!";
                    window.location.replace("/admin");
                }
                else if(response.status == 403){
                    alert("The server refused to do this. You probably tried to create a rank higher than yourself.")
                    this.buttonMessage = "Failed!";
                }
                else if(response.status=500)
                {
                    alert("The server just threw an error. This is probably a bug. :((");
                    this.buttonMessage = "Failed!";
                }
            });
        }
    },
    mounted() {
    }
};
</script>

<style scoped>
/* Component-specific styles */
.create-profile {
    padding: 20px;
}
</style>