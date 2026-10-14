<template>
    <div class="ot-os ot-terminal" :data-density="density">
        <a class="ot-skiplink" href="#ot-main">Skip to content</a>
        <div class="ot-envband" :class="envClass(scope)" :style="scope === 'All' ? mixedBand : undefined" role="presentation"></div>

        <header class="ot-top">
            <NuxtLink class="ot-brand" to="/omnitrader">OMNITRADER</NuxtLink>
            <OtCommand />
            <select id="ot-env" v-model="scope" class="ot-envselect" :class="envClass(scope)" aria-label="Environment scope">
                <option value="All">All env</option>
                <option v-for="e in ENVIRONMENTS" :key="e" :value="e">{{ e }}</option>
            </select>
            <NuxtLink class="ot-scope" to="/omnitrader/desk" :title="overview?.Health.Summary ?? ''">
                <span class="ot-dot" :class="tradingDot"></span>
                <span>{{ overview ? (tradingPermitted ? 'TRADING' : 'BLOCKED') : '—' }}</span>
                <span v-if="overview?.Controls.SafeModeActive" class="ot-chip bad">SAFE</span>
                <span class="sep">│</span>
                <span>{{ fmtMoney(overview?.Portfolio.TotalValue, currency, 0) }}</span>
                <span v-if="exceptionCount" class="ot-badge" :title="`${exceptionCount} item(s) need a decision`">{{ exceptionCount }}</span>
            </NuxtLink>
            <span class="ot-top-spacer"></span>
            <span class="ot-fresh" :class="freshness.tone" :title="lastSync ? lastSync.toISOString() : ''">
                <span class="ot-dot" :class="freshness.dot"></span>{{ freshness.label }}
            </span>
            <span class="ot-clock" title="UTC"><b>{{ clock }}</b> UTC</span>
            <details class="ot-menu">
                <summary class="ot-btn ghost sm" aria-label="Display settings">⚙</summary>
                <div class="pop">
                    <span class="grp">Density</span>
                    <div class="ot-segment sm">
                        <button v-for="d in DENSITIES" :key="d" type="button" :aria-pressed="density === d" @click="density = d">{{ d }}</button>
                    </div>
                    <span class="grp">Ticker tape</span>
                    <label class="item"><input v-model="tapeOn" type="checkbox" /> show</label>
                    <input v-model="tapeText" class="ot-input sm mono" spellcheck="false" aria-label="Tape symbols" />
                    <button class="item" type="button" @click="refreshOverview">Refresh firm status</button>
                </div>
            </details>
        </header>

        <OtTape v-if="tapeOn" :symbols="tapeSymbols" />

        <nav class="ot-nav" aria-label="OmniTrader">
            <div v-for="group in navigation" :key="group.label" class="ot-nav-group">
                <span class="label">{{ group.label }}</span>
                <NuxtLink v-for="item in group.items" :key="item.to" :to="item.to" :class="{ active: isActive(item) }"
                          :aria-current="isActive(item) ? 'page' : undefined" :title="item.code">
                    {{ item.label }}
                    <span v-if="item.badge" class="ot-badge" :class="item.tone">{{ item.badge }}</span>
                </NuxtLink>
            </div>
        </nav>

        <main id="ot-main" class="ot-page">
            <div v-if="bookPage && overviewError" class="ot-banner" role="alert">
                <span class="glyph">⚠</span><strong>Firm status unavailable</strong><span class="muted">{{ overviewError }}</span>
                <div class="actions"><button class="ot-btn sm" :disabled="loadingOverview" @click="refreshOverview">Retry</button></div>
            </div>
            <div v-if="bookPage && overview && !overview.Health.TradingPermitted" class="ot-banner" role="alert">
                <span class="glyph">⛔</span><strong>Automated exposure blocked</strong>
                <span class="muted">{{ overview.Health.Blockers.join(' · ') }}</span>
                <div class="actions"><NuxtLink class="ot-btn sm ghost" to="/omnitrader/risk">Risk</NuxtLink></div>
            </div>
            <slot />
            <footer class="ot-foot mono">
                <span>Data: Binance · Coinbase · Kraken · Yahoo · SEC EDGAR · US Treasury · BLS · DBnomics · CBOE · Deribit · CoinGecko · DefiLlama · arXiv · OpenAlex</span>
                <a href="https://www.tradingview.com/" target="_blank" rel="noopener">Charts: TradingView Lightweight Charts™</a>
            </footer>
        </main>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useOmniTrader, usePolling, fmtMoney, fmtAgo, envClass, type Environment } from '~/composables/useOmniTrader';
import { usePersisted } from '~/composables/useTerminal';

const props = withDefaults(defineProps<{ pollMs?: number }>(), { pollMs: 15000 });

provide('otTerminal', true);

const route = useRoute();
const {
    environment, overview, overviewError, loadingOverview, lastSync, lastSuccessfulSync,
    tradingPermitted, currency, refreshOverview, exceptionCount,
} = useOmniTrader();

const ENVIRONMENTS: Environment[] = ['Paper', 'Demo', 'Live', 'Historical'];
const DENSITIES = ['compact', 'standard', 'comfortable'] as const;
const scope = environment;
const density = usePersisted<string>('terminal.density', 'standard');
const tapeOn = usePersisted<boolean>('terminal.tape', true);
const tapeText = usePersisted<string>('terminal.tapeSymbols', '^GSPC ^NDX ^RUT ^VIX ^TNX DX-Y.NYB EURUSD=X USDJPY=X GC=F CL=F BTCUSDT ETHUSDT SOLUSDT');
const tapeSymbols = computed(() => tapeText.value.split(/[\s,]+/).map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 30));

const mixedBand = {
    background: 'repeating-linear-gradient(90deg, var(--ot-env-live) 0 22px, var(--ot-env-demo) 22px 44px, var(--ot-env-paper) 44px 66px)',
};

const tradingDot = computed(() => {
    if (!overview.value) return '';
    if (!overview.value.Health.TradingPermitted) return 'bad';
    return overview.value.Controls.SafeModeActive ? 'warn' : 'ok';
});

// Null until mounted so the server-rendered clock never disagrees with the hydrating client.
const now = ref<number | null>(null);
const clock = computed(() => (now.value === null ? '--:--:--' : new Date(now.value).toISOString().slice(11, 19)));
const freshness = computed(() => {
    void now.value;
    if (loadingOverview.value && !overview.value) return { label: '…', tone: '', dot: '' };
    if (overviewError.value) return { label: lastSuccessfulSync.value ? fmtAgo(lastSuccessfulSync.value.toISOString()) : 'offline', tone: 'failed', dot: 'bad' };
    const age = lastSuccessfulSync.value ? Date.now() - lastSuccessfulSync.value.getTime() : Infinity;
    const stale = age > props.pollMs * 3;
    return { label: lastSuccessfulSync.value ? fmtAgo(lastSuccessfulSync.value.toISOString()) : '—', tone: stale ? 'stale' : '', dot: stale ? 'warn' : 'ok' };
});

interface NavItem { to: string; label: string; code: string; match?: string[]; badge?: number; tone?: string }

const navigation = computed<{ label: string; items: NavItem[] }[]>(() => {
    const e = overview.value?.Exceptions;
    return [
        {
            label: 'Mkt',
            items: [
                { to: '/omnitrader', label: 'Monitor', code: 'MON' },
                { to: '/omnitrader/instrument', label: 'Security', code: 'GP / DES / FA' },
                { to: '/omnitrader/screener', label: 'Screener', code: 'SCRN' },
                { to: '/omnitrader/crypto', label: 'Crypto', code: 'CRYPTO' },
                { to: '/omnitrader/macro', label: 'Macro', code: 'ECO' },
                { to: '/omnitrader/news', label: 'News', code: 'N' },
                { to: '/omnitrader/alerts', label: 'Alerts', code: 'ALERTS' },
                { to: '/omnitrader/markets', label: 'Watchlists', code: 'WL' },
            ],
        },
        {
            label: 'Research',
            items: [
                { to: '/omnitrader/studio', label: 'Studio', code: 'STUDIO' },
                { to: '/omnitrader/lab', label: 'Lab', code: 'LAB' },
                { to: '/omnitrader/research', label: 'Alpha', code: 'ALPHA' },
                { to: '/omnitrader/strategies', label: 'Deploy', code: 'DEPLOY' },
            ],
        },
        {
            label: 'Book',
            items: [
                { to: '/omnitrader/desk', label: 'Desk', code: 'DESK', badge: e?.UnacknowledgedCritical ?? 0 },
                { to: '/omnitrader/portfolio', label: 'Portfolio', code: 'PORT', badge: e?.MaterialBreaks ?? 0 },
                { to: '/omnitrader/execution', label: 'Execution', code: 'EMSX', badge: (e?.AwaitingApproval ?? 0) + (e?.UnknownOrders ?? 0), tone: e?.UnknownOrders ? '' : 'warn' },
                { to: '/omnitrader/risk', label: 'Risk', code: 'RISK', badge: overview.value?.Controls.SafeModeActive ? 1 : 0 },
                { to: '/omnitrader/performance', label: 'Perf', code: 'PERF' },
                { to: '/omnitrader/journal', label: 'Journal', code: 'JRNL' },
            ],
        },
        {
            label: 'Sys',
            items: [{ to: '/omnitrader/systems', label: 'Systems', code: 'SYS', badge: e?.CriticalAlerts ?? 0 }],
        },
    ];
});

const BOOK = ['/omnitrader/desk', '/omnitrader/portfolio', '/omnitrader/execution', '/omnitrader/risk', '/omnitrader/strategies'];
const bookPage = computed(() => BOOK.some(p => route.path.startsWith(p)));

function isActive(item: NavItem): boolean {
    return item.to === '/omnitrader' ? route.path === '/omnitrader' || route.path === '/omnitrader/' : route.path.startsWith(item.to);
}

usePolling(refreshOverview, props.pollMs);

let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => { now.value = Date.now(); timer = setInterval(() => { now.value = Date.now(); }, 1000); });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });
</script>

<style scoped>
.ot-scope { padding: 0 6px; border-radius: 3px; height: 24px; }
.ot-scope:hover { background: rgba(255, 255, 255, 0.04); }
.ot-foot { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 20px; padding-top: 8px; border-top: 1px solid var(--ot-line); font-size: 10px; color: var(--ot-disabled); }
.ot-foot a { color: var(--ot-muted); }
.ot-foot a:hover { color: var(--ot-accent); }
.ot-menu .pop { min-width: 240px; }
</style>
