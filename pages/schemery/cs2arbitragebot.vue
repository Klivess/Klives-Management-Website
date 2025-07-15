<template>
    <div class="p-4">
        <div class="flex items-center justify-between mb-4">
            <h1 class="text-2xl font-bold">CS2 Arbitrage Bot Analytics</h1>
            <NuxtLink to="/schemes" class="w-48">
                <KMButton message="Back to Schemes" />
            </NuxtLink>
        </div>

        <!-- Top Level Grid -->
        <KMInfoGrid columns="3" rows="1" rowHeight="450">
            <!-- Column 1: Key Metrics -->
            <KMInfoBox caption="Key Metrics">
                <div class="flex flex-col space-y-3 p-2">
                    <p><strong>Total Listings Scanned:</strong> {{ analyticsData.TotalListingsScanned?.toLocaleString() }}</p>
                    <p><strong>Total Expected Profit %:</strong> {{ analyticsData.TotalExpectedProfitPercent?.toFixed(2) }}%</p>
                    <p><strong>Chance of Positive Gain:</strong> {{ analyticsData.PercentageChanceOfFindingPositiveGainListing?.toFixed(2) }}%</p>
                    <p><strong>Time of Analytics being
                         Generated:</strong> <br/>{{ new Date(analyticsData.AnalyticsGeneratedAt).toLocaleString() }}</p>
                    <p><strong>Earliest Listing Scanned:</strong> <br/>{{ new Date(analyticsData.FirstListingDateRecorded).toLocaleString() }}</p>
                </div>
            </KMInfoBox>

            <!-- Column 2: Profitability Analysis -->
            <KMInfoBox caption="Profitability Analysis">
                 <KMInfoGrid columns="2" rows="1" rowHeight="400">
                     <KMInfoBox caption="Profitable">
                        <div class="flex flex-col space-y-2 p-1">
                            <p><strong>Count:</strong> {{ analyticsData.CountListingsWithPositiveGain?.toLocaleString() }}</p>
                            <p><strong>Mean Gain:</strong> {{ analyticsData.MeanGainOfProfitableListings?.toFixed(2) }}%</p>
                            <p><strong>Mean Price:</strong> £{{ analyticsData.MeanPriceOfProfitableListings?.toFixed(2) }}</p>
                            <p><strong>Mean Float:</strong> {{ analyticsData.MeanFloatValueOfProfitableListings?.toPrecision(5) }}</p>
                        </div>
                     </KMInfoBox>
                     <KMInfoBox caption="Unprofitable">
                        <div class="flex flex-col space-y-2 p-1">
                            <p><strong>Count:</strong> {{ analyticsData.CountListingsWithNegativeGain?.toLocaleString() }}</p>
                            <p><strong>Mean Price:</strong> £{{ analyticsData.MeanPriceOfUnprofitableListings?.toFixed(2) }}</p>
                            <p><strong>Mean Float:</strong> {{ analyticsData.MeanFloatValueOfUnprofitableListings?.toPrecision(5) }}</p>
                        </div>
                     </KMInfoBox>
                </KMInfoGrid>
            </KMInfoBox>

            <!-- Column 3: Best Find & Controls -->
             <KMInfoBox caption="Best Find & Controls">
                <div class="flex flex-col space-y-2 p-2 mb-4">
                    <p><strong>Item:</strong> <br/>{{ analyticsData.NameOfItemWithHighestPredictedGain }}</p>
                    <p><strong>Highest Gain Found:</strong> {{ analyticsData.HighestPredictedGainFoundSoFar?.toFixed(2) }}%</p>
                </div>
                <div class="p-2">
                    <KMButton message="Refresh Data" @click="fetchData" />
                </div>
            </KMInfoBox>
        </KMInfoGrid>

        <!-- Gain Buckets Grid -->
        <h2 class="text-xl font-bold mt-6 mb-2">Listings by Gain Percentage</h2>
        <KMInfoGrid columns="5" rows="1" rowHeight="150" class="mt-4">
            <KMInfoBox caption="< 0% Gain">
                <p><strong>Count:</strong> {{ analyticsData.NumberOfListingsBelow0PercentGain?.toLocaleString() }}</p>
                <p><strong>Mean Price:</strong> £{{ analyticsData.MeanPriceOfListingsBelow0PercentGain?.toFixed(2) }}</p>
            </KMInfoBox>
            <KMInfoBox caption="0-5% Gain">
                 <p><strong>Count:</strong> {{ analyticsData.NumberOfListingsBetween0And5PercentGain?.toLocaleString() }}</p>
                <p><strong>Mean Price:</strong> £{{ analyticsData.MeanPriceOfListingsBetween0And5PercentGain?.toFixed(2) }}</p>
            </KMInfoBox>
            <KMInfoBox caption="5-10% Gain">
                 <p><strong>Count:</strong> {{ analyticsData.NumberOfListingsBetween5And10PercentGain?.toLocaleString() }}</p>
                <p><strong>Mean Price:</strong> £{{ analyticsData.MeanPriceOfListingsBetween5And10PercentGain?.toFixed(2) }}</p>
            </KMInfoBox>
            <KMInfoBox caption="10-20% Gain">
                 <p><strong>Count:</strong> {{ analyticsData.NumberOfListingsBetween10And20PercentGain?.toLocaleString() }}</p>
                <p><strong>Mean Price:</strong> £{{ analyticsData.MeanPriceOfListingsBetween10And20PercentGain?.toFixed(2) }}</p>
            </KMInfoBox>
            <KMInfoBox caption="> 20% Gain">
                 <p><strong>Count:</strong> {{ analyticsData.NumberOfListingsAbove20PercentGain?.toLocaleString() }}</p>
                <p><strong>Mean Price:</strong> £{{ analyticsData.MeanPriceOfListingsAbove20PercentGain?.toFixed(2) }}</p>
            </KMInfoBox>
        </KMInfoGrid>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import KMInfoGrid from '~/components/KMInfoGrid.vue';
import KMInfoBox from '~/components/KMInfoBox.vue';
import KMButton from '~/components/KMButton.vue';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';

definePageMeta({ layout: 'navbar' });

// Define the structure of the analytics data based on the C# class
interface AnalyticsData {
    NumberOfListingsBelow0PercentGain: number;
    MeanPriceOfListingsBelow0PercentGain: number;
    NumberOfListingsBetween0And5PercentGain: number;
    MeanPriceOfListingsBetween0And5PercentGain: number;
    NumberOfListingsBetween5And10PercentGain: number;
    MeanPriceOfListingsBetween5And10PercentGain: number;
    NumberOfListingsBetween10And20PercentGain: number;
    MeanPriceOfListingsBetween10And20PercentGain: number;
    NumberOfListingsAbove20PercentGain: number;
    MeanPriceOfListingsAbove20PercentGain: number;
    TotalListingsScanned: number;
    HighestPredictedGainFoundSoFar: number;
    NameOfItemWithHighestPredictedGain: string;
    CountListingsWithPositiveGain: number;
    CountListingsWithNegativeGain: number;
    PercentageChanceOfFindingPositiveGainListing: number;
    MeanFloatValueOfProfitableListings: number;
    MeanPriceOfProfitableListings: number;
    MeanPriceOfUnprofitableListings: number;
    MeanFloatValueOfUnprofitableListings: number;
    MeanGainOfProfitableListings: number;
    TotalExpectedProfitPercent: number;
    FirstListingDateRecorded: string; // Use string for ISO date format
    AnalyticsGeneratedAt: string; // Use string for ISO date
}

const analyticsData = ref<AnalyticsData>({
    NumberOfListingsBelow0PercentGain: 0,
    MeanPriceOfListingsBelow0PercentGain: 0,
    NumberOfListingsBetween0And5PercentGain: 0,
    MeanPriceOfListingsBetween0And5PercentGain: 0,
    NumberOfListingsBetween5And10PercentGain: 0,
    MeanPriceOfListingsBetween5And10PercentGain: 0,
    NumberOfListingsBetween10And20PercentGain: 0,
    MeanPriceOfListingsBetween10And20PercentGain: 0,
    NumberOfListingsAbove20PercentGain: 0,
    MeanPriceOfListingsAbove20PercentGain: 0,
    TotalListingsScanned: 0,
    HighestPredictedGainFoundSoFar: 0,
    NameOfItemWithHighestPredictedGain: '',
    CountListingsWithPositiveGain: 0,
    CountListingsWithNegativeGain: 0,
    PercentageChanceOfFindingPositiveGainListing: 0,
    MeanFloatValueOfProfitableListings: 0,
    MeanPriceOfProfitableListings: 0,
    MeanPriceOfUnprofitableListings: 0,
    MeanFloatValueOfUnprofitableListings: 0,
    MeanGainOfProfitableListings: 0,
    TotalExpectedProfitPercent: 0,
    FirstListingDateRecorded: new Date().toISOString(),
    AnalyticsGeneratedAt: new Date().toISOString(),
});

// Fetch data function (mocked for this example)
function fetchData() {
    RequestGETFromKliveAPI("/cs2arbitragebot/getscanalytics").then(response => {
        if(response.status === 200) {
            response.json().then(data => {
                analyticsData.value = data;
            });
        } else {
            alert("Failed to fetch analytics data.");
            window.location.replace("/schemes");
        }
    });
}

// Lifecycle hook to fetch data when the component is mounted
onMounted(() => {
    fetchData();
});

</script>

<style scoped>
/* Add any component-specific styles here */
</style>