<template>
    <div>
    <KMInfoGrid columns="1" rows="1">
        <KMInfoBox caption="General Statistics">
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 20px;">
                <div style="display: grid; gap: 10px;">
                    <span v-if="pending" style="font-size: 1.6em;">Last Update: Loading</span>
                    <span v-else-if="error" style="font-size: 1.6em;">Last Update: Error</span>
                    <span v-else style="font-size: 1.6em;">Last Update: {{ lastUpdate }}</span>

                    
                    <span ref="totalUptimeStat" style="font-size: 1.5em;">Total Uptime: Loading</span>
                    <span ref="totalLogsStat" style="font-size: 1em;">Total Logs: Loading</span>
                    <span ref="totalStatusStat" style="font-size: 1em;">Total Status Logs: Loading</span>
                    <span ref="totalErrorStat" style="font-size: 1em;">Total Error Logs: Loading</span>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <GradientProgress ref="CPUUsageProgressStat" :progress="90" caption="CPU Usage"/>
                    <GradientProgress ref="RAMUsageProgressStat" :progress="24" caption="RAM Usage"/>
                </div>
                <div style="display: grid; gap: 10px;">
                    <span ref="klivetechGadgetsConnectedStat" style="font-size: 1.5em;">KliveTech Gadgets Connected: Loading</span>
                    <KMButton message="Update Omnipotent"></KMButton>
                </div>
            </div>
        </KMInfoBox>
    </KMInfoGrid>
    <KMInfoGrid columns="2" rows="2" rowHeight="600">
        <KMInfoBox caption="Service Statistics">
                    <span>still working on this entire page</span>
        </KMInfoBox>
        <KMInfoBox caption="Scheduled Bot Tasks">

        </KMInfoBox>
    </KMInfoGrid>
    </div>
</template>

<script setup>
definePageMeta({ layout: 'navbar' });
</script>

<script>
import KMInfoGrid from '~/components/KMInfoGrid.vue';
import KMInfoBox from '~/components/KMInfoBox.vue';
import { KliveAPIUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import KMGridList from '~/components/KMGridList.vue';
export default {
    data(){
        return  {
            pending: false,
            error: null,
            lastUpdate: 'Never',
            loadInterval: null
        }
    },
    methods: {
        LoadDashboardData(){
            this.pending = true;
            this.error = null;
            
            RequestGETFromKliveAPI('/GeneralBotStatistics/GetFrontpageStats').then((response) => {
                this.pending = false;
                this.lastUpdate = new Date().toLocaleString();
                // Handle response data here when the API returns actual data
            }).catch((err) => {
                this.pending = false;
                this.error = err;
                this.lastUpdate = 'Error loading data';
            });
        }
    },
    mounted(){
        this.LoadDashboardData();
        this.loadInterval = setInterval(() => {
            this.LoadDashboardData();
        }, 5000);
    },
    beforeUnmount(){
        if (this.loadInterval) {
            clearInterval(this.loadInterval);
        }
    }
}
</script>