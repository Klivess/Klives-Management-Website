<template>
    <div class="ot-os ig-os">
        <a class="ot-skiplink" href="#ig-main">Skip to content</a>
        <div class="ig-band" :class="engineTone" role="presentation"></div>

        <header class="ot-top">
            <NuxtLink class="ot-brand" to="/schemery/omnigram">
                <b>OmniGram</b>
                <small class="ig-wide-only">Instagram autopilot</small>
            </NuxtLink>

            <span class="ot-scope ig-engine" :title="engineDetail">
                <span class="ot-dot" :class="engineTone" aria-hidden="true"></span>
                <span class="ig-trunc">{{ engineLabel }}</span>
            </span>
            <span v-if="overview?.Kpis.NextPostUtc" class="ot-scope ig-wide-only">
                <span class="sep" aria-hidden="true">·</span>
                next post {{ fmtRelative(overview.Kpis.NextPostUtc, now) }}
                <template v-if="overview.Kpis.NextPostAccount"> on @{{ overview.Kpis.NextPostAccount }}</template>
            </span>

            <div class="ot-top-spacer"></div>

            <span class="ot-fresh" :class="{ stale: !!error }" aria-live="polite" :title="freshLabel">
                <span class="ot-dot" :class="error ? 'warn' : loadedAt ? 'ok' : ''" aria-hidden="true"></span>
                <span class="ig-wide-only">{{ freshLabel }}</span>
            </span>
            <button class="ot-btn ghost sm" :disabled="loading" @click="refreshAll">Refresh</button>
        </header>

        <nav class="ot-nav" aria-label="OmniGram sections">
            <div class="ot-nav-group">
                <NuxtLink to="/schemery/omnigram" :class="{ active: route.path === '/schemery/omnigram' }">Overview</NuxtLink>
                <NuxtLink v-if="can('omnigram.content.publish')" to="/schemery/omnigram/compose" :class="{ active: route.path.startsWith('/schemery/omnigram/compose') }">Compose</NuxtLink>
                <NuxtLink v-if="can('omnigram.settings.view')" to="/schemery/omnigram/settings" :class="{ active: route.path.startsWith('/schemery/omnigram/settings') }">
                    Settings
                    <span v-if="settingsBadge" class="ot-badge warn" :title="`${settingsBadge} item(s) need attention`">{{ settingsBadge }}</span>
                </NuxtLink>
            </div>
            <div v-if="overview?.Accounts.length" class="ot-nav-group">
                <span class="label" aria-hidden="true">Accounts</span>
                <NuxtLink v-for="account in overview.Accounts" :key="account.AccountId" :to="`/schemery/omnigram/account/${account.AccountId}`"
                          :class="{ active: route.params.accountId === account.AccountId }" :title="account.StateReason">
                    <span class="ot-dot ig-navdot" :class="dotFor(account.State)" aria-hidden="true"></span>
                    @{{ account.Username }}
                    <span v-if="account.AwaitingApproval" class="ot-badge warn" :title="`${account.AwaitingApproval} awaiting approval`">{{ account.AwaitingApproval }}</span>
                </NuxtLink>
            </div>
        </nav>

        <main class="ot-page" id="ig-main">
            <div v-if="error && !overview" class="ot-banner" role="alert">
                <span class="glyph" aria-hidden="true">⚠</span>
                <div>
                    <strong>OmniGram is not answering</strong>
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
import { fmtRelative, useGramOverview, useNow, usePoll, type AccountSummary } from '~/composables/useOmniGram';
import { useAccess } from '~/composables/useAccess';

const emit = defineEmits<{ refresh: [] }>();
const route = useRoute();
const { can } = useAccess();
const now = useNow();
const { overview, error, loading, loadedAt, refresh } = useGramOverview();

usePoll(refresh, 30_000);

function refreshAll() {
    void refresh();
    emit('refresh');
}

const freshLabel = computed(() => error.value ? 'Connection problem'
    : loadedAt.value ? `Updated ${fmtRelative(new Date(loadedAt.value).toISOString(), now.value)}` : 'Loading…');

const engineLabel = computed(() => {
    const o = overview.value;
    if (!o) return 'Connecting…';
    if (!o.Engine.Enabled) return 'Disabled';
    if (!o.Engine.PublishingEnabled) return 'Publishing switched off';
    if (!o.Engine.Running) return o.Engine.StartupState;
    if (!o.Kpis.ConnectedAccounts) return 'No account connected';
    const autopilot = o.Kpis.AutopilotAccounts;
    return autopilot > 0 ? `Autopilot running · ${autopilot} account${autopilot === 1 ? '' : 's'}` : 'Running · no account on autopilot';
});

const engineTone = computed(() => {
    const o = overview.value;
    if (!o) return '';
    if (!o.Engine.Enabled || o.Attention.some(a => a.Level === 'error')) return 'bad';
    if (!o.Engine.PublishingEnabled || o.Attention.some(a => a.Level === 'warning')) return 'warn';
    return 'ok';
});

const engineDetail = computed(() => (overview.value?.Engine.Loops ?? [])
    .map(l => `${l.Name}: ${l.State}${l.LastError ? ` (last error: ${l.LastError})` : ''}`).join('\n'));

const settingsBadge = computed(() => (overview.value?.Attention ?? [])
    .filter(a => a.Action === 'settings' || a.Action === 'reconnect' || a.Action === 'public-url' || a.Action === 'v1-passwords').length);

function dotFor(state: AccountSummary['State']) {
    return state === 'ok' ? 'ok' : state === 'error' ? 'bad' : state === 'attention' || state === 'connect' ? 'warn' : '';
}
</script>

<style scoped>
.ig-band { height: 3px; width: 100%; background: var(--ot-line-strong); }
.ig-band.ok { background: linear-gradient(90deg, #f58529, #dd2a7b 45%, #8134af 75%, #515bd4); }
.ig-band.warn { background: var(--ot-warning); }
.ig-band.bad { background: var(--ot-negative); box-shadow: 0 0 12px rgba(255, 107, 107, 0.45); }
.ig-navdot { width: 6px; height: 6px; margin-right: 2px; }
.ot-nav a { display: inline-flex; align-items: center; gap: 4px; }
</style>

<style>
/* Layout helpers shared by every OmniGram page (pages' own styles are scoped). */
.ig-os .ig-kpis6 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (min-width: 820px) { .ig-os .ig-kpis6 { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (min-width: 1360px) { .ig-os .ig-kpis6 { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
/* Phones: the status bar keeps one row (the sticky nav sits right under it) by dropping extras. */
.ig-os .ot-top .ig-engine { min-width: 0; flex: 0 1 auto; }
.ig-os .ot-top .ig-trunc { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
@media (max-width: 720px) {
    .ig-os .ig-wide-only { display: none; }
    .ig-os .ot-top { padding: 0 var(--ot-space-3); gap: var(--ot-space-2); }
}
/* A banner's buttons drop under its text when they do not fit beside it (phones), instead of overflowing. */
.ig-os .ot-banner { flex-wrap: wrap; }
.ig-os .ot-banner > div:not(.actions) { flex: 1 1 200px; min-width: 0; overflow-wrap: anywhere; }
.ig-os .ot-banner .actions { flex-wrap: wrap; }
.ig-os .ig-pair { display: grid; gap: var(--ot-gutter); grid-template-columns: minmax(0, 1fr); }
@media (min-width: 1180px) { .ig-os .ig-pair { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
