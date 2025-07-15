<template>
    <div class="cs2-analytics-container">
        <!-- Modern Header -->
        <div class="page-header">
            <div class="header-left">
                <NuxtLink to="/schemes" class="back-button">
                    <div class="back-button-wrapper">
                        <KMButton message="← Back to Schemes" textColor="#4d9e39" style="width: 400px;" />
                    </div>
                </NuxtLink>
            </div>
            <div class="header-center">
                <h1 class="page-title">CS2 Arbitrage Analytics</h1>
                <p class="page-subtitle">Real-time market analysis and profit opportunities</p>
            </div>
            <div class="header-right">
                <div class="refresh-button" style="width: 200px;" @click="fetchData">
                    <KMButton 
                        :message="isLoading ? '⏳ Loading...' : 'Refresh'"
                        :textColor="isLoading ? '#969696' : '#4d9e39'"
                    />
                </div>
            </div>
        </div>

        <!-- Key Performance Indicators -->
        <CS2OverviewSection 
            title="🎯 Key Performance Indicators"
            subtitle="Key metrics from the bot"
        >
            <KMInfoGrid columns="4" rows="1" rowHeight="240" style="padding-bottom: 60px; padding-top: 10px; padding-right: 30px;">
                <CS2MetricCard
                    :value="analyticsData.PercentageChanceOfFindingPositiveGainListing"
                    label="Success Rate"
                    format="percentage"
                    variant="success"
                    icon="📈"
                    :highlight="analyticsData.PercentageChanceOfFindingPositiveGainListing > 5"
                />
                <CS2MetricCard
                    :value="analyticsData.TotalListingsScanned"
                    label="Items Scanned"
                    format="count"
                    variant="info"
                    icon="🔍"
                />
                <CS2MetricCard
                    :value="analyticsData.MeanGainOfProfitableListings"
                    label="Avg Profit Margin"
                    format="gain-percentage"
                    variant="success"
                    icon="💰"
                />
                <CS2MetricCard
                    :value="analyticsData.HighestPredictedGainFoundSoFar"
                    label="Best Find"
                    format="gain-percentage"
                    variant="warning"
                    icon="🏆"
                    :highlight="true"
                />
            </KMInfoGrid>
        </CS2OverviewSection>

        <!-- Market Analysis -->
        <CS2OverviewSection 
            title="📊 Market Analysis"
            subtitle="Profitable vs unprofitable listing comparison"
        >
            <KMInfoGrid columns="3" rows="1" rowHeight="280">
                <KMInfoBox caption="💎 Best Opportunity">
                    <div class="best-find-card">
                        <div class="item-name">{{ analyticsData.NameOfItemWithHighestPredictedGain || 'No item found' }}</div>
                        <div class="profit-gain">+{{ ((analyticsData.HighestPredictedGainFoundSoFar - 1) * 100)?.toFixed(2) }}%</div>
                        <div class="find-subtitle">Highest profit potential</div>
                    </div>
                </KMInfoBox>
                
                <KMInfoBox caption="✅ Profitable Listings">
                    <div class="comparison-stats">
                        <CS2MetricCard
                            :value="analyticsData.CountListingsWithPositiveGain"
                            label="Count"
                            format="count"
                            variant="success"
                        />
                        <div class="stats-grid">
                            <div class="stat-item">
                                <span class="stat-label">Avg Price:</span>
                                <span class="stat-value">£{{ analyticsData.MeanPriceOfProfitableListings?.toFixed(2) }}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Avg Float:</span>
                                <span class="stat-value">{{ analyticsData.MeanFloatValueOfProfitableListings?.toFixed(4) }}</span>
                            </div>
                        </div>
                    </div>
                </KMInfoBox>
                
                <KMInfoBox caption="❌ Unprofitable Listings">
                    <div class="comparison-stats">
                        <CS2MetricCard
                            :value="analyticsData.CountListingsWithNegativeGain"
                            label="Count"
                            format="count"
                            variant="danger"
                        />
                        <div class="stats-grid">
                            <div class="stat-item">
                                <span class="stat-label">Avg Price:</span>
                                <span class="stat-value">£{{ analyticsData.MeanPriceOfUnprofitableListings?.toFixed(2) }}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Avg Float:</span>
                                <span class="stat-value">{{ analyticsData.MeanFloatValueOfUnprofitableListings?.toFixed(4) }}</span>
                            </div>
                        </div>
                    </div>
                </KMInfoBox>
            </KMInfoGrid>
        </CS2OverviewSection>

        <!-- Gain Distribution -->
        <CS2OverviewSection 
            title="📈 Profit Distribution Analysis"
            subtitle="How listings are distributed across profit margins"
        >
            <KMInfoGrid columns="1" rows="1" rowHeight="600">
                <KMInfoBox caption="Gain Distribution by Percentage">
                    <div class="distribution-container">
                        <CS2GainDistributionBar
                            label="< 0% (Loss)"
                            :count="analyticsData.NumberOfListingsBelow0PercentGain"
                            :meanPrice="analyticsData.MeanPriceOfListingsBelow0PercentGain"
                            :total="analyticsData.TotalListingsScanned"
                            gainType="negative"
                        />
                        <CS2GainDistributionBar
                            label="0-5% (Low Profit)"
                            :count="analyticsData.NumberOfListingsBetween0And5PercentGain"
                            :meanPrice="analyticsData.MeanPriceOfListingsBetween0And5PercentGain"
                            :total="analyticsData.TotalListingsScanned"
                            gainType="low"
                        />
                        <CS2GainDistributionBar
                            label="5-10% (Medium Profit)"
                            :count="analyticsData.NumberOfListingsBetween5And10PercentGain"
                            :meanPrice="analyticsData.MeanPriceOfListingsBetween5And10PercentGain"
                            :total="analyticsData.TotalListingsScanned"
                            gainType="medium"
                        />
                        <CS2GainDistributionBar
                            label="10-20% (High Profit)"
                            :count="analyticsData.NumberOfListingsBetween10And20PercentGain"
                            :meanPrice="analyticsData.MeanPriceOfListingsBetween10And20PercentGain"
                            :total="analyticsData.TotalListingsScanned"
                            gainType="high"
                        />
                        <CS2GainDistributionBar
                            label="> 20% (Excellent Profit)"
                            :count="analyticsData.NumberOfListingsAbove20PercentGain"
                            :meanPrice="analyticsData.MeanPriceOfListingsAbove20PercentGain"
                            :total="analyticsData.TotalListingsScanned"
                            gainType="excellent"
                        />
                    </div>
                </KMInfoBox>
            </KMInfoGrid>
        </CS2OverviewSection>

        <!-- System Information -->
        <CS2OverviewSection 
            title="ℹ️ System Information"
            subtitle="Analytics generation and data timeline"
        >
            <KMInfoGrid columns="2" rows="1" rowHeight="320" style="padding-bottom: 50px; padding-top: 10px;">
                <CS2MetricCard
                    :value="analyticsData.AnalyticsGeneratedAt"
                    label="Last Updated"
                    :subtitle="getTimeAgo(analyticsData.AnalyticsGeneratedAt)"
                    format="date"
                    variant="info"
                    icon="🕒"
                />
                <CS2MetricCard
                    :value="analyticsData.FirstListingDateRecorded"
                    label="Data Since"
                    :subtitle="getDaysAgo(analyticsData.FirstListingDateRecorded)"
                    format="date"
                    variant="info"
                    icon="📅"
                />
            </KMInfoGrid>
        </CS2OverviewSection>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import KMInfoGrid from '~/components/KMInfoGrid.vue';
import KMInfoBox from '~/components/KMInfoBox.vue';
import KMButton from '~/components/KMButton.vue';
import CS2MetricCard from '~/components/CS2MetricCard.vue';
import CS2OverviewSection from '~/components/CS2OverviewSection.vue';
import CS2GainDistributionBar from '~/components/CS2GainDistributionBar.vue';
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
    FirstListingDateRecorded: string;
    AnalyticsGeneratedAt: string;
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

const isLoading = ref(false);

// Utility functions for time calculations
const getTimeAgo = (dateString: string): string => {
    if (!dateString) return '';
    const now = new Date();
    const past = new Date(dateString);
    const diffMs = now.getTime() - past.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffHours > 0) {
        return `${diffHours}h ${diffMinutes}m ago`;
    } else {
        return `${diffMinutes}m ago`;
    }
};

const getDaysAgo = (dateString: string): string => {
    if (!dateString) return '';
    const now = new Date();
    const past = new Date(dateString);
    const diffMs = now.getTime() - past.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    return `${diffDays} days of data`;
};

// Fetch data function
const fetchData = async () => {
    isLoading.value = true;
    try {
        const response = await RequestGETFromKliveAPI("/cs2arbitragebot/getscanalytics");
        if (response.status === 200) {
            const data = await response.json();
            analyticsData.value = data;
            console.log('Analytics data loaded successfully:', data);
        } else {
            alert("Failed to fetch analytics data.");
            window.location.replace("/schemes");
        }
    } catch (error) {
        console.error('Error fetching analytics data:', error);
        alert("Error loading analytics data.");
    } finally {
        isLoading.value = false;
    }
};

// Lifecycle hook to fetch data when the component is mounted
onMounted(() => {
    fetchData();
});

</script>

<style scoped>
.cs2-analytics-container {
  min-height: 100vh;
  background-color: #201f20;
  padding: 2rem 1rem;
}

.cs2-header {
  background-color: #161616;
  border-radius: 20px;
  padding: 2rem;
  margin-bottom: 2rem;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(77, 158, 57, 0.2);
  text-align: center;
}

.cs2-title {
  font-size: 3rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  color: #4d9e39;
}

.cs2-subtitle {
  font-size: 1.2rem;
  color: #969696;
  margin-bottom: 1.5rem;
  font-weight: 500;
}

.cs2-status {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  background: linear-gradient(135deg, #4d9e39, #62ce47);
  color: white;
  border-radius: 50px;
  font-weight: 600;
  box-shadow: 0 4px 15px rgba(77, 158, 57, 0.3);
}

.status-dot {
  width: 8px;
  height: 8px;
  background: #ffffff;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.cs2-content {
  display: grid;
  gap: 2rem;
}

/* Page Header Styling */
.page-header {
  display: grid;
  grid-template-columns: 1fr 2fr 1fr;
  align-items: center;
  background-color: #161616;
  border-radius: 20px;
  padding: 2rem;
  margin-bottom: 2rem;
  border: 1px solid rgba(77, 158, 57, 0.2);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
}

.header-left {
  justify-self: start;
}

.header-center {
  text-align: center;
}

.header-right {
  justify-self: end;
}

.page-title {
  font-size: 2.5rem;
  font-weight: 700;
  color: #4d9e39;
  margin: 0 0 0.5rem 0;
}

.page-subtitle {
  font-size: 1rem;
  color: #969696;
  margin: 0;
}

.back-button-wrapper,
.refresh-button {
  display: inline-block;
}

.refresh-button {
  cursor: pointer;
  transition: all 0.3s ease;
}

.refresh-button:hover {
  transform: translateY(-2px);
}

/* Stats styling for market analysis */
.best-find-card {
  text-align: center;
  padding: 1rem;
}

.item-name {
  font-size: 1.1rem;
  font-weight: 600;
  color: #ffffff;
  margin-bottom: 0.5rem;
  word-break: break-word;
}

.profit-gain {
  font-size: 1.5rem;
  font-weight: bold;
  color: #4d9e39;
  margin-bottom: 0.5rem;
}

.find-subtitle {
  font-size: 0.9rem;
  color: #969696;
}

.comparison-stats {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  height: 100%;
}

.stats-grid {
  display: grid;
  gap: 0.5rem;
  flex: 1;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  background-color: rgba(77, 158, 57, 0.1);
  border-radius: 8px;
}

.stat-label {
  color: #969696;
  font-size: 0.9rem;
}

.stat-value {
  color: #ffffff;
  font-weight: 600;
  font-size: 0.9rem;
}

.distribution-container {
  padding: 1rem;
}

.overview-section {
  background-color: #161616;
  border-radius: 20px;
  padding: 2rem;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(77, 158, 57, 0.2);
}

.market-analysis-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.profit-distribution-section {
  background-color: #161616;
  border-radius: 20px;
  padding: 2rem;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(77, 158, 57, 0.2);
}

.section-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #ffffff;
  margin-bottom: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.section-title::before {
  content: '';
  width: 4px;
  height: 24px;
  background: linear-gradient(135deg, #4d9e39, #62ce47);
  border-radius: 2px;
}

.distribution-grid {
  display: grid;
  gap: 1rem;
}

.system-info-section {
  background-color: #161616;
  border-radius: 20px;
  padding: 2rem;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(77, 158, 57, 0.2);
}

.system-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
}

.refresh-section {
  text-align: center;
  margin-top: 2rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Loading overlay */
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(32, 31, 32, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  font-size: 1.2rem;
  font-weight: 600;
  color: #4d9e39;
}

/* Responsive design */
@media (max-width: 768px) {
  .cs2-analytics-container {
    padding: 1rem 0.5rem;
  }
  
  .page-header {
    grid-template-columns: 1fr;
    gap: 1rem;
    padding: 1.5rem;
    text-align: center;
  }
  
  .header-left,
  .header-right {
    justify-self: center;
  }
  
  .page-title {
    font-size: 2rem;
  }
  
  .cs2-header {
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }
  
  .cs2-title {
    font-size: 2rem;
  }
  
  .cs2-subtitle {
    font-size: 1rem;
  }
  
  .market-analysis-grid {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
  
  .system-metrics {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
  
  .overview-section,
  .profit-distribution-section,
  .system-info-section {
    padding: 1.5rem;
  }
}

@media (max-width: 480px) {
  .page-header {
    padding: 1rem;
  }
  
  .page-title {
    font-size: 1.5rem;
  }
  
  .cs2-header {
    padding: 1rem;
  }
  
  .cs2-title {
    font-size: 1.5rem;
  }
  
  .overview-section,
  .profit-distribution-section,
  .system-info-section {
    padding: 1rem;
  }
}

/* Smooth transitions for all interactive elements */
* {
  transition: all 0.3s ease;
}

/* Custom scrollbar */
::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  background: rgba(77, 158, 57, 0.1);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb {
  background: linear-gradient(135deg, #4d9e39, #62ce47);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(135deg, #62ce47, #4d9e39);
}
</style>