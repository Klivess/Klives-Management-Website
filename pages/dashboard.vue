<template>
    <KMInfoGrid columns="1" rows="1">
        <KMInfoBox caption="General Statistics">
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 20px;">
                <div style="display: grid; gap: 10px;">
                <span ref="lastUpdateStat" style="font-size: 2em;">Last Update: Loading</span>
                <span ref="totalUptimeStat" style="font-size: 2em;">Total Uptime: Loading</span>
                <span ref="totalLogsStat" style="font-size: 2em;">Total Logs: Loading</span>
                <span ref="totalStatusStat" style="font-size: 1em;">Total Status Logs: Loading</span>
                <span ref="totalErrorStat" style="font-size: 1em;">Total Error Logs: Loading</span>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                <GradientProgress ref="CPUUsageProgressStat" progress="90" caption="CPU Usage"/>
                <GradientProgress ref="RAMUsageProgressStat" progress="24" caption="RAM Usage"/>
            </div>
            <div style="display: grid; gap: 10px;">
                <span ref="klivetechGadgetsConnectedStat" style="font-size: 1.5em;">KliveTech Gadgets Connected: Loading</span>
            </div>

            </div>
    </KMInfoBox>
    </KMInfoGrid>
    <KMInfoGrid columns="2" rows="2">
        <KMInfoBox caption="Service Statistics" style="height: 600px;"><span>hey</span></KMInfoBox>
        <KMInfoBox caption="Scheduled Bot Tasks" style="height: 600px;">
            <KMGridList/>
        </KMInfoBox>
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
    methods: {
        LoadDashboardData(){
            RequestGETFromKliveAPI(KliveAPIUrl + '/dashboard').then((response) => {
                if(response.status == 200){
                    let data = response.data;
                    this.$refs.CPUUsageProgress.SetProgress(data.CPUUsage);
                    this.$refs.RAMUsageProgress.SetProgress(data.RAMUsage);
                }
            });
        }
    },
    mounted(){
        //VerifyLoginLoop();
        this.LoadDashboardData();
    }
}

definePageMeta({ layout: 'navbar' });
</script>