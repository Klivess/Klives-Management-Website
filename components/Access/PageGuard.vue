<template>
    <slot v-if="state === 'allowed'" />
    <AccessDenied v-else-if="state === 'denied'" :access="access" />
    <div v-else class="km-ax ax-guard-wait" aria-busy="true" aria-live="polite">
        <span class="ax-guard-spinner" aria-hidden="true"></span>
        <span class="ax-guard-label">Checking access…</span>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { HasAuth } from '~/scripts/APIInterface';
import { useCurrentProfile } from '~/composables/useCurrentProfile';
import { resolvePageAccess, satisfiesRule, type AccessRule } from '~/scripts/pageAccess';

/*
 * Wraps <NuxtPage/> (app.vue). A page the profile can't open is replaced by <AccessDenied>
 * inside the normal layout — nav kept, no redirect — and its component never mounts, so it
 * never fires requests that would be refused. Decided reactively: when access changes live,
 * the page appears or disappears in place.
 *
 * Protected pages wait for the profile (a few hundred ms, usually already loaded by the route
 * middleware). If it can't be loaded, the page is shown and the server decides.
 */

const route = useRoute();
const current = useCurrentProfile();
const mounted = ref(false);

// Nuxt's dev-only check warns when a server render contains no <NuxtPage/>. Here that is on
// purpose — access is only known in the browser — so tell it the page is accounted for.
if (import.meta.server) (useNuxtApp() as unknown as { _isNuxtPageUsed?: boolean })._isNuxtPageUsed = true;
const gaveUp = ref(false);
let giveUpTimer: number | undefined;

const access = computed(() => resolvePageAccess(route.path, (route.meta.access as AccessRule | undefined) ?? null));

const state = computed<'allowed' | 'denied' | 'waiting'>(() => {
    if (access.value.rule.kind === 'public') return 'allowed';
    // Server render and hydration both show the placeholder; the decision is made in the browser.
    if (!mounted.value) return 'waiting';
    const profile = current.profile.value;
    if (!profile) {
        if (!HasAuth()) return 'waiting'; // the route middleware is on its way to the login page
        return current.ready.value || gaveUp.value ? 'allowed' : 'waiting';
    }
    return satisfiesRule(access.value.rule, current.can, true) ? 'allowed' : 'denied';
});

onMounted(() => {
    mounted.value = true;
    // Public pages (sign-in, shared links) don't need the profile; asking for it there would
    // only produce a 401 for a visitor who isn't signed in.
    if (access.value.rule.kind !== 'public' && HasAuth()) void current.ensureLoaded();
    giveUpTimer = window.setTimeout(() => { gaveUp.value = true; }, 6_000);
});

onBeforeUnmount(() => window.clearTimeout(giveUpTimer));
</script>

<style scoped>
.ax-guard-wait {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 60vh;
    color: var(--ot-muted);
    font-size: 12.5px;
    /* Usually resolved before anyone could read it: only appear if it takes a moment. */
    opacity: 0;
    animation: ax-guard-in 200ms ease 450ms forwards;
}
.ax-guard-spinner {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid var(--ot-line-strong);
    border-top-color: var(--ot-accent);
    animation: ax-spin 800ms linear infinite;
}
@keyframes ax-guard-in { to { opacity: 1; } }
@keyframes ax-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
    .ax-guard-spinner { animation: none; }
}
</style>
