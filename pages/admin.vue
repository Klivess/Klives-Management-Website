<template>
    <div>
    <KMInfoGrid columns=1 rows=1 rowHeight=320>
        <KMInfoBox caption="Website Analytics">

        </KMInfoBox>
    </KMInfoGrid>
    <KMInfoGrid columns=2 rows=1 rowHeight=460>
        <KMInfoBox caption="Bot Utilities">
                <NuxtLink to="/administration/botlogs">
            <KMButton message="Bot Logs" style="height: 100px; width: 100%; margin-top: 30px;">
            </KMButton>
                </NuxtLink>
        </KMInfoBox>
        <KMInfoBox caption="Manage Profiles">
            <AdminKMProfileList style="height: 280px;"/>
            <KMButton style="height: 100px; margin-top: 30px;" message="Create New Profile" :onclick="hey"></KMButton>
        </KMInfoBox>
    </KMInfoGrid>
    </div>
</template>

<script setup>
definePageMeta({ layout: 'navbar' });
</script>

<script>
import KMInfoGrid from '~/components/KMInfoGrid.vue';
import Swal from 'sweetalert2/dist/sweetalert2.js'
import KMGridList from '~/components/KMGridList.vue';
import { NuxtPage } from '#components';

export default {
    methods:
    {
        hey(){
            window.location.replace("/createprofile");
        }
    }
}
</script>
<style scoped>
/* Add your styles here */
</style>