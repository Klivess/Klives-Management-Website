<template>
    <div>
        <KMInfoGrid columns="1" rows="2" rowHeight="600">
            <KMInfoBox caption="Currently Active Schemes">
                <div class="scheme-links-grid">
                    <div class="scheme-row">
                        <NuxtLink to="/schemery/cs2arbitragebot" class="scheme-link">CS2ArbitrageBot</NuxtLink>
                        <p class="scheme-description">A bot for arbitrage trading in CS2.</p>
                    </div>
                    <div class="scheme-row">
                        <NuxtLink to="/schemery/memescraper" class="scheme-link">Meme Scraper</NuxtLink>
                        <p class="scheme-description">A bot that periodically downloads online media (memes), to use for producing automated content.</p>
                    </div>
                    <div class="scheme-row">
                        <NuxtLink to="/schemery/omnitrader" class="scheme-link">OmniTrader</NuxtLink>
                        <p class="scheme-description">An algorithmic trading bot.</p>
                        <span>(Incomplete)</span>
                    </div>
                    <div class="scheme-row">
                        <NuxtLink to="/schemery/omnitube" class="scheme-link">OmniTube Bot</NuxtLink>
                        <p class="scheme-description">A bot that automates the production, upload and strategy of YouTube content.</p>
                        <span>(Incomplete)</span>
                    </div>
                </div>
            </KMInfoBox>
            <KMInfoBox caption="What is a Scheme?" style="height: 100px;">
                <div style="display: flex; justify-content: center;">
                    anything that makes money
                </div>
            </KMInfoBox>
        </KMInfoGrid>
    </div>
</template>

<script setup>
definePageMeta({ layout: 'navbar' });
</script>

<script>
import KMInfoBox from '~/components/KMInfoBox.vue';
import Swal from 'sweetalert2/dist/sweetalert2.js';
import { NuxtPage } from '#components';
import KMInfoGrid from '~/components/KMInfoGrid.vue';
export default {
    components: {
        KMInfoGrid,
        KMInfoBox
    },
}
</script>

<style scoped>
.scheme-links-grid {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 1rem;
}
.scheme-row {
    display: flex;
    align-items: center;
    gap: 1rem;
}
.scheme-link {
    display: inline-block;
    padding: 0.8rem 1.5rem;
    background: linear-gradient(90deg, #4d9e39, #3a7d2e);
    border: none;
    border-radius: 5px;
    text-align: center;
    font-weight: bold;
    color: #ffffff; /* White text for better contrast */
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    text-decoration: none;
    transition: transform 0.2s, box-shadow 0.2s;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}
.scheme-link:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 8px rgba(0, 0, 0, 0.15);
}
.scheme-description {
    color: #00bfa5; /* Bright teal for better readability */
    font-size: 1rem;
    margin: 0;
}
</style>