<template>
    <div class="km-profile-list">
        <KMGridList ref="profileList"
            :items="profileItems"
            buttonColor="#23252B"
            buttonBorderColor="#212127"
            textColor = "#39489E"></KMGridList>
    </div>
</template>

<script>
import { KliveAPIUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI, KMPermissions } from '~/scripts/APIInterface';

export default {
    name: 'KMProfileList',
    data() {
        return {
            // Define your component data properties here
            profileItems: []
        }
    },
    methods: {
        // Add your methods here
    },
    /*
    mounted() {
        // Component mounted lifecycle hook
        RequestGETFromKliveAPI('/KMProfiles/GetAllProfiles').then((response) => {
            if(response.status == 200){
                response.json().then((data) => {
                    // Sort data in ascending order of KlivesManagementRank
                    data = data.sort((a, b) => a.KlivesManagementRank - b.KlivesManagementRank);
                    data = data.reverse();
                    data.forEach(element => {
                        let textRankColor = "#39489E"
                        if(element.KlivesManagementRank == 5)
                        {
                            textRankColor = "red";
                        }
                        else if(element.KlivesManagementRank == 4)
                        {
                            textRankColor = "orange";
                        }
                        else if(element.KlivesManagementRank == 3)
                        {
                            textRankColor = "yellow";
                        }
                        else if(element.KlivesManagementRank == 2)
                        {
                            textRankColor = "green";
                        }
                        else if(element.KlivesManagementRank == 1)
                        {
                            textRankColor = "#39489E";
                        }
                        this.profileItems.push({
                            name: element.Name + " - " + KMPermissions[element.KlivesManagementRank],
                            id: element.UserID,
                            textColor: textRankColor,
                            click : () => {
                                window.location.replace("/profilepage?userID=" + element.UserID);
                            }
                        });
                    });
                });
            }
        });
    }
        */
}
</script>

<style scoped>
/* Add your component styles here */
.km-profile-list {
    /* Styling rules */
}
</style>