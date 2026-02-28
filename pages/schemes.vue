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
                    <div class="card-footer">
                        <span class="card-action">View Analytics →</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- In Development -->
        <div class="section-label">In Development</div>
        <div class="schemes-grid">
            <div class="scheme-card dev" @click="$router.push('/schemery/omnitrader')">
                <div class="card-accent accent-amber"></div>
                <div class="card-body">
                    <div class="card-top">
                        <span class="card-icon">📈</span>
                        <span class="card-badge badge-dev">Development</span>
                    </div>
                    <h2 class="card-title">OmniTrader</h2>
                    <p class="card-desc">Algorithmic trading bot that analyses market patterns and executes trades autonomously.</p>
                    <div class="card-footer">
                        <span class="card-action">View Details →</span>
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
definePageMeta({ layout: 'navbar' });
</script>

<style scoped>
.schemes-container {
    padding: 20px 0;
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

.scheme-card.dev:hover {
    opacity: 0.9;
    border-color: rgba(156, 163, 175, 0.4);
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