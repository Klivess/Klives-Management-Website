<template>
    <div v-if="open" class="ot-modal-backdrop" @click.self="close">
        <div class="ot-modal tb-wizard" role="dialog" aria-modal="true" :aria-label="heading">
            <header>
                <h3>{{ heading }}</h3>
                <button class="ot-btn ghost sm" @click="close">Close ✕</button>
            </header>

            <div class="body">
                <ol class="steps" aria-label="Progress">
                    <li v-for="(s, i) in visibleSteps" :key="s.id" :class="{ active: s.id === stepGroup, done: stepIndex(s.id) < stepIndex(stepGroup) }">
                        <span class="n">{{ i + 1 }}</span>{{ s.label }}
                    </li>
                </ol>

                <!-- 1. Tumblr app -->
                <section v-if="step === 'app'" class="pane">
                    <p>
                        OmniTumblr talks to Tumblr as an <em>app</em>. Register one once at
                        <a href="https://www.tumblr.com/oauth/apps" target="_blank" rel="noopener noreferrer">tumblr.com/oauth/apps</a>
                        (any name and website are fine), then paste its keys here.
                    </p>
                    <div class="callout">
                        <span>Set the app's <strong>Default callback URL</strong>{{ form.authMode === 'OAuth2' ? ' and add it under OAuth2 redirect URLs' : '' }} to exactly:</span>
                        <div class="copyrow">
                            <code>{{ form.callbackUrl }}</code>
                            <button type="button" class="ot-btn sm ghost" @click="copy(form.callbackUrl)">{{ copied ? 'Copied' : 'Copy' }}</button>
                        </div>
                    </div>
                    <div class="ot-formgrid wide">
                        <div class="ot-field">
                            <label for="tb-ck">OAuth consumer key</label>
                            <input id="tb-ck" v-model="form.consumerKey" class="ot-input mono" autocomplete="off" spellcheck="false"
                                   :placeholder="app?.Configured ? `unchanged (…${app.KeyHint})` : ''" />
                        </div>
                        <div class="ot-field">
                            <label for="tb-cs">Secret key</label>
                            <input id="tb-cs" v-model="form.consumerSecret" class="ot-input mono" type="password" autocomplete="off"
                                   :placeholder="app?.Configured ? 'unchanged' : ''" />
                        </div>
                    </div>
                    <details>
                        <summary>Advanced</summary>
                        <div class="ot-formgrid wide">
                            <div class="ot-field">
                                <label :for="fid('form-callback-url')">Callback URL</label>
                                <input :id="fid('form-callback-url')" v-model="form.callbackUrl" class="ot-input mono" />
                                <div class="help">Only change this if the API is not served at klive.dev.</div>
                            </div>
                            <div class="ot-field">
                                <label :for="fid('form-auth-mode')">Authorization method</label>
                                <select :id="fid('form-auth-mode')" v-model="form.authMode" class="ot-select">
                                    <option value="OAuth1">OAuth 1.0a (tokens never expire)</option>
                                    <option value="OAuth2">OAuth 2.0 (refreshed automatically)</option>
                                </select>
                            </div>
                        </div>
                    </details>
                    <p v-if="error" class="neg">{{ error }}</p>
                </section>

                <!-- 2. Authorize -->
                <section v-else-if="step === 'authorize'" class="pane">
                    <p v-if="reconnectConnectionId">Sign in to Tumblr as the same account and approve OmniTumblr again. Its blogs keep their settings and history.</p>
                    <p v-else>Sign in to Tumblr as the account that owns your blog(s) and approve OmniTumblr. You'll pick which blogs to manage next.</p>
                    <p class="muted">A Tumblr window opens; it closes itself when you're done.</p>
                    <p v-if="error" class="neg">{{ error }}</p>
                </section>

                <!-- 3. Waiting -->
                <section v-else-if="step === 'waiting'" class="pane center">
                    <div class="spinner" aria-hidden="true"></div>
                    <p><strong>Waiting for you to approve on Tumblr…</strong></p>
                    <p class="muted">
                        Window closed or blocked?
                        <a :href="authUrl" target="_blank" rel="noopener noreferrer">Open the Tumblr authorization page</a>.
                    </p>
                </section>

                <!-- 4. Pick blogs -->
                <section v-else-if="step === 'pick' && connection" class="pane">
                    <p>Connected as <strong>@{{ connection.UserName }}</strong>. Choose the blogs OmniTumblr should manage:</p>
                    <ul class="blogs">
                        <li v-for="b in connection.Blogs" :key="b.Name" :class="{ managed: b.Managed }">
                            <label class="ot-check">
                                <input v-model="selected" type="checkbox" :value="b.Name" :disabled="b.Managed" />
                                <OmniTumblrAvatar :src="b.AvatarUrl" :name="b.Name" :size="24" />
                                <span class="bname">@{{ b.Name }}</span>
                                <span class="muted">{{ b.Title }}</span>
                            </label>
                            <span class="meta">{{ fmtCount(b.Followers) }} followers{{ b.Primary ? ' · primary' : '' }}{{ b.Managed ? ' · already managed' : '' }}</span>
                        </li>
                    </ul>
                    <div class="ot-formgrid wide">
                        <div class="ot-field">
                            <label :for="fid('preset')">Start with</label>
                            <select :id="fid('preset')" v-model="preset" class="ot-select">
                                <option value="weekly-memes">Weekly meme video, AI caption (Fri 18:00)</option>
                                <option value="daily-memes">Daily meme video, AI caption (18:00)</option>
                                <option value="manual">Manual posting only</option>
                            </select>
                            <div class="help">Everything is adjustable in the blog's strategy.</div>
                        </div>
                        <div class="ot-field">
                            <label aria-hidden="true">&nbsp;</label>
                            <label class="ot-check"><input v-model="autopilot" type="checkbox" :disabled="preset === 'manual'" /> Switch autopilot on now</label>
                            <div class="help">Leave off to review the strategy first.</div>
                        </div>
                    </div>
                    <p v-if="error" class="neg">{{ error }}</p>
                </section>

                <!-- 5. Done -->
                <section v-else-if="step === 'done'" class="pane center">
                    <p class="big pos">✓</p>
                    <p><strong>{{ doneMessage }}</strong></p>
                    <ul v-if="skipped.length" class="muted">
                        <li v-for="s in skipped" :key="s">{{ s }}</li>
                    </ul>
                </section>

                <section v-else-if="step === 'failed'" class="pane">
                    <div class="ot-banner" role="alert">
                        <span class="glyph">⚠</span>
                        <div><strong>Authorization failed</strong> {{ error }}</div>
                    </div>
                    <p class="muted">Most often the app's callback URL does not exactly match <code>{{ app?.CallbackUrl ?? form.callbackUrl }}</code>,
                        or the consumer key/secret are wrong.</p>
                </section>
            </div>

            <footer>
                <button v-if="step === 'app'" class="ot-btn primary" :disabled="busy" @click="saveApp">{{ busy ? 'Checking with Tumblr…' : 'Save and continue' }}</button>
                <template v-if="step === 'authorize'">
                    <button class="ot-btn ghost" :disabled="busy" @click="step = 'app'">Change app keys</button>
                    <button class="ot-btn primary" :disabled="busy" @click="authorize">{{ busy ? 'Starting…' : 'Authorize on Tumblr' }}</button>
                </template>
                <button v-if="step === 'waiting'" class="ot-btn ghost" @click="cancelWaiting">Start over</button>
                <button v-if="step === 'pick'" class="ot-btn primary" :disabled="busy || !selected.length" @click="addBlogs">
                    {{ busy ? 'Adding…' : `Manage ${selected.length || ''} blog${selected.length === 1 ? '' : 's'}` }}
                </button>
                <button v-if="step === 'failed'" class="ot-btn primary" @click="step = 'authorize'">Try again</button>
                <button v-if="step === 'done'" class="ot-btn primary" @click="finish">{{ addedIds.length ? 'Set up the blog' : 'Done' }}</button>
            </footer>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, useId, watch } from 'vue';
import { KliveAPIUrl } from '~/scripts/APIInterface';
import { fmtCount, q, tumblrGet, tumblrPost, type AppConfig, type AuthMode, type BlogSummary, type Connection } from '~/composables/useOmniTumblr';

type Step = 'app' | 'authorize' | 'waiting' | 'pick' | 'done' | 'failed';

const props = defineProps<{ open: boolean; app: AppConfig | null; reconnectConnectionId?: string | null }>();
const emit = defineEmits<{ close: []; done: [payload: { connectionId: string | null; blogIds: string[] }] }>();
const uid = useId();
const fid = (key: string) => `${uid}-${key}`;

const step = ref<Step>('app');
const busy = ref(false);
const error = ref<string | null>(null);
const copied = ref(false);
const flowId = ref<string | null>(null);
const authUrl = ref('');
const connection = ref<Connection | null>(null);
const selected = ref<string[]>([]);
const preset = ref('weekly-memes');
const autopilot = ref(false);
const addedIds = ref<string[]>([]);
const skipped = ref<string[]>([]);
const doneMessage = ref('');
const form = reactive({ consumerKey: '', consumerSecret: '', callbackUrl: 'https://klive.dev/omnitumblr/oauth/callback', authMode: 'OAuth1' as AuthMode });

let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollDeadline = 0;
let popup: Window | null = null;

const STEPS = [
    { id: 'app', label: 'Tumblr app' },
    { id: 'authorize', label: 'Authorize' },
    { id: 'pick', label: 'Choose blogs' },
    { id: 'done', label: 'Done' },
];
const visibleSteps = computed(() => (props.reconnectConnectionId ? STEPS.filter(s => s.id !== 'pick') : STEPS));
const stepGroup = computed(() => (step.value === 'waiting' || step.value === 'failed' ? 'authorize' : step.value));
const stepIndex = (id: string) => STEPS.findIndex(s => s.id === id);
const heading = computed(() => (props.reconnectConnectionId ? 'Reconnect a Tumblr account' : 'Add Tumblr blogs'));

watch(() => props.open, open => {
    if (!open) { stopWaiting(); return; }
    error.value = null;
    selected.value = [];
    addedIds.value = [];
    skipped.value = [];
    connection.value = null;
    form.consumerKey = '';
    form.consumerSecret = '';
    form.callbackUrl = props.app?.CallbackUrl || 'https://klive.dev/omnitumblr/oauth/callback';
    form.authMode = props.app?.AuthMode ?? 'OAuth1';
    step.value = props.app?.Configured ? 'authorize' : 'app';
}, { immediate: true });

onBeforeUnmount(stopWaiting);

async function copy(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        copied.value = true;
        setTimeout(() => { copied.value = false; }, 1500);
    } catch { /* clipboard blocked */ }
}

async function saveApp() {
    busy.value = true;
    error.value = null;
    try {
        const result = await tumblrPost<{ Message: string }>('/omnitumblr/settings/app', {
            consumerKey: form.consumerKey.trim() || null,
            consumerSecret: form.consumerSecret.trim() || null,
            callbackUrl: form.callbackUrl.trim(),
            authMode: form.authMode,
        });
        if (!result.ok) { error.value = result.error; return; }
        step.value = 'authorize';
    } finally {
        busy.value = false;
    }
}

async function authorize() {
    error.value = null;
    // Open the window synchronously inside the click so popup blockers allow it, then point it at Tumblr.
    popup = window.open('about:blank', 'omnitumblr-auth', 'width=620,height=780');
    busy.value = true;
    try {
        const result = await tumblrPost<{ flowId: string; authorizationUrl: string }>('/omnitumblr/connect/begin', {
            authMode: null,
            reconnectConnectionId: props.reconnectConnectionId ?? null,
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
    pollDeadline = Date.now() + 30 * 60_000;
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
    step.value = 'authorize';
}

function onMessage(event: MessageEvent) {
    // Only the callback page served by the API may report completion.
    if (event.origin !== new URL(KliveAPIUrl).origin) return;
    const data = event.data as { source?: string; flowId?: string } | null;
    if (data?.source === 'omnitumblr' && data.flowId === flowId.value) void checkStatus();
}

async function checkStatus() {
    if (!flowId.value) return;
    if (Date.now() > pollDeadline) {
        stopWaiting();
        error.value = 'Timed out waiting for the authorization.';
        step.value = 'failed';
        return;
    }
    const result = await tumblrGet<{ State: string; Error: string | null; ConnectionId: string | null; Connection: Connection | null }>(`/omnitumblr/connect/status${q({ flowId: flowId.value })}`);
    if (!result.ok || !result.data || result.data.State === 'pending') return;
    stopWaiting();
    if (result.data.State === 'failed') {
        error.value = result.data.Error ?? 'Tumblr did not authorize the app.';
        step.value = 'failed';
        return;
    }
    connection.value = result.data.Connection;
    if (props.reconnectConnectionId) {
        doneMessage.value = `@${connection.value?.UserName ?? 'The account'} is reconnected. Posting resumes automatically.`;
        step.value = 'done';
        return;
    }
    const unmanaged = connection.value?.Blogs.filter(b => !b.Managed) ?? [];
    selected.value = unmanaged.filter(b => b.Primary).map(b => b.Name).slice(0, 1);
    if (!selected.value.length && unmanaged.length === 1) selected.value = [unmanaged[0].Name];
    step.value = 'pick';
}

async function addBlogs() {
    if (!connection.value) return;
    busy.value = true;
    error.value = null;
    try {
        const result = await tumblrPost<{ Added: BlogSummary[]; Skipped: string[] }>('/omnitumblr/blogs/add', {
            connectionId: connection.value.ConnectionId,
            blogs: selected.value,
            autopilot: autopilot.value && preset.value !== 'manual',
            preset: preset.value,
        });
        if (!result.ok || !result.data) { error.value = result.error; return; }
        addedIds.value = result.data.Added.map(b => b.BlogId);
        skipped.value = result.data.Skipped;
        const names = result.data.Added.map(b => '@' + b.Name).join(', ');
        doneMessage.value = addedIds.value.length
            ? `Now managing ${names}${autopilot.value ? ' on autopilot' : ''}.`
            : 'No blogs were added.';
        step.value = 'done';
    } finally {
        busy.value = false;
    }
}

function finish() {
    emit('done', { connectionId: connection.value?.ConnectionId ?? null, blogIds: addedIds.value });
}

function close() {
    stopWaiting();
    if (step.value === 'done') finish();
    emit('close');
}
</script>

<style scoped>
.tb-wizard { width: min(720px, 100%); }
.steps { list-style: none; display: flex; gap: var(--ot-space-4); margin: 0 0 var(--ot-space-4); padding: 0; font-size: 12.5px; color: var(--ot-muted); flex-wrap: wrap; }
.steps li { display: flex; align-items: center; gap: 6px; }
.steps .n { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; border: 1px solid var(--ot-line-strong); font-size: 11px; }
.steps li.active { color: var(--ot-text); }
.steps li.active .n { border-color: var(--ot-accent); color: var(--ot-accent); }
.steps li.done .n { background: var(--ot-accent-soft); border-color: var(--ot-accent); color: var(--ot-accent); }
.pane { display: flex; flex-direction: column; gap: var(--ot-space-3); font-size: 13.5px; }
.pane p { margin: 0; }
.pane a { color: var(--ot-info); text-decoration: underline; }
.center { align-items: center; text-align: center; padding: var(--ot-space-4) 0; }
.callout { display: flex; flex-direction: column; gap: 6px; padding: var(--ot-space-3); border-radius: var(--ot-radius-sm); background: var(--ot-info-soft); border: 1px solid rgba(99, 200, 234, 0.35); }
.copyrow { display: flex; gap: var(--ot-space-2); align-items: center; }
code { font-family: var(--ot-mono); font-size: 12.5px; padding: 2px 6px; border-radius: 4px; background: rgba(0, 0, 0, 0.3); overflow-wrap: anywhere; }
.ot-formgrid.wide { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
details summary { cursor: pointer; color: var(--ot-text-2); font-size: 12.5px; margin-bottom: var(--ot-space-2); }
.spinner { width: 32px; height: 32px; border: 3px solid var(--ot-line-strong); border-top-color: var(--ot-accent); border-radius: 50%; animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.blogs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; border: 1px solid var(--ot-line); border-radius: var(--ot-radius-sm); }
.blogs li { display: flex; justify-content: space-between; align-items: center; gap: var(--ot-space-3); padding: var(--ot-space-2) var(--ot-space-3); }
.blogs li + li { border-top: 1px solid var(--ot-line); }
.blogs li.managed { opacity: 0.6; }
.bname { color: var(--ot-text); font-weight: 600; }
.meta { font-size: 11.5px; color: var(--ot-muted); white-space: nowrap; }
.big { font-size: 40px; line-height: 1; }
</style>
