<template>
    <div class="ot-os ms-os">
        <a class="ot-skiplink" href="#ms-main">Skip to content</a>
        <div class="ms-band" :class="overall.level" role="presentation"></div>

        <header class="ot-top">
            <NuxtLink class="ot-brand" :to="link('/schemery/memescraper')">
                <b>MemeScraper</b>
                <small class="ms-wide-only">Reel collector</small>
            </NuxtLink>

            <span class="ot-scope ms-status" :title="overall.detail">
                <span class="ot-dot" :class="[dotTone, { pulse: busy }]" aria-hidden="true"></span>
                <span class="ms-trunc">{{ statusText }}</span>
            </span>
            <span v-if="health?.NextScrapeDueUtc && !health.CurrentScrape && !health.Settings?.Paused" class="ot-scope ms-wide-only">
                <span class="sep" aria-hidden="true">·</span>
                next scrape {{ fmtDue(health.NextScrapeDueUtc, now) }}
            </span>
            <span v-if="(health?.ScrapeQueued ?? 0) > 1" class="ot-scope ms-wide-only">
                <span class="sep" aria-hidden="true">·</span>
                {{ health!.ScrapeQueued - 1 }} queued
            </span>

            <div class="ot-top-spacer"></div>

            <span class="ot-fresh" :class="{ stale: !!error }" aria-live="polite" :title="freshLabel">
                <span class="ot-dot" :class="error ? 'warn' : loadedAt ? 'ok' : ''" aria-hidden="true"></span>
                <span class="ms-wide-only">{{ freshLabel }}</span>
            </span>
            <button class="ot-btn ghost sm" @click="refreshAll">Refresh</button>
        </header>

        <nav class="ot-nav" aria-label="MemeScraper sections">
            <div class="ot-nav-group">
                <NuxtLink :to="link('/schemery/memescraper')" :class="{ active: route.path === '/schemery/memescraper' }">Overview</NuxtLink>
                <NuxtLink v-if="can('memescraper.sources.read')" :to="link('/schemery/memescraper/sources')" :class="{ active: route.path.startsWith('/schemery/memescraper/sources') }">
                    Sources
                    <span v-if="(health?.FailingSources ?? 0) > 0" class="ot-badge" :title="`${health!.FailingSources} source(s) failed their last scrape`">{{ health!.FailingSources }}</span>
                </NuxtLink>
                <NuxtLink v-if="can('memescraper.sources.read')" :to="link('/schemery/memescraper/library')" :class="{ active: route.path.startsWith('/schemery/memescraper/library') }">Library</NuxtLink>
                <NuxtLink :to="link('/schemery/memescraper/health')" :class="{ active: route.path.startsWith('/schemery/memescraper/health') }">
                    Health
                    <span v-if="providerAlerts" class="ot-badge warn" :title="`${providerAlerts} provider(s) failing`">{{ providerAlerts }}</span>
                </NuxtLink>
            </div>
            <div v-if="health" class="ot-nav-group ms-wide-only">
                <span class="label" aria-hidden="true">Library</span>
                <span class="ms-navfact">{{ fmtCount(health.ReelsOnDisk) }} reels</span>
                <span class="ms-navfact">{{ health.Sources?.length ?? 0 }} sources</span>
            </div>
        </nav>

        <main class="ot-page" id="ms-main">
            <div v-if="error && !health" class="ot-banner" role="alert">
                <span class="glyph" aria-hidden="true">⚠</span>
                <div>
                    <strong>MemeScraper is not answering</strong>
                    {{ error }}
                </div>
                <div class="actions">
                    <button class="ot-btn sm" @click="refreshAll">Retry</button>
                </div>
            </div>
            <slot />
        </main>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAccess } from '~/composables/useAccess';
import { currentScrapeSubject, fmtRel, fmtDue, useMemeDataVersion, useMemeHealth, useMemeNow, useMemeRange } from '~/composables/useMemeScraper';
import { fmtCount } from '~/composables/useOmniTumblr';

const route = useRoute();
const { can } = useAccess();
const now = useMemeNow();
const range = useMemeRange();
const { bump } = useMemeDataVersion();
const { health, error, loadedAt, busy, overall, refresh } = useMemeHealth();

function link(path: string) {
    return { path, query: range.linkQuery.value };
}

const dotTone = computed(() => ({ good: 'ok', warn: 'warn', bad: 'bad' } as Record<string, string>)[overall.value.level] ?? '');

const statusText = computed(() => {
    const h = health.value;
    if (h?.CurrentScrape) {
        const subject = currentScrapeSubject(h.CurrentScrape);
        if (h.CurrentScrape.startsWith('provider check')) return `Checking providers on ${subject}`;
        if (h.CurrentScrape.startsWith('profile refresh')) return `Refreshing ${subject}`;
        return `Scraping ${subject}`;
    }
    return overall.value.label;
});

const providerAlerts = computed(() => (health.value?.Providers ?? []).filter(p => p.ConsecutiveFailures > 0).length);

const freshLabel = computed(() => error.value ? 'Connection problem'
    : loadedAt.value ? `Updated ${fmtRel(new Date(loadedAt.value).toISOString(), now.value)}` : 'Loading…');

// Fast while something runs so progress shows live; slow otherwise. When a run ends, pages reload
// so the reels it downloaded appear without a manual refresh.
let timer: ReturnType<typeof setTimeout> | null = null;
let wasBusy = false;
let stopped = false;

async function tick() {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden' && !busy.value) {
        schedule();
        return;
    }
    await refresh();
    if (wasBusy && !busy.value) bump();
    wasBusy = busy.value;
    schedule();
}

function schedule() {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(tick, busy.value ? 4_000 : 30_000);
}

function refreshAll() {
    void refresh();
    bump();
}

/** Called by pages right after they start a scrape or check, so the fast poll begins at once. */
function onWorkStarted() {
    wasBusy = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(tick, 1_500);
}

// Sources are added by a background lookup (a minute or two): reload when one lands or disappears.
watch(() => health.value?.Sources?.length, (count, previous) => {
    if (previous !== undefined && count !== undefined && count !== previous) bump();
});

onMounted(() => {
    void tick();
    window.addEventListener('memescraper:work-started', onWorkStarted);
});
onBeforeUnmount(() => {
    stopped = true;
    if (timer) clearTimeout(timer);
    window.removeEventListener('memescraper:work-started', onWorkStarted);
});
</script>

<style scoped>
.ms-band { height: 3px; width: 100%; background: var(--ot-line-strong); }
.ms-band.good { background: linear-gradient(90deg, #4ec98a, #6ddc4f); }
.ms-band.warn { background: var(--ot-warning); }
.ms-band.bad { background: var(--ot-negative); box-shadow: 0 0 12px rgba(255, 107, 107, 0.45); }
.ms-band.idle { background: var(--ot-info); }
.ot-nav a { display: inline-flex; align-items: center; gap: 4px; }
.ms-navfact { font-size: 12px; color: var(--ot-text-2); padding: 0 var(--ot-space-2); white-space: nowrap; font-family: var(--ot-mono); }
.pulse { animation: ms-pulse 1.4s ease-in-out infinite; }
@keyframes ms-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
</style>

<style>
/* Layout helpers shared by every MemeScraper page (pages' own styles are scoped). Drawers teleport
   to <body>, outside the shell, so helpers they use are listed for .ot-drawer as well. */
.ms-os, .ot-drawer { --ms-other: #5d6b58; }
:is(.ms-os, .ot-drawer) .ms-delta { font-family: var(--ot-mono); font-size: 11px; }
:is(.ms-os, .ot-drawer) .ms-delta.up { color: var(--ot-positive); }
:is(.ms-os, .ot-drawer) .ms-delta.down { color: var(--ot-negative); }
:is(.ms-os, .ot-drawer) .ms-delta.flat { color: var(--ot-muted); }
:is(.ms-os, .ot-drawer) .ms-linkbtn { background: none; border: 0; padding: 0; color: var(--ot-text); font: inherit; cursor: pointer; text-align: left; }
:is(.ms-os, .ot-drawer) .ms-linkbtn:hover { color: var(--ot-accent); text-decoration: underline; text-underline-offset: 3px; }
.ms-os .ms-kpis6 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (min-width: 820px) { .ms-os .ms-kpis6 { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (min-width: 1360px) { .ms-os .ms-kpis6 { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
.ms-os .ms-section { margin-bottom: var(--ot-gutter); }
.ms-os .ot-top .ms-status { min-width: 0; flex: 0 1 auto; }
.ms-os .ot-top .ms-trunc { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
@media (max-width: 720px) {
    .ms-os .ms-wide-only { display: none; }
    .ms-os .ot-top { padding: 0 var(--ot-space-3); gap: var(--ot-space-2); }
}
.ms-os .ms-pair { display: grid; gap: var(--ot-gutter); grid-template-columns: minmax(0, 1fr); }
@media (min-width: 1180px) { .ms-os .ms-pair { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.ms-os .ms-main { display: grid; gap: var(--ot-gutter); grid-template-columns: minmax(0, 1fr); }
@media (min-width: 1180px) { .ms-os .ms-main { grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr); } }
.ms-os .ms-three { display: grid; gap: var(--ot-gutter); grid-template-columns: minmax(0, 1fr); }
@media (min-width: 900px) { .ms-os .ms-three { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (min-width: 1360px) { .ms-os .ms-three { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>
