<template>
    <div v-if="open" class="ot-modal-backdrop" @click.self="close">
        <div class="ot-modal ig-wizard" role="dialog" aria-modal="true" :aria-label="heading">
            <header>
                <h3>{{ heading }}</h3>
                <button class="ot-btn ghost sm" @click="close">Close ✕</button>
            </header>

            <div class="body">
                <!-- 1. How to connect -->
                <section v-if="step === 'method'" class="pane">
                    <div class="callout">
                        <strong>Only professional accounts can be posted to.</strong>
                        <span>Instagram's API works with Creator and Business accounts (free to switch: in the Instagram app,
                            Settings → Account type and tools → Switch to professional account). No Facebook Page is needed.</span>
                    </div>
                    <p v-if="reconnectUsername && isFirstConnection">Connect <strong>@{{ reconnectUsername }}</strong> (imported from OmniGram v1). Its schedule, captions and hashtags are kept. Sign in as that account, even if it has been renamed since.</p>
                    <p v-else-if="reconnectUsername">Connect <strong>@{{ reconnectUsername }}</strong> again. Its strategy, queue and history are kept.</p>
                    <div class="choices">
                        <button type="button" class="choice" @click="chooseLogin">
                            <strong>Log in with Instagram <span class="ot-chip ok">recommended</span></strong>
                            <span>Sign in as the account in a popup and approve OmniGram. Needs your Instagram app's ID and secret once{{ app?.Configured ? ' (already saved)' : '' }}.</span>
                        </button>
                        <button type="button" class="choice" @click="step = 'token'">
                            <strong>Paste an access token</strong>
                            <span>Generate a token for the account in the Meta app dashboard and paste it here. No app secret needed.</span>
                        </button>
                    </div>
                </section>

                <!-- 2. The Instagram app (login path only) -->
                <section v-else-if="step === 'app'" class="pane">
                    <p>OmniGram signs in through <em>your</em> Meta app. Set one up once:</p>
                    <ol class="howto">
                        <li>At <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer">developers.facebook.com/apps</a>, create an app with the Instagram use case (“Manage messaging &amp; content on Instagram”).</li>
                        <li>Open <strong>API setup with Instagram business login</strong>. Under <strong>Set up Instagram business login → Business login settings</strong>, add this OAuth redirect URI:
                            <div class="copyrow">
                                <code>{{ form.redirectUrl }}</code>
                                <button type="button" class="ot-btn sm ghost" @click="copy(form.redirectUrl)">{{ copied ? 'Copied' : 'Copy' }}</button>
                            </div>
                        </li>
                        <li>Copy the <strong>Instagram app ID</strong> and <strong>Instagram app secret</strong> from the same page (not the Meta app ID at the top).</li>
                        <li>Until the app is published, each account needs a role on it: add it under <strong>App roles → Instagram testers</strong> and accept the invite from that account.</li>
                    </ol>
                    <div class="ot-formgrid wide">
                        <div class="ot-field">
                            <label :for="fid('app-id')">Instagram app ID</label>
                            <input :id="fid('app-id')" v-model="form.appId" class="ot-input mono" inputmode="numeric" autocomplete="off" spellcheck="false"
                                   :placeholder="app?.AppId ? `unchanged (${app.AppId})` : 'e.g. 1234567890123456'" />
                        </div>
                        <div class="ot-field">
                            <label :for="fid('app-secret')">Instagram app secret</label>
                            <input :id="fid('app-secret')" v-model="form.appSecret" class="ot-input mono" type="password" autocomplete="off"
                                   :placeholder="app?.Configured ? 'unchanged' : ''" />
                        </div>
                    </div>
                    <details>
                        <summary>Advanced</summary>
                        <div class="ot-field">
                            <label :for="fid('redirect')">Redirect URL</label>
                            <input :id="fid('redirect')" v-model="form.redirectUrl" class="ot-input mono" />
                            <div class="help">Only change this if the API is not served at klive.dev. It must match the app's setting exactly.</div>
                        </div>
                    </details>
                    <p v-if="error" class="neg">{{ error }}</p>
                </section>

                <!-- 3. Log in -->
                <section v-else-if="step === 'login'" class="pane">
                    <p v-if="reconnectUsername">Sign in to Instagram as <strong>@{{ reconnectUsername }}</strong> and approve OmniGram{{ isFirstConnection ? '' : ' again' }}.</p>
                    <p v-else>Sign in to Instagram as the account OmniGram should run, and approve its access. A popup opens; it closes itself when you're done.</p>
                    <p class="muted">Tip: if the popup signs in as the wrong account, log out of instagram.com in this browser first, or use the token method.</p>
                    <OmniGramConnectStart v-if="!reconnectAccountId" v-model:preset="preset" v-model:autopilot="autopilot" :presets="presets" />
                    <p v-if="app?.LastVerifyError" class="warnline">The last login failed: {{ app.LastVerifyError }}</p>
                    <p v-if="error" class="neg">{{ error }}</p>
                </section>

                <!-- 3b. Waiting -->
                <section v-else-if="step === 'waiting'" class="pane center">
                    <div class="spinner" aria-hidden="true"></div>
                    <p><strong>Waiting for you to approve on Instagram…</strong></p>
                    <p class="muted">
                        Popup closed or blocked?
                        <a :href="authUrl" target="_blank" rel="noopener noreferrer">Open the Instagram authorization page</a>.
                    </p>
                </section>

                <!-- 3c. Token -->
                <section v-else-if="step === 'token'" class="pane">
                    <ol class="howto">
                        <li>In the <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer">Meta app dashboard</a>, open <strong>API setup with Instagram business login → Generate access tokens</strong>.</li>
                        <li><strong>Add account</strong>, sign in as the Instagram account, then <strong>Generate token</strong>.</li>
                        <li>Paste the token below. It lasts 60 days; OmniGram renews it automatically while the account is in use.</li>
                    </ol>
                    <div class="ot-field">
                        <label :for="fid('token')">Access token</label>
                        <textarea :id="fid('token')" v-model="token" class="ot-input mono" rows="3" autocomplete="off" spellcheck="false" placeholder="IGAA…"></textarea>
                        <div class="help">Stored encrypted; never shown again.</div>
                    </div>
                    <OmniGramConnectStart v-if="!reconnectAccountId" v-model:preset="preset" v-model:autopilot="autopilot" :presets="presets" />
                    <p v-if="error" class="neg">{{ error }}</p>
                </section>

                <!-- 4. Done -->
                <section v-else-if="step === 'done'" class="pane center">
                    <p class="big pos">✓</p>
                    <p><strong>{{ doneMessage }}</strong></p>
                    <p class="muted">Followers, recent posts and insights load within a minute.</p>
                </section>

                <section v-else-if="step === 'failed'" class="pane">
                    <div class="ot-banner" role="alert">
                        <span class="glyph">⚠</span>
                        <div><strong>Connecting failed</strong> {{ error }}</div>
                    </div>
                    <ul class="muted hints">
                        <li>The app's OAuth redirect URI must be exactly <code>{{ app?.RedirectUrl ?? form.redirectUrl }}</code>.</li>
                        <li>The account must be a Creator or Business account.</li>
                        <li>While the Meta app is unpublished, the account must be one of its Instagram testers.</li>
                        <li>Check the Instagram app ID and secret (the Instagram ones, not the Meta app's).</li>
                    </ul>
                </section>
            </div>

            <footer>
                <button v-if="step === 'app'" class="ot-btn ghost" :disabled="busy" @click="step = 'method'">Back</button>
                <button v-if="step === 'app'" class="ot-btn primary" :disabled="busy" @click="saveApp">{{ busy ? 'Saving…' : 'Save and continue' }}</button>
                <template v-if="step === 'login'">
                    <button class="ot-btn ghost" :disabled="busy" @click="step = 'app'">Change app settings</button>
                    <button class="ot-btn primary" :disabled="busy" @click="authorize">{{ busy ? 'Starting…' : 'Log in with Instagram' }}</button>
                </template>
                <button v-if="step === 'waiting'" class="ot-btn ghost" @click="cancelWaiting">Start over</button>
                <template v-if="step === 'token'">
                    <button class="ot-btn ghost" :disabled="busy" @click="step = 'method'">Back</button>
                    <button class="ot-btn primary" :disabled="busy || token.trim().length < 20" @click="connectToken">{{ busy ? 'Checking with Instagram…' : 'Connect' }}</button>
                </template>
                <button v-if="step === 'failed'" class="ot-btn primary" @click="step = 'method'">Try again</button>
                <button v-if="step === 'done'" class="ot-btn primary" @click="finish">{{ connectedId && (connectedIsNew || isFirstConnection) ? 'Review the strategy' : 'Done' }}</button>
            </footer>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, useId, watch } from 'vue';
import { KliveAPIUrl } from '~/scripts/APIInterface';
import { igGet, igPost, q, type AppConfig, type ConnectionInfo } from '~/composables/useOmniGram';

type Step = 'method' | 'app' | 'login' | 'waiting' | 'token' | 'done' | 'failed';
interface ConnectResult { Ok: boolean; Message: string; AccountId: string | null; Username: string | null; IsNew: boolean; AttachedToImported: boolean }

const props = defineProps<{
    open: boolean;
    app: AppConfig | null;
    /** An existing account to connect: one that lost its connection, or an imported v1 account (firstConnection). */
    reconnectAccountId?: string | null;
    reconnectUsername?: string | null;
    firstConnection?: boolean;
}>();
const emit = defineEmits<{ close: []; done: [payload: { accountId: string | null; openStrategy: boolean }] }>();
const uid = useId();
const fid = (key: string) => `${uid}-${key}`;
const DEFAULT_REDIRECT = 'https://klive.dev/omnigram/oauth/callback';

const presets = [
    { value: 'weekly-reels', label: 'One meme reel a week, AI caption (Fri 18:00)' },
    { value: 'three-a-week', label: 'Three reels a week (Mon, Wed, Fri 18:00)' },
    { value: 'daily-reels', label: 'A reel every day (18:00)' },
    { value: 'manual', label: 'Manual posting only' },
];

const step = ref<Step>('method');
const busy = ref(false);
const error = ref<string | null>(null);
const copied = ref(false);
const flowId = ref<string | null>(null);
const authUrl = ref('');
const token = ref('');
const preset = ref('weekly-reels');
const autopilot = ref(false);
const connectedId = ref<string | null>(null);
const connectedIsNew = ref(false);
// Snapshot when the wizard opens: a poll can mark the account connected while the wizard is still showing.
const isFirstConnection = ref(false);
const doneMessage = ref('');
const form = reactive({ appId: '', appSecret: '', redirectUrl: DEFAULT_REDIRECT });

let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollDeadline = 0;
let popup: Window | null = null;

const heading = computed(() => (props.reconnectAccountId
    ? `${isFirstConnection.value ? 'Connect' : 'Reconnect'} @${props.reconnectUsername ?? 'account'}`
    : 'Connect an Instagram account'));

watch(() => props.open, open => {
    if (!open) { stopWaiting(); return; }
    error.value = null;
    token.value = '';
    connectedId.value = null;
    connectedIsNew.value = false;
    isFirstConnection.value = !!props.firstConnection;
    form.appId = '';
    form.appSecret = '';
    form.redirectUrl = props.app?.RedirectUrl || DEFAULT_REDIRECT;
    step.value = 'method';
}, { immediate: true });

onBeforeUnmount(stopWaiting);

async function copy(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        copied.value = true;
        setTimeout(() => { copied.value = false; }, 1500);
    } catch { /* clipboard blocked */ }
}

function chooseLogin() {
    error.value = null;
    step.value = props.app?.Configured ? 'login' : 'app';
}

async function saveApp() {
    busy.value = true;
    error.value = null;
    try {
        const result = await igPost<{ saved: boolean; message: string; App: AppConfig }>('/omnigram/settings/app', {
            appId: form.appId.trim() || null,
            appSecret: form.appSecret.trim() || null,
            redirectUrl: form.redirectUrl.trim() || null,
        });
        if (!result.ok) { error.value = result.error; return; }
        step.value = 'login';
    } finally {
        busy.value = false;
    }
}

async function authorize() {
    error.value = null;
    // Open the window synchronously inside the click so popup blockers allow it, then point it at Instagram.
    popup = window.open('about:blank', 'omnigram-auth', 'width=560,height=780');
    busy.value = true;
    try {
        const result = await igPost<{ flowId: string; authorizationUrl: string; redirectUrl: string }>('/omnigram/connect/begin', {
            reconnectAccountId: props.reconnectAccountId ?? null,
            preset: props.reconnectAccountId ? null : preset.value,
            autopilot: !props.reconnectAccountId && autopilot.value && preset.value !== 'manual',
        });
        if (!result.ok || !result.data) {
            popup?.close();
            error.value = result.error;
            return;
        }
        flowId.value = result.data.flowId;
        authUrl.value = result.data.authorizationUrl;
        if (popup && !popup.closed) popup.location.href = authUrl.value;
        startWaiting();
    } finally {
        busy.value = false;
    }
}

function startWaiting() {
    step.value = 'waiting';
    stopWaiting();
    pollDeadline = Date.now() + 20 * 60_000;
    window.addEventListener('message', onMessage);
    pollTimer = setInterval(checkStatus, 2000);
}

function stopWaiting() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    window.removeEventListener('message', onMessage);
}

function cancelWaiting() {
    stopWaiting();
    step.value = 'login';
}

function onMessage(event: MessageEvent) {
    // Only the callback page served by the API may report completion.
    if (event.origin !== new URL(KliveAPIUrl).origin) return;
    const data = event.data as { source?: string; flowId?: string } | null;
    if (data?.source === 'omnigram' && data.flowId === flowId.value) void checkStatus();
}

async function checkStatus() {
    if (!flowId.value) return;
    if (Date.now() > pollDeadline) {
        stopWaiting();
        error.value = 'Timed out waiting for the authorization.';
        step.value = 'failed';
        return;
    }
    const result = await igGet<{ State: string; Error: string | null; AccountId: string | null; Account: ConnectionInfo | null }>(`/omnigram/connect/status${q({ flowId: flowId.value })}`);
    if (!result.ok || !result.data || result.data.State === 'pending') return;
    stopWaiting();
    if (result.data.State === 'failed') {
        error.value = result.data.Error ?? 'Instagram did not authorize OmniGram.';
        step.value = 'failed';
        return;
    }
    connectedId.value = result.data.AccountId;
    connectedIsNew.value = !props.reconnectAccountId;
    const name = result.data.Account?.Username;
    doneMessage.value = props.reconnectAccountId
        ? isFirstConnection.value
            ? `@${name ?? 'The account'} is connected with its v1 settings. Review the strategy, then switch autopilot on.`
            : `@${name ?? 'The account'} is reconnected. Posting resumes automatically.`
        : `@${name ?? 'The account'} is connected${autopilot.value && preset.value !== 'manual' ? ' and on autopilot' : ''}.`;
    step.value = 'done';
}

async function connectToken() {
    busy.value = true;
    error.value = null;
    try {
        const result = await igPost<ConnectResult>('/omnigram/connect/token', {
            token: token.value.trim(),
            reconnectAccountId: props.reconnectAccountId ?? null,
            preset: props.reconnectAccountId ? null : preset.value,
            autopilot: !props.reconnectAccountId && autopilot.value && preset.value !== 'manual',
        });
        if (!result.ok || !result.data) { error.value = result.error; return; }
        token.value = '';
        connectedId.value = result.data.AccountId;
        connectedIsNew.value = result.data.IsNew;
        const name = `@${result.data.Username ?? 'The account'}`;
        doneMessage.value = result.data.AttachedToImported
            ? `${name} is connected with its v1 settings. Review the strategy, then switch autopilot on.`
            : result.data.IsNew
                ? `${name} is connected${autopilot.value && preset.value !== 'manual' ? ' and on autopilot' : ''}.`
                : `${name} is reconnected. Posting resumes automatically.`;
        step.value = 'done';
    } finally {
        busy.value = false;
    }
}

function finish() {
    emit('done', { accountId: connectedId.value, openStrategy: !!connectedId.value && (connectedIsNew.value || isFirstConnection.value) });
}

function close() {
    stopWaiting();
    if (step.value === 'done') finish();
    emit('close');
}
</script>

<style scoped>
.ig-wizard { width: min(720px, 100%); }
.pane { display: flex; flex-direction: column; gap: var(--ot-space-3); font-size: 13.5px; }
.pane p { margin: 0; }
.pane a { color: var(--ot-info); text-decoration: underline; }
.center { align-items: center; text-align: center; padding: var(--ot-space-4) 0; }
.callout { display: flex; flex-direction: column; gap: 4px; padding: var(--ot-space-3); border-radius: var(--ot-radius-sm); background: var(--ot-info-soft); border: 1px solid rgba(99, 200, 234, 0.35); font-size: 12.5px; }
.choices { display: grid; gap: var(--ot-space-3); grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr)); }
.choice { display: flex; flex-direction: column; gap: 6px; text-align: left; padding: var(--ot-space-4); border: 1px solid var(--ot-line-strong); border-radius: var(--ot-radius); background: var(--ot-surface-2); color: var(--ot-text-2); font-size: 12.5px; cursor: pointer; }
.choice strong { color: var(--ot-text); font-size: 14px; display: flex; align-items: center; gap: var(--ot-space-2); flex-wrap: wrap; }
.choice:hover { border-color: var(--ot-accent); }
.howto { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: var(--ot-text-2); }
.howto strong { color: var(--ot-text); }
.copyrow { display: flex; flex-wrap: wrap; gap: var(--ot-space-2); align-items: center; margin-top: 4px; }
code { font-family: var(--ot-mono); font-size: 12px; padding: 2px 6px; border-radius: 4px; background: rgba(0, 0, 0, 0.3); overflow-wrap: anywhere; }
.ot-formgrid.wide { grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr)); }
details summary { cursor: pointer; color: var(--ot-text-2); font-size: 12.5px; margin-bottom: var(--ot-space-2); }
.spinner { width: 32px; height: 32px; border: 3px solid var(--ot-line-strong); border-top-color: var(--ot-accent); border-radius: 50%; animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.warnline { color: var(--ot-warning); font-size: 12px; }
.hints { margin: 0; padding-left: 20px; font-size: 12.5px; display: flex; flex-direction: column; gap: 4px; }
.big { font-size: 40px; line-height: 1; }
</style>
