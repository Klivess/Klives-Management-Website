<template>
    <OmniTraderCard ref="card" title="Roblox account" :attention="!!view && !view.Connected" :loading="view === null && !loadError"
                    :subtitle="view?.Connected ? 'Connected: the studio does the Creator Dashboard chores itself' : 'Needed for icons, the maturity rating and creating experiences'">
        <OmniTraderStateBlock v-if="loadError" kind="error" title="Could not load the Roblox account" :detail="loadError" />
        <template v-else-if="view">
            <!-- Connected -->
            <div v-if="view.Connected" class="row">
                <span class="ot-chip ok">Connected</span>
                <span class="who">
                    <template v-if="view.Account">
                        <strong>{{ view.Account.Name }}</strong> <span class="bx-muted mono">#{{ view.Account.UserId }}</span>
                        · {{ view.Account.Method === 'quick-login' ? 'signed in with Quick Log In' : 'pasted cookie' }}
                        · since {{ fmtRelative(view.Account.ConnectedUtc, now) }}
                        <template v-if="view.Account.VerifiedUtc"> · checked {{ fmtRelative(view.Account.VerifiedUtc, now) }}</template>
                    </template>
                    <template v-else>A session is set (OmniBlox_RobloxSessionCookie). Check it to see whose it is.</template>
                </span>
                <span class="actions">
                    <button class="ot-btn sm" :disabled="busy" @click="act('/omniblox/roblox/verify')">Check</button>
                    <button class="ot-btn ghost sm" :disabled="busy" @click="disconnect">Disconnect</button>
                </span>
            </div>

            <!-- A code waiting for the owner -->
            <div v-else-if="view.Pending" class="pending" aria-live="polite">
                <div class="code-row">
                    <span class="code mono" aria-label="Quick Log In code">{{ view.Pending.Code }}</span>
                    <button class="ot-btn ghost sm" type="button" @click="copyCode">{{ copied ? 'Copied' : 'Copy' }}</button>
                    <span class="bx-muted">{{ remaining }}</span>
                </div>
                <ol class="steps">
                    <li>On a computer or phone that is signed in to Roblox <strong>as the account that owns the experiences</strong>, and on the <strong>same network as the server</strong> (Roblox only accepts a code from nearby), open
                        <a :href="view.Pending.ConfirmUrl" target="_blank" rel="noopener">Quick Log In ↗</a> (Account Settings → Quick Log In).</li>
                    <li>Enter the code above.</li>
                    <li>Press <strong>Confirm Login</strong> when Roblox asks.</li>
                </ol>
                <p class="status" :class="{ linked: view.Pending.State === 'UserLinked' }">
                    <span class="pulse" aria-hidden="true"></span>
                    {{ pendingLine }}
                </p>
                <div class="actions">
                    <button class="ot-btn ghost sm" :disabled="busy" @click="act('/omniblox/roblox/quicklogin/cancel')">Cancel</button>
                    <button class="ot-btn ghost sm" :disabled="busy" @click="connect">New code</button>
                </div>
            </div>

            <!-- Not connected -->
            <div v-else class="start">
                <p class="why">
                    Roblox has no API key for an experience's icon, its maturity questionnaire or creating experiences, so the studio needs to act as your account for those.
                    <strong>Without the questionnaire Roblox lets nobody play a public game.</strong>
                    Quick Log In signs the studio in with a code you confirm on Roblox: no password is typed here, and the session is made from the server's own network.
                </p>
                <ul v-if="view.Waiting?.length" class="bx-list small waiting" aria-label="Waiting for the account">
                    <li v-for="w in view.Waiting" :key="w">{{ w }}</li>
                </ul>
                <div class="actions">
                    <button class="ot-btn primary" :disabled="busy" @click="connect">Connect with Quick Log In</button>
                </div>
                <details class="paste">
                    <summary>Or paste a session cookie</summary>
                    <p class="bx-muted">The <code>.ROBLOSECURITY</code> cookie of the account that owns the experiences (browser dev tools → Application → Cookies → roblox.com). It is checked with Roblox before it is kept, never shown again, and kept out of the request logs.</p>
                    <form class="paste-form" @submit.prevent="paste">
                        <input v-model="cookie" class="ot-input mono" type="password" autocomplete="off" spellcheck="false" placeholder=".ROBLOSECURITY value" aria-label="Roblox session cookie" />
                        <button class="ot-btn sm" :disabled="busy || !cookie.trim()">Check and save</button>
                    </form>
                </details>
            </div>

            <p v-if="view.LastError" class="error" role="alert">{{ view.LastError }}</p>

            <!-- Games still on the account the studio switched away from. -->
            <div v-if="view.OldAccountGames?.length" class="old">
                <h3 class="ot-sectionhead">Still on the old account</h3>
                <ul class="bx-list small">
                    <li v-for="g in view.OldAccountGames" :key="g.GameId" class="old-game">
                        <NuxtLink :to="`/schemery/omniblox/game/${g.GameId}`">{{ g.Title }}</NuxtLink>
                        <span class="bx-muted">{{ g.Stage }} · experience {{ g.UniverseId }}</span>
                        <button class="ot-btn sm" :disabled="busy || moving === g.GameId" @click="moveGame(g.GameId, g.Title)">Move to this account</button>
                    </li>
                </ul>
            </div>

            <!-- The Open Cloud API key, and moving the studio to another account. -->
            <div class="key">
                <div class="row">
                    <span class="label">API key</span>
                    <span class="who">
                        <template v-if="view.ApiKey?.Info">
                            "{{ view.ApiKey.Info.Name }}" · user {{ view.ApiKey.Info.OwnerUserId }}
                            <template v-if="view.ApiKey.Info.ExpiresUtc"> · expires {{ fmtRelative(view.ApiKey.Info.ExpiresUtc, now) }}</template>
                            <span v-if="!view.ApiKey.MatchesAccount" class="ot-chip bad">another account's</span>
                        </template>
                        <template v-else>{{ view.ApiKey?.Set ? 'set (in OmniSettings)' : 'not set' }}</template>
                    </span>
                    <span class="actions">
                        <button class="ot-btn ghost sm" :aria-expanded="keyOpen" @click="keyOpen = !keyOpen">{{ view.ApiKey?.Set ? 'Change' : 'Set' }}</button>
                        <button v-if="view.Connected" class="ot-btn ghost sm" :disabled="busy" @click="switchAccount">Switch to another account</button>
                    </span>
                </div>
                <form v-if="keyOpen" class="paste-form" @submit.prevent="saveKey">
                    <input v-model="apiKey" class="ot-input mono" type="password" autocomplete="off" spellcheck="false" placeholder="Open Cloud API key" aria-label="Roblox Open Cloud API key" />
                    <button class="ot-btn sm" :disabled="busy || !apiKey.trim()">Check and save</button>
                </form>
                <p v-if="keyOpen" class="bx-muted hint">Roblox checks the key first (it must be enabled, not expired, usable from the server, and the studio account's own). It is never shown again.</p>
            </div>
        </template>
    </OmniTraderCard>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { confirmAction, fmtRelative, notify, useNow } from '~/composables/useOmniTumblr';
import { bloxGet, bloxPost, type BloxRobloxView } from '~/composables/useOmniBlox';

const emit = defineEmits<{ changed: [] }>();
const now = useNow();

const view = ref<BloxRobloxView | null>(null);
const loadError = ref<string | null>(null);
const busy = ref(false);
const cookie = ref('');
const copied = ref(false);
const apiKey = ref('');
const keyOpen = ref(false);
const moving = ref<string | null>(null);
const card = ref<{ $el?: HTMLElement } | null>(null);

async function load() {
    const result = await bloxGet<BloxRobloxView>('/omniblox/roblox');
    if (result.ok && result.data) { view.value = result.data; loadError.value = null; }
    else loadError.value = result.error;
}

/** Every action answers with the new view; a fresh connection changes the owner tasks, so the page refreshes too. */
async function act(path: string, body: unknown = {}) {
    busy.value = true;
    try {
        const wasConnected = view.value?.Connected ?? false;
        const result = await bloxPost<BloxRobloxView>(path, body);
        if (!result.ok || !result.data) { notify('Roblox account', result.error ?? 'The request failed.', 'error'); return; }
        view.value = result.data;
        if (result.data.Connected !== wasConnected) emit('changed');
    } finally {
        busy.value = false;
    }
}

async function connect() {
    copied.value = false;
    await act('/omniblox/roblox/quicklogin');
}

async function paste() {
    await act('/omniblox/roblox/cookie', { cookie: cookie.value.trim() });
    cookie.value = ''; // never kept in the page, whatever Roblox said
}

async function disconnect() {
    const quick = view.value?.Account?.Method === 'quick-login';
    if (!await confirmAction('Disconnect the Roblox account?', quick
        ? 'The studio signs its own session out. Icons, the maturity questionnaire and new experiences wait until you connect again.'
        : 'Your browser stays signed in. Icons, the maturity questionnaire and new experiences wait until you connect again.', 'Disconnect', true)) return;
    await act('/omniblox/roblox/disconnect');
}

async function saveKey() {
    await act('/omniblox/roblox/apikey', { apiKey: apiKey.value.trim() });
    apiKey.value = ''; // never kept in the page
    if (!view.value?.LastError) keyOpen.value = false;
}

/** Moves the studio to whichever account confirms the next code: new games go there, published ones are listed to move. */
async function switchAccount() {
    if (!await confirmAction('Switch the studio to another Roblox account?',
        'Confirm the code with the other account. It becomes the studio\'s account: new games are published there, the current account\'s experiences are not used again, and games already published are listed here to move. Set that account\'s API key too.',
        'Switch')) return;
    copied.value = false;
    await act('/omniblox/roblox/quicklogin', { switchAccount: true });
}

async function moveGame(gameId: string, title: string) {
    if (!await confirmAction(`Move "${title}" to this account?`, 'The studio creates a new experience on this account and relaunches the game there; the old experience is made private and never used again.', 'Move it')) return;
    moving.value = gameId;
    try {
        const result = await bloxPost<{ ok: boolean; started: string }>('/omniblox/games/action', { gameId, action: 'move', target: 'new' });
        if (!result.ok) notify('Not moved', result.error ?? '', 'warning');
        else { notify('Moving', `${result.data?.started ?? title}: follow it on the game's page.`, 'info'); await load(); }
    } finally {
        moving.value = null;
    }
}

async function copyCode() {
    if (!view.value?.Pending) return;
    try { await navigator.clipboard.writeText(view.value.Pending.Code); copied.value = true; } catch { /* the code is on screen to type */ }
}

/** Starts Quick Log In and brings the card into view (the overview's "Connect" buttons). */
async function start() {
    card.value?.$el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    if (!view.value?.Connected && !view.value?.Pending) await connect();
}
defineExpose({ start });

/** A second-by-second clock for the code's countdown, running only while a code waits (the shared clock ticks every 30 s). */
const clock = ref(Date.now());
const remaining = computed(() => {
    const p = view.value?.Pending;
    if (!p) return '';
    const seconds = Math.max(0, Math.round((new Date(p.ExpiresUtc).getTime() - clock.value) / 1000));
    return seconds > 0 ? `expires in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : 'expired';
});
const pendingLine = computed(() => {
    const p = view.value?.Pending;
    if (!p) return '';
    if (p.State === 'UserLinked') return `${p.AccountName ?? 'Someone'} entered the code: press Confirm Login on that device.`;
    if (p.State === 'Validated') return 'Confirmed: signing the studio in…';
    return 'Waiting for the code to be entered…';
});

// While a code waits, ask Roblox about it every few seconds (Roblox's own client polls every 3–5 s).
let timer: ReturnType<typeof setInterval> | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;
let polling = false;
async function poll() {
    if (polling || busy.value || !view.value?.Pending) return;
    polling = true;
    try {
        const result = await bloxPost<BloxRobloxView>('/omniblox/roblox/quicklogin/poll');
        if (result.ok && result.data) {
            const connectedNow = result.data.Connected && !view.value?.Connected;
            view.value = result.data;
            if (connectedNow) { notify('Roblox account connected', result.data.Account?.Name ?? '', 'success'); emit('changed'); }
        }
    } finally {
        polling = false;
    }
}
function stopTimers() {
    if (timer) { clearInterval(timer); timer = null; }
    if (ticker) { clearInterval(ticker); ticker = null; }
}
watch(() => !!view.value?.Pending, waiting => {
    if (waiting && !timer) {
        clock.value = Date.now();
        timer = setInterval(poll, 3000);
        ticker = setInterval(() => { clock.value = Date.now(); }, 1000);
    } else if (!waiting) stopTimers();
});
onMounted(load);
onBeforeUnmount(stopTimers);
</script>

<style scoped>
.row { display: flex; align-items: center; gap: var(--ot-space-2); flex-wrap: wrap; font-size: 12.5px; }
.who { flex: 1 1 260px; min-width: 0; }
.mono { font-family: var(--ot-mono); }
.actions { display: flex; gap: var(--ot-space-2); flex-wrap: wrap; }
.why { margin: 0 0 var(--ot-space-3); font-size: 12.5px; line-height: 18px; color: var(--ot-text-2); }
.waiting { margin: 0 0 var(--ot-space-3); }
.paste { margin-top: var(--ot-space-3); font-size: 12px; }
.paste summary { cursor: pointer; color: var(--ot-text-2); }
.paste p { margin: var(--ot-space-2) 0; line-height: 17px; }
.paste-form { display: flex; gap: var(--ot-space-2); flex-wrap: wrap; }
.paste-form .ot-input { flex: 1 1 240px; min-width: 0; }
.pending { display: flex; flex-direction: column; gap: var(--ot-space-3); }
.code-row { display: flex; align-items: center; gap: var(--ot-space-3); flex-wrap: wrap; }
.code { font-size: 30px; font-weight: 800; letter-spacing: 6px; padding: 6px 14px; border-radius: var(--ot-radius-sm); background: var(--ot-surface-2); border: 1px solid var(--ot-line-strong); }
.steps { margin: 0; padding-left: 20px; font-size: 12.5px; line-height: 19px; display: flex; flex-direction: column; gap: 4px; }
.status { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--ot-text-2); }
.status.linked { color: var(--ot-accent); }
.pulse { flex: 0 0 8px; height: 8px; border-radius: 50%; background: var(--ot-accent); animation: bx-pulse 1.4s ease-in-out infinite; }
@keyframes bx-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.75); } }
@media (prefers-reduced-motion: reduce) { .pulse { animation: none; } }
.error { margin: var(--ot-space-3) 0 0; font-size: 12px; line-height: 17px; color: #ffc9c9; overflow-wrap: anywhere; }
.old { margin-top: var(--ot-space-4); }
.old-game { display: flex; align-items: center; gap: var(--ot-space-2); flex-wrap: wrap; }
.old-game a { color: inherit; font-weight: 600; }
.key { margin-top: var(--ot-space-4); padding-top: var(--ot-space-3); border-top: 1px solid var(--ot-line); display: flex; flex-direction: column; gap: var(--ot-space-2); }
.key .row { font-size: 12.5px; }
.key .label { color: var(--ot-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; min-width: 60px; }
.hint { margin: 0; font-size: 11.5px; }
</style>
