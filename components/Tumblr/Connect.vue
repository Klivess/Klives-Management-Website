<template>
  <TumblrDialog :open="open" :title="heading" icon="link" tone="accent" wide testid="tmb-connect" @close="close">
    <ol class="tmb-steps" aria-label="Progress">
      <li v-for="(s, i) in visibleSteps" :key="s.id" :data-state="s.id === group ? 'active' : order(s.id) < order(group) ? 'done' : undefined"><span>{{ i + 1 }}</span>{{ s.label }}</li>
    </ol>

    <template v-if="step === 'app'">
      <p>OmniTumblr talks to Tumblr as an app. Register one once at <a class="tmb-ext" href="https://www.tumblr.com/oauth/apps" target="_blank" rel="noopener noreferrer">tumblr.com/oauth/apps</a>, then paste its keys here.</p>
      <div class="tmb-note" data-tone="info"><TumblrIcon name="info" />
        <div style="flex: 1; min-width: 0">Set the app's <strong>Default callback URL</strong>{{ form.authMode === 'OAuth2' ? ' and its OAuth2 redirect URL' : '' }} to exactly
          <div style="display: flex; gap: 6px; align-items: center; margin-top: 4px"><span class="tmb-code">{{ form.callbackUrl }}</span><button class="tmb-btn tmb-btn--xs" @click="copy(form.callbackUrl)">{{ copied ? 'Copied' : 'Copy' }}</button></div>
        </div>
      </div>
      <div class="tmb-grid2">
        <div class="tmb-field"><label for="tmb-w-ck">OAuth consumer key</label><input id="tmb-w-ck" v-model="form.consumerKey" class="tmb-input tmb-mono" autocomplete="off" spellcheck="false" :placeholder="app?.Configured ? `unchanged (…${app.KeyHint})` : ''" /></div>
        <div class="tmb-field"><label for="tmb-w-cs">Secret key</label><input id="tmb-w-cs" v-model="form.consumerSecret" type="password" class="tmb-input tmb-mono" autocomplete="off" :placeholder="app?.Configured ? 'unchanged' : ''" /></div>
      </div>
      <details>
        <summary class="tmb-dim" style="cursor: pointer; font-size: 12.5px">Advanced</summary>
        <div class="tmb-grid2" style="margin-top: 8px">
          <div class="tmb-field"><label for="tmb-w-cb">Callback URL</label><input id="tmb-w-cb" v-model="form.callbackUrl" class="tmb-input tmb-mono" /></div>
          <div class="tmb-field"><label for="tmb-w-am">Method</label><select id="tmb-w-am" v-model="form.authMode" class="tmb-select"><option value="OAuth1">OAuth 1.0a (tokens never expire)</option><option value="OAuth2">OAuth 2.0 (refreshed automatically)</option></select></div>
        </div>
      </details>
    </template>

    <template v-else-if="step === 'authorize'">
      <p v-if="reconnectConnectionId">Sign in to Tumblr as the same account and approve OmniTumblr again. Its blogs keep their settings and history.</p>
      <p v-else>Sign in to Tumblr as the account that owns the blogs and approve OmniTumblr. You pick which blogs to manage next.</p>
      <p class="tmb-dim">A Tumblr window opens and closes itself when you are done.</p>
    </template>

    <div v-else-if="step === 'waiting'" class="tmb-empty">
      <TumblrIcon name="refresh" class="tmb-spin" />
      <strong>Waiting for you to approve on Tumblr…</strong>
      <span>Window closed or blocked? <a class="tmb-ext" :href="authUrl" target="_blank" rel="noopener noreferrer">Open the Tumblr page</a>.</span>
    </div>

    <template v-else-if="step === 'pick' && connection">
      <p>Connected as <strong>@{{ connection.UserName }}</strong>. Which blogs should OmniTumblr run?</p>
      <ul class="tmb-feed" style="border: 1px solid var(--tmb-line); border-radius: 11px; padding: 0 10px">
        <li v-for="b in connection.Blogs" :key="b.Name" style="grid-template-columns: minmax(0, 1fr) auto; align-items: center" :style="{ opacity: b.Managed ? 0.55 : 1 }">
          <label class="tmb-check"><input v-model="selected" type="checkbox" :value="b.Name" :disabled="b.Managed" /><TumblrAvatar :src="b.AvatarUrl" :name="b.Name" :size="22" /><b>@{{ b.Name }}</b><span class="tmb-dim tmb-truncate">{{ b.Title }}</span></label>
          <span class="tmb-feed__when">{{ fmtCount(b.Followers) }} followers{{ b.Primary ? ' · primary' : '' }}{{ b.Managed ? ' · already managed' : '' }}</span>
        </li>
      </ul>
      <div class="tmb-grid2">
        <div class="tmb-field"><label for="tmb-w-preset">Start with</label>
          <select id="tmb-w-preset" v-model="preset" class="tmb-select">
            <option value="weekly-memes">A meme video a week, AI caption (Fri 18:00)</option>
            <option value="daily-memes">A meme video a day, AI caption (18:00)</option>
            <option value="manual">Manual posting only</option>
          </select></div>
        <div class="tmb-field"><span class="tmb-label">&nbsp;</span><label class="tmb-check"><input v-model="autopilot" type="checkbox" :disabled="preset === 'manual'" />Switch autopilot on now</label></div>
      </div>
    </template>

    <div v-else-if="step === 'done'" class="tmb-empty"><TumblrIcon name="check-circle" style="color: var(--tmb-ok)" /><strong>{{ doneMessage }}</strong><span v-for="s in skipped" :key="s">{{ s }}</span></div>

    <template v-else-if="step === 'failed'">
      <div class="tmb-error"><TumblrIcon name="alert" /><div><strong>Authorization failed.</strong> {{ error }}</div></div>
      <p class="tmb-dim">Most often the app's callback URL does not match <span class="tmb-code">{{ app?.CallbackUrl ?? form.callbackUrl }}</span> exactly, or the keys are wrong.</p>
    </template>
    <p v-if="error && step !== 'failed'" class="tmb-error">{{ error }}</p>

    <template #actions>
      <button v-if="step === 'app'" class="tmb-btn tmb-btn--primary" :disabled="busy" @click="saveApp">{{ busy ? 'Checking with Tumblr…' : 'Save and continue' }}</button>
      <template v-if="step === 'authorize'">
        <button class="tmb-btn tmb-btn--ghost" :disabled="busy" @click="step = 'app'">Change app keys</button>
        <button class="tmb-btn tmb-btn--primary" :disabled="busy" data-testid="tmb-authorize" @click="authorize">{{ busy ? 'Starting…' : 'Authorize on Tumblr' }}</button>
      </template>
      <button v-if="step === 'waiting'" class="tmb-btn tmb-btn--ghost" @click="cancelWaiting">Start over</button>
      <button v-if="step === 'pick'" class="tmb-btn tmb-btn--primary" :disabled="busy || !selected.length" data-testid="tmb-manage-blogs" @click="addBlogs">{{ busy ? 'Adding…' : `Manage ${selected.length || ''} blog${selected.length === 1 ? '' : 's'}` }}</button>
      <button v-if="step === 'failed'" class="tmb-btn tmb-btn--primary" @click="step = 'authorize'">Try again</button>
      <button v-if="step === 'done'" class="tmb-btn tmb-btn--primary" @click="finish">{{ addedIds.length ? 'Set up the blog' : 'Done' }}</button>
    </template>
  </TumblrDialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { KliveAPIUrl } from '~/scripts/APIInterface';
import { fmtCount, q, tumblrGet, tumblrPost, type AppConfig, type AuthMode, type BlogSummary, type Connection } from '~/composables/useOmniTumblr';

type Step = 'app' | 'authorize' | 'waiting' | 'pick' | 'done' | 'failed';

const props = defineProps<{ open: boolean; app: AppConfig | null; reconnectConnectionId?: string | null }>();
const emit = defineEmits<{ close: []; done: [payload: { connectionId: string | null; blogIds: string[] }] }>();

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
let pollTimer: number | null = null;
let pollDeadline = 0;
let popup: Window | null = null;

const STEPS = [{ id: 'app', label: 'Tumblr app' }, { id: 'authorize', label: 'Authorize' }, { id: 'pick', label: 'Choose blogs' }, { id: 'done', label: 'Done' }];
const visibleSteps = computed(() => (props.reconnectConnectionId ? STEPS.filter(s => s.id !== 'pick') : STEPS));
const group = computed(() => (step.value === 'waiting' || step.value === 'failed' ? 'authorize' : step.value));
const order = (id: string) => STEPS.findIndex(s => s.id === id);
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
  try { await navigator.clipboard.writeText(text); copied.value = true; window.setTimeout(() => { copied.value = false; }, 1500); } catch { /* blocked */ }
}

async function saveApp() {
  busy.value = true;
  error.value = null;
  try {
    const result = await tumblrPost('/omnitumblr/settings/app', { consumerKey: form.consumerKey.trim() || null, consumerSecret: form.consumerSecret.trim() || null, callbackUrl: form.callbackUrl.trim(), authMode: form.authMode });
    if (!result.ok) { error.value = result.error; return; }
    step.value = 'authorize';
  } finally {
    busy.value = false;
  }
}

async function authorize() {
  error.value = null;
  // Opened inside the click so popup blockers allow it, then pointed at Tumblr.
  popup = window.open('about:blank', 'omnitumblr-auth', 'width=620,height=780');
  busy.value = true;
  try {
    const result = await tumblrPost<{ flowId: string; authorizationUrl: string }>('/omnitumblr/connect/begin', { authMode: null, reconnectConnectionId: props.reconnectConnectionId ?? null });
    if (!result.ok || !result.data) { popup?.close(); error.value = result.error; return; }
    flowId.value = result.data.flowId;
    authUrl.value = result.data.authorizationUrl;
    if (popup && !popup.closed) popup.location.href = authUrl.value;
    step.value = 'waiting';
    stopWaiting();
    pollDeadline = Date.now() + 30 * 60_000;
    window.addEventListener('message', onMessage);
    pollTimer = window.setInterval(checkStatus, 2000);
  } finally {
    busy.value = false;
  }
}

function stopWaiting() {
  if (pollTimer != null) window.clearInterval(pollTimer);
  pollTimer = null;
  window.removeEventListener('message', onMessage);
}

function cancelWaiting() {
  stopWaiting();
  step.value = 'authorize';
}

function onMessage(event: MessageEvent) {
  // Only the callback page the API serves may say it finished.
  if (event.origin !== new URL(KliveAPIUrl).origin) return;
  const data = event.data as { source?: string; flowId?: string } | null;
  if (data?.source === 'omnitumblr' && data.flowId === flowId.value) void checkStatus();
}

async function checkStatus() {
  if (!flowId.value) return;
  if (Date.now() > pollDeadline) { stopWaiting(); error.value = 'Timed out waiting for the authorization.'; step.value = 'failed'; return; }
  const result = await tumblrGet<{ State: string; Error: string | null; Connection: Connection | null }>(`/omnitumblr/connect/status${q({ flowId: flowId.value })}`);
  if (!result.ok || !result.data || result.data.State === 'pending') return;
  stopWaiting();
  if (result.data.State === 'failed') { error.value = result.data.Error ?? 'Tumblr did not authorize the app.'; step.value = 'failed'; return; }
  connection.value = result.data.Connection;
  if (props.reconnectConnectionId) {
    doneMessage.value = `@${connection.value?.UserName ?? 'The account'} is reconnected. Posting resumes by itself.`;
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
      connectionId: connection.value.ConnectionId, blogs: selected.value, autopilot: autopilot.value && preset.value !== 'manual', preset: preset.value,
    });
    if (!result.ok || !result.data) { error.value = result.error; return; }
    addedIds.value = result.data.Added.map(b => b.BlogId);
    skipped.value = result.data.Skipped;
    doneMessage.value = addedIds.value.length ? `Now managing ${result.data.Added.map(b => '@' + b.Name).join(', ')}${autopilot.value ? ' on autopilot' : ''}.` : 'No blogs were added.';
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
