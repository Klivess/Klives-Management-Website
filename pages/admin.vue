<template>
    <KMInfoGrid columns=1 rows=1 rowHeight=320>
        <KMInfoBox caption="Website Analytics">

        </KMInfoBox>
    </KMInfoGrid>
    <KMInfoGrid columns=2 rows=1 rowHeight=460>
        <KMInfoBox caption="Bot Utilities">

        </KMInfoBox>
        <KMInfoBox caption="Manage Profiles">
            <AdminKMProfileList style="height: 280px;"/>
            <KMButton style="height: 100px; margin-top: 30px;" message="Create New Profile" :onclick="hey"></KMButton>
        </KMInfoBox>
    </KMInfoGrid>
</template>

<script>
import KMInfoGrid from '~/components/KMInfoGrid.vue';
import Swal from 'sweetalert2/dist/sweetalert2.js'
import KMGridList from '~/components/KMGridList.vue';
import { NuxtPage } from '#components';

definePageMeta({ layout: 'navbar' });

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