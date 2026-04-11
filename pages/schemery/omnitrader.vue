<template>
    <div class="omni-container">
        <div class="page-header">
            <div class="header-left">
                <KMButton style="width: 400px;" message="Back To Schemes" @click="navigateBack" />
            </div>

            <div class="header-center">
                <h1 class="page-title">OmniTrader</h1>
                <p class="page-subtitle">Algorithmic strategy control, simulator deployments, and analytics</p>
                <div class="header-badge">
                    <span class="badge-dot" :class="{ online: isServiceOnline }"></span>
                    <span>{{ isServiceOnline ? 'Service Online' : 'Service Unreachable' }}</span>
                    <span class="badge-divider">•</span>
                    <span>Last refresh: {{ lastRefresh }}</span>
                </div>
            </div>

            <div class="header-right">
                <button class="action-btn" :disabled="refreshing" @click="refreshAllData">
                    {{ refreshing ? 'Refreshing...' : 'Refresh All' }}
                </button>
                <button class="action-btn danger" :disabled="undeployingAll || deployedStrategies.length === 0" @click="handleUndeployAll">
                    {{ undeployingAll ? 'Undeploying From Simulator...' : 'Undeploy All (Simulator)' }}
                </button>
            </div>
        </div>

        <div v-if="globalError" class="global-error">
            {{ globalError }}
        </div>

        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-label">Active Simulator Deployments</div>
                <div class="metric-value">{{ status?.DeployedCount ?? deployedStrategies.length }}</div>
                <div class="metric-sub">{{ deployedStrategies.length }} listed in simulator snapshot</div>
            </div>

            <div class="metric-card">
                <div class="metric-label">Available Strategies</div>
                <div class="metric-value">{{ availableStrategies.length }}</div>
                <div class="metric-sub">Templates ready for simulator deploy/backtest</div>
            </div>

            <div class="metric-card">
                <div class="metric-label">Average Simulator Win Rate</div>
                <div class="metric-value" :class="{ positive: averageLiveWinRate >= 50 }">{{ averageLiveWinRate.toFixed(2) }}%</div>
                <div class="metric-sub">Across all simulator deployment analytics</div>
            </div>

            <div class="metric-card">
                <div class="metric-label">Persisted Strategies</div>
                <div class="metric-value">{{ persistedStrategyCount }}</div>
                <div class="metric-sub">Historic aggregates currently stored</div>
            </div>
        </div>

        <div class="panel-grid two-col">
            <section class="panel trend-panel">
                <div class="panel-header">
                    <h2>Simulator Performance Trend</h2>
                </div>

                <div v-if="liveTrendPoints.length < 2" class="empty-state">Not enough simulator data points for a trend chart.</div>

                <div v-else class="sparkline-wrap">
                    <div class="sparkline-source">Source: {{ liveTrendSourceLabel }}</div>
                    <svg class="sparkline-chart" viewBox="0 0 220 58" preserveAspectRatio="none" aria-label="Simulator performance trend">
                        <polyline :points="liveTrendPolyline" class="sparkline sparkline-live"></polyline>
                    </svg>
                    <div class="trend-stats">
                        <div class="trend-stat">
                            <span>Latest</span>
                            <strong>{{ formatCurrency(liveTrendLatest) }}</strong>
                        </div>
                        <div class="trend-stat">
                            <span>Min</span>
                            <strong>{{ formatCurrency(liveTrendMin) }}</strong>
                        </div>
                        <div class="trend-stat">
                            <span>Max</span>
                            <strong>{{ formatCurrency(liveTrendMax) }}</strong>
                        </div>
                        <div class="trend-stat">
                            <span>Delta</span>
                            <strong :class="{ positive: liveTrendDelta >= 0, negative: liveTrendDelta < 0 }">{{ formatCurrency(liveTrendDelta) }}</strong>
                        </div>
                    </div>
                </div>
            </section>

            <section class="panel trend-panel">
                <div class="panel-header">
                    <h2>Persisted Performance Trend</h2>
                </div>

                <div v-if="persistedTrendPoints.length < 2" class="empty-state">Not enough persisted data points for a trend chart.</div>

                <div v-else class="sparkline-wrap">
                    <div class="sparkline-source">Source: {{ persistedTrendSourceLabel }}</div>
                    <svg class="sparkline-chart" viewBox="0 0 220 58" preserveAspectRatio="none" aria-label="Persisted performance trend">
                        <polyline :points="persistedTrendPolyline" class="sparkline sparkline-persisted"></polyline>
                    </svg>
                    <div class="trend-stats">
                        <div class="trend-stat">
                            <span>Latest</span>
                            <strong>{{ formatCurrency(persistedTrendLatest) }}</strong>
                        </div>
                        <div class="trend-stat">
                            <span>Min</span>
                            <strong>{{ formatCurrency(persistedTrendMin) }}</strong>
                        </div>
                        <div class="trend-stat">
                            <span>Max</span>
                            <strong>{{ formatCurrency(persistedTrendMax) }}</strong>
                        </div>
                        <div class="trend-stat">
                            <span>Delta</span>
                            <strong :class="{ positive: persistedTrendDelta >= 0, negative: persistedTrendDelta < 0 }">{{ formatCurrency(persistedTrendDelta) }}</strong>
                        </div>
                    </div>
                </div>
            </section>
        </div>

        <div class="panel-grid two-col">
            <section class="panel">
                <div class="panel-header">
                    <h2>Available Strategies</h2>
                </div>

                <div v-if="isLoadingInitial" class="empty-state">Loading available strategies...</div>
                <div v-else-if="availableStrategies.length === 0" class="empty-state">No strategies returned by API.</div>

                <div v-else class="stack-list">
                    <article v-for="strategy in availableStrategies" :key="strategy.ClassName" class="item-card">
                        <div class="item-title-row">
                            <h3>{{ strategy.StrategyName }}</h3>
                            <span class="tag">{{ strategy.ClassName }}</span>
                        </div>

                        <p class="item-desc">{{ strategy.Description || 'No description available.' }}</p>

                        <div class="item-actions">
                            <button class="mini-btn" @click="prefillDeploy(strategy.StrategyName)">Prefill Sim Deploy</button>
                            <button class="mini-btn" @click="prefillBacktest(strategy.StrategyName)">Prefill Backtest</button>
                            <button class="mini-btn" @click="loadStrategyInsight(strategy.StrategyName)">Load Insight</button>
                        </div>
                    </article>
                </div>
            </section>

            <section class="panel">
                <div class="panel-header">
                    <h2>Simulator Deployed Strategies</h2>
                </div>

                <div v-if="isLoadingInitial" class="empty-state">Loading simulator deployments...</div>
                <div v-else-if="deployedStrategies.length === 0" class="empty-state">No active simulator deployments.</div>

                <div v-else class="stack-list">
                    <article v-for="deployment in deployedStrategies" :key="deployment.DeploymentId" class="item-card">
                        <div class="item-title-row">
                            <h3>{{ deployment.StrategyName }}</h3>
                            <span class="tag mono">{{ shortId(deployment.DeploymentId) }}</span>
                        </div>

                        <div class="metric-row-grid">
                            <div class="mini-metric">
                                <span>Final Equity</span>
                                <strong>{{ formatCurrency(deployment.FinalEquity) }}</strong>
                            </div>
                            <div class="mini-metric">
                                <span>Trades</span>
                                <strong>{{ formatNumber(deployment.TotalTrades) }}</strong>
                            </div>
                            <div class="mini-metric">
                                <span>Win Rate</span>
                                <strong>{{ formatPercent(deployment.WinRate) }}</strong>
                            </div>
                            <div class="mini-metric">
                                <span>PnL</span>
                                <strong :class="{ positive: numericValue(deployment.TotalPnLPercent) >= 0, negative: numericValue(deployment.TotalPnLPercent) < 0 }">
                                    {{ formatPercent(deployment.TotalPnLPercent) }}
                                </strong>
                            </div>
                        </div>

                        <div class="item-actions">
                            <button class="mini-btn" @click="loadLiveByDeployment(deployment.DeploymentId)">Simulator Detail</button>
                            <button class="mini-btn danger" :disabled="undeployingId === deployment.DeploymentId" @click="handleUndeploy(deployment.DeploymentId)">
                                {{ undeployingId === deployment.DeploymentId ? 'Undeploying From Sim...' : 'Undeploy (Sim)' }}
                            </button>
                        </div>
                    </article>
                </div>

                <div v-if="selectedDeploymentId && selectedDeploymentAnalytics" class="detail-box">
                    <div class="detail-title">Simulator Analytics for {{ shortId(selectedDeploymentId) }}</div>
                    <div class="metric-row-grid">
                        <div class="mini-metric">
                            <span>Final Equity</span>
                            <strong>{{ formatCurrency(selectedDeploymentAnalytics.FinalEquity) }}</strong>
                        </div>
                        <div class="mini-metric">
                            <span>Total Trades</span>
                            <strong>{{ formatNumber(selectedDeploymentAnalytics.TotalTrades) }}</strong>
                        </div>
                        <div class="mini-metric">
                            <span>Win Rate</span>
                            <strong>{{ formatPercent(selectedDeploymentAnalytics.WinRate) }}</strong>
                        </div>
                        <div class="mini-metric">
                            <span>Fees Paid</span>
                            <strong>{{ formatCurrency(selectedDeploymentAnalytics.TotalFeesPaid) }}</strong>
                        </div>
                    </div>
                </div>
            </section>
        </div>

        <div class="panel-grid two-col">
            <section class="panel">
                <div class="panel-header">
                    <h2>Persistent Active Registrations</h2>
                </div>

                <div v-if="activePersistent.length === 0" class="empty-state">No persistent registrations available.</div>

                <div v-else class="stack-list">
                    <article v-for="record in activePersistent" :key="`${record.StrategyKey}-${record.Symbol}-${record.Interval}`" class="item-card">
                        <div class="item-title-row">
                            <h3>{{ record.StrategyName }}</h3>
                            <span class="tag">{{ record.Symbol }} · {{ record.Interval }}</span>
                        </div>
                        <div class="metric-row-grid">
                            <div class="mini-metric">
                                <span>Initial Quote</span>
                                <strong>{{ formatCurrency(record.Settings?.InitialQuoteBalance) }}</strong>
                            </div>
                            <div class="mini-metric">
                                <span>Initial Base</span>
                                <strong>{{ formatNumber(record.Settings?.InitialBaseBalance) }}</strong>
                            </div>
                            <div class="mini-metric">
                                <span>Fee Fraction</span>
                                <strong>{{ numericValue(record.Settings?.FeeFraction).toFixed(4) }}</strong>
                            </div>
                            <div class="mini-metric">
                                <span>Updated</span>
                                <strong>{{ formatDateTime(record.LastUpdatedUtc) }}</strong>
                            </div>
                        </div>
                    </article>
                </div>
            </section>

            <section class="panel">
                <div class="panel-header between">
                    <h2>Strategy Insight</h2>
                    <button class="mini-btn" :disabled="loadingInsight || !selectedInsightStrategy" @click="loadStrategyInsight(selectedInsightStrategy)">
                        {{ loadingInsight ? 'Loading...' : 'Reload Insight' }}
                    </button>
                </div>

                <div class="form-grid one-line">
                    <div class="field">
                        <label>Strategy</label>
                        <select v-model="selectedInsightStrategy" @change="loadStrategyInsight(selectedInsightStrategy)">
                            <option value="" disabled>Select strategy</option>
                            <option v-for="strategy in availableStrategies" :key="strategy.ClassName" :value="strategy.StrategyName">
                                {{ strategy.StrategyName }}
                            </option>
                        </select>
                    </div>
                </div>

                <div v-if="insightError" class="inline-error">{{ insightError }}</div>
                <div v-else-if="!strategyInsight" class="empty-state">Select a strategy to load insight.</div>

                <div v-else class="insight-content">
                    <div class="metric-row-grid">
                        <div class="mini-metric">
                            <span>Currently Simulator-Deployed</span>
                            <strong>{{ strategyInsight.IsCurrentlyDeployed ? 'Yes' : 'No' }}</strong>
                        </div>
                        <div class="mini-metric">
                            <span>Total Sessions</span>
                            <strong>{{ formatNumber(strategyInsight.TotalSessions) }}</strong>
                        </div>
                        <div class="mini-metric">
                            <span>Total Backtests</span>
                            <strong>{{ formatNumber(strategyInsight.TotalBacktests) }}</strong>
                        </div>
                        <div class="mini-metric">
                            <span>Active Simulator Deployment</span>
                            <strong>{{ shortId(strategyInsight.ActiveDeploymentId || '') || 'N/A' }}</strong>
                        </div>
                    </div>

                    <div v-if="selectedPersistedAnalytics" class="detail-box">
                        <div class="detail-title">Persisted Analytics (By Strategy Route)</div>
                        <div class="metric-row-grid">
                            <div class="mini-metric">
                                <span>Final Equity</span>
                                <strong>{{ formatCurrency(selectedPersistedAnalytics.FinalEquity) }}</strong>
                            </div>
                            <div class="mini-metric">
                                <span>Total Trades</span>
                                <strong>{{ formatNumber(selectedPersistedAnalytics.TotalTrades) }}</strong>
                            </div>
                            <div class="mini-metric">
                                <span>Win Rate</span>
                                <strong>{{ formatPercent(selectedPersistedAnalytics.WinRate) }}</strong>
                            </div>
                            <div class="mini-metric">
                                <span>PnL</span>
                                <strong :class="{ positive: numericValue(selectedPersistedAnalytics.TotalPnLPercent) >= 0, negative: numericValue(selectedPersistedAnalytics.TotalPnLPercent) < 0 }">
                                    {{ formatPercent(selectedPersistedAnalytics.TotalPnLPercent) }}
                                </strong>
                            </div>
                        </div>
                    </div>

                    <div class="snapshot-grid">
                        <div class="snapshot-card">
                            <div class="snapshot-title">Simulator Snapshot</div>
                            <div class="snapshot-row"><span>Final Equity</span><strong>{{ formatCurrency(strategyInsight.LiveSnapshot?.FinalEquity) }}</strong></div>
                            <div class="snapshot-row"><span>Total Trades</span><strong>{{ formatNumber(strategyInsight.LiveSnapshot?.TotalTrades) }}</strong></div>
                            <div class="snapshot-row"><span>Win Rate</span><strong>{{ formatPercent(strategyInsight.LiveSnapshot?.WinRate) }}</strong></div>
                        </div>
                        <div class="snapshot-card">
                            <div class="snapshot-title">Persisted Snapshot</div>
                            <div class="snapshot-row"><span>Final Equity</span><strong>{{ formatCurrency(strategyInsight.PersistedSnapshot?.FinalEquity) }}</strong></div>
                            <div class="snapshot-row"><span>Total Trades</span><strong>{{ formatNumber(strategyInsight.PersistedSnapshot?.TotalTrades) }}</strong></div>
                            <div class="snapshot-row"><span>Win Rate</span><strong>{{ formatPercent(strategyInsight.PersistedSnapshot?.WinRate) }}</strong></div>
                        </div>
                    </div>

                    <div class="subsection">
                        <h4>Recent Simulator Sessions</h4>
                        <div v-if="!strategyInsight.RecentSessions?.length" class="empty-inline">No recent sessions.</div>
                        <div v-else class="compact-list">
                            <div v-for="session in strategyInsight.RecentSessions.slice(0, 4)" :key="session.DeploymentId + session.StartTimeUtc" class="compact-item">
                                <span>{{ session.Symbol }} · {{ session.Interval }}</span>
                                <span>{{ formatDateTime(session.StartTimeUtc) }}</span>
                                <span>{{ formatCurrency(session.FinalEquity) }}</span>
                            </div>
                        </div>
                    </div>

                    <div class="subsection">
                        <h4>Recent Backtests</h4>
                        <div v-if="!strategyInsight.RecentBacktests?.length" class="empty-inline">No recent backtests.</div>
                        <div v-else class="compact-list">
                            <div v-for="test in strategyInsight.RecentBacktests.slice(0, 4)" :key="test.RunAtUtc + test.Symbol" class="compact-item">
                                <span>{{ test.Symbol }}/{{ test.Currency }} · {{ test.Interval }}</span>
                                <span>{{ formatDateTime(test.RunAtUtc) }}</span>
                                <span>{{ formatPercent(test.Result?.TotalPnLPercent) }}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>

        <div class="panel-grid two-col">
            <section class="panel">
                <div class="panel-header between">
                    <h2>Deploy To Simulator</h2>
                    <button class="mini-btn" :disabled="deploying" @click="submitDeploy">
                        {{ deploying ? 'Deploying To Simulator...' : 'Deploy To Simulator' }}
                    </button>
                </div>

                <div class="form-grid">
                    <div class="field">
                        <label>Strategy Name</label>
                        <select v-model="deployForm.strategyName">
                            <option value="" disabled>Select strategy</option>
                            <option v-for="strategy in availableStrategies" :key="strategy.ClassName" :value="strategy.StrategyName">
                                {{ strategy.StrategyName }}
                            </option>
                        </select>
                    </div>
                    <div class="field">
                        <label>Symbol</label>
                        <input v-model="deployForm.symbol" type="text" placeholder="BTCUSDT" />
                    </div>
                    <div class="field">
                        <label>Interval</label>
                        <select v-model="deployForm.interval">
                            <option v-for="interval in intervalOptions" :key="interval.value" :value="interval.value">
                                {{ interval.label }}
                            </option>
                        </select>
                    </div>
                    <div class="field">
                        <label>Initial Quote</label>
                        <input v-model.number="deployForm.initialQuote" type="number" min="0" step="0.01" />
                    </div>
                    <div class="field">
                        <label>Initial Base</label>
                        <input v-model.number="deployForm.initialBase" type="number" min="0" step="0.00000001" />
                    </div>
                    <div class="field">
                        <label>Fee Fraction</label>
                        <input v-model.number="deployForm.feeFraction" type="number" min="0" step="0.0001" />
                    </div>
                    <div class="field">
                        <label>Slippage Fraction</label>
                        <input v-model.number="deployForm.slippageFraction" type="number" min="0" step="0.0001" />
                    </div>
                </div>
            </section>

            <section class="panel">
                <div class="panel-header between">
                    <h2>Run Backtest</h2>
                    <button class="mini-btn" :disabled="runningBacktest" @click="runBacktest">
                        {{ runningBacktest ? 'Running...' : 'Run Backtest' }}
                    </button>
                </div>

                <div class="form-grid">
                    <div class="field">
                        <label>Strategy Name</label>
                        <select v-model="backtestForm.strategyName">
                            <option value="" disabled>Select strategy</option>
                            <option v-for="strategy in availableStrategies" :key="strategy.ClassName" :value="strategy.StrategyName">
                                {{ strategy.StrategyName }}
                            </option>
                        </select>
                    </div>
                    <div class="field">
                        <label>Coin</label>
                        <input v-model="backtestForm.coin" type="text" placeholder="BTC" />
                    </div>
                    <div class="field">
                        <label>Currency</label>
                        <input v-model="backtestForm.currency" type="text" placeholder="USD" />
                    </div>
                    <div class="field">
                        <label>Interval</label>
                        <select v-model="backtestForm.interval">
                            <option v-for="interval in intervalOptions" :key="interval.value" :value="interval.value">
                                {{ interval.label }}
                            </option>
                        </select>
                    </div>
                    <div class="field">
                        <label>Candles</label>
                        <input v-model.number="backtestForm.candles" type="number" min="1" step="1" />
                    </div>
                    <div class="field">
                        <label>Initial Quote</label>
                        <input v-model.number="backtestForm.initialQuote" type="number" min="0" step="0.01" />
                    </div>
                    <div class="field">
                        <label>Initial Base</label>
                        <input v-model.number="backtestForm.initialBase" type="number" min="0" step="0.00000001" />
                    </div>
                    <div class="field">
                        <label>Fee Fraction</label>
                        <input v-model.number="backtestForm.feeFraction" type="number" min="0" step="0.0001" />
                    </div>
                    <div class="field">
                        <label>Slippage Fraction</label>
                        <input v-model.number="backtestForm.slippageFraction" type="number" min="0" step="0.0001" />
                    </div>
                </div>

                <div v-if="backtestMetrics" class="detail-box">
                    <div class="detail-title">Last Backtest Result</div>
                    <div class="metric-row-grid">
                        <div class="mini-metric">
                            <span>Final Equity</span>
                            <strong>{{ formatCurrency(backtestMetrics.FinalEquity) }}</strong>
                        </div>
                        <div class="mini-metric">
                            <span>Total Trades</span>
                            <strong>{{ formatNumber(backtestMetrics.TotalTrades) }}</strong>
                        </div>
                        <div class="mini-metric">
                            <span>Win Rate</span>
                            <strong>{{ formatPercent(backtestMetrics.WinRate) }}</strong>
                        </div>
                        <div class="mini-metric">
                            <span>PnL</span>
                            <strong :class="{ positive: numericValue(backtestMetrics.TotalPnLPercent) >= 0, negative: numericValue(backtestMetrics.TotalPnLPercent) < 0 }">
                                {{ formatPercent(backtestMetrics.TotalPnLPercent) }}
                            </strong>
                        </div>
                    </div>
                </div>
            </section>
        </div>

        <div class="panel-grid two-col">
            <section class="panel">
                <div class="panel-header">
                    <h2>Simulator Analytics Snapshot</h2>
                </div>

                <div v-if="liveAnalyticsEntries.length === 0" class="empty-state">No simulator analytics data.</div>

                <div v-else class="stack-list">
                    <article v-for="entry in liveAnalyticsEntries" :key="entry.id" class="item-card">
                        <div class="item-title-row">
                            <h3>{{ shortId(entry.id) }}</h3>
                            <span class="tag">Simulator</span>
                        </div>

                        <div class="metric-row-grid">
                            <div class="mini-metric">
                                <span>Final Equity</span>
                                <strong>{{ formatCurrency(entry.analytics.FinalEquity) }}</strong>
                            </div>
                            <div class="mini-metric">
                                <span>Trades</span>
                                <strong>{{ formatNumber(entry.analytics.TotalTrades) }}</strong>
                            </div>
                            <div class="mini-metric">
                                <span>Win Rate</span>
                                <strong>{{ formatPercent(entry.analytics.WinRate) }}</strong>
                            </div>
                            <div class="mini-metric">
                                <span>PnL</span>
                                <strong :class="{ positive: numericValue(entry.analytics.TotalPnLPercent) >= 0, negative: numericValue(entry.analytics.TotalPnLPercent) < 0 }">
                                    {{ formatPercent(entry.analytics.TotalPnLPercent) }}
                                </strong>
                            </div>
                        </div>
                    </article>
                </div>
            </section>

            <section class="panel">
                <div class="panel-header">
                    <h2>Persisted Analytics Snapshot</h2>
                </div>

                <div v-if="persistedAnalyticsEntries.length === 0" class="empty-state">No persisted analytics data.</div>

                <div v-else class="stack-list">
                    <article v-for="entry in persistedAnalyticsEntries" :key="entry.strategy" class="item-card">
                        <div class="item-title-row">
                            <h3>{{ entry.strategy }}</h3>
                            <span class="tag">Persisted</span>
                        </div>

                        <div class="metric-row-grid">
                            <div class="mini-metric">
                                <span>Final Equity</span>
                                <strong>{{ formatCurrency(entry.analytics.FinalEquity) }}</strong>
                            </div>
                            <div class="mini-metric">
                                <span>Trades</span>
                                <strong>{{ formatNumber(entry.analytics.TotalTrades) }}</strong>
                            </div>
                            <div class="mini-metric">
                                <span>Win Rate</span>
                                <strong>{{ formatPercent(entry.analytics.WinRate) }}</strong>
                            </div>
                            <div class="mini-metric">
                                <span>PnL</span>
                                <strong :class="{ positive: numericValue(entry.analytics.TotalPnLPercent) >= 0, negative: numericValue(entry.analytics.TotalPnLPercent) < 0 }">
                                    {{ formatPercent(entry.analytics.TotalPnLPercent) }}
                                </strong>
                            </div>
                        </div>
                    </article>
                </div>
            </section>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import KMButton from '~/components/KMButton.vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import Swal from 'sweetalert2';

definePageMeta({ layout: 'navbar' });

interface OmniStatus {
    Service: string;
    DeployedCount: number;
    ActiveDeploymentIds: string[];
    Uptime: string;
    ManagerUptime: string;
}

interface StrategyMeta {
    StrategyName: string;
    ClassName: string;
    Description: string;
}

interface OmniBacktestResult {
    InitialEquity?: number;
    FinalEquity?: number;
    FinalQuoteBalance?: number;
    FinalBaseBalance?: number;
    TotalTrades?: number;
    WinningTrades?: number;
    LosingTrades?: number;
    WinRate?: number;
    TotalPnL?: number;
    TotalPnLPercent?: number;
    TotalFeesPaid?: number;
}

interface DeployedStrategy {
    DeploymentId: string;
    StrategyName: string;
    FinalEquity: number;
    TotalTrades: number;
    TotalPnLPercent: number;
    WinRate: number;
    TotalFeesPaid: number;
}

interface PersistentRegistration {
    StrategyName: string;
    StrategyKey: string;
    Symbol: string;
    Interval: string;
    Settings: {
        InitialQuoteBalance?: number;
        InitialBaseBalance?: number;
        FeeFraction?: number;
        SlippageFraction?: number;
    };
    LastUpdatedUtc: string;
}

interface StrategyInsightSession {
    DeploymentId: string;
    Symbol: string;
    Interval: string;
    StartTimeUtc: string;
    EndTimeUtc: string;
    CandlesProcessed: number;
    NewTrades: number;
    FinalQuoteBalance: number;
    FinalBaseBalance: number;
    FinalEquity: number;
}

interface StrategyInsightBacktest {
    RunAtUtc: string;
    Symbol: string;
    Currency: string;
    Interval: string;
    CandleCount: number;
    Settings: {
        InitialQuoteBalance?: number;
        InitialBaseBalance?: number;
        FeeFraction?: number;
        SlippageFraction?: number;
    };
    Result: OmniBacktestResult;
}

interface StrategyInsight {
    StrategyName: string;
    StrategyKey: string;
    IsCurrentlyDeployed: boolean;
    ActiveDeploymentId: string;
    LiveSnapshot?: OmniBacktestResult;
    PersistedSnapshot?: OmniBacktestResult;
    TotalSessions: number;
    TotalBacktests: number;
    RecentSessions: StrategyInsightSession[];
    RecentBacktests: StrategyInsightBacktest[];
}

type QueryValue = string | number | null | undefined;

type IntervalOption = {
    value: string;
    label: string;
};

const router = useRouter();

const intervalOptions: IntervalOption[] = [
    { value: 'OneMinute', label: 'OneMinute (1m)' },
    { value: 'FiveMinute', label: 'FiveMinute (5m)' },
    { value: 'FifteenMinute', label: 'FifteenMinute (15m)' },
    { value: 'ThirtyMinute', label: 'ThirtyMinute (30m)' },
    { value: 'OneHour', label: 'OneHour (60m)' },
    { value: 'FourHour', label: 'FourHour (240m)' },
    { value: 'OneDay', label: 'OneDay (1440m)' },
    { value: 'OneWeek', label: 'OneWeek (10080m)' },
    { value: 'FifteenDay', label: 'FifteenDay (21600m)' }
];

const isLoadingInitial = ref(true);
const refreshing = ref(false);
const loadingInsight = ref(false);
const runningBacktest = ref(false);
const deploying = ref(false);
const undeployingId = ref('');
const undeployingAll = ref(false);

const globalError = ref('');
const insightError = ref('');
const lastRefresh = ref('Never');

const status = ref<OmniStatus | null>(null);
const availableStrategies = ref<StrategyMeta[]>([]);
const deployedStrategies = ref<DeployedStrategy[]>([]);
const activePersistent = ref<PersistentRegistration[]>([]);
const liveAnalyticsByDeployment = ref<Record<string, OmniBacktestResult>>({});
const persistedAnalyticsByStrategy = ref<Record<string, OmniBacktestResult>>({});

const selectedDeploymentId = ref('');
const selectedDeploymentAnalytics = ref<OmniBacktestResult | null>(null);
const selectedPersistedAnalytics = ref<OmniBacktestResult | null>(null);

const selectedInsightStrategy = ref('');
const strategyInsight = ref<StrategyInsight | null>(null);

const backtestForm = reactive({
    strategyName: '',
    coin: 'BTC',
    currency: 'USD',
    interval: 'OneHour',
    candles: 500,
    initialQuote: 10000,
    initialBase: 0,
    feeFraction: 0.001,
    slippageFraction: 0.0005
});

const deployForm = reactive({
    strategyName: '',
    symbol: 'BTCUSDT',
    interval: 'OneMinute',
    initialQuote: 10000,
    initialBase: 0,
    feeFraction: 0.001,
    slippageFraction: 0.0005
});

const backtestRawResult = ref<Record<string, any> | null>(null);

let livePollingTimer: ReturnType<typeof setInterval> | null = null;
let persistedPollingTimer: ReturnType<typeof setInterval> | null = null;

const isServiceOnline = computed(() => (status.value?.Service || '').toLowerCase() === 'omnitrader');

const liveAnalyticsEntries = computed(() => {
    return Object.entries(liveAnalyticsByDeployment.value).map(([id, analytics]) => ({ id, analytics }));
});

const persistedAnalyticsEntries = computed(() => {
    return Object.entries(persistedAnalyticsByStrategy.value).map(([strategy, analytics]) => ({ strategy, analytics }));
});

const persistedStrategyCount = computed(() => persistedAnalyticsEntries.value.length);

const averageLiveWinRate = computed(() => {
    const entries = Object.values(liveAnalyticsByDeployment.value);
    if (!entries.length) {
        return 0;
    }

    const totalWinRate = entries.reduce((total, item) => total + numericValue(item.WinRate), 0);
    return totalWinRate / entries.length;
});

const backtestMetrics = computed<OmniBacktestResult | null>(() => {
    if (!backtestRawResult.value) {
        return null;
    }

    return (backtestRawResult.value.result || backtestRawResult.value.Result || backtestRawResult.value) as OmniBacktestResult;
});

const liveTrendSourceLabel = computed(() => {
    if (strategyInsight.value?.RecentSessions?.length) {
        return 'Selected strategy simulator sessions';
    }

    return 'All simulator deployments snapshot';
});

const persistedTrendSourceLabel = computed(() => {
    if (strategyInsight.value?.RecentBacktests?.length) {
        return 'Selected strategy recent backtests';
    }

    return 'All persisted strategy snapshots';
});

const liveTrendPoints = computed<number[]>(() => {
    if (strategyInsight.value?.RecentSessions?.length) {
        return [...strategyInsight.value.RecentSessions]
            .sort((a, b) => new Date(a.StartTimeUtc).getTime() - new Date(b.StartTimeUtc).getTime())
            .map((session) => numericValue(session.FinalEquity))
            .filter((value) => Number.isFinite(value));
    }

    return liveAnalyticsEntries.value
        .map((entry) => numericValue(entry.analytics.FinalEquity))
        .filter((value) => Number.isFinite(value));
});

const persistedTrendPoints = computed<number[]>(() => {
    if (strategyInsight.value?.RecentBacktests?.length) {
        return [...strategyInsight.value.RecentBacktests]
            .sort((a, b) => new Date(a.RunAtUtc).getTime() - new Date(b.RunAtUtc).getTime())
            .map((backtest) => numericValue(backtest.Result?.FinalEquity))
            .filter((value) => Number.isFinite(value));
    }

    return persistedAnalyticsEntries.value
        .map((entry) => numericValue(entry.analytics.FinalEquity))
        .filter((value) => Number.isFinite(value));
});

const liveTrendPolyline = computed(() => buildSparklinePoints(liveTrendPoints.value));
const persistedTrendPolyline = computed(() => buildSparklinePoints(persistedTrendPoints.value));

const liveTrendLatest = computed(() => getTrendLatest(liveTrendPoints.value));
const liveTrendMin = computed(() => getTrendMin(liveTrendPoints.value));
const liveTrendMax = computed(() => getTrendMax(liveTrendPoints.value));
const liveTrendDelta = computed(() => getTrendDelta(liveTrendPoints.value));

const persistedTrendLatest = computed(() => getTrendLatest(persistedTrendPoints.value));
const persistedTrendMin = computed(() => getTrendMin(persistedTrendPoints.value));
const persistedTrendMax = computed(() => getTrendMax(persistedTrendPoints.value));
const persistedTrendDelta = computed(() => getTrendDelta(persistedTrendPoints.value));

const navigateBack = (): void => {
    router.push('/schemes');
};

const numericValue = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const shortId = (value: string): string => {
    if (!value) {
        return '';
    }

    return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
};

const formatNumber = (value: unknown): string => {
    return numericValue(value).toLocaleString();
};

const formatCurrency = (value: unknown): string => {
    return numericValue(value).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
};

const formatPercent = (value: unknown): string => {
    return `${numericValue(value).toFixed(2)}%`;
};

const formatDateTime = (value: unknown): string => {
    if (!value || typeof value !== 'string') {
        return 'N/A';
    }

    const date = new Date(value);
    if (isNaN(date.getTime())) {
        return 'N/A';
    }

    return date.toLocaleString();
};

const getTrendLatest = (values: number[]): number => {
    if (!values.length) {
        return 0;
    }

    return values[values.length - 1];
};

const getTrendMin = (values: number[]): number => {
    if (!values.length) {
        return 0;
    }

    return Math.min(...values);
};

const getTrendMax = (values: number[]): number => {
    if (!values.length) {
        return 0;
    }

    return Math.max(...values);
};

const getTrendDelta = (values: number[]): number => {
    if (values.length < 2) {
        return 0;
    }

    return values[values.length - 1] - values[0];
};

const buildSparklinePoints = (values: number[]): string => {
    if (!values.length) {
        return '';
    }

    const width = 220;
    const height = 58;
    const padding = 4;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const stepX = values.length === 1 ? 0 : (width - padding * 2) / (values.length - 1);

    return values
        .map((value, index) => {
            const x = padding + index * stepX;
            const normalized = (value - min) / range;
            const y = height - padding - normalized * (height - padding * 2);
            return `${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(' ');
};

const showApiError = (title: string, message: string): void => {
    Swal.fire({
        icon: 'error',
        title,
        text: message,
        confirmButtonColor: '#4d9e39',
        background: '#161516',
        color: '#ffffff'
    });
};

const showApiSuccess = (title: string, message: string): void => {
    Swal.fire({
        icon: 'success',
        title,
        text: message,
        confirmButtonColor: '#4d9e39',
        background: '#161516',
        color: '#ffffff'
    });
};

const parseResponsePayload = async (response: Response): Promise<unknown> => {
    const text = await response.text();
    if (!text) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
};

const payloadMessage = (payload: unknown): string => {
    if (typeof payload === 'string') {
        return payload;
    }

    if (payload && typeof payload === 'object') {
        const message = (payload as Record<string, unknown>).Message || (payload as Record<string, unknown>).message;
        if (typeof message === 'string') {
            return message;
        }
    }

    return 'Unknown API error';
};

const requestGet = async <T>(path: string): Promise<T> => {
    const response = await RequestGETFromKliveAPI(path, false, false);
    const payload = await parseResponsePayload(response);

    if (!response.ok) {
        throw new Error(`${payloadMessage(payload)} (${response.status})`);
    }

    return payload as T;
};

const requestPost = async <T>(path: string): Promise<T> => {
    const response = await RequestPOSTFromKliveAPI(path, '', false);
    const payload = await parseResponsePayload(response);

    if (!response.ok) {
        throw new Error(`${payloadMessage(payload)} (${response.status})`);
    }

    return payload as T;
};

const buildQuery = (params: Record<string, QueryValue>): string => {
    const query = Object.entries(params)
        .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join('&');

    return query ? `?${query}` : '';
};

const fetchStatus = async (): Promise<void> => {
    status.value = await requestGet<OmniStatus>('/api/omnitrader/status');
};

const fetchAvailableStrategies = async (): Promise<void> => {
    const data = await requestGet<StrategyMeta[]>('/api/omnitrader/strategies');
    availableStrategies.value = Array.isArray(data) ? data : [];
};

const fetchDeployedStrategies = async (): Promise<void> => {
    const data = await requestGet<DeployedStrategy[]>('/api/omnitrader/simulator/deployments');
    deployedStrategies.value = Array.isArray(data) ? data : [];
};

const fetchActivePersistent = async (): Promise<void> => {
    const data = await requestGet<PersistentRegistration[]>('/api/omnitrader/simulator/active');
    activePersistent.value = Array.isArray(data) ? data : [];
};

const fetchLiveAnalyticsAll = async (): Promise<void> => {
    const data = await requestGet<Record<string, OmniBacktestResult>>('/api/omnitrader/analytics/live');
    liveAnalyticsByDeployment.value = data && typeof data === 'object' ? data : {};
};

const fetchPersistedAnalyticsAll = async (): Promise<void> => {
    const data = await requestGet<Record<string, OmniBacktestResult>>('/api/omnitrader/analytics/persisted');
    persistedAnalyticsByStrategy.value = data && typeof data === 'object' ? data : {};
};

const loadLiveByDeployment = async (deploymentId: string): Promise<void> => {
    try {
        const query = buildQuery({ deploymentId });
        const data = await requestGet<OmniBacktestResult>(`/api/omnitrader/analytics/live/deployment${query}`);
        selectedDeploymentId.value = deploymentId;
        selectedDeploymentAnalytics.value = data;
    } catch (error) {
        showApiError('Simulator Detail Failed', error instanceof Error ? error.message : 'Unable to load simulator deployment analytics.');
    }
};

const loadStrategyInsight = async (strategyName: string): Promise<void> => {
    if (!strategyName) {
        return;
    }

    loadingInsight.value = true;
    insightError.value = '';

    try {
        const query = buildQuery({ strategyName });
        const [insightResponse, persistedResponse] = await Promise.all([
            requestGet<StrategyInsight>(`/api/omnitrader/analytics/insight${query}`),
            requestGet<OmniBacktestResult>(`/api/omnitrader/analytics/persisted/strategy${query}`)
        ]);

        strategyInsight.value = insightResponse;
        selectedPersistedAnalytics.value = persistedResponse;
        selectedInsightStrategy.value = strategyName;
    } catch (error) {
        strategyInsight.value = null;
        selectedPersistedAnalytics.value = null;
        insightError.value = error instanceof Error ? error.message : 'Unable to load strategy insight.';
    } finally {
        loadingInsight.value = false;
    }
};

const prefillDeploy = (strategyName: string): void => {
    deployForm.strategyName = strategyName;
    selectedInsightStrategy.value = strategyName;
};

const prefillBacktest = (strategyName: string): void => {
    backtestForm.strategyName = strategyName;
    selectedInsightStrategy.value = strategyName;
};

const runBacktest = async (): Promise<void> => {
    if (!backtestForm.strategyName) {
        showApiError('Missing Strategy', 'Please select a strategy before running a backtest.');
        return;
    }

    runningBacktest.value = true;

    try {
        const query = buildQuery({
            strategyName: backtestForm.strategyName,
            coin: backtestForm.coin,
            currency: backtestForm.currency,
            interval: backtestForm.interval,
            candles: backtestForm.candles,
            initialQuote: backtestForm.initialQuote,
            initialBase: backtestForm.initialBase,
            feeFraction: backtestForm.feeFraction,
            slippageFraction: backtestForm.slippageFraction
        });

        backtestRawResult.value = await requestPost<Record<string, any>>(`/api/omnitrader/backtest${query}`);
        await Promise.allSettled([fetchPersistedAnalyticsAll(), loadStrategyInsight(backtestForm.strategyName)]);
        showApiSuccess('Backtest Complete', `${backtestForm.strategyName} finished successfully.`);
    } catch (error) {
        showApiError('Backtest Failed', error instanceof Error ? error.message : 'Unable to run backtest.');
    } finally {
        runningBacktest.value = false;
    }
};

const submitDeploy = async (): Promise<void> => {
    if (!deployForm.strategyName) {
        showApiError('Missing Strategy', 'Please select a strategy before deploying to simulator.');
        return;
    }

    deploying.value = true;

    try {
        const query = buildQuery({
            strategyName: deployForm.strategyName,
            symbol: deployForm.symbol,
            interval: deployForm.interval,
            initialQuote: deployForm.initialQuote,
            initialBase: deployForm.initialBase,
            feeFraction: deployForm.feeFraction,
            slippageFraction: deployForm.slippageFraction
        });

        const result = await requestPost<Record<string, any>>(`/api/omnitrader/simulator/deploy${query}`);
        await Promise.allSettled([fetchStatus(), fetchDeployedStrategies(), fetchActivePersistent(), fetchLiveAnalyticsAll()]);
        await loadStrategyInsight(deployForm.strategyName);
        showApiSuccess('Strategy Deployed To Simulator', payloadMessage(result));
    } catch (error) {
        showApiError('Simulator Deployment Failed', error instanceof Error ? error.message : 'Unable to deploy strategy to simulator.');
    } finally {
        deploying.value = false;
    }
};

const handleUndeploy = async (deploymentId: string): Promise<void> => {
    const confirm = await Swal.fire({
        icon: 'warning',
        title: 'Undeploy Simulator Strategy?',
        text: `Simulator deployment ${shortId(deploymentId)} will be stopped.`,
        showCancelButton: true,
        confirmButtonText: 'Undeploy From Simulator',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#ef4444',
        background: '#161516',
        color: '#ffffff'
    });

    if (!confirm.isConfirmed) {
        return;
    }

    undeployingId.value = deploymentId;

    try {
        const query = buildQuery({ deploymentId });
        const result = await requestPost<Record<string, any>>(`/api/omnitrader/simulator/undeploy${query}`);
        await Promise.allSettled([fetchStatus(), fetchDeployedStrategies(), fetchActivePersistent(), fetchLiveAnalyticsAll()]);

        if (selectedDeploymentId.value === deploymentId) {
            selectedDeploymentId.value = '';
            selectedDeploymentAnalytics.value = null;
        }

        showApiSuccess('Simulator Undeploy Complete', payloadMessage(result));
    } catch (error) {
        showApiError('Simulator Undeploy Failed', error instanceof Error ? error.message : 'Unable to undeploy strategy from simulator.');
    } finally {
        undeployingId.value = '';
    }
};

const handleUndeployAll = async (): Promise<void> => {
    const confirm = await Swal.fire({
        icon: 'warning',
        title: 'Undeploy All Simulator Strategies?',
        text: 'This will stop all active OmniTrader simulator deployments.',
        showCancelButton: true,
        confirmButtonText: 'Undeploy All From Simulator',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#ef4444',
        background: '#161516',
        color: '#ffffff'
    });

    if (!confirm.isConfirmed) {
        return;
    }

    undeployingAll.value = true;

    try {
        const result = await requestPost<Record<string, any>>('/api/omnitrader/simulator/undeploy-all');
        await Promise.allSettled([fetchStatus(), fetchDeployedStrategies(), fetchActivePersistent(), fetchLiveAnalyticsAll()]);
        selectedDeploymentId.value = '';
        selectedDeploymentAnalytics.value = null;
        showApiSuccess('Simulator Undeploy All Complete', payloadMessage(result));
    } catch (error) {
        showApiError('Simulator Undeploy All Failed', error instanceof Error ? error.message : 'Unable to undeploy all strategies from simulator.');
    } finally {
        undeployingAll.value = false;
    }
};

const refreshAllData = async (): Promise<void> => {
    refreshing.value = true;
    globalError.value = '';

    const tasks = await Promise.allSettled([
        fetchStatus(),
        fetchAvailableStrategies(),
        fetchDeployedStrategies(),
        fetchActivePersistent(),
        fetchLiveAnalyticsAll(),
        fetchPersistedAnalyticsAll()
    ]);

    const failures = tasks.filter(task => task.status === 'rejected') as PromiseRejectedResult[];
    if (failures.length > 0) {
        globalError.value = failures.map(failure => String(failure.reason)).join(' | ');
    }

    if (!selectedInsightStrategy.value && availableStrategies.value.length > 0) {
        selectedInsightStrategy.value = availableStrategies.value[0].StrategyName;
    }
    if (!deployForm.strategyName && availableStrategies.value.length > 0) {
        deployForm.strategyName = availableStrategies.value[0].StrategyName;
    }
    if (!backtestForm.strategyName && availableStrategies.value.length > 0) {
        backtestForm.strategyName = availableStrategies.value[0].StrategyName;
    }

    if (selectedInsightStrategy.value) {
        await loadStrategyInsight(selectedInsightStrategy.value);
    }

    lastRefresh.value = new Date().toLocaleTimeString();
    refreshing.value = false;
    isLoadingInitial.value = false;
};

const refreshLiveRoutes = async (): Promise<void> => {
    const tasks = await Promise.allSettled([fetchStatus(), fetchDeployedStrategies(), fetchLiveAnalyticsAll()]);
    if (tasks.some(task => task.status === 'rejected')) {
        return;
    }

    lastRefresh.value = new Date().toLocaleTimeString();
};

const refreshPersistedRoutes = async (): Promise<void> => {
    await Promise.allSettled([fetchPersistedAnalyticsAll(), fetchActivePersistent()]);
};

onMounted(async () => {
    await refreshAllData();

    livePollingTimer = setInterval(() => {
        refreshLiveRoutes();
    }, 10000);

    persistedPollingTimer = setInterval(() => {
        refreshPersistedRoutes();
    }, 45000);
});

onBeforeUnmount(() => {
    if (livePollingTimer) {
        clearInterval(livePollingTimer);
    }

    if (persistedPollingTimer) {
        clearInterval(persistedPollingTimer);
    }
});
</script>

<style scoped>
.omni-container {
    padding: 24px;
    min-height: 100vh;
    background-color: #201f20;
    color: #ffffff;
}

.page-header {
    display: grid;
    grid-template-columns: 1fr 2fr 1fr;
    gap: 16px;
    align-items: center;
    background: #161616;
    border: 1px solid rgba(77, 158, 57, 0.2);
    border-radius: 16px;
    padding: 20px;
    margin-bottom: 18px;
}

.header-left {
    justify-self: start;
}

.header-center {
    text-align: center;
}

.header-right {
    justify-self: end;
    display: flex;
    gap: 8px;
    align-items: center;
}

.page-title {
    margin: 0;
    font-size: 2.3rem;
    font-weight: 700;
    background: linear-gradient(135deg, #4d9e39, #62ce47);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.page-subtitle {
    margin: 6px 0 12px 0;
    color: #969696;
}

.header-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    font-size: 0.8rem;
    color: #c9c9c9;
    border: 1px solid rgba(77, 158, 57, 0.22);
    border-radius: 999px;
    background: rgba(77, 158, 57, 0.08);
}

.badge-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ef4444;
    box-shadow: 0 0 8px rgba(239, 68, 68, 0.6);
}

.badge-dot.online {
    background: #22c55e;
    box-shadow: 0 0 8px rgba(34, 197, 94, 0.6);
}

.badge-divider {
    color: #6a6a6a;
}

.action-btn,
.mini-btn {
    background: rgba(77, 158, 57, 0.16);
    border: 1px solid rgba(77, 158, 57, 0.35);
    color: #d6f7cf;
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 0.82rem;
    cursor: pointer;
    transition: all 0.2s ease;
}

.action-btn:hover,
.mini-btn:hover {
    background: rgba(77, 158, 57, 0.28);
    transform: translateY(-1px);
}

.action-btn:disabled,
.mini-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
}

.action-btn.danger,
.mini-btn.danger {
    background: rgba(239, 68, 68, 0.16);
    border-color: rgba(239, 68, 68, 0.35);
    color: #ffcbcb;
}

.action-btn.danger:hover,
.mini-btn.danger:hover {
    background: rgba(239, 68, 68, 0.28);
}

.global-error {
    padding: 10px 12px;
    margin-bottom: 14px;
    border-radius: 10px;
    border: 1px solid rgba(239, 68, 68, 0.4);
    background: rgba(239, 68, 68, 0.1);
    color: #ffb9b9;
    font-size: 0.84rem;
}

.metrics-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 14px;
}

.metric-card {
    background: #161616;
    border: 1px solid rgba(77, 158, 57, 0.18);
    border-radius: 12px;
    padding: 14px;
}

.metric-label {
    font-size: 0.76rem;
    color: #9f9f9f;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    margin-bottom: 6px;
}

.metric-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: #ffffff;
    margin-bottom: 4px;
}

.metric-value.positive {
    color: #22c55e;
}

.metric-sub {
    font-size: 0.78rem;
    color: #838383;
}

.trend-panel {
    min-height: 170px;
}

.sparkline-wrap {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.sparkline-source {
    font-size: 0.75rem;
    color: #8e8e8e;
}

.sparkline-chart {
    width: 100%;
    height: 58px;
    border: 1px solid rgba(77, 158, 57, 0.18);
    border-radius: 8px;
    background: linear-gradient(180deg, rgba(77, 158, 57, 0.08) 0%, rgba(77, 158, 57, 0.02) 100%);
}

.sparkline {
    fill: none;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.sparkline-live {
    stroke: #22c55e;
}

.sparkline-persisted {
    stroke: #fbbf24;
}

.trend-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
}

.trend-stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 7px 8px;
    border-radius: 8px;
    background: rgba(77, 158, 57, 0.06);
    border: 1px solid rgba(77, 158, 57, 0.12);
}

.trend-stat span {
    font-size: 0.68rem;
    color: #929292;
    text-transform: uppercase;
    letter-spacing: 0.4px;
}

.trend-stat strong {
    font-size: 0.8rem;
    color: #ffffff;
}

.panel-grid {
    display: grid;
    gap: 12px;
    margin-bottom: 12px;
}

.panel-grid.two-col {
    grid-template-columns: repeat(2, 1fr);
}

.panel {
    background: #161616;
    border: 1px solid rgba(77, 158, 57, 0.18);
    border-radius: 12px;
    padding: 14px;
}

.panel-header {
    margin-bottom: 12px;
    display: flex;
    align-items: center;
}

.panel-header.between {
    justify-content: space-between;
    gap: 10px;
}

.panel-header h2 {
    margin: 0;
    font-size: 1.04rem;
    color: #d7eecf;
}

.stack-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 500px;
    overflow-y: auto;
    padding-right: 4px;
}

.item-card {
    border: 1px solid rgba(77, 158, 57, 0.15);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.02);
    padding: 10px;
}

.item-title-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 8px;
}

.item-title-row h3 {
    margin: 0;
    font-size: 0.95rem;
    color: #ffffff;
}

.tag {
    font-size: 0.68rem;
    color: #9ccf8f;
    border: 1px solid rgba(77, 158, 57, 0.32);
    background: rgba(77, 158, 57, 0.12);
    border-radius: 999px;
    padding: 3px 8px;
    white-space: nowrap;
}

.tag.mono {
    font-family: monospace;
}

.item-desc {
    margin: 0 0 10px 0;
    color: #a3a3a3;
    font-size: 0.82rem;
    line-height: 1.4;
}

.item-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.metric-row-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
}

.mini-metric {
    background: rgba(77, 158, 57, 0.06);
    border: 1px solid rgba(77, 158, 57, 0.1);
    border-radius: 8px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 3px;
}

.mini-metric span {
    font-size: 0.7rem;
    color: #949494;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.mini-metric strong {
    font-size: 0.84rem;
    color: #ffffff;
}

.mini-metric strong.positive,
.positive {
    color: #22c55e;
}

.mini-metric strong.negative,
.negative {
    color: #ef4444;
}

.detail-box {
    margin-top: 10px;
    padding: 10px;
    border: 1px solid rgba(77, 158, 57, 0.2);
    border-radius: 10px;
    background: rgba(77, 158, 57, 0.05);
}

.detail-title {
    font-size: 0.82rem;
    color: #9fd58f;
    margin-bottom: 8px;
    font-weight: 600;
}

.empty-state {
    border: 1px dashed rgba(77, 158, 57, 0.2);
    color: #8f8f8f;
    border-radius: 10px;
    padding: 16px;
    text-align: center;
    font-size: 0.86rem;
}

.inline-error {
    color: #ffb4b4;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 8px;
    padding: 8px 10px;
    margin-bottom: 10px;
    font-size: 0.82rem;
}

.form-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
}

.form-grid.one-line {
    grid-template-columns: 1fr;
    margin-bottom: 10px;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.field label {
    color: #a0a0a0;
    font-size: 0.76rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.field input,
.field select {
    border: 1px solid rgba(77, 158, 57, 0.25);
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.18);
    color: #ffffff;
    padding: 8px 10px;
    font-size: 0.86rem;
}

.field input:focus,
.field select:focus {
    outline: none;
    border-color: rgba(77, 158, 57, 0.65);
}

.insight-content {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.snapshot-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
}

.snapshot-card {
    border: 1px solid rgba(77, 158, 57, 0.18);
    border-radius: 10px;
    padding: 10px;
    background: rgba(255, 255, 255, 0.02);
}

.snapshot-title {
    color: #9fd58f;
    font-size: 0.8rem;
    margin-bottom: 8px;
    font-weight: 600;
}

.snapshot-row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    font-size: 0.8rem;
}

.snapshot-row:last-child {
    border-bottom: none;
}

.snapshot-row span {
    color: #9b9b9b;
}

.snapshot-row strong {
    color: #ffffff;
}

.subsection h4 {
    margin: 0 0 6px 0;
    color: #cfeec6;
    font-size: 0.86rem;
}

.compact-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.compact-item {
    display: grid;
    grid-template-columns: 1.4fr 1fr 0.8fr;
    gap: 8px;
    align-items: center;
    font-size: 0.78rem;
    padding: 7px 8px;
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.02);
}

.compact-item span {
    color: #e0e0e0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.compact-item span:nth-child(2) {
    color: #9a9a9a;
}

.compact-item span:nth-child(3) {
    color: #9fd58f;
    text-align: right;
}

.empty-inline {
    color: #929292;
    font-size: 0.8rem;
    padding: 8px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.02);
}

.stack-list::-webkit-scrollbar {
    width: 4px;
}

.stack-list::-webkit-scrollbar-track {
    background: rgba(77, 158, 57, 0.1);
}

.stack-list::-webkit-scrollbar-thumb {
    background: rgba(77, 158, 57, 0.35);
    border-radius: 999px;
}

@media (max-width: 1200px) {
    .page-header {
        grid-template-columns: 1fr;
        text-align: center;
    }

    .header-left,
    .header-right {
        justify-self: center;
    }

    .header-right {
        flex-wrap: wrap;
        justify-content: center;
    }

    .metrics-grid {
        grid-template-columns: repeat(2, 1fr);
    }

    .panel-grid.two-col {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 768px) {
    .omni-container {
        padding: 14px;
    }

    .page-title {
        font-size: 1.8rem;
    }

    .metrics-grid {
        grid-template-columns: 1fr;
    }

    .metric-row-grid,
    .snapshot-grid,
    .form-grid,
    .trend-stats {
        grid-template-columns: 1fr;
    }

    .compact-item {
        grid-template-columns: 1fr;
        gap: 3px;
    }

    .compact-item span:nth-child(3) {
        text-align: left;
    }

    .header-badge {
        flex-wrap: wrap;
        justify-content: center;
        border-radius: 12px;
    }
}
</style>