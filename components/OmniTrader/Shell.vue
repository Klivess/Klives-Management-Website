<template>
    <div class="ot-os" :data-density="density">
        <a class="ot-skiplink" href="#ot-main">Skip to content</a>

        <!-- Persistent environment band. Its colour is the single loudest signal on the page:
             an operator should never have to read text to know they are pointed at live money. -->
        <div class="ot-envband" :class="envClass(scope)" :style="scope === 'All' ? mixedBand : undefined"
             role="presentation"></div>

        <header class="ot-top">
            <NuxtLink class="ot-brand" to="/omnitrader">
                <b>OmniTrader</b>
                <small>Trading OS</small>
            </NuxtLink>

            <label class="visually-hidden" for="ot-env">Environment scope</label>
            <div class="envwrap">
                <select id="ot-env" class="ot-envselect" :class="envClass(scope)" v-model="scope">
                    <option value="All">All environments</option>
                    <option v-for="e in ENVIRONMENTS" :key="e" :value="e">{{ e }}</option>
                </select>
            </div>

            <span v-if="scope === 'All' && hasLiveVenue" class="ot-chip live" title="This scope includes live accounts">
                <span class="glyph" aria-hidden="true">●</span> includes live
            </span>

            <span class="ot-scope">
                <span class="ot-dot" :class="tradingDot" aria-hidden="true"></span>
                {{ tradingPermitted ? 'Trading permitted' : 'Trading blocked' }}
                <span class="sep" aria-hidden="true">·</span>
                <span>{{ currency }} {{ fmtMoney(overview?.Portfolio.TotalValue, currency, 0) }}</span>
            </span>

            <span v-if="overview?.Controls.SafeModeActive" class="ot-chip bad"
                  :title="overview.Controls.SafeModeReason ?? ''">
                <span class="glyph" aria-hidden="true">⛔</span> Safe mode
            </span>

            <div class="ot-top-spacer"></div>

            <!-- Freshness says which kind of "now" this is: live, stale, or last-known-good. -->
            <span class="ot-fresh" :class="freshness.tone" :title="lastSync ? lastSync.toISOString() : ''"
                  aria-live="polite">
                <span class="ot-dot" :class="freshness.dot" aria-hidden="true"></span>
                {{ freshness.label }}
            </span>

            <button class="ot-btn ghost sm" :disabled="loadingOverview" @click="refreshOverview">Refresh</button>

            <div class="ot-segment sm" role="group" aria-label="Row density">
                <button type="button" :aria-pressed="density === 'standard'" @click="density = 'standard'">Standard</button>
                <button type="button" :aria-pressed="density === 'compact'" @click="density = 'compact'">Compact</button>
            </div>

            <button class="ot-btn ghost sm" @click="paletteOpen = true" title="Jump to a page (Ctrl+K)">⌘K</button>
        </header>

        <nav class="ot-nav" aria-label="OmniTrader sections">
            <div v-for="group in navigation" :key="group.label" class="ot-nav-group">
                <span class="label" aria-hidden="true">{{ group.label }}</span>
                <NuxtLink v-for="item in group.items" :key="item.to" :to="item.to"
                          :class="{ active: isActive(item.to) }"
                          :aria-current="isActive(item.to) ? 'page' : undefined">
                    {{ item.label }}
                    <span v-if="item.badge" class="ot-badge" :class="item.tone"
                          :title="`${item.badge} ${item.badgeLabel}`">{{ item.badge }}</span>
                </NuxtLink>
            </div>
        </nav>

        <main class="ot-page" id="ot-main">
            <!-- A failure keeps the page it can still serve, names what broke, and offers a retry. -->
            <div v-if="overviewError" class="ot-banner" role="alert">
                <span class="glyph" aria-hidden="true">⚠</span>
                <div>
                    <strong>Firm status is unavailable</strong>
                    {{ overviewError }}
                    <template v-if="lastSuccessfulSync">
                        Showing the last successful reading from {{ fmtTime(lastSuccessfulSync.toISOString()) }}.
                    </template>
                </div>
                <div class="actions">
                    <button class="ot-btn sm" :disabled="loadingOverview" @click="refreshOverview">Retry</button>
                </div>
            </div>

            <!-- Blockers are shown on every page, not just Risk. A blocked platform that looks
                 normal on nine of ten screens is exactly the failure this is meant to prevent. -->
            <div v-if="overview && !overview.Health.TradingPermitted" class="ot-banner" role="alert">
                <span class="glyph" aria-hidden="true">⛔</span>
                <div>
                    <strong>New automated exposure is blocked</strong>
                    <ul>
                        <li v-for="blocker in overview.Health.Blockers" :key="blocker">{{ blocker }}</li>
                    </ul>
                </div>
                <div class="actions">
                    <NuxtLink class="ot-btn sm ghost" to="/omnitrader/risk">Risk controls</NuxtLink>
                </div>
            </div>

            <slot />
        </main>

        <!-- Command palette: ten pages is enough that jumping beats hunting. -->
        <div v-if="paletteOpen" class="ot-palette" @click.self="paletteOpen = false">
            <div class="box" role="dialog" aria-modal="true" aria-label="Jump to">
                <input ref="paletteInput" v-model="paletteQuery" placeholder="Jump to a page…"
                       @keydown.down.prevent="movePalette(1)" @keydown.up.prevent="movePalette(-1)"
                       @keydown.enter.prevent="choosePalette()" @keydown.esc="paletteOpen = false" />
                <ul>
                    <li v-for="(item, index) in paletteResults" :key="item.to"
                        :class="{ active: index === paletteIndex }"
                        @mouseenter="paletteIndex = index" @click="choosePalette(item)">
                        {{ item.label }}
                        <span class="group">{{ item.group }}</span>
                    </li>
                    <li v-if="!paletteResults.length" class="muted">No page matches “{{ paletteQuery }}”.</li>
                </ul>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
    useOmniTrader, usePolling, fmtMoney, fmtAgo, fmtTime, envClass, type Environment,
} from '~/composables/useOmniTrader';

const props = withDefaults(defineProps<{ pollMs?: number }>(), { pollMs: 15000 });

const route = useRoute();
const router = useRouter();
const {
    environment, overview, overviewError, loadingOverview, lastSync, lastSuccessfulSync, density,
    tradingPermitted, currency, refreshOverview,
} = useOmniTrader();

const ENVIRONMENTS: Environment[] = ['Paper', 'Demo', 'Live', 'Historical'];
const scope = environment;

// "All" is a real scope, not an absence of one — so it gets its own unmistakable band
// rather than borrowing the colour of whichever environment happens to be first.
const mixedBand = {
    background: 'repeating-linear-gradient(90deg, var(--ot-env-live) 0 22px, var(--ot-env-demo) 22px 44px, var(--ot-env-paper) 44px 66px)',
};

const hasLiveVenue = computed(() => overview.value?.Venues.some(v => v.Environment === 'Live') ?? false);

const tradingDot = computed(() => {
    if (!overview.value) return '';
    if (!overview.value.Health.TradingPermitted) return 'bad';
    return overview.value.Controls.SafeModeActive ? 'warn' : 'ok';
});

// Freshness distinguishes "current", "getting old" and "we have not managed to
// refresh since X" — three different facts that a single timestamp would blur.
const now = ref(Date.now());
const freshness = computed(() => {
    void now.value;
    if (loadingOverview.value && !overview.value) return { label: 'Loading…', tone: '', dot: '' };
    if (overviewError.value) {
        return {
            label: lastSuccessfulSync.value
                ? `Last good ${fmtAgo(lastSuccessfulSync.value.toISOString())}`
                : 'Never updated',
            tone: 'failed', dot: 'bad',
        };
    }
    const ageMs = lastSuccessfulSync.value ? Date.now() - lastSuccessfulSync.value.getTime() : Infinity;
    const stale = ageMs > props.pollMs * 3;
    return {
        label: `Updated ${lastSuccessfulSync.value ? fmtAgo(lastSuccessfulSync.value.toISOString()) : 'never'}`,
        tone: stale ? 'stale' : '', dot: stale ? 'warn' : 'ok',
    };
});

const navigation = computed(() => {
    const e = overview.value?.Exceptions;
    return [
        {
            label: 'Now',
            items: [
                { to: '/omnitrader', label: 'Command Centre', badge: e?.UnacknowledgedCritical ?? 0, tone: '', badgeLabel: 'unacknowledged critical alert(s)' },
                { to: '/omnitrader/markets', label: 'Markets', badge: 0, tone: '', badgeLabel: '' },
                { to: '/omnitrader/execution', label: 'Execution', badge: (e?.AwaitingApproval ?? 0) + (e?.UnknownOrders ?? 0), tone: e?.UnknownOrders ? '' : 'warn', badgeLabel: 'order(s) needing a decision' },
            ],
        },
        {
            label: 'Book',
            items: [
                { to: '/omnitrader/portfolio', label: 'Portfolio', badge: e?.MaterialBreaks ?? 0, tone: '', badgeLabel: 'material reconciliation break(s)' },
                { to: '/omnitrader/risk', label: 'Risk', badge: overview.value?.Controls.SafeModeActive ? 1 : 0, tone: '', badgeLabel: 'safe mode engaged' },
            ],
        },
        {
            label: 'Edge',
            items: [
                { to: '/omnitrader/strategies', label: 'Strategies', badge: 0, tone: '', badgeLabel: '' },
                { to: '/omnitrader/research', label: 'Research', badge: 0, tone: '', badgeLabel: '' },
                { to: '/omnitrader/performance', label: 'Performance', badge: 0, tone: '', badgeLabel: '' },
                { to: '/omnitrader/journal', label: 'Journal', badge: 0, tone: '', badgeLabel: '' },
            ],
        },
        {
            label: 'Platform',
            items: [
                { to: '/omnitrader/systems', label: 'Systems', badge: e?.CriticalAlerts ?? 0, tone: '', badgeLabel: 'critical alert(s)' },
            ],
        },
    ];
});

function isActive(to: string): boolean {
    return to === '/omnitrader' ? route.path === '/omnitrader' : route.path.startsWith(to);
}

// ── command palette ──────────────────────────────────────────────────────────

const paletteOpen = ref(false);
const paletteQuery = ref('');
const paletteIndex = ref(0);
const paletteInput = ref<HTMLInputElement | null>(null);

const paletteItems = computed(() =>
    navigation.value.flatMap(group => group.items.map(item => ({ ...item, group: group.label }))));

const paletteResults = computed(() => {
    const q = paletteQuery.value.trim().toLowerCase();
    if (!q) return paletteItems.value;
    return paletteItems.value.filter(i => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q));
});

function movePalette(delta: number) {
    const count = paletteResults.value.length;
    if (!count) return;
    paletteIndex.value = (paletteIndex.value + delta + count) % count;
}

function choosePalette(item?: { to: string }) {
    const target = item ?? paletteResults.value[paletteIndex.value];
    if (!target) return;
    paletteOpen.value = false;
    void router.push(target.to);
}

function onKeydown(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        paletteOpen.value = !paletteOpen.value;
    } else if (event.key === 'Escape') {
        paletteOpen.value = false;
    }
}

watch(paletteOpen, async open => {
    if (!open) return;
    paletteQuery.value = '';
    paletteIndex.value = 0;
    await nextTick();
    paletteInput.value?.focus();
});

usePolling(refreshOverview, props.pollMs);

let clock: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
    window.addEventListener('keydown', onKeydown);
    // Relative timestamps must keep counting; without this "2s ago" stays "2s ago".
    clock = setInterval(() => { now.value = Date.now(); }, 5000);
});
onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown);
    if (clock) clearInterval(clock);
});
</script>

<style scoped>
.ot-brand { text-decoration: none; color: inherit; }
.envwrap { display: inline-flex; }
.ot-envselect { appearance: none; padding-right: var(--ot-space-3); }
.visually-hidden {
    position: absolute; width: 1px; height: 1px; overflow: hidden;
    clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap;
}
</style>
