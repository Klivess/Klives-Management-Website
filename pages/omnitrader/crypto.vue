<template>
    <OmniTraderShell>
        <div class="ot-pagehead">
            <h1><span class="code">CRYPTO</span>Crypto market</h1>
            <div class="ot-actions"><button class="ot-btn sm" :disabled="loading" @click="loadAll">Refresh</button></div>
        </div>

        <div class="ot-statbar">
            <div class="ot-stat lg"><span class="k">Market cap</span><span class="v">{{ fmtBig(g?.TotalMarketCapUsd) }}</span><span class="s" :class="tone(g?.MarketCapChange24hPct)">{{ fmtChg(g?.MarketCapChange24hPct) }}</span></div>
            <div class="ot-stat lg"><span class="k">24h volume</span><span class="v">{{ fmtBig(g?.TotalVolumeUsd) }}</span></div>
            <div class="ot-stat lg"><span class="k">BTC dominance</span><span class="v">{{ fmtPctPlain(g?.BtcDominancePct) }}</span></div>
            <div class="ot-stat lg"><span class="k">ETH dominance</span><span class="v">{{ fmtPctPlain(g?.EthDominancePct) }}</span></div>
            <div class="ot-stat lg"><span class="k">Fear &amp; Greed</span><span class="v">{{ fng.at(-1)?.Value ?? '—' }}</span><span class="s">{{ fng.at(-1)?.Label ?? '' }}</span></div>
            <div class="ot-stat lg"><span class="k">BTC DVOL</span><span class="v">{{ fmtN(dvolBtc.at(-1)?.V, 1) }}</span></div>
            <div class="ot-stat lg"><span class="k">ETH DVOL</span><span class="v">{{ fmtN(dvolEth.at(-1)?.V, 1) }}</span></div>
            <div class="ot-stat lg"><span class="k">DeFi TVL</span><span class="v">{{ fmtBig(defi?.Tvl?.at(-1)?.V) }}</span></div>
            <div class="ot-stat lg"><span class="k">Stablecoins</span><span class="v">{{ fmtBig(defi?.Stablecoins?.at(-1)?.V) }}</span></div>
        </div>

        <div class="ot-grid sidebar">
            <div class="ot-stack">
                <OtPanel title="Top coins" code="COIN" flush :loading="loadingCoins" :error="coinsError" :empty="!coins.length" persist="crypto.coins">
                    <OtGrid :rows="coins" :columns="coinCols" grid-key="crypto.coins" selectable :row-key="(r: any) => r.Id" export-name="coins" max-height="620px" default-sort="MarketCap" @select="openCoin" />
                </OtPanel>
                <OtPanel title="Perpetual funding" code="FUND" flush :loading="loadingFunding" :error="fundingError" :empty="!funding.length" persist="crypto.funding">
                    <OtGrid :rows="funding" :columns="fundingCols" grid-key="crypto.funding" selectable :row-key="(r: any) => r.Symbol" export-name="funding" max-height="520px" default-sort="QuoteVolume24h"
                            @select="(r: any) => open(r.Symbol, 'DER')" />
                </OtPanel>
                <div class="ot-grid two">
                    <OtPanel title="Chains by TVL" code="CHAIN" flush persist="crypto.chains" :loading="loadingDefi">
                        <OtGrid :rows="defi?.Chains ?? []" :columns="chainCols" bare :row-key="(r: any) => r.Name" />
                    </OtPanel>
                    <OtPanel title="Trending" code="TRND" flush persist="crypto.trending">
                        <OtGrid :rows="trending" :columns="trendCols" bare :row-key="(r: any) => r.Id ?? r.Symbol" />
                    </OtPanel>
                </div>
            </div>
            <div class="ot-stack">
                <OtPanel title="Implied vol (DVOL)" code="DVOL" persist="crypto.dvol" :loading="loadingVol">
                    <OtSeries :series="[{ name: 'BTC', data: dvolBtc.map(p => ({ t: p.T, v: p.V })), color: '#f5a524' }, { name: 'ETH', data: dvolEth.map(p => ({ t: p.T, v: p.V })), color: '#4aa8ff' }]" :height="200" :decimals="1" />
                </OtPanel>
                <OtPanel title="Fear & Greed" code="FNG" persist="crypto.fng" :loading="loadingVol">
                    <OtSeries :series="[{ name: 'index', type: 'baseline', data: fng.map(p => ({ t: p.T, v: p.Value })) }]" :baseline="50" :height="170" :decimals="0" />
                </OtPanel>
                <OtPanel title="DeFi TVL" code="TVL" persist="crypto.tvl" :loading="loadingDefi">
                    <OtSeries :series="[{ name: 'TVL', type: 'area', data: (defi?.Tvl ?? []).map((p: any) => ({ t: p.T, v: p.V })) }]" :height="170" format="big" />
                </OtPanel>
                <OtPanel title="Stablecoin supply" code="STBL" persist="crypto.stable" :loading="loadingDefi">
                    <OtSeries :series="[{ name: 'supply', type: 'area', color: '#26c281', data: (defi?.Stablecoins ?? []).map((p: any) => ({ t: p.T, v: p.V })) }]" :height="170" format="big" />
                </OtPanel>
            </div>
        </div>
    </OmniTraderShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { fmtBig, fmtChg, fmtN, fmtPctPlain, tGet, tone, useTicker } from '~/composables/useTerminal';
import type { GridColumn } from '~/components/Ot/Grid.vue';

definePageMeta({ layout: 'navbar' });
const router = useRouter();

const g = ref<any>(null);
const coins = ref<any[]>([]);
const funding = ref<any[]>([]);
const fng = ref<any[]>([]);
const dvolBtc = ref<any[]>([]);
const dvolEth = ref<any[]>([]);
const defi = ref<any>(null);
const trending = ref<any[]>([]);
const loading = ref(false);
const loadingCoins = ref(false), loadingFunding = ref(false), loadingVol = ref(false), loadingDefi = ref(false);
const coinsError = ref<string | null>(null), fundingError = ref<string | null>(null);

async function loadAll() {
    loading.value = true;
    loadingCoins.value = loadingFunding.value = loadingVol.value = loadingDefi.value = true;
    const jobs = [
        tGet<any>('/terminal/crypto/global').then(r => { g.value = r; }).catch(() => {}),
        tGet<any[]>('/terminal/crypto/coins', { count: 250 }).then(r => { coins.value = r ?? []; coinsError.value = null; }).catch(e => { coinsError.value = e.message; }).finally(() => { loadingCoins.value = false; }),
        tGet<any[]>('/terminal/crypto/funding').then(r => { funding.value = r ?? []; fundingError.value = null; }).catch(e => { fundingError.value = e.message; }).finally(() => { loadingFunding.value = false; }),
        Promise.all([
            tGet<any[]>('/terminal/crypto/fear-greed', { days: 365 }).then(r => { fng.value = r ?? []; }).catch(() => {}),
            tGet<any[]>('/terminal/crypto/dvol', { currency: 'BTC', days: 365 }).then(r => { dvolBtc.value = r ?? []; }).catch(() => {}),
            tGet<any[]>('/terminal/crypto/dvol', { currency: 'ETH', days: 365 }).then(r => { dvolEth.value = r ?? []; }).catch(() => {}),
        ]).finally(() => { loadingVol.value = false; }),
        tGet<any>('/terminal/crypto/defi').then(r => { defi.value = r; }).catch(() => {}).finally(() => { loadingDefi.value = false; }),
        tGet<any[]>('/terminal/crypto/trending').then(r => { trending.value = r ?? []; }).catch(() => {}),
    ];
    await Promise.all(jobs);
    loading.value = false;
}
useTicker(loadAll, 120_000);

const coinCols: GridColumn[] = [
    { key: 'Rank', label: '#', format: 'int', width: '36px' }, { key: 'Symbol', label: 'Coin', format: 'sym', value: r => String(r.Symbol).toUpperCase() },
    { key: 'Name', label: 'Name', format: 'text' }, { key: 'Price', label: 'Price', format: 'price' },
    { key: 'Change1hPct', label: '1h', format: 'chg', heat: 3 }, { key: 'Change24hPct', label: '24h', format: 'chg', heat: 10 }, { key: 'Change7dPct', label: '7d', format: 'chg', heat: 25 },
    { key: 'MarketCap', label: 'Mkt cap', format: 'big' }, { key: 'Volume24h', label: 'Volume', format: 'big' },
    { key: 'Turnover', label: 'Vol/MC', format: 'pct', decimals: 1, value: r => (r.MarketCap ? (r.Volume24h / r.MarketCap) * 100 : null) },
    { key: 'AthChangePct', label: 'From ATH', format: 'chg', decimals: 0 }, { key: 'CirculatingSupply', label: 'Supply', format: 'big', hidden: true },
    { key: 'BinanceSymbol', label: 'Binance', format: 'sym', hidden: true },
];
const fundingCols: GridColumn[] = [
    { key: 'Symbol', label: 'Perp', format: 'sym' }, { key: 'MarkPrice', label: 'Mark', format: 'price' },
    { key: 'FundingRate', label: 'Rate %', format: 'num', decimals: 4, value: r => r.FundingRate * 100, signed: true },
    { key: 'FundingAnnualPct', label: 'Annualised', format: 'chg', heat: 40, decimals: 1 }, { key: 'BasisPct', label: 'Basis', format: 'chg', decimals: 3 },
    { key: 'PriceChangePct24h', label: '24h', format: 'chg', heat: 10 }, { key: 'QuoteVolume24h', label: 'Volume', format: 'big' },
    { key: 'NextFundingUtc', label: 'Next', format: 'datetime', hidden: true },
];
const chainTotal = computed(() => (defi.value?.Chains ?? []).reduce((a: number, c: any) => a + (c.Tvl ?? 0), 0));
const chainCols: GridColumn[] = [
    { key: 'Name', label: 'Chain', format: 'text' }, { key: 'Token', label: 'Token', format: 'sym' }, { key: 'Tvl', label: 'TVL', format: 'big' },
    { key: 'Share', label: 'Share', format: 'pct', value: r => (chainTotal.value ? (r.Tvl / chainTotal.value) * 100 : null) },
];
const trendCols: GridColumn[] = [
    { key: 'Symbol', label: 'Coin', format: 'sym' }, { key: 'Name', label: 'Name', format: 'text' }, { key: 'Rank', label: 'Rank', format: 'int' },
    { key: 'Price', label: 'Price', format: 'price' }, { key: 'Change24hPct', label: '24h', format: 'chg', heat: 15 },
];

function open(symbol: string, tab = 'GP') { void router.push(`/omnitrader/instrument?symbol=${encodeURIComponent(symbol)}&tab=${tab}`); }
function openCoin(r: any) { open(r.BinanceSymbol ?? `${String(r.Symbol).toUpperCase()}USDT`); }
</script>
