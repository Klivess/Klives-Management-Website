<template>
    <KMInfoGrid columns="1" rows="3">
        <KMInfoBox caption="All Connected Gadgets" style="height: 45em; overflow-y: scroll;" >
            <div style="display: grid; grid-template-columns: 1fr 1fr; overflow-y: scroll; height: 100%;" id="kliveTechGadgetContainer">
                <div style="display: flex; justify-content: center;">
                    <KliveTechGadget></KliveTechGadget>
                </div>
                <div style="display: flex; justify-content: center;">
                    <KliveTechGadget></KliveTechGadget>
                </div>
                <div style="display: flex; justify-content: center;">
                    <KliveTechGadget></KliveTechGadget>
                </div>

            </div>
        </KMInfoBox>
    </KMInfoGrid>
</template>

<script>
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';

definePageMeta({layout: 'navbar'});
export default {
    name: 'KliveTech',
    methods: {
    },
    /*
    async mounted() {
        const allGadgets = await (await RequestGETFromKliveAPI('/klivetech/GetAllGadgets')).json();
    }
        */
};
</script>

<style scoped>

</style>