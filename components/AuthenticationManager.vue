<template>
    <div aria-hidden="true" style="display: none;"></div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue';
import { useRoute } from '#imports';
import { HasAuth, IsProtectedRoute, SendPresence, StartAuthSessionWatch, StopAuthSessionWatch } from '~/scripts/APIInterface';
import { accessState, noteNavigation } from '~/scripts/accessState';
import { useCurrentProfile } from '~/composables/useCurrentProfile';

/*
 * The site's half of the live session channel (mounted once, in app.vue):
 *  - keeps /KMProfiles/SessionWatch open on protected pages; the server signs the tab out
 *    through it the moment the session is revoked, expires or the profile is disabled
 *  - reports which page this tab is on (Klives sees it live)
 *  - re-reads the profile whenever the server says access changed, so the nav, the page guard
 *    and every permission gate re-render without a reload
 */

const route = useRoute();
const current = useCurrentProfile();
let presenceTimer: number | undefined;
let presenceDelay: number | undefined;
let refreshTimer: number | undefined;

function sync(path: string) {
    if (!IsProtectedRoute(path) || !HasAuth()) {
        StopAuthSessionWatch();
        return;
    }
    StartAuthSessionWatch(path);
    // Report the page once it has had a moment to set its title.
    window.clearTimeout(presenceDelay);
    presenceDelay = window.setTimeout(() => SendPresence(path), 400);
}

function scheduleRefresh() {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => { void current.refresh(); }, 250);
}

watch(() => route.path, (path, previous) => {
    if (!import.meta.client) return;
    if (path !== previous) noteNavigation();
    sync(path);
});

// Pushed by the server (`access-changed`), or implied by a suspension/read-only denial.
watch(() => accessState.liveVersion, () => {
    if (import.meta.client) scheduleRefresh();
});

// The live channel reports the current access version on (re)connect: a change made while this
// tab was offline shows up here.
watch(() => accessState.serverAccessVersion, version => {
    if (!import.meta.client || version == null || !current.profile.value || current.legacy.value) return;
    if (version !== current.accessVersion.value) scheduleRefresh();
});

// Refused something the site believed was allowed (a temporary grant ran out, say): the
// profile here is stale.
watch(() => accessState.denials[0]?.id, () => {
    const key = accessState.denials[0]?.permission?.key;
    if (key && current.permissions.value.has(key)) scheduleRefresh();
});

function onVisibilityChange() {
    SendPresence();
}

onMounted(() => {
    sync(route.path);
    document.addEventListener('visibilitychange', onVisibilityChange);
    presenceTimer = window.setInterval(() => SendPresence(), 30_000);
});

onBeforeUnmount(() => {
    StopAuthSessionWatch();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.clearInterval(presenceTimer);
    window.clearTimeout(presenceDelay);
    window.clearTimeout(refreshTimer);
});
</script>
