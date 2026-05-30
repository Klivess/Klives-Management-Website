<template>
    <div class="schemes-container">
        <!-- Header -->
        <div class="schemes-header">
            <h1 class="schemes-title">Schemes</h1>
            <p class="schemes-subtitle">Automated money-making operations and bots</p>
        </div>

        <!-- Active Schemes -->
        <div class="section-label">Active</div>
        <div class="schemes-grid">
            <div class="scheme-card active" @click="$router.push('/schemery/cs2arbitragebot')">
                <div class="card-accent accent-green"></div>
                <div class="card-body">
                    <div class="card-top">
                        <span class="card-icon">🎯</span>
                        <span class="card-badge badge-active">Active</span>
                    </div>
                    <h2 class="card-title">CS2 Arbitrage Bot</h2>
                    <p class="card-desc">Scans CS2 marketplace listings to find and exploit price discrepancies between Steam and CSFloat for profit.</p>
                    
                    <!-- Analytics Section -->
                    <div v-if="!cs2Stats.loading" class="omnigram-stats">
                        <div class="stat-item">
                            <span class="stat-label">Success Rate</span>
                            <span class="stat-value">{{ cs2Stats.successRate }}%</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Scanned</span>
                            <span class="stat-value">{{ cs2Stats.itemsScanned.toLocaleString() }}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Best Find</span>
                            <span class="stat-value">{{ cs2Stats.bestFind }}%</span>
                        </div>
                    </div>
                    <div v-else class="omnigram-stats">
                        <span class="stat-loading">Loading stats...</span>
                    </div>
                    
                    <div class="card-footer">
                        <span class="card-action">View Analytics →</span>
                    </div>
                </div>
            </div>

            <div class="scheme-card active" @click="$router.push('/schemery/memescraper')">
                <div class="card-accent accent-purple"></div>
                <div class="card-body">
                    <div class="card-top">
                        <span class="card-icon">📱</span>
                        <span class="card-badge badge-active">Active</span>
                    </div>
                    <h2 class="card-title">Meme Scraper</h2>
                    <p class="card-desc">Periodically downloads media from Instagram sources for producing automated content across social platforms.</p>
                    
                    <!-- Analytics Section -->
                    <div v-if="!memescraperStats.loading" class="omnigram-stats">
                        <div class="stat-item">
                            <span class="stat-label">Sources</span>
                            <span class="stat-value">{{ memescraperStats.totalSources }}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Total Memes</span>
                            <span class="stat-value">{{ memescraperStats.totalMemes.toLocaleString() }}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Today</span>
                            <span class="stat-value">{{ memescraperStats.todayDownloads }}</span>
                        </div>
                    </div>
                    <div v-else class="omnigram-stats">
                        <span class="stat-loading">Loading stats...</span>
                    </div>
                    
                    <div class="card-footer">
                        <span class="card-action">View Analytics →</span>
                    </div>
                </div>
            </div>

            <div class="scheme-card active" @click="$router.push('/schemery/omnigram')">
                <div class="card-accent accent-instagram"></div>
                <div class="card-body">
                    <div class="card-top">
                        <span class="card-icon">📸</span>
                        <span class="card-badge badge-active">Active</span>
                    </div>
                    <h2 class="card-title">OmniGram</h2>
                    <p class="card-desc">Manages Instagram accounts with scheduled posting, content automation via MemeScraper, and engagement analytics.</p>
                    
                    <!-- Analytics Section -->
                    <div v-if="!omnigramStats.loading" class="omnigram-stats">
                        <div class="stat-item">
                            <span class="stat-label">Accounts</span>
                            <span class="stat-value">{{ omnigramStats.accounts }}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Followers</span>
                            <span class="stat-value">{{ (omnigramStats.followers / 1000).toFixed(1) }}K</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Posts (Week)</span>
                            <span class="stat-value">{{ omnigramStats.postsThisWeek }}</span>
                        </div>
                    </div>
                    <div v-else class="omnigram-stats">
                        <span class="stat-loading">Loading stats...</span>
                    </div>
                    
                    <div class="card-footer">
                        <span class="card-action">View Dashboard →</span>
                    </div>
                </div>
            </div>

            <div class="scheme-card active" @click="$router.push('/schemery/omnitumblr')">
                <div class="card-accent accent-tumblr"></div>
                <div class="card-body">
                    <div class="card-top">
                        <span class="card-icon">📝</span>
                        <span class="card-badge badge-active">Active</span>
                    </div>
                    <h2 class="card-title">OmniTumblr</h2>
                    <p class="card-desc">Manages Tumblr blogs with scheduled posting, content folder automation, and engagement analytics via OAuth.</p>
                    
                    <!-- Analytics Section -->
                    <div v-if="!omnitumblrStats.loading" class="omnigram-stats">
                        <div class="stat-item">
                            <span class="stat-label">Blogs</span>
                            <span class="stat-value tumblr-val">{{ omnitumblrStats.accounts }}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Followers</span>
                            <span class="stat-value tumblr-val">{{ omnitumblrStats.followers }}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Posts (Week)</span>
                            <span class="stat-value tumblr-val">{{ omnitumblrStats.postsThisWeek }}</span>
                        </div>
                    </div>
                    <div v-else class="omnigram-stats">
                        <span class="stat-loading">Loading stats...</span>
                    </div>
                    
                    <div class="card-footer">
                        <span class="card-action">View Dashboard →</span>
                    </div>
                </div>
            </div>

        </div>

        <!-- Simulator & In Development -->
        <div class="section-label">Simulator & In Development</div>
        <div class="schemes-grid">
            <div class="scheme-card sim" @click="$router.push('/schemery/omnitrader')">
                <div class="card-accent accent-amber"></div>
                <div class="card-body">
                    <div class="card-top">
                        <span class="card-icon">📈</span>
                        <div class="ot-badge-group">
                            <span v-if="omnitraderStats.liveArmed > 0" class="card-badge badge-live-armed">Live Armed</span>
                            <span v-else-if="omnitraderStats.liveCount > 0" class="card-badge badge-live">Live</span>
                            <span v-if="omnitraderStats.paperCount > 0" class="card-badge badge-paper">Paper</span>
                            <span v-if="omnitraderStats.liveArmed === 0 && omnitraderStats.liveCount === 0 && omnitraderStats.paperCount === 0" class="card-badge badge-sim">Idle</span>
                        </div>
                    </div>
                    <h2 class="card-title">OmniTrader</h2>
                    <p class="card-desc">Algorithmic strategy deployment across paper and live sessions, with backtesting and Kraken execution.</p>

                    <div v-if="!omnitraderStats.loading" class="ot-stats">
                        <div class="ot-section paper-section">
                            <div class="ot-section-head paper-head">
                                <span>PAPER</span>
                                <span class="ot-session-count">{{ omnitraderStats.paperCount }} running</span>
                            </div>
                            <div class="ot-section-body">
                                <div class="ot-stat">
                                    <span class="ot-stat-val paper-val">{{ omnitraderStats.paperCount }}</span>
                                    <span class="ot-stat-label">Sessions</span>
                                </div>
                                <div class="ot-stat">
                                    <span class="ot-stat-val" :class="omnitraderStats.paperPnL >= 0 ? 'paper-val' : 'neg-val'">{{ omnitraderStats.paperPnL >= 0 ? '+' : '' }}{{ omnitraderStats.paperPnL.toFixed(2) }}%</span>
                                    <span class="ot-stat-label">Net PnL</span>
                                </div>
                                <div class="ot-stat">
                                    <span class="ot-stat-val paper-val">{{ omnitraderStats.backtestCount }}</span>
                                    <span class="ot-stat-label">Backtests</span>
                                </div>
                            </div>
                        </div>
                        <div class="ot-section live-section">
                            <div class="ot-section-head live-head">
                                <span>LIVE</span>
                                <span class="ot-session-count" :class="omnitraderStats.liveArmed > 0 ? 'armed-indicator' : ''">{{ omnitraderStats.liveArmed > 0 ? omnitraderStats.liveArmed + ' armed' : 'none armed' }}</span>
                            </div>
                            <div class="ot-section-body">
                                <div class="ot-stat">
                                    <span class="ot-stat-val live-val">{{ omnitraderStats.liveCount }}</span>
                                    <span class="ot-stat-label">Sessions</span>
                                </div>
                                <div class="ot-stat">
                                    <span class="ot-stat-val" :class="omnitraderStats.liveArmed > 0 ? 'armed-val' : 'live-val'">{{ omnitraderStats.liveArmed }}</span>
                                    <span class="ot-stat-label">Armed</span>
                                </div>
                                <div class="ot-stat">
                                    <span class="ot-stat-val" :class="omnitraderStats.krakenOn ? 'live-val' : 'neg-val'">{{ omnitraderStats.krakenOn ? 'ON' : 'OFF' }}</span>
                                    <span class="ot-stat-label">Kraken</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div v-else class="omnigram-stats">
                        <span class="stat-loading">Loading stats...</span>
                    </div>

                    <div class="card-footer">
                        <span class="card-action">Open OmniTrader →</span>
                    </div>
                </div>
            </div>

            <div class="scheme-card dev" @click="$router.push('/schemery/omnitube')">
                <div class="card-accent accent-red"></div>
                <div class="card-body">
                    <div class="card-top">
                        <span class="card-icon">🎬</span>
                        <span class="card-badge badge-dev">Planned</span>
                    </div>
                    <h2 class="card-title">OmniTube Bot</h2>
                    <p class="card-desc">Automates the production, upload and optimisation of YouTube content and channel strategy.</p>
                    <div class="card-footer">
                        <span class="card-action">View Details →</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- What is a Scheme -->
        <div class="schemes-explainer">
            <span class="explainer-q">What is a Scheme?</span>
            <span class="explainer-a">anything that makes money</span>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { RequestGETFromKliveAPI } from '~/scripts/APIInterface';

definePageMeta({ layout: 'navbar' });

const omnigramStats = ref({ accounts: 0, followers: 0, postsThisWeek: 0, loading: true });
const omnitumblrStats = ref({ accounts: 0, followers: 0, postsThisWeek: 0, loading: true });
const cs2Stats = ref({ successRate: 0, itemsScanned: 0, bestFind: 0, loading: true });
const memescraperStats = ref({ totalSources: 0, totalMemes: 0, todayDownloads: 0, loading: true });
const omnitraderStats = ref({ paperCount: 0, liveCount: 0, liveArmed: 0, paperPnL: 0, backtestCount: 0, krakenOn: false, loading: true });

const fetchOmnigramStats = async () => {
    try {
        const response = await RequestGETFromKliveAPI('/omnigram/dashboard-stats', false, false);
        if (response.ok) {
            const data = await response.json();
            omnigramStats.value = {
                accounts: data.ActiveAccounts ?? 0,
                followers: data.TotalFollowers ?? 0,
                postsThisWeek: data.PostsThisWeek ?? 0,
                loading: false
            };
        } else {
            omnigramStats.value.loading = false;
        }
    } catch (error) {
        console.error('Failed to fetch OmniGram stats:', error);
        omnigramStats.value.loading = false;
    }
};

const fetchOmniTumblrStats = async () => {
    try {
        const response = await RequestGETFromKliveAPI('/omnitumblr/dashboard-stats', false, false);
        if (response.ok) {
            const data = await response.json();
            omnitumblrStats.value = {
                accounts: data.ActiveAccounts ?? 0,
                followers: data.TotalFollowers ?? 0,
                postsThisWeek: data.PostsThisWeek ?? 0,
                loading: false
            };
        } else {
            omnitumblrStats.value.loading = false;
        }
    } catch (error) {
        console.error('Failed to fetch OmniTumblr stats:', error);
        omnitumblrStats.value.loading = false;
    }
};

const fetchCS2Stats = async () => {
    try {
        const response = await RequestGETFromKliveAPI('/cs2arbitragebot/getscanalytics', false, false);
        if (response.ok) {
            const data = await response.json();
            cs2Stats.value = {
                successRate: Math.round((data.PercentageChanceOfFindingPositiveGainListing || 0) * 100) / 100,
                itemsScanned: data.TotalListingsScanned || 0,
                bestFind: Math.round(((data.HighestPredictedGainFoundSoFar - 1) * 100 || 0) * 100) / 100,
                loading: false
            };
        } else {
            cs2Stats.value.loading = false;
        }
    } catch (error) {
        console.error('Failed to fetch CS2 stats:', error);
        cs2Stats.value.loading = false;
    }
};

const fetchMemescraperStats = async () => {
    try {
        const response = await RequestGETFromKliveAPI('/memescraper/memeScraperAnalytics', false, false);
        if (response.ok) {
            const analytics = await response.json();
            let todayDownloads = 0;
            if (analytics.MemesDownloadedPerDay) {
                const today = new Date();
                const todayStr = today.toISOString().split('T')[0];
                for (const key of Object.keys(analytics.MemesDownloadedPerDay)) {
                    if (key.includes(todayStr) || new Date(key).toDateString() === today.toDateString()) {
                        todayDownloads = analytics.MemesDownloadedPerDay[key];
                        break;
                    }
                }
            }
            memescraperStats.value = {
                totalSources: analytics.TotalInstagramSources || 0,
                totalMemes: analytics.TotalReelsDownloaded || 0,
                todayDownloads,
                loading: false
            };
        } else {
            memescraperStats.value.loading = false;
        }
    } catch (error) {
        console.error('Failed to fetch MemeScraper stats:', error);
        memescraperStats.value.loading = false;
    }
};

const fetchOmniTraderStats = async () => {
    try {
        const [statusRes, deploymentsRes, backtestsRes] = await Promise.all([
            RequestGETFromKliveAPI('/api/omnitrader/status', false, false),
            RequestGETFromKliveAPI('/api/omnitrader/deployments', false, false),
            RequestGETFromKliveAPI('/api/omnitrader/backtests', false, false),
        ]);
        const status = statusRes.ok ? await statusRes.json() : null;
        const deployments = deploymentsRes.ok ? await deploymentsRes.json() : [];
        const backtests = backtestsRes.ok ? await backtestsRes.json() : [];

        const deps = Array.isArray(deployments) ? deployments : [];
        const paper = deps.filter(d => d.Mode === 'Paper');
        const live = deps.filter(d => d.Mode === 'Live');

        const paperEquity = paper.reduce((s, d) => s + (Number(d.EquityCurrent) || 0), 0);
        const paperInitial = paper.reduce((s, d) => s + (Number(d.EquityInitial) || 0), 0);
        const paperPnL = paperInitial === 0 ? 0 : (paperEquity - paperInitial) / paperInitial * 100;

        omnitraderStats.value = {
            paperCount: paper.filter(d => d.Status === 'Running').length,
            liveCount: live.length,
            liveArmed: live.filter(d => d.Armed).length,
            paperPnL,
            backtestCount: Array.isArray(backtests) ? backtests.length : 0,
            krakenOn: status?.KrakenConfigured ?? false,
            loading: false,
        };
    } catch (error) {
        console.error('Failed to fetch OmniTrader stats:', error);
        omnitraderStats.value.loading = false;
    }
};

onMounted(() => {
    fetchOmnigramStats();
    fetchOmniTumblrStats();
    fetchCS2Stats();
    fetchMemescraperStats();
    fetchOmniTraderStats();
});
</script>

<style scoped>
.schemes-container {
    padding: 20px 24px;
    background-color: #201f20;
    min-height: 100vh;
}

.schemes-header {
    text-align: center;
    margin-bottom: 30px;
    padding: 0 20px;
}

.schemes-title {
    font-size: 2.5rem;
    font-weight: bold;
    margin: 0 0 10px 0;
    background: linear-gradient(135deg, #4d9e39, #62ce47);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.schemes-subtitle {
    color: #969696;
    font-size: 1.1rem;
    margin: 0;
}

/* Section Labels */
.section-label {
    color: #969696;
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    padding: 0 12px;
    margin: 20px 0 10px 0;
}

/* Schemes Grid */
.schemes-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
    padding: 0 8px;
    margin-bottom: 10px;
}

/* Scheme Card */
.scheme-card {
    display: flex;
    background: #161616;
    border-radius: 14px;
    overflow: hidden;
    cursor: pointer;
    border: 1px solid rgba(77, 158, 57, 0.15);
    transition: all 0.3s ease;
}

.scheme-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
}

.scheme-card.active:hover {
    border-color: rgba(77, 158, 57, 0.5);
}

.scheme-card.dev {
    opacity: 0.75;
    border-color: rgba(156, 163, 175, 0.15);
}

.scheme-card.sim {
    border-color: rgba(245, 158, 11, 0.25);
}

.scheme-card.dev:hover {
    opacity: 0.9;
    border-color: rgba(156, 163, 175, 0.4);
}

.scheme-card.sim:hover {
    border-color: rgba(245, 158, 11, 0.6);
    box-shadow: 0 10px 30px rgba(245, 158, 11, 0.2);
}

/* Card Accent Strip */
.card-accent {
    width: 5px;
    flex-shrink: 0;
}

.accent-green { background: linear-gradient(to bottom, #4d9e39, #62ce47); }
.accent-purple { background: linear-gradient(to bottom, #8b5cf6, #a78bfa); }
.accent-amber { background: linear-gradient(to bottom, #f59e0b, #fbbf24); }
.accent-red { background: linear-gradient(to bottom, #ef4444, #f87171); }
.accent-instagram { background: linear-gradient(to bottom, #f97316, #fb7185); }
.accent-tumblr { background: linear-gradient(to bottom, #35465c, #001935); }
.tumblr-val { color: #5b8dd9; }
.accent-tumblr { background: linear-gradient(to bottom, #2ab8ff, #4ade80); }

/* Card Body */
.card-body {
    flex: 1;
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.card-icon {
    font-size: 1.5rem;
}

.card-badge {
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.badge-active {
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
    border: 1px solid rgba(34, 197, 94, 0.3);
}

.badge-dev {
    background: rgba(156, 163, 175, 0.15);
    color: #9ca3af;
    border: 1px solid rgba(156, 163, 175, 0.3);
}

.badge-sim {
    background: rgba(245, 158, 11, 0.16);
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.35);
}

.badge-auto {
    background: rgba(249, 115, 22, 0.18);
    color: #fdba74;
    border: 1px solid rgba(249, 115, 22, 0.38);
}

.card-title {
    color: #ffffff;
    font-size: 1.2rem;
    font-weight: 700;
    margin: 0;
}

.card-desc {
    color: #969696;
    font-size: 0.85rem;
    line-height: 1.5;
    margin: 0;
    flex: 1;
}

.card-footer {
    display: flex;
    justify-content: flex-end;
    padding-top: 4px;
}

.card-action {
    color: #4d9e39;
    font-size: 0.82rem;
    font-weight: 600;
    transition: color 0.2s ease;
}

.scheme-card:hover .card-action {
    color: #62ce47;
}

/* Explainer */
.schemes-explainer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin: 30px 12px 0 12px;
    padding: 14px 20px;
    background: #161616;
    border-radius: 12px;
    border: 1px solid rgba(77, 158, 57, 0.1);
}

.explainer-q {
    color: #969696;
    font-size: 0.85rem;
    font-weight: 600;
}

.explainer-a {
    color: #4d9e39;
    font-size: 0.85rem;
    font-style: italic;
}

/* OmniGram Stats */
.omnigram-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    padding: 10px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
}

.stat-label {
    font-size: 0.7rem;
    color: #969696;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
}

.stat-value {
    font-size: 1.1rem;
    font-weight: 700;
    color: #62ce47;
}

.stat-loading {
    grid-column: 1 / -1;
    text-align: center;
    font-size: 0.8rem;
    color: #969696;
    padding: 5px 0;
}

/* OmniTrader card */
.ot-badge-group { display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end; }
.badge-live-armed { background: rgba(239, 68, 68, 0.18); color: #ff7a84; border: 1px solid rgba(239, 68, 68, 0.4); }
.badge-live { background: rgba(245, 158, 11, 0.16); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.35); }
.badge-paper { background: rgba(56, 189, 248, 0.14); color: #7ad4f7; border: 1px solid rgba(56, 189, 248, 0.32); }

.ot-stats { display: flex; flex-direction: column; gap: 6px; margin: 8px 0; }

.ot-section { border-radius: 8px; overflow: hidden; border: 1px solid; }
.paper-section { border-color: rgba(56, 189, 248, 0.2); background: rgba(56, 189, 248, 0.03); }
.live-section { border-color: rgba(245, 158, 11, 0.22); background: rgba(245, 158, 11, 0.03); }

.ot-section-head { display: flex; justify-content: space-between; align-items: center; padding: 5px 10px; font: 800 10px ui-monospace, Consolas, monospace; letter-spacing: 1.2px; }
.paper-head { background: rgba(56, 189, 248, 0.12); color: #7ad4f7; border-bottom: 1px solid rgba(56, 189, 248, 0.15); }
.live-head { background: rgba(245, 158, 11, 0.1); color: #fbbf24; border-bottom: 1px solid rgba(245, 158, 11, 0.15); }
.ot-session-count { font: 600 10px ui-monospace, Consolas, monospace; letter-spacing: 0.5px; opacity: 0.7; }
.armed-indicator { opacity: 1; color: #ff7a84; }

.ot-section-body { display: grid; grid-template-columns: repeat(3, 1fr); }
.ot-stat { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 7px 4px; border-right: 1px solid rgba(255, 255, 255, 0.04); }
.ot-stat:last-child { border-right: none; }
.ot-stat-val { font-size: 1.05rem; font-weight: 700; line-height: 1; }
.ot-stat-label { font-size: 0.65rem; color: #696969; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }

.paper-val { color: #7ad4f7; }
.live-val { color: #fbbf24; }
.armed-val { color: #ff7a84; }
.neg-val { color: #ef4444; }

/* Responsive */
@media (max-width: 768px) {
    .schemes-grid {
        grid-template-columns: 1fr;
    }

    .schemes-title {
        font-size: 2rem;
    }
}
</style>