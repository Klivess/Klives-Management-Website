<template>
    <div class="ot-os tb-os">
        <a class="ot-skiplink" href="#tb-main">Skip to content</a>
        <div class="tb-band" :class="engineTone" role="presentation"></div>

        <header class="ot-top">
            <NuxtLink class="ot-brand" to="/schemery/omnitumblr">
                <b>OmniTumblr</b>
                <small class="tb-wide-only">Blog autopilot</small>
            </NuxtLink>

            <span class="ot-scope tb-engine" :title="engineDetail">
                <span class="ot-dot" :class="engineDot" aria-hidden="true"></span>
                <span class="tb-trunc">{{ engineLabel }}</span>
            </span>
            <span v-if="overview?.Kpis.NextPostUtc" class="ot-scope tb-wide-only">
                <span class="sep" aria-hidden="true">·</span>
                next post {{ fmtRelative(overview.Kpis.NextPostUtc, now) }}
                <template v-if="overview.Kpis.NextPostBlog"> on @{{ overview.Kpis.NextPostBlog }}</template>
            </span>

            <div class="ot-top-spacer"></div>

            <span class="ot-fresh" :class="{ stale: !!error }" aria-live="polite" :title="freshLabel">
                <span class="ot-dot" :class="error ? 'warn' : loadedAt ? 'ok' : ''" aria-hidden="true"></span>
                <span class="tb-wide-only">{{ freshLabel }}</span>
            </span>
            <button class="ot-btn ghost sm" :disabled="loading" @click="refreshAll">Refresh</button>
        </header>

        <nav class="ot-nav" aria-label="OmniTumblr sections">
            <div class="ot-nav-group">
                <NuxtLink to="/schemery/omnitumblr" :class="{ active: route.path === '/schemery/omnitumblr' }">Overview</NuxtLink>
                <NuxtLink to="/schemery/omnitumblr/compose" :class="{ active: route.path.startsWith('/schemery/omnitumblr/compose') }">Compose</NuxtLink>
                <NuxtLink to="/schemery/omnitumblr/settings" :class="{ active: route.path.startsWith('/schemery/omnitumblr/settings') }">
                    Settings
                    <span v-if="settingsBadge" class="ot-badge warn" :title="`${settingsBadge} item(s) need attention`">{{ settingsBadge }}</span>
                </NuxtLink>
            </div>
            <div v-if="overview?.Blogs.length" class="ot-nav-group">
                <span class="label" aria-hidden="true">Blogs</span>
                <NuxtLink v-for="blog in overview.Blogs" :key="blog.BlogId" :to="`/schemery/omnitumblr/blog/${blog.BlogId}`"
                          :class="{ active: route.params.blogId === blog.BlogId }" :title="blog.StateReason">
                    <span class="ot-dot tb-navdot" :class="dotFor(blog.State)" aria-hidden="true"></span>
                    @{{ blog.Name }}
                    <span v-if="blog.AwaitingApproval" class="ot-badge warn" :title="`${blog.AwaitingApproval} awaiting approval`">{{ blog.AwaitingApproval }}</span>
                </NuxtLink>
            </div>
        </nav>

        <main class="ot-page" id="tb-main">
            <div v-if="error && !overview" class="ot-banner" role="alert">
                <span class="glyph" aria-hidden="true">⚠</span>
                <div>
                    <strong>OmniTumblr is not answering</strong>
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
import { fmtRelative, useNow, usePoll, useTumblrOverview, type BlogSummary } from '~/composables/useOmniTumblr';

const emit = defineEmits<{ refresh: [] }>();
const route = useRoute();
const now = useNow();
const { overview, error, loading, loadedAt, refresh } = useTumblrOverview();

usePoll(refresh, 30_000);

function refreshAll() {
    void refresh();
    emit('refresh');
}

const engine = computed(() => overview.value?.Engine);
const freshLabel = computed(() => error.value ? 'Connection problem'
    : loadedAt.value ? `Updated ${fmtRelative(new Date(loadedAt.value).toISOString(), now.value)}` : 'Loading…');

const engineLabel = computed(() => {
    const o = overview.value;
    if (!o) return 'Connecting…';
    if (!o.Engine.Enabled) return 'Disabled';
    if (!o.App.Configured) return 'Tumblr app not set up';
    if (!o.Engine.PublishingEnabled) return 'Publishing switched off';
    if (!o.Engine.Running) return o.Engine.StartupState;
    const autopilot = o.Kpis.AutopilotBlogs;
    return autopilot > 0 ? `Autopilot running · ${autopilot} blog${autopilot === 1 ? '' : 's'}` : 'Running · no blog on autopilot';
});

const engineTone = computed(() => {
    const o = overview.value;
    if (!o) return '';
    if (!o.Engine.Enabled || o.Attention.some(a => a.Level === 'error')) return 'bad';
    if (!o.Engine.PublishingEnabled || !o.App.Configured || o.Attention.some(a => a.Level === 'warning')) return 'warn';
    return 'ok';
});

const engineDot = computed(() => engineTone.value);

const engineDetail = computed(() => {
    const loops = engine.value?.Loops ?? [];
    return loops.map(l => `${l.Name}: ${l.State}${l.LastError ? ` (last error: ${l.LastError})` : ''}`).join('\n');
});

const settingsBadge = computed(() => {
    const o = overview.value;
    if (!o) return 0;
    return o.Attention.filter(a => a.Action === 'settings' || a.Action === 'reconnect').length;
});

function dotFor(state: BlogSummary['State']) {
    return state === 'ok' ? 'ok' : state === 'error' ? 'bad' : state === 'attention' ? 'warn' : '';
}
</script>

<style scoped>
.tb-band { height: 3px; width: 100%; background: var(--ot-line-strong); }
.tb-band.ok { background: linear-gradient(90deg, #4ec98a, #63c8ea); }
.tb-band.warn { background: var(--ot-warning); }
.tb-band.bad { background: var(--ot-negative); box-shadow: 0 0 12px rgba(255, 107, 107, 0.45); }
.tb-navdot { width: 6px; height: 6px; margin-right: 2px; }
.ot-nav a { display: inline-flex; align-items: center; gap: 4px; }
</style>

<style>
/* Layout helpers shared by every OmniTumblr page (pages' own styles are scoped). */
.tb-os .tb-kpis6 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (min-width: 820px) { .tb-os .tb-kpis6 { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (min-width: 1360px) { .tb-os .tb-kpis6 { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
/* Phones: the status bar keeps one row (the sticky nav sits right under it) by dropping extras. */
.tb-os .ot-top .tb-engine { min-width: 0; flex: 0 1 auto; }
.tb-os .ot-top .tb-trunc { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
@media (max-width: 720px) {
    .tb-os .tb-wide-only { display: none; }
    .tb-os .ot-top { padding: 0 var(--ot-space-3); gap: var(--ot-space-2); }
}
.tb-os .tb-pair { display: grid; gap: var(--ot-gutter); grid-template-columns: minmax(0, 1fr); }
@media (min-width: 1180px) { .tb-os .tb-pair { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
