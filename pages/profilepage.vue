<template>
<KMInfoGrid columns="2" rows="1" rowHeight="340">
    <KMInfoBox caption="Modify User Profile">
        <p>Name</p>
        <KMInputBox v-model:value="userName" style="width: 400px; margin-top: 10px; margin-bottom: 10px;" ></KMInputBox>
        <p>Password</p>
        <KMInputBox v-model:value="userPassword" style="width: 400px; margin-top: 10px; margin-bottom: 10px;" ></KMInputBox>
        <p>Rank</p>
        <KMSelectBox v-model:selected="userRank" :options="rankOptions" style="width: 400px; margin-top: 10px; margin-bottom: 10px;"></KMSelectBox>
        <KMCheckBox v-bind:checked="canLogin" id="canLoginCheckbox" message="Can Login"></KMCheckBox>
    </KMInfoBox>
    <KMInfoBox caption="User Info">
        <p ref="creationDate">Creation Date: Loading...</p>
    </KMInfoBox>
</KMInfoGrid>
<KMInfoGrid columns="2" rows="1">
    <KMInfoBox caption="Modify">
        <KMButton :message="buttonMessage" :onclick="ModifyProfile" style="height: 200px;"></KMButton>
    </KMInfoBox>
    <KMInfoBox caption="Actions">
        <KMButton textColor="red" :onclick="DeleteProfile" message="Delete Profile" style="height: 200px;" ></KMButton>
    </KMInfoBox>
</KMInfoGrid>
</template>

<script>
definePageMeta({ layout: 'navbar' });
import { KliveAPIUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';


export default {
    name: "AdminProfilePage",
    data() {
        return {
            userID: "",
            profileInfo: {
                name: "",
                password: "",
                rank: "",
                canLogin: false
            },
            rankOptions: [
                "Guest",
                "Manager",
                "Associate",
                "Admin",
                "Klives"
            ],
            buttonMessage: 'Modify Profile',
            userName: "",
            userPassword: "",
            userRank: "Guest",
            canLogin: false
        };
    },
    methods: {
        GetProfileInfo(){
            //Get profile info from server
            RequestGETFromKliveAPI('/KMProfiles/GetProfileByID?id='+this.userID).then(async (response) => {
                if(response.status == 200)
                {
                    let data = await response.json();
                    this.userName = data.Name;
                    this.userPassword = data.Password;
                    let date = new Date(data.CreationDate);
                    this.$refs.creationDate.innerText = "Creation Date: " + date.toLocaleDateString() + " " + date.toLocaleTimeString();
                    this.userRank = this.rankOptions[data.KlivesManagementRank - 1];
                    this.canLogin = data.CanLogin;
                    if(this.canLogin==true){
                        document.getElementById("canLoginCheckbox").click();
                    }
                }
                else
                {
                    alert("Failed to get profile info");
                    window.location.replace("/");
                }
            });
        },
        DeleteProfile(){
            RequestPOSTFromKliveAPI('/KMProfiles/DeleteProfile?id='+this.userID).then(async (response) => {
                if(response.status == 200)
                {
                    alert("Profile Deleted");
                    window.location.replace("/admin");
                }
            });
        },
        async ChangeCanLogin(){
            await RequestPOSTFromKliveAPI('/KMProfiles/ChangeCanLogin?id='+this.userID+"&enabled="+this.canLogin.toString()).then(async (response) => {});
        },
        async ChangeName(){
            await RequestPOSTFromKliveAPI('/KMProfiles/ChangeProfileName?id='+this.userID+"&name="+this.userName).then(async (response) => {});
        },
        async ChangePassword(){
            await RequestPOSTFromKliveAPI('/KMProfiles/ChangeProfilePassword?id='+this.userID, this.userPassword, false).then(async (response) => {});
        },
        async ChangeRank(){
            let rank = this.rankOptions.indexOf(this.userRank) + 1;
            await RequestPOSTFromKliveAPI('/KMProfiles/ChangeProfileRank?id='+this.userID+"&rank="+rank).then(async (response) => {});
        },
        async ModifyProfile(){
            this.buttonMessage = "Modifying...";
            await this.ChangeName();
            await this.ChangePassword();
            await this.ChangeRank();
            await this.ChangeCanLogin();
            alert("Profile Modified");
            this.buttonMessage = "Modify Profile";
        }
    },
    mounted() {
        //Set userID to url query parameter userID
        this.userID = this.$route.query.userID;
        this.GetProfileInfo();
    },
};
</script>

<style scoped>
.admin-profile-page {
    /* add your styles here */
}
</style>