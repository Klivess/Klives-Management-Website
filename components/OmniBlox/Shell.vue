<template>
    <div class="ot-os bx-os">
        <a class="ot-skiplink" href="#bx-main">Skip to content</a>
        <div class="bx-band" :class="tone" role="presentation"></div>

        <header class="ot-top">
            <NuxtLink class="ot-brand" to="/schemery/omniblox">
                <b>OmniBlox</b>
                <small class="bx-wide">Game studio</small>
            </NuxtLink>

            <span class="ot-scope bx-status" :title="overview?.Status">
                <span class="ot-dot" :class="tone" aria-hidden="true"></span>
                <span class="bx-trunc">{{ statusLabel }}</span>
            </span>

            <div class="ot-top-spacer"></div>

            <span v-if="overview" class="ot-scope bx-wide">spent $0</span>
            <span class="ot-fresh" :class="{ stale: !!error }" aria-live="polite" :title="freshLabel">
                <span class="ot-dot" :class="error ? 'warn' : loadedAt ? 'ok' : ''" aria-hidden="true"></span>
                <span class="bx-wide">{{ freshLabel }}</span>
            </span>
            <button class="ot-btn ghost sm" :disabled="loading" @click="refreshAll">Refresh</button>
        </header>

        <nav class="ot-nav" aria-label="OmniBlox sections">
            <div class="ot-nav-group">
                <NuxtLink to="/schemery/omniblox" :class="{ active: route.path === '/schemery/omniblox' }">
                    Studio
                    <span v-if="openTasks" class="ot-badge warn" :title="`${openTasks} owner task(s)`">{{ openTasks }}</span>
                </NuxtLink>
                <NuxtLink to="/schemery/omniblox/assets" :class="{ active: route.path.startsWith('/schemery/omniblox/assets') }">Assets</NuxtLink>
                <NuxtLink to="/schemery/omniblox/playbook" :class="{ active: route.path.startsWith('/schemery/omniblox/playbook') }">Playbook</NuxtLink>
            </div>
            <div v-if="navGames.length" class="ot-nav-group">
                <span class="label" aria-hidden="true">Games</span>
                <NuxtLink v-for="g in navGames" :key="g.GameId" :to="`/schemery/omniblox/game/${g.GameId}`"
                          :class="{ active: route.params.gameId === g.GameId }" :title="g.WaitingReason ?? g.Stage">
                    <span class="ot-dot bx-navdot" :class="bloxGameDot(g)" aria-hidden="true"></span>
                    {{ g.Title }}
                </NuxtLink>
            </div>
        </nav>

        <main class="ot-page" id="bx-main">
            <div v-if="error && !overview" class="ot-banner" role="alert">
                <span class="glyph" aria-hidden="true">⚠</span>
                <div>
                    <strong>OmniBlox is not answering</strong>
                    {{ error }}
                </div>
                <div class="actions">
                    <button class="ot-btn sm" :disabled="loading" @click="refreshAll">Retry</button>
                </div>
            </div>
            <slot />
        </main>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { fmtRelative, useNow, usePoll } from '~/composables/useOmniTumblr';
import { bloxGameDot, useBloxOverview } from '~/composables/useOmniBlox';

const emit = defineEmits<{ refresh: [] }>();
const route = useRoute();
const now = useNow();
const { overview, error, loading, loadedAt, refresh } = useBloxOverview();

usePoll(refresh, 20_000);

function refreshAll() {
    void refresh();
    emit('refresh');
}

const freshLabel = computed(() => error.value ? 'Connection problem'
    : loadedAt.value ? `Updated ${fmtRelative(new Date(loadedAt.value).toISOString(), now.value)}` : 'Loading…');

const openTasks = computed(() => overview.value?.OwnerTasks.length ?? 0);

/** In production first (oldest first, as the orchestrator works them), then live, then retired; abandoned stay on the Studio page. */
const navGames = computed(() => {
    const games = overview.value?.Games ?? [];
    const rank = (stage: string) => ['Research', 'Build', 'Test', 'Launch'].includes(stage) ? 0 : stage === 'Live' ? 1 : 2;
    return games.filter(g => g.Stage !== 'Abandoned')
        .slice()
        .sort((a, b) => rank(a.Stage) - rank(b.Stage) || a.CreatedUtc.localeCompare(b.CreatedUtc));
});

const statusLabel = computed(() => {
    const o = overview.value;
    if (!o) return 'Connecting…';
    if (!o.Enabled) return 'Studio off';
    if (!o.Model.Available) return 'Paused: no model';
    return o.Status ? o.Status.charAt(0).toUpperCase() + o.Status.slice(1) : 'Idle';
});

const tone = computed(() => {
    const o = overview.value;
    if (!o) return '';
    if (o.Attention.some(a => a.Level === 'error') || o.Games.some(g => g.UrgentMaintenance)) return 'bad';
    if (!o.Enabled) return '';
    if (o.Attention.some(a => a.Level === 'warning') || o.OwnerTasks.length > 0) return 'warn';
    return 'ok';
});
</script>

<style scoped>
.bx-band { height: 3px; width: 100%; background: var(--ot-line-strong); }
.bx-band.ok { background: linear-gradient(90deg, #4ec98a, #63c8ea); }
.bx-band.warn { background: var(--ot-warning); }
.bx-band.bad { background: var(--ot-negative); box-shadow: 0 0 12px rgba(255, 107, 107, 0.45); }
.bx-navdot { width: 6px; height: 6px; margin-right: 2px; }
.ot-nav a { display: inline-flex; align-items: center; gap: 4px; }
</style>

<style>
/* Layout helpers shared by every OmniBlox page (pages' own styles are scoped). */
.bx-os .ot-top .bx-status { min-width: 0; flex: 0 1 auto; }
.bx-os .ot-top .bx-trunc { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bx-os .bx-kpis6 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (min-width: 820px) { .bx-os .bx-kpis6 { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (min-width: 1360px) { .bx-os .bx-kpis6 { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
.bx-os .bx-section { margin-bottom: var(--ot-gutter); }
.bx-os .bx-muted { color: var(--ot-muted); }
.bx-os .bx-mono { font-family: var(--ot-mono); }
.bx-os .bx-list { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; }
.bx-os .bx-tags { display: flex; flex-wrap: wrap; gap: 4px; }
@media (max-width: 720px) {
    .bx-os .bx-wide { display: none; }
    .bx-os .ot-top { padding: 0 var(--ot-space-3); gap: var(--ot-space-2); }
}
</style>
