<!-- Sign in. Prerendered: everything that depends on the visitor happens once mounted. -->
<template>
    <div class="km-ax login">
        <div class="login-glow" aria-hidden="true"></div>
        <main class="login-card">
            <header class="login-head">
                <img src="/klivebot.png" alt="" class="login-logo" width="52" height="52" />
                <p class="login-brand">KLIVES MANAGEMENT</p>
                <h1>Sign in</h1>
            </header>

            <div v-if="notice" class="login-notice" :class="noticeTone" role="status">
                <AccessIcon :name="noticeTone === 'bad' ? 'power' : 'signout'" :size="16" />
                <div>
                    <strong>{{ notice.title }}</strong>
                    <span>{{ notice.detail }}</span>
                </div>
            </div>

            <form class="login-form" novalidate @submit.prevent="submit">
                <label class="login-label" for="login-password">Password</label>
                <div class="login-field" :class="{ invalid: !!error, shake }">
                    <AccessIcon name="key" :size="16" class="login-field-icon" />
                    <input id="login-password" ref="input" v-model="password" :type="reveal ? 'text' : 'password'"
                           name="password" autocomplete="current-password" spellcheck="false" autocapitalize="off"
                           :disabled="busy || waitSeconds > 0" :readonly="!interactive" placeholder="Your password" data-testid="login-password" />
                    <button type="button" class="login-reveal" :aria-pressed="reveal" :aria-label="reveal ? 'Hide password' : 'Show password'" @click="reveal = !reveal">
                        <AccessIcon name="eye" :size="16" />
                    </button>
                </div>
                <p v-if="error" class="login-error" role="alert">{{ error }}</p>

                <button type="submit" class="ot-btn primary block login-submit" :disabled="busy || !password || waitSeconds > 0" data-testid="login-submit">
                    <span v-if="busy" class="login-spinner" aria-hidden="true"></span>
                    {{ submitLabel }}
                </button>
            </form>

            <footer class="login-foot">
                <span class="login-status" :class="serverStatus" :title="serverTitle">
                    <span class="km-dot" :class="serverStatus === 'online' ? 'online' : serverStatus === 'offline' ? 'offline' : 'idle'"></span>
                    {{ serverLabel }}
                </span>
                <span class="login-sep" aria-hidden="true">·</span>
                <span>Stays signed in for 30 days on this device</span>
            </footer>
        </main>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import {
    BuildKliveHeaders, ConsumeSignOutNotice, ExchangeLegacyCredential, GetAuthToken, IsSessionToken,
    KliveAPIUrl, LoginWithPassword, SignOut,
} from '~/scripts/APIInterface';
import { useCurrentProfile } from '~/composables/useCurrentProfile';
import { signOutText } from '~/scripts/profileFormat';

definePageMeta({ layout: false });

const route = useRoute();
const current = useCurrentProfile();

const password = ref('');
// The page is prerendered: until it hydrates, typing would be thrown away when Vue takes the
// field over. It stays read-only for that moment.
const interactive = ref(false);
const reveal = ref(false);
const busy = ref(false);
const error = ref('');
const shake = ref(false);
const waitSeconds = ref(0);
const input = ref<HTMLInputElement | null>(null);
const notice = ref<{ title: string; detail: string } | null>(null);
const noticeState = ref('');
const serverStatus = ref<'checking' | 'online' | 'offline'>('checking');

let statusTimer: number | undefined;
let waitTimer: number | undefined;
let startingRetries = 0;

const noticeTone = computed(() => (['ProfileDisabled', 'ProfileNotFound'].includes(noticeState.value) ? 'bad' : 'warn'));
const serverLabel = computed(() => ({ checking: 'Checking server…', online: 'Server online', offline: 'Server offline' }[serverStatus.value]));
const serverTitle = computed(() => (serverStatus.value === 'offline' ? "Klives Management isn't answering right now." : ''));
const submitLabel = computed(() => {
    if (waitSeconds.value > 0) return `Try again in ${waitSeconds.value}s`;
    return busy.value ? 'Signing in…' : 'Sign in';
});

/** Where to go after signing in: the page that sent you here, never somewhere off-site. */
function destination(): string {
    const next = typeof route.query.next === 'string' ? route.query.next : '';
    return next.startsWith('/') && !next.startsWith('//') && next !== '/' ? next : '/dashboard';
}

async function go() {
    await navigateTo(destination(), { replace: true });
}

async function checkServerStatus() {
    try {
        const res = await fetch(`${KliveAPIUrl}/ping`, { method: 'GET', mode: 'cors', cache: 'no-store' });
        serverStatus.value = res.ok ? 'online' : 'offline';
    } catch {
        serverStatus.value = 'offline';
    }
}

function startWait(seconds: number) {
    waitSeconds.value = Math.max(1, Math.ceil(seconds));
    window.clearInterval(waitTimer);
    waitTimer = window.setInterval(() => {
        waitSeconds.value -= 1;
        if (waitSeconds.value <= 0) {
            window.clearInterval(waitTimer);
            nextTick(() => input.value?.focus());
        }
    }, 1000);
}

function fail(message: string) {
    error.value = message;
    shake.value = false;
    requestAnimationFrame(() => { shake.value = true; });
    nextTick(() => input.value?.select());
}

async function submit() {
    if (!password.value || busy.value || waitSeconds.value > 0) return;
    busy.value = true;
    error.value = '';
    let retrying = false;
    try {
        const result = await LoginWithPassword(password.value, { allowLegacy: true });
        switch (result.kind) {
            case 'ok':
                current.applyMe(result.me);
                password.value = '';
                await go();
                return;
            case 'legacy-ok':
                password.value = '';
                await go();
                return;
            case 'rejected':
                fail(result.message || "That password doesn't match any profile.");
                return;
            case 'disabled':
                fail('This profile can\'t sign in right now. Ask Klives if that is unexpected.');
                return;
            case 'throttled':
                fail(result.message || 'Too many attempts.');
                startWait(result.retryAfterSeconds ?? 30);
                return;
            case 'starting':
                // Just restarted: profiles are still loading. Try again shortly, quietly.
                if (startingRetries++ < 6) {
                    retrying = true;
                    error.value = 'Klives Management is starting up — trying again…';
                    window.setTimeout(() => { busy.value = false; void submit(); }, 2_000);
                    return;
                }
                fail('Klives Management is still starting up. Try again in a moment.');
                return;
            default:
                fail(result.message || "Couldn't reach Klives Management.");
        }
    } finally {
        if (!retrying) busy.value = false;
    }
}

/** Already signed in on this device? Then there is nothing to do here. */
async function resumeExistingSignIn() {
    const credential = GetAuthToken();
    if (!credential) return;

    if (!IsSessionToken(credential)) {
        // A password kept by the previous site: trade it for a session.
        const exchanged = await ExchangeLegacyCredential();
        if (exchanged === 'exchanged' || exchanged === 'kept') await go();
        return;
    }

    try {
        const res = await fetch(`${KliveAPIUrl}/KMProfiles/me`, { method: 'GET', mode: 'cors', headers: BuildKliveHeaders() });
        if (res.ok) {
            current.applyMe(await res.json().catch(() => null));
            await go();
        } else if (res.status === 401) {
            SignOut(null, { redirect: false }); // stale token: forget it quietly and stay here
        }
    } catch {
        // Offline: stay on the form; the status line says so.
    }
}

onMounted(async () => {
    interactive.value = true;
    const stored = ConsumeSignOutNotice();
    const state = stored?.state ?? (typeof route.query.signedOut === 'string' ? route.query.signedOut : '');
    noticeState.value = state;
    notice.value = signOutText(state, stored?.message ?? null);

    void checkServerStatus();
    statusTimer = window.setInterval(checkServerStatus, 10_000);

    await resumeExistingSignIn();
    input.value?.focus();
});

onBeforeUnmount(() => {
    window.clearInterval(statusTimer);
    window.clearInterval(waitTimer);
});
</script>

<style scoped>
.login {
    position: relative;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    overflow: hidden;
    background:
        linear-gradient(rgba(146, 196, 130, 0.035) 1px, transparent 1px) 0 0 / 32px 32px,
        linear-gradient(90deg, rgba(146, 196, 130, 0.035) 1px, transparent 1px) 0 0 / 32px 32px,
        var(--ot-bg);
}
.login-glow {
    position: absolute;
    inset: -20% -10% auto;
    height: 70%;
    background: radial-gradient(50% 60% at 50% 40%, rgba(109, 220, 79, 0.13), transparent 70%);
    pointer-events: none;
}
.login-card {
    position: relative;
    width: min(400px, 100%);
    padding: 32px 28px 22px;
    border-radius: 18px;
    border: 1px solid var(--ot-line);
    background: rgba(18, 21, 15, 0.92);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.03);
    backdrop-filter: blur(8px);
}
.login-head { display: flex; flex-direction: column; align-items: center; text-align: center; }
.login-logo { width: 52px; height: 52px; border-radius: 12px; margin-bottom: 14px; box-shadow: 0 0 0 1px var(--ot-line-strong), 0 10px 30px rgba(109, 220, 79, 0.15); }
.login-brand { font-size: 11px; letter-spacing: 2.4px; font-weight: 700; color: var(--ot-accent); }
.login-head h1 { margin-top: 6px; font-size: 24px; line-height: 32px; font-weight: 650; letter-spacing: -0.3px; color: var(--ot-text); }

.login-notice {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    margin-top: 20px;
    padding: 10px 12px;
    border-radius: var(--ot-radius);
    border: 1px solid rgba(240, 180, 41, 0.4);
    background: var(--ot-warning-soft);
    color: var(--ot-warning);
    font-size: 12.5px;
}
.login-notice.bad { border-color: rgba(255, 123, 123, 0.45); background: var(--ot-negative-soft); color: var(--ot-negative); }
.login-notice div { display: flex; flex-direction: column; gap: 1px; }
.login-notice strong { color: var(--ot-text); font-weight: 600; font-size: 13px; }
.login-notice span { color: var(--ot-text-2); }

.login-form { margin-top: 22px; display: flex; flex-direction: column; }
.login-label { font-size: 12px; font-weight: 600; color: var(--ot-text-2); margin-bottom: 6px; }
.login-field {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 44px;
    padding: 0 6px 0 12px;
    border-radius: 10px;
    border: 1px solid var(--ot-line-strong);
    background: rgba(5, 7, 4, 0.55);
    transition: border-color var(--ot-fast), box-shadow var(--ot-fast);
}
.login-field:focus-within { border-color: var(--ot-accent); box-shadow: 0 0 0 3px rgba(109, 220, 79, 0.14); }
.login-field.invalid { border-color: var(--ot-negative); }
.login-field.shake { animation: login-shake 320ms ease; }
.login-field-icon { color: var(--ot-muted); }
.login-field input {
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--ot-text);
    font-size: 15px;
    font-family: inherit;
    letter-spacing: 0.3px;
}
.login-field input::placeholder { color: var(--ot-disabled); }
.login-reveal {
    width: 32px;
    height: 32px;
    justify-content: center;
    border-radius: 8px;
    color: var(--ot-muted);
}
.login-reveal:hover, .login-reveal[aria-pressed='true'] { color: var(--ot-text); background: rgba(255, 255, 255, 0.05); }
.login-error { margin-top: 8px; color: var(--ot-negative); font-size: 12.5px; }
.login-submit { margin-top: 16px; height: 44px; font-size: 14px; border-radius: 10px; }
.login-spinner {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid rgba(8, 20, 11, 0.35);
    border-top-color: var(--ot-on-accent);
    animation: login-spin 700ms linear infinite;
}

.login-foot {
    margin-top: 22px;
    padding-top: 14px;
    border-top: 1px solid var(--ot-line);
    display: flex;
    justify-content: center;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 11.5px;
    color: var(--ot-muted);
}
.login-status { display: inline-flex; align-items: center; gap: 6px; }
.login-status.offline { color: var(--ot-negative); }
.login-sep { color: var(--ot-disabled); }

@keyframes login-shake {
    20%, 60% { transform: translateX(-5px); }
    40%, 80% { transform: translateX(5px); }
}
@keyframes login-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
    .login-field.shake, .login-spinner { animation: none; }
}
</style>
