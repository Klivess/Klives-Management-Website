<template>
    <Transition name="ax-fade">
        <div v-if="show" class="km-ax ax-suspended" role="alertdialog" aria-modal="true" aria-labelledby="ax-suspended-title" aria-describedby="ax-suspended-note">
            <div class="ax-suspended-card">
                <div class="ax-suspended-badge"><AccessIcon name="pause" :size="30" /></div>
                <h2 id="ax-suspended-title">Your access is suspended</h2>
                <p v-if="reason" class="ax-reason">“{{ reason }}”</p>

                <div v-if="untilMs" class="ax-countdown" aria-live="off">
                    <span class="ax-countdown-label">Lifts in</span>
                    <span class="ax-countdown-value">{{ countdown }}</span>
                    <span class="ax-countdown-when">{{ untilText }}</span>
                </div>

                <p id="ax-suspended-note" class="ax-note">
                    Until then Klives Management is locked for your profile. This page unlocks by itself the
                    moment the suspension ends — you don't need to sign in again.
                </p>
                <div class="ax-actions">
                    <button type="button" class="ot-btn ghost" @click="signOut"><AccessIcon name="signout" :size="15" /> Sign out</button>
                </div>
            </div>
        </div>
    </Transition>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { IsProtectedRoute, SignOut } from '~/scripts/APIInterface';
import { useCurrentProfile } from '~/composables/useCurrentProfile';
import { durationShort, fmtDateTime, toMs } from '~/scripts/profileFormat';

/*
 * A suspended profile can still sign in, but every permission is refused until the suspension
 * ends. Rather than a page full of errors this covers the site, says why and for how long,
 * and lifts itself: the server pushes the change, and the countdown re-checks at zero.
 */

const route = useRoute();
const current = useCurrentProfile();
const mounted = ref(false);
const now = ref(Date.now());
let tick: number | undefined;
let recheck: number | undefined;

const show = computed(() => mounted.value && current.suspended.value && IsProtectedRoute(route.path));
const reason = computed(() => current.profile.value?.suspensionReason ?? null);
const untilMs = computed(() => toMs(current.profile.value?.suspendedUntilUtc ?? null));
const remaining = computed(() => (untilMs.value === null ? null : Math.max(0, untilMs.value - now.value)));
const countdown = computed(() => {
    const ms = remaining.value;
    if (ms === null) return '';
    if (ms <= 0) return 'any moment';
    const s = Math.ceil(ms / 1000);
    if (s < 3600) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    return durationShort(ms);
});
const untilText = computed(() => (untilMs.value ? `until ${fmtDateTime(untilMs.value)}` : ''));

watch(show, visible => {
    document.documentElement.style.overflow = visible ? 'hidden' : '';
    window.clearInterval(tick);
    window.clearInterval(recheck);
    if (!visible) return;
    tick = window.setInterval(() => { now.value = Date.now(); }, 1000);
    // The push normally lifts it; this is the backstop once the time is up.
    recheck = window.setInterval(() => {
        if (remaining.value !== null && remaining.value <= 0) void current.refresh();
    }, 5_000);
});

function signOut() {
    SignOut(null, { serverLogout: true });
}

onMounted(() => { mounted.value = true; });
onBeforeUnmount(() => {
    window.clearInterval(tick);
    window.clearInterval(recheck);
    document.documentElement.style.overflow = '';
});
</script>

<style scoped>
.ax-suspended {
    position: fixed;
    inset: 0;
    z-index: 4000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgba(5, 7, 4, 0.82);
    backdrop-filter: blur(10px) saturate(0.6);
}
.ax-suspended-card {
    width: min(480px, 100%);
    padding: 32px 28px 24px;
    border-radius: var(--ot-radius-lg);
    border: 1px solid rgba(255, 123, 123, 0.35);
    background:
        radial-gradient(120% 70% at 50% -10%, rgba(255, 123, 123, 0.12), transparent 60%),
        var(--ot-surface);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
    text-align: center;
}
.ax-suspended-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    color: var(--ot-negative);
    background: var(--ot-negative-soft);
    border: 1px solid rgba(255, 123, 123, 0.4);
    margin-bottom: 14px;
}
h2 { font-size: 21px; line-height: 28px; font-weight: 650; color: var(--ot-text); }
.ax-reason {
    margin-top: 10px;
    padding: 10px 14px;
    border-radius: var(--ot-radius);
    background: rgba(255, 255, 255, 0.03);
    border-left: 3px solid var(--ot-negative);
    color: var(--ot-text-2);
    font-style: italic;
    text-align: left;
    overflow-wrap: anywhere;
}
.ax-countdown {
    margin-top: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
}
.ax-countdown-label { font-size: 11px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--ot-muted); font-weight: 700; }
.ax-countdown-value { font-family: var(--ot-mono); font-size: 32px; line-height: 40px; font-weight: 650; color: var(--ot-text); letter-spacing: -0.5px; }
.ax-countdown-when { font-size: 12px; color: var(--ot-muted); }
.ax-note { margin-top: 14px; color: var(--ot-text-2); font-size: 13px; }
.ax-actions { margin-top: 18px; display: flex; justify-content: center; }

.ax-fade-enter-active, .ax-fade-leave-active { transition: opacity 220ms ease; }
.ax-fade-enter-from, .ax-fade-leave-to { opacity: 0; }
</style>
