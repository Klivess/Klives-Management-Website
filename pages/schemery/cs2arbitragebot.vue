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

        <!-- Balance Overview Section -->
        <CS2OverviewSection 
            title="💰 Balance Overview"
            subtitle="Current balance status and history"
        >
            <KMInfoGrid columns="2" rows="1" rowHeight="360">
                <!-- Left side: Balance metrics -->
                <KMInfoBox caption="Balance Overview">
                    <div class="balance-metrics-container" v-if="balanceHistory.length > 0">
                        <!-- Main Balance -->
                        <div class="balance-metric main-balance">
                            <div class="metric-label">Total Balance</div>
                            <div class="metric-value total">£{{ (latestBalance.SteamTotalBalanceInPounds + latestBalance.CSFloatTotalBalanceInPounds).toFixed(2) }}</div>
                            <div class="metric-subtitle">Combined Steam & CSFloat</div>
                        </div>
                        
                        <!-- Available Balances -->
                        <div class="balance-grid">
                            <div class="balance-metric">
                                <div class="metric-label">Current Steam Balance</div>
                                <div class="metric-value steam">£{{ latestBalance.SteamUsableBalanceInPounds.toFixed(2) }}</div>
                                <div class="metric-subtitle">Available for spending</div>
                            </div>
                            
                            <div class="balance-metric">
                                <div class="metric-label">Current CSFloat Balance</div>
                                <div class="metric-value csfloat">£{{ latestBalance.CSFloatUsableBalanceInPounds.toFixed(2) }}</div>
                                <div class="metric-subtitle">Available for spending</div>
                            </div>
                        </div>
                        
                        <!-- Pending Balances -->
                        <div class="balance-grid" v-if="hasPendingBalances">
                            <div class="pending-balances-title">Pending Balances</div>
                            <div class="balance-metric">
                                <div class="metric-label">Pending Steam Balance</div>
                                <div class="metric-value pending">£{{ latestBalance.SteamPendingBalanceInPounds.toFixed(2) }}</div>
                                <div class="metric-subtitle">In trade holds or market listings</div>
                            </div>
                            
                            <div class="balance-metric">
                                <div class="metric-label">Pending CSFloat Balance</div>
                                <div class="metric-value pending">£{{ latestBalance.CSFloatPendingBalanceInPounds.toFixed(2) }}</div>
                                <div class="metric-subtitle">In trade holds or pending transfers</div>
                            </div>
                            
                            <div class="balance-metric pending-total-metric">
                                <div class="metric-label">Total Pending Balance</div>
                                <div class="metric-value pending-total">£{{ (latestBalance.SteamPendingBalanceInPounds + latestBalance.CSFloatPendingBalanceInPounds).toFixed(2) }}</div>
                                <div class="metric-subtitle">Across all platforms</div>
                            </div>
                        </div>
                        
                        <div class="balance-update-time">
                            Last updated: {{ formatDateTime(latestBalance.DateTimeOfBalanceRecord) }}
                        </div>
                    </div>
                    
                    <div class="no-data-message" v-else>
                        No balance data available
                    </div>
                </KMInfoBox>
                
                <!-- Right side: Balance history chart -->
                <KMInfoBox caption="Balance History">
                    <div class="chart-container">
                        <canvas ref="balanceChartCanvas" id="balanceHistoryChart"></canvas>
                    </div>
                </KMInfoBox>
            </KMInfoGrid>
        </CS2OverviewSection>

        <!-- Purchased Items Section -->
        <CS2OverviewSection 
            title="💼 Purchased Items"
            subtitle="Recently purchased items and detailed information"
        >
            <KMInfoGrid columns="2" rows="1" rowHeight="500" style="padding-bottom: 30px; padding-top: 10px;">
                <!-- Left side: List of purchased items -->
                <KMInfoBox caption="Recent Purchases">
                    <div class="purchased-items-list">
                        <div 
                            v-for="(item, index) in sortedPurchasedItems" 
                            :key="item.CSFloatListingID"
                            :class="['purchase-item', { 'active': selectedItem?.CSFloatListingID === item.CSFloatListingID }]"
                            @click="selectItem(item)"
                        >
                            <div class="item-header">
                                <img :src="item.comparison?.CSFloatListing?.ImageURL" :alt="item.ItemMarketHashName" class="item-image" />
                                <div class="item-info">
                                    <div class="item-name">{{ item.ItemMarketHashName }}</div>
                                    <div class="item-profit" :class="getStrategyStatusClass(item.CurrentStrategicStage)">
                                        {{ getStrategyStatusText(item.CurrentStrategicStage) }}
                                    </div>
                                </div>
                                <div class="item-financial">
                                    <div class="financial-row">
                                        <span class="financial-label">Expected Profit:</span>
                                        <span class="financial-value profit">+£{{ item.ExpectedAbsoluteProfitInPounds?.toFixed(2) }}</span>
                                    </div>
                                    <div class="financial-row">
                                        <span class="financial-label">Purchase Price:</span>
                                        <span class="financial-value">{{ item.comparison?.CSFloatListing?.PriceText }}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </KMInfoBox>

                <!-- Right side: Detailed item information -->
                <KMInfoBox caption="Item Details">
                    <div v-if="selectedItem" class="item-detail-panel">
                        <!-- Item Header with Image -->
                        <div class="detail-header">
                            <img :src="selectedItem.comparison?.CSFloatListing?.ImageURL" :alt="selectedItem.ItemMarketHashName" class="detail-item-image" />
                            <div class="detail-item-info">
                                <h3 class="detail-item-name">{{ selectedItem.ItemMarketHashName }}</h3>
                                <div class="detail-item-status" :class="getStrategyStatusClass(selectedItem.CurrentStrategicStage)">
                                    {{ getStrategyStatusText(selectedItem.CurrentStrategicStage) }}
                                </div>
                            </div>
                        </div>

                        <!-- Financial Information -->
                        <div class="detail-section">
                            <h4 class="section-title">💰 Financial Details</h4>
                            <div class="detail-grid">
                                <div class="detail-item-row">
                                    <span class="label">Purchase Price:</span>
                                    <span class="value">{{ selectedItem.comparison?.CSFloatListing?.PriceText }}</span>
                                </div>
                                <div class="detail-item-row">
                                    <span class="label">Expected Steam Price:</span>
                                    <span class="value">{{ selectedItem.comparison?.SteamListing?.PriceText }}</span>
                                </div>
                                <div class="detail-item-row">
                                    <span class="label">Expected Profit:</span>
                                    <span class="value profit">+£{{ selectedItem.ExpectedAbsoluteProfitInPounds?.toFixed(2) }} ({{ selectedItem.ExpectedProfitPercentage?.toFixed(1) }}%)</span>
                                </div>
                                <div class="detail-item-row">
                                    <span class="label">Actual Profit:</span>
                                    <span class="value" :class="selectedItem.ActualAbsoluteProfitInPounds > 0 ? 'profit' : 'neutral'">
                                        {{ selectedItem.ActualAbsoluteProfitInPounds > 0 ? '+' : '' }}£{{ selectedItem.ActualAbsoluteProfitInPounds?.toFixed(2) }}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <!-- Item Properties -->
                        <div class="detail-section">
                            <h4 class="section-title">🔍 Item Properties</h4>
                            <div class="detail-grid">
                                <div class="detail-item-row">
                                    <span class="label">Float Value:</span>
                                    <span class="value">{{ selectedItem.ItemFloatValue?.toFixed(6) }}</span>
                                </div>
                                <div class="detail-item-row">
                                    <span class="label">CS Float ID:</span>
                                    <span class="value">{{ selectedItem.CSFloatListingID }}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Timeline Information -->
                        <div class="detail-section">
                            <h4 class="section-title">⏱️ Timeline</h4>
                            <div class="detail-grid">
                                <div class="detail-item-row">
                                    <span class="label">Purchased:</span>
                                    <span class="value">{{ formatDateTime(selectedItem.TimeOfPurchase) }}</span>
                                </div>
                                <div class="detail-item-row" v-if="selectedItem.TimeOfSellerToAcceptSale && selectedItem.TimeOfSellerToAcceptSale !== '0001-01-01T00:00:00'">
                                    <span class="label">Seller Accepted:</span>
                                    <span class="value">{{ formatDateTime(selectedItem.TimeOfSellerToAcceptSale) }}</span>
                                </div>
                                <div class="detail-item-row" v-if="selectedItem.TimeOfItemRetrieval && selectedItem.TimeOfItemRetrieval !== '0001-01-01T00:00:00'">
                                    <span class="label">Item Retrieved:</span>
                                    <span class="value">{{ formatDateTime(selectedItem.TimeOfItemRetrieval) }}</span>
                                </div>
                                <div class="detail-item-row">
                                    <span class="label">Predicted Resale:</span>
                                    <span class="value">{{ formatDateTime(selectedItem.PredictedTimeToBeResoldOnSteam) }}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Action Links -->
                        <div class="detail-section" v-if="selectedItem.comparison">
                            <h4 class="section-title">🔗 Quick Actions</h4>
                            <div class="action-links">
                                <a :href="selectedItem.comparison.CSFloatURL" target="_blank" class="action-link csfloat">
                                    View on CSFloat
                                </a>
                                <a :href="selectedItem.comparison.SteamListingURL" target="_blank" class="action-link steam">
                                    View on Steam Market
                                </a>
                            </div>
                        </div>
                    </div>
                    <div v-else class="no-selection">
                        <div class="no-selection-icon">📦</div>
                        <div class="no-selection-text">Select a purchased item to view details</div>
                    </div>
                </KMInfoBox>
            </KMInfoGrid>
        </CS2OverviewSection>

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

        <!-- Daily Purchase Activity Chart -->
        <CS2OverviewSection 
            title="📈 Daily Purchase Activity"
            subtitle="Number of purchased listings per day"
        >
            <KMInfoGrid columns="1" rows="1" rowHeight="500">
                <KMInfoBox caption="Daily Purchased Listings">
                    <div class="chart-container">
                        <canvas ref="chartCanvas" id="dailyPurchaseChart"></canvas>
                    </div>
                </KMInfoBox>
            </KMInfoGrid>
        </CS2OverviewSection>

        <!-- Liquidity Plan -->
        <CS2OverviewSection 
            title="💹 Liquidity Plan"
            subtitle="View optimal purchase strategies and market opportunities"
        >
            <LiquidityPlanSection />
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
import { ref, onMounted, nextTick, computed, watch } from 'vue';
import { Chart, registerables } from 'chart.js';
import KMInfoGrid from '~/components/KMInfoGrid.vue';
import KMInfoBox from '~/components/KMInfoBox.vue';
import KMButton from '~/components/KMButton.vue';
import CS2MetricCard from '~/components/CS2MetricCard.vue';
import CS2OverviewSection from '~/components/CS2OverviewSection.vue';
import CS2GainDistributionBar from '~/components/CS2GainDistributionBar.vue';
import LiquidityPlanSection from '~/components/LiquidityPlanSection.vue';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';
import Swal from 'sweetalert2';

// Register Chart.js components
Chart.register(...registerables);

definePageMeta({ layout: 'navbar' });

// Define the structure of the analytics data based on the C# class
interface CSFloatListing {
    ItemListingID: string;
    ItemName: string;
    ItemMarketHashName: string;
    PriceText: string;
    PriceInCents: number;
    PriceInPence: number;
    PriceInPounds: number;
    ListingURL: string;
    ImageURL: string;
    AppraisalBasePriceInPence: number;
    AppraisalBasePriceInPounds: number;
    AppraisalPriceText: string;
    AssetID: string;
    FloatValue: number;
    ItemID64: string;
    DateTimeListingCreated: string;
}

interface SteamListing {
    Name: string;
    CheapestSellOrderPriceInPence: number;
    CheapestSellOrderPriceInPounds: number;
    HighestBuyOrderPriceInPence: number;
    HighestBuyOrderPriceInPounds: number;
    BuyAndSellOrders: any;
    SellListings: string;
    PriceText: string;
    ImageURL: string;
    floatType: number;
    NameColor: string;
    ListingURL: string;
}

interface ComparisonData {
    ItemMarketHashName: string;
    PriceTextCSFloat: string;
    PriceTextSteamMarket: string;
    RawArbitrageGain: number;
    ArbitrageGainAfterSteamTax: number;
    PredictedOverallArbitrageGain: number;
    CSFloatURL: string;
    SteamListingURL: string;
    CSFloatListing: CSFloatListing;
    SteamListing: SteamListing;
    LastUpdate: string;
}

interface PurchasedItem {
    comparison?: ComparisonData;
    CSFloatListingID: string;
    ExpectedAbsoluteProfitInPence: number;
    ExpectedAbsoluteProfitInPounds: number;
    ExpectedProfitPercentage: number;
    ActualProfitPercentage: number;
    ActualAbsoluteProfitInPounds: number;
    ActualAbsoluteProfitInPence: number;
    TimeOfPurchase: string;
    TimeOfSellerToAcceptSale: string;
    TimeOfSellerToSendTradeOffer: string;
    TimeOfItemRetrieval: string;
    PredictedTimeToBeResoldOnSteam: string;
    ActualTimeResoldOnSteam: string;
    TimeOfConvertToRealFunds: string;
    TimeOfCollectedRevenue: string;
    CSFloatToSteamTradeOfferLink: string;
    ItemFloatValue: number;
    ItemMarketHashName: string;
    ActualSalePriceOnSteam: number;
    CurrentStrategicStage: number;
}

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
    AllPurchasedItems: PurchasedItem[];
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
    AllPurchasedItems: [],
});

const isLoading = ref(false);
const chartCanvas = ref<HTMLCanvasElement | null>(null);
let dailyPurchaseChart: Chart | null = null;

// Reactive data for purchased items
const selectedItem = ref<PurchasedItem | null>(null);

// Computed property for sorted purchased items (most recent first)
const sortedPurchasedItems = computed(() => {
    return [...analyticsData.value.AllPurchasedItems].sort((a, b) => {
        const dateA = new Date(a.TimeOfPurchase).getTime();
        const dateB = new Date(b.TimeOfPurchase).getTime();
        return dateB - dateA; // Most recent first
    });
});

// Functions for purchased items
const selectItem = (item: PurchasedItem) => {
    selectedItem.value = item;
};

const getStrategyStatusText = (stage: number): string => {
    const stages = {
        0: 'Waiting for Seller to Accept Sale',
        1: 'Waiting for Trade to be Sent',
        2: 'Waiting for Trade to be Accepted',
        3: 'Just Retrieved',
        4: 'Waiting for Market Sale on Steam',
        5: 'Waiting for Conversion Items to Purchase',
        6: 'Waiting for Conversion Items to Sell',
        7: 'Strategy Completed'
    };
    return stages[stage as keyof typeof stages] || 'Unknown Status';
};

const getStrategyStatusClass = (stage: number): string => {
    const classes = {
        0: 'status-waiting',
        1: 'status-waiting',
        2: 'status-waiting',
        3: 'status-retrieved',
        4: 'status-selling',
        5: 'status-converting',
        6: 'status-converting',
        7: 'status-completed'
    };
    return classes[stage as keyof typeof classes] || 'status-unknown';
};

const formatDateTime = (dateString: string): string => {
    if (!dateString || dateString === '0001-01-01T00:00:00') return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
};

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

// Generate daily purchase data for chart from real purchase data
const generateDailyPurchaseData = (purchasedItems: PurchasedItem[]) => {
    const dailyData: { date: string, purchases: number }[] = [];
    
    // Create a map to count purchases per day
    const purchaseCountByDate = new Map<string, number>();
    
    // Find the earliest and latest purchase dates from actual data
    let earliestDate: Date | null = null;
    let latestDate: Date | null = null;
    
    // Count actual purchases by date and find date range
    purchasedItems.forEach(item => {
        if (item.TimeOfPurchase && item.TimeOfPurchase !== "0001-01-01T00:00:00") {
            const purchaseDate = new Date(item.TimeOfPurchase);
            const dateStr = purchaseDate.toISOString().split('T')[0];
            purchaseCountByDate.set(dateStr, (purchaseCountByDate.get(dateStr) || 0) + 1);
            
            // Track earliest and latest dates
            if (!earliestDate || purchaseDate < earliestDate) {
                earliestDate = purchaseDate;
            }
            if (!latestDate || purchaseDate > latestDate) {
                latestDate = purchaseDate;
            }
        }
    });
    
    // If no purchase data, return empty array
    if (!earliestDate || !latestDate) {
        return [];
    }
    
    // Generate data for each day from earliest to latest purchase date
    const currentDate = new Date((earliestDate as Date).getTime());
    while (currentDate.getTime() <= (latestDate as Date).getTime()) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const purchases = purchaseCountByDate.get(dateStr) || 0;
        
        dailyData.push({
            date: dateStr,
            purchases: purchases
        });
        
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return dailyData;
};

// Create the daily purchase chart
// Create the balance history chart
const createBalanceHistoryChart = async () => {
    await nextTick();
    
    if (!balanceChartCanvas.value) {
        console.error('Balance chart canvas not found');
        return;
    }
    
    // Destroy existing chart if it exists
    if (balanceHistoryChart) {
        balanceHistoryChart.destroy();
    }
    
    const ctx = balanceChartCanvas.value.getContext('2d');
    if (!ctx) return;
    
    // Format the data for the chart
    const labels = balanceHistory.value.map(record => {
        const date = new Date(record.DateTimeOfBalanceRecord);
        return date.toLocaleDateString('en-GB', {
            month: 'short',
            day: 'numeric'
        });
    });
    
    const steamBalanceData = balanceHistory.value.map(record => record.SteamTotalBalanceInPounds);
    const csFloatBalanceData = balanceHistory.value.map(record => record.CSFloatTotalBalanceInPounds);
    
    balanceHistoryChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Steam Balance',
                    data: steamBalanceData,
                    borderColor: 'rgba(59, 130, 246, 1)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.2,
                    pointBackgroundColor: 'rgba(59, 130, 246, 1)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                },
                {
                    label: 'CSFloat Balance',
                    data: csFloatBalanceData,
                    borderColor: 'rgba(245, 158, 11, 1)',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.2,
                    pointBackgroundColor: 'rgba(245, 158, 11, 1)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    left: 5,
                    right: 30,
                    top: 5,
                    bottom: 25
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Balance History',
                    color: '#ffffff',
                    font: {
                        size: 16,
                        weight: 'bold'
                    },
                    padding: {
                        top: 5,
                        bottom: 15
                    }
                },
                legend: {
                    position: 'top',
                    align: 'center',
                    labels: {
                        color: '#ffffff',
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 10,
                        boxWidth: 10,
                        boxHeight: 10,
                        font: {
                            size: 11
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(22, 22, 22, 0.9)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: '#4d9e39',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true,
                    callbacks: {
                        title: function(context) {
                            const dataIndex = context[0].dataIndex;
                            const fullDate = new Date(balanceHistory.value[dataIndex].DateTimeOfBalanceRecord);
                            return fullDate.toLocaleDateString('en-GB', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                            });
                        },
                        label: function(context) {
                            const value = context.raw as number;
                            return `${context.dataset.label}: £${value.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                    },
                    ticks: {
                        color: '#969696',
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 7,
                        padding: 8
                    },
                    border: {
                        display: false
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Balance (£)',
                        color: '#969696',
                        font: {
                            size: 12
                        },
                        padding: {
                            bottom: 10
                        }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                    },
                    ticks: {
                        color: '#969696',
                        padding: 8,
                        callback: function(value) {
                            return '£' + value;
                        },
                        count: 6
                    },
                    border: {
                        display: false
                    },
                    beginAtZero: true,
                    // Add padding at the top of the scale
                    suggestedMax: Math.max(...steamBalanceData, ...csFloatBalanceData) * 1.2
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    });
};

const createDailyPurchaseChart = async () => {
    await nextTick();
    
    if (!chartCanvas.value) {
        console.error('Chart canvas not found');
        return;
    }
    
    // Destroy existing chart if it exists
    if (dailyPurchaseChart) {
        dailyPurchaseChart.destroy();
    }
    
    const dailyData = generateDailyPurchaseData(
        analyticsData.value.AllPurchasedItems || []
    );
    
    const ctx = chartCanvas.value.getContext('2d');
    if (!ctx) return;
    
    dailyPurchaseChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dailyData.map(d => {
                const date = new Date(d.date);
                return date.toLocaleDateString('en-GB', { 
                    month: 'short', 
                    day: 'numeric'
                });
            }),
            datasets: [{
                label: 'Purchased Listings',
                data: dailyData.map(d => d.purchases),
                backgroundColor: 'rgba(77, 158, 57, 0.8)',
                borderColor: 'rgba(77, 158, 57, 1)',
                borderWidth: 1,
                borderRadius: 4,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(22, 22, 22, 0.9)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: 'rgba(77, 158, 57, 0.8)',
                    borderWidth: 1,
                    callbacks: {
                        title: function(context) {
                            const dataIndex = context[0].dataIndex;
                            const fullDate = new Date(dailyData[dataIndex].date);
                            return fullDate.toLocaleDateString('en-GB', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                            });
                        },
                        label: function(context) {
                            const purchases = context.parsed.y;
                            if (purchases === 0) {
                                return 'No purchases made';
                            } else if (purchases === 1) {
                                return '1 item purchased';
                            } else {
                                return `${purchases} items purchased`;
                            }
                        },
                        afterLabel: function(context) {
                            const dataIndex = context.dataIndex;
                            const date = dailyData[dataIndex].date;
                            const purchases = context.parsed.y;
                            
                            if (purchases > 0) {
                                // Find items purchased on this date
                                const itemsOnDate = analyticsData.value.AllPurchasedItems?.filter(item => {
                                    if (item.TimeOfPurchase && item.TimeOfPurchase !== "0001-01-01T00:00:00") {
                                        const purchaseDate = new Date(item.TimeOfPurchase);
                                        return purchaseDate.toISOString().split('T')[0] === date;
                                    }
                                    return false;
                                }) || [];
                                
                                if (itemsOnDate.length > 0) {
                                    const totalProfit = itemsOnDate.reduce((sum, item) => sum + item.ExpectedAbsoluteProfitInPounds, 0);
                                    const details = [`Expected total profit: £${totalProfit.toFixed(2)}`, ''];
                                    
                                    // Add each item with its purchase time
                                    itemsOnDate.forEach((item, index) => {
                                        const purchaseTime = new Date(item.TimeOfPurchase);
                                        const timeStr = purchaseTime.toLocaleTimeString('en-GB', { 
                                            hour: '2-digit', 
                                            minute: '2-digit',
                                            hour12: false
                                        });
                                        const itemName = item.ItemMarketHashName || 'Unknown Item';
                                        const profit = item.ExpectedAbsoluteProfitInPounds;
                                        
                                        details.push(`${timeStr} - ${itemName}`);
                                        details.push(`  Expected profit: £${profit.toFixed(2)}`);
                                        
                                        // Add a separator between items (except for the last one)
                                        if (index < itemsOnDate.length - 1) {
                                            details.push('');
                                        }
                                    });
                                    
                                    return details;
                                }
                            }
                            return '';
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(77, 158, 57, 0.1)',
                        display: true
                    },
                    ticks: {
                        color: '#969696',
                        maxTicksLimit: 15,
                        callback: function(value, index, ticks) {
                            // Show every nth label to avoid overcrowding
                            const totalTicks = ticks.length;
                            const step = Math.ceil(totalTicks / 10);
                            return index % step === 0 ? this.getLabelForValue(value as number) : '';
                        }
                    },
                    title: {
                        display: true,
                        text: 'Date',
                        color: '#ffffff',
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(77, 158, 57, 0.1)',
                        display: true
                    },
                    ticks: {
                        color: '#969696',
                        stepSize: 1
                    },
                    title: {
                        display: true,
                        text: 'Number of Purchases',
                        color: '#ffffff',
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            },
            elements: {
                bar: {
                    borderRadius: 4
                }
            }
        }
    });
};

// Fetch data function
// Define balance history data structure
interface BalanceHistoryRecord {
    CSFloatFee: number;
    CSFloatWithdrawFee: number;
    CSFloatUsableBalanceInPounds: number;
    CSFloatTotalBalanceInPounds: number;
    CSFloatPendingBalanceInPounds: number;
    SteamUsableBalanceInPounds: number;
    SteamPendingBalanceInPounds: number;
    SteamTotalBalanceInPounds: number;
    DateTimeOfBalanceRecord: string;
    CSFloatProfileStatistics: {
        TotalSales: number;
        TotalPurchases: number;
        MedianTradeTime: number;
        TotalAvoidedTrades: number;
        TotalFailedTrades: number;
        TotalVerifiedTrades: number;
        TotalTrades: number;
    };
}

const balanceHistory = ref<BalanceHistoryRecord[]>([]);
const balanceChartCanvas = ref<HTMLCanvasElement | null>(null);
let balanceHistoryChart: Chart | null = null;

// Computed property to get the most recent balance record
const latestBalance = computed<BalanceHistoryRecord>(() => {
    if (balanceHistory.value.length === 0) {
        // Return a default empty object if no balance records
        return {
            CSFloatFee: 0,
            CSFloatWithdrawFee: 0,
            CSFloatUsableBalanceInPounds: 0,
            CSFloatTotalBalanceInPounds: 0,
            CSFloatPendingBalanceInPounds: 0,
            SteamUsableBalanceInPounds: 0,
            SteamPendingBalanceInPounds: 0,
            SteamTotalBalanceInPounds: 0,
            DateTimeOfBalanceRecord: new Date().toISOString(),
            CSFloatProfileStatistics: {
                TotalSales: 0,
                TotalPurchases: 0,
                MedianTradeTime: 0,
                TotalAvoidedTrades: 0,
                TotalFailedTrades: 0,
                TotalVerifiedTrades: 0,
                TotalTrades: 0
            }
        };
    }
    
    // Sort by date (newest first) and return the most recent record
    return [...balanceHistory.value].sort((a, b) => {
        return new Date(b.DateTimeOfBalanceRecord).getTime() - new Date(a.DateTimeOfBalanceRecord).getTime();
    })[0];
});

// Computed property to check if there are any pending balances
const hasPendingBalances = computed(() => {
    if (!latestBalance.value) return false;
    
    const steamPending = latestBalance.value.SteamPendingBalanceInPounds || 0;
    const csFloatPending = latestBalance.value.CSFloatPendingBalanceInPounds || 0;
    
    // Show the pending balances section if either value is greater than zero or explicitly set to zero
    return steamPending > 0 || csFloatPending > 0;
});

const fetchData = async () => {
    isLoading.value = true;
    try {
        // Fetch analytics data
        const response = await RequestGETFromKliveAPI("/cs2arbitragebot/getscanalytics");
        if (response.status === 200) {
            const data = await response.json();
            analyticsData.value = data;
            console.log('Analytics data loaded successfully:', data);
            
            // Create chart after data is loaded
            setTimeout(() => {
                createDailyPurchaseChart();
            }, 100);
            
            // Auto-select the first (most recent) purchased item
            if (data.AllPurchasedItems && data.AllPurchasedItems.length > 0) {
                const sortedItems = [...data.AllPurchasedItems].sort((a, b) => {
                    const dateA = new Date(a.TimeOfPurchase).getTime();
                    const dateB = new Date(b.TimeOfPurchase).getTime();
                    return dateB - dateA; // Most recent first
                });
                selectedItem.value = sortedItems[0];
            }
            
            // Fetch balance history data
            const balanceResponse = await RequestGETFromKliveAPI("/cs2arbitragebot/balanceHistory");
            if (balanceResponse.status === 200) {
                balanceHistory.value = await balanceResponse.json();
                console.log('Balance history data loaded successfully:', balanceHistory.value);
                
                // Create balance history chart
                setTimeout(() => {
                    createBalanceHistoryChart();
                }, 150);
            }
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Data Fetch Failed',
                text: 'Failed to fetch analytics data.',
                confirmButtonColor: '#4d9e39',
                background: '#161516',
                color: '#ffffff',
                customClass: {
                    popup: 'swal-dark-theme'
                }
            });
            window.location.replace("/schemes");
        }
    } catch (error) {
        console.error('Error fetching analytics data:', error);
        Swal.fire({
            icon: 'error',
            title: 'Loading Error',
            text: 'Error loading analytics data.',
            confirmButtonColor: '#4d9e39',
            background: '#161516',
            color: '#ffffff',
            customClass: {
                popup: 'swal-dark-theme'
            }
        });
    } finally {
        isLoading.value = false;
    }
};

// Lifecycle hook to fetch data when the component is mounted
onMounted(() => {
    fetchData();
});

// Watch for changes in sortedPurchasedItems and auto-select first item if none selected
watch(sortedPurchasedItems, (newItems) => {
    if (newItems.length > 0 && !selectedItem.value) {
        selectedItem.value = newItems[0];
    }
}, { immediate: true });

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

.chart-container {
  height: 300px;
  width: calc(100% - 10px);
  padding: 1rem 2rem 2rem 1rem;
  margin: 5px;
  background-color: rgba(22, 22, 22, 0.5);
  border-radius: 12px;
  border: 1px solid rgba(77, 158, 57, 0.2);
  position: relative;
  box-sizing: border-box;
}

.chart-container canvas {
  background-color: transparent !important;
  width: 100% !important;
  height: 100% !important;
}

/* Balance Overview styles */
.balance-metrics-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 10px;
  height: 100%;
  overflow-y: auto;
}

.balance-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 15px;
  width: 100%;
}

.balance-metric {
  background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
  border-radius: 12px;
  padding: 15px;
  border: 1px solid rgba(77, 158, 57, 0.2);
  transition: all 0.3s ease;
}

.balance-metric:hover {
  border-color: rgba(77, 158, 57, 0.5);
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(77, 158, 57, 0.1);
}

.main-balance {
  margin-bottom: 15px;
  background: linear-gradient(135deg, #1a2a1a 0%, #2a3a2a 100%);
  border: 1px solid rgba(77, 158, 57, 0.4);
  padding: 20px;
}

.metric-label {
  color: #969696;
  font-size: 0.9rem;
  margin-bottom: 5px;
}

.metric-value {
  font-size: 1.8rem;
  font-weight: 600;
  margin-bottom: 5px;
}

.metric-value.total {
  color: #4d9e39;
  font-size: 2.8rem;
}

.metric-value.steam {
  color: rgba(59, 130, 246, 1);
}

.metric-value.csfloat {
  color: rgba(245, 158, 11, 1);
}

.metric-value.pending {
  color: rgba(168, 85, 247, 0.9);
}

.metric-value.pending-total {
  color: rgba(168, 85, 247, 1);
  font-size: 1.4rem;
}

.metric-subtitle {
  color: #969696;
  font-size: 0.8rem;
  font-style: italic;
}

.pending-balances-title {
  grid-column: 1 / -1;
  color: #969696;
  font-size: 1rem;
  margin-top: 10px;
  margin-bottom: 5px;
  padding-bottom: 5px;
  border-bottom: 1px solid rgba(77, 158, 57, 0.2);
}

.pending-total-metric {
  grid-column: 1 / -1;
  background: linear-gradient(135deg, #1e1a24 0%, #2a2430 100%);
}

.balance-update-time {
  text-align: right;
  color: #969696;
  font-size: 0.8rem;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .balance-grid {
    grid-template-columns: 1fr;
  }
}

.no-data-message {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #969696;
  font-size: 1.2rem;
  font-style: italic;
}

/* Balance History Chart styles */
.balance-history-legend {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-bottom: 15px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.steam-color {
  background-color: rgba(59, 130, 246, 1);
}

.csfloat-color {
  background-color: rgba(245, 158, 11, 1);
}

.legend-label {
  font-size: 0.9rem;
  color: #ffffff;
}

/* Chart tooltip customization */
.chart-tooltip {
  background-color: rgba(22, 22, 22, 0.95) !important;
  border: 1px solid #4d9e39 !important;
  border-radius: 8px !important;
  padding: 10px !important;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3) !important;
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

/* Purchased Items Styles */
.purchased-items-list {
  height: 420px;
  overflow-y: auto;
  padding-right: 10px;
}

.purchase-item {
  background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
  border: 1px solid rgba(77, 158, 57, 0.2);
  border-radius: 12px;
  padding: 15px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.purchase-item:hover {
  border-color: rgba(77, 158, 57, 0.5);
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(77, 158, 57, 0.1);
}

.purchase-item.active {
  border-color: #4d9e39;
  background: linear-gradient(135deg, #1a2a1a 0%, #2a3a2a 100%);
  box-shadow: 0 0 0 2px rgba(77, 158, 57, 0.3);
}

.item-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 0;
}

.item-image {
  width: 48px;
  height: 36px;
  border-radius: 6px;
  object-fit: cover;
  border: 1px solid rgba(77, 158, 57, 0.3);
}

.item-info {
  flex: 1;
}

.item-name {
  color: #ffffff;
  font-weight: 600;
  font-size: 0.9rem;
  line-height: 1.2;
  margin-bottom: 4px;
}

.item-profit {
  font-size: 0.8rem;
  padding: 2px 8px;
  border-radius: 12px;
  font-weight: 500;
  display: inline-block;
}

.item-financial {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 160px;
  text-align: right;
}

.financial-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.8rem;
}

.financial-label {
  color: #969696;
  font-size: 0.75rem;
  white-space: nowrap;
}

.financial-value {
  color: #ffffff;
  font-weight: 500;
  white-space: nowrap;
}

.financial-value.profit {
  color: #4d9e39;
  font-weight: 600;
}

/* Item Detail Panel Styles */
.item-detail-panel {
  height: 420px;
  overflow-y: auto;
  padding-right: 10px;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid rgba(77, 158, 57, 0.2);
}

.detail-item-image {
  width: 80px;
  height: 60px;
  border-radius: 8px;
  object-fit: cover;
  border: 2px solid rgba(77, 158, 57, 0.3);
}

.detail-item-info {
  flex: 1;
}

.detail-item-name {
  color: #ffffff;
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 8px 0;
  line-height: 1.3;
}

.detail-item-status {
  padding: 4px 12px;
  border-radius: 16px;
  font-size: 0.8rem;
  font-weight: 500;
  display: inline-block;
}

.detail-section {
  margin-bottom: 20px;
}

.section-title {
  color: #ffffff;
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0 0 12px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-item-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.detail-item-row:last-child {
  border-bottom: none;
}

.label {
  color: #969696;
  font-size: 0.85rem;
}

.value {
  color: #ffffff;
  font-size: 0.85rem;
  font-weight: 500;
  text-align: right;
  max-width: 60%;
  word-break: break-all;
}

.value.profit {
  color: #4d9e39;
  font-weight: 600;
}

.value.neutral {
  color: #969696;
}

.action-links {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.action-link {
  display: block;
  padding: 8px 12px;
  border-radius: 6px;
  text-decoration: none;
  font-size: 0.85rem;
  font-weight: 500;
  text-align: center;
  transition: all 0.3s ease;
}

.action-link.csfloat {
  background: linear-gradient(135deg, #ff6b35, #f7931e);
  color: white;
}

.action-link.csfloat:hover {
  background: linear-gradient(135deg, #f7931e, #ff6b35);
  transform: translateY(-1px);
}

.action-link.steam {
  background: linear-gradient(135deg, #171a21, #2a475e);
  color: white;
}

.action-link.steam:hover {
  background: linear-gradient(135deg, #2a475e, #171a21);
  transform: translateY(-1px);
}

.no-selection {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #969696;
  text-align: center;
}

.no-selection-icon {
  font-size: 3rem;
  margin-bottom: 15px;
  opacity: 0.5;
}

.no-selection-text {
  font-size: 1rem;
  opacity: 0.7;
}

/* Strategy Status Classes */
.status-waiting {
  background: rgba(251, 191, 36, 0.2);
  color: #fbbf24;
}

.status-retrieved {
  background: rgba(59, 130, 246, 0.2);
  color: #3b82f6;
}

.status-selling {
  background: rgba(168, 85, 247, 0.2);
  color: #a855f7;
}

.status-converting {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.status-completed {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.status-unknown {
  background: rgba(156, 163, 175, 0.2);
  color: #9ca3af;
}
</style>