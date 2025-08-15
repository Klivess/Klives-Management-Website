<template>
  <div class="liquidity-plan-container">
    <div v-if="isLoading" class="loading-container">
      <div class="loading-spinner"></div>
      <div class="loading-text">Loading liquidity plan data...</div>
    </div>
    
    <div v-else class="liquidity-plan-content">
      <!-- Plan Description -->
      <div class="plan-description">
        <h3 class="description-title">Liquidity Plan</h3>
        <div class="description-text-container">
          <p v-for="(item, index) in formatLiquidityPlanDescription(liquidityPlan.LiquidityPlanDescription)" :key="index" class="description-text-item">
            {{ item }}
          </p>
        </div>
        <div class="plan-meta">
          <span class="plan-date">Data produced on: {{ formatDate(liquidityPlan.ProductionDateOfLiquiditySearchResultUsed) }}</span>
        </div>
      </div>
      
      <!-- Top 10 Gaps -->
      <div class="top-gaps-container">
        <h3 class="top-gaps-title">Top 10 Gaps</h3>
        <div class="gaps-list">
          <div 
            v-for="(gap, index) in liquidityPlan.Top10Gaps" 
            :key="index" 
            class="gap-item"
            :class="{ active: selectedGap && selectedGap.steamListing.Name === gap.steamListing.Name }"
            @click="selectGap(gap)">
            <div class="gap-item-image">
              <img :src="gap.steamListing.ImageURL" alt="Item image" class="item-image" />
            </div>
            <div class="gap-item-info">
              <div class="item-name">{{ gap.steamListing.Name }}</div>
              <div class="item-price">
                <span class="csfloat-price">CSFloat: £{{ gap.csfloatContainer.PriceInPounds.toFixed(2) }}</span>
                <span class="steam-price">Steam: £{{ gap.steamListing.HighestBuyOrderPriceInPounds.toFixed(2) }}</span>
              </div>
              <div class="return-coefficient">
                Ideal Return: <span class="coefficient">{{ (gap.IdealReturnCoefficientFromSteamToCSFloatTaxIncluded * 100).toFixed(2) }}%</span>
                <span class="item-rank">#{{ index + 1 }}</span>
              </div>
            </div>
          </div>
          <!-- Empty div to fill space if fewer than 10 items -->
          <div v-if="liquidityPlan.Top10Gaps.length < 10" class="gap-item-filler"></div>
        </div>
      </div>
      
      <!-- Selected Gap Details -->
      <div v-if="selectedGap" class="selected-gap-details">
        <div class="details-header">
          <h3 class="details-title">{{ selectedGap.steamListing.Name }} Details</h3>
          <div class="item-links">
            <a :href="selectedGap.steamListing.ListingURL" target="_blank" class="steam-link">
              <span class="icon">🔗</span> Steam Market
            </a>
          </div>
        </div>
        
        <!-- Buy Order Tactics -->
        <div class="tactics-container">
          <h4 class="tactics-title">Buy Order Tactics</h4>
          <div class="tactics-info">
            <p class="tactics-explanation">
              <span class="tactic-highlight">Buy Price:</span> Price to buy on Steam Market
              <span class="tactic-highlight">Sell Price:</span> Price to sell on CSFloat
              <span class="tactic-highlight">Last Seen:</span> Last time item sold at this price or below
            </p>
          </div>
          <div class="tactics-table">
            <div class="table-header">
              <div class="header-cell">Return %</div>
              <div class="header-cell">Buy Price (Steam)</div>
              <div class="header-cell">Sell Price (CSFloat)</div>
              <div class="header-cell">Last Seen</div>
              <div class="header-cell">Quantity Sold</div>
            </div>
            <div 
              v-for="(tactic, index) in getBuyOrderTactics(selectedGap.steamListing.Name)" 
              :key="index"
              class="table-row"
              :class="{ 'highlight-row': isOptimalTactic(tactic, selectedGap.steamListing.Name) }"
              @click="showTacticDetails(tactic)">
              <div class="table-cell">{{ (tactic.ReturnCoefficient * 100).toFixed(0) }}%</div>
              <div class="table-cell">£{{ tactic.PriceNeededToBuyOnSteam.toFixed(2) }}</div>
              <div class="table-cell">£{{ tactic.PriceNeededToSellOnCSFloat.toFixed(2) }}</div>
              <div class="table-cell">{{ formatDate(tactic.LastTimeSoldAtThisPriceOrBelow.DateTimeRecorded) }}</div>
              <div class="table-cell">{{ tactic.LastTimeSoldAtThisPriceOrBelow.QuantitySold }}</div>
            </div>
          </div>
          
          <!-- Selected Tactic Details -->
          <div v-if="selectedTactic" class="selected-tactic-details">
            <h5 class="tactic-details-title">Tactic Details</h5>
            <div class="tactic-details-grid">
              <div class="tactic-detail-item">
                <span class="detail-label">Return:</span>
                <span class="detail-value">{{ (selectedTactic.ReturnCoefficient * 100).toFixed(2) }}%</span>
              </div>
              <div class="tactic-detail-item">
                <span class="detail-label">Steam Buy Price:</span>
                <span class="detail-value">£{{ selectedTactic.PriceNeededToBuyOnSteam.toFixed(2) }}</span>
              </div>
              <div class="tactic-detail-item">
                <span class="detail-label">CSFloat Sell Price:</span>
                <span class="detail-value">£{{ selectedTactic.PriceNeededToSellOnCSFloat.toFixed(2) }}</span>
              </div>
              <div class="tactic-detail-item">
                <span class="detail-label">Last Seen Date:</span>
                <span class="detail-value">{{ formatDate(selectedTactic.LastTimeSoldAtThisPriceOrBelow.DateTimeRecorded) }}</span>
              </div>
              <div class="tactic-detail-item">
                <span class="detail-label">Quantity Sold:</span>
                <span class="detail-value">{{ selectedTactic.LastTimeSoldAtThisPriceOrBelow.QuantitySold }}</span>
              </div>
              <div class="tactic-detail-item">
                <span class="detail-label">Price In Pence:</span>
                <span class="detail-value">{{ selectedTactic.LastTimeSoldAtThisPriceOrBelow.PriceInPence }}</span>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Ideal Profit Information -->
        <div class="ideal-profit-container">
          <h4 class="ideal-profit-title">Ideal Profit Information</h4>
          <div class="ideal-profit-info">
            <div class="ideal-profit-grid">
              <div class="ideal-profit-item">
                <span class="ideal-label">Ideal CSFloat Sell Price:</span>
                <span class="ideal-value">£{{ selectedGap.IdealCSFloatSellPriceInPounds.toFixed(2) }}</span>
              </div>
              <div class="ideal-profit-item">
                <span class="ideal-label">Ideal Steam Purchase Price:</span>
                <span class="ideal-value">£{{ selectedGap.IdealPriceToPurchaseOnSteamInPounds.toFixed(2) }}</span>
              </div>
              <div class="ideal-profit-item">
                <span class="ideal-label">Ideal Return Coefficient:</span>
                <span class="ideal-value">{{ (selectedGap.IdealReturnCoefficientFromSteamToCSFloatTaxIncluded * 100).toFixed(2) }}%</span>
              </div>
              <div class="ideal-profit-item">
                <span class="ideal-label">Raw Return Coefficient:</span>
                <span class="ideal-value">{{ (selectedGap.ReturnCoefficientFromSteamToCSFloatTaxIncluded * 100).toFixed(2) }}%</span>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Optimal Purchase Point -->
        <div class="optimal-purchase-container">
          <h4 class="optimal-title">Optimal Purchase Point</h4>
          <div class="optimal-info highlight-optimal">
            <div class="optimal-data">
              <span class="optimal-label">Price (Steam):</span>
              <span class="optimal-value">£{{ getOptimalPurchasePoint(selectedGap.steamListing.Name).PriceInPounds.toFixed(2) }}</span>
            </div>
            <div class="optimal-data">
              <span class="optimal-label">Last Seen:</span>
              <span class="optimal-value">{{ formatDate(getOptimalPurchasePoint(selectedGap.steamListing.Name).DateTimeRecorded) }}</span>
            </div>
            <div class="optimal-data">
              <span class="optimal-label">Quantity Sold:</span>
              <span class="optimal-value">{{ getOptimalPurchasePoint(selectedGap.steamListing.Name).QuantitySold }}</span>
            </div>
            <div class="optimal-explanation">
              This is the optimal price point for buying this item on Steam based on historical data.
            </div>
          </div>
        </div>
      </div>
      
      <div v-else class="no-selection">
        <div class="no-selection-icon">📊</div>
        <div class="no-selection-text">Select an item from the list to view detailed information</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';
import Swal from 'sweetalert2';

// Define the liquidity plan interface
interface PriceRecord {
  DateTimeRecorded: string;
  PriceInPounds: number;
  QuantitySold: number;
  PriceInPence: number;
}

interface CSFloatContainer {
  MarketHashName: string;
  PriceInCents: number;
  PriceInPence: number;
  PriceInPounds: number;
  ImageURL: string;
  containerType: number;
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

interface GapItem {
  csfloatContainer: CSFloatContainer;
  steamListing: SteamListing;
  ReturnCoefficientFromSteamtoCSFloat: number;
  ReturnCoefficientFromSteamToCSFloatTaxIncluded: number;
  priceHistory: PriceRecord[];
  IdealCSFloatSellPriceInCents: number;
  IdealCSFloatSellPriceInPounds: number;
  IdealCSFloatSellPriceInPence: number;
  IdealPriceToPurchaseOnSteamInPounds: number;
  IdealReturnCoefficientFromSteamtoCSFloat: number;
  IdealReturnCoefficientFromSteamToCSFloatTaxIncluded: number;
}

interface BuyOrderTactic {
  ItemMarketHashName: string;
  ReturnCoefficient: number;
  PriceNeededToBuyOnSteam: number;
  PriceNeededToSellOnCSFloat: number;
  LastTimeSoldAtThisPriceOrBelow: PriceRecord;
}

interface LiquidityPlan {
  ProductionDateOfLiquiditySearchResultUsed: string;
  Top10Gaps: GapItem[];
  BuyOrderTacticsAndCorrespondingReturns: Record<string, BuyOrderTactic[]>;
  OptimalPurchasePointsForEachContainerGap: Record<string, PriceRecord>;
  LiquidityPlanDescription: string;
}

const liquidityPlan = ref<LiquidityPlan>({
  ProductionDateOfLiquiditySearchResultUsed: "",
  Top10Gaps: [],
  BuyOrderTacticsAndCorrespondingReturns: {},
  OptimalPurchasePointsForEachContainerGap: {},
  LiquidityPlanDescription: ""
});

const isLoading = ref(true);
const selectedGap = ref<GapItem | null>(null);
const selectedTactic = ref<BuyOrderTactic | null>(null);

// Method to show detailed information about a tactic
const showTacticDetails = (tactic: BuyOrderTactic) => {
  selectedTactic.value = tactic;
};

// Format date to a readable string
const formatDate = (dateString: string): string => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleString('en-GB', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Format the liquidity plan description with better styling
const formatLiquidityPlanDescription = (description: string): string[] => {
  if (!description) return [];
  // Split by line breaks and return as array for better formatting
  return description.split(/\r\n/).filter(line => line.trim() !== '');
};

// Get buy order tactics for a specific item
const getBuyOrderTactics = (itemName: string): BuyOrderTactic[] => {
  return liquidityPlan.value.BuyOrderTacticsAndCorrespondingReturns[itemName] || [];
};

// Check if a tactic corresponds to the optimal purchase point
const isOptimalTactic = (tactic: BuyOrderTactic, itemName: string): boolean => {
  const optimal = getOptimalPurchasePoint(itemName);
  if (!optimal || !optimal.PriceInPounds) return false;
  
  // Round to 2 decimal places for comparison to avoid floating point issues
  const optimalPrice = Math.round(optimal.PriceInPounds * 100) / 100;
  const tacticPrice = Math.round(tactic.PriceNeededToBuyOnSteam * 100) / 100;
  
  // Check if the dates match too to be extra certain
  const optimalDate = optimal.DateTimeRecorded;
  const tacticDate = tactic.LastTimeSoldAtThisPriceOrBelow.DateTimeRecorded;
  
  return optimalPrice === tacticPrice && optimalDate === tacticDate;
};

// Get optimal purchase point for a specific item
const getOptimalPurchasePoint = (itemName: string): PriceRecord => {
  return liquidityPlan.value.OptimalPurchasePointsForEachContainerGap[itemName] || {
    DateTimeRecorded: '',
    PriceInPounds: 0,
    QuantitySold: 0,
    PriceInPence: 0
  };
};

// Select a gap to display details
const selectGap = (gap: GapItem) => {
  selectedGap.value = gap;
  selectedTactic.value = null; // Reset selected tactic when changing gaps
};

// Fetch liquidity plan data from the API
const fetchLiquidityPlan = async () => {
  isLoading.value = true;
  try {
    const response = await RequestGETFromKliveAPI("/cs2arbitragebot/latestliquidityplan");
    if (response.status === 200) {
      const data = await response.json();
      liquidityPlan.value = data;
      
      // Sort the gaps by IdealReturnCoefficientFromSteamToCSFloatTaxIncluded
      liquidityPlan.value.Top10Gaps.sort((a, b) => 
        b.IdealReturnCoefficientFromSteamToCSFloatTaxIncluded - a.IdealReturnCoefficientFromSteamToCSFloatTaxIncluded
      );
      
      // Automatically select the first gap
      if (liquidityPlan.value.Top10Gaps.length > 0) {
        selectedGap.value = liquidityPlan.value.Top10Gaps[0];
      }
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to fetch liquidity plan data',
        confirmButtonColor: '#4d9e39',
        background: '#161516',
        color: '#ffffff',
        customClass: {
          popup: 'swal-dark-theme'
        }
      });
    }
  } catch (error) {
    console.error('Error fetching liquidity plan data:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'An error occurred while fetching liquidity plan data',
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

// Fetch data when component is mounted
onMounted(() => {
  fetchLiquidityPlan();
});
</script>

<style scoped>
.liquidity-plan-container {
  width: 100%;
  color: #ffffff;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(77, 158, 57, 0.2);
  border-top: 3px solid #4d9e39;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

.loading-text {
  color: #969696;
  font-size: 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.liquidity-plan-content {
  display: grid;
  grid-template-columns: 1fr;
  gap: 24px;
  min-height: 800px;
}

/* Plan Description */
.plan-description {
  background-color: #1a1a1a;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(77, 158, 57, 0.2);
}

.description-title {
  font-size: 1.4rem;
  font-weight: 700;
  color: #4d9e39;
  margin: 0 0 16px 0;
}

.description-text-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}

.description-text-item {
  font-size: 1rem;
  line-height: 1.6;
  margin: 0;
  padding: 8px 12px;
  background-color: #222222;
  border-radius: 8px;
  border-left: 3px solid #4d9e39;
}

.plan-meta {
  display: flex;
  justify-content: flex-end;
  color: #969696;
  font-size: 0.85rem;
}

/* Top Gaps */
.top-gaps-container {
  background-color: #1a1a1a;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(77, 158, 57, 0.2);
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
}

.top-gaps-title {
  font-size: 1.4rem;
  font-weight: 700;
  color: #4d9e39;
  margin: 0 0 16px 0;
  flex-shrink: 0;
}

.gaps-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  overflow-y: auto;
  padding-right: 8px;
  scrollbar-width: thin;
  scrollbar-color: rgba(77, 158, 57, 0.5) #222222;
  width: 100%;
  box-sizing: border-box;
}

.gaps-list::-webkit-scrollbar {
  width: 6px;
}

.gaps-list::-webkit-scrollbar-track {
  background: #222222;
  border-radius: 4px;
}

.gaps-list::-webkit-scrollbar-thumb {
  background-color: rgba(77, 158, 57, 0.5);
  border-radius: 4px;
}

.gaps-list::-webkit-scrollbar-thumb:hover {
  background-color: rgba(77, 158, 57, 0.8);
}

.gap-item {
  background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
  border: 1px solid rgba(77, 158, 57, 0.2);
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  box-sizing: border-box;
  min-width: 280px;
}

.gap-item:hover {
  border-color: rgba(77, 158, 57, 0.5);
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(77, 158, 57, 0.1);
}

.gap-item.active {
  border-color: #4d9e39;
  background: linear-gradient(135deg, #1a2a1a 0%, #2a3a2a 100%);
  box-shadow: 0 0 0 2px rgba(77, 158, 57, 0.3);
  position: relative;
  padding-left: 20px;
}

.gap-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background-color: #4d9e39;
  border-top-left-radius: 8px;
  border-bottom-left-radius: 8px;
}

.gap-item-filler {
  flex: 1;
  min-height: 20px;
}

.gap-item-image {
  width: 70px;
  height: 70px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  padding: 4px;
}

.item-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 4px;
}

.gap-item-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0; /* This helps with text overflow */
  width: 100%;
}

.item-name {
  font-weight: 600;
  font-size: 0.95rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
}

.item-price {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  flex-wrap: wrap;
  gap: 4px;
}

.csfloat-price {
  color: #4d9e39;
  font-weight: 500;
  padding: 2px 6px;
  background-color: rgba(77, 158, 57, 0.1);
  border-radius: 4px;
}

.steam-price {
  color: #3b82f6;
  font-weight: 500;
  padding: 2px 6px;
  background-color: rgba(59, 130, 246, 0.1);
  border-radius: 4px;
}

.return-coefficient {
  font-size: 0.85rem;
  color: #b8b8b8;
  font-weight: 500;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.item-rank {
  background-color: #333;
  color: #fff;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 600;
}

.coefficient {
  color: #4d9e39;
  font-weight: 700;
  background-color: rgba(77, 158, 57, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
}

/* Selected Gap Details */
.selected-gap-details {
  background-color: #1a1a1a;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(77, 158, 57, 0.2);
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
}

.details-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.details-title {
  font-size: 1.4rem;
  font-weight: 700;
  color: #4d9e39;
  margin: 0;
}

.item-links {
  display: flex;
  gap: 12px;
}

.steam-link {
  padding: 8px 12px;
  background-color: #171a21;
  color: #ffffff;
  text-decoration: none;
  border-radius: 6px;
  font-size: 0.85rem;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 8px;
}

.steam-link:hover {
  background-color: #2a475e;
  transform: translateY(-2px);
}

.icon {
  font-size: 1rem;
}

/* Buy Order Tactics */
.tactics-container {
  margin-bottom: 24px;
}

.tactics-title,
.ideal-profit-title {
  font-size: 1.2rem;
  font-weight: 600;
  color: #ffffff;
  margin: 0 0 16px 0;
}

.tactics-info {
  margin-bottom: 12px;
  padding: 10px;
  background-color: rgba(77, 158, 57, 0.1);
  border-radius: 8px;
}

.tactics-explanation {
  font-size: 0.9rem;
  color: #969696;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.tactic-highlight {
  color: #ffffff;
  font-weight: 600;
  margin-right: 4px;
}

.tactics-table {
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
  background-color: #202020;
}

.table-header {
  display: grid;
  grid-template-columns: 0.8fr 1fr 1fr 1.2fr 1fr;
  background-color: #161616;
  padding: 12px 16px;
}

.header-cell {
  font-weight: 600;
  font-size: 0.9rem;
  color: #969696;
}

.table-row {
  display: grid;
  grid-template-columns: 0.8fr 1fr 1fr 1.2fr 1fr;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.table-row:last-child {
  border-bottom: none;
}

.table-row:nth-child(even) {
  background-color: rgba(255, 255, 255, 0.03);
}

.table-row.highlight-row {
  background-color: rgba(77, 158, 57, 0.15);
  border-left: 3px solid #4d9e39;
}

.table-row.highlight-row:hover {
  background-color: rgba(77, 158, 57, 0.25);
}

.table-cell {
  font-size: 0.9rem;
}

/* Optimal Purchase Point */
.optimal-purchase-container {
  margin-top: 24px;
}

.optimal-title {
  font-size: 1.2rem;
  font-weight: 600;
  color: #ffffff;
  margin: 0 0 16px 0;
}

.optimal-info {
  background-color: #202020;
  border-radius: 8px;
  padding: 16px;
  position: relative;
}

.highlight-optimal {
  border-left: 4px solid #4d9e39;
  background-color: rgba(77, 158, 57, 0.1);
}

.optimal-data {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.optimal-data:last-of-type {
  border-bottom: none;
  margin-bottom: 12px;
}

.optimal-label {
  color: #969696;
  font-size: 0.9rem;
}

.optimal-value {
  font-weight: 600;
  font-size: 0.9rem;
  color: #ffffff;
}

.optimal-explanation,
.ideal-profit-explanation {
  padding: 10px;
  background-color: rgba(77, 158, 57, 0.15);
  border-radius: 4px;
  font-size: 0.85rem;
  color: #ffffff;
  margin-top: 12px;
  text-align: center;
}

/* Selected Tactic Details */
.selected-tactic-details {
  margin-top: 16px;
  background-color: rgba(77, 158, 57, 0.05);
  border-radius: 8px;
  padding: 16px;
  border: 1px dashed rgba(77, 158, 57, 0.3);
}

.tactic-details-title {
  font-size: 1rem;
  font-weight: 600;
  color: #4d9e39;
  margin: 0 0 12px 0;
}

.tactic-details-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.tactic-detail-item {
  display: flex;
  justify-content: space-between;
  background-color: rgba(22, 22, 22, 0.5);
  padding: 8px 12px;
  border-radius: 6px;
  align-items: center;
}

.detail-label {
  color: #969696;
  font-size: 0.85rem;
}

.detail-value {
  color: #ffffff;
  font-weight: 600;
  font-size: 0.9rem;
}

/* Ideal Profit Information */
.ideal-profit-container {
  margin-top: 24px;
  margin-bottom: 24px;
  background-color: #1a1a1a;
  border-radius: 8px;
  padding: 16px;
  border: 1px solid rgba(77, 158, 57, 0.2);
}

.ideal-profit-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}

.ideal-profit-item {
  display: flex;
  justify-content: space-between;
  background-color: rgba(22, 22, 22, 0.5);
  padding: 10px 12px;
  border-radius: 6px;
  align-items: center;
}

.ideal-label {
  color: #969696;
  font-size: 0.85rem;
}

.ideal-value {
  color: #4d9e39;
  font-weight: 600;
  font-size: 0.9rem;
}

/* No Selection State */
.no-selection {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #969696;
  text-align: center;
  background-color: #1a1a1a;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(77, 158, 57, 0.2);
}

.no-selection-icon {
  font-size: 3rem;
  margin-bottom: 16px;
  opacity: 0.5;
}

.no-selection-text {
  font-size: 1rem;
  opacity: 0.7;
}

/* Responsive styles */
@media (min-width: 768px) {
  .liquidity-plan-content {
    grid-template-columns: minmax(320px, 1fr) 2fr;
    gap: 24px;
    min-height: 800px; /* Set a minimum height for the overall layout */
    align-items: stretch;
  }
  
  .plan-description {
    grid-column: 1 / -1;
  }
  
  .top-gaps-container {
    grid-column: 1;
    align-self: stretch; /* Fill the vertical space */
    min-width: 320px; /* Ensure minimum width */
    width: 100%;
    display: flex;
    flex-direction: column; /* Ensure vertical layout */
  }
  
  .selected-gap-details,
  .no-selection {
    grid-column: 2;
    grid-row: 2;
    height: 100%;
  }
}

@media (max-width: 767px) {
  .liquidity-plan-content {
    grid-template-columns: 1fr;
  }
  
  .top-gaps-container {
    min-height: 500px;
  }
  
  .gaps-list {
    max-height: 400px;
  }
  
  .table-header,
  .table-row {
    grid-template-columns: 0.8fr 1fr 1fr 1.2fr 1fr;
    font-size: 0.8rem;
    overflow-x: auto;
  }
  
  .selected-gap-details,
  .no-selection {
    grid-column: 1;
    grid-row: 3;
  }
  
  .tactic-details-grid,
  .ideal-profit-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {  
  .table-header,
  .table-row {
    grid-template-columns: repeat(2, 1fr);
    row-gap: 8px;
  }
  
  .header-cell,
  .table-cell {
    padding: 4px 0;
  }
  
  .header-cell:nth-child(n+3),
  .table-cell:nth-child(n+3) {
    grid-column: auto;
  }
  
  .top-gaps-container {
    min-height: 450px;
  }
  
  .gaps-list {
    max-height: 350px;
  }
  
  .gap-item {
    padding: 12px;
    gap: 12px;
  }
}
</style>
