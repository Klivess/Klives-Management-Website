<template>
    <KMInfoGrid columns="1" rows="1">
        <KMInfoBox caption="General Statistics">
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 20px;">
                <div style="display: grid; gap: 10px;">
                    <span ref="lastUpdateStat" style="font-size: 1.6em;">Last Update: Loading</span>
                    <span ref="totalUptimeStat" style="font-size: 1.5em;">Total Uptime: Loading</span>
                    <span ref="totalLogsStat" style="font-size: 1em;">Total Logs: Loading</span>
                    <span ref="totalStatusStat" style="font-size: 1em;">Total Status Logs: Loading</span>
                    <span ref="totalErrorStat" style="font-size: 1em;">Total Error Logs: Loading</span>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <GradientProgress ref="CPUUsageProgressStat" progress="90" caption="CPU Usage"/>
                    <GradientProgress ref="RAMUsageProgressStat" progress="24" caption="RAM Usage"/>
                </div>
                <div style="display: grid; gap: 10px;">
                    <span ref="klivetechGadgetsConnectedStat" style="font-size: 1.5em;">KliveTech Gadgets Connected: Loading</span>
                    <KMButton message="Update Omnipotent"></KMButton>
                </div>
            </div>
        </KMInfoBox>
    </KMInfoGrid>
    <KMInfoGrid columns="2" rows="2" rowHeight="600">
        <KMInfoBox caption="Service Statistics"><span>hey</span></KMInfoBox>
        <KMInfoBox caption="Scheduled Bot Tasks">
            <KMGridList>

            </KMGridList>
        </KMInfoBox>
    </KMInfoGrid>
</template>

<script>
import KMInfoGrid from '~/components/KMInfoGrid.vue';
import KMInfoBox from '~/components/KMInfoBox.vue';
import { KliveAPIUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import KMGridList from '~/components/KMGridList.vue';
export default {
    data(){
        return  {
            QuickActionsBoxWidth: 2,
        }
    },
    methods: {
        LoadDashboardData(){
            RequestGETFromKliveAPI('/GeneralBotStatistics/GetFrontpageStats').then((response) => {
                if(response.status == 200){
                    response.json().then((data) => {
                        this.$refs.totalUptimeStat.innerText = `Total Uptime: ${data.BotUptimeHumanized}`;
                        this.$refs.totalLogsStat.innerText = `Total Logs: ${data.TotalLogs}`;
                        this.$refs.totalStatusStat.innerText = `Total Status Logs: ${data.TotalStatusLogs}`;
                        this.$refs.totalErrorStat.innerText = `Total Error Logs: ${data.TotalErrorLogs}`;
                        if(data.ConnectedKliveGadgets != null){
                            this.$refs.klivetechGadgetsConnectedStat.innerText = `KliveTech Gadgets Connected: ${data.ConnectedKliveGadgets.length}`;
                        }
                        else{
                            this.$refs.klivetechGadgetsConnectedStat.innerText = `KliveTech Gadgets Connected: 0`;
                        }
                        let lastUpdate = new Date(data.lastOmnipotentUpdate);
                        this.$refs.lastUpdateStat.innerText = `Last Update: ${lastUpdate.toLocaleString()}`;
                        this.$refs.CPUUsageProgress.SetProgress(data.CPUUsage);
                        this.$refs.RAMUsageProgress.SetProgress(data.RAMUsage);
                    });
                }
            });
        }
    },
    /*
    mounted(){
        this.LoadDashboardData();
        setInterval(() => {
            this.LoadDashboardData();
        }, 5000);
    }
        */
}

definePageMeta({ layout: 'navbar' });
</script>