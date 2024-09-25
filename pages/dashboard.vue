<template>
    <KMInfoGrid>
        <KMInfoBox><span>test</span></KMInfoBox>
        <KMInfoBox><span>test</span></KMInfoBox>
        <KMInfoBox><span>test</span></KMInfoBox>
        <KMInfoBox><span>test</span></KMInfoBox>
    </KMInfoGrid>
</template>

<script>
import KMInfoGrid from '~/components/KMInfoGrid.vue';
import KMInfoBox from '~/components/KMInfoBox.vue';
import { KliveAPIUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
export default {
    data(){
        return  {
            QuickActionsBoxWidth: 2,
        }
    },
    mounted(){
        //VerifyLoginLoop();
    }
}

definePageMeta({ layout: 'navbar' });
</script>